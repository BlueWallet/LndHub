import { User, Lock, Paym, Invo } from '../class/';
import Frisbee from 'frisbee';
const config = require('../config');
let express = require('express');
let router = express.Router();
let logger = require('../utils/logger');
const MIN_BTC_BLOCK = 670000;
if (process.env.NODE_ENV !== 'prod') {
  console.log('using config', JSON.stringify(config));
}

var Redis = require('ioredis');
var redis = new Redis(config.redis);
redis.monitor(function (err, monitor) {
  monitor.on('monitor', function (time, args, source, database) {
    // console.log('REDIS', JSON.stringify(args));
  });
});

/****** START SET FEES FROM CONFIG AT STARTUP ******/
/** GLOBALS */
global.forwardFee = config.forwardReserveFee || 0.01;
global.internalFee = config.intraHubFee || 0.003;
/****** END SET FEES FROM CONFIG AT STARTUP ******/

let bitcoinclient = require('../bitcoin');
let lightning = require('../lightning');
let identity_pubkey = false;
// ###################### SMOKE TESTS ########################

if (config.bitcoind) {
  bitcoinclient.request('getblockchaininfo', false, function (err, info) {
    if (info && info.result && info.result.blocks) {
      if (info.result.chain === 'mainnet' && info.result.blocks < MIN_BTC_BLOCK && !config.forceStart) {
        console.error('bitcoind is not caught up');
        process.exit(1);
      }
      console.log('bitcoind getblockchaininfo:', info);
    } else {
      console.error('bitcoind failure:', err, info);
      process.exit(2);
    }
  });
}

lightning.getInfo({}, function (err, info) {
  if (err) {
    console.error('lnd failure');
    console.dir(err);
    process.exit(3);
  }
  if (info) {
    console.info('lnd getinfo:', info);
    if (!info.synced_to_chain && !config.forceStart) {
      console.error('lnd not synced');
      // process.exit(4);
    }
    identity_pubkey = info.identity_pubkey;
  }
});

redis.info(function (err, info) {
  if (err || !info) {
    console.error('redis failure');
    process.exit(5);
  }
});

const subscribeInvoicesCallCallback = async function (response) {
  if (response.state === 'SETTLED') {
    const LightningInvoiceSettledNotification = {
      memo: response.memo,
      preimage: response.r_preimage.toString('hex'),
      hash: response.r_hash.toString('hex'),
      amt_paid_sat: response.amt_paid_msat ? Math.floor(response.amt_paid_msat / 1000) : response.amt_paid_sat,
    };
    // obtaining a lock, to make sure we push to groundcontrol only once
    // since this web server can have several instances running, and each will get the same callback from LND
    // and dont release the lock - it will autoexpire in a while
    let lock = new Lock(redis, 'groundcontrol_hash_' + LightningInvoiceSettledNotification.hash);
    if (!(await lock.obtainLock())) {
      return;
    }
    let invoice = new Invo(redis, bitcoinclient, lightning);
    await invoice._setIsPaymentHashPaidInDatabase(
      LightningInvoiceSettledNotification.hash,
      LightningInvoiceSettledNotification.amt_paid_sat || 1,
    );
    const user = new User(redis, bitcoinclient, lightning);
    user._userid = await user.getUseridByPaymentHash(LightningInvoiceSettledNotification.hash);
    await user.clearBalanceCache();
    console.log('payment', LightningInvoiceSettledNotification.hash, 'was paid, posting to GroundControl...');
    const baseURI = process.env.GROUNDCONTROL;
    if (!baseURI) return;
    const _api = new Frisbee({ baseURI: baseURI });
    const apiResponse = await _api.post(
      '/lightningInvoiceGotSettled',
      Object.assign(
        {},
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: LightningInvoiceSettledNotification,
        },
      ),
    );
    console.log('GroundControl:', apiResponse.originalResponse.status);
  }
};
let subscribeInvoicesCall = lightning.subscribeInvoices({});
subscribeInvoicesCall.on('data', subscribeInvoicesCallCallback);
subscribeInvoicesCall.on('status', function (status) {
  // The current status of the stream.
});
subscribeInvoicesCall.on('end', function () {
  // The server has closed the stream.
});

let lightningDescribeGraph = {};
function updateDescribeGraph() {
  console.log('updateDescribeGraph()');
  lightning.describeGraph({ include_unannounced: true }, function (err, response) {
    if (!err) lightningDescribeGraph = response;
    console.log('updated graph');
  });
}
if (config.enableUpdateDescribeGraph) {
  updateDescribeGraph();
  setInterval(updateDescribeGraph, 120000);
}

// ################# MIDDLEWARE ########################
const rateLimit = require('express-rate-limit');
const postLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: config.postRateLimit || 100,
});

function setUser(req, res, next) {
  req.locals = req.locals || {}
  logger.log(req.originalUrl, [req.id]);
  req.locals.user = new User(redis, bitcoinclient, lightning);

  next()
}
async function authenticator(req, res, next) {
  if (!(await req.locals.user.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }
  next()
}

function validateCreate(req, res, next) {
  // Valid if the partnerid isn't there or is a string (same with accounttype)
  if (!(!req.body.partnerid || (typeof req.body.partnerid === 'string' || req.body.partnerid instanceof String))
     && (!req.body.accounttype || (typeof req.body.accounttype === 'string' || req.body.accounttype instanceof String))) {
    return errorBadArguments(res);
  }

  return next()
}

function validateAuth(req, res, next) {
  if (!((req.body.login && req.body.password) || req.body.refresh_token)) {
    return errorBadArguments(res);
  }

  next()
}

async function authenticateByRefreshToken(req, res, next) {
  if (!req.body.refresh_token) {
    return next()
  }

  if (!(await req.locals.user.loadByRefreshToken(req.body.refresh_token))) {
    return errorBadAuth(res);
  }

  return res.send({ refresh_token: req.locals.user.getRefreshToken(), access_token: req.locals.user.getAccessToken() });
}

async function authenticateByPassword(req, res) {
  let result = await req.locals.user.loadByLoginAndPassword(req.body.login, req.body.password);
  if (!result) {
    return errorBadAuth(res);
  }
  return res.send({
    refresh_token: req.locals.user.getRefreshToken(),
    access_token: req.locals.user.getAccessToken()
  });
}

function validateSunset(req, res, next) {
  if (!config.sunset) {
    return next()
  }

  errorSunset(res);
}
function validateAddInvoice(req, res, next) {
  if (!req.body.amt || /*stupid NaN*/ !(req.body.amt > 0)) return errorBadArguments(res);

  next()
}

function validatePayInvoice(req, res, next) {
  if (!req.body.invoice) return errorBadArguments(res);
  req.locals.freeAmount = false;
  if (req.body.amount) {
    req.locals.freeAmount = parseInt(req.body.amount);
    if (req.locals.freeAmount <= 0) return errorBadArguments(res);
  }

  next()
}

async function validateDecodeInvocie(req, res, next) {
  if (!req.query.invoice) {
    return errorGeneralServerError(res);
  }

  next()
}

async function saveUser(req, res, next) {
  await req.locals.user.create();
  await req.locals.user.saveMetadata({
    partnerid: req.body.partnerid,
    accounttype: req.body.accounttype,
    created_at: new Date().toISOString()
  });

  next()
}

function sendCredentials(req, res) {
  res.send({
    login: req.locals.user.getLogin(),
    password: req.locals.user.getPassword()
  });
}


async function sendInvoice(req, res) {
  logger.log('/addinvoice', [req.id, 'userid: ' + req.locals.user.getUserId(), 'amount: ' + req.body.amount]);

  const invoice = new Invo(redis, bitcoinclient, lightning);
  const r_preimage = invoice.makePreimageHex();
  lightning.addInvoice(
    { memo: req.body.memo, value: req.body.amt, expiry: 3600 * 24, r_preimage: Buffer.from(r_preimage, 'hex').toString('base64') },
    async function (err, info) {
      if (err) return errorLnd(res);

      info.pay_req = info.payment_request; // client backwards compatibility
      await req.locals.user.saveUserInvoice(info);
      await invoice.savePreimage(r_preimage);

      res.send(info);
    },
  );
}

// FIXME
async function watchAddressAndSend(req, res) {
  let address = await req.locals.user.getAddress();
  req.locals.user.watchAddress(address);

  res.send([{ address }]);
}

async function getAddress(req, res, next) {
    if (!(await req.locals.user.getAddress())) {
      await req.locals.user.generateAddress(); // onchain address needed further
    }

  next()
}

async function sendPaymentCheck(req, res) {
  let paid = true;
  if (!(await req.locals.user.getPaymentHashPaid(req.params.payment_hash))) {
    // Not found on cache
    paid = await req.locals.user.syncInvoicePaid(req.params.payment_hash);
  }
  res.send({ paid: paid });
}

function sendLightningInfo(req, res) {
  lightning.getInfo({}, function (err, info) {
    if (err) return errorLnd(res);
    res.send(info);
  });
}

async function sendBalance(req, res) {
  logger.log('/balance', [req.id, 'userid: ' + req.locals.user.getUserId()]);
  try {
    let balance = await req.locals.user.getBalance();
    res.send({ BTC: { AvailableBalance: ((balance > 0) ? balance : 0) } });
  } catch (Error) {
    logger.log('', [req.id, 'error getting balance:', Error, 'userid:', req.locals.user.getUserId()]);
    return errorGeneralServerError(res);
  }
}

async function refreshTxList(req, res, next) {
  await req.locals.user.accountForPosibleTxids();

  next()
}

async function sendPendingTxs(req, res) {
  logger.log('/getpending', [req.id, 'userid: ' + req.locals.user.getUserId()]);

  let txs = await req.locals.user.getPendingTxs();
  res.send(txs);
}

function sendDecodedInvoice(req, res) {
  lightning.decodePayReq({ pay_req: req.query.invoice }, function (err, info) {
    if (err) return errorNotAValidInvoice(res);
    res.send(info);
  });
}

function sendRoutes(req, res) {
  logger.log('/queryroutes', [req.id]);

  let request = {
    pub_key: req.params.dest,
    use_mission_control: true,
    amt: req.params.amt,
    source_pub_key: req.params.source,
  };
  lightning.queryRsendRoutes(request, function (err, response) {
    console.log(JSON.stringify(response, null, 2));
    res.send(response);
  });
}

function sendChainInfo(req, res) {
  logger.log('/getchaninfo', [req.id]);

  if (lightningDescribeGraph && lightningDescribeGraph.edges) {
    for (const edge of lightningDescribeGraph.edges) {
      if (edge.channel_id == req.params.chanid) {
        return res.send(JSON.stringify(edge, null, 2));
      }
    }
  }
  res.send('');
}

async function getUserInvoicesAndSend(req, res) {
  logger.log('/getuserinvoices', [req.id, 'userid: ' + req.locals.user.getUserId()]);

  try {
    let invoices = await req.locals.user.getUserInvoices(req.query.limit);
    res.send(invoices);
  } catch (Err) {
    logger.log('', [req.id, 'error getting user invoices:', Err.message, 'userid:', req.locals.user.getUserId()]);
    res.send([]);
  }
}

async function getUserTxsAndSend(req, res) {
  try {
    let txs = await req.locals.user.getTxs();
    let lockedPayments = await req.locals.user.getLockedPayments();
    for (let locked of lockedPayments) {
      txs.push({
        type: 'paid_invoice',
        fee: Math.floor(locked.amount * forwardFee) /* feelimit */,
        value: locked.amount + Math.floor(locked.amount * forwardFee) /* feelimit */,
        timestamp: locked.timestamp,
        memo: 'Payment in transition',
      });
    }
    res.send(txs);
  } catch (Err) {
    logger.log('', [req.id, 'error gettxs:', Err.message, 'userid:', req.locals.user.getUserId()]);
    res.send([]);
  }
}

async function payInvoiceAndSend(req, res) {
  logger.log('/payinvoice', [req.id, 'userid: ' + req.locals.user.getUserId(), 'invoice: ' + req.body.invoice]);

  // obtaining a lock
  let lock = new Lock(redis, 'invoice_paying_for_' + req.locals.user.getUserId());
  if (!(await lock.obtainLock())) {
    return errorGeneralServerError(res);
  }

  let userBalance;
  try {
    userBalance = await req.locals.user.getCalculatedBalance();
  } catch (Error) {
    logger.log('', [req.id, 'error running getCalculatedBalance():', Error.message]);
    lock.releaseLock();
    return errorTryAgainLater(res);
  }

  lightning.decodePayReq({ pay_req: req.body.invoice }, async function (err, info) {
    if (err) {
      await lock.releaseLock();
      return errorNotAValidInvoice(res);
    }

    if (+info.num_satoshis === 0) {
      // 'tip' invoices
      info.num_satoshis = req.locals.freeAmount;
    }

    logger.log('/payinvoice', [req.id, 'userBalance: ' + userBalance, 'num_satoshis: ' + info.num_satoshis]);

    if (userBalance >= +info.num_satoshis + Math.floor(info.num_satoshis * forwardFee)) {
      // got enough balance, including 1% of payment amount - reserve for fees

      if (identity_pubkey === info.destination) {
        // this is internal invoice
        // now, receiver add balance
        let userid_payee = await req.locals.user.getUseridByPaymentHash(info.payment_hash);
        if (!userid_payee) {
          await lock.releaseLock();
          return errorGeneralServerError(res);
        }

        if (await req.locals.user.getPaymentHashPaid(info.payment_hash)) {
          // this internal invoice was paid, no sense paying it again
          await lock.releaseLock();
          return errorLnd(res);
        }

        let UserPayee = new User(redis, bitcoinclient, lightning);
        UserPayee._userid = userid_payee; // hacky, fixme
        await UserPayee.clearBalanceCache();

        // sender spent his balance:
        await req.locals.user.clearBalanceCache();
        await req.locals.user.savePaidLndInvoice({
          timestamp: parseInt(+new Date() / 1000),
          type: 'paid_invoice',
          value: +info.num_satoshis + Math.floor(info.num_satoshis * internalFee),
          fee: Math.floor(info.num_satoshis * internalFee),
          memo: decodeURIComponent(info.description),
          pay_req: req.body.invoice,
        });

        const invoice = new Invo(redis, bitcoinclient, lightning);
        invoice.setInvoice(req.body.invoice);
        await invoice.markAsPaidInDatabase();

        // now, faking LND callback about invoice paid:
        const preimage = await invoice.getPreimage();
        if (preimage) {
          subscribeInvoicesCallCallback({
            state: 'SETTLED',
            memo: info.description,
            r_preimage: Buffer.from(preimage, 'hex'),
            r_hash: Buffer.from(info.payment_hash, 'hex'),
            amt_paid_sat: +info.num_satoshis,
          });
        }
        await lock.releaseLock();
        return res.send(info);
      }

      // else - regular lightning network payment:

      var call = lightning.sendPayment();
      call.on('data', async function (payment) {
        // payment callback
        await req.locals.user.unlockFunds(req.body.invoice);
        if (payment && payment.payment_route && payment.payment_route.total_amt_msat) {
          let PaymentShallow = new Paym(false, false, false);
          payment = PaymentShallow.processSendPaymentResponse(payment);
          payment.pay_req = req.body.invoice;
          payment.decoded = info;
          await req.locals.user.savePaidLndInvoice(payment);
          await req.locals.user.clearBalanceCache();
          lock.releaseLock();
          res.send(payment);
        } else {
          // payment failed
          lock.releaseLock();
          return errorPaymentFailed(res);
        }
      });
      if (!info.num_satoshis) {
        // tip invoice, but someone forgot to specify amount
        await lock.releaseLock();
        return errorBadArguments(res);
      }
      let inv = {
        payment_request: req.body.invoice,
        amt: info.num_satoshis, // amt is used only for 'tip' invoices
        fee_limit: { fixed: Math.floor(info.num_satoshis * forwardFee) + 1 },
      };
      try {
        await req.locals.user.lockFunds(req.body.invoice, info);
        call.write(inv);
      } catch (Err) {
        await lock.releaseLock();
        return errorPaymentFailed(res);
      }
    } else {
      await lock.releaseLock();
      return errorNotEnougBalance(res);
    }
  });
}


// ######################## ROUTES ########################
router.use(postLimiter)
router.use(setUser)

router.post('/create', validateCreate, validateSunset, saveUser, sendCredentials);

router.post('/auth', validateAuth, authenticateByRefreshToken, authenticateByPassword);

router.all(/^(?!(\/create|\/auth)).+$/, authenticator)

router.post('/addinvoice', validateAddInvoice, validateSunset, sendInvoice);

router.post('/payinvoice', validatePayInvoice, payInvoiceAndSend);

router.get('/getbtc', validateSunset, getAddress, watchAddressAndSend);

router.get('/checkpayment/:payment_hash', sendPaymentCheck);

router.get('/balance', getAddress, refreshTxList, sendBalance);

router.get('/getinfo', sendLightningInfo);

router.get('/gettxs', getAddress, refreshTxList, getUserTxsAndSend);

router.get('/getuserinvoices', getUserInvoicesAndSend)

router.get('/getpending', getAddress, refreshTxList, sendPendingTxs);

router.get('/decodeinvoice', validateDecodeInvocie, sendDecodedInvoice);

router.get('/checkrouteinvoice', validateDecodeInvocie, sendDecodedInvoice);

router.get('/queryroutes/:source/:dest/:amt', sendRoutes);

router.get('/getchaninfo/:chanid', sendChainInfo);

module.exports = router;

// ################# HELPERS ###########################

function errorBadAuth(res) {
  return res.send({
    error: true,
    code: 1,
    message: 'bad auth',
  });
}

function errorNotEnougBalance(res) {
  return res.send({
    error: true,
    code: 2,
    message: 'not enough balance. Make sure you have at least 1% reserved for potential fees',
  });
}

function errorNotAValidInvoice(res) {
  return res.send({
    error: true,
    code: 4,
    message: 'not a valid invoice',
  });
}

function errorLnd(res) {
  return res.send({
    error: true,
    code: 7,
    message: 'LND failue',
  });
}

function errorGeneralServerError(res) {
  return res.send({
    error: true,
    code: 6,
    message: 'Something went wrong. Please try again later',
  });
}

function errorBadArguments(res) {
  return res.send({
    error: true,
    code: 8,
    message: 'Bad arguments',
  });
}

function errorTryAgainLater(res) {
  return res.send({
    error: true,
    code: 9,
    message: 'Your previous payment is in transit. Try again in 5 minutes',
  });
}

function errorPaymentFailed(res) {
  return res.send({
    error: true,
    code: 10,
    message: 'Payment failed. Does the receiver have enough inbound capacity?',
  });
}

function errorSunset(res) {
  return res.send({
    error: true,
    code: 11,
    message: 'This LNDHub instance is not accepting any more users',
  });
}

function errorSunsetAddInvoice(res) {
  return res.send({
    error: true,
    code: 11,
    message: 'This LNDHub instance is scheduled to shut down. Withdraw any remaining funds',
  });
}

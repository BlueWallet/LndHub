import { User, Lock } from '../class/';
const config = require('../config');
let express = require('express');
let router = express.Router();
let logger = require('../utils/logger');
console.log('using config', JSON.stringify(config));

var Redis = require('ioredis');
var redis = new Redis(config.redis);
redis.monitor(function(err, monitor) {
  monitor.on('monitor', function(time, args, source, database) {
    // console.log('REDIS', JSON.stringify(args));
  });
});

let bitcoinclient = require('../bitcoin');
let lightning = require('../lightning');
let identity_pubkey = false;
// ###################### SMOKE TESTS ########################

bitcoinclient.request('getblockchaininfo', false, function(err, info) {
  if (info && info.result && info.result.blocks) {
    if (info.result.blocks < 550000) {
      console.error('bitcoind is not caught up');
      process.exit(1);
    }
  } else {
    console.error('bitcoind failure');
    process.exit(2);
  }
});

lightning.getInfo({}, function(err, info) {
  if (err) {
    console.error('lnd failure');
    process.exit(3);
  }
  if (info) {
    if (!info.synced_to_chain) {
      console.error('lnd not synced');
      process.exit(4);
    }
    identity_pubkey = info.identity_pubkey;
  }
});

redis.info(function(err, info) {
  if (err || !info) {
    console.error('redis failure');
    process.exit(5);
  }
});

// ######################## ROUTES ########################

router.post('/create', async function(req, res) {
  logger.log('/create', [req.id]);
  if (!(req.body.partnerid && req.body.partnerid === 'bluewallet' && req.body.accounttype)) return errorBadArguments(res);

  let u = new User(redis, bitcoinclient, lightning);
  await u.create();
  await u.saveMetadata({ partnerid: req.body.partnerid, accounttype: req.body.accounttype, created_at: new Date().toISOString() });
  res.send({ login: u.getLogin(), password: u.getPassword() });
});

router.post('/auth', async function(req, res) {
  logger.log('/auth', [req.id]);
  if (!((req.body.login && req.body.password) || req.body.refresh_token)) return errorBadArguments(res);

  let u = new User(redis, bitcoinclient, lightning);

  if (req.body.refresh_token) {
    // need to refresh token
    if (await u.loadByRefreshToken(req.body.refresh_token)) {
      res.send({ refresh_token: u.getRefreshToken(), access_token: u.getAccessToken() });
    } else {
      return errorBadAuth(res);
    }
  } else {
    // need to authorize user
    let result = await u.loadByLoginAndPassword(req.body.login, req.body.password);
    if (result) res.send({ refresh_token: u.getRefreshToken(), access_token: u.getAccessToken() });
    else errorBadAuth(res);
  }
});

router.post('/addinvoice', async function(req, res) {
  logger.log('/addinvoice', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  if (!req.body.amt) return errorBadArguments(res);

  lightning.addInvoice({ memo: req.body.memo, value: req.body.amt }, async function(err, info) {
    if (err) return errorLnd(res);

    info.pay_req = info.payment_request; // client backwards compatibility
    await u.saveUserInvoice(info);

    res.send(info);
  });
});

router.post('/payinvoice', async function(req, res) {
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  logger.log('/payinvoice', [req.id, 'userid: ' + u.getUserId(), 'invoice: ' + req.body.invoice]);

  if (!req.body.invoice) return errorBadArguments(res);
  let freeAmount = false;
  if (req.body.amount) {
    freeAmount = parseInt(req.body.amount);
    if (freeAmount <= 0) return errorBadArguments(res);
  }

  // obtaining a lock
  let lock = new Lock(redis, 'invoice_paying_for_' + u.getUserId());
  if (!(await lock.obtainLock())) {
    return errorTryAgainLater(res);
  }

  let userBalance = await u.getCalculatedBalance();

  lightning.decodePayReq({ pay_req: req.body.invoice }, async function(err, info) {
    if (err) {
      await lock.releaseLock();
      return errorNotAValidInvoice(res);
    }

    if (+info.num_satoshis === 0) {
      // 'tip' invoices
      info.num_satoshis = freeAmount;
    }

    logger.log('/payinvoice', [req.id, 'userBalance: ' + userBalance, 'num_satoshis: ' + info.num_satoshis]);

    if (userBalance >= info.num_satoshis) {
      // got enough balance

      if (identity_pubkey === info.destination) {
        // this is internal invoice
        // now, receiver add balance
        let userid_payee = await u.getUseridByPaymentHash(info.payment_hash);
        if (!userid_payee) {
          await lock.releaseLock();
          return errorGeneralServerError(res);
        }

        if (await u.getPaymentHashPaid(info.payment_hash)) {
          // this internal invoice was paid, no sense paying it again
          await lock.releaseLock();
          return errorLnd(res);
        }

        let UserPayee = new User(redis, bitcoinclient, lightning);
        UserPayee._userid = userid_payee; // hacky, fixme
        let payee_balance = await UserPayee.getBalance();
        payee_balance += info.num_satoshis * 1;
        await UserPayee.saveBalance(payee_balance);

        // sender spent his balance:
        userBalance -= info.num_satoshis * 1;
        await u.saveBalance(userBalance);
        await u.savePaidLndInvoice({
          timestamp: parseInt(+new Date() / 1000),
          type: 'paid_invoice',
          value: info.num_satoshis * 1,
          fee: 0, // internal invoices are free
          memo: decodeURIComponent(info.description),
        });

        await UserPayee.setPaymentHashPaid(info.payment_hash);

        await lock.releaseLock();
        return res.send(info);
      }

      // else - regular lightning network payment:

      var call = lightning.sendPayment();
      call.on('data', async function(payment) {
        // payment callback
        if (payment && payment.payment_route && payment.payment_route.total_amt_msat) {
          userBalance -= +payment.payment_route.total_fees + +payment.payment_route.total_amt;
          u.saveBalance(userBalance);
          payment.pay_req = req.body.invoice;
          payment.decoded = info;
          await u.savePaidLndInvoice(payment);
          lock.releaseLock();
          res.send(payment);
        } else {
          // payment failed
          lock.releaseLock();
          return errorLnd(res);
        }
      });
      if (!info.num_satoshis && !info.num_satoshis) {
        // tip invoice, but someone forgot to specify amount
        await lock.releaseLock();
        return errorBadArguments(res);
      }
      let inv = { payment_request: req.body.invoice, amt: info.num_satoshis }; // amt is used only for 'tip' invoices
      try {
        call.write(inv);
      } catch (Err) {
        await lock.releaseLock();
        return errorLnd(res);
      }
    } else {
      await lock.releaseLock();
      return errorNotEnougBalance(res);
    }
  });
});

router.get('/getbtc', async function(req, res) {
  logger.log('/getbtc', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  await u.loadByAuthorization(req.headers.authorization);

  if (!u.getUserId()) {
    return errorBadAuth(res);
  }

  let address = await u.getAddress();
  if (!address) {
    await u.generateAddress();
    address = await u.getAddress();
  }

  res.send([{ address }]);
});

router.get('/balance', async function(req, res) {
  logger.log('/balance', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  if (!(await u.getAddress())) await u.generateAddress(); // onchain address needed further
  await u.accountForPosibleTxids();
  let balance = await u.getBalance();
  res.send({ BTC: { AvailableBalance: balance } });
});

router.get('/getinfo', async function(req, res) {
  logger.log('/getinfo', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  lightning.getInfo({}, function(err, info) {
    if (err) return errorLnd(res);
    res.send(info);
  });
});

router.get('/gettxs', async function(req, res) {
  logger.log('/gettxs', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  if (!(await u.getAddress())) await u.generateAddress(); // onchain addr needed further
  try {
    await u.accountForPosibleTxids();
    let txs = await u.getTxs();
    res.send(txs);
  } catch (Err) {
    logger.log('', [req.id, 'error:', Err]);
    res.send([]);
  }
});

router.get('/getuserinvoices', async function(req, res) {
  logger.log('/getuserinvoices', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  try {
    let invoices = await u.getUserInvoices();
    if (req.query.limit && !isNaN(parseInt(req.query.limit))) {
      res.send(invoices.slice(parseInt(req.query.limit) * -1));
    } else {
      res.send(invoices);
    }
  } catch (Err) {
    logger.log('', [req.id, 'error:', Err]);
    res.send([]);
  }
});

router.get('/getpending', async function(req, res) {
  logger.log('/getpending', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  if (!(await u.getAddress())) await u.generateAddress(); // onchain address needed further
  await u.accountForPosibleTxids();
  let txs = await u.getPendingTxs();
  res.send(txs);
});

router.get('/decodeinvoice', async function(req, res) {
  logger.log('/decodeinvoice', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  if (!req.query.invoice) return errorGeneralServerError(res);

  lightning.decodePayReq({ pay_req: req.query.invoice }, function(err, info) {
    if (err) return errorNotAValidInvoice(res);
    res.send(info);
  });
});

router.get('/checkrouteinvoice', async function(req, res) {
  logger.log('/checkrouteinvoice', [req.id]);
  let u = new User(redis, bitcoinclient, lightning);
  if (!(await u.loadByAuthorization(req.headers.authorization))) {
    return errorBadAuth(res);
  }

  if (!req.query.invoice) return errorGeneralServerError(res);

  // at the momment does nothing.
  // TODO: decode and query actual route to destination
  lightning.decodePayReq({ pay_req: req.query.invoice }, function(err, info) {
    if (err) return errorNotAValidInvoice(res);
    res.send(info);
  });
});

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
    message: 'not enough balance',
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
    message: 'Server fault',
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
    message: 'Try again later',
  });
}

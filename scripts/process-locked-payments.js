/**
 * This script gets all locked payments from our database and cross-checks them with actual
 * sentout payments from LND. If locked payment is in there we moe locked payment to array of real payments for the user
 * (it is effectively spent coins by user), if not - we attempt to pay it again (if it is not too old).
 */
import { User, Paym } from '../class/';
const config = require('../config');

/****** START SET FEES FROM CONFIG AT STARTUP ******/
/** GLOBALS */
global.forwardFee = config.forwardReserveFee || 0.01;
global.internalFee = config.intraHubFee || 0.003;
/****** END SET FEES FROM CONFIG AT STARTUP ******/

var Redis = require('ioredis');
var redis = new Redis(config.redis);

let bitcoinclient = require('../bitcoin');
let lightning = require('../lightning');

(async () => {
  let keys = await redis.keys('locked_payments_for_*');
  keys = User._shuffle(keys);

  console.log('fetching listPayments...');
  let tempPaym = new Paym(redis, bitcoinclient, lightning);
  let listPayments = await tempPaym.listPayments();
  // DEBUG let listPayments = JSON.parse(fs.readFileSync('listpayments.txt').toString('ascii'));
  console.log('done', 'got', listPayments['payments'].length, 'payments');

  for (let key of keys) {
    const userid = key.replace('locked_payments_for_', '');
    console.log('===================================================================================');
    console.log('userid=', userid);
    let user = new User(redis, bitcoinclient, lightning);
    user._userid = userid;
    let lockedPayments = await user.getLockedPayments();
    // DEBUG let lockedPayments = [{ pay_req : 'lnbc108130n1pshdaeupp58kw9djt9vcdx26wkdxl07tgncdmxz2w7s9hzul45tf8gfplme94sdqqcqzzgxqrrssrzjqw8c7yfutqqy3kz8662fxutjvef7q2ujsxtt45csu0k688lkzu3ld93gutl3k6wauyqqqqryqqqqthqqpysp5jcmk82hypuud0lhpf66dg3w5ta6aumc4w9g9sxljazglq9wkwstq9qypqsqnw8hwwauvzrala3g4yrkgazk2l2fh582j9ytz7le46gmsgglvmrknx842ej9z4c63en5866l8tpevm8cwul8g94kf2nepppn256unucp43jnsw',   amount: 10813, timestamp: 1635186606 }];

    for (let lockedPayment of lockedPayments) {
      let daysPassed = (+new Date() / 1000 - lockedPayment.timestamp) / 3600 / 24;
      console.log('processing lockedPayment=', lockedPayment, daysPassed, 'days passed');

      let payment = new Paym(redis, bitcoinclient, lightning);
      payment.setInvoice(lockedPayment.pay_req);

      // first things first:
      // trying to lookup this stuck payment in an array of delivered payments
      let isPaid = false;
      for (let sentPayment of listPayments['payments']) {
        if ((await payment.getPaymentHash()) == sentPayment.payment_hash) {
          console.log('found this payment in listPayments array, so it is paid successfully');
          let sendResult = payment.processSendPaymentResponse({ payment_error: 'already paid' } /* hacky */); // adds fees
          console.log('saving paid invoice:', sendResult);
          await user.savePaidLndInvoice(sendResult);
          await user.unlockFunds(lockedPayment.pay_req);
          isPaid = true;
          console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', await payment.getPaymentHash(), sentPayment.payment_hash);
          break;
        }
      }
      // could not find...

      if (daysPassed > 1 / 24 && daysPassed <= 1) {
        let sendResult;
        console.log('attempting to pay to route');
        try {
          sendResult = await payment.attemptPayToRoute();
        } catch (_) {
          console.log(_);
          console.log('evict lock');
          await user.unlockFunds(lockedPayment.pay_req);
          continue;
        }
        console.log('sendResult=', sendResult);
        console.log('payment.getIsPaid() = ', payment.getIsPaid());
        if (payment.getIsPaid() === true) {
          console.log('paid successfully');
          sendResult = payment.processSendPaymentResponse(sendResult); // adds fees
          console.log('saving paid invoice:', sendResult);
          await user.savePaidLndInvoice(sendResult);
          await user.unlockFunds(lockedPayment.pay_req);
        } else if (payment.getIsPaid() === false) {
          console.log('not paid, just evict the lock');
          await user.unlockFunds(lockedPayment.pay_req);
        } else {
          console.log('payment is in unknown state');
        }
        console.log('sleeping 5 sec...');
        console.log('-----------------------------------------------------------------------------------');
        await User._sleep(0);
      } else if (daysPassed > 1) {
        // could not find in listpayments array; too late to retry
        if (!isPaid) {
          console.log('very old payment, evict the lock');
          await user.unlockFunds(lockedPayment.pay_req);
        }
      }
    }
  }
  console.log('done');
  process.exit();
})();

import { User, Lock, Paym } from '../class/';
const config = require('../config');

var Redis = require('ioredis');
var redis = new Redis(config.redis);

let bitcoinclient = require('../bitcoin');
let lightning = require('../lightning');

(async () => {
  let keys = await redis.keys('locked_payments_for_*');
  keys = User._shuffle(keys);

  for (let key of keys) {
    const userid = key.replace('locked_payments_for_', '');
    console.log('===================================================================================');
    console.log('userid=', userid);
    let user = new User(redis, bitcoinclient, lightning);
    user._userid = userid;
    let lockedPayments = await user.getLockedPayments();

    for (let lockedPayment of lockedPayments) {
      console.log('processing lockedPayment=', lockedPayment);

      let payment = new Paym(redis, bitcoinclient, lightning);
      payment.setInvoice(lockedPayment.pay_req);
      if (await payment.isExpired()) {
        let sendResult;
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
        await User._sleep(5);
      }
    }
  }
  console.log('done');
  process.exit();
})();

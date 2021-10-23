/**
 * This script gets all locked payments from our database and cross-checks them with actual
 * sentout payments from LND. If locked payment is in there we moe locked payment to array of real payments for the user
 * (it is effectively spent coins by user), if not - we attempt to pay it again (if it is not too old).
 */
import { User, Paym } from '../class/';
import config from '../config.js';

import * as fs from 'fs';
import Redis from 'ioredis';

import bitcoinclient from '../bitcoin.js';
import lightning from '../lightning.js';
const redis = new Redis(config.redis);

(async () => {
  let keys = await redis.keys('locked_payments_for_*');
  keys = User._shuffle(keys);

  console.log('fetching listPayments...');
  let tempPaym = new Paym(redis, bitcoinclient, lightning);
  let listPayments = await tempPaym.listPayments();
  console.log('done', 'got', listPayments['payments'].length, 'payments');
  fs.writeFileSync('listPayments.json', JSON.stringify(listPayments['payments'], null, 2));

  for (let key of keys) {
    const userid = key.replace('locked_payments_for_', '');
    console.log('===================================================================================');
    console.log('userid=', userid);
    let user = new User(redis, bitcoinclient, lightning);
    user._userid = userid;
    let lockedPayments = await user.getLockedPayments();
    // lockedPayments = [{pay_req : 'lnbc2m1pwgd4tdpp5vjz80mm8murdkskrnre6w4kphzy3d6gap5jyffr93u02ruaj0wtsdq2xgcrqvpsxqcqzysk34zva4h9ce9jdf08nfdm2sh2ek4y4hjse8ww9jputneltjl24krkv50sene4jh0wpull6ujgrg632u2qt3lkva74vpkqr5e5tuuljspasqfhx'}];

    for (let lockedPayment of lockedPayments) {
      let daysPassed = (+new Date() / 1000 - lockedPayment.timestamp) / 3600 / 24;
      console.log('processing lockedPayment=', lockedPayment, daysPassed, 'days passed');

      let payment = new Paym(redis, bitcoinclient, lightning);
      payment.setInvoice(lockedPayment.pay_req);
      if (daysPassed > 1 / 24 && daysPassed <= 1) {
        // if (!await payment.isExpired()) {
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
            process.exit();
            break;
          }
        }

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

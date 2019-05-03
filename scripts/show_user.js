import { User } from '../class/';
import { BigNumber } from 'bignumber.js';
const config = require('../config');

var Redis = require('ioredis');
var redis = new Redis(config.redis);

redis.info(function(err, info) {
  if (err || !info) {
    console.error('redis failure');
    process.exit(5);
  }
});

let bitcoinclient = require('../bitcoin');
let lightning = require('../lightning');

(async () => {
  let userid = process.argv[2];
  let U = new User(redis, bitcoinclient, lightning);
  U._userid = userid;

  let userinvoices = await U.getUserInvoices();
  let txs;

  let calculatedBalance = 0;

  console.log('\ndb balance\n==============\n', await U.getBalance());

  console.log('\nuserinvoices\n================\n');
  for (let invo of userinvoices) {
    if (invo && invo.ispaid) {
      console.log('+', +invo.amt, new Date(invo.timestamp * 1000).toString());
      calculatedBalance += +invo.amt;
    }
  }

  console.log('\ntxs\n===\n');

  txs = await U.getTxs();
  for (let tx of txs) {
    if (tx.type === 'bitcoind_tx') {
      console.log('+', new BigNumber(tx.amount).multipliedBy(100000000).toNumber(), '[on-chain refill]');
      calculatedBalance += new BigNumber(tx.amount).multipliedBy(100000000).toNumber();
    } else {
      console.log('-', +tx.value, new Date(tx.timestamp * 1000).toString(), tx.memo, '; preimage:', tx.payment_preimage || '');
      calculatedBalance -= +tx.value;
    }
  }

  let locked = await U.getLockedPayments();
  for (let loc of locked) {
    console.log('-', loc.amount + /* fee limit */ Math.floor(loc.amount * 0.01), new Date(loc.timestamp * 1000).toString(), '[locked]');
  }

  console.log('\ncalculatedBalance\n================\n', calculatedBalance, await U.getCalculatedBalance());
  process.exit();
})();

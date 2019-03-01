var crypto = require('crypto');
var lightningPayReq = require('bolt11');
import { BigNumber } from 'bignumber.js';

export class Paym {
  constructor(redis, bitcoindrpc, lightning) {
    this._redis = redis;
    this._bitcoindrpc = bitcoindrpc;
    this._lightning = lightning;
  }

  async decodePayReq(invoice) {
    return new Promise(function(resolve, reject) {
      this._lightning.decodePayReq({ pay_req: invoice }, function(err, info) {
        if (err) return reject(err);
        return resolve(info);
      });
    });
  }
}

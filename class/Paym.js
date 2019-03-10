var crypto = require('crypto');
var lightningPayReq = require('bolt11');
import { BigNumber } from 'bignumber.js';

export class Payment {
  constructor(redis, bitcoindrpc, lightning) {
    this._redis = redis;
    this._bitcoindrpc = bitcoindrpc;
    this._lightning = lightning;
    this._decoded = false;
  }

  async decodePayReqViaRpc(invoice) {
    return new Promise(function(resolve, reject) {
      this._lightning.decodePayReq({ pay_req: invoice }, function(err, info) {
        if (err) return reject(err);
        return resolve(info);
      });
    });
  }

  decodePayReq(payReq) {
    this._decoded = lightningPayReq.decode(payReq);
  }
}

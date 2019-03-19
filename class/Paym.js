var crypto = require('crypto');
var lightningPayReq = require('bolt11');
import { BigNumber } from 'bignumber.js';

export class Paym {
  constructor(redis, bitcoindrpc, lightning) {
    this._redis = redis;
    this._bitcoindrpc = bitcoindrpc;
    this._lightning = lightning;
    this._decoded = false;
    this._bolt11 = false;
    this._isPaid = null;
  }

  static get fee() {
    return 0.003;
  }

  setInvoice(bolt11) {
    this._bolt11 = bolt11;
  }

  async decodePayReqViaRpc(invoice) {
    let that = this;
    return new Promise(function(resolve, reject) {
      that._lightning.decodePayReq({ pay_req: invoice }, function(err, info) {
        if (err) return reject(err);
        that._decoded = info;
        return resolve(info);
      });
    });
  }

  async queryRoutes() {
    if (!this._bolt11) throw new Error('bolt11 is not provided');
    if (!this._decoded) await this.decodePayReqViaRpc(this._bolt11);

    var request = {
      pub_key: this._decoded.destination,
      amt: this._decoded.num_satoshis,
      num_routes: 1,
      final_cltv_delta: 144,
      fee_limit: { fixed: Math.floor(this._decoded.num_satoshis * 0.01) + 1 },
    };
    let that = this;
    return new Promise(function(resolve, reject) {
      that._lightning.queryRoutes(request, function(err, response) {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  async sendToRouteSync(routes) {
    if (!this._bolt11) throw new Error('bolt11 is not provided');
    if (!this._decoded) await this.decodePayReqViaRpc(this._bolt11);

    let request = {
      payment_hash_string: this._decoded.payment_hash,
      routes: routes,
    };

    let that = this;
    return new Promise(function(resolve, reject) {
      that._lightning.sendToRouteSync(request, function(err, response) {
        if (err) reject(err);
        resolve(that.processSendPaymentResponse(response));
      });
    });
  }

  processSendPaymentResponse(payment) {
    if (payment && payment.payment_route && payment.payment_route.total_amt_msat) {
      // paid just now
      this._isPaid = true;
      payment.payment_route.total_fees = +payment.payment_route.total_fees + Math.floor(+payment.payment_route.total_amt * Paym.fee);
      if (this._bolt11) payment.pay_req = this._bolt11;
      if (this._decoded) payment.decoded = this._decoded;
    }

    if (payment.payment_error && payment.payment_error.indexOf('already paid') !== -1) {
      // already paid
      this._isPaid = true;
      if (this._decoded) {
        payment.decoded = this._decoded;
        if (this._bolt11) payment.pay_req = this._bolt11;
        // trying to guess the fee
        payment.payment_route = payment.payment_route || {};
        payment.payment_route.total_fees = Math.floor(this._decoded.num_satoshis * 0.01); // we dont know the exact fee, so we use max (same as fee_limit)
        payment.payment_route.total_amt = this._decoded.num_satoshis;
      }
    }

    if (payment.payment_error && payment.payment_error.indexOf('unable to') !== -1) {
      // failed to pay
      this._isPaid = false;
    }

    if (payment.payment_error && payment.payment_error.indexOf('FinalExpiryTooSoon') !== -1) {
      this._isPaid = false;
    }

    if (payment.payment_error && payment.payment_error.indexOf('payment is in transition') !== -1) {
      this._isPaid = null; // null is default, but lets set it anyway
    }

    return payment;
  }

  /**
   * Returns NULL if unknown, true if its paid, false if its unpaid
   * (judging by error in sendPayment response)
   *
   * @returns {boolean|null}
   */
  getIsPaid() {
    return this._isPaid;
  }

  async attemptPayToRoute() {
    let routes = await this.queryRoutes();
    return await this.sendToRouteSync(routes.routes);
  }

  async isExpired() {
    if (!this._bolt11) throw new Error('bolt11 is not provided');
    const decoded = await this.decodePayReqViaRpc(this._bolt11);
    return +decoded.timestamp + +decoded.expiry < +new Date() / 1000;
  }

  decodePayReq(payReq) {
    this._decoded = lightningPayReq.decode(payReq);
  }
}

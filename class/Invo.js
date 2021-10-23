import crypto from 'crypto';
import lightningPayReq from 'bolt11';

export class Invo {
  constructor(redis, bitcoindrpc, lightning) {
    this._redis = redis;
    this._bitcoindrpc = bitcoindrpc;
    this._lightning = lightning;
    this._decoded = false;
    this._bolt11 = false;
    this._isPaid = null;
  }

  setInvoice(bolt11) {
    this._bolt11 = bolt11;
  }

  async getIsMarkedAsPaidInDatabase() {
    if (!this._bolt11) throw new Error('bolt11 is not provided');
    const decoded = lightningPayReq.decode(this._bolt11);
    let paymentHash = false;
    for (const tag of decoded.tags) {
      if (tag.tagName === 'payment_hash') {
        paymentHash = tag.data;
      }
    }
    if (!paymentHash) throw new Error('Could not find payment hash in invoice tags');
    return await this._getIsPaymentHashMarkedPaidInDatabase(paymentHash);
  }

  async markAsPaidInDatabase() {
    if (!this._bolt11) throw new Error('bolt11 is not provided');
    const decoded = lightningPayReq.decode(this._bolt11);
    let paymentHash = false;
    for (const tag of decoded.tags) {
      if (tag.tagName === 'payment_hash') {
        paymentHash = tag.data;
      }
    }
    if (!paymentHash) throw new Error('Could not find payment hash in invoice tags');
    return await this._setIsPaymentHashPaidInDatabase(paymentHash, decoded.satoshis);
  }

  async markAsUnpaidInDatabase() {
    if (!this._bolt11) throw new Error('bolt11 is not provided');
    const decoded = lightningPayReq.decode(this._bolt11);
    let paymentHash = false;
    for (const tag of decoded.tags) {
      if (tag.tagName === 'payment_hash') {
        paymentHash = tag.data;
      }
    }
    if (!paymentHash) throw new Error('Could not find payment hash in invoice tags');
    return await this._setIsPaymentHashPaidInDatabase(paymentHash, false);
  }

  async _setIsPaymentHashPaidInDatabase(paymentHash, settleAmountSat) {
    if (settleAmountSat) {
      return await this._redis.set('ispaid_' + paymentHash, settleAmountSat);
    } else {
      return await this._redis.del('ispaid_' + paymentHash);
    }
  }

  async _getIsPaymentHashMarkedPaidInDatabase(paymentHash) {
    return await this._redis.get('ispaid_' + paymentHash);
  }

  async getPreimage() {
    if (!this._bolt11) throw new Error('bolt11 is not provided');
    const decoded = lightningPayReq.decode(this._bolt11);
    let paymentHash = false;
    for (const tag of decoded.tags) {
      if (tag.tagName === 'payment_hash') {
        paymentHash = tag.data;
      }
    }
    if (!paymentHash) throw new Error('Could not find payment hash in invoice tags');
    return await this._redis.get('preimage_for_' + paymentHash);
  }

  async savePreimage(preimageHex) {
    const paymentHashHex = crypto.createHash('sha256').update(Buffer.from(preimageHex, 'hex')).digest('hex');
    const key = 'preimage_for_' + paymentHashHex;
    await this._redis.set(key, preimageHex);
    await this._redis.expire(key, 3600 * 24 * 30); // 1 month
  }

  makePreimageHex() {
    let buffer = crypto.randomBytes(32);
    return buffer.toString('hex');
  }

  /**
   * Queries LND ofr all user invoices
   *
   * @return {Promise<array>}
   */
  async listInvoices() {
    return new Promise((resolve, reject) => {
      this._lightning.listInvoices(
        {
          num_max_invoices: 99000111,
          reversed: true,
        },
        function (err, response) {
          if (err) return reject(err);
          resolve(response);
        },
      );
    });
  }
}

import { Lock } from './Lock';

var crypto = require('crypto');
var lightningPayReq = require('bolt11');
import { BigNumber } from 'bignumber.js';
import { decodeRawHex } from '../btc-decoder';
const config = require('../config');

// static cache:
let _invoice_ispaid_cache = {};
let _listtransactions_cache = false;
let _listtransactions_cache_expiry_ts = 0;

export class User {
  /**
   *
   * @param {Redis} redis
   */
  constructor(redis, bitcoindrpc, lightning) {
    this._redis = redis;
    this._bitcoindrpc = bitcoindrpc;
    this._lightning = lightning;
    this._userid = false;
    this._login = false;
    this._password = false;
    this._balance = 0;
  }

  getUserId() {
    return this._userid;
  }

  getLogin() {
    return this._login;
  }
  getPassword() {
    return this._password;
  }
  getAccessToken() {
    return this._acess_token;
  }
  getRefreshToken() {
    return this._refresh_token;
  }

  async loadByAuthorization(authorization) {
    if (!authorization) return false;
    let access_token = authorization.replace('Bearer ', '');
    let userid = await this._redis.get('userid_for_' + access_token);

    if (userid) {
      this._userid = userid;
      return true;
    }

    return false;
  }

  async loadByRefreshToken(refresh_token) {
    let userid = await this._redis.get('userid_for_' + refresh_token);
    if (userid) {
      this._userid = userid;
      await this._generateTokens();
      return true;
    }

    return false;
  }

  async create() {
    let buffer = crypto.randomBytes(10);
    let login = buffer.toString('hex');

    buffer = crypto.randomBytes(10);
    let password = buffer.toString('hex');

    buffer = crypto.randomBytes(24);
    let userid = buffer.toString('hex');
    this._login = login;
    this._password = password;
    this._userid = userid;
    await this._saveUserToDatabase();
  }

  async saveMetadata(metadata) {
    return await this._redis.set('metadata_for_' + this._userid, JSON.stringify(metadata));
  }

  async loadByLoginAndPassword(login, password) {
    let userid = await this._redis.get('user_' + login + '_' + this._hash(password));

    if (userid) {
      this._userid = userid;
      this._login = login;
      this._password = password;
      await this._generateTokens();
      return true;
    }
    return false;
  }

  async getAddress() {
    return await this._redis.get('bitcoin_address_for_' + this._userid);
  }

  /**
   * Asks LND for new address, and imports it to bitcoind
   *
   * @returns {Promise<any>}
   */
  async generateAddress() {
    let lock = new Lock(this._redis, 'generating_address_' + this._userid);
    if (!(await lock.obtainLock())) {
      // someone's already generating address
      return;
    }

    let self = this;
    return new Promise(function (resolve, reject) {
      self._lightning.newAddress({ type: 0 }, async function (err, response) {
        if (err) return reject('LND failure when trying to generate new address');
        await self.addAddress(response.address);
        if (config.bitcoind) self._bitcoindrpc.request('importaddress', [response.address, response.address, false]);
        resolve();
      });
    });
  }

  async watchAddress(address) {
    if (!address) return;
    if (config.bitcoind) return this._bitcoindrpc.request('importaddress', [address, address, false]);
  }

  /**
   * LndHub no longer relies on redis balance as source of truth, this is
   * more a cache now. See `this.getCalculatedBalance()` to get correct balance.
   *
   * @returns {Promise<number>} Balance available to spend
   */
  async getBalance() {
    let balance = (await this._redis.get('balance_for_' + this._userid)) * 1;
    if (!balance) {
      balance = await this.getCalculatedBalance();
      await this.saveBalance(balance);
    }
    return balance;
  }

  /**
   * Accounts for all possible transactions in user's account and
   * sums their amounts.
   *
   * @returns {Promise<number>} Balance available to spend
   */
  async getCalculatedBalance() {
    let calculatedBalance = 0;
    let userinvoices = await this.getUserInvoices();

    for (let invo of userinvoices) {
      if (invo && invo.ispaid) {
        calculatedBalance += +invo.amt;
      }
    }

    let txs = await this.getTxs();
    for (let tx of txs) {
      if (tx.type === 'bitcoind_tx') {
        // topup
        calculatedBalance += new BigNumber(tx.amount).multipliedBy(100000000).toNumber();
      } else {
        calculatedBalance -= +tx.value;
      }
    }

    let lockedPayments = await this.getLockedPayments();
    for (let paym of lockedPayments) {
      // locked payments are processed in scripts/process-locked-payments.js
      calculatedBalance -= +paym.amount + /* feelimit */ Math.floor(paym.amount * forwardFee);
    }

    return calculatedBalance;
  }

  /**
   * LndHub no longer relies on redis balance as source of truth, this is
   * more a cache now. See `this.getCalculatedBalance()` to get correct balance.
   *
   * @param balance
   * @returns {Promise<void>}
   */
  async saveBalance(balance) {
    const key = 'balance_for_' + this._userid;
    await this._redis.set(key, balance);
    await this._redis.expire(key, 1800);
  }

  async clearBalanceCache() {
    const key = 'balance_for_' + this._userid;
    return this._redis.del(key);
  }

  async savePaidLndInvoice(doc) {
    return await this._redis.rpush('txs_for_' + this._userid, JSON.stringify(doc));
  }

  async saveUserInvoice(doc) {
    let decoded = lightningPayReq.decode(doc.payment_request);
    let payment_hash;
    for (let tag of decoded.tags) {
      if (tag.tagName === 'payment_hash') {
        payment_hash = tag.data;
      }
    }

    await this._redis.set('payment_hash_' + payment_hash, this._userid);
    return await this._redis.rpush('userinvoices_for_' + this._userid, JSON.stringify(doc));
  }

  /**
   * Doent belong here, FIXME
   */
  async getUseridByPaymentHash(payment_hash) {
    return await this._redis.get('payment_hash_' + payment_hash);
  }

  /**
   * Doent belong here, FIXME
   * @see Invo._setIsPaymentHashPaidInDatabase
   * @see Invo.markAsPaidInDatabase
   */
  async setPaymentHashPaid(payment_hash, settleAmountSat) {
    return await this._redis.set('ispaid_' + payment_hash, settleAmountSat);
  }

  async lookupInvoice(payment_hash) {
    let that = this;
    return new Promise(function (resolve, reject) {
      that._lightning.lookupInvoice({ r_hash_str: payment_hash }, function (err, response) {
        if (err) resolve({});
        resolve(response);
      });
    });
  }

  /**
   * Doent belong here, FIXME
   * @see Invo._getIsPaymentHashMarkedPaidInDatabase
   * @see Invo.getIsMarkedAsPaidInDatabase
   */
  async getPaymentHashPaid(payment_hash) {
    return await this._redis.get('ispaid_' + payment_hash);
  }

  async syncInvoicePaid(payment_hash) {
    const invoice = await this.lookupInvoice(payment_hash);
    const ispaid = invoice.settled; // TODO: start using `state` instead as its future proof, and this one might get deprecated
    if (ispaid) {
      // so invoice was paid after all
      await this.setPaymentHashPaid(payment_hash, invoice.amt_paid_msat ? Math.floor(invoice.amt_paid_msat / 1000) : invoice.amt_paid_sat);
      await this.clearBalanceCache();
    }
    return ispaid;
  }

  async getUserInvoices(limit) {
    let range = await this._redis.lrange('userinvoices_for_' + this._userid, 0, -1);
    if (limit && !isNaN(parseInt(limit))) {
      range = range.slice(parseInt(limit) * -1);
    }
    let result = [];
    for (let invoice of range) {
      invoice = JSON.parse(invoice);
      let decoded = lightningPayReq.decode(invoice.payment_request);
      invoice.description = '';
      for (let tag of decoded.tags) {
        if (tag.tagName === 'description') {
          try {
            invoice.description += decodeURIComponent(tag.data);
          } catch (_) {
            invoice.description += tag.data;
          }
        }
        if (tag.tagName === 'payment_hash') {
          invoice.payment_hash = tag.data;
        }
      }

      let paymentHashPaidAmountSat = 0;
      if (_invoice_ispaid_cache[invoice.payment_hash]) {
        // static cache hit
        invoice.ispaid = true;
        paymentHashPaidAmountSat = _invoice_ispaid_cache[invoice.payment_hash];
      } else {
        // static cache miss, asking redis cache
        paymentHashPaidAmountSat = await this.getPaymentHashPaid(invoice.payment_hash);
        if (paymentHashPaidAmountSat) invoice.ispaid = true;
      }

      if (!invoice.ispaid) {
        if (decoded && decoded.timestamp > +new Date() / 1000 - 3600 * 24 * 5) {
          // if invoice is not too old we query lnd to find out if its paid
          invoice.ispaid = await this.syncInvoicePaid(invoice.payment_hash);
          paymentHashPaidAmountSat = await this.getPaymentHashPaid(invoice.payment_hash); // since we have just saved it
        }
      } else {
        _invoice_ispaid_cache[invoice.payment_hash] = paymentHashPaidAmountSat;
      }

      invoice.amt =
        paymentHashPaidAmountSat && parseInt(paymentHashPaidAmountSat) > decoded.satoshis
          ? parseInt(paymentHashPaidAmountSat)
          : decoded.satoshis;
      invoice.expire_time = 3600 * 24;
      // ^^^default; will keep for now. if we want to un-hardcode it - it should be among tags (`expire_time`)
      invoice.timestamp = decoded.timestamp;
      invoice.type = 'user_invoice';
      result.push(invoice);
    }

    return result;
  }

  async addAddress(address) {
    await this._redis.set('bitcoin_address_for_' + this._userid, address);
  }

  /**
   * User's onchain txs that are >= configured target confirmations
   * Queries bitcoind RPC.
   *
   * @returns {Promise<Array>}
   */
  async getTxs() {
    const addr = await this.getOrGenerateAddress();
    const targetConfirmations = config.bitcoin.confirmations;
    let txs = await this._listtransactions();
    txs = txs.result;
    let result = [];
    for (let tx of txs) {
      if (tx.confirmations >= targetConfirmations && tx.address === addr && tx.category === 'receive') {
        tx.type = 'bitcoind_tx';
        result.push(tx);
      }
    }

    let range = await this._redis.lrange('txs_for_' + this._userid, 0, -1);
    for (let invoice of range) {
      invoice = JSON.parse(invoice);
      invoice.type = 'paid_invoice';

      // for internal invoices it might not have properties `payment_route`  and `decoded`...
      if (invoice.payment_route) {
        invoice.fee = +invoice.payment_route.total_fees;
        invoice.value = +invoice.payment_route.total_fees + +invoice.payment_route.total_amt;
        if (invoice.payment_route.total_amt_msat && invoice.payment_route.total_amt_msat / 1000 !== +invoice.payment_route.total_amt) {
          // okay, we have to account for MSAT
          invoice.value =
            +invoice.payment_route.total_fees +
            Math.max(parseInt(invoice.payment_route.total_amt_msat / 1000), +invoice.payment_route.total_amt) +
            1; // extra sat to cover for msats, as external layer (clients) dont have that resolution
        }
      } else {
        invoice.fee = 0;
      }
      if (invoice.decoded) {
        invoice.timestamp = invoice.decoded.timestamp;
        invoice.memo = invoice.decoded.description;
      }
      if (invoice.payment_preimage) {
        invoice.payment_preimage = Buffer.from(invoice.payment_preimage, 'hex').toString('hex');
      }
      // removing unsued by client fields to reduce size
      delete invoice.payment_error;
      delete invoice.payment_route;
      delete invoice.pay_req;
      delete invoice.decoded;
      result.push(invoice);
    }

    return result;
  }

  /**
   * Simple caching for this._bitcoindrpc.request('listtransactions', ['*', 100500, 0, true]);
   * since its too much to fetch from bitcoind every time
   *
   * @returns {Promise<*>}
   * @private
   */
  async _listtransactions() {
    let response = _listtransactions_cache;
    if (response) {
      if (+new Date() > _listtransactions_cache_expiry_ts) {
        // invalidate cache
        response = _listtransactions_cache = false;
      } else {
        try {
          return JSON.parse(response);
        } catch (_) {
          // nop
        }
      }
    }

    try {
      let ret = { result: [] };
      if (config.bitcoind) {
        let txs = await this._bitcoindrpc.request('listtransactions', ['*', 100500, 0, true]);
        // now, compacting response a bit
        for (const tx of txs.result) {
          ret.result.push({
            category: tx.category,
            amount: tx.amount,
            confirmations: tx.confirmations,
            address: tx.address,
            time: tx.blocktime || tx.time,
          });
        }
      } else {
        let txs = await this._getChainTransactions();
        ret.result.push(...txs);
      }
      _listtransactions_cache = JSON.stringify(ret);
      _listtransactions_cache_expiry_ts = +new Date() + 5 * 60 * 1000; // 5 min
      this._redis.set('listtransactions', _listtransactions_cache);
      return ret;
    } catch (error) {
      console.warn('listtransactions error:', error);
      let _listtransactions_cache = await this._redis.get('listtransactions');
      if (!_listtransactions_cache) return { result: [] };
      return JSON.parse(_listtransactions_cache);
    }
  }

  async _getChainTransactions() {
    return new Promise((resolve, reject) => {
      this._lightning.getTransactions({}, (err, data) => {
        if (err) return reject(err);
        const { transactions } = data;
        const outTxns = [];
        // on lightning incoming transactions have no labels
        // for now filter out known labels to reduce transactions
        transactions
          .filter((tx) => tx.label !== 'external' && !tx.label.includes('openchannel'))
          .map((tx) => {
            const decodedTx = decodeRawHex(tx.raw_tx_hex);
            decodedTx.outputs.forEach((vout) =>
              outTxns.push({
                // mark all as received, since external is filtered out
                category: 'receive',
                confirmations: tx.num_confirmations,
                amount: Number(vout.value),
                address: vout.scriptPubKey.addresses[0],
                time: tx.time_stamp,
              }),
            );
          });

        resolve(outTxns);
      });
    });
  }

  /**
   * Returning onchain txs for user's address that are less than configured target confirmations
   *
   * @returns {Promise<Array>}
   */
  async getPendingTxs() {
    const addr = await this.getOrGenerateAddress();
    const targetConfirmations = config.bitcoin.confirmations;
    let txs = await this._listtransactions();
    txs = txs.result;
    let result = [];
    for (let tx of txs) {
      if (tx.confirmations < targetConfirmations && tx.address === addr && tx.category === 'receive') {
        result.push(tx);
      }
    }
    return result;
  }

  async _generateTokens() {
    let buffer = crypto.randomBytes(20);
    this._acess_token = buffer.toString('hex');

    buffer = crypto.randomBytes(20);
    this._refresh_token = buffer.toString('hex');

    await this._redis.set('userid_for_' + this._acess_token, this._userid);
    await this._redis.set('userid_for_' + this._refresh_token, this._userid);
    await this._redis.set('access_token_for_' + this._userid, this._acess_token);
    await this._redis.set('refresh_token_for_' + this._userid, this._refresh_token);
  }

  async _saveUserToDatabase() {
    let key;
    await this._redis.set((key = 'user_' + this._login + '_' + this._hash(this._password)), this._userid);
  }

  /**
   * Fetches all onchain txs for user's address, and compares them to
   * already imported txids (stored in database); Ones that are not imported -
   * get their balance added to user's balance, and its txid added to 'imported' list.
   *
   * @returns {Promise<void>}
   */
  async accountForPosibleTxids() {
    return; // TODO: remove
    let onchain_txs = await this.getTxs();
    let imported_txids = await this._redis.lrange('imported_txids_for_' + this._userid, 0, -1);
    for (let tx of onchain_txs) {
      if (tx.type !== 'bitcoind_tx') continue;
      let already_imported = false;
      for (let imported_txid of imported_txids) {
        if (tx.txid === imported_txid) already_imported = true;
      }

      if (!already_imported && tx.category === 'receive') {
        // first, locking...
        let lock = new Lock(this._redis, 'importing_' + tx.txid);
        if (!(await lock.obtainLock())) {
          // someone's already importing this tx
          return;
        }

        let userBalance = await this.getCalculatedBalance();
        // userBalance += new BigNumber(tx.amount).multipliedBy(100000000).toNumber();
        // no need to add since it was accounted for in `this.getCalculatedBalance()`
        await this.saveBalance(userBalance);
        await this._redis.rpush('imported_txids_for_' + this._userid, tx.txid);
        await lock.releaseLock();
      }
    }
  }

  /**
   * Adds invoice to a list of user's locked payments.
   * Used to calculate balance till the lock is lifted (payment is in
   * determined state - succeded or failed).
   *
   * @param {String} pay_req
   * @param {Object} decodedInvoice
   * @returns {Promise<void>}
   */
  async lockFunds(pay_req, decodedInvoice) {
    let doc = {
      pay_req,
      amount: +decodedInvoice.num_satoshis,
      timestamp: Math.floor(+new Date() / 1000),
    };

    return this._redis.rpush('locked_payments_for_' + this._userid, JSON.stringify(doc));
  }

  /**
   * Strips specific payreq from the list of locked payments
   * @param pay_req
   * @returns {Promise<void>}
   */
  async unlockFunds(pay_req) {
    let payments = await this.getLockedPayments();
    let saveBack = [];
    for (let paym of payments) {
      if (paym.pay_req !== pay_req) {
        saveBack.push(paym);
      }
    }

    await this._redis.del('locked_payments_for_' + this._userid);
    for (let doc of saveBack) {
      await this._redis.rpush('locked_payments_for_' + this._userid, JSON.stringify(doc));
    }
  }

  async getLockedPayments() {
    let payments = await this._redis.lrange('locked_payments_for_' + this._userid, 0, -1);
    let result = [];
    for (let paym of payments) {
      let json;
      try {
        json = JSON.parse(paym);
        result.push(json);
      } catch (_) {}
    }

    return result;
  }

  async getOrGenerateAddress() {
    let addr = await this.getAddress();
    if (!addr) {
      await this.generateAddress();
      addr = await this.getAddress();
    }
    if (!addr) throw new Error('cannot get transactions: no onchain address assigned to user');
    return addr;
  }

  _hash(string) {
    return crypto.createHash('sha256').update(string).digest().toString('hex');
  }

  /**
   * Shuffles array in place. ES6 version
   * @param {Array} a items An array containing the items.
   */
  static _shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  static async _sleep(s) {
    return new Promise((r) => setTimeout(r, s * 1000));
  }
}

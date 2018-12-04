var crypto = require('crypto');
import { BigNumber } from 'bignumber.js';

export class User {
  /**
   *
   * @param {Redis} redis
   */
  constructor(redis, bitcoindrpc) {
    this._redis = redis;
    this._bitcoindrpc = bitcoindrpc;
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

  async getBalance() {
    return (await this._redis.get('balance_for_' + this._userid)) * 1;
  }

  async saveBalance(balance) {
    return await this._redis.set('balance_for_' + this._userid, balance);
  }

  async savePaidLndInvoice(doc) {
    return await this._redis.rpush('txs_for_' + this._userid, JSON.stringify(doc));
  }

  async addAddress(address) {
    await this._redis.set('bitcoin_address_for_' + this._userid, address);
  }

  /**
   * User's onchain txs that are >= 3 confs
   *
   * @returns {Promise<Array>}
   */
  async getTxs() {
    let addr = await this.getAddress();
    let txs = await this._bitcoindrpc.request('listtransactions', [addr, 100500, 0, true]);
    txs = txs.result;
    let result = [];
    for (let tx of txs) {
      if (tx.confirmations >= 3) {
        tx.type = 'bitcoind_tx';
        result.push(tx);
      }
    }

    let range = await this._redis.lrange('txs_for_' + this._userid, 0, -1);
    for (let invoice of range) {
      invoice = JSON.parse(invoice);
      invoice.type = 'paid_invoice';
      invoice.fee = +invoice.payment_route.total_fees;
      invoice.value = +invoice.payment_route.total_fees + +invoice.payment_route.total_amt;
      invoice.timestamp = invoice.decoded.timestamp;
      invoice.memo = invoice.decoded.description;
      result.push(invoice);
    }

    return result;
  }

  /**
   * Returning onchain txs for user's address that are less than 3 confs
   *
   * @returns {Promise<Array>}
   */
  async getPendingTxs() {
    let addr = await this.getAddress();
    let txs = await this._bitcoindrpc.request('listtransactions', [addr, 100500, 0, true]);
    txs = txs.result;
    let result = [];
    for (let tx of txs) {
      if (tx.confirmations < 3) {
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
    let imported_txids = await this._redis.lrange('imported_txids_for_' + this._userid, 0, -1);
    console.log(':::::::::::imported_txids', imported_txids);
    let onchain_txs = await this.getTxs();
    for (let tx of onchain_txs) {
      if (tx.type !== 'bitcoind_tx') continue;
      let already_imported = false;
      for (let imported_txid of imported_txids) {
        if (tx.txid === imported_txid) already_imported = true;
      }

      if (!already_imported && tx.category === 'receive') {
        let userBalance = await this.getBalance();
        userBalance += new BigNumber(tx.amount).multipliedBy(100000000).toNumber();
        await this.saveBalance(userBalance);
        await this._redis.rpush('imported_txids_for_' + this._userid, tx.txid);
      }
    }
  }

  _hash(string) {
    return crypto
      .createHash('sha256')
      .update(string)
      .digest()
      .toString('hex');
  }
}

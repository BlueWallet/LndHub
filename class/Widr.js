var crypto = require('crypto');

const STATUS_UNCLAIMED = "unclaimed"
const STATUS_PENDING = "pending"

export class Widr {
  /**
   *
   * @param {Redis} redis
   */
  constructor(redis, amount, userid) {
    this._redis = redis;
    this._userid = userid;
    this.amount = amount;
    this.status = STATUS_UNCLAIMED;
    let buffer = crypto.randomBytes(10);
    let secret = buffer.toString('hex');
    this.secret = secret;
  }

  async saveWithdrawal() {
    let withdrawal = {
      userId: this._userid,
      amount: this.amount,
      status: this.status,
      secret: this.secret
    };
    let key = 'withdrawal_link_' + this.secret;
    await this._redis.set(key, JSON.stringify(withdrawal));
    await this._redis.expire(key, 3600 * 24 * 7); // 1 week
    return withdrawal;
  }

  async lookUpWithdrawal(secret) {
    return await this._redis.get('withdrawal_link_' + secret);
  }

}

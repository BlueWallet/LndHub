const crypto = require('crypto');

export class Lock {
  /**
   *
   * @param {Redis} redis
   * @param {String} lock_key
   */
  constructor(redis, lock_key) {
    this._redis = redis;
    this._lock_key = lock_key;
  }

  /**
   * Tries to obtain lock in single-threaded Redis.
   * Returns TRUE if success.
   *
   * @returns {Promise<boolean>}
   */
  async obtainLock() {
    if (await this._redis.get(this._lock_key)) {
      // someone already has the lock
      return false;
    }

    // trying to set the lock:
    let buffer = crypto.randomBytes(10);
    const randomValue = buffer.toString('hex');
    await this._redis.set(this._lock_key, randomValue);

    // checking if it was set:
    let value = await this._redis.get(this._lock_key);
    if (value !== randomValue) {
      // someone else managed to obtain this lock
      return false;
    }

    // success - got lock
    await this._redis.expire(this._lock_key, 2 * 60);
    // lock expires in 2 mins just for any case
    return true;
  }

  async releaseLock() {
    await this._redis.del(this._lock_key);
  }
}

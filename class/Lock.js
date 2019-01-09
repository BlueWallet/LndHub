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
    const timestamp = +new Date();
    let setResult = await this._redis.setnx(this._lock_key, timestamp);
    if (!setResult) {
      // it already held a value - failed locking
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

// setup bitcoind rpc
import config from './config.js';
import jayson from 'jayson/promise/index.js';
import url from 'url';
if (config.bitcoind) {
  let rpc = url.parse(config.bitcoind.rpc);
  rpc.timeout = 15000;
  module.exports = jayson.client.http(rpc);
} else {
  module.exports = {};
}

// setup bitcoind rpc
import config from './config.js';
import jayson from 'jayson/promise/index.js';
import url from 'url';
if (config.bitcoind) {
  let rpc = url.parse(config.bitcoind.rpc);
  rpc.timeout = 15000;
  export default jayson.client.http(rpc);
} else {
  export default {};
}

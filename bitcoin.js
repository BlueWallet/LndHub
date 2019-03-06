// setup bitcoind rpc
const config = require('./config');
let jayson = require('jayson/promise');
let url = require('url');
let rpc = url.parse(config.bitcoind.rpc);
rpc.timeout = 5000;
module.exports = jayson.client.http(rpc);

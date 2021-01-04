// setup bitcoind rpc
const config = require('./config');
let jayson = require('jayson/promise');
let url = require('url');
if(config.bitcoind) {
    let rpc = url.parse(config.bitcoind.rpc);
    rpc.timeout = 15000;
    module.exports = jayson.client.http(rpc);
} else {
    module.exports = {};
}


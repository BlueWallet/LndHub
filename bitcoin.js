const fs = require('fs')
const path = require('path')
// setup bitcoind rpc
const config = require('./config');
let jayson = require('jayson/promise');
let url = require('url');
let rpc = url.parse(config.bitcoind.rpc);
rpc.timeout = 5000;
rpc.rejectUnauthorized = false
rpc.ecdhCurve = 'auto'
const client = jayson.client.https(rpc)
module.exports = client;


// setup lnd rpc
const config = require('./config');
var fs = require('fs');
var grpc = require('grpc');
var lnrpc = grpc.load('rpc.proto').lnrpc;
process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';
var lndCert;
if (process.env.TLSCERT) {
  lndCert = Buffer.from(process.env.TLSCERT, 'hex');
} else {
  lndCert = fs.readFileSync('tls.cert');
}
process.env.VERBOSE && console.log('using tls.cert', lndCert.toString('hex'));
let sslCreds = grpc.credentials.createSsl(lndCert);
let macaroon;
if (process.env.MACAROON) {
  macaroon = process.env.MACAROON;
} else {
  macaroon = fs.readFileSync('admin.macaroon').toString('hex');
}
process.env.VERBOSE && console.log('using macaroon', macaroon);
let macaroonCreds = grpc.credentials.createFromMetadataGenerator(function(args, callback) {
  let metadata = new grpc.Metadata();
  metadata.add('macaroon', macaroon);
  callback(null, metadata);
});
let creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

// trying to unlock the wallet:
if (config.lnd.password) {
  process.env.VERBOSE && console.log('trying to unlock the wallet');
  var walletUnlocker = new lnrpc.WalletUnlocker(config.lnd.url, creds);
  walletUnlocker.unlockWallet(
    {
      wallet_password: Buffer.from(config.lnd.password).toString('base64'),
    },
    function(err, response) {
      if (err) {
        process.env.VERBOSE && console.log('unlockWallet failed, probably because its been aleady unlocked');
      } else {
        console.log('unlockWallet:', response);
      }
    },
  );
}

module.exports = new lnrpc.Lightning(config.lnd.url, creds, { 'grpc.max_receive_message_length': 1024 * 1024 * 1024 });

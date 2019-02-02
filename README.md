LndHub
======

Wrapper for Lightning Network Daemon. It provides separate accounts with minimum trust for end users

INSTALLATION
------------

```
git clone git@github.com:BlueWallet/LndHub.git
cd LndHub
npm i
```

Install `bitcoind`, `lnd` and `redis`.

Edit `config.js` and set it up correctly.
Copy `admin.macaroon` and `tls.cert` in root folder of LndHub.

### Deploy to Heroku

Add config vars :
* `CONFIG` : json serialized config object
* `MACAROON`: hex-encoded `admin.macaroon`
* `TLSCERT`: hex-encoded `tls.cert`


### Tests

Acceptance tests are in https://github.com/BlueWallet/BlueWallet/blob/master/LightningCustodianWallet.test.js

## Responsible disclosure

Found critical bugs/vulnerabilities? Please email them bluewallet@bluewallet.io
Thanks!

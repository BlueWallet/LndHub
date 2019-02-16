LndHub
======

Wrapper for Lightning Network Daemon. It provides separate accounts with minimum trust for end users

INSTALLATION
------------

You can use those guides or follow instructions below:

* https://github.com/dangeross/guides/blob/master/raspibolt/raspibolt_6B_lndhub.md
* https://medium.com/@jpthor/running-lndhub-on-mac-osx-5be6671b2e0c

```
git clone git@github.com:BlueWallet/LndHub.git
cd LndHub
npm i
```

Install `bitcoind`, `lnd` and `redis`. Edit `config.js` and set it up correctly.
Copy `admin.macaroon` and `tls.cert` in root folder of LndHub.

`bitcoind` should run with `-deprecatedrpc=accounts`, for now. Lndhub expects Lnd's wallet to be unlocked, if not - it will attempt to unlock it with password stored in `config.lnd.password`.
Don't forget to enable disk-persistance for `redis`.


### Deploy to Heroku

Add config vars :
* `CONFIG` : json serialized config object
* `MACAROON`: hex-encoded `admin.macaroon`
* `TLSCERT`: hex-encoded `tls.cert`


### Tests

Acceptance tests are in https://github.com/BlueWallet/BlueWallet/blob/master/LightningCustodianWallet.test.js

![image](https://user-images.githubusercontent.com/1913337/52418916-f30beb00-2ae6-11e9-9d63-17189dc1ae8c.png)



## Responsible disclosure

Found critical bugs/vulnerabilities? Please email them bluewallet@bluewallet.io
Thanks!

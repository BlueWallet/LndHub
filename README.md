Satoshi Engineering - Extensions
======

### [Feature] Allow self payment
Reading the code it seems that LndHub was never supposed to run on a node with other applications on it, which leads to the problem:

If you want to pay an invoice issued by the node, but not issued "via" LndHub it will be denied. To allow this add this to your config:
```
allowLightningPaymentToNode: true // it defaults to false
```

### [Feature] Support Dashboard
As a node runner I would like to:
- [x] Stop the creation of new accounts
- [ ] Check the total balance of lndhub

If the Support Dashboard is not turned an, all routes (api and web) are turned off. To turn it on choose a sha265 password. To Create it

```javascript
const { createHash } = require('crypto')
const password = 'gobrrr'
const passwordSHA256 = createHash('sha256').update(password).digest('hex')
console.info(passwordSHA256)
```

```
supportDashboardPasswordHash: 'e42703b94ce32a831ea363a8924dc0239ca54160a8f3fb2755bdbceb07238a8a'
// it defaults to '' which means it's turned completly off
```

### [Feature] Account Creation Mode

By default everyone could open account on our node, what we can't have as a company (KYC), so we added an account creation mode.

In config you can set the mode, when it starts & can be edited by the support dashboard
```
accountCreationMode: 'on', // 'on', 'off', 'once' ... defaults to 'on'
```

LndHub
======

Wrapper for Lightning Network Daemon (lnd). It provides separate accounts with minimum trust for end users.

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

Install `bitcoind`, `lnd`, and `redis`. Edit LndHub's `config.js` to set it up correctly.
Copy the files `admin.macaroon` (for Bitcoin mainnet, usually stored in `~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon`)
and `tls.cert` (usually stored in `~/.lnd/tls.cert`) into the root folder of LndHub.

LndHub expects LND's wallet to be unlocked, if not — it will attempt to unlock it with the password stored in `config.lnd.password`.
Don't forget to configure disk-persistence for `redis` (e.g., you may want to set `appendonly` to  `yes` in `redis.conf` (see
http://redis.io/topics/persistence for more information).

If you have no `bitcoind` instance, for example if you use neutrino, or you have no bitcoind wallet, 
for example if you use LND for wallet managment, you can remove the bitcoind settings from `config.js`.
Please note that this feature is limited to Bitcoin, so you can't use it if you use any other cryptocurrency with LND (e.g., Litecoin).

### Deploy to Heroku

Add config vars :
* `CONFIG` : json serialized config object
* `MACAROON`: hex-encoded `admin.macaroon`
* `TLSCERT`: hex-encoded `tls.cert`

### Run in docker

LndHub is available on Docker Hub as [`bluewalletorganization/lndhub`](https://hub.docker.com/r/bluewalletorganization/lndhub).
Please note that this requires a separate instance of redis and LND and optionally, bitcoind.
You can also view Umbrel's implementation using docker-compose [here](https://github.com/getumbrel/umbrel/blob/280c87f0f323666b1b0552aeb24f60df94d1e43c/apps/lndhub/docker-compose.yml).

### Reference client implementation

Can be used in ReactNative or Nodejs environment

* https://github.com/BlueWallet/BlueWallet/blob/master/class/wallets/lightning-custodian-wallet.js



### Tests

Acceptance tests are in https://github.com/BlueWallet/BlueWallet/blob/master/tests/integration/lightning-custodian-wallet.test.js

![image](https://user-images.githubusercontent.com/1913337/52418916-f30beb00-2ae6-11e9-9d63-17189dc1ae8c.png)



## Responsible disclosure

Found critical bugs/vulnerabilities? Please email them to bluewallet@bluewallet.io
Thanks!

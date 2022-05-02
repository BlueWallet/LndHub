let config = {
  enableUpdateDescribeGraph: false,
  postRateLimit: 100,
  rateLimit: 200,
  forwardReserveFee: 0.01, // default 0.01
  intraHubFee: 0.003, // default 0.003
  auth: {
    accessTokenLifeTime: 3600,
    refreshTokenLifeTime: 86400,
  },
  bitcoind: {
    rpc: 'http://login:password@1.1.1.1:8332/wallet/wallet.dat',
  },
  redis: {
    port: 12914,
    host: '1.1.1.1',
    family: 4,
    password: 'password',
    db: 0,
  },
  lnd: {
    url: '1.1.1.1:10009',
    password: '',
  },
  bitcoin: {
    confirmations: 3,
  },
};

if (process.env.CONFIG) {
  console.log('using config from env');
  config = JSON.parse(process.env.CONFIG);
}

module.exports = config;

let config = {
  enableUpdateDescribeGraph: false,
  postRateLimit: 100,
  rateLimit: 200,
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
};

if (process.env.CONFIG) {
  console.log('using config from env');
  config = JSON.parse(process.env.CONFIG);
}

module.exports = config;

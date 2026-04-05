let config = {
  enableUpdateDescribeGraph: false,
  postRateLimit: 100,
  rateLimit: 200,
  forwardReserveFee: 0.01, // default 0.01
  intraHubFee: 0.003, // default 0.003
  bitcoind: {
    rpc: process.env.BITCOIND_RPC || 'http://127.0.0.1:8332/wallet/wallet.dat',
  },
  redis: {
    port: 12914,
    host: process.env.REDIS_HOST || '127.0.0.1',
    family: 4,
    password: process.env.REDIS_PASSWORD || '',
    db: 0,
  },
  lnd: {
    url: process.env.LND_URL || '127.0.0.1:10009',
    password: '',
  },
};

if (process.env.CONFIG) {
  console.log('using config from env');
  config = JSON.parse(process.env.CONFIG);
}

module.exports = config;

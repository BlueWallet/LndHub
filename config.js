let config = {
  bitcoind: {
    rpc: 'https://kek:kek@127.0.0.1:18334',
  },
  redis: {
    port: 6379,
    host: '127.0.0.1',
    family: 4,
    password: '',
    db: 0,
  },
  lnd: {
    url: '127.0.0.1:10009',
  },
};

if (process.env.CONFIG) {
  console.log('using config from env');
  config = JSON.parse(process.env.CONFIG);
}

module.exports = config;

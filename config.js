let config = {
  bitcoind: {
    rpc: 'http://masize:12345678@127.0.0.1:18443',
  },
  redis: {
    port: 6379,
    host: '127.0.0.1',
    family: 4,
    //password: 'password',
    db: 0,
  },
  lnd: {
    url: '127.0.0.1:10009',
    password: 'masize1535',
  },
};

if (process.env.CONFIG) {
  console.log('using config from env');
  config = JSON.parse(process.env.CONFIG);
}

module.exports = config;

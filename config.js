let config = {
    bitcoind: {
        rpc: 'http://login:password@1.1.1.1:8332',
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
    },
};

if (process.env.CONFIG) {
    console.log('using config from env');
    config = JSON.parse(process.env.CONFIG)
}

module.exports = config;
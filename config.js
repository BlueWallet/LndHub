let config = {
  enableUpdateDescribeGraph: false,
  postRateLimit: 100,
  rateLimit: 200,
  forwardReserveFee: 0.01, // default 0.01
  intraHubFee: 0.003, // default 0.003
  allowLightningPaymentToNode: false,
  supportDashboardPasswordHash: '',
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

// Config checks
if (!(config.supportDashboardPasswordHash)) config.supportDashboardPasswordHash = ''
if (typeof config.supportDashboardPasswordHash !== 'string') config.supportDashboardPasswordHash = ''

module.exports = config;

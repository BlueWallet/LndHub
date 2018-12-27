let express = require('express');
let router = express.Router();
let fs = require('fs');
let mustache = require('mustache');
let lightning = require('../lightning');

let lightningGetInfo = {};
let lightningListChannels = {};
function updateLightning() {
  lightning.getInfo({}, function(err, info) {
    if (err) {
      console.error('lnd failure');
      process.exit(3);
    }
    lightningGetInfo = info;
  });

  lightning.listChannels({}, function(err, response) {
    if (err) {
      console.error('lnd failure');
      process.exit(3);
    }
    lightningListChannels = response;
    let channels = [];
    for (let channel of lightningListChannels.channels) {
      let divider = 524287;
      let ascii_length1 = channel.local_balance / divider;
      let ascii_length2 = channel.remote_balance / divider;
      channel.ascii = '[';
      channel.ascii += '-'.repeat(Math.round(ascii_length1));
      channel.ascii += '/' + '-'.repeat(Math.round(ascii_length2));
      channel.ascii += ']';
      channel.capacity_btc = channel.capacity / 100000000;
      channel.name = pubkey2name[channel.remote_pubkey];
      channels.push(channel);
    }
    lightningListChannels.channels = channels;
  });
}
updateLightning();
setInterval(updateLightning, 60000);

const pubkey2name = {
  '03e50492eab4107a773141bb419e107bda3de3d55652e6e1a41225f06a0bbf2d56': 'yalls.org',
  '0232e20e7b68b9b673fb25f48322b151a93186bffe4550045040673797ceca43cf': 'zigzag.io',
  '02df5ffe895c778e10f7742a6c5b8a0cefbe9465df58b92fadeb883752c8107c8f': 'blockstream store',
  '030c3f19d742ca294a55c00376b3b355c3c90d61c6b6b39554dbc7ac19b141c14f': 'bitrefill.com',
  '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f': 'ACINQ',
  '03abf6f44c355dec0d5aa155bdbdd6e0c8fefe318eff402de65c6eb2e1be55dc3e': 'OpenNode',
  '0242a4ae0c5bef18048fbecf995094b74bfb0f7391418d71ed394784373f41e4f3': 'coingate.com',
  '0279c22ed7a068d10dc1a38ae66d2d6461e269226c60258c021b1ddcdfe4b00bc4': 'ln1.satoshilabs.com',
};

router.get('/', function(req, res) {
  if (!lightningGetInfo) {
    console.error('lnd failure');
    process.exit(3);
  }
  res.setHeader('Content-Type', 'text/html');
  let html = fs.readFileSync('./templates/index.html').toString('utf8');
  return res.status(200).send(mustache.render(html, Object.assign({}, lightningGetInfo, lightningListChannels)));
});

router.get('/about', function(req, res) {
  let html = fs.readFileSync('./templates/about.html').toString('utf8');
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(mustache.render(html, {}));
});

router.use(function(req, res) {
  res.status(404).send('404');
});

module.exports = router;

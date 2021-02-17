let express = require('express');
let router = express.Router();
let fs = require('fs');
let mustache = require('mustache');
let lightning = require('../lightning');
let logger = require('../utils/logger');
var qr = require('qr-image');

let lightningGetInfo = {};
let lightningListChannels = {};
function updateLightning() {
  console.log('updateLightning()');
  try {
    lightning.getInfo({}, function (err, info) {
      if (err) {
        console.error('lnd failure:', err);
      }
      lightningGetInfo = info;
    });

    lightning.listChannels({}, function (err, response) {
      if (err) {
        console.error('lnd failure:', err);
        return;
      }
      lightningListChannels = response;
      let channels = [];
      for (let channel of lightningListChannels.channels) {
        let divider = 5242870;
        let ascii_length1 = channel.local_balance / divider;
        let ascii_length2 = channel.remote_balance / divider;
        channel.local += (Math.round(ascii_length1));
        channel.remote += (Math.round(ascii_length2));
        channel.capacity_btc = channel.capacity / 100000000;
        channel.name = pubkey2name[channel.remote_pubkey];
        if (channel.name) {
          channels.unshift(channel);
        } else {
          channels.push(channel);
        }
      }
      lightningListChannels.channels = channels;
    });
  } catch (Err) {
    console.log(Err);
  }
  console.log('updated');
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
  '02c91d6aa51aa940608b497b6beebcb1aec05be3c47704b682b3889424679ca490': 'lnd-21.LNBIG.com',
  '024655b768ef40951b20053a5c4b951606d4d86085d51238f2c67c7dec29c792ca': 'satoshis.place',
  '03c2abfa93eacec04721c019644584424aab2ba4dff3ac9bdab4e9c97007491dda': 'tippin.me',
  '022c699df736064b51a33017abfc4d577d133f7124ac117d3d9f9633b6297a3b6a': 'globee.com',
  '0237fefbe8626bf888de0cad8c73630e32746a22a2c4faa91c1d9877a3826e1174': '1.ln.aantonop.com',
  '026c7d28784791a4b31a64eb34d9ab01552055b795919165e6ae886de637632efb': 'LivingRoomOfSatoshi',
  '02816caed43171d3c9854e3b0ab2cf0c42be086ff1bd4005acc2a5f7db70d83774': 'ln.pizza',
  '0254ff808f53b2f8c45e74b70430f336c6c76ba2f4af289f48d6086ae6e60462d3': 'bitrefill thor',
  '02a0bc43557fae6af7be8e3a29fdebda819e439bea9c0f8eb8ed6a0201f3471ca9': 'LightningPeachHub',
  '02d4531a2f2e6e5a9033d37d548cff4834a3898e74c3abe1985b493c42ebbd707d': 'coinfinity.co',
  '02d23fa6794d8fd056c757f3c8f4877782138dafffedc831fc570cab572620dc61': 'paywithmoon.com',
  '025f1456582e70c4c06b61d5c8ed3ce229e6d0db538be337a2dc6d163b0ebc05a5': 'paywithmoon.com',
  '02004c625d622245606a1ea2c1c69cfb4516b703b47945a3647713c05fe4aaeb1c': 'walletofsatoshi',
  '0331f80652fb840239df8dc99205792bba2e559a05469915804c08420230e23c7c': 'LightningPowerUsers.com',
  '033d8656219478701227199cbd6f670335c8d408a92ae88b962c49d4dc0e83e025': 'bfx-lnd0',
  '03021c5f5f57322740e4ee6936452add19dc7ea7ccf90635f95119ab82a62ae268': 'lnd1.bluewallet.io',
  '037cc5f9f1da20ac0d60e83989729a204a33cc2d8e80438969fadf35c1c5f1233b': 'lnd2.bluewallet.io',
};

router.get('/', function (req, res) {
  logger.log('/', [req.id]);
  if (!lightningGetInfo) {
    console.error('lnd failure');
    process.exit(3);
  }
  res.setHeader('Content-Type', 'text/html');
  let html = fs.readFileSync('./templates/index.html').toString('utf8');
  return res.status(200).send(mustache.render(html, Object.assign({}, lightningGetInfo, lightningListChannels)));
});

router.get('/qr', function (req, res) {
  const url = "bluewallet:setlndhuburl?url=" + encodeURIComponent(req.protocol + '://' + req.headers.host);
  var code = qr.image(url, { type: 'png' });
  res.setHeader('Content-type', 'image/png');
  code.pipe(res);
});

router.use(function (req, res) {
  res.status(404).send('404');
});

module.exports = router;

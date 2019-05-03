let important_channels = {
  '02d23fa6794d8fd056c757f3c8f4877782138dafffedc831fc570cab572620dc61': 'paywithmoon.com',
  '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f': 'ACINQ',
  '03abf6f44c355dec0d5aa155bdbdd6e0c8fefe318eff402de65c6eb2e1be55dc3e': 'OpenNode',
  '0242a4ae0c5bef18048fbecf995094b74bfb0f7391418d71ed394784373f41e4f3': 'coingate.com',
  '0232e20e7b68b9b673fb25f48322b151a93186bffe4550045040673797ceca43cf': 'zigzag.io',
  '024a2e265cd66066b78a788ae615acdc84b5b0dec9efac36d7ac87513015eaf6ed': 'Bitrefill.com/lightning',
};
let lightning = require('../lightning');

lightning.listChannels({}, function(err, response) {
  console.log();
  if (err) {
    console.error('lnd failure:', err);
    return;
  }
  let lightningListChannels = response;
  for (let channel of lightningListChannels.channels) {
    if (channel.capacity < 5000000) {
      console.log(
        'lncli closechannel',
        channel.channel_point.replace(':', ' '),
        (!channel.active && '--force') || '',
        '#',
        'low capacity channel',
        channel.capacity / 100000000,
        'btc',
      );
    }
  }

  for (let important of Object.keys(important_channels)) {
    let atLeastOneChannelIsSufficientCapacity = false;
    for (let channel of lightningListChannels.channels) {
      if (channel.remote_pubkey === important && channel.local_balance >= 4000000 && channel.active) {
        atLeastOneChannelIsSufficientCapacity = true;
      }
    }

    if (!atLeastOneChannelIsSufficientCapacity) {
      console.log('lncli  openchannel --node_key ', important, '--local_amt  16777215', '#', important_channels[important]);
    }
  }

  process.exit();
});

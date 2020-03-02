const important_channels = {
  '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f': 'ACINQ',
  '03abf6f44c355dec0d5aa155bdbdd6e0c8fefe318eff402de65c6eb2e1be55dc3e': 'OpenNode',
  '0242a4ae0c5bef18048fbecf995094b74bfb0f7391418d71ed394784373f41e4f3': 'coingate.com',
  '0254ff808f53b2f8c45e74b70430f336c6c76ba2f4af289f48d6086ae6e60462d3': 'bitrefill thor',
  '025f1456582e70c4c06b61d5c8ed3ce229e6d0db538be337a2dc6d163b0ebc05a5': 'paywithmoon.com',
  '0279c22ed7a068d10dc1a38ae66d2d6461e269226c60258c021b1ddcdfe4b00bc4': 'ln1.satoshilabs.com',
  '026c7d28784791a4b31a64eb34d9ab01552055b795919165e6ae886de637632efb': 'LivingRoomOfSatoshi',
  '02816caed43171d3c9854e3b0ab2cf0c42be086ff1bd4005acc2a5f7db70d83774': 'ln.pizza aka fold',
};

const wumbo = {
  '03abf6f44c355dec0d5aa155bdbdd6e0c8fefe318eff402de65c6eb2e1be55dc3e': true, // opennode
  '0254ff808f53b2f8c45e74b70430f336c6c76ba2f4af289f48d6086ae6e60462d3': true, // bitrefill
  '02816caed43171d3c9854e3b0ab2cf0c42be086ff1bd4005acc2a5f7db70d83774': true, // fold
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
    if (0 && channel.capacity < 5000000) {
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
      console.log(
        'lncli  openchannel --node_key',
        important,
        '--local_amt',
        wumbo[important] ? '167772150' : '16777215',
        '#',
        important_channels[important],
      );
    }
  }

  process.exit();
});

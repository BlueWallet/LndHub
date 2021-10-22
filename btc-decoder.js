import bitcoin from 'bitcoinjs-lib';
import classify from 'bitcoinjs-lib/src/classify.js';

const decodeFormat = (tx) => ({
  txid: tx.getId(),
  version: tx.version,
  locktime: tx.locktime,
});

const decodeInput = function (tx) {
  const result = [];
  tx.ins.forEach(function (input, n) {
    result.push({
      txid: input.hash.reverse().toString('hex'),
      n: input.index,
      script: bitcoin.script.toASM(input.script),
      sequence: input.sequence,
    });
  });
  return result;
};

const decodeOutput = function (tx, network) {
  const format = function (out, n, network) {
    const vout = {
      satoshi: out.value,
      value: (1e-8 * out.value).toFixed(8),
      n: n,
      scriptPubKey: {
        asm: bitcoin.script.toASM(out.script),
        hex: out.script.toString('hex'),
        type: classify.output(out.script),
        addresses: [],
      },
    };
    switch (vout.scriptPubKey.type) {
      case 'pubkeyhash':
      case 'scripthash':
        vout.scriptPubKey.addresses.push(bitcoin.address.fromOutputScript(out.script, network));
        break;
      case 'witnesspubkeyhash':
      case 'witnessscripthash':
        const data = bitcoin.script.decompile(out.script)[1];
        vout.scriptPubKey.addresses.push(bitcoin.address.toBech32(data, 0, network.bech32));
        break;
    }
    return vout;
  };

  const result = [];
  tx.outs.forEach(function (out, n) {
    result.push(format(out, n, network));
  });
  return result;
};

class TxDecoder {
  constructor(rawTx, network = bitcoin.networks.bitcoin) {
    this.tx = bitcoin.Transaction.fromHex(rawTx);
    this.format = decodeFormat(this.tx);
    this.inputs = decodeInput(this.tx);
    this.outputs = decodeOutput(this.tx, network);
  }

  decode() {
    const result = {};
    const self = this;
    Object.keys(self.format).forEach(function (key) {
      result[key] = self.format[key];
    });
    result.outputs = self.outputs;
    result.inputs = self.inputs;
    return result;
  }
}

module.exports.decodeRawHex = (rawTx, network = bitcoin.networks.bitcoin) => {
  return new TxDecoder(rawTx, network).decode();
};

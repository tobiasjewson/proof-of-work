const Big = require('big.js');

const { toggleBit, computeHash, save } = require('./lib.js');

let file;
let close = false;
let minHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

function work(data, iterations, from, to) {
  let glitchedData;
  let count = new Big(0);

  function go(i) {
    if (close) {
      process.send({ action: 'close', count });
      return;
    }
    if (i === iterations) {
      i = 0; // eslint-disable-line no-param-reassign
      glitchedData = Buffer.from(data);
    }
    const idx = 8 * (from + Math.floor(Math.random() * (to - from)));
    toggleBit(glitchedData, idx);
    const hash = computeHash(glitchedData);

    if (hash < minHash) {
      process.send({ action: 'update', hash });
      save(Buffer.from(glitchedData), file, hash);
    }
    count = count.plus(1);
    setImmediate(go, i + 1);
  }
  setImmediate(go, iterations);
}

process.on('message', (msg) => {
  switch (msg.action) {
    case 'start':
      file = msg.file; // eslint-disable-line prefer-destructuring
      work(Buffer.from(msg.data), msg.iterations, msg.from, msg.to);
      break;
    case 'set':
      minHash = msg.hash;
      break;
    case 'stop':
      close = true;
      break;
    default:
      throw new Error('Unknown message');
  }
});

process.on('SIGINT', () => {
  close = true;
});


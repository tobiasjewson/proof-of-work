// References
//
// JPG
// https://soulwire.co.uk/smack-my-glitch-up/
// https://snorpey.github.io/jpg-glitch/
// https://www.impulseadventure.com/photo/jpeg-compression.html
// https://www.impulseadventure.com/photo/jpeg-huffman-coding.html
// https://www.w3.org/Graphics/JPEG/itu-t81.pdf
// https://www.w3.org/Graphics/JPEG/jfif3.pdf
// https://en.wikipedia.org/wiki/JPEG#Syntax_and_structure
//
// Bitcoin / Proof of Work
// https://en.bitcoin.it/wiki/Proof_of_work
// https://en.bitcoin.it/wiki/Block_hashing_algorithm
// https://en.bitcoin.it/wiki/Difficulty
// https://bitcoin.org/en/developer-reference#block-headers
// https://bitcoin.org/en/developer-reference#target-nbits

const os = require('os');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const Big = require('big.js');

const {
  modifyMeta, locateEntropyData, toggleBit, save,
} = require('./lib.js');

// eslint-disable-next-line prefer-destructuring
const argv = require('yargs')
  .option('f', {
    alias: 'file',
    demandOption: true,
    describe: 'image path',
    type: 'string',
  })
  .option('i', {
    alias: 'iterations',
    default: 500,
    describe: 'maximum glitch iterations until reset',
    type: 'number',
  })
  .option('n', {
    alias: 'name',
    describe: 'name to associate with the work',
    type: 'string',
  })
  .option('c', {
    alias: 'check',
    default: 'false',
    describe: 'Runs one round of maximum iterations',
    type: 'boolean',
  })
  .argv;

const childSrc = path.join(__dirname, 'worker.js');
const numWorkers = os.cpus().length;
let closed = 0;
const children = [];

let minHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
let count = new Big(0);
const startMillis = Date.now();

function glitch(data, iterations, from, to) {
  for (let i = 0; i < iterations; i += 1) {
    const idx = 8 * (from + Math.floor(Math.random() * (to - from)));
    toggleBit(data, idx);
  }
  const ext = path.extname(argv.f);
  const name = `${path.basename(argv.f, ext)}-glitch`;
  save(data, argv.f, name);
}

function handleMsg(msg) {
  switch (msg.action) {
    case 'update':
      if (msg.hash < minHash) {
        minHash = msg.hash;
        children.forEach(c => c.send({ action: 'set', hash: msg.hash }));
        console.log(minHash);
      }
      break;
    case 'close':
      count = count.plus(msg.count);
      closed += 1;
      if (closed === numWorkers) {
        const endMillis = Date.now();
        console.log(`duration: ${((endMillis - startMillis) / 1000).toFixed(0)}s`);
        console.log(`iterations: ${count}`);
        console.log(`hash: ${minHash}`);
        console.log('Done!');
        process.exit(0);
      }
      break;
    default:
      throw new Error('Unknown message');
  }
}

fs.readFile(argv.f, (err, data) => {
  if (err) {
    throw err;
  }

  const time = (new Date()).toISOString();
  data = modifyMeta(data, argv.n, time); // eslint-disable-line no-param-reassign
  const [from, to] = locateEntropyData(data);

  if (argv.c) {
    glitch(data, argv.i, from, to);
  } else {
    for (let i = 0; i < numWorkers; i += 1) {
      const child = childProcess.fork(childSrc);
      child.send({
        action: 'start',
        file: argv.f,
        data,
        iterations: argv.i,
        from,
        to,
      });
      child.on('message', handleMsg);
      children.push(child);
    }
  }
});

process.on('SIGINT', () => {
  console.log('Stopping...');
});

// Timing
// setTimeout(() => children.forEach((c) => c.send({action: 'stop'})), 60000)

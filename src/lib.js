const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

function flipBytes(hexString) {
  return hexString.match(/.{2}/g).reduce((accumulator, currentValue) => currentValue + accumulator);
}

function computeHash(data) {
  const hash1 = crypto.createHash('sha256');
  hash1.update(data);
  const hash2 = crypto.createHash('sha256');
  hash2.update(hash1.digest());
  return flipBytes(hash2.digest('hex'));
}

function numTo16BitBE(number) {
  return [(number >> 8) & 0xff, number & 0xff];
}

function getBESegmentSize(data, fromIndex) {
  const high = data[fromIndex];
  const low = data[fromIndex + 1];
  return (high << 8) + low;
}


function toggleBit(data, i) {
  const bit = i % 8;
  const byte = Math.floor(i / 8);
  // don't touch padding bytes
  if (data[byte] === 0x00) {
    return;
  }
  data[byte] ^= 2 ** bit; // eslint-disable-line no-param-reassign
  // 0xFF needs to be padded to not be confused with markers
  if (data[byte] === 0xFF) {
    data[byte + 1] = 0x00; // eslint-disable-line no-param-reassign
  }
}

// 0x00 padding in entropy coded data, 0xD0 - 0xD7 restart markers,
// 0xD8 SOI start of image, 0xD9 EOI end of image
const fixedSizeMarkers = new Set([0x00, 0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5,
  0xD6, 0xD7, 0xD8, 0xD9]);

// 0xC0 SOF0 start of frame baseline, 0xC2 SOF2 start of frame progressive,
// 0xC4 DHT huffman tables, 0xDA SOS start of scan, 0xDB DQT quantization table,
// 0xDD DRI restart interval, 0xE0 - 0xEF APP0 - APP15 markers, 0xFE COM comment
const variableSizeMarkers = new Set([0xC0, 0xC2, 0xC4, 0xDA, 0xDB, 0xDD, 0xE0, 0xE1, 0xE2, 0xE3,
  0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xEB, 0xEC, 0xED, 0xEE, 0xEF, 0xFE]);

function indexOfMarker(data, marker, fromIndex = 0) {
  for (let i = fromIndex; i < data.length - 1; i += 1) {
    if (data[i] === 0xFF) {
      const byte = data[i + 1];
      if (byte === marker) {
        return i;
      } else if (fixedSizeMarkers.has(byte)) {
        i += 1;
      } else if (variableSizeMarkers.has(byte)) {
        const size = getBESegmentSize(data, i + 2);
        i += size + 1; // skip marker and segment
      }
    }
  }
  return null;
}

// This pulls out all data from the end of the first SOS marker to the EOI
// Only intended to work on baseline jpgs with a single scan.
// If used on a progreessive jpg this will include several scans including
// their respective headers which might break once modified.
function locateEntropyData(data) {
  const sos = indexOfMarker(data, 0xDA);
  if (sos == null) {
    throw new Error('faild to find SOS marker');
  }
  const from = sos + getBESegmentSize(data, sos + 2) + 2;
  const to = indexOfMarker(data, 0xD9, from) - 2;
  if (Number.isNaN(to)) {
    throw new Error('faild to find EOI marker');
  }
  return [from, to];
}

function modifyMeta(data, name = ' ', time = ' ') {
  const jfifHeader = Buffer.from([
    0xFF, 0xD8, // SOI
    0xFF, 0xE0, // APP0
    0x00, 0x10, // header size: 16
    0x4A, 0x46, 0x49, 0x46, 0x00, // JFIF
    0x01, 0x02, // version: 1.02
    0x01, // DPI
    0x00, 0x48, 0x00, 0x48, // 72 x 72
    0x00, 0x00, // thumbnail: 0 x 0
  ]);

  const comSegment = Buffer.from(`MMSS${name}, ${time}`);
  comSegment[0] = 0xFF;
  comSegment[1] = 0xFE;
  const [hi, lo] = numTo16BitBE(comSegment.length - 2);
  comSegment[2] = hi;
  comSegment[3] = lo;

  const imageDataIdx = indexOfMarker(data, 0xDB);
  if (imageDataIdx == null) {
    throw new Error('failed to find DQT marker');
  }
  const imageData = data.slice(imageDataIdx);

  return Buffer.concat([jfifHeader, comSegment, imageData]);
}

function save(data, file, name) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const savePath = path.join(dir, name + ext);

  fs.writeFile(savePath, data, (err) => {
    if (err) {
      throw err;
    }
  });
}

module.exports = {
  modifyMeta,
  locateEntropyData,
  toggleBit,
  computeHash,
  save,
};

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = path.join(ROOT, 'img', 'game', 'backgrounds', 'block-topia-metaverse-portal.jpg');

assert.ok(fs.existsSync(ASSET), `missing portal artwork: ${ASSET}`);

const stats = fs.statSync(ASSET);
assert.ok(stats.size >= 100 * 1024, `portal artwork is too small: ${stats.size} bytes`);

function readUint16BE(buf, offset) {
  return (buf[offset] << 8) | buf[offset + 1];
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('not a JPEG (missing SOI marker)');
  }

  let offset = 2;
  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) break;

    const marker = buffer[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xda) break;
    if (offset + 1 >= buffer.length) throw new Error('truncated JPEG marker length');

    const length = readUint16BE(buffer, offset);
    if (length < 2) throw new Error(`invalid JPEG segment length at offset ${offset - 1}`);
    const segmentStart = offset + 2;
    const segmentEnd = offset + length;
    if (segmentEnd > buffer.length) throw new Error('truncated JPEG segment');

    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (segmentStart + 5 >= segmentEnd) throw new Error('truncated JPEG SOF segment');
      const precision = buffer[segmentStart];
      const height = readUint16BE(buffer, segmentStart + 1);
      const width = readUint16BE(buffer, segmentStart + 3);
      if (precision !== 8 && precision !== 12 && precision !== 16) {
        throw new Error(`unsupported JPEG precision ${precision}`);
      }
      return { width, height };
    }

    offset = segmentEnd;
  }

  throw new Error('could not find JPEG dimensions');
}

const buffer = fs.readFileSync(ASSET);
const { width, height } = parseJpegDimensions(buffer);
assert.ok(width >= 1600, `portal artwork width too small: ${width}`);
assert.ok(height >= 900, `portal artwork height too small: ${height}`);
assert.ok(!(width === 1 && height === 1), 'portal artwork must not be 1x1');
assert.ok(
  buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9,
  'portal artwork must decode successfully and end with JPEG EOI marker',
);

const referencedPaths = [
  'img/game/backgrounds/block-topia-metaverse-portal.jpg',
];
for (const rel of referencedPaths) {
  assert.ok(fs.existsSync(path.join(ROOT, rel)), `CSS/image reference target missing: ${rel}`);
}

console.log(
  `PASS portal artwork: ${width}x${height}, ${stats.size} bytes`,
);

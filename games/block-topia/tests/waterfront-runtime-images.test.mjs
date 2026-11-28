import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'waterfront');
const atlases = path.join(root, 'assets', 'atlases');

const compact = ['bots', 'cargo', 'factions', 'hk-night', 'street-detail', 'terrain', 'trees'];
const detailed = ['bots-detail', 'factions-detail', 'zcash-fortress-overhead', 'wax-bee-overhead'];

async function pixels(file) {
  return sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function alpha(file) {
  return sharp(file).ensureAlpha().extractChannel(3).raw().toBuffer();
}

test('Waterfront runtime atlases preserve master dimensions, transparency and frame pixels', async () => {
  for (const name of compact) {
    const master = path.join(atlases, name + '.png');
    const runtime = path.join(atlases, name + '-runtime.webp');
    const [masterStat, runtimeStat, masterPixels, runtimePixels] = await Promise.all([
      stat(master), stat(runtime), pixels(master), pixels(runtime),
    ]);
    assert.ok(runtimeStat.size < masterStat.size, `${name} runtime transfer must be smaller`);
    assert.deepEqual(runtimePixels.info, masterPixels.info, `${name} dimensions and channels changed`);
    let visibleDifferences = 0;
    for (let offset = 0; offset < masterPixels.data.length; offset += 4) {
      if (runtimePixels.data[offset + 3] !== masterPixels.data[offset + 3]) visibleDifferences++;
      if (!masterPixels.data[offset + 3]) continue;
      for (let channel = 0; channel < 3; channel++) {
        if (runtimePixels.data[offset + channel] !== masterPixels.data[offset + channel]) visibleDifferences++;
      }
    }
    assert.equal(visibleDifferences, 0, `${name} lossless visible pixels changed`);
  }
});

test('Waterfront detailed runtime atlases preserve geometry and alpha while reducing transfer size', async () => {
  for (const name of detailed) {
    const master = path.join(atlases, name + '.webp');
    const runtime = path.join(atlases, name + '-runtime.webp');
    const [masterStat, runtimeStat, masterMetadata, runtimeMetadata, masterAlpha, runtimeAlpha] = await Promise.all([
      stat(master), stat(runtime), sharp(master).metadata(), sharp(runtime).metadata(), alpha(master), alpha(runtime),
    ]);
    assert.ok(runtimeStat.size <= masterStat.size * 0.8, `${name} must save at least 20%`);
    assert.equal(runtimeMetadata.width, masterMetadata.width, `${name} width changed`);
    assert.equal(runtimeMetadata.height, masterMetadata.height, `${name} height changed`);
    assert.equal(runtimeMetadata.hasAlpha, true, `${name} lost transparency`);
    assert.equal(Buffer.compare(runtimeAlpha, masterAlpha), 0, `${name} alpha changed`);
  }
});

test('Waterfront and its shared views wire runtime derivatives, while masters remain in the repository', async () => {
  const [harbor, entry, moon, comparison, scenes] = await Promise.all([
    readFile(path.join(root, 'harbor-art.js'), 'utf8'),
    readFile(path.join(root, 'entry.js'), 'utf8'),
    readFile(path.join(root, '..', 'hodl-wars-lores', 'game.js'), 'utf8'),
    readFile(path.join(root, '..', 'test-builds', 'compare', 'comparison.mjs'), 'utf8'),
    readFile(path.join(root, '..', 'test-builds', 'compare', 'scenes.mjs'), 'utf8'),
  ]);
  for (const name of detailed) assert.match(harbor, new RegExp(name + '-runtime\\.webp'));
  assert.match(harbor, /group \+ "-runtime\.webp\?v=1"/);
  assert.match(entry, /harbor-art\.js\?v=81-west-meadow-bench/);
  assert.match(moon, /factions-runtime\.webp\?v=1/);
  assert.match(moon, /factions-detail-runtime\.webp\?v=1/);
  assert.match(comparison, /hk-night-runtime\.webp\?v=1/);
  assert.match(comparison, /factions-detail-runtime\.webp\?v=1/);
  assert.match(scenes, /harbor-art\.js\?v=81-west-meadow-bench/);
});

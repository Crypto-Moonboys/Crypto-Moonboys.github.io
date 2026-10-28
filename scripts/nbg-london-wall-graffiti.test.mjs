import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The 17 graffiti uploads in commit 1251057 (28 Oct 2026). The older
// gameplay sprites in the same objects folder must NOT be pasted on the wall.
const graffitiNames = [
  '1aa2bunny.png', 'ddbuster.png', 'dgdskull.png', 'dgrun.png',
  'erger.png', 'fgdfgallcity.png', 'fghgh.png', 'killakelawall.png',
  'retre.png', 'retreth.png', 'rtyrt.png', 'rytr.png',
  'small.fgfgcrown.png', 'small.retert.png', 'small.ttttrr5.png',
  'tagordie.png', 'yutyh.png',
];
const gameplayNames = new Set([
  '2300-spritesheet.png', 'BRICK1.png', 'CRATE1.png',
  'Pixel Flame Jet Burst-spritesheet.png', 'RANDOMBOX.png',
  'ROCK1.png', 'SPEEDBOX.png', 'STARBOX.png',
  'bber-sdgd-v1.png', 'bber-walk-v2.png',
]);
const root = resolve('game/assets');
const files = readdirSync(join(root, 'objects'))
  .filter(name => name.toLowerCase().endsWith('.png') && !gameplayNames.has(name))
  .sort();
assert.deepEqual(files, graffitiNames.slice().sort(),
  'every new graffiti PNG must be registered; gameplay sprites are not wall art');

const manifest = JSON.parse(readFileSync(join(root, 'asset-manifest.json'), 'utf8'));
const entries = manifest.world.wallGraffiti;
assert.equal(entries.length, 17, 'manifest must register all 17 new graffiti images');
assert.deepEqual(entries.map(a => a.path.replace(/^objects\//, '')).sort(),
  graffitiNames.slice().sort(), 'each original PNG should appear exactly once in the art pool');

for (const { path, width, height } of entries) {
  assert.match(path, /^objects\/[A-Za-z0-9._-]+\.png$/);
  const filename = join(root, path);
  assert.equal(statSync(filename).isFile(), true, 'graffiti source file must exist: ' + path);
  const header = readFileSync(filename).subarray(0, 26);
  assert.equal(header.subarray(1, 4).toString('ascii'), 'PNG', 'graffiti asset is a PNG: ' + path);
  assert.equal(header.readUInt32BE(16), width, 'PNG width must match metadata: ' + path);
  assert.equal(header.readUInt32BE(20), height, 'PNG height must match metadata: ' + path);
  assert.equal(header[25], 6, 'graffiti art should retain RGBA transparency: ' + path);
}

assert.equal(manifest.world.width, 22000);
assert.equal(manifest.world.layers[2], 'art-production/wall-one.png',
  'keep the approved existing wall behind graffiti decals');
assert.equal(manifest.objects.speedBox, 'objects/SPEEDBOX.png',
  'existing collectibles must retain their original asset roles');

const runtime = readFileSync('game/nbg-level1.js', 'utf8');
const decorativeGenerator = runtime.slice(
  runtime.indexOf('function configureWallGraffiti('),
  runtime.indexOf('function prefetchWallGraffiti(')
);
assert.ok(decorativeGenerator.startsWith('function configureWallGraffiti('));
assert.match(decorativeGenerator, /0x4e424747/);
assert.match(decorativeGenerator, /Math\.imul\(seed, 1664525\)/);
assert.doesNotMatch(decorativeGenerator, /nextRunRandom|runRandomState|Math\.random/,
  'graffiti must not consume the shared authoritative gameplay randomness');
assert.match(runtime, /WALL_GRAFFITI_REPEATS_PER_IMAGE = 6/);
assert.match(runtime, /WALL_GRAFFITI_PARALLAX = 0\.58/);
assert.match(runtime, /wallGraffitiPlacements\.push\(/);
assert.match(runtime, /wallGraffitiLoadState\[index\] = 'loading'/);
assert.match(runtime, /if \(wallGraffitiLoadState\[index\]\) continue/);
assert.match(runtime, /function drawWallGraffiti\(/);
assert.match(runtime, /ctx\.rect\(0, WALL_GRAFFITI_Y, WIDTH, WALL_GRAFFITI_HEIGHT\)/);
assert.match(runtime, /drawImageLayer\(images\.wall, 0\.58, 154, 88, '#2d2033'\);\s*drawWallGraffiti\(\);\s*drawStreetLayer\(\);/,
  'art must be painted onto the wall behind the road, platforms and enemies');
assert.match(runtime, /configureWallGraffiti\(assetManifest\.world && assetManifest\.world\.wallGraffiti\)/);
assert.match(runtime, /get wallGraffitiLoadedCount\(\)/);
assert.doesNotMatch(runtime, /requiredAssets\s*=\s*requiredAssets\.concat\(wallGraffiti/,
  'optional wall art must never block starting the game');
assert.match(runtime, /var COURSE_LAYOUT_VERSION = 8/,
  'approved course scoring physics/version must stay exactly at v8');
assert.match(runtime, /var MAX_SPEED = 2\.4/,
  'approved player movement speed must remain unchanged');

console.log('[PASS] NBG all 17 original graffiti images registered, sizes verified, visual-only wall layer');

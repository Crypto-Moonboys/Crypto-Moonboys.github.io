import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

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
assert.match(runtime, /ctx\.rect\(0, WALL_GRAFFITI_BRICK_TOP, WIDTH,\s*WALL_GRAFFITI_BRICK_BOTTOM - WALL_GRAFFITI_BRICK_TOP\)/);
assert.match(runtime, /var WALL_GRAFFITI_BRICK_TOP = 201;/);
assert.match(runtime, /var WALL_GRAFFITI_BRICK_BOTTOM = 239;/);
assert.match(runtime, /var WALL_GRAFFITI_MIN_HEIGHT = 19;/);
assert.match(runtime, /var WALL_GRAFFITI_MAX_HEIGHT = 35;/);
assert.match(runtime, /var WALL_GRAFFITI_MAX_WIDTH = 112;/);
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

// Exercise the real generator, not a duplicate algorithm, using a headless
// environment with the same constants, independent from game-state RNG.
const constants = [
  'WORLD_WIDTH', 'WALL_GRAFFITI_PARALLAX', 'WALL_GRAFFITI_BRICK_TOP',
  'WALL_GRAFFITI_BRICK_BOTTOM', 'WALL_GRAFFITI_REPEATS_PER_IMAGE',
  'WALL_GRAFFITI_MIN_HEIGHT', 'WALL_GRAFFITI_MAX_HEIGHT',
  'WALL_GRAFFITI_MAX_WIDTH',
];
const definitions = constants.map(name => {
  const definition = runtime.match(new RegExp('var ' + name + ' = ([0-9.]+);'));
  assert.ok(definition, 'required render-only wall constant: ' + name);
  return 'var ' + name + ' = ' + definition[1] + ';';
}).join('\n');
const generatorHarness = [
  definitions,
  'var wallGraffitiArt = [], wallGraffitiPlacements = [], wallGraffitiImages = {}, wallGraffitiLoadState = {}, wallGraffitiPrefetchCameraX = -Infinity;',
  'function resolveAssetPath(path) { return "/game/assets/" + path; }',
  decorativeGenerator,
  'configureWallGraffiti(entries);',
  '({art: wallGraffitiArt, placements: wallGraffitiPlacements})',
].join('\n');
function generate() {
  return runInNewContext(generatorHarness, { entries });
}
const first = generate();
const again = generate();
assert.equal(JSON.stringify(first.placements), JSON.stringify(again.placements),
  'graffiti layouts must stay deterministic on every game reset and device');
assert.equal(first.art.length, 17);
assert.equal(first.placements.length, 102, 'all 17 images appear six times');
const uses = Array(first.art.length).fill(0);
const uniqueSizes = new Set();
for (const p of first.placements) {
  assert.ok(p.artIndex >= 0 && p.artIndex < first.art.length);
  uses[p.artIndex] += 1;
  assert.ok(p.y >= 201 && p.y + p.h <= 239,
    'graffiti cannot extend above the BRICKS into skyline/grass or below onto road');
  assert.ok(p.h > 0 && p.h <= 35 && p.w > 0 && p.w <= 112,
    'art must fit brick height and retain a readable, proportionate size');
  const source = first.art[p.artIndex];
  assert.ok(Math.abs(p.w / p.h - source.width / source.height) < 0.05,
    'graffiti must retain its source image aspect ratio');
  uniqueSizes.add(p.w + 'x' + p.h);
}
assert.ok(uses.every(n => n === 6), 'each image must appear six times');
assert.ok(uniqueSizes.size >= 45, 'sizes should vary visibly across the course');
assert.ok(first.placements[0].x < 200 && first.placements.at(-1).x > 12000,
  'paint must reach from the start to the end of the scrolling wall');

console.log('[PASS] NBG all 17 graffiti images fit ONLY masonry, 102 deterministic varied placements, unaffected gameplay');

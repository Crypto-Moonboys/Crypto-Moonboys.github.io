import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = JSON.parse(read('game/assets/asset-manifest.json'));
const player = JSON.parse(read('game/assets/player/nbg-runner-animation-manifest.json'));
const runtime = read('game/nbg-level1.js');
const boards = read('game/nbg-london-leaderboards.js');
const route = read('games/nbg-london-run/index.html');
const bytes = relative => fs.statSync(path.join(root, relative)).size;

const classicBackgrounds = [1, 2, 3].map(index =>
  `game/assets/world/nbg-classic/LONDON BACKGROUND${index}.png`);
async function decodedHash(file) {
  const pixels = await sharp(file).ensureAlpha().raw().toBuffer();
  // Lossless WebP may canonicalize invisible RGB under fully transparent
  // pixels. Those bytes cannot affect rendering, so normalize them first.
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] !== 0) continue;
    pixels[index] = 0;
    pixels[index + 1] = 0;
    pixels[index + 2] = 0;
  }
  return createHash('sha256').update(pixels).digest('hex');
}
const backgroundHash = await decodedHash(classicBackgrounds[0]);
assert.equal(await decodedHash(classicBackgrounds[1]), backgroundHash,
  'classic skyline master 2 is decoded-pixel-identical to master 1');
assert.equal(await decodedHash(classicBackgrounds[2]), backgroundHash,
  'classic skyline master 3 is decoded-pixel-identical to master 1');
const backgroundRuntime = 'game/assets/world/nbg-classic/LONDON BACKGROUND1-runtime.webp';
assert.equal(await decodedHash(backgroundRuntime), backgroundHash,
  'lossless shared classic skyline runtime must preserve every RGBA pixel');
assert.equal((runtime.match(/world\/nbg-classic\/LONDON BACKGROUND1-runtime\.webp/g) || []).length, 3,
  'all three classic skyline slots must reuse one runtime image URL');
assert.match(runtime, /var imageLoadCache = new Map\(\)/);
assert.match(runtime, /if \(imageLoadCache\.has\(src\)\) return imageLoadCache\.get\(src\)/);

const playerRuntimePaths = Object.values(player.animations).map(animation =>
  `game/assets/${animation.spriteSheet}`);
for (const runtimePath of playerRuntimePaths) {
  assert.match(runtimePath, /(?:-runtime|-prepared-runtime)\.webp$/);
  assert.ok(fs.existsSync(runtimePath), `missing ranked player runtime: ${runtimePath}`);
}
for (const key of ['crouchLeft', 'crouchRight']) {
  assert.equal(player.animations[key].frameStart || 0, 0,
    `${key} must omit the unused first source row`);
  assert.equal(player.animations[key].preserveSourceAlpha, true,
    `${key} must skip browser-side flood-fill processing`);
  const metadata = await sharp(`game/assets/${player.animations[key].spriteSheet}`).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1280, 1024]);
}
assert.equal(player.animations.spray.preserveSourceAlpha, true,
  'prepared spray WebP must skip browser-side full-sheet matte removal');

for (const key of ['londonRatBladeFlurry', 'londonRatViperPounce']) {
  const runtimePath = `game/assets/${manifest.enemies[key]}`;
  const masterPath = runtimePath.replace(/-runtime\.webp$/, '.png');
  const [runtimeMeta, masterMeta] = await Promise.all([
    sharp(runtimePath).metadata(), sharp(masterPath).metadata()
  ]);
  assert.deepEqual([masterMeta.width, masterMeta.height], [2560, 2560]);
  assert.deepEqual([runtimeMeta.width, runtimeMeta.height], [1280, 1280]);
  assert.ok(bytes(runtimePath) < bytes(masterPath));
  assert.ok(runtimeMeta.width / 5 >= 50 * 1.9 * 2 &&
    runtimeMeta.height / 5 >= 60 * 1.9 * 2,
  `${key} retains more source pixels than its largest HD canvas draw`);
}

for (const [group, key, expectedSize, minimumCell] of [
  ['objects', 'xpCoin', 640, 100],
  ['enemies', 'londonRat', 640, 120],
  ['enemies', 'parachuteRatA', 640, 128],
  ['enemies', 'parachuteRatB', 640, 128],
  ['enemies', 'parachuteRatC', 640, 128],
  ['enemies', 'turquoiseRatWalk', 640, 120],
  ['enemies', 'turquoiseRatKick', 640, 120],
  ['enemies', 'turquoiseRatPunch', 640, 120],
  ['enemies', 'graffitiBot', 800, 140],
  ['enemies', 'graffitiBotKick', 800, 140],
  ['enemies', 'graffitiBotHurt', 800, 140]
]) {
  const runtimePath = `game/assets/${manifest[group][key]}`;
  const masterPath = runtimePath.replace(/-runtime\.webp$/, '.png');
  const [runtimeMeta, masterMeta] = await Promise.all([
    sharp(runtimePath).metadata(), sharp(masterPath).metadata()
  ]);
  assert.deepEqual([masterMeta.width, masterMeta.height], [1280, 1280]);
  assert.deepEqual([runtimeMeta.width, runtimeMeta.height], [expectedSize, expectedSize]);
  assert.ok(runtimeMeta.width / 5 >= minimumCell,
    `${key} runtime cell must cover its maximum physical-canvas draw`);
}

const beforePaths = [
  'game/assets/world/nbg-classic/clouds.jpg', ...classicBackgrounds,
  'game/assets/art-production/wall-one.png',
  ...Object.values(manifest.objects).filter(value => /\.(?:png|jpe?g|webp)$/i.test(value))
    .map(value => `game/assets/${value}`),
  ...Object.values(manifest.enemies).map(value => `game/assets/${value}`),
  'game/assets/player/animations/idle.png',
  'game/assets/player/animations/run.png',
  'game/assets/player/animations/NBG Runner Final-crouchr.png',
  'game/assets/player/animations/NBG Runner Final-sneaking_left.png',
  'game/assets/player/animations/jump.png',
  'game/assets/player/animations/NBG Runner Final-backflip.png',
  'game/assets/player/animations/fall.png',
  'game/assets/player/NBG Runner Final-spray.png',
  'game/assets/player/animations/hurt.png',
  'game/assets/player/animations/victory.png'
];
const afterPaths = [
  'game/assets/world/nbg-classic/clouds-runtime.webp', backgroundRuntime,
  'game/assets/art-production/wall-one-runtime.webp',
  ...Object.values(manifest.objects).filter(value => /\.(?:png|jpe?g|webp)$/i.test(value))
    .map(value => `game/assets/${value}`),
  ...Object.values(manifest.enemies).map(value => `game/assets/${value}`),
  ...playerRuntimePaths
];
const uniqueBytes = paths => [...new Set(paths)].reduce((total, file) => total + bytes(file), 0);
const startupSaved = uniqueBytes(beforePaths) - uniqueBytes(afterPaths);
assert.ok(startupSaved > 3.3 * 1024 * 1024,
  'ranked runtime must remove more than 3.3 MiB from unique startup image transfer');
assert.ok(uniqueBytes(afterPaths) < 4.2 * 1024 * 1024,
  'ranked critical runtime image set must stay below 4.2 MiB');
let decodedRuntimeBytes = 0;
for (const file of new Set([
  ...afterPaths, 'img/CRYPTO-MOONBOYS-BITCOIN-LOGO-runtime.webp'
])) {
  const metadata = await sharp(file).metadata();
  decodedRuntimeBytes += metadata.width * metadata.height * 4;
}
assert.ok(decodedRuntimeBytes < 73 * 1024 * 1024,
  'unique ranked runtime bitmap allocation must stay below 73 MiB decoded');

assert.match(runtime, /nbg-level-assets-ready/);
assert.match(boards, /function scheduleInitialBoards\(\)/);
assert.match(boards, /addEventListener\('nbg-level-assets-ready', loadInitialBoards/);
assert.match(route, /CRYPTO-MOONBOYS-BITCOIN-LOGO-runtime\.webp/);
assert.match(route,
  /nbg-level1\.js\?v=classic-scenery-20261126-air-destruction-ranked-runtime-v12/);
assert.match(route, /if \(window\.NBGLevel1State\?\.assetsLoaded\) loadModifierPanel\(\)/);
assert.match(runtime, /if \(lastHudValues\.xp !== xp\)/);
assert.match(runtime, /if \(lastHudValues\.state !== stateText\)/);
assert.match(runtime, /collectedCoinCount \+= 1/);
assert.doesNotMatch(runtime, /coins\.filter\(function \(coin\) \{ return coin\.taken; \}\)/);
assert.match(runtime, /var checkpointVisible =/);

console.log('[PASS] NBG London ranked runtime: >3.3 MiB startup transfer removed, duplicate skyline decode reused, player cleanup prebuilt, HD attack resolution retained');

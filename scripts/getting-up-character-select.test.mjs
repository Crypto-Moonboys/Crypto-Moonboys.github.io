import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('games/getting-up/volcanic-punk-player-animation-manifest.json', 'utf8'));
const birdManifest = JSON.parse(fs.readFileSync('games/getting-up/graffpunks-player-animation-manifest.json', 'utf8'));
const assetManifest = JSON.parse(fs.readFileSync('game/assets/asset-manifest.json', 'utf8'));
const page = fs.readFileSync('games/getting-up/index.html', 'utf8');
const runtime = fs.readFileSync('game/nbg-level1.js', 'utf8');
const selector = fs.readFileSync('games/getting-up/character-select.js', 'utf8');

assert.equal(manifest.characterId, 'volcanic-punk');
for (const state of ['idle','runRight','runLeft','crouchRight','crouchLeft','jumpRight','jumpLeft',
  'backflipRight','backflipLeft','fallRight','fallLeft','sprayRight','sprayLeft','hurt','victory',
  'deathRight','deathLeft','rubbleRight','rubbleLeft','volcano','coinVolcano',
  'thirdSpinBurst1','thirdSpinBurst2','airDeathFall','airDeathExplode']) {
  assert.ok(manifest.animations[state], 'missing volcanic state: ' + state);
  const asset = manifest.animations[state].spriteSheet.replace(/^\//, '');
  assert.ok(fs.existsSync(asset), 'missing volcanic asset: ' + asset);
  assert.equal(manifest.animations[state].sourceFrameWidth, 512);
  assert.equal(manifest.animations[state].sourceFrameHeight, 512);
  assert.equal(manifest.animations[state].columns, 3);
  assert.equal(manifest.animations[state].frames, 6);
}

function collectRasterRefs(value, base, output = new Map()) {
  if (typeof value === 'string' && /\.(?:png|jpe?g|webp)$/i.test(value)) {
    const runtimePath = value.startsWith('/') ? value.slice(1) : base + '/' + value;
    output.set(runtimePath, value);
  } else if (Array.isArray(value)) {
    value.forEach(item => collectRasterRefs(item, base, output));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectRasterRefs(item, base, output));
  }
  return output;
}

const runtimeRasterRefs = collectRasterRefs(assetManifest, 'game/assets');
collectRasterRefs(birdManifest, 'games/getting-up', runtimeRasterRefs);
collectRasterRefs(manifest, 'games/getting-up', runtimeRasterRefs);
assert.ok(runtimeRasterRefs.size >= 100, 'Getting Up runtime image audit must cover the full game manifest');
for (const runtimePath of runtimeRasterRefs.keys()) {
  assert.match(runtimePath, /\.webp$/i, 'runtime raster must use WebP: ' + runtimePath);
  assert.ok(fs.existsSync(runtimePath), 'runtime WebP must exist: ' + runtimePath);
  if (!/-runtime\.webp$/i.test(runtimePath)) continue;
  const sourceStem = runtimePath.replace(/-runtime\.webp$/i, '');
  const masterPath = ['.png', '.jpg', '.jpeg']
    .map(extension => sourceStem + extension)
    .find(candidate => fs.existsSync(candidate));
  assert.ok(masterPath, 'runtime WebP must retain its PNG/JPG master: ' + runtimePath);
  assert.ok(fs.statSync(runtimePath).size < fs.statSync(masterPath).size,
    'runtime WebP must be smaller than its retained master: ' + runtimePath);
}
assert.match(runtime, /world\/TWIYGR-spritesheet-runtime\.webp/);
assert.ok(fs.existsSync('game/assets/world/TWIYGR-spritesheet-runtime.webp'));
assert.deepEqual(manifest.deathSequence, ['death','rubble','volcano','coinVolcano']);
for (const state of ['death','deathRight','deathLeft','coinVolcano']) assert.equal(manifest.animations[state].renderOffsetY, 12);
for (const state of ['rubble','rubbleRight','rubbleLeft','volcano']) assert.equal(manifest.animations[state].renderOffsetY, 14);
for (const state of ['death','deathRight','deathLeft'])
  assert.deepEqual(manifest.animations[state].frameOffsetY, [0,0,0,8,8,8]);
for (const state of ['rubble','rubbleRight','rubbleLeft'])
  assert.deepEqual(manifest.animations[state].frameOffsetY, [8,8,8,8,8,8]);
assert.match(page, /id="fighter-select"/);
assert.match(page, /character-select\.js/);
assert.match(selector, /volcanic-punk-player-animation-manifest\.json/);
assert.match(selector, /nbg-game-over/);
assert.match(selector, /diedSinceSelection/);
assert.match(selector, /setChooserVisible\(false\)/);
assert.match(fs.readFileSync('games/getting-up/character-select.css', 'utf8'), /\.fighter-select\[hidden\]/);
assert.match(runtime, /deathAnimationActive/);
assert.match(runtime, /directionalName/);
assert.match(runtime, /playerCharacterId === 'volcanic-punk'/);
assert.match(runtime, /setPlayerAnimation\('thirdSpinBurst1'\)/);
assert.match(runtime, /setPlayerAnimation\('thirdSpinBurst2'\)/);
assert.match(runtime, /spawnThirdSpinCoins/);
assert.match(runtime, /updateBurstCoins/);
assert.match(runtime, /drawBurstCoins/);
assert.match(runtime, /BURST_COIN_MAX_BOUNCES/);
assert.match(runtime, /THIRD_SPIN_BLAST_RADIUS_RATIO = 0\.39/);
assert.match(runtime, /function circleOverlapsRect/);
assert.match(runtime, /function getThirdSpinBlastCircle/);
assert.match(runtime, /function playerThirdSpinHits/);
assert.match(runtime, /Math\.min\(frameMeta\.renderWidth, frameMeta\.renderHeight\)[\s\S]{0,100}THIRD_SPIN_BLAST_RADIUS_RATIO/);
assert.match(runtime, /playerThirdSpinHits\(rat\)/);
assert.match(runtime, /playerThirdSpinHits\(enemy\)/);
assert.equal((runtime.match(/third-spin-blast/g) || []).length, 2, 'both airborne and landed enemies use the blast defeat reason');
assert.match(runtime, /coin\.settled = true/);
assert.match(runtime, /if \(thirdSpinActive\)[\s\S]{0,500}else if \(sprayTimer > 0\)[\s\S]{0,500}else if \(player\.invuln > 0\)/);
assert.match(page, /nbg-level1\.js\?v=getting-up-20261126-gauntlet-hooks-v14/);
// The Gauntlet course must load before the shared runtime and only on this unranked page.
assert.match(page, /data-nbg-mode="unranked" data-nbg-course="getting-up-gauntlet"/);
assert.ok(page.indexOf('getting-up-gauntlet-course.js') < page.indexOf('/game/nbg-level1.js'), 'course script loads first');
assert.match(runtime, /var courseId = unranked && canvas\.dataset && canvas\.dataset\.nbgCourse \|\| '';/);
assert.match(runtime, /v=20261126-air-destruction-ranked-runtime-v12/);
assert.match(runtime, /DEFERRED_TRAIN_ASSET_GROUPS/);
assert.match(runtime, /deferredAssetGroups = unranked \?/);
assert.match(runtime, /image\.fetchPriority = 'low'/);
assert.match(runtime, /requestIdleCallback/);
assert.match(runtime, /startDeferredAssetLoad\(\)/);
assert.match(runtime, /nbg-deferred-assets-ready/);
assert.match(runtime, /get deferredAssetsComplete\(\)/);
assert.match(runtime, /startDeferredAssetLoad\(1\)/);
assert.match(runtime, /function startSimulation\(\) \{[\s\S]{0,300}startDeferredAssetLoad\(\)/);
assert.match(runtime, /if \(classicScenery\) return finishInit\(\)/,
  'ranked classic London must retain its authoritative eager startup path');
const deferredTrainBlock = runtime.match(/var DEFERRED_TRAIN_ASSET_GROUPS = \[([\s\S]*?)\n  \];/)?.[1];
assert.ok(deferredTrainBlock, 'deferred train groups must be declared');
const deferredTrainKeys = [...deferredTrainBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
const manifestTrainKeys = Object.keys(assetManifest.trains);
assert.deepEqual([...deferredTrainKeys].sort(), [...manifestTrainKeys].sort(),
  'every train must be staged exactly once');
assert.equal(new Set(deferredTrainKeys).size, deferredTrainKeys.length,
  'deferred train groups must not request the same image twice');
const deferredTrainBytes = Object.values(assetManifest.trains).reduce((total, asset) => {
  const runtimePath = asset.startsWith('/') ? asset.slice(1) : 'game/assets/' + asset;
  return total + fs.statSync(runtimePath).size;
}, 0);
assert.ok(deferredTrainBytes > 3 * 1024 * 1024,
  'staged startup must remove more than 3 MiB from the critical image gate');
assert.match(runtime, /playerCharacterId === 'volcanic-punk' &&\s*\n\s*!isOnVolcanicDeathSurface\(\)/);
assert.match(runtime, /VOLCANIC_DEATH_MIN_WALL_WIDTH/);
assert.match(runtime, /getVolcanicDeathSurfaces/);
assert.match(runtime, /isOnVolcanicDeathSurface/);
assert.match(runtime, /function updateDeathFall\(dt\)[\s\S]{0,1200}var solids = getVolcanicDeathSurfaces\(\)/);
assert.match(runtime, /frameOffsetY/);
assert.match(runtime, /beginDeathFall/);
assert.match(runtime, /playerAnimations\.airDeathFall \? 'airDeathFall' : 'fall'/);
assert.match(runtime, /AIR_DEATH_FALL_MIN_FRAME_MS/);
assert.match(runtime, /AIR_DEATH_FALL_TIME_SHARE/);
assert.match(runtime, /calculateAirDeathFallFrameMs/);
assert.match(runtime, /estimateAirDeathFallMs/);
assert.match(runtime, /beginAirDeathExplosion/);
assert.match(runtime, /finishAirDeathExplosion/);
assert.match(runtime, /deathFallPhase === 'fall'/);
assert.match(runtime, /get deathFallFrameMs\(\)/);
assert.match(runtime, /deathFallPhase === 'explode'/);
assert.match(runtime, /advancePlayerAnimation\(dt, false,[\s\S]{0,100}deathFallFrameMs/);
assert.match(runtime, /setPlayerAnimation\('airDeathExplode'\)/);
assert.match(runtime, /updateDeathFall/);
assert.match(runtime, /findSafeDeathLandingX/);
assert.match(runtime, /deathLandingHazardAt/);
assert.match(runtime, /deathFallActive \|\| deathAnimationActive/);
console.log('[PASS] Getting Up selectable character contract');

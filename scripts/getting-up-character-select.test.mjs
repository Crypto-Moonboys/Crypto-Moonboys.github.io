import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('games/getting-up/volcanic-punk-player-animation-manifest.json', 'utf8'));
const page = fs.readFileSync('games/getting-up/index.html', 'utf8');
const runtime = fs.readFileSync('game/nbg-level1.js', 'utf8');
const selector = fs.readFileSync('games/getting-up/character-select.js', 'utf8');

assert.equal(manifest.characterId, 'volcanic-punk');
for (const state of ['idle','runRight','runLeft','crouchRight','crouchLeft','jumpRight','jumpLeft',
  'backflipRight','backflipLeft','fallRight','fallLeft','sprayRight','sprayLeft','hurt','victory',
  'deathRight','deathLeft','rubbleRight','rubbleLeft','volcano','coinVolcano',
  'thirdSpinBurst1','thirdSpinBurst2']) {
  assert.ok(manifest.animations[state], 'missing volcanic state: ' + state);
  const asset = manifest.animations[state].spriteSheet.replace(/^\//, '');
  assert.ok(fs.existsSync(asset), 'missing volcanic asset: ' + asset);
  assert.equal(manifest.animations[state].sourceFrameWidth, 512);
  assert.equal(manifest.animations[state].sourceFrameHeight, 512);
  assert.equal(manifest.animations[state].columns, 3);
  assert.equal(manifest.animations[state].frames, 6);
}
assert.deepEqual(manifest.deathSequence, ['death','rubble','volcano','coinVolcano']);
for (const state of ['death','deathRight','deathLeft','coinVolcano']) assert.equal(manifest.animations[state].renderOffsetY, 12);
for (const state of ['rubble','rubbleRight','rubbleLeft','volcano']) assert.equal(manifest.animations[state].renderOffsetY, 14);
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
assert.match(runtime, /coin\.settled = true/);
assert.match(runtime, /if \(thirdSpinActive\)[\s\S]{0,500}else if \(sprayTimer > 0\)[\s\S]{0,500}else if \(player\.invuln > 0\)/);
assert.match(page, /nbg-level1\.js\?v=getting-up-20261126-lower-ground-death-v4/);
assert.match(runtime, /v=20261126-lower-ground-death-v4/);
assert.match(runtime, /playerCharacterId === 'volcanic-punk' && wasAirborne/);
assert.match(runtime, /beginDeathFall/);
assert.match(runtime, /updateDeathFall/);
assert.match(runtime, /findSafeDeathLandingX/);
assert.match(runtime, /deathLandingHazardAt/);
assert.match(runtime, /deathFallActive \|\| deathAnimationActive/);
console.log('[PASS] Getting Up selectable character contract');

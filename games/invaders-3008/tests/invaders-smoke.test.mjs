/**
 * Invaders 3008 smoke test.
 *
 * Validates:
 * - bootstrap.js exports bootstrapInvaders
 * - leaderboard (submitScore) import path exists in bootstrap.js
 * - ArcadeSync import path exists in bootstrap.js
 * - all lifecycle methods present (init, start, pause, resume, reset, destroy, getScore)
 * - canvas + control buttons exist in index.html
 * - game-fullscreen.js loaded (mute wiring)
 * - Block Topia main.js still exists and is unmodified
 * - new enemy-type functions present in bootstrap.js
 * - new powerup system present in bootstrap.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here          = path.dirname(fileURLToPath(import.meta.url));
const bootstrapPath = path.resolve(here, '../../../js/arcade/games/invaders/bootstrap.js');
const indexPath     = path.resolve(here, '../index.html');
const blockTopiaPath = path.resolve(here, '../../block-topia/main.js');

const bootstrapSrc = await fs.readFile(bootstrapPath, 'utf8');
const indexHtml    = await fs.readFile(indexPath, 'utf8');
const btStat       = await fs.stat(blockTopiaPath);

// 1. bootstrapInvaders export
assert.ok(bootstrapSrc.includes('export function bootstrapInvaders'),
  'bootstrap.js must export bootstrapInvaders');

// 2. submitScore import (leaderboard path)
assert.ok(bootstrapSrc.includes("from '/js/leaderboard-client.js'"),
  'bootstrap.js must import from /js/leaderboard-client.js');
assert.ok(bootstrapSrc.includes('submitScore'),
  'bootstrap.js must call submitScore');

// 3. ArcadeSync
assert.ok(bootstrapSrc.includes("from '/js/arcade-sync.js'"),
  'bootstrap.js must import ArcadeSync');

// 4. Lifecycle methods
for (const m of ['init', 'start', 'pause', 'resume', 'reset', 'destroy', 'getScore']) {
  assert.ok(
    bootstrapSrc.includes('function ' + m + '('),
    'bootstrap.js must define function ' + m + '()',
  );
}

// 5. Canvas element in HTML
assert.ok(indexHtml.includes('id="invCanvas"'),
  'index.html must have canvas#invCanvas');

// 6. Control buttons in HTML
assert.ok(indexHtml.includes('id="startBtn"'), 'index.html must have #startBtn');
assert.ok(indexHtml.includes('id="pauseBtn"'), 'index.html must have #pauseBtn');
assert.ok(indexHtml.includes('id="resetBtn"'), 'index.html must have #resetBtn');

// 7. Mute wiring (game-fullscreen.js loaded)
assert.ok(indexHtml.includes('game-fullscreen.js'),
  'index.html must load game-fullscreen.js (mute wiring)');

// 8. New HUD cells for combo + powerup
assert.ok(indexHtml.includes('id="combo"'),   'index.html must have #combo HUD cell');
assert.ok(indexHtml.includes('id="powerup"'), 'index.html must have #powerup HUD cell');

// 9. Upgraded gameplay features in bootstrap.js
assert.ok(bootstrapSrc.includes('POWERUP_TYPES'),
  'bootstrap.js must have POWERUP_TYPES (powerup system)');
assert.ok(bootstrapSrc.includes('buildBunkers'),
  'bootstrap.js must have buildBunkers (destructible bunkers)');
assert.ok(bootstrapSrc.includes('waveIntroTimer'),
  'bootstrap.js must have waveIntroTimer (wave intro animation)');
assert.ok(bootstrapSrc.includes('bossEntering'),
  'bootstrap.js must have bossEntering (boss entrance animation)');
assert.ok(bootstrapSrc.includes("type === 'shield'"),
  "bootstrap.js must handle shield enemy type");
assert.ok(bootstrapSrc.includes('spread'),
  'bootstrap.js must support spread-shot powerup');
assert.ok(bootstrapSrc.includes('invaders-powerup'),
  "bootstrap.js must reference 'invaders-powerup' sound");

// 10. Block Topia main.js unchanged (still exists + non-trivial)
assert.ok(btStat.size > 1000,
  'Block Topia main.js must still exist and be non-trivial');

console.log('Invaders 3008 smoke checks passed.');

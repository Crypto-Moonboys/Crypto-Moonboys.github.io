/**
 * Invaders 3008 smoke test (follow-up refactor).
 *
 * Validates:
 * BOOTSTRAP
 *  - bootstrap.js exports bootstrapInvaders
 *  - leaderboard (submitScore) import preserved
 *  - ArcadeSync import preserved
 *  - all lifecycle methods present
 *  - bootstrap delegates to the three sub-system modules
 * MODULE SPLIT
 *  - invader-system.js exports expected symbols
 *  - powerup-system.js exports expected symbols
 *  - render-system.js exports createRenderer
 * HTML
 *  - canvas + control buttons exist
 *  - game-fullscreen.js loaded
 *  - combo + powerup HUD cells present
 *  - HUD uses .game-card .hud selector (proper specificity for 6-stat grid)
 *  - mobile media query uses .game-card .hud selector
 * BLOCK TOPIA unchanged
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const INVADERS_DIR = path.resolve(here, '../../../js/arcade/games/invaders');

const bootstrapPath    = path.join(INVADERS_DIR, 'bootstrap.js');
const invaderSysPath   = path.join(INVADERS_DIR, 'invader-system.js');
const powerupSysPath   = path.join(INVADERS_DIR, 'powerup-system.js');
const renderSysPath    = path.join(INVADERS_DIR, 'render-system.js');
const indexPath        = path.resolve(here, '../index.html');
const blockTopiaPath   = path.resolve(here, '../../block-topia/main.js');

const [bootstrapSrc, invaderSysSrc, powerupSysSrc, renderSysSrc, indexHtml, btStat] =
  await Promise.all([
    fs.readFile(bootstrapPath,  'utf8'),
    fs.readFile(invaderSysPath, 'utf8'),
    fs.readFile(powerupSysPath, 'utf8'),
    fs.readFile(renderSysPath,  'utf8'),
    fs.readFile(indexPath,      'utf8'),
    fs.stat(blockTopiaPath),
  ]);

// ── Bootstrap ─────────────────────────────────────────────────────────────────

assert.ok(bootstrapSrc.includes('export function bootstrapInvaders'),
  'bootstrap.js must export bootstrapInvaders');

assert.ok(bootstrapSrc.includes("from '/js/leaderboard-client.js'"),
  'bootstrap.js must import from /js/leaderboard-client.js');
assert.ok(bootstrapSrc.includes('submitScore'),
  'bootstrap.js must call submitScore');

assert.ok(bootstrapSrc.includes("from '/js/arcade-sync.js'"),
  'bootstrap.js must import ArcadeSync');

for (const m of ['init', 'start', 'pause', 'resume', 'reset', 'destroy', 'getScore']) {
  assert.ok(bootstrapSrc.includes('function ' + m + '('),
    'bootstrap.js must define function ' + m + '()');
}

// Bootstrap imports from all three sub-systems
assert.ok(bootstrapSrc.includes("from './invader-system.js'"),
  "bootstrap.js must import from './invader-system.js'");
assert.ok(bootstrapSrc.includes("from './powerup-system.js'"),
  "bootstrap.js must import from './powerup-system.js'");
assert.ok(bootstrapSrc.includes("from './render-system.js'"),
  "bootstrap.js must import from './render-system.js'");

// Gameplay wiring still intact in orchestrator
assert.ok(bootstrapSrc.includes('buildBunkers'),
  'bootstrap.js must call buildBunkers');
assert.ok(bootstrapSrc.includes('waveIntroTimer'),
  'bootstrap.js must use waveIntroTimer');
assert.ok(bootstrapSrc.includes('bossEntering'),
  'bootstrap.js must use bossEntering');
assert.ok(bootstrapSrc.includes('spread'),
  "bootstrap.js must support spread-shot powerup");
assert.ok(bootstrapSrc.includes('invaders-powerup'),
  "bootstrap.js must reference 'invaders-powerup' sound");

// ── invader-system.js ─────────────────────────────────────────────────────────

for (const sym of ['buildGrid', 'spawnBoss', 'buildBunkers', 'makeEnemyBullet',
                   'calcInvaderPoints', 'rowToType', 'typeToHp', 'typeToShieldHp',
                   'WAVE_BOSS', 'ROWS', 'COLS', 'BUNKER_BLOCK_W', 'BUNKER_BLOCK_H']) {
  assert.ok(invaderSysSrc.includes('export') && invaderSysSrc.includes(sym),
    'invader-system.js must export ' + sym);
}

// No DOM/canvas API calls in invader-system
assert.ok(!invaderSysSrc.includes('document.'),
  'invader-system.js must not access DOM');
assert.ok(!invaderSysSrc.includes('getContext('),
  'invader-system.js must not call getContext (no canvas access)');

// ── powerup-system.js ─────────────────────────────────────────────────────────

for (const sym of ['makeDroppedPowerup', 'activatePowerup', 'tickPowerups', 'getScoreMultiplier',
                   'POWERUP_TYPES', 'POWERUP_COLORS', 'POWERUP_ICONS', 'POWERUP_DURATION',
                   'POWERUP_DROP_CHANCE', 'POWERUP_BOSS_DROP_CHANCE']) {
  assert.ok(powerupSysSrc.includes('export') && powerupSysSrc.includes(sym),
    'powerup-system.js must export ' + sym);
}

assert.ok(!powerupSysSrc.includes('document.'),
  'powerup-system.js must not access DOM');

// ── render-system.js ──────────────────────────────────────────────────────────

assert.ok(renderSysSrc.includes('export function createRenderer'),
  'render-system.js must export createRenderer');
assert.ok(renderSysSrc.includes('function draw('),
  'render-system.js createRenderer must return a draw() method');

// Drawing primitives present
for (const fn of ['drawShip', 'drawBoss', 'drawBunkers', 'drawBackground',
                  'drawEffects', 'drawPowerupItems', 'drawComboOverlay', 'drawWaveIntro']) {
  assert.ok(renderSysSrc.includes('function ' + fn),
    'render-system.js must define ' + fn);
}

// No game-state mutation in renderer
assert.ok(!renderSysSrc.includes('lives--') && !renderSysSrc.includes('score +='),
  'render-system.js must not mutate game state');

// ── index.html ────────────────────────────────────────────────────────────────

assert.ok(indexHtml.includes('id="invCanvas"'),  'index.html must have canvas#invCanvas');
assert.ok(indexHtml.includes('id="startBtn"'),   'index.html must have #startBtn');
assert.ok(indexHtml.includes('id="pauseBtn"'),   'index.html must have #pauseBtn');
assert.ok(indexHtml.includes('id="resetBtn"'),   'index.html must have #resetBtn');
assert.ok(indexHtml.includes('game-fullscreen.js'), 'index.html must load game-fullscreen.js');
assert.ok(indexHtml.includes('id="combo"'),      'index.html must have #combo HUD cell');
assert.ok(indexHtml.includes('id="powerup"'),    'index.html must have #powerup HUD cell');

// HUD specificity fix: selector must be .game-card .hud (not bare .hud)
assert.ok(indexHtml.includes('.game-card .hud{'),
  'index.html must use ".game-card .hud" for proper CSS specificity');

// Mobile breakpoint uses same scoped selector
assert.ok(
  indexHtml.includes('.game-card .hud{grid-template-columns:repeat(2,') ||
  indexHtml.includes('.game-card .hud{grid-template-columns: repeat(2,'),
  'index.html mobile breakpoint must scope to .game-card .hud and use 2-column grid',
);

// ── Block Topia unchanged ─────────────────────────────────────────────────────

assert.ok(btStat.size > 1000,
  'Block Topia main.js must still exist and be non-trivial');

console.log('Invaders 3008 smoke checks passed (refactor).');

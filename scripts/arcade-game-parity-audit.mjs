#!/usr/bin/env node
/**
 * arcade-game-parity-audit.mjs — Checks every active arcade game meets
 * the minimum parity standard defined in docs/ARCADE_GAME_IMPACT_STANDARD.md.
 *
 * Checks (all run even if an earlier check fails so you get the full picture):
 *   1. Manifest entry exists.
 *   2. Bootstrap file exists on disk.
 *   3. Bootstrap imports faction-effect-system OR has a documented exception.
 *   4. Bootstrap imports cross-game-modifier-system OR has a documented exception.
 *   5. Bootstrap contains recordMissionProgress / mission event hook OR documented exception.
 *   6. Bootstrap contains faction contribution hook (recordContribution) OR documented exception.
 *   7. Bootstrap does NOT contain fake XP wording (claiming XP was awarded).
 *
 * Usage:
 *   node scripts/arcade-game-parity-audit.mjs
 *
 * Exit codes:
 *   0 — all checks passed (warnings printed but not failures)
 *   1 — one or more FAIL checks
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
let warnings = 0;

function fail(msg) { console.error('  [FAIL] ' + msg); failures++; }
function warn(msg)  { console.warn('  [WARN] ' + msg); warnings++; }
function pass(msg)  { console.log('  [PASS] ' + msg); }
function note(msg)  { console.log('  [NOTE] ' + msg); }

function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function readText(rel) {
  const full = path.join(ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

// ── Load manifest ─────────────────────────────────────────────────────────────

const manifestSrc = readText('js/arcade/arcade-manifest.js');
if (!manifestSrc) {
  console.error('[FATAL] js/arcade/arcade-manifest.js not found.');
  process.exit(1);
}

function extractStringField(block, field) {
  const re = new RegExp(field + "\\s*:\\s*['\"]([^'\"]+)['\"]");
  const m = block.match(re);
  return m ? m[1] : null;
}

function findManifestArrayContent(src) {
  const startIdx = src.indexOf('ARCADE_MANIFEST');
  if (startIdx === -1) return null;
  let i = startIdx + 'ARCADE_MANIFEST'.length;
  while (i < src.length && src[i] !== '[') i++;
  if (i >= src.length) return null;
  let depth = 0;
  const begin = i;
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) return src.slice(begin + 1, i); }
  }
  return null;
}

const entriesRaw = findManifestArrayContent(manifestSrc);
if (!entriesRaw) {
  console.error('[FATAL] Could not parse ARCADE_MANIFEST array.');
  process.exit(1);
}

const entryBlocks = [];
{
  let depth = 0, start = -1;
  for (let i = 0; i < entriesRaw.length; i++) {
    if (entriesRaw[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (entriesRaw[i] === '}') { depth--; if (depth === 0 && start !== -1) { entryBlocks.push(entriesRaw.slice(start, i + 1)); start = -1; } }
  }
}

const manifest = entryBlocks.map(block => ({
  id: extractStringField(block, 'id'),
  bootstrapPath: extractStringField(block, 'bootstrapPath'),
})).filter(e => e.id);

// ── Active games under audit ──────────────────────────────────────────────────

// Mapping from game id → exception notes (null = no exception, must pass all checks)
const ACTIVE_GAMES_AUDIT = {
  invaders:          null,
  pacchain:          null,
  asteroids:         null,
  'breakout-bullrun': null,
  'snake-run':        null,
  tetris:            null,
  crystal:           { noUpgrades: 'quiz format — upgrades N/A', noShield: 'quiz format — shield N/A' },
};

// ── Fake XP wording patterns ──────────────────────────────────────────────────

const FAKE_XP_PATTERNS = [
  /you earned \d+ (arcade\s+)?xp/i,
  /awarded \d+ (arcade\s+)?xp/i,
  /xp rewarded/i,
  /passive (income|reward)/i,
  /passive xp/i,
  /xp credited/i,
];

// ── Run checks ────────────────────────────────────────────────────────────────

console.log('\n[arcade-game-parity-audit] Checking ' + Object.keys(ACTIVE_GAMES_AUDIT).length + ' active games\n');

for (const [gameId, exceptions] of Object.entries(ACTIVE_GAMES_AUDIT)) {
  console.log('\n── ' + gameId + ' ──────────────────────────');

  // [1] Manifest entry
  const entry = manifest.find(e => e.id === gameId);
  if (entry) { pass(gameId + ': manifest entry found'); }
  else { fail(gameId + ': no manifest entry'); continue; }

  // [2] Bootstrap exists
  const bsRel = entry.bootstrapPath ? entry.bootstrapPath.replace(/^\//, '') : null;
  if (!bsRel) { fail(gameId + ': missing bootstrapPath in manifest'); continue; }
  if (!exists(bsRel)) { fail(gameId + ': bootstrap file "' + bsRel + '" not found on disk'); continue; }
  pass(gameId + ': bootstrap file exists → ' + bsRel);

  const src = readText(bsRel) || '';

  // [3] Faction effect import
  const hasFactionImport = /faction-effect-system/.test(src);
  if (hasFactionImport) { pass(gameId + ': imports faction-effect-system'); }
  else { fail(gameId + ': no faction-effect-system import — must import getPlayerFaction/getFactionEffects'); }

  // [4] Cross-game modifier import (may be direct or via systems/index.js re-export)
  const hasModifierImport = /cross-game-modifier-system/.test(src)
    || (/getActiveModifiers/.test(src) && /arcade\/systems\/index/.test(src));
  if (hasModifierImport) { pass(gameId + ': imports cross-game-modifier-system'); }
  else { fail(gameId + ': no cross-game-modifier-system import'); }

  // [5] Mission progress hook
  const hasMissionHook = /recordMissionProgress/.test(src);
  if (hasMissionHook) { pass(gameId + ': contains recordMissionProgress hook'); }
  else { fail(gameId + ': missing recordMissionProgress hook — must report mission events on run end'); }

  // [6] Faction contribution hook
  const hasContribHook = /recordContribution/.test(src);
  if (hasContribHook) { pass(gameId + ': contains recordContribution hook'); }
  else { fail(gameId + ': missing recordContribution hook'); }

  // [7] No fake XP wording
  const fakeMatches = FAKE_XP_PATTERNS.filter(re => re.test(src));
  if (fakeMatches.length === 0) { pass(gameId + ': no fake XP wording detected'); }
  else {
    for (const re of fakeMatches) {
      fail(gameId + ': fake XP wording detected (pattern: ' + re.toString() + ')');
    }
  }

  // Additional info
  if (exceptions) {
    for (const [key, reason] of Object.entries(exceptions)) {
      note(gameId + ': exception — ' + key + ': ' + reason);
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────────');
if (failures === 0 && warnings === 0) {
  console.log('✅  All parity checks passed — every active game meets minimum standard.');
} else if (failures === 0) {
  console.log('⚠️   Passed with ' + warnings + ' warning(s).');
} else {
  console.error('❌  ' + failures + ' failure(s), ' + warnings + ' warning(s). See above for details.');
}
console.log('─────────────────────────────────────────────\n');
process.exit(failures > 0 ? 1 : 0);

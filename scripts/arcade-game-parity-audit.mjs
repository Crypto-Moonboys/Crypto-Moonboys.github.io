#!/usr/bin/env node
/**
 * arcade-game-parity-audit.mjs — Checks every active arcade game meets
 * the minimum parity standard defined in docs/ARCADE_GAME_IMPACT_STANDARD.md.
 *
 * Checks (all run even if an earlier check fails so you get the full picture):
 *   1. Manifest entry exists.
 *   2. Bootstrap file exists on disk.
 *   3. Bootstrap imports faction-effect-system OR documented exception.
 *   4. Bootstrap imports cross-game-modifier-system OR documented exception.
 *   5. Bootstrap contains recordMissionProgress / mission hook OR documented exception.
 *   6. Bootstrap contains recordContribution OR documented exception.
 *   7. Bootstrap + game index.html do NOT contain fake XP wording.
 *
 * Exception handling:
 *   If ACTIVE_GAMES_AUDIT has an exception key that matches a failing check,
 *   the failure is downgraded to a WARN with the documented reason instead of
 *   blocking the run.  Unrelated checks still FAIL.
 *
 * Output labels:
 *   PASS — check verified true
 *   WARN — check could not be confirmed but a documented exception covers it
 *   FAIL — check failed with no valid exception
 *
 * Usage:
 *   node scripts/arcade-game-parity-audit.mjs
 *
 * Exit codes:
 *   0 — no FAIL (warnings allowed)
 *   1 — one or more FAIL
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
  id:            extractStringField(block, 'id'),
  bootstrapPath: extractStringField(block, 'bootstrapPath'),
  page:          extractStringField(block, 'page'),
})).filter(e => e.id);

// ── Active games under audit ──────────────────────────────────────────────────
//
// Exception keys must match the check slugs below:
//   noFactionImport, noModifierImport, noMissionHook, noContribHook, noUpgrades, noShield
//
// When an exception key is present, the associated check emits WARN instead of FAIL.

const ACTIVE_GAMES_AUDIT = {
  invaders:           null,
  pacchain:           null,
  asteroids:          null,
  'breakout-bullrun': null,
  'snake-run':        null,
  tetris:             null,
  crystal: {
    noUpgrades: 'Quiz/lore format — upgrade layer N/A (streak + rare question events serve equivalent role)',
    noShield:   'Quiz/lore format — shield system N/A',
  },
  blocktopia: {
    noFactionImport: 'Phaser 3 IIFE bootstrap — faction-effect-system not yet wired',
    noModifierImport: 'Phaser 3 IIFE bootstrap — cross-game-modifier-system not yet wired',
    noMissionHook:   'Phaser 3 IIFE bootstrap — recordMissionProgress not yet wired',
    noContribHook:   'Phaser 3 IIFE bootstrap — recordContribution not yet wired',
  },
};

// ── Fake XP wording patterns ──────────────────────────────────────────────────
//
// These patterns are checked in BOTH the bootstrap file AND the game's index.html.

const FAKE_XP_PATTERNS = [
  /you earned \d+ (arcade\s+)?xp/i,
  /awarded \d+ (arcade\s+)?xp/i,
  /xp rewarded/i,
  /passive (income|reward)/i,
  /passive xp/i,
  /xp credited/i,
  /click to claim (arcade\s+)?xp/i,
  /free xp/i,
  /guaranteed (arcade\s+)?xp/i,
];

// ── Run checks ────────────────────────────────────────────────────────────────

console.log('\n[arcade-game-parity-audit] Checking ' + Object.keys(ACTIVE_GAMES_AUDIT).length + ' active games\n');

for (const [gameId, exceptions] of Object.entries(ACTIVE_GAMES_AUDIT)) {
  console.log('\n── ' + gameId + ' ──────────────────────────');

  // Helper: emit PASS, WARN (if exception), or FAIL
  function checkOrException(exKey, failMsg, passMsg) {
    if (exceptions && exceptions[exKey]) {
      warn(gameId + ': ' + failMsg + ' — EXCEPTION: ' + exceptions[exKey]);
    } else {
      fail(gameId + ': ' + failMsg);
    }
  }

  // [1] Manifest entry
  const entry = manifest.find(e => e.id === gameId);
  if (entry) { pass(gameId + ': manifest entry found'); }
  else { fail(gameId + ': no manifest entry'); continue; }

  // [2] Bootstrap exists
  const bsRel = entry.bootstrapPath ? entry.bootstrapPath.replace(/^\//, '') : null;
  if (!bsRel) { fail(gameId + ': missing bootstrapPath in manifest'); continue; }
  if (!exists(bsRel)) { fail(gameId + ': bootstrap file "' + bsRel + '" not found on disk'); continue; }
  pass(gameId + ': bootstrap file exists → ' + bsRel);

  const bsSrc = readText(bsRel) || '';

  // Derive index.html path from manifest page field
  // page field looks like '/games/snake-run/' → 'games/snake-run/index.html'
  const pageRel = entry.page ? entry.page.replace(/^\//, '') + 'index.html' : null;
  const pageSrc = pageRel ? (readText(pageRel) || '') : '';
  if (!pageRel) {
    warn(gameId + ': no page path in manifest — index.html not checked for fake XP wording');
  } else if (!exists(pageRel)) {
    warn(gameId + ': game index.html not found at "' + pageRel + '" — skipping HTML fake XP check');
  } else {
    pass(gameId + ': game index.html found → ' + pageRel);
  }

  // [3] Faction effect import
  const hasFactionImport = /faction-effect-system/.test(bsSrc);
  if (hasFactionImport) { pass(gameId + ': imports faction-effect-system'); }
  else { checkOrException('noFactionImport', 'no faction-effect-system import'); }

  // [4] Cross-game modifier import (may be direct or via systems/index.js re-export)
  const hasModifierImport = /cross-game-modifier-system/.test(bsSrc)
    || (/getActiveModifiers/.test(bsSrc) && /arcade\/systems\/index/.test(bsSrc));
  if (hasModifierImport) { pass(gameId + ': imports cross-game-modifier-system'); }
  else { checkOrException('noModifierImport', 'no cross-game-modifier-system import'); }

  // [5] Mission progress hook
  const hasMissionHook = /recordMissionProgress/.test(bsSrc);
  if (hasMissionHook) { pass(gameId + ': contains recordMissionProgress hook'); }
  else { checkOrException('noMissionHook', 'missing recordMissionProgress hook'); }

  // [6] Faction contribution hook — all 3 args required: (factionId, 'score_submission', amount)
  const hasContribHook = /recordContribution\s*\(/.test(bsSrc);
  const hasCorrectContribSig = /recordContribution\s*\([^,]+,\s*['"]score_submission['"]\s*,\s*[^),]+\)/.test(bsSrc);
  if (!hasContribHook) {
    checkOrException('noContribHook', 'missing recordContribution hook');
  } else if (!hasCorrectContribSig) {
    fail(gameId + ': recordContribution missing required 3-arg signature — expected recordContribution(fId, "score_submission", amount)');
  } else {
    pass(gameId + ': recordContribution hook present with correct 3-arg signature');
  }

  // [7a] No fake XP wording in bootstrap
  const bsFakeMatches = FAKE_XP_PATTERNS.filter(re => re.test(bsSrc));
  if (bsFakeMatches.length === 0) { pass(gameId + ': no fake XP wording in bootstrap'); }
  else {
    for (const re of bsFakeMatches) fail(gameId + ': fake XP wording in bootstrap (pattern: ' + re.toString() + ')');
  }

  // [7b] No fake XP wording in game index.html
  if (pageSrc) {
    const htmlFakeMatches = FAKE_XP_PATTERNS.filter(re => re.test(pageSrc));
    if (htmlFakeMatches.length === 0) { pass(gameId + ': no fake XP wording in game index.html'); }
    else {
      for (const re of htmlFakeMatches) fail(gameId + ': fake XP wording in game index.html (pattern: ' + re.toString() + ')');
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────────');
if (failures === 0 && warnings === 0) {
  console.log('✅  All parity checks passed.');
} else if (failures === 0) {
  console.log('⚠️   Passed with ' + warnings + ' warning(s) — see documented exceptions above.');
} else {
  console.error('❌  ' + failures + ' FAIL, ' + warnings + ' WARN. Review required before merge.');
}
console.log('─────────────────────────────────────────────\n');
process.exit(failures > 0 ? 1 : 0);

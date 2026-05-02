/**
 * anti-drift-check.mjs
 *
 * Level 2 anti-drift enforcement for Crypto Moonboys.
 * Runs as a Node ESM script — no dependencies beyond Node builtins.
 *
 * Checks enforced:
 *  1. Required root files must exist.
 *  2. Required game directories must exist.
 *  3. Forbidden paths must not exist.
 *  4. README.md must not be empty and must contain key headings.
 *  5. HexGL must not be re-activated as an XP source.
 *  6. Block Topia client must not re-introduce removed directories.
 *  7. robots.txt must remain at repo root.
 *  8. Arcade game index pages must not reference removed modules.
 *  9. No direct MOONBOYS_STATE property mutations outside moonboys-state.js.
 * 10. No bus-driven direct UI state updates in component files.
 * 11. LAS (live-activity-summary.js) must follow the subscriber-only contract.
 * 12. CSP (connection-status-panel.js) XP display contract.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

let failures = 0;
let warnings = 0;

function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
  failures += 1;
}

function warn(msg) {
  console.warn(`  [WARN] ${msg}`);
  warnings += 1;
}

function pass(msg) {
  console.log(`  [PASS] ${msg}`);
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

// ── 1. Required root files ────────────────────────────────────────────────────
console.log('\n[1] Required root files');
const requiredRootFiles = [
  'README.md',
  'robots.txt',
  '.nojekyll',
  'index.html',
  'CNAME',
];
for (const f of requiredRootFiles) {
  if (exists(f)) {
    pass(f);
  } else {
    fail(`Missing required root file: ${f}`);
  }
}

// ── 2. Required game directories ──────────────────────────────────────────────
console.log('\n[2] Required arcade game directories');
const requiredGames = [
  'games/invaders-3008',
  'games/asteroid-fork',
  'games/breakout-bullrun',
  'games/pac-chain',
  'games/snake-run',
  'games/tetris-block-topia',
  'games/crystal-quest',
  'games/block-topia-quest-maze',
];
for (const g of requiredGames) {
  if (exists(g)) {
    pass(g);
  } else {
    fail(`Missing required game directory: ${g}`);
  }
}

// ── 3. Forbidden paths (removed modules that must not return) ─────────────────
console.log('\n[3] Forbidden paths');
const forbiddenPaths = [
  // Block Topia removed subsystems
  'games/block-topia/world',
  'games/block-topia/ui',
  'games/block-topia/economy',
  'games/block-topia/duel',
  // Dead HexGL game folders
  'games/hexgl',
  'games/hexgl-local',
  'games/hexgl-monster-max',
  // Dead JS arcade bootstrap directories
  'js/arcade/games/hexgl',
  'js/arcade/games/hexgl-monster',
  'js/arcade/games/hexgl-monster-max',
  'js/arcade/games/blocktopia-phaser',
  'js/arcade/games/blocktopia-social-hub',
  'js/arcade/games/breakout',
  'js/arcade/games/snake',
];
for (const f of forbiddenPaths) {
  if (!exists(f)) {
    pass(`Absent (good): ${f}`);
  } else {
    fail(`Forbidden path exists: ${f}`);
  }
}

// ── 4. README.md content checks ───────────────────────────────────────────────
console.log('\n[4] README.md content');
const readme = read('README.md');
if (!readme) {
  fail('README.md is missing or unreadable');
} else if (readme.trim().length < 100) {
  fail('README.md appears to be empty or too short (< 100 chars)');
} else {
  const requiredHeadings = [
    'Repository Scope',
    'Arcade Structure',
    'Current Live Arcade Games',
  ];
  for (const h of requiredHeadings) {
    if (readme.includes(h)) {
      pass(`README contains heading: "${h}"`);
    } else {
      fail(`README.md missing required heading: "${h}"`);
    }
  }
}

// ── 5. Arcade manifest contains only live games ───────────────────────────────
console.log('\n[5] Arcade manifest contains only live arcade games');
const manifestSrc = read('js/arcade/arcade-manifest.js');
const LIVE_GAME_IDS = new Set([
  'invaders', 'pacchain', 'asteroids', 'breakout-bullrun',
  'snake-run', 'tetris', 'blocktopia', 'crystal',
]);
const DEAD_GAME_REFS = ['hexgl', 'hexgl-monster-max', 'hexgl-local', 'breakout/', 'snake/'];
if (!manifestSrc) {
  fail('js/arcade/arcade-manifest.js not found');
} else {
  for (const dead of DEAD_GAME_REFS) {
    if (manifestSrc.includes(dead)) {
      fail(`Arcade manifest references dead game: "${dead}"`);
    } else {
      pass(`Arcade manifest does not reference dead game: "${dead}"`);
    }
  }
}

// ── 6. Block Topia: no Pressure Protocol or street-signal remnants ────────────
console.log('\n[6] Block Topia clean-state check');
const btFiles = ['games/block-topia/main.js', 'games/block-topia/network.js'];
const btForbiddenPatterns = [
  { pattern: /PressureProtocol/i, label: 'PressureProtocol reference' },
  { pattern: /street.signal/i, label: 'street-signal reference' },
  { pattern: /solo.?mode/i, label: 'solo mode reference' },
];
for (const file of btFiles) {
  const src = read(file);
  if (src === null) {
    warn(`Block Topia file not found: ${file}`);
    continue;
  }
  for (const { pattern, label } of btForbiddenPatterns) {
    if (pattern.test(src)) {
      fail(`${file} contains forbidden ${label}`);
    } else {
      pass(`${file}: no ${label}`);
    }
  }
}

// ── 7. robots.txt location ────────────────────────────────────────────────────
console.log('\n[7] robots.txt location');
if (exists('robots.txt')) {
  pass('robots.txt present at root');
  // Must not also exist in a sub-directory that would shadow it
  if (exists('games/robots.txt')) {
    fail('games/robots.txt also exists — may shadow root robots.txt');
  }
} else {
  fail('robots.txt missing from root');
}

// ── 8. Arcade game index pages: forbidden script references ───────────────────
console.log('\n[8] Arcade index pages: forbidden script references');
const gameDirs = requiredGames;
const forbiddenScriptRefs = [
  'hexgl-score-submit',
  'pressure-protocol',
  'street-signal',
];
for (const gameDir of gameDirs) {
  const indexPath = `${gameDir}/index.html`;
  const src = read(indexPath);
  if (src === null) {
    warn(`No index.html found for game: ${gameDir}`);
    continue;
  }
  let hasForbiddenRef = false;
  for (const ref of forbiddenScriptRefs) {
    if (src.includes(ref)) {
      hasForbiddenRef = true;
      fail(`${indexPath} references forbidden script: "${ref}"`);
    }
  }
  if (!hasForbiddenRef) {
    pass(`${gameDir}/index.html: no forbidden script references`);
  }
}

// ── Helper: recursively collect all .js file paths under a directory ──────────
function walkJs(relDir) {
  const results = [];
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return results;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name.endsWith('.js')) {
        results.push(path.relative(ROOT, p));
      }
    }
  }(abs));
  return results;
}

// Helper: strip single-line comment content so patterns don't match comments.
// Removes lines that are pure // comments, JSDoc/block-comment body lines
// (lines whose first non-whitespace char is * — distinguishable from code
// because multiplication / exponentiation never starts a line in our style),
// and block-comment open /* lines.  Removes inline // ... trailing comments.
function stripLineComments(src) {
  return src.split('\n').map(function (line) {
    const t = line.trimStart();
    if (t.startsWith('//') || /^\s*\*/.test(line) || t.startsWith('/*')) return '';
    return line.replace(/\/\/.*$/, '');
  }).join('\n');
}

// Helper: find the body of a bus.on('<event>', ...) handler.
// Searches and extracts from comment-stripped source so JSDoc references to
// bus.on event names don't produce false positives.
// Returns the handler body (already stripped of line comments), or null.
// Handles both "bus.on('" and "MOONBOYS_EVENT_BUS.on('" call styles.
function findBusHandlerBody(src, event) {
  const stripped = stripLineComments(src);
  const markers = [
    `bus.on('${event}'`,
    `MOONBOYS_EVENT_BUS.on('${event}'`,
  ];
  for (const marker of markers) {
    const idx = stripped.indexOf(marker);
    if (idx === -1) continue;
    // Locate the opening brace of the callback function body.
    const braceStart = stripped.indexOf('{', idx);
    if (braceStart === -1) continue;
    // Count braces to find the matching closing brace.
    let depth = 0;
    let i = braceStart;
    while (i < stripped.length) {
      const ch = stripped[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return stripped.slice(idx, i + 1);
      }
      i++;
    }
    // Unbalanced (shouldn't happen in correct JS); fall back to a generous
    // fixed window.  1000 chars covers even large handler bodies.
    return stripped.slice(idx, idx + 1000);
  }
  return null;
}

// ── 9. No direct MOONBOYS_STATE property mutations ────────────────────────────
// All JS files except js/core/moonboys-state.js must not directly assign to
// MOONBOYS_STATE properties.  Only setState() is the authorised write path.
console.log('\n[9] No direct MOONBOYS_STATE mutations outside moonboys-state.js');

const STATE_OWNER = 'js/core/moonboys-state.js';

const STATE_DIRECT_WRITE_PROPS = ['xp', 'faction', 'sync', 'lastEvent'];

const mutationPatterns = STATE_DIRECT_WRITE_PROPS.map(function (prop) {
  return {
    re: new RegExp(`MOONBOYS_STATE\\s*\\.\\s*${prop}\\s*=[^=]`),
    label: `MOONBOYS_STATE.${prop} = (direct write)`,
  };
});
mutationPatterns.push({
  re: /window\s*\.\s*MOONBOYS_STATE\s*=[^=]/,
  label: 'window.MOONBOYS_STATE = (direct assignment)',
});

const allJsFiles = walkJs('js');
let check9Clean = true;

for (const rel of allJsFiles) {
  if (rel === STATE_OWNER) continue; // owner is allowed to define and publish
  const src = read(rel);
  if (!src) continue;
  const stripped = stripLineComments(src);
  for (const { re, label } of mutationPatterns) {
    if (re.test(stripped)) {
      fail(`Runtime drift detected: ${rel} contains ${label}`);
      check9Clean = false;
    }
  }
}

if (check9Clean) {
  pass('No direct MOONBOYS_STATE mutations outside moonboys-state.js');
}

// ── 10. No bus-driven direct UI state updates in component files ──────────────
// Bus listeners in components may ONLY append log entries.
// Sync/faction/XP UI rows must be updated exclusively via MOONBOYS_STATE.subscribe().
console.log('\n[10] No bus-driven direct UI state updates in component files');

const uiComponentFiles = [
  'js/components/live-activity-summary.js',
  'js/components/connection-status-panel.js',
];

let check10Clean = true;

for (const rel of uiComponentFiles) {
  const src = read(rel);
  if (!src) { warn(`Component file not found: ${rel}`); continue; }

  // sync:state handler must not call updateSyncUI(
  const syncBody = findBusHandlerBody(src, 'sync:state');
  if (syncBody !== null && /updateSyncUI\s*\(/.test(syncBody)) {
    fail(`Runtime drift detected: ${rel} calls updateSyncUI() inside bus.on('sync:state')`);
    check10Clean = false;
  }

  // faction:update handler must not call updateFactionUI(
  const factionBody = findBusHandlerBody(src, 'faction:update');
  if (factionBody !== null && /updateFactionUI\s*\(/.test(factionBody)) {
    fail(`Runtime drift detected: ${rel} calls updateFactionUI() inside bus.on('faction:update')`);
    check10Clean = false;
  }

  // xp:update handler must not perform direct DOM manipulation
  const xpBody = findBusHandlerBody(src, 'xp:update');
  if (xpBody !== null && /querySelector\s*\(|innerHTML\s*=|textContent\s*=/.test(xpBody)) {
    fail(`Runtime drift detected: ${rel} performs direct DOM update inside bus.on('xp:update')`);
    check10Clean = false;
  }
}

if (check10Clean) {
  pass('No bus-driven direct UI state updates in component files');
}

// ── 11. LAS subscriber-only contract ─────────────────────────────────────────
// live-activity-summary.js must:
//   • contain MOONBOYS_STATE.subscribe
//   • call updateSyncUI(state.sync) inside the subscriber
//   • NOT call updateSyncUI() (no-arg) inside bus.on('sync:state')
//   • NOT call refresh() inside any bus listener
console.log('\n[11] LAS (live-activity-summary.js) subscriber-only contract');

const LAS_FILE = 'js/components/live-activity-summary.js';
const lasSrc = read(LAS_FILE);

if (!lasSrc) {
  fail(`Runtime drift detected: ${LAS_FILE} not found`);
} else {
  // Must contain MOONBOYS_STATE.subscribe
  if (/MOONBOYS_STATE\s*\.\s*subscribe/.test(lasSrc)) {
    pass('LAS: contains MOONBOYS_STATE.subscribe');
  } else {
    fail(`Runtime drift detected: ${LAS_FILE} missing MOONBOYS_STATE.subscribe`);
  }

  // Must call updateSyncUI(state.sync) in the subscriber
  if (/updateSyncUI\s*\(\s*state\s*\.\s*sync\s*\)/.test(lasSrc)) {
    pass('LAS: updateSyncUI(state.sync) present');
  } else {
    fail(`Runtime drift detected: ${LAS_FILE} missing updateSyncUI(state.sync) call`);
  }

  // sync:state handler must NOT call updateSyncUI() with no arguments
  const lasSyncBody = findBusHandlerBody(lasSrc, 'sync:state');
  if (lasSyncBody !== null) {
    if (/updateSyncUI\s*\(\s*\)/.test(lasSyncBody)) {
      fail(`Runtime drift detected: ${LAS_FILE} calls updateSyncUI() (no-arg) inside bus.on('sync:state')`);
    } else {
      pass('LAS: sync:state handler does not call updateSyncUI() directly');
    }
  } else {
    pass("LAS: no bus.on('sync:state') handler (sync UI is subscriber-only)");
  }

  // Must NOT call refresh() inside any bus.on() listener
  let refreshInBus = false;
  const strippedLasForRefresh = stripLineComments(lasSrc);
  let searchPos = 0;
  while (true) {
    const sidx = strippedLasForRefresh.indexOf('bus.on(', searchPos);
    if (sidx === -1) break;
    const braceStart = strippedLasForRefresh.indexOf('{', sidx);
    if (braceStart !== -1) {
      let depth = 0;
      let i = braceStart;
      let handlerBody = '';
      while (i < strippedLasForRefresh.length) {
        const ch = strippedLasForRefresh[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { handlerBody = strippedLasForRefresh.slice(sidx, i + 1); break; }
        }
        i++;
      }
      if (/\brefresh\s*\(\s*\)/.test(handlerBody)) {
        refreshInBus = true;
        break;
      }
    }
    searchPos = sidx + 1;
  }
  if (refreshInBus) {
    fail(`Runtime drift detected: ${LAS_FILE} calls refresh() inside a bus listener`);
  } else {
    pass('LAS: no refresh() calls inside bus listeners');
  }
}

// ── 12. CSP XP display contract ───────────────────────────────────────────────
// connection-status-panel.js must:
//   • read Arcade XP from MOONBOYS_STATE.getState() (never fetch it independently)
//   • not remount the entire panel on xp:update
//   • not reference arcade_xp_total (that field must stay in moonboys-state.js)
console.log('\n[12] CSP (connection-status-panel.js) XP display contract');

const CSP_FILE = 'js/components/connection-status-panel.js';
const cspSrc = read(CSP_FILE);

if (!cspSrc) {
  fail(`Runtime drift detected: ${CSP_FILE} not found`);
} else {
  // XP display must come from MOONBOYS_STATE.getState()
  if (/MOONBOYS_STATE\s*\.\s*getState\s*\(\s*\)/.test(cspSrc)) {
    pass('CSP: Arcade XP read via MOONBOYS_STATE.getState()');
  } else {
    fail(`Runtime drift detected: ${CSP_FILE} does not read XP from MOONBOYS_STATE.getState()`);
  }

  // Must not remount the panel inside a bus.on('xp:update') handler
  const cspXpBody = findBusHandlerBody(cspSrc, 'xp:update');
  if (cspXpBody !== null && /\bmount\s*\(/.test(cspXpBody)) {
    fail(`Runtime drift detected: ${CSP_FILE} calls mount() inside bus.on('xp:update') — full panel remount on XP`);
  } else {
    pass('CSP: no full panel remount on xp:update');
  }

  // arcade_xp_total must not be fetched or referenced in CSP — that field
  // belongs exclusively to moonboys-state.js hydration.
  if (/arcade_xp_total/.test(cspSrc)) {
    fail(`Runtime drift detected: ${CSP_FILE} references arcade_xp_total — Arcade XP must come from MOONBOYS_STATE`);
  } else {
    pass('CSP: arcade_xp_total not referenced (XP source is MOONBOYS_STATE)');
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Anti-drift check complete.`);
console.log(`  Failures : ${failures}`);
console.log(`  Warnings : ${warnings}`);
console.log('─────────────────────────────────────────\n');

if (failures > 0) {
  process.exit(1);
}

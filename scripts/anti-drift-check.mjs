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
  'invaders', 'pacchain', 'asteroids', 'breakout',
  'snake', 'tetris', 'blocktopia', 'crystal',
]);
if (!manifestSrc) {
  fail('js/arcade/arcade-manifest.js not found');
} else {
  // Extract all id: '...' entries from the manifest source.
  const idPattern = /\bid\s*:\s*['"]([^'"]+)['"]/g;
  const foundIds = [];
  let m;
  while ((m = idPattern.exec(manifestSrc)) !== null) {
    foundIds.push(m[1]);
  }

  // Enforce count
  if (foundIds.length !== LIVE_GAME_IDS.size) {
    fail(`Arcade manifest has ${foundIds.length} entries; expected ${LIVE_GAME_IDS.size}.`);
  } else {
    pass(`Arcade manifest has exactly ${LIVE_GAME_IDS.size} entries`);
  }

  // Enforce no unexpected ids
  let unexpectedFound = false;
  for (const id of foundIds.slice().sort()) {
    if (!LIVE_GAME_IDS.has(id)) {
      fail(`Arcade manifest has unexpected game id: "${id}".`);
      unexpectedFound = true;
    }
  }

  // Enforce no missing live ids
  let missingFound = false;
  for (const id of Array.from(LIVE_GAME_IDS).sort()) {
    if (!foundIds.includes(id)) {
      fail(`Arcade manifest missing live game id: "${id}".`);
      missingFound = true;
    }
  }

  if (!unexpectedFound && !missingFound && foundIds.length === LIVE_GAME_IDS.size) {
    pass('Arcade manifest ids match live game set exactly');
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

// ── TELEGRAM_AUTH_MAX_AGE consistency check ───────────────────────────────────
// Ensures the max auth age constant is the same value (86400 seconds = 24 hours)
// across all three places it is defined. If these drift, the leaderboard worker
// will silently reject valid auths or accept expired ones.
{
  const workerSrc     = read('workers/leaderboard-worker.js');
  const apiConfigSrc  = read('workers/moonboys-api/blocktopia/config.js');
  const identitySrc   = read('js/identity-gate.js');

  const workerMatch     = workerSrc  && workerSrc.match(/TELEGRAM_AUTH_MAX_AGE_SECONDS\s*=\s*(\d+)/);
  const apiConfigMatch  = apiConfigSrc && apiConfigSrc.match(/TELEGRAM_AUTH_MAX_AGE\s*=\s*(\d+)/);
  const identityMatch   = identitySrc && identitySrc.match(/TELEGRAM_AUTH_MAX_AGE_SECONDS\s*=\s*(\d+)/);

  const values = {
    'leaderboard-worker.js TELEGRAM_AUTH_MAX_AGE_SECONDS':    workerMatch?.[1],
    'moonboys-api/blocktopia/config.js TELEGRAM_AUTH_MAX_AGE': apiConfigMatch?.[1],
    'js/identity-gate.js TELEGRAM_AUTH_MAX_AGE_SECONDS':       identityMatch?.[1],
  };

  const unique = new Set(Object.values(values).filter(Boolean));
  if (unique.size === 1) {
    pass(`TELEGRAM_AUTH_MAX_AGE consistent across all 3 locations: ${[...unique][0]}s`);
  } else {
    for (const [loc, val] of Object.entries(values)) {
      if (!val) fail(`TELEGRAM_AUTH_MAX_AGE missing in ${loc}`);
    }
    if (unique.size > 1) {
      fail(`TELEGRAM_AUTH_MAX_AGE drift: ${JSON.stringify(values)}`);
    }
  }
}

// ── SEASON constants drift check ──────────────────────────────────────────────
// SEASON_EPOCH_MS and SEASON_LENGTH_MS must be identical in leaderboard-worker.js
// and moonboys-api/worker.js, otherwise the two workers compute different current-
// season numbers which will break season displays and scoring across both systems.
{
  const lbSrc  = read('workers/leaderboard-worker.js');
  const apiSrc = read('workers/moonboys-api/worker.js');

  const lbEpoch  = lbSrc  && lbSrc.match(/SEASON_EPOCH_MS\s*=\s*(\d+)/)?.[1];
  const apiEpoch = apiSrc && apiSrc.match(/SEASON_EPOCH_MS\s*=\s*(\d+)/)?.[1];

  if (lbEpoch && apiEpoch && lbEpoch !== apiEpoch) {
    fail(`SEASON_EPOCH_MS drift: leaderboard=${lbEpoch} moonboys-api=${apiEpoch}`);
  } else if (lbEpoch && apiEpoch) {
    pass(`SEASON_EPOCH_MS consistent: ${lbEpoch}`);
  } else if (lbEpoch) {
    pass(`SEASON_EPOCH_MS defined in leaderboard-worker.js (${lbEpoch}); not found in moonboys-api (single source)`);
  } else {
    fail('SEASON_EPOCH_MS missing from leaderboard-worker.js');
  }
}

// ── 13. Deleted global UI effect identifiers must not return ──────────────────
// Deleted tron-react-engine/tron-audio identifiers must not appear in shell
// (non-gameplay) files. Game runtime files (js/arcade/, js/audio-manager.js,
// js/arcade-meta-ui.js, js/arcade-retention-engine.js, css/game-fullscreen.css)
// are exempt from this check as they contain legitimate gameplay audio/interaction.
console.log('\n[13] Deleted global UI effect identifiers absent from shell files');
{
  // Game runtime JS files — exempt from this check
  const GAME_JS_EXEMPT = new Set([
    'js/audio-manager.js',
    'js/arcade-meta-ui.js',
    'js/arcade-retention-engine.js',
  ]);

  // Shell JS files: js/ excluding arcade/ subdirectory and game runtime helpers
  const allJs = walkJs('js');
  const shellJsFiles = allJs.filter(rel =>
    !rel.startsWith('js/arcade/') && !GAME_JS_EXEMPT.has(rel)
  );

  // Shell CSS files: css/ excluding game-specific CSS
  const GAME_CSS_EXEMPT = new Set(['css/game-fullscreen.css']);
  const cssDir = path.join(ROOT, 'css');
  const shellCssFiles = fs.existsSync(cssDir)
    ? fs.readdirSync(cssDir)
        .filter(f => f.endsWith('.css'))
        .map(f => `css/${f}`)
        .filter(rel => !GAME_CSS_EXEMPT.has(rel))
    : [];

  // Root HTML files (index.html and peers)
  const rootHtml = fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.html'))
    .map(f => f);

  const allShellFiles = [...shellJsFiles, ...shellCssFiles, ...rootHtml];

  // Forbidden identifiers that must not appear in shell files.
  // Note: playSound/new Audio are allowed in game runtime files (excluded above).
  const deletedUiIdents = [
    { pattern: /\btron-react-engine\b/i,   label: 'tron-react-engine reference' },
    { pattern: /\btron-audio\b/i,           label: 'tron-audio reference' },
    { pattern: /\bTRON_AUDIO\b/,            label: 'TRON_AUDIO reference' },
    { pattern: /\bwindow\.TRON\b/,          label: 'window.TRON reference' },
    { pattern: /\bensureTronAssets\b/,      label: 'ensureTronAssets reference' },
    { pattern: /\bemitTron\b/,              label: 'emitTron reference' },
    { pattern: /\bhoverSound\b/,            label: 'hoverSound reference' },
    { pattern: /\bclickSound\b/,            label: 'clickSound reference' },
    { pattern: /\bTRON_AUDIO\.play\b/,      label: 'TRON_AUDIO.play reference' },
    { pattern: /tron:event/,                label: 'tron:event dispatch' },
    { pattern: /tron:wake/,                 label: 'tron:wake dispatch' },
    { pattern: /tron:hover/,               label: 'tron:hover dispatch' },
    { pattern: /tron:click/,               label: 'tron:click dispatch' },
    { pattern: /\bedgeFlicker\b/,           label: 'edgeFlicker — deleted @keyframes' },
    { pattern: /\bneonFramePulse\b/,        label: 'neonFramePulse — deleted @keyframes' },
    { pattern: /\bneonCornerGlitch\b/,      label: 'neonCornerGlitch — deleted @keyframes' },
    { pattern: /\bheroBgDrift\b/,           label: 'heroBgDrift — deleted @keyframes' },
    { pattern: /\bhome-neon-haze\b/,        label: 'home-neon-haze — deleted @keyframes' },
    { pattern: /\bpulse-grid\b/,            label: 'pulse-grid — deleted @keyframes' },
    { pattern: /\btrace-scan\b/,            label: 'trace-scan — deleted @keyframes' },
  ];

  let check13Clean = true;
  for (const rel of allShellFiles) {
    const src = read(rel);
    if (!src) continue;
    const stripped = stripLineComments(src);
    for (const { pattern, label } of deletedUiIdents) {
      if (pattern.test(stripped)) {
        fail(`Deleted UI effect returned: ${rel} contains ${label}`);
        check13Clean = false;
      }
    }
  }
  if (check13Clean) {
    pass('No deleted global UI effect identifiers found in shell files');
  }
}

// ── 14. Shell CSS must not use motion animation/transform on interactive elements ─
// Global shell CSS files must not apply transform: in :hover/:active/:focus-visible
// rules, nor animation: (non-none) on interactive shell elements.
// Game CSS (game-fullscreen.css) is exempt as it is game runtime CSS.
console.log('\n[14] Shell CSS: no motion animation/transform on interactive shell elements');
{
  const GAME_CSS_EXEMPT14 = new Set(['css/game-fullscreen.css']);
  const shellCssDir = path.join(ROOT, 'css');
  const shellCssFiles2 = fs.existsSync(shellCssDir)
    ? fs.readdirSync(shellCssDir)
        .filter(f => f.endsWith('.css'))
        .map(f => `css/${f}`)
        .filter(rel => !GAME_CSS_EXEMPT14.has(rel))
    : [];

  let check14Clean = true;
  for (const rel of shellCssFiles2) {
    const src = read(rel);
    if (!src) continue;

    // Check for transform: (motion) in :hover/:active/:focus-visible rules.
    // We exclude text-transform: which is not motion.
    // The regex finds any :hover/:active/:focus-visible block containing transform: (non text-transform).
    let m;
    const hoverTransformPat = /:(hover|active|focus-visible)\s*\{[^}]*(?<!\btext-)transform\s*:/gs;
    const srcCopy1 = src;
    while ((m = hoverTransformPat.exec(srcCopy1)) !== null) {
      const lineNum = srcCopy1.slice(0, m.index).split('\n').length;
      fail(`Shell CSS motion drift: ${rel}:${lineNum} has transform: in :${m[1]} rule`);
      check14Clean = false;
    }

    // Check for animation: (non-none) on known interactive shell element selectors.
    // Selector must contain a shell interactive keyword (not inside pseudo-elements).
    // We use a two-step approach: find animation: lines then check surrounding context.
    const animLines = [];
    let lineIdx = 0;
    for (const line of src.split('\n')) {
      lineIdx++;
      if (/\banimation\s*:\s*(?!none\b)/.test(line)) {
        animLines.push({ lineIdx, line });
      }
    }

    // For each animation line, walk backward to find the most recent selector
    const srcLines = src.split('\n');
    const shellSelectorRe = /(?:^|\s)(?:a\s*[\{:,]|button\s*[\{:,]|\.btn\b|\.article-card\b|\.category-card\b|\.article-list-item\b|\.faction-btn\b|\.battle-link-card\b|\.price-card\b|\.home-widget\b|\.retro-pixel-card\b|\.launch-cta|\.home-search\s+button\b|#back-to-top\b|\.lb-tab\b)/;

    for (const { lineIdx: li, line } of animLines) {
      // Walk backward from this line to find the opening rule's selector
      let bracketDepth = 0;
      let foundSelector = '';
      for (let i = li - 1; i >= 0; i--) {
        const l = srcLines[i];
        // Count braces to find the rule start
        for (const ch of [...l].reverse()) {
          if (ch === '}') bracketDepth++;
          else if (ch === '{') {
            if (bracketDepth === 0) {
              foundSelector = srcLines[i];
              break;
            }
            bracketDepth--;
          }
        }
        if (foundSelector) break;
      }
      if (foundSelector && shellSelectorRe.test(foundSelector)) {
        fail(`Shell CSS motion drift: ${rel}:${li} has animation: on interactive shell element (selector: ${foundSelector.trim()})`);
        check14Clean = false;
      }
    }
  }
  if (check14Clean) {
    pass('Shell CSS: no motion transform/animation on interactive shell elements');
  }
}

// ── 15. Non-gameplay JS must not create UI hover/click/touch sound ────────────
// Shell JS files (js/*.js) must not instantiate Audio objects or call UI sound
// helpers for hover/click/touch events.
// Game runtime files (js/arcade/, js/audio-manager.js, js/arcade-meta-ui.js,
// js/arcade-retention-engine.js) are exempt.
console.log('\n[15] Non-gameplay JS: no UI hover/click/touch audio');
{
  const GAME_JS_EXEMPT15 = new Set([
    'js/audio-manager.js',
    'js/arcade-meta-ui.js',
    'js/arcade-retention-engine.js',
  ]);
  const allJs15 = walkJs('js');
  const shellJsFiles2 = allJs15.filter(rel =>
    !rel.startsWith('js/arcade/') && !GAME_JS_EXEMPT15.has(rel)
  );

  const uiAudioPatterns = [
    { re: /\bhoverSound\s*\(/,           label: 'hoverSound() call' },
    { re: /\bclickSound\s*\(/,           label: 'clickSound() call' },
    { re: /TRON_AUDIO\s*\.\s*play\s*\(/, label: 'TRON_AUDIO.play() call' },
    { re: /window\s*\.\s*TRON_AUDIO\b/,  label: 'window.TRON_AUDIO reference' },
  ];

  let check15Clean = true;
  for (const rel of shellJsFiles2) {
    const src = read(rel);
    if (!src) continue;
    const stripped = stripLineComments(src);
    for (const { re, label } of uiAudioPatterns) {
      if (re.test(stripped)) {
        fail(`UI audio drift: ${rel} contains ${label}`);
        check15Clean = false;
      }
    }
  }
  if (check15Clean) {
    pass('No UI hover/click/touch audio in non-gameplay JS');
  }
}

// ── 16. No removed-effect comments remaining ──────────────────────────────────
// Shell files must not contain comments that describe the removed interaction
// system (tron engine, UI sounds, pulse/shake/bounce/flicker descriptions).
console.log('\n[16] No removed-effect comment remnants in shell files');
{
  const GAME_JS_EXEMPT16 = new Set([
    'js/audio-manager.js',
    'js/arcade-meta-ui.js',
    'js/arcade-retention-engine.js',
  ]);
  const allJs16 = walkJs('js');
  const shellJsFiles3 = allJs16.filter(rel =>
    !rel.startsWith('js/arcade/') && !GAME_JS_EXEMPT16.has(rel)
  );

  const GAME_CSS_EXEMPT16 = new Set(['css/game-fullscreen.css']);
  const shellCssDir16 = path.join(ROOT, 'css');
  const shellCssFiles3 = fs.existsSync(shellCssDir16)
    ? fs.readdirSync(shellCssDir16)
        .filter(f => f.endsWith('.css'))
        .map(f => `css/${f}`)
        .filter(rel => !GAME_CSS_EXEMPT16.has(rel))
    : [];

  const shellFiles3 = [...shellJsFiles3, ...shellCssFiles3];

  // Comment patterns that describe the removed interaction system
  const effectCommentPatterns = [
    /\/\/.*\bTRON\s+REACT\s+ENGINE\b/i,
    /\/\/.*\btron.audio\b/i,
    /\/\*.*\bTRON\s+REACT\s+ENGINE\b.*\*\//i,
    /\/\*.*\btron.audio\b.*\*\//i,
    /\/\/.*\bhoverSound\b/i,
    /\/\/.*\bclickSound\b/i,
    /\/\/.*\bemitTron\b/i,
    /\/\/.*\bensureTronAssets\b/i,
  ];

  let check16Clean = true;
  for (const rel of shellFiles3) {
    const src = read(rel);
    if (!src) continue;
    for (const pattern of effectCommentPatterns) {
      if (pattern.test(src)) {
        fail(`Removed-effect comment found: ${rel} — remove comment referencing deleted system`);
        check16Clean = false;
      }
    }
  }
  if (check16Clean) {
    pass('No removed-effect comment remnants found');
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

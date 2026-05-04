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
 *  5. Arcade manifest contains only live game IDs (no old breakout-bullrun / snake-run IDs).
 *  6. Block Topia client must not re-introduce removed directories.
 *  7. robots.txt must remain at repo root.
 *  8. Arcade game index pages must not reference removed modules.
 *  9. No direct MOONBOYS_STATE property mutations outside moonboys-state.js.
 * 10. No bus-driven direct UI state updates in component files.
 * 11. LAS (live-activity-summary.js) must follow the subscriber-only contract.
 * 12. CSP (connection-status-panel.js) XP display contract.
 * 13. Shell pages must not contain hardcoded shell markup; must load site-shell.js.
 * 14. Shell CSS must not use motion animation/transform on interactive shell elements.
 * 15. Non-gameplay JS must not create UI hover/click/touch sound.
 * 16. No removed-effect comment remnants in shell files.
 * 17. Right-panel HUD anti-drift.
 * 18. site-shell.js DOM smoke test (static).
 * 19. Rocket Loader bypass: canonical boot scripts have data-cfasync="false".
 * 20. Arcade hub (games/index.html) and sidebar (site-shell.js) link to all manifest game pages.
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

// ── Helper: recursively collect all .html file paths under a directory ─────────
function walkHtml(relDir) {
  const results = [];
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return results;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name.endsWith('.html')) {
        results.push(path.relative(ROOT, p));
      }
    }
  }(abs));
  return results;
}

// Game runtime HTML directories — these contain actual game engine HTML and are
// exempt from shell checks. Only the subdirectories with live game runtimes are
// listed; games/index.html and games/leaderboard.html are shell pages and included.
const GAME_HTML_EXEMPT_DIRS = new Set([
  'games/asteroid-fork',
  'games/block-topia',
  'games/block-topia-quest-maze',
  'games/breakout-bullrun',
  'games/crystal-quest',
  'games/invaders-3008',
  'games/pac-chain',
  'games/snake-run',
  'games/tetris-block-topia',
  'games/template',
]);

// Helper: collect all shell HTML files.
// Includes: root *.html, wiki/**/*.html, categories/**/*.html, about/**/*.html,
//           games/index.html, games/leaderboard.html.
// Excludes: actual game runtime index.html files (GAME_HTML_EXEMPT_DIRS).
function collectShellHtml() {
  const results = [];
  // Root-level HTML — skip files starting with '_' (templates, not deployed by apply-shell.mjs)
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.html') && !f.startsWith('_')) results.push(f);
  }
  // Subdirectory HTML — walk nested dirs
  const subDirs = ['wiki', 'categories', 'about', 'games'];
  for (const dir of subDirs) {
    for (const rel of walkHtml(dir)) {
      // Derive the first two path segments to check against the exempt set
      const parts = rel.replace(/\\/g, '/').split('/');
      const topTwo = parts.slice(0, 2).join('/');
      if (GAME_HTML_EXEMPT_DIRS.has(topTwo)) continue;
      results.push(rel);
    }
  }
  return results;
}

// ── Helper: check whether a CSS selector line refers to an interactive shell element.
// Uses word-boundary regex for standalone 'a' and 'button' type selectors to avoid
// false-positives on selectors like '.has-animation' that contain 'a ' as substring.
function isShellInteractiveSelector(line) {
  // Standalone anchor type selector
  if (/(?:^|[\s,+~>])a(?=[\s{:,+~>\[.]|$)/.test(line)) return true;
  // Standalone button type selector
  if (/(?:^|[\s,+~>])button(?=[\s{:,+~>\[.]|$)/.test(line)) return true;
  // Class / ID selectors specific to interactive shell elements
  const classKeys = [
    '.btn', '.article-card', '.category-card', '.article-list-item',
    '.faction-btn', '.battle-link-card', '.price-card', '.home-widget',
    '.retro-pixel-card', '.launch-cta', '.home-search', '#back-to-top', '.lb-tab',
  ];
  return classKeys.some(kw => line.includes(kw));
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
// js/arcade-meta-ui.js, js/arcade-retention-engine.js, css/game-fullscreen.css,
// game runtime HTML) are exempt as they contain legitimate gameplay interaction.
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

  // Shell HTML: all non-gameplay HTML (root, wiki, categories, about, games/index etc.)
  const shellHtmlFiles = collectShellHtml();

  const allShellFiles = [...shellJsFiles, ...shellCssFiles, ...shellHtmlFiles];

  // Every deleted tron-engine identifier, CSS animation name, and event name.
  const deletedUiIdents = [
    // Deleted JS files / modules
    { pattern: /\btron-react-engine\b/i,         label: 'tron-react-engine reference' },
    { pattern: /\btron-audio\b/i,                 label: 'tron-audio reference' },
    { pattern: /tron-react-engine\.css/i,         label: 'tron-react-engine.css reference' },
    // Deleted JS globals / functions
    { pattern: /\bTRON_AUDIO\b/,                  label: 'TRON_AUDIO reference' },
    { pattern: /\bwindow\.TRON\b/,                label: 'window.TRON reference' },
    { pattern: /\bensureTronAssets\b/,            label: 'ensureTronAssets reference' },
    { pattern: /\bemitTron\b/,                    label: 'emitTron reference' },
    { pattern: /\bhoverSound\b/,                  label: 'hoverSound reference' },
    { pattern: /\bclickSound\b/,                  label: 'clickSound reference' },
    { pattern: /\bTRON_AUDIO\.play\b/,            label: 'TRON_AUDIO.play reference' },
    // Deleted Tron custom event names
    { pattern: /tron:event/,                      label: 'tron:event dispatch' },
    { pattern: /tron:wake/,                       label: 'tron:wake dispatch' },
    { pattern: /tron:wakeup/,                     label: 'tron:wakeup dispatch' },
    { pattern: /tron:hover/,                      label: 'tron:hover dispatch' },
    { pattern: /tron:click/,                      label: 'tron:click dispatch' },
    { pattern: /tron:sam/,                        label: 'tron:sam dispatch' },
    { pattern: /tron:leaderboard/,               label: 'tron:leaderboard dispatch' },
    { pattern: /tron:score/,                      label: 'tron:score dispatch' },
    { pattern: /tron:api-online/,                 label: 'tron:api-online dispatch' },
    { pattern: /tron:api-offline/,                label: 'tron:api-offline dispatch' },
    // Deleted CSS animation / keyframe names
    { pattern: /\bsyncPulseGreen\b/,              label: 'syncPulseGreen — deleted @keyframes' },
    { pattern: /\bedgeFlicker\b/,                 label: 'edgeFlicker — deleted @keyframes' },
    { pattern: /\bneonFramePulse\b/,              label: 'neonFramePulse — deleted @keyframes' },
    { pattern: /\bneonCornerGlitch\b/,            label: 'neonCornerGlitch — deleted @keyframes' },
    { pattern: /\bheroBgDrift\b/,                 label: 'heroBgDrift — deleted @keyframes' },
    { pattern: /\bhome-neon-haze\b/,              label: 'home-neon-haze — deleted @keyframes' },
    { pattern: /\bpulse-grid\b/,                  label: 'pulse-grid — deleted @keyframes' },
    { pattern: /\btrace-scan\b/,                  label: 'trace-scan — deleted @keyframes' },
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
    const srcLines = src.split('\n');

    // Check for motion transform: in :hover/:active/:focus-visible rules.
    // We scan line-by-line so we can skip text-transform: accurately.
    // Strategy: find lines with :hover/:active/:focus-visible selector, then look
    // inside the rule block for transform: (excluding text-transform:).
    let inTargetBlock = false;
    let braceDepth = 0;
    let blockSelectorLine = 0;
    let blockPseudo = '';

    for (let li = 0; li < srcLines.length; li++) {
      const line = srcLines[li];

      if (!inTargetBlock) {
        // Detect a rule that opens with a hover/active/focus-visible selector
        const pseudoMatch = /:(hover|active|focus-visible)\s*\{/.exec(line);
        if (pseudoMatch) {
          inTargetBlock = true;
          braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
          blockSelectorLine = li + 1;
          blockPseudo = pseudoMatch[1];
          // Check the same opening line for inline transform: (not text-transform:)
          if (/(?<!text-)transform\s*:/.test(line)) {
            fail(`Shell CSS motion drift: ${rel}:${blockSelectorLine} has transform: in :${blockPseudo} rule`);
            check14Clean = false;
          }
        }
      } else {
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;
        if (braceDepth <= 0) {
          inTargetBlock = false;
          braceDepth = 0;
        } else if (/(?<!text-)transform\s*:/.test(line)) {
          fail(`Shell CSS motion drift: ${rel}:${li + 1} has transform: in :${blockPseudo} rule`);
          check14Clean = false;
        }
      }
    }

    // Check for animation: (non-none) on known interactive shell element selectors.
    // For each line with animation:, walk backward to find the enclosing rule selector.
    for (let li = 0; li < srcLines.length; li++) {
      const line = srcLines[li];
      if (!/\banimation\s*:\s*(?!none\b)/.test(line)) continue;

      // Walk backward to find the rule selector line (the line with the opening `{`)
      let depth = 0;
      let foundSelectorLine = '';
      for (let i = li; i >= 0; i--) {
        const l = srcLines[i];
        for (let j = l.length - 1; j >= 0; j--) {
          const ch = l[j];
          if (ch === '}') depth++;
          else if (ch === '{') {
            if (depth === 0) {
              foundSelectorLine = l;
              break;
            }
            depth--;
          }
        }
        if (foundSelectorLine) break;
      }

      if (foundSelectorLine && isShellInteractiveSelector(foundSelectorLine)) {
        fail(`Shell CSS motion drift: ${rel}:${li + 1} has animation: on interactive shell element (selector: ${foundSelectorLine.trim()})`);
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
    { re: /\bnew\s+Audio\s*\(/,                    label: 'new Audio() instantiation' },
    { re: /\bwindow\s*\.\s*Audio\s*\(/,             label: 'window.Audio() instantiation' },
    { re: /\bglobalThis\s*\.\s*Audio\s*\(/,         label: 'globalThis.Audio() instantiation' },
    { re: /\bhoverSound\s*\(/,                       label: 'hoverSound() call' },
    { re: /\bclickSound\s*\(/,                       label: 'clickSound() call' },
    { re: /TRON_AUDIO\s*\.\s*play\s*\(/,             label: 'TRON_AUDIO.play() call' },
    { re: /window\s*\.\s*TRON_AUDIO\b/,              label: 'window.TRON_AUDIO reference' },
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

  // Shell HTML: all non-gameplay HTML pages
  const shellHtmlFiles16 = collectShellHtml();

  const shellFiles3 = [...shellJsFiles3, ...shellCssFiles3, ...shellHtmlFiles16];

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

// ── [13] Shell-clean check ────────────────────────────────────────────────────
{
  console.log('\n[13] Shell-clean: no hardcoded shell markup in HTML pages');

  const shellCheckFiles = [];

  // Root *.html files — skip '_' prefixed templates (not processed by apply-shell.mjs)
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.html') && !f.startsWith('_')) shellCheckFiles.push(f);
  }

  // categories/*.html
  const catDir2 = path.join(ROOT, 'categories');
  if (fs.existsSync(catDir2)) {
    for (const f of fs.readdirSync(catDir2)) {
      if (f.endsWith('.html')) shellCheckFiles.push('categories/' + f);
    }
  }

  // wiki/*.html
  const wikiDir2 = path.join(ROOT, 'wiki');
  if (fs.existsSync(wikiDir2)) {
    for (const f of fs.readdirSync(wikiDir2)) {
      if (f.endsWith('.html')) shellCheckFiles.push('wiki/' + f);
    }
  }

  // games/index.html and games/leaderboard.html
  shellCheckFiles.push('games/index.html');
  shellCheckFiles.push('games/leaderboard.html');

  // Shell markup markers to forbid
  const shellMarkers = [
    '<header id="site-header"',
    '<nav id="sidebar"',
    '<footer id="site-footer"',
    '<aside id="homepage-right-panel"',
  ];

  let check13Clean = true;

  for (const rel of shellCheckFiles) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');

    for (const marker of shellMarkers) {
      if (src.includes(marker)) {
        fail(`[13] ${rel} — contains hardcoded shell markup: ${marker}`);
        check13Clean = false;
      }
    }

    if (!src.includes('<script data-cfasync="false" src="/js/site-shell.js">')) {
      fail(`[13] ${rel} — missing <script data-cfasync="false" src="/js/site-shell.js">`);
      check13Clean = false;
    }
  }

  if (check13Clean) {
    pass('[13] All shell pages are clean and load site-shell.js');
  }
}

// ── 17. Right-panel HUD anti-drift ───────────────────────────────────────────
// Ensures the live-feed / right-HUD system cannot silently disappear again.
console.log('\n[17] Right-panel HUD anti-drift');
{
  // Named shell pages that MUST have the right panel.
  const RIGHT_PANEL_PAGES = [
    'index.html',
    'sam.html',
    'graph.html',
    'search.html',
    'timeline.html',
    'dashboard.html',
    'community.html',
    'how-to-play.html',
    'games/index.html',
    'games/leaderboard.html',
  ];

  // Canonical pathnames that shouldShowRightPanel() allows (must be present in
  // js/site-shell.js).  Prefix entries are listed without trailing '*'.
  const ALLOWLIST_EXACT = [
    '/index.html',
    '/sam.html',
    '/graph.html',
    '/search.html',
    '/timeline.html',
    '/dashboard.html',
    '/community.html',
    '/how-to-play.html',
    '/games/',
    '/games/index.html',
    '/games/leaderboard.html',
  ];
  const ALLOWLIST_PREFIXES = ['/categories/', '/wiki/'];

  // (a) site-shell.js must contain the canonical allowlist entries
  const shellSrc17 = read('js/site-shell.js');
  let check17aClean = true;
  if (!shellSrc17) {
    fail('[17] js/site-shell.js not found');
    check17aClean = false;
  } else {
    for (const entry of ALLOWLIST_EXACT) {
      if (!shellSrc17.includes(`'${entry}'`)) {
        fail(`[17] site-shell.js: canonical allowlist missing entry '${entry}'`);
        check17aClean = false;
      }
    }
    for (const prefix of ALLOWLIST_PREFIXES) {
      if (!shellSrc17.includes(`'${prefix}'`)) {
        fail(`[17] site-shell.js: canonical prefix allowlist missing '${prefix}'`);
        check17aClean = false;
      }
    }
    if (check17aClean) pass('[17] site-shell.js canonical allowlist entries present');
  }

  // (b) site-shell.js must contain the right-panel element markers
  const SHELL_REQUIRED_STRINGS = [
    'homepage-right-panel',
    'live-feed-widget',
    'data-csp-panel',
    'data-las-panel',
    'shouldShowRightPanel',
  ];
  let check17bClean = true;
  if (shellSrc17) {
    for (const needle of SHELL_REQUIRED_STRINGS) {
      if (shellSrc17.includes(needle)) {
        pass(`[17] site-shell.js contains: ${needle}`);
      } else {
        fail(`[17] site-shell.js missing required string: "${needle}"`);
        check17bClean = false;
      }
    }
  }

  // (c) Each named page must have page-has-right-panel class OR be in the allowlist
  //     (covered by shouldShowRightPanel in site-shell.js).  Here we enforce that at
  //     least one of the two signals is present so drift is caught even if site-shell
  //     loses the allowlist entry.
  for (const rel of RIGHT_PANEL_PAGES) {
    const src = read(rel);
    if (!src) { warn(`[17] ${rel} not found — skipping right-panel check`); continue; }
    const hasClass = src.includes('page-has-right-panel');
    const normPath = '/' + rel.replace(/\\/g, '/');
    const inExact = ALLOWLIST_EXACT.includes(normPath);
    const inPrefix = ALLOWLIST_PREFIXES.some(px => normPath.startsWith(px));
    if (hasClass || inExact || inPrefix) {
      pass(`[17] ${rel}: right-panel trigger present`);
    } else {
      fail(`[17] ${rel}: missing page-has-right-panel class AND not in canonical allowlist`);
    }
  }

  // (d) Named shell pages must load site-shell.js BEFORE the shared components
  //     connection-status-panel.js, global-player-header.js, live-activity-summary.js
  const SHARED_COMPONENTS = [
    '/js/components/connection-status-panel.js',
    '/js/components/global-player-header.js',
    '/js/components/live-activity-summary.js',
  ];
  for (const rel of RIGHT_PANEL_PAGES) {
    const src = read(rel);
    if (!src) continue;
    const shellIdx = src.indexOf('/js/site-shell.js');
    if (shellIdx === -1) {
      // Already caught by check 13; skip to avoid double-fail.
      continue;
    }
    for (const comp of SHARED_COMPONENTS) {
      const compIdx = src.indexOf(comp);
      if (compIdx !== -1 && compIdx < shellIdx) {
        fail(`[17] ${rel}: ${comp} is loaded BEFORE site-shell.js`);
      }
    }
  }

  // (e) Named shell pages must include live-activity-summary.js
  for (const rel of RIGHT_PANEL_PAGES) {
    const src = read(rel);
    if (!src) continue;
    if (src.includes('/js/components/live-activity-summary.js')) {
      pass(`[17] ${rel}: live-activity-summary.js present`);
    } else {
      fail(`[17] ${rel}: missing live-activity-summary.js`);
    }
  }
}

// ── 18. site-shell.js DOM smoke test (static string check) ───────────────────
// Confirms the generated right-panel HTML in site-shell.js contains every
// required element identifier.  This is a static source check (no jsdom needed).
console.log('\n[18] site-shell.js DOM smoke test (static)');
{
  const shellSmoke = read('js/site-shell.js');
  if (!shellSmoke) {
    fail('[18] js/site-shell.js not found');
  } else {
    const REQUIRED_SHELL_ELEMENTS = [
      { needle: "rightPanel.id = 'homepage-right-panel'", label: '#homepage-right-panel element' },
      { needle: 'data-csp-panel',             label: '[data-csp-panel] attribute' },
      { needle: 'data-las-panel',             label: '[data-las-panel] attribute' },
      { needle: 'id="live-feed-widget"',      label: '#live-feed-widget element' },
    ];
    for (const { needle, label } of REQUIRED_SHELL_ELEMENTS) {
      if (shellSmoke.includes(needle)) {
        pass(`[18] site-shell.js DOM smoke: ${label} present`);
      } else {
        fail(`[18] site-shell.js DOM smoke: ${label} MISSING — right HUD will not render`);
      }
    }
  }
}

// ── 19. Rocket Loader bypass: canonical boot scripts must have data-cfasync="false" ─
// All <script> tags in the canonical boot block must carry data-cfasync="false"
// to prevent Cloudflare Rocket Loader from replacing them with placeholder nodes.
// When Rocket Loader injects placeholder nodes and site-shell.js rewrites body,
// those placeholders get detached, causing the scripts to silently not execute.
// This is enforced at the HTML level (belt-and-suspenders with data-cfasync).
console.log('\n[19] Rocket Loader bypass: canonical boot scripts have data-cfasync="false"');
{
  const CANONICAL_BOOT_SRCS = [
    '/js/api-config.js',
    '/js/arcade/core/global-event-bus.js',
    '/js/identity-gate.js',
    '/js/core/moonboys-state.js',
    '/js/site-shell.js',
    '/js/components/connection-status-panel.js',
    '/js/components/global-player-header.js',
    '/js/components/live-activity-summary.js',
  ];

  // Collect all shell HTML pages
  const cfCheckFiles = collectShellHtml();

  let check19Clean = true;
  for (const rel of cfCheckFiles) {
    const src = read(rel);
    if (!src) continue;
    for (const bootSrc of CANONICAL_BOOT_SRCS) {
      // Look for a <script> tag referencing this src — if it exists it must
      // carry data-cfasync="false".
      const escapedSrc = bootSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const scriptTagRe = new RegExp(`<script([^>]*)src=["']${escapedSrc}["'][^>]*>`, 'i');
      const m = scriptTagRe.exec(src);
      if (!m) continue; // script not present on this page — skip
      const attrs = m[1] + m[0]; // full tag attrs
      if (!attrs.includes('data-cfasync="false"') && !attrs.includes("data-cfasync='false'")) {
        fail(`[19] ${rel} — canonical boot script missing data-cfasync="false": ${bootSrc}`);
        check19Clean = false;
      }
    }
  }
  // Also check site-shell.js itself does NOT use the old body-clearing approach
  const shellSrc19 = read('js/site-shell.js');
  if (shellSrc19) {
    if (/child\.nodeName\s*!==\s*['"]SCRIPT['"].*removeChild/s.test(shellSrc19) ||
        /removeChild.*nodeName\s*!==\s*['"]SCRIPT['"]/s.test(shellSrc19)) {
      fail('[19] site-shell.js still uses old "remove all non-SCRIPT children" body clear — ' +
           'this detaches Rocket Loader placeholder nodes');
      check19Clean = false;
    } else {
      pass('[19] site-shell.js: no broad non-SCRIPT body clear detected');
    }
    // Must use the safe OLD_SHELL_IDS removal approach
    if (shellSrc19.includes('OLD_SHELL_IDS')) {
      pass('[19] site-shell.js: uses safe OLD_SHELL_IDS targeted removal');
    } else {
      fail('[19] site-shell.js: missing OLD_SHELL_IDS — safe Rocket Loader insertion approach not found');
      check19Clean = false;
    }
  }
  if (check19Clean) {
    pass('[19] All canonical boot scripts have data-cfasync="false" and site-shell.js is Rocket Loader safe');
  }
}

// ── 20. Arcade hub and sidebar parity with manifest pages ────────────────────
// games/index.html (arcade hub) and the arcade sidebar section in site-shell.js
// must contain a link to EVERY game page defined in ARCADE_MANIFEST.
// Extra links (e.g. Block Topia Multiplayer) are fine — only omissions fail.
console.log('\n[20] Arcade hub/sidebar parity with manifest pages');
{
  // Canonical page paths — derived from ARCADE_MANIFEST page values.
  // Must be kept in sync with js/arcade/arcade-manifest.js.
  const MANIFEST_GAME_PAGES = [
    '/games/invaders-3008/',
    '/games/pac-chain/',
    '/games/asteroid-fork/',
    '/games/breakout-bullrun/',
    '/games/snake-run/',
    '/games/tetris-block-topia/',
    '/games/block-topia-quest-maze/',
    '/games/crystal-quest/',
  ];

  // (a) Check games/index.html (arcade hub)
  const hubSrc = read('games/index.html');
  if (!hubSrc) {
    fail('[20] games/index.html not found');
  } else {
    let hubClean = true;
    for (const gamePage of MANIFEST_GAME_PAGES) {
      if (!hubSrc.includes(`href="${gamePage}"`)) {
        fail(`[20] games/index.html missing link to manifest game page: ${gamePage}`);
        hubClean = false;
      }
    }
    if (hubClean) pass('[20] games/index.html contains all manifest game page links');
  }

  // (b) Check js/site-shell.js arcade sidebar
  const shellSrc20 = read('js/site-shell.js');
  if (!shellSrc20) {
    fail('[20] js/site-shell.js not found');
  } else {
    const arcadeIdx = shellSrc20.indexOf("sidebarExtra === 'arcade'");
    if (arcadeIdx === -1) {
      fail("[20] js/site-shell.js: arcade sidebar section not found (expected sidebarExtra === 'arcade')");
    } else {
      let sidebarClean = true;
      for (const gamePage of MANIFEST_GAME_PAGES) {
        if (!shellSrc20.includes(`href="${gamePage}"`)) {
          fail(`[20] js/site-shell.js arcade sidebar missing link to manifest game page: ${gamePage}`);
          sidebarClean = false;
        }
      }
      if (sidebarClean) pass('[20] js/site-shell.js arcade sidebar contains all manifest game page links');
    }
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

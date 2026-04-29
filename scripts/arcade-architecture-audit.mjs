#!/usr/bin/env node
/**
 * arcade-architecture-audit.mjs — Static validation for the arcade manifest.
 *
 * Checks (all run even if an earlier check fails so you get the full picture):
 *   1. Every active game directory has a manifest entry.
 *   2. Every active game page has data-game-id or a documented legacy exception.
 *   3. Every manifest bootstrapPath exists on disk.
 *   4. No duplicate game IDs in the manifest.
 *   5. No duplicate page paths in the manifest.
 *   6. submitScore only appears in game-over / submission paths, not in
 *      top-level page HTML or unrelated JS modules.
 *
 * Usage:
 *   node scripts/arcade-architecture-audit.mjs
 *
 * Exit codes:
 *   0 — all checks passed (warnings are printed but do not fail the run)
 *   1 — one or more FAIL checks
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
let warnings = 0;

function fail(msg) {
  console.error('  [FAIL] ' + msg);
  failures++;
}
function warn(msg) {
  console.warn('  [WARN] ' + msg);
  warnings++;
}
function pass(msg) {
  console.log('  [PASS] ' + msg);
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function readText(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

// ── Parse manifest entries from source text (no browser APIs available) ───────

const manifestSrc = readText('js/arcade/arcade-manifest.js');
if (!manifestSrc) {
  console.error('[FATAL] js/arcade/arcade-manifest.js not found. Cannot continue audit.');
  process.exit(1);
}

// Extract a quoted string field from a source block.
function extractStringField(block, field) {
  const re = new RegExp(field + "\\s*:\\s*['\"]([^'\"]+)['\"]");
  const m = block.match(re);
  return m ? m[1] : null;
}

// Extract array of string values from a field like: field: Object.freeze(['a','b'])
function extractArrayField(block, field) {
  const re = new RegExp(field + '\\s*:[\\s\\S]*?Object\\.freeze\\(\\[([^\\]]*)\\]\\)');
  const m = block.match(re);
  if (!m) return [];
  const items = m[1].match(/['"]([^'"]+)['"]/g);
  return items ? items.map(s => s.replace(/['"]/g, '')) : [];
}

/**
 * Find the ARCADE_MANIFEST array in the source and extract its outer bracket
 * range using depth tracking, so nested arrays (crossGameTags) don't confuse
 * the parser.
 */
function findManifestArrayContent(src) {
  const openTag = 'ARCADE_MANIFEST';
  const startIdx = src.indexOf(openTag);
  if (startIdx === -1) return null;
  // Advance to the first '[' after the identifier.
  let i = startIdx + openTag.length;
  while (i < src.length && src[i] !== '[') i++;
  if (i >= src.length) return null;
  // Now depth-track from this '['.
  let depth = 0;
  const begin = i;
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') {
      depth--;
      if (depth === 0) return src.slice(begin + 1, i);
    }
  }
  return null;
}

const entriesRaw = findManifestArrayContent(manifestSrc);
if (!entriesRaw) {
  console.error('[FATAL] Could not parse ARCADE_MANIFEST array from js/arcade/arcade-manifest.js.');
  process.exit(1);
}

// Split on top-level { ... } object blocks.
const entryBlocks = [];
{
  let depth = 0;
  let start = -1;
  for (let i = 0; i < entriesRaw.length; i++) {
    if (entriesRaw[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (entriesRaw[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        entryBlocks.push(entriesRaw.slice(start, i + 1));
        start = -1;
      }
    }
  }
}

const manifest = entryBlocks.map(block => ({
  id: extractStringField(block, 'id'),
  label: extractStringField(block, 'label'),
  page: extractStringField(block, 'page'),
  bootstrapPath: extractStringField(block, 'bootstrapPath'),
  adapterExport: extractStringField(block, 'adapterExport'),
  crossGameTags: extractArrayField(block, 'crossGameTags'),
})).filter(e => e.id);

console.log('\n[0] Manifest parsed: ' + manifest.length + ' entries found');
manifest.forEach(e => console.log('     • ' + e.id + ' → ' + e.page));

// ── Active game directories (mirrors anti-drift-check.mjs required games) ────

const ACTIVE_GAME_DIRS = [
  'games/invaders-3008',
  'games/asteroid-fork',
  'games/breakout-bullrun',
  'games/pac-chain',
  'games/snake-run',
  'games/tetris-block-topia',
  'games/hexgl-monster-max',
  'games/block-topia-quest-maze',
  'games/crystal-quest',
];

// Mapping from game directory to expected manifest id.
// The id is derived from the game page path (trimmed slashes + removing "games/").
// For cases where the directory name doesn't match the id we list them explicitly.
const DIR_TO_ID = {
  'games/invaders-3008': 'invaders',
  'games/asteroid-fork': 'asteroids',
  'games/breakout-bullrun': 'breakout-bullrun',
  'games/pac-chain': 'pacchain',
  'games/snake-run': 'snake-run',
  'games/tetris-block-topia': 'tetris',
  'games/hexgl-monster-max': 'hexgl',
  'games/block-topia-quest-maze': 'blocktopia',
  'games/crystal-quest': 'crystal',
};

// Pages that do NOT need data-game-id because they use a legacy bootstrap
// pattern that is intentionally kept (must be explicitly documented here).
const LEGACY_EXCEPTIONS = new Set([
  // HexGL Monster Max uses an iframe-based bootstrap with a separate start flow.
  '/games/hexgl-monster-max/',
  // Block Topia Quest Maze has an IIFE bootstrap outside the module system.
  '/games/block-topia-quest-maze/',
  // Block Topia multiplayer — separate architecture, not part of arcade manifest.
  '/games/block-topia/',
]);

// ── Check 1: every active game dir has a manifest entry ───────────────────────
console.log('\n[1] Every active game directory has a manifest entry');
for (const dir of ACTIVE_GAME_DIRS) {
  const expectedId = DIR_TO_ID[dir];
  if (!expectedId) {
    warn(dir + ' — no expected id mapping, skipping');
    continue;
  }
  const entry = manifest.find(e => e.id === expectedId);
  if (entry) {
    pass(dir + ' → manifest id "' + expectedId + '" found');
  } else {
    fail(dir + ' — no manifest entry with id "' + expectedId + '"');
  }
}

// ── Check 2: every active game page has data-game-id or legacy exception ──────
console.log('\n[2] Active game pages have data-game-id or a documented legacy exception');
console.log('    (WARN = not yet migrated to auto-mount; only Breakout Bullrun is the current pilot)');
for (const dir of ACTIVE_GAME_DIRS) {
  const pageRelPath = dir + '/index.html';
  const pagePath = '/' + dir + '/';

  if (LEGACY_EXCEPTIONS.has(pagePath)) {
    pass(dir + '/index.html — legacy exception (documented)');
    continue;
  }

  const html = readText(pageRelPath);
  if (!html) {
    warn(dir + '/index.html — file not found, cannot check data-game-id');
    continue;
  }

  if (/data-game-id\s*=/.test(html)) {
    const match = html.match(/data-game-id\s*=\s*["']([^"']+)["']/);
    pass(dir + '/index.html — data-game-id="' + (match ? match[1] : '?') + '"');
  } else {
    warn(dir + '/index.html — missing data-game-id (not yet migrated to auto-mount). ' +
      'Add data-game-id or add to LEGACY_EXCEPTIONS when migration is complete.');
  }
}

// ── Check 3: every manifest bootstrapPath exists on disk ─────────────────────
console.log('\n[3] Every manifest bootstrapPath exists on disk');
for (const entry of manifest) {
  if (!entry.bootstrapPath) {
    fail('Manifest entry "' + entry.id + '" — missing bootstrapPath field');
    continue;
  }
  // bootstrapPath starts with '/' — strip leading slash for fs check.
  const relPath = entry.bootstrapPath.replace(/^\//, '');
  if (exists(relPath)) {
    pass(entry.id + ' → ' + entry.bootstrapPath);
  } else {
    fail(entry.id + ' — bootstrapPath "' + entry.bootstrapPath + '" does not exist on disk');
  }
}

// ── Check 4: no duplicate game IDs ────────────────────────────────────────────
console.log('\n[4] No duplicate game IDs in manifest');
const idsSeen = new Map();
for (const entry of manifest) {
  if (!entry.id) {
    fail('Manifest entry with missing id field');
    continue;
  }
  if (idsSeen.has(entry.id)) {
    fail('Duplicate game id "' + entry.id + '" (first seen at index ' + idsSeen.get(entry.id) + ')');
  } else {
    idsSeen.set(entry.id, manifest.indexOf(entry));
    pass('id "' + entry.id + '" is unique');
  }
}

// ── Check 5: no duplicate page paths ──────────────────────────────────────────
console.log('\n[5] No duplicate page paths in manifest');
const pagesSeen = new Map();
for (const entry of manifest) {
  if (!entry.page) {
    fail('Manifest entry "' + entry.id + '" — missing page field');
    continue;
  }
  if (pagesSeen.has(entry.page)) {
    fail('Duplicate page path "' + entry.page + '" (id "' + entry.id +
      '" and id "' + pagesSeen.get(entry.page) + '")');
  } else {
    pagesSeen.set(entry.page, entry.id);
    pass('page "' + entry.page + '" is unique');
  }
}

// ── Check 6: submitScore only in game-over/submission paths ───────────────────
console.log('\n[6] submitScore only appears in game-over/submission paths');

// Files where submitScore is allowed: bootstrap modules (they call it on game over),
// leaderboard infrastructure, and worker files.
const ALLOWED_SUBMITSCORE_PATTERNS = [
  /^js\/arcade\/games\/[^/]+\/bootstrap\.js$/,
  /^js\/leaderboard-client\.js$/,
  /^js\/arcade-sync\.js$/,
  /^workers\//,
];

// Directories to skip entirely in check 6 (vendored code, legacy stubs, tests).
const SKIP_DIRS = new Set([
  '.git', 'node_modules',
  'hexgl-local',   // vendored HexGL
  'games/core',    // legacy stub directory
  'games/js',      // legacy unused blocktopia files
]);

function isSubmitScoreAllowed(relPath) {
  return ALLOWED_SUBMITSCORE_PATTERNS.some(re => re.test(relPath));
}

function walkDir(dirRel, callback) {
  const dirAbs = path.join(ROOT, dirRel);
  if (!fs.existsSync(dirAbs)) return;
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const e of entries) {
    const childRel = dirRel + '/' + e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || SKIP_DIRS.has(childRel)) continue;
      walkDir(childRel, callback);
    } else if (e.isFile()) {
      callback(childRel);
    }
  }
}

// Match actual submitScore( call-sites — not UI text like "submitScoreBtn".
// We look for: submitScore( OR import { ... submitScore ... }
const SUBMITSCORE_CALL_RE = /\bsubmitScore\s*\(|import[^;]*\bsubmitScore\b/;

const submitScoreViolations = [];
walkDir('games', filePath => {
  if (!filePath.endsWith('.html') && !filePath.endsWith('.js')) return;
  const src = readText(filePath);
  if (!src) return;
  if (SUBMITSCORE_CALL_RE.test(src)) {
    if (!isSubmitScoreAllowed(filePath)) {
      submitScoreViolations.push(filePath);
    }
  }
});
walkDir('js', filePath => {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.mjs')) return;
  const src = readText(filePath);
  if (!src) return;
  if (SUBMITSCORE_CALL_RE.test(src)) {
    if (!isSubmitScoreAllowed(filePath)) {
      submitScoreViolations.push(filePath);
    }
  }
});

if (submitScoreViolations.length === 0) {
  pass('No unexpected submitScore calls found outside bootstrap/leaderboard modules');
} else {
  for (const v of submitScoreViolations) {
    fail('Unexpected submitScore reference in: ' + v +
      '  (submitScore must only appear in bootstrap game-over handlers or leaderboard infra)');
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────');
if (failures === 0 && warnings === 0) {
  console.log('✅  All checks passed — arcade architecture is clean.');
} else if (failures === 0) {
  console.log('⚠️   Passed with ' + warnings + ' warning(s). Review above.');
} else {
  console.error('❌  ' + failures + ' failure(s), ' + warnings + ' warning(s). See above for details.');
}
console.log('─────────────────────────────────────────────\n');

process.exit(failures > 0 ? 1 : 0);

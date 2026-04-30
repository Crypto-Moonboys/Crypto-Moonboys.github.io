/**
 * no-dead-placeholder-copy.mjs
 * ==============================
 * Fails if core user-facing pages contain visible dead placeholder copy.
 *
 * Usage:
 *   node scripts/no-dead-placeholder-copy.mjs
 *
 * Exit codes:
 *   0 — all clear
 *   1 — dead placeholder text found in one or more core pages, or a
 *       required core file is missing
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Core pages to check ──────────────────────────────────────────────────────
const CORE_PAGES = [
  'index.html',
  'community.html',
  'games/leaderboard.html',
  'how-to-play.html',
  'about.html',
  'about/what-is-crypto-moonboys.html',
  'gkniftyheads-incubator.html',
];

// ── JS files that contribute visible text to core pages ─────────────────────
const CORE_JS = [
  'js/home-widgets.js',
  'js/battle-layer.js',
  'js/telegram-community.js',
  'js/arcade-leaderboard.js',
];

// ── Forbidden patterns ───────────────────────────────────────────────────────
// These must never appear as user-facing copy in core pages.
// Exceptions: content inside <!-- ... --> HTML comments is ignored.
// All regexes must NOT use the global flag (g) — they are used with exec()
// against the full source string and the global flag would cause stateful
// lastIndex behaviour that makes repeated .exec() calls unreliable here.
const FORBIDDEN = [
  /will appear here once(?: the)? engagement layer is live/i,
  /once community engagement is live/i,
  /once engagement (?:tracking|layer) is live/i,
  /Connected to Core API\s*[—\-]\s*activity panel (?:not connected|coming soon)/i,
  /Connected to Core API\s*[—\-]\s*leaderboard data coming soon/i,
  /Connected to Core API\s*[—\-]\s*live feed coming soon/i,
  /article battles (?:are )?launching soon/i,
  /comments.*launching soon/i,
  /activity panel (?:not connected|coming soon)/i,
  /leaderboard data coming soon/i,
  /live feed coming soon/i,
  /rankings will appear here/i,
  /engagement layer is live/i,
  /TODO user-facing/i,
  /mission board static filler/i,
  /future layer shown as live/i,
];

// ── HTML comment stripper ────────────────────────────────────────────────────
// Character-by-character walk so no regex can miss nested/pathological cases.
function stripHtmlComments(src) {
  var result = [];
  var inComment = false;
  for (var i = 0; i < src.length; i++) {
    if (!inComment && src[i] === '<' && src.slice(i, i + 4) === '<!--') {
      inComment = true;
      i += 3;
      continue;
    }
    if (inComment && src[i] === '-' && src.slice(i, i + 3) === '-->') {
      inComment = false;
      i += 2;
      continue;
    }
    if (!inComment) result.push(src[i]);
  }
  return result.join('');
}

// ── Line-number helper ───────────────────────────────────────────────────────
// Returns the 1-based line number for a character offset in src.
function lineNumberForIndex(src, index) {
  return src.slice(0, index).split('\n').length;
}

// ── Scan a single file against all FORBIDDEN patterns ───────────────────────
// Scans against the full source string so multi-line strings are caught.
function scanFile(rel, src) {
  var found = 0;
  for (var p = 0; p < FORBIDDEN.length; p++) {
    var pattern = FORBIDDEN[p];
    var match = pattern.exec(src);
    if (match) {
      var line = lineNumberForIndex(src, match.index);
      console.error('[FAIL]  ' + rel + ':' + line + '  →  matched: ' + pattern);
      console.error('        ' + match[0].slice(0, 120));
      found++;
    }
  }
  return found;
}

// ── Main ─────────────────────────────────────────────────────────────────────
let failures = 0;

const allFiles = [...CORE_PAGES, ...CORE_JS];

for (const rel of allFiles) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`[FAIL]  ${rel} — expected core file not found`);
    failures++;
    continue;
  }

  const raw = readFileSync(abs, 'utf8');
  const src = rel.endsWith('.html') ? stripHtmlComments(raw) : raw;

  failures += scanFile(rel, src);
}

if (failures === 0) {
  console.log('[PASS]  No dead placeholder copy found in core pages.');
  process.exit(0);
} else {
  console.error(`\n[FAIL]  ${failures} violation(s) found. Fix before merging.`);
  process.exit(1);
}

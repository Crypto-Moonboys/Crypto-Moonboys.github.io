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
 *   1 — dead placeholder text found in one or more core pages
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

// ── Forbidden patterns (case-insensitive) ────────────────────────────────────
// These must never appear as user-facing copy in core pages.
// Exceptions: content inside <!-- ... --> HTML comments is ignored.
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

// Strip HTML comments so we don't flag commented-out legacy copy
function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '');
}

let failures = 0;

const allFiles = [...CORE_PAGES, ...CORE_JS];

for (const rel of allFiles) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    // Only warn for HTML pages that are expected to exist
    if (rel.endsWith('.html')) {
      console.warn(`[skip]  ${rel} — file not found`);
    }
    continue;
  }

  const raw = readFileSync(abs, 'utf8');
  const src = rel.endsWith('.html') ? stripHtmlComments(raw) : raw;
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FORBIDDEN) {
      if (pattern.test(line)) {
        console.error(`[FAIL]  ${rel}:${i + 1}  →  matched: ${pattern}`);
        console.error(`        ${line.trim().slice(0, 120)}`);
        failures++;
      }
    }
  }
}

if (failures === 0) {
  console.log('[PASS]  No dead placeholder copy found in core pages.');
  process.exit(0);
} else {
  console.error(`\n[FAIL]  ${failures} dead-placeholder violation(s) found. Fix before merging.`);
  process.exit(1);
}

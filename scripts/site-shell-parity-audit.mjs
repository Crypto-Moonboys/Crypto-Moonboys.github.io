#!/usr/bin/env node
/**
 * site-shell-parity-audit.mjs
 *
 * Fails if major pages define their own incompatible shell classes or
 * inline styles for the shared site shell elements, or if canonical
 * logo copy drifts from the source-of-truth values.
 *
 * Run:
 *   node --check scripts/site-shell-parity-audit.mjs
 *   node scripts/site-shell-parity-audit.mjs
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more shell parity violations found
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

// ── Canonical shell values ────────────────────────────────────────────────────

const CANONICAL_LOGO_TITLE = 'THE CRYPTO MOONBOYS GK WIKI';
const CANONICAL_LOGO_SUB   = 'Living Web3 Wiki · Play. Earn. Build.';
const CANONICAL_SEARCH_PLACEHOLDER = 'Search the wiki…';

// Stale copy that must not appear in logo-text or logo-sub
const FORBIDDEN_LOGO_COPY = [
  'System Launch Console',
  'Build / Own / Control',
  'Crypto Intelligence',
  'Lore Console',
  'Blockchain Cryptoism Encyclopedia',
  'fan-driven encyclopedia',
  'Play. Earn. Build. Own it.',
];

// Stale sidebar heading that should not appear
const FORBIDDEN_SIDEBAR_HEADINGS = [
  'Start Here',
  'HODL WARS LORE$',
  '⚔️ HODL WARS',
];

// Shell element IDs / classes — page-local inline style overrides for these
// are forbidden (content-internal customisation is still allowed)
const SHELL_SELECTORS = [
  '#site-header',
  '#sidebar',
  '#homepage-right-panel',
  '.site-logo',
  '.logo-text',
  '.logo-sub',
  '#header-search',
  '#layout',
  '#main-wrapper',
];

// ── Pages to audit ────────────────────────────────────────────────────────────

const SHELL_PAGES = [
  'index.html',
  'graph.html',
  'games/index.html',
  'games/leaderboard.html',
  'dashboard.html',
  'search.html',
  'timeline.html',
  'categories/index.html',
  'community.html',
  'about.html',
  'how-to-play.html',
  'gkniftyheads-incubator.html',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract content of all <style> blocks from an HTML string.
 */
function extractInlineStyles(html) {
  const matches = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push(m[1]);
  }
  return matches.join('\n');
}

/**
 * Check if a CSS string contains a rule that targets a shell selector AND
 * changes a shell-level layout property. Returns matched rule snippets.
 */
function findShellOverrides(css, selector) {
  // Shell layout properties we care about
  const shellProps = [
    'height',
    'width',
    'max-width',
    'min-width',
    'padding',
    'margin',
    'position',
    'display',
    'background',
    'border',
    'font-size',
    'grid',
    'flex',
    'top',
    'left',
    'right',
    'bottom',
    'z-index',
    'overflow',
  ];

  // Escape selector for regex use
  const escaped = selector.replace(/[#.\[\]]/g, (c) => `\\${c}`);
  // Match rules like `selector { ... }` or `body.foo selector { ... }`
  const ruleRe = new RegExp(
    `[^{}]*${escaped}[^{}]*\\{([^}]*)\\}`,
    'gi'
  );

  const hits = [];
  let m;
  while ((m = ruleRe.exec(css)) !== null) {
    const body = m[1];
    const hasShellProp = shellProps.some((p) =>
      new RegExp(`\\b${p}\\s*:`).test(body)
    );
    if (hasShellProp) {
      hits.push(m[0].trim().slice(0, 120));
    }
  }
  return hits;
}

// ── Audit loop ────────────────────────────────────────────────────────────────

console.log('\n─── Site Shell Parity Audit ───────────────────────────────────\n');

for (const rel of SHELL_PAGES) {
  const html = read(rel);
  if (!html) {
    fail(`${rel} — file not found`);
    continue;
  }

  let pageOk = true;

  // 1. Canonical logo title
  if (!html.includes(CANONICAL_LOGO_TITLE)) {
    fail(`${rel} — logo-text is not "${CANONICAL_LOGO_TITLE}"`);
    pageOk = false;
  }

  // 2. Canonical logo subtitle
  if (!html.includes(CANONICAL_LOGO_SUB)) {
    fail(`${rel} — logo-sub is not "${CANONICAL_LOGO_SUB}"`);
    pageOk = false;
  }

  // 3. Forbidden stale copy
  for (const stale of FORBIDDEN_LOGO_COPY) {
    // Only flag if it appears inside a logo-text or logo-sub context
    const logoBlock = html.match(/class="site-logo"[\s\S]{0,600}/);
    if (logoBlock && logoBlock[0].includes(stale)) {
      fail(`${rel} — stale logo copy found: "${stale}"`);
      pageOk = false;
    }
  }

  // 4. Forbidden sidebar headings — only within sidebar-heading divs
  const sidebarHeadingRe = /<div class="sidebar-heading">([\s\S]*?)<\/div>/g;
  const sidebarHeadingMatches = [...html.matchAll(sidebarHeadingRe)];
  for (const heading of FORBIDDEN_SIDEBAR_HEADINGS) {
    const inHeading = sidebarHeadingMatches.some(m => m[1].includes(heading));
    if (inHeading) {
      fail(`${rel} — forbidden sidebar heading found: "${heading}"`);
      pageOk = false;
    }
  }

  // 5. Sidebar must contain the canonical Navigation section
  if (!html.includes('<div class="sidebar-heading">Navigation</div>')) {
    fail(`${rel} — sidebar missing canonical "Navigation" section heading`);
    pageOk = false;
  }

  // 6. Sidebar must contain Battle Chamber link
  if (!html.includes('href="/community.html"')) {
    fail(`${rel} — sidebar missing Battle Chamber link (/community.html)`);
    pageOk = false;
  }

  // 7. Check page-local <style> blocks for shell selector overrides
  const inlineCSS = extractInlineStyles(html);
  if (inlineCSS) {
    for (const sel of SHELL_SELECTORS) {
      const overrides = findShellOverrides(inlineCSS, sel);
      if (overrides.length > 0) {
        // Warn rather than fail — some page-local tweaks may be intentional
        // (e.g. graph-page #content max-width for canvas). Upgrade to fail
        // only for the strict shell IDs that should never be touched.
        const strictShell = ['#site-header', '#sidebar', '#layout', '#main-wrapper', '.site-logo', '.logo-text', '.logo-sub'];
        const fn = strictShell.includes(sel) ? fail : warn;
        for (const rule of overrides) {
          fn(`${rel} — page-local override for shell selector "${sel}": ${rule}`);
        }
        if (strictShell.includes(sel)) pageOk = false;
      }
    }
  }

  if (pageOk) {
    pass(`${rel}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n─── Result ─────────────────────────────────────────────────────`);
console.log(`  Failures : ${failures}`);
console.log(`  Warnings : ${warnings}`);
console.log(`────────────────────────────────────────────────────────────────\n`);

if (failures > 0) {
  console.error(`Shell parity audit FAILED with ${failures} failure(s).\n`);
  process.exit(1);
} else {
  console.log(`Shell parity audit PASSED.\n`);
  process.exit(0);
}

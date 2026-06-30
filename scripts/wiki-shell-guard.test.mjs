#!/usr/bin/env node
/**
 * wiki-shell-guard.test.mjs
 *
 * Scans every wiki/*.html page and fails if a non-redirect page is missing
 * the canonical live right-rail runtime script stack.
 *
 * Required scripts (must all be present on every content wiki page):
 *   /js/api-config.js
 *   /js/arcade/core/global-event-bus.js
 *   /js/identity-gate.js
 *   /js/core/moonboys-state.js
 *   /js/core/daily-loop-state.js
 *   /js/site-shell.js
 *   /js/components/connection-status-panel.js
 *   /js/components/global-player-header.js
 *   /js/components/live-activity-summary.js
 *   /js/wiki.js
 *   /js/bible-loader.js
 *
 * Explicitly verifies /wiki/graffpunks.html as the canonical regression anchor.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_DIR = path.join(ROOT, 'wiki');

const REQUIRED_SCRIPTS = [
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/wiki.js',
  '/js/bible-loader.js',
];

let failures = 0;
let passes = 0;
let skipped = 0;

function fail(msg) { console.error(`  [FAIL] ${msg}`); failures++; }
function pass(msg) { console.log(`  [PASS] ${msg}`); passes++; }

function isRedirectPage(html) {
  return html.includes('http-equiv="refresh"') || html.includes("http-equiv='refresh'");
}

const wikiFiles = fs.readdirSync(WIKI_DIR)
  .filter(f => f.endsWith('.html'))
  .sort();

console.log('\n─── Wiki Shell Guard ───────────────────────────────────────────\n');
console.log(`Scanning ${wikiFiles.length} wiki pages for required runtime scripts...\n`);

// Boot scripts that must not appear more than once per page
const CANONICAL_BOOT_SRCS = [
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/wiki.js',
  '/js/bible-loader.js',
];

const failingPages = [];

for (const fname of wikiFiles) {
  const fullPath = path.join(WIKI_DIR, fname);
  const html = fs.readFileSync(fullPath, 'utf8');

  if (isRedirectPage(html)) {
    skipped++;
    continue;
  }

  // Check all required scripts are present
  const missing = REQUIRED_SCRIPTS.filter(src => !html.includes(src));
  if (missing.length > 0) {
    failingPages.push({ fname, missing });
    for (const src of missing) {
      fail(`wiki/${fname} — missing required script: ${src}`);
    }
  }

  // Check data-cfasync="false" on canonical boot scripts
  for (const src of CANONICAL_BOOT_SRCS) {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cfPattern = new RegExp(
      `<script[^>]*data-cfasync=["']false["'][^>]*src=["']${escaped}["']|` +
      `<script[^>]*src=["']${escaped}["'][^>]*data-cfasync=["']false["']`
    );
    if (html.includes(src) && !cfPattern.test(html)) {
      fail(`wiki/${fname} — script missing data-cfasync="false": ${src}`);
    }
  }

  // Check for duplicate boot script src tags
  for (const src of CANONICAL_BOOT_SRCS) {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const srcPattern = new RegExp(`src=["']${escaped}["']`, 'g');
    const count = (html.match(srcPattern) || []).length;
    if (count > 1) {
      fail(`wiki/${fname} — duplicate script (${count}×): ${src}`);
    }
  }
}

// ── Regression anchor: graffpunks.html must pass explicitly ──────
console.log('\n─── Regression anchor: /wiki/graffpunks.html ───────────────────\n');
const anchorPath = path.join(WIKI_DIR, 'graffpunks.html');
if (!fs.existsSync(anchorPath)) {
  fail('/wiki/graffpunks.html — file not found');
} else {
  const anchorHtml = fs.readFileSync(anchorPath, 'utf8');
  // Content check — must still have Graffpunks article body
  if (anchorHtml.includes('Graffpunks') || anchorHtml.includes('GRAFFPUNKS')) {
    pass('/wiki/graffpunks.html — article content preserved (Graffpunks present)');
  } else {
    fail('/wiki/graffpunks.html — article content missing (Graffpunks not found)');
  }
  // Shell check — all required scripts present
  const anchorMissing = REQUIRED_SCRIPTS.filter(src => !anchorHtml.includes(src));
  if (anchorMissing.length === 0) {
    pass('/wiki/graffpunks.html — all required live right-rail scripts present');
  } else {
    for (const src of anchorMissing) {
      fail(`/wiki/graffpunks.html — missing: ${src}`);
    }
  }
  // data-cfasync check on canonical boot scripts
  const cfMissing = CANONICAL_BOOT_SRCS.filter(src => {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `<script[^>]*data-cfasync=["']false["'][^>]*src=["']${escaped}["']|` +
      `<script[^>]*src=["']${escaped}["'][^>]*data-cfasync=["']false["']`
    );
    return !pattern.test(anchorHtml);
  });
  if (cfMissing.length === 0) {
    pass('/wiki/graffpunks.html — all canonical boot scripts have data-cfasync="false"');
  } else {
    for (const src of cfMissing) {
      fail(`/wiki/graffpunks.html — canonical boot script missing data-cfasync="false": ${src}`);
    }
  }
  // Duplicate script check on graffpunks.html specifically
  const anchorDupes = CANONICAL_BOOT_SRCS.filter(src => {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = (anchorHtml.match(new RegExp(`src=["']${escaped}["']`, 'g')) || []).length;
    return count > 1;
  });
  if (anchorDupes.length === 0) {
    pass('/wiki/graffpunks.html — no duplicate boot scripts');
  } else {
    for (const src of anchorDupes) {
      fail(`/wiki/graffpunks.html — duplicate script: ${src}`);
    }
  }
  // page-has-right-panel class
  if (anchorHtml.includes('page-has-right-panel')) {
    pass('/wiki/graffpunks.html — page-has-right-panel class present');
  } else {
    fail('/wiki/graffpunks.html — missing page-has-right-panel class');
  }
}

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n─── Result ─────────────────────────────────────────────────────`);
console.log(`  Wiki pages scanned : ${wikiFiles.length}`);
console.log(`  Redirect (skipped) : ${skipped}`);
console.log(`  Content pages      : ${wikiFiles.length - skipped}`);
console.log(`  Failures           : ${failures}`);
if (failingPages.length > 0) {
  console.error(`\n  Pages with missing scripts (${failingPages.length}):`);
  for (const { fname } of failingPages) {
    console.error(`    wiki/${fname}`);
  }
}
console.log(`────────────────────────────────────────────────────────────────\n`);

if (failures > 0) {
  console.error(`Wiki shell guard FAILED with ${failures} failure(s).\n`);
  process.exit(1);
} else {
  console.log(`Wiki shell guard PASSED. All ${wikiFiles.length - skipped} content wiki pages have the live right-rail runtime.\n`);
  process.exit(0);
}

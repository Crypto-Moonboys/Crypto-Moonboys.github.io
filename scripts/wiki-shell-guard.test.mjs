#!/usr/bin/env node
/**
 * wiki-shell-guard.test.mjs
 *
 * Scans every wiki/*.html page and fails if a non-redirect page is missing
 * the canonical static shell runtime script stack.
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

const CANONICAL_BOOT_SRCS = [...REQUIRED_SCRIPTS];

let failures = 0;
let passes = 0;
let skipped = 0;

function fail(msg) { console.error(`  [FAIL] ${msg}`); failures += 1; }
function pass(msg) { console.log(`  [PASS] ${msg}`); passes += 1; }

function isRedirectPage(html) {
  return html.includes('http-equiv="refresh"') || html.includes("http-equiv='refresh'");
}

function scriptCount(html, src) {
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (html.match(new RegExp(`src=["']${escaped}["']`, 'g')) || []).length;
}

function hasCfBypass(html, src) {
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<script[^>]*data-cfasync=["']false["'][^>]*src=["']${escaped}["']|` +
    `<script[^>]*src=["']${escaped}["'][^>]*data-cfasync=["']false["']`
  ).test(html);
}

function assertOrdered(html, rel, orderedScripts) {
  for (let i = 1; i < orderedScripts.length; i += 1) {
    const previous = orderedScripts[i - 1];
    const current = orderedScripts[i];
    const previousIdx = html.indexOf(previous);
    const currentIdx = html.indexOf(current);
    if (previousIdx === -1 || currentIdx === -1) continue;
    if (currentIdx < previousIdx) {
      fail(`${rel} - ${current} loads before ${previous}`);
    }
  }
}

const wikiFiles = fs.readdirSync(WIKI_DIR)
  .filter((f) => f.endsWith('.html'))
  .sort();

console.log('\n--- Wiki Shell Guard ---\n');
console.log(`Scanning ${wikiFiles.length} wiki pages for required shell scripts...\n`);

const failingPages = [];
const orderedBoot = [
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
];

for (const fname of wikiFiles) {
  const rel = `wiki/${fname}`;
  const fullPath = path.join(WIKI_DIR, fname);
  const html = fs.readFileSync(fullPath, 'utf8');

  if (isRedirectPage(html)) {
    skipped += 1;
    continue;
  }

  const missing = REQUIRED_SCRIPTS.filter((src) => !html.includes(src));
  if (missing.length > 0) {
    failingPages.push({ fname, missing });
    for (const src of missing) fail(`${rel} - missing required script: ${src}`);
  }

  for (const src of CANONICAL_BOOT_SRCS) {
    if (html.includes(src) && !hasCfBypass(html, src)) {
      fail(`${rel} - script missing data-cfasync="false": ${src}`);
    }
    const count = scriptCount(html, src);
    if (count > 1) fail(`${rel} - duplicate script (${count}x): ${src}`);
  }

  assertOrdered(html, rel, orderedBoot);

  if (html.includes('page-has-right-panel')) {
    fail(`${rel} - static wiki page must not force-enable page-has-right-panel`);
  }
  if (!html.includes('page-standard-shell')) {
    fail(`${rel} - static wiki page must use page-standard-shell`);
  }
}

console.log('\n--- Regression anchor: /wiki/graffpunks.html ---\n');
const anchorPath = path.join(WIKI_DIR, 'graffpunks.html');
if (!fs.existsSync(anchorPath)) {
  fail('/wiki/graffpunks.html - file not found');
} else {
  const anchorHtml = fs.readFileSync(anchorPath, 'utf8');
  if (anchorHtml.includes('Graffpunks') || anchorHtml.includes('GRAFFPUNKS')) {
    pass('/wiki/graffpunks.html - article content preserved (Graffpunks present)');
  } else {
    fail('/wiki/graffpunks.html - article content missing (Graffpunks not found)');
  }

  const anchorMissing = REQUIRED_SCRIPTS.filter((src) => !anchorHtml.includes(src));
  if (anchorMissing.length === 0) {
    pass('/wiki/graffpunks.html - all required shell scripts present');
  } else {
    for (const src of anchorMissing) fail(`/wiki/graffpunks.html - missing: ${src}`);
  }

  const cfMissing = CANONICAL_BOOT_SRCS.filter((src) => !hasCfBypass(anchorHtml, src));
  if (cfMissing.length === 0) {
    pass('/wiki/graffpunks.html - all canonical boot scripts have data-cfasync="false"');
  } else {
    for (const src of cfMissing) {
      fail(`/wiki/graffpunks.html - canonical boot script missing data-cfasync="false": ${src}`);
    }
  }

  const anchorDupes = CANONICAL_BOOT_SRCS.filter((src) => scriptCount(anchorHtml, src) > 1);
  if (anchorDupes.length === 0) {
    pass('/wiki/graffpunks.html - no duplicate boot scripts');
  } else {
    for (const src of anchorDupes) fail(`/wiki/graffpunks.html - duplicate script: ${src}`);
  }

  assertOrdered(anchorHtml, '/wiki/graffpunks.html', [
    ...orderedBoot,
    '/js/wiki.js',
    '/js/bible-loader.js',
  ]);

  if (anchorHtml.includes('page-has-right-panel')) {
    fail('/wiki/graffpunks.html - static wiki article must not force-enable page-has-right-panel');
  } else {
    pass('/wiki/graffpunks.html - static wiki article does not force-enable page-has-right-panel');
  }
  if (anchorHtml.includes('page-standard-shell')) {
    pass('/wiki/graffpunks.html - static wiki article uses page-standard-shell');
  } else {
    fail('/wiki/graffpunks.html - missing page-standard-shell');
  }
}

console.log('\n--- Result ---');
console.log(`  Wiki pages scanned : ${wikiFiles.length}`);
console.log(`  Redirect skipped   : ${skipped}`);
console.log(`  Content pages      : ${wikiFiles.length - skipped}`);
console.log(`  Passes             : ${passes}`);
console.log(`  Failures           : ${failures}`);
if (failingPages.length > 0) {
  console.error(`\n  Pages with missing scripts (${failingPages.length}):`);
  for (const { fname } of failingPages) console.error(`    wiki/${fname}`);
}

if (failures > 0) {
  console.error(`Wiki shell guard FAILED with ${failures} failure(s).\n`);
  process.exit(1);
}

console.log(`Wiki shell guard PASSED. All ${wikiFiles.length - skipped} content wiki pages have the static shell runtime.\n`);
process.exit(0);

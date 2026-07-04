#!/usr/bin/env node
/**
 * waxcash-standalone.test.mjs
 *
 * Regression test to ensure waxcash.html maintains standalone layout
 * and does not load the global site-shell injection that broke its layout.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return existsSync(path.join(ROOT, rel));
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

let passed = 0;
let failed = 0;

function ok(label, condition, detail) {
  if (condition) {
    console.log('PASS: ' + label);
    passed += 1;
  } else {
    console.error('FAIL: ' + label + (detail ? ' - ' + detail : ''));
    failed += 1;
  }
}

// File existence checks
ok('waxcash.html exists', exists('waxcash.html'));

if (!exists('waxcash.html')) {
  console.error('\nCannot proceed: waxcash.html does not exist.');
  process.exit(1);
}

const waxcashHtml = read('waxcash.html');

// Regression: waxcash.html must NOT load site-shell.js (this was the bug)
ok('waxcash.html does NOT load /js/site-shell.js', !waxcashHtml.includes('/js/site-shell.js'),
  'This injection was breaking the standalone layout.');

// Regression: waxcash.html must NOT load connection-status-panel.js
ok('waxcash.html does NOT load /js/components/connection-status-panel.js',
  !waxcashHtml.includes('/js/components/connection-status-panel.js'));

// Regression: waxcash.html must NOT load global-player-header.js
ok('waxcash.html does NOT load /js/components/global-player-header.js',
  !waxcashHtml.includes('/js/components/global-player-header.js'));

// Regression: waxcash.html must NOT load live-activity-summary.js
ok('waxcash.html does NOT load /js/components/live-activity-summary.js',
  !waxcashHtml.includes('/js/components/live-activity-summary.js'));

// Regression: waxcash.html must NOT load wiki.js (only used for global shell)
ok('waxcash.html does NOT load /js/wiki.js',
  !waxcashHtml.includes('/js/wiki.js'));

// Sanity: waxcash.html must STILL load required scripts
ok('waxcash.html still loads /js/api-config.js',
  waxcashHtml.includes('/js/api-config.js'));

ok('waxcash.html still loads /js/site-feed-status.js',
  waxcashHtml.includes('/js/site-feed-status.js'));

ok('waxcash.html still loads /js/waxcash-analytics.js',
  waxcashHtml.includes('/js/waxcash-analytics.js'));

ok('waxcash.html still loads TradingView charting library',
  waxcashHtml.includes('alcor.exchange/charting_library/charting_library.standalone.js'));

// Sanity: waxcash.html must STILL contain required UI elements
ok('waxcash.html contains id="wx-stats"',
  waxcashHtml.includes('id="wx-stats"'));

ok('waxcash.html contains id="wx-chart"',
  waxcashHtml.includes('id="wx-chart"'));

ok('waxcash.html contains id="wx-pairs"',
  waxcashHtml.includes('id="wx-pairs"'));

ok('waxcash.html contains data-feed-status-id="waxcash_analytics"',
  waxcashHtml.includes('data-feed-status-id="waxcash_analytics"'));

ok('waxcash.html contains Home button (← Home)',
  waxcashHtml.includes('← Home'));

ok('waxcash.html Home button links to /',
  waxcashHtml.includes('<a href="/" class="wx-home-btn">← Home</a>'));

// Sanity: body tag should keep standalone identification while allowing SWARMSY shell parity tagging
ok('waxcash.html keeps page-waxcash and page-standalone-tool classes',
  /<body\b[^>]*class=["'][^"']*\bpage-waxcash\b[^"']*\bpage-standalone-tool\b[^"']*["']/u.test(waxcashHtml));

ok('waxcash.html includes page-standard-shell class',
  /<body\b[^>]*class=["'][^"']*\bpage-standard-shell\b[^"']*["']/u.test(waxcashHtml));

// Durability: verify that apply-shell.mjs respects the standalone flag
const applyShellJs = read('scripts/apply-shell.mjs');
ok('apply-shell.mjs contains isStandaloneToolPage function',
  applyShellJs.includes('isStandaloneToolPage'));

ok('apply-shell.mjs checks for page-standalone-tool flag',
  applyShellJs.includes("includes('page-standalone-tool')"));

ok('apply-shell.mjs skips shell regeneration for standalone pages',
  applyShellJs.includes('Skip shell regeneration for standalone tool pages'));

// Summary
const total = passed + failed;
console.log(`\n${passed}/${total} checks passed.`);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log('\nWAXCASH standalone layout validated ✓');

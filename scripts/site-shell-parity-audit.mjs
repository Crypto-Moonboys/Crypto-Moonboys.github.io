#!/usr/bin/env node
/**
 * site-shell-parity-audit.mjs
 *
 * After the shell moved to site-shell.js, this audit verifies:
 *  - All shell pages load site-shell.js
 *  - All shell pages have NO hardcoded shell markup
 *  - site-shell.js exists and contains canonical content
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let warnings = 0;

function fail(msg) { console.error(`  [FAIL] ${msg}`); failures += 1; }
function warn(msg) { console.warn(`  [WARN] ${msg}`); warnings += 1; }
function pass(msg) { console.log(`  [PASS] ${msg}`); }

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

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

console.log('\n─── Site Shell Parity Audit ───────────────────────────────────\n');

// 1. site-shell.js exists
console.log('[1] site-shell.js exists');
const shellJs = read('js/site-shell.js');
if (!shellJs) {
  fail('js/site-shell.js — file not found');
} else {
  pass('js/site-shell.js exists');

  // 2. Canonical content checks in site-shell.js
  console.log('\n[2] site-shell.js canonical content');
  const contentChecks = [
    ['THE CRYPTO MOONBOYS GK WIKI', 'canonical logo text'],
    ['Search the wiki\u2026', 'canonical search placeholder'],
    ['Battle Chamber', 'Battle Chamber link'],
    ['Navigation', 'canonical Navigation heading'],
  ];
  for (const [needle, label] of contentChecks) {
    if (shellJs.includes(needle)) {
      pass(`site-shell.js contains ${label}`);
    } else {
      fail(`site-shell.js missing ${label}: "${needle}"`);
    }
  }
}

// 3. Shell pages checks
console.log('\n[3] Shell pages: no hardcoded shell markup, has site-shell.js');
for (const rel of SHELL_PAGES) {
  const html = read(rel);
  if (!html) {
    fail(`${rel} — file not found`);
    continue;
  }
  let ok = true;
  if (html.includes('<header id="site-header"')) {
    fail(`${rel} — contains hardcoded <header id="site-header">`);
    ok = false;
  }
  if (html.includes('<nav id="sidebar"')) {
    fail(`${rel} — contains hardcoded <nav id="sidebar">`);
    ok = false;
  }
  if (html.includes('<footer id="site-footer"')) {
    fail(`${rel} — contains hardcoded <footer id="site-footer">`);
    ok = false;
  }
  if (!html.includes('<script src="/js/site-shell.js">')) {
    fail(`${rel} — missing <script src="/js/site-shell.js">`);
    ok = false;
  }
  if (ok) pass(`${rel}`);
}

// ── Summary ──
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

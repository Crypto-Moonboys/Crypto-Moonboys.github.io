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
  if (!html.includes('<script data-cfasync="false" src="/js/site-shell.js">')) {
    fail(`${rel} — missing <script data-cfasync="false" src="/js/site-shell.js">`);
    ok = false;
  }
  if (ok) pass(`${rel}`);
}

// 4. Shell pages: script load-order check
// site-shell.js must appear before connection-status-panel.js, global-player-header.js,
// and live-activity-summary.js on every named shell page.
console.log('\n[4] Shell pages: site-shell.js loads before shared components');
const ORDERED_COMPONENTS = [
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
];
for (const rel of SHELL_PAGES) {
  const html = read(rel);
  if (!html) continue;
  const shellIdx = html.indexOf('/js/site-shell.js');
  if (shellIdx === -1) continue; // already caught above
  let orderOk = true;
  for (const comp of ORDERED_COMPONENTS) {
    const compIdx = html.indexOf(comp);
    if (compIdx !== -1 && compIdx < shellIdx) {
      fail(`${rel} — ${comp} appears BEFORE site-shell.js`);
      orderOk = false;
    }
  }
  if (orderOk) pass(`${rel}: script order ok`);
}

// 4b. Rocket Loader bypass: all canonical boot scripts must have data-cfasync="false"
console.log('\n[4b] Canonical boot scripts must have data-cfasync="false" (Rocket Loader bypass)');
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
for (const rel of SHELL_PAGES) {
  const html = read(rel);
  if (!html) continue;
  let cfOk = true;
  for (const src of CANONICAL_BOOT_SRCS) {
    // Match a <script tag for this src that contains data-cfasync="false"
    // A script tag is compliant if it has data-cfasync="false" before the src, or
    // simply if data-cfasync="false" appears on the same script tag.
    // We check by looking for data-cfasync="false" src="<src>" or src="<src>" ... data-cfasync
    const pattern = new RegExp(
      '<script[^>]*data-cfasync=["\']false["\'][^>]*src=["\']' +
      src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '["\']|' +
      '<script[^>]*src=["\']' +
      src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '["\'][^>]*data-cfasync=["\']false["\']'
    );
    if (!pattern.test(html)) {
      fail(`${rel} — canonical boot script missing data-cfasync="false": ${src}`);
      cfOk = false;
    }
  }
  if (cfOk) pass(`${rel}: all canonical boot scripts have data-cfasync="false"`);
}

// 5. Named live pages must include live-activity-summary.js
console.log('\n[5] Named live pages include live-activity-summary.js');
const LIVE_PAGES = [
  'index.html',
  'sam.html',
  'graph.html',
  'search.html',
  'timeline.html',
  'games/leaderboard.html',
];
for (const rel of LIVE_PAGES) {
  const html = read(rel);
  if (!html) { warn(`${rel} — not found`); continue; }
  if (html.includes('/js/components/live-activity-summary.js')) {
    pass(`${rel}: live-activity-summary.js present`);
  } else {
    fail(`${rel} — missing live-activity-summary.js`);
  }
}

// 6. Right-panel trigger: named live pages must have page-has-right-panel class
//    OR be in the canonical allowlist in site-shell.js
console.log('\n[6] Right-panel trigger present on named live pages');
const RIGHT_PANEL_ALLOWLIST = [
  '/index.html', '/sam.html', '/graph.html', '/search.html', '/timeline.html',
  '/dashboard.html', '/community.html', '/how-to-play.html',
  '/games/', '/games/index.html', '/games/leaderboard.html',
];
for (const rel of LIVE_PAGES) {
  const html = read(rel);
  if (!html) continue;
  const normPath = '/' + rel.replace(/\\/g, '/');
  if (html.includes('page-has-right-panel') || RIGHT_PANEL_ALLOWLIST.includes(normPath)) {
    pass(`${rel}: right-panel trigger present`);
  } else {
    fail(`${rel} — missing page-has-right-panel class and not in canonical allowlist`);
  }
}

// 7. DOM smoke test: site-shell.js must contain all right-panel element markers
console.log('\n[7] site-shell.js DOM smoke test (static string check)');
if (shellJs) {
  const SMOKE_CHECKS = [
    { needle: "rightPanel.id = 'homepage-right-panel'", label: '#homepage-right-panel' },
    { needle: 'data-csp-panel',            label: '[data-csp-panel]' },
    { needle: 'data-las-panel',            label: '[data-las-panel]' },
    { needle: 'id="live-feed-widget"',     label: '#live-feed-widget' },
    { needle: 'shouldShowRightPanel',      label: 'shouldShowRightPanel() helper' },
  ];
  for (const { needle, label } of SMOKE_CHECKS) {
    if (shellJs.includes(needle)) {
      pass(`site-shell.js smoke: ${label} present`);
    } else {
      fail(`site-shell.js smoke: ${label} MISSING`);
    }
  }
}

// 8. Hamburger/sidebar binding in site-shell.js
console.log('\n[8] site-shell.js hamburger/sidebar binding');
if (shellJs) {
  const SIDEBAR_CHECKS = [
    { needle: '__MOONBOYS_SIDEBAR_BOUND', label: 'window.__MOONBOYS_SIDEBAR_BOUND marker' },
    { needle: 'sidebar-open',            label: 'body.sidebar-open canonical class' },
    { needle: '_shellSetSidebarOpen',    label: '_shellSetSidebarOpen() helper function' },
  ];
  for (const { needle, label } of SIDEBAR_CHECKS) {
    if (shellJs.includes(needle)) {
      pass(`site-shell.js sidebar: ${label} present`);
    } else {
      fail(`site-shell.js sidebar: ${label} MISSING`);
    }
  }
}

// 9. wiki.js sidebar binding: readyState guard and idempotent binding
console.log('\n[9] wiki.js sidebar binding (readyState guard + idempotent)');
const wikiJs = read('js/wiki.js');
if (!wikiJs) {
  fail('js/wiki.js — file not found');
} else {
  const WIKI_SIDEBAR_CHECKS = [
    { needle: '__MOONBOYS_SIDEBAR_BOUND', label: 'window.__MOONBOYS_SIDEBAR_BOUND idempotency check' },
    { needle: "sidebar-open",             label: 'body.sidebar-open canonical class' },
    { needle: "document.readyState",      label: 'document.readyState guard (deferred-script support)' },
  ];
  for (const { needle, label } of WIKI_SIDEBAR_CHECKS) {
    if (wikiJs.includes(needle)) {
      pass(`wiki.js sidebar: ${label} present`);
    } else {
      fail(`wiki.js sidebar: ${label} MISSING`);
    }
  }
}

// 10. CSS: body.sidebar-open rules present in wiki.css
console.log('\n[10] wiki.css body.sidebar-open rules');
const wikiCss = read('css/wiki.css');
if (!wikiCss) {
  fail('css/wiki.css — file not found');
} else {
  const CSS_CHECKS = [
    { needle: 'body.sidebar-open #sidebar',         label: 'body.sidebar-open #sidebar rule' },
    { needle: 'body.sidebar-open #sidebar-overlay', label: 'body.sidebar-open #sidebar-overlay rule' },
  ];
  for (const { needle, label } of CSS_CHECKS) {
    if (wikiCss.includes(needle)) {
      pass(`wiki.css: ${needle} present`);
    } else {
      fail(`wiki.css: ${label} MISSING`);
    }
  }
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

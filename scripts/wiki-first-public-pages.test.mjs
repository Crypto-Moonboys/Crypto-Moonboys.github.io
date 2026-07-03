#!/usr/bin/env node
/**
 * wiki-first-public-pages.test.mjs
 *
 * Shell coverage guard v2:
 * 1. Unified Wiki Shell v1 configuration validation
 * 2. All public pages must include /js/site-shell.js (except redirects and standalone tools)
 * 3. No hardcoded competing global nav/header/footer markup
 * 4. Verify redirect targets point to valid wiki/search/canonical routes
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellPath = path.join(ROOT, 'js/site-shell.js');
const cssPath = path.join(ROOT, 'css/wiki-shell-v1.css');

let failures = 0;
let passes = 0;
let redirects = 0;
let standaloneTools = 0;

function fail(message) { console.error(`  [FAIL] ${message}`); failures += 1; }
function pass(message) { console.log(`  [PASS] ${message}`); passes += 1; }
function read(relPath) { return fs.readFileSync(path.join(ROOT, relPath), 'utf8'); }

console.log('\n--- Unified Wiki Shell v1 Guard ---\n');

if (!fs.existsSync(shellPath)) fail('js/site-shell.js missing');
if (!fs.existsSync(cssPath)) fail('css/wiki-shell-v1.css missing');

const shell = fs.existsSync(shellPath) ? read('js/site-shell.js') : '';
const css = fs.existsSync(cssPath) ? read('css/wiki-shell-v1.css') : '';

const requiredShellNeedles = [
  'Unified Wiki Shell v1',
  'CANONICAL_PUBLIC_ROOT',
  "const CANONICAL_PUBLIC_ROOT = '/wiki/'",
  'window.MOONBOYS_WIKI_SHELL',
  'resolveCanonicalWikiRoute',
  'wiki-shell-mode-',
  'wiki-route-banner',
  'Search the wiki…',
  'THE CRYPTO MOONBOYS GK WIKI'
];

for (const needle of requiredShellNeedles) {
  if (shell.includes(needle)) pass(`site-shell.js contains "${needle}"`);
  else fail(`site-shell.js missing "${needle}"`);
}

const requiredNavLabels = ['HOME', 'WIKI', 'GAMES', 'BATTLE CHAMBER', 'SWARMSY', 'SYSTEM HUB'];
for (const label of requiredNavLabels) {
  if (shell.includes(`label: '${label}'`) || shell.includes(`label: "${label}"`)) pass(`global nav label present: ${label}`);
  else fail(`global nav label missing: ${label}`);
}

const routeNeedles = [
  "if (p.startsWith('/games/')) return '/wiki/games-graffpunks.html'",
  "if (p.startsWith('/battle-chamber/') || p === '/community.html') return '/search.html?q=Battle%20Chamber'",
  "if (p === '/dashboard.html' || p === '/admin-tools.html') return '/search.html?q=System%20Hub'",
  "if (p === '/swarmsy.html' || p === '/sparky.html') return '/search.html?q=SWARMSY'"
];
for (const needle of routeNeedles) {
  if (shell.includes(needle)) pass(`canonical route rule present`);
  else fail(`canonical route rule missing: ${needle}`);
}

const cssNeedles = [
  'body.wiki-shell-v1 #site-header',
  'body.wiki-shell-v1 #global-nav',
  'body.wiki-shell-v1 #sidebar',
  'body.wiki-shell-v1.sidebar-open #sidebar',
  'body.wiki-shell-v1 .wiki-route-banner',
  'body.wiki-shell-v1 #site-paperclip-agent'
];
for (const needle of cssNeedles) {
  if (css.includes(needle)) pass(`css rule present`);
  else fail(`css rule missing: ${needle}`);
}

if (shell.includes('/paperclip.html')) fail('site-shell.js must not link retired /paperclip.html');
else pass('retired /paperclip.html link absent');

if (shell.includes('No login')) fail('site-shell.js must not claim No login');
else pass('outdated No login claim absent');

console.log('\n--- Public Page Shell Coverage Guard ---\n');

// Collect all public HTML files to scan
function collectPublicPages() {
  const pages = [];
  
  // Helper to recursively walk a directory and collect .html files
  const walkDir = (dir, prefix) => {
    for (const f of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath, prefix + f + '/');
      } else if (f.endsWith('.html')) {
        pages.push(prefix + f);
      }
    }
  };
  
  // Root *.html (except _*)
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.html') && !f.startsWith('_')) {
      pages.push(f);
    }
  }
  
  // about/**/*.html (recursive)
  const aboutDir = path.join(ROOT, 'about');
  if (fs.existsSync(aboutDir)) {
    walkDir(aboutDir, 'about/');
  }
  
  // categories/**/*.html (recursive)
  const categoriesDir = path.join(ROOT, 'categories');
  if (fs.existsSync(categoriesDir)) {
    walkDir(categoriesDir, 'categories/');
  }
  
  // games/**/*.html (recursive, but not wiki/*.html - that's covered by wiki-shell-guard)
  const gamesDir = path.join(ROOT, 'games');
  if (fs.existsSync(gamesDir)) {
    walkDir(gamesDir, 'games/');
  }
  
  // battle-chamber/**/*.html (recursive)
  const battleDir = path.join(ROOT, 'battle-chamber');
  if (fs.existsSync(battleDir)) {
    walkDir(battleDir, 'battle-chamber/');
  }

  // analytics/**/*.html (recursive)
  const analyticsDir = path.join(ROOT, 'analytics');
  if (fs.existsSync(analyticsDir)) {
    walkDir(analyticsDir, 'analytics/');
  }

  // waxonedge/**/*.html (recursive)
  const waxonedgeDir = path.join(ROOT, 'waxonedge');
  if (fs.existsSync(waxonedgeDir)) {
    walkDir(waxonedgeDir, 'waxonedge/');
  }

  return pages.sort();
}

const publicPages = collectPublicPages();
console.log(`Scanning ${publicPages.length} public HTML pages for shell coverage...\n`);

// Canonical shell boot stack for public content pages (in required load order).
// /js/wiki.js is intentionally excluded — wiki pages are covered by wiki-shell-guard.test.mjs.
const SHELL_BOOT_STACK = [
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

// Helpers
function isRedirectPage(html) {
  return html.includes('http-equiv="refresh"') || html.includes("http-equiv='refresh'");
}

function isStandaloneToolPage(bodyAttrs) {
  return bodyAttrs.includes('page-standalone-tool');
}

function extractBodyAttrs(html) {
  const m = html.match(/<body\s+([^>]*)>/i);
  return m ? m[1].trim() : '';
}

function hasShellClass(bodyAttrs) {
  // Accept various shell and page-variant classes
  return bodyAttrs.includes('page-standard-shell') || 
         bodyAttrs.includes('page-action-shell') || 
         bodyAttrs.includes('page-game-shell') ||
         bodyAttrs.includes('page-game') ||
         bodyAttrs.includes('page-community') ||
         bodyAttrs.includes('page-waxcash') ||
         bodyAttrs.includes('page-admin') ||
         bodyAttrs.includes('page-dashboard');
}

function hasHardcodedCompetingMarkup(html) {
  // Check for hardcoded markup that competes with shell-provided elements
  // These are specific element IDs/classes that the shell manages:
  // - site-header (shell provides this)
  // - global-nav (shell provides this)
  // - site-footer (shell provides this)
  // Look for these in element tags, not in content text
  
  // Match actual HTML tags with these IDs/classes
  if (/<[a-z][^>]*\bid=["']site-header["'][^>]*>/i.test(html)) return true;
  if (/<[a-z][^>]*\bid=["']global-nav["'][^>]*>/i.test(html)) return true;
  if (/<[a-z][^>]*\bid=["']site-footer["'][^>]*>/i.test(html)) return true;
  if (/<[a-z][^>]*\bclass=["'][^"']*global-header[^"']*["'][^>]*>/i.test(html)) return true;
  if (/<[a-z][^>]*\bclass=["'][^"']*global-footer[^"']*["'][^>]*>/i.test(html)) return true;
  
  return false;
}

function scriptCount(html, src) {
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (html.match(new RegExp(`src=["']${escaped}["']`, 'g')) || []).length;
}

function validateBootStack(html) {
  // Returns an array of error strings (empty = pass)
  const errors = [];
  const positions = SHELL_BOOT_STACK.map(s => html.indexOf(s));
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] === -1) {
      errors.push(`missing boot script: ${SHELL_BOOT_STACK[i]}`);
    }
  }
  // Only check order when all scripts are present
  if (errors.length === 0) {
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] < positions[i - 1]) {
        errors.push(`boot order violation: ${SHELL_BOOT_STACK[i]} appears before ${SHELL_BOOT_STACK[i - 1]}`);
      }
    }
  }
  return errors;
}

function validateRedirectTarget(html, pagePath) {
  // Extract refresh URL
  const refreshMatch = html.match(/http-equiv=["']refresh["']\s+content=["'].*?URL=([^"']+)/i);
  if (!refreshMatch) return false;

  // Normalize: trim whitespace, strip query and hash for path validation
  const raw = refreshMatch[1].trim();
  const target = raw.replace(/[?#].*$/, '');

  // Must be internal (no scheme = not external)
  if (/^https?:\/\//i.test(target)) return false;

  // Valid redirect targets: wiki pages, search pages, canonical routes, or root HTML files
  if (target.startsWith('/wiki/') || target.startsWith('/search.html')) return true;
  if (target === '/index.html' || target === '/' || target === '/about.html') return true;
  if (target.startsWith('/battle-chamber/')) return true;
  if (target.startsWith('/games/')) return true;
  if (target.startsWith('/categories/')) return true;
  if (target.startsWith('/about/')) return true;
  if (target.startsWith('/analytics/')) return true;
  if (target.startsWith('/waxonedge/')) return true;
  // Allow any existing root HTML file (e.g. /waxonedge.html, /community.html)
  if (/^\/[^/]+\.html$/.test(target) && fs.existsSync(path.join(ROOT, target.slice(1)))) return true;

  return false;
}

const failingPages = [];

for (const pagePath of publicPages) {
  const fullPath = path.join(ROOT, pagePath);
  let html;
  try {
    html = fs.readFileSync(fullPath, 'utf8');
  } catch {
    fail(`${pagePath} - could not read file`);
    continue;
  }
  
  const bodyAttrs = extractBodyAttrs(html);
  
  // Redirect pages: verify they redirect to valid targets
  if (isRedirectPage(html)) {
    if (validateRedirectTarget(html, pagePath)) {
      pass(`${pagePath} - redirect to valid target`);
    } else {
      fail(`${pagePath} - redirect target not in allowed routes (wiki/search/canonical)`);
    }
    redirects += 1;
    continue;
  }
  
  // Standalone tools: allowed to have custom scripts
  if (isStandaloneToolPage(bodyAttrs)) {
    pass(`${pagePath} - standalone tool (custom scripts allowed)`);
    standaloneTools += 1;
    continue;
  }
  
  // Regular content pages: validate full canonical shell boot stack (presence + order)
  const bootErrors = validateBootStack(html);
  if (bootErrors.length > 0) {
    for (const e of bootErrors) fail(`${pagePath} - ${e}`);
    failingPages.push(pagePath);
    continue;
  } else {
    pass(`${pagePath} - canonical boot stack present and in order`);
  }
  
  // Must have a shell class (unless it's a special page)
  if (!hasShellClass(bodyAttrs)) {
    fail(`${pagePath} - missing shell class (accepted: page-standard-shell, page-action-shell, page-game-shell, page-game, page-community, page-waxcash, page-admin, page-dashboard)`);
  } else {
    pass(`${pagePath} - has shell class`);
  }
  
  // Check for hardcoded competing markup
  if (hasHardcodedCompetingMarkup(html)) {
    fail(`${pagePath} - has hardcoded competing global nav/header/footer`);
  } else {
    pass(`${pagePath} - no hardcoded competing markup`);
  }
  
  // Check for duplicate shell script
  const shellCount = scriptCount(html, '/js/site-shell.js');
  if (shellCount > 1) {
    fail(`${pagePath} - site-shell.js loaded ${shellCount} times (should be 1)`);
  }
}

console.log('\n--- Result ---');
console.log(`  Public pages scanned  : ${publicPages.length}`);
console.log(`  Redirects skipped     : ${redirects}`);
console.log(`  Standalone tools      : ${standaloneTools}`);
console.log(`  Content pages checked : ${publicPages.length - redirects - standaloneTools}`);
console.log(`  Passes                : ${passes}`);
console.log(`  Failures              : ${failures}`);

if (failingPages.length > 0) {
  console.error(`\n  Pages missing shell (${failingPages.length}):`);
  for (const p of failingPages) console.error(`    ${p}`);
}

if (failures > 0) {
  console.error(`\nShell coverage guard v2 FAILED with ${failures} failure(s).\n`);
  process.exit(1);
}

console.log(`\nShell coverage guard v2 PASSED.\n`);

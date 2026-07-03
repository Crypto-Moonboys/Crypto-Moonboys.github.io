#!/usr/bin/env node
/**
 * wiki-first-public-pages.test.mjs
 *
 * Guardrail for unified wiki shell v1:
 * - site-shell.js must expose the single navigation authority.
 * - the compact shell stylesheet must exist.
 * - every required global nav label must be in the runtime shell.
 * - legacy public routes must resolve back to wiki/search routes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellPath = path.join(ROOT, 'js/site-shell.js');
const cssPath = path.join(ROOT, 'css/wiki-shell-v1.css');

let failures = 0;
function fail(message) { console.error(`  [FAIL] ${message}`); failures += 1; }
function pass(message) { console.log(`  [PASS] ${message}`); }
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
  if (shell.includes(needle)) pass(`site-shell.js contains ${needle}`);
  else fail(`site-shell.js missing ${needle}`);
}

const requiredNavLabels = ['HOME', 'WIKI', 'GAMES', 'BATTLE CHAMBER', 'SWARMSY', 'SYSTEM HUB'];
for (const label of requiredNavLabels) {
  if (shell.includes(`label: '${label}'`) || shell.includes(`label: \"${label}\"`)) pass(`global nav label present: ${label}`);
  else fail(`global nav label missing: ${label}`);
}

const routeNeedles = [
  "if (p.startsWith('/games/')) return '/wiki/games-graffpunks.html'",
  "if (p.startsWith('/battle-chamber/') || p === '/community.html') return '/search.html?q=Battle%20Chamber'",
  "if (p === '/dashboard.html' || p === '/admin-tools.html') return '/search.html?q=System%20Hub'",
  "if (p === '/swarmsy.html' || p === '/sparky.html') return '/search.html?q=SWARMSY'"
];
for (const needle of routeNeedles) {
  if (shell.includes(needle)) pass(`canonical route rule present: ${needle}`);
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
  if (css.includes(needle)) pass(`css rule present: ${needle}`);
  else fail(`css rule missing: ${needle}`);
}

if (shell.includes('/paperclip.html')) fail('site-shell.js must not link retired /paperclip.html');
else pass('retired /paperclip.html link absent');

if (shell.includes('No login')) fail('site-shell.js must not claim No login');
else pass('outdated No login claim absent');

console.log('\n--- Result ---');
console.log(`  Failures: ${failures}`);

if (failures > 0) {
  console.error('Unified Wiki Shell v1 guard FAILED.\n');
  process.exit(1);
}

console.log('Unified Wiki Shell v1 guard PASSED.\n');

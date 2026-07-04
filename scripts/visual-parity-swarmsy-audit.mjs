#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_SHELL_CSS = 'css/wiki-shell-v1.css';
const SITE_SHELL_JS = 'js/site-shell.js';
const RETRO_LINK_RE = /<link[^>]+href=["'][^"']*\/css\/retro-16bit-theme\.css["'][^>]*>/i;
const AUTHORITY_LINK_RE = /<link[^>]+href=["'][^"']*\/css\/swarmsy-visual-authority\.css["'][^>]*>/i;
const PRESS_START_RE = /Press\+Start\+2P|Press Start 2P/i;
const DEBUG_TEXTS = [
  'Unified Wiki Shell v1',
  'Public route mounted through the wiki UI',
  'Canonical wiki route',
];
const SAMPLE_PAGES = [
  'search.html',
  'wiki/gkniftyheads.html',
  'wiki/gkniftyheads-nft-collection.html',
  'categories/index.html',
  'battle-chamber/factions/index.html',
  'about.html',
  'games/index.html',
];

let failures = 0;
const fail = (msg) => { console.error(`  [FAIL] ${msg}`); failures += 1; };
const pass = (msg) => console.log(`  [PASS] ${msg}`);
const read = (rel) => {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
};

function getAllHtmlFiles(dir = '') {
  const out = [];
  const full = path.join(ROOT, dir);
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...getAllHtmlFiles(rel));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

function isRedirectPage(html) {
  return /http-equiv=["']refresh["']/i.test(html);
}

function bodyAttrs(html) {
  const m = html.match(/<body\s+([^>]*)>/i);
  return m ? m[1] : '';
}

function isStandaloneToolPage(html) {
  return bodyAttrs(html).includes('page-standalone-tool');
}

function isNormalPublicPage(rel, html) {
  return !isRedirectPage(html) && !isStandaloneToolPage(html) && !rel.startsWith('.github/');
}

console.log('\n─── SWARMSY Visual Parity Audit ───────────────────────────────────\n');

const allHtml = getAllHtmlFiles();
const normalPages = allHtml
  .map((rel) => ({ rel, html: read(rel) }))
  .filter(({ html }) => !!html)
  .filter(({ rel, html }) => isNormalPublicPage(rel, html));

console.log('[1] Enforcing no retro/authority/pixel-font links on normal public pages');
let oldStackOk = true;
for (const { rel, html } of normalPages) {
  if (RETRO_LINK_RE.test(html)) {
    fail(`${rel} - must not load /css/retro-16bit-theme.css`);
    oldStackOk = false;
  }
  if (AUTHORITY_LINK_RE.test(html)) {
    fail(`${rel} - must not load /css/swarmsy-visual-authority.css`);
    oldStackOk = false;
  }
  if (PRESS_START_RE.test(html)) {
    fail(`${rel} - must not load Press Start 2P on normal public pages`);
    oldStackOk = false;
  }
}
if (oldStackOk) pass('No normal public page loads retro/authority/pixel-font stack');

console.log('\n[2] Enforcing no public shell/debug/version wording leakage');
let debugCopyOk = true;
for (const { rel, html } of normalPages) {
  for (const text of DEBUG_TEXTS) {
    if (html.includes(text)) {
      fail(`${rel} - contains forbidden public debug text: "${text}"`);
      debugCopyOk = false;
    }
  }
}
const siteShell = read(SITE_SHELL_JS) || '';
for (const text of DEBUG_TEXTS) {
  if (siteShell.includes(text)) {
    fail(`${SITE_SHELL_JS} - contains forbidden debug text: "${text}"`);
    debugCopyOk = false;
  }
}
if (/function\s+renderLegacyRouteBanner\s*\(/.test(siteShell)) {
  fail(`${SITE_SHELL_JS} - renderLegacyRouteBanner() must be removed`);
  debugCopyOk = false;
}
if (debugCopyOk) pass('No forbidden shell/debug/version wording is exposed');

console.log('\n[3] Enforcing one clean global shell stylesheet');
let shellCssOk = true;
const shellCss = read(GLOBAL_SHELL_CSS);
if (!shellCss) {
  fail(`${GLOBAL_SHELL_CSS} - file not found`);
  shellCssOk = false;
} else {
  const shellLayoutBlock = /#layout[\s\S]*?\{[\s\S]*?width:\s*100%[\s\S]*?\}/.test(shellCss)
    && /#main-wrapper[\s\S]*?\{[\s\S]*?width:\s*100%[\s\S]*?\}/.test(shellCss)
    && /#content[\s\S]*?\{[\s\S]*?width:\s*100%[\s\S]*?\}/.test(shellCss);
  if (!shellLayoutBlock) {
    fail(`${GLOBAL_SHELL_CSS} - must define global full-width #layout/#main-wrapper/#content rules`);
    shellCssOk = false;
  }
  if (/#(?:layout|main-wrapper|content)[^{]*\{[^}]*max-width\s*:/i.test(shellCss)) {
    fail(`${GLOBAL_SHELL_CSS} - must not cap #layout/#main-wrapper/#content with max-width`);
    shellCssOk = false;
  }
  if (/!important/.test(shellCss)) {
    fail(`${GLOBAL_SHELL_CSS} - must not rely on !important cascade-war overrides`);
    shellCssOk = false;
  }
}
if (fs.existsSync(path.join(ROOT, 'css/swarmsy-visual-authority.css'))) {
  fail('css/swarmsy-visual-authority.css - must not exist as the fix layer');
  shellCssOk = false;
}
if (shellCssOk) pass('Global shell stylesheet is clean and full-width without authority/override layering');

console.log('\n[4] Enforcing no shell max-width caps in public page-level style blocks');
let inlineLayoutOk = true;
for (const { rel, html } of normalPages) {
  if (!html.includes('page-standard-shell')) continue;
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const style = m[1];
    if (/#(?:layout|main-wrapper|content)[^{]*\{[^}]*max-width\s*:\s*\d+px/i.test(style)) {
      fail(`${rel} - contains legacy max-width cap for shell containers in inline style`);
      inlineLayoutOk = false;
    }
  }
}
if (inlineLayoutOk) pass('No shell container max-width caps found in inline page styles');

console.log('\n[5] SWARMSY parity spot-check on required sample pages');
let sampleOk = true;
for (const rel of SAMPLE_PAGES) {
  const html = read(rel);
  if (!html) {
    fail(`${rel} - file missing`);
    sampleOk = false;
    continue;
  }
  if (!html.includes('page-standard-shell')) {
    fail(`${rel} - missing page-standard-shell class`);
    sampleOk = false;
  }
  if (!html.includes('src="/js/site-shell.js"')) {
    fail(`${rel} - missing /js/site-shell.js boot`);
    sampleOk = false;
  }
  if (!rel.startsWith('wiki/')) {
    if (/\b(?:game-window|crt|scanline)\b/i.test(html)) {
      fail(`${rel} - contains retro visual marker tokens outside isolated retro routes`);
      sampleOk = false;
    }
  }
}
if (sampleOk) pass('Required sample pages are wired to global shell and free of retro markers');

console.log('\n─────────────────────────────────────────────────────────────────────');
if (failures === 0) {
  console.log('\n✓ Visual parity audit passed.\n');
  process.exit(0);
}
console.log(`\n✗ Visual parity audit FAILED: ${failures} failure(s)\n`);
process.exit(1);

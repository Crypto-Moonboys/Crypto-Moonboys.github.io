#!/usr/bin/env node
/**
 * visual-parity-swarmsy-audit.mjs
 *
 * Verifies that all public shell pages use the unified SWARMSY visual system:
 *  - All public shell pages have page-standard-shell class
 *  - No old inline card/button CSS in <style> blocks
 *  - No old rounded soft app buttons (border-radius 6-8px)
 *  - No mixed old/new visual styling
 *  - All cards use SWARMSY-compatible styling
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

function getHTMLFiles(dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(path.join(dir, entry.name));
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'wiki') {
        files.push(...getHTMLFiles(path.join(dir, entry.name)));
      }
    }
  } catch (e) {
    // Directory doesn't exist or can't be read
  }
  return files;
}

// Pages that should have page-standard-shell
const SHELL_PAGES = [
  'index.html',
  'search.html',
  'community.html',
  'how-to-play.html',
  'paths.html',
  'gkniftyheads-incubator.html',
];

// Pages that should NOT have page-standard-shell (special/fullscreen pages)
const EXCLUDED_SHELL_PAGES = [
  'agent.html',
  'dashboard.html',
  'waxcash.html', // has page-standalone-tool
  'admin-tools.html',
  'sam.html',
  'sparky.html',
];

// Get all category pages
const categoryPages = getHTMLFiles('categories');

// Get all faction pages
const factionPages = getHTMLFiles('battle-chamber/factions');

// Get all game pages (except fullscreen canvas)
const gamePages = getHTMLFiles('games').filter(p => p === 'games/index.html');

const pagesToCheck = [
  ...SHELL_PAGES,
  ...categoryPages,
  ...factionPages,
  ...gamePages,
];

console.log('\n─── SWARMSY Visual Parity Audit ───────────────────────────────────\n');

// 1. Check page-standard-shell presence
console.log('[1] Checking page-standard-shell class on public pages');
let shellOk = true;

for (const pagePath of pagesToCheck) {
  const html = read(pagePath);
  if (!html) continue;
  
  const hasShellClass = html.includes('page-standard-shell');
  
  if (!hasShellClass) {
    fail(`${pagePath} - missing page-standard-shell class`);
    shellOk = false;
  }
}

if (shellOk) pass('All public shell pages have page-standard-shell class');

// 2. Check for inline card/button CSS in <style> blocks
console.log('\n[2] Checking for old inline card/button CSS in <style> blocks');
const oldCSSPatterns = [
  /\.bc-hero-cta\s*{[^}]*border-radius:\s*[0-9]+px/,
  /\.category-card\s*{[^}]*border-radius:\s*[0-9]+px/,
  /\.article-card\s*{[^}]*border-radius:\s*[0-9]+px/,
  /border-radius:\s*[0-9]px/,
  /border-radius:\s*[0-9]\.?[0-9]*px/,
];

let inlineCSSOk = true;

for (const pagePath of pagesToCheck) {
  const html = read(pagePath);
  if (!html) continue;
  
  // Extract <style> block
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) continue;
  
  const styleContent = styleMatch[1];
  
  // Check for problematic inline CSS patterns
  const hasBCHeroCTA = styleContent.includes('.bc-hero-cta');
  const hasCategoryCard = styleContent.includes('.category-card');
  const hasArticleCard = styleContent.includes('.article-card');
  
  if (hasBCHeroCTA || hasCategoryCard || hasArticleCard) {
    warn(`${pagePath} - found old card/button CSS in <style> block (should use global wiki.css)`);
    inlineCSSOk = false;
  }
}

if (inlineCSSOk) pass('No old inline card/button CSS found in <style> blocks');

// 3. Check for old border-radius patterns (should be 14px+)
console.log('\n[3] Checking for old soft button radii (< 14px)');
let radiusOk = true;

const radiusPattern = /border-radius\s*:\s*(\d+)(?:px)?/g;

for (const pagePath of pagesToCheck) {
  const html = read(pagePath);
  if (!html) continue;
  
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) continue;
  
  const styleContent = styleMatch[1];
  
  // Look for old small radii in button/card classes
  const smallRadiiMatches = styleContent.matchAll(/\.(bc-hero-cta|bc-cta-btn|category-card|article-card|notice)[^{]*{[^}]*border-radius\s*:\s*(\d+)px/g);
  
  for (const match of smallRadiiMatches) {
    const radius = parseInt(match[2]);
    if (radius < 14) {
      warn(`${pagePath} - old small border-radius ${radius}px found (should be 14px+ for SWARMSY compatibility)`);
      radiusOk = false;
    }
  }
}

if (radiusOk) pass('All button/card border-radius values are SWARMSY-compatible (14px+)');

// 4. Check for missing shell boot scripts
console.log('\n[4] Checking for canonical shell boot scripts');
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
];

let bootScriptsOk = true;

for (const pagePath of pagesToCheck) {
  const html = read(pagePath);
  if (!html) continue;
  
  // Skip pages that are not shell pages
  if (!html.includes('page-standard-shell')) continue;
  
  // Skip redirect pages (http-equiv="refresh")
  if (html.includes('http-equiv="refresh"')) continue;
  
  for (const src of CANONICAL_BOOT_SRCS) {
    if (!html.includes(`src="${src}"`)) {
      fail(`${pagePath} - missing boot script: ${src}`);
      bootScriptsOk = false;
    }
  }
}

if (bootScriptsOk) pass('All shell pages have canonical boot scripts');

// 5. Check for mixed visual styling indicators
console.log('\n[5] Checking for mixed old/new visual styling');
const mixedIndicators = [
  { pattern: /background:\s*#00ffcc;/i, name: 'old solid cyan background' },
  { pattern: /color:\s*#000;/, name: 'old solid black text (solid cyan button)' },
];

let mixedOk = true;

for (const pagePath of pagesToCheck) {
  const html = read(pagePath);
  if (!html) continue;
  
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) continue;
  
  const styleContent = styleMatch[1];
  
  // Check for old button styling in .bc-hero-cta specifically
  if (styleContent.includes('.bc-hero-cta') && styleContent.includes('background: #00ffcc')) {
    warn(`${pagePath} - found old solid button styling in .bc-hero-cta (should use rgba with transparency)`);
    mixedOk = false;
  }
}

if (mixedOk) pass('No mixed old/new visual styling patterns detected');

// Summary
console.log('\n─────────────────────────────────────────────────────────────────────');

if (failures === 0 && warnings === 0) {
  console.log('\n✓ Visual parity audit passed! All pages use unified SWARMSY system.\n');
  process.exit(0);
} else if (failures === 0) {
  console.log(`\n⚠ Visual parity audit completed with ${warnings} warning(s).\n`);
  process.exit(0);
} else {
  console.log(`\n✗ Visual parity audit FAILED: ${failures} failure(s), ${warnings} warning(s)\n`);
  process.exit(1);
}

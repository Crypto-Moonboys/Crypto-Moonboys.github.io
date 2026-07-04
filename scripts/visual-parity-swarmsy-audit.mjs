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
const WIKI_CSS_PATH = 'css/wiki.css';
const PARITY_LAYER_MARKER = 'SWARMSY VISUAL PARITY LAYER';

let failures = 0;

function fail(msg) { console.error(`  [FAIL] ${msg}`); failures += 1; }
function pass(msg) { console.log(`  [PASS] ${msg}`); }

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function extractBodyAttrs(html) {
  const match = html.match(/<body\s+([^>]*)>/i);
  return match ? match[1].trim() : '';
}

function extractStyleBlocks(html) {
  return Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]);
}

function isStandaloneToolPage(bodyAttrs) {
  return bodyAttrs.includes('page-standalone-tool');
}

function findSmallRadiusMatches(cssText, selectors) {
  const matches = [];
  for (const selector of selectors) {
    const pattern = new RegExp(`\\.${selector}(?:[^{]|\\n)*\\{[\\s\\S]*?border-radius\\s*:\\s*(\\d+)px`, 'g');
    for (const match of cssText.matchAll(pattern)) {
      const radius = Number.parseInt(match[1], 10);
      if (radius < 14) {
        matches.push({ selector, radius });
      }
    }
  }
  return matches;
}

function findSelectorIndicatorMatches(cssText, selectors, indicators) {
  const matches = [];
  for (const selector of selectors) {
    const pattern = new RegExp(`\\.${selector}(?:[^{]|\\n)*\\{([\\s\\S]*?)\\}`, 'g');
    for (const match of cssText.matchAll(pattern)) {
      const block = match[1];
      for (const { pattern: indicatorPattern, name } of indicators) {
        if (indicatorPattern.test(block)) {
          matches.push({ selector, indicator: name });
        }
      }
    }
  }
  return matches;
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
  'waxcash.html',
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
  { pattern: /\.bc-hero-cta\b[\s\S]*?{/i, name: '.bc-hero-cta inline block' },
  { pattern: /\.bc-cta-btn\b[\s\S]*?{/i, name: '.bc-cta-btn inline block' },
  { pattern: /\.category-card\b[\s\S]*?{/i, name: '.category-card inline block' },
  { pattern: /\.article-card\b[\s\S]*?{/i, name: '.article-card inline block' },
  { pattern: /\.notice\b[\s\S]*?{/i, name: '.notice inline block' },
];

let inlineCSSOk = true;

for (const pagePath of pagesToCheck) {
  const html = read(pagePath);
  if (!html) continue;

  const styleBlocks = extractStyleBlocks(html);
  if (styleBlocks.length === 0) continue;

  for (const styleContent of styleBlocks) {
    for (const { pattern, name } of oldCSSPatterns) {
      if (pattern.test(styleContent)) {
        fail(`${pagePath} - found ${name} in <style> block (should use global wiki.css)`);
        inlineCSSOk = false;
      }
    }
  }
}

if (inlineCSSOk) pass('No old inline card/button CSS found in <style> blocks');

// 3. Check for old border-radius patterns (should be 14px+)
console.log('\n[3] Checking for old soft button radii (< 14px)');
let radiusOk = true;
const swarmsyRadiusSelectors = [
  'bc-hero-cta',
  'bc-cta-btn',
  'category-card',
  'article-card',
  'notice',
  'bc-dominant-badge',
  'bc-tier-badge',
  'bc-coming-next',
];

for (const pagePath of pagesToCheck) {
  const html = read(pagePath);
  if (!html) continue;

  const styleBlocks = extractStyleBlocks(html);
  for (const styleContent of styleBlocks) {
    const smallRadiiMatches = findSmallRadiusMatches(styleContent, swarmsyRadiusSelectors);
    for (const { selector, radius } of smallRadiiMatches) {
      fail(`${pagePath} - ${selector} uses old small border-radius ${radius}px (should be 14px+ for SWARMSY compatibility)`);
      radiusOk = false;
    }
  }
}

const wikiCss = read(WIKI_CSS_PATH);
if (!wikiCss) {
  fail(`${WIKI_CSS_PATH} - file not found`);
  radiusOk = false;
} else {
  const parityLayerCss = wikiCss.includes(PARITY_LAYER_MARKER)
    ? wikiCss.slice(wikiCss.indexOf(PARITY_LAYER_MARKER))
    : wikiCss;
  for (const { selector, radius } of findSmallRadiusMatches(parityLayerCss, swarmsyRadiusSelectors)) {
    fail(`${WIKI_CSS_PATH} - ${selector} uses old small border-radius ${radius}px (should be 14px+ for SWARMSY compatibility)`);
    radiusOk = false;
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

  const bodyAttrs = extractBodyAttrs(html);
  if (isStandaloneToolPage(bodyAttrs)) continue;

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
const mixedStyleSelectors = ['bc-hero-cta', 'bc-cta-btn'];

for (const pagePath of pagesToCheck) {
  const html = read(pagePath);
  if (!html) continue;

  for (const styleContent of extractStyleBlocks(html)) {
    for (const { selector, indicator } of findSelectorIndicatorMatches(styleContent, mixedStyleSelectors, mixedIndicators)) {
      fail(`${pagePath} - found ${indicator} in .${selector} (should use rgba-based SWARMSY styling)`);
      mixedOk = false;
    }
  }
}

if (wikiCss) {
  const parityLayerCss = wikiCss.includes(PARITY_LAYER_MARKER)
    ? wikiCss.slice(wikiCss.indexOf(PARITY_LAYER_MARKER))
    : wikiCss;
  for (const { selector, indicator } of findSelectorIndicatorMatches(parityLayerCss, mixedStyleSelectors, mixedIndicators)) {
    fail(`${WIKI_CSS_PATH} - found ${indicator} in .${selector} (should use rgba-based SWARMSY styling)`);
    mixedOk = false;
  }
}

if (mixedOk) pass('No mixed old/new visual styling patterns detected');

// Summary
console.log('\n─────────────────────────────────────────────────────────────────────');

if (failures === 0) {
  console.log('\n✓ Visual parity audit passed! All pages use unified SWARMSY system.\n');
  process.exit(0);
} else {
  console.log(`\n✗ Visual parity audit FAILED: ${failures} failure(s)\n`);
  process.exit(1);
}

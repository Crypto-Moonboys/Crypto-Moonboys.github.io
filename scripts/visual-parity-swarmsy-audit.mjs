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
 *  - swarmsy-visual-authority.css loads AFTER retro-16bit-theme.css on all public pages
 *  - swarmsy-visual-authority.css covers all required selectors
 *  - No Press Start 2P / var(--font-pixel) as active card/nav/article font without override
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_CSS_PATH = 'css/wiki.css';
const AUTHORITY_CSS_PATH = 'css/swarmsy-visual-authority.css';
const BATTLE_CHAMBER_JS_PATH = 'js/battle-chamber-factions.js';
const PARITY_LAYER_MARKER = 'SWARMSY VISUAL PARITY LAYER';
const BATTLE_CHAMBER_CRITICAL_SELECTORS = [
  '.bc-join-grid',
  '.bc-join-btn',
  '.bc-join-btn:hover',
  '.bc-join-btn:disabled',
  '.bc-aligned-panel',
  '.bc-aligned-header',
  '.bc-aligned-row',
  '.bc-aligned-actions',
  '.bc-aligned-season-lock',
  '.bc-aligned-clout-note',
  '.bc-aligned-season-note',
  '.bc-join-season-notice',
  '.bc-join-season-lock-copy',
  '.bc-join-season-reset-copy',
  '.bc-join-link-copy',
  '.bc-join-confirm-panel',
  '.bc-join-confirm-icon',
  '.bc-join-confirm-title',
  '.bc-join-confirm-faction',
  '.bc-join-confirm-lock',
  '.bc-join-confirm-reset',
  '.bc-join-confirm-actions',
  '.bc-join-confirm-btn',
  '.bc-join-cancel-btn',
  '.bc-join-success-panel',
  '.bc-join-success-icon',
  '.bc-join-success-msg',
  '.bc-join-locked-panel',
  '.bc-join-locked-msg',
  '.bc-missions-header',
  '.bc-missions-list',
  '.bc-mission-row',
  '.bc-mission-row--done',
  '.bc-mission-label',
  '.bc-mission-desc',
  '.bc-mission-progress',
  '.bc-mission-reward',
  '.bc-missions-empty',
  '.bc-missions-loading',
  '.bc-missions-note',
  '.bc-perk-grid',
  '.bc-perk-icon',
  '.bc-perk-name',
  '.bc-perk-playstyle',
  '.bc-perk-text',
  '.bc-perk-xp-meta',
  '.bc-perk-score-meta',
  '.bc-perks-intro',
  '.bc-perks-note',
  '.bc-rewards-grid',
  '.bc-rewards-intro',
  '.bc-reward-icon',
  '.bc-rewards-disclaimer',
  '.bc-monthly-target',
  '.bc-season-current',
  '.bc-placeholder',
  '.bc-monthly-rewards',
  '.bc-season-rewards',
  '.bc-hall-of-fame',
];

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

function extractRenderedBcClasses(jsText) {
  const classes = new Set();
  for (const match of jsText.matchAll(/class="([^"]+)"/g)) {
    for (const className of match[1].split(/\s+/)) {
      if (/^bc-[a-z0-9-]+$/i.test(className)) {
        classes.add(className);
      }
    }
  }
  return classes;
}

function selectorBaseClass(selector) {
  const match = selector.match(/\.([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

function hasCssSelector(cssText, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[\\s,}])${escaped}(?=\\s*[,\\{])`, 'm');
  return pattern.test(cssText);
}

function getCssBlocksForSelector(cssText, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[,}])[^{}]*${escaped}[^{}]*\\{([\\s\\S]*?)\\}`, 'gm');
  return Array.from(cssText.matchAll(pattern), (match) => match[1]);
}

function hasDeclarationInAnyBlock(cssText, selector, declarationPattern) {
  return getCssBlocksForSelector(cssText, selector).some((block) => declarationPattern.test(block));
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

function getAllHTMLFiles(dir = '') {
  const files = [];
  const fullDir = path.join(ROOT, dir);
  const excludedDirs = new Set([
    '.git',
    'node_modules',
  ]);

  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) continue;
      files.push(...getAllHTMLFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path.join(dir, entry.name).replace(/\\/g, '/'));
    }
  }

  return files;
}

function isRedirectPage(html) {
  return /http-equiv=["']refresh["']/i.test(html);
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

const allHtmlFiles = getAllHTMLFiles();

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
const parityLayerCss = wikiCss && wikiCss.includes(PARITY_LAYER_MARKER)
  ? wikiCss.slice(wikiCss.indexOf(PARITY_LAYER_MARKER))
  : wikiCss;
if (!wikiCss) {
  fail(`${WIKI_CSS_PATH} - file not found`);
  radiusOk = false;
} else {
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
  for (const { selector, indicator } of findSelectorIndicatorMatches(parityLayerCss, mixedStyleSelectors, mixedIndicators)) {
    fail(`${WIKI_CSS_PATH} - found ${indicator} in .${selector} (should use rgba-based SWARMSY styling)`);
    mixedOk = false;
  }
}

if (mixedOk) pass('No mixed old/new visual styling patterns detected');

// 6. Check Battle Chamber JS-rendered selector coverage
console.log('\n[6] Checking Battle Chamber rendered selector coverage');
let battleChamberCoverageOk = true;
const battleChamberJs = read(BATTLE_CHAMBER_JS_PATH);

if (!battleChamberJs) {
  fail(`${BATTLE_CHAMBER_JS_PATH} - file not found`);
  battleChamberCoverageOk = false;
} else if (!parityLayerCss) {
  battleChamberCoverageOk = false;
} else {
  const renderedClasses = extractRenderedBcClasses(battleChamberJs);
  const criticalSelectorsToCheck = BATTLE_CHAMBER_CRITICAL_SELECTORS.filter((selector) => {
    const baseClass = selectorBaseClass(selector);
    return baseClass && renderedClasses.has(baseClass);
  });

  const renderedSelectorsToCheck = Array.from(renderedClasses, (className) => `.${className}`);

  for (const selector of renderedSelectorsToCheck) {
    if (!hasCssSelector(parityLayerCss, selector)) {
      fail(`${WIKI_CSS_PATH} - missing explicit SWARMSY parity coverage for ${selector} rendered by ${BATTLE_CHAMBER_JS_PATH}`);
      battleChamberCoverageOk = false;
    }
  }

  for (const selector of criticalSelectorsToCheck) {
    if (!hasCssSelector(parityLayerCss, selector)) {
      fail(`${WIKI_CSS_PATH} - missing Battle Chamber selector coverage for ${selector} rendered by ${BATTLE_CHAMBER_JS_PATH}`);
      battleChamberCoverageOk = false;
    }
  }
}

if (battleChamberCoverageOk) pass('Battle Chamber JS-rendered critical selectors have CSS coverage');

// 7. Cascade authority: swarmsy-visual-authority.css must exist and load AFTER retro-16bit-theme.css
console.log('\n[7] Checking swarmsy-visual-authority.css cascade order repo-wide');
const RETRO_LINK = 'href="/css/retro-16bit-theme.css"';
const AUTHORITY_LINK = 'href="/css/swarmsy-visual-authority.css"';
let cascadeOk = true;
let retroPageCount = 0;

const authorityCss = read(AUTHORITY_CSS_PATH);
if (!authorityCss) {
  fail(`${AUTHORITY_CSS_PATH} - file not found; must exist to provide final cascade authority`);
  cascadeOk = false;
}

for (const pagePath of allHtmlFiles) {
  const html = read(pagePath);
  if (!html) continue;

  if (isRedirectPage(html) || !html.includes(RETRO_LINK)) continue;

  retroPageCount += 1;

  if (!html.includes(AUTHORITY_LINK)) {
    fail(`${pagePath} - loads retro-16bit-theme.css but is missing swarmsy-visual-authority.css`);
    cascadeOk = false;
  } else {
    const retroIdx = html.indexOf(RETRO_LINK);
    const authorityIdx = html.indexOf(AUTHORITY_LINK);
    if (authorityIdx < retroIdx) {
      fail(`${pagePath} - swarmsy-visual-authority.css appears BEFORE retro-16bit-theme.css (must load after)`);
      cascadeOk = false;
    }
  }
}

if (cascadeOk) pass(`swarmsy-visual-authority.css loads AFTER retro-16bit-theme.css on all ${retroPageCount} retro-themed HTML pages`);

// 8. Authority CSS must override key selectors that retro-16bit-theme.css defines with pixel font
console.log('\n[8] Checking swarmsy-visual-authority.css covers required selectors');
const AUTHORITY_REQUIRED_SELECTORS = [
  '.section-heading',
  '.category-card',
  '.category-card .cat-name',
  '.category-card .cat-icon',
  '.article-card',
  '.article-card-title',
  '.article-card-cat',
  '.article-list-item',
  '.page-search .article-card-summary',
  '.page-search .article-card-meta-item',
  '.page-search .article-card-tag',
  '.notice',
  '.home-widget',
  '#header-search input',
  '.header-nav a',
  '.bc-join-btn',
  '.bc-mission-row',
  // Homepage-scoped overrides (equal specificity to retro body.page-home selectors)
  'body.page-home .section-heading',
  'body.page-home .category-card',
  'body.page-home .category-card .cat-name',
  'body.page-home .category-card .cat-count',
  'body.page-home .category-card .cat-icon',
  'body.page-home .article-card',
  'body.page-home .article-card-title',
  'body.page-home .article-card-desc',
  'body.page-home .article-card-cat',
  'body.page-home .article-card-img',
];

let authoritySelectorOk = true;

if (authorityCss) {
  for (const selector of AUTHORITY_REQUIRED_SELECTORS) {
    if (!hasCssSelector(authorityCss, selector)) {
      fail(`${AUTHORITY_CSS_PATH} - missing required authority override for ${selector}`);
      authoritySelectorOk = false;
    }
  }
}

if (authoritySelectorOk) pass('swarmsy-visual-authority.css has all required selector overrides');

// 9. Authority CSS must not contain active pixel-font on card/nav/article selectors without override
console.log('\n[9] Checking swarmsy-visual-authority.css does not re-introduce pixel font');
const PIXEL_FONT_PATTERN = /font-family\s*:[^;]*(?:Press Start 2P|--font-pixel)[^!;]*(?:!important)?/i;
const PIXEL_FONT_SELECTORS_BANNED = [
  'category-card',
  'cat-name',
  'article-card-title',
  'article-card-cat',
  'article-card-meta-item',
  'article-card-tag',
  'header-nav',
  'section-heading',
  'article-card-summary',
];
let pixelFontOk = true;

if (authorityCss) {
  for (const selector of PIXEL_FONT_SELECTORS_BANNED) {
    const pattern = new RegExp(`\\.${selector}(?:[^{]|\\n)*\\{([\\s\\S]*?)\\}`, 'g');
    for (const match of authorityCss.matchAll(pattern)) {
      if (PIXEL_FONT_PATTERN.test(match[1])) {
        fail(`${AUTHORITY_CSS_PATH} - .${selector} sets pixel font (Press Start 2P / --font-pixel) which would re-introduce retro styling`);
        pixelFontOk = false;
      }
    }
  }
}

if (pixelFontOk) pass('swarmsy-visual-authority.css does not re-introduce pixel font on cards/nav/headings');

// 10. Authority CSS must neutralise homepage retro pseudo-frame effects
console.log('\n[10] Checking homepage retro pseudo-frame effects are neutralised');
let homepageFrameOk = true;

if (authorityCss) {
  for (const selector of [
    'body.page-home .category-card::before',
    'body.page-home .category-card::after',
    'body.page-home .article-card::before',
    'body.page-home .article-card::after',
  ]) {
    const hasDisplayNone = hasDeclarationInAnyBlock(authorityCss, selector, /display\s*:\s*none\s*!important/i);
    const hasContentNone = hasDeclarationInAnyBlock(authorityCss, selector, /content\s*:\s*none\s*!important/i);
    if (!hasDisplayNone || !hasContentNone) {
      fail(`${AUTHORITY_CSS_PATH} - ${selector} must set display: none !important and content: none !important to neutralise retro pseudo-frame effects`);
      homepageFrameOk = false;
    }
  }
}

if (homepageFrameOk) pass('Homepage category/article retro pseudo-frame effects are neutralised');

// 11. Authority CSS must restore faction-colored border-top on faction-accent cards
console.log('\n[11] Checking faction-accent cards retain faction border-top in authority CSS');
let factionBorderOk = true;

if (authorityCss) {
  for (const sel of ['.bc-join-card', '.bc-perk-card', '.bc-faction-reward-card']) {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The selector may share a rule block with other selectors; allow comma-separated list before {
    const pattern = new RegExp(`${escaped}[^{]*\\{[^}]*border-top[^;]*--faction-color`, 's');
    if (!pattern.test(authorityCss)) {
      fail(`${AUTHORITY_CSS_PATH} - ${sel} missing border-top: 3px solid var(--faction-color, ...) !important to restore faction accent after border shorthand`);
      factionBorderOk = false;
    }
  }
}

if (factionBorderOk) pass('Faction-accent cards retain faction-colored border-top in authority CSS');

// Summary
console.log('\n─────────────────────────────────────────────────────────────────────');

if (failures === 0) {
  console.log('\n✓ Visual parity audit passed! All pages use unified SWARMSY system.\n');
  process.exit(0);
} else {
  console.log(`\n✗ Visual parity audit FAILED: ${failures} failure(s)\n`);
  process.exit(1);
}

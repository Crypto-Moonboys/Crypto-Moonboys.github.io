#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_SHELL_CSS = 'css/wiki.css';
const SITE_SHELL_JS = 'js/site-shell.js';
const CSS_FILES_TO_AUDIT = [
  'css/wiki.css',
  'css/wiki-shell-v1.css',
  'css/battle-layer.css',
  'css/faction-chamber.css',
  'css/waxonedge.css',
];

const DEBUG_TEXTS = [
  'Unified Wiki Shell v1',
  'Public route mounted through the wiki UI',
  'Canonical wiki route',
];

const REQUIRED_RENDER_PATHS = [
  'index.html',
  'search.html',
  'wiki/gkniftyheads.html',
  'wiki/gkniftyheads-nft-collection.html',
  'categories/index.html',
  'categories/gaming.html',
  'battle-chamber/factions/index.html',
  'battle-chamber/factions/hard-fork-rockers.html',
  'about.html',
  'games/index.html',
  'swarmsy.html',
];

const FORBIDDEN_HEAD_PATTERNS = [
  { name: '/css/retro-16bit-theme.css', pattern: /<link[^>]+href=["'][^"']*\/css\/retro-16bit-theme\.css["'][^>]*>/i },
  { name: '/css/swarmsy-visual-authority.css', pattern: /<link[^>]+href=["'][^"']*\/css\/swarmsy-visual-authority\.css["'][^>]*>/i },
  { name: 'Press Start 2P font link', pattern: /<link[^>]+(?:Press\+Start\+2P|Press Start 2P)[^>]*>/i },
];

const FORBIDDEN_HTML_MARKERS = [
  { name: 'retro marker class', pattern: /\bclass=["'][^"']*\bretro\b[^"']*["']/i },
  { name: 'crt marker class', pattern: /\bclass=["'][^"']*\bcrt\b[^"']*["']/i },
  { name: 'scanline marker class', pattern: /\bclass=["'][^"']*\bscanline\b[^"']*["']/i },
  { name: 'game-window marker class', pattern: /\bclass=["'][^"']*\bgame-window\b[^"']*["']/i },
  { name: 'font-pixel marker class', pattern: /\bclass=["'][^"']*\bfont-pixel\b[^"']*["']/i },
  { name: 'Press Start inline style', pattern: /<style[^>]*>[\s\S]*Press Start 2P[\s\S]*?<\/style>/i },
  { name: 'font-pixel inline style', pattern: /<style[^>]*>[\s\S]*font-pixel[\s\S]*?<\/style>/i },
  { name: 'hard magenta inline UI', pattern: /<style[^>]*>[\s\S]*(?:#ff00ff|#f0f|magenta)[\s\S]*?<\/style>/i },
  { name: 'square card inline style', pattern: /<style[^>]*>[\s\S]*(?:card|panel|box)[^{]*\{[^}]*border-radius\s*:\s*(?:0|[1-7]px)\b[\s\S]*?<\/style>/i },
  { name: 'chunky UI wording in style', pattern: /<style[^>]*>[\s\S]*(?:chunky|8-bit|16-bit)[\s\S]*?<\/style>/i },
];

const CSS_FORBIDDEN_PATTERNS = [
  { name: 'old direct retro dependency', pattern: /retro-16bit-theme/i },
  { name: 'deleted authority dependency', pattern: /swarmsy-visual-authority/i },
  { name: 'Press Start font', pattern: /Press Start 2P|Press\+Start\+2P/i },
  { name: 'font-pixel token', pattern: /font-pixel|--font-pixel/i },
  { name: 'display pixelation', pattern: /image-rendering\s*:\s*pixelated/i },
  { name: 'crt marker', pattern: /\bcrt\b/i },
  { name: 'scanline marker', pattern: /\bscanline/i },
  { name: 'game-window selector', pattern: /\.game-window\b/i },
  { name: 'hard magenta UI color', pattern: /#ff00ff|#f0f/i },
  { name: 'chunky UI term', pattern: /\bchunky\b/i },
  { name: 'old bit UI term', pattern: /\b(?:8-bit|16-bit)\b/i },
];

const WIKI_CSS_FORBIDDEN_PATTERNS = [
  { name: 'cascade-war important rule', pattern: /!important/i },
  { name: 'old Fandom wording', pattern: /Fandom/i },
  { name: 'old MediaWiki wording', pattern: /MediaWiki/i },
  { name: 'old visual pass wording', pattern: /VISUAL PARITY|PARITY LAYER|override layer/i },
  { name: 'animated grid overlay', pattern: /keyframes[^{}]*(?:grid|trace)|(?:grid|trace)[^{]*animation\s*:/i },
];

let failures = 0;
let passes = 0;

function fail(message) {
  console.error(`  [FAIL] ${message}`);
  failures += 1;
}

function pass(message) {
  console.log(`  [PASS] ${message}`);
  passes += 1;
}

function read(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

function walkHtml(dir = '') {
  const out = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;

  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkHtml(rel));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(rel.replace(/\\/g, '/'));
    }
  }
  return out;
}

function publicHtmlFiles() {
  const allowedRoots = [
    'about',
    'analytics',
    'battle-chamber',
    'categories',
    'games',
    'waxonedge',
    'wiki',
  ];
  const files = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html') && !entry.name.startsWith('_'))
    .map((entry) => entry.name);

  for (const dir of allowedRoots) {
    files.push(...walkHtml(dir));
  }

  return Array.from(new Set(files)).sort();
}

function isRedirectPage(html) {
  return /http-equiv=["']refresh["']/i.test(html);
}

function bodyAttrs(html) {
  const match = html.match(/<body\s+([^>]*)>/i);
  return match ? match[1] : '';
}

function isStandaloneToolPage(html) {
  return bodyAttrs(html).includes('page-standalone-tool');
}

function isNormalPublicPage(rel, html) {
  if (!html || isRedirectPage(html) || isStandaloneToolPage(html)) return false;
  if (rel === 'admin-tools.html') return false;
  if (rel.startsWith('wiki/components/') || rel.startsWith('wiki/layouts/')) return false;
  return true;
}

function isPageStandardShellExpected(rel) {
  if (rel.startsWith('games/') && rel !== 'games/index.html' && rel !== 'games/leaderboard.html') return false;
  return true;
}

function extractStyleBlocks(html) {
  return Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]);
}

function hasShellWidthCap(styleText) {
  return /(?:#layout|#main-wrapper|#content|\.wiki-content|\.page-content|\.article-body)[^{]*\{[^}]*max-width\s*:\s*\d+px/i.test(styleText);
}

function hasSmallCardRadius(cssText) {
  const cardBlockPattern = /(?:card|panel|box|tile)[^{]*\{[^}]*border-radius\s*:\s*(0|[1-7]px)\b/gi;
  return cardBlockPattern.test(cssText);
}

function selectorBlock(cssText, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\s+/g, '\\s+');
  const match = cssText.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'i'));
  return match ? match[1] : '';
}

function selectorBlocksForClass(cssText, className) {
  const blocks = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = blockPattern.exec(cssText)) !== null) {
    const selectors = match[1].split(',').map((selector) => selector.trim());
    if (selectors.some((selector) => selector.includes(`.${className}`))) {
      blocks.push(match[2]);
    }
  }
  return blocks.join('\n');
}

function blockHas(block, pattern) {
  return pattern.test(block);
}

function htmlContainsClass(html, className) {
  return new RegExp(`\\bclass=["'][^"']*\\b${className}\\b`, 'i').test(html);
}

function anyNormalPageContainsClass(className) {
  return normalPages.some(({ html }) => htmlContainsClass(html, className));
}

console.log('\n--- SWARMSY Global Shell Audit ---\n');

const allPublic = publicHtmlFiles()
  .map((rel) => ({ rel, html: read(rel) }))
  .filter(({ html }) => html !== null);
const normalPages = allPublic.filter(({ rel, html }) => isNormalPublicPage(rel, html));

console.log('[1] Normal public pages use the direct SWARMSY shell path');
let shellPathOk = true;
for (const { rel, html } of normalPages) {
  for (const { name, pattern } of FORBIDDEN_HEAD_PATTERNS) {
    if (pattern.test(html)) {
      fail(`${rel} - must not load ${name}`);
      shellPathOk = false;
    }
  }
  if (!html.includes('href="/css/wiki.css"')) {
    fail(`${rel} - missing direct /css/wiki.css shell stylesheet`);
    shellPathOk = false;
  }
  if (!html.includes('src="/js/site-shell.js"')) {
    fail(`${rel} - missing /js/site-shell.js`);
    shellPathOk = false;
  }
  if (isPageStandardShellExpected(rel) && !bodyAttrs(html).includes('page-standard-shell')) {
    fail(`${rel} - missing page-standard-shell`);
    shellPathOk = false;
  }
}
if (shellPathOk) pass(`${normalPages.length} normal public pages use /css/wiki.css and /js/site-shell.js without old stack links`);

console.log('\n[2] No public debug text or removed banner path remains');
let debugOk = true;
const siteShell = read(SITE_SHELL_JS) || '';
for (const { rel, html } of normalPages) {
  for (const text of DEBUG_TEXTS) {
    if (html.includes(text)) {
      fail(`${rel} - contains forbidden public debug text: "${text}"`);
      debugOk = false;
    }
  }
}
for (const text of DEBUG_TEXTS) {
  if (siteShell.includes(text)) {
    fail(`${SITE_SHELL_JS} - contains forbidden public debug text: "${text}"`);
    debugOk = false;
  }
}
if (/function\s+renderLegacyRouteBanner\s*\(/.test(siteShell) || /renderLegacyRouteBanner\s*\(/.test(siteShell)) {
  fail(`${SITE_SHELL_JS} - renderLegacyRouteBanner() must stay removed`);
  debugOk = false;
}
if (/SHELL_CSS_HREF|appendChild\(link\)|moonboys-global-shell-css/.test(siteShell)) {
  fail(`${SITE_SHELL_JS} - must not inject the global shell stylesheet late from JavaScript`);
  debugOk = false;
}
if (!siteShell.includes("document.body.classList.add('swarmsy-shell')")) {
  fail(`${SITE_SHELL_JS} - must stamp swarmsy-shell body class`);
  debugOk = false;
}
if (debugOk) pass('Public debug copy, legacy banner path, and late CSS injection are absent');

console.log('\n[3] No old visual markers or inline shell width caps on normal public pages');
let markerOk = true;
for (const { rel, html } of normalPages) {
  for (const { name, pattern } of FORBIDDEN_HTML_MARKERS) {
    if (pattern.test(html)) {
      fail(`${rel} - contains ${name}`);
      markerOk = false;
    }
  }
  for (const styleText of extractStyleBlocks(html)) {
    if (hasShellWidthCap(styleText)) {
      fail(`${rel} - inline style caps shell/page width`);
      markerOk = false;
    }
  }
}
if (markerOk) pass('Normal public pages have no old visual markers or inline shell width caps');

console.log('\n[4] Required render-check pages are included in source audit');
let requiredPagesOk = true;
for (const rel of REQUIRED_RENDER_PATHS) {
  const html = read(rel);
  if (!html) {
    fail(`${rel} - required render-check page missing`);
    requiredPagesOk = false;
    continue;
  }
  if (!isNormalPublicPage(rel, html)) {
    fail(`${rel} - required render-check page is not a normal public page`);
    requiredPagesOk = false;
  }
  if (!html.includes('href="/css/wiki.css"') || !html.includes('src="/js/site-shell.js"')) {
    fail(`${rel} - required render-check page missing direct shell CSS or JS`);
    requiredPagesOk = false;
  }
}
if (requiredPagesOk) pass('All required render-check pages are normal direct-shell pages');

console.log('\n[5] Auditing CSS files for old UI systems');
let cssOk = true;
for (const rel of CSS_FILES_TO_AUDIT) {
  const css = read(rel);
  if (css === null) {
    fail(`${rel} - CSS file missing`);
    cssOk = false;
    continue;
  }

  const checks = rel === GLOBAL_SHELL_CSS
    ? CSS_FORBIDDEN_PATTERNS.concat(WIKI_CSS_FORBIDDEN_PATTERNS)
    : CSS_FORBIDDEN_PATTERNS;

  for (const { name, pattern } of checks) {
    if (pattern.test(css)) {
      fail(`${rel} - contains ${name}`);
      cssOk = false;
    }
  }
  if (hasSmallCardRadius(css)) {
    fail(`${rel} - contains square/small-radius card, panel, box, or tile styling`);
    cssOk = false;
  }
}
if (cssOk) pass('Audited CSS files do not contain old visual systems or small-radius card styling');

console.log('\n[6] css/wiki.css owns the single global SWARMSY shell');
let wikiCssOk = true;
const wikiCss = read(GLOBAL_SHELL_CSS);
if (!wikiCss) {
  fail(`${GLOBAL_SHELL_CSS} - missing`);
  wikiCssOk = false;
} else {
  const requiredNeedles = [
    '#site-header',
    '#global-nav',
    '#layout',
    '#main-wrapper',
    '#content',
    '.category-card',
    '.article-card',
    '.section-heading',
    '.bc-join-card',
    '#site-paperclip-agent',
  ];
  for (const needle of requiredNeedles) {
    if (!wikiCss.includes(needle)) {
      fail(`${GLOBAL_SHELL_CSS} - missing required shell/component selector ${needle}`);
      wikiCssOk = false;
    }
  }
  if (/#(?:layout|main-wrapper|content)[^{]*\{[^}]*max-width\s*:/i.test(wikiCss)) {
    fail(`${GLOBAL_SHELL_CSS} - must not cap shell containers with max-width`);
    wikiCssOk = false;
  }
}
if (wikiCssOk) pass('css/wiki.css owns shell layout and SWARMSY components without max-width caps');

console.log('\n[7] Homepage hero background stays behind launch content');
let homepageHeroOk = true;
const homepageHtml = read('index.html') || '';
if (!homepageHtml.includes('class="swarmsy-hero-bg"')) {
  fail('index.html - missing swarmsy-hero-bg homepage hero background wrapper');
  homepageHeroOk = false;
}
if (/retro-hero-bg/i.test(homepageHtml)) {
  fail('index.html - must not restore retro-hero-bg');
  homepageHeroOk = false;
}
if (!wikiCss) {
  homepageHeroOk = false;
} else {
  const homeHeroBlock = selectorBlock(wikiCss, '.home-hero,\n.launch-hero') || selectorBlock(wikiCss, '.home-hero,\r\n.launch-hero');
  const bgBlock = selectorBlock(wikiCss, '.swarmsy-hero-bg');
  const imgBlock = selectorBlock(wikiCss, '.swarmsy-hero-bg .hero-bg-img');
  const overlayBlock = selectorBlock(wikiCss, '.swarmsy-hero-bg::after');
  const contentBlock = selectorBlock(wikiCss, '.home-hero > :not(.swarmsy-hero-bg)');

  if (!blockHas(homeHeroBlock, /position\s*:\s*relative/i) || !blockHas(homeHeroBlock, /overflow\s*:\s*hidden/i)) {
    fail(`${GLOBAL_SHELL_CSS} - .home-hero/.launch-hero must be relative and hide hero background overflow`);
    homepageHeroOk = false;
  }
  if (
    !blockHas(bgBlock, /position\s*:\s*absolute/i) ||
    !blockHas(bgBlock, /inset\s*:\s*0/i) ||
    !blockHas(bgBlock, /z-index\s*:\s*0/i) ||
    !blockHas(bgBlock, /pointer-events\s*:\s*none/i)
  ) {
    fail(`${GLOBAL_SHELL_CSS} - .swarmsy-hero-bg must be an absolute inset non-interactive background layer`);
    homepageHeroOk = false;
  }
  if (
    !blockHas(imgBlock, /width\s*:\s*100%/i) ||
    !blockHas(imgBlock, /height\s*:\s*100%/i) ||
    !blockHas(imgBlock, /object-fit\s*:\s*cover/i)
  ) {
    fail(`${GLOBAL_SHELL_CSS} - .swarmsy-hero-bg .hero-bg-img must fill the hero with object-fit cover`);
    homepageHeroOk = false;
  }
  if (!blockHas(imgBlock, /opacity\s*:\s*(?:0?\.\d+|[01])/i) && !blockHas(overlayBlock, /background\s*:/i)) {
    fail(`${GLOBAL_SHELL_CSS} - homepage hero background needs opacity or overlay treatment`);
    homepageHeroOk = false;
  }
  if (!blockHas(contentBlock, /position\s*:\s*relative/i) || !blockHas(contentBlock, /z-index\s*:\s*1/i)) {
    fail(`${GLOBAL_SHELL_CSS} - homepage hero content must sit above the background layer`);
    homepageHeroOk = false;
  }
}
if (homepageHeroOk) pass('Homepage hero background is an absolute SWARMSY layer behind content');

console.log('\n[8] SWARMSY component classes keep their global styling contract');
let swarmsyComponentsOk = true;
if (wikiCss) {
  const componentContracts = [
    {
      className: 'swarmsy-action-card',
      selector: '.swarmsy-action-card',
      checks: [
        ['grid/flex layout', /display\s*:\s*(?:grid|flex|inline-flex)/i],
        ['border', /border\s*:/i],
        ['background', /background\s*:/i],
        ['rounded card radius', /border-radius\s*:\s*(?:var\(--radius-(?:md|lg)\)|1[4-9]px|[2-9]\dpx)/i],
        ['padding', /padding\s*:/i],
      ],
    },
    {
      className: 'swarmsy-card',
      selector: '.swarmsy-card',
      checks: [
        ['border', /border\s*:/i],
        ['background', /background\s*:/i],
        ['rounded card radius', /border-radius\s*:\s*(?:var\(--radius-(?:md|lg)\)|1[4-9]px|[2-9]\dpx)/i],
        ['padding', /padding\s*:/i],
      ],
    },
    {
      className: 'swarmsy-section',
      selector: '.swarmsy-section',
      checks: [
        ['border', /border\s*:/i],
        ['background', /background\s*:/i],
        ['rounded section radius', /border-radius\s*:\s*(?:var\(--radius-(?:md|lg)\)|1[4-9]px|[2-9]\dpx)/i],
        ['padding', /padding\s*:/i],
      ],
    },
    {
      className: 'swarmsy-pill',
      selector: '.swarmsy-pill',
      checks: [
        ['border', /border\s*:/i],
        ['background', /background\s*:/i],
        ['rounded pill radius', /border-radius\s*:\s*(?:999px|var\(--radius-(?:md|lg)\)|1[4-9]px|[2-9]\dpx)/i],
        ['padding', /padding\s*:/i],
      ],
    },
    {
      className: 'swarmsy-action-grid',
      selector: '.swarmsy-grid,\n.swarmsy-action-grid',
      checks: [['CSS grid layout', /display\s*:\s*grid/i]],
    },
    {
      className: 'swarmsy-grid',
      selector: '.swarmsy-grid,\n.swarmsy-action-grid',
      checks: [['CSS grid layout', /display\s*:\s*grid/i]],
    },
  ];

  for (const contract of componentContracts) {
    if (!anyNormalPageContainsClass(contract.className)) continue;
    const block = selectorBlocksForClass(wikiCss, contract.className)
      || selectorBlock(wikiCss, contract.selector)
      || selectorBlock(wikiCss, contract.selector.replace('\n', '\r\n'));
    if (!block) {
      fail(`${GLOBAL_SHELL_CSS} - missing ${contract.selector} while .${contract.className} exists in public HTML`);
      swarmsyComponentsOk = false;
      continue;
    }
    for (const [label, pattern] of contract.checks) {
      if (!blockHas(block, pattern)) {
        fail(`${GLOBAL_SHELL_CSS} - ${contract.selector} missing ${label}`);
        swarmsyComponentsOk = false;
      }
    }
  }
} else {
  swarmsyComponentsOk = false;
}
if (swarmsyComponentsOk) pass('SWARMSY card, section, pill, and grid classes are defined in css/wiki.css');

console.log('\n[9] SWARMSY routes use landing-page width, not centered wiki lane');
let swarmsyLayoutOk = true;
if (wikiCss) {
  const contentRouteBlock = selectorBlock(wikiCss, 'body.page-swarmsy #content,\nbody.page-about #content')
    || selectorBlock(wikiCss, 'body.page-swarmsy #content,\r\nbody.page-about #content');
  const pageRouteBlock = selectorBlock(wikiCss, 'body.page-swarmsy .swarmsy-page,\nbody.page-about .swarmsy-page')
    || selectorBlock(wikiCss, 'body.page-swarmsy .swarmsy-page,\r\nbody.page-about .swarmsy-page');
  const heroRouteBlock = selectorBlock(wikiCss, 'body.page-swarmsy .swarmsy-hero,\nbody.page-about .swarmsy-hero')
    || selectorBlock(wikiCss, 'body.page-swarmsy .swarmsy-hero,\r\nbody.page-about .swarmsy-hero');
  const heroInnerRouteBlock = selectorBlock(wikiCss, 'body.page-swarmsy .swarmsy-hero-inner,\nbody.page-about .swarmsy-hero-inner')
    || selectorBlock(wikiCss, 'body.page-swarmsy .swarmsy-hero-inner,\r\nbody.page-about .swarmsy-hero-inner');
  const sectionRouteBlock = selectorBlock(wikiCss, 'body.page-swarmsy .swarmsy-section,\nbody.page-about .swarmsy-section')
    || selectorBlock(wikiCss, 'body.page-swarmsy .swarmsy-section,\r\nbody.page-about .swarmsy-section');

  if (!blockHas(contentRouteBlock, /padding-left\s*:\s*0/i) || !blockHas(contentRouteBlock, /padding-right\s*:\s*0/i)) {
    fail(`${GLOBAL_SHELL_CSS} - SWARMSY/About routes must remove #content side padding`);
    swarmsyLayoutOk = false;
  }
  if (
    !blockHas(pageRouteBlock, /width\s*:\s*100%/i) ||
    !blockHas(pageRouteBlock, /max-width\s*:\s*none/i) ||
    !blockHas(pageRouteBlock, /margin\s*:\s*0/i)
  ) {
    fail(`${GLOBAL_SHELL_CSS} - .swarmsy-page must be full-width on SWARMSY/About routes`);
    swarmsyLayoutOk = false;
  }
  if (
    !blockHas(heroRouteBlock, /width\s*:\s*100%/i) ||
    !blockHas(heroRouteBlock, /max-width\s*:\s*none/i) ||
    !blockHas(heroRouteBlock, /margin\s*:\s*0/i) ||
    !blockHas(heroRouteBlock, /border-radius\s*:\s*0/i)
  ) {
    fail(`${GLOBAL_SHELL_CSS} - .swarmsy-hero must be full-bleed on SWARMSY/About routes`);
    swarmsyLayoutOk = false;
  }
  if (!blockHas(heroInnerRouteBlock, /max-width\s*:\s*1100px/i)) {
    fail(`${GLOBAL_SHELL_CSS} - .swarmsy-hero-inner must keep readable max-width on SWARMSY/About routes`);
    swarmsyLayoutOk = false;
  }
  if (
    !blockHas(sectionRouteBlock, /max-width\s*:\s*none/i) ||
    !blockHas(sectionRouteBlock, /margin-left\s*:\s*clamp/i) ||
    !blockHas(sectionRouteBlock, /margin-right\s*:\s*clamp/i)
  ) {
    fail(`${GLOBAL_SHELL_CSS} - .swarmsy-section must use full-width route margins without centered lane cap`);
    swarmsyLayoutOk = false;
  }
} else {
  swarmsyLayoutOk = false;
}
if (swarmsyLayoutOk) pass('SWARMSY/About routes have full-width landing-page layout contract');

console.log('\n--- Result ---');
console.log(`  Normal public pages checked : ${normalPages.length}`);
console.log(`  CSS files checked           : ${CSS_FILES_TO_AUDIT.length}`);
console.log(`  Passes                      : ${passes}`);
console.log(`  Failures                    : ${failures}`);

if (failures > 0) {
  console.error(`\nVisual parity audit FAILED: ${failures} failure(s)\n`);
  process.exit(1);
}

console.log('\nVisual parity audit passed.\n');

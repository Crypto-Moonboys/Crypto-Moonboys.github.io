#!/usr/bin/env node
/**
 * repo-consistency-audit.mjs
 *
 * Lightweight guardrail script. Checks for known repo consistency issues.
 * Not a full test suite — catches regressions introduced by future agents.
 *
 * Run: node scripts/repo-consistency-audit.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let failures = 0;
let warnings = 0;

function pass(msg)  { console.log(`  [PASS] ${msg}`); }
function fail(msg)  { console.error(`  [FAIL] ${msg}`); failures++; }
function warn(msg)  { console.warn(`  [WARN] ${msg}`); warnings++; }

function read(rel) {
  const full = resolve(ROOT, rel);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

function scriptLineNumbers(html, fragment) {
  // Returns all line numbers containing the fragment (may appear more than once).
  return html.split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => line.includes(fragment))
    .map(({ n }) => n);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1] No duplicate id="sidebar" per HTML file');
const sidebarFiles = [
  'index.html',
  'community.html',
  'dashboard.html',
  'agent.html',
  'sam.html',
  'block-topia.html',
  'how-to-play.html',
];
for (const file of sidebarFiles) {
  const html = read(file);
  if (!html) { warn(`${file} not found`); continue; }
  const matches = (html.match(/id="sidebar"/g) || []).length;
  if (matches > 1) {
    fail(`${file}: duplicate id="sidebar" found (${matches} occurrences)`);
  } else if (matches === 1) {
    pass(`${file}: id="sidebar" appears exactly once`);
  } else {
    warn(`${file}: no id="sidebar" found (expected on full wiki pages)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2] community.html script order: moonboys-state before faction-alignment before battle-layer');
const communityHtml = read('community.html');
if (!communityHtml) {
  fail('community.html not found');
} else {
  const msLine  = scriptLineNumbers(communityHtml, 'moonboys-state.js')[0] ?? Infinity;
  const faLine  = scriptLineNumbers(communityHtml, 'faction-alignment.js')[0] ?? Infinity;
  const blLine  = scriptLineNumbers(communityHtml, 'battle-layer.js')[0] ?? Infinity;

  if (msLine < faLine && faLine < blLine) {
    pass(`community.html: moonboys-state (L${msLine}) → faction-alignment (L${faLine}) → battle-layer (L${blLine})`);
  } else {
    fail(
      `community.html: wrong script order — ` +
      `moonboys-state:L${msLine}, faction-alignment:L${faLine}, battle-layer:L${blLine}. ` +
      `Expected moonboys-state < faction-alignment < battle-layer.`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3] Root pages agent.html, sam.html, block-topia.html use absolute /css and /js paths');
const rootPages = ['agent.html', 'sam.html', 'block-topia.html'];
const relativePatterns = [/href="css\//, /src="js\//];
for (const file of rootPages) {
  const html = read(file);
  if (!html) { fail(`${file} not found`); continue; }
  let clean = true;
  for (const pat of relativePatterns) {
    if (pat.test(html)) {
      fail(`${file}: contains relative path matching ${pat} — should use absolute /css/ or /js/`);
      clean = false;
    }
  }
  if (clean) pass(`${file}: no relative /css or /js paths found`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[4] games/index.html: no ambiguous duplicate "Block Topia" labels');
const gamesIndex = read('games/index.html');
if (!gamesIndex) {
  fail('games/index.html not found');
} else {
  // Count plain "Block Topia" ali-title (without Multiplayer / Quest Maze / Tetris suffix)
  const ambiguousTitles = (gamesIndex.match(/<div class="ali-title">Block Topia<\/div>/g) || []).length;
  if (ambiguousTitles > 0) {
    fail(`games/index.html: found ${ambiguousTitles} bare "Block Topia" ali-title(s) — labels must be "Block Topia Multiplayer" or "Block Topia Quest Maze"`);
  } else {
    pass('games/index.html: no ambiguous bare "Block Topia" ali-title found');
  }

  // Check both labelled variants exist
  const hasMultiplayer = gamesIndex.includes('Block Topia Multiplayer');
  const hasQuestMaze   = gamesIndex.includes('Block Topia Quest Maze');
  hasMultiplayer
    ? pass('games/index.html: "Block Topia Multiplayer" label present')
    : fail('games/index.html: "Block Topia Multiplayer" label missing');
  hasQuestMaze
    ? pass('games/index.html: "Block Topia Quest Maze" label present')
    : fail('games/index.html: "Block Topia Quest Maze" label missing');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[5] /block-topia.html contains intelligence-dashboard disclaimer');
const btHtml = read('block-topia.html');
if (!btHtml) {
  fail('block-topia.html not found');
} else {
  const hasDisclaimer = btHtml.includes('Intelligence Dashboard') || btHtml.includes('intelligence dashboard');
  const hasGameLink   = btHtml.includes('/games/block-topia/');
  hasDisclaimer
    ? pass('block-topia.html: intelligence-dashboard disclaimer present')
    : fail('block-topia.html: missing intelligence-dashboard disclaimer');
  hasGameLink
    ? pass('block-topia.html: link to /games/block-topia/ present')
    : fail('block-topia.html: missing link to /games/block-topia/');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[6] No dead game directory appears in arcade-manifest.js');
const manifest = read('js/arcade/arcade-manifest.js');
const orphanedDirs = [
  'js/arcade/games/breakout/',
  'js/arcade/games/snake/',
  'js/arcade/games/hexgl/',
  'js/arcade/games/hexgl-monster/',
  'js/arcade/games/hexgl-monster-max/',
  'js/arcade/games/blocktopia-phaser/',
  'js/arcade/games/blocktopia-social-hub/',
];
if (!manifest) {
  fail('js/arcade/arcade-manifest.js not found');
} else {
  for (const dir of orphanedDirs) {
    if (manifest.includes(dir)) {
      fail(`arcade-manifest.js: references orphaned directory "${dir}"`);
    } else {
      pass(`arcade-manifest.js: does not reference orphaned dir "${dir}"`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log('Repo consistency audit complete.');
console.log(`  Failures : ${failures}`);
console.log(`  Warnings : ${warnings}`);
console.log('─────────────────────────────────────────\n');

if (failures > 0) process.exit(1);

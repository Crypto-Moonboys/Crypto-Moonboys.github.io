#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

const RETIRED_VISIBLE_NAMES = [
  'Invaders 3008',
  'Pac-Chain',
  'Asteroid Fork',
  'Breakout Bullrun',
  'Tetris Block Topia',
];

const CANONICAL_NAMES = [
  'Meme Swarm 3008',
  'Chain Maze',
  'Forkfield',
  'Bullrun Brick Smash',
  'Block Topia Dropzone',
];

const canonicalPages = [
  'games/meme-swarm-3008/index.html',
  'games/chain-maze/index.html',
  'games/forkfield/index.html',
  'games/bullrun-brick-smash/index.html',
  'games/block-topia-dropzone/index.html',
];

const sharedArcadePages = [
  'games/index.html',
  'games/leaderboard.html',
  'how-to-play.html',
  'community.html',
];

const sharedArcadeUiSources = [
  'js/arcade-graph.js',
  'js/arcade-meta-system.js',
];

const RETIRED_SHORT_LABELS = [
  'Invaders',
  'Pac-Chain',
  'Asteroids',
  'Breakout',
  'Tetris',
];

const fullscreenSource = read('js/game-fullscreen.js');
const arcadeGraphSource = read('js/arcade-graph.js');
const arcadeMetaSource = read('js/arcade-meta-system.js');

for (const retired of RETIRED_VISIBLE_NAMES) {
  const escaped = retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'u');
  assert.ok(!re.test(fullscreenSource), `game-fullscreen.js must not expose retired label: ${retired}`);
}

for (const canonical of CANONICAL_NAMES) {
  assert.ok(
    fullscreenSource.includes(canonical),
    `game-fullscreen.js must include canonical label: ${canonical}`,
  );
}

for (const page of canonicalPages) {
  const html = read(page);
  for (const retired of RETIRED_VISIBLE_NAMES) {
    const escaped = retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(!new RegExp(escaped, 'u').test(html), `${page} must not contain retired name: ${retired}`);
  }
}

for (const page of sharedArcadePages) {
  const html = read(page);
  for (const retired of RETIRED_VISIBLE_NAMES) {
    const escaped = retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(!new RegExp(escaped, 'u').test(html), `${page} must not contain retired name: ${retired}`);
  }
}

for (const sourcePath of sharedArcadeUiSources) {
  const source = read(sourcePath);
  for (const retired of RETIRED_VISIBLE_NAMES) {
    const escaped = retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(!new RegExp(escaped, 'u').test(source), `${sourcePath} must not contain retired name: ${retired}`);
  }
}

for (const retired of RETIRED_SHORT_LABELS) {
  const escaped = retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const graphLabelRe = new RegExp(`label:\\s*'[^']*\\b${escaped}\\b[^']*'`, 'u');
  assert.ok(!graphLabelRe.test(arcadeGraphSource), `js/arcade-graph.js must not expose retired short label: ${retired}`);
}

for (const retired of RETIRED_SHORT_LABELS) {
  const escaped = retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const metaTitleRe = new RegExp(`title:\\s*'[^']*\\b${escaped}\\b[^']*'`, 'u');
  assert.ok(!metaTitleRe.test(arcadeMetaSource), `js/arcade-meta-system.js must not expose retired short label: ${retired}`);
}

const memeSwarmPage = read('games/meme-swarm-3008/index.html');
assert.ok(memeSwarmPage.includes('Meme Swarm 3008'), 'meme-swarm-3008 page must expose Meme Swarm 3008 branding');

console.log('public-arcade-branding-regression.test: PASS');

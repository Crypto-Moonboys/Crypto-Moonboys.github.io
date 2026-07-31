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

const fullscreenSource = read('js/game-fullscreen.js');

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

const memeSwarmPage = read('games/meme-swarm-3008/index.html');
assert.ok(memeSwarmPage.includes('Meme Swarm 3008'), 'meme-swarm-3008 page must expose Meme Swarm 3008 branding');

console.log('public-arcade-branding-regression.test: PASS');

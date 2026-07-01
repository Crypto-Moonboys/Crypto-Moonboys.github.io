#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const script = read('scripts/generate-gkniftyheads-local-thumbnails.mjs');
const workflow = read('.github/workflows/update-site-feeds.yml');
const rarityTest = read('scripts/gkniftyheads-rarity-ranking.test.mjs');

assert.match(script, /const TARGET_WIDTH = 265/, 'thumbnail generator must use a single 265px target width');
assert.match(script, /THUMB_PUBLIC_DIR = '\/img\/gkniftyheads\/thumbs'/, 'thumbnail generator must use the local public thumbnail directory');
assert.match(script, /thumbnail_url/, 'thumbnail generator must add thumbnail_url to rarity rows');
assert.match(script, /thumbnail_status/, 'thumbnail generator must record thumbnail status');
assert.match(script, /row\.thumbnail_url = row\.image_url/, 'thumbnail generator must fall back to original image if local conversion fails');
assert.match(script, /'-resize',[\s\S]*`\$\{TARGET_WIDTH\}x`/, 'thumbnail generator must resize downloads before writing table images');
assert.match(script, /src=\"\$\{escAttr\(row\.image_url\)\}\"/, 'thumbnail generator must rewrite table image src values from original images');
assert.match(script, /src=\"\$\{escAttr\(row\.thumbnail_url\)\}\"/, 'thumbnail generator must rewrite table image src values to thumbnails');

assert.match(workflow, /sudo apt-get install -y imagemagick webp/, 'feed workflow must install free thumbnail tooling');
assert.match(workflow, /node scripts\/generate-gkniftyheads-local-thumbnails\.mjs/, 'feed workflow must generate local thumbnails after feed update');
assert.match(workflow, /node scripts\/gkniftyheads-local-thumbnails\.test\.mjs/, 'feed workflow must validate thumbnail setup');
assert.match(workflow, /git status --short data img\/gkniftyheads\/thumbs wiki\/gkniftyheads-nft-collection\.html/, 'feed workflow must commit thumbnail files and rewritten page output');
assert.match(workflow, /git add data img\/gkniftyheads\/thumbs wiki\/gkniftyheads-nft-collection\.html/, 'feed workflow must stage thumbnail files and rewritten page output');

assert.match(rarityTest, /gk-rarity-nft-image/, 'existing rarity test should still require NFT row images');

console.log('GKniftyHEADS local thumbnail workflow audit passed.');

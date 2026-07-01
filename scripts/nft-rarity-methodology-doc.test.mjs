#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const docPath = path.join(root, 'docs', 'nft-rarity-methodology.md');
const readmePath = path.join(root, 'README.md');

assert.equal(fs.existsSync(docPath), true, 'docs/nft-rarity-methodology.md must exist');

const doc = fs.readFileSync(docPath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');

assert.match(readme, /docs\/nft-rarity-methodology\.md/, 'README.md should link to the NFT rarity methodology doc');
assert.match(doc, /GKniftyHEADS/, 'doc should mention GKniftyHEADS');
assert.match(doc, /NoBallGames|NoBallGamess/, 'doc should mention NoBallGames / NoBallGamess');
assert.match(doc, /AtomicAssets is the source of truth/, 'doc should say AtomicAssets is source of truth');
assert.match(doc, /AtomicHub is a marketplace\/reference link only|AtomicHub is.*reference-only/i, 'doc should say AtomicHub is reference-only');
assert.match(doc, /Original mint numbers never change/, 'doc should say original mint numbers never change');
assert.match(doc, /Burns do not renumber NFTs|burns do not renumber NFTs/i, 'doc should say burns do not renumber NFTs');
assert.match(doc, /surviving_mint_rank|surviving mint rank/, 'doc should mention surviving mint rank');
assert.match(doc, /separate from original mint number/, 'doc should separate surviving mint rank from original mint number');
assert.match(doc, /floor price in rarity scoring/, 'doc should exclude floor price from rarity scoring');
assert.match(doc, /sales volume in rarity scoring/, 'doc should exclude sales volume from rarity scoring');
assert.match(doc, /listing count in rarity scoring/, 'doc should exclude listings from rarity scoring');
assert.match(doc, /market cap in rarity scoring/, 'doc should exclude market cap from rarity scoring');
assert.match(doc, /Template-and-trait rarity/, 'doc should explain GKniftyHEADS model');
assert.match(doc, /Template-plus-asset rarity/, 'doc should explain NoBallGames model');
assert.match(doc, /does not use the same numeric formula as GKniftyHEADS/, 'doc must not claim NoBallGames uses the exact GKniftyHEADS weights');
assert.match(doc, /Best version checklist:[\s\S]*Template Rarity Ranking/, 'doc should explain how to find a GKniftyHEADS version');
assert.match(doc, /Best version checklist:[\s\S]*Asset Rarity Leaderboard/, 'doc should explain how to find a NoBallGames version');

console.log('NFT rarity methodology doc checks passed.');

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
assert.match(doc, /same broad adaptive weighted rarity framework/i, 'doc should say both collections use the same broad adaptive framework');
assert.match(doc, /richer rarity\/variation metadata[\s\S]*thinner metadata/i, 'doc should explain metadata richness may differ');
assert.match(doc, /missing trait weight moves to live supply scarcity|trait weight moves to live supply scarcity/i, 'doc should say missing trait weight is reassigned to live supply');
assert.match(doc, /Burns increase rarity through lower live supply and a small burn\/missing bonus/i, 'doc should say burns increase rarity through lower live supply plus small burn bonus');
assert.match(doc, /does not invent fake traits|no fake traits/i, 'doc should say no fake traits are created');
assert.match(doc, /Template \/ edition rarity/, 'doc should explain template/edition rarity');
assert.match(doc, /Asset \/ numbered-print rarity/, 'doc should explain asset/numbered-print rarity');
assert.match(doc, /10,000-edition print run[\s\S]*surviving rank `#1`/, 'doc should include the numbered print survival example');
assert.match(doc, /AtomicAssets is the source of truth/, 'doc should say AtomicAssets is source of truth');
assert.match(doc, /AtomicHub is a marketplace\/reference link only|AtomicHub is.*reference-only/i, 'doc should say AtomicHub is reference-only');
assert.match(doc, /Original mint numbers never change/, 'doc should say original mint numbers never change');
assert.match(doc, /burns never renumber the NFT|Burns do not renumber NFTs/i, 'doc should say burns do not renumber NFTs');
assert.match(doc, /surviving mint rank is separate from original mint number/i, 'doc should separate surviving mint rank from original mint number');
assert.match(doc, /final_score =[\s\S]*supplyScore \* 50[\s\S]*rarityScore \* 25[\s\S]*variationScore \* 20[\s\S]*burnScore \* 5/, 'doc should include the GKniftyHEADS 50/25/20/5 formula');
assert.match(doc, /rarity trait\/name exposure scarcity/i, 'doc should say GKniftyHEADS uses rarity trait/name exposure');
assert.match(doc, /variation trait\/name exposure scarcity/i, 'doc should say GKniftyHEADS uses variation trait/name exposure');
assert.match(doc, /NoBallGames uses the same broad adaptive weighted rarity framework/i, 'doc should say NoBallGames uses adaptive weighted scoring');
assert.match(doc, /sorts ranked templates with 1\/1 templates first, then `final_score`, then `live_supply`, then `template_id`/, 'doc should describe NoBallGames adaptive sort order');
assert.doesNotMatch(doc, /NoBallGames[\s\S]{0,120}inverse live supply/i, 'doc must not describe NoBallGames as inverse-live-supply-only');
assert.match(doc, /asset-state cache[\s\S]*surviving mint ranks[\s\S]*holder leaderboard[\s\S]*asset rarity leaderboard/i, 'doc should list NoBallGames asset-state and leaderboard outputs');
assert.match(doc, /display-only[\s\S]*not scoring/i, 'doc should say market data is display-only and excluded from scoring');
assert.match(doc, /floor price in rarity scoring/, 'doc should exclude floor price from rarity scoring');
assert.match(doc, /sales volume in rarity scoring/, 'doc should exclude sales volume from rarity scoring');
assert.match(doc, /listing count in rarity scoring/, 'doc should exclude listings from rarity scoring');
assert.match(doc, /market cap in rarity scoring/, 'doc should exclude market cap from rarity scoring');

console.log('NFT rarity methodology doc checks passed.');

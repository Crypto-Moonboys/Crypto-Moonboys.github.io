#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  const stat = fs.statSync(fullPath);
  assert.ok(stat.size > 2, `${relativePath} must not be empty`);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function assertFormula(payload, label) {
  assert.equal(payload.collection, 'noballgamess', `${label} should identify the NoBallGames collection`);
  assert.ok(payload.generated_at, `${label} should expose generated_at`);
  assert.equal(payload.asset_ranking_formula?.asset_ranking_enabled, true, `${label} should expose enabled asset_ranking_formula`);
  assert.equal(payload.asset_ranking_formula?.burned_assets_excluded, true, `${label} should exclude burned assets`);
  assert.equal(payload.asset_ranking_formula?.price_used, false, `${label} must not use price`);
  assert.equal(payload.asset_ranking_formula?.market_data_used, false, `${label} must not use market data`);
  assert.ok(Array.isArray(payload.assets), `${label} should expose an assets array`);
}

function assertAssetRow(row, label) {
  for (const field of [
    'asset_rank',
    'asset_final_score',
    'asset_id',
    'template_id',
    'template_rank',
    'template_final_score',
    'template_score_component',
    'original_mint_number',
    'original_mint_score',
    'original_mint_score_component',
    'original_mint_status',
    'surviving_mint_rank',
    'surviving_mint_rank_score',
    'surviving_mint_rank_score_component',
    'surviving_mint_rank_status',
    'live_supply',
    'issued_supply',
    'rarity_band',
    'burned',
    'price_used',
    'market_data_used',
  ]) {
    assert.ok(Object.hasOwn(row, field), `${label} first asset should include ${field}`);
  }
  assert.ok(Object.hasOwn(row, 'owner'), `${label} first asset should include owner, even when null/blank`);
  assert.equal(row.burned, false, `${label} must contain live/unburned ranked assets only`);
  assert.equal(row.price_used, false, `${label} asset rows must not use price`);
  assert.equal(row.market_data_used, false, `${label} asset rows must not use market data`);
  assert.equal(Number.isFinite(row.asset_rank), true, `${label} first asset should have numeric asset_rank`);
  assert.equal(Number.isFinite(row.asset_final_score), true, `${label} first asset should have numeric asset_final_score`);
}

const assetState = readJson('data/noballgamess/asset-state-cache.json');
const assetLeaderboard = readJson('data/noballgamess/asset-rarity-leaderboard.json');
const liveAssetRarity = readJson('data/noballgamess/live-asset-rarity.json');
const pageHtml = readText('wiki/noballgamess-nft-collection.html');

assertFormula(assetLeaderboard, 'asset-rarity-leaderboard.json');
assertFormula(liveAssetRarity, 'live-asset-rarity.json');
assert.ok(
  ['atomicassets live asset count', 'issued-supply fallback'].includes(liveAssetRarity.status),
  'live-asset-rarity.json should identify a documented live data status',
);

const liveAssetStateRows = (assetState.assets || []).filter((row) => !row.burned);
if (liveAssetStateRows.length > 0) {
  assert.ok(assetLeaderboard.assets.length > 0, 'asset-rarity-leaderboard.json must contain assets when asset-state cache has live assets');
  assert.ok(liveAssetRarity.assets.length > 0, 'live-asset-rarity.json must contain assets when asset-state cache has live assets');
}

assertAssetRow(assetLeaderboard.assets[0], 'asset-rarity-leaderboard.json');
assertAssetRow(liveAssetRarity.assets[0], 'live-asset-rarity.json');
assert.deepEqual(
  assetLeaderboard.assets.map((row) => row.asset_id),
  liveAssetRarity.assets.map((row) => row.asset_id),
  'asset-rarity-leaderboard.json and live-asset-rarity.json should expose the same scored asset ordering',
);

assert.match(pageHtml, /<h2>Asset Version Ranking<\/h2>/, 'NoBallGames page should render Asset Version Ranking');
assert.match(pageHtml, new RegExp(String(assetLeaderboard.assets[0].asset_id)), 'page Asset Version Ranking rows should be backed by JSON asset data');
assert.match(pageHtml, new RegExp(String(assetLeaderboard.assets[0].template_id)), 'page Asset Version Ranking rows should include JSON-backed template IDs');

console.log('NoBallGames committed asset JSON integrity checks passed.');

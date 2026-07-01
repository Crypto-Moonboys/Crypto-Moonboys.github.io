#!/usr/bin/env node

import assert from 'node:assert/strict';
import { ASSET_RANKING_FORMULA, buildAssetVersionRanking } from './nft-asset-version-ranking.mjs';

const templates = [
  { template_id: 1, rank: 1, title: 'Rare Poor Mint', final_score: 90, live_supply: 10, issued_supply: 10, rarity_band: 'Ultra Rare' },
  { template_id: 2, rank: 2, title: 'Common Mint One', final_score: 70, live_supply: 10, issued_supply: 10, rarity_band: 'Common' },
  { template_id: 3, rank: 3, title: 'Survivor', final_score: 50, live_supply: 1, issued_supply: 10000, rarity_band: 'Common' },
];

const assets = buildAssetVersionRanking([
  { asset_id: 'rare-poor', template_id: 1, original_mint_number: 10, surviving_mint_rank: 10, burned: false },
  { asset_id: 'common-one', template_id: 2, original_mint_number: 1, surviving_mint_rank: 1, burned: false },
  { asset_id: 'same-template-one', template_id: 1, original_mint_number: 1, surviving_mint_rank: 1, burned: false },
  { asset_id: 'survivor-high-original', template_id: 3, original_mint_number: 10000, surviving_mint_rank: 1, burned: false },
  { asset_id: 'burned', template_id: 1, original_mint_number: 2, surviving_mint_rank: 2, burned: true },
  { asset_id: 'missing-original', template_id: 2, original_mint_number: null, surviving_mint_rank: 2, burned: false },
  { asset_id: 'missing-surviving', template_id: 2, original_mint_number: 2, surviving_mint_rank: null, burned: false },
], templates);

const byId = new Map(assets.map((row) => [row.asset_id, row]));

assert.equal(ASSET_RANKING_FORMULA.asset_ranking_enabled, true, 'asset ranking formula should be explicitly enabled');
assert.equal(ASSET_RANKING_FORMULA.price_used, false, 'asset ranking formula must exclude price');
assert.equal(ASSET_RANKING_FORMULA.market_data_used, false, 'asset ranking formula must exclude market data');
assert.deepEqual(ASSET_RANKING_FORMULA.score_weights, {
  template_final_score: 60,
  original_mint_number: 20,
  surviving_mint_rank: 20,
}, 'asset score weights should stay 60/20/20');

assert.equal(byId.has('burned'), false, 'burned assets must be excluded from Asset Version Ranking');
assert.ok(byId.get('common-one').asset_final_score > byId.get('rare-poor').asset_final_score, 'common template mint #1 should compete against rare template poor mint');
assert.ok(byId.get('same-template-one').asset_final_score > byId.get('rare-poor').asset_final_score, 'same-template original mint #1 should outrank original mint #10 with same surviving status');
assert.equal(byId.get('survivor-high-original').surviving_mint_rank, 1, 'high original mint can still carry surviving rank #1');
assert.equal(byId.get('survivor-high-original').surviving_mint_rank_score, 1, 'surviving rank #1 should receive full surviving rank score');
assert.equal(byId.get('missing-surviving').surviving_mint_rank_status, 'missing', 'missing surviving rank should be marked missing');
assert.equal(byId.get('missing-surviving').surviving_mint_rank_score_component, 0, 'missing surviving rank must not fake score');
assert.equal(byId.get('missing-original').original_mint_status, 'missing', 'missing original mint should be marked missing');
assert.equal(byId.get('missing-original').original_mint_score_component, 0, 'missing original mint must not fake score');

for (let index = 1; index < assets.length; index += 1) {
  const previous = assets[index - 1];
  const current = assets[index];
  assert.ok(
    previous.asset_final_score >= current.asset_final_score,
    'assets should sort by asset_final_score descending',
  );
}
assert.deepEqual(assets.map((row) => row.asset_rank), assets.map((_, index) => index + 1), 'asset ranks should be assigned after sorting');

console.log('NFT asset version ranking formula regression passed.');

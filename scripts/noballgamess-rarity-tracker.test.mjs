#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateNoballgamessRarity,
  updateNoballgamessAssetStateCache,
  updateNoballgamessLiveSupplyCache,
  updateNoballgamessTemplateMetadataCache,
} from './noballgamess-tracker-lib.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noballgamess-tracker-'));
  fs.mkdirSync(path.join(root, 'data', 'noballgamess'), { recursive: true });
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
  return root;
}

function template(templateId, issuedSupply, maxSupply, name = `NoBallGames ${templateId}`) {
  return {
    template_id: String(templateId),
    issued_supply: String(issuedSupply),
    max_supply: String(maxSupply),
    schema_name: 'noballgames',
    immutable_data: {
      name,
      img: `bafy${templateId}`,
      rarity: 'Fixture',
    },
  };
}

function asset(assetId, templateId, mint, burned = false, owner = 'holder.gm') {
  return {
    asset_id: String(assetId),
    template: { template_id: String(templateId) },
    template_mint: String(mint),
    burned: burned ? 'true' : 'false',
    owner,
    updated_at_time: '1782920000000',
    created_at_time: '1782910000000',
  };
}

const root = makeRoot();

await updateNoballgamessTemplateMetadataCache(root, {
  templates: [
    template(100001, 3, 3, 'Fixture Ranked'),
    template(100002, 5, 0, 'Fixture Open Mint'),
    template(100003, 0, 10, 'Fixture Unissued'),
  ],
});

const metadata = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'template-metadata-cache.json'), 'utf8'));
assert.equal(metadata.templates.length, 3, 'metadata cache should contain AtomicAssets-confirmed fixture templates');
assert.ok(metadata.templates.every((row) => row.exists_on_atomicassets === true), 'metadata cache requires AtomicAssets-confirmed templates');
assert.ok(metadata.templates.every((row) => row.image_sources.length > 0), 'metadata cache should resolve image sources from immutable_data');

await updateNoballgamessLiveSupplyCache(root, {
  fetchJson: async (url) => {
    assert.match(url, /collection_name=noballgamess/, 'live supply URLs must target noballgamess');
    if (/template_id=100001/.test(url)) return { data: '2' };
    if (/template_id=100002/.test(url)) return { data: 4 };
    return { data: 0 };
  },
});

const sourceKeys = [];
await updateNoballgamessAssetStateCache(root, {
  batchSize: 2,
  fetchJson: async (url, { sourceKey }) => {
    sourceKeys.push(sourceKey);
    assert.match(url, /collection_name=noballgamess/, 'asset-state URLs must target noballgamess');
    if (sourceKey === 'latest_created_assets') return { data: [asset('a1', 100001, 1, false, 'one.gm')] };
    if (sourceKey === 'recently_updated_live_assets') return { data: [asset('a2', 100001, 3, false, 'two.gm')] };
    if (sourceKey === 'recently_updated_burned_assets') return { data: [asset('a3', 100001, 2, true, 'burned.gm')] };
    return { data: [] };
  },
});

assert.deepEqual(sourceKeys.slice(0, 3), ['latest_created_assets', 'recently_updated_live_assets', 'recently_updated_burned_assets'], 'daily delta scans should always run');
assert.ok(sourceKeys.includes('template_assets_backfill:100001'), 'rotating template backfill should run for selected template IDs');

await generateNoballgamessRarity(root);

const templateRarity = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'template-rarity.json'), 'utf8'));
const assetState = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'asset-state-cache.json'), 'utf8'));
const ranks = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'surviving-mint-ranks.json'), 'utf8'));
const holders = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'holder-leaderboard.json'), 'utf8'));
const assetLeaderboard = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'asset-rarity-leaderboard.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'wiki', 'noballgamess-nft-collection.html'), 'utf8');

assert.equal(templateRarity.ranked_templates.some((row) => row.template_id === 100001), true, 'fixed-supply template should rank');
assert.equal(templateRarity.utility_open_mint_templates.some((row) => row.template_id === 100002), true, 'max_supply=0 template should be utility/open mint');
assert.equal(templateRarity.unissued_templates.some((row) => row.template_id === 100003), true, 'issued_supply=0 template should be unissued');
assert.equal(templateRarity.ranked_templates[0].live_supply, 2, 'rarity maths should use AtomicAssets live supply count when available');
assert.equal(templateRarity.ranked_templates[0].issued_supply, 3, 'issued_supply should remain visible separately');
assert.equal(templateRarity.ranked_templates[0].price_used, false, 'price must not be used in rarity scoring');
assert.equal(templateRarity.ranked_templates[0].market_data_used, false, 'market data must not be used in rarity scoring');
assert.equal(templateRarity.ranking_formula.source_of_truth, 'AtomicAssets', 'AtomicAssets must be the NoBallGames scoring source of truth');
assert.equal(templateRarity.ranking_formula.atomichub_usage, 'reference_links_only', 'AtomicHub must stay reference-only for NoBallGames scoring');
assert.equal(templateRarity.ranking_formula.price_used, false, 'ranking formula must explicitly exclude price');
assert.equal(templateRarity.ranking_formula.market_data_used, false, 'ranking formula must explicitly exclude market data');
for (const row of [
  ...templateRarity.ranked_templates,
  ...templateRarity.utility_open_mint_templates,
  ...templateRarity.unissued_templates,
]) {
  assert.equal('floor_price' in row, false, 'rarity rows must not include floor_price scoring fields');
  assert.equal('last_sale' in row, false, 'rarity rows must not include last_sale scoring fields');
  assert.equal('marketplace_listing_count' in row, false, 'rarity rows must not include marketplace_listing_count scoring fields');
  assert.equal('listing_count' in row, false, 'rarity rows must not include listing_count scoring fields');
}

const burnedAsset = assetState.assets.find((row) => row.asset_id === 'a3');
assert.equal(burnedAsset.original_mint_number, 2, 'asset-state cache preserves original_mint_number');
assert.equal(burnedAsset.burned, true, 'burned fixture asset should remain marked burned');
const liveRankedAssets = ranks.templates.find((row) => row.template_id === 100001).assets;
assert.deepEqual(liveRankedAssets.map((row) => row.original_mint_number), [1, 3], 'surviving_mint_rank excludes burned assets without renumbering original mint numbers');
assert.deepEqual(liveRankedAssets.map((row) => row.surviving_mint_rank), [1, 2], 'surviving_mint_rank recalculates among unburned assets');
assert.equal(holders.holders.some((row) => row.owner === 'burned.gm'), false, 'holder leaderboard excludes burned assets');
assert.equal(assetLeaderboard.assets.some((row) => row.asset_id === 'a3'), false, 'asset rarity leaderboard excludes burned assets');

assert.match(html, /Original mint numbers never change/, 'page should explain permanent original mint numbers');
assert.match(html, /surviving mint rank/, 'page should explain surviving mint rank');
assert.match(html, /data-feed-status-id="noballgamess_rarity"/, 'page should expose NoBallGames feed status badge');
assert.match(html, /AtomicAssets is the source of truth/, 'page should name AtomicAssets as source of truth');
assert.match(html, /Template Stats/, 'page should render template stats section');
assert.match(html, /Trait Exposure/, 'page should render trait exposure section');
assert.match(html, /Holder Leaderboard/, 'page should render holder leaderboard section');
assert.match(html, /Asset Rarity Leaderboard/, 'page should render asset rarity leaderboard section');

console.log('NoBallGames rarity tracker regression passed.');

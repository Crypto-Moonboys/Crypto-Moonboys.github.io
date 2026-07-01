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
import { updateNftMarketAnalytics } from './nft-market-analytics.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noballgamess-tracker-'));
  fs.mkdirSync(path.join(root, 'data', 'noballgamess'), { recursive: true });
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
  return root;
}

function template(templateId, issuedSupply, maxSupply, name = `NoBallGames ${templateId}`, immutableExtras = {}, schemaName = 'noballgames') {
  return {
    template_id: String(templateId),
    issued_supply: String(issuedSupply),
    max_supply: String(maxSupply),
    schema_name: schemaName,
    immutable_data: {
      name,
      img: `bafy${templateId}`,
      ...immutableExtras,
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
    template(100001, 3, 3, 'Fixture Ranked', { rarity: 'Alpha', variation: 'Red' }),
    template(100002, 5, 0, 'Fixture Open Mint'),
    template(100003, 0, 10, 'Fixture Unissued'),
    template(100004, 100, 100, 'Fixture Missing Variation', { rarity: 'Beta' }, 'unknown'),
    template(100005, 100, 100, 'Fixture Missing Rarity', { variation: 'Blue' }),
    template(100006, 100, 100, 'Fixture Thin Metadata', {}, 'unknown'),
    template(100007, 10, 100, 'Fixture Thin No Burn', {}, 'unknown'),
  ],
  fetchTemplatesBatch: async (rows, url) => {
    assert.match(url, /\/atomicassets\/v1\/templates\?collection_name=noballgamess&ids=100001,100002,100003,100004,100005,100006,100007&limit=1000/, 'NoBallGames metadata updater must attempt ids= batch fetch');
    return { data: rows };
  },
  fetchTemplate: async () => {
    throw new Error('single-template fallback should not run after fixture batch success');
  },
});

const metadata = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'template-metadata-cache.json'), 'utf8'));
assert.equal(metadata.templates.length, 7, 'metadata cache should contain AtomicAssets-confirmed fixture templates');
assert.ok(metadata.templates.every((row) => row.exists_on_atomicassets === true), 'metadata cache requires AtomicAssets-confirmed templates');
assert.ok(metadata.templates.every((row) => row.image_sources.length > 0), 'metadata cache should resolve image sources from immutable_data');
assert.ok(metadata.templates.every((row) => row.metadata_fetch_mode === 'batch_ids'), 'metadata cache should record batch_ids fetch mode after batch hydration');

const fallbackRoot = makeRoot();
const fallbackOrder = [];
await updateNoballgamessTemplateMetadataCache(fallbackRoot, {
  templates: [
    template(100011, 1, 1, 'Fallback Ranked'),
    template(100012, 2, 2, 'Fallback Ranked 2'),
  ],
  fetchTemplatesBatch: async () => {
    fallbackOrder.push('batch');
    throw new Error('ids unsupported fixture');
  },
  fetchTemplate: async (row) => {
    fallbackOrder.push(`single:${row.template_id}`);
    return { data: row };
  },
});
const fallbackMetadata = JSON.parse(fs.readFileSync(path.join(fallbackRoot, 'data', 'noballgamess', 'template-metadata-cache.json'), 'utf8'));
assert.deepEqual(fallbackOrder, ['batch', 'single:100011', 'single:100012'], 'NoBallGames metadata updater should fallback to single-template fetches after batch failure');
assert.ok(fallbackMetadata.templates.every((row) => row.metadata_fetch_mode === 'single_template_fallback'), 'fallback rows should record single_template_fallback fetch mode');

let cacheFetchAttempted = false;
const cacheReuseResult = await updateNoballgamessTemplateMetadataCache(root, {
  templates: [template(100001, 3, 3, 'Fixture Ranked')],
  fetchTemplatesBatch: async () => {
    cacheFetchAttempted = true;
    throw new Error('fresh confirmed cache should not refetch');
  },
  fetchTemplate: async () => {
    cacheFetchAttempted = true;
    throw new Error('fresh confirmed cache should not refetch');
  },
});
assert.equal(cacheFetchAttempted, false, 'fresh confirmed NoBallGames metadata should be reused without AtomicAssets calls');
assert.equal(cacheReuseResult.cached_confirmed >= 1, true, 'metadata updater should report cached_confirmed rows');

await updateNoballgamessLiveSupplyCache(root, {
  fetchJson: async (url) => {
    assert.match(url, /collection_name=noballgamess/, 'live supply URLs must target noballgamess');
    if (/template_id=100001/.test(url)) return { data: '2' };
    if (/template_id=100002/.test(url)) return { data: 4 };
    if (/template_id=100004/.test(url)) return { data: 90 };
    if (/template_id=100005/.test(url)) return { data: 80 };
    if (/template_id=100006/.test(url)) return { data: 10 };
    if (/template_id=100007/.test(url)) return { data: 10 };
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

await updateNftMarketAnalytics({
  root,
  collection: 'noballgamess',
  fetchJson: async () => {
    throw new Error('HiveBP fixture unavailable');
  },
});

await generateNoballgamessRarity(root);

const templateRarity = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'template-rarity.json'), 'utf8'));
const assetState = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'asset-state-cache.json'), 'utf8'));
const ranks = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'surviving-mint-ranks.json'), 'utf8'));
const holders = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'holder-leaderboard.json'), 'utf8'));
const assetLeaderboard = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'asset-rarity-leaderboard.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'wiki', 'noballgamess-nft-collection.html'), 'utf8');
const marketAnalytics = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noballgamess', 'market-analytics.json'), 'utf8'));

assert.equal(templateRarity.ranked_templates.some((row) => row.template_id === 100001), true, 'fixed-supply template should rank');
assert.equal(templateRarity.utility_open_mint_templates.some((row) => row.template_id === 100002), true, 'max_supply=0 template should be utility/open mint');
assert.equal(templateRarity.unissued_templates.some((row) => row.template_id === 100003), true, 'issued_supply=0 template should be unissued');
assert.equal(templateRarity.ranked_templates[0].live_supply, 2, 'rarity maths should use AtomicAssets live supply count when available');
assert.equal(templateRarity.ranked_templates[0].issued_supply, 3, 'issued_supply should remain visible separately');
const rankedByTemplate = new Map(templateRarity.ranked_templates.map((row) => [row.template_id, row]));
assert.deepEqual(rankedByTemplate.get(100001).score_weights_used, { supplyScore: 50, rarityScore: 25, variationScore: 20, burnScore: 5 }, 'full NoBallGames metadata should use 50/25/20/5');
assert.deepEqual(rankedByTemplate.get(100004).score_weights_used, { supplyScore: 70, rarityScore: 25, variationScore: 0, burnScore: 5 }, 'missing NoBallGames variation should use 70/25/0/5');
assert.deepEqual(rankedByTemplate.get(100005).score_weights_used, { supplyScore: 75, rarityScore: 0, variationScore: 20, burnScore: 5 }, 'missing NoBallGames rarity should use 75/0/20/5');
assert.deepEqual(rankedByTemplate.get(100006).score_weights_used, { supplyScore: 95, rarityScore: 0, variationScore: 0, burnScore: 5 }, 'thin NoBallGames metadata should use 95/0/0/5');
assert.equal(rankedByTemplate.get(100006).rarity_trait, 'Not supplied', 'thin NoBallGames metadata should not invent rarity traits');
assert.equal(rankedByTemplate.get(100006).variation_trait, 'Not supplied', 'thin NoBallGames metadata should not invent variation traits');
assert.equal(rankedByTemplate.get(100006).rarity_trait_scoring_enabled, false, 'missing rarity should not be scored');
assert.equal(rankedByTemplate.get(100006).variation_trait_scoring_enabled, false, 'missing variation should not be scored');
assert.notEqual(rankedByTemplate.get(100001).final_score, Math.round((1 / Math.max(1, rankedByTemplate.get(100001).live_supply)) * 100000) / 100, 'NoBallGames final_score should be adaptive, not simple inverse live supply');
assert.ok(rankedByTemplate.get(100006).burn_score_component > rankedByTemplate.get(100007).burn_score_component, 'same live supply with higher proven missing/burned percentage should get higher burn component');
assert.ok(rankedByTemplate.get(100006).final_score > rankedByTemplate.get(100007).final_score, 'thin metadata with burns should score higher than equivalent no-burn thin metadata');
assert.ok(templateRarity.ranked_templates.filter((row) => row.live_supply === 1).every((row, index) => templateRarity.ranked_templates[index].live_supply === 1), 'NoBallGames ranked sort should put 1/1 templates first');
assert.equal(templateRarity.ranked_templates[0].price_used, false, 'price must not be used in rarity scoring');
assert.equal(templateRarity.ranked_templates[0].market_data_used, false, 'market data must not be used in rarity scoring');
assert.equal(templateRarity.ranking_formula.source_of_truth, 'AtomicAssets', 'AtomicAssets must be the NoBallGames scoring source of truth');
assert.equal(templateRarity.ranking_formula.atomichub_usage, 'reference_links_only', 'AtomicHub must stay reference-only for NoBallGames scoring');
assert.equal(templateRarity.ranking_formula.price_used, false, 'ranking formula must explicitly exclude price');
assert.equal(templateRarity.ranking_formula.market_data_used, false, 'ranking formula must explicitly exclude market data');
assert.equal(templateRarity.ranking_formula.adaptive_weighting, true, 'NoBallGames template scoring should use adaptive weighting');
assert.deepEqual(templateRarity.ranking_formula.base_score_weights, {
  live_supply_scarcity: 50,
  rarity_trait_or_name_exposure_scarcity: 25,
  variation_trait_or_metadata_exposure_scarcity: 20,
  missing_burned_supply_bonus: 5,
}, 'NoBallGames base adaptive score weights should be documented in JSON');
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
assert.equal(assetLeaderboard.asset_ranking_formula.asset_ranking_enabled, true, 'NoBallGames asset leaderboard should expose Asset Version Ranking formula');
assert.equal(assetLeaderboard.asset_ranking_formula.burned_assets_excluded, true, 'Asset Version Ranking should exclude burned assets');
assert.equal(assetLeaderboard.asset_ranking_formula.price_used, false, 'Asset Version Ranking must exclude price');
assert.equal(assetLeaderboard.asset_ranking_formula.market_data_used, false, 'Asset Version Ranking must exclude market data');
assert.ok(assetLeaderboard.assets.every((row) => Number.isFinite(row.asset_rank)), 'asset rows should include asset_rank');
assert.ok(assetLeaderboard.assets.every((row) => Number.isFinite(row.asset_final_score)), 'asset rows should include asset_final_score');
assert.ok(assetLeaderboard.assets.every((row) => Number.isFinite(row.template_final_score)), 'asset rows should include template_final_score');
assert.ok(assetLeaderboard.assets.every((row) => Number.isFinite(row.original_mint_score_component)), 'asset rows should include original mint score component');
assert.ok(assetLeaderboard.assets.every((row) => Number.isFinite(row.surviving_mint_rank_score_component)), 'asset rows should include surviving mint rank score component');
assert.ok(assetLeaderboard.assets.every((row) => row.burned === false), 'asset rows should only include live/unburned assets');
for (let index = 1; index < assetLeaderboard.assets.length; index += 1) {
  const previous = assetLeaderboard.assets[index - 1];
  const current = assetLeaderboard.assets[index];
  assert.ok(
    previous.asset_final_score >= current.asset_final_score,
    'asset rows should sort by asset_final_score descending',
  );
}
assert.equal(marketAnalytics.display_only, true, 'market analytics sidecar is display-only');
assert.equal(marketAnalytics.rarity_input, false, 'market analytics sidecar is not a rarity input');
assert.equal(marketAnalytics.analytics_status, 'pending', 'HiveBP failure keeps analytics separate and pending without failing rarity generation');

assert.match(html, /Original mint numbers never change/, 'page should explain permanent original mint numbers');
assert.match(html, /surviving mint rank/, 'page should explain surviving mint rank');
assert.match(html, /data-feed-status-id="noballgamess_rarity"/, 'page should expose NoBallGames feed status badge');
assert.match(html, /AtomicAssets is the source of truth/, 'page should name AtomicAssets as source of truth');
assert.match(html, /Template Stats/, 'page should render template stats section');
assert.match(html, /shared adaptive weighted rarity framework/, 'page should explain the shared adaptive weighted rarity framework');
assert.match(html, /Final Score/, 'page should render final_score column');
assert.match(html, /Rarity Scored/, 'page should render rarity scoring enabled state');
assert.match(html, /Variation Scored/, 'page should render variation scoring enabled state');
assert.match(html, /Weights Used/, 'page should render score weights used where practical');
assert.match(html, /Trait Exposure/, 'page should render trait exposure section');
assert.match(html, /Holder Leaderboard/, 'page should render holder leaderboard section');
assert.match(html, /Asset Version Ranking/, 'page should render scored asset version ranking section');
assert.doesNotMatch(html, /Asset Rarity Leaderboard/, 'page should not imply an unscored asset rarity leaderboard');
assert.match(html, /asset_final_score/, 'page should explain asset_final_score sorting');
assert.match(html, /Market analytics — display only, not rarity input/, 'page should render display-only market analytics section');

assert.match(html, /<img class="nft-thumb"/, 'NoBallGames page should render NFT thumbnail images');
assert.match(html, /<h2>Template Rarity Ranking<\/h2>[\s\S]*<img class="nft-thumb"/, 'Template Rarity Ranking rows should include image markup');
assert.match(html, /<h2>Utility \/ Open Mint<\/h2>[\s\S]*<img class="nft-thumb"/, 'Utility/Open Mint rows should include image markup when image data exists');
assert.match(html, /<h2>Asset Version Ranking<\/h2>[\s\S]*<img class="nft-thumb"/, 'Asset Version Ranking rows should include image markup');
assert.doesNotMatch(html, /src="[^"]*gkniftyheads/i, 'NoBallGames rendered image src must not point to gkniftyheads assets');
assert.doesNotMatch(html, /src="[^"]*\/img\/noballgames(?:\/|-)/i, 'NoBallGames rendered image src must not use broken noballgames path spelling');
assert.doesNotMatch(html, /src="[^"]*\/img\/noballgame(?:\/|-)/i, 'NoBallGames rendered image src must not use broken noballgame path spelling');
for (const [, src] of html.matchAll(/<img class="nft-thumb"[^>]+src="([^"]+)"/g)) {
  assert.match(
    src,
    /^(\/img\/noballgamess\/thumbs\/[^?#]+\.(webp|jpg|jpeg|png)|https:\/\/(ipfs\.hivebp\.io|atomichub-ipfs\.com|ipfs\.io|gateway\.pinata\.cloud|nftstorage\.link|dweb\.link)\/ipfs\/[A-Za-z0-9]+)/i,
    `NoBallGames NFT image src should be a local noballgamess thumbnail or safe IPFS gateway URL: ${src}`,
  );
}
for (const row of [
  ...templateRarity.ranked_templates,
  ...templateRarity.utility_open_mint_templates,
  ...templateRarity.unissued_templates,
]) {
  assert.ok(row.image_url || row.image_sources?.length, `template ${row.template_id} should carry AtomicAssets image data`);
}
assert.ok(assetLeaderboard.assets.every((row) => row.image_url || row.image_sources?.length), 'asset rarity rows should inherit template image data');

console.log('NoBallGames rarity tracker regression passed.');

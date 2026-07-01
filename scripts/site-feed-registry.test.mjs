#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assertNoMarketScoringSignals(label, payload) {
  const forbiddenKey = /(?:floor|price|sale|listing|market)/i;
  const allowedMarketContractKeys = new Set([
    'price_used',
    'market_data_used',
    'atomichub_usage',
    'disallowed_score_inputs',
  ]);
  const skippedRawMetadataKeys = new Set([
    'description',
    'name',
    'title',
    'immutable_data',
    'mutable_data',
    'raw',
  ]);
  const violations = [];

  function walk(value, pathParts = []) {
    if (value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...pathParts, String(index)]));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...pathParts, key];
      if (skippedRawMetadataKeys.has(key)) continue;
      if (key === 'atomichub_url' || nextPath.includes('source_urls')) continue;
      if (forbiddenKey.test(key) && !allowedMarketContractKeys.has(key)) {
        violations.push(nextPath.join('.'));
      }
      walk(child, nextPath);
    }
  }

  walk(payload);
  assert.deepEqual(violations, [], `${label} must not expose price/floor/sales/listing/market fields as scoring components`);
  if ('price_used' in payload) assert.equal(payload.price_used, false, `${label} must mark price_used false`);
  if ('market_data_used' in payload) assert.equal(payload.market_data_used, false, `${label} must mark market_data_used false`);
  if (payload.ranking_formula) {
    if ('price_used' in payload.ranking_formula) {
      assert.equal(payload.ranking_formula.price_used, false, `${label} ranking formula must mark price_used false`);
    }
    if ('market_data_used' in payload.ranking_formula) {
      assert.equal(payload.ranking_formula.market_data_used, false, `${label} ranking formula must mark market_data_used false`);
    }
    if ('source_of_truth' in payload.ranking_formula) {
      assert.equal(payload.ranking_formula.source_of_truth, 'AtomicAssets', `${label} must use AtomicAssets as source of truth`);
    }
    if ('atomichub_usage' in payload.ranking_formula) {
      assert.equal(payload.ranking_formula.atomichub_usage, 'reference_links_only', `${label} must keep AtomicHub as reference-only`);
    }
  }
}

const registry = readJson('data/feed-registry.json');
const registryText = read('data/feed-registry.json');
assert.ok(Array.isArray(registry.feeds), 'feed registry must contain a feeds array');
assert.ok(registry.feeds.length >= 4, 'registry must include more than only GKniftyHEADS');

const requiredFeeds = new Map([
  ['gkniftyheads_rarity', { page: '/wiki/gkniftyheads-nft-collection.html', mode: 'scheduled_snapshot_primary' }],
  ['noballgamess_rarity', { page: '/wiki/noballgamess-nft-collection.html', mode: 'scheduled_snapshot_primary' }],
  ['waxonedge_bubbles', { page: '/waxonedge.html', mode: 'live_primary_static_fallback' }],
  ['waxcash_analytics', { page: '/waxcash.html', mode: 'live_primary_static_fallback' }],
  ['wuffi_token_analytics', { page: '/wiki/wuffi.html', mode: 'live_primary_static_fallback' }],
]);

for (const [feedId, expected] of requiredFeeds) {
  const feed = registry.feeds.find((entry) => entry.feed_id === feedId);
  assert.ok(feed, `${feedId} must exist in feed registry`);
  assert.equal(feed.enabled, true, `${feedId} should be enabled`);
  assert.equal(feed.feed_mode, expected.mode, `${feedId} must declare the expected feed mode`);
  assert.ok(feed.page_paths.includes(expected.page), `${feedId} should affect ${expected.page}`);
  assert.ok(feed.updater && exists(feed.updater), `${feedId} updater must exist`);
  assert.ok(Array.isArray(feed.output_files) && feed.output_files.length > 0, `${feedId} must declare output files`);
  assert.ok(feed.stale_after_hours > 0, `${feedId} must declare stale_after_hours`);
  assert.ok(feed.fallback_behavior, `${feedId} must declare fallback behavior`);
}

const waxonedgeFeed = registry.feeds.find((entry) => entry.feed_id === 'waxonedge_bubbles');
assert.ok(!waxonedgeFeed.output_files.includes('data/waxonedge/waxcash-bubbles-bootstrap.json'), 'WaxOnEdge registry must not claim static bootstrap output unless updater writes it');

function assertFeedSafetyMetadata(feedId, expectedMode) {
  const feed = registry.feeds.find((entry) => entry.feed_id === feedId);
  assert.equal(feed.endpoint_refresh_mode, expectedMode, `${feedId} must declare endpoint_refresh_mode`);
  assert.equal(feed.max_concurrency, 1, `${feedId} must cap scheduled endpoint concurrency at 1`);
  assert.ok(feed.timeout_ms >= 10000, `${feedId} must declare a sane timeout_ms`);
  assert.ok(feed.retries >= 1, `${feedId} must retry transient endpoint failures`);
  assert.ok(feed.retry_backoff_ms > 0, `${feedId} must declare retry_backoff_ms`);
  assert.ok(feed.fallback_age_hours >= 24, `${feedId} must declare fallback_age_hours`);
}

assertFeedSafetyMetadata('waxonedge_bubbles', 'health_plus_bubbles_with_static_fallback');
assertFeedSafetyMetadata('waxcash_analytics', 'single_safe_fetch');
assertFeedSafetyMetadata('wuffi_token_analytics', 'sequential');

const gkniftyheadsFeed = registry.feeds.find((entry) => entry.feed_id === 'gkniftyheads_rarity');
assert.match(
  gkniftyheadsFeed.source_urls.live_count,
  /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\/_count\?collection_name=gkniftyheads&template_id=\{template_id\}$/,
  'GKniftyHEADS registry must keep the per-template AtomicAssets _count endpoint'
);
assert.match(
  gkniftyheadsFeed.source_urls.latest_created_assets,
  /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\?collection_name=gkniftyheads&sort=created&order=desc&limit=1000$/,
  'GKniftyHEADS registry must declare latest-created asset delta scan endpoint'
);
assert.match(
  gkniftyheadsFeed.source_urls.recently_updated_live_assets,
  /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\?collection_name=gkniftyheads&burned=false&sort=updated&order=desc&limit=1000$/,
  'GKniftyHEADS registry must declare recently updated live asset scan endpoint'
);
assert.match(
  gkniftyheadsFeed.source_urls.recently_updated_burned_assets,
  /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\?collection_name=gkniftyheads&burned=true&sort=updated&order=desc&limit=1000$/,
  'GKniftyHEADS registry must declare recently updated burned asset scan endpoint'
);
assert.match(
  gkniftyheadsFeed.source_urls.atomicassets_collection_stats,
  /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/collections\/gkniftyheads\/stats$/,
  'GKniftyHEADS registry must declare AtomicAssets collection stats sanity endpoint'
);
for (const [key, pattern] of Object.entries({
  hivebp_collection_stats: /^https:\/\/wax-api\.hivebp\.io\/v3\/collection-stats\/gkniftyheads$/,
  hivebp_num_assets: /^https:\/\/wax-api\.hivebp\.io\/v3\/num-assets\/gkniftyheads$/,
  hivebp_marketcap: /^https:\/\/wax-api\.hivebp\.io\/v3\/marketcap\/gkniftyheads$/,
  hivebp_top_users: /^https:\/\/wax-api\.hivebp\.io\/v3\/top-users\/30\/gkniftyheads$/,
  hivebp_top_templates: /^https:\/\/wax-api\.hivebp\.io\/v3\/top-templates\/30\/gkniftyheads$/,
  hivebp_volume: /^https:\/\/wax-api\.hivebp\.io\/v3\/volume\/30\/gkniftyheads$/,
  hivebp_sales_volume_graph: /^https:\/\/wax-api\.hivebp\.io\/v3\/sales-volume-graph\/30\/gkniftyheads$/,
})) {
  assert.match(gkniftyheadsFeed.source_urls[key], pattern, `GKniftyHEADS registry must declare ${key}`);
}
assert.ok(gkniftyheadsFeed.output_files.includes('data/gkniftyheads/market-analytics.json'), 'GKniftyHEADS registry must include market analytics output');
assert.ok(exists('data/gkniftyheads/market-analytics.json'), 'GKniftyHEADS market analytics JSON must exist');
assert.equal(Object.keys(gkniftyheadsFeed.source_urls).some((key) => /floor/i.test(key)), false, 'GKniftyHEADS must not register per-template floor endpoint spam');

const noballgamessFeed = registry.feeds.find((entry) => entry.feed_id === 'noballgamess_rarity');
assert.equal(noballgamessFeed.feed_mode, 'scheduled_snapshot_primary', 'NoBallGames must be a scheduled snapshot feed');
for (const [key, pattern] of Object.entries({
  templates: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/templates\?collection_name=noballgamess$/,
  template: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/templates\/noballgamess\/\{template_id\}$/,
  templates_batch: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/templates\?collection_name=noballgamess&ids=\{template_ids\}&limit=1000$/,
  assets: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\?collection_name=noballgamess&template_id=\{template_id\}&limit=1000$/,
  template_assets_backfill: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\?collection_name=noballgamess&template_id=\{template_id\}&limit=1000&order=asc&sort=template_mint$/,
  live_count: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\/_count\?collection_name=noballgamess&template_id=\{template_id\}$/,
  latest_created_assets: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\?collection_name=noballgamess&sort=created&order=desc&limit=1000$/,
  recently_updated_live_assets: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\?collection_name=noballgamess&burned=false&sort=updated&order=desc&limit=1000$/,
  recently_updated_burned_assets: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/assets\?collection_name=noballgamess&burned=true&sort=updated&order=desc&limit=1000$/,
  atomicassets_collection_stats: /^https:\/\/wax\.api\.atomicassets\.io\/atomicassets\/v1\/collections\/noballgamess\/stats$/,
  hivebp_collection_stats: /^https:\/\/wax-api\.hivebp\.io\/v3\/collection-stats\/noballgamess$/,
  hivebp_num_assets: /^https:\/\/wax-api\.hivebp\.io\/v3\/num-assets\/noballgamess$/,
  hivebp_marketcap: /^https:\/\/wax-api\.hivebp\.io\/v3\/marketcap\/noballgamess$/,
  hivebp_top_users: /^https:\/\/wax-api\.hivebp\.io\/v3\/top-users\/30\/noballgamess$/,
  hivebp_top_templates: /^https:\/\/wax-api\.hivebp\.io\/v3\/top-templates\/30\/noballgamess$/,
  hivebp_volume: /^https:\/\/wax-api\.hivebp\.io\/v3\/volume\/30\/noballgamess$/,
  hivebp_sales_volume_graph: /^https:\/\/wax-api\.hivebp\.io\/v3\/sales-volume-graph\/30\/noballgamess$/,
})) {
  assert.match(noballgamessFeed.source_urls[key], pattern, `NoBallGames registry must declare ${key} with collection_name=noballgamess`);
}
assert.equal(Object.keys(noballgamessFeed.source_urls).some((key) => /floor/i.test(key)), false, 'NoBallGames must not register per-template floor endpoint spam');
for (const generatedPath of [
  'data/noballgamess/template-metadata-cache.json',
  'data/noballgamess/live-template-supply.json',
  'data/noballgamess/template-integrity-audit.json',
  'data/noballgamess/asset-state-cache.json',
  'data/noballgamess/asset-refresh-cursor.json',
  'data/noballgamess/surviving-mint-ranks.json',
  'data/noballgamess/template-rarity.json',
  'data/noballgamess/live-asset-rarity.json',
  'data/noballgamess/market-analytics.json',
  'data/noballgamess/template-stats.json',
  'data/noballgamess/trait-exposure.json',
  'data/noballgamess/holder-leaderboard.json',
  'data/noballgamess/asset-rarity-leaderboard.json',
  'data/noballgamess/sync-status.json',
  'wiki/noballgamess-nft-collection.html',
]) {
  assert.ok(noballgamessFeed.output_files.includes(generatedPath), `NoBallGames registry must include generated output ${generatedPath}`);
  assert.ok(exists(generatedPath), `NoBallGames generated output must exist: ${generatedPath}`);
}

const feedIds = registry.feeds.map((entry) => entry.feed_id);
assert.equal(new Set(feedIds).size, feedIds.length, 'feed IDs must be unique');
assert.notEqual(feedIds.filter((id) => id === 'gkniftyheads_rarity').length, feedIds.length, 'GKniftyHEADS must not be the only feed');

const mainScript = read('scripts/update-site-feeds.mjs');
assert.match(mainScript, /data\/feed-registry\.json|loadRegistry/, 'main updater must read the central registry');
assert.match(mainScript, /writeAllFeedStatus/, 'main updater must write aggregate feed status');

const utils = read('scripts/site-feed-utils.mjs');
assert.match(utils, /AbortController/, 'feed fetches must use AbortController timeouts');
assert.match(utils, /DEFAULT_FEED_FETCH_TIMEOUT_MS/, 'feed fetch timeout must be centrally configurable');
assert.match(utils, /safeFetchJson/, 'feed utilities must expose safeFetchJson fallback/retry wrapper');
assert.match(utils, /isTransientFeedError/, 'feed utilities must distinguish transient endpoint errors for retry');
assert.match(utils, /used_previous/, 'safe feed fetches must report whether previous JSON was used');
assert.match(utils, /source_updated_at/, 'feed status must separate source_updated_at from checked_at');
assert.match(utils, /source_age_minutes/, 'feed status must expose source_age_minutes');
assert.match(utils, /last_successful_check/, 'feed status must expose last_successful_check');
assert.match(utils, /endpoint_status/, 'feed status must expose per-endpoint status');

for (const script of [
  'scripts/update-gkniftyheads-rarity-feed.mjs',
  'scripts/update-waxonedge-feed.mjs',
  'scripts/update-waxcash-feed.mjs',
  'scripts/update-wuffi-feed.mjs',
]) {
  const source = read(script);
  assert.match(source, /preserveOrWrite|safeFetchJson|runGenerateGkniftyheadsRarity/, `${script} must preserve previous feed data or regenerate fallback`);
  assert.match(source, /writeFeedStatus/, `${script} must write per-feed sync status`);
}

assert.doesNotMatch(read('scripts/update-wuffi-feed.mjs'), /Promise\.all/, 'WUFFI scheduled updater must not fetch heavy Worker endpoints concurrently');

const pages = [
  ['wiki/gkniftyheads-nft-collection.html', 'gkniftyheads_rarity'],
  ['wiki/noballgamess-nft-collection.html', 'noballgamess_rarity'],
  ['waxonedge.html', 'waxonedge_bubbles'],
  ['waxcash.html', 'waxcash_analytics'],
  ['wiki/wuffi.html', 'wuffi_token_analytics'],
];

for (const [page, feedId] of pages) {
  const html = read(page);
  assert.match(html, new RegExp(`data-feed-status-id="${feedId}"`), `${page} must show ${feedId} status`);
  assert.match(html, /\/js\/site-feed-status\.js/, `${page} must load site-feed-status.js`);
}

const statusClient = read('js/site-feed-status.js');
assert.match(statusClient, /\/data\/feed-status\.json/, 'status client must read aggregate feed status');
assert.match(statusClient, /is-stale/, 'status client must expose stale state');
assert.match(statusClient, /is-error/, 'status client must expose error state');
assert.doesNotMatch(statusClient, /document\.write|location\.href|location\.replace|preventDefault/, 'status client must only update badge text/classes and never block rendering');

const waxonedgeHtml = read('waxonedge.html');
const waxonedgeJs = read('js/waxonedge-bubbles-v2.js');
assert.match(waxonedgeHtml, /\/js\/waxonedge-bubbles-v2\.js/, 'waxonedge.html must still load live bubble runtime');
assert.match(waxonedgeJs, /\/api\/waxonedge\/waxcash-bubbles-lite/, 'WaxOnEdge runtime must still use live bubbles API');
assert.match(waxonedgeJs, /\/api\/waxonedge\/live\/stream|LIVE_POLL_MS|startLiveUpdates/, 'WaxOnEdge runtime must keep SSE or polling live updates');
assert.match(waxonedgeJs, /\/api\/waxonedge\/indexer-health/, 'WaxOnEdge runtime must keep authoritative indexer health route');
assert.doesNotMatch(waxonedgeJs, /BOOTSTRAP_API\s*=\s*['"]\/data\/waxonedge_bubbles/, 'WaxOnEdge runtime must not prefer daily snapshot data over live API paths');

const waxcashHtml = read('waxcash.html');
const waxcashJs = read('js/waxcash-analytics.js');
assert.match(waxcashHtml, /\/js\/waxcash-analytics\.js/, 'waxcash.html must still load runtime analytics client');
assert.match(waxcashJs, /\/api\/waxonedge\/waxcash-analytics/, 'WAXCASH runtime must still fetch live analytics API');
assert.match(waxcashHtml, /alcor\.exchange\/charting_library/, 'WAXCASH must keep direct Alcor TradingView chart loading');
assert.doesNotMatch(waxcashJs, /\/data\/waxcash_analytics/, 'WAXCASH runtime must not use daily snapshot JSON as live truth');

const wuffiHtml = read('wiki/wuffi.html');
const wuffiJs = read('js/token-analytics-page.js');
assert.match(wuffiHtml, /\/js\/token-analytics-page\.js/, 'WUFFI page must still load runtime token analytics client');
assert.match(wuffiJs, /\/api\/waxonedge\/token-page\/wuffi\/WUF/, 'WUFFI runtime must still fetch live token-page API');
assert.match(wuffiJs, /wax\.alcor\.exchange\/api\/v2\/swap\/candles/, 'WUFFI must keep direct Alcor WUF/WAX candle feed');
assert.doesNotMatch(wuffiJs, /\/data\/wuffi_token_analytics/, 'WUFFI runtime must not use daily snapshot JSON as live truth');

const workflow = read('.github/workflows/update-site-feeds.yml');
assert.match(workflow, /schedule:/, 'feed workflow must run on schedule');
assert.match(workflow, /workflow_dispatch:/, 'feed workflow must support manual dispatch');
assert.match(workflow, /node scripts\/update-site-feeds\.mjs/, 'workflow must run central updater');
assert.ok(
  workflow.indexOf('node scripts/update-gkniftyheads-template-metadata-cache.mjs') < workflow.indexOf('node scripts/update-gkniftyheads-live-supply-cache.mjs')
  && workflow.indexOf('node scripts/update-gkniftyheads-live-supply-cache.mjs') < workflow.indexOf('node scripts/update-gkniftyheads-asset-state-cache.mjs')
  && workflow.indexOf('node scripts/update-gkniftyheads-asset-state-cache.mjs') < workflow.indexOf('node scripts/generate-gkniftyheads-rarity.mjs')
  && workflow.indexOf('node scripts/generate-gkniftyheads-rarity.mjs') < workflow.indexOf('node scripts/retry-gkniftyheads-thumbnails.mjs --cached-only'),
  'GKniftyHEADS workflow must refresh metadata, live supply, asset state, local rarity render, then cached-only thumbnails in order'
);
assert.ok(
  workflow.indexOf('node scripts/update-gkniftyheads-template-metadata-cache.mjs') < workflow.indexOf('node scripts/update-noballgamess-template-metadata-cache.mjs')
  && workflow.indexOf('node scripts/update-noballgamess-template-metadata-cache.mjs') < workflow.indexOf('node scripts/update-noballgamess-live-supply-cache.mjs')
  && workflow.indexOf('node scripts/update-noballgamess-live-supply-cache.mjs') < workflow.indexOf('node scripts/update-noballgamess-asset-state-cache.mjs')
  && workflow.indexOf('node scripts/update-noballgamess-asset-state-cache.mjs') < workflow.indexOf('node scripts/generate-noballgamess-rarity.mjs'),
  'workflow must keep GKniftyHEADS first, then refresh NoBallGames metadata, live supply, asset state, and render in order'
);
assert.match(workflow, /GK_USE_EXISTING_STAGED_CACHES/, 'central feed update should reuse staged GKniftyHEADS caches in the workflow');
assert.match(workflow, /NBG_USE_EXISTING_STAGED_CACHES/, 'central feed update should reuse staged NoBallGames caches in the workflow');
assert.match(workflow, /node scripts\/site-feed-registry\.test\.mjs/, 'workflow must audit feed registry rules');
assert.match(workflow, /chore: update site data feeds/, 'workflow must use the required commit message');
for (const generatedPath of [
  'data/gkniftyheads/',
  'data/gkniftyheads_rarity/',
  'data/noballgamess/',
  'data/feed-status.json',
  'wiki/gkniftyheads-nft-collection.html',
  'wiki/noballgamess-nft-collection.html',
  'img/gkniftyheads/thumbs/',
  'img/gkniftyheads/thumbs/manifest.json',
]) {
  assert.match(workflow, new RegExp(generatedPath.replace(/[/.]/g, '\\$&')), `workflow must stage generated output ${generatedPath}`);
}
assert.match(workflow, /git add "\$\{GENERATED_PATHS\[@\]\}"/, 'workflow must use targeted generated output staging');
assert.doesNotMatch(workflow, /git add data\s*(?:\n|$)/, 'workflow must not only stage data and miss generated pages/thumbs');

const gk = readJson('data/gkniftyheads/template-rarity.json');
const gkMarketAnalytics = readJson('data/gkniftyheads/market-analytics.json');
assertNoMarketScoringSignals('GKniftyHEADS rarity feed', gk);
assert.equal(gkMarketAnalytics.display_only, true, 'GKniftyHEADS market analytics must be display-only');
assert.equal(gkMarketAnalytics.rarity_input, false, 'GKniftyHEADS market analytics must not be a rarity input');
assert.notEqual(gkMarketAnalytics.analytics_status, undefined, 'GKniftyHEADS market analytics status must be separate from rarity status');
assert.match(read('wiki/gkniftyheads-nft-collection.html'), /Market analytics — display only, not rarity input/, 'GKniftyHEADS page must label HiveBP analytics as display-only');
assert.doesNotMatch(read('scripts/generate-gkniftyheads-rarity.mjs'), /market-analytics\.json[\s\S]{0,400}final_score|final_score[\s\S]{0,400}market-analytics\.json/i, 'GKniftyHEADS rarity scoring must not read market analytics');

const assetStateCache = read('data/gkniftyheads/asset-state-cache.json');
const assetRefreshCursor = read('data/gkniftyheads/asset-refresh-cursor.json');
const survivingRanks = read('data/gkniftyheads/surviving-mint-ranks.json');
assert.match(registryText, /data\/gkniftyheads\/asset-state-cache\.json/, 'registry must include asset-state cache output');
assert.match(registryText, /data\/gkniftyheads\/asset-refresh-cursor\.json/, 'registry must include asset refresh cursor output');
assert.match(registryText, /data\/gkniftyheads\/surviving-mint-ranks\.json/, 'registry must include surviving mint ranks output');
assert.match(assetStateCache, /"latest_created_assets"/, 'asset-state cache must document latest-created source URL');
assert.match(assetStateCache, /"recently_updated_live_assets"/, 'asset-state cache must document updated-live source URL');
assert.match(assetStateCache, /"recently_updated_burned_assets"/, 'asset-state cache must document updated-burned source URL');
assert.match(assetRefreshCursor, /"mode": "daily_rotating_backfill"/, 'asset refresh cursor must use daily rotating backfill mode');
assert.match(survivingRanks, /"templates"/, 'surviving mint ranks data surface must exist');

const noballgamessPage = read('wiki/noballgamess-nft-collection.html');
const noballgamessRarity = readJson('data/noballgamess/template-rarity.json');
const noballgamessMarketAnalytics = readJson('data/noballgamess/market-analytics.json');
const noballgamessAssetLeaderboard = readJson('data/noballgamess/asset-rarity-leaderboard.json');
const noballgamessHolderLeaderboard = readJson('data/noballgamess/holder-leaderboard.json');
const noballgamessAssetState = read('data/noballgamess/asset-state-cache.json');
assert.match(noballgamessPage, /Original mint numbers never change/, 'NoBallGames page must explain permanent original mint numbers');
assert.match(noballgamessPage, /surviving mint rank/, 'NoBallGames page must explain surviving mint rank');
assert.match(noballgamessPage, /Template Stats/, 'NoBallGames page must render template stats');
assert.match(noballgamessPage, /Trait Exposure/, 'NoBallGames page must render trait exposure');
assert.match(noballgamessPage, /Holder Leaderboard/, 'NoBallGames page must render holder leaderboard');
assert.match(noballgamessPage, /Asset Rarity Leaderboard/, 'NoBallGames page must render asset rarity leaderboard');
assert.match(noballgamessPage, /Market analytics — display only, not rarity input/, 'NoBallGames page must label HiveBP analytics as display-only');
assert.equal(noballgamessMarketAnalytics.display_only, true, 'NoBallGames market analytics must be display-only');
assert.equal(noballgamessMarketAnalytics.rarity_input, false, 'NoBallGames market analytics must not be a rarity input');
assert.notEqual(noballgamessMarketAnalytics.analytics_status, undefined, 'NoBallGames market analytics status must be separate from rarity status');
assert.match(noballgamessAssetState, /"latest_created_assets"/, 'NoBallGames asset-state cache must document latest-created source URL');
assert.match(noballgamessAssetState, /"recently_updated_live_assets"/, 'NoBallGames asset-state cache must document updated-live source URL');
assert.match(noballgamessAssetState, /"recently_updated_burned_assets"/, 'NoBallGames asset-state cache must document updated-burned source URL');
assert.match(noballgamessAssetState, /"template_assets_backfill"/, 'NoBallGames asset-state cache must document template backfill source URL');
assertNoMarketScoringSignals('NoBallGames rarity feed', noballgamessRarity);
assertNoMarketScoringSignals('NoBallGames asset rarity leaderboard', noballgamessAssetLeaderboard);
assertNoMarketScoringSignals('NoBallGames holder leaderboard', noballgamessHolderLeaderboard);
assert.doesNotMatch(read('scripts/noballgamess-tracker-lib.mjs'), /market-analytics\.json[\s\S]{0,400}(final_score|weighted_rarity_score)|(final_score|weighted_rarity_score)[\s\S]{0,400}market-analytics\.json/i, 'NoBallGames rarity scoring must not read market analytics');
for (const row of noballgamessRarity.ranked_templates || []) {
  assert.equal(row.supply_used_for_scoring, row.live_supply, 'NoBallGames rarity scoring must use live_supply when counted');
  assert.equal(row.price_used, false, 'NoBallGames ranked rows must mark price_used false');
  assert.equal(row.market_data_used, false, 'NoBallGames ranked rows must mark market_data_used false');
}

const gkUpdater = read('scripts/update-gkniftyheads-rarity-feed.mjs');
assert.match(gkUpdater, /const result = await runGenerateGkniftyheadsRarity\(\)/, 'GKniftyHEADS feed updater must await the async rarity generator');
assert.match(gkUpdater, /updateGkniftyheadsAssetStateCache/, 'GKniftyHEADS feed updater must refresh or reuse asset-state cache data');
assert.match(gkUpdater, /fetchAtomicCollectionStatsSanity/, 'GKniftyHEADS feed updater should run AtomicAssets collection stats as a sanity check only');
assert.match(read('scripts/nft-market-analytics.mjs'), /collection-level sanity check only; not a replacement for asset-state cache/, 'AtomicAssets collection stats must not replace the asset-state cache');
assert.match(read('scripts/update-gkniftyheads-template-metadata-cache.mjs'), /metadata_fetch_mode: metadataFetchMode/, 'GKniftyHEADS metadata cache must record fetch mode');
assert.match(read('scripts/update-gkniftyheads-template-metadata-cache.mjs'), /metadataEntry\(row, \{ data: template \}, checkedAt, 'batch_ids'\)/, 'GKniftyHEADS metadata cache must use ids= batch rows before single fallback');
assert.match(read('scripts/noballgamess-tracker-lib.mjs'), /metadata_fetch_mode: metadataFetchMode/, 'NoBallGames metadata cache must record fetch mode');
assert.match(read('scripts/noballgamess-tracker-lib.mjs'), /templateBatchUrl/, 'NoBallGames metadata cache must attempt ids= batch fetches');
assert.match(gkUpdater, /latest-created, updated-live, and updated-burned asset endpoints update asset-state cache sidecar data/, 'GKniftyHEADS feed status should mention asset-state endpoint coverage without changing current count maths');
assert.ok(
  gkUpdater.indexOf('await runGenerateGkniftyheadsRarity()') < gkUpdater.indexOf('const status = createFeedStatus'),
  'GKniftyHEADS feed status must be created only after generated data writes complete'
);
assert.doesNotMatch(gkUpdater, /const result = runGenerateGkniftyheadsRarity\(\)/, 'GKniftyHEADS feed updater must not read a Promise as the generator result');
assert.doesNotMatch(read('data/gkniftyheads_rarity/sync-status.json'), /undefined ranked/, 'GKniftyHEADS feed status notes must never contain undefined ranked counts');

console.log('Site feed registry audit passed.');

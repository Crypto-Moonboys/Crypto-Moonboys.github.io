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

const registry = readJson('data/feed-registry.json');
assert.ok(Array.isArray(registry.feeds), 'feed registry must contain a feeds array');
assert.ok(registry.feeds.length >= 4, 'registry must include more than only GKniftyHEADS');

const requiredFeeds = new Map([
  ['gkniftyheads_rarity', { page: '/wiki/gkniftyheads-nft-collection.html', mode: 'scheduled_snapshot_primary' }],
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

const feedIds = registry.feeds.map((entry) => entry.feed_id);
assert.equal(new Set(feedIds).size, feedIds.length, 'feed IDs must be unique');
assert.notEqual(feedIds.filter((id) => id === 'gkniftyheads_rarity').length, feedIds.length, 'GKniftyHEADS must not be the only feed');

const mainScript = read('scripts/update-site-feeds.mjs');
assert.match(mainScript, /data\/feed-registry\.json|loadRegistry/, 'main updater must read the central registry');
assert.match(mainScript, /writeAllFeedStatus/, 'main updater must write aggregate feed status');

const utils = read('scripts/site-feed-utils.mjs');
assert.match(utils, /AbortController/, 'feed fetches must use AbortController timeouts');
assert.match(utils, /DEFAULT_FEED_FETCH_TIMEOUT_MS/, 'feed fetch timeout must be centrally configurable');
assert.match(utils, /source_updated_at/, 'feed status must separate source_updated_at from checked_at');
assert.match(utils, /source_age_minutes/, 'feed status must expose source_age_minutes');
assert.match(utils, /last_successful_check/, 'feed status must expose last_successful_check');

for (const script of [
  'scripts/update-gkniftyheads-rarity-feed.mjs',
  'scripts/update-waxonedge-feed.mjs',
  'scripts/update-waxcash-feed.mjs',
  'scripts/update-wuffi-feed.mjs',
]) {
  const source = read(script);
  assert.match(source, /preserveOrWrite|runGenerateGkniftyheadsRarity/, `${script} must preserve previous feed data or regenerate fallback`);
  assert.match(source, /writeFeedStatus/, `${script} must write per-feed sync status`);
}

const pages = [
  ['wiki/gkniftyheads-nft-collection.html', 'gkniftyheads_rarity'],
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
  && workflow.indexOf('node scripts/update-gkniftyheads-live-supply-cache.mjs') < workflow.indexOf('node scripts/generate-gkniftyheads-rarity.mjs')
  && workflow.indexOf('node scripts/generate-gkniftyheads-rarity.mjs') < workflow.indexOf('node scripts/retry-gkniftyheads-thumbnails.mjs --cached-only'),
  'GKniftyHEADS workflow must refresh metadata, live supply, local rarity render, then cached-only thumbnails in order'
);
assert.match(workflow, /GK_USE_EXISTING_STAGED_CACHES/, 'central feed update should reuse staged GKniftyHEADS caches in the workflow');
assert.match(workflow, /node scripts\/site-feed-registry\.test\.mjs/, 'workflow must audit feed registry rules');
assert.match(workflow, /chore: update site data feeds/, 'workflow must use the required commit message');
for (const generatedPath of [
  'data/gkniftyheads/',
  'data/gkniftyheads_rarity/',
  'data/feed-status.json',
  'wiki/gkniftyheads-nft-collection.html',
  'img/gkniftyheads/thumbs/',
  'img/gkniftyheads/thumbs/manifest.json',
]) {
  assert.match(workflow, new RegExp(generatedPath.replace(/[/.]/g, '\\$&')), `workflow must stage generated output ${generatedPath}`);
}
assert.match(workflow, /git add "\$\{GENERATED_PATHS\[@\]\}"/, 'workflow must use targeted generated output staging');
assert.doesNotMatch(workflow, /git add data\s*(?:\n|$)/, 'workflow must not only stage data and miss generated pages/thumbs');

const gk = read('data/gkniftyheads/template-rarity.json');
assert.match(gk, /"price_used": false/, 'NFT rarity feed must not use price');
assert.doesNotMatch(gk, /floor price|market price|last sale/i, 'NFT rarity feed must not include price ranking signals');

const gkUpdater = read('scripts/update-gkniftyheads-rarity-feed.mjs');
assert.match(gkUpdater, /const result = await runGenerateGkniftyheadsRarity\(\)/, 'GKniftyHEADS feed updater must await the async rarity generator');
assert.match(gkUpdater, /latest-created, updated-live, and updated-burned asset endpoints are registered/, 'GKniftyHEADS feed status should mention registered asset-delta endpoints without changing current count maths');
assert.ok(
  gkUpdater.indexOf('await runGenerateGkniftyheadsRarity()') < gkUpdater.indexOf('const status = createFeedStatus'),
  'GKniftyHEADS feed status must be created only after generated data writes complete'
);
assert.doesNotMatch(gkUpdater, /const result = runGenerateGkniftyheadsRarity\(\)/, 'GKniftyHEADS feed updater must not read a Promise as the generator result');
assert.doesNotMatch(read('data/gkniftyheads_rarity/sync-status.json'), /undefined ranked/, 'GKniftyHEADS feed status notes must never contain undefined ranked counts');

console.log('Site feed registry audit passed.');

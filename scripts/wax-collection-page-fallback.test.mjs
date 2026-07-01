import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const apiConfig = read('js/api-config.js');
const apiClient = read('js/wax-api-client.js');
const renderer = read('js/wax-collection-renderer.js');
const imageNormalizer = read('js/wax-image-normalizer.js');
const gkniftyHtml = read('wiki/gkniftyheads-nft-collection.html');
const noballHtml = read('wiki/noballgamess-nft-collection.html');
const feedRegistry = read('data/feed-registry.json');
const worker = read('workers/moonboys-api/worker.js');

assert.match(apiConfig, /api\.getApiBase = function/, 'api-config production fallback policy should remain present');
assert.match(apiClient, /api\.getApiBase\(\{ allowProductionFallback: true \}\)/, 'WAX API client must use MOONBOYS_API.getApiBase');
assert.doesNotMatch(apiClient + renderer + imageNormalizer, /require\(|from ['"](@?anchor|wax|eosjs|atomicassets)/i, 'frontend must not add Node/blockchain SDK dependencies');
assert.doesNotMatch(apiClient + renderer, /signTransaction|transact\(|claim|staking|stake/i, 'frontend WAX bridge must not add transaction, claim, or staking flows');

assert.match(renderer, /client\.getCollectionPageData\(collection\)/, 'renderer should try /api/wax collection page-data first');
assert.match(renderer, /client\.loadStaticCollectionFallback\(collection\)/, 'renderer should fallback to existing static JSON');
assert.match(renderer, /Static fallback active/, 'renderer should show a degraded static fallback card');

assert.match(apiClient, /\/data\/'\s*\+\s*collection\s*\+\s*'\/'/, 'static fallback should read existing collection data folders');
assert.match(apiClient, /template-rarity\.json/, 'static fallback should include template-rarity.json');
assert.match(apiClient, /template-stats\.json/, 'static fallback should include template-stats.json');
assert.match(apiClient, /holder-leaderboard\.json/, 'NoBallGames fallback should include holder leaderboard');
assert.match(apiClient, /asset-rarity-leaderboard\.json/, 'NoBallGames fallback should include asset rarity leaderboard');

for (const html of [gkniftyHtml, noballHtml]) {
  const apiConfigIndex = html.indexOf('src="/js/api-config.js"');
  const waxClientIndex = html.indexOf('src="/js/wax-api-client.js"');
  const waxRendererIndex = html.indexOf('src="/js/wax-collection-renderer.js"');
  assert.ok(apiConfigIndex !== -1, 'collection page should load api-config.js');
  assert.ok(waxClientIndex !== -1, 'collection page should load WAX API client');
  assert.ok(waxRendererIndex !== -1, 'collection page should load WAX collection renderer');
  assert.ok(apiConfigIndex < waxClientIndex && waxClientIndex < waxRendererIndex, 'collection page should load WAX scripts after api-config in dependency order');
}

const registry = JSON.parse(feedRegistry);
for (const feedId of ['gkniftyheads_rarity', 'noballgamess_rarity']) {
  const feed = registry.feeds.find((entry) => entry.feed_id === feedId);
  assert.ok(feed, `${feedId} should remain in feed registry`);
  assert.ok(feed.output_files.some((file) => /template-rarity\.json$/.test(file)), `${feedId} should keep static template rarity output`);
}

assert.match(worker, /handleWaxOnEdgeRoute\(request, env, CORS_HEADERS\)/, 'WaxOnEdge route dispatch should remain wired');
assert.match(worker, /handleWaxBridgeRoute\(request, env, CORS_HEADERS\)/, 'WAX bridge route dispatch should be wired');
assert.ok(
  worker.indexOf('handleWaxOnEdgeRoute(request, env, CORS_HEADERS)') < worker.indexOf('handleWaxBridgeRoute(request, env, CORS_HEADERS)'),
  'WAX bridge should not replace WaxOnEdge dispatch',
);

console.log('WAX collection page fallback regression passed.');

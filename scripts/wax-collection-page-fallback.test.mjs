import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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
const hodlHtml = read('wiki/hodlmoonboys-nft-collection.html');
const noballHtml = read('wiki/noballgamess-nft-collection.html');
const feedRegistry = read('data/feed-registry.json');
const worker = read('workers/moonboys-api/worker.js');

assert.match(apiConfig, /api\.getApiBase = function/, 'api-config production fallback policy should remain present');
assert.match(apiClient, /api\.getApiBase\(\)/, 'WAX API client must use canonical MOONBOYS_API.getApiBase()');
assert.doesNotMatch(apiClient, /allowProductionFallback:\s*true/, 'WAX API client must not force production fallback');
assert.doesNotMatch(apiClient + renderer + imageNormalizer, /require\(|from ['"](@?anchor|wax|eosjs|atomicassets)/i, 'frontend must not add Node/blockchain SDK dependencies');
assert.doesNotMatch(apiClient + renderer, /signTransaction|transact\(|claim|staking|stake/i, 'frontend WAX bridge must not add transaction, claim, or staking flows');

assert.match(renderer, /client\.getCollectionPageData\(collection\)/, 'renderer should try /api/wax collection page-data first');
assert.match(renderer, /client\.loadStaticCollectionFallback\(collection\)/, 'renderer should fallback to existing static JSON');
assert.match(renderer, /Static\/degraded fallback active/, 'renderer should show a degraded static fallback card');
assert.match(renderer, /function renderCollectionData/, 'renderer should hydrate visible collection sections');
assert.match(renderer, /Collection Summary/, 'renderer should render collection summary');
assert.match(renderer, /Template Preview/, 'renderer should render template cards');
assert.match(renderer, /Live Template Supply/, 'renderer should render GKnifty live template supply when available');
assert.match(renderer, /Trait Exposure/, 'renderer should render trait exposure');
assert.match(renderer, /Holder Leaderboard/, 'renderer should render holder leaderboard where available');
assert.match(renderer, /Asset Rarity Leaderboard/, 'renderer should render asset rarity leaderboard where available');
assert.match(renderer, /<img class="nft-thumb"/, 'renderer should render normalized NFT image markup');

assert.match(apiClient, /\/data\/'\s*\+\s*collection\s*\+\s*'\/'/, 'static fallback should read existing collection data folders');
assert.match(apiClient, /template-rarity\.json/, 'static fallback should include template-rarity.json');
assert.match(apiClient, /live-template-supply\.json/, 'GKniftyHEADS static fallback should include live-template-supply.json');
assert.match(apiClient, /collection === 'noballgamess'[\s\S]*template-stats\.json/, 'NoBallGames static fallback should keep template-stats.json');
assert.match(apiClient, /holder-leaderboard\.json/, 'NoBallGames fallback should include holder leaderboard');
assert.match(apiClient, /asset-rarity-leaderboard\.json/, 'NoBallGames fallback should include asset rarity leaderboard');

for (const html of [gkniftyHtml, hodlHtml, noballHtml]) {
  const apiConfigIndex = html.indexOf('src="/js/api-config.js"');
  const waxClientIndex = html.indexOf('src="/js/wax-api-client.js"');
  const waxRendererIndex = html.indexOf('src="/js/wax-collection-renderer.js"');
  assert.ok(apiConfigIndex !== -1, 'collection page should load api-config.js');
  assert.ok(waxClientIndex !== -1, 'collection page should load WAX API client');
  assert.ok(waxRendererIndex !== -1, 'collection page should load WAX collection renderer');
  assert.ok(apiConfigIndex < waxClientIndex && waxClientIndex < waxRendererIndex, 'collection page should load WAX scripts after api-config in dependency order');
}

assert.match(hodlHtml, /<div class="wiki-comments" data-page-id="hodlmoonboys-nft-collection"><\/div>/, 'Hodl Moonboys collection page should expose the live comments mount');
assert.match(hodlHtml, /src="\/js\/engagement\.js"/, 'Hodl Moonboys collection page should load engagement.js');
assert.match(hodlHtml, /src="\/js\/comments\.js"/, 'Hodl Moonboys collection page should load comments.js');

const { main: rebuildHodlPage } = await import(`file://${path.join(ROOT, 'scripts', 'generate-hodlmoonboys-rarity.mjs').replace(/\\/g, '/')}`);
const hodlSnapshotFiles = [
  'wiki/hodlmoonboys-nft-collection.html',
  'data/hodlmoonboys/collection.json',
  'data/hodlmoonboys/template-metadata-cache.json',
  'data/hodlmoonboys/live-template-supply.json',
  'data/hodlmoonboys/template-rarity.json',
  'data/hodlmoonboys/template-stats.json',
  'data/hodlmoonboys/trait-exposure.json',
  'data/hodlmoonboys/sync-status.json',
  'data/hodlmoonboys/template-rarity.csv',
  'data/hodlmoonboys/trait-exposure.csv',
];
const originalHodlSnapshot = Object.fromEntries(hodlSnapshotFiles.map((relativePath) => [relativePath, read(relativePath)]));
const originalFetch = globalThis.fetch;

try {
  for (const relativePath of hodlSnapshotFiles) {
    writeFileSync(path.join(ROOT, relativePath), `broken ${path.basename(relativePath)}\n`, 'utf8');
  }
  globalThis.fetch = async () => { throw new TypeError('forced fetch failure'); };
  await rebuildHodlPage();

  const rebuiltHodlPage = read('wiki/hodlmoonboys-nft-collection.html');
  assert.match(rebuiltHodlPage, /src="\/js\/site-shell\.js"/, 'Hodl fallback rebuild should restore site-shell.js');
  assert.match(rebuiltHodlPage, /<div class="wiki-comments" data-page-id="hodlmoonboys-nft-collection"><\/div>/, 'Hodl fallback rebuild should restore the comments mount');
  for (const relativePath of hodlSnapshotFiles) {
    assert.equal(read(relativePath), originalHodlSnapshot[relativePath], `Hodl fallback rebuild should restore ${relativePath}`);
  }
} finally {
  globalThis.fetch = originalFetch;
  for (const relativePath of hodlSnapshotFiles) {
    writeFileSync(path.join(ROOT, relativePath), originalHodlSnapshot[relativePath], 'utf8');
  }
}

const registry = JSON.parse(feedRegistry);
for (const feedId of ['gkniftyheads_rarity', 'noballgamess_rarity']) {
  const feed = registry.feeds.find((entry) => entry.feed_id === feedId);
  assert.ok(feed, `${feedId} should remain in feed registry`);
  assert.ok(feed.output_files.some((file) => /template-rarity\.json$/.test(file)), `${feedId} should keep static template rarity output`);
}

assert.match(worker, /handleWaxBridgeRoute\(request, env, corsHeaders\)/, 'WAX bridge route dispatch should be wired');
assert.doesNotMatch(worker, /handleWaxOnEdgeRoute|\/api\/waxonedge/i, 'removed WaxOnEdge dispatch must not return through the WAX bridge');

console.log('WAX collection page fallback regression passed.');

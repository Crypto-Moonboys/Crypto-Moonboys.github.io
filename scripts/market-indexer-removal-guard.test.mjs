#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

for (const removedPath of [
  'waxonedge.html',
  'waxonedge/index.html',
  'waxcash.html',
  '$WAXCASH TOKEN GRAFFITI GKNIFTYHEADS GRAFFITI KINGS NFTS 1.jpg',
  'analytics/token/index.html',
  'workers/moonboys-api/routes/waxonedge.js',
  'workers/waxonedge/src/index.js',
  'services/waxonedge-live-indexer/src/index.mjs',
  'scripts/update-waxonedge-feed.mjs',
  'scripts/update-waxcash-feed.mjs',
  'scripts/update-wuffi-feed.mjs',
  'js/waxonedge.js',
  'js/waxonedge-bubbles-v2.js',
  'js/waxcash-analytics.js',
  'js/waxcash-graph.js',
  'js/token-analytics-page.js',
  'css/waxonedge.css',
  'css/waxonedge-bubbles-v2.css',
  'data/waxonedge/waxcash-bubbles-bootstrap.json',
  'data/waxonedge_bubbles/sync-status.json',
  'data/waxcash_analytics/sync-status.json',
  'data/wuffi_token_analytics/sync-status.json',
]) {
  assert.equal(exists(removedPath), false, `${removedPath} must remain removed`);
}

const worker = read('workers/moonboys-api/worker.js');
assert.doesNotMatch(worker, /handleWaxOnEdgeRoute|runWaxOnEdgeScheduledSync|\/api\/waxonedge|waxonedge_sync/i, 'moonboys-api must not dispatch or schedule the removed market indexer');

const wrangler = read('workers/moonboys-api/wrangler.toml');
assert.doesNotMatch(wrangler, /waxonedge|WAXONEDGE|\/api\/waxonedge/i, 'wrangler.toml must not route, configure, or schedule the removed market indexer');

const registry = JSON.parse(read('data/feed-registry.json'));
const feedIds = new Set(registry.feeds.map((feed) => feed.feed_id));
for (const removedFeed of ['waxonedge_bubbles', 'waxcash_analytics', 'wuffi_token_analytics']) {
  assert.equal(feedIds.has(removedFeed), false, `${removedFeed} feed must remain removed`);
}

const feedStatus = JSON.parse(read('data/feed-status.json'));
for (const removedFeed of ['waxonedge_bubbles', 'waxcash_analytics', 'wuffi_token_analytics']) {
  assert.equal(Boolean(feedStatus.feeds?.[removedFeed]), false, `${removedFeed} status must remain removed`);
}

for (const productionFile of [
  '.github/workflows/ci.yml',
  'package.json',
  'scripts/ci-domain-runner.mjs',
  'scripts/update-site-feeds.mjs',
  'js/api-config.js',
  'js/price-ticker.js',
  'js/site-shell.js',
  'js/site-feed-status.js',
  'sitemap.xml',
]) {
  assert.doesNotMatch(read(productionFile), /waxonedge|WAXONEDGE|waxcash\.html|\/api\/waxonedge/i, `${productionFile} must not reference the removed market indexer`);
  assert.doesNotMatch(read(productionFile), /wax\.alcor|alcor\.exchange|swap\.taco|swap\.nefty|swap\.box|defibox|DEX token/i, `${productionFile} must not fetch removed DEX market data`);
}

console.log('Market indexer removal guard passed.');

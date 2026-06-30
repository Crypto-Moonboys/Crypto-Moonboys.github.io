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
  ['gkniftyheads_rarity', '/wiki/gkniftyheads-nft-collection.html'],
  ['waxonedge_bubbles', '/waxonedge.html'],
  ['waxcash_analytics', '/waxcash.html'],
  ['wuffi_token_analytics', '/wiki/wuffi.html'],
]);

for (const [feedId, pagePath] of requiredFeeds) {
  const feed = registry.feeds.find((entry) => entry.feed_id === feedId);
  assert.ok(feed, `${feedId} must exist in feed registry`);
  assert.equal(feed.enabled, true, `${feedId} should be enabled`);
  assert.ok(feed.page_paths.includes(pagePath), `${feedId} should affect ${pagePath}`);
  assert.ok(feed.updater && exists(feed.updater), `${feedId} updater must exist`);
  assert.ok(Array.isArray(feed.output_files) && feed.output_files.length > 0, `${feedId} must declare output files`);
  assert.ok(feed.stale_after_hours > 0, `${feedId} must declare stale_after_hours`);
  assert.ok(feed.fallback_behavior, `${feedId} must declare fallback behavior`);
}

const feedIds = registry.feeds.map((entry) => entry.feed_id);
assert.equal(new Set(feedIds).size, feedIds.length, 'feed IDs must be unique');
assert.notEqual(feedIds.filter((id) => id === 'gkniftyheads_rarity').length, feedIds.length, 'GKniftyHEADS must not be the only feed');

const mainScript = read('scripts/update-site-feeds.mjs');
assert.match(mainScript, /data\/feed-registry\.json|loadRegistry/, 'main updater must read the central registry');
assert.match(mainScript, /writeAllFeedStatus/, 'main updater must write aggregate feed status');

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

const workflow = read('.github/workflows/update-site-feeds.yml');
assert.match(workflow, /schedule:/, 'feed workflow must run on schedule');
assert.match(workflow, /workflow_dispatch:/, 'feed workflow must support manual dispatch');
assert.match(workflow, /node scripts\/update-site-feeds\.mjs/, 'workflow must run central updater');
assert.match(workflow, /chore: update site data feeds/, 'workflow must use the required commit message');
assert.match(workflow, /git add data/, 'workflow should commit changed feed data only');

const gk = read('data/gkniftyheads/template-rarity.json');
assert.match(gk, /"price_used": false/, 'NFT rarity feed must not use price');
assert.doesNotMatch(gk, /floor price|market price|last sale/i, 'NFT rarity feed must not include price ranking signals');

console.log('Site feed registry audit passed.');

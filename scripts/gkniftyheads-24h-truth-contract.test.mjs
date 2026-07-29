#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));

const registry = json('data/feed-registry.json');
const feed = registry.feeds.find((row) => row.feed_id === 'gkniftyheads_rarity');
assert.ok(feed, 'GKniftyHEADS feed must be registered');
assert.equal(feed.update_frequency, '24h', 'GKniftyHEADS feed must update every 24 hours');
assert.equal(feed.feed_mode, 'scheduled_snapshot_primary', 'GKniftyHEADS must be labelled as a scheduled snapshot');
assert.ok(feed.output_files.includes('wiki/gkniftyheads-nft-collection.html'), 'generated collection HTML must be a declared output');
assert.ok(feed.output_files.includes('data/gkniftyheads/market-analytics.json'), 'market analytics JSON must be committed with the snapshot');
assert.ok(feed.output_files.includes('data/gkniftyheads/sync-status.json'), 'sync status must be committed with the snapshot');

const updater = read('scripts/update-gkniftyheads-rarity-feed.mjs');
assert.match(updater, /analytics_status:\s*marketAnalytics\.analytics_status/, 'central status must expose analytics health');
assert.match(updater, /endpoint_status:\s*endpointStatus/, 'central status must expose endpoint health');
assert.match(updater, /status:\s*feedDegraded \? 'degraded' : 'ok'/, 'mismatches and failed optional sources must prevent a false OK state');
assert.match(updater, /Historic burn baseline is pending/, 'burn status must remain pending until confirmed');
assert.match(updater, /mismatch_template_ids/, 'mismatched templates must be recorded in sync status');
assert.match(updater, /live_minus_issued/, 'issued/live reconciliation must be recorded');

const statusScript = read('js/site-feed-status.js');
assert.match(statusScript, /cache:\s*'no-store'/, 'feed-status JSON must bypass browser cache');
assert.doesNotMatch(statusScript, /burn baseline active/i, 'public status must not claim an active burn baseline');
assert.match(statusScript, /24-hour rarity snapshot/, 'public status must identify the data as a 24-hour snapshot');
assert.match(statusScript, /reconciliation pending/, 'public status must expose incomplete reconciliation');

const marketRuntime = read('js/gkniftyheads-rarity.js');
assert.match(marketRuntime, /market-analytics\.json', \{ cache: 'no-store' \}/, 'market analytics must hydrate from uncached snapshot JSON');
assert.match(marketRuntime, /Temporarily unavailable/, 'failed market endpoints must display unavailable rather than invented values');

const workflow = read('.github/workflows/update-site-feeds.yml');
assert.match(workflow, /cron: '17 3 \* \* \*'/, 'daily workflow schedule must remain configured');
assert.match(workflow, /gkniftyheads-24h-truth-contract\.test\.mjs/, 'scheduled workflow must run this truth contract');
assert.match(workflow, /nft-market-analytics-render\.test\.mjs/, 'scheduled workflow must validate market analytics rendering');
assert.match(workflow, /wiki\/gkniftyheads-nft-collection\.html/, 'scheduled workflow must commit regenerated collection HTML');
assert.match(workflow, /No feed values changed; no commit required\./, 'workflow must avoid meaningless commits when no values changed');

console.log('gkniftyheads-24h-truth-contract.test.mjs passed');

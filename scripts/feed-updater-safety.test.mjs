#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeFetchJson } from './site-feed-utils.mjs';
import { updateWaxcashFeed } from './update-waxcash-feed.mjs';
import { updateWaxonedgeFeed } from './update-waxonedge-feed.mjs';
import { updateWuffiFeed } from './update-wuffi-feed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const touched = [
  'data/waxcash_analytics/waxcash-analytics.json',
  'data/waxcash_analytics/sync-status.json',
  'data/wuffi_token_analytics/token-page.json',
  'data/wuffi_token_analytics/pairs-liquidity.json',
  'data/wuffi_token_analytics/pairs-volume24.json',
  'data/wuffi_token_analytics/sync-status.json',
  'data/waxonedge_bubbles/waxcash-bubbles-lite.json',
  'data/waxonedge_bubbles/indexer-health.json',
  'data/waxonedge_bubbles/sync-status.json',
  'data/feed-status.json',
];

function full(relativePath) {
  return path.join(root, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(full(relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  fs.mkdirSync(path.dirname(full(relativePath)), { recursive: true });
  fs.writeFileSync(full(relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const backups = new Map(touched.map((relativePath) => [
  relativePath,
  fs.existsSync(full(relativePath)) ? fs.readFileSync(full(relativePath), 'utf8') : null,
]));
const originalFetch = global.fetch;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

try {
  let attempts = 0;
  const retried = await safeFetchJson('/fixture/transient', {
    source_key: 'retry_fixture',
    retries: 1,
    retryDelayMs: 0,
    fetchJson: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('fixture failed: HTTP 503');
      return { ok: true, generated_at: '2026-07-01T00:00:00.000Z' };
    },
  });
  assert.equal(attempts, 2, 'safeFetchJson should retry transient 503 once before fallback');
  assert.equal(retried.ok, true, 'safeFetchJson should return fresh payload after retry succeeds');
  assert.equal(retried.source_key, 'retry_fixture', 'safeFetchJson result should include source_key');
  assert.equal(retried.used_previous, false, 'safeFetchJson should not mark fresh retry success as previous data');

  writeJson('data/waxcash_analytics/waxcash-analytics.json', {
    generated_at: '2026-07-01T00:00:00.000Z',
    source: 'fixture_previous_waxcash',
    tokens: [{ symbol: 'WAXCASH' }],
  });
  global.fetch = async () => jsonResponse({ error: 'unavailable' }, 503);
  const waxcashStatus = await updateWaxcashFeed();
  assert.equal(waxcashStatus.status, 'degraded', 'WaxCash should degrade, not error, when previous analytics JSON is used');
  assert.equal(waxcashStatus.analytics_status, 'degraded', 'WaxCash should expose degraded analytics_status');
  assert.equal(waxcashStatus.endpoint_status.analytics.used_previous, true, 'WaxCash endpoint_status must report previous JSON fallback');
  assert.match(waxcashStatus.endpoint_status.analytics.error, /HTTP 503/, 'WaxCash endpoint_status should preserve the HTTP 503 error');
  assert.equal(readJson('data/waxcash_analytics/waxcash-analytics.json').source, 'fixture_previous_waxcash', 'WaxCash updater must preserve previous JSON on 503');

  writeJson('data/waxonedge_bubbles/waxcash-bubbles-lite.json', {
    generated_at: '2026-07-01T00:00:00.000Z',
    source: 'fixture_previous_bubbles',
    tokens: [{ symbol: 'WAXCASH' }],
  });
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes('/api/waxonedge/indexer-health')) {
      return jsonResponse({ generated_at: '2026-07-01T00:05:00.000Z', source: 'fixture_health' });
    }
    if (text.includes('/api/waxonedge/waxcash-bubbles-lite')) {
      throw new Error('Feed fetch timeout after 15000ms');
    }
    if (text.includes('/data/waxonedge/waxcash-bubbles-bootstrap.json')) {
      return jsonResponse({ generated_at: '2026-07-01T00:01:00.000Z', source: 'fixture_static_bootstrap' });
    }
    return jsonResponse({});
  };
  const waxonedgeStatus = await updateWaxonedgeFeed();
  assert.equal(waxonedgeStatus.status, 'degraded', 'WaxOnEdge should degrade when bubbles_lite times out but fallback exists');
  assert.equal(waxonedgeStatus.endpoint_status.health.ok, true, 'WaxOnEdge health should have independent endpoint status');
  assert.equal(waxonedgeStatus.endpoint_status.bubbles_lite.used_previous, true, 'WaxOnEdge bubbles_lite should use previous JSON on timeout');
  assert.equal(waxonedgeStatus.endpoint_status.static_bootstrap.ok, true, 'WaxOnEdge static bootstrap should be checked independently');
  assert.match(waxonedgeStatus.last_error, /bubbles_lite/, 'WaxOnEdge status should retain bubbles_lite timeout detail');

  writeJson('data/wuffi_token_analytics/token-page.json', {
    generated_at: '2026-07-01T00:00:00.000Z',
    source: 'fixture_previous_wuffi',
    pairs: [{ pair: 'WUF/WAX' }],
  });
  writeJson('data/wuffi_token_analytics/pairs-liquidity.json', {
    generated_at: '2026-07-01T00:00:00.000Z',
    source: 'fixture_previous_liquidity',
    pairs: [{ pair: 'WUF/WAX' }],
  });
  writeJson('data/wuffi_token_analytics/pairs-volume24.json', {
    generated_at: '2026-07-01T00:00:00.000Z',
    source: 'fixture_previous_volume',
    pairs: [{ pair: 'WUF/WAX' }],
  });

  let active = 0;
  let maxActive = 0;
  const callOrder = [];
  global.fetch = async (url) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    const text = String(url);
    if (text.includes('sort=liquidity')) callOrder.push('pairs_liquidity');
    else if (text.includes('sort=volume24')) callOrder.push('pairs_volume24');
    else callOrder.push('token_page');
    await Promise.resolve();
    active -= 1;
    if (text.includes('sort=liquidity')) return jsonResponse({ error: 'unavailable' }, 503);
    return jsonResponse({ generated_at: '2026-07-01T00:10:00.000Z', source: text, pairs: [] });
  };
  const wuffiStatus = await updateWuffiFeed({ delayMs: 0 });
  assert.deepEqual(callOrder, ['token_page', 'pairs_liquidity', 'pairs_liquidity', 'pairs_volume24'], 'WUFFI updater should call endpoints sequentially and retry liquidity once');
  assert.equal(maxActive, 1, 'WUFFI updater must not call token_page and sorted pair endpoints concurrently');
  assert.equal(wuffiStatus.status, 'degraded', 'WUFFI should degrade when one endpoint uses previous JSON');
  assert.equal(wuffiStatus.endpoint_status.pairs_liquidity.used_previous, true, 'WUFFI should preserve previous JSON for failed endpoint');
  assert.equal(readJson('data/wuffi_token_analytics/pairs-liquidity.json').source, 'fixture_previous_liquidity', 'WUFFI failed endpoint must not overwrite previous JSON');

  const centralUpdater = fs.readFileSync(full('scripts/update-site-feeds.mjs'), 'utf8');
  assert.match(centralUpdater, /for \(const feed of registry\.feeds\)/, 'central updater should process registered feeds in a loop');
  assert.match(centralUpdater, /catch \(error\)/, 'central updater should catch one feed failure and continue later feeds');
  assert.match(centralUpdater, /Updater threw before completing; previous feed output files were preserved\./, 'central updater should preserve previous outputs when a feed throws');

  console.log('Feed updater safety regression passed.');
} finally {
  global.fetch = originalFetch;
  for (const [relativePath, content] of backups) {
    if (content == null) {
      fs.rmSync(full(relativePath), { force: true });
    } else {
      fs.mkdirSync(path.dirname(full(relativePath)), { recursive: true });
      fs.writeFileSync(full(relativePath), content, 'utf8');
    }
  }
}

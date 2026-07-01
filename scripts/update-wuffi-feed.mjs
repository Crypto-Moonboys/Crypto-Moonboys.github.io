#!/usr/bin/env node

import {
  createFeedStatus,
  findFeed,
  preserveOrWrite,
  safeFetchJson,
  sourceUpdatedAt,
  summarizePayload,
  writeFeedStatus,
} from './site-feed-utils.mjs';

const FEED_ID = 'wuffi_token_analytics';

const WUFFI_ENDPOINTS = [
  ['token_page', 'data/wuffi_token_analytics/token-page.json'],
  ['pairs_liquidity', 'data/wuffi_token_analytics/pairs-liquidity.json'],
  ['pairs_volume24', 'data/wuffi_token_analytics/pairs-volume24.json'],
];

async function pause(ms) {
  if (Number(ms) > 0) await new Promise((resolve) => setTimeout(resolve, Number(ms)));
}

async function capture(feed, key, outputPath, options = {}) {
  const result = await safeFetchJson(feed.source_urls[key], {
    source_key: key,
    previousPath: outputPath,
    timeoutMs: feed.timeout_ms,
    retries: feed.retries,
    retryDelayMs: feed.retry_backoff_ms,
    allowStale: true,
    fetchJson: options.fetchJson,
  });
  if (result.ok) preserveOrWrite(outputPath, result.payload);
  return { ...result, key };
}

export async function updateWuffiFeed(options = {}) {
  const feed = findFeed(FEED_ID);
  const captures = [];
  for (const [key, outputPath] of WUFFI_ENDPOINTS) {
    captures.push(await capture(feed, key, outputPath, options));
    await pause(options.delayMs ?? feed.retry_backoff_ms ?? 0);
  }
  const successes = captures.filter((item) => item.ok);
  const usable = captures.filter((item) => item.payload);
  const errors = captures.filter((item) => item.error).map((item) => `${item.key}: ${item.error}`);
  const endpointStatus = Object.fromEntries(captures.map((item) => [item.key, item]));
  const newestSourceUpdate = successes
    .map((item) => sourceUpdatedAt(item.payload))
    .filter(Boolean)
    .sort()
    .pop() || null;
  const tokenPage = captures.find((item) => item.key === 'token_page');
  const statusValue = captures.every((item) => item.ok)
    ? 'ok'
    : tokenPage?.payload
      ? 'degraded'
      : 'error';
  const status = createFeedStatus(feed, {
    status: statusValue,
    stale: statusValue !== 'ok',
    analytics_status: statusValue,
    last_successful_check: statusValue !== 'error' ? new Date().toISOString() : null,
    source_updated_at: newestSourceUpdate,
    last_error: errors.length ? errors.join('; ') : null,
    endpoint_status: endpointStatus,
    notes: [
      'Uses existing WUFFI token analytics Worker contract; chart candles remain direct Alcor runtime data.',
      'Scheduled updater refreshes WUFFI endpoints sequentially to avoid API bursts.',
      ...usable.map((item) => `${item.key} summary: ${JSON.stringify(summarizePayload(item.payload))}`),
      errors.length ? 'Previous WUFFI analytics JSON preserved for failed endpoints.' : 'All configured WUFFI analytics endpoints refreshed.',
    ],
  });
  writeFeedStatus(feed, status);
  return status;
}

if (process.argv[1] && process.argv[1].endsWith('update-wuffi-feed.mjs')) {
  updateWuffiFeed()
    .then((status) => console.log(`${FEED_ID}: ${status.status}`))
    .catch((error) => {
      console.error(`${FEED_ID}: ${error.message || error}`);
      process.exitCode = 1;
    });
}

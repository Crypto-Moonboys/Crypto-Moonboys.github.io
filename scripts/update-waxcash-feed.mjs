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

const FEED_ID = 'waxcash_analytics';

export async function updateWaxcashFeed() {
  const feed = findFeed(FEED_ID);
  const result = await safeFetchJson(feed.source_urls.analytics, {
    source_key: 'analytics',
    previousPath: 'data/waxcash_analytics/waxcash-analytics.json',
    timeoutMs: feed.timeout_ms,
    retries: feed.retries,
    retryDelayMs: feed.retry_backoff_ms,
    allowStale: true,
  });
  if (result.ok) preserveOrWrite('data/waxcash_analytics/waxcash-analytics.json', result.payload);
  const payload = result.payload;
  const statusValue = result.ok ? 'ok' : result.used_previous ? 'degraded' : 'error';
  const status = createFeedStatus(feed, {
    status: statusValue,
    stale: statusValue !== 'ok',
    analytics_status: statusValue,
    last_successful_check: statusValue !== 'error' ? new Date().toISOString() : null,
    source_updated_at: sourceUpdatedAt(payload),
    last_error: result.error,
    endpoint_status: { analytics: result },
    notes: [
      'Uses the existing /api/waxonedge/waxcash-analytics page contract.',
      payload ? `analytics summary: ${JSON.stringify(summarizePayload(payload))}` : 'No previous analytics JSON was available.',
      result.used_previous ? 'Previous analytics JSON preserved and used as stale fallback.' : 'Fresh analytics endpoint data used when available.',
    ],
  });
  writeFeedStatus(feed, status);
  return status;
}

if (process.argv[1] && process.argv[1].endsWith('update-waxcash-feed.mjs')) {
  updateWaxcashFeed()
    .then((status) => console.log(`${FEED_ID}: ${status.status}`))
    .catch((error) => {
      console.error(`${FEED_ID}: ${error.message || error}`);
      process.exitCode = 1;
    });
}

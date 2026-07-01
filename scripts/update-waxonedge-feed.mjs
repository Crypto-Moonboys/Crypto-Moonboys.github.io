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

const FEED_ID = 'waxonedge_bubbles';

export async function updateWaxonedgeFeed() {
  const feed = findFeed(FEED_ID);
  const fetchOptions = {
    timeoutMs: feed.timeout_ms,
    retries: feed.retries,
    retryDelayMs: feed.retry_backoff_ms,
    allowStale: true,
  };
  const liteResult = await safeFetchJson(feed.source_urls.bubbles_lite, {
    ...fetchOptions,
    source_key: 'bubbles_lite',
    previousPath: 'data/waxonedge_bubbles/waxcash-bubbles-lite.json',
  });
  if (liteResult.ok) preserveOrWrite('data/waxonedge_bubbles/waxcash-bubbles-lite.json', liteResult.payload);
  const healthResult = await safeFetchJson(feed.source_urls.health, {
    ...fetchOptions,
    source_key: 'health',
    previousPath: 'data/waxonedge_bubbles/indexer-health.json',
  });
  if (healthResult.ok) preserveOrWrite('data/waxonedge_bubbles/indexer-health.json', healthResult.payload);
  const staticResult = await safeFetchJson(feed.source_urls.static_bootstrap, {
    ...fetchOptions,
    source_key: 'static_bootstrap',
    previousPath: 'data/waxonedge/waxcash-bubbles-bootstrap.json',
    retries: 0,
  });
  const endpointStatus = {
    health: healthResult,
    bubbles_lite: liteResult,
    static_bootstrap: staticResult,
  };
  const errors = Object.values(endpointStatus)
    .filter((result) => result.error)
    .map((result) => `${result.source_key}: ${result.error}`);
  const hasUsableBubbles = Boolean(liteResult.payload || staticResult.payload);
  const hasFreshLiveBubbles = liteResult.ok && !liteResult.used_previous;
  const statusValue = hasFreshLiveBubbles && healthResult.ok
    ? 'ok'
    : hasUsableBubbles
      ? 'degraded'
      : 'error';
  const lite = liteResult.payload;
  const health = healthResult.payload;
  const status = createFeedStatus(feed, {
    status: statusValue,
    stale: statusValue !== 'ok',
    analytics_status: statusValue,
    last_successful_check: statusValue !== 'error' ? new Date().toISOString() : null,
    source_updated_at: sourceUpdatedAt(lite) || sourceUpdatedAt(health),
    last_error: errors.length ? errors.join('; ') : null,
    endpoint_status: endpointStatus,
    notes: [
      'Uses existing WaxOnEdge Worker endpoints; scheduled feed status is advisory and preserves live-primary runtime behavior.',
      `bubbles_lite summary: ${JSON.stringify(summarizePayload(lite))}`,
      `health summary: ${JSON.stringify(summarizePayload(health))}`,
      staticResult.payload ? 'Static bootstrap or previous live bubbles remain available as fallback.' : 'No static/bootstrap bubble fallback was available.',
    ],
  });
  writeFeedStatus(feed, status);
  return status;
}

if (process.argv[1] && process.argv[1].endsWith('update-waxonedge-feed.mjs')) {
  updateWaxonedgeFeed()
    .then((status) => console.log(`${FEED_ID}: ${status.status}`))
    .catch((error) => {
      console.error(`${FEED_ID}: ${error.message || error}`);
      process.exitCode = 1;
    });
}

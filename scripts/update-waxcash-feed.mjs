#!/usr/bin/env node

import {
  createFeedStatus,
  fetchJson,
  findFeed,
  preserveOrWrite,
  summarizePayload,
  writeFeedStatus,
} from './site-feed-utils.mjs';

const FEED_ID = 'waxcash_analytics';

export async function updateWaxcashFeed() {
  const feed = findFeed(FEED_ID);
  let payload = null;
  let errorMessage = null;
  try {
    payload = await fetchJson(feed.source_urls.analytics);
    preserveOrWrite('data/waxcash_analytics/waxcash-analytics.json', payload);
  } catch (error) {
    errorMessage = error.message || String(error);
  }
  const status = createFeedStatus(feed, {
    status: payload ? 'ok' : 'error',
    last_successful_update: payload ? new Date().toISOString() : null,
    last_error: errorMessage,
    notes: [
      'Uses the existing /api/waxonedge/waxcash-analytics page contract.',
      payload ? `analytics summary: ${JSON.stringify(summarizePayload(payload))}` : 'Previous analytics JSON preserved if present.',
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

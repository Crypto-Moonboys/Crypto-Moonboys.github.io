#!/usr/bin/env node

import {
  createFeedStatus,
  fetchJson,
  findFeed,
  preserveOrWrite,
  summarizePayload,
  writeFeedStatus,
} from './site-feed-utils.mjs';

const FEED_ID = 'waxonedge_bubbles';

export async function updateWaxonedgeFeed() {
  const feed = findFeed(FEED_ID);
  const errors = [];
  let success = false;
  let lite = null;
  let health = null;
  try {
    lite = await fetchJson(feed.source_urls.bubbles_lite);
    preserveOrWrite('data/waxonedge_bubbles/waxcash-bubbles-lite.json', lite);
    success = true;
  } catch (error) {
    errors.push(`bubbles_lite: ${error.message || error}`);
  }
  try {
    health = await fetchJson(feed.source_urls.health);
    preserveOrWrite('data/waxonedge_bubbles/indexer-health.json', health);
    success = true;
  } catch (error) {
    errors.push(`health: ${error.message || error}`);
  }
  const status = createFeedStatus(feed, {
    status: success ? 'ok' : 'error',
    last_successful_update: success ? new Date().toISOString() : null,
    last_error: errors.length ? errors.join('; ') : null,
    notes: [
      'Uses existing WaxOnEdge Worker endpoints and preserves static bootstrap data on failure.',
      `bubbles_lite summary: ${JSON.stringify(summarizePayload(lite))}`,
      `health summary: ${JSON.stringify(summarizePayload(health))}`,
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

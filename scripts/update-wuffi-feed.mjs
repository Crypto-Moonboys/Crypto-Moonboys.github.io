#!/usr/bin/env node

import {
  createFeedStatus,
  fetchJson,
  findFeed,
  preserveOrWrite,
  summarizePayload,
  writeFeedStatus,
} from './site-feed-utils.mjs';

const FEED_ID = 'wuffi_token_analytics';

async function capture(feed, key, outputPath) {
  try {
    const payload = await fetchJson(feed.source_urls[key]);
    preserveOrWrite(outputPath, payload);
    return { ok: true, key, payload };
  } catch (error) {
    return { ok: false, key, error: error.message || String(error) };
  }
}

export async function updateWuffiFeed() {
  const feed = findFeed(FEED_ID);
  const captures = await Promise.all([
    capture(feed, 'token_page', 'data/wuffi_token_analytics/token-page.json'),
    capture(feed, 'pairs_liquidity', 'data/wuffi_token_analytics/pairs-liquidity.json'),
    capture(feed, 'pairs_volume24', 'data/wuffi_token_analytics/pairs-volume24.json'),
  ]);
  const successes = captures.filter((item) => item.ok);
  const errors = captures.filter((item) => !item.ok).map((item) => `${item.key}: ${item.error}`);
  const status = createFeedStatus(feed, {
    status: successes.length ? 'ok' : 'error',
    last_successful_update: successes.length ? new Date().toISOString() : null,
    last_error: errors.length ? errors.join('; ') : null,
    notes: [
      'Uses existing WUFFI token analytics Worker contract; chart candles remain direct Alcor runtime data.',
      ...successes.map((item) => `${item.key} summary: ${JSON.stringify(summarizePayload(item.payload))}`),
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

#!/usr/bin/env node

import { runGenerateGkniftyheadsRarity } from './generate-gkniftyheads-rarity.mjs';
import {
  createFeedStatus,
  fetchJson,
  findFeed,
  preserveOrWrite,
  readPrevious,
  resolveRoot,
  writeFeedStatus,
  writeJson,
} from './site-feed-utils.mjs';

const FEED_ID = 'gkniftyheads_rarity';

async function tryUpdateCheckpoint(feed) {
  const endpoint = feed.source_urls?.wax_get_info;
  if (!endpoint) return { checkpoint: null, error: null };
  try {
    const payload = await fetchJson(endpoint);
    return {
      checkpoint: {
        head_block_num: payload.head_block_num || null,
        head_block_time: payload.head_block_time || null,
        chain_id: payload.chain_id || null,
        checked_at: new Date().toISOString(),
      },
      error: null,
    };
  } catch (error) {
    return { checkpoint: null, error: error.message || String(error) };
  }
}

export async function updateGkniftyheadsRarityFeed() {
  const feed = findFeed(FEED_ID);
  const result = runGenerateGkniftyheadsRarity();
  const { checkpoint, error } = await tryUpdateCheckpoint(feed);
  const syncPath = 'data/gkniftyheads/sync-status.json';
  const existingSync = readPrevious(syncPath, {});
  if (checkpoint) {
    existingSync.wax_get_info = {
      ...(existingSync.wax_get_info || {}),
      used_for: 'future scan checkpoint metadata only',
      endpoint: feed.source_urls.wax_get_info,
      head_block_num: checkpoint.head_block_num,
      head_block_time: checkpoint.head_block_time,
      chain_id: checkpoint.chain_id,
      checked_at: checkpoint.checked_at,
    };
    writeJson(resolveRoot(syncPath), existingSync);
  }
  preserveOrWrite('data/gkniftyheads/live-asset-rarity.json', readPrevious('data/gkniftyheads/live-asset-rarity.json'));
  const status = createFeedStatus(feed, {
    status: 'ok',
    last_successful_check: new Date().toISOString(),
    source_updated_at: existingSync.generated_at || new Date().toISOString(),
    last_error: error ? `WAX get_info checkpoint unavailable: ${error}` : null,
    notes: [
      `Generated local rarity fallback: ${result.ranked} ranked, ${result.utility} utility/open mint, ${result.unissued} unissued.`,
      'Live asset scan is not faked; issued-supply fallback remains explicit until AtomicAssets asset snapshots are available.',
      checkpoint ? 'WAX get_info checkpoint updated for scan metadata only.' : 'WAX get_info checkpoint not updated; rarity data preserved.',
    ],
  });
  writeFeedStatus(feed, status);
  return status;
}

if (process.argv[1] && process.argv[1].endsWith('update-gkniftyheads-rarity-feed.mjs')) {
  updateGkniftyheadsRarityFeed()
    .then((status) => console.log(`${FEED_ID}: ${status.status}`))
    .catch((error) => {
      console.error(`${FEED_ID}: ${error.message || error}`);
      process.exitCode = 1;
    });
}

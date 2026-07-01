#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT,
  createFeedStatus,
  loadRegistry,
  writeAllFeedStatus,
} from './site-feed-utils.mjs';

async function runFeed(feed) {
  if (!feed.enabled) {
    return createFeedStatus(feed, {
      status: 'disabled',
      notes: ['Feed disabled in data/feed-registry.json.'],
    });
  }
  if (!feed.updater) {
    return createFeedStatus(feed, {
      status: 'error',
      last_error: `feed sync not implemented for ${feed.feed_id}`,
    });
  }
  const modulePath = pathToFileURL(path.join(ROOT, feed.updater)).href;
  const module = await import(modulePath);
  const functionName = `update${feed.feed_id.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}Feed`;
  const updater = module[functionName] || module.default || Object.values(module).find((value) => typeof value === 'function');
  if (typeof updater !== 'function') {
    return createFeedStatus(feed, {
      status: 'error',
      last_error: `feed sync not implemented for ${feed.feed_id}`,
    });
  }
  try {
    return await updater();
  } catch (error) {
    return createFeedStatus(feed, {
      status: 'error',
      last_error: error.message || String(error),
      notes: ['Updater threw before completing; previous feed output files were preserved.'],
    });
  }
}

export async function updateSiteFeeds() {
  const registry = loadRegistry();
  const statuses = [];
  for (const feed of registry.feeds) {
    const status = await runFeed(feed);
    statuses.push(status);
    console.log(`${feed.feed_id}: ${status.status}${status.stale ? ' stale' : ''}${status.last_error ? ` (${status.last_error})` : ''}`);
  }
  writeAllFeedStatus(statuses);
  return statuses;
}

if (process.argv[1] && process.argv[1].endsWith('update-site-feeds.mjs')) {
  updateSiteFeeds().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

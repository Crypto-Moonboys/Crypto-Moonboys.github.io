#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeFetchJson } from './site-feed-utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function full(relativePath) {
  return path.join(root, relativePath);
}

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

const centralUpdater = fs.readFileSync(full('scripts/update-site-feeds.mjs'), 'utf8');
assert.match(centralUpdater, /for \(const feed of registry\.feeds\)/, 'central updater should process registered feeds in a loop');
assert.match(centralUpdater, /catch \(error\)/, 'central updater should catch one feed failure and continue later feeds');
assert.match(centralUpdater, /Updater threw before completing; previous feed output files were preserved\./, 'central updater should preserve previous outputs when a feed throws');

console.log('Feed updater safety regression passed.');

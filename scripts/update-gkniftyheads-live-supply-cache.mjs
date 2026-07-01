#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractRows,
  hydrateLiveAssetCounts,
  parseAtomicAssetsCount,
} from './generate-gkniftyheads-rarity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_RELATIVE = path.join('data', 'gkniftyheads', 'live-template-supply.json');
const COLLECTION = 'gkniftyheads';

function cachePath(root = ROOT) {
  return path.join(root, CACHE_RELATIVE);
}

function readExistingCache(root = ROOT) {
  const file = cachePath(root);
  if (!fs.existsSync(file)) return new Map();
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  return new Map((payload.supplies || []).map((row) => [Number(row.template_id), row]));
}

function writeCache(root, cache) {
  const file = cachePath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const supplies = [...cache.values()].sort((a, b) => a.template_id - b.template_id);
  fs.writeFileSync(file, `${JSON.stringify({
    collection: COLLECTION,
    generated_at: new Date().toISOString(),
    supplies,
  }, null, 2)}\n`, 'utf8');
}

function readRows(root = ROOT) {
  const html = fs.readFileSync(path.join(root, 'wiki', 'gkniftyheads-nft-collection.html'), 'utf8');
  return extractRows(html, root);
}

function sourceUrl(templateId) {
  return `https://wax.api.atomicassets.io/atomicassets/v1/assets/_count?collection_name=${COLLECTION}&template_id=${templateId}`;
}

function supplyEntry(row) {
  return {
    template_id: row.template_id,
    issued_supply: row.issued_supply,
    live_supply: row.live_supply,
    listed_supply: null,
    pre_baseline_missing_or_burned: row.pre_baseline_missing_or_burned,
    live_supply_status: row.live_supply_status,
    last_checked_at: row.live_supply_checked_at || new Date().toISOString(),
    source_url: row.live_supply_source_url || sourceUrl(row.template_id),
    error: row.live_supply_error || null,
  };
}

export async function updateGkniftyheadsLiveSupplyCache(root = ROOT, options = {}) {
  const rows = options.rows || readRows(root);
  const cache = readExistingCache(root);

  for (const row of rows) {
    if (!cache.has(row.template_id)) {
      cache.set(row.template_id, {
        template_id: row.template_id,
        issued_supply: row.issued_supply,
        live_supply: row.issued_supply,
        listed_supply: null,
        pre_baseline_missing_or_burned: null,
        live_supply_status: 'issued_supply_fallback',
        last_checked_at: null,
        source_url: sourceUrl(row.template_id),
        error: 'not checked yet',
      });
    }
  }
  writeCache(root, cache);

  await hydrateLiveAssetCounts(rows, {
    concurrency: options.concurrency || 8,
    timeoutMs: options.timeoutMs || 20000,
    rejectUnauthorized: options.rejectUnauthorized,
    countTemplate: options.countTemplate,
    onRow: async (row) => {
      const previous = cache.get(row.template_id);
      if (row.live_supply_status === 'ok') {
        cache.set(row.template_id, supplyEntry(row));
      } else if (previous?.live_supply_status === 'ok') {
        cache.set(row.template_id, {
          ...previous,
          error: row.live_supply_error,
          last_error_at: new Date().toISOString(),
        });
      } else {
        cache.set(row.template_id, supplyEntry(row));
      }
      writeCache(root, cache);
    },
  });

  const supplies = [...cache.values()];
  return {
    templates: supplies.length,
    ok: supplies.filter((row) => row.live_supply_status === 'ok').length,
    fallback: supplies.filter((row) => row.live_supply_status !== 'ok').length,
  };
}

export { parseAtomicAssetsCount };

if (process.argv[1] && process.argv[1].endsWith('update-gkniftyheads-live-supply-cache.mjs')) {
  updateGkniftyheadsLiveSupplyCache(ROOT)
    .then((result) => console.log(`GKniftyHEADS live supply cache: ${result.ok}/${result.templates} ok, ${result.fallback} fallback.`))
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

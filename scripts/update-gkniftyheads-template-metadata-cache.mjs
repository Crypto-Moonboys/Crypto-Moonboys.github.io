#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractRows,
  hydrateAtomicAssetsImageSources,
} from './generate-gkniftyheads-rarity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_RELATIVE = path.join('data', 'gkniftyheads', 'template-metadata-cache.json');

function cachePath(root = ROOT) {
  return path.join(root, CACHE_RELATIVE);
}

function readExistingCache(root = ROOT) {
  const file = cachePath(root);
  if (!fs.existsSync(file)) return new Map();
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  return new Map((payload.templates || []).map((row) => [Number(row.template_id), row]));
}

function writeCache(root, cache) {
  const file = cachePath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const templates = [...cache.values()].sort((a, b) => a.template_id - b.template_id);
  fs.writeFileSync(file, `${JSON.stringify({
    collection: 'gkniftyheads',
    generated_at: new Date().toISOString(),
    templates,
  }, null, 2)}\n`, 'utf8');
}

function readRows(root = ROOT) {
  const html = fs.readFileSync(path.join(root, 'wiki', 'gkniftyheads-nft-collection.html'), 'utf8');
  return extractRows(html, root);
}

function metadataEntry(row, previous = {}) {
  const base = {
    template_id: row.template_id,
    title: row.title,
    issued_supply: row.issued_supply,
    max_supply: row.max_supply,
    schema: row.schema,
    immutable_data_image_fields: row.immutable_data_image_fields || previous.immutable_data_image_fields || {},
    image_url: row.image_url || previous.image_url || '',
    image_sources: row.image_sources?.length ? row.image_sources : previous.image_sources || [],
    atomichub_url: row.atomichub_url,
    atomicassets_url: row.atomicassets_url,
    last_checked_at: row.last_checked_at || new Date().toISOString(),
    metadata_status: row.metadata_status || 'ok',
  };
  if (row.atomicassets_image_error) base.error = row.atomicassets_image_error;
  return base;
}

export async function updateGkniftyheadsTemplateMetadataCache(root = ROOT, options = {}) {
  const rows = options.rows || readRows(root);
  const cache = readExistingCache(root);

  for (const row of rows) {
    const previous = cache.get(row.template_id) || {};
    cache.set(row.template_id, metadataEntry(row, previous));
  }
  writeCache(root, cache);

  await hydrateAtomicAssetsImageSources(rows, {
    concurrency: options.concurrency || 8,
    timeoutMs: options.timeoutMs || 20000,
    rejectUnauthorized: options.rejectUnauthorized,
    onRow: async (row) => {
      const previous = cache.get(row.template_id) || {};
      if (row.metadata_status === 'error' && previous.metadata_status === 'ok') {
        cache.set(row.template_id, {
          ...previous,
          error: row.atomicassets_image_error,
          last_error_at: row.last_checked_at,
        });
      } else {
        cache.set(row.template_id, metadataEntry(row, previous));
      }
      writeCache(root, cache);
    },
  });

  return {
    templates: cache.size,
    ok: [...cache.values()].filter((row) => row.metadata_status === 'ok').length,
    error: [...cache.values()].filter((row) => row.metadata_status === 'error').length,
  };
}

if (process.argv[1] && process.argv[1].endsWith('update-gkniftyheads-template-metadata-cache.mjs')) {
  updateGkniftyheadsTemplateMetadataCache(ROOT)
    .then((result) => console.log(`GKniftyHEADS metadata cache: ${result.ok}/${result.templates} ok, ${result.error} error.`))
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

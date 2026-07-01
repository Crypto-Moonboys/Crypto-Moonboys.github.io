#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectAtomicMediaFields,
  collectAtomicMediaValues,
  extractRows,
  fetchJson,
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

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function schemaName(data = {}, fallback = '') {
  return data.schema?.schema_name || data.schema_name || fallback || '';
}

function metadataEntry(row, payload, checkedAt) {
  const data = payload?.data || {};
  const immutableData = data.immutable_data || {};
  const imageSources = collectAtomicMediaValues(immutableData);
  const title = String(immutableData.name || row.title || '').trim();
  return {
    template_id: row.template_id,
    title,
    issued_supply: num(data.issued_supply ?? row.issued_supply),
    max_supply: num(data.max_supply ?? row.max_supply),
    schema: schemaName(data, row.schema),
    schema_name: schemaName(data, row.schema),
    immutable_data_name: title,
    immutable_data_image_fields: collectAtomicMediaFields(immutableData),
    image_url: imageSources[0] || row.image_url || '',
    image_sources: imageSources.length ? imageSources : row.image_sources || [],
    atomichub_url: row.atomichub_url,
    atomicassets_url: row.atomicassets_url,
    local_wiki_page: row.url || '',
    exists_on_atomicassets: true,
    last_checked_at: checkedAt,
    metadata_status: 'ok',
  };
}

function missingEntry(row, error, previous = {}, checkedAt = new Date().toISOString()) {
  return {
    ...previous,
    template_id: row.template_id,
    title: previous.title || row.title,
    issued_supply: previous.issued_supply ?? row.issued_supply,
    max_supply: previous.max_supply ?? row.max_supply,
    schema: previous.schema || row.schema,
    atomichub_url: row.atomichub_url,
    atomicassets_url: row.atomicassets_url,
    local_wiki_page: row.url || previous.local_wiki_page || '',
    exists_on_atomicassets: false,
    last_checked_at: checkedAt,
    metadata_status: 'error',
    error: String(error?.message || error),
  };
}

export async function updateGkniftyheadsTemplateMetadataCache(root = ROOT, options = {}) {
  const rows = options.rows || readRows(root);
  const cache = readExistingCache(root);

  for (const row of rows) {
    if (!cache.has(row.template_id)) {
      cache.set(row.template_id, missingEntry(row, 'not checked yet'));
    }
  }
  writeCache(root, cache);

  async function hydrateRow(row) {
    const checkedAt = new Date().toISOString();
    try {
      const payload = options.fetchTemplate
        ? await options.fetchTemplate(row)
        : await fetchJson(row.atomicassets_url, {
          timeoutMs: options.timeoutMs || 20000,
          rejectUnauthorized: options.rejectUnauthorized,
        });
      cache.set(row.template_id, metadataEntry(row, payload, checkedAt));
    } catch (error) {
      const previous = cache.get(row.template_id) || {};
      if (previous.metadata_status === 'ok' && previous.exists_on_atomicassets) {
        cache.set(row.template_id, {
          ...previous,
          error: String(error?.message || error),
          last_error_at: checkedAt,
        });
      } else {
        cache.set(row.template_id, missingEntry(row, error, previous, checkedAt));
      }
    }
  }

  const concurrency = options.concurrency || 8;
  for (let index = 0; index < rows.length; index += concurrency) {
    await Promise.all(rows.slice(index, index + concurrency).map(hydrateRow));
    writeCache(root, cache);
  }

  return {
    templates: cache.size,
    ok: [...cache.values()].filter((row) => row.metadata_status === 'ok' && row.exists_on_atomicassets).length,
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

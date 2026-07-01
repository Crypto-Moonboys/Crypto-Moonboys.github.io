#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRows, fetchJson } from './generate-gkniftyheads-rarity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COLLECTION = 'gkniftyheads';
const CACHE_RELATIVE = path.join('data', 'gkniftyheads', 'asset-state-cache.json');
const RANKS_RELATIVE = path.join('data', 'gkniftyheads', 'surviving-mint-ranks.json');
const LIMIT = 1000;
const SOURCE_URLS = {
  latest_created_assets: `https://wax.api.atomicassets.io/atomicassets/v1/assets?collection_name=${COLLECTION}&sort=created&order=desc&limit=${LIMIT}`,
  recently_updated_live_assets: `https://wax.api.atomicassets.io/atomicassets/v1/assets?collection_name=${COLLECTION}&burned=false&sort=updated&order=desc&limit=${LIMIT}`,
  recently_updated_burned_assets: `https://wax.api.atomicassets.io/atomicassets/v1/assets?collection_name=${COLLECTION}&burned=true&sort=updated&order=desc&limit=${LIMIT}`,
};

function cachePath(root = ROOT) {
  return path.join(root, CACHE_RELATIVE);
}

function ranksPath(root = ROOT) {
  return path.join(root, RANKS_RELATIVE);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readRows(root = ROOT) {
  const page = path.join(root, 'wiki', 'gkniftyheads-nft-collection.html');
  if (!fs.existsSync(page)) return [];
  return extractRows(fs.readFileSync(page, 'utf8'), root);
}

function readTemplateRows(root = ROOT, options = {}) {
  if (options.rows) return options.rows;
  const audit = readJson(path.join(root, 'data', 'gkniftyheads', 'template-integrity-audit.json'), null);
  if (audit?.included_in_rarity?.length) {
    const rarity = readJson(path.join(root, 'data', 'gkniftyheads', 'template-rarity.json'), {});
    const byId = new Map([
      ...(rarity.ranked_templates || []),
      ...(rarity.utility_open_mint_templates || []),
      ...(rarity.unissued_templates || []),
    ].map((row) => [Number(row.template_id), row]));
    return audit.included_in_rarity.map((templateId) => byId.get(Number(templateId)) || { template_id: Number(templateId), issued_supply: 0 });
  }
  const rarity = readJson(path.join(root, 'data', 'gkniftyheads', 'template-rarity.json'), null);
  if (rarity) return [
    ...(rarity.ranked_templates || []),
    ...(rarity.utility_open_mint_templates || []),
    ...(rarity.unissued_templates || []),
  ];
  return readRows(root);
}

function emptyCache() {
  return {
    collection: COLLECTION,
    generated_at: new Date().toISOString(),
    last_full_scan_at: null,
    last_delta_scan_at: null,
    last_successful_asset_update: null,
    source_urls: SOURCE_URLS,
    assets: [],
    template_state: [],
    errors: [],
  };
}

function readCache(root = ROOT) {
  const cache = readJson(cachePath(root), null);
  if (!cache) return emptyCache();
  return {
    ...emptyCache(),
    ...cache,
    source_urls: { ...SOURCE_URLS, ...(cache.source_urls || {}) },
    assets: Array.isArray(cache.assets) ? cache.assets : [],
    template_state: Array.isArray(cache.template_state) ? cache.template_state : [],
    errors: Array.isArray(cache.errors) ? cache.errors : [],
  };
}

function timestampValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 1000000000) {
    return new Date(numeric > 9999999999 ? numeric : numeric * 1000).toISOString();
  }
  return String(value);
}

function boolValue(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  return false;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAtomicAsset(asset = {}, checkedAt = new Date().toISOString()) {
  const templateId = numberValue(asset.template?.template_id ?? asset.template_id);
  const mint = numberValue(asset.template_mint ?? asset.mutable_data?.template_mint ?? asset.immutable_data?.template_mint);
  return {
    asset_id: String(asset.asset_id || ''),
    template_id: templateId,
    original_mint_number: mint,
    burned: boolValue(asset.burned),
    owner: String(asset.owner || ''),
    updated_at: timestampValue(asset.updated_at_time || asset.updated_at || asset.updated_at_block),
    created_at: timestampValue(asset.created_at_time || asset.created_at || asset.minted_at_time || asset.minted_at),
    transferred_at: timestampValue(asset.transferred_at_time || asset.transferred_at),
    last_seen_at: checkedAt,
    atomicassets_url: asset.asset_id ? `https://wax.api.atomicassets.io/atomicassets/v1/assets/${asset.asset_id}` : '',
  };
}

function assetPageUrl(sourceUrl, page) {
  const url = new URL(sourceUrl);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(LIMIT));
  return url.toString();
}

async function fetchAssetPages(sourceKey, sourceUrl, options, checkpoint) {
  const rows = [];
  const errors = [];
  const maxPages = options.maxPages || (options.forceFullScan ? 500 : 1);
  const requestJson = options.fetchJson || ((url) => fetchJson(url, {
    timeoutMs: options.timeoutMs || 20000,
    rejectUnauthorized: options.rejectUnauthorized,
  }));
  for (let page = 1; page <= maxPages; page += 1) {
    const url = assetPageUrl(sourceUrl, page);
    try {
      const payload = await requestJson(url, { sourceKey, page });
      const data = Array.isArray(payload?.data) ? payload.data : [];
      rows.push(...data);
      if (data.length < LIMIT) break;
      if (!options.forceFullScan && checkpoint) {
        const oldest = data[data.length - 1];
        const oldestUpdated = Date.parse(timestampValue(oldest?.updated_at_time || oldest?.updated_at || oldest?.created_at_time || oldest?.created_at));
        const checkpointTime = Date.parse(checkpoint);
        if (Number.isFinite(oldestUpdated) && Number.isFinite(checkpointTime) && oldestUpdated <= checkpointTime) break;
      }
    } catch (error) {
      errors.push({
        source: sourceKey,
        source_url: url,
        error: String(error?.message || error),
        last_error_at: new Date().toISOString(),
      });
      break;
    }
  }
  return { rows, errors };
}

function mergeAssets(previousAssets, incomingAssets) {
  const byId = new Map(previousAssets.filter((asset) => asset.asset_id).map((asset) => [asset.asset_id, asset]));
  for (const incoming of incomingAssets) {
    if (!incoming.asset_id || !Number.isFinite(incoming.template_id)) continue;
    const previous = byId.get(incoming.asset_id) || {};
    byId.set(incoming.asset_id, {
      ...previous,
      ...incoming,
      original_mint_number: previous.original_mint_number ?? incoming.original_mint_number,
    });
  }
  return [...byId.values()].sort((a, b) => Number(a.template_id) - Number(b.template_id) || Number(a.original_mint_number || 0) - Number(b.original_mint_number || 0) || String(a.asset_id).localeCompare(String(b.asset_id)));
}

export function buildTemplateState(assets = [], rows = [], checkedAt = new Date().toISOString()) {
  const byTemplate = new Map();
  for (const row of rows) {
    byTemplate.set(Number(row.template_id), {
      template_id: Number(row.template_id),
      issued_supply: numberValue(row.issued_supply) ?? 0,
      live_supply_from_assets: 0,
      burned_assets_count: 0,
      surviving_mint_numbers: [],
      missing_original_mint_numbers: [],
      last_asset_state_update: checkedAt,
    });
  }
  for (const asset of assets) {
    if (!Number.isFinite(Number(asset.template_id))) continue;
    const templateId = Number(asset.template_id);
    const state = byTemplate.get(templateId) || {
      template_id: templateId,
      issued_supply: 0,
      live_supply_from_assets: 0,
      burned_assets_count: 0,
      surviving_mint_numbers: [],
      missing_original_mint_numbers: [],
      last_asset_state_update: checkedAt,
    };
    const mint = Number(asset.original_mint_number);
    if (asset.burned) state.burned_assets_count += 1;
    else {
      state.live_supply_from_assets += 1;
      if (Number.isFinite(mint)) state.surviving_mint_numbers.push(mint);
    }
    state.last_asset_state_update = asset.last_seen_at || checkedAt;
    byTemplate.set(templateId, state);
  }
  for (const state of byTemplate.values()) {
    state.surviving_mint_numbers = [...new Set(state.surviving_mint_numbers)].sort((a, b) => a - b);
    if (state.issued_supply > 0 && state.surviving_mint_numbers.length + state.burned_assets_count >= state.issued_supply) {
      const known = new Set(assets.filter((asset) => Number(asset.template_id) === state.template_id).map((asset) => Number(asset.original_mint_number)).filter(Number.isFinite));
      state.missing_original_mint_numbers = Array.from({ length: state.issued_supply }, (_, index) => index + 1).filter((mint) => !known.has(mint));
    }
  }
  return [...byTemplate.values()].sort((a, b) => a.template_id - b.template_id);
}

export function buildSurvivingMintRanks(cache) {
  const byTemplate = new Map();
  for (const asset of cache.assets || []) {
    const templateId = Number(asset.template_id);
    if (!Number.isFinite(templateId)) continue;
    const group = byTemplate.get(templateId) || [];
    group.push(asset);
    byTemplate.set(templateId, group);
  }
  const templates = [...byTemplate.entries()].sort((a, b) => a[0] - b[0]).map(([templateId, assets]) => {
    const live = assets
      .filter((asset) => !asset.burned)
      .sort((a, b) => Number(a.original_mint_number || 0) - Number(b.original_mint_number || 0) || String(a.asset_id).localeCompare(String(b.asset_id)));
    const rankByAsset = new Map(live.map((asset, index) => [asset.asset_id, index + 1]));
    return {
      template_id: templateId,
      live_supply: live.length,
      burned_assets_count: assets.filter((asset) => asset.burned).length,
      assets: assets
        .slice()
        .sort((a, b) => Number(a.original_mint_number || 0) - Number(b.original_mint_number || 0) || String(a.asset_id).localeCompare(String(b.asset_id)))
        .map((asset) => ({
          asset_id: asset.asset_id,
          original_mint_number: asset.original_mint_number,
          ...(asset.burned ? {} : { surviving_mint_rank: rankByAsset.get(asset.asset_id) }),
          burned: Boolean(asset.burned),
        })),
    };
  });
  return {
    collection: COLLECTION,
    generated_at: new Date().toISOString(),
    templates,
  };
}

export async function updateGkniftyheadsAssetStateCache(root = ROOT, options = {}) {
  const checkedAt = options.checkedAt || new Date().toISOString();
  const rows = readTemplateRows(root, options);
  const previous = readCache(root);
  const isFirstRun = !fs.existsSync(cachePath(root)) || !previous.assets.length;
  const forceFullScan = Boolean(options.forceFullScan || options.fullScan || process.env.GK_FORCE_ASSET_STATE_FULL_SCAN === '1');
  const effectiveFullScan = forceFullScan || isFirstRun;
  const sources = effectiveFullScan
    ? ['latest_created_assets', 'recently_updated_live_assets', 'recently_updated_burned_assets']
    : ['latest_created_assets', 'recently_updated_live_assets', 'recently_updated_burned_assets'];
  const incoming = [];
  const errors = [];
  for (const sourceKey of sources) {
    const { rows: sourceRows, errors: sourceErrors } = await fetchAssetPages(sourceKey, SOURCE_URLS[sourceKey], {
      ...options,
      forceFullScan: effectiveFullScan,
    }, previous.last_delta_scan_at || previous.last_successful_asset_update);
    incoming.push(...sourceRows.map((asset) => normalizeAtomicAsset(asset, checkedAt)));
    errors.push(...sourceErrors);
  }

  const assets = mergeAssets(previous.assets || [], incoming);
  const cache = {
    collection: COLLECTION,
    generated_at: checkedAt,
    last_full_scan_at: effectiveFullScan && !errors.length ? checkedAt : previous.last_full_scan_at,
    last_delta_scan_at: errors.length === sources.length ? previous.last_delta_scan_at : checkedAt,
    last_successful_asset_update: incoming.length ? checkedAt : previous.last_successful_asset_update,
    source_urls: SOURCE_URLS,
    assets,
    template_state: buildTemplateState(assets, rows, checkedAt),
    errors: [
      ...errors,
      ...(errors.length ? previous.errors || [] : []),
    ].slice(0, 50),
  };
  writeJson(cachePath(root), cache);
  writeJson(ranksPath(root), buildSurvivingMintRanks(cache));
  return {
    assets: cache.assets.length,
    templates: cache.template_state.length,
    errors: errors.length,
    updated_assets: incoming.length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateGkniftyheadsAssetStateCache(ROOT, {
    forceFullScan: process.argv.includes('--full-scan'),
  })
    .then((result) => console.log(`GKniftyHEADS asset-state cache: ${result.assets} assets, ${result.templates} templates, ${result.updated_assets} updates, ${result.errors} source errors.`))
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

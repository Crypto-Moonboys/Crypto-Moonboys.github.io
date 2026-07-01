#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAtomicCollectionStatsSanity, readMarketAnalytics, renderMarketAnalyticsSection, updateNftMarketAnalytics } from './nft-market-analytics.mjs';
import { createFeedStatus, fetchJson as fetchSiteJson, findFeed, writeFeedStatus } from './site-feed-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const COLLECTION = 'noballgamess';
export const COLLECTION_TITLE = 'NoBallGames';
export const FEED_ID = 'noballgamess_rarity';
export const DATA_DIR = path.join('data', COLLECTION);
export const PAGE_PATH = path.join('wiki', 'noballgamess-nft-collection.html');
export const ATOMIC_BASE = 'https://wax.api.atomicassets.io/atomicassets/v1';
const DEFAULT_METADATA_MAX_AGE_HOURS = 24 * 30;

const DELTA_ENDPOINTS = {
  latest_created_assets: `${ATOMIC_BASE}/assets?collection_name=${COLLECTION}&sort=created&order=desc&limit=1000`,
  recently_updated_live_assets: `${ATOMIC_BASE}/assets?collection_name=${COLLECTION}&burned=false&sort=updated&order=desc&limit=1000`,
  recently_updated_burned_assets: `${ATOMIC_BASE}/assets?collection_name=${COLLECTION}&burned=true&sort=updated&order=desc&limit=1000`,
};

const SCORING_CONTRACT = {
  source_of_truth: 'AtomicAssets',
  atomichub_usage: 'reference_links_only',
  price_used: false,
  market_data_used: false,
  adaptive_weighting: true,
  base_score_weights: {
    live_supply_scarcity: 50,
    rarity_trait_or_name_exposure_scarcity: 25,
    variation_trait_or_metadata_exposure_scarcity: 20,
    missing_burned_supply_bonus: 5,
  },
  thin_metadata_rule: 'Trait weights are reassigned to live supply scarcity when rarity or variation metadata is missing, generic, repeated, or not meaningful.',
  burn_missing_rule: 'Burns increase rarity through lower live supply and a small missing/burned supply bonus when supported by tracker data.',
  disallowed_score_inputs: [
    'price',
    'floor_price',
    'sales',
    'last_sale',
    'listing_count',
    'marketplace_listing_count',
    'market_cap',
    'volume',
    'AtomicHub listing counts',
  ],
};

const RARITY_TRAIT_KEYS = ['rarity', 'Rarity', 'tier', 'Tier', 'type', 'Type', 'category', 'Category'];
const VARIATION_TRAIT_KEYS = ['variation', 'Variation', 'variant', 'Variant', 'edition', 'Edition', 'background', 'Background', 'artist', 'Artist'];

function isMeaningfulTrait(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (['not supplied', 'unknown', 'none', 'n/a', 'na', 'null', 'undefined'].includes(normalized)) return false;
  if (/^template\s*#?\d+$/i.test(normalized)) return false;
  return true;
}

function pickTrait(template, keys, fallbackValue = null, fallbackSource = null) {
  for (const key of keys) {
    const value = template.immutable_data?.[key];
    if (isMeaningfulTrait(value)) {
      return { value: String(value).trim(), source: `immutable_data.${key}` };
    }
  }
  if (isMeaningfulTrait(fallbackValue)) {
    return { value: String(fallbackValue).trim(), source: fallbackSource };
  }
  return { value: 'Not supplied', source: 'not_supplied' };
}

function traitLayerHasMeaning(rows, traitKey) {
  const values = rows
    .map((row) => String(row[traitKey] ?? '').trim())
    .filter(isMeaningfulTrait)
    .map((value) => value.toLowerCase());
  return values.length > 0 && new Set(values).size > 1;
}

function adaptiveWeights(rarityEnabled, variationEnabled) {
  if (rarityEnabled && variationEnabled) return { supplyScore: 50, rarityScore: 25, variationScore: 20, burnScore: 5 };
  if (rarityEnabled) return { supplyScore: 70, rarityScore: 25, variationScore: 0, burnScore: 5 };
  if (variationEnabled) return { supplyScore: 75, rarityScore: 0, variationScore: 20, burnScore: 5 };
  return { supplyScore: 95, rarityScore: 0, variationScore: 0, burnScore: 5 };
}

function exposure(rows, traitKey) {
  const map = new Map();
  for (const row of rows.filter((entry) => isMeaningfulTrait(entry[traitKey]))) {
    const trait = row[traitKey];
    const current = map.get(trait) || { trait, template_count: 0, exposure_supply: 0 };
    current.template_count += 1;
    current.exposure_supply += row.live_supply || 0;
    map.set(trait, current);
  }
  return [...map.values()].sort((a, b) => a.exposure_supply - b.exposure_supply || a.template_count - b.template_count || a.trait.localeCompare(b.trait));
}

function rootPath(root, relativePath) {
  return path.join(root, relativePath);
}

function readJson(root, relativePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(rootPath(root, relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(root, relativePath, value) {
  const target = rootPath(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return value;
}

function writeText(root, relativePath, value) {
  const target = rootPath(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value, 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(root, relativePath, rows, columns) {
  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','));
  writeText(root, relativePath, `${[header, ...lines].join('\n')}\n`);
}

function atomicTemplateUrl(templateId) {
  return `${ATOMIC_BASE}/templates/${COLLECTION}/${templateId}`;
}

function atomichubUrl(templateId = '') {
  const suffix = templateId ? `&template_id=${encodeURIComponent(templateId)}` : '';
  return `https://wax.atomichub.io/market?collection_name=${COLLECTION}${suffix}`;
}

function ipfsSources(value) {
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (/^https?:\/\//i.test(trimmed)) return [trimmed];
  const cid = trimmed.replace(/^ipfs:\/\//i, '').replace(/^\/?ipfs\//i, '').split(/[/?#]/)[0];
  if (!cid) return [];
  return [
    `https://ipfs.hivebp.io/ipfs/${cid}`,
    `https://atomichub-ipfs.com/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://nftstorage.link/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
  ];
}

function imageCandidates(immutable = {}) {
  const fields = ['img', 'image', 'image_url', 'video'];
  const candidates = [];
  for (const field of fields) {
    for (const source of ipfsSources(immutable[field])) candidates.push(source);
  }
  return [...new Set(candidates)];
}

function normalizeAtomicTemplate(raw, metadataFetchMode = 'single_template') {
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const immutable = data?.immutable_data && typeof data.immutable_data === 'object' ? data.immutable_data : {};
  const templateId = toNumber(data?.template_id);
  const imageSources = imageCandidates(immutable);
  return {
    template_id: templateId,
    title: immutable.name || data?.name || `NoBallGames Template ${templateId}`,
    issued_supply: toNumber(data?.issued_supply),
    max_supply: toNumber(data?.max_supply),
    schema_name: data?.schema_name || data?.schema?.schema_name || null,
    immutable_data: immutable,
    immutable_data_image_fields: {
      img: immutable.img || null,
      image: immutable.image || null,
      video: immutable.video || null,
    },
    image_url: imageSources[0] || null,
    image_sources: imageSources,
    atomichub_url: atomichubUrl(templateId),
    atomicassets_url: atomicTemplateUrl(templateId),
    exists_on_atomicassets: true,
    metadata_status: 'ok',
    metadata_fetch_mode: metadataFetchMode,
    last_checked_at: nowIso(),
  };
}

function parseCount(payload) {
  const candidates = [payload?.data, payload?.count, payload?.data?.count];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error('AtomicAssets count payload did not include a numeric count.');
}

async function defaultFetchJson(url) {
  return fetchSiteJson(url, { timeoutMs: 20000 });
}

async function fetchAllTemplatePages(fetchJson) {
  const templates = [];
  for (let page = 1; page < 100; page += 1) {
    const url = `${ATOMIC_BASE}/templates?collection_name=${COLLECTION}&limit=1000&page=${page}`;
    const payload = await fetchJson(url, { sourceKey: 'templates' });
    const pageRows = asArray(payload?.data);
    templates.push(...pageRows);
    if (pageRows.length < 1000) break;
  }
  return templates;
}

function isFreshConfirmed(entry, maxAgeHours = DEFAULT_METADATA_MAX_AGE_HOURS) {
  if (!entry || entry.metadata_status !== 'ok' || !entry.exists_on_atomicassets) return false;
  const checkedAt = Date.parse(entry.last_checked_at || '');
  return Number.isFinite(checkedAt) && Date.now() - checkedAt <= maxAgeHours * 60 * 60 * 1000;
}

function templateBatchUrl(rows) {
  const ids = rows.map((row) => Number(row.template_id)).filter(Number.isFinite).join(',');
  return `${ATOMIC_BASE}/templates?collection_name=${COLLECTION}&ids=${ids}&limit=1000`;
}

function batchPayloadRows(payload) {
  if (!Array.isArray(payload?.data)) throw new Error('AtomicAssets template ids batch response did not include data array');
  return payload.data;
}

export async function updateNoballgamessTemplateMetadataCache(root = ROOT, options = {}) {
  const fetchJson = options.fetchJson || defaultFetchJson;
  const generatedAt = nowIso();
  const previous = readJson(root, `${DATA_DIR}/template-metadata-cache.json`, { templates: [] });
  const previousById = new Map(asArray(previous.templates).map((row) => [Number(row.template_id), row]));
  const forceRefresh = options.forceRefresh || options.refreshAll || process.env.NBG_FORCE_TEMPLATE_METADATA_REFRESH === '1';
  const forceDiscover = options.forceDiscover || !previousById.size;
  const maxAgeHours = options.maxAgeHours || DEFAULT_METADATA_MAX_AGE_HOURS;
  const rows = options.templates || (forceDiscover ? await fetchAllTemplatePages(fetchJson) : asArray(previous.templates));
  const templatesById = new Map(asArray(previous.templates).map((row) => [Number(row.template_id), row]));
  const errors = [];
  for (const raw of rows) {
    try {
      const templateId = Number(raw?.template_id);
      if (!Number.isFinite(templateId) || templateId <= 0) continue;
      const previousRow = previousById.get(templateId);
      if (!forceRefresh && isFreshConfirmed(previousRow, maxAgeHours)) {
        templatesById.set(templateId, {
          ...previousRow,
          metadata_fetch_mode: 'cached_confirmed',
        });
        continue;
      }
      templatesById.set(templateId, {
        ...previousRow,
        ...raw,
        template_id: templateId,
        metadata_status: previousRow?.metadata_status || 'pending',
      });
    } catch (error) {
      errors.push({ error: error.message || String(error), raw_template_id: raw?.template_id || null });
    }
  }
  const rowsToRefresh = rows.filter((raw) => {
    const templateId = Number(raw?.template_id);
    return Number.isFinite(templateId) && (forceRefresh || !isFreshConfirmed(previousById.get(templateId), maxAgeHours));
  });
  const hydratedByBatch = new Set();
  let batchAttempts = 0;
  let batchFallbacks = 0;
  let singleFallbacks = 0;

  if (rowsToRefresh.length) {
    batchAttempts += 1;
    try {
      const payload = options.fetchTemplatesBatch
        ? await options.fetchTemplatesBatch(rowsToRefresh, templateBatchUrl(rowsToRefresh))
        : await fetchJson(templateBatchUrl(rowsToRefresh), { sourceKey: 'templates_batch' });
      const byTemplateId = new Map(batchPayloadRows(payload).map((entry) => [Number(entry.template_id), entry]));
      for (const raw of rowsToRefresh) {
        const templateId = Number(raw.template_id);
        const batchTemplate = byTemplateId.get(templateId);
        if (!batchTemplate) continue;
        const normalized = normalizeAtomicTemplate(batchTemplate, 'batch_ids');
        if (normalized.template_id > 0) {
          templatesById.set(normalized.template_id, normalized);
          hydratedByBatch.add(normalized.template_id);
        }
      }
    } catch (error) {
      batchFallbacks += 1;
      errors.push({ source_key: 'templates_batch', error: error.message || String(error) });
    }
  }

  for (const raw of rowsToRefresh.filter((row) => !hydratedByBatch.has(Number(row.template_id)))) {
    const templateId = Number(raw.template_id);
    try {
      const payload = options.fetchTemplate
        ? await options.fetchTemplate(raw)
        : await fetchJson(atomicTemplateUrl(templateId), { sourceKey: `template:${templateId}` });
      const normalized = normalizeAtomicTemplate(payload, rowsToRefresh.length ? 'single_template_fallback' : 'single_template');
      if (normalized.template_id > 0) templatesById.set(normalized.template_id, normalized);
      singleFallbacks += 1;
    } catch (error) {
      const previousRow = previousById.get(templateId);
      if (previousRow?.metadata_status === 'ok' && previousRow.exists_on_atomicassets) {
        templatesById.set(templateId, {
          ...previousRow,
          metadata_fetch_mode: previousRow.metadata_fetch_mode || 'cached_confirmed',
          last_error_at: generatedAt,
          error: error.message || String(error),
        });
      } else {
        templatesById.set(templateId, {
          ...previousRow,
          template_id: templateId,
          metadata_status: 'error',
          exists_on_atomicassets: false,
          metadata_fetch_mode: 'single_template_fallback',
          last_checked_at: generatedAt,
          error: error.message || String(error),
        });
      }
      errors.push({ source_key: `template:${templateId}`, error: error.message || String(error) });
    }
  }

  const templates = [...templatesById.values()]
    .filter((row) => Number(row.template_id) > 0)
    .sort((a, b) => a.template_id - b.template_id);
  if (!templates.length && previous.templates?.length) {
    writeJson(root, `${DATA_DIR}/template-metadata-cache.json`, {
      ...previous,
      generated_at: generatedAt,
      metadata_status: 'preserved_previous_cache',
      errors: [{ source_key: 'templates', error: 'No templates fetched; previous cache preserved.' }, ...asArray(previous.errors)],
    });
    return { templates: previous.templates.length, ok: previous.templates.filter((row) => row.metadata_status === 'ok').length, preserved: true };
  }
  const cache = {
    collection: COLLECTION,
    source: 'AtomicAssets templates API',
    generated_at: generatedAt,
    metadata_fetch_summary: {
      batch_attempts: batchAttempts,
      batch_fallbacks: batchFallbacks,
      single_template_fallbacks: singleFallbacks,
      cached_confirmed: templates.filter((row) => row.metadata_fetch_mode === 'cached_confirmed').length,
    },
    templates,
    errors,
  };
  writeJson(root, `${DATA_DIR}/template-metadata-cache.json`, cache);
  writeTemplateIntegrityAudit(root, cache.templates, []);
  return {
    templates: cache.templates.length,
    ok: cache.templates.filter((row) => row.metadata_status === 'ok').length,
    errors: errors.length,
    batch_attempts: batchAttempts,
    batch_fallbacks: batchFallbacks,
    single_fallbacks: singleFallbacks,
    cached_confirmed: cache.metadata_fetch_summary.cached_confirmed,
  };
}

function writeTemplateIntegrityAudit(root, templates, excluded = []) {
  const groups = new Map();
  for (const template of templates) {
    const imageKey = (template.immutable_data_image_fields?.img || template.image_url || '').toLowerCase();
    const titleKey = String(template.title || '').trim().toLowerCase();
    const key = `${titleKey}|${imageKey}`;
    if (!titleKey || !imageKey) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      template_id: template.template_id,
      issued_supply: template.issued_supply,
      max_supply: template.max_supply,
      title: template.title,
      image_url: template.image_url,
      exists_on_atomicassets: true,
    });
  }
  const duplicateGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((templatesInGroup) => ({ templates: templatesInGroup }));
  return writeJson(root, `${DATA_DIR}/template-integrity-audit.json`, {
    collection: COLLECTION,
    generated_at: nowIso(),
    source: 'AtomicAssets API is the source of truth; AtomicHub links are reference links only.',
    total_local_templates: templates.length,
    total_atomicassets_confirmed_templates: templates.length,
    missing_from_atomicassets: [],
    duplicate_title_image_groups: duplicateGroups,
    local_page_conflicts: [],
    included_in_rarity: templates.map((row) => row.template_id),
    excluded_from_rarity: excluded,
  });
}

export async function updateNoballgamessLiveSupplyCache(root = ROOT, options = {}) {
  const fetchJson = options.fetchJson || defaultFetchJson;
  const metadata = readJson(root, `${DATA_DIR}/template-metadata-cache.json`, { templates: [] });
  const previous = readJson(root, `${DATA_DIR}/live-template-supply.json`, { supplies: [] });
  const byId = new Map(asArray(previous.supplies).map((row) => [row.template_id, row]));
  const supplies = [];
  const errors = [];
  for (const template of asArray(metadata.templates)) {
    const sourceUrl = `${ATOMIC_BASE}/assets/_count?collection_name=${COLLECTION}&template_id=${template.template_id}`;
    try {
      const payload = await fetchJson(sourceUrl, { sourceKey: `live_count:${template.template_id}` });
      const liveSupply = parseCount(payload);
      supplies.push({
        template_id: template.template_id,
        issued_supply: template.issued_supply,
        live_supply: liveSupply,
        listed_supply: null,
        pre_baseline_missing_or_burned: Math.max(0, template.issued_supply - liveSupply),
        live_supply_status: 'ok',
        last_checked_at: nowIso(),
        source_url: sourceUrl,
        error: null,
      });
    } catch (error) {
      const previousRow = byId.get(template.template_id);
      const fallbackLive = previousRow?.live_supply ?? template.issued_supply;
      const row = {
        template_id: template.template_id,
        issued_supply: template.issued_supply,
        live_supply: fallbackLive,
        listed_supply: null,
        pre_baseline_missing_or_burned: previousRow?.pre_baseline_missing_or_burned ?? null,
        live_supply_status: previousRow?.live_supply_status === 'ok' ? 'preserved_previous_ok' : 'issued_supply_fallback',
        last_checked_at: previousRow?.last_checked_at || null,
        source_url: sourceUrl,
        error: error.message || String(error),
      };
      errors.push({ template_id: template.template_id, source_key: `live_count:${template.template_id}`, source_url: sourceUrl, error: row.error });
      supplies.push(row);
    }
    writeJson(root, `${DATA_DIR}/live-template-supply.json`, {
      collection: COLLECTION,
      generated_at: nowIso(),
      supplies: supplies.concat(asArray(metadata.templates).slice(supplies.length).map((row) => byId.get(row.template_id) || {
        template_id: row.template_id,
        issued_supply: row.issued_supply,
        live_supply: row.issued_supply,
        live_supply_status: 'pending',
      })),
      errors,
    });
  }
  writeJson(root, `${DATA_DIR}/live-template-supply.json`, {
    collection: COLLECTION,
    generated_at: nowIso(),
    supplies,
    errors,
  });
  return { templates: supplies.length, ok: supplies.filter((row) => row.live_supply_status === 'ok').length, errors: errors.length };
}

function normalizeAsset(raw) {
  const templateId = toNumber(raw?.template?.template_id || raw?.template_id);
  const originalMint = toNumber(raw?.template_mint || raw?.mint_number || raw?.original_mint_number, null);
  return {
    asset_id: String(raw?.asset_id || ''),
    template_id: templateId,
    original_mint_number: originalMint,
    burned: raw?.burned === true || raw?.burned === 'true',
    owner: raw?.owner || null,
    updated_at: raw?.updated_at_time || raw?.updated_at || raw?.transferred_at_time || null,
    minted_at: raw?.created_at_time || raw?.created_at || null,
    last_seen_at: nowIso(),
  };
}

function computeSurvivingRanks(assets) {
  const byTemplate = new Map();
  for (const asset of assets.filter((row) => !row.burned && row.original_mint_number != null)) {
    if (!byTemplate.has(asset.template_id)) byTemplate.set(asset.template_id, []);
    byTemplate.get(asset.template_id).push(asset);
  }
  const templates = [];
  for (const [templateId, rows] of byTemplate) {
    rows.sort((a, b) => a.original_mint_number - b.original_mint_number);
    templates.push({
      template_id: templateId,
      live_assets: rows.length,
      assets: rows.map((row, index) => ({
        asset_id: row.asset_id,
        original_mint_number: row.original_mint_number,
        surviving_mint_rank: index + 1,
      })),
    });
  }
  return { collection: COLLECTION, generated_at: nowIso(), templates: templates.sort((a, b) => a.template_id - b.template_id) };
}

async function fetchAssetPages(url, fetchJson, sourceKey) {
  const rows = [];
  for (let page = 1; page < 100; page += 1) {
    const separator = url.includes('?') ? '&' : '?';
    const pagedUrl = `${url}${separator}page=${page}`;
    const payload = await fetchJson(pagedUrl, { sourceKey });
    const pageRows = asArray(payload?.data);
    rows.push(...pageRows);
    if (pageRows.length < 1000) break;
  }
  return rows;
}

export async function updateNoballgamessAssetStateCache(root = ROOT, options = {}) {
  const fetchJson = options.fetchJson || defaultFetchJson;
  const metadata = readJson(root, `${DATA_DIR}/template-metadata-cache.json`, { templates: [] });
  const previous = readJson(root, `${DATA_DIR}/asset-state-cache.json`, { assets: [], errors: [] });
  const cursor = readJson(root, `${DATA_DIR}/asset-refresh-cursor.json`, {
    collection: COLLECTION,
    batch_size: 20,
    last_template_batch_index: 0,
    last_run_at: null,
    mode: 'daily_rotating_backfill',
  });
  const assets = new Map(asArray(previous.assets).map((row) => [row.asset_id, row]));
  const errors = [];
  for (const [sourceKey, sourceUrl] of Object.entries(DELTA_ENDPOINTS)) {
    try {
      for (const raw of await fetchAssetPages(sourceUrl, fetchJson, sourceKey)) {
        const asset = normalizeAsset(raw);
        if (asset.asset_id) assets.set(asset.asset_id, { ...assets.get(asset.asset_id), ...asset });
      }
    } catch (error) {
      errors.push({ source_key: sourceKey, source_url: sourceUrl, error: error.message || String(error) });
    }
  }
  const templateIds = asArray(metadata.templates).map((row) => row.template_id).sort((a, b) => a - b);
  const batchSize = Number(options.batchSize || cursor.batch_size || 20);
  const start = Number(cursor.last_template_batch_index || 0) % Math.max(1, templateIds.length || 1);
  const batch = templateIds.length ? Array.from({ length: Math.min(batchSize, templateIds.length) }, (_, index) => templateIds[(start + index) % templateIds.length]) : [];
  const failedTemplateIds = [];
  for (const templateId of batch) {
    const sourceUrl = `${ATOMIC_BASE}/assets?collection_name=${COLLECTION}&template_id=${templateId}&limit=1000&order=asc&sort=template_mint`;
    try {
      for (const raw of await fetchAssetPages(sourceUrl, fetchJson, `template_assets_backfill:${templateId}`)) {
        const asset = normalizeAsset(raw);
        if (asset.asset_id) assets.set(asset.asset_id, { ...assets.get(asset.asset_id), ...asset });
      }
    } catch (error) {
      failedTemplateIds.push(templateId);
      errors.push({ template_id: templateId, source_key: `template_assets_backfill:${templateId}`, source_url: sourceUrl, error: error.message || String(error) });
    }
  }
  const assetRows = [...assets.values()].sort((a, b) => a.template_id - b.template_id || (a.original_mint_number || 0) - (b.original_mint_number || 0));
  const templateState = templateIds.map((templateId) => {
    const templateAssets = assetRows.filter((row) => row.template_id === templateId);
    return {
      template_id: templateId,
      live_supply_from_asset_state: templateAssets.filter((row) => !row.burned).length,
      burned_assets_count: templateAssets.filter((row) => row.burned).length,
      assets_seen: templateAssets.length,
    };
  });
  writeJson(root, `${DATA_DIR}/asset-state-cache.json`, {
    collection: COLLECTION,
    generated_at: nowIso(),
    source_urls: {
      ...DELTA_ENDPOINTS,
      template_assets_backfill: `${ATOMIC_BASE}/assets?collection_name=${COLLECTION}&template_id={template_id}&limit=1000&order=asc&sort=template_mint`,
    },
    assets: assetRows,
    template_state: templateState,
    errors,
  });
  writeJson(root, `${DATA_DIR}/surviving-mint-ranks.json`, computeSurvivingRanks(assetRows));
  const nextIndex = failedTemplateIds.length ? start : (start + batch.length) % Math.max(1, templateIds.length || 1);
  writeJson(root, `${DATA_DIR}/asset-refresh-cursor.json`, {
    collection: COLLECTION,
    batch_size: batchSize,
    last_template_batch_index: nextIndex,
    last_run_at: nowIso(),
    mode: 'daily_rotating_backfill',
    failed_template_ids: failedTemplateIds,
  });
  return { assets: assetRows.length, templates: templateState.length, errors: errors.length };
}

function isUtilityOrOpenMint(template) {
  const text = `${template.title || ''} ${template.schema_name || ''} ${JSON.stringify(template.immutable_data || {})}`.toLowerCase();
  if (template.max_supply === 0) return true;
  return /\b(coupon|redeem|blend|farm|drop|base card|utility)\b/.test(text);
}

function bandFor(row, index, nonLegendaryTotal) {
  if (row.live_supply === 1) return 'Legendary';
  const nonLegendaryIndex = index + 1;
  const ultra = Math.max(1, Math.ceil(nonLegendaryTotal * 0.08));
  const rare = ultra + Math.max(1, Math.ceil(nonLegendaryTotal * 0.17));
  const uncommon = rare + Math.max(1, Math.ceil(nonLegendaryTotal * 0.30));
  if (nonLegendaryIndex <= ultra) return 'Ultra Rare';
  if (nonLegendaryIndex <= rare) return 'Rare';
  if (nonLegendaryIndex <= uncommon) return 'Uncommon';
  return 'Common';
}

function buildRows(root) {
  const metadata = readJson(root, `${DATA_DIR}/template-metadata-cache.json`, { templates: [] });
  const live = readJson(root, `${DATA_DIR}/live-template-supply.json`, { supplies: [] });
  const assetState = readJson(root, `${DATA_DIR}/asset-state-cache.json`, { template_state: [] });
  const supplyById = new Map(asArray(live.supplies).map((row) => [row.template_id, row]));
  const assetStateById = new Map(asArray(assetState.template_state).map((row) => [row.template_id, row]));
  const rows = asArray(metadata.templates).map((template) => {
    const supply = supplyById.get(template.template_id);
    const supplyOk = supply?.live_supply_status === 'ok' || supply?.live_supply_status === 'preserved_previous_ok';
    const liveSupply = supplyOk ? toNumber(supply.live_supply) : toNumber(template.issued_supply);
    const state = assetStateById.get(template.template_id) || {};
    const rarityTrait = pickTrait(template, RARITY_TRAIT_KEYS);
    const variationTrait = pickTrait(template, VARIATION_TRAIT_KEYS, template.schema_name, 'schema_name');
    return {
      ...template,
      issued_supply: toNumber(template.issued_supply),
      max_supply: toNumber(template.max_supply),
      live_supply: liveSupply,
      live_supply_status: supply?.live_supply_status || 'issued_supply_fallback',
      pre_baseline_missing_or_burned: supply?.pre_baseline_missing_or_burned ?? null,
      missing_or_burned_count: supply?.pre_baseline_missing_or_burned ?? null,
      live_supply_from_asset_state: state.live_supply_from_asset_state ?? null,
      burned_assets_count: state.burned_assets_count ?? null,
      asset_state_status: state.live_supply_from_asset_state == null || state.live_supply_from_asset_state === liveSupply ? 'ok' : 'asset_state_mismatch',
      rarity_trait: rarityTrait.value,
      rarity_trait_source: rarityTrait.source,
      variation_trait: variationTrait.value,
      variation_trait_source: variationTrait.source,
      price_used: false,
      market_data_used: false,
    };
  });
  const unissued = rows.filter((row) => row.issued_supply <= 0);
  const utility = rows.filter((row) => row.issued_supply > 0 && isUtilityOrOpenMint(row));
  const ranked = rows.filter((row) => row.issued_supply > 0 && !isUtilityOrOpenMint(row) && row.max_supply > 0);
  const rarityLayerEnabled = traitLayerHasMeaning(ranked, 'rarity_trait');
  const variationLayerEnabled = traitLayerHasMeaning(ranked, 'variation_trait');
  const rarityExposure = exposure(ranked, 'rarity_trait');
  const variationExposure = exposure(ranked, 'variation_trait');
  const rarityByTrait = new Map(rarityExposure.map((row) => [row.trait, row]));
  const variationByTrait = new Map(variationExposure.map((row) => [row.trait, row]));
  const liveSupplies = ranked.map((row) => row.live_supply).filter((value) => value > 0);
  const maxSupply = Math.max(...liveSupplies, 1);
  const maxRarityExposure = Math.max(...rarityExposure.map((row) => row.exposure_supply), 1);
  const maxVariationExposure = Math.max(...variationExposure.map((row) => row.exposure_supply), 1);

  for (const row of ranked) {
    const rarityEnabled = rarityLayerEnabled && isMeaningfulTrait(row.rarity_trait);
    const variationEnabled = variationLayerEnabled && isMeaningfulTrait(row.variation_trait);
    const weights = adaptiveWeights(rarityEnabled, variationEnabled);
    const rarity = rarityByTrait.get(row.rarity_trait);
    const variation = variationByTrait.get(row.variation_trait);
    row.rarity_trait_scoring_enabled = rarityEnabled;
    row.variation_trait_scoring_enabled = variationEnabled;
    row.score_weights_used = weights;
    row.rarity_live_exposure = rarity?.exposure_supply || row.live_supply;
    row.variation_live_exposure = variation?.exposure_supply || row.live_supply;
    const supplyScore = 1 - ((row.live_supply - 1) / Math.max(maxSupply - 1, 1));
    const rarityScore = rarityEnabled ? 1 - ((row.rarity_live_exposure - 1) / Math.max(maxRarityExposure - 1, 1)) : 0;
    const variationScore = variationEnabled ? 1 - ((row.variation_live_exposure - 1) / Math.max(maxVariationExposure - 1, 1)) : 0;
    const hasBurnProof = row.live_supply_status === 'ok' || row.live_supply_status === 'preserved_previous_ok';
    const burnScore = hasBurnProof && row.issued_supply > 0 ? Math.max(0, Number(row.missing_or_burned_count || 0)) / row.issued_supply : 0;
    row.missing_burned_percentage = Number(burnScore.toFixed(6));
    row.supply_score_component = Number((supplyScore * weights.supplyScore).toFixed(4));
    row.rarity_score_component = Number((rarityScore * weights.rarityScore).toFixed(4));
    row.variation_score_component = Number((variationScore * weights.variationScore).toFixed(4));
    row.burn_score_component = Number((burnScore * weights.burnScore).toFixed(4));
    row.final_score = Number((row.supply_score_component + row.rarity_score_component + row.variation_score_component + row.burn_score_component).toFixed(4));
    row.rarity_score = row.final_score;
    row.supply_used_for_scoring = row.live_supply;
  }
  ranked.sort((a, b) => {
    const aOneOfOne = a.live_supply === 1 ? 1 : 0;
    const bOneOfOne = b.live_supply === 1 ? 1 : 0;
    return bOneOfOne - aOneOfOne || b.final_score - a.final_score || a.live_supply - b.live_supply || a.template_id - b.template_id;
  });
  const nonLegendary = ranked.filter((row) => row.live_supply !== 1);
  ranked.forEach((row, index) => {
    row.rank = index + 1;
    row.rarity_band = row.live_supply === 1
      ? 'Legendary'
      : bandFor(row, nonLegendary.indexOf(row), nonLegendary.length);
  });
  return { ranked, utility, unissued, allRows: rows, rarityExposure, variationExposure };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function safeImageUrl(row = {}) {
  const candidates = [
    row.thumbnail_url,
    row.atomicassets_image_url,
    row.image_url,
    ...asArray(row.image_sources),
  ].filter(Boolean);
  return candidates.find((url) => {
    const value = String(url);
    if (/\/img\/gkniftyheads\//i.test(value)) return false;
    if (/\/img\/noballgames(?:\/|-)|\/img\/noballgame(?:\/|-)/i.test(value)) return false;
    return /^\/img\/noballgamess\/thumbs\/[^?#]+\.(webp|jpg|jpeg|png)$/i.test(value)
      || /^https:\/\/(ipfs\.hivebp\.io|atomichub-ipfs\.com|ipfs\.io|gateway\.pinata\.cloud|nftstorage\.link|dweb\.link)\/ipfs\/[A-Za-z0-9]+/i.test(value);
  }) || '';
}

function renderTemplateCell(row, options = {}) {
  const imageSrc = safeImageUrl(row);
  const title = row.title || `Template ${row.template_id}`;
  const href = row.atomichub_url || row.atomicassets_url || '#';
  const meta = [
    options.rank ? `Rank #${row.rank}` : '',
    options.band ? row.rarity_band : '',
    options.status || '',
    row.template_id ? `Template #${row.template_id}` : '',
  ].filter(Boolean).join(' · ');
  const image = imageSrc
    ? `<a class="nft-template-image-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><img class="nft-thumb" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(title)} NFT artwork" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : '<div class="nft-thumb-placeholder" aria-label="Image unavailable">Image unavailable</div>';
  return `<div class="nft-template-cell">
      ${image}
      <div class="nft-template-cell-copy">
        <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
      </div>
    </div>`;
}

function renderRows(rows, ranked = false) {
  if (!rows.length) return '<tr><td colspan="12">Pending first AtomicAssets sync.</td></tr>';
  return rows.map((row) => `<tr>
    <td>${renderTemplateCell(row, { rank: ranked, band: ranked, status: ranked ? '' : row.max_supply === 0 ? 'Utility / Open Mint' : row.issued_supply <= 0 ? 'Unissued' : '' })}</td>
    <td>${escapeHtml(row.template_id)}</td>
    <td>${escapeHtml(row.issued_supply)}</td>
    <td>${escapeHtml(row.live_supply)}</td>
    <td>${row.pre_baseline_missing_or_burned == null ? 'Not counted' : escapeHtml(row.pre_baseline_missing_or_burned)}</td>
    <td>${escapeHtml(row.rarity_trait || 'Not supplied')}</td>
    <td>${escapeHtml(row.rarity_trait_scoring_enabled === true ? 'yes' : row.rarity_trait_scoring_enabled === false ? 'no' : 'n/a')}</td>
    <td>${escapeHtml(row.variation_trait || 'Not supplied')}</td>
    <td>${escapeHtml(row.variation_trait_scoring_enabled === true ? 'yes' : row.variation_trait_scoring_enabled === false ? 'no' : 'n/a')}</td>
    <td>${escapeHtml(row.score_weights_used ? JSON.stringify(row.score_weights_used) : '')}</td>
    <td>${escapeHtml(row.final_score ?? '')}</td>
    <td>${escapeHtml(row.asset_state_status || 'pending')}</td>
  </tr>`).join('\n');
}

function renderStatCards(stats) {
  return `<div class="wiki-rabbit-grid">
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${escapeHtml(stats.total_templates || 0)}</span><span class="wiki-rabbit-card-desc">AtomicAssets-confirmed templates</span></div>
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${escapeHtml(stats.ranked_templates || 0)}</span><span class="wiki-rabbit-card-desc">ranked fixed-supply templates</span></div>
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${escapeHtml(stats.utility_open_mint_templates || 0)}</span><span class="wiki-rabbit-card-desc">utility/open mint templates</span></div>
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${escapeHtml(stats.unissued_templates || 0)}</span><span class="wiki-rabbit-card-desc">unissued templates</span></div>
          </div>`;
}

function renderTraitExposureRows(rows) {
  if (!rows.length) return '<tr><td colspan="3">Pending trait exposure sync.</td></tr>';
  return rows.slice(0, 12).map((row) => `<tr>
    <td>${escapeHtml(row.schema_name || 'unknown')}</td>
    <td>${escapeHtml(row.templates || 0)}</td>
    <td>${escapeHtml(row.live_supply || 0)}</td>
  </tr>`).join('\n');
}

function renderHolderRows(rows) {
  if (!rows.length) return '<tr><td colspan="2">Pending holder snapshot sync.</td></tr>';
  return rows.slice(0, 12).map((row) => `<tr>
    <td>${escapeHtml(row.owner || 'unknown')}</td>
    <td>${escapeHtml(row.live_assets || 0)}</td>
  </tr>`).join('\n');
}

function renderAssetRarityRows(rows) {
  if (!rows.length) return '<tr><td colspan="5">Pending asset rarity sync.</td></tr>';
  return rows.slice(0, 12).map((row) => `<tr>
    <td>${renderTemplateCell(row, { status: row.rarity_band || '' })}</td>
    <td>${escapeHtml(row.asset_id || '')}</td>
    <td>${escapeHtml(row.template_id || '')}</td>
    <td>${escapeHtml(row.original_mint_number ?? '')}</td>
    <td>${escapeHtml(row.surviving_mint_rank ?? '')}</td>
  </tr>`).join('\n');
}

function renderPage(root, data, supplemental = {}) {
  const status = readJson(root, `${DATA_DIR}/sync-status.json`, { status: 'pending' });
  const stats = supplemental.templateStats || {
    total_templates: data.allRows.length,
    ranked_templates: data.ranked.length,
    utility_open_mint_templates: data.utility.length,
    unissued_templates: data.unissued.length,
  };
  const traitExposure = supplemental.traitExposure || { schemas: [] };
  const holderLeaderboard = supplemental.holderLeaderboard || { holders: [] };
  const assetRarityLeaderboard = supplemental.assetRarityLeaderboard || { assets: [] };
  const marketAnalytics = supplemental.marketAnalytics || readMarketAnalytics(root, COLLECTION);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NoBallGames NFT Collection Tracker | Crypto Moonboys Wiki</title>
  <meta name="description" content="NoBallGames / NoBallGamess AtomicAssets template rarity, live supply, and surviving mint rank tracker.">
  <link rel="icon" href="/favicon.png" type="image/png">
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="stylesheet" href="/css/retro-16bit-theme.css">
</head>
<body class="page-wiki page-standard-shell">
  <div id="layout">
    <main id="content" class="wiki-page">
      <article class="wiki-article">
        <header class="wiki-hero">
          <p class="wiki-kicker">AtomicAssets Collection Tracker</p>
          <h1>NoBallGames / NoBallGamess NFT Collection</h1>
          <p class="wiki-lede">Template rarity, current live supply checks, holder snapshots, and surviving mint rank data for the NoBallGames WAX collection.</p>
          <p class="wiki-feed-status" data-feed-status-id="${FEED_ID}">NoBallGames rarity snapshot active - AtomicAssets source of truth - ${escapeHtml(status.status || 'pending')}</p>
          <p><a class="wiki-button" href="${atomichubUrl()}">View Collection on AtomicHub</a> <a class="wiki-button" href="https://wax.api.atomicassets.io/atomicassets/v1/templates?collection_name=${COLLECTION}">AtomicAssets Templates API</a></p>
        </header>
        <section class="wiki-section">
          <h2>Rarity Method</h2>
          <p>This is a Template Rarity Ranking using the shared adaptive weighted rarity framework. Separate AtomicAssets template IDs may share the same artwork or name. AtomicAssets is the source of truth; AtomicHub links are reference links only.</p>
          <p>The base template formula is live surviving supply scarcity 50%, rarity trait/name exposure scarcity 25%, variation trait/name/metadata exposure scarcity 20%, and missing/burned supply bonus 5%. If meaningful rarity or variation metadata is missing, generic, repeated, or not supplied, that trait weight moves to live supply scarcity instead of creating fake traits.</p>
          <p>Thin metadata templates rank mostly by live surviving supply. Burns can increase rarity through lower live supply plus a small missing/burned bonus when supported by tracker data. Market price, floor, sales, listings, market cap, and volume are display-only and never scoring inputs.</p>
          <p>Original mint numbers never change. If a lower mint is burned, higher mints do not get renumbered. The rarity system may track surviving mint rank separately, which means the asset's position among currently live/unburned NFTs.</p>
          <p>Pre-baseline missing/burned is a current supply delta. It is not confirmed historic burn tracking unless future snapshots prove disappearance after tracking began.</p>
        </section>
        <section class="wiki-section">
          <h2>Collection Summary</h2>
          ${renderStatCards(stats)}
        </section>
        <section class="wiki-section">
          <h2>Template Rarity Ranking</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT Template</th><th>Template ID</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Rarity Trait</th><th>Rarity Scored</th><th>Variation Trait</th><th>Variation Scored</th><th>Weights Used</th><th>Final Score</th><th>Asset State</th></tr></thead>
            <tbody>${renderRows(data.ranked, true)}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Utility / Open Mint</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT Template</th><th>Template ID</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Rarity Trait</th><th>Rarity Scored</th><th>Variation Trait</th><th>Variation Scored</th><th>Weights Used</th><th>Final Score</th><th>Asset State</th></tr></thead>
            <tbody>${renderRows(data.utility)}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Unissued</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT Template</th><th>Template ID</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Rarity Trait</th><th>Rarity Scored</th><th>Variation Trait</th><th>Variation Scored</th><th>Weights Used</th><th>Final Score</th><th>Asset State</th></tr></thead>
            <tbody>${renderRows(data.unissued)}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Template Stats</h2>
          ${renderStatCards(stats)}
        </section>
        <section class="wiki-section">
          <h2>Trait Exposure</h2>
          <table class="wiki-table">
            <thead><tr><th>Schema</th><th>Templates</th><th>Live Supply</th></tr></thead>
            <tbody>${renderTraitExposureRows(asArray(traitExposure.schemas))}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Holder Leaderboard</h2>
          <table class="wiki-table">
            <thead><tr><th>Holder</th><th>Live Assets</th></tr></thead>
            <tbody>${renderHolderRows(asArray(holderLeaderboard.holders))}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Asset Rarity Leaderboard</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT</th><th>Asset ID</th><th>Template ID</th><th>Original Mint Number</th><th>Surviving Mint Rank</th></tr></thead>
            <tbody>${renderAssetRarityRows(asArray(assetRarityLeaderboard.assets))}</tbody>
          </table>
        </section>
        ${renderMarketAnalyticsSection(marketAnalytics, escapeHtml)}
        <!-- RELATED_WIKI_PATHS:BEGIN -->
        <section class="wiki-section related-wiki-paths" data-related-wiki-paths="true">
          <h2>Related Wiki Paths</h2>
          <div class="wiki-rabbit-group" data-related-group="Core Project Links">
            <h3>Core Project Links</h3>
            <div class="wiki-rabbit-grid">
              <a class="wiki-rabbit-card" href="/wiki/crypto-moonboys.html"><span class="wiki-rabbit-card-title">Crypto Moonboys</span><span class="wiki-rabbit-card-desc">Core project hub.</span></a>
              <a class="wiki-rabbit-card" href="/wiki/gkniftyheads-nft-collection.html"><span class="wiki-rabbit-card-title">GKniftyHEADS Tracker</span><span class="wiki-rabbit-card-desc">Existing collection tracker pattern.</span></a>
              <a class="wiki-rabbit-card" href="/timeline.html"><span class="wiki-rabbit-card-title">Timeline</span><span class="wiki-rabbit-card-desc">Project timeline context.</span></a>
              <a class="wiki-rabbit-card" href="/graph.html?mode=hero"><span class="wiki-rabbit-card-title">Graph</span><span class="wiki-rabbit-card-desc">Explore connected wiki nodes.</span></a>
            </div>
          </div>
          <div class="wiki-rabbit-group wiki-rabbit-group--categories" data-related-group="Related Categories">
            <h3>Related Categories</h3>
            <div class="wiki-rabbit-chip-grid">
              <a class="wiki-rabbit-chip" href="/categories/nfts.html">NFTs</a>
              <a class="wiki-rabbit-chip" href="/categories/wax-nfts.html">WAX NFTs</a>
              <a class="wiki-rabbit-chip" href="/categories/nfts-digital-art.html">NFTs &amp; Digital Art</a>
            </div>
          </div>
        </section>
        <!-- RELATED_WIKI_PATHS:END -->
      </article>
    </main>
  </div>
  <script data-cfasync="false" src="/js/api-config.js"></script>
  <script data-cfasync="false" src="/js/wax-image-normalizer.js"></script>
  <script data-cfasync="false" src="/js/wax-api-client.js"></script>
  <script data-cfasync="false" src="/js/wax-collection-renderer.js"></script>
  <script data-cfasync="false" src="/js/arcade/core/global-event-bus.js"></script>
  <script data-cfasync="false" src="/js/identity-gate.js"></script>
  <script data-cfasync="false" src="/js/core/moonboys-state.js"></script>
  <script data-cfasync="false" src="/js/core/daily-loop-state.js"></script>
  <script data-cfasync="false" src="/js/site-shell.js"></script>
  <script data-cfasync="false" src="/js/components/connection-status-panel.js"></script>
  <script data-cfasync="false" src="/js/components/global-player-header.js"></script>
  <script data-cfasync="false" src="/js/components/live-activity-summary.js"></script>
  <script data-cfasync="false" src="/js/wiki.js"></script>
  <script data-cfasync="false" src="/js/bible-loader.js"></script>
  <script data-cfasync="false" src="/js/site-feed-status.js"></script>
</body>
</html>
`;
}

export async function generateNoballgamessRarity(root = ROOT) {
  const data = buildRows(root);
  const liveDataStatus = data.allRows.some((row) => row.live_supply_status === 'ok' || row.live_supply_status === 'preserved_previous_ok')
    ? 'atomicassets live asset count'
    : 'issued-supply fallback';
  const templateRarity = {
    collection: COLLECTION,
    generated_at: nowIso(),
    live_data_status: liveDataStatus,
    ranking_formula: SCORING_CONTRACT,
    price_used: false,
    market_data_used: false,
    ranked_templates: data.ranked,
    utility_open_mint_templates: data.utility,
    unissued_templates: data.unissued,
  };
  const assetCache = readJson(root, `${DATA_DIR}/asset-state-cache.json`, { assets: [] });
  const liveAssets = asArray(assetCache.assets).filter((row) => !row.burned);
  const holderCounts = new Map();
  for (const asset of liveAssets) {
    if (!asset.owner) continue;
    holderCounts.set(asset.owner, (holderCounts.get(asset.owner) || 0) + 1);
  }
  const holderLeaderboard = [...holderCounts.entries()].map(([owner, live_assets]) => ({ owner, live_assets })).sort((a, b) => b.live_assets - a.live_assets);
  const ranks = readJson(root, `${DATA_DIR}/surviving-mint-ranks.json`, { templates: [] });
  const templateById = new Map(data.allRows.map((row) => [row.template_id, row]));
  const assetRarityLeaderboard = asArray(ranks.templates).flatMap((template) => asArray(template.assets).map((asset) => ({
    ...asset,
    template_id: template.template_id,
    title: templateById.get(template.template_id)?.title || `Template ${template.template_id}`,
    image_url: templateById.get(template.template_id)?.image_url || null,
    image_sources: templateById.get(template.template_id)?.image_sources || [],
    immutable_data_image_fields: templateById.get(template.template_id)?.immutable_data_image_fields || {},
    atomichub_url: templateById.get(template.template_id)?.atomichub_url || atomichubUrl(template.template_id),
    atomicassets_url: templateById.get(template.template_id)?.atomicassets_url || atomicTemplateUrl(template.template_id),
    rarity_band: templateById.get(template.template_id)?.rarity_band || null,
  })));
  const traitExposure = {
    collection: COLLECTION,
    generated_at: nowIso(),
    note: 'Trait exposure uses live_supply when live counts are available; issued_supply fallback remains explicit.',
    ranking_formula: SCORING_CONTRACT,
    rarity_traits: data.rarityExposure,
    variation_traits: data.variationExposure,
    schemas: Object.values(data.allRows.reduce((memo, row) => {
      const key = row.schema_name || 'unknown';
      memo[key] ||= { schema_name: key, templates: 0, live_supply: 0 };
      memo[key].templates += 1;
      memo[key].live_supply += row.live_supply || 0;
      return memo;
    }, {})),
  };
  const syncStatus = {
    collection: COLLECTION,
    feed_id: FEED_ID,
    generated_at: nowIso(),
    status: data.allRows.length ? 'ok' : 'pending',
    live_data_status: liveDataStatus,
    notes: [
      'AtomicAssets is the source of truth.',
      'No price, floor, sales, listing, or AtomicHub listing counts are used for rarity math.',
      'Original mint numbers never change; surviving_mint_rank is recalculated only among live/unburned assets.',
    ],
  };
  writeJson(root, `${DATA_DIR}/template-rarity.json`, templateRarity);
  writeJson(root, `${DATA_DIR}/live-asset-rarity.json`, {
    collection: COLLECTION,
    generated_at: nowIso(),
    status: liveDataStatus,
    ranking_formula: SCORING_CONTRACT,
    assets: assetRarityLeaderboard,
  });
  const templateStats = {
    collection: COLLECTION,
    generated_at: nowIso(),
    total_templates: data.allRows.length,
    ranked_templates: data.ranked.length,
    utility_open_mint_templates: data.utility.length,
    unissued_templates: data.unissued.length,
    ranking_formula: SCORING_CONTRACT,
    templates: data.allRows.map((row) => ({
      template_id: row.template_id,
      title: row.title,
      image_url: row.image_url || null,
      image_sources: row.image_sources || [],
      immutable_data_image_fields: row.immutable_data_image_fields || {},
    })),
  };
  writeJson(root, `${DATA_DIR}/template-stats.json`, templateStats);
  writeJson(root, `${DATA_DIR}/trait-exposure.json`, traitExposure);
  const holderLeaderboardOutput = {
    collection: COLLECTION,
    generated_at: nowIso(),
    ranking_formula: {
      ...SCORING_CONTRACT,
      allowed_score_inputs: ['live_assets_held'],
    },
    holders: holderLeaderboard,
  };
  const assetRarityLeaderboardOutput = {
    collection: COLLECTION,
    generated_at: nowIso(),
    ranking_formula: {
      ...SCORING_CONTRACT,
      allowed_score_inputs: ['original_mint_number', 'surviving_mint_rank'],
    },
    assets: assetRarityLeaderboard,
  };
  writeJson(root, `${DATA_DIR}/holder-leaderboard.json`, holderLeaderboardOutput);
  writeJson(root, `${DATA_DIR}/asset-rarity-leaderboard.json`, assetRarityLeaderboardOutput);
  writeJson(root, `${DATA_DIR}/sync-status.json`, syncStatus);
  writeCsv(root, `${DATA_DIR}/template-rarity.csv`, data.ranked, ['rank', 'template_id', 'title', 'rarity_band', 'issued_supply', 'live_supply', 'max_supply']);
  writeCsv(root, `${DATA_DIR}/live-asset-rarity.csv`, assetRarityLeaderboard, ['template_id', 'asset_id', 'original_mint_number', 'surviving_mint_rank']);
  writeCsv(root, `${DATA_DIR}/trait-exposure.csv`, traitExposure.schemas, ['schema_name', 'templates', 'live_supply']);
  writeText(root, PAGE_PATH, renderPage(root, data, {
    templateStats,
    traitExposure,
    holderLeaderboard: holderLeaderboardOutput,
    assetRarityLeaderboard: assetRarityLeaderboardOutput,
    marketAnalytics: readMarketAnalytics(root, COLLECTION),
  }));
  writeTemplateIntegrityAudit(root, data.allRows, []);
  return {
    ranked: data.ranked.length,
    utility: data.utility.length,
    unissued: data.unissued.length,
  };
}

export async function updateNoballgamessRarityFeed() {
  const feed = findFeed(FEED_ID);
  const useExistingCaches = process.env.NBG_USE_EXISTING_STAGED_CACHES === '1';
  const metadataResult = useExistingCaches
    ? {
        templates: asArray(readJson(ROOT, `${DATA_DIR}/template-metadata-cache.json`, { templates: [] }).templates).length,
        ok: asArray(readJson(ROOT, `${DATA_DIR}/template-metadata-cache.json`, { templates: [] }).templates).filter((row) => row.metadata_status === 'ok').length,
      }
    : await updateNoballgamessTemplateMetadataCache();
  const supplyResult = useExistingCaches
    ? {
        templates: asArray(readJson(ROOT, `${DATA_DIR}/live-template-supply.json`, { supplies: [] }).supplies).length,
        ok: asArray(readJson(ROOT, `${DATA_DIR}/live-template-supply.json`, { supplies: [] }).supplies).filter((row) => row.live_supply_status === 'ok').length,
      }
    : await updateNoballgamessLiveSupplyCache();
  const assetStateResult = useExistingCaches
    ? {
        assets: asArray(readJson(ROOT, `${DATA_DIR}/asset-state-cache.json`, { assets: [] }).assets).length,
        templates: asArray(readJson(ROOT, `${DATA_DIR}/asset-state-cache.json`, { template_state: [] }).template_state).length,
        errors: asArray(readJson(ROOT, `${DATA_DIR}/asset-state-cache.json`, { errors: [] }).errors).length,
      }
    : await updateNoballgamessAssetStateCache();
  const marketAnalytics = await updateNftMarketAnalytics({ collection: COLLECTION, root: ROOT, feed });
  const collectionStats = await fetchAtomicCollectionStatsSanity({ collection: COLLECTION });
  const result = await generateNoballgamessRarity();
  const status = createFeedStatus(feed, {
    status: 'ok',
    last_successful_check: nowIso(),
    source_updated_at: nowIso(),
    notes: [
      `Generated NoBallGames rarity render: ${result.ranked} ranked, ${result.utility} utility/open mint, ${result.unissued} unissued.`,
      `Staged cache refresh: ${metadataResult.ok}/${metadataResult.templates} metadata ok; ${supplyResult.ok}/${supplyResult.templates} live supply counts ok; ${assetStateResult.assets} asset-state records across ${assetStateResult.templates} templates.`,
      `HiveBP display analytics: ${marketAnalytics.analytics_status}; not used for rarity scoring.`,
      collectionStats.ok
        ? 'AtomicAssets collection stats sanity check available; asset-state cache remains the source for surviving mint ranks and holder/asset leaderboards.'
        : `AtomicAssets collection stats sanity check unavailable: ${collectionStats.error || 'unknown error'}.`,
      'AtomicAssets is the source of truth; AtomicHub links are references only.',
    ],
  });
  writeFeedStatus(feed, status);
  return status;
}

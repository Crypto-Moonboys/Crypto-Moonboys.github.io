#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeedStatus, fetchJson as fetchSiteJson, findFeed, writeFeedStatus } from './site-feed-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const COLLECTION = 'noballgamess';
export const COLLECTION_TITLE = 'NoBallGames';
export const FEED_ID = 'noballgamess_rarity';
export const DATA_DIR = path.join('data', COLLECTION);
export const PAGE_PATH = path.join('wiki', 'noballgamess-nft-collection.html');
export const ATOMIC_BASE = 'https://wax.api.atomicassets.io/atomicassets/v1';

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
  allowed_score_inputs: [
    'live_supply_scarcity',
    'trait_exposure_scarcity',
    'surviving_mint_rank_bonus',
    'pre_baseline_missing_or_burned_audit_when_proven',
  ],
  disallowed_score_inputs: [
    'price',
    'floor_price',
    'sales',
    'last_sale',
    'listing_count',
    'marketplace_listing_count',
    'AtomicHub listing counts',
  ],
};

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

function normalizeAtomicTemplate(raw) {
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

export async function updateNoballgamessTemplateMetadataCache(root = ROOT, options = {}) {
  const fetchJson = options.fetchJson || defaultFetchJson;
  const generatedAt = nowIso();
  const previous = readJson(root, `${DATA_DIR}/template-metadata-cache.json`, { templates: [] });
  const rows = options.templates || await fetchAllTemplatePages(fetchJson);
  const templates = [];
  const errors = [];
  for (const raw of rows) {
    try {
      const normalized = normalizeAtomicTemplate(raw);
      if (normalized.template_id > 0) templates.push(normalized);
    } catch (error) {
      errors.push({ error: error.message || String(error), raw_template_id: raw?.template_id || null });
    }
  }
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
    templates: templates.sort((a, b) => a.template_id - b.template_id),
    errors,
  };
  writeJson(root, `${DATA_DIR}/template-metadata-cache.json`, cache);
  writeTemplateIntegrityAudit(root, cache.templates, []);
  return { templates: cache.templates.length, ok: cache.templates.length, errors: errors.length };
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
    return {
      ...template,
      issued_supply: toNumber(template.issued_supply),
      max_supply: toNumber(template.max_supply),
      live_supply: liveSupply,
      live_supply_status: supply?.live_supply_status || 'issued_supply_fallback',
      pre_baseline_missing_or_burned: supply?.pre_baseline_missing_or_burned ?? null,
      live_supply_from_asset_state: state.live_supply_from_asset_state ?? null,
      burned_assets_count: state.burned_assets_count ?? null,
      asset_state_status: state.live_supply_from_asset_state == null || state.live_supply_from_asset_state === liveSupply ? 'ok' : 'asset_state_mismatch',
      price_used: false,
      market_data_used: false,
    };
  });
  const unissued = rows.filter((row) => row.issued_supply <= 0);
  const utility = rows.filter((row) => row.issued_supply > 0 && isUtilityOrOpenMint(row));
  const ranked = rows.filter((row) => row.issued_supply > 0 && !isUtilityOrOpenMint(row) && row.max_supply > 0);
  ranked.sort((a, b) => a.live_supply - b.live_supply || a.issued_supply - b.issued_supply || a.template_id - b.template_id);
  const legendary = ranked.filter((row) => row.live_supply === 1);
  const nonLegendary = ranked.filter((row) => row.live_supply !== 1);
  nonLegendary.forEach((row, index) => {
    row.rarity_band = bandFor(row, index, nonLegendary.length);
  });
  legendary.forEach((row) => {
    row.rarity_band = 'Legendary';
  });
  ranked.forEach((row, index) => {
    row.rank = index + 1;
    row.rarity_score = Math.round((1 / Math.max(1, row.live_supply)) * 100000) / 100;
    row.supply_used_for_scoring = row.live_supply;
  });
  return { ranked, utility, unissued, allRows: rows };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderRows(rows, ranked = false) {
  if (!rows.length) return '<tr><td colspan="7">Pending first AtomicAssets sync.</td></tr>';
  return rows.map((row) => `<tr>
    <td><a href="${escapeHtml(row.atomichub_url)}">${escapeHtml(row.title)}</a>${ranked ? `<br><small>Rank #${row.rank} · ${escapeHtml(row.rarity_band)}</small>` : ''}</td>
    <td>${escapeHtml(row.template_id)}</td>
    <td>${escapeHtml(row.schema_name || '')}</td>
    <td>${escapeHtml(row.issued_supply)}</td>
    <td>${escapeHtml(row.live_supply)}</td>
    <td>${row.pre_baseline_missing_or_burned == null ? 'Not counted' : escapeHtml(row.pre_baseline_missing_or_burned)}</td>
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
  if (!rows.length) return '<tr><td colspan="4">Pending asset rarity sync.</td></tr>';
  return rows.slice(0, 12).map((row) => `<tr>
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
          <p>This is a Template Rarity Ranking. Separate AtomicAssets template IDs may share the same artwork or name. AtomicAssets is the source of truth; AtomicHub links are reference links only.</p>
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
            <thead><tr><th>NFT Template</th><th>Template ID</th><th>Schema</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Asset State</th></tr></thead>
            <tbody>${renderRows(data.ranked, true)}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Utility / Open Mint</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT Template</th><th>Template ID</th><th>Schema</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Asset State</th></tr></thead>
            <tbody>${renderRows(data.utility)}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Unissued</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT Template</th><th>Template ID</th><th>Schema</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Asset State</th></tr></thead>
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
            <thead><tr><th>Asset ID</th><th>Template ID</th><th>Original Mint Number</th><th>Surviving Mint Rank</th></tr></thead>
            <tbody>${renderAssetRarityRows(asArray(assetRarityLeaderboard.assets))}</tbody>
          </table>
        </section>
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
  const assetRarityLeaderboard = asArray(ranks.templates).flatMap((template) => asArray(template.assets).map((asset) => ({
    ...asset,
    template_id: template.template_id,
  })));
  const traitExposure = {
    collection: COLLECTION,
    generated_at: nowIso(),
    note: 'Trait exposure uses live_supply when live counts are available; issued_supply fallback remains explicit.',
    ranking_formula: SCORING_CONTRACT,
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
  const result = await generateNoballgamessRarity();
  const status = createFeedStatus(feed, {
    status: 'ok',
    last_successful_check: nowIso(),
    source_updated_at: nowIso(),
    notes: [
      `Generated NoBallGames rarity render: ${result.ranked} ranked, ${result.utility} utility/open mint, ${result.unissued} unissued.`,
      `Staged cache refresh: ${metadataResult.ok}/${metadataResult.templates} metadata ok; ${supplyResult.ok}/${supplyResult.templates} live supply counts ok; ${assetStateResult.assets} asset-state records across ${assetStateResult.templates} templates.`,
      'AtomicAssets is the source of truth; AtomicHub links are references only.',
    ],
  });
  writeFeedStatus(feed, status);
  return status;
}

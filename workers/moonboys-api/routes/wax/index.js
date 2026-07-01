import { collectWaxImageFields, normalizeWaxImage } from './image-normalizer.js';

const API_PREFIX = '/api/wax';
const ATOMICASSETS_BASE = 'https://wax.api.atomicassets.io/atomicassets/v1';
const DEFAULT_STATIC_SITE_ORIGIN = 'https://cryptomoonboys.com';
const SUPPORTED_COLLECTIONS = Object.freeze(new Set(['gkniftyheads', 'noballgamess']));
const DEFAULT_TIMEOUT_MS = 9000;
const CACHE_SECONDS = 60;
const ROUTES = Object.freeze([
  'GET /api/wax/health',
  'GET /api/wax/collections/:collection/stats',
  'GET /api/wax/collections/:collection/templates',
  'GET /api/wax/collections/:collection/page-data',
  'GET /api/wax/templates?collection={collection}&ids={comma_ids}',
  'GET /api/wax/templates/:template_id/stats?collection={collection}',
  'GET /api/wax/assets/:asset_id',
  'GET /api/wax/assets/:asset_id/image',
  'GET /api/wax/wallets/:account/nfts?collection={collection}',
  'POST /api/wax/verify-ownership',
]);

function bridgeHeaders(corsHeaders = {}) {
  return {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    'X-Content-Type-Options': 'nosniff',
  };
}

function bridgeResponse(payload, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify({
    ok: status >= 200 && status < 300,
    cached: false,
    source: 'atomicassets',
    data: {},
    errors: [],
    stale: false,
    fallback_used: false,
    ...payload,
  }), {
    status,
    headers: bridgeHeaders(corsHeaders),
  });
}

function errorResponse(message, status = 400, corsHeaders = {}, detail = {}) {
  return bridgeResponse({
    ok: false,
    source: detail.source || 'atomicassets',
    data: detail.data || {},
    errors: [{ message, ...(detail.error || {}) }],
    stale: !!detail.stale,
    fallback_used: !!detail.fallback_used,
  }, status, corsHeaders);
}

function normalizeCollection(value) {
  const collection = String(value || '').trim().toLowerCase();
  return SUPPORTED_COLLECTIONS.has(collection) ? collection : '';
}

function parseIds(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .slice(0, 100);
}

function parseLimit(value, fallback = 100, max = 250) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function atomicUrl(path, params = {}) {
  const url = new URL(`${ATOMICASSETS_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function staticCollectionFiles(collection) {
  const base = `/data/${collection}/`;
  return collection === 'noballgamess'
    ? [
        `${base}template-rarity.json`,
        `${base}template-stats.json`,
        `${base}trait-exposure.json`,
        `${base}holder-leaderboard.json`,
        `${base}asset-rarity-leaderboard.json`,
        `${base}sync-status.json`,
        `${base}market-analytics.json`,
      ]
    : [
        `${base}template-rarity.json`,
        `${base}live-template-supply.json`,
        `${base}trait-exposure.json`,
        `${base}live-asset-rarity.json`,
        `${base}sync-status.json`,
        `${base}market-analytics.json`,
      ];
}

function staticSourceUrl(path, env = {}) {
  const origin = String(env.STATIC_SITE_ORIGIN || DEFAULT_STATIC_SITE_ORIGIN).replace(/\/$/, '');
  return `${origin}${path}`;
}

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${payload.message || payload.error || response.statusText}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function collectResult(key, promise) {
  try {
    return { key, ok: true, value: await promise };
  } catch (error) {
    return { key, ok: false, error: error.message || String(error) };
  }
}

function atomicRows(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.data && typeof payload.data === 'object') return [payload.data];
  return [];
}

function normalizeTemplate(row = {}, collection = '') {
  const immutable = row.immutable_data && typeof row.immutable_data === 'object' ? row.immutable_data : {};
  const image = collectWaxImageFields(immutable);
  const templateId = Number(row.template_id || 0);
  return {
    template_id: templateId,
    collection_name: collection || row.collection?.collection_name || row.collection_name || '',
    schema_name: row.schema?.schema_name || row.schema_name || '',
    title: immutable.name || row.name || row.title || `Template ${templateId || ''}`.trim(),
    issued_supply: Number(row.issued_supply || 0),
    max_supply: Number(row.max_supply || 0),
    immutable_data: immutable,
    image,
    atomicassets_url: collection && templateId ? `${ATOMICASSETS_BASE}/templates/${collection}/${templateId}` : null,
    source_url: collection && templateId ? `${ATOMICASSETS_BASE}/templates/${collection}/${templateId}` : null,
  };
}

function normalizeStaticTemplate(row = {}, collection = '') {
  const image = row.image
    || normalizeWaxImage(row.thumbnail_url || row.image_url || (Array.isArray(row.image_sources) ? row.image_sources[0] : null));
  return {
    template_id: Number(row.template_id || 0),
    collection_name: collection,
    schema_name: row.schema_name || row.schema || '',
    title: row.title || row.name || `Template ${row.template_id || ''}`.trim(),
    issued_supply: Number(row.issued_supply || 0),
    max_supply: Number(row.max_supply || 0),
    live_supply: row.live_supply ?? null,
    rank: row.rank ?? null,
    rarity_band: row.rarity_band || row.band || null,
    image,
    atomicassets_url: row.atomicassets_url || (row.template_id ? `${ATOMICASSETS_BASE}/templates/${collection}/${row.template_id}` : null),
  };
}

function normalizeAsset(row = {}) {
  const template = row.template || {};
  const immutable = row.immutable_data && typeof row.immutable_data === 'object'
    ? row.immutable_data
    : (template.immutable_data && typeof template.immutable_data === 'object' ? template.immutable_data : {});
  const image = collectWaxImageFields(immutable);
  return {
    asset_id: String(row.asset_id || ''),
    collection_name: row.collection?.collection_name || row.collection_name || row.collection?.name || '',
    template_id: Number(template.template_id || row.template_id || 0),
    owner: row.owner || null,
    burned: row.burned === true || row.burned === 'true',
    original_mint_number: Number(row.template_mint || row.mint_number || row.original_mint_number || 0) || null,
    immutable_data: immutable,
    image,
  };
}

async function getTemplates(collection, ids, deps, options = {}) {
  const limit = options.limit || (ids.length ? Math.max(ids.length, 1) : 1000);
  const url = ids.length
    ? atomicUrl('/templates', { collection_name: collection, ids: ids.join(','), limit })
    : atomicUrl('/templates', { collection_name: collection, limit });
  const payload = await fetchJson(url, deps);
  return {
    source_url: url,
    templates: atomicRows(payload).map((row) => normalizeTemplate(row, collection)),
  };
}

async function getCollectionStats(collection, deps) {
  const url = atomicUrl(`/collections/${encodeURIComponent(collection)}/stats`);
  const payload = await fetchJson(url, deps);
  return {
    source_url: url,
    stats: payload.data || payload,
  };
}

async function getAsset(assetId, deps) {
  const url = atomicUrl(`/assets/${encodeURIComponent(assetId)}`);
  const payload = await fetchJson(url, deps);
  return {
    source_url: url,
    asset: normalizeAsset(payload.data || {}),
  };
}

async function countAssets(params, deps) {
  const url = atomicUrl('/assets/_count', params);
  const payload = await fetchJson(url, deps);
  const raw = payload?.data ?? payload?.count ?? 0;
  return {
    source_url: url,
    count: Number(raw || 0),
  };
}

async function getWalletAssets(account, collection, deps, options = {}) {
  const limit = parseLimit(options.limit, 100, 250);
  const page = parseLimit(options.page, 1, 100000);
  const url = atomicUrl('/assets', {
    owner: account,
    collection_name: collection,
    burned: 'false',
    limit,
    page,
  });
  const payload = await fetchJson(url, deps);
  return {
    source_url: url,
    assets: atomicRows(payload).map(normalizeAsset),
    page,
    limit,
  };
}

async function fetchStaticCollectionData(collection, env, deps) {
  const files = staticCollectionFiles(collection);
  const results = await Promise.all(files.map(async (file) => {
    const sourceUrl = staticSourceUrl(file, env);
    try {
      return { file, source_url: sourceUrl, ok: true, data: await fetchJson(sourceUrl, deps) };
    } catch (error) {
      return { file, source_url: sourceUrl, ok: false, error: error.message || String(error) };
    }
  }));
  const byName = Object.fromEntries(results.filter((row) => row.ok).map((row) => [row.file.split('/').pop(), row.data]));
  return {
    files,
    source_urls: results.map((row) => row.source_url),
    errors: results.filter((row) => !row.ok).map((row) => ({ source_url: row.source_url, message: row.error })),
    byName,
  };
}

function flattenStaticTemplates(collection, templateRarity = {}) {
  const rows = [
    ...(templateRarity.ranked_templates || []),
    ...(templateRarity.utility_open_mint_templates || []),
    ...(templateRarity.unissued_templates || []),
  ];
  const seen = new Set();
  return rows
    .map((row) => normalizeStaticTemplate(row, collection))
    .filter((row) => {
      if (!row.template_id || seen.has(row.template_id)) return false;
      seen.add(row.template_id);
      return true;
    });
}

function collectionPagePath(collection) {
  return `/wiki/${collection === 'noballgamess' ? 'noballgamess' : 'gkniftyheads'}-nft-collection.html`;
}

async function buildCollectionPageData(collection, env, deps) {
  const staticData = await fetchStaticCollectionData(collection, env, deps);
  const statChecks = await Promise.all([
    collectResult('atomicassets_collection_stats', getCollectionStats(collection, deps)),
    collectResult('atomicassets_asset_count', countAssets({ collection_name: collection }, deps)),
    collectResult('atomicassets_template_sample', getTemplates(collection, [], deps, { limit: 24 })),
  ]);
  const sourceUrls = [...staticData.source_urls];
  const errors = [...staticData.errors];
  const stats = {};
  let templateSample = [];
  for (const check of statChecks) {
    if (!check.ok) {
      errors.push({ source_key: check.key, message: check.error });
      continue;
    }
    if (check.value.source_url) sourceUrls.push(check.value.source_url);
    if (check.key === 'atomicassets_collection_stats') stats.collection_stats = check.value.stats;
    if (check.key === 'atomicassets_asset_count') stats.assets_count = check.value.count;
    if (check.key === 'atomicassets_template_sample') templateSample = check.value.templates;
  }
  const templateRarity = staticData.byName['template-rarity.json'] || {};
  const staticTemplates = flattenStaticTemplates(collection, templateRarity);
  const templates = staticTemplates.length ? staticTemplates : templateSample;
  const summary = {
    collection,
    templates_count: templates.length,
    ranked_templates: templateRarity.ranked_templates?.length ?? null,
    utility_open_mint_templates: templateRarity.utility_open_mint_templates?.length ?? null,
    unissued_templates: templateRarity.unissued_templates?.length ?? null,
    live_data_status: templateRarity.live_data_status || null,
    atomicassets: stats,
  };
  return {
    collection,
    page_path: collectionPagePath(collection),
    static_files: staticData.files,
    summary,
    template_rarity: templateRarity,
    template_stats: staticData.byName['template-stats.json'] || {},
    live_template_supply: staticData.byName['live-template-supply.json'] || {},
    trait_exposure: staticData.byName['trait-exposure.json'] || {},
    holder_leaderboard: staticData.byName['holder-leaderboard.json'] || {},
    asset_rarity_leaderboard: staticData.byName['asset-rarity-leaderboard.json'] || staticData.byName['live-asset-rarity.json'] || {},
    market_analytics: staticData.byName['market-analytics.json'] || {},
    sync_status: staticData.byName['sync-status.json'] || {},
    templates,
    source_urls: sourceUrls,
    errors,
  };
}

async function verifyOwnership(body, deps) {
  const account = String(body.account || '').trim().toLowerCase();
  const collection = normalizeCollection(body.collection);
  const assetId = body.asset_id ? String(body.asset_id).trim() : '';
  const templateId = body.template_id ? String(body.template_id).trim() : '';
  if (!account) throw new Error('Missing account.');
  if (!collection) throw new Error('Unsupported or missing collection.');
  if (!assetId && !/^\d+$/.test(templateId)) throw new Error('Provide asset_id or numeric template_id.');

  if (assetId) {
    const result = await getAsset(assetId, deps);
    const asset = result.asset;
    const verified = asset.owner === account && asset.collection_name === collection && asset.burned === false;
    return {
      verified,
      account,
      collection,
      asset_id: assetId,
      template_id: asset.template_id || null,
      read_only: true,
      source_url: result.source_url,
      asset,
    };
  }

  const url = atomicUrl('/assets', {
    owner: account,
    collection_name: collection,
    template_id: templateId,
    burned: 'false',
    limit: 1,
  });
  const payload = await fetchJson(url, deps);
  const assets = atomicRows(payload).map(normalizeAsset);
  return {
    verified: assets.some((asset) => asset.owner === account && asset.collection_name === collection && !asset.burned),
    account,
    collection,
    asset_id: null,
    template_id: Number(templateId),
    read_only: true,
    source_url: url,
    assets,
  };
}

export async function handleWaxBridgeRoute(request, env = {}, corsHeaders = {}, deps = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const method = request.method.toUpperCase();
  const fetchDeps = {
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs || DEFAULT_TIMEOUT_MS,
  };

  if (!path.startsWith(API_PREFIX)) return null;
  if (method !== 'GET' && !(method === 'POST' && path === `${API_PREFIX}/verify-ownership`)) {
    return errorResponse('WAX bridge is read-only; unsupported method.', 405, corsHeaders);
  }

  if (path === `${API_PREFIX}/health` && method === 'GET') {
    return bridgeResponse({
      cached: true,
      source: 'worker',
      data: {
        ok: true,
        bridge: 'wax',
        read_only: true,
        supported_collections: [...SUPPORTED_COLLECTIONS],
        source: 'worker',
        routes: ROUTES,
      },
    }, 200, corsHeaders);
  }

  if (path === `${API_PREFIX}/verify-ownership` && method === 'POST') {
    try {
      const body = await request.json();
      const data = await verifyOwnership(body || {}, fetchDeps);
      return bridgeResponse({ data }, 200, corsHeaders);
    } catch (error) {
      return errorResponse(error.message || String(error), 400, corsHeaders);
    }
  }

  try {
    const collectionStatsMatch = path.match(/^\/api\/wax\/collections\/([^/]+)\/stats$/);
    if (collectionStatsMatch) {
      const collection = normalizeCollection(collectionStatsMatch[1]);
      if (!collection) return errorResponse('Unsupported WAX collection.', 400, corsHeaders);
      const checks = await Promise.all([
        collectResult('atomicassets_collection_stats', getCollectionStats(collection, fetchDeps)),
        collectResult('atomicassets_asset_count', countAssets({ collection_name: collection }, fetchDeps)),
        collectResult('atomicassets_templates_count', getTemplates(collection, [], fetchDeps, { limit: 1000 })),
      ]);
      const errors = checks.filter((check) => !check.ok).map((check) => ({ source_key: check.key, message: check.error }));
      const sourceUrls = checks.filter((check) => check.ok && check.value.source_url).map((check) => check.value.source_url);
      const data = { collection, source_urls: sourceUrls };
      const collectionStats = checks.find((check) => check.key === 'atomicassets_collection_stats' && check.ok)?.value;
      const assetCount = checks.find((check) => check.key === 'atomicassets_asset_count' && check.ok)?.value;
      const templates = checks.find((check) => check.key === 'atomicassets_templates_count' && check.ok)?.value;
      if (collectionStats) data.collection_stats = collectionStats.stats;
      if (assetCount) data.assets_count = assetCount.count;
      if (templates) data.templates_count = templates.templates.length;
      return bridgeResponse({ ok: errors.length < checks.length, data, errors }, errors.length === checks.length ? 502 : 200, corsHeaders);
    }

    const collectionTemplatesMatch = path.match(/^\/api\/wax\/collections\/([^/]+)\/templates$/);
    if (collectionTemplatesMatch) {
      const collection = normalizeCollection(collectionTemplatesMatch[1]);
      if (!collection) return errorResponse('Unsupported WAX collection.', 400, corsHeaders);
      const ids = parseIds(url.searchParams.get('ids'));
      const result = await getTemplates(collection, ids, fetchDeps, { limit: ids.length ? ids.length : 1000 });
      return bridgeResponse({ data: { collection, ...result } }, 200, corsHeaders);
    }

    const collectionPageDataMatch = path.match(/^\/api\/wax\/collections\/([^/]+)\/page-data$/);
    if (collectionPageDataMatch) {
      const collection = normalizeCollection(collectionPageDataMatch[1]);
      if (!collection) return errorResponse('Unsupported WAX collection.', 400, corsHeaders);
      const data = await buildCollectionPageData(collection, env, fetchDeps);
      return bridgeResponse({
        cached: true,
        source: data.templates.length ? 'static-fallback' : 'atomicassets',
        fallback_used: data.errors.length > 0,
        stale: data.errors.length > 0,
        data,
        errors: data.errors,
      }, data.templates.length || data.source_urls.length ? 200 : 502, corsHeaders);
    }

    if (path === `${API_PREFIX}/templates`) {
      const collection = normalizeCollection(url.searchParams.get('collection'));
      if (!collection) return errorResponse('Unsupported or missing collection.', 400, corsHeaders);
      const ids = parseIds(url.searchParams.get('ids'));
      if (!ids.length) return errorResponse('Missing ids query for batched template lookup.', 400, corsHeaders);
      const result = await getTemplates(collection, ids, fetchDeps, { limit: ids.length });
      return bridgeResponse({ data: { collection, ids, ...result } }, 200, corsHeaders);
    }

    const templateStatsMatch = path.match(/^\/api\/wax\/templates\/(\d+)\/stats$/);
    if (templateStatsMatch) {
      const collection = normalizeCollection(url.searchParams.get('collection'));
      if (!collection) return errorResponse('Unsupported or missing collection.', 400, corsHeaders);
      const templateId = templateStatsMatch[1];
      const [templates, assets] = await Promise.all([
        getTemplates(collection, [templateId], fetchDeps, { limit: 1 }),
        countAssets({ collection_name: collection, template_id: templateId }, fetchDeps),
      ]);
      return bridgeResponse({
        data: {
          collection,
          template_id: Number(templateId),
          template: templates.templates[0] || null,
          live_supply: assets.count,
          source_urls: [templates.source_url, assets.source_url],
        },
      }, 200, corsHeaders);
    }

    const assetImageMatch = path.match(/^\/api\/wax\/assets\/([^/]+)\/image$/);
    if (assetImageMatch) {
      const result = await getAsset(assetImageMatch[1], fetchDeps);
      const image = result.asset.image || normalizeWaxImage(null);
      return bridgeResponse({
        ok: !image.placeholder,
        data: {
          asset_id: result.asset.asset_id,
          image,
          source_url: result.source_url,
        },
        errors: image.placeholder ? [{ message: 'No image metadata found for asset.' }] : [],
      }, image.placeholder ? 404 : 200, corsHeaders);
    }

    const assetMatch = path.match(/^\/api\/wax\/assets\/([^/]+)$/);
    if (assetMatch) {
      const result = await getAsset(assetMatch[1], fetchDeps);
      return bridgeResponse({ data: result }, 200, corsHeaders);
    }

    const walletMatch = path.match(/^\/api\/wax\/wallets\/([^/]+)\/nfts$/);
    if (walletMatch) {
      const account = walletMatch[1].toLowerCase();
      const collection = normalizeCollection(url.searchParams.get('collection'));
      if (!collection) return errorResponse('Unsupported or missing collection.', 400, corsHeaders);
      const result = await getWalletAssets(account, collection, fetchDeps, {
        limit: url.searchParams.get('limit'),
        page: url.searchParams.get('page'),
      });
      return bridgeResponse({
        data: {
          account,
          collection,
          ...result,
        },
      }, 200, corsHeaders);
    }

    return errorResponse('Unknown WAX bridge route.', 404, corsHeaders);
  } catch (error) {
    return errorResponse(error.message || String(error), 502, corsHeaders, {
      source: 'static-fallback',
      fallback_used: true,
      stale: true,
    });
  }
}

export const WAX_BRIDGE_CONTRACT = Object.freeze({
  read_only: true,
  supported_collections: [...SUPPORTED_COLLECTIONS],
  routes: ROUTES,
  scoring_exclusions: ['price', 'floor', 'sales', 'listings', 'market_cap', 'volume'],
});

import { collectWaxImageFields, normalizeWaxImage } from './image-normalizer.js';

const API_PREFIX = '/api/wax';
const ATOMICASSETS_BASE = 'https://wax.api.atomicassets.io/atomicassets/v1';
const SUPPORTED_COLLECTIONS = Object.freeze(new Set(['gkniftyheads', 'noballgamess']));
const DEFAULT_TIMEOUT_MS = 9000;
const CACHE_SECONDS = 60;

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

function atomicUrl(path, params = {}) {
  const url = new URL(`${ATOMICASSETS_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
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
      throw new Error(`AtomicAssets ${response.status}: ${payload.message || payload.error || response.statusText}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
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
    title: immutable.name || row.name || `Template ${templateId || ''}`.trim(),
    issued_supply: Number(row.issued_supply || 0),
    max_supply: Number(row.max_supply || 0),
    immutable_data: immutable,
    image,
    atomicassets_url: collection && templateId ? `${ATOMICASSETS_BASE}/templates/${collection}/${templateId}` : null,
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
    collection_name: row.collection?.collection_name || row.collection_name || '',
    template_id: Number(template.template_id || row.template_id || 0),
    original_mint_number: Number(row.template_mint || row.mint_number || 0) || null,
    owner: row.owner || null,
    burned: row.burned === true || row.burned === 'true',
    immutable_data: immutable,
    image,
  };
}

async function getTemplates(collection, ids, deps) {
  const url = ids.length
    ? atomicUrl('/templates', { collection_name: collection, ids: ids.join(','), limit: Math.max(ids.length, 1) })
    : atomicUrl('/templates', { collection_name: collection, limit: 1000 });
  const payload = await fetchJson(url, deps);
  return {
    source_url: url,
    templates: atomicRows(payload).map((row) => normalizeTemplate(row, collection)),
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

async function getCollectionStats(collection, deps) {
  const url = atomicUrl(`/collections/${encodeURIComponent(collection)}/stats`);
  const payload = await fetchJson(url, deps);
  return {
    source_url: url,
    stats: payload.data || payload,
  };
}

function staticCollectionFiles(collection) {
  const base = `/data/${collection}/`;
  return collection === 'noballgamess'
    ? [
        `${base}template-rarity.json`,
        `${base}template-stats.json`,
        `${base}holder-leaderboard.json`,
        `${base}asset-rarity-leaderboard.json`,
      ]
    : [
        `${base}template-rarity.json`,
        `${base}template-stats.json`,
        `${base}live-asset-rarity.json`,
      ];
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
      source: 'cache',
      data: {
        ok: true,
        bridge: 'wax',
        read_only: true,
        supported_collections: [...SUPPORTED_COLLECTIONS],
      },
    }, 200, corsHeaders);
  }

  if (path === `${API_PREFIX}/verify-ownership` && method === 'POST') {
    return bridgeResponse({
      cached: true,
      source: 'static-fallback',
      data: {
        verified: false,
        read_only: true,
        note: 'Ownership verification facade is read-only and does not sign, claim, stake, or transact.',
      },
    }, 200, corsHeaders);
  }

  try {
    const collectionStatsMatch = path.match(/^\/api\/wax\/collections\/([^/]+)\/stats$/);
    if (collectionStatsMatch) {
      const collection = normalizeCollection(collectionStatsMatch[1]);
      if (!collection) return errorResponse('Unsupported WAX collection.', 400, corsHeaders);
      const [templates, assets] = await Promise.all([
        getCollectionStats(collection, fetchDeps),
        countAssets({ collection_name: collection }, fetchDeps),
      ]);
      return bridgeResponse({
        data: {
          collection,
          collection_stats: templates.stats,
          assets_count: assets.count,
          source_urls: [templates.source_url, assets.source_url],
        },
      }, 200, corsHeaders);
    }

    const collectionTemplatesMatch = path.match(/^\/api\/wax\/collections\/([^/]+)\/templates$/);
    if (collectionTemplatesMatch) {
      const collection = normalizeCollection(collectionTemplatesMatch[1]);
      if (!collection) return errorResponse('Unsupported WAX collection.', 400, corsHeaders);
      const ids = parseIds(url.searchParams.get('ids'));
      const result = await getTemplates(collection, ids, fetchDeps);
      return bridgeResponse({ data: { collection, ...result } }, 200, corsHeaders);
    }

    const collectionPageDataMatch = path.match(/^\/api\/wax\/collections\/([^/]+)\/page-data$/);
    if (collectionPageDataMatch) {
      const collection = normalizeCollection(collectionPageDataMatch[1]);
      if (!collection) return errorResponse('Unsupported WAX collection.', 400, corsHeaders);
      return bridgeResponse({
        cached: true,
        source: 'static-fallback',
        fallback_used: true,
        stale: false,
        data: {
          collection,
          static_files: staticCollectionFiles(collection),
          templates: [],
          note: 'Static JSON remains the page fallback and scheduled tracker audit trail.',
        },
      }, 200, corsHeaders);
    }

    if (path === `${API_PREFIX}/templates`) {
      const collection = normalizeCollection(url.searchParams.get('collection'));
      if (!collection) return errorResponse('Unsupported or missing collection.', 400, corsHeaders);
      const ids = parseIds(url.searchParams.get('ids'));
      if (!ids.length) return errorResponse('Missing ids query for batched template lookup.', 400, corsHeaders);
      const result = await getTemplates(collection, ids, fetchDeps);
      return bridgeResponse({ data: { collection, ids, ...result } }, 200, corsHeaders);
    }

    const templateStatsMatch = path.match(/^\/api\/wax\/templates\/(\d+)\/stats$/);
    if (templateStatsMatch) {
      const collection = normalizeCollection(url.searchParams.get('collection')) || 'gkniftyheads';
      const templateId = templateStatsMatch[1];
      const [templates, assets] = await Promise.all([
        getTemplates(collection, [templateId], fetchDeps),
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
      return bridgeResponse({
        data: {
          asset_id: result.asset.asset_id,
          image: result.asset.image || normalizeWaxImage(null),
          source_url: result.source_url,
        },
      }, 200, corsHeaders);
    }

    const assetMatch = path.match(/^\/api\/wax\/assets\/([^/]+)$/);
    if (assetMatch) {
      const result = await getAsset(assetMatch[1], fetchDeps);
      return bridgeResponse({ data: result }, 200, corsHeaders);
    }

    const walletMatch = path.match(/^\/api\/wax\/wallets\/([^/]+)\/nfts$/);
    if (walletMatch) {
      const account = walletMatch[1];
      const collection = normalizeCollection(url.searchParams.get('collection'));
      if (!collection) return errorResponse('Unsupported or missing collection.', 400, corsHeaders);
      const sourceUrl = atomicUrl('/assets', { owner: account, collection_name: collection, burned: 'false', limit: 100 });
      const payload = await fetchJson(sourceUrl, fetchDeps);
      return bridgeResponse({
        data: {
          account,
          collection,
          source_url: sourceUrl,
          assets: atomicRows(payload).map(normalizeAsset),
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
  scoring_exclusions: ['price', 'floor', 'sales', 'listings', 'market_cap', 'volume'],
});

import path from 'node:path';
import {
  safeFetchJson,
  readJson,
  writeJson,
} from './site-feed-utils.mjs';

export const HIVEBP_BASE_URL = 'https://wax-api.hivebp.io';

const DEFAULT_DAYS = 30;

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function endpointPath(key, collection, days = DEFAULT_DAYS) {
  const encoded = encodeURIComponent(collection);
  if (key === 'collection_stats') return `/v3/collection-stats/${encoded}`;
  if (key === 'num_assets') return `/v3/num-assets/${encoded}`;
  if (key === 'marketcap') return `/v3/marketcap/${encoded}`;
  if (key === 'top_users') return `/v3/top-users/${days}/${encoded}`;
  if (key === 'top_templates') return `/v3/top-templates/${days}/${encoded}`;
  if (key === 'volume') return `/v3/volume/${days}/${encoded}`;
  if (key === 'sales_volume_graph') return `/v3/sales-volume-graph/${days}/${encoded}`;
  throw new Error(`Unknown HiveBP endpoint key: ${key}`);
}

export function marketAnalyticsPath(collection) {
  return path.join('data', collection, 'market-analytics.json').replaceAll('\\', '/');
}

export function readMarketAnalytics(root, collection) {
  return readJson(path.join(root, marketAnalyticsPath(collection)), {
    collection,
    provider: 'NFTHive / HiveBP WAX API',
    analytics_status: 'pending',
    status: 'pending',
    display_only: true,
    rarity_input: false,
    note: 'Market analytics pending. AtomicAssets remains the source of truth for rarity.',
    endpoint_status: {},
    data: {},
  });
}

export async function updateNftMarketAnalytics({
  collection,
  root = process.cwd(),
  days = DEFAULT_DAYS,
  feed = null,
  fetchJson = null,
  timeoutMs = 7000,
  retries = 1,
} = {}) {
  if (!collection) throw new Error('Missing collection for NFT market analytics.');
  const relativePath = marketAnalyticsPath(collection);
  const absolutePath = path.join(root, relativePath);
  const previous = readJson(absolutePath, null);
  const sourceUrls = {};
  const endpointStatus = {};
  const data = {};
  const keys = [
    'collection_stats',
    'num_assets',
    'marketcap',
    'top_users',
    'top_templates',
    'volume',
    'sales_volume_graph',
  ];

  for (const key of keys) {
    const endpoint = endpointPath(key, collection, days);
    const fullUrl = `${HIVEBP_BASE_URL}${endpoint}`;
    sourceUrls[key] = fullUrl;
    const result = await safeFetchJson(fullUrl, {
      source_key: key,
      fetchJson,
      timeoutMs,
      retries,
      retryDelayMs: 250,
      previousPath: previous ? relativePath : null,
    });
    endpointStatus[key] = {
      ok: result.ok,
      stale: result.stale,
      source_url: fullUrl,
      error: result.error,
      used_previous: result.used_previous,
      attempts: result.attempts,
      checked_at: result.checked_at,
    };
    if (result.ok) data[key] = result.payload;
  }

  const okCount = Object.values(endpointStatus).filter((row) => row.ok).length;
  const analyticsStatus = okCount === keys.length ? 'ok' : okCount > 0 ? 'degraded' : previous ? 'degraded' : 'pending';
  const payload = {
    collection,
    provider: 'NFTHive / HiveBP WAX API',
    api_base: HIVEBP_BASE_URL,
    generated_at: nowIso(),
    analytics_status: analyticsStatus,
    status: analyticsStatus,
    display_only: true,
    rarity_input: false,
    note: 'Market analytics are display-only and are not used for rarity scoring. AtomicAssets remains the source of truth for template verification, live supply, burns, mints, asset state, original_mint_number, and surviving_mint_rank.',
    days,
    source_urls: sourceUrls,
    endpoint_status: endpointStatus,
    data,
    previous_preserved: okCount === 0 && Boolean(previous),
    previous_generated_at: okCount === 0 && previous ? previous.generated_at || null : null,
    error_summary: Object.entries(endpointStatus)
      .filter(([, status]) => !status.ok)
      .map(([key, status]) => `${key}: ${status.error || 'unavailable'}`),
  };

  if (okCount === 0 && previous) {
    payload.data = previous.data || {};
  }

  writeJson(absolutePath, payload);
  return payload;
}

function pickNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    for (const key of ['value', 'count', 'total', 'assets', 'num_assets', 'marketcap', 'market_cap', 'volume']) {
      const parsed = pickNumber(value[key]);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function compactNumber(value) {
  const number = pickNumber(value);
  if (number == null) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: number >= 100 ? 0 : 4 }).format(number);
}

function topItems(payload, labelKeys = []) {
  const data = payload?.data ?? payload;
  const candidates = [
    data?.data,
    data?.rows,
    data?.results,
    data?.templates,
    data?.users,
    data,
  ];
  const rows = candidates.find(Array.isArray) || [];
  return rows.slice(0, 5).map((row) => {
    if (typeof row !== 'object' || row == null) return String(row);
    for (const key of labelKeys) {
      if (row[key] != null) return String(row[key]);
    }
    return String(row.template_id || row.account || row.owner || row.name || row.collection || JSON.stringify(row).slice(0, 80));
  });
}

export function renderMarketAnalyticsSection(market, escapeHtml = (value) => String(value ?? '')) {
  const analytics = market || {};
  const data = analytics.data || {};
  const status = analytics.analytics_status || analytics.status || 'pending';
  const topUsers = topItems(data.top_users, ['account', 'owner', 'user', 'name']);
  const topTemplates = topItems(data.top_templates, ['template_id', 'name', 'template_name']);
  const errorCopy = asArray(analytics.error_summary).length
    ? `<p class="lore-paragraph"><small>Analytics status: ${escapeHtml(status)}. ${escapeHtml(asArray(analytics.error_summary).slice(0, 2).join('; '))}</small></p>`
    : `<p class="lore-paragraph"><small>Analytics status: ${escapeHtml(status)}.</small></p>`;

  return `<section class="wiki-section nft-market-analytics" data-market-analytics-provider="hivebp">
          <h2>Market Analytics</h2>
          <p class="lore-paragraph"><strong>Market analytics — display only, not rarity input.</strong> NFTHive / HiveBP WAX API data is shown as optional collection context. AtomicAssets remains the source of truth for rarity, template verification, live supply, burns, mints, asset state, original_mint_number, and surviving_mint_rank.</p>
          <div class="wiki-stat-grid nft-market-analytics-grid">
            <div class="wiki-stat"><strong>${escapeHtml(compactNumber(data.num_assets))}</strong><span>Total assets</span></div>
            <div class="wiki-stat"><strong>${escapeHtml(compactNumber(data.marketcap))}</strong><span>Market cap</span></div>
            <div class="wiki-stat"><strong>${escapeHtml(compactNumber(data.volume))}</strong><span>Volume (${escapeHtml(analytics.days || DEFAULT_DAYS)}d)</span></div>
            <div class="wiki-stat"><strong>${escapeHtml(topUsers.length ? topUsers.join(', ') : 'Unavailable')}</strong><span>Top users</span></div>
            <div class="wiki-stat"><strong>${escapeHtml(topTemplates.length ? topTemplates.join(', ') : 'Unavailable')}</strong><span>Top templates</span></div>
          </div>
          ${errorCopy}
        </section>`;
}

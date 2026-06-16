const WAXONEDGE_API_PREFIX = '/api/waxonedge';
const WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT = `${WAXONEDGE_API_PREFIX}/live`;
const WAXONEDGE_LIVE_STREAM_ENDPOINT = `${WAXONEDGE_API_PREFIX}/live/stream`;
const WAXONEDGE_LIVE_SECRET_HEADER = 'x-waxonedge-live-secret';

const ALCOR_API = 'https://wax.alcor.exchange/api/v2';
const WAX_RPC = 'https://wax.greymass.com';
const UNAVAILABLE = 'Unavailable';
const REQUIRES_INDEXED_BACKEND = 'Requires indexed backend';
const SOURCE_NOT_INDEXED = 'Source not indexed yet';
const CHAIN_TABLE_PAGE_LIMIT = 1000;
const MAX_CHAIN_TABLE_PAGES = 20;
const CORE_DEX_PAGES_PER_INVOCATION = 3;
const CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE = 3;
const SOURCE_STALE_MINUTES = 30;
const MIN_TRUSTED_WAX_LIQUIDITY = 10;
const MAX_REASONABLE_PAIR_TVL_USD = 100000000;
const CANDLE_BACKFILL_SOURCE = 'candle_backfill';
const ALCOR_TRADE_INDEX_SOURCE = 'alcor_trade_rows';
const AMM_TRADE_INDEX_SOURCE = 'amm_trade_rows';
const SUPPLY_SYNC_SOURCE = 'wax_rpc_supply';
const AGGREGATE_REFRESH_REASON = 'Aggregate refresh pending after source cursor progress';
const CANDLE_BACKFILL_PLAN = 'Internal 1D kline backfill planned from indexed trade rows; no fake candles are inserted.';
const TRADE_INDEX_PLAN = 'Alcor market match trade-row indexing planned for internal 1D candle building; no fake trades are inserted.';
const AMM_TRADE_INDEX_PLAN = 'AMM swap action-row indexing planned from WaxOnEdge reference log streams; no fake trades are inserted.';
const HYPERION_MARKET_MATCH_QUERY_SHAPE = 'GET <configured-base-or-endpoint>/history/get_actions?account=alcordexmain&act.name=buymatch|sellmatch&sort=desc&limit=<n>; market_id filtered locally from action data';
const HYPERION_AMM_SWAP_QUERY_SHAPE = 'GET <configured-base-or-endpoint>/history/get_actions?account=<swap-contract>&act.name=<reference-action>&sort=desc&limit=<n>; pair/pool id parsed locally from action data';
const WAXONEDGE_FREE_SAFE_MODE_DEFAULT = true;
const DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT = 24;
const DEFAULT_TRADE_INDEX_PAIR_LIMIT = 24;
const DEFAULT_TRADE_ROWS_PER_MARKET_LIMIT = 250;
const DEFAULT_SUPPLY_SYNC_LIMIT = 25;
const DEFAULT_HYPERION_TRADE_SCAN_LIMIT = 100;
const DEFAULT_TRADE_STREAM_PAGES_PER_RUN = 2;
const HYPERION_SKIP_WINDOW_LIMIT = 10000;
const HYPERION_SKIP_WINDOW_NEXT_ACTION = 'requires sequence/state-history cursor or VPS indexer for deeper history';
const LIVE_SNAPSHOT_TOKEN_LIMIT = 250;
const FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION = 1;
const FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE = 1;
const FREE_SAFE_CANDLE_BACKFILL_PAIR_LIMIT = 2;
const FREE_SAFE_TRADE_INDEX_PAIR_LIMIT = 2;
const FREE_SAFE_TRADE_ROWS_PER_MARKET_LIMIT = 50;
const OG_WAX_ROUTE_MAX_HOPS = 5;
const OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT = 2000;
const OG_WAX_ROUTE_GRAPH_FRONTIER_LIMIT = 200;
const FREE_SAFE_SUPPLY_SYNC_LIMIT = 5;
const FREE_SAFE_TRADE_STREAM_PAGES_PER_RUN = 1;
const FREE_SAFE_CANDLE_SUBREQUEST_BUDGET = 2;
const CANDLE_BACKFILL_LOOKBACK_DAYS = 120;
const STUCK_CURSOR_RETRY_LIMIT = 3;
const WAXONEDGE_AGGREGATE_SOURCES = Object.freeze([
  'alcor',
  'swap.alcor',
  'swap.taco',
  'swap.nefty',
  'swap.box',
  'swap.adex',
  'dapp.fusion',
]);
const TOKEN_PAIR_PAGE_LIMIT = 100;
const TOKEN_PAIR_MAX_PAGE_LIMIT = 1000;
const LARGE_SNAPSHOT_SOURCES = Object.freeze([
  'swap.alcor_pools',
  'swap.taco_pairs',
  'swap.nefty_pairs',
  'swap.box_pairs',
  'swap.adex_pools',
  'dapp.fusion_global',
]);
const TRADE_HISTORY_NOT_AVAILABLE_SOURCES = Object.freeze([
  'swap.adex',
  'dapp.fusion',
]);
const CANDLE_TRADE_SOURCES = Object.freeze([
  'alcor',
  'swap.alcor',
  'swap.taco',
  'swap.box',
  'swap.nefty',
]);
const CANDLE_SOURCE_ALIASES = Object.freeze({
  alcormarket: 'alcor',
  alcordexmain: 'alcor',
  alcorv2: 'swap.alcor',
  taco: 'swap.taco',
  defibox: 'swap.box',
  neftyblocks: 'swap.nefty',
  adex: 'swap.adex',
  waxfusion: 'dapp.fusion',
});
const CANDLE_REFERENCE_SOURCE_BY_RUNTIME = Object.freeze({
  alcor: 'alcormarket',
  'swap.alcor': 'alcorv2',
  'swap.taco': 'taco',
  'swap.box': 'defibox',
  'swap.nefty': 'neftyblocks',
  'swap.adex': 'adex',
  'dapp.fusion': 'waxfusion',
});
const TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS = Object.freeze([
  {
    source: 'swap.adex',
    account: 'swap.adex',
    verified_table: 'pools',
    verified_listing_action: 'createpool',
    trade_stream_not_verified_from_og_refs: true,
    reason: 'OG WaxOnEdge config registers swap.adex createpool listing events and pools table rows, but no SwapOrderRow trade action stream.',
  },
  {
    source: 'dapp.fusion',
    account: 'dapp.fusion',
    verified_table: 'global',
    verified_listing_action: null,
    trade_stream_not_verified_from_og_refs: true,
    reason: 'OG WaxOnEdge config registers dapp.fusion global special pool rows; contract execution actions are not indexed as kline trade rows in the backend reference.',
  },
]);
const TRADE_RAW_JSON_CACHE = Symbol('waxonedgeTradeRawJson');
const LIVE_INDEXER_PROBE_CACHE_TTL_MS = 30000;
let waxonedgeLiveIndexerProbeCache = null;

function waxonedgeFreeSafeMode(env) {
  return String(env?.WAXONEDGE_FREE_SAFE_MODE ?? WAXONEDGE_FREE_SAFE_MODE_DEFAULT).toLowerCase() !== 'false';
}

function coreDexPagesPerInvocation(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION : CORE_DEX_PAGES_PER_INVOCATION;
}

function coreDexRpcBudgetPerSource(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE : CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE;
}

function candleBackfillPairLimit(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_CANDLE_BACKFILL_PAIR_LIMIT : DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT;
}

function candleSubrequestBudget(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_CANDLE_SUBREQUEST_BUDGET : DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT;
}

function tradeIndexPairLimit(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_TRADE_INDEX_PAIR_LIMIT : DEFAULT_TRADE_INDEX_PAIR_LIMIT;
}

function tradeRowsPerMarketLimit(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_TRADE_ROWS_PER_MARKET_LIMIT : DEFAULT_TRADE_ROWS_PER_MARKET_LIMIT;
}

function tradeStreamPagesPerRun(env) {
  const configured = asNumber(env?.WAXONEDGE_TRADE_STREAM_PAGES_PER_RUN);
  if (configured != null && configured > 0) return Math.min(10, Math.floor(configured));
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_TRADE_STREAM_PAGES_PER_RUN : DEFAULT_TRADE_STREAM_PAGES_PER_RUN;
}

function supplySyncLimit(env) {
  const configured = asNumber(env?.WAXONEDGE_SUPPLY_SYNC_LIMIT);
  if (configured != null && configured > 0) return Math.max(1, Math.min(250, Math.floor(configured)));
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_SUPPLY_SYNC_LIMIT : DEFAULT_SUPPLY_SYNC_LIMIT;
}

function hyperionSkipWindowState(cursor, limit, maxWindow = HYPERION_SKIP_WINDOW_LIMIT) {
  const skipCursor = Math.max(0, Math.floor(asNumber(cursor) || 0));
  const pageLimit = Math.max(
    DEFAULT_HYPERION_TRADE_SCAN_LIMIT,
    Math.floor(asNumber(limit) || DEFAULT_HYPERION_TRADE_SCAN_LIMIT),
  );
  const windowLimit = Math.max(1, Math.floor(asNumber(maxWindow) || HYPERION_SKIP_WINDOW_LIMIT));
  const lastValidSkipCursor = Math.max(0, windowLimit - pageLimit);
  return {
    skip_cursor: skipCursor,
    page_limit: pageLimit,
    hyperion_skip_window_limit: windowLimit,
    last_valid_skip_cursor: lastValidSkipCursor,
    bounded_skip_window_exhausted: skipCursor + pageLimit > windowLimit,
  };
}

function hyperionApiBase(env) {
  const raw = String(env?.WAXONEDGE_HYPERION_API || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch (_) {
    return '';
  }
}

function hyperionConfigured(env) {
  return !!hyperionHistoryActionsEndpoint(env);
}

function waxonedgeLiveIndexerUrlConfigured(env) {
  const raw = String(env?.WAXONEDGE_LIVE_INDEXER_URL || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:') return isLoopbackLiveIndexerHost(parsed.hostname);
    return false;
  } catch (_) {
    return false;
  }
}

function isLoopbackLiveIndexerHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  const octets = host.split('.');
  if (octets.length !== 4) return false;
  const values = octets.map((part) => {
    if (!/^\d+$/.test(part)) return null;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
  });
  return values.every((value) => value != null) && values[0] === 127;
}

function waxonedgeLiveIndexerBaseUrl(env) {
  const raw = String(env?.WAXONEDGE_LIVE_INDEXER_URL || '').trim();
  if (!raw || !waxonedgeLiveIndexerUrlConfigured(env)) return '';
  return raw.replace(/\/+$/, '');
}

function waxonedgeLiveIndexerConfig(env) {
  return {
    vps_indexer_url_configured: waxonedgeLiveIndexerUrlConfigured(env),
    shared_secret_configured: Boolean(String(env?.WAXONEDGE_LIVE_SHARED_SECRET || '').trim()),
    secret_header: WAXONEDGE_LIVE_SECRET_HEADER,
    proxy_enabled: false,
  };
}

async function probeWaxonedgeLiveIndexer(env, fetchImpl = globalThis.fetch) {
  const baseUrl = waxonedgeLiveIndexerBaseUrl(env);
  const secret = String(env?.WAXONEDGE_LIVE_SHARED_SECRET || '').trim();
  const base = {
    configured: !!baseUrl,
    reachable: false,
    status: baseUrl ? 'probe_failed' : 'not_configured',
    service: null,
    uses_fake_live_data: null,
    browser_hyperion_fetch: null,
    emits_fake_token_updates: null,
    shared_secret_configured: !!secret,
    secret_leaked: false,
    last_error: null,
  };
  if (!baseUrl) {
    return {
      ...base,
      status: 'not_configured',
      last_error: null,
    };
  }
  if (typeof fetchImpl !== 'function') {
    return {
      ...base,
      status: 'probe_failed',
      last_error: 'fetch unavailable',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = clampInteger(env?.WAXONEDGE_LIVE_PROBE_TIMEOUT_MS, 1500, 250, 5000);
  const timeout = controller ? setTimeout(() => controller.abort('live indexer probe timeout'), timeoutMs) : null;
  try {
    const headers = {};
    if (secret) headers[WAXONEDGE_LIVE_SECRET_HEADER] = secret;
    const response = await fetchImpl(`${baseUrl}/health`, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: controller?.signal,
    });
    if (response.status >= 300 && response.status <= 399) {
      return {
        ...base,
        status: 'probe_failed',
        last_error: 'live indexer health redirected',
      };
    }
    const bodyText = await response.text();
    let payload = null;
    try {
      payload = bodyText ? JSON.parse(bodyText) : null;
    } catch (_) {
      return {
        ...base,
        status: 'probe_failed',
        last_error: `invalid JSON from live indexer health (${response.status})`,
      };
    }
    const service = safeString(payload?.service);
    const usesFakeLiveDataSafe = payload?.uses_fake_live_data === false;
    const browserHyperionFetchSafe = payload?.browser_hyperion_fetch === false;
    const emitsFakeTokenUpdatesSafe = payload?.emits_fake_token_updates === false;
    const validIdentity = service === 'waxonedge-live-indexer' &&
      usesFakeLiveDataSafe &&
      browserHyperionFetchSafe &&
      emitsFakeTokenUpdatesSafe;
    if (!response.ok && response.status !== 503) {
      return {
        ...base,
        service,
        uses_fake_live_data: payload?.uses_fake_live_data ?? null,
        browser_hyperion_fetch: payload?.browser_hyperion_fetch ?? null,
        emits_fake_token_updates: payload?.emits_fake_token_updates ?? null,
        status: 'probe_failed',
        last_error: `live indexer health returned ${response.status}`,
      };
    }
    if (!validIdentity) {
      return {
        ...base,
        service,
        uses_fake_live_data: payload?.uses_fake_live_data ?? null,
        browser_hyperion_fetch: payload?.browser_hyperion_fetch ?? null,
        emits_fake_token_updates: payload?.emits_fake_token_updates ?? null,
        status: 'probe_failed',
        last_error: 'live indexer health identity validation failed',
      };
    }
    return {
      configured: true,
      reachable: true,
      status: safeString(payload?.status || payload?.health_status) || (response.status === 503 ? 'not_connected' : 'ok'),
      service,
      uses_fake_live_data: false,
      browser_hyperion_fetch: false,
      emits_fake_token_updates: false,
      shared_secret_configured: !!secret,
      secret_leaked: false,
      last_error: null,
    };
  } catch (error) {
    return {
      ...base,
      status: 'probe_failed',
      last_error: safeString(error?.message || error) || 'fetch failed',
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function cloneLiveIndexerProbeResult(result) {
  return JSON.parse(JSON.stringify(result || null));
}

function liveIndexerProbeCacheKey(env) {
  const baseUrl = waxonedgeLiveIndexerBaseUrl(env);
  const secret = String(env?.WAXONEDGE_LIVE_SHARED_SECRET || '').trim();
  return `${baseUrl || 'not_configured'}|secret:${liveIndexerSecretFingerprint(secret)}`;
}

function liveIndexerSecretFingerprint(secret) {
  const text = String(secret || '');
  if (!text) return 'none';
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function cachedProbeWaxonedgeLiveIndexer(env, fetchImpl = globalThis.fetch, nowMs = Date.now()) {
  const cacheKey = liveIndexerProbeCacheKey(env);
  if (
    waxonedgeLiveIndexerProbeCache &&
    waxonedgeLiveIndexerProbeCache.key === cacheKey &&
    waxonedgeLiveIndexerProbeCache.expires_at > nowMs
  ) {
    return cloneLiveIndexerProbeResult(waxonedgeLiveIndexerProbeCache.result);
  }
  const result = await probeWaxonedgeLiveIndexer(env, fetchImpl);
  waxonedgeLiveIndexerProbeCache = {
    key: cacheKey,
    expires_at: nowMs + LIVE_INDEXER_PROBE_CACHE_TTL_MS,
    result: cloneLiveIndexerProbeResult(result),
  };
  return cloneLiveIndexerProbeResult(result);
}

function resetWaxonedgeLiveIndexerProbeCache() {
  waxonedgeLiveIndexerProbeCache = null;
}

function hyperionNotConfiguredTradeResult(pairId, actionName = null) {
  const diagnostic = {
    source: 'alcor',
    pair_id: safeString(pairId) || null,
    action_name: actionName ? safeString(actionName) : null,
    endpoint_path: 'Hyperion/state-history marketMatches',
    http_status: null,
    response_body_snippet: 'WAXONEDGE_HYPERION_API is not configured',
    retry_count: 0,
    failure_type: 'hyperion_not_configured',
    upstream_server_error: false,
    budget_failure: false,
    unsupported: false,
    ingestion_path: 'hyperion_marketMatches',
    attempted_endpoints: [],
  };
  return {
    rows: [],
    skipped: true,
    hyperionNotConfigured: true,
    diagnostic,
    attempted_endpoints: [],
    ingestion_path: 'hyperion_marketMatches',
  };
}

function hyperionHistoryActionsEndpoint(env) {
  const base = hyperionApiBase(env);
  if (!base) return '';
  if (base.endsWith('/history/get_actions')) return base;
  if (base.endsWith('/history') || base.includes('/history/')) return '';
  return `${base}/history/get_actions`;
}

function isSubrequestBudgetError(error) {
  return /too many subrequests|subrequest/i.test(String(error?.message || error || ''));
}

function isNotFoundError(error) {
  return /^404\b|not found/i.test(String(error?.message || error || ''));
}

function isUpstreamServerErrorStatus(status) {
  const n = asNumber(status);
  return n != null && n >= 500 && n <= 599;
}

function endpointPath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url || '');
  }
}

function safeBodySnippet(text) {
  return String(text || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function tradeFetchDiagnostic({ url, pairId, actionName = null, source = 'alcor', status, body = '', retryCount = 0, category = '', error = '' }) {
  const httpStatus = asNumber(status);
  const failureCategory = category || (isUpstreamServerErrorStatus(httpStatus)
    ? 'upstream_5xx'
    : (httpStatus === 404 ? 'unsupported' : 'failed'));
  return {
    source: source || 'alcor',
    pair_id: safeString(pairId) || null,
    action_name: actionName ? safeString(actionName) : null,
    endpoint_path: endpointPath(url),
    http_status: httpStatus,
    response_body_snippet: safeBodySnippet(body || error),
    retry_count: retryCount,
    failure_type: failureCategory,
    upstream_server_error: failureCategory === 'upstream_5xx',
    budget_failure: failureCategory === 'budget',
    unsupported: failureCategory === 'unsupported',
  };
}

function tradeFetchSummary(diagnostics) {
  return (diagnostics || []).map((item) => ({
    endpoint_path: item.endpoint_path || '',
    http_status: item.http_status ?? null,
    action_name: item.action_name || null,
    retry_count: item.retry_count ?? 0,
    failure_type: item.failure_type || null,
    row_count: item.row_count ?? null,
  }));
}

function isLegacyTradeFetchDiagnostic(diagnostic) {
  const text = JSON.stringify(diagnostic || {});
  return /filter=alcordexmain|market_id=|\/api\/v2\/markets\//.test(text);
}

function isTemporaryTradeFailureType(failureType) {
  return ['upstream_5xx', 'timeout', 'rate_limited', 'budget_limited', 'budget'].includes(String(failureType || ''));
}

function normalizeCandleInterval(value) {
  const text = String(value || '1D').trim().toLowerCase();
  if (text === '1d' || text === 'd') return '1D';
  if (text === '1m') return '1m';
  return text.toUpperCase();
}

function referenceCandleSource(source) {
  const key = moonboysCandleSource(source);
  return CANDLE_REFERENCE_SOURCE_BY_RUNTIME[key] || key;
}

function moonboysCandleSource(source) {
  const key = String(source || '').trim().toLowerCase();
  return CANDLE_SOURCE_ALIASES[key] || aggregateSourceKey(key);
}

function indexedCandleTradeSources() {
  return CANDLE_TRADE_SOURCES.slice();
}

function candleTradeSourceNamesFor(source) {
  const runtimeSource = moonboysCandleSource(source);
  const names = new Set([runtimeSource]);
  const referenceSource = referenceCandleSource(runtimeSource);
  if (referenceSource) names.add(referenceSource);
  for (const [alias, canonical] of Object.entries(CANDLE_SOURCE_ALIASES)) {
    if (canonical === runtimeSource) names.add(alias);
  }
  return [...names].filter(Boolean);
}

function countBySource(rows, valueKey = 'count') {
  const counts = {};
  for (const row of rows || []) {
    const source = moonboysCandleSource(row.source);
    if (!source) continue;
    counts[source] = (counts[source] || 0) + (asNumber(row[valueKey]) ?? 0);
  }
  return counts;
}

function incrementSourceCounter(target, source, amount = 1) {
  const key = moonboysCandleSource(source);
  if (!key) return;
  target[key] = (target[key] || 0) + amount;
}

function mergeSourceCounters(previous, current) {
  const merged = { ...(previous && typeof previous === 'object' ? previous : {}) };
  for (const [source, value] of Object.entries(current || {})) {
    merged[source] = (asNumber(merged[source]) || 0) + (asNumber(value) || 0);
  }
  return merged;
}

function mergeSourceExamples(previous, current, limit = 3) {
  const merged = {};
  const sources = new Set([
    ...Object.keys(previous && typeof previous === 'object' ? previous : {}),
    ...Object.keys(current && typeof current === 'object' ? current : {}),
  ]);
  const exampleKey = (example) => [
    example?.source || '',
    example?.candidate_pair_id || '',
    example?.observed_trade_pair_id || '',
    example?.reason || '',
  ].join('::');
  for (const source of sources) {
    const currentExamples = current && typeof current === 'object' ? current[source] : null;
    const previousExamples = previous && typeof previous === 'object' ? previous[source] : null;
    const examples = [
      ...(Array.isArray(currentExamples) ? currentExamples : []),
      ...(Array.isArray(previousExamples) ? previousExamples : []),
    ];
    if (!Array.isArray(examples)) continue;
    const seen = new Set();
    for (const example of examples) {
      const key = exampleKey(example);
      if (seen.has(key)) continue;
      seen.add(key);
      merged[source] = [...(merged[source] || []), example].slice(0, limit);
      if (merged[source].length >= limit) break;
    }
  }
  return merged;
}

function addSourceExample(target, source, example, limit = 3) {
  const key = moonboysCandleSource(source);
  if (!key || !example) return;
  const current = Array.isArray(target[key]) ? target[key] : [];
  if (current.length >= limit) return;
  target[key] = [...current, example].slice(0, limit);
}

function candleBackfillLookbackCutoffIso(now = Date.now()) {
  return new Date(now - (CANDLE_BACKFILL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)).toISOString();
}

function canonicalSwapAlcorPoolId(value = {}) {
  return safeString(firstPresent(value.id, value.poolId, value.pool_id, value.pair_id, value.pairId));
}

function canonicalSwapAlcorActionPoolId(record = {}, row = {}) {
  return safeString(firstPresent(record.poolId, record.pool_id, row.poolId, row.pool_id, record.id, record.pair_id, row.pair_id));
}

function canonicalTacoPairId(value = {}) {
  return safeString(firstPresent(value.id, value.pair_id, value.pairId));
}

function canonicalTacoActionPairId(record = {}, row = {}) {
  return safeString(firstPresent(record.id, row.id, record.pair_id, row.pair_id, record.pairId, row.pairId));
}

function canonicalDefiboxPairId(value = {}) {
  return safeString(firstPresent(value.pair_id, value.pairId, value.id));
}

function canonicalDefiboxActionPairId(record = {}, row = {}) {
  return safeString(firstPresent(record.pair_id, row.pair_id, record.pairId, row.pairId, record.id, row.id));
}

function canonicalNeftyPairId(value = {}) {
  return safeString(firstPresent(value.code, value.pair_id, value.pairId, value.id));
}

function canonicalNeftyActionPairId(record = {}, row = {}) {
  return safeString(firstPresent(record.code, row.code, record.pair_id, row.pair_id, record.pairId, row.pairId, record.id, row.id));
}

function canonicalAmmPairId(source, value = {}, row = {}) {
  if (source === 'swap.alcor') return canonicalSwapAlcorPoolId(value);
  if (source === 'swap.taco') return canonicalTacoPairId(value);
  if (source === 'swap.box') return canonicalDefiboxPairId(value);
  if (source === 'swap.nefty') return canonicalNeftyPairId(value);
  return safeString(firstPresent(value.id, value.code, value.pair_id, value.pairId, row?.pair_id, row?.pairId));
}

function canonicalAmmActionPairId(source, record = {}, row = {}) {
  if (source === 'swap.alcor') return canonicalSwapAlcorActionPoolId(record, row);
  if (source === 'swap.taco') return canonicalTacoActionPairId(record, row);
  if (source === 'swap.box') return canonicalDefiboxActionPairId(record, row);
  if (source === 'swap.nefty') return canonicalNeftyActionPairId(record, row);
  return safeString(firstPresent(record.id, record.pair_id, record.pairId, record.code, row?.pair_id, row?.pairId, row?.id, row?.code));
}

function candleUrlExample(source, pairId) {
  const src = moonboysCandleSource(source);
  const id = safeString(pairId);
  if (!src || !id) return null;
  return `${WAXONEDGE_API_PREFIX}/candles?duration=1d&src=${encodeURIComponent(src)}&pair_id=${encodeURIComponent(id)}`;
}

function referenceCandleUrlExample(source, pairId) {
  const src = referenceCandleSource(source);
  const id = safeString(pairId);
  if (!src || !id) return null;
  return `${WAXONEDGE_API_PREFIX}/candles?duration=1d&src=${encodeURIComponent(src)}&pair_id=${encodeURIComponent(id)}`;
}

function selectCoreDexAdapterForCron(minute) {
  return CORE_DEX_ADAPTERS[Math.floor(Math.max(0, minute) / 4) % CORE_DEX_ADAPTERS.length];
}

const CORE_DEX_ADAPTERS = Object.freeze([
  {
    source: 'swap.alcor',
    label: 'Alcor',
    referenceSource: 'alcorv2',
    dexCode: 'a2',
    poolType: 'poolsv3',
    contract: 'swap.alcor',
    table: 'pools',
    normalizer: 'tokenA-tokenB',
    feeScale: 100,
    explorer: 'https://waxblock.io/account/swap.alcor',
  },
  {
    source: 'swap.taco',
    label: 'Taco',
    referenceSource: 'taco',
    dexCode: 't',
    poolType: 'pools',
    contract: 'swap.taco',
    table: 'pairs',
    normalizer: 'pool1-pool2',
    defaultFeeBps: 30,
    explorer: 'https://waxblock.io/account/swap.taco',
  },
  {
    source: 'swap.nefty',
    label: 'NeftyBlocks',
    referenceSource: 'neftyblocks',
    dexCode: 'n',
    poolType: 'pools',
    contract: 'swap.nefty',
    table: 'pairs',
    normalizer: 'reserve0-reserve1',
    defaultFeeBps: 30,
    explorer: 'https://waxblock.io/account/swap.nefty',
  },
  {
    source: 'swap.box',
    label: 'BOX',
    referenceSource: 'defibox',
    dexCode: 'd',
    poolType: 'pools',
    contract: 'swap.box',
    table: 'pairs',
    normalizer: 'box-pairs',
    defaultFeeBps: 30,
    explorer: 'https://waxblock.io/account/swap.box',
  },
  {
    source: 'swap.adex',
    label: 'A-DEX',
    referenceSource: 'adex',
    dexCode: 'a',
    poolType: 'pools',
    contract: 'swap.adex',
    table: 'pools',
    normalizer: 'adex-pools',
    explorer: 'https://waxblock.io/account/swap.adex',
  },
  {
    source: 'dapp.fusion',
    label: 'WaxFusion',
    referenceSource: 'waxfusion',
    dexCode: 'wf',
    poolType: 'poolsSpecial',
    contract: 'dapp.fusion',
    table: 'global',
    normalizer: 'waxfusion-global',
    defaultFeeBps: 0,
    explorer: 'https://waxblock.io/account/dapp.fusion',
  },
]);

const AMM_SWAP_ACTION_STREAMS = Object.freeze([
  {
    source: 'swap.alcor',
    referenceSource: 'alcorv2',
    account: 'swap.alcor',
    action: 'logswap',
    parser: 'swap-v3',
  },
  {
    source: 'swap.taco',
    referenceSource: 'taco',
    account: 'swap.taco',
    action: 'exchangelog',
    parser: 'swap-v2-taco',
  },
  {
    source: 'swap.box',
    referenceSource: 'defibox',
    account: 'swap.box',
    action: 'swaplog',
    parser: 'swap-v2-defibox',
  },
  {
    source: 'swap.nefty',
    referenceSource: 'neftyblocks',
    account: 'swap.nefty',
    action: 'logswap',
    parser: 'swap-v2-nefty',
  },
]);

const AMM_TRADE_SOURCES = Object.freeze(AMM_SWAP_ACTION_STREAMS.map((stream) => stream.source));

const REFERENCE_QUOTE_TOKENS = Object.freeze([
  ['usdt.alcor', 'USDT'],
  ['eth.token', 'WAXUSDT'],
  ['eth.token', 'WAXUSDC'],
  ['eth.token', 'WAXDAI'],
  ['eth.token', 'WAXBUSD'],
  ['eth.token', 'WAXWBTC'],
  ['s.architect', 'ARBTC'],
  ['eth.token', 'WAXRBTC'],
  ['eth.token', 'WAXWETH'],
  ['eosio.token', 'WAX'],
]);

const PREFERRED_QUOTES = Object.freeze(
  REFERENCE_QUOTE_TOKENS.map(([contract, symbol]) => tokenKey(contract, symbol)),
);

function aggregateSourceKey(source) {
  return String(source || '').trim().toLowerCase();
}

function sourceCoverageFromKeys(sourceKeys) {
  const keys = new Set(Array.isArray(sourceKeys) ? sourceKeys.map(aggregateSourceKey).filter(Boolean) : []);
  return {
    alcor: keys.has('alcor'),
    swap_alcor: keys.has('swap.alcor'),
    swap_taco: keys.has('swap.taco'),
    swap_nefty: keys.has('swap.nefty'),
    swap_box: keys.has('swap.box'),
    swap_adex: keys.has('swap.adex'),
    dapp_fusion: keys.has('dapp.fusion'),
  };
}

function parseSourceKeys(value) {
  if (Array.isArray(value)) return value.map(aggregateSourceKey).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(aggregateSourceKey)
    .filter(Boolean);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function waxonedgeJson(payload, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

function envelope({ ok = true, data = null, warnings = [], error = null, updatedAt = null }) {
  const body = {
    ok,
    source: 'moonboys-api/waxonedge',
    updated_at: updatedAt,
    data,
    warnings,
  };
  if (error) body.error = error;
  return body;
}

function ok(data, warnings = [], updatedAt = null, corsHeaders = {}) {
  return waxonedgeJson(envelope({ ok: true, data, warnings, updatedAt }), 200, corsHeaders);
}

function unavailable(message, status = 503, corsHeaders = {}) {
  return waxonedgeJson(envelope({
    ok: false,
    data: null,
    warnings: [message || REQUIRES_INDEXED_BACKEND],
    error: message || REQUIRES_INDEXED_BACKEND,
  }), status, corsHeaders);
}

function nowIso() {
  return new Date().toISOString();
}

function safeString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function safeDecimal(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = String(value).trim();
  return /^[-+]?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(text) ? text : null;
}

function incrementNumericCursor(cursor) {
  const text = String(cursor || '').trim();
  if (!/^\d+$/.test(text)) return '';
  try {
    return String(BigInt(text) + 1n);
  } catch {
    return '';
  }
}

function asNumber(value) {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function sourceRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeContract(value) {
  return String(value || '').trim().toLowerCase();
}

function parseAsset(asset) {
  const raw = String(asset || '').trim();
  const match = raw.match(/^([+-]?\d+(?:\.\d+)?)\s+([A-Z0-9._-]+)$/i);
  if (!match) return { raw, amount: asNumber(raw), symbol: '', precision: null };
  return {
    raw,
    amount: asNumber(match[1]),
    symbol: normalizeSymbol(match[2]),
    precision: match[1].includes('.') ? match[1].split('.')[1].length : 0,
  };
}

function decimalAmountFromValue(value, precision = null) {
  const amount = asNumber(value);
  if (amount == null) return null;
  const decimals = precision == null || precision === '' ? null : Number(precision);
  const text = String(value || '').trim();
  if (!Number.isFinite(decimals) || decimals <= 0 || text.includes('.')) return amount;
  const scale = 10 ** decimals;
  if (!Number.isFinite(scale) || scale <= 1) return amount;
  return amount / scale;
}

function parseSymbolCode(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d+),([A-Z0-9._-]+)$/i);
  if (!match) return { precision: null, symbol: normalizeSymbol(text) };
  return { precision: Number(match[1]), symbol: normalizeSymbol(match[2]) };
}

function tokenKey(contract, symbol) {
  const c = normalizeContract(contract);
  const s = normalizeSymbol(symbol);
  return c && s ? `${c}::${s}` : '';
}

function getSymbolValue(symbolField) {
  if (symbolField == null) return '';
  if (typeof symbolField === 'string') return normalizeSymbol(symbolField);
  if (typeof symbolField === 'object') {
    return normalizeSymbol(symbolField.name || symbolField.symbol || symbolField.code || '');
  }
  return '';
}

function getTokenSideInfo(side) {
  if (!side) return { symbol: '', contract: '', quantity: '', amount: null, decimals: null };
  if (typeof side === 'string') {
    const parsed = parseAsset(side);
    return {
      symbol: parsed.symbol || normalizeSymbol(side),
      contract: '',
      quantity: parsed.raw,
      amount: parsed.amount,
      decimals: parsed.precision,
    };
  }
  const quantity = side.quantity || side.reserve || side.amount || side.balance || side.value || '';
  const parsed = parseAsset(quantity);
  const parsedSymbolCode = parseSymbolCode(side.symbol);
  const precision = side.decimals != null
    ? Number(side.decimals)
    : (side.precision != null ? Number(side.precision) : (parsed.precision ?? parsedSymbolCode.precision));
  const amount = parsed.symbol ? parsed.amount : decimalAmountFromValue(quantity, precision);
  const symbol = parsed.symbol ||
    parsedSymbolCode.symbol ||
    getSymbolValue(side.symbol) ||
    side.currency ||
    side.token_symbol ||
    side.sym;
  return {
    symbol: normalizeSymbol(symbol),
    contract: normalizeContract(side.contract || side.contract_name || side.code || side.token_contract || side.scope),
    quantity: parsed.raw || String(quantity || ''),
    amount,
    decimals: precision,
    precision,
  };
}

function getPairTokens(pair) {
  const sides = [
    pair?.base_token,
    pair?.quote_token,
    pair?.base,
    pair?.target,
    pair?.pool1,
    pair?.pool2,
    pair?.token0,
    pair?.token1,
    pair?.token_a,
    pair?.token_b,
  ];
  const tokens = [];
  for (const side of sides) {
    const token = getTokenSideInfo(side);
    if (!token.symbol && !token.contract) continue;
    const key = tokenKey(token.contract, token.symbol);
    if (key && tokens.some((item) => tokenKey(item.contract, item.symbol) === key)) continue;
    tokens.push(token);
    if (tokens.length >= 2) break;
  }
  return tokens;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpcPost(path, body) {
  return fetchJson(WAX_RPC + path, {
    method: 'POST',
    timeoutMs: 12000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function recordSyncRun(db, source, status, startedAt, error = null) {
  await db.prepare(
    `INSERT INTO waxonedge_sync_runs (source, status, started_at, finished_at, error)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(source, status, startedAt, nowIso(), error ? String(error).slice(0, 1000) : null).run();
}

async function writeSnapshot(db, source, payload, fetchedAt) {
  if (LARGE_SNAPSHOT_SOURCES.includes(source) && Array.isArray(payload?.rows)) {
    throw new Error(`Refusing oversized raw DEX snapshot for ${source}; write compact metadata instead`);
  }
  await db.prepare(
    `INSERT INTO waxonedge_snapshots (source, fetched_at, payload_json)
     VALUES (?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       fetched_at = excluded.fetched_at,
       payload_json = excluded.payload_json`
  ).bind(source, fetchedAt, JSON.stringify(payload)).run();
}

async function writeCompactDexSnapshot(db, adapter, metadata, fetchedAt) {
  await writeSnapshot(db, `${adapter.source}_${adapter.table}`, {
    contract: adapter.contract,
    table: adapter.table,
    row_count: metadata.row_count || 0,
    page_count: metadata.page_count || 0,
    fetched_at: fetchedAt,
    truncated: !!metadata.truncated,
    status: metadata.status || null,
    request_count: metadata.request_count || 0,
    previous_cursor: metadata.previous_cursor || '',
    current_cursor: metadata.current_cursor ?? metadata.cursor ?? '',
    cursor_changed_at: metadata.cursor_changed_at || null,
    chunks_completed: metadata.chunks_completed || 0,
    retry_count: metadata.retry_count || 0,
    skipped_cursor_count: metadata.skipped_cursor_count || 0,
    skipped_cursor_reason: metadata.skipped_cursor_reason || null,
    error: metadata.error || null,
    cursor: metadata.cursor || '',
    sync_cycle_id: metadata.sync_cycle_id || '',
    compact: true,
  }, fetchedAt);
}

async function readSnapshot(db, source) {
  const row = await db.prepare(
    `SELECT fetched_at, payload_json FROM waxonedge_snapshots WHERE source = ? LIMIT 1`
  ).bind(source).first().catch(() => null);
  if (!row?.payload_json) return { fetched_at: null, data: null };
  try {
    return { fetched_at: row.fetched_at || null, data: JSON.parse(row.payload_json) };
  } catch {
    return { fetched_at: row.fetched_at || null, data: null };
  }
}

function buildTokenPriceIndex(tokens) {
  const index = new Map();
  for (const token of sourceRows(tokens)) {
    const symbol = normalizeSymbol(token.symbol || token.id);
    const contract = normalizeContract(token.contract);
    const key = tokenKey(contract, symbol);
    if (!key) continue;
    index.set(key, {
      priceWax: asNumber(token.system_price),
      priceUsd: asNumber(token.usd_price),
    });
  }
  return index;
}

function normalizeToken(token, pairCounts, syncedAt) {
  const symbol = normalizeSymbol(token.symbol || token.id);
  const contract = normalizeContract(token.contract);
  if (!symbol || !contract) return null;
  return {
    contract,
    symbol,
    decimals: token.decimals != null ? Number(token.decimals) : null,
    total_supply: safeDecimal(token.total_supply),
    max_supply: safeDecimal(token.max_supply),
    price_wax: safeDecimal(token.system_price),
    price_usd: safeDecimal(token.usd_price),
    pair_count: pairCounts.get(tokenKey(contract, symbol)) || 0,
    icon_url: safeString(token.logo || token.icon || token.image),
    updated_at: syncedAt,
  };
}

function normalizePair(pair, tickerByMarketId, priceIndex, syncedAt) {
  const ticker = tickerByMarketId.get(String(pair?.ticker_id || '')) ||
    tickerByMarketId.get(String(pair?.id || pair?.market_id || pair?.pair_id || '')) ||
    {};
  const pairId = safeString(ticker.market_id || pair?.id || pair?.market_id || pair?.pair_id || pair?.ticker_id);
  if (!pairId) return null;
  const tokens = getPairTokens(pair);
  if (tokens.length < 2) return null;
  const [tokenA, tokenB] = tokens;
  const price = safeDecimal(ticker.last_price ?? ticker.last ?? pair.last_price ?? pair.price);
  const change24 = safeDecimal(ticker.change24 ?? ticker.price_change_percent ?? ticker.change_24h);
  const volume24 = safeDecimal(ticker.base_volume ?? ticker.volume24 ?? ticker.volume_24h);
  const volume24Raw = asNumber(volume24);
  const reserveA = safeDecimal(tokenA.amount ?? ticker.base_amm_liquidity);
  const reserveB = safeDecimal(tokenB.amount ?? ticker.target_amm_liquidity);

  let liquidityWax = null;
  let liquidityUsd = null;
  const priceA = priceIndex.get(tokenKey(tokenA.contract, tokenA.symbol));
  const priceB = priceIndex.get(tokenKey(tokenB.contract, tokenB.symbol));
  const normalizedVolume = normalizeTokenAVolume(volume24Raw, tokenA, tokenB, price, priceIndex);
  const volume24Wax = normalizedVolume.wax;
  const volume24Usd = normalizedVolume.usd;
  if (tokenA.amount != null && tokenB.amount != null && priceA?.priceWax != null && priceB?.priceWax != null) {
    liquidityWax = safeDecimal((tokenA.amount * priceA.priceWax) + (tokenB.amount * priceB.priceWax));
  }
  if (tokenA.amount != null && tokenB.amount != null && priceA?.priceUsd != null && priceB?.priceUsd != null) {
    liquidityUsd = safeDecimal((tokenA.amount * priceA.priceUsd) + (tokenB.amount * priceB.priceUsd));
  }
  if (liquidityWax == null && normalizeSymbol(tokenB.symbol) === 'WAX') {
    const targetLiquidity = asNumber(ticker.target_amm_liquidity);
    const baseLiquidity = asNumber(ticker.base_amm_liquidity);
    const lastPrice = asNumber(ticker.last_price);
    if (targetLiquidity != null && baseLiquidity != null && lastPrice != null) {
      liquidityWax = safeDecimal(targetLiquidity + (baseLiquidity * lastPrice));
    }
  }
  if (liquidityUsd == null && liquidityWax != null) {
    const waxPrice = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
    if (waxPrice != null) liquidityUsd = safeDecimal(asNumber(liquidityWax) * waxPrice);
  }
  const sanitizedLiquidity = sanitizeLiquidityValues(liquidityWax, liquidityUsd, priceIndex);

  return {
    source: 'alcor',
    pair_id: pairId,
    token_a_contract: tokenA.contract || null,
    token_a_symbol: tokenA.symbol || null,
    token_b_contract: tokenB.contract || null,
    token_b_symbol: tokenB.symbol || null,
    price,
    change_24h: change24,
    volume_24h: volume24,
    volume_24h_wax: volume24Wax,
    volume_24h_usd: volume24Usd,
    liquidity_wax: sanitizedLiquidity.liquidityWax,
    liquidity_usd: sanitizedLiquidity.liquidityUsd,
    reserve_a: reserveA,
    reserve_b: reserveB,
    fee_bps: safeDecimal(pair.fee),
    updated_at: syncedAt,
  };
}

function isReasonablePairTvlUsd(value) {
  const usd = asNumber(value);
  return usd == null || (usd >= 0 && usd <= MAX_REASONABLE_PAIR_TVL_USD);
}

function sanitizeLiquidityValues(liquidityWax, liquidityUsd, priceIndex) {
  const wax = asNumber(liquidityWax);
  let usd = asNumber(liquidityUsd);
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  if (usd == null && wax != null && waxUsd != null) usd = wax * waxUsd;
  if (!isReasonablePairTvlUsd(usd)) {
    return { liquidityWax: null, liquidityUsd: null, skipped: true };
  }
  return {
    liquidityWax: safeDecimal(wax),
    liquidityUsd: safeDecimal(usd),
    skipped: false,
  };
}

function liquidityFromSides(tokenA, tokenB, priceIndex) {
  let liquidityWax = null;
  let liquidityUsd = null;
  const priceA = priceIndex.get(tokenKey(tokenA.contract, tokenA.symbol));
  const priceB = priceIndex.get(tokenKey(tokenB.contract, tokenB.symbol));
  if (tokenA.amount != null && tokenB.amount != null && priceA?.priceWax != null && priceB?.priceWax != null) {
    liquidityWax = safeDecimal((tokenA.amount * priceA.priceWax) + (tokenB.amount * priceB.priceWax));
  }
  if (tokenA.amount != null && tokenB.amount != null && priceA?.priceUsd != null && priceB?.priceUsd != null) {
    liquidityUsd = safeDecimal((tokenA.amount * priceA.priceUsd) + (tokenB.amount * priceB.priceUsd));
  }
  if (liquidityWax == null && normalizeSymbol(tokenA.symbol) === 'WAX' && tokenA.amount != null) {
    liquidityWax = safeDecimal(tokenA.amount * 2);
  }
  if (liquidityWax == null && normalizeSymbol(tokenB.symbol) === 'WAX' && tokenB.amount != null) {
    liquidityWax = safeDecimal(tokenB.amount * 2);
  }
  if (liquidityUsd == null && liquidityWax != null) {
    const waxPrice = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
    if (waxPrice != null) liquidityUsd = safeDecimal(asNumber(liquidityWax) * waxPrice);
  }
  return sanitizeLiquidityValues(liquidityWax, liquidityUsd, priceIndex);
}

function pairPriceWaxForToken(pair, contract, symbol) {
  const key = tokenKey(contract, symbol);
  const tokenAKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
  const tokenBKey = tokenKey(pair.token_b_contract, pair.token_b_symbol);
  const tokenAWax = normalizeContract(pair.token_a_contract) === 'eosio.token' && normalizeSymbol(pair.token_a_symbol) === 'WAX';
  const tokenBWax = normalizeContract(pair.token_b_contract) === 'eosio.token' && normalizeSymbol(pair.token_b_symbol) === 'WAX';
  const reserveA = asNumber(pair.reserve_a);
  const reserveB = asNumber(pair.reserve_b);
  if (key === tokenAKey && tokenBWax) {
    if (pair.price != null) return asNumber(pair.price);
    if (reserveA != null && reserveA > 0 && reserveB != null) return reserveB / reserveA;
  }
  if (key === tokenBKey && tokenAWax) {
    const sourcePrice = asNumber(pair.price);
    if (sourcePrice != null && sourcePrice > 0) return 1 / sourcePrice;
    if (reserveB != null && reserveB > 0 && reserveA != null) return reserveA / reserveB;
  }
  return null;
}

function hasRealPairReserves(pair) {
  const reserveA = asNumber(pair.reserve_a);
  const reserveB = asNumber(pair.reserve_b);
  return reserveA != null && reserveA > 0 && reserveB != null && reserveB > 0;
}

function hasWaxQuoteForToken(pair, contract, symbol) {
  const key = tokenKey(contract, symbol);
  const tokenAKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
  const tokenBKey = tokenKey(pair.token_b_contract, pair.token_b_symbol);
  const waxKey = tokenKey('eosio.token', 'WAX');
  return (key === tokenAKey && tokenBKey === waxKey) || (key === tokenBKey && tokenAKey === waxKey);
}

function isWaxToken(contract, symbol) {
  return tokenKey(contract, symbol) === tokenKey('eosio.token', 'WAX');
}

function normalizeTokenAVolume(volume24Raw, tokenA, tokenB, pairPrice, priceIndex) {
  if (volume24Raw == null) return { wax: null, usd: null };
  const priceA = priceIndex.get(tokenKey(tokenA.contract, tokenA.symbol));
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  let volumeWax = priceA?.priceWax != null ? volume24Raw * priceA.priceWax : null;
  if (volumeWax == null && isWaxToken(tokenA.contract, tokenA.symbol)) {
    volumeWax = volume24Raw;
  } else if (volumeWax == null && isWaxToken(tokenB.contract, tokenB.symbol)) {
    const price = asNumber(pairPrice);
    if (price != null && price > 0) volumeWax = volume24Raw * price;
  }
  let volumeUsd = priceA?.priceUsd != null ? volume24Raw * priceA.priceUsd : null;
  if (volumeUsd == null && volumeWax != null && waxUsd != null) {
    volumeUsd = volumeWax * waxUsd;
  }
  return {
    wax: safeDecimal(volumeWax),
    usd: safeDecimal(volumeUsd),
  };
}

function isFalseLike(value) {
  return value === false || value === 0 || String(value).toLowerCase() === 'false';
}

function adapterFeeBps(adapter, row) {
  if (adapter.normalizer === 'adex-pools') {
    const poolFee = asNumber(parseAsset(row.pool_fee).amount ?? row.pool_fee);
    const platformFee = asNumber(parseAsset(row.platform_fee).amount ?? row.platform_fee);
    const totalFee = (poolFee || 0) + (platformFee || 0);
    const feeBps = Math.round(totalFee * 100 * 100) / 100;
    return feeBps > 0 ? safeDecimal(feeBps) : null;
  }
  const rawFee = asNumber(row.fee ?? row.marketFee ?? row.pool_fee);
  if (rawFee != null) {
    return safeDecimal(adapter.feeScale ? rawFee / adapter.feeScale : rawFee);
  }
  return adapter.defaultFeeBps != null ? safeDecimal(adapter.defaultFeeBps) : null;
}

function waxFusionTokenSides(row) {
  const waxAvailable = getTokenSideInfo({
    contract: 'eosio.token',
    quantity: row.wax_available_for_rentals,
  });
  const liquifiedLswax = getTokenSideInfo({
    contract: 'token.fusion',
    quantity: row.liquified_swax,
  });
  if (!waxAvailable.amount || !liquifiedLswax.amount) return { tokenA: null, tokenB: null, price: null };
  const backing = asNumber(parseAsset(row.swax_currently_backing_lswax).amount);
  const conversionPrice = backing && backing > 0 ? safeDecimal(liquifiedLswax.amount / backing) : null;
  return {
    tokenA: waxAvailable,
    tokenB: liquifiedLswax,
    price: conversionPrice,
  };
}

function normalizeCoreDexPair(adapter, row, priceIndex, syncedAt) {
  if (isFalseLike(row.active)) return null;
  let tokenA = null;
  let tokenB = null;
  let explicitPrice = null;
  if (adapter.normalizer === 'tokenA-tokenB') {
    tokenA = getTokenSideInfo(row.tokenA);
    tokenB = getTokenSideInfo(row.tokenB);
  } else if (adapter.normalizer === 'pool1-pool2') {
    tokenA = getTokenSideInfo(row.pool1);
    tokenB = getTokenSideInfo(row.pool2);
  } else if (adapter.normalizer === 'reserve0-reserve1') {
    tokenA = getTokenSideInfo(row.reserve0);
    tokenB = getTokenSideInfo(row.reserve1);
  } else if (adapter.normalizer === 'box-pairs') {
    tokenA = getTokenSideInfo({
      contract: row.token0?.contract,
      symbol: row.token0?.symbol,
      quantity: row.reserve0,
    });
    tokenB = getTokenSideInfo({
      contract: row.token1?.contract,
      symbol: row.token1?.symbol,
      quantity: row.reserve1,
    });
  } else if (adapter.normalizer === 'adex-pools') {
    tokenA = getTokenSideInfo(row.base_token);
    tokenB = getTokenSideInfo(row.quote_token);
  } else if (adapter.normalizer === 'waxfusion-global') {
    const sides = waxFusionTokenSides(row);
    tokenA = sides.tokenA;
    tokenB = sides.tokenB;
    explicitPrice = sides.price;
  }
  if (!tokenA?.contract || !tokenA?.symbol || !tokenB?.contract || !tokenB?.symbol) return null;
  if (tokenA.amount == null || tokenB.amount == null) return null;
  if (tokenA.amount <= 0 || tokenB.amount <= 0) return null;
  const pairId = canonicalAmmPairId(adapter.source, row) ||
    (adapter.normalizer === 'waxfusion-global' ? 'dapp.fusion' : null);
  if (!pairId) return null;
  const price = explicitPrice || (tokenA.amount > 0 ? safeDecimal(tokenB.amount / tokenA.amount) : null);
  const liquidity = liquidityFromSides(tokenA, tokenB, priceIndex);
  const volume24 = safeDecimal(row.volume_24h ?? row.volume24);
  const volume24Raw = asNumber(volume24);
  const normalizedVolume = normalizeTokenAVolume(volume24Raw, tokenA, tokenB, price, priceIndex);
  const volume24Wax = normalizedVolume.wax;
  const volume24Usd = normalizedVolume.usd;
  return {
    source: adapter.source,
    pair_id: String(pairId),
    token_a_contract: tokenA.contract,
    token_a_symbol: tokenA.symbol,
    token_b_contract: tokenB.contract,
    token_b_symbol: tokenB.symbol,
    price,
    change_24h: null,
    volume_24h: volume24,
    volume_24h_wax: volume24Wax,
    volume_24h_usd: volume24Usd,
    liquidity_wax: liquidity.liquidityWax,
    liquidity_usd: liquidity.liquidityUsd,
    reserve_a: safeDecimal(tokenA.amount),
    reserve_b: safeDecimal(tokenB.amount),
    fee_bps: adapterFeeBps(adapter, row),
    updated_at: syncedAt,
  };
}

async function getAbiTableNames(contract) {
  const abi = await rpcPost('/v1/chain/get_abi', { account_name: contract });
  return Array.isArray(abi?.abi?.tables)
    ? abi.abi.tables.map((table) => table.name).filter(Boolean)
    : [];
}

async function fetchTableRows(contract, table, options = {}) {
  const limit = options.limit || CHAIN_TABLE_PAGE_LIMIT;
  const requestBudget = Math.max(1, Number(options.requestBudget || options.maxPages || MAX_CHAIN_TABLE_PAGES));
  const maxPages = Math.min(options.maxPages || MAX_CHAIN_TABLE_PAGES, requestBudget);
  const rows = [];
  let lowerBound = options.lowerBound || '';
  let nextKey = '';
  let truncated = false;
  let pageCount = 0;
  let requestCount = 0;
  let complete = false;
  for (let page = 0; page < maxPages; page += 1) {
    if (requestCount >= requestBudget) {
      truncated = true;
      break;
    }
    const data = await rpcPost('/v1/chain/get_table_rows', {
      code: contract,
      scope: contract,
      table,
      json: true,
      lower_bound: lowerBound,
      limit,
    });
    requestCount += 1;
    pageCount += 1;
    if (Array.isArray(data?.rows)) rows.push(...data.rows);
    nextKey = data?.next_key || '';
    if (!data?.more || !nextKey) {
      complete = true;
      break;
    }
    if (page === maxPages - 1) {
      truncated = true;
      break;
    }
    lowerBound = nextKey;
  }
  return { rows, truncated, complete, next_key: nextKey, page_count: pageCount, request_count: requestCount };
}

async function upsertPairs(db, pairs) {
  if (!pairs.length) return;
  const statements = pairs.map((pair) => db.prepare(
    `INSERT INTO waxonedge_pairs
     (source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
      price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd, liquidity_wax, liquidity_usd,
      reserve_a, reserve_b, fee_bps, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, pair_id) DO UPDATE SET
       token_a_contract = excluded.token_a_contract,
       token_a_symbol = excluded.token_a_symbol,
       token_b_contract = excluded.token_b_contract,
       token_b_symbol = excluded.token_b_symbol,
       price = excluded.price,
       change_24h = excluded.change_24h,
       volume_24h = excluded.volume_24h,
       volume_24h_wax = excluded.volume_24h_wax,
       volume_24h_usd = excluded.volume_24h_usd,
       liquidity_wax = excluded.liquidity_wax,
       liquidity_usd = excluded.liquidity_usd,
       reserve_a = excluded.reserve_a,
       reserve_b = excluded.reserve_b,
       fee_bps = excluded.fee_bps,
       updated_at = excluded.updated_at`
  ).bind(
    pair.source, pair.pair_id, pair.token_a_contract, pair.token_a_symbol,
    pair.token_b_contract, pair.token_b_symbol, pair.price, pair.change_24h,
    pair.volume_24h, pair.volume_24h_wax, pair.volume_24h_usd,
    pair.liquidity_wax, pair.liquidity_usd, pair.reserve_a,
    pair.reserve_b, pair.fee_bps, pair.updated_at,
  ));
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
}

function buildPairCounts(pairs) {
  const counts = new Map();
  for (const pair of sourceRows(pairs)) {
    for (const side of getPairTokens(pair)) {
      const key = tokenKey(side.contract, side.symbol);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function buildTickerIndex(tickers) {
  const index = new Map();
  for (const ticker of sourceRows(tickers)) {
    const marketId = ticker?.market_id != null ? String(ticker.market_id) : '';
    if (marketId) index.set(marketId, ticker);
    const tickerId = ticker?.ticker_id != null ? String(ticker.ticker_id) : '';
    if (tickerId) index.set(tickerId, ticker);
  }
  return index;
}

async function syncAlcorMarketData(env, reason, syncCycleId = '') {
  const db = env.DB;
  const startedAt = nowIso();
  try {
    const [tokens, pairs, tickers, globalAnalytics] = await Promise.all([
      fetchJson(`${ALCOR_API}/tokens`),
      fetchJson(`${ALCOR_API}/pairs`),
      fetchJson(`${ALCOR_API}/tickers`),
      fetchJson(`${ALCOR_API}/analytics/global`).catch((error) => ({ unavailable: true, error: error.message })),
    ]);
    const syncedAt = nowIso();
    await writeSnapshot(db, 'alcor_tokens', tokens, syncedAt);
    await writeSnapshot(db, 'alcor_pairs', pairs, syncedAt);
    await writeSnapshot(db, 'alcor_tickers', tickers, syncedAt);
    await writeSnapshot(db, 'alcor_global', globalAnalytics, syncedAt);

    const tokenRows = sourceRows(tokens);
    const pairRows = sourceRows(pairs);
    const pairCounts = buildPairCounts(pairRows);
    const normalizedTokens = tokenRows
      .map((token) => normalizeToken(token, pairCounts, syncedAt))
      .filter(Boolean);
    const priceIndex = buildTokenPriceIndex(tokens);
    const tickerIndex = buildTickerIndex(tickers);
    const normalizedPairs = pairRows
      .map((pair) => normalizePair(pair, tickerIndex, priceIndex, syncedAt))
      .filter(Boolean);

    const tokenStatements = normalizedTokens.map((token) => db.prepare(
      `INSERT INTO waxonedge_tokens
       (contract, symbol, decimals, total_supply, max_supply, price_wax, price_usd, pair_count, icon_url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(contract, symbol) DO UPDATE SET
         decimals = excluded.decimals,
         total_supply = excluded.total_supply,
         max_supply = excluded.max_supply,
         price_wax = excluded.price_wax,
         price_usd = excluded.price_usd,
         pair_count = excluded.pair_count,
         icon_url = excluded.icon_url,
         updated_at = excluded.updated_at`
    ).bind(
      token.contract, token.symbol, token.decimals, token.total_supply, token.max_supply,
      token.price_wax, token.price_usd, token.pair_count, token.icon_url, token.updated_at,
    ));
    if (tokenStatements.length) await db.batch(tokenStatements);
    await upsertPairs(db, normalizedPairs);

    await recordSyncRun(db, reason || 'alcor_market_data', 'success', startedAt);
    await recordSyncRun(db, 'alcor', 'success', startedAt);
    if (syncCycleId) {
      await upsertSourceIndexState(db, 'alcor', {
        sync_cycle_id: syncCycleId,
        cursor: '',
        page_count: 1,
        row_count: normalizedPairs.length,
        complete: 1,
        truncated: 0,
        status: 'success',
        error: null,
        started_at: startedAt,
      }).catch(() => {});
    }
    return { ok: true, tokens: normalizedTokens.length, pairs: normalizedPairs.length };
  } catch (error) {
    await recordSyncRun(db, reason || 'alcor_market_data', 'failed', startedAt, error?.message || String(error)).catch(() => {});
    await recordSyncRun(db, 'alcor', 'failed', startedAt, error?.message || String(error)).catch(() => {});
    if (syncCycleId) {
      await upsertSourceIndexState(db, 'alcor', {
        sync_cycle_id: syncCycleId,
        complete: 0,
        truncated: 0,
        status: 'failed',
        error: error?.message || String(error),
        started_at: startedAt,
      }).catch(() => {});
    }
    return { ok: false, error: error?.message || String(error) };
  }
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeTradeTimestamp(value) {
  const normalizedValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? `${value}Z`
    : value;
  const millis = tradeTimestampMillis({ traded_at: normalizedValue });
  return millis == null ? null : new Date(millis).toISOString();
}

function assetAmountFromAny(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const parsed = parseAsset(value);
    if (parsed.amount != null) return parsed.amount;
    const numeric = asNumber(value);
    if (numeric != null) return numeric;
  }
  return null;
}

function decimalFromLittleEndian(value) {
  if (Array.isArray(value)) {
    let result = 0n;
    for (let i = 0; i < value.length; i += 1) {
      const byte = BigInt(Number(value[i]) || 0);
      result += byte << BigInt(8 * i);
    }
    return result.toString();
  }
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value) && value.length > 4 && value.length % 2 === 0) {
    const hex = value.slice(2);
    let result = 0n;
    for (let i = 0; i < hex.length; i += 2) {
      const byte = BigInt(parseInt(hex.slice(i, i + 2), 16));
      result += byte << BigInt(8 * (i / 2));
    }
    return result.toString();
  }
  return value;
}

function parseAlcorMarketMatchAction(row) {
  const actionValue = typeof row?.action === 'string' ? row.action : null;
  const act = row?.act || row?.action_trace?.act || (typeof row?.action === 'object' ? row.action : null) || row;
  const actionName = (safeString(actionValue || act?.name || row?.act_name || row?.action_name || row?.name) || '').toLowerCase();
  const data = row?.data || act?.data || {};
  const record = data?.record || act?.data?.record || data || {};
  if (!['buymatch', 'sellmatch'].includes(actionName) && !record?.market && record?.market_id == null) return null;
  const market = record.market || {};
  const marketId = firstPresent(record.market_id, market.id, row?.market_id);
  if (marketId == null || marketId === '') return null;
  const side = actionName === 'sellmatch' ? 'sell' : (actionName === 'buymatch' ? 'buy' : safeString(record.side || row?.side).toLowerCase());
  return {
    id: firstPresent(record.id, row?.global_sequence, row?.global_sequence_num, row?.receipt?.global_sequence, row?.seq, row?.trx_id, row?.trx_id && row?.action_ordinal),
    order_id: firstPresent(record.id, row?.order_id),
    trx_id: firstPresent(row?.transaction_id, row?.trx_id, row?.trxid, row?.action_trace?.trx_id),
    action_ordinal: firstPresent(row?.action_ordinal, row?.receipt?.recv_sequence, row?.receipt?.global_sequence),
    global_sequence: firstPresent(row?.global_sequence, row?.global_sequence_num, row?.receipt?.global_sequence),
    block_num: firstPresent(row?.block, row?.block_num, row?.block_number),
    market_id: marketId,
    action_name: actionName,
    side,
    src: side ? `alcor_${side}` : 'alcor_match',
    asker: record.asker,
    bidder: record.bidder,
    unit_price: decimalFromLittleEndian(firstPresent(record.unit_price, row?.unit_price)),
    ask: firstPresent(record.ask, row?.ask),
    bid: firstPresent(record.bid, row?.bid),
    amount_ask: assetAmountFromAny(record.ask, row?.ask, record.amount_ask),
    amount_bid: assetAmountFromAny(record.bid, row?.bid, record.amount_bid),
    code_ask: parseAsset(record.ask).symbol || record.code_ask || row?.code_ask,
    code_bid: parseAsset(record.bid).symbol || record.code_bid || row?.code_bid,
    market_contract_base_token: market.base_token?.contract || record.market_contract_base_token,
    market_code_base_token: market.base_token?.sym ? String(market.base_token.sym).split(',')[1] : record.market_code_base_token,
    market_contract_quote_token: market.quote_token?.contract || record.market_contract_quote_token,
    market_code_quote_token: market.quote_token?.sym ? String(market.quote_token.sym).split(',')[1] : record.market_code_quote_token,
    updated_at_time: firstPresent(row?.updated_at_time, row?.timestamp, record.timestamp, row?.['@timestamp'], row?.block_time, row?.created_at),
    created_at: firstPresent(row?.timestamp, row?.['@timestamp'], row?.block_time, row?.created_at),
    raw_action: row,
  };
}

function alcorMarketTradePrice(row) {
  const unitPrice = firstPresent(row?.unit_price, row?.unitPrice);
  if (unitPrice != null) {
    const n = asNumber(unitPrice);
    if (n != null) return n / 100000000;
  }
  const price = firstPresent(row?.price, row?.execution_price, row?.rate, row?.ask_price, row?.bid_price);
  return asNumber(price);
}

function alcorMarketTradeVolume(row) {
  return assetAmountFromAny(
    row?.volume,
    row?.tokenWaxVolume,
    row?.volumeB,
    row?.volumeA,
    row?.amount,
    row?.quantity,
    row?.base_quantity,
    row?.quote_quantity,
    row?.bid,
    row?.ask,
  );
}

function normalizeAlcorMarketTradeRow(row, pair) {
  row = parseAlcorMarketMatchAction(row) || row;
  const pairId = safeString(pair?.pair_id || pair?.pairId || row?.market_id || row?.market?.id || row?.pair_id);
  if (!pairId) return null;
  const actionName = safeString(row?.action_name || row?.side || row?.type || 'match').toLowerCase() || 'match';
  const tradeIdValue = firstPresent(row?.order_id, row?.id, row?.trade_id, row?.match_id, row?.global_sequence, row?.seq, row?.tx_id, row?.trx_id, row?.action_ordinal);
  const tradeId = safeString(tradeIdValue);
  if (!tradeId) return null;
  const tradedAt = normalizeTradeTimestamp(firstPresent(
    row?.traded_at,
    row?.created_at,
    row?.updated_at_time,
    row?.block_time,
    row?.timestamp,
    row?.time,
  ));
  if (!tradedAt) return null;
  const price = safeDecimal(alcorMarketTradePrice(row));
  const volume = safeDecimal(alcorMarketTradeVolume(row));
  if (price == null) return null;
  const amount = safeDecimal(assetAmountFromAny(row?.amount, row?.quantity, row?.ask, row?.bid, row?.amount_bid, row?.amount_ask));
  const source = 'alcor';
  const contract = normalizeContract(pair?.token_a_contract || row?.contract || row?.base_contract || row?.market_contract_base_token || '');
  const symbol = normalizeSymbol(pair?.token_a_symbol || row?.symbol || row?.base_symbol || row?.market_code_base_token || row?.code_ask || '');
  return {
    source,
    trade_id: `${pairId}:${actionName}:${tradeId}`,
    pair_id: pairId,
    contract: contract || null,
    symbol: symbol || null,
    side: safeString(row?.side || row?.type || '') || null,
    price,
    amount,
    volume,
    tx_id: safeString(firstPresent(row?.tx_id, row?.trx_id, row?.transaction_id)) || null,
    traded_at: tradedAt,
    raw_json: JSON.stringify({
      reference_src: 'alcormarket',
      reference_table: 'marketMatches',
      reference_ingestion: 'Hyperion/state-history alcordexmain buymatch/sellmatch',
      unit_price: firstPresent(row?.unit_price, row?.unitPrice),
      market_id: pairId,
      action_name: actionName,
      src: row?.src || null,
      order_id: row?.order_id || null,
      global_sequence: row?.global_sequence || null,
      block_num: row?.block_num || null,
      row,
    }),
  };
}

function defaultAmmSwapActionStreams() {
  return AMM_SWAP_ACTION_STREAMS.map((stream) => `${stream.source}:${stream.action}`);
}

function findAmmSwapActionStream(keyOrSource, actionName = '') {
  const key = String(keyOrSource || '').trim().toLowerCase();
  const action = String(actionName || '').trim().toLowerCase();
  return AMM_SWAP_ACTION_STREAMS.find((stream) =>
    `${stream.source}:${stream.action}` === key ||
    (stream.source === key && (!action || stream.action === action)));
}

function ammSwapStreamUrl(env, stream, limit, cursor = '') {
  const endpoint = hyperionHistoryActionsEndpoint(env);
  const count = encodeURIComponent(String(Math.max(limit, DEFAULT_HYPERION_TRADE_SCAN_LIMIT)));
  const params = [
    `account=${encodeURIComponent(stream.account)}`,
    `act.name=${encodeURIComponent(stream.action)}`,
    'sort=desc',
    `limit=${count}`,
    'simple=true',
    'noBinary=true',
    'checkLib=true',
  ];
  if (cursor) params.push(`skip=${encodeURIComponent(String(cursor))}`);
  return `${endpoint}?${params.join('&')}`;
}

function parseAmmSwapAction(row, stream) {
  const actionValue = typeof row?.action === 'string' ? row.action : null;
  const act = row?.act || row?.action_trace?.act || (typeof row?.action === 'object' ? row.action : null) || row;
  const actionName = (safeString(actionValue || act?.name || row?.act_name || row?.action_name || row?.name) || '').toLowerCase();
  if (actionName && actionName !== stream.action) return null;
  const data = row?.data || act?.data || {};
  const record = data?.record || act?.data?.record || data || {};
  let pairId = null;
  let maker = null;
  let quantityIn = null;
  let quantityOut = null;
  let reserveA = null;
  let reserveB = null;
  let tokenA = null;
  let tokenB = null;
  let sender = null;
  let recipient = null;
  let sqrtPriceX64 = null;
  let liquidity = null;
  let tick = null;
  if (stream.parser === 'swap-v3') {
    pairId = canonicalAmmActionPairId(stream.source, record, row);
    sender = firstPresent(record.sender, row?.sender);
    recipient = firstPresent(record.recipient, row?.recipient);
    tokenA = firstPresent(record.tokenA, row?.tokenA);
    tokenB = firstPresent(record.tokenB, row?.tokenB);
    reserveA = firstPresent(record.reserveA, row?.reserveA);
    reserveB = firstPresent(record.reserveB, row?.reserveB);
    sqrtPriceX64 = firstPresent(record.sqrtPriceX64, row?.sqrtPriceX64);
    liquidity = firstPresent(record.liquidity, row?.liquidity);
    tick = firstPresent(record.tick, row?.tick);
    quantityIn = tokenA;
    quantityOut = tokenB;
    maker = sender;
  } else if (stream.parser === 'swap-v2-defibox') {
    pairId = canonicalAmmActionPairId(stream.source, record, row);
    maker = firstPresent(record.owner, record.maker, row?.owner);
    quantityIn = firstPresent(record.quantity_in, row?.quantity_in);
    quantityOut = firstPresent(record.quantity_out, row?.quantity_out);
    reserveA = firstPresent(record.reserve0, row?.reserve0);
    reserveB = firstPresent(record.reserve1, row?.reserve1);
  } else if (stream.parser === 'swap-v2-nefty') {
    pairId = canonicalAmmActionPairId(stream.source, record, row);
    maker = firstPresent(record.owner, record.maker, row?.owner);
    quantityIn = firstPresent(record.quantity_in, row?.quantity_in);
    quantityOut = firstPresent(record.quantity_out, row?.quantity_out);
    reserveA = firstPresent(record.reserve0?.quantity, record.reserve0, row?.reserve0?.quantity, row?.reserve0);
    reserveB = firstPresent(record.reserve1?.quantity, record.reserve1, row?.reserve1?.quantity, row?.reserve1);
  } else {
    pairId = canonicalAmmActionPairId(stream.source, record, row);
    maker = firstPresent(record.maker, record.owner, row?.maker);
    quantityIn = firstPresent(record.quantity_in, row?.quantity_in);
    quantityOut = firstPresent(record.quantity_out, row?.quantity_out);
    reserveA = firstPresent(record.pool1, record.reserveA, row?.pool1, row?.reserveA);
    reserveB = firstPresent(record.pool2, record.reserveB, row?.pool2, row?.reserveB);
  }
  if (pairId == null || pairId === '') return null;
  const parsedIn = parseAsset(quantityIn);
  const parsedOut = parseAsset(quantityOut);
  const parsedReserveA = parseAsset(reserveA);
  const parsedReserveB = parseAsset(reserveB);
  if (parsedIn.amount == null || parsedOut.amount == null || !parsedIn.symbol || !parsedOut.symbol) return null;
  return {
    id: firstPresent(row?.global_sequence, row?.global_sequence_num, row?.receipt?.global_sequence, row?.seq, row?.trx_id, row?.action_ordinal),
    trx_id: firstPresent(row?.transaction_id, row?.trx_id, row?.trxid, row?.action_trace?.trx_id),
    action_ordinal: firstPresent(row?.action_ordinal, row?.receipt?.recv_sequence, row?.receipt?.global_sequence),
    global_sequence: firstPresent(row?.global_sequence, row?.global_sequence_num, row?.receipt?.global_sequence),
    block_num: firstPresent(row?.block, row?.block_num, row?.block_number),
    pair_id: pairId,
    source: stream.source,
    reference_src: stream.referenceSource,
    action_name: stream.action,
    maker: maker || sender || recipient || null,
    sender,
    recipient,
    quantity_in: quantityIn,
    quantity_out: quantityOut,
    amount_in: Math.abs(Number(parsedIn.amount)),
    amount_out: Math.abs(Number(parsedOut.amount)),
    code_in: parsedIn.symbol,
    code_out: parsedOut.symbol,
    precision_in: parsedIn.precision,
    precision_out: parsedOut.precision,
    reserveA,
    reserveB,
    amount_reserveA: parsedReserveA.amount,
    amount_reserveB: parsedReserveB.amount,
    code_reserveA: parsedReserveA.symbol,
    code_reserveB: parsedReserveB.symbol,
    sqrtPriceX64,
    liquidity,
    tick,
    updated_at_time: firstPresent(row?.updated_at_time, row?.timestamp, record.timestamp, row?.['@timestamp'], row?.block_time, row?.created_at),
    created_at: firstPresent(row?.timestamp, row?.['@timestamp'], row?.block_time, row?.created_at),
    raw_action: row,
  };
}

function tradeRowSequenceAny(row) {
  return asNumber(firstPresent(
    row?.global_sequence,
    row?.global_sequence_num,
    row?.receipt?.global_sequence,
    row?.receipt?.recv_sequence,
    row?.action_trace?.receipt?.global_sequence,
  ));
}

function tradeRowBlockAny(row) {
  return asNumber(firstPresent(row?.block_num, row?.block, row?.block_number, row?.action_trace?.block_num));
}

function ammSwapTradePrice(row) {
  const amountIn = asNumber(row?.amount_in);
  const amountOut = asNumber(row?.amount_out);
  if (amountIn != null && amountIn > 0 && amountOut != null && amountOut > 0) {
    if (row?.code_in && row?.code_reserveA && row.code_in === row.code_reserveA) return amountIn / amountOut;
    return amountOut / amountIn;
  }
  const reserveA = asNumber(row?.amount_reserveA);
  const reserveB = asNumber(row?.amount_reserveB);
  if (reserveA != null && reserveA > 0 && reserveB != null && reserveB > 0) return reserveA / reserveB;
  return null;
}

function ammSwapTradeVolume(row) {
  if (row?.code_in === 'WAX') return row.amount_in;
  if (row?.code_out === 'WAX') return row.amount_out;
  return row.amount_in;
}

function normalizeAmmSwapTradeRow(row, stream) {
  row = row?.source === stream.source && row?.action_name === stream.action && row?.pair_id
    ? row
    : (parseAmmSwapAction(row, stream) || row);
  const pairId = safeString(row?.pair_id);
  if (!pairId) return null;
  const tradeIdValue = firstPresent(row?.id, row?.trade_id, row?.global_sequence, row?.trx_id, row?.action_ordinal);
  const tradeId = safeString(tradeIdValue);
  if (!tradeId) return null;
  const tradedAt = normalizeTradeTimestamp(firstPresent(
    row?.traded_at,
    row?.created_at,
    row?.updated_at_time,
    row?.block_time,
    row?.timestamp,
    row?.time,
  ));
  if (!tradedAt) return null;
  const price = safeDecimal(ammSwapTradePrice(row));
  const volume = safeDecimal(ammSwapTradeVolume(row));
  if (price == null || volume == null) return null;
  const amount = safeDecimal(row?.amount_in);
  const source = stream.source;
  return {
    source,
    trade_id: `${source}:${stream.action}:${pairId}:${tradeId}`,
    pair_id: pairId,
    contract: null,
    symbol: normalizeSymbol(row?.code_in) || null,
    side: 'swap',
    price,
    amount,
    volume,
    tx_id: safeString(firstPresent(row?.tx_id, row?.trx_id, row?.transaction_id)) || null,
    traded_at: tradedAt,
    raw_json: JSON.stringify({
      reference_src: stream.referenceSource,
      reference_table: stream.parser === 'swap-v3' ? 'swapVThreeOrders' : 'swapOrders',
      reference_ingestion: `Hyperion/state-history ${stream.account} ${stream.action}`,
      action_name: stream.action,
      pair_id: pairId,
      amount_in: row?.amount_in,
      amount_out: row?.amount_out,
      code_in: row?.code_in,
      code_out: row?.code_out,
      amount_reserveA: row?.amount_reserveA,
      amount_reserveB: row?.amount_reserveB,
      code_reserveA: row?.code_reserveA,
      code_reserveB: row?.code_reserveB,
      global_sequence: row?.global_sequence || null,
      block_num: row?.block_num || null,
      row,
    }),
  };
}

function defaultAlcorTradeActionStreams() {
  return ['buymatch', 'sellmatch'];
}

function normalizeActionStreamProgress(actionName, value = {}) {
  return {
    action_name: actionName,
    status: value.status || 'pending',
    pagination_mode: value.pagination_mode || 'skip',
    skip_cursor: Math.max(0, Math.floor(asNumber(value.skip_cursor) || 0)),
    last_sequence: value.last_sequence ?? null,
    last_block: value.last_block ?? null,
    last_indexed_timestamp: value.last_indexed_timestamp || null,
    page_count: Math.max(0, Math.floor(asNumber(value.page_count) || 0)),
    row_count: Math.max(0, Math.floor(asNumber(value.row_count) || 0)),
    rows_written: Math.max(0, Math.floor(asNumber(value.rows_written) || 0)),
    duplicate_rows_skipped: Math.max(0, Math.floor(asNumber(value.duplicate_rows_skipped) || 0)),
    complete: value.complete === true,
    last_error: value.last_error || null,
    updated_at: value.updated_at || null,
  };
}

function normalizeActionStreamProgressMap(value = {}, actionStreams = defaultAlcorTradeActionStreams()) {
  const map = {};
  for (const actionName of actionStreams) {
    map[actionName] = normalizeActionStreamProgress(actionName, value?.[actionName] || {});
  }
  return map;
}

function tradeRowSequence(row) {
  const parsed = parseAlcorMarketMatchAction(row) || row || {};
  return asNumber(firstPresent(
    parsed.global_sequence,
    row?.global_sequence,
    row?.global_sequence_num,
    row?.receipt?.global_sequence,
    row?.receipt?.recv_sequence,
    row?.action_trace?.receipt?.global_sequence,
  ));
}

function tradeRowBlock(row) {
  const parsed = parseAlcorMarketMatchAction(row) || row || {};
  return asNumber(firstPresent(
    parsed.block_num,
    row?.block_num,
    row?.block,
    row?.block_number,
    row?.action_trace?.block_num,
  ));
}

function maxNumberValue(values) {
  let max = null;
  for (const value of values || []) {
    const n = asNumber(value);
    if (n == null) continue;
    max = max == null ? n : Math.max(max, n);
  }
  return max;
}

function alcorMarketMatchStreamUrl(env, actionName, limit, cursor = '') {
  const endpoint = hyperionHistoryActionsEndpoint(env);
  const count = encodeURIComponent(String(Math.max(limit, DEFAULT_HYPERION_TRADE_SCAN_LIMIT)));
  const params = [
    'account=alcordexmain',
    `act.name=${encodeURIComponent(actionName)}`,
    'sort=desc',
    `limit=${count}`,
    'simple=true',
    'noBinary=true',
    'checkLib=true',
  ];
  if (cursor) params.push(`skip=${encodeURIComponent(String(cursor))}`);
  return `${endpoint}?${params.join('&')}`;
}

function alcorMarketMatchHistoryUrls(env, pairId, limit) {
  return ['buymatch', 'sellmatch'].map((actionName) => alcorMarketMatchStreamUrl(env, actionName, limit));
}

async function fetchAlcorMarketMatchStreamRows(env, actionName, limit, cursor = '') {
  if (!hyperionConfigured(env)) return hyperionNotConfiguredTradeResult(null, actionName);
  const attemptedEndpoints = [];
  const matchedRows = [];
  let rawRowCount = 0;
  let parsedRowCount = 0;
  let parserDiagnostic = null;
  let lastFailure = null;
  const url = alcorMarketMatchStreamUrl(env, actionName, limit, cursor);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const diagnostic = tradeFetchDiagnostic({
        url,
        pairId: null,
        actionName,
        status: response.status,
        body: text,
        category: isUpstreamServerErrorStatus(response.status) ? 'upstream_5xx' : (response.status === 404 ? 'unsupported' : 'failed'),
      });
      attemptedEndpoints.push(diagnostic);
      lastFailure = diagnostic;
    } else {
      let data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (error) {
        const diagnostic = tradeFetchDiagnostic({
          url,
          pairId: null,
          actionName,
          status: response.status,
          body: text || error?.message,
          category: 'invalid_payload',
        });
        attemptedEndpoints.push(diagnostic);
        const attemptedSummary = tradeFetchSummary(attemptedEndpoints);
        return {
          rows: [],
          invalidPayload: true,
          failed: true,
          diagnostic: { ...diagnostic, attempted_endpoints: attemptedSummary, ingestion_path: 'hyperion_marketMatches' },
          attempted_endpoints: attemptedSummary,
          ingestion_path: 'hyperion_marketMatches',
        };
      }
      const rows = sourceRows(data.actions || data.simple_actions || data);
      const parsedRows = rows
        .map(parseAlcorMarketMatchAction)
        .filter((row) => row && row.action_name === actionName);
      attemptedEndpoints.push({
        source: 'alcor',
        pair_id: null,
        action_name: actionName,
        endpoint_path: endpointPath(url),
        http_status: response.status,
        retry_count: 0,
        failure_type: null,
        row_count: parsedRows.length,
        ingestion_path: 'hyperion_marketMatches',
      });
      matchedRows.push(...parsedRows);
    }
  } catch (error) {
    const diagnostic = tradeFetchDiagnostic({
      url,
      pairId: null,
      actionName,
      status: null,
      body: error?.message || String(error),
      category: isSubrequestBudgetError(error) ? 'budget' : 'failed',
    });
    attemptedEndpoints.push(diagnostic);
    lastFailure = diagnostic;
    if (isSubrequestBudgetError(error)) {
      const attemptedSummary = tradeFetchSummary(attemptedEndpoints);
      return {
        rows: [],
        budgetFailure: true,
        diagnostic: { ...diagnostic, attempted_endpoints: attemptedSummary },
        attempted_endpoints: attemptedSummary,
        ingestion_path: 'hyperion_marketMatches',
      };
    }
  } finally {
    clearTimeout(timer);
  }
  const attemptedSummary = tradeFetchSummary(attemptedEndpoints);
  if (matchedRows.length) {
    const currentSkip = Math.max(0, Math.floor(asNumber(cursor) || 0));
    const nextSkip = currentSkip + matchedRows.length;
    return {
      rows: matchedRows,
      pagination_mode: 'skip',
      next_cursor: String(nextSkip),
      last_sequence: maxNumberValue(matchedRows.map(tradeRowSequence)),
      last_block: maxNumberValue(matchedRows.map(tradeRowBlock)),
      last_indexed_timestamp: matchedRows
        .map((row) => normalizeTradeTimestamp(firstPresent(row?.updated_at_time, row?.created_at, row?.timestamp, row?.raw_action?.timestamp)))
        .filter(Boolean)
        .sort()
        .pop() || null,
      diagnostic: {
        source: 'alcor',
        pair_id: null,
        action_name: actionName,
        endpoint_path: endpointPath(url),
        http_status: 200,
        retry_count: 0,
        row_count: matchedRows.length,
        ingestion_path: 'hyperion_marketMatches',
        attempted_endpoints: attemptedSummary,
      },
      attempted_endpoints: attemptedSummary,
      ingestion_path: 'hyperion_marketMatches',
    };
  }
  if (lastFailure) {
    const temporary = isTemporaryTradeFailureType(lastFailure.failure_type);
    const unsupported = lastFailure.failure_type === 'unsupported';
    return {
      rows: [],
      temporaryFailure: temporary,
      unsupported,
      failed: !temporary && !unsupported,
      diagnostic: { ...lastFailure, attempted_endpoints: attemptedSummary, ingestion_path: 'hyperion_marketMatches' },
      attempted_endpoints: attemptedSummary,
      ingestion_path: 'hyperion_marketMatches',
    };
  }
  return {
    rows: [],
    noTradeRows: true,
    diagnostic: {
      source: 'alcor',
      pair_id: null,
      action_name: actionName,
      endpoint_path: endpointPath(url),
      http_status: 200,
      retry_count: 0,
      row_count: 0,
      failure_type: 'no_marketMatches_for_action_stream_in_bounded_history_scan',
      ingestion_path: 'hyperion_marketMatches',
      attempted_endpoints: attemptedSummary,
    },
    attempted_endpoints: attemptedSummary,
    ingestion_path: 'hyperion_marketMatches',
  };
}

async function fetchAlcorMarketMatchHistoryRows(env, pairId, limit) {
  if (!hyperionConfigured(env)) return hyperionNotConfiguredTradeResult(pairId);
  const results = [];
  const attempted = [];
  for (const actionName of ['buymatch', 'sellmatch']) {
    const result = await fetchAlcorMarketMatchStreamRows(env, actionName, limit);
    attempted.push(...(result.attempted_endpoints || []));
    if (result.rows?.length) results.push(...result.rows.filter((row) => safeString(row.market_id) === safeString(pairId)));
    if (result.budgetFailure || result.temporaryFailure || result.failed || result.unsupported || result.invalidPayload) return { ...result, attempted_endpoints: attempted };
  }
  return {
    rows: results,
    diagnostic: {
      source: 'alcor',
      pair_id: safeString(pairId) || null,
      endpoint_path: 'Hyperion/state-history marketMatches',
      http_status: 200,
      retry_count: 0,
      row_count: results.length,
      ingestion_path: 'hyperion_marketMatches',
      attempted_endpoints: attempted,
    },
    attempted_endpoints: attempted,
    ingestion_path: 'hyperion_marketMatches',
    noTradeRows: results.length === 0,
  };
}

async function fetchAmmSwapStreamRows(env, stream, limit, cursor = '') {
  if (!hyperionConfigured(env)) {
    const diagnostic = {
      source: stream.source,
      pair_id: null,
      action_name: stream.action,
      endpoint_path: 'Hyperion/state-history AMM swap actions',
      http_status: null,
      response_body_snippet: 'WAXONEDGE_HYPERION_API is not configured',
      retry_count: 0,
      failure_type: 'hyperion_not_configured',
      upstream_server_error: false,
      budget_failure: false,
      unsupported: false,
      ingestion_path: 'hyperion_amm_swaps',
      attempted_endpoints: [],
    };
    return {
      rows: [],
      skipped: true,
      hyperionNotConfigured: true,
      diagnostic,
      attempted_endpoints: [],
      ingestion_path: 'hyperion_amm_swaps',
    };
  }
  const attemptedEndpoints = [];
  const matchedRows = [];
  let rawRowCount = 0;
  let parsedRowCount = 0;
  let parserDiagnostic = null;
  let lastFailure = null;
  const url = ammSwapStreamUrl(env, stream, limit, cursor);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const diagnostic = tradeFetchDiagnostic({
        url,
        source: stream.source,
        pairId: null,
        actionName: stream.action,
        status: response.status,
        body: text,
        category: isUpstreamServerErrorStatus(response.status) ? 'upstream_5xx' : (response.status === 404 ? 'unsupported' : 'failed'),
      });
      attemptedEndpoints.push(diagnostic);
      lastFailure = diagnostic;
    } else {
      let data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (error) {
        const diagnostic = tradeFetchDiagnostic({
          url,
          source: stream.source,
          pairId: null,
          actionName: stream.action,
          status: response.status,
          body: text || error?.message,
          category: 'invalid_payload',
        });
        attemptedEndpoints.push(diagnostic);
        const attemptedSummary = tradeFetchSummary(attemptedEndpoints);
        return {
          rows: [],
          invalidPayload: true,
          failed: true,
          diagnostic: { ...diagnostic, attempted_endpoints: attemptedSummary, ingestion_path: 'hyperion_amm_swaps' },
          attempted_endpoints: attemptedSummary,
          ingestion_path: 'hyperion_amm_swaps',
        };
      }
      const rows = sourceRows(data.actions || data.simple_actions || data);
      rawRowCount += rows.length;
      const parsedRows = rows
        .map((row) => parseAmmSwapAction(row, stream))
        .filter(Boolean);
      parsedRowCount += parsedRows.length;
      attemptedEndpoints.push({
        source: stream.source,
        pair_id: null,
        action_name: stream.action,
        account: stream.account,
        endpoint_path: endpointPath(url),
        http_status: response.status,
        retry_count: 0,
        failure_type: null,
        raw_row_count: rows.length,
        parsed_row_count: parsedRows.length,
        row_count: parsedRows.length,
        ingestion_path: 'hyperion_amm_swaps',
      });
      if (rows.length > 0 && parsedRows.length === 0) {
        parserDiagnostic = {
          source: stream.source,
          pair_id: null,
          action_name: stream.action,
          account: stream.account,
          endpoint_path: endpointPath(url),
          http_status: response.status,
          retry_count: 0,
          failure_type: 'amm_rows_unparseable',
          raw_row_count: rows.length,
          parsed_row_count: 0,
          row_count: 0,
          ingestion_path: 'hyperion_amm_swaps',
          attempted_endpoints: [],
        };
      }
      matchedRows.push(...parsedRows);
    }
  } catch (error) {
    const diagnostic = tradeFetchDiagnostic({
      url,
      source: stream.source,
      pairId: null,
      actionName: stream.action,
      status: null,
      body: error?.message || String(error),
      category: isSubrequestBudgetError(error) ? 'budget' : 'failed',
    });
    attemptedEndpoints.push(diagnostic);
    lastFailure = diagnostic;
    if (isSubrequestBudgetError(error)) {
      const attemptedSummary = tradeFetchSummary(attemptedEndpoints);
      return {
        rows: [],
        budgetFailure: true,
        diagnostic: { ...diagnostic, attempted_endpoints: attemptedSummary, ingestion_path: 'hyperion_amm_swaps' },
        attempted_endpoints: attemptedSummary,
        ingestion_path: 'hyperion_amm_swaps',
      };
    }
  } finally {
    clearTimeout(timer);
  }
  const attemptedSummary = tradeFetchSummary(attemptedEndpoints);
  if (matchedRows.length) {
    const currentSkip = Math.max(0, Math.floor(asNumber(cursor) || 0));
    const nextSkip = currentSkip + matchedRows.length;
    return {
      rows: matchedRows,
      pagination_mode: 'skip',
      next_cursor: String(nextSkip),
      last_sequence: maxNumberValue(matchedRows.map(tradeRowSequenceAny)),
      last_block: maxNumberValue(matchedRows.map(tradeRowBlockAny)),
      last_indexed_timestamp: matchedRows
        .map((row) => normalizeTradeTimestamp(firstPresent(row?.updated_at_time, row?.created_at, row?.raw_action?.timestamp)))
        .filter(Boolean)
        .sort()
        .pop() || null,
      diagnostic: {
        source: stream.source,
        pair_id: null,
        action_name: stream.action,
        endpoint_path: endpointPath(url),
        http_status: 200,
        retry_count: 0,
        row_count: matchedRows.length,
        ingestion_path: 'hyperion_amm_swaps',
        attempted_endpoints: attemptedSummary,
      },
      attempted_endpoints: attemptedSummary,
      ingestion_path: 'hyperion_amm_swaps',
    };
  }
  if (lastFailure) {
    const temporary = isTemporaryTradeFailureType(lastFailure.failure_type);
    const unsupported = lastFailure.failure_type === 'unsupported';
    return {
      rows: [],
      temporaryFailure: temporary,
      unsupported,
      failed: !temporary && !unsupported,
      diagnostic: { ...lastFailure, attempted_endpoints: attemptedSummary, ingestion_path: 'hyperion_amm_swaps' },
      attempted_endpoints: attemptedSummary,
      ingestion_path: 'hyperion_amm_swaps',
    };
  }
  if (rawRowCount > 0 && parsedRowCount === 0) {
    return {
      rows: [],
      failed: true,
      tradeRowsNotUsable: true,
      diagnostic: {
        ...parserDiagnostic,
        raw_row_count: rawRowCount,
        parsed_row_count: parsedRowCount,
        attempted_endpoints: attemptedSummary,
      },
      attempted_endpoints: attemptedSummary,
      ingestion_path: 'hyperion_amm_swaps',
    };
  }
  return {
    rows: [],
    noTradeRows: true,
    diagnostic: {
      source: stream.source,
      pair_id: null,
      action_name: stream.action,
      account: stream.account,
      endpoint_path: endpointPath(url),
      http_status: 200,
      retry_count: 0,
      row_count: 0,
      raw_row_count: 0,
      parsed_row_count: 0,
      failure_type: 'no_amm_swaps_for_action_stream_in_bounded_history_scan',
      ingestion_path: 'hyperion_amm_swaps',
      attempted_endpoints: attemptedSummary,
    },
    attempted_endpoints: attemptedSummary,
    ingestion_path: 'hyperion_amm_swaps',
  };
}

async function upsertTrades(db, trades) {
  if (!trades.length) return 0;
  const uniqueTrades = [];
  const seenKeys = new Set();
  for (const trade of trades) {
    const key = `${trade.source}::${trade.trade_id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueTrades.push(trade);
  }
  const existingKeys = new Set();
  for (let i = 0; i < uniqueTrades.length; i += 50) {
    const chunk = uniqueTrades.slice(i, i + 50);
    const where = chunk.map(() => '(source = ? AND trade_id = ?)').join(' OR ');
    const params = chunk.flatMap((trade) => [trade.source, trade.trade_id]);
    const rows = await db.prepare(
      `SELECT source, trade_id FROM waxonedge_trades WHERE ${where}`
    ).bind(...params).all().catch(() => ({ results: [] }));
    for (const row of rows.results || []) {
      existingKeys.add(`${row.source}::${row.trade_id}`);
    }
  }
  const newRowCount = uniqueTrades.reduce((count, trade) => (
    count + (existingKeys.has(`${trade.source}::${trade.trade_id}`) ? 0 : 1)
  ), 0);
  const statements = uniqueTrades.map((trade) => db.prepare(
    `INSERT INTO waxonedge_trades
     (source, trade_id, pair_id, contract, symbol, side, price, amount, volume, tx_id, traded_at, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, trade_id) DO UPDATE SET
       pair_id = excluded.pair_id,
       contract = excluded.contract,
       symbol = excluded.symbol,
       side = excluded.side,
       price = excluded.price,
       amount = excluded.amount,
       volume = excluded.volume,
       tx_id = excluded.tx_id,
       traded_at = excluded.traded_at,
       raw_json = excluded.raw_json`
  ).bind(
    trade.source,
    trade.trade_id,
    trade.pair_id,
    trade.contract,
    trade.symbol,
    trade.side,
    trade.price,
    trade.amount,
    trade.volume,
    trade.tx_id,
    trade.traded_at,
    trade.raw_json,
  ));
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
  return newRowCount;
}

async function syncAlcorMarketTradeRows(env) {
  const startedAt = nowIso();
  const state = await readSourceIndexState(env.DB, ALCOR_TRADE_INDEX_SOURCE);
  const previousSnapshot = await readSnapshot(env.DB, ALCOR_TRADE_INDEX_SOURCE);
  const previousData = previousSnapshot.data || {};
  const actionStreams = defaultAlcorTradeActionStreams();
  const streamProgress = normalizeActionStreamProgressMap(previousData.action_streams, actionStreams);
  const candidatePairCount = actionStreams.length;
  const limit = Math.max(1, Math.min(tradeIndexPairLimit(env), actionStreams.length));
  const rowsPerMarket = tradeRowsPerMarketLimit(env);
  const pagesPerRun = tradeStreamPagesPerRun(env);
  const streamRunLimit = Math.min(limit, pagesPerRun, actionStreams.length);
  if (!hyperionConfigured(env)) {
    const totalHyperionNotConfiguredCount = (asNumber(previousData.hyperion_not_configured_count) || 0) + 1;
    const cursor = state?.cursor || '';
    const visibleError = 'hyperion_not_configured: configure WAXONEDGE_HYPERION_API with a real WAX Hyperion history/get_actions base or endpoint';
    await upsertSourceIndexState(env.DB, ALCOR_TRADE_INDEX_SOURCE, {
      sync_cycle_id: state?.sync_cycle_id || `trades-${new Date().toISOString().slice(0, 10)}`,
      cursor,
      page_count: asNumber(state?.page_count) || 0,
      row_count: candidatePairCount,
      complete: 0,
      truncated: 0,
      status: 'skipped',
      error: null,
      started_at: startedAt,
    });
    const snapshot = {
      source: ALCOR_TRADE_INDEX_SOURCE,
      status: 'skipped',
      candidate_pair_count: candidatePairCount,
      action_stream_count: candidatePairCount,
      attempted_stream_count: asNumber(previousData.attempted_stream_count ?? previousData.attempted_pair_count) || 0,
      processed_stream_count: asNumber(previousData.processed_stream_count ?? previousData.processed_pair_count) || 0,
      processed_pair_count: asNumber(previousData.processed_pair_count) || 0,
      attempted_pair_count: asNumber(previousData.attempted_pair_count) || 0,
      failed_pair_count: asNumber(previousData.failed_pair_count) || 0,
      unsupported_pair_count: asNumber(previousData.unsupported_pair_count) || 0,
      temporarily_failed_pair_count: asNumber(previousData.temporarily_failed_pair_count) || 0,
      upstream_5xx_count: asNumber(previousData.upstream_5xx_count) || 0,
      upstream_bad_payload_count: asNumber(previousData.upstream_bad_payload_count) || 0,
      hyperion_not_configured: true,
      hyperion_not_configured_count: totalHyperionNotConfiguredCount,
      active_hyperion_endpoint: null,
      hyperion_query_shape: HYPERION_MARKET_MATCH_QUERY_SHAPE,
      bounded_history_seed: true,
      history_pagination_complete: false,
      pagination_mode: 'none',
      action_streams: streamProgress,
      hyperion_scan_no_market_matches_count: asNumber(previousData.hyperion_scan_no_market_matches_count) || 0,
      no_trade_rows_count: asNumber(previousData.no_trade_rows_count) || 0,
      trade_rows_indexed: asNumber(previousData.trade_rows_indexed) || 0,
      rows_written: asNumber(previousData.rows_written) || 0,
      last_run_rows_fetched: 0,
      last_run_rows_written: 0,
      duplicate_rows_skipped: asNumber(previousData.duplicate_rows_skipped) || 0,
      cursor,
      active_pair_limit: limit,
      active_stream_limit: limit,
      active_stream_pages_per_run: pagesPerRun,
      active_rows_per_market_limit: rowsPerMarket,
      budget_exhausted: false,
      trade_history_not_available_for_source: TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice(),
      trade_stream_not_verified_from_og_refs: TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
      reference_trade_source: 'Hyperion/state-history alcordexmain buymatch/sellmatch -> marketMatches',
      guessed_public_alcor_http_source_of_truth: false,
      sample_trade_fetch_failure: isLegacyTradeFetchDiagnostic(previousData.sample_trade_fetch_failure) ? null : (previousData.sample_trade_fetch_failure || null),
      sample_trade_fetch_success: previousData.sample_trade_fetch_success || null,
      last_error: visibleError,
      next_action: 'configure WAXONEDGE_HYPERION_API',
      no_fake_trades: true,
      plan: TRADE_INDEX_PLAN,
    };
    await writeSnapshot(env.DB, ALCOR_TRADE_INDEX_SOURCE, snapshot, nowIso());
    await recordSyncRun(env.DB, ALCOR_TRADE_INDEX_SOURCE, 'skipped', startedAt, visibleError);
    return { ok: true, ...snapshot };
  }
  const lastStreamIndex = Math.max(0, Math.floor(asNumber(previousData.last_stream_index) || 0));
  const candidateRows = [];
  for (let i = 0; i < actionStreams.length && candidateRows.length < streamRunLimit; i += 1) {
    const index = (lastStreamIndex + i) % actionStreams.length;
    const actionName = actionStreams[index];
    if (streamProgress[actionName]?.complete === true) continue;
    candidateRows.push(actionName);
  }
  const allStreamsCompleteBeforeRun = actionStreams.every((actionName) => streamProgress[actionName]?.complete === true);
  let attemptedPairCount = 0;
  let processedPairCount = 0;
  let failedPairCount = 0;
  let unsupportedPairCount = 0;
  let temporarilyFailedPairCount = 0;
  let upstream5xxCount = 0;
  let upstreamBadPayloadCount = 0;
  let hyperionNotConfiguredCount = 0;
  let hyperionScanNoRowsCount = 0;
  let noTradeRowsCount = 0;
  let rowsIndexed = 0;
  let rowsWritten = 0;
  let duplicateRowsSkipped = 0;
  let lastError = null;
  let boundedSkipWindowExhausted = false;
  let sampleTradeFetchFailure = isLegacyTradeFetchDiagnostic(previousData.sample_trade_fetch_failure) ? null : (previousData.sample_trade_fetch_failure || null);
  let sampleTradeFetchSuccess = previousData.sample_trade_fetch_success || null;
  let budgetExhausted = false;
  for (const actionName of candidateRows) {
    const actionState = streamProgress[actionName] || normalizeActionStreamProgress(actionName);
    const streamCursor = actionState.skip_cursor || 0;
    const skipWindow = hyperionSkipWindowState(streamCursor, rowsPerMarket);
    if (skipWindow.bounded_skip_window_exhausted) {
      boundedSkipWindowExhausted = true;
      actionState.status = 'partial';
      actionState.complete = false;
      actionState.pagination_mode = 'skip';
      actionState.bounded_skip_window_exhausted = true;
      actionState.hyperion_skip_window_limit = skipWindow.hyperion_skip_window_limit;
      actionState.last_valid_skip_cursor = skipWindow.last_valid_skip_cursor;
      actionState.last_error = null;
      actionState.next_action = HYPERION_SKIP_WINDOW_NEXT_ACTION;
      actionState.updated_at = nowIso();
      continue;
    }
    attemptedPairCount += 1;
    try {
      const result = await fetchAlcorMarketMatchStreamRows(env, actionName, rowsPerMarket, streamCursor);
      if (result.diagnostic?.row_count > 0) sampleTradeFetchSuccess = result.diagnostic;
      if (result.diagnostic && result.diagnostic.failure_type) sampleTradeFetchFailure = result.diagnostic;
      if (result.hyperionNotConfigured) {
        hyperionNotConfiguredCount += 1;
        actionState.status = 'skipped';
        actionState.last_error = 'hyperion_not_configured';
        actionState.updated_at = nowIso();
        lastError = 'hyperion_not_configured: set WAXONEDGE_HYPERION_API to a WAX Hyperion endpoint that supports /v2/history/get_actions';
        break;
      }
      if (result.budgetFailure) {
        budgetExhausted = true;
        actionState.status = 'budget_limited';
        actionState.last_error = result.diagnostic?.response_body_snippet || 'trade row fetch budget exhausted';
        actionState.updated_at = nowIso();
        lastError = result.diagnostic?.response_body_snippet || 'trade row fetch budget exhausted';
        break;
      }
      if (result.temporaryFailure) {
        temporarilyFailedPairCount += 1;
        if (result.diagnostic?.failure_type === 'upstream_5xx') upstream5xxCount += 1;
        actionState.status = 'partial';
        actionState.last_error = result.diagnostic?.failure_type || 'temporary failure';
        actionState.updated_at = nowIso();
        lastError = `${result.diagnostic?.http_status || 'upstream'} ${result.diagnostic?.failure_type || 'temporary failure'}`;
        continue;
      }
      if (result.failed) {
        failedPairCount += 1;
        if (result.invalidPayload || result.diagnostic?.failure_type === 'invalid_payload') upstreamBadPayloadCount += 1;
        if (result.tradeRowsNotUsable || result.diagnostic?.failure_type === 'amm_rows_unparseable') tradeRowsNotUsableCount += 1;
        actionState.status = 'failed';
        actionState.last_error = result.diagnostic?.failure_type || 'failed';
        actionState.updated_at = nowIso();
        lastError = `${result.diagnostic?.http_status || 'fetch'} ${result.diagnostic?.failure_type || 'failed'}`;
        continue;
      }
      if (result.unsupported) {
        unsupportedPairCount += 1;
        actionState.status = 'unsupported';
        actionState.last_error = `trade_history_endpoint_unavailable: ${actionName}`;
        actionState.updated_at = nowIso();
        lastError = `trade_history_endpoint_unavailable: alcor action stream ${actionName}`;
        continue;
      }
      if (result.noTradeRows || !result.rows.length) {
        noTradeRowsCount += 1;
        if (result.diagnostic?.failure_type === 'no_marketMatches_for_action_stream_in_bounded_history_scan') hyperionScanNoRowsCount += 1;
        actionState.status = 'complete';
        actionState.complete = true;
        actionState.page_count += 1;
        actionState.last_error = result.diagnostic?.failure_type || 'no_trade_rows';
        actionState.updated_at = nowIso();
        lastError = `${result.diagnostic?.failure_type || 'no_trade_rows'}: alcor action stream ${actionName}`;
        continue;
      }
      const trades = result.rows
        .map((row) => normalizeAlcorMarketTradeRow(row))
        .filter(Boolean);
      if (!trades.length) {
        noTradeRowsCount += 1;
        actionState.status = 'partial';
        actionState.page_count += 1;
        actionState.last_error = `trade_rows_not_usable: ${actionName}`;
        actionState.updated_at = nowIso();
        lastError = `trade_rows_not_usable: alcor action stream ${actionName}`;
        continue;
      }
      const written = await upsertTrades(env.DB, trades);
      rowsIndexed += trades.length;
      rowsWritten += written;
      duplicateRowsSkipped += Math.max(0, trades.length - written);
      actionState.status = result.rows.length < rowsPerMarket ? 'complete' : 'partial';
      actionState.pagination_mode = result.pagination_mode || 'skip';
      const parsedNextCursor = asNumber(result.next_cursor);
      const nextSkipCursor = parsedNextCursor ?? (streamCursor + result.rows.length);
      actionState.skip_cursor = Math.max(actionState.skip_cursor, Math.floor(nextSkipCursor));
      actionState.bounded_skip_window_exhausted = false;
      actionState.hyperion_skip_window_limit = HYPERION_SKIP_WINDOW_LIMIT;
      actionState.last_valid_skip_cursor = hyperionSkipWindowState(actionState.skip_cursor, rowsPerMarket).last_valid_skip_cursor;
      actionState.last_sequence = result.last_sequence ?? actionState.last_sequence;
      actionState.last_block = result.last_block ?? actionState.last_block;
      actionState.last_indexed_timestamp = result.last_indexed_timestamp || actionState.last_indexed_timestamp;
      actionState.page_count += 1;
      actionState.row_count += result.rows.length;
      actionState.rows_written += written;
      actionState.duplicate_rows_skipped += Math.max(0, trades.length - written);
      actionState.complete = result.rows.length < rowsPerMarket;
      actionState.last_error = null;
      actionState.updated_at = nowIso();
      sampleTradeFetchFailure = null;
      processedPairCount += 1;
    } catch (error) {
      if (isSubrequestBudgetError(error)) {
        budgetExhausted = true;
        actionState.status = 'budget_limited';
        actionState.last_error = error?.message || String(error);
        actionState.updated_at = nowIso();
        lastError = error?.message || String(error);
        break;
      }
      failedPairCount += 1;
      actionState.status = 'failed';
      actionState.last_error = error?.message || String(error);
      actionState.updated_at = nowIso();
      lastError = error?.message || String(error);
    }
  }
  const hyperionNotConfigured = hyperionNotConfiguredCount > 0;
  const nextCursor = '';
  const complete = false;
  const nextStreamIndex = candidateRows.length
    ? (actionStreams.indexOf(candidateRows[candidateRows.length - 1]) + 1) % actionStreams.length
    : lastStreamIndex;
  const totalAttemptedPairCount = (asNumber(previousData.attempted_pair_count) || 0) + attemptedPairCount;
  const totalProcessedPairCount = (asNumber(previousData.processed_pair_count) || 0) + processedPairCount;
  const totalFailedPairCount = (asNumber(previousData.failed_pair_count) || 0) + failedPairCount;
  const totalUnsupportedPairCount = (asNumber(previousData.unsupported_pair_count) || 0) + unsupportedPairCount;
  const totalTemporarilyFailedPairCount = (asNumber(previousData.temporarily_failed_pair_count) || 0) + temporarilyFailedPairCount;
  const totalUpstream5xxCount = (asNumber(previousData.upstream_5xx_count) || 0) + upstream5xxCount;
  const totalUpstreamBadPayloadCount = (asNumber(previousData.upstream_bad_payload_count) || 0) + upstreamBadPayloadCount;
  const totalHyperionNotConfiguredCount = (asNumber(previousData.hyperion_not_configured_count) || 0) + hyperionNotConfiguredCount;
  const totalHyperionScanNoRowsCount = (asNumber(previousData.hyperion_scan_no_market_matches_count) || 0) + hyperionScanNoRowsCount;
  const totalNoTradeRowsCount = (asNumber(previousData.no_trade_rows_count) || 0) + noTradeRowsCount;
  const totalRowsIndexed = (asNumber(previousData.trade_rows_indexed) || 0) + rowsWritten;
  const totalRowsWritten = (asNumber(previousData.rows_written) || 0) + rowsWritten;
  const totalDuplicateRowsSkipped = (asNumber(previousData.duplicate_rows_skipped) || 0) + duplicateRowsSkipped;
  const lastStreamCursor = Math.max(0, ...actionStreams.map((actionName) => asNumber(streamProgress[actionName]?.skip_cursor) || 0));
  const lastStreamSequence = maxNumberValue(actionStreams.map((actionName) => streamProgress[actionName]?.last_sequence));
  const lastStreamBlock = maxNumberValue(actionStreams.map((actionName) => streamProgress[actionName]?.last_block));
  const allStreamsComplete = actionStreams.every((actionName) => streamProgress[actionName]?.complete === true);
  const anyBoundedSkipWindowExhausted = boundedSkipWindowExhausted || actionStreams.some((actionName) => streamProgress[actionName]?.bounded_skip_window_exhausted === true);
  const lastValidSkipCursor = Math.max(0, ...actionStreams.map((actionName) => asNumber(streamProgress[actionName]?.last_valid_skip_cursor) || hyperionSkipWindowState(0, rowsPerMarket).last_valid_skip_cursor));
  const hardFailure = failedPairCount > 0 && processedPairCount === 0 && unsupportedPairCount === 0 && !budgetExhausted;
  const status = hyperionNotConfigured
    ? 'skipped'
    : (hardFailure
    ? 'failed'
    : (budgetExhausted
    ? 'budget_limited'
    : (attemptedPairCount > 0 || allStreamsCompleteBeforeRun || allStreamsComplete || anyBoundedSkipWindowExhausted ? 'partial' : 'planned')));
  const hasCurrentFailure = hyperionNotConfigured || budgetExhausted || failedPairCount > 0 || temporarilyFailedPairCount > 0;
  const visibleError = (status === 'success' || (rowsWritten > 0 && !hasCurrentFailure))
    ? null
    : (lastError || (status === 'planned' ? TRADE_INDEX_PLAN : null));
  const sourceStateError = status === 'failed' ? visibleError : null;
  const sourceStateTruncated = status === 'failed' ? 1 : 0;
  await upsertSourceIndexState(env.DB, ALCOR_TRADE_INDEX_SOURCE, {
    sync_cycle_id: `trades-${new Date().toISOString().slice(0, 10)}`,
    cursor: nextCursor,
    page_count: attemptedPairCount,
    row_count: candidatePairCount,
    complete: complete ? 1 : 0,
    truncated: sourceStateTruncated,
    status,
    error: sourceStateError,
    started_at: startedAt,
  });
  await writeSnapshot(env.DB, ALCOR_TRADE_INDEX_SOURCE, {
    source: ALCOR_TRADE_INDEX_SOURCE,
    status,
    candidate_pair_count: candidatePairCount,
    action_stream_count: candidatePairCount,
    attempted_stream_count: totalAttemptedPairCount,
    processed_stream_count: totalProcessedPairCount,
    processed_pair_count: totalProcessedPairCount,
    attempted_pair_count: totalAttemptedPairCount,
    failed_pair_count: totalFailedPairCount,
    unsupported_pair_count: totalUnsupportedPairCount,
    temporarily_failed_pair_count: totalTemporarilyFailedPairCount,
    upstream_5xx_count: totalUpstream5xxCount,
    upstream_bad_payload_count: totalUpstreamBadPayloadCount,
    hyperion_not_configured: hyperionNotConfigured || !hyperionConfigured(env),
    hyperion_not_configured_count: totalHyperionNotConfiguredCount,
    active_hyperion_endpoint: hyperionHistoryActionsEndpoint(env) || null,
    hyperion_query_shape: HYPERION_MARKET_MATCH_QUERY_SHAPE,
    bounded_history_seed: false,
    history_pagination_complete: false,
    pagination_mode: 'skip',
    bounded_skip_window_exhausted: anyBoundedSkipWindowExhausted,
    hyperion_skip_window_limit: HYPERION_SKIP_WINDOW_LIMIT,
    last_valid_skip_cursor: lastValidSkipCursor,
    action_streams: streamProgress,
    last_stream_cursor: lastStreamCursor,
    last_stream_sequence: lastStreamSequence,
    last_stream_block: lastStreamBlock,
    last_stream_index: nextStreamIndex,
    hyperion_scan_no_market_matches_count: totalHyperionScanNoRowsCount,
    no_trade_rows_count: totalNoTradeRowsCount,
    trade_rows_indexed: totalRowsIndexed,
    rows_written: totalRowsWritten,
    last_run_rows_fetched: rowsIndexed,
    last_run_rows_written: rowsWritten,
    duplicate_rows_skipped: totalDuplicateRowsSkipped,
    cursor: nextCursor,
    active_pair_limit: limit,
    active_stream_limit: limit,
    active_stream_pages_per_run: pagesPerRun,
    active_rows_per_market_limit: rowsPerMarket,
    budget_exhausted: budgetExhausted,
    trade_history_not_available_for_source: TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice(),
    trade_stream_not_verified_from_og_refs: TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
    reference_trade_source: 'Hyperion/state-history alcordexmain buymatch/sellmatch -> marketMatches',
    guessed_public_alcor_http_source_of_truth: false,
    sample_trade_fetch_failure: sampleTradeFetchFailure,
    sample_trade_fetch_success: sampleTradeFetchSuccess,
    last_error: visibleError,
    next_action: hyperionNotConfigured
      ? 'configure WAXONEDGE_HYPERION_API with a real WAX Hyperion endpoint'
      : (anyBoundedSkipWindowExhausted
      ? HYPERION_SKIP_WINDOW_NEXT_ACTION
      : (allStreamsComplete ? 'skip pagination exhausted; sequence-complete replay not claimed' : 'continue per-action Hyperion skip pagination')),
    no_fake_trades: true,
    plan: TRADE_INDEX_PLAN,
  }, nowIso());
  await recordSyncRun(env.DB, ALCOR_TRADE_INDEX_SOURCE, status, startedAt, visibleError);
  return {
    ok: status !== 'failed',
    status,
    candidate_pair_count: candidatePairCount,
    action_stream_count: candidatePairCount,
    attempted_stream_count: totalAttemptedPairCount,
    processed_stream_count: totalProcessedPairCount,
    processed_pair_count: totalProcessedPairCount,
    attempted_pair_count: totalAttemptedPairCount,
    failed_pair_count: totalFailedPairCount,
    unsupported_pair_count: totalUnsupportedPairCount,
    temporarily_failed_pair_count: totalTemporarilyFailedPairCount,
    upstream_5xx_count: totalUpstream5xxCount,
    upstream_bad_payload_count: totalUpstreamBadPayloadCount,
    hyperion_not_configured: hyperionNotConfigured || !hyperionConfigured(env),
    hyperion_not_configured_count: totalHyperionNotConfiguredCount,
    active_hyperion_endpoint: hyperionHistoryActionsEndpoint(env) || null,
    hyperion_query_shape: HYPERION_MARKET_MATCH_QUERY_SHAPE,
    bounded_history_seed: false,
    history_pagination_complete: false,
    pagination_mode: 'skip',
    bounded_skip_window_exhausted: anyBoundedSkipWindowExhausted,
    hyperion_skip_window_limit: HYPERION_SKIP_WINDOW_LIMIT,
    last_valid_skip_cursor: lastValidSkipCursor,
    action_streams: streamProgress,
    last_stream_cursor: lastStreamCursor,
    last_stream_sequence: lastStreamSequence,
    last_stream_block: lastStreamBlock,
    last_stream_index: nextStreamIndex,
    hyperion_scan_no_market_matches_count: totalHyperionScanNoRowsCount,
    no_trade_rows_count: totalNoTradeRowsCount,
    trade_rows_indexed: totalRowsIndexed,
    rows_written: totalRowsWritten,
    last_run_rows_fetched: rowsIndexed,
    last_run_rows_written: rowsWritten,
    duplicate_rows_skipped: totalDuplicateRowsSkipped,
    cursor: nextCursor,
    active_pair_limit: limit,
    active_stream_limit: limit,
    active_stream_pages_per_run: pagesPerRun,
    active_rows_per_market_limit: rowsPerMarket,
    budget_exhausted: budgetExhausted,
    trade_history_not_available_for_source: TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice(),
    trade_stream_not_verified_from_og_refs: TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
    sample_trade_fetch_failure: sampleTradeFetchFailure,
    sample_trade_fetch_success: sampleTradeFetchSuccess,
    last_error: visibleError,
    next_action: hyperionNotConfigured
      ? 'configure WAXONEDGE_HYPERION_API with a real WAX Hyperion endpoint'
      : (anyBoundedSkipWindowExhausted
      ? HYPERION_SKIP_WINDOW_NEXT_ACTION
      : (allStreamsComplete ? 'skip pagination exhausted; sequence-complete replay not claimed' : 'continue per-action Hyperion skip pagination')),
    no_fake_trades: true,
    plan: TRADE_INDEX_PLAN,
  };
}

async function syncAmmSwapTradeRows(env) {
  const startedAt = nowIso();
  const state = await readSourceIndexState(env.DB, AMM_TRADE_INDEX_SOURCE);
  const previousSnapshot = await readSnapshot(env.DB, AMM_TRADE_INDEX_SOURCE);
  const previousData = previousSnapshot.data || {};
  const actionStreams = defaultAmmSwapActionStreams();
  const streamProgress = normalizeActionStreamProgressMap(previousData.action_streams, actionStreams);
  const candidatePairCount = actionStreams.length;
  const limit = Math.max(1, Math.min(tradeIndexPairLimit(env), actionStreams.length));
  const rowsPerMarket = tradeRowsPerMarketLimit(env);
  const pagesPerRun = tradeStreamPagesPerRun(env);
  const streamRunLimit = Math.min(limit, pagesPerRun, actionStreams.length);
  if (!hyperionConfigured(env)) {
    const totalHyperionNotConfiguredCount = (asNumber(previousData.hyperion_not_configured_count) || 0) + 1;
    const cursor = state?.cursor || '';
    const visibleError = 'hyperion_not_configured: configure WAXONEDGE_HYPERION_API with a real WAX Hyperion history/get_actions base or endpoint';
    await upsertSourceIndexState(env.DB, AMM_TRADE_INDEX_SOURCE, {
      sync_cycle_id: state?.sync_cycle_id || `amm-trades-${new Date().toISOString().slice(0, 10)}`,
      cursor,
      page_count: asNumber(state?.page_count) || 0,
      row_count: candidatePairCount,
      complete: 0,
      truncated: 0,
      status: 'skipped',
      error: null,
      started_at: startedAt,
    });
    const snapshot = {
      source: AMM_TRADE_INDEX_SOURCE,
      status: 'skipped',
      candidate_pair_count: candidatePairCount,
      action_stream_count: candidatePairCount,
      attempted_stream_count: asNumber(previousData.attempted_stream_count ?? previousData.attempted_pair_count) || 0,
      processed_stream_count: asNumber(previousData.processed_stream_count ?? previousData.processed_pair_count) || 0,
      processed_pair_count: asNumber(previousData.processed_pair_count) || 0,
      attempted_pair_count: asNumber(previousData.attempted_pair_count) || 0,
      failed_pair_count: asNumber(previousData.failed_pair_count) || 0,
      unsupported_pair_count: asNumber(previousData.unsupported_pair_count) || 0,
      temporarily_failed_pair_count: asNumber(previousData.temporarily_failed_pair_count) || 0,
      upstream_5xx_count: asNumber(previousData.upstream_5xx_count) || 0,
      upstream_bad_payload_count: asNumber(previousData.upstream_bad_payload_count) || 0,
      hyperion_not_configured: true,
      hyperion_not_configured_count: totalHyperionNotConfiguredCount,
      active_hyperion_endpoint: null,
      hyperion_query_shape: HYPERION_AMM_SWAP_QUERY_SHAPE,
      bounded_history_seed: false,
      history_pagination_complete: false,
      pagination_mode: 'none',
      bounded_skip_window_exhausted: false,
      hyperion_skip_window_limit: HYPERION_SKIP_WINDOW_LIMIT,
      last_valid_skip_cursor: hyperionSkipWindowState(0, rowsPerMarket).last_valid_skip_cursor,
      action_streams: streamProgress,
      no_trade_rows_count: asNumber(previousData.no_trade_rows_count) || 0,
      trade_rows_not_usable_count: asNumber(previousData.trade_rows_not_usable_count) || 0,
      trade_rows_indexed: asNumber(previousData.trade_rows_indexed) || 0,
      rows_written: asNumber(previousData.rows_written) || 0,
      last_run_rows_fetched: 0,
      last_run_rows_written: 0,
      duplicate_rows_skipped: asNumber(previousData.duplicate_rows_skipped) || 0,
      cursor,
      active_pair_limit: limit,
      active_stream_limit: limit,
      active_stream_pages_per_run: pagesPerRun,
      active_rows_per_market_limit: rowsPerMarket,
      budget_exhausted: false,
      configured_streams: AMM_SWAP_ACTION_STREAMS,
      sample_trade_fetch_failure: previousData.sample_trade_fetch_failure || null,
      sample_trade_fetch_success: previousData.sample_trade_fetch_success || null,
      last_error: visibleError,
      next_action: 'configure WAXONEDGE_HYPERION_API',
      no_fake_trades: true,
      plan: AMM_TRADE_INDEX_PLAN,
    };
    await writeSnapshot(env.DB, AMM_TRADE_INDEX_SOURCE, snapshot, nowIso());
    await recordSyncRun(env.DB, AMM_TRADE_INDEX_SOURCE, 'skipped', startedAt, visibleError);
    return { ok: true, ...snapshot };
  }
  const lastStreamIndex = Math.max(0, Math.floor(asNumber(previousData.last_stream_index) || 0));
  const candidateRows = [];
  for (let i = 0; i < actionStreams.length && candidateRows.length < streamRunLimit; i += 1) {
    const index = (lastStreamIndex + i) % actionStreams.length;
    const streamKey = actionStreams[index];
    if (streamProgress[streamKey]?.complete === true) continue;
    candidateRows.push(streamKey);
  }
  const allStreamsCompleteBeforeRun = actionStreams.every((streamKey) => streamProgress[streamKey]?.complete === true);
  let attemptedPairCount = 0;
  let processedPairCount = 0;
  let failedPairCount = 0;
  let unsupportedPairCount = 0;
  let temporarilyFailedPairCount = 0;
  let upstream5xxCount = 0;
  let upstreamBadPayloadCount = 0;
  let hyperionNotConfiguredCount = 0;
  let noTradeRowsCount = 0;
  let tradeRowsNotUsableCount = 0;
  let rowsIndexed = 0;
  let rowsWritten = 0;
  let duplicateRowsSkipped = 0;
  let lastError = null;
  let boundedSkipWindowExhausted = false;
  let sampleTradeFetchFailure = previousData.sample_trade_fetch_failure || null;
  let sampleTradeFetchSuccess = previousData.sample_trade_fetch_success || null;
  let budgetExhausted = false;
  for (const streamKey of candidateRows) {
    const stream = findAmmSwapActionStream(streamKey);
    if (!stream) continue;
    const actionState = streamProgress[streamKey] || normalizeActionStreamProgress(streamKey);
    const streamCursor = actionState.skip_cursor || 0;
    const skipWindow = hyperionSkipWindowState(streamCursor, rowsPerMarket);
    if (skipWindow.bounded_skip_window_exhausted) {
      boundedSkipWindowExhausted = true;
      actionState.status = 'partial';
      actionState.complete = false;
      actionState.pagination_mode = 'skip';
      actionState.bounded_skip_window_exhausted = true;
      actionState.hyperion_skip_window_limit = skipWindow.hyperion_skip_window_limit;
      actionState.last_valid_skip_cursor = skipWindow.last_valid_skip_cursor;
      actionState.last_error = null;
      actionState.next_action = HYPERION_SKIP_WINDOW_NEXT_ACTION;
      actionState.updated_at = nowIso();
      continue;
    }
    attemptedPairCount += 1;
    try {
      const result = await fetchAmmSwapStreamRows(env, stream, rowsPerMarket, streamCursor);
      if (result.diagnostic?.row_count > 0) sampleTradeFetchSuccess = result.diagnostic;
      if (result.diagnostic && result.diagnostic.failure_type) sampleTradeFetchFailure = result.diagnostic;
      if (result.hyperionNotConfigured) {
        hyperionNotConfiguredCount += 1;
        actionState.status = 'skipped';
        actionState.last_error = 'hyperion_not_configured';
        actionState.updated_at = nowIso();
        lastError = 'hyperion_not_configured: set WAXONEDGE_HYPERION_API to a WAX Hyperion endpoint that supports /v2/history/get_actions';
        break;
      }
      if (result.budgetFailure) {
        budgetExhausted = true;
        actionState.status = 'budget_limited';
        actionState.last_error = result.diagnostic?.response_body_snippet || 'AMM trade row fetch budget exhausted';
        actionState.updated_at = nowIso();
        lastError = result.diagnostic?.response_body_snippet || 'AMM trade row fetch budget exhausted';
        break;
      }
      if (result.temporaryFailure) {
        temporarilyFailedPairCount += 1;
        if (result.diagnostic?.failure_type === 'upstream_5xx') upstream5xxCount += 1;
        actionState.status = 'partial';
        actionState.last_error = result.diagnostic?.failure_type || 'temporary failure';
        actionState.updated_at = nowIso();
        lastError = `${result.diagnostic?.http_status || 'upstream'} ${result.diagnostic?.failure_type || 'temporary failure'}`;
        continue;
      }
      if (result.failed) {
        failedPairCount += 1;
        if (result.invalidPayload || result.diagnostic?.failure_type === 'invalid_payload') upstreamBadPayloadCount += 1;
        actionState.status = 'failed';
        actionState.last_error = result.diagnostic?.failure_type || 'failed';
        actionState.updated_at = nowIso();
        lastError = `${result.diagnostic?.http_status || 'fetch'} ${result.diagnostic?.failure_type || 'failed'}`;
        continue;
      }
      if (result.unsupported) {
        unsupportedPairCount += 1;
        actionState.status = 'unsupported';
        actionState.last_error = `trade_history_endpoint_unavailable: ${stream.source} ${stream.action}`;
        actionState.updated_at = nowIso();
        lastError = `trade_history_endpoint_unavailable: ${stream.source} ${stream.action}`;
        continue;
      }
      if (result.noTradeRows || !result.rows.length) {
        noTradeRowsCount += 1;
        actionState.status = 'complete';
        actionState.complete = true;
        actionState.page_count += 1;
        actionState.last_error = result.diagnostic?.failure_type || 'no_trade_rows';
        actionState.updated_at = nowIso();
        lastError = `${result.diagnostic?.failure_type || 'no_trade_rows'}: ${stream.source} ${stream.action}`;
        continue;
      }
      const trades = result.rows
        .map((row) => normalizeAmmSwapTradeRow(row, stream))
        .filter(Boolean);
      if (!trades.length) {
        tradeRowsNotUsableCount += 1;
        actionState.status = 'partial';
        actionState.page_count += 1;
        actionState.last_error = `trade_rows_not_usable: ${stream.source} ${stream.action}`;
        actionState.updated_at = nowIso();
        lastError = actionState.last_error;
        continue;
      }
      const written = await upsertTrades(env.DB, trades);
      rowsIndexed += trades.length;
      rowsWritten += written;
      duplicateRowsSkipped += Math.max(0, trades.length - written);
      actionState.status = result.rows.length < rowsPerMarket ? 'complete' : 'partial';
      actionState.pagination_mode = result.pagination_mode || 'skip';
      const parsedNextCursor = asNumber(result.next_cursor);
      const nextSkipCursor = parsedNextCursor ?? (streamCursor + result.rows.length);
      actionState.skip_cursor = Math.max(actionState.skip_cursor, Math.floor(nextSkipCursor));
      actionState.bounded_skip_window_exhausted = false;
      actionState.hyperion_skip_window_limit = HYPERION_SKIP_WINDOW_LIMIT;
      actionState.last_valid_skip_cursor = hyperionSkipWindowState(actionState.skip_cursor, rowsPerMarket).last_valid_skip_cursor;
      actionState.last_sequence = result.last_sequence ?? actionState.last_sequence;
      actionState.last_block = result.last_block ?? actionState.last_block;
      actionState.last_indexed_timestamp = result.last_indexed_timestamp || actionState.last_indexed_timestamp;
      actionState.page_count += 1;
      actionState.row_count += result.rows.length;
      actionState.rows_written += written;
      actionState.duplicate_rows_skipped += Math.max(0, trades.length - written);
      actionState.complete = result.rows.length < rowsPerMarket;
      actionState.last_error = null;
      actionState.updated_at = nowIso();
      sampleTradeFetchFailure = null;
      processedPairCount += 1;
    } catch (error) {
      if (isSubrequestBudgetError(error)) {
        budgetExhausted = true;
        actionState.status = 'budget_limited';
        actionState.last_error = error?.message || String(error);
        actionState.updated_at = nowIso();
        lastError = error?.message || String(error);
        break;
      }
      failedPairCount += 1;
      actionState.status = 'failed';
      actionState.last_error = error?.message || String(error);
      actionState.updated_at = nowIso();
      lastError = error?.message || String(error);
    }
  }
  const hyperionNotConfigured = hyperionNotConfiguredCount > 0;
  const nextCursor = '';
  const complete = false;
  const nextStreamIndex = candidateRows.length
    ? (actionStreams.indexOf(candidateRows[candidateRows.length - 1]) + 1) % actionStreams.length
    : lastStreamIndex;
  const totalAttemptedPairCount = (asNumber(previousData.attempted_pair_count) || 0) + attemptedPairCount;
  const totalProcessedPairCount = (asNumber(previousData.processed_pair_count) || 0) + processedPairCount;
  const totalFailedPairCount = (asNumber(previousData.failed_pair_count) || 0) + failedPairCount;
  const totalUnsupportedPairCount = (asNumber(previousData.unsupported_pair_count) || 0) + unsupportedPairCount;
  const totalTemporarilyFailedPairCount = (asNumber(previousData.temporarily_failed_pair_count) || 0) + temporarilyFailedPairCount;
  const totalUpstream5xxCount = (asNumber(previousData.upstream_5xx_count) || 0) + upstream5xxCount;
  const totalUpstreamBadPayloadCount = (asNumber(previousData.upstream_bad_payload_count) || 0) + upstreamBadPayloadCount;
  const totalHyperionNotConfiguredCount = (asNumber(previousData.hyperion_not_configured_count) || 0) + hyperionNotConfiguredCount;
  const totalNoTradeRowsCount = (asNumber(previousData.no_trade_rows_count) || 0) + noTradeRowsCount;
  const totalTradeRowsNotUsableCount = (asNumber(previousData.trade_rows_not_usable_count) || 0) + tradeRowsNotUsableCount;
  const totalRowsIndexed = (asNumber(previousData.trade_rows_indexed) || 0) + rowsWritten;
  const totalRowsWritten = (asNumber(previousData.rows_written) || 0) + rowsWritten;
  const totalDuplicateRowsSkipped = (asNumber(previousData.duplicate_rows_skipped) || 0) + duplicateRowsSkipped;
  const lastStreamCursor = Math.max(0, ...actionStreams.map((streamKey) => asNumber(streamProgress[streamKey]?.skip_cursor) || 0));
  const lastStreamSequence = maxNumberValue(actionStreams.map((streamKey) => streamProgress[streamKey]?.last_sequence));
  const lastStreamBlock = maxNumberValue(actionStreams.map((streamKey) => streamProgress[streamKey]?.last_block));
  const allStreamsComplete = actionStreams.every((streamKey) => streamProgress[streamKey]?.complete === true);
  const anyBoundedSkipWindowExhausted = boundedSkipWindowExhausted || actionStreams.some((streamKey) => streamProgress[streamKey]?.bounded_skip_window_exhausted === true);
  const lastValidSkipCursor = Math.max(0, ...actionStreams.map((streamKey) => asNumber(streamProgress[streamKey]?.last_valid_skip_cursor) || hyperionSkipWindowState(0, rowsPerMarket).last_valid_skip_cursor));
  const hardFailure = failedPairCount > 0 && processedPairCount === 0 && unsupportedPairCount === 0 && !budgetExhausted;
  const status = hyperionNotConfigured
    ? 'skipped'
    : (hardFailure
    ? 'failed'
    : (budgetExhausted
    ? 'budget_limited'
    : (attemptedPairCount > 0 || allStreamsCompleteBeforeRun || allStreamsComplete || anyBoundedSkipWindowExhausted ? 'partial' : 'planned')));
  const hasCurrentFailure = hyperionNotConfigured || budgetExhausted || failedPairCount > 0 || temporarilyFailedPairCount > 0;
  const visibleError = (status === 'success' || (rowsWritten > 0 && !hasCurrentFailure))
    ? null
    : (lastError || (status === 'planned' ? AMM_TRADE_INDEX_PLAN : null));
  const sourceStateError = status === 'failed' ? visibleError : null;
  const sourceStateTruncated = status === 'failed' ? 1 : 0;
  await upsertSourceIndexState(env.DB, AMM_TRADE_INDEX_SOURCE, {
    sync_cycle_id: `amm-trades-${new Date().toISOString().slice(0, 10)}`,
    cursor: nextCursor,
    page_count: attemptedPairCount,
    row_count: candidatePairCount,
    complete: complete ? 1 : 0,
    truncated: sourceStateTruncated,
    status,
    error: sourceStateError,
    started_at: startedAt,
  });
  const snapshot = {
    source: AMM_TRADE_INDEX_SOURCE,
    status,
    candidate_pair_count: candidatePairCount,
    action_stream_count: candidatePairCount,
    attempted_stream_count: totalAttemptedPairCount,
    processed_stream_count: totalProcessedPairCount,
    processed_pair_count: totalProcessedPairCount,
    attempted_pair_count: totalAttemptedPairCount,
    failed_pair_count: totalFailedPairCount,
    unsupported_pair_count: totalUnsupportedPairCount,
    temporarily_failed_pair_count: totalTemporarilyFailedPairCount,
    upstream_5xx_count: totalUpstream5xxCount,
    upstream_bad_payload_count: totalUpstreamBadPayloadCount,
    hyperion_not_configured: hyperionNotConfigured || !hyperionConfigured(env),
    hyperion_not_configured_count: totalHyperionNotConfiguredCount,
    active_hyperion_endpoint: hyperionHistoryActionsEndpoint(env) || null,
    hyperion_query_shape: HYPERION_AMM_SWAP_QUERY_SHAPE,
    bounded_history_seed: false,
    history_pagination_complete: false,
    pagination_mode: 'skip',
    bounded_skip_window_exhausted: anyBoundedSkipWindowExhausted,
    hyperion_skip_window_limit: HYPERION_SKIP_WINDOW_LIMIT,
    last_valid_skip_cursor: lastValidSkipCursor,
    action_streams: streamProgress,
    last_stream_cursor: lastStreamCursor,
    last_stream_sequence: lastStreamSequence,
    last_stream_block: lastStreamBlock,
    last_stream_index: nextStreamIndex,
    no_trade_rows_count: totalNoTradeRowsCount,
    trade_rows_not_usable_count: totalTradeRowsNotUsableCount,
    trade_rows_indexed: totalRowsIndexed,
    rows_written: totalRowsWritten,
    last_run_rows_fetched: rowsIndexed,
    last_run_rows_written: rowsWritten,
    duplicate_rows_skipped: totalDuplicateRowsSkipped,
    cursor: nextCursor,
    active_pair_limit: limit,
    active_stream_limit: limit,
    active_stream_pages_per_run: pagesPerRun,
    active_rows_per_market_limit: rowsPerMarket,
    budget_exhausted: budgetExhausted,
    configured_streams: AMM_SWAP_ACTION_STREAMS,
    trade_history_not_available_for_source: TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice(),
    trade_stream_not_verified_from_og_refs: TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
    sample_trade_fetch_failure: sampleTradeFetchFailure,
    sample_trade_fetch_success: sampleTradeFetchSuccess,
    last_error: visibleError,
    next_action: hyperionNotConfigured
      ? 'configure WAXONEDGE_HYPERION_API with a real WAX Hyperion endpoint'
      : (anyBoundedSkipWindowExhausted
      ? HYPERION_SKIP_WINDOW_NEXT_ACTION
      : (allStreamsComplete ? 'skip pagination exhausted; sequence-complete replay not claimed' : 'continue per-source AMM Hyperion skip pagination')),
    no_fake_trades: true,
    plan: AMM_TRADE_INDEX_PLAN,
  };
  await writeSnapshot(env.DB, AMM_TRADE_INDEX_SOURCE, snapshot, nowIso());
  await recordSyncRun(env.DB, AMM_TRADE_INDEX_SOURCE, status, startedAt, visibleError);
  return {
    ok: status !== 'failed',
    ...snapshot,
  };
}

async function readSourceIndexState(db, source) {
  return db.prepare(
    `SELECT source, sync_cycle_id, cursor, page_count, row_count, complete, truncated,
            status, error, started_at, updated_at
     FROM waxonedge_source_index_state
     WHERE source = ? LIMIT 1`
  ).bind(source).first().catch(() => null);
}

async function upsertSourceIndexState(db, source, patch) {
  const now = nowIso();
  const existing = await readSourceIndexState(db, source);
  const next = {
    sync_cycle_id: patch.sync_cycle_id ?? existing?.sync_cycle_id ?? '',
    cursor: patch.cursor ?? existing?.cursor ?? '',
    page_count: patch.page_count ?? existing?.page_count ?? 0,
    row_count: patch.row_count ?? existing?.row_count ?? 0,
    complete: patch.complete ?? existing?.complete ?? 0,
    truncated: patch.truncated ?? existing?.truncated ?? 0,
    status: patch.status ?? existing?.status ?? 'pending',
    error: Object.prototype.hasOwnProperty.call(patch, 'error') ? patch.error : existing?.error ?? null,
    started_at: patch.started_at ?? existing?.started_at ?? now,
    updated_at: patch.updated_at ?? now,
  };
  await db.prepare(
    `INSERT INTO waxonedge_source_index_state
     (source, sync_cycle_id, cursor, page_count, row_count, complete, truncated, status, error, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       sync_cycle_id = excluded.sync_cycle_id,
       cursor = excluded.cursor,
       page_count = excluded.page_count,
       row_count = excluded.row_count,
       complete = excluded.complete,
       truncated = excluded.truncated,
       status = excluded.status,
       error = excluded.error,
       started_at = excluded.started_at,
       updated_at = excluded.updated_at`
  ).bind(
    source,
    next.sync_cycle_id,
    next.cursor,
    next.page_count,
    next.row_count,
    next.complete,
    next.truncated,
    next.status,
    next.error ? String(next.error).slice(0, 1000) : null,
    next.started_at,
    next.updated_at,
  ).run();
  return { source, ...next };
}

async function getActiveSourceCycleId(db) {
  const rows = await db.prepare(
    `SELECT sync_cycle_id
     FROM waxonedge_source_index_state
     WHERE source IN (${CORE_DEX_ADAPTERS.map(() => '?').join(',')})
       AND complete = 0
       AND sync_cycle_id IS NOT NULL
       AND sync_cycle_id != ''
     ORDER BY updated_at DESC
     LIMIT 1`
  ).bind(...CORE_DEX_ADAPTERS.map((adapter) => adapter.source)).all().catch(() => ({ results: [] }));
  return rows.results?.[0]?.sync_cycle_id || `woe-${Date.now()}`;
}

async function syncCoreDexAdapters(env, syncCycleId = '', options = {}) {
  const startedAt = nowIso();
  const priceRows = await env.DB.prepare(
    `SELECT contract, symbol, price_wax, price_usd FROM waxonedge_tokens`
  ).all().catch(() => ({ results: [] }));
  const priceIndex = new Map();
  for (const row of priceRows.results || []) {
    priceIndex.set(tokenKey(row.contract, row.symbol), {
      priceWax: asNumber(row.price_wax),
      priceUsd: asNumber(row.price_usd),
    });
  }
  const results = [];
  const syncedAt = nowIso();
  const adapters = options.source
    ? CORE_DEX_ADAPTERS.filter((adapter) => adapter.source === options.source)
    : CORE_DEX_ADAPTERS;
  for (const adapter of adapters) {
    const adapterStartedAt = nowIso();
    let activeCycleId = syncCycleId || '';
    try {
      activeCycleId = activeCycleId || await getActiveSourceCycleId(env.DB);
      let state = await readSourceIndexState(env.DB, adapter.source);
      if (state?.complete === 1 && state.sync_cycle_id === activeCycleId) {
        results.push({ source: adapter.source, ok: true, complete: true, skipped: true, cycle: activeCycleId });
        continue;
      }
      if (state?.status === 'running' && minutesSince(state.updated_at || state.started_at) > SOURCE_STALE_MINUTES) {
        state = await upsertSourceIndexState(env.DB, adapter.source, {
          sync_cycle_id: activeCycleId,
          complete: 0,
          truncated: 0,
          status: 'partial',
          error: 'Resuming stale running state from saved cursor',
          started_at: state.started_at || adapterStartedAt,
        });
      }
      const isNewCycle = !state || state.sync_cycle_id !== activeCycleId || state.status === 'failed';
      if (isNewCycle) {
        await env.DB.prepare(`DELETE FROM waxonedge_pairs WHERE source = ?`).bind(adapter.source).run();
        state = await upsertSourceIndexState(env.DB, adapter.source, {
          sync_cycle_id: activeCycleId,
          cursor: '',
          page_count: 0,
          row_count: 0,
          complete: 0,
          truncated: 0,
          status: 'running',
          error: null,
          started_at: adapterStartedAt,
        });
      }
      const tables = await getAbiTableNames(adapter.contract);
      await writeSnapshot(env.DB, `${adapter.source}_abi`, {
        contract: adapter.contract,
        detected_tables: tables,
        expected_table: adapter.table,
        core_adapter: true,
      }, syncedAt);
      if (!tables.includes(adapter.table)) {
        const error = `ABI table not found: ${adapter.table}`;
        await recordSyncRun(env.DB, adapter.source, 'skipped', adapterStartedAt, error);
        await upsertSourceIndexState(env.DB, adapter.source, {
          sync_cycle_id: activeCycleId,
          complete: 0,
          truncated: 0,
          status: 'failed',
          error,
          started_at: state.started_at || adapterStartedAt,
        });
        results.push({ source: adapter.source, ok: true, skipped: true, error });
        continue;
      }
      const tableResult = await fetchTableRows(adapter.contract, adapter.table, {
        limit: CHAIN_TABLE_PAGE_LIMIT,
        lowerBound: state.cursor || '',
        maxPages: options.maxPages || coreDexPagesPerInvocation(env),
        requestBudget: options.requestBudget || coreDexRpcBudgetPerSource(env),
      });
      const rows = tableResult.rows;
      const pairs = rows
        .map((row) => normalizeCoreDexPair(adapter, row, priceIndex, syncedAt))
        .filter(Boolean);
      await upsertPairs(env.DB, pairs);
      const complete = tableResult.complete ? 1 : 0;
      const status = complete ? 'success' : 'partial';
      let error = complete ? null : `Partial source sync checkpoint saved after ${tableResult.page_count} page(s) and ${tableResult.request_count} table row request(s); next_key=${tableResult.next_key || 'unknown'}`;
      const previousSnapshot = await readSnapshot(env.DB, `${adapter.source}_${adapter.table}`);
      const previousCursor = state.cursor || '';
      const reportedCursor = complete ? '' : (tableResult.next_key || '');
      const cursorChanged = previousCursor !== reportedCursor;
      const sameSnapshotCycle = previousSnapshot.data?.sync_cycle_id === activeCycleId;
      const previousRetryCount = sameSnapshotCycle ? (asNumber(previousSnapshot.data?.retry_count) || 0) : 0;
      const retryCount = (!complete && reportedCursor && !cursorChanged) ? previousRetryCount + 1 : 0;
      const previousSkippedCursorCount = sameSnapshotCycle && !cursorChanged
        ? (asNumber(previousSnapshot.data?.skipped_cursor_count) || 0)
        : 0;
      let skippedCursorCount = previousSkippedCursorCount;
      let skippedCursorReason = null;
      let savedCursor = reportedCursor;
      if (!complete && reportedCursor && retryCount >= STUCK_CURSOR_RETRY_LIMIT) {
        const advancedCursor = incrementNumericCursor(reportedCursor);
        if (advancedCursor) {
          savedCursor = advancedCursor;
          skippedCursorCount += 1;
          skippedCursorReason = `stuck_cursor: ${adapter.source} cursor ${reportedCursor} repeated ${retryCount} time(s); next cron will resume at ${advancedCursor}`;
          error = `${error}; ${skippedCursorReason}`;
        } else {
          skippedCursorReason = `stuck_cursor: ${adapter.source} cursor ${reportedCursor} repeated ${retryCount} time(s); unable to auto-advance non-numeric cursor`;
          error = `${error}; ${skippedCursorReason}`;
        }
      }
      const previousCursorChangedAt = previousSnapshot.data?.cursor_changed_at || state.updated_at || state.started_at || adapterStartedAt;
      const effectiveCursorChanged = previousCursor !== savedCursor;
      const cursorChangedAt = effectiveCursorChanged ? nowIso() : previousCursorChangedAt;
      const chunksCompleted = (asNumber(previousSnapshot.data?.chunks_completed) ?? 0) + 1;
      const nextPageCount = (state.page_count || 0) + tableResult.page_count;
      const nextRowCount = (state.row_count || 0) + rows.length;
      await upsertSourceIndexState(env.DB, adapter.source, {
        sync_cycle_id: activeCycleId,
        cursor: complete ? '' : savedCursor,
        page_count: nextPageCount,
        row_count: nextRowCount,
        complete,
        truncated: 0,
        status,
        error,
        started_at: state.started_at || adapterStartedAt,
      });
      await writeCompactDexSnapshot(env.DB, adapter, {
        row_count: nextRowCount,
        page_count: nextPageCount,
        truncated: 0,
        error,
        cursor: complete ? '' : savedCursor,
        sync_cycle_id: activeCycleId,
        status,
        request_count: tableResult.request_count,
        previous_cursor: previousCursor,
        current_cursor: savedCursor,
        cursor_changed_at: cursorChangedAt,
        chunks_completed: chunksCompleted,
        retry_count: retryCount,
        skipped_cursor_count: skippedCursorCount,
        skipped_cursor_reason: skippedCursorReason,
      }, syncedAt);
      if (complete) {
        await recordSyncRun(env.DB, adapter.source, 'success', adapterStartedAt);
      } else {
        await recordSyncRun(env.DB, adapter.source, 'partial', adapterStartedAt, error);
      }
      results.push({
        source: adapter.source,
        ok: true,
        pairs: pairs.length,
        rows: rows.length,
        complete: !!complete,
        status,
        request_count: tableResult.request_count,
        cursor: complete ? '' : savedCursor,
        reported_cursor: reportedCursor,
        retry_count: retryCount,
        skipped_cursor_count: skippedCursorCount,
        skipped_cursor_reason: skippedCursorReason,
        cycle: activeCycleId,
      });
    } catch (error) {
      await recordSyncRun(env.DB, adapter.source, 'failed', adapterStartedAt, error?.message || String(error)).catch(() => {});
      await upsertSourceIndexState(env.DB, adapter.source, {
        sync_cycle_id: activeCycleId,
        complete: 0,
        truncated: /truncated/i.test(String(error?.message || error)) ? 1 : 0,
        status: 'failed',
        error: error?.message || String(error),
        started_at: adapterStartedAt,
      }).catch(() => {});
      results.push({ source: adapter.source, ok: false, error: error?.message || String(error) });
    }
  }
  return { ok: results.every((result) => result.ok), complete: results.every((result) => result.complete || result.skipped), free_safe_mode: waxonedgeFreeSafeMode(env), results };
}

async function getAggregateRunStatus(db) {
  const rows = await db.prepare(
    `SELECT source, sync_cycle_id, complete, truncated, status, error, row_count
     FROM waxonedge_source_index_state
     WHERE source IN (${WAXONEDGE_AGGREGATE_SOURCES.map(() => '?').join(',')})`
  ).bind(...WAXONEDGE_AGGREGATE_SOURCES).all().catch(() => ({ results: [] }));
  const states = new Map();
  for (const row of rows.results || []) {
    const source = aggregateSourceKey(row.source);
    if (!states.has(source)) states.set(source, row);
  }
  const cycleIds = WAXONEDGE_AGGREGATE_SOURCES
    .map((source) => states.get(source)?.sync_cycle_id)
    .filter(Boolean);
  const syncCycleId = cycleIds[0] || '';
  const sameCycle = !!syncCycleId && cycleIds.length === WAXONEDGE_AGGREGATE_SOURCES.length && cycleIds.every((id) => id === syncCycleId);
  const processed = [];
  const failed = [];
  const partialSources = [];
  const truncatedSources = [];
  for (const source of WAXONEDGE_AGGREGATE_SOURCES) {
    const row = states.get(source);
    if (row && row.status === 'success' && asNumber(row.complete) === 1 && row.sync_cycle_id === syncCycleId) {
      processed.push(source);
    } else if (row && ['partial', 'running'].includes(row.status) && asNumber(row.row_count) > 0 && row.sync_cycle_id === syncCycleId) {
      processed.push(source);
      partialSources.push(source);
    } else {
      failed.push(source);
    }
    if (row && (asNumber(row.truncated) === 1 || /truncated/i.test(String(row.error || '')))) truncatedSources.push(source);
  }
  return {
    required: WAXONEDGE_AGGREGATE_SOURCES.slice(),
    syncCycleId,
    processed,
    failed,
    partialSources,
    partial: partialSources.length > 0,
    truncated: truncatedSources.length > 0,
    truncatedSources,
    complete: sameCycle && failed.length === 0 && partialSources.length === 0 && truncatedSources.length === 0,
    partialSuccess: processed.length > 0 && (!sameCycle || failed.length > 0 || partialSources.length > 0 || truncatedSources.length > 0),
    sourceErrorSummary: failed.length ? `source_errors: ${failed.join(', ')}` : null,
  };
}

async function aggregateTokenAnalytics(env) {
  const startedAt = nowIso();
  const runStatus = await getAggregateRunStatus(env.DB);
  const [pairRows, tokenRows] = await Promise.all([
    env.DB.prepare(
      `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
              price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
              liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
       FROM waxonedge_pairs`
    ).all(),
    env.DB.prepare(
      `SELECT contract, symbol, total_supply, max_supply, price_wax, price_usd
       FROM waxonedge_tokens`
    ).all().catch(() => ({ results: [] })),
  ]);
  const priceIndex = buildDbTokenPriceIndex(tokenRows.results || []);
  const aggregateRouteIndex = buildOgWaxRouteGraph(pairRows.results || [], priceIndex);
  const tokenInfo = new Map();
  for (const token of tokenRows.results || []) {
    const key = tokenKey(token.contract, token.symbol);
    if (key) tokenInfo.set(key, token);
  }
  const aggregates = new Map();
  const requiredSources = runStatus.required;
  function ensure(contract, symbol) {
    const key = tokenKey(contract, symbol);
    if (!key) return null;
    if (!aggregates.has(key)) {
      aggregates.set(key, {
        contract: normalizeContract(contract),
        symbol: normalizeSymbol(symbol),
        volume24: 0,
        hasVolume24: false,
        pairCount: 0,
        sources: new Set(),
        pairs: [],
      });
    }
    return aggregates.get(key);
  }
  for (const pair of pairRows.results || []) {
    const source = aggregateSourceKey(pair.source);
    if (!WAXONEDGE_AGGREGATE_SOURCES.includes(source)) continue;
    const sides = [
      { contract: pair.token_a_contract, symbol: pair.token_a_symbol },
      { contract: pair.token_b_contract, symbol: pair.token_b_symbol },
    ];
    for (const side of sides) {
      const agg = ensure(side.contract, side.symbol);
      if (!agg) continue;
      agg.pairCount += 1;
      agg.sources.add(source);
      agg.pairs.push(pair);
      const volume24Wax = asNumber(pair.volume_24h_wax);
      if (volume24Wax != null) {
        agg.volume24 += volume24Wax;
        agg.hasVolume24 = true;
      }
    }
  }
  const statements = [];
  for (const agg of aggregates.values()) {
    const detailStats = deriveTokenPairMetrics(
      tokenInfo.get(tokenKey(agg.contract, agg.symbol)) || agg,
      {
        aggregate_complete: runStatus.complete ? 1 : 0,
        aggregate_truncated: runStatus.truncated ? 1 : 0,
      },
      agg.pairs,
      tokenRows.results || [],
      pairRows.results || [],
      { routeIndex: aggregateRouteIndex },
    );
    const presentSources = requiredSources.filter((source) => agg.sources.has(source));
    statements.push(env.DB.prepare(
      `INSERT INTO waxonedge_token_stats
       (contract, symbol, volume_24h, volume_24h_wax, volume_24h_usd,
        liquidity_wax, liquidity_usd, tvl_wax, tvl_usd, change_24h,
        selected_price_wax, selected_price_usd, selected_pair_source, selected_pair_id,
        fdv_wax, fdv_usd, source_count, indexed_pair_count, source_keys, aggregate_complete,
        aggregate_sources_required, aggregate_sources_present, aggregate_sources_processed,
        aggregate_sources_failed, aggregate_truncated, aggregate_sources_truncated, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(contract, symbol) DO UPDATE SET
         volume_24h = excluded.volume_24h,
         volume_24h_wax = excluded.volume_24h_wax,
         volume_24h_usd = excluded.volume_24h_usd,
         liquidity_wax = excluded.liquidity_wax,
         liquidity_usd = excluded.liquidity_usd,
         tvl_wax = excluded.tvl_wax,
         tvl_usd = excluded.tvl_usd,
         change_24h = excluded.change_24h,
         selected_price_wax = excluded.selected_price_wax,
         selected_price_usd = excluded.selected_price_usd,
         selected_pair_source = excluded.selected_pair_source,
         selected_pair_id = excluded.selected_pair_id,
         fdv_wax = excluded.fdv_wax,
         fdv_usd = excluded.fdv_usd,
         source_count = excluded.source_count,
         indexed_pair_count = excluded.indexed_pair_count,
         source_keys = excluded.source_keys,
         aggregate_complete = excluded.aggregate_complete,
         aggregate_sources_required = excluded.aggregate_sources_required,
         aggregate_sources_present = excluded.aggregate_sources_present,
         aggregate_sources_processed = excluded.aggregate_sources_processed,
         aggregate_sources_failed = excluded.aggregate_sources_failed,
         aggregate_truncated = excluded.aggregate_truncated,
         aggregate_sources_truncated = excluded.aggregate_sources_truncated,
         updated_at = excluded.updated_at`
    ).bind(
      agg.contract,
      agg.symbol,
      detailStats.volume_24h_wax,
      detailStats.volume_24h_wax,
      detailStats.volume_24h_usd,
      detailStats.liquidity_wax,
      detailStats.liquidity_usd,
      detailStats.tvl_wax,
      detailStats.tvl_usd,
      detailStats.change_24h,
      detailStats.selected_price_wax,
      detailStats.selected_price_usd,
      detailStats.selected_pair_source,
      detailStats.selected_pair_id,
      detailStats.fdv_wax,
      detailStats.fdv_usd,
      detailStats.source_count,
      detailStats.indexed_pair_count,
      detailStats.source_keys,
      runStatus.complete ? 1 : 0,
      requiredSources.join(','),
      presentSources.join(','),
      runStatus.processed.join(','),
      runStatus.failed.join(','),
      runStatus.truncated ? 1 : 0,
      runStatus.truncatedSources.join(','),
      nowIso(),
    ));
    if (detailStats.selected_price_wax != null) {
      statements.push(env.DB.prepare(
        `UPDATE waxonedge_tokens
         SET price_wax = ?, price_usd = COALESCE(?, price_usd), pair_count = (
           SELECT COUNT(*) FROM waxonedge_pairs
           WHERE (token_a_contract = ? AND token_a_symbol = ?)
              OR (token_b_contract = ? AND token_b_symbol = ?)
         ), updated_at = ?
         WHERE contract = ? AND symbol = ?`
      ).bind(
        detailStats.selected_price_wax,
        detailStats.selected_price_usd,
        agg.contract,
        agg.symbol,
        agg.contract,
        agg.symbol,
        nowIso(),
        agg.contract,
        agg.symbol,
      ));
    }
  }
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50));
  }
  const aggregateStatus = runStatus.complete ? 'success' : (aggregates.size > 0 ? 'partial_success' : 'failed');
  const aggregateError = aggregateStatus === 'failed'
    ? 'Aggregate failed: no usable source rows or D1 write failed'
    : (aggregateStatus === 'partial_success' ? `Aggregate partial_success: ${[runStatus.partialSources.length ? `waiting for ${runStatus.partialSources.join(', ')} to finish source cursors` : null, runStatus.sourceErrorSummary].filter(Boolean).join('; ')}` : null);
  await upsertSourceIndexState(env.DB, 'token_aggregates', {
    sync_cycle_id: runStatus.syncCycleId || '',
    cursor: '',
    page_count: 1,
    row_count: aggregates.size,
    complete: runStatus.complete ? 1 : 0,
    truncated: runStatus.truncated ? 1 : 0,
    status: aggregateStatus,
    error: aggregateError,
    started_at: startedAt,
  }).catch(() => {});
  await recordSyncRun(env.DB, 'token_aggregates', aggregateStatus, startedAt, aggregateError);
  return { ok: aggregateStatus !== 'failed', tokens: aggregates.size, status: aggregateStatus, runStatus };
}

async function syncNeftyAbi(env) {
  const startedAt = nowIso();
  try {
    const adapter = CORE_DEX_ADAPTERS.find((entry) => entry.source === 'swap.nefty');
    const tables = await getAbiTableNames(adapter.contract);
    await writeSnapshot(env.DB, 'swap_nefty_abi', {
      contract: adapter.contract,
      detected_tables: tables,
      note: 'ABI-first core adapter. Pairs normalize only when real reserves and token symbols are present.',
    }, nowIso());
    await recordSyncRun(env.DB, 'swap_nefty_abi', 'success', startedAt);
    return { ok: true, tables };
  } catch (error) {
    await recordSyncRun(env.DB, 'swap_nefty_abi', 'failed', startedAt, error?.message || String(error)).catch(() => {});
    return { ok: false, error: error?.message || String(error) };
  }
}

async function syncSupplyInputs(env) {
  const startedAt = nowIso();
  const state = await readSourceIndexState(env.DB, SUPPLY_SYNC_SOURCE);
  const limit = supplySyncLimit(env);
  const afterCursor = String(state?.cursor || '').trim();
  const tokenKeyExpression = "(t.contract || '::' || t.symbol)";
  const cursorFilter = afterCursor ? "AND (t.contract || '::' || t.symbol) > ?" : '';
  const totalPairTokensRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM waxonedge_tokens t
     LEFT JOIN waxonedge_token_stats s
       ON s.contract = t.contract AND s.symbol = t.symbol
     WHERE COALESCE(s.indexed_pair_count, t.pair_count, 0) > 0`
  ).first().catch(() => ({ count: 0 }));
  const totalPairTokens = Math.max(0, Math.floor(asNumber(totalPairTokensRow?.count) || 0));
  const selectSql = `SELECT t.contract, t.symbol, ${tokenKeyExpression} AS token_key
     FROM waxonedge_tokens t
     LEFT JOIN waxonedge_token_stats s
       ON s.contract = t.contract AND s.symbol = t.symbol
     WHERE COALESCE(s.indexed_pair_count, t.pair_count, 0) > 0
       ${cursorFilter}
     ORDER BY token_key ASC
     LIMIT ?`;
  let rows = await env.DB.prepare(selectSql)
    .bind(...(afterCursor ? [afterCursor, limit] : [limit]))
    .all().catch(() => ({ results: [] }));
  if (afterCursor && totalPairTokens > 0 && !(rows.results || []).length) {
    rows = await env.DB.prepare(
      `SELECT t.contract, t.symbol, ${tokenKeyExpression} AS token_key
       FROM waxonedge_tokens t
       LEFT JOIN waxonedge_token_stats s
         ON s.contract = t.contract AND s.symbol = t.symbol
       WHERE COALESCE(s.indexed_pair_count, t.pair_count, 0) > 0
       ORDER BY token_key ASC
       LIMIT ?`
    ).bind(limit).all().catch(() => ({ results: [] }));
  }
  let updated = 0;
  let attempted = 0;
  for (const row of rows.results || []) {
    attempted += 1;
    try {
      const stats = await rpcPost('/v1/chain/get_currency_stats', {
        code: row.contract,
        symbol: row.symbol,
      });
      const stat = stats?.[row.symbol] || null;
      if (!stat) continue;
      const supply = parseAsset(stat.supply);
      const maxSupply = parseAsset(stat.max_supply);
      await env.DB.prepare(
        `UPDATE waxonedge_tokens
         SET total_supply = COALESCE(?, total_supply),
             max_supply = COALESCE(?, max_supply),
             updated_at = ?
         WHERE contract = ? AND symbol = ?`
      ).bind(safeDecimal(supply.amount), safeDecimal(maxSupply.amount), nowIso(), row.contract, row.symbol).run();
      updated += 1;
    } catch {
      // Individual token supply lookups are best-effort and recorded in the run row.
    }
  }
  const complete = totalPairTokens > 0 && totalPairTokens <= limit && attempted >= totalPairTokens ? 1 : 0;
  const truncated = totalPairTokens > limit && attempted >= limit ? 1 : 0;
  const status = attempted <= 0 ? 'skipped' : (complete === 1 ? 'success' : 'partial');
  const error = attempted > 0 ? null : 'No indexed pair tokens found for supply sync';
  const lastTokenKey = (rows.results || []).length ? rows.results[rows.results.length - 1].token_key : '';
  const nextCursor = attempted > 0 && totalPairTokens > limit && attempted >= limit ? String(lastTokenKey || '') : '';
  await upsertSourceIndexState(env.DB, SUPPLY_SYNC_SOURCE, {
    sync_cycle_id: state?.sync_cycle_id || `supply-${new Date().toISOString().slice(0, 10)}`,
    cursor: nextCursor,
    page_count: (asNumber(state?.page_count) || 0) + (attempted > 0 ? 1 : 0),
    row_count: totalPairTokens,
    complete,
    truncated,
    status,
    error,
    started_at: startedAt,
  }).catch(() => {});
  await recordSyncRun(env.DB, SUPPLY_SYNC_SOURCE, status, startedAt, error).catch(() => {});
  return {
    ok: true,
    updated,
    attempted,
    total_pair_tokens: totalPairTokens,
    limit,
    cursor: nextCursor,
    complete,
    truncated,
    status,
  };
}

async function listTopTokens(db) {
  const rows = await db.prepare(
    `SELECT t.contract, t.symbol, t.decimals, t.total_supply, t.max_supply, t.price_wax, t.price_usd,
            t.pair_count, t.icon_url, t.updated_at,
            s.volume_24h, s.volume_24h_wax, s.volume_24h_usd, s.volume_7d, s.volume_30d,
            s.liquidity_wax, s.liquidity_usd,
            s.tvl_wax, s.tvl_usd, s.change_24h, s.selected_price_wax, s.selected_price_usd,
            s.selected_pair_source, s.selected_pair_id, s.holder_count, s.circulating_supply,
            s.burned_amount, s.market_cap_wax, s.market_cap_usd, s.fdv_wax, s.fdv_usd,
            s.source_count, s.indexed_pair_count, s.source_keys, s.aggregate_complete,
            s.aggregate_sources_required, s.aggregate_sources_present, s.aggregate_sources_processed,
            s.aggregate_sources_failed, s.aggregate_truncated, s.aggregate_sources_truncated
     FROM waxonedge_tokens t
     LEFT JOIN waxonedge_token_stats s
       ON s.contract = t.contract AND s.symbol = t.symbol
     ORDER BY t.pair_count DESC, t.updated_at DESC
     LIMIT 250`
  ).all();
  return rows.results || [];
}

function liveTokenUpdateKey(contract, symbol) {
  return tokenKey(contract, symbol);
}

function selectedMetricValueForLiveToken(row) {
  const change = asNumber(row.change_24h);
  if (change != null) return change;
  const tvlUsd = asNumber(row.tvl_usd);
  if (tvlUsd != null) return tvlUsd;
  const liquidityUsd = asNumber(row.liquidity_usd);
  if (liquidityUsd != null) return liquidityUsd;
  const volumeUsd = asNumber(row.volume_24h_usd);
  if (volumeUsd != null) return volumeUsd;
  return null;
}

function normalizeLiveTokenUpdate(row) {
  const contract = normalizeContract(row?.contract);
  const symbol = normalizeSymbol(row?.symbol);
  const tokenKeyValue = liveTokenUpdateKey(contract, symbol);
  if (!tokenKeyValue) return null;
  return {
    token_key: tokenKeyValue,
    contract,
    symbol,
    price_wax: null,
    price_usd: null,
    selected_price_confidence: 'unavailable',
    selected_price_reason_codes: ['live_update_without_price_proof'],
    change_24h: safeDecimal(asNumber(row.change_24h)),
    volume_24h_wax: safeDecimal(asNumber(row.volume_24h_wax ?? row.volume_24h)),
    volume_24h_usd: safeDecimal(asNumber(row.volume_24h_usd)),
    tvl_wax: safeDecimal(asNumber(row.tvl_wax)),
    tvl_usd: safeDecimal(asNumber(row.tvl_usd)),
    liquidity_wax: safeDecimal(asNumber(row.liquidity_wax)),
    liquidity_usd: safeDecimal(asNumber(row.liquidity_usd)),
    selected_metric_value: safeDecimal(selectedMetricValueForLiveToken(row)),
    indexed_pair_count: asNumber(row.indexed_pair_count ?? row.pair_count),
    source_count: asNumber(row.source_count),
    source_keys: row.source_keys || '',
    updated_at: row.stats_updated_at || row.updated_at || null,
  };
}

function liveCursorFromRow(row) {
  const updatedAt = row?.stats_updated_at || row?.updated_at || '';
  const contract = normalizeContract(row?.contract);
  const symbol = normalizeSymbol(row?.symbol);
  if (!updatedAt || !contract || !symbol) return null;
  return [updatedAt, contract, symbol].map((part) => encodeURIComponent(part)).join('~');
}

function parseLiveCursor(value) {
  const text = safeString(value);
  if (!text) return { cursor: null, warning: null };
  const parts = text.split('~').map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return '';
    }
  });
  if (parts.length !== 3) return { cursor: null, warning: 'Invalid live cursor ignored.' };
  const [updatedAt, contract, symbol] = parts;
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed) || !normalizeContract(contract) || !normalizeSymbol(symbol)) {
    return { cursor: null, warning: 'Invalid live cursor ignored.' };
  }
  return {
    cursor: {
      updated_at: new Date(parsed).toISOString(),
      contract: normalizeContract(contract),
      symbol: normalizeSymbol(symbol),
    },
    warning: null,
  };
}

function parseLiveSince(value) {
  const text = safeString(value);
  if (!text) return { since: null, warning: null };
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return { since: null, warning: 'Invalid since timestamp ignored.' };
  return { since: new Date(parsed).toISOString(), warning: null };
}

async function listLiveTokenUpdates(db, options = {}) {
  const parsedCursor = parseLiveCursor(options.cursor);
  const parsedSince = parsedCursor.cursor ? { since: null, warning: null } : parseLiveSince(options.since);
  const filters = [];
  const params = [];
  if (parsedCursor.cursor) {
    filters.push(`(
      updated_at > ?
      OR (updated_at = ? AND contract > ?)
      OR (updated_at = ? AND contract = ? AND symbol > ?)
    )`);
    params.push(
      parsedCursor.cursor.updated_at,
      parsedCursor.cursor.updated_at,
      parsedCursor.cursor.contract,
      parsedCursor.cursor.updated_at,
      parsedCursor.cursor.contract,
      parsedCursor.cursor.symbol,
    );
  } else if (parsedSince.since) {
    filters.push(`updated_at > ?`);
    params.push(parsedSince.since);
  }
  params.push(clampInteger(options.limit, LIVE_SNAPSHOT_TOKEN_LIMIT, 1, LIVE_SNAPSHOT_TOKEN_LIMIT));
  const rows = await db.prepare(
    `SELECT *
     FROM (
       SELECT t.contract AS contract, t.symbol AS symbol,
              t.price_wax AS price_wax, t.price_usd AS price_usd,
              t.pair_count AS pair_count,
              t.updated_at AS token_updated_at,
              s.selected_price_wax AS selected_price_wax,
              s.selected_price_usd AS selected_price_usd,
              s.change_24h AS change_24h,
              s.volume_24h AS volume_24h,
              s.volume_24h_wax AS volume_24h_wax,
              s.volume_24h_usd AS volume_24h_usd,
              s.tvl_wax AS tvl_wax,
              s.tvl_usd AS tvl_usd,
              s.liquidity_wax AS liquidity_wax,
              s.liquidity_usd AS liquidity_usd,
              s.indexed_pair_count AS indexed_pair_count,
              s.source_count AS source_count,
              s.source_keys AS source_keys,
              COALESCE(s.updated_at, t.updated_at) AS updated_at
       FROM waxonedge_tokens t
       LEFT JOIN waxonedge_token_stats s
         ON s.contract = t.contract AND s.symbol = t.symbol
     ) live_rows
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY updated_at ASC, contract ASC, symbol ASC
     LIMIT ?`
  ).bind(...params).all();
  const results = rows.results || [];
  const lastRow = results[results.length - 1] || null;
  return {
    tokens: results.map(normalizeLiveTokenUpdate).filter(Boolean),
    cursor: parsedCursor.cursor,
    since: parsedSince.since,
    next_cursor: liveCursorFromRow(lastRow),
    warning: parsedCursor.warning || parsedSince.warning,
  };
}

async function handleLiveSnapshot(env, query, corsHeaders) {
  try {
    const live = await listLiveTokenUpdates(env.DB, {
      cursor: query.get('cursor') || query.get('next_cursor'),
      since: query.get('since') || query.get('updated_since'),
      limit: query.get('limit'),
    });
    const warnings = live.warning ? [live.warning] : [];
    return waxonedgeJson({
      ok: true,
      source: 'moonboys-api/waxonedge-live',
      mode: 'snapshot',
      generated_at: nowIso(),
      since: live.since,
      cursor: query.get('cursor') || query.get('next_cursor') || null,
      next_cursor: live.next_cursor,
      snapshot_endpoint: WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT,
      stream_endpoint: WAXONEDGE_LIVE_STREAM_ENDPOINT,
      token_key_format: 'contract::symbol',
      uses_fake_live_data: false,
      browser_hyperion_fetch: false,
      tokens: live.tokens,
      warnings,
    }, 200, corsHeaders);
  } catch (error) {
    return waxonedgeJson({
      ok: false,
      source: 'moonboys-api/waxonedge-live',
      mode: 'snapshot',
      generated_at: nowIso(),
      error: 'live snapshot unavailable',
      diagnostic: safeString(error?.message || error),
      tokens: [],
      next_cursor: null,
      uses_fake_live_data: false,
      browser_hyperion_fetch: false,
      warnings: ['live snapshot unavailable'],
    }, 503, corsHeaders);
  }
}

function handleLiveStream(corsHeaders, env = {}) {
  return waxonedgeJson({
    ok: false,
    unavailable: 'live stream transport not enabled yet',
    fallback: WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT,
    transport: 'snapshot-polling-contract',
    vps_stream_required: true,
    live_indexer: waxonedgeLiveIndexerConfig(env),
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    event_contract: {
      token_key_format: 'contract::symbol',
      events: ['token_update', 'heartbeat'],
    },
  }, 503, corsHeaders);
}

async function listTopPairs(db) {
  const rows = await db.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
     FROM waxonedge_pairs
     ORDER BY CAST(COALESCE(volume_24h_wax, '0') AS NUMERIC) DESC, updated_at DESC
     LIMIT 250`
  ).all();
  return rows.results || [];
}

async function addBootstrapSelectedPriceProof(db, tokens, pairs) {
  const priceRows = await loadTokenPriceRowsForPairs(db, pairs);
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const routeIndex = buildOgWaxRouteGraph(pairs, priceIndex);
  return (tokens || []).map((token) => {
    const key = tokenKey(token.contract, token.symbol);
    const route = selectOgWaxRoutePrice(key, routeIndex);
    return applySelectedPriceProofFields({ ...token }, route);
  });
}

async function listTokenPairs(db, contract, symbol, options = {}) {
  const limit = clampInteger(options.limit, TOKEN_PAIR_PAGE_LIMIT, 1, TOKEN_PAIR_MAX_PAGE_LIMIT);
  const offset = clampInteger(options.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
  const rows = await db.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
     FROM waxonedge_pairs
     WHERE (token_a_contract = ? AND token_a_symbol = ?)
        OR (token_b_contract = ? AND token_b_symbol = ?)
     ORDER BY CAST(COALESCE(liquidity_wax, '0') AS NUMERIC) DESC,
              CAST(COALESCE(volume_24h_wax, '0') AS NUMERIC) DESC,
              updated_at DESC
     LIMIT ? OFFSET ?`
  ).bind(contract, symbol, contract, symbol, limit + 1, offset).all();
  const pageRows = rows.results || [];
  const hasMore = pageRows.length > limit;
  const visibleRows = pageRows.slice(0, limit);
  const graphRows = await loadRouteGraphRowsForToken(db, contract, symbol);
  const priceRows = await loadTokenPriceRowsForPairs(db, graphRows);
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const routeIndex = buildOgWaxRouteGraph(graphRows, priceIndex);
  return {
    rows: visibleRows.map((pair) => ({
      ...pair,
      pair_contribution_proof: pairContributionProof(pair, contract, symbol, priceIndex, routeIndex),
    })),
    next_cursor: hasMore ? String(offset + limit) : null,
    complete: !hasMore,
  };
}

async function listBestChartCandles(db, contract, symbol) {
  const best = await db.prepare(
    `SELECT p.source, p.pair_id, p.token_a_contract, p.token_a_symbol, p.token_b_contract, p.token_b_symbol,
            p.volume_24h, p.volume_24h_wax, p.liquidity_wax, p.liquidity_usd, COUNT(c.bucket_time) AS candle_count
     FROM waxonedge_pairs p
     JOIN waxonedge_chart_candles c
       ON c.source = p.source AND c.pair_id = p.pair_id
     WHERE ((p.token_a_contract = ? AND p.token_a_symbol = ?)
         OR (p.token_b_contract = ? AND p.token_b_symbol = ?))
       AND c.interval = '1D'
     GROUP BY p.source, p.pair_id
     HAVING candle_count > 0
     ORDER BY CAST(COALESCE(p.liquidity_wax, '0') AS NUMERIC) DESC,
              CAST(COALESCE(p.volume_24h_wax, '0') AS NUMERIC) DESC,
              candle_count DESC
     LIMIT 1`
  ).bind(contract, symbol, contract, symbol).first().catch(() => null);
  if (!best) {
    return {
      chart_source: null,
      candles: [],
      unavailable: SOURCE_NOT_INDEXED,
    };
  }
  const rows = await db.prepare(
    `SELECT source, pair_id, interval, bucket_time, open, high, low, close, volume
     FROM waxonedge_chart_candles
     WHERE source = ? AND pair_id = ? AND interval = '1D'
     ORDER BY bucket_time DESC
     LIMIT 120`
  ).bind(best.source, best.pair_id).all();
  return {
    chart_source: best,
    candles: (rows.results || []).reverse(),
    unavailable: null,
  };
}

function reverseStoredCandle(candle) {
  function reciprocal(value) {
    const n = asNumber(value);
    return n && n !== 0 ? safeDecimal(1 / n) : null;
  }
  const reversedOpen = reciprocal(candle.open);
  const reversedHigh = reciprocal(candle.low);
  const reversedLow = reciprocal(candle.high);
  const reversedClose = reciprocal(candle.close);
  if (!reversedOpen || !reversedHigh || !reversedLow || !reversedClose) return candle;
  return {
    ...candle,
    open: reversedOpen,
    high: reversedHigh,
    low: reversedLow,
    close: reversedClose,
  };
}

async function listChartCandlesBySource(db, query) {
  const source = moonboysCandleSource(query.src || query.source);
  const pairId = safeString(query.pair_id || query.pairId);
  const interval = normalizeCandleInterval(query.duration || query.interval);
  const countBack = clampInteger(query.countBack || query.limit, 120, 1, 1000);
  if (!source || !pairId) {
    return { chart_source: null, candles: [], unavailable: 'src and pair_id are required' };
  }
  const startAt = asNumber(query.startAt);
  const endAt = asNumber(query.endAt);
  const startIso = startAt == null ? null : new Date(startAt).toISOString();
  const endIso = endAt == null ? null : new Date(endAt).toISOString();
  const filters = ['source = ?', 'pair_id = ?', 'interval = ?'];
  const params = [source, pairId, interval];
  if (startIso) {
    filters.push('bucket_time >= ?');
    params.push(startIso);
  }
  if (endIso) {
    filters.push('bucket_time <= ?');
    params.push(endIso);
  }
  params.push(countBack);
  const rows = await db.prepare(
    `SELECT source, pair_id, interval, bucket_time, open, high, low, close, volume
     FROM waxonedge_chart_candles
     WHERE ${filters.join(' AND ')}
     ORDER BY bucket_time DESC
     LIMIT ?`
  ).bind(...params).all();
  let candles = (rows.results || []).reverse();
  if (String(query.is_reversed || query.isReversed || '').toLowerCase() === 'true') {
    candles = candles.map(reverseStoredCandle);
  }
  return {
    chart_source: {
      source,
      reference_src: referenceCandleSource(source),
      pair_id: pairId,
      interval,
    },
    candles,
    unavailable: candles.length ? null : SOURCE_NOT_INDEXED,
  };
}

function buildDbTokenPriceIndex(rows) {
  const index = new Map();
  for (const row of rows || []) {
    index.set(tokenKey(row.contract, row.symbol), {
      priceWax: asNumber(row.price_wax),
      priceUsd: asNumber(row.price_usd),
    });
  }
  return index;
}

function collectTokenPriceKeysForPairs(pairRows) {
  const keys = new Map();
  function add(contract, symbol) {
    const normalizedContract = normalizeContract(contract);
    const normalizedSymbol = normalizeSymbol(symbol);
    const key = tokenKey(normalizedContract, normalizedSymbol);
    if (key && !keys.has(key)) {
      keys.set(key, { contract: normalizedContract, symbol: normalizedSymbol });
    }
  }
  add('eosio.token', 'WAX');
  for (const [contract, symbol] of REFERENCE_QUOTE_TOKENS) add(contract, symbol);
  for (const pair of pairRows || []) {
    add(pair.token_a_contract, pair.token_a_symbol);
    add(pair.token_b_contract, pair.token_b_symbol);
  }
  return Array.from(keys.values());
}

async function loadTokenPriceRowsForPairs(db, pairRows) {
  const keys = collectTokenPriceKeysForPairs(pairRows);
  if (!keys.length) return [];
  const rows = [];
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50);
    const where = chunk.map(() => '(contract = ? AND symbol = ?)').join(' OR ');
    const params = chunk.flatMap((key) => [key.contract, key.symbol]);
    const result = await db.prepare(
      `SELECT contract, symbol, price_wax, price_usd
       FROM waxonedge_tokens
       WHERE ${where}`
    ).bind(...params).all().catch(() => ({ results: [] }));
    rows.push(...(result.results || []));
  }
  return rows;
}

function pairTokenSide(pair, contract, symbol) {
  const key = tokenKey(contract, symbol);
  const tokenAKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
  const tokenBKey = tokenKey(pair.token_b_contract, pair.token_b_symbol);
  if (key === tokenAKey) {
    return {
      side: 'a',
      token: { contract: pair.token_a_contract, symbol: pair.token_a_symbol, reserve: asNumber(pair.reserve_a) },
      quote: { contract: pair.token_b_contract, symbol: pair.token_b_symbol, reserve: asNumber(pair.reserve_b) },
    };
  }
  if (key === tokenBKey) {
    return {
      side: 'b',
      token: { contract: pair.token_b_contract, symbol: pair.token_b_symbol, reserve: asNumber(pair.reserve_b) },
      quote: { contract: pair.token_a_contract, symbol: pair.token_a_symbol, reserve: asNumber(pair.reserve_a) },
    };
  }
  return null;
}

function pairEdgePrice(pair) {
  const reserveA = asNumber(pair?.reserve_a);
  const reserveB = asNumber(pair?.reserve_b);
  if (reserveA != null && reserveA > 0 && reserveB != null && reserveB > 0) {
    return reserveB / reserveA;
  }
  return null;
}

function ogRouteHop(pair, fromKey, toKey, priceFromTo, reserveFrom, reserveTo) {
  return {
    source: pair.source || null,
    pair_id: pair.pair_id || null,
    from: fromKey,
    to: toKey,
    price_from_to: safeDecimal(priceFromTo),
    reserve_from: safeDecimal(reserveFrom),
    reserve_to: safeDecimal(reserveTo),
    reserve_a: safeDecimal(asNumber(pair?.reserve_a)),
    reserve_b: safeDecimal(asNumber(pair?.reserve_b)),
    pair_label: selectedPairLabel(pair),
    updated_at: pair?.updated_at || null,
  };
}

function selectedPriceFormula(route) {
  if (!route) return null;
  if (route.route_type === 'wax_self') return 'WAX = 1';
  if (!route.route_hops?.length) return null;
  const hopText = route.route_hops.map((hop) =>
    `${hop.from}->${hop.to}: reserve_to / reserve_from`).join('; ');
  return `price_wax = WAX route product from indexed reserves (${hopText})`;
}

function selectedPriceReasonCodes(route) {
  const reasons = [];
  if (!route) {
    reasons.push('no_indexed_wax_route');
    return reasons;
  }
  if (route.route_type !== 'wax_self') {
    if (!route.route_hops?.length) reasons.push('missing_route_hops');
    const score = asNumber(route.route_liquidity_score);
    if (score == null || score <= 0) reasons.push('missing_route_liquidity');
    else if (score < MIN_TRUSTED_WAX_LIQUIDITY) reasons.push('route_liquidity_below_threshold');
  }
  if (asNumber(route.priceWax) == null || asNumber(route.priceWax) <= 0) reasons.push('invalid_route_price');
  return reasons;
}

function selectedPriceConfidence(route) {
  const reasons = selectedPriceReasonCodes(route);
  if (!route) return 'unavailable';
  return reasons.length ? 'weak' : 'good';
}

function selectedPriceProofFields(route) {
  const confidence = selectedPriceConfidence(route);
  const good = confidence === 'good';
  const lastHop = route?.route_hops?.[route.route_hops.length - 1] || null;
  return {
    selected_price_wax: good ? safeDecimal(asNumber(route?.priceWax)) : null,
    selected_price_usd: good ? safeDecimal(asNumber(route?.priceUsd)) : null,
    selected_price_source: lastHop?.source || (route?.route_type === 'wax_self' ? 'eosio.token WAX' : null),
    selected_price_pair_id: lastHop?.pair_id || null,
    selected_price_pair_label: lastHop?.pair_label || null,
    selected_price_route_type: route?.route_type || 'unavailable',
    selected_price_route_hops: route?.route_hops || [],
    selected_price_reserve_a: lastHop?.reserve_a ?? null,
    selected_price_reserve_b: lastHop?.reserve_b ?? null,
    selected_price_formula: selectedPriceFormula(route),
    selected_price_updated_at: lastHop?.updated_at || null,
    selected_price_confidence: confidence,
    selected_price_reason_codes: selectedPriceReasonCodes(route),
  };
}

function applySelectedPriceProofFields(target, route) {
  const proof = selectedPriceProofFields(route);
  Object.assign(target, proof);
  target.selected_pair_source = proof.selected_price_source;
  target.selected_pair_id = proof.selected_price_pair_id;
  target.selected_pair_label = proof.selected_price_pair_label;
  target.selected_price_source = proof.selected_price_source;
  return target;
}

function buildOgWaxRouteGraph(pairRows = [], priceIndex = new Map(), maxHops = OG_WAX_ROUTE_MAX_HOPS) {
  const waxKey = tokenKey('eosio.token', 'WAX');
  const waxUsd = priceIndex.get(waxKey)?.priceUsd;
  const adjacency = new Map();
  const addEdge = (from, edge) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(edge);
  };
  for (const pair of pairRows || []) {
    if (!hasRealPairReserves(pair)) continue;
    const aKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
    const bKey = tokenKey(pair.token_b_contract, pair.token_b_symbol);
    const reserveA = asNumber(pair.reserve_a);
    const reserveB = asNumber(pair.reserve_b);
    const priceAB = pairEdgePrice(pair);
    if (!aKey || !bKey || aKey === bKey || priceAB == null || priceAB <= 0) continue;
    addEdge(aKey, {
      pair,
      from: aKey,
      to: bKey,
      reserveFrom: reserveA,
      reserveTo: reserveB,
      priceFromTo: priceAB,
    });
    addEdge(bKey, {
      pair,
      from: bKey,
      to: aKey,
      reserveFrom: reserveB,
      reserveTo: reserveA,
      priceFromTo: 1 / priceAB,
    });
  }
  const routes = new Map();
  routes.set(waxKey, {
    token_key: waxKey,
    priceWax: 1,
    priceUsd: waxUsd != null ? waxUsd : null,
    route_type: 'wax_self',
    route_hops: [],
    route_liquidity_score: Number.POSITIVE_INFINITY,
  });
  const queue = [waxKey];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const fromKey = queue[queueIndex];
    const fromRoute = routes.get(fromKey);
    if (!fromRoute || fromRoute.route_hops.length >= maxHops) continue;
    for (const edge of adjacency.get(fromKey) || []) {
      if (fromRoute.route_hops.some((hop) => hop.from === edge.to || hop.to === edge.to)) continue;
      if (edge.priceFromTo == null || edge.priceFromTo <= 0) continue;
      const priceWax = fromRoute.priceWax / edge.priceFromTo;
      if (priceWax == null || priceWax <= 0 || !Number.isFinite(priceWax)) continue;
      const edgeDepthWax = edge.reserveFrom != null ? edge.reserveFrom * fromRoute.priceWax : 0;
      const routeLiquidityScore = Math.min(fromRoute.route_liquidity_score, edgeDepthWax);
      const routeHops = fromRoute.route_hops.concat([
        ogRouteHop(edge.pair, edge.from, edge.to, edge.priceFromTo, edge.reserveFrom, edge.reserveTo),
      ]);
      const routeType = routeHops.length === 1 && (fromKey === waxKey || edge.to === waxKey) ? 'direct_wax' : 'multi_hop_wax';
      const existing = routes.get(edge.to);
      const routePreference = (value) => {
        if (value === 'wax_self') return 3;
        if (value === 'direct_wax') return 2;
        if (value === 'multi_hop_wax') return 1;
        return 0;
      };
      const better = !existing ||
        routePreference(routeType) > routePreference(existing.route_type) ||
        (routePreference(routeType) === routePreference(existing.route_type) && (
        routeLiquidityScore > existing.route_liquidity_score ||
        (routeLiquidityScore === existing.route_liquidity_score && routeHops.length < existing.route_hops.length)
        ));
      if (better) {
        routes.set(edge.to, {
          token_key: edge.to,
          priceWax,
          priceUsd: waxUsd != null ? priceWax * waxUsd : null,
          route_type: routeType,
          route_hops: routeHops,
          route_liquidity_score: routeLiquidityScore,
        });
        queue.push(edge.to);
      }
    }
  }
  return routes;
}

function priceWaxFromIndexedPair(pair, contract, symbol, priceIndex, routeIndex = null) {
  const key = tokenKey(contract, symbol);
  if (isWaxToken(contract, symbol)) return 1;
  return routeIndex?.get(key)?.priceWax ?? null;
}

function selectOgWaxRoutePrice(tokenKeyValue, routeIndex) {
  return routeIndex?.get(tokenKeyValue) || null;
}

function ogPairReserveValuation(pair, contract, symbol, priceIndex, routeIndex = null, selectedPriceProof = null) {
  const side = pairTokenSide(pair, contract, symbol);
  const hasReserves = hasRealPairReserves(pair);
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  const reasonCodes = [];
  if (!side) reasonCodes.push('token_not_in_pair');
  if (!hasReserves) reasonCodes.push('missing_or_zero_reserves');
  if (!routeIndex) routeIndex = buildOgWaxRouteGraph([pair], priceIndex);

  const reserveA = asNumber(pair?.reserve_a);
  const reserveB = asNumber(pair?.reserve_b);
  let reserveAWax = null;
  let reserveBWax = null;
  let contributionWax = null;
  const selectedTokenIsWax = isWaxToken(contract, symbol);
  const routeA = routeIndex.get(tokenKey(pair?.token_a_contract, pair?.token_a_symbol));
  const routeB = routeIndex.get(tokenKey(pair?.token_b_contract, pair?.token_b_symbol));
  if (!reasonCodes.length) {
    if (selectedTokenIsWax) {
      const waxReserve = side.side === 'a' ? reserveA : reserveB;
      if (side.side === 'a') reserveAWax = waxReserve;
      if (side.side === 'b') reserveBWax = waxReserve;
      contributionWax = waxReserve * 2;
    } else {
      if (!routeA) reasonCodes.push('token_a_no_wax_route');
      if (!routeB) reasonCodes.push('token_b_no_wax_route');
      if (routeA) reserveAWax = reserveA * routeA.priceWax;
      if (routeB) reserveBWax = reserveB * routeB.priceWax;
      if (reserveAWax != null && reserveBWax != null) contributionWax = reserveAWax + reserveBWax;
      else if (!reasonCodes.length) reasonCodes.push('missing_valued_reserve_side');
    }
  }

  const contributionUsd = contributionWax != null && waxUsd != null ? contributionWax * waxUsd : null;
  const contributes = contributionWax != null;
  const tokenRoute = routeIndex.get(tokenKey(contract, symbol));
  const isSelectedDeepest = contributes &&
    selectedPriceProof?.route_hops?.some((hop) => hop.source === pair.source && String(hop.pair_id) === String(pair.pair_id));
  return {
    token_side: side?.side || null,
    contributes_to_liquidity: contributes,
    contributes_to_tvl: contributes,
    contribution_wax: safeDecimal(contributionWax),
    contribution_usd: safeDecimal(contributionUsd),
    liquidity_contribution_wax: safeDecimal(contributionWax),
    liquidity_contribution_usd: safeDecimal(contributionUsd),
    tvl_contribution_wax: safeDecimal(contributionWax),
    tvl_contribution_usd: safeDecimal(contributionUsd),
    valuation_route: contributes
      ? (isSelectedDeepest ? 'selected_price_route_pool' : 'routed_wax_pool_value')
      : 'unresolved',
    route_type: contributes ? (tokenRoute?.route_type || 'multi_hop_wax') : 'unresolved',
    route_hops: tokenRoute?.route_hops || [],
    unresolved_reason: contributes ? null : (reasonCodes[0] || 'unresolved'),
    reason_codes: reasonCodes,
    reserve_a_wax_value: safeDecimal(reserveAWax),
    reserve_b_wax_value: safeDecimal(reserveBWax),
    reserve_token_wax_value: safeDecimal(side?.side === 'a' ? reserveAWax : reserveBWax),
    reserve_quote_wax_value: safeDecimal(side?.side === 'a' ? reserveBWax : reserveAWax),
    reserve_side_wax_values: {
      token: safeDecimal(side?.side === 'a' ? reserveAWax : reserveBWax),
      quote: safeDecimal(side?.side === 'a' ? reserveBWax : reserveAWax),
    },
    wax_price_used: safeDecimal(tokenRoute?.priceWax),
    wax_usd_used: safeDecimal(waxUsd),
    basis: 'og_wax_route_pool_graph',
  };
}

function liquidityWaxFromIndexedPair(pair, priceIndex, contract = null, symbol = null) {
  if (contract && symbol) {
    return asNumber(ogPairReserveValuation(pair, contract, symbol, priceIndex).contribution_wax);
  }
  const reserveA = asNumber(pair.reserve_a);
  const reserveB = asNumber(pair.reserve_b);
  if (reserveA == null || reserveB == null) return null;
  let derived = null;
  if (isWaxToken(pair.token_a_contract, pair.token_a_symbol)) derived = reserveA * 2;
  if (isWaxToken(pair.token_b_contract, pair.token_b_symbol)) derived = reserveB * 2;
  if (derived != null) {
    const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
    const derivedUsd = waxUsd != null ? derived * waxUsd : null;
    return derivedUsd == null || isReasonablePairTvlUsd(derivedUsd) ? derived : null;
  }
  return null;
}

function liquidityUsdFromWax(liquidityWax, pair, priceIndex) {
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  if (liquidityWax != null && waxUsd != null) {
    const derived = liquidityWax * waxUsd;
    return isReasonablePairTvlUsd(derived) ? derived : null;
  }
  return null;
}

function volumeWaxFromIndexedPair(pair, priceIndex) {
  const indexed = asNumber(pair.volume_24h_wax);
  if (indexed != null) return indexed;
  const volume24Raw = asNumber(pair.volume_24h);
  if (volume24Raw == null) return null;
  const tokenA = {
    contract: pair.token_a_contract,
    symbol: pair.token_a_symbol,
  };
  const tokenB = {
    contract: pair.token_b_contract,
    symbol: pair.token_b_symbol,
  };
  return asNumber(normalizeTokenAVolume(volume24Raw, tokenA, tokenB, pair.price, priceIndex).wax);
}

function selectedPairLabel(pair) {
  if (!pair) return null;
  const a = normalizeSymbol(pair.token_a_symbol);
  const b = normalizeSymbol(pair.token_b_symbol);
  const pairName = a && b ? `${a}/${b}` : null;
  return [pair.source, pair.pair_id ? `#${pair.pair_id}` : null, pairName].filter(Boolean).join(' ');
}

function reserveWaxValue(contract, symbol, reserve, priceIndex) {
  const amount = asNumber(reserve);
  if (amount == null) return null;
  if (isWaxToken(contract, symbol)) return amount;
  const priceWax = priceIndex.get(tokenKey(contract, symbol))?.priceWax;
  return priceWax != null ? amount * priceWax : null;
}

function pairContributionProof(pair, contract, symbol, priceIndex, routeIndex = null) {
  const side = pairTokenSide(pair, contract, symbol);
  const hasReserves = hasRealPairReserves(pair);
  const directWax = hasWaxQuoteForToken(pair, contract, symbol);
  if (!routeIndex) routeIndex = buildOgWaxRouteGraph([pair], priceIndex);
  const selected = selectOgWaxRoutePrice(tokenKey(contract, symbol), routeIndex);
  const valuation = ogPairReserveValuation(pair, contract, symbol, priceIndex, routeIndex, selected);
  return {
    token_side: side?.side || null,
    direct_wax_pair: directWax,
    has_real_reserves: hasReserves,
    ...valuation,
  };
}

function withPairContributionProof(pair, contract, symbol, priceIndex) {
  return {
    ...pair,
    pair_contribution_proof: pairContributionProof(pair, contract, symbol, priceIndex),
  };
}

function aggregatePairContributionTotals(pairRows, contract, symbol, priceIndex, graphPairRows = pairRows, options = {}) {
  let liquidityWax = 0;
  let liquidityUsd = 0;
  let hasLiquidityWax = false;
  let hasLiquidityUsd = false;
  let liquidityCount = 0;
  let unresolvedCount = 0;
  const sourceKeys = new Set();
  const routeIndex = options.routeIndex || buildOgWaxRouteGraph(graphPairRows, priceIndex);
  const selectedPriceProof = selectOgWaxRoutePrice(tokenKey(contract, symbol), routeIndex);
  for (const pair of pairRows || []) {
    const source = aggregateSourceKey(pair.source);
    if (source) sourceKeys.add(source);
    if (!pairTokenSide(pair, contract, symbol) || !hasRealPairReserves(pair)) {
      unresolvedCount += 1;
      continue;
    }
    const proof = ogPairReserveValuation(pair, contract, symbol, priceIndex, routeIndex, selectedPriceProof);
    if (proof.contributes_to_liquidity || proof.contributes_to_tvl) {
      const wax = asNumber(proof.contribution_wax);
      const usd = asNumber(proof.contribution_usd);
      if (wax != null) {
        liquidityWax += wax;
        hasLiquidityWax = true;
      }
      if (usd != null) {
        liquidityUsd += usd;
        hasLiquidityUsd = true;
      }
      if (wax != null || usd != null) liquidityCount += 1;
    } else {
      unresolvedCount += 1;
    }
  }
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  const hasAnyLiquidity = hasLiquidityWax || hasLiquidityUsd;
  return {
    indexed_pair_count: (pairRows || []).length,
    source_count: sourceKeys.size,
    source_keys: Array.from(sourceKeys).sort(),
    contributing_pair_count: liquidityCount,
    liquidity_contribution_count: liquidityCount,
    tvl_contribution_count: liquidityCount,
    unresolved_pair_count: unresolvedCount,
    total_liquidity_wax: hasLiquidityWax ? safeDecimal(liquidityWax) : null,
    total_liquidity_usd: hasLiquidityUsd ? safeDecimal(liquidityUsd) : null,
    total_tvl_wax: hasLiquidityWax ? safeDecimal(liquidityWax) : null,
    total_tvl_usd: hasLiquidityUsd ? safeDecimal(liquidityUsd) : null,
    wax_usd: safeDecimal(waxUsd),
    liquidity_basis: hasAnyLiquidity ? 'og_wax_route_pool_graph' : null,
    tvl_basis: hasAnyLiquidity ? 'og_wax_route_pool_graph' : null,
    tvl_liquidity_same_basis: hasAnyLiquidity,
  };
}

function tokenMetricProof(metrics, selected = null) {
  const selectedPriceWax = asNumber(metrics?.selected_price_wax);
  const selectedPriceUsd = asNumber(metrics?.selected_price_usd);
  const liquidityWax = asNumber(metrics?.liquidity_wax);
  const liquidityUsd = asNumber(metrics?.liquidity_usd);
  const tvlWax = asNumber(metrics?.tvl_wax);
  const tvlUsd = asNumber(metrics?.tvl_usd);
  const volume24Wax = asNumber(metrics?.volume_24h_wax ?? metrics?.volume_24h);
  const volume24Usd = asNumber(metrics?.volume_24h_usd);
  const totalSupply = asNumber(metrics?.total_supply);
  const hasCirculatingSupply = asNumber(metrics?.circulating_supply) != null;
  const hasMarketCap = hasCirculatingSupply && asNumber(metrics?.market_cap_wax ?? metrics?.market_cap_usd) != null;
  const hasFdv = asNumber(metrics?.fdv_wax ?? metrics?.fdv_usd) != null;
  const liquidityBasis = liquidityWax != null || liquidityUsd != null ? (metrics?.liquidity_basis || 'og_wax_route_pool_graph') : null;
  const tvlBasis = tvlWax != null || tvlUsd != null ? (metrics?.tvl_basis || 'og_wax_route_pool_graph') : null;
  const selectedPriceLive = selectedPriceWax != null || selectedPriceUsd != null;
  const selectedRouteType = selected
    ? selected.route_type
    : (metrics?.selected_price_route_type || 'unavailable');
  const selectedConfidence = metrics?.selected_price_confidence || selectedPriceConfidence(selected);
  const proofReasonCodes = Array.isArray(metrics?.selected_price_reason_codes)
    ? metrics.selected_price_reason_codes
    : selectedPriceReasonCodes(selected);
  const selectedPriceProof = {
    live: selectedPriceLive && selectedConfidence === 'good',
    source: metrics?.selected_price_source || metrics?.selected_pair_source || null,
    pair_id: metrics?.selected_price_pair_id || metrics?.selected_pair_id || null,
    pair_label: metrics?.selected_price_pair_label || metrics?.selected_pair_label || null,
    selected_price_wax: safeDecimal(selectedPriceWax),
    selected_price_usd: safeDecimal(selectedPriceUsd),
    route_type: selectedRouteType,
    valuation_route: selectedRouteType || null,
    token_side: null,
    route_hops: metrics?.selected_price_route_hops || selected?.route_hops || [],
    route_liquidity_score: safeDecimal(selected?.route_liquidity_score),
    reserve_a: metrics?.selected_price_reserve_a ?? null,
    reserve_b: metrics?.selected_price_reserve_b ?? null,
    formula: metrics?.selected_price_formula || selectedPriceFormula(selected),
    updated_at: metrics?.selected_price_updated_at || null,
    confidence: selectedConfidence,
    reason_codes: proofReasonCodes,
    trusted_liquidity: selectedConfidence === 'good',
  };
  const metricStatus = {
    selected_price: {
      live: selectedPriceProof.live,
      source: selectedPriceProof.live ? 'indexed_reserve_route' : null,
      confidence: selectedConfidence,
      reason_codes: proofReasonCodes,
      reason: selectedPriceProof.live ? null : (selectedConfidence === 'weak' ? 'Price proof weak' : (metrics?.unavailable_reasons?.selected_price || 'Price unavailable')),
    },
    liquidity: {
      live: liquidityBasis != null,
      basis: liquidityBasis,
      reason: liquidityBasis ? null : metrics?.unavailable_reasons?.liquidity || 'Requires valued indexed pair reserves',
    },
    tvl: {
      live: tvlBasis != null,
      basis: tvlBasis,
      independent: false,
      reason: tvlBasis ? null : metrics?.unavailable_reasons?.tvl || 'Requires valued indexed pair reserves',
    },
    fdv: {
      live: hasFdv,
      basis: hasFdv ? 'total_supply_x_selected_price' : null,
      formula: 'total supply x selected price',
      reason: hasFdv ? null : 'Requires total supply and selected price',
    },
    market_cap: {
      live: hasMarketCap,
      basis: hasMarketCap ? 'circulating_supply_x_selected_price' : null,
      formula: 'circulating supply x selected price',
      requires_circulating_supply: true,
      reason: hasMarketCap ? null : (hasCirculatingSupply ? 'Requires selected market cap value' : 'Requires circulating supply and selected price'),
    },
    holder_count: {
      live: asNumber(metrics?.holder_count) != null,
      source: asNumber(metrics?.holder_count) != null ? 'indexed_snapshot' : null,
      reason: asNumber(metrics?.holder_count) != null ? null : REQUIRES_INDEXED_BACKEND,
    },
    volume_24h: {
      live: volume24Wax != null || volume24Usd != null,
      source: volume24Wax != null || volume24Usd != null ? 'indexed_pair_or_ticker_volume' : null,
      reason: volume24Wax != null || volume24Usd != null ? null : 'Requires indexed pair or ticker volume',
    },
    volume_7d: {
      live: asNumber(metrics?.volume_7d) != null,
      source: asNumber(metrics?.volume_7d) != null ? 'indexed_trade_history_window' : null,
      reason: asNumber(metrics?.volume_7d) != null ? null : 'Requires indexed candle or trade history',
    },
    volume_30d: {
      live: asNumber(metrics?.volume_30d) != null,
      source: asNumber(metrics?.volume_30d) != null ? 'indexed_trade_history_window' : null,
      reason: asNumber(metrics?.volume_30d) != null ? null : 'Requires indexed candle or trade history',
    },
  };
  return {
    has_selected_price: selectedPriceProof.live,
    has_liquidity: liquidityBasis != null,
    has_tvl: tvlBasis != null,
    has_fdv: hasFdv,
    has_market_cap: hasMarketCap,
    has_circulating_supply: hasCirculatingSupply,
    has_total_supply: totalSupply != null,
    tvl_basis: tvlBasis,
    liquidity_basis: liquidityBasis,
    tvl_liquidity_same_basis: tvlBasis != null && liquidityBasis != null && tvlBasis === liquidityBasis,
    selected_price_proof: selectedPriceProof,
    metric_status: metricStatus,
    metric_sources: {
      selected_price: selectedPriceProof.live ? 'indexed_reserve_route' : null,
      liquidity: liquidityBasis,
      tvl: tvlBasis,
      fdv: hasFdv ? 'total_supply_x_selected_price' : null,
      market_cap: hasMarketCap ? 'circulating_supply_x_selected_price' : null,
      holder_count: metricStatus.holder_count.source,
      volume_24h: metricStatus.volume_24h.source,
      volume_7d: metricStatus.volume_7d.source,
      volume_30d: metricStatus.volume_30d.source,
    },
  };
}

function reasonMapForTokenMetrics(metrics) {
  const reasons = {};
  if (metrics.selected_price_wax == null) reasons.selected_price = metrics.selected_pair_id ? 'Source indexed; price unavailable' : 'No indexed pair has enough price data yet';
  if (metrics.change_24h == null) reasons.price_change_24h = 'Requires indexed 24h price-change data';
  if (metrics.volume_24h_wax == null) reasons.volume_24h = 'Requires indexed pair or ticker volume';
  if (metrics.liquidity_wax == null && metrics.liquidity_usd == null) reasons.liquidity = 'Requires valued indexed pair reserves';
  if (metrics.holder_count == null) reasons.holder_count = REQUIRES_INDEXED_BACKEND;
  if (metrics.circulating_supply == null) reasons.circulating_supply = 'Requires indexed circulating supply';
  if (metrics.volume_7d == null) reasons.volume_7d = 'Requires indexed candle or trade history';
  if (metrics.volume_30d == null) reasons.volume_30d = 'Requires indexed candle or trade history';
  if (metrics.market_cap_wax == null && metrics.market_cap_usd == null) reasons.market_cap = metrics.selected_price_wax != null ? 'Circulating supply not indexed' : 'Price unavailable';
  if (metrics.fdv_wax == null && metrics.fdv_usd == null) reasons.fdv = 'Requires total supply and selected price';
  return reasons;
}

function deriveTokenPairMetrics(token, stats, pairRows, priceRows, graphPairRows = pairRows, options = {}) {
  const contract = normalizeContract(token?.contract || stats?.contract);
  const symbol = normalizeSymbol(token?.symbol || stats?.symbol);
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  const metrics = { ...(stats || {}) };
  const sources = new Set(parseSourceKeys(stats?.source_keys));
  let pairCount = 0;
  let liquidityWaxTotal = 0;
  let volumeWaxTotal = 0;
  let hasLiquidityWax = false;
  let hasVolumeWax = false;
  const routeIndex = options.routeIndex || buildOgWaxRouteGraph(graphPairRows, priceIndex);
  const selected = selectOgWaxRoutePrice(tokenKey(contract, symbol), routeIndex);

  for (const pair of pairRows || []) {
    if (!pairTokenSide(pair, contract, symbol)) continue;
    if (!hasRealPairReserves(pair)) continue;
    pairCount += 1;
    const source = aggregateSourceKey(pair.source);
    if (source) sources.add(source);
    const valuation = ogPairReserveValuation(pair, contract, symbol, priceIndex, routeIndex, selected);
    const liquidityWax = asNumber(valuation.contribution_wax);
    const volumeWax = volumeWaxFromIndexedPair(pair, priceIndex);
    if (liquidityWax != null) {
      liquidityWaxTotal += liquidityWax;
      hasLiquidityWax = true;
    }
    if (volumeWax != null) {
      volumeWaxTotal += volumeWax;
      hasVolumeWax = true;
    }
  }

  const totalSupply = asNumber(token?.total_supply ?? token?.max_supply);
  const selectedProof = selectedPriceProofFields(selected);
  const selectedPriceWax = asNumber(selectedProof.selected_price_wax);
  const selectedPriceUsd = asNumber(selectedProof.selected_price_usd);
  const fdvWax = asNumber(metrics.fdv_wax) ?? (totalSupply != null && selectedPriceWax != null ? totalSupply * selectedPriceWax : null);
  const fdvUsd = asNumber(metrics.fdv_usd) ?? (totalSupply != null && selectedPriceUsd != null ? totalSupply * selectedPriceUsd : null);
  const liquidityWax = hasLiquidityWax ? liquidityWaxTotal : null;
  const liquidityUsd = hasLiquidityWax && waxUsd != null ? liquidityWaxTotal * waxUsd : null;
  const volumeWax = hasVolumeWax ? volumeWaxTotal : asNumber(metrics.volume_24h_wax ?? metrics.volume_24h);
  const volumeUsd = volumeWax != null && waxUsd != null ? volumeWax * waxUsd : asNumber(metrics.volume_24h_usd);

  metrics.contract = contract;
  metrics.symbol = symbol;
  metrics.total_supply = safeDecimal(totalSupply);
  applySelectedPriceProofFields(metrics, selected);
  metrics.change_24h = safeDecimal(metrics.change_24h);
  metrics.price_change_24h = metrics.change_24h;
  metrics.volume_24h = safeDecimal(volumeWax);
  metrics.volume_24h_wax = safeDecimal(volumeWax);
  metrics.volume_24h_usd = safeDecimal(volumeUsd);
  metrics.liquidity_wax = safeDecimal(liquidityWax);
  metrics.liquidity_usd = safeDecimal(liquidityUsd);
  metrics.cumulated_pair_liquidity_wax = safeDecimal(liquidityWax);
  metrics.cumulated_pair_liquidity_usd = safeDecimal(liquidityUsd);
  metrics.tvl_wax = safeDecimal(liquidityWax);
  metrics.tvl_usd = safeDecimal(liquidityUsd);
  metrics.liquidity_basis = hasLiquidityWax ? 'og_wax_route_pool_graph' : null;
  metrics.tvl_basis = hasLiquidityWax ? 'og_wax_route_pool_graph' : null;
  metrics.source_count = sources.size || asNumber(metrics.source_count) || null;
  metrics.indexed_pair_count = pairCount || asNumber(metrics.indexed_pair_count) || null;
  metrics.source_keys = Array.from(sources).sort().join(',');
  metrics.fdv_wax = safeDecimal(fdvWax);
  metrics.fdv_usd = safeDecimal(fdvUsd);
  metrics.strongest_pair = selected ? {
    source: selected.route_hops?.[selected.route_hops.length - 1]?.source || null,
    pair_id: selected.route_hops?.[selected.route_hops.length - 1]?.pair_id || null,
    label: metrics.selected_pair_label,
    liquidity_wax: safeDecimal(selected.liquidityWax ?? selected.route_liquidity_score),
    liquidity_usd: safeDecimal(selected.liquidityUsd),
    route_liquidity_score: safeDecimal(selected.route_liquidity_score),
    selected_price_wax: safeDecimal(selected.priceWax),
    selected_price_usd: safeDecimal(selected.priceUsd),
    liquidity_role: 'price_proof_only',
    route_type: selected.route_type,
    route_hops: selected.route_hops,
  } : null;
  metrics.aggregate_status = pairCount > 0
    ? (asNumber(metrics.aggregate_complete) === 1 ? 'Canonical aggregate complete' : (hasLiquidityWax ? 'Pair liquidity indexed; holder/candle metrics pending' : 'Indexed pairs found; advanced metrics partial'))
    : (asNumber(metrics.aggregate_truncated) === 1 ? 'Aggregate truncated; final metrics unavailable' : 'Aggregate incomplete; final metrics unavailable');
  metrics.unavailable_reasons = reasonMapForTokenMetrics(metrics);
  Object.assign(metrics, tokenMetricProof(metrics, selected));
  return metrics;
}

async function loadPairRowsForToken(db, contract, symbol) {
  const rows = await db.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
     FROM waxonedge_pairs
     WHERE (token_a_contract = ? AND token_a_symbol = ?)
        OR (token_b_contract = ? AND token_b_symbol = ?)`
  ).bind(contract, symbol, contract, symbol).all().catch(() => ({ results: [] }));
  return rows.results || [];
}

async function loadRouteGraphRowsForToken(db, contract, symbol, maxHops = OG_WAX_ROUTE_MAX_HOPS) {
  const startKey = tokenKey(contract, symbol);
  if (!startKey) return [];
  const parseFrontierKey = (key) => {
    const separator = String(key || '').indexOf('::');
    if (separator <= 0) return null;
    const parsedContract = normalizeContract(String(key).slice(0, separator));
    const parsedSymbol = normalizeSymbol(String(key).slice(separator + 2));
    return parsedContract && parsedSymbol ? { contract: parsedContract, symbol: parsedSymbol } : null;
  };
  const seenTokens = new Set([startKey]);
  const seenPairs = new Map();
  let frontier = [startKey];
  for (let depth = 0; depth < maxHops && frontier.length; depth += 1) {
    const nextFrontier = [];
    for (let offset = 0; offset < frontier.length; offset += OG_WAX_ROUTE_GRAPH_FRONTIER_LIMIT) {
      const frontierBatch = frontier
        .slice(offset, offset + OG_WAX_ROUTE_GRAPH_FRONTIER_LIMIT)
        .map(parseFrontierKey)
        .filter(Boolean);
      if (!frontierBatch.length) continue;
      const frontierPredicates = frontierBatch.map(() =>
        `((token_a_contract = ? AND token_a_symbol = ?) OR (token_b_contract = ? AND token_b_symbol = ?))`
      ).join(' OR ');
      const frontierParams = frontierBatch.flatMap((token) => [
        token.contract,
        token.symbol,
        token.contract,
        token.symbol,
      ]);
      const rows = await db.prepare(
        `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
                price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
                liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
         FROM waxonedge_pairs
         WHERE ${frontierPredicates}
           AND CAST(COALESCE(reserve_a, '0') AS NUMERIC) > 0
           AND CAST(COALESCE(reserve_b, '0') AS NUMERIC) > 0
         ORDER BY
           CAST(COALESCE(liquidity_wax, '0') AS NUMERIC) DESC,
           updated_at DESC,
           source ASC,
           pair_id ASC
         LIMIT ?`
      ).bind(...frontierParams, OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT).all().catch(() => ({ results: [] }));
      for (const pair of rows.results || []) {
        const pairKey = `${pair.source || ''}::${pair.pair_id || ''}::${pair.token_a_contract || ''}::${pair.token_a_symbol || ''}::${pair.token_b_contract || ''}::${pair.token_b_symbol || ''}`;
        if (!seenPairs.has(pairKey)) seenPairs.set(pairKey, pair);
        for (const key of [
          tokenKey(pair.token_a_contract, pair.token_a_symbol),
          tokenKey(pair.token_b_contract, pair.token_b_symbol),
        ]) {
          if (key && !seenTokens.has(key)) {
            seenTokens.add(key);
            nextFrontier.push(key);
          }
        }
      }
    }
    frontier = nextFrontier;
  }
  return Array.from(seenPairs.values());
}

function diagnoseTokenAggregate(contract, symbol, metrics, pairRows, chartCandleCount, aggregateFresh) {
  const reasons = [];
  const usableReservePairs = pairRows.filter(hasRealPairReserves);
  const waxQuotePairs = pairRows.filter((pair) => hasWaxQuoteForToken(pair, contract, symbol));
  const priced = metrics?.selected_price_wax != null || metrics?.selected_price_usd != null;
  const waxPriced = metrics?.selected_price_wax != null;
  const usdPriced = metrics?.selected_price_usd != null;
  const liquidityValues = pairRows
    .map((pair) => asNumber(pair.liquidity_wax))
    .filter((value) => value != null);
  const derivedStrongestLiquidityWax = asNumber(metrics?.strongest_pair?.liquidity_wax);
  const strongestLiquidityWax = liquidityValues.length
    ? Math.max(...liquidityValues)
    : derivedStrongestLiquidityWax;
  if (!pairRows.length) {
    reasons.push('no indexed pairs found');
  } else if (!usableReservePairs.length) {
    reasons.push('pairs found but no usable reserves');
  }
  if (usableReservePairs.length && !waxQuotePairs.length) {
    reasons.push('reserves found but no WAX quote');
  }
  if (waxQuotePairs.length && !waxPriced) {
    reasons.push('WAX quote found but price calculation failed');
  }
  if (waxPriced && !usdPriced) {
    reasons.push('price found but WAX/USD conversion missing');
  }
  if (strongestLiquidityWax != null && strongestLiquidityWax > 0 && strongestLiquidityWax < MIN_TRUSTED_WAX_LIQUIDITY) {
    reasons.push('liquidity found but below threshold');
  }
  if (!chartCandleCount) {
    reasons.push('chart candles missing');
  }
  if (!aggregateFresh) {
    reasons.push('aggregate rebuild not run after pair sync');
  }
  if (!reasons.length && !priced) {
    reasons.push('No indexed pair has enough price data yet');
  }
  return {
    reasons,
    facts: {
      indexed_pair_count: pairRows.length,
      usable_reserve_pair_count: usableReservePairs.length,
      wax_quote_pair_count: waxQuotePairs.length,
      strongest_liquidity_wax: safeDecimal(strongestLiquidityWax),
      chart_candle_count: chartCandleCount,
      selected_pair_source: metrics?.selected_pair_source || null,
      selected_pair_id: metrics?.selected_pair_id || null,
      selected_price_wax: metrics?.selected_price_wax || null,
      selected_price_usd: metrics?.selected_price_usd || null,
    },
  };
}

async function getToken(db, contract, symbol, options = {}) {
  const token = await db.prepare(
    `SELECT contract, symbol, decimals, total_supply, max_supply, updated_at
     FROM waxonedge_tokens WHERE contract = ? AND symbol = ? LIMIT 1`
  ).bind(contract, symbol).first();
  const stats = await db.prepare(
    `SELECT holder_count, circulating_supply, volume_24h, volume_24h_wax, volume_24h_usd,
            volume_7d, volume_30d,
            market_cap_wax, market_cap_usd, fdv_wax, fdv_usd, liquidity_wax,
            liquidity_usd, tvl_wax, tvl_usd, selected_price_wax, selected_price_usd,
            change_24h, selected_pair_source, selected_pair_id, burned_amount, source_count,
            indexed_pair_count, source_keys, aggregate_complete, aggregate_sources_required,
            aggregate_sources_present, aggregate_sources_processed, aggregate_sources_failed,
            aggregate_truncated, aggregate_sources_truncated, updated_at
     FROM waxonedge_token_stats WHERE contract = ? AND symbol = ? LIMIT 1`
  ).bind(contract, symbol).first().catch(() => null);
  const pairRows = await loadPairRowsForToken(db, contract, symbol);
  const graphRows = options.graphRows || await loadRouteGraphRowsForToken(db, contract, symbol);
  const priceRows = await loadTokenPriceRowsForPairs(db, graphRows);
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const routeIndex = options.routeIndex || buildOgWaxRouteGraph(graphRows, priceIndex);
  const detailStats = deriveTokenPairMetrics(token || { contract, symbol }, stats || {}, pairRows, priceRows, graphRows, { routeIndex });
  const detail = {
    token,
    stats: detailStats,
    source_coverage: sourceCoverageFromKeys(parseSourceKeys(detailStats?.source_keys)),
  };
  if (options.includeRouteContext) {
    detail.route_context = { pairRows, graphRows, priceIndex, routeIndex };
  }
  return detail;
}

function priceProofAudit(contract, symbol, detail, pairRows, graphRows, priceIndex, routeIndex) {
  const key = tokenKey(contract, symbol);
  const selectedRoute = selectOgWaxRoutePrice(key, routeIndex);
  const selectedProof = selectedPriceProofFields(selectedRoute);
  const candidatePairs = (pairRows || []).map((pair) => ({
    source: pair.source || null,
    pair_id: pair.pair_id || null,
    pair_label: selectedPairLabel(pair),
    token_a_contract: pair.token_a_contract || null,
    token_a_symbol: pair.token_a_symbol || null,
    token_b_contract: pair.token_b_contract || null,
    token_b_symbol: pair.token_b_symbol || null,
    reserve_a: safeDecimal(asNumber(pair.reserve_a)),
    reserve_b: safeDecimal(asNumber(pair.reserve_b)),
    has_real_reserves: hasRealPairReserves(pair),
    direct_wax_pair: hasWaxQuoteForToken(pair, contract, symbol),
    contribution_proof: pairContributionProof(pair, contract, symbol, priceIndex, routeIndex),
  }));
  const candidateRoutePrices = selectedRoute ? [{
    token_key: key,
    selected: true,
    selected_price_wax: selectedProof.selected_price_wax,
    selected_price_usd: selectedProof.selected_price_usd,
    route_type: selectedProof.selected_price_route_type,
    route_hops: selectedProof.selected_price_route_hops,
    confidence: selectedProof.selected_price_confidence,
    reason_codes: selectedProof.selected_price_reason_codes,
  }] : [];
  const selectedRoutePairKeys = new Set((selectedRoute?.route_hops || [])
    .map((hop) => `${hop.source || ''}::${hop.pair_id || ''}`));
  const rejectedRoutes = (graphRows || []).filter((pair) => {
    const pairKey = `${pair.source || ''}::${pair.pair_id || ''}`;
    return pairTokenSide(pair, contract, symbol) && !selectedRoutePairKeys.has(pairKey);
  }).map((pair) => ({
    source: pair.source || null,
    pair_id: pair.pair_id || null,
    pair_label: selectedPairLabel(pair),
    reason_codes: hasRealPairReserves(pair) ? ['not_selected_best_route'] : ['missing_or_zero_reserves'],
  }));
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd ?? null;
  return {
    all_candidate_pairs: candidatePairs,
    all_candidate_route_prices: candidateRoutePrices,
    selected_route: selectedProof,
    rejected_routes: rejectedRoutes,
    wax_usd_source: waxUsd == null ? null : 'indexed eosio.token/WAX token price',
    wax_usd: safeDecimal(waxUsd),
    final_displayed_price: {
      selected_price_wax: detail.stats?.selected_price_wax ?? null,
      selected_price_usd: detail.stats?.selected_price_usd ?? null,
      confidence: detail.stats?.selected_price_confidence || 'unavailable',
      reason_codes: detail.stats?.selected_price_reason_codes || [],
    },
  };
}

async function getTokenDebug(db, contract, symbol) {
  const detail = await getToken(db, contract, symbol, { includeRouteContext: true });
  const routeContext = detail.route_context || {};
  delete detail.route_context;
  const pairRows = routeContext.pairRows || await loadPairRowsForToken(db, contract, symbol);
  const graphRows = routeContext.graphRows || await loadRouteGraphRowsForToken(db, contract, symbol);
  const priceIndex = routeContext.priceIndex || buildDbTokenPriceIndex(await loadTokenPriceRowsForPairs(db, graphRows));
  const routeIndex = routeContext.routeIndex || buildOgWaxRouteGraph(graphRows, priceIndex);
  const aggregateTotals = aggregatePairContributionTotals(pairRows, contract, symbol, priceIndex, graphRows, { routeIndex });
  const chartCandleCount = await countScalar(db,
    `SELECT COUNT(*) AS count
     FROM waxonedge_chart_candles c
     JOIN waxonedge_pairs p ON p.source = c.source AND p.pair_id = c.pair_id
     WHERE c.interval = '1D'
       AND ((p.token_a_contract = ? AND p.token_a_symbol = ?)
        OR (p.token_b_contract = ? AND p.token_b_symbol = ?))`,
    [contract, symbol, contract, symbol]);
  const [lastAggregateSuccess, latestPairSuccess] = await Promise.all([
    latestAggregateRunRow(db),
    latestPairSyncRunRow(db),
  ]);
  const aggregateFresh = !!lastAggregateSuccess?.finished_at &&
    (!latestPairSuccess?.finished_at || Date.parse(lastAggregateSuccess.finished_at) >= Date.parse(latestPairSuccess.finished_at));
  const sourceStates = await getSourceIndexStates(db);
  const sourceKeys = parseSourceKeys(detail.stats?.source_keys);
  const partialSourceStates = sourceStates.filter((row) =>
    sourceKeys.includes(aggregateSourceKey(row.source)) &&
    ['partial', 'running'].includes(row.status) &&
    asNumber(row.complete) !== 1);
  let nextAction = null;
  if (!chartCandleCount) {
    nextAction = 'waiting for candle backfill';
  } else if (partialSourceStates.length) {
    nextAction = 'source cursor still partial';
  } else if (!aggregateFresh) {
    nextAction = 'aggregate rebuild pending after pair sync';
  }
  const chartSrc = detail.stats?.selected_pair_source || null;
  const chartPairId = detail.stats?.selected_pair_id || null;
  return {
    token: detail.token,
    stats: detail.stats,
    chart_src: chartSrc,
    chart_pair_id: chartPairId,
    candle_url_example: candleUrlExample(chartSrc, chartPairId),
    reference_candle_url_example: referenceCandleUrlExample(chartSrc, chartPairId),
    aggregate_totals: aggregateTotals,
    price_proof_audit: priceProofAudit(contract, symbol, detail, pairRows, graphRows, priceIndex, routeIndex),
    diagnostics: diagnoseTokenAggregate(contract, symbol, detail.stats, pairRows, chartCandleCount, aggregateFresh),
    source_coverage: detail.source_coverage,
    sync_diagnostics: {
      selected_price_exists: detail.stats?.selected_price_wax != null || detail.stats?.selected_price_usd != null,
      selected_pair_exists: !!(detail.stats?.selected_pair_source && detail.stats?.selected_pair_id),
      pair_rows_exist: pairRows.length > 0,
      source_sync_partial: partialSourceStates.length > 0,
      partial_sources: partialSourceStates.map((row) => ({
        source: row.source,
        cursor: row.cursor || '',
        row_count: asNumber(row.row_count) || 0,
        status: row.status,
      })),
      aggregate_stale: !aggregateFresh,
      has_1d_candles: chartCandleCount > 0,
      next_action: nextAction,
    },
  };
}

async function getLatestSync(db) {
  const rows = await db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     ORDER BY started_at DESC
     LIMIT 50`
  ).all();
  return rows.results || [];
}

async function getSourceIndexStates(db) {
  const rows = await db.prepare(
    `SELECT source, sync_cycle_id, cursor, page_count, row_count, complete, truncated,
            status, error, started_at, updated_at
     FROM waxonedge_source_index_state
     ORDER BY updated_at DESC`
  ).all().catch(() => ({ results: [] }));
  return rows.results || [];
}

async function countScalar(db, sql, params = []) {
  const statement = db.prepare(sql);
  const row = await (params.length ? statement.bind(...params).first() : statement.first()).catch(() => null);
  return asNumber(row?.count) || 0;
}

async function latestSyncRow(db, source, status = null) {
  const statusClause = status ? ' AND status = ?' : '';
  const params = status ? [source, status] : [source];
  return db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     WHERE source = ?${statusClause}
     ORDER BY finished_at DESC, started_at DESC
     LIMIT 1`
  ).bind(...params).first().catch(() => null);
}

function minutesSince(ts) {
  if (!ts) return null;
  const time = Date.parse(ts);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60000));
}

function sourceStateStale(row) {
  const age = minutesSince(row.updated_at || row.started_at);
  if (row.status === 'failed' || asNumber(row.truncated) === 1) return true;
  if (['partial', 'running'].includes(row.status)) return age != null && age > SOURCE_STALE_MINUTES;
  return asNumber(row.complete) !== 1 && !['planned', 'partial_success', 'skipped', 'budget_limited'].includes(row.status);
}

async function latestAggregateRunRow(db) {
  return db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     WHERE source = 'token_aggregates'
       AND status IN ('success', 'partial_success')
     ORDER BY finished_at DESC, started_at DESC
     LIMIT 1`
  ).first().catch(() => null);
}

async function latestPairSyncRunRow(db) {
  return db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     WHERE source IN (${WAXONEDGE_AGGREGATE_SOURCES.map(() => '?').join(',')})
       AND status IN ('success', 'partial')
     ORDER BY finished_at DESC, started_at DESC
     LIMIT 1`
  ).bind(...WAXONEDGE_AGGREGATE_SOURCES).first().catch(() => null);
}

async function latestPairSourceStateUpdateRow(db) {
  return db.prepare(
    `SELECT source, status, updated_at AS finished_at, started_at, error
     FROM waxonedge_source_index_state
     WHERE source IN (${WAXONEDGE_AGGREGATE_SOURCES.map(() => '?').join(',')})
       AND status IN ('success', 'partial', 'running')
     ORDER BY updated_at DESC, started_at DESC
     LIMIT 1`
  ).bind(...WAXONEDGE_AGGREGATE_SOURCES).first().catch(() => null);
}

function parseTimestampMillis(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function aggregateNeedsRefreshAfterPairSync(db) {
  const [aggregate, pairSync, sourceState] = await Promise.all([
    latestAggregateRunRow(db),
    latestPairSyncRunRow(db),
    latestPairSourceStateUpdateRow(db),
  ]);
  const pairSyncFinishedAt = Math.max(
    parseTimestampMillis(pairSync?.finished_at) ?? 0,
    parseTimestampMillis(sourceState?.finished_at) ?? 0,
  );
  if (!pairSyncFinishedAt) return false;
  const aggregateFinishedAt = parseTimestampMillis(aggregate?.finished_at);
  if (aggregateFinishedAt == null) return true;
  return aggregateFinishedAt < pairSyncFinishedAt;
}

async function recordAggregateRefreshDeferred(db, reason = AGGREGATE_REFRESH_REASON) {
  const startedAt = nowIso();
  const payload = {
    aggregate_refresh_pending: true,
    aggregate_refresh_deferred_budget: true,
    reason,
    no_fake_data: true,
  };
  await writeSnapshot(db, 'token_aggregates', payload, startedAt).catch(() => {});
  await recordSyncRun(db, 'token_aggregates', 'skipped', startedAt, reason).catch(() => {});
  return {
    ok: true,
    status: 'skipped',
    aggregate_refresh_pending: true,
    aggregate_refresh_deferred_budget: true,
    reason,
  };
}

async function maybeRefreshAggregateAfterSourceSync(env, options = {}) {
  const freeSafeMode = waxonedgeFreeSafeMode(env);
  const needsAggregateRefresh = await aggregateNeedsRefreshAfterPairSync(env.DB);
  if (!needsAggregateRefresh) {
    if (!freeSafeMode) {
      await writeSnapshot(env.DB, 'token_aggregates', {
        aggregate_refresh_pending: false,
        aggregate_refresh_deferred_budget: false,
        reason: null,
        no_fake_data: true,
      }, nowIso()).catch(() => {});
    }
    return null;
  }
  if (freeSafeMode || options.deferForBudget) {
    return recordAggregateRefreshDeferred(env.DB, options.reason || 'Aggregate refresh deferred after source sync to avoid Worker budget pressure');
  }
  const aggregates = await aggregateTokenAnalytics(env);
  await writeSnapshot(env.DB, 'token_aggregates', {
    aggregate_refresh_pending: false,
    aggregate_refresh_deferred_budget: false,
    refreshed_after_source_sync: true,
    status: aggregates.status,
    tokens: aggregates.tokens,
    no_fake_data: true,
  }, nowIso()).catch(() => {});
  return aggregates;
}

async function sourceRowCounts(db) {
  const counts = {};
  for (const source of WAXONEDGE_AGGREGATE_SOURCES) counts[source] = 0;
  const rows = await db.prepare(
    `SELECT source, COUNT(*) AS count
     FROM waxonedge_pairs
     WHERE source IN (${WAXONEDGE_AGGREGATE_SOURCES.map(() => '?').join(',')})
     GROUP BY source`
  ).bind(...WAXONEDGE_AGGREGATE_SOURCES).all().catch(() => ({ results: [] }));
  for (const row of rows.results || []) counts[aggregateSourceKey(row.source)] = asNumber(row.count) || 0;
  return counts;
}

async function getTvlPrecisionDiagnostics(db) {
  const validRows = await countScalar(db, `
    SELECT COUNT(*) AS count
    FROM waxonedge_pairs
    WHERE liquidity_usd IS NOT NULL
      AND CAST(liquidity_usd AS NUMERIC) >= 0
      AND CAST(liquidity_usd AS NUMERIC) <= ?`, [MAX_REASONABLE_PAIR_TVL_USD]);
  const impossibleRows = await countScalar(db, `
    SELECT COUNT(*) AS count
    FROM waxonedge_pairs
    WHERE liquidity_usd IS NOT NULL
      AND (CAST(liquidity_usd AS NUMERIC) < 0
        OR CAST(liquidity_usd AS NUMERIC) > ?)`, [MAX_REASONABLE_PAIR_TVL_USD]);
  const missingRealPriceRows = await countScalar(db, `
    SELECT COUNT(*) AS count
    FROM waxonedge_pairs
    WHERE liquidity_usd IS NULL
      AND CAST(COALESCE(reserve_a, '0') AS NUMERIC) > 0
      AND CAST(COALESCE(reserve_b, '0') AS NUMERIC) > 0`);
  const maxRow = await db.prepare(
    `SELECT MAX(CAST(liquidity_usd AS NUMERIC)) AS max_tvl_usd
     FROM waxonedge_pairs
     WHERE liquidity_usd IS NOT NULL
       AND CAST(liquidity_usd AS NUMERIC) <= ?`
  ).bind(MAX_REASONABLE_PAIR_TVL_USD).first().catch(() => null);
  const examples = await db.prepare(
    `SELECT source, pair_id, token_a_symbol, token_b_symbol, reserve_a, reserve_b, liquidity_wax, liquidity_usd
     FROM waxonedge_pairs
     WHERE liquidity_usd IS NOT NULL
       AND CAST(liquidity_usd AS NUMERIC) <= ?
     ORDER BY CAST(liquidity_usd AS NUMERIC) DESC
     LIMIT 5`
  ).bind(MAX_REASONABLE_PAIR_TVL_USD).all().catch(() => ({ results: [] }));
  return {
    max_reasonable_pair_tvl_usd: MAX_REASONABLE_PAIR_TVL_USD,
    tvl_rows_valid: validRows,
    tvl_rows_skipped: impossibleRows,
    impossible_tvl_rows_skipped: impossibleRows,
    tvl_rows_missing_real_price: missingRealPriceRows,
    max_tvl_usd_after_fix: asNumber(maxRow?.max_tvl_usd),
    largest_tvl_examples: (examples.results || []).map((row) => ({
      source: row.source,
      pair_id: row.pair_id,
      pair: [row.token_a_symbol, row.token_b_symbol].filter(Boolean).join('/'),
      reserve_a: row.reserve_a,
      reserve_b: row.reserve_b,
      liquidity_wax: row.liquidity_wax,
      liquidity_usd: row.liquidity_usd,
    })),
    no_fake_tvl_caps: true,
  };
}

async function getIndexerHealth(db, env = {}) {
  const pairTokenCte = `
    WITH pair_tokens AS (
      SELECT t.contract, t.symbol
      FROM waxonedge_tokens t
      WHERE EXISTS (
        SELECT 1 FROM waxonedge_pairs p
        WHERE (p.token_a_contract = t.contract AND p.token_a_symbol = t.symbol)
           OR (p.token_b_contract = t.contract AND p.token_b_symbol = t.symbol)
      )
    )`;
  const candleTokenCte = `
    WITH candle_tokens AS (
      SELECT t.contract, t.symbol
      FROM waxonedge_tokens t
      WHERE EXISTS (
        SELECT 1
        FROM waxonedge_pairs p
        JOIN waxonedge_chart_candles c ON c.source = p.source AND c.pair_id = p.pair_id
        WHERE c.interval = '1D'
          AND ((p.token_a_contract = t.contract AND p.token_a_symbol = t.symbol)
            OR (p.token_b_contract = t.contract AND p.token_b_symbol = t.symbol))
      )
    )`;
  const pairTokenRowsCte = `
    WITH pair_tokens AS (
      SELECT t.contract, t.symbol
      FROM waxonedge_tokens t
      WHERE EXISTS (
        SELECT 1 FROM waxonedge_pairs p
        WHERE (p.token_a_contract = t.contract AND p.token_a_symbol = t.symbol)
           OR (p.token_b_contract = t.contract AND p.token_b_symbol = t.symbol)
      )
    ),
    scoped_pairs AS (
      SELECT p.*
      FROM waxonedge_pairs p
      JOIN pair_tokens pt
        ON (p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
        OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol)
    )`;
  const [
    totalTokens,
    tokensWithPairs,
    tokensWithCandles,
    tokensWithSelectedPrice,
    tokensWithLiquidity,
    tokensWithVolume,
    tokensWithSelectedPair,
    sourceCounts,
    sourceStates,
    lastAggregateSuccess,
    latestPairSuccess,
    latestPairSourceState,
    aggregateSnapshot,
    candleBackfillState,
    candleBackfillSnapshot,
    tradeIndexState,
    tradeIndexSnapshot,
    ammTradeIndexState,
    ammTradeIndexSnapshot,
    tvlPrecisionDiagnostics,
    liveIndexerProbe,
  ] = await Promise.all([
    countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_tokens`),
    countScalar(db, `${pairTokenCte} SELECT COUNT(*) AS count FROM pair_tokens`),
    countScalar(db, `${candleTokenCte} SELECT COUNT(*) AS count FROM candle_tokens`),
    countScalar(db,
      `SELECT COUNT(*) AS count
       FROM waxonedge_tokens t
       JOIN waxonedge_token_stats s ON s.contract = t.contract AND s.symbol = t.symbol
       WHERE s.selected_price_wax IS NOT NULL OR s.selected_price_usd IS NOT NULL`),
    countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_token_stats WHERE liquidity_wax IS NOT NULL OR liquidity_usd IS NOT NULL OR tvl_wax IS NOT NULL OR tvl_usd IS NOT NULL`),
    countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_token_stats WHERE volume_24h_wax IS NOT NULL OR volume_24h_usd IS NOT NULL OR volume_24h IS NOT NULL`),
    countScalar(db,
      `SELECT COUNT(*) AS count
       FROM waxonedge_tokens t
       JOIN waxonedge_token_stats s ON s.contract = t.contract AND s.symbol = t.symbol
       WHERE s.selected_pair_source IS NOT NULL AND s.selected_pair_id IS NOT NULL`),
    sourceRowCounts(db),
    getSourceIndexStates(db),
    latestAggregateRunRow(db),
    latestPairSyncRunRow(db),
    latestPairSourceStateUpdateRow(db),
    readSnapshot(db, 'token_aggregates'),
    readSourceIndexState(db, CANDLE_BACKFILL_SOURCE),
    readSnapshot(db, CANDLE_BACKFILL_SOURCE),
    readSourceIndexState(db, ALCOR_TRADE_INDEX_SOURCE),
    readSnapshot(db, ALCOR_TRADE_INDEX_SOURCE),
    readSourceIndexState(db, AMM_TRADE_INDEX_SOURCE),
    readSnapshot(db, AMM_TRADE_INDEX_SOURCE),
    getTvlPrecisionDiagnostics(db),
    cachedProbeWaxonedgeLiveIndexer(env),
  ]);
  const staleSyncRows = await Promise.all(sourceStates
    .filter(sourceStateStale)
    .map(async (row) => {
      const adapter = CORE_DEX_ADAPTERS.find((entry) => entry.source === aggregateSourceKey(row.source));
      const snapshot = adapter ? await readSnapshot(db, `${adapter.source}_${adapter.table}`) : { data: null };
      return {
      source: row.source,
      status: row.status,
      complete: asNumber(row.complete) === 1,
      truncated: asNumber(row.truncated) === 1,
      age_minutes: minutesSince(row.updated_at || row.started_at),
      error: row.error || null,
      cursor: row.cursor || '',
      retry_count: asNumber(snapshot.data?.retry_count) || 0,
      skipped_cursor_count: asNumber(snapshot.data?.skipped_cursor_count) || 0,
      skipped_cursor_reason: snapshot.data?.skipped_cursor_reason || null,
      };
    }));
  const latestPairSourceMillis = Math.max(
    parseTimestampMillis(latestPairSuccess?.finished_at) ?? 0,
    parseTimestampMillis(latestPairSourceState?.finished_at) ?? 0,
  );
  const lastAggregateMillis = parseTimestampMillis(lastAggregateSuccess?.finished_at);
  const aggregateFresh = !!lastAggregateMillis && (!latestPairSourceMillis || lastAggregateMillis >= latestPairSourceMillis);
  const aggregateRefreshPending = !aggregateFresh && latestPairSourceMillis > 0;
  const sourceSyncInProgress = sourceStates
    .filter((row) => WAXONEDGE_AGGREGATE_SOURCES.includes(aggregateSourceKey(row.source)))
    .some((row) => ['partial', 'running'].includes(row.status));
  const sourceProgress = await Promise.all(sourceStates
    .filter((row) => WAXONEDGE_AGGREGATE_SOURCES.includes(aggregateSourceKey(row.source)))
    .map(async (row) => {
      const adapter = CORE_DEX_ADAPTERS.find((entry) => entry.source === aggregateSourceKey(row.source));
      const snapshot = adapter ? await readSnapshot(db, `${adapter.source}_${adapter.table}`) : { data: null };
      const cursorChangedAt = snapshot.data?.cursor_changed_at || row.updated_at || row.started_at || null;
      const measuredStuckForMinutes = ['partial', 'running'].includes(row.status) ? minutesSince(cursorChangedAt) : 0;
      const stuckForMinutes = Number.isFinite(measuredStuckForMinutes) ? measuredStuckForMinutes : 0;
      const cursor = row.cursor || '';
      const previousCursor = snapshot.data?.previous_cursor || '';
      const retryCount = asNumber(snapshot.data?.retry_count) || 0;
      const skippedCursorCount = asNumber(snapshot.data?.skipped_cursor_count) || 0;
      const skippedCursorReason = snapshot.data?.skipped_cursor_reason || null;
      const nextAction = asNumber(row.complete) === 1
        ? 'complete'
        : (skippedCursorReason
          ? 'stuck cursor skipped; continue from saved cursor'
          : (stuckForMinutes > SOURCE_STALE_MINUTES ? 'resume from saved cursor or reset stuck source' : 'continue from saved cursor'));
      return {
      source: row.source,
      status: row.status,
      complete: asNumber(row.complete) === 1,
      previous_cursor: previousCursor,
      current_cursor: cursor,
      cursor_changed_at: cursorChangedAt,
      chunks_completed: asNumber(snapshot.data?.chunks_completed) ?? asNumber(row.page_count) ?? 0,
      retry_count: retryCount,
      skipped_cursor_count: skippedCursorCount,
      skipped_cursor_reason: skippedCursorReason,
      stuck_for_minutes: stuckForMinutes,
      next_action: nextAction,
      cursor,
      page_count: asNumber(row.page_count) || 0,
      row_count: asNumber(row.row_count) || 0,
      stale_running: row.status === 'running' && minutesSince(row.updated_at || row.started_at) > SOURCE_STALE_MINUTES,
      age_minutes: minutesSince(row.updated_at || row.started_at),
      };
    }));
  const chartCandleCount1d = await countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_chart_candles WHERE interval = '1D'`);
  const chartExamplePair = await db.prepare(
    `SELECT source, pair_id
     FROM waxonedge_chart_candles
     WHERE interval = '1D'
     GROUP BY source, pair_id
     ORDER BY MAX(updated_at) DESC
     LIMIT 1`
  ).first().catch(() => null);
  const selectedChartExamplePair = chartExamplePair || await db.prepare(
    `SELECT selected_pair_source AS source, selected_pair_id AS pair_id
     FROM waxonedge_token_stats
     WHERE selected_pair_source IS NOT NULL
       AND selected_pair_id IS NOT NULL
     ORDER BY CAST(COALESCE(liquidity_wax, '0') AS NUMERIC) DESC
     LIMIT 1`
  ).first().catch(() => null);
  const deadReasons = {
    no_indexed_pairs_found: Math.max(0, totalTokens - tokensWithPairs),
    pairs_found_but_no_usable_reserves: await countScalar(db, `
      ${pairTokenRowsCte}
      SELECT COUNT(*) AS count
      FROM pair_tokens pt
      WHERE NOT EXISTS (
        SELECT 1 FROM scoped_pairs p
        WHERE ((p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
            OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol))
          AND CAST(COALESCE(p.reserve_a, '0') AS NUMERIC) > 0
          AND CAST(COALESCE(p.reserve_b, '0') AS NUMERIC) > 0
      )`),
    reserves_found_but_no_wax_quote: await countScalar(db, `
      ${pairTokenRowsCte}
      SELECT COUNT(*) AS count
      FROM pair_tokens pt
      WHERE EXISTS (
        SELECT 1 FROM scoped_pairs p
        WHERE ((p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
            OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol))
          AND CAST(COALESCE(p.reserve_a, '0') AS NUMERIC) > 0
          AND CAST(COALESCE(p.reserve_b, '0') AS NUMERIC) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM scoped_pairs p
        WHERE ((p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
            OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol))
          AND ((p.token_a_contract = 'eosio.token' AND p.token_a_symbol = 'WAX')
            OR (p.token_b_contract = 'eosio.token' AND p.token_b_symbol = 'WAX'))
      )`),
    wax_quote_found_but_price_calculation_failed: await countScalar(db, `
      ${pairTokenRowsCte}
      SELECT COUNT(*) AS count
      FROM pair_tokens pt
      JOIN waxonedge_token_stats s ON s.contract = pt.contract AND s.symbol = pt.symbol
      WHERE (s.selected_price_wax IS NULL AND s.selected_price_usd IS NULL)
        AND EXISTS (
          SELECT 1 FROM scoped_pairs p
          WHERE ((p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
              OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol))
            AND ((p.token_a_contract = 'eosio.token' AND p.token_a_symbol = 'WAX')
              OR (p.token_b_contract = 'eosio.token' AND p.token_b_symbol = 'WAX'))
        )`),
    price_found_but_wax_usd_conversion_missing: await countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_token_stats WHERE selected_price_wax IS NOT NULL AND selected_price_usd IS NULL`),
    liquidity_found_but_below_threshold: await countScalar(db, `
      SELECT COUNT(*) AS count
      FROM waxonedge_token_stats
      WHERE liquidity_wax IS NOT NULL
        AND CAST(liquidity_wax AS NUMERIC) > 0
        AND CAST(liquidity_wax AS NUMERIC) < ?`, [MIN_TRUSTED_WAX_LIQUIDITY]),
    source_rows_inactive: 0,
    chart_candles_missing: Math.max(0, totalTokens - tokensWithCandles),
    aggregate_rebuild_not_run_after_pair_sync: aggregateFresh ? 0 : Math.max(0, tokensWithPairs),
  };
  return {
    generated_at: nowIso(),
    runtime_config: {
      free_safe_mode: waxonedgeFreeSafeMode(env),
      active_candle_backfill_pair_limit: candleBackfillPairLimit(env),
      active_trade_index_pair_limit: tradeIndexPairLimit(env),
      active_trade_rows_per_market_limit: tradeRowsPerMarketLimit(env),
      active_trade_stream_pages_per_run: tradeStreamPagesPerRun(env),
      active_source_page_limit: coreDexPagesPerInvocation(env),
      active_cron_rotation_mode: 'isolated-heavy-workloads',
      hyperion_configured: hyperionConfigured(env),
      active_hyperion_endpoint: hyperionHistoryActionsEndpoint(env) || null,
    },
    live_updates: {
      snapshot_endpoint: WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT,
      stream_endpoint: WAXONEDGE_LIVE_STREAM_ENDPOINT,
      transport: 'snapshot-polling-contract',
      vps_stream_required: true,
      live_indexer: waxonedgeLiveIndexerConfig(env),
      live_indexer_probe: liveIndexerProbe,
      uses_fake_live_data: false,
      browser_hyperion_fetch: false,
      token_key_format: 'contract::symbol',
    },
    totals: {
      total_indexed_tokens: totalTokens,
      tokens_with_selected_price: tokensWithSelectedPrice,
      tokens_without_selected_price: Math.max(0, totalTokens - tokensWithSelectedPrice),
      tokens_with_indexed_pairs: tokensWithPairs,
      tokens_with_zero_indexed_pairs: Math.max(0, totalTokens - tokensWithPairs),
      tokens_with_liquidity: tokensWithLiquidity,
      tokens_without_liquidity: Math.max(0, totalTokens - tokensWithLiquidity),
      tokens_with_24h_volume: tokensWithVolume,
      tokens_without_24h_volume: Math.max(0, totalTokens - tokensWithVolume),
      tokens_with_chart_candles: tokensWithCandles,
      tokens_without_chart_candles: Math.max(0, totalTokens - tokensWithCandles),
      tokens_with_selected_pair: tokensWithSelectedPair,
      tokens_without_selected_pair: Math.max(0, totalTokens - tokensWithSelectedPair),
    },
    per_source_row_counts: sourceCounts,
    source_progress: sourceProgress,
    stale_sync_rows: staleSyncRows,
    aggregate_rebuild: {
      status: lastAggregateSuccess?.status || 'failed',
      last_success_at: lastAggregateSuccess?.finished_at || lastAggregateSuccess?.started_at || null,
      latest_pair_success_at: latestPairSuccess?.finished_at || latestPairSourceState?.finished_at || latestPairSuccess?.started_at || latestPairSourceState?.started_at || null,
      fresh_after_latest_pair_sync: aggregateFresh,
      aggregate_fresh_after_latest_pair_sync: aggregateFresh,
      source_sync_in_progress: sourceSyncInProgress,
      aggregate_refresh_pending: aggregateRefreshPending,
      aggregate_refresh_deferred_budget: aggregateRefreshPending && aggregateSnapshot.data?.aggregate_refresh_deferred_budget === true,
    },
    dead_token_reason_counts: deadReasons,
    tvl_precision_diagnostics: tvlPrecisionDiagnostics,
    candle_gap: {
      chart_candles_indexed_count: chartCandleCount1d,
      tokens_with_no_chart_source: Math.max(0, totalTokens - tokensWithCandles),
      tokens_with_chart_candidate_but_no_candles: Math.max(0, tokensWithPairs - tokensWithCandles),
    },
    candle_url_examples: {
      moonboys_source: candleUrlExample(selectedChartExamplePair?.source || 'alcor', selectedChartExamplePair?.pair_id || '<selected_pair_id>'),
      reference_source: referenceCandleUrlExample(selectedChartExamplePair?.source || 'alcor', selectedChartExamplePair?.pair_id || '<selected_pair_id>'),
      has_real_indexed_candle_example: !!chartExamplePair,
      unavailable: chartExamplePair ? null : 'No real indexed 1D candle rows available yet.',
    },
    trade_indexing: {
      source: ALCOR_TRADE_INDEX_SOURCE,
      status: tradeIndexState?.status || 'not_started',
      candidate_pair_count: asNumber(tradeIndexSnapshot.data?.candidate_pair_count) || asNumber(tradeIndexState?.row_count) || 0,
      action_stream_count: asNumber(tradeIndexSnapshot.data?.action_stream_count) || 0,
      attempted_stream_count: asNumber(tradeIndexSnapshot.data?.attempted_stream_count) || asNumber(tradeIndexSnapshot.data?.attempted_pair_count) || 0,
      processed_stream_count: asNumber(tradeIndexSnapshot.data?.processed_stream_count) || asNumber(tradeIndexSnapshot.data?.processed_pair_count) || asNumber(tradeIndexState?.page_count) || 0,
      processed_pair_count: asNumber(tradeIndexSnapshot.data?.processed_pair_count) || asNumber(tradeIndexState?.page_count) || 0,
      attempted_pair_count: asNumber(tradeIndexSnapshot.data?.attempted_pair_count) || 0,
      failed_pair_count: asNumber(tradeIndexSnapshot.data?.failed_pair_count) || 0,
      unsupported_pair_count: asNumber(tradeIndexSnapshot.data?.unsupported_pair_count) || 0,
      temporarily_failed_pair_count: asNumber(tradeIndexSnapshot.data?.temporarily_failed_pair_count) || 0,
      upstream_5xx_count: asNumber(tradeIndexSnapshot.data?.upstream_5xx_count) || 0,
      upstream_bad_payload_count: asNumber(tradeIndexSnapshot.data?.upstream_bad_payload_count) || 0,
      hyperion_not_configured: tradeIndexSnapshot.data?.hyperion_not_configured === true || !hyperionConfigured(env),
      hyperion_not_configured_count: asNumber(tradeIndexSnapshot.data?.hyperion_not_configured_count) || 0,
      active_hyperion_endpoint: hyperionHistoryActionsEndpoint(env) || tradeIndexSnapshot.data?.active_hyperion_endpoint || null,
      hyperion_query_shape: tradeIndexSnapshot.data?.hyperion_query_shape || HYPERION_MARKET_MATCH_QUERY_SHAPE,
      bounded_history_seed: tradeIndexSnapshot.data?.bounded_history_seed !== false,
      history_pagination_complete: tradeIndexSnapshot.data?.history_pagination_complete === true,
      pagination_mode: tradeIndexSnapshot.data?.pagination_mode || (tradeIndexSnapshot.data?.bounded_history_seed === false ? 'skip' : 'none'),
      bounded_skip_window_exhausted: tradeIndexSnapshot.data?.bounded_skip_window_exhausted === true,
      hyperion_skip_window_limit: asNumber(tradeIndexSnapshot.data?.hyperion_skip_window_limit) || HYPERION_SKIP_WINDOW_LIMIT,
      last_valid_skip_cursor: asNumber(tradeIndexSnapshot.data?.last_valid_skip_cursor) ?? hyperionSkipWindowState(0, tradeRowsPerMarketLimit(env)).last_valid_skip_cursor,
      action_streams: tradeIndexSnapshot.data?.action_streams || normalizeActionStreamProgressMap({}, defaultAlcorTradeActionStreams()),
      last_stream_cursor: asNumber(tradeIndexSnapshot.data?.last_stream_cursor) || 0,
      last_stream_sequence: tradeIndexSnapshot.data?.last_stream_sequence ?? null,
      last_stream_block: tradeIndexSnapshot.data?.last_stream_block ?? null,
      hyperion_scan_no_market_matches_count: asNumber(tradeIndexSnapshot.data?.hyperion_scan_no_market_matches_count) || 0,
      no_trade_rows_count: asNumber(tradeIndexSnapshot.data?.no_trade_rows_count) || 0,
      trade_rows_indexed: asNumber(tradeIndexSnapshot.data?.trade_rows_indexed) || 0,
      rows_written: asNumber(tradeIndexSnapshot.data?.rows_written) || 0,
      last_run_rows_fetched: asNumber(tradeIndexSnapshot.data?.last_run_rows_fetched) || 0,
      last_run_rows_written: asNumber(tradeIndexSnapshot.data?.last_run_rows_written) || 0,
      duplicate_rows_skipped: asNumber(tradeIndexSnapshot.data?.duplicate_rows_skipped) || 0,
      active_pair_limit: asNumber(tradeIndexSnapshot.data?.active_pair_limit) || tradeIndexPairLimit(env),
      active_stream_limit: asNumber(tradeIndexSnapshot.data?.active_stream_limit) || tradeIndexPairLimit(env),
      active_stream_pages_per_run: asNumber(tradeIndexSnapshot.data?.active_stream_pages_per_run) || tradeStreamPagesPerRun(env),
      active_rows_per_market_limit: asNumber(tradeIndexSnapshot.data?.active_rows_per_market_limit) || tradeRowsPerMarketLimit(env),
      trade_history_not_available_for_source: tradeIndexSnapshot.data?.trade_history_not_available_for_source || TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice(),
      trade_stream_not_verified_from_og_refs: tradeIndexSnapshot.data?.trade_stream_not_verified_from_og_refs || TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
      reference_trade_source: tradeIndexSnapshot.data?.reference_trade_source || 'Wapaca backend indexes alcormarket marketMatches from Hyperion/state-history rows, not a canonical public Alcor HTTP trade endpoint.',
      guessed_public_alcor_http_source_of_truth: tradeIndexSnapshot.data?.guessed_public_alcor_http_source_of_truth === true,
      sample_trade_fetch_failure: tradeIndexSnapshot.data?.sample_trade_fetch_failure || null,
      sample_trade_fetch_success: tradeIndexSnapshot.data?.sample_trade_fetch_success || null,
      budget_exhausted: !!tradeIndexSnapshot.data?.budget_exhausted,
      cursor: tradeIndexState?.cursor || tradeIndexSnapshot.data?.cursor || '',
      last_error: tradeIndexSnapshot.data?.last_error || tradeIndexState?.error || null,
      next_action: tradeIndexSnapshot.data?.next_action || (!hyperionConfigured(env) ? 'configure WAXONEDGE_HYPERION_API with a real WAX Hyperion endpoint' : 'continue from cursor'),
      plan: TRADE_INDEX_PLAN,
      no_fake_trades: true,
    },
    amm_trade_indexing: {
      source: AMM_TRADE_INDEX_SOURCE,
      status: ammTradeIndexState?.status || 'not_started',
      candidate_pair_count: asNumber(ammTradeIndexSnapshot.data?.candidate_pair_count) || asNumber(ammTradeIndexState?.row_count) || 0,
      action_stream_count: asNumber(ammTradeIndexSnapshot.data?.action_stream_count) || AMM_SWAP_ACTION_STREAMS.length,
      attempted_stream_count: asNumber(ammTradeIndexSnapshot.data?.attempted_stream_count) || asNumber(ammTradeIndexSnapshot.data?.attempted_pair_count) || 0,
      processed_stream_count: asNumber(ammTradeIndexSnapshot.data?.processed_stream_count) || asNumber(ammTradeIndexSnapshot.data?.processed_pair_count) || asNumber(ammTradeIndexState?.page_count) || 0,
      processed_pair_count: asNumber(ammTradeIndexSnapshot.data?.processed_pair_count) || asNumber(ammTradeIndexState?.page_count) || 0,
      attempted_pair_count: asNumber(ammTradeIndexSnapshot.data?.attempted_pair_count) || 0,
      failed_pair_count: asNumber(ammTradeIndexSnapshot.data?.failed_pair_count) || 0,
      unsupported_pair_count: asNumber(ammTradeIndexSnapshot.data?.unsupported_pair_count) || 0,
      temporarily_failed_pair_count: asNumber(ammTradeIndexSnapshot.data?.temporarily_failed_pair_count) || 0,
      upstream_5xx_count: asNumber(ammTradeIndexSnapshot.data?.upstream_5xx_count) || 0,
      upstream_bad_payload_count: asNumber(ammTradeIndexSnapshot.data?.upstream_bad_payload_count) || 0,
      hyperion_not_configured: ammTradeIndexSnapshot.data?.hyperion_not_configured === true || !hyperionConfigured(env),
      hyperion_not_configured_count: asNumber(ammTradeIndexSnapshot.data?.hyperion_not_configured_count) || 0,
      active_hyperion_endpoint: hyperionHistoryActionsEndpoint(env) || ammTradeIndexSnapshot.data?.active_hyperion_endpoint || null,
      hyperion_query_shape: ammTradeIndexSnapshot.data?.hyperion_query_shape || HYPERION_AMM_SWAP_QUERY_SHAPE,
      bounded_history_seed: ammTradeIndexSnapshot.data?.bounded_history_seed === true,
      history_pagination_complete: ammTradeIndexSnapshot.data?.history_pagination_complete === true,
      pagination_mode: ammTradeIndexSnapshot.data?.pagination_mode || 'skip',
      bounded_skip_window_exhausted: ammTradeIndexSnapshot.data?.bounded_skip_window_exhausted === true,
      hyperion_skip_window_limit: asNumber(ammTradeIndexSnapshot.data?.hyperion_skip_window_limit) || HYPERION_SKIP_WINDOW_LIMIT,
      last_valid_skip_cursor: asNumber(ammTradeIndexSnapshot.data?.last_valid_skip_cursor) ?? hyperionSkipWindowState(0, tradeRowsPerMarketLimit(env)).last_valid_skip_cursor,
      configured_streams: ammTradeIndexSnapshot.data?.configured_streams || AMM_SWAP_ACTION_STREAMS,
      action_streams: ammTradeIndexSnapshot.data?.action_streams || normalizeActionStreamProgressMap({}, defaultAmmSwapActionStreams()),
      last_stream_cursor: asNumber(ammTradeIndexSnapshot.data?.last_stream_cursor) || 0,
      last_stream_sequence: ammTradeIndexSnapshot.data?.last_stream_sequence ?? null,
      last_stream_block: ammTradeIndexSnapshot.data?.last_stream_block ?? null,
      no_trade_rows_count: asNumber(ammTradeIndexSnapshot.data?.no_trade_rows_count) || 0,
      trade_rows_not_usable_count: asNumber(ammTradeIndexSnapshot.data?.trade_rows_not_usable_count) || 0,
      trade_rows_indexed: asNumber(ammTradeIndexSnapshot.data?.trade_rows_indexed) || 0,
      rows_written: asNumber(ammTradeIndexSnapshot.data?.rows_written) || 0,
      last_run_rows_fetched: asNumber(ammTradeIndexSnapshot.data?.last_run_rows_fetched) || 0,
      last_run_rows_written: asNumber(ammTradeIndexSnapshot.data?.last_run_rows_written) || 0,
      duplicate_rows_skipped: asNumber(ammTradeIndexSnapshot.data?.duplicate_rows_skipped) || 0,
      active_pair_limit: asNumber(ammTradeIndexSnapshot.data?.active_pair_limit) || tradeIndexPairLimit(env),
      active_stream_limit: asNumber(ammTradeIndexSnapshot.data?.active_stream_limit) || tradeIndexPairLimit(env),
      active_stream_pages_per_run: asNumber(ammTradeIndexSnapshot.data?.active_stream_pages_per_run) || tradeStreamPagesPerRun(env),
      active_rows_per_market_limit: asNumber(ammTradeIndexSnapshot.data?.active_rows_per_market_limit) || tradeRowsPerMarketLimit(env),
      trade_history_not_available_for_source: ammTradeIndexSnapshot.data?.trade_history_not_available_for_source || TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice(),
      trade_stream_not_verified_from_og_refs: ammTradeIndexSnapshot.data?.trade_stream_not_verified_from_og_refs || TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
      sample_trade_fetch_failure: ammTradeIndexSnapshot.data?.sample_trade_fetch_failure || null,
      sample_trade_fetch_success: ammTradeIndexSnapshot.data?.sample_trade_fetch_success || null,
      budget_exhausted: !!ammTradeIndexSnapshot.data?.budget_exhausted,
      cursor: ammTradeIndexState?.cursor || ammTradeIndexSnapshot.data?.cursor || '',
      last_error: ammTradeIndexSnapshot.data?.last_error || ammTradeIndexState?.error || null,
      next_action: ammTradeIndexSnapshot.data?.next_action || (!hyperionConfigured(env) ? 'configure WAXONEDGE_HYPERION_API with a real WAX Hyperion endpoint' : 'continue AMM action streams'),
      plan: AMM_TRADE_INDEX_PLAN,
      no_fake_trades: true,
    },
    candle_backfill: {
      source: CANDLE_BACKFILL_SOURCE,
      status: candleBackfillState?.status || 'not_started',
      candidate_pair_count: asNumber(candleBackfillSnapshot.data?.candidate_pair_count) || asNumber(candleBackfillState?.row_count) || 0,
      processed_pair_count: asNumber(candleBackfillSnapshot.data?.processed_pair_count) || asNumber(candleBackfillState?.page_count) || 0,
      attempted_pair_count: asNumber(candleBackfillSnapshot.data?.attempted_pair_count) || 0,
      failed_pair_count: asNumber(candleBackfillSnapshot.data?.failed_pair_count) || 0,
      unsupported_pair_count: asNumber(candleBackfillSnapshot.data?.unsupported_pair_count_total ?? candleBackfillSnapshot.data?.unsupported_pair_count) || 0,
      external_chart_endpoint_unsupported: asNumber(candleBackfillSnapshot.data?.external_chart_endpoint_unsupported) || 0,
      trade_rows_not_indexed: asNumber(candleBackfillSnapshot.data?.trade_rows_not_indexed_count) || 0,
      trade_rows_not_usable_for_ohlcv: asNumber(candleBackfillSnapshot.data?.trade_rows_not_usable_for_ohlcv_count) || 0,
      swap_rows_not_indexed: asNumber(candleBackfillSnapshot.data?.swap_rows_not_indexed_count) || 0,
      pair_id_mismatch_count: asNumber(candleBackfillSnapshot.data?.pair_id_mismatch_count) || 0,
      candles_built_from_trade_rows: asNumber(candleBackfillSnapshot.data?.candles_built_from_trade_rows) || 0,
      candle_candidate_count_by_source: candleBackfillSnapshot.data?.candle_candidate_count_by_source || {},
      trade_rows_indexed_by_source: candleBackfillSnapshot.data?.trade_rows_indexed_by_source || {},
      candles_written_by_source: candleBackfillSnapshot.data?.candles_written_by_source || {},
      trade_rows_not_indexed_by_source: candleBackfillSnapshot.data?.trade_rows_not_indexed_by_source || {},
      pair_id_mismatch_count_by_source: candleBackfillSnapshot.data?.pair_id_mismatch_count_by_source || {},
      pair_id_mismatch_examples_by_source: candleBackfillSnapshot.data?.pair_id_mismatch_examples_by_source || {},
      source_alias_normalized_count: asNumber(candleBackfillSnapshot.data?.source_alias_normalized_count) || 0,
      trade_stream_not_verified_from_og_refs: candleBackfillSnapshot.data?.trade_stream_not_verified_from_og_refs || TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
      budget_exhausted: !!candleBackfillSnapshot.data?.budget_exhausted,
      unsupported_reason: candleBackfillSnapshot.data?.unsupported_reason || null,
      candles_written: asNumber(candleBackfillSnapshot.data?.candles_written) || 0,
      cursor: candleBackfillState?.cursor || '',
      last_error: candleBackfillSnapshot.data?.last_error || candleBackfillState?.error || null,
      latest_1d_candle_count: chartCandleCount1d,
      plan: CANDLE_BACKFILL_PLAN,
      no_fake_candles: true,
    },
  };
}

function normalizeAlcorChartCandles(data) {
  const candles = [];
  function add(time, open, high, low, close, volume) {
    const ts = asNumber(time);
    const o = asNumber(open);
    const h = asNumber(high);
    const l = asNumber(low);
    const c = asNumber(close);
    const v = asNumber(volume);
    if (ts == null || o == null || h == null || l == null || c == null || v == null) return;
    const millis = ts > 1000000000000 ? ts : ts * 1000;
    const bucket = new Date(millis).toISOString();
    candles.push({
      bucket_time: bucket,
      open: safeDecimal(o),
      high: safeDecimal(h),
      low: safeDecimal(l),
      close: safeDecimal(c),
      volume: safeDecimal(v),
    });
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      if (Array.isArray(item)) {
        add(item[0], item[1], item[2], item[3], item[4], item[5]);
      } else if (item && typeof item === 'object') {
        add(
          item.time ?? item.t ?? item.timestamp,
          item.open ?? item.o,
          item.high ?? item.h,
          item.low ?? item.l,
          item.close ?? item.c,
          item.volume ?? item.v,
        );
      }
    }
  } else if (data && Array.isArray(data.bars)) {
    for (const bar of data.bars) add(bar.time ?? bar.t, bar.open ?? bar.o, bar.high ?? bar.h, bar.low ?? bar.l, bar.close ?? bar.c, bar.volume ?? bar.v);
  } else if (data && Array.isArray(data.t)) {
    for (let i = 0; i < data.t.length; i += 1) {
      add(data.t[i], data.o?.[i], data.h?.[i], data.l?.[i], data.c?.[i], data.v?.[i]);
    }
  }
  return candles.sort((a, b) => Date.parse(a.bucket_time) - Date.parse(b.bucket_time));
}

function parseTradeRawJson(row) {
  if (!row || typeof row !== 'object' || !row.raw_json) return {};
  if (Object.prototype.hasOwnProperty.call(row, TRADE_RAW_JSON_CACHE)) return row[TRADE_RAW_JSON_CACHE];
  let parsed = {};
  try {
    const value = JSON.parse(row.raw_json);
    parsed = value && typeof value === 'object' ? value : {};
  } catch {
    parsed = {};
  }
  Object.defineProperty(row, TRADE_RAW_JSON_CACHE, {
    value: parsed,
    configurable: true,
  });
  return parsed;
}

function tradeTimestampMillis(row) {
  const raw = parseTradeRawJson(row);
  const value = row?.traded_at ?? raw.traded_at ?? raw.created_at ?? raw.updated_at_time ?? raw.timestamp ?? raw.time;
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric > 1000000000000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priceFromIndexedTradeRow(row, source = '') {
  const raw = parseTradeRawJson(row);
  const unitPrice = raw.unit_price ?? row?.unit_price;
  const sourceKey = moonboysCandleSource(source || row?.source);
  if (sourceKey === 'alcor' && unitPrice != null && unitPrice !== '') {
    const n = asNumber(unitPrice);
    if (n != null) return n / 100000000;
  }
  const price = row?.price ?? raw.price ?? raw.execution_price ?? raw.rate;
  const n = asNumber(price);
  if (n == null) return null;
  return n;
}

function volumeFromIndexedTradeRow(row) {
  const raw = parseTradeRawJson(row);
  const value = row?.volume ?? raw.volume ?? raw.tokenWaxVolume ?? raw.volumeB ?? raw.volumeA ?? row?.amount ?? raw.amount;
  const n = asNumber(value);
  return n == null ? null : n;
}

function utcDayBucketIso(millis) {
  if (!Number.isFinite(millis)) return null;
  const date = new Date(millis);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function buildDailyCandlesFromTradeRows(rows, options = {}) {
  const source = options.source || '';
  const trades = (rows || [])
    .map((row) => {
      const millis = tradeTimestampMillis(row);
      const price = priceFromIndexedTradeRow(row, source);
      const volume = volumeFromIndexedTradeRow(row);
      return { millis, price, volume: volume ?? 0 };
    })
    .filter((trade) => Number.isFinite(trade.millis) && trade.price != null)
    .sort((a, b) => a.millis - b.millis);
  const days = new Map();
  for (const trade of trades) {
    const bucket = utcDayBucketIso(trade.millis);
    if (!bucket) continue;
    if (!days.has(bucket)) {
      days.set(bucket, {
        bucket_time: bucket,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: 0,
        trade_count: 0,
      });
    }
    const candle = days.get(bucket);
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;
    candle.volume += trade.volume;
    candle.trade_count += 1;
  }
  return [...days.values()].map((candle) => ({
    bucket_time: candle.bucket_time,
    open: safeDecimal(candle.open),
    high: safeDecimal(candle.high),
    low: safeDecimal(candle.low),
    close: safeDecimal(candle.close),
    volume: safeDecimal(candle.volume),
    trade_count: candle.trade_count,
  })).filter((candle) =>
    candle.open != null && candle.high != null && candle.low != null && candle.close != null && candle.volume != null);
}

async function loadIndexedTradeRowsForPair(db, source, pairId) {
  const moonboysSource = moonboysCandleSource(source);
  const tradeSources = candleTradeSourceNamesFor(moonboysSource);
  const startIso = candleBackfillLookbackCutoffIso();
  const sourcePlaceholders = tradeSources.map(() => '?').join(',');
  const rows = await db.prepare(
    `SELECT source, trade_id, pair_id, contract, symbol, side, price, amount, volume, tx_id, traded_at, raw_json
     FROM waxonedge_trades
     WHERE pair_id = ?
       AND source IN (${sourcePlaceholders})
       AND traded_at >= ?
     ORDER BY traded_at DESC
     LIMIT 5000`
  ).bind(String(pairId), ...tradeSources, startIso).all().catch(() => ({ results: [] }));
  return rows.results || [];
}

async function indexedTradeRowsExistForSource(db, source) {
  const tradeSources = candleTradeSourceNamesFor(source);
  if (!tradeSources.length) return false;
  const placeholders = tradeSources.map(() => '?').join(',');
  const startIso = candleBackfillLookbackCutoffIso();
  const row = await db.prepare(
    `SELECT 1
     FROM waxonedge_trades
     WHERE source IN (${placeholders})
       AND traded_at >= ?
     LIMIT 1`
  ).bind(...tradeSources, startIso).first().catch(() => null);
  return !!row;
}

async function indexedTradePairIdExampleForSource(db, source, candidatePairId) {
  const tradeSources = candleTradeSourceNamesFor(source);
  if (!tradeSources.length) return null;
  const placeholders = tradeSources.map(() => '?').join(',');
  const startIso = candleBackfillLookbackCutoffIso();
  const row = await db.prepare(
    `SELECT source, pair_id
     FROM waxonedge_trades
     WHERE source IN (${placeholders})
       AND traded_at >= ?
       AND pair_id IS NOT NULL
       AND pair_id != ?
     ORDER BY traded_at DESC
     LIMIT 1`
  ).bind(...tradeSources, startIso, String(candidatePairId || '')).first().catch(() => null);
  if (!row) return null;
  return {
    source: moonboysCandleSource(row.source),
    candidate_pair_id: safeString(candidatePairId),
    observed_trade_pair_id: safeString(row.pair_id),
    reason: 'recent trade rows exist for source but not for candidate pair_id',
  };
}

async function buildInternalDailyCandlesForPair(db, pair) {
  const source = moonboysCandleSource(pair.source);
  const pairId = String(pair.pair_id || pair.pairId || '');
  if (!source || !pairId) return { ok: false, reason: 'missing_pair_identity', candles_written: 0, candle_count: 0 };
  const rows = await loadIndexedTradeRowsForPair(db, source, pairId);
  if (!rows.length) {
    const hasSourceRows = await indexedTradeRowsExistForSource(db, source);
    const mismatch = hasSourceRows && source !== 'alcor';
    return {
      ok: true,
      reason: mismatch
        ? 'pair_id_mismatch'
        : (source === 'alcor' ? 'trade_rows_not_indexed' : 'swap_rows_not_indexed'),
      mismatch_example: mismatch ? await indexedTradePairIdExampleForSource(db, source, pairId) : null,
      candles_written: 0,
      candle_count: 0,
    };
  }
  const candles = buildDailyCandlesFromTradeRows(rows, { source });
  if (!candles.length) {
    return {
      ok: true,
      reason: 'trade_rows_not_usable_for_ohlcv',
      candles_written: 0,
      candle_count: 0,
    };
  }
  const candlesWritten = await writeChartCandles(db, source, pairId, '1D', candles);
  return {
    ok: true,
    reason: 'candles_built_from_trade_rows',
    candles_written: candlesWritten,
    candle_count: candles.length,
  };
}

async function writeChartCandles(db, source, pairId, interval, candles) {
  if (!candles.length) return 0;
  const updatedAt = nowIso();
  const statements = candles.map((candle) => db.prepare(
    `INSERT INTO waxonedge_chart_candles
     (source, pair_id, interval, bucket_time, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, pair_id, interval, bucket_time) DO UPDATE SET
       open = excluded.open,
       high = excluded.high,
       low = excluded.low,
       close = excluded.close,
       volume = excluded.volume,
       updated_at = excluded.updated_at`
  ).bind(
    source,
    pairId,
    interval,
    candle.bucket_time,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
    updatedAt,
  ));
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
  return candles.length;
}

async function planWaxOnEdgeCandleBackfill(env) {
  const startedAt = nowIso();
  const candleTradeSources = indexedCandleTradeSources();
  const candlePairSourceNames = [...new Set(candleTradeSources.flatMap(candleTradeSourceNamesFor))];
  const candleTradeSourcePlaceholders = candlePairSourceNames.map(() => '?').join(',');
  const allTradeSourceNames = candlePairSourceNames;
  const candidatePairCount = await countScalar(env.DB,
    `SELECT COUNT(*) AS count
     FROM waxonedge_pairs
     WHERE source IN (${candleTradeSourcePlaceholders})
       AND pair_id IS NOT NULL
       AND pair_id != ''`,
    candlePairSourceNames);
  const candidateCountRows = await env.DB.prepare(
    `SELECT source, COUNT(*) AS count
     FROM waxonedge_pairs
     WHERE source IN (${candleTradeSourcePlaceholders})
       AND pair_id IS NOT NULL
       AND pair_id != ''
     GROUP BY source`
  ).bind(...candlePairSourceNames).all().catch(() => ({ results: [] }));
  const candleCandidateCountBySource = countBySource(candidateCountRows.results || []);
  const allTradeSourcePlaceholders = allTradeSourceNames.map(() => '?').join(',');
  const tradeCountRows = allTradeSourceNames.length ? await env.DB.prepare(
    `SELECT source, COUNT(*) AS count
     FROM waxonedge_trades
     WHERE source IN (${allTradeSourcePlaceholders})
     GROUP BY source`
  ).bind(...allTradeSourceNames).all().catch(() => ({ results: [] })) : { results: [] };
  const tradeRowsIndexedBySource = countBySource(tradeCountRows.results || []);
  const sourceAliasNormalizedCount = (tradeCountRows.results || []).reduce((count, row) => {
    const rawSource = String(row.source || '').trim().toLowerCase();
    return count + (rawSource && moonboysCandleSource(rawSource) !== rawSource ? (asNumber(row.count) || 0) : 0);
  }, 0);
  const state = await readSourceIndexState(env.DB, CANDLE_BACKFILL_SOURCE);
  const previousSnapshot = await readSnapshot(env.DB, CANDLE_BACKFILL_SOURCE);
  const previousData = previousSnapshot.data || {};
  const cursorOffset = clampInteger(state?.cursor || 0, 0, 0, Number.MAX_SAFE_INTEGER);
  const tradeLookbackCutoffIso = candleBackfillLookbackCutoffIso();
  const indexedAlcorTradeRow = await env.DB.prepare(
    `SELECT 1
     FROM waxonedge_trades
     WHERE source IN (${candleTradeSourcePlaceholders})
       AND traded_at >= ?
     LIMIT 1`
  ).bind(...candlePairSourceNames, tradeLookbackCutoffIso).first().catch(() => null);
  if (!indexedAlcorTradeRow) {
    const existingCandleCount = await countScalar(env.DB,
      `SELECT COUNT(*) AS count FROM waxonedge_chart_candles WHERE interval = '1D'`);
    const error = 'waiting for indexed trade rows';
    await upsertSourceIndexState(env.DB, CANDLE_BACKFILL_SOURCE, {
      sync_cycle_id: state?.sync_cycle_id || `candle-${new Date().toISOString().slice(0, 10)}`,
      cursor: state?.cursor || '',
      page_count: asNumber(state?.page_count) || cursorOffset,
      row_count: candidatePairCount,
      complete: 0,
      truncated: 0,
      status: 'skipped',
      error,
      started_at: startedAt,
    });
    const snapshot = {
      source: CANDLE_BACKFILL_SOURCE,
      status: 'skipped',
      candidate_pair_count: candidatePairCount,
      processed_pair_count: asNumber(previousData.processed_pair_count) || 0,
      attempted_pair_count: asNumber(previousData.attempted_pair_count) || 0,
      failed_pair_count: asNumber(previousData.failed_pair_count) || 0,
      unsupported_pair_count: asNumber(previousData.unsupported_pair_count) || 0,
      unsupported_pair_count_total: asNumber(previousData.unsupported_pair_count_total) || 0,
      trade_rows_not_indexed_count: asNumber(previousData.trade_rows_not_indexed_count) || 0,
      trade_rows_not_usable_for_ohlcv_count: asNumber(previousData.trade_rows_not_usable_for_ohlcv_count) || 0,
      swap_rows_not_indexed_count: asNumber(previousData.swap_rows_not_indexed_count) || 0,
      pair_id_mismatch_count: asNumber(previousData.pair_id_mismatch_count) || 0,
      candles_built_from_trade_rows: asNumber(previousData.candles_built_from_trade_rows) || 0,
      external_chart_endpoint_unsupported: asNumber(previousData.external_chart_endpoint_unsupported) || 0,
      candle_candidate_count_by_source: candleCandidateCountBySource,
      trade_rows_indexed_by_source: tradeRowsIndexedBySource,
      candles_written_by_source: previousData.candles_written_by_source || {},
      trade_rows_not_indexed_by_source: previousData.trade_rows_not_indexed_by_source || {},
      pair_id_mismatch_count_by_source: previousData.pair_id_mismatch_count_by_source || {},
      pair_id_mismatch_examples_by_source: previousData.pair_id_mismatch_examples_by_source || {},
      source_alias_normalized_count: sourceAliasNormalizedCount,
      trade_stream_not_verified_from_og_refs: TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
      budget_exhausted: false,
      unsupported_reason: null,
      candles_written: asNumber(previousData.candles_written) || 0,
      latest_1d_candle_count: existingCandleCount,
      cursor: state?.cursor || '',
      last_error: error,
      no_fake_candles: true,
      plan: CANDLE_BACKFILL_PLAN,
    };
    await writeSnapshot(env.DB, CANDLE_BACKFILL_SOURCE, snapshot, nowIso());
    await recordSyncRun(env.DB, CANDLE_BACKFILL_SOURCE, 'skipped', startedAt, error);
    return { ok: true, ...snapshot, indexed_1d_candle_count: existingCandleCount };
  }
  const candidates = await env.DB.prepare(
    `SELECT source, pair_id
     FROM waxonedge_pairs
     WHERE source IN (${candleTradeSourcePlaceholders})
       AND pair_id IS NOT NULL
       AND pair_id != ''
     ORDER BY source, CAST(pair_id AS NUMERIC), pair_id
     LIMIT ? OFFSET ?`
  ).bind(...candlePairSourceNames, candleBackfillPairLimit(env), cursorOffset).all().catch(() => ({ results: [] }));
  const candidateRows = candidates.results || [];
  let attemptedPairCount = 0;
  let processedPairCount = 0;
  let failedPairCount = 0;
  let unsupportedPairCount = 0;
  let externalUnsupportedPairCount = 0;
  let tradeRowsNotIndexedCount = 0;
  let tradeRowsNotUsableForOhlcvCount = 0;
  let swapRowsNotIndexedCount = 0;
  let pairIdMismatchCount = 0;
  let candlesBuiltFromTradeRowsCount = 0;
  let candlesWritten = 0;
  const candlesWrittenBySource = {};
  const tradeRowsNotIndexedBySource = {};
  const pairIdMismatchCountBySource = {};
  const pairIdMismatchExamplesBySource = {};
  let lastError = null;
  let unsupportedReason = null;
  let budgetExhausted = false;
  const requestBudget = candleSubrequestBudget(env);
  for (const pair of candidateRows) {
    if (attemptedPairCount >= requestBudget) {
      budgetExhausted = true;
      lastError = `Budget exhausted before next candle pair; attempted ${attemptedPairCount} of ${candidateRows.length}`;
      break;
    }
    attemptedPairCount += 1;
    try {
      const result = await buildInternalDailyCandlesForPair(env.DB, pair);
      candlesWritten += result.candles_written || 0;
      if (result.reason === 'candles_built_from_trade_rows') {
        candlesBuiltFromTradeRowsCount += 1;
        processedPairCount += 1;
        incrementSourceCounter(candlesWrittenBySource, pair.source, result.candles_written || 0);
      } else if (result.reason === 'trade_rows_not_indexed') {
        tradeRowsNotIndexedCount += 1;
        incrementSourceCounter(tradeRowsNotIndexedBySource, pair.source);
        lastError = 'waiting for indexed trade rows for remaining candidate pairs';
      } else if (result.reason === 'swap_rows_not_indexed') {
        swapRowsNotIndexedCount += 1;
        incrementSourceCounter(tradeRowsNotIndexedBySource, pair.source);
        lastError = 'waiting for indexed trade rows for remaining candidate pairs';
      } else if (result.reason === 'pair_id_mismatch') {
        pairIdMismatchCount += 1;
        incrementSourceCounter(pairIdMismatchCountBySource, pair.source);
        addSourceExample(pairIdMismatchExamplesBySource, pair.source, result.mismatch_example);
        lastError = 'waiting for indexed trade rows for remaining candidate pairs';
      } else if (result.reason === 'trade_rows_not_usable_for_ohlcv') {
        unsupportedPairCount += 1;
        tradeRowsNotUsableForOhlcvCount += 1;
        unsupportedReason = `trade_rows_not_usable_for_ohlcv: ${pair.source} pair ${pair.pair_id}`;
        lastError = unsupportedReason;
      }
    } catch (error) {
      if (isSubrequestBudgetError(error)) {
        budgetExhausted = true;
        lastError = error?.message || String(error);
        break;
      }
      if (isNotFoundError(error)) {
        unsupportedPairCount += 1;
        externalUnsupportedPairCount += 1;
        unsupportedReason = `no_chart_endpoint: alcor pair ${pair.pair_id} returned 404`;
        lastError = unsupportedReason;
        continue;
      }
      failedPairCount += 1;
      lastError = error?.message || String(error);
    }
  }
  const nextCursor = Math.min(candidatePairCount, cursorOffset + attemptedPairCount);
  const totalAttemptedPairCount = (asNumber(previousData.attempted_pair_count) || 0) + attemptedPairCount;
  const totalProcessedPairCount = (asNumber(previousData.processed_pair_count) || 0) + processedPairCount;
  const totalFailedPairCount = (asNumber(previousData.failed_pair_count) || 0) + failedPairCount;
  const totalUnsupportedPairCount = (asNumber(previousData.unsupported_pair_count) || 0) + unsupportedPairCount;
  const totalExternalUnsupportedPairCount = (asNumber(previousData.external_chart_endpoint_unsupported) || 0) + externalUnsupportedPairCount;
  const totalTradeRowsNotIndexedCount = (asNumber(previousData.trade_rows_not_indexed_count) || 0) + tradeRowsNotIndexedCount;
  const totalTradeRowsNotUsableForOhlcvCount = (asNumber(previousData.trade_rows_not_usable_for_ohlcv_count) || 0) + tradeRowsNotUsableForOhlcvCount;
  const totalSwapRowsNotIndexedCount = (asNumber(previousData.swap_rows_not_indexed_count) || 0) + swapRowsNotIndexedCount;
  const totalPairIdMismatchCount = (asNumber(previousData.pair_id_mismatch_count) || 0) + pairIdMismatchCount;
  const totalCandlesBuiltFromTradeRowsCount = (asNumber(previousData.candles_built_from_trade_rows) || 0) + candlesBuiltFromTradeRowsCount;
  const totalCandlesWritten = (asNumber(previousData.candles_written) || 0) + candlesWritten;
  const totalCandlesWrittenBySource = mergeSourceCounters(previousData.candles_written_by_source, candlesWrittenBySource);
  const totalTradeRowsNotIndexedBySource = mergeSourceCounters(previousData.trade_rows_not_indexed_by_source, tradeRowsNotIndexedBySource);
  const totalPairIdMismatchCountBySource = mergeSourceCounters(previousData.pair_id_mismatch_count_by_source, pairIdMismatchCountBySource);
  const totalPairIdMismatchExamplesBySource = mergeSourceExamples(previousData.pair_id_mismatch_examples_by_source, pairIdMismatchExamplesBySource);
  const complete = candidatePairCount > 0 && nextCursor >= candidatePairCount;
  const existingCandleCount = await countScalar(env.DB,
    `SELECT COUNT(*) AS count FROM waxonedge_chart_candles WHERE interval = '1D'`);
  const status = budgetExhausted
    ? 'budget_limited'
    : (complete && failedPairCount === 0
    ? 'success'
    : (attemptedPairCount > 0 ? 'partial' : (lastError ? 'failed' : 'planned')));
  const diagnosticLastError = candlesWritten > 0 && (tradeRowsNotIndexedCount > 0 || swapRowsNotIndexedCount > 0)
    ? 'waiting for indexed trade rows for remaining candidate pairs'
    : lastError;
  const error = diagnosticLastError || (status === 'planned' ? CANDLE_BACKFILL_PLAN : null);
  await upsertSourceIndexState(env.DB, CANDLE_BACKFILL_SOURCE, {
    sync_cycle_id: `candle-${new Date().toISOString().slice(0, 10)}`,
    cursor: complete ? '' : String(nextCursor),
    page_count: nextCursor,
    row_count: candidatePairCount,
    complete: complete ? 1 : 0,
    truncated: 0,
    status,
    error,
    started_at: startedAt,
  });
  await writeSnapshot(env.DB, CANDLE_BACKFILL_SOURCE, {
    source: CANDLE_BACKFILL_SOURCE,
    status,
    candidate_pair_count: candidatePairCount,
    processed_pair_count: totalProcessedPairCount,
    attempted_pair_count: totalAttemptedPairCount,
    failed_pair_count: totalFailedPairCount,
    unsupported_pair_count: totalUnsupportedPairCount,
    unsupported_pair_count_total: totalUnsupportedPairCount,
    trade_rows_not_indexed_count: totalTradeRowsNotIndexedCount,
    trade_rows_not_usable_for_ohlcv_count: totalTradeRowsNotUsableForOhlcvCount,
    swap_rows_not_indexed_count: totalSwapRowsNotIndexedCount,
    pair_id_mismatch_count: totalPairIdMismatchCount,
    candles_built_from_trade_rows: totalCandlesBuiltFromTradeRowsCount,
    external_chart_endpoint_unsupported: totalExternalUnsupportedPairCount,
    candle_candidate_count_by_source: candleCandidateCountBySource,
    trade_rows_indexed_by_source: tradeRowsIndexedBySource,
    candles_written_by_source: totalCandlesWrittenBySource,
    trade_rows_not_indexed_by_source: totalTradeRowsNotIndexedBySource,
    pair_id_mismatch_count_by_source: totalPairIdMismatchCountBySource,
    pair_id_mismatch_examples_by_source: totalPairIdMismatchExamplesBySource,
    source_alias_normalized_count: sourceAliasNormalizedCount,
    trade_stream_not_verified_from_og_refs: TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
    budget_exhausted: budgetExhausted,
    unsupported_reason: unsupportedReason,
    candles_written: totalCandlesWritten,
    latest_1d_candle_count: existingCandleCount,
    cursor: complete ? '' : String(nextCursor),
    last_error: diagnosticLastError,
    no_fake_candles: true,
    plan: CANDLE_BACKFILL_PLAN,
  }, nowIso());
  await recordSyncRun(env.DB, CANDLE_BACKFILL_SOURCE, status, startedAt, error);
  return {
    ok: status !== 'failed',
    status,
    candidate_pair_count: candidatePairCount,
    processed_pair_count: totalProcessedPairCount,
    attempted_pair_count: totalAttemptedPairCount,
    failed_pair_count: totalFailedPairCount,
    unsupported_pair_count: totalUnsupportedPairCount,
    unsupported_pair_count_total: totalUnsupportedPairCount,
    trade_rows_not_indexed_count: totalTradeRowsNotIndexedCount,
    trade_rows_not_usable_for_ohlcv_count: totalTradeRowsNotUsableForOhlcvCount,
    swap_rows_not_indexed_count: totalSwapRowsNotIndexedCount,
    pair_id_mismatch_count: totalPairIdMismatchCount,
    candles_built_from_trade_rows: totalCandlesBuiltFromTradeRowsCount,
    external_chart_endpoint_unsupported: totalExternalUnsupportedPairCount,
    candle_candidate_count_by_source: candleCandidateCountBySource,
    trade_rows_indexed_by_source: tradeRowsIndexedBySource,
    candles_written_by_source: totalCandlesWrittenBySource,
    trade_rows_not_indexed_by_source: totalTradeRowsNotIndexedBySource,
    pair_id_mismatch_count_by_source: totalPairIdMismatchCountBySource,
    pair_id_mismatch_examples_by_source: totalPairIdMismatchExamplesBySource,
    source_alias_normalized_count: sourceAliasNormalizedCount,
    trade_stream_not_verified_from_og_refs: TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS,
    budget_exhausted: budgetExhausted,
    unsupported_reason: unsupportedReason,
    candles_written: totalCandlesWritten,
    indexed_1d_candle_count: existingCandleCount,
    cursor: complete ? '' : String(nextCursor),
    last_error: diagnosticLastError,
    no_fake_candles: true,
    plan: CANDLE_BACKFILL_PLAN,
  };
}

function metricCapabilitiesFromTokens(tokens = []) {
  const has = (predicate) => tokens.some((token) => predicate(token));
  const marketCapLive = has((token) =>
    asNumber(token?.circulating_supply) != null &&
    asNumber(token?.market_cap_wax ?? token?.market_cap_usd) != null);
  return {
    change: has((token) => asNumber(token?.change_24h) != null),
    price: has((token) =>
      token?.selected_price_confidence === 'good' &&
      asNumber(token?.selected_price_wax ?? token?.selected_price_usd) != null),
    volume: has((token) => asNumber(token?.volume_24h_wax ?? token?.volume_24h_usd ?? token?.volume_24h) != null),
    liquidity: has((token) => asNumber(token?.liquidity_wax ?? token?.liquidity_usd) != null),
    tvl: has((token) => asNumber(token?.tvl_wax ?? token?.tvl_usd) != null),
    market_cap: marketCapLive,
    mcap: marketCapLive,
    volume_7d: has((token) => asNumber(token?.volume_7d) != null),
    volume_30d: has((token) => asNumber(token?.volume_30d) != null),
    holders: has((token) => asNumber(token?.holder_count) != null),
  };
}

async function handleBootstrap(env, corsHeaders) {
  const coreSnapshotReads = CORE_DEX_ADAPTERS.flatMap((adapter) => [
    readSnapshot(env.DB, `${adapter.source}_abi`),
    readSnapshot(env.DB, `${adapter.source}_${adapter.table}`),
  ]);
  const [tokens, pairs, syncStatus, sourceStates, alcorTokens, alcorPairs, alcorTickers, alcorGlobal, ...coreSnapshots] = await Promise.all([
    listTopTokens(env.DB),
    listTopPairs(env.DB),
    getLatestSync(env.DB),
    getSourceIndexStates(env.DB),
    readSnapshot(env.DB, 'alcor_tokens'),
    readSnapshot(env.DB, 'alcor_pairs'),
    readSnapshot(env.DB, 'alcor_tickers'),
    readSnapshot(env.DB, 'alcor_global'),
    ...coreSnapshotReads,
  ]);
  const proofTokens = await addBootstrapSelectedPriceProof(env.DB, tokens, pairs);
  const coreSources = {};
  const rawCore = {};
  CORE_DEX_ADAPTERS.forEach((adapter, index) => {
    const abiSnapshot = coreSnapshots[index * 2] || {};
    const tableSnapshot = coreSnapshots[index * 2 + 1] || {};
    const key = adapter.source.replaceAll('.', '_');
    coreSources[`${key}_abi`] = {
      updated_at: abiSnapshot.fetched_at,
      indexed: !!abiSnapshot.data,
      detected_tables: abiSnapshot.data?.detected_tables || [],
      expected_table: adapter.table,
      contract: adapter.contract,
    };
    coreSources[`${key}_${adapter.table}`] = {
      updated_at: tableSnapshot.fetched_at,
      indexed: !!tableSnapshot.data,
      contract: adapter.contract,
      table: adapter.table,
      row_count: tableSnapshot.data?.row_count || (Array.isArray(tableSnapshot.data?.rows) ? tableSnapshot.data.rows.length : 0),
      page_count: tableSnapshot.data?.page_count || 0,
      complete: !!tableSnapshot.data && (tableSnapshot.data?.truncated ? false : !tableSnapshot.data?.cursor),
      compact: tableSnapshot.data?.compact === true,
    };
    rawCore[`${key}_detected_tables`] = abiSnapshot.data?.detected_tables || [];
  });
  const updatedAt = [alcorTokens.fetched_at, alcorPairs.fetched_at, alcorTickers.fetched_at]
    .concat(CORE_DEX_ADAPTERS.flatMap((adapter, index) => [
      coreSnapshots[index * 2]?.fetched_at,
      coreSnapshots[index * 2 + 1]?.fetched_at,
    ]))
    .filter(Boolean)
    .sort()
    .pop() || null;
  const aggregateCount = proofTokens.filter((token) => token.liquidity_wax != null || token.selected_pair_source != null).length;
  const metricCapabilities = metricCapabilitiesFromTokens(proofTokens);
  const waxToken = proofTokens.find((token) => normalizeContract(token.contract) === 'eosio.token' && normalizeSymbol(token.symbol) === 'WAX');
  const waxGlobalPrice = asNumber(alcorGlobal.data?.usd_price ?? alcorGlobal.data?.wax_usd ?? alcorGlobal.data?.price);
  const waxPriceUsd = asNumber(waxToken?.price_usd) ?? waxGlobalPrice;
  const warnings = [];
  if (!updatedAt) warnings.push(REQUIRES_INDEXED_BACKEND);
  warnings.push('Holder distribution requires indexed balance snapshots or a verified holder source.');
  warnings.push('7d/30d volume, market cap, FDV, and chart candles stay unavailable until indexed from source data.');
  return ok({
    summary: {
      token_count: proofTokens.length,
      pair_count: pairs.length,
      token_aggregate_count: aggregateCount,
      wax_price_usd: waxPriceUsd == null ? null : safeDecimal(waxPriceUsd),
      wax_price_source: waxPriceUsd == null ? null : (asNumber(waxToken?.price_usd) != null ? 'indexed eosio.token/WAX token price' : 'Alcor analytics/global'),
      metric_capabilities: metricCapabilities,
    },
    metric_capabilities: metricCapabilities,
    tokens: proofTokens,
    pairs,
    sync_status: syncStatus,
    source_index_state: sourceStates,
    sources: {
      alcor_tokens: { updated_at: alcorTokens.fetched_at, indexed: !!alcorTokens.data },
      alcor_pairs: { updated_at: alcorPairs.fetched_at, indexed: !!alcorPairs.data },
      alcor_tickers: { updated_at: alcorTickers.fetched_at, indexed: !!alcorTickers.data },
      alcor_global: { updated_at: alcorGlobal.fetched_at, indexed: !!alcorGlobal.data },
      ...coreSources,
    },
    raw: {
      alcor_tokens: alcorTokens.data || [],
      alcor_pairs: alcorPairs.data || [],
      alcor_tickers: alcorTickers.data || [],
      alcor_global: alcorGlobal.data || null,
      nefty_detected_tables: rawCore.swap_nefty_detected_tables || [],
      core_detected_tables: rawCore,
    },
    unavailable_metrics: {
      holders: REQUIRES_INDEXED_BACKEND,
      volume_7d: SOURCE_NOT_INDEXED,
      volume_30d: SOURCE_NOT_INDEXED,
      market_cap: UNAVAILABLE,
      fdv: UNAVAILABLE,
      chart_candles: SOURCE_NOT_INDEXED,
    },
  }, warnings, updatedAt, corsHeaders);
}

export async function handleWaxOnEdgeRoute(request, env, corsHeaders = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method !== 'GET') {
    return unavailable('Method not allowed', 405, corsHeaders);
  }
  if (!env.DB) return unavailable('DB binding is not configured', 503, corsHeaders);

  try {
    if (path === `${WAXONEDGE_API_PREFIX}/bootstrap`) return handleBootstrap(env, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/summary`) {
      const [tokens, pairs, syncStatus, sourceStates] = await Promise.all([listTopTokens(env.DB), listTopPairs(env.DB), getLatestSync(env.DB), getSourceIndexStates(env.DB)]);
      return ok({ token_count: tokens.length, pair_count: pairs.length, latest_sync: syncStatus.slice(0, 10), source_index_state: sourceStates }, [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/tokens/top`) {
      const [tokens, pairs] = await Promise.all([listTopTokens(env.DB), listTopPairs(env.DB)]);
      return ok(await addBootstrapSelectedPriceProof(env.DB, tokens, pairs), [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/pairs/top`) return ok(await listTopPairs(env.DB), [], null, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/candles`) {
      const chart = await listChartCandlesBySource(env.DB, Object.fromEntries(url.searchParams.entries()));
      return ok(chart, chart.unavailable ? [chart.unavailable] : [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/sync-status`) {
      const [latest_sync, source_index_state] = await Promise.all([getLatestSync(env.DB), getSourceIndexStates(env.DB)]);
      return ok({ latest_sync, source_index_state }, [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/indexer-health`) {
      return ok(await getIndexerHealth(env.DB, env), [], null, corsHeaders);
    }
    if (path === WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT) {
      return handleLiveSnapshot(env, url.searchParams, corsHeaders);
    }
    if (path === WAXONEDGE_LIVE_STREAM_ENDPOINT) {
      return handleLiveStream(corsHeaders, env);
    }

    const tokenMatch = path.match(/^\/api\/waxonedge\/token\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (tokenMatch) {
      const contract = normalizeContract(decodeURIComponent(tokenMatch[1]));
      const symbol = normalizeSymbol(decodeURIComponent(tokenMatch[2]));
      const child = tokenMatch[3] || '';
      if (child === 'pairs') {
        return ok(await listTokenPairs(env.DB, contract, symbol, {
          cursor: url.searchParams.get('cursor'),
          limit: url.searchParams.get('limit'),
        }), [], null, corsHeaders);
      }
      if (child === 'chart') {
        const chart = await listBestChartCandles(env.DB, contract, symbol);
        return ok(chart, chart.unavailable ? [SOURCE_NOT_INDEXED] : [], null, corsHeaders);
      }
      if (child === 'debug') {
        const debug = await getTokenDebug(env.DB, contract, symbol);
        if (!debug.token) return unavailable('Token not indexed yet', 404, corsHeaders);
        return ok(debug, ['Debug diagnostics are derived from indexed rows and sync state only.'], debug.token.updated_at, corsHeaders);
      }
      if (child === 'holders') return ok([], [REQUIRES_INDEXED_BACKEND], null, corsHeaders);
      if (child === 'trades') return ok([], [SOURCE_NOT_INDEXED], null, corsHeaders);
      if (child) return unavailable('WaxOnEdge endpoint not found', 404, corsHeaders);
      const detail = await getToken(env.DB, contract, symbol);
      if (!detail.token) return unavailable('Token not indexed yet', 404, corsHeaders);
      return ok(detail, ['Missing metrics are honest unavailable states, not inferred data.'], detail.token.updated_at, corsHeaders);
    }

    return unavailable('WaxOnEdge endpoint not found', 404, corsHeaders);
  } catch (error) {
    return unavailable(error?.message || String(error), 503, corsHeaders);
  }
}

export const __waxonedgeTestHooks = {
  deriveTokenPairMetrics,
  tokenMetricProof,
  selectedPriceProofFields,
  selectedPriceConfidence,
  pairContributionProof,
  aggregatePairContributionTotals,
  ogPairReserveValuation,
  buildOgWaxRouteGraph,
  selectOgWaxRoutePrice,
  metricCapabilitiesFromTokens,
  collectTokenPriceKeysForPairs,
  diagnoseTokenAggregate,
  parseAsset,
  decimalAmountFromValue,
  getTokenSideInfo,
  liquidityFromSides,
  liquidityWaxFromIndexedPair,
  liquidityUsdFromWax,
  isReasonablePairTvlUsd,
  buildDailyCandlesFromTradeRows,
  normalizeAlcorMarketTradeRow,
  priceFromIndexedTradeRow,
  tradeTimestampMillis,
  volumeFromIndexedTradeRow,
  normalizeCandleInterval,
  moonboysCandleSource,
  referenceCandleSource,
  candleTradeSourceNamesFor,
  indexedCandleTradeSources,
  mergeSourceExamples,
  candleUrlExample,
  candleBackfillPairLimit,
  tradeIndexPairLimit,
  tradeRowsPerMarketLimit,
  tradeStreamPagesPerRun,
  hyperionSkipWindowState,
  sourceStateStale,
  tradeFetchDiagnostic,
  isUpstreamServerErrorStatus,
  isTemporaryTradeFailureType,
  hyperionApiBase,
  hyperionConfigured,
  hyperionHistoryActionsEndpoint,
  waxonedgeLiveIndexerUrlConfigured,
  isLoopbackLiveIndexerHost,
  waxonedgeLiveIndexerBaseUrl,
  waxonedgeLiveIndexerConfig,
  probeWaxonedgeLiveIndexer,
  cachedProbeWaxonedgeLiveIndexer,
  liveIndexerProbeCacheKey,
  liveIndexerSecretFingerprint,
  resetWaxonedgeLiveIndexerProbeCache,
  getIndexerHealth,
  alcorMarketMatchHistoryUrls,
  alcorMarketMatchStreamUrl,
  fetchAlcorMarketMatchStreamRows,
  fetchAlcorMarketMatchHistoryRows,
  parseAlcorMarketMatchAction,
  defaultAmmSwapActionStreams,
  ammSwapStreamUrl,
  parseAmmSwapAction,
  normalizeAmmSwapTradeRow,
  canonicalSwapAlcorPoolId,
  canonicalSwapAlcorActionPoolId,
  canonicalTacoPairId,
  canonicalTacoActionPairId,
  canonicalDefiboxPairId,
  canonicalDefiboxActionPairId,
  canonicalNeftyPairId,
  canonicalNeftyActionPairId,
  canonicalAmmPairId,
  canonicalAmmActionPairId,
  fetchAmmSwapStreamRows,
  normalizeActionStreamProgressMap,
  normalizeCoreDexPair,
  liveTokenUpdateKey,
  liveCursorFromRow,
  parseLiveCursor,
  normalizeLiveTokenUpdate,
  listLiveTokenUpdates,
  handleLiveSnapshot,
  handleLiveStream,
  sourceCoverageFromKeys,
};

export async function runWaxOnEdgeAggregateBackfill(env) {
  if (!env.DB) return { ok: false, error: 'DB binding is not configured' };
  return aggregateTokenAnalytics(env);
}

export async function runWaxOnEdgeCandleBackfillPlan(env) {
  if (!env.DB) return { ok: false, error: 'DB binding is not configured' };
  return planWaxOnEdgeCandleBackfill(env);
}

export async function runWaxOnEdgeTradeBackfill(env) {
  if (!env.DB) return { ok: false, error: 'DB binding is not configured' };
  const alcorTradeBackfill = await syncAlcorMarketTradeRows(env);
  const ammTradeBackfill = await syncAmmSwapTradeRows(env);
  return {
    ok: alcorTradeBackfill.ok && ammTradeBackfill.ok,
    alcorTradeBackfill,
    ammTradeBackfill,
  };
}

export async function runWaxOnEdgeScheduledSync(env, cron = '') {
  if (!env.DB) return { ok: false, error: 'DB binding is not configured' };
  const freeSafeMode = waxonedgeFreeSafeMode(env);
  if (cron === 'waxonedge-backfill') {
    const aggregates = await aggregateTokenAnalytics(env);
    return { ok: aggregates.ok, backfill: true, free_safe_mode: freeSafeMode, aggregates };
  }
  if (cron === 'waxonedge-candle-backfill') {
    const candleBackfill = await planWaxOnEdgeCandleBackfill(env);
    return { ok: candleBackfill.ok, candle_backfill: true, free_safe_mode: freeSafeMode, candleBackfill };
  }
  if (cron === 'waxonedge-trade-backfill') {
    const tradeBackfill = await runWaxOnEdgeTradeBackfill(env);
    return { ok: tradeBackfill.ok, trade_backfill: true, free_safe_mode: freeSafeMode, tradeBackfill };
  }
  const tasks = [];
  const tick = new Date();
  const minute = tick.getUTCMinutes();
  const hour = tick.getUTCHours();
  const isMinuteCron = cron === '* * * * *';
  const shouldRunFullIndex = !cron || cron === '*/5 * * * *' || (isMinuteCron && minute % 5 === 0);
  if (isMinuteCron && freeSafeMode) {
    const rotationSlot = minute % 5;
    if (rotationSlot === 0) {
      tasks.push(syncAlcorMarketData(env, 'alcor_minute_market_data'));
    } else if (rotationSlot === 1) {
      tasks.push((async () => {
        const syncCycleId = await getActiveSourceCycleId(env.DB);
        const adapter = selectCoreDexAdapterForCron(minute);
        const core = await syncCoreDexAdapters(env, syncCycleId, {
          source: adapter.source,
          maxPages: FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION,
          requestBudget: FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE,
        });
        return { ok: core.ok, syncCycleId, source: adapter.source, core };
      })());
    } else if (rotationSlot === 2) {
      tasks.push(aggregateTokenAnalytics(env));
    } else if (rotationSlot === 3) {
      tasks.push(planWaxOnEdgeCandleBackfill(env));
    } else {
      tasks.push(syncSupplyInputs(env));
    }
  } else if (shouldRunFullIndex) {
    tasks.push((async () => {
      const syncCycleId = await getActiveSourceCycleId(env.DB);
      const [alcor, core, nefty] = await Promise.all([
        syncAlcorMarketData(env, 'alcor_five_minute_market_data', syncCycleId),
        syncCoreDexAdapters(env, syncCycleId),
        syncNeftyAbi(env),
      ]);
      const tradeBackfill = await runWaxOnEdgeTradeBackfill(env);
      const aggregates = await aggregateTokenAnalytics(env);
      const candleBackfill = await planWaxOnEdgeCandleBackfill(env);
      return { ok: alcor.ok && core.ok && nefty.ok && tradeBackfill.ok && aggregates.ok && candleBackfill.ok, syncCycleId, alcor, core, nefty, tradeBackfill, aggregates, candleBackfill };
    })());
  } else if (isMinuteCron) {
    tasks.push((async () => {
      const alcor = await syncAlcorMarketData(env, 'alcor_minute_market_data');
      const aggregates = await aggregateTokenAnalytics(env);
      const candleBackfill = await planWaxOnEdgeCandleBackfill(env);
      return { ok: alcor.ok && aggregates.ok && candleBackfill.ok, alcor, aggregates, candleBackfill };
    })());
  }
  if (!freeSafeMode && (!cron || cron === '*/15 * * * *' || (isMinuteCron && minute % 15 === 0))) tasks.push(syncSupplyInputs(env));
  if (!freeSafeMode && (!cron || cron === '0 */2 * * *' || (isMinuteCron && minute === 0 && hour % 2 === 0))) {
    const startedAt = nowIso();
    tasks.push(recordSyncRun(env.DB, 'holders', 'skipped', startedAt, REQUIRES_INDEXED_BACKEND).then(() => ({
      ok: true,
      skipped: 'holders',
    })));
  }
  if (!tasks.length) return { ok: true, skipped: true };
  const results = await Promise.all(tasks);
  let postSyncAggregate = null;
  if (!cron || isMinuteCron || shouldRunFullIndex) {
    const sourceWorkRan = results.some((result) =>
      result?.source ||
      result?.core ||
      result?.alcor ||
      result?.syncCycleId ||
      result?.alcor?.ok ||
      result?.core?.ok
    );
    const deferForBudget = freeSafeMode || (shouldRunFullIndex && results.some((result) => result?.tradeBackfill || result?.candleBackfill || result?.nefty));
    if (sourceWorkRan) {
      postSyncAggregate = await maybeRefreshAggregateAfterSourceSync(env, {
        deferForBudget,
        reason: deferForBudget ? 'Aggregate refresh deferred after source sync to avoid Worker budget pressure' : AGGREGATE_REFRESH_REASON,
      });
    }
  }
  return {
    ok: results.every((result) => result?.ok) && (!postSyncAggregate || postSyncAggregate.ok),
    results,
    post_sync_aggregate: postSyncAggregate,
    free_safe_mode: freeSafeMode,
  };
}

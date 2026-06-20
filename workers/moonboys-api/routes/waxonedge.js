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
const OG_DIRECT_WAX_PRICE_MIN_WAX_LIQUIDITY = 100;
const MAX_REASONABLE_PAIR_TVL_USD = 100000000;
const MAX_REASONABLE_PAIR_TVL_WAX = 10000000000;
const MAX_BUBBLE_LIQUIDITY_TO_MARKET_CAP_RATIO = 5;
const CANDLE_BACKFILL_SOURCE = 'candle_backfill';
const ALCOR_TRADE_INDEX_SOURCE = 'alcor_trade_rows';
const AMM_TRADE_INDEX_SOURCE = 'amm_trade_rows';
const LIVE_INDEXER_HISTORY_SOURCE = 'live_indexer_history_import';
const WAXCASH_HOLDER_SNAPSHOT_SOURCE = 'waxcash_holder_snapshot';
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
const WAXONEDGE_OG_ENDPOINTS = Object.freeze([
  '/pools',
  '/pool',
  '/poolsv3',
  '/poolv3',
  '/markets',
  '/market',
  '/lastVolumes',
  '/lastPriceChanges',
]);
const WAXONEDGE_OG_SOURCE_REF = Object.freeze({
  alcor: { srcType: 'markets', src: 'alcormarket' },
  alcordexmain: { srcType: 'markets', src: 'alcormarket' },
  'swap.alcor': { srcType: 'poolsv3', src: 'alcorv2' },
  'swap.taco': { srcType: 'pools', src: 'taco' },
  'swap.nefty': { srcType: 'pools', src: 'neftyblocks' },
  'swap.box': { srcType: 'pools', src: 'defibox' },
  'swap.adex': { srcType: 'pools', src: 'adex' },
});
const WAXCASH_TOKEN_REF = Object.freeze({
  contract: 'graffitiking',
  symbol: 'WAXCASH',
  decimals: 8,
  token_key: 'graffitiking::WAXCASH',
});
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

function waxcashSupplyTarget() {
  return { ...WAXCASH_TOKEN_REF };
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
  const proxyEnabled = !!waxonedgeLiveIndexerBaseUrl(env);
  return {
    vps_indexer_url_configured: waxonedgeLiveIndexerUrlConfigured(env),
    shared_secret_configured: Boolean(String(env?.WAXONEDGE_LIVE_SHARED_SECRET || '').trim()),
    secret_header: WAXONEDGE_LIVE_SECRET_HEADER,
    proxy_enabled: proxyEnabled,
    worker_stream_endpoint: proxyEnabled ? WAXONEDGE_LIVE_STREAM_ENDPOINT : null,
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

function hyperionStateEndpoint(env, path) {
  const base = hyperionApiBase(env);
  const cleanPath = String(path || '').replace(/^\/+/, '');
  if (!base || !cleanPath || base.includes('/history/')) return '';
  const root = base.replace(/\/history\/get_actions$/i, '').replace(/\/history$/i, '').replace(/\/+$/, '');
  return `${root}/${cleanPath}`;
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

function ogLastStatsPairIdForSource(source, row = {}) {
  if (source === 'swap.alcor') return safeString(firstPresent(row.id, row.poolId, row.pool_id, row.pair_id, row.pairId));
  if (source === 'swap.nefty') return safeString(firstPresent(row.pairid, row.pair_id, row.pairId, row.id, row.code));
  if (source === 'swap.taco') return safeString(firstPresent(row.pairid, row.pair_id, row.pairId, row.id));
  if (source === 'swap.box') return safeString(firstPresent(row.pairid, row.pair_id, row.pairId, row.id));
  if (source === 'swap.adex') return safeString(firstPresent(row.pairid, row.pool_id, row.poolId, row.id, row.pair_id, row.pairId));
  if (source === 'alcor' || source === 'alcordexmain') return safeString(firstPresent(row.market_id, row.marketId, row.id, row.pair_id, row.pairId));
  return safeString(firstPresent(row.pairid, row.pair_id, row.pairId, row.pool_id, row.poolId, row.market_id, row.marketId, row.id, row.code));
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
    pricingType: 'concentrated_liquidity',
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
    pricingType: 'v2_constant_product',
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
    pricingType: 'v2_constant_product',
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
    pricingType: 'v2_constant_product',
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
    pricingType: 'table_only_until_swap_verified',
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
    pricingType: 'waxfusion_special',
    defaultFeeBps: 0,
    explorer: 'https://waxblock.io/account/dapp.fusion',
  },
]);

const DEX_ADAPTER_CONTRACT = Object.freeze({
  alcor_orderbook: {
    source: 'alcor',
    contract: 'alcordexmain',
    table: 'markets',
    live_actions: ['sellmatch', 'buymatch'],
    pricing_type: 'orderbook_market_match',
  },
  alcor_concentrated_pool: {
    source: 'swap.alcor',
    contract: 'swap.alcor',
    table: 'pools',
    tables: ['pools', 'positions', 'ticks'],
    live_actions: ['logswap', 'logmint', 'logburn', 'logcollect', 'logpool'],
    pricing_type: 'concentrated_liquidity_not_v2_reserve_ratio',
  },
  taco: {
    source: 'swap.taco',
    contract: 'swap.taco',
    table: 'pairs',
    live_actions: ['exchangelog', 'liquiditylog', 'inittoken'],
    pricing_type: 'v2_constant_product',
  },
  defibox: {
    source: 'swap.box',
    contract: 'swap.box',
    table: 'pairs',
    live_actions: ['swaplog', 'liquiditylog', 'createlog'],
    pricing_type: 'v2_constant_product',
  },
  neftyblocks: {
    source: 'swap.nefty',
    contract: 'swap.nefty',
    table: 'pairs',
    live_actions: ['logswap', 'lognewpair'],
    pricing_type: 'v2_constant_product',
  },
  adex: {
    source: 'swap.adex',
    contract: 'swap.adex',
    table: 'pools',
    listing_action: 'createpool',
    pricing_type: 'table_only_until_swap_action_verified',
  },
  waxfusion: {
    source: 'dapp.fusion',
    contract: 'dapp.fusion',
    table: 'global',
    pricing_type: 'special_staking_rate_source_not_dex_pair',
  },
});

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

function countRowsByAggregateSource(rows = []) {
  const counts = {
    'swap.nefty': 0,
    'swap.taco': 0,
    'swap.alcor': 0,
    alcor: 0,
  };
  for (const row of rows || []) {
    const source = aggregateSourceKey(row?.source) || 'unknown';
    counts[source] = (counts[source] || 0) + 1;
  }
  return counts;
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

function assetAmountDecimalString(asset) {
  const raw = String(asset || '').trim();
  const match = raw.match(/^([+-]?\d+(?:\.\d+)?)\s+[A-Z0-9._-]+$/i);
  return safeDecimal(match ? match[1] : raw);
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
  const volume7d = safeDecimal(ticker.volume_7d ?? ticker.volume7d ?? ticker.week_volume ?? ticker.weekly_volume ?? pair.volume_7d ?? pair.volume7d);
  const volume7dRaw = asNumber(volume7d);
  const volume30d = safeDecimal(ticker.volume_30d ?? ticker.volume30d ?? ticker.month_volume ?? ticker.monthly_volume ?? pair.volume_30d ?? pair.volume30d);
  const volume30dRaw = asNumber(volume30d);
  const reserveA = safeDecimal(tokenA.amount ?? ticker.base_amm_liquidity);
  const reserveB = safeDecimal(tokenB.amount ?? ticker.target_amm_liquidity);

  let liquidityWax = null;
  let liquidityUsd = null;
  const priceA = priceIndex.get(tokenKey(tokenA.contract, tokenA.symbol));
  const priceB = priceIndex.get(tokenKey(tokenB.contract, tokenB.symbol));
  const normalizedVolume = normalizeTokenAVolume(volume24Raw, tokenA, tokenB, price, priceIndex);
  const volume24Wax = normalizedVolume.wax;
  const volume24Usd = normalizedVolume.usd;
  const normalizedVolume7d = normalizeTokenAVolume(volume7dRaw, tokenA, tokenB, price, priceIndex);
  const volume7dWax = normalizedVolume7d.wax;
  const volume7dUsd = normalizedVolume7d.usd;
  const normalizedVolume30d = normalizeTokenAVolume(volume30dRaw, tokenA, tokenB, price, priceIndex);
  const volume30dWax = normalizedVolume30d.wax;
  const volume30dUsd = normalizedVolume30d.usd;
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
  const orderbookPricing = priceAlcorOrderbook(tokenA, tokenB, price, priceIndex);
  const sanitizedLiquidity = {
    liquidityWax: orderbookPricing.liquidityWax ?? sanitizeLiquidityValues(liquidityWax, liquidityUsd, priceIndex).liquidityWax,
    liquidityUsd: orderbookPricing.liquidityUsd ?? sanitizeLiquidityValues(liquidityWax, liquidityUsd, priceIndex).liquidityUsd,
  };

  return {
    source: 'alcor',
    pair_id: pairId,
    og_laststats_pair_id: ogLastStatsPairIdForSource('alcor', pair) || null,
    token_a_contract: tokenA.contract || null,
    token_a_symbol: tokenA.symbol || null,
    token_a_decimals: tokenA.decimals ?? null,
    token_b_contract: tokenB.contract || null,
    token_b_symbol: tokenB.symbol || null,
    token_b_decimals: tokenB.decimals ?? null,
    price,
    change_24h: change24,
    volume_24h: volume24,
    volume_24h_wax: volume24Wax,
    volume_24h_usd: volume24Usd,
    volume_7d: volume7d,
    volume_7d_wax: volume7dWax,
    volume_7d_usd: volume7dUsd,
    volume_30d: volume30d,
    volume_30d_wax: volume30dWax,
    volume_30d_usd: volume30dUsd,
    liquidity_wax: sanitizedLiquidity.liquidityWax,
    liquidity_usd: sanitizedLiquidity.liquidityUsd,
    reserve_a: reserveA,
    reserve_b: reserveB,
    reserve_a_decimal: reserveA,
    reserve_b_decimal: reserveB,
    fee_bps: safeDecimal(pair.fee),
    updated_at: syncedAt,
    valuation_basis: orderbookPricing.valuation_basis,
    proof_status: orderbookPricing.proof_status,
    reason_codes: orderbookPricing.reason_codes,
  };
}

function isReasonablePairTvlUsd(value) {
  const usd = asNumber(value);
  return usd == null || (usd >= 0 && usd <= MAX_REASONABLE_PAIR_TVL_USD);
}

function isReasonablePairTvlWax(value, waxUsd = null) {
  const wax = asNumber(value);
  if (wax == null) return true;
  if (wax < 0 || wax > MAX_REASONABLE_PAIR_TVL_WAX) return false;
  const usd = waxUsd != null ? wax * waxUsd : null;
  return isReasonablePairTvlUsd(usd);
}

function isReasonableBubbleLiquidity(liquidityWax, liquidityUsd, marketCapWax = null, marketCapUsd = null) {
  const wax = asNumber(liquidityWax);
  const usd = asNumber(liquidityUsd);
  const capWax = asNumber(marketCapWax);
  const capUsd = asNumber(marketCapUsd);
  if (wax != null && capWax != null && capWax > 0 && wax > capWax * MAX_BUBBLE_LIQUIDITY_TO_MARKET_CAP_RATIO) {
    return false;
  }
  if (usd != null && capUsd != null && capUsd > 0 && usd > capUsd * MAX_BUBBLE_LIQUIDITY_TO_MARKET_CAP_RATIO) {
    return false;
  }
  return true;
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

function unavailablePricingProof(valuationBasis, reasonCodes = []) {
  return {
    price: null,
    liquidityWax: null,
    liquidityUsd: null,
    valuation_basis: valuationBasis,
    proof_status: 'unavailable',
    reason_codes: reasonCodes.length ? reasonCodes : ['adapter_price_proof_unavailable'],
  };
}

function reserveRatioPrice(tokenA, tokenB) {
  if (tokenA?.amount == null || tokenA.amount <= 0 || tokenB?.amount == null || tokenB.amount <= 0) return null;
  return tokenB.amount / tokenA.amount;
}

function priceAlcorOrderbook(tokenA, tokenB, price, priceIndex) {
  const sourcePrice = asNumber(price);
  const liquidity = liquidityFromSides(tokenA, tokenB, priceIndex);
  return {
    price: safeDecimal(sourcePrice),
    liquidityWax: liquidity.liquidityWax,
    liquidityUsd: liquidity.liquidityUsd,
    valuation_basis: 'alcor_orderbook_market_match',
    proof_status: sourcePrice != null && sourcePrice > 0 ? 'verified' : 'weak',
    reason_codes: sourcePrice != null && sourcePrice > 0 ? [] : ['orderbook_match_price_unavailable'],
  };
}

function priceAlcorConcentratedPool(tokenA, tokenB, priceIndex) {
  const liquidity = liquidityFromSides(tokenA, tokenB, priceIndex);
  return {
    price: null,
    liquidityWax: liquidity.liquidityWax,
    liquidityUsd: liquidity.liquidityUsd,
    valuation_basis: 'alcor_concentrated_liquidity_pool',
    proof_status: 'weak',
    reason_codes: ['concentrated_liquidity_price_requires_tick_sqrt_price_proof'],
  };
}

function priceV2ConstantProductPool(tokenA, tokenB, priceIndex) {
  const price = reserveRatioPrice(tokenA, tokenB);
  if (price == null || price <= 0) {
    return unavailablePricingProof('v2_constant_product_reserves', ['missing_or_zero_reserves']);
  }
  const liquidity = liquidityFromSides(tokenA, tokenB, priceIndex);
  return {
    price: safeDecimal(price),
    liquidityWax: liquidity.liquidityWax,
    liquidityUsd: liquidity.liquidityUsd,
    valuation_basis: 'v2_constant_product_reserves',
    proof_status: 'verified',
    reason_codes: [],
  };
}

function priceWaxFusionSpecial(tokenA, tokenB, explicitPrice, priceIndex) {
  const price = asNumber(explicitPrice);
  if (price == null || price <= 0) {
    return unavailablePricingProof('waxfusion_special_staking_rate', ['waxfusion_staking_rate_unavailable']);
  }
  const liquidity = liquidityFromSides(tokenA, tokenB, priceIndex);
  return {
    price: safeDecimal(price),
    liquidityWax: liquidity.liquidityWax,
    liquidityUsd: liquidity.liquidityUsd,
    valuation_basis: 'waxfusion_special_staking_rate',
    proof_status: 'verified',
    reason_codes: [],
  };
}

function priceAdapterPair(adapter, tokenA, tokenB, priceIndex, explicitPrice = null) {
  if (adapter.source === 'alcor') return priceAlcorOrderbook(tokenA, tokenB, explicitPrice, priceIndex);
  if (adapter.pricingType === 'concentrated_liquidity') return priceAlcorConcentratedPool(tokenA, tokenB, priceIndex);
  if (adapter.pricingType === 'v2_constant_product') return priceV2ConstantProductPool(tokenA, tokenB, priceIndex);
  if (adapter.pricingType === 'waxfusion_special') return priceWaxFusionSpecial(tokenA, tokenB, explicitPrice, priceIndex);
  return unavailablePricingProof(adapter.pricingType || 'unverified_adapter_pricing', ['adapter_swap_action_not_verified']);
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

function alcorTokenSide(row, sideName, reserveName) {
  const upper = sideName.toUpperCase();
  const lower = sideName.toLowerCase();
  const side = firstPresent(
    row?.[sideName],
    row?.[`token${upper}`],
    row?.[`token_${lower}`],
    row?.[`${lower}_token`],
  );
  const reserve = firstPresent(
    side?.quantity,
    side?.reserve,
    side?.amount,
    row?.[reserveName],
    row?.[`reserve${upper}`],
    row?.[`reserve_${lower}`],
    row?.[`quantity${upper}`],
    row?.[`quantity_${lower}`],
    row?.[`${lower}_reserve`],
    row?.[`${lower}_quantity`],
  );
  const contract = firstPresent(
    side?.contract,
    side?.contract_name,
    side?.token_contract,
    side?.code,
    row?.[`contract${upper}`],
    row?.[`contract_${lower}`],
    row?.[`${lower}_contract`],
  );
  const symbol = firstPresent(
    side?.symbol,
    side?.sym,
    side?.currency,
    side?.token_symbol,
    row?.[`symbol${upper}`],
    row?.[`symbol_${lower}`],
    row?.[`${lower}_symbol`],
    row?.[`sym${upper}`],
    row?.[`sym_${lower}`],
    row?.[`${lower}_sym`],
  );
  const precision = firstPresent(
    side?.precision,
    side?.decimals,
    row?.[`precision${upper}`],
    row?.[`precision_${lower}`],
    row?.[`${lower}_precision`],
    row?.[`decimals${upper}`],
    row?.[`decimals_${lower}`],
    row?.[`${lower}_decimals`],
  );
  return getTokenSideInfo({
    ...((side && typeof side === 'object') ? side : {}),
    contract,
    symbol,
    precision,
    decimals: precision,
    quantity: reserve,
  });
}

function normalizeCoreDexPair(adapter, row, priceIndex, syncedAt) {
  if (isFalseLike(row.active)) return null;
  let tokenA = null;
  let tokenB = null;
  let explicitPrice = null;
  if (adapter.normalizer === 'tokenA-tokenB') {
    tokenA = alcorTokenSide(row, 'A', 'reserveA');
    tokenB = alcorTokenSide(row, 'B', 'reserveB');
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
  const pricing = priceAdapterPair(adapter, tokenA, tokenB, priceIndex, explicitPrice);
  const price = pricing.price;
  const volume24 = safeDecimal(row.volume_24h ?? row.volume24);
  const volume24Raw = asNumber(volume24);
  const volume7d = safeDecimal(row.volume_7d ?? row.volume7d);
  const volume7dRaw = asNumber(volume7d);
  const volume30d = safeDecimal(row.volume_30d ?? row.volume30d);
  const volume30dRaw = asNumber(volume30d);
  const normalizedVolume = normalizeTokenAVolume(volume24Raw, tokenA, tokenB, price, priceIndex);
  const volume24Wax = normalizedVolume.wax;
  const volume24Usd = normalizedVolume.usd;
  const normalizedVolume7d = normalizeTokenAVolume(volume7dRaw, tokenA, tokenB, price, priceIndex);
  const volume7dWax = normalizedVolume7d.wax;
  const volume7dUsd = normalizedVolume7d.usd;
  const normalizedVolume30d = normalizeTokenAVolume(volume30dRaw, tokenA, tokenB, price, priceIndex);
  const volume30dWax = normalizedVolume30d.wax;
  const volume30dUsd = normalizedVolume30d.usd;
  return {
    source: adapter.source,
    pair_id: String(pairId),
    og_laststats_pair_id: ogLastStatsPairIdForSource(adapter.source, row) || null,
    token_a_contract: tokenA.contract,
    token_a_symbol: tokenA.symbol,
    token_a_decimals: tokenA.decimals ?? null,
    token_b_contract: tokenB.contract,
    token_b_symbol: tokenB.symbol,
    token_b_decimals: tokenB.decimals ?? null,
    price,
    change_24h: null,
    volume_24h: volume24,
    volume_24h_wax: volume24Wax,
    volume_24h_usd: volume24Usd,
    volume_7d: volume7d,
    volume_7d_wax: volume7dWax,
    volume_7d_usd: volume7dUsd,
    volume_30d: volume30d,
    volume_30d_wax: volume30dWax,
    volume_30d_usd: volume30dUsd,
    liquidity_wax: pricing.proof_status === 'unavailable' ? null : pricing.liquidityWax,
    liquidity_usd: pricing.proof_status === 'unavailable' ? null : pricing.liquidityUsd,
    reserve_a: safeDecimal(tokenA.amount),
    reserve_b: safeDecimal(tokenB.amount),
    reserve_a_decimal: safeDecimal(tokenA.amount),
    reserve_b_decimal: safeDecimal(tokenB.amount),
    fee_bps: adapterFeeBps(adapter, row),
    updated_at: syncedAt,
    valuation_basis: pricing.valuation_basis,
    proof_status: pricing.proof_status,
    reason_codes: pricing.reason_codes,
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
     (source, pair_id, og_laststats_pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
      price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
      volume_7d, volume_7d_wax, volume_7d_usd, volume_30d, volume_30d_wax, volume_30d_usd,
      liquidity_wax, liquidity_usd,
      reserve_a, reserve_b, fee_bps, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, pair_id) DO UPDATE SET
       og_laststats_pair_id = excluded.og_laststats_pair_id,
       token_a_contract = excluded.token_a_contract,
       token_a_symbol = excluded.token_a_symbol,
       token_b_contract = excluded.token_b_contract,
       token_b_symbol = excluded.token_b_symbol,
       price = excluded.price,
       change_24h = excluded.change_24h,
       volume_24h = excluded.volume_24h,
       volume_24h_wax = excluded.volume_24h_wax,
       volume_24h_usd = excluded.volume_24h_usd,
       volume_7d = excluded.volume_7d,
       volume_7d_wax = excluded.volume_7d_wax,
       volume_7d_usd = excluded.volume_7d_usd,
       volume_30d = excluded.volume_30d,
       volume_30d_wax = excluded.volume_30d_wax,
       volume_30d_usd = excluded.volume_30d_usd,
       liquidity_wax = excluded.liquidity_wax,
       liquidity_usd = excluded.liquidity_usd,
       reserve_a = excluded.reserve_a,
       reserve_b = excluded.reserve_b,
       fee_bps = excluded.fee_bps,
       updated_at = excluded.updated_at`
  ).bind(
    pair.source, pair.pair_id, pair.og_laststats_pair_id || null, pair.token_a_contract, pair.token_a_symbol,
    pair.token_b_contract, pair.token_b_symbol, pair.price, pair.change_24h,
    pair.volume_24h, pair.volume_24h_wax, pair.volume_24h_usd,
    pair.volume_7d, pair.volume_7d_wax, pair.volume_7d_usd,
    pair.volume_30d, pair.volume_30d_wax, pair.volume_30d_usd,
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

function alcorMarketTradeVolumeWax(row) {
  for (const value of [row?.bid, row?.ask, row?.quote_quantity, row?.base_quantity, row?.volume, row?.amount]) {
    const asset = parseAsset(value);
    if (asset.amount != null && asset.symbol === 'WAX') return Math.abs(asset.amount);
  }
  return null;
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
  const volumeWax = safeDecimal(alcorMarketTradeVolumeWax(row));
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
      volume_wax: volumeWax,
      ask: row?.ask || null,
      bid: row?.bid || null,
      amount_ask: row?.amount_ask ?? null,
      code_ask: row?.code_ask ?? null,
      amount_bid: row?.amount_bid ?? null,
      code_bid: row?.code_bid ?? null,
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

function newestIsoTimestamp(current, candidate) {
  const currentTime = Date.parse(current || '');
  const candidateTime = Date.parse(candidate || '');
  if (!Number.isFinite(candidateTime)) return current || null;
  if (!Number.isFinite(currentTime) || candidateTime > currentTime) return candidate;
  return current || null;
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

function normalizeLiveIndexerHistoryTrade(trade) {
  if (!trade || typeof trade !== 'object') return null;
  const source = moonboysCandleSource(trade.source);
  const pairId = safeString(trade.pair_id);
  const tradeId = safeString(trade.trade_id);
  const tradedAt = normalizeTradeTimestamp(trade.traded_at);
  if (!source || !pairId || !tradeId || !tradedAt) return null;
  const contract = normalizeContract(trade.contract) || null;
  const symbol = normalizeSymbol(trade.symbol) || null;
  const price = safeDecimal(trade.price);
  const volume = safeDecimal(trade.volume);
  if (price == null || volume == null) return null;
  const raw = {
    reference_ingestion: 'waxonedge-live-indexer /history',
    og_source: trade.og_source || null,
    stream_source: trade.stream_source || null,
    quote_contract: normalizeContract(trade.quote_contract) || null,
    quote_symbol: normalizeSymbol(trade.quote_symbol) || null,
    direction: trade.direction || null,
  };
  const volumeNumber = asNumber(volume);
  const priceNumber = asNumber(price);
  if (contract === WAXCASH_CONTRACT && symbol === WAXCASH_SYMBOL && raw.quote_symbol === 'WAX' && volumeNumber != null && priceNumber != null) {
    raw.volume_wax = safeDecimal(volumeNumber * priceNumber);
  } else if (isWaxToken(contract, symbol) && volumeNumber != null) {
    raw.volume_wax = safeDecimal(volumeNumber);
  }
  return {
    source,
    trade_id: tradeId,
    pair_id: pairId,
    contract,
    symbol,
    side: safeString(trade.side) || 'swap',
    price,
    amount: volume,
    volume,
    tx_id: safeString(trade.tx_id || trade.transaction_id) || null,
    traded_at: tradedAt,
    raw_json: JSON.stringify(raw),
  };
}

async function fetchLiveIndexerJson(env, path, fetchImpl = globalThis.fetch) {
  const baseUrl = waxonedgeLiveIndexerBaseUrl(env);
  if (!baseUrl || typeof fetchImpl !== 'function') return { ok: false, skipped: true, reason: 'live_indexer_not_configured' };
  const headers = { accept: 'application/json' };
  const secret = String(env?.WAXONEDGE_LIVE_SHARED_SECRET || '').trim();
  if (secret) headers[WAXONEDGE_LIVE_SECRET_HEADER] = secret;
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
    redirect: 'manual',
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, status: response.status, reason: `live_indexer_${response.status}`, body: safeBodySnippet(text) };
  try {
    return { ok: true, payload: text ? JSON.parse(text) : {} };
  } catch (error) {
    return { ok: false, status: response.status, reason: 'live_indexer_invalid_json', body: safeBodySnippet(text || error?.message) };
  }
}

function liveIndexerHistoryTradeRows(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.trades)) return payload.trades;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.history?.trades)) return payload.history.trades;
  return null;
}

async function syncLiveIndexerHistory(env, fetchImpl = globalThis.fetch) {
  const startedAt = nowIso();
  const fetched = await fetchLiveIndexerJson(env, '/history/trades?limit=500', fetchImpl).catch((error) => ({
    ok: false,
    reason: error?.message || String(error),
  }));
  if (!fetched.ok) {
    const status = fetched.skipped ? 'skipped' : 'failed';
    await upsertSourceIndexState(env.DB, LIVE_INDEXER_HISTORY_SOURCE, {
      sync_cycle_id: `live-history-${new Date().toISOString().slice(0, 10)}`,
      cursor: '',
      page_count: 0,
      row_count: 0,
      complete: 0,
      truncated: 0,
      status,
      error: fetched.reason || null,
      started_at: startedAt,
    }).catch(() => {});
    await recordSyncRun(env.DB, LIVE_INDEXER_HISTORY_SOURCE, status, startedAt, fetched.reason || null).catch(() => {});
    await writeSnapshot(env.DB, LIVE_INDEXER_HISTORY_SOURCE, {
      source: LIVE_INDEXER_HISTORY_SOURCE,
      status,
      imported_trade_count: 0,
      reason: fetched.reason || null,
      no_fake_trades: true,
    }, nowIso()).catch(() => {});
    return { ok: true, status, imported_trade_count: 0, reason: fetched.reason || null, no_fake_trades: true };
  }
  const exposedTrades = liveIndexerHistoryTradeRows(fetched.payload);
  if (!Array.isArray(exposedTrades)) {
    const reason = 'live_indexer_history_trades_not_exposed';
    await upsertSourceIndexState(env.DB, LIVE_INDEXER_HISTORY_SOURCE, {
      sync_cycle_id: `live-history-${new Date().toISOString().slice(0, 10)}`,
      cursor: '',
      page_count: 0,
      row_count: 0,
      complete: 0,
      truncated: 0,
      status: 'skipped',
      error: reason,
      started_at: startedAt,
    }).catch(() => {});
    await recordSyncRun(env.DB, LIVE_INDEXER_HISTORY_SOURCE, 'skipped', startedAt, reason).catch(() => {});
    await writeSnapshot(env.DB, LIVE_INDEXER_HISTORY_SOURCE, {
      source: LIVE_INDEXER_HISTORY_SOURCE,
      status: 'skipped',
      imported_trade_count: 0,
      reason,
      no_fake_trades: true,
    }, nowIso()).catch(() => {});
    return { ok: true, status: 'skipped', imported_trade_count: 0, reason, no_fake_trades: true };
  }
  const trades = exposedTrades
    .map(normalizeLiveIndexerHistoryTrade)
    .filter(Boolean);
  if (!trades.length) {
    const reason = exposedTrades.length ? 'live_indexer_history_no_importable_trades' : 'live_indexer_history_no_trades';
    await upsertSourceIndexState(env.DB, LIVE_INDEXER_HISTORY_SOURCE, {
      sync_cycle_id: `live-history-${new Date().toISOString().slice(0, 10)}`,
      cursor: fetched.payload?.next_cursor || fetched.payload?.history?.history_started_at || '',
      page_count: 1,
      row_count: 0,
      complete: 0,
      truncated: 0,
      status: 'skipped',
      error: reason,
      started_at: startedAt,
    }).catch(() => {});
    await recordSyncRun(env.DB, LIVE_INDEXER_HISTORY_SOURCE, 'skipped', startedAt, reason).catch(() => {});
    await writeSnapshot(env.DB, LIVE_INDEXER_HISTORY_SOURCE, {
      source: LIVE_INDEXER_HISTORY_SOURCE,
      status: 'skipped',
      imported_trade_count: 0,
      exposed_trade_count: exposedTrades.length,
      reason,
      no_fake_trades: true,
    }, nowIso()).catch(() => {});
    return { ok: true, status: 'skipped', imported_trade_count: 0, exposed_trade_count: exposedTrades.length, reason, no_fake_trades: true };
  }
  const rowsWritten = await upsertTrades(env.DB, trades);
  await upsertSourceIndexState(env.DB, LIVE_INDEXER_HISTORY_SOURCE, {
    sync_cycle_id: `live-history-${new Date().toISOString().slice(0, 10)}`,
    cursor: fetched.payload?.next_cursor || fetched.payload?.history?.history_started_at || '',
    page_count: 1,
    row_count: trades.length,
    complete: 1,
    truncated: 0,
    status: 'success',
    error: null,
    started_at: startedAt,
  }).catch(() => {});
  await writeSnapshot(env.DB, LIVE_INDEXER_HISTORY_SOURCE, {
    source: LIVE_INDEXER_HISTORY_SOURCE,
    status: 'success',
    imported_trade_count: trades.length,
    exposed_trade_count: exposedTrades.length,
    rows_written: rowsWritten,
    history_started_at: fetched.payload?.history?.history_started_at || null,
    next_cursor: fetched.payload?.next_cursor || null,
    persisted_trade_count: asNumber(fetched.payload?.history?.persisted_trade_count) || trades.length,
    source_coverage: Array.from(new Set(trades.map((trade) => moonboysCandleSource(trade.source)).filter(Boolean))).sort(),
    no_fake_trades: true,
  }, nowIso()).catch(() => {});
  await recordSyncRun(env.DB, LIVE_INDEXER_HISTORY_SOURCE, 'success', startedAt).catch(() => {});
  return { ok: true, status: 'success', imported_trade_count: trades.length, rows_written: rowsWritten, no_fake_trades: true };
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
  let headRefreshStreamCount = 0;
  let headRefreshRowsFetched = 0;
  let headRefreshRowsWritten = 0;
  let headRefreshDuplicateRowsSkipped = 0;
  let headRefreshFailedStreamCount = 0;
  let headRefreshLatestIndexedTimestamp = null;
  let headRefreshLastError = null;
  for (const actionName of actionStreams) {
    const actionState = streamProgress[actionName] || normalizeActionStreamProgress(actionName);
    headRefreshStreamCount += 1;
    try {
      const result = await fetchAlcorMarketMatchStreamRows(env, actionName, rowsPerMarket, 0);
      if (result.diagnostic?.row_count > 0) sampleTradeFetchSuccess = result.diagnostic;
      if (result.diagnostic && result.diagnostic.failure_type) sampleTradeFetchFailure = result.diagnostic;
      if (result.hyperionNotConfigured) {
        hyperionNotConfiguredCount += 1;
        actionState.status = 'skipped';
        actionState.last_error = 'hyperion_not_configured';
        actionState.updated_at = nowIso();
        headRefreshLastError = 'hyperion_not_configured';
        lastError = 'hyperion_not_configured: set WAXONEDGE_HYPERION_API to a WAX Hyperion endpoint that supports /v2/history/get_actions';
        break;
      }
      if (result.budgetFailure) {
        budgetExhausted = true;
        actionState.status = 'budget_limited';
        actionState.last_error = result.diagnostic?.response_body_snippet || 'trade row head refresh budget exhausted';
        actionState.updated_at = nowIso();
        headRefreshLastError = actionState.last_error;
        lastError = actionState.last_error;
        break;
      }
      if (result.temporaryFailure || result.failed || result.unsupported) {
        headRefreshFailedStreamCount += 1;
        headRefreshLastError = result.diagnostic?.failure_type || (result.unsupported ? 'unsupported' : 'failed');
        actionState.head_refresh_last_error = headRefreshLastError;
        actionState.head_refresh_at = nowIso();
        actionState.updated_at = nowIso();
        continue;
      }
      if (result.noTradeRows || !result.rows.length) {
        actionState.head_refresh_last_error = result.diagnostic?.failure_type || 'no_trade_rows';
        actionState.head_refresh_at = nowIso();
        actionState.updated_at = nowIso();
        continue;
      }
      const trades = result.rows
        .map((row) => normalizeAlcorMarketTradeRow(row))
        .filter(Boolean);
      headRefreshRowsFetched += trades.length;
      if (!trades.length) {
        headRefreshFailedStreamCount += 1;
        actionState.head_refresh_last_error = `trade_rows_not_usable: ${actionName}`;
        actionState.head_refresh_at = nowIso();
        actionState.updated_at = nowIso();
        continue;
      }
      const written = await upsertTrades(env.DB, trades);
      rowsIndexed += trades.length;
      rowsWritten += written;
      duplicateRowsSkipped += Math.max(0, trades.length - written);
      headRefreshRowsWritten += written;
      headRefreshDuplicateRowsSkipped += Math.max(0, trades.length - written);
      headRefreshLatestIndexedTimestamp = newestIsoTimestamp(headRefreshLatestIndexedTimestamp, result.last_indexed_timestamp);
      actionState.last_sequence = maxNumberValue([actionState.last_sequence, result.last_sequence]);
      actionState.last_block = maxNumberValue([actionState.last_block, result.last_block]);
      actionState.last_indexed_timestamp = newestIsoTimestamp(actionState.last_indexed_timestamp, result.last_indexed_timestamp);
      actionState.rows_written += written;
      actionState.duplicate_rows_skipped += Math.max(0, trades.length - written);
      actionState.head_refresh_rows_fetched = trades.length;
      actionState.head_refresh_rows_written = written;
      actionState.head_refresh_last_indexed_timestamp = result.last_indexed_timestamp || null;
      actionState.head_refresh_last_error = null;
      actionState.head_refresh_at = nowIso();
      actionState.updated_at = nowIso();
      sampleTradeFetchFailure = null;
    } catch (error) {
      if (isSubrequestBudgetError(error)) {
        budgetExhausted = true;
        actionState.status = 'budget_limited';
        actionState.last_error = error?.message || String(error);
        actionState.updated_at = nowIso();
        headRefreshLastError = actionState.last_error;
        lastError = actionState.last_error;
        break;
      }
      headRefreshFailedStreamCount += 1;
      actionState.head_refresh_last_error = error?.message || String(error);
      actionState.head_refresh_at = nowIso();
      actionState.updated_at = nowIso();
      headRefreshLastError = actionState.head_refresh_last_error;
    }
  }
  for (const actionName of candidateRows) {
    if (budgetExhausted || hyperionNotConfiguredCount > 0) break;
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
    head_refresh_enabled: true,
    head_refresh_stream_count: headRefreshStreamCount,
    head_refresh_failed_stream_count: headRefreshFailedStreamCount,
    head_refresh_rows_fetched: headRefreshRowsFetched,
    head_refresh_rows_written: headRefreshRowsWritten,
    head_refresh_duplicate_rows_skipped: headRefreshDuplicateRowsSkipped,
    head_refresh_latest_indexed_timestamp: headRefreshLatestIndexedTimestamp,
    head_refresh_last_error: headRefreshLastError,
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
    head_refresh_enabled: true,
    head_refresh_stream_count: headRefreshStreamCount,
    head_refresh_failed_stream_count: headRefreshFailedStreamCount,
    head_refresh_rows_fetched: headRefreshRowsFetched,
    head_refresh_rows_written: headRefreshRowsWritten,
    head_refresh_duplicate_rows_skipped: headRefreshDuplicateRowsSkipped,
    head_refresh_latest_indexed_timestamp: headRefreshLatestIndexedTimestamp,
    head_refresh_last_error: headRefreshLastError,
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
  let headRefreshStreamCount = 0;
  let headRefreshRowsFetched = 0;
  let headRefreshRowsWritten = 0;
  let headRefreshDuplicateRowsSkipped = 0;
  let headRefreshFailedStreamCount = 0;
  let headRefreshLatestIndexedTimestamp = null;
  let headRefreshLastError = null;
  for (const streamKey of actionStreams) {
    const stream = findAmmSwapActionStream(streamKey);
    if (!stream) continue;
    const actionState = streamProgress[streamKey] || normalizeActionStreamProgress(streamKey);
    headRefreshStreamCount += 1;
    try {
      const result = await fetchAmmSwapStreamRows(env, stream, rowsPerMarket, 0);
      if (result.diagnostic?.row_count > 0) sampleTradeFetchSuccess = result.diagnostic;
      if (result.diagnostic && result.diagnostic.failure_type) sampleTradeFetchFailure = result.diagnostic;
      if (result.hyperionNotConfigured) {
        hyperionNotConfiguredCount += 1;
        actionState.status = 'skipped';
        actionState.last_error = 'hyperion_not_configured';
        actionState.updated_at = nowIso();
        headRefreshLastError = 'hyperion_not_configured';
        lastError = 'hyperion_not_configured: set WAXONEDGE_HYPERION_API to a WAX Hyperion endpoint that supports /v2/history/get_actions';
        break;
      }
      if (result.budgetFailure) {
        budgetExhausted = true;
        actionState.status = 'budget_limited';
        actionState.last_error = result.diagnostic?.response_body_snippet || 'AMM trade row head refresh budget exhausted';
        actionState.updated_at = nowIso();
        headRefreshLastError = actionState.last_error;
        lastError = actionState.last_error;
        break;
      }
      if (result.temporaryFailure || result.failed || result.unsupported) {
        headRefreshFailedStreamCount += 1;
        headRefreshLastError = result.diagnostic?.failure_type || (result.unsupported ? 'unsupported' : 'failed');
        actionState.head_refresh_last_error = headRefreshLastError;
        actionState.head_refresh_at = nowIso();
        actionState.updated_at = nowIso();
        continue;
      }
      if (result.noTradeRows || !result.rows.length) {
        actionState.head_refresh_last_error = result.diagnostic?.failure_type || 'no_trade_rows';
        actionState.head_refresh_at = nowIso();
        actionState.updated_at = nowIso();
        continue;
      }
      const trades = result.rows
        .map((row) => normalizeAmmSwapTradeRow(row, stream))
        .filter(Boolean);
      headRefreshRowsFetched += trades.length;
      if (!trades.length) {
        headRefreshFailedStreamCount += 1;
        actionState.head_refresh_last_error = `trade_rows_not_usable: ${stream.source} ${stream.action}`;
        actionState.head_refresh_at = nowIso();
        actionState.updated_at = nowIso();
        continue;
      }
      const written = await upsertTrades(env.DB, trades);
      rowsIndexed += trades.length;
      rowsWritten += written;
      duplicateRowsSkipped += Math.max(0, trades.length - written);
      headRefreshRowsWritten += written;
      headRefreshDuplicateRowsSkipped += Math.max(0, trades.length - written);
      headRefreshLatestIndexedTimestamp = newestIsoTimestamp(headRefreshLatestIndexedTimestamp, result.last_indexed_timestamp);
      actionState.last_sequence = maxNumberValue([actionState.last_sequence, result.last_sequence]);
      actionState.last_block = maxNumberValue([actionState.last_block, result.last_block]);
      actionState.last_indexed_timestamp = newestIsoTimestamp(actionState.last_indexed_timestamp, result.last_indexed_timestamp);
      actionState.rows_written += written;
      actionState.duplicate_rows_skipped += Math.max(0, trades.length - written);
      actionState.head_refresh_rows_fetched = trades.length;
      actionState.head_refresh_rows_written = written;
      actionState.head_refresh_last_indexed_timestamp = result.last_indexed_timestamp || null;
      actionState.head_refresh_last_error = null;
      actionState.head_refresh_at = nowIso();
      actionState.updated_at = nowIso();
      sampleTradeFetchFailure = null;
    } catch (error) {
      if (isSubrequestBudgetError(error)) {
        budgetExhausted = true;
        actionState.status = 'budget_limited';
        actionState.last_error = error?.message || String(error);
        actionState.updated_at = nowIso();
        headRefreshLastError = actionState.last_error;
        lastError = actionState.last_error;
        break;
      }
      headRefreshFailedStreamCount += 1;
      actionState.head_refresh_last_error = error?.message || String(error);
      actionState.head_refresh_at = nowIso();
      actionState.updated_at = nowIso();
      headRefreshLastError = actionState.head_refresh_last_error;
    }
  }
  for (const streamKey of candidateRows) {
    if (budgetExhausted || hyperionNotConfiguredCount > 0) break;
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
    head_refresh_enabled: true,
    head_refresh_stream_count: headRefreshStreamCount,
    head_refresh_failed_stream_count: headRefreshFailedStreamCount,
    head_refresh_rows_fetched: headRefreshRowsFetched,
    head_refresh_rows_written: headRefreshRowsWritten,
    head_refresh_duplicate_rows_skipped: headRefreshDuplicateRowsSkipped,
    head_refresh_latest_indexed_timestamp: headRefreshLatestIndexedTimestamp,
    head_refresh_last_error: headRefreshLastError,
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

async function syncPinnedWaxcashPairs(env, syncCycleId = '') {
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
  const syncedAt = nowIso();
  const adapter = CORE_DEX_ADAPTERS.find((entry) => entry.source === 'swap.alcor');
  const pins = [{ source: 'swap.alcor', pair_id: '8388', reason: 'waxcash_display_chart_feed' }];
  const pairs = [];
  let error = null;
  try {
    const tableResult = await fetchTableRows(adapter.contract, adapter.table, {
      limit: 1,
      lowerBound: '8388',
      maxPages: 1,
      requestBudget: 1,
    });
    for (const row of tableResult.rows || []) {
      const normalized = normalizeCoreDexPair(adapter, row, priceIndex, syncedAt);
      if (normalized && String(normalized.pair_id) === '8388' && pairTokenSide(normalized, WAXCASH_CONTRACT, WAXCASH_SYMBOL)) {
        pairs.push(normalized);
      }
    }
    await upsertPairs(env.DB, pairs);
    const status = pairs.length ? 'success' : 'skipped';
    error = pairs.length ? null : 'swap.alcor #8388 not returned by chain table lower_bound';
    await upsertSourceIndexState(env.DB, 'waxcash_pinned_pairs', {
      sync_cycle_id: syncCycleId || `pinned-${new Date().toISOString().slice(0, 10)}`,
      cursor: '',
      page_count: 1,
      row_count: pairs.length,
      complete: pairs.length ? 1 : 0,
      truncated: 0,
      status,
      error,
      started_at: startedAt,
    }).catch(() => {});
    await writeSnapshot(env.DB, 'waxcash_pinned_pairs', {
      source: 'waxcash_pinned_pairs',
      status,
      pins,
      rows_written: pairs.length,
      source_coverage: pairs.map((pair) => pair.source),
      alcor_8388_indexed: pairs.some((pair) => pair.source === 'swap.alcor' && String(pair.pair_id) === '8388'),
      no_fake_pairs: true,
      error,
    }, nowIso()).catch(() => {});
    await recordSyncRun(env.DB, 'waxcash_pinned_pairs', status, startedAt, error).catch(() => {});
    return { ok: true, status, rows_written: pairs.length, alcor_8388_indexed: pairs.length > 0, error };
  } catch (caught) {
    error = caught?.message || String(caught);
    await recordSyncRun(env.DB, 'waxcash_pinned_pairs', 'failed', startedAt, error).catch(() => {});
    await upsertSourceIndexState(env.DB, 'waxcash_pinned_pairs', {
      sync_cycle_id: syncCycleId || `pinned-${new Date().toISOString().slice(0, 10)}`,
      cursor: '',
      page_count: 0,
      row_count: 0,
      complete: 0,
      truncated: 0,
      status: 'failed',
      error,
      started_at: startedAt,
    }).catch(() => {});
    return { ok: false, status: 'failed', rows_written: 0, alcor_8388_indexed: false, error };
  }
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
        circulating_supply, market_cap_wax, market_cap_usd, fdv_wax, fdv_usd,
        source_count, indexed_pair_count, source_keys, aggregate_complete,
        aggregate_sources_required, aggregate_sources_present, aggregate_sources_processed,
        aggregate_sources_failed, aggregate_truncated, aggregate_sources_truncated, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         circulating_supply = excluded.circulating_supply,
         market_cap_wax = excluded.market_cap_wax,
         market_cap_usd = excluded.market_cap_usd,
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
      detailStats.circulating_supply,
      detailStats.market_cap_wax,
      detailStats.market_cap_usd,
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
  const targetRows = [];
  const seenTargets = new Set();
  const addTarget = (target) => {
    const contract = normalizeContract(target?.contract);
    const symbol = normalizeSymbol(target?.symbol);
    const key = tokenKey(contract, symbol);
    if (!key || seenTargets.has(key)) return;
    seenTargets.add(key);
    targetRows.push({ contract, symbol, token_key: key, decimals: asNumber(target?.decimals) });
  };
  addTarget(waxcashSupplyTarget());
  for (const row of rows.results || []) addTarget(row);
  let updated = 0;
  let attempted = 0;
  let failed = 0;
  let waxcashSupplyError = null;
  const rotatingRows = (rows.results || []).slice(0, limit);
  const runRows = targetRows.filter((row) =>
    row.token_key === WAXCASH_TOKEN_REF.token_key ||
    rotatingRows.some((rotating) => tokenKey(rotating.contract, rotating.symbol) === row.token_key));
  for (const row of runRows) {
    attempted += 1;
    const isWaxcashTarget = row.token_key === WAXCASH_TOKEN_REF.token_key;
    try {
      const stats = await rpcPost('/v1/chain/get_currency_stats', {
        code: row.contract,
        symbol: row.symbol,
      });
      const stat = stats?.[row.symbol] || null;
      if (!stat) {
        if (isWaxcashTarget) throw new Error('get_currency_stats_missing_WAXCASH');
        continue;
      }
      const supply = parseAsset(stat.supply);
      const maxSupply = parseAsset(stat.max_supply);
      if (supply.symbol && supply.symbol !== row.symbol) {
        if (isWaxcashTarget) throw new Error(`get_currency_stats_symbol_mismatch:${supply.symbol}`);
        continue;
      }
      if (maxSupply.symbol && maxSupply.symbol !== row.symbol) {
        if (isWaxcashTarget) throw new Error(`get_currency_stats_max_supply_symbol_mismatch:${maxSupply.symbol}`);
        continue;
      }
      const decimals = asNumber(row.decimals) ?? supply.precision ?? maxSupply.precision ?? null;
      const totalSupplyDecimal = assetAmountDecimalString(stat.supply);
      const maxSupplyDecimal = assetAmountDecimalString(stat.max_supply);
      if (isWaxcashTarget && totalSupplyDecimal == null) throw new Error('get_currency_stats_supply_parse_failed');
      const syncedAt = nowIso();
      await env.DB.prepare(
        `INSERT INTO waxonedge_tokens
         (contract, symbol, decimals, total_supply, max_supply, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(contract, symbol) DO UPDATE SET
           decimals = COALESCE(excluded.decimals, waxonedge_tokens.decimals),
           total_supply = COALESCE(excluded.total_supply, waxonedge_tokens.total_supply),
           max_supply = COALESCE(excluded.max_supply, waxonedge_tokens.max_supply),
           updated_at = excluded.updated_at`
      ).bind(
        row.contract,
        row.symbol,
        decimals,
        totalSupplyDecimal,
        maxSupplyDecimal,
        syncedAt,
      ).run();
      await env.DB.prepare(
        `INSERT INTO waxonedge_token_stats
         (contract, symbol, fdv_wax, fdv_usd, updated_at)
         VALUES (?, ?, NULL, NULL, ?)
         ON CONFLICT(contract, symbol) DO UPDATE SET
           updated_at = excluded.updated_at`
      ).bind(row.contract, row.symbol, syncedAt).run().catch(() => {});
      updated += 1;
    } catch (error) {
      failed += 1;
      const message = error?.message || String(error);
      if (isWaxcashTarget) waxcashSupplyError = `graffitiking::WAXCASH supply sync failed: ${message}`;
    }
  }
  const totalSupplyTargets = Math.max(totalPairTokens, targetRows.length);
  const complete = totalSupplyTargets > 0 && totalPairTokens <= limit && rotatingRows.length >= totalPairTokens && failed === 0 ? 1 : 0;
  const truncated = complete ? 0 : (totalPairTokens > limit && rotatingRows.length >= limit ? 1 : 0);
  const status = attempted <= 0
    ? 'skipped'
    : (complete === 1 ? 'success' : (updated > 0 ? 'partial' : 'failed'));
  const error = attempted <= 0
    ? 'No indexed pair tokens found for supply sync'
    : (waxcashSupplyError || (failed > 0 ? `${failed} supply target(s) failed` : null));
  const lastTokenKey = rotatingRows.length ? rotatingRows[rotatingRows.length - 1].token_key : '';
  const nextCursor = rotatingRows.length > 0 && totalPairTokens > limit && rotatingRows.length >= limit ? String(lastTokenKey || '') : '';
  await upsertSourceIndexState(env.DB, SUPPLY_SYNC_SOURCE, {
    sync_cycle_id: state?.sync_cycle_id || `supply-${new Date().toISOString().slice(0, 10)}`,
    cursor: nextCursor,
    page_count: (asNumber(state?.page_count) || 0) + (attempted > 0 ? 1 : 0),
    row_count: totalSupplyTargets,
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
    failed,
    total_pair_tokens: totalPairTokens,
    total_supply_targets: totalSupplyTargets,
    waxcash_target_included: seenTargets.has(WAXCASH_TOKEN_REF.token_key),
    waxcash_error: waxcashSupplyError,
    limit,
    cursor: nextCursor,
    complete,
    truncated,
    status,
  };
}

async function listTopTokens(db) {
  const graph = await loadWaxcashGraphTokenRows(db);
  const tokens = await deriveReserveBackedTokenRows(db, graph.tokenRows, {
    pairRows: graph.pairRows,
    routeGraphRows: graph.pairRows,
    routeGraphLimit: 0,
  });
  return sortWaxcashGraphTokens(tokens).slice(0, 250);
}

async function loadTokenRowsForRefs(db, refs = []) {
  const targets = (refs || [])
    .filter((token) => token?.contract && token?.symbol)
    .filter((token, index, list) => list.findIndex((item) => item.contract === token.contract && item.symbol === token.symbol) === index);
  if (!targets.length) return [];
  const rows = [];
  for (let i = 0; i < targets.length; i += 50) {
    const chunk = targets.slice(i, i + 50);
    const where = chunk.map(() => '(t.contract = ? AND t.symbol = ?)').join(' OR ');
    const params = chunk.flatMap((token) => [token.contract, token.symbol]);
    const result = await db.prepare(
      `SELECT t.contract, t.symbol, t.decimals, t.total_supply, t.max_supply, t.price_wax, t.price_usd,
              t.pair_count, t.icon_url, t.updated_at,
              s.volume_24h, s.volume_24h_wax, s.volume_24h_usd, s.volume_7d, s.volume_30d,
              s.liquidity_wax, s.liquidity_usd,
              s.tvl_wax, s.tvl_usd, s.change_24h, s.selected_price_wax, s.selected_price_usd,
              s.selected_pair_source, s.selected_pair_id, s.holder_count, s.circulating_supply,
              s.burned_amount, s.market_cap_wax, s.market_cap_usd, s.fdv_wax, s.fdv_usd,
              s.source_count, s.indexed_pair_count, s.source_keys, s.aggregate_complete,
              s.aggregate_sources_required, s.aggregate_sources_present, s.aggregate_sources_processed,
              s.aggregate_sources_failed, s.aggregate_truncated, s.aggregate_sources_truncated,
              COALESCE(s.updated_at, t.updated_at) AS stats_updated_at
       FROM waxonedge_tokens t
       LEFT JOIN waxonedge_token_stats s
         ON s.contract = t.contract AND s.symbol = t.symbol
       WHERE ${where}`
    ).bind(...params).all().catch(() => ({ results: [] }));
    rows.push(...(result.results || []));
  }
  return rows;
}

async function deriveReserveBackedTokenRow(db, row) {
  const [derived] = await deriveReserveBackedTokenRows(db, [row]);
  return derived || Object.assign({ ...(row || {}) }, tokenMetricProof(row || {}));
}

async function deriveReserveBackedTokenRows(db, rows = [], options = {}) {
  const tokenRows = (rows || [])
    .map((row) => ({
      row,
      contract: normalizeContract(row?.contract),
      symbol: normalizeSymbol(row?.symbol),
      key: tokenKey(row?.contract, row?.symbol),
    }))
    .filter((entry) => entry.key);
  if (!tokenRows.length) return [];

  const providedPairRows = Array.isArray(options.pairRows) ? dedupePairRows(options.pairRows) : null;
  const pairRows = providedPairRows || await loadPairRowsForTokens(db, tokenRows);
  const graphLimit = clampInteger(options.routeGraphLimit, OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT, 0, OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT);
  const routeGraphRows = Array.isArray(options.routeGraphRows)
    ? dedupePairRows(options.routeGraphRows)
    : (graphLimit > 0 ? await loadReserveRouteGraphRows(db, graphLimit) : []);
  const graphRows = dedupePairRows(pairRows.concat(routeGraphRows));
  const priceRows = await loadTokenPriceRowsForPairs(db, pairRows);
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const routeIndex = buildOgWaxRouteGraph(graphRows, priceIndex);
  const pairsByToken = new Map();
  for (const pair of pairRows) {
    for (const key of [
      tokenKey(pair.token_a_contract, pair.token_a_symbol),
      tokenKey(pair.token_b_contract, pair.token_b_symbol),
    ]) {
      if (!key) continue;
      if (!pairsByToken.has(key)) pairsByToken.set(key, []);
      pairsByToken.get(key).push(pair);
    }
  }
  return tokenRows.map((entry) => deriveTokenPairMetrics(
    { ...(entry.row || {}), contract: entry.contract, symbol: entry.symbol },
    { ...(entry.row || {}), contract: entry.contract, symbol: entry.symbol },
    pairsByToken.get(entry.key) || [],
    priceRows,
    graphRows,
    { routeIndex },
  ));
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
  return asNumber(row.selected_price_usd ?? row.price_usd);
}

function normalizeLiveTokenUpdate(row) {
  const contract = normalizeContract(row?.contract);
  const symbol = normalizeSymbol(row?.symbol);
  const tokenKeyValue = liveTokenUpdateKey(contract, symbol);
  if (!tokenKeyValue) return null;
  const proof = tokenMetricProof(row);
  const priceWax = proof.selected_price_confidence === 'good'
    ? safeDecimal(asNumber(row.selected_price_wax ?? row.price_wax))
    : null;
  const priceUsd = proof.selected_price_confidence === 'good'
    ? safeDecimal(asNumber(row.selected_price_usd ?? row.price_usd))
    : null;
  const liquidityWax = proof.liquidity_confidence === 'good' ? safeDecimal(asNumber(row.liquidity_wax)) : null;
  const liquidityUsd = proof.liquidity_confidence === 'good' ? safeDecimal(asNumber(row.liquidity_usd)) : null;
  const graphLiquidityWax = proof.liquidity_confidence === 'good' ? safeDecimal(asNumber(row.graph_liquidity_wax ?? row.liquidity_wax)) : null;
  const graphLiquidityUsd = proof.liquidity_confidence === 'good' ? safeDecimal(asNumber(row.graph_liquidity_usd ?? row.liquidity_usd)) : null;
  const tvlWax = proof.tvl_confidence === 'good' ? safeDecimal(asNumber(row.tvl_wax)) : null;
  const tvlUsd = proof.tvl_confidence === 'good' ? safeDecimal(asNumber(row.tvl_usd)) : null;
  const bubbleLiquidityWax = proof.liquidity_confidence === 'good'
    ? safeDecimal(asNumber(row.bubble_liquidity_wax !== undefined ? row.bubble_liquidity_wax : row.liquidity_wax))
    : null;
  const bubbleLiquidityUsd = proof.liquidity_confidence === 'good'
    ? safeDecimal(asNumber(row.bubble_liquidity_usd !== undefined ? row.bubble_liquidity_usd : row.liquidity_usd))
    : null;
  const bubbleTvlWax = proof.tvl_confidence === 'good'
    ? safeDecimal(asNumber(row.bubble_tvl_wax !== undefined ? row.bubble_tvl_wax : row.tvl_wax))
    : null;
  const bubbleTvlUsd = proof.tvl_confidence === 'good'
    ? safeDecimal(asNumber(row.bubble_tvl_usd !== undefined ? row.bubble_tvl_usd : row.tvl_usd))
    : null;
  const marketCapLive = proof.metric_status?.market_cap?.live === true;
  const marketCapWax = marketCapLive ? safeDecimal(row.market_cap_wax) : null;
  const marketCapUsd = marketCapLive ? safeDecimal(row.market_cap_usd) : null;
  const selectedMetricValue = (() => {
    const change = asNumber(row.change_24h);
    if (change != null) return change;
    const trustedTvlUsd = asNumber(bubbleTvlUsd);
    if (trustedTvlUsd != null) return trustedTvlUsd;
    const trustedLiquidityUsd = asNumber(bubbleLiquidityUsd);
    if (trustedLiquidityUsd != null) return trustedLiquidityUsd;
    const volumeUsd = asNumber(row.volume_24h_usd);
    if (volumeUsd != null) return volumeUsd;
    return asNumber(priceUsd);
  })();
  return {
    token_key: tokenKeyValue,
    contract,
    symbol,
    price_wax: priceWax,
    price_usd: priceUsd,
    selected_price_wax: priceWax,
    selected_price_usd: priceUsd,
    change_24h: safeDecimal(asNumber(row.change_24h)),
    volume_24h_wax: safeDecimal(asNumber(row.volume_24h_wax ?? row.volume_24h)),
    volume_24h_usd: safeDecimal(asNumber(row.volume_24h_usd)),
    tvl_wax: tvlWax,
    tvl_usd: tvlUsd,
    liquidity_wax: liquidityWax,
    liquidity_usd: liquidityUsd,
    graph_liquidity_wax: graphLiquidityWax,
    graph_liquidity_usd: graphLiquidityUsd,
    bubble_liquidity_wax: bubbleLiquidityWax,
    bubble_liquidity_usd: bubbleLiquidityUsd,
    bubble_tvl_wax: bubbleTvlWax,
    bubble_tvl_usd: bubbleTvlUsd,
    direct_pair_liquidity_wax: proof.liquidity_confidence === 'good' ? safeDecimal(asNumber(row.direct_pair_liquidity_wax ?? row.liquidity_wax)) : null,
    direct_pair_liquidity_usd: proof.liquidity_confidence === 'good' ? safeDecimal(asNumber(row.direct_pair_liquidity_usd ?? row.liquidity_usd)) : null,
    direct_waxcash_pair_liquidity_wax: safeDecimal(asNumber(row.direct_waxcash_pair_liquidity_wax)),
    direct_wax_pair_liquidity_wax: safeDecimal(asNumber(row.direct_wax_pair_liquidity_wax)),
    suspicious_liquidity_pair_count: asNumber(row.suspicious_liquidity_pair_count),
    bubble_suspicious_liquidity_pair_count: asNumber(row.bubble_suspicious_liquidity_pair_count),
    market_cap_wax: marketCapWax,
    market_cap_usd: marketCapUsd,
    market_cap_rejection_reason: row.market_cap_rejection_reason || proof.metric_status?.market_cap?.reason || null,
    market_cap_confidence: marketCapLive ? 'good' : 'unavailable',
    selected_pair_source: row.selected_pair_source || null,
    selected_pair_id: row.selected_pair_id || null,
    selected_price_source: row.selected_price_source || row.selected_pair_source || null,
    selected_price_route: row.selected_price_route || row.selected_price_proof?.route_type || null,
    selected_price_rejection_reason: row.selected_price_rejection_reason || row.selected_price_proof?.rejection_reason || proof.metric_status?.selected_price?.reason || null,
    proof_status: proof.selected_price_confidence === 'good' && marketCapLive ? 'verified' : 'unavailable',
    selected_price_confidence: proof.selected_price_confidence,
    liquidity_confidence: proof.liquidity_confidence,
    tvl_confidence: proof.tvl_confidence,
    metric_status: proof.metric_status,
    metric_reason_codes: proof.metric_reason_codes,
    selected_metric_value: safeDecimal(selectedMetricValue),
    graph_depth: asNumber(row.graph_depth),
    visible_in_waxcash_bubbles: row.visible_in_waxcash_bubbles === true || row.visible_in_waxcash_bubbles === 1 || row.visible_in_waxcash_bubbles === '1',
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
  const search = safeString(options.search) || '';
  const limit = clampInteger(options.limit, LIVE_SNAPSHOT_TOKEN_LIMIT, 1, LIVE_SNAPSHOT_TOKEN_LIMIT);
  const graph = await loadWaxcashGraphTokenRows(db);
  const cursor = parsedCursor.cursor;
  const searchLower = search.toLowerCase();
  const searchSymbol = normalizeSymbol(search);
  function matchesSearch(row) {
    if (!search) return true;
    const contract = normalizeContract(row?.contract);
    const symbol = normalizeSymbol(row?.symbol);
    const key = tokenKey(contract, symbol);
    const searchText = safeString(row?.search_text).toLowerCase();
    return contract === searchLower ||
      symbol === searchSymbol ||
      key === searchLower ||
      contract.includes(searchLower) ||
      symbol.toLowerCase().includes(searchLower) ||
      key.includes(searchLower) ||
      searchText.includes(searchLower);
  }
  const orderedRows = (graph.tokenRows || []).slice().sort((a, b) => {
    const updatedCompare = String(a.updated_at || '').localeCompare(String(b.updated_at || ''));
    if (updatedCompare !== 0) return updatedCompare;
    return String(a.contract || '').localeCompare(String(b.contract || '')) ||
      String(a.symbol || '').localeCompare(String(b.symbol || ''));
  });
  const results = orderedRows.filter(matchesSearch).filter((row) => {
    const updatedAt = row.updated_at || '';
    const contract = normalizeContract(row.contract);
    const symbol = normalizeSymbol(row.symbol);
    if (cursor) {
      return updatedAt > cursor.updated_at ||
        (updatedAt === cursor.updated_at && contract > cursor.contract) ||
        (updatedAt === cursor.updated_at && contract === cursor.contract && symbol > cursor.symbol);
    }
    return parsedSince.since ? updatedAt > parsedSince.since : true;
  }).slice(0, limit);
  const lastRow = results[results.length - 1] || null;
  const reserveBackedRows = await deriveReserveBackedTokenRows(db, results, {
    pairRows: graph.pairRows,
    routeGraphRows: graph.pairRows,
    routeGraphLimit: 0,
  });
  return {
    tokens: sortWaxcashGraphTokens(reserveBackedRows).map(normalizeLiveTokenUpdate).filter(Boolean),
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
      search: query.get('search') || query.get('q'),
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

function encodeSseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseSseFrames(buffer) {
  const frames = [];
  let rest = String(buffer || '');
  for (;;) {
    const rn = rest.indexOf('\r\n\r\n');
    const nn = rest.indexOf('\n\n');
    const index = rn >= 0 && (nn < 0 || rn < nn) ? rn : nn;
    if (index < 0) break;
    const separatorLength = rest.slice(index, index + 4) === '\r\n\r\n' ? 4 : 2;
    frames.push(rest.slice(0, index));
    rest = rest.slice(index + separatorLength);
  }
  return { frames, rest };
}

function parseSseFrame(frame) {
  const lines = String(frame || '').split(/\r?\n/);
  let event = 'message';
  const data = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return { event, data: data.join('\n') };
}

function changedPairFromLiveEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const pair = payload.canonical_pair || payload.pair || payload;
  const source = aggregateSourceKey(pair.source || payload.source || payload.og_source || payload.stream_source);
  const pairId = safeString(pair.pair_id || payload.pair_id);
  const tokenAContract = normalizeContract(pair.token_a_contract);
  const tokenASymbol = normalizeSymbol(pair.token_a_symbol);
  const tokenBContract = normalizeContract(pair.token_b_contract);
  const tokenBSymbol = normalizeSymbol(pair.token_b_symbol);
  const reserveA = safeDecimal(asNumber(pair.reserve_a_decimal ?? pair.reserve_a));
  const reserveB = safeDecimal(asNumber(pair.reserve_b_decimal ?? pair.reserve_b));
  if (!source || !pairId || !tokenAContract || !tokenASymbol || !tokenBContract || !tokenBSymbol || reserveA == null || reserveB == null) {
    return null;
  }
  return {
    source,
    pair_id: pairId,
    token_a_contract: tokenAContract,
    token_a_symbol: tokenASymbol,
    token_b_contract: tokenBContract,
    token_b_symbol: tokenBSymbol,
    token_a_decimals: asNumber(pair.token_a_decimals),
    token_b_decimals: asNumber(pair.token_b_decimals),
    reserve_a: reserveA,
    reserve_b: reserveB,
    reserve_a_decimal: reserveA,
    reserve_b_decimal: reserveB,
    price: safeDecimal(asNumber(pair.price)),
    liquidity_wax: safeDecimal(asNumber(pair.liquidity_wax)),
    liquidity_usd: safeDecimal(asNumber(pair.liquidity_usd)),
    volume_24h: safeDecimal(asNumber(pair.volume_24h)),
    volume_24h_wax: safeDecimal(asNumber(pair.volume_24h_wax)),
    volume_24h_usd: safeDecimal(asNumber(pair.volume_24h_usd)),
    change_24h: safeDecimal(asNumber(pair.change_24h)),
    fee_bps: asNumber(pair.fee_bps),
    updated_at: pair.updated_at || payload.updated_at || payload.last_trade_at || payload.traded_at || nowIso(),
  };
}

async function handleLiveStream(corsHeaders, env = {}, fetchImpl = globalThis.fetch) {
  const baseUrl = waxonedgeLiveIndexerBaseUrl(env);
  if (!baseUrl || typeof fetchImpl !== 'function') {
    return waxonedgeJson({
      ok: false,
      unavailable: 'live stream requires configured WAXONEDGE_LIVE_INDEXER_URL',
      fallback: WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT,
      transport: 'snapshot-polling-fallback',
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event, data) => controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
      enqueue('heartbeat', {
        ok: true,
        source: 'moonboys-api/waxonedge-live-stream',
        transport: 'worker-sse-proxy',
        generated_at: nowIso(),
        uses_fake_live_data: false,
        browser_hyperion_fetch: false,
      });
      try {
        const headers = { Accept: 'text/event-stream' };
        const secret = String(env?.WAXONEDGE_LIVE_SHARED_SECRET || '').trim();
        if (secret) headers[WAXONEDGE_LIVE_SECRET_HEADER] = secret;
        const upstream = await fetchImpl(`${baseUrl}/stream`, {
          method: 'GET',
          headers,
          redirect: 'manual',
        });
        if (!upstream.ok || !upstream.body) {
          enqueue('error', {
            ok: false,
            error: 'live indexer stream unavailable',
            status: upstream.status,
            fallback: WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT,
            uses_fake_live_data: false,
          });
          controller.close();
          return;
        }
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseFrames(buffer);
          buffer = parsed.rest;
          for (const frame of parsed.frames) {
            const event = parseSseFrame(frame);
            if (event.event === 'heartbeat') {
              let data = {};
              try { data = event.data ? JSON.parse(event.data) : {}; } catch (_) {}
              enqueue('heartbeat', {
                ...data,
                source: 'moonboys-api/waxonedge-live-stream',
                transport: 'worker-sse-proxy',
                uses_fake_live_data: false,
                browser_hyperion_fetch: false,
              });
              continue;
            }
            if (event.event !== 'token_update') continue;
            let payload = null;
            try {
              payload = event.data ? JSON.parse(event.data) : null;
            } catch (_) {
              continue;
            }
            const changedPair = changedPairFromLiveEvent(payload);
            if (!changedPair) continue;
            const updates = await buildInstantLiveTokenUpdatesForPair(env.DB, changedPair, {
              updatedAt: payload.updated_at || payload.last_trade_at || payload.traded_at || nowIso(),
            });
            for (const update of updates) enqueue('token_update', update);
          }
        }
        controller.close();
      } catch (error) {
        enqueue('error', {
          ok: false,
          error: 'live stream transform failed',
          diagnostic: safeString(error?.message || error),
          fallback: WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT,
          uses_fake_live_data: false,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

async function listTopPairs(db) {
  const rows = await db.prepare(
    `SELECT source, pair_id, og_laststats_pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
     FROM waxonedge_pairs
     ORDER BY CAST(COALESCE(volume_24h_wax, '0') AS NUMERIC) DESC, updated_at DESC
     LIMIT 250`
  ).all();
  return rows.results || [];
}

async function listTokenPairs(db, contract, symbol, options = {}) {
  const limit = clampInteger(options.limit, TOKEN_PAIR_PAGE_LIMIT, 1, TOKEN_PAIR_MAX_PAGE_LIMIT);
  const offset = clampInteger(options.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
  const rows = await db.prepare(
    `SELECT source, pair_id, og_laststats_pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
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

const WAXCASH_CHART_PRICE_RANGE_FACTOR = 25;

function waxcashCandleOhlc(candle) {
  return ['open', 'high', 'low', 'close'].map((field) => asNumber(candle?.[field]));
}

function waxcashCandleRangeReason(candle, selectedPriceWax) {
  const values = waxcashCandleOhlc(candle);
  if (values.some((value) => value == null || value <= 0)) return 'invalid_ohlc';
  const [open, high, low, close] = values;
  if (high < low || high < open || high < close || low > open || low > close) return 'invalid_ohlc_range';
  if (selectedPriceWax == null || selectedPriceWax <= 0) return null;
  const minAllowed = selectedPriceWax / WAXCASH_CHART_PRICE_RANGE_FACTOR;
  const maxAllowed = selectedPriceWax * WAXCASH_CHART_PRICE_RANGE_FACTOR;
  if (values.some((value) => value < minAllowed || value > maxAllowed)) return 'ohlc_outside_selected_price_range';
  return null;
}

function normalizeWaxcashWaxCandle(candle, options = {}) {
  const selectedPriceWax = asNumber(options.selectedPriceWax);
  const close = asNumber(candle?.close);
  if (close == null || close <= 0) {
    return {
      candle: null,
      status: 'rejected',
      reason: 'invalid_close',
    };
  }
  if (selectedPriceWax == null || selectedPriceWax <= 0) {
    return {
      candle: { ...candle, price_unit: 'WAX_per_WAXCASH', normalized_direction: 'unverified_raw' },
      status: 'raw',
      reason: 'selected_price_unavailable',
    };
  }
  const reciprocalClose = 1 / close;
  const directDistance = Math.abs(Math.log(close / selectedPriceWax));
  const inverseDistance = Math.abs(Math.log(reciprocalClose / selectedPriceWax));
  if (inverseDistance < directDistance) {
    const reversed = reverseStoredCandle(candle);
    const reversedReason = waxcashCandleRangeReason(reversed, selectedPriceWax);
    if (reversedReason) {
      return {
        candle: null,
        status: 'rejected',
        reason: reversedReason,
      };
    }
    return {
      candle: { ...reversed, price_unit: 'WAX_per_WAXCASH', normalized_direction: 'inverted_from_WAXCASH_per_WAX' },
      status: 'inverted',
      reason: null,
    };
  }
  const directReason = waxcashCandleRangeReason(candle, selectedPriceWax);
  if (directReason) {
    return {
      candle: null,
      status: 'rejected',
      reason: directReason,
    };
  }
  return {
    candle: { ...candle, price_unit: 'WAX_per_WAXCASH', normalized_direction: 'already_WAX_per_WAXCASH' },
    status: 'accepted',
    reason: null,
  };
}

function normalizeWaxcashWaxCandles(candles = [], options = {}) {
  const summary = {
    price_unit: 'WAX_per_WAXCASH',
    selected_price_wax: safeDecimal(asNumber(options.selectedPriceWax)),
    accepted_count: 0,
    inverted_count: 0,
    rejected_count: 0,
    rejection_reasons: {},
  };
  const normalized = [];
  for (const candle of candles || []) {
    const result = normalizeWaxcashWaxCandle(candle, options);
    if (result.status === 'accepted' || result.status === 'raw') summary.accepted_count += 1;
    if (result.status === 'inverted') summary.inverted_count += 1;
    if (result.status === 'rejected') {
      summary.rejected_count += 1;
      summary.rejection_reasons[result.reason || 'unknown'] = (summary.rejection_reasons[result.reason || 'unknown'] || 0) + 1;
    }
    if (result.candle) normalized.push(result.candle);
  }
  return { candles: normalized, summary };
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

function buildDbTokenIconIndex(rows) {
  const index = new Map();
  for (const row of rows || []) {
    const key = tokenKey(row.contract, row.symbol);
    const icon = safeString(row.icon_url || row.logo || row.image);
    if (key && icon) index.set(key, icon);
  }
  return index;
}

function enrichPairsWithTokenIcons(pairRows = [], tokenRows = []) {
  const icons = buildDbTokenIconIndex(tokenRows);
  return (pairRows || []).map((pair) => ({
    ...pair,
    token_a_icon: icons.get(tokenKey(pair.token_a_contract, pair.token_a_symbol)) || null,
    token_b_icon: icons.get(tokenKey(pair.token_b_contract, pair.token_b_symbol)) || null,
  }));
}

function collectTokenRefsForPairs(pairRows = []) {
  const refs = new Map();
  function add(contract, symbol) {
    const ref = tokenRef(contract, symbol);
    if (ref?.key && !refs.has(ref.key)) refs.set(ref.key, ref);
  }
  for (const pair of pairRows || []) {
    add(pair.token_a_contract, pair.token_a_symbol);
    add(pair.token_b_contract, pair.token_b_symbol);
  }
  return Array.from(refs.values());
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
  const source = aggregateSourceKey(pair?.source);
  if (source === 'swap.alcor') return null;
  const reserveA = asNumber(pair?.reserve_a);
  const reserveB = asNumber(pair?.reserve_b);
  if (reserveA != null && reserveA > 0 && reserveB != null && reserveB > 0) {
    return reserveB / reserveA;
  }
  const sourcePrice = asNumber(pair?.price);
  if (sourcePrice != null && sourcePrice > 0) return sourcePrice;
  return null;
}

function ogRouteHop(pair, fromKey, toKey, priceFromTo, reserveFrom, reserveTo) {
  return {
    source: pair.source || null,
    pair_id: pair.pair_id || null,
    og_laststats_pair_id: pair.og_laststats_pair_id || null,
    from: fromKey,
    to: toKey,
    price_from_to: safeDecimal(priceFromTo),
    reserve_from: safeDecimal(reserveFrom),
    reserve_to: safeDecimal(reserveTo),
  };
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
      const better = !existing ||
        routeLiquidityScore > existing.route_liquidity_score ||
        (routeLiquidityScore === existing.route_liquidity_score && routeHops.length < existing.route_hops.length);
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

function routeHops(route) {
  return Array.isArray(route?.route_hops) ? route.route_hops : [];
}

function routeHopUsesPair(hop, pair) {
  if (!hop || !pair) return false;
  const hopSource = aggregateSourceKey(hop.source);
  const pairSource = aggregateSourceKey(pair.source);
  const hopPairId = safeString(hop.pair_id);
  const pairId = safeString(pair.pair_id);
  if (hopSource && pairSource && hopPairId && pairId) {
    return hopSource === pairSource && hopPairId === pairId;
  }
  return false;
}

function routeTouchesToken(route, tokenKeyValue) {
  if (!tokenKeyValue) return false;
  return routeHops(route).some((hop) => hop.from === tokenKeyValue || hop.to === tokenKeyValue);
}

function routeUsesPair(route, pair) {
  return routeHops(route).some((hop) => routeHopUsesPair(hop, pair));
}

function isWaxTokenKey(key) {
  return key === tokenKey('eosio.token', 'WAX');
}

function cleanQuoteRouteForCandidate(route, pair, selectedTokenKey, quoteKey) {
  if (!route) return { ok: false, reason: 'quote_route_unavailable' };
  const quoteRouteKey = route.token_key || quoteKey;
  if (quoteRouteKey !== quoteKey) return { ok: false, reason: 'quote_route_token_mismatch' };
  const hops = routeHops(route);
  if (!isWaxTokenKey(quoteKey) && !hops.length) return { ok: false, reason: 'quote_route_missing_wax_proof' };
  if (routeTouchesToken(route, selectedTokenKey)) return { ok: false, reason: 'quote_route_touches_selected_token' };
  if (routeUsesPair(route, pair)) return { ok: false, reason: 'quote_route_reuses_candidate_pair' };
  if (hops.some((hop) => !hop.from || !hop.to || !hop.source || !hop.pair_id)) {
    return { ok: false, reason: 'quote_route_incomplete_hop_proof' };
  }
  const routePriceWax = asNumber(route.priceWax);
  if (routePriceWax == null || routePriceWax <= 0 || !Number.isFinite(routePriceWax)) {
    return { ok: false, reason: 'quote_route_invalid_wax_price' };
  }
  return { ok: true, reason: null };
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

function pairPriceCandidateForToken(pair, contract, symbol, priceIndex, routeIndex = null, rejectionReasons = null) {
  const reject = (reason) => {
    if (Array.isArray(rejectionReasons) && reason) rejectionReasons.push(reason);
    return null;
  };
  if (aggregateSourceKey(pair?.source) === 'swap.alcor') return reject('adapter_unavailable_for_selected_price');
  const side = pairTokenSide(pair, contract, symbol);
  if (!side) return reject('token_not_in_pair');
  if (!hasRealPairReserves(pair)) return reject('missing_or_zero_reserves');
  const reserveA = asNumber(pair.reserve_a);
  const reserveB = asNumber(pair.reserve_b);
  const reserveToken = side.side === 'a' ? reserveA : reserveB;
  const reserveQuote = side.side === 'a' ? reserveB : reserveA;
  if (reserveToken == null || reserveToken <= 0 || reserveQuote == null || reserveQuote <= 0) return reject('invalid_reserve_ratio');
  const quoteContract = side.side === 'a' ? pair.token_b_contract : pair.token_a_contract;
  const quoteSymbol = side.side === 'a' ? pair.token_b_symbol : pair.token_a_symbol;
  const quoteKey = tokenKey(quoteContract, quoteSymbol);
  const selectedTokenKey = tokenKey(contract, symbol);
  if (!quoteKey || !selectedTokenKey) return reject('invalid_token_identity');
  const hopPriceFromTo = reserveQuote / reserveToken;
  if (hopPriceFromTo == null || hopPriceFromTo <= 0 || !Number.isFinite(hopPriceFromTo)) return reject('invalid_reserve_ratio');
  const quoteRoute = isWaxToken(quoteContract, quoteSymbol)
    ? { priceWax: 1, priceUsd: priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd }
    : (routeIndex?.get(quoteKey) || priceIndex.get(quoteKey));
  const routeProof = isWaxToken(quoteContract, quoteSymbol)
    ? { ok: true, reason: null }
    : cleanQuoteRouteForCandidate(quoteRoute, pair, selectedTokenKey, quoteKey);
  if (!routeProof.ok) return reject(routeProof.reason);
  const quotePriceWax = asNumber(quoteRoute?.priceWax);
  if (quotePriceWax == null || quotePriceWax <= 0) return reject('quote_route_invalid_wax_price');
  const priceWax = (reserveQuote * quotePriceWax) / reserveToken;
  if (priceWax == null || priceWax <= 0 || !Number.isFinite(priceWax)) return reject('invalid_selected_price');
  const valuation = ogPairReserveValuation(pair, contract, symbol, priceIndex, routeIndex);
  const liquidityWax = asNumber(valuation.contribution_wax);
  if (liquidityWax == null || liquidityWax < MIN_TRUSTED_WAX_LIQUIDITY) return reject('below_minimum_verified_liquidity');
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  return {
    pair,
    priceWax,
    priceUsd: waxUsd != null ? priceWax * waxUsd : null,
    liquidityWax,
    source: pair.source || null,
    pair_id: pair.pair_id || null,
    fromKey: tokenKey(contract, symbol),
    quoteKey,
    hopPriceFromTo,
    quoteRouteType: quoteRoute?.route_type || null,
    quoteRouteHops: routeHops(quoteRoute),
  };
}

function pairIdentityMatches(pair, target) {
  if (!pair || !target) return false;
  const source = aggregateSourceKey(pair.source);
  const targetSource = aggregateSourceKey(target.source);
  const pairId = safeString(pair.pair_id);
  const targetPairId = safeString(target.pair_id);
  if (source && targetSource && pairId && targetPairId) {
    return source === targetSource && pairId === targetPairId;
  }
  return graphPairKey(pair) === graphPairKey(target);
}

function selectedProofUsesPair(metrics, changedPair) {
  const hops = Array.isArray(metrics?.selected_price_proof?.route_hops)
    ? metrics.selected_price_proof.route_hops
    : [];
  return hops.some((hop) => pairIdentityMatches({
    source: hop.source,
    pair_id: hop.pair_id,
    token_a_contract: hop.from_contract,
    token_a_symbol: hop.from_symbol,
    token_b_contract: hop.to_contract,
    token_b_symbol: hop.to_symbol,
  }, changedPair));
}

function selectedProofTouchesToken(metrics, tokenKeys = []) {
  const keys = new Set((tokenKeys || []).filter(Boolean));
  if (!keys.size) return false;
  const hops = Array.isArray(metrics?.selected_price_proof?.route_hops)
    ? metrics.selected_price_proof.route_hops
    : [];
  return hops.some((hop) =>
    keys.has(safeString(hop.from)) ||
    keys.has(safeString(hop.to)) ||
    keys.has(tokenKey(hop.from_contract, hop.from_symbol)) ||
    keys.has(tokenKey(hop.to_contract, hop.to_symbol))
  );
}

function instantLiveTokenUpdatesForVerifiedPairEvent({ changedPair, tokenRows = [], pairRows = [], priceRows = [], updatedAt = null } = {}) {
  if (!changedPair) return [];
  const changed = (pairRows || []).find((pair) => pairIdentityMatches(pair, changedPair)) || changedPair;
  if (!hasRealPairReserves(changed)) return [];
  const graphRows = dedupePairRows(pairRows);
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const routeIndex = buildOgWaxRouteGraph(graphRows, priceIndex);
  const changedTokenKeys = [
    tokenKey(changed.token_a_contract, changed.token_a_symbol),
    tokenKey(changed.token_b_contract, changed.token_b_symbol),
  ].filter(Boolean);
  const pairsByToken = new Map();
  for (const pair of graphRows) {
    for (const key of [
      tokenKey(pair.token_a_contract, pair.token_a_symbol),
      tokenKey(pair.token_b_contract, pair.token_b_symbol),
    ]) {
      if (!key) continue;
      if (!pairsByToken.has(key)) pairsByToken.set(key, []);
      pairsByToken.get(key).push(pair);
    }
  }
  return (tokenRows || [])
    .map((row) => {
      const contract = normalizeContract(row?.contract);
      const symbol = normalizeSymbol(row?.symbol);
      const key = tokenKey(contract, symbol);
      if (!key) return null;
      const metrics = deriveTokenPairMetrics(
        { ...(row || {}), contract, symbol },
        { ...(row || {}), contract, symbol },
        pairsByToken.get(key) || [],
        priceRows,
        graphRows,
        { routeIndex },
      );
      const isDirectlyAffected = changedTokenKeys.includes(key);
      const isDependent = selectedProofUsesPair(metrics, changed) || selectedProofTouchesToken(metrics, changedTokenKeys);
      if (!isDirectlyAffected && !isDependent) return null;
      return normalizeLiveTokenUpdate({
        ...metrics,
        updated_at: updatedAt || changed.updated_at || metrics.updated_at || nowIso(),
        stats_updated_at: updatedAt || changed.updated_at || metrics.stats_updated_at || metrics.updated_at || nowIso(),
      });
    })
    .filter(Boolean);
}

async function buildInstantLiveTokenUpdatesForPair(db, changedPair, options = {}) {
  if (!db || !changedPair) return [];
  const graph = await loadWaxcashGraphTokenRows(db, options.graph || {});
  const existing = (graph.pairRows || []).find((pair) => pairIdentityMatches(pair, changedPair)) || {};
  const changed = { ...existing, ...changedPair };
  const pairRows = dedupePairRows((graph.pairRows || []).map((pair) =>
    pairIdentityMatches(pair, changed) ? { ...pair, ...changed } : pair
  ));
  if (!(graph.pairRows || []).some((pair) => pairIdentityMatches(pair, changed))) pairRows.push(changed);
  const tokenRows = graph.tokenRows || [];
  const priceRows = await loadTokenPriceRowsForPairs(db, pairRows);
  return instantLiveTokenUpdatesForVerifiedPairEvent({
    changedPair: changed,
    tokenRows,
    pairRows,
    priceRows,
    updatedAt: options.updatedAt || changed.updated_at || nowIso(),
  });
}

function medianNumber(values) {
  const sorted = values.filter((value) => value != null && Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function selectLiquidityWeightedMedianPrice(contract, symbol, pairRows, priceIndex, routeIndex = null) {
  if (isWaxToken(contract, symbol)) {
    const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
    return {
      priceWax: 1,
      priceUsd: waxUsd ?? null,
      source: 'eosio.token',
      pair_id: null,
      route_type: 'wax_self',
      route_hops: [],
      route_liquidity_score: Number.POSITIVE_INFINITY,
    };
  }
  const rejectionReasons = [];
  const candidates = (pairRows || [])
    .map((pair) => pairPriceCandidateForToken(pair, contract, symbol, priceIndex, routeIndex, rejectionReasons))
    .filter(Boolean);
  const selectedPriceRejectionReason = Array.from(new Set(rejectionReasons)).filter(Boolean).join(',') || 'no_verified_price_candidate';
  if (!candidates.length) {
    return {
      priceWax: null,
      priceUsd: null,
      source: null,
      pair_id: null,
      route_type: 'unavailable',
      route_hops: [],
      route_liquidity_score: null,
      candidate_count: 0,
      rejection_reason: selectedPriceRejectionReason,
    };
  }
  const median = medianNumber(candidates.map((candidate) => candidate.priceWax));
  const filtered = median == null ? candidates : candidates.filter((candidate) =>
    candidate.priceWax > 0 &&
    candidate.priceWax >= median / 100 &&
    candidate.priceWax <= median * 100
  );
  if (!filtered.length) {
    return {
      priceWax: null,
      priceUsd: null,
      source: null,
      pair_id: null,
      route_type: 'unavailable',
      route_hops: [],
      route_liquidity_score: null,
      candidate_count: candidates.length,
      rejection_reason: 'all_candidates_rejected_as_outliers',
    };
  }
  const sorted = filtered.slice().sort((a, b) => a.priceWax - b.priceWax);
  const totalWeight = sorted.reduce((sum, candidate) => sum + Math.max(0, candidate.liquidityWax || 0), 0);
  const midpoint = totalWeight / 2;
  let running = 0;
  let selected = sorted[sorted.length - 1];
  for (const candidate of sorted) {
    running += Math.max(0, candidate.liquidityWax || 0);
    if (running >= midpoint) {
      selected = candidate;
      break;
    }
  }
  return {
    priceWax: selected.priceWax,
    priceUsd: selected.priceUsd,
    source: selected.source,
    pair_id: selected.pair_id,
    route_type: 'liquidity_weighted_median_verified_pair',
    route_hops: [{
      source: selected.source,
      pair_id: selected.pair_id,
      from: selected.fromKey,
      to: selected.quoteKey,
      price_from_to: safeDecimal(selected.hopPriceFromTo),
      selected_price_wax: safeDecimal(selected.priceWax),
      reserve_from: null,
      reserve_to: null,
    }],
    route_liquidity_score: selected.liquidityWax,
    candidate_count: filtered.length,
    rejection_reason: null,
  };
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

const WAXCASH_CONTRACT = 'graffitiking';
const WAXCASH_SYMBOL = 'WAXCASH';
const WAXCASH_KEY = tokenKey(WAXCASH_CONTRACT, WAXCASH_SYMBOL);
const WAXCASH_GRAPH_ROUTE_CONCURRENCY = 8;
const WAXCASH_MARKET_GRAPH_DEFAULT_DEPTH = 2;
const WAXCASH_MARKET_GRAPH_MAX_DEPTH = 4;
const WAXCASH_MARKET_GRAPH_MIN_EXPAND_LIQUIDITY_WAX = 1;

function isWaxcashToken(contract, symbol) {
  return tokenKey(contract, symbol) === WAXCASH_KEY;
}

function tokenRef(contract, symbol) {
  return {
    contract: normalizeContract(contract),
    symbol: normalizeSymbol(symbol),
    key: tokenKey(contract, symbol),
  };
}

function mergeWaxcashGraphTokenMeta(meta, token, pair) {
  if (!token?.key) return;
  const existing = meta.get(token.key) || {
    contract: token.contract,
    symbol: token.symbol,
    key: token.key,
    pair_count: 0,
    source_keys: new Set(),
    search_terms: new Set(),
    updated_at: null,
  };
  existing.pair_count += 1;
  if (pair?.source) existing.source_keys.add(aggregateSourceKey(pair.source));
  for (const term of [
    pair?.pair_id,
    pair?.source,
    pair?.token_a_contract,
    pair?.token_a_symbol,
    pair?.token_b_contract,
    pair?.token_b_symbol,
  ]) {
    const text = safeString(term).toLowerCase();
    if (text) existing.search_terms.add(text);
  }
  if (!existing.updated_at || String(pair?.updated_at || '') > existing.updated_at) {
    existing.updated_at = pair?.updated_at || existing.updated_at;
  }
  meta.set(token.key, existing);
}

function graphPairKey(pair) {
  return [
    pair?.source || '',
    pair?.pair_id || '',
    pair?.token_a_contract || '',
    pair?.token_a_symbol || '',
    pair?.token_b_contract || '',
    pair?.token_b_symbol || '',
  ].join('::');
}

function pairGraphLiquidityWax(pair) {
  const stored = asNumber(pair?.liquidity_wax);
  if (stored != null && stored >= 0) return stored;
  const waxReserve = waxReserveForPair(pair);
  if (waxReserve != null && waxReserve > 0) return waxReserve * 2;
  return null;
}

function pairPassesGraphExpansionThreshold(pair, minLiquidityWax = WAXCASH_MARKET_GRAPH_MIN_EXPAND_LIQUIDITY_WAX) {
  if (!hasRealPairReserves(pair)) return false;
  const threshold = asNumber(minLiquidityWax) ?? WAXCASH_MARKET_GRAPH_MIN_EXPAND_LIQUIDITY_WAX;
  const liquidityWax = pairGraphLiquidityWax(pair);
  return liquidityWax != null && liquidityWax >= threshold;
}

function waxReserveForPair(pair) {
  if (isWaxToken(pair?.token_a_contract, pair?.token_a_symbol)) return asNumber(pair.reserve_a);
  if (isWaxToken(pair?.token_b_contract, pair?.token_b_symbol)) return asNumber(pair.reserve_b);
  return null;
}

function pairTouchesToken(pair, token) {
  return !!token?.key && !!pairTokenSide(pair, token.contract, token.symbol);
}

function enrichWaxcashGraphTokenRows(tokenRows = [], tokenMeta = new Map()) {
  const rowsByKey = new Map();
  for (const row of tokenRows || []) {
    const key = tokenKey(row?.contract, row?.symbol);
    if (key) rowsByKey.set(key, row);
  }
  return Array.from(tokenMeta.values()).map((meta) => {
    const row = rowsByKey.get(meta.key) || {};
    const existingSourceKeys = parseSourceKeys(row.source_keys);
    const sourceKeys = Array.from(new Set(existingSourceKeys.concat(Array.from(meta.source_keys || [])))).filter(Boolean);
    return {
      ...row,
      contract: meta.contract,
      symbol: meta.symbol,
      pair_count: meta.pair_count,
      indexed_pair_count: meta.pair_count,
      source_count: sourceKeys.length,
      source_keys: sourceKeys.join(','),
      search_text: Array.from(meta.search_terms || []).join(' '),
      visible_in_waxcash_bubbles: row.visible_in_waxcash_bubbles,
      updated_at: row.stats_updated_at || row.updated_at || meta.updated_at,
    };
  });
}

async function loadWaxcashGraphTokenRows(db, options = {}) {
  const maxDepth = clampInteger(
    options.maxDepth,
    WAXCASH_MARKET_GRAPH_DEFAULT_DEPTH,
    0,
    WAXCASH_MARKET_GRAPH_MAX_DEPTH,
  );
  const minExpandLiquidityWax = asNumber(options.minExpandLiquidityWax) ?? WAXCASH_MARKET_GRAPH_MIN_EXPAND_LIQUIDITY_WAX;
  const waxcashPairs = await loadWaxcashOgPairRows(db);
  const tokenMeta = new Map();
  const graphPairs = new Map();
  const tokenDepth = new Map();
  const waxcashRef = tokenRef(WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  if (waxcashRef.key) {
    tokenDepth.set(waxcashRef.key, 0);
    tokenMeta.set(waxcashRef.key, {
      ...waxcashRef,
      pair_count: 0,
      source_keys: new Set(),
      search_terms: new Set(),
      updated_at: null,
    });
  }
  const pairedTokens = [];
  for (const pair of waxcashPairs || []) {
    graphPairs.set(graphPairKey(pair), pair);
    const paired = otherTokenForPair(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
    if (!paired?.key) continue;
    mergeWaxcashGraphTokenMeta(tokenMeta, waxcashRef, pair);
    mergeWaxcashGraphTokenMeta(tokenMeta, paired, pair);
    if (!tokenDepth.has(paired.key)) tokenDepth.set(paired.key, 1);
    if (!pairedTokens.some((token) => token.key === paired.key)) pairedTokens.push(paired);
  }
  let frontier = pairedTokens.filter((token) => token?.key && !isWaxToken(token.contract, token.symbol));
  for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1) {
    const nextFrontierByKey = new Map();
    for (let index = 0; index < frontier.length; index += WAXCASH_GRAPH_ROUTE_CONCURRENCY) {
      const batch = frontier.slice(index, index + WAXCASH_GRAPH_ROUTE_CONCURRENCY);
      const batchRows = await Promise.all(batch.map((token) => loadPairRowsForToken(db, token.contract, token.symbol)));
      for (const rows of batchRows) {
        for (const pair of rows || []) {
          const pairKey = graphPairKey(pair);
          if (!graphPairs.has(pairKey)) graphPairs.set(pairKey, pair);
          const tokenA = tokenRef(pair.token_a_contract, pair.token_a_symbol);
          const tokenB = tokenRef(pair.token_b_contract, pair.token_b_symbol);
          mergeWaxcashGraphTokenMeta(tokenMeta, tokenA, pair);
          mergeWaxcashGraphTokenMeta(tokenMeta, tokenB, pair);
          for (const token of [tokenA, tokenB]) {
            if (!token?.key || isWaxToken(token.contract, token.symbol)) continue;
            if (!tokenDepth.has(token.key)) tokenDepth.set(token.key, depth + 1);
            if (depth < maxDepth &&
                !frontier.some((item) => item.key === token.key) &&
                pairPassesGraphExpansionThreshold(pair, minExpandLiquidityWax)) {
              nextFrontierByKey.set(token.key, token);
            }
          }
        }
      }
    }
    frontier = Array.from(nextFrontierByKey.values())
      .filter((token) => token?.key && !isWaxcashToken(token.contract, token.symbol));
  }
  const tokenRows = await loadTokenRowsForRefs(db, Array.from(tokenMeta.values()));
  const pairRows = dedupePairRows(Array.from(graphPairs.values()));
  const routeGraphRows = pairRows.filter((pair) => !pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL));
  return {
    tokenRows: enrichWaxcashGraphTokenRows(tokenRows, tokenMeta).map((row) => ({
      ...row,
      graph_depth: tokenDepth.get(tokenKey(row.contract, row.symbol)) ?? null,
      visible_in_waxcash_bubbles: (tokenDepth.get(tokenKey(row.contract, row.symbol)) ?? Number.POSITIVE_INFINITY) <= 1,
    })),
    pairRows,
    waxcashPairs: waxcashPairs || [],
    routeGraphRows: dedupePairRows(routeGraphRows),
    graph_config: {
      root: WAXCASH_KEY,
      max_depth: maxDepth,
      default_depth: WAXCASH_MARKET_GRAPH_DEFAULT_DEPTH,
      max_allowed_depth: WAXCASH_MARKET_GRAPH_MAX_DEPTH,
      min_expand_liquidity_wax: safeDecimal(minExpandLiquidityWax),
    },
  };
}

function waxcashGraphMetricScore(token) {
  return asNumber(token?.tvl_wax) ??
    asNumber(token?.liquidity_wax) ??
    asNumber(token?.volume_24h_wax) ??
    asNumber(token?.selected_price_wax) ??
    0;
}

function sortWaxcashGraphTokens(tokens = []) {
  return (tokens || []).slice().sort((a, b) => {
    const aWaxcash = isWaxcashToken(a?.contract, a?.symbol);
    const bWaxcash = isWaxcashToken(b?.contract, b?.symbol);
    if (aWaxcash !== bWaxcash) return aWaxcash ? -1 : 1;
    const aValued = tokenMetricProof(a).selected_price_confidence === 'good';
    const bValued = tokenMetricProof(b).selected_price_confidence === 'good';
    if (aValued !== bValued) return aValued ? -1 : 1;
    const scoreDelta = waxcashGraphMetricScore(b) - waxcashGraphMetricScore(a);
    if (Number.isFinite(scoreDelta) && scoreDelta !== 0) return scoreDelta;
    return String(a?.symbol || '').localeCompare(String(b?.symbol || '')) ||
      String(a?.contract || '').localeCompare(String(b?.contract || ''));
  });
}

function otherTokenForPair(pair, contract, symbol) {
  const side = pairTokenSide(pair, contract, symbol);
  if (!side) return null;
  return side.side === 'a'
    ? tokenRef(pair.token_b_contract, pair.token_b_symbol)
    : tokenRef(pair.token_a_contract, pair.token_a_symbol);
}

function waxSideReserveForToken(pair, contract, symbol) {
  const side = pairTokenSide(pair, contract, symbol);
  if (!side || !hasWaxQuoteForToken(pair, contract, symbol) || !hasRealPairReserves(pair)) return null;
  return side.side === 'a' ? asNumber(pair.reserve_b) : asNumber(pair.reserve_a);
}

function tokenSideReserveForToken(pair, contract, symbol) {
  const side = pairTokenSide(pair, contract, symbol);
  if (!side || !hasRealPairReserves(pair)) return null;
  return side.side === 'a' ? asNumber(pair.reserve_a) : asNumber(pair.reserve_b);
}

function ogDirectWaxTokenPrice(contract, symbol, directWaxPairs = [], priceIndex = new Map()) {
  if (isWaxToken(contract, symbol)) {
    const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
    return {
      price_wax: safeDecimal(1),
      price_usd: safeDecimal(waxUsd),
      source: 'eosio.token',
      pair_id: null,
      pair_label: 'WAX = 1',
      wax_reserve: null,
      token_reserve: null,
      updated_at: null,
      reason_codes: [],
    };
  }
  const candidates = (directWaxPairs || [])
    .filter((pair) => pairTokenSide(pair, contract, symbol))
    .filter((pair) => hasWaxQuoteForToken(pair, contract, symbol));
  let selected = null;
  for (const pair of candidates) {
    const waxReserve = waxSideReserveForToken(pair, contract, symbol);
    const tokenReserve = tokenSideReserveForToken(pair, contract, symbol);
    if (waxReserve == null || waxReserve <= OG_DIRECT_WAX_PRICE_MIN_WAX_LIQUIDITY || tokenReserve == null || tokenReserve <= 0) continue;
    if (!selected || waxReserve > selected.waxReserve) {
      selected = { pair, waxReserve, tokenReserve };
    }
  }
  if (!selected) {
    return {
      price_wax: null,
      price_usd: null,
      source: null,
      pair_id: null,
      pair_label: null,
      wax_reserve: null,
      token_reserve: null,
      updated_at: null,
      reason_codes: candidates.length ? ['no_direct_wax_pool_above_100_wax'] : ['no_direct_wax_pool'],
    };
  }
  const priceWax = selected.waxReserve / selected.tokenReserve;
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  return {
    price_wax: safeDecimal(priceWax),
    price_usd: waxUsd != null ? safeDecimal(priceWax * waxUsd) : null,
    source: selected.pair.source || null,
    pair_id: selected.pair.pair_id || null,
    pair_label: selectedPairLabel(selected.pair),
    wax_reserve: safeDecimal(selected.waxReserve),
    token_reserve: safeDecimal(selected.tokenReserve),
    formula: 'price_wax = wax_reserve / token_reserve',
    updated_at: selected.pair.updated_at || null,
    reason_codes: [],
  };
}

function hasPoolV3GetPriceProof(pair) {
  const proofStatus = String(pair?.proof_status || pair?.price_proof_status || '').toLowerCase();
  const valuationBasis = String(pair?.valuation_basis || pair?.price_valuation_basis || pair?.price_basis || '').toLowerCase();
  const priceSource = String(pair?.price_source || pair?.v3_price_source || '').toLowerCase();
  if (proofStatus !== 'verified') return false;
  return (
    valuationBasis.includes('poolv3_getprice') ||
    valuationBasis.includes('pool_v3_getprice') ||
    valuationBasis.includes('alcor_v3_pool_price') ||
    priceSource.includes('poolv3_getprice') ||
    priceSource.includes('pool_v3_getprice')
  );
}

function poolV3PriceForPair(pair) {
  return asNumber(pair?.poolv3_price ?? pair?.pool_v3_price ?? pair?.v3_pool_price ?? pair?.price);
}

function ogV3DirectWaxTokenPrice(contract, symbol, directWaxPairs = [], priceIndex = new Map()) {
  const candidates = (directWaxPairs || [])
    .filter((pair) => pairTokenSide(pair, contract, symbol))
    .filter((pair) => hasWaxQuoteForToken(pair, contract, symbol));
  let selected = null;
  const rejectedReasonCounts = {};
  for (const pair of candidates) {
    const waxReserve = waxSideReserveForToken(pair, contract, symbol);
    const tokenReserve = tokenSideReserveForToken(pair, contract, symbol);
    const poolPrice = poolV3PriceForPair(pair);
    const reasonCodes = [];
    if (!hasPoolV3GetPriceProof(pair)) reasonCodes.push('v3_poolv3_getprice_proof_unavailable');
    if (poolPrice == null || poolPrice <= 0) reasonCodes.push('v3_poolv3_getprice_value_unavailable');
    if (reasonCodes.length) {
      for (const code of reasonCodes) rejectedReasonCounts[code] = (rejectedReasonCounts[code] || 0) + 1;
      continue;
    }
    const waxSide = pairTokenSide(pair, 'eosio.token', 'WAX');
    if (!waxSide) continue;
    const priceWax = waxSide.side === 'a' ? 1 / poolPrice : poolPrice;
    const depthScore = waxReserve ?? asNumber(pair.liquidity_wax) ?? 0;
    if (!selected || depthScore > selected.depthScore) {
      selected = { pair, waxReserve, tokenReserve, poolPrice, priceWax, depthScore, waxSide: waxSide.side };
    }
  }
  if (!selected) {
    const reasonCodes = Object.keys(rejectedReasonCounts);
    return {
      price_wax: null,
      price_usd: null,
      source: null,
      pair_id: null,
      pair_label: null,
      wax_reserve: null,
      token_reserve: null,
      formula: null,
      updated_at: null,
      reason_codes: candidates.length
        ? (reasonCodes.length ? reasonCodes : ['v3_poolv3_getprice_proof_unavailable'])
        : ['no_direct_wax_pool'],
    };
  }
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  return {
    price_wax: safeDecimal(selected.priceWax),
    price_usd: waxUsd != null ? safeDecimal(selected.priceWax * waxUsd) : null,
    source: selected.pair.source || null,
    pair_id: selected.pair.pair_id || null,
    pair_label: selectedPairLabel(selected.pair),
    wax_reserve: safeDecimal(selected.waxReserve),
    token_reserve: safeDecimal(selected.tokenReserve),
    formula: selected.waxSide === 'a'
      ? 'price_wax = 1 / PoolV3.getPrice(pool)'
      : 'price_wax = PoolV3.getPrice(pool)',
    updated_at: selected.pair.updated_at || null,
    reason_codes: [],
  };
}

function waxcashDirectWaxCandidateProof(pair, priceIndex = new Map()) {
  if (!pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL) ||
      !hasWaxQuoteForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL)) {
    return null;
  }
  const source = aggregateSourceKey(pair?.source);
  const waxReserve = waxSideReserveForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const tokenReserve = tokenSideReserveForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const liquidityWax = asNumber(pair?.liquidity_wax) ?? (waxReserve != null && waxReserve > 0 ? waxReserve * 2 : null);
  const orderbookDepthWax = source === 'alcor' && liquidityWax != null ? liquidityWax / 2 : null;
  const depthScore = waxReserve ?? orderbookDepthWax ?? (liquidityWax != null ? liquidityWax / 2 : null);
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  const reasonCodes = [];
  let priceWax = null;
  let formula = null;
  let proofStatus = 'unavailable';

  if (source === 'alcor') {
    const marketPrice = asNumber(pair?.price);
    const waxSide = pairTokenSide(pair, 'eosio.token', 'WAX');
    if (marketPrice == null || marketPrice <= 0) reasonCodes.push('orderbook_match_price_unavailable');
    if (!waxSide) reasonCodes.push('direct_wax_side_unavailable');
    if (liquidityWax == null || liquidityWax <= 0) reasonCodes.push('orderbook_liquidity_depth_unavailable');
    if (!reasonCodes.length) {
      priceWax = waxSide.side === 'a' ? 1 / marketPrice : marketPrice;
      formula = waxSide.side === 'a'
        ? 'price_wax = 1 / alcordexmain market match price'
        : 'price_wax = alcordexmain market match price';
      proofStatus = 'verified';
    }
  } else if (source === 'swap.alcor') {
    const poolPrice = poolV3PriceForPair(pair);
    if (!hasPoolV3GetPriceProof(pair)) reasonCodes.push('v3_poolv3_getprice_proof_unavailable');
    if (poolPrice == null || poolPrice <= 0) reasonCodes.push('v3_poolv3_getprice_value_unavailable');
    const waxSide = pairTokenSide(pair, 'eosio.token', 'WAX');
    if (!waxSide) reasonCodes.push('direct_wax_side_unavailable');
    if (!reasonCodes.length) {
      priceWax = waxSide.side === 'a' ? 1 / poolPrice : poolPrice;
      formula = waxSide.side === 'a'
        ? 'price_wax = 1 / PoolV3.getPrice(pool)'
        : 'price_wax = PoolV3.getPrice(pool)';
      proofStatus = 'verified';
    }
  } else {
    if (waxReserve == null || waxReserve <= 0 || tokenReserve == null || tokenReserve <= 0) {
      reasonCodes.push('missing_or_zero_reserves');
    } else {
      priceWax = waxReserve / tokenReserve;
      formula = 'price_wax = wax_reserve / token_reserve';
      proofStatus = 'verified';
    }
  }

  if (depthScore == null || depthScore <= 0) reasonCodes.push('trusted_wax_side_liquidity_unavailable');
  if (priceWax == null || priceWax <= 0) proofStatus = 'unavailable';

  return {
    pair,
    source: pair.source || null,
    pair_id: pair.pair_id || null,
    pair_label: selectedPairLabel(pair),
    price_wax: safeDecimal(priceWax),
    price_usd: priceWax != null && waxUsd != null ? safeDecimal(priceWax * waxUsd) : null,
    wax_reserve: safeDecimal(waxReserve),
    token_reserve: safeDecimal(tokenReserve),
    liquidity_wax: safeDecimal(liquidityWax),
    depth_score: safeDecimal(depthScore),
    formula,
    proof_status: proofStatus,
    adapter_type: source === 'alcor'
      ? 'alcor_orderbook_market_match'
      : (source === 'swap.alcor' ? 'alcor_v3_poolv3_getprice' : 'v2_reserve_ratio'),
    updated_at: pair.updated_at || null,
    usable: proofStatus === 'verified' && asNumber(depthScore) != null && asNumber(depthScore) > 0 && asNumber(priceWax) != null,
    reason_codes: Array.from(new Set(reasonCodes)),
  };
}

function isAlcorWaxcashDirectPair(pair) {
  return aggregateSourceKey(pair?.source) === 'swap.alcor' &&
    pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL) &&
    hasWaxQuoteForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
}

function isOldWoeLegacyWaxcashDirectPair(pair) {
  const source = aggregateSourceKey(pair?.source);
  return ['swap.nefty', 'swap.box', 'swap.taco', 'swap.adex'].includes(source) &&
    pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL) &&
    hasWaxQuoteForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
}

function waxcashPairProof(pair, headlinePrice, pairedDirectWaxPairs, priceIndex) {
  const side = pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const source = aggregateSourceKey(pair?.source);
  const isOrderbook = source === 'alcor';
  const reasonCodes = [];
  if (!side) reasonCodes.push('not_waxcash_pair');
  if (!isOrderbook && !hasRealPairReserves(pair)) reasonCodes.push('missing_or_zero_reserves');
  const paired = otherTokenForPair(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const waxcashReserve = tokenSideReserveForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const pairedReserve = side?.side === 'a' ? asNumber(pair.reserve_b) : asNumber(pair.reserve_a);
  const directWax = hasWaxQuoteForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const pairedIsWax = paired ? isWaxToken(paired.contract, paired.symbol) : false;
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  let liquidityWax = null;
  let liquidityUsd = null;
  let valuationBasis = null;
  let pairedTokenPrice = pairedIsWax ? { price_wax: '1' } : null;
  let reserveRatioValuation = null;
  const directCandidate = directWax ? waxcashDirectWaxCandidateProof(pair, priceIndex) : null;

  if (!reasonCodes.length) {
    if (directWax) {
      const waxReserve = waxSideReserveForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
      liquidityWax = waxReserve != null ? waxReserve * 2 : asNumber(pair?.liquidity_wax);
      if (liquidityWax != null) valuationBasis = 'direct_wax_pair_reserve';
      if (isOrderbook && directCandidate?.usable !== true) {
        for (const code of directCandidate?.reason_codes || ['orderbook_direct_wax_price_proof_unavailable']) reasonCodes.push(code);
      }
    } else {
      pairedTokenPrice = paired ? ogDirectWaxTokenPrice(paired.contract, paired.symbol, pairedDirectWaxPairs, priceIndex) : null;
      reserveRatioValuation = waxcashGraphPairValuation(pair, headlinePrice, priceIndex);
      const waxcashPriceWax = asNumber(headlinePrice?.og_headline_price_wax);
      const pairedPriceWax = asNumber(pairedTokenPrice?.price_wax);
      if (waxcashPriceWax == null) reasonCodes.push('waxcash_headline_price_unavailable');
      if (pairedPriceWax != null && !reasonCodes.length) {
        liquidityWax = (waxcashReserve * waxcashPriceWax) + (pairedReserve * pairedPriceWax);
        valuationBasis = 'paired_token_direct_wax_price';
      } else if (asNumber(reserveRatioValuation?.liquidity_wax) != null) {
        liquidityWax = asNumber(reserveRatioValuation.liquidity_wax);
        valuationBasis = 'waxcash_reserve_ratio_from_selected_waxcash_price';
      } else if (pairedPriceWax == null) {
        reasonCodes.push('paired_token_wax_price_unavailable');
      }
    }
  }
  if (liquidityWax != null && waxUsd != null) liquidityUsd = liquidityWax * waxUsd;

  const orderbookPrice = directCandidate?.source === 'alcor' ? asNumber(directCandidate.price_wax) : null;
  const priceRelative = orderbookPrice != null && pairedIsWax
    ? orderbookPrice
    : (!reasonCodes.includes('missing_or_zero_reserves') && waxcashReserve != null && waxcashReserve > 0
      ? pairedReserve / waxcashReserve
      : null);
  const reserveRatioPairedTokenPriceWax = asNumber(reserveRatioValuation?.selected_price_wax);
  const pairedTokenPriceWax = pairedIsWax ? 1 : (asNumber(pairedTokenPrice?.price_wax) ?? reserveRatioPairedTokenPriceWax);
  const priceRelativeUsd = priceRelative != null && pairedTokenPriceWax != null && waxUsd != null
    ? priceRelative * pairedTokenPriceWax * waxUsd
    : null;
  const reserveRatioPossible = asNumber(reserveRatioValuation?.liquidity_wax) != null;

  const proof = {
    source: pair.source || null,
    pair_id: pair.pair_id || null,
    pair_label: selectedPairLabel(pair),
    token_a_contract: pair.token_a_contract || null,
    token_a_symbol: pair.token_a_symbol || null,
    token_a_icon: pair.token_a_icon || pair.token_a_logo || null,
    token_b_contract: pair.token_b_contract || null,
    token_b_symbol: pair.token_b_symbol || null,
    token_b_icon: pair.token_b_icon || pair.token_b_logo || null,
    reserve_a: safeDecimal(asNumber(pair.reserve_a)),
    reserve_b: safeDecimal(asNumber(pair.reserve_b)),
    fee_bps: safeDecimal(asNumber(pair.fee_bps)),
    updated_at: pair.updated_at || null,
    pair_liquidity_wax: safeDecimal(liquidityWax),
    pair_liquidity_usd: safeDecimal(liquidityUsd),
    pair_price_relative_to_waxcash: safeDecimal(priceRelative),
    pair_price_usd: safeDecimal(priceRelativeUsd),
    paired_token: paired,
    paired_token_og_wax_price: pairedTokenPrice?.price_wax || null,
    paired_token_reserve_ratio_wax_price: safeDecimal(reserveRatioPairedTokenPriceWax),
    selected_waxcash_price_wax: headlinePrice?.og_headline_price_wax || null,
    direct_wax_pair: directWax,
    valuation_basis: valuationBasis,
    valuation_debug: {
      no_visible_ui: true,
      no_fake_value: true,
      pair_id: pair.pair_id || null,
      source: pair.source || null,
      token_a: tokenRef(pair.token_a_contract, pair.token_a_symbol),
      token_b: tokenRef(pair.token_b_contract, pair.token_b_symbol),
      reserve_a: safeDecimal(asNumber(pair.reserve_a)),
      reserve_b: safeDecimal(asNumber(pair.reserve_b)),
      pair_price_relative_to_waxcash: safeDecimal(priceRelative),
      selected_waxcash_price_wax: headlinePrice?.og_headline_price_wax || null,
      pair_liquidity_wax: safeDecimal(liquidityWax),
      paired_token_og_wax_price: pairedTokenPrice?.price_wax || null,
      paired_token_reserve_ratio_wax_price: safeDecimal(reserveRatioPairedTokenPriceWax),
      paired_token_direct_wax_pair_found: asNumber(pairedTokenPrice?.price_wax) != null,
      route_based_wax_price_found: false,
      route_graph_available: false,
      reserve_ratio_waxcash_valuation_possible: reserveRatioPossible,
      valuation_basis: valuationBasis,
      rejection_reason: reasonCodes.length ? reasonCodes.join(',') : null,
      reason_codes: reasonCodes.slice(),
    },
    reason_codes: reasonCodes,
  };
  for (const field of [
    'volume_24h', 'volume_24h_wax', 'volume_24h_usd',
    'volume_7d', 'volume_7d_wax', 'volume_7d_usd',
    'volume_30d', 'volume_30d_wax', 'volume_30d_usd',
  ]) {
    const parsed = asNumber(pair[field]);
    if (parsed != null) proof[field] = safeDecimal(parsed);
  }
  return proof;
}

function waxcashPairSummary(allPairs = []) {
  const summary = {
    total_pairs: allPairs.length,
    direct_wax_pair_count: 0,
    non_wax_pair_count: 0,
    valued_pair_count: 0,
    unvalued_pair_count: 0,
    total_pair_liquidity_wax: null,
    total_pair_liquidity_usd: null,
    unavailable_reason_counts: {},
  };
  let totalWax = 0;
  let totalUsd = 0;
  let hasWax = false;
  let hasUsd = false;
  for (const pair of allPairs) {
    if (pair.direct_wax_pair) summary.direct_wax_pair_count += 1;
    else summary.non_wax_pair_count += 1;
    const liquidityWax = asNumber(pair.pair_liquidity_wax);
    const liquidityUsd = asNumber(pair.pair_liquidity_usd);
    if (liquidityWax != null) {
      summary.valued_pair_count += 1;
      totalWax += liquidityWax;
      hasWax = true;
    } else {
      summary.unvalued_pair_count += 1;
    }
    if (liquidityUsd != null) {
      totalUsd += liquidityUsd;
      hasUsd = true;
    }
    for (const code of pair.reason_codes || []) {
      summary.unavailable_reason_counts[code] = (summary.unavailable_reason_counts[code] || 0) + 1;
    }
  }
  summary.total_pair_liquidity_wax = hasWax ? safeDecimal(totalWax) : null;
  summary.total_pair_liquidity_usd = hasUsd ? safeDecimal(totalUsd) : null;
  return summary;
}

function waxcashHeadlinePrice(pairRows, priceIndex) {
  const directCandidates = (pairRows || []).filter((pair) =>
    pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL) &&
    hasWaxQuoteForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL));
  const candidateProofs = directCandidates
    .map((pair) => waxcashDirectWaxCandidateProof(pair, priceIndex))
    .filter(Boolean);
  const usableCandidates = candidateProofs.filter((candidate) => candidate.usable);
  const selected = usableCandidates.slice().sort((a, b) =>
    (asNumber(b.depth_score) || 0) - (asNumber(a.depth_score) || 0) ||
    String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  )[0] || {
    price_wax: null,
    price_usd: null,
    source: null,
    pair_id: null,
    pair_label: null,
    wax_reserve: null,
    token_reserve: null,
    liquidity_wax: null,
    formula: null,
    updated_at: null,
    proof_status: 'unavailable',
    reason_codes: directCandidates.length ? ['no_direct_wax_pool_with_usable_price_proof'] : ['no_direct_wax_pool'],
  };
  const reasonCodes = selected.reason_codes.slice();
  const waxReserve = asNumber(selected.wax_reserve);
  return {
    og_headline_price_wax: selected.price_wax,
    og_headline_price_usd: selected.price_usd,
    og_headline_price_source: selected.source,
    og_headline_price_pair_id: selected.pair_id,
    og_headline_price_pair_label: selected.pair_label,
    og_headline_wax_reserve: selected.wax_reserve,
    og_headline_token_reserve: selected.token_reserve,
    og_headline_formula: selected.price_wax == null ? null : selected.formula,
    og_headline_passes_100_wax_threshold: waxReserve != null ? waxReserve >= 100 : false,
    og_headline_reason_codes: reasonCodes,
    og_headline_updated_at: selected.updated_at,
    headline_price_source_policy: 'og_woe_deepest_usable_direct_wax_pool',
    selected_trusted_wax_side_liquidity_wax: selected.liquidity_wax || null,
    selected_depth_score_wax: selected.depth_score || null,
    selected_proof_status: selected.proof_status || (selected.price_wax == null ? 'unavailable' : 'verified'),
    direct_wax_candidate_count: directCandidates.length,
    usable_direct_wax_candidate_count: usableCandidates.length,
    direct_wax_candidates: candidateProofs.map((candidate) => ({
      source: candidate.source,
      pair_id: candidate.pair_id,
      pair_label: candidate.pair_label,
      adapter_type: candidate.adapter_type,
      price_wax: candidate.price_wax,
      wax_reserve: candidate.wax_reserve,
      token_reserve: candidate.token_reserve,
      liquidity_wax: candidate.liquidity_wax,
      depth_score: candidate.depth_score,
      formula: candidate.formula,
      proof_status: candidate.proof_status,
      usable: candidate.usable,
      reason_codes: candidate.reason_codes,
    })),
    legacy_direct_wax_candidate_count: directCandidates.filter(isOldWoeLegacyWaxcashDirectPair).length,
    legacy_direct_wax_candidate_found: directCandidates.some(isOldWoeLegacyWaxcashDirectPair),
    legacy_direct_wax_selected: selected.pair ? isOldWoeLegacyWaxcashDirectPair(selected.pair) : false,
    v3_direct_wax_candidate_count: directCandidates.filter(isAlcorWaxcashDirectPair).length,
    v3_direct_wax_candidate_found: directCandidates.some(isAlcorWaxcashDirectPair),
    v3_direct_wax_selected: selected.pair ? isAlcorWaxcashDirectPair(selected.pair) : false,
    headline_fallback_used: false,
    headline_fallback_reason_codes: [],
  };
}

function buildWaxcashOgParityProof(pairRows = [], priceIndex = new Map(), pairedDirectWaxPairs = []) {
  const exactPairs = (pairRows || []).filter((pair) => pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL));
  const headline = waxcashHeadlinePrice(exactPairs, priceIndex);
  const allPairs = exactPairs.map((pair) => waxcashPairProof(pair, headline, pairedDirectWaxPairs, priceIndex));
  const rejectedPairs = allPairs.filter((pair) => pair.reason_codes.length > 0);
  const pairSummary = waxcashPairSummary(allPairs);
  const liquidityWaxValues = allPairs.map((pair) => asNumber(pair.pair_liquidity_wax)).filter((value) => value != null);
  const liquidityWax = liquidityWaxValues.length ? liquidityWaxValues.reduce((sum, value) => sum + value, 0) : null;
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  return {
    token: {
      contract: WAXCASH_CONTRACT,
      symbol: WAXCASH_SYMBOL,
      key: WAXCASH_KEY,
    },
    headline_price: headline,
    direct_wax_candidates: allPairs.filter((pair) => pair.direct_wax_pair),
    selected_largest_wax_reserve_pool: headline.og_headline_price_pair_id ? {
      source: headline.og_headline_price_source,
      pair_id: headline.og_headline_price_pair_id,
      pair_label: headline.og_headline_price_pair_label,
      wax_reserve: headline.og_headline_wax_reserve,
      token_reserve: headline.og_headline_token_reserve,
    } : null,
    all_pairs: allPairs,
    rejected_pairs: rejectedPairs,
    pair_summary: pairSummary,
    aggregate_pair_liquidity: {
      pair_count: allPairs.length,
      computable_pair_count: liquidityWaxValues.length,
      liquidity_wax: safeDecimal(liquidityWax),
      liquidity_usd: liquidityWax != null && waxUsd != null ? safeDecimal(liquidityWax * waxUsd) : null,
    },
    comparison_notes: [
      'WAXCASH OG parity proof is exact contract::symbol scoped.',
      'Headline price uses the direct WAX pool with the largest verified WAX reserve.',
      'Stored pair.price, TVL, market cap, volume, and multi-hop routes are not headline-price inputs.',
    ],
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
  const liquidityBasis = (liquidityWax != null || liquidityUsd != null) && metrics?.liquidity_basis ? metrics.liquidity_basis : null;
  const tvlBasis = (tvlWax != null || tvlUsd != null) && metrics?.tvl_basis ? metrics.tvl_basis : null;
  const selectedPriceLive = selectedPriceWax != null || selectedPriceUsd != null;
  const selectedRouteType = selected
    ? selected.route_type
    : (metrics?.selected_pair_source && metrics?.selected_pair_id ? 'stored_indexed_pair' : null);
  const selectedPriceProof = {
    live: selectedPriceLive,
    source: metrics?.selected_price_source || metrics?.selected_pair_source || selected?.pair?.source || null,
    pair_id: metrics?.selected_pair_id || selected?.pair?.pair_id || null,
    pair_label: metrics?.selected_pair_label || selectedPairLabel(selected?.pair) || null,
    selected_price_wax: safeDecimal(selectedPriceWax),
    selected_price_usd: safeDecimal(selectedPriceUsd),
    route_type: selectedRouteType,
    valuation_route: selectedRouteType || null,
    rejection_reason: metrics?.selected_price_rejection_reason || null,
    token_side: null,
    route_hops: selected?.route_hops || [],
    route_liquidity_score: safeDecimal(selected?.route_liquidity_score),
    trusted_liquidity: selected?.priceWax != null,
  };
  const metricStatus = {
    selected_price: {
      live: selectedPriceLive,
      source: selectedPriceProof.source ? 'indexed_pair' : null,
      reason: selectedPriceLive ? null : (metrics?.selected_price_rejection_reason || metrics?.unavailable_reasons?.selected_price || 'No indexed pair has enough price data yet'),
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
      reason: hasMarketCap ? null : (metrics?.market_cap_rejection_reason || (hasCirculatingSupply ? 'Requires selected market cap value' : 'Requires circulating supply and selected price')),
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
    has_selected_price: selectedPriceLive,
    has_liquidity: liquidityBasis != null,
    has_tvl: tvlBasis != null,
    selected_price_confidence: selectedPriceLive && selectedPriceProof.source ? 'good' : 'unavailable',
    liquidity_confidence: liquidityBasis != null ? 'good' : 'unavailable',
    tvl_confidence: tvlBasis != null ? 'good' : 'unavailable',
    metric_reason_codes: Object.entries(metricStatus)
      .filter(([, status]) => status?.reason)
      .map(([metric]) => metric),
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
      selected_price: selectedPriceProof.source ? 'indexed_pair' : null,
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
  if (metrics.selected_price_wax == null) reasons.selected_price = metrics.selected_price_rejection_reason || (metrics.selected_pair_id ? 'Source indexed; price unavailable' : 'No indexed pair has enough price data yet');
  if (metrics.change_24h == null) reasons.price_change_24h = 'Requires indexed 24h price-change data';
  if (metrics.volume_24h_wax == null) reasons.volume_24h = 'Requires indexed pair or ticker volume';
  if (metrics.liquidity_wax == null && metrics.liquidity_usd == null) {
    reasons.liquidity = asNumber(metrics.suspicious_liquidity_pair_count) > 0
      ? 'Suspicious pair liquidity excluded from trusted totals'
      : 'Requires valued indexed pair reserves';
  }
  if (metrics.holder_count == null) reasons.holder_count = REQUIRES_INDEXED_BACKEND;
  if (metrics.circulating_supply == null) reasons.circulating_supply = 'Requires indexed circulating supply';
  if (metrics.volume_7d == null) reasons.volume_7d = 'Requires indexed candle or trade history';
  if (metrics.volume_30d == null) reasons.volume_30d = 'Requires indexed candle or trade history';
  if (metrics.market_cap_wax == null && metrics.market_cap_usd == null) reasons.market_cap = metrics.market_cap_rejection_reason || (metrics.selected_price_wax != null ? 'Circulating supply not indexed' : 'Price unavailable');
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
  let directWaxcashLiquidityWax = 0;
  let directWaxLiquidityWax = 0;
  let hasDirectWaxcashLiquidityWax = false;
  let hasDirectWaxLiquidityWax = false;
  let suspiciousLiquidityPairCount = 0;
  let bubbleSuspiciousLiquidityPairCount = 0;
  const liquidityContributions = [];
  const routeIndex = options.routeIndex || buildOgWaxRouteGraph(graphPairRows, priceIndex);
  const selected = selectLiquidityWeightedMedianPrice(contract, symbol, pairRows, priceIndex, routeIndex);
  const totalSupply = asNumber(token?.total_supply ?? token?.max_supply);
  const circulatingSupply = asNumber(metrics.circulating_supply ?? token?.circulating_supply);
  const selectedPriceWax = selected?.priceWax ?? null;
  const selectedPriceUsd = selected?.priceUsd ?? null;
  const marketCapWax = circulatingSupply != null && selectedPriceWax != null ? circulatingSupply * selectedPriceWax : null;
  const marketCapUsd = circulatingSupply != null && selectedPriceUsd != null ? circulatingSupply * selectedPriceUsd : null;

  const sortedPairs = (pairRows || [])
    .slice()
    .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')));

  for (const pair of dedupePairRows(sortedPairs)) {
    if (!pairTokenSide(pair, contract, symbol)) continue;
    if (!hasRealPairReserves(pair)) continue;
    pairCount += 1;
    const source = aggregateSourceKey(pair.source);
    if (source) sources.add(source);
    const valuation = ogPairReserveValuation(pair, contract, symbol, priceIndex, routeIndex, selected);
    const liquidityWax = asNumber(valuation.contribution_wax);
    const liquidityUsd = asNumber(valuation.contribution_usd) ?? (liquidityWax != null && waxUsd != null ? liquidityWax * waxUsd : null);
    const volumeWax = volumeWaxFromIndexedPair(pair, priceIndex);
    if (liquidityWax != null) {
      if (isReasonablePairTvlWax(liquidityWax, waxUsd) && isReasonablePairTvlUsd(liquidityUsd)) {
        liquidityWaxTotal += liquidityWax;
        hasLiquidityWax = true;
        if (pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL)) {
          directWaxcashLiquidityWax += liquidityWax;
          hasDirectWaxcashLiquidityWax = true;
        }
        if (hasWaxQuoteForToken(pair, contract, symbol)) {
          directWaxLiquidityWax += liquidityWax;
          hasDirectWaxLiquidityWax = true;
        }
        liquidityContributions.push({ liquidityWax, liquidityUsd });
      } else {
        suspiciousLiquidityPairCount += 1;
      }
    }
    if (volumeWax != null) {
      volumeWaxTotal += volumeWax;
      hasVolumeWax = true;
    }
  }

  const bubbleLiquidityTotals = liquidityContributions.reduce((totals, contribution) => {
    if (!isReasonableBubbleLiquidity(contribution.liquidityWax, contribution.liquidityUsd, marketCapWax, marketCapUsd)) {
      bubbleSuspiciousLiquidityPairCount += 1;
      return totals;
    }
    totals.wax += contribution.liquidityWax;
    if (contribution.liquidityUsd != null) {
      totals.usd += contribution.liquidityUsd;
      totals.hasUsd = true;
    }
    totals.hasWax = true;
    return totals;
  }, { wax: 0, usd: 0, hasWax: false, hasUsd: false });
  const fdvWax = asNumber(metrics.fdv_wax) ?? (totalSupply != null && selectedPriceWax != null ? totalSupply * selectedPriceWax : null);
  const fdvUsd = asNumber(metrics.fdv_usd) ?? (totalSupply != null && selectedPriceUsd != null ? totalSupply * selectedPriceUsd : null);
  const liquidityWax = hasLiquidityWax ? liquidityWaxTotal : null;
  const liquidityUsd = hasLiquidityWax && waxUsd != null ? liquidityWaxTotal * waxUsd : null;
  const bubbleLiquidityWax = bubbleLiquidityTotals.hasWax ? bubbleLiquidityTotals.wax : null;
  const bubbleLiquidityUsd = bubbleLiquidityTotals.hasUsd
    ? bubbleLiquidityTotals.usd
    : (bubbleLiquidityWax != null && waxUsd != null ? bubbleLiquidityWax * waxUsd : null);
  const volumeWax = hasVolumeWax ? volumeWaxTotal : asNumber(metrics.volume_24h_wax ?? metrics.volume_24h);
  const volumeUsd = volumeWax != null && waxUsd != null ? volumeWax * waxUsd : asNumber(metrics.volume_24h_usd);

  metrics.contract = contract;
  metrics.symbol = symbol;
  metrics.graph_depth = asNumber(metrics.graph_depth);
  metrics.visible_in_waxcash_bubbles = metrics.visible_in_waxcash_bubbles === true || metrics.visible_in_waxcash_bubbles === 1 || metrics.visible_in_waxcash_bubbles === '1';
  metrics.total_supply = safeDecimal(totalSupply);
  metrics.circulating_supply = safeDecimal(circulatingSupply);
  metrics.selected_price_wax = safeDecimal(selectedPriceWax);
  metrics.selected_price_usd = safeDecimal(selectedPriceUsd);
  const selectedProofHop = selected?.route_hops?.[selected.route_hops.length - 1] || null;
  metrics.selected_pair_source = selectedProofHop?.source || null;
  metrics.selected_pair_id = selectedProofHop?.pair_id || null;
  metrics.selected_pair_label = selectedProofHop ? [selectedProofHop.source, selectedProofHop.pair_id ? `#${selectedProofHop.pair_id}` : null, selected.route_type].filter(Boolean).join(' ') : null;
  metrics.selected_price_source = metrics.selected_pair_label || (selected?.route_type === 'wax_self' ? 'eosio.token WAX' : null);
  metrics.selected_price_route = selected?.route_type || null;
  metrics.selected_price_rejection_reason = selectedPriceWax == null ? (selected?.rejection_reason || 'no_verified_price_candidate') : null;
  metrics.change_24h = safeDecimal(metrics.change_24h);
  metrics.price_change_24h = metrics.change_24h;
  metrics.volume_24h = safeDecimal(volumeWax);
  metrics.volume_24h_wax = safeDecimal(volumeWax);
  metrics.volume_24h_usd = safeDecimal(volumeUsd);
  metrics.liquidity_wax = safeDecimal(liquidityWax);
  metrics.liquidity_usd = safeDecimal(liquidityUsd);
  metrics.graph_liquidity_wax = safeDecimal(liquidityWax);
  metrics.graph_liquidity_usd = safeDecimal(liquidityUsd);
  metrics.direct_pair_liquidity_wax = safeDecimal(liquidityWax);
  metrics.direct_pair_liquidity_usd = safeDecimal(liquidityUsd);
  metrics.direct_waxcash_pair_liquidity_wax = safeDecimal(hasDirectWaxcashLiquidityWax ? directWaxcashLiquidityWax : null);
  metrics.direct_wax_pair_liquidity_wax = safeDecimal(hasDirectWaxLiquidityWax ? directWaxLiquidityWax : null);
  metrics.bubble_liquidity_wax = safeDecimal(bubbleLiquidityWax);
  metrics.bubble_liquidity_usd = safeDecimal(bubbleLiquidityUsd);
  metrics.bubble_tvl_wax = safeDecimal(bubbleLiquidityWax);
  metrics.bubble_tvl_usd = safeDecimal(bubbleLiquidityUsd);
  metrics.suspicious_liquidity_pair_count = suspiciousLiquidityPairCount || null;
  metrics.bubble_suspicious_liquidity_pair_count = bubbleSuspiciousLiquidityPairCount || null;
  metrics.cumulated_pair_liquidity_wax = safeDecimal(liquidityWax);
  metrics.cumulated_pair_liquidity_usd = safeDecimal(liquidityUsd);
  metrics.tvl_wax = safeDecimal(liquidityWax);
  metrics.tvl_usd = safeDecimal(liquidityUsd);
  metrics.liquidity_basis = hasLiquidityWax ? 'direct_indexed_pair_reserves' : null;
  metrics.tvl_basis = hasLiquidityWax ? 'direct_indexed_pair_reserves' : null;
  metrics.source_count = sources.size || asNumber(metrics.source_count) || null;
  metrics.indexed_pair_count = pairCount || asNumber(metrics.indexed_pair_count) || null;
  metrics.source_keys = Array.from(sources).sort().join(',');
  metrics.market_cap_wax = safeDecimal(marketCapWax);
  metrics.market_cap_usd = safeDecimal(marketCapUsd);
  metrics.market_cap_rejection_reason = marketCapWax == null && marketCapUsd == null
    ? (circulatingSupply == null ? 'circulating_supply_unavailable' : (selectedPriceWax == null ? 'selected_price_unavailable' : 'market_cap_unavailable'))
    : null;
  metrics.fdv_wax = safeDecimal(fdvWax);
  metrics.fdv_usd = safeDecimal(fdvUsd);
  metrics.strongest_pair = selected && selectedPriceWax != null ? {
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

async function loadWaxcashOgPairRows(db) {
  const rows = await db.prepare(
    `SELECT source, pair_id, og_laststats_pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            volume_7d, volume_7d_wax, volume_7d_usd, volume_30d, volume_30d_wax, volume_30d_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
     FROM waxonedge_pairs
     WHERE (token_a_contract = ? AND token_a_symbol = ?)
        OR (token_b_contract = ? AND token_b_symbol = ?)`
  ).bind(WAXCASH_CONTRACT, WAXCASH_SYMBOL, WAXCASH_CONTRACT, WAXCASH_SYMBOL).all().catch(() => ({ results: [] }));
  return rows.results || [];
}

function dedupePairRows(pairRows = []) {
  const rows = new Map();
  for (const pair of pairRows || []) {
    const key = [
      pair?.source || '',
      pair?.pair_id || '',
      pair?.token_a_contract || '',
      pair?.token_a_symbol || '',
      pair?.token_b_contract || '',
      pair?.token_b_symbol || '',
    ].join('::');
    if (!rows.has(key)) rows.set(key, pair);
  }
  return Array.from(rows.values());
}

async function loadPairRowsForTokens(db, tokens = []) {
  const targets = (tokens || [])
    .filter((token) => token?.contract && token?.symbol)
    .filter((token, index, list) => list.findIndex((item) => item.contract === token.contract && item.symbol === token.symbol) === index);
  if (!targets.length) return [];
  const rows = [];
  for (let i = 0; i < targets.length; i += 50) {
    const chunk = targets.slice(i, i + 50);
    const where = chunk.map(() =>
      `((token_a_contract = ? AND token_a_symbol = ?) OR (token_b_contract = ? AND token_b_symbol = ?))`
    ).join(' OR ');
    const params = chunk.flatMap((token) => [token.contract, token.symbol, token.contract, token.symbol]);
    const result = await db.prepare(
      `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
              price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
              liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
       FROM waxonedge_pairs
       WHERE ${where}`
    ).bind(...params).all().catch(() => ({ results: [] }));
    rows.push(...(result.results || []));
  }
  return dedupePairRows(rows);
}

async function loadReserveRouteGraphRows(db, limit = OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT) {
  const graphLimit = clampInteger(limit, OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT, 1, OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT);
  const rows = await db.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
     FROM waxonedge_pairs
     WHERE CAST(COALESCE(reserve_a, '0') AS NUMERIC) > 0
       AND CAST(COALESCE(reserve_b, '0') AS NUMERIC) > 0
     ORDER BY
       CAST(COALESCE(liquidity_wax, '0') AS NUMERIC) DESC,
       updated_at DESC,
       source ASC,
       pair_id ASC
     LIMIT ?`
  ).bind(graphLimit).all().catch(() => ({ results: [] }));
  return dedupePairRows(rows.results || []);
}

async function loadDirectWaxRowsForTokens(db, tokens = []) {
  const targets = (tokens || [])
    .map((token) => tokenRef(token?.contract, token?.symbol))
    .filter((token) => token?.key && !isWaxToken(token.contract, token.symbol));
  if (!targets.length) return [];
  const rows = [];
  for (let i = 0; i < targets.length; i += 50) {
    const chunk = targets.slice(i, i + 50);
    const where = chunk.map(() =>
      `(((token_a_contract = ? AND token_a_symbol = ?) AND token_b_contract = 'eosio.token' AND token_b_symbol = 'WAX')
        OR ((token_b_contract = ? AND token_b_symbol = ?) AND token_a_contract = 'eosio.token' AND token_a_symbol = 'WAX'))`
    ).join(' OR ');
    const params = chunk.flatMap((token) => [token.contract, token.symbol, token.contract, token.symbol]);
    const result = await db.prepare(
      `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
              price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
              liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
       FROM waxonedge_pairs
       WHERE ${where}`
    ).bind(...params).all().catch(() => ({ results: [] }));
    rows.push(...(result.results || []));
  }
  return rows;
}

function absSafeDecimal(value) {
  const amount = asNumber(value);
  return amount == null ? null : safeDecimal(Math.abs(amount));
}

function tokenDecimalsForGraph(token, rowsByKey = new Map()) {
  const row = rowsByKey.get(token?.key) || {};
  const decimals = asNumber(row.decimals);
  return decimals != null ? decimals : null;
}

function waxcashGraphPairValuation(pair, headlinePrice, priceIndex = new Map(), rowsByKey = new Map()) {
  const side = pairTokenSide(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const paired = otherTokenForPair(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const waxcashReserve = tokenSideReserveForToken(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
  const pairedReserve = side?.side === 'a' ? asNumber(pair.reserve_b) : asNumber(pair.reserve_a);
  const waxcashPriceWax = asNumber(headlinePrice?.og_headline_price_wax);
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  const reasonCodes = [];
  if (!side) reasonCodes.push('not_waxcash_pair');
  if (!paired?.key) reasonCodes.push('paired_token_unavailable');
  if (!hasRealPairReserves(pair)) reasonCodes.push('missing_or_zero_reserves');
  if (waxcashPriceWax == null) reasonCodes.push('waxcash_headline_price_unavailable');

  let tokenPriceWaxcash = null;
  let tokenPriceWax = null;
  let tokenPriceUsd = null;
  let waxcashSideValueWax = null;
  let pairedSideValueWax = null;
  let liquidityWax = null;
  let liquidityUsd = null;
  const pairedIsWax = paired ? isWaxToken(paired.contract, paired.symbol) : false;

  if (!reasonCodes.length && waxcashReserve != null && waxcashReserve > 0 && pairedReserve != null && pairedReserve > 0) {
    tokenPriceWaxcash = waxcashReserve / pairedReserve;
    tokenPriceWax = pairedIsWax ? 1 : tokenPriceWaxcash * waxcashPriceWax;
    tokenPriceUsd = waxUsd != null ? tokenPriceWax * waxUsd : null;
    waxcashSideValueWax = waxcashReserve * waxcashPriceWax;
    pairedSideValueWax = pairedReserve * tokenPriceWax;
    liquidityWax = waxcashSideValueWax + pairedSideValueWax;
    liquidityUsd = waxUsd != null ? liquidityWax * waxUsd : null;
  }

  return {
    paired_token: paired,
    pair_direction: side?.side === 'a' ? 'waxcash_token_a' : (side?.side === 'b' ? 'waxcash_token_b' : null),
    reserve_normalization: 'stored_decimal_amounts',
    waxcash_decimals: tokenDecimalsForGraph(tokenRef(WAXCASH_CONTRACT, WAXCASH_SYMBOL), rowsByKey),
    paired_token_decimals: tokenDecimalsForGraph(paired, rowsByKey),
    waxcash_reserve: safeDecimal(waxcashReserve),
    paired_token_reserve: safeDecimal(pairedReserve),
    selected_waxcash_price_wax: safeDecimal(waxcashPriceWax),
    selected_wax_usd: safeDecimal(waxUsd),
    token_price_in_waxcash: safeDecimal(tokenPriceWaxcash),
    selected_price_wax: safeDecimal(tokenPriceWax),
    selected_price_usd: safeDecimal(tokenPriceUsd),
    waxcash_side_value_wax: safeDecimal(waxcashSideValueWax),
    paired_token_side_value_wax: safeDecimal(pairedSideValueWax),
    liquidity_wax: safeDecimal(liquidityWax),
    liquidity_usd: safeDecimal(liquidityUsd),
    volume_24h: absSafeDecimal(pair.volume_24h),
    volume_24h_wax: absSafeDecimal(pair.volume_24h_wax),
    volume_24h_usd: absSafeDecimal(pair.volume_24h_usd),
    valuation_basis: liquidityWax != null ? 'direct_waxcash_reserve_ratio' : null,
    reason_codes: reasonCodes,
  };
}

function aggregateWaxcashGraphMetrics(token, directPairsForToken, graphValuations, row = {}) {
  const isRoot = isWaxcashToken(token.contract, token.symbol);
  const isWax = isWaxToken(token.contract, token.symbol);
  const valuationRows = (directPairsForToken || [])
    .map((pair) => graphValuations.get(pair))
    .filter(Boolean);
  let liquidityWax = 0;
  let liquidityUsd = 0;
  let volumeWax = 0;
  let volumeUsd = 0;
  let hasLiquidityWax = false;
  let hasLiquidityUsd = false;
  let hasVolumeWax = false;
  let hasVolumeUsd = false;
  let selectedValuation = null;

  for (const valuation of valuationRows) {
    const pairLiquidityWax = asNumber(valuation.liquidity_wax);
    const pairLiquidityUsd = asNumber(valuation.liquidity_usd);
    const pairVolumeWax = asNumber(valuation.volume_24h_wax);
    const pairVolumeUsd = asNumber(valuation.volume_24h_usd);
    if (pairLiquidityWax != null) {
      liquidityWax += pairLiquidityWax;
      hasLiquidityWax = true;
      if (!selectedValuation || pairLiquidityWax > (asNumber(selectedValuation.liquidity_wax) ?? -1)) {
        selectedValuation = valuation;
      }
    }
    if (pairLiquidityUsd != null) {
      liquidityUsd += pairLiquidityUsd;
      hasLiquidityUsd = true;
    }
    if (pairVolumeWax != null) {
      volumeWax += pairVolumeWax;
      hasVolumeWax = true;
    }
    if (pairVolumeUsd != null) {
      volumeUsd += pairVolumeUsd;
      hasVolumeUsd = true;
    }
  }

  const selectedPriceWax = isRoot
    ? asNumber(selectedValuation?.selected_waxcash_price_wax)
    : (isWax ? 1 : asNumber(selectedValuation?.selected_price_wax));
  const selectedWaxUsd = asNumber(selectedValuation?.selected_wax_usd);
  const selectedPriceUsd = selectedPriceWax != null && selectedWaxUsd != null ? selectedPriceWax * selectedWaxUsd : null;
  const circulatingSupply = asNumber(row.circulating_supply);
  const totalSupply = asNumber(row.total_supply ?? row.max_supply);
  const marketCapWax = circulatingSupply != null && selectedPriceWax != null ? circulatingSupply * selectedPriceWax : null;
  const marketCapUsd = circulatingSupply != null && selectedPriceUsd != null ? circulatingSupply * selectedPriceUsd : null;
  const fdvWax = totalSupply != null && selectedPriceWax != null ? totalSupply * selectedPriceWax : null;
  const fdvUsd = totalSupply != null && selectedPriceUsd != null ? totalSupply * selectedPriceUsd : null;

  return {
    selected_price_wax: safeDecimal(selectedPriceWax),
    selected_price_usd: safeDecimal(selectedPriceUsd),
    selected_price_source: selectedValuation?.pair_label || selectedValuation?.pair_id || null,
    selected_pair_source: selectedValuation?.source || null,
    selected_pair_id: selectedValuation?.pair_id || null,
    selected_pair_label: selectedValuation?.pair_label || null,
    liquidity_wax: safeDecimal(hasLiquidityWax ? liquidityWax : null),
    liquidity_usd: safeDecimal(hasLiquidityUsd ? liquidityUsd : null),
    direct_pair_liquidity_wax: safeDecimal(hasLiquidityWax ? liquidityWax : null),
    direct_pair_liquidity_usd: safeDecimal(hasLiquidityUsd ? liquidityUsd : null),
    direct_waxcash_pair_liquidity_wax: safeDecimal(hasLiquidityWax ? liquidityWax : null),
    volume_24h: safeDecimal(hasVolumeWax ? volumeWax : null),
    volume_24h_wax: safeDecimal(hasVolumeWax ? volumeWax : null),
    volume_24h_usd: safeDecimal(hasVolumeUsd ? volumeUsd : null),
    market_cap_wax: safeDecimal(marketCapWax),
    market_cap_usd: safeDecimal(marketCapUsd),
    fdv_wax: safeDecimal(fdvWax),
    fdv_usd: safeDecimal(fdvUsd),
    liquidity_basis: hasLiquidityWax ? 'direct_waxcash_reserve_ratio' : null,
    tvl_basis: hasLiquidityWax ? 'direct_waxcash_reserve_ratio' : null,
    tvl_wax: safeDecimal(hasLiquidityWax ? liquidityWax : null),
    tvl_usd: safeDecimal(hasLiquidityUsd ? liquidityUsd : null),
  };
}


async function buildWaxcashPairGraph(db) {
  const directPairs = await loadWaxcashOgPairRows(db);
  const tokenRefs = [tokenRef(WAXCASH_CONTRACT, WAXCASH_SYMBOL)];
  for (const pair of directPairs || []) {
    const paired = otherTokenForPair(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL);
    if (paired?.key && !tokenRefs.some((token) => token.key === paired.key)) tokenRefs.push(paired);
  }

  const tokenRows = await loadTokenRowsForRefs(db, tokenRefs);
  const rowsByKey = new Map((tokenRows || []).map((row) => [tokenKey(row.contract, row.symbol), row]));
  const priceRows = await loadTokenPriceRowsForPairs(db, directPairs);
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const headlinePrice = waxcashHeadlinePrice(directPairs, priceIndex);
  const graphValuations = new Map();
  for (const pair of directPairs || []) {
    graphValuations.set(pair, {
      ...waxcashGraphPairValuation(pair, headlinePrice, priceIndex, rowsByKey),
      source: pair.source || null,
      pair_id: pair.pair_id || null,
      pair_label: selectedPairLabel(pair),
    });
  }
  const nodeKeys = new Set(tokenRefs.map((token) => token.key).filter(Boolean));
  const nodes = tokenRefs
    .filter((token) => token?.key)
    .map((token) => {
      const row = rowsByKey.get(token.key) || token;
      const directPairsForToken = (directPairs || []).filter((pair) => pairTouchesToken(pair, token));
      const directSources = Array.from(new Set(directPairsForToken
        .map((pair) => aggregateSourceKey(pair.source))
        .filter(Boolean)));
      const graphMetrics = aggregateWaxcashGraphMetrics(token, directPairsForToken, graphValuations, row);
      const normalized = normalizeLiveTokenUpdate({
        ...row,
        ...graphMetrics,
        contract: token.contract,
        symbol: token.symbol,
        indexed_pair_count: directPairsForToken.length,
        source_keys: directSources.join(','),
        source_count: directSources.length,
      }) || { token_key: token.key, contract: token.contract, symbol: token.symbol };
      return {
        id: token.key,
        token_key: token.key,
        contract: token.contract,
        symbol: token.symbol,
        label: token.symbol,
        role: isWaxcashToken(token.contract, token.symbol) ? 'root' : 'direct_pair_token',
        ...normalized,
        analytics_links: waxcashGraphTokenLinks(token.contract, token.symbol),
      };
    });

  const edges = (directPairs || [])
    .map((pair) => {
      const sourceKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
      const targetKey = tokenKey(pair.token_b_contract, pair.token_b_symbol);
      if (!sourceKey || !targetKey || !nodeKeys.has(sourceKey) || !nodeKeys.has(targetKey)) return null;
      const valuation = graphValuations.get(pair) || {};
      return {
        id: [pair.source, pair.pair_id, sourceKey, targetKey].map((part) => safeString(part)).join('::'),
        source: sourceKey,
        target: targetKey,
        source_contract: pair.token_a_contract,
        source_symbol: pair.token_a_symbol,
        target_contract: pair.token_b_contract,
        target_symbol: pair.token_b_symbol,
        dex_source: pair.source,
        pair_id: pair.pair_id,
        label: selectedPairLabel(pair),
        price: valuation.selected_price_wax || null,
        change_24h: safeDecimal(asNumber(pair.change_24h)),
        volume_24h: valuation.volume_24h || null,
        volume_24h_wax: valuation.volume_24h_wax || null,
        volume_24h_usd: valuation.volume_24h_usd || null,
        liquidity_wax: valuation.liquidity_wax || null,
        liquidity_usd: valuation.liquidity_usd || null,
        reserve_a: safeDecimal(asNumber(pair.reserve_a)),
        reserve_b: safeDecimal(asNumber(pair.reserve_b)),
        fee_bps: safeDecimal(asNumber(pair.fee_bps)),
        updated_at: pair.updated_at || null,
        valuation,
        analytics_links: waxcashGraphPairLinks(pair),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (asNumber(b.liquidity_wax) || 0) - (asNumber(a.liquidity_wax) || 0) || String(a.id).localeCompare(String(b.id)));

  const updatedAt = directPairs.map((pair) => pair.updated_at).filter(Boolean).sort().pop() || null;
  return {
    root: tokenRef(WAXCASH_CONTRACT, WAXCASH_SYMBOL),
    dataset: {
      authoritative_table: 'waxonedge_pairs',
      source_policy: 'indexed_direct_waxcash_pairs_only',
      bootstrap_token_inventory_used: false,
      indirect_route_pairs_used: false,
    },
    counts: { nodes: nodes.length, edges: edges.length, direct_pair_count: directPairs.length },
    nodes,
    edges,
    updated_at: updatedAt,
  };
}

function waxcashGraphTokenLinks(contract, symbol) {
  const c = encodeURIComponent(normalizeContract(contract));
  const s = encodeURIComponent(normalizeSymbol(symbol));
  return {
    detail: `${WAXONEDGE_API_PREFIX}/token/${c}/${s}`,
    pairs: `${WAXONEDGE_API_PREFIX}/token/${c}/${s}/pairs`,
    chart: `${WAXONEDGE_API_PREFIX}/token/${c}/${s}/chart`,
    debug: `${WAXONEDGE_API_PREFIX}/token/${c}/${s}/debug`,
    og_proof: isWaxcashToken(contract, symbol) ? `${WAXONEDGE_API_PREFIX}/token/${c}/${s}/og-proof` : null,
    waxblock: `https://waxblock.io/account/${c}`,
  };
}

function waxcashGraphPairLinks(pair) {
  const source = aggregateSourceKey(pair?.source);
  const pairId = encodeURIComponent(safeString(pair?.pair_id));
  return {
    token_a: waxcashGraphTokenLinks(pair?.token_a_contract, pair?.token_a_symbol).detail,
    token_b: waxcashGraphTokenLinks(pair?.token_b_contract, pair?.token_b_symbol).detail,
    candles: `${WAXONEDGE_API_PREFIX}/candles?source=${encodeURIComponent(safeString(pair?.source))}&pair_id=${pairId}`,
    alcor_market: source === 'alcor' && pairId ? `https://wax.alcor.exchange/trade/${pairId}` : null,
    waxblock_source: pair?.source && String(pair.source).includes('.') ? `https://waxblock.io/account/${encodeURIComponent(pair.source)}` : null,
  };
}

async function getWaxcashOgProof(db) {
  const rawPairRows = await loadWaxcashOgPairRows(db);
  const tokenRows = await loadTokenRowsForRefs(db, collectTokenRefsForPairs(rawPairRows));
  const pairRows = enrichPairsWithTokenIcons(rawPairRows, tokenRows);
  const pairedTokens = pairRows
    .map((pair) => otherTokenForPair(pair, WAXCASH_CONTRACT, WAXCASH_SYMBOL))
    .filter((token, index, list) => token?.key && list.findIndex((item) => item?.key === token.key) === index);
  const pairedDirectWaxPairs = await loadDirectWaxRowsForTokens(db, pairedTokens);
  const priceRows = await loadTokenPriceRowsForPairs(db, pairRows.concat(pairedDirectWaxPairs));
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const proof = buildWaxcashOgParityProof(pairRows, priceIndex, pairedDirectWaxPairs);
  return {
    og_woe_parity: proof,
    pair_input_debug: {
      no_visible_ui: true,
      raw_load_waxcash_pair_row_count: rawPairRows.length,
      enriched_waxcash_pair_row_count: pairRows.length,
      paired_token_count: pairedTokens.length,
      paired_direct_wax_pair_count: pairedDirectWaxPairs.length,
      raw_source_counts: countRowsByAggregateSource(rawPairRows),
      enriched_source_counts: countRowsByAggregateSource(pairRows),
    },
  };
}

function sumProofField(rows = [], field) {
  let total = 0;
  let hasValue = false;
  for (const row of rows || []) {
    const value = asNumber(row?.[field]);
    if (value == null) continue;
    total += Math.abs(value);
    hasValue = true;
  }
  return hasValue ? total : null;
}

async function getWaxcashSupplySyncStatus(db) {
  const [state, latestRun, tokenRow] = await Promise.all([
    readSourceIndexState(db, SUPPLY_SYNC_SOURCE).catch(() => null),
    db.prepare(
      `SELECT source, status, started_at, finished_at, error
       FROM waxonedge_sync_runs
       WHERE source = ?
       ORDER BY finished_at DESC, started_at DESC
       LIMIT 1`
    ).bind(SUPPLY_SYNC_SOURCE).first().catch(() => null),
    db.prepare(
      `SELECT contract, symbol, decimals, total_supply, max_supply, updated_at
       FROM waxonedge_tokens
       WHERE contract = ? AND symbol = ?
       LIMIT 1`
    ).bind(WAXCASH_CONTRACT, WAXCASH_SYMBOL).first().catch(() => null),
  ]);
  const totalSupply = assetAmountDecimalString(tokenRow?.total_supply);
  const maxSupply = assetAmountDecimalString(tokenRow?.max_supply);
  const lastError = state?.error || latestRun?.error || null;
  return {
    source: SUPPLY_SYNC_SOURCE,
    waxcash: {
      target: waxcashSupplyTarget(),
      total_supply: totalSupply,
      max_supply: maxSupply,
      decimals: asNumber(tokenRow?.decimals),
      updated_at: tokenRow?.updated_at || null,
      live: totalSupply != null,
      last_error: totalSupply != null ? null : lastError,
    },
    sync_state: state ? {
      status: state.status || null,
      cursor: state.cursor || '',
      complete: asNumber(state.complete) === 1,
      truncated: asNumber(state.truncated) === 1,
      row_count: asNumber(state.row_count),
      updated_at: state.updated_at || null,
      error: state.error || null,
    } : null,
    latest_run: latestRun || null,
    no_fake_supply: true,
  };
}

function waxcashSupplyUnavailableReason(error) {
  const message = error?.message || String(error || '');
  return message
    ? `WAX RPC get_currency_stats failed for graffitiking::WAXCASH: ${message}`
    : 'WAX RPC get_currency_stats did not return graffitiking::WAXCASH';
}

async function fetchWaxcashLiveSupplyProof(db, cachedToken = {}) {
  const cachedTotalSupply = assetAmountDecimalString(cachedToken?.total_supply);
  const cachedMaxSupply = assetAmountDecimalString(cachedToken?.max_supply);
  try {
    const stats = await rpcPost('/v1/chain/get_currency_stats', {
      code: WAXCASH_CONTRACT,
      symbol: WAXCASH_SYMBOL,
    });
    const stat = stats?.[WAXCASH_SYMBOL] || null;
    if (!stat) throw new Error('WAX RPC get_currency_stats did not return graffitiking::WAXCASH');
    const supply = parseAsset(stat.supply);
    const maxSupply = parseAsset(stat.max_supply);
    if (supply.symbol && supply.symbol !== WAXCASH_SYMBOL) throw new Error(`WAX RPC supply symbol mismatch: ${supply.symbol}`);
    if (maxSupply.symbol && maxSupply.symbol !== WAXCASH_SYMBOL) throw new Error(`WAX RPC max_supply symbol mismatch: ${maxSupply.symbol}`);
    const totalSupply = assetAmountDecimalString(stat.supply);
    const maxSupplyDecimal = assetAmountDecimalString(stat.max_supply);
    if (totalSupply == null) throw new Error('WAX RPC supply amount parse failed for graffitiking::WAXCASH');
    const decimals = asNumber(supply.precision) ?? asNumber(maxSupply.precision) ?? WAXCASH_TOKEN_REF.decimals;
    if (decimals !== WAXCASH_TOKEN_REF.decimals) throw new Error(`WAXCASH precision mismatch: expected 8, got ${decimals}`);
    const syncedAt = nowIso();
    await db.prepare(
      `INSERT INTO waxonedge_tokens
       (contract, symbol, decimals, total_supply, max_supply, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(contract, symbol) DO UPDATE SET
         decimals = COALESCE(excluded.decimals, waxonedge_tokens.decimals),
         total_supply = COALESCE(excluded.total_supply, waxonedge_tokens.total_supply),
         max_supply = COALESCE(excluded.max_supply, waxonedge_tokens.max_supply),
         updated_at = excluded.updated_at`
    ).bind(WAXCASH_CONTRACT, WAXCASH_SYMBOL, decimals, totalSupply, maxSupplyDecimal, syncedAt).run().catch(() => {});
    await db.prepare(
      `INSERT INTO waxonedge_token_stats
       (contract, symbol, fdv_wax, fdv_usd, updated_at)
       VALUES (?, ?, NULL, NULL, ?)
       ON CONFLICT(contract, symbol) DO UPDATE SET
         updated_at = excluded.updated_at`
    ).bind(WAXCASH_CONTRACT, WAXCASH_SYMBOL, syncedAt).run().catch(() => {});
    return {
      key: 'waxcash_supply',
      live: true,
      source: 'wax_rpc_get_currency_stats',
      basis: 'graffitiking::WAXCASH stat.supply',
      total_supply: totalSupply,
      max_supply: maxSupplyDecimal,
      decimals,
      updated_at: syncedAt,
      reason: null,
      no_fake_value: true,
    };
  } catch (error) {
    const reason = waxcashSupplyUnavailableReason(error);
    return {
      key: 'waxcash_supply',
      live: false,
      source: null,
      basis: null,
      total_supply: null,
      max_supply: null,
      decimals: asNumber(cachedToken?.decimals) ?? null,
      updated_at: cachedToken?.updated_at || null,
      cached_total_supply_diagnostic: cachedTotalSupply,
      cached_max_supply_diagnostic: cachedMaxSupply,
      cached_updated_at_diagnostic: cachedToken?.updated_at || null,
      reason,
      no_fake_value: true,
    };
  }
}

function waxcashStatSectionRow({
  key,
  label,
  live,
  source = null,
  basis = null,
  formula = null,
  reason = null,
  value = null,
  value_wax = null,
  value_usd = null,
  value_token = null,
  token_symbol = null,
}) {
  return {
    key,
    label,
    value: safeDecimal(asNumber(value)) ?? value,
    value_wax: safeDecimal(asNumber(value_wax)),
    value_usd: safeDecimal(asNumber(value_usd)),
    value_token: safeDecimal(asNumber(value_token)) ?? value_token,
    token_symbol: token_symbol || null,
    live: !!live,
    source,
    basis,
    formula,
    reason: live ? null : (reason || 'Unavailable from indexed WaxOnEdge sources'),
    no_fake_value: true,
  };
}

function waxcashBuildTokenStatsSection({ token, stats, supplyProof }) {
  const metricStatus = stats.metric_status || {};
  const rows = [
    waxcashStatSectionRow({
      key: 'token',
      label: 'Token',
      live: true,
      source: 'request_scope',
      basis: WAXCASH_KEY,
      value: WAXCASH_SYMBOL,
      value_token: WAXCASH_SYMBOL,
      token_symbol: WAXCASH_SYMBOL,
    }),
    waxcashStatSectionRow({
      key: 'holder_count',
      label: 'Holder count',
      live: stats.holder_count != null,
      source: metricStatus.holder_count?.source || null,
      basis: metricStatus.holder_count?.basis || null,
      value: stats.holder_count,
      reason: metricStatus.holder_count?.reason || 'Holder count requires a verified indexed holder source',
    }),
    waxcashStatSectionRow({
      key: 'decimals',
      label: 'Decimals',
      live: asNumber(token.decimals) != null,
      source: asNumber(token.decimals) != null ? (supplyProof?.source || 'indexed_token_metadata') : null,
      basis: asNumber(token.decimals) != null ? 'WAXCASH token precision' : null,
      value: asNumber(token.decimals),
      reason: 'Requires WAXCASH token precision from chain stats or indexed metadata',
    }),
    waxcashStatSectionRow({
      key: 'tvl',
      label: 'TVL',
      live: stats.tvl_wax != null || stats.tvl_usd != null,
      source: metricStatus.tvl?.source || 'indexed_waxcash_pairs',
      basis: metricStatus.tvl?.basis || 'all valued indexed WAXCASH pair reserves',
      value_wax: stats.tvl_wax,
      value_usd: stats.tvl_usd,
      reason: metricStatus.tvl?.reason || 'Requires valued indexed WAXCASH pair reserves',
    }),
    waxcashStatSectionRow({
      key: 'cumulated_pair_liquidity',
      label: 'Cumulated Pair Liquidity',
      live: stats.cumulated_pair_liquidity_wax != null || stats.cumulated_pair_liquidity_usd != null,
      source: 'indexed_waxcash_pairs',
      basis: 'all valued indexed WAXCASH pairs',
      value_wax: stats.cumulated_pair_liquidity_wax,
      value_usd: stats.cumulated_pair_liquidity_usd,
      reason: 'Requires valued indexed WAXCASH pair reserves',
    }),
    waxcashStatSectionRow({
      key: 'price',
      label: 'Price',
      live: stats.selected_price_wax != null || stats.selected_price_usd != null,
      source: stats.selected_price_source || null,
      basis: stats.selected_price_basis || null,
      formula: stats.selected_price_formula || null,
      value_wax: stats.selected_price_wax,
      value_usd: stats.selected_price_usd,
      reason: stats.selected_price_rejection_reason || 'Requires verified direct WAX/WAXCASH pool proof',
    }),
    waxcashStatSectionRow({
      key: 'change_24h',
      label: '24h price change',
      live: stats.change_24h != null,
      source: metricStatus.change_24h?.source || null,
      basis: metricStatus.change_24h?.basis || null,
      value: stats.change_24h,
      reason: metricStatus.change_24h?.reason || 'Requires selected proof pool price history or indexed token stats',
    }),
    waxcashStatSectionRow({
      key: 'volume_24h',
      label: '24h volume',
      live: stats.volume_24h_wax != null || stats.volume_24h_usd != null,
      source: metricStatus.volume_24h?.source || null,
      basis: 'indexed pair or ticker volume',
      value_wax: stats.volume_24h_wax,
      value_usd: stats.volume_24h_usd,
      reason: metricStatus.volume_24h?.reason || 'Requires indexed pair or ticker volume',
    }),
    waxcashStatSectionRow({
      key: 'volume_7d',
      label: '7d volume',
      live: stats.volume_7d != null,
      source: metricStatus.volume_7d?.source || null,
      basis: 'indexed trade history window',
      value_wax: stats.volume_7d_wax ?? stats.volume_7d,
      value_usd: stats.volume_7d_usd,
      reason: metricStatus.volume_7d?.reason || 'Requires indexed candle or trade history',
    }),
    waxcashStatSectionRow({
      key: 'volume_30d',
      label: '30d volume',
      live: stats.volume_30d != null,
      source: metricStatus.volume_30d?.source || null,
      basis: 'indexed trade history window',
      value_wax: stats.volume_30d_wax ?? stats.volume_30d,
      value_usd: stats.volume_30d_usd,
      reason: metricStatus.volume_30d?.reason || 'Requires indexed candle or trade history',
    }),
    waxcashStatSectionRow({
      key: 'circulating_supply',
      label: 'Circulating supply',
      live: stats.circulating_supply != null,
      source: metricStatus.circulating_supply?.source || null,
      basis: metricStatus.circulating_supply?.basis || null,
      value_token: stats.circulating_supply,
      token_symbol: WAXCASH_SYMBOL,
      reason: metricStatus.circulating_supply?.reason || 'WAXCASH circulating supply requires indexed supply or WAXCASH-only OG total-supply parity proof',
    }),
    waxcashStatSectionRow({
      key: 'market_cap',
      label: 'Market cap',
      live: stats.market_cap_wax != null || stats.market_cap_usd != null,
      source: stats.market_cap_wax != null || stats.market_cap_usd != null ? 'circulating_supply_x_selected_price' : null,
      basis: stats.market_cap_basis || null,
      formula: 'circulating_supply x selected_price',
      value_wax: stats.market_cap_wax,
      value_usd: stats.market_cap_usd,
      reason: 'Requires WAXCASH circulating supply and selected price.',
    }),
    waxcashStatSectionRow({
      key: 'total_supply',
      label: 'Total supply',
      live: stats.total_supply != null,
      source: supplyProof?.source || metricStatus.total_supply?.source || null,
      basis: supplyProof?.basis || metricStatus.total_supply?.basis || null,
      value_token: stats.total_supply,
      token_symbol: WAXCASH_SYMBOL,
      reason: supplyProof?.reason || metricStatus.total_supply?.reason || 'WAX RPC get_currency_stats did not return graffitiking::WAXCASH',
    }),
    waxcashStatSectionRow({
      key: 'fdv',
      label: 'Fully diluted valuation',
      live: stats.fdv_wax != null || stats.fdv_usd != null,
      source: stats.fdv_wax != null || stats.fdv_usd != null ? supplyProof?.source || null : null,
      basis: stats.fdv_wax != null || stats.fdv_usd != null ? 'total_supply_x_selected_price' : null,
      formula: 'total_supply x selected_price',
      value_wax: stats.fdv_wax,
      value_usd: stats.fdv_usd,
      reason: metricStatus.fdv?.reason || 'Requires WAX RPC total supply and selected price',
    }),
  ];
  return {
    rows,
    by_key: Object.fromEntries(rows.map((row) => [row.key, row])),
  };
}

function waxonedgeSourceDisplayLabel(source) {
  const normalized = moonboysCandleSource(source || '');
  const adapter = CORE_DEX_ADAPTERS.find((entry) => entry.source === normalized || entry.source === source);
  if (adapter?.label) return adapter.label;
  if (normalized === 'alcor' || normalized === 'alcordexmain') return 'Alcor V2';
  if (normalized === 'swap.alcor') return 'Alcor';
  if (normalized === 'swap.nefty') return 'NeftyBlocks';
  if (normalized === 'swap.taco') return 'Taco';
  if (normalized === 'swap.box') return 'Defibox';
  if (normalized === 'swap.adex') return 'ADEX';
  if (normalized === 'dapp.fusion') return 'WaxFusion';
  return safeString(source || normalized || 'Unknown');
}

function waxonedgeSourceLogoKey(source) {
  return aggregateSourceKey(source) || moonboysCandleSource(source || '') || null;
}

function waxcashPairTableRow(pair, selectedWaxPool) {
  const isSelected = pair.source === selectedWaxPool?.source && pair.pair_id === selectedWaxPool?.pair_id;
  const liquidityWax = asNumber(pair.pair_liquidity_wax);
  const liquidityUsd = asNumber(pair.pair_liquidity_usd);
  const volumeWax = asNumber(pair.volume_24h_wax);
  const volumeUsd = asNumber(pair.volume_24h_usd);
  const volume7dWax = asNumber(pair.volume_7d_wax);
  const volume7dUsd = asNumber(pair.volume_7d_usd);
  const volume30dWax = asNumber(pair.volume_30d_wax);
  const volume30dUsd = asNumber(pair.volume_30d_usd);
  const price = asNumber(pair.pair_price_relative_to_waxcash ?? pair.price);
  const priceUsd = asNumber(pair.pair_price_usd);
  const change24h = asNumber(pair.change_24h);
  const reasonCodes = Array.isArray(pair.reason_codes) ? pair.reason_codes : [];
  const live = liquidityWax != null || liquidityUsd != null;
  const reason = reasonCodes.length ? reasonCodes.join(', ') : (live ? null : 'liquidity_unavailable');
  const status = isSelected
    ? 'selected_price_pair'
    : (pair.direct_wax_pair ? 'direct_wax_pair' : (live ? 'valued' : 'unavailable'));
  const statusLabel = isSelected
    ? 'Selected proof'
    : (pair.direct_wax_pair ? 'Direct WAX' : (live ? 'Valued' : 'Unavailable'));
  return {
    pair_label: pair.pair_label || selectedPairLabel(pair),
    source: pair.source || null,
    source_label: waxonedgeSourceDisplayLabel(pair.source),
    source_logo_key: waxonedgeSourceLogoKey(pair.source),
    pair_id: pair.pair_id || null,
    og_laststats_pair_id: pair.og_laststats_pair_id || null,
    fee_bps: pair.fee_bps ?? null,
    is_selected_price_pair: isSelected,
    is_direct_wax_pair: !!pair.direct_wax_pair,
    liquidity_wax: safeDecimal(liquidityWax),
    liquidity_usd: safeDecimal(liquidityUsd),
    price: safeDecimal(price),
    pair_price: safeDecimal(price),
    price_usd: safeDecimal(priceUsd),
    change_24h: safeDecimal(change24h),
    volume_24h_wax: safeDecimal(volumeWax),
    volume_24h_usd: safeDecimal(volumeUsd),
    volume_24h_a_native: safeDecimal(asNumber(pair.volume_24h_a_native ?? pair.volume_a_native)),
    volume_24h_b_native: safeDecimal(asNumber(pair.volume_24h_b_native ?? pair.volume_b_native)),
    volume_a_native: safeDecimal(asNumber(pair.volume_a_native ?? pair.volume_24h_a_native)),
    volume_b_native: safeDecimal(asNumber(pair.volume_b_native ?? pair.volume_24h_b_native)),
    volume_7d_wax: safeDecimal(volume7dWax),
    volume_7d_usd: safeDecimal(volume7dUsd),
    volume_7d_a_native: safeDecimal(asNumber(pair.volume_7d_a_native)),
    volume_7d_b_native: safeDecimal(asNumber(pair.volume_7d_b_native)),
    volume_30d_wax: safeDecimal(volume30dWax),
    volume_30d_usd: safeDecimal(volume30dUsd),
    volume_30d_a_native: safeDecimal(asNumber(pair.volume_30d_a_native)),
    volume_30d_b_native: safeDecimal(asNumber(pair.volume_30d_b_native)),
    volume_native_source: pair.volume_native_source || null,
    proof_label: reasonCodes.length ? reason : (isSelected ? 'selected direct WAX price proof' : 'reserve-backed valuation'),
    reason,
    token_a_contract: pair.token_a_contract || null,
    token_a_symbol: pair.token_a_symbol || null,
    token_a_icon: pair.token_a_icon || pair.token_a_logo || null,
    token_a_logo: pair.token_a_logo || pair.token_a_icon || null,
    token_b_contract: pair.token_b_contract || null,
    token_b_symbol: pair.token_b_symbol || null,
    token_b_icon: pair.token_b_icon || pair.token_b_logo || null,
    token_b_logo: pair.token_b_logo || pair.token_b_icon || null,
    no_fake_value: true,
    proof_details: {
      reserve_ratio: pair.pair_price_relative_to_waxcash || null,
      reason_codes: reasonCodes,
      direct_wax_pair: !!pair.direct_wax_pair,
      paired_token_og_wax_price: pair.paired_token_og_wax_price || null,
      paired_token_reserve_ratio_wax_price: pair.paired_token_reserve_ratio_wax_price || null,
      valuation_basis: pair.valuation_basis || null,
      valuation_debug: pair.valuation_debug || null,
      status,
      status_label: statusLabel,
      reserve_a: pair.reserve_a || null,
      reserve_b: pair.reserve_b || null,
      metric_sources: pair.metric_sources || null,
      og_laststats_debug: pair.og_laststats_debug || null,
    },
  };
}

async function waxcashPairSourceStabilityDiagnostics(db, options = {}) {
  const rawRows = options.rawRows || [];
  const proofPairs = options.proofPairs || [];
  const tableRows = options.tableRows || [];
  const sourceStates = db ? await getSourceIndexStates(db).catch(() => []) : [];
  const latestSyncRows = db ? await getLatestSync(db).catch(() => []) : [];
  const sourceStateRows = (sourceStates || [])
    .filter((row) => ['swap.nefty', 'swap.taco', 'swap.alcor', 'alcor', 'alcordexmain'].includes(aggregateSourceKey(row.source)))
    .map((row) => ({
      source: row.source,
      normalized_source: aggregateSourceKey(row.source),
      status: row.status || null,
      complete: asNumber(row.complete) === 1,
      truncated: asNumber(row.truncated) === 1,
      row_count: asNumber(row.row_count) || 0,
      cursor: row.cursor || '',
      updated_at: row.updated_at || null,
      error: row.error || null,
    }));
  const latestPairSyncRows = (latestSyncRows || [])
    .filter((row) => ['swap.nefty', 'swap.taco', 'swap.alcor', 'alcor', 'alcordexmain'].includes(aggregateSourceKey(row.source)))
    .slice(0, 20)
    .map((row) => ({
      source: row.source,
      normalized_source: aggregateSourceKey(row.source),
      status: row.status || null,
      started_at: row.started_at || null,
      finished_at: row.finished_at || null,
      error: row.error || null,
    }));
  const proofSourceCounts = countRowsByAggregateSource(proofPairs);
  const tableSourceCounts = countRowsByAggregateSource(tableRows);
  const rawSourceCounts = countRowsByAggregateSource(rawRows);
  const validReserveButUnvalued = (proofPairs || []).filter((pair) =>
    hasRealPairReserves(pair) && asNumber(pair.pair_liquidity_wax) == null);
  const reserveRatioValued = (proofPairs || []).filter((pair) =>
    pair?.valuation_basis === 'waxcash_reserve_ratio_from_selected_waxcash_price');
  const nonWaxRejectedPairedTokenPrice = (proofPairs || []).filter((pair) =>
    !pair.direct_wax_pair && Array.isArray(pair.reason_codes) && pair.reason_codes.includes('paired_token_wax_price_unavailable'));
  const partialSourceStates = sourceStateRows.filter((row) =>
    ['partial', 'running'].includes(row.status) || (row.complete === false && row.status !== 'success'));
  return {
    no_visible_ui: true,
    diagnostic_generated_at: nowIso(),
    cache_control_expected: 'no-store',
    cache_bust_recommended: true,
    response_cache_note: 'Compare diagnostic_generated_at plus row/source counts across cache-busted requests to detect stale API responses.',
    raw_load_waxcash_pair_row_count: rawRows.length,
    proof_all_pairs_count: proofPairs.length,
    pair_table_row_count: tableRows.length,
    source_counts: {
      raw_load_waxcash_pair_rows: rawSourceCounts,
      proof_all_pairs: proofSourceCounts,
      pair_table_rows: tableSourceCounts,
    },
    rows_with_liquidity_wax_not_null: tableRows.filter((row) => asNumber(row.liquidity_wax) != null).length,
    proof_rows_with_pair_liquidity_wax_not_null: proofPairs.filter((pair) => asNumber(pair.pair_liquidity_wax) != null).length,
    reserve_ratio_waxcash_valued_pair_count: reserveRatioValued.length,
    rows_with_valid_reserves_but_pair_liquidity_wax_null: validReserveButUnvalued.length,
    direct_wax_pair_count: proofPairs.filter((pair) => !!pair.direct_wax_pair).length,
    non_wax_pair_rejected_paired_token_wax_price_unavailable_count: nonWaxRejectedPairedTokenPrice.length,
    valuation_rejection_counts: waxcashPairSummary(proofPairs).unavailable_reason_counts || {},
    source_sync_partial_or_running: partialSourceStates.length > 0,
    source_sync_partial_or_running_sources: partialSourceStates,
    source_index_state_rows: sourceStateRows,
    latest_pair_sync_rows: latestPairSyncRows,
    possible_partial_pair_refresh: partialSourceStates.length > 0,
    source_sync_deleting_or_replacing_pairs_proven: false,
    source_sync_deleting_or_replacing_pairs_note: 'This response can detect partial/running source state and row-count drift across requests; it does not mutate pair rows.',
    no_fake_value: true,
  };
}

function waxcashBuildPairTableSection(pairs = [], selectedWaxPool = null) {
  const rows = (pairs || []).map((pair) => waxcashPairTableRow(pair, selectedWaxPool));
  rows.sort((a, b) => {
    if (a.is_selected_price_pair !== b.is_selected_price_pair) return a.is_selected_price_pair ? -1 : 1;
    if (a.is_direct_wax_pair !== b.is_direct_wax_pair) return a.is_direct_wax_pair ? -1 : 1;
    const aLive = asNumber(a.liquidity_wax) != null || asNumber(a.liquidity_usd) != null;
    const bLive = asNumber(b.liquidity_wax) != null || asNumber(b.liquidity_usd) != null;
    if (aLive !== bLive) return aLive ? -1 : 1;
    return (asNumber(b.liquidity_wax) || 0) - (asNumber(a.liquidity_wax) || 0) ||
      String(a.pair_label || '').localeCompare(String(b.pair_label || ''));
  });
  return {
    rows,
    row_count: rows.length,
    selected_pair_id: selectedWaxPool?.pair_id || null,
    metric_debug: {
      no_visible_ui: true,
      rows: rows.map((row) => {
        const ogDebug24h = row.proof_details?.og_laststats_debug?.volume_24h || null;
        const ogDebug7d = row.proof_details?.og_laststats_debug?.volume_7d || null;
        const ogDebug30d = row.proof_details?.og_laststats_debug?.volume_30d || null;
        const indexedWindowDebug = row.proof_details?.metric_sources?.indexed_trade_window_debug || null;
        const latestIndexedTradeTime = [
          ogDebug24h?.latest_indexed_trade_time,
          ogDebug7d?.latest_indexed_trade_time,
          ogDebug30d?.latest_indexed_trade_time,
          row.proof_details?.metric_sources?.latest_indexed_trade_time,
        ].filter(Boolean).sort().pop() || null;
        const volume24hUnavailableReason = asNumber(row.volume_24h_wax) != null || asNumber(row.volume_24h_a_native) != null || asNumber(row.volume_24h_b_native) != null
          ? null
          : (row.proof_details?.metric_sources?.volume_24h_native?.reason ||
            row.proof_details?.metric_sources?.volume_24h_wax?.reason ||
            indexedWindowDebug?.volume_24h_reason ||
            ogDebug24h?.reason ||
            null);
        return {
          source: row.source,
          displayed_pair_id: row.pair_id,
          pair_id: row.pair_id,
          og_laststats_pair_id: row.og_laststats_pair_id || null,
          mapped_og_srcType: ogDebug24h?.mapped_og_srcType || null,
          mapped_og_src: ogDebug24h?.mapped_og_src || null,
          exact_og_bucket_path_checked: ogDebug24h?.exact_og_bucket_path_checked || null,
          og_bucket_exists: ogDebug24h?.og_bucket_exists ?? false,
          internal_laststats_bucket_exists: ogDebug24h?.internal_laststats_bucket_exists ?? false,
          internal_laststats_matched_key: ogDebug24h?.internal_laststats_matched_key || null,
          internal_volumeA: ogDebug24h?.internal_volumeA ?? null,
          internal_volumeB: ogDebug24h?.internal_volumeB ?? null,
          internal_volumeA_24h: ogDebug24h?.internal_volumeA ?? null,
          internal_volumeB_24h: ogDebug24h?.internal_volumeB ?? null,
          internal_volumeA_7d: ogDebug7d?.internal_volumeA ?? null,
          internal_volumeB_7d: ogDebug7d?.internal_volumeB ?? null,
          internal_volumeA_30d: ogDebug30d?.internal_volumeA ?? null,
          internal_volumeB_30d: ogDebug30d?.internal_volumeB ?? null,
          first_20_og_bucket_keys: ogDebug24h?.first_20_og_bucket_keys || [],
          lookup_keys_attempted: ogDebug24h?.lookup_keys_attempted || null,
          matched_key: ogDebug24h?.matched_key || null,
          match_priority: ogDebug24h?.match_priority || null,
          laststats_source: ogDebug24h?.laststats_source || null,
          volumeA: ogDebug24h?.volumeA ?? null,
          volumeB: ogDebug24h?.volumeB ?? null,
          reason: ogDebug24h?.reason || null,
          og_laststats_volume_24h: row.proof_details?.og_laststats_debug?.volume_24h || null,
          og_laststats_volume_7d: row.proof_details?.og_laststats_debug?.volume_7d || null,
          og_laststats_volume_30d: row.proof_details?.og_laststats_debug?.volume_30d || null,
          volume_24h_wax_source: row.proof_details?.metric_sources?.volume_24h_wax?.source || null,
          volume_7d_wax_source: row.proof_details?.metric_sources?.volume_7d_wax?.source || null,
          volume_30d_wax_source: row.proof_details?.metric_sources?.volume_30d_wax?.source || null,
          volume_24h_native_source: row.proof_details?.metric_sources?.volume_24h_native?.source || null,
          volume_7d_native_source: row.proof_details?.metric_sources?.volume_7d_native?.source || null,
          volume_30d_native_source: row.proof_details?.metric_sources?.volume_30d_native?.source || null,
          change_24h_source: row.proof_details?.metric_sources?.change_24h?.source || null,
          change_24h_reason: row.proof_details?.metric_sources?.change_24h?.reason || null,
          change_24h_row_count: row.proof_details?.metric_sources?.change_24h?.row_count || 0,
          latest_price_sample: indexedWindowDebug?.latest_price_sample || null,
          prior_24h_price_sample: indexedWindowDebug?.prior_24h_price_sample || null,
          price_sample_count: indexedWindowDebug?.price_sample_count || 0,
          latest_indexed_trade_time: latestIndexedTradeTime,
          trade_row_count_24h: row.proof_details?.og_laststats_debug?.volume_24h?.trade_row_count || 0,
          trade_row_count_7d: row.proof_details?.og_laststats_debug?.volume_7d?.trade_row_count || 0,
          trade_row_count_30d: row.proof_details?.og_laststats_debug?.volume_30d?.trade_row_count || 0,
          row_count_24h: row.proof_details?.og_laststats_debug?.volume_24h?.trade_row_count || row.proof_details?.metric_sources?.volume_24h_wax?.row_count || 0,
          row_count_7d: row.proof_details?.og_laststats_debug?.volume_7d?.trade_row_count || row.proof_details?.metric_sources?.volume_7d_wax?.row_count || 0,
          row_count_30d: row.proof_details?.og_laststats_debug?.volume_30d?.trade_row_count || row.proof_details?.metric_sources?.volume_30d_wax?.row_count || 0,
          volume_24h_unavailable_reason: volume24hUnavailableReason,
          volume_24h_wax_reason: row.proof_details?.metric_sources?.volume_24h_wax?.reason || null,
          volume_24h_native_reason: row.proof_details?.metric_sources?.volume_24h_native?.reason || null,
          indexed_trade_window_debug: indexedWindowDebug,
        };
      }),
    },
    no_fake_value: true,
  };
}

function waxonedgeOgApiBase(env) {
  const raw = String(env?.WAXONEDGE_OG_API_BASE || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return '';
    return url.toString().replace(/\/+$/, '');
  } catch (_) {
    return '';
  }
}

async function fetchWaxonedgeOgJson(env, path) {
  const base = waxonedgeOgApiBase(env);
  if (!base) return { ok: false, reason: 'waxonedge_og_api_base_not_configured' };
  const cleanPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  try {
    const response = await fetch(`${base}${cleanPath}`, {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 30, cacheEverything: false },
    });
    if (!response.ok) return { ok: false, reason: `waxonedge_og_api_http_${response.status}` };
    const contentType = response.headers.get('content-type') || '';
    if (!/json/i.test(contentType)) return { ok: false, reason: 'waxonedge_og_api_non_json_response' };
    return { ok: true, data: await response.json(), source: `${base}${cleanPath}` };
  } catch (error) {
    return { ok: false, reason: `waxonedge_og_api_fetch_failed:${error?.message || String(error)}` };
  }
}

function lastStatsWindowDefinitions() {
  return [
    { duration: '24h', millis: 24 * 60 * 60 * 1000 },
    { duration: '7d', millis: 7 * 24 * 60 * 60 * 1000 },
    { duration: '30d', millis: 30 * 24 * 60 * 60 * 1000 },
  ];
}

function markLastStatsSource(stats, source) {
  if (!stats || typeof stats !== 'object') return stats;
  Object.defineProperty(stats, '__laststats_source', {
    value: source,
    configurable: true,
  });
  return stats;
}

function lastStatsSource(stats) {
  return stats && typeof stats === 'object' ? (stats.__laststats_source || null) : null;
}

function emptyLastVolumesShape() {
  const out = {};
  for (const { duration } of lastStatsWindowDefinitions()) {
    out[duration] = {
      tokens: {},
      pools: {},
      poolsv3: {},
      markets: {},
    };
  }
  return out;
}

function internalLastStatsPairSideVolumes(trade, pair) {
  const raw = parseTradeRawJson(trade);
  const sideAKey = tokenKey(pair?.token_a_contract, pair?.token_a_symbol);
  const sideBKey = tokenKey(pair?.token_b_contract, pair?.token_b_symbol);
  const addAssetSide = (current, contract, symbol, amount) => {
    const numeric = asNumber(amount);
    if (numeric == null) return current;
    const key = tokenKey(contract, symbol);
    if (key && key === sideAKey) return { ...current, volumeA: (current.volumeA || 0) + Math.abs(numeric) };
    if (key && key === sideBKey) return { ...current, volumeB: (current.volumeB || 0) + Math.abs(numeric) };
    return current;
  };
  const addSymbolSide = (current, symbol, amount) => {
    const numeric = asNumber(amount);
    const normalized = normalizeSymbol(symbol);
    if (numeric == null || !normalized) return current;
    if (normalized === normalizeSymbol(pair?.token_a_symbol)) return { ...current, volumeA: (current.volumeA || 0) + Math.abs(numeric) };
    if (normalized === normalizeSymbol(pair?.token_b_symbol)) return { ...current, volumeB: (current.volumeB || 0) + Math.abs(numeric) };
    return current;
  };
  let volumes = {};
  volumes = addSymbolSide(volumes, raw.code_in, raw.amount_in);
  volumes = addSymbolSide(volumes, raw.code_out, raw.amount_out);
  volumes = addSymbolSide(volumes, raw.code_ask, raw.amount_ask);
  volumes = addSymbolSide(volumes, raw.code_bid, raw.amount_bid);
  const askAsset = parseAsset(raw.ask);
  if (askAsset.amount != null) volumes = addSymbolSide(volumes, askAsset.symbol, askAsset.amount);
  const bidAsset = parseAsset(raw.bid);
  if (bidAsset.amount != null) volumes = addSymbolSide(volumes, bidAsset.symbol, bidAsset.amount);
  const storedAmount = asNumber(trade?.amount ?? trade?.volume);
  if ((volumes.volumeA == null && volumes.volumeB == null) && storedAmount != null) {
    volumes = addAssetSide(volumes, trade?.contract, trade?.symbol, storedAmount);
  }
  return {
    volumeA: asNumber(volumes.volumeA),
    volumeB: asNumber(volumes.volumeB),
  };
}

function addInternalLastStatsVolume(lastVolumes, duration, pair, trade, tradedMs) {
  const ref = waxcashOgPairRef(pair);
  if (!ref?.srcType || !ref?.src) return false;
  const pairId = safeString(ref.pair_id || pair?.og_laststats_pair_id || pair?.pair_id);
  if (!pairId) return false;
  const sideVolumes = internalLastStatsPairSideVolumes(trade, pair);
  if (sideVolumes.volumeA == null && sideVolumes.volumeB == null) return false;
  const bucketRoot = lastVolumes[duration] ||= { tokens: {}, pools: {}, poolsv3: {}, markets: {} };
  const sourceTypeBucket = bucketRoot[ref.srcType] ||= {};
  const bucket = sourceTypeBucket[ref.src] ||= {};
  const row = bucket[pairId] ||= {
    volumeA: null,
    volumeB: null,
    source: 'internal_d1_laststats',
    row_count: 0,
    latest_indexed_trade_time: null,
    no_fake_value: true,
  };
  if (sideVolumes.volumeA != null) row.volumeA = safeDecimal((asNumber(row.volumeA) || 0) + sideVolumes.volumeA);
  if (sideVolumes.volumeB != null) row.volumeB = safeDecimal((asNumber(row.volumeB) || 0) + sideVolumes.volumeB);
  row.row_count += 1;
  if (!row.latest_indexed_trade_time || tradedMs > Date.parse(row.latest_indexed_trade_time)) {
    row.latest_indexed_trade_time = new Date(tradedMs).toISOString();
  }
  return true;
}

async function buildInternalD1WaxcashLastStats(db, pairs = null) {
  const pairRows = pairs || await loadWaxcashOgPairRows(db);
  const pairProofByKey = buildWaxcashTradePairProofMap(pairRows);
  const latest = await waxcashLatestIndexedTradeAt(db, pairRows);
  const latestMs = Date.parse(latest?.latest_trade_at || '');
  if (!Number.isFinite(latestMs)) {
    return {
      ok: false,
      lastVolumes: markLastStatsSource(emptyLastVolumesShape(), 'internal_d1_laststats'),
      reason: 'internal_laststats_no_trade_rows',
      latest_trade_at: null,
      rows_scanned: 0,
      rows_used: 0,
      query_chunk_count: latest.query_chunk_count || 0,
      trade_rows_query_error: latest.trade_rows_query_error || null,
      no_fake_value: true,
    };
  }
  const windows = lastStatsWindowDefinitions();
  const since30dMs = latestMs - windows.find((window) => window.duration === '30d').millis;
  const selectedRows = await waxcashSelectIndexedTradeRows(db, pairRows, { sinceIso: new Date(since30dMs).toISOString() });
  const rows = selectedRows.rows;
  const lastVolumes = emptyLastVolumesShape();
  let rowsUsed = 0;
  for (const row of rows) {
    const tradedMs = Date.parse(row?.traded_at || '');
    if (!Number.isFinite(tradedMs) || tradedMs < since30dMs) continue;
    const pair = pairProofByKey.get(waxcashTradePairKey(row?.source, row?.pair_id));
    if (!pair) continue;
    let used = false;
    for (const window of windows) {
      if (tradedMs >= latestMs - window.millis) {
        used = addInternalLastStatsVolume(lastVolumes, window.duration, pair, row, tradedMs) || used;
      }
    }
    if (used) rowsUsed += 1;
  }
  markLastStatsSource(lastVolumes, 'internal_d1_laststats');
  return {
    ok: rowsUsed > 0,
    lastVolumes,
    reason: rowsUsed > 0 ? null : 'internal_laststats_no_trade_rows',
    latest_trade_at: latest.latest_trade_at,
    rows_scanned: rows.length,
    rows_used: rowsUsed,
    query_chunk_count: selectedRows.query_chunk_count,
    trade_rows_query_error: latest.trade_rows_query_error || selectedRows.trade_rows_query_error || null,
    no_fake_value: true,
  };
}

async function fetchWaxcashOgLastStats(env) {
  const internal = env?.DB
    ? await buildInternalD1WaxcashLastStats(env.DB).catch((error) => ({
      ok: false,
      lastVolumes: markLastStatsSource(emptyLastVolumesShape(), 'internal_d1_laststats'),
      reason: `internal_d1_laststats_failed:${error?.message || String(error)}`,
      rows_scanned: 0,
      rows_used: 0,
      no_fake_value: true,
    }))
    : { ok: false, lastVolumes: null, reason: 'd1_not_configured', rows_scanned: 0, rows_used: 0 };
  const [externalLastVolumes, lastPriceChanges] = await Promise.all([
    fetchWaxonedgeOgJson(env, '/lastVolumes'),
    fetchWaxonedgeOgJson(env, '/lastPriceChanges'),
  ]);
  const useInternalVolumes = internal.ok || !externalLastVolumes.ok;
  const selectedLastVolumes = useInternalVolumes ? internal.lastVolumes : markLastStatsSource(externalLastVolumes.data, 'og_api_laststats');
  return {
    lastVolumes: selectedLastVolumes || null,
    lastPriceChanges: lastPriceChanges.ok ? lastPriceChanges.data : null,
    sources: {
      lastVolumes: useInternalVolumes ? 'internal_d1_laststats' : (externalLastVolumes.source || null),
      lastVolumes_external: externalLastVolumes.source || null,
      lastPriceChanges: lastPriceChanges.source || null,
    },
    reasons: [
      internal.ok ? null : internal.reason,
      externalLastVolumes.ok ? null : externalLastVolumes.reason,
      lastPriceChanges.ok ? null : lastPriceChanges.reason,
    ].filter(Boolean),
    live: !!(internal.ok || externalLastVolumes.ok || lastPriceChanges.ok),
    laststats_source: useInternalVolumes
      ? (internal.ok ? 'internal_d1_laststats' : 'unavailable')
      : 'og_api_laststats',
    internal_laststats: {
      ok: internal.ok,
      reason: internal.reason || null,
      latest_trade_at: internal.latest_trade_at || null,
      rows_scanned: asNumber(internal.rows_scanned) || 0,
      rows_used: asNumber(internal.rows_used) || 0,
      query_chunk_count: asNumber(internal.query_chunk_count) || 0,
      trade_rows_query_error: internal.trade_rows_query_error || null,
    },
    external_laststats: {
      ok: externalLastVolumes.ok,
      reason: externalLastVolumes.reason || null,
      source: externalLastVolumes.source || null,
    },
    no_fake_value: true,
  };
}

function sanitizedWaxonedgeOgBase(env) {
  const configured = safeString(env?.WAXONEDGE_OG_API_BASE);
  const base = waxonedgeOgApiBase(env);
  if (!base) {
    return {
      configured: !!configured,
      valid: false,
      host: null,
      origin: null,
      path: null,
      reason: configured ? 'waxonedge_og_api_base_invalid' : 'waxonedge_og_api_base_not_configured',
    };
  }
  try {
    const url = new URL(base);
    return {
      configured: true,
      valid: true,
      host: url.host,
      origin: url.origin,
      path: url.pathname && url.pathname !== '/' ? url.pathname : '',
      reason: null,
    };
  } catch (_) {
    return {
      configured: true,
      valid: false,
      host: null,
      origin: null,
      path: null,
      reason: 'waxonedge_og_api_base_invalid',
    };
  }
}

async function fetchWaxonedgeOgDiagnosticJson(env, path) {
  const base = waxonedgeOgApiBase(env);
  const cleanPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  if (!base) {
    return {
      ok: false,
      endpoint_path: cleanPath,
      http_status: null,
      content_type: null,
      reason: 'waxonedge_og_api_base_not_configured',
      data: null,
    };
  }
  try {
    const response = await fetch(`${base}${cleanPath}`, {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 30, cacheEverything: false },
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      return {
        ok: false,
        endpoint_path: cleanPath,
        http_status: response.status,
        content_type: contentType,
        reason: `waxonedge_og_api_http_${response.status}`,
        data: null,
      };
    }
    if (!/json/i.test(contentType)) {
      return {
        ok: false,
        endpoint_path: cleanPath,
        http_status: response.status,
        content_type: contentType,
        reason: 'waxonedge_og_api_non_json_response',
        data: null,
      };
    }
    return {
      ok: true,
      endpoint_path: cleanPath,
      http_status: response.status,
      content_type: contentType,
      reason: null,
      data: await response.json(),
    };
  } catch (error) {
    return {
      ok: false,
      endpoint_path: cleanPath,
      http_status: null,
      content_type: null,
      reason: `waxonedge_og_api_fetch_failed:${error?.message || String(error)}`,
      data: null,
    };
  }
}

function diagnosticObjectKeys(value, limit = 50) {
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).slice(0, Math.max(1, Math.min(250, Math.floor(asNumber(limit) || 50))));
}

function ogLastVolumesBucketDiagnostics(lastVolumes) {
  const duration24h = lastVolumes?.['24h'];
  const pools = duration24h?.pools;
  const poolKeys = diagnosticObjectKeys(pools);
  return {
    top_level_keys: diagnosticObjectKeys(lastVolumes),
    keys_24h: diagnosticObjectKeys(duration24h),
    keys_24h_pools: poolKeys,
    buckets: {
      neftyblocks: {
        exists: !!(pools && typeof pools === 'object' && pools.neftyblocks && typeof pools.neftyblocks === 'object'),
        first_20_keys: diagnosticObjectKeys(pools?.neftyblocks, 20),
      },
      taco: {
        exists: !!(pools && typeof pools === 'object' && pools.taco && typeof pools.taco === 'object'),
        first_20_keys: diagnosticObjectKeys(pools?.taco, 20),
      },
    },
  };
}

async function waxcashOgLastStatsIdCounts(db) {
  const columns = await db.prepare(`PRAGMA table_info(waxonedge_pairs)`).all().catch((error) => ({
    results: [],
    error: error?.message || String(error),
  }));
  const columnNames = (columns.results || []).map((row) => safeString(row.name));
  const migrationApplied = columnNames.includes('og_laststats_pair_id');
  if (!migrationApplied) {
    return {
      migration_027_applied: false,
      total_waxcash_pair_rows: null,
      og_laststats_pair_id_not_null: null,
      og_laststats_pair_id_null: null,
      reason: columns.error || 'og_laststats_pair_id_column_missing',
    };
  }
  const counts = await db.prepare(
    `SELECT COUNT(*) AS total_waxcash_pair_rows,
            SUM(CASE WHEN og_laststats_pair_id IS NOT NULL AND og_laststats_pair_id != '' THEN 1 ELSE 0 END) AS og_laststats_pair_id_not_null,
            SUM(CASE WHEN og_laststats_pair_id IS NULL OR og_laststats_pair_id = '' THEN 1 ELSE 0 END) AS og_laststats_pair_id_null
     FROM waxonedge_pairs
     WHERE (LOWER(token_a_contract) = ? AND UPPER(token_a_symbol) = ?)
        OR (LOWER(token_b_contract) = ? AND UPPER(token_b_symbol) = ?)`
  ).bind(WAXCASH_CONTRACT, WAXCASH_SYMBOL, WAXCASH_CONTRACT, WAXCASH_SYMBOL).first().catch((error) => ({
    error: error?.message || String(error),
  }));
  if (counts?.error) {
    return {
      migration_027_applied: true,
      total_waxcash_pair_rows: null,
      og_laststats_pair_id_not_null: null,
      og_laststats_pair_id_null: null,
      reason: counts.error,
    };
  }
  return {
    migration_027_applied: true,
    total_waxcash_pair_rows: asNumber(counts?.total_waxcash_pair_rows) || 0,
    og_laststats_pair_id_not_null: asNumber(counts?.og_laststats_pair_id_not_null) || 0,
    og_laststats_pair_id_null: asNumber(counts?.og_laststats_pair_id_null) || 0,
    reason: null,
  };
}

async function waxcashSourceSyncDiagnostics(db, sources = ['swap.nefty', 'swap.taco']) {
  const placeholders = sources.map(() => '?').join(',');
  const sourceStates = await db.prepare(
    `SELECT source, sync_cycle_id, cursor, page_count, row_count, complete, truncated,
            status, error, started_at, updated_at
     FROM waxonedge_source_index_state
     WHERE source IN (${placeholders})
     ORDER BY source ASC`
  ).bind(...sources).all().then((result) => result.results || []).catch(() => []);
  const latestRuns = await db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     WHERE source IN (${placeholders})
     ORDER BY started_at DESC
     LIMIT 20`
  ).bind(...sources).all().then((result) => result.results || []).catch(() => []);
  const latestBySource = {};
  for (const row of latestRuns) {
    if (!latestBySource[row.source]) latestBySource[row.source] = row;
  }
  return sources.reduce((out, source) => {
    out[source] = {
      source_index_state: sourceStates.find((row) => row.source === source) || null,
      latest_sync_run: latestBySource[source] || null,
    };
    return out;
  }, {});
}

function waxcashTradeDiagnosticSources(pairs = []) {
  const sourceNames = new Set([
    'alcor',
    'swap.alcor',
    'swap.taco',
    'swap.nefty',
    'swap.box',
    'swap.adex',
    ALCOR_TRADE_INDEX_SOURCE,
    AMM_TRADE_INDEX_SOURCE,
    LIVE_INDEXER_HISTORY_SOURCE,
  ]);
  for (const pair of pairs || []) {
    for (const source of candleTradeSourceNamesFor(pair?.source)) sourceNames.add(source);
  }
  return [...sourceNames].filter(Boolean);
}

function waxcashTradeDiagnosticSample(row) {
  const raw = parseTradeRawJson(row);
  return {
    source: row?.source || null,
    trade_id: row?.trade_id || null,
    pair_id: row?.pair_id || null,
    contract: row?.contract || null,
    symbol: row?.symbol || null,
    amount: row?.amount ?? null,
    volume: row?.volume ?? null,
    traded_at: row?.traded_at || null,
    raw_json_keys: diagnosticObjectKeys(raw, 30),
  };
}

async function waxcashTradeRowDiagnostics(db, pairs = null) {
  if (!db) {
    return {
      ok: false,
      reason: 'd1_not_configured',
      total_trade_rows: null,
      waxcash_related_trade_rows: null,
      latest_waxcash_trade_at: null,
      rows_by_source: [],
      latest_traded_at_by_source: {},
      sample_waxcash_trade_rows: [],
      pair_id_matches_current_pair_id_count: null,
      pair_id_matches_og_laststats_pair_id_count: null,
    };
  }
  const pairRows = pairs || await loadWaxcashOgPairRows(db).catch(() => []);
  const sources = waxcashTradeDiagnosticSources(pairRows);
  const sourcePlaceholders = sources.map(() => '?').join(',');
  const { displayPairKeys, ogPairKeys } = waxcashTradePairKeySets(pairRows);
  const totalRow = await db.prepare(
    `SELECT COUNT(*) AS count FROM waxonedge_trades`
  ).first().catch((error) => ({ error: error?.message || String(error) }));
  const rowsBySource = sourcePlaceholders ? await db.prepare(
    `SELECT source, COUNT(*) AS row_count, MAX(traded_at) AS latest_traded_at
     FROM waxonedge_trades
     WHERE source IN (${sourcePlaceholders})
     GROUP BY source
     ORDER BY row_count DESC, source ASC`
  ).bind(...sources).all().then((result) => result.results || []).catch(() => []) : [];
  const waxcashCount = await waxcashIndexedTradeRowCount(db, pairRows);
  const sampleResult = await waxcashSelectIndexedTradeRows(db, pairRows, {
    selectColumns: 'source, trade_id, pair_id, contract, symbol, amount, volume, traded_at, raw_json',
    limit: 10,
  });
  const sampleRows = sampleResult.rows;
  const sourcePairGroups = sourcePlaceholders ? await db.prepare(
    `SELECT source, pair_id, COUNT(*) AS row_count, MAX(traded_at) AS latest_traded_at
     FROM waxonedge_trades
     WHERE source IN (${sourcePlaceholders})
       AND pair_id IS NOT NULL
       AND pair_id != ''
     GROUP BY source, pair_id
     ORDER BY row_count DESC, latest_traded_at DESC
     LIMIT 500`
  ).bind(...sources).all().then((result) => result.results || []).catch(() => []) : [];
  let displayMatchCount = 0;
  let ogMatchCount = 0;
  const matchedGroups = [];
  const unmatchedGroups = [];
  for (const group of sourcePairGroups) {
    const key = waxcashTradePairKey(group.source, group.pair_id);
    const displayMatch = displayPairKeys.has(key);
    const ogMatch = ogPairKeys.has(key);
    if (displayMatch) displayMatchCount += asNumber(group.row_count) || 0;
    if (ogMatch) ogMatchCount += asNumber(group.row_count) || 0;
    const shaped = {
      source: group.source || null,
      pair_id: group.pair_id || null,
      row_count: asNumber(group.row_count) || 0,
      latest_traded_at: group.latest_traded_at || null,
      matches_current_pair_id: displayMatch,
      matches_og_laststats_pair_id: ogMatch,
    };
    if (displayMatch || ogMatch) matchedGroups.push(shaped);
    else if (unmatchedGroups.length < 20) unmatchedGroups.push(shaped);
  }
  return {
    ok: (asNumber(waxcashCount?.row_count) || 0) > 0,
    reason: waxcashCount?.trade_rows_query_error || ((asNumber(waxcashCount?.row_count) || 0) > 0 ? null : 'no_waxcash_trade_rows_indexed'),
    total_trade_rows: totalRow?.error ? null : (asNumber(totalRow?.count) || 0),
    total_trade_rows_error: totalRow?.error || null,
    waxcash_related_trade_rows: waxcashCount?.trade_rows_query_error ? null : (asNumber(waxcashCount?.row_count) || 0),
    latest_waxcash_trade_at: waxcashCount?.latest_traded_at || null,
    query_chunk_count: Math.max(asNumber(waxcashCount?.query_chunk_count) || 0, asNumber(sampleResult.query_chunk_count) || 0),
    trade_rows_query_error: waxcashCount?.trade_rows_query_error || sampleResult.trade_rows_query_error || null,
    rows_by_source: rowsBySource.map((row) => ({
      source: row.source || null,
      row_count: asNumber(row.row_count) || 0,
      latest_traded_at: row.latest_traded_at || null,
    })),
    latest_traded_at_by_source: rowsBySource.reduce((out, row) => {
      out[row.source] = row.latest_traded_at || null;
      return out;
    }, {}),
    sample_waxcash_trade_rows: sampleRows.map(waxcashTradeDiagnosticSample),
    pair_id_matches_current_pair_id_count: displayMatchCount,
    pair_id_matches_og_laststats_pair_id_count: ogMatchCount,
    matching_source_pair_groups: matchedGroups.slice(0, 50),
    unmatched_source_pair_groups_sample: unmatchedGroups,
    source_filters: sources,
    no_fake_value: true,
  };
}

async function getWaxcashLastStatsDiagnostics(env) {
  const ogBase = sanitizedWaxonedgeOgBase(env);
  const pairRows = env?.DB ? await loadWaxcashOgPairRows(env.DB).catch(() => []) : [];
  const [lastVolumes, internal, d1, source_sync, trade_rows] = await Promise.all([
    fetchWaxonedgeOgDiagnosticJson(env, '/lastVolumes'),
    env?.DB ? buildInternalD1WaxcashLastStats(env.DB, pairRows).catch((error) => ({
      ok: false,
      lastVolumes: markLastStatsSource(emptyLastVolumesShape(), 'internal_d1_laststats'),
      reason: `internal_d1_laststats_failed:${error?.message || String(error)}`,
      latest_trade_at: null,
      rows_scanned: 0,
      rows_used: 0,
    })) : Promise.resolve({
      ok: false,
      lastVolumes: null,
      reason: 'd1_not_configured',
      latest_trade_at: null,
      rows_scanned: 0,
      rows_used: 0,
    }),
    waxcashOgLastStatsIdCounts(env.DB),
    waxcashSourceSyncDiagnostics(env.DB, ['swap.nefty', 'swap.taco', 'swap.alcor', ALCOR_TRADE_INDEX_SOURCE, AMM_TRADE_INDEX_SOURCE, LIVE_INDEXER_HISTORY_SOURCE]),
    waxcashTradeRowDiagnostics(env.DB, pairRows),
  ]);
  const selectedLastVolumes = internal.ok ? internal.lastVolumes : (lastVolumes.ok ? markLastStatsSource(lastVolumes.data, 'og_api_laststats') : null);
  const bucketDiagnostics = selectedLastVolumes ? ogLastVolumesBucketDiagnostics(selectedLastVolumes) : ogLastVolumesBucketDiagnostics(null);
  const externalBucketDiagnostics = lastVolumes.ok ? ogLastVolumesBucketDiagnostics(lastVolumes.data) : ogLastVolumesBucketDiagnostics(null);
  const selectedSource = internal.ok ? 'internal_d1_laststats' : (lastVolumes.ok ? 'og_api_laststats' : 'unavailable');
  return {
    ok: !!(selectedSource !== 'unavailable' && d1.migration_027_applied),
    diagnostic_only: true,
    no_fake_value: true,
    laststats_source: selectedSource,
    internal_laststats: {
      ok: !!internal.ok,
      reason: internal.reason || null,
      latest_trade_at: internal.latest_trade_at || null,
      rows_scanned: asNumber(internal.rows_scanned) || 0,
      rows_used: asNumber(internal.rows_used) || 0,
      query_chunk_count: asNumber(internal.query_chunk_count) || 0,
      trade_rows_query_error: internal.trade_rows_query_error || null,
    },
    og_api_base: ogBase,
    lastVolumes_fetch: {
      ok: lastVolumes.ok,
      endpoint_path: lastVolumes.endpoint_path,
      http_status: lastVolumes.http_status,
      content_type: lastVolumes.content_type,
      reason: lastVolumes.reason,
    },
    lastVolumes_shape: bucketDiagnostics,
    external_lastVolumes_shape: externalBucketDiagnostics,
    d1,
    trade_rows,
    source_sync,
    interpretation: {
      missing_env: !ogBase.configured || !ogBase.valid,
      lastVolumes_unavailable: !lastVolumes.ok,
      nefty_bucket_missing: !bucketDiagnostics.buckets.neftyblocks.exists,
      taco_bucket_missing: !bucketDiagnostics.buckets.taco.exists,
      migration_027_missing: !d1.migration_027_applied,
      og_laststats_pair_ids_need_backfill: d1.migration_027_applied && asNumber(d1.og_laststats_pair_id_null) > 0,
      internal_d1_laststats_available: !!internal.ok,
      trade_rows_indexing_required: !trade_rows.ok,
      source_sync_required: !internal.ok && ['internal_laststats_no_trade_rows', 'd1_not_configured'].includes(internal.reason),
    },
  };
}

async function fetchWaxcashAlcorTokenAnalytics() {
  const url = 'https://wax.alcor.exchange/api/v3/analytics/tokens/waxcash-graffitiking?window=30d&hide_scam=true';
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 60, cacheEverything: false },
    });
    if (!response.ok) return { ok: false, reason: `alcor_token_analytics_http_${response.status}` };
    const data = await response.json();
    const holderCount = asNumber(data?.token?.holders?.count);
    const truncated = data?.token?.holders?.truncated === true;
    return {
      ok: true,
      data,
      holder_count: holderCount != null && !truncated ? holderCount : null,
      holder_snapshot_at: data?.meta?.ts || data?.token?.scores?.details?.updatedAt || null,
      holder_reason: holderCount == null
        ? 'alcor_token_analytics_holder_count_missing'
        : (truncated ? 'alcor_token_analytics_holders_truncated' : null),
      source: url,
      no_fake_value: true,
    };
  } catch (error) {
    return { ok: false, reason: `alcor_token_analytics_fetch_failed:${error?.message || String(error)}` };
  }
}

function ogTokenVolume(lastVolumes, duration, contract = WAXCASH_CONTRACT, symbol = WAXCASH_SYMBOL) {
  const key = `${normalizeContract(contract)}_${normalizeSymbol(symbol).toLowerCase()}`;
  return asNumber(lastVolumes?.[duration]?.tokens?.[key]?.volume);
}

function waxcashOgPairRef(pair) {
  const source = aggregateSourceKey(pair?.source) || moonboysCandleSource(pair?.source || '');
  const ref = WAXONEDGE_OG_SOURCE_REF[source];
  if (!ref) return null;
  const displayedPairId = safeString(pair?.pair_id);
  const ogPairId = safeString(firstPresent(pair?.og_laststats_pair_id, pair?.og_pair_id, pair?.pairid)) || null;
  return { ...ref, pair_id: ogPairId, displayed_pair_id: displayedPairId || null };
}

function ogPairLookupKey(value) {
  const text = safeString(value);
  return text ? text.toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
}

function uniqueSafeStrings(values = []) {
  const keys = [];
  const seen = new Set();
  for (const value of values) {
    const key = safeString(value);
    if (!key || seen.has(key)) continue;
    keys.push(key);
    seen.add(key);
  }
  return keys;
}

function normalizedLookupSet(keys = []) {
  return new Set(keys.map(ogPairLookupKey).filter(Boolean));
}

function ogPairLookupGroups(pair, ref) {
  const primaryOgKeys = uniqueSafeStrings([
    ref?.pair_id,
    pair?.og_laststats_pair_id,
    pair?.og_pair_id,
    pair?.pairid,
  ]);
  const fallbackDisplayKeys = uniqueSafeStrings([
    pair?.pair_id,
    pair?.id,
    pair?.pool_id,
    pair?.market_id,
    pair?.ticker_id,
    pair?.pair_key,
  ]);
  return {
    primaryOgKeys,
    fallbackDisplayKeys,
    normalizedPrimaryOgKeys: normalizedLookupSet(primaryOgKeys),
    normalizedFallbackDisplayKeys: normalizedLookupSet(fallbackDisplayKeys),
    attempted: uniqueSafeStrings(primaryOgKeys.concat(fallbackDisplayKeys)),
  };
}

function ogPairLookupKeys(pair, ref) {
  return new Set(ogPairLookupGroups(pair, ref).attempted.map(ogPairLookupKey).filter(Boolean));
}

function exactBucketMatch(bucket, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(bucket, key)) return { key, value: bucket[key] };
  }
  return null;
}

function normalizedBucketMatch(bucket, normalizedKeys) {
  if (!normalizedKeys?.size) return null;
  for (const [bucketKey, bucketValue] of Object.entries(bucket)) {
    if (normalizedKeys.has(ogPairLookupKey(bucketKey))) return { key: bucketKey, value: bucketValue };
  }
  return null;
}

function ogStatsObjectRows(bucket) {
  if (!bucket || typeof bucket !== 'object') return [];
  return Array.isArray(bucket) ? bucket : Object.entries(bucket).map(([key, value]) => ({ key, value }));
}

function ogStatsPairRowValue(entry) {
  return Object.prototype.hasOwnProperty.call(entry, 'value') ? entry.value : entry;
}

function ogStatsPairRowMatches(entry, keys, pair) {
  const value = ogStatsPairRowValue(entry);
  const row = value && typeof value === 'object' ? value : null;
  const key = ogPairLookupKey(entry?.key);
  if (key && keys.has(key)) return true;
  if (!row) return false;
  const rowKeys = [
    row.pair_id,
    row.id,
    row.pairid,
    row.pool_id,
    row.market_id,
    row.ticker_id,
    row.pair_key,
    row.pairId,
    row.poolId,
    row.marketId,
  ].map(ogPairLookupKey).filter(Boolean);
  return rowKeys.some((rowKey) => keys.has(rowKey));
}

function ogPairLastStatsLookup(stats, duration, pair) {
  const ref = waxcashOgPairRef(pair);
  const ogLastStatsPairId = safeString(pair?.og_laststats_pair_id) || null;
  const statsSource = lastStatsSource(stats);
  const empty = {
    displayed_pair_id: safeString(pair?.pair_id) || null,
    og_laststats_pair_id: ogLastStatsPairId,
    source: aggregateSourceKey(pair?.source) || moonboysCandleSource(pair?.source || '') || null,
    mapped_og_srcType: ref?.srcType || null,
    mapped_og_src: ref?.src || null,
    lookup_keys_attempted: null,
    exact_og_bucket_path_checked: null,
    og_bucket_exists: false,
    first_20_og_bucket_keys: [],
    matched_key: null,
    match_priority: null,
    laststats_source: statsSource,
    row: null,
    reason: ref ? 'no_lookup_keys' : 'no_og_pair_ref',
  };
  if (!ref) return empty;
  const bucket = stats?.[duration]?.[ref.srcType]?.[ref.src];
  const groups = ogPairLookupGroups(pair, ref);
  const hasOgKeys = groups.primaryOgKeys.length > 0;
  const hasDisplayKeys = groups.fallbackDisplayKeys.length > 0;
  const hasAnyKeys = hasOgKeys || hasDisplayKeys;
  const structuredKeys = {
    priority_1_exact_og: groups.primaryOgKeys,
    priority_2_normalized_og: [...groups.normalizedPrimaryOgKeys],
    priority_3_exact_display: groups.fallbackDisplayKeys,
    priority_4_normalized_display: [...groups.normalizedFallbackDisplayKeys],
  };
  const baseReason = !hasAnyKeys ? 'no_lookup_keys' : (!hasOgKeys ? 'og_laststats_pair_id_missing' : null);
  const base = {
    ...empty,
    displayed_pair_id: ref.displayed_pair_id || empty.displayed_pair_id,
    og_laststats_pair_id: ogLastStatsPairId,
    mapped_og_srcType: ref.srcType,
    mapped_og_src: ref.src,
    lookup_keys_attempted: structuredKeys,
    exact_og_bucket_path_checked: `lastVolumes[${duration}][${ref.srcType}][${ref.src}]`,
    reason: baseReason,
  };
  if (!bucket || typeof bucket !== 'object') {
    return { ...base, reason: statsSource === 'internal_d1_laststats' ? 'internal_laststats_no_trade_rows' : 'no_laststats_bucket' };
  }
  const firstKeys = Object.keys(bucket).slice(0, 20);
  const withBucket = { ...base, og_bucket_exists: true, first_20_og_bucket_keys: firstKeys };
  if (!hasAnyKeys) return { ...withBucket, reason: 'no_lookup_keys' };
  const exactOg = exactBucketMatch(bucket, groups.primaryOgKeys);
  if (exactOg) return { ...withBucket, matched_key: exactOg.key, match_priority: 'exact_og_key', row: exactOg.value, reason: null };
  const normalizedOg = normalizedBucketMatch(bucket, groups.normalizedPrimaryOgKeys);
  if (normalizedOg) return { ...withBucket, matched_key: normalizedOg.key, match_priority: 'normalized_og_key', row: normalizedOg.value, reason: null };
  const exactDisplay = exactBucketMatch(bucket, groups.fallbackDisplayKeys);
  if (exactDisplay) return { ...withBucket, matched_key: exactDisplay.key, match_priority: 'exact_display_key', row: exactDisplay.value, reason: !hasOgKeys ? 'og_laststats_pair_id_missing' : null };
  const normalizedDisplay = normalizedBucketMatch(bucket, groups.normalizedFallbackDisplayKeys);
  if (normalizedDisplay) return { ...withBucket, matched_key: normalizedDisplay.key, match_priority: 'normalized_display_key', row: normalizedDisplay.value, reason: !hasOgKeys ? 'og_laststats_pair_id_missing' : null };
  const allRowKeys = new Set([
    ...groups.normalizedPrimaryOgKeys,
    ...groups.normalizedFallbackDisplayKeys,
  ]);
  const matched = ogStatsObjectRows(bucket).find((entry) => ogStatsPairRowMatches(entry, allRowKeys, pair));
  if (matched) {
    return {
      ...withBucket,
      matched_key: matched.key || safeString(ogStatsPairRowValue(matched)?.pair_id || ogStatsPairRowValue(matched)?.pairid || ogStatsPairRowValue(matched)?.id),
      match_priority: 'row_pair_id_match',
      row: ogStatsPairRowValue(matched),
      reason: !hasOgKeys ? 'og_laststats_pair_id_missing' : null,
    };
  }
  return { ...withBucket, reason: !hasOgKeys ? 'og_laststats_pair_id_missing' : 'no_matching_pair_id' };
}

function ogPairLastStatsValue(stats, duration, pair) {
  return ogPairLastStatsLookup(stats, duration, pair).row || null;
}

function ogPairLastStatsLookupDebug(lookup, row = null, reason = null) {
  const volumeA = row && typeof row === 'object' ? asNumber(row.volumeA) : null;
  const volumeB = row && typeof row === 'object' ? asNumber(row.volumeB) : null;
  const source = row && typeof row === 'object' ? row.source : null;
  return {
    displayed_pair_id: lookup?.displayed_pair_id || null,
    og_laststats_pair_id: lookup?.og_laststats_pair_id || null,
    source: lookup?.source || null,
    mapped_og_srcType: lookup?.mapped_og_srcType || null,
    mapped_og_src: lookup?.mapped_og_src || null,
    lookup_keys_attempted: lookup?.lookup_keys_attempted || null,
    exact_og_bucket_path_checked: lookup?.exact_og_bucket_path_checked || null,
    og_bucket_exists: !!lookup?.og_bucket_exists,
    first_20_og_bucket_keys: Array.isArray(lookup?.first_20_og_bucket_keys) ? lookup.first_20_og_bucket_keys : [],
    matched_key: lookup?.matched_key || null,
    match_priority: lookup?.match_priority || null,
    laststats_source: lookup?.laststats_source || source || null,
    internal_laststats_bucket_exists: lookup?.laststats_source === 'internal_d1_laststats' ? !!lookup?.og_bucket_exists : false,
    internal_laststats_matched_key: lookup?.laststats_source === 'internal_d1_laststats' ? lookup?.matched_key || null : null,
    internal_volumeA: lookup?.laststats_source === 'internal_d1_laststats' ? safeDecimal(volumeA) : null,
    internal_volumeB: lookup?.laststats_source === 'internal_d1_laststats' ? safeDecimal(volumeB) : null,
    trade_row_count: row && typeof row === 'object' ? asNumber(row.row_count) || 0 : 0,
    latest_indexed_trade_time: row && typeof row === 'object' ? row.latest_indexed_trade_time || null : null,
    volumeA: safeDecimal(volumeA),
    volumeB: safeDecimal(volumeB),
    reason: reason || lookup?.reason || (lookup?.laststats_source === 'internal_d1_laststats' && row ? 'internal_laststats_available' : null),
  };
}

function ogPairLastVolumeRow(lastVolumes, duration, pair) {
  const row = ogPairLastStatsValue(lastVolumes, duration, pair);
  return row && typeof row === 'object' ? row : null;
}

function ogPairTokenWaxPrice(pair, side) {
  const symbol = normalizeSymbol(pair?.[`token_${side}_symbol`]);
  const contract = normalizeContract(pair?.[`token_${side}_contract`]);
  if (isWaxToken(contract, symbol)) return 1;
  if (isWaxcashToken(contract, symbol)) return asNumber(pair?.selected_waxcash_price_wax);
  const paired = pair?.paired_token || {};
  if (tokenKey(paired.contract, paired.symbol) === tokenKey(contract, symbol)) {
    return asNumber(pair?.paired_token_og_wax_price);
  }
  return null;
}

function preferredOgPairConvertedVolumeSide(pair, volumeA, tokenAPriceWax, volumeB, tokenBPriceWax) {
  const candidates = [];
  if (volumeA != null && tokenAPriceWax != null) {
    candidates.push({
      side: 'a',
      volume_wax: volumeA * tokenAPriceWax,
      is_waxcash: isWaxcashToken(pair?.token_a_contract, pair?.token_a_symbol),
    });
  }
  if (volumeB != null && tokenBPriceWax != null) {
    candidates.push({
      side: 'b',
      volume_wax: volumeB * tokenBPriceWax,
      is_waxcash: isWaxcashToken(pair?.token_b_contract, pair?.token_b_symbol),
    });
  }
  if (!candidates.length) return null;
  return candidates.find((candidate) => candidate.is_waxcash) || candidates[0];
}

function ogPairVolumeProof(lastVolumes, duration, pair, waxUsd = null) {
  const lookup = ogPairLastStatsLookup(lastVolumes, duration, pair);
  const row = lookup.row && typeof lookup.row === 'object' ? lookup.row : null;
  if (!row) return { lookup: ogPairLastStatsLookupDebug(lookup) };
  const sourcePrefix = lookup.laststats_source === 'internal_d1_laststats' ? 'internal_d1_laststats' : 'og_waxonedge_lastVolumes';
  const tokenASymbol = normalizeSymbol(pair?.token_a_symbol);
  const tokenBSymbol = normalizeSymbol(pair?.token_b_symbol);
  const volumeA = asNumber(row.volumeA);
  const volumeB = asNumber(row.volumeB);
  const tokenAPriceWax = ogPairTokenWaxPrice(pair, 'a');
  const tokenBPriceWax = ogPairTokenWaxPrice(pair, 'b');
  let volumeWax = null;
  let source = null;
  if (tokenASymbol === 'WAX' && volumeA != null) {
    volumeWax = volumeA;
    source = sourcePrefix;
  } else if (tokenBSymbol === 'WAX' && volumeB != null) {
    volumeWax = volumeB;
    source = sourcePrefix;
  } else {
    const convertedSide = preferredOgPairConvertedVolumeSide(pair, volumeA, tokenAPriceWax, volumeB, tokenBPriceWax);
    if (convertedSide) {
      volumeWax = convertedSide.volume_wax;
      source = sourcePrefix === 'internal_d1_laststats'
        ? 'internal_d1_laststats_route_converted_wax'
        : 'og_waxonedge_lastVolumes_route_converted_wax';
    }
  }
  const hasNative = volumeA != null || volumeB != null;
  const debugReason = hasNative ? null : 'no_recent_volume';
  const nativeSource = sourcePrefix === 'internal_d1_laststats'
    ? 'internal_d1_laststats_native_pair_volume'
    : 'og_waxonedge_lastVolumes_native_pair_volume';
  return {
    volume_wax: safeDecimal(volumeWax),
    volume_usd: volumeWax != null && waxUsd != null ? safeDecimal(volumeWax * waxUsd) : null,
    volume_a_native: safeDecimal(volumeA),
    volume_b_native: safeDecimal(volumeB),
    token_a_symbol: pair?.token_a_symbol || null,
    token_b_symbol: pair?.token_b_symbol || null,
    token_a_wax_price: safeDecimal(tokenAPriceWax),
    token_b_wax_price: safeDecimal(tokenBPriceWax),
    source: source || (hasNative ? nativeSource : null),
    native_source: hasNative ? nativeSource : null,
    converted: /_route_converted_wax$/.test(source || ''),
    lookup: ogPairLastStatsLookupDebug(lookup, row, debugReason),
    no_fake_value: true,
  };
}

function ogPairChange24h(lastPriceChanges, pair) {
  const ratio = asNumber(ogPairLastStatsValue(lastPriceChanges, '24h', pair));
  return ratio == null ? null : (ratio - 1) * 100;
}

function applyOgLastStatsToWaxcashPairs(pairs = [], ogStats = {}, waxUsd = null) {
  const lastVolumes = ogStats.lastVolumes;
  const lastPriceChanges = ogStats.lastPriceChanges;
  return (pairs || []).map((pair) => {
    const volume24 = ogPairVolumeProof(lastVolumes, '24h', pair, waxUsd);
    const volume7d = ogPairVolumeProof(lastVolumes, '7d', pair, waxUsd);
    const volume30d = ogPairVolumeProof(lastVolumes, '30d', pair, waxUsd);
    const change24h = ogPairChange24h(lastPriceChanges, pair);
    const metricSources = { ...(pair.metric_sources || {}) };
    const volume24RowCount = asNumber(volume24?.lookup?.trade_row_count) || 0;
    const volume7dRowCount = asNumber(volume7d?.lookup?.trade_row_count) || 0;
    const volume30dRowCount = asNumber(volume30d?.lookup?.trade_row_count) || 0;
    if (volume24?.volume_wax != null && asNumber(pair.volume_24h_wax) == null) metricSources.volume_24h_wax = { source: volume24.source, row_count: volume24RowCount };
    if (volume7d?.volume_wax != null && asNumber(pair.volume_7d_wax) == null) metricSources.volume_7d_wax = { source: volume7d.source, row_count: volume7dRowCount };
    if (volume30d?.volume_wax != null && asNumber(pair.volume_30d_wax) == null) metricSources.volume_30d_wax = { source: volume30d.source, row_count: volume30dRowCount };
    if (volume24?.native_source) {
      metricSources.volume_24h_native = { source: volume24.native_source, row_count: volume24RowCount };
    } else if (!metricSources.volume_24h_native) {
      metricSources.volume_24h_native = {
        source: null,
        row_count: volume24RowCount,
        reason: volume24?.lookup?.reason || (volume7dRowCount || volume30dRowCount ? 'no_recent_24h_native_pair_volume' : 'no_native_pair_volume'),
      };
    }
    if (volume7d?.native_source) {
      metricSources.volume_7d_native = { source: volume7d.native_source, row_count: volume7dRowCount };
    } else if (!metricSources.volume_7d_native) {
      metricSources.volume_7d_native = { source: null, row_count: volume7dRowCount, reason: volume7d?.lookup?.reason || 'no_7d_native_pair_volume' };
    }
    if (volume30d?.native_source) {
      metricSources.volume_30d_native = { source: volume30d.native_source, row_count: volume30dRowCount };
    } else if (!metricSources.volume_30d_native) {
      metricSources.volume_30d_native = { source: null, row_count: volume30dRowCount, reason: volume30d?.lookup?.reason || 'no_30d_native_pair_volume' };
    }
    if (change24h != null && asNumber(pair.change_24h) == null) metricSources.change_24h = { source: 'og_waxonedge_lastPriceChanges', row_count: 0 };
    return {
      ...pair,
      volume_24h_wax: safeDecimal(asNumber(pair.volume_24h_wax) ?? asNumber(volume24?.volume_wax)),
      volume_24h_usd: safeDecimal(asNumber(pair.volume_24h_usd) ?? asNumber(volume24?.volume_usd)),
      volume_24h_a_native: safeDecimal(volume24?.volume_a_native),
      volume_24h_b_native: safeDecimal(volume24?.volume_b_native),
      volume_a_native: safeDecimal(volume24?.volume_a_native),
      volume_b_native: safeDecimal(volume24?.volume_b_native),
      volume_7d_wax: safeDecimal(asNumber(pair.volume_7d_wax) ?? asNumber(volume7d?.volume_wax)),
      volume_7d_usd: safeDecimal(asNumber(pair.volume_7d_usd) ?? asNumber(volume7d?.volume_usd)),
      volume_7d_a_native: safeDecimal(volume7d?.volume_a_native),
      volume_7d_b_native: safeDecimal(volume7d?.volume_b_native),
      volume_30d_wax: safeDecimal(asNumber(pair.volume_30d_wax) ?? asNumber(volume30d?.volume_wax)),
      volume_30d_usd: safeDecimal(asNumber(pair.volume_30d_usd) ?? asNumber(volume30d?.volume_usd)),
      volume_30d_a_native: safeDecimal(volume30d?.volume_a_native),
      volume_30d_b_native: safeDecimal(volume30d?.volume_b_native),
      volume_native_source: volume24?.native_source || volume7d?.native_source || volume30d?.native_source || null,
      og_laststats_debug: {
        volume_24h: volume24?.lookup || null,
        volume_7d: volume7d?.lookup || null,
        volume_30d: volume30d?.lookup || null,
      },
      change_24h: safeDecimal(asNumber(pair.change_24h) ?? change24h),
      metric_sources: metricSources,
    };
  });
}

function waxcashChartFeedPool(pairs = [], selectedWaxPool = null) {
  void selectedWaxPool;
  return (pairs || []).find((pair) =>
    moonboysCandleSource(pair?.source) === 'swap.alcor' && String(pair?.pair_id || '') === '8388') || null;
}

async function buildWaxcashChartBundle(db, proof, headline, options = {}) {
  const selectedPriceWax = asNumber(headline?.og_headline_price_wax);
  const selectedWaxPool = proof?.selected_largest_wax_reserve_pool || null;
  const chartFeedPool = waxcashChartFeedPool(proof?.all_pairs || [], selectedWaxPool);
  const interval = normalizeCandleInterval(options.interval || options.resolution || '1D');
  const chartQuery = {
    source: chartFeedPool?.source,
    pair_id: chartFeedPool?.pair_id,
    interval,
    limit: options.limit || options.countBack || 120,
  };
  if (options.from != null) chartQuery.startAt = Number(options.from) * 1000;
  if (options.to != null) chartQuery.endAt = Number(options.to) * 1000;
  let rawChart = chartFeedPool?.source && chartFeedPool?.pair_id
    ? await listChartCandlesBySource(db, chartQuery)
    : { chart_source: null, candles: [], unavailable: 'waxcash_chart_feed_pair_unavailable' };
  let normalizedChart = normalizeWaxcashWaxCandles(rawChart.candles || [], { selectedPriceWax });
  let chartBuild = null;
  if (chartFeedPool?.source && chartFeedPool?.pair_id && interval === '1D' && !normalizedChart.candles.length) {
    chartBuild = await buildInternalDailyCandlesForPair(db, chartFeedPool);
    if (chartBuild?.candles_written > 0) {
      rawChart = await listChartCandlesBySource(db, chartQuery);
      normalizedChart = normalizeWaxcashWaxCandles(rawChart.candles || [], { selectedPriceWax });
    }
  }
  const chart = {
    ...rawChart,
    candles: normalizedChart.candles,
    candle_normalization: normalizedChart.summary,
    build_from_indexed_trades: chartBuild,
    unavailable: normalizedChart.candles.length ? null : (chartBuild?.reason || rawChart.unavailable || 'waxcash_wax_chart_candles_unavailable_after_direction_normalization'),
  };
  return { chart, chartFeedPool, selectedWaxPool };
}

async function selectedProofPriceChange24h(db, selectedWaxPool = null, selectedPriceWax = null) {
  if (!selectedWaxPool?.source || !selectedWaxPool?.pair_id) {
    return {
      change_24h: null,
      source: null,
      basis: null,
      reason: 'selected_price_proof_pool_unavailable',
    };
  }
  const raw = await listChartCandlesBySource(db, {
    source: selectedWaxPool.source,
    pair_id: selectedWaxPool.pair_id,
    interval: '1D',
    limit: 3,
  }).catch(() => ({ candles: [], unavailable: 'selected_price_proof_pool_history_unavailable' }));
  const normalized = normalizeWaxcashWaxCandles(raw.candles || [], { selectedPriceWax });
  const change = waxcashPriceChangeFromCandles(normalized.candles || []);
  return {
    change_24h: safeDecimal(change),
    source: change != null ? 'selected_price_proof_pool_history' : null,
    basis: change != null ? 'selected proof pool 1D candle close versus prior 24h close' : null,
    reason: change != null ? null : (raw.unavailable || 'selected_price_proof_pool_history_unavailable'),
  };
}

function tradingViewHistoryFromWaxcashChart(chart) {
  const candles = (chart?.candles || [])
    .map((candle) => {
      const timeMs = Date.parse(candle.bucket_time || candle.time || candle.timestamp || '');
      const open = asNumber(candle.open);
      const high = asNumber(candle.high);
      const low = asNumber(candle.low);
      const close = asNumber(candle.close);
      if (!Number.isFinite(timeMs) || open == null || high == null || low == null || close == null) return null;
      return {
        time: Math.floor(timeMs / 1000),
        open,
        high,
        low,
        close,
        volume: asNumber(candle.volume) ?? 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
  return {
    s: candles.length ? 'ok' : 'no_data',
    t: candles.map((candle) => candle.time),
    o: candles.map((candle) => candle.open),
    h: candles.map((candle) => candle.high),
    l: candles.map((candle) => candle.low),
    c: candles.map((candle) => candle.close),
    v: candles.map((candle) => candle.volume),
    candles,
  };
}

function waxcashPriceChangeFromCandles(candles = []) {
  const points = (candles || [])
    .map((candle) => {
      const timeMs = Date.parse(candle.bucket_time || candle.time || candle.timestamp || '');
      const close = asNumber(candle.close);
      return Number.isFinite(timeMs) && close != null ? { timeMs, close } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.timeMs - b.timeMs);
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const targetMs = latest.timeMs - 24 * 60 * 60 * 1000;
  let prior = null;
  for (const point of points) {
    if (point.timeMs <= targetMs) prior = point;
    else break;
  }
  if (!prior || prior.close <= 0) return null;
  return ((latest.close - prior.close) / prior.close) * 100;
}

async function latestIndexedHolderCount(db, contract, symbol) {
  const snapshot = await db.prepare(
    `SELECT snapshot_at
     FROM waxonedge_holders
     WHERE contract = ? AND symbol = ?
     ORDER BY snapshot_at DESC
     LIMIT 1`
  ).bind(contract, symbol).first().catch(() => null);
  if (!snapshot?.snapshot_at) {
    return {
      holder_count: null,
      live: false,
      source: null,
      reason: `No indexed holder snapshot exists for ${contract}::${symbol}`,
    };
  }
  const row = await db.prepare(
    `SELECT COUNT(DISTINCT account) AS count
     FROM waxonedge_holders
     WHERE contract = ? AND symbol = ? AND snapshot_at = ?
       AND CAST(COALESCE(balance, '0') AS NUMERIC) > 0`
  ).bind(contract, symbol, snapshot.snapshot_at).first().catch(() => null);
  const holderCount = asNumber(row?.count);
  return {
    holder_count: holderCount,
    live: holderCount != null,
    source: holderCount != null ? 'indexed_holder_snapshot' : null,
    snapshot_at: snapshot.snapshot_at,
    reason: holderCount != null ? null : 'Indexed holder snapshot exists but no positive holder rows were countable',
  };
}

async function listIndexedHolders(db, contract, symbol, options = {}) {
  const limit = Math.max(1, Math.min(500, Math.floor(asNumber(options.limit) || 100)));
  const snapshot = await db.prepare(
    `SELECT snapshot_at
     FROM waxonedge_holders
     WHERE contract = ? AND symbol = ?
     ORDER BY snapshot_at DESC
     LIMIT 1`
  ).bind(contract, symbol).first().catch(() => null);
  if (!snapshot?.snapshot_at) {
    return {
      rows: [],
      row_count: 0,
      holder_count: null,
      snapshot_at: null,
      unavailable: `No indexed holder snapshot exists for ${contract}::${symbol}`,
      no_fake_value: true,
    };
  }
  const rows = await db.prepare(
    `SELECT account, balance, percentage, snapshot_at, source
     FROM waxonedge_holders
     WHERE contract = ? AND symbol = ? AND snapshot_at = ?
       AND CAST(COALESCE(balance, '0') AS NUMERIC) > 0
     ORDER BY CAST(COALESCE(balance, '0') AS NUMERIC) DESC, account ASC
     LIMIT ?`
  ).bind(contract, symbol, snapshot.snapshot_at, limit).all().then((result) => result.results || []).catch(() => []);
  const count = await latestIndexedHolderCount(db, contract, symbol);
  return {
    rows,
    row_count: rows.length,
    holder_count: count.holder_count,
    snapshot_at: snapshot.snapshot_at,
    source: 'waxonedge_holders',
    unavailable: null,
    no_fake_value: true,
  };
}

function holderRowsFromHyperionPayload(data, snapshotAt) {
  const rows = sourceRows(data?.tokens || data?.accounts || data?.holders || data);
  return rows.map((row) => {
    const account = safeString(firstPresent(row.account, row.owner, row.holder, row.scope));
    const quantity = firstPresent(row.quantity, row.balance, row.amount, row.value);
    const parsed = parseAsset(quantity);
    const amount = parsed.amount ?? asNumber(quantity);
    const symbol = normalizeSymbol(parsed.symbol || row.symbol || row.currency);
    const contract = normalizeContract(firstPresent(row.contract, row.code, row.token_contract, WAXCASH_CONTRACT));
    if (!account || amount == null || amount <= 0) return null;
    if (contract && contract !== WAXCASH_CONTRACT) return null;
    if (symbol && symbol !== WAXCASH_SYMBOL) return null;
    return {
      account,
      balance: safeDecimal(amount),
      percentage: null,
      snapshot_at: snapshotAt,
      source: 'hyperion_state_get_tokens',
    };
  }).filter(Boolean);
}

async function fetchWaxcashHolderRows(env, limit = 1000, cursor = '') {
  void env;
  void limit;
  void cursor;
  return {
    ok: false,
    skipped: true,
    reason: 'holder_global_source_unavailable',
    detail: 'Hyperion state/get_tokens is account-scoped and is not a global WAXCASH holder source.',
  };
}

async function writeWaxcashHolderSnapshot(db, holders, snapshotAt) {
  if (!holders.length) return 0;
  const statements = holders.map((holder) => db.prepare(
    `INSERT INTO waxonedge_holders
     (contract, symbol, account, balance, percentage, snapshot_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(contract, symbol, account, snapshot_at) DO UPDATE SET
       balance = excluded.balance,
       percentage = excluded.percentage,
       source = excluded.source`
  ).bind(
    WAXCASH_CONTRACT,
    WAXCASH_SYMBOL,
    holder.account,
    holder.balance,
    holder.percentage,
    snapshotAt,
    holder.source || 'hyperion_state_get_tokens',
  ));
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
  return holders.length;
}

async function syncWaxcashHolderSnapshot(env) {
  const startedAt = nowIso();
  const reason = 'holder_global_source_unavailable';
  await upsertSourceIndexState(env.DB, WAXCASH_HOLDER_SNAPSHOT_SOURCE, {
    sync_cycle_id: `holders-${new Date().toISOString().slice(0, 10)}`,
    cursor: '',
    page_count: 0,
    row_count: 0,
    complete: 0,
    truncated: 0,
    status: 'skipped',
    error: reason,
    started_at: startedAt,
  }).catch(() => {});
  await writeSnapshot(env.DB, WAXCASH_HOLDER_SNAPSHOT_SOURCE, {
    source: WAXCASH_HOLDER_SNAPSHOT_SOURCE,
    status: 'skipped',
    holder_count: null,
    snapshot_at: null,
    complete: false,
    page_count: 0,
    next_cursor: null,
    source_endpoint: null,
    reason,
    no_fake_value: true,
  }, nowIso()).catch(() => {});
  await recordSyncRun(env.DB, WAXCASH_HOLDER_SNAPSHOT_SOURCE, 'skipped', startedAt, reason).catch(() => {});
  return { ok: true, status: 'skipped', holder_count: null, reason, no_fake_value: true };
}

function waxcashTradeVolumePredicates(pairs = []) {
  const predicates = ['(contract = ? AND symbol = ?)'];
  const params = [WAXCASH_CONTRACT, WAXCASH_SYMBOL];
  for (const pair of pairs || []) {
    const sourceNames = candleTradeSourceNamesFor(pair?.source);
    const pairIds = waxcashTradePairIdsForLookup(pair);
    if (!sourceNames.length || !pairIds.length) continue;
    for (const pairId of pairIds) {
      predicates.push(`(source IN (${sourceNames.map(() => '?').join(',')}) AND pair_id = ?)`);
      params.push(...sourceNames, pairId);
    }
  }
  return { predicates, params };
}

const WAXCASH_TRADE_QUERY_PAIR_ID_CHUNK_SIZE = 40;

function waxcashTradeQueryChunks(pairs = []) {
  const chunks = [{
    kind: 'waxcash_token_rows',
    where: '(contract = ? AND symbol = ?)',
    params: [WAXCASH_CONTRACT, WAXCASH_SYMBOL],
  }];
  const idsBySource = new Map();
  for (const pair of pairs || []) {
    const sourceNames = candleTradeSourceNamesFor(pair?.source);
    const pairIds = waxcashTradePairIdsForLookup(pair);
    for (const source of sourceNames) {
      if (!idsBySource.has(source)) idsBySource.set(source, new Set());
      const ids = idsBySource.get(source);
      for (const pairId of pairIds) ids.add(pairId);
    }
  }
  for (const [source, ids] of idsBySource.entries()) {
    const values = [...ids].filter(Boolean);
    for (let i = 0; i < values.length; i += WAXCASH_TRADE_QUERY_PAIR_ID_CHUNK_SIZE) {
      const pairIds = values.slice(i, i + WAXCASH_TRADE_QUERY_PAIR_ID_CHUNK_SIZE);
      chunks.push({
        kind: 'source_pair_id_rows',
        source,
        pair_id_count: pairIds.length,
        where: `(source = ? AND pair_id IN (${pairIds.map(() => '?').join(',')}))`,
        params: [source, ...pairIds],
      });
    }
  }
  return chunks;
}

function waxcashTradeRowUniqueKey(row) {
  return [
    row?.source,
    row?.trade_id,
    row?.tx_id,
    row?.pair_id,
    row?.traded_at,
  ].map(safeString).join('::');
}

async function waxcashLatestIndexedTradeAt(db, pairs = []) {
  const chunks = waxcashTradeQueryChunks(pairs);
  let latestTradeAt = null;
  let queryError = null;
  for (const chunk of chunks) {
    const row = await db.prepare(
      `SELECT MAX(traded_at) AS latest_trade_at
       FROM waxonedge_trades
       WHERE ${chunk.where}`
    ).bind(...chunk.params).first().catch((error) => {
      queryError = error?.message || String(error);
      return null;
    });
    const candidateMs = Date.parse(row?.latest_trade_at || '');
    if (Number.isFinite(candidateMs) && (!latestTradeAt || candidateMs > Date.parse(latestTradeAt))) {
      latestTradeAt = row.latest_trade_at;
    }
  }
  return {
    latest_trade_at: latestTradeAt,
    query_chunk_count: chunks.length,
    trade_rows_query_error: queryError,
  };
}

async function waxcashSelectIndexedTradeRows(db, pairs = [], options = {}) {
  const chunks = waxcashTradeQueryChunks(pairs);
  const sinceIso = options.sinceIso || null;
  const limit = Math.max(0, Math.floor(asNumber(options.limit) || 0));
  const selectColumns = options.selectColumns || 'source, trade_id, pair_id, contract, symbol, side, price, amount, volume, tx_id, traded_at, raw_json';
  const rows = [];
  const seen = new Set();
  let queryError = null;
  for (const chunk of chunks) {
    const sinceClause = sinceIso ? ' AND traded_at >= ?' : '';
    const limitClause = limit ? ' LIMIT ?' : '';
    const params = sinceIso ? chunk.params.concat(sinceIso) : chunk.params.slice();
    if (limit) params.push(limit);
    const chunkRows = await db.prepare(
      `SELECT ${selectColumns}
       FROM waxonedge_trades
       WHERE ${chunk.where}${sinceClause}
       ORDER BY traded_at DESC${limitClause}`
    ).bind(...params).all().then((result) => result.results || []).catch((error) => {
      queryError = error?.message || String(error);
      return [];
    });
    for (const row of chunkRows) {
      const key = waxcashTradeRowUniqueKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  rows.sort((a, b) => Date.parse(b?.traded_at || '') - Date.parse(a?.traded_at || ''));
  return {
    rows: limit ? rows.slice(0, limit) : rows,
    query_chunk_count: chunks.length,
    trade_rows_query_error: queryError,
  };
}

async function waxcashIndexedTradeRowCount(db, pairs = []) {
  const selected = await waxcashSelectIndexedTradeRows(db, pairs, {
    selectColumns: 'source, trade_id, pair_id, tx_id, traded_at',
  });
  return {
    row_count: selected.rows.length,
    latest_traded_at: selected.rows[0]?.traded_at || null,
    query_chunk_count: selected.query_chunk_count,
    trade_rows_query_error: selected.trade_rows_query_error,
  };
}

function waxcashTradePairKey(source, pairId) {
  return `${moonboysCandleSource(source)}::${safeString(pairId)}`;
}

function waxcashTradePairIdsForLookup(pair) {
  return uniqueSafeStrings([
    pair?.og_laststats_pair_id,
    pair?.og_pair_id,
    pair?.pairid,
    pair?.pair_id,
    pair?.id,
    pair?.pool_id,
    pair?.market_id,
    pair?.ticker_id,
    pair?.pair_key,
  ]);
}

function buildWaxcashTradePairProofMap(pairs = []) {
  const map = new Map();
  for (const pair of pairs || []) {
    const sourceNames = candleTradeSourceNamesFor(pair?.source);
    const pairIds = waxcashTradePairIdsForLookup(pair);
    for (const source of sourceNames) {
      for (const pairId of pairIds) {
        const key = waxcashTradePairKey(source, pairId);
        if (!map.has(key)) map.set(key, pair);
      }
    }
  }
  return map;
}

function waxcashTradePairKeySets(pairs = []) {
  const displayPairKeys = new Set();
  const ogPairKeys = new Set();
  for (const pair of pairs || []) {
    const sourceNames = candleTradeSourceNamesFor(pair?.source);
    for (const source of sourceNames) {
      const displayPairId = safeString(pair?.pair_id);
      if (displayPairId) displayPairKeys.add(waxcashTradePairKey(source, displayPairId));
      for (const ogPairId of uniqueSafeStrings([pair?.og_laststats_pair_id, pair?.og_pair_id, pair?.pairid])) {
        ogPairKeys.add(waxcashTradePairKey(source, ogPairId));
      }
    }
  }
  return { displayPairKeys, ogPairKeys };
}

function waxcashTradeAssetVolumeWax(row, selectedPriceWax) {
  const selectedWax = asNumber(selectedPriceWax);
  const raw = parseTradeRawJson(row);
  for (const value of [
    raw.volume_wax,
    raw.volumeWax,
    raw.wax_volume,
    raw.waxVolume,
    raw.tokenWaxVolume,
  ]) {
    const parsed = asNumber(value);
    if (parsed != null) return { volumeWax: Math.abs(parsed), basis: 'indexed_trade_rows_window_wax_denominated' };
  }
  for (const value of [
    raw.quantity_in,
    raw.quantity_out,
    raw.volume,
    raw.amount,
    row?.amount,
    row?.volume,
  ]) {
    const asset = parseAsset(value);
    if (asset.amount == null || !asset.symbol) continue;
    if (asset.symbol === 'WAX') return { volumeWax: Math.abs(asset.amount), basis: 'indexed_trade_rows_window_wax_denominated' };
    if (asset.symbol === WAXCASH_SYMBOL && selectedWax != null) {
      return { volumeWax: Math.abs(asset.amount * selectedWax), basis: 'indexed_trade_rows_window_waxcash_units_x_selected_price' };
    }
  }
  for (const side of [
    { amount: raw.amount_bid, symbol: raw.code_bid },
    { amount: raw.amount_ask, symbol: raw.code_ask },
  ]) {
    const amount = asNumber(side.amount);
    const symbol = normalizeSymbol(side.symbol);
    if (amount == null || !symbol) continue;
    if (symbol === 'WAX') return { volumeWax: Math.abs(amount), basis: 'indexed_trade_rows_window_wax_denominated' };
    if (symbol === WAXCASH_SYMBOL && selectedWax != null) {
      return { volumeWax: Math.abs(amount * selectedWax), basis: 'indexed_trade_rows_window_waxcash_units_x_selected_price' };
    }
  }
  const rowToken = tokenKey(row?.contract, row?.symbol);
  const numeric = asNumber(row?.volume ?? row?.amount);
  if (numeric != null && rowToken === WAXCASH_KEY && selectedWax != null) {
    return { volumeWax: Math.abs(numeric * selectedWax), basis: 'indexed_trade_rows_window_waxcash_units_x_selected_price' };
  }
  if (numeric != null && isWaxToken(row?.contract, row?.symbol)) {
    return { volumeWax: Math.abs(numeric), basis: 'indexed_trade_rows_window_wax_denominated' };
  }
  return { volumeWax: null, basis: null };
}

function waxcashTradeVolumeWax(row, pairProofByKey, selectedPriceWax) {
  const direct = waxcashTradeAssetVolumeWax(row, selectedPriceWax);
  if (direct.volumeWax != null) return direct;
  const pair = pairProofByKey.get(waxcashTradePairKey(row?.source, row?.pair_id));
  const numeric = asNumber(row?.volume ?? row?.amount);
  if (!pair || numeric == null) return { volumeWax: null, basis: null };
  const selectedWax = asNumber(selectedPriceWax);
  if (tokenKey(row?.contract, row?.symbol) === WAXCASH_KEY && selectedWax != null) {
    return { volumeWax: Math.abs(numeric * selectedWax), basis: 'indexed_trade_rows_window_waxcash_units_x_selected_price' };
  }
  if (pair.direct_wax_pair && isWaxToken(row?.contract, row?.symbol)) {
    return { volumeWax: Math.abs(numeric), basis: 'indexed_trade_rows_window_wax_denominated' };
  }
  return { volumeWax: null, basis: null };
}

async function listIndexedTrades(db, contract, symbol, options = {}) {
  const limit = Math.max(1, Math.min(500, Math.floor(asNumber(options.limit) || 100)));
  const pairRows = isWaxcashToken(contract, symbol) ? await loadWaxcashOgPairRows(db) : await loadPairRowsForToken(db, contract, symbol);
  const waxcashRows = isWaxcashToken(contract, symbol)
    ? await waxcashSelectIndexedTradeRows(db, pairRows, {
      selectColumns: 'source, trade_id, pair_id, contract, symbol, side, price, amount, volume, tx_id, traded_at',
      limit,
    })
    : null;
  const rows = waxcashRows
    ? waxcashRows.rows
    : await db.prepare(
      `SELECT source, trade_id, pair_id, contract, symbol, side, price, amount, volume, tx_id, traded_at
       FROM waxonedge_trades
       WHERE (contract = ? AND symbol = ?)
       ORDER BY traded_at DESC
       LIMIT ?`
    ).bind(contract, symbol, limit).all().then((result) => result.results || []).catch(() => []);
  return {
    rows,
    row_count: rows.length,
    source: 'waxonedge_trades',
    unavailable: rows.length ? null : `No indexed trade rows exist for ${contract}::${symbol}`,
    query_chunk_count: waxcashRows?.query_chunk_count || null,
    trade_rows_query_error: waxcashRows?.trade_rows_query_error || null,
    no_fake_value: true,
  };
}

async function indexedTradeWindowVolumes(db, pairs = [], options = {}) {
  const latest = await waxcashLatestIndexedTradeAt(db, pairs);
  const latestMs = Date.parse(latest?.latest_trade_at || '');
  if (!Number.isFinite(latestMs)) {
    return {
      volume_24h_wax: null,
      volume_7d: null,
      volume_30d: null,
      live: false,
      source: null,
      reason: 'No indexed WAXCASH trade rows are available for rolling volume windows',
      basis: null,
      query_chunk_count: latest.query_chunk_count || 0,
      trade_rows_query_error: latest.trade_rows_query_error || null,
    };
  }
  const since24hMs = latestMs - (24 * 60 * 60 * 1000);
  const since7dMs = latestMs - (7 * 24 * 60 * 60 * 1000);
  const since30dMs = latestMs - (30 * 24 * 60 * 60 * 1000);
  const result = {
    volume_24h_wax: null,
    volume_7d: null,
    volume_30d: null,
    live: true,
    source: 'indexed_trade_rows_window_wax_denominated',
    basis: 'indexed_trade_rows_window_wax_denominated',
    latest_trade_at: latest.latest_trade_at,
    reason: null,
    excluded_unproven_trade_count: 0,
    query_chunk_count: latest.query_chunk_count || 0,
    trade_rows_query_error: latest.trade_rows_query_error || null,
  };
  const pairProofByKey = buildWaxcashTradePairProofMap(pairs);
  const selectedRows = await waxcashSelectIndexedTradeRows(db, pairs, { sinceIso: new Date(since30dMs).toISOString() });
  const rows = selectedRows.rows;
  result.query_chunk_count = selectedRows.query_chunk_count;
  result.trade_rows_query_error = latest.trade_rows_query_error || selectedRows.trade_rows_query_error || null;
  const totals = {
    volume_24h_wax: 0,
    volume_7d: 0,
    volume_30d: 0,
  };
  const hasTotals = {
    volume_24h_wax: false,
    volume_7d: false,
    volume_30d: false,
  };
  const excludedTradeKeys = new Set();
  for (const row of rows) {
    const tradedMs = Date.parse(row?.traded_at || '');
    if (!Number.isFinite(tradedMs) || tradedMs < since30dMs) continue;
    const proof = waxcashTradeVolumeWax(row, pairProofByKey, options.selectedPriceWax);
    if (proof.volumeWax == null) {
      const excludedKey = [
        row?.source,
        row?.trade_id,
        row?.tx_id,
        row?.pair_id,
        row?.traded_at,
      ].map(safeString).join('::');
      excludedTradeKeys.add(excludedKey);
      continue;
    }
    totals.volume_30d += proof.volumeWax;
    hasTotals.volume_30d = true;
    if (tradedMs >= since7dMs) {
      totals.volume_7d += proof.volumeWax;
      hasTotals.volume_7d = true;
    }
    if (tradedMs >= since24hMs) {
      totals.volume_24h_wax += proof.volumeWax;
      hasTotals.volume_24h_wax = true;
    }
  }
  result.volume_24h_wax = hasTotals.volume_24h_wax ? safeDecimal(totals.volume_24h_wax) : null;
  result.volume_7d = hasTotals.volume_7d ? safeDecimal(totals.volume_7d) : null;
  result.volume_30d = hasTotals.volume_30d ? safeDecimal(totals.volume_30d) : null;
  result.excluded_unproven_trade_count = excludedTradeKeys.size;
  if (result.volume_24h_wax == null && result.volume_7d == null && result.volume_30d == null) {
    result.live = false;
    result.source = null;
    result.basis = null;
    result.reason = 'Indexed WAXCASH trade rows exist but no WAX-denominated or convertible WAXCASH volume proof is available';
  }
  return result;
}

async function indexedTradeWindowVolumesByPair(db, pairs = [], options = {}) {
  const latest = await waxcashLatestIndexedTradeAt(db, pairs);
  const latestMs = Date.parse(latest?.latest_trade_at || '');
  if (!Number.isFinite(latestMs)) return new Map();

  const since24hMs = latestMs - (24 * 60 * 60 * 1000);
  const since7dMs = latestMs - (7 * 24 * 60 * 60 * 1000);
  const since30dMs = latestMs - (30 * 24 * 60 * 60 * 1000);
  const pairProofByKey = buildWaxcashTradePairProofMap(pairs);
  const selectedRows = await waxcashSelectIndexedTradeRows(db, pairs, { sinceIso: new Date(since30dMs).toISOString() });
  const rows = selectedRows.rows;
  const windows = new Map();
  const ensureWindow = (key, proof = {}) => {
    if (!windows.has(key)) {
      windows.set(key, {
        volume_24h_wax: 0,
        volume_7d_wax: 0,
        volume_30d_wax: 0,
        row_count_24h: 0,
        row_count_7d: 0,
        row_count_30d: 0,
        wax_volume_row_count_24h: 0,
        wax_volume_row_count_7d: 0,
        wax_volume_row_count_30d: 0,
        unproven_volume_row_count_24h: 0,
        unproven_volume_row_count_7d: 0,
        unproven_volume_row_count_30d: 0,
        has_24h: false,
        has_7d: false,
        has_30d: false,
        latest_indexed_trade_time: null,
        price_samples: [],
        source: 'indexed_trade_rows_window_wax_denominated',
        basis: proof.basis || null,
        query_chunk_count: selectedRows.query_chunk_count,
        trade_rows_query_error: latest.trade_rows_query_error || selectedRows.trade_rows_query_error || null,
      });
    }
    return windows.get(key);
  };
  for (const row of rows) {
    const tradedMs = Date.parse(row?.traded_at || '');
    if (!Number.isFinite(tradedMs) || tradedMs < since30dMs) continue;
    const key = waxcashTradePairKey(row?.source, row?.pair_id);
    if (!pairProofByKey.has(key)) continue;
    const proof = waxcashTradeVolumeWax(row, pairProofByKey, options.selectedPriceWax);
    const window = ensureWindow(key, proof);
    const price = priceFromIndexedTradeRow(row, row?.source);
    if (price != null) window.price_samples.push({ tradedMs, price });
    if (!window.latest_indexed_trade_time || tradedMs > Date.parse(window.latest_indexed_trade_time)) {
      window.latest_indexed_trade_time = new Date(tradedMs).toISOString();
    }
    window.row_count_30d += 1;
    if (proof.volumeWax != null) {
      window.volume_30d_wax += proof.volumeWax;
      window.wax_volume_row_count_30d += 1;
      window.has_30d = true;
      if (proof.basis) window.basis = proof.basis;
    } else {
      window.unproven_volume_row_count_30d += 1;
    }
    if (tradedMs >= since7dMs) {
      window.row_count_7d += 1;
      if (proof.volumeWax != null) {
        window.volume_7d_wax += proof.volumeWax;
        window.wax_volume_row_count_7d += 1;
        window.has_7d = true;
      } else {
        window.unproven_volume_row_count_7d += 1;
      }
    }
    if (tradedMs >= since24hMs) {
      window.row_count_24h += 1;
      if (proof.volumeWax != null) {
        window.volume_24h_wax += proof.volumeWax;
        window.wax_volume_row_count_24h += 1;
        window.has_24h = true;
      } else {
        window.unproven_volume_row_count_24h += 1;
      }
    }
  }
  for (const [key, window] of windows.entries()) {
    const priceSamples = (window.price_samples || []).sort((a, b) => a.tradedMs - b.tradedMs);
    const latestPrice = priceSamples[priceSamples.length - 1] || null;
    const priorPrice = latestPrice
      ? priceSamples.slice(0, -1).reverse().find((sample) => sample.tradedMs <= latestPrice.tradedMs - (24 * 60 * 60 * 1000))
      : null;
    const rawChange24h = latestPrice && priorPrice && priorPrice.price !== 0
      ? ((latestPrice.price - priorPrice.price) / priorPrice.price) * 100
      : null;
    const latestTradeMs = Date.parse(window.latest_indexed_trade_time || '');
    const hasCurrent24hTradeWindow = window.row_count_24h > 0 && Number.isFinite(latestTradeMs) && latestTradeMs >= since24hMs;
    const change24h = hasCurrent24hTradeWindow ? rawChange24h : null;
    const volume24hReason = window.has_24h
      ? null
      : (window.row_count_24h > 0
        ? '24h_trade_rows_lack_wax_volume_proof'
        : (window.row_count_7d > 0 || window.row_count_30d > 0 ? 'no_indexed_trade_rows_in_24h_window' : 'no_indexed_trade_rows_for_pair'));
    const changeReason = change24h != null
      ? null
      : (!hasCurrent24hTradeWindow
        ? (window.row_count_30d > 0 ? 'stale_price_window' : 'no_current_24h_trade_window')
        : (!latestPrice
        ? 'no_indexed_price_samples'
        : (!priorPrice ? 'no_prior_price_sample_at_or_before_24h' : 'indexed_trade_price_window_insufficient_samples')));
    windows.set(key, {
      volume_24h_wax: window.has_24h ? safeDecimal(window.volume_24h_wax) : null,
      volume_7d_wax: window.has_7d ? safeDecimal(window.volume_7d_wax) : null,
      volume_30d_wax: window.has_30d ? safeDecimal(window.volume_30d_wax) : null,
      change_24h: safeDecimal(change24h),
      row_count_24h: window.row_count_24h,
      row_count_7d: window.row_count_7d,
      row_count_30d: window.row_count_30d,
      wax_volume_row_count_24h: window.wax_volume_row_count_24h,
      wax_volume_row_count_7d: window.wax_volume_row_count_7d,
      wax_volume_row_count_30d: window.wax_volume_row_count_30d,
      unproven_volume_row_count_24h: window.unproven_volume_row_count_24h,
      unproven_volume_row_count_7d: window.unproven_volume_row_count_7d,
      unproven_volume_row_count_30d: window.unproven_volume_row_count_30d,
      source: window.source,
      basis: window.basis,
      change_source: change24h != null ? 'indexed_trade_price_window' : null,
      change_reason: changeReason,
      volume_24h_reason: volume24hReason,
      latest_indexed_trade_time: window.latest_indexed_trade_time,
      latest_price_sample: latestPrice ? { traded_at: new Date(latestPrice.tradedMs).toISOString(), price: safeDecimal(latestPrice.price) } : null,
      prior_24h_price_sample: priorPrice ? { traded_at: new Date(priorPrice.tradedMs).toISOString(), price: safeDecimal(priorPrice.price) } : null,
      price_sample_count: priceSamples.length,
      latest_trade_at: latest.latest_trade_at,
      query_chunk_count: window.query_chunk_count || selectedRows.query_chunk_count,
      trade_rows_query_error: window.trade_rows_query_error || latest.trade_rows_query_error || selectedRows.trade_rows_query_error || null,
      no_fake_value: true,
    });
  }
  return windows;
}

async function indexedCandleChange24hByPair(db, pairs = [], selectedPriceWax = null) {
  const changes = new Map();
  for (const pair of pairs || []) {
    if (!pair?.source || !pair?.pair_id) continue;
    const candles = await listChartCandlesBySource(db, {
      source: pair.source,
      pair_id: pair.pair_id,
      interval: '1D',
      limit: 3,
    }).catch(() => ({ candles: [] }));
    const normalized = normalizeWaxcashWaxCandles(candles.candles || [], { selectedPriceWax });
    const change = waxcashPriceChangeFromCandles(normalized.candles || []);
    if (change == null) continue;
    changes.set(waxcashTradePairKey(pair.source, pair.pair_id), {
      change_24h: safeDecimal(change),
      source: 'normalized_indexed_1d_candle_close_window',
      row_count: (normalized.candles || []).length,
      latest_candle_time: (normalized.candles || []).slice(-1)[0]?.bucket_time || null,
      candle_normalization: normalized.summary,
      no_fake_value: true,
    });
  }
  return changes;
}

function applyIndexedPairWindowVolumes(pairs = [], windows = new Map(), waxUsd = null) {
  return (pairs || []).map((pair) => {
    const key = waxcashTradePairKey(pair?.source, pair?.pair_id);
    const window = windows.get(key);
    const metricSources = {
      volume_24h_wax: asNumber(pair?.volume_24h_wax) != null
        ? { source: 'indexed_pair_or_ticker_volume', row_count: 0 }
        : { source: null, row_count: 0 },
      volume_7d_wax: asNumber(pair?.volume_7d_wax) != null
        ? { source: 'indexed_pair_or_ticker_volume', row_count: 0 }
        : { source: null, row_count: 0 },
      volume_30d_wax: asNumber(pair?.volume_30d_wax) != null
        ? { source: 'indexed_pair_or_ticker_volume', row_count: 0 }
        : { source: null, row_count: 0 },
      change_24h: asNumber(pair?.change_24h) != null
        ? { source: 'indexed_pair_or_ticker_change', row_count: 0 }
        : { source: null, row_count: 0 },
      latest_indexed_trade_time: null,
    };
    if (!window) {
      metricSources.volume_24h_wax = { source: null, row_count: 0, reason: 'no_indexed_trade_rows_for_pair' };
      metricSources.volume_7d_wax = { source: null, row_count: 0, reason: 'no_indexed_trade_rows_for_pair' };
      metricSources.volume_30d_wax = { source: null, row_count: 0, reason: 'no_indexed_trade_rows_for_pair' };
      if (asNumber(pair?.change_24h) == null) {
        metricSources.change_24h = { source: null, row_count: 0, reason: 'indexed_pair_or_trade_price_change_unavailable' };
      }
      return { ...pair, metric_sources: metricSources };
    }
    const existingChange24h = asNumber(pair?.change_24h);
    const volume24Wax = asNumber(window?.volume_24h_wax);
    const volume7dWax = asNumber(window?.volume_7d_wax);
    const volume30dWax = asNumber(window?.volume_30d_wax);
    const tradeChange24h = asNumber(window?.change_24h);
    const change24h = existingChange24h ?? tradeChange24h;
    if (volume24Wax != null) metricSources.volume_24h_wax = { source: window.source, row_count: window.row_count_24h || 0 };
    else metricSources.volume_24h_wax = {
      source: null,
      row_count: window.row_count_24h || 0,
      reason: window.volume_24h_reason || 'indexed_trade_rows_window_wax_volume_unavailable',
      wax_volume_row_count: window.wax_volume_row_count_24h || 0,
      unproven_volume_row_count: window.unproven_volume_row_count_24h || 0,
    };
    if (volume7dWax != null) metricSources.volume_7d_wax = { source: window.source, row_count: window.row_count_7d || 0 };
    else metricSources.volume_7d_wax = {
      source: null,
      row_count: window.row_count_7d || 0,
      reason: window.row_count_7d ? '7d_trade_rows_lack_wax_volume_proof' : 'no_indexed_trade_rows_in_7d_window',
      wax_volume_row_count: window.wax_volume_row_count_7d || 0,
      unproven_volume_row_count: window.unproven_volume_row_count_7d || 0,
    };
    if (volume30dWax != null) metricSources.volume_30d_wax = { source: window.source, row_count: window.row_count_30d || 0 };
    else metricSources.volume_30d_wax = {
      source: null,
      row_count: window.row_count_30d || 0,
      reason: window.row_count_30d ? '30d_trade_rows_lack_wax_volume_proof' : 'no_indexed_trade_rows_in_30d_window',
      wax_volume_row_count: window.wax_volume_row_count_30d || 0,
      unproven_volume_row_count: window.unproven_volume_row_count_30d || 0,
    };
    if (existingChange24h != null) {
      metricSources.change_24h = { source: 'indexed_pair_or_ticker_change', row_count: 0 };
    } else if (change24h != null) {
      metricSources.change_24h = {
        source: window.change_source || 'indexed_trade_price_window',
        row_count: window.row_count_30d || 0,
      };
    } else {
      metricSources.change_24h = {
        source: null,
        row_count: window.row_count_30d || 0,
        reason: window.change_reason || (window.row_count_30d ? 'indexed_trade_price_window_insufficient_samples' : 'indexed_pair_or_trade_price_change_unavailable'),
      };
    }
    metricSources.latest_indexed_trade_time = window?.latest_indexed_trade_time || null;
    metricSources.indexed_trade_window_debug = {
      latest_price_sample: window.latest_price_sample || null,
      prior_24h_price_sample: window.prior_24h_price_sample || null,
      price_sample_count: window.price_sample_count || 0,
      volume_24h_reason: window.volume_24h_reason || null,
      change_24h_reason: window.change_reason || null,
      wax_volume_row_count_24h: window.wax_volume_row_count_24h || 0,
      unproven_volume_row_count_24h: window.unproven_volume_row_count_24h || 0,
      wax_volume_row_count_7d: window.wax_volume_row_count_7d || 0,
      unproven_volume_row_count_7d: window.unproven_volume_row_count_7d || 0,
      wax_volume_row_count_30d: window.wax_volume_row_count_30d || 0,
      unproven_volume_row_count_30d: window.unproven_volume_row_count_30d || 0,
      no_fake_value: true,
    };
    return {
      ...pair,
      volume_24h_wax: safeDecimal(volume24Wax) ?? pair.volume_24h_wax ?? null,
      volume_24h_usd: volume24Wax != null && waxUsd != null ? safeDecimal(volume24Wax * waxUsd) : (pair.volume_24h_usd ?? null),
      volume_7d_wax: safeDecimal(volume7dWax) ?? pair.volume_7d_wax ?? null,
      volume_7d_usd: volume7dWax != null && waxUsd != null ? safeDecimal(volume7dWax * waxUsd) : (pair.volume_7d_usd ?? null),
      volume_30d_wax: safeDecimal(volume30dWax) ?? pair.volume_30d_wax ?? null,
      volume_30d_usd: volume30dWax != null && waxUsd != null ? safeDecimal(volume30dWax * waxUsd) : (pair.volume_30d_usd ?? null),
      change_24h: safeDecimal(change24h) ?? pair.change_24h ?? null,
      indexed_pair_volume_window_source: window?.source || null,
      indexed_pair_volume_window_basis: window?.basis || null,
      metric_sources: metricSources,
    };
  });
}

async function buildWaxcashUdfChartFeed(db, query = {}) {
  const proofWrapper = await getWaxcashOgProof(db);
  const proof = proofWrapper.og_woe_parity || {};
  const headline = proof.headline_price || {};
  const { chart, chartFeedPool } = await buildWaxcashChartBundle(db, proof, headline, {
    resolution: query.resolution || query.interval || '1D',
    from: query.from,
    to: query.to,
    countBack: query.countback || query.countBack || query.limit || 120,
  });
  const history = tradingViewHistoryFromWaxcashChart(chart);
  return {
    feed_format: 'tradingview_udf_history',
    symbol: 'WAXCASH/WAX',
    ticker: 'WAXCASH/WAX',
    description: 'WAXCASH priced in WAX from indexed WaxOnEdge candles',
    exchange: 'WaxOnEdge',
    type: 'crypto',
    resolution: normalizeCandleInterval(query.resolution || query.interval || '1D'),
    price_unit: 'WAX_per_WAXCASH',
    source: chart.chart_source?.source || chartFeedPool?.source || null,
    pair_id: chart.chart_source?.pair_id || chartFeedPool?.pair_id || null,
    pair_label: 'WAXCASH/WAX',
    affects_waxonedge_metrics: false,
    selected_price_policy_unchanged: true,
    candle_normalization: chart.candle_normalization || null,
    build_from_indexed_trades: chart.build_from_indexed_trades || null,
    unavailable: chart.unavailable || null,
    no_fake_value: true,
    ...history,
  };
}

async function buildWaxcashAnalytics(db, env = null) {
  const [detail, proofWrapper] = await Promise.all([
    getToken(db, WAXCASH_CONTRACT, WAXCASH_SYMBOL),
    getWaxcashOgProof(db),
  ]);
  const token = detail.token || { contract: WAXCASH_CONTRACT, symbol: WAXCASH_SYMBOL };
  const detailStats = detail.stats || {};
  const proof = proofWrapper.og_woe_parity;
  const headline = proof.headline_price || {};
  const waxUsd = asNumber(headline.og_headline_price_usd) != null && asNumber(headline.og_headline_price_wax) != null
    ? asNumber(headline.og_headline_price_usd) / asNumber(headline.og_headline_price_wax)
    : null;
  const selectedPriceWax = asNumber(headline.og_headline_price_wax);
  const selectedPriceUsd = asNumber(headline.og_headline_price_usd);
  const { chart, chartFeedPool, selectedWaxPool } = await buildWaxcashChartBundle(db, proof, headline);
  const liveSupplyProof = await fetchWaxcashLiveSupplyProof(db, token);
  const [holderSnapshot, tradeWindowVolumes, pairWindowVolumes, ogLastStats, alcorTokenAnalytics] = await Promise.all([
    latestIndexedHolderCount(db, WAXCASH_CONTRACT, WAXCASH_SYMBOL),
    indexedTradeWindowVolumes(db, proof.all_pairs || [], { selectedPriceWax }),
    indexedTradeWindowVolumesByPair(db, proof.all_pairs || [], { selectedPriceWax }),
    env ? fetchWaxcashOgLastStats(env) : Promise.resolve({ live: false, reasons: ['waxonedge_og_api_base_not_configured'] }),
    fetchWaxcashAlcorTokenAnalytics(),
  ]);
  const indexedPairTablePairs = applyIndexedPairWindowVolumes(proof.all_pairs || [], pairWindowVolumes, waxUsd);
  const pairTablePairs = applyOgLastStatsToWaxcashPairs(indexedPairTablePairs, ogLastStats, waxUsd);
  const pairTableSection = waxcashBuildPairTableSection(pairTablePairs, selectedWaxPool);
  const pairSourceStabilityDebug = await waxcashPairSourceStabilityDiagnostics(db, {
    rawRows: proofWrapper.pair_input_debug?.raw_rows || [],
    proofPairs: proof.all_pairs || [],
    tableRows: pairTableSection.rows || [],
  });
  pairSourceStabilityDebug.raw_load_waxcash_pair_row_count = proofWrapper.pair_input_debug?.raw_load_waxcash_pair_row_count ?? pairSourceStabilityDebug.raw_load_waxcash_pair_row_count;
  pairSourceStabilityDebug.enriched_waxcash_pair_row_count = proofWrapper.pair_input_debug?.enriched_waxcash_pair_row_count ?? null;
  pairSourceStabilityDebug.paired_token_count = proofWrapper.pair_input_debug?.paired_token_count ?? null;
  pairSourceStabilityDebug.paired_direct_wax_pair_count = proofWrapper.pair_input_debug?.paired_direct_wax_pair_count ?? null;
  pairSourceStabilityDebug.source_counts.raw_load_waxcash_pair_rows = proofWrapper.pair_input_debug?.raw_source_counts || pairSourceStabilityDebug.source_counts.raw_load_waxcash_pair_rows;
  pairSourceStabilityDebug.source_counts.enriched_waxcash_pair_rows = proofWrapper.pair_input_debug?.enriched_source_counts || null;
  pairTableSection.metric_debug.source_stability = pairSourceStabilityDebug;
  pairTableSection.source_stability_debug = pairSourceStabilityDebug;
  const priceChange24hProof = await selectedProofPriceChange24h(db, selectedWaxPool, selectedPriceWax);
  const circulatingSupply = asNumber(detailStats.circulating_supply ?? token.circulating_supply);
  const totalSupply = liveSupplyProof.live ? asNumber(liveSupplyProof.total_supply) : null;
  const marketCapWax = circulatingSupply != null && selectedPriceWax != null ? circulatingSupply * selectedPriceWax : null;
  const marketCapUsd = circulatingSupply != null && selectedPriceUsd != null ? circulatingSupply * selectedPriceUsd : null;
  const fdvWax = totalSupply != null && selectedPriceWax != null ? totalSupply * selectedPriceWax : null;
  const fdvUsd = totalSupply != null && selectedPriceUsd != null ? totalSupply * selectedPriceUsd : null;
  const ogVolume24Wax = ogTokenVolume(ogLastStats.lastVolumes, '24h');
  const ogVolume7dWax = ogTokenVolume(ogLastStats.lastVolumes, '7d');
  const ogVolume30dWax = ogTokenVolume(ogLastStats.lastVolumes, '30d');
  const volume24Wax = asNumber(detailStats.volume_24h_wax ?? detailStats.volume_24h) ??
    ogVolume24Wax ??
    asNumber(tradeWindowVolumes.volume_24h_wax) ??
    sumProofField(proof.all_pairs, 'volume_24h_wax');
  const volume24Usd = asNumber(detailStats.volume_24h_usd) ?? (volume24Wax != null && waxUsd != null ? volume24Wax * waxUsd : null);
  const volume7d = asNumber(detailStats.volume_7d) ?? ogVolume7dWax ?? asNumber(tradeWindowVolumes.volume_7d);
  const volume30d = asNumber(detailStats.volume_30d) ?? ogVolume30dWax ?? asNumber(tradeWindowVolumes.volume_30d);
  const volume7dUsd = volume7d != null && waxUsd != null ? volume7d * waxUsd : null;
  const volume30dUsd = volume30d != null && waxUsd != null ? volume30d * waxUsd : null;
  const selectedDirectWaxReserve = asNumber(selectedWaxPool?.wax_reserve);
  const selectedDirectLiquidityWax = selectedDirectWaxReserve != null ? selectedDirectWaxReserve * 2 : null;
  const selectedDirectLiquidityUsd = selectedDirectLiquidityWax != null && waxUsd != null ? selectedDirectLiquidityWax * waxUsd : null;
  const cumulatedPairLiquidityWax = asNumber(proof.aggregate_pair_liquidity?.liquidity_wax ?? proof.pair_summary?.total_pair_liquidity_wax);
  const cumulatedPairLiquidityUsd = asNumber(proof.aggregate_pair_liquidity?.liquidity_usd ?? proof.pair_summary?.total_pair_liquidity_usd) ??
    (cumulatedPairLiquidityWax != null && waxUsd != null ? cumulatedPairLiquidityWax * waxUsd : null);
  const tvlWax = cumulatedPairLiquidityWax;
  const tvlUsd = cumulatedPairLiquidityUsd;
  const selectedPriceLive = selectedPriceWax != null;
  const totalSupplyLive = liveSupplyProof.live && totalSupply != null;
  const circulatingSupplyBasis = circulatingSupply != null
    ? 'indexed_circulating_supply'
    : (totalSupplyLive ? 'og_woe_total_supply_as_circulating_for_waxcash' : null);
  const effectiveCirculatingSupply = circulatingSupply != null ? circulatingSupply : (totalSupplyLive ? totalSupply : null);
  const effectiveMarketCapWax = effectiveCirculatingSupply != null && selectedPriceWax != null ? effectiveCirculatingSupply * selectedPriceWax : null;
  const effectiveMarketCapUsd = effectiveCirculatingSupply != null && selectedPriceUsd != null ? effectiveCirculatingSupply * selectedPriceUsd : null;
  const marketCapLive = effectiveMarketCapWax != null || effectiveMarketCapUsd != null;
  const circulatingSupplyLive = effectiveCirculatingSupply != null;
  const alcorHolderCount = asNumber(alcorTokenAnalytics.holder_count);
  const holderCount = asNumber(detailStats.holder_count) ?? asNumber(holderSnapshot.holder_count) ?? alcorHolderCount;
  const holderCountLive = holderCount != null;
  const fdvLive = fdvWax != null || fdvUsd != null;
  const ogSelectedChange24h = ogPairChange24h(ogLastStats.lastPriceChanges, selectedWaxPool);
  const change24h = asNumber(detailStats.change_24h) ?? ogSelectedChange24h ?? asNumber(priceChange24hProof.change_24h);
  const metricStatus = detailStats.metric_status || {};
  const supplySyncStatus = await getWaxcashSupplySyncStatus(db);
  const totalSupplyReason = totalSupplyLive
    ? null
    : (liveSupplyProof.reason || supplySyncStatus?.waxcash?.last_error || 'Requires WAX RPC get_currency_stats proof for graffitiking::WAXCASH');
  const analytics = {
    token: {
      contract: WAXCASH_CONTRACT,
      symbol: WAXCASH_SYMBOL,
      key: WAXCASH_KEY,
      decimals: asNumber(liveSupplyProof.decimals) ?? asNumber(token.decimals),
      total_supply: safeDecimal(totalSupply),
      circulating_supply: safeDecimal(effectiveCirculatingSupply),
      icon_url: token.icon_url || null,
      updated_at: liveSupplyProof.updated_at || token.updated_at || detailStats.updated_at || proof.headline_price?.og_headline_updated_at || null,
    },
    stats: {
      selected_price_wax: safeDecimal(selectedPriceWax),
      selected_price_usd: safeDecimal(selectedPriceUsd),
      selected_price_source: headline.og_headline_price_source || null,
      selected_pair_source: headline.og_headline_price_source || null,
      selected_pair_id: headline.og_headline_price_pair_id || null,
      selected_pair_label: headline.og_headline_price_pair_label || null,
      selected_price_basis: 'og_woe_direct_wax_pool',
      selected_price_formula: headline.og_headline_formula || null,
      selected_price_route: null,
      selected_price_confidence: selectedPriceLive ? 'good' : 'unavailable',
      selected_price_rejection_reason: selectedPriceLive ? null : (headline.og_headline_reason_codes || []).join(',') || 'direct_wax_price_unavailable',
      uses_recursive_graph_price: false,
      holder_count: holderCount,
      tvl_wax: safeDecimal(tvlWax),
      tvl_usd: safeDecimal(tvlUsd),
      liquidity_wax: safeDecimal(cumulatedPairLiquidityWax),
      liquidity_usd: safeDecimal(cumulatedPairLiquidityUsd),
      selected_direct_wax_pair_liquidity_wax: safeDecimal(selectedDirectLiquidityWax),
      selected_direct_wax_pair_liquidity_usd: safeDecimal(selectedDirectLiquidityUsd),
      cumulated_pair_liquidity_wax: safeDecimal(cumulatedPairLiquidityWax),
      cumulated_pair_liquidity_usd: safeDecimal(cumulatedPairLiquidityUsd),
      volume_24h_wax: safeDecimal(volume24Wax),
      volume_24h_usd: safeDecimal(volume24Usd),
      volume_7d: safeDecimal(volume7d),
      volume_7d_wax: safeDecimal(volume7d),
      volume_7d_usd: safeDecimal(volume7dUsd),
      volume_30d: safeDecimal(volume30d),
      volume_30d_wax: safeDecimal(volume30d),
      volume_30d_usd: safeDecimal(volume30dUsd),
      change_24h: safeDecimal(change24h),
      circulating_supply: safeDecimal(effectiveCirculatingSupply),
      circulating_supply_basis: circulatingSupplyBasis,
      market_cap_wax: safeDecimal(effectiveMarketCapWax),
      market_cap_usd: safeDecimal(effectiveMarketCapUsd),
      market_cap_confidence: marketCapLive ? 'good' : 'unavailable',
      market_cap_basis: marketCapLive ? 'circulating_supply_x_selected_price' : null,
      market_cap_rejection_reason: marketCapLive ? null : (effectiveCirculatingSupply == null ? 'circulating_supply_unavailable' : 'selected_price_unavailable'),
      total_supply: safeDecimal(totalSupply),
      fdv_wax: safeDecimal(fdvWax),
      fdv_usd: safeDecimal(fdvUsd),
      fdv_confidence: fdvWax != null || fdvUsd != null ? 'good' : 'unavailable',
      source_count: asNumber(detailStats.source_count) ?? proof.pair_summary?.source_count ?? null,
      indexed_pair_count: proof.pair_summary?.total_pairs ?? asNumber(detailStats.indexed_pair_count),
      source_keys: detailStats.source_keys || Array.from(new Set((proof.all_pairs || []).map((pair) => aggregateSourceKey(pair.source)).filter(Boolean))).sort().join(','),
      updated_at: detailStats.updated_at || proof.headline_price?.og_headline_updated_at || null,
      metric_status: {
        selected_price: {
          live: selectedPriceLive,
          source: selectedPriceLive ? 'og_woe_direct_wax_pool' : null,
          reason: selectedPriceLive ? null : 'Requires verified direct WAX/WAXCASH pool proof',
        },
        holder_count: holderCountLive
          ? {
            live: true,
            source: asNumber(detailStats.holder_count) != null
              ? 'indexed_token_stats'
              : (asNumber(holderSnapshot.holder_count) != null ? 'indexed_holder_snapshot' : 'alcor_token_analytics_holders'),
            snapshot_at: holderSnapshot.snapshot_at || alcorTokenAnalytics.holder_snapshot_at || null,
            reason: null,
          }
          : {
            live: false,
            source: null,
            reason: holderSnapshot.reason || alcorTokenAnalytics.holder_reason || alcorTokenAnalytics.reason || metricStatus.holder_count?.reason || 'Holder count requires a verified indexed holder source; no fake holder count is emitted',
          },
        total_supply: {
          live: totalSupplyLive,
          source: totalSupplyLive ? 'wax_rpc_get_currency_stats' : null,
          basis: totalSupplyLive ? 'graffitiking::WAXCASH stat.supply' : null,
          reason: totalSupplyReason,
          sync_status: supplySyncStatus?.waxcash || null,
        },
        circulating_supply: {
          live: circulatingSupplyLive,
          source: circulatingSupplyLive
            ? (circulatingSupplyBasis === 'indexed_circulating_supply' ? 'indexed_token_stats' : 'wax_rpc_get_currency_stats')
            : null,
          basis: circulatingSupplyBasis,
          reason: circulatingSupplyLive ? null : 'WAXCASH circulating supply requires indexed supply or the WAXCASH-only OG total-supply parity rule',
        },
        volume_24h: metricStatus.volume_24h || {
          live: volume24Wax != null || volume24Usd != null,
          source: volume24Wax != null || volume24Usd != null
            ? (asNumber(detailStats.volume_24h_wax ?? detailStats.volume_24h) != null ? 'indexed_pair_or_ticker_volume' : (ogVolume24Wax != null ? 'og_waxonedge_lastVolumes' : (asNumber(tradeWindowVolumes.volume_24h_wax) != null ? 'indexed_trade_rows_window_wax_denominated' : 'indexed_pair_or_ticker_volume')))
            : null,
          reason: volume24Wax != null || volume24Usd != null ? null : 'Requires indexed pair or ticker volume',
          basis: asNumber(tradeWindowVolumes.volume_24h_wax) != null ? tradeWindowVolumes.basis : null,
        },
        volume_7d: volume7d != null ? {
          live: volume7d != null,
          source: volume7d != null ? (asNumber(detailStats.volume_7d) != null ? 'indexed_token_stats' : (ogVolume7dWax != null ? 'og_waxonedge_lastVolumes' : 'indexed_trade_rows_window_wax_denominated')) : null,
          basis: asNumber(detailStats.volume_7d) != null ? 'indexed_token_stats' : (ogVolume7dWax != null ? 'og_waxonedge_lastVolumes' : tradeWindowVolumes.basis),
          reason: volume7d != null ? null : (tradeWindowVolumes.reason || 'Requires indexed candle or trade history'),
        } : (metricStatus.volume_7d || {
          live: false,
          source: null,
          reason: tradeWindowVolumes.reason || 'Requires indexed candle or trade history',
        }),
        volume_30d: volume30d != null ? {
          live: volume30d != null,
          source: volume30d != null ? (asNumber(detailStats.volume_30d) != null ? 'indexed_token_stats' : (ogVolume30dWax != null ? 'og_waxonedge_lastVolumes' : 'indexed_trade_rows_window_wax_denominated')) : null,
          basis: asNumber(detailStats.volume_30d) != null ? 'indexed_token_stats' : (ogVolume30dWax != null ? 'og_waxonedge_lastVolumes' : tradeWindowVolumes.basis),
          reason: volume30d != null ? null : (tradeWindowVolumes.reason || 'Requires indexed candle or trade history'),
        } : (metricStatus.volume_30d || {
          live: false,
          source: null,
          reason: tradeWindowVolumes.reason || 'Requires indexed candle or trade history',
        }),
        change_24h: {
          live: change24h != null,
          source: asNumber(detailStats.change_24h) != null ? 'indexed_token_stats' : (ogSelectedChange24h != null ? 'og_waxonedge_lastPriceChanges' : priceChange24hProof.source),
          basis: asNumber(detailStats.change_24h) != null ? 'indexed_token_stats' : (ogSelectedChange24h != null ? 'og_waxonedge_lastPriceChanges' : priceChange24hProof.basis),
          reason: change24h != null ? null : (priceChange24hProof.reason || 'Requires selected proof pool price history or indexed token stats'),
        },
        market_cap: {
          live: marketCapLive,
          basis: marketCapLive ? 'circulating_supply_x_selected_price' : null,
          formula: 'circulating_supply x selected_price',
          reason: marketCapLive ? null : (effectiveCirculatingSupply == null ? 'Requires WAXCASH circulating supply and selected price' : 'Requires selected price'),
        },
        fdv: {
          live: fdvLive,
          basis: fdvLive ? 'total_supply_x_selected_price' : null,
          formula: 'total_supply x selected_price',
          reason: fdvLive ? null : (totalSupply == null ? 'Requires WAX RPC total supply and selected price' : 'Requires selected price'),
        },
      },
    },
    pairs: proof.all_pairs || [],
    pair_summary: proof.pair_summary,
    headline_price: headline,
    selected_largest_wax_reserve_pool: selectedWaxPool,
    aggregate_pair_liquidity: proof.aggregate_pair_liquidity,
    chart,
    supply_sync_status: supplySyncStatus,
    og_last_stats: {
      live: ogLastStats.live,
      sources: ogLastStats.sources,
      reasons: ogLastStats.reasons,
      token_key: 'graffitiking_waxcash',
      no_fake_value: true,
    },
    alcor_token_analytics: {
      live: !!alcorTokenAnalytics.ok,
      source: alcorTokenAnalytics.source || null,
      holder_count_live: alcorHolderCount != null,
      holder_reason: alcorTokenAnalytics.holder_reason || alcorTokenAnalytics.reason || null,
      no_fake_value: true,
    },
    proof,
    pair_source_stability_debug: pairSourceStabilityDebug,
    source_policy: 'waxcash_analytics_uses_og_woe_direct_wax_price_not_recursive_graph',
  };
  analytics.sections = {
    token_stats: waxcashBuildTokenStatsSection({
      token: analytics.token,
      stats: analytics.stats,
      supplyProof: liveSupplyProof,
    }),
    price_proof: {
      live: selectedPriceLive,
      source: headline.og_headline_price_source || null,
      pair_id: headline.og_headline_price_pair_id || null,
      pair_label: headline.og_headline_price_pair_label || null,
      basis: 'og_woe_deepest_usable_direct_wax_pool',
      formula: headline.og_headline_formula || null,
      reserves: {
        wax: headline.og_headline_wax_reserve || null,
        waxcash: headline.og_headline_token_reserve || null,
      },
      liquidity_wax: headline.selected_trusted_wax_side_liquidity_wax || null,
      proof_status: headline.selected_proof_status || (selectedPriceLive ? 'verified' : 'unavailable'),
      candidate_count: headline.direct_wax_candidate_count || 0,
      usable_candidate_count: headline.usable_direct_wax_candidate_count || 0,
      selected_price_wax: analytics.stats.selected_price_wax,
      selected_price_usd: analytics.stats.selected_price_usd,
      reason: selectedPriceLive ? null : analytics.stats.selected_price_rejection_reason,
      no_fake_value: true,
    },
    supply_proof: {
      ...liveSupplyProof,
      fdv_wax: analytics.stats.fdv_wax,
      fdv_usd: analytics.stats.fdv_usd,
      fdv_formula: 'total_supply x selected_price',
      market_cap_wax: analytics.stats.market_cap_wax,
      market_cap_usd: analytics.stats.market_cap_usd,
      market_cap_reason: analytics.stats.market_cap_wax == null && analytics.stats.market_cap_usd == null
        ? 'Requires WAXCASH circulating supply and selected price.'
        : null,
      circulating_supply: analytics.stats.circulating_supply,
      circulating_supply_basis: analytics.stats.circulating_supply_basis,
    },
    chart: {
      price_unit: 'WAX_per_WAXCASH',
      normalized: true,
      inverted_count: chart.candle_normalization?.inverted_count || 0,
      source: chart.chart_source?.source || null,
      pair_id: chart.chart_source?.pair_id || null,
      pair_label: 'WAXCASH/WAX',
      feed_url: `${WAXONEDGE_API_PREFIX}/waxcash-analytics/chart-feed?resolution=1D`,
      feed_format: 'tradingview_udf_history',
      candles: chart.candles || [],
      build_from_indexed_trades: chart.build_from_indexed_trades || null,
      unavailable: chart.unavailable || null,
      no_fake_value: true,
    },
    pair_table: pairTableSection,
  };
  return analytics;
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
          const parsed = parseFrontierKey(key);
          if (key && parsed && !isWaxToken(parsed.contract, parsed.symbol) && !seenTokens.has(key)) {
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
  const waxcashOgProof = isWaxcashToken(contract, symbol) ? await getWaxcashOgProof(db) : null;
  return {
    token: detail.token,
    stats: detail.stats,
    chart_src: chartSrc,
    chart_pair_id: chartPairId,
    candle_url_example: candleUrlExample(chartSrc, chartPairId),
    reference_candle_url_example: referenceCandleUrlExample(chartSrc, chartPairId),
    aggregate_totals: aggregateTotals,
    ...(waxcashOgProof || {}),
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
      transport: liveIndexerProbe?.reachable ? 'sse' : 'snapshot-polling-fallback',
      vps_stream_required: !liveIndexerProbe?.reachable,
      live_indexer: waxonedgeLiveIndexerConfig(env),
      live_indexer_probe: liveIndexerProbe,
      uses_fake_live_data: false,
      browser_hyperion_fetch: false,
      token_key_format: 'contract::symbol',
      instant_market_cap_recompute: liveIndexerProbe?.reachable === true,
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
      head_refresh_enabled: tradeIndexSnapshot.data?.head_refresh_enabled === true,
      head_refresh_stream_count: asNumber(tradeIndexSnapshot.data?.head_refresh_stream_count) || 0,
      head_refresh_failed_stream_count: asNumber(tradeIndexSnapshot.data?.head_refresh_failed_stream_count) || 0,
      head_refresh_rows_fetched: asNumber(tradeIndexSnapshot.data?.head_refresh_rows_fetched) || 0,
      head_refresh_rows_written: asNumber(tradeIndexSnapshot.data?.head_refresh_rows_written) || 0,
      head_refresh_duplicate_rows_skipped: asNumber(tradeIndexSnapshot.data?.head_refresh_duplicate_rows_skipped) || 0,
      head_refresh_latest_indexed_timestamp: tradeIndexSnapshot.data?.head_refresh_latest_indexed_timestamp || null,
      head_refresh_last_error: tradeIndexSnapshot.data?.head_refresh_last_error || null,
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
      head_refresh_enabled: ammTradeIndexSnapshot.data?.head_refresh_enabled === true,
      head_refresh_stream_count: asNumber(ammTradeIndexSnapshot.data?.head_refresh_stream_count) || 0,
      head_refresh_failed_stream_count: asNumber(ammTradeIndexSnapshot.data?.head_refresh_failed_stream_count) || 0,
      head_refresh_rows_fetched: asNumber(ammTradeIndexSnapshot.data?.head_refresh_rows_fetched) || 0,
      head_refresh_rows_written: asNumber(ammTradeIndexSnapshot.data?.head_refresh_rows_written) || 0,
      head_refresh_duplicate_rows_skipped: asNumber(ammTradeIndexSnapshot.data?.head_refresh_duplicate_rows_skipped) || 0,
      head_refresh_latest_indexed_timestamp: ammTradeIndexSnapshot.data?.head_refresh_latest_indexed_timestamp || null,
      head_refresh_last_error: ammTradeIndexSnapshot.data?.head_refresh_last_error || null,
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
    price: has((token) => asNumber(token?.selected_price_wax ?? token?.selected_price_usd ?? token?.price_wax ?? token?.price_usd) != null),
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
  const aggregateCount = tokens.filter((token) => token.liquidity_wax != null || token.selected_pair_source != null).length;
  const metricCapabilities = metricCapabilitiesFromTokens(tokens);
  const waxToken = tokens.find((token) => normalizeContract(token.contract) === 'eosio.token' && normalizeSymbol(token.symbol) === 'WAX');
  const waxGlobalPrice = asNumber(alcorGlobal.data?.usd_price ?? alcorGlobal.data?.wax_usd ?? alcorGlobal.data?.price);
  const waxPriceUsd = asNumber(waxToken?.price_usd) ?? waxGlobalPrice;
  const warnings = [];
  if (!updatedAt) warnings.push(REQUIRES_INDEXED_BACKEND);
  warnings.push('Holder distribution requires indexed balance snapshots or a verified holder source.');
  warnings.push('7d/30d volume, market cap, FDV, and chart candles stay unavailable until indexed from source data.');
  return ok({
    summary: {
      token_count: tokens.length,
      pair_count: pairs.length,
      token_aggregate_count: aggregateCount,
      wax_price_usd: waxPriceUsd == null ? null : safeDecimal(waxPriceUsd),
      wax_price_source: waxPriceUsd == null ? null : (asNumber(waxToken?.price_usd) != null ? 'indexed eosio.token/WAX token price' : 'Alcor analytics/global'),
      metric_capabilities: metricCapabilities,
    },
    metric_capabilities: metricCapabilities,
    tokens,
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
    if (path === `${WAXONEDGE_API_PREFIX}/tokens/top`) return ok(await listTopTokens(env.DB), [], null, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/pairs/top`) return ok(await listTopPairs(env.DB), [], null, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/waxcash-graph`) {
      const graph = await buildWaxcashPairGraph(env.DB);
      return ok(graph, ['WAXCASH graph is derived only from indexed direct waxonedge_pairs rows; bootstrap token inventory is not used.'], graph.updated_at, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/waxcash-analytics`) {
      const analytics = await buildWaxcashAnalytics(env.DB, env);
      return ok(analytics, ['WAXCASH analytics uses old WaxOnEdge-style direct WAX price proof; recursive graph routing is not a selected-price source.'], analytics.stats?.updated_at || analytics.token?.updated_at || null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/waxcash-analytics/laststats-diagnostics`) {
      const diagnostics = await getWaxcashLastStatsDiagnostics(env);
      return ok(diagnostics, ['Diagnostic-only WAXCASH OG LastStats environment, bucket, migration, and source-sync proof.'], null, corsHeaders);
    }
    const ogEndpointMatch = path.match(/^\/api\/waxonedge\/(pools|pool|poolsv3|poolv3|markets|market|lastVolumes|lastPriceChanges)(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if (ogEndpointMatch) {
      const endpoint = `/${ogEndpointMatch[1]}${ogEndpointMatch[2] ? `/${decodeURIComponent(ogEndpointMatch[2])}` : ''}${ogEndpointMatch[3] ? `/${decodeURIComponent(ogEndpointMatch[3])}` : ''}`;
      if (!WAXONEDGE_OG_ENDPOINTS.some((allowed) => endpoint === allowed || endpoint.startsWith(`${allowed}/`))) {
        return unavailable('WaxOnEdge OG endpoint not allowed', 404, corsHeaders);
      }
      const upstream = await fetchWaxonedgeOgJson(env, endpoint);
      if (!upstream.ok) return unavailable(upstream.reason || 'waxonedge_og_endpoint_unavailable', 503, corsHeaders);
      return ok({
        endpoint,
        source: upstream.source,
        data: upstream.data,
        no_fake_value: true,
      }, ['Proxied from OG WaxOnEdge API endpoint shape.'], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/waxcash-analytics/chart-feed`) {
      const feed = await buildWaxcashUdfChartFeed(env.DB, Object.fromEntries(url.searchParams.entries()));
      return ok(feed, feed.unavailable ? [feed.unavailable] : ['WAXCASH chart feed is UDF-shaped and backed by indexed WaxOnEdge candle/trade rows only.'], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/candles`) {
      const chart = await listChartCandlesBySource(env.DB, Object.fromEntries(url.searchParams.entries()));
      return ok(chart, chart.unavailable ? [chart.unavailable] : [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/waxcash-supply-status`) {
      const supply = await getWaxcashSupplySyncStatus(env.DB);
      return ok(supply, supply.waxcash?.last_error ? [supply.waxcash.last_error] : [], supply.waxcash?.updated_at || supply.sync_state?.updated_at || null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/sync-status`) {
      const [latest_sync, source_index_state, waxcash_supply] = await Promise.all([
        getLatestSync(env.DB),
        getSourceIndexStates(env.DB),
        getWaxcashSupplySyncStatus(env.DB),
      ]);
      return ok({ latest_sync, source_index_state, waxcash_supply }, waxcash_supply.waxcash?.last_error ? [waxcash_supply.waxcash.last_error] : [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/indexer-health`) {
      return ok(await getIndexerHealth(env.DB, env), [], null, corsHeaders);
    }
    if (path === WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT) {
      return handleLiveSnapshot(env, url.searchParams, corsHeaders);
    }
    if (path === WAXONEDGE_LIVE_STREAM_ENDPOINT) {
      return await handleLiveStream(corsHeaders, env);
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
      if (child === 'og-proof') {
        if (!isWaxcashToken(contract, symbol)) return unavailable('OG parity proof is only available for graffitiking::WAXCASH in this narrow PR', 404, corsHeaders);
        const proof = await getWaxcashOgProof(env.DB);
        return ok(proof, ['WAXCASH OG parity proof uses exact indexed pairs and the direct WAX pool with the deepest usable WAX-side liquidity only.'], proof.og_woe_parity?.headline_price?.og_headline_updated_at || null, corsHeaders);
      }
      if (child === 'holders') {
        const holders = await listIndexedHolders(env.DB, contract, symbol, {
          limit: url.searchParams.get('limit'),
        });
        return ok(holders, holders.unavailable ? [holders.unavailable] : [], holders.snapshot_at || null, corsHeaders);
      }
      if (child === 'trades') {
        const trades = await listIndexedTrades(env.DB, contract, symbol, {
          limit: url.searchParams.get('limit'),
        });
        return ok(trades, trades.unavailable ? [trades.unavailable] : [], trades.rows?.[0]?.traded_at || null, corsHeaders);
      }
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
  deriveReserveBackedTokenRow,
  deriveReserveBackedTokenRows,
  tokenMetricProof,
  pairContributionProof,
  aggregatePairContributionTotals,
  ogPairReserveValuation,
  buildOgWaxRouteGraph,
  selectOgWaxRoutePrice,
  selectLiquidityWeightedMedianPrice,
  priceAlcorOrderbook,
  priceAlcorConcentratedPool,
  priceV2ConstantProductPool,
  priceWaxFusionSpecial,
  priceAdapterPair,
  DEX_ADAPTER_CONTRACT,
  buildWaxcashAnalytics,
  buildWaxcashUdfChartFeed,
  getWaxcashLastStatsDiagnostics,
  buildInternalD1WaxcashLastStats,
  fetchWaxcashOgLastStats,
  buildWaxcashOgParityProof,
  applyOgLastStatsToWaxcashPairs,
  applyIndexedPairWindowVolumes,
  waxcashPairTableRow,
  waxcashBuildPairTableSection,
  getWaxcashSupplySyncStatus,
  normalizeWaxcashWaxCandles,
  waxcashHeadlinePrice,
  waxcashChartFeedPool,
  selectedProofPriceChange24h,
  waxcashTradeVolumeWax,
  indexedTradeWindowVolumes,
  indexedTradeWindowVolumesByPair,
  waxcashGraphPairValuation,
  ogDirectWaxTokenPrice,
  ogV3DirectWaxTokenPrice,
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
  hyperionStateEndpoint,
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
  normalizeLiveIndexerHistoryTrade,
  liveIndexerHistoryTradeRows,
  syncLiveIndexerHistory,
  holderRowsFromHyperionPayload,
  fetchWaxcashHolderRows,
  syncWaxcashHolderSnapshot,
  syncPinnedWaxcashPairs,
  normalizeActionStreamProgressMap,
  normalizeCoreDexPair,
  liveTokenUpdateKey,
  liveCursorFromRow,
  parseLiveCursor,
  normalizeLiveTokenUpdate,
  instantLiveTokenUpdatesForVerifiedPairEvent,
  buildInstantLiveTokenUpdatesForPair,
  pairPassesGraphExpansionThreshold,
  syncSupplyInputs,
  waxcashSupplyTarget,
  loadWaxcashGraphTokenRows,
  buildWaxcashPairGraph,
  sortWaxcashGraphTokens,
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
  const liveIndexerHistory = await syncLiveIndexerHistory(env);
  const alcorTradeBackfill = await syncAlcorMarketTradeRows(env);
  const ammTradeBackfill = await syncAmmSwapTradeRows(env);
  return {
    ok: liveIndexerHistory.ok && alcorTradeBackfill.ok && ammTradeBackfill.ok,
    liveIndexerHistory,
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
        const [core, pinned] = await Promise.all([
          syncCoreDexAdapters(env, syncCycleId, {
          source: adapter.source,
          maxPages: FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION,
          requestBudget: FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE,
          }),
          syncPinnedWaxcashPairs(env, syncCycleId),
        ]);
        return { ok: core.ok && pinned.ok, syncCycleId, source: adapter.source, core, pinned };
      })());
    } else if (rotationSlot === 2) {
      tasks.push(aggregateTokenAnalytics(env));
    } else if (rotationSlot === 3) {
      tasks.push(planWaxOnEdgeCandleBackfill(env));
    } else {
      tasks.push(Promise.all([syncSupplyInputs(env), syncWaxcashHolderSnapshot(env)]).then(([supply, holders]) => ({
        ok: supply.ok && holders.ok,
        supply,
        holders,
      })));
    }
  } else if (shouldRunFullIndex) {
    tasks.push((async () => {
      const syncCycleId = await getActiveSourceCycleId(env.DB);
      const [alcor, core, nefty, pinned] = await Promise.all([
        syncAlcorMarketData(env, 'alcor_five_minute_market_data', syncCycleId),
        syncCoreDexAdapters(env, syncCycleId),
        syncNeftyAbi(env),
        syncPinnedWaxcashPairs(env, syncCycleId),
      ]);
      const tradeBackfill = await runWaxOnEdgeTradeBackfill(env);
      const holders = await syncWaxcashHolderSnapshot(env);
      const aggregates = await aggregateTokenAnalytics(env);
      const candleBackfill = await planWaxOnEdgeCandleBackfill(env);
      return { ok: alcor.ok && core.ok && nefty.ok && pinned.ok && tradeBackfill.ok && holders.ok && aggregates.ok && candleBackfill.ok, syncCycleId, alcor, core, nefty, pinned, tradeBackfill, holders, aggregates, candleBackfill };
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
  if (!freeSafeMode && (!cron || cron === '0 */2 * * *' || (isMinuteCron && minute === 0 && hour % 2 === 0))) tasks.push(syncWaxcashHolderSnapshot(env));
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

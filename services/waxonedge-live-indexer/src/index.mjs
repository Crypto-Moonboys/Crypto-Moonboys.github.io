import http from 'node:http';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVE_SECRET_HEADER = 'x-waxonedge-live-secret';

export const VERIFIED_TRADE_STREAMS = Object.freeze([
  { account: 'alcordexmain', action: 'buymatch', source: 'alcor', og_source: 'alcor_buy' },
  { account: 'alcordexmain', action: 'sellmatch', source: 'alcor', og_source: 'alcor_sell' },
  { account: 'swap.alcor', action: 'logswap', source: 'swap.alcor', og_source: 'alcorv2', parser: 'swap-v3' },
  { account: 'swap.taco', action: 'exchangelog', source: 'swap.taco', og_source: 'taco', parser: 'swap-v2-taco' },
  { account: 'swap.box', action: 'swaplog', source: 'swap.box', og_source: 'defibox', parser: 'swap-v2-defibox' },
  { account: 'swap.nefty', action: 'logswap', source: 'swap.nefty', og_source: 'neftyblocks', parser: 'swap-v2-nefty' },
]);

const DEFAULT_LIVE_POLL_MS = 1000;
const DEFAULT_LIVE_FETCH_LIMIT = 50;
const MAX_TOKEN_CACHE_SIZE = 500;
const MAX_SEEN_TRADE_IDS = 5000;
const MAX_PERSISTED_TRADE_HISTORY = 100000;
const FRESH_HISTORY_MODE = 'fresh_start';

function nowIso() {
  return new Date().toISOString();
}

function booleanEnv(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parsePort(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 8789;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function defaultHistoryPath(cwd = process.cwd()) {
  return resolve(cwd, 'data', 'waxonedge-live-history.json');
}

export function normalizeBindHost(value) {
  const raw = String(value || '').trim() || '127.0.0.1';
  if (/^\[[^\]]+\]$/.test(raw)) return raw.slice(1, -1);
  return raw;
}

function sanitizedHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch (_) {
    return '';
  }
}

function safeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeSymbol(value) {
  return safeString(value).toUpperCase();
}

function normalizeContract(value) {
  return safeString(value).toLowerCase();
}

function asNumber(value) {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function safeDecimal(value) {
  const n = asNumber(value);
  return n == null ? null : n;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function sourceRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.actions)) return data.actions;
  if (Array.isArray(data?.simple_actions)) return data.simple_actions;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.value)) return data.value;
  return [];
}

function parseAsset(asset) {
  if (asset && typeof asset === 'object') {
    const quantity = firstPresent(asset.quantity, asset.asset, asset.amount, asset.value);
    const parsed = parseAsset(quantity);
    return {
      ...parsed,
      contract: normalizeContract(firstPresent(asset.contract, asset.token_contract, asset.code, parsed.contract)),
    };
  }
  const raw = safeString(asset);
  const match = raw.match(/^([+-]?\d+(?:\.\d+)?)\s+([A-Z0-9._-]+)$/i);
  if (!match) return { raw, amount: asNumber(raw), symbol: '', contract: '', precision: null };
  return {
    raw,
    amount: asNumber(match[1]),
    symbol: normalizeSymbol(match[2]),
    contract: '',
    precision: match[1].includes('.') ? match[1].split('.')[1].length : 0,
  };
}

function tokenKey(contract, symbol) {
  const c = normalizeContract(contract);
  const s = normalizeSymbol(symbol);
  return c && s ? `${c}::${s}` : '';
}

function normalizeTradeTimestamp(value) {
  const text = safeString(value);
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T/.test(text) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)
    ? `${text}Z`
    : text;
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function hyperionHistoryActionsEndpoint(config) {
  const base = config?.hyperion_api || config?.state_history_endpoint || config?.waxnode_endpoint || '';
  if (!base) return '';
  if (/\/history\/get_actions$/i.test(base)) return base;
  const cleanBase = base.replace(/\/+$/, '');
  return `${cleanBase}/history/get_actions`;
}

function streamKey(stream) {
  return `${stream.account}::${stream.action}`;
}

function historyStreamUrl(config, stream, limit) {
  const endpoint = hyperionHistoryActionsEndpoint(config);
  if (!endpoint) return '';
  const url = new URL(endpoint);
  url.searchParams.set('account', stream.account);
  url.searchParams.set('act.name', stream.action);
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('simple', 'true');
  url.searchParams.set('noBinary', 'true');
  url.searchParams.set('checkLib', 'true');
  return url.toString();
}

export function loadConfig(env = process.env) {
  return {
    port: parsePort(env.WAXONEDGE_LIVE_PORT),
    bind_host: normalizeBindHost(env.WAXONEDGE_LIVE_BIND_HOST),
    hyperion_api: sanitizedHttpUrl(env.WAXONEDGE_HYPERION_API),
    state_history_endpoint: sanitizedHttpUrl(env.WAXONEDGE_STATE_HISTORY_ENDPOINT),
    waxnode_endpoint: sanitizedHttpUrl(env.WAXNODE_ENDPOINT),
    stream_enabled: booleanEnv(env.WAXONEDGE_LIVE_ENABLE_STREAM, false),
    poll_ms: clampInteger(env.WAXONEDGE_LIVE_POLL_MS, DEFAULT_LIVE_POLL_MS, 1000, 60000),
    fetch_limit: clampInteger(env.WAXONEDGE_LIVE_FETCH_LIMIT, DEFAULT_LIVE_FETCH_LIMIT, 1, 250),
    history_path: safeString(env.WAXONEDGE_LIVE_HISTORY_PATH),
    shared_secret_configured: Boolean(String(env.WAXONEDGE_LIVE_SHARED_SECRET || '').trim()),
    secret_header: LIVE_SECRET_HEADER,
  };
}

function runtimeConfig(env = process.env) {
  const config = loadConfig(env);
  return {
    ...config,
    history_path: config.history_path || defaultHistoryPath(),
  };
}

function emptyHistory(startedAt = nowIso()) {
  return {
    history_mode: FRESH_HISTORY_MODE,
    history_started_at: startedAt,
    history_complete: false,
    history_backfilled: false,
    deep_history_status: 'requires_ship_state_history',
    requires_ship_for_deep_history: true,
    trades: [],
  };
}

function normalizePersistedTrade(trade) {
  if (!trade || typeof trade !== 'object') return null;
  const tradeId = safeString(trade.trade_id);
  const token = tokenKey(trade.contract, trade.symbol);
  const tradedAt = normalizeTradeTimestamp(trade.traded_at);
  if (!tradeId || !token || !tradedAt) return null;
  return {
    trade_id: tradeId,
    source: safeString(trade.source),
    stream_source: safeString(trade.stream_source),
    og_source: safeString(trade.og_source),
    pair_id: safeString(trade.pair_id),
    contract: normalizeContract(trade.contract),
    symbol: normalizeSymbol(trade.symbol),
    quote_contract: normalizeContract(trade.quote_contract),
    quote_symbol: normalizeSymbol(trade.quote_symbol),
    price: safeDecimal(trade.price),
    volume: safeDecimal(trade.volume),
    side: safeString(trade.side),
    traded_at: tradedAt,
    observed_at: normalizeTradeTimestamp(trade.observed_at) || nowIso(),
    uses_fake_live_data: false,
  };
}

function loadObservedHistory(historyPath) {
  if (!historyPath) return emptyHistory();
  try {
    const raw = fs.readFileSync(historyPath, 'utf8');
    const parsed = JSON.parse(raw);
    const startedAt = normalizeTradeTimestamp(parsed?.history_started_at) || nowIso();
    const trades = Array.isArray(parsed?.trades)
      ? parsed.trades.map(normalizePersistedTrade).filter(Boolean).slice(-MAX_PERSISTED_TRADE_HISTORY)
      : [];
    return {
      ...emptyHistory(startedAt),
      trades,
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      return {
        ...emptyHistory(),
        last_error: `history load failed: ${error?.message || 'unknown error'}`,
      };
    }
    return emptyHistory();
  }
}

function saveObservedHistory(state) {
  const historyPath = state?.config?.history_path;
  if (!historyPath) return;
  const payload = {
    history_mode: FRESH_HISTORY_MODE,
    history_started_at: state.history.history_started_at,
    history_complete: false,
    history_backfilled: false,
    deep_history_status: 'requires_ship_state_history',
    requires_ship_for_deep_history: true,
    trades: state.history.trades.slice(-MAX_PERSISTED_TRADE_HISTORY),
  };
  const tmpPath = `${historyPath}.tmp`;
  try {
    fs.mkdirSync(dirname(historyPath), { recursive: true });
    fs.writeFileSync(tmpPath, `${JSON.stringify(payload)}\n`);
    fs.renameSync(tmpPath, historyPath);
    state.history.last_error = null;
  } catch (error) {
    state.history.last_error = `history save failed: ${error?.message || 'unknown error'}`;
    state.last_error = state.history.last_error;
  }
}

function historyElapsedMs(state) {
  const started = Date.parse(state?.history?.history_started_at || '');
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Date.now() - started);
}

function rollingCompleteness(state) {
  const elapsed = historyElapsedMs(state);
  return {
    volume_24h_complete: elapsed >= 24 * 60 * 60 * 1000,
    volume_7d_complete: elapsed >= 7 * 24 * 60 * 60 * 1000,
    volume_30d_complete: elapsed >= 30 * 24 * 60 * 60 * 1000,
  };
}

function percentChange(startPrice, endPrice) {
  const start = asNumber(startPrice);
  const end = asNumber(endPrice);
  if (start == null || end == null || start <= 0) return null;
  return ((end - start) / start) * 100;
}

function buildRollingHistory(state) {
  const nowMs = Date.now();
  const windows = {
    volume_1h: 60 * 60 * 1000,
    volume_24h: 24 * 60 * 60 * 1000,
    volume_7d: 7 * 24 * 60 * 60 * 1000,
    volume_30d: 30 * 24 * 60 * 60 * 1000,
  };
  const byToken = new Map();
  const candles = new Map();
  const sortedTrades = state.history.trades.slice().sort((a, b) =>
    Date.parse(a.traded_at || '') - Date.parse(b.traded_at || ''));
  for (const trade of sortedTrades) {
    const tradedMs = Date.parse(trade.traded_at);
    if (!Number.isFinite(tradedMs)) continue;
    const key = tokenKey(trade.contract, trade.symbol);
    if (!key) continue;
    const metric = byToken.get(key) || {
      token_key: key,
      contract: trade.contract,
      symbol: trade.symbol,
      trade_count: 0,
      latest_price: null,
      latest_trade_at: null,
      volume_1h: 0,
      volume_24h: 0,
      volume_7d: 0,
      volume_30d: 0,
      window_start_prices: {},
    };
    metric.trade_count += 1;
    const price = asNumber(trade.price);
    if (price != null) {
      metric.latest_price = price;
      metric.latest_trade_at = trade.traded_at;
      for (const [field, millis] of Object.entries(windows)) {
        if (nowMs - tradedMs <= millis && metric.window_start_prices[field] == null) {
          metric.window_start_prices[field] = price;
        }
      }
    }
    const volume = asNumber(trade.volume) || 0;
    for (const [field, millis] of Object.entries(windows)) {
      if (nowMs - tradedMs <= millis) metric[field] += volume;
    }
    byToken.set(key, metric);
    if (price == null) continue;
    const day = trade.traded_at.slice(0, 10);
    const candleKey = `${trade.source || ''}::${trade.pair_id || ''}::${day}`;
    const candle = candles.get(candleKey) || {
      source: trade.source,
      pair_id: trade.pair_id,
      interval: '1D',
      day,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
      trade_count: 0,
    };
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;
    candle.volume += volume;
    candle.trade_count += 1;
    candles.set(candleKey, candle);
  }
  const completeness = rollingCompleteness(state);
  for (const metric of byToken.values()) {
    metric.change_1h = percentChange(metric.window_start_prices.volume_1h, metric.latest_price);
    metric.change_24h = percentChange(metric.window_start_prices.volume_24h, metric.latest_price);
    delete metric.window_start_prices;
  }
  return {
    token_metrics: byToken,
    candles,
    completeness,
  };
}

function refreshRollingHistory(state) {
  const rolling = buildRollingHistory(state);
  state.rollingHistory = rolling;
  for (const metric of rolling.token_metrics.values()) {
    const existing = state.tokenCache.get(metric.token_key);
    if (!existing) continue;
    state.tokenCache.set(metric.token_key, {
      ...existing,
      fresh_history_trade_count: metric.trade_count,
      fresh_history_latest_price: metric.latest_price == null ? null : safeDecimal(metric.latest_price),
      fresh_history_latest_trade_at: metric.latest_trade_at || null,
      fresh_history_volume_1h: metric.volume_1h ? safeDecimal(metric.volume_1h) : null,
      fresh_history_volume_24h: metric.volume_24h ? safeDecimal(metric.volume_24h) : null,
      fresh_history_volume_7d: metric.volume_7d ? safeDecimal(metric.volume_7d) : null,
      fresh_history_volume_30d: metric.volume_30d ? safeDecimal(metric.volume_30d) : null,
      fresh_history_change_1h: metric.change_1h == null ? null : safeDecimal(metric.change_1h),
      fresh_history_change_24h: metric.change_24h == null ? null : safeDecimal(metric.change_24h),
      fresh_history_volume_24h_complete: rolling.completeness.volume_24h_complete,
      fresh_history_volume_7d_complete: rolling.completeness.volume_7d_complete,
      fresh_history_volume_30d_complete: rolling.completeness.volume_30d_complete,
    });
  }
}

function historyPayload(state) {
  const rolling = state.rollingHistory || buildRollingHistory(state);
  return {
    history_mode: FRESH_HISTORY_MODE,
    history_started_at: state.history.history_started_at,
    history_complete: false,
    history_backfilled: false,
    deep_history_status: 'requires_ship_state_history',
    requires_ship_for_deep_history: true,
    persisted_trade_count: state.history.trades.length,
    rolling_1d_candle_count: rolling.candles.size,
    rolling_token_count: rolling.token_metrics.size,
    volume_24h_complete: rolling.completeness.volume_24h_complete,
    volume_7d_complete: rolling.completeness.volume_7d_complete,
    volume_30d_complete: rolling.completeness.volume_30d_complete,
    persistence_enabled: Boolean(state.config.history_path),
  };
}

export function createState(config = loadConfig()) {
  const state = {
    started_at: nowIso(),
    connected: false,
    status: 'not_connected',
    config,
    tokenCache: new Map(),
    streamState: new Map(VERIFIED_TRADE_STREAMS.map((stream) => [streamKey(stream), {
      account: stream.account,
      action: stream.action,
      source: stream.source,
      status: 'not_connected',
      event_count: 0,
      last_event_at: null,
      last_error: null,
    }])),
    seenTradeIds: [],
    seenTradeIdSet: new Set(),
    clients: new Set(),
    history: loadObservedHistory(config.history_path),
    rollingHistory: null,
    event_count: 0,
    last_event_at: null,
    stream_source: null,
    poll_timer: null,
    polling: false,
    last_error: config.hyperion_api || config.state_history_endpoint || config.waxnode_endpoint
      ? 'no verified trade events observed yet'
      : 'WAXONEDGE_HYPERION_API, WAXONEDGE_STATE_HISTORY_ENDPOINT, or WAXNODE_ENDPOINT required',
  };
  for (const trade of state.history.trades) {
    if (rememberTradeId(state, trade.trade_id)) {
      observeLiveTrade(state, trade, { persist: false, broadcast: false, refresh: false });
    }
  }
  refreshRollingHistory(state);
  return state;
}

function uptimeSeconds(state) {
  const started = Date.parse(state.started_at);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

function streamStatus(state) {
  return Object.fromEntries(VERIFIED_TRADE_STREAMS.map((stream) => {
    const key = streamKey(stream);
    const current = state.streamState.get(key) || {};
    return [key, {
      account: stream.account,
      action: stream.action,
      source: stream.source,
      og_source: stream.og_source,
      status: current.status || (state.connected ? 'connected' : 'not_connected'),
      verified: true,
      event_count: current.event_count || 0,
      last_event_at: current.last_event_at || null,
      last_error: current.last_error || null,
    }];
  }));
}

export function healthPayload(state = createState()) {
  return {
    ok: state.connected === true,
    service: 'waxonedge-live-indexer',
    status: state.connected ? 'connected' : 'not_connected',
    generated_at: nowIso(),
    uptime_seconds: uptimeSeconds(state),
    connected: state.connected === true,
    last_event_at: state.last_event_at || null,
    stream_source: state.stream_source || null,
    event_count: state.event_count || 0,
    config: {
      hyperion_configured: Boolean(state.config.hyperion_api),
      state_history_configured: Boolean(state.config.state_history_endpoint),
      waxnode_configured: Boolean(state.config.waxnode_endpoint),
      stream_enabled: state.config.stream_enabled === true,
      shared_secret_configured: state.config.shared_secret_configured === true,
      secret_header: state.config.secret_header,
    },
    source_status: streamStatus(state),
    history: historyPayload(state),
    verified_trade_streams: VERIFIED_TRADE_STREAMS.map((stream) => `${stream.account}::${stream.action}`),
    token_key_format: 'contract::symbol',
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
    last_error: state.connected ? null : state.last_error,
  };
}

export function snapshotPayload(state = createState()) {
  return {
    ok: state.connected === true,
    source: 'waxonedge-live-indexer',
    mode: 'snapshot',
    status: state.connected ? 'connected' : 'not_connected',
    generated_at: nowIso(),
    token_key_format: 'contract::symbol',
    next_cursor: state.last_event_at || null,
    history: historyPayload(state),
    tokens: Array.from(state.tokenCache.values())
      .sort((a, b) => String(a.token_key).localeCompare(String(b.token_key))),
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    warnings: state.connected ? [] : ['live indexer not connected'],
  };
}

export function writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function writeSseHeartbeat(res, state) {
  res.write(`event: heartbeat\n`);
  res.write(`data: ${JSON.stringify({
    ok: state.connected === true,
    status: state.connected ? 'connected' : 'not_connected',
    generated_at: nowIso(),
    last_event_at: state.last_event_at || null,
    event_count: state.event_count || 0,
    uses_fake_live_data: false,
    token_update_events_enabled: state.config.stream_enabled === true,
  })}\n\n`);
}

function writeSseStream(res, state) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  writeSseHeartbeat(res, state);
  const client = { res };
  state.clients.add(client);
  let heartbeat = null;
  const scheduleHeartbeat = () => {
    heartbeat = setTimeout(() => {
      try {
        writeSseHeartbeat(res, state);
        scheduleHeartbeat();
      } catch (_) {
        if (heartbeat) clearTimeout(heartbeat);
        state.clients.delete(client);
      }
    }, 15000);
  };
  scheduleHeartbeat();
  res.on('close', () => {
    if (heartbeat) clearTimeout(heartbeat);
    state.clients.delete(client);
  });
}

function writeSseTokenUpdate(res, update) {
  res.write(`event: token_update\n`);
  res.write(`data: ${JSON.stringify(update)}\n\n`);
}

function sendTokenUpdate(state, update) {
  if (state.config.stream_enabled !== true) return;
  for (const client of state.clients) {
    try {
      writeSseTokenUpdate(client.res, update);
    } catch (_) {
      state.clients.delete(client);
    }
  }
}

export function tradeIdFromRow(row, stream, parsed = {}) {
  const account = safeString(stream?.account || parsed.account);
  const action = safeString(stream?.action || parsed.action_name || actionName(row));
  const source = safeString(stream?.source || parsed.source);
  if (!account || !action || !source) return '';
  const streamIdentity = `${account}::${action}`;
  const idParts = [
    ['trade', parsed.trade_id],
    ['id', parsed.id],
    ['seq', firstPresent(row?.global_sequence, row?.global_sequence_num, row?.receipt?.global_sequence, row?.action_trace?.receipt?.global_sequence)],
    ['trx', firstPresent(row?.transaction_id, row?.trx_id, row?.action_trace?.trx_id)],
    ['ordinal', firstPresent(row?.action_ordinal, row?.receipt?.recv_sequence, row?.action_trace?.receipt?.recv_sequence)],
    ['block', firstPresent(row?.block_num, row?.block, row?.block_number)],
  ]
    .map(([label, value]) => {
      const text = safeString(value);
      return text ? `${label}:${text}` : '';
    })
    .filter(Boolean);
  if (!idParts.length) return '';
  return [streamIdentity, source && `source:${source}`, action && `action:${action}`, ...idParts]
    .filter(Boolean)
    .join(':');
}

function rememberTradeId(state, tradeId) {
  if (state.seenTradeIdSet.has(tradeId)) return false;
  state.seenTradeIdSet.add(tradeId);
  state.seenTradeIds.push(tradeId);
  while (state.seenTradeIds.length > MAX_SEEN_TRADE_IDS) {
    const old = state.seenTradeIds.shift();
    state.seenTradeIdSet.delete(old);
  }
  return true;
}

function actionRecord(row) {
  const actionValue = typeof row?.action === 'object' ? row.action : null;
  const act = row?.act || row?.action_trace?.act || actionValue || row;
  const data = row?.data || act?.data || {};
  return data?.record || act?.data?.record || data || {};
}

function actionName(row) {
  const actionValue = typeof row?.action === 'string' ? row.action : null;
  const act = row?.act || row?.action_trace?.act || (typeof row?.action === 'object' ? row.action : null) || {};
  return safeString(actionValue || act?.name || row?.act_name || row?.action_name || row?.name).toLowerCase();
}

function parseAlcorMarketMatch(row, stream) {
  const name = actionName(row);
  if (name && name !== stream.action) return null;
  const record = actionRecord(row);
  const market = record.market || {};
  const marketId = firstPresent(record.market_id, market.id, row?.market_id);
  if (marketId == null || marketId === '') return null;
  const ask = parseAsset(firstPresent(record.ask, row?.ask));
  const bid = parseAsset(firstPresent(record.bid, row?.bid));
  const marketBase = market.base_token || {};
  const marketQuote = market.quote_token || {};
  const baseSymbol = normalizeSymbol(marketBase.sym ? String(marketBase.sym).split(',')[1] : firstPresent(record.market_code_base_token, ask.symbol));
  const baseContract = normalizeContract(firstPresent(marketBase.contract, record.market_contract_base_token, ask.contract));
  const quoteSymbol = normalizeSymbol(marketQuote.sym ? String(marketQuote.sym).split(',')[1] : firstPresent(record.market_code_quote_token, bid.symbol));
  const quoteContract = normalizeContract(firstPresent(marketQuote.contract, record.market_contract_quote_token, bid.contract));
  const symbol = baseSymbol || ask.symbol || bid.symbol;
  const contract = baseContract || ask.contract || quoteContract || bid.contract;
  if (!symbol || !contract) return null;
  const unitPrice = asNumber(firstPresent(record.unit_price, row?.unit_price));
  const price = unitPrice != null ? unitPrice / 100000000 : null;
  const tradedAt = normalizeTradeTimestamp(firstPresent(row?.timestamp, row?.['@timestamp'], row?.block_time, row?.created_at, record.timestamp));
  if (!tradedAt) return null;
  const stableId = tradeIdFromRow(row, stream, record);
  if (!stableId) return null;
  return {
    trade_id: `${stableId}:market:${marketId}`,
    source: stream.source,
    og_source: stream.og_source,
    stream_source: streamKey(stream),
    pair_id: safeString(marketId),
    contract,
    symbol,
    quote_contract: quoteContract || null,
    quote_symbol: quoteSymbol || null,
    price,
    volume: safeDecimal(firstPresent(ask.amount, bid.amount)),
    side: stream.action === 'sellmatch' ? 'sell' : 'buy',
    traded_at: tradedAt,
    raw_event: row,
  };
}

function canonicalAmmActionPairId(source, record = {}, row = {}) {
  if (source === 'swap.alcor') return safeString(firstPresent(record.poolId, record.pool_id, row.poolId, row.pool_id, record.id, record.pair_id, row.pair_id));
  if (source === 'swap.taco') return safeString(firstPresent(record.id, row.id, record.pair_id, row.pair_id, record.pairId, row.pairId));
  if (source === 'swap.box') return safeString(firstPresent(record.pair_id, row.pair_id, record.pairId, row.pairId, record.id, row.id));
  if (source === 'swap.nefty') return safeString(firstPresent(record.code, row.code, record.pair_id, row.pair_id, record.pairId, row.pairId, record.id, row.id));
  return safeString(firstPresent(record.id, record.pair_id, record.pairId, record.code, row?.pair_id, row?.pairId, row?.id, row?.code));
}

function parseAmmSwap(row, stream) {
  const name = actionName(row);
  if (name && name !== stream.action) return null;
  const record = actionRecord(row);
  const pairId = canonicalAmmActionPairId(stream.source, record, row);
  if (!pairId) return null;
  let quantityIn = firstPresent(record.quantity_in, row?.quantity_in);
  let quantityOut = firstPresent(record.quantity_out, row?.quantity_out);
  if (stream.parser === 'swap-v3') {
    quantityIn = firstPresent(record.tokenA, row?.tokenA, quantityIn);
    quantityOut = firstPresent(record.tokenB, row?.tokenB, quantityOut);
  }
  const parsedIn = parseAsset(quantityIn);
  const parsedOut = parseAsset(quantityOut);
  if (parsedIn.amount == null || parsedOut.amount == null || !parsedIn.symbol || !parsedOut.symbol) return null;
  const contract = parsedIn.contract || parsedOut.contract || normalizeContract(firstPresent(record.contract, record.token_contract, row?.contract));
  if (!contract) return null;
  const price = parsedIn.amount > 0 && parsedOut.amount > 0
    ? (parsedOut.amount / parsedIn.amount)
    : null;
  const tradedAt = normalizeTradeTimestamp(firstPresent(row?.timestamp, row?.['@timestamp'], row?.block_time, row?.created_at, record.timestamp));
  if (!tradedAt) return null;
  const stableId = tradeIdFromRow(row, stream, record);
  if (!stableId) return null;
  return {
    trade_id: `${stableId}:pair:${pairId}`,
    source: stream.source,
    og_source: stream.og_source,
    stream_source: streamKey(stream),
    pair_id: pairId,
    contract,
    symbol: parsedIn.symbol,
    quote_contract: parsedOut.contract || null,
    quote_symbol: parsedOut.symbol || null,
    price,
    volume: safeDecimal(parsedIn.symbol === 'WAX' ? parsedIn.amount : (parsedOut.symbol === 'WAX' ? parsedOut.amount : parsedIn.amount)),
    side: 'swap',
    traded_at: tradedAt,
    raw_event: row,
  };
}

export function normalizeLiveTradeRow(row, stream) {
  if (!row || !stream) return null;
  return stream.source === 'alcor'
    ? parseAlcorMarketMatch(row, stream)
    : parseAmmSwap(row, stream);
}

function tokenUpdateFromTrade(trade) {
  const key = tokenKey(trade.contract, trade.symbol);
  if (!key) return null;
  return {
    token_key: key,
    contract: normalizeContract(trade.contract),
    symbol: normalizeSymbol(trade.symbol),
    updated_at: trade.traded_at,
    source: trade.source,
    og_source: trade.og_source,
    source_keys: trade.source,
    pair_id: trade.pair_id,
    stream_source: trade.stream_source,
    last_trade_at: trade.traded_at,
    last_trade_price: trade.price,
    last_trade_volume: trade.volume,
    price_wax: trade.quote_symbol === 'WAX' ? trade.price : null,
    uses_fake_live_data: false,
  };
}

export function observeLiveTrade(state, trade, options = {}) {
  const persist = options.persist !== false;
  const broadcast = options.broadcast !== false;
  const refresh = options.refresh !== false;
  const update = tokenUpdateFromTrade(trade);
  if (!update) return null;
  const existing = state.tokenCache.get(update.token_key) || {};
  const existingSources = String(existing.source_keys || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const nextSources = Array.from(new Set([
    ...existingSources,
    update.source,
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  if (nextSources.length) {
    update.source_keys = nextSources.join(',');
  }
  if (state.tokenCache.has(update.token_key)) {
    state.tokenCache.delete(update.token_key);
  }
  state.tokenCache.set(update.token_key, {
    ...existing,
    ...update,
  });
  while (state.tokenCache.size > MAX_TOKEN_CACHE_SIZE) {
    const oldestKey = state.tokenCache.keys().next().value;
    state.tokenCache.delete(oldestKey);
  }
  state.connected = true;
  state.status = 'connected';
  state.last_error = null;
  const currentGlobalTime = Date.parse(state.last_event_at || '');
  const tradeTime = Date.parse(trade.traded_at || '');
  if (!state.last_event_at || (Number.isFinite(tradeTime) && (!Number.isFinite(currentGlobalTime) || tradeTime > currentGlobalTime))) {
    state.last_event_at = trade.traded_at;
    state.stream_source = trade.stream_source;
  }
  state.event_count += 1;
  const current = state.streamState.get(trade.stream_source);
  if (current) {
    current.status = 'connected';
    current.event_count += 1;
    const currentStreamTime = Date.parse(current.last_event_at || '');
    if (!current.last_event_at || (Number.isFinite(tradeTime) && (!Number.isFinite(currentStreamTime) || tradeTime > currentStreamTime))) {
      current.last_event_at = trade.traded_at;
    }
    current.last_error = null;
  }
  if (persist) {
    const persisted = normalizePersistedTrade({
      ...trade,
      observed_at: nowIso(),
    });
    if (persisted) {
      state.history.trades.push(persisted);
      state.history.trades = state.history.trades.slice(-MAX_PERSISTED_TRADE_HISTORY);
      saveObservedHistory(state);
    }
  }
  if (refresh) refreshRollingHistory(state);
  if (broadcast) sendTokenUpdate(state, state.tokenCache.get(update.token_key));
  return update;
}

export async function ingestVerifiedTradeStreams(state, fetchImpl = globalThis.fetch) {
  if (!hyperionHistoryActionsEndpoint(state.config)) {
    state.connected = false;
    state.status = 'not_connected';
    state.last_error = 'WAXONEDGE_HYPERION_API, WAXONEDGE_STATE_HISTORY_ENDPOINT, or WAXNODE_ENDPOINT required';
    return { observed: 0, error: state.last_error };
  }
  let observed = 0;
  for (const stream of VERIFIED_TRADE_STREAMS) {
    const key = streamKey(stream);
    const current = state.streamState.get(key);
    const url = historyStreamUrl(state.config, stream, state.config.fetch_limit);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        redirect: 'manual',
      });
      if (!response.ok) {
        if (current) {
          current.status = current.event_count > 0 ? 'connected' : 'not_connected';
          current.last_error = `Hyperion ${response.status}`;
        }
        continue;
      }
      const payload = await response.json();
      const rows = sourceRows(payload);
      for (const row of rows.reverse()) {
        const trade = normalizeLiveTradeRow(row, stream);
        if (!trade || !rememberTradeId(state, trade.trade_id)) continue;
        observeLiveTrade(state, trade);
        observed += 1;
      }
      if (current && current.event_count === 0) {
        current.status = 'not_connected';
        current.last_error = null;
      }
    } catch (error) {
      if (current) {
        current.status = current.event_count > 0 ? 'connected' : 'not_connected';
        current.last_error = error?.message || 'fetch failed';
      }
    }
  }
  if (observed > 0) return { observed, error: null };
  if (!state.connected) {
    const streamError = Array.from(state.streamState.values())
      .map((item) => item?.last_error)
      .find(Boolean);
    state.status = 'not_connected';
    state.last_error = streamError || 'no verified trade events observed yet';
  }
  return { observed, error: state.last_error };
}

function scheduleLiveIngestion(state) {
  if (state.poll_timer) clearTimeout(state.poll_timer);
  state.poll_timer = setTimeout(async () => {
    if (!state.polling) {
      state.polling = true;
      try {
        await ingestVerifiedTradeStreams(state);
      } finally {
        state.polling = false;
      }
    }
    scheduleLiveIngestion(state);
  }, state.config.poll_ms);
}

export function startLiveIngestion(state) {
  if (!hyperionHistoryActionsEndpoint(state.config)) return false;
  ingestVerifiedTradeStreams(state).catch((error) => {
    state.last_error = error?.message || 'live ingestion failed';
  });
  scheduleLiveIngestion(state);
  return true;
}

export function safeRequestPathname(requestUrl) {
  const raw = String(requestUrl || '/');
  if (!raw || raw.length > 2048 || /[\r\n]/.test(raw)) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) return null;
  if (!raw.startsWith('/')) return null;
  const path = raw.split('?')[0].split('#')[0] || '/';
  try {
    return decodeURI(path);
  } catch (_) {
    return null;
  }
}

export function createServer(state = createState()) {
  return http.createServer((req, res) => {
    const pathname = safeRequestPathname(req.url);
    if (!pathname) {
      writeJson(res, 400, { ok: false, error: 'malformed request target', uses_fake_live_data: false });
      return;
    }
    if (req.method !== 'GET') {
      writeJson(res, 405, { ok: false, error: 'method not allowed', uses_fake_live_data: false });
      return;
    }
    if (pathname === '/health') {
      writeJson(res, state.connected ? 200 : 503, healthPayload(state));
      return;
    }
    if (pathname === '/snapshot') {
      writeJson(res, state.connected ? 200 : 503, snapshotPayload(state));
      return;
    }
    if (pathname === '/history') {
      writeJson(res, 200, {
        ok: true,
        service: 'waxonedge-live-indexer',
        generated_at: nowIso(),
        history: historyPayload(state),
        uses_fake_live_data: false,
        browser_hyperion_fetch: false,
      });
      return;
    }
    if (pathname === '/stream') {
      writeSseStream(res, state);
      return;
    }
    writeJson(res, 404, { ok: false, error: 'not found', uses_fake_live_data: false });
  });
}

export function startServer(env = process.env) {
  const state = createState(runtimeConfig(env));
  const server = createServer(state);
  startLiveIngestion(state);
  server.listen(state.config.port, state.config.bind_host, () => {
    console.log(JSON.stringify({
      service: 'waxonedge-live-indexer',
      status: state.status,
      port: state.config.port,
      bind_host: state.config.bind_host,
      uses_fake_live_data: false,
    }));
  });
  return { server, state };
}

export function isDirectRun(metaUrl = import.meta.url, argv1 = process.argv[1], cwd = process.cwd()) {
  if (!argv1) return false;
  return fileURLToPath(metaUrl) === resolve(cwd, argv1);
}

if (isDirectRun()) {
  startServer();
}

import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const LIVE_SECRET_HEADER = 'x-waxonedge-live-secret';

export const VERIFIED_TRADE_STREAMS = Object.freeze([
  { account: 'alcordexmain', action: 'buymatch', source: 'alcor' },
  { account: 'alcordexmain', action: 'sellmatch', source: 'alcor' },
  { account: 'swap.alcor', action: 'logswap', source: 'swap.alcor' },
  { account: 'swap.taco', action: 'exchangelog', source: 'swap.taco' },
  { account: 'swap.box', action: 'swaplog', source: 'swap.box' },
  { account: 'swap.nefty', action: 'logswap', source: 'swap.nefty' },
]);

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

export function loadConfig(env = process.env) {
  return {
    port: parsePort(env.WAXONEDGE_LIVE_PORT),
    bind_host: normalizeBindHost(env.WAXONEDGE_LIVE_BIND_HOST),
    hyperion_api: sanitizedHttpUrl(env.WAXONEDGE_HYPERION_API),
    state_history_endpoint: sanitizedHttpUrl(env.WAXONEDGE_STATE_HISTORY_ENDPOINT),
    stream_enabled: booleanEnv(env.WAXONEDGE_LIVE_ENABLE_STREAM, false),
    shared_secret_configured: Boolean(String(env.WAXONEDGE_LIVE_SHARED_SECRET || '').trim()),
    secret_header: LIVE_SECRET_HEADER,
  };
}

export function createState(config = loadConfig()) {
  return {
    started_at: nowIso(),
    connected: false,
    status: 'not_connected',
    config,
    tokenCache: new Map(),
    last_error: config.hyperion_api || config.state_history_endpoint
      ? 'live stream connector not implemented yet'
      : 'WAXONEDGE_HYPERION_API or WAXONEDGE_STATE_HISTORY_ENDPOINT required',
  };
}

function uptimeSeconds(state) {
  const started = Date.parse(state.started_at);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

function streamStatus(state) {
  return Object.fromEntries(VERIFIED_TRADE_STREAMS.map((stream) => [
    `${stream.account}::${stream.action}`,
    {
      account: stream.account,
      action: stream.action,
      source: stream.source,
      status: state.connected ? 'connected' : 'not_connected',
      verified: true,
    },
  ]));
}

export function healthPayload(state = createState()) {
  return {
    ok: state.connected === true,
    service: 'waxonedge-live-indexer',
    status: state.connected ? 'connected' : 'not_connected',
    generated_at: nowIso(),
    uptime_seconds: uptimeSeconds(state),
    connected: state.connected === true,
    config: {
      hyperion_configured: Boolean(state.config.hyperion_api),
      state_history_configured: Boolean(state.config.state_history_endpoint),
      stream_enabled: state.config.stream_enabled === true,
      shared_secret_configured: state.config.shared_secret_configured === true,
      secret_header: state.config.secret_header,
    },
    source_status: streamStatus(state),
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
    next_cursor: null,
    tokens: Array.from(state.tokenCache.values()),
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
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(`event: heartbeat\n`);
  res.write(`data: ${JSON.stringify({
    ok: false,
    status: state.connected ? 'connected' : 'not_connected',
    generated_at: nowIso(),
    uses_fake_live_data: false,
    token_update_events_enabled: false,
  })}\n\n`);
  res.end();
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
    if (pathname === '/stream') {
      writeSseHeartbeat(res, state);
      return;
    }
    writeJson(res, 404, { ok: false, error: 'not found', uses_fake_live_data: false });
  });
}

export function startServer(env = process.env) {
  const state = createState(loadConfig(env));
  const server = createServer(state);
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}

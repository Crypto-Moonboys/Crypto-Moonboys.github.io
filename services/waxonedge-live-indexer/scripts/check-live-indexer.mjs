import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8789';

export function checkTargetHost(bindHost) {
  const host = String(bindHost || '').trim();
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') return '127.0.0.1';
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}

export function checkUrl(env = process.env) {
  const explicit = String(env.WAXONEDGE_LIVE_CHECK_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = checkTargetHost(env.WAXONEDGE_LIVE_BIND_HOST || '127.0.0.1');
  const port = String(env.WAXONEDGE_LIVE_PORT || '8789').trim() || '8789';
  return `http://${host}:${port}`;
}

function timeoutSignal(ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function fetchJson(baseUrl, path) {
  const { signal, done } = timeoutSignal();
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error(`${path} returned invalid JSON: ${error?.message || error}`);
    }
    return { response, data };
  } finally {
    done();
  }
}

export function assertNoFakeLiveData(payload, label = 'payload') {
  if (!payload || typeof payload !== 'object') throw new Error(`${label} is not an object`);
  if (payload.uses_fake_live_data !== false) throw new Error(`${label} must report uses_fake_live_data=false`);
  if (payload.browser_hyperion_fetch === true) throw new Error(`${label} must not use browser Hyperion fetching`);
  if (payload.emits_fake_token_updates === true) throw new Error(`${label} must not emit fake token updates`);
  if (Array.isArray(payload.tokens)) {
    const fakeToken = payload.tokens.find((token) =>
      token?.fake === true ||
      token?.uses_fake_live_data === true ||
      token?.synthetic === true ||
      token?.random === true
    );
    if (fakeToken) throw new Error(`${label} contains a fake token update`);
  }
}

function assertExpectedStatus(response, path) {
  if (![200, 503].includes(response.status)) {
    throw new Error(`${path} returned unexpected status ${response.status}`);
  }
}

export function validateHealthContract(response, payload) {
  assertExpectedStatus(response, '/health');
  assertNoFakeLiveData(payload, '/health');
  if (payload.service !== 'waxonedge-live-indexer') throw new Error('/health returned wrong service identity');
  if (payload.browser_hyperion_fetch !== false) throw new Error('/health must report browser_hyperion_fetch=false');
  if (payload.emits_fake_token_updates !== false) throw new Error('/health must report emits_fake_token_updates=false');
}

export function validateSnapshotContract(response, payload) {
  assertExpectedStatus(response, '/snapshot');
  assertNoFakeLiveData(payload, '/snapshot');
  if (payload.source !== 'waxonedge-live-indexer') throw new Error('/snapshot returned wrong source identity');
  if (payload.mode !== 'snapshot') throw new Error('/snapshot must report mode=snapshot');
  if (payload.token_key_format !== 'contract::symbol') throw new Error('/snapshot must report token_key_format=contract::symbol');
  if (payload.browser_hyperion_fetch !== false) throw new Error('/snapshot must report browser_hyperion_fetch=false');
}

async function checkStream(baseUrl) {
  const { signal, done } = timeoutSignal(4000);
  try {
    const response = await fetch(`${baseUrl}/stream`, {
      headers: { accept: 'text/event-stream' },
      signal,
    });
    assertExpectedStatus(response, '/stream');
    const contentType = response.headers.get('content-type') || '';
    if (response.status === 503) {
      return { ok: true, status: response.status, unavailable: true };
    }
    if (!contentType.includes('text/event-stream')) {
      throw new Error(`/stream returned unexpected content-type: ${contentType || 'missing'}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('/stream did not expose a readable body');
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    for (let chunks = 0; chunks < 8; chunks += 1) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value?.byteLength || 0;
      text += decoder.decode(chunk.value || new Uint8Array(), { stream: true });
      if (text.includes('event: token_update')) throw new Error('/stream emitted token_update before real live data is enabled');
      if (text.includes('"uses_fake_live_data":true')) throw new Error('/stream reported fake live data');
      if (text.includes('event: heartbeat')) {
        await reader.cancel().catch(() => {});
        return { ok: true, content_type: contentType, heartbeat: true };
      }
      if (bytes >= 8192) break;
    }
    text += decoder.decode();
    await reader.cancel().catch(() => {});
    if (text.includes('event: token_update')) throw new Error('/stream emitted token_update before real live data is enabled');
    if (text.includes('"uses_fake_live_data":true')) throw new Error('/stream reported fake live data');
    if (!text.includes('event: heartbeat')) throw new Error('/stream heartbeat event missing');
    return { ok: true, content_type: contentType, heartbeat: true };
  } finally {
    done();
  }
}

export async function runCheck(env = process.env) {
  const baseUrl = checkUrl(env) || DEFAULT_BASE_URL;
  const health = await fetchJson(baseUrl, '/health');
  validateHealthContract(health.response, health.data);
  const snapshot = await fetchJson(baseUrl, '/snapshot');
  validateSnapshotContract(snapshot.response, snapshot.data);
  const result = {
    ok: true,
    base_url: baseUrl,
    health_status: health.data.status || null,
    snapshot_status: snapshot.data.status || null,
    snapshot_token_count: Array.isArray(snapshot.data.tokens) ? snapshot.data.tokens.length : 0,
    uses_fake_live_data: false,
  };
  if (String(env.WAXONEDGE_LIVE_CHECK_STREAM || 'true').toLowerCase() !== 'false') {
    result.stream = await checkStream(baseUrl);
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCheck()
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        ok: false,
        error: error?.message || String(error),
        uses_fake_live_data: false,
      }));
      process.exitCode = 1;
    });
}

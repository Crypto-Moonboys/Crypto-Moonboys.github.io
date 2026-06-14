import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8789';

function checkUrl(env = process.env) {
  const explicit = String(env.WAXONEDGE_LIVE_CHECK_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = String(env.WAXONEDGE_LIVE_BIND_HOST || '127.0.0.1').trim() || '127.0.0.1';
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

async function checkStream(baseUrl) {
  const { signal, done } = timeoutSignal(4000);
  try {
    const response = await fetch(`${baseUrl}/stream`, {
      headers: { accept: 'text/event-stream' },
      signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      throw new Error(`/stream returned unexpected content-type: ${contentType || 'missing'}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('/stream did not expose a readable body');
    const chunk = await reader.read();
    await reader.cancel().catch(() => {});
    const text = new TextDecoder().decode(chunk.value || new Uint8Array());
    if (!text.includes('event: heartbeat')) throw new Error('/stream heartbeat event missing');
    if (text.includes('event: token_update')) throw new Error('/stream emitted token_update before real live data is enabled');
    if (text.includes('"uses_fake_live_data":true')) throw new Error('/stream reported fake live data');
    return { ok: true, content_type: contentType, heartbeat: true };
  } finally {
    done();
  }
}

export async function runCheck(env = process.env) {
  const baseUrl = checkUrl(env) || DEFAULT_BASE_URL;
  const health = await fetchJson(baseUrl, '/health');
  assertNoFakeLiveData(health.data, '/health');
  const snapshot = await fetchJson(baseUrl, '/snapshot');
  assertNoFakeLiveData(snapshot.data, '/snapshot');
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

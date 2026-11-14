// Diagnostic-only fixed-target outbound connectivity check.
// No bot token, Telegram chat ID, cookies or client-supplied URL is used.
// This endpoint cannot authenticate anyone or change membership decisions.
const PATH = '/telegram/connectivity';
const ORIGINS = new Set([
  'https://cryptomoonboys.com',
  'https://www.cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
]);
const TARGETS = Object.freeze([
  ['telegram_public', 'https://api.telegram.org/'],
  ['external_control', 'https://example.com/'],
]);

export async function probePublicEgress(fetchImpl = fetch, options = {}) {
  const timeoutMs = options.timeoutMs ?? 6500;
  const now = options.now ?? (() => Date.now());
  const results = {};
  for (const [name, target] of TARGETS) {
    const started = now();
    let outcome = 'network_error';
    let statusClass = null;
    try {
      const response = await fetchImpl(target, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      // HTTP 301/403/404 are successful *transport* evidence, not Bot API
      // authorization or Telegram service health.
      outcome = 'http_response';
      statusClass = Math.floor(Number(response.status) / 100) + 'xx';
      try { await response.body?.cancel(); } catch { /* no response data needed */ }
    } catch (error) {
      outcome = ['TimeoutError', 'AbortError'].includes(String(error?.name || ''))
        ? 'timeout' : 'network_error';
    }
    results[name] = {
      outcome,
      ...(statusClass ? { status_class: statusClass } : {}),
      duration_ms: Math.min(30000, Math.max(0, Math.round(now() - started))),
    };
  }
  return results;
}

export async function handleTelegramConnectivity(request, fetchImpl = fetch, options = {}) {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/$/, '') !== PATH) return null;
  const origin = String(request.headers.get('Origin') || '').trim();
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  });
  if (!ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ ok: false, error: 'website_origin_required' }),
      { status: 403, headers });
  }
  headers.set('Access-Control-Allow-Origin', origin);
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }),
      { status: 405, headers });
  }
  const results = await probePublicEgress(fetchImpl, options);
  return new Response(JSON.stringify({
    ok: true,
    diagnostic_only: true,
    membership_verified: false,
    targets: results,
  }), { status: 200, headers });
}

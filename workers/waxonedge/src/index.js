/*
 * WAXONEDGE Worker API scaffold.
 *
 * This is intentionally conservative: it defines the read-only endpoint contract
 * and no-fake-data response shape before live sync code is added.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function envelope({ ok, data = null, warnings = [], updatedAt = null, error = null }) {
  const payload = {
    ok,
    source: 'waxonedge-indexer',
    updated_at: updatedAt,
    data,
    warnings,
  };

  if (error) payload.error = error;
  return payload;
}

function unavailable(message = 'Requires indexed backend', status = 503) {
  return json(envelope({
    ok: false,
    warnings: [message],
  }), status);
}

function ok(data, warnings = [], updatedAt = null) {
  return json(envelope({
    ok: true,
    data,
    warnings,
    updatedAt,
  }));
}

function methodNotAllowed(method) {
  return json(envelope({
    ok: false,
    warnings: ['Method not allowed'],
    error: 'Method not allowed: ' + method,
  }), 405);
}

function notFound(path) {
  return json(envelope({
    ok: false,
    data: {
      supported_routes: [
        '/api/waxonedge/summary',
        '/api/waxonedge/tokens/top',
        '/api/waxonedge/pairs/top',
        '/api/waxonedge/sync-status',
      ],
    },
    warnings: ['Endpoint not found'],
    error: 'Not found: ' + path,
  }), 404);
}

function dbUnavailable(error, context) {
  const detail = error && error.message ? error.message : String(error || 'unknown D1 error');
  return unavailable(context + ': ' + detail, 503);
}

async function readSummary(env) {
  if (!env.WAXONEDGE_DB) return unavailable('WAXONEDGE_DB binding is not configured');

  try {
    const tokenCount = await env.WAXONEDGE_DB.prepare(
      'SELECT COUNT(*) AS count FROM waxonedge_tokens',
    ).first();
    const pairCount = await env.WAXONEDGE_DB.prepare(
      'SELECT COUNT(*) AS count FROM waxonedge_pairs',
    ).first();
    const latestSync = await env.WAXONEDGE_DB.prepare(
      'SELECT source, status, finished_at, error FROM waxonedge_sync_runs ORDER BY started_at DESC LIMIT 10',
    ).all();

    return ok({
      token_count: tokenCount ? tokenCount.count : 0,
      pair_count: pairCount ? pairCount.count : 0,
      latest_sync: latestSync && latestSync.results ? latestSync.results : [],
    });
  } catch (error) {
    return dbUnavailable(error, 'Summary unavailable until D1 schema is applied');
  }
}

async function readTopTokens(env) {
  if (!env.WAXONEDGE_DB) {
    return unavailable('WAXONEDGE_DB binding is not configured');
  }

  try {
    const rows = await env.WAXONEDGE_DB.prepare(
      `SELECT contract, symbol, decimals, total_supply, max_supply, price_wax, price_usd, updated_at
       FROM waxonedge_tokens
       ORDER BY updated_at DESC
       LIMIT 250`,
    ).all();

    return ok(rows && rows.results ? rows.results : []);
  } catch (error) {
    return dbUnavailable(error, 'Top tokens unavailable until D1 schema is applied');
  }
}

async function readTopPairs(env) {
  if (!env.WAXONEDGE_DB) return unavailable('WAXONEDGE_DB binding is not configured');

  try {
    const rows = await env.WAXONEDGE_DB.prepare(
      `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
              price, change_24h, volume_24h, liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
       FROM waxonedge_pairs
       ORDER BY COALESCE(volume_24h, 0) DESC
       LIMIT 250`,
    ).all();

    return ok(rows && rows.results ? rows.results : []);
  } catch (error) {
    return dbUnavailable(error, 'Top pairs unavailable until D1 schema is applied');
  }
}

async function readSyncStatus(env) {
  if (!env.WAXONEDGE_DB) return unavailable('WAXONEDGE_DB binding is not configured');

  try {
    const rows = await env.WAXONEDGE_DB.prepare(
      `SELECT source, status, started_at, finished_at, error
       FROM waxonedge_sync_runs
       ORDER BY started_at DESC
       LIMIT 50`,
    ).all();

    return ok(rows && rows.results ? rows.results : []);
  } catch (error) {
    return dbUnavailable(error, 'Sync status unavailable until D1 schema is applied');
  }
}

function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method !== 'GET') {
    return methodNotAllowed(request.method);
  }

  if (path === '/api/waxonedge/summary') return readSummary(env);
  if (path === '/api/waxonedge/tokens/top') return readTopTokens(env);
  if (path === '/api/waxonedge/pairs/top') return readTopPairs(env);
  if (path === '/api/waxonedge/sync-status') return readSyncStatus(env);

  if (path.startsWith('/api/waxonedge/token/')) {
    return unavailable('Token detail endpoint requires indexed backend implementation');
  }

  return notFound(path);
}

export default {
  fetch: route,
};

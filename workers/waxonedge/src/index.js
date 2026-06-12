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
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function unavailable(message = 'Requires indexed backend') {
  return json({
    ok: false,
    source: 'waxonedge-indexer',
    updated_at: null,
    data: null,
    warnings: [message],
  }, 503);
}

function ok(data, warnings = [], updatedAt = null) {
  return json({
    ok: true,
    source: 'waxonedge-indexer',
    updated_at: updatedAt,
    data,
    warnings,
  });
}

async function readSummary(env) {
  if (!env.WAXONEDGE_DB) return unavailable('WAXONEDGE_DB binding is not configured');

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
}

async function readTopTokens(env) {
  if (!env.WAXONEDGE_DB) return unavailable('WAXONEDGE_DB binding is not configured');

  const rows = await env.WAXONEDGE_DB.prepare(
    `SELECT contract, symbol, decimals, total_supply, max_supply, price_wax, price_usd, updated_at
     FROM waxonedge_tokens
     ORDER BY updated_at DESC
     LIMIT 250`,
  ).all();

  return ok(rows && rows.results ? rows.results : []);
}

async function readTopPairs(env) {
  if (!env.WAXONEDGE_DB) return unavailable('WAXONEDGE_DB binding is not configured');

  const rows = await env.WAXONEDGE_DB.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
     FROM waxonedge_pairs
     ORDER BY COALESCE(volume_24h, 0) DESC
     LIMIT 250`,
  ).all();

  return ok(rows && rows.results ? rows.results : []);
}

async function readSyncStatus(env) {
  if (!env.WAXONEDGE_DB) return unavailable('WAXONEDGE_DB binding is not configured');

  const rows = await env.WAXONEDGE_DB.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     ORDER BY started_at DESC
     LIMIT 50`,
  ).all();

  return ok(rows && rows.results ? rows.results : []);
}

function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  if (path === '/api/waxonedge/summary') return readSummary(env);
  if (path === '/api/waxonedge/tokens/top') return readTopTokens(env);
  if (path === '/api/waxonedge/pairs/top') return readTopPairs(env);
  if (path === '/api/waxonedge/sync-status') return readSyncStatus(env);

  if (path.startsWith('/api/waxonedge/token/')) {
    return unavailable('Token detail endpoint requires indexed backend implementation');
  }

  return json({
    ok: false,
    error: 'Not found',
    supported_routes: [
      '/api/waxonedge/summary',
      '/api/waxonedge/tokens/top',
      '/api/waxonedge/pairs/top',
      '/api/waxonedge/sync-status',
    ],
  }, 404);
}

export default {
  fetch: route,
  async scheduled(_event, env, ctx) {
    // Placeholder only. Real sync jobs must be added source by source after
    // endpoint/table behavior and rate limits are confirmed.
    if (!env.WAXONEDGE_DB) return;
    ctx.waitUntil(
      env.WAXONEDGE_DB.prepare(
        'INSERT INTO waxonedge_sync_runs (source, status, started_at, finished_at, error) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        'scheduler',
        'skipped',
        new Date().toISOString(),
        new Date().toISOString(),
        'Sync implementation pending confirmed source adapters',
      ).run(),
    );
  },
};

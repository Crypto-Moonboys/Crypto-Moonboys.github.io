const PUBLIC_ORIGINS = new Set([
  'https://cryptomoonboys.com',
  'https://www.cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
]);

const MAX_PAGE_SIZE = 100;
const MARKET_BATCH_SIZE = 80;
const MARKET_STALE_MINUTES = 15;
const EXCHANGE_STALE_HOURS = 12;
const SOURCE_FIELDS = ['website', 'docs', 'whitepaper', 'roadmap', 'github'];

function cors(request) {
  const origin = String(request.headers.get('Origin') || '').trim();
  return origin && PUBLIC_ORIGINS.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : { Vary: 'Origin' };
}

function json(request, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=60, stale-while-revalidate=300' : 'no-store',
      ...cors(request),
      ...extra,
    },
  });
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clean(value) {
  return String(value || '').trim();
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local')) return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    const m = host.match(/^172\.(\d+)\./);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
    return true;
  } catch {
    return false;
  }
}

function rowToNode(row) {
  return {
    id: row.id,
    name: row.name,
    token: { name: row.token_name || null, ticker: row.ticker },
    category: row.category,
    node_type: row.node_type,
    status: row.status,
    wiki_url: row.wiki_url,
    hardware: row.hardware || '',
    reward_type: row.reward_type || '',
    process: row.process || '',
    links: {
      website: row.website || null,
      whitepaper: row.whitepaper || null,
      roadmap: row.roadmap || null,
      docs: row.docs || null,
      github: row.github || null,
    },
    market: {
      price_usd: row.price_usd == null ? null : Number(row.price_usd),
      market_cap_usd: row.market_cap_usd == null ? null : Number(row.market_cap_usd),
      volume_24h_usd: row.volume_24h_usd == null ? null : Number(row.volume_24h_usd),
      liquidity_definition: '24h_volume_usd',
      main_exchange: row.main_exchange || null,
      main_pair: row.main_pair || null,
      source: row.market_source || null,
      updated_at: row.market_updated_at || null,
    },
    verification: {
      last_verified: row.last_verified || null,
    },
  };
}

const NODE_SELECT = `
  SELECT p.id, p.name, p.token_name, p.ticker, p.category, p.node_type,
         p.status, p.wiki_url, p.last_verified,
         t.hardware, t.reward_type, t.process,
         l.website, l.whitepaper, l.roadmap, l.docs, l.github,
         m.price_usd, m.market_cap_usd, m.volume_24h_usd,
         m.main_exchange, m.main_pair, m.source AS market_source,
         m.updated_at AS market_updated_at
  FROM node_projects p
  LEFT JOIN node_technical t ON t.project_id = p.id
  LEFT JOIN node_links l ON l.project_id = p.id
  LEFT JOIN node_market_data m ON m.project_id = p.id
`;

async function listNodes(request, env, url) {
  const q = clean(url.searchParams.get('q')).slice(0, 80);
  const category = clean(url.searchParams.get('category')).slice(0, 80);
  const status = clean(url.searchParams.get('status')).slice(0, 40);
  const hardware = clean(url.searchParams.get('hardware')).slice(0, 80);
  const reward = clean(url.searchParams.get('reward')).slice(0, 80);
  const limit = clampInt(url.searchParams.get('limit'), 50, 1, MAX_PAGE_SIZE);
  const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000);

  const where = [];
  const binds = [];
  if (q) {
    where.push('(p.name LIKE ? OR p.ticker LIKE ? OR p.id LIKE ? OR p.node_type LIKE ? OR t.process LIKE ?)');
    const term = `%${q}%`;
    binds.push(term, term, term, term, term);
  }
  if (category) { where.push('p.category = ?'); binds.push(category); }
  if (status) { where.push('p.status = ?'); binds.push(status); }
  if (hardware) { where.push('t.hardware LIKE ?'); binds.push(`%${hardware}%`); }
  if (reward) { where.push('t.reward_type LIKE ?'); binds.push(`%${reward}%`); }

  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const sql = `${NODE_SELECT}${clause} ORDER BY COALESCE(m.volume_24h_usd, -1) DESC, p.name ASC LIMIT ? OFFSET ?`;
  const result = await env.DB.prepare(sql).bind(...binds, limit, offset).all();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM node_projects p LEFT JOIN node_technical t ON t.project_id = p.id${clause}`)
    .bind(...binds).first();

  return json(request, {
    schema_version: '1.0.0',
    liquidity_definition: '24h_volume_usd',
    total: Number(count?.count || 0),
    limit,
    offset,
    nodes: (result.results || []).map(rowToNode),
  });
}

async function getNode(request, env, id) {
  const row = await env.DB.prepare(`${NODE_SELECT} WHERE p.id = ? LIMIT 1`).bind(id).first();
  if (!row) return json(request, { error: 'node_not_found' }, 404);
  const sourceChecks = await env.DB.prepare(`
    SELECT field, url, status_code, ok, checked_at, error
    FROM node_source_state WHERE project_id = ? ORDER BY field
  `).bind(id).all();
  const review = await env.DB.prepare(`
    SELECT reason, severity, details, detected_at
    FROM node_review_queue WHERE project_id = ? AND resolved_at IS NULL
    ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, detected_at DESC
  `).bind(id).all();
  return json(request, {
    schema_version: '1.0.0',
    node: rowToNode(row),
    source_checks: sourceChecks.results || [],
    open_review_items: review.results || [],
  });
}

async function getMeta(request, env) {
  const [projects, market, reviews, sources] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status IN ('needs_review','review_due','source_changed','unknown') THEN 1 ELSE 0 END) AS needs_review
      FROM node_projects`),
    env.DB.prepare(`SELECT COUNT(*) AS mapped,
      SUM(CASE WHEN updated_at >= datetime('now','-30 minutes') THEN 1 ELSE 0 END) AS fresh
      FROM node_market_data`),
    env.DB.prepare(`SELECT COUNT(*) AS open FROM node_review_queue WHERE resolved_at IS NULL`),
    env.DB.prepare(`SELECT COUNT(*) AS checked,
      SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failing
      FROM node_source_state`),
  ]);
  return json(request, {
    schema_version: '1.0.0',
    projects: projects.results?.[0] || {},
    market: market.results?.[0] || {},
    reviews: reviews.results?.[0] || {},
    sources: sources.results?.[0] || {},
    generated_at: new Date().toISOString(),
  });
}

export async function handleNodesRequest(request, env) {
  if (!env?.DB) return null;
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/nodes')) return null;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors(request),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (request.method !== 'GET') return json(request, { error: 'method_not_allowed' }, 405);
  if (url.pathname === '/api/nodes' || url.pathname === '/api/nodes/') return listNodes(request, env, url);
  if (url.pathname === '/api/nodes/meta' || url.pathname === '/api/nodes/verification') return getMeta(request, env);
  const id = decodeURIComponent(url.pathname.slice('/api/nodes/'.length)).trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return json(request, { error: 'invalid_node_id' }, 400);
  return getNode(request, env, id);
}

function coinGeckoHeaders(env) {
  const headers = { Accept: 'application/json', 'User-Agent': 'CryptoMoonboys-NodesWiki/1.0' };
  if (env?.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = env.COINGECKO_API_KEY;
  return headers;
}

async function refreshMarketBatch(env) {
  const stale = `-${MARKET_STALE_MINUTES} minutes`;
  const result = await env.DB.prepare(`
    SELECT p.id, p.market_provider_id
    FROM node_projects p
    LEFT JOIN node_market_data m ON m.project_id = p.id
    WHERE p.market_provider = 'coingecko'
      AND p.market_provider_id IS NOT NULL
      AND (m.updated_at IS NULL OR m.updated_at < datetime('now', ?))
    ORDER BY COALESCE(m.updated_at, '1970-01-01') ASC
    LIMIT ?
  `).bind(stale, MARKET_BATCH_SIZE).all();
  const rows = result.results || [];
  if (!rows.length) return;
  const ids = [...new Set(rows.map((row) => row.market_provider_id).filter(Boolean))];
  const endpoint = new URL('https://api.coingecko.com/api/v3/coins/markets');
  endpoint.searchParams.set('vs_currency', 'usd');
  endpoint.searchParams.set('ids', ids.join(','));
  endpoint.searchParams.set('per_page', String(Math.min(100, ids.length)));
  endpoint.searchParams.set('page', '1');
  endpoint.searchParams.set('sparkline', 'false');
  const response = await fetch(endpoint, { headers: coinGeckoHeaders(env) });
  if (!response.ok) throw new Error(`coingecko_markets_${response.status}`);
  const payload = await response.json();
  const byProvider = new Map(rows.map((row) => [row.market_provider_id, row.id]));
  const now = new Date().toISOString();
  const statements = [];
  for (const coin of Array.isArray(payload) ? payload : []) {
    const projectId = byProvider.get(coin.id);
    if (!projectId) continue;
    statements.push(env.DB.prepare(`
      INSERT INTO node_market_data(project_id, price_usd, market_cap_usd, volume_24h_usd, source, updated_at)
      VALUES (?, ?, ?, ?, 'coingecko', ?)
      ON CONFLICT(project_id) DO UPDATE SET
        price_usd = excluded.price_usd,
        market_cap_usd = excluded.market_cap_usd,
        volume_24h_usd = excluded.volume_24h_usd,
        source = excluded.source,
        updated_at = excluded.updated_at
    `).bind(projectId, coin.current_price ?? null, coin.market_cap ?? null, coin.total_volume ?? null, now));
  }
  if (statements.length) await env.DB.batch(statements);
}

async function refreshOneExchange(env) {
  const row = await env.DB.prepare(`
    SELECT p.id, p.market_provider_id
    FROM node_projects p
    LEFT JOIN node_market_data m ON m.project_id = p.id
    WHERE p.market_provider = 'coingecko' AND p.market_provider_id IS NOT NULL
      AND (m.main_exchange IS NULL OR m.updated_at < datetime('now', ?))
    ORDER BY COALESCE(m.updated_at, '1970-01-01') ASC LIMIT 1
  `).bind(`-${EXCHANGE_STALE_HOURS} hours`).first();
  if (!row) return;
  const endpoint = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(row.market_provider_id)}/tickers?include_exchange_logo=false&page=1&order=volume_desc&depth=false`;
  const response = await fetch(endpoint, { headers: coinGeckoHeaders(env) });
  if (!response.ok) return;
  const body = await response.json();
  const tickers = Array.isArray(body?.tickers) ? body.tickers : [];
  const candidates = tickers
    .filter((t) => !t.is_anomaly && !t.is_stale && t.market?.name && t.base && t.target)
    .sort((a, b) => Number(b.converted_volume?.usd || 0) - Number(a.converted_volume?.usd || 0));
  const best = candidates[0];
  if (!best) return;
  await env.DB.prepare(`
    INSERT INTO node_market_data(project_id, main_exchange, main_pair, source, updated_at)
    VALUES (?, ?, ?, 'coingecko', ?)
    ON CONFLICT(project_id) DO UPDATE SET
      main_exchange = excluded.main_exchange,
      main_pair = excluded.main_pair,
      source = excluded.source,
      updated_at = COALESCE(node_market_data.updated_at, excluded.updated_at)
  `).bind(row.id, best.market.name, `${best.base}/${best.target}`, new Date().toISOString()).run();
}

async function fingerprintResponse(response) {
  const contentLength = response.headers.get('content-length') || '';
  const etag = response.headers.get('etag') || '';
  const modified = response.headers.get('last-modified') || '';
  const material = `${response.url}|${response.status}|${contentLength}|${etag}|${modified}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function checkSourceUrl(env, projectId, field, value) {
  if (!value || !isPublicHttpsUrl(value)) return;
  const checkedAt = new Date().toISOString();
  let status = 0;
  let ok = 0;
  let error = null;
  let fingerprint = null;
  try {
    let response = await fetch(value, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'CryptoMoonboys-NodesWiki-SourceCheck/1.0' } });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(value, { method: 'GET', redirect: 'follow', headers: { Range: 'bytes=0-0', 'User-Agent': 'CryptoMoonboys-NodesWiki-SourceCheck/1.0' } });
    }
    status = response.status;
    ok = response.ok ? 1 : 0;
    fingerprint = await fingerprintResponse(response);
  } catch (err) {
    error = String(err?.message || err).slice(0, 300);
  }
  const previous = await env.DB.prepare(`SELECT ok, content_fingerprint FROM node_source_state WHERE project_id = ? AND field = ?`).bind(projectId, field).first();
  await env.DB.prepare(`
    INSERT INTO node_source_state(project_id, field, url, status_code, ok, content_fingerprint, checked_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, field) DO UPDATE SET
      url = excluded.url, status_code = excluded.status_code, ok = excluded.ok,
      content_fingerprint = excluded.content_fingerprint, checked_at = excluded.checked_at, error = excluded.error
  `).bind(projectId, field, value, status || null, ok, fingerprint, checkedAt, error).run();

  if (!ok) {
    await queueReview(env, projectId, `source_unreachable:${field}`, 'high', `${value} returned ${status || error || 'network error'}`);
  } else if (previous?.content_fingerprint && fingerprint && previous.content_fingerprint !== fingerprint) {
    await queueReview(env, projectId, `source_changed:${field}`, 'medium', `${field} response metadata changed; manual content review required`);
  }
}

async function queueReview(env, projectId, reason, severity, details) {
  await env.DB.prepare(`
    INSERT INTO node_review_queue(project_id, reason, severity, details, detected_at, resolved_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(project_id, reason) DO UPDATE SET
      severity = excluded.severity, details = excluded.details, detected_at = excluded.detected_at, resolved_at = NULL
  `).bind(projectId, reason, severity, details).run();
}

async function verifyOneProject(env) {
  const row = await env.DB.prepare(`
    SELECT p.id, l.website, l.docs, l.whitepaper, l.roadmap, l.github
    FROM node_projects p JOIN node_links l ON l.project_id = p.id
    LEFT JOIN node_source_state s ON s.project_id = p.id
    GROUP BY p.id
    ORDER BY COALESCE(MIN(s.checked_at), '1970-01-01') ASC, p.id ASC
    LIMIT 1
  `).first();
  if (!row) return;
  let checked = 0;
  for (const field of SOURCE_FIELDS) {
    if (!row[field]) continue;
    await checkSourceUrl(env, row.id, field, row[field]);
    checked += 1;
    if (checked >= 3) break;
  }
}

async function scheduleReviewDue(env) {
  const result = await env.DB.prepare(`
    SELECT id, last_verified FROM node_projects
    WHERE last_verified IS NULL OR date(last_verified) <= date('now','-90 days')
    ORDER BY COALESCE(last_verified, '1970-01-01') ASC LIMIT 100
  `).all();
  for (const row of result.results || []) {
    await queueReview(env, row.id, 'verification_due', 'medium', `Last verified: ${row.last_verified || 'never'}`);
  }
}

export function handleNodesScheduled(event, env, ctx) {
  if (!env?.DB) return;
  const jobs = [refreshMarketBatch(env), refreshOneExchange(env), verifyOneProject(env)];
  if (event?.cron === '0 9 * * *') jobs.push(scheduleReviewDue(env));
  ctx.waitUntil(Promise.allSettled(jobs).then((results) => {
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      console.log('[nodes-wiki]', JSON.stringify({ event: 'scheduled_partial_failure', failures: failures.map((f) => String(f.reason?.message || f.reason)) }));
    }
  }));
}

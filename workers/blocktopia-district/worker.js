/**
 * Block Topia: Street Signal 3008 — District Control Worker
 *
 * Manages persistent district ownership, NPC cross-season memory,
 * and seasonal / prophecy state for the Block Topia ecosystem.
 *
 * KV bindings (wrangler.toml):
 *   DISTRICTS   — persistent district control records
 *   NPC_MEMORY  — cross-season NPC memory blobs
 *   SEASONS     — seasonal state and prophecy data
 *   CACHE       — short-lived read cache
 *
 * Routes:
 *   GET  /health
 *   GET  /districts                           — list all districts
 *   GET  /district/:id                        — single district state
 *   POST /district/:id/claim                  — claim a district
 *   GET  /district/:id/npc-memory             — NPC memory for district
 *   PUT  /district/:id/npc-memory             — update NPC memory (admin)
 *   GET  /season/current                      — current season + prophecy
 *   PUT  /season/current                      — update season state (admin)
 *
 * Secrets:
 *   ADMIN_SECRET — required X-Admin-Secret header value for mutating admin routes
 */

const ALLOWED_METHODS = 'GET, POST, PUT, OPTIONS';

// ── CORS ─────────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  };
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonOk(data, origin) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function isAdmin(request, env) {
  const secret = request.headers.get('X-Admin-Secret')
    || new URL(request.url).searchParams.get('admin_secret');
  return secret && secret === env.ADMIN_SECRET;
}

async function cachedGet(env, cacheKey, ttl, fetchFn) {
  const cached = await env.CACHE.get(cacheKey, { type: 'json' });
  if (cached !== null) return cached;
  const fresh = await fetchFn();
  if (fresh !== null && fresh !== undefined) {
    await env.CACHE.put(cacheKey, JSON.stringify(fresh), { expirationTtl: ttl });
  }
  return fresh;
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleListDistricts(request, env, origin) {
  const ttl = Number(env.CACHE_TTL_SECONDS) || 60;
  const count = Number(env.DISTRICT_COUNT) || 12;

  const districts = await cachedGet(env, 'cache:districts:list', ttl, async () => {
    const results = [];
    for (let i = 1; i <= count; i++) {
      const id = String(i).padStart(2, '0');
      const data = await env.DISTRICTS.get(`district:${id}`, { type: 'json' });
      results.push(data || { id, controller: null, claimed_at: null, signal_strength: 0 });
    }
    return results;
  });

  return jsonOk({ districts }, origin);
}

async function handleGetDistrict(request, env, origin, id) {
  const ttl = Number(env.CACHE_TTL_SECONDS) || 60;
  const district = await cachedGet(env, `cache:district:${id}`, ttl, async () => {
    const data = await env.DISTRICTS.get(`district:${id}`, { type: 'json' });
    return data || { id, controller: null, claimed_at: null, signal_strength: 0 };
  });

  return jsonOk({ district }, origin);
}

async function handleClaimDistrict(request, env, origin, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400, origin);
  }

  const { player_id, player_name, signal_strength } = body;

  if (!player_id || typeof player_id !== 'string' || player_id.trim().length < 1) {
    return jsonError('player_id is required', 400, origin);
  }
  if (!player_name || typeof player_name !== 'string' || player_name.trim().length < 2 || player_name.trim().length > 30) {
    return jsonError('player_name must be 2–30 characters', 400, origin);
  }
  if (!Number.isFinite(signal_strength) || signal_strength < 0 || signal_strength > 9999) {
    return jsonError('signal_strength must be a non-negative number (max 9999)', 400, origin);
  }

  const kv_key = `district:${id}`;
  const existing = await env.DISTRICTS.get(kv_key, { type: 'json' });

  // Only allow claiming an unclaimed district or improving signal_strength
  if (existing && existing.controller && existing.signal_strength >= signal_strength) {
    return jsonError('District is already held with equal or higher signal strength', 409, origin);
  }

  const record = {
    id,
    controller:      player_id.trim(),
    controller_name: player_name.trim(),
    claimed_at:      new Date().toISOString(),
    signal_strength: Math.floor(signal_strength),
    prev_controller: existing ? (existing.controller || null) : null,
  };

  await env.DISTRICTS.put(kv_key, JSON.stringify(record));
  // Invalidate caches
  await Promise.all([
    env.CACHE.delete(`cache:district:${id}`),
    env.CACHE.delete('cache:districts:list'),
  ]);

  return jsonOk({ district: record }, origin);
}

async function handleGetNpcMemory(request, env, origin, id) {
  const memory = await env.NPC_MEMORY.get(`npc:${id}`, { type: 'json' });
  return jsonOk({ id, memory: memory || {} }, origin);
}

async function handlePutNpcMemory(request, env, origin, id) {
  if (!isAdmin(request, env)) {
    return jsonError('Forbidden', 403, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400, origin);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonError('Body must be a JSON object', 400, origin);
  }

  const record = {
    ...body,
    updated_at: new Date().toISOString(),
  };

  await env.NPC_MEMORY.put(`npc:${id}`, JSON.stringify(record));
  return jsonOk({ id, memory: record }, origin);
}

async function handleGetSeason(request, env, origin) {
  const ttl = Number(env.CACHE_TTL_SECONDS) || 60;
  const season = await cachedGet(env, 'cache:season:current', ttl, async () => {
    const data = await env.SEASONS.get('season:current', { type: 'json' });
    if (data) return data;
    // Bootstrap a default season record
    return {
      number:       1,
      started_at:   new Date().toISOString(),
      length_days:  Number(env.SEASON_LENGTH_DAYS) || 90,
      prophecy:     null,
      active:       true,
    };
  });

  return jsonOk({ season }, origin);
}

async function handlePutSeason(request, env, origin) {
  if (!isAdmin(request, env)) {
    return jsonError('Forbidden', 403, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400, origin);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonError('Body must be a JSON object', 400, origin);
  }

  const existing = await env.SEASONS.get('season:current', { type: 'json' }) || {};
  const record = {
    ...existing,
    ...body,
    updated_at: new Date().toISOString(),
  };

  await env.SEASONS.put('season:current', JSON.stringify(record));
  await env.CACHE.delete('cache:season:current');

  return jsonOk({ season: record }, origin);
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || 'https://crypto-moonboys.github.io';
    const url    = new URL(request.url);
    const path   = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // GET /health
      if (path === '/health' && request.method === 'GET') {
        return jsonOk({ status: 'ok', worker: 'blocktopia-district' }, origin);
      }

      // GET /districts
      if (path === '/districts' && request.method === 'GET') {
        return handleListDistricts(request, env, origin);
      }

      // GET /district/:id
      const districtMatch = path.match(/^\/district\/([^/]+)$/);
      if (districtMatch) {
        const id = districtMatch[1];
        if (request.method === 'GET') {
          return handleGetDistrict(request, env, origin, id);
        }
        if (request.method === 'POST') {
          return jsonError('Use POST /district/:id/claim to claim a district', 405, origin);
        }
      }

      // POST /district/:id/claim
      const claimMatch = path.match(/^\/district\/([^/]+)\/claim$/);
      if (claimMatch && request.method === 'POST') {
        return handleClaimDistrict(request, env, origin, claimMatch[1]);
      }

      // GET|PUT /district/:id/npc-memory
      const npcMatch = path.match(/^\/district\/([^/]+)\/npc-memory$/);
      if (npcMatch) {
        const id = npcMatch[1];
        if (request.method === 'GET') return handleGetNpcMemory(request, env, origin, id);
        if (request.method === 'PUT') return handlePutNpcMemory(request, env, origin, id);
      }

      // GET|PUT /season/current
      if (path === '/season/current') {
        if (request.method === 'GET') return handleGetSeason(request, env, origin);
        if (request.method === 'PUT') return handlePutSeason(request, env, origin);
      }

      return jsonError('Not Found', 404, origin);
    } catch (err) {
      return jsonError('Internal Server Error', 500, origin);
    }
  },
};

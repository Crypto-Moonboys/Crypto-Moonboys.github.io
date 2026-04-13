/**
 * Block Topia: Street Signal 3008 — Leaderboard Worker
 *
 * Manages per-season and all-time leaderboards for Block Topia SS3008,
 * including district-weighted scoring and seasonal resets.
 *
 * KV bindings (wrangler.toml):
 *   DISTRICTS — read district control records for bonus calculation
 *   SEASONS   — read/write season state
 *   CACHE     — short-lived read cache
 *
 * Routes:
 *   GET  /health
 *   GET  /leaderboard                    — current-season top scores
 *   GET  /leaderboard/all-time           — all-time top scores
 *   POST /leaderboard/score              — submit a score
 *   GET  /leaderboard/player/:player_id  — player summary across boards
 *   POST /leaderboard/reset              — force season reset (admin)
 *
 * Cron trigger: "0 0 * * *" — daily check for season rollover (wrangler.toml)
 *
 * Secrets:
 *   ADMIN_SECRET — required X-Admin-Secret header for admin routes
 */

const ALLOWED_METHODS = 'GET, POST, OPTIONS';

// ── Season constants ─────────────────────────────────────────────────────────
/** 2024-01-01T00:00:00.000Z — must stay in sync with other workers */
const SEASON_EPOCH_MS   = 1704067200000;

// ── CORS ─────────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  };
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

async function cachedGet(env, key, ttl, fetchFn) {
  const cached = await env.CACHE.get(key, { type: 'json' });
  if (cached !== null) return cached;
  const fresh = await fetchFn();
  if (fresh !== null && fresh !== undefined) {
    await env.CACHE.put(key, JSON.stringify(fresh), { expirationTtl: ttl });
  }
  return fresh;
}

/** Derive the current season number from the global epoch. */
function currentSeasonNumber(seasonLengthDays) {
  const lengthMs = seasonLengthDays * 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - SEASON_EPOCH_MS) / lengthMs) + 1;
}

/** Insert or update a player entry; keep at most `limit` records ranked by score. */
function upsertEntry(list, entry, limit) {
  const arr      = Array.isArray(list) ? list.slice() : [];
  const idLower  = entry.player_id.toLowerCase();
  const idx      = arr.findIndex((e) => e.player_id && e.player_id.toLowerCase() === idLower);

  if (idx !== -1) {
    if (entry.score > (Number(arr[idx].score) || 0)) {
      arr[idx] = { ...arr[idx], ...entry };
    }
  } else {
    arr.push(entry);
  }

  arr.sort((a, b) => {
    const diff = (Number(b.score) || 0) - (Number(a.score) || 0);
    return diff !== 0 ? diff : String(a.player_name).localeCompare(String(b.player_name));
  });

  return arr.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
}

// ── Season management ─────────────────────────────────────────────────────────

async function ensureSeasonReset(env) {
  const seasonLengthDays = Number(env.SEASON_LENGTH_DAYS) || 90;
  const seasonNum        = currentSeasonNumber(seasonLengthDays);
  const meta             = await env.SEASONS.get('leaderboard:season-meta', { type: 'json' }) || { season: 0 };

  if (meta.season >= seasonNum) return seasonNum;

  // Roll over: archive current season board and reset
  const current = await env.SEASONS.get('leaderboard:seasonal', { type: 'json' }) || [];
  if (current.length > 0) {
    const archiveKey = `leaderboard:season-archive:${meta.season}`;
    await env.SEASONS.put(archiveKey, JSON.stringify(current));
  }

  await Promise.all([
    env.SEASONS.put('leaderboard:seasonal', JSON.stringify([])),
    env.SEASONS.put('leaderboard:season-meta', JSON.stringify({
      season:      seasonNum,
      reset_at:    new Date().toISOString(),
      prev_season: meta.season,
    })),
  ]);

  // Invalidate caches
  await Promise.all([
    env.CACHE.delete('cache:leaderboard:seasonal'),
    env.CACHE.delete('cache:leaderboard:season-meta'),
  ]);

  return seasonNum;
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleGetLeaderboard(request, env, origin) {
  const url   = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), Number(env.BOARD_LIMIT) || 100);
  const ttl   = Number(env.CACHE_TTL_SECONDS) || 60;

  const season = await ensureSeasonReset(env);

  const payload = await cachedGet(env, `cache:leaderboard:seasonal:${limit}`, ttl, async () => {
    const board = await env.SEASONS.get('leaderboard:seasonal', { type: 'json' }) || [];
    return { season, board: board.slice(0, limit) };
  });

  return jsonOk(payload, origin);
}

async function handleGetAllTime(request, env, origin) {
  const url   = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), Number(env.BOARD_LIMIT) || 100);
  const ttl   = Number(env.CACHE_TTL_SECONDS) || 60;

  const payload = await cachedGet(env, `cache:leaderboard:alltime:${limit}`, ttl, async () => {
    const board = await env.SEASONS.get('leaderboard:all-time', { type: 'json' }) || [];
    return { board: board.slice(0, limit) };
  });

  return jsonOk(payload, origin);
}

async function handlePostScore(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400, origin);
  }

  const { player_id, player_name, score, level, district_id } = body;

  if (!player_id || typeof player_id !== 'string' || player_id.trim().length < 1) {
    return jsonError('player_id is required', 400, origin);
  }
  if (!player_name || typeof player_name !== 'string' || player_name.trim().length < 2 || player_name.trim().length > 30) {
    return jsonError('player_name must be 2–30 characters', 400, origin);
  }
  if (!Number.isFinite(score) || score < 0 || score > 1e9) {
    return jsonError('score must be a non-negative finite number (max 1,000,000,000)', 400, origin);
  }
  if (level !== undefined && (!Number.isFinite(level) || level < 1 || level > 99999)) {
    return jsonError('level must be a positive integer (max 99999)', 400, origin);
  }

  const seasonLengthDays = Number(env.SEASON_LENGTH_DAYS) || 90;
  const season           = await ensureSeasonReset(env);

  // District bonus: if the player controls the submitted district, add +5% score
  let finalScore = Math.floor(score);
  if (district_id) {
    const districtData = await env.DISTRICTS.get(`district:${district_id}`, { type: 'json' });
    if (districtData && districtData.controller === player_id.trim()) {
      finalScore = Math.floor(finalScore * 1.05);
    }
  }

  const entry = {
    player_id:   player_id.trim(),
    player_name: player_name.trim(),
    score:       finalScore,
    raw_score:   Math.floor(score),
    level:       level ? Math.floor(level) : 1,
    district_id: district_id || null,
    submitted_at: new Date().toISOString(),
  };

  const boardLimit = Number(env.BOARD_LIMIT) || 100;

  // Read both boards in parallel
  const [seasonalBoard, allTimeBoard] = await Promise.all([
    env.SEASONS.get('leaderboard:seasonal',  { type: 'json' }),
    env.SEASONS.get('leaderboard:all-time',  { type: 'json' }),
  ]);

  const updatedSeasonal = upsertEntry(seasonalBoard || [], entry, boardLimit);
  const updatedAllTime  = upsertEntry(allTimeBoard  || [], entry, boardLimit);

  // Write both boards back in parallel
  await Promise.all([
    env.SEASONS.put('leaderboard:seasonal', JSON.stringify(updatedSeasonal)),
    env.SEASONS.put('leaderboard:all-time', JSON.stringify(updatedAllTime)),
  ]);

  // Invalidate caches
  await Promise.all([
    env.CACHE.delete(`cache:leaderboard:seasonal:${boardLimit}`),
    env.CACHE.delete(`cache:leaderboard:alltime:${boardLimit}`),
  ]);

  return new Response(
    JSON.stringify({ season, entry, seasonal: updatedSeasonal, allTime: updatedAllTime }),
    { status: 201, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } },
  );
}

async function handleGetPlayer(request, env, origin, playerId) {
  const ttl = Number(env.CACHE_TTL_SECONDS) || 60;

  const payload = await cachedGet(env, `cache:leaderboard:player:${playerId}`, ttl, async () => {
    const [seasonalBoard, allTimeBoard] = await Promise.all([
      env.SEASONS.get('leaderboard:seasonal', { type: 'json' }),
      env.SEASONS.get('leaderboard:all-time',  { type: 'json' }),
    ]);

    const idLower   = playerId.toLowerCase();
    const seasonal  = (seasonalBoard || []).find((e) => e.player_id && e.player_id.toLowerCase() === idLower) || null;
    const allTime   = (allTimeBoard  || []).find((e) => e.player_id && e.player_id.toLowerCase() === idLower) || null;

    return { player_id: playerId, seasonal, all_time: allTime };
  });

  if (!payload.seasonal && !payload.all_time) {
    return jsonError('Player not found on any leaderboard', 404, origin);
  }

  return jsonOk(payload, origin);
}

async function handleResetSeason(request, env, origin) {
  if (!isAdmin(request, env)) {
    return jsonError('Forbidden', 403, origin);
  }

  const seasonLengthDays = Number(env.SEASON_LENGTH_DAYS) || 90;
  const seasonNum        = currentSeasonNumber(seasonLengthDays);

  // Archive then clear the current seasonal board
  const current = await env.SEASONS.get('leaderboard:seasonal', { type: 'json' }) || [];
  if (current.length > 0) {
    await env.SEASONS.put(`leaderboard:season-archive:${seasonNum}`, JSON.stringify(current));
  }

  await Promise.all([
    env.SEASONS.put('leaderboard:seasonal', JSON.stringify([])),
    env.SEASONS.put('leaderboard:season-meta', JSON.stringify({
      season:   seasonNum + 1,
      reset_at: new Date().toISOString(),
    })),
  ]);

  await Promise.all([
    env.CACHE.delete(`cache:leaderboard:seasonal:${Number(env.BOARD_LIMIT) || 100}`),
    env.CACHE.delete('cache:leaderboard:season-meta'),
  ]);

  return jsonOk({ reset: true, archived_season: seasonNum, new_season: seasonNum + 1 }, origin);
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
      if (path === '/health' && request.method === 'GET') {
        return jsonOk({ status: 'ok', worker: 'blocktopia-leaderboard' }, origin);
      }

      if (path === '/leaderboard' && request.method === 'GET') {
        return handleGetLeaderboard(request, env, origin);
      }

      if (path === '/leaderboard/all-time' && request.method === 'GET') {
        return handleGetAllTime(request, env, origin);
      }

      if (path === '/leaderboard/score' && request.method === 'POST') {
        return handlePostScore(request, env, origin);
      }

      const playerMatch = path.match(/^\/leaderboard\/player\/([^/]+)$/);
      if (playerMatch && request.method === 'GET') {
        return handleGetPlayer(request, env, origin, playerMatch[1]);
      }

      if (path === '/leaderboard/reset' && request.method === 'POST') {
        return handleResetSeason(request, env, origin);
      }

      return jsonError('Not Found', 404, origin);
    } catch (err) {
      return jsonError('Internal Server Error', 500, origin);
    }
  },

  /** Cron: daily season-rollover check (runs at 00:00 UTC per wrangler.toml). */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ensureSeasonReset(env));
  },
};

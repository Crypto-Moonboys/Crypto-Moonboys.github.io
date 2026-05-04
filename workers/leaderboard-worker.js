const GAMES = ["snake", "crystal", "blocktopia", "invaders", "pacchain", "asteroids", "breakout", "tetris"];
const VARIETY_BONUS = 500;           // bonus points when a player has scored in all 8 games
const SEASONAL_BONUS = 0;            // flat seasonal bonus (extend per-season via config if needed)
const MAX_SCORE = 1_000_000_000;     // upper bound for submitted scores
const MAX_META_SCORE = 1_000_000_000;
const PER_GAME_LEADERBOARD_SIZE = 100;
const GLOBAL_LEADERBOARD_SIZE = 100;
const META_WINDOWS = ["daily", "weekly", "monthly", "seasonal"];
const SEASON_LENGTH_MS = 90 * 24 * 60 * 60 * 1000;  // 90 days in milliseconds
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ALL_TIME_BOARD_SIZE = 420;
const ALL_TIME_TOP_SEASONAL = 50;    // top N seasonal players evaluated for all-time each reset

/**
 * Master season epoch: 2024-01-01T00:00:00.000Z (Unix ms 1704067200000).
 * Must match SEASON_EPOCH_MS in workers/moonboys-api/worker.js so both workers
 * always report the same current season number regardless of deployment order.
 * Anti-drift: scripts/anti-drift-check.mjs verifies this value matches moonboys-api.
 */
const SEASON_EPOCH_MS = 1704067200000;

/**
 * Telegram auth tokens are considered valid for 24 hours (86400 seconds).
 * Must match TELEGRAM_AUTH_MAX_AGE in workers/moonboys-api/blocktopia/config.js
 * and TELEGRAM_AUTH_MAX_AGE_SECONDS in js/identity-gate.js.
 * Anti-drift: if any of these diverge, leaderboard auth will silently mismatch.
 */
const TELEGRAM_AUTH_MAX_AGE_SECONDS = 86400;

/**
 * Game-key aliases: map non-canonical client-submitted keys to the canonical
 * GAMES array values.  GET requests also normalise via this map so that
 * ?game=snake-run and ?game=snake both return the same board.
 */
const GAME_KEY_ALIASES = {
  'snake-run':           'snake',
  'breakout-bullrun':    'breakout',
  'asteroid-fork':       'asteroids',
  'pac-chain':           'pacchain',
  'tetris-block-topia':  'tetris',
  'crystal-quest':       'crystal',
  'block-topia-quest-maze': 'blocktopia',
};

/**
 * CORS allowed origins for browser-facing routes.
 * Only origins in this list receive the Access-Control-Allow-Origin header.
 * Configured via CORS_ALLOWED_ORIGINS env var (comma-separated).
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
];

// ── Telegram HMAC verification ───────────────────────────────────────────────
// Mirrors the algorithm in workers/moonboys-api/worker.js verifyTelegramAuth /
// buildTelegramAuthCheckString.  Must stay in sync if the upstream implementation
// changes.

function buildTelegramAuthCheckString(fields) {
  return Object.keys(fields || {})
    .filter(k => fields[k] != null)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n');
}

async function verifyTelegramHmac(data, botToken) {
  if (!botToken || !data || !data.hash) return false;
  const { hash, ...fields } = data;
  const checkString = buildTelegramAuthCheckString(fields);
  const secretKeyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken));
  const hmacKey = await crypto.subtle.importKey(
    'raw', secretKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(checkString));
  const sig = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  return sig === hash;
}

/**
 * Parses and HMAC-verifies a Telegram auth payload from a POST body.
 *
 * Returns { ok: true, telegramId: "123" } on success.
 * Returns { ok: false, error: "...", status: 4xx } on failure.
 *
 * Accepts telegram_auth or auth_evidence field (object or JSON string).
 */
async function verifyLeaderboardTelegramAuth(body, env) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'server_config_error', status: 503 };
  }

  const rawAuth = body?.telegram_auth ?? body?.auth_evidence ?? null;
  if (!rawAuth) {
    return { ok: false, error: 'telegram_sync_required', status: 403 };
  }

  let tg;
  if (typeof rawAuth === 'object') {
    tg = rawAuth;
  } else if (typeof rawAuth === 'string') {
    try { tg = JSON.parse(rawAuth); } catch { tg = null; }
  }
  if (!tg || typeof tg !== 'object') {
    return { ok: false, error: 'telegram_sync_required', status: 403 };
  }

  const telegramId = String(tg.id || '').trim();
  const authDate   = String(tg.auth_date || '').trim();
  const hash       = String(tg.hash || '').trim();

  if (!/^\d{1,20}$/.test(telegramId)) {
    return { ok: false, error: 'telegram_auth_invalid', status: 401 };
  }
  if (!/^\d{1,12}$/.test(authDate)) {
    return { ok: false, error: 'telegram_auth_invalid', status: 401 };
  }
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return { ok: false, error: 'telegram_auth_invalid', status: 401 };
  }

  const authDateSeconds = parseInt(authDate, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDateSeconds) || authDateSeconds > nowSeconds + 300) {
    return { ok: false, error: 'telegram_auth_invalid', status: 401 };
  }
  if (nowSeconds - authDateSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    return { ok: false, error: 'telegram_auth_expired', status: 401 };
  }

  let valid = false;
  try {
    valid = await verifyTelegramHmac(
      { id: telegramId, first_name: tg.first_name, last_name: tg.last_name,
        username: tg.username, photo_url: tg.photo_url, auth_date: authDate, hash },
      env.TELEGRAM_BOT_TOKEN,
    );
  } catch {
    return { ok: false, error: 'telegram_auth_verification_error', status: 500 };
  }
  if (!valid) {
    return { ok: false, error: 'telegram_auth_invalid', status: 401 };
  }

  // If caller also supplied body.telegram_id, it must match the verified ID.
  if (body.telegram_id != null) {
    const claimed = String(body.telegram_id).trim();
    if (claimed && claimed !== telegramId) {
      return { ok: false, error: 'telegram_id_mismatch', status: 403 };
    }
  }

  return { ok: true, telegramId };
}

// ── CORS helpers ─────────────────────────────────────────────────────────────

function getAllowedOrigins(env) {
  const envVal = env.CORS_ALLOWED_ORIGINS;
  if (envVal) {
    return String(envVal).split(',').map(s => s.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const allowedOrigin = allowed.includes(origin) ? origin : (allowed[0] || 'null');
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    // Security headers on every JSON response
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  };
}

/** Normalise a submitted game key to its canonical GAMES value. */
function normaliseGameKey(raw) {
  const cleaned = String(raw || 'global').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'global';
  return GAME_KEY_ALIASES[cleaned] || cleaned;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // path is used for the structured /season/current route.
    // Legacy GET/POST handlers use url.searchParams instead (no path routing).
    const path = url.pathname.replace(/\/$/, '') || '/';

    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Lazy reset check on every request
    await checkAndRunResets(env);

    // ── GET /season/current ──────────────────────────────────────────────────
    // Exposes the current arcade season state so the frontend can display
    // season info consistent with the community XP season in moonboys-api.
    if (path === "/season/current" && request.method === "GET") {
      const meta = await getOrInitMeta(env);
      const now  = Date.now();
      const seasonElapsed  = now - new Date(meta.season_start).getTime();
      const seasonDaysLeft = Math.max(0, Math.ceil((SEASON_LENGTH_MS - seasonElapsed) / MS_PER_DAY));
      return new Response(JSON.stringify({
        season_number:    meta.season_number,
        season_start:     meta.season_start,
        season_days_left: seasonDaysLeft,
        year:             new Date(now).getUTCFullYear(),
        year_start:       meta.year_start,
        reset_model:      '90-day seasonal + New Year yearly (matches moonboys-api)',
        epoch_anchor:     new Date(SEASON_EPOCH_MS).toISOString(),
      }), { headers: corsHeaders });
    }

    if (request.method === "GET") {
      // Normalise game alias on GET so ?game=snake-run returns the 'snake' board
      const rawGame = url.searchParams.get("game") || "global";
      const game = normaliseGameKey(rawGame) || rawGame;
      const mode = (url.searchParams.get("mode") || "raw").toLowerCase();

      if (mode === "meta") {
        if (game === "all") {
          const boards = await Promise.all(META_WINDOWS.map((windowKey) => getMetaBoard(env, windowKey)));
          const result = {};
          META_WINDOWS.forEach((windowKey, i) => { result[windowKey] = boards[i]; });
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }
        const windowKey = META_WINDOWS.includes(game) ? game : "daily";
        const board = await getMetaBoard(env, windowKey);
        return new Response(JSON.stringify(board), { headers: corsHeaders });
      }

      if (game === "all") {
        const allKeys = [...GAMES, "global", "seasonal", "yearly", "all-time"];
        const boards = await Promise.all(allKeys.map(g => getBoard(env, g)));
        const result = {};
        allKeys.forEach((g, i) => { result[g] = boards[i]; });
        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      const board = await getBoard(env, game);
      return new Response(JSON.stringify(board), { headers: corsHeaders });
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // ── CRIT-01: Verify Telegram identity via HMAC before trusting any ID ──
      // body.telegram_id is never trusted directly. The verified ID is derived
      // exclusively from the signed telegram_auth payload.
      const authResult = await verifyLeaderboardTelegramAuth(body, env);
      if (!authResult.ok) {
        return new Response(
          JSON.stringify({ error: authResult.error }),
          { status: authResult.status, headers: corsHeaders }
        );
      }
      const telegramId = authResult.telegramId;

      const { player, score, game } = body;
      const rawFaction = String(body.faction || "unaligned").toLowerCase().trim();
      const faction = ["diamond-hands", "hodl-warriors", "graffpunks"].includes(rawFaction) ? rawFaction : "unaligned";
      const submissionMode = String(body.score_type || "raw").toLowerCase();

      // Anti-cheat gate — the anti-cheat worker writes anticheat:blocked:{id}
      // into this same KV namespace when a user's risk ceiling is breached.
      // Uses the verified telegramId, never body.telegram_id.
      const blockStatus = await env.LEADERBOARD.get(`anticheat:blocked:${telegramId}`);
      if (blockStatus) {
        return new Response(
          JSON.stringify({ error: "account_blocked", block_type: blockStatus }),
          { status: 403, headers: corsHeaders }
        );
      }

      if (typeof player !== "string" || player.trim().length < 1 || player.trim().length > 40) {
        return new Response(
          JSON.stringify({ error: "player must be a non-empty string (max 40 chars)" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const parsedScore = Number(score);
      const maxScore = submissionMode === "meta" ? MAX_META_SCORE : MAX_SCORE;
      if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > maxScore) {
        return new Response(
          JSON.stringify({ error: `score must be a non-negative finite number (max ${maxScore})` }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Normalise game key — aliases (e.g. snake-run → snake) and sanitise
      const gameKey = normaliseGameKey(game);

      const playerName = player.trim();
      const floorScore = Math.floor(parsedScore);

      if (submissionMode === "meta") {
        const eventTs = Number(body.timestamp);
        const timestamp = Number.isFinite(eventTs) ? eventTs : Date.now();
        await updateMetaBoards(env, {
          player: playerName,
          score: floorScore,
          game: gameKey,
          timestamp,
        });
        return new Response(
          JSON.stringify({ status: "ok", mode: "meta" }),
          { headers: corsHeaders }
        );
      }

      let previousBest = 0;
      if (gameKey !== "global") {
        // Update all three per-game boards (all-time, seasonal, yearly) in parallel
        const [board, sBoard, yBoard] = await Promise.all([
          getBoard(env, gameKey),
          getBoard(env, `seasonal:${gameKey}`),
          getBoard(env, `yearly:${gameKey}`)
        ]);

        const existingEntry = board.find((row) => String(row?.telegram_id || '') === telegramId) || null;
        previousBest = Number(existingEntry?.score || 0);
        const entry = { player: playerName, score: floorScore, telegram_id: telegramId, faction };
        const updatedBoard = upsertEntry(board, entry, PER_GAME_LEADERBOARD_SIZE);
        const updatedSeasonal = upsertEntry(sBoard, entry, PER_GAME_LEADERBOARD_SIZE);
        const updatedYearly = upsertEntry(yBoard, entry, PER_GAME_LEADERBOARD_SIZE);
        await Promise.all([
          env.LEADERBOARD.put(`leaderboard:${gameKey}`,          JSON.stringify(updatedBoard)),
          env.LEADERBOARD.put(`leaderboard:seasonal:${gameKey}`, JSON.stringify(updatedSeasonal)),
          env.LEADERBOARD.put(`leaderboard:yearly:${gameKey}`,   JSON.stringify(updatedYearly))
        ]);

        // Recompute all three aggregate boards from their respective per-game data
        await recomputeAllBoards(env);
      }

      const responsePayload = { status: "ok", accepted: true };
      if (gameKey !== "global") {
        responsePayload.leaderboard = {
          game: gameKey,
          telegram_id: telegramId,
          previous_best: previousBest,
        };
      }
      return new Response(JSON.stringify(responsePayload), { headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }
};

/* ── Reset logic ──────────────────────────────────────────────────────────── */

/**
 * Called on every request. Checks whether a seasonal (90-day) or yearly
 * (New Year UTC) reset is due, and runs it if so. All reset logic lives
 * exclusively here — individual games never trigger resets.
 */
async function checkAndRunResets(env) {
  const meta = await getOrInitMeta(env);
  const now = Date.now();

  // Yearly reset takes priority (also performs the final seasonal reset)
  const currentYear = new Date(now).getUTCFullYear();
  const metaYear    = new Date(meta.year_start).getUTCFullYear();
  if (currentYear > metaYear) {
    await runYearlyReset(env, meta, now);
    return;
  }

  // Seasonal reset every 90 days
  const seasonStart = new Date(meta.season_start).getTime();
  if (now - seasonStart >= SEASON_LENGTH_MS) {
    await runSeasonalReset(env, meta, now);
  }
}

/**
 * Seasonal reset (every 90 days):
 *  1. Evaluate top seasonal players → update all-time top 420 board
 *  2. Archive the finished season
 *  3. Reset seasonal per-game bests + seasonal main_score board
 *  4. Advance season number and start timestamp in meta
 *
 * Yearly and all-time data are preserved.
 */
async function runSeasonalReset(env, meta, now) {
  // 1. Push top seasonal qualifiers into the all-time board
  const seasonalBoard = await getBoard(env, "seasonal");
  if (seasonalBoard.length > 0) {
    await updateAllTimeBoard(env, seasonalBoard);
  }

  // 2. Archive the finished season
  await env.LEADERBOARD.put(
    `leaderboard:archive:season-${meta.season_number}`,
    JSON.stringify({
      season_number: meta.season_number,
      season_start:  meta.season_start,
      season_end:    new Date(now).toISOString(),
      leaderboard:   seasonalBoard
    })
  );

  // 3. Reset seasonal per-game boards and seasonal aggregate board
  await Promise.all([
    ...GAMES.map(g => env.LEADERBOARD.put(`leaderboard:seasonal:${g}`, JSON.stringify([]))),
    env.LEADERBOARD.put("leaderboard:seasonal", JSON.stringify([])),
    env.LEADERBOARD.put("leaderboard:meta:seasonal", JSON.stringify([]))
  ]);

  // 4. Advance meta
  await env.LEADERBOARD.put("leaderboard:meta", JSON.stringify({
    ...meta,
    season_start:  new Date(now).toISOString(),
    season_number: meta.season_number + 1
  }));
}

/**
 * Yearly reset (on New Year UTC):
 *  1. Close out the current season (all-time eval + seasonal archive/reset)
 *  2. Archive yearly winners
 *  3. Reset yearly per-game bests + yearly main_score board
 *  4. Reset yearly ranks / awards in meta; preserve all-time board
 */
async function runYearlyReset(env, meta, now) {
  const currentYear = new Date(now).getUTCFullYear();

  // 1. Close current season (final all-time eval + seasonal archive + seasonal reset)
  const seasonalBoard = await getBoard(env, "seasonal");
  if (seasonalBoard.length > 0) {
    await updateAllTimeBoard(env, seasonalBoard);
  }
  await env.LEADERBOARD.put(
    `leaderboard:archive:season-${meta.season_number}`,
    JSON.stringify({
      season_number: meta.season_number,
      season_start:  meta.season_start,
      season_end:    new Date(now).toISOString(),
      leaderboard:   seasonalBoard
    })
  );
  await Promise.all([
    ...GAMES.map(g => env.LEADERBOARD.put(`leaderboard:seasonal:${g}`, JSON.stringify([]))),
    env.LEADERBOARD.put("leaderboard:seasonal", JSON.stringify([])),
    env.LEADERBOARD.put("leaderboard:meta:seasonal", JSON.stringify([]))
  ]);

  // 2. Archive yearly winners
  const yearlyBoard = await getBoard(env, "yearly");
  const prevYear    = new Date(meta.year_start).getUTCFullYear();
  await env.LEADERBOARD.put(
    `leaderboard:archive:year-${prevYear}`,
    JSON.stringify({
      year:        prevYear,
      year_start:  meta.year_start,
      year_end:    new Date(now).toISOString(),
      leaderboard: yearlyBoard
    })
  );

  // 3. Reset yearly per-game boards and yearly aggregate board
  await Promise.all([
    ...GAMES.map(g => env.LEADERBOARD.put(`leaderboard:yearly:${g}`, JSON.stringify([]))),
    env.LEADERBOARD.put("leaderboard:yearly", JSON.stringify([]))
  ]);

  // 4. Update meta: new year + new season (all-time board untouched)
  await env.LEADERBOARD.put("leaderboard:meta", JSON.stringify({
    season_start:  new Date(now).toISOString(),
    season_number: meta.season_number + 1,
    year_start:    new Date(Date.UTC(currentYear, 0, 1)).toISOString()
  }));
}

/* ── All-Time High board (top 420, never resets) ─────────────────────────── */

/**
 * After each seasonal reset, evaluate the top ALL_TIME_TOP_SEASONAL (50)
 * seasonal finishers as candidates for the permanent All-Time High board.
 *
 * Placement rules:
 *  - Board fills to ALL_TIME_BOARD_SIZE (420) unconditionally.
 *  - Once full, a candidate only enters if their qualifying_score exceeds
 *    the current lowest entry. The lowest entry is then dropped.
 *  - An existing player's entry is updated if their new score is higher.
 *  - Board is always sorted by qualifying_score descending.
 */
async function updateAllTimeBoard(env, seasonalBoard) {
  let allTimeList = await getBoard(env, "all-time");

  const candidates = seasonalBoard.slice(0, ALL_TIME_TOP_SEASONAL);

  for (const candidate of candidates) {
    const qualifyingScore = Number(candidate.score) || 0;
    const nameLower = String(candidate.player).toLowerCase();

    const existingIdx = allTimeList.findIndex(
      e => typeof e.player === "string" && e.player.toLowerCase() === nameLower
    );

    if (existingIdx !== -1) {
      // Update player's all-time entry if this season's score is higher
      if (qualifyingScore > (Number(allTimeList[existingIdx].score) || 0)) {
        allTimeList[existingIdx] = {
          player:    candidate.player,
          score:     qualifyingScore,
          breakdown: candidate.breakdown || {}
        };
      }
    } else if (allTimeList.length < ALL_TIME_BOARD_SIZE) {
      // Board not yet full — add unconditionally
      allTimeList.push({
        player:    candidate.player,
        score:     qualifyingScore,
        breakdown: candidate.breakdown || {}
      });
    } else {
      // Board full — only enter if score beats the current lowest entry
      let lowestIdx = 0;
      for (let i = 1; i < allTimeList.length; i++) {
        if ((Number(allTimeList[i].score) || 0) < (Number(allTimeList[lowestIdx].score) || 0)) {
          lowestIdx = i;
        }
      }
      if (qualifyingScore > (Number(allTimeList[lowestIdx].score) || 0)) {
        allTimeList[lowestIdx] = {
          player:    candidate.player,
          score:     qualifyingScore,
          breakdown: candidate.breakdown || {}
        };
      }
    }
  }

  // Sort descending by score; alphabetical tie-break
  allTimeList.sort((a, b) => {
    const diff = (Number(b.score) || 0) - (Number(a.score) || 0);
    return diff !== 0 ? diff : String(a.player).localeCompare(String(b.player));
  });

  const ranked = allTimeList.slice(0, ALL_TIME_BOARD_SIZE).map((e, i) => ({ ...e, rank: i + 1 }));
  await env.LEADERBOARD.put("leaderboard:all-time", JSON.stringify(ranked));
  return ranked;
}

/* ── Aggregate board computation ─────────────────────────────────────────── */

/**
 * Recompute all three aggregate (main_score) boards in parallel:
 *   leaderboard:global   — all-time per-game bests
 *   leaderboard:seasonal — current-season per-game bests
 *   leaderboard:yearly   — current-year per-game bests
 *
 * main_score formula (same for all three boards):
 *   main_score = sum(best per-game scores across all active games)
 *              + variety_bonus   (VARIETY_BONUS when all 8 games have a score > 0)
 *              + SEASONAL_BONUS  (flat season-wide bonus, 0 by default)
 */
async function recomputeAllBoards(env) {
  const [allTimeBoards, seasonalBoards, yearlyBoards] = await Promise.all([
    Promise.all(GAMES.map(g => getBoard(env, g))),
    Promise.all(GAMES.map(g => getBoard(env, `seasonal:${g}`))),
    Promise.all(GAMES.map(g => getBoard(env, `yearly:${g}`)))
  ]);

  await Promise.all([
    recomputeAggregate(env, "global",   allTimeBoards),
    recomputeAggregate(env, "seasonal", seasonalBoards),
    recomputeAggregate(env, "yearly",   yearlyBoards)
  ]);
}

async function recomputeAggregate(env, key, boards) {
  // Build player → per-game score map from the provided per-game boards
  const playerMap = {};
  GAMES.forEach((g, i) => {
    boards[i].forEach((entry) => {
      const name = String(entry.player || "");
      if (!name) return;
      if (!playerMap[name]) playerMap[name] = {};
      playerMap[name][g] = Number(entry.score) || 0;
    });
  });

  // main_score = sum(best per-game scores) + variety_bonus + SEASONAL_BONUS
  const entries = Object.entries(playerMap).map(([name, scores]) => {
    const gameTotal = GAMES.reduce((sum, g) => sum + (scores[g] || 0), 0);
    const variety   = GAMES.every(g => (scores[g] || 0) > 0) ? VARIETY_BONUS : 0;
    const main_score = gameTotal + variety + SEASONAL_BONUS;
    const breakdown  = {};
    GAMES.forEach(g => { breakdown[g] = scores[g] || 0; });
    breakdown.variety_bonus = variety;
    return { player: name, score: main_score, breakdown };
  });

  entries.sort((a, b) => {
    const diff = b.score - a.score;
    return diff !== 0 ? diff : String(a.player).localeCompare(String(b.player));
  });

  const ranked = entries.slice(0, GLOBAL_LEADERBOARD_SIZE).map((e, i) => ({ ...e, rank: i + 1 }));
  await env.LEADERBOARD.put(`leaderboard:${key}`, JSON.stringify(ranked));
  return ranked;
}

/* ── Meta leaderboard computation ──────────────────────────────────────────── */

async function updateMetaBoards(env, submission) {
  const ts = Number.isFinite(submission.timestamp) ? submission.timestamp : Date.now();
  const period = await getMetaPeriodContext(env, ts);
  const player = String(submission.player || "").trim();
  const score = Math.max(0, Math.floor(Number(submission.score) || 0));
  if (!player || !score) return;

  await Promise.all(META_WINDOWS.map(async (windowKey) => {
    const bucketKey = period[windowKey];
    const bucket = await getMetaBucket(env, bucketKey);
    const merged = addToMetaBucket(bucket, player, score, ts, submission.game);
    const ranked = rankMetaBucket(merged, GLOBAL_LEADERBOARD_SIZE);
    await Promise.all([
      env.LEADERBOARD.put(bucketKey, JSON.stringify(merged)),
      env.LEADERBOARD.put(`leaderboard:meta:${windowKey}`, JSON.stringify(ranked)),
    ]);
  }));
}

async function getMetaBoard(env, windowKey) {
  const now = Date.now();
  const period = await getMetaPeriodContext(env, now);
  const resolved = META_WINDOWS.includes(windowKey) ? windowKey : "daily";
  const bucket = await getMetaBucket(env, period[resolved]);
  const ranked = rankMetaBucket(bucket, GLOBAL_LEADERBOARD_SIZE);
  await env.LEADERBOARD.put(`leaderboard:meta:${resolved}`, JSON.stringify(ranked));
  return ranked;
}

async function getMetaPeriodContext(env, timestamp) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const week = isoWeekKey(date);
  const meta = await getOrInitMeta(env);

  return {
    daily: `leaderboard:meta:bucket:daily:${year}-${month}-${day}`,
    weekly: `leaderboard:meta:bucket:weekly:${week}`,
    monthly: `leaderboard:meta:bucket:monthly:${year}-${month}`,
    seasonal: `leaderboard:meta:bucket:seasonal:season-${meta.season_number}`,
  };
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / MS_PER_DAY) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function getMetaBucket(env, kvKey) {
  const raw = await env.LEADERBOARD.get(kvKey);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function addToMetaBucket(existingBucket, player, score, timestamp, game) {
  const bucket = { ...(existingBucket || {}) };
  const key = player.toLowerCase();
  const prev = bucket[key] || { player, score: 0 };
  bucket[key] = {
    player: prev.player || player,
    score: Math.floor((Number(prev.score) || 0) + score),
    updated_at: new Date(timestamp).toISOString(),
    last_game: String(game || "unknown"),
  };
  return bucket;
}

function rankMetaBucket(bucket, limit) {
  const rows = Object.values(bucket || {}).map((entry) => ({
    player: String(entry.player || ""),
    score: Math.floor(Number(entry.score) || 0),
  })).filter((entry) => entry.player && entry.score >= 0);

  rows.sort((a, b) => {
    const diff = b.score - a.score;
    return diff !== 0 ? diff : String(a.player).localeCompare(String(b.player));
  });

  return rows.slice(0, limit).map((entry, i) => ({ ...entry, rank: i + 1 }));
}

/* ── Board helpers ────────────────────────────────────────────────────────── */

async function getBoard(env, game) {
  const raw = await env.LEADERBOARD.get(`leaderboard:${game}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Read or initialise the season/year metadata stored in KV.
 * Meta shape: { season_start: ISO, season_number: N, year_start: ISO }
 *
 * When no meta exists (first deploy), the season is bootstrapped from the
 * fixed SEASON_EPOCH_MS anchor rather than "now".  This ensures new
 * deployments always join the same current season as moonboys-api.
 */
async function getOrInitMeta(env) {
  const raw = await env.LEADERBOARD.get("leaderboard:meta");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* fall through to init */ }
  }
  const now        = Date.now();
  const seasonIdx  = Math.floor((now - SEASON_EPOCH_MS) / SEASON_LENGTH_MS);
  const meta = {
    season_start:  new Date(SEASON_EPOCH_MS + seasonIdx * SEASON_LENGTH_MS).toISOString(),
    season_number: seasonIdx + 1,
    year_start:    new Date(Date.UTC(new Date(now).getUTCFullYear(), 0, 1)).toISOString()
  };
  await env.LEADERBOARD.put("leaderboard:meta", JSON.stringify(meta));
  return meta;
}

/**
 * Insert or update one entry in a leaderboard list.
 * - Deduplicates by player name (case-insensitive).
 * - Keeps only the player's best (highest) score.
 * - Sorts descending by score with alphabetical tie-break.
 * - Trims to `limit` entries and stamps rank.
 */
function upsertEntry(existing, newEntry, limit) {
  let list = Array.isArray(existing) ? existing.slice() : [];

  const nameLower = newEntry.player.toLowerCase();
  const idx = list.findIndex(
    (e) => typeof e.player === "string" && e.player.toLowerCase() === nameLower
  );

  if (idx !== -1) {
    if (newEntry.score > (Number(list[idx].score) || 0)) {
      list[idx] = { ...list[idx], ...newEntry };
    } else {
      if (newEntry.telegram_id) list[idx].telegram_id = newEntry.telegram_id;
      if (newEntry.faction) list[idx].faction = newEntry.faction;
    }
  } else {
    list.push(newEntry);
  }

  list.sort((a, b) => {
    const diff = (Number(b.score) || 0) - (Number(a.score) || 0);
    return diff !== 0 ? diff : String(a.player).localeCompare(String(b.player));
  });

  return list.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
}

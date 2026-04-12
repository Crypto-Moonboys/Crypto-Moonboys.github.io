const GAMES = ["snake", "crystal", "blocktopia", "invaders", "pacchain", "asteroids", "breakout", "tetris"];
const VARIETY_BONUS = 500;           // bonus points when a player has scored in all 8 games
const SEASONAL_BONUS = 0;            // flat seasonal bonus (extend per-season via config if needed)
const MAX_SCORE = 1_000_000_000;     // upper bound for submitted scores
const PER_GAME_LEADERBOARD_SIZE = 100;
const GLOBAL_LEADERBOARD_SIZE = 100;
const SEASON_LENGTH_MS = 90 * 24 * 60 * 60 * 1000;  // 90 days in milliseconds
const ALL_TIME_BOARD_SIZE = 420;
const ALL_TIME_TOP_SEASONAL = 50;    // top N seasonal players evaluated for all-time each reset

/**
 * Master season epoch: 2024-01-01T00:00:00.000Z (Unix ms 1704067200000).
 * Must match SEASON_EPOCH_MS in workers/moonboys-api/worker.js so both workers
 * always report the same current season number regardless of deployment order.
 */
const SEASON_EPOCH_MS = 1704067200000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // path is used for the structured /season/current route.
    // Legacy GET/POST handlers use url.searchParams instead (no path routing).
    const path = url.pathname.replace(/\/$/, '') || '/';

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

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
      const seasonDaysLeft = Math.max(0, Math.ceil((SEASON_LENGTH_MS - seasonElapsed) / 86400000));
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
      const game = url.searchParams.get("game") || "global";

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

      const { player, score, game, telegram_id } = body;

      // Competitive action — seasonal and all-time score submission requires
      // a Telegram-synced identity.  Guests can play locally but scores are
      // not persisted to any leaderboard without a linked Telegram account.
      if (!telegram_id || !String(telegram_id).trim()) {
        return new Response(
          JSON.stringify({ error: "telegram_sync_required" }),
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
      if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > MAX_SCORE) {
        return new Response(
          JSON.stringify({ error: `score must be a non-negative finite number (max ${MAX_SCORE})` }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Sanitise game key — only lowercase alphanumeric, hyphen, underscore
      const gameKey = String(game || "global")
        .replace(/[^a-z0-9_-]/gi, "")
        .toLowerCase() || "global";

      const playerName = player.trim();
      const floorScore = Math.floor(parsedScore);

      if (gameKey !== "global") {
        // Update all three per-game boards (all-time, seasonal, yearly) in parallel
        const [board, sBoard, yBoard] = await Promise.all([
          getBoard(env, gameKey),
          getBoard(env, `seasonal:${gameKey}`),
          getBoard(env, `yearly:${gameKey}`)
        ]);

        const entry = { player: playerName, score: floorScore };
        await Promise.all([
          env.LEADERBOARD.put(`leaderboard:${gameKey}`,          JSON.stringify(upsertEntry(board,  entry, PER_GAME_LEADERBOARD_SIZE))),
          env.LEADERBOARD.put(`leaderboard:seasonal:${gameKey}`, JSON.stringify(upsertEntry(sBoard, entry, PER_GAME_LEADERBOARD_SIZE))),
          env.LEADERBOARD.put(`leaderboard:yearly:${gameKey}`,   JSON.stringify(upsertEntry(yBoard, entry, PER_GAME_LEADERBOARD_SIZE)))
        ]);

        // Recompute all three aggregate boards from their respective per-game data
        await recomputeAllBoards(env);
      }

      return new Response(
        JSON.stringify({ status: "ok" }),
        { headers: corsHeaders }
      );
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
    env.LEADERBOARD.put("leaderboard:seasonal", JSON.stringify([]))
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
    env.LEADERBOARD.put("leaderboard:seasonal", JSON.stringify([]))
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
    }
    // else: existing score is better — no update
  } else {
    list.push(newEntry);
  }

  list.sort((a, b) => {
    const diff = (Number(b.score) || 0) - (Number(a.score) || 0);
    return diff !== 0 ? diff : String(a.player).localeCompare(String(b.player));
  });

  return list.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
}
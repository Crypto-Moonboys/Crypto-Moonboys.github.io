const GAMES = ["snake", "crystal", "blocktopia", "invaders", "pacchain", "asteroids", "breakout", "tetris"];
const VARIETY_BONUS = 500;          // bonus points when a player has scored in all 8 games
const MAX_SCORE = 1_000_000_000;    // upper bound for submitted scores
const PER_GAME_LEADERBOARD_SIZE = 100;
const GLOBAL_LEADERBOARD_SIZE = 100;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET") {
      const game = url.searchParams.get("game") || "global";

      if (game === "all") {
        const boards = await Promise.all(
          [...GAMES, "global"].map(g => getBoard(env, g))
        );
        const result = {};
        [...GAMES, "global"].forEach((g, i) => { result[g] = boards[i]; });
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

      const { player, score, game } = body;

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

      if (gameKey !== "global") {
        // Upsert per-game best (keep highest score per player only)
        const board = await getBoard(env, gameKey);
        const updated = upsertEntry(board, { player: playerName, score: Math.floor(parsedScore) }, PER_GAME_LEADERBOARD_SIZE);
        await env.LEADERBOARD.put(`leaderboard:${gameKey}`, JSON.stringify(updated));

        // Recompute global leaderboard from all per-game boards
        await recomputeGlobal(env);
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

/* ── Board helpers ─────────────────────────────────────────────────────── */

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

async function recomputeGlobal(env) {
  const boards = await Promise.all(GAMES.map((g) => getBoard(env, g)));

  // Build a map: player → { snake: N, crystal: N, blocktopia: N, … }
  const playerMap = {};
  GAMES.forEach((g, i) => {
    boards[i].forEach((entry) => {
      const name = String(entry.player || "");
      if (!name) return;
      if (!playerMap[name]) playerMap[name] = {};
      playerMap[name][g] = Number(entry.score) || 0;
    });
  });

  // Compute global score: sum of per-game bests + variety bonus
  const globalEntries = Object.entries(playerMap).map(([name, scores]) => {
    const total = GAMES.reduce((sum, g) => sum + (scores[g] || 0), 0);
    const variety = GAMES.every((g) => (scores[g] || 0) > 0) ? VARIETY_BONUS : 0;
    const breakdown = {};
    GAMES.forEach((g) => { breakdown[g] = scores[g] || 0; });
    breakdown.variety_bonus = variety;
    return { player: name, score: total + variety, breakdown };
  });

  globalEntries.sort((a, b) => {
    const diff = b.score - a.score;
    return diff !== 0 ? diff : String(a.player).localeCompare(String(b.player));
  });

  const ranked = globalEntries.slice(0, GLOBAL_LEADERBOARD_SIZE).map((e, i) => ({ ...e, rank: i + 1 }));
  await env.LEADERBOARD.put("leaderboard:global", JSON.stringify(ranked));
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
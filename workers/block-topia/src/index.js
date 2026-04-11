/**
 * Block Topia Quest Maze — Leaderboard Write-back Worker
 *
 * Endpoint: POST /api/block-topia/score
 * Body:     { name: string, score: number, level: number, gold: number }
 *
 * R2 keys used (per docs/r2-worker-env.md):
 *   R2-Upload/leaderboards/current-season.json   — top 100 this season
 *   R2-Upload/leaderboards/masters-all-time.json  — top 10 all-time
 *
 * Environment bindings required (see wrangler.toml):
 *   R2_BUCKET  — R2 bucket binding (CLOUDFLARE_R2_BUCKET)
 */

const SEASON_KEY  = 'R2-Upload/leaderboards/current-season.json';
const MASTERS_KEY = 'R2-Upload/leaderboards/masters-all-time.json';

const ALLOWED_ORIGIN = 'https://crypto-moonboys.github.io';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/api/block-topia/score' && request.method === 'POST') {
      return handleScorePost(request, env);
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};

/* ── POST /api/block-topia/score ───────────────────────────────────────── */

async function handleScorePost(request, env) {
  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { name, score, level, gold } = body;

  // Validate inputs
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 20) {
    return jsonError('name must be a string between 2 and 20 characters', 400);
  }
  if (!Number.isFinite(score) || score < 0 || score > 1e9) {
    return jsonError('score must be a non-negative finite number (max 1,000,000,000)', 400);
  }
  if (!Number.isFinite(level) || level < 1 || level > 10000) {
    return jsonError('level must be a positive integer', 400);
  }
  if (!Number.isFinite(gold) || gold < 0 || gold > 1e9) {
    return jsonError('gold must be a non-negative finite number (max 1,000,000,000)', 400);
  }

  const entry = {
    name:  name.trim(),
    score: Math.floor(score),
    level: Math.floor(level),
    gold:  Math.floor(gold),
  };

  // Read both leaderboard files in parallel
  const [seasonObj, mastersObj] = await Promise.all([
    env.R2_BUCKET.get(SEASON_KEY),
    env.R2_BUCKET.get(MASTERS_KEY),
  ]);

  const seasonData  = seasonObj  ? await seasonObj.json()  : [];
  const mastersData = mastersObj ? await mastersObj.json() : [];

  const updatedSeason  = upsertEntry(seasonData,  entry, 100);
  const updatedMasters = upsertEntry(mastersData, entry,  10);

  // Write both files back in parallel
  await Promise.all([
    env.R2_BUCKET.put(
      SEASON_KEY,
      JSON.stringify(updatedSeason),
      { httpMetadata: { contentType: 'application/json' } },
    ),
    env.R2_BUCKET.put(
      MASTERS_KEY,
      JSON.stringify(updatedMasters),
      { httpMetadata: { contentType: 'application/json' } },
    ),
  ]);

  return new Response(
    JSON.stringify({ currentSeason: updatedSeason, mastersAllTime: updatedMasters }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

/* ── Leaderboard helpers ───────────────────────────────────────────────── */

/**
 * Insert or update an entry in a leaderboard list.
 * - Deduplicates by player name (case-insensitive).
 * - Keeps only the best score per player.
 * - Sorts highest score first.
 * - Trims to `limit` entries and adds rank field.
 */
function upsertEntry(existing, newEntry, limit) {
  // Normalise: accept array or wrapped format
  let list = Array.isArray(existing)
    ? existing
    : (existing.leaderboard || existing.entries || existing.players || []);

  // Work on a shallow copy to avoid mutating the original
  list = list.slice();

  const nameLower = newEntry.name.toLowerCase();
  const idx = list.findIndex(
    (e) => typeof e.name === 'string' && e.name.toLowerCase() === nameLower,
  );

  if (idx !== -1) {
    // Only replace if the new score is strictly better
    if (newEntry.score > (Number(list[idx].score) || 0)) {
      list[idx] = { ...list[idx], ...newEntry };
    }
  } else {
    list.push(newEntry);
  }

  // Sort descending by score, then alphabetically by name for stable tie-break
  list.sort((a, b) => {
    const diff = (Number(b.score) || 0) - (Number(a.score) || 0);
    return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name));
  });

  // Trim and stamp rank
  return list.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
}

/* ── Response helpers ──────────────────────────────────────────────────── */

function jsonError(message, status) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

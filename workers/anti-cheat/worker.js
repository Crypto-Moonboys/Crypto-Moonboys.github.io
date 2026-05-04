/**
 * Moonboys Anti-Cheat Worker
 *
 * Locked to the same UTC season/year timeline as the community leaderboard.
 * SEASON_EPOCH_MS and SEASON_LENGTH_MS must match leaderboard-worker.js exactly.
 *
 * Bindings required (wrangler.toml):
 *   DB          — D1 binding (wikicoms database, same as moonboys-api)
 *   LEADERBOARD — KV namespace (same as leaderboard-worker)
 *
 * Secrets (set via `wrangler secret put`):
 *   ADMIN_SECRET — required X-Admin-Secret header for all admin routes.
 *                  URL query parameter admin_secret is NOT accepted (would leak into logs).
 *
 * Cron trigger: "0 0 * * 0" — every Sunday at 00:00 UTC
 *
 * Routes:
 *   GET  /anticheat/health
 *   GET  /anticheat/status         ?telegram_id= | ?username=@...   (admin)
 *   POST /anticheat/scan           (admin — manual weekly scan trigger)
 *   POST /anticheat/unblock        { telegram_id | username }        (admin)
 *   POST /anticheat/block          { telegram_id | username, block_type?, reason } (admin)
 *   POST /anticheat/clear-strikes  { telegram_id | username }        (admin)
 *
 * KV keys written for fast leaderboard-worker lookups:
 *   anticheat:blocked:{telegram_id}  →  "season" | "year" | "lifetime"
 *   (key deleted on unblock)
 */

// ── Season / year constants — must match leaderboard-worker.js exactly ────────
/** Master epoch: 2024-01-01T00:00:00.000Z */
const SEASON_EPOCH_MS  = 1704067200000;
const SEASON_LENGTH_MS = 90 * 24 * 60 * 60 * 1000;

// ── Risk ceilings ─────────────────────────────────────────────────────────────
/** Reaching this season_risk_score triggers a block + strike. */
const SEASON_RISK_CEILING = 100;
/** Reaching this year_risk_score triggers a block + strike. */
const YEAR_RISK_CEILING   = 100;
/** Lifetime strikes required to escalate to a permanent ban. */
const MAX_STRIKES = 3;

/** Maximum length of an admin-supplied block reason string. */
const MAX_BLOCK_REASON_LENGTH = 255;

// ── Weekly risk-signal weights ────────────────────────────────────────────────
// Tiered scoring: first tier whose `min` the value meets wins (descending order).

/** XP gained in the 7-day scan window → added to season_risk_score. */
const XP_WEEK_TIERS = [
  { min: 1001, points: 60 },
  { min:  501, points: 30 },
  { min:  201, points: 10 },
];

/** XP gained in the 30-day scan window → added to year_risk_score. */
const XP_MONTH_TIERS = [
  { min: 2001, points: 30 },
  { min:  801, points: 10 },
];

/** telegram_activity_log entries in the 7-day window → season_risk_score. */
const ACTIVITY_WEEK_TIERS = [
  { min: 301, points: 40 },
  { min: 101, points: 15 },
];

/** telegram_quest_completions in the 7-day window → season_risk_score. */
const QUEST_WEEK_TIERS = [
  { min: 11, points: 50 },
  { min:  4, points: 20 },
];

// ── Shared helpers ────────────────────────────────────────────────────────────

const DEFAULT_CORS_ALLOWED_ORIGINS = [
  'https://cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
];

function buildCorsHeaders(request, env) {
  const origin = (request && request.headers) ? (request.headers.get('Origin') || '') : '';
  const allowed = env && env.CORS_ALLOWED_ORIGINS
    ? String(env.CORS_ALLOWED_ORIGINS).split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_CORS_ALLOWED_ORIGINS;
  const allowedOrigin = allowed.includes(origin) ? origin : (allowed[0] || 'null');
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  };
}

// Per-request CORS headers, set at the start of each fetch() invocation.
// Cloudflare Workers run each request in its own V8 isolate context, so there is no
// concurrent-request race condition — module-level state is request-scoped in practice.
// NOTE: Do not reuse this worker outside a Cloudflare Workers runtime without refactoring
// this to a parameter-passing pattern.
let CORS_HEADERS = buildCorsHeaders(null, null);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

function logAntiCheatFailure(event, context = {}) {
  console.log('[anti-cheat]', JSON.stringify({
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

// ── Season / year helpers (mirrors leaderboard-worker.js math exactly) ────────

function currentSeasonNumber(now = Date.now()) {
  return Math.floor((now - SEASON_EPOCH_MS) / SEASON_LENGTH_MS) + 1;
}

function currentSeasonStart(now = Date.now()) {
  const idx = Math.floor((now - SEASON_EPOCH_MS) / SEASON_LENGTH_MS);
  return SEASON_EPOCH_MS + idx * SEASON_LENGTH_MS;
}

function currentUtcYear(now = Date.now()) {
  return new Date(now).getUTCFullYear();
}

// ── Admin authorisation ───────────────────────────────────────────────────────
// Secrets must be passed via the X-Admin-Secret request header only.
// URL query parameter admin_secret is NOT accepted — query params are logged by
// proxies, CDNs, and browser history, which would expose the secret.

function isAdminAuthorised(request, env) {
  const secret = env.ADMIN_SECRET;
  if (!secret) {
    console.log('anti-cheat: ADMIN_SECRET is not configured — all admin routes are blocked');
    return false;
  }
  const header = request.headers.get('X-Admin-Secret');
  return header === secret;
}

// ── @username → telegram_id lookup ───────────────────────────────────────────

async function telegramIdByUsername(db, rawUsername) {
  const uname = String(rawUsername || '').replace(/^@/, '').trim();
  if (!uname) return null;
  const row = await db.prepare(
    `SELECT telegram_id FROM telegram_users WHERE username = ? LIMIT 1`
  ).bind(uname).first().catch(() => null);
  return row?.telegram_id || null;
}

/**
 * Resolve telegram_id from a params object.
 * Accepts { telegram_id } (canonical) or { username } (convenience).
 */
async function resolveId(db, params) {
  if (params.telegram_id) return String(params.telegram_id).trim() || null;
  if (params.username)    return telegramIdByUsername(db, params.username);
  return null;
}

// ── D1 anti-cheat state helpers ───────────────────────────────────────────────

async function getAntiCheatState(db, telegramId) {
  return db.prepare(
    `SELECT * FROM telegram_anticheat_state WHERE telegram_id = ?`
  ).bind(telegramId).first().catch(() => null);
}

async function saveAntiCheatState(db, state) {
  await db.prepare(`
    INSERT INTO telegram_anticheat_state
      (telegram_id, season_risk_score, year_risk_score, lifetime_strikes,
       is_blocked, block_type, blocked_reason, current_season_number, current_year,
       last_scan_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      season_risk_score     = excluded.season_risk_score,
      year_risk_score       = excluded.year_risk_score,
      lifetime_strikes      = excluded.lifetime_strikes,
      is_blocked            = excluded.is_blocked,
      block_type            = excluded.block_type,
      blocked_reason        = excluded.blocked_reason,
      current_season_number = excluded.current_season_number,
      current_year          = excluded.current_year,
      last_scan_at          = excluded.last_scan_at,
      updated_at            = excluded.updated_at
  `).bind(
    state.telegram_id,
    state.season_risk_score,
    state.year_risk_score,
    state.lifetime_strikes,
    state.is_blocked,
    state.block_type    || null,
    state.blocked_reason || null,
    state.current_season_number,
    state.current_year,
  ).run().catch((e) => {
    logAntiCheatFailure('save_state_failed', {
      telegramId: state.telegram_id,
      message: e?.message || String(e),
    });
  });
}

async function logAntiCheatEvent(db, telegramId, eventType, seasonNumber, year, riskDelta, metadata = '') {
  await db.prepare(`
    INSERT INTO telegram_anticheat_events
      (telegram_id, event_type, season_number, year, risk_delta, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    telegramId,
    eventType,
    seasonNumber || null,
    year         || null,
    riskDelta,
    metadata     || null,
  ).run().catch((error) => {
    logAntiCheatFailure('event_log_failed', {
      telegramId,
      eventType,
      message: error?.message || String(error),
    });
  });
}

// ── KV block-key helpers (fast lookup used by leaderboard-worker) ─────────────

function kvBlockKey(telegramId) {
  return `anticheat:blocked:${telegramId}`;
}

async function setKvBlock(env, telegramId, blockType) {
  await env.LEADERBOARD.put(kvBlockKey(telegramId), blockType).catch((error) => {
    logAntiCheatFailure('kv_block_set_failed', {
      telegramId,
      blockType,
      message: error?.message || String(error),
    });
  });
}

async function clearKvBlock(env, telegramId) {
  await env.LEADERBOARD.delete(kvBlockKey(telegramId)).catch((error) => {
    logAntiCheatFailure('kv_block_clear_failed', {
      telegramId,
      message: error?.message || String(error),
    });
  });
}

// ── Risk signal computation ───────────────────────────────────────────────────

/** Return points for value against an ordered tiers array (highest min first). */
function tieredScore(value, tiers) {
  for (const tier of tiers) {
    if (value >= tier.min) return tier.points;
  }
  return 0;
}

/**
 * Query D1 for the four risk signals covering the last 7 days (season bucket)
 * and last 30 days (year bucket), then return weighted risk deltas.
 */
async function computeRiskDeltas(db, telegramId, now) {
  const sevenDaysAgo  = new Date(now - 7  * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();

  const [xpWeek, xpMonth, activityWeek, questWeek] = await Promise.all([
    db.prepare(
      `SELECT COALESCE(SUM(xp_change), 0) AS total
       FROM telegram_xp_log
       WHERE telegram_id = ? AND created_at >= ?`
    ).bind(telegramId, sevenDaysAgo).first().catch(() => ({ total: 0 })),

    db.prepare(
      `SELECT COALESCE(SUM(xp_change), 0) AS total
       FROM telegram_xp_log
       WHERE telegram_id = ? AND created_at >= ?`
    ).bind(telegramId, thirtyDaysAgo).first().catch(() => ({ total: 0 })),

    db.prepare(
      `SELECT COUNT(*) AS n
       FROM telegram_activity_log
       WHERE telegram_id = ? AND created_at >= ?`
    ).bind(telegramId, sevenDaysAgo).first().catch(() => ({ n: 0 })),

    db.prepare(
      `SELECT COUNT(*) AS n
       FROM telegram_quest_completions
       WHERE telegram_id = ? AND completed_at >= ?`
    ).bind(telegramId, sevenDaysAgo).first().catch(() => ({ n: 0 })),
  ]);

  const xp7d      = Number(xpWeek?.total     || 0);
  const xp30d     = Number(xpMonth?.total    || 0);
  const activity7d = Number(activityWeek?.n  || 0);
  const quests7d  = Number(questWeek?.n      || 0);

  const seasonDelta =
    tieredScore(xp7d,      XP_WEEK_TIERS)      +
    tieredScore(activity7d, ACTIVITY_WEEK_TIERS) +
    tieredScore(quests7d,  QUEST_WEEK_TIERS);

  const yearDelta = tieredScore(xp30d, XP_MONTH_TIERS);

  return { seasonDelta, yearDelta, signals: { xp_7d: xp7d, xp_30d: xp30d, activity_7d: activity7d, quests_7d: quests7d } };
}

// ── Core per-user assessment ──────────────────────────────────────────────────

async function assessUser(env, telegramId, now) {
  const db   = env.DB;
  const sNum = currentSeasonNumber(now);
  const sYear = currentUtcYear(now);

  // Load existing state or build a fresh default
  const existing = await getAntiCheatState(db, telegramId);
  const state = {
    telegram_id:           telegramId,
    season_risk_score:     Number(existing?.season_risk_score     || 0),
    year_risk_score:       Number(existing?.year_risk_score       || 0),
    lifetime_strikes:      Number(existing?.lifetime_strikes      || 0),
    is_blocked:            Number(existing?.is_blocked            || 0),
    block_type:            existing?.block_type    || null,
    blocked_reason:        existing?.blocked_reason || null,
    current_season_number: Number(existing?.current_season_number || 0),
    current_year:          Number(existing?.current_year          || 0),
  };

  // ── Rollover resets — must mirror leaderboard-worker reset rules ─────────
  const seasonChanged = state.current_season_number !== sNum;
  const yearChanged   = state.current_year          !== sYear;

  if (yearChanged) {
    // New UTC year: reset both season and year risk buckets; season/year blocks are lifted.
    // Lifetime blocks are permanent and never auto-lifted on rollover.
    state.season_risk_score = 0;
    state.year_risk_score   = 0;
    // Lift season/year blocks on rollover; lifetime bans are never auto-lifted
    if (state.block_type === 'season' || state.block_type === 'year') {
      state.is_blocked     = 0;
      state.block_type     = null;
      state.blocked_reason = null;
      await clearKvBlock(env, telegramId);
    }
  } else if (seasonChanged) {
    // New 90-day season: reset only the season risk bucket; season blocks are lifted.
    state.season_risk_score = 0;
    if (state.block_type === 'season') {
      state.is_blocked     = 0;
      state.block_type     = null;
      state.blocked_reason = null;
      await clearKvBlock(env, telegramId);
    }
  }

  state.current_season_number = sNum;
  state.current_year          = sYear;

  // Lifetime-banned users: persist the updated rollover bookkeeping but skip
  // new risk accumulation — the ban is permanent and already in KV.
  if (state.block_type === 'lifetime') {
    await saveAntiCheatState(db, state);
    return;
  }

  // ── Accumulate risk from activity ────────────────────────────────────────
  const { seasonDelta, yearDelta, signals } = await computeRiskDeltas(db, telegramId, now);

  if (seasonDelta > 0) {
    state.season_risk_score += seasonDelta;
    await logAntiCheatEvent(db, telegramId, 'season_risk', sNum, sYear, seasonDelta,
      JSON.stringify(signals));
  }
  if (yearDelta > 0) {
    state.year_risk_score += yearDelta;
    await logAntiCheatEvent(db, telegramId, 'year_risk', sNum, sYear, yearDelta,
      JSON.stringify(signals));
  }

  // ── Ceiling checks — year ceiling takes priority over season ─────────────
  // Only act on a fresh breach (was not already blocked before this scan).
  const wasBlocked = state.is_blocked === 1;

  let freshBreach   = false;
  let newBlockType  = null;
  let newBlockReason = '';

  if (!wasBlocked) {
    if (state.season_risk_score >= SEASON_RISK_CEILING) {
      freshBreach    = true;
      newBlockType   = 'season';
      newBlockReason = `Season risk ceiling reached (score: ${state.season_risk_score})`;
    }
    if (state.year_risk_score >= YEAR_RISK_CEILING) {
      freshBreach    = true;
      newBlockType   = 'year';   // year breach takes priority
      newBlockReason = `Year risk ceiling reached (score: ${state.year_risk_score})`;
    }
  }

  if (freshBreach) {
    state.lifetime_strikes++;

    await logAntiCheatEvent(db, telegramId, 'ceiling_breach', sNum, sYear, 0,
      JSON.stringify({ block_type: newBlockType, strikes_after: state.lifetime_strikes }));

    // Auto-escalate to a lifetime ban once MAX_STRIKES is reached.
    if (state.lifetime_strikes >= MAX_STRIKES) {
      newBlockType   = 'lifetime';
      newBlockReason = `Lifetime ban: ${state.lifetime_strikes} strikes reached`;
    }

    state.is_blocked     = 1;
    state.block_type     = newBlockType;
    state.blocked_reason = newBlockReason;

    await setKvBlock(env, telegramId, newBlockType);
    await logAntiCheatEvent(db, telegramId, 'user_blocked', sNum, sYear, 0,
      JSON.stringify({ block_type: newBlockType, reason: newBlockReason }));
  }

  await saveAntiCheatState(db, state);
}

// ── Full weekly scan ──────────────────────────────────────────────────────────

async function weeklyAntiCheatScan(env) {
  const now = Date.now();
  console.log('anti-cheat: weekly scan started', new Date(now).toISOString(),
    `season=${currentSeasonNumber(now)} year=${currentUtcYear(now)}`);

  let offset    = 0;
  const batchSize = 50;
  let processed = 0;
  let errors    = 0;

  for (;;) {
    const rows = await env.DB.prepare(
      `SELECT telegram_id FROM telegram_users ORDER BY telegram_id LIMIT ? OFFSET ?`
    ).bind(batchSize, offset).all().catch((error) => {
      logAntiCheatFailure('scan_batch_fetch_failed', {
        offset,
        batchSize,
        message: error?.message || String(error),
      });
      return { results: [] };
    });

    const batch = rows.results || [];
    if (!batch.length) break;

    for (const row of batch) {
      await assessUser(env, row.telegram_id, now).catch((e) => {
        logAntiCheatFailure('assess_user_failed', {
          telegramId: row.telegram_id,
          message: e?.message || String(e),
        });
        errors++;
      });
      processed++;
    }

    offset += batchSize;
    if (batch.length < batchSize) break;
  }

  const summary = { processed, errors, scanned_at: new Date(now).toISOString() };
  console.log('anti-cheat: weekly scan complete', JSON.stringify(summary));
  return summary;
}

// ── Main export ───────────────────────────────────────────────────────────────

export default {
  // Cron trigger: "0 0 * * 0" — every Sunday 00:00 UTC
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(weeklyAntiCheatScan(env));
  },

  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    // Set per-request CORS headers reflecting the request's Origin.
    CORS_HEADERS = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── GET /anticheat/health ──────────────────────────────────────────────
    if (path === '/anticheat/health' && request.method === 'GET') {
      const now = Date.now();
      return json({
        ok:            true,
        season_number: currentSeasonNumber(now),
        year:          currentUtcYear(now),
        season_start:  new Date(currentSeasonStart(now)).toISOString(),
        epoch_anchor:  new Date(SEASON_EPOCH_MS).toISOString(),
        ceilings:      { season: SEASON_RISK_CEILING, year: YEAR_RISK_CEILING },
        max_strikes:   MAX_STRIKES,
      });
    }

    // ── GET /anticheat/status ──────────────────────────────────────────────
    // Admin: ?telegram_id=... or ?username=@...
    if (path === '/anticheat/status' && request.method === 'GET') {
      if (!isAdminAuthorised(request, env)) return err('Unauthorised', 401);

      const telegramId = await resolveId(env.DB, {
        telegram_id: url.searchParams.get('telegram_id'),
        username:    url.searchParams.get('username'),
      });
      if (!telegramId) return err('telegram_id or username required');

      const state = await getAntiCheatState(env.DB, telegramId);
      if (!state) {
        return json({ telegram_id: telegramId, state: null, message: 'No anti-cheat record yet' });
      }
      return json({ telegram_id: telegramId, state });
    }

    // ── POST /anticheat/scan ───────────────────────────────────────────────
    // Admin: manually trigger the weekly scan (useful for testing).
    if (path === '/anticheat/scan' && request.method === 'POST') {
      if (!isAdminAuthorised(request, env)) return err('Unauthorised', 401);
      const result = await weeklyAntiCheatScan(env).catch((e) => ({ error: e?.message || String(e) }));
      return json(result);
    }

    // ── POST /anticheat/unblock ────────────────────────────────────────────
    // Body: { telegram_id } or { username }
    if (path === '/anticheat/unblock' && request.method === 'POST') {
      if (!isAdminAuthorised(request, env)) return err('Unauthorised', 401);
      let body; try { body = await request.json(); } catch { return err('Invalid JSON'); }

      const telegramId = await resolveId(env.DB, body);
      if (!telegramId) return err('telegram_id or username required');

      await clearKvBlock(env, telegramId);
      await env.DB.prepare(`
        UPDATE telegram_anticheat_state
        SET is_blocked = 0, block_type = NULL, blocked_reason = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `).bind(telegramId).run().catch((error) => {
        logAntiCheatFailure('admin_unblock_state_write_failed', {
          telegramId,
          message: error?.message || String(error),
        });
      });

      const now = Date.now();
      await logAntiCheatEvent(env.DB, telegramId, 'admin_unblock',
        currentSeasonNumber(now), currentUtcYear(now), 0, 'Admin action');

      return json({ ok: true, telegram_id: telegramId });
    }

    // ── POST /anticheat/block ──────────────────────────────────────────────
    // Body: { telegram_id | username, block_type?: "season"|"year"|"lifetime", reason? }
    if (path === '/anticheat/block' && request.method === 'POST') {
      if (!isAdminAuthorised(request, env)) return err('Unauthorised', 401);
      let body; try { body = await request.json(); } catch { return err('Invalid JSON'); }

      const telegramId = await resolveId(env.DB, body);
      if (!telegramId) return err('telegram_id or username required');

      const blockType = ['season', 'year', 'lifetime'].includes(body.block_type)
        ? body.block_type : 'season';
      const reason = String(body.reason || 'Admin manual block').slice(0, MAX_BLOCK_REASON_LENGTH);

      const now   = Date.now();
      const sNum  = currentSeasonNumber(now);
      const sYear = currentUtcYear(now);

      await env.DB.prepare(`
        INSERT INTO telegram_anticheat_state
          (telegram_id, season_risk_score, year_risk_score, lifetime_strikes,
           is_blocked, block_type, blocked_reason, current_season_number, current_year)
        VALUES (?, 0, 0, 0, 1, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
          is_blocked     = 1,
          block_type     = excluded.block_type,
          blocked_reason = excluded.blocked_reason,
          updated_at     = CURRENT_TIMESTAMP
      `).bind(telegramId, blockType, reason, sNum, sYear).run().catch((error) => {
        logAntiCheatFailure('admin_block_state_write_failed', {
          telegramId,
          blockType,
          message: error?.message || String(error),
        });
      });

      await setKvBlock(env, telegramId, blockType);
      await logAntiCheatEvent(env.DB, telegramId, 'admin_block', sNum, sYear, 0,
        JSON.stringify({ block_type: blockType, reason }));

      return json({ ok: true, telegram_id: telegramId, block_type: blockType });
    }

    // ── POST /anticheat/clear-strikes ──────────────────────────────────────
    // Body: { telegram_id } or { username }
    if (path === '/anticheat/clear-strikes' && request.method === 'POST') {
      if (!isAdminAuthorised(request, env)) return err('Unauthorised', 401);
      let body; try { body = await request.json(); } catch { return err('Invalid JSON'); }

      const telegramId = await resolveId(env.DB, body);
      if (!telegramId) return err('telegram_id or username required');

      const now   = Date.now();
      const sNum  = currentSeasonNumber(now);
      const sYear = currentUtcYear(now);

      await env.DB.prepare(`
        INSERT INTO telegram_anticheat_state
          (telegram_id, season_risk_score, year_risk_score, lifetime_strikes,
           is_blocked, current_season_number, current_year)
        VALUES (?, 0, 0, 0, 0, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
          lifetime_strikes = 0,
          updated_at       = CURRENT_TIMESTAMP
      `).bind(telegramId, sNum, sYear).run().catch((error) => {
        logAntiCheatFailure('admin_clear_strikes_state_write_failed', {
          telegramId,
          message: error?.message || String(error),
        });
      });

      await logAntiCheatEvent(env.DB, telegramId, 'admin_clear_strikes', sNum, sYear, 0, 'Admin action');

      return json({ ok: true, telegram_id: telegramId });
    }

    return err('Not found', 404);
  },
};

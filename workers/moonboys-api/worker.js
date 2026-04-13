/**
 * Moonboys API — Cloudflare Worker entrypoint
 *
 * Handles community engagement endpoints backed by a D1 database (binding: DB).
 * Configure the D1 database ID in wrangler.toml before deploying.
 *
 * Routes (original — unchanged):
 *   GET  /health
 *   GET  /comments?page_id=&limit=
 *   POST /comments
 *   POST /comments/:id/vote
 *   GET  /comments/recent?limit=
 *   GET  /likes?page_id=
 *   POST /likes
 *   GET  /citation-votes?page_id=&cite_id=
 *   POST /citation-votes
 *   GET  /feed?limit=
 *   GET  /leaderboard?limit=
 *   GET  /activity/hot?limit=
 *   GET  /sam/status
 *   POST /telegram/auth
 *   POST /telegram/webhook
 *
 * New Telegram / community routes:
 *   GET  /telegram/profile?telegram_id=
 *   GET  /telegram/leaderboard?limit=
 *   GET  /telegram/quests
 *   POST /telegram/link
 *   GET  /telegram/link/confirm?token=
 *   GET  /telegram/activity?limit=
 *   GET  /telegram/daily-status?telegram_id=
 *   GET  /telegram/season/current
 *
 * Telegram bot commands (handled inside POST /telegram/webhook):
 *   GK commands: /gkstart /gkhelp /gklink /gkstatus /gkseason /gkleaderboard /gkquests /gkfaction /gkunlink
 *   Legacy aliases: /start → /gkstart   /help → /gkhelp   /link → /gklink
 *
 * Secrets required (set via `wrangler secret put`):
 *   TELEGRAM_BOT_TOKEN      — BotFather token for HMAC verification and sendMessage
 *   TELEGRAM_BOT_USERNAME   — @username (used in widget docs only)
 */

const MAX_NAME_LENGTH    = 60;
const MAX_COMMENT_LENGTH = 2000;
const MAX_TG_LENGTH      = 60;
const MAX_DISCORD_LENGTH = 60;
const MAX_AVATAR_URL_LEN = 500;

/** Maximum age (in seconds) of a Telegram Login Widget auth payload before it is rejected. */
const TELEGRAM_AUTH_MAX_AGE = 86400; // 24 hours

// ── XP rules ──────────────────────────────────────────────────────────────────
const XP_FIRST_START  = 50;
const XP_DAILY_CLAIM  = 20;
const XP_QUEST_SOLVE  = 0;  // per-quest value overrides this; default fallback
const XP_GROUP_JOIN   = 10;

// ── Season / year reset constants (mirrors leaderboard-worker.js) ─────────────
/** 90 days in milliseconds — same window as the arcade seasonal leaderboard. */
const TG_SEASON_LENGTH_MS = 90 * 24 * 60 * 60 * 1000;  // 7_776_000_000 ms
/** Top N entries snapshotted into each season/year archive. */
const TG_ARCHIVE_TOP_N    = 50;
/** Milliseconds in one day — used when computing days remaining in a season. */
const MS_PER_DAY          = 86400000;
/**
 * Master season epoch: 2024-01-01T00:00:00.000Z (Unix ms 1704067200000).
 * Both moonboys-api and leaderboard-worker derive the current season number
 * from this fixed anchor so their seasons are always in lockstep, even if the
 * workers were deployed at different times.
 */
const SEASON_EPOCH_MS = 1704067200000;

// Approved faction slugs (must match client-side list in battle-layer.js)
const APPROVED_FACTIONS = new Set([
  'diamond-hands',
  'hodl-warriors',
  'moon-mission',
  'graffpunks',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Shared utilities ──────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

/** Compute a hex SHA-256 digest of a string (used as Gravatar-style hash). */
async function sha256Hex(str) {
  const data   = new TextEncoder().encode(String(str || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

/** Return today's UTC date as a YYYY-MM-DD string. */
function getTodayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Return a display name for a Telegram user object from an update. */
function getTelegramDisplayName(user) {
  if (!user) return 'Unknown';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(user.id);
}

/**
 * Send a text message via the Telegram Bot API.
 * Never throws — failures are silently swallowed so the webhook always returns 200.
 */
async function sendTelegramMessage(botToken, chatId, text, extra = {}) {
  if (!botToken || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
    });
  } catch {
    // intentionally silent
  }
}

/**
 * Upsert a telegram_profiles row.
 * Sets last_seen_at on every call; only touches name/avatar on first insert or when provided.
 */
async function upsertTelegramProfile(db, user) {
  const telegramId  = String(user.id);
  const username    = user.username    || null;
  const displayName = getTelegramDisplayName(user);
  const avatarUrl   = user.photo_url   || null;

  await db.prepare(`
    INSERT INTO telegram_profiles (telegram_id, username, display_name, avatar_url, last_seen_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username     = excluded.username,
      display_name = excluded.display_name,
      avatar_url   = COALESCE(excluded.avatar_url, telegram_profiles.avatar_url),
      last_seen_at = CURRENT_TIMESTAMP
  `).bind(telegramId, username, displayName, avatarUrl).run();

  return telegramId;
}

/**
 * Award XP to a Telegram user.
 * Updates all three XP counters atomically and logs an immutable event row.
 * Anti-spam: enforced by callers (daily claim table, one-time event checks).
 */
async function awardXp(db, telegramId, xpDelta, eventType, source, sourceRef = '') {
  if (!xpDelta || xpDelta < 0) return;
  const eventId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO telegram_xp_events (id, telegram_id, event_type, xp_delta, source, source_ref)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(eventId, telegramId, eventType, xpDelta, source, sourceRef).run();

  await db.prepare(`
    UPDATE telegram_profiles
    SET xp_total    = xp_total    + ?,
        xp_seasonal = xp_seasonal + ?,
        xp_yearly   = xp_yearly   + ?
    WHERE telegram_id = ?
  `).bind(xpDelta, xpDelta, xpDelta, telegramId).run();
}

/**
 * Record an arbitrary group event for audit / future XP decisions.
 */
async function recordTelegramEvent(db, telegramId, chatId, eventType, payloadObj) {
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO telegram_group_events (id, telegram_id, chat_id, event_type, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, telegramId || null, chatId || null, eventType, JSON.stringify(payloadObj || {})).run().catch(() => {});
}

/**
 * Verify a quest answer.
 * Compares the SHA-256 hex of lowercased trimmed input against the stored hash.
 * Returns true if correct.
 */
async function verifyQuestAnswer(storedHash, rawAnswer) {
  if (!storedHash || !rawAnswer) return false;
  const h = await sha256Hex(String(rawAnswer).trim().toLowerCase());
  return h === storedHash;
}

// ── Telegram/community season & year reset engine ─────────────────────────────
// Mirrors the reset model used by leaderboard-worker.js:
//   • Seasonal reset every 90 days   → resets xp_seasonal, preserves xp_yearly + xp_total
//   • Yearly reset on New Year UTC   → closes current season, resets xp_yearly, preserves xp_total
//   • Lazy-checked — called at start of webhook handler and on season/leaderboard endpoints
//   • All resets archive top-N entries before wiping counters

/**
 * Read or initialise the single-row community season meta from D1.
 * Shape: { meta_key, season_start, season_number, year_start }
 *
 * Mirrors getOrInitMeta() from leaderboard-worker.js (but stored in D1, not KV).
 */
async function getTgMeta(db) {
  const row = await db.prepare(
    `SELECT meta_key, season_start, season_number, year_start
     FROM telegram_community_meta WHERE meta_key = 'current'`
  ).first().catch(() => null);

  if (row) return row;

  // Bootstrap from fixed epoch anchor — aligns with leaderboard-worker.js so
  // both workers always report the same current season number.
  const now         = new Date();
  const nowMs       = now.getTime();
  const seasonIdx   = Math.floor((nowMs - SEASON_EPOCH_MS) / TG_SEASON_LENGTH_MS);
  const seasonStart = new Date(SEASON_EPOCH_MS + seasonIdx * TG_SEASON_LENGTH_MS).toISOString();
  const yearStart   = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  await db.prepare(`
    INSERT OR IGNORE INTO telegram_community_meta
      (meta_key, season_start, season_number, year_start)
    VALUES ('current', ?, ?, ?)
  `).bind(seasonStart, seasonIdx + 1, yearStart).run().catch(() => {});
  return { meta_key: 'current', season_start: seasonStart, season_number: seasonIdx + 1, year_start: yearStart };
}

/**
 * Lazy-checked reset entry-point — call at the top of any Telegram-facing handler.
 *
 * Mirrors checkAndRunResets() from leaderboard-worker.js:
 *   • Yearly reset takes priority (it also closes out the current season).
 *   • Otherwise check for a 90-day seasonal reset.
 */
async function checkAndRunTgResets(db) {
  let meta;
  try { meta = await getTgMeta(db); } catch { return; }

  const now         = Date.now();
  const currentYear = new Date(now).getUTCFullYear();
  const metaYear    = new Date(meta.year_start).getUTCFullYear();

  if (currentYear > metaYear) {
    await runTgYearlyReset(db, meta, now).catch(() => {});
    return;
  }

  const seasonStart = new Date(meta.season_start).getTime();
  if (now - seasonStart >= TG_SEASON_LENGTH_MS) {
    await runTgSeasonalReset(db, meta, now).catch(() => {});
  }
}

/**
 * Seasonal reset (every 90 days).
 * Mirrors runSeasonalReset() from leaderboard-worker.js.
 *
 *  1. Snapshot top TG_ARCHIVE_TOP_N seasonal XP holders → telegram_season_archives
 *  2. Reset xp_seasonal = 0 for all profiles
 *  3. Advance season_start and season_number in telegram_community_meta
 *
 * xp_total and xp_yearly are never touched.
 */
async function runTgSeasonalReset(db, meta, now) {
  const nowIso = new Date(now).toISOString();

  // 1. Snapshot top seasonal earners before zeroing them
  const topRows = await db.prepare(
    `SELECT telegram_id, username, display_name, faction, xp_seasonal
     FROM telegram_profiles
     ORDER BY xp_seasonal DESC
     LIMIT ?`
  ).bind(TG_ARCHIVE_TOP_N).all().catch(() => ({ results: [] }));

  const topEntries = (topRows.results || []).map((r, i) => ({
    rank:         i + 1,
    telegram_id:  r.telegram_id,
    username:     r.username     || null,
    display_name: r.display_name || null,
    faction:      r.faction      || '',
    xp_seasonal:  r.xp_seasonal  || 0,
  }));

  // 2. Write season archive
  await db.prepare(`
    INSERT OR REPLACE INTO telegram_season_archives
      (season_number, season_start, season_end, top_entries_json)
    VALUES (?, ?, ?, ?)
  `).bind(meta.season_number, meta.season_start, nowIso, JSON.stringify(topEntries)).run().catch(() => {});

  // 3. Reset xp_seasonal (xp_total + xp_yearly untouched)
  await db.prepare(`UPDATE telegram_profiles SET xp_seasonal = 0`).run().catch(() => {});

  // 4. Advance season meta
  await db.prepare(`
    UPDATE telegram_community_meta
    SET season_start  = ?,
        season_number = ?,
        updated_at    = CURRENT_TIMESTAMP
    WHERE meta_key = 'current'
  `).bind(nowIso, meta.season_number + 1).run().catch(() => {});
}

/**
 * Yearly reset (on New Year UTC).
 * Mirrors runYearlyReset() from leaderboard-worker.js.
 *
 *  1. Close the current season (archive xp_seasonal + reset xp_seasonal)
 *  2. Snapshot top TG_ARCHIVE_TOP_N yearly XP holders → telegram_year_archives
 *  3. Reset xp_yearly = 0 for all profiles
 *  4. Advance year_start in telegram_community_meta
 *     (season_number was already advanced by step 1)
 *
 * xp_total is never reset.
 */
async function runTgYearlyReset(db, meta, now) {
  const nowIso      = new Date(now).toISOString();
  const currentYear = new Date(now).getUTCFullYear();
  const prevYear    = new Date(meta.year_start).getUTCFullYear();

  // 1. Close current season (seasonal archive + reset xp_seasonal + advance season_number)
  await runTgSeasonalReset(db, meta, now);

  // 2. Snapshot top yearly earners (xp_yearly unaffected by seasonal reset)
  const topRows = await db.prepare(
    `SELECT telegram_id, username, display_name, faction, xp_yearly
     FROM telegram_profiles
     ORDER BY xp_yearly DESC
     LIMIT ?`
  ).bind(TG_ARCHIVE_TOP_N).all().catch(() => ({ results: [] }));

  const topEntries = (topRows.results || []).map((r, i) => ({
    rank:         i + 1,
    telegram_id:  r.telegram_id,
    username:     r.username     || null,
    display_name: r.display_name || null,
    faction:      r.faction      || '',
    xp_yearly:    r.xp_yearly    || 0,
  }));

  // 3. Archive yearly winners
  await db.prepare(`
    INSERT OR REPLACE INTO telegram_year_archives
      (year, year_start, year_end, top_entries_json)
    VALUES (?, ?, ?, ?)
  `).bind(prevYear, meta.year_start, nowIso, JSON.stringify(topEntries)).run().catch(() => {});

  // 4. Reset xp_yearly (xp_total untouched)
  await db.prepare(`UPDATE telegram_profiles SET xp_yearly = 0`).run().catch(() => {});

  // 5. Advance year_start in meta (season was already advanced in step 1)
  await db.prepare(`
    UPDATE telegram_community_meta
    SET year_start  = ?,
        updated_at  = CURRENT_TIMESTAMP
    WHERE meta_key = 'current'
  `).bind(new Date(Date.UTC(currentYear, 0, 1)).toISOString()).run().catch(() => {});
}

/** Helper: compute days remaining in the current 90-day season. */
function tgSeasonDaysRemaining(seasonStartIso) {
  const elapsed = Date.now() - new Date(seasonStartIso).getTime();
  return Math.max(0, Math.ceil((TG_SEASON_LENGTH_MS - elapsed) / MS_PER_DAY));
}

/**
 * Verify a Telegram Login Widget auth payload against the bot token.
 * Algorithm: https://core.telegram.org/widgets/login#checking-authorization
 *   secret_key  = SHA256(bot_token)
 *   check_string = sorted "key=value" pairs (excl. hash) joined by "\n"
 *   expected_hash = HMAC-SHA256(check_string, secret_key)
 */
async function verifyTelegramAuth(data, botToken) {
  if (!botToken || !data || !data.hash) return false;
  const { hash, ...fields } = data;
  // Build sorted data-check-string, omitting null/undefined fields
  const checkString = Object.keys(fields)
    .filter(k => fields[k] != null)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n');
  // secret_key = SHA256(bot_token)
  const secretKeyBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(botToken),
  );
  // Import as HMAC-SHA256 signing key
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  // Sign the data-check-string
  const sigBytes = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(checkString));
  const sig = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  return sig === hash;
}

/** Format a SQLite datetime string to a human-readable "N time ago" label. */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs  = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60)   return 'just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
  return Math.floor(diffSec / 86400) + 'd ago';
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── GET /health ────────────────────────────────────────────────────────
    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true });
    }

    // ── SAM status stub (no DB needed) ─────────────────────────────────────
    if (path === '/sam/status' && request.method === 'GET') {
      return json({ ok: true, message: 'SAM active and monitoring the wiki.' });
    }

    // ── GET /comments?page_id=&limit= ──────────────────────────────────────
    if (path === '/comments' && request.method === 'GET') {
      const pageId = url.searchParams.get('page_id');
      if (!pageId) return err('page_id required');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      try {
        const rows = await env.DB.prepare(
          `SELECT c.id, c.page_id, c.name, c.email_hash, c.telegram_username,
                  c.discord_username, c.avatar_url,
                  c.text, c.created_at,
                  COALESCE(SUM(CASE WHEN v.vote='up'   THEN 1 ELSE 0 END),0) AS votes_up,
                  COALESCE(SUM(CASE WHEN v.vote='down' THEN 1 ELSE 0 END),0) AS votes_down
           FROM comments c
           LEFT JOIN votes v ON v.comment_id = c.id
           WHERE c.page_id = ? AND c.approved = 1
           GROUP BY c.id
           ORDER BY c.created_at DESC
           LIMIT ?`
        ).bind(pageId, limit).all();
        const comments = (rows.results || []).map(r => ({
          ...r,
          time_ago: timeAgo(r.created_at),
        }));
        return json({ comments });
      } catch {
        return err('Failed to load comments', 500);
      }
    }

    // ── POST /comments ─────────────────────────────────────────────────────
    if (path === '/comments' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id, name, text, email, telegram_username, discord_username, avatar_url } = body || {};
      if (!page_id || !name || !text) return err('page_id, name, and text required');
      if (!email) return err('email is required');
      const id         = crypto.randomUUID();
      const safeName   = String(name).trim().slice(0, MAX_NAME_LENGTH);
      const safeText   = String(text).trim().slice(0, MAX_COMMENT_LENGTH);
      const safeTg     = String(telegram_username || '').trim().slice(0, MAX_TG_LENGTH);
      const safeDiscord = String(discord_username || '').trim().slice(0, MAX_DISCORD_LENGTH);
      const safeAvatar  = String(avatar_url || '').trim().slice(0, MAX_AVATAR_URL_LEN);
      const emailHash  = await sha256Hex(email);
      try {
        await env.DB.prepare(
          `INSERT INTO comments (id, page_id, name, email_hash, telegram_username, discord_username, avatar_url, text, approved)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
        ).bind(id, page_id, safeName, emailHash, safeTg, safeDiscord, safeAvatar, safeText).run();
      } catch {
        return err('Failed to save comment', 500);
      }
      return json({ id, status: 'pending_moderation' }, 201);
    }

    // ── POST /comments/:id/vote ────────────────────────────────────────────
    const commentVoteMatch = path.match(/^\/comments\/([^/]+)\/vote$/);
    if (commentVoteMatch && request.method === 'POST') {
      const commentId = commentVoteMatch[1];
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { vote, telegram_id } = body || {};
      if (!['up', 'down'].includes(vote)) return err('vote must be "up" or "down"');
      // Competitive action — requires a Telegram-synced identity
      if (!telegram_id || !String(telegram_id).trim()) {
        return err('telegram_sync_required', 403);
      }
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          'INSERT INTO votes (id, comment_id, vote) VALUES (?, ?, ?)'
        ).bind(id, commentId, vote).run();
      } catch {
        return err('Failed to record vote', 500);
      }
      return json({ id }, 201);
    }

    // ── GET /comments/recent?limit= ────────────────────────────────────────
    if (path === '/comments/recent' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);
      try {
        const rows = await env.DB.prepare(
          `SELECT id, page_id, name, email_hash, telegram_username, discord_username, avatar_url, text, created_at
           FROM comments
           WHERE approved = 1
           ORDER BY created_at DESC
           LIMIT ?`
        ).bind(limit).all();
        const comments = (rows.results || []).map(r => ({
          ...r,
          time_ago: timeAgo(r.created_at),
        }));
        return json({ comments });
      } catch {
        return err('Failed to load recent comments', 500);
      }
    }

    // ── GET /likes?page_id= ────────────────────────────────────────────────
    if (path === '/likes' && request.method === 'GET') {
      const pageId = url.searchParams.get('page_id');
      if (!pageId) return err('page_id required');
      try {
        const row = await env.DB.prepare(
          'SELECT COUNT(*) AS count FROM page_likes WHERE page_id = ?'
        ).bind(pageId).first();
        return json({ page_id: pageId, count: row ? (row.count || 0) : 0 });
      } catch {
        return err('Failed to load likes', 500);
      }
    }

    // ── POST /likes ────────────────────────────────────────────────────────
    if (path === '/likes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id, telegram_id } = body || {};
      if (!page_id) return err('page_id required');
      // Competitive action — requires a Telegram-synced identity
      if (!telegram_id || !String(telegram_id).trim()) {
        return err('telegram_sync_required', 403);
      }
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          'INSERT INTO page_likes (id, page_id) VALUES (?, ?)'
        ).bind(id, page_id).run();
        const row = await env.DB.prepare(
          'SELECT COUNT(*) AS count FROM page_likes WHERE page_id = ?'
        ).bind(page_id).first();
        return json({ id, count: row ? (row.count || 1) : 1 }, 201);
      } catch {
        return err('Failed to record like', 500);
      }
    }

    // ── GET /citation-votes?page_id=&cite_id= ─────────────────────────────
    if (path === '/citation-votes' && request.method === 'GET') {
      const pageId = url.searchParams.get('page_id');
      const citeId = url.searchParams.get('cite_id');
      if (!pageId || !citeId) return err('page_id and cite_id required');
      try {
        const row = await env.DB.prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN vote='up'   THEN 1 ELSE 0 END),0) -
             COALESCE(SUM(CASE WHEN vote='down' THEN 1 ELSE 0 END),0) AS score
           FROM citation_votes
           WHERE page_id = ? AND cite_id = ?`
        ).bind(pageId, citeId).first();
        return json({ page_id: pageId, cite_id: citeId, score: row ? (row.score || 0) : 0 });
      } catch {
        return err('Failed to load citation votes', 500);
      }
    }

    // ── POST /citation-votes ───────────────────────────────────────────────
    if (path === '/citation-votes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { page_id, cite_id, vote, telegram_id } = body || {};
      if (!page_id || !cite_id || !['up', 'down'].includes(vote)) {
        return err('page_id, cite_id, and vote (up|down) required');
      }
      // Competitive action — requires a Telegram-synced identity
      if (!telegram_id || !String(telegram_id).trim()) {
        return err('telegram_sync_required', 403);
      }
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          'INSERT INTO citation_votes (id, page_id, cite_id, vote) VALUES (?, ?, ?, ?)'
        ).bind(id, page_id, String(cite_id), vote).run();
        const row = await env.DB.prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN vote='up'   THEN 1 ELSE 0 END),0) -
             COALESCE(SUM(CASE WHEN vote='down' THEN 1 ELSE 0 END),0) AS score
           FROM citation_votes
           WHERE page_id = ? AND cite_id = ?`
        ).bind(page_id, String(cite_id)).first();
        return json({ id, score: row ? (row.score || 0) : 0 }, 201);
      } catch {
        return err('Failed to record citation vote', 500);
      }
    }

    // ── GET /feed?limit= ──────────────────────────────────────────────────
    if (path === '/feed' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);
      try {
        // Blend recent comments and page likes into a unified activity feed
        const commentRows = await env.DB.prepare(
          `SELECT 'comment' AS type, name, page_id, created_at FROM comments
           WHERE approved = 1 ORDER BY created_at DESC LIMIT ?`
        ).bind(limit).all();
        const likeRows = await env.DB.prepare(
          `SELECT 'like' AS type, '' AS name, page_id, created_at FROM page_likes
           ORDER BY created_at DESC LIMIT ?`
        ).bind(limit).all();

        const combined = [
          ...(commentRows.results || []),
          ...(likeRows.results || []),
        ].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        ).slice(0, limit);

        const items = combined.map(r => ({
          icon:     r.type === 'comment' ? '💬' : '❤️',
          text:     r.type === 'comment'
            ? `${r.name || 'Someone'} commented on ${r.page_id}`
            : `Someone liked ${r.page_id}`,
          time_ago: timeAgo(r.created_at),
        }));
        return json({ items });
      } catch {
        return err('Failed to load feed', 500);
      }
    }

    // ── GET /leaderboard?limit= ────────────────────────────────────────────
    // Ranks commenters by number of approved comments (engagement leaderboard).
    if (path === '/leaderboard' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
      try {
        const rows = await env.DB.prepare(
          `SELECT name, email_hash, COUNT(*) AS score
           FROM comments
           WHERE approved = 1
           GROUP BY LOWER(name)
           ORDER BY score DESC
           LIMIT ?`
        ).bind(limit).all();
        const entries = (rows.results || []).map(r => ({
          name:       r.name,
          email_hash: r.email_hash || '',
          score:      r.score || 0,
        }));
        return json({ entries });
      } catch {
        return err('Failed to load leaderboard', 500);
      }
    }

    // ── GET /activity/hot?limit= ───────────────────────────────────────────
    // Returns pages with most recent engagement (comments + likes combined).
    if (path === '/activity/hot' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);
      try {
        const commentActivity = await env.DB.prepare(
          `SELECT page_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
           FROM comments WHERE approved = 1
           GROUP BY page_id`
        ).all();
        const likeActivity = await env.DB.prepare(
          `SELECT page_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
           FROM page_likes
           GROUP BY page_id`
        ).all();

        // Merge: sum counts per page_id
        const pageMap = {};
        for (const r of [...(commentActivity.results || []), ...(likeActivity.results || [])]) {
          if (!pageMap[r.page_id]) {
            pageMap[r.page_id] = { views: 0, last_at: r.last_at };
          }
          pageMap[r.page_id].views += r.cnt || 0;
          if (new Date(r.last_at) > new Date(pageMap[r.page_id].last_at)) {
            pageMap[r.page_id].last_at = r.last_at;
          }
        }

        const pages = Object.entries(pageMap)
          .sort((a, b) => b[1].views - a[1].views)
          .slice(0, limit)
          .map(([page_id, data]) => ({
            url:   `/wiki/${page_id}.html`,
            title: page_id.replace(/-/g, ' '),
            icon:  '🔥',
            views: data.views,
          }));
        return json({ pages });
      } catch {
        return err('Failed to load activity', 500);
      }
    }

    // ── POST /telegram/auth ────────────────────────────────────────────────
    // Accepts the Telegram Login Widget payload, verifies the HMAC signature,
    // and returns a normalised identity object (never exposes the bot token).
    if (path === '/telegram/auth' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { id, first_name, last_name, username, photo_url, auth_date, hash } = body || {};

      if (!id || !auth_date || !hash) {
        return err('Missing required Telegram auth fields');
      }

      // Reject stale payloads (older than TELEGRAM_AUTH_MAX_AGE)
      const now = Math.floor(Date.now() / 1000);
      if (now - parseInt(auth_date, 10) > TELEGRAM_AUTH_MAX_AGE) {
        return err('Telegram auth data has expired', 401);
      }

      // Verify HMAC signature using the secret bot token
      const valid = await verifyTelegramAuth(
        { id, first_name, last_name, username, photo_url, auth_date, hash },
        env.TELEGRAM_BOT_TOKEN,
      );
      if (!valid) {
        return err('Telegram auth verification failed', 401);
      }

      // Build normalised identity — safe to return to the frontend
      const displayName = [first_name, last_name].filter(Boolean).join(' ') || username || String(id);
      return json({
        ok: true,
        identity: {
          telegram_id:       String(id),
          telegram_username: username   || null,
          display_name:      displayName,
          avatar_url:        photo_url  || null,
        },
      });
    }

    // ── POST /telegram/webhook ─────────────────────────────────────────────
    // Endpoint for Telegram Bot API webhook delivery.
    // Always returns 200 OK so Telegram stops retrying regardless of errors.
    if (path === '/telegram/webhook' && request.method === 'POST') {
      const update = await request.json().catch(() => null);
      if (update) {
        await handleTelegramUpdate(update, env).catch(() => {});
      }
      return json({ ok: true });
    }

    // ── GET /telegram/profile?telegram_id= ────────────────────────────────
    if (path === '/telegram/profile' && request.method === 'GET') {
      await checkAndRunTgResets(env.DB).catch(() => {});
      const telegramId = url.searchParams.get('telegram_id');
      if (!telegramId) return err('telegram_id required');
      try {
        const row = await env.DB.prepare(
          `SELECT telegram_id, username, display_name, avatar_url, faction,
                  xp_total, xp_seasonal, xp_yearly, last_seen_at, created_at,
                  linked_email_hash
           FROM telegram_profiles WHERE telegram_id = ?`
        ).bind(telegramId).first();
        if (!row) return err('Profile not found', 404);
        return json({ profile: row });
      } catch {
        return err('Failed to load profile', 500);
      }
    }

    // ── GET /telegram/leaderboard?limit= ──────────────────────────────────
    // Community XP leaderboard — separate from arcade score leaderboard.
    // Also triggers a lazy reset check.
    if (path === '/telegram/leaderboard' && request.method === 'GET') {
      await checkAndRunTgResets(env.DB).catch(() => {});
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
      try {
        const [rows, meta] = await Promise.all([
          env.DB.prepare(
            `SELECT telegram_id, username, display_name, avatar_url, faction,
                    xp_total, xp_seasonal, xp_yearly, linked_email_hash
             FROM telegram_profiles
             ORDER BY xp_total DESC
             LIMIT ?`
          ).bind(limit).all(),
          getTgMeta(env.DB),
        ]);
        const entries = (rows.results || []).map((r, i) => ({ ...r, rank: i + 1 }));
        return json({
          type:             'community_xp',
          season_number:    meta.season_number,
          season_days_left: tgSeasonDaysRemaining(meta.season_start),
          year:             new Date().getUTCFullYear(),
          entries,
        });
      } catch {
        return err('Failed to load leaderboard', 500);
      }
    }

    // ── GET /telegram/quests ──────────────────────────────────────────────
    // Returns active quests (never exposes answer_hash).
    if (path === '/telegram/quests' && request.method === 'GET') {
      try {
        const now = new Date().toISOString();
        const rows = await env.DB.prepare(
          `SELECT id, slug, title, description, quest_type, xp_reward, starts_at, ends_at
           FROM telegram_quests
           WHERE is_active = 1
             AND (starts_at IS NULL OR starts_at <= ?)
             AND (ends_at IS NULL OR ends_at >= ?)
           ORDER BY created_at DESC`
        ).bind(now, now).all();
        return json({ quests: rows.results || [] });
      } catch {
        return err('Failed to load quests', 500);
      }
    }

    // ── POST /telegram/link ────────────────────────────────────────────────
    // Link a Telegram identity to a website identity via email_hash.
    // Body: { telegram_id, email }
    if (path === '/telegram/link' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { telegram_id, email } = body || {};
      if (!telegram_id || !email) return err('telegram_id and email required');
      const emailHash = await sha256Hex(email);
      try {
        await env.DB.prepare(
          `UPDATE telegram_profiles SET linked_email_hash = ? WHERE telegram_id = ?`
        ).bind(emailHash, String(telegram_id)).run();
        return json({ ok: true, linked_email_hash: emailHash });
      } catch {
        return err('Failed to link identity', 500);
      }
    }

    // ── GET /telegram/link/confirm?token= ─────────────────────────────────
    // Validates a one-time /gklink token and marks the Telegram user as linked.
    // Called by the website when the user arrives via the /gklink deep-link URL.
    if (path === '/telegram/link/confirm' && request.method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return err('token required');
      const now = new Date().toISOString();
      try {
        const row = await env.DB.prepare(
          `SELECT telegram_id FROM telegram_link_tokens
           WHERE token = ? AND used = 0 AND expires_at > ?`
        ).bind(token, now).first();
        if (!row) return err('Invalid or expired link token', 410);

        // Mark token as used and confirm the link in one batch
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE telegram_link_tokens SET used = 1 WHERE token = ?`
          ).bind(token),
          env.DB.prepare(
            `UPDATE telegram_profiles SET link_confirmed = 1 WHERE telegram_id = ?`
          ).bind(row.telegram_id),
        ]);

        return json({ ok: true, telegram_id: row.telegram_id });
      } catch {
        return err('Failed to confirm link token', 500);
      }
    }

    // ── GET /telegram/activity?limit= ─────────────────────────────────────
    // Recent XP events for community activity feed.
    if (path === '/telegram/activity' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
      try {
        const rows = await env.DB.prepare(
          `SELECT e.event_type, e.xp_delta, e.source, e.created_at,
                  p.display_name, p.username
           FROM telegram_xp_events e
           LEFT JOIN telegram_profiles p ON p.telegram_id = e.telegram_id
           ORDER BY e.created_at DESC
           LIMIT ?`
        ).bind(limit).all();
        const items = (rows.results || []).map(r => ({
          icon:     '⚡',
          text:     `${r.display_name || r.username || 'A moonboy'} earned ${r.xp_delta} XP (${r.event_type})`,
          time_ago: timeAgo(r.created_at),
        }));
        return json({ items });
      } catch {
        return err('Failed to load activity', 500);
      }
    }

    // ── GET /telegram/daily-status?telegram_id= ───────────────────────────
    // Returns whether the user has claimed their daily XP today.
    if (path === '/telegram/daily-status' && request.method === 'GET') {
      const telegramId = url.searchParams.get('telegram_id');
      if (!telegramId) return err('telegram_id required');
      const today = getTodayUtcDate();
      try {
        const row = await env.DB.prepare(
          `SELECT telegram_id FROM telegram_daily_claims WHERE telegram_id = ? AND claim_date = ?`
        ).bind(telegramId, today).first();
        return json({ claimed: !!row, date: today });
      } catch {
        return err('Failed to check daily status', 500);
      }
    }

    // ── GET /telegram/season/current ──────────────────────────────────────
    // Returns current season and year info for the Telegram/community XP system.
    // Also triggers a lazy reset check — mirrors the arcade leaderboard model.
    if (path === '/telegram/season/current' && request.method === 'GET') {
      await checkAndRunTgResets(env.DB).catch(() => {});
      try {
        const meta = await getTgMeta(env.DB);
        const daysRemaining = tgSeasonDaysRemaining(meta.season_start);
        const currentYear   = new Date().getUTCFullYear();
        return json({
          season_number:    meta.season_number,
          season_start:     meta.season_start,
          season_days_left: daysRemaining,
          year:             currentYear,
          year_start:       meta.year_start,
          reset_model:      '90-day seasonal + New Year yearly (matches arcade leaderboard)',
        });
      } catch {
        return err('Failed to load season info', 500);
      }
    }

    return err('Not found', 404);
  },
};

// ── Telegram bot command handler ──────────────────────────────────────────────

async function handleTelegramUpdate(update, env) {
  const db  = env.DB;
  const tok = env.TELEGRAM_BOT_TOKEN;

  // Lazy reset check — runs at start of every webhook update (mirrors arcade model)
  await checkAndRunTgResets(db).catch(() => {});

  // ── Group-level events ───────────────────────────────────────────────────
  const msg = update.message || update.edited_message;

  // New chat members
  if (msg?.new_chat_members) {
    for (const member of msg.new_chat_members) {
      const telegramId = String(member.id);
      await upsertTelegramProfile(db, member);
      await recordTelegramEvent(db, telegramId, String(msg.chat?.id || ''), 'chat_join', { member });
      // Award XP once for joining (checked via group_events count to avoid dupes)
      const prior = await db.prepare(
        `SELECT id FROM telegram_xp_events WHERE telegram_id = ? AND event_type = 'group_join' LIMIT 1`
      ).bind(telegramId).first().catch(() => null);
      if (!prior) {
        await awardXp(db, telegramId, XP_GROUP_JOIN, 'group_join', 'telegram_group');
      }
    }
    return;
  }

  // Chat join requests
  if (update.chat_join_request) {
    const user = update.chat_join_request.from;
    if (user) {
      await recordTelegramEvent(db, String(user.id), String(update.chat_join_request.chat?.id || ''), 'chat_join_request', {});
    }
    return;
  }

  // Poll answers
  if (update.poll_answer) {
    const pa = update.poll_answer;
    await recordTelegramEvent(db, String(pa.user?.id || ''), null, 'poll_answer', { poll_id: pa.poll_id });
    return;
  }

  // ── Private / group message commands ─────────────────────────────────────
  if (!msg?.text) return;

  const chatId     = String(msg.chat?.id || '');
  const fromUser   = msg.from || {};
  const telegramId = String(fromUser.id || '');
  const text       = (msg.text || '').trim();

  // Upsert profile so every interaction keeps profile fresh
  if (telegramId) await upsertTelegramProfile(db, fromUser);

  // Only handle commands (messages starting with /)
  if (!text.startsWith('/')) return;

  const spaceIdx   = text.indexOf(' ');
  const rawCmd     = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
  const cmdBase    = rawCmd.split('@')[0].toLowerCase(); // strip @botname suffix
  const argStr     = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();

  switch (cmdBase) {
    // ── GK command set ────────────────────────────────────────────────────
    case 'gkstart':      await cmdGkStart(db, tok, chatId, telegramId, fromUser);       break;
    case 'gkhelp':       await cmdGkHelp(tok, chatId);                                  break;
    case 'gklink':       await cmdGkLink(db, tok, chatId, telegramId);                  break;
    case 'gkstatus':     await cmdGkStatus(db, tok, chatId, telegramId);                break;
    case 'gkseason':     await cmdGkSeason(db, tok, chatId);                            break;
    case 'gkleaderboard': await cmdGkLeaderboard(db, tok, chatId);                      break;
    case 'gkquests':     await cmdGkQuests(db, tok, chatId);                            break;
    case 'gkfaction':    await cmdGkFaction(db, tok, chatId, telegramId, argStr);       break;
    case 'gkunlink':     await cmdGkUnlink(db, tok, chatId, telegramId);                break;
    // ── Legacy aliases ────────────────────────────────────────────────────
    case 'start':        await cmdGkStart(db, tok, chatId, telegramId, fromUser);       break;
    case 'help':         await cmdGkHelp(tok, chatId);                                  break;
    case 'link':         await cmdGkLink(db, tok, chatId, telegramId);                  break;
    // ── Legacy standalone commands (kept for backward compat) ─────────────
    case 'xp':           await cmdXp(db, tok, chatId, telegramId);                      break;
    case 'leaderboard':  await cmdLeaderboard(db, tok, chatId);                         break;
    case 'profile':      await cmdProfile(db, tok, chatId, telegramId);                 break;
    case 'daily':        await cmdDaily(db, tok, chatId, telegramId);                   break;
    case 'quest':        await cmdQuest(db, tok, chatId);                               break;
    case 'solve':        await cmdSolve(db, tok, chatId, telegramId, argStr);           break;
    case 'faction':      await cmdFaction(db, tok, chatId, telegramId, argStr);         break;
    default: break;
  }
}

// ── GK command implementations ────────────────────────────────────────────────

const SITE_URL = 'https://crypto-moonboys.github.io';

async function cmdGkStart(db, tok, chatId, telegramId, fromUser) {
  // Award first-start XP exactly once
  const prior = await db.prepare(
    `SELECT id FROM telegram_xp_events WHERE telegram_id = ? AND event_type = 'first_start' LIMIT 1`
  ).bind(telegramId).first().catch(() => null);

  let xpMsg = '';
  if (!prior) {
    await awardXp(db, telegramId, XP_FIRST_START, 'first_start', 'bot_command');
    xpMsg = `\n\n⚡ You earned <b>${XP_FIRST_START} XP</b> for your first launch!`;
  }

  const name = getTelegramDisplayName(fromUser);
  await sendTelegramMessage(tok, chatId,
    `🚀 <b>Welcome to Crypto Moonboys GK, ${escapeHtml(name)}!</b>\n\n` +
    `You've entered the Battle Chamber.\n\n` +
    `<b>What to do next:</b>\n` +
    `⚔️ /gklink — Link your account to the website\n` +
    `📊 /gkstatus — View your season stats\n` +
    `🏆 /gkleaderboard — Community leaderboard\n` +
    `🗺️ /gkquests — Active missions\n` +
    `⚔️ /gkfaction — Join or view your faction\n` +
    `❓ /gkhelp — Full command list${xpMsg}`
  );
}

async function cmdGkHelp(tok, chatId) {
  await sendTelegramMessage(tok, chatId,
    `📖 <b>Moonboys GK Commands</b>\n\n` +
    `/gkstart — Start and register\n` +
    `/gklink — Link account to website\n` +
    `/gkstatus — Season stats\n` +
    `/gkseason — Season info\n` +
    `/gkleaderboard — Leaderboard\n` +
    `/gkquests — Missions\n` +
    `/gkfaction — Faction\n` +
    `/gkunlink — Unlink account\n` +
    `/gkhelp — Help\n\n` +
    `<i>Legacy: /start /help /link are still supported.</i>`
  );
}

async function cmdGkLink(db, tok, chatId, telegramId) {
  if (!telegramId) {
    await sendTelegramMessage(tok, chatId, '❓ Unable to identify your Telegram account. Please try again.');
    return;
  }

  // Expire any existing unused tokens for this user
  await db.prepare(
    `UPDATE telegram_link_tokens SET used = 1
     WHERE telegram_id = ? AND used = 0`
  ).bind(telegramId).run().catch(() => {});

  // Generate a new one-time token (15-minute TTL)
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  try {
    await db.prepare(
      `INSERT INTO telegram_link_tokens (token, telegram_id, expires_at) VALUES (?, ?, ?)`
    ).bind(token, telegramId, expiresAt).run();
  } catch {
    await sendTelegramMessage(tok, chatId, '⚠️ Could not generate a link token. Please try again shortly.');
    return;
  }

  const linkUrl = `${SITE_URL}/community.html?gklink=${token}`;
  await sendTelegramMessage(tok, chatId,
    `🔗 <b>Link Your Account</b>\n\n` +
    `Click the link below to connect your Telegram identity to the Moonboys website:\n\n` +
    `<a href="${linkUrl}">🔑 Activate Competition Access</a>\n\n` +
    `<i>This link expires in 15 minutes and can only be used once.</i>\n\n` +
    `After linking:\n` +
    `✅ Your identity is verified\n` +
    `✅ Competitive features unlock\n` +
    `✅ Leaderboard rankings activate\n\n` +
    `To unlink later, use /gkunlink`
  );
}

async function cmdGkStatus(db, tok, chatId, telegramId) {
  const [row, meta] = await Promise.all([
    db.prepare(
      `SELECT display_name, username, faction, xp_total, xp_seasonal, xp_yearly,
              linked_email_hash, link_confirmed, created_at
       FROM telegram_profiles WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => null),
    getTgMeta(db).catch(() => null),
  ]);

  if (!row) {
    await sendTelegramMessage(tok, chatId, '❓ No profile found. Use /gkstart to register.');
    return;
  }

  const seasonNum = meta ? meta.season_number : '?';
  const daysLeft = meta ? tgSeasonDaysRemaining(meta.season_start) : '?';
  const linked = (row.link_confirmed || row.linked_email_hash) ? '✅ Linked (competition-active)' : '❌ Not linked — use /gklink';

  await sendTelegramMessage(tok, chatId,
    `📊 <b>Season Stats</b>\n\n` +
    `Name:        ${escapeHtml(row.display_name || row.username || 'Unknown')}\n` +
    `Faction:     ${escapeHtml(row.faction || 'None')}\n` +
    `XP Lifetime: ${row.xp_total}\n` +
    `XP Season ${seasonNum}: ${row.xp_seasonal}  <i>(${daysLeft}d left)</i>\n` +
    `XP ${new Date().getUTCFullYear()}: ${row.xp_yearly}\n` +
    `Account:     ${linked}`
  );
}

async function cmdGkSeason(db, tok, chatId) {
  await checkAndRunTgResets(db).catch(() => {});
  const meta = await getTgMeta(db).catch(() => null);
  if (!meta) {
    await sendTelegramMessage(tok, chatId, '⚠️ Season info unavailable right now.');
    return;
  }
  const daysLeft   = tgSeasonDaysRemaining(meta.season_start);
  const currentYear = new Date().getUTCFullYear();
  await sendTelegramMessage(tok, chatId,
    `🗓 <b>Season Info</b>\n\n` +
    `Current Season: <b>S${meta.season_number}</b>\n` +
    `Season Start:   ${String(meta.season_start).slice(0, 10)}\n` +
    `Days Remaining: ${daysLeft}\n` +
    `Year:           ${currentYear}\n\n` +
    `<i>Season XP resets every 90 days. Yearly XP resets on New Year UTC.</i>`
  );
}

async function cmdGkLeaderboard(db, tok, chatId) {
  const [rows, meta] = await Promise.all([
    db.prepare(
      `SELECT display_name, username, xp_total, xp_seasonal, faction
       FROM telegram_profiles ORDER BY xp_seasonal DESC LIMIT 10`
    ).all().catch(() => ({ results: [] })),
    getTgMeta(db).catch(() => null),
  ]);

  const entries = rows.results || [];
  if (!entries.length) {
    await sendTelegramMessage(tok, chatId, '📊 No community XP recorded yet. Use /gkstart to get on the board!');
    return;
  }

  const seasonNum = meta ? meta.season_number : '?';
  const daysLeft  = meta ? tgSeasonDaysRemaining(meta.season_start) : '?';

  const lines = entries.map((r, i) => {
    const name    = escapeHtml(r.display_name || r.username || 'Unknown');
    const faction = r.faction ? ` [${escapeHtml(r.faction)}]` : '';
    return `${i + 1}. ${name}${faction} — ${r.xp_seasonal} XP`;
  }).join('\n');

  await sendTelegramMessage(tok, chatId,
    `🏆 <b>Leaderboard — Season ${seasonNum}</b>\n` +
    `<i>${daysLeft}d remaining</i>\n\n${lines}`
  );
}

async function cmdGkQuests(db, tok, chatId) {
  const now  = new Date().toISOString();
  const rows = await db.prepare(
    `SELECT id, slug, title, description, quest_type, xp_reward
     FROM telegram_quests
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at >= ?)
     ORDER BY created_at DESC
     LIMIT 5`
  ).bind(now, now).all().catch(() => ({ results: [] }));

  const quests = rows.results || [];
  if (!quests.length) {
    await sendTelegramMessage(tok, chatId, '🔍 No active missions right now. Check back soon!');
    return;
  }

  const lines = quests.map(q =>
    `📜 <b>${escapeHtml(q.title)}</b> [${escapeHtml(q.quest_type)}] — ${q.xp_reward} XP\n` +
    `   ${escapeHtml(q.description)}\n` +
    `   Answer: <code>/solve ${escapeHtml(q.slug)} your_answer</code>`
  ).join('\n\n');

  await sendTelegramMessage(tok, chatId, `🗺️ <b>Active Missions</b>\n\n${lines}`);
}

async function cmdGkFaction(db, tok, chatId, telegramId, argStr) {
  const requested = (argStr || '').trim().toLowerCase();

  if (!requested) {
    // Show current faction
    const row = await db.prepare(
      `SELECT faction FROM telegram_profiles WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => null);
    const current = row?.faction || 'None';
    const list    = [...APPROVED_FACTIONS].join(', ');
    await sendTelegramMessage(tok, chatId,
      `⚔️ <b>Faction</b>\n\nCurrent: <b>${escapeHtml(current)}</b>\n\n` +
      `To change faction:\n<code>/gkfaction &lt;name&gt;</code>\n\nAvailable: <code>${list}</code>`
    );
    return;
  }

  if (!APPROVED_FACTIONS.has(requested)) {
    const list = [...APPROVED_FACTIONS].join(', ');
    await sendTelegramMessage(tok, chatId,
      `❌ Unknown faction. Available:\n<code>${list}</code>`
    );
    return;
  }

  await db.prepare(
    `UPDATE telegram_profiles SET faction = ? WHERE telegram_id = ?`
  ).bind(requested, telegramId).run().catch(() => {});

  await sendTelegramMessage(tok, chatId,
    `⚔️ Faction set to <b>${escapeHtml(requested)}</b>. Loyalty noted, moonboy.`
  );
}

async function cmdGkUnlink(db, tok, chatId, telegramId) {
  try {
    await db.prepare(
      `UPDATE telegram_profiles
       SET linked_email_hash = NULL, link_confirmed = 0
       WHERE telegram_id = ?`
    ).bind(telegramId).run();

    await sendTelegramMessage(tok, chatId,
      `🔓 <b>Account Unlinked</b>\n\n` +
      `Your Telegram identity has been unlinked from the website.\n` +
      `Competitive features will be paused until you relink.\n\n` +
      `To relink: /gklink`
    );
  } catch {
    await sendTelegramMessage(tok, chatId, '⚠️ Failed to unlink. Please try again.');
  }
}

// ── Legacy command implementations (kept for backward compat) ─────────────────

async function cmdStart(db, tok, chatId, telegramId, fromUser) {
  return cmdGkStart(db, tok, chatId, telegramId, fromUser);
}

async function cmdHelp(tok, chatId) {
  return cmdGkHelp(tok, chatId);
}

async function cmdXp(db, tok, chatId, telegramId) {
  const [row, meta] = await Promise.all([
    db.prepare(
      `SELECT xp_total, xp_seasonal, xp_yearly FROM telegram_profiles WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => null),
    getTgMeta(db).catch(() => null),
  ]);

  if (!row) {
    await sendTelegramMessage(tok, chatId, '❓ No profile found. Use /start to create one.');
    return;
  }

  const seasonNum  = meta ? meta.season_number : '?';
  const daysLeft   = meta ? tgSeasonDaysRemaining(meta.season_start) : '?';
  const currentYear = new Date().getUTCFullYear();

  await sendTelegramMessage(tok, chatId,
    `⚡ <b>Your XP</b>\n\n` +
    `Total (lifetime):  ${row.xp_total}\n` +
    `Seasonal (S${seasonNum}): ${row.xp_seasonal}  <i>(${daysLeft}d left)</i>\n` +
    `Yearly (${currentYear}):   ${row.xp_yearly}\n\n` +
    `<i>Community XP is separate from arcade scores.</i>`
  );
}

async function cmdLeaderboard(db, tok, chatId) {
  const [rows, meta] = await Promise.all([
    db.prepare(
      `SELECT display_name, username, xp_total, xp_seasonal FROM telegram_profiles ORDER BY xp_total DESC LIMIT 10`
    ).all().catch(() => ({ results: [] })),
    getTgMeta(db).catch(() => null),
  ]);

  const entries = (rows.results || []);
  if (!entries.length) {
    await sendTelegramMessage(tok, chatId, '📊 No community XP recorded yet.');
    return;
  }

  const seasonNum  = meta ? meta.season_number : '?';
  const daysLeft   = meta ? tgSeasonDaysRemaining(meta.season_start) : '?';
  const currentYear = new Date().getUTCFullYear();

  const lines = entries.map((r, i) => {
    const name = escapeHtml(r.display_name || r.username || 'Unknown');
    return `${i + 1}. ${name} — ${r.xp_total} XP total  (${r.xp_seasonal} this season)`;
  }).join('\n');

  await sendTelegramMessage(tok, chatId,
    `🏆 <b>Community XP Leaderboard</b>\n` +
    `<i>Season ${seasonNum} · ${daysLeft}d left · ${currentYear}</i>\n` +
    `<i>(separate from arcade scores)</i>\n\n${lines}`
  );
}

async function cmdProfile(db, tok, chatId, telegramId) {
  const [row, meta, solves] = await Promise.all([
    db.prepare(
      `SELECT display_name, username, faction, xp_total, xp_seasonal, xp_yearly,
              linked_email_hash, link_confirmed, created_at
       FROM telegram_profiles WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => null),
    getTgMeta(db).catch(() => null),
    db.prepare(
      `SELECT COUNT(*) AS n FROM telegram_quest_submissions WHERE telegram_id = ? AND is_correct = 1`
    ).bind(telegramId).first().catch(() => ({ n: 0 })),
  ]);

  if (!row) {
    await sendTelegramMessage(tok, chatId, '❓ No profile found. Use /start to create one.');
    return;
  }

  const seasonNum   = meta ? meta.season_number : '?';
  const daysLeft    = meta ? tgSeasonDaysRemaining(meta.season_start) : '?';
  const currentYear = new Date().getUTCFullYear();
  const linked      = (row.link_confirmed || row.linked_email_hash) ? '✅ Linked' : '❌ Not linked — use /gklink';
  const faction     = row.faction || 'None';

  await sendTelegramMessage(tok, chatId,
    `👤 <b>Profile</b>\n\n` +
    `Name:          ${escapeHtml(row.display_name || row.username || 'Unknown')}\n` +
    `Faction:       ${escapeHtml(faction)}\n` +
    `XP (lifetime): ${row.xp_total}\n` +
    `XP S${seasonNum}:       ${row.xp_seasonal}  <i>(${daysLeft}d left in season)</i>\n` +
    `XP ${currentYear}:      ${row.xp_yearly}\n` +
    `Quests solved: ${solves?.n || 0}\n` +
    `Website link:  ${linked}\n` +
    `Member since:  ${(row.created_at || '').slice(0, 10)}`
  );
}

async function cmdDaily(db, tok, chatId, telegramId) {
  const today = getTodayUtcDate();

  // Check if already claimed today
  const existing = await db.prepare(
    `SELECT telegram_id FROM telegram_daily_claims WHERE telegram_id = ? AND claim_date = ?`
  ).bind(telegramId, today).first().catch(() => null);

  if (existing) {
    await sendTelegramMessage(tok, chatId,
      `⏳ You already claimed your daily XP today (UTC: ${today}).\nCome back tomorrow!`
    );
    return;
  }

  // Record claim and award XP
  await db.prepare(
    `INSERT OR IGNORE INTO telegram_daily_claims (telegram_id, claim_date) VALUES (?, ?)`
  ).bind(telegramId, today).run();

  await awardXp(db, telegramId, XP_DAILY_CLAIM, 'daily_claim', 'bot_command', today);

  await sendTelegramMessage(tok, chatId,
    `✅ Daily XP claimed! +${XP_DAILY_CLAIM} XP\n\nSee you tomorrow, moonboy. 🚀`
  );
}

async function cmdQuest(db, tok, chatId) {
  const now = new Date().toISOString();
  const rows = await db.prepare(
    `SELECT id, slug, title, description, quest_type, xp_reward
     FROM telegram_quests
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at >= ?)
     ORDER BY created_at DESC
     LIMIT 5`
  ).bind(now, now).all().catch(() => ({ results: [] }));

  const quests = rows.results || [];
  if (!quests.length) {
    await sendTelegramMessage(tok, chatId, '🔍 No active quests right now. Check back soon!');
    return;
  }

  const lines = quests.map(q =>
    `📜 <b>${escapeHtml(q.title)}</b> [${escapeHtml(q.quest_type)}] — ${q.xp_reward} XP\n` +
    `   ${escapeHtml(q.description)}\n` +
    `   Solve with: <code>/solve ${escapeHtml(q.slug)} your_answer</code>`
  ).join('\n\n');

  await sendTelegramMessage(tok, chatId, `🗺️ <b>Active Quests</b>\n\n${lines}`);
}

async function cmdSolve(db, tok, chatId, telegramId, argStr) {
  if (!argStr) {
    await sendTelegramMessage(tok, chatId, '❓ Usage: /solve &lt;quest_slug&gt; &lt;your answer&gt;');
    return;
  }

  // argStr format: "<slug> <answer>" or just "<answer>" (tries first active quest)
  const parts  = argStr.split(' ');
  let slug, answer;

  if (parts.length >= 2) {
    // Check if first token is a known quest slug
    const maybeSlug = parts[0].toLowerCase();
    const now = new Date().toISOString();
    const questBySlug = await db.prepare(
      `SELECT id, title, answer_hash, xp_reward FROM telegram_quests
       WHERE slug = ? AND is_active = 1
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
       LIMIT 1`
    ).bind(maybeSlug, now, now).first().catch(() => null);

    if (questBySlug) {
      slug   = maybeSlug;
      answer = parts.slice(1).join(' ');
    } else {
      // Treat entire argStr as the answer against first active quest
      answer = argStr;
      slug   = null;
    }
  } else {
    answer = argStr;
    slug   = null;
  }

  // Resolve the quest
  const now = new Date().toISOString();
  const quest = slug
    ? await db.prepare(
        `SELECT id, title, answer_hash, xp_reward FROM telegram_quests
         WHERE slug = ? AND is_active = 1
           AND (starts_at IS NULL OR starts_at <= ?)
           AND (ends_at IS NULL OR ends_at >= ?)
         LIMIT 1`
      ).bind(slug, now, now).first().catch(() => null)
    : await db.prepare(
        `SELECT id, title, answer_hash, xp_reward FROM telegram_quests
         WHERE is_active = 1
           AND (starts_at IS NULL OR starts_at <= ?)
           AND (ends_at IS NULL OR ends_at >= ?)
         ORDER BY created_at DESC LIMIT 1`
      ).bind(now, now).first().catch(() => null);

  if (!quest) {
    await sendTelegramMessage(tok, chatId, '❓ No matching active quest found. Use /quest to list active quests.');
    return;
  }

  // Anti-spam: one reward per correct quest per user
  const alreadyCorrect = await db.prepare(
    `SELECT id FROM telegram_quest_submissions
     WHERE quest_id = ? AND telegram_id = ? AND is_correct = 1 LIMIT 1`
  ).bind(quest.id, telegramId).first().catch(() => null);

  const isCorrect = await verifyQuestAnswer(quest.answer_hash, answer);
  const submissionId = crypto.randomUUID();

  await db.prepare(
    `INSERT INTO telegram_quest_submissions (id, quest_id, telegram_id, submission_text, is_correct)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(submissionId, quest.id, telegramId, String(answer).slice(0, 500), isCorrect ? 1 : 0).run().catch(() => {});

  if (!isCorrect) {
    await sendTelegramMessage(tok, chatId,
      `❌ Incorrect answer for "<b>${escapeHtml(quest.title)}</b>". Keep searching for clues!`
    );
    return;
  }

  let xpMsg = '';
  if (!alreadyCorrect) {
    const xpReward = quest.xp_reward || XP_QUEST_SOLVE;
    if (xpReward > 0) {
      await awardXp(db, telegramId, xpReward, 'quest_solve', 'telegram_quest', quest.id);
      xpMsg = `\n\n⚡ +${xpReward} XP awarded!`;
    }
  } else {
    xpMsg = '\n\n<i>(XP already claimed for this quest.)</i>';
  }

  await sendTelegramMessage(tok, chatId,
    `✅ Correct! You solved "<b>${escapeHtml(quest.title)}</b>"! 🎉${xpMsg}`
  );
}

async function cmdLink(db, tok, chatId, telegramId) {
  return cmdGkLink(db, tok, chatId, telegramId);
}

async function cmdFaction(db, tok, chatId, telegramId, argStr) {
  const requested = argStr.trim().toLowerCase();
  if (!requested) {
    const list = [...APPROVED_FACTIONS].join(', ');
    await sendTelegramMessage(tok, chatId,
      `⚔️ Choose a faction:\n<code>${list}</code>\n\nUsage: /faction &lt;name&gt;`
    );
    return;
  }
  if (!APPROVED_FACTIONS.has(requested)) {
    const list = [...APPROVED_FACTIONS].join(', ');
    await sendTelegramMessage(tok, chatId,
      `❌ Unknown faction. Available factions:\n<code>${list}</code>`
    );
    return;
  }
  await db.prepare(
    `UPDATE telegram_profiles SET faction = ? WHERE telegram_id = ?`
  ).bind(requested, telegramId).run().catch(() => {});

  await sendTelegramMessage(tok, chatId,
    `⚔️ Faction set to <b>${escapeHtml(requested)}</b>. Loyalty noted, moonboy.`
  );
}

// ── Minimal HTML escaping for Telegram HTML parse_mode ───────────────────────
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
 *   GET  /telegram/activity?limit=
 *   GET  /telegram/daily-status?telegram_id=
 *
 * Telegram bot commands (handled inside POST /telegram/webhook):
 *   /start  /help  /xp  /leaderboard  /profile  /daily  /quest  /solve <ans>  /link  /faction <name>
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
  if (!xpDelta || xpDelta <= 0) return;
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
      const { vote } = body || {};
      if (!['up', 'down'].includes(vote)) return err('vote must be "up" or "down"');
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
      const { page_id } = body || {};
      if (!page_id) return err('page_id required');
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
      const { page_id, cite_id, vote } = body || {};
      if (!page_id || !cite_id || !['up', 'down'].includes(vote)) {
        return err('page_id, cite_id, and vote (up|down) required');
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
      const telegramId = url.searchParams.get('telegram_id');
      if (!telegramId) return err('telegram_id required');
      try {
        const row = await env.DB.prepare(
          `SELECT telegram_id, username, display_name, avatar_url, faction,
                  xp_total, xp_seasonal, xp_yearly, last_seen_at, created_at
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
    if (path === '/telegram/leaderboard' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
      try {
        const rows = await env.DB.prepare(
          `SELECT telegram_id, username, display_name, avatar_url, faction, xp_total
           FROM telegram_profiles
           ORDER BY xp_total DESC
           LIMIT ?`
        ).bind(limit).all();
        return json({
          type:    'community_xp',
          entries: rows.results || [],
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

    return err('Not found', 404);
  },
};

// ── Telegram bot command handler ──────────────────────────────────────────────

async function handleTelegramUpdate(update, env) {
  const db  = env.DB;
  const tok = env.TELEGRAM_BOT_TOKEN;

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
    case 'start':    await cmdStart(db, tok, chatId, telegramId, fromUser);              break;
    case 'help':     await cmdHelp(tok, chatId);                                         break;
    case 'xp':       await cmdXp(db, tok, chatId, telegramId);                           break;
    case 'leaderboard': await cmdLeaderboard(db, tok, chatId);                           break;
    case 'profile':  await cmdProfile(db, tok, chatId, telegramId);                      break;
    case 'daily':    await cmdDaily(db, tok, chatId, telegramId);                        break;
    case 'quest':    await cmdQuest(db, tok, chatId);                                    break;
    case 'solve':    await cmdSolve(db, tok, chatId, telegramId, argStr);                break;
    case 'link':     await cmdLink(tok, chatId);                                         break;
    case 'faction':  await cmdFaction(db, tok, chatId, telegramId, argStr);              break;
    default: break;
  }
}

// ── Command implementations ───────────────────────────────────────────────────

async function cmdStart(db, tok, chatId, telegramId, fromUser) {
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
    `🚀 Welcome to <b>Crypto Moonboys</b>, ${escapeHtml(name)}!\n\n` +
    `You've entered the Battle Chamber. Track your XP, solve lore puzzles, and dominate the leaderboard.\n\n` +
    `Use <b>/help</b> to see available commands.${xpMsg}`
  );
}

async function cmdHelp(tok, chatId) {
  await sendTelegramMessage(tok, chatId,
    `📖 <b>Moonboys Bot Commands</b>\n\n` +
    `/start — Join the ecosystem &amp; claim first-start XP\n` +
    `/xp — Check your XP totals\n` +
    `/leaderboard — Community XP leaderboard\n` +
    `/profile — Your full profile\n` +
    `/daily — Claim your daily XP (once per UTC day)\n` +
    `/quest — View active lore quests\n` +
    `/solve &lt;answer&gt; — Submit a quest answer\n` +
    `/faction &lt;name&gt; — Choose your faction\n` +
    `/link — Link your Telegram to the website\n\n` +
    `<i>Community XP is separate from arcade scores.</i>`
  );
}

async function cmdXp(db, tok, chatId, telegramId) {
  const row = await db.prepare(
    `SELECT xp_total, xp_seasonal, xp_yearly FROM telegram_profiles WHERE telegram_id = ?`
  ).bind(telegramId).first().catch(() => null);

  if (!row) {
    await sendTelegramMessage(tok, chatId, '❓ No profile found. Use /start to create one.');
    return;
  }
  await sendTelegramMessage(tok, chatId,
    `⚡ <b>Your XP</b>\n\n` +
    `Total:    ${row.xp_total}\n` +
    `Seasonal: ${row.xp_seasonal}\n` +
    `Yearly:   ${row.xp_yearly}`
  );
}

async function cmdLeaderboard(db, tok, chatId) {
  const rows = await db.prepare(
    `SELECT display_name, username, xp_total FROM telegram_profiles ORDER BY xp_total DESC LIMIT 10`
  ).all().catch(() => ({ results: [] }));

  const entries = (rows.results || []);
  if (!entries.length) {
    await sendTelegramMessage(tok, chatId, '📊 No community XP recorded yet.');
    return;
  }
  const lines = entries.map((r, i) => {
    const name = escapeHtml(r.display_name || r.username || 'Unknown');
    return `${i + 1}. ${name} — ${r.xp_total} XP`;
  }).join('\n');

  await sendTelegramMessage(tok, chatId,
    `🏆 <b>Community XP Leaderboard</b>\n<i>(separate from arcade scores)</i>\n\n${lines}`
  );
}

async function cmdProfile(db, tok, chatId, telegramId) {
  const row = await db.prepare(
    `SELECT display_name, username, faction, xp_total, xp_seasonal, xp_yearly,
            linked_email_hash, created_at
     FROM telegram_profiles WHERE telegram_id = ?`
  ).bind(telegramId).first().catch(() => null);

  if (!row) {
    await sendTelegramMessage(tok, chatId, '❓ No profile found. Use /start to create one.');
    return;
  }

  const solves = await db.prepare(
    `SELECT COUNT(*) AS n FROM telegram_quest_submissions WHERE telegram_id = ? AND is_correct = 1`
  ).bind(telegramId).first().catch(() => ({ n: 0 }));

  const linked = row.linked_email_hash ? '✅ Linked' : '❌ Not linked';
  const faction = row.faction || 'None';
  await sendTelegramMessage(tok, chatId,
    `👤 <b>Profile</b>\n\n` +
    `Name:     ${escapeHtml(row.display_name || row.username || 'Unknown')}\n` +
    `Faction:  ${escapeHtml(faction)}\n` +
    `XP Total: ${row.xp_total}\n` +
    `Seasonal: ${row.xp_seasonal}\n` +
    `Yearly:   ${row.xp_yearly}\n` +
    `Quests solved: ${solves?.n || 0}\n` +
    `Website link: ${linked}\n` +
    `Member since: ${(row.created_at || '').slice(0, 10)}`
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

async function cmdLink(tok, chatId) {
  await sendTelegramMessage(tok, chatId,
    `🔗 <b>Link your Telegram to the Moonboys website</b>\n\n` +
    `To link your identity:\n` +
    `1. Visit <a href="https://crypto-moonboys.github.io/community.html">community.html</a>\n` +
    `2. Connect your Telegram account via the Login Widget in the comment form\n` +
    `3. Your Telegram and website identities will be linked via your email hash\n\n` +
    `<i>Your email is never stored publicly. Only a one-way hash is used.</i>`
  );
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

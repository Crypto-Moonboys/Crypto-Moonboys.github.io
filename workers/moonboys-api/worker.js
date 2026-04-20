import { TELEGRAM_AUTH_MAX_AGE } from './blocktopia/config.js';
import { handleBlockTopiaProgressionRoute } from './blocktopia/routes.js';
/**
 * Moonboys API — Cloudflare Worker entrypoint
 *
 * Backed by D1 database "wikicoms" (binding: DB).
 * Uses ONLY the real live tables present in the D1 instance.
 *
 * Routes:
 *   GET  /health
 *   GET  /sam/status
 *   POST /telegram/auth
 *   POST /telegram/webhook
 *   GET  /telegram/profile?telegram_id=
 *   GET  /telegram/leaderboard?limit=
 *   GET  /telegram/quests
 *   POST /telegram/link
 *   GET  /telegram/link/confirm?token=
 *   GET  /telegram/activity?limit=
 *   GET  /telegram/daily-status?telegram_id=
 *   GET  /telegram/season/current
 *   GET  /telegram/user/status?telegram_id=
 *
 * Telegram bot commands (POST /telegram/webhook):
 *   /gkstart /gkhelp /gklink /gkstatus /gkseason /gkleaderboard /gkquests /gkfaction /gkunlink
 *   /start /help /link  (aliases)
 *   /daily /quest /solve /profile
 *   /gkban /gkunban /gkrisk /gkclearstrikes  (admin only)
 *
 * Secrets required (set via `wrangler secret put`):
 *   TELEGRAM_BOT_TOKEN    — BotFather token for HMAC verification and sendMessage
 *   TELEGRAM_BOT_USERNAME — @username (used in widget docs only)
 *   ADMIN_TELEGRAM_IDS    — comma-separated Telegram user IDs allowed to run admin commands
 *   ADMIN_SECRET          — shared secret forwarded to the anti-cheat worker (X-Admin-Secret)
 *   ANTI_CHEAT_WORKER_URL — base URL of the deployed anti-cheat Cloudflare Worker
 */

// ── Anti-cheat integration ─────────────────────────────────────────────────────
/**
 * Base URL of the deployed anti-cheat Cloudflare Worker.
 * Override via ANTI_CHEAT_WORKER_URL secret; this default is the expected prod URL.
 */
const ANTI_CHEAT_WORKER_URL_DEFAULT = 'https://moonboys-anti-cheat.sercullen.workers.dev';

// ── XP rules ──────────────────────────────────────────────────────────────────
const XP_FIRST_START = 50;
const XP_DAILY_CLAIM = 20;
const XP_GROUP_JOIN  = 10;

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

function logApiFailure(event, context = {}) {
  console.log('[moonboys-api]', JSON.stringify({
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

/** Return today's UTC date as a YYYY-MM-DD string. */
function getTodayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Return a display name for a Telegram user object (from webhook/auth payloads). */
function getTelegramDisplayName(user) {
  if (!user) return 'Unknown';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(user.id);
}

/**
 * Return a display name from a D1 query row that has first_name, last_name,
 * username, and telegram_id columns (but no id column).
 */
function displayNameFromRow(r) {
  return [r.first_name, r.last_name].filter(Boolean).join(' ')
    || r.username
    || r.telegram_id
    || 'Unknown';
}

/**
 * Return true if the given user has already claimed daily XP today (UTC).
 * Uses SQLite's DATE('now') for reliable UTC-day comparison.
 */
async function hasDailyClaimToday(db, telegramId) {
  const row = await db.prepare(
    `SELECT id FROM telegram_xp_log
     WHERE telegram_id = ? AND action = 'daily_claim'
       AND DATE(created_at) = DATE('now')`
  ).bind(telegramId).first().catch(() => null);
  return !!row;
}

/** Format a SQLite datetime string to a human-readable "N time ago" label. */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs  = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60)    return 'just now';
  if (diffSec < 3600)  return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
  return Math.floor(diffSec / 86400) + 'd ago';
}

/** Minimal HTML escaping for Telegram HTML parse_mode. */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Anti-cheat admin helpers ──────────────────────────────────────────────────

/**
 * Return true if `telegramId` is in the ADMIN_TELEGRAM_IDS secret
 * (comma-separated list of numeric Telegram user IDs).
 * Returns false when the secret is absent or empty.
 */
function isAdminTelegramUser(telegramId, env) {
  const raw = env.ADMIN_TELEGRAM_IDS;
  if (!raw || !telegramId) return false;
  return raw.split(',').map(s => s.trim()).includes(String(telegramId));
}

/**
 * Call the anti-cheat worker.
 * `method` is the HTTP verb, `acPath` is the route (e.g. '/anticheat/block'),
 * `body` is the JSON body for POST requests (omit for GET/DELETE).
 *
 * Returns the parsed JSON response, or `{ error: '...' }` on failure.
 * Never throws.
 */
async function callAntiCheatWorker(env, method, acPath, body) {
  const baseUrl = (env.ANTI_CHEAT_WORKER_URL || ANTI_CHEAT_WORKER_URL_DEFAULT).replace(/\/$/, '');
  const adminSecret = env.ADMIN_SECRET;
  if (!adminSecret) {
    logApiFailure('anti_cheat_call_blocked', { reason: 'missing_admin_secret', method, acPath });
    return { error: 'Anti-cheat admin secret not configured' };
  }
  try {
    const init = {
      method,
      headers: {
        'Content-Type':  'application/json',
        'X-Admin-Secret': adminSecret,
      },
    };
    if (body !== undefined && method === 'POST') {
      init.body = JSON.stringify(body);
    }
    const res  = await fetch(`${baseUrl}${acPath}`, init);
    const text = await res.text();
    if (!res.ok) {
      logApiFailure('anti_cheat_http_error', { method, acPath, status: res.status });
    }
    try { return JSON.parse(text); } catch (error) {
      logApiFailure('anti_cheat_parse_error', {
        method,
        acPath,
        status: res.status,
        message: error?.message || String(error),
      });
      return { error: text };
    }
  } catch (e) {
    logApiFailure('anti_cheat_network_error', { method, acPath, message: e?.message || String(e) });
    return { error: e?.message || String(e) };
  }
}

/**
 * Send a text message via the Telegram Bot API.
 * Never throws — failures are silently swallowed so the webhook always returns 200.
 */
async function sendTelegramMessage(botToken, chatId, text, extra = {}) {
  if (!botToken || !chatId) {
    console.log('TG send skipped', JSON.stringify({ hasBotToken: !!botToken, hasChatId: !!chatId }));
    return;
  }
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
      }
    );
    const responseText = await response.text();
    console.log('TG send status:', response.status);
    if (!response.ok) {
      console.log('TG send failed', JSON.stringify({ status: response.status, chatId, response: responseText }));
    }
  } catch (error) {
    console.log('TG send exception:', error?.message || error);
  }
}

/**
 * Verify a Telegram Login Widget auth payload against the bot token.
 * Algorithm: https://core.telegram.org/widgets/login#checking-authorization
 */
async function verifyTelegramAuth(data, botToken) {
  if (!botToken || !data || !data.hash) return false;
  const { hash, ...fields } = data;
  const checkString = Object.keys(fields)
    .filter(k => fields[k] != null)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n');
  const secretKeyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken));
  const hmacKey = await crypto.subtle.importKey(
    'raw', secretKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(checkString));
  const sig = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  return sig === hash;
}

// ── Real-schema helpers ───────────────────────────────────────────────────────

/**
 * Upsert a telegram_users row.
 * Updates username, first_name, last_name, and updated_at on every call.
 */
async function upsertTelegramUser(db, user) {
  const telegramId = String(user.id);
  const username   = user.username   || null;
  const firstName  = user.first_name || null;
  const lastName   = user.last_name  || null;

  await db.prepare(`
    INSERT INTO telegram_users (telegram_id, username, first_name, last_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username   = excluded.username,
      first_name = excluded.first_name,
      last_name  = excluded.last_name,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, username, firstName, lastName).run();

  return telegramId;
}

/**
 * Award XP to a Telegram user.
 *   1. Inserts a row into telegram_xp_log.
 *   2. Updates telegram_users.xp and recalculates level = floor(xp / 100) + 1.
 *
 * The level formula uses the new xp value (old xp + xp_change) which in SQLite
 * SET expressions is computed from the pre-update column value — correct.
 */
async function awardXp(db, telegramId, xpChange, action, referenceId = '') {
  if (!xpChange || xpChange < 0) {
    if (xpChange < 0) console.log('awardXp: negative xpChange ignored', JSON.stringify({ telegramId, xpChange, action }));
    return;
  }
  const logId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO telegram_xp_log (id, telegram_id, action, xp_change, reference_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(logId, telegramId, action, xpChange, referenceId || null).run();

  await db.prepare(`
    UPDATE telegram_users
    SET xp         = xp + ?,
        level      = CAST((xp + ?) / 100 AS INTEGER) + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(xpChange, xpChange, telegramId).run();
}

/**
 * Log an activity entry into telegram_activity_log.
 * Never throws — failures are silently swallowed.
 */
async function logTelegramActivity(db, telegramId, action, metadata = '') {
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO telegram_activity_log (id, telegram_id, action, metadata)
    VALUES (?, ?, ?, ?)
  `).bind(id, telegramId, action, metadata || null).run().catch((error) => {
    logApiFailure('telegram_activity_log_failed', {
      telegramId,
      action,
      message: error?.message || String(error),
    });
  });
}

/**
 * Return the user's current faction by joining telegram_faction_members -> telegram_factions.
 * Returns null if the user is not in any faction.
 */
async function getUserFaction(db, telegramId) {
  const row = await db.prepare(`
    SELECT f.id, f.name, f.description, f.icon, fm.role
    FROM telegram_faction_members fm
    JOIN telegram_factions f ON f.id = fm.faction_id
    WHERE fm.telegram_id = ?
  `).bind(telegramId).first().catch(() => null);
  return row || null;
}

/**
 * Return the most recent row from telegram_seasons (latest by id).
 * Returns null safely if the table is absent or empty.
 */
async function getCurrentSeason(db) {
  return db.prepare(
    `SELECT * FROM telegram_seasons ORDER BY id DESC LIMIT 1`
  ).first().catch(() => null);
}

// ── Main fetch handler ────────────────────────────────────────────────────────

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

    // ── GET /sam/status ────────────────────────────────────────────────────
    if (path === '/sam/status' && request.method === 'GET') {
      return json({ ok: true, message: 'SAM active and monitoring the wiki.' });
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

      const now = Math.floor(Date.now() / 1000);
      if (now - parseInt(auth_date, 10) > TELEGRAM_AUTH_MAX_AGE) {
        logApiFailure('telegram_auth_expired', { telegramId: String(id) });
        return err('Telegram auth data has expired', 401);
      }

      const valid = await verifyTelegramAuth(
        { id, first_name, last_name, username, photo_url, auth_date, hash },
        env.TELEGRAM_BOT_TOKEN,
      );
      if (!valid) {
        logApiFailure('telegram_auth_verification_failed', { telegramId: String(id) });
        return err('Telegram auth verification failed', 401);
      }

      const displayName = [first_name, last_name].filter(Boolean).join(' ') || username || String(id);
      return json({
        ok: true,
        identity: {
          telegram_id:       String(id),
          telegram_username: username  || null,
          display_name:      displayName,
          avatar_url:        photo_url || null,
        },
      });
    }

    // ── POST /telegram/webhook ─────────────────────────────────────────────
    // Always returns 200 OK so Telegram stops retrying regardless of errors.
    if (path === '/telegram/webhook' && request.method === 'POST') {
      let update;
      try {
        update = await request.json();
      } catch (e) {
        console.log('webhook parse failure:', e?.message || String(e));
        return json({ ok: true });
      }
      if (update) {
        await handleTelegramUpdate(update, env).catch((e) => {
          console.log('handleTelegramUpdate error:', e?.message || String(e));
          if (e?.stack) console.log(e.stack);
        });
      }
      return json({ ok: true });
    }

    // ── GET /telegram/profile?telegram_id= ────────────────────────────────
    // Reads from telegram_users; includes faction via telegram_faction_members.
    if (path === '/telegram/profile' && request.method === 'GET') {
      const telegramId = url.searchParams.get('telegram_id');
      if (!telegramId) return err('telegram_id required');
      try {
        const [user, faction] = await Promise.all([
          env.DB.prepare(
            `SELECT telegram_id, username, first_name, last_name,
                    wallet_address, xp, level, created_at, updated_at
             FROM telegram_users WHERE telegram_id = ?`
          ).bind(telegramId).first(),
          getUserFaction(env.DB, telegramId),
        ]);
        if (!user) return err('Profile not found', 404);
        return json({ profile: { ...user, faction: faction || null } });
      } catch {
        return err('Failed to load profile', 500);
      }
    }

    // ── GET /telegram/leaderboard?limit= ──────────────────────────────────
    // Uses current season from telegram_seasons; falls back to telegram_users.xp.
    if (path === '/telegram/leaderboard' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
      try {
        const season = await getCurrentSeason(env.DB);
        let entries;

        if (season?.id) {
          const rows = await env.DB.prepare(
            `SELECT tl.telegram_id, tl.xp, tl.rank,
                    tu.username, tu.first_name, tu.last_name
             FROM telegram_leaderboard tl
             LEFT JOIN telegram_users tu ON tu.telegram_id = tl.telegram_id
             WHERE tl.season_id = ?
             ORDER BY tl.xp DESC
             LIMIT ?`
          ).bind(season.id, limit).all();
          entries = (rows.results || []).map((r, i) => ({
            rank:         r.rank || i + 1,
            telegram_id:  r.telegram_id,
            username:     r.username || null,
            display_name: displayNameFromRow(r),
            xp:           r.xp || 0,
          }));
        }

        // Fallback: top users by xp from telegram_users
        if (!entries || !entries.length) {
          const rows = await env.DB.prepare(
            `SELECT telegram_id, username, first_name, last_name, xp, level
             FROM telegram_users ORDER BY xp DESC LIMIT ?`
          ).bind(limit).all();
          entries = (rows.results || []).map((r, i) => ({
            rank:         i + 1,
            telegram_id:  r.telegram_id,
            username:     r.username || null,
            display_name: displayNameFromRow(r),
            xp:           r.xp || 0,
          }));
        }

        return json({ type: 'community_xp', season: season || null, entries });
      } catch {
        return err('Failed to load leaderboard', 500);
      }
    }

    // ── GET /telegram/quests ──────────────────────────────────────────────
    // Returns active quests filtered by start_date / end_date.
    if (path === '/telegram/quests' && request.method === 'GET') {
      try {
        const now = new Date().toISOString();
        const rows = await env.DB.prepare(
          `SELECT id, title, description, xp_reward, start_date, end_date
           FROM telegram_quests
           WHERE is_active = 1
             AND (start_date IS NULL OR start_date <= ?)
             AND (end_date IS NULL OR end_date >= ?)
           ORDER BY created_at DESC`
        ).bind(now, now).all();
        return json({ quests: rows.results || [] });
      } catch {
        return err('Failed to load quests', 500);
      }
    }

    // ── POST /telegram/link ────────────────────────────────────────────────
    // Body: { telegram_id }
    // Invalidates outstanding tokens and generates a new one-time token
    // stored in telegram_link_tokens (15-minute TTL).
    // Rejects if the user's anti-cheat state is blocked.
    if (path === '/telegram/link' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { telegram_id } = body || {};
      if (!telegram_id) return err('telegram_id required');

      // Anti-cheat gate: reject competitive link action if account is blocked.
      try {
        const acState = await env.DB.prepare(
          `SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?`
        ).bind(String(telegram_id)).first();
        if (acState && acState.is_blocked === 1) {
          return err('Account is blocked from competitive actions. Contact the Moonboys community on Telegram to appeal.', 403);
        }
      } catch (error) {
        logApiFailure('telegram_link_anticheat_check_failed', {
          telegramId: String(telegram_id),
          message: error?.message || String(error),
        });
      }

      // Invalidate any existing unused tokens for this user
      await env.DB.prepare(
        `UPDATE telegram_link_tokens SET is_used = 1 WHERE telegram_id = ? AND is_used = 0`
      ).bind(String(telegram_id)).run().catch((error) => {
        logApiFailure('telegram_link_token_invalidate_failed', {
          telegramId: String(telegram_id),
          message: error?.message || String(error),
        });
      });

      const token     = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      try {
        await env.DB.prepare(
          `INSERT INTO telegram_link_tokens (token, telegram_id, expires_at) VALUES (?, ?, ?)`
        ).bind(token, String(telegram_id), expiresAt).run();
        return json({ ok: true, token, expires_at: expiresAt });
      } catch {
        return err('Failed to generate link token', 500);
      }
    }

    // ── GET /telegram/link/confirm?token= ─────────────────────────────────
    // Validates a one-time token from telegram_link_tokens.
    // Checks is_used = 0 and expires_at; marks is_used = 1 on success.
    if (path === '/telegram/link/confirm' && request.method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
        return err('token required');
      }
      const now = new Date().toISOString();
      try {
        const row = await env.DB.prepare(
          `SELECT telegram_id FROM telegram_link_tokens
           WHERE token = ? AND is_used = 0 AND expires_at > ?`
        ).bind(token, now).first();
        if (!row) return err('Invalid or expired link token', 410);

        await env.DB.prepare(
          `UPDATE telegram_link_tokens SET is_used = 1 WHERE token = ?`
        ).bind(token).run();

        return json({ ok: true, telegram_id: row.telegram_id });
      } catch {
        return err('Failed to confirm link token', 500);
      }
    }

    // ── GET /telegram/activity?limit= ─────────────────────────────────────
    // Reads from telegram_activity_log joined to telegram_users for display name.
    if (path === '/telegram/activity' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
      try {
        const rows = await env.DB.prepare(
          `SELECT al.telegram_id, al.action, al.metadata, al.created_at,
                  tu.username, tu.first_name, tu.last_name
           FROM telegram_activity_log al
           LEFT JOIN telegram_users tu ON tu.telegram_id = al.telegram_id
           ORDER BY al.created_at DESC
           LIMIT ?`
        ).bind(limit).all();

        const items = (rows.results || []).map(r => ({
          icon:     '⚡',
          text:     `${displayNameFromRow(r)}: ${r.action}`,
          time_ago: timeAgo(r.created_at),
        }));
        return json({ items });
      } catch {
        return err('Failed to load activity', 500);
      }
    }

    // ── GET /telegram/daily-status?telegram_id= ───────────────────────────
    // Determines daily claim status from telegram_xp_log where action='daily_claim'
    // and created_at falls within today UTC.
    if (path === '/telegram/daily-status' && request.method === 'GET') {
      const telegramId = url.searchParams.get('telegram_id');
      if (!telegramId) return err('telegram_id required');
      const today = getTodayUtcDate();
      try {
        const claimed = await hasDailyClaimToday(env.DB, telegramId);
        return json({ claimed, date: today });
      } catch {
        return err('Failed to check daily status', 500);
      }
    }

    // ── GET /telegram/season/current ──────────────────────────────────────
    // Uses telegram_seasons if present; returns a safe fallback without crashing.
    if (path === '/telegram/season/current' && request.method === 'GET') {
      try {
        const season = await getCurrentSeason(env.DB);
        if (!season) {
          return json({
            season:  null,
            message: 'No active season found',
            year:    new Date().getUTCFullYear(),
          });
        }
        return json({ season, year: new Date().getUTCFullYear() });
      } catch {
        return json({
          season:  null,
          message: 'Season info temporarily unavailable',
          year:    new Date().getUTCFullYear(),
        });
      }
    }

    // ── GET /telegram/user/status?telegram_id= ────────────────────────────
    // Returns the user's profile and anti-cheat block status for website feedback.
    // Used by front-end pages to display a "your account is blocked" notice.
    if (path === '/telegram/user/status' && request.method === 'GET') {
      const telegramId = url.searchParams.get('telegram_id');
      if (!telegramId) return err('telegram_id required');

      try {
        // Fetch user profile and anti-cheat state in parallel
        const [user, acState] = await Promise.all([
          env.DB.prepare(
            `SELECT telegram_id, username, first_name, last_name, xp, level, created_at
             FROM telegram_users WHERE telegram_id = ?`
          ).bind(telegramId).first().catch(() => null),
          env.DB.prepare(
            `SELECT is_blocked, block_type, blocked_reason, lifetime_strikes,
                    season_risk_score, year_risk_score, last_scan_at
             FROM telegram_anticheat_state WHERE telegram_id = ?`
          ).bind(telegramId).first().catch(() => null),
        ]);

        if (!user) return err('User not found', 404);

        return json({
          telegram_id:      user.telegram_id,
          username:         user.username    || null,
          display_name:     displayNameFromRow(user),
          xp:               user.xp          || 0,
          level:            user.level        || 1,
          member_since:     (user.created_at || '').slice(0, 10),
          anticheat: acState ? {
            is_blocked:       acState.is_blocked       === 1,
            block_type:       acState.block_type        || null,
            blocked_reason:   acState.blocked_reason    || null,
            lifetime_strikes: acState.lifetime_strikes  || 0,
            season_risk_score: acState.season_risk_score || 0,
            year_risk_score:   acState.year_risk_score   || 0,
            last_scan_at:      acState.last_scan_at      || null,
          } : {
            is_blocked: false,
            block_type: null,
            blocked_reason: null,
            lifetime_strikes: 0,
            season_risk_score: 0,
            year_risk_score: 0,
            last_scan_at: null,
          },
        });
      } catch {
        return err('Failed to load user status', 500);
      }
    }

    const blockTopiaResponse = await handleBlockTopiaProgressionRoute(request, env, url, {
      path,
      json,
      err,
      upsertTelegramUser,
      verifyTelegramAuth,
    });
    if (blockTopiaResponse) return blockTopiaResponse;

    return err('Not found', 404);
  },
};

// ── Telegram bot command handler ──────────────────────────────────────────────

const SITE_URL = 'https://crypto-moonboys.github.io';

async function handleTelegramUpdate(update, env) {
  const db  = env.DB;
  const tok = env.TELEGRAM_BOT_TOKEN;

  const msg = update.message || update.edited_message;

  // ── Group-level events ───────────────────────────────────────────────────

  // New chat members — upsert user, log activity, award join XP once
  if (msg?.new_chat_members) {
    for (const member of msg.new_chat_members) {
      const telegramId = String(member.id);
      await upsertTelegramUser(db, member).catch((error) => {
        logApiFailure('webhook_member_upsert_failed', {
          telegramId,
          message: error?.message || String(error),
        });
      });
      await logTelegramActivity(db, telegramId, 'chat_join',
        JSON.stringify({ chat_id: String(msg.chat?.id || '') }));
      // Award join XP only once per user
      const prior = await db.prepare(
        `SELECT id FROM telegram_xp_log WHERE telegram_id = ? AND action = 'group_join' LIMIT 1`
      ).bind(telegramId).first().catch(() => null);
      if (!prior) {
        await awardXp(db, telegramId, XP_GROUP_JOIN, 'group_join').catch((error) => {
          logApiFailure('webhook_group_join_xp_award_failed', {
            telegramId,
            message: error?.message || String(error),
          });
        });
      }
    }
    return;
  }

  // Chat join requests — log only
  if (update.chat_join_request) {
    const user = update.chat_join_request.from;
    if (user) {
      await logTelegramActivity(db, String(user.id), 'chat_join_request',
        JSON.stringify({ chat_id: String(update.chat_join_request.chat?.id || '') }));
    }
    return;
  }

  // Poll answers — log only
  if (update.poll_answer) {
    const pa = update.poll_answer;
    await logTelegramActivity(db, String(pa.user?.id || ''), 'poll_answer',
      JSON.stringify({ poll_id: pa.poll_id }));
    return;
  }

  // ── Private / group message commands ─────────────────────────────────────
  if (!msg?.text) return;

  const chatId     = String(msg.chat?.id || '');
  const fromUser   = msg.from || {};
  const telegramId = String(fromUser.id || '');
  const text       = (msg.text || '').trim();

  // Upsert user on every interaction so the profile stays fresh
  if (telegramId) {
    await upsertTelegramUser(db, fromUser).catch((error) => {
      logApiFailure('webhook_user_upsert_failed', {
        telegramId,
        message: error?.message || String(error),
      });
    });
  }

  // Only handle bot commands
  if (!text.startsWith('/')) return;

  const spaceIdx = text.indexOf(' ');
  const rawCmd   = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
  const cmdBase  = rawCmd.split('@')[0].toLowerCase(); // strip @botname suffix
  const argStr   = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();

  switch (cmdBase) {
    // ── GK command set ────────────────────────────────────────────────────
    case 'gkstart':
    case 'start':        await cmdGkStart(db, tok, chatId, telegramId, fromUser);     break;
    case 'gkhelp':
    case 'help':         await cmdGkHelp(tok, chatId);                                break;
    case 'gklink':
    case 'link':         await cmdGkLink(db, tok, chatId, telegramId);               break;
    case 'gkstatus':     await cmdGkStatus(db, tok, chatId, telegramId);             break;
    case 'gkseason':     await cmdGkSeason(db, tok, chatId);                         break;
    case 'gkleaderboard':
    case 'leaderboard':  await cmdGkLeaderboard(db, tok, chatId);                    break;
    case 'gkquests':
    case 'quest':        await cmdGkQuests(db, tok, chatId);                         break;
    case 'gkfaction':
    case 'faction':      await cmdGkFaction(db, tok, chatId, telegramId, argStr);    break;
    case 'gkunlink':     await cmdGkUnlink(db, tok, chatId, telegramId);             break;
    case 'daily':        await cmdDaily(db, tok, chatId, telegramId);                break;
    case 'solve':        await cmdSolve(tok, chatId);                                break;
    case 'profile':      await cmdProfile(db, tok, chatId, telegramId);              break;
    // ── Admin-only moderation commands ───────────────────────────────────────
    case 'gkban':          await cmdGkBan(db, tok, chatId, telegramId, argStr, env);         break;
    case 'gkunban':        await cmdGkUnban(db, tok, chatId, telegramId, argStr, env);       break;
    case 'gkrisk':         await cmdGkRisk(db, tok, chatId, telegramId, argStr, env);        break;
    case 'gkclearstrikes': await cmdGkClearStrikes(db, tok, chatId, telegramId, argStr, env); break;
    default: break;
  }
}

// ── GK command implementations ────────────────────────────────────────────────

async function cmdGkStart(db, tok, chatId, telegramId, fromUser) {
  // Award first-start XP exactly once (checked via telegram_xp_log)
  const prior = await db.prepare(
    `SELECT id FROM telegram_xp_log WHERE telegram_id = ? AND action = 'first_start' LIMIT 1`
  ).bind(telegramId).first().catch(() => null);

  let xpMsg = '';
  if (!prior) {
    await awardXp(db, telegramId, XP_FIRST_START, 'first_start').catch((error) => {
      logApiFailure('first_start_xp_award_failed', {
        telegramId,
        message: error?.message || String(error),
      });
    });
    xpMsg = `\n\n⚡ You earned <b>${XP_FIRST_START} XP</b> for your first launch!`;
  }

  await logTelegramActivity(db, telegramId, 'gkstart').catch((error) => {
    logApiFailure('gkstart_activity_log_failed', {
      telegramId,
      message: error?.message || String(error),
    });
  });

  const name = escapeHtml(getTelegramDisplayName(fromUser));
  // Inline keyboard: web_app buttons open the site as a fullscreen Telegram
  // WebApp on mobile/iPad.  A plain url fallback row is also included for
  // desktop clients that do not support web_app (graceful degradation).
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '🚀 Open Incubator Guide', web_app: { url: `${SITE_URL}/gkniftyheads-incubator.html` } },
        { text: '⚔️ Open Battle Chamber',  web_app: { url: `${SITE_URL}/community.html` } },
      ],
      [
        { text: '🌐 Open in Browser',      url: `${SITE_URL}/gkniftyheads-incubator.html` },
      ],
    ],
  };
  await sendTelegramMessage(tok, chatId,
    `🚀 <b>Welcome to Crypto Moonboys GK, ${name}!</b>\n\n` +
    `You've entered the Battle Chamber.\n\n` +
    `<b>What to do next:</b>\n` +
    `🔗 /gklink — Link your account to the website\n` +
    `📊 /gkstatus — View your XP and faction\n` +
    `🏆 /gkleaderboard — Community leaderboard\n` +
    `🗺️ /gkquests — Active missions\n` +
    `⚔️ /gkfaction — Join or view your faction\n` +
    `❓ /gkhelp — Full command list${xpMsg}`,
    { reply_markup: replyMarkup },
  );
}

async function cmdGkHelp(tok, chatId) {
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '🚀 Open Incubator Guide', web_app: { url: `${SITE_URL}/gkniftyheads-incubator.html` } },
      ],
      [
        { text: '🌐 Open in Browser', url: `${SITE_URL}/gkniftyheads-incubator.html` },
      ],
    ],
  };
  await sendTelegramMessage(tok, chatId,
    `📖 <b>Moonboys GK Commands</b>\n\n` +
    `/gkstart — Start and register\n` +
    `/gklink — Link account to website\n` +
    `/gkstatus — XP and faction stats\n` +
    `/gkseason — Current season info\n` +
    `/gkleaderboard — Leaderboard\n` +
    `/gkquests — Active missions\n` +
    `/gkfaction [name] — View or join a faction\n` +
    `/gkunlink — Invalidate link tokens\n` +
    `/daily — Claim daily XP\n` +
    `/solve — Submit quest answers\n` +
    `/gkhelp — Help\n\n` +
    `<i>Legacy aliases: /start /help /link are still supported.</i>`,
    { reply_markup: replyMarkup },
  );
}

async function cmdGkLink(db, tok, chatId, telegramId) {
  if (!telegramId) {
    await sendTelegramMessage(tok, chatId, '❓ Unable to identify your Telegram account. Please try again.');
    return;
  }

  // Invalidate any existing unused tokens for this user
  await db.prepare(
    `UPDATE telegram_link_tokens SET is_used = 1 WHERE telegram_id = ? AND is_used = 0`
  ).bind(telegramId).run().catch((error) => {
    logApiFailure('gklink_token_invalidate_failed', {
      telegramId,
      message: error?.message || String(error),
    });
  });

  // Generate a new one-time token (15-minute TTL)
  const token     = crypto.randomUUID();
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
    `To invalidate tokens later, use /gkunlink`
  );
}

async function cmdGkStatus(db, tok, chatId, telegramId) {
  const [user, faction, season] = await Promise.all([
    db.prepare(
      `SELECT username, first_name, last_name, xp, level, created_at
       FROM telegram_users WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => null),
    getUserFaction(db, telegramId),
    getCurrentSeason(db),
  ]);

  if (!user) {
    await sendTelegramMessage(tok, chatId, '❓ No profile found. Use /gkstart to register.');
    return;
  }

  const displayName = escapeHtml(getTelegramDisplayName({ ...user, id: telegramId }));
  const factionName = faction ? escapeHtml(faction.name) : 'None';
  const seasonLabel = season ? `S${season.id}` : '?';

  await sendTelegramMessage(tok, chatId,
    `📊 <b>Your Stats</b>\n\n` +
    `Name:         ${displayName}\n` +
    `Faction:      ${factionName}\n` +
    `XP:           ${user.xp || 0}\n` +
    `Level:        ${user.level || 1}\n` +
    `Season:       ${seasonLabel}\n` +
    `Member since: ${(user.created_at || '').slice(0, 10)}`
  );
}

async function cmdGkSeason(db, tok, chatId) {
  const season = await getCurrentSeason(db).catch(() => null);
  if (!season) {
    await sendTelegramMessage(tok, chatId,
      '🗓 Season info is not available right now. Check back soon!');
    return;
  }

  const year = new Date().getUTCFullYear();
  // Render whatever fields the row contains
  const lines = Object.entries(season)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${escapeHtml(String(v))}`)
    .join('\n');

  await sendTelegramMessage(tok, chatId,
    `🗓 <b>Current Season</b>\n\n${lines}\nYear: ${year}`
  );
}

async function cmdGkLeaderboard(db, tok, chatId) {
  const season = await getCurrentSeason(db).catch(() => null);
  let entries = [];

  if (season?.id) {
    const rows = await db.prepare(
      `SELECT tl.telegram_id, tl.xp,
              tu.username, tu.first_name, tu.last_name
       FROM telegram_leaderboard tl
       LEFT JOIN telegram_users tu ON tu.telegram_id = tl.telegram_id
       WHERE tl.season_id = ?
       ORDER BY tl.xp DESC LIMIT 10`
    ).bind(season.id).all().catch(() => ({ results: [] }));
    entries = rows.results || [];
  }

  // Fallback: top users by xp from telegram_users
  if (!entries.length) {
    const rows = await db.prepare(
      `SELECT telegram_id, username, first_name, last_name, xp
       FROM telegram_users ORDER BY xp DESC LIMIT 10`
    ).all().catch(() => ({ results: [] }));
    entries = rows.results || [];
  }

  if (!entries.length) {
    await sendTelegramMessage(tok, chatId,
      '📊 No leaderboard data yet. Use /gkstart to get on the board!');
    return;
  }

  const seasonLabel = season ? `Season ${season.id}` : 'All Time';
  const lines = entries.map((r, i) => {
    const name = escapeHtml(displayNameFromRow(r));
    return `${i + 1}. ${name} — ${r.xp || 0} XP`;
  }).join('\n');

  await sendTelegramMessage(tok, chatId,
    `🏆 <b>Leaderboard — ${seasonLabel}</b>\n\n${lines}`
  );
}

async function cmdGkQuests(db, tok, chatId) {
  const now  = new Date().toISOString();
  const rows = await db.prepare(
    `SELECT id, title, description, xp_reward
     FROM telegram_quests
     WHERE is_active = 1
       AND (start_date IS NULL OR start_date <= ?)
       AND (end_date IS NULL OR end_date >= ?)
     ORDER BY created_at DESC
     LIMIT 5`
  ).bind(now, now).all().catch(() => ({ results: [] }));

  const quests = rows.results || [];
  if (!quests.length) {
    await sendTelegramMessage(tok, chatId, '🔍 No active missions right now. Check back soon!');
    return;
  }

  const lines = quests.map(q =>
    `📜 <b>${escapeHtml(q.title)}</b> — ${q.xp_reward} XP\n` +
    `   ${escapeHtml(q.description || '')}`
  ).join('\n\n');

  await sendTelegramMessage(tok, chatId, `🗺️ <b>Active Missions</b>\n\n${lines}`);
}

async function cmdGkFaction(db, tok, chatId, telegramId, argStr) {
  const requested = (argStr || '').trim().toLowerCase();

  // Anti-cheat gate: blocked accounts cannot change faction (competitive action).
  try {
    const acState = await db.prepare(
      `SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?`
    ).bind(telegramId).first();
    if (acState && acState.is_blocked === 1) {
      await sendTelegramMessage(tok, chatId,
        `🚫 Your account is blocked from competitive actions. Contact the Moonboys community on Telegram to appeal.`
      );
      return;
    }
  } catch (error) {
    logApiFailure('gkfaction_anticheat_check_failed', {
      telegramId,
      message: error?.message || String(error),
    });
  }

  // Fetch available factions from the DB
  const factionsResult = await db.prepare(
    `SELECT id, name, description, icon FROM telegram_factions ORDER BY name`
  ).all().catch(() => ({ results: [] }));
  const factions = factionsResult.results || [];

  if (!requested) {
    // Show current faction and available list
    const current = await getUserFaction(db, telegramId);
    const factionList = factions
      .map(f => `${f.icon ? escapeHtml(f.icon) + ' ' : ''}<code>${escapeHtml(f.name)}</code>`)
      .join(', ');
    await sendTelegramMessage(tok, chatId,
      `⚔️ <b>Faction</b>\n\n` +
      `Current: <b>${current ? escapeHtml(current.name) : 'None'}</b>\n\n` +
      `To join a faction:\n<code>/gkfaction &lt;name&gt;</code>\n\n` +
      `Available: ${factionList || 'none listed yet'}`
    );
    return;
  }

  // Find the faction by name (case-insensitive)
  const target = factions.find(f => f.name.toLowerCase() === requested);
  if (!target) {
    const list = factions.map(f => escapeHtml(f.name)).join(', ');
    await sendTelegramMessage(tok, chatId,
      `❌ Unknown faction. Available:\n<code>${list || 'none listed yet'}</code>`
    );
    return;
  }

  // Upsert faction membership — UNIQUE(telegram_id) means one faction per user
  await db.prepare(`
    INSERT INTO telegram_faction_members (telegram_id, faction_id, role)
    VALUES (?, ?, 'member')
    ON CONFLICT(telegram_id) DO UPDATE SET faction_id = excluded.faction_id
  `).bind(telegramId, target.id).run().catch((error) => {
    logApiFailure('gkfaction_membership_upsert_failed', {
      telegramId,
      factionId: target.id,
      message: error?.message || String(error),
    });
  });

  await logTelegramActivity(db, telegramId, 'faction_join',
    JSON.stringify({ faction: target.name })).catch((error) => {
    logApiFailure('gkfaction_activity_log_failed', {
      telegramId,
      faction: target.name,
      message: error?.message || String(error),
    });
  });

  await sendTelegramMessage(tok, chatId,
    `⚔️ You have joined faction <b>${escapeHtml(target.name)}</b>. Loyalty noted, moonboy.`
  );
}

async function cmdGkUnlink(db, tok, chatId, telegramId) {
  try {
    await db.prepare(
      `UPDATE telegram_link_tokens SET is_used = 1 WHERE telegram_id = ? AND is_used = 0`
    ).bind(telegramId).run();

    await sendTelegramMessage(tok, chatId,
      `🔓 <b>Tokens Invalidated</b>\n\n` +
      `All outstanding link tokens for your account have been invalidated.\n` +
      `To generate a new link, use /gklink`
    );
  } catch {
    await sendTelegramMessage(tok, chatId, '⚠️ Failed to invalidate tokens. Please try again.');
  }
}

async function cmdDaily(db, tok, chatId, telegramId) {
  const today = getTodayUtcDate();

  // Anti-cheat gate: blocked accounts cannot claim XP.
  try {
    const acState = await db.prepare(
      `SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?`
    ).bind(telegramId).first();
    if (acState && acState.is_blocked === 1) {
      await sendTelegramMessage(tok, chatId,
        `🚫 Your account is blocked from competitive actions. Contact the Moonboys community on Telegram to appeal.`
      );
      return;
    }
  } catch (error) {
    logApiFailure('daily_anticheat_check_failed', {
      telegramId,
      message: error?.message || String(error),
    });
  }

  // Check if already claimed today using telegram_xp_log
  if (await hasDailyClaimToday(db, telegramId).catch(() => false)) {
    await sendTelegramMessage(tok, chatId,
      `⏳ You already claimed your daily XP today (UTC: ${today}).\nCome back tomorrow!`
    );
    return;
  }

  await awardXp(db, telegramId, XP_DAILY_CLAIM, 'daily_claim', today).catch((error) => {
    logApiFailure('daily_xp_award_failed', {
      telegramId,
      date: today,
      message: error?.message || String(error),
    });
  });
  await logTelegramActivity(db, telegramId, 'daily_claim').catch((error) => {
    logApiFailure('daily_activity_log_failed', {
      telegramId,
      date: today,
      message: error?.message || String(error),
    });
  });

  await sendTelegramMessage(tok, chatId,
    `✅ Daily XP claimed! +${XP_DAILY_CLAIM} XP\n\nSee you tomorrow, moonboy. 🚀`
  );
}

/**
 * /solve — disabled until a server-side answer system exists.
 * The real telegram_quests table has no answer_hash column, so automated
 * answer checking is not possible. Quest completions are awarded manually.
 */
async function cmdSolve(tok, chatId) {
  await sendTelegramMessage(tok, chatId,
    `⚠️ <b>Quest solving is currently manual/disabled.</b>\n\n` +
    `The automated answer-checking system is not yet active.\n` +
    `Quest completions will be awarded manually by admins.\n\n` +
    `Use /gkquests to see active missions.`
  );
}

async function cmdProfile(db, tok, chatId, telegramId) {
  const [user, faction, completions] = await Promise.all([
    db.prepare(
      `SELECT username, first_name, last_name, xp, level, created_at
       FROM telegram_users WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => null),
    getUserFaction(db, telegramId),
    db.prepare(
      `SELECT COUNT(*) AS n FROM telegram_quest_completions WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => ({ n: 0 })),
  ]);

  if (!user) {
    await sendTelegramMessage(tok, chatId, '❓ No profile found. Use /start to create one.');
    return;
  }

  const displayName = escapeHtml(getTelegramDisplayName({ ...user, id: telegramId }));
  const factionName = faction ? escapeHtml(faction.name) : 'None';

  await sendTelegramMessage(tok, chatId,
    `👤 <b>Profile</b>\n\n` +
    `Name:         ${displayName}\n` +
    `Faction:      ${factionName}\n` +
    `XP:           ${user.xp || 0}\n` +
    `Level:        ${user.level || 1}\n` +
    `Quests done:  ${completions?.n || 0}\n` +
    `Member since: ${(user.created_at || '').slice(0, 10)}`
  );
}

// ── Admin moderation command implementations ──────────────────────────────────

/**
 * Parse the first argument of an admin command into a target identifier.
 * Accepts "@username" or a raw numeric Telegram ID.
 * Returns { username } for @-prefixed values or { telegram_id } for numeric ones.
 */
function parseAdminTarget(argStr) {
  const first = (argStr || '').trim().split(/\s+/)[0] || '';
  if (!first) return null;
  if (first.startsWith('@')) return { username: first.slice(1) };
  if (/^\d+$/.test(first))   return { telegram_id: first };
  // Bare word treated as username
  return { username: first };
}

/**
 * Resolve a display label for the target (used in bot reply messages).
 * Prefers @username when available, falls back to the telegram_id.
 */
async function resolveTargetLabel(db, target) {
  if (!target) return '(unknown)';
  if (target.telegram_id) {
    const row = await db.prepare(
      `SELECT username FROM telegram_users WHERE telegram_id = ? LIMIT 1`
    ).bind(target.telegram_id).first().catch(() => null);
    return row?.username ? `@${row.username}` : target.telegram_id;
  }
  if (target.username) return `@${target.username}`;
  return '(unknown)';
}

/**
 * /gkban <@username|telegram_id> [reason]
 * Admin-only. Blocks the target user via the anti-cheat worker.
 */
async function cmdGkBan(db, tok, chatId, callerTelegramId, argStr, env) {
  if (!isAdminTelegramUser(callerTelegramId, env)) {
    await sendTelegramMessage(tok, chatId, '🚫 You do not have permission to use this command.');
    return;
  }

  const target = parseAdminTarget(argStr);
  if (!target) {
    await sendTelegramMessage(tok, chatId,
      '⚠️ Usage: /gkban <@username|telegram_id> [reason]');
    return;
  }

  // Extract optional reason: everything after the first word
  const parts  = (argStr || '').trim().split(/\s+/);
  const reason = parts.slice(1).join(' ').trim() || 'Admin ban';

  const label = await resolveTargetLabel(db, target);
  const result = await callAntiCheatWorker(env, 'POST', '/anticheat/block', {
    ...target,
    block_type: 'season',
    reason,
  });

  if (result?.ok) {
    await sendTelegramMessage(tok, chatId,
      `🚫 User ${escapeHtml(label)} has been blocked.\nReason: ${escapeHtml(reason)}`);
  } else {
    await sendTelegramMessage(tok, chatId,
      `⚠️ Failed to block ${escapeHtml(label)}: ${escapeHtml(result?.error || 'unknown error')}`);
  }
}

/**
 * /gkunban <@username|telegram_id>
 * Admin-only. Unblocks the target user via the anti-cheat worker.
 */
async function cmdGkUnban(db, tok, chatId, callerTelegramId, argStr, env) {
  if (!isAdminTelegramUser(callerTelegramId, env)) {
    await sendTelegramMessage(tok, chatId, '🚫 You do not have permission to use this command.');
    return;
  }

  const target = parseAdminTarget(argStr);
  if (!target) {
    await sendTelegramMessage(tok, chatId,
      '⚠️ Usage: /gkunban <@username|telegram_id>');
    return;
  }

  const label  = await resolveTargetLabel(db, target);
  const result = await callAntiCheatWorker(env, 'POST', '/anticheat/unblock', target);

  if (result?.ok) {
    await sendTelegramMessage(tok, chatId,
      `✅ User ${escapeHtml(label)} has been unblocked.`);
  } else {
    await sendTelegramMessage(tok, chatId,
      `⚠️ Failed to unblock ${escapeHtml(label)}: ${escapeHtml(result?.error || 'unknown error')}`);
  }
}

/**
 * /gkrisk <@username|telegram_id>
 * Admin-only. Fetches and displays the target user's anti-cheat risk state.
 */
async function cmdGkRisk(db, tok, chatId, callerTelegramId, argStr, env) {
  if (!isAdminTelegramUser(callerTelegramId, env)) {
    await sendTelegramMessage(tok, chatId, '🚫 You do not have permission to use this command.');
    return;
  }

  const target = parseAdminTarget(argStr);
  if (!target) {
    await sendTelegramMessage(tok, chatId,
      '⚠️ Usage: /gkrisk <@username|telegram_id>');
    return;
  }

  // Build the query-string for the GET /anticheat/status route
  const qp    = target.telegram_id
    ? `telegram_id=${encodeURIComponent(target.telegram_id)}`
    : `username=${encodeURIComponent(target.username)}`;
  const label  = await resolveTargetLabel(db, target);
  const result = await callAntiCheatWorker(env, 'GET', `/anticheat/status?${qp}`);

  if (result?.error) {
    await sendTelegramMessage(tok, chatId,
      `⚠️ Could not fetch risk data for ${escapeHtml(label)}: ${escapeHtml(result.error)}`);
    return;
  }

  const s = result?.state;
  if (!s) {
    await sendTelegramMessage(tok, chatId,
      `ℹ️ No anti-cheat record found for ${escapeHtml(label)}.`);
    return;
  }

  const blockStatus = s.is_blocked ? `🔴 BLOCKED (${s.block_type})` : '🟢 Clean';
  await sendTelegramMessage(tok, chatId,
    `🔍 <b>Risk Report — ${escapeHtml(label)}</b>\n\n` +
    `Status:         ${blockStatus}\n` +
    `Season risk:    ${s.season_risk_score ?? 0}\n` +
    `Year risk:      ${s.year_risk_score ?? 0}\n` +
    `Lifetime strikes: ${s.lifetime_strikes ?? 0}\n` +
    `Block reason:   ${escapeHtml(s.blocked_reason || 'N/A')}\n` +
    `Last scan:      ${(s.last_scan_at || 'never').slice(0, 16)}`
  );
}

/**
 * /gkclearstrikes <@username|telegram_id>
 * Admin-only. Clears lifetime strikes for the target user.
 */
async function cmdGkClearStrikes(db, tok, chatId, callerTelegramId, argStr, env) {
  if (!isAdminTelegramUser(callerTelegramId, env)) {
    await sendTelegramMessage(tok, chatId, '🚫 You do not have permission to use this command.');
    return;
  }

  const target = parseAdminTarget(argStr);
  if (!target) {
    await sendTelegramMessage(tok, chatId,
      '⚠️ Usage: /gkclearstrikes <@username|telegram_id>');
    return;
  }

  const label  = await resolveTargetLabel(db, target);
  const result = await callAntiCheatWorker(env, 'POST', '/anticheat/clear-strikes', target);

  if (result?.ok) {
    await sendTelegramMessage(tok, chatId,
      `✅ Lifetime strikes cleared for ${escapeHtml(label)}.`);
  } else {
    await sendTelegramMessage(tok, chatId,
      `⚠️ Failed to clear strikes for ${escapeHtml(label)}: ${escapeHtml(result?.error || 'unknown error')}`);
  }
}

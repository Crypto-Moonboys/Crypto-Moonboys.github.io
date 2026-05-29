import { GEMS_MAX, GEMS_MIN, TELEGRAM_AUTH_MAX_AGE, XP_MAX, XP_MIN } from './blocktopia/config.js';
import { verifyTelegramIdentityFromBody } from './blocktopia/auth.js';
import { getOrCreateBlockTopiaProgression, hasBlockTopiaFactionColumns } from './blocktopia/db.js';
import { handleBlockTopiaProgressionRoute } from './blocktopia/routes.js';
import { handleRogueliteDailyRoutes } from './routes/daily-digest.js';
import { CANONICAL_FACTION_KEYS, FACTION_UNALIGNED, normalizeFaction, getFactionXpMultiplier } from './shared/faction-canon.js';
/**
 * Moonboys API — Cloudflare Worker entrypoint
 *
 * Backed by D1 database "wikicoms" (binding: DB).
 * Uses ONLY the real live tables present in the D1 instance.
 *
 * Routes:
 *   GET  /health
 *   GET  /sam/status
 *   POST /admin/blocktopia/access
 *   POST /admin/blocktopia/grant-xp
 *   POST /admin/arcade/grant-xp
 *   POST /telegram/auth
 *   POST /telegram/webhook
 *   GET  /telegram/profile?telegram_id=
 *   GET  /telegram/leaderboard?limit=
 *   GET  /telegram/quests
 *   POST /telegram/link
 *   GET  /telegram/link/confirm?token=
 *   POST /telegram/link/confirm
 *   GET  /telegram/activity?limit=
 *   GET  /telegram/daily-status?telegram_id=
 *   GET  /telegram/season/current
 *   GET  /telegram/user/status?telegram_id=
 *   GET/POST /player/state
 *   GET/POST /player/modifiers
 *   POST /player/modifiers/active
 *   GET/POST /player/daily-missions
 *   POST /player/daily-missions/progress
 *   GET/POST /faction/signal
 *   POST /faction/signal/contribute
 *   GET  /battle-chamber/factions/standings?period=weekly
 *   GET  /battle-chamber/factions/:faction_id
 *   GET  /battle-chamber/faction?faction_id=
 *   GET  /battle-chamber/activity?limit=20
 *   POST /battle-chamber/event
 *   POST /player/mastery/update
 *   GET  /roguelite/daily-state  (legacy query-auth compatibility; deprecated for linked state)
 *   POST /roguelite/daily-state  JSON { telegram_auth }
 *   GET  /roguelite/missed-history?limit=30  (legacy query-auth compatibility; deprecated for linked state)
 *   POST /roguelite/missed-history  JSON { telegram_auth, limit, utc_day }
 *   POST /roguelite/mark-missed
 *   POST /telegram/daily-digest/run
 *   POST /telegram/group-announcements/run
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
 *   TELEGRAM_GROUP_CHAT_ID   — main Telegram group chat ID for group announcements
 *   TELEGRAM_GROUP_THREAD_ID — optional Telegram topic/thread ID for group announcements
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
const ARCADE_XP_PER_POINT = 0.02;
const ARCADE_XP_MAX_PER_RUN = 120;
const ARCADE_XP_DAILY_CAP = 2200;
const ARCADE_REPEAT_WINDOW_MINUTES = 30;
const ARCADE_REPEAT_COOLDOWN_MINUTES = 10;
const ARCADE_MAX_BATCH_ENTRIES = 50;
const ARCADE_SCORE_SANITY_MAX = 1_000_000_000;
const BLOCKTOPIA_ADMIN_XP_GRANT_MAX = 50000;
const BLOCKTOPIA_ADMIN_GEMS_GRANT_MAX = 50000;
const ARCADE_ADMIN_XP_GRANT_MAX = 50000;

const DEFAULT_CORS_ALLOWED_ORIGINS = [
  'https://cryptomoonboys.com',
];

/**
 * Returns CORS + security headers for a given request.
 * Reflects the request Origin only if it is in the allowlist.
 * CORS_ALLOWED_ORIGINS env var overrides the default list (comma-separated).
 */
function buildCorsHeaders(request, env) {
  const origin = (request && request.headers) ? (request.headers.get('Origin') || '') : '';
  const allowed = env && env.CORS_ALLOWED_ORIGINS
    ? String(env.CORS_ALLOWED_ORIGINS).split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_CORS_ALLOWED_ORIGINS;
  const allowedOrigin = allowed.includes(origin) ? origin : (allowed[0] || 'null');
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret, x-admin-secret',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  };
}

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

// CORS_HEADERS is a module-level reference updated at the start of each fetch() invocation.
// Cloudflare Workers run each request in its own V8 isolate context, so there is no
// concurrent-request race condition — module-level state is request-scoped in practice.
// The mutable reference avoids threading `request` through every json()/err() call site.
// NOTE: Do not reuse this worker outside a Cloudflare Workers runtime without refactoring
// this to a parameter-passing pattern.
let CORS_HEADERS = buildCorsHeaders(null, null);

function logApiFailure(event, context = {}) {
  console.log('[moonboys-api]', JSON.stringify({
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

function logApiEvent(event, context = {}) {
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

const FACTION_SWITCH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FACTION_CONFIG = {
  // Canonical 9-faction keys — mirrors LIVE_FACTIONS in battle-chamber-factions.js
  'hard-fork-rockers': {
    label: 'Hard Fork Rockers',
    icon: '🪨',
    color: '#56dcff',
    bonus: '+endurance stability and streak protection',
  },
  'rugpull-miners': {
    label: 'Rugpull Miners',
    icon: '⛏️',
    color: '#ff6ad5',
    bonus: '+defensive recovery and shield support',
  },
  graffpunks: {
    label: 'GraffPUNKS',
    icon: '🎨',
    color: '#7dff72',
    bonus: '+chaos bursts and combo pressure',
  },
  'blockchain-furies': {
    label: 'Blockchain Furies',
    icon: '🔥',
    color: '#ff9f43',
    bonus: '+speed pressure and revenge momentum',
  },
  'crypto-moongirls': {
    label: 'Crypto Moongirls',
    icon: '🌙',
    color: '#b88dff',
    bonus: '+precision control and penalty resistance',
  },
  blockstars: {
    label: 'The Blockstars',
    icon: '⭐',
    color: '#ffd166',
    bonus: '+featured clout tracks and spotlight scoring',
  },
  'all-city-bulls': {
    label: 'All City Bulls',
    icon: '🐂',
    color: '#ff6b6b',
    bonus: '+score pressure and war push',
  },
  'nomad-bears': {
    label: 'Nomad Bears',
    icon: '🐻',
    color: '#8ecf7a',
    bonus: '+route variety and consistency rewards',
  },
  'crypto-stoned-boys': {
    label: 'Crypto Stoned Boys',
    icon: '😶‍🌫️',
    color: '#8fd3ff',
    bonus: '+chill streak comfort and random branch luck',
  },
  unaligned: {
    label: 'Unaligned',
    icon: '◌',
    color: '#8b949e',
    bonus: 'No faction bonus active',
  },
};

function factionMeta(faction) {
  const key = normalizeFaction(faction) || FACTION_UNALIGNED;
  const cfg = FACTION_CONFIG[key] || FACTION_CONFIG.unaligned;
  return {
    key,
    label: cfg.label,
    icon: cfg.icon,
    color: cfg.color,
    bonus: cfg.bonus,
    xp_multiplier: getFactionXpMultiplier(key),
  };
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

function readAdminSecret(request) {
  return request.headers.get('x-admin-secret')
    || request.headers.get('X-Admin-Secret')
    || '';
}

async function timingSafeEqualString(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(String(left || ''));
  const rightBytes = encoder.encode(String(right || ''));
  if (leftBytes.length !== rightBytes.length) return false;
  if (crypto.subtle && typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
  }
  let diff = 0;
  for (let i = 0; i < leftBytes.length; i += 1) diff |= leftBytes[i] ^ rightBytes[i];
  return diff === 0;
}

async function isAuthorizedByAdminSecret(request, env) {
  const configuredSecret = String(env.ADMIN_SECRET || '').trim();
  const headerSecret = readAdminSecret(request);
  if (!configuredSecret || !headerSecret) return false;
  return timingSafeEqualString(headerSecret, configuredSecret);
}

async function createTelegramLinkToken(db, telegramId) {
  const normalizedTelegramId = String(telegramId || '').trim();
  if (!/^\d{1,20}$/.test(normalizedTelegramId)) {
    throw new Error('telegram_id invalid');
  }

  await db.prepare(
    `UPDATE telegram_link_tokens SET is_used = 1 WHERE telegram_id = ? AND is_used = 0`
  ).bind(normalizedTelegramId).run();

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await db.prepare(
    `INSERT INTO telegram_link_tokens (token, telegram_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, normalizedTelegramId, expiresAt).run();

  return { token, expires_at: expiresAt };
}

async function writeBlockTopiaAdminGrantAudit(db, {
  telegramId,
  adminTelegramId,
  xpChange = 0,
  gemsChange = 0,
  reason = null,
}) {
  try {
    await db.prepare(`
      INSERT INTO blocktopia_progression_events
        (id, telegram_id, action, action_type, score, xp_change, gems_change, admin_telegram_id, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      'admin_grant',
      'blocktopia_grant_xp_gems',
      0,
      Math.floor(Number(xpChange) || 0),
      Math.floor(Number(gemsChange) || 0),
      adminTelegramId,
      reason || null,
    ).run();
  } catch {
    await db.prepare(`
      INSERT INTO blocktopia_progression_events
        (id, telegram_id, action, action_type, score, xp_change, gems_change)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      'admin_grant',
      'blocktopia_grant_xp_gems',
      0,
      Math.floor(Number(xpChange) || 0),
      Math.floor(Number(gemsChange) || 0),
    ).run();
  }
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
    return { ok: false, status: 0, error: 'missing_chat_or_token' };
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
      return { ok: false, status: response.status, response: responseText, error: 'telegram_send_failed' };
    }
    return { ok: true, status: response.status, response: responseText };
  } catch (error) {
    console.log('TG send exception:', error?.message || error);
    return { ok: false, status: 0, error: error?.message || String(error) };
  }
}

/**
 * Verify a Telegram Login Widget auth payload against the bot token.
 * Algorithm: https://core.telegram.org/widgets/login#checking-authorization
 */
async function verifyTelegramAuth(data, botToken) {
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

function buildTelegramAuthCheckString(fields) {
  return Object.keys(fields || {})
    .filter(k => fields[k] != null)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n');
}

async function signTelegramAuthPayload(fields, botToken) {
  if (!botToken) return null;
  const checkString = buildTelegramAuthCheckString(fields);
  const secretKeyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken));
  const hmacKey = await crypto.subtle.importKey(
    'raw', secretKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(checkString));
  return Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function buildSignedTelegramAuthPayload(identity, botToken, authDateSeconds) {
  if (!identity || !identity.id || !botToken) return null;
  const authDate = String(authDateSeconds || Math.floor(Date.now() / 1000));
  const fields = {
    id: String(identity.id),
    first_name: identity.first_name || null,
    last_name: identity.last_name || null,
    username: identity.username || null,
    photo_url: identity.photo_url || null,
    auth_date: authDate,
  };
  const hash = await signTelegramAuthPayload(fields, botToken);
  if (!hash) return null;
  return { ...fields, hash };
}

function parseTelegramAuthEvidence(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue === 'object') return rawValue;
  if (typeof rawValue !== 'string') return null;
  try {
    return JSON.parse(rawValue);
  } catch {}
  try {
    const normalized = rawValue.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
    return JSON.parse(atob(padded));
  } catch {}
  return null;
}

async function verifyTelegramAuthEvidenceForRestore(body, env) {
  const tg = parseTelegramAuthEvidence(body?.telegram_auth || body?.auth_evidence || body);
  if (!tg || typeof tg !== 'object') return null;
  const telegramId = String(tg.id || '').trim();
  const authDate = String(tg.auth_date || '').trim();
  const hash = String(tg.hash || '').trim();
  if (!/^\d{1,20}$/.test(telegramId)) return null;
  if (!/^\d{1,12}$/.test(authDate)) return null;
  if (!/^[a-f0-9]{64}$/i.test(hash)) return null;
  const authDateSeconds = parseInt(authDate, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDateSeconds)) return null;
  if (authDateSeconds - now > 300) return null;
  let valid = false;
  try {
    valid = await verifyTelegramAuth({
      id: telegramId,
      first_name: tg.first_name,
      last_name: tg.last_name,
      username: tg.username,
      photo_url: tg.photo_url,
      auth_date: authDate,
      hash,
    }, env.TELEGRAM_BOT_TOKEN);
  } catch {
    return null;
  }
  if (!valid) return null;
  return {
    telegramId,
    authPayload: {
      id: telegramId,
      first_name: tg.first_name || null,
      last_name: tg.last_name || null,
      username: tg.username || null,
      photo_url: tg.photo_url || null,
      auth_date: authDate,
      hash,
    },
  };
}

function encodeTelegramAuthPayloadForUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  try {
    return encodeURIComponent(JSON.stringify(payload));
  } catch (error) {
    console.log('[telegram_link]', JSON.stringify({
      event: 'payload_encode_failed',
      message: error?.message || String(error),
      timestamp: new Date().toISOString(),
    }));
    return '';
  }
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
  await db.prepare(`
    INSERT INTO telegram_xp_log (telegram_id, action, xp_change, reference_id)
    VALUES (?, ?, ?, ?)
  `).bind(telegramId, action, xpChange, referenceId || null).run();

  await db.prepare(`
    UPDATE telegram_users
    SET xp         = xp + ?,
        level      = CAST((xp + ?) / 100 AS INTEGER) + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(xpChange, xpChange, telegramId).run();
}

async function ensureArcadeProgressionTables(db) {
  const requiredTables = [
    'arcade_progression_state',
    'arcade_progression_events',
    'arcade_game_enforcement_state',
  ];
  for (const tableName of requiredTables) {
    const row = await db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `).bind(tableName).first().catch(() => null);
    if (!row?.name) {
      throw new Error(`missing_required_table:${tableName}`);
    }
  }
}

function normalizeArcadeGameKey(value) {
  const key = String(value || 'global').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const aliases = {
    'invaders-3008': 'invaders',
    invaders3008: 'invaders',
    'pac-chain': 'pacchain',
    pac_chain: 'pacchain',
    'asteroid-fork': 'asteroids',
    asteroid_fork: 'asteroids',
    'breakout-bullrun': 'breakout',
    breakout_bullrun: 'breakout',
    'tetris-block-topia': 'tetris',
    tetris_block_topia: 'tetris',
    'crystal-quest': 'crystal',
    crystal_quest: 'crystal',
    'snake-run': 'snake',
    snake_run: 'snake',
    'block-topia-quest-maze': 'btqm',
    block_topia_quest_maze: 'btqm',
    blocktopia: 'btqm',
  };
  const normalized = aliases[key] || key || 'global';
  const allowed = new Set(['invaders', 'pacchain', 'asteroids', 'breakout', 'tetris', 'crystal', 'snake', 'btqm', 'global']);
  return allowed.has(normalized) ? normalized : 'global';
}

function normalizeScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(ARCADE_SCORE_SANITY_MAX, Math.floor(n)));
}

function normalizeMetaPoints(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1_000_000_000, Math.floor(n)));
}

function computeNormalizedArcadePoints(game, rawScore, localMetaPoints) {
  const safeScore = normalizeScore(rawScore);
  const safeMeta = normalizeMetaPoints(localMetaPoints);
  const difficultyWeights = {
    invaders: 1.35,
    pacchain: 1.1,
    asteroids: 1.15,
    breakout: 1.15,
    tetris: 1.05,
    crystal: 1.0,
    snake: 0.95,
    btqm: 1.25,
    global: 1.0,
  };
  const gameWeight = Number(difficultyWeights[normalizeArcadeGameKey(game)]) || 1;
  const fromScore = Math.floor((safeScore / 25) * gameWeight);
  const blended = Math.max(fromScore, Math.floor(safeMeta * 0.85));
  return Math.max(0, Math.min(200000, blended));
}

function sqliteNowFromMs(ms = Date.now()) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function isoDayFromMs(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseSqliteTs(value) {
  if (!value) return null;
  const text = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  const ts = Date.parse(text);
  return Number.isFinite(ts) ? ts : null;
}

async function getOrCreateArcadeProgressionState(db, telegramId, nowMs = Date.now()) {
  const dayKey = isoDayFromMs(nowMs);
  await db.prepare(`
    INSERT INTO arcade_progression_state
      (telegram_id, arcade_xp_total, arcade_daily_xp, arcade_daily_key, arcade_restriction_level, restricted_until, updated_at)
    VALUES (?, 0, 0, ?, 0, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO NOTHING
  `).bind(telegramId, dayKey).run();

  const row = await db.prepare(`
    SELECT telegram_id, arcade_xp_total, arcade_daily_xp, arcade_daily_key, arcade_restriction_level, restricted_until
    FROM arcade_progression_state
    WHERE telegram_id = ?
    LIMIT 1
  `).bind(telegramId).first();

  if (!row) {
    return {
      telegram_id: telegramId,
      arcade_xp_total: 0,
      arcade_daily_xp: 0,
      arcade_daily_key: dayKey,
      arcade_restriction_level: 0,
      restricted_until: null,
    };
  }

  if (String(row.arcade_daily_key || '') !== dayKey) {
    await db.prepare(`
      UPDATE arcade_progression_state
      SET arcade_daily_xp = 0, arcade_daily_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(dayKey, telegramId).run();
    return {
      ...row,
      arcade_daily_xp: 0,
      arcade_daily_key: dayKey,
    };
  }
  return row;
}

async function getOrCreateGameEnforcementState(db, telegramId, game) {
  await db.prepare(`
    INSERT INTO arcade_game_enforcement_state
      (telegram_id, game, ceiling_hits, cooldown_level, cooldown_until, last_ceiling_hit_at, repeat_window_expires_at, xp_weight, lockout_until, lockout_count, updated_at)
    VALUES (?, ?, 0, 0, NULL, NULL, NULL, 1.0, NULL, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id, game) DO NOTHING
  `).bind(telegramId, game).run();

  const row = await db.prepare(`
    SELECT telegram_id, game, ceiling_hits, cooldown_level, cooldown_until, last_ceiling_hit_at,
           repeat_window_expires_at, xp_weight, lockout_until, lockout_count
    FROM arcade_game_enforcement_state
    WHERE telegram_id = ? AND game = ?
    LIMIT 1
  `).bind(telegramId, game).first();
  return row || {
    telegram_id: telegramId,
    game,
    ceiling_hits: 0,
    cooldown_level: 0,
    cooldown_until: null,
    last_ceiling_hit_at: null,
    repeat_window_expires_at: null,
    xp_weight: 1,
    lockout_until: null,
    lockout_count: 0,
  };
}

/**
 * Log an activity entry into telegram_activity_log.
 * Never throws — failures are silently swallowed.
 */
async function logTelegramActivity(db, telegramId, action, metadata = '') {
  await db.prepare(`
    INSERT INTO telegram_activity_log (telegram_id, action, metadata)
    VALUES (?, ?, ?)
  `).bind(telegramId, action, metadata || null).run().catch((error) => {
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

// ── Player state helpers ──────────────────────────────────────────────────────

// Maximum contribution points accepted per single faction signal request.
// Prevents arbitrarily large client numbers from skewing faction totals.
const FACTION_SIGNAL_CONTRIBUTION_MAX = 10000;

// Allowed reason values for faction signal contributions.
const FACTION_SIGNAL_ALLOWED_REASONS = new Set([
  'score_submission', 'mission_complete', 'arcade_run', 'daily_bonus', 'war_contribution', 'manual',
]);

const BATTLE_CHAMBER_TABLES = [
  'battle_chamber_faction_clout',
  'battle_chamber_member_clout',
  'battle_chamber_activity_log',
];

const BATTLE_CHAMBER_PERIODS = Object.freeze(['daily', 'weekly', 'monthly', 'seasonal']);

const BATTLE_CHAMBER_EVENT_TYPES = new Set([
  'score_accept',
  'faction_join',
  'mission_complete',
  'daily_mission_progress',
  'weekly_contribution',
  'streak_bonus',
  'reward_unlock',
  'manual_safe_event',
]);

const BATTLE_CHAMBER_FACTIONS = CANONICAL_FACTION_KEYS;

const BATTLE_CHAMBER_FACTION_LABELS = Object.freeze({
  'hard-fork-rockers': 'Hard Fork Rockers',
  'rugpull-miners': 'Rugpull Miners',
  graffpunks: 'GraffPUNKS',
  'blockchain-furies': 'Blockchain Furies',
  'crypto-moongirls': 'Crypto Moongirls',
  blockstars: 'The Blockstars',
  'all-city-bulls': 'All City Bulls',
  'nomad-bears': 'Nomad Bears',
  'crypto-stoned-boys': 'Crypto Stoned Boys',
});

const BATTLE_CHAMBER_CLAMP_MAX = 5000;
const BATTLE_CHAMBER_METADATA_MAX_LENGTH = 4000;
const BATTLE_CHAMBER_SEASON_EPOCH_MS = Date.UTC(2024, 0, 1);
const BATTLE_CHAMBER_DAYS_PER_SEASON = 90;

const PLAYER_STATE_TABLES = [
  'player_modifier_state',
  'player_daily_mission_state',
  'player_faction_signal_state',
  'player_streak_state',
  'player_game_mastery_state',
];

const DAILY_DIGEST_TABLES = [
  'daily_missed_perks',
  'telegram_daily_digest_log',
  'daily_opportunity_state',
];
const TELEGRAM_GROUP_ANNOUNCEMENT_TABLES = [
  'telegram_group_announcement_log',
];
const DAILY_WTF_TABLES = [
  'daily_wtf_events',
  'daily_wtf_player_events',
  'daily_wtf_chain_options',
];
const WTF_MAX_CHAIN_DEPTH = 5;
const WTF_MAX_CHAIN_TRIGGERS_PER_DAY = 12;
const WTF_MAX_BONUS_XP_PER_EVENT = 500;
const WTF_ALLOWED_COMPLETION_SOURCES = new Set([
  'arcade_run_accepted',
  'faction_daily_mission',
  'battle_chamber_proof',
  'roguelite_branch',
]);
const WTF_REQUIRED_ACTION_SOURCE_MAP = Object.freeze({
  play_any_accepted_arcade_run: ['arcade_run_accepted'],
  complete_faction_or_battle_action: ['faction_daily_mission', 'battle_chamber_proof'],
  score_target_any_game: ['arcade_run_accepted'],
  choose_and_complete_chaos_path: ['roguelite_branch', 'arcade_run_accepted'],
});

const DAILY_MISSED_TEXT_LIMITS = Object.freeze({
  source: 80,
  opportunityType: 80,
  title: 140,
  description: 400,
  missedReason: 160,
});

const DAILY_MISSED_HISTORY_MAX_LIMIT = 100;
// Notional XP values per event type (never awarded; tracking only).
// status_value (0/1) is a presence flag — missed_xp_value is the real XP amount.
const MISSED_XP_PER_TIMED_EVENT = 50;   // WTF signal window missed
const MISSED_XP_PER_DAILY_WINDOW = 25;  // daily activation window backfill
const DIGEST_PENDING_STALE_MINUTES = 15;
const DIGEST_PENDING_STALE_MS = DIGEST_PENDING_STALE_MINUTES * 60 * 1000;
const DIGEST_SEND_BATCH_SIZE = 12;
const DIGEST_SEND_MAX_CONCURRENCY = 3;

async function ensurePlayerStateTables(db) {
  for (const tableName of PLAYER_STATE_TABLES) {
    const row = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    ).bind(tableName).first().catch(() => null);
    if (!row?.name) {
      // Return a structured Response so callers can return it directly.
      // This is not a server error — it means migration 015 has not been applied yet.
      return {
        _isPlayerStateUnavailable: true,
        tableName,
        response: new Response(JSON.stringify({
          ok: false,
          error: 'player_state_unavailable',
          reason: `migration_pending:${tableName}`,
          message: 'Player state tables are not yet configured. Apply migration 015.',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }),
      };
    }
  }
  return null; // all tables present
}

function safeJsonParse(raw, fallback) {
  try { return raw != null ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function getIsoWeekKey() {
  const d = new Date();
  const dow = d.getUTCDay() || 7;
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (4 - dow)));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thu - yearStart) / 86400000 + 1) / 7);
  return thu.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
}

async function ensureBattleChamberTables(db) {
  const checks = await Promise.all(BATTLE_CHAMBER_TABLES.map((tableName) =>
    db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    ).bind(tableName).first().catch(() => null).then((row) => ({ tableName, row }))
  ));
  const missing = checks.find((entry) => !entry.row?.name);
  if (missing) {
    return {
      _isBattleChamberUnavailable: true,
      tableName: missing.tableName,
      response: new Response(JSON.stringify({
        ok: false,
        error: 'battle_chamber_unavailable',
        reason: `migration_pending:${missing.tableName}`,
        message: 'Battle Chamber authority tables are not yet configured. Apply migration 016.',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      }),
    };
  }
  return null;
}

// Battle Chamber uses canonical 9-faction keys while legacy faction progression
// routes still rely on normalizeFaction() for backward-compatible aliases.
function normalizeBattleChamberFaction(value) {
  const normalized = normalizeFaction(value);
  return BATTLE_CHAMBER_FACTIONS.includes(normalized) ? normalized : null;
}

function getBattleChamberPeriodKey(periodType, nowMs = Date.now()) {
  const now = new Date(nowMs);
  if (periodType === 'daily') {
    return now.toISOString().slice(0, 10);
  }
  if (periodType === 'weekly') {
    const dow = now.getUTCDay() || 7;
    const thu = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (4 - dow)));
    const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((thu - yearStart) / 86400000 + 1) / 7);
    return `${thu.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  if (periodType === 'monthly') {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return null;
}

function getBattleSeasonFallbackKey(nowMs = Date.now()) {
  const seasonLengthMs = BATTLE_CHAMBER_DAYS_PER_SEASON * 24 * 60 * 60 * 1000;
  const seasonIndex = Math.floor((nowMs - BATTLE_CHAMBER_SEASON_EPOCH_MS) / seasonLengthMs);
  return `S${seasonIndex + 1}`;
}

async function getBattleSeasonKey(db, nowMs = Date.now()) {
  const season = await getCurrentSeason(db).catch(() => null);
  if (season && typeof season === 'object') {
    const explicit = season.season_key || season.key || season.slug || season.code;
    if (explicit) return String(explicit);
    if (season.id != null) return `S${season.id}`;
  }
  return getBattleSeasonFallbackKey(nowMs);
}

async function getBattlePeriodKey(periodType, db, nowMs = Date.now()) {
  if (periodType === 'seasonal') return getBattleSeasonKey(db, nowMs);
  return getBattleChamberPeriodKey(periodType, nowMs);
}

function clampBattleClout(raw, max = BATTLE_CHAMBER_CLAMP_MAX) {
  const n = Math.floor(Number(raw) || 0);
  if (n <= 0) return 0;
  return Math.min(max, n);
}

function classifyBattleChamberEvent(eventType, cloutDelta) {
  const delta = Math.max(0, Math.floor(Number(cloutDelta) || 0));
  if (eventType === 'mission_complete' || eventType === 'daily_mission_progress') {
    return { mission: delta, score: 0, contribution: 0, streak: 0 };
  }
  if (eventType === 'score_accept') {
    return { mission: 0, score: delta, contribution: 0, streak: 0 };
  }
  if (eventType === 'streak_bonus') {
    return { mission: 0, score: 0, contribution: 0, streak: delta };
  }
  return { mission: 0, score: 0, contribution: delta, streak: 0 };
}

function buildBattleEventText({ displayName, factionId, eventType }) {
  const name = String(displayName || 'Player');
  const factionLabel = BATTLE_CHAMBER_FACTION_LABELS[factionId] || factionId || 'faction';
  if (eventType === 'faction_join') return `${name} joined ${factionLabel}.`;
  if (eventType === 'mission_complete') return `${name} completed a mission for ${factionLabel}.`;
  if (eventType === 'weekly_contribution') return `${name} gained weekly pressure for ${factionLabel}.`;
  if (eventType === 'streak_bonus') return `${name} triggered a streak bonus for ${factionLabel}.`;
  if (eventType === 'reward_unlock') return `${name} unlocked a reward in ${factionLabel}.`;
  if (eventType === 'score_accept') return `${name} moved up the weekly clout board for ${factionLabel}.`;
  return `${name} logged Battle Chamber activity for ${factionLabel}.`;
}

async function appendBattleChamberActivity(db, {
  telegramId,
  displayName,
  factionId,
  eventType,
  eventText,
  cloutDelta,
  source,
  metadata,
  createdAt,
}) {
  const metadataJson = metadata && typeof metadata === 'object'
    ? JSON.stringify(metadata).slice(0, BATTLE_CHAMBER_METADATA_MAX_LENGTH)
    : null;
  await db.prepare(`
    INSERT INTO battle_chamber_activity_log
      (telegram_id, display_name, faction_id, event_type, event_text, clout_delta, source, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    String(telegramId),
    displayName || null,
    factionId,
    eventType,
    eventText,
    Math.max(0, Math.floor(Number(cloutDelta) || 0)),
    source || null,
    metadataJson,
    createdAt || new Date().toISOString(),
  ).run();
}

async function applyBattleChamberCloutUpdate(db, {
  telegramId,
  factionId,
  eventType,
  cloutDelta,
  nowMs,
}) {
  const ts = Number.isFinite(nowMs) ? nowMs : Date.now();
  const nowStr = new Date(ts).toISOString();
  const safeDelta = Math.max(0, Math.floor(Number(cloutDelta) || 0));
  const bucket = classifyBattleChamberEvent(eventType, safeDelta);
  const periodKeys = {};
  for (const periodType of BATTLE_CHAMBER_PERIODS) {
    periodKeys[periodType] = await getBattlePeriodKey(periodType, db, ts);
  }
  if (safeDelta <= 0) return periodKeys;

  for (const periodType of BATTLE_CHAMBER_PERIODS) {
    const periodKey = periodKeys[periodType];
    const memberInsert = await db.prepare(`
      INSERT OR IGNORE INTO battle_chamber_member_clout
        (telegram_id, faction_id, period_type, period_key, clout_total, mission_total, score_total, streak_total, last_event_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      String(telegramId),
      factionId,
      periodType,
      periodKey,
      safeDelta,
      bucket.mission,
      bucket.score,
      bucket.streak,
      nowStr,
      nowStr,
    ).run();
    const insertedMemberPeriod = Number(memberInsert?.meta?.changes || 0) > 0;
    if (!insertedMemberPeriod) {
      await db.prepare(`
        UPDATE battle_chamber_member_clout
        SET
          clout_total = clout_total + ?,
          mission_total = mission_total + ?,
          score_total = score_total + ?,
          streak_total = streak_total + ?,
          last_event_at = ?,
          updated_at = ?
        WHERE telegram_id = ? AND faction_id = ? AND period_type = ? AND period_key = ?
      `).bind(
        safeDelta,
        bucket.mission,
        bucket.score,
        bucket.streak,
        nowStr,
        nowStr,
        String(telegramId),
        factionId,
        periodType,
        periodKey,
      ).run();
    }

    await db.prepare(`
      INSERT INTO battle_chamber_faction_clout
        (faction_id, period_type, period_key, clout_total, contribution_total, mission_total, score_total, member_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(faction_id, period_type, period_key) DO UPDATE SET
        clout_total = battle_chamber_faction_clout.clout_total + excluded.clout_total,
        contribution_total = battle_chamber_faction_clout.contribution_total + excluded.contribution_total,
        mission_total = battle_chamber_faction_clout.mission_total + excluded.mission_total,
        score_total = battle_chamber_faction_clout.score_total + excluded.score_total,
        member_count = battle_chamber_faction_clout.member_count + excluded.member_count,
        updated_at = excluded.updated_at
    `).bind(
      factionId,
      periodType,
      periodKey,
      safeDelta,
      bucket.contribution,
      bucket.mission,
      bucket.score,
      insertedMemberPeriod ? 1 : 0,
      nowStr,
    ).run();
  }

  return periodKeys;
}

async function _updateMissionStreak(db, telegramId, todayKey) {
  try {
    const row = await db.prepare(
      `SELECT mission_streak, last_mission_date FROM player_streak_state WHERE telegram_id = ? LIMIT 1`
    ).bind(telegramId).first().catch(() => null);
    const lastDate = row?.last_mission_date || null;
    const nowStr = new Date().toISOString();
    if (lastDate === todayKey) return; // already recorded today
    const yesterday = new Date(new Date(todayKey + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
    const newStreak = lastDate === yesterday ? (row?.mission_streak || 0) + 1 : 1;
    await db.prepare(`
      INSERT INTO player_streak_state (telegram_id, mission_streak, last_mission_date, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        mission_streak = ?,
        last_mission_date = ?,
        updated_at = ?
    `).bind(telegramId, newStreak, todayKey, nowStr, newStreak, todayKey, nowStr).run();
  } catch { /* non-fatal */ }
}

async function _updateContributionStreak(db, telegramId, todayKey) {
  try {
    const row = await db.prepare(
      `SELECT contribution_streak, last_contribution_date FROM player_streak_state WHERE telegram_id = ? LIMIT 1`
    ).bind(telegramId).first().catch(() => null);
    const lastDate = row?.last_contribution_date || null;
    const nowStr = new Date().toISOString();
    if (lastDate === todayKey) return; // already recorded today
    const yesterday = new Date(new Date(todayKey + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
    const newStreak = lastDate === yesterday ? (row?.contribution_streak || 0) + 1 : 1;
    await db.prepare(`
      INSERT INTO player_streak_state (telegram_id, contribution_streak, last_contribution_date, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        contribution_streak = ?,
        last_contribution_date = ?,
        updated_at = ?
    `).bind(telegramId, newStreak, todayKey, nowStr, newStreak, todayKey, nowStr).run().catch(() => {});
  } catch { /* non-fatal */ }
}

async function ensureDailyDigestTables(db) {
  for (const tableName of DAILY_DIGEST_TABLES) {
    const row = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    ).bind(tableName).first().catch(() => null);
    if (!row?.name) {
      return {
        _isDailyDigestUnavailable: true,
        tableName,
        response: new Response(JSON.stringify({
          ok: false,
          error: 'daily_digest_unavailable',
          reason: `migration_pending:${tableName}`,
          message: 'Daily digest and missed history tables are not yet configured. Apply migration 018.',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }),
      };
    }
  }
  return null;
}

async function ensureDailyWtfTables(db) {
  for (const tableName of DAILY_WTF_TABLES) {
    const row = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    ).bind(tableName).first().catch(() => null);
    if (!row?.name) {
      return {
        _isDailyWtfUnavailable: true,
        tableName,
        response: new Response(JSON.stringify({
          ok: false,
          error: 'daily_wtf_unavailable',
          reason: `migration_pending:${tableName}`,
          message: 'Daily WTF event tables are not yet configured. Apply migration 019.',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }),
      };
    }
  }
  return null;
}

function getWtfDailySchedule(utcDay) {
  return [
    { event_id: 'wtf-midnight-signal', title: 'Midnight WTF Signal', event_type: 'signal_window', startHour: 0, durationMinutes: 90, required_action: 'play_any_accepted_arcade_run', reward_key: `wtf:${utcDay}:midnight`, theme: 'neon-midnight' },
    { event_id: 'wtf-early-chain-wake-up', title: 'Early Chain Wake-Up', event_type: 'chain_wake_up', startHour: 4, durationMinutes: 90, required_action: 'choose_and_complete_chaos_path', reward_key: `wtf:${utcDay}:early`, theme: 'chain-wake-up' },
    { event_id: 'wtf-morning-signal', title: 'Morning WTF Signal', event_type: 'signal_window', startHour: 8, durationMinutes: 90, required_action: 'play_any_accepted_arcade_run', reward_key: `wtf:${utcDay}:morning`, theme: 'neon-sunrise' },
    { event_id: 'wtf-midday-rush', title: 'Midday Faction Rush', event_type: 'faction_rush', startHour: 12, durationMinutes: 90, required_action: 'complete_faction_or_battle_action', reward_key: `wtf:${utcDay}:midday`, theme: 'faction-overdrive' },
    { event_id: 'wtf-evening-burst', title: 'Evening Arcade Burst', event_type: 'arcade_burst', startHour: 16, durationMinutes: 90, required_action: 'score_target_any_game', reward_key: `wtf:${utcDay}:evening`, theme: 'neon-jackpot' },
    { event_id: 'wtf-late-chaos', title: 'Late Night Chaos Window', event_type: 'chaos_window', startHour: 20, durationMinutes: 90, required_action: 'choose_and_complete_chaos_path', reward_key: `wtf:${utcDay}:late`, theme: 'after-hours-chaos' },
  ];
}

function buildWtfIso(utcDay, hour, minute = 0) {
  return `${utcDay}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

function getWtfEventStatus(nowMs, startsAt, endsAt, playerStatus) {
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (Number.isFinite(endMs) && nowMs >= endMs) return playerStatus === 'completed' ? 'completed' : 'expired';
  if (Number.isFinite(startMs) && nowMs < startMs) return 'upcoming';
  if (playerStatus === 'completed') return 'completed';
  return 'active';
}


function addUtcDays(utcDay, days) {
  const d = new Date(`${utcDay}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getNextDailyWtfEvent(db, utcDay, normalizeRow) {
  const tomorrow = addUtcDays(utcDay, 1);
  await ensureWtfEventsForDay(db, tomorrow).catch(() => {});
  const rows = await db.prepare(`SELECT * FROM daily_wtf_events WHERE utc_day = ? ORDER BY starts_at ASC`).bind(tomorrow).all().catch(() => ({ results: [] }));
  const officialIds = new Set(getWtfDailySchedule(tomorrow).map((event) => event.event_id));
  const row = (rows?.results || []).find((candidate) => officialIds.has(String(candidate.event_id))) || null;
  return row ? normalizeRow(row) : null;
}

function getAllowedSourcesForWtfEvent(eventRow) {
  const key = String(eventRow?.required_action || '').trim();
  const fromAction = WTF_REQUIRED_ACTION_SOURCE_MAP[key];
  if (Array.isArray(fromAction) && fromAction.length) return fromAction.slice();
  return ['arcade_run_accepted'];
}

async function upsertWtfMissedEntry(db, { telegramId, utcDay, eventRow, reason }) {
  const safeTitle = String(eventRow?.title || 'WTF signal window missed').slice(0, 140);
  const eventId = String(eventRow?.event_id || '').trim() || null;
  const existing = await db.prepare(`
    SELECT id FROM daily_missed_perks
    WHERE telegram_id = ? AND utc_day = ? AND source = 'daily_wtf_timed_event'
      AND opportunity_type = 'timed_event_window'
      AND title = ?
      AND (
        metadata_json LIKE ?
        OR metadata_json LIKE ?
      )
    LIMIT 1
  `).bind(String(telegramId), String(utcDay), safeTitle, `%"event_id":"${eventId}"%`, `%"event_id": "${eventId}"%`).first().catch(() => null);
  if (existing?.id) return;
  await insertMissedPerkEntry(db, {
    telegramId,
    utcDay,
    factionId: eventRow?.faction_id || null,
    source: 'daily_wtf_timed_event',
    opportunityType: 'timed_event_window',
    title: safeTitle,
    description: 'The city kept moving while you were away.',
    missedReason: reason || 'event_expired',
    statusValue: 1,
    missedXpValue: MISSED_XP_PER_TIMED_EVENT,
    metadataJson: {
      event_id: eventRow?.event_id || null,
      reward_preview: eventRow?.reward_key || null,
      starts_at: eventRow?.starts_at || null,
      ends_at: eventRow?.ends_at || null,
    },
    missedAt: eventRow?.ends_at || new Date().toISOString(),
  });
}

async function verifyWtfCompletionProof(db, { telegramId, source, sourceId, event, utcDay }) {
  const safeTelegramId = String(telegramId || '').trim();
  const safeSourceId = String(sourceId || '').trim();
  if (!safeSourceId) {
    return { ok: false, error: 'proof_required', message: 'Completion proof is required before this WTF signal can be cleared.' };
  }
  if (source === 'arcade_run_accepted') {
    const row = await db.prepare(`
      SELECT client_run_id, status
      FROM arcade_progression_events
      WHERE telegram_id = ? AND client_run_id = ? AND status = 'accepted'
      LIMIT 1
    `).bind(safeTelegramId, safeSourceId).first().catch(() => null);
    if (!row) return { ok: false, error: 'proof_required', message: 'Accepted arcade run proof was not verified.' };
    return { ok: true, proof: { type: 'arcade_run_accepted', source_id: safeSourceId } };
  }
  if (source === 'faction_daily_mission') {
    const row = await db.prepare(`
      SELECT mission_id, completed
      FROM player_daily_mission_state
      WHERE telegram_id = ? AND mission_date = ? AND mission_id = ? AND completed = 1
      LIMIT 1
    `).bind(safeTelegramId, String(utcDay), safeSourceId).first().catch(() => null);
    if (!row) return { ok: false, error: 'proof_required', message: 'Faction mission completion proof was not verified.' };
    return { ok: true, proof: { type: 'faction_daily_mission', source_id: safeSourceId } };
  }
  if (source === 'battle_chamber_proof') {
    const sourceNumeric = Number.parseInt(safeSourceId, 10);
    if (!Number.isFinite(sourceNumeric) || sourceNumeric <= 0) {
      return { ok: false, error: 'proof_required', message: 'Battle Chamber proof id is required.' };
    }
    const row = await db.prepare(`
      SELECT id, event_type
      FROM battle_chamber_activity_log
      WHERE id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(sourceNumeric, safeTelegramId).first().catch(() => null);
    if (!row) return { ok: false, error: 'proof_required', message: 'Battle Chamber proof was not verified.' };
    return { ok: true, proof: { type: 'battle_chamber_proof', source_id: sourceNumeric } };
  }
  if (source === 'roguelite_branch') {
    const row = await db.prepare(`
      SELECT option_id, status
      FROM daily_wtf_chain_options
      WHERE telegram_id = ? AND utc_day = ? AND option_id = ? AND status IN ('chosen', 'completed')
      LIMIT 1
    `).bind(safeTelegramId, String(utcDay), safeSourceId).first().catch(() => null);
    if (!row) return { ok: false, error: 'proof_required', message: 'Roguelite branch proof was not verified.' };
    return { ok: true, proof: { type: 'roguelite_branch', source_id: safeSourceId } };
  }
  return { ok: false, error: 'proof_required', message: 'Completion proof is required before this WTF signal can be cleared.' };
}

async function reconcileWtfExpiryForUser(db, telegramId, utcDay, nowMs) {
  const rows = await db.prepare(`
    SELECT e.event_id, e.utc_day, e.title, e.faction_id, e.reward_key, e.starts_at, e.ends_at, p.status, p.checked_in_at, p.completed_at
    FROM daily_wtf_events e
    LEFT JOIN daily_wtf_player_events p
      ON p.event_id = e.event_id AND p.utc_day = e.utc_day AND p.telegram_id = ?
    WHERE e.utc_day = ?
  `).bind(String(telegramId), String(utcDay)).all().catch(() => ({ results: [] }));
  const officialIds = new Set(getWtfDailySchedule(utcDay).map((event) => event.event_id));
  for (const row of (rows?.results || [])) {
    if (!officialIds.has(String(row.event_id))) continue;
    const endMs = Date.parse(row.ends_at);
    if (!Number.isFinite(endMs) || nowMs < endMs) continue;
    if (row.completed_at) continue;
    const priorStatus = String(row.status || '').trim();
    const nextStatus = row.checked_in_at ? 'missed' : 'expired';
    await db.prepare(`
      INSERT INTO daily_wtf_player_events
        (telegram_id, event_id, utc_day, status, checked_in_at, completed_at, missed_at, chain_depth, reward_status, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 'none', ?, ?, ?)
      ON CONFLICT(telegram_id, event_id, utc_day) DO UPDATE SET
        status = CASE WHEN daily_wtf_player_events.completed_at IS NOT NULL THEN 'completed' ELSE excluded.status END,
        missed_at = CASE WHEN daily_wtf_player_events.completed_at IS NOT NULL THEN daily_wtf_player_events.missed_at ELSE excluded.missed_at END,
        updated_at = excluded.updated_at
    `).bind(
      String(telegramId), row.event_id, row.utc_day, nextStatus, row.checked_in_at || null,
      new Date(endMs).toISOString(),
      JSON.stringify({ prior_status: priorStatus || 'none', reason: 'window_expired' }),
      new Date().toISOString(),
      new Date().toISOString(),
    ).run();
    await upsertWtfMissedEntry(db, {
      telegramId,
      utcDay,
      eventRow: row,
      reason: row.checked_in_at ? 'checked_in_not_completed_before_expiry' : 'not_checked_in_before_expiry',
    });
  }
}

function buildWtfScheduleRow(utcDay, event) {
  const startsAt = buildWtfIso(utcDay, event.startHour, 0);
  return {
    event_id: event.event_id,
    utc_day: utcDay,
    event_type: event.event_type,
    title: event.title,
    description: 'Check in during the signal window, complete the objective, and trigger a status burst.',
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + event.durationMinutes * 60 * 1000).toISOString(),
    required_action: event.required_action,
    reward_key: event.reward_key,
    xp_multiplier_display: '5x XP opportunity',
    theme: event.theme,
    metadata_json: JSON.stringify({ chain_cap: WTF_MAX_CHAIN_DEPTH, duration_minutes: event.durationMinutes, official_schedule: true }),
  };
}

function wtfScheduleRowMatches(row, expected) {
  if (!row || !expected) return false;
  return String(row.event_id) === expected.event_id &&
    String(row.utc_day) === expected.utc_day &&
    String(row.event_type || '') === expected.event_type &&
    String(row.title || '') === expected.title &&
    String(row.description || '') === expected.description &&
    String(row.starts_at || '') === expected.starts_at &&
    String(row.ends_at || '') === expected.ends_at &&
    String(row.required_action || '') === expected.required_action &&
    String(row.reward_key || '') === expected.reward_key &&
    String(row.xp_multiplier_display || '') === expected.xp_multiplier_display &&
    String(row.theme || '') === expected.theme &&
    String(row.metadata_json || '') === expected.metadata_json;
}

async function ensureWtfEventsForDay(db, utcDay) {
  const scheduleRows = getWtfDailySchedule(utcDay).map((event) => buildWtfScheduleRow(utcDay, event));
  const officialIds = new Set(scheduleRows.map((event) => event.event_id));
  const existingRows = await db.prepare(`SELECT * FROM daily_wtf_events WHERE utc_day = ? ORDER BY starts_at ASC`).bind(utcDay).all().catch(() => ({ results: [] }));
  const existingById = new Map((existingRows?.results || []).filter((row) => officialIds.has(String(row.event_id))).map((row) => [String(row.event_id), row]));
  const scheduleAlreadyCurrent = existingById.size === scheduleRows.length && scheduleRows.every((expected) => wtfScheduleRowMatches(existingById.get(expected.event_id), expected));
  if (scheduleAlreadyCurrent) return;

  for (const event of scheduleRows) {
    await db.prepare(`
      INSERT INTO daily_wtf_events
        (event_id, utc_day, event_type, title, description, starts_at, ends_at, required_action, reward_key, xp_multiplier_display, faction_id, game_key, theme, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
      ON CONFLICT(event_id, utc_day) DO UPDATE SET
        event_type = excluded.event_type,
        title = excluded.title,
        description = excluded.description,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        required_action = excluded.required_action,
        reward_key = excluded.reward_key,
        xp_multiplier_display = excluded.xp_multiplier_display,
        theme = excluded.theme,
        metadata_json = excluded.metadata_json
      WHERE daily_wtf_events.event_type IS NOT excluded.event_type
        OR daily_wtf_events.title IS NOT excluded.title
        OR daily_wtf_events.description IS NOT excluded.description
        OR daily_wtf_events.starts_at IS NOT excluded.starts_at
        OR daily_wtf_events.ends_at IS NOT excluded.ends_at
        OR daily_wtf_events.required_action IS NOT excluded.required_action
        OR daily_wtf_events.reward_key IS NOT excluded.reward_key
        OR daily_wtf_events.xp_multiplier_display IS NOT excluded.xp_multiplier_display
        OR daily_wtf_events.theme IS NOT excluded.theme
        OR daily_wtf_events.metadata_json IS NOT excluded.metadata_json
    `).bind(
      event.event_id, event.utc_day, event.event_type, event.title,
      event.description, event.starts_at, event.ends_at, event.required_action,
      event.reward_key, event.xp_multiplier_display, event.theme,
      event.metadata_json, new Date().toISOString(),
    ).run();
  }
}

function clampText(value, maxLen, fallback = '') {
  const safe = String(value == null ? fallback : value).trim();
  if (!safe) return String(fallback || '').slice(0, maxLen);
  return safe.slice(0, maxLen);
}

function getUtcDayFromIso(isoLike) {
  if (!isoLike) return null;
  const ts = Date.parse(String(isoLike));
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
}

function getPreviousUtcDay(utcDay) {
  const ts = Date.parse(`${String(utcDay)}T00:00:00Z`);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts - 86400000).toISOString().slice(0, 10);
}

/**
 * Returns UTC day keys between start and end, excluding both boundary days.
 */
function listUtcDaysBetweenExclusive(startUtcDay, endUtcDay, maxDays = 45) {
  const startTs = Date.parse(`${String(startUtcDay)}T00:00:00Z`);
  const endTs = Date.parse(`${String(endUtcDay)}T00:00:00Z`);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return [];
  const days = [];
  let cursor = startTs + 86400000;
  while (cursor < endTs && days.length < maxDays) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86400000;
  }
  return days;
}

function normaliseMissedMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    const parsed = safeJsonParse(metadata, null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify(parsed).slice(0, 4000);
    }
    return null;
  }
  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return JSON.stringify(metadata).slice(0, 4000);
  }
  return null;
}

function formatMissionIdLabel(missionId) {
  const base = String(missionId || '').replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Mission';
  return base.replace(/\b\w/g, (m) => m.toUpperCase()).slice(0, 60);
}

async function insertMissedPerkEntry(db, {
  telegramId,
  utcDay,
  factionId,
  source,
  opportunityType,
  title,
  description,
  missedReason,
  statusValue,
  missedXpValue,
  metadataJson,
  missedAt,
  missedXpValueAvailable,
}) {
  const safeTelegramId = String(telegramId || '').trim();
  if (!safeTelegramId) return null;
  const fallbackToday = getTodayUtcDate();
  const safeUtcDay = clampText(utcDay || fallbackToday, 10, fallbackToday);
  const normalizedFaction = factionId ? normalizeBattleChamberFaction(factionId) : null;
  const safeSource = clampText(source, DAILY_MISSED_TEXT_LIMITS.source, 'unknown');
  const safeType = clampText(opportunityType, DAILY_MISSED_TEXT_LIMITS.opportunityType, 'daily_opportunity');
  const safeTitle = clampText(title, DAILY_MISSED_TEXT_LIMITS.title, 'Missed daily opportunity');
  const safeDescription = clampText(description, DAILY_MISSED_TEXT_LIMITS.description, '');
  const safeReason = clampText(missedReason, DAILY_MISSED_TEXT_LIMITS.missedReason, 'not_played');
  const safeStatusValue = Math.max(0, Math.floor(Number(statusValue) || 0));
  // missed_xp_value: notional XP forfeited (never awarded to player; tracking only)
  const safeMissedXpValue = Math.max(0, Math.floor(Number(missedXpValue) || 0));
  const safeMetadata = normaliseMissedMetadata(metadataJson);
  const safeMissedAt = missedAt && Number.isFinite(Date.parse(String(missedAt)))
    ? new Date(missedAt).toISOString()
    : new Date().toISOString();
  const safeCreatedAt = new Date().toISOString();
  const hasMissedXpValue = missedXpValueAvailable == null
    ? await hasDailyMissedXpValueColumn(db)
    : !!missedXpValueAvailable;

  const runInsertWithXp = () => db.prepare(`
    INSERT INTO daily_missed_perks
      (telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, missed_xp_value, metadata_json, missed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    safeTelegramId,
    safeUtcDay,
    normalizedFaction || null,
    safeSource,
    safeType,
    safeTitle,
    safeDescription || null,
    safeReason || null,
    safeStatusValue,
    safeMissedXpValue,
    safeMetadata,
    safeMissedAt,
    safeCreatedAt,
  ).run();

  const runInsertWithoutXp = () => db.prepare(`
    INSERT INTO daily_missed_perks
      (telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, metadata_json, missed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    safeTelegramId,
    safeUtcDay,
    normalizedFaction || null,
    safeSource,
    safeType,
    safeTitle,
    safeDescription || null,
    safeReason || null,
    safeStatusValue,
    safeMetadata,
    safeMissedAt,
    safeCreatedAt,
  ).run();

  let result = null;
  if (hasMissedXpValue) {
    result = await runInsertWithXp().catch(async (error) => {
      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('no such column') || message.includes('missed_xp_value')) {
        return runInsertWithoutXp().catch(() => null);
      }
      return null;
    });
  } else {
    result = await runInsertWithoutXp().catch(() => null);
  }
  return result;
}

async function ensureDailyOpportunityStateForToday(db, telegramId, utcDay) {
  const safeTelegramId = String(telegramId || '').trim();
  const dayKey = clampText(utcDay || getTodayUtcDate(), 10, getTodayUtcDate());
  await db.prepare(`
    INSERT INTO daily_opportunity_state
      (telegram_id, utc_day, daily_seed, chain_depth, activated_at, last_roll_at, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, NULL, ?, ?)
    ON CONFLICT(telegram_id, utc_day) DO NOTHING
  `).bind(
    safeTelegramId,
    dayKey,
    crypto.randomUUID(),
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
  ).run();
  return db.prepare(`
    SELECT telegram_id, utc_day, daily_seed, chain_depth, activated_at, last_roll_at, created_at, updated_at
    FROM daily_opportunity_state
    WHERE telegram_id = ? AND utc_day = ?
    LIMIT 1
  `).bind(safeTelegramId, dayKey).first().catch(() => null);
}

async function backfillMissedPerkGapsFromLastActiveDay(db, telegramId, todayUtcDay, factionId) {
  const prior = await db.prepare(`
    SELECT utc_day
    FROM daily_opportunity_state
    WHERE telegram_id = ? AND utc_day < ?
    ORDER BY utc_day DESC
    LIMIT 1
  `).bind(String(telegramId), todayUtcDay).first().catch(() => null);
  if (!prior?.utc_day) return { days_backfilled: 0, entries_created: 0, created: 0, missed_days: [] };
  const missedDays = listUtcDaysBetweenExclusive(prior.utc_day, todayUtcDay, 45);
  const missedXpValueAvailable = await hasDailyMissedXpValueColumn(db);
  let entriesCreated = 0;
  let daysFilledCount = 0;
  for (const missedDay of missedDays) {
    const existing = await db.prepare(`
      SELECT id
      FROM daily_missed_perks
      WHERE telegram_id = ? AND utc_day = ? AND source = 'daily_reset' AND opportunity_type = 'daily_activation_window'
      LIMIT 1
    `).bind(String(telegramId), missedDay).first().catch(() => null);
    if (existing?.id) continue;
    const dailyResetInsert = await insertMissedPerkEntry(db, {
      telegramId,
      utcDay: missedDay,
      factionId: factionId || null,
      source: 'daily_reset',
      opportunityType: 'daily_activation_window',
      title: 'Daily activation window expired',
      description: 'The city kept moving while you were away.',
      missedReason: 'inactive_utc_day',
      statusValue: 1,
      missedXpValue: MISSED_XP_PER_DAILY_WINDOW,
      metadataJson: { trigger: 'utc_reset_backfill' },
      missedAt: `${missedDay}T23:59:59.000Z`,
      missedXpValueAvailable,
    });
    entriesCreated += Number(dailyResetInsert?.meta?.changes || 0);
    daysFilledCount += 1;
    const factionNormalized = normalizeBattleChamberFaction(factionId);
    if (factionNormalized) {
      const factionInsert = await insertMissedPerkEntry(db, {
        telegramId,
        utcDay: missedDay,
        factionId: factionNormalized,
        source: 'faction_missions',
        opportunityType: 'daily_mission_window',
        title: 'Faction daily mission window missed',
        description: 'Faction daily missions reset at UTC midnight.',
        missedReason: 'faction_mission_window_expired',
        statusValue: 1,
        missedXpValue: MISSED_XP_PER_DAILY_WINDOW,
        metadataJson: { trigger: 'utc_reset_backfill' },
        missedAt: `${missedDay}T23:59:59.000Z`,
        missedXpValueAvailable,
      });
      entriesCreated += Number(factionInsert?.meta?.changes || 0);
    } else {
      const factionSelectionInsert = await insertMissedPerkEntry(db, {
        telegramId,
        utcDay: missedDay,
        factionId: null,
        source: 'faction_selection',
        opportunityType: 'faction_unselected',
        title: 'Faction clout window missed',
        description: 'No faction selected. Join a faction to activate faction war opportunities.',
        missedReason: 'faction_not_selected',
        statusValue: 1,
        missedXpValue: MISSED_XP_PER_DAILY_WINDOW,
        metadataJson: { trigger: 'utc_reset_backfill' },
        missedAt: `${missedDay}T23:59:59.000Z`,
        missedXpValueAvailable,
      });
      entriesCreated += Number(factionSelectionInsert?.meta?.changes || 0);
    }
  }
  return {
    days_backfilled: daysFilledCount,
    entries_created: entriesCreated,
    created: entriesCreated,
    missed_days: missedDays,
  };
}

async function hasDailyMissedXpValueColumn(db) {
  const info = await db.prepare(`PRAGMA table_info(daily_missed_perks)`).all().catch(() => ({ results: [] }));
  return (info?.results || []).some((column) => String(column?.name || '') === 'missed_xp_value');
}

async function getMissedPerkTotals(db, telegramId, utcDay = null, missedXpValueAvailable = null) {
  const hasMissedXpValue = missedXpValueAvailable == null
    ? await hasDailyMissedXpValueColumn(db)
    : !!missedXpValueAvailable;
  const countRow = utcDay
    ? await db.prepare(`
        SELECT COUNT(*) AS events_total
        FROM daily_missed_perks
        WHERE telegram_id = ? AND utc_day = ?
      `).bind(String(telegramId), String(utcDay)).first().catch(() => ({ events_total: 0 }))
    : await db.prepare(`
        SELECT COUNT(*) AS events_total
        FROM daily_missed_perks
        WHERE telegram_id = ?
      `).bind(String(telegramId)).first().catch(() => ({ events_total: 0 }));
  if (!hasMissedXpValue) {
    return {
      events_total: Math.max(0, Math.floor(Number(countRow?.events_total) || 0)),
      xp_total: 0,
      has_missed_xp_value: false,
    };
  }
  const xpRow = utcDay
    ? await db.prepare(`
        SELECT COALESCE(SUM(missed_xp_value), 0) AS xp_total
        FROM daily_missed_perks
        WHERE telegram_id = ? AND utc_day = ?
      `).bind(String(telegramId), String(utcDay)).first().catch(() => ({ xp_total: 0 }))
    : await db.prepare(`
        SELECT COALESCE(SUM(missed_xp_value), 0) AS xp_total
        FROM daily_missed_perks
        WHERE telegram_id = ?
      `).bind(String(telegramId)).first().catch(() => ({ xp_total: 0 }));
  return {
    events_total: Math.max(0, Math.floor(Number(countRow?.events_total) || 0)),
    xp_total: Math.max(0, Math.floor(Number(xpRow?.xp_total) || 0)),
    has_missed_xp_value: true,
  };
}

async function getMissedPerkRows(db, telegramId, limit = 5, utcDay = null, missedXpValueAvailable = null) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 5));
  const hasMissedXpValue = missedXpValueAvailable == null
    ? await hasDailyMissedXpValueColumn(db)
    : !!missedXpValueAvailable;
  const query = hasMissedXpValue
    ? (utcDay
      ? db.prepare(`
          SELECT id, telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, missed_xp_value, metadata_json, missed_at, created_at
          FROM daily_missed_perks
          WHERE telegram_id = ? AND utc_day = ?
          ORDER BY missed_at DESC, id DESC
          LIMIT ?
        `).bind(String(telegramId), String(utcDay), safeLimit)
      : db.prepare(`
          SELECT id, telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, missed_xp_value, metadata_json, missed_at, created_at
          FROM daily_missed_perks
          WHERE telegram_id = ?
          ORDER BY missed_at DESC, id DESC
          LIMIT ?
        `).bind(String(telegramId), safeLimit))
    : (utcDay
      ? db.prepare(`
          SELECT id, telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, metadata_json, missed_at, created_at
          FROM daily_missed_perks
          WHERE telegram_id = ? AND utc_day = ?
          ORDER BY missed_at DESC, id DESC
          LIMIT ?
        `).bind(String(telegramId), String(utcDay), safeLimit)
      : db.prepare(`
          SELECT id, telegram_id, utc_day, faction_id, source, opportunity_type, title, description, missed_reason, status_value, metadata_json, missed_at, created_at
          FROM daily_missed_perks
          WHERE telegram_id = ?
          ORDER BY missed_at DESC, id DESC
          LIMIT ?
        `).bind(String(telegramId), safeLimit));
  const rows = await query.all().catch(() => ({ results: [] }));
  return {
    rows: rows?.results || [],
    has_missed_xp_value: hasMissedXpValue,
  };
}

async function getMissedHistorySnapshot(db, telegramId, limit = 5, missedXpValueAvailable = null) {
  const [totals, rowResult] = await Promise.all([
    getMissedPerkTotals(db, telegramId, null, missedXpValueAvailable),
    getMissedPerkRows(db, telegramId, limit, null, missedXpValueAvailable),
  ]);
  return {
    total: totals.events_total,
    xp_total: totals.xp_total,
    recent: (rowResult.rows || []).map((row) => ({
      id: row.id,
      utc_day: row.utc_day,
      faction_id: row.faction_id || null,
      source: row.source,
      opportunity_type: row.opportunity_type,
      title: row.title,
      description: row.description || null,
      missed_reason: row.missed_reason || null,
      status_value: Number(row.status_value) || 0,
      missed_xp_value: rowResult.has_missed_xp_value ? Math.max(0, Math.floor(Number(row.missed_xp_value) || 0)) : 0,
      metadata: safeJsonParse(row.metadata_json, {}),
      missed_at: row.missed_at || null,
      created_at: row.created_at || null,
    })),
  };
}

async function getMissionDigestRows(db, telegramId, utcDay) {
  const rows = await db.prepare(`
    SELECT mission_id, progress, completed
    FROM player_daily_mission_state
    WHERE telegram_id = ? AND mission_date = ?
    ORDER BY mission_id ASC
    LIMIT 3
  `).bind(String(telegramId), String(utcDay)).all().catch(() => ({ results: [] }));
  return (rows?.results || []).map((row) => ({
    mission_id: row.mission_id,
    title: formatMissionIdLabel(row.mission_id),
    progress: Math.max(0, Math.floor(Number(row.progress) || 0)),
    target: null,
    completed: Number(row.completed) === 1,
  }));
}

async function getFactionDailyLog(db, telegramId, factionId, utcDay) {
  const weekKey = getIsoWeekKey();
  const normalizedFaction = normalizeBattleChamberFaction(factionId);
  const [dailyRow, weeklyRow] = await Promise.all([
    normalizedFaction
      ? db.prepare(`
          SELECT contribution
          FROM player_faction_signal_state
          WHERE telegram_id = ? AND faction_id = ? AND day_key = ?
          LIMIT 1
        `).bind(String(telegramId), normalizedFaction, utcDay).first().catch(() => null)
      : Promise.resolve(null),
    normalizedFaction
      ? db.prepare(`
          SELECT SUM(contribution) AS total
          FROM player_faction_signal_state
          WHERE telegram_id = ? AND faction_id = ? AND week_key = ?
        `).bind(String(telegramId), normalizedFaction, weekKey).first().catch(() => null)
      : Promise.resolve(null),
  ]);

  let weeklyStanding = null;
  let momentum = null;
  const bcCheck = await ensureBattleChamberTables(db);
  if (!bcCheck && normalizedFaction) {
    const weeklyPeriodKey = await getBattlePeriodKey('weekly', db, Date.now());
    const rows = await db.prepare(`
      SELECT faction_id, clout_total
      FROM battle_chamber_faction_clout
      WHERE period_type = 'weekly' AND period_key = ?
      ORDER BY clout_total DESC, faction_id ASC
    `).bind(weeklyPeriodKey).all().catch(() => ({ results: [] }));
    const list = rows?.results || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].faction_id === normalizedFaction) {
        weeklyStanding = i + 1;
        const lead = Number(list[0]?.clout_total) || 0;
        const mine = Number(list[i]?.clout_total) || 0;
        const ratio = lead > 0 ? mine / lead : 0;
        momentum = ratio >= 0.95 ? 'Dominant' : (ratio >= 0.7 ? 'Hot' : (ratio >= 0.45 ? 'Rising' : 'Building'));
        break;
      }
    }
  }

  return {
    daily_contribution: Math.max(0, Math.floor(Number(dailyRow?.contribution) || 0)),
    weekly_contribution: Math.max(0, Math.floor(Number(weeklyRow?.total) || 0)),
    momentum: momentum || 'Building',
    weekly_standing: weeklyStanding,
  };
}

function buildDigestNextBestAction({ factionId, missions, missedTotal }) {
  if (!normalizeBattleChamberFaction(factionId)) {
    return 'Pick a faction to activate faction war missions and clout opportunities.';
  }
  const pendingMission = (missions || []).find((mission) => !mission.completed);
  if (pendingMission) {
    return `Complete ${pendingMission.title} in Battle Chamber to push faction clout today.`;
  }
  if (Number(missedTotal) > 0) {
    return 'Open Battle Chamber and clear today’s opportunities to slow missed-history growth.';
  }
  return 'Log a Battle Chamber proof action and run Arcade to keep momentum up.';
}

function buildFactionChamberLink(factionId) {
  const normalizedFaction = normalizeBattleChamberFaction(factionId);
  if (!normalizedFaction) return `${SITE_URL}/battle-chamber/factions/index.html`;
  return `${SITE_URL}/battle-chamber/factions/${encodeURIComponent(normalizedFaction)}.html`;
}

async function claimDailyDigestSlot(db, telegramId, utcDay, options = {}) {
  const nowIso = new Date().toISOString();
  const retryCutoffTs = Date.now() - DIGEST_PENDING_STALE_MS;
  const retryCutoffIso = new Date(retryCutoffTs).toISOString();
  const forceRetry = !!options.forceRetry;
  const safeMetadata = normaliseMissedMetadata({
    claim_source: 'daily_digest_run',
    trigger: options.trigger || null,
    retry_override: forceRetry,
  });
  const insertResult = await db.prepare(`
    INSERT INTO telegram_daily_digest_log
      (telegram_id, utc_day, sent_at, status, error_message, metadata_json, created_at, updated_at)
    VALUES (?, ?, NULL, 'pending', NULL, ?, ?, ?)
    ON CONFLICT(telegram_id, utc_day) DO NOTHING
  `).bind(
    String(telegramId),
    String(utcDay),
    safeMetadata,
    nowIso,
    nowIso,
  ).run().catch(() => null);
  if (Number(insertResult?.meta?.changes || 0) === 1) {
    return { claimed: true, reason: 'created' };
  }
  const existing = await db.prepare(`
    SELECT status, sent_at, updated_at
    FROM telegram_daily_digest_log
    WHERE telegram_id = ? AND utc_day = ?
    LIMIT 1
  `).bind(String(telegramId), String(utcDay)).first().catch(() => null);
  const status = String(existing?.status || '').toLowerCase();
  if (status === 'sent') {
    return { claimed: false, reason: 'already_sent' };
  }
  const updatedAtTs = Date.parse(String(existing?.updated_at || ''));
  const isStalePending = status === 'pending' && (!Number.isFinite(updatedAtTs) || updatedAtTs <= retryCutoffTs);
  if (!forceRetry && status === 'pending' && !isStalePending) {
    return { claimed: false, reason: 'pending_recent' };
  }
  if (!forceRetry && status !== 'failed' && !isStalePending) {
    return { claimed: false, reason: status || 'blocked' };
  }
  const retryUpdate = await db.prepare(`
    UPDATE telegram_daily_digest_log
    SET status = 'pending', sent_at = NULL, error_message = NULL, metadata_json = ?, updated_at = ?
    WHERE telegram_id = ? AND utc_day = ?
      AND (
        (? = 1 AND status <> 'sent')
        OR status = 'failed'
        OR (status = 'pending' AND (updated_at IS NULL OR updated_at <= ?))
      )
  `).bind(
    safeMetadata,
    nowIso,
    String(telegramId),
    String(utcDay),
    forceRetry ? 1 : 0,
    retryCutoffIso,
  ).run().catch(() => null);
  if (Number(retryUpdate?.meta?.changes || 0) === 1) {
    return { claimed: true, reason: forceRetry ? 'retry_override' : (status === 'failed' ? 'retry_failed' : 'retry_stale_pending') };
  }
  return { claimed: false, reason: status === 'pending' ? 'pending_recent' : (status || 'blocked') };
}

async function finalizeDailyDigestLog(db, telegramId, utcDay, status, payload = {}) {
  const safeStatus = status === 'sent' ? 'sent' : 'failed';
  const safeError = payload?.error ? String(payload.error).slice(0, 500) : null;
  const safeMetadata = normaliseMissedMetadata(payload?.metadata || null);
  const nowIso = new Date().toISOString();
  const sentAt = safeStatus === 'sent' ? nowIso : null;
  await db.prepare(`
    UPDATE telegram_daily_digest_log
    SET sent_at = ?, status = ?, error_message = ?, metadata_json = ?, updated_at = ?
    WHERE telegram_id = ? AND utc_day = ?
  `).bind(
    sentAt,
    safeStatus,
    safeError,
    safeMetadata,
    nowIso,
    String(telegramId),
    String(utcDay),
  ).run().catch(() => {});
}

async function getLinkedTelegramUsersForDigest(db, targetTelegramId = null) {
  if (targetTelegramId) {
    const row = await db.prepare(`
      SELECT u.telegram_id
      FROM telegram_users u
      WHERE u.telegram_id = ?
        AND (
          EXISTS (
            SELECT 1 FROM telegram_activity_log al
            WHERE al.telegram_id = u.telegram_id AND al.action = 'link_confirmed'
          )
          OR EXISTS (
            SELECT 1 FROM blocktopia_progression bp
            WHERE bp.telegram_id = u.telegram_id
          )
        )
      LIMIT 1
    `).bind(String(targetTelegramId)).first().catch(() => null);
    return row?.telegram_id ? [String(row.telegram_id)] : [];
  }

  const rows = await db.prepare(`
    SELECT u.telegram_id
    FROM telegram_users u
    WHERE
      EXISTS (
        SELECT 1 FROM telegram_activity_log al
        WHERE al.telegram_id = u.telegram_id AND al.action = 'link_confirmed'
      )
      OR EXISTS (
        SELECT 1 FROM blocktopia_progression bp
        WHERE bp.telegram_id = u.telegram_id
      )
    ORDER BY u.updated_at DESC, u.telegram_id DESC
  `).all().catch(() => ({ results: [] }));
  return (rows?.results || []).map((row) => String(row.telegram_id)).filter(Boolean);
}

async function sendDailyDigestMessage(db, env, telegramId, utcDay) {
  const [faction, missions, missedSnapshot, yesterdayCountRow] = await Promise.all([
    getUserFaction(db, telegramId),
    getMissionDigestRows(db, telegramId, utcDay),
    getMissedHistorySnapshot(db, telegramId, 1),
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM daily_missed_perks
      WHERE telegram_id = ? AND utc_day = ?
    `).bind(String(telegramId), getPreviousUtcDay(utcDay) || '').first().catch(() => ({ total: 0 })),
  ]);

  const factionId = normalizeBattleChamberFaction(faction?.id || faction?.name) || null;
  const factionLabel = factionId ? (BATTLE_CHAMBER_FACTION_LABELS[factionId] || factionId) : 'Unaligned';
  const factionLogData = await getFactionDailyLog(db, telegramId, factionId, utcDay);
  const missedTotal = Number(missedSnapshot?.total) || 0;
  const yesterdayMissed = Number(yesterdayCountRow?.total) || 0;
  const recentMissed = missedSnapshot?.recent && missedSnapshot.recent.length ? missedSnapshot.recent[0] : null;
  const nextBestAction = buildDigestNextBestAction({
    factionId,
    missions,
    missedTotal,
  });
  await ensureWtfEventsForDay(db, utcDay).catch(() => {});
  const nextWtfRows = await db.prepare(`
    SELECT event_id, title, starts_at, ends_at
    FROM daily_wtf_events
    WHERE utc_day = ? AND ends_at >= ?
    ORDER BY starts_at ASC
  `).bind(utcDay, new Date().toISOString()).all().catch(() => ({ results: [] }));
  const officialWtfIds = new Set(getWtfDailySchedule(utcDay).map((event) => event.event_id));
  const nextWtf = (nextWtfRows?.results || []).find((row) => officialWtfIds.has(String(row.event_id))) || null;

  const missionLines = missions.length
    ? missions.map((mission, idx) => {
        const progressLabel = mission.completed ? 'complete' : `${mission.progress} / ${mission.target || '?'}`;
        return `${idx + 1}. <b>${escapeHtml(mission.title)}</b> — ${escapeHtml(progressLabel)} — clout/status push`;
      }).join('\n')
    : 'No synced mission progress yet. Open Battle Chamber to activate today’s faction missions.';

  const missedLine = recentMissed
    ? `Recent missed: ${escapeHtml(recentMissed.title)} (${escapeHtml(recentMissed.utc_day)})`
    : 'Recent missed: none recorded yet';

  const weeklyStanding = factionLogData.weekly_standing ? `#${factionLogData.weekly_standing}` : '—';
  const wtfSignalLine = nextWtf
    ? `${nextWtf.title} (${String(nextWtf.starts_at).slice(11, 16)}-${String(nextWtf.ends_at).slice(11, 16)} UTC)`
    : 'No live window right now. Next signal loads soon.';
  const message =
    `GM, the Battle Chamber has reset. Your faction has new work.\n\n` +
    `<b>Faction:</b> ${escapeHtml(factionLabel)}\n\n` +
    `<b>Today’s faction daily missions</b>\n${missionLines}\n\n` +
    `<b>WTF timed signal</b>\n${escapeHtml(wtfSignalLine)}\nCheck in when the signal opens.\n\n` +
    `<b>Missed perks update</b>\n` +
    `You have ${missedTotal} missed opportunities in your Battle Chamber history. The city kept moving while you were away.\n` +
    `Yesterday missed: ${yesterdayMissed}\n` +
    `${missedLine}\n\n` +
    `<b>Faction daily log</b>\n` +
    `Daily contribution: ${factionLogData.daily_contribution}\n` +
    `Weekly contribution: ${factionLogData.weekly_contribution}\n` +
    `Momentum: ${escapeHtml(factionLogData.momentum)}\n` +
    `Weekly standing: ${escapeHtml(weeklyStanding)}\n` +
    `Next best action: ${escapeHtml(nextBestAction)}`;

  const sendResult = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramId, message, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⚔️ Open Battle Chamber', url: `${SITE_URL}/community.html` },
          { text: '🕹️ Play Arcade', url: `${SITE_URL}/games/index.html` },
        ],
        [
          { text: '🏛️ View Faction Chamber', url: buildFactionChamberLink(factionId) },
          { text: '🔗 Refresh Telegram Link', url: `${SITE_URL}/gkniftyheads-incubator.html` },
        ],
      ],
    },
  });

  return {
    ok: !!sendResult?.ok,
    status: sendResult?.status || null,
    error: sendResult?.ok ? null : (sendResult?.error || sendResult?.response || 'telegram_send_failed'),
    context: {
      faction_id: factionId,
      missions_count: missions.length,
      missed_total: missedTotal,
      yesterday_missed: yesterdayMissed,
      next_best_action: nextBestAction,
      daily_contribution: factionLogData.daily_contribution,
      weekly_contribution: factionLogData.weekly_contribution,
      momentum: factionLogData.momentum,
      weekly_standing: factionLogData.weekly_standing,
      utc_day: utcDay,
    },
  };
}

async function runTelegramDailyDigest(env, options = {}) {
  const db = env.DB;
  const utcDay = options.utcDay || getTodayUtcDate();
  const targetTelegramId = options.targetTelegramId ? String(options.targetTelegramId) : null;
  const forceRetry = !!options.forceRetry;
  const dbCheck = await ensureDailyDigestTables(db);
  if (dbCheck) {
    return { ok: false, error: 'daily_digest_unavailable', reason: dbCheck.tableName };
  }
  const linkedIds = await getLinkedTelegramUsersForDigest(db, targetTelegramId);
  const summary = {
    ok: true,
    utc_day: utcDay,
    trigger: options.trigger || 'manual',
    linked_users_considered: linkedIds.length,
    processed: 0,
    sent: 0,
    skipped: targetTelegramId && !linkedIds.length ? 1 : 0,
    skipped_already_sent: 0,
    skipped_pending_recent: 0,
    skipped_unlinked: targetTelegramId && !linkedIds.length ? 1 : 0,
    failed: 0,
    failures: [],
  };
  const processTelegramId = async (telegramId) => {
    const claim = await claimDailyDigestSlot(db, telegramId, utcDay, {
      forceRetry,
      trigger: options.trigger || 'manual',
    });
    if (!claim?.claimed) {
      return { kind: 'skipped', telegram_id: telegramId, reason: claim?.reason || 'blocked' };
    }
    const result = await sendDailyDigestMessage(db, env, telegramId, utcDay).catch((error) => ({
      ok: false,
      error: error?.message || String(error),
      context: {},
    }));
    if (result.ok) {
      await finalizeDailyDigestLog(db, telegramId, utcDay, 'sent', {
        metadata: {
          trigger: options.trigger || 'manual',
          ...result.context,
        },
      });
      return { kind: 'sent', telegram_id: telegramId };
    }
    await finalizeDailyDigestLog(db, telegramId, utcDay, 'failed', {
      error: result.error || 'telegram_send_failed',
      metadata: {
        trigger: options.trigger || 'manual',
        status: result.status || null,
        ...result.context,
      },
    });
    return {
      kind: 'failed',
      telegram_id: telegramId,
      error: result.error || 'telegram_send_failed',
    };
  };
  for (let i = 0; i < linkedIds.length; i += DIGEST_SEND_BATCH_SIZE) {
    const batch = linkedIds.slice(i, i + DIGEST_SEND_BATCH_SIZE);
    for (let j = 0; j < batch.length; j += DIGEST_SEND_MAX_CONCURRENCY) {
      const concurrencySlice = batch.slice(j, j + DIGEST_SEND_MAX_CONCURRENCY);
      const results = await Promise.all(concurrencySlice.map((telegramId) => processTelegramId(telegramId)));
      for (const entry of results) {
        if (entry.kind === 'sent') {
          summary.processed += 1;
          summary.sent += 1;
          continue;
        }
        if (entry.kind === 'failed') {
          summary.processed += 1;
          summary.failed += 1;
          summary.failures.push({
            telegram_id: entry.telegram_id,
            error: entry.error,
          });
          continue;
        }
        summary.skipped += 1;
        if (entry.reason === 'already_sent') summary.skipped_already_sent += 1;
        if (entry.reason === 'pending_recent') summary.skipped_pending_recent += 1;
      }
    }
  }
  return summary;
}


const TELEGRAM_GROUP_ANNOUNCEMENT_TYPES = Object.freeze({
  TIMED_EVENTS: 'timed_events',
  DAILY_SUMMARY: 'daily_summary',
  ALL: 'all',
});
const TELEGRAM_GROUP_ANNOUNCEMENT_LOOKAHEAD_MS = 15 * 60 * 1000;
const TELEGRAM_GROUP_PRE_EVENT_MINUTES = 10;
const TELEGRAM_GROUP_RETRY_PENDING_AFTER_MS = 10 * 60 * 1000;

async function ensureTelegramGroupAnnouncementTables(db) {
  for (const tableName of TELEGRAM_GROUP_ANNOUNCEMENT_TABLES) {
    const row = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    ).bind(tableName).first().catch(() => null);
    if (!row?.name) {
      return {
        _isTelegramGroupAnnouncementsUnavailable: true,
        tableName,
        response: new Response(JSON.stringify({
          ok: false,
          error: 'telegram_group_announcements_unavailable',
          reason: `migration_pending:${tableName}`,
          message: 'Telegram group announcement tables are not yet configured. Apply migration 020.',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }),
      };
    }
  }
  return null;
}

function getTelegramGroupConfig(env) {
  const chatId = String(env.TELEGRAM_GROUP_CHAT_ID || '').trim();
  const threadId = String(env.TELEGRAM_GROUP_THREAD_ID || '').trim();
  return {
    configured: !!chatId,
    chat_id: chatId || null,
    message_thread_id: threadId || null,
  };
}

function describeWtfRequiredAction(requiredAction) {
  if (requiredAction === 'complete_faction_or_battle_action') return 'Complete a faction mission or Battle Chamber proof while the signal is live.';
  if (requiredAction === 'score_target_any_game') return 'Post an accepted arcade score while the burst is live.';
  if (requiredAction === 'choose_and_complete_chaos_path') return 'Choose a roguelite chaos path and complete the objective.';
  return 'Open an accepted arcade run while the signal is live.';
}

function formatUtcHm(iso) {
  return String(iso || '').slice(11, 16);
}

function buildWtfPreEventGroupAnnouncement(eventRow) {
  const durationMinutes = Math.round((Date.parse(eventRow.ends_at) - Date.parse(eventRow.starts_at)) / 60000) || 90;
  return [
    '🚨 WTF SIGNAL IN 10 MINUTES',
    '',
    `${eventRow.title} opens at ${formatUtcHm(eventRow.starts_at)} UTC.`,
    '',
    `Objective: ${describeWtfRequiredAction(eventRow.required_action)}`,
    `Window: ${durationMinutes} minutes.`,
    '',
    'Check in when it opens, complete the objective, and unlock roguelite options.',
    '',
    `Battle Chamber: ${SITE_URL}/community.html`,
    `Arcade: ${SITE_URL}/games/`,
    '',
    'Fun community gameplay/status event only — not a market signal.',
  ].join('\n');
}

function buildDailyGroupSummaryMessage(utcDay) {
  const windows = getWtfDailySchedule(utcDay)
    .map((event) => `${String(event.startHour).padStart(2, '0')}:00`)
    .join(', ');
  return [
    '⚡ Battle Chamber Daily Board is live.',
    '',
    `Six Daily WTF signals open today at ${windows} UTC.`,
    '',
    'Current focus: Battle Chamber proof, faction clout, accepted arcade runs, and missed opportunity history.',
    '',
    'Daily faction missions are live. Faction chambers have mission boards, and missed history does not reset. The city keeps moving while you are away.',
    '',
    'Check the site for current tasks, timed quests, roguelite options, and XP/status preview details.',
    '',
    `Battle Chamber: ${SITE_URL}/community.html`,
    `Arcade: ${SITE_URL}/games/`,
    `Faction Chambers: ${SITE_URL}/battle-chamber/factions/index.html`,
  ].join('\n');
}

function getTimedGroupAnnouncementCandidates(nowMs, options = {}) {
  const windowMs = Number(options.windowMs) || TELEGRAM_GROUP_ANNOUNCEMENT_LOOKAHEAD_MS;
  const force = !!options.force;
  const announcementKeyFilter = options.announcementKey ? String(options.announcementKey).trim() : null;
  const eventIdFilter = options.eventId ? String(options.eventId).trim() : null;
  const utcDayFilter = options.utcDay ? String(options.utcDay).trim().slice(0, 10) : null;
  const now = new Date(nowMs);
  const today = now.toISOString().slice(0, 10);
  const days = [...new Set([today, addUtcDays(today, 1), addUtcDays(today, -1)].filter(Boolean))];
  const candidates = [];
  for (const utcDay of days) {
    if (utcDayFilter && utcDay !== utcDayFilter) continue;
    for (const event of getWtfDailySchedule(utcDay)) {
      const row = buildWtfScheduleRow(utcDay, event);
      const announcementKey = `wtf:${utcDay}:${row.event_id}:minus_10`;
      if (announcementKeyFilter && announcementKey !== announcementKeyFilter) continue;
      if (eventIdFilter && row.event_id !== eventIdFilter) continue;
      const scheduledMs = Date.parse(row.starts_at) - TELEGRAM_GROUP_PRE_EVENT_MINUTES * 60 * 1000;
      const dueByTime = nowMs >= scheduledMs && nowMs <= scheduledMs + windowMs;
      const explicitlyForced = force && (announcementKeyFilter || (eventIdFilter && utcDayFilter));
      const due = dueByTime || explicitlyForced;
      if (!due) continue;
      candidates.push({
        announcement_key: announcementKey,
        utc_day: utcDay,
        event_id: row.event_id,
        announcement_type: 'wtf_pre_event_minus_10',
        scheduled_for: new Date(scheduledMs).toISOString(),
        message: buildWtfPreEventGroupAnnouncement(row),
        metadata: {
          title: row.title,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          required_action: row.required_action,
          pre_event_minutes: TELEGRAM_GROUP_PRE_EVENT_MINUTES,
        },
      });
    }
  }
  return candidates.sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)) || String(a.announcement_key).localeCompare(String(b.announcement_key)));
}

function getDailyGroupSummaryCandidates(nowMs, options = {}) {
  const force = !!options.force;
  const now = new Date(nowMs);
  const utcDay = now.toISOString().slice(0, 10);
  const scheduledMs = Date.parse(`${utcDay}T09:00:00.000Z`);
  const windowMs = Number(options.windowMs) || TELEGRAM_GROUP_ANNOUNCEMENT_LOOKAHEAD_MS;
  if (!force && !(nowMs >= scheduledMs && nowMs <= scheduledMs + windowMs)) return [];
  return [{
    announcement_key: `daily-summary:${utcDay}`,
    utc_day: utcDay,
    event_id: null,
    announcement_type: 'daily_summary',
    scheduled_for: new Date(scheduledMs).toISOString(),
    message: buildDailyGroupSummaryMessage(utcDay),
    metadata: {
      wtf_windows_utc: getWtfDailySchedule(utcDay).map((event) => `${String(event.startHour).padStart(2, '0')}:00`),
      coverage: ['daily_faction_missions', 'battle_chamber_proof', 'missed_opportunities'],
    },
  }];
}

function getTelegramGroupAnnouncementCandidates(type, nowMs, options = {}) {
  const normalized = String(type || TELEGRAM_GROUP_ANNOUNCEMENT_TYPES.ALL).trim().toLowerCase();
  const candidates = [];
  if (normalized === TELEGRAM_GROUP_ANNOUNCEMENT_TYPES.ALL || normalized === TELEGRAM_GROUP_ANNOUNCEMENT_TYPES.TIMED_EVENTS) {
    candidates.push(...getTimedGroupAnnouncementCandidates(nowMs, options));
  }
  if (normalized === TELEGRAM_GROUP_ANNOUNCEMENT_TYPES.ALL || normalized === TELEGRAM_GROUP_ANNOUNCEMENT_TYPES.DAILY_SUMMARY) {
    candidates.push(...getDailyGroupSummaryCandidates(nowMs, options));
  }
  return candidates;
}

async function getTelegramGroupAnnouncementLog(db, announcementKey) {
  return db.prepare(`
    SELECT announcement_key, status, sent_at, updated_at
    FROM telegram_group_announcement_log
    WHERE announcement_key = ?
    LIMIT 1
  `).bind(announcementKey).first().catch(() => null);
}

async function claimTelegramGroupAnnouncement(db, candidate, options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const staleBeforeIso = new Date(nowMs - TELEGRAM_GROUP_RETRY_PENDING_AFTER_MS).toISOString();
  const insertResult = await db.prepare(`
    INSERT OR IGNORE INTO telegram_group_announcement_log
      (announcement_key, utc_day, event_id, announcement_type, scheduled_for, status, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'sending', ?, ?, ?)
  `).bind(
    candidate.announcement_key,
    candidate.utc_day,
    candidate.event_id || null,
    candidate.announcement_type,
    candidate.scheduled_for,
    JSON.stringify(candidate.metadata || {}),
    nowIso,
    nowIso,
  ).run();
  if (Number(insertResult?.meta?.changes || 0) === 1) return { claimed: true, reason: 'new' };

  const updateResult = await db.prepare(`
    UPDATE telegram_group_announcement_log
    SET utc_day = ?, event_id = ?, announcement_type = ?, scheduled_for = ?, status = 'sending', error_message = NULL, metadata_json = ?, updated_at = ?
    WHERE announcement_key = ?
      AND (
        status = 'failed'
        OR (status IN ('pending', 'sending') AND updated_at <= ?)
      )
  `).bind(
    candidate.utc_day,
    candidate.event_id || null,
    candidate.announcement_type,
    candidate.scheduled_for,
    JSON.stringify(candidate.metadata || {}),
    nowIso,
    candidate.announcement_key,
    staleBeforeIso,
  ).run();
  if (Number(updateResult?.meta?.changes || 0) === 1) return { claimed: true, reason: 'retry' };

  const existing = await getTelegramGroupAnnouncementLog(db, candidate.announcement_key);
  if (existing?.status === 'sent') return { claimed: false, reason: 'already_sent' };
  if (existing?.status === 'pending' || existing?.status === 'sending') return { claimed: false, reason: 'already_claimed' };
  return { claimed: false, reason: 'duplicate' };
}

async function finalizeTelegramGroupAnnouncement(db, candidate, status, payload = {}) {
  const nowIso = new Date().toISOString();
  const sentAt = status === 'sent' ? nowIso : null;
  await db.prepare(`
    UPDATE telegram_group_announcement_log
    SET sent_at = COALESCE(?, sent_at), status = ?, error_message = ?, metadata_json = ?, updated_at = ?
    WHERE announcement_key = ?
  `).bind(
    sentAt,
    status,
    payload.error ? clampText(payload.error, 500, 'telegram_group_send_failed') : null,
    JSON.stringify({ ...(candidate.metadata || {}), ...(payload.metadata || {}) }),
    nowIso,
    candidate.announcement_key,
  ).run().catch((error) => {
    logApiFailure('telegram_group_announcement_finalize_failed', {
      announcement_key: candidate.announcement_key,
      message: error?.message || String(error),
    });
  });
}

async function sendTelegramGroupAnnouncement(env, candidate) {
  const groupConfig = getTelegramGroupConfig(env);
  if (!groupConfig.configured) {
    console.log('telegram_group_not_configured', JSON.stringify({ announcement_key: candidate?.announcement_key || null }));
    return { ok: false, skipped: true, error: 'telegram_group_not_configured' };
  }
  const extra = { disable_web_page_preview: true };
  if (groupConfig.message_thread_id) extra.message_thread_id = Number(groupConfig.message_thread_id) || groupConfig.message_thread_id;
  const result = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, groupConfig.chat_id, candidate.message, extra);
  if (!result?.ok) {
    logApiFailure('telegram_group_send_failed', {
      announcement_key: candidate.announcement_key,
      status: result?.status || null,
      response: clampText(result?.response || result?.error || 'telegram_send_failed', 500, 'telegram_send_failed'),
    });
  }
  return result;
}

async function runTelegramGroupAnnouncements(env, options = {}) {
  const nowMs = Number.isFinite(Date.parse(options.now || '')) ? Date.parse(options.now) : Date.now();
  const type = options.type || TELEGRAM_GROUP_ANNOUNCEMENT_TYPES.ALL;
  const dryRun = options.dry_run === true || options.dryRun === true;
  const force = options.force === true;
  const groupConfig = getTelegramGroupConfig(env);
  const dueAnnouncements = getTelegramGroupAnnouncementCandidates(type, nowMs, {
    force,
    announcementKey: options.announcement_key || options.announcementKey || null,
    eventId: options.event_id || options.eventId || null,
    utcDay: options.utc_day || options.utcDay || null,
  });
  const summary = {
    ok: true,
    group_configured: groupConfig.configured,
    group_thread_configured: !!groupConfig.message_thread_id,
    type,
    now: new Date(nowMs).toISOString(),
    due_announcements: dueAnnouncements.map((candidate) => ({
      announcement_key: candidate.announcement_key,
      utc_day: candidate.utc_day,
      event_id: candidate.event_id,
      announcement_type: candidate.announcement_type,
      scheduled_for: candidate.scheduled_for,
    })),
    sent_count: 0,
    skipped_count: 0,
    failed_count: 0,
    dry_run: dryRun,
    errors: [],
  };
  if (!groupConfig.configured) {
    if (dueAnnouncements.length > 0) console.log('telegram_group_not_configured');
    summary.skipped_count = dueAnnouncements.length;
    return summary;
  }
  if (dryRun) {
    summary.skipped_count = dueAnnouncements.length;
    return summary;
  }
  const dbCheck = await ensureTelegramGroupAnnouncementTables(env.DB);
  if (dbCheck) {
    summary.ok = false;
    summary.failed_count = dueAnnouncements.length;
    summary.errors.push(dbCheck.tableName || 'telegram_group_announcement_log');
    return summary;
  }
  for (const candidate of dueAnnouncements) {
    const claim = await claimTelegramGroupAnnouncement(env.DB, candidate, { force });
    if (!claim?.claimed) {
      summary.skipped_count += 1;
      continue;
    }
    const result = await sendTelegramGroupAnnouncement(env, candidate).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if (result?.ok) {
      await finalizeTelegramGroupAnnouncement(env.DB, candidate, 'sent', { metadata: { telegram_status: result.status || null } });
      summary.sent_count += 1;
      continue;
    }
    const errorMessage = result?.response || result?.error || 'telegram_group_send_failed';
    await finalizeTelegramGroupAnnouncement(env.DB, candidate, 'failed', { error: errorMessage });
    summary.failed_count += 1;
    summary.errors.push({ announcement_key: candidate.announcement_key, error: clampText(errorMessage, 500, 'telegram_group_send_failed') });
  }
  return summary;
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');

    // Set per-request CORS headers reflecting the request's Origin.
    CORS_HEADERS = buildCorsHeaders(request, env);

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


    // ── POST /admin/blocktopia/access ─────────────────────────────────────
    // Admin access probe for hidden tooling UIs.
    // Requires verified Telegram auth payload and returns only coarse capability flags.
    if (path === '/admin/blocktopia/access' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }

      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);

      return json({
        ok: true,
        telegram_id: verified.telegramId,
        admin_allowlisted: isAdminTelegramUser(verified.telegramId, env),
        admin_secret_configured: !!String(env.ADMIN_SECRET || '').trim(),
      });
    }

    // ── POST /admin/blocktopia/grant-xp ───────────────────────────────────
    // Admin-only tooling endpoint for Block Topia test/ops XP + gems grants.
    if (path === '/admin/blocktopia/grant-xp' && request.method === 'POST') {
      const configuredSecret = String(env.ADMIN_SECRET || '').trim();
      if (!configuredSecret) return err('Admin tooling is not configured', 503);
      if (readAdminSecret(request) !== configuredSecret) return err('Unauthorized', 401);

      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }

      const telegramId = String(body?.telegram_id || '').trim();
      const adminTelegramId = String(body?.admin_telegram_id || '').trim();
      const hasXpInput = body && Object.prototype.hasOwnProperty.call(body, 'xp');
      const hasGemsInput = body && Object.prototype.hasOwnProperty.call(body, 'gems');
      const rawXp = hasXpInput ? Number(body?.xp) : null;
      const rawGems = hasGemsInput ? Number(body?.gems) : null;
      const reason = String(body?.reason || '').trim().slice(0, 280);

      if (!telegramId || !/^\d{5,20}$/.test(telegramId)) {
        return err('Valid target telegram_id is required', 400);
      }
      if (!adminTelegramId || !/^\d{5,20}$/.test(adminTelegramId)) {
        return err('Valid admin_telegram_id is required', 400);
      }
      if (!isAdminTelegramUser(adminTelegramId, env)) {
        return err('Forbidden: admin not allowed', 403);
      }
      if (!hasXpInput && !hasGemsInput) {
        return err('At least one of xp or gems must be provided', 400);
      }
      if (hasXpInput && (!Number.isInteger(rawXp) || rawXp <= 0)) {
        return err('xp must be a positive integer', 400);
      }
      if (hasGemsInput && (!Number.isInteger(rawGems) || rawGems <= 0)) {
        return err('gems must be a positive integer', 400);
      }
      const grantXp = hasXpInput ? Math.min(rawXp, BLOCKTOPIA_ADMIN_XP_GRANT_MAX) : 0;
      const grantGems = hasGemsInput ? Math.min(rawGems, BLOCKTOPIA_ADMIN_GEMS_GRANT_MAX) : 0;

      try {
        const row = await getOrCreateBlockTopiaProgression(env.DB, telegramId);
        // Admin grants are trusted tooling actions and must stay outside Phase 4
        // player enforcement. Do not clamp through reward caps or mutate
        // pressure/cooldown-adjacent activity state here.
        const currentXp = Math.max(XP_MIN, Math.floor(Number(row?.xp) || 0));
        const currentGems = Math.max(GEMS_MIN, Math.floor(Number(row?.gems) || 0));
        const nextXp = currentXp + grantXp;
        const nextGems = currentGems + grantGems;
        const appliedXpDelta = nextXp - currentXp;
        const appliedGemsDelta = nextGems - currentGems;
        if (appliedXpDelta <= 0 && appliedGemsDelta <= 0) {
          return err('Grant cannot be applied at current cap', 409);
        }

        await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET xp = ?, gems = ?, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?
        `).bind(nextXp, nextGems, telegramId).run();

        await writeBlockTopiaAdminGrantAudit(env.DB, {
          telegramId,
          adminTelegramId,
          xpChange: appliedXpDelta,
          gemsChange: appliedGemsDelta,
          reason,
        });

        return json({
          ok: true,
          target_telegram_id: telegramId,
          admin_telegram_id: adminTelegramId,
          requested_xp: hasXpInput ? rawXp : null,
          requested_gems: hasGemsInput ? rawGems : null,
          granted_xp: grantXp,
          granted_gems: grantGems,
          applied_xp: appliedXpDelta,
          applied_gems: appliedGemsDelta,
          progression: {
            telegram_id: telegramId,
            xp_before: currentXp,
            xp_after: nextXp,
            gems_before: currentGems,
            gems_after: nextGems,
          },
        });
      } catch (error) {
        logApiFailure('admin_blocktopia_grant_xp_failed', {
          telegramId,
          adminTelegramId,
          xp: rawXp,
          gems: rawGems,
          message: error?.message || String(error),
        });
        return err('Failed to grant Block Topia progression resources', 500);
      }
    }

    // ── POST /admin/arcade/grant-xp ───────────────────────────────────────
    // Admin-only tooling endpoint to grant Arcade XP (arcade_progression_state.arcade_xp_total).
    // This is the value checked by the Block Topia multiplayer gate.
    if (path === '/admin/arcade/grant-xp' && request.method === 'POST') {
      const configuredSecret = String(env.ADMIN_SECRET || '').trim();
      if (!configuredSecret) return err('Admin tooling is not configured', 503);
      if (readAdminSecret(request) !== configuredSecret) return err('Unauthorized', 401);

      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }

      const telegramId = String(body?.telegram_id || '').trim();
      const adminTelegramId = String(body?.admin_telegram_id || '').trim();
      const rawXp = body && Object.prototype.hasOwnProperty.call(body, 'xp') ? Number(body.xp) : null;
      const reason = String(body?.reason || '').trim().slice(0, 280);

      if (!telegramId || !/^\d{5,20}$/.test(telegramId)) {
        return err('Valid target telegram_id is required', 400);
      }
      if (!adminTelegramId || !/^\d{5,20}$/.test(adminTelegramId)) {
        return err('Valid admin_telegram_id is required', 400);
      }
      if (!isAdminTelegramUser(adminTelegramId, env)) {
        return err('Forbidden: admin not allowed', 403);
      }
      if (rawXp === null) {
        return err('xp is required', 400);
      }
      if (!Number.isInteger(rawXp) || rawXp <= 0) {
        return err('xp must be a positive integer', 400);
      }
      const grantXp = Math.min(rawXp, ARCADE_ADMIN_XP_GRANT_MAX);

      try {
        const currentArcadeDailyKey = new Date().toISOString().slice(0, 10);

        const rowBefore = await env.DB.prepare(`
          SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ? LIMIT 1
        `).bind(telegramId).first();
        const xpBefore = Math.max(0, Math.floor(Number(rowBefore?.arcade_xp_total) || 0));

        await env.DB.prepare(`
          INSERT INTO arcade_progression_state
            (telegram_id, arcade_xp_total, arcade_daily_xp, arcade_daily_key, arcade_restriction_level, restricted_until, updated_at)
          VALUES (?, ?, 0, ?, 0, NULL, CURRENT_TIMESTAMP)
          ON CONFLICT(telegram_id)
          DO UPDATE SET
            arcade_xp_total = arcade_progression_state.arcade_xp_total + excluded.arcade_xp_total,
            updated_at = CURRENT_TIMESTAMP
        `).bind(telegramId, grantXp, currentArcadeDailyKey).run();

        const rowAfter = await env.DB.prepare(`
          SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ? LIMIT 1
        `).bind(telegramId).first();
        const xpAfter = Math.max(0, Math.floor(Number(rowAfter?.arcade_xp_total) || 0));

        const auditReason = reason
          ? `arcade_xp_admin_grant: ${reason}`
          : 'arcade_xp_admin_grant';

        // Reuse the shared Block Topia audit log for arcade admin grants to avoid schema duplication.
        // The reason field (prefixed 'arcade_xp_admin_grant') distinguishes these entries from BT grants.
        await writeBlockTopiaAdminGrantAudit(env.DB, {
          telegramId,
          adminTelegramId,
          xpChange: grantXp,
          gemsChange: 0,
          reason: auditReason,
        });

        return json({
          ok: true,
          target_telegram_id: telegramId,
          admin_telegram_id: adminTelegramId,
          requested_xp: rawXp,
          granted_xp: grantXp,
          arcade_progression: {
            telegram_id: telegramId,
            arcade_xp_total_before: xpBefore,
            arcade_xp_total_after: xpAfter,
          },
        });
      } catch (error) {
        logApiFailure('admin_arcade_grant_xp_failed', {
          telegramId,
          adminTelegramId,
          xp: rawXp,
          message: error?.message || String(error),
        });
        return err('Failed to grant Arcade XP', 500);
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
      const signedAuthPayload = await buildSignedTelegramAuthPayload({
        id: String(id),
        first_name,
        last_name,
        username,
        photo_url,
      }, env.TELEGRAM_BOT_TOKEN, auth_date);
      if (!signedAuthPayload || !signedAuthPayload.hash || !signedAuthPayload.auth_date) {
        logApiFailure('telegram_auth_payload_sign_failed', { telegramId: String(id) });
        return err('Failed to generate signed Telegram auth payload', 500);
      }
      return json({
        ok: true,
        identity: {
          telegram_id:       String(id),
          telegram_username: username  || null,
          display_name:      displayName,
          avatar_url:        photo_url || null,
        },
        telegram_auth: signedAuthPayload,
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
    // Internal/admin only. Body: { telegram_id }
    // Invalidates outstanding tokens and generates a new one-time token
    // stored in telegram_link_tokens (15-minute TTL).
    // Rejects if the user's anti-cheat state is blocked.
    if (path === '/telegram/link' && request.method === 'POST') {
      if (!(await isAuthorizedByAdminSecret(request, env))) {
        logApiFailure('telegram_link_token_mint_denied', {
          hasAdminSecret: !!String(env.ADMIN_SECRET || '').trim(),
          hasHeaderSecret: !!readAdminSecret(request),
        });
        return err('Unauthorized', 401);
      }

      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const { telegram_id } = body || {};
      const telegramId = String(telegram_id || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id invalid');

      // Anti-cheat gate: reject competitive link action if account is blocked.
      try {
        const acState = await env.DB.prepare(
          `SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?`
        ).bind(telegramId).first();
        if (acState && acState.is_blocked === 1) {
          return err('Account is blocked from competitive actions. Contact the Moonboys community on Telegram to appeal.', 403);
        }
      } catch (error) {
        logApiFailure('telegram_link_anticheat_check_failed', {
          telegramId,
          message: error?.message || String(error),
        });
      }

      try {
        const linkToken = await createTelegramLinkToken(env.DB, telegramId);
        return json({ ok: true, ...linkToken });
      } catch (error) {
        logApiFailure('telegram_link_token_create_failed', {
          telegramId,
          message: error?.message || String(error),
        });
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

        const user = await env.DB.prepare(
          `SELECT telegram_id, username, first_name, last_name
           FROM telegram_users WHERE telegram_id = ?`
        ).bind(String(row.telegram_id)).first().catch(() => null);

        const signedAuthPayload = await buildSignedTelegramAuthPayload({
          id: String(row.telegram_id),
          username: user?.username || null,
          first_name: user?.first_name || null,
          last_name: user?.last_name || null,
          photo_url: null,
        }, env.TELEGRAM_BOT_TOKEN);
        if (!signedAuthPayload || !signedAuthPayload.hash || !signedAuthPayload.auth_date) {
          logApiFailure('telegram_link_confirm_auth_payload_sign_failed', { telegramId: String(row.telegram_id) });
          return err('Failed to generate signed Telegram auth payload', 500);
        }

        return json({
          ok: true,
          telegram_id: row.telegram_id,
          telegram_name: displayNameFromRow(user || { telegram_id: row.telegram_id }),
          telegram_auth: signedAuthPayload,
        });
      } catch {
        return err('Failed to confirm link token', 500);
      }
    }

    // ── POST /telegram/link/confirm ────────────────────────────────────────
    // Body: { telegram_auth }
    // Verifies a signed Telegram auth payload directly from the /gklink URL.
    if (path === '/telegram/link/confirm' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        console.log('[telegram_link_confirm]', JSON.stringify({
          event: 'invalid_json',
          timestamp: new Date().toISOString(),
        }));
        return err('Invalid JSON');
      }

      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      console.log('[telegram_link_confirm]', JSON.stringify({
        event: 'payload_received',
        hasTelegramAuth: !!verified?.authPayload,
        telegramId: verified?.authPayload?.id ? String(verified.authPayload.id) : null,
        timestamp: new Date().toISOString(),
      }));
      if (verified?.error) {
        console.log('[telegram_link_confirm]', JSON.stringify({
          event: 'verification_failed',
          telegramId: verified?.authPayload?.id ? String(verified.authPayload.id) : null,
          reason: verified.error,
          status: verified.status || 401,
          timestamp: new Date().toISOString(),
        }));
        return err(verified.error, verified.status || 401);
      }

      try {
        const acState = await env.DB.prepare(
          `SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?`
        ).bind(String(verified.telegramId)).first().catch(() => null);
        if (acState && acState.is_blocked === 1) {
          return err('Account is blocked from competitive actions. Contact the Moonboys community on Telegram to appeal.', 403);
        }

        await upsertTelegramUser(env.DB, verified.user);
        try {
          await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        } catch (error) {
          logApiFailure('telegram_link_confirm_progression_create_failed', {
            telegramId: verified.telegramId,
            message: error?.message || String(error),
          });
        }
        await logTelegramActivity(env.DB, verified.telegramId, 'link_confirmed', JSON.stringify({
          source: 'signed_payload',
          linked_at: new Date().toISOString(),
        })).catch((error) => {
          logApiFailure('telegram_link_confirm_activity_log_failed', {
            telegramId: verified.telegramId,
            message: error?.message || String(error),
          });
        });

        const user = await env.DB.prepare(
          `SELECT telegram_id, username, first_name, last_name
           FROM telegram_users WHERE telegram_id = ?`
        ).bind(String(verified.telegramId)).first().catch(() => null);

        console.log('[telegram_link_confirm]', JSON.stringify({
          event: 'verification_succeeded',
          telegramId: verified.telegramId,
          timestamp: new Date().toISOString(),
        }));

        return json({
          ok: true,
          telegram_id: verified.telegramId,
          telegram_name: displayNameFromRow(user || { telegram_id: verified.telegramId }),
          telegram_auth: verified.authPayload,
        });
      } catch (error) {
        console.log('[telegram_link_confirm]', JSON.stringify({
          event: 'confirm_exception',
          telegramId: verified.telegramId,
          reason: error?.message || String(error),
          timestamp: new Date().toISOString(),
        }));
        return err('Failed to confirm Telegram link', 500);
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

    // ── GET/POST /telegram/user/status ─────────────────────────────────────
    // GET keeps the direct telegram_id status lookup for existing pages.
    // POST additionally accepts signed browser auth evidence so the frontend
    // can restore a linked identity without already knowing telegram_id.
    if (path === '/telegram/user/status' && (request.method === 'GET' || request.method === 'POST')) {
      let requestBody = null;
      if (request.method === 'POST') {
        try {
          requestBody = await request.json();
        } catch {
          requestBody = {};
        }
      }
      const restoreEvidence = request.method === 'POST'
        ? await verifyTelegramAuthEvidenceForRestore(requestBody, env)
        : null;
      const telegramId = String(
        url.searchParams.get('telegram_id')
        || restoreEvidence?.telegramId
        || requestBody?.telegram_id
        || ''
      ).trim();
      if (!telegramId) {
        return json({
          ok: true,
          linked: false,
          link_confirmed: false,
          recovery: {
            attempted: request.method === 'POST',
            restored_from: null,
          },
          error: 'not_linked',
        });
      }

      try {
        // Fetch user profile, anti-cheat state, and server-side linked evidence in parallel.
        const [user, acState, linkEvent, blockTopiaProgression] = await Promise.all([
          env.DB.prepare(
            `SELECT telegram_id, username, first_name, last_name, xp, level, created_at
             FROM telegram_users WHERE telegram_id = ?`
          ).bind(telegramId).first().catch(() => null),
          env.DB.prepare(
            `SELECT is_blocked, block_type, blocked_reason, lifetime_strikes,
                    season_risk_score, year_risk_score, last_scan_at
             FROM telegram_anticheat_state WHERE telegram_id = ?`
          ).bind(telegramId).first().catch(() => null),
          env.DB.prepare(
            `SELECT action, created_at
             FROM telegram_activity_log
             WHERE telegram_id = ? AND action = 'link_confirmed'
             ORDER BY created_at DESC
             LIMIT 1`
          ).bind(telegramId).first().catch(() => null),
          env.DB.prepare(
            `SELECT telegram_id, xp, gems, tier, rpg_mode_active, updated_at
             FROM blocktopia_progression
             WHERE telegram_id = ?
             LIMIT 1`
          ).bind(telegramId).first().catch(() => null),
        ]);

        if (!user) {
          return json({
            ok: true,
            linked: false,
            link_confirmed: false,
            recovery: {
              attempted: request.method === 'POST',
              restored_from: restoreEvidence ? 'signed_browser_auth' : (url.searchParams.get('telegram_id') ? 'telegram_id' : null),
            },
            error: 'not_linked',
          });
        }

        const linked = Boolean(linkEvent || blockTopiaProgression);
        const signedAuthPayload = linked
          ? await buildSignedTelegramAuthPayload({
            id: String(user.telegram_id),
            username: user.username || null,
            first_name: user.first_name || null,
            last_name: user.last_name || null,
            photo_url: null,
          }, env.TELEGRAM_BOT_TOKEN)
          : null;

        return json({
          telegram_id:      user.telegram_id,
          username:         user.username    || null,
          display_name:     displayNameFromRow(user),
          xp:               user.xp          || 0,
          level:            user.level        || 1,
          member_since:     (user.created_at || '').slice(0, 10),
          linked,
          link_confirmed: linked,
          ok: true,
          link_source: linkEvent ? 'telegram_activity_log' : (blockTopiaProgression ? 'blocktopia_progression' : null),
          telegram_auth: signedAuthPayload,
          recovery: {
            attempted: request.method === 'POST',
            restored_from: restoreEvidence ? 'signed_browser_auth' : (url.searchParams.get('telegram_id') ? 'telegram_id' : null),
          },
          blocktopia_progression: blockTopiaProgression ? {
            xp: Number(blockTopiaProgression.xp || 0),
            gems: Number(blockTopiaProgression.gems || 0),
            tier: Number(blockTopiaProgression.tier || 1),
            rpg_mode_active: Number(blockTopiaProgression.rpg_mode_active || 0) === 1,
            updated_at: blockTopiaProgression.updated_at || null,
          } : null,
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

    // ── GET /roguelite/daily-state (legacy) OR POST JSON { telegram_auth }
    const isRogueliteDailyRoute =
      path === '/roguelite/daily-state' ||
      path === '/roguelite/missed-history' ||
      path === '/roguelite/mark-missed' ||
      path === '/telegram/daily-digest/run';

    if (isRogueliteDailyRoute) {
      const rogueliteDailyResponse = await handleRogueliteDailyRoutes(request, env, url, {
        path,
        json,
        err,
        verifyTelegramAuth,
        upsertTelegramUser,
        logApiFailure,
        readAdminSecret,
        isAdminTelegramUser,
        runTelegramDailyDigest,
      });
      if (rogueliteDailyResponse) return rogueliteDailyResponse;
    }

    if (path === '/wtf/events/today' && (request.method === 'GET' || request.method === 'POST')) {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      }
      const wtfCheck = await ensureDailyWtfTables(env.DB);
      if (wtfCheck) return wtfCheck.response;
      const utcDay = getTodayUtcDate();
      await ensureWtfEventsForDay(env.DB, utcDay);
      const nowMs = Date.now();
      const events = await env.DB.prepare(`SELECT * FROM daily_wtf_events WHERE utc_day = ? ORDER BY starts_at ASC`).bind(utcDay).all().catch(() => ({ results: [] }));
      const officialEventIds = new Set(getWtfDailySchedule(utcDay).map((event) => event.event_id));
      const officialRows = (events?.results || []).filter((row) => officialEventIds.has(String(row.event_id)));

      if (request.method === 'GET') {
        const normalizedPublic = officialRows.map((row) => ({
          event_id: row.event_id,
          utc_day: row.utc_day,
          start_at: row.starts_at,
          end_at: row.ends_at,
          event_type: row.event_type,
          title: row.title,
          description: row.description,
          required_action: row.required_action,
          reward_preview: row.reward_key,
          multiplier_display: row.xp_multiplier_display || '5x XP opportunity',
          visual_theme: row.theme || 'neon-signal',
          status: getWtfEventStatus(nowMs, row.starts_at, row.ends_at, 'upcoming'),
        }));
        const activeEvent = normalizedPublic.find((row) => row.status === 'active') || null;
        let upcomingEvents = normalizedPublic.filter((row) => row.status === 'upcoming');
        let nextEvent = upcomingEvents[0] || null;
        if (!activeEvent && !nextEvent) {
          nextEvent = await getNextDailyWtfEvent(env.DB, utcDay, (row) => ({
            event_id: row.event_id,
            utc_day: row.utc_day,
            start_at: row.starts_at,
            end_at: row.ends_at,
            event_type: row.event_type,
            title: row.title,
            description: row.description,
            required_action: row.required_action,
            reward_preview: row.reward_key,
            multiplier_display: row.xp_multiplier_display || '5x XP opportunity',
            visual_theme: row.theme || 'neon-signal',
            status: 'upcoming',
          }));
          if (nextEvent) upcomingEvents = [nextEvent];
        }
        const countdownTarget = activeEvent ? activeEvent.end_at : nextEvent ? nextEvent.start_at : null;
        return json({
          ok: true,
          auth_mode: 'public_schedule',
          utc_day: utcDay,
          active_event: activeEvent,
          upcoming_events: upcomingEvents,
          next_event: nextEvent,
          countdown_seconds: countdownTarget ? Math.max(0, Math.floor((Date.parse(countdownTarget) - nowMs) / 1000)) : 0,
        });
      }

      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      await upsertTelegramUser(env.DB, verified.user);
      await reconcileWtfExpiryForUser(env.DB, verified.telegramId, utcDay, nowMs);

      const playerRows = await env.DB.prepare(`
        SELECT event_id, status, checked_in_at, completed_at, missed_at, chain_depth, reward_status
        FROM daily_wtf_player_events
        WHERE telegram_id = ? AND utc_day = ?
      `).bind(verified.telegramId, utcDay).all().catch(() => ({ results: [] }));
      const byEvent = new Map((playerRows?.results || []).map((row) => [String(row.event_id), row]));
      const chainOptions = await env.DB.prepare(`
        SELECT event_id, option_id, option_type, status, reward_key, display_title, display_text
        FROM daily_wtf_chain_options
        WHERE telegram_id = ? AND utc_day = ? AND status = 'available'
        ORDER BY created_at DESC
      `).bind(verified.telegramId, utcDay).all().catch(() => ({ results: [] }));
      const availableByEvent = {};
      for (const opt of (chainOptions?.results || [])) {
        const key = String(opt.event_id);
        if (!availableByEvent[key]) availableByEvent[key] = [];
        availableByEvent[key].push(opt);
      }

      const normalized = officialRows.map((row) => {
        const player = byEvent.get(String(row.event_id)) || null;
        const scheduleStatus = getWtfEventStatus(nowMs, row.starts_at, row.ends_at, player?.status || 'upcoming');
        let playerStatus = 'not_checked_in';
        if (player?.completed_at) playerStatus = 'completed';
        else if (player?.status === 'missed') playerStatus = 'missed';
        else if (player?.checked_in_at && scheduleStatus === 'active') playerStatus = 'checked_in';
        else if (scheduleStatus === 'expired') playerStatus = (player?.status === 'missed' ? 'missed' : 'expired');
        return {
          event_id: row.event_id,
          utc_day: row.utc_day,
          start_at: row.starts_at,
          end_at: row.ends_at,
          event_type: row.event_type,
          title: row.title,
          description: row.description,
          required_action: row.required_action,
          reward_preview: row.reward_key,
          multiplier_display: row.xp_multiplier_display || '5x XP opportunity',
          visual_theme: row.theme || 'neon-signal',
          status: scheduleStatus,
          player_status: playerStatus,
          checked_in_at: player?.checked_in_at || null,
          completed_at: player?.completed_at || null,
          chain_depth: Math.max(0, Math.floor(Number(player?.chain_depth) || 0)),
          chain_options: availableByEvent[String(row.event_id)] || [],
        };
      });
      const activeEvent = normalized.find((row) => row.status === 'active') || null;
      let upcomingEvents = normalized.filter((row) => row.status === 'upcoming');
      let nextEvent = upcomingEvents[0] || null;
      if (!activeEvent && !nextEvent) {
        nextEvent = await getNextDailyWtfEvent(env.DB, utcDay, (row) => ({
          event_id: row.event_id,
          utc_day: row.utc_day,
          start_at: row.starts_at,
          end_at: row.ends_at,
          event_type: row.event_type,
          title: row.title,
          description: row.description,
          required_action: row.required_action,
          reward_preview: row.reward_key,
          multiplier_display: row.xp_multiplier_display || '5x XP opportunity',
          visual_theme: row.theme || 'neon-signal',
          status: 'upcoming',
          player_status: 'not_checked_in',
          checked_in_at: null,
          completed_at: null,
          chain_depth: 0,
          chain_options: [],
        }));
        if (nextEvent) upcomingEvents = [nextEvent];
      }
      const countdownTarget = activeEvent ? activeEvent.end_at : nextEvent ? nextEvent.start_at : null;
      const missedXpValueAvailable = await hasDailyMissedXpValueColumn(env.DB);
      const [allTimeMissedTotals, todayMissedTotals] = await Promise.all([
        getMissedPerkTotals(env.DB, verified.telegramId, null, missedXpValueAvailable),
        getMissedPerkTotals(env.DB, verified.telegramId, utcDay, missedXpValueAvailable),
      ]);
      return json({
        ok: true,
        auth_mode: 'telegram_verified',
        telegram_id: verified.telegramId,
        utc_day: utcDay,
        active_event: activeEvent,
        upcoming_events: upcomingEvents,
        next_event: nextEvent,
        countdown_seconds: countdownTarget ? Math.max(0, Math.floor((Date.parse(countdownTarget) - nowMs) / 1000)) : 0,
        checked_in: !!(activeEvent && activeEvent.player_status === 'checked_in'),
        current_task: activeEvent ? activeEvent.required_action : null,
        completed_today: normalized.filter((row) => row.player_status === 'completed').length,
        missed_today: normalized.filter((row) => row.player_status === 'missed' || row.player_status === 'expired').length,
        missed_history_count: allTimeMissedTotals.events_total,
        missed_events_all_time: allTimeMissedTotals.events_total,
        missed_xp_all_time: allTimeMissedTotals.xp_total,
        missed_events_today: todayMissedTotals.events_total,
        missed_xp_today: todayMissedTotals.xp_total,
        chain_options: activeEvent ? (activeEvent.chain_options || []) : ((chainOptions?.results || []).slice(0, 3)),
      });
    }

    if (path === '/wtf/events/check-in' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const wtfCheck = await ensureDailyWtfTables(env.DB);
      if (wtfCheck) return wtfCheck.response;
      await upsertTelegramUser(env.DB, verified.user);
      const utcDay = getTodayUtcDate();
      const eventId = clampText(body?.event_id, 80, '');
      const event = await env.DB.prepare(`SELECT event_id, starts_at, ends_at, required_action FROM daily_wtf_events WHERE utc_day = ? AND event_id = ? LIMIT 1`).bind(utcDay, eventId).first().catch(() => null);
      if (!event) return err('event_id not found for UTC day', 404);
      const nowMs = Date.now();
      if (nowMs < Date.parse(event.starts_at) || nowMs >= Date.parse(event.ends_at)) return err('Event is not active', 409);
      const existing = await env.DB.prepare(`SELECT status, checked_in_at, completed_at FROM daily_wtf_player_events WHERE telegram_id = ? AND event_id = ? AND utc_day = ? LIMIT 1`).bind(verified.telegramId, eventId, utcDay).first().catch(() => null);
      if (existing?.completed_at) {
        return json({ ok: true, event_id: eventId, status: 'completed', already_completed: true, current_task: event.required_action });
      }
      const nowIso = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO daily_wtf_player_events
          (telegram_id, event_id, utc_day, status, checked_in_at, completed_at, chain_depth, reward_status, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, 'checked_in', ?, NULL, 0, 'none', ?, ?, ?)
        ON CONFLICT(telegram_id, event_id, utc_day) DO UPDATE SET
          status = CASE WHEN daily_wtf_player_events.completed_at IS NOT NULL THEN 'completed' ELSE 'checked_in' END,
          checked_in_at = COALESCE(daily_wtf_player_events.checked_in_at, excluded.checked_in_at),
          updated_at = excluded.updated_at
      `).bind(verified.telegramId, eventId, utcDay, nowIso, JSON.stringify({ source: 'daily_wtf_checkin' }), nowIso, nowIso).run();
      return json({ ok: true, event_id: eventId, status: 'checked_in', current_task: event.required_action });
    }

    if (path === '/wtf/events/complete' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const wtfCheck = await ensureDailyWtfTables(env.DB);
      if (wtfCheck) return wtfCheck.response;
      const utcDay = getTodayUtcDate();
      const eventId = clampText(body?.event_id, 80, '');
      const source = clampText(body?.completion_source, 80, '');
      if (!WTF_ALLOWED_COMPLETION_SOURCES.has(source)) {
        return json({
          error: 'proof_required',
          message: 'Completion proof is required before this WTF signal can be cleared.',
        }, 409);
      }
      const event = await env.DB.prepare(`SELECT * FROM daily_wtf_events WHERE utc_day = ? AND event_id = ? LIMIT 1`).bind(utcDay, eventId).first().catch(() => null);
      if (!event) return err('event not found', 404);
      const nowMs = Date.now();
      const startsAtMs = Date.parse(event.starts_at);
      const endsAtMs = Date.parse(event.ends_at);
      if (Number.isFinite(startsAtMs) && nowMs < startsAtMs) return err('event_inactive', 409);
      if (Number.isFinite(endsAtMs) && nowMs >= endsAtMs) {
        await upsertWtfMissedEntry(env.DB, { telegramId: verified.telegramId, utcDay, eventRow: event, reason: 'attempted_completion_after_expiry' });
        return err('event_expired', 409);
      }
      const allowedForEvent = getAllowedSourcesForWtfEvent(event);
      if (!allowedForEvent.includes(source)) {
        return json({
          error: 'proof_required',
          message: 'Completion proof source does not match this WTF objective.',
        }, 409);
      }
      const proofResult = await verifyWtfCompletionProof(env.DB, {
        telegramId: verified.telegramId,
        source,
        sourceId: clampText(body?.source_id, 120, ''),
        event,
        utcDay,
      });
      if (!proofResult?.ok) {
        return json({
          error: 'proof_required',
          message: proofResult?.message || 'Completion proof is required before this WTF signal can be cleared.',
        }, 409);
      }
      const player = await env.DB.prepare(`SELECT * FROM daily_wtf_player_events WHERE telegram_id = ? AND event_id = ? AND utc_day = ? LIMIT 1`).bind(verified.telegramId, eventId, utcDay).first().catch(() => null);
      if (!player || !player.checked_in_at) return err('check-in required', 409);
      if (player.completed_at) return json({ ok: true, event_id: eventId, already_completed: true });
      const dailyTriggers = await env.DB.prepare(`SELECT COUNT(*) AS total FROM daily_wtf_player_events WHERE telegram_id = ? AND utc_day = ? AND completed_at IS NOT NULL`).bind(verified.telegramId, utcDay).first().catch(() => ({ total: 0 }));
      if (Number(dailyTriggers?.total || 0) >= WTF_MAX_CHAIN_TRIGGERS_PER_DAY) return err('daily chain cap reached', 429);
      const completedToday = Math.max(0, Math.floor(Number(dailyTriggers?.total || 0)));
      const chainDepth = Math.min(WTF_MAX_CHAIN_DEPTH, completedToday + 1);
      const nowIso = new Date().toISOString();
      const bonusXp = Math.min(WTF_MAX_BONUS_XP_PER_EVENT, 100 * chainDepth);
      await env.DB.prepare(`UPDATE daily_wtf_player_events SET status='completed', completed_at=?, chain_depth=?, reward_status='previewed', updated_at=?, metadata_json=? WHERE telegram_id=? AND event_id=? AND utc_day=?`)
        .bind(nowIso, chainDepth, nowIso, JSON.stringify({
          completion_source: source,
          source_id: clampText(body?.source_id, 120, ''),
          proof: proofResult?.proof || null,
          bonus_xp_preview: bonusXp,
          persisted_xp_awarded: false,
        }), verified.telegramId, eventId, utcDay).run();
      const options = ['comeback', 'chaos', 'faction'].map((type, idx) => ({
        option_id: `${eventId}-o${idx + 1}`,
        option_type: type,
        reward_key: `${event.reward_key}:${type}`,
        display_title: type === 'comeback' ? 'Comeback Route' : (type === 'chaos' ? 'Chaos Route' : 'Faction Route'),
        display_text: 'Choose one path to unlock the next objective.',
      }));
      for (const option of options) {
        await env.DB.prepare(`
          INSERT INTO daily_wtf_chain_options
            (telegram_id, event_id, utc_day, option_id, option_type, status, reward_key, display_title, display_text, created_at)
          VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)
          ON CONFLICT(telegram_id, event_id, utc_day, option_id) DO NOTHING
        `).bind(verified.telegramId, eventId, utcDay, option.option_id, option.option_type, option.reward_key, option.display_title, option.display_text, nowIso).run();
      }
      return json({
        ok: true,
        event_id: eventId,
        status: 'completed',
        xp_burst: {
          title: 'WTF BONUS PREVIEW',
          base_xp: 0,
          bonus_xp: bonusXp,
          total_xp: bonusXp,
          milestones: [100, 250, 500],
          event_id: eventId,
          chain_options: options,
          reduced_motion_fallback: true,
          persisted_xp_awarded: false,
          reward_status: 'previewed',
          message: 'XP opportunity preview only. Persistent XP award is server-authority gated.',
        },
        reward_status: 'previewed',
        chain_options: options,
      });
    }

    if (path === '/wtf/events/choose-option' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const wtfCheck = await ensureDailyWtfTables(env.DB);
      if (wtfCheck) return wtfCheck.response;
      const utcDay = getTodayUtcDate();
      const eventId = clampText(body?.event_id, 80, '');
      const optionId = clampText(body?.option_id, 120, '');
      const option = await env.DB.prepare(`SELECT * FROM daily_wtf_chain_options WHERE telegram_id = ? AND event_id = ? AND utc_day = ? AND option_id = ? LIMIT 1`).bind(verified.telegramId, eventId, utcDay, optionId).first().catch(() => null);
      if (!option) return err('option not found', 404);
      if (option.status !== 'available') return err('option already claimed', 409);
      const nowIso = new Date().toISOString();
      await env.DB.prepare(`UPDATE daily_wtf_chain_options SET status='chosen', chosen_at=? WHERE telegram_id = ? AND event_id = ? AND utc_day = ? AND option_id = ?`)
        .bind(nowIso, verified.telegramId, eventId, utcDay, optionId).run();
      return json({
        ok: true,
        event_id: eventId,
        option_id: optionId,
        status: 'chosen',
        next_objective: `Complete the ${option.display_title.toLowerCase()} objective before the next signal window.`,
      });
    }
    if (path === '/telegram/group-announcements/run' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      const configuredSecret = String(env.ADMIN_SECRET || '').trim();
      const headerSecret = readAdminSecret(request);
      let allowed = false;
      let authMode = null;
      if (configuredSecret && headerSecret === configuredSecret) {
        allowed = true;
        authMode = 'admin_secret';
      } else if (body && body.telegram_auth) {
        const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
        if (!verified.error && isAdminTelegramUser(verified.telegramId, env)) {
          allowed = true;
          authMode = 'admin_telegram_auth';
        }
      }
      if (!allowed) return err('Unauthorized', 401);
      const type = ['timed_events', 'daily_summary', 'all'].includes(String(body?.type || 'all')) ? String(body?.type || 'all') : 'all';
      const summary = await runTelegramGroupAnnouncements(env, {
        trigger: 'manual_route',
        dry_run: body?.dry_run === true,
        force: body?.force === true,
        now: body?.now ? String(body.now) : undefined,
        type,
        announcement_key: body?.announcement_key ? String(body.announcement_key) : null,
        event_id: body?.event_id ? String(body.event_id) : null,
        utc_day: body?.utc_day ? String(body.utc_day) : null,
      });
      return json({
        ok: !!summary?.ok,
        auth_mode: authMode,
        ...summary,
      }, summary?.ok ? 200 : 503);
    }

    // ── GET /faction/status with telegram_auth query payload ──────────────
    // Shared arcade progression sync endpoint.
    if (path === '/arcade/progression/sync' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);

      const entries = Array.isArray(body?.entries) ? body.entries.slice(0, ARCADE_MAX_BATCH_ENTRIES) : [];
      if (!entries.length) return json({ ok: true, results: [], synced: { accepted: 0, duplicate: 0, rejected: 0 } });

      try {
        await ensureArcadeProgressionTables(env.DB);
        await upsertTelegramUser(env.DB, verified.user);

        const nowMs = Date.now();
        let state = await getOrCreateArcadeProgressionState(env.DB, verified.telegramId, nowMs);
        const nowSql = sqliteNowFromMs(nowMs);
        const restrictedUntilMs = parseSqliteTs(state.restricted_until);
        if (restrictedUntilMs && restrictedUntilMs > nowMs) {
          return json({
            ok: false,
            error: 'Arcade progression is temporarily restricted',
            restricted_until: new Date(restrictedUntilMs).toISOString(),
          }, 429);
        }

        const results = [];
        let acceptedCount = 0;
        let duplicateCount = 0;
        let rejectedCount = 0;
        let xpBatchAwarded = 0;

        for (const input of entries) {
          const clientRunId = String(input?.client_run_id || '').trim().slice(0, 128);
          if (!clientRunId) {
            rejectedCount += 1;
            results.push({ client_run_id: null, status: 'rejected', reason: 'missing_client_run_id', xp_awarded: 0 });
            continue;
          }

          const game = normalizeArcadeGameKey(input?.game);
          const rawScore = normalizeScore(input?.raw_score);
          const localMetaPoints = normalizeMetaPoints(input?.meta_points);
          const normalizedPoints = computeNormalizedArcadePoints(game, rawScore, localMetaPoints);

          const claimed = await env.DB.prepare(`
            INSERT INTO arcade_progression_events
              (id, telegram_id, client_run_id, game, raw_score, local_meta_points, normalized_points, xp_awarded, status, reason, processed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'processing', 'claim_pending', CURRENT_TIMESTAMP)
            ON CONFLICT(telegram_id, client_run_id) DO NOTHING
          `).bind(
            crypto.randomUUID(),
            verified.telegramId,
            clientRunId,
            game,
            rawScore,
            localMetaPoints,
            normalizedPoints,
          ).run();
          const claimChanges = Number(claimed?.meta?.changes ?? claimed?.changes ?? 0);
          if (claimChanges !== 1) {
            duplicateCount += 1;
            results.push({
              client_run_id: clientRunId,
              status: 'duplicate',
              reason: 'already_processed',
              xp_awarded: 0,
            });
            continue;
          }

          const perGameCeiling = Math.max(200, Math.floor(6000 * (game === 'invaders' ? 1.2 : 1)));
          let enforcement = await getOrCreateGameEnforcementState(env.DB, verified.telegramId, game);
          const lockoutUntilMs = parseSqliteTs(enforcement.lockout_until);
          const cooldownUntilMs = parseSqliteTs(enforcement.cooldown_until);
          const repeatWindowUntilMs = parseSqliteTs(enforcement.repeat_window_expires_at);

          if (lockoutUntilMs && lockoutUntilMs > nowMs) {
            rejectedCount += 1;
            await env.DB.prepare(`
              UPDATE arcade_progression_events
              SET status = 'rejected', reason = ?, xp_awarded = 0, processed_at = CURRENT_TIMESTAMP
              WHERE telegram_id = ? AND client_run_id = ?
            `).bind(
              'game_lockout_active',
              verified.telegramId,
              clientRunId,
            ).run();
            results.push({ client_run_id: clientRunId, status: 'rejected', reason: 'game_lockout_active', xp_awarded: 0 });
            continue;
          }

          if (cooldownUntilMs && cooldownUntilMs > nowMs) {
            rejectedCount += 1;
            await env.DB.prepare(`
              UPDATE arcade_progression_events
              SET status = 'rejected', reason = ?, xp_awarded = 0, processed_at = CURRENT_TIMESTAMP
              WHERE telegram_id = ? AND client_run_id = ?
            `).bind(
              'game_cooldown_active',
              verified.telegramId,
              clientRunId,
            ).run();
            results.push({ client_run_id: clientRunId, status: 'rejected', reason: 'game_cooldown_active', xp_awarded: 0 });
            continue;
          }

          let xpWeight = Math.max(0.2, Math.min(1, Number(enforcement.xp_weight) || 1));
          let ceilingHits = Math.max(0, Math.floor(Number(enforcement.ceiling_hits) || 0));
          let cooldownLevel = Math.max(0, Math.floor(Number(enforcement.cooldown_level) || 0));
          let nextCooldownUntil = null;
          let nextRepeatWindow = null;
          let lockoutUntil = null;
          let lockoutCount = Math.max(0, Math.floor(Number(enforcement.lockout_count) || 0));
          let reason = 'accepted';

          const hitCeiling = normalizedPoints >= perGameCeiling;
          if (hitCeiling) {
            ceilingHits += 1;
            const repeatedHit = repeatWindowUntilMs && repeatWindowUntilMs > nowMs;
            cooldownLevel = Math.min(5, repeatedHit ? cooldownLevel + 1 : Math.max(1, cooldownLevel));
            const cooldownMins = [0, 5, 12, 30, 90, 360][cooldownLevel] || 360;
            nextCooldownUntil = new Date(nowMs + cooldownMins * 60 * 1000).toISOString();
            nextRepeatWindow = new Date(nowMs + ARCADE_REPEAT_COOLDOWN_MINUTES * 60 * 1000 + ARCADE_REPEAT_WINDOW_MINUTES * 60 * 1000).toISOString();
            xpWeight = Math.max(0.2, Number((xpWeight - 0.08).toFixed(4)));
            reason = repeatedHit ? 'repeat_window_ceiling_hit' : 'per_game_ceiling_hit';
            if (ceilingHits >= 8 || xpWeight <= 0.2) {
              lockoutCount += 1;
              lockoutUntil = new Date(nowMs + Math.min(7, lockoutCount) * 60 * 60 * 1000).toISOString();
              reason = 'game_lockout_triggered';
            }
          } else if (xpWeight < 1) {
            xpWeight = Math.min(1, Number((xpWeight + 0.01).toFixed(4)));
          }

          const baseXp = Math.min(ARCADE_XP_MAX_PER_RUN, Math.floor(normalizedPoints * ARCADE_XP_PER_POINT));
          let xpAwarded = Math.floor(baseXp * xpWeight);
          if (state.arcade_daily_xp >= ARCADE_XP_DAILY_CAP) {
            xpAwarded = 0;
            reason = 'daily_cap_reached';
          } else if (state.arcade_daily_xp + xpAwarded > ARCADE_XP_DAILY_CAP) {
            xpAwarded = Math.max(0, ARCADE_XP_DAILY_CAP - state.arcade_daily_xp);
            reason = 'daily_cap_clamped';
          }

          await env.DB.prepare(`
            UPDATE arcade_game_enforcement_state
            SET ceiling_hits = ?, cooldown_level = ?, cooldown_until = ?, last_ceiling_hit_at = ?,
                repeat_window_expires_at = ?, xp_weight = ?, lockout_until = ?, lockout_count = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ? AND game = ?
          `).bind(
            ceilingHits,
            cooldownLevel,
            nextCooldownUntil,
            hitCeiling ? nowSql : enforcement.last_ceiling_hit_at || null,
            nextRepeatWindow,
            xpWeight,
            lockoutUntil,
            lockoutCount,
            verified.telegramId,
            game,
          ).run();

          if (xpAwarded > 0) {
            await awardXp(env.DB, verified.telegramId, xpAwarded, 'arcade_progress_sync', `${game}:${clientRunId}`);
            xpBatchAwarded += xpAwarded;
          }

          await env.DB.prepare(`
            UPDATE arcade_progression_events
            SET game = ?, raw_score = ?, local_meta_points = ?, normalized_points = ?,
                xp_awarded = ?, status = 'accepted', reason = ?, processed_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ? AND client_run_id = ?
          `).bind(
            game,
            rawScore,
            localMetaPoints,
            normalizedPoints,
            xpAwarded,
            reason,
            verified.telegramId,
            clientRunId,
          ).run();

          acceptedCount += 1;
          state.arcade_xp_total = Math.max(0, Math.floor(Number(state.arcade_xp_total) || 0) + xpAwarded);
          state.arcade_daily_xp = Math.max(0, Math.floor(Number(state.arcade_daily_xp) || 0) + xpAwarded);
          results.push({
            client_run_id: clientRunId,
            status: 'accepted',
            reason,
            game,
            xp_awarded: xpAwarded,
            normalized_points: normalizedPoints,
            xp_weight: xpWeight,
            cooldown_until: nextCooldownUntil,
            lockout_until: lockoutUntil,
          });
        }

        await env.DB.prepare(`
          UPDATE arcade_progression_state
          SET arcade_xp_total = ?, arcade_daily_xp = ?, arcade_daily_key = ?, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?
        `).bind(
          Math.max(0, Math.floor(Number(state.arcade_xp_total) || 0)),
          Math.max(0, Math.floor(Number(state.arcade_daily_xp) || 0)),
          isoDayFromMs(nowMs),
          verified.telegramId,
        ).run();

        if (xpBatchAwarded > 0) {
          await logTelegramActivity(env.DB, verified.telegramId, 'arcade_progress_sync', JSON.stringify({
            runs_synced: acceptedCount,
            xp_awarded: xpBatchAwarded,
            at: new Date(nowMs).toISOString(),
          }));
        }

        return json({
          ok: true,
          telegram_id: verified.telegramId,
          results,
          synced: {
            accepted: acceptedCount,
            duplicate: duplicateCount,
            rejected: rejectedCount,
            xp_awarded: xpBatchAwarded,
          },
        });
      } catch (syncError) {
        logApiFailure('arcade_progression_sync_failed', {
          telegramId: verified.telegramId,
          message: syncError?.message || String(syncError),
        });
        return err('Failed to sync arcade progression', 500);
      }
    }

    if (path === '/faction/status' && request.method === 'GET') {
      const rawAuth = url.searchParams.get('telegram_auth');
      if (!rawAuth) return err('verified telegram_auth payload required', 401);
      let tgBody;
      try {
        tgBody = { telegram_auth: JSON.parse(rawAuth) };
      } catch {
        return err('Invalid telegram_auth payload', 400);
      }
      const verified = await verifyTelegramIdentityFromBody(tgBody, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      try {
        await upsertTelegramUser(env.DB, verified.user);
        if (!(await hasBlockTopiaFactionColumns(env.DB))) {
          const fallback = factionMeta(FACTION_UNALIGNED);
          return json({
            ok: true,
            schema_pending: true,
            faction: fallback.key,
            faction_label: fallback.label,
            faction_xp: 0,
            bonuses: {
              label: fallback.label,
              icon: fallback.icon,
              color: fallback.color,
              bonus: fallback.bonus,
              xp_multiplier: fallback.xp_multiplier,
            },
            cooldown_ms_remaining: 0,
          });
        }
        const progression = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const faction = factionMeta(progression?.faction || FACTION_UNALIGNED);
        return json({
          ok: true,
          faction: faction.key,
          faction_label: faction.label,
          faction_xp: Math.max(0, Math.floor(Number(progression?.faction_xp) || 0)),
          bonuses: {
            label: faction.label,
            icon: faction.icon,
            color: faction.color,
            bonus: faction.bonus,
            xp_multiplier: faction.xp_multiplier,
          },
          cooldown_ms_remaining: Math.max(
            0,
            (Number(progression?.faction_last_switch) || 0) + FACTION_SWITCH_COOLDOWN_MS - Date.now(),
          ),
        });
      } catch {
        return err('Failed to load faction status', 500);
      }
    }

    // ── POST /faction/join ─────────────────────────────────────────────────
    if (path === '/faction/join' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const requestedFaction = normalizeFaction(body?.faction);
      if (!requestedFaction || requestedFaction === FACTION_UNALIGNED) {
        return err('Invalid faction selection', 400);
      }
      try {
        await upsertTelegramUser(env.DB, verified.user);
        if (!(await hasBlockTopiaFactionColumns(env.DB))) {
          return json({
            ok: false,
            error: 'missing_required_table',
            reason: 'migration_pending:blocktopia_progression_faction_columns',
            message: 'Faction progression schema is pending migration. Apply required D1 migrations before joining.',
          }, 503);
        }

        // ── Season lock check + backfill ──────────────────────────────────
        const seasonKey = await getBattleSeasonKey(env.DB);
        const lockTableRow = await env.DB.prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'telegram_faction_season_locks' LIMIT 1`
        ).first().catch(() => null);
        const lockTableExists = !!(lockTableRow?.name);

        // Read existing progression first — needed for both cooldown logic and backfill.
        const row = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const existingFaction = normalizeFaction(row?.faction) || FACTION_UNALIGNED;

        if (lockTableExists) {
          const existingLock = await env.DB.prepare(
            `SELECT faction_id FROM telegram_faction_season_locks WHERE telegram_id = ? AND season_key = ?`
          ).bind(verified.telegramId, seasonKey).first();

          if (existingLock) {
            if (existingLock.faction_id === requestedFaction) {
              // Same faction — idempotent OK
              const meta = factionMeta(requestedFaction);
              return json({
                ok: true,
                faction: meta.key,
                faction_label: meta.label,
                faction_xp: Math.max(0, Math.floor(Number(row?.faction_xp) || 0)),
                bonuses: { icon: meta.icon, color: meta.color, bonus: meta.bonus, xp_multiplier: meta.xp_multiplier },
                first_join: false,
                switched: false,
                cooldown_ms: 0,
                season_key: seasonKey,
                locked_until: 'next season reset',
              });
            }
            // Different faction — blocked for this season
            const lockedMeta = factionMeta(existingLock.faction_id);
            return json({
              ok: false,
              error: 'faction_locked_for_season',
              faction: existingLock.faction_id,
              faction_label: lockedMeta.label,
              season_key: seasonKey,
              locked_until: 'next season reset',
              message: `You are locked to ${lockedMeta.label} for this season. Faction switch blocked until the next season resets.`,
            }, 409);
          }

          // No lock row yet. If the user already has a non-unaligned faction from before
          // migration 017 deployed, backfill a lock for that faction before allowing any change.
          if (existingFaction !== FACTION_UNALIGNED) {
            const nowIso = new Date().toISOString();
            // Backfill: INSERT ... DO NOTHING — first writer wins (race-safe).
            await env.DB.prepare(`
              INSERT INTO telegram_faction_season_locks (telegram_id, season_key, faction_id, locked_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(telegram_id, season_key) DO NOTHING
            `).bind(verified.telegramId, seasonKey, existingFaction, nowIso, nowIso).run();

            // Re-read the authoritative stored lock.
            const backfilledLock = await env.DB.prepare(
              `SELECT faction_id FROM telegram_faction_season_locks WHERE telegram_id = ? AND season_key = ?`
            ).bind(verified.telegramId, seasonKey).first();
            // After INSERT DO NOTHING the row must exist (either we wrote it or it already existed).
            // If re-read returns null something is seriously wrong with the DB — surface as 500.
            if (!backfilledLock?.faction_id) throw new Error('season_lock_reread_failed');
            const storedFaction = backfilledLock.faction_id;

            if (storedFaction === requestedFaction) {
              // Idempotent — same faction as what is stored
              const meta = factionMeta(requestedFaction);
              return json({
                ok: true,
                faction: meta.key,
                faction_label: meta.label,
                faction_xp: Math.max(0, Math.floor(Number(row?.faction_xp) || 0)),
                bonuses: { icon: meta.icon, color: meta.color, bonus: meta.bonus, xp_multiplier: meta.xp_multiplier },
                first_join: false,
                switched: false,
                cooldown_ms: 0,
                season_key: seasonKey,
                locked_until: 'next season reset',
              });
            }
            // Attempting to switch away from backfilled faction — reject
            const lockedMeta = factionMeta(storedFaction);
            return json({
              ok: false,
              error: 'faction_locked_for_season',
              faction: storedFaction,
              faction_label: lockedMeta.label,
              season_key: seasonKey,
              locked_until: 'next season reset',
              message: `You are locked to ${lockedMeta.label} for this season. Faction switch blocked until the next season resets.`,
            }, 409);
          }
        }

        // ── No lock, no existing faction (fresh user) ──────────────────────
        // Cooldown check (legacy guard, kept intact).
        const lastSwitch = Number(row?.faction_last_switch) || 0;
        const now = Date.now();
        const firstJoin = existingFaction === FACTION_UNALIGNED;
        const isSwitching = existingFaction !== requestedFaction;
        if (!firstJoin && isSwitching && lastSwitch > 0 && now - lastSwitch < FACTION_SWITCH_COOLDOWN_MS) {
          const retryAt = lastSwitch + FACTION_SWITCH_COOLDOWN_MS;
          return json({
            error: 'Faction switch cooldown active',
            retry_at: retryAt,
            cooldown_ms_remaining: retryAt - now,
          }, 429);
        }

        // ── Atomic season lock insert (race-safe) ──────────────────────────
        // DO NOTHING: the first concurrent writer wins; subsequent writers for a
        // different faction will be rejected in the re-read below.
        if (lockTableExists) {
          const nowIso = new Date().toISOString();
          await env.DB.prepare(`
            INSERT INTO telegram_faction_season_locks (telegram_id, season_key, faction_id, locked_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(telegram_id, season_key) DO NOTHING
          `).bind(verified.telegramId, seasonKey, requestedFaction, nowIso, nowIso).run();

          // Re-read: if another concurrent request won the INSERT race for a different
          // faction, this request loses and must return 409.
          const storedLock = await env.DB.prepare(
            `SELECT faction_id FROM telegram_faction_season_locks WHERE telegram_id = ? AND season_key = ?`
          ).bind(verified.telegramId, seasonKey).first();

          if (storedLock && storedLock.faction_id !== requestedFaction) {
            const lockedMeta = factionMeta(storedLock.faction_id);
            return json({
              ok: false,
              error: 'faction_locked_for_season',
              faction: storedLock.faction_id,
              faction_label: lockedMeta.label,
              season_key: seasonKey,
              locked_until: 'next season reset',
              message: `You are locked to ${lockedMeta.label} for this season. Faction switch blocked until the next season resets.`,
            }, 409);
          }
        }

        // ── Update progression (only reached when lock is confirmed) ───────
        const shouldStampSwitch = isSwitching || firstJoin;
        await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET faction = ?, faction_last_switch = ?, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?
        `).bind(
          requestedFaction,
          shouldStampSwitch ? now : lastSwitch || null,
          verified.telegramId,
        ).run();

        const meta = factionMeta(requestedFaction);
        return json({
          ok: true,
          faction: meta.key,
          faction_label: meta.label,
          faction_xp: Math.max(0, Math.floor(Number(row?.faction_xp) || 0)),
          bonuses: {
            icon: meta.icon,
            color: meta.color,
            bonus: meta.bonus,
            xp_multiplier: meta.xp_multiplier,
          },
          first_join: firstJoin,
          switched: isSwitching,
          cooldown_ms: FACTION_SWITCH_COOLDOWN_MS,
          season_key: seasonKey,
          locked_until: 'next season reset',
        });
      } catch {
        return err('Failed to join faction', 500);
      }
    }

    // ── POST /faction/earn ─────────────────────────────────────────────────
    if (path === '/faction/earn' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      try {
        await upsertTelegramUser(env.DB, verified.user);
        const source = String(body?.source || body?.action || 'score_accept').trim().toLowerCase();
        const baseXpInput = Math.max(0, Math.floor(Number(body?.base_xp) || Number(body?.xp) || 0));
        const fallbackBase = source === 'mission_complete' ? 60 : (source === 'blocktopia_action' ? 30 : 25);
        const baseXp = baseXpInput > 0 ? baseXpInput : fallbackBase;
        if (!(await hasBlockTopiaFactionColumns(env.DB))) {
          const fallbackFaction = factionMeta(FACTION_UNALIGNED);
          return json({
            ok: true,
            skipped: true,
            source,
            reason: 'faction_progression_schema_pending',
            faction: fallbackFaction.key,
            faction_label: fallbackFaction.label,
            base_xp: baseXp,
            multiplier: 1,
            faction_xp_awarded: 0,
            faction_xp_delta: 0,
            faction_xp_earned: 0,
            faction_xp_total: 0,
            xp_awarded: 0,
            xp_delta: 0,
            bonuses: {
              icon: fallbackFaction.icon,
              color: fallbackFaction.color,
              bonus: fallbackFaction.bonus,
            },
          });
        }
        const row = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const faction = factionMeta(row?.faction || FACTION_UNALIGNED);
        const multiplier = faction.xp_multiplier || 1;
        const awardedFactionXp = faction.key === FACTION_UNALIGNED
          ? 0
          : Math.max(1, Math.floor(baseXp * multiplier));
        const nextFactionXp = Math.max(0, Math.floor(Number(row?.faction_xp) || 0) + awardedFactionXp);

        await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET faction_xp = ?, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?
        `).bind(nextFactionXp, verified.telegramId).run();

        return json({
          ok: true,
          source,
          faction: faction.key,
          faction_label: faction.label,
          base_xp: baseXp,
          multiplier,
          faction_xp_earned: awardedFactionXp,
          faction_xp_total: nextFactionXp,
          bonuses: {
            icon: faction.icon,
            color: faction.color,
            bonus: faction.bonus,
          },
        });
      } catch {
        return err('Failed to award faction XP', 500);
      }
    }

    // ── GET /player/state ─────────────────────────────────────────────────
    // Returns full server-backed player state for a Telegram-linked user.
    // Requires a signed telegram_auth payload in the query string or POST body.
    if (path === '/player/state' && (request.method === 'GET' || request.method === 'POST')) {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      } else {
        const rawAuth = url.searchParams.get('telegram_auth');
        if (rawAuth) {
          try { body = { telegram_auth: JSON.parse(rawAuth) }; } catch { return err('Invalid telegram_auth', 400); }
        }
      }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) {
        return json({ ok: true, linked: false, message: 'Telegram link required for persistent player state' });
      }
      const telegramId = verified.telegramId;
      try {
        { const _ptCheck = await ensurePlayerStateTables(env.DB); if (_ptCheck) return _ptCheck.response; }
        const [arcadeState, faction, modState, streakState, masteryRows] = await Promise.all([
          env.DB.prepare(
            `SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ? LIMIT 1`
          ).bind(telegramId).first().catch(() => null),
          getUserFaction(env.DB, telegramId),
          env.DB.prepare(
            `SELECT active_modifier_id, unlocked_modifiers_json FROM player_modifier_state WHERE telegram_id = ? LIMIT 1`
          ).bind(telegramId).first().catch(() => null),
          env.DB.prepare(
            `SELECT mission_streak, contribution_streak, last_mission_date, last_contribution_date
             FROM player_streak_state WHERE telegram_id = ? LIMIT 1`
          ).bind(telegramId).first().catch(() => null),
          env.DB.prepare(
            `SELECT game_id, best_score, runs_played, mastery_xp FROM player_game_mastery_state WHERE telegram_id = ?`
          ).bind(telegramId).all().catch(() => ({ results: [] })),
        ]);

        const todayKey = getTodayUtcDate();
        const missionRows = await env.DB.prepare(
          `SELECT mission_id, progress, completed FROM player_daily_mission_state
           WHERE telegram_id = ? AND mission_date = ?`
        ).bind(telegramId, todayKey).all().catch(() => ({ results: [] }));

        const factionId = faction?.id || faction?.name || null;
        const normalizedFaction = normalizeFaction(factionId) || FACTION_UNALIGNED;

        const factionSignalRows = await env.DB.prepare(
          `SELECT faction_id, contribution FROM player_faction_signal_state
           WHERE telegram_id = ? AND day_key = ?`
        ).bind(telegramId, todayKey).all().catch(() => ({ results: [] }));

        const blocktopiaState = await env.DB.prepare(
          `SELECT xp, gems, tier FROM blocktopia_progression WHERE telegram_id = ? LIMIT 1`
        ).bind(telegramId).first().catch(() => null);

        const BLOCKTOPIA_REQUIRED_XP = 50;
        const arcadeXpTotal = Math.max(0, Math.floor(Number(arcadeState?.arcade_xp_total) || 0));

        const gameMastery = {};
        for (const row of (masteryRows?.results || [])) {
          gameMastery[row.game_id] = {
            best_score: row.best_score || 0,
            runs_played: row.runs_played || 0,
            mastery_xp: row.mastery_xp || 0,
          };
        }

        const dailyMissions = {};
        for (const row of (missionRows?.results || [])) {
          dailyMissions[row.mission_id] = {
            progress: row.progress || 0,
            completed: (row.completed || 0) === 1,
          };
        }

        const factionSignal = {};
        for (const row of (factionSignalRows?.results || [])) {
          factionSignal[row.faction_id] = row.contribution || 0;
        }

        return json({
          ok: true,
          linked: true,
          telegram_id: telegramId,
          arcade_xp_total: arcadeXpTotal,
          faction: normalizedFaction,
          faction_rank: faction?.role || null,
          blocktopia: {
            required_xp: BLOCKTOPIA_REQUIRED_XP,
            can_enter_multiplayer: arcadeXpTotal >= BLOCKTOPIA_REQUIRED_XP,
            xp: blocktopiaState ? Math.max(0, Math.floor(Number(blocktopiaState.xp) || 0)) : 0,
          },
          modifiers: modState ? {
            active_modifier_id: modState.active_modifier_id || null,
            unlocked_modifiers: safeJsonParse(modState.unlocked_modifiers_json, []),
          } : { active_modifier_id: null, unlocked_modifiers: [] },
          daily_missions: { date: todayKey, progress: dailyMissions },
          mission_streaks: streakState ? {
            mission_streak: streakState.mission_streak || 0,
            contribution_streak: streakState.contribution_streak || 0,
            last_mission_date: streakState.last_mission_date || null,
            last_contribution_date: streakState.last_contribution_date || null,
          } : {
            mission_streak: 0,
            contribution_streak: 0,
            last_mission_date: null,
            last_contribution_date: null,
          },
          faction_signal: { date: todayKey, contributions: factionSignal },
          game_mastery: gameMastery,
        });
      } catch (e) {
        logApiFailure('player_state_failed', { telegramId, message: e?.message || String(e) });
        return err('Failed to load player state', 500);
      }
    }

    // ── GET /player/modifiers ─────────────────────────────────────────────
    if (path === '/player/modifiers' && (request.method === 'GET' || request.method === 'POST')) {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      } else {
        const rawAuth = url.searchParams.get('telegram_auth');
        if (rawAuth) { try { body = { telegram_auth: JSON.parse(rawAuth) }; } catch { return err('Invalid telegram_auth', 400); } }
      }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      try {
        { const _ptCheck = await ensurePlayerStateTables(env.DB); if (_ptCheck) return _ptCheck.response; }
        const row = await env.DB.prepare(
          `SELECT active_modifier_id, unlocked_modifiers_json FROM player_modifier_state WHERE telegram_id = ? LIMIT 1`
        ).bind(verified.telegramId).first().catch(() => null);
        return json({
          ok: true,
          telegram_id: verified.telegramId,
          active_modifier_id: row?.active_modifier_id || null,
          unlocked_modifiers: row?.unlocked_modifiers_json ? safeJsonParse(row.unlocked_modifiers_json, null) : null,
        });
      } catch (e) {
        return err('Failed to load modifiers', 500);
      }
    }

    // ── POST /player/modifiers/active ─────────────────────────────────────
    if (path === '/player/modifiers/active' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const activeModifierId = body?.active_modifier_id !== undefined ? String(body.active_modifier_id || '').trim() : undefined;
      if (activeModifierId === undefined) return err('active_modifier_id required', 400);
      const VALID_MODIFIER_IDS = new Set([
        'score_surge', 'shielded_start', 'slow_chaos', 'risk_bonus',
        'boss_hunter', 'magnet_luck', 'recovery_pulse', 'golden_chance',
      ]);
      if (activeModifierId !== '' && !VALID_MODIFIER_IDS.has(activeModifierId)) {
        return err('Invalid modifier id', 400);
      }
      try {
        { const _ptCheck = await ensurePlayerStateTables(env.DB); if (_ptCheck) return _ptCheck.response; }
        const nowStr = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO player_modifier_state (telegram_id, active_modifier_id, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(telegram_id) DO UPDATE SET
            active_modifier_id = excluded.active_modifier_id,
            updated_at = excluded.updated_at
        `).bind(verified.telegramId, activeModifierId || null, nowStr).run();
        return json({ ok: true, telegram_id: verified.telegramId, active_modifier_id: activeModifierId || null });
      } catch (e) {
        return err('Failed to save modifier', 500);
      }
    }

    // ── GET /player/daily-missions ────────────────────────────────────────
    if (path === '/player/daily-missions' && (request.method === 'GET' || request.method === 'POST')) {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      } else {
        const rawAuth = url.searchParams.get('telegram_auth');
        if (rawAuth) { try { body = { telegram_auth: JSON.parse(rawAuth) }; } catch { return err('Invalid telegram_auth', 400); } }
      }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      try {
        { const _ptCheck = await ensurePlayerStateTables(env.DB); if (_ptCheck) return _ptCheck.response; }
        const todayKey = getTodayUtcDate();
        const rows = await env.DB.prepare(
          `SELECT mission_id, progress, completed FROM player_daily_mission_state
           WHERE telegram_id = ? AND mission_date = ?`
        ).bind(verified.telegramId, todayKey).all().catch(() => ({ results: [] }));
        const streakRow = await env.DB.prepare(
          `SELECT mission_streak, last_mission_date FROM player_streak_state WHERE telegram_id = ? LIMIT 1`
        ).bind(verified.telegramId).first().catch(() => null);
        const progress = {};
        for (const r of (rows?.results || [])) {
          progress[r.mission_id] = { progress: r.progress || 0, completed: (r.completed || 0) === 1 };
        }
        return json({
          ok: true,
          telegram_id: verified.telegramId,
          date: todayKey,
          progress,
          mission_streak: streakRow?.mission_streak || 0,
          last_mission_date: streakRow?.last_mission_date || null,
        });
      } catch (e) {
        return err('Failed to load daily missions', 500);
      }
    }

    // ── POST /player/daily-missions/progress ──────────────────────────────
    if (path === '/player/daily-missions/progress' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const missionId = String(body?.mission_id || '').trim();
      const rawAmount = body && Object.prototype.hasOwnProperty.call(body, 'amount')
        ? Number(body.amount)
        : 1; // default: 1 increment when amount is omitted
      if (!Number.isFinite(rawAmount)) return err('amount must be a positive number', 400);
      const amount = Math.floor(rawAmount);
      if (amount <= 0) return err('amount must be a positive integer', 400);
      const target = Math.max(1, Math.floor(Number(body?.target) || 1));
      if (!missionId) return err('mission_id required', 400);
      try {
        { const _ptCheck = await ensurePlayerStateTables(env.DB); if (_ptCheck) return _ptCheck.response; }
        const todayKey = getTodayUtcDate();
        const nowStr = new Date().toISOString();
        // Upsert mission progress
        await env.DB.prepare(`
          INSERT INTO player_daily_mission_state (telegram_id, mission_date, mission_id, progress, completed, updated_at)
          VALUES (?, ?, ?, ?, 0, ?)
          ON CONFLICT(telegram_id, mission_date, mission_id) DO UPDATE SET
            progress = CASE WHEN completed = 1 THEN progress
                            ELSE MIN(player_daily_mission_state.progress + ?, ?)
                       END,
            completed = CASE WHEN completed = 1 THEN 1
                             WHEN player_daily_mission_state.progress + ? >= ? THEN 1
                             ELSE 0
                        END,
            updated_at = excluded.updated_at
        `).bind(
          verified.telegramId, todayKey, missionId, amount, nowStr,
          amount, target,
          amount, target,
        ).run();
        const updated = await env.DB.prepare(
          `SELECT progress, completed FROM player_daily_mission_state
           WHERE telegram_id = ? AND mission_date = ? AND mission_id = ? LIMIT 1`
        ).bind(verified.telegramId, todayKey, missionId).first().catch(() => null);
        const justCompleted = updated && (updated.completed || 0) === 1;
        // Update mission streak if completed
        if (justCompleted) {
          await _updateMissionStreak(env.DB, verified.telegramId, todayKey);
        }
        return json({
          ok: true,
          telegram_id: verified.telegramId,
          mission_id: missionId,
          date: todayKey,
          progress: updated?.progress || 0,
          completed: justCompleted,
        });
      } catch (e) {
        return err('Failed to record mission progress', 500);
      }
    }

    // ── GET /faction/signal ───────────────────────────────────────────────
    if (path === '/faction/signal' && (request.method === 'GET' || request.method === 'POST')) {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      } else {
        const rawAuth = url.searchParams.get('telegram_auth');
        if (rawAuth) { try { body = { telegram_auth: JSON.parse(rawAuth) }; } catch { return err('Invalid telegram_auth', 400); } }
      }
      // For faction signal, auth is optional — we return aggregate data, with personal data when linked
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth).catch(() => ({ error: 'no_auth' }));
      try {
        { const _ptCheck = await ensurePlayerStateTables(env.DB); if (_ptCheck) return _ptCheck.response; }
        const todayKey = getTodayUtcDate();
        const weekKey = getIsoWeekKey();
        // Get aggregate faction totals for today and week
        const [todayTotals, weekTotals] = await Promise.all([
          env.DB.prepare(
            `SELECT faction_id, SUM(contribution) as total FROM player_faction_signal_state
             WHERE day_key = ? GROUP BY faction_id`
          ).bind(todayKey).all().catch(() => ({ results: [] })),
          env.DB.prepare(
            `SELECT faction_id, SUM(contribution) as total FROM player_faction_signal_state
             WHERE week_key = ? GROUP BY faction_id`
          ).bind(weekKey).all().catch(() => ({ results: [] })),
        ]);
        const todayMap = {};
        for (const r of (todayTotals?.results || [])) todayMap[r.faction_id] = r.total || 0;
        const weekMap = {};
        for (const r of (weekTotals?.results || [])) weekMap[r.faction_id] = r.total || 0;
        const response = {
          ok: true,
          pre_season: true,
          label: 'Faction Signal — Pre-Season',
          date: todayKey,
          week: weekKey,
          faction_totals_today: todayMap,
          faction_totals_week: weekMap,
        };
        if (!verified.error) {
          const myRow = await env.DB.prepare(
            `SELECT faction_id, contribution FROM player_faction_signal_state
             WHERE telegram_id = ? AND day_key = ?`
          ).bind(verified.telegramId, todayKey).all().catch(() => ({ results: [] }));
          const myContribs = {};
          for (const r of (myRow?.results || [])) myContribs[r.faction_id] = r.contribution || 0;
          response.player_contribution_today = myContribs;
        }
        return json(response);
      } catch (e) {
        return err('Failed to load faction signal', 500);
      }
    }

    // ── POST /faction/signal/contribute ───────────────────────────────────
    if (path === '/faction/signal/contribute' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const factionId = normalizeBattleChamberFaction(body?.faction_id);
      if (!factionId || factionId === FACTION_UNALIGNED) return err('Valid faction_id required', 400);
      const rawContribution = Number(body?.contribution);
      if (!Number.isFinite(rawContribution) || rawContribution <= 0) return err('contribution must be a positive integer', 400);
      const contribution = Math.floor(rawContribution);
      if (contribution > FACTION_SIGNAL_CONTRIBUTION_MAX) return err(`contribution exceeds max per request (${FACTION_SIGNAL_CONTRIBUTION_MAX})`, 400);
      // Validate game_id: alphanumeric, hyphens, underscores only; max 64 chars
      const rawGameId = String(body?.game_id || 'global').trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rawGameId)) return err('game_id must contain only alphanumeric characters, hyphens, and underscores (max 64 chars)', 400);
      const gameId = rawGameId;
      // Validate reason against allowlist; fall back to 'score_submission' if omitted
      const rawReason = String(body?.reason || 'score_submission').trim().toLowerCase();
      const reason = FACTION_SIGNAL_ALLOWED_REASONS.has(rawReason) ? rawReason : null;
      if (!reason) return err('reason not recognized', 400);
      try {
        { const _ptCheck = await ensurePlayerStateTables(env.DB); if (_ptCheck) return _ptCheck.response; }
        const todayKey = getTodayUtcDate();
        const weekKey = getIsoWeekKey();
        const nowStr = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO player_faction_signal_state
            (telegram_id, faction_id, day_key, week_key, contribution, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(telegram_id, faction_id, day_key) DO UPDATE SET
            contribution = player_faction_signal_state.contribution + excluded.contribution,
            updated_at = excluded.updated_at
        `).bind(verified.telegramId, factionId, todayKey, weekKey, contribution, nowStr).run();
        // Update contribution streak
        await _updateContributionStreak(env.DB, verified.telegramId, todayKey);
        // Get updated totals
        const [myRow, todayTotal, weekTotal] = await Promise.all([
          env.DB.prepare(
            `SELECT contribution FROM player_faction_signal_state
             WHERE telegram_id = ? AND faction_id = ? AND day_key = ? LIMIT 1`
          ).bind(verified.telegramId, factionId, todayKey).first().catch(() => null),
          env.DB.prepare(
            `SELECT SUM(contribution) as total FROM player_faction_signal_state
             WHERE faction_id = ? AND day_key = ?`
          ).bind(factionId, todayKey).first().catch(() => null),
          env.DB.prepare(
            `SELECT SUM(contribution) as total FROM player_faction_signal_state
             WHERE faction_id = ? AND week_key = ?`
          ).bind(factionId, weekKey).first().catch(() => null),
        ]);

        // Battle Chamber authority ownership model:
        // /faction/signal/contribute owns clout increments for contribution pressure.
        // /battle-chamber/event is used for explicit public proof activity.
        const battleTables = await ensureBattleChamberTables(env.DB);
        if (!battleTables) {
          const safeBattleDelta = clampBattleClout(contribution);
          await applyBattleChamberCloutUpdate(env.DB, {
            telegramId: verified.telegramId,
            factionId,
            eventType: reason === 'mission_complete' ? 'mission_complete' : 'weekly_contribution',
            cloutDelta: safeBattleDelta,
            nowMs: Date.now(),
          }).catch(() => {});
          const actor = getTelegramDisplayName(verified.user || verified.authPayload || { id: verified.telegramId });
          await appendBattleChamberActivity(env.DB, {
            telegramId: verified.telegramId,
            displayName: actor,
            factionId,
            eventType: 'weekly_contribution',
            eventText: `${actor} gained weekly pressure for ${BATTLE_CHAMBER_FACTION_LABELS[factionId] || factionId}.`,
            cloutDelta: safeBattleDelta,
            source: '/faction/signal/contribute',
            metadata: {
              reason,
              game_id: gameId,
              ownership: 'faction_signal_route',
            },
            createdAt: nowStr,
          }).catch(() => {});
        }

        return json({
          ok: true,
          faction_id: factionId,
          player_contribution_today: myRow?.contribution || 0,
          faction_totals_today: { [factionId]: todayTotal?.total || 0 },
          faction_totals_week: { [factionId]: weekTotal?.total || 0 },
        });
      } catch (e) {
        return err('Failed to record faction signal contribution', 500);
      }
    }

    // ── GET /battle-chamber/factions/standings ─────────────────────────────
    if (path === '/battle-chamber/factions/standings' && request.method === 'GET') {
      const period = String(url.searchParams.get('period') || 'weekly').trim().toLowerCase();
      if (!BATTLE_CHAMBER_PERIODS.includes(period)) return err('period must be daily, weekly, monthly, or seasonal', 400);
      const bcCheck = await ensureBattleChamberTables(env.DB);
      if (bcCheck) return bcCheck.response;
      try {
        const periodKey = await getBattlePeriodKey(period, env.DB, Date.now());
        const rows = await env.DB.prepare(`
          SELECT faction_id, clout_total, contribution_total, mission_total, score_total, member_count, updated_at
          FROM battle_chamber_faction_clout
          WHERE period_type = ? AND period_key = ?
        `).bind(period, periodKey).all().catch(() => ({ results: [] }));
        const byFaction = {};
        for (const row of (rows?.results || [])) byFaction[row.faction_id] = row;
        const standings = BATTLE_CHAMBER_FACTIONS.map((factionId) => {
          const row = byFaction[factionId] || {};
          return {
            faction_id: factionId,
            period_type: period,
            period_key: periodKey,
            clout_total: Number(row.clout_total) || 0,
            contribution_total: Number(row.contribution_total) || 0,
            mission_total: Number(row.mission_total) || 0,
            score_total: Number(row.score_total) || 0,
            member_count: Number(row.member_count) || 0,
            momentum: null,
            updated_at: row.updated_at || null,
          };
        }).sort((a, b) => (b.clout_total - a.clout_total) || a.faction_id.localeCompare(b.faction_id));
        for (let i = 0; i < standings.length; i++) standings[i].rank = i + 1;
        return json({
          ok: true,
          period,
          period_key: periodKey,
          factions: standings,
        });
      } catch {
        return err('Failed to load battle chamber standings', 500);
      }
    }

    // ── GET /battle-chamber/factions/:faction_id and /battle-chamber/faction ─
    if ((path.startsWith('/battle-chamber/factions/') || path === '/battle-chamber/faction') && request.method === 'GET') {
      let requestedFaction = '';
      if (path === '/battle-chamber/faction') {
        requestedFaction = String(url.searchParams.get('faction_id') || '').trim();
      } else {
        requestedFaction = decodeURIComponent(path.replace('/battle-chamber/factions/', '').trim());
      }
      const factionId = normalizeBattleChamberFaction(requestedFaction);
      if (!factionId) return err('Valid faction_id required', 400);
      const bcCheck = await ensureBattleChamberTables(env.DB);
      if (bcCheck) return bcCheck.response;
      try {
        const nowMs = Date.now();
        const periodKeys = {};
        for (const periodType of BATTLE_CHAMBER_PERIODS) {
          periodKeys[periodType] = await getBattlePeriodKey(periodType, env.DB, nowMs);
        }
        const totals = {};
        for (const periodType of BATTLE_CHAMBER_PERIODS) {
          const row = await env.DB.prepare(`
            SELECT faction_id, period_type, period_key, clout_total, contribution_total, mission_total, score_total, member_count, updated_at
            FROM battle_chamber_faction_clout
            WHERE faction_id = ? AND period_type = ? AND period_key = ?
            LIMIT 1
          `).bind(factionId, periodType, periodKeys[periodType]).first().catch(() => null);
          totals[periodType] = row || {
            faction_id: factionId,
            period_type: periodType,
            period_key: periodKeys[periodType],
            clout_total: 0,
            contribution_total: 0,
            mission_total: 0,
            score_total: 0,
            member_count: 0,
            updated_at: null,
          };
        }

        const topMembers = await env.DB.prepare(`
          SELECT
            mc.telegram_id,
            mc.faction_id,
            mc.period_type,
            mc.period_key,
            mc.clout_total,
            mc.mission_total,
            mc.score_total,
            mc.streak_total,
            mc.last_event_at,
            u.username,
            u.first_name,
            u.last_name
          FROM battle_chamber_member_clout mc
          LEFT JOIN telegram_users u ON u.telegram_id = mc.telegram_id
          WHERE mc.faction_id = ? AND mc.period_type = ? AND mc.period_key = ?
          ORDER BY mc.clout_total DESC, mc.score_total DESC
          LIMIT 10
        `).bind(factionId, 'weekly', periodKeys.weekly).all().catch(() => ({ results: [] }));

        const activityRows = await env.DB.prepare(`
          SELECT id, telegram_id, display_name, faction_id, event_type, event_text, clout_delta, source, metadata_json, created_at
          FROM battle_chamber_activity_log
          WHERE faction_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 20
        `).bind(factionId).all().catch(() => ({ results: [] }));

        const unlockTable = await env.DB.prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'battle_chamber_reward_unlocks' LIMIT 1`
        ).first().catch(() => null);
        let rewardUnlocks = [];
        if (unlockTable?.name) {
          const unlockRows = await env.DB.prepare(`
            SELECT telegram_id, faction_id, reward_key, reward_type, period_type, period_key, unlocked_at
            FROM battle_chamber_reward_unlocks
            WHERE faction_id = ?
            ORDER BY datetime(unlocked_at) DESC
            LIMIT 20
          `).bind(factionId).all().catch(() => ({ results: [] }));
          rewardUnlocks = unlockRows?.results || [];
        }

        return json({
          ok: true,
          faction: {
            id: factionId,
            label: BATTLE_CHAMBER_FACTION_LABELS[factionId] || factionId,
          },
          totals,
          top_members: (topMembers?.results || []).map((row) => ({
            telegram_id: row.telegram_id,
            display_name: displayNameFromRow(row),
            clout_total: Number(row.clout_total) || 0,
            mission_total: Number(row.mission_total) || 0,
            score_total: Number(row.score_total) || 0,
            streak_total: Number(row.streak_total) || 0,
            last_event_at: row.last_event_at || null,
          })),
          recent_activity: (activityRows?.results || []).map((row) => ({
            id: row.id,
            telegram_id: row.telegram_id,
            display_name: row.display_name || row.telegram_id,
            faction_id: row.faction_id,
            event_type: row.event_type,
            event_text: row.event_text,
            clout_delta: Number(row.clout_delta) || 0,
            source: row.source || null,
            metadata: safeJsonParse(row.metadata_json, {}),
            created_at: row.created_at,
          })),
          reward_unlocks: rewardUnlocks,
        });
      } catch {
        return err('Failed to load battle chamber faction details', 500);
      }
    }

    // ── GET /battle-chamber/activity ─────────────────────────────────────────
    if (path === '/battle-chamber/activity' && request.method === 'GET') {
      const bcCheck = await ensureBattleChamberTables(env.DB);
      if (bcCheck) return bcCheck.response;
      const rawFactionFilter = url.searchParams.get('faction_id');
      const requestedFaction = rawFactionFilter == null ? null : normalizeBattleChamberFaction(rawFactionFilter);
      if (rawFactionFilter != null && !requestedFaction) return err('Valid faction_id required', 400);
      const limit = Math.max(1, Math.min(100, Math.floor(Number(url.searchParams.get('limit') || 20) || 20)));
      try {
        const query = requestedFaction
          ? env.DB.prepare(`
              SELECT id, telegram_id, display_name, faction_id, event_type, event_text, clout_delta, source, metadata_json, created_at
              FROM battle_chamber_activity_log
              WHERE faction_id = ?
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            `).bind(requestedFaction, limit)
          : env.DB.prepare(`
              SELECT id, telegram_id, display_name, faction_id, event_type, event_text, clout_delta, source, metadata_json, created_at
              FROM battle_chamber_activity_log
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            `).bind(limit);
        const rows = await query.all().catch(() => ({ results: [] }));
        return json({
          ok: true,
          limit,
          faction_id: requestedFaction || null,
          items: (rows?.results || []).map((row) => ({
            id: row.id,
            telegram_id: row.telegram_id,
            display_name: row.display_name || row.telegram_id,
            faction_id: row.faction_id,
            event_type: row.event_type,
            event_text: row.event_text,
            clout_delta: Number(row.clout_delta) || 0,
            source: row.source || null,
            metadata: safeJsonParse(row.metadata_json, {}),
            created_at: row.created_at,
          })),
        });
      } catch {
        return err('Failed to load battle chamber activity', 500);
      }
    }

    // ── POST /battle-chamber/event ───────────────────────────────────────────
    if (path === '/battle-chamber/event' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const bcCheck = await ensureBattleChamberTables(env.DB);
      if (bcCheck) return bcCheck.response;

      const eventType = String(body?.event_type || '').trim().toLowerCase();
      if (!BATTLE_CHAMBER_EVENT_TYPES.has(eventType)) return err('event_type not recognized', 400);

      let factionId = normalizeBattleChamberFaction(body?.faction_id);
      if (!factionId) {
        const row = await env.DB.prepare(
          `SELECT faction FROM telegram_progression WHERE telegram_id = ? LIMIT 1`
        ).bind(verified.telegramId).first().catch(() => null);
        factionId = normalizeBattleChamberFaction(row?.faction);
      }
      if (!factionId) return err('Valid faction_id required', 400);

      // Public /battle-chamber/event is proof-feed only; clout authority lives on
      // /faction/signal/contribute and other server-owned validated paths.
      const cloutDelta = 0; // Keep hard-zero: proof route must never mutate clout totals.
      const source = String(body?.source || 'battle_chamber_client').trim().slice(0, 80) || 'battle_chamber_client';
      const verifiedDisplayName = getTelegramDisplayName(verified.user || verified.authPayload || { id: verified.telegramId });
      const displayName = verifiedDisplayName;
      const eventText = buildBattleEventText({ displayName, factionId, eventType });
      let metadata = body?.metadata_json;
      if (typeof metadata === 'string') metadata = safeJsonParse(metadata, {});
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) metadata = {};
      metadata.faction_normalized = factionId;
      metadata.clout_clamped = 0;
      metadata.proof_only = true;
      metadata.ownership = 'proof_feed_only';

      try {
        await appendBattleChamberActivity(env.DB, {
          telegramId: verified.telegramId,
          displayName,
          factionId,
          eventType,
          eventText,
          cloutDelta,
          source,
          metadata,
        });
        return json({
          ok: true,
          telegram_id: verified.telegramId,
          faction_id: factionId,
          event_type: eventType,
          clout_delta: cloutDelta,
        });
      } catch {
        return err('Failed to record battle chamber event', 500);
      }
    }

    // ── POST /player/mastery/update ───────────────────────────────────────
    if (path === '/player/mastery/update' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);
      const gameId = normalizeArcadeGameKey(body?.game_id);
      const rawScore = Math.max(0, Math.floor(Number(body?.score) || 0));
      const masteryXpDelta = Math.max(0, Math.min(500, Math.floor(Number(body?.mastery_xp_delta) || 0)));
      if (!gameId || gameId === 'global') return err('Valid game_id required', 400);
      try {
        { const _ptCheck = await ensurePlayerStateTables(env.DB); if (_ptCheck) return _ptCheck.response; }
        const nowStr = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO player_game_mastery_state (telegram_id, game_id, best_score, runs_played, mastery_xp, updated_at)
          VALUES (?, ?, ?, 1, ?, ?)
          ON CONFLICT(telegram_id, game_id) DO UPDATE SET
            best_score = MAX(player_game_mastery_state.best_score, excluded.best_score),
            runs_played = player_game_mastery_state.runs_played + 1,
            mastery_xp = player_game_mastery_state.mastery_xp + excluded.mastery_xp,
            updated_at = excluded.updated_at
        `).bind(verified.telegramId, gameId, rawScore, masteryXpDelta, nowStr).run();
        const updated = await env.DB.prepare(
          `SELECT best_score, runs_played, mastery_xp FROM player_game_mastery_state
           WHERE telegram_id = ? AND game_id = ? LIMIT 1`
        ).bind(verified.telegramId, gameId).first().catch(() => null);
        return json({
          ok: true,
          telegram_id: verified.telegramId,
          game_id: gameId,
          best_score: updated?.best_score || rawScore,
          runs_played: updated?.runs_played || 1,
          mastery_xp: updated?.mastery_xp || masteryXpDelta,
        });
      } catch (e) {
        return err('Failed to update mastery', 500);
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
  async scheduled(event, env, _ctx) {
    const cron = String(event?.cron || '');
    const shouldRunDigest = !cron || cron === '0 9 * * *';
    const shouldRunDailySummary = !cron || cron === '0 9 * * *';
    const shouldRunTimedEvents = !cron || cron === '*/5 * * * *';

    if (shouldRunDigest) {
      const summary = await runTelegramDailyDigest(env, {
        trigger: 'scheduled_cron',
        utcDay: getTodayUtcDate(),
      }).catch((error) => ({
        ok: false,
        error: error?.message || String(error),
      }));
      if (!summary?.ok) {
        logApiFailure('telegram_daily_digest_scheduled_failed', summary);
      } else {
        logApiEvent('telegram_daily_digest_scheduled_complete', {
          utcDay: summary.utc_day,
          linked_users_considered: summary.linked_users_considered,
          processed: summary.processed,
          sent: summary.sent,
          skipped: summary.skipped,
          skipped_already_sent: summary.skipped_already_sent,
          skipped_pending_recent: summary.skipped_pending_recent,
          failed: summary.failed,
        });
      }
    }

    const groupType = shouldRunDailySummary && shouldRunTimedEvents
      ? 'all'
      : (shouldRunDailySummary ? 'daily_summary' : (shouldRunTimedEvents ? 'timed_events' : null));
    if (groupType) {
      const groupSummary = await runTelegramGroupAnnouncements(env, {
        trigger: 'scheduled_cron',
        type: groupType,
      }).catch((error) => ({
        ok: false,
        error: error?.message || String(error),
      }));
      if (!groupSummary?.ok) {
        logApiFailure('telegram_group_announcements_scheduled_failed', groupSummary);
      } else {
        logApiEvent('telegram_group_announcements_scheduled_complete', {
          type: groupType,
          due: groupSummary.due_announcements?.length || 0,
          sent: groupSummary.sent_count,
          skipped: groupSummary.skipped_count,
          failed: groupSummary.failed_count,
          group_configured: groupSummary.group_configured,
        });
      }
    }
  },
};

// ── Telegram bot command handler ──────────────────────────────────────────────

const SITE_URL = 'https://cryptomoonboys.com';

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
    case 'quest':        await cmdGkQuests(db, tok, chatId, telegramId);             break;
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
    `🔗 /gklink — Link or refresh Telegram sync with the website\n` +
    `📊 /gkstatus — View your XP, level, and faction\n` +
    `🏆 /gkleaderboard — Community XP leaderboard\n` +
    `🗺️ /gkquests — Active missions\n` +
    `⚔️ /gkfaction — View faction status or choose on the website\n` +
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
    `/gklink — Link/refresh Telegram sync (required for Block Topia)\n` +
    `/gkstatus — XP and faction stats\n` +
    `/gkseason — Current season info\n` +
    `/gkleaderboard — Leaderboard\n` +
    `/gkquests — Active missions\n` +
    `/gkfaction — View faction status or choose in Battle Chamber\n` +
    `/gkunlink — Invalidate legacy link tokens\n` +
    `/daily — Claim daily XP\n` +
    `/solve — Submit quest answers\n` +
    `/gkhelp — Help\n\n` +
    `<b>How sync + progression works</b>\n` +
    `• /gklink creates a signed website link and also refreshes expired sync.\n` +
    `• Linked accounts store XP/progression server-side; unsynced play is local-only.\n` +
    `• Arcade ranking uses score only. Accepted scores can convert into Block Topia XP.\n` +
    `• XP is used for Block Topia entry, survival, and mini-game costs.\n` +
    `• Mini-game wins can reward XP + gems. Gems are upgrade currency, not entry.\n` +
    `• If sync fails/expired, run /gklink again and use the newest signed link.\n\n` +
    `<i>Legacy aliases: /start /help /link are still supported.</i>`,
    { reply_markup: replyMarkup },
  );
}

async function cmdGkLink(db, tok, chatId, telegramId) {
  if (!telegramId) {
    await sendTelegramMessage(tok, chatId, '❓ Unable to identify your Telegram account. Please try again.');
    return;
  }

  try {
    const acState = await db.prepare(
      `SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?`
    ).bind(String(telegramId)).first();
    if (acState && acState.is_blocked === 1) {
      await sendTelegramMessage(
        tok,
        chatId,
        '🚫 Your account is blocked from competitive actions. Contact the Moonboys community on Telegram to appeal.'
      );
      return;
    }
  } catch (error) {
    logApiFailure('gklink_anticheat_check_failed', {
      telegramId,
      message: error?.message || String(error),
    });
  }

  const user = await db.prepare(
    `SELECT telegram_id, username, first_name, last_name
     FROM telegram_users WHERE telegram_id = ?`
  ).bind(telegramId).first().catch(() => null);

  const signedAuthPayload = await buildSignedTelegramAuthPayload({
    id: String(telegramId),
    username: user?.username || null,
    first_name: user?.first_name || null,
    last_name: user?.last_name || null,
    photo_url: null,
  }, tok);

  if (!signedAuthPayload || !signedAuthPayload.hash || !signedAuthPayload.auth_date) {
    await sendTelegramMessage(tok, chatId, '⚠️ Could not generate a signed Telegram auth payload. Please try /gklink again shortly.');
    return;
  }

  const encodedPayload = encodeTelegramAuthPayloadForUrl(signedAuthPayload);
  if (!encodedPayload) {
    await sendTelegramMessage(tok, chatId, '⚠️ Could not build your secure link. Please try /gklink again shortly.');
    return;
  }

  const linkUrl = `${SITE_URL}/gkniftyheads-incubator.html#telegram_auth=${encodedPayload}`;
  await sendTelegramMessage(tok, chatId,
    `🔗 <b>Link Your Account</b>\n\n` +
    `Click the link below to connect or refresh your Telegram identity on the Moonboys website:\n\n` +
    `<a href="${linkUrl}">🔑 Activate Competition Access</a>\n\n` +
    `<i>This signed link expires in 24 hours. Run /gklink again any time to refresh it.</i>\n\n` +
    `After linking:\n` +
    `✅ Your identity is verified\n` +
    `✅ Competitive features unlock\n` +
    `✅ Linked XP/progression store server-side\n\n` +
    `How progression works after linking:\n` +
    `• Arcade ranking uses score only.\n` +
    `• Accepted scores can convert into Block Topia XP.\n` +
    `• XP is used for Block Topia entry/survival and mini-game costs.\n` +
    `• Mini-game wins can reward XP and gems; gems are used for upgrades.\n\n` +
    `If sync expires or fails, run /gklink again and use the newest signed link.\n` +
    `Refresh your link any time by running /gklink again.`
  );
}

async function cmdGkStatus(db, tok, chatId, telegramId) {
  const [user, faction, season, missedRow] = await Promise.all([
    db.prepare(
      `SELECT username, first_name, last_name, xp, level, created_at
       FROM telegram_users WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => null),
    getUserFaction(db, telegramId),
    getCurrentSeason(db),
    db.prepare(
      `SELECT COUNT(*) AS total
       FROM daily_missed_perks
       WHERE telegram_id = ?`
    ).bind(telegramId).first().catch(() => ({ total: 0 })),
  ]);

  if (!user) {
    await sendTelegramMessage(tok, chatId, '❓ No profile found. Use /gkstart to register.');
    return;
  }

  const displayName = escapeHtml(getTelegramDisplayName({ ...user, id: telegramId }));
  const factionName = faction ? escapeHtml(faction.name) : 'None';
  const seasonLabel = season ? `S${season.id}` : '?';
  const missedTotal = Math.max(0, Math.floor(Number(missedRow?.total) || 0));
  let factionClout = 0;
  try {
    const normalizedFaction = normalizeBattleChamberFaction(faction?.id || faction?.name);
    const bcCheck = await ensureBattleChamberTables(db);
    if (!bcCheck && normalizedFaction) {
      const weeklyPeriodKey = await getBattlePeriodKey('weekly', db, Date.now());
      const cloutRow = await db.prepare(`
        SELECT clout_total
        FROM battle_chamber_member_clout
        WHERE telegram_id = ? AND faction_id = ? AND period_type = 'weekly' AND period_key = ?
        LIMIT 1
      `).bind(telegramId, normalizedFaction, weeklyPeriodKey).first().catch(() => null);
      factionClout = Math.max(0, Math.floor(Number(cloutRow?.clout_total) || 0));
    }
  } catch {
    factionClout = 0;
  }

  await sendTelegramMessage(tok, chatId,
    `📊 <b>Your Stats</b>\n\n` +
    `Name:         ${displayName}\n` +
    `Faction:      ${factionName}\n` +
    `Faction clout (weekly): ${factionClout}\n` +
    `XP:           ${user.xp || 0}\n` +
    `Level:        ${user.level || 1}\n` +
    `Season:       ${seasonLabel}\n` +
    `Missed perks: ${missedTotal}\n` +
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

async function cmdGkQuests(db, tok, chatId, telegramId) {
  const now  = new Date().toISOString();
  const [rows, faction, missionRows, missedRow] = await Promise.all([
    db.prepare(
    `SELECT id, title, description, xp_reward
     FROM telegram_quests
     WHERE is_active = 1
       AND (start_date IS NULL OR start_date <= ?)
       AND (end_date IS NULL OR end_date >= ?)
     ORDER BY created_at DESC
      LIMIT 5`
    ).bind(now, now).all().catch(() => ({ results: [] })),
    getUserFaction(db, telegramId).catch(() => null),
    db.prepare(`
      SELECT mission_id, progress, completed
      FROM player_daily_mission_state
      WHERE telegram_id = ? AND mission_date = ?
      ORDER BY mission_id ASC
      LIMIT 3
    `).bind(telegramId, getTodayUtcDate()).all().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM daily_missed_perks
      WHERE telegram_id = ?
    `).bind(telegramId).first().catch(() => ({ total: 0 })),
  ]);

  const quests = rows.results || [];
  const missionDigest = (missionRows?.results || []).map((row, idx) =>
    `${idx + 1}. ${formatMissionIdLabel(row.mission_id)} — ${(Number(row.completed) === 1) ? 'complete' : `${Math.max(0, Math.floor(Number(row.progress) || 0))} / ?`}`
  );
  const missedTotal = Math.max(0, Math.floor(Number(missedRow?.total) || 0));
  const factionLabel = faction?.name ? escapeHtml(faction.name) : 'Unaligned';
  if (!quests.length) {
    await sendTelegramMessage(tok, chatId,
      `🔍 No active missions right now. Check back soon!\n\n` +
      `<b>Battle Chamber daily missions</b>\n` +
      `${missionDigest.length ? missionDigest.map((line) => escapeHtml(line)).join('\n') : 'No synced faction mission progress yet.'}\n\n` +
      `Faction: ${factionLabel}\n` +
      `Missed perks history count: ${missedTotal}\n` +
      `Open Battle Chamber: ${SITE_URL}/community.html`
    );
    return;
  }

  const lines = quests.map(q =>
    `📜 <b>${escapeHtml(q.title)}</b> — ${q.xp_reward} XP\n` +
    `   ${escapeHtml(q.description || '')}`
  ).join('\n\n');

  await sendTelegramMessage(tok, chatId,
    `🗺️ <b>Active Missions</b>\n\n${lines}\n\n` +
    `<b>Battle Chamber daily missions</b>\n` +
    `${missionDigest.length ? missionDigest.map((line) => escapeHtml(line)).join('\n') : 'No synced faction mission progress yet.'}\n\n` +
    `Faction: ${factionLabel}\n` +
    `Missed perks history count: ${missedTotal}\n` +
    `Battle Chamber: ${SITE_URL}/community.html\n` +
    `Arcade: ${SITE_URL}/games/index.html`
  );
}

async function cmdGkFaction(db, tok, chatId, telegramId, argStr) {
  // Anti-cheat gate: blocked accounts cannot perform competitive actions.
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

  const battleChamberUrl = `${SITE_URL}/community.html#battle-join-faction`;
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '⚔️ Open Battle Chamber', web_app: { url: battleChamberUrl } },
      ],
      [
        { text: '🌐 Open in Browser', url: battleChamberUrl },
      ],
    ],
  };

  const [current, missedRow] = await Promise.all([
    getUserFaction(db, telegramId),
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM daily_missed_perks
      WHERE telegram_id = ?
    `).bind(telegramId).first().catch(() => ({ total: 0 })),
  ]);
  const missedTotal = Math.max(0, Math.floor(Number(missedRow?.total) || 0));

  if (current) {
    await sendTelegramMessage(tok, chatId,
      `⚔️ <b>Faction Status</b>\n\n` +
      `Your faction: <b>${escapeHtml(current.name)}</b>\n\n` +
      `You are locked to this faction for the current season.\n` +
      `At season reset, your faction lock clears and you can choose a new side.\n\n` +
      `Missed perks history count: ${missedTotal}\n\n` +
      `View faction activity and missions in the Battle Chamber:`,
      { reply_markup: replyMarkup },
    );
  } else {
    await sendTelegramMessage(tok, chatId,
      `⚔️ <b>Faction</b>\n\n` +
      `You haven't joined a faction yet.\n\n` +
      `If you're ready, choose your faction in the Battle Chamber. ` +
      `Your choice locks for the current season, then resets when the next season starts.\n\n` +
      `Faction clout only counts when you are Telegram-linked.\n` +
      `No faction, no faction clout.\n\n` +
      `Missed perks history count: ${missedTotal}`,
      { reply_markup: replyMarkup },
    );
  }
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

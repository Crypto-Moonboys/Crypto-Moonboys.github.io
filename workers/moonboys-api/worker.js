import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP, GEMS_MAX, GEMS_MIN, TELEGRAM_AUTH_MAX_AGE, XP_MAX, XP_MIN } from './blocktopia/config.js';
import { verifyTelegramIdentityFromBody } from './blocktopia/auth.js';
import { getOrCreateBlockTopiaProgression, hasBlockTopiaFactionColumns } from './blocktopia/db.js';
import { handleBlockTopiaProgressionRoute } from './blocktopia/routes.js';
import { buildDailyLoopState, handleDailyLoopStateRoute } from './routes/daily-loop-state.js';
import { handleRogueliteDailyRoutes } from './routes/daily-digest.js';
import { handleWaxBridgeRoute } from './routes/wax/index.js';
import { CANONICAL_FACTION_KEYS, FACTION_UNALIGNED, normalizeFaction, getFactionXpMultiplier } from './shared/faction-canon.js';
import { buildWtfIso, getWtfDailySchedule, getWtfEventStatus } from './shared/daily-wtf-schedule.js';
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
 *   GET  /comments?page_id=
 *   POST /comments
 *   POST /comments/:id/vote
 *   GET  /likes?page_id=
 *   POST /likes
 *   GET  /citation-votes?page_id=&cite_id=
 *   POST /citation-votes
 *   GET  /wiki-missions/status?page_id=
 *   POST /wiki-missions/complete
 *   GET/POST /faction/signal
 *   POST /faction/signal/contribute
 *   GET  /battle-chamber/factions/standings?period=weekly
 *   GET  /battle-chamber/factions/:faction_id
 *   GET  /battle-chamber/faction?faction_id=
 *   GET  /battle-chamber/activity?limit=20
 *   POST /battle-chamber/event
 *   POST /player/mastery/update
 *   GET  /daily-loop/state  (public anonymous UTC daily loop authority)
 *   POST /daily-loop/state  JSON { telegram_auth } (Telegram-linked UTC daily loop authority)
 *   GET  /roguelite/daily-state  (legacy query-auth compatibility; deprecated for linked state)
 *   POST /roguelite/daily-state  JSON { telegram_auth }
 *   GET  /roguelite/missed-history?limit=30  (legacy query-auth compatibility; deprecated for linked state)
 *   POST /roguelite/missed-history  JSON { telegram_auth, limit, utc_day }
 *   POST /roguelite/mark-missed
 *   POST /telegram/daily-digest/run
 *   POST /telegram/group-announcements/run
 *   GET  /api/wax/health
 *   GET  /api/wax/collections/:collection/stats
 *   GET  /api/wax/collections/:collection/templates
 *   GET  /api/wax/collections/:collection/page-data
 *   GET  /api/wax/templates?collection=&ids=
 *   GET  /api/wax/templates/:template_id/stats
 *   GET  /api/wax/assets/:asset_id
 *   GET  /api/wax/assets/:asset_id/image
 *   GET  /api/wax/wallets/:account/nfts?collection=
 *   POST /api/wax/verify-ownership  (read-only facade)
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
 *   TELEGRAM_PETS_BOT_SECRET — pet-only bot-to-API secret for /telegram-pets/* writes
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
const PETS_DAILY_COMMUNITY_XP_CAP = 250;
const PETS_DAILY_PET_XP_CAP = 1200;
const PETS_ACTION_COOLDOWN_SECONDS = 45;
const PET_TRADE_MIN_GOLD = 10;
const PET_TRADE_MAX_GOLD = 250;
const PET_TRADE_COOLDOWN_SECONDS = 300;
const PET_ADVENTURE_COOLDOWN_SECONDS = 1800;
const PET_NOTIFICATION_COOLDOWN_MINUTES = 180;
const PET_NOTIFICATION_BATCH_LIMIT = 35;
const PET_KAIJU_MATCH_TTL_MINUTES = 20;
const PET_KAIJU_QUEUE_LIMIT = 12;
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
const WIKI_MISSION_XP = 10;
const WIKI_MISSION_IDS = new Set(['engage', 'signal', 'cite']);
const WIKI_MISSION_SOURCE_BY_ID = Object.freeze({
  engage: 'comments',
  signal: 'likes',
  cite: 'citation-votes',
});

const DEFAULT_CORS_ALLOWED_ORIGINS = [
  'https://cryptomoonboys.com',
  'https://www.cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
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
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function makeJsonResponder(corsHeaders) {
  return function respondJson(data, status = 200) {
    return json(data, status, corsHeaders);
  };
}

function makeErrorResponder(corsHeaders) {
  return function respondError(message, status = 400) {
    return err(message, status, corsHeaders);
  };
}

function json(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function err(message, status = 400, corsHeaders = {}) {
  return json({ error: message }, status, corsHeaders);
}

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

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_DEFAULT_PUBLIC_PER_MINUTE = 30;
const RATE_LIMIT_DEFAULT_TELEGRAM_PER_MINUTE = 30;
const RATE_LIMIT_MEMORY_MAX_BUCKETS = 5000;
const RATE_LIMIT_MEMORY_BUCKETS = new Map();

function readPositiveIntegerEnv(env, key, fallback) {
  const parsed = parseInt(String(env?.[key] || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIp(request) {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('X-Real-IP');
  return realIp ? realIp.trim() : 'unknown';
}

function extractRateLimitTelegramId(body) {
  const raw = body?.telegram_auth?.id ?? body?.telegram_id ?? body?.id ?? null;
  const value = String(raw || '').trim();
  return /^\d{1,20}$/.test(value) ? value : null;
}

function pruneRateLimitMemory(now) {
  if (RATE_LIMIT_MEMORY_BUCKETS.size <= RATE_LIMIT_MEMORY_MAX_BUCKETS) return;
  for (const [key, bucket] of RATE_LIMIT_MEMORY_BUCKETS.entries()) {
    if (!bucket || bucket.resetAt <= now) RATE_LIMIT_MEMORY_BUCKETS.delete(key);
    if (RATE_LIMIT_MEMORY_BUCKETS.size <= RATE_LIMIT_MEMORY_MAX_BUCKETS) break;
  }
  while (RATE_LIMIT_MEMORY_BUCKETS.size > RATE_LIMIT_MEMORY_MAX_BUCKETS) {
    const oldestKey = RATE_LIMIT_MEMORY_BUCKETS.keys().next().value;
    if (oldestKey === undefined) break;
    RATE_LIMIT_MEMORY_BUCKETS.delete(oldestKey);
  }
}

function consumeMemoryRateLimit(key, limit, now) {
  const bucket = RATE_LIMIT_MEMORY_BUCKETS.get(key);
  if (!bucket || bucket.resetAt <= now) {
    RATE_LIMIT_MEMORY_BUCKETS.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false, remaining: Math.max(0, limit - 1), resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  if (bucket.count >= limit) {
    return { limited: true, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { limited: false, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

function enforcePublicRateLimit(request, env, routeKey, body, corsHeaders, options = {}) {
  const now = Date.now();
  pruneRateLimitMemory(now);
  const ipLimit = readPositiveIntegerEnv(env, 'RATE_LIMIT_PUBLIC_PER_MINUTE', RATE_LIMIT_DEFAULT_PUBLIC_PER_MINUTE);
  const telegramLimit = readPositiveIntegerEnv(env, 'RATE_LIMIT_TELEGRAM_PER_MINUTE', RATE_LIMIT_DEFAULT_TELEGRAM_PER_MINUTE);
  const checks = [];
  if (options.includeIp !== false) {
    checks.push({ scope: 'ip', id: getClientIp(request), limit: ipLimit });
  }
  const telegramId = extractRateLimitTelegramId(body);
  if (options.includeTelegram !== false && telegramId) {
    checks.push({ scope: 'telegram', id: telegramId, limit: telegramLimit });
  }

  for (const check of checks) {
    const key = `${routeKey}:${check.scope}:${check.id}`;
    const result = consumeMemoryRateLimit(key, check.limit, now);
    if (result.limited) {
      const retryAfterSeconds = Math.max(1, Math.ceil(((result.resetAt || now + RATE_LIMIT_WINDOW_MS) - now) / 1000));
      logApiFailure('public_rate_limit_exceeded', {
        route: routeKey,
        scope: check.scope,
        limit: check.limit,
        retry_after_seconds: retryAfterSeconds,
      });
      return json({
        error: 'rate_limited',
        retry_after_seconds: retryAfterSeconds,
      }, 429, {
        ...corsHeaders,
        'Retry-After': String(retryAfterSeconds),
      });
    }
  }
  return null;
}

function ensureAdminGrantConfigured(env) {
  const missing = [];
  if (!String(env?.TELEGRAM_BOT_TOKEN || '').trim()) missing.push('TELEGRAM_BOT_TOKEN');
  if (!String(env?.ADMIN_TELEGRAM_IDS || '').trim()) missing.push('ADMIN_TELEGRAM_IDS');
  return missing;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function answerTelegramCallback(botToken, callbackQueryId, text = '') {
  if (!botToken || !callbackQueryId) return { ok: false, error: 'missing_callback_id' };
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
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
  if (now - authDateSeconds > TELEGRAM_AUTH_MAX_AGE) return null;
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
async function awardCommunityXp(db, telegramId, xpChange, action, referenceId = '') {
  if (!xpChange || xpChange < 0) {
    if (xpChange < 0) console.log('awardCommunityXp: negative xpChange ignored', JSON.stringify({ telegramId, xpChange, action }));
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

  const season = await getCurrentSeason(db).catch(() => null);
  if (season?.id) {
    await db.prepare(`
      INSERT INTO telegram_leaderboard (telegram_id, season_id, xp)
      VALUES (?, ?, ?)
      ON CONFLICT(telegram_id, season_id) DO UPDATE SET
        xp = xp + excluded.xp,
        updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, season.id, xpChange).run().catch((error) => {
      logApiFailure('community_xp_leaderboard_upsert_failed', {
        telegramId,
        action,
        season_id: season.id,
        message: error?.message || String(error),
      });
    });
  }
}

async function awardXp(db, telegramId, xpChange, action, referenceId = '') {
  return awardCommunityXp(db, telegramId, xpChange, action, referenceId);
}

function normalizeWikiPageId(value) {
  const pageId = String(value || '').trim().toLowerCase().replace(/\.html$/, '');
  return /^[a-z0-9][a-z0-9_-]{0,80}$/.test(pageId) ? pageId : null;
}

function normalizeWikiId(value, maxLength = 80) {
  const id = String(value || '').trim().toLowerCase();
  if (!id || id.length > maxLength) return null;
  return /^[a-z0-9][a-z0-9:_-]*$/.test(id) ? id : null;
}

function normalizeWikiVote(value) {
  const vote = String(value || '').trim().toLowerCase();
  return vote === 'up' || vote === 'down' ? vote : null;
}

function normalizeTextField(value, maxLength) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return bytesToHex(digest);
}

async function hashTelegramCommentIdentity(telegramId) {
  const normalized = String(telegramId || '').trim();
  if (!normalized) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return `tg:${bytesToHex(digest)}`;
}

async function verifyOptionalWikiTelegram(body, env) {
  if (!body || !body.telegram_auth) return { verified: null };
  const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
  if (verified?.error) {
    return { error: verified.error, status: verified.status || 401 };
  }
  await upsertTelegramUser(env.DB, verified.user);
  return { verified };
}

function getWikiCommentModerationMessage(status) {
  if (status === 'approved') return 'Comment posted.';
  if (status === 'rejected') return 'Comment could not be published.';
  return 'Comment received and awaiting automated review.';
}

async function verifyRequiredWikiTelegram(body, env) {
  const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
  if (verified?.error) {
    return { error: verified.error, status: verified.status || 401 };
  }
  await upsertTelegramUser(env.DB, verified.user);
  return { verified };
}

async function isWikiRewardLinkedUser(db, telegramId) {
  const row = await db.prepare(`
    SELECT u.telegram_id
    FROM telegram_users u
    WHERE u.telegram_id = ?
      AND EXISTS (
        SELECT 1 FROM telegram_activity_log al
        WHERE al.telegram_id = u.telegram_id AND al.action = 'link_confirmed'
      )
    LIMIT 1
  `).bind(String(telegramId || '')).first().catch(() => null);
  return !!row?.telegram_id;
}

async function verifyWikiMissionSourceAction(db, {
  telegramId,
  pageId,
  missionId,
  sourceId,
}) {
  if (missionId === 'engage') {
    const row = await db.prepare(`
      SELECT id FROM wiki_comments
      WHERE id = ? AND page_id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(sourceId || '', pageId, telegramId).first().catch(() => null);
    return !!row?.id;
  }
  if (missionId === 'signal') {
    const row = await db.prepare(`
      SELECT page_id FROM wiki_page_likes
      WHERE page_id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(pageId, telegramId).first().catch(() => null);
    return !!row?.page_id;
  }
  if (missionId === 'cite') {
    const row = await db.prepare(`
      SELECT cite_id FROM wiki_citation_votes
      WHERE page_id = ? AND cite_id = ? AND telegram_id = ?
      LIMIT 1
    `).bind(pageId, sourceId || '', telegramId).first().catch(() => null);
    return !!row?.cite_id;
  }
  return false;
}

async function completeWikiMission(db, {
  verified,
  pageId,
  missionId,
  source,
  sourceId,
}) {
  if (!verified?.telegramId) {
    return {
      completed: false,
      reward_status: 'telegram_sync_required',
      xp_awarded: 0,
    };
  }
  const linked = await isWikiRewardLinkedUser(db, verified.telegramId);
  if (!linked) {
    return {
      completed: false,
      reward_status: 'telegram_link_required',
      xp_awarded: 0,
      mission_id: missionId,
    };
  }
  if (!WIKI_MISSION_IDS.has(missionId)) {
    throw new Error('invalid_wiki_mission_id');
  }
  const expectedSource = WIKI_MISSION_SOURCE_BY_ID[missionId];
  if (expectedSource && source !== expectedSource) {
    throw new Error('invalid_wiki_mission_source');
  }
  const missionWindow = getTodayUtcDate();
  const referenceId = `${missionWindow}:${pageId}:${missionId}`;
  const insertResult = await db.prepare(`
    INSERT OR IGNORE INTO wiki_mission_completions
      (page_id, mission_id, mission_window, telegram_id, source, source_id, xp_awarded)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pageId,
    missionId,
    missionWindow,
    verified.telegramId,
    source || null,
    sourceId || null,
    WIKI_MISSION_XP,
  ).run();
  const inserted = Number(insertResult?.meta?.changes || 0) > 0;
  if (inserted) {
    await awardXp(db, verified.telegramId, WIKI_MISSION_XP, 'wiki_mission_complete', referenceId);
    await logTelegramActivity(db, verified.telegramId, 'wiki_mission_complete', JSON.stringify({
      page_id: pageId,
      mission_id: missionId,
      source,
      source_id: sourceId || null,
      xp_awarded: WIKI_MISSION_XP,
    })).catch(() => {});
  }
  const row = await db.prepare(`
    SELECT xp_awarded, source, source_id, created_at
    FROM wiki_mission_completions
    WHERE page_id = ? AND mission_id = ? AND mission_window = ? AND telegram_id = ?
    LIMIT 1
  `).bind(pageId, missionId, missionWindow, verified.telegramId).first().catch(() => null);
  return {
    completed: true,
    already_completed: !inserted,
    reward_status: inserted ? 'xp_synced' : 'already_completed',
    xp_awarded: inserted ? WIKI_MISSION_XP : 0,
    total_xp_awarded: Number(row?.xp_awarded || 0),
    mission_id: missionId,
    mission_window: missionWindow,
    source: row?.source || source || null,
    source_id: row?.source_id || sourceId || null,
    completed_at: row?.created_at || null,
  };
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
    'snake-run': 'snake',
    snake_run: 'snake',
    'block-topia-quest-maze': 'btqm',
    block_topia_quest_maze: 'btqm',
    blocktopia: 'btqm',
    'kaiju-sticker-battle': 'kaiju',
    kaiju_sticker_battle: 'kaiju',
    'telegram-kaiju': 'kaiju',
  };
  const normalized = aliases[key] || key || 'global';
  const allowed = new Set(['invaders', 'pacchain', 'asteroids', 'breakout', 'tetris', 'snake', 'btqm', 'kaiju', 'global']);
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
    snake: 0.95,
    btqm: 1.25,
    kaiju: 0.9,
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

const PET_STAGE_THRESHOLDS = [
  { stage: 'egg', min_xp: 0 },
  { stage: 'hatchling', min_xp: 25 },
  { stage: 'runner', min_xp: 120 },
  { stage: 'street scout', min_xp: 360 },
  { stage: 'moon guardian', min_xp: 900 },
  { stage: 'legendary companion', min_xp: 1800 },
];

const PET_ACTIONS = Object.freeze({
  feed:  { pet_xp: 6,  community_xp: 2,  hunger: -28, happiness: 2,  cleanliness: -2, energy: 4,   gold: 5,  crystals: 0, style_tokens: 0 },
  play:  { pet_xp: 10, community_xp: 3,  hunger: 8,   happiness: 22, cleanliness: -6, energy: -12, gold: 7,  crystals: 0, style_tokens: 1 },
  clean: { pet_xp: 6,  community_xp: 2,  hunger: 2,   happiness: 4,  cleanliness: 32, energy: -3,  gold: 4,  crystals: 0, style_tokens: 0 },
  sleep: { pet_xp: 5,  community_xp: 1,  hunger: 10,  happiness: 1,  cleanliness: -2, energy: 36,  gold: 3,  crystals: 0, style_tokens: 0 },
  train: { pet_xp: 20, community_xp: 6,  hunger: 12,  happiness: 8,  cleanliness: -4, energy: -18, gold: 10, crystals: 1, style_tokens: 0 },
});

const PET_INVENTORY_ITEMS = Object.freeze({
  moon_snack: {
    key: 'moon_snack',
    title: 'Moon Snack',
    kind: 'usable_item',
    description: 'Restores hunger and a bit of energy.',
  },
  energy_drink: {
    key: 'energy_drink',
    title: 'Energy Drink',
    kind: 'usable_item',
    description: 'Restores energy and gives a small pet XP boost.',
  },
  clean_wipe: {
    key: 'clean_wipe',
    title: 'Clean Wipe',
    kind: 'usable_item',
    description: 'Improves cleanliness and happiness.',
  },
  lucky_charm: {
    key: 'lucky_charm',
    title: 'Lucky Charm',
    kind: 'usable_item',
    description: 'One-use charm that can boost a run or random event outcome.',
  },
  style_patch: {
    key: 'style_patch',
    title: 'Style Patch',
    kind: 'usable_item',
    description: 'Adds style tokens and a little pet XP.',
  },
  adventure_map: {
    key: 'adventure_map',
    title: 'Adventure Map',
    kind: 'usable_item',
    description: 'Reduces adventure fatigue and improves job luck.',
  },
});

const PET_JOBS = Object.freeze({
  street_artist: {
    key: 'street_artist',
    title: 'Street Artist',
    pet_xp: 18,
    moon_gold: 18,
    style_tokens: 2,
  },
  courier: {
    key: 'courier',
    title: 'Courier',
    pet_xp: 24,
    moon_gold: 26,
    style_tokens: 0,
  },
  crystal_miner: {
    key: 'crystal_miner',
    title: 'Crystal Miner',
    pet_xp: 30,
    moon_gold: 12,
    moon_crystals: 2,
  },
  vault_guard: {
    key: 'vault_guard',
    title: 'Vault Guard',
    pet_xp: 36,
    moon_gold: 30,
    style_tokens: 1,
  },
});

const PET_SHOP_ITEMS = Object.freeze({
  moon_kibble: {
    key: 'moon_kibble',
    slot: 'food',
    title: 'Moon Kibble',
    description: 'Better food: feed restores more hunger and adds +4 pet XP.',
    cost: { moon_gold: 45, moon_crystals: 0, style_tokens: 0 },
    min_level: 1,
  },
  nebula_snack: {
    key: 'nebula_snack',
    slot: 'food',
    title: 'Nebula Snack Pack',
    description: 'Premium food: feed restores more hunger, energy and +10 pet XP.',
    cost: { moon_gold: 120, moon_crystals: 4, style_tokens: 0 },
    min_level: 4,
  },
  laser_ball: {
    key: 'laser_ball',
    slot: 'toy',
    title: 'Laser Ball',
    description: 'Better toy: play gives more happiness and +5 pet XP.',
    cost: { moon_gold: 75, moon_crystals: 1, style_tokens: 0 },
    min_level: 2,
  },
  street_hoodie: {
    key: 'street_hoodie',
    slot: 'outfit',
    title: 'Street Hoodie',
    description: 'Clothing upgrade: all care actions add +2 pet XP.',
    cost: { moon_gold: 60, moon_crystals: 0, style_tokens: 6 },
    min_level: 2,
  },
  moon_armor: {
    key: 'moon_armor',
    slot: 'outfit',
    title: 'Moon Armor',
    description: 'High-tier clothing: all care actions add +5 pet XP and +1 gold.',
    cost: { moon_gold: 180, moon_crystals: 8, style_tokens: 12 },
    min_level: 8,
  },
  crystal_bowl: {
    key: 'crystal_bowl',
    slot: 'food',
    title: 'Crystal Bowl',
    description: 'Endgame food: feed restores more hunger, health and +18 pet XP.',
    cost: { moon_gold: 360, moon_crystals: 18, style_tokens: 0 },
    min_level: 12,
  },
  hoverboard: {
    key: 'hoverboard',
    slot: 'toy',
    title: 'Moon Hoverboard',
    description: 'Adventure toy: play gives more happiness and adventures can find extra gold.',
    cost: { moon_gold: 240, moon_crystals: 10, style_tokens: 4 },
    min_level: 7,
  },
  crown_jacket: {
    key: 'crown_jacket',
    slot: 'outfit',
    title: 'Crown Jacket',
    description: 'Season flex: all care actions add +8 pet XP, +2 gold and +1 style.',
    cost: { moon_gold: 520, moon_crystals: 22, style_tokens: 30 },
    min_level: 15,
  },
});

const PET_ADVENTURES = Object.freeze([
  {
    key: 'moon_alley',
    title: 'Moon Alley Run',
    min_level: 1,
    energy_cost: 18,
    hunger_cost: 8,
    pet_xp: 26,
    gold: 22,
    crystals: 0,
    style_tokens: 1,
  },
  {
    key: 'graffiti_vault',
    title: 'Graffiti Vault Raid',
    min_level: 4,
    energy_cost: 26,
    hunger_cost: 12,
    pet_xp: 44,
    gold: 42,
    crystals: 1,
    style_tokens: 3,
  },
  {
    key: 'nebula_market',
    title: 'Nebula Market Flip',
    min_level: 9,
    energy_cost: 34,
    hunger_cost: 16,
    pet_xp: 72,
    gold: 76,
    crystals: 3,
    style_tokens: 5,
  },
]);

function hashPetAdventureSeed(value) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function scalePetAdventureRange(baseValue, minRatio, maxRatio, floor = 0) {
  const base = Math.max(0, Number(baseValue) || 0);
  const min = Math.max(floor, Math.floor(base * minRatio));
  const max = Math.max(min, Math.ceil(base * maxRatio));
  return [min, max];
}

function buildPetAdventureEncounter(adventure) {
  const energy = Math.max(1, Number(adventure.energy_cost) || 1);
  const hunger = Math.max(0, Number(adventure.hunger_cost) || 0);
  const petXp = Math.max(1, Number(adventure.pet_xp) || 1);
  const gold = Math.max(0, Number(adventure.gold) || 0);
  const crystals = Math.max(0, Number(adventure.crystals) || 0);
  const styleTokens = Math.max(0, Number(adventure.style_tokens) || 0);
  return Object.freeze({
    key: adventure.key,
    title: adventure.title,
    intro: `The ${adventure.title.toLowerCase()} splits into a few dangerous lines. Pick your move.`,
    adventure,
    choices: Object.freeze([
      Object.freeze({
        key: 'push_forward',
        label: 'Push Forward',
        copy: 'You lean into the run and squeeze out the biggest haul.',
        rewards: Object.freeze({
          pet_xp: scalePetAdventureRange(petXp, 0.95, 1.25, 8),
          moon_gold: scalePetAdventureRange(gold, 0.75, 1.2, 4),
          moon_crystals: scalePetAdventureRange(crystals + 1, 0, 1, 0),
          style_tokens: scalePetAdventureRange(styleTokens + 1, 0, 1, 0),
        }),
        costs: Object.freeze({
          energy: scalePetAdventureRange(energy, 0.55, 0.85, 1),
          hunger: scalePetAdventureRange(hunger, 0.55, 1.05, 0),
        }),
        risk: Object.freeze({
          chance: 0.35,
          copy: 'The route gets messy, but you still salvage a win.',
          rewards: Object.freeze({
            pet_xp: scalePetAdventureRange(petXp, 0.5, 0.85, 4),
            moon_gold: scalePetAdventureRange(gold, 0.35, 0.7, 2),
          }),
          costs: Object.freeze({
            energy: scalePetAdventureRange(energy, 0.75, 1.15, 1),
            hunger: scalePetAdventureRange(hunger, 0.8, 1.2, 0),
          }),
        }),
      }),
      Object.freeze({
        key: 'scan_the_route',
        label: 'Scan the Route',
        copy: 'You read the scene first and take the smarter opening.',
        rewards: Object.freeze({
          pet_xp: scalePetAdventureRange(petXp, 0.75, 1.05, 6),
          moon_gold: scalePetAdventureRange(gold, 0.6, 0.9, 3),
          style_tokens: scalePetAdventureRange(styleTokens + 1, 0, 1, 0),
        }),
        costs: Object.freeze({
          energy: scalePetAdventureRange(energy, 0.35, 0.65, 0),
          hunger: scalePetAdventureRange(hunger, 0.4, 0.8, 0),
        }),
        risk: Object.freeze({
          chance: 0.25,
          copy: 'The detour takes longer, but you still come out ahead.',
          rewards: Object.freeze({
            pet_xp: scalePetAdventureRange(petXp, 0.45, 0.75, 3),
            moon_gold: scalePetAdventureRange(gold, 0.25, 0.55, 1),
          }),
          costs: Object.freeze({
            energy: scalePetAdventureRange(energy, 0.45, 0.9, 0),
            hunger: scalePetAdventureRange(hunger, 0.5, 1.0, 0),
          }),
        }),
      }),
      Object.freeze({
        key: 'cash_out',
        label: 'Cash Out',
        copy: 'You bank a clean smaller win and keep the pet in one piece.',
        rewards: Object.freeze({
          pet_xp: scalePetAdventureRange(petXp, 0.45, 0.75, 4),
          moon_gold: scalePetAdventureRange(gold, 0.35, 0.6, 2),
          moon_crystals: scalePetAdventureRange(crystals, 0, 1, 0),
        }),
        costs: Object.freeze({
          energy: scalePetAdventureRange(energy, 0.15, 0.4, 0),
          hunger: scalePetAdventureRange(hunger, 0.2, 0.5, 0),
        }),
        risk: Object.freeze({
          chance: 0.15,
          copy: 'The safe route runs longer than expected, but you still pocket something.',
          rewards: Object.freeze({
            pet_xp: scalePetAdventureRange(petXp, 0.2, 0.45, 2),
            moon_gold: scalePetAdventureRange(gold, 0.1, 0.3, 0),
          }),
          costs: Object.freeze({
            energy: scalePetAdventureRange(energy, 0.2, 0.6, 0),
            hunger: scalePetAdventureRange(hunger, 0.25, 0.75, 0),
          }),
        }),
      }),
    ]),
  });
}

const PET_ADVENTURE_ENCOUNTERS = Object.freeze(Object.fromEntries(
  PET_ADVENTURES.map((adventure) => [adventure.key, buildPetAdventureEncounter(adventure)]),
));

const PET_RUN_MAX_DEPTH = 5;
const PET_RUN_COMPLETED_STATUSES = Object.freeze(['completed', 'failed', 'extracted']);

const PET_RUN_CHOICE_LIBRARY = Object.freeze({
  fight: Object.freeze({
    key: 'fight',
    label: 'Fight',
    type: 'fight',
    copy: 'Your Moonpet squares up and wins the scrap.',
    risk_copy: 'The scrap turns ugly. Your Moonpet escapes with a lesson, but the stash is gone.',
    base_risk: 0.24,
    rewards: Object.freeze({ pet_xp: [18, 32], moon_gold: [18, 36], moon_crystals: [0, 1] }),
    costs: Object.freeze({ energy: [10, 18], hunger: [4, 8] }),
  }),
  sneak: Object.freeze({
    key: 'sneak',
    label: 'Sneak',
    type: 'sneak',
    copy: 'Your Moonpet slips past the heat and pockets a clean find.',
    risk_copy: 'The route gets spotted. The run burns out before the loot gets banked.',
    base_risk: 0.18,
    rewards: Object.freeze({ pet_xp: [12, 24], moon_gold: [12, 30], style_tokens: [0, 1] }),
    costs: Object.freeze({ energy: [6, 14], hunger: [2, 6] }),
  }),
  loot: Object.freeze({
    key: 'loot',
    label: 'Loot',
    type: 'loot',
    copy: 'Your Moonpet cracks a cache and stacks the unbanked bag.',
    risk_copy: 'The cache was bait. The unbanked stash gets scattered.',
    base_risk: 0.28,
    rewards: Object.freeze({ pet_xp: [10, 22], moon_gold: [28, 54], moon_crystals: [0, 2] }),
    costs: Object.freeze({ energy: [8, 15], cleanliness: [4, 10] }),
  }),
  rest: Object.freeze({
    key: 'rest',
    label: 'Rest',
    type: 'rest',
    copy: 'Your Moonpet catches its breath and keeps the run alive.',
    risk_copy: 'The pause takes too long. The route closes and the stash is lost.',
    base_risk: 0.12,
    rewards: Object.freeze({ pet_xp: [8, 18], energy: [8, 18], happiness: [2, 8] }),
    costs: Object.freeze({ hunger: [4, 9] }),
  }),
  trade: Object.freeze({
    key: 'trade',
    label: 'Trade',
    type: 'trade',
    copy: 'Your Moonpet flips a street deal into better run loot.',
    risk_copy: 'The deal goes sideways. The unbanked bag gets clipped.',
    base_risk: 0.26,
    rewards: Object.freeze({ pet_xp: [10, 20], moon_gold: [18, 44], style_tokens: [1, 3] }),
    costs: Object.freeze({ moon_gold: [4, 12], energy: [4, 10] }),
  }),
  gamble: Object.freeze({
    key: 'gamble',
    label: 'Gamble',
    type: 'gamble',
    copy: 'Your Moonpet calls the risky line and the multiplier pops.',
    risk_copy: 'The risky line snaps. The unbanked haul disappears.',
    base_risk: 0.38,
    rewards: Object.freeze({ pet_xp: [18, 36], moon_gold: [40, 84], moon_crystals: [1, 3], style_tokens: [0, 2] }),
    costs: Object.freeze({ energy: [12, 22], hunger: [6, 12] }),
  }),
  boss: Object.freeze({
    key: 'boss',
    label: 'Boss',
    type: 'boss',
    copy: 'Your Moonpet clears the boss step and banks the run.',
    risk_copy: 'The boss wins the last exchange. Only a tiny lesson sticks.',
    base_risk: 0.34,
    rewards: Object.freeze({ pet_xp: [34, 62], moon_gold: [58, 112], moon_crystals: [1, 4], style_tokens: [2, 5] }),
    costs: Object.freeze({ energy: [16, 28], hunger: [8, 16], cleanliness: [4, 10] }),
  }),
});

const PET_RUN_STEP_CHOICES = Object.freeze([
  Object.freeze(['fight', 'sneak', 'loot']),
  Object.freeze(['rest', 'trade', 'fight']),
  Object.freeze(['sneak', 'loot', 'gamble']),
  Object.freeze(['rest', 'trade', 'gamble']),
  Object.freeze(['boss', 'sneak', 'fight']),
]);

const PET_KAIJU_CATEGORIES = Object.freeze([
  Object.freeze({ roll: 1, key: 'pwr', label: 'PWR', name: 'Power' }),
  Object.freeze({ roll: 2, key: 'size', label: 'SIZE', name: 'Size' }),
  Object.freeze({ roll: 3, key: 'atk', label: 'ATK', name: 'Attack' }),
  Object.freeze({ roll: 4, key: 'def', label: 'DEF', name: 'Defence' }),
  Object.freeze({ roll: 5, key: 'spd', label: 'SPD', name: 'Speed' }),
  Object.freeze({ roll: 6, key: 'lgcy', label: 'LGCY', name: 'Legacy' }),
]);

const PET_KAIJU_CARDS = Object.freeze([
  Object.freeze({ id: 'big-daddy-kong', name: 'Big Daddy Kong', stats: Object.freeze({ pwr: 8, size: 6, atk: 7, def: 3, spd: 4, lgcy: 8 }) }),
  Object.freeze({ id: 'god-dzilla', name: 'God-Dzilla', stats: Object.freeze({ pwr: 9, size: 7, atk: 6, def: 6, spd: 3, lgcy: 10 }) }),
  Object.freeze({ id: 'jet-jaguar', name: 'Jet Jaguar', stats: Object.freeze({ pwr: 5, size: 7, atk: 6, def: 7, spd: 7, lgcy: 4 }) }),
  Object.freeze({ id: 'mc-rodan', name: 'MC Rodan', stats: Object.freeze({ pwr: 8, size: 4, atk: 8, def: 5, spd: 8, lgcy: 5 }) }),
  Object.freeze({ id: 'mf-gidorah', name: 'MF Gidorah', stats: Object.freeze({ pwr: 7, size: 9, atk: 6, def: 5, spd: 3, lgcy: 9 }) }),
  Object.freeze({ id: 'moth-def', name: 'Moth Def', stats: Object.freeze({ pwr: 6, size: 7, atk: 6, def: 5, spd: 9, lgcy: 5 }) }),
  Object.freeze({ id: 'mecha-zilla', name: 'Mecha-Zilla', stats: Object.freeze({ pwr: 6, size: 6, atk: 8, def: 8, spd: 2, lgcy: 4 }) }),
]);

function clampPetStat(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function getPetStage(petXp) {
  return PET_STAGE_THRESHOLDS.reduce((current, candidate) => (
    Number(petXp || 0) >= candidate.min_xp ? candidate : current
  ), PET_STAGE_THRESHOLDS[0]).stage;
}

function getPetDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function getPreviousPetDayKey(dayKey) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return getPetDayKey(date);
}

function getPetWeekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getPetSeasonInfo(now = new Date()) {
  const year = now.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((Date.UTC(year, now.getUTCMonth(), now.getUTCDate()) - yearStart) / 86400000);
  const seasonNumber = Math.floor(dayOfYear / 90) + 1;
  const start = new Date(yearStart + ((seasonNumber - 1) * 90 * 86400000));
  const end = new Date(Math.min(Date.UTC(year + 1, 0, 1), start.getTime() + 90 * 86400000));
  return {
    key: `pet-s${year}-${String(seasonNumber).padStart(3, '0')}`,
    season_number: seasonNumber,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

function calculatePetHealth(pet) {
  const hungerScore = 100 - Number(pet.hunger || 0);
  return clampPetStat((hungerScore + Number(pet.happiness || 0) + Number(pet.cleanliness || 0) + Number(pet.energy || 0)) / 4);
}

function applyPetDecay(pet, now = new Date()) {
  const last = new Date(pet.last_decay_at || pet.updated_at || pet.created_at || now.toISOString()).getTime();
  const elapsedHours = Math.max(0, (now.getTime() - last) / 3600000);
  if (elapsedHours < 0.01) return pet;
  pet.hunger = clampPetStat(Number(pet.hunger || 0) + elapsedHours * 4.5);
  pet.happiness = clampPetStat(Number(pet.happiness || 0) - elapsedHours * 2.8);
  pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) - elapsedHours * 3.2);
  pet.energy = clampPetStat(Number(pet.energy || 0) - elapsedHours * 2.2);
  pet.health = calculatePetHealth(pet);
  pet.last_decay_at = now.toISOString();
  return pet;
}

function normalizePetAction(value) {
  const action = String(value || '').trim().toLowerCase();
  return PET_ACTIONS[action] ? action : null;
}

function normalizePetName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32);
  return name || null;
}

function clampPetCurrency(value) {
  return Math.max(0, Math.min(999999, Math.floor(Number(value) || 0)));
}

function getPetLevel(petXp) {
  return Math.max(1, Math.floor((Number(petXp) || 0) / 100) + 1);
}

function getPetEquippedItem(pet, slot) {
  const key = String(pet?.[`equipped_${slot}`] || '').trim();
  const item = PET_SHOP_ITEMS[key];
  return item && item.slot === slot ? item : null;
}

function applyPetItemActionBonuses(pet, action, rule, rewards) {
  const food = getPetEquippedItem(pet, 'food');
  const toy = getPetEquippedItem(pet, 'toy');
  const outfit = getPetEquippedItem(pet, 'outfit');

  if (action === 'feed' && food?.key === 'moon_kibble') {
    rule.hunger -= 12;
    rewards.pet_xp += 4;
  }
  if (action === 'feed' && food?.key === 'crystal_bowl') {
    rule.hunger -= 32;
    rule.energy += 10;
    rewards.pet_xp += 18;
  }
  if (action === 'feed' && food?.key === 'nebula_snack') {
    rule.hunger -= 22;
    rule.energy += 6;
    rewards.pet_xp += 10;
  }
  if (action === 'play' && toy?.key === 'laser_ball') {
    rule.happiness += 10;
    rewards.pet_xp += 5;
  }
  if (action === 'play' && toy?.key === 'hoverboard') {
    rule.happiness += 16;
    rewards.pet_xp += 8;
    rewards.moon_gold += 2;
  }
  if (outfit?.key === 'street_hoodie') {
    rewards.pet_xp += 2;
  }
  if (outfit?.key === 'moon_armor') {
    rewards.pet_xp += 5;
    rewards.moon_gold += 1;
  }
  if (['feed', 'play', 'clean', 'sleep', 'train'].includes(action) && outfit?.key === 'crown_jacket') {
    rewards.pet_xp += 8;
    rewards.moon_gold += 2;
    rewards.style_tokens += 1;
  }
}

function normalizePetShopItemKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').replace(/-/g, '_');
  return PET_SHOP_ITEMS[key] ? key : null;
}

function normalizePetAdventureKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').replace(/-/g, '_');
  if (!key) return null;
  return PET_ADVENTURES.some((adventure) => adventure.key === key) ? key : null;
}

function normalizePetInventoryItemKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').replace(/-/g, '_');
  return PET_INVENTORY_ITEMS[key] ? key : null;
}

function normalizePetJobKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').replace(/-/g, '_');
  return PET_JOBS[key] ? key : null;
}

function normalizePetEventChoice(value) {
  const key = String(value || '').trim().toLowerCase();
  return ['open', 'sell', 'ignore'].includes(key) ? key : null;
}

function buildStablePetEventKey(parts = []) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(':').slice(0, 120);
}

function buildTelegramMessagePetEventKey(message, telegramId, command, args = '') {
  return buildStablePetEventKey([
    message?.message_id || 'msg',
    message?.chat?.id || 'chat',
    telegramId || 'telegram',
    command || 'command',
    args || '',
  ]);
}

function buildTelegramCallbackPetEventKey(query, telegramId, data) {
  return buildStablePetEventKey([
    query?.id || 'callback',
    data || 'data',
    query?.message?.message_id || 'msg',
    query?.message?.chat?.id || 'chat',
    telegramId || 'telegram',
  ]);
}

function buildPetRunStepEventKey(telegramId, runId, stepIndex, choiceKey) {
  return buildStablePetEventKey(['pet_run_step', telegramId, runId, stepIndex, choiceKey]);
}

function buildPetRunExtractEventKey(telegramId, runId) {
  return buildStablePetEventKey(['pet_run_extract', telegramId, runId]);
}

function normalizePetRunChoiceKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').replace(/-/g, '_');
  return PET_RUN_CHOICE_LIBRARY[key] ? key : null;
}

function parsePetRunItems(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, count]) => PET_INVENTORY_ITEMS[key] && Number(count) > 0).map(([key, count]) => [key, Math.floor(Number(count) || 0)]));
  } catch {
    return {};
  }
}

function addPetRunItem(items, itemKey, count = 1) {
  if (!PET_INVENTORY_ITEMS[itemKey]) return items;
  const next = { ...parsePetRunItems(items) };
  next[itemKey] = Math.max(0, Math.floor(Number(next[itemKey] || 0) + Math.max(1, Number(count) || 1)));
  return next;
}

function serializePetRun(run) {
  if (!run) return null;
  return {
    id: run.id || null,
    telegram_id: String(run.telegram_id || ''),
    run_id: String(run.run_id || ''),
    season_key: String(run.season_key || ''),
    status: String(run.status || 'active'),
    depth: Math.max(0, Math.floor(Number(run.depth || 0))),
    max_depth: Math.max(1, Math.floor(Number(run.max_depth || PET_RUN_MAX_DEPTH))),
    risk_level: Math.max(1, Math.floor(Number(run.risk_level || 1))),
    unbanked_pet_xp: clampPetCurrency(run.unbanked_pet_xp),
    unbanked_moon_gold: clampPetCurrency(run.unbanked_moon_gold),
    unbanked_moon_crystals: clampPetCurrency(run.unbanked_moon_crystals),
    unbanked_style_tokens: clampPetCurrency(run.unbanked_style_tokens),
    unbanked_items: parsePetRunItems(run.unbanked_items),
    started_at: run.started_at || null,
    completed_at: run.completed_at || null,
    updated_at: run.updated_at || null,
  };
}

function getPetRunStepChoices(run) {
  const depth = Math.max(0, Math.floor(Number(run?.depth || 0)));
  const stepIndex = Math.min(Math.max(depth + 1, 1), PET_RUN_MAX_DEPTH);
  return (PET_RUN_STEP_CHOICES[stepIndex - 1] || PET_RUN_STEP_CHOICES[0]).map((key) => PET_RUN_CHOICE_LIBRARY[key]).filter(Boolean);
}

function getPetRunChoice(run, choiceKey) {
  const normalized = normalizePetRunChoiceKey(choiceKey);
  if (!normalized) return null;
  return getPetRunStepChoices(run).find((choice) => choice.key === normalized) || null;
}

function applyPetRunGearBonuses(pet, choice, inventory = []) {
  const food = getPetEquippedItem(pet, 'food');
  const toy = getPetEquippedItem(pet, 'toy');
  const outfit = getPetEquippedItem(pet, 'outfit');
  const bag = Object.fromEntries((inventory || []).map((item) => [item.key, Number(item.count || 0)]));
  const bonus = {
    risk_delta: 0,
    reward_multiplier: 1,
    gold_bonus: 0,
    crystal_bonus: 0,
    style_bonus: 0,
    pet_xp_bonus: 0,
    survival_bonus: 0,
    consumed_item_key: null,
  };
  if (toy?.key === 'hoverboard') {
    if (choice?.type === 'sneak') bonus.risk_delta -= 0.08;
    bonus.gold_bonus += 6;
  }
  if (outfit?.key === 'crown_jacket') {
    bonus.style_bonus += choice?.type === 'boss' ? 4 : 1;
    if (choice?.type === 'boss') bonus.reward_multiplier += 0.12;
  }
  if (food?.key === 'crystal_bowl') {
    if (choice?.type === 'rest') bonus.reward_multiplier += 0.12;
    bonus.survival_bonus += 0.06;
    bonus.risk_delta -= 0.04;
  }
  if (bag.lucky_charm > 0) {
    bonus.risk_delta -= 0.05;
    bonus.reward_multiplier += 0.08;
    bonus.consumed_item_key = 'lucky_charm';
  }
  if (bag.adventure_map > 0) {
    if (choice?.type === 'sneak') bonus.risk_delta -= 0.05;
    bonus.gold_bonus += 4;
  }
  return bonus;
}

function buildPetRunStepOutcome(run, choice, pet, inventory = []) {
  const depth = Math.max(0, Math.floor(Number(run?.depth || 0)));
  const stepIndex = Math.min(depth + 1, PET_RUN_MAX_DEPTH);
  const multiplier = 1 + (depth * 0.22) + (Math.max(1, Number(run?.risk_level || 1)) - 1) * 0.08;
  const gear = applyPetRunGearBonuses(pet, choice, inventory);
  const riskChance = Math.max(0.05, Math.min(0.72, Number(choice.base_risk || 0.2) + (depth * 0.045) + gear.risk_delta - gear.survival_bonus));
  const riskRoll = Math.random();
  const failed = riskRoll < riskChance;
  const rewards = {};
  const costs = {};
  for (const [stat, range] of Object.entries(choice.rewards || {})) {
    rewards[stat] = Math.max(0, Math.floor(rollPetRange(range, 0) * multiplier * gear.reward_multiplier));
  }
  rewards.moon_gold = Math.max(0, Math.floor(Number(rewards.moon_gold || 0) + gear.gold_bonus));
  rewards.moon_crystals = Math.max(0, Math.floor(Number(rewards.moon_crystals || 0) + gear.crystal_bonus));
  rewards.style_tokens = Math.max(0, Math.floor(Number(rewards.style_tokens || 0) + gear.style_bonus));
  rewards.pet_xp = Math.max(0, Math.floor(Number(rewards.pet_xp || 0) + gear.pet_xp_bonus));
  for (const [stat, range] of Object.entries(choice.costs || {})) {
    costs[stat] = Math.max(0, rollPetRange(range, 0));
  }
  let itemKey = null;
  if (!failed) {
    if (choice.type === 'loot' && Math.random() < 0.24) itemKey = 'moon_snack';
    if (choice.type === 'trade' && Math.random() < 0.18) itemKey = 'style_patch';
    if (choice.type === 'boss' && Math.random() < 0.34) itemKey = 'lucky_charm';
  }
  return {
    step_index: stepIndex,
    failed,
    success: !failed,
    risk_roll: riskRoll,
    risk_chance: riskChance,
    multiplier,
    rewards,
    costs,
    item_key: itemKey,
    consumed_item_key: gear.consumed_item_key,
    copy: failed ? choice.risk_copy : choice.copy,
  };
}

function getUnaffordablePetRunCosts(pet, costs = {}) {
  const missing = {};
  const currencyChecks = {
    moon_gold: clampPetCurrency(pet?.moon_gold),
    moon_crystals: clampPetCurrency(pet?.moon_crystals),
    style_tokens: clampPetCurrency(pet?.style_tokens),
  };
  for (const [key, balance] of Object.entries(currencyChecks)) {
    const cost = Math.max(0, Math.floor(Number(costs[key] || 0)));
    if (cost > balance) missing[key] = { required: cost, available: balance };
  }
  return missing;
}

function applyPetRunCosts(pet, costs = {}) {
  pet.energy = clampPetStat(Number(pet.energy || 0) - Math.max(0, Number(costs.energy || 0)));
  pet.hunger = clampPetStat(Number(pet.hunger || 0) + Math.max(0, Number(costs.hunger || 0)));
  pet.happiness = clampPetStat(Number(pet.happiness || 0) - Math.max(0, Number(costs.happiness || 0)));
  pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) - Math.max(0, Number(costs.cleanliness || 0)));
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) - Math.max(0, Number(costs.moon_gold || 0)));
  pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) - Math.max(0, Number(costs.moon_crystals || 0)));
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) - Math.max(0, Number(costs.style_tokens || 0)));
}

function applyPetRunStatRewards(pet, rewards = {}) {
  pet.health = clampPetStat(Number(pet.health || 0) + Math.max(0, Number(rewards.health || 0)));
  pet.energy = clampPetStat(Number(pet.energy || 0) + Math.max(0, Number(rewards.energy || 0)));
  pet.happiness = clampPetStat(Number(pet.happiness || 0) + Math.max(0, Number(rewards.happiness || 0)));
  pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) + Math.max(0, Number(rewards.cleanliness || 0)));
  pet.hunger = clampPetStat(Number(pet.hunger || 0) - Math.max(0, Number(rewards.hunger || 0)));
}

async function getActivePetRun(db, telegramId) {
  const row = await db.prepare(`
    SELECT * FROM telegram_pet_runs
    WHERE telegram_id = ? AND status IN ('active', 'extractable')
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(telegramId).first().catch(() => null);
  return row ? serializePetRun(row) : null;
}

async function getPetRunById(db, telegramId, runId) {
  const row = await db.prepare(`
    SELECT * FROM telegram_pet_runs
    WHERE telegram_id = ? AND run_id = ?
    LIMIT 1
  `).bind(telegramId, runId).first().catch(() => null);
  return row ? serializePetRun(row) : null;
}

async function startOrResumePetRun(db, telegramId, options = {}) {
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const requestedRunId = String(options.run_id || '').trim().slice(0, 80);
  if (requestedRunId) {
    const requestedRun = await getPetRunById(db, telegramId, requestedRunId);
    if (requestedRun && ['active', 'extractable'].includes(requestedRun.status)) return { accepted: true, reason: 'run_resumed', run: requestedRun, pet };
    if (requestedRun && PET_RUN_COMPLETED_STATUSES.includes(requestedRun.status)) return { accepted: false, reason: 'run_closed', run: requestedRun, pet, xp_awarded: 0, pet_xp_awarded: 0 };
    return { accepted: false, reason: 'run_not_found', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const active = await getActivePetRun(db, telegramId);
  if (active) return { accepted: true, reason: 'run_resumed', run: active, pet };
  if (clampPetStat(pet.energy) < 12) return { accepted: false, reason: 'pet_tired', pet };
  const now = new Date();
  const season = getPetSeasonInfo(now);
  const runId = `run-${crypto.randomUUID()}`.slice(0, 80);
  await db.prepare(`
    INSERT INTO telegram_pet_runs
      (id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level, unbanked_items)
    VALUES (?, ?, ?, ?, 'active', 0, ?, 1, '{}')
  `).bind(crypto.randomUUID(), telegramId, runId, season.key, PET_RUN_MAX_DEPTH).run();
  const run = await getPetRunById(db, telegramId, runId);
  return { accepted: true, reason: 'run_started', run, pet };
}

async function recordPetRunBankedEvent(db, telegramId, run, pet, options = {}) {
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventType = options.completed ? 'run_complete' : 'run_extract';
  const eventKey = String(options.completed ? (options.event_key || buildStablePetEventKey(['pet_run_complete', telegramId, run.run_id])) : buildPetRunExtractEventKey(telegramId, run.run_id)).slice(0, 120);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate || PET_RUN_COMPLETED_STATUSES.includes(run.status)) {
    return { accepted: true, duplicate: true, reason: 'duplicate', run, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const claim = await db.prepare(`
    UPDATE telegram_pet_runs
    SET status = ?,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable')
  `).bind(options.completed ? 'completed' : 'extracted', telegramId, run.run_id).run();
  if (!claim?.meta?.changes) {
    const completedRun = await getPetRunById(db, telegramId, run.run_id);
    return { accepted: true, duplicate: true, reason: 'duplicate', run: completedRun || run, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  let petXp = clampPetCurrency(run.unbanked_pet_xp);
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;
  else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
  let communityXp = Math.max(0, Math.min(80, Math.floor((petXp || run.unbanked_pet_xp || 0) / 3) + Math.max(0, Number(run.depth || 0)) * 4));
  if (totals.day.community_xp >= PETS_DAILY_COMMUNITY_XP_CAP) communityXp = 0;
  else if (totals.day.community_xp + communityXp > PETS_DAILY_COMMUNITY_XP_CAP) communityXp = Math.max(0, PETS_DAILY_COMMUNITY_XP_CAP - totals.day.community_xp);
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + clampPetCurrency(run.unbanked_moon_gold));
  pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) + clampPetCurrency(run.unbanked_moon_crystals));
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + clampPetCurrency(run.unbanked_style_tokens));
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();
  const bankedItems = parsePetRunItems(run.unbanked_items);

  await db.prepare(`
    INSERT INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?)
  `).bind(
    crypto.randomUUID(),
    telegramId,
    eventType,
    eventKey,
    communityXp,
    petXp,
    season.key,
    dayKey,
    weekKey,
    options.completed ? 'run_completed' : 'run_extracted',
    JSON.stringify({
      source: options.source || 'telegram_command',
      run_id: run.run_id,
      depth: run.depth,
      max_depth: run.max_depth,
      rewards: {
        pet_xp: petXp,
        moon_gold: clampPetCurrency(run.unbanked_moon_gold),
        moon_crystals: clampPetCurrency(run.unbanked_moon_crystals),
        style_tokens: clampPetCurrency(run.unbanked_style_tokens),
      },
      items: bankedItems,
    }),
  ).run();
  for (const [itemKey, count] of Object.entries(bankedItems)) {
    await db.prepare(`
      INSERT INTO telegram_pet_events
        (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      VALUES (?, ?, 'run_item', ?, 0, 0, ?, ?, ?, 'accepted', 'run_item_banked', ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      buildStablePetEventKey(['pet_run_item', telegramId, run.run_id, itemKey]),
      season.key,
      dayKey,
      weekKey,
      JSON.stringify({ source: options.source || 'telegram_command', run_id: run.run_id, item_key: itemKey, count }),
    ).run().catch(() => {});
  }
  if (communityXp > 0) {
    await awardCommunityXp(db, telegramId, communityXp, `pet_${eventType}`, eventKey);
  }
  await savePetProfile(db, pet);
  await db.prepare(`
    INSERT INTO telegram_pet_season_state
      (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id, season_key) DO UPDATE SET
      season_xp = season_xp + excluded.season_xp,
      weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
      daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
      daily_key = excluded.daily_key,
      weekly_key = excluded.weekly_key,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey).run();
  const completedRun = await getPetRunById(db, telegramId, run.run_id);
  return { accepted: true, reason: options.completed ? 'run_completed' : 'run_extracted', run: completedRun, pet, xp_awarded: communityXp, pet_xp_awarded: petXp, banked_items: bankedItems };
}

async function processPetRunExtract(db, telegramId, runIdRaw = '', options = {}) {
  const runId = String(runIdRaw || '').trim();
  const run = runId ? await getPetRunById(db, telegramId, runId) : await getActivePetRun(db, telegramId);
  if (!run) return { accepted: false, reason: 'run_not_found', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', run, xp_awarded: 0, pet_xp_awarded: 0 };
  if (run.depth <= 0) return { accepted: false, reason: 'run_empty', run, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  return recordPetRunBankedEvent(db, telegramId, run, pet, { ...options, event_key: buildPetRunExtractEventKey(telegramId, run.run_id) });
}

async function processPetRunStep(db, telegramId, runIdRaw, choiceKeyRaw, options = {}) {
  const runId = String(runIdRaw || '').trim();
  const run = runId ? await getPetRunById(db, telegramId, runId) : await getActivePetRun(db, telegramId);
  if (!run) return { accepted: false, reason: 'run_not_found', xp_awarded: 0, pet_xp_awarded: 0 };
  if (!['active', 'extractable'].includes(run.status)) return { accepted: false, reason: 'run_closed', run, xp_awarded: 0, pet_xp_awarded: 0 };
  const choice = getPetRunChoice(run, choiceKeyRaw);
  if (!choice) return { accepted: false, reason: 'invalid_run_choice', run, xp_awarded: 0, pet_xp_awarded: 0 };
  const stepIndex = Math.max(1, Math.floor(Number(run.depth || 0) + 1));
  const suppliedExpectedStepIndex = options.expected_step_index === undefined || options.expected_step_index === null || options.expected_step_index === ''
    ? null
    : Number(options.expected_step_index);
  const expectedStepIndex = suppliedExpectedStepIndex === null
    ? null
    : Math.max(1, Math.floor(Number.isFinite(suppliedExpectedStepIndex) ? suppliedExpectedStepIndex : 0));
  if (expectedStepIndex !== null && expectedStepIndex !== stepIndex) {
    return { accepted: false, reason: 'stale_run_step', run, choice, expected_step_index: expectedStepIndex, current_step_index: stepIndex, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const eventKey = String(options.event_key || buildPetRunStepEventKey(telegramId, run.run_id, expectedStepIndex || stepIndex, choice.key)).slice(0, 120);
  const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  const existingStep = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE run_id = ? AND step_index = ?`).bind(run.run_id, stepIndex).first().catch(() => null);
  if (existingStep) return { accepted: true, duplicate: true, reason: 'step_already_resolved', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  if (clampPetStat(pet.energy) <= 0) return { accepted: false, reason: 'pet_tired', run, choice, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  const inventory = await getPetInventory(db, telegramId).catch(() => []);
  const outcome = buildPetRunStepOutcome(run, choice, pet, inventory);
  const missingCosts = getUnaffordablePetRunCosts(pet, outcome.costs);
  if (Object.keys(missingCosts).length) {
    return { accepted: false, reason: 'insufficient_run_cost', run, choice, pet, outcome, missing_costs: missingCosts, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  applyPetRunCosts(pet, outcome.costs);
  const dayKey = getPetDayKey(new Date());
  const weekKey = getPetWeekKey(new Date());
  const season = getPetSeasonInfo(new Date());
  const unbankedItems = outcome.item_key ? addPetRunItem(run.unbanked_items, outcome.item_key) : parsePetRunItems(run.unbanked_items);
  await db.prepare(`
    INSERT INTO telegram_pet_run_steps
      (id, telegram_id, run_id, step_index, choice_key, choice_type, event_key, success, risk_roll, pet_xp_delta, moon_gold_delta, moon_crystals_delta, style_tokens_delta, item_key, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    telegramId,
    run.run_id,
    stepIndex,
    choice.key,
    choice.type,
    eventKey,
    outcome.success ? 1 : 0,
    outcome.risk_roll,
    outcome.success ? clampPetCurrency(outcome.rewards.pet_xp) : 0,
    outcome.success ? clampPetCurrency(outcome.rewards.moon_gold) : 0,
    outcome.success ? clampPetCurrency(outcome.rewards.moon_crystals) : 0,
    outcome.success ? clampPetCurrency(outcome.rewards.style_tokens) : 0,
    outcome.item_key,
    JSON.stringify({ source: options.source || 'telegram_command', risk_chance: outcome.risk_chance, costs: outcome.costs, copy: outcome.copy }),
  ).run();
  if (outcome.consumed_item_key) {
    await db.prepare(`
      INSERT INTO telegram_pet_events
        (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      VALUES (?, ?, 'run_item_use', ?, 0, 0, ?, ?, ?, 'accepted', 'run_item_consumed', ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      buildStablePetEventKey(['pet_run_item_use', telegramId, run.run_id, stepIndex, outcome.consumed_item_key]),
      season.key,
      dayKey,
      weekKey,
      JSON.stringify({ source: options.source || 'telegram_command', run_id: run.run_id, consumed_item_key: outcome.consumed_item_key, choice_key: choice.key }),
    ).run();
  }

  if (!outcome.success) {
    const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
    let consolationXp = Math.max(1, Math.min(12, 4 + Math.floor(Number(run.depth || 0) * 2)));
    if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) consolationXp = 0;
    else if (totals.day.pet_xp + consolationXp > PETS_DAILY_PET_XP_CAP) consolationXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
    pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + consolationXp));
    updatePetStreakForAction(pet, dayKey);
    pet.last_decay_at = new Date().toISOString();
    await db.prepare(`
      INSERT INTO telegram_pet_events
        (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      VALUES (?, ?, 'run_fail', ?, 0, ?, ?, ?, ?, 'accepted', 'run_failed', ?)
    `).bind(
      crypto.randomUUID(),
      telegramId,
      buildStablePetEventKey(['pet_run_fail', telegramId, run.run_id, stepIndex]),
      consolationXp,
      season.key,
      dayKey,
      weekKey,
      JSON.stringify({ source: options.source || 'telegram_command', run_id: run.run_id, failed_step: stepIndex, lost_unbanked: run }),
    ).run();
    await savePetProfile(db, pet);
    await db.prepare(`
      INSERT INTO telegram_pet_season_state
        (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET
        season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key,
        weekly_key = excluded.weekly_key,
        updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, season.key, consolationXp, consolationXp, consolationXp, dayKey, weekKey).run();
    await db.prepare(`
      UPDATE telegram_pet_runs
      SET status = 'failed',
          depth = ?,
          unbanked_pet_xp = 0,
          unbanked_moon_gold = 0,
          unbanked_moon_crystals = 0,
          unbanked_style_tokens = 0,
          unbanked_items = '{}',
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable')
    `).bind(stepIndex, telegramId, run.run_id).run();
    const failedRun = await getPetRunById(db, telegramId, run.run_id);
    return { accepted: true, reason: 'run_failed', run: failedRun, choice, outcome, pet, xp_awarded: 0, pet_xp_awarded: consolationXp };
  }

  updatePetStreakForAction(pet, dayKey);
  applyPetRunStatRewards(pet, outcome.rewards);
  pet.last_decay_at = new Date().toISOString();
  await savePetProfile(db, pet);
  await db.prepare(`
    UPDATE telegram_pet_runs
    SET status = ?,
        depth = ?,
        risk_level = risk_level + 1,
        unbanked_pet_xp = unbanked_pet_xp + ?,
        unbanked_moon_gold = unbanked_moon_gold + ?,
        unbanked_moon_crystals = unbanked_moon_crystals + ?,
        unbanked_style_tokens = unbanked_style_tokens + ?,
        unbanked_items = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable')
  `).bind(
    stepIndex >= PET_RUN_MAX_DEPTH ? 'extractable' : 'extractable',
    stepIndex,
    clampPetCurrency(outcome.rewards.pet_xp),
    clampPetCurrency(outcome.rewards.moon_gold),
    clampPetCurrency(outcome.rewards.moon_crystals),
    clampPetCurrency(outcome.rewards.style_tokens),
    JSON.stringify(unbankedItems),
    telegramId,
    run.run_id,
  ).run();
  const updatedRun = await getPetRunById(db, telegramId, run.run_id);
  if (stepIndex >= PET_RUN_MAX_DEPTH) {
    return recordPetRunBankedEvent(db, telegramId, updatedRun, pet, {
      completed: true,
      event_key: buildStablePetEventKey(['pet_run_complete', telegramId, run.run_id]),
      source: options.source || 'telegram_command',
    }).then((banked) => ({ ...banked, choice, outcome, reason: 'run_completed' }));
  }
  return { accepted: true, reason: 'run_step_complete', run: updatedRun, choice, outcome, pet, xp_awarded: 0, pet_xp_awarded: 0 };
}

async function getPetInventory(db, telegramId) {
  const rows = await db.prepare(`
    SELECT event_type, metadata, COUNT(*) AS count
    FROM telegram_pet_events
    WHERE telegram_id = ? AND status = 'accepted'
    GROUP BY event_type, metadata
  `).bind(telegramId).all().catch(() => ({ results: [] }));
  const inventory = {};
  for (const item of Object.values(PET_INVENTORY_ITEMS)) inventory[item.key] = 0;
  for (const row of rows.results || []) {
    try {
      const metadata = JSON.parse(row.metadata || '{}');
      const grantedItemKey = metadata.item_key || metadata.inventory_key;
      const consumedItemKey = metadata.consumed_item_key;
      const metadataCount = Math.max(1, Math.floor(Number(metadata.count || 1)));
      if (grantedItemKey && inventory[grantedItemKey] !== undefined) inventory[grantedItemKey] += Number(row.count || 0) * metadataCount;
      if (consumedItemKey && inventory[consumedItemKey] !== undefined) inventory[consumedItemKey] -= Number(row.count || 0);
    } catch {}
  }
  return Object.entries(PET_INVENTORY_ITEMS).map(([key, item]) => ({ ...item, count: Math.max(0, inventory[key] || 0) }));
}

async function processPetUseItem(db, telegramId, itemKeyRaw, options = {}) {
  const key = normalizePetInventoryItemKey(itemKeyRaw);
  if (!key) return { accepted: false, reason: 'invalid_item', xp_awarded: 0, pet_xp_awarded: 0 };
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:use_item:${telegramId}:${key}:${Date.now()}`).slice(0, 120);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const inventory = await getPetInventory(db, telegramId);
  const item = inventory.find((entry) => entry.key === key);
  if (!item || item.count <= 0) return { accepted: false, reason: 'item_not_found', pet };
  const effects = {
    moon_snack: { hunger: -18, energy: 8, pet_xp: 4 },
    energy_drink: { energy: 22, pet_xp: 6 },
    clean_wipe: { cleanliness: 24, happiness: 4, pet_xp: 4 },
    lucky_charm: { pet_xp: 8 },
    style_patch: { style_tokens: 2, pet_xp: 5 },
    adventure_map: { energy: 6, pet_xp: 5 },
  }[key];
  pet.hunger = clampPetStat(Number(pet.hunger || 0) + (effects.hunger || 0));
  pet.energy = clampPetStat(Number(pet.energy || 0) + (effects.energy || 0));
  pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) + (effects.cleanliness || 0));
  pet.happiness = clampPetStat(Number(pet.happiness || 0) + (effects.happiness || 0));
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + (effects.style_tokens || 0));
  let petXp = Math.max(0, effects.pet_xp || 0);
  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;
  else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();
  await db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata) VALUES (?, ?, 'use_item', ?, 0, ?, ?, ?, ?, 'accepted', 'item_used', ?)`)
    .bind(crypto.randomUUID(), telegramId, eventKey, petXp, season.key, dayKey, weekKey, JSON.stringify({ source: options.source || 'telegram_bot', consumed_item_key: key })).run();
  await savePetProfile(db, pet);
  return { accepted: true, reason: 'item_used', item, xp_awarded: 0, pet_xp_awarded: petXp, pet };
}

async function processPetJob(db, telegramId, jobKeyRaw, options = {}) {
  const key = normalizePetJobKey(jobKeyRaw);
  if (!key) return { accepted: false, reason: 'invalid_job', xp_awarded: 0, pet_xp_awarded: 0 };
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:work:${telegramId}:${key}:${Date.now()}`).slice(0, 120);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const lastWork = await db.prepare(`SELECT created_at FROM telegram_pet_events WHERE telegram_id = ? AND event_type = 'work' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`).bind(telegramId).first().catch(() => null);
  if (lastWork?.created_at) {
    const elapsedSeconds = (now.getTime() - new Date(lastWork.created_at).getTime()) / 1000;
    if (elapsedSeconds < PETS_ACTION_COOLDOWN_SECONDS) {
      return { accepted: false, reason: 'cooldown', retry_after_seconds: Math.max(1, Math.ceil(PETS_ACTION_COOLDOWN_SECONDS - elapsedSeconds)), pet };
    }
  }
  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  let petXp = PET_JOBS[key].pet_xp;
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;
  else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
  const rewards = PET_JOBS[key];
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + (rewards.moon_gold || 0));
  pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) + (rewards.moon_crystals || 0));
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + (rewards.style_tokens || 0));
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();
  await db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata) VALUES (?, ?, 'work', ?, 0, ?, ?, ?, ?, 'accepted', ?, ?)`)
    .bind(crypto.randomUUID(), telegramId, eventKey, petXp, season.key, dayKey, weekKey, key, JSON.stringify({ source: options.source || 'telegram_bot', job_key: key, rewards })).run();
  await savePetProfile(db, pet);
  await db.prepare(`INSERT INTO telegram_pet_season_state (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(telegram_id, season_key) DO UPDATE SET season_xp = season_xp + excluded.season_xp, weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END, daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END, daily_key = excluded.daily_key, weekly_key = excluded.weekly_key, updated_at = CURRENT_TIMESTAMP`).bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey).run();
  return { accepted: true, reason: key, job: PET_JOBS[key], xp_awarded: 0, pet_xp_awarded: petXp, pet };
}

async function processPetDailyChest(db, telegramId, options = {}) {
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:daily:${telegramId}:${dayKey}`).slice(0, 120);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const claimed = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_type = 'daily_chest' AND day_key = ? AND status = 'accepted'`).bind(telegramId, dayKey).first().catch(() => null);
  if (claimed) return { accepted: false, reason: 'daily_claimed', pet };
  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  let petXp = 40;
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;
  else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + 40);
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + 2);
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();
  await db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata) VALUES (?, ?, 'daily_chest', ?, 0, ?, ?, ?, ?, 'accepted', 'daily_chest', ?)`)
    .bind(crypto.randomUUID(), telegramId, eventKey, petXp, season.key, dayKey, weekKey, JSON.stringify({ source: options.source || 'telegram_bot' })).run();
  await savePetProfile(db, pet);
  return { accepted: true, reason: 'daily_chest', xp_awarded: 0, pet_xp_awarded: petXp, pet };
}

async function processPetRandomEvent(db, telegramId, choiceRaw, options = {}) {
  const requestedChoice = normalizePetRandomEventChoice(choiceRaw);
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const encounter = resolvePetRandomEncounter(options.event_key || options.encounter_key || options.eventKey) || options.encounter || selectPetRandomEncounter();
  if (!encounter) return { accepted: false, reason: 'event_unavailable', xp_awarded: 0, pet_xp_awarded: 0 };
  const legacyChoiceIndex = { open: 0, sell: 1, ignore: 2 }[requestedChoice];
  const choice = legacyChoiceIndex !== undefined
    ? encounter.choices[legacyChoiceIndex] || encounter.choices[0]
    : encounter.choices.find((entry) => entry.key === requestedChoice) || null;
  if (!choice) return { accepted: false, reason: 'invalid_event_choice', encounter, xp_awarded: 0, pet_xp_awarded: 0 };
  const eventKey = String(options.event_key || encounter.event_key || `${encounter.key}-${Date.now().toString(36)}`).slice(0, 120);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const outcome = pickPetRandomEventOutcome(choice);
  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  const petXpAwarded = Math.min(PETS_DAILY_PET_XP_CAP, Math.max(0, rollPetRange(outcome.rewards.pet_xp, 0)));
  const applied = applyPetRandomEventDeltas(
    pet,
    { ...outcome.rewards, pet_xp: petXpAwarded },
    outcome.costs,
  );
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) {
    pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) - petXpAwarded));
    applied.rewardsApplied.pet_xp = 0;
    applied.deltas.pet_xp = 0;
  } else if (totals.day.pet_xp + petXpAwarded > PETS_DAILY_PET_XP_CAP) {
    const clampedPetXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
    pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) - (petXpAwarded - clampedPetXp)));
    applied.rewardsApplied.pet_xp = clampedPetXp;
    applied.deltas.pet_xp = clampedPetXp;
  }
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();
  await db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata) VALUES (?, ?, 'random_event', ?, 0, ?, ?, ?, ?, 'accepted', ?, ?)`)
    .bind(
      crypto.randomUUID(),
      telegramId,
      eventKey,
      applied.deltas.pet_xp,
      season.key,
      dayKey,
      weekKey,
      `${encounter.key}:${choice.key}:${outcome.kind}`,
      JSON.stringify({
        source: options.source || 'telegram_bot',
        encounter_key: encounter.key,
        encounter_title: encounter.title,
        choice_key: choice.key,
        choice_label: choice.label,
        result_kind: outcome.kind,
        rewards: applied.rewardsApplied,
        costs: applied.costsApplied,
        copy: outcome.copy,
      }),
    ).run();
  await savePetProfile(db, pet);
  return {
    accepted: true,
    reason: `${encounter.key}:${choice.key}`,
    encounter,
    choice,
    result_copy: outcome.copy,
    applied,
    xp_awarded: 0,
    pet_xp_awarded: applied.deltas.pet_xp,
    pet,
  };
}

function canAffordPetItem(pet, item) {
  const cost = item.cost || {};
  return clampPetCurrency(pet.moon_gold) >= (cost.moon_gold || 0) &&
    clampPetCurrency(pet.moon_crystals) >= (cost.moon_crystals || 0) &&
    clampPetCurrency(pet.style_tokens) >= (cost.style_tokens || 0);
}

function petShopItemsForPet(pet) {
  const level = getPetLevel(pet?.pet_xp);
  return Object.values(PET_SHOP_ITEMS).map((item) => ({
    ...item,
    unlocked: level >= item.min_level,
    affordable: !!pet && level >= item.min_level && canAffordPetItem(pet, item),
    equipped: !!pet && String(pet[`equipped_${item.slot}`] || '') === item.key,
  }));
}

function petAdventuresForPet(pet) {
  const level = getPetLevel(pet?.pet_xp);
  return PET_ADVENTURES.map((adventure) => ({
    ...adventure,
    unlocked: level >= adventure.min_level,
    ready: !!pet && level >= adventure.min_level && clampPetStat(pet.energy) >= adventure.energy_cost,
  }));
}

function verifyPetsBotSecret(request, env) {
  const expected = String(env.TELEGRAM_PETS_BOT_SECRET || '').trim();
  const supplied = request.headers.get('X-Pets-Bot-Secret') || request.headers.get('x-pets-bot-secret') || '';
  return !!expected && !!supplied && supplied === expected;
}

async function getPetProfile(db, telegramId) {
  const pet = await db.prepare(`
    SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?
  `).bind(telegramId).first().catch(() => null);
  return pet ? applyPetDecay(pet) : null;
}

async function getOrCreatePetProfile(db, telegramId, options = {}) {
  let pet = await getPetProfile(db, telegramId);
  if (!pet) {
    const petName = normalizePetName(options.pet_name) || 'Moonpet';
    const species = normalizePetName(options.species) || 'moonbeast';
    await db.prepare(`
      INSERT INTO telegram_pet_profiles (telegram_id, pet_name, species)
      VALUES (?, ?, ?)
    `).bind(telegramId, petName, species).run();
    pet = await db.prepare(`
      SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?
    `).bind(telegramId).first();
  }
  return applyPetDecay(pet);
}

function updatePetStreakForAction(pet, dayKey) {
  const previousDay = pet.last_active_day || null;
  const currentStreak = Math.max(0, Math.floor(Number(pet.streak_days) || 0));
  if (previousDay === dayKey) {
    pet.streak_days = Math.max(1, currentStreak);
  } else if (previousDay === getPreviousPetDayKey(dayKey)) {
    pet.streak_days = currentStreak + 1;
  } else {
    pet.streak_days = 1;
  }
  pet.last_active_day = dayKey;
}

async function savePetProfile(db, pet) {
  pet.stage = getPetStage(pet.pet_xp);
  pet.health = calculatePetHealth(pet);
  await db.prepare(`
    UPDATE telegram_pet_profiles
    SET pet_name = ?, species = ?, stage = ?, pet_xp = ?, level = ?,
        hunger = ?, happiness = ?, cleanliness = ?, energy = ?, health = ?,
        streak_days = ?, moon_gold = ?, moon_crystals = ?, style_tokens = ?,
        equipped_food = ?, equipped_toy = ?, equipped_outfit = ?,
        last_active_day = ?, last_decay_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `).bind(
    pet.pet_name,
    pet.species,
    pet.stage,
    Math.max(0, Math.floor(Number(pet.pet_xp) || 0)),
    getPetLevel(pet.pet_xp),
    clampPetStat(pet.hunger),
    clampPetStat(pet.happiness),
    clampPetStat(pet.cleanliness),
    clampPetStat(pet.energy),
    clampPetStat(pet.health),
    Math.max(0, Math.floor(Number(pet.streak_days) || 0)),
    clampPetCurrency(pet.moon_gold),
    clampPetCurrency(pet.moon_crystals),
    clampPetCurrency(pet.style_tokens),
    pet.equipped_food || null,
    pet.equipped_toy || null,
    pet.equipped_outfit || null,
    pet.last_active_day || null,
    pet.last_decay_at || new Date().toISOString(),
    pet.telegram_id,
  ).run();
}

async function getPetWindowTotals(db, telegramId, dayKey, weekKey) {
  const day = await db.prepare(`
    SELECT COALESCE(SUM(xp_awarded), 0) AS community_xp,
           COALESCE(SUM(pet_xp_awarded), 0) AS pet_xp
    FROM telegram_pet_events
    WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
  `).bind(telegramId, dayKey).first().catch(() => ({ community_xp: 0, pet_xp: 0 }));
  const week = await db.prepare(`
    SELECT COALESCE(SUM(xp_awarded), 0) AS community_xp,
           COALESCE(SUM(pet_xp_awarded), 0) AS pet_xp
    FROM telegram_pet_events
    WHERE telegram_id = ? AND week_key = ? AND status = 'accepted'
  `).bind(telegramId, weekKey).first().catch(() => ({ community_xp: 0, pet_xp: 0 }));
  return {
    day: { community_xp: Number(day?.community_xp || 0), pet_xp: Number(day?.pet_xp || 0) },
    week: { community_xp: Number(week?.community_xp || 0), pet_xp: Number(week?.pet_xp || 0) },
  };
}


function normalizePetKaijuCardKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return PET_KAIJU_CARDS.some((card) => card.id === key) ? key : null;
}

function getPetKaijuCard(key) {
  const normalized = normalizePetKaijuCardKey(key);
  return PET_KAIJU_CARDS.find((card) => card.id === normalized) || null;
}

function isTelegramGroupChat(chatId, chatType = '') {
  const type = String(chatType || '').toLowerCase();
  return type === 'group' || type === 'supergroup' || String(chatId || '').startsWith('-');
}

function pickPetKaijuCategory() {
  return PET_KAIJU_CATEGORIES[Math.floor(Math.random() * PET_KAIJU_CATEGORIES.length)] || PET_KAIJU_CATEGORIES[0];
}

function pickPetKaijuCpuCard(avoidKey = '') {
  const available = PET_KAIJU_CARDS.filter((card) => card.id !== avoidKey);
  return available[Math.floor(Math.random() * available.length)] || PET_KAIJU_CARDS[0];
}

function buildPetKaijuMatchId() {
  return `kaiju-${crypto.randomUUID()}`.slice(0, 80);
}

function serializePetKaijuMatch(row) {
  if (!row) return null;
  return {
    ...row,
    roll: Math.max(0, Math.floor(Number(row.roll) || 0)),
    score_json: String(row.score_json || ''),
  };
}

function resolvePetKaijuBattle(playerCardKey, opponentCardKey, categoryKey = '') {
  const playerCard = getPetKaijuCard(playerCardKey);
  const opponentCard = getPetKaijuCard(opponentCardKey);
  const category = PET_KAIJU_CATEGORIES.find((entry) => entry.key === categoryKey) || pickPetKaijuCategory();
  if (!playerCard || !opponentCard) return null;
  const playerScore = Math.max(0, Number(playerCard.stats[category.key]) || 0);
  const opponentScore = Math.max(0, Number(opponentCard.stats[category.key]) || 0);
  const result = playerScore > opponentScore ? 'player1_win' : opponentScore > playerScore ? 'player2_win' : 'draw';
  return { playerCard, opponentCard, category, playerScore, opponentScore, result };
}

function buildPetKaijuLobbyReplyMarkup(match) {
  const matchId = String(match?.match_id || '');
  return {
    inline_keyboard: [
      [
        { text: '🦖 Join Battle', callback_data: `pet:kaiju:join:${matchId}` },
        { text: '🤖 Start vs App', callback_data: `pet:kaiju:cpu:${matchId}` },
      ],
      [
        { text: '🎮 Web Card Game', url: `${SITE_URL}/games/kaiju-sticker-battle/` },
        { text: '🌕 Pet Menu', callback_data: 'pet:bag' },
      ],
    ],
  };
}

function buildPetKaijuCardReplyMarkup(match) {
  const matchId = String(match?.match_id || '');
  const rows = [];
  for (let i = 0; i < PET_KAIJU_CARDS.length; i += 2) {
    rows.push(PET_KAIJU_CARDS.slice(i, i + 2).map((card) => ({
      text: `🃏 ${card.name}`,
      callback_data: `pet:kaiju:card:${matchId}:${card.id}`,
    })));
  }
  rows.push([{ text: '🎮 Open Web Card Game', url: `${SITE_URL}/games/kaiju-sticker-battle/` }]);
  return { inline_keyboard: rows };
}

function formatPetKaijuCardList() {
  return PET_KAIJU_CARDS.map((card) => {
    const stats = PET_KAIJU_CATEGORIES.map((cat) => `${cat.label} ${card.stats[cat.key]}`).join(' | ');
    return `🃏 <code>${escapeHtml(card.id)}</code> — ${escapeHtml(card.name)}\n${escapeHtml(stats)}`;
  }).join('\n\n');
}

async function getActivePetKaijuMatch(db, chatId) {
  await db.prepare(`
    UPDATE telegram_pet_kaiju_matches
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = ? AND status IN ('open', 'selecting') AND updated_at < datetime('now', ?)
  `).bind(String(chatId), `-${PET_KAIJU_MATCH_TTL_MINUTES} minutes`).run().catch(() => {});
  const row = await db.prepare(`
    SELECT * FROM telegram_pet_kaiju_matches
    WHERE chat_id = ? AND status IN ('open', 'selecting')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(String(chatId)).first().catch(() => null);
  return serializePetKaijuMatch(row);
}

async function getPetKaijuMatch(db, matchId) {
  const row = await db.prepare(`
    SELECT * FROM telegram_pet_kaiju_matches
    WHERE match_id = ?
    LIMIT 1
  `).bind(String(matchId || '')).first().catch(() => null);
  return serializePetKaijuMatch(row);
}

async function createPetKaijuMatch(db, chatId, telegramId, mode = 'solo') {
  const matchId = buildPetKaijuMatchId();
  const status = mode === 'group' ? 'open' : 'selecting';
  await db.prepare(`
    INSERT INTO telegram_pet_kaiju_matches
      (id, match_id, chat_id, mode, status, player1_telegram_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), matchId, String(chatId), mode, status, String(telegramId)).run();
  return getPetKaijuMatch(db, matchId);
}

async function enqueuePetKaijuPlayer(db, chatId, telegramId) {
  await db.prepare(`
    INSERT INTO telegram_pet_kaiju_queue (id, chat_id, telegram_id, status)
    VALUES (?, ?, ?, 'waiting')
    ON CONFLICT(chat_id, telegram_id, status) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
  `).bind(crypto.randomUUID(), String(chatId), String(telegramId)).run().catch(() => {});
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM telegram_pet_kaiju_queue
    WHERE chat_id = ? AND status = 'waiting'
  `).bind(String(chatId)).first().catch(() => ({ count: 1 }));
  return Math.max(1, Math.floor(Number(row?.count || 1)));
}

async function getPetKaijuQueue(db, chatId, excluded = []) {
  const excludedSet = new Set(excluded.map(String));
  const rows = await db.prepare(`
    SELECT telegram_id
    FROM telegram_pet_kaiju_queue
    WHERE chat_id = ? AND status = 'waiting'
    ORDER BY queued_at ASC
    LIMIT ?
  `).bind(String(chatId), PET_KAIJU_QUEUE_LIMIT).all().catch(() => ({ results: [] }));
  return (rows?.results || []).map((row) => String(row.telegram_id || '')).filter((id) => id && !excludedSet.has(id));
}

async function awardPetKaijuPlayerResult(db, telegramId, match, outcome, rewards = {}) {
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = buildStablePetEventKey(['pet_kaiju', match.match_id, telegramId]);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', pet, xp_awarded: 0, pet_xp_awarded: 0 };

  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  let petXp = Math.max(0, Math.floor(Number(rewards.pet_xp || 0)));
  let communityXp = Math.max(0, Math.floor(Number(rewards.community_xp || 0)));
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;
  else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
  if (totals.day.community_xp >= PETS_DAILY_COMMUNITY_XP_CAP) communityXp = 0;
  else if (totals.day.community_xp + communityXp > PETS_DAILY_COMMUNITY_XP_CAP) communityXp = Math.max(0, PETS_DAILY_COMMUNITY_XP_CAP - totals.day.community_xp);

  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + Math.max(0, Number(rewards.moon_gold || 0)));
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + Math.max(0, Number(rewards.style_tokens || 0)));
  pet.happiness = clampPetStat(Number(pet.happiness || 0) + Math.max(0, Number(rewards.happiness || 0)));
  pet.energy = clampPetStat(Number(pet.energy || 0) - Math.max(0, Number(rewards.energy_cost || 0)));
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();

  await db.prepare(`
    INSERT INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, ?, 'kaiju_battle', ?, ?, ?, ?, ?, ?, 'accepted', ?, ?)
  `).bind(
    crypto.randomUUID(),
    telegramId,
    eventKey,
    communityXp,
    petXp,
    season.key,
    dayKey,
    weekKey,
    outcome,
    JSON.stringify({ source: 'telegram_kaiju', match_id: match.match_id, mode: match.mode, rewards }),
  ).run();
  if (communityXp > 0) await awardCommunityXp(db, telegramId, communityXp, 'pet_kaiju_battle', eventKey);
  await savePetProfile(db, pet);
  await db.prepare(`
    INSERT INTO telegram_pet_season_state
      (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id, season_key) DO UPDATE SET
      season_xp = season_xp + excluded.season_xp,
      weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
      daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
      daily_key = excluded.daily_key,
      weekly_key = excluded.weekly_key,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey).run();
  return { accepted: true, reason: outcome, xp_awarded: communityXp, pet_xp_awarded: petXp, pet };
}

async function finishPetKaijuMatch(db, match) {
  const player1Card = getPetKaijuCard(match.player1_card_key);
  const player2Card = match.mode === 'solo' ? getPetKaijuCard(match.cpu_card_key) : getPetKaijuCard(match.player2_card_key);
  if (!player1Card || !player2Card) return { accepted: false, reason: 'missing_cards', match };
  const category = PET_KAIJU_CATEGORIES.find((entry) => entry.key === match.category_key) || pickPetKaijuCategory();
  const resolved = resolvePetKaijuBattle(player1Card.id, player2Card.id, category.key);
  if (!resolved) return { accepted: false, reason: 'invalid_cards', match };
  const winnerTelegramId = resolved.result === 'player1_win'
    ? String(match.player1_telegram_id)
    : resolved.result === 'player2_win' && match.mode === 'group'
      ? String(match.player2_telegram_id)
      : null;
  const scoreJson = JSON.stringify({
    category,
    player1: { telegram_id: String(match.player1_telegram_id), card: player1Card.id, score: resolved.playerScore },
    opponent: { telegram_id: match.mode === 'group' ? String(match.player2_telegram_id) : 'app', card: player2Card.id, score: resolved.opponentScore },
    result: resolved.result,
  });
  await db.prepare(`
    UPDATE telegram_pet_kaiju_matches
    SET status = 'completed',
        category_key = ?,
        roll = ?,
        winner_telegram_id = ?,
        result = ?,
        score_json = ?,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE match_id = ? AND status IN ('open', 'selecting')
  `).bind(category.key, category.roll, winnerTelegramId, resolved.result, scoreJson, match.match_id).run();

  const player1Outcome = resolved.result === 'player1_win' ? 'kaiju_win' : resolved.result === 'draw' ? 'kaiju_draw' : 'kaiju_loss';
  const player2Outcome = resolved.result === 'player2_win' ? 'kaiju_win' : resolved.result === 'draw' ? 'kaiju_draw' : 'kaiju_loss';
  const winRewards = { pet_xp: 38, community_xp: 8, moon_gold: 18, style_tokens: 1, happiness: 5, energy_cost: 6 };
  const drawRewards = { pet_xp: 22, community_xp: 4, moon_gold: 10, style_tokens: 1, happiness: 3, energy_cost: 5 };
  const lossRewards = { pet_xp: 12, community_xp: 2, moon_gold: 5, style_tokens: 0, happiness: 1, energy_cost: 4 };
  await awardPetKaijuPlayerResult(db, String(match.player1_telegram_id), match, player1Outcome, player1Outcome === 'kaiju_win' ? winRewards : player1Outcome === 'kaiju_draw' ? drawRewards : lossRewards);
  if (match.mode === 'group' && match.player2_telegram_id) {
    await awardPetKaijuPlayerResult(db, String(match.player2_telegram_id), match, player2Outcome, player2Outcome === 'kaiju_win' ? winRewards : player2Outcome === 'kaiju_draw' ? drawRewards : lossRewards);
  }
  await db.prepare(`
    UPDATE telegram_pet_kaiju_queue
    SET status = 'played', updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = ? AND telegram_id IN (?, ?) AND status = 'waiting'
  `).bind(String(match.chat_id), String(match.player1_telegram_id), String(match.player2_telegram_id || '')).run().catch(() => {});
  const queue = await getPetKaijuQueue(db, match.chat_id, [match.player1_telegram_id, match.player2_telegram_id || '']);
  return { accepted: true, reason: 'kaiju_completed', match: await getPetKaijuMatch(db, match.match_id), resolved, queue };
}

async function processPetAction(db, telegramId, action, options = {}) {
  const normalizedAction = normalizePetAction(action);
  if (!normalizedAction && action !== 'adopt' && action !== 'rename') {
    return { accepted: false, reason: 'invalid_action', xp_awarded: 0, pet_xp_awarded: 0 };
  }

  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:${normalizedAction || action}:${telegramId}:${Date.now()}`).slice(0, 120);

  if (action === 'adopt') {
    const pet = await getOrCreatePetProfile(db, telegramId, options);
    await savePetProfile(db, pet);
    return { accepted: true, reason: 'adopted', xp_awarded: 0, pet_xp_awarded: 0, pet };
  }

  let pet = await getPetProfile(db, telegramId);
  if (!pet) {
    return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  }

  if (action === 'rename') {
    const petName = normalizePetName(options.pet_name);
    if (!petName) return { accepted: false, reason: 'invalid_pet_name', pet };
    pet.pet_name = petName;
    await savePetProfile(db, pet);
    return { accepted: true, reason: 'renamed', xp_awarded: 0, pet_xp_awarded: 0, pet };
  }

  const existing = await db.prepare(`
    SELECT id, xp_awarded, pet_xp_awarded FROM telegram_pet_events
    WHERE telegram_id = ? AND event_key = ?
    LIMIT 1
  `).bind(telegramId, eventKey).first().catch(() => null);
  if (existing) {
    return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0, pet };
  }

  const lastAction = await db.prepare(`
    SELECT created_at FROM telegram_pet_events
    WHERE telegram_id = ? AND event_type = ? AND status = 'accepted'
    ORDER BY created_at DESC LIMIT 1
  `).bind(telegramId, normalizedAction).first().catch(() => null);
  if (lastAction?.created_at) {
    const elapsedSeconds = (now.getTime() - new Date(lastAction.created_at).getTime()) / 1000;
    if (elapsedSeconds < PETS_ACTION_COOLDOWN_SECONDS) {
      return {
        accepted: false,
        reason: 'cooldown',
        retry_after_seconds: Math.max(1, Math.ceil(PETS_ACTION_COOLDOWN_SECONDS - elapsedSeconds)),
        xp_awarded: 0,
        pet_xp_awarded: 0,
        pet,
      };
    }
  }

  const rule = { ...PET_ACTIONS[normalizedAction] };
  if (normalizedAction === 'train' && Number(pet.energy || 0) < 18) {
    return { accepted: false, reason: 'pet_tired', xp_awarded: 0, pet_xp_awarded: 0, pet };
  }

  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  let communityXp = rule.community_xp;
  let petXp = rule.pet_xp;
  const tokenRewards = {
    moon_gold: clampPetCurrency(rule.gold),
    moon_crystals: clampPetCurrency(rule.crystals),
    style_tokens: clampPetCurrency(rule.style_tokens),
  };
  applyPetItemActionBonuses(pet, normalizedAction, rule, {
    get pet_xp() { return petXp; },
    set pet_xp(value) { petXp = value; },
    get moon_gold() { return tokenRewards.moon_gold; },
    set moon_gold(value) { tokenRewards.moon_gold = clampPetCurrency(value); },
    get style_tokens() { return tokenRewards.style_tokens; },
    set style_tokens(value) { tokenRewards.style_tokens = clampPetCurrency(value); },
  });
  let reason = 'accepted';
  if (totals.day.community_xp >= PETS_DAILY_COMMUNITY_XP_CAP) {
    communityXp = 0;
    reason = 'community_daily_cap_reached';
  } else if (totals.day.community_xp + communityXp > PETS_DAILY_COMMUNITY_XP_CAP) {
    communityXp = Math.max(0, PETS_DAILY_COMMUNITY_XP_CAP - totals.day.community_xp);
    reason = 'community_daily_cap_clamped';
  }
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) {
    petXp = 0;
    reason = reason === 'accepted' ? 'pet_daily_cap_reached' : reason;
  } else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) {
    petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
    reason = reason === 'accepted' ? 'pet_daily_cap_clamped' : reason;
  }

  pet.hunger = clampPetStat(Number(pet.hunger || 0) + rule.hunger);
  pet.happiness = clampPetStat(Number(pet.happiness || 0) + rule.happiness);
  pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) + rule.cleanliness);
  pet.energy = clampPetStat(Number(pet.energy || 0) + rule.energy);
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + tokenRewards.moon_gold);
  pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) + tokenRewards.moon_crystals);
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + tokenRewards.style_tokens);
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();

  await db.prepare(`
    INSERT INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?)
  `).bind(
    crypto.randomUUID(),
    telegramId,
    normalizedAction,
    eventKey,
    communityXp,
    petXp,
    season.key,
    dayKey,
    weekKey,
    reason,
    JSON.stringify({ source: options.source || 'telegram_bot', rewards: tokenRewards }),
  ).run();

  if (communityXp > 0) {
    await awardCommunityXp(db, telegramId, communityXp, `pet_${normalizedAction}`, eventKey);
  }

  await savePetProfile(db, pet);
  await db.prepare(`
    INSERT INTO telegram_pet_season_state
      (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id, season_key) DO UPDATE SET
      season_xp = season_xp + excluded.season_xp,
      weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
      daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
      daily_key = excluded.daily_key,
      weekly_key = excluded.weekly_key,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey).run();

  return { accepted: true, reason, action: normalizedAction, xp_awarded: communityXp, pet_xp_awarded: petXp, pet, season };
}

async function processPetShopPurchase(db, telegramId, itemKey, options = {}) {
  const key = normalizePetShopItemKey(itemKey);
  if (!key) return { accepted: false, reason: 'invalid_shop_item', xp_awarded: 0, pet_xp_awarded: 0 };
  const item = PET_SHOP_ITEMS[key];
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:buy:${telegramId}:${key}:${Date.now()}`).slice(0, 120);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  if (getPetLevel(pet.pet_xp) < item.min_level) return { accepted: false, reason: 'level_locked', item, pet };
  if (String(pet[`equipped_${item.slot}`] || '') === item.key) return { accepted: false, reason: 'already_equipped', item, pet };
  if (!canAffordPetItem(pet, item)) return { accepted: false, reason: 'not_enough_pet_currency', item, pet };

  const cost = item.cost || {};
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) - (cost.moon_gold || 0));
  pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) - (cost.moon_crystals || 0));
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) - (cost.style_tokens || 0));
  pet[`equipped_${item.slot}`] = item.key;
  pet.last_decay_at = now.toISOString();

  await db.prepare(`
    INSERT INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, ?, 'buy', ?, 0, 0, ?, ?, ?, 'accepted', 'shop_purchase', ?)
  `).bind(
    crypto.randomUUID(),
    telegramId,
    eventKey,
    season.key,
    dayKey,
    weekKey,
    JSON.stringify({ source: options.source || 'telegram_bot', item_key: item.key, slot: item.slot, cost }),
  ).run();

  await savePetProfile(db, pet);
  return { accepted: true, reason: 'shop_purchase', item, pet, xp_awarded: 0, pet_xp_awarded: 0 };
}

async function processPetGoldTrade(db, telegramId, wagerRaw, options = {}) {
  const wagerText = String(wagerRaw ?? '').trim();
  if (!/^\d+$/.test(wagerText)) {
    return { accepted: false, reason: 'invalid_trade_wager', xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const wager = Number(wagerText);
  if (!Number.isFinite(wager) || wager < PET_TRADE_MIN_GOLD || wager > PET_TRADE_MAX_GOLD) {
    return { accepted: false, reason: 'invalid_trade_wager', xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:trade:${telegramId}:${Date.now()}`).slice(0, 120);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  if (clampPetCurrency(pet.moon_gold) < wager) return { accepted: false, reason: 'not_enough_moon_gold', pet };

  const lastTrade = await db.prepare(`
    SELECT created_at FROM telegram_pet_events
    WHERE telegram_id = ? AND event_type = 'trade' AND status = 'accepted'
    ORDER BY created_at DESC LIMIT 1
  `).bind(telegramId).first().catch(() => null);
  if (lastTrade?.created_at) {
    const elapsedSeconds = (now.getTime() - new Date(lastTrade.created_at).getTime()) / 1000;
    if (elapsedSeconds < PET_TRADE_COOLDOWN_SECONDS) {
      return {
        accepted: false,
        reason: 'trade_cooldown',
        retry_after_seconds: Math.max(1, Math.ceil(PET_TRADE_COOLDOWN_SECONDS - elapsedSeconds)),
        xp_awarded: 0,
        pet_xp_awarded: 0,
        pet,
      };
    }
  }

  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  const roll = Math.random();
  const won = roll >= 0.46;
  const goldDelta = won ? Math.max(6, Math.floor(wager * 0.75)) : -wager;
  const crystalDelta = won && wager >= 50 ? 1 : 0;
  let petXp = won ? Math.max(3, Math.floor(wager / 8)) : 1;
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) {
    petXp = 0;
  } else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) {
    petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
  }
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + goldDelta);
  pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) + crystalDelta);
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();

  await db.prepare(`
    INSERT INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, ?, 'trade', ?, 0, ?, ?, ?, ?, 'accepted', ?, ?)
  `).bind(
    crypto.randomUUID(),
    telegramId,
    eventKey,
    petXp,
    season.key,
    dayKey,
    weekKey,
    won ? 'trade_won' : 'trade_lost',
    JSON.stringify({ source: options.source || 'telegram_bot', wager, won, gold_delta: goldDelta, crystal_delta: crystalDelta, roll }),
  ).run();

  await savePetProfile(db, pet);
  await db.prepare(`
    INSERT INTO telegram_pet_season_state
      (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id, season_key) DO UPDATE SET
      season_xp = season_xp + excluded.season_xp,
      weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
      daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
      daily_key = excluded.daily_key,
      weekly_key = excluded.weekly_key,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey).run();

  return { accepted: true, reason: won ? 'trade_won' : 'trade_lost', wager, won, gold_delta: goldDelta, crystal_delta: crystalDelta, xp_awarded: 0, pet_xp_awarded: petXp, pet };
}

async function processPetAdventure(db, telegramId, adventureKeyRaw, options = {}) {
  const requestedChoice = normalizePetAdventureChoice(adventureKeyRaw);
  const encounterKey = String(options.encounter_key || options.encounterKey || '').trim();
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const encounter = resolvePetAdventureEncounter(encounterKey || options.event_key || options.eventKey) || options.encounter || null;
  if (!encounter) return { accepted: false, reason: 'adventure_unavailable', xp_awarded: 0, pet_xp_awarded: 0 };
  const choice = requestedChoice
    ? encounter.choices.find((entry) => entry.key === requestedChoice) || null
    : null;
  if (!choice) return { accepted: false, reason: 'invalid_adventure_choice', encounter, xp_awarded: 0, pet_xp_awarded: 0 };
  const eventKey = String(options.event_key || `pet:adventure:${telegramId}:${encounter.key}:${choice.key}:${Date.now()}`).slice(0, 120);
  const duplicate = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0, encounter, choice };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0, encounter, choice };
  const available = petAdventuresForPet(pet);
  const adventure = available.find((item) => item.key === encounter.key) || null;
  if (!adventure) return { accepted: false, reason: 'adventure_unavailable', encounter, choice, pet };
  if (!adventure.unlocked) return { accepted: false, reason: 'level_locked', encounter, choice, adventure, pet };
  if (clampPetStat(pet.energy) < adventure.energy_cost) return { accepted: false, reason: 'pet_tired', encounter, choice, adventure, pet };

  const lastAdventure = await db.prepare(`
    SELECT created_at FROM telegram_pet_events
    WHERE telegram_id = ? AND event_type = 'adventure' AND status = 'accepted'
    ORDER BY created_at DESC LIMIT 1
  `).bind(telegramId).first().catch(() => null);
  if (lastAdventure?.created_at) {
    const elapsedSeconds = (now.getTime() - new Date(lastAdventure.created_at).getTime()) / 1000;
    if (elapsedSeconds < PET_ADVENTURE_COOLDOWN_SECONDS) {
      return {
        accepted: false,
        reason: 'adventure_cooldown',
        retry_after_seconds: Math.max(1, Math.ceil(PET_ADVENTURE_COOLDOWN_SECONDS - elapsedSeconds)),
        xp_awarded: 0,
        pet_xp_awarded: 0,
        encounter,
        choice,
        adventure,
        pet,
      };
    }
  }

  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  const outcome = pickPetRandomEventOutcome(choice);
  const applied = applyPetRandomEventDeltas(
    pet,
    { ...outcome.rewards },
    outcome.costs,
  );
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) {
    pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) - (applied.rewardsApplied.pet_xp || 0)));
    applied.rewardsApplied.pet_xp = 0;
    applied.deltas.pet_xp = 0;
  } else if (totals.day.pet_xp + (applied.rewardsApplied.pet_xp || 0) > PETS_DAILY_PET_XP_CAP) {
    const clampedPetXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
    pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) - ((applied.rewardsApplied.pet_xp || 0) - clampedPetXp)));
    applied.rewardsApplied.pet_xp = clampedPetXp;
    applied.deltas.pet_xp = clampedPetXp;
  }

  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();
  await db.prepare(`
    INSERT INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, ?, 'adventure', ?, 0, ?, ?, ?, ?, 'accepted', ?, ?)
  `).bind(
    crypto.randomUUID(),
    telegramId,
    eventKey,
    applied.deltas.pet_xp,
    season.key,
    dayKey,
    weekKey,
    `${encounter.key}:${choice.key}:${outcome.kind}`,
    JSON.stringify({
      source: options.source || 'telegram_bot',
      encounter_key: encounter.key,
      encounter_title: encounter.title,
      choice_key: choice.key,
      choice_label: choice.label,
      result_kind: outcome.kind,
      rewards: applied.rewardsApplied,
      costs: applied.costsApplied,
      copy: outcome.copy,
    }),
  ).run();

  await savePetProfile(db, pet);
  await db.prepare(`
    INSERT INTO telegram_pet_season_state
      (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id, season_key) DO UPDATE SET
      season_xp = season_xp + excluded.season_xp,
      weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
      daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
      daily_key = excluded.daily_key,
      weekly_key = excluded.weekly_key,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, season.key, applied.deltas.pet_xp, applied.deltas.pet_xp, applied.deltas.pet_xp, dayKey, weekKey).run();

  return {
    accepted: true,
    reason: `${encounter.key}:${choice.key}`,
    encounter,
    choice,
    result_copy: outcome.copy,
    applied,
    xp_awarded: 0,
    pet_xp_awarded: applied.deltas.pet_xp,
    pet,
  };
}

function serializePet(pet) {
  if (!pet) return null;
  const decayed = applyPetDecay({ ...pet });
  return {
    telegram_id: decayed.telegram_id,
    pet_name: decayed.pet_name,
    species: decayed.species,
    stage: getPetStage(decayed.pet_xp),
    pet_xp: Number(decayed.pet_xp || 0),
    level: getPetLevel(decayed.pet_xp),
    hunger: clampPetStat(decayed.hunger),
    happiness: clampPetStat(decayed.happiness),
    cleanliness: clampPetStat(decayed.cleanliness),
    energy: clampPetStat(decayed.energy),
    health: calculatePetHealth(decayed),
    moon_gold: clampPetCurrency(decayed.moon_gold),
    moon_crystals: clampPetCurrency(decayed.moon_crystals),
    style_tokens: clampPetCurrency(decayed.style_tokens),
    equipped_food: decayed.equipped_food || null,
    equipped_toy: decayed.equipped_toy || null,
    equipped_outfit: decayed.equipped_outfit || null,
    streak_days: Number(decayed.streak_days || 0),
    last_active_day: decayed.last_active_day || null,
    updated_at: decayed.updated_at || null,
  };
}

async function buildPetMissions(db, telegramId) {
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const events = await db.prepare(`
    SELECT event_type, COUNT(*) AS count
    FROM telegram_pet_events
    WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
    GROUP BY event_type
  `).bind(telegramId, dayKey).all().catch(() => ({ results: [] }));
  const counts = Object.fromEntries((events.results || []).map((row) => [row.event_type, Number(row.count || 0)]));
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const fullCareDone = ['feed', 'play', 'clean'].every((key) => counts[key] > 0);
  return {
    day_key: dayKey,
    week_key: weekKey,
    season,
    balances: pet ? {
      moon_gold: clampPetCurrency(pet.moon_gold),
      moon_crystals: clampPetCurrency(pet.moon_crystals),
      style_tokens: clampPetCurrency(pet.style_tokens),
    } : null,
    daily: [
      { key: `pet-daily-feed:${dayKey}`, title: 'Feed your Moonpet', completed: Number(counts.feed || 0) > 0 },
      { key: `pet-daily-train:${dayKey}`, title: 'Train once', completed: Number(counts.train || 0) > 0 },
      { key: `pet-daily-care-set:${dayKey}`, title: 'Complete feed, play and clean', completed: fullCareDone },
      { key: `pet-daily-trade:${dayKey}`, title: 'Run one Moon Gold trade', completed: Number(counts.trade || 0) > 0 },
      { key: `pet-daily-shop:${dayKey}`, title: 'Buy or equip one pet upgrade', completed: Number(counts.buy || 0) > 0 },
      { key: `pet-daily-adventure:${dayKey}`, title: 'Run one pet adventure', completed: Number(counts.adventure || 0) + Number(counts.run_extract || 0) + Number(counts.run_complete || 0) > 0 },
      { key: `pet-daily-bank:${dayKey}`, title: 'Bank 50 Moon Gold', completed: clampPetCurrency(pet?.moon_gold) >= 50 },
    ],
  };
}

function getPetNeedsAlert(pet, missions = null) {
  const p = serializePet(pet);
  if (!p) return null;
  const unfinishedMission = missions?.daily?.find((mission) => !mission.completed);
  if (p.health <= 45) return { reason: 'health_low', text: `${p.pet_name} health is low. Run /pet, then feed, clean, sleep or play.` };
  if (p.hunger >= 75) return { reason: 'hungry', text: `${p.pet_name} is hungry. Use /feed before health drops.` };
  if (p.cleanliness <= 35) return { reason: 'dirty', text: `${p.pet_name} needs cleaning. Use /clean to restore cleanliness.` };
  if (p.energy <= 25) return { reason: 'tired', text: `${p.pet_name} is tired. Use /sleep before training or adventures.` };
  if (p.happiness <= 35) return { reason: 'lonely', text: `${p.pet_name} wants attention. Use /play to lift happiness.` };
  if (unfinishedMission) return { reason: 'mission_open', text: `${p.pet_name} still has a daily mission open: ${unfinishedMission.title}. Use /petmissions.` };
  return null;
}

async function setPetNotificationPreference(db, telegramId, enabled) {
  await db.prepare(`
    INSERT INTO telegram_pet_notification_settings (telegram_id, enabled)
    VALUES (?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, enabled ? 1 : 0).run();
  return { telegram_id: telegramId, enabled: enabled ? 1 : 0 };
}

async function getPetNotificationPreference(db, telegramId) {
  const row = await db.prepare(`
    SELECT telegram_id, enabled, last_notified_at, last_reason
    FROM telegram_pet_notification_settings
    WHERE telegram_id = ?
  `).bind(telegramId).first().catch(() => null);
  return row || { telegram_id: telegramId, enabled: 0, last_notified_at: null, last_reason: null };
}

async function runPetNeedsNotifications(env, options = {}) {
  const tok = env.TELEGRAM_BOT_TOKEN;
  if (!tok) return { ok: false, error: 'telegram_bot_token_missing' };
  const limit = Math.min(Math.max(Number(options.limit || PET_NOTIFICATION_BATCH_LIMIT), 1), 100);
  const rows = await env.DB.prepare(`
    SELECT p.*, n.last_notified_at, n.last_reason
    FROM telegram_pet_profiles p
    JOIN telegram_pet_notification_settings n ON n.telegram_id = p.telegram_id
    WHERE n.enabled = 1
      AND (n.last_notified_at IS NULL OR n.last_notified_at <= datetime('now', ?))
    ORDER BY p.health ASC, p.updated_at ASC
    LIMIT ?
  `).bind(`-${PET_NOTIFICATION_COOLDOWN_MINUTES} minutes`, limit).all().catch(() => ({ results: [] }));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows.results || []) {
    const pet = applyPetDecay({ ...row });
    const missions = await buildPetMissions(env.DB, String(row.telegram_id)).catch(() => null);
    const alert = getPetNeedsAlert(pet, missions);
    if (!alert) {
      skipped += 1;
      continue;
    }
    const result = await sendTelegramMessage(tok, String(row.telegram_id), `<b>Crypto Moonboy Pet Update</b>\n${escapeHtml(alert.text)}\n\nNotifications: /petnotify off\nStatus: /pet`, { reply_markup: petReplyMarkup() });
    if (result?.ok) {
      sent += 1;
      await env.DB.prepare(`
        UPDATE telegram_pet_notification_settings
        SET last_notified_at = CURRENT_TIMESTAMP, last_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `).bind(alert.reason, String(row.telegram_id)).run().catch(() => {});
    } else {
      failed += 1;
    }
  }
  return { ok: true, considered: rows.results?.length || 0, sent, skipped, failed };
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
const WIKI_ENGAGEMENT_TABLES = [
  'wiki_comments',
  'wiki_comment_votes',
  'wiki_page_likes',
  'wiki_citation_votes',
  'wiki_mission_completions',
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

async function ensurePlayerStateTables(db, responseHeaders = {}) {
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
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...responseHeaders },
        }),
      };
    }
  }
  return null; // all tables present
}

async function ensureWikiEngagementTables(db, responseHeaders = {}) {
  for (const tableName of WIKI_ENGAGEMENT_TABLES) {
    const row = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    ).bind(tableName).first().catch(() => null);
    if (!row?.name) {
      return {
        _isWikiEngagementUnavailable: true,
        tableName,
        response: new Response(JSON.stringify({
          ok: false,
          error: 'wiki_engagement_unavailable',
          reason: `migration_pending:${tableName}`,
          message: 'Wiki engagement tables are not yet configured. Apply migration 029.',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...responseHeaders },
        }),
      };
    }
  }
  return null;
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

async function ensureBattleChamberTables(db, responseHeaders = {}) {
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
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...responseHeaders },
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
    const corsHeaders = buildCorsHeaders(request, env);
    const json = makeJsonResponder(corsHeaders);
    const err = makeErrorResponder(corsHeaders);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── GET /health ────────────────────────────────────────────────────────
    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true });
    }

    // ── GET /sam/status ────────────────────────────────────────────────────
    if (path === '/sam/status' && request.method === 'GET') {
      return json({ ok: true, message: 'SAM active and monitoring the wiki.' });
    }

    if (path === '/api/wax' || path.startsWith('/api/wax/')) {
      return handleWaxBridgeRoute(request, env, corsHeaders);
    }

    if (path === '/daily-loop/state') {
      const dailyLoopResponse = await handleDailyLoopStateRoute(request, env, {
        json,
        err,
        verifyTelegramAuth,
        upsertTelegramUser,
        logApiFailure,
      });
      if (dailyLoopResponse) return dailyLoopResponse;
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
      const missingAdminConfig = ensureAdminGrantConfigured(env);
      if (missingAdminConfig.length) {
        logApiFailure('admin_blocktopia_grant_xp_not_configured', { missing: missingAdminConfig });
        return err('Admin grant route is not configured', 503);
      }
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }

      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);

      const telegramId = String(body?.telegram_id || '').trim();
      const adminTelegramId = String(verified.telegramId || '').trim();
      const hasXpInput = body && Object.prototype.hasOwnProperty.call(body, 'xp');
      const hasGemsInput = body && Object.prototype.hasOwnProperty.call(body, 'gems');
      const rawXp = hasXpInput ? Number(body?.xp) : null;
      const rawGems = hasGemsInput ? Number(body?.gems) : null;
      const reason = String(body?.reason || '').trim().slice(0, 280);

      if (!telegramId || !/^\d{5,20}$/.test(telegramId)) {
        return err('Valid target telegram_id is required', 400);
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
      const missingAdminConfig = ensureAdminGrantConfigured(env);
      if (missingAdminConfig.length) {
        logApiFailure('admin_arcade_grant_xp_not_configured', { missing: missingAdminConfig });
        return err('Admin grant route is not configured', 503);
      }
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }

      const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verified.error) return err(verified.error, verified.status || 401);

      const telegramId = String(body?.telegram_id || '').trim();
      const adminTelegramId = String(verified.telegramId || '').trim();
      const rawXp = body && Object.prototype.hasOwnProperty.call(body, 'xp') ? Number(body.xp) : null;
      const reason = String(body?.reason || '').trim().slice(0, 280);

      if (!telegramId || !/^\d{5,20}$/.test(telegramId)) {
        return err('Valid target telegram_id is required', 400);
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
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/telegram/auth', body, corsHeaders); if (_rateLimit) return _rateLimit; }
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

    // ── Crypto Moonboys Pets API ──────────────────────────────────────────
    if (path === '/telegram-pets/season/current' && request.method === 'GET') {
      return json({ season: getPetSeasonInfo(new Date()) });
    }

    if (path === '/telegram-pets/state' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id required');
      const pet = await getPetProfile(env.DB, telegramId).catch(() => null);
      if (!pet) return err('Pet profile not found', 404);
      return json({ pet: serializePet(pet), missions: await buildPetMissions(env.DB, telegramId) });
    }

    if (path === '/telegram-pets/inventory' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id required');
      const pet = await getPetProfile(env.DB, telegramId).catch(() => null);
      if (!pet) return err('Pet profile not found', 404);
      return json({ pet: serializePet(pet), inventory: await getPetInventory(env.DB, telegramId) });
    }

    if (path === '/telegram-pets/missions' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id required');
      return json({ missions: await buildPetMissions(env.DB, telegramId) });
    }

    if (path === '/telegram-pets/shop' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      const pet = /^\d{1,20}$/.test(telegramId) ? await getPetProfile(env.DB, telegramId).catch(() => null) : null;
      return json({
        currencies: ['moon_gold', 'moon_crystals', 'style_tokens'],
        pet: serializePet(pet),
        items: petShopItemsForPet(pet),
        usable_items: Object.values(PET_INVENTORY_ITEMS),
        jobs: Object.values(PET_JOBS),
      });
    }

    if (path === '/telegram-pets/activity' && request.method === 'GET') {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 50);
      const rows = await env.DB.prepare(`
        SELECT e.event_type, e.xp_awarded, e.pet_xp_awarded, e.reason, e.created_at,
               p.pet_name, p.stage, u.username, u.first_name, u.last_name
        FROM telegram_pet_events e
        LEFT JOIN telegram_pet_profiles p ON p.telegram_id = e.telegram_id
        LEFT JOIN telegram_users u ON u.telegram_id = e.telegram_id
        WHERE e.status = 'accepted'
        ORDER BY e.created_at DESC
        LIMIT ?
      `).bind(limit).all().catch(() => ({ results: [] }));
      return json({ items: (rows.results || []).map((row) => ({
        text: `${displayNameFromRow(row)} ${row.event_type} ${row.pet_name || 'Moonpet'} (+${row.pet_xp_awarded || 0} pet XP, +${row.xp_awarded || 0} XP)`,
        event_type: row.event_type,
        pet_name: row.pet_name || 'Moonpet',
        stage: row.stage || 'egg',
        xp_awarded: Number(row.xp_awarded || 0),
        pet_xp_awarded: Number(row.pet_xp_awarded || 0),
        created_at: row.created_at,
        time_ago: timeAgo(row.created_at),
      })) });
    }

    if (path === '/telegram-pets/leaderboard' && request.method === 'GET') {
      const period = String(url.searchParams.get('period') || 'seasonal').toLowerCase();
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '25', 10), 1), 100);
      const now = new Date();
      const dayKey = getPetDayKey(now);
      const weekKey = getPetWeekKey(now);
      const season = getPetSeasonInfo(now);
      let rows;
      if (period === 'daily') {
        rows = await env.DB.prepare(`
          SELECT e.telegram_id, SUM(e.pet_xp_awarded) AS pet_xp, p.pet_name, p.stage, p.level, p.streak_days, p.updated_at,
                 u.username, u.first_name, u.last_name
          FROM telegram_pet_events e
          LEFT JOIN telegram_pet_profiles p ON p.telegram_id = e.telegram_id
          LEFT JOIN telegram_users u ON u.telegram_id = e.telegram_id
          WHERE e.day_key = ? AND e.status = 'accepted'
          GROUP BY e.telegram_id
          ORDER BY pet_xp DESC
          LIMIT ?
        `).bind(dayKey, limit).all().catch(() => ({ results: [] }));
      } else if (period === 'weekly') {
        rows = await env.DB.prepare(`
          SELECT e.telegram_id, SUM(e.pet_xp_awarded) AS pet_xp, p.pet_name, p.stage, p.level, p.streak_days, p.updated_at,
                 u.username, u.first_name, u.last_name
          FROM telegram_pet_events e
          LEFT JOIN telegram_pet_profiles p ON p.telegram_id = e.telegram_id
          LEFT JOIN telegram_users u ON u.telegram_id = e.telegram_id
          WHERE e.week_key = ? AND e.status = 'accepted'
          GROUP BY e.telegram_id
          ORDER BY pet_xp DESC
          LIMIT ?
        `).bind(weekKey, limit).all().catch(() => ({ results: [] }));
      } else if (period === 'all_time') {
        rows = await env.DB.prepare(`
          SELECT p.telegram_id, p.pet_xp, p.pet_name, p.stage, p.level, p.streak_days, p.updated_at,
                 u.username, u.first_name, u.last_name
          FROM telegram_pet_profiles p
          LEFT JOIN telegram_users u ON u.telegram_id = p.telegram_id
          ORDER BY p.pet_xp DESC
          LIMIT ?
        `).bind(limit).all().catch(() => ({ results: [] }));
      } else {
        rows = await env.DB.prepare(`
          SELECT s.telegram_id, s.season_xp AS pet_xp, p.pet_name, p.stage, p.level, p.streak_days, p.updated_at,
                 u.username, u.first_name, u.last_name
          FROM telegram_pet_season_state s
          LEFT JOIN telegram_pet_profiles p ON p.telegram_id = s.telegram_id
          LEFT JOIN telegram_users u ON u.telegram_id = s.telegram_id
          WHERE s.season_key = ?
          ORDER BY s.season_xp DESC
          LIMIT ?
        `).bind(season.key, limit).all().catch(() => ({ results: [] }));
      }
      return json({
        period,
        season,
        entries: (rows.results || []).map((row, index) => ({
          rank: index + 1,
          display_name: displayNameFromRow(row),
          username: row.username || null,
          pet_name: row.pet_name || 'Moonpet',
          stage: row.stage || 'egg',
          level: Number(row.level || 1),
          pet_xp: Number(row.pet_xp || 0),
          streak_days: Number(row.streak_days || 0),
          last_active_label: timeAgo(row.updated_at),
        })),
      });
    }

    if (path === '/telegram-pets/action' && request.method === 'POST') {
      if (!verifyPetsBotSecret(request, env)) {
        return err('pet bot secret required', 401);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return err('invalid json', 400);
      }
      const user = body?.user || {};
      const telegramId = String(body?.telegram_id || user.id || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id required');
      await upsertTelegramUser(env.DB, {
        id: telegramId,
        username: user.username || body.username || null,
        first_name: user.first_name || body.first_name || null,
        last_name: user.last_name || body.last_name || null,
      });
      let result;
      if (body.action === 'buy') {
        result = await processPetShopPurchase(env.DB, telegramId, body.item_key, {
          event_key: body.event_key,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'trade') {
        result = await processPetGoldTrade(env.DB, telegramId, body.wager, {
          event_key: body.event_key,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'adventure') {
        result = await processPetAdventure(env.DB, telegramId, body.adventure_key, {
          event_key: body.event_key,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'run') {
        result = await startOrResumePetRun(env.DB, telegramId, {
          run_id: body.run_id,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'run_step') {
        result = await processPetRunStep(env.DB, telegramId, body.run_id, body.choice_key, {
          event_key: body.event_key,
          expected_step_index: body.expected_step_index,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'run_extract') {
        result = await processPetRunExtract(env.DB, telegramId, body.run_id, {
          event_key: body.event_key,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'use_item') {
        result = await processPetUseItem(env.DB, telegramId, body.item_key, {
          event_key: body.event_key,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'work') {
        result = await processPetJob(env.DB, telegramId, body.job_key, {
          event_key: body.event_key,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'daily_chest') {
        result = await processPetDailyChest(env.DB, telegramId, {
          event_key: body.event_key,
          source: 'telegram_pets_api',
        });
      } else if (body.action === 'random_event') {
        result = await processPetRandomEvent(env.DB, telegramId, body.choice, {
          event_key: body.event_key,
          source: 'telegram_pets_api',
        });
      } else {
        result = await processPetAction(env.DB, telegramId, body.action, {
          event_key: body.event_key,
          pet_name: body.pet_name,
          species: body.species,
          source: 'telegram_pets_api',
        });
      }
      return json({ ...result, pet: serializePet(result.pet) }, result.accepted ? 200 : 409);
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
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/telegram/link', null, corsHeaders, { includeTelegram: false }); if (_rateLimit) return _rateLimit; }
      if (!(await isAuthorizedByAdminSecret(request, env))) {
        logApiFailure('telegram_link_token_mint_denied', {
          hasAdminSecret: !!String(env.ADMIN_SECRET || '').trim(),
          hasHeaderSecret: !!readAdminSecret(request),
        });
        return err('Unauthorized', 401);
      }

      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/telegram/link', body, corsHeaders, { includeIp: false }); if (_rateLimit) return _rateLimit; }
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
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/telegram/link/confirm', null, corsHeaders); if (_rateLimit) return _rateLimit; }
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
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/telegram/link/confirm', body, corsHeaders); if (_rateLimit) return _rateLimit; }

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
      const requestedTelegramId = String(
        url.searchParams.get('telegram_id')
        || requestBody?.telegram_id
        || ''
      ).trim();
      if (
        restoreEvidence?.telegramId
        && requestedTelegramId
        && String(restoreEvidence.telegramId) !== requestedTelegramId
      ) {
        return err('Telegram auth does not match requested user', 401);
      }
      const telegramId = String(
        restoreEvidence?.telegramId
        || requestedTelegramId
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
        const canRestoreSignedAuth = request.method === 'POST'
          && !!restoreEvidence
          && String(restoreEvidence.telegramId || '') === String(user.telegram_id || '');
        const signedAuthPayload = (linked && canRestoreSignedAuth)
          ? await buildSignedTelegramAuthPayload({
            id: String(user.telegram_id),
            username: user.username || null,
            first_name: user.first_name || null,
            last_name: user.last_name || null,
            photo_url: null,
          }, env.TELEGRAM_BOT_TOKEN, restoreEvidence?.authPayload?.auth_date)
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
          ...(signedAuthPayload ? { telegram_auth: signedAuthPayload } : {}),
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
    if (path === '/comments' && request.method === 'GET') {
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/comments', null, corsHeaders); if (_rateLimit) return _rateLimit; }
      const pageId = normalizeWikiPageId(url.searchParams.get('page_id'));
      if (!pageId) return err('page_id required', 400);
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 50);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const rows = await env.DB.prepare(`
          SELECT id, page_id, telegram_id, name, email_hash, avatar_url, telegram_username,
                 discord_username, text, status, votes_up, votes_down, created_at
          FROM wiki_comments
          WHERE page_id = ? AND status = 'approved'
          ORDER BY created_at DESC
          LIMIT ?
        `).bind(pageId, limit).all();
        return json({
          ok: true,
          page_id: pageId,
          comments: (rows.results || []).map((comment) => ({
            ...comment,
            time_ago: timeAgo(comment.created_at),
          })),
        });
      } catch (error) {
        logApiFailure('wiki_comments_get_failed', { pageId, message: error?.message || String(error) });
        return err('Failed to load comments', 500);
      }
    }

    if (path === '/comments' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/comments', body, corsHeaders); if (_rateLimit) return _rateLimit; }
      const pageId = normalizeWikiPageId(body?.page_id);
      const name = normalizeTextField(body?.name, 60);
      const text = normalizeTextField(body?.text, 1000);
      if (!pageId) return err('page_id required', 400);
      if (!name) return err('name required', 400);
      if (!text) return err('text required', 400);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const auth = await verifyOptionalWikiTelegram(body, env);
        if (auth.error) return err(auth.error, auth.status || 401);
        const emailHash = await hashEmail(body?.email);
        const commentIdentityHash = emailHash || await hashTelegramCommentIdentity(auth.verified?.telegramId);
        if (!commentIdentityHash) return err('valid email or linked Telegram auth required', 400);
        const avatarUrl = normalizeTextField(body?.avatar_url, 500)
          || normalizeTextField(auth.verified?.user?.photo_url, 500)
          || null;
        const commentId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO wiki_comments
            (id, page_id, telegram_id, name, email_hash, avatar_url, telegram_username, discord_username, text, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).bind(
          commentId,
          pageId,
          auth.verified?.telegramId || null,
          name,
          commentIdentityHash,
          avatarUrl,
          normalizeTextField(body?.telegram_username, 60) || null,
          normalizeTextField(body?.discord_username, 60) || null,
          text,
        ).run();
        const mission = await completeWikiMission(env.DB, {
          verified: auth.verified,
          pageId,
          missionId: 'engage',
          source: 'comments',
          sourceId: commentId,
        });
        let finalModerationStatus = auth.verified?.telegramId ? 'approved' : 'pending';
        if (finalModerationStatus === 'approved') {
          try {
            await env.DB.prepare(`
              UPDATE wiki_comments
              SET status = ?
              WHERE id = ?
            `).bind(finalModerationStatus, commentId).run();
          } catch (error) {
            logApiFailure('wiki_comment_auto_approval_status_update_failed', {
              comment_id: commentId,
              page_id: pageId,
              target_status: 'approved',
              error_type: 'd1_update_failed',
            });
            finalModerationStatus = 'pending';
          }
        }
        return json({
          ok: true,
          page_id: pageId,
          comment_id: commentId,
          status: finalModerationStatus,
          moderation: finalModerationStatus,
          message: getWikiCommentModerationMessage(finalModerationStatus),
          mission,
        }, 201);
      } catch (error) {
        logApiFailure('wiki_comments_post_failed', { pageId, message: error?.message || String(error) });
        return err('Failed to post comment', 500);
      }
    }

    const commentVoteMatch = path.match(/^\/comments\/([^/]+)\/vote$/);
    if (commentVoteMatch && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/comments', body, corsHeaders); if (_rateLimit) return _rateLimit; }
      const commentId = normalizeTextField(decodeURIComponent(commentVoteMatch[1]), 80);
      const vote = normalizeWikiVote(body?.vote);
      if (!commentId) return err('comment_id required', 400);
      if (!vote) return err('vote must be up or down', 400);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const auth = await verifyRequiredWikiTelegram(body, env);
        if (auth.error) return err(auth.error, auth.status || 401);
        const comment = await env.DB.prepare(`SELECT id FROM wiki_comments WHERE id = ? LIMIT 1`).bind(commentId).first();
        if (!comment) return err('Comment not found', 404);
        const existing = await env.DB.prepare(`
          SELECT vote FROM wiki_comment_votes WHERE comment_id = ? AND telegram_id = ? LIMIT 1
        `).bind(commentId, auth.verified.telegramId).first().catch(() => null);
        if (!existing) {
          await env.DB.prepare(`
            INSERT INTO wiki_comment_votes (comment_id, telegram_id, vote) VALUES (?, ?, ?)
          `).bind(commentId, auth.verified.telegramId, vote).run();
          await env.DB.prepare(`
            UPDATE wiki_comments
            SET votes_up = votes_up + CASE WHEN ? = 'up' THEN 1 ELSE 0 END,
                votes_down = votes_down + CASE WHEN ? = 'down' THEN 1 ELSE 0 END
            WHERE id = ?
          `).bind(vote, vote, commentId).run();
        }
        const counts = await env.DB.prepare(`
          SELECT votes_up, votes_down FROM wiki_comments WHERE id = ? LIMIT 1
        `).bind(commentId).first();
        return json({
          ok: true,
          comment_id: commentId,
          vote,
          already_voted: !!existing,
          votes_up: Number(counts?.votes_up || 0),
          votes_down: Number(counts?.votes_down || 0),
        });
      } catch (error) {
        logApiFailure('wiki_comment_vote_failed', { commentId, message: error?.message || String(error) });
        return err('Failed to vote on comment', 500);
      }
    }

    if (path === '/likes' && request.method === 'GET') {
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/likes', null, corsHeaders); if (_rateLimit) return _rateLimit; }
      const pageId = normalizeWikiPageId(url.searchParams.get('page_id'));
      if (!pageId) return err('page_id required', 400);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM wiki_page_likes WHERE page_id = ?`).bind(pageId).first();
        return json({ ok: true, page_id: pageId, count: Number(row?.count || 0) });
      } catch (error) {
        logApiFailure('wiki_likes_get_failed', { pageId, message: error?.message || String(error) });
        return err('Failed to load likes', 500);
      }
    }

    if (path === '/likes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/likes', body, corsHeaders); if (_rateLimit) return _rateLimit; }
      const pageId = normalizeWikiPageId(body?.page_id);
      if (!pageId) return err('page_id required', 400);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const auth = await verifyRequiredWikiTelegram(body, env);
        if (auth.error) return err(auth.error, auth.status || 401);
        const insertResult = await env.DB.prepare(`
          INSERT OR IGNORE INTO wiki_page_likes (page_id, telegram_id) VALUES (?, ?)
        `).bind(pageId, auth.verified.telegramId).run();
        const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM wiki_page_likes WHERE page_id = ?`).bind(pageId).first();
        const mission = await completeWikiMission(env.DB, {
          verified: auth.verified,
          pageId,
          missionId: 'signal',
          source: 'likes',
          sourceId: pageId,
        });
        return json({
          ok: true,
          page_id: pageId,
          count: Number(row?.count || 0),
          already_liked: Number(insertResult?.meta?.changes || 0) === 0,
          mission,
        });
      } catch (error) {
        logApiFailure('wiki_likes_post_failed', { pageId, message: error?.message || String(error) });
        return err('Failed to like page', 500);
      }
    }

    if (path === '/citation-votes' && request.method === 'GET') {
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/citation-votes', null, corsHeaders); if (_rateLimit) return _rateLimit; }
      const pageId = normalizeWikiPageId(url.searchParams.get('page_id'));
      const citeId = normalizeWikiId(url.searchParams.get('cite_id'), 80);
      if (!pageId) return err('page_id required', 400);
      if (!citeId) return err('cite_id required', 400);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const row = await env.DB.prepare(`
          SELECT
            SUM(CASE WHEN vote = 'up' THEN 1 WHEN vote = 'down' THEN -1 ELSE 0 END) AS score,
            SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS up,
            SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS down
          FROM wiki_citation_votes
          WHERE page_id = ? AND cite_id = ?
        `).bind(pageId, citeId).first();
        return json({
          ok: true,
          page_id: pageId,
          cite_id: citeId,
          score: Number(row?.score || 0),
          up: Number(row?.up || 0),
          down: Number(row?.down || 0),
        });
      } catch (error) {
        logApiFailure('wiki_citation_votes_get_failed', { pageId, citeId, message: error?.message || String(error) });
        return err('Failed to load citation votes', 500);
      }
    }

    if (path === '/citation-votes' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/citation-votes', body, corsHeaders); if (_rateLimit) return _rateLimit; }
      const pageId = normalizeWikiPageId(body?.page_id);
      const citeId = normalizeWikiId(body?.cite_id, 80);
      const vote = normalizeWikiVote(body?.vote);
      if (!pageId) return err('page_id required', 400);
      if (!citeId) return err('cite_id required', 400);
      if (!vote) return err('vote must be up or down', 400);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const auth = await verifyRequiredWikiTelegram(body, env);
        if (auth.error) return err(auth.error, auth.status || 401);
        const existing = await env.DB.prepare(`
          SELECT vote FROM wiki_citation_votes
          WHERE page_id = ? AND cite_id = ? AND telegram_id = ?
          LIMIT 1
        `).bind(pageId, citeId, auth.verified.telegramId).first().catch(() => null);
        if (!existing) {
          await env.DB.prepare(`
            INSERT INTO wiki_citation_votes (page_id, cite_id, telegram_id, vote)
            VALUES (?, ?, ?, ?)
          `).bind(pageId, citeId, auth.verified.telegramId, vote).run();
        }
        const row = await env.DB.prepare(`
          SELECT
            SUM(CASE WHEN vote = 'up' THEN 1 WHEN vote = 'down' THEN -1 ELSE 0 END) AS score,
            SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS up,
            SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS down
          FROM wiki_citation_votes
          WHERE page_id = ? AND cite_id = ?
        `).bind(pageId, citeId).first();
        const mission = await completeWikiMission(env.DB, {
          verified: auth.verified,
          pageId,
          missionId: 'cite',
          source: 'citation-votes',
          sourceId: citeId,
        });
        return json({
          ok: true,
          page_id: pageId,
          cite_id: citeId,
          vote,
          already_voted: !!existing,
          score: Number(row?.score || 0),
          up: Number(row?.up || 0),
          down: Number(row?.down || 0),
          mission,
        });
      } catch (error) {
        logApiFailure('wiki_citation_votes_post_failed', { pageId, citeId, message: error?.message || String(error) });
        return err('Failed to vote on citation', 500);
      }
    }

    if (path === '/wiki-missions/status' && (request.method === 'GET' || request.method === 'POST')) {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      } else {
        const rawAuth = url.searchParams.get('telegram_auth');
        if (rawAuth) { try { body.telegram_auth = JSON.parse(rawAuth); } catch { return err('Invalid telegram_auth', 400); } }
        body.page_id = url.searchParams.get('page_id');
      }
      const pageId = normalizeWikiPageId(body?.page_id);
      if (!pageId) return err('page_id required', 400);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const auth = await verifyRequiredWikiTelegram(body, env);
        if (auth.error) return err(auth.error, auth.status || 401);
        const missionWindow = getTodayUtcDate();
        const rows = await env.DB.prepare(`
          SELECT mission_id, xp_awarded, source, source_id, created_at
          FROM wiki_mission_completions
          WHERE page_id = ? AND mission_window = ? AND telegram_id = ?
        `).bind(pageId, missionWindow, auth.verified.telegramId).all();
        const missions = {};
        for (const row of (rows.results || [])) {
          missions[row.mission_id] = {
            completed: true,
            reward_status: 'xp_synced',
            xp_awarded: Number(row.xp_awarded || 0),
            source: row.source || null,
            source_id: row.source_id || null,
            completed_at: row.created_at || null,
          };
        }
        return json({ ok: true, page_id: pageId, mission_window: missionWindow, missions });
      } catch (error) {
        logApiFailure('wiki_missions_status_failed', { pageId, message: error?.message || String(error) });
        return err('Failed to load wiki mission status', 500);
      }
    }

    if (path === '/wiki-missions/complete' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      const pageId = normalizeWikiPageId(body?.page_id);
      const missionId = normalizeWikiId(body?.mission_id, 24);
      const source = normalizeWikiId(body?.source, 80);
      const sourceId = normalizeTextField(body?.source_id, 120) || null;
      if (!pageId) return err('page_id required', 400);
      if (!missionId || !WIKI_MISSION_IDS.has(missionId)) return err('valid mission_id required', 400);
      if (source !== WIKI_MISSION_SOURCE_BY_ID[missionId]) return err('source does not match mission_id', 400);
      try {
        { const _wikiCheck = await ensureWikiEngagementTables(env.DB, corsHeaders); if (_wikiCheck) return _wikiCheck.response; }
        const auth = await verifyRequiredWikiTelegram(body, env);
        if (auth.error) return err(auth.error, auth.status || 401);
        const sourceExists = await verifyWikiMissionSourceAction(env.DB, {
          telegramId: auth.verified.telegramId,
          pageId,
          missionId,
          sourceId,
        });
        if (!sourceExists) return err('matching source action required', 409);
        const mission = await completeWikiMission(env.DB, {
          verified: auth.verified,
          pageId,
          missionId,
          source,
          sourceId,
        });
        return json({ ok: true, page_id: pageId, mission });
      } catch (error) {
        logApiFailure('wiki_missions_complete_failed', { pageId, missionId, message: error?.message || String(error) });
        return err('Failed to complete wiki mission', 500);
      }
    }

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
        { const _ptCheck = await ensurePlayerStateTables(env.DB, corsHeaders); if (_ptCheck) return _ptCheck.response; }
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
            required_xp: BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP,
            can_enter_multiplayer: arcadeXpTotal >= BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP,
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
        { const _ptCheck = await ensurePlayerStateTables(env.DB, corsHeaders); if (_ptCheck) return _ptCheck.response; }
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
        { const _ptCheck = await ensurePlayerStateTables(env.DB, corsHeaders); if (_ptCheck) return _ptCheck.response; }
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
        { const _ptCheck = await ensurePlayerStateTables(env.DB, corsHeaders); if (_ptCheck) return _ptCheck.response; }
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
        { const _ptCheck = await ensurePlayerStateTables(env.DB, corsHeaders); if (_ptCheck) return _ptCheck.response; }
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
        { const _ptCheck = await ensurePlayerStateTables(env.DB, corsHeaders); if (_ptCheck) return _ptCheck.response; }
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
        { const _ptCheck = await ensurePlayerStateTables(env.DB, corsHeaders); if (_ptCheck) return _ptCheck.response; }
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
        const battleTables = await ensureBattleChamberTables(env.DB, corsHeaders);
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
      const bcCheck = await ensureBattleChamberTables(env.DB, corsHeaders);
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
      const bcCheck = await ensureBattleChamberTables(env.DB, corsHeaders);
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
      const bcCheck = await ensureBattleChamberTables(env.DB, corsHeaders);
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
      const bcCheck = await ensureBattleChamberTables(env.DB, corsHeaders);
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
        { const _ptCheck = await ensurePlayerStateTables(env.DB, corsHeaders); if (_ptCheck) return _ptCheck.response; }
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

    // ── POST /public/npc-chat ───────────────────────────────────────────────
    // Public NPC chat bridge — forwards Telegram-authenticated visitor messages to SWARMSY.
    // Telegram auth is enforced here so unauthenticated curl/browser clients cannot
    // bypass the frontend. The bridge token is never sent to the browser.
    if (path === '/public/npc-chat') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', Allow: 'POST, OPTIONS', ...corsHeaders },
        });
      }

      // 1. Parse body — return 400 for malformed JSON.
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON', 400); }
      { const _rateLimit = await enforcePublicRateLimit(request, env, '/public/npc-chat', body, corsHeaders); if (_rateLimit) return _rateLimit; }

      // 2. Require verified Telegram auth before any Sparky/SWARMSY relay.
      // Short-circuit the common unauthenticated case (no auth evidence at all) without
      // invoking the verifier so scanners and unauthenticated visitors do not generate
      // log noise from verifyTelegramIdentityFromBody's failure events.
      const hasTelegramAuthEvidence = body != null && (
        body.telegram_auth !== undefined ||
        body.id != null ||
        body.auth_date != null ||
        body.hash != null
      );
      if (!hasTelegramAuthEvidence) {
        return json({
          success: false,
          error: 'telegram_login_required',
          reply: 'Log in with Telegram to use Sparky AI Chat.',
        }, 401);
      }
      const verifiedTelegram = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
      if (verifiedTelegram?.error) {
        return json({
          success: false,
          error: 'telegram_login_required',
          reply: 'Log in with Telegram to use Sparky AI Chat.',
        }, 401);
      }

      // 3. Validate npcId. Public chat is Sparky-only. Missing npcId and
      //    legacy assistant clients are mapped to Sparky for rollout compatibility.
      const requestedNpcId = body?.npcId == null ? 'sparky' : String(body.npcId).toLowerCase().trim();
      const npcId = requestedNpcId === 'paperclip' ? 'sparky' : requestedNpcId;
      if (npcId !== 'sparky') {
        return err('npcId must be "sparky"', 400);
      }

      // 4. Validate message — non-empty string, clamped to 2000 chars.
      const rawMessage = String(body?.message ?? '');
      if (!rawMessage.trim()) {
        return err('message is required', 400);
      }
      const message = rawMessage.slice(0, 2000);

      // 5. pagePath — safe default, length-limited.
      const pagePath = String(body?.pagePath || '/swarmsy.html').slice(0, 256);

      // 6. Origin of the inbound browser request.
      const origin = request.headers.get('Origin') || '';

      // 7. SWARMSY_BRIDGE_TOKEN must be present — return 503 with safe error, not a
      //    stack trace.  Never expose the token value in any response.
      const bridgeToken = String(env.SWARMSY_BRIDGE_TOKEN || '').trim();
      if (!bridgeToken) {
        return json({ success: false, error: 'npc_bridge_not_configured' }, 503);
      }

      // 8. Forward to SWARMSY with one retry for transient fetch/JSON failures.
      const SWARMSY_NPC_URL = 'https://swarmsy.cryptomoonboys.com/api/swarmsy/public/npc-chat';
      const NPC_CHAT_BRIDGE_TIMEOUT_MS = 25000;
      const NPC_CHAT_BRIDGE_MAX_ATTEMPTS = 2;
      const NPC_CHAT_BRIDGE_RETRY_BASE_MS = 250;
      const swarmsyBody = JSON.stringify({
        npcId,
        message,
        pagePath,
        origin,
        telegram_id: verifiedTelegram.telegramId,
      });

      let swarmsyRes;
      let upstreamPayload;
      for (let attempt = 1; attempt <= NPC_CHAT_BRIDGE_MAX_ATTEMPTS; attempt++) {
        let fetchSucceeded = false;
        let timedOut = false;
        let timeoutId = null;
        const controller = new AbortController();
        try {
          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, NPC_CHAT_BRIDGE_TIMEOUT_MS);
          try {
            swarmsyRes = await fetch(SWARMSY_NPC_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-SWARMSY-BRIDGE-TOKEN': bridgeToken,
              },
              body: swarmsyBody,
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }

          fetchSucceeded = true;
          upstreamPayload = await swarmsyRes.json();
          break;
        } catch (swarmsyError) {
          logApiFailure('swarmsy_bridge_error', {
            attempt,
            errorType: fetchSucceeded
              ? 'non_json_response'
              : (timedOut && swarmsyError?.name === 'AbortError' ? 'network_timeout' : 'fetch_failure'),
            upstreamStatus: fetchSucceeded && swarmsyRes ? swarmsyRes.status : null,
            message: swarmsyError?.message || String(swarmsyError),
          });
          swarmsyRes = null;
          upstreamPayload = undefined;
          if (attempt < NPC_CHAT_BRIDGE_MAX_ATTEMPTS) {
            await sleep(NPC_CHAT_BRIDGE_RETRY_BASE_MS * (2 ** (attempt - 1)));
          }
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      if (!swarmsyRes || upstreamPayload === undefined) {
        return json({
          success: false,
          error: 'swarmsy_bridge_unavailable',
          reply: 'Sparky is connected to Telegram, but the SWARMSY bridge is unavailable right now.',
        }, 502);
      }

      const scrubBridgeToken = (value) => {
        if (typeof value === 'string') return value.split(bridgeToken).join('[redacted]');
        if (Array.isArray(value)) return value.map((item) => scrubBridgeToken(item));
        if (value && typeof value === 'object') {
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key.split(bridgeToken).join('[redacted]'),
              scrubBridgeToken(item),
            ]),
          );
        }
        return value;
      };

      // 9. Relay SWARMSY JSON response and status code — never expose internals.
      return json(scrubBridgeToken(upstreamPayload), swarmsyRes.status);
    }

    return err('Not found', 404);
  },
  async scheduled(event, env, _ctx) {
    const cron = String(event?.cron || '');
    const shouldRunDigest = !cron || cron === '0 9 * * *';
    const shouldRunDailySummary = !cron || cron === '0 9 * * *';
    const shouldRunPetNotifications = !cron || cron === '*/5 * * * *';
    const shouldRunTimedEvents = !cron || cron === '*/5 * * * *';
    const scheduledResults = [];

    if (shouldRunDigest) {
      const summary = await runTelegramDailyDigest(env, {
        trigger: 'scheduled_cron',
        utcDay: getTodayUtcDate(),
      }).catch((error) => ({
        ok: false,
        error: error?.message || String(error),
      }));
      scheduledResults.push({
        task: 'telegram_daily_digest',
        ok: !!summary?.ok,
        error: summary?.ok ? null : (summary?.error || 'unknown_error'),
      });
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

    if (shouldRunPetNotifications) {
      const petNotifications = await runPetNeedsNotifications(env, {
        trigger: 'scheduled_cron',
      }).catch((error) => ({
        ok: false,
        error: error?.message || String(error),
      }));
      scheduledResults.push({
        task: 'telegram_pet_notifications',
        ok: !!petNotifications?.ok,
        error: petNotifications?.ok ? null : (petNotifications?.error || 'unknown_error'),
      });
      if (!petNotifications?.ok) {
        logApiFailure('telegram_pet_notifications_scheduled_failed', petNotifications);
      } else {
        logApiEvent('telegram_pet_notifications_scheduled_complete', {
          considered: petNotifications.considered,
          sent: petNotifications.sent,
          skipped: petNotifications.skipped,
          failed: petNotifications.failed,
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
      scheduledResults.push({
        task: 'telegram_group_announcements',
        ok: !!groupSummary?.ok,
        error: groupSummary?.ok ? null : (groupSummary?.error || 'unknown_error'),
      });
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
    const failedTasks = scheduledResults.filter((result) => !result.ok);
    if (failedTasks.length) {
      logApiFailure('scheduled_partial_failure', {
        cron,
        failed_tasks: failedTasks,
        task_count: scheduledResults.length,
      });
    } else if (scheduledResults.length) {
      logApiEvent('scheduled_tasks_complete', {
        cron,
        task_count: scheduledResults.length,
        tasks: scheduledResults.map((result) => result.task),
      });
    }
  },
};

// ── Telegram bot command handler ──────────────────────────────────────────────

const SITE_URL = 'https://cryptomoonboys.com';
const PET_MEDIA_BASE_URL = `${SITE_URL}/img/pets`;
const PET_MEDIA_MANIFEST = Object.freeze({
  feed: 'CRYPTO MOONBOYS PET FEED.jpg',
  play: 'CRYPTO MOONBOYS PET PLAY.jpg',
  clean: 'CRYPTO MOONBOYS PET CLEAN.jpg',
  sleep: 'CRYPTO MOONBOYS PET SLEEP.jpg',
  train: 'CRYPTO MOONBOYS PET TRAIN HARD.jpg',
  bag: 'CRYPTO MOONBOYS PET MOON BAG.jpg',
  work: 'CRYPTO MOONBOYS PET MOON HUSTLE.jpg',
  event: 'CRYPTO MOONBOYS PET MOON EVENT.jpg',
  daily: 'CRYPTO MOONBOYS DAILY DROP.jpg',
  adventure: 'CRYPTO MOONBOYS MOON RUN.jpg',
  shop: 'CRYPTO MOONBOYS PET MOON SHOP.jpg',
  trade: 'CRYPTO MOONBOYS PET GOLD TRADE.jpg',
  how_to_play: 'CRYPTO MOONBOYS PET HOW TO PLAY.jpg',
  leaderboard: 'CRYPTO MOONBOYS PET LEADERBOARD.jpg',
  level_up: 'CRYPTO MOONBOYS PET LEVEL UP.jpg',
  purchase_complete: 'CRYPTO MOONBOYS PET PURCHASE COMPLETE.jpg',
  trade_win: 'CRYPTO MOONBOYS PET TRADE WIN.jpg',
  trade_loss: 'CRYPTO MOONBOYS PET TRADE LOSS.jpg',
  adventure_win: 'CRYPTO MOONBOYS PET ADVENTURE WIN.jpg',
  adventure_fail: 'CRYPTO MOONBOYS PET RUN FAILED.jpg',
});

const PET_RANDOM_EVENTS = Object.freeze({
  moon_crate_found: Object.freeze({
    key: 'moon_crate_found',
    title: 'Moon Crate Found',
    intro: 'A dusty crate rattles under a neon sign. The latch looks warm.',
    choices: Object.freeze([
      Object.freeze({
        key: 'crack_it_open',
        label: 'Crack It Open',
        copy: 'You pry it open and a moon-bright puff spills out.',
        rewards: Object.freeze({ pet_xp: [12, 18], moon_gold: [6, 12], moon_crystals: [0, 1] }),
        costs: Object.freeze({ energy: [0, 0] }),
        risk: Object.freeze({
          chance: 0.3,
          copy: 'The latch jams, but your pet still learns a trick or two.',
          rewards: Object.freeze({ pet_xp: [5, 8], moon_gold: [0, 4] }),
          costs: Object.freeze({ energy: [1, 2] }),
        }),
      }),
      Object.freeze({
        key: 'flip_it_fast',
        label: 'Flip It Fast',
        copy: 'You flip the crate to a buyer and pocket the easy cash.',
        rewards: Object.freeze({ pet_xp: [6, 10], moon_gold: [10, 18] }),
        costs: Object.freeze({ energy: [0, 0] }),
        risk: Object.freeze({
          chance: 0.2,
          copy: 'The buyer flakes, so you salvage a smaller cut.',
          rewards: Object.freeze({ pet_xp: [3, 5], moon_gold: [4, 8] }),
          costs: Object.freeze({ energy: [0, 1] }),
        }),
      }),
      Object.freeze({
        key: 'leave_it',
        label: 'Leave It',
        copy: 'You leave the crate alone and keep moving smart.',
        rewards: Object.freeze({ pet_xp: [3, 6], moon_gold: [0, 2] }),
        costs: Object.freeze({ energy: [0, 0] }),
      }),
    ]),
  }),
  alley_ambush: Object.freeze({
    key: 'alley_ambush',
    title: 'Alley Ambush',
    intro: 'A rival pet crew blocks the alley with a grin and a challenge.',
    choices: Object.freeze([
      Object.freeze({
        key: 'fight_back',
        label: 'Fight Back',
        copy: 'Your pet squares up and turns the ambush into a win.',
        rewards: Object.freeze({ pet_xp: [14, 20], moon_gold: [8, 16], style_tokens: [0, 1] }),
        costs: Object.freeze({ energy: [2, 4] }),
        risk: Object.freeze({
          chance: 0.35,
          copy: 'The crew scrambles you a bit, but you still break through.',
          rewards: Object.freeze({ pet_xp: [7, 12], moon_gold: [2, 8] }),
          costs: Object.freeze({ energy: [4, 6] }),
        }),
      }),
      Object.freeze({
        key: 'run_route',
        label: 'Run Route',
        copy: 'You dart through the back lane and escape with a clean win.',
        rewards: Object.freeze({ pet_xp: [9, 14], moon_gold: [5, 10] }),
        costs: Object.freeze({ energy: [1, 2] }),
      }),
      Object.freeze({
        key: 'hide_out',
        label: 'Hide Out',
        copy: 'You duck into a hidden nook and wait out the noise.',
        rewards: Object.freeze({ pet_xp: [4, 8], energy: [1, 3] }),
        costs: Object.freeze({}),
      }),
    ]),
  }),
  black_market_tip: Object.freeze({
    key: 'black_market_tip',
    title: 'Black Market Tip',
    intro: 'A shady whisper promises a shortcut to better gear or fast cash.',
    choices: Object.freeze([
      Object.freeze({
        key: 'follow_lead',
        label: 'Follow Lead',
        copy: 'You follow the tip and find a risky but juicy stash.',
        rewards: Object.freeze({ pet_xp: [10, 16], moon_crystals: [0, 2], style_tokens: [0, 2] }),
        costs: Object.freeze({ moon_gold: [4, 8] }),
        risk: Object.freeze({
          chance: 0.45,
          copy: 'The tip was half-baked, but you still pick up a few scraps.',
          rewards: Object.freeze({ pet_xp: [4, 7], moon_crystals: [0, 1], style_tokens: [0, 1] }),
          costs: Object.freeze({ moon_gold: [2, 4] }),
        }),
      }),
      Object.freeze({
        key: 'sell_info',
        label: 'Sell Info',
        copy: 'You sell the rumor and take the clean payout.',
        rewards: Object.freeze({ pet_xp: [6, 10], moon_gold: [10, 18] }),
        costs: Object.freeze({}),
      }),
      Object.freeze({
        key: 'ignore_tip',
        label: 'Ignore Tip',
        copy: 'You ignore the whisper and keep your head straight.',
        rewards: Object.freeze({ pet_xp: [3, 6] }),
        costs: Object.freeze({}),
      }),
    ]),
  }),
  rooftop_shortcut: Object.freeze({
    key: 'rooftop_shortcut',
    title: 'Rooftop Shortcut',
    intro: 'A glowing rooftop path cuts the travel time in half if you dare it.',
    choices: Object.freeze([
      Object.freeze({
        key: 'take_jump',
        label: 'Take Jump',
        copy: 'You sprint, leap, and land with style to spare.',
        rewards: Object.freeze({ pet_xp: [15, 24], moon_gold: [8, 14] }),
        costs: Object.freeze({ energy: [2, 4] }),
        risk: Object.freeze({
          chance: 0.35,
          copy: 'You slip on the edge and come up with fewer rewards.',
          rewards: Object.freeze({ pet_xp: [6, 10], moon_gold: [0, 6] }),
          costs: Object.freeze({ energy: [4, 6] }),
        }),
      }),
      Object.freeze({
        key: 'climb_down',
        label: 'Climb Down',
        copy: 'You take the safe path and still pick up a solid gain.',
        rewards: Object.freeze({ pet_xp: [9, 14], moon_gold: [4, 8] }),
        costs: Object.freeze({ energy: [0, 1] }),
      }),
      Object.freeze({
        key: 'skip_route',
        label: 'Skip Route',
        copy: 'You skip the shortcut and keep the day calm.',
        rewards: Object.freeze({ pet_xp: [3, 5] }),
        costs: Object.freeze({}),
      }),
    ]),
  }),
  rival_pet_challenge: Object.freeze({
    key: 'rival_pet_challenge',
    title: 'Rival Pet Challenge',
    intro: 'A rival pet steps forward with a grin and a challenge sign.',
    choices: Object.freeze([
      Object.freeze({
        key: 'battle',
        label: 'Battle',
        copy: 'Your pet wins the faceoff and comes away sharper.',
        rewards: Object.freeze({ pet_xp: [15, 22], style_tokens: [1, 2], moon_gold: [6, 12] }),
        costs: Object.freeze({ energy: [2, 4] }),
        risk: Object.freeze({
          chance: 0.4,
          copy: 'The fight gets messy, but you still walk away with something.',
          rewards: Object.freeze({ pet_xp: [7, 12], style_tokens: [0, 1], moon_gold: [2, 6] }),
          costs: Object.freeze({ energy: [4, 6] }),
        }),
      }),
      Object.freeze({
        key: 'trick_them',
        label: 'Trick Them',
        copy: "You bluff your way through and earn the crowd's respect.",
        rewards: Object.freeze({ pet_xp: [8, 14], moon_gold: [4, 10], style_tokens: [0, 1] }),
        costs: Object.freeze({}),
        risk: Object.freeze({
          chance: 0.25,
          copy: 'The trick lands awkwardly, but you still salvage a reward.',
          rewards: Object.freeze({ pet_xp: [4, 8], moon_gold: [1, 5] }),
          costs: Object.freeze({}),
        }),
      }),
      Object.freeze({
        key: 'walk_away',
        label: 'Walk Away',
        copy: 'You walk away cool-headed and keep the streak alive.',
        rewards: Object.freeze({ pet_xp: [3, 7] }),
        costs: Object.freeze({}),
      }),
    ]),
  }),
});

function buildPetMediaUrl(mediaKey) {
  const filename = PET_MEDIA_MANIFEST[mediaKey];
  if (!filename) return null;
  return `${PET_MEDIA_BASE_URL}/${encodeURIComponent(filename)}`;
}

function resolvePetMediaKey(action, result = null) {
  const key = String(action || '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'pet') return 'how_to_play';
  if (key === 'adopt' || key === 'level_up') return 'level_up';
  if (key === 'purchase' || key === 'petbuy') return 'purchase_complete';
  if (key === 'trade') {
    if (result?.won === true) return 'trade_win';
    if (result?.won === false) return 'trade_loss';
    return 'trade';
  }
  if (key === 'adventure') {
    if (result?.accepted === false) return 'adventure_fail';
    return 'adventure_win';
  }
  if (key === 'how to play' || key === 'how_to_play') return 'how_to_play';
  if (key === 'leaderboard' || key === 'petleaderboard') return 'leaderboard';
  if (key === 'petmissions') return 'daily';
  if (key === 'petuse') return 'bag';
  if (key === 'petshop') return 'shop';
  if (key === 'petwork') return 'work';
  if (key === 'petdaily') return 'daily';
  if (key === 'petevent') return 'event';
  if (key === 'petbag') return 'bag';
  if (key === 'pettrade') return resolvePetMediaKey('trade', result);
  if (key === 'petrun' || key === 'petextract') return resolvePetMediaKey('adventure', result);
  if (key === 'petadventure') return resolvePetMediaKey('adventure', result);
  return PET_MEDIA_MANIFEST[key] ? key : (PET_MEDIA_MANIFEST[String(result?.media_key || '').trim()] ? String(result.media_key).trim() : null);
}

function normalizePetRandomEventChoice(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').replace(/-/g, '_');
  if (!key) return null;
  if (key === 'open' || key === 'sell' || key === 'ignore') return key;
  for (const event of Object.values(PET_RANDOM_EVENTS)) {
    if (event.choices.some((choice) => choice.key === key)) return key;
  }
  return null;
}

function normalizePetAdventureChoice(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').replace(/-/g, '_');
  if (!key) return null;
  for (const encounter of Object.values(PET_ADVENTURE_ENCOUNTERS)) {
    if (encounter.choices.some((choice) => choice.key === key)) return key;
  }
  return null;
}

function splitPetRandomEventKey(eventKey) {
  const key = String(eventKey || '').trim().toLowerCase();
  if (!key) return null;
  const baseKey = key.split('-')[0];
  return PET_RANDOM_EVENTS[baseKey] ? baseKey : null;
}

function resolvePetRandomEncounter(eventKey) {
  const baseKey = splitPetRandomEventKey(eventKey);
  return baseKey ? PET_RANDOM_EVENTS[baseKey] : null;
}

function selectPetRandomEncounter() {
  const encounters = Object.values(PET_RANDOM_EVENTS);
  const encounter = encounters[Math.floor(Math.random() * encounters.length)] || encounters[0] || null;
  if (!encounter) return null;
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return Object.freeze({
    ...encounter,
    event_key: `${encounter.key}-${nonce}`.slice(0, 120),
  });
}

function buildPetRandomEventReplyMarkup(encounter) {
  return {
    inline_keyboard: [
      encounter.choices.map((choice) => ({
        text: choice.label,
        callback_data: `pet:event:${encounter.event_key}:${choice.key}`,
      })),
      [{ text: 'Back', callback_data: 'pet:bag' }],
    ],
  };
}

function splitPetAdventureKey(eventKey) {
  const key = String(eventKey || '').trim().toLowerCase();
  if (!key) return null;
  const baseKey = key.split('-')[0];
  return PET_ADVENTURE_ENCOUNTERS[baseKey] ? baseKey : null;
}

function resolvePetAdventureEncounter(eventKey) {
  const baseKey = splitPetAdventureKey(eventKey);
  return baseKey ? PET_ADVENTURE_ENCOUNTERS[baseKey] : null;
}

function selectPetAdventureEncounter(pet = null, seed = null) {
  const unlocked = petAdventuresForPet(pet).filter((adventure) => adventure.unlocked);
  const encounters = unlocked
    .map((adventure) => PET_ADVENTURE_ENCOUNTERS[adventure.key])
    .filter(Boolean);
  if (!encounters.length) return null;
  const index = seed == null || seed === ''
    ? Math.floor(Math.random() * encounters.length)
    : hashPetAdventureSeed(seed) % encounters.length;
  return Object.freeze({
    ...encounters[index],
    event_key: String(seed || encounters[index].key),
  });
}

function buildPetAdventureReplyMarkup(encounter) {
  return {
    inline_keyboard: [
      encounter.choices.map((choice) => ({
        text: choice.label,
        callback_data: `pet:adventure:${encounter.key}:${choice.key}`,
      })),
      [{ text: 'Back', callback_data: 'pet:bag' }],
    ],
  };
}

function buildPetRunChoiceReplyMarkup(run) {
  const choices = getPetRunStepChoices(run);
  return {
    inline_keyboard: [
      choices.map((choice) => ({
        text: choice.label,
        callback_data: `pet:run:${run.run_id}:step:${Math.max(0, Number(run.depth || 0)) + 1}:${choice.key}`,
      })),
      [
        { text: 'Extract', callback_data: `pet:run:${run.run_id}:extract` },
        { text: 'Bag', callback_data: 'pet:bag' },
      ],
    ],
  };
}

function buildPetRunAfterStepReplyMarkup(run) {
  const rows = [
    [
      { text: 'Extract', callback_data: `pet:run:${run.run_id}:extract` },
      { text: 'Push Deeper', callback_data: `pet:run:${run.run_id}:push` },
    ],
  ];
  if (Number(run.depth || 0) >= Number(run.max_depth || PET_RUN_MAX_DEPTH)) {
    rows[0] = [{ text: 'Boss Cleared', callback_data: 'pet:bag' }];
  }
  rows.push([{ text: 'Pet Status', callback_data: 'pet:bag' }]);
  return { inline_keyboard: rows };
}

function formatPetRunRewards(run) {
  const items = parsePetRunItems(run?.unbanked_items);
  const itemText = Object.entries(items).map(([key, count]) => `${key} x${count}`).join(', ');
  return [
    `${clampPetCurrency(run?.unbanked_pet_xp)} pet XP`,
    `${clampPetCurrency(run?.unbanked_moon_gold)} gold`,
    `${clampPetCurrency(run?.unbanked_moon_crystals)} crystals`,
    `${clampPetCurrency(run?.unbanked_style_tokens)} style`,
    itemText ? `items: ${itemText}` : '',
  ].filter(Boolean).join(', ');
}

function formatPetRunPrompt(run, pet = null) {
  const step = Math.min(Math.max(1, Number(run?.depth || 0) + 1), Number(run?.max_depth || PET_RUN_MAX_DEPTH));
  const bossLine = step >= Number(run?.max_depth || PET_RUN_MAX_DEPTH)
    ? 'Boss step: pick the line you trust most.'
    : 'Pick a route, then extract or push deeper.';
  return [
    `<b>Pet Run Engine v1</b>`,
    `Run: <code>${escapeHtml(run.run_id)}</code>`,
    `Depth: ${Number(run.depth || 0)}/${Number(run.max_depth || PET_RUN_MAX_DEPTH)} | Risk: ${Number(run.risk_level || 1)}`,
    `Unbanked: ${escapeHtml(formatPetRunRewards(run))}`,
    pet ? `Energy: ${clampPetStat(pet.energy)}/100 | Health: ${calculatePetHealth(pet)}/100` : '',
    '',
    bossLine,
  ].filter((line) => line !== '').join('\n');
}

function formatPetRunStepSummary(result) {
  const run = result.run || {};
  const outcome = result.outcome || {};
  if (result.reason === 'run_failed') {
    return [
      `<b>Run Failed</b>`,
      escapeHtml(outcome.copy || 'The run collapsed.'),
      `Consolation: +${Number(result.pet_xp_awarded || 0)} pet XP`,
      'Unbanked run loot was lost.',
    ].join('\n');
  }
  if (result.reason === 'run_completed') {
    return [
      `<b>Boss Cleared</b>`,
      escapeHtml(outcome.copy || 'The final step is complete.'),
      `Banked: +${Number(result.pet_xp_awarded || 0)} pet XP, +${Number(result.xp_awarded || 0)} Community XP`,
    ].join('\n');
  }
  const rewards = outcome.rewards || {};
  const costs = outcome.costs || {};
  const rewardParts = [
    rewards.pet_xp ? `+${rewards.pet_xp} pet XP` : '',
    rewards.moon_gold ? `+${rewards.moon_gold} gold` : '',
    rewards.moon_crystals ? `+${rewards.moon_crystals} crystals` : '',
    rewards.style_tokens ? `+${rewards.style_tokens} style` : '',
    outcome.item_key ? `+${outcome.item_key}` : '',
  ].filter(Boolean);
  const costParts = [
    costs.energy ? `${costs.energy} energy` : '',
    costs.hunger ? `${costs.hunger} hunger` : '',
    costs.cleanliness ? `${costs.cleanliness} cleanliness` : '',
    costs.moon_gold ? `${costs.moon_gold} gold` : '',
  ].filter(Boolean);
  return [
    `<b>Step ${Number(run.depth || 0)} Cleared: ${escapeHtml(result.choice?.label || 'Choice')}</b>`,
    escapeHtml(outcome.copy || ''),
    `Unbanked rewards: ${rewardParts.length ? rewardParts.join(', ') : 'none'}`,
    `Costs: ${costParts.length ? costParts.join(', ') : 'none'}`,
    `Current run bag: ${escapeHtml(formatPetRunRewards(run))}`,
  ].join('\n');
}

function formatPetRunBankSummary(result) {
  return [
    `<b>${result.reason === 'run_completed' ? 'Run Complete' : 'Run Extracted'}</b>`,
    `Banked: +${Number(result.pet_xp_awarded || 0)} pet XP, +${Number(result.xp_awarded || 0)} Community XP`,
    `Items: ${Object.entries(result.banked_items || {}).map(([key, count]) => `${key} x${count}`).join(', ') || 'none'}`,
  ].join('\n');
}

function buildPetShopReplyMarkup(items = []) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2).map((item) => {
      const label = item.equipped
        ? `Equipped ${item.title}`
        : item.affordable
          ? `Buy ${item.title}`
          : item.unlocked
            ? `Need currency ${item.title}`
            : `Level ${item.min_level} ${item.title}`;
      return {
        text: label,
        callback_data: `pet:buy:${item.key}`,
      };
    }));
  }
  rows.push([{ text: 'Back', callback_data: 'pet:bag' }]);
  return { inline_keyboard: rows };
}

function buildPetBagReplyMarkup(inventory = []) {
  const usable = inventory.filter((item) => Number(item.count || 0) > 0);
  const rows = [];
  for (let index = 0; index < usable.length; index += 2) {
    rows.push(usable.slice(index, index + 2).map((item) => ({
      text: `Use ${item.title} x${item.count}`,
      callback_data: `pet:use:${item.key}`,
    })));
  }
  rows.push([
    { text: 'Shop', callback_data: 'pet:shop' },
    { text: 'Work', callback_data: 'pet:work' },
    { text: 'Run', callback_data: 'pet:run' },
  ]);
  return { inline_keyboard: rows };
}

function buildPetPurchaseNextReplyMarkup(pet = null) {
  const shopItems = petShopItemsForPet(pet)
    .filter((item) => !item.equipped)
    .sort((a, b) => {
      if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return (a.min_level || 0) - (b.min_level || 0);
    })
    .slice(0, 4);
  const rows = [];
  for (let index = 0; index < shopItems.length; index += 2) {
    rows.push(shopItems.slice(index, index + 2).map((item) => ({
      text: item.affordable
        ? `Buy ${item.title}`
        : item.unlocked
          ? `Grind for ${item.title}`
          : `Lv ${item.min_level} ${item.title}`,
      callback_data: `pet:buy:${item.key}`,
    })));
  }
  rows.push([
    { text: 'Work for Gold', callback_data: 'pet:work' },
    { text: 'Event Roll', callback_data: 'pet:event' },
  ]);
  rows.push([
    { text: 'Run', callback_data: 'pet:run' },
    { text: 'Open Bag', callback_data: 'pet:bag' },
    { text: 'Full Shop', callback_data: 'pet:shop' },
  ]);
  return { inline_keyboard: rows };
}

function rollPetRange(range, fallback = 0) {
  if (Array.isArray(range) && range.length) {
    const min = Number(range[0] ?? fallback);
    const max = Number(range[1] ?? range[0] ?? fallback);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      return Math.floor(low + Math.random() * (high - low + 1));
    }
  }
  if (Number.isFinite(Number(range))) return Number(range);
  return fallback;
}

function pickPetRandomEventOutcome(choice) {
  const risk = choice?.risk || null;
  if (risk && Number.isFinite(Number(risk.chance)) && Math.random() < Number(risk.chance)) {
    return {
      copy: String(risk.copy || choice.copy || ''),
      rewards: risk.rewards || {},
      costs: risk.costs || {},
      kind: 'risk',
    };
  }
  return {
    copy: String(choice.copy || ''),
    rewards: choice.rewards || {},
    costs: choice.costs || {},
    kind: 'success',
  };
}

function applyPetRandomEventDeltas(pet, rewards = {}, costs = {}) {
  const deltas = {
    pet_xp: 0,
    moon_gold: 0,
    moon_crystals: 0,
    style_tokens: 0,
    energy: 0,
    happiness: 0,
    cleanliness: 0,
    hunger: 0,
  };
  const rewardsApplied = {};
  const costsApplied = {};
  for (const [stat, value] of Object.entries(rewards)) {
    const delta = rollPetRange(value, 0);
    rewardsApplied[stat] = delta;
    deltas[stat] = delta;
    if (stat === 'pet_xp') {
      pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + delta));
    } else if (stat === 'moon_gold') {
      pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + delta);
    } else if (stat === 'moon_crystals') {
      pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) + delta);
    } else if (stat === 'style_tokens') {
      pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + delta);
    } else if (stat === 'energy') {
      pet.energy = clampPetStat(Number(pet.energy || 0) + delta);
    } else if (stat === 'happiness') {
      pet.happiness = clampPetStat(Number(pet.happiness || 0) + delta);
    } else if (stat === 'cleanliness') {
      pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) + delta);
    } else if (stat === 'hunger') {
      pet.hunger = clampPetStat(Number(pet.hunger || 0) + delta);
    }
  }
  for (const [stat, value] of Object.entries(costs)) {
    const delta = rollPetRange(value, 0);
    costsApplied[stat] = Math.abs(delta);
    deltas[stat] = -(Math.abs(delta));
    if (stat === 'moon_gold') {
      pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) - Math.abs(delta));
    } else if (stat === 'moon_crystals') {
      pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) - Math.abs(delta));
    } else if (stat === 'style_tokens') {
      pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) - Math.abs(delta));
    } else if (stat === 'energy') {
      pet.energy = clampPetStat(Number(pet.energy || 0) - Math.abs(delta));
    } else if (stat === 'happiness') {
      pet.happiness = clampPetStat(Number(pet.happiness || 0) - Math.abs(delta));
    } else if (stat === 'cleanliness') {
      pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) - Math.abs(delta));
    } else if (stat === 'hunger') {
      pet.hunger = clampPetStat(Number(pet.hunger || 0) + Math.abs(delta));
    }
  }
  return { rewardsApplied, costsApplied, deltas };
}

function formatPetRandomEventSummary(event, choice, outcome, applied = {}) {
  const rewardsApplied = applied.rewardsApplied || {};
  const costsApplied = applied.costsApplied || {};
  const rewardParts = [];
  const costParts = [];
  const addRewardPart = (label, value) => {
    if (!Number.isFinite(value) || value <= 0) return;
    rewardParts.push(`+${Math.abs(value)} ${label}`);
  };
  const addCostPart = (label, value) => {
    if (!Number.isFinite(value) || value <= 0) return;
    costParts.push(`${Math.abs(value)} ${label}`);
  };
  addRewardPart('pet XP', rewardsApplied.pet_xp || 0);
  addRewardPart('gold', rewardsApplied.moon_gold || 0);
  addRewardPart('crystals', rewardsApplied.moon_crystals || 0);
  addRewardPart('style', rewardsApplied.style_tokens || 0);
  addRewardPart('energy', rewardsApplied.energy || 0);
  addRewardPart('happiness', rewardsApplied.happiness || 0);
  addRewardPart('cleanliness', rewardsApplied.cleanliness || 0);
  addRewardPart('hunger', rewardsApplied.hunger || 0);

  if (!rewardParts.length) rewardParts.push('none');
  addCostPart('energy', costsApplied.energy || 0);
  addCostPart('hunger', costsApplied.hunger || 0);
  addCostPart('happiness', costsApplied.happiness || 0);
  addCostPart('cleanliness', costsApplied.cleanliness || 0);
  addCostPart('gold', costsApplied.moon_gold || 0);
  addCostPart('crystals', costsApplied.moon_crystals || 0);
  addCostPart('style', costsApplied.style_tokens || 0);

  return [
    `<b>${escapeHtml(event.title)}</b>`,
    escapeHtml(outcome.copy || choice.copy || event.intro),
    `Rewards: ${rewardParts.join(', ')}`,
    `Costs: ${costParts.length ? costParts.join(', ') : 'none'}`,
  ].join('\n');
}

function formatPetAdventureSummary(event, choice, outcome, applied = {}) {
  return formatPetRandomEventSummary(event, choice, outcome, applied);
}

const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;

function stripTelegramHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

function titleCasePetAction(value) {
  return String(value || '')
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTelegramPetMediaCaption(text, mediaKey = null) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';

  const firstLine = stripTelegramHtml(lines[0]).replace(/\.$/, '');
  const actionMatch = firstLine.match(/^Action accepted:\s*\/([a-z0-9_]+)\s*\(([^)]+)\)/i);
  const title = actionMatch
    ? `${titleCasePetAction(actionMatch[1])} Complete`
    : firstLine || titleCasePetAction(mediaKey || 'pet update') || 'Pet Update';
  const rewardLine = actionMatch
    ? actionMatch[2].replace(/\bpet XP\b/gi, 'Pet XP').replace(/\bcommunity XP\b/gi, 'Community XP')
    : stripTelegramHtml(lines.find((line, index) => index > 0 && /\+\d+|Rewards:|Banked:|Consolation:/i.test(line)) || '');

  const statusLine = stripTelegramHtml(lines.find((line) => /\|\s*Stage:\s*|\|\s*Level\s+\d+/i.test(line)) || '');
  const healthLine = stripTelegramHtml(lines.find((line) => /^Health\s/i.test(line)) || '');
  const energyLine = stripTelegramHtml(lines.find((line) => /^Energy\s/i.test(line)) || '');
  const petName = (statusLine.split('|')[0] || '').trim();
  const levelMatch = statusLine.match(/\bLevel\s+(\d+)/i);
  const healthMatch = healthLine.match(/(\d+\/100)\b/);
  const energyMatch = energyLine.match(/(\d+\/100)\b/);
  const petParts = [];
  if (levelMatch) petParts.push(`Level ${levelMatch[1]}`);
  if (energyMatch) petParts.push(`Energy ${energyMatch[1]}`);
  if (healthMatch) petParts.push(`Health ${healthMatch[1]}`);

  return [
    `<b>${escapeHtml(title)}</b>`,
    rewardLine ? escapeHtml(rewardLine) : '',
    petParts.length ? `${escapeHtml(petName || 'Moonpet')}: ${petParts.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}

function formatTelegramPetHeroCaption(text, mediaKey = null) {
  const compact = formatTelegramPetMediaCaption(text, mediaKey);
  if (compact && compact.length <= TELEGRAM_PHOTO_CAPTION_LIMIT) return compact;
  const firstLine = stripTelegramHtml(String(text || '').split(/\r?\n/).find((line) => line.trim()) || '');
  const title = firstLine || titleCasePetAction(mediaKey || 'pet update') || 'Pet Update';
  return `<b>${escapeHtml(title.slice(0, 120))}</b>\nFull details below.`;
}

function shouldUsePhotoCaptionOnly(text, mediaKey = null) {
  void mediaKey;
  const caption = formatTelegramPetMediaCaption(text, mediaKey);
  if (!caption || caption.length > TELEGRAM_PHOTO_CAPTION_LIMIT) return false;

  const firstLine = stripTelegramHtml(String(text || '').split(/\r?\n/).find((line) => line.trim()) || '');
  const normalizedFirstLine = firstLine.replace(/^[^A-Za-z0-9/]+/, '');
  if (!normalizedFirstLine) return false;
  return [
    /^Action accepted:\s*\/[a-z0-9_]+\s*\(/i,
    /^Item used:/i,
    /^Job complete:/i,
    /^Daily chest opened:/i,
    /^Trade won:/i,
    /^Trade lost:/i,
    /^Run Failed$/i,
    /^Boss Cleared$/i,
    /^Step\s+\d+\s+Cleared:/i,
    /^Run Complete$/i,
    /^Run Extracted$/i,
    /^Upgrade equipped:/i,
  ].some((pattern) => pattern.test(normalizedFirstLine));
}

async function sendTelegramPhoto(botToken, chatId, photo, extra = {}) {
  if (!botToken || !chatId || !photo) {
    return { ok: false, status: 0, error: 'missing_chat_or_token_or_photo' };
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo, ...extra }),
    });
    const responseText = await response.text();
    if (!response.ok) {
      console.log('TG photo failed', JSON.stringify({ status: response.status, chatId, response: responseText }));
      return { ok: false, status: response.status, response: responseText, error: 'telegram_photo_failed' };
    }
    return { ok: true, status: response.status, response: responseText };
  } catch (error) {
    console.log('TG photo exception:', error?.message || error);
    return { ok: false, status: 0, error: error?.message || String(error) };
  }
}

async function sendTelegramPetReply(botToken, chatId, text, extra = {}, mediaKey = null) {
  const resolvedMediaKey = resolvePetMediaKey(mediaKey);
  const photoUrl = resolvedMediaKey ? buildPetMediaUrl(resolvedMediaKey) : null;
  if (!photoUrl) {
    return sendTelegramMessage(botToken, chatId, text, extra);
  }

  const caption = formatTelegramPetMediaCaption(text, resolvedMediaKey);
  const captionOnly = shouldUsePhotoCaptionOnly(text, resolvedMediaKey);
  const photoExtra = {
    ...extra,
    caption: captionOnly ? caption : formatTelegramPetHeroCaption(text, resolvedMediaKey),
    parse_mode: 'HTML',
  };
  const photoResult = await sendTelegramPhoto(botToken, chatId, photoUrl, photoExtra)
    .catch((error) => ({ ok: false, error: error?.message || String(error) }));
  if (!photoResult.ok) {
    return sendTelegramMessage(botToken, chatId, text, extra);
  }
  if (!captionOnly) {
    return sendTelegramMessage(botToken, chatId, text);
  }
  return photoResult;
}

function resolvePetOutcomeMediaKey(action, beforePet, result = null) {
  const beforeLevel = beforePet ? getPetLevel(beforePet.pet_xp) : 0;
  const afterLevel = result?.pet ? getPetLevel(result.pet.pet_xp) : 0;
  if (afterLevel > beforeLevel) return 'level_up';
  return resolvePetMediaKey(action, result);
}

export const __petMediaTestHooks = Object.freeze({
  PET_MEDIA_MANIFEST,
  PET_RUN_CHOICE_LIBRARY,
  PET_RUN_MAX_DEPTH,
  PET_RUN_STEP_CHOICES,
  PET_KAIJU_CARDS,
  PET_KAIJU_CATEGORIES,
  PET_RANDOM_EVENTS,
  buildPetKaijuCardReplyMarkup,
  buildPetKaijuLobbyReplyMarkup,
  resolvePetKaijuBattle,
  buildPetRunChoiceReplyMarkup,
  buildPetRunExtractEventKey,
  buildPetRunStepEventKey,
  applyPetRunStatRewards,
  getUnaffordablePetRunCosts,
  buildPetMediaUrl,
  buildPetRandomEventReplyMarkup,
  buildPetAdventureReplyMarkup,
  buildPetBagReplyMarkup,
  buildPetPurchaseNextReplyMarkup,
  buildPetShopReplyMarkup,
  formatPetRunPrompt,
  formatPetRunRewards,
  formatPetRunStepSummary,
  formatPetRandomEventSummary,
  formatPetAdventureSummary,
  formatTelegramPetMediaCaption,
  formatTelegramPetHeroCaption,
  shouldUsePhotoCaptionOnly,
  resolvePetMediaKey,
  resolvePetAdventureEncounter,
  resolvePetRandomEncounter,
  resolvePetOutcomeMediaKey,
  selectPetAdventureEncounter,
  selectPetRandomEncounter,
  sendTelegramPhoto,
  sendTelegramPetReply,
});

async function handleTelegramUpdate(update, env) {
  const db  = env.DB;
  const tok = env.TELEGRAM_BOT_TOKEN;

  const msg = update.message || update.edited_message;

  if (update.callback_query) {
    const query = update.callback_query;
    const data = String(query.data || '');
    const fromUser = query.from || {};
    const telegramId = String(query.from?.id || '');
    const chatId = String(query.message?.chat?.id || '');
    if (data.startsWith('pet:') && telegramId && chatId) {
      const payload = data.slice(4);
      const eventKey = buildTelegramCallbackPetEventKey(query, telegramId, data);
      const chatType = String(query.message?.chat?.type || '');
      if (payload === 'shop') {
        await answerTelegramCallback(tok, query.id, '/petshop');
        await cmdPetShop(db, tok, chatId, telegramId);
        return;
      }
      if (payload === 'kaiju') {
        await answerTelegramCallback(tok, query.id, '/petkaiju');
        await cmdPetKaiju(db, tok, chatId, telegramId, '', chatType, fromUser, eventKey);
        return;
      }
      if (payload.startsWith('kaiju:')) {
        const kaijuPayload = payload.slice(6);
        await answerTelegramCallback(tok, query.id, '/petkaiju');
        await cmdPetKaiju(db, tok, chatId, telegramId, kaijuPayload, chatType, fromUser, eventKey);
        return;
      }
      if (payload.startsWith('buy:')) {
        const itemKey = payload.slice(4);
        await answerTelegramCallback(tok, query.id, `/petbuy ${itemKey}`);
        await cmdPetBuy(db, tok, chatId, telegramId, itemKey, eventKey);
        return;
      }
      if (payload === 'bag') {
        await answerTelegramCallback(tok, query.id, '/petbag');
        await cmdPetBag(db, tok, chatId, telegramId);
        return;
      }
      if (payload.startsWith('use:')) {
        const itemKey = payload.slice(4);
        await answerTelegramCallback(tok, query.id, `/petuse ${itemKey}`);
        await cmdPetUse(db, tok, chatId, telegramId, itemKey, eventKey);
        return;
      }
      if (payload === 'work') {
        await answerTelegramCallback(tok, query.id, '/petwork');
        await cmdPetWork(db, tok, chatId, telegramId, '', eventKey);
        return;
      }
      if (payload.startsWith('work:')) {
        const jobKey = payload.slice(5);
        await answerTelegramCallback(tok, query.id, `/petwork ${jobKey}`);
        await cmdPetWork(db, tok, chatId, telegramId, jobKey, eventKey);
        return;
      }
      if (payload === 'event') {
        await answerTelegramCallback(tok, query.id, '/petevent');
        await cmdPetEvent(db, tok, chatId, telegramId, '', eventKey);
        return;
      }
      if (payload.startsWith('event:')) {
        const eventPayload = payload.slice(6);
        const eventParts = eventPayload.split(':');
        if (eventParts.length >= 2) {
          const choice = eventParts.pop();
          const encounterKey = eventParts.join(':');
          await answerTelegramCallback(tok, query.id, `/petevent ${choice}`);
          await cmdPetEvent(db, tok, chatId, telegramId, choice, encounterKey);
          return;
        }
        const choice = eventParts[0];
        await answerTelegramCallback(tok, query.id, `/petevent ${choice}`);
        await cmdPetEvent(db, tok, chatId, telegramId, choice, eventKey);
        return;
      }
      if (payload === 'daily') {
        await answerTelegramCallback(tok, query.id, '/petdaily');
        await cmdPetDaily(db, tok, chatId, telegramId, eventKey);
        return;
      }
      if (payload === 'run') {
        await answerTelegramCallback(tok, query.id, '/petrun');
        await cmdPetRun(db, tok, chatId, telegramId, '', eventKey);
        return;
      }
      if (payload.startsWith('run:')) {
        const runParts = payload.slice(4).split(':');
        const runId = runParts.shift() || '';
        const runAction = runParts.shift() || '';
        if (runAction === 'extract') {
          const stableRunEventKey = buildPetRunExtractEventKey(telegramId, runId);
          await answerTelegramCallback(tok, query.id, '/petextract');
          await cmdPetExtract(db, tok, chatId, telegramId, runId, stableRunEventKey);
          return;
        }
        if (runAction === 'push') {
          await answerTelegramCallback(tok, query.id, '/petrun');
          await cmdPetRun(db, tok, chatId, telegramId, runId, buildStablePetEventKey(['pet_run_push', telegramId, runId]));
          return;
        }
        if (runAction === 'step') {
          const stepIndex = runParts.shift() || '';
          const choiceKey = runParts.shift() || '';
          const stableRunEventKey = buildPetRunStepEventKey(telegramId, runId, stepIndex, choiceKey);
          await answerTelegramCallback(tok, query.id, `/petrun ${choiceKey}`);
          await cmdPetRun(db, tok, chatId, telegramId, `${runId}:${choiceKey}`, stableRunEventKey, stepIndex);
          return;
        }
      }
      if (payload === 'adventure') {
        await answerTelegramCallback(tok, query.id, '/petrun');
        await cmdPetRun(db, tok, chatId, telegramId, '', eventKey);
        return;
      }
      if (payload.startsWith('adventure:')) {
        await answerTelegramCallback(tok, query.id, '/petrun');
        await cmdPetRun(db, tok, chatId, telegramId, '', eventKey);
        return;
      }
      const action = normalizePetAction(payload);
      if (action) {
        await answerTelegramCallback(tok, query.id, `/${action}`);
        await cmdPetAction(db, tok, chatId, telegramId, fromUser, action, eventKey);
      } else {
        await answerTelegramCallback(tok, query.id, 'Unknown pet action');
      }
    }
    return;
  }

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
  const chatType   = String(msg.chat?.type || '');
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
  const stableEventKey = buildTelegramMessagePetEventKey(msg, telegramId, cmdBase, argStr);

  switch (cmdBase) {
    // ── GK command set ────────────────────────────────────────────────────
    case 'gkstart':
    case 'start':        await cmdGkStart(db, tok, chatId, telegramId, fromUser);     break;
    case 'gkhelp':
    case 'help':         await cmdGkHelp(tok, chatId);                                break;
    case 'gklink':
    case 'link':         await cmdGkLink(db, tok, chatId, telegramId);               break;
    case 'gkstatus':     await cmdGkStatus(env, tok, chatId, telegramId, fromUser);  break;
    case 'gkseason':     await cmdGkSeason(db, tok, chatId);                         break;
    case 'gkleaderboard':
    case 'leaderboard':  await cmdGkLeaderboard(db, tok, chatId);                    break;
    case 'gkquests':
    case 'quest':        await cmdGkQuests(env, tok, chatId, telegramId, fromUser);  break;
    case 'gkfaction':
    case 'faction':      await cmdGkFaction(env, tok, chatId, telegramId, argStr, fromUser); break;
    case 'gkunlink':     await cmdGkUnlink(db, tok, chatId, telegramId);             break;
    case 'daily':        await cmdDaily(env, tok, chatId, telegramId, fromUser);     break;
    case 'solve':        await cmdSolve(tok, chatId);                                break;
    case 'profile':      await cmdProfile(db, tok, chatId, telegramId);              break;
    case 'pet':          await cmdPetStatus(db, tok, chatId, telegramId);            break;
    case 'adopt':        await cmdPetAction(db, tok, chatId, telegramId, fromUser, 'adopt', stableEventKey); break;
    case 'feed':
    case 'play':
    case 'clean':
    case 'sleep':
    case 'train':        await cmdPetAction(db, tok, chatId, telegramId, fromUser, cmdBase, stableEventKey); break;
    case 'pettrade':     await cmdPetTrade(db, tok, chatId, telegramId, argStr);     break;
    case 'petname':      await cmdPetRename(db, tok, chatId, telegramId, argStr);    break;
    case 'petmissions':  await cmdPetMissions(db, tok, chatId, telegramId);          break;
    case 'petshop':      await cmdPetShop(db, tok, chatId, telegramId);              break;
    case 'petbag':       await cmdPetBag(db, tok, chatId, telegramId);               break;
    case 'petbuy':       await cmdPetBuy(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petuse':       await cmdPetUse(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petwork':      await cmdPetWork(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petdaily':     await cmdPetDaily(db, tok, chatId, telegramId, stableEventKey); break;
    case 'petevent':     await cmdPetEvent(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petkaiju':
    case 'kaiju':        await cmdPetKaiju(db, tok, chatId, telegramId, argStr, chatType, fromUser, stableEventKey); break;
    case 'petrun':       await cmdPetRun(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petextract':   await cmdPetExtract(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petadventure': await cmdPetAdventure(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petnotify':    await cmdPetNotify(db, tok, chatId, telegramId, argStr);    break;
    case 'petleaderboard':
    case 'petscore':     await cmdPetLeaderboard(db, tok, chatId);                   break;
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
    `/pet — View your Crypto Moonboy Pet\n` +
    `/adopt — Adopt a Crypto Moonboy Pet\n` +
    `/feed /play /clean /sleep /train — Grow your pet\n` +
    `/petshop — View food, toy and clothing upgrades\n` +
    `/petbuy moon_kibble — Buy/equip a pet upgrade\n` +
    `/pettrade 25 — Risk in-game Moon Gold for game rewards\n` +
    `/petkaiju — Kaiju Sticker Battle in your pet menu\n` +
    `/petrun - Start or resume a 5-step pet run\n` +
    `/petextract - Bank current unbanked run rewards\n` +
    `/petadventure - Alias for the Pet Run Engine\n` +
    `/petnotify on — Enable pet needs alerts\n` +
    `/petleaderboard — Pet-only leaderboard\n` +
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

function formatPetStatus(pet, missions = null) {
  const p = serializePet(pet);
  if (!p) return 'No Crypto Moonboy Pet found. Use /adopt to start.';
  const bar = (value) => {
    const filled = Math.max(0, Math.min(10, Math.round((Number(value) || 0) / 10)));
    return `[${'='.repeat(filled)}${'.'.repeat(10 - filled)}]`;
  };
  const warnings = [];
  if (p.health <= 45) warnings.push('⚠️ Low health: urgent care needed.');
  if (p.hunger >= 75) warnings.push('🍖 High hunger: feed soon.');
  if (p.cleanliness <= 35) warnings.push('🧼 Low cleanliness: clean soon.');
  if (p.happiness <= 35) warnings.push('🎮 Low happiness: play soon.');
  if (p.energy <= 25) warnings.push('😴 Low energy: sleep before adventure.');
  const missionLines = Array.isArray(missions?.daily)
    ? missions.daily.map((m) => `${m.completed ? '✅' : '⬜'} ${escapeHtml(m.title)}`)
    : [];
  return [
    `🌕 <b>Pet</b>`,
    `${escapeHtml(p.pet_name)} | Stage: ${escapeHtml(p.stage)} | Level ${p.level} | XP ${p.pet_xp}`,
    `Health ${bar(p.health)} ${p.health}/100`,
    `Hunger ${bar(100 - p.hunger)} ${p.hunger}/100`,
    `Happiness ${bar(p.happiness)} ${p.happiness}/100`,
    `Cleanliness ${bar(p.cleanliness)} ${p.cleanliness}/100`,
    `Energy ${bar(p.energy)} ${p.energy}/100`,
    '',
    `💰 <b>Wallet</b>`,
    `Gold: ${p.moon_gold} | Crystals: ${p.moon_crystals} | Style: ${p.style_tokens}`,
    '',
    `🎒 <b>Gear</b>`,
    `Food: ${escapeHtml(p.equipped_food || 'basic')} | Toy: ${escapeHtml(p.equipped_toy || 'basic')} | Outfit: ${escapeHtml(p.equipped_outfit || 'none')}`,
    '',
    `📊 <b>Needs</b>`,
    ...(warnings.length ? warnings : ['All systems stable.']),
    '',
    `🎯 <b>Daily Missions</b>`,
    ...(missionLines.length ? missionLines : ['No missions available.']),
    '',
    `🔥 <b>Streak</b>`,
    `${p.streak_days} day(s)`,
  ].join('\n');
}

function petReplyMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '🍖 Feed', callback_data: 'pet:feed' },
        { text: '🎮 Play', callback_data: 'pet:play' },
        { text: '🧼 Clean', callback_data: 'pet:clean' },
      ],
      [
        { text: '😴 Sleep', callback_data: 'pet:sleep' },
        { text: '🏋️ Train', callback_data: 'pet:train' },
      ],
      [
        { text: '🛒 Shop', callback_data: 'pet:shop' },
        { text: '🎒 Bag', callback_data: 'pet:bag' },
        { text: '💼 Work', callback_data: 'pet:work' },
      ],
      [
        { text: '🎲 Event', callback_data: 'pet:event' },
        { text: '🎁 Daily', callback_data: 'pet:daily' },
        { text: '🦖 Kaiju', callback_data: 'pet:kaiju' },
      ],
      [
        { text: '🏃 Run', callback_data: 'pet:run' },
      ],
      [
        { text: '📖 How To Play', url: `${SITE_URL}/how-to-play-crypto-moonboy-pets.html` },
        { text: '🏆 Pet Leaderboard', url: `${SITE_URL}/crypto-moonboy-pets-leaderboard.html` },
      ],
    ],
  };
}
async function cmdPetStatus(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const missions = await buildPetMissions(db, telegramId).catch(() => null);
  await sendTelegramPetReply(tok, chatId, formatPetStatus(pet, missions), { reply_markup: petReplyMarkup() }, 'how_to_play');
}

async function cmdPetBag(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const inventory = await getPetInventory(db, telegramId);
  const lines = inventory.map((item) => `${item.count > 0 ? '✅' : '⬜'} <code>${escapeHtml(item.key)}</code> — ${escapeHtml(item.title)} x${item.count}\n  ${escapeHtml(item.description || '')}`).join('\n\n');
  const usableCount = inventory.filter((item) => Number(item.count || 0) > 0).length;
  await sendTelegramPetReply(
    tok,
    chatId,
    `<b>🎒 Crypto Moonboy Pet Bag</b>\n` +
      `${usableCount ? 'Choose an item below to use it.' : 'No usable items yet. Grind jobs, events, adventures, and daily chests to find items.'}\n\n` +
      `${lines}`,
    { reply_markup: buildPetBagReplyMarkup(inventory) },
    'bag',
  );
}


function formatPetKaijuLobby(match, queue = []) {
  return [
    `🦖 <b>Kaiju Sticker Battle</b>`,
    `Table: <code>${escapeHtml(match.match_id)}</code>`,
    '',
    `Host: <code>${escapeHtml(match.player1_telegram_id)}</code>`,
    `Mode: ${match.mode === 'group' ? 'Group 2-player' : 'Player vs App'}`,
    '',
    `Pick a kaiju sticker card. The app rolls one stat: PWR, SIZE, ATK, DEF, SPD or LGCY. Highest stat wins.`,
    '',
    queue.length ? `Queue: ${queue.map((id) => `<code>${escapeHtml(id)}</code>`).join(', ')}` : `No queue yet.`,
  ].join('\n');
}

function formatPetKaijuResult(result) {
  const score = (() => {
    try { return JSON.parse(result?.match?.score_json || '{}'); } catch { return {}; }
  })();
  const category = score?.category || result?.resolved?.category || {};
  const player1 = score?.player1 || {};
  const opponent = score?.opponent || {};
  const winnerLine = result?.match?.winner_telegram_id
    ? `Winner: <code>${escapeHtml(result.match.winner_telegram_id)}</code>`
    : score?.result === 'player2_win' && opponent.telegram_id === 'app'
      ? `Winner: App`
      : `Result: draw`;
  const queueLine = result?.queue?.length
    ? `Next in queue: ${result.queue.map((id) => `<code>${escapeHtml(id)}</code>`).join(', ')}`
    : `Queue clear. Use /petkaiju to open the next table.`;
  return [
    `🦖 <b>Kaiju Sticker Battle Result</b>`,
    `${escapeHtml(category.name || 'Stat')} (${escapeHtml(category.label || category.key || '?')}) was rolled.`,
    '',
    `P1 <code>${escapeHtml(player1.telegram_id || '')}</code>: ${escapeHtml(player1.card || '')} = ${Number(player1.score || 0)}`,
    `${opponent.telegram_id === 'app' ? 'App' : 'P2'} <code>${escapeHtml(opponent.telegram_id || 'app')}</code>: ${escapeHtml(opponent.card || '')} = ${Number(opponent.score || 0)}`,
    '',
    winnerLine,
    `Rewards: winner +38 pet XP/+8 Community XP; draw +22/+4; loss +12/+2, all daily capped.`,
    '',
    queueLine,
  ].join('\n');
}

async function cmdPetKaiju(db, tok, chatId, telegramId, argStr = '', chatType = '', fromUser = {}, eventKey = null) {
  await upsertTelegramUser(db, fromUser).catch(() => {});
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'You need a Moonpet first. Use /adopt to start.');
    return;
  }

  const args = String(argStr || '').trim().split(':').filter(Boolean);
  const action = args.shift() || '';
  const groupChat = isTelegramGroupChat(chatId, chatType);

  if (action === 'join') {
    const match = await getPetKaijuMatch(db, args[0]);
    if (!match || String(match.chat_id) !== String(chatId)) {
      await sendTelegramMessage(tok, chatId, 'That Kaiju table is gone. Use /petkaiju to open a new one.');
      return;
    }
    if (match.status !== 'open') {
      const position = await enqueuePetKaijuPlayer(db, chatId, telegramId);
      await sendTelegramMessage(tok, chatId, `That table is already choosing cards. You are queued at position ${position}.`);
      return;
    }
    if (String(match.player1_telegram_id) === String(telegramId)) {
      await sendTelegramMessage(tok, chatId, 'You are already hosting this Kaiju table. Pick Start vs App or wait for a challenger.');
      return;
    }
    const joinResult = await db.prepare(`
      UPDATE telegram_pet_kaiju_matches
      SET player2_telegram_id = ?, mode = 'group', status = 'selecting', updated_at = CURRENT_TIMESTAMP
      WHERE match_id = ? AND status = 'open' AND player2_telegram_id IS NULL
    `).bind(String(telegramId), match.match_id).run();
    if (joinResult?.meta?.changes !== undefined && Number(joinResult.meta.changes || 0) <= 0) {
      const fresh = await getPetKaijuMatch(db, match.match_id);
      if (fresh?.status === 'selecting') {
        const position = await enqueuePetKaijuPlayer(db, chatId, telegramId);
        await sendTelegramMessage(tok, chatId, `That Kaiju table filled first. You are queued at position ${position}.`);
        return;
      }
      await sendTelegramMessage(tok, chatId, 'That Kaiju table changed before you joined. Use /petkaiju to refresh.');
      return;
    }
    const updated = await getPetKaijuMatch(db, match.match_id);
    await sendTelegramPetReply(tok, chatId, `🦖 <b>Kaiju Battle locked in.</b>\nPlayers: <code>${escapeHtml(updated.player1_telegram_id)}</code> vs <code>${escapeHtml(updated.player2_telegram_id)}</code>\n\nChoose your card.`, { reply_markup: buildPetKaijuCardReplyMarkup(updated) }, 'play');
    return;
  }

  if (action === 'cpu') {
    const match = await getPetKaijuMatch(db, args[0]);
    if (!match || String(match.chat_id) !== String(chatId) || String(match.player1_telegram_id) !== String(telegramId) || match.status !== 'open') {
      await sendTelegramMessage(tok, chatId, 'That Kaiju table cannot start vs app. Use /petkaiju to refresh.');
      return;
    }
    await db.prepare(`
      UPDATE telegram_pet_kaiju_matches
      SET mode = 'solo', status = 'selecting', updated_at = CURRENT_TIMESTAMP
      WHERE match_id = ? AND status = 'open'
    `).bind(match.match_id).run();
    const updated = await getPetKaijuMatch(db, match.match_id);
    await sendTelegramPetReply(tok, chatId, `🤖 <b>Kaiju vs App</b>\nChoose your sticker card.`, { reply_markup: buildPetKaijuCardReplyMarkup(updated) }, 'play');
    return;
  }

  if (action === 'card') {
    const match = await getPetKaijuMatch(db, args[0]);
    const cardKey = normalizePetKaijuCardKey(args[1]);
    if (!match || String(match.chat_id) !== String(chatId)) {
      await sendTelegramMessage(tok, chatId, 'That Kaiju battle is gone. Use /petkaiju to start again.');
      return;
    }
    if (match.status === 'completed') {
      await sendTelegramMessage(tok, chatId, 'That Kaiju battle is already complete. Use /petkaiju for a new table.');
      return;
    }
    if (!cardKey) {
      await sendTelegramMessage(tok, chatId, 'That Kaiju card is not available. Use /petkaiju to refresh the deck.');
      return;
    }
    if (String(match.player1_telegram_id) !== String(telegramId) && String(match.player2_telegram_id || '') !== String(telegramId)) {
      if (groupChat) {
        const position = await enqueuePetKaijuPlayer(db, chatId, telegramId);
        await sendTelegramMessage(tok, chatId, `You are not in this Kaiju battle, so you are queued at position ${position}.`);
      }
      return;
    }
    if (String(match.player1_telegram_id) === String(telegramId)) {
      const cpuCard = match.mode === 'solo' ? pickPetKaijuCpuCard(cardKey).id : match.cpu_card_key || null;
      const category = match.category_key ? PET_KAIJU_CATEGORIES.find((entry) => entry.key === match.category_key) : pickPetKaijuCategory();
      const lockResult = await db.prepare(`
        UPDATE telegram_pet_kaiju_matches
        SET player1_card_key = ?, cpu_card_key = COALESCE(?, cpu_card_key), category_key = COALESCE(category_key, ?), roll = CASE WHEN roll IS NULL OR roll = 0 THEN ? ELSE roll END, updated_at = CURRENT_TIMESTAMP
        WHERE match_id = ? AND status = 'selecting' AND player1_card_key IS NULL
      `).bind(cardKey, cpuCard, category.key, category.roll, match.match_id).run();
      if (lockResult?.meta?.changes !== undefined && Number(lockResult.meta.changes || 0) <= 0) {
        await sendTelegramMessage(tok, chatId, `Card already locked for <code>${escapeHtml(telegramId)}</code>. Waiting for the other player.`);
        return;
      }
    } else {
      const lockResult = await db.prepare(`
        UPDATE telegram_pet_kaiju_matches
        SET player2_card_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE match_id = ? AND status = 'selecting' AND player2_card_key IS NULL
      `).bind(cardKey, match.match_id).run();
      if (lockResult?.meta?.changes !== undefined && Number(lockResult.meta.changes || 0) <= 0) {
        await sendTelegramMessage(tok, chatId, `Card already locked for <code>${escapeHtml(telegramId)}</code>. Waiting for the other player.`);
        return;
      }
    }
    const updated = await getPetKaijuMatch(db, match.match_id);
    const ready = updated.mode === 'solo'
      ? updated.player1_card_key && updated.cpu_card_key
      : updated.player1_card_key && updated.player2_card_key;
    if (!ready) {
      await sendTelegramMessage(tok, chatId, `Card locked for <code>${escapeHtml(telegramId)}</code>. Waiting for the other player.`);
      return;
    }
    const completed = await finishPetKaijuMatch(db, updated);
    await sendTelegramPetReply(tok, chatId, formatPetKaijuResult(completed), { reply_markup: petReplyMarkup() }, 'play');
    return;
  }

  if (!groupChat) {
    const active = await getActivePetKaijuMatch(db, chatId).catch(() => null);
    const match = active && String(active.player1_telegram_id) === String(telegramId) && active.mode === 'solo'
      ? active
      : await createPetKaijuMatch(db, chatId, telegramId, 'solo');
    await sendTelegramPetReply(
      tok,
      chatId,
      `🦖 <b>Kaiju Sticker Battle: Player vs App</b>\nChoose a card.\n\n${formatPetKaijuCardList()}`,
      { reply_markup: buildPetKaijuCardReplyMarkup(match) },
      'play',
    );
    return;
  }

  const active = await getActivePetKaijuMatch(db, chatId).catch(() => null);
  if (!active) {
    const match = await createPetKaijuMatch(db, chatId, telegramId, 'group');
    await sendTelegramPetReply(tok, chatId, formatPetKaijuLobby(match), { reply_markup: buildPetKaijuLobbyReplyMarkup(match) }, 'play');
    return;
  }
  if (String(active.player1_telegram_id) === String(telegramId) || String(active.player2_telegram_id || '') === String(telegramId)) {
    const markup = active.status === 'open' ? buildPetKaijuLobbyReplyMarkup(active) : buildPetKaijuCardReplyMarkup(active);
    await sendTelegramPetReply(tok, chatId, formatPetKaijuLobby(active, await getPetKaijuQueue(db, chatId, [active.player1_telegram_id, active.player2_telegram_id || ''])), { reply_markup: markup }, 'play');
    return;
  }
  const position = await enqueuePetKaijuPlayer(db, chatId, telegramId);
  await sendTelegramMessage(tok, chatId, `Kaiju table is busy. You are queued at position ${position}. When it clears, use /petkaiju to open or join the next battle.`);
}

function formatPetBlockedCopy(kind, reason, extra = {}) {
  const code = String(reason || 'not accepted');
  if (code === 'pet_tired') return `Moonpet is too tired for a ${kind}. Tap /sleep, then try again.`;
  if (code === 'cooldown' || code === 'trade_cooldown' || code === 'adventure_cooldown') {
    return `Moonpet needs a short break before another ${kind}. Try again in ${extra.retry_after_seconds || 0}s.`;
  }
  if (code === 'run_not_found') return `No active pet run found. Use /petrun to start one.`;
  if (code === 'run_empty') return `Clear at least one run step before extracting. Use /petrun to pick a route.`;
  if (code === 'invalid_run_choice') return `That run choice is not available on this step. Use /petrun to refresh the run.`;
  if (code === 'run_closed') return `That run is already closed. Use /petrun to start or resume the next one.`;
  if (code === 'stale_run_step') return `That run button is from an older step. Use /petrun to see the current choice.`;
  if (code === 'insufficient_run_cost') return `Moonpet cannot afford that run choice cost. Try another route or extract first.`;
  if (code === 'pet_not_adopted') return `You need a Moonpet first. Use /adopt to start.`;
  if (code === 'already_equipped') return `That ${kind} is already equipped.`;
  if (code === 'level_locked') return `That ${kind} unlocks at level ${extra.item?.min_level || '?'}.`;
  if (code === 'not_enough_pet_currency') return `Not enough pet currency for that ${kind}. Run /petshop to check the cost.`;
  if (code === 'item_not_found' || code === 'insufficient_gold' || code === 'insufficient_crystals' || code === 'insufficient_style') {
    return `That ${kind} is not available right now. Check /petbag or /petshop and try again.`;
  }
  return `Pet ${kind} blocked: ${code}.`;
}
async function cmdPetUse(db, tok, chatId, telegramId, argStr, eventKey = null) {
  const itemKey = normalizePetInventoryItemKey(argStr);
  const result = await processPetUseItem(db, telegramId, itemKey || argStr, {
    event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'petuse', argStr || '']),
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_use_failed' }));
  if (result.duplicate) {
    await sendTelegramMessage(tok, chatId, 'That bag item button was already handled. Open Bag again to use another item.');
    return;
  }
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('item use', result.reason, result));
    return;
  }
  const inventory = await getPetInventory(db, telegramId).catch(() => []);
  await sendTelegramPetReply(
    tok,
    chatId,
    `Item used: <b>${escapeHtml(result.item?.title || itemKey || 'item')}</b>.\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`,
    { reply_markup: buildPetBagReplyMarkup(inventory) },
    'bag',
  );
}

async function cmdPetWork(db, tok, chatId, telegramId, argStr, eventKey = null) {
  const jobKey = normalizePetJobKey(argStr);
  if (!jobKey) {
    const jobs = Object.values(PET_JOBS).map((job) => `- /petwork ${job.key} - ${job.title}`).join("\n");
    await sendTelegramPetReply(tok, chatId, `<b>💼 Pet Jobs</b>\n${jobs}`, {
      reply_markup: {
        inline_keyboard: [
          Object.values(PET_JOBS).map((job) => ({ text: job.title, callback_data: `pet:work:${job.key}` })),
          [{ text: 'Back', callback_data: 'pet:bag' }],
        ],
      },
    }, 'work');
    return;
  }
  const result = await processPetJob(db, telegramId, jobKey, {
    event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'petwork', jobKey]),
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_work_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('job', result.reason, result));
    return;
  }
  await sendTelegramPetReply(tok, chatId, `Job complete: ${escapeHtml(result.job?.title || jobKey)}.\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: petReplyMarkup() }, 'work');
}

async function cmdPetDaily(db, tok, chatId, telegramId, eventKey = null) {
  const dayKey = getPetDayKey(new Date());
  const result = await processPetDailyChest(db, telegramId, {
    event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'daily', dayKey]),
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_daily_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('daily chest', result.reason, result));
    return;
  }
  await sendTelegramPetReply(tok, chatId, `Daily chest opened: +${result.pet_xp_awarded || 0} pet XP.\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: petReplyMarkup() }, 'daily');
}

async function cmdPetEvent(db, tok, chatId, telegramId, argStr, eventKey = null) {
  const choice = normalizePetRandomEventChoice(argStr);
  if (!choice || (!eventKey && choice !== 'open' && choice !== 'sell' && choice !== 'ignore')) {
    const encounter = selectPetRandomEncounter();
    if (!encounter) {
      await sendTelegramMessage(tok, chatId, 'No pet encounters are available right now.');
      return;
    }
    await sendTelegramPetReply(tok, chatId,
      `<b>${escapeHtml(encounter.title)}</b>
${escapeHtml(encounter.intro)}

Choose one of the actions below.`,
      { reply_markup: buildPetRandomEventReplyMarkup(encounter) },
      'event',
    );
    return;
  }
  const result = await processPetRandomEvent(db, telegramId, choice, {
    event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'petevent', choice]),
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_event_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('event', result.reason, result));
    return;
  }
  const summary = formatPetRandomEventSummary(result.encounter, result.choice, { copy: result.result_copy }, result.applied);
  await sendTelegramPetReply(tok, chatId, `${summary}

${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: petReplyMarkup() }, "event");
}
async function cmdPetAction(db, tok, chatId, telegramId, fromUser, action, stableEventKey = null) {
  await upsertTelegramUser(db, fromUser).catch(() => {});
  const result = await processPetAction(db, telegramId, action, {
    event_key: stableEventKey || buildStablePetEventKey(['tg', telegramId, action, 'msg', fromUser?.id || telegramId]),
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_action_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy(action, result.reason, result));
    return;
  }
  const prefix = action === 'adopt'
    ? 'Crypto Moonboy Pet adopted.'
    : `Action accepted: /${escapeHtml(action)} (+${result.pet_xp_awarded || 0} pet XP, +${result.xp_awarded || 0} Community XP).`;
  await sendTelegramPetReply(tok, chatId, `${prefix}\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: petReplyMarkup() }, action === 'adopt' ? 'level_up' : action);
}

async function cmdPetTrade(db, tok, chatId, telegramId, argStr) {
  const result = await processPetGoldTrade(db, telegramId, argStr, {
    event_key: buildStablePetEventKey(['tg', telegramId, 'trade', argStr || 'msg']),
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_trade_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('trade', result.reason, result));
    return;
  }
  const outcome = result.won
    ? `🎰 Trade won: +${result.gold_delta} gold, +${result.crystal_delta} crystals, +${result.pet_xp_awarded || 0} pet XP.`
    : `🎰 Trade lost: ${result.gold_delta} gold, +${result.pet_xp_awarded || 0} pet XP.`;
  await sendTelegramPetReply(tok, chatId, `${escapeHtml(outcome)}\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: petReplyMarkup() }, result.won ? 'trade_win' : 'trade_loss');
}

async function cmdPetRename(db, tok, chatId, telegramId, argStr) {
  const petName = normalizePetName(argStr);
  if (!petName) {
    await sendTelegramMessage(tok, chatId, 'Use it like this: /petname Moon Runner');
    return;
  }
  const result = await processPetAction(db, telegramId, 'rename', { pet_name: petName, source: 'telegram_command' });
  await sendTelegramPetReply(tok, chatId, `🌕 Pet renamed.\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: petReplyMarkup() }, 'level_up');
}

async function cmdPetMissions(db, tok, chatId, telegramId) {
  const missions = await buildPetMissions(db, telegramId);
  const daily = missions.daily.map((m) => `${m.completed ? '✅' : '⬜'} ${escapeHtml(m.title)}`).join('\n');
  await sendTelegramPetReply(tok, chatId,
    `<b>🎯 Crypto Moonboy Pets Missions</b>\n` +
    `Day: ${escapeHtml(missions.day_key)}\n` +
    `Week: ${escapeHtml(missions.week_key)}\n` +
    `Season: ${escapeHtml(missions.season.key)}\n\n${daily}`,
    {},
    'daily',
  );
}

async function cmdPetShop(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const p = serializePet(pet);
  const items = petShopItemsForPet(pet);
  const lines = items.map((item) => {
    const cost = item.cost || {};
    const state = item.equipped ? 'equipped' : item.affordable ? 'ready' : item.unlocked ? 'need currency' : `level ${item.min_level}`;
    return `${item.equipped ? '✅' : '⬜'} <code>${escapeHtml(item.key)}</code> — ${escapeHtml(item.title)} [${escapeHtml(state)}]\n` +
      `  Cost: ${cost.moon_gold || 0} gold, ${cost.moon_crystals || 0} crystals, ${cost.style_tokens || 0} style\n` +
      `  ${escapeHtml(item.description)}`;
  }).join('\n\n');
  await sendTelegramPetReply(tok, chatId,
    `<b>🛒 Crypto Moonboy Pet Shop</b>\n` +
    `Balance: ${p.moon_gold} gold · ${p.moon_crystals} crystals · ${p.style_tokens} style\n\n` +
    `${lines}\n\n` +
    `Buy/equip: <code>/petbuy moon_kibble</code>\n` +
    `🎰 Risk game gold: <code>/pettrade 25</code>\n` +
    `Pet Run: <code>/petrun</code> | Extract: <code>/petextract</code>\n` +
    `🔔 Alerts: <code>/petnotify on</code>`,
    { reply_markup: buildPetShopReplyMarkup(items) },
    'shop',
  );
}

async function cmdPetBuy(db, tok, chatId, telegramId, argStr, eventKey = null) {
  const itemKey = normalizePetShopItemKey(argStr);
  if (!itemKey) {
    await sendTelegramMessage(tok, chatId, 'Use it like this: /petbuy moon_kibble. Run /petshop to see item keys.');
    return;
  }
  const result = await processPetShopPurchase(db, telegramId, itemKey, {
    event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'buy', itemKey, 'msg']),
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_buy_failed' }));
  if (result.duplicate) {
    await sendTelegramMessage(tok, chatId, 'That shop button was already handled. Open Shop again to buy another upgrade.');
    return;
  }
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('shop purchase', result.reason, result));
    return;
  }
  await sendTelegramPetReply(
    tok,
    chatId,
    `🛒 Upgrade equipped: <b>${escapeHtml(result.item.title)}</b>.\n\n` +
      `<b>Next upgrade run</b>\n` +
      `Buy another upgrade, spend resources deeper, or grind more gold/crystals/style before the next tier.\n\n` +
      `${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`,
    { reply_markup: buildPetPurchaseNextReplyMarkup(result.pet) },
    'purchase_complete',
  );
}

async function cmdPetRun(db, tok, chatId, telegramId, argStr = '', eventKey = null, expectedStepIndex = null) {
  const parts = String(argStr || '').split(':').map((part) => String(part || '').trim()).filter(Boolean);
  const first = parts[0] || '';
  const choiceKey = normalizePetRunChoiceKey(parts.length >= 2 ? parts[1] : first);
  const runId = choiceKey && parts.length >= 2 ? first : normalizePetRunChoiceKey(first) ? '' : first;
  if (!choiceKey) {
    const result = await startOrResumePetRun(db, telegramId, {
      run_id: runId || null,
      source: 'telegram_command',
    }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_run_failed' }));
    if (!result.accepted) {
      await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('run', result.reason, result));
      return;
    }
    await sendTelegramPetReply(
      tok,
      chatId,
      formatPetRunPrompt(result.run, result.pet),
      { reply_markup: buildPetRunChoiceReplyMarkup(result.run) },
      'petrun',
    );
    return;
  }

  const activeRun = runId ? await getPetRunById(db, telegramId, runId) : await getActivePetRun(db, telegramId);
  const stepIndex = Math.max(1, Number(activeRun?.depth || 0) + 1);
  const result = await processPetRunStep(db, telegramId, runId || activeRun?.run_id || '', choiceKey, {
    event_key: eventKey || buildPetRunStepEventKey(telegramId, runId || activeRun?.run_id || 'active', stepIndex, choiceKey),
    expected_step_index: expectedStepIndex,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_run_step_failed' }));
  if (result.duplicate) {
    await sendTelegramMessage(tok, chatId, 'That run button was already handled. Use /petrun to see the current run.');
    return;
  }
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('run', result.reason, result));
    return;
  }
  const summary = result.reason === 'run_completed' ? formatPetRunStepSummary(result) : formatPetRunStepSummary(result);
  const markup = result.reason === 'run_step_complete'
    ? buildPetRunAfterStepReplyMarkup(result.run)
    : petReplyMarkup();
  await sendTelegramPetReply(tok, chatId, `${summary}\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: markup }, result.reason === 'run_failed' ? 'adventure_fail' : 'adventure_win');
}

async function cmdPetExtract(db, tok, chatId, telegramId, argStr = '', eventKey = null) {
  const result = await processPetRunExtract(db, telegramId, argStr, {
    event_key: eventKey || null,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_extract_failed' }));
  if (result.duplicate) {
    await sendTelegramMessage(tok, chatId, 'That extract was already banked. Use /petrun to start or resume a run.');
    return;
  }
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('extract', result.reason, result));
    return;
  }
  await sendTelegramPetReply(
    tok,
    chatId,
    `${formatPetRunBankSummary(result)}\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`,
    { reply_markup: petReplyMarkup() },
    'adventure_win',
  );
}

async function cmdPetAdventure(db, tok, chatId, telegramId, argStr = '', eventKey = null) {
  void argStr;
  await cmdPetRun(db, tok, chatId, telegramId, '', eventKey);
}

async function cmdPetNotify(db, tok, chatId, telegramId, argStr = '') {
  const setting = String(argStr || '').trim().toLowerCase();
  if (!setting || setting === 'status') {
    const pref = await getPetNotificationPreference(db, telegramId);
    await sendTelegramMessage(tok, chatId, `Pet needs alerts are ${pref.enabled ? 'enabled' : 'disabled'}. Use /petnotify on or /petnotify off.`);
    return;
  }
  if (setting === 'on' || setting === 'enable') {
    await setPetNotificationPreference(db, telegramId, true);
    await sendTelegramMessage(tok, chatId, 'Pet needs alerts enabled. Use /petnotify off to stop them.');
    return;
  }
  if (setting === 'off' || setting === 'disable') {
    await setPetNotificationPreference(db, telegramId, false);
    await sendTelegramMessage(tok, chatId, 'Pet needs alerts disabled.');
    return;
  }
  await sendTelegramMessage(tok, chatId, 'Use /petnotify on, /petnotify off, or /petnotify status.');
}

async function cmdPetLeaderboard(db, tok, chatId) {
  const season = getPetSeasonInfo(new Date());
  const rows = await db.prepare(`
    SELECT s.telegram_id, s.season_xp, p.pet_name, p.stage, p.level,
           u.username, u.first_name, u.last_name
    FROM telegram_pet_season_state s
    LEFT JOIN telegram_pet_profiles p ON p.telegram_id = s.telegram_id
    LEFT JOIN telegram_users u ON u.telegram_id = s.telegram_id
    WHERE s.season_key = ?
    ORDER BY s.season_xp DESC
    LIMIT 10
  `).bind(season.key).all().catch(() => ({ results: [] }));
  if (!rows.results?.length) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pets leaderboard entries yet. Use /adopt to start.');
    return;
  }
  const lines = rows.results.map((row, index) => (
    `${index + 1}. ${escapeHtml(displayNameFromRow(row))} — ${escapeHtml(row.pet_name || 'Moonpet')} (${escapeHtml(row.stage || 'egg')}) ${row.season_xp || 0} pet XP`
  ));
  await sendTelegramPetReply(tok, chatId, `<b>Crypto Moonboy Pets Leaderboard</b>\n${escapeHtml(season.key)}\n\n${lines.join('\n')}`, {}, 'leaderboard');
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

function buildTelegramLoopVerifiedIdentity(telegramId, fromUser = {}) {
  const id = String(telegramId || fromUser?.id || '').trim();
  if (!id) return null;
  return {
    telegramId: id,
    user: {
      id,
      username: fromUser?.username || null,
      first_name: fromUser?.first_name || null,
      last_name: fromUser?.last_name || null,
    },
  };
}

async function buildTelegramCommandDailyLoopState(env, telegramId, fromUser = {}) {
  const verified = buildTelegramLoopVerifiedIdentity(telegramId, fromUser);
  return buildDailyLoopState(env, verified ? { verified } : {});
}

function formatResetCountdown(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatSourceStatusForTelegram(status, emptyCopy = 'no activity yet') {
  const state = status?.state || 'unavailable';
  if (state === 'live') return 'synced';
  if (state === 'live_empty') return emptyCopy;
  if (state === 'preview') return 'preview/scheduled';
  if (state === 'migration_pending') return 'migration pending';
  if (state === 'query_failed') return 'sync unavailable';
  return 'unavailable';
}

function formatLoopResetLine(loop) {
  return `UTC day: ${escapeHtml(loop.utc_day)} | Reset: ${escapeHtml(formatResetCountdown(loop.seconds_until_reset))} (${escapeHtml(loop.next_utc_reset_at)})`;
}

function formatIdentityLine(loop) {
  if (!loop.identity?.linked) return 'Identity: public/anonymous state';
  const profile = loop.identity.profile || loop.identity;
  const label = profile.username ? `@${profile.username}` : (profile.first_name || profile.telegram_id || 'Telegram user');
  const xp = Number(profile.xp);
  const level = Number(profile.level);
  const progress = Number.isFinite(xp) ? ` | XP ${xp} | Level ${Number.isFinite(level) ? level : 1}` : '';
  return `Identity: linked ${escapeHtml(label)}${progress}`;
}

function getLoopFactionLabel(loop) {
  return loop.faction_state?.label || loop.faction_state?.faction_id || 'Unaligned';
}

function formatMissionSummary(missions, emptyCopy = 'no missions yet') {
  const items = Array.isArray(missions?.items) ? missions.items : [];
  if (!items.length) return emptyCopy;
  const completed = items.filter((item) => item.completed).length;
  return `${completed}/${items.length} complete`;
}

function formatMissionLines(missions, limit = 3) {
  const items = Array.isArray(missions?.items) ? missions.items.slice(0, limit) : [];
  if (!items.length) return [];
  return items.map((item, index) => {
    const title = item.title || item.mission_id || item.page_id || 'Mission';
    const progress = item.completed ? 'complete' : `${Math.max(0, Math.floor(Number(item.progress) || 0))} / ?`;
    return `${index + 1}. ${escapeHtml(title)} - ${escapeHtml(progress)}`;
  });
}

function formatWikiMissionSummary(wikiMissions) {
  const items = Array.isArray(wikiMissions?.items) ? wikiMissions.items : [];
  if (!items.length) return 'no wiki completions yet';
  const xp = items.reduce((total, item) => total + Math.max(0, Math.floor(Number(item.xp_awarded) || 0)), 0);
  return `${items.length} completions${xp ? ` | ${xp} XP recorded` : ''}`;
}

function formatWikiMissionLines(wikiMissions, limit = 3) {
  const items = Array.isArray(wikiMissions?.items) ? wikiMissions.items.slice(0, limit) : [];
  return items.map((item, index) => {
    const page = item.page_id || 'wiki page';
    const mission = item.mission_id || 'mission';
    return `${index + 1}. ${escapeHtml(page)} - ${escapeHtml(mission)}`;
  });
}

function formatDailyWtfLine(loop) {
  const status = loop.source_status?.daily_wtf_status;
  const sourceCopy = formatSourceStatusForTelegram(status);
  const event = Array.isArray(loop.daily_wtf_status?.events) ? loop.daily_wtf_status.events[0] : null;
  if (!event) return `Daily WTF: ${sourceCopy}`;
  const label = event.title || event.event_id || 'scheduled event';
  const eventStatus = event.player_status || event.status || 'scheduled';
  return `Daily WTF: ${sourceCopy} - ${escapeHtml(label)} (${escapeHtml(eventStatus)})`;
}

function formatMissedOpportunityLine(loop) {
  const status = loop.source_status?.missed_opportunities;
  const sourceCopy = formatSourceStatusForTelegram(status, 'no missed opportunities yet');
  const missed = loop.missed_opportunities || {};
  return `Missed opportunities: ${Math.max(0, Number(missed.total_today) || 0)} today / ${Math.max(0, Number(missed.total_all_time) || 0)} all-time (${sourceCopy})`;
}

function formatBattleActivityLine(loop) {
  const status = loop.source_status?.battle_chamber_activity;
  const sourceCopy = formatSourceStatusForTelegram(status, 'no Battle Chamber activity yet');
  const battle = loop.battle_chamber_activity || {};
  const standings = Array.isArray(battle.standings) ? battle.standings.length : 0;
  const recent = Array.isArray(battle.recent_activity) ? battle.recent_activity.length : 0;
  return `Battle Chamber: ${standings} standings / ${recent} recent events (${sourceCopy})`;
}

function formatDigestLine(loop) {
  const status = loop.source_status?.telegram_digest_group_status;
  const sourceCopy = formatSourceStatusForTelegram(status, 'no digest or group announcements yet');
  const digest = loop.telegram_digest_group_status?.digest;
  const groupAnnouncements = Array.isArray(loop.telegram_digest_group_status?.group_announcements)
    ? loop.telegram_digest_group_status.group_announcements.length
    : 0;
  return `Digest/group: digest ${escapeHtml(digest?.status || 'not sent')} / ${groupAnnouncements} announcements (${sourceCopy})`;
}

function formatDailyLoopSourceSummary(loop, keys) {
  const pieces = [];
  for (const key of keys) {
    const status = loop.source_status?.[key];
    const copy = formatSourceStatusForTelegram(status);
    if (copy !== 'synced') pieces.push(`${key}: ${copy}`);
  }
  return pieces.length ? `Source truth: ${escapeHtml(pieces.join('; '))}` : 'Source truth: synced';
}

function formatNextBestAction(loop) {
  if (!loop.identity?.linked) return 'Next: run /gklink for linked personal progress.';
  const missions = Array.isArray(loop.daily_missions?.items) ? loop.daily_missions.items : [];
  const openMission = missions.find((item) => !item.completed);
  if (openMission) return `Next: finish ${escapeHtml(openMission.title || openMission.mission_id || 'a daily mission')}.`;
  if (!loop.faction_state?.faction_id || loop.faction_state.faction_id === FACTION_UNALIGNED) return 'Next: choose a faction in the Battle Chamber.';
  return 'Next: check Battle Chamber or Arcade before UTC reset.';
}

function formatDailyLoopReadout(loop) {
  const missionStatus = formatSourceStatusForTelegram(loop.source_status?.daily_missions, 'no missions yet');
  return [
    '<b>Daily Loop</b>',
    formatLoopResetLine(loop),
    `Faction: ${escapeHtml(getLoopFactionLabel(loop))}`,
    `Daily missions: ${escapeHtml(formatMissionSummary(loop.daily_missions))} (${missionStatus})`,
    formatDailyWtfLine(loop),
    formatMissedOpportunityLine(loop),
    formatNextBestAction(loop),
    formatDailyLoopSourceSummary(loop, [
      'daily_missions',
      'daily_wtf_status',
      'missed_opportunities',
      'arcade_daily_state',
      'telegram_digest_group_status',
    ]),
  ].join('\n');
}

async function cmdGkStatus(env, tok, chatId, telegramId, fromUser) {
  const loop = await buildTelegramCommandDailyLoopState(env, telegramId, fromUser);
  await sendTelegramMessage(tok, chatId,
    `<b>GK Status</b>\n\n` +
    `${formatIdentityLine(loop)}\n` +
    `SAM: ${escapeHtml(loop.sam_status?.message || 'SAM status unavailable')}\n` +
    `Faction: ${escapeHtml(getLoopFactionLabel(loop))}\n` +
    `${formatBattleActivityLine(loop)}\n` +
    `${formatDigestLine(loop)}\n` +
    `${formatLoopResetLine(loop)}\n` +
    `${formatDailyLoopSourceSummary(loop, [
      'identity',
      'faction_state',
      'battle_chamber_activity',
      'daily_wtf_status',
      'telegram_digest_group_status',
    ])}`
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

async function cmdGkQuests(env, tok, chatId, telegramId, fromUser) {
  const loop = await buildTelegramCommandDailyLoopState(env, telegramId, fromUser);
  const dailyLines = formatMissionLines(loop.daily_missions);
  const wikiLines = formatWikiMissionLines(loop.wiki_missions);
  const dailySource = formatSourceStatusForTelegram(loop.source_status?.daily_missions, 'no missions yet');
  const wikiSource = formatSourceStatusForTelegram(loop.source_status?.wiki_missions, 'no wiki completions yet');

  await sendTelegramMessage(tok, chatId,
    `<b>GK Quests</b>\n\n` +
    `${formatLoopResetLine(loop)}\n` +
    `Daily missions: ${escapeHtml(formatMissionSummary(loop.daily_missions))} (${dailySource})\n` +
    `${dailyLines.length ? `${dailyLines.join('\n')}\n` : 'No daily mission rows yet.\n'}` +
    `\nWiki missions: ${escapeHtml(formatWikiMissionSummary(loop.wiki_missions))} (${wikiSource})\n` +
    `${wikiLines.length ? `${wikiLines.join('\n')}\n` : 'No wiki mission completions yet.\n'}` +
    `\n${formatDailyLoopSourceSummary(loop, ['daily_missions', 'wiki_missions'])}\n` +
    `Battle Chamber: ${SITE_URL}/community.html\n` +
    `Arcade: ${SITE_URL}/games/index.html`
  );
}
async function cmdGkFaction(env, tok, chatId, telegramId, argStr, fromUser) {
  const db = env.DB;
  // Anti-cheat gate: blocked accounts cannot perform competitive actions.
  try {
    const acState = await db.prepare(
      `SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?`
    ).bind(telegramId).first();
    if (acState && acState.is_blocked === 1) {
      await sendTelegramMessage(tok, chatId,
        `Your account is blocked from competitive actions. Contact the Moonboys community on Telegram to appeal.`
      );
      return;
    }
  } catch (error) {
    logApiFailure('gkfaction_anticheat_check_failed', {
      telegramId,
      message: error?.message || String(error),
    });
  }

  const loop = await buildTelegramCommandDailyLoopState(env, telegramId, fromUser);
  const faction = loop.faction_state || {};
  const factionId = faction.faction_id || FACTION_UNALIGNED;
  const todayContribution = Math.max(0, Math.floor(Number(faction.today?.[factionId]) || 0));
  const weekContribution = Math.max(0, Math.floor(Number(faction.week?.[factionId]) || 0));
  const factionSource = formatSourceStatusForTelegram(loop.source_status?.faction_state, 'no faction or signal yet');
  const battleChamberUrl = `${SITE_URL}/community.html#battle-join-faction`;
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: 'Open Battle Chamber', web_app: { url: battleChamberUrl } },
      ],
      [
        { text: 'Open in Browser', url: battleChamberUrl },
      ],
    ],
  };

  await sendTelegramMessage(tok, chatId,
    `<b>Faction Status</b>\n\n` +
    `Faction: ${escapeHtml(getLoopFactionLabel(loop))}\n` +
    `Faction id: ${escapeHtml(factionId)}\n` +
    `Daily contribution: ${todayContribution}\n` +
    `Weekly contribution: ${weekContribution}\n` +
    `Source: ${factionSource}\n` +
    `${formatMissedOpportunityLine(loop)}\n` +
    `${formatLoopResetLine(loop)}\n\n` +
    `Your choice locks for the current season.\n` +
    `No faction, no faction clout.\n\n` +
    `View faction activity and missions in the Battle Chamber:`,
    { reply_markup: replyMarkup },
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

async function cmdDaily(env, tok, chatId, telegramId, fromUser) {
  const db = env.DB;
  const loop = await buildTelegramCommandDailyLoopState(env, telegramId, fromUser);
  const today = loop.utc_day || getTodayUtcDate();

  // Anti-cheat gate: blocked accounts cannot claim XP.
  try {
    const acState = await db.prepare(
      `SELECT is_blocked FROM telegram_anticheat_state WHERE telegram_id = ?`
    ).bind(telegramId).first();
    if (acState && acState.is_blocked === 1) {
      await sendTelegramMessage(tok, chatId,
        `Your account is blocked from competitive actions. Contact the Moonboys community on Telegram to appeal.`
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
      `You already claimed your daily XP today (UTC: ${escapeHtml(today)}).\nCome back tomorrow!\n\n` +
      formatDailyLoopReadout(loop)
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
    `Daily XP claimed! +${XP_DAILY_CLAIM} XP\n\n` +
    formatDailyLoopReadout(loop)
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

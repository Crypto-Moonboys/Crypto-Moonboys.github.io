Warning: truncated output (original token count: 89357)
Total output lines: 8389

import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP, GEMS_MAX, GEMS_MIN, TELEGRAM_AUTH_MAX_AGE, XP_MAX, XP_MIN } from './blocktopia/config.js';
import { verifyTelegramIdentityFromBody } from './blocktopia/auth.js';
import { getOrCreateBlockTopiaProgression, hasBlockTopiaFactionColumns } from './blocktopia/db.js';
import { handleBlockTopiaProgressionRoute } from './blocktopia/routes.js';
import { buildDailyLoopState, handleDailyLoopStateRoute } from './routes/daily-loop-state.js';
import { handleRogueliteDailyRoutes } from './routes/daily-digest.js';
import { handleWaxOnEdgeRoute, runWaxOnEdgeScheduledSync } from './routes/waxonedge.js';
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
 *   GET  /api/waxonedge/bootstrap
 *   GET  /api/waxonedge/summary
 *   GET  /api/waxonedge/tokens/top
 *   GET  /api/waxonedge/pairs/top
 *   GET  /api/waxonedge/waxcash-graph
 *   GET  /api/waxonedge/token/:contract/:symbol
 *   GET  /api/waxonedge/token/:contract/:symbol/pairs
 *   GET  /api/waxonedge/token/:contract/:symbol/chart
 *   GET  /api/waxonedge/token/:contract/:symbol/holders
 *   GET  /api/waxonedge/token/:contract/:symbol/trades
 *   GET  /api/waxonedge/sync-status
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
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  if (getPetLevel(pet.pet_xp) < item.min_level) return { accepted: false, reason: 'level_locked', pet };
  if (!canAffordPetItem(pet, item)) return { accepted: false, reason: 'not_enough_pet_currency', pet };

  const cost = item.cost || {};
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) - (cost.moon_gold || 0));
  pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) - (cost.moon_crystals || 0));
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) - (cost.style_tokens || 0));
  pet[`equipped_${item.slot}`] = item.key;
  pet.last_decay_at = now.toISOString();

  const eventKey = String(options.event_key || `pet:buy:${telegramId}:${key}:${Date.now()}`).slice(0, 120);
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

  const eventKey = String(options.event_key || `pet:trade:${telegramId}:${Date.now()}`).slice(0, 120);
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
  const requestedKey = normalizePetAdventureKey(adventureKeyRaw);
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const available = petAdventuresForPet(pet);
  const adventure = (requestedKey
    ? available.find((item) => item.key === requestedKey)
    : [...available].reverse().find((item) => item.unlocked)) || available[0];
  if (!adventure) return { accepted: false, reason: 'adventure_unavailable', pet };
  if (!adventure.unlocked) return { accepted: false, reason: 'level_locked', adventure, pet };
  if (clampPetStat(pet.energy) < adventure.energy_cost) return { accepted: false, reason: 'pet_tired', adventure, pet };

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
        adventure,
        pet,
      };
    }
  }

  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  let petXp = adventure.pet_xp;
  let capReason = null;
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) {
    petXp = 0;
    capReason = 'pet_daily_cap_reached';
  } else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) {
    petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
    capReason = 'pet_daily_cap_clamped';
  }
  const toy = getPetEquippedItem(pet, 'toy');
  const outfit = getPetEquippedItem(pet, 'outfit');
  const bonusGold = toy?.key === 'hoverboard' ? 10 : 0;
  const bonusStyle = outfit?.key === 'crown_jacket' ? 2 : 0;

  pet.energy = clampPetStat(Number(pet.energy || 0) - adventure.energy_cost);
  pet.hunger = clampPetStat(Number(pet.hunger || 0) + adventure.hunger_cost);
  pet.happiness = clampPetStat(Number(pet.happiness || 0) + 8);
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + adventure.gold + bonusGold);
  pet.moon_crystals = clampPetCurrency(Number(pet.moon_crystals || 0) + adventure.crystals);
  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + adventure.style_tokens + bonusStyle);
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();

  const eventKey = String(options.event_key || `pet:adventure:${telegramId}:${adventure.key}:${Date.now()}`).slice(0, 120);
  await db.prepare(`
    INSERT INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    VALUES (?, ?, 'adventure', ?, 0, ?, ?, ?, ?, 'accepted', ?, ?)
  `).bind(
    crypto.randomUUID(),
    telegramId,
    eventKey,
    petXp,
    season.key,
    dayKey,
    weekKey,
    capReason || 'adventure_complete',
    JSON.stringify({
      source: options.source || 'telegram_bot',
      adventure_key: adventure.key,
      requested_pet_xp: adventure.pet_xp,
      awarded_pet_xp: petXp,
      rewards: {
        moon_gold: adventure.gold + bonusGold,
        moon_crystals: adventure.crystals,
        style_tokens: adventure.style_tokens + bonusStyle,
      },
      costs: {
        energy: adventure.energy_cost,
        hunger: adventure.hunger_cost,
      },
      cap_reason: capReason,
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
  `).bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey).run();

  return { accepted: true, reason: capReason || 'adventure_complete', adventure, xp_awarded: 0, pet_xp_awarded: petXp, pet };
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
      { key: `pet-daily-adventure:${dayKey}`, title: 'Run one pet adventure', completed: Number(counts.adventure || 0) > 0 },
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
    factionId: even…39357 tokens truncated…request.method === 'POST')) {
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
    const shouldRunWaxOnEdge = !cron || cron === '* * * * *';
    const scheduledResults = [];

    if (shouldRunWaxOnEdge) {
      const waxOnEdgeSummary = await runWaxOnEdgeScheduledSync(env, cron).catch((error) => ({
        ok: false,
        error: error?.message || String(error),
      }));
      scheduledResults.push({
        task: 'waxonedge_sync',
        ok: !!waxOnEdgeSummary?.ok,
        error: waxOnEdgeSummary?.ok ? null : (waxOnEdgeSummary?.error || 'unknown_error'),
      });
      if (!waxOnEdgeSummary?.ok) {
        logApiFailure('waxonedge_scheduled_failed', waxOnEdgeSummary);
      } else {
        logApiEvent('waxonedge_scheduled_complete', {
          cron,
          results: waxOnEdgeSummary.results?.length || 0,
          skipped: !!waxOnEdgeSummary.skipped,
        });
      }
    }

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

async function handleTelegramUpdate(update, env) {
  const db  = env.DB;
  const tok = env.TELEGRAM_BOT_TOKEN;

  const msg = update.message || update.edited_message;

  if (update.callback_query) {
    const query = update.callback_query;
    const data = String(query.data || '');
    const fromUser = query.from || {};
    const telegramId = String(fromUser.id || '');
    const chatId = String(query.message?.chat?.id || telegramId || '');
    if (data.startsWith('pet:') && telegramId && chatId) {
      const payload = data.slice(4);
      if (payload === 'shop') {
        await answerTelegramCallback(tok, query.id, '/petshop');
        await cmdPetShop(db, tok, chatId, telegramId);
        return;
      }
      if (payload === 'adventure') {
        await answerTelegramCallback(tok, query.id, '/petadventure');
        await cmdPetAdventure(db, tok, chatId, telegramId);
        return;
      }
      const action = normalizePetAction(payload);
      if (action) {
        await answerTelegramCallback(tok, query.id, `/${action}`);
        await cmdPetAction(db, tok, chatId, telegramId, fromUser, action);
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
    case 'adopt':        await cmdPetAction(db, tok, chatId, telegramId, fromUser, 'adopt'); break;
    case 'feed':
    case 'play':
    case 'clean':
    case 'sleep':
    case 'train':        await cmdPetAction(db, tok, chatId, telegramId, fromUser, cmdBase); break;
    case 'pettrade':     await cmdPetTrade(db, tok, chatId, telegramId, argStr);     break;
    case 'petname':      await cmdPetRename(db, tok, chatId, telegramId, argStr);    break;
    case 'petmissions':  await cmdPetMissions(db, tok, chatId, telegramId);          break;
    case 'petshop':      await cmdPetShop(db, tok, chatId, telegramId);              break;
    case 'petbuy':       await cmdPetBuy(db, tok, chatId, telegramId, argStr);       break;
    case 'petadventure': await cmdPetAdventure(db, tok, chatId, telegramId, argStr); break;
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
    `/petadventure — Run a pet adventure for pet-only rewards\n` +
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
  const missionLine = missions?.daily
    ? `\n\n<b>Daily Missions</b>\n${missions.daily.map((m) => `${m.completed ? '✓' : '•'} ${escapeHtml(m.title)}`).join('\n')}`
    : '';
  return `<b>${escapeHtml(p.pet_name)}</b> — Crypto Moonboy Pet\n` +
    `Stage: ${escapeHtml(p.stage)} · Level ${p.level}\n` +
    `Pet XP: ${p.pet_xp}\n` +
    `Gold: ${p.moon_gold} · Crystals: ${p.moon_crystals} · Style: ${p.style_tokens}\n` +
    `Food: ${escapeHtml(p.equipped_food || 'basic')} · Toy: ${escapeHtml(p.equipped_toy || 'basic')} · Outfit: ${escapeHtml(p.equipped_outfit || 'none')}\n` +
    `Health: ${p.health}/100\n` +
    `Hunger: ${p.hunger}/100 · Happiness: ${p.happiness}/100\n` +
    `Cleanliness: ${p.cleanliness}/100 · Energy: ${p.energy}/100\n` +
    `Streak: ${p.streak_days} day(s)` +
    missionLine;
}

function petReplyMarkup() {
  return {
    inline_keyboard: [
      [
        { text: 'Feed', callback_data: 'pet:feed' },
        { text: 'Play', callback_data: 'pet:play' },
        { text: 'Clean', callback_data: 'pet:clean' },
      ],
      [
        { text: 'Sleep', callback_data: 'pet:sleep' },
        { text: 'Train', callback_data: 'pet:train' },
      ],
      [
        { text: 'Shop', callback_data: 'pet:shop' },
        { text: 'Adventure', callback_data: 'pet:adventure' },
      ],
      [
        { text: 'How To Play', url: `${SITE_URL}/how-to-play-crypto-moonboy-pets.html` },
        { text: 'Pet Leaderboard', url: `${SITE_URL}/crypto-moonboy-pets-leaderboard.html` },
      ],
    ],
  };
}

async function cmdPetStatus(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const missions = await buildPetMissions(db, telegramId).catch(() => null);
  await sendTelegramMessage(tok, chatId, formatPetStatus(pet, missions), { reply_markup: petReplyMarkup() });
}

async function cmdPetAction(db, tok, chatId, telegramId, fromUser, action) {
  await upsertTelegramUser(db, fromUser).catch(() => {});
  const result = await processPetAction(db, telegramId, action, {
    event_key: `tg:${telegramId}:${action}:${Date.now()}`,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_action_failed' }));
  if (!result.accepted) {
    const retry = result.retry_after_seconds ? ` Try again in ${result.retry_after_seconds}s.` : '';
    await sendTelegramMessage(tok, chatId, `Moonpet action blocked: ${escapeHtml(result.reason || 'not accepted')}.${retry}`);
    return;
  }
  const prefix = action === 'adopt'
    ? 'Crypto Moonboy Pet adopted.'
    : `Action accepted: /${escapeHtml(action)} (+${result.pet_xp_awarded || 0} pet XP, +${result.xp_awarded || 0} Community XP).`;
  await sendTelegramMessage(tok, chatId, `${prefix}\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: petReplyMarkup() });
}

async function cmdPetTrade(db, tok, chatId, telegramId, argStr) {
  const result = await processPetGoldTrade(db, telegramId, argStr, {
    event_key: `tg:${telegramId}:trade:${Date.now()}`,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_trade_failed' }));
  if (!result.accepted) {
    const retry = result.retry_after_seconds ? ` Try again in ${result.retry_after_seconds}s.` : '';
    await sendTelegramMessage(tok, chatId, `Moon Gold trade blocked: ${escapeHtml(result.reason || 'not accepted')}.${retry}`);
    return;
  }
  const outcome = result.won
    ? `Trade won: +${result.gold_delta} gold, +${result.crystal_delta} crystals, +${result.pet_xp_awarded || 0} pet XP.`
    : `Trade lost: ${result.gold_delta} gold, +${result.pet_xp_awarded || 0} pet XP.`;
  await sendTelegramMessage(tok, chatId,
    `${escapeHtml(outcome)}\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`,
    { reply_markup: petReplyMarkup() },
  );
}

async function cmdPetRename(db, tok, chatId, telegramId, argStr) {
  const petName = normalizePetName(argStr);
  if (!petName) {
    await sendTelegramMessage(tok, chatId, 'Use it like this: /petname Moon Runner');
    return;
  }
  const result = await processPetAction(db, telegramId, 'rename', { pet_name: petName, source: 'telegram_command' });
  await sendTelegramMessage(tok, chatId, `Pet renamed.\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`, { reply_markup: petReplyMarkup() });
}

async function cmdPetMissions(db, tok, chatId, telegramId) {
  const missions = await buildPetMissions(db, telegramId);
  const daily = missions.daily.map((m) => `${m.completed ? '✓' : '•'} ${escapeHtml(m.title)}`).join('\n');
  await sendTelegramMessage(tok, chatId,
    `<b>Crypto Moonboy Pets Missions</b>\n` +
    `Day: ${escapeHtml(missions.day_key)}\n` +
    `Week: ${escapeHtml(missions.week_key)}\n` +
    `Season: ${escapeHtml(missions.season.key)}\n\n${daily}`
  );
}

async function cmdPetShop(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const p = serializePet(pet);
  const lines = petShopItemsForPet(pet).map((item) => {
    const cost = item.cost || {};
    const state = item.equipped ? 'equipped' : item.affordable ? 'ready' : item.unlocked ? 'need currency' : `level ${item.min_level}`;
    return `${item.equipped ? '✓' : '•'} <code>${escapeHtml(item.key)}</code> — ${escapeHtml(item.title)} [${escapeHtml(state)}]\n` +
      `  Cost: ${cost.moon_gold || 0} gold, ${cost.moon_crystals || 0} crystals, ${cost.style_tokens || 0} style\n` +
      `  ${escapeHtml(item.description)}`;
  }).join('\n\n');
  await sendTelegramMessage(tok, chatId,
    `<b>Crypto Moonboy Pets Shop</b>\n` +
    `Balance: ${p.moon_gold} gold · ${p.moon_crystals} crystals · ${p.style_tokens} style\n\n` +
    `${lines}\n\n` +
    `Buy/equip: <code>/petbuy moon_kibble</code>\n` +
    `Risk game gold: <code>/pettrade 25</code>\n` +
    `Adventures: <code>/petadventure</code>\n` +
    `Alerts: <code>/petnotify on</code>`,
    { reply_markup: petReplyMarkup() },
  );
}

async function cmdPetBuy(db, tok, chatId, telegramId, argStr) {
  const itemKey = normalizePetShopItemKey(argStr);
  if (!itemKey) {
    await sendTelegramMessage(tok, chatId, 'Use it like this: /petbuy moon_kibble. Run /petshop to see item keys.');
    return;
  }
  const result = await processPetShopPurchase(db, telegramId, itemKey, {
    event_key: `tg:${telegramId}:buy:${itemKey}:${Date.now()}`,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_buy_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, `Pet shop purchase blocked: ${escapeHtml(result.reason || 'not accepted')}. Run /petshop.`);
    return;
  }
  await sendTelegramMessage(tok, chatId,
    `Upgrade equipped: <b>${escapeHtml(result.item.title)}</b>.\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`,
    { reply_markup: petReplyMarkup() },
  );
}

async function cmdPetAdventure(db, tok, chatId, telegramId, argStr = '') {
  const result = await processPetAdventure(db, telegramId, argStr, {
    event_key: `tg:${telegramId}:adventure:${Date.now()}`,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_adventure_failed' }));
  if (!result.accepted) {
    const retry = result.retry_after_seconds ? ` Try again in ${result.retry_after_seconds}s.` : '';
    await sendTelegramMessage(tok, chatId, `Pet adventure blocked: ${escapeHtml(result.reason || 'not accepted')}.${retry}`);
    return;
  }
  const title = result.adventure?.title || 'Pet adventure complete';
  await sendTelegramMessage(tok, chatId,
    `${escapeHtml(title)}\n\n${formatPetStatus(result.pet, await buildPetMissions(db, telegramId))}`,
    { reply_markup: petReplyMarkup() },
  );
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
  await sendTelegramMessage(tok, chatId, `<b>Crypto Moonboy Pets Leaderboard</b>\n${escapeHtml(season.key)}\n\n${lines.join('\n')}`);
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

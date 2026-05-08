import { GEMS_MAX, GEMS_MIN, TELEGRAM_AUTH_MAX_AGE, XP_MAX, XP_MIN } from './blocktopia/config.js';
import { verifyTelegramIdentityFromBody } from './blocktopia/auth.js';
import { getOrCreateBlockTopiaProgression, hasBlockTopiaFactionColumns } from './blocktopia/db.js';
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

const FACTION_UNALIGNED = 'unaligned';
const FACTION_SWITCH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FACTION_CONFIG = {
  // Canonical 9-faction keys — mirrors LIVE_FACTIONS in battle-chamber-factions.js
  'hard-fork-rockers': {
    label: 'Hard Fork Rockers',
    icon: '🪨',
    color: '#56dcff',
    bonus: '+endurance stability and streak protection',
    xpMultiplier: 1.1,
  },
  'rugpull-minors': {
    label: 'Rugpull Minors',
    icon: '⛏️',
    color: '#ff6ad5',
    bonus: '+defensive recovery and shield support',
    xpMultiplier: 1.15,
  },
  graffpunks: {
    label: 'GraffPUNKS',
    icon: '🎨',
    color: '#7dff72',
    bonus: '+chaos bursts and combo pressure',
    xpMultiplier: 1.12,
  },
  'blockchain-furies': {
    label: 'Blockchain Furies',
    icon: '🔥',
    color: '#ff9f43',
    bonus: '+speed pressure and revenge momentum',
    xpMultiplier: 1.0,
  },
  'crypto-moongirls': {
    label: 'Crypto Moongirls',
    icon: '🌙',
    color: '#b88dff',
    bonus: '+precision control and penalty resistance',
    xpMultiplier: 1.0,
  },
  blockstars: {
    label: 'The Blockstars',
    icon: '⭐',
    color: '#ffd166',
    bonus: '+featured clout tracks and spotlight scoring',
    xpMultiplier: 1.0,
  },
  'all-city-bulls': {
    label: 'All City Bulls',
    icon: '🐂',
    color: '#ff6b6b',
    bonus: '+score pressure and war push',
    xpMultiplier: 1.0,
  },
  'nomad-bears': {
    label: 'Nomad Bears',
    icon: '🐻',
    color: '#8ecf7a',
    bonus: '+route variety and consistency rewards',
    xpMultiplier: 1.0,
  },
  'crypto-stoned-boys': {
    label: 'Crypto Stoned Boys',
    icon: '😶‍🌫️',
    color: '#8fd3ff',
    bonus: '+chill streak comfort and random branch luck',
    xpMultiplier: 1.0,
  },
  unaligned: {
    label: 'Unaligned',
    icon: '◌',
    color: '#8b949e',
    bonus: 'No faction bonus active',
    xpMultiplier: 1,
  },
};

function normalizeFaction(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  // All 9 canonical Battle Chamber faction keys
  const CANONICAL_FACTIONS = [
    'hard-fork-rockers', 'rugpull-minors', 'graffpunks', 'blockchain-furies',
    'crypto-moongirls', 'blockstars', 'all-city-bulls', 'nomad-bears', 'crypto-stoned-boys',
  ];
  if (CANONICAL_FACTIONS.includes(cleaned)) return cleaned;
  // Legacy aliases → canonical keys
  if (cleaned === 'diamondhands' || cleaned === 'diamond_hands' || cleaned === 'diamond-hands') return 'hard-fork-rockers';
  if (cleaned === 'hodlwarriors' || cleaned === 'hodl_warriors' || cleaned === 'hodl-warriors') return 'rugpull-minors';
  if (cleaned === 'graff-punks' || cleaned === 'graff_punks') return 'graffpunks';
  if (cleaned === 'unaligned') return FACTION_UNALIGNED;
  return null;
}

function factionMeta(faction) {
  const key = normalizeFaction(faction) || FACTION_UNALIGNED;
  const cfg = FACTION_CONFIG[key] || FACTION_CONFIG.unaligned;
  return {
    key,
    label: cfg.label,
    icon: cfg.icon,
    color: cfg.color,
    bonus: cfg.bonus,
    xp_multiplier: cfg.xpMultiplier,
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

const BATTLE_CHAMBER_FACTIONS = Object.freeze([
  'hard-fork-rockers',
  'rugpull-minors',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
]);

const BATTLE_CHAMBER_FACTION_LABELS = Object.freeze({
  'hard-fork-rockers': 'Hard Fork Rockers',
  'rugpull-minors': 'Rugpull Minors',
  graffpunks: 'GraffPUNKS',
  'blockchain-furies': 'Blockchain Furies',
  'crypto-moongirls': 'Crypto Moongirls',
  blockstars: 'The Blockstars',
  'all-city-bulls': 'All City Bulls',
  'nomad-bears': 'Nomad Bears',
  'crypto-stoned-boys': 'Crypto Stoned Boys',
});

const BATTLE_CHAMBER_FACTION_ALIASES = Object.freeze({
  'diamond-hands': 'hard-fork-rockers',
  diamond_hands: 'hard-fork-rockers',
  diamondhands: 'hard-fork-rockers',
  'hodl-warriors': 'rugpull-minors',
  hodl_warriors: 'rugpull-minors',
  hodlwarriors: 'rugpull-minors',
  'graff-punks': 'graffpunks',
  graff_punks: 'graffpunks',
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
  const raw = String(value || '').trim().toLowerCase();
  const fromAlias = BATTLE_CHAMBER_FACTION_ALIASES[raw] || raw;
  return BATTLE_CHAMBER_FACTIONS.includes(fromAlias) ? fromAlias : null;
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
          return err('Faction progression schema is pending migration', 503);
        }

        // ── Season lock check ──────────────────────────────────────────────
        const seasonKey = await getBattleSeasonKey(env.DB);
        const lockTableRow = await env.DB.prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'telegram_faction_season_locks' LIMIT 1`
        ).first().catch(() => null);
        const lockTableExists = !!(lockTableRow?.name);

        if (lockTableExists) {
          const existingLock = await env.DB.prepare(
            `SELECT faction_id FROM telegram_faction_season_locks WHERE telegram_id = ? AND season_key = ?`
          ).bind(verified.telegramId, seasonKey).first();

          if (existingLock) {
            if (existingLock.faction_id === requestedFaction) {
              // Same faction — idempotent OK
              const progressionRow = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
              const meta = factionMeta(requestedFaction);
              return json({
                ok: true,
                faction: meta.key,
                faction_label: meta.label,
                faction_xp: Math.max(0, Math.floor(Number(progressionRow?.faction_xp) || 0)),
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
        }

        // ── Progression update (existing cooldown logic unchanged) ─────────
        const row = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const currentFaction = normalizeFaction(row?.faction) || FACTION_UNALIGNED;
        const lastSwitch = Number(row?.faction_last_switch) || 0;
        const now = Date.now();
        const firstJoin = currentFaction === FACTION_UNALIGNED;
        const isSwitching = currentFaction !== requestedFaction;
        if (!firstJoin && isSwitching && lastSwitch > 0 && now - lastSwitch < FACTION_SWITCH_COOLDOWN_MS) {
          const retryAt = lastSwitch + FACTION_SWITCH_COOLDOWN_MS;
          return json({
            error: 'Faction switch cooldown active',
            retry_at: retryAt,
            cooldown_ms_remaining: retryAt - now,
          }, 429);
        }

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

        // ── Upsert season lock ─────────────────────────────────────────────
        if (lockTableExists) {
          const nowIso = new Date().toISOString();
          await env.DB.prepare(`
            INSERT INTO telegram_faction_season_locks (telegram_id, season_key, faction_id, locked_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(telegram_id, season_key) DO UPDATE SET faction_id = excluded.faction_id, updated_at = excluded.updated_at
          `).bind(verified.telegramId, seasonKey, requestedFaction, nowIso, nowIso).run();
        }

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
        { text: '⚔️ Open Battle Chamber', web_app: { url: `${SITE_URL}/community.html#battle-join-faction` } },
      ],
      [
        { text: '🌐 Open in Browser', url: battleChamberUrl },
      ],
    ],
  };

  const current = await getUserFaction(db, telegramId);

  if (current) {
    await sendTelegramMessage(tok, chatId,
      `⚔️ <b>Faction Status</b>\n\n` +
      `Your faction: <b>${escapeHtml(current.name)}</b>\n\n` +
      `You are locked to this faction for the current season.\n` +
      `At season reset, your faction lock clears and you can choose a new side.\n\n` +
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
      `No faction, no faction clout.`,
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

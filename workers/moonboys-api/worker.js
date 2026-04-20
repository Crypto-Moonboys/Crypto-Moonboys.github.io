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

/** Maximum age (in seconds) of a Telegram Login Widget auth payload before it is rejected. */
const TELEGRAM_AUTH_MAX_AGE = 86400; // 24 hours

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
const XP_MIN = 0;
const XP_MAX = 100000;
const GEMS_MIN = 0;
const GEMS_MAX = 10000;
const TIER_MIN = 1;
const TIER_MAX = 50;
const BLOCKTOPIA_RATE_LIMIT_PER_MIN = 20;
const BLOCKTOPIA_DRAIN_BASE_PER_MINUTE = 5;
const BLOCKTOPIA_DRAIN_TIER_STEP = 0.5;
const BLOCKTOPIA_DRAIN_MAX_PER_MINUTE = 30;
const BLOCKTOPIA_ARCADE_MAX_XP_PER_MINUTE = 200;
const BLOCKTOPIA_ARCADE_MAX_REWARDS_PER_GAME_PER_HOUR = 5;
const BLOCKTOPIA_MAX_SCORE_SANITY = 1_000_000_000;
const TELEGRAM_SYNC_XP_MULTIPLIER = 1.1;

const UPGRADE_MAX_LEVEL = 10;
const UPGRADE_EFFECT_CAP = 0.5;
const BLOCKTOPIA_ENTRY_BASE_COST = 10;
const BLOCKTOPIA_ENTRY_TIER_STEP = 2;
const BLOCKTOPIA_MINI_GAME_COST_BASE = 10;
const BLOCKTOPIA_MINI_GAME_COST_TIER_STEP = 1.5;
const BLOCKTOPIA_MINI_GAME_REWARD_BASE = 20;
const BLOCKTOPIA_MINI_GAME_REWARD_TIER_STEP = 2;
const BLOCKTOPIA_MINI_GAME_LOSS_BASE = 10;
const BLOCKTOPIA_MINI_GAME_LOSS_TIER_STEP = 1;
const BLOCKTOPIA_MINI_GAME_GEM_CHANCE_BASE = 0.2;
const BLOCKTOPIA_MINI_GAME_GEM_CHANCE_TIER_STEP = 0.01;
const BLOCKTOPIA_MINI_GAME_GEM_CHANCE_CAP = 0.5;
const BLOCKTOPIA_SURVIVAL_XP_FLOOR = 5;
const BLOCKTOPIA_UPGRADES = {
  efficiency: { column: 'upgrade_efficiency', baseCost: 8 },
  signal: { column: 'upgrade_signal', baseCost: 10 },
  defense: { column: 'upgrade_defense', baseCost: 12 },
  gem: { column: 'upgrade_gem', baseCost: 9 },
  npc: { column: 'upgrade_npc', baseCost: 11 },
};

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeUpgradeLevel(rawLevel) {
  return clamp(Math.floor(Number(rawLevel) || 0), 0, UPGRADE_MAX_LEVEL);
}

function getUpgradeSnapshot(row = {}) {
  return {
    efficiency: sanitizeUpgradeLevel(row?.upgrade_efficiency),
    signal: sanitizeUpgradeLevel(row?.upgrade_signal),
    defense: sanitizeUpgradeLevel(row?.upgrade_defense),
    gem: sanitizeUpgradeLevel(row?.upgrade_gem),
    npc: sanitizeUpgradeLevel(row?.upgrade_npc),
  };
}

function buildUpgradeEffects(upgrades = {}) {
  const efficiencyDrainReduction = Math.min(UPGRADE_EFFECT_CAP, 0.05 * (upgrades.efficiency || 0));
  const signalXpBonus = Math.min(UPGRADE_EFFECT_CAP, 0.05 * (upgrades.signal || 0));
  const defenseEaseBonus = Math.min(UPGRADE_EFFECT_CAP, 0.05 * (upgrades.defense || 0));
  const gemDropBonus = Math.min(UPGRADE_EFFECT_CAP, 0.03 * (upgrades.gem || 0));
  const npcAssistBonus = Math.min(UPGRADE_EFFECT_CAP, 0.05 * (upgrades.npc || 0));
  return { efficiencyDrainReduction, signalXpBonus, defenseEaseBonus, gemDropBonus, npcAssistBonus };
}

function computeUpgradeCost(base, currentLevel) {
  return Math.max(1, Math.floor(base * (currentLevel + 1) * 2));
}

function computeRpgEntryCost(tier) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  return BLOCKTOPIA_ENTRY_BASE_COST + (safeTier * BLOCKTOPIA_ENTRY_TIER_STEP);
}

function computeDrainPerMinute(tier, effects = {}) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  const base = Math.min(
    BLOCKTOPIA_DRAIN_MAX_PER_MINUTE,
    BLOCKTOPIA_DRAIN_BASE_PER_MINUTE + (safeTier * BLOCKTOPIA_DRAIN_TIER_STEP),
  );
  const efficiencyBonus = clamp(Number(effects?.efficiencyDrainReduction) || 0, 0, UPGRADE_EFFECT_CAP);
  return Math.max(0, base * (1 - efficiencyBonus));
}

function computeMiniGameCost(tier) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  return Math.max(1, Math.round(BLOCKTOPIA_MINI_GAME_COST_BASE + (safeTier * BLOCKTOPIA_MINI_GAME_COST_TIER_STEP)));
}

function computeMiniGameBaseReward(tier) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  return Math.max(0, Math.round(BLOCKTOPIA_MINI_GAME_REWARD_BASE + (safeTier * BLOCKTOPIA_MINI_GAME_REWARD_TIER_STEP)));
}

function computeMiniGameLossPenalty(tier) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  return Math.max(0, Math.round(BLOCKTOPIA_MINI_GAME_LOSS_BASE + (safeTier * BLOCKTOPIA_MINI_GAME_LOSS_TIER_STEP)));
}

function computeGemDropChance(tier, effects = {}) {
  const safeTier = clamp(Math.floor(Number(tier) || 1), TIER_MIN, TIER_MAX);
  const baseChance = Math.min(
    BLOCKTOPIA_MINI_GAME_GEM_CHANCE_CAP,
    BLOCKTOPIA_MINI_GAME_GEM_CHANCE_BASE + (safeTier * BLOCKTOPIA_MINI_GAME_GEM_CHANCE_TIER_STEP),
  );
  const bonus = (Number(effects?.gemDropBonus) || 0) * 0.2;
  return clamp(baseChance + bonus, 0, BLOCKTOPIA_MINI_GAME_GEM_CHANCE_CAP);
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
    console.log('callAntiCheatWorker: ADMIN_SECRET not configured');
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
    try { return JSON.parse(text); } catch { return { error: text }; }
  } catch (e) {
    console.log('callAntiCheatWorker error:', e?.message || e);
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
  `).bind(id, telegramId, action, metadata || null).run().catch(() => {});
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

async function verifyTelegramIdentityFromBody(body, env) {
  const tg = body?.telegram_auth;
  if (!tg || typeof tg !== 'object') {
    return { error: 'verified telegram_auth payload required', status: 401 };
  }
  const required = ['id', 'auth_date', 'hash'];
  for (const key of required) {
    if (!tg[key]) return { error: `telegram_auth.${key} required`, status: 401 };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(tg.auth_date, 10) > TELEGRAM_AUTH_MAX_AGE) {
    return { error: 'Telegram auth data has expired', status: 401 };
  }
  const valid = await verifyTelegramAuth({
    id: tg.id,
    first_name: tg.first_name,
    last_name: tg.last_name,
    username: tg.username,
    photo_url: tg.photo_url,
    auth_date: tg.auth_date,
    hash: tg.hash,
  }, env.TELEGRAM_BOT_TOKEN);
  if (!valid) return { error: 'Telegram auth verification failed', status: 401 };
  return {
    telegramId: String(tg.id),
    user: {
      id: String(tg.id),
      username: tg.username || null,
      first_name: tg.first_name || null,
      last_name: tg.last_name || null,
    },
  };
}

async function ensureBlockTopiaProgressionTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS blocktopia_progression (
      telegram_id TEXT PRIMARY KEY,
      xp INTEGER NOT NULL DEFAULT 0,
      gems INTEGER NOT NULL DEFAULT 0,
      tier INTEGER NOT NULL DEFAULT 1,
      win_streak INTEGER NOT NULL DEFAULT 0,
      upgrade_efficiency INTEGER NOT NULL DEFAULT 0,
      upgrade_signal INTEGER NOT NULL DEFAULT 0,
      upgrade_defense INTEGER NOT NULL DEFAULT 0,
      upgrade_gem INTEGER NOT NULL DEFAULT 0,
      upgrade_npc INTEGER NOT NULL DEFAULT 0,
      rpg_mode_active INTEGER NOT NULL DEFAULT 0,
      last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
    ALTER TABLE blocktopia_progression
    ADD COLUMN win_streak INTEGER NOT NULL DEFAULT 0
  `).run().catch(() => {});
  await db.prepare(`
    ALTER TABLE blocktopia_progression
    ADD COLUMN rpg_mode_active INTEGER NOT NULL DEFAULT 0
  `).run().catch(() => {});
  await db.prepare(`
    ALTER TABLE blocktopia_progression
    ADD COLUMN upgrade_npc INTEGER NOT NULL DEFAULT 0
  `).run().catch(() => {});
  await db.prepare(`
    ALTER TABLE blocktopia_progression
    ADD COLUMN upgrade_gem INTEGER NOT NULL DEFAULT 0
  `).run().catch(() => {});
  await db.prepare(`
    ALTER TABLE blocktopia_progression
    ADD COLUMN upgrade_defense INTEGER NOT NULL DEFAULT 0
  `).run().catch(() => {});
  await db.prepare(`
    ALTER TABLE blocktopia_progression
    ADD COLUMN upgrade_signal INTEGER NOT NULL DEFAULT 0
  `).run().catch(() => {});
  await db.prepare(`
    ALTER TABLE blocktopia_progression
    ADD COLUMN upgrade_efficiency INTEGER NOT NULL DEFAULT 0
  `).run().catch(() => {});
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS blocktopia_progression_events (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      action TEXT NOT NULL,
      action_type TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      xp_change INTEGER NOT NULL DEFAULT 0,
      gems_change INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function getOrCreateBlockTopiaProgression(db, telegramId) {
  await db.prepare(`
    INSERT INTO blocktopia_progression (
      telegram_id, xp, gems, tier, win_streak,
      upgrade_efficiency, upgrade_signal, upgrade_defense, upgrade_gem, upgrade_npc, rpg_mode_active
    )
    VALUES (?, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0)
    ON CONFLICT(telegram_id) DO NOTHING
  `).bind(telegramId).run();
  const row = await db.prepare(
    `SELECT telegram_id, xp, gems, tier, win_streak,
            upgrade_efficiency, upgrade_signal, upgrade_defense, upgrade_gem, upgrade_npc,
            rpg_mode_active, last_active, updated_at
     FROM blocktopia_progression WHERE telegram_id = ?`
  ).bind(telegramId).first();
  return row || {
    telegram_id: telegramId,
    xp: 0,
    gems: 0,
    tier: 1,
    win_streak: 0,
    upgrade_efficiency: 0,
    upgrade_signal: 0,
    upgrade_defense: 0,
    upgrade_gem: 0,
    upgrade_npc: 0,
    rpg_mode_active: 0,
    last_active: new Date().toISOString(),
  };
}

async function enforceProgressionRateLimit(db, telegramId) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n
     FROM blocktopia_progression_events
     WHERE telegram_id = ? AND created_at >= datetime('now', '-60 seconds')`
  ).bind(telegramId).first().catch(() => ({ n: 0 }));
  return Number(row?.n || 0) < BLOCKTOPIA_RATE_LIMIT_PER_MIN;
}

async function enforceArcadeGameHourlyLimit(db, telegramId, game) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n
     FROM blocktopia_progression_events
     WHERE telegram_id = ?
       AND action = 'arcade_score'
       AND action_type = ?
       AND created_at >= datetime('now', '-1 hour')`
  ).bind(telegramId, game).first().catch(() => ({ n: 0 }));
  return Number(row?.n || 0) < BLOCKTOPIA_ARCADE_MAX_REWARDS_PER_GAME_PER_HOUR;
}

async function getArcadeXpAwardedLastMinute(db, telegramId) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(xp_change), 0) AS total
     FROM blocktopia_progression_events
     WHERE telegram_id = ?
       AND action = 'arcade_score'
       AND created_at >= datetime('now', '-60 seconds')`
  ).bind(telegramId).first().catch(() => ({ total: 0 }));
  return Number(row?.total || 0);
}

async function hasArcadeScoreBeenRewarded(db, telegramId, game, score) {
  const row = await db.prepare(
    `SELECT id
     FROM blocktopia_progression_events
     WHERE telegram_id = ?
       AND action = 'arcade_score'
       AND action_type = ?
       AND score = ?
     LIMIT 1`
  ).bind(telegramId, game, score).first().catch(() => null);
  return !!row?.id;
}

function buildLeaderboardApiBase(env) {
  const configured = typeof env.LEADERBOARD_API_URL === 'string' ? env.LEADERBOARD_API_URL.trim() : '';
  const fallback = 'https://moonboys-leaderboard.sercullen.workers.dev';
  return (configured || fallback).replace(/\/$/, '');
}

function buildLeaderboardIdentityAliasList(verifiedUser) {
  const aliases = new Set();
  const username = String(verifiedUser?.username || '').trim();
  const fullName = [verifiedUser?.first_name, verifiedUser?.last_name].filter(Boolean).join(' ').trim();
  if (username) aliases.add(username.toLowerCase());
  if (fullName) aliases.add(fullName.toLowerCase());
  return aliases;
}

async function fetchTrustedLeaderboardContext(env, game, telegramId, verifiedUser) {
  const apiBase = buildLeaderboardApiBase(env);
  const res = await fetch(`${apiBase}?game=${encodeURIComponent(game)}&mode=raw`);
  if (!res.ok) throw new Error(`Leaderboard API HTTP ${res.status}`);
  const board = await res.json().catch(() => []);
  const list = Array.isArray(board) ? board : [];
  const aliases = buildLeaderboardIdentityAliasList(verifiedUser);
  const resolvedTelegramId = String(telegramId || '');
  const playerEntry = list.find((row) => {
    if (String(row?.telegram_id || '') === resolvedTelegramId) return true;
    const player = String(row?.player || '').trim().toLowerCase();
    return player && aliases.has(player);
  }) || null;
  const top10Idx = Math.max(0, Math.ceil(list.length * 0.1) - 1);
  const top1Idx = Math.max(0, Math.ceil(list.length * 0.01) - 1);
  return {
    rank: Number(playerEntry?.rank || 0),
    boardSize: list.length,
    top10PercentScore: Number(list[top10Idx]?.score || 0),
    top1PercentScore: Number(list[top1Idx]?.score || 0),
    trustedBestScore: Number(playerEntry?.score || 0),
  };
}

function computeBlockTopiaRewards(action, type, score, leaderboardCtx = null, progression = {}) {
  const safeAction = String(action || '').trim();
  const safeType = String(type || '').trim().toLowerCase();
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const upgrades = getUpgradeSnapshot(progression);
  const effects = buildUpgradeEffects(upgrades);
  const streak = Math.max(0, Math.floor(Number(progression?.win_streak) || 0));

  if (safeAction === 'arcade_score') {
    const baseXp = clamp(Math.min(Math.floor(safeScore / 1000), 100), XP_MIN, XP_MAX);
    const trustedRank = Number(leaderboardCtx?.rank || 0);
    const top10Score = Number(leaderboardCtx?.top10PercentScore || 0);
    const top1Score = Number(leaderboardCtx?.top1PercentScore || 0);
    const trustedBestScore = Number(leaderboardCtx?.trustedBestScore || 0);
    const improvementEligible = leaderboardCtx?.improvementEligible === true;
    let bonusXp = 0;
    if (improvementEligible) bonusXp += 10;
    if (top10Score > 0 && safeScore >= top10Score) bonusXp += 20;
    if (top1Score > 0 && safeScore >= top1Score) bonusXp += 50;
    if (trustedRank > 0 && trustedRank <= 100) bonusXp += 10;
    if (trustedRank > 0 && trustedRank <= 50) bonusXp += 20;
    if (trustedRank > 0 && trustedRank <= 10) bonusXp += 50;
    let totalXp = clamp(baseXp + bonusXp, XP_MIN, XP_MAX);
    totalXp = clamp(Math.floor(totalXp * (1 + effects.signalXpBonus)), XP_MIN, XP_MAX);
    return {
      xp: totalXp,
      base_xp: baseXp,
      bonus_xp: bonusXp,
      gems: 0,
      score: safeScore,
      reason: 'validated_arcade_score',
      bonus_flags: [],
      leaderboard: {
        rank: trustedRank,
        top_10_percent_score: top10Score,
        top_1_percent_score: top1Score,
        trusted_best_score: trustedBestScore,
      },
    };
  }
  if (safeAction === 'mini_game_win') {
    const allowedTypes = new Set(['firewall', 'router', 'outbreak', 'circuit']);
    if (!allowedTypes.has(safeType)) return null;
    const bonusFlags = [];
    const tier = clamp(Math.floor(Number(progression?.tier) || 1), TIER_MIN, TIER_MAX);
    let xp = computeMiniGameBaseReward(tier);
    let gems = 0;
    const gemChance = computeGemDropChance(tier, effects);

    const speedBonus = safeScore >= 250 || Math.random() < 0.2;
    const noDamageBonus = safeScore >= 450 || Math.random() < 0.12;
    if (speedBonus) {
      xp += Math.max(2, Math.round(xp * 0.2));
      bonusFlags.push('speed_bonus');
    }
    if (noDamageBonus) {
      xp += Math.max(3, Math.round(xp * 0.25));
      bonusFlags.push('no_damage_bonus');
    }
    if (streak >= 3) {
      xp += Math.max(2, streak);
      bonusFlags.push('streak_bonus');
    }
    xp = clamp(Math.floor(xp * (1 + effects.signalXpBonus)), XP_MIN, XP_MAX);

    if (Math.random() < gemChance) {
      gems += 1;
      bonusFlags.push('gem_drop');
    }
    return {
      xp: clamp(xp, XP_MIN, XP_MAX),
      gems: clamp(gems, GEMS_MIN, GEMS_MAX),
      score: 0,
      bonus_flags: bonusFlags,
      gem_chance: gemChance,
      reason: 'validated_mini_game_win',
    };
  }
  if (safeAction === 'mini_game_loss') {
    const allowedTypes = new Set(['firewall', 'router', 'outbreak', 'circuit']);
    if (!allowedTypes.has(safeType)) return null;
    return { xp: 0, gems: 0, score: 0, bonus_flags: [], reason: 'validated_mini_game_loss' };
  }
  return null;
}

function applyProgressionDrain(row, now = Date.now(), effects = null) {
  if (Number(row?.rpg_mode_active || 0) !== 1) {
    return {
      drain: 0,
      xpAfterDrain: clamp(Number(row?.xp) || 0, XP_MIN, XP_MAX),
      drainPerMinute: 0,
    };
  }
  const lastMs = row?.last_active ? new Date(row.last_active).getTime() : now;
  const elapsedMs = Math.max(0, now - (Number.isFinite(lastMs) ? lastMs : now));
  const upgradeEffects = effects || buildUpgradeEffects(getUpgradeSnapshot(row));
  const tier = clamp(Math.floor(Number(row?.tier) || 1), TIER_MIN, TIER_MAX);
  const drainPerMinute = computeDrainPerMinute(tier, upgradeEffects);
  const drain = Math.floor((elapsedMs / 60000) * drainPerMinute);
  const xpAfterDrain = clamp((Number(row?.xp) || 0) - drain, XP_MIN, XP_MAX);
  return { drain, xpAfterDrain, drainPerMinute };
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
        return err('Telegram auth data has expired', 401);
      }

      const valid = await verifyTelegramAuth(
        { id, first_name, last_name, username, photo_url, auth_date, hash },
        env.TELEGRAM_BOT_TOKEN,
      );
      if (!valid) {
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
      } catch { /* table absent or query failed — proceed */ }

      // Invalidate any existing unused tokens for this user
      await env.DB.prepare(
        `UPDATE telegram_link_tokens SET is_used = 1 WHERE telegram_id = ? AND is_used = 0`
      ).bind(String(telegram_id)).run().catch(() => {});

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

    // ── GET /blocktopia/progression ────────────────────────────────────────
    // Body/query must include a signed Telegram Login auth payload:
    // ?telegram_auth=<urlencoded-json> OR POST body shape reused in GET caller.
    if (path === '/blocktopia/progression' && request.method === 'GET') {
      const rawAuth = url.searchParams.get('telegram_auth');
      if (!rawAuth) return err('verified telegram_auth payload required', 401);
      let tgBody;
      try {
        tgBody = { telegram_auth: JSON.parse(rawAuth) };
      } catch {
        return err('Invalid telegram_auth payload', 400);
      }

      const verified = await verifyTelegramIdentityFromBody(tgBody, env);
      if (verified.error) return err(verified.error, verified.status || 401);

      try {
        await ensureBlockTopiaProgressionTables(env.DB);
        await upsertTelegramUser(env.DB, verified.user).catch(() => {});
        const row = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const upgrades = getUpgradeSnapshot(row);
        const effects = buildUpgradeEffects(upgrades);
        const { drain, xpAfterDrain, drainPerMinute } = applyProgressionDrain(row, Date.now(), effects);
        const gems = clamp(Number(row.gems) || 0, GEMS_MIN, GEMS_MAX);
        const tierAfter = clamp(Number(row.tier) || 1, TIER_MIN, TIER_MAX);
        const winStreak = Math.max(0, Math.floor(Number(row.win_streak) || 0));
        const rpgModeActive = Number(row.rpg_mode_active) === 1;

        await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET xp = ?, gems = ?, tier = ?, win_streak = ?, upgrade_efficiency = ?, upgrade_signal = ?,
              upgrade_defense = ?, upgrade_gem = ?, upgrade_npc = ?, rpg_mode_active = ?,
              last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?
        `).bind(
          xpAfterDrain, gems, tierAfter, winStreak,
          upgrades.efficiency, upgrades.signal, upgrades.defense, upgrades.gem, upgrades.npc,
          rpgModeActive ? 1 : 0,
          verified.telegramId,
        ).run();

        return json({
          ok: true,
          progression: {
            telegram_id: verified.telegramId,
            xp: xpAfterDrain,
            gems,
            tier: tierAfter,
            win_streak: winStreak,
            drain_applied: drain,
            drain_per_minute: drainPerMinute,
            rpg_mode_active: rpgModeActive,
            rpg_entry_cost: computeRpgEntryCost(tierAfter),
            upgrades,
            effects,
            last_active: new Date().toISOString(),
          },
        });
      } catch {
        return err('Failed to load Block Topia progression', 500);
      }
    }

    if (path === '/blocktopia/progression/entry' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const verified = await verifyTelegramIdentityFromBody(body, env);
      if (verified.error) return err(verified.error, verified.status || 401);
      try {
        await ensureBlockTopiaProgressionTables(env.DB);
        const row = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const tier = clamp(Math.floor(Number(row.tier) || 1), TIER_MIN, TIER_MAX);
        const entryCost = computeRpgEntryCost(tier);
        const gems = clamp(Math.floor(Number(row.gems) || 0), GEMS_MIN, GEMS_MAX);
        if (gems < entryCost) return err('Not enough gems for RPG mode entry', 402);
        const miniGameCost = computeMiniGameCost(tier);
        const xp = clamp(Math.floor(Number(row.xp) || 0), XP_MIN, XP_MAX);
        const seededXp = Math.max(xp, miniGameCost);
        const nextGems = clamp(gems - entryCost, GEMS_MIN, GEMS_MAX);
        await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET xp = ?, gems = ?, rpg_mode_active = 1, last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?
        `).bind(seededXp, nextGems, verified.telegramId).run();
        return json({
          ok: true,
          progression: {
            telegram_id: verified.telegramId,
            xp: seededXp,
            gems: nextGems,
            tier,
            rpg_mode_active: true,
            entry_cost_paid: entryCost,
            first_mini_game_cost: miniGameCost,
            first_mini_game_seed_xp: Math.max(0, seededXp - xp),
          },
        });
      } catch {
        return err('Failed to enter RPG mode', 500);
      }
    }

    if (path === '/blocktopia/progression/upgrade' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const verified = await verifyTelegramIdentityFromBody(body, env);
      if (verified.error) return err(verified.error, verified.status || 401);
      const upgradeId = String(body?.upgrade || '').trim().toLowerCase();
      const config = BLOCKTOPIA_UPGRADES[upgradeId];
      if (!config) return err('Invalid upgrade key', 400);
      try {
        await ensureBlockTopiaProgressionTables(env.DB);
        const row = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const upgrades = getUpgradeSnapshot(row);
        const currentLevel = upgrades[upgradeId];
        if (currentLevel >= UPGRADE_MAX_LEVEL) return err('Upgrade already at max level', 409);
        const cost = computeUpgradeCost(config.baseCost, currentLevel);
        const gems = clamp(Math.floor(Number(row.gems) || 0), GEMS_MIN, GEMS_MAX);
        if (gems < cost) return err('Not enough gems for upgrade', 402);
        const nextLevel = clamp(currentLevel + 1, 0, UPGRADE_MAX_LEVEL);
        const nextGems = clamp(gems - cost, GEMS_MIN, GEMS_MAX);
        await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET gems = ?, ${config.column} = ?, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?
        `).bind(nextGems, nextLevel, verified.telegramId).run();
        const latest = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const nextUpgrades = getUpgradeSnapshot(latest);
        return json({
          ok: true,
          progression: {
            telegram_id: verified.telegramId,
            gems: nextGems,
            upgrades: nextUpgrades,
            effects: buildUpgradeEffects(nextUpgrades),
          },
          upgrade: {
            id: upgradeId,
            level: nextLevel,
            max_level: UPGRADE_MAX_LEVEL,
            cost_paid: cost,
            next_cost: nextLevel >= UPGRADE_MAX_LEVEL ? null : computeUpgradeCost(config.baseCost, nextLevel),
          },
        });
      } catch {
        return err('Failed to apply RPG upgrade', 500);
      }
    }

    // ── POST /blocktopia/progression/mini-game ────────────────────────────
    // Server-authoritative progression sync; ignores client-provided xp/gems/tier.
    if (path === '/blocktopia/progression/mini-game' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }

      const verified = await verifyTelegramIdentityFromBody(body, env);
      if (verified.error) return err(verified.error, verified.status || 401);

      const action = String(body?.action || '').trim();
      const type = String(body?.type || '').trim().toLowerCase();
      const game = String(body?.game || '').trim().toLowerCase();
      const score = Math.floor(Number(body?.score) || 0);
      if (!Number.isFinite(score) || score < 0 || score > BLOCKTOPIA_MAX_SCORE_SANITY) {
        return err('Invalid score payload for progression update', 400);
      }
      if (action === 'arcade_score' && (!game || !/^[a-z0-9_-]{2,32}$/.test(game))) {
        return err('Invalid game key for arcade score update', 400);
      }
      let leaderboardCtx = null;
      if (action === 'arcade_score') {
        try {
          leaderboardCtx = await fetchTrustedLeaderboardContext(env, game, verified.telegramId, verified.user);
        } catch {
          return err('Failed to verify trusted leaderboard context', 502);
        }
        if (!leaderboardCtx || leaderboardCtx.trustedBestScore <= 0) {
          return err('Score not found on trusted leaderboard', 409);
        }
        if (score > leaderboardCtx.trustedBestScore) {
          return err('Submitted score exceeds trusted leaderboard best', 409);
        }
        const alreadyRewardedScore = await hasArcadeScoreBeenRewarded(env.DB, verified.telegramId, game, score);
        leaderboardCtx.improvementEligible =
          score > 0 && score >= leaderboardCtx.trustedBestScore && !alreadyRewardedScore;
      }
      try {
        await ensureBlockTopiaProgressionTables(env.DB);
        await upsertTelegramUser(env.DB, verified.user).catch(() => {});

        const allowed = await enforceProgressionRateLimit(env.DB, verified.telegramId);
        if (!allowed) return err('Too many progression updates. Try again in a minute.', 429);
        const row = await getOrCreateBlockTopiaProgression(env.DB, verified.telegramId);
        const upgrades = getUpgradeSnapshot(row);
        const effects = buildUpgradeEffects(upgrades);
        if (action !== 'arcade_score' && Number(row?.rpg_mode_active || 0) !== 1) {
          return err('RPG mode entry required before mini-game rewards', 403);
        }
        const rewards = computeBlockTopiaRewards(action, action === 'arcade_score' ? game : type, score, leaderboardCtx, row);
        if (!rewards) return err('Invalid action/type for progression update', 400);
        if (action === 'arcade_score') {
          rewards.xp = clamp(Math.floor(rewards.xp * TELEGRAM_SYNC_XP_MULTIPLIER), XP_MIN, XP_MAX);
          const perGameAllowed = await enforceArcadeGameHourlyLimit(env.DB, verified.telegramId, game);
          if (!perGameAllowed) return err('Arcade rewards capped for this game this hour.', 429);
          const awardedLastMinute = await getArcadeXpAwardedLastMinute(env.DB, verified.telegramId);
          if (awardedLastMinute >= BLOCKTOPIA_ARCADE_MAX_XP_PER_MINUTE) {
            return err('Arcade XP minute cap reached. Try again shortly.', 429);
          }
          rewards.xp = clamp(
            rewards.xp,
            XP_MIN,
            Math.max(XP_MIN, BLOCKTOPIA_ARCADE_MAX_XP_PER_MINUTE - awardedLastMinute),
          );
        }
        const { drain, xpAfterDrain, drainPerMinute } = applyProgressionDrain(row, Date.now(), effects);
        const currentTier = clamp(Math.floor(Number(row.tier) || 1), TIER_MIN, TIER_MAX);
        const miniGameCost = action === 'arcade_score' ? 0 : computeMiniGameCost(currentTier);
        if (action !== 'arcade_score' && xpAfterDrain < miniGameCost) {
          await env.DB.prepare(`
            UPDATE blocktopia_progression
            SET xp = ?, rpg_mode_active = 0, win_streak = 0, last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ?
          `).bind(xpAfterDrain, verified.telegramId).run();
          return json({
            ok: false,
            exited: true,
            reason: 'mini_game_unaffordable',
            progression: {
              telegram_id: verified.telegramId,
              xp: xpAfterDrain,
              gems: clamp((Number(row.gems) || 0), GEMS_MIN, GEMS_MAX),
              tier: currentTier,
              win_streak: 0,
              rpg_mode_active: false,
              mini_game_cost: miniGameCost,
              drain_applied: drain,
              drain_per_minute: drainPerMinute,
            },
          }, 409);
        }
        const xpCost = miniGameCost;
        const xpLossPenalty = action === 'mini_game_loss' ? computeMiniGameLossPenalty(currentTier) : 0;
        const xpBeforeOutcome = clamp(xpAfterDrain - xpCost, XP_MIN, XP_MAX);
        let tentativeXp = clamp(xpBeforeOutcome - xpLossPenalty + rewards.xp, XP_MIN, XP_MAX);
        if (action === 'mini_game_loss' && xpBeforeOutcome > BLOCKTOPIA_SURVIVAL_XP_FLOOR) {
          tentativeXp = Math.max(BLOCKTOPIA_SURVIVAL_XP_FLOOR, tentativeXp);
        }
        const nextXp = tentativeXp;
        const nextGems = clamp((Number(row.gems) || 0) + rewards.gems, GEMS_MIN, GEMS_MAX);
        const currentStreak = Math.max(0, Math.floor(Number(row.win_streak) || 0));
        let nextTier = currentTier;
        let nextWinStreak = currentStreak;
        if (action === 'mini_game_win') {
          nextWinStreak += 1;
          nextTier += 1;
          if (nextWinStreak >= 3) nextTier += 1;
        } else if (action === 'mini_game_loss') {
          nextTier -= 1;
          nextWinStreak = 0;
        }
        nextTier = clamp(nextTier, TIER_MIN, TIER_MAX);

        await env.DB.prepare(`
          UPDATE blocktopia_progression
          SET xp = ?, gems = ?, tier = ?, win_streak = ?, last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?
        `).bind(nextXp, nextGems, nextTier, nextWinStreak, verified.telegramId).run();

        await env.DB.prepare(`
          INSERT INTO blocktopia_progression_events
            (id, telegram_id, action, action_type, score, xp_change, gems_change)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          verified.telegramId,
          action,
          action === 'arcade_score' ? game : type,
          rewards.score,
          rewards.xp - xpCost - xpLossPenalty,
          rewards.gems,
        ).run();

        const syncedMultiplierApplied = action === 'arcade_score' ? TELEGRAM_SYNC_XP_MULTIPLIER : 1;
        return json({
          ok: true,
          progression: {
            telegram_id: verified.telegramId,
            xp: nextXp,
            gems: nextGems,
            tier: nextTier,
            win_streak: nextWinStreak,
            drain_applied: drain,
            drain_per_minute: drainPerMinute,
            rpg_mode_active: Number(row.rpg_mode_active || 0) === 1,
            upgrades,
            effects,
            xp_awarded: rewards.xp,
            xp_cost: xpCost,
            xp_loss_penalty: xpLossPenalty,
            xp_net: rewards.xp - xpCost - xpLossPenalty,
            gems_awarded: rewards.gems,
            xp_base: rewards.base_xp || 0,
            xp_bonus: rewards.bonus_xp || 0,
            bonus_flags: rewards.bonus_flags || [],
            gem_chance: rewards.gem_chance || 0,
            node_corruption_applied: action === 'mini_game_loss',
            sam_pressure_delta: action === 'mini_game_loss' ? 7 : -3,
            leaderboard: rewards.leaderboard || null,
            synced_multiplier: syncedMultiplierApplied,
          },
        });
      } catch {
        return err('Failed to sync mini-game progression', 500);
      }
    }

    // ── POST /blocktopia/progression/reset ────────────────────────────────
    // Clears progression and event history for the verified account.
    if (path === '/blocktopia/progression/reset' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('Invalid JSON'); }
      const verified = await verifyTelegramIdentityFromBody(body, env);
      if (verified.error) return err(verified.error, verified.status || 401);

      try {
        await ensureBlockTopiaProgressionTables(env.DB);
        await env.DB.prepare(
          `DELETE FROM blocktopia_progression_events WHERE telegram_id = ?`
        ).bind(verified.telegramId).run();
        await env.DB.prepare(
          `DELETE FROM blocktopia_progression WHERE telegram_id = ?`
        ).bind(verified.telegramId).run();
        await env.DB.prepare(
          `INSERT INTO blocktopia_progression (telegram_id, xp, gems, tier, win_streak, last_active, updated_at)
           VALUES (?, 0, 0, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(telegram_id) DO UPDATE SET
             xp = 0, gems = 0, tier = 1, win_streak = 0, last_active = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
        ).bind(verified.telegramId).run();

        return json({
          ok: true,
          progression: {
            telegram_id: verified.telegramId,
            xp: 0,
            gems: 0,
            tier: 1,
            win_streak: 0,
            reset: true,
          },
        });
      } catch {
        return err('Failed to reset Block Topia progression', 500);
      }
    }

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
      await upsertTelegramUser(db, member).catch(() => {});
      await logTelegramActivity(db, telegramId, 'chat_join',
        JSON.stringify({ chat_id: String(msg.chat?.id || '') }));
      // Award join XP only once per user
      const prior = await db.prepare(
        `SELECT id FROM telegram_xp_log WHERE telegram_id = ? AND action = 'group_join' LIMIT 1`
      ).bind(telegramId).first().catch(() => null);
      if (!prior) {
        await awardXp(db, telegramId, XP_GROUP_JOIN, 'group_join').catch(() => {});
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
  if (telegramId) await upsertTelegramUser(db, fromUser).catch(() => {});

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
    await awardXp(db, telegramId, XP_FIRST_START, 'first_start').catch(() => {});
    xpMsg = `\n\n⚡ You earned <b>${XP_FIRST_START} XP</b> for your first launch!`;
  }

  await logTelegramActivity(db, telegramId, 'gkstart').catch(() => {});

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
  ).bind(telegramId).run().catch(() => {});

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
  } catch { /* table absent — proceed */ }

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
  `).bind(telegramId, target.id).run().catch(() => {});

  await logTelegramActivity(db, telegramId, 'faction_join',
    JSON.stringify({ faction: target.name })).catch(() => {});

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
  } catch { /* table absent — proceed */ }

  // Check if already claimed today using telegram_xp_log
  if (await hasDailyClaimToday(db, telegramId).catch(() => false)) {
    await sendTelegramMessage(tok, chatId,
      `⏳ You already claimed your daily XP today (UTC: ${today}).\nCome back tomorrow!`
    );
    return;
  }

  await awardXp(db, telegramId, XP_DAILY_CLAIM, 'daily_claim', today).catch(() => {});
  await logTelegramActivity(db, telegramId, 'daily_claim').catch(() => {});

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

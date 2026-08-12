Warning: truncated output (original token count: 169362)
Total output lines: 13721

import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP, GEMS_MAX, GEMS_MIN, TELEGRAM_AUTH_MAX_AGE, XP_MAX, XP_MIN } from './blocktopia/config.js';
import { verifyTelegramIdentityFromBody } from './blocktopia/auth.js';
import { getOrCreateBlockTopiaProgression, hasBlockTopiaFactionColumns } from './blocktopia/db.js';
import { handleBlockTopiaProgressionRoute } from './blocktopia/routes.js';
import { buildDailyLoopState, handleDailyLoopStateRoute } from './routes/daily-loop-state.js';
import { handleRogueliteDailyRoutes } from './routes/daily-digest.js';
import { handleWaxBridgeRoute } from './routes/wax/index.js';
import { applyPetRuntimeAward, buildPetGearSummary, buildPetProgressSummary, getOrCreatePetRuntimeState } from './pets/runtime-phase-5a.js';
import {
  createDailyMoonRun, extractDailyMoonRun, getDailyMoonRunReservation, processDailyMoonRunStep,
  recordDailyCareChallenge, syncDailyMoonRun,
} from './pets/daily-moon-run.js';
import {
  MOONPET_EVOLUTIONS, MOONPET_PERSONALITY_TRAITS, evolveMoonpet, formatMoonpetIdentitySummary,
  getMoonpetIdentityAnalytics, getMoonpetIdentitySummary, recordMoonpetBehaviour, recordMoonpetBiggestReward, recordMoonpetMemory,
  validateMoonpetEvolutionContent,
} from './pets/moonpet-identity.js';
import {
  PET_ROGUELITE_BOSSES, PET_ROGUELITE_ENEMIES, PET_ROGUELITE_REGIONS, PET_ROGUELITE_RELICS, PET_ROGUELITE_ROOMS, PET_RUN_MODIFIERS,
  advancePetRun, awardPetReward, buildPetProfileDeltas, choosePetRunModifier, completePetRun, createPetRunRoom,
  extractPetRogueliteRun, failPetRun, finishPetRogueliteRun, generatePetRunRoom, persistPetRunRoomOutcome,
  resolvePetRunRoom, rewardPetRogueliteBoss, rewardPetRunRoom, startPetRogueliteRun,
  validatePetRelicContent, validatePetRogueliteContent, validatePetRunModifier,
} from './pets/roguelite-foundation.js';
import { reconcileLegacyPetInventory } from './pets/inventory-cutover.js';
import {
  PET_ACHIEVEMENTS, PET_SEASON_REWARD_TIERS, buildMoonpetReaction, calculatePetWeeklyBossDamage,
  getPetEvolutionPerk, getPetSeasonRewardTier, getPetWeeklyBoss,
  selectMoonpetReaction,
} from './pets/player-expansion.js';
import {
  buildPetGuidanceCandidates, choosePetNextAction, mergePetGuidanceReplyMarkup,
} from './pets/player-guidance.js';
import {
  PET_ECONOMY_ROUTES, buildPetEconomyGuidanceActions, formatPetEconomyValue,
  getPetDailyBounties, getPetExpedition, getPetMarketOffers, resolvePetExpeditionReward,
} from './pets/economy-expansion.js';
import { PET_CRAFTING_MATERIALS } from './pets/economy-phase-3.js';
import { PET_ELITE_JOBS, canStartPetEliteJob } from './pets/content-phase-4.js';
import { PET_JOB_LORE, buildPetRegionDirectory } from './pets/game-content.js';
import {
  applyPetFactionBonus, buildPetLiveSystemsState, processPetCosmeticUnlock, processPetDistrictMission,
  processPetEquipmentUpgrade, processPetEventChain, processPetPrestige, processPetSeasonalBoss,
} from './pets/live-systems.js';
import { issuePetMiniAppChallenge, verifyPetMiniAppChallenge, verifyTelegramMiniAppInitData } from './pets/mini-app-auth.js';
import { resolvePetCallbackRoute } from './pets/mini-app-routing.js';
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
const PET_REPEAT_REWARD_RULES = Object.freeze({
  event: Object.freeze({ full_rewarded: 6, reduced_rewarded: 10, reduced_multiplier: 0.5 }),
  kaiju: Object.freeze({ full_rewarded: 5, reduced_rewarded: 10, reduced_multiplier: 0.5 }),
});
const PET_TRADE_MIN_GOLD = 10;
const PET_TRADE_MAX_GOLD = 250;
const PET_TRADE_COOLDOWN_SECONDS = 300;
const PET_ADVENTURE_COOLDOWN_SECONDS = 1800;
const PET_NOTIFICATION_COOLDOWN_MINUTES = 180;
const PET_NOTIFICATION_BATCH_LIMIT = 35;
const PET_KAIJU_MATCH_TTL_MINUTES = 20;
const PET_KAIJU_QUEUE_LIMIT = 12;
const PET_ARENA_MIN_LEVEL = 10;
const PET_ARENA_ANY_RANK_TIMEOUT_MINUTES = 3;
const PET_ARENA_QUEUE_TTL_MINUTES = 20;
const PET_ARENA_BATTLE_TTL_MINUTES = 15;
const PET_ACTIVITY_TYPES = Object.freeze(['sleep', 'train', 'work', 'explore']);
const PET_ACTIVITY_MIN_SECONDS = 5 * 60;
const PET_ACTIVITY_GRACE_SECONDS = 24 * 60 * 60;
const PET_ACTIVITY_CAP_SECONDS = Object.freeze({ sleep: 8 * 3600, train: 2 * 3600, work: 8 * 3600, explore: 8 * 3600 });
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
  const ipLimit = Math.max(1, Math.floor(Number(options.ipLimit) || readPositiveIntegerEnv(env, 'RATE_LIMIT_PUBLIC_PER_MINUTE', RATE_LIMIT_DEFAULT_PUBLIC_PER_MINUTE)));
  const telegramLimit = Math.max(1, Math.floor(Number(options.telegramLimit) || readPositiveIntegerEnv(env, 'RATE_LIMIT_TELEGRAM_PER_MINUTE', RATE_LIMIT_DEFAULT_TELEGRAM_PER_MINUTE)));
  const checks = [];
  if (options.includeIp !== false) {
    checks.push({ scope: 'ip', id: getClientIp(request), limit: ipLimit });
  }
  const telegramId = String(options.telegramId || extractRateLimitTelegramId(body) || '').trim();
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

const PET_GROWTH_STAGE_THRESHOLDS = [
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
    min_level: 1,
    min_evolution_stage: 0,
  },
  courier: {
    key: 'courier',
    title: 'Courier',
    pet_xp: 24,
    moon_gold: 26,
    style_tokens: 0,
    min_level: 1,
    min_evolution_stage: 0,
  },
  crystal_miner: {
    key: 'crystal_miner',
    title: 'Crystal Miner',
    pet_xp: 30,
    moon_gold: 12,
    moon_crystals: 2,
    min_level: 1,
    min_evolution_stage: 0,
  },
  vault_guard: {
    key: 'vault_guard',
    title: 'Vault Guard',
    pet_xp: 36,
    moon_gold: 30,
    style_tokens: 1,
    min_level: 1,
    min_evolution_stage: 0,
  },
  arcade_tester: {
    key: 'arcade_tester', title: 'Arcade Tester', pet_xp: 26, moon_gold: 20, style_tokens: 2,
    min_level: 6, min_evolution_stage: 1,
  },
  rooftop_courier: {
    key: 'rooftop_courier', title: 'Rooftop Courier', pet_xp: 34, moon_gold: 38, style_tokens: 1,
    min_level: 12, min_evolution_stage: 1,
  },
  signal_hacker: {
    key: 'signal_hacker', title: 'Signal Hacker', pet_xp: 38, moon_gold: 24, moon_crystals: 2,
    min_level: 20, min_evolution_stage: 2,
  },
  drone_mechanic: {
    key: 'drone_mechanic', title: 'Drone Mechanic', pet_xp: 42, moon_gold: 44, style_tokens: 2,
    min_level: 22, min_evolution_stage: 2,
  },
  mural_commission: {
    key: 'mural_commission', title: 'Mural Commission', pet_xp: 48, moon_gold: 42, style_tokens: 5,
    min_level: 30, min_evolution_stage: 3,
  },
  relic_appraiser: {
    key: 'relic_appraiser', title: 'Relic Appraiser', pet_xp: 52, moon_gold: 34, moon_crystals: 4,
    min_level: 35, min_evolution_stage: 3,
  },
  citadel_envoy: {
    key: 'citadel_envoy', title: 'Citadel Envoy', pet_xp: 58, moon_gold: 55, style_tokens: 5,
    min_level: 50, min_evolution_stage: 4,
  },
  guardian_patrol: {
    key: 'guardian_patrol', title: 'Guardian Patrol', pet_xp: 62, moon_gold: 60, moon_crystals: 3,
    min_level: 50, min_evolution_stage: 4,
  },
  vault_security: {
    key: 'vault_security', title: 'Vault Security', pet_xp: 54, moon_gold: 58, style_tokens: 2,
    min_level: 25, min_evolution_stage: 2,
  },
  kaiju_recovery: {
    key: 'kaiju_recovery', title: 'Kaiju Recovery', pet_xp: 66, moon_gold: 48, moon_crystals: 4,
    min_level: 45, min_evolution_stage: 3,
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
  cardboard_armor: { key: 'cardboard_armor', slot: 'armor', title: 'Cardboard Armor', description: 'Starter arena armor: +4 defense.', cost: { moon_gold: 60, moon_crystals: 0, style_tokens: 0 }, min_level: 10, arena: { defense: 4 } },
  moon_helmet: { key: 'moon_helmet', slot: 'armor', title: 'Moon Helmet', description: 'Arena armor: +7 defense and +2 dodge.', cost: { moon_gold: 120, moon_crystals: 2, style_tokens: 0 }, min_level: 12, arena: { defense: 7, dodge: 2 } },
  street_armor: { key: 'street_armor', slot: 'armor', title: 'Street Armor', description: 'Arena armor: +11 defense.', cost: { moon_gold: 220, moon_crystals: 6, style_tokens: 4 }, min_level: 18, arena: { defense: 11 } },
  cyber_armor: { key: 'cyber_armor', slot: 'armor', title: 'Cyber Armor', description: 'Elite arena armor: +18 defense and +3 luck.', cost: { moon_gold: 520, moon_crystals: 18, style_tokens: 16 }, min_level: 35, arena: { defense: 18, luck: 3 } },
  foam_claws: { key: 'foam_claws', slot: 'weapon', title: 'Foam Claws', description: 'Starter arena weapon: +5 attack.', cost: { moon_gold: 70, moon_crystals: 0, style_tokens: 0 }, min_level: 10, arena: { attack: 5 } },
  laser_claws: { key: 'laser_claws', slot: 'weapon', title: 'Laser Claws', description: 'Arena weapon: +11 attack and +2 crit.', cost: { moon_gold: 240, moon_crystals: 7, style_tokens: 4 }, min_level: 18, arena: { attack: 11, crit: 2 } },
  moon_blaster: { key: 'moon_blaster', slot: 'weapon', title: 'Moon Blaster', description: 'Elite arena weapon: +18 attack and +4 crit.', cost: { moon_gold: 560, moon_crystals: 20, style_tokens: 12 }, min_level: 35, arena: { attack: 18, crit: 4 } },
  lucky_charm: { key: 'lucky_charm', slot: 'charm', title: 'Lucky Charm', description: 'Arena charm: +6 luck and +2 crit.', cost: { moon_gold: 140, moon_crystals: 4, style_tokens: 8 }, min_level: 10, arena: { luck: 6, crit: 2 } },
  shield_charm: { key: 'shield_charm', slot: 'charm', title: 'Shield Charm', description: 'Arena charm: +5 defense and +3 dodge.', cost: { moon_gold: 180, moon_crystals: 5, style_tokens: 8 }, min_level: 14, arena: { defense: 5, dodge: 3 } },
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

function getPetGrowthStage(petXp) {
  return PET_GROWTH_STAGE_THRESHOLDS.reduce((current, candidate) => (
    Number(petXp || 0) >= candidate.min_xp ? candidate : current
  ), PET_GROWTH_STAGE_THRESHOLDS[0]).stage;
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

function normalizePetActivityType(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return PET_ACTIVITY_TYPES.includes(key) ? key : null;
}

function formatPetDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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

function getPetRepeatRewardMultiplier(mode, claimedSlot) {
  const rule = PET_REPEAT_REWARD_RULES[String(mode || '').trim().toLowerCase()];
  if (!rule) return 0;
  const slot = Math.max(1, Math.floor(Number(claimedSlot) || 1));
  if (slot <= rule.full_rewarded) return 1;
  if (slot <= rule.reduced_rewarded) return rule.reduced_multiplier;
  return 0;
}

function scalePetRewardRange(value, multiplier) {
  const scale = Math.max(0, Math.min(1, Number(multiplier) || 0));
  if (Array.isArray(value)) return value.map((entry) => Math.max(0, Math.floor((Number(entry) || 0) * scale)));
  return Math.max(0, Math.floor((Number(value) || 0) * scale));
}

function scalePetRewards(rewards = {}, multiplier = 1) {
  return Object.fromEntries(Object.entries(rewards || {}).map(([key, value]) => [key, scalePetRewardRange(value, multiplier)]));
}

function getPetHighLevelGearXpMultiplier(pet) {
  const level = getPetLevel(pet?.pet_xp);
  if (level <= 35) return 1;
  if (level <= 50) return 0.6;
  return 0.35;
}

function parsePetRepeatRewardReservation(row, mode) {
  if (!row) return null;
  if (String(row.status) !== 'pending') return { claimed: false, duplicate: true, reservation_id: row.id || null };
  const match = String(row.reason || '').match(/^repeat_reward_slot:(\d+)(?::energy_paid:(\d+))?$/);
  if (!match) throw new Error('invalid_pending_pet_repeat_reward_reservation');
  const dayKey = String(row.day_key || '').trim();
  const weekKey = String(row.week_key || '').trim();
  const seasonKey = String(row.season_key || '').trim();
  if (!dayKey || !weekKey || !seasonKey) throw new Error('invalid_pending_pet_repeat_reward_window');
  const claimedSlot = Math.max(1, Math.floor(Number(match[1]) || 1));
  return {
    claimed: true,
    resumed: true,
    reservation_id: row.id,
    claimed_slot: claimedSlot,
    multiplier: getPetRepeatRewardMultiplier(mode, claimedSlot),
    energy_paid: Math.max(0, Math.floor(Number(match[2]) || 0)),
    day_key: dayKey,
    week_key: weekKey,
    season_key: seasonKey,
  };
}

async function reservePetRepeatRewardEvent(db, details) {
  const normalizedMode = String(details.mode || '').trim().toLowerCase();
  if (!PET_REPEAT_REWARD_RULES[normalizedMode]) throw new Error('invalid_pet_repeat_reward_mode');
  const telegramId = String(details.telegram_id);
  const eventKey = String(details.event_key);
  const existing = details.existing_event || await db.prepare(`
    SELECT id, status, reason, day_key, week_key, season_key
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?
  `).bind(telegramId, eventKey).first().catch(() => null);
  if (existing) return parsePetRepeatRewardReservation(existing, normalizedMode);

  const reservationId = crypto.randomUUID();
  const energyCost = normalizedMode === 'kaiju' ? Math.max(0, Math.floor(Number(details.energy_cost || 0))) : 0;
  const metadata = JSON.stringify({ source: details.source || 'telegram_bot', mode: normalizedMode });
  const insert = normalizedMode === 'kaiju'
    ? db.prepare(`
        INSERT OR IGNORE INTO telegram_pet_events
          (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
        SELECT ?, ?, ?, ?, 0, 0, ?, ?, ?, 'pending', 'repeat_reward_pending', ?
        WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ? AND energy >= ?)
      `).bind(
        reservationId, telegramId, String(details.event_type), eventKey, String(details.season_key),
        String(details.day_key), String(details.week_key), metadata, telegramId, energyCost,
      )
    : db.prepare(`
        INSERT OR IGNORE INTO telegram_pet_events
          (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, 'pending', 'repeat_reward_pending', ?)
      `).bind(
        reservationId, telegramId, String(details.event_type), eventKey, String(details.season_key),
        String(details.day_key), String(details.week_key), metadata,
      );
  const statements = [insert];
  if (normalizedMode === 'kaiju') {
    statements.push(db.prepare(`
      UPDATE telegram_pet_profiles
      SET energy = energy - ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND energy >= ?
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
    `).bind(energyCost, telegramId, energyCost, reservationId));
  }
  statements.push(
    db.prepare(`
      INSERT INTO telegram_pet_repeat_reward_slots (telegram_id, day_key, mode, claimed_count, updated_at)
      SELECT ?, ?, ?, 1, CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
      ON CONFLICT(telegram_id, day_key, mode) DO UPDATE SET
        claimed_count = claimed_count + 1,
        updated_at = CURRENT_TIMESTAMP
      RETURNING claimed_count
    `).bind(telegramId, String(details.day_key), normalizedMode, reservationId),
    db.prepare(`
      UPDATE telegram_pet_events
      SET reason = 'repeat_reward_slot:' || CAST((
        SELECT claimed_count FROM telegram_pet_repeat_reward_slots
        WHERE telegram_id = ? AND day_key = ? AND mode = ?
      ) AS TEXT) || ?
      WHERE id = ? AND status = 'pending'
      RETURNING id, status, reason, day_key, week_key, season_key
    `).bind(
      telegramId,
      String(details.day_key),
      normalizedMode,
      normalizedMode === 'kaiju' ? `:energy_paid:${energyCost}` : '',
      reservationId,
    ),
  );
  const results = await db.batch(statements);
  const reservedRow = results[results.length - 1]?.results?.[0] || null;
  if (reservedRow) {
    if (normalizedMode === 'kaiju' && Number(results[1]?.meta?.changes || 0) !== 1) {
      throw new Error('kaiju_energy_claim_failed');
    }
    const parsed = parsePetRepeatRewardReservation(reservedRow, normalizedMode);
    return { ...parsed, resumed: false };
  }
  const concurrent = await db.prepare(`
    SELECT id, status, reason, day_key, week_key, season_key
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?
  `).bind(telegramId, eventKey).first().catch(() => null);
  if (concurrent) return parsePetRepeatRewardReservation(concurrent, normalizedMode);
  if (normalizedMode === 'kaiju') return { claimed: false, reason: 'insufficient_energy', reservation_id: null };
  throw new Error('pet_repeat_reward_reservation_failed');
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
  const basePetXp = Math.max(0, Math.floor(Number(rewards.pet_xp) || 0));

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

  const gearBonusPetXp = Math.max(0, Math.floor(Number(rewards.pet_xp) || 0) - basePetXp);
  rewards.pet_xp = basePetXp + Math.floor(gearBonusPetXp * getPetHighLevelGearXpMultiplier(pet));
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
    if (requestedRun && ['active', 'extractable'].includes(requestedRun.status)) {
      await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${requestedRun.run_id}:memory:start`, memory_type: 'first_run', milestone: 'first_run' });
      return { accepted: true, reason: 'run_resumed', run: requestedRun, pet };
    }
    if (requestedRun && PET_RUN_COMPLETED_STATUSES.includes(requestedRun.status)) return { accepted: false, reason: 'run_closed', run: requestedRun, pet, xp_awarded: 0, pet_xp_awarded: 0 };
    return { accepted: false, reason: 'run_not_found', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const active = await getActivePetRun(db, telegramId);
  if (active) {
    await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${active.run_id}:memory:start`, memory_type: 'first_run', milestone: 'first_run' });
    return { accepted: true, reason: 'run_resumed', run: active, pet };
  }
  if (clampPetStat(pet.energy) < 12) return { accepted: false, reason: 'pet_tired', pet };
  const now = new Date();
  const season = getPetSeasonInfo(now);
  const runId = `run-${crypto.randomUUID()}`.slice(0, 80);
  await db.prepare(`
    INSERT INTO telegram_pet_runs
      (id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level, unbanked_items)
    VALUES (?, ?, ?, ?, 'active', 0, ?, 1, '{}')
  `).bind(crypto.randomUUID(), telegramId, runId, season.key, PET_RUN_MAX_DEPTH).run();
  await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${runId}:memory:start`, memory_type: 'first_run', milestone: 'first_run' });
  const run = await getPetRunById(db, telegramId, runId);
  return { accepted: true, reason: 'run_started', run, pet };
}

async function recordPetRunBankedEvent(db, telegramId, run, pet, options = {}) {
  const now = new Date();
  const eventType = options.completed ? 'run_complete' : 'run_extract';
  const eventKey = String(options.completed ? (options.event_key || buildStablePetEventKey(['pet_run_complete', telegramId, run.run_id])) : buildPetRunExtractEventKey(telegramId, run.run_id)).slice(0, 120);
  const terminalStatus = options.completed ? 'completed' : 'extracted';
  const claimedRow = await db.prepare(`UPDATE telegram_pet_runs
    SET status = ?, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable')
    RETURNING *`).bind(terminalStatus, telegramId, run.run_id).first();
  const rewardRun = claimedRow ? serializePetRun(claimedRow) : await getPetRunById(db, telegramId, run.run_id);
  if (!rewardRun || rewardRun.status !== terminalStatus) {
    return { accepted: false, reason: 'run_closed', run: rewardRun || run, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const bankedItemsAuthority = parsePetRunItems(rewardRun.unbanked_items);
  const requestedCommunityXpAuthority = Math.max(0, Math.min(80,
    Math.floor(Math.max(0, Number(rewardRun.unbanked_pet_xp || 0)) / 3) + Math.max(0, Number(rewardRun.depth || 0)) * 4));
  const awardedAuthority = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_run_legacy', idempotency_key: eventKey, event_key: eventKey,
    event_type: eventType, xp_action: `pet_${eventType}`, reason: options.completed ? 'run_completed' : 'run_extracted',
    rewards: { pet_xp: rewardRun.unbanked_pet_xp, community_xp: requestedCommunityXpAuthority,
      moon_gold: rewardRun.unbanked_moon_gold, moon_crystals: rewardRun.unbanked_moon_crystals,
      style_tokens: rewardRun.unbanked_style_tokens, items: bankedItemsAuthority },
    touch_streak: true, now,
    context: { source: options.source || 'telegram_command', run_id: rewardRun.run_id, depth: rewardRun.depth, max_depth: rewardRun.max_depth },
  });
  if (!awardedAuthority.accepted) return { ...awardedAuthority, run: rewardRun, pet };
  await recordMoonpetBehaviour(db, { telegram_id: telegramId, event_key: `${rewardRun.run_id}:terminal:personality`, behaviour: 'exploration', activity: 'adventure', amount: 2 });
  await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${rewardRun.run_id}:terminal:memory`,
    memory_type: options.completed ? 'run_completed' : 'extraction',
    milestone: options.completed ? 'first_run_completed' : 'first_extraction', reward_amount: awardedAuthority.rewards?.moon_gold, reward_currency: 'moon_gold' });
  // Legacy runs have no persisted canonical boss room. Their completion may
  // record exploration and completion memories, but never boss authority.
  return { ...awardedAuthority, reason: awardedAuthority.duplicate ? 'duplicate' : (options.completed ? 'run_completed' : 'run_extracted'),
    run: rewardRun, banked_items: bankedItemsAuthority };
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
  const stepId = crypto.randomUUID();
  const stepInsertStatement = db.prepare(`
    INSERT OR IGNORE INTO telegram_pet_run_steps
      (id, telegram_id, run_id, step_index, choice_key, choice_type, event_key, success, risk_roll, pet_xp_delta, moon_gold_delta, moon_crystals_delta, style_tokens_delta, item_key, metadata)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM telegram_pet_runs
      WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable') AND depth = ?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM telegram_pet_inventory
        WHERE telegram_id = ? AND asset_type = 'item' AND asset_key = ? AND quantity > 0))
  `).bind(
    stepId,
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
    telegramId,
    run.run_id,
    stepIndex - 1,
    outcome.consumed_item_key,
    telegramId,
    outcome.consumed_item_key,
  );
  const consumedItemEventId = outcome.consumed_item_key ? crypto.randomUUID() : null;
  const consumedItemStatements = outcome.consumed_item_key
    ? [db.prepare(`
      INSERT OR IGNORE INTO telegram_pet_events
        (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, 'run_item_use', ?, 0, 0, ?, ?, ?, 'accepted', 'run_item_consumed', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ? AND telegram_id = ? AND run_id = ?)
    `).bind(
      consumedItemEventId,
      telegramId,
      buildStablePetEventKey(['pet_run_item_use', telegramId, run.run_id, stepIndex, outcome.consumed_item_key]),
      season.key,
      dayKey,
      weekKey,
      JSON.stringify({ source: options.source || 'telegram_command', inventory_authority: true, run_id: run.run_id, consumed_item_key: outcome.consumed_item_key, choice_key: choice.key }),
      stepId,
      telegramId,
      run.run_id,
    ), db.prepare(`
      UPDATE telegram_pet_inventory
      SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND asset_type = 'item' AND asset_key = ? AND quantity > 0
        AND EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?)
    `).bind(telegramId, outcome.consumed_item_key, stepId)]
    : [];

  if (!outcome.success) {
    const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
    let consolationXp = Math.max(1, Math.min(12, 4 + Math.floor(Number(run.depth || 0) * 2)));
    if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) consolationXp = 0;
    else if (totals.day.pet_xp + consolationXp > PETS_DAILY_PET_XP_CAP) consolationXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
    pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + consolationXp));
    updatePetStreakForAction(pet, dayKey);
    pet.last_decay_at = new Date().toISOString();
    const terminalStatements = [stepInsertStatement, db.prepare(`
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
      WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable') AND depth = ?
        AND EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?)
      RETURNING run_id
    `).bind(stepIndex, telegramId, run.run_id, stepIndex - 1, stepId), ...consumedItemStatements];
    const terminalResults = await db.batch(terminalStatements);
    if (!terminalResults?.[1]?.results?.[0]) {
      re…119362 tokens truncated…ram_pet_profiles WHERE telegram_id = ? AND energy >= 12)`)
      .bind(eventId, telegramId, weekKey, dayKey, boss.boss_id, eventKey, action, damage, telegramId),
    db.prepare(`UPDATE telegram_pet_profiles SET energy = energy - 12, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_events WHERE event_id = ?)`)
      .bind(telegramId, eventId),
    db.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id, week_key, boss_id, attempts, damage, defeated_at)
      SELECT ?, ?, ?, 1, ?, CASE WHEN ? >= ? THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_events WHERE event_id = ?)
      ON CONFLICT(telegram_id, week_key) DO UPDATE SET attempts = telegram_pet_weekly_boss_progress.attempts + 1,
        damage = telegram_pet_weekly_boss_progress.damage + excluded.damage,
        defeated_at = COALESCE(telegram_pet_weekly_boss_progress.defeated_at,
          CASE WHEN telegram_pet_weekly_boss_progress.damage + excluded.damage >= ? THEN CURRENT_TIMESTAMP ELSE NULL END),
        updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, weekKey, boss.boss_id, damage, damage, boss.hp, eventId, boss.hp),
  ]);
  if (!results?.[0]?.meta?.changes) return { accepted: false, reason: 'boss_attempt_not_reserved', boss, progress: progressBefore };
  const progress = await db.prepare(`SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?`).bind(telegramId, weekKey).first();
  const newlyDefeated = !progressBefore?.defeated_at && Boolean(progress?.defeated_at);
  let reward = null;
  if (newlyDefeated) {
    reward = await settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progress);
    await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${eventKey}:memory`, memory_type: 'boss_victory', boss_id: boss.boss_id, milestone: 'first_boss_victory' });
    await applyPetRuntimeCommandAward(db, telegramId, `runtime:${eventKey}`, 'run_boss');
  }
  return { accepted: true, duplicate: false, reason: newlyDefeated ? 'boss_defeated' : 'boss_damaged', boss, progress, damage, action, reward, week_key: weekKey, pet: await getPetProfile(db, telegramId) };
}

async function getPetSeasonRewardState(db, telegramId) {
  const season = getPetSeasonInfo(new Date());
  const [state, claims, identity] = await Promise.all([
    db.prepare(`SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id = ? AND season_key = ?`).bind(telegramId, season.key).first().catch(() => null),
    db.prepare(`SELECT tier_id, claimed_at FROM telegram_pet_season_reward_claims WHERE telegram_id = ? AND season_key = ?`).bind(telegramId, season.key).all().catch(() => ({ results: [] })),
    getMoonpetIdentitySummary(db, telegramId).catch(() => null),
  ]);
  const claimed = new Map((claims.results || []).map((row) => [row.tier_id, row.claimed_at]));
  const seasonXp = Math.max(0, Math.floor(Number(state?.season_xp) || 0));
  return { season, season_xp: seasonXp, evolution_stage: Math.max(0, Number(identity?.current_stage?.stage) || 0), tiers: PET_SEASON_REWARD_TIERS.map((tier) => ({ ...tier, unlocked: seasonXp >= tier.required_xp, claimed_at: claimed.get(tier.tier_id) || null })) };
}

async function claimPetSeasonReward(db, telegramId, tierIdRaw, eventKeyRaw = '') {
  const state = await getPetSeasonRewardState(db, telegramId);
  const rawTierId = String(tierIdRaw || '').trim().toLowerCase();
  const requested = getPetSeasonRewardTier(rawTierId);
  if (rawTierId && !requested) return { accepted: false, reason: 'invalid_season_tier', state };
  const tier = requested || state.tiers.find((entry) => entry.unlocked && !entry.claimed_at) || null;
  if (!tier) return { accepted: false, reason: 'no_season_reward_ready', state };
  if (state.season_xp < tier.required_xp) return { accepted: false, reason: 'season_tier_locked', tier, state };
  const eventKey = String(eventKeyRaw || `pet:season:${telegramId}:${state.season.key}:${tier.tier_id}`).slice(0, 180);
  const rewards = { ...tier.reward, style_tokens: Math.max(0, Number(tier.reward.style_tokens || 0) + state.evolution_stage) };
  const rewardKey = `season_reward:${telegramId}:${state.season.key}:${tier.tier_id}`;
  const award = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_season_reward', idempotency_key: rewardKey, event_key: rewardKey,
    event_type: 'season_reward', reason: tier.tier_id, rewards, touch_streak: false,
    context: { season_key: state.season.key, tier_id: tier.tier_id, evolution_stage: state.evolution_stage },
  });
  const claim = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_season_reward_claims
    (telegram_id, season_key, tier_id, event_key) VALUES (?, ?, ?, ?)`)
    .bind(telegramId, state.season.key, tier.tier_id, eventKey).run();
  return { accepted: Boolean(award.accepted || award.duplicate), duplicate: !claim?.meta?.changes, tier, rewards, award, state: await getPetSeasonRewardState(db, telegramId) };
}

async function cmdPetMenu(tok, chatId, menu) {
  const menus = {
    adventure: ['⚔️ <b>Adventure</b>\nChoose your Moonpet’s next challenge.', buildPetAdventureMenuReplyMarkup()],
    management: ['⚙️ <b>Management</b>\nItems, equipment, and trading.', buildPetManagementMenuReplyMarkup()],
    progress: ['📈 <b>Progress</b>\nYour Moonpet’s identity and journey.', buildPetProgressMenuReplyMarkup()],
  };
  const selected = menus[menu];
  if (selected) await sendTelegramMessage(tok, chatId, selected[0], { reply_markup: selected[1] });
}
async function cmdPetStatus(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const activity = await getActivePetActivitySession(db, telegramId).catch(() => null);
  const identity = pet ? await getMoonpetIdentitySummary(db, telegramId).catch(() => null) : null;
  const reaction = pet ? await selectMoonpetReaction(db, telegramId, 'status', identity || {}, { pet }).catch(() => buildMoonpetReaction('status', identity || {}, { pet })) : null;
  await sendTelegramPetReply(tok, chatId, formatPetStatus(pet, identity, activity, reaction), { reply_markup: petReplyMarkup() }, 'how_to_play', { db, telegram_id: telegramId, pet });
}

async function cmdPetDetails(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const missions = pet ? await buildPetMissions(db, telegramId).catch(() => null) : null;
  const activity = pet ? await getActivePetActivitySession(db, telegramId).catch(() => null) : null;
  const identity = pet ? await getMoonpetIdentitySummary(db, telegramId).catch(() => null) : null;
  const guided = pet
    ? await buildPetGuidedReply(db, telegramId, pet, formatPetDetails(pet, missions, activity, identity), buildPetProgressMenuReplyMarkup())
    : { text: formatPetDetails(pet, missions, activity, identity), reply_markup: buildPetProgressMenuReplyMarkup() };
  await sendTelegramBuiltPetGuidedReply(tok, chatId, db, telegramId, guided);
}

async function cmdPetCoach(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const guided = await buildPetGuidedReply(
    db,
    telegramId,
    pet,
    '<b>🧭 Moonpet Coach</b>\nI checked needs, active runs, missions, evolution, rewards, jobs and affordable upgrades.',
    petReplyMarkup(),
  );
  const evolution = guided.state?.evolution;
  const evolutionLines = evolution
    ? evolution.ready
      ? `\n\n<b>🧬 ${escapeHtml(evolution.name)}</b>\n✅ Every evolution requirement is complete.`
      : `\n\n<b>🧬 ${escapeHtml(evolution.name)} progress</b>\n${evolution.missing.map((item) => `• ${escapeHtml(item.label)}: ${item.current}/${item.required}`).join('\n')}`
    : '\n\n<b>🧬 Evolution</b>\n✅ Final evolution reached.';
  await sendTelegramBuiltPetGuidedReply(tok, chatId, db, telegramId, { ...guided, text: `${guided.text}${evolutionLines}` });
}

async function cmdPetIdentity(db, tok, chatId, telegramId, section) {
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  if (!identity) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const memory = identity.memories || {};
  let sectionCopy = {
    evolution: `<b>🧬 Evolution</b>\n${escapeHtml(identity.current_stage?.name || 'Moon Egg')}\n${escapeHtml(getPetEvolutionPerk(identity.current_stage?.stage).perk)}`,
    personality: `<b>🧠 Personality</b>\n${identity.personalities?.length ? identity.personalities.map((trait) => `• ${escapeHtml(trait.name)}`).join('\n') : '<i>Still forming</i>'}`,
    memories: `<b>📖 Memories</b>\n${[
      Number(memory.total_runs || 0) > 0 ? `• Runs completed: ${Number(memory.total_runs)}` : null,
      memory.favourite_activity ? `• Favourite activity: ${escapeHtml(memory.favourite_activity)}` : null,
      memory.first_boss_id ? `• First boss: ${escapeHtml(String(memory.first_boss_id).replaceAll('_', ' '))}` : null,
      ...(Array.isArray(memory.milestones) ? memory.milestones.slice(0, 4).map((milestone) => `• ${escapeHtml(String(milestone).replaceAll('_', ' '))}`) : []),
    ].filter(Boolean).join('\n') || '<i>Your story is just beginning.</i>'}`,
  }[section];
  let evolutionProgress = null;
  if (section === 'evolution') {
    const pet = await getPetProfile(db, telegramId).catch(() => null);
    evolutionProgress = await getPetEvolutionGuidance(db, telegramId, pet, identity);
    sectionCopy = evolutionProgress
      ? `<b>🧬 Evolution</b>\nCurrent: <b>${escapeHtml(identity.current_stage?.name || 'Moon Egg')}</b>\nNext: <b>${escapeHtml(evolutionProgress.name)}</b>\n\n${evolutionProgress.ready ? '✅ All requirements complete.' : evolutionProgress.missing.map((entry) => `• ${escapeHtml(entry.label)}: ${entry.current}/${entry.required}\n  <i>${escapeHtml(entry.source)}</i>`).join('\n')}\n\n${escapeHtml(getPetEvolutionPerk(evolutionProgress.stage).perk)}`
      : `<b>🧬 Evolution</b>\n<b>${escapeHtml(identity.current_stage?.name || 'Legendary Moon Guardian')}</b>\n✅ Final evolution reached.`;
  }
  const markup = section === 'evolution' && evolutionProgress
    ? { inline_keyboard: [[{ text: '🧬 Attempt Next Evolution', callback_data: 'pet:evolve' }], ...buildPetProgressMenuReplyMarkup().inline_keyboard] }
    : buildPetProgressMenuReplyMarkup();
  await sendTelegramMessage(tok, chatId, sectionCopy || formatMoonpetIdentitySummary(identity), { reply_markup: markup });
}

async function cmdPetAchievements(db, tok, chatId, telegramId) {
  const achievements = await syncPetAchievements(db, telegramId).catch(() => []);
  if (!achievements.length) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const unlocked = achievements.filter((entry) => entry.unlocked_at);
  const lines = achievements.map((entry) => `${entry.unlocked_at ? '✅' : '▫️'} <b>${escapeHtml(entry.title)}</b> — ${Math.min(Number(entry.progress || 0), Number(entry.target))}/${entry.target}\n<i>${escapeHtml(entry.description)}</i>`);
  const text = `<b>🏅 Moonpet Achievements</b>\n${unlocked.length}/${achievements.length} unlocked\n\n${lines.join('\n')}`;
  const copy = await appendMoonpetReaction(db, telegramId, 'achievement', text, null, { activity_label: 'reviewing achievements' });
  await sendTelegramMessage(tok, chatId, copy, { reply_markup: buildPetProgressMenuReplyMarkup() });
}

async function cmdPetWeeklyBoss(db, tok, chatId, telegramId, action, eventKey = '') {
  const result = await processPetWeeklyBoss(db, telegramId, action, eventKey).catch((error) => ({ accepted: false, reason: error?.message || 'weekly_boss_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('weekly boss', result.reason, result));
    return;
  }
  const progress = result.progress || {};
  const boss = result.boss;
  const hp = Math.max(0, boss.hp - Number(progress.damage || 0));
  const status = progress.defeated_at ? 'DEFEATED' : `${hp}/${boss.hp} HP remaining`;
  const actionLine = result.damage ? `\nYou dealt <b>${result.damage}</b> damage with ${escapeHtml(result.action)}.` : '';
  const duplicateLine = result.duplicate ? '\nToday’s attempt is already spent. Return after the UTC reset.' : '';
  const rewardLine = progress.defeated_at ? `\nWeekly reward: ${Object.entries(boss.reward).map(([key, value]) => `${value} ${key.replaceAll('_', ' ')}`).join(', ')}.` : '';
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'boss', identity || {}, { pet: result.pet, activity_label: `${boss.title} boss fight` }).catch(() => buildMoonpetReaction('boss', identity || {}));
  const bossText = `<b>👑 Weekly Boss: ${escapeHtml(boss.title)}</b>\nWeek ${escapeHtml(result.week_key || getPetWeekKey(new Date()))}\nWeakness: ${escapeHtml(boss.weakness)}\nStatus: <b>${escapeHtml(status)}</b>\nAttempts: ${Number(progress.attempts || 0)}/7${actionLine}${duplicateLine}${rewardLine}\n\n<i>${escapeHtml(reaction)}</i>`;
  const bossMarkup = { inline_keyboard: progress.defeated_at ? [[{ text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' }]] : [
      [{ text: '⚔️ Strike', callback_data: 'pet:boss:strike' }, { text: '🧠 Outsmart', callback_data: 'pet:boss:outsmart' }, { text: '🛡 Endure', callback_data: 'pet:boss:endure' }],
      [{ text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' }],
    ] };
  const guided = await buildPetGuidedReply(db, telegramId, result.pet, bossText, bossMarkup);
  await sendTelegramBuiltPetGuidedReply(tok, chatId, db, telegramId, guided);
}

async function cmdPetSeason(db, tok, chatId, telegramId, tierId = '', eventKey = '') {
  let claim = null;
  if (tierId) claim = await claimPetSeasonReward(db, telegramId, tierId, eventKey).catch((error) => ({ accepted: false, reason: error?.message || 'season_claim_failed' }));
  if (tierId && !claim?.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('season reward', claim?.reason, claim || {}));
    return;
  }
  const state = claim?.state || await getPetSeasonRewardState(db, telegramId);
  const lines = state.tiers.map((tier) => `${tier.claimed_at ? '✅' : tier.unlocked ? '🎁' : '🔒'} <b>${escapeHtml(tier.title)}</b> — ${tier.required_xp} season XP${tier.claimed_at ? ' · claimed' : ''}`);
  const buttons = state.tiers.filter((tier) => tier.unlocked && !tier.claimed_at).map((tier) => [{ text: `Claim ${tier.title}`, callback_data: `pet:season:claim:${tier.tier_id}` }]);
  const text = `${claim ? `<b>🎟 ${escapeHtml(claim.tier.title)} claimed.</b>\n\n` : ''}<b>Season Rewards</b>\n${escapeHtml(state.season.key)} · ${state.season_xp} XP\nEvolution bonus: +${state.evolution_stage} Style per claimed tier\n\n${lines.join('\n')}`;
  const copy = claim ? await appendMoonpetReaction(db, telegramId, 'season', text, null, { activity_label: `claiming ${claim.tier.title}` }) : text;
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const seasonMarkup = { inline_keyboard: [...buttons, [{ text: '⬅️ Progress', callback_data: 'pet:menu:progress' }]] };
  const guided = pet ? await buildPetGuidedReply(db, telegramId, pet, copy, seasonMarkup) : { text: copy, reply_markup: seasonMarkup };
  await sendTelegramBuiltPetGuidedReply(tok, chatId, db, telegramId, guided);
}

async function cmdPetEvolve(db, tok, chatId, telegramId, evolutionIdRaw = '', eventKey = '') {
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  if (!identity) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const next = Object.values(MOONPET_EVOLUTIONS).find((entry) => entry.stage === Number(identity.current_stage?.stage || 0) + 1);
  const requested = String(evolutionIdRaw || next?.evolution_id || '').trim().toLowerCase();
  if (!next) {
    await sendTelegramMessage(tok, chatId, `<b>🧬 Legendary Moon Guardian</b>\nFinal evolution reached.\n${escapeHtml(getPetEvolutionPerk(4).perk)}`, { reply_markup: buildPetProgressMenuReplyMarkup() });
    return;
  }
  if (requested !== next.evolution_id) {
    await sendTelegramMessage(tok, chatId, `Next evolution is <b>${escapeHtml(next.name)}</b>. Evolutions cannot be skipped.`, { reply_markup: buildPetProgressMenuReplyMarkup() });
    return;
  }
  const result = await evolveMoonpet(db, { telegram_id: telegramId, evolution_id: next.evolution_id, event_key: eventKey || `pet:evolve:${telegramId}:${next.evolution_id}` });
  if (!result.accepted) {
    const pet = await getPetProfile(db, telegramId).catch(() => null);
    const progress = await getPetEvolutionGuidance(db, telegramId, pet, identity);
    const missing = progress?.missing?.length
      ? progress.missing.map((entry) => `• ${escapeHtml(entry.label)}: ${entry.current}/${entry.required}\n  <i>${escapeHtml(entry.source)}</i>`).join('\n')
      : '• Requirements changed; open Coach to refresh them.';
    const evolveMarkup = { inline_keyboard: [[{ text: '🏃 Grind Moon Run', callback_data: 'pet:run' }, { text: '🧭 Coach', callback_data: 'pet:coach' }], ...buildPetProgressMenuReplyMarkup().inline_keyboard] };
    await sendTelegramMessage(tok, chatId, `<b>🧬 ${escapeHtml(next.name)} is not ready</b>\n${missing}\n\n${escapeHtml(getPetEvolutionPerk(next.stage).perk)}`, { reply_markup: evolveMarkup });
    return;
  }
  const updated = await getMoonpetIdentitySummary(db, telegramId);
  await syncPetAchievements(db, telegramId).catch(() => []);
  const reaction = await selectMoonpetReaction(db, telegramId, 'evolution', updated, { activity_label: `evolving into ${next.name}` }).catch(() => buildMoonpetReaction('evolution', updated));
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const evolutionText = `<b>🧬 Evolution complete: ${escapeHtml(next.name)}</b>\n${escapeHtml(getPetEvolutionPerk(next.stage).perk)}\n\n<i>${escapeHtml(reaction)}</i>`;
  const guided = pet ? await buildPetGuidedReply(db, telegramId, pet, evolutionText, buildPetProgressMenuReplyMarkup()) : { text: evolutionText, reply_markup: buildPetProgressMenuReplyMarkup() };
  await sendTelegramBuiltPetGuidedReply(tok, chatId, db, telegramId, guided);
}

async function cmdPetStreak(db, tok, chatId, telegramId) {
  const pet = serializePet(await getPetProfile(db, telegramId).catch(() => null));
  const text = pet ? `<b>🔥 Streak</b>\n${pet.streak_days} day(s)` : 'No Crypto Moonboy Pet found. Use /adopt to start.';
  await sendTelegramMessage(tok, chatId, text, { reply_markup: buildPetProgressMenuReplyMarkup() });
}

async function cmdPetTradeMenu(tok, chatId) {
  await sendTelegramMessage(tok, chatId,
    `<b>💱 Trade</b>\nChoose how much Moon Gold to risk.`,
    { reply_markup: { inline_keyboard: [
      [{ text: '10 Gold', callback_data: 'pet:trade:10' }, { text: '25 Gold', callback_data: 'pet:trade:25' }, { text: '50 Gold', callback_data: 'pet:trade:50' }],
      [{ text: '⬅️ Back', callback_data: 'pet:menu:management' }],
    ] } },
  );
}

async function cmdPetProgress(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const state = await getOrCreatePetRuntimeState(db, telegramId, getPetDayKey(new Date())).catch(() => null);
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const identityCopy = identity ? `\n\n${formatMoonpetIdentitySummary(identity)}` : '';
  await sendTelegramMessage(tok, chatId, `${buildPetProgressSummary(state || {})}${identityCopy}`, { reply_markup: buildPetProgressMenuReplyMarkup() });
}

async function cmdPetGear(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const rows = await db.prepare(`SELECT item_key, slot, item_level, item_xp, mastery_xp, mastery_tier FROM telegram_pet_equipment_progression WHERE telegram_id = ? ORDER BY slot, item_level DESC, item_key`).bind(telegramId).all().catch(() => ({ results: [] }));
  await sendTelegramMessage(tok, chatId, buildPetGearSummary(rows.results || []), { reply_markup: buildPetManagementMenuReplyMarkup() });
}

async function applyPetRuntimeCommandAward(db, telegramId, eventKey, action, options = {}) {
  const stableKey = String(eventKey || '').trim();
  if (!stableKey) return null;
  const [equipment, factionRow] = await Promise.all([
    db.prepare(`SELECT item_key, slot, item_level, item_xp, mastery_xp, mastery_tier FROM telegram_pet_equipment_progression WHERE telegram_id = ?`).bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id=?').bind(telegramId).first().catch(() => null),
  ]);
  const factionBonus = action === 'train' || action === 'timed_train'
    ? applyPetFactionBonus({}, factionRow?.faction, 'training').bonus : null;
  return applyPetRuntimeAward(db, telegramId, stableKey, action, {
    day_key: getPetDayKey(new Date()),
    equipment_rows: equipment.results || [],
    track_multiplier: 1 + Number(factionBonus?.effect?.training_xp_pct || 0) / 100,
    ...options,
  }).catch((error) => {
    logApiFailure('runtime_award_failed', { telegramId, action, eventKey: stableKey, message: error?.message || String(error) });
    return null;
  });
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
    { db, telegram_id: telegramId, pet },
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
  const rewardResults = Array.isArray(result?.reward_results) ? result.reward_results : [];
  const rewardLines = rewardResults.length
    ? rewardResults.map((entry) => {
        const award = entry?.result || {};
        const player = `<code>${escapeHtml(entry?.telegram_id || '')}</code>`;
        if (!award.accepted && award.reason === 'insufficient_energy') {
          return `${player}: no Pet XP, Community XP, currency or progression reward — insufficient Energy. Restore Energy and retry this result callback.`;
        }
        if (award.duplicate) return `${player}: rewards already settled; no duplicate reward applied.`;
        if (!award.accepted) return `${player}: reward not settled (${escapeHtml(award.reason || 'unavailable')}).`;
        return `${player}: +${Number(award.pet_xp_awarded || 0)} Pet XP / +${Number(award.xp_awarded || 0)} Community XP (daily caps applied).`;
      })
    : [`Rewards: winner +38 pet XP/+8 Community XP; draw +22/+4; loss +12/+2, all daily capped.`];
  return [
    `🦖 <b>Kaiju Sticker Battle Result</b>`,
    `${escapeHtml(category.name || 'Stat')} (${escapeHtml(category.label || category.key || '?')}) was rolled.`,
    '',
    `P1 <code>${escapeHtml(player1.telegram_id || '')}</code>: ${escapeHtml(player1.card || '')} = ${Number(player1.score || 0)}`,
    `${opponent.telegram_id === 'app' ? 'App' : 'P2'} <code>${escapeHtml(opponent.telegram_id || 'app')}</code>: ${escapeHtml(opponent.card || '')} = ${Number(opponent.score || 0)}`,
    '',
    winnerLine,
    ...rewardLines,
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
    const freshMatch = await getFreshPetKaijuMatch(db, args[0]);
    const match = freshMatch.match;
    if (isPetKaijuExpiredResult(freshMatch)) {
      await sendTelegramMessage(tok, chatId, 'This Kaiju table expired. Tap Kaiju or run /petkaiju to start a fresh battle.');
      return;
    }
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
    const freshMatch = await getFreshPetKaijuMatch(db, args[0]);
    const match = freshMatch.match;
    if (isPetKaijuExpiredResult(freshMatch)) {
      await sendTelegramMessage(tok, chatId, 'This Kaiju table expired. Tap Kaiju or run /petkaiju to start a fresh battle.');
      return;
    }
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
    const freshMatch = await getFreshPetKaijuMatch(db, args[0]);
    const match = freshMatch.match;
    const cardKey = normalizePetKaijuCardKey(args[1]);
    if (isPetKaijuExpiredResult(freshMatch)) {
      await sendTelegramMessage(tok, chatId, 'This Kaiju table expired. Tap Kaiju or run /petkaiju to start a fresh battle.');
      return;
    }
    if (!match || String(match.chat_id) !== String(chatId)) {
      await sendTelegramMessage(tok, chatId, 'That Kaiju battle is gone. Use /petkaiju to start again.');
      return;
    }
    if (match.status === 'completed') {
      const participant = String(match.player1_telegram_id) === String(telegramId) || String(match.player2_telegram_id || '') === String(telegramId);
      if (!participant) {
        await sendTelegramMessage(tok, chatId, 'That Kaiju battle is already complete. Use /petkaiju for a new table.');
        return;
      }
      const recovered = await finishPetKaijuMatch(db, match);
      const copy = await appendMoonpetReaction(db, telegramId, 'kaiju', formatPetKaijuResult(recovered), pet, { activity_label: 'the Kaiju battle result' });
      await sendTelegramPetReply(tok, chatId, copy, { reply_markup: petReplyMarkup() }, 'play');
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
    const copy = await appendMoonpetReaction(db, telegramId, 'kaiju', formatPetKaijuResult(completed), pet, { activity_label: 'the Kaiju battle result' });
    await sendTelegramPetReply(tok, chatId, copy, { reply_markup: petReplyMarkup() }, 'play');
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
  if (code === 'job_locked') return `That job needs level ${extra.required_level || '?'} and evolution stage ${extra.required_evolution_stage || 0}.`;
  if (code === 'event_locked') return `That encounter belongs to a later Moonpet evolution stage.`;
  if (code === 'boss_level_locked') return `Weekly Boss unlocks at Moonpet level ${extra.required_level || 5}.`;
  if (code === 'season_tier_locked') return `That season reward tier is not unlocked yet.`;
  if (code === 'no_season_reward_ready') return `No unclaimed season reward is ready yet.`;
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
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'item', identity || {}, { pet: result.pet, activity_label: `using ${result.item?.title || itemKey || 'an item'}` }).catch(() => buildMoonpetReaction('item', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(
    tok,
    chatId,
    `Item used: <b>${escapeHtml(result.item?.title || itemKey || 'item')}</b>.\n<i>${escapeHtml(reaction)}</i>\n\n${formatPetStatus(result.pet, identity, null, null)}`,
    { reply_markup: buildPetBagReplyMarkup(inventory) },
    'bag',
    { db, telegram_id: telegramId, pet: result.pet },
  );
}

async function cmdPetWork(db, tok, chatId, telegramId, argStr, eventKey = null) {
  const jobKey = normalizePetJobKey(argStr);
  if (!jobKey) {
    const [pet, identity] = await Promise.all([getPetProfile(db, telegramId), getMoonpetIdentitySummary(db, telegramId).catch(() => null)]);
    if (!pet) { await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.'); return; }
    const level = getPetLevel(pet.pet_xp);
    const stage = Math.max(0, Number(identity?.current_stage?.stage) || 0);
    const available = Object.values(PET_JOBS).filter((job) => level >= job.min_level && stage >= job.min_evolution_stage);
    const jobs = Object.values(PET_JOBS).map((job) => `${level >= job.min_level && stage >= job.min_evolution_stage ? '✅' : '🔒'} /petwork ${job.key} — ${job.title} (Lv.${job.min_level}, stage ${job.min_evolution_stage})`).join("\n");
    const rows = [];
    for (let index = 0; index < available.length; index += 2) rows.push(available.slice(index, index + 2).map((job) => ({ text: job.title, callback_data: `pet:work:${job.key}` })));
    await sendTelegramPetReply(tok, chatId, `<b>💼 Pet Jobs</b>\n${jobs}`, {
      reply_markup: {
        inline_keyboard: [
          ...rows,
          [{ text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' }],
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
  await applyPetRuntimeCommandAward(db, telegramId, `runtime:job:${eventKey || jobKey}`, 'job');
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'job', identity || {}, { pet: result.pet, activity_label: result.job?.title || jobKey }).catch(() => buildMoonpetReaction('job', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `Job complete: ${escapeHtml(result.job?.title || jobKey)}.\n<i>${escapeHtml(reaction)}</i>\n\n${formatPetStatus(result.pet, identity, null, null)}`, { reply_markup: petReplyMarkup() }, 'work', { db, telegram_id: telegramId, pet: result.pet });
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
  await applyPetRuntimeCommandAward(db, telegramId, `runtime:daily:${eventKey || dayKey}`, 'daily_chest');
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'daily', identity || {}, { pet: result.pet }).catch(() => buildMoonpetReaction('daily', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `Daily chest opened: +${result.pet_xp_awarded || 0} pet XP.\n<i>${escapeHtml(reaction)}</i>\n\n${formatPetStatus(result.pet, identity, null, null)}`, { reply_markup: petReplyMarkup() }, 'daily', { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetEvent(db, tok, chatId, telegramId, argStr, eventKey = null) {
  const choice = normalizePetRandomEventChoice(argStr);
  if (!choice || (!eventKey && choice !== 'open' && choice !== 'sell' && choice !== 'ignore')) {
    const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
    const encounter = selectPetRandomEncounter(identity);
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
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'event', identity || {}, { pet: result.pet, activity_label: result.encounter?.title || 'this encounter' }).catch(() => buildMoonpetReaction('event', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `${summary}\n<i>${escapeHtml(reaction)}</i>

${formatPetStatus(result.pet, identity, null, null)}`, { reply_markup: petReplyMarkup() }, "event", { db, telegram_id: telegramId, pet: result.pet });
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
  if (action !== 'adopt') {
    await applyPetRuntimeCommandAward(db, telegramId, `runtime:care:${stableEventKey || action}`, action);
  }
  const prefix = action === 'adopt'
    ? 'Crypto Moonboy Pet adopted.'
    : `Action accepted: /${escapeHtml(action)} (+${result.pet_xp_awarded || 0} pet XP, +${result.xp_awarded || 0} Community XP).`;
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, action, identity || {}, { pet: result.pet }).catch(() => buildMoonpetReaction(action, identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `${prefix}\n\n${formatPetStatus(result.pet, identity, null, reaction)}`, { reply_markup: petReplyMarkup() }, action === 'adopt' ? 'level_up' : action, { db, telegram_id: telegramId, pet: result.pet });
}


async function cmdPetActivity(db, tok, chatId, telegramId) {
  const session = await getActivePetActivitySession(db, telegramId);
  if (!session) {
    await sendTelegramMessage(tok, chatId, '<b>Timed Pet Activities</b>\nStart one: /petstart sleep, /petstart train, /petstart work, or /petstart explore.', { reply_markup: { inline_keyboard: [[{ text: 'Sleep', callback_data: 'pet:start:sleep' }, { text: 'Train', callback_data: 'pet:start:train' }], [{ text: 'Work', callback_data: 'pet:start:work' }, { text: 'Explore', callback_data: 'pet:start:explore' }], [{ text: '⬅️ Back', callback_data: 'pet:back' }]] } });
    return;
  }
  await sendTelegramMessage(tok, chatId, `Moonpet is ${escapeHtml(session.activity_type)}: ${formatPetActivityLine(session)}.`, { reply_markup: { inline_keyboard: [[{ text: 'Claim', callback_data: 'pet:claim' }, { text: 'Cancel', callback_data: 'pet:cancel' }], [{ text: '⬅️ Back', callback_data: 'pet:back' }]] } });
}
async function cmdPetStart(db, tok, chatId, telegramId, argStr) {
  const result = await startPetActivitySession(db, telegramId, argStr, { source: 'telegram_command' }).catch((error) => ({ accepted: false, reason: error?.message || 'activity_start_failed' }));
  if (!result.accepted) { await sendTelegramMessage(tok, chatId, result.reason === 'already_busy' ? `Already busy: ${formatPetActivityLine(result.session)}.` : formatPetBlockedCopy('activity', result.reason, result)); return; }
  const [identity, pet] = await Promise.all([getMoonpetIdentitySummary(db, telegramId).catch(() => null), getPetProfile(db, telegramId).catch(() => null)]);
  const reaction = await selectMoonpetReaction(db, telegramId, 'activity_start', identity || {}, { pet, activity_label: result.session.activity_type }).catch(() => buildMoonpetReaction('activity_start', identity || {}, { pet }));
  await sendTelegramMessage(tok, chatId, `Started ${escapeHtml(result.session.activity_type)}. Tiny rewards unlock after 5m; rewards scale until the cap.\n\n<i>${escapeHtml(reaction)}</i>`, { reply_markup: { inline_keyboard: [[{ text: 'Claim', callback_data: 'pet:claim' }, { text: 'Cancel', callback_data: 'pet:cancel' }], [{ text: '⬅️ Back', callback_data: 'pet:back' }]] } });
}
async function cmdPetClaim(db, tok, chatId, telegramId) {
  const result = await claimPetActivitySession(db, telegramId, { source: 'telegram_command' }).catch((error) => ({ accepted: false, reason: error?.message || 'activity_claim_failed' }));
  if (!result.accepted) { await sendTelegramMessage(tok, chatId, result.reason === 'activity_too_short' ? `Claim ready in ${formatPetDuration(result.retry_after_seconds)}.` : formatPetBlockedCopy('activity claim', result.reason, result)); return; }
  const runtimeAction = result.session.activity_type === 'train' ? 'timed_train' : result.session.activity_type === 'work' ? 'timed_work' : result.session.activity_type;
  await applyPetRuntimeCommandAward(db, telegramId, `runtime:activity:${result.session.id}`, runtimeAction);
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'activity_claim', identity || {}, { pet: result.pet, activity_label: result.session.activity_type }).catch(() => buildMoonpetReaction('activity_claim', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `Claimed ${escapeHtml(result.session.activity_type)} rewards: +${result.pet_xp_awarded} pet XP, +${result.xp_awarded} Community XP, +${result.computed?.rewards?.moon_gold || 0} gold, +${result.computed?.rewards?.moon_crystals || 0} crystals.\n<i>${escapeHtml(reaction)}</i>\n\n${formatPetStatus(result.pet, identity, null, null)}`, { reply_markup: petReplyMarkup() }, result.session.activity_type, { db, telegram_id: telegramId, pet: result.pet });
}
async function cmdPetCancel(db, tok, chatId, telegramId) {
  const result = await cancelPetActivitySession(db, telegramId).catch((error) => ({ accepted: false, reason: error?.message || 'activity_cancel_failed' }));
  let copy = formatPetBlockedCopy('activity cancel', result.reason, result);
  if (result.accepted) {
    const [identity, pet] = await Promise.all([getMoonpetIdentitySummary(db, telegramId).catch(() => null), getPetProfile(db, telegramId).catch(() => null)]);
    const reaction = await selectMoonpetReaction(db, telegramId, 'activity_cancel', identity || {}, { pet, activity_label: result.session.activity_type }).catch(() => buildMoonpetReaction('activity_cancel', identity || {}, { pet }));
    copy = `Cancelled ${escapeHtml(result.session.activity_type)}. No rewards awarded.\n\n<i>${escapeHtml(reaction)}</i>`;
  }
  await sendTelegramMessage(tok, chatId, copy, { reply_markup: petReplyMarkup() });
}

async function cmdPetTrade(db, tok, chatId, telegramId, argStr, eventKey = null) {
  const result = await processPetGoldTrade(db, telegramId, argStr, {
    event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'trade', argStr || 'msg']),
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_trade_failed' }));
  if (result.duplicate) {
    await sendTelegramMessage(tok, chatId, 'That trade button was already handled. No additional gold or rewards were applied.');
    return;
  }
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('trade', result.reason, result));
    return;
  }
  const outcome = result.won
    ? `🎰 Trade won: +${result.gold_delta} gold, +${result.crystal_delta} crystals, +${result.pet_xp_awarded || 0} pet XP.`
    : `🎰 Trade lost: ${result.gold_delta} gold, +${result.pet_xp_awarded || 0} pet XP.`;
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reactionContext = result.won ? 'trade_win' : 'trade_loss';
  const reaction = await selectMoonpetReaction(db, telegramId, reactionContext, identity || {}, { pet: result.pet }).catch(() => buildMoonpetReaction(reactionContext, identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `${escapeHtml(outcome)}\n\n${formatPetStatus(result.pet, identity, null, reaction)}`, { reply_markup: petReplyMarkup() }, reactionContext, { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetRename(db, tok, chatId, telegramId, argStr) {
  const petName = normalizePetName(argStr);
  if (!petName) {
    await sendTelegramMessage(tok, chatId, 'Use it like this: /petname Moon Runner');
    return;
  }
  const result = await processPetAction(db, telegramId, 'rename', { pet_name: petName, source: 'telegram_command' });
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'rename', identity || {}, { pet: result.pet }).catch(() => buildMoonpetReaction('rename', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `🌕 Pet renamed.\n\n${formatPetStatus(result.pet, identity, null, reaction)}`, { reply_markup: petReplyMarkup() }, 'level_up', { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetMissions(db, tok, chatId, telegramId) {
  const missions = await buildPetMissions(db, telegramId);
  const daily = missions.daily.map((m) => `${m.completed ? '✅' : '⬜'} ${escapeHtml(m.title)}`).join('\n');
  await sendTelegramPetReply(tok, chatId,
    `<b>🎯 Crypto Moonboy Pets Missions</b>\n` +
    `Day: ${escapeHtml(missions.day_key)}\n` +
    `Week: ${escapeHtml(missions.week_key)}\n` +
    `Season: ${escapeHtml(missions.season.key)}\n\n${daily}`,
    { reply_markup: buildPetProgressMenuReplyMarkup() },
    'daily',
  );
}

function buildPetEconomyMenuReplyMarkup() {
  return { inline_keyboard: [
    [{ text: '📜 Daily Bounties', callback_data: 'pet:bounties' }],
    [{ text: '⛏️ Crystal Expedition', callback_data: 'pet:expedition' }],
    [{ text: '🌙 Moon Market', callback_data: 'pet:market' }],
    [{ text: '🛒 Equipment Shop', callback_data: 'pet:shop' }],
    [{ text: '💼 Jobs', callback_data: 'pet:work' }, { text: '⏱ Activities', callback_data: 'pet:activity' }],
    [{ text: '⬅️ Management', callback_data: 'pet:menu:management' }],
  ] };
}

function buildPetBountyReplyMarkup(state) {
  const rows = (state?.bounties || []).filter((entry) => entry.complete && !entry.claimed)
    .map((entry) => [{ text: `🎁 Claim ${entry.title}`.slice(0, 40), callback_data: `pet:bounty:${entry.key}` }]);
  return { inline_keyboard: [...rows, [{ text: '💰 Economy', callback_data: 'pet:economy' }, { text: '⬅️ Back', callback_data: 'pet:menu:management' }]] };
}

function buildPetMarketReplyMarkup(state) {
  const rows = (state?.market_offers || []).filter((offer) => !offer.purchased && offer.unlocked)
    .map((offer) => [{ text: `${offer.affordable ? '🛍️' : '🔒'} ${offer.title}`.slice(0, 40), callback_data: `pet:market:${offer.key}` }]);
  return { inline_keyboard: [...rows, [{ text: '💰 Economy', callback_data: 'pet:economy' }, { text: '⬅️ Back', callback_data: 'pet:menu:management' }]] };
}

async function cmdPetEconomy(db, tok, chatId, telegramId) {
  const state = await getPetEconomyState(db, telegramId).catch(() => null);
  if (!state) { await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.'); return; }
  const complete = state.bounties.filter((entry) => entry.complete && !entry.claimed).length;
  const p = state.pet;
  await sendTelegramPetReply(tok, chatId,
    `<b>💰 Moonpet Economy</b>\n` +
    `<i>Earn → spend → upgrade → unlock. Rewards are server-verified and daily routes are capped.</i>\n\n` +
    `<b>Wallet</b>\n🪙 ${formatPetDisplayNumber(p.moon_gold)} gold · 💎 ${formatPetDisplayNumber(p.moon_crystals)} crystals · 🎨 ${formatPetDisplayNumber(p.style_tokens)} style\n\n` +
    `<b>Earn now</b>\n📜 ${complete} bounties ready to claim\n⛏️ ${state.expedition_attempts_left}/3 expedition attempts left\n💼 Jobs, Activities, Moon Runs, events, Arena and bosses remain active\n\n` +
    `<b>Spend and upgrade</b>\n🌙 ${state.market_offers.filter((offer) => !offer.purchased).length} rotating offers in stock\n🛒 Permanent equipment unlocks in Shop\n🧬 Materials, gear and XP feed evolution requirements\n\n` +
    `<b>Safeguards</b>\nBounties can only claim recorded actions. Expedition attempts and market stock reset at 00:00 UTC. Repeated buttons cannot pay twice.`,
    { reply_markup: buildPetEconomyMenuReplyMarkup() }, 'economy', { db, telegram_id: telegramId, pet: p });
}

async function cmdPetBounties(db, tok, chatId, telegramId) {
  const state = await getPetEconomyState(db, telegramId).catch(() => null);
  if (!state) { await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.'); return; }
  const lines = state.bounties.map((bounty) => {
    const marker = bounty.claimed ? '✅' : bounty.complete ? '🎁' : '⬜️';
    return `${marker} <b>${escapeHtml(bounty.title)}</b> — ${bounty.progress}/${bounty.required}\n${escapeHtml(bounty.detail)}\nReward: ${escapeHtml(formatPetEconomyValue(bounty.reward))}`;
  }).join('\n\n');
  await sendTelegramPetReply(tok, chatId,
    `<b>📜 Daily Bounty Board</b>\nResets 00:00 UTC · claims use recorded game actions\n\n${lines}`,
    { reply_markup: buildPetBountyReplyMarkup(state) }, 'economy', { db, telegram_id: telegramId, pet: state.pet });
}

async function cmdPetBountyClaim(db, tok, chatId, telegramId, bountyKey) {
  const result = await claimPetEconomyBounty(db, telegramId, bountyKey).catch((error) => ({ accepted: false, reason: error?.message || 'bounty_failed' }));
  if (!result.accepted) {
    const copy = result.reason === 'bounty_incomplete' ? `Bounty not complete: ${result.bounty.progress}/${result.bounty.required}. ${result.bounty.detail}` : 'That bounty is not available today.';
    await sendTelegramMessage(tok, chatId, copy, { reply_markup: buildPetEconomyMenuReplyMarkup() }); return;
  }
  if (result.duplicate) { await sendTelegramMessage(tok, chatId, 'That bounty was already claimed. No duplicate reward was applied.', { reply_markup: buildPetEconomyMenuReplyMarkup() }); return; }
  await sendTelegramPetReply(tok, chatId,
    `🎁 <b>${escapeHtml(result.bounty.title)} claimed</b>\nReceived ${escapeHtml(formatPetEconomyValue(result.rewards))}.`,
    { reply_markup: buildPetEconomyMenuReplyMarkup() }, 'economy', { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetExpedition(db, tok, chatId, telegramId, start = false, eventKey = '') {
  if (start) {
    const result = await runPetCrystalExpedition(db, telegramId, new Date(), eventKey).catch((error) => ({ accepted: false, reason: error?.message || 'expedition_failed' }));
    if (!result.accepted) {
      const copy = result.reason === 'expedition_daily_limit' ? 'All 3 Crystal Expedition attempts are used. Return after 00:00 UTC.'
        : result.reason === 'pet_tired' ? `Not enough Energy. This expedition costs ${result.state?.expedition?.energy || 12} Energy; sleep first.`
          : 'The expedition could not start. Open Economy to check its requirements.';
      await sendTelegramMessage(tok, chatId, copy, { reply_markup: buildPetEconomyMenuReplyMarkup() }); return;
    }
    if (result.duplicate) { await sendTelegramMessage(tok, chatId, 'That expedition button was already settled. No duplicate reward or Energy cost was applied.'); return; }
    await sendTelegramPetReply(tok, chatId,
      `⛏️ <b>${escapeHtml(result.expedition.title)} complete</b>\nAttempt ${result.attempt}/3 · Cost ${result.expedition.energy} Energy\nFound ${escapeHtml(formatPetEconomyValue(result.rewards))}.`,
      { reply_markup: buildPetEconomyMenuReplyMarkup() }, 'adventure_win', { db, telegram_id: telegramId, pet: result.pet });
    return;
  }
  const state = await getPetEconomyState(db, telegramId).catch(() => null);
  if (!state) { await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.'); return; }
  await sendTelegramPetReply(tok, chatId,
    `<b>⛏️ ${escapeHtml(state.expedition.title)}</b>\n` +
    `${state.expedition_attempts_left}/3 attempts remain today · Cost ${state.expedition.energy} Energy each\n\n` +
    `Possible finds include Moon Gold, Moon Crystals, Style and upgrade materials. Higher levels open richer expedition zones.\n` +
    `Current Energy: ${formatPetDisplayNumber(state.pet.energy)}.`,
    { reply_markup: { inline_keyboard: [[{ text: '⛏️ Start Expedition', callback_data: 'pet:expedition:go' }], [{ text: '💰 Economy', callback_data: 'pet:economy' }, { text: '⬅️ Back', callback_data: 'pet:menu:management' }]] } },
    'economy', { db, telegram_id: telegramId, pet: state.pet });
}

async function cmdPetMarket(db, tok, chatId, telegramId) {
  const state = await getPetEconomyState(db, telegramId).catch(() => null);
  if (!state) { await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.'); return; }
  const lines = state.market_offers.map((offer) =>
    `${offer.purchased ? '✅ SOLD' : !offer.unlocked ? `🔒 LEVEL ${offer.min_level}` : offer.affordable ? '🛍️ READY' : '🔒 SAVE'} <b>${escapeHtml(offer.title)}</b>\n` +
    `${escapeHtml(offer.detail)}\nCost: ${escapeHtml(formatPetEconomyValue(offer.cost))}\nGives: ${escapeHtml(formatPetEconomyValue(offer.reward))}`).join('\n\n');
  await sendTelegramPetReply(tok, chatId,
    `<b>🌙 Moon Market</b>\nFour offers rotate at 00:00 UTC · one purchase per offer\n\n${lines}`,
    { reply_markup: buildPetMarketReplyMarkup(state) }, 'shop', { db, telegram_id: telegramId, pet: state.pet });
}

async function cmdPetMarketBuy(db, tok, chatId, telegramId, offerKey) {
  const result = await buyPetMarketOffer(db, telegramId, offerKey).catch((error) => ({ accepted: false, reason: error?.message || 'market_failed' }));
  if (!result.accepted) {
    const copy = result.reason === 'market_offer_locked' && result.offer
      ? `${result.offer.title} unlocks at Level ${result.offer.min_level}. The offer remains in today’s fixed stock if you level up before 00:00 UTC.`
      : result.reason === 'not_enough_pet_currency' && result.offer
      ? `You need ${formatPetEconomyValue(result.offer.cost)} for ${result.offer.title}. Open Coach for the best earning route.`
      : 'That Moon Market offer is not available now.';
    await sendTelegramMessage(tok, chatId, copy, { reply_markup: buildPetEconomyMenuReplyMarkup() }); return;
  }
  if (result.duplicate) { await sendTelegramMessage(tok, chatId, 'That daily offer is already sold. No duplicate currency was charged.'); return; }
  await sendTelegramPetReply(tok, chatId,
    `🛍️ <b>${escapeHtml(result.offer.title)} purchased</b>\nSpent ${escapeHtml(formatPetEconomyValue(result.offer.cost))}.\nReceived ${escapeHtml(formatPetEconomyValue(result.rewards))}.`,
    { reply_markup: buildPetEconomyMenuReplyMarkup() }, 'purchase_complete', { db, telegram_id: telegramId, pet: result.pet });
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
    { db, telegram_id: telegramId, pet },
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
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'purchase', identity || {}, { pet: result.pet, activity_label: `equipping ${result.item.title}` }).catch(() => buildMoonpetReaction('purchase', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(
    tok,
    chatId,
    `🛒 Upgrade equipped: <b>${escapeHtml(result.item.title)}</b>.\n\n` +
      `<b>Next upgrade run</b>\n` +
      `Buy another upgrade, spend resources deeper, or grind more gold/crystals/style before the next tier.\n\n` +
      `${formatPetStatus(result.pet, identity, null, reaction)}`,
    { reply_markup: buildPetPurchaseNextReplyMarkup(result.pet) },
    'purchase_complete',
    { db, telegram_id: telegramId, pet: result.pet },
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
    const copy = await appendMoonpetReaction(db, telegramId, 'adventure', formatPetRunPrompt(result.run, result.pet), result.pet, { activity_label: 'starting the Moon Run' });
    await sendTelegramPetReply(
      tok,
      chatId,
      copy,
      { reply_markup: buildPetRunChoiceReplyMarkup(result.run) },
      'petrun',
      { db, telegram_id: telegramId, pet: result.pet },
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
  await applyPetRuntimeCommandAward(db, telegramId, `runtime:run-step:${eventKey || `${result.run?.run_id || 'run'}:${result.run?.depth || stepIndex}`}`, 'run_step');
  const summary = result.reason === 'run_completed' ? formatPetRunStepSummary(result) : formatPetRunStepSummary(result);
  const markup = result.reason === 'run_step_complete'
    ? buildPetRunAfterStepReplyMarkup(result.run)
    : petReplyMarkup();
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'run', identity || {}, { pet: result.pet, activity_label: result.reason === 'run_failed' ? 'the failed Moon Run' : 'the Moon Run' }).catch(() => buildMoonpetReaction('run', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `${summary}\n\n${formatPetStatus(result.pet, identity, null, reaction)}`, { reply_markup: markup }, result.reason === 'run_failed' ? 'adventure_fail' : 'adventure_win', { db, telegram_id: telegramId, pet: result.pet });
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
  await applyPetRuntimeCommandAward(db, telegramId, `runtime:run-extract:${eventKey || result.run?.run_id || argStr || 'active'}`, 'run_extract');
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const reaction = await selectMoonpetReaction(db, telegramId, 'extract', identity || {}, { pet: result.pet }).catch(() => buildMoonpetReaction('extract', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(
    tok,
    chatId,
    `${formatPetRunBankSummary(result)}\n\n${formatPetStatus(result.pet, identity, null, reaction)}`,
    { reply_markup: petReplyMarkup() },
    'adventure_win',
    { db, telegram_id: telegramId, pet: result.pet },
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
    await sendTelegramMessage(tok, chatId, `Pet needs, mission and progression alerts are ${pref.enabled ? 'enabled' : 'disabled'}. Use /petnotify on or /petnotify off.`);
    return;
  }
  if (setting === 'on' || setting === 'enable') {
    await setPetNotificationPreference(db, telegramId, true);
    await sendTelegramMessage(tok, chatId, 'Pet needs, mission and progression alerts enabled. You will be told about new unlocks and claimable rewards. Use /petnotify off to stop them.');
    return;
  }
  if (setting === 'off' || setting === 'disable') {
    await setPetNotificationPreference(db, telegramId, false);
    await sendTelegramMessage(tok, chatId, 'Pet needs alerts disabled.');
    return;
  }
  await sendTelegramMessage(tok, chatId, 'Use /petnotify on, /petnotify off, or /petnotify status.');
}

async function cmdPetLeaderboard(db, tok, chatId, replyMarkup = null) {
  const season = getPetSeasonInfo(new Date());
  const rows = await db.prepare(`
    SELECT s.telegram_id, s.season_xp, p.pet_name, COALESCE((SELECT pe.evolution_id FROM telegram_pet_evolutions pe WHERE pe.telegram_id=s.telegram_id ORDER BY pe.stage DESC LIMIT 1), 'moon_egg') AS stage, p.level,
           u.username, u.first_name, u.last_name
    FROM telegram_pet_season_state s
    LEFT JOIN telegram_pet_profiles p ON p.telegram_id = s.telegram_id
    LEFT JOIN telegram_users u ON u.telegram_id = s.telegram_id
    WHERE s.season_key = ?
    ORDER BY s.season_xp DESC
    LIMIT 10
  `).bind(season.key).all().catch(() => ({ results: [] }));
  if (!rows.results?.length) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pets leaderboard entries yet. Use /adopt to start.', replyMarkup ? { reply_markup: replyMarkup } : {});
    return;
  }
  const lines = rows.results.map((row, index) => (
    `${index + 1}. ${escapeHtml(displayNameFromRow(row))} — ${escapeHtml(row.pet_name || 'Moonpet')} (${escapeHtml(row.stage || 'egg')}) ${row.season_xp || 0} pet XP`
  ));
  await sendTelegramPetReply(tok, chatId, `<b>Crypto Moonboy Pets Leaderboard</b>\n${escapeHtml(season.key)}\n\n${lines.join('\n')}`, replyMarkup ? { reply_markup: replyMarkup } : {}, 'leaderboard');
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

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
  PET_DAILY_CHALLENGES, recordDailyCareChallenge, syncDailyMoonRun,
} from './pets/daily-moon-run.js';
import {
  PET_WEEKLY_JOURNEY_OBJECTIVES, finalizeWeeklyJourneyCrest, recordWeeklyJourneyObjectiveEvidence,
} from './pets/weekly-journey.js';
import {
  MOONPET_EVOLUTIONS, MOONPET_PERSONALITY_TRAITS, evolveMoonpet, formatMoonpetIdentitySummary,
  evaluateMoonpetEvolutionRequirements, getMoonpetIdentityAnalytics, getMoonpetIdentitySummary, recordMoonpetBehaviour, recordMoonpetBiggestReward, recordMoonpetMemory,
  validateMoonpetEvolutionContent,
} from './pets/moonpet-identity.js';
import {
  MOONPET_SPECIES, createMoonEggLifecycle, ensureMoonpetLifecycle, getExistingMoonpetLifecycle, getMoonpetLifecycle, hatchMoonpet, incubateMoonEgg, morphMoonpetRare,
  syncMoonpetLifecycleStage,
} from './pets/species-lifecycle.js';
import {
  PET_ROGUELITE_BOSSES, PET_ROGUELITE_ENEMIES, PET_ROGUELITE_REGIONS, PET_ROGUELITE_RELICS, PET_ROGUELITE_ROOMS, PET_RUN_MODIFIERS,
  advancePetRun, awardPetReward as awardLegacyPetReward, buildPetProfileDeltas, choosePetRunModifier, completePetRun, createPetRunRoom,
  extractPetRogueliteRun, failPetRun, finishPetRogueliteRun, generatePetRunRoom, persistPetRunRoomOutcome,
  resolvePetRunRoom, rewardPetRogueliteBoss, rewardPetRunRoom, startPetRogueliteRun,
  validatePetRelicContent, validatePetRogueliteContent, validatePetRunModifier,
} from './pets/roguelite-foundation.js';
import { reconcileLegacyPetInventory } from './pets/inventory-cutover.js';
import { awardPetGrowthMark, awardPetWeeklyCrest, evaluatePetSeasonCompletion, getPetSeasonWeek, reconcileEvolutionGrowthMarks } from './pets/season-completion.js';
import { getMoonpetSeasonInfo } from './pets/season-authority.js';
import { listSanctuaryPets, listSanctuaryPetsPrivate, PET_RECOVERABLE_ACTIVITY_PREDICATE, reconcileCompletedPetsToSanctuary } from './pets/sanctuary.js';
import {
  PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY,
  PET_INSTANCE_AUTHORITY_VERSION,
  accountWalletRecoveryResolvedSql,
  ensurePetAccountWalletReadyForMutation,
  reconcilePetInstanceWalletToProfile,
} from './pets/wallet-reconciliation.js';
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
import { PET_CRAFTING_MATERIALS, getActivePetSetBonuses } from './pets/economy-phase-3.js';
import { PET_ELITE_JOBS, canStartPetEliteJob } from './pets/content-phase-4.js';
import { PET_JOB_LORE, buildPetRegionDirectory } from './pets/game-content.js';
import {
  applyPetFactionBonus, buildPetLiveSystemsState, processPetCosmeticUnlock, processPetCraftRecipe, processPetDistrictMission,
  processPetEquipmentUpgrade, processPetEventChain, processPetPrestige, processPetSeasonalBoss,
} from './pets/live-systems.js';
import { issuePetMiniAppChallenge, verifyPetMiniAppChallenge, verifyTelegramMiniAppInitData } from './pets/mini-app-auth.js';
import { resolvePetCallbackRoute } from './pets/mini-app-routing.js';
import { CANONICAL_FACTION_KEYS, FACTION_UNALIGNED, normalizeFaction, getFactionXpMultiplier } from './shared/faction-canon.js';
import { buildWtfIso, getWtfDailySchedule, getWtfEventStatus } from './shared/daily-wtf-schedule.js';

async function reconcileSanctuaryBestEffort(db, telegramId, context = 'terminal_settlement', options = {}) {
  try {
    return await reconcileCompletedPetsToSanctuary(db, telegramId, options);
  } catch (error) {
    logApiFailure('pet_sanctuary_reconciliation_failed', {
      telegramId: String(telegramId), context, message: error?.message || String(error),
    });
    return [];
  }
}
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
const PET_MINI_APP_ARENA_LOBBY = 'mini:arena:global';
const PET_MINI_APP_KAIJU_LOBBY = 'mini:kaiju:global';
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
  const parsed = parseSqliteTs(dateStr);
  if (parsed == null) return '';
  const diffMs  = Math.max(0, Date.now() - parsed);
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
  const raw = String(value).trim();
  const text = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
  const ts = Date.parse(text);
  return Number.isFinite(ts) ? ts : null;
}

function normalizeServerTimestamp(value, fallback = new Date()) {
  const parsed = value instanceof Date ? value.getTime() : parseSqliteTs(value);
  const fallbackParsed = fallback instanceof Date ? fallback.getTime() : parseSqliteTs(fallback);
  return new Date(parsed ?? fallbackParsed ?? Date.now()).toISOString();
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

async function creditArcadeXpWallet(db, telegramId, amount) {
  const credit = Math.max(0, Math.floor(Number(amount) || 0));
  if (!credit) return;
  await db.prepare(`INSERT INTO arcade_xp_wallets
    (telegram_id, arcade_xp_earned, arcade_xp_spendable, arcade_xp_spent, updated_at)
    VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      arcade_xp_earned=arcade_xp_wallets.arcade_xp_earned+excluded.arcade_xp_earned,
      arcade_xp_spendable=arcade_xp_wallets.arcade_xp_spendable+excluded.arcade_xp_spendable,
      updated_at=CURRENT_TIMESTAMP`).bind(telegramId, credit, credit).run();
}

async function reconcileArcadeXpWalletFromEvents(db, telegramId) {
  const totals = await db.prepare(`
    SELECT COALESCE(SUM(xp_awarded), 0) AS earned_from_events
    FROM arcade_progression_events
    WHERE telegram_id = ? AND status = 'accepted'
  `).bind(telegramId).first().catch(() => null);
  const earnedFromEvents = Math.max(0, Math.floor(Number(totals?.earned_from_events) || 0));
  if (!earnedFromEvents) return 0;
  const wallet = await db.prepare(`
    SELECT arcade_xp_earned FROM arcade_xp_wallets WHERE telegram_id = ? LIMIT 1
  `).bind(telegramId).first().catch(() => null);
  const walletEarned = Math.max(0, Math.floor(Number(wallet?.arcade_xp_earned) || 0));
  const recoverableCredit = earnedFromEvents - walletEarned;
  if (recoverableCredit <= 0) return 0;
  await creditArcadeXpWallet(db, telegramId, recoverableCredit);
  return recoverableCredit;
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

const PET_RUN_MAX_DEPTH = 100;
const PET_RUN_ELITE_INTERVAL = 5;
const PET_RUN_BOSS_INTERVAL = 10;
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
  hidden_route: Object.freeze({
    key: 'hidden_route', label: 'Hidden Route', type: 'sneak',
    copy: 'Your Moonpet reads the alley signs and opens a rare shortcut.',
    risk_copy: 'The hidden route folds into a trap. The expedition takes a heavy setback.',
    base_risk: 0.31,
    rewards: Object.freeze({ pet_xp: [20, 38], moon_gold: [30, 68], moon_crystals: [0, 2], style_tokens: [1, 3] }),
    costs: Object.freeze({ energy: [10, 18], hunger: [4, 9] }),
  }),
  elite: Object.freeze({
    key: 'elite', label: 'Elite Scrap', type: 'fight',
    copy: 'Your Moonpet drops the elite crew and claims the checkpoint.',
    risk_copy: 'The elite crew wins the exchange. The expedition ends with a scar and a lesson.',
    base_risk: 0.36,
    rewards: Object.freeze({ pet_xp: [30, 58], moon_gold: [48, 96], moon_crystals: [1, 3], style_tokens: [2, 5] }),
    costs: Object.freeze({ energy: [14, 24], hunger: [7, 13], cleanliness: [3, 8] }),
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

function serializePetKaijuCardPreview(card, categoryKey = '') {
  const category = PET_KAIJU_CATEGORIES.find((entry) => entry.key === categoryKey) || null;
  const strongest = PET_KAIJU_CATEGORIES
    .map((entry) => ({ key: entry.key, label: entry.label, value: Number(card?.stats?.[entry.key] || 0) }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, 2);
  return {
    ...card,
    active_stat: category?.label || null,
    active_value: category ? Number(card?.stats?.[category.key] || 0) : null,
    strongest,
  };
}

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
  return getMoonpetSeasonInfo(now);
}

function calculatePetHealth(pet) {
  const hungerScore = 100 - Number(pet.hunger || 0);
  return clampPetStat((hungerScore + Number(pet.happiness || 0) + Number(pet.cleanliness || 0) + Number(pet.energy || 0)) / 4);
}

function applyPetDecay(pet, now = new Date()) {
  const last = parseSqliteTs(pet.last_decay_at || pet.updated_at || pet.created_at) ?? now.getTime();
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

function stablePetRunIndex(run, step, modulo) {
  const source = String(run?.seed || run?.run_id || 'moon-run') + ':' + String(step);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return modulo > 0 ? (hash >>> 0) % modulo : 0;
}
function getPetEndlessRoomDefinition(run) {
  const rooms = Object.values(PET_ROGUELITE_ROOMS || {});
  if (!rooms.length) return null;
  const depth = Math.max(0, Math.floor(Number(run?.depth || run?.current_room || 0)));
  const nextRoom = depth + 1;
  const wantedType = nextRoom % PET_RUN_BOSS_INTERVAL === 0
    ? 'boss'
    : nextRoom % PET_RUN_ELITE_INTERVAL === 0
      ? 'elite'
      : 'street';
  let pool = wantedType === 'boss'
    ? rooms.filter((room) => room.room_type === 'boss')
    : wantedType === 'elite'
      ? rooms.filter((room) => room.room_type === 'elite')
      : rooms.filter((room) => !['boss', 'elite'].includes(room.room_type));
  if (!pool.length) pool = rooms;
  return pool[stablePetRunIndex(run, nextRoom, pool.length)] || pool[0];
}

function serializePetRunRoom(run, room, opponentIdOverride = null) {
  if (!room) return null;
  const opponentId = opponentIdOverride || room.boss_id
    || (room.enemy_pool || [])[stablePetRunIndex(run, Number(run?.depth || 0) + 41, (room.enemy_pool || []).length)];
  const bossOpponent = Boolean(room.boss_id || PET_ROGUELITE_BOSSES[opponentId]);
  const opponentDefinition = bossOpponent ? PET_ROGUELITE_BOSSES[opponentId] : PET_ROGUELITE_ENEMIES[opponentId];
  return {
    key: room.room_id || room.key,
    title: room.title || room.name,
    room_type: room.room_type,
    description: String(room.description || ''),
    objective: String(room.objective || ''),
    threat: Math.max(1, Math.min(5, Number(room.threat || opponentDefinition?.difficulty || 1))),
    opponent: opponentDefinition ? {
      id: opponentId,
      name: opponentDefinition.name,
      role: opponentDefinition.role || (bossOpponent ? 'boss' : 'enemy'),
      difficulty: Math.max(1, Number(opponentDefinition.difficulty || 1)),
      intro: String(opponentDefinition.intro || ''),
    } : null,
  };
}

function serializePetRun(run) {
  if (!run) return null;
  const depth = Math.max(0, Math.floor(Number(run.depth ?? run.current_room ?? 0)));
  const roomDefinition = getPetEndlessRoomDefinition({ ...run, depth });
  return {
    id: run.id || null, pet_id: String(run.pet_id || '').trim() || null, telegram_id: String(run.telegram_id || ''), run_id: String(run.run_id || ''),
    season_key: String(run.season_key || ''), status: String(run.status || 'active'), region: String(run.region || 'moon_alley'),
    difficulty: Math.max(1, Math.floor(Number(run.difficulty || 1)), Math.floor(depth / PET_RUN_BOSS_INTERVAL) + 1),
    seed: run.seed == null ? null : Number(run.seed), depth, current_room: depth,
    max_depth: Math.max(PET_RUN_MAX_DEPTH, Math.floor(Number(run.max_depth || run.max_room || 0))),
    max_room: Math.max(PET_RUN_MAX_DEPTH, Math.floor(Number(run.max_room || run.max_depth || 0))),
    score: Math.max(0, Math.floor(Number(run.score || 0))), rooms_completed: Math.max(depth, Math.floor(Number(run.rooms_completed || 0))),
    risk_level: Math.max(1, Math.floor(Number(run.risk_level || 1))),
    room: serializePetRunRoom({ ...run, depth }, roomDefinition),
    checkpoint: (depth + 1) % PET_RUN_BOSS_INTERVAL === 0 ? 'boss' : (depth + 1) % PET_RUN_ELITE_INTERVAL === 0 ? 'elite' : 'street',
    next_checkpoint: PET_RUN_ELITE_INTERVAL - (depth % PET_RUN_ELITE_INTERVAL),
    unbanked_pet_xp: clampPetCurrency(run.unbanked_pet_xp), unbanked_moon_gold: clampPetCurrency(run.unbanked_moon_gold),
    unbanked_moon_crystals: clampPetCurrency(run.unbanked_moon_crystals), unbanked_style_tokens: clampPetCurrency(run.unbanked_style_tokens),
    unbanked_items: parsePetRunItems(run.unbanked_items), started_at: run.started_at || null, completed_at: run.completed_at || null, updated_at: run.updated_at || null,
  };
}

function getPetRunStepChoices(run) {
  const depth = Math.max(0, Math.floor(Number(run?.depth || 0)));
  const stepIndex = depth + 1;
  const room = getPetEndlessRoomDefinition(run);
  const contentKeys = Array.isArray(room?.engine_choices)
    ? room.engine_choices.filter((key) => PET_RUN_CHOICE_LIBRARY[key])
    : [];
  if (contentKeys.length) return contentKeys.map((key) => PET_RUN_CHOICE_LIBRARY[key]);
  if (stepIndex % PET_RUN_BOSS_INTERVAL === 0) return [PET_RUN_CHOICE_LIBRARY.boss];
  if (stepIndex % PET_RUN_ELITE_INTERVAL === 0) return [PET_RUN_CHOICE_LIBRARY.elite, PET_RUN_CHOICE_LIBRARY.sneak];
  const pools = [['fight', 'sneak', 'loot'], ['rest', 'trade', 'fight'], ['sneak', 'loot', 'gamble'], ['rest', 'hidden_route', 'gamble']];
  return pools[stablePetRunIndex(run, stepIndex, pools.length)].map((key) => PET_RUN_CHOICE_LIBRARY[key]).filter(Boolean);
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

function analyzePetRunChoice(run, choice, pet, inventory = []) {
  const depth = Math.max(0, Math.floor(Number(run?.depth || 0)));
  const difficulty = Math.max(1, Math.floor(Number(run?.difficulty || 1)), Math.floor(depth / PET_RUN_BOSS_INTERVAL) + 1);
  const multiplier = 1 + (Math.min(depth, 40) * 0.08) + ((difficulty - 1) * 0.12);
  const gear = applyPetRunGearBonuses(pet, choice, inventory);
  const riskChance = Math.max(0.05, Math.min(0.78,
    Number(choice.base_risk || 0.2) + (Math.min(depth, 30) * 0.012) + ((difficulty - 1) * 0.015)
      + gear.risk_delta - gear.survival_bonus));
  return { depth, difficulty, multiplier, gear, risk_chance: riskChance };
}

function formatPetRunPreviewRange(range, multiplier = 1, flatBonus = 0) {
  const minimum = Math.max(0, Math.floor(Number(range?.[0] || 0) * multiplier + flatBonus));
  const maximum = Math.max(minimum, Math.floor(Number(range?.[1] ?? range?.[0] ?? 0) * multiplier + flatBonus));
  return minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
}

function serializePetRunChoicePreview(run, choice, pet, inventory = []) {
  const analysis = analyzePetRunChoice(run, choice, pet, inventory);
  const rewardLabels = { pet_xp: 'XP', moon_gold: 'GOLD', moon_crystals: 'GEMS', style_tokens: 'STYLE', energy: 'ENERGY', happiness: 'HAPPY' };
  const costLabels = { energy: 'ENERGY', hunger: 'HUNGER', cleanliness: 'CLEAN', moon_gold: 'GOLD' };
  const rewardBonuses = {
    pet_xp: analysis.gear.pet_xp_bonus,
    moon_gold: analysis.gear.gold_bonus,
    moon_crystals: analysis.gear.crystal_bonus,
    style_tokens: analysis.gear.style_bonus,
  };
  const rewards = Object.entries(choice.rewards || {}).slice(0, 3).map(([key, range]) =>
    `${formatPetRunPreviewRange(range, analysis.multiplier * analysis.gear.reward_multiplier, Number(rewardBonuses[key] || 0))} ${rewardLabels[key] || key.toUpperCase()}`);
  const costs = Object.entries(choice.costs || {}).slice(0, 2).map(([key, range]) =>
    `${formatPetRunPreviewRange(range)} ${costLabels[key] || key.toUpperCase()}`);
  const advantages = [];
  if (analysis.gear.risk_delta - analysis.gear.survival_bonus < 0) advantages.push('GEAR SHIELD');
  if (analysis.gear.reward_multiplier > 1) advantages.push('GEAR BOOST');
  if (analysis.gear.consumed_item_key) advantages.push(`${analysis.gear.consumed_item_key.replaceAll('_', ' ').toUpperCase()} ACTIVE`);
  const riskPercent = Math.round(analysis.risk_chance * 100);
  const riskBand = riskPercent < 20 ? 'LOW' : riskPercent < 35 ? 'MED' : riskPercent < 50 ? 'HIGH' : 'EXTREME';
  return {
    key: choice.key,
    label: choice.label,
    type: choice.type,
    risk_percent: riskPercent,
    risk_band: riskBand,
    reward_preview: rewards,
    cost_preview: costs,
    advantages,
    detail: [`${riskBand} RISK ${riskPercent}%`, rewards.join(' + '), costs.length ? `COST ${costs.join(' + ')}` : 'NO DIRECT COST', advantages.join(' + ')].filter(Boolean).join(' // '),
  };
}

function buildPetRunStepOutcome(run, choice, pet, inventory = []) {
  const depth = Math.max(0, Math.floor(Number(run?.depth || 0)));
  const stepIndex = depth + 1;
  const analysis = analyzePetRunChoice(run, choice, pet, inventory);
  const { multiplier, gear } = analysis;
  const riskChance = analysis.risk_chance;
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

function getPetRunWalletCosts(costs = {}) {
  return {
    moon_gold: Math.max(0, Math.floor(Number(costs.moon_gold || 0))),
    moon_crystals: Math.max(0, Math.floor(Number(costs.moon_crystals || 0))),
    style_tokens: Math.max(0, Math.floor(Number(costs.style_tokens || 0))),
  };
}

function getPetRunStatCosts(costs = {}) {
  return {
    energy: Math.max(0, Number(costs.energy || 0)),
    hunger: Math.max(0, Number(costs.hunger || 0)),
    happiness: Math.max(0, Number(costs.happiness || 0)),
    cleanliness: Math.max(0, Number(costs.cleanliness || 0)),
  };
}

function getUnaffordablePetRunCosts(pet, costs = {}, wallet = null) {
  const missing = {};
  const currencyChecks = {
    moon_gold: clampPetCurrency(wallet?.moon_gold),
    moon_crystals: clampPetCurrency(wallet?.moon_crystals),
    style_tokens: clampPetCurrency(wallet?.style_tokens),
  };
  for (const [key, balance] of Object.entries(currencyChecks)) {
    const cost = Math.max(0, Math.floor(Number(costs[key] || 0)));
    if (cost > balance) missing[key] = { required: cost, available: balance };
  }
  return missing;
}

function applyPetRunCosts(pet, costs = {}) {
  const statCosts = getPetRunStatCosts(costs);
  pet.energy = clampPetStat(Number(pet.energy || 0) - statCosts.energy);
  pet.hunger = clampPetStat(Number(pet.hunger || 0) + statCosts.hunger);
  pet.happiness = clampPetStat(Number(pet.happiness || 0) - statCosts.happiness);
  pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) - statCosts.cleanliness);
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
  const requestedRunId = String(options.run_id || '').trim().slice(0, 80);
  if (requestedRunId) {
    const requestedRun = await getPetRunById(db, telegramId, requestedRunId);
    if (requestedRun && ['active', 'extractable'].includes(requestedRun.status)) {
      if (!requestedRun.pet_id) return { accepted: false, reason: 'run_pet_authority_required', run: requestedRun, xp_awarded: 0, pet_xp_awarded: 0 };
      const pet = await getPetInstanceWithAtomicDecay(db, requestedRun.pet_id);
      if (!pet || pet.telegram_id !== telegramId) return { accepted: false, reason: 'run_pet_not_found', run: requestedRun, xp_awarded: 0, pet_xp_awarded: 0 };
      await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${requestedRun.run_id}:memory:start`, memory_type: 'first_run', milestone: 'first_run' });
      return { accepted: true, reason: 'run_resumed', pet_id: requestedRun.pet_id, run: requestedRun, pet };
    }
    if (requestedRun && PET_RUN_COMPLETED_STATUSES.includes(requestedRun.status)) return { accepted: false, reason: 'run_closed', run: requestedRun, xp_awarded: 0, pet_xp_awarded: 0 };
    return { accepted: false, reason: 'run_not_found', xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const active = await getActivePetRun(db, telegramId);
  if (active) {
    if (!active.pet_id) return { accepted: false, reason: 'run_pet_authority_required', run: active, xp_awarded: 0, pet_xp_awarded: 0 };
    const pet = await getPetInstanceWithAtomicDecay(db, active.pet_id);
    if (!pet || pet.telegram_id !== telegramId) return { accepted: false, reason: 'run_pet_not_found', run: active, xp_awarded: 0, pet_xp_awarded: 0 };
    await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${active.run_id}:memory:start`, memory_type: 'first_run', milestone: 'first_run' });
    return { accepted: true, reason: 'run_resumed', pet_id: active.pet_id, run: active, pet };
  }
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const petId = String(pet.pet_id || '').trim();
  if (!petId) return { accepted: false, reason: 'active_pet_instance_required', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  if (clampPetStat(pet.energy) < 12) return { accepted: false, reason: 'pet_tired', pet };
  const now = new Date();
  const season = getPetSeasonInfo(now);
  const runId = `run-${crypto.randomUUID()}`.slice(0, 80);
  await db.prepare(`
    INSERT INTO telegram_pet_runs
      (id, pet_id, telegram_id, run_id, season_key, status, region, difficulty, seed, depth, current_room, max_depth, max_room, score, rooms_completed, risk_level, unbanked_items)
    VALUES (?, ?, ?, ?, ?, 'active', 'moon_alley', 1, ?, 0, 0, ?, ?, 0, 0, 1, '{}')
  `).bind(crypto.randomUUID(), petId, telegramId, runId, season.key, crypto.getRandomValues(new Uint32Array(1))[0], PET_RUN_MAX_DEPTH, PET_RUN_MAX_DEPTH).run();
  await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${runId}:memory:start`, memory_type: 'first_run', milestone: 'first_run' });
  const run = await getPetRunById(db, telegramId, runId);
  return { accepted: true, reason: 'run_started', pet_id: run?.pet_id || petId, run, pet };
}

async function recordPetRunBankedEvent(db, telegramId, run, pet, options = {}) {
  if (!String(run?.pet_id || '').trim()) {
    return { accepted: false, reason: 'run_pet_authority_required', run, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const now = new Date();
  const eventType = options.completed ? 'run_complete' : 'run_extract';
  const eventKey = String(options.completed ? (options.event_key || buildStablePetEventKey(['pet_run_complete', telegramId, run.run_id])) : buildPetRunExtractEventKey(telegramId, run.run_id)).slice(0, 120);
  const terminalStatus = options.completed ? 'completed' : 'extracted';
  const claimedRow = await db.prepare(`UPDATE telegram_pet_runs
    SET status = ?, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable') AND depth = ?
    RETURNING *`).bind(terminalStatus, telegramId, run.run_id, Math.max(0, Math.floor(Number(run.depth || 0)))).first();
  const rewardRun = claimedRow ? serializePetRun(claimedRow) : await getPetRunById(db, telegramId, run.run_id);
  if (!rewardRun || rewardRun.status !== terminalStatus) {
    return { accepted: false, reason: 'run_closed', run: rewardRun || run, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const bankedItemsAuthority = parsePetRunItems(rewardRun.unbanked_items);
  const requestedCommunityXpAuthority = Math.max(0, Math.min(80,
    Math.floor(Math.max(0, Number(rewardRun.unbanked_pet_xp || 0)) / 3) + Math.max(0, Number(rewardRun.depth || 0)) * 4));
  const awardedAuthority = await awardPetReward(db, {
    telegram_id: telegramId, pet_id: rewardRun.pet_id, source: 'pet_run_legacy', idempotency_key: eventKey, event_key: eventKey,
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
  await reconcileSanctuaryBestEffort(db, telegramId, options.completed ? 'run_completed' : 'run_extracted');
  return { ...awardedAuthority, reason: awardedAuthority.duplicate ? 'duplicate' : (options.completed ? 'run_completed' : 'run_extracted'),
    run: rewardRun, banked_items: bankedItemsAuthority };
}

async function getPetRunTerminalRewardClaim(db, telegramId, runId, completed = true) {
  const eventKey = completed ? buildStablePetEventKey(['pet_run_complete', telegramId, runId]) : buildPetRunExtractEventKey(telegramId, runId);
  return db.prepare(`
    SELECT claim_id, status, applied_rewards
    FROM telegram_pet_reward_claims
    WHERE telegram_id = ? AND source = 'pet_run_legacy' AND idempotency_key = ? AND status = 'awarded'
    LIMIT 1
  `).bind(telegramId, eventKey).first().catch(() => null);
}

async function retryUnsettledTerminalRunStep(db, telegramId, run, step, choice, options = {}) {
  const currentRun = await getPetRunById(db, telegramId, run.run_id);
  const stepIndex = Math.max(1, Math.floor(Number(step?.step_index || 0)));
  const maxDepth = Math.max(1, Math.floor(Number(currentRun?.max_depth || run?.max_depth || PET_RUN_MAX_DEPTH)));
  if (!currentRun || Number(step?.success || 0) !== 1 || stepIndex < maxDepth) return null;
  const settledClaim = await getPetRunTerminalRewardClaim(db, telegramId, currentRun.run_id, true);
  if (settledClaim) return null;
  const pet = currentRun.pet_id ? await getPetInstanceWithAtomicDecay(db, currentRun.pet_id).catch(() => null) : null;
  if (!pet || pet.telegram_id !== telegramId) {
    return { accepted: false, reason: 'run_pet_not_found', run: currentRun, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const terminalWalletDeltas = {
    moon_gold: clampPetCurrency(currentRun.unbanked_moon_gold),
    moon_crystals: clampPetCurrency(currentRun.unbanked_moon_crystals),
    style_tokens: clampPetCurrency(currentRun.unbanked_style_tokens),
  };
  if (hasPetAccountWalletDelta(terminalWalletDeltas) && !(await ensurePetAccountWalletReadyForMutation(db, telegramId))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', run: currentRun, choice, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const banked = await recordPetRunBankedEvent(db, telegramId, currentRun, pet, {
    completed: true,
    event_key: buildStablePetEventKey(['pet_run_complete', telegramId, currentRun.run_id]),
    source: options.source || 'telegram_command',
  });
  const wallet = await readPetAccountWallet(db, telegramId);
  const bankedPet = banked.pet || pet;
  if (wallet) Object.assign(bankedPet, wallet);
  return { ...banked, pet: bankedPet, choice, reason: banked.accepted ? (banked.duplicate ? 'duplicate' : 'run_completed') : banked.reason };
}

async function processPetRunExtract(db, telegramId, runIdRaw = '', options = {}) {
  const runId = String(runIdRaw || '').trim();
  const run = runId ? await getPetRunById(db, telegramId, runId) : await getActivePetRun(db, telegramId);
  if (!run) return { accepted: false, reason: 'run_not_found', xp_awarded: 0, pet_xp_awarded: 0 };
  if (!run.pet_id) return { accepted: false, reason: 'run_pet_authority_required', run, xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetInstanceWithAtomicDecay(db, run.pet_id);
  if (!pet || pet.telegram_id !== telegramId) return { accepted: false, reason: 'run_pet_not_found', run, xp_awarded: 0, pet_xp_awarded: 0 };
  if (run.depth <= 0) return { accepted: false, reason: 'run_empty', run, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  const extractWalletDeltas = {
    moon_gold: clampPetCurrency(run.unbanked_moon_gold),
    moon_crystals: clampPetCurrency(run.unbanked_moon_crystals),
    style_tokens: clampPetCurrency(run.unbanked_style_tokens),
  };
  if (hasPetAccountWalletDelta(extractWalletDeltas) && !(await ensurePetAccountWalletReadyForMutation(db, telegramId))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', run, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  return recordPetRunBankedEvent(db, telegramId, run, pet, { ...options, event_key: buildPetRunExtractEventKey(telegramId, run.run_id) });
}

async function saveRunPetInstance(db, petId, pet) {
  await runPetInstanceUpdateStatement(db, petId, pet).run();
}

function runPetInstanceUpdateStatement(db, petId, pet, persistenceGuardSql = '1 = 1', persistenceGuardArgs = []) {
  const persistedAt = formatPetStateTimestamp();
  pet.stage = getPetGrowthStage(pet.pet_xp);
  pet.health = calculatePetHealth(pet);
  const assignments = PET_INSTANCE_STATE_COLUMNS.map((column) => `${column} = ?`).join(', ');
  const values = PET_INSTANCE_STATE_COLUMNS.map((column) => column === 'level' ? getPetLevel(pet.pet_xp) : pet[column]);
  return db.prepare(`UPDATE telegram_pet_instances SET ${assignments}, source_profile_updated_at = ?, updated_at = ?
    WHERE pet_id = ? AND telegram_id = ? AND ${persistenceGuardSql}`)
    .bind(...values, PET_INSTANCE_AUTHORITY_VERSION, persistedAt, petId, pet.telegram_id, ...persistenceGuardArgs);
}

async function processPetRunStep(db, telegramId, runIdRaw, choiceKeyRaw, options = {}) {
  const runId = String(runIdRaw || '').trim();
  const run = runId ? await getPetRunById(db, telegramId, runId) : await getActivePetRun(db, telegramId);
  if (!run) return { accepted: false, reason: 'run_not_found', xp_awarded: 0, pet_xp_awarded: 0 };
  const stepIndex = Math.max(1, Math.floor(Number(run.depth || 0) + 1));
  const suppliedExpectedStepIndex = options.expected_step_index === undefined || options.expected_step_index === null || options.expected_step_index === ''
    ? null
    : Number(options.expected_step_index);
  const expectedStepIndex = suppliedExpectedStepIndex === null
    ? null
    : Math.max(1, Math.floor(Number.isFinite(suppliedExpectedStepIndex) ? suppliedExpectedStepIndex : 0));
  const explicitEventKey = options.event_key ? String(options.event_key).slice(0, 120) : null;
  if (explicitEventKey) {
    const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, explicitEventKey).first().catch(() => null);
    if (duplicate) {
      const choice = getPetRunChoice(run, duplicate.choice_key || choiceKeyRaw);
      const recovered = await retryUnsettledTerminalRunStep(db, telegramId, run, duplicate, choice, options);
      if (recovered) return recovered;
      return { accepted: true, duplicate: true, reason: 'duplicate', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
    }
  }
  if (!['active', 'extractable'].includes(run.status)) return { accepted: false, reason: 'run_closed', run, xp_awarded: 0, pet_xp_awarded: 0 };
  const choice = getPetRunChoice(run, choiceKeyRaw);
  if (!choice) return { accepted: false, reason: 'invalid_run_choice', run, xp_awarded: 0, pet_xp_awarded: 0 };
  const eventKey = explicitEventKey || String(buildPetRunStepEventKey(telegramId, run.run_id, expectedStepIndex || stepIndex, choice.key)).slice(0, 120);
  if (!explicitEventKey) {
    const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first().catch(() => null);
    if (duplicate) {
      const recovered = await retryUnsettledTerminalRunStep(db, telegramId, run, duplicate, choice, options);
      if (recovered) return recovered;
      return { accepted: true, duplicate: true, reason: 'duplicate', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
    }
  }
  if (expectedStepIndex !== null && expectedStepIndex !== stepIndex) {
    return { accepted: false, reason: 'stale_run_step', run, choice, expected_step_index: expectedStepIndex, current_step_index: stepIndex, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const existingStep = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE run_id = ? AND step_index = ?`).bind(run.run_id, stepIndex).first().catch(() => null);
  if (existingStep) {
    const recovered = await retryUnsettledTerminalRunStep(db, telegramId, run, existingStep, choice, options);
    if (recovered) return recovered;
    return { accepted: true, duplicate: true, reason: 'step_already_resolved', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  if (!run.pet_id) return { accepted: false, reason: 'legacy_run_pet_authority_missing', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetInstanceWithAtomicDecay(db, run.pet_id);
  if (!pet || pet.telegram_id !== telegramId) return { accepted: false, reason: 'run_pet_not_found', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  if (clampPetStat(pet.energy) <= 0) return { accepted: false, reason: 'pet_tired', run, choice, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  const inventory = await getPetInventory(db, telegramId).catch(() => []);
  const outcome = buildPetRunStepOutcome(run, choice, pet, inventory);
  const walletCosts = getPetRunWalletCosts(outcome.costs);
  const walletCostDeltas = { moon_gold: -walletCosts.moon_gold, moon_crystals: -walletCosts.moon_crystals, style_tokens: -walletCosts.style_tokens };
  if (hasPetAccountWalletDelta(walletCostDeltas) && !(await ensurePetAccountWalletReadyForMutation(db, telegramId))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', run, choice, pet, outcome, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const terminalRewardDeltas = outcome.success && stepIndex >= PET_RUN_MAX_DEPTH
    ? {
      moon_gold: clampPetCurrency(run.unbanked_moon_gold) + clampPetCurrency(outcome.rewards.moon_gold),
      moon_crystals: clampPetCurrency(run.unbanked_moon_crystals) + clampPetCurrency(outcome.rewards.moon_crystals),
      style_tokens: clampPetCurrency(run.unbanked_style_tokens) + clampPetCurrency(outcome.rewards.style_tokens),
    }
    : {};
  if (hasPetAccountWalletDelta(terminalRewardDeltas) && !(await ensurePetAccountWalletReadyForMutation(db, telegramId))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', run, choice, pet, outcome, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const runStepHasWalletMutation = hasPetAccountWalletDelta(walletCostDeltas) || hasPetAccountWalletDelta(terminalRewardDeltas);
  const accountWallet = await readPetAccountWallet(db, telegramId);
  const missingCosts = getUnaffordablePetRunCosts(pet, outcome.costs, accountWallet);
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
      (id, pet_id, telegram_id, run_id, step_index, choice_key, choice_type, event_key, success, risk_roll, pet_xp_delta, moon_gold_delta, moon_crystals_delta, style_tokens_delta, item_key, metadata)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_runs
        WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable') AND depth = ?)
      AND EXISTS (SELECT 1 FROM telegram_pet_profiles
        WHERE telegram_id = ? AND ${accountWalletAffordabilitySql()} ${runStepHasWalletMutation ? `AND ${accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id')}` : ''})
      AND (? IS NULL OR EXISTS (SELECT 1 FROM telegram_pet_inventory
        WHERE telegram_id = ? AND asset_type = 'item' AND asset_key = ? AND quantity > 0))
  `).bind(
    stepId,
    run.pet_id,
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
    telegramId,
    walletCostDeltas.moon_gold,
    walletCostDeltas.moon_crystals,
    walletCostDeltas.style_tokens,
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
    const petXpToday = await getPetDayXpTotal(db, run.pet_id, dayKey);
    let consolationXp = Math.max(1, Math.min(12, 4 + Math.floor(Number(run.depth || 0) * 2)));
    if (petXpToday >= PETS_DAILY_PET_XP_CAP) consolationXp = 0;
    else if (petXpToday + consolationXp > PETS_DAILY_PET_XP_CAP) consolationXp = Math.max(0, PETS_DAILY_PET_XP_CAP - petXpToday);
    pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + consolationXp));
    updatePetStreakForAction(pet, dayKey);
    pet.last_decay_at = new Date().toISOString();
    const runFailEventId = crypto.randomUUID();
    const terminalStatements = [stepInsertStatement, accountWalletDeltaStatement(db, telegramId, walletCostDeltas,
      'EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?)', [stepId]), db.prepare(`
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
    `).bind(stepIndex, telegramId, run.run_id, stepIndex - 1, stepId),
    runPetInstanceUpdateStatement(db, run.pet_id, pet,
      "EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?) AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE telegram_id = ? AND run_id = ? AND depth = ? AND status = 'failed')",
      [stepId, telegramId, run.run_id, stepIndex]),
    db.prepare(`
      INSERT INTO telegram_pet_events
        (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, 'run_fail', ?, 0, ?, ?, ?, ?, 'accepted', 'run_failed', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?)
        AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE telegram_id = ? AND run_id = ? AND status = 'failed')
        AND EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? AND pet_xp = ?)
    `).bind(
      runFailEventId,
      run.pet_id,
      telegramId,
      buildStablePetEventKey(['pet_run_fail', telegramId, run.run_id, stepIndex]),
      consolationXp,
      season.key,
      dayKey,
      weekKey,
      JSON.stringify({ source: options.source || 'telegram_command', run_id: run.run_id, failed_step: stepIndex, lost_unbanked: run }),
      stepId,
      telegramId,
      run.run_id,
      run.pet_id,
      telegramId,
      pet.pet_xp,
    ),
    db.prepare(`
      INSERT INTO telegram_pet_season_state
        (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'accepted')
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET
        season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key,
        weekly_key = excluded.weekly_key,
        updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, season.key, consolationXp, consolationXp, consolationXp, dayKey, weekKey, runFailEventId),
    ...consumedItemStatements];
    const terminalResults = await db.batch(terminalStatements);
    if (!terminalResults?.[2]?.results?.[0] || Number(terminalResults?.[3]?.meta?.changes || 0) !== 1 || Number(terminalResults?.[4]?.meta?.changes || 0) !== 1) {
      return { accepted: false, reason: 'run_closed', run: await getPetRunById(db, telegramId, run.run_id), choice, outcome, pet, xp_awarded: 0, pet_xp_awarded: 0 };
    }
    const failedRun = await getPetRunById(db, telegramId, run.run_id);
    const persistedPet = await getPetInstanceWithAtomicDecay(db, run.pet_id).catch(() => null);
    if (persistedPet) Object.assign(persistedPet, await readPetAccountWallet(db, telegramId) || {});
    return { accepted: true, reason: 'run_failed', run: failedRun, choice, outcome, pet: persistedPet || pet, xp_awarded: 0, pet_xp_awarded: consolationXp };
  }

  updatePetStreakForAction(pet, dayKey);
  applyPetRunStatRewards(pet, outcome.rewards);
  pet.last_decay_at = new Date().toISOString();
  const stepStatements = [stepInsertStatement, accountWalletDeltaStatement(db, telegramId, walletCostDeltas,
    'EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?)', [stepId]), db.prepare(`
    UPDATE telegram_pet_runs
    SET status = ?,
        depth = ?,
        current_room = ?,
        rooms_completed = ?,
        difficulty = ?,
        score = score + ?,
        risk_level = ?,
        unbanked_pet_xp = unbanked_pet_xp + ?,
        unbanked_moon_gold = unbanked_moon_gold + ?,
        unbanked_moon_crystals = unbanked_moon_crystals + ?,
        unbanked_style_tokens = unbanked_style_tokens + ?,
        unbanked_items = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ? AND run_id = ? AND status IN ('active', 'extractable') AND depth = ?
      AND EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?)
    RETURNING run_id
  `).bind(
    stepIndex >= PET_RUN_MAX_DEPTH ? 'extractable' : 'extractable',
    stepIndex, stepIndex, stepIndex,
    Math.floor(stepIndex / PET_RUN_BOSS_INTERVAL) + 1,
    Math.max(10, Math.floor((outcome.rewards.pet_xp + outcome.rewards.moon_gold) * (choice.type === 'boss' ? 2.5 : choice.key === 'elite' ? 1.75 : 1))),
    Math.min(10, Math.floor(stepIndex / PET_RUN_ELITE_INTERVAL) + 1),
    clampPetCurrency(outcome.rewards.pet_xp),
    clampPetCurrency(outcome.rewards.moon_gold),
    clampPetCurrency(outcome.rewards.moon_crystals),
    clampPetCurrency(outcome.rewards.style_tokens),
    JSON.stringify(unbankedItems),
    telegramId,
    run.run_id,
    stepIndex - 1,
    stepId,
  ),
  runPetInstanceUpdateStatement(db, run.pet_id, pet,
    "EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ?) AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE telegram_id = ? AND run_id = ? AND depth = ? AND status = 'extractable')",
    [stepId, telegramId, run.run_id, stepIndex]),
  ...consumedItemStatements];
  const stepResults = await db.batch(stepStatements);
  if (!stepResults?.[2]?.results?.[0] || Number(stepResults?.[3]?.meta?.changes || 0) !== 1) {
    return { accepted: false, reason: 'run_closed', run: await getPetRunById(db, telegramId, run.run_id), choice, outcome, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const updatedRun = await getPetRunById(db, telegramId, run.run_id);
  const persistedPet = await getPetInstanceWithAtomicDecay(db, run.pet_id).catch(() => null);
  if (persistedPet) Object.assign(persistedPet, await readPetAccountWallet(db, telegramId) || {});
  if (stepIndex >= PET_RUN_MAX_DEPTH) {
    const banked = await recordPetRunBankedEvent(db, telegramId, updatedRun, persistedPet || pet, {
      completed: true,
      event_key: buildStablePetEventKey(['pet_run_complete', telegramId, run.run_id]),
      source: options.source || 'telegram_command',
    });
    const wallet = await readPetAccountWallet(db, telegramId);
    const bankedPet = banked.pet || pet;
    if (wallet) Object.assign(bankedPet, wallet);
    return { ...banked, pet: bankedPet, choice, outcome, reason: 'run_completed' };
  }
  return { accepted: true, reason: 'run_step_complete', run: updatedRun, choice, outcome, pet: persistedPet || pet, xp_awarded: 0, pet_xp_awarded: 0 };
}

async function getPetInventory(db, telegramId) {
  await reconcileLegacyPetInventory(db, telegramId);
  const rows = await db.prepare(`
    SELECT asset_key, quantity
    FROM telegram_pet_inventory
    WHERE telegram_id = ? AND asset_type = 'item' AND quantity > 0
  `).bind(telegramId).all().catch(() => ({ results: [] }));
  const inventory = {};
  for (const item of Object.values(PET_INVENTORY_ITEMS)) inventory[item.key] = 0;
  for (const row of rows.results || []) {
    if (inventory[row.asset_key] !== undefined) inventory[row.asset_key] = Math.max(0, Math.floor(Number(row.quantity || 0)));
  }
  return Object.entries(PET_INVENTORY_ITEMS).map(([key, item]) => ({ ...item, count: Math.max(0, inventory[key] || 0) }));
}

async function processPetUseItem(db, telegramId, itemKeyRaw, options = {}) {
  const key = normalizePetInventoryItemKey(itemKeyRaw);
  if (!key) return { accepted: false, reason: 'invalid_item', xp_awarded: 0, pet_xp_awarded: 0 };
  await reconcileLegacyPetInventory(db, telegramId);
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:use_item:${telegramId}:${key}:${Date.now()}`).slice(0, 120);
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const item = PET_INVENTORY_ITEMS[key];
  const existing = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (existing) {
    let existingItemKey = null;
    try { existingItemKey = JSON.parse(existing?.metadata || '{}').consumed_item_key || null; } catch {}
    if (existing.event_type === 'use_item' && existingItemKey === key) {
      const inventory = await getPetInventory(db, telegramId);
      const updatedPet = existing.pet_id ? await getPetInstanceWithAtomicDecay(db, existing.pet_id).catch(() => null) : await getPetProfile(db, telegramId);
      if (updatedPet) Object.assign(updatedPet, await readPetAccountWallet(db, telegramId) || {});
      return {
        accepted: true,
        duplicate: true,
        reason: 'duplicate',
        xp_awarded: Math.max(0, Math.floor(Number(existing.xp_awarded || 0))),
        pet_xp_awarded: Math.max(0, Math.floor(Number(existing.pet_xp_awarded || 0))),
        item: { ...item, count: inventory.find((entry) => entry.key === key)?.count || 0 },
        pet: updatedPet,
      };
    }
    return { accepted: false, reason: 'item_event_conflict', pet };
  }
  const effects = {
    moon_snack: { hunger: -18, energy: 8, pet_xp: 4 },
    energy_drink: { energy: 22, pet_xp: 6 },
    clean_wipe: { cleanliness: 24, happiness: 4, pet_xp: 4 },
    lucky_charm: { pet_xp: 8 },
    style_patch: { style_tokens: 2, pet_xp: 5 },
    adventure_map: { energy: 6, pet_xp: 5 },
  }[key];
  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  let petXp = Math.max(0, Math.floor(Number(effects.pet_xp || 0)));
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;
  else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
  const hungerDelta = Math.trunc(Number(effects.hunger || 0) || 0);
  const happinessDelta = Math.trunc(Number(effects.happiness || 0) || 0);
  const cleanlinessDelta = Math.trunc(Number(effects.cleanliness || 0) || 0);
  const energyDelta = Math.trunc(Number(effects.energy || 0) || 0);
  updatePetStreakForAction(pet, dayKey);
  const nextStreakDays = Math.max(0, Math.floor(Number(pet.streak_days || 0)));
  const nextLastActiveDay = pet.last_active_day || dayKey;
  const nextDecayAt = now.toISOString();
  const walletRewards = { style_tokens: Math.max(0, Math.floor(Number(effects.style_tokens || 0))) };
  const itemHasWalletReward = hasPetAccountWalletDelta(walletRewards);
  if (itemHasWalletReward && !(await ensurePetAccountWalletReadyForMutation(db, telegramId, now))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const petLevelSql = `MAX(1, CAST((MAX(0, pet_xp + ?) / 100) AS INTEGER) + 1)`;
  const petStageSql = `CASE
          WHEN MAX(0, pet_xp + ?) >= 1800 THEN 'legendary companion'
          WHEN MAX(0, pet_xp + ?) >= 900 THEN 'moon guardian'
          WHEN MAX(0, pet_xp + ?) >= 360 THEN 'street scout'
          WHEN MAX(0, pet_xp + ?) >= 120 THEN 'runner'
          WHEN MAX(0, pet_xp + ?) >= 25 THEN 'hatchling'
          ELSE 'egg'
        END`;
  const itemUsePetDeltaSql = `pet_xp = MAX(0, pet_xp + ?),
        level = ${petLevelSql},
        stage = ${petStageSql},
        hunger = MIN(100, MAX(0, hunger + ?)),
        happiness = MIN(100, MAX(0, happiness + ?)),
        cleanliness = MIN(100, MAX(0, cleanliness + ?)),
        energy = MIN(100, MAX(0, energy + ?)),
        health = MIN(100, MAX(0, ROUND(((100 - MIN(100, MAX(0, hunger + ?))) + MIN(100, MAX(0, happiness + ?)) + MIN(100, MAX(0, cleanliness + ?)) + MIN(100, MAX(0, energy + ?))) / 4.0))),
        streak_days = MAX(streak_days, ?),
        last_active_day = ?,
        last_decay_at = ?,
        updated_at = CURRENT_TIMESTAMP`;
  const itemUsePetDeltaArgs = [
    petXp,
    petXp,
    petXp, petXp, petXp, petXp, petXp,
    hungerDelta,
    happinessDelta,
    cleanlinessDelta,
    energyDelta,
    hungerDelta,
    happinessDelta,
    cleanlinessDelta,
    energyDelta,
    nextStreakDays,
    nextLastActiveDay,
    nextDecayAt,
  ];
  const consumeEventId = crypto.randomUUID();
  const claimId = crypto.randomUUID();
  const rewardMetadata = JSON.stringify({
    source: options.source || 'telegram_bot',
    inventory_authority: true,
    consumed_item_key: key,
    rewards: { pet_xp: petXp, style_tokens: walletRewards.style_tokens },
    profile_deltas: { hunger: hungerDelta, energy: energyDelta, cleanliness: cleanlinessDelta, happiness: happinessDelta },
  });
  const requestedRewards = JSON.stringify({ pet_xp: petXp, community_xp: 0, moon_gold: 0, moon_crystals: 0, style_tokens: walletRewards.style_tokens, materials: {}, items: {}, relics: {} });
  const appliedRewards = requestedRewards;
  const consumeResults = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
      (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, 'use_item', ?, 0, ?, ?, ?, ?, 'pending', 'item_use_pending', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_inventory
        WHERE telegram_id = ? AND asset_type = 'item' AND asset_key = ? AND quantity > 0)
        ${itemHasWalletReward ? `AND ${accountWalletRecoveryResolvedSql('?')}` : ''}
        AND (? = '' OR EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ?))
      RETURNING id`).bind(consumeEventId, pet.pet_id || null, telegramId, eventKey, petXp, season.key, dayKey, weekKey, rewardMetadata,
        telegramId, key, ...(itemHasWalletReward ? [telegramId] : []), pet.pet_id || '', pet.pet_id || '', telegramId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_claims
      (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata)
      SELECT ?, ?, ?, 'pet_item_use', ?, ?, 'pending', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')`)
      .bind(claimId, pet.pet_id || null, telegramId, `item_use:${eventKey}`, dayKey, requestedRewards, appliedRewards, rewardMetadata, consumeEventId),
    db.prepare(`UPDATE telegram_pet_inventory
      SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND asset_type = 'item' AND asset_key = ? AND quantity > 0
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')`)
      .bind(telegramId, key, consumeEventId, claimId),
    accountWalletDeltaStatement(db, telegramId, walletRewards,
      "EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending') AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')",
      [consumeEventId, claimId]),
    db.prepare(`UPDATE telegram_pet_profiles SET
        ${itemUsePetDeltaSql}
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')`)
      .bind(...itemUsePetDeltaArgs, telegramId, consumeEventId, claimId),
    db.prepare(`UPDATE telegram_pet_instances SET
        ${itemUsePetDeltaSql},
        source_profile_updated_at = ?
      WHERE telegram_id = ? AND pet_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')`)
      .bind(...itemUsePetDeltaArgs, PET_INSTANCE_AUTHORITY_VERSION, telegramId, pet.pet_id || '', consumeEventId, claimId),
    db.prepare(`INSERT INTO telegram_pet_season_state
        (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET
        season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key,
        weekly_key = excluded.weekly_key,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey, consumeEventId, claimId),
    db.prepare(`UPDATE telegram_pet_events
      SET status = 'accepted', reason = 'item_used'
      WHERE id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')
        AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)
        AND (
          pet_id IS NULL OR EXISTS (
            SELECT 1 FROM telegram_pet_instances WHERE pet_id = telegram_pet_events.pet_id AND telegram_id = ?
          )
        )
      RETURNING id`)
      .bind(consumeEventId, claimId, telegramId, telegramId),
    db.prepare(`UPDATE telegram_pet_reward_claims
      SET status = 'awarded', awarded_at = CURRENT_TIMESTAMP
      WHERE claim_id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'accepted')
      RETURNING claim_id`)
      .bind(claimId, consumeEventId),
  ]);
  const consumed = Boolean(consumeResults?.[0]?.results?.[0] && consumeResults?.[7]?.results?.[0] && consumeResults?.[8]?.results?.[0]);
  if (!consumed) {
    const acceptedDuplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);
    if (acceptedDuplicate) {
      const inventory = await getPetInventory(db, telegramId);
      const updatedPet = acceptedDuplicate.pet_id ? await getPetInstanceWithAtomicDecay(db, acceptedDuplicate.pet_id).catch(() => null) : await getPetProfile(db, telegramId);
      if (updatedPet) Object.assign(updatedPet, await readPetAccountWallet(db, telegramId) || {});
      return {
        accepted: true,
        duplicate: true,
        reason: 'duplicate',
        xp_awarded: Math.max(0, Math.floor(Number(acceptedDuplicate.xp_awarded || 0))),
        pet_xp_awarded: Math.max(0, Math.floor(Number(acceptedDuplicate.pet_xp_awarded || 0))),
        item: { ...item, count: inventory.find((entry) => entry.key === key)?.count || 0 },
        pet: updatedPet,
      };
    }
    return { accepted: false, reason: 'item_not_found', pet };
  }
  const inventory = await getPetInventory(db, telegramId);
  const updatedPet = pet.pet_id ? await getPetInstanceWithAtomicDecay(db, pet.pet_id).catch(() => null) : await getPetProfile(db, telegramId);
  if (updatedPet) Object.assign(updatedPet, await readPetAccountWallet(db, telegramId) || {});
  return { accepted: true, reason: 'item_used', xp_awarded: 0, pet_xp_awarded: petXp, item: { ...item, count: inventory.find((entry) => entry.key === key)?.count || 0 }, pet: updatedPet };
}

async function processPetJob(db, telegramId, jobKeyRaw, options = {}) {
  const key = normalizePetJobKey(jobKeyRaw);
  if (!key) return { accepted: false, reason: 'invalid_job', xp_awarded: 0, pet_xp_awarded: 0 };
  const now = new Date();
  const eventKey = String(options.event_key || `pet:work:${telegramId}:${key}:${Date.now()}`).slice(0, 120);
  const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
  const job = PET_JOBS[key];
  const level = getPetLevel(pet.pet_xp);
  const evolutionStage = Math.max(0, Math.floor(Number(identity?.current_stage?.stage) || 0));
  if (level < Math.max(1, Number(job.min_level) || 1) || evolutionStage < Math.max(0, Number(job.min_evolution_stage) || 0)) {
    return { accepted: false, reason: 'job_locked', required_level: job.min_level, required_evolution_stage: job.min_evolution_stage, pet };
  }
  const eliteJob = PET_ELITE_JOBS[key] || null;
  if (eliteJob) {
    const runtime = await getOrCreatePetRuntimeState(db, telegramId, getPetDayKey(now)).catch(() => null);
    if (!runtime || !canStartPetEliteJob(key, { ...runtime, level })) {
      return {
        accepted: false,
        reason: 'specialist_job_locked',
        required_track: eliteJob.required_track,
        required_xp: eliteJob.required_xp,
        current_xp: Math.max(0, Number(runtime?.[`${eliteJob.required_track}_xp`]) || 0),
        pet,
      };
    }
  }
  const lastWork = await db.prepare(`SELECT created_at FROM telegram_pet_events WHERE telegram_id = ? AND event_type = 'work' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`).bind(telegramId).first().catch(() => null);
  if (lastWork?.created_at) {
    const elapsedSeconds = (now.getTime() - (parseSqliteTs(lastWork.created_at) ?? now.getTime())) / 1000;
    if (elapsedSeconds < PETS_ACTION_COOLDOWN_SECONDS) {
      return { accepted: false, reason: 'cooldown', retry_after_seconds: Math.max(1, Math.ceil(PETS_ACTION_COOLDOWN_SECONDS - elapsedSeconds)), pet };
    }
  }
  const factionRow = await db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id = ?').bind(telegramId).first().catch(() => null);
  const adjusted = applyPetFactionBonus(job, factionRow?.faction, 'jobs');
  const setEffects = getPetActiveSetEffects(pet);
  const jobSetPct = Math.max(0, Number(setEffects.job_reward_pct) || 0);
  const scalableJobRewards = new Set(['pet_xp', 'community_xp', 'moon_gold', 'moon_crystals', 'style_tokens']);
  const rewards = Object.fromEntries(Object.entries(adjusted.rewards).map(([rewardKey, value]) => [rewardKey, scalableJobRewards.has(rewardKey) && typeof value === 'number' && value > 0 ? Math.floor(value * (100 + jobSetPct) / 100) : value]));
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_job', idempotency_key: eventKey, event_key: eventKey,
    event_type: 'work', reason: key, rewards, touch_streak: true,
    context: { source: options.source || 'telegram_bot', job_key: key, faction_bonus: adjusted.bonus, equipment_set_bonus: jobSetPct ? { job_reward_pct: jobSetPct } : null },
  });
  return { ...awarded, reason: awarded.duplicate ? 'duplicate' : key, job: rewards, faction_bonus: adjusted.bonus };
}

async function processPetDailyChest(db, telegramId, options = {}) {
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:daily:${telegramId}:${dayKey}`).slice(0, 120);
  const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const claimed = await db.prepare(`SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_type = 'daily_chest' AND day_key = ? AND status = 'accepted'`).bind(telegramId, dayKey).first().catch(() => null);
  if (claimed) return { accepted: false, reason: 'daily_claimed', pet };
  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);
  let petXp = 40;
  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;
  else if (totals.day.pet_xp + petXp > PETS_DAILY_PET_XP_CAP) petXp = Math.max(0, PETS_DAILY_PET_XP_CAP - totals.day.pet_xp);
  const startingPetXp = Math.max(0, Math.floor(Number(pet.pet_xp || 0)));
  if (!(await ensurePetAccountWalletReadyForMutation(db, telegramId, now))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();
  const eventId = crypto.randomUUID();
  const metadata = JSON.stringify({ source: options.source || 'telegram_bot', rewards: { moon_gold: 40, style_tokens: 2 } });
  const chestResults = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
        (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, 'daily_chest', ?, 0, ?, ?, ?, ?, 'pending', 'daily_chest_pending', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM telegram_pet_events WHERE telegram_id = ? AND event_type = 'daily_chest' AND day_key = ? AND status = 'accepted'
      )
        AND ${accountWalletRecoveryResolvedSql('?')}
        AND (? = '' OR EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ?))
      RETURNING id`)
      .bind(eventId, pet.pet_id || null, telegramId, eventKey, petXp, season.key, dayKey, weekKey, metadata, telegramId, dayKey,
        telegramId, pet.pet_id || '', pet.pet_id || '', telegramId),
    accountWalletDeltaStatement(db, telegramId, { moon_gold: 40, style_tokens: 2 },
      "EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')", [eventId]),
    db.prepare(`UPDATE telegram_pet_profiles SET
        pet_xp = ?,
        level = ?,
        stage = ?,
        streak_days = ?,
        last_active_day = ?,
        last_decay_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')`)
      .bind(pet.pet_xp, getPetLevel(pet.pet_xp), getPetGrowthStage(pet.pet_xp), pet.streak_days, pet.last_active_day, pet.last_decay_at, telegramId, eventId),
    db.prepare(`UPDATE telegram_pet_instances SET
        pet_xp = ?,
        level = ?,
        stage = ?,
        streak_days = ?,
        last_active_day = ?,
        last_decay_at = ?,
        source_profile_updated_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND pet_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')`)
      .bind(pet.pet_xp, getPetLevel(pet.pet_xp), getPetGrowthStage(pet.pet_xp), pet.streak_days, pet.last_active_day, pet.last_decay_at,
        PET_INSTANCE_AUTHORITY_VERSION, telegramId, pet.pet_id || '', eventId),
    db.prepare(`INSERT INTO telegram_pet_season_state
        (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET
        season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key,
        weekly_key = excluded.weekly_key,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey, eventId),
    db.prepare(`UPDATE telegram_pet_events
      SET status = 'accepted', reason = 'daily_chest'
      WHERE id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ? AND pet_xp = ?)
        AND (
          pet_id IS NULL OR EXISTS (
            SELECT 1 FROM telegram_pet_instances WHERE pet_id = telegram_pet_events.pet_id AND telegram_id = ? AND pet_xp = ?
          )
        )
      RETURNING id`)
      .bind(eventId, telegramId, pet.pet_xp, telegramId, pet.pet_xp),
  ]);
  if (!chestResults?.[5]?.results?.[0]) {
    pet.pet_xp = startingPetXp;
    const acceptedDuplicate = await buildAcceptedPetEventDuplicate(db, telegramId, eventKey, pet);
    if (acceptedDuplicate) return acceptedDuplicate;
    return { accepted: false, reason: 'daily_claimed', pet };
  }
  const persistedPet = await getPetProfile(db, telegramId);
  if (persistedPet) Object.assign(persistedPet, await readPetAccountWallet(db, telegramId) || {});
  return { accepted: true, reason: 'daily_chest', xp_awarded: 0, pet_xp_awarded: petXp, pet: persistedPet || pet };
}

async function processPetRandomEvent(db, telegramId, choiceRaw, options = {}) {
  const requestedChoice = normalizePetRandomEventChoice(choiceRaw);
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
  const encounter = resolvePetRandomEncounter(options.event_key || options.encounter_key || options.eventKey) || options.encounter || selectPetRandomEncounter(identity);
  if (!encounter) return { accepted: false, reason: 'event_unavailable', xp_awarded: 0, pet_xp_awarded: 0 };
  const evolutionStage = Math.max(0, Math.floor(Number(identity?.current_stage?.stage) || 0));
  if (evolutionStage < Math.max(0, Number(encounter.min_evolution_stage) || 0)) return { accepted: false, reason: 'event_locked', encounter, xp_awarded: 0, pet_xp_awarded: 0 };
  const legacyChoiceIndex = { open: 0, sell: 1, ignore: 2 }[requestedChoice];
  const choice = legacyChoiceIndex !== undefined
    ? encounter.choices[legacyChoiceIndex] || encounter.choices[0]
    : encounter.choices.find((entry) => entry.key === requestedChoice) || null;
  if (!choice) return { accepted: false, reason: 'invalid_event_choice', encounter, xp_awarded: 0, pet_xp_awarded: 0 };
  const eventKey = String(options.event_key || encounter.event_key || `${encounter.key}-${Date.now().toString(36)}`).slice(0, 120);
  const duplicate = await db.prepare(`
    SELECT id, status, reason, day_key, week_key, season_key
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?
  `).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate && duplicate.status !== 'pending') return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfileWithAtomicDecay(db, telegramId, now);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const reservation = await reservePetRepeatRewardEvent(db, {
    telegram_id: telegramId,
    event_type: 'random_event',
    event_key: eventKey,
    season_key: season.key,
    day_key: dayKey,
    week_key: weekKey,
    mode: 'event',
    source: options.source || 'telegram_bot',
    existing_event: duplicate,
  });
  if (!reservation.claimed) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };

  // The recoverable numbered slot is transactionally reserved before any reward amount is rolled.
  const rewardSlot = reservation;
  const accountingDayKey = rewardSlot.day_key;
  const accountingWeekKey = rewardSlot.week_key;
  const accountingSeasonKey = rewardSlot.season_key;
  const outcome = pickPetRandomEventOutcome(choice);
  const scaledRewards = scalePetRewards(outcome.rewards, rewardSlot.multiplier);
  const rewardsApplied = Object.fromEntries(Object.entries(scaledRewards).map(([key, value]) => [key, Math.max(0, rollPetRange(value, 0))]));
  const costsApplied = Object.fromEntries(Object.entries(outcome.costs || {}).map(([key, value]) => [key, Math.max(0, Math.abs(rollPetRange(value, 0)))]));
  const rewardValue = (key) => Math.max(0, Math.floor(Number(rewardsApplied[key] || 0)));
  const costValue = (key) => Math.max(0, Math.floor(Number(costsApplied[key] || 0)));
  const profileDeltas = buildPetProfileDeltas(rewardsApplied, costsApplied);
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_event', idempotency_key: eventKey, event_key: eventKey,
    event_type: 'random_event', reason: `${encounter.key}:${choice.key}:${outcome.kind}`,
    reservation_id: reservation.reservation_id, rewards: rewardsApplied, currency_costs: costsApplied,
    profile_deltas: profileDeltas, touch_streak: true, now, day_key: accountingDayKey, week_key: accountingWeekKey, season_key: accountingSeasonKey,
    context: { source: options.source || 'telegram_bot', encounter_key: encounter.key, choice_key: choice.key, result_kind: outcome.kind, reward_slot: rewardSlot.claimed_slot, reward_multiplier: rewardSlot.multiplier, copy: outcome.copy },
  });
  if (awarded.accepted) {
    await recordMoonpetBehaviour(db, { telegram_id: telegramId, event_key: `${eventKey}:personality`, behaviour: 'event', activity: 'event' });
    await recordMoonpetBiggestReward(db, { telegram_id: telegramId, reward_amount: awarded.rewards?.moon_gold, reward_currency: 'moon_gold' });
  }
  if (awarded.duplicate) return { ...awarded, reason: 'duplicate', encounter, choice };
  const petXpAwarded = awarded.pet_xp_awarded;
  rewardsApplied.pet_xp = petXpAwarded;
  const deltas = {};
  for (const key of new Set([...Object.keys(rewardsApplied), ...Object.keys(costsApplied)])) {
    deltas[key] = key === 'hunger' ? costValue(key) - rewardValue(key) : rewardValue(key) - costValue(key);
  }
  deltas.pet_xp = petXpAwarded;
  const applied = { rewardsApplied, costsApplied, deltas };
  const updatedPet = await getPetProfile(db, telegramId);
  return {
    ...awarded,
    reason: `${encounter.key}:${choice.key}`,
    encounter,
    choice,
    result_copy: outcome.copy,
    applied,
    reward_slot: rewardSlot.claimed_slot,
    reward_multiplier: rewardSlot.multiplier,
    accounting_window: { day_key: accountingDayKey, week_key: accountingWeekKey, season_key: accountingSeasonKey },
    pet: updatedPet,
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
  await reconcilePetInstanceWalletToProfile(db, telegramId);
  const instance = await readActivePetInstance(db, telegramId);
  const profile = await db.prepare(`
    SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?
  `).bind(telegramId).first().catch(() => null);
  if (!instance) return profile ? applyPetDecay(profile) : null;
  const walletFields = profile ? pickPetAccountWallet(profile) : {};

  if (profile && petStateColumnsDiffer(profile, instance)) {
    const profileUpdatedAt = petStateTimestamp(profile.updated_at);
    const instanceProfileVersion = petStateTimestamp(instance.source_profile_updated_at);
    const instanceUpdatedAt = petStateTimestamp(instance.updated_at);
    const hasInstanceAuthority = instance.source_profile_updated_at === PET_INSTANCE_AUTHORITY_VERSION;
    if (hasInstanceAuthority) {
      await mirrorActivePetOwnedStateToProfile(db, instance);
      return applyPetDecay({ ...instance, ...walletFields });
    }
    const profileIsNewer = !hasInstanceAuthority && (profileUpdatedAt > instanceProfileVersion
      || (profileUpdatedAt === instanceProfileVersion && instanceUpdatedAt <= instanceProfileVersion));
    if (profileIsNewer) {
      await writeActivePetInstance(db, telegramId, profile);
      return applyPetDecay({ ...instance, ...profile, ...walletFields, pet_id: instance.pet_id });
    }
    await mirrorActivePetInstanceToProfile(db, instance);
  }
  return applyPetDecay({ ...instance, ...walletFields });
}

async function getPetProfileWithAtomicDecay(db, telegramId, now = new Date()) {
  // Reconcile any legacy profile-only write before choosing the atomic decay target.
  await getPetProfile(db, telegramId);
  const instance = await readActivePetInstance(db, telegramId);
  if (instance) {
    const current = await getPetInstanceWithAtomicDecay(db, instance.pet_id, now);
    if (current) await mirrorActivePetInstanceToProfile(db, current);
    const wallet = await readPetAccountWallet(db, telegramId);
    const walletFields = wallet || {};
    return current ? { ...current, ...walletFields } : current;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await db.prepare(`SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?`).bind(telegramId).first().catch(() => null);
    if (!stored) return null;
    const priorDecayAt = stored.last_decay_at;
    const decayed = applyPetDecay({ ...stored }, now);
    if (decayed.last_decay_at === priorDecayAt) return decayed;
    const syncedAt = formatPetStateTimestamp(now);
    const sync = await db.prepare(`
      UPDATE telegram_pet_profiles
      SET hunger = ?, happiness = ?, cleanliness = ?, energy = ?, health = ?,
          last_decay_at = ?, updated_at = ?
      WHERE telegram_id = ? AND last_decay_at = ?
    `).bind(
      clampPetStat(decayed.hunger),
      clampPetStat(decayed.happiness),
      clampPetStat(decayed.cleanliness),
      clampPetStat(decayed.energy),
      clampPetStat(decayed.health),
      decayed.last_decay_at,
      syncedAt,
      telegramId,
      priorDecayAt,
    ).run();
    if (Number(sync?.meta?.changes || 0) === 1) return decayed;
  }
  throw new Error('pet_decay_sync_conflict');
}

async function getPetInstanceWithAtomicDecay(db, petId, now = new Date()) {
  const normalizedPetId = String(petId || '').trim();
  if (!normalizedPetId) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await db.prepare(`SELECT * FROM telegram_pet_instances WHERE pet_id = ? LIMIT 1`).bind(normalizedPetId).first().catch(() => null);
    if (!stored) return null;
    const priorDecayAt = stored.last_decay_at;
    const decayed = applyPetDecay({ ...stored }, now);
    if (decayed.last_decay_at === priorDecayAt) return decayed;
    const syncedAt = formatPetStateTimestamp(now);
    const sync = await db.prepare(`
      UPDATE telegram_pet_instances
      SET hunger = ?, happiness = ?, cleanliness = ?, energy = ?, health = ?,
          last_decay_at = ?, updated_at = ?
      WHERE pet_id = ? AND last_decay_at = ?
    `).bind(
      clampPetStat(decayed.hunger),
      clampPetStat(decayed.happiness),
      clampPetStat(decayed.cleanliness),
      clampPetStat(decayed.energy),
      clampPetStat(decayed.health),
      decayed.last_decay_at,
      syncedAt,
      normalizedPetId,
      priorDecayAt,
    ).run();
    if (Number(sync?.meta?.changes || 0) !== 1) continue;
    return { ...stored, ...decayed, updated_at: syncedAt, source_profile_updated_at: syncedAt };
  }
  throw new Error('pet_decay_sync_conflict');
}

const PET_INSTANCE_STATE_COLUMNS = Object.freeze([
  'pet_name', 'species', 'stage', 'pet_xp', 'level', 'hunger', 'happiness',
  'cleanliness', 'energy', 'health', 'streak_days', 'equipped_food', 'equipped_toy', 'equipped_outfit',
  'equipped_armor', 'equipped_weapon', 'equipped_charm', 'last_active_day',
  'last_decay_at',
]);
const PET_ACCOUNT_WALLET_COLUMNS = Object.freeze(['moon_gold', 'moon_crystals', 'style_tokens']);
function isPetInstanceSchemaUnavailable(error) {
  return /no such table: telegram_pet_(instances|season_slots|active_slots)/i.test(String(error?.message || error));
}

function petStateTimestamp(value) {
  if (!value) return 0;
  const normalizedValue = String(value).trim();
  const zoned = normalizedValue.includes('T') ? normalizedValue : `${normalizedValue.replace(' ', 'T')}Z`;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(zoned)
    ? zoned.replace(/\.\d+(?=(Z|[+-]\d\d:\d\d)$)/, '$1')
    : `${zoned.replace(/\.\d+$/, '')}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatPetStateTimestamp(value = new Date()) {
  const timestamp = value instanceof Date ? value.getTime() : petStateTimestamp(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return new Date(Math.floor(timestamp / 1000) * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function petStateColumnsDiffer(left, right) {
  return PET_INSTANCE_STATE_COLUMNS.some((column) => (left?.[column] ?? null) !== (right?.[column] ?? null));
}

function pickPetAccountWallet(row) {
  return Object.fromEntries(PET_ACCOUNT_WALLET_COLUMNS.map((column) => [column, clampPetCurrency(row?.[column])]));
}

async function readPetAccountWallet(db, telegramId) {
  const profile = await db.prepare(`SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id = ?`)
    .bind(telegramId).first().catch(() => null);
  return profile ? pickPetAccountWallet(profile) : null;
}

async function readAcceptedPetEventByKey(db, telegramId, eventKey) {
  return db.prepare(`
    SELECT id, pet_id, event_type, event_key, status, reason, xp_awarded, pet_xp_awarded, day_key, metadata
    FROM telegram_pet_events
    WHERE telegram_id = ? AND event_key = ? AND status = 'accepted'
    LIMIT 1
  `).bind(telegramId, eventKey).first().catch(() => null);
}

async function buildAcceptedPetEventDuplicate(db, telegramId, eventKey, pet, extra = {}) {
  const acceptedEvent = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (!acceptedEvent) return null;
  const currentPet = pet ? await getPetProfile(db, telegramId).catch(() => null) : null;
  const resultPet = currentPet || pet;
  const wallet = await readPetAccountWallet(db, telegramId);
  if (wallet && resultPet) Object.assign(resultPet, wallet);
  return {
    accepted: true,
    duplicate: true,
    reason: 'duplicate',
    xp_awarded: Math.max(0, Math.floor(Number(acceptedEvent.xp_awarded || 0))),
    pet_xp_awarded: Math.max(0, Math.floor(Number(acceptedEvent.pet_xp_awarded || 0))),
    ...extra,
    ...(resultPet ? { pet: resultPet } : {}),
  };
}

function normalizePetAccountWalletDelta(deltas = {}) {
  const moonGoldDelta = Math.trunc(Number(deltas.moon_gold ?? deltas.moonGoldDelta ?? 0) || 0);
  const moonCrystalsDelta = Math.trunc(Number(deltas.moon_crystals ?? deltas.moonCrystalsDelta ?? 0) || 0);
  const styleTokensDelta = Math.trunc(Number(deltas.style_tokens ?? deltas.styleTokensDelta ?? 0) || 0);
  return { moonGoldDelta, moonCrystalsDelta, styleTokensDelta };
}

function accountWalletAffordabilitySql() {
  return `moon_gold + ? >= 0 AND moon_crystals + ? >= 0 AND style_tokens + ? >= 0`;
}

function hasPetAccountWalletDelta(deltas = {}) {
  const { moonGoldDelta, moonCrystalsDelta, styleTokensDelta } = normalizePetAccountWalletDelta(deltas);
  return Boolean(moonGoldDelta || moonCrystalsDelta || styleTokensDelta);
}

function accountWalletDeltaStatement(db, telegramId, deltas = {}, receiptExistsSql = '1 = 1', receiptArgs = []) {
  const { moonGoldDelta, moonCrystalsDelta, styleTokensDelta } = normalizePetAccountWalletDelta(deltas);
  return db.prepare(`
    UPDATE telegram_pet_profiles
    SET moon_gold = MIN(999999, MAX(0, moon_gold + ?)),
        moon_crystals = MIN(999999, MAX(0, moon_crystals + ?)),
        style_tokens = MIN(999999, MAX(0, style_tokens + ?))
    WHERE telegram_id = ?
      AND ${accountWalletAffordabilitySql()}
      AND ${accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id')}
      AND ${receiptExistsSql}
  `).bind(moonGoldDelta, moonCrystalsDelta, styleTokensDelta, telegramId, moonGoldDelta, moonCrystalsDelta, styleTokensDelta, ...receiptArgs);
}

async function applyPetAccountWalletDelta(db, telegramId, deltas = {}) {
  const owner = String(telegramId || '').trim();
  if (!owner) return null;
  const { moonGoldDelta, moonCrystalsDelta, styleTokensDelta } = normalizePetAccountWalletDelta(deltas);
  if (!moonGoldDelta && !moonCrystalsDelta && !styleTokensDelta) return readPetAccountWallet(db, owner);
  const result = await accountWalletDeltaStatement(db, owner, deltas).run();
  if (Number(result?.meta?.changes || 0) !== 1) return null;
  return readPetAccountWallet(db, owner);
}

async function findActivePetSlot(db, telegramId) {
  try {
    return await db.prepare(`
      SELECT s.pet_id, s.telegram_id, s.season_key, s.slot_number, s.status, s.acquisition_type
      FROM telegram_pet_active_slots a
      JOIN telegram_pet_season_slots s
        ON s.pet_id = a.pet_id AND s.telegram_id = a.telegram_id AND s.season_key = a.season_key
      JOIN telegram_pet_instances i
        ON i.pet_id = s.pet_id AND i.telegram_id = s.telegram_id
       AND i.season_key = s.season_key AND i.slot_number = s.slot_number
      WHERE a.telegram_id = ? AND s.status = 'active' AND i.status = 'active'
      LIMIT 1
    `).bind(String(telegramId)).first();
  } catch (error) {
    if (isPetInstanceSchemaUnavailable(error)) return null;
    throw error;
  }
}

async function finalizeActivePetEvolutionProgress(db, telegramId) {
  try {
    const active = await findActivePetSlot(db, telegramId);
    if (!active) return null;
    await reconcileEvolutionGrowthMarks(db, active.pet_id, active.season_key);
    return true;
  } catch (error) {
    return null;
  }
}

async function ensureActivePetInstance(db, telegramId) {
  const slot = await findActivePetSlot(db, telegramId);
  if (slot) return db.prepare(`SELECT * FROM telegram_pet_instances WHERE pet_id = ? LIMIT 1`).bind(slot.pet_id).first();
  // Migration-safe repair is deliberately limited to the free starter. A paid
  // slot with a missing instance must never be synthesized from the active pet.
  let starter;
  try {
    starter = await db.prepare(`SELECT s.* FROM telegram_pet_active_slots a
      JOIN telegram_pet_season_slots s ON s.pet_id=a.pet_id AND s.telegram_id=a.telegram_id AND s.season_key=a.season_key
      WHERE a.telegram_id=? AND s.slot_number=1 AND s.acquisition_type='free' AND s.status='active' LIMIT 1`)
      .bind(String(telegramId)).first();
    if (!starter) return null;
    await db.prepare(`
      INSERT OR IGNORE INTO telegram_pet_instances (
        pet_id, telegram_id, season_key, slot_number, pet_name, species, stage,
        pet_xp, level, hunger, happiness, cleanliness, energy, health, streak_days,
        moon_gold, moon_crystals, style_tokens, equipped_food, equipped_toy,
        equipped_outfit, equipped_armor, equipped_weapon, equipped_charm, status,
        last_active_day, last_decay_at, source_profile_updated_at, created_at, updated_at
      )
      SELECT ?, p.telegram_id, ?, ?, p.pet_name, p.species, p.stage, p.pet_xp, p.level,
        p.hunger, p.happiness, p.cleanliness, p.energy, p.health, p.streak_days,
        p.moon_gold, p.moon_crystals, p.style_tokens, p.equipped_food, p.equipped_toy,
        p.equipped_outfit, p.equipped_armor, p.equipped_weapon, p.equipped_charm,
        'active', p.last_active_day, p.last_decay_at, p.updated_at, p.created_at, p.updated_at
      FROM telegram_pet_profiles p WHERE p.telegram_id = ?
    `).bind(starter.pet_id, starter.season_key, starter.slot_number, String(telegramId)).run();
    return await db.prepare(`SELECT * FROM telegram_pet_instances WHERE pet_id = ? LIMIT 1`).bind(starter.pet_id).first();
  } catch (error) {
    if (isPetInstanceSchemaUnavailable(error)) return null;
    throw error;
  }
}

async function readActivePetInstance(db, telegramId) {
  return ensureActivePetInstance(db, telegramId);
}

async function writeActivePetInstance(db, telegramId, pet) {
  const instance = await ensureActivePetInstance(db, telegramId);
  if (!instance) return false;
  const assignments = PET_INSTANCE_STATE_COLUMNS.map((column) => `${column} = ?`).join(', ');
  const syncedAt = formatPetStateTimestamp(pet?.source_profile_updated_at || pet?.updated_at);
  await db.prepare(`UPDATE telegram_pet_instances SET ${assignments}, source_profile_updated_at = ?, updated_at = ? WHERE pet_id = ?`)
    .bind(...PET_INSTANCE_STATE_COLUMNS.map((column) => pet[column] ?? null), syncedAt, syncedAt, instance.pet_id).run();
  return true;
}

async function mirrorActivePetInstanceToProfile(db, pet) {
  const profile = await db.prepare(`SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?`).bind(pet.telegram_id).first().catch(() => null);
  if (!profile || !petStateColumnsDiffer(profile, pet)) return false;
  const assignments = PET_INSTANCE_STATE_COLUMNS.map((column) => `${column} = ?`).join(', ');
  const mirroredAt = formatPetStateTimestamp(pet.updated_at || pet.source_profile_updated_at);
  await db.prepare(`UPDATE telegram_pet_profiles SET ${assignments}, updated_at = ? WHERE telegram_id = ?`)
    .bind(...PET_INSTANCE_STATE_COLUMNS.map((column) => pet[column] ?? null), mirroredAt, pet.telegram_id).run();
  await db.prepare(`UPDATE telegram_pet_instances SET source_profile_updated_at = ? WHERE pet_id = ?`)
    .bind(mirroredAt, pet.pet_id).run();
  return true;
}

async function mirrorActivePetOwnedStateToProfile(db, pet) {
  const profile = await db.prepare(`SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?`).bind(pet.telegram_id).first().catch(() => null);
  if (!profile || !petStateColumnsDiffer(profile, pet)) return false;
  const assignments = PET_INSTANCE_STATE_COLUMNS.map((column) => `${column} = ?`).join(', ');
  // This is only a compatibility mirror so profile-only reward code can start
  // from the active sentinel pet state. Do not bump updated_at: that timestamp
  // is used for profile-vs-instance freshness and would let one pet's mirror
  // overwrite another active pet after a switch.
  await db.prepare(`UPDATE telegram_pet_profiles SET ${assignments} WHERE telegram_id = ?`)
    .bind(...PET_INSTANCE_STATE_COLUMNS.map((column) => pet[column] ?? null), pet.telegram_id).run();
  return true;
}

async function mirrorPetProfileToActiveInstance(db, telegramId) {
  const profile = await db.prepare(`SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?`).bind(telegramId).first().catch(() => null);
  return profile ? writeActivePetInstance(db, telegramId, profile) : false;
}

async function awardPetReward(db, options) {
  const owner = String(options?.telegram_id || '').trim();
  if (String(options?.pet_id || '').trim()) {
    if (hasPetAccountWalletDelta(options?.rewards) || hasPetAccountWalletDelta(options?.currency_costs)) {
      const pet = await getPetInstanceWithAtomicDecay(db, String(options.pet_id).trim()).catch(() => null);
      if (!(await ensurePetAccountWalletReadyForMutation(db, owner))) {
        return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', pet, xp_awarded: 0, pet_xp_awarded: 0 };
      }
    }
    return awardLegacyPetReward(db, options);
  }
  const pet = await getPetProfile(db, owner);
  if ((hasPetAccountWalletDelta(options?.rewards) || hasPetAccountWalletDelta(options?.currency_costs))
    && !(await ensurePetAccountWalletReadyForMutation(db, owner))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const result = await awardLegacyPetReward(db, options);
  await mirrorPetProfileToActiveInstance(db, owner);
  if (result?.pet) result.pet = await getPetProfile(db, owner);
  return result;
}

async function getPetActiveSlotPendingWork(db, telegramId, now = new Date()) {
  const owner = String(telegramId || '').trim();
  if (!owner) return null;
  const [activity, pendingClaim] = await Promise.all([
    getActivePetActivitySession(db, owner, now),
    getRecoverablePetActivitySession(db, owner),
  ]);
  const blockingActivity = activity || pendingClaim;
  if (blockingActivity) return { reason: 'pet_activity_active', activity: blockingActivity };
  // Other owner-scoped in-flight systems also settle rewards through the active
  // pet. Until those tables carry pet_id, keep the pointer stable while pending.
  const pendingSystems = [
    ['pet_run_active', `SELECT run_id AS id FROM telegram_pet_runs WHERE telegram_id=? AND status='active' LIMIT 1`],
    ['pet_arena_active', `SELECT battle_id AS id FROM telegram_pet_arena_battles WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired') LIMIT 1`],
    ['pet_kaiju_active', `SELECT match_id AS id FROM telegram_pet_kaiju_matches WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired') LIMIT 1`],
  ];
  for (const [reason, sql] of pendingSystems) {
    const bindings = (reason === 'pet_arena_active' || reason === 'pet_kaiju_active') ? [owner, owner] : [owner];
    const pending = await db.prepare(sql).bind(...bindings).first().catch(() => null);
    if (pending) return { reason, pending };
  }
  return null;
}

async function ensurePetStarterSeasonSlot(db, telegramId, now = new Date()) {
  const normalizedTelegramId = String(telegramId || '').trim();
  if (!normalizedTelegramId) return { ok: false, reason: 'missing_telegram_id' };
  const seasonKey = getPetSeasonInfo(now).key;
  const petId = `pet:${normalizedTelegramId}:${seasonKey}:1`;
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO telegram_pet_season_slots
        (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
      SELECT ?, telegram_id, ?, 1, 'free', 'profile_insert', 0, 'active'
      FROM telegram_pet_profiles
      WHERE telegram_id = ?
    `).bind(petId, seasonKey, normalizedTelegramId).run();

    await db.prepare(`
      INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
      SELECT telegram_id, pet_id, season_key
      FROM telegram_pet_season_slots
      WHERE telegram_id = ? AND season_key = ? AND slot_number = 1 AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
      ON CONFLICT(telegram_id) DO UPDATE SET
        pet_id = excluded.pet_id,
        season_key = excluded.season_key,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_pet_active_slots.season_key <> excluded.season_key
    `).bind(normalizedTelegramId, seasonKey).run();

    return { ok: true, pet_id: petId, season_key: seasonKey };
  } catch (error) {
    if (/no such table: telegram_pet_(season|active)_slots/i.test(String(error?.message || error))) {
      return { ok: false, reason: 'season_slots_unavailable' };
    }
    throw error;
  }
}

async function preparePetMiniAppState(db, telegramId, now = new Date()) {
  const owner = String(telegramId || '').trim();
  if (!owner) return false;
  const adopted = await db.prepare(`SELECT telegram_id FROM telegram_pet_profiles WHERE telegram_id = ? LIMIT 1`)
    .bind(owner).first().catch(() => null);
  if (!adopted) return false;
  const outgoing = await findActivePetSlot(db, owner);
  const currentSeason = getPetSeasonInfo(now);
  const isRollover = Boolean(outgoing && outgoing.season_key !== currentSeason.key);
  // Reconcile while the outgoing pointer still owns the compatibility profile.
  // Once the pointer advances, that association can no longer be recovered.
  if (outgoing) await getPetProfile(db, owner);
  if (isRollover && await getPetActiveSlotPendingWork(db, owner, now)) return true;
  const starter = await ensurePetStarterSeasonSlot(db, owner, now);
  if (!starter.ok) return false;
  if (isRollover) {
    // A new season starts a new pet. Never seed it from the outgoing pet's
    // compatibility mirror; instance defaults are the authoritative baseline.
    await db.prepare(`INSERT OR IGNORE INTO telegram_pet_instances
      (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`)
      .bind(starter.pet_id, owner, starter.season_key).run();
    await db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_by_pet
      (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
      VALUES (?, ?, ?, 'egg', '{}', '[]')`)
      .bind(starter.pet_id, owner, crypto.randomUUID()).run();
  }
  const active = await ensureActivePetInstance(db, owner);
  if (isRollover && active) await mirrorActivePetInstanceToProfile(db, active);
  return true;
}

const PET_SEASON_EXTRA_SLOT_COSTS = Object.freeze({
  2: 500,
  3: 1000,
});
const PET_SEASON_MAX_SLOTS = 3;

function serializePetSeasonSlot(row, slotNumber, activePetId, arcadeXpAvailable = 0, previousSlotOwned = true) {
  const cost = Number(PET_SEASON_EXTRA_SLOT_COSTS[slotNumber] || 0);
  const unlocked = Boolean(row);
  const lockedByPrevious = !unlocked && slotNumber > 1 && !previousSlotOwned;
  return {
    slot_number: slotNumber,
    pet_id: row?.pet_id || null,
    status: row?.status || 'locked',
    acquisition_type: row?.acquisition_type || null,
    source_event_key: row?.source_event_key || null,
    arcade_xp_spent: Number(row?.arcade_xp_spent || 0),
    active: unlocked && String(row.pet_id) === String(activePetId || ''),
    unlocked,
    unlock_cost_arcade_xp: unlocked ? 0 : cost,
    arcade_xp_available: Math.max(0, Number(arcadeXpAvailable || 0)),
    purchase_enabled: !unlocked && slotNumber > 1 && !lockedByPrevious,
    purchase_disabled_reason: lockedByPrevious ? 'previous_pet_slot_required' : null,
    affordable: !unlocked && slotNumber > 1 && !lockedByPrevious && arcadeXpAvailable >= cost,
    pet: unlocked ? {
      name: row?.pet_name || 'Moonpet',
      species: row?.lifecycle_species_id || row?.species || '',
      variant: row?.rare_morph_id || null,
      stage: row?.lifecycle_phase || row?.stage || 'egg',
      level: Math.max(1, Number(row?.level || 1)),
      pet_xp: Math.max(0, Number(row?.pet_xp || 0)),
      health: clampPetStat(Number(row?.health == null ? 75 : row.health)),
      energy: clampPetStat(Number(row?.energy == null ? 70 : row.energy)),
      hunger: clampPetStat(Number(row?.hunger == null ? 25 : row.hunger)),
      happiness: clampPetStat(Number(row?.happiness == null ? 70 : row.happiness)),
      cleanliness: clampPetStat(Number(row?.cleanliness == null ? 70 : row.cleanliness)),
      progression: row?.progression || null,
    } : null,
  };
}

function mergePetInstanceDisplayFields(slotRow, petInstance) {
  if (!petInstance) return slotRow;
  // Slot ownership/status fields remain authoritative on slotRow. Never spread
  // a complete telegram_pet_instances row into this roster projection.
  return {
    ...slotRow,
    pet_name: petInstance.pet_name,
    species: petInstance.species,
    stage: petInstance.stage,
    level: petInstance.level,
    pet_xp: petInstance.pet_xp,
    health: petInstance.health,
    energy: petInstance.energy,
    hunger: petInstance.hunger,
    happiness: petInstance.happiness,
    cleanliness: petInstance.cleanliness,
  };
}

async function buildPetSeasonSlotSummary(db, telegramId, now = new Date()) {
  const normalizedTelegramId = String(telegramId || '').trim();
  if (!normalizedTelegramId) return { adopted: false, reason: 'missing_telegram_id' };
  const pet = await db.prepare(`SELECT telegram_id FROM telegram_pet_profiles WHERE telegram_id = ? LIMIT 1`)
    .bind(normalizedTelegramId).first().catch(() => null);
  if (!pet) {
    return {
      adopted: false,
      season: getPetSeasonInfo(now),
      max_slots: PET_SEASON_MAX_SLOTS,
      active_pet_id: null,
      arcade_xp_available: 0,
      arcade_xp_lifetime: 0,
      arcade_xp_spendable: 0,
      arcade_xp_spent: 0,
      next_slot_cost: 0,
      can_buy_next_slot: false,
      purchase_enabled: true,
      purchase_disabled_reason: null,
      slots: [],
    };
  }
  const season = getPetSeasonInfo(now);
  try {
    const [slotRows, activeSlot, arcade, wallet] = await Promise.all([
      db.prepare(`
        SELECT s.pet_id, s.telegram_id, s.season_key, s.slot_number, s.acquisition_type,
          s.source_event_key, s.arcade_xp_spent, s.status, s.created_at, s.updated_at,
          i.pet_name, i.species, i.stage, i.level, i.pet_xp, i.health, i.energy,
          i.hunger, i.happiness, i.cleanliness, i.last_decay_at, l.phase AS lifecycle_phase,
          l.species_id AS lifecycle_species_id, l.rare_morph_id
        FROM telegram_pet_season_slots s
        LEFT JOIN telegram_pet_instances i
          ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id
        LEFT JOIN telegram_pet_lifecycle_by_pet l
          ON l.pet_id=s.pet_id AND l.telegram_id=s.telegram_id
        WHERE s.telegram_id = ? AND s.season_key = ?
        ORDER BY s.slot_number ASC
      `).bind(normalizedTelegramId, season.key).all(),
      db.prepare(`
        SELECT pet_id, season_key FROM telegram_pet_active_slots
        WHERE telegram_id = ? LIMIT 1
      `).bind(normalizedTelegramId).first().catch(() => null),
      db.prepare(`SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ? LIMIT 1`)
        .bind(normalizedTelegramId).first().catch(() => null),
      db.prepare(`SELECT arcade_xp_spendable, arcade_xp_spent FROM arcade_xp_wallets WHERE telegram_id = ? LIMIT 1`)
        .bind(normalizedTelegramId).first().catch(() => null),
    ]);
    const rawRows = slotRows.results || [];
    const rawRowsBySlot = new Map(rawRows.map((row) => [Number(row.slot_number), row]));
    const activePetId = activeSlot?.season_key === season.key ? activeSlot.pet_id : rawRowsBySlot.get(1)?.pet_id || null;
    // This endpoint is a read-only display projection. Preview canonical decay
    // in memory; gameplay/switch paths persist decay against the pet instance.
    const progressionRows = await Promise.all(rawRows.map(async (row) => ({
      ...row,
      progression: await evaluatePetSeasonCompletion(db, row.pet_id, row.season_key, now, { telegram_id: normalizedTelegramId, season_week: getPetSeasonWeek(season, now) }).catch(() => null),
    })));
    const currentRows = progressionRows.map((row) => mergePetInstanceDisplayFields(row, applyPetDecay({ ...row }, now)));
    const rowsBySlot = new Map(currentRows.map((row) => [Number(row.slot_number), row]));
    const arcadeXpLifetime = Math.max(0, Number(arcade?.arcade_xp_total || 0));
    const arcadeXpAvailable = Math.max(0, Number(wallet?.arcade_xp_spendable || 0));
    const arcadeXpSpent = Math.max(0, Number(wallet?.arcade_xp_spent || 0));
    const nextSlotNumber = Math.min(PET_SEASON_MAX_SLOTS + 1, rawRows.length + 1);
    const nextSlotCost = Number(PET_SEASON_EXTRA_SLOT_COSTS[nextSlotNumber] || 0);
    const previousSlotOwned = nextSlotNumber <= 1 ? true : rawRowsBySlot.has(nextSlotNumber - 1);
    return {
      adopted: true,
      season,
      current_season_week: getPetSeasonWeek(season, now),
      max_slots: PET_SEASON_MAX_SLOTS,
      active_pet_id: activePetId,
      arcade_xp_available: arcadeXpAvailable,
      arcade_xp_lifetime: arcadeXpLifetime,
      arcade_xp_spendable: arcadeXpAvailable,
      arcade_xp_spent: arcadeXpSpent,
      next_slot_cost: nextSlotCost,
      can_buy_next_slot: nextSlotNumber <= PET_SEASON_MAX_SLOTS && previousSlotOwned && arcadeXpAvailable >= nextSlotCost,
      purchase_enabled: true,
      purchase_disabled_reason: null,
      slots: Array.from({ length: PET_SEASON_MAX_SLOTS }, (_, index) => {
        const slotNumber = index + 1;
        const previousOwned = slotNumber <= 1 ? true : rowsBySlot.has(slotNumber - 1);
        return serializePetSeasonSlot(rowsBySlot.get(slotNumber), slotNumber, activePetId, arcadeXpAvailable, previousOwned);
      }),
    };
  } catch (error) {
    if (/no such table: telegram_pet_(season|active)_slots/i.test(String(error?.message || error))) {
      return {
        adopted: true,
        season,
        max_slots: PET_SEASON_MAX_SLOTS,
        active_pet_id: null,
        arcade_xp_available: 0,
        arcade_xp_lifetime: 0,
        arcade_xp_spendable: 0,
        arcade_xp_spent: 0,
        next_slot_cost: 0,
        can_buy_next_slot: false,
        purchase_enabled: false,
        purchase_disabled_reason: 'season_slots_unavailable',
        slots: [],
        unavailable: true,
      };
    }
    throw error;
  }
}

async function buyPetSeasonSlot(db, telegramId, requestedSlot, options = {}) {
  const slotNumber = Number(requestedSlot);
  if (!Number.isInteger(slotNumber) || slotNumber < 2 || slotNumber > PET_SEASON_MAX_SLOTS) {
    return { accepted: false, reason: 'invalid_pet_slot' };
  }
  const owner = String(telegramId);
  const season = getPetSeasonInfo(options.now || new Date());
  const cost = PET_SEASON_EXTRA_SLOT_COSTS[slotNumber];
  const petId = `pet:${owner}:${season.key}:${slotNumber}`;
  const profile = await db.prepare(`SELECT telegram_id FROM telegram_pet_profiles WHERE telegram_id=? LIMIT 1`).bind(owner).first().catch(() => null);
  if (!profile) return { accepted: false, reason: 'pet_not_adopted' };
  await ensurePetStarterSeasonSlot(db, owner, options.now || new Date());
  await getOrCreateArcadeProgressionState(db, owner);
  const existing = await db.prepare(`SELECT pet_id FROM telegram_pet_season_slots WHERE telegram_id=? AND season_key=? AND slot_number=? LIMIT 1`)
    .bind(owner, season.key, slotNumber).first();
  if (existing) return { accepted: false, reason: 'pet_slot_already_owned', season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };

  const previous = await db.prepare(`SELECT 1 AS owned FROM telegram_pet_season_slots WHERE telegram_id=? AND season_key=? AND slot_number=?`)
    .bind(owner, season.key, slotNumber - 1).first();
  if (!previous) return { accepted: false, reason: 'previous_pet_slot_required', season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };

  const eventKey = `pet_slot:${season.key}:${slotNumber}`;
  const statements = [
    db.prepare(`UPDATE arcade_xp_wallets SET arcade_xp_spendable=arcade_xp_spendable-?,
        arcade_xp_spent=arcade_xp_spent+?, updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND arcade_xp_spendable>=? AND NOT EXISTS (
        SELECT 1 FROM telegram_pet_season_slots WHERE telegram_id=? AND season_key=? AND slot_number=?)`)
      .bind(cost, cost, owner, cost, owner, season.key, slotNumber),
    db.prepare(`INSERT INTO telegram_pet_season_slots
      (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
      SELECT ?, ?, ?, ?, 'arcade_xp', ?, ?, 'active' WHERE changes()=1`)
      .bind(petId, owner, season.key, slotNumber, eventKey, cost),
    db.prepare(`INSERT INTO telegram_pet_instances
      (pet_id, telegram_id, season_key, slot_number, source_profile_updated_at)
      SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP WHERE changes()=1`)
      .bind(petId, owner, season.key, slotNumber),
    db.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet
      (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
      SELECT ?, ?, ?, 'egg', '{}', '[]' WHERE changes()=1`)
      .bind(petId, owner, crypto.randomUUID()),
  ];
  await db.batch(statements);
  const created = await db.prepare(`SELECT pet_id FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? LIMIT 1`).bind(petId, owner).first();
  if (!created) {
    const wallet = await db.prepare(`SELECT arcade_xp_spendable FROM arcade_xp_wallets WHERE telegram_id=?`).bind(owner).first().catch(() => null);
    const duplicate = await db.prepare(`SELECT 1 AS owned FROM telegram_pet_season_slots WHERE telegram_id=? AND season_key=? AND slot_number=?`).bind(owner, season.key, slotNumber).first();
    return { accepted: false, reason: duplicate ? 'pet_slot_creation_incomplete' : (Number(wallet?.arcade_xp_spendable || 0) < cost ? 'insufficient_arcade_xp' : 'pet_slot_purchase_conflict'), season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
  }
  if (options.switch_active) return switchActivePetSeasonSlot(db, owner, petId, { now: options.now });
  return { accepted: true, reason: 'pet_slot_purchased', pet: await getPetProfile(db, owner), season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
}

async function switchActivePetSeasonSlot(db, telegramId, requestedPetId, options = {}) {
  const owner = String(telegramId);
  const season = getPetSeasonInfo(options.now || new Date());
  const requested = /^\d+$/.test(String(requestedPetId || ''))
    ? `pet:${owner}:${season.key}:${Number(requestedPetId)}`
    : String(requestedPetId || '');
  const pendingWork = await getPetActiveSlotPendingWork(db, owner, options.now || new Date());
  if (pendingWork) return { accepted: false, ...pendingWork, season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
  const slot = await db.prepare(`SELECT s.pet_id FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key AND i.slot_number=s.slot_number
    WHERE s.pet_id=? AND s.telegram_id=? AND s.season_key=? AND s.status='active' AND i.status='active' LIMIT 1`)
    .bind(requested, owner, season.key).first().catch(() => null);
  if (!slot) return { accepted: false, reason: 'pet_slot_not_switchable', season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
  // Reconcile any newer compatibility-profile write onto the currently active
  // instance before moving the pointer. Otherwise selecting another pet could
  // strand or overwrite a same-second legacy gameplay mutation.
  await getPetProfile(db, owner);
  const switched = await db.prepare(`UPDATE telegram_pet_active_slots SET pet_id=?, season_key=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?`)
    .bind(slot.pet_id, season.key, owner).run();
  if (Number(switched?.meta?.changes || 0) !== 1) {
    return { accepted: false, reason: 'active_pet_pointer_missing', season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
  }
  const pet = await db.prepare(`SELECT * FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=?`).bind(slot.pet_id, owner).first();
  await mirrorActivePetInstanceToProfile(db, pet);
  return { accepted: true, reason: 'pet_slot_switched', pet: await getPetProfile(db, owner), season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
}

async function getOrCreatePetProfile(db, telegramId, options = {}) {
  let pet = await getPetProfile(db, telegramId);
  if (!pet) {
    const petName = normalizePetName(options.pet_name) || 'Moonpet';
    const species = normalizePetName(options.species) || '';
    await db.prepare(`
      INSERT INTO telegram_pet_profiles (telegram_id, pet_name, species)
      VALUES (?, ?, ?)
    `).bind(telegramId, petName, species).run();
    await ensurePetStarterSeasonSlot(db, telegramId);
    await ensureActivePetInstance(db, telegramId);
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
  pet.stage = getPetGrowthStage(pet.pet_xp);
  pet.health = calculatePetHealth(pet);
  const persistedAt = formatPetStateTimestamp();
  await db.prepare(`
    UPDATE telegram_pet_profiles
    SET pet_name = ?, species = ?, stage = ?, pet_xp = ?, level = ?,
        hunger = ?, happiness = ?, cleanliness = ?, energy = ?, health = ?,
        streak_days = ?, equipped_food = ?, equipped_toy = ?, equipped_outfit = ?,
        equipped_armor = ?, equipped_weapon = ?, equipped_charm = ?,
        last_active_day = ?, last_decay_at = ?, updated_at = ?
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
    pet.equipped_food || null,
    pet.equipped_toy || null,
    pet.equipped_outfit || null,
    pet.equipped_armor || null,
    pet.equipped_weapon || null,
    pet.equipped_charm || null,
    pet.last_active_day || null,
    pet.last_decay_at || new Date().toISOString(),
    persistedAt,
    pet.telegram_id,
  ).run();
  await writeActivePetInstance(db, pet.telegram_id, {
    ...pet,
    stage: pet.stage,
    level: getPetLevel(pet.pet_xp),
    health: clampPetStat(pet.health),
    updated_at: persistedAt,
    source_profile_updated_at: persistedAt,
  });
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

async function getPetDayXpTotal(db, petId, dayKey) {
  const row = await db.prepare(`SELECT COALESCE(SUM(pet_xp_awarded), 0) AS pet_xp
    FROM telegram_pet_events WHERE pet_id = ? AND day_key = ? AND status = 'accepted'`)
    .bind(String(petId || '').trim(), dayKey).first().catch(() => ({ pet_xp: 0 }));
  return Math.max(0, Math.floor(Number(row?.pet_xp) || 0));
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
  return `k-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
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
        { text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' },
      ],
    ],
  };
}

function buildPetKaijuCardReplyMarkup(match) {
  const matchId = String(match?.match_id || '');
  const category = PET_KAIJU_CATEGORIES.find((entry) => entry.key === match?.category_key) || null;
  const rows = [];
  for (let i = 0; i < PET_KAIJU_CARDS.length; i += 2) {
    rows.push(PET_KAIJU_CARDS.slice(i, i + 2).map((card) => ({
      text: `🃏 ${card.name}${category ? ` · ${category.label} ${card.stats[category.key]}` : ''}`,
      callback_data: `pet:kaiju:card:${matchId}:${card.id}`,
    })));
  }
  rows.push([{ text: '🎮 Open Web Card Game', url: `${SITE_URL}/games/kaiju-sticker-battle/` }]);
  return { inline_keyboard: rows };
}

function formatPetKaijuCardList(match = null) {
  const category = PET_KAIJU_CATEGORIES.find((entry) => entry.key === match?.category_key) || null;
  const categoryLine = category ? `🎯 ACTIVE CATEGORY: <b>${escapeHtml(category.name)} [${escapeHtml(category.label)}]</b>\n\n` : '';
  return categoryLine + PET_KAIJU_CARDS.map((card) => {
    const stats = PET_KAIJU_CATEGORIES.map((cat) => `${cat.label} ${card.stats[cat.key]}`).join(' | ');
    const active = category ? ` ← ACTIVE ${category.label} ${card.stats[category.key]}` : '';
    return `🃏 <code>${escapeHtml(card.id)}</code> — ${escapeHtml(card.name)}${escapeHtml(active)}\n${escapeHtml(stats)}`;
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


async function getFreshPetKaijuMatch(db, matchId) {
  const id = String(matchId || '');
  const expireResult = await db.prepare(`
    UPDATE telegram_pet_kaiju_matches
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE match_id = ? AND status IN ('open', 'selecting') AND updated_at < datetime('now', ?)
  `).bind(id, `-${PET_KAIJU_MATCH_TTL_MINUTES} minutes`).run().catch(() => null);
  const match = await getPetKaijuMatch(db, id);
  return {
    match,
    expired: Number(expireResult?.meta?.changes || 0) > 0 || match?.status === 'cancelled',
  };
}

function isPetKaijuExpiredResult(fresh) {
  return Boolean(fresh?.expired);
}

async function ensurePetKaijuMatchCategory(db, match) {
  if (!match || match.category_key || !['open', 'selecting'].includes(String(match.status || ''))) return match;
  const category = pickPetKaijuCategory();
  await db.prepare(`
    UPDATE telegram_pet_kaiju_matches
    SET category_key = ?, roll = ?, updated_at = CURRENT_TIMESTAMP
    WHERE match_id = ? AND status IN ('open', 'selecting') AND category_key IS NULL
  `).bind(category.key, category.roll, String(match.match_id)).run();
  return getPetKaijuMatch(db, match.match_id);
}

async function createPetKaijuMatch(db, chatId, telegramId, mode = 'solo', options = {}) {
  const matchId = buildPetKaijuMatchId();
  const status = mode === 'group' ? 'open' : 'selecting';
  const category = pickPetKaijuCategory();
  const inserted = options.mini_app_solo_guard
    ? await db.prepare(`
    INSERT INTO telegram_pet_kaiju_matches
      (id, match_id, chat_id, mode, status, player1_telegram_id, category_key, roll)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM telegram_pet_kaiju_queue
      WHERE chat_id = ? AND telegram_id = ?
        AND (status = 'waiting' OR updated_at LIKE 'claim:%')
    )
  `).bind(crypto.randomUUID(), matchId, String(chatId), mode, status, String(telegramId), category.key, category.roll,
      PET_MINI_APP_KAIJU_LOBBY, String(telegramId)).run()
    : await db.prepare(`
    INSERT INTO telegram_pet_kaiju_matches
      (id, match_id, chat_id, mode, status, player1_telegram_id, category_key, roll)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), matchId, String(chatId), mode, status, String(telegramId), category.key, category.roll).run();
  if (Number(inserted?.meta?.changes || 0) !== 1) return null;
  return getPetKaijuMatch(db, matchId);
}

async function enqueuePetKaijuPlayer(db, chatId, telegramId) {
  await db.prepare(`
    UPDATE telegram_pet_kaiju_queue
    SET updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = ? AND telegram_id = ? AND status = 'waiting'
  `).bind(String(chatId), String(telegramId)).run().catch(() => {});
  await db.prepare(`
    INSERT OR IGNORE INTO telegram_pet_kaiju_queue (id, chat_id, telegram_id, status)
    VALUES (?, ?, ?, 'waiting')
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

async function getPetKaijuMatchForPlayer(db, telegramId) {
  await db.prepare(`UPDATE telegram_pet_kaiju_matches SET status='cancelled', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id LIKE 'mini:kaiju:match:%' AND status IN ('open','selecting') AND updated_at < datetime('now', ?)`)
    .bind(`-${PET_KAIJU_MATCH_TTL_MINUTES} minutes`).run().catch(() => {});
  const row = await db.prepare(`SELECT * FROM telegram_pet_kaiju_matches
    WHERE chat_id LIKE 'mini:kaiju:match:%' AND status IN ('open','selecting')
      AND (player1_telegram_id=? OR player2_telegram_id=?)
    ORDER BY created_at DESC LIMIT 1`).bind(String(telegramId), String(telegramId)).first().catch(() => null);
  return serializePetKaijuMatch(row);
}

async function getPetKaijuQueueState(db, telegramId) {
  await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='expired', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND status='waiting' AND updated_at < datetime('now', ?)`)
    .bind(PET_MINI_APP_KAIJU_LOBBY, `-${PET_KAIJU_MATCH_TTL_MINUTES} minutes`).run().catch(() => {});
  const row = await db.prepare(`SELECT queued_at FROM telegram_pet_kaiju_queue
    WHERE chat_id=? AND telegram_id=? AND status='waiting' LIMIT 1`)
    .bind(PET_MINI_APP_KAIJU_LOBBY, String(telegramId)).first().catch(() => null);
  if (!row) return null;
  const position = await db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_kaiju_queue
    WHERE chat_id=? AND status='waiting' AND queued_at <= ?`).bind(PET_MINI_APP_KAIJU_LOBBY, row.queued_at).first().catch(() => null);
  return { waiting: true, position: Math.max(1, Number(position?.count || 1)) };
}

async function matchmakePetKaijuMiniApp(db, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted' };
  const active = await getPetKaijuMatchForPlayer(db, telegramId)
    || await getActivePetKaijuMatch(db, `mini:kaiju:${telegramId}`);
  if (active) return { accepted: true, reason: 'kaiju_match_active', match: active };
  await enqueuePetKaijuPlayer(db, PET_MINI_APP_KAIJU_LOBBY, telegramId);
  const activeAfterQueue = await getPetKaijuMatchForPlayer(db, telegramId)
    || await getActivePetKaijuMatch(db, `mini:kaiju:${telegramId}`);
  if (activeAfterQueue) {
    await cancelPetKaijuMiniAppQueue(db, telegramId);
    return { accepted: true, reason: 'kaiju_match_active', match: activeAfterQueue };
  }
  const rows = await db.prepare(`SELECT telegram_id FROM telegram_pet_kaiju_queue
    WHERE chat_id=? AND status='waiting' AND telegram_id<>? ORDER BY queued_at ASC LIMIT 6`)
    .bind(PET_MINI_APP_KAIJU_LOBBY, String(telegramId)).all().catch(() => ({ results: [] }));
  const opponent = (rows.results || []).find((row) => String(row.telegram_id) !== String(telegramId));
  if (!opponent) return { accepted: true, reason: 'kaiju_queued', queue: await getPetKaijuQueueState(db, telegramId) };
  const claimToken = `claim:${crypto.randomUUID()}`;
  const claimed = await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='played', updated_at=?
    WHERE chat_id=? AND telegram_id IN (?,?) AND status='waiting'`)
    .bind(claimToken, PET_MINI_APP_KAIJU_LOBBY, String(telegramId), String(opponent.telegram_id)).run();
  if (Number(claimed?.meta?.changes || 0) !== 2) {
    await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='waiting', updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='played' AND updated_at=?`).bind(PET_MINI_APP_KAIJU_LOBBY, claimToken).run().catch(() => {});
    return { accepted: true, reason: 'kaiju_queued', queue: await getPetKaijuQueueState(db, telegramId) };
  }
  try {
    const room = `mini:kaiju:match:${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const created = await createPetKaijuMatch(db, room, opponent.telegram_id, 'group');
    const joined = await db.prepare(`UPDATE telegram_pet_kaiju_matches
      SET player2_telegram_id=?, status='selecting', updated_at=CURRENT_TIMESTAMP
      WHERE match_id=? AND status='open' AND player2_telegram_id IS NULL`)
      .bind(String(telegramId), created.match_id).run();
    if (Number(joined?.meta?.changes || 0) !== 1) throw new Error('kaiju_match_claim_failed');
    await db.prepare(`UPDATE telegram_pet_kaiju_queue SET updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='played' AND updated_at=?`).bind(PET_MINI_APP_KAIJU_LOBBY, claimToken).run();
    return { accepted: true, reason: 'kaiju_match_found', match: await getPetKaijuMatch(db, created.match_id) };
  } catch (error) {
    await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='waiting', updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='played' AND updated_at=?`)
      .bind(PET_MINI_APP_KAIJU_LOBBY, claimToken).run().catch(() => {});
    throw error;
  }
}

async function cancelPetKaijuMiniAppQueue(db, telegramId) {
  const cancelled = await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='left', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND telegram_id=? AND status='waiting'`).bind(PET_MINI_APP_KAIJU_LOBBY, String(telegramId)).run();
  return { accepted: true, duplicate: Number(cancelled?.meta?.changes || 0) === 0, reason: 'kaiju_queue_cancelled' };
}

async function awardPetKaijuPlayerResult(db, telegramId, match, outcome, rewards = {}, options = {}) {
  if (match?.mode === 'pet_arena') {
    const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
    const eventKey = buildStablePetEventKey(['pet_arena', match.match_id, telegramId]);
    const awarded = await awardPetReward(db, {
      telegram_id: telegramId, source: 'pet_arena', idempotency_key: eventKey, event_key: eventKey,
      event_type: 'arena_battle', reason: outcome, rewards,
      profile_deltas: { happiness: rewards.happiness }, touch_streak: true, now,
      context: { source: 'telegram_arena', match_id: match.match_id, mode: match.mode },
    });
    if (awarded.accepted) {
      await recordMoonpetBehaviour(db, { telegram_id: telegramId, event_key: `${eventKey}:personality`, behaviour: 'combat', activity: 'combat' });
      await recordMoonpetBiggestReward(db, { telegram_id: telegramId, reward_amount: awarded.rewards?.moon_gold, reward_currency: 'moon_gold' });
    }
    return { ...awarded, reward_slot: null, reward_multiplier: 1 };
  }
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  const pet = await getPetProfileWithAtomicDecay(db, telegramId, now);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = buildStablePetEventKey(['pet_kaiju', match.match_id, telegramId]);
  const duplicate = await db.prepare(`
    SELECT id, status, reason, day_key, week_key, season_key
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?
  `).bind(telegramId, eventKey).first().catch(() => null);
  if (duplicate && duplicate.status !== 'pending') return { accepted: true, duplicate: true, reason: 'duplicate', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  const energyCost = Math.max(0, Math.floor(Number(rewards.energy_cost || 0)));
  const reservation = await reservePetRepeatRewardEvent(db, {
    telegram_id: telegramId,
    event_type: 'kaiju_battle',
    event_key: eventKey,
    season_key: season.key,
    day_key: dayKey,
    week_key: weekKey,
    mode: 'kaiju',
    source: 'telegram_kaiju',
    energy_cost: energyCost,
    existing_event: duplicate,
  });
  if (!reservation.claimed && reservation.reason === 'insufficient_energy') {
    return {
      accepted: false,
      reason: 'insufficient_energy',
      xp_awarded: 0,
      pet_xp_awarded: 0,
      rewards_applied: { pet_xp: 0, community_xp: 0, moon_gold: 0, style_tokens: 0, happiness: 0 },
      pet: await getPetProfile(db, telegramId),
    };
  }
  if (!reservation.claimed) return { accepted: true, duplicate: true, reason: 'duplicate', pet, xp_awarded: 0, pet_xp_awarded: 0 };

  const rewardSlotAuthority = reservation;
  const scaledRewardsAuthority = scalePetRewards(rewards, rewardSlotAuthority.multiplier);
  const awardedAuthority = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_kaiju', idempotency_key: eventKey, event_key: eventKey,
    event_type: 'kaiju_battle', xp_action: 'pet_kaiju_battle', reason: outcome, reservation_id: reservation.reservation_id,
    rewards: scaledRewardsAuthority, profile_deltas: { happiness: scaledRewardsAuthority.happiness },
    touch_streak: true, now, day_key: rewardSlotAuthority.day_key, week_key: rewardSlotAuthority.week_key, season_key: rewardSlotAuthority.season_key,
    context: { source: 'telegram_kaiju', match_id: match.match_id, mode: match.mode, reward_slot: rewardSlotAuthority.claimed_slot, reward_multiplier: rewardSlotAuthority.multiplier, energy_cost: energyCost },
  });
  return { ...awardedAuthority, reward_slot: rewardSlotAuthority.claimed_slot, reward_multiplier: rewardSlotAuthority.multiplier,
    accounting_window: { day_key: rewardSlotAuthority.day_key, week_key: rewardSlotAuthority.week_key, season_key: rewardSlotAuthority.season_key } };

  // Energy payment and the recoverable numbered slot commit together before rewards are calculated.
  const rewardSlot = reservation;
  const accountingDayKey = rewardSlot.day_key;
  const accountingWeekKey = rewardSlot.week_key;
  const accountingSeasonKey = rewardSlot.season_key;
  const scaledRewards = scalePetRewards(rewards, rewardSlot.multiplier);
  const requestedPetXp = Math.max(0, Math.floor(Number(scaledRewards.pet_xp || 0)));
  const requestedCommunityXp = Math.max(0, Math.floor(Number(scaledRewards.community_xp || 0)));
  const moonGold = Math.max(0, Math.floor(Number(scaledRewards.moon_gold || 0)));
  const styleTokens = Math.max(0, Math.floor(Number(scaledRewards.style_tokens || 0)));
  const happiness = Math.max(0, Math.floor(Number(scaledRewards.happiness || 0)));
  const previousDayKey = getPreviousPetDayKey(accountingDayKey);
  const finalizationId = crypto.randomUUID();
  const metadata = JSON.stringify({
    finalization_id: finalizationId,
    source: 'telegram_kaiju',
    match_id: match.match_id,
    mode: match.mode,
    reward_slot: rewardSlot.claimed_slot,
    reward_multiplier: rewardSlot.multiplier,
    energy_cost: energyCost,
    rewards: scaledRewards,
  });
  const [eventWrite] = await db.batch([
    db.prepare(`
      UPDATE telegram_pet_events
      SET pet_xp_awarded = MIN(?, MAX(0, ? - (
            SELECT COALESCE(SUM(pet_xp_awarded), 0) FROM telegram_pet_events
            WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
          ))),
          xp_awarded = MIN(?, MAX(0, ? - (
            SELECT COALESCE(SUM(xp_awarded), 0) FROM telegram_pet_events
            WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
          ))),
          status = 'accepted', reason = ?, metadata = ?
      WHERE id = ? AND telegram_id = ? AND status = 'pending'
      RETURNING pet_xp_awarded, xp_awarded
    `).bind(
      requestedPetXp, PETS_DAILY_PET_XP_CAP, telegramId, accountingDayKey,
      requestedCommunityXp, PETS_DAILY_COMMUNITY_XP_CAP, telegramId, accountingDayKey,
      outcome, metadata, reservation.reservation_id, telegramId,
    ),
    db.prepare(`
      UPDATE telegram_pet_profiles
      SET pet_xp = pet_xp + COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND status = 'accepted' AND metadata = ?), 0),
          moon_gold = MIN(999999, moon_gold + ?),
          style_tokens = MIN(999999, style_tokens + ?),
          happiness = MIN(100, happiness + ?),
          streak_days = CASE
            WHEN last_active_day > ? THEN streak_days
            WHEN last_active_day = ? THEN MAX(1, streak_days)
            WHEN last_active_day = ? THEN streak_days + 1
            ELSE 1
          END,
          last_active_day = CASE WHEN last_active_day > ? THEN last_active_day ELSE ? END,
          last_decay_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'accepted' AND metadata = ?)
    `).bind(
      reservation.reservation_id, metadata, moonGold, styleTokens, happiness,
      accountingDayKey, accountingDayKey, previousDayKey, accountingDayKey, accountingDayKey,
      now.toISOString(), telegramId, reservation.reservation_id, metadata,
    ),
    db.prepare(`
      UPDATE telegram_pet_profiles
      SET stage = CASE WHEN pet_xp >= 1800 THEN 'legendary companion' WHEN pet_xp >= 900 THEN 'moon guardian' WHEN pet_xp >= 360 THEN 'street scout' WHEN pet_xp >= 120 THEN 'runner' WHEN pet_xp >= 25 THEN 'hatchling' ELSE 'egg' END,
          level = CAST(pet_xp / 100 AS INTEGER) + 1,
          health = MIN(100, MAX(0, ROUND(((100 - hunger) + happiness + cleanliness + energy) / 4.0)))
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'accepted' AND metadata = ?)
    `).bind(telegramId, reservation.reservation_id, metadata),
    db.prepare(`
      INSERT INTO telegram_pet_season_state
        (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, pet_xp_awarded, pet_xp_awarded, pet_xp_awarded, ?, ?
      FROM telegram_pet_events WHERE id = ? AND status = 'accepted' AND metadata = ?
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET
        season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key, weekly_key = excluded.weekly_key, updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, accountingSeasonKey, accountingDayKey, accountingWeekKey, reservation.reservation_id, metadata),
    db.prepare(`
      INSERT INTO telegram_xp_log (telegram_id, action, xp_change, reference_id)
      SELECT ?, 'pet_kaiju_battle', xp_awarded, ?
      FROM telegram_pet_events
      WHERE id = ? AND status = 'accepted' AND metadata = ? AND xp_awarded > 0
    `).bind(telegramId, eventKey, reservation.reservation_id, metadata),
    db.prepare(`
      UPDATE telegram_users
      SET xp = xp + COALESCE((
            SELECT xp_awarded FROM telegram_pet_events
            WHERE id = ? AND status = 'accepted' AND metadata = ?
          ), 0),
          level = CAST((xp + COALESCE((
            SELECT xp_awarded FROM telegram_pet_events
            WHERE id = ? AND status = 'accepted' AND metadata = ?
          ), 0)) / 100 AS INTEGER) + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (
        SELECT 1 FROM telegram_pet_events
        WHERE id = ? AND status = 'accepted' AND metadata = ? AND xp_awarded > 0
      )
    `).bind(
      reservation.reservation_id, metadata, reservation.reservation_id, metadata,
      telegramId, reservation.reservation_id, metadata,
    ),
    db.prepare(`
      INSERT INTO telegram_leaderboard (telegram_id, season_id, xp)
      SELECT ?, season.id, event.xp_awarded
      FROM telegram_pet_events AS event
      JOIN telegram_seasons AS season ON season.id = (
        SELECT id FROM telegram_seasons
        WHERE date(?) >= date(start_date)
          AND (end_date IS NULL OR date(?) <= date(end_date))
        ORDER BY start_date DESC LIMIT 1
      )
      WHERE event.id = ? AND event.status = 'accepted' AND event.metadata = ? AND event.xp_awarded > 0
      ON CONFLICT(telegram_id, season_id) DO UPDATE SET
        xp = xp + excluded.xp,
        updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, accountingDayKey, accountingDayKey, reservation.reservation_id, metadata),
  ]);
  if (!eventWrite?.results?.[0]) {
    return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0, pet: await getPetProfile(db, telegramId) };
  }
  const awardedRow = eventWrite?.results?.[0] || {};
  const petXp = Math.max(0, Math.floor(Number(awardedRow.pet_xp_awarded || 0)));
  const communityXp = Math.max(0, Math.floor(Number(awardedRow.xp_awarded || 0)));
  return {
    accepted: true,
    reason: outcome,
    xp_awarded: communityXp,
    pet_xp_awarded: petXp,
    reward_slot: rewardSlot.claimed_slot,
    reward_multiplier: rewardSlot.multiplier,
    accounting_window: { day_key: accountingDayKey, week_key: accountingWeekKey, season_key: accountingSeasonKey },
    pet: await getPetProfile(db, telegramId),
  };
}

const PET_KAIJU_RESULT_REWARDS = Object.freeze({
  kaiju_win: Object.freeze({ pet_xp: 38, community_xp: 8, moon_gold: 18, style_tokens: 1, happiness: 5, energy_cost: 6 }),
  kaiju_draw: Object.freeze({ pet_xp: 22, community_xp: 4, moon_gold: 10, style_tokens: 1, happiness: 3, energy_cost: 5 }),
  kaiju_loss: Object.freeze({ pet_xp: 12, community_xp: 2, moon_gold: 5, style_tokens: 0, happiness: 1, energy_cost: 4 }),
});

async function awardPetKaijuMatchResults(db, match, resolved) {
  const player1Outcome = resolved.result === 'player1_win' ? 'kaiju_win' : resolved.result === 'draw' ? 'kaiju_draw' : 'kaiju_loss';
  const player2Outcome = resolved.result === 'player2_win' ? 'kaiju_win' : resolved.result === 'draw' ? 'kaiju_draw' : 'kaiju_loss';
  const results = [{
    telegram_id: String(match.player1_telegram_id),
    outcome: player1Outcome,
    result: await awardPetKaijuPlayerResult(db, String(match.player1_telegram_id), match, player1Outcome, PET_KAIJU_RESULT_REWARDS[player1Outcome]),
  }];
  if (match.mode === 'group' && match.player2_telegram_id) {
    results.push({
      telegram_id: String(match.player2_telegram_id),
      outcome: player2Outcome,
      result: await awardPetKaijuPlayerResult(db, String(match.player2_telegram_id), match, player2Outcome, PET_KAIJU_RESULT_REWARDS[player2Outcome]),
    });
  }
  return results;
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
  const completionResult = await db.prepare(`
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
  if (completionResult?.meta?.changes !== undefined && Number(completionResult.meta.changes || 0) <= 0) {
    // A completed match may still have a recoverable pending player award from an earlier D1 failure.
    const rewardResults = await awardPetKaijuMatchResults(db, match, resolved);
    await reconcileSanctuaryBestEffort(db, String(match.player1_telegram_id), 'kaiju_terminal');
    if (match.player2_telegram_id) await reconcileSanctuaryBestEffort(db, String(match.player2_telegram_id), 'kaiju_terminal');
    return {
      accepted: true,
      duplicate: true,
      reason: 'already_completed',
      match: await getPetKaijuMatch(db, match.match_id),
      resolved,
      reward_results: rewardResults,
      queue: await getPetKaijuQueue(db, match.chat_id, [match.player1_telegram_id, match.player2_telegram_id || '']),
    };
  }

  const rewardResults = await awardPetKaijuMatchResults(db, match, resolved);
  await db.prepare(`
    UPDATE telegram_pet_kaiju_queue
    SET status = 'played', updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = ? AND telegram_id IN (?, ?) AND status = 'waiting'
  `).bind(String(match.chat_id), String(match.player1_telegram_id), String(match.player2_telegram_id || '')).run().catch(() => {});
  const queue = await getPetKaijuQueue(db, match.chat_id, [match.player1_telegram_id, match.player2_telegram_id || '']);
  await reconcileSanctuaryBestEffort(db, String(match.player1_telegram_id), 'kaiju_terminal');
  if (match.player2_telegram_id) await reconcileSanctuaryBestEffort(db, String(match.player2_telegram_id), 'kaiju_terminal');
  return { accepted: true, reason: 'kaiju_completed', match: await getPetKaijuMatch(db, match.match_id), resolved, reward_results: rewardResults, queue };
}

function getPetArenaRankBucket(level) {
  const l = Math.max(0, Math.floor(Number(level) || 0));
  if (l >= 70) return 'moon_warlord';
  if (l >= 40) return 'cyber_beast';
  if (l >= 25) return 'enforcer';
  if (l >= 15) return 'scrapper';
  return 'rookie';
}
const PET_ARENA_BUCKET_ORDER = Object.freeze(['rookie', 'scrapper', 'enforcer', 'cyber_beast', 'moon_warlord']);
const PET_ARENA_STAT_WEIGHTS = Object.freeze({ attack: 2, defense: 1.7, crit: 1.3, dodge: 1.2, luck: 1 });
const PET_ARENA_MAX_ROUNDS = 8;
const PET_ARENA_MAX_HP = 100;
const PET_ARENA_SPECIAL_COST = 3;
const PET_ARENA_MOVES = Object.freeze({ ah: 'Attack Head', ab: 'Attack Body', bh: 'Block Head', bb: 'Block Body', ch: 'Charge Special', sp: 'Special Move' });
const PET_ARENA_MOVE_GUIDE = Object.freeze({
  ah: Object.freeze({ key: 'ah', label: 'Attack Head', role: 'pressure', accuracy: 78, base_damage: 18, counter_key: 'bh', charge_delta: 1, detail: 'Heavy strike. Block Head counters it.' }),
  ab: Object.freeze({ key: 'ab', label: 'Attack Body', role: 'pressure', accuracy: 90, base_damage: 14, counter_key: 'bb', charge_delta: 1, detail: 'Reliable strike. Block Body counters it.' }),
  bh: Object.freeze({ key: 'bh', label: 'Block Head', role: 'guard', accuracy: null, base_damage: 0, counter_key: 'ah', charge_delta: 0, detail: 'Guards against Attack Head.' }),
  bb: Object.freeze({ key: 'bb', label: 'Block Body', role: 'guard', accuracy: null, base_damage: 0, counter_key: 'ab', charge_delta: 0, detail: 'Guards against Attack Body.' }),
  ch: Object.freeze({ key: 'ch', label: 'Charge Special', role: 'charge', accuracy: null, base_damage: 0, counter_key: null, charge_delta: 1, detail: 'Builds one guaranteed Special charge.' }),
  sp: Object.freeze({ key: 'sp', label: 'Special Move', role: 'finisher', accuracy: 82, base_damage: 28, counter_key: null, charge_delta: -PET_ARENA_SPECIAL_COST, detail: 'High-impact finisher. Requires three charges.' }),
});
function serializePetArenaMovePreview(moveKey, special = 0) {
  const move = PET_ARENA_MOVE_GUIDE[String(moveKey || '')];
  if (!move) return null;
  const available = move.key !== 'sp' || Number(special || 0) >= PET_ARENA_SPECIAL_COST;
  return {
    ...move,
    available,
    counter_label: move.counter_key ? PET_ARENA_MOVES[move.counter_key] : null,
    requirement: move.key === 'sp' ? PET_ARENA_SPECIAL_COST : 0,
  };
}
function buildPetArenaMovePreviews(battle, telegramId = '') {
  const isPlayer2 = String(battle?.player2_telegram_id || '') === String(telegramId);
  const special = Number(isPlayer2 ? battle?.player2_special || 0 : battle?.player1_special || 0);
  return Object.keys(PET_ARENA_MOVE_GUIDE).map((key) => serializePetArenaMovePreview(key, special));
}
function orientPetArenaLastRound(battle, isPlayer2 = false) {
  const round = safeParsePetArenaSnapshot(battle?.last_round_log_json);
  if (!Array.isArray(round.moves) || !Array.isArray(round.log)) return null;
  return {
    round: Number(round.round || 0),
    player_move: round.moves[isPlayer2 ? 1 : 0] || null,
    opponent_move: round.moves[isPlayer2 ? 0 : 1] || null,
    player_log: round.log[isPlayer2 ? 1 : 0] || '',
    opponent_log: round.log[isPlayer2 ? 0 : 1] || '',
  };
}
function buildPetArenaBattleId() { return `a-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`; }
function petArenaGearEffect(pet, slot) { return PET_SHOP_ITEMS[String(pet?.[`equipped_${slot}`] || '')]?.arena || {}; }
function getPetActiveSetEffects(pet) {
  const equipped = ['food', 'toy', 'outfit', 'armor', 'weapon', 'charm'].map((slot) => String(pet?.[`equipped_${slot}`] || '')).filter(Boolean);
  return getActivePetSetBonuses(equipped).reduce((effects, set) => {
    for (const [key, value] of Object.entries(set.effects || {})) effects[key] = Number(effects[key] || 0) + Number(value || 0);
    return effects;
  }, {});
}
function sumPetArenaGearPower(...items) {
  return items.reduce((total, item) => total + Object.entries(PET_ARENA_STAT_WEIGHTS).reduce((sum, [field, weight]) => sum + Math.max(0, Number(item?.[field] || 0)) * weight, 0), 0);
}
function buildPetArenaSnapshot(pet) {
  const level = getPetLevel(pet?.pet_xp);
  return { telegram_id: String(pet?.telegram_id || ''), pet_name: pet?.pet_name || 'Moonpet', level, pet_xp: Math.max(0, Number(pet?.pet_xp || 0)), health: clampPetStat(pet?.health), energy: clampPetStat(pet?.energy), happiness: clampPetStat(pet?.happiness), cleanliness: clampPetStat(pet?.cleanliness), equipped_food: pet?.equipped_food || null, equipped_toy: pet?.equipped_toy || null, equipped_outfit: pet?.equipped_outfit || null, equipped_armor: pet?.equipped_armor || null, equipped_weapon: pet?.equipped_weapon || null, equipped_charm: pet?.equipped_charm || null };
}
function calculatePetArenaPower(pet, seed = '') {
  const s = buildPetArenaSnapshot(pet); const armor = petArenaGearEffect(s, 'armor'); const weapon = petArenaGearEffect(s, 'weapon'); const charm = petArenaGearEffect(s, 'charm');
  const outfit = PET_SHOP_ITEMS[s.equipped_outfit]?.min_level ? PET_SHOP_ITEMS[s.equipped_outfit].min_level : 0; const toy = PET_SHOP_ITEMS[s.equipped_toy]?.min_level ? PET_SHOP_ITEMS[s.equipped_toy].min_level : 0;
  let hash = 0; for (const ch of String(seed || `${s.telegram_id}:${s.pet_xp}`)) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  const rng = (hash % 11) - 5; // controlled deterministic RNG, -5..+5
  const condition = (s.health < 35 ? 0.65 : 1) * (s.energy < 30 ? 0.75 : 1);
  const morale = (s.happiness + s.cleanliness) / 20;
  const gear = sumPetArenaGearPower(weapon, armor, charm) + outfit + toy;
  const setEffects = getPetActiveSetEffects(s);
  const setPower = Math.max(0, Number(setEffects.arena_attack) || 0) * PET_ARENA_STAT_WEIGHTS.attack
    + Math.max(0, Number(setEffects.arena_defense) || 0) * PET_ARENA_STAT_WEIGHTS.defense
    + Math.max(0, Number(setEffects.arena_dodge) || 0) * PET_ARENA_STAT_WEIGHTS.dodge;
  return Math.max(1, Math.round((s.level * 10 + Math.sqrt(s.pet_xp) + morale + gear + setPower + rng) * condition));
}
function buildPetArenaMenuReplyMarkup() { return { inline_keyboard: [[{ text: 'Find Pet Battle', callback_data: 'pet:arena:find' }, { text: 'Battle App Pet', callback_data: 'pet:arena:app' }], [{ text: 'My Arena Status', callback_data: 'pet:arena:status' }, { text: 'Cancel Queue', callback_data: 'pet:arena:cancel' }], [{ text: 'Gear Shop', callback_data: 'pet:shop' }, { text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' }]] }; }
function buildPetArenaMatchReplyMarkup(battleId) { return { inline_keyboard: [[{ text: 'Ready', callback_data: `pet:arena:ready:${battleId}` }, { text: 'Cancel', callback_data: `pet:arena:stop:${battleId}` }]] }; }
function buildPetArenaMoveReplyMarkup(battleId, roundNumber = 1) { const r = Math.max(1, Math.floor(Number(roundNumber) || 1)); return { inline_keyboard: [[{ text: 'Attack Head', callback_data: `pet:arena:mv:${battleId}:${r}:ah` }, { text: 'Attack Body', callback_data: `pet:arena:mv:${battleId}:${r}:ab` }], [{ text: 'Block Head', callback_data: `pet:arena:mv:${battleId}:${r}:bh` }, { text: 'Block Body', callback_data: `pet:arena:mv:${battleId}:${r}:bb` }], [{ text: 'Charge Special', callback_data: `pet:arena:mv:${battleId}:${r}:ch` }, { text: 'Special Move', callback_data: `pet:arena:mv:${battleId}:${r}:sp` }], [{ text: 'Forfeit', callback_data: `pet:arena:ff:${battleId}` }]] }; }
function parsePetArenaCallbackPayload(payload) {
  const text = String(payload || '');
  if (text === 'arena:find') return 'find';
  if (text === 'arena:any') return 'any';
  if (text === 'arena:cancel') return 'cancel';
  const ready = text.match(/^arena:ready:(a-[a-f0-9]{10})$/);
  if (ready) return `ready:${ready[1]}`;
  const stop = text.match(/^arena:stop:(a-[a-f0-9]{10})$/);
  if (stop) return `stop:${stop[1]}`;
  const move = text.match(/^arena:mv:(a-[a-f0-9]{10}):(\d{1,2}):(ah|ab|bh|bb|ch|sp)$/);
  if (move) return `mv:${move[1]}:${move[2]}:${move[3]}`;
  const ff = text.match(/^arena:ff:(a-[a-f0-9]{10})$/);
  if (ff) return `ff:${ff[1]}`;
  if (text === 'arena:app') return 'app';
  if (text === 'arena:status') return 'status';
  return '';
}
async function ensurePetArenaEligible(db, telegramId) { const pet = await getPetProfile(db, telegramId); if (!pet) return { ok:false, reason:'pet_not_adopted' }; if (getPetLevel(pet.pet_xp) < PET_ARENA_MIN_LEVEL) return { ok:false, reason:'level_locked', pet }; if (clampPetStat(pet.health) < 15) return { ok:false, reason:'health_low', pet }; return { ok:true, pet }; }
async function getPetArenaBattle(db, battleId) { return db.prepare(`SELECT * FROM telegram_pet_arena_battles WHERE battle_id = ? LIMIT 1`).bind(String(battleId || '')).first().catch(() => null); }
async function hasActivePetArenaBattle(db, chatId, telegramId) {
  const row = await db.prepare(`SELECT battle_id FROM telegram_pet_arena_battles WHERE chat_id = ? AND status IN ('readying', 'active') AND (player1_telegram_id = ? OR player2_telegram_id = ?) LIMIT 1`).bind(String(chatId), String(telegramId), String(telegramId)).first().catch(() => null);
  return Boolean(row?.battle_id);
}
async function getPetArenaBattleForPlayer(db, chatId, telegramId) {
  await db.prepare(`UPDATE telegram_pet_arena_battles SET status='expired', completed_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND status IN ('readying','active') AND COALESCE(expires_at, created_at) < ?`)
    .bind(String(chatId), new Date().toISOString()).run().catch(() => {});
  return db.prepare(`SELECT * FROM telegram_pet_arena_battles
    WHERE chat_id=? AND status IN ('readying','active') AND (player1_telegram_id=? OR player2_telegram_id=?)
    ORDER BY created_at DESC LIMIT 1`).bind(String(chatId), String(telegramId), String(telegramId)).first().catch(() => null);
}
async function getPetArenaQueueState(db, chatId, telegramId) {
  await db.prepare(`UPDATE telegram_pet_arena_queue SET status='expired', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND status='waiting' AND updated_at < datetime('now', ?)`)
    .bind(String(chatId), `-${PET_ARENA_QUEUE_TTL_MINUTES} minutes`).run().catch(() => {});
  const row = await db.prepare(`SELECT rank_bucket, accept_any_rank, created_at FROM telegram_pet_arena_queue
    WHERE chat_id=? AND telegram_id=? AND status='waiting' LIMIT 1`)
    .bind(String(chatId), String(telegramId)).first().catch(() => null);
  if (!row) return null;
  const position = await db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_arena_queue
    WHERE chat_id=? AND status='waiting' AND created_at <= ?`).bind(String(chatId), row.created_at).first().catch(() => null);
  return { waiting: true, rank_bucket: row.rank_bucket, accept_any_rank: Boolean(row.accept_any_rank), position: Math.max(1, Number(position?.count || 1)) };
}
async function queuePetArenaMiniApp(db, telegramId, acceptAnyRank = false) {
  const eligible = await ensurePetArenaEligible(db, telegramId);
  if (!eligible.ok) return { accepted: false, reason: eligible.reason };
  const active = await getPetArenaBattleForPlayer(db, PET_MINI_APP_ARENA_LOBBY, telegramId)
    || await getPetArenaBattleForPlayer(db, `mini:${telegramId}`, telegramId);
  if (active) return { accepted: true, reason: 'arena_match_active', battle: active };
  const pet = eligible.pet;
  const bucket = getPetArenaRankBucket(getPetLevel(pet.pet_xp));
  await db.prepare(`INSERT INTO telegram_pet_arena_queue
    (id,chat_id,telegram_id,rank_bucket,pet_snapshot_json,status,accept_any_rank)
    VALUES (?,?,?,?,?,'waiting',?)
    ON CONFLICT(chat_id,telegram_id) WHERE status='waiting' DO UPDATE SET
      rank_bucket=excluded.rank_bucket, pet_snapshot_json=excluded.pet_snapshot_json,
      accept_any_rank=MAX(telegram_pet_arena_queue.accept_any_rank, excluded.accept_any_rank), updated_at=CURRENT_TIMESTAMP`)
    .bind(crypto.randomUUID(), PET_MINI_APP_ARENA_LOBBY, String(telegramId), bucket, JSON.stringify(buildPetArenaSnapshot(pet)), acceptAnyRank ? 1 : 0).run();
  const activeAfterQueue = await getPetArenaBattleForPlayer(db, PET_MINI_APP_ARENA_LOBBY, telegramId)
    || await getPetArenaBattleForPlayer(db, `mini:${telegramId}`, telegramId);
  if (activeAfterQueue) {
    await cancelPetArenaMiniAppQueue(db, telegramId);
    return { accepted: true, reason: 'arena_match_active', battle: activeAfterQueue };
  }
  const idx = PET_ARENA_BUCKET_ORDER.indexOf(bucket);
  const lower = PET_ARENA_BUCKET_ORDER[idx - 1] || '';
  const upper = PET_ARENA_BUCKET_ORDER[idx + 1] || '';
  const rows = await db.prepare(`SELECT * FROM telegram_pet_arena_queue
    WHERE chat_id=? AND status='waiting' AND telegram_id<>?
      AND (rank_bucket=? OR rank_bucket IN (?,?) OR accept_any_rank=1 OR ?=1 OR updated_at < datetime('now', ?))
    ORDER BY CASE WHEN rank_bucket=? THEN 0 WHEN rank_bucket IN (?,?) THEN 1 ELSE 2 END, created_at ASC LIMIT 6`)
    .bind(PET_MINI_APP_ARENA_LOBBY, String(telegramId), bucket, lower, upper, acceptAnyRank ? 1 : 0,
      `-${PET_ARENA_ANY_RANK_TIMEOUT_MINUTES} minutes`, bucket, lower, upper).all().catch(() => ({ results: [] }));
  const opponent = (rows.results || []).find((row) => String(row.telegram_id) !== String(telegramId));
  if (!opponent) return { accepted: true, reason: 'arena_queued', queue: await getPetArenaQueueState(db, PET_MINI_APP_ARENA_LOBBY, telegramId) };
  if (await hasActivePetArenaBattle(db, PET_MINI_APP_ARENA_LOBBY, opponent.telegram_id)) {
    return { accepted: true, reason: 'arena_queued', queue: await getPetArenaQueueState(db, PET_MINI_APP_ARENA_LOBBY, telegramId) };
  }
  const claimToken = `claim:${crypto.randomUUID()}`;
  const claimed = await db.prepare(`UPDATE telegram_pet_arena_queue SET status='matched', updated_at=?
    WHERE chat_id=? AND telegram_id IN (?,?) AND status='waiting'`)
    .bind(claimToken, PET_MINI_APP_ARENA_LOBBY, String(telegramId), String(opponent.telegram_id)).run();
  if (Number(claimed?.meta?.changes || 0) !== 2) {
    await db.prepare(`UPDATE telegram_pet_arena_queue SET status='waiting', updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='matched' AND updated_at=?`).bind(PET_MINI_APP_ARENA_LOBBY, claimToken).run().catch(() => {});
    return { accepted: true, reason: 'arena_queued', queue: await getPetArenaQueueState(db, PET_MINI_APP_ARENA_LOBBY, telegramId) };
  }
  try {
    const battle = await createPetArenaBattle(db, PET_MINI_APP_ARENA_LOBBY, pet, safeParsePetArenaSnapshot(opponent.pet_snapshot_json), 'group');
    await db.prepare(`UPDATE telegram_pet_arena_queue SET updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='matched' AND updated_at=?`).bind(PET_MINI_APP_ARENA_LOBBY, claimToken).run();
    return { accepted: true, reason: 'arena_match_found', battle };
  } catch (error) {
    await db.prepare(`UPDATE telegram_pet_arena_queue SET status='waiting', updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='matched' AND updated_at=?`)
      .bind(PET_MINI_APP_ARENA_LOBBY, claimToken).run().catch(() => {});
    throw error;
  }
}
async function cancelPetArenaMiniAppQueue(db, telegramId) {
  const cancelled = await db.prepare(`UPDATE telegram_pet_arena_queue SET status='cancelled', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND telegram_id=? AND status='waiting'`).bind(PET_MINI_APP_ARENA_LOBBY, String(telegramId)).run();
  return { accepted: true, duplicate: Number(cancelled?.meta?.changes || 0) === 0, reason: 'arena_queue_cancelled' };
}
async function createPetArenaBattle(db, chatId, p1, p2, mode='group', options = {}) {
  const battleId = buildPetArenaBattleId();
  const p1p = calculatePetArenaPower(p1, `${battleId}:1`);
  const p2p = calculatePetArenaPower(p2, `${battleId}:2`);
  const status = mode === 'app' ? 'active' : 'readying';
  const now = new Date().toISOString();
  const values = [crypto.randomUUID(), battleId, String(chatId), String(p1.telegram_id), mode === 'app' ? 'app' : String(p2.telegram_id), JSON.stringify(buildPetArenaSnapshot(p1)), JSON.stringify(buildPetArenaSnapshot(p2)), p1p, p2p, status, mode, 1, PET_ARENA_MAX_ROUNDS, PET_ARENA_MAX_HP, PET_ARENA_MAX_HP, 0, 0, petArenaExpiryTimestamp(), mode === 'app' ? now : null, mode === 'app' ? now : null];
  const columns = '(id,battle_id,chat_id,player1_telegram_id,player2_telegram_id,player1_pet_snapshot_json,player2_pet_snapshot_json,player1_power,player2_power,status,result,current_round,max_rounds,player1_hp,player2_hp,player1_special,player2_special,expires_at,player1_ready_at,player2_ready_at)';
  const inserted = options.mini_app_solo_guard
    ? await db.prepare(`INSERT INTO telegram_pet_arena_battles ${columns}
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE NOT EXISTS (
          SELECT 1 FROM telegram_pet_arena_queue
          WHERE chat_id=? AND telegram_id=?
            AND (status='waiting' OR updated_at LIKE 'claim:%')
        )`).bind(...values, PET_MINI_APP_ARENA_LOBBY, String(p1.telegram_id)).run()
    : await db.prepare(`INSERT INTO telegram_pet_arena_battles ${columns} VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
  if (Number(inserted?.meta?.changes || 0) !== 1) return null;
  await ensurePetArenaRound(db, battleId, 1);
  return getPetArenaBattle(db, battleId);
}
function safeParsePetArenaSnapshot(jsonText) {
  try { return JSON.parse(String(jsonText || '{}')) || {}; } catch (_) { return {}; }
}
function getPetArenaBucketDistance(levelA, levelB) {
  const a = PET_ARENA_BUCKET_ORDER.indexOf(getPetArenaRankBucket(levelA));
  const b = PET_ARENA_BUCKET_ORDER.indexOf(getPetArenaRankBucket(levelB));
  return Math.abs((a < 0 ? 0 : a) - (b < 0 ? 0 : b));
}

function petArenaExpiryTimestamp() { return new Date(Date.now() + PET_ARENA_BATTLE_TTL_MINUTES * 60000).toISOString(); }
async function refreshPetArenaExpiry(db, battleId) { await db.prepare(`UPDATE telegram_pet_arena_battles SET expires_at=? WHERE battle_id=? AND status IN ('readying','active')`).bind(petArenaExpiryTimestamp(), String(battleId)).run().catch(() => {}); }
async function ensurePetArenaRound(db, battleId, roundNumber) {
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_arena_rounds (id,battle_id,round_number,status) VALUES (?,?,?,'selecting')`).bind(crypto.randomUUID(), String(battleId), Number(roundNumber || 1)).run().catch(() => {});
}
function selectPetArenaAppMove(battle) { const seed = `${battle.battle_id}:${battle.current_round}:${battle.player2_special}`; let h = 0; for (const ch of seed) h = ((h * 33) + ch.charCodeAt(0)) >>> 0; const choices = Number(battle.player2_special || 0) >= PET_ARENA_SPECIAL_COST ? ['sp','ab','ah','bb'] : ['ab','ah','bh','bb','ch']; return choices[h % choices.length]; }
function resolvePetArenaRoundState(battle, p1Move, p2Move) {
  const p1 = safeParsePetArenaSnapshot(battle.player1_pet_snapshot_json), p2 = safeParsePetArenaSnapshot(battle.player2_pet_snapshot_json);
  let p1s = Number(battle.player1_special || 0), p2s = Number(battle.player2_special || 0);
  const calc = (atk, def, move, block, special) => {
    if (move === 'ch') return { damage: 0, text: `${PET_ARENA_MOVES[move]} built special charge.`, specialDelta: 1 };
    if (move === 'bh' || move === 'bb') return { damage: 0, text: `${PET_ARENA_MOVES[move]} guarded this round.`, specialDelta: 0 };
    if (move === 'sp' && special < PET_ARENA_SPECIAL_COST) move = 'ab';
    const atkGear = petArenaGearEffect(atk, 'weapon'), defGear = petArenaGearEffect(def, 'armor'), charm = petArenaGearEffect(atk, 'charm');
    const moveDefinition = PET_ARENA_MOVE_GUIDE[move] || PET_ARENA_MOVE_GUIDE.ab;
    const base = Number(moveDefinition.base_damage || 0); const acc = Number(moveDefinition.accuracy || 100);
    let h = 0; for (const ch of `${battle.battle_id}:${battle.current_round}:${atk.telegram_id}:${move}`) h = ((h * 31) + ch.charCodeAt(0)) >>> 0;
    const dodged = (h % 100) >= Math.min(98, acc + Math.floor(Number(charm.luck || 0) / 2) - Math.floor(Number(petArenaGearEffect(def, 'charm').dodge || 0) / 3));
    if (dodged) return { damage: 0, text: `${PET_ARENA_MOVES[move]} missed.`, specialDelta: move === 'sp' ? -PET_ARENA_SPECIAL_COST : 1 };
    const blocked = (move === 'ah' && block === 'bh') || (move === 'ab' && block === 'bb');
    const gearBonus = Math.floor(Number(atkGear.attack || 0) / 2) + Math.floor(Number(charm.crit || 0) / 2);
    const armor = Math.floor((Number(defGear.defense || 0) + (blocked ? 16 : 0)) / 2);
    const condition = (clampPetStat(atk.energy) + clampPetStat(atk.health) + clampPetStat(atk.happiness) + clampPetStat(atk.cleanliness)) / 400;
    const damage = Math.max(1, Math.round((base + gearBonus + Number(atk.level || 0) / 3) * (0.75 + condition / 2) - armor));
    return { damage, text: `${PET_ARENA_MOVES[move]} hit for ${damage} damage${blocked ? ' after a block' : ''}.`, specialDelta: move === 'sp' ? -PET_ARENA_SPECIAL_COST : 1 };
  };
  const r1 = calc(p1, p2, p1Move, p2Move, p1s), r2 = calc(p2, p1, p2Move, p1Move, p2s);
  return { player1_damage: r2.damage, player2_damage: r1.damage, player1_hp: Math.max(0, Number(battle.player1_hp ?? PET_ARENA_MAX_HP) - r2.damage), player2_hp: Math.max(0, Number(battle.player2_hp ?? PET_ARENA_MAX_HP) - r1.damage), player1_special: Math.max(0, Math.min(PET_ARENA_SPECIAL_COST, p1s + r1.specialDelta)), player2_special: Math.max(0, Math.min(PET_ARENA_SPECIAL_COST, p2s + r2.specialDelta)), log: [r1.text, r2.text] };
}

function scalePetArenaRewardsForPlayer(battle, result, telegramId, baseRewards) {
  const p1 = safeParsePetArenaSnapshot(battle.player1_pet_snapshot_json);
  const p2 = safeParsePetArenaSnapshot(battle.player2_pet_snapshot_json);
  const isPlayer1 = String(telegramId) === String(battle.player1_telegram_id);
  const self = isPlayer1 ? p1 : p2;
  const rival = isPlayer1 ? p2 : p1;
  const selfLevel = Math.max(0, Math.floor(Number(self.level || getPetLevel(self.pet_xp)) || 0));
  const rivalLevel = Math.max(0, Math.floor(Number(rival.level || getPetLevel(rival.pet_xp)) || 0));
  const bucketDistance = getPetArenaBucketDistance(selfLevel, rivalLevel);
  const levelGap = Math.abs(selfLevel - rivalLevel);
  const won = (isPlayer1 && result === 'player1_win') || (!isPlayer1 && result === 'player2_win');
  const scaled = { ...baseRewards };
  if (!won || result === 'draw') return { rewards: scaled, modifier: 'normal' };
  const underdogWin = selfLevel < rivalLevel && (bucketDistance >= 1 || levelGap >= 5);
  const highLevelWin = selfLevel > rivalLevel && (bucketDistance >= 2 || levelGap >= 15);
  const multiplier = underdogWin ? 1.35 : highLevelWin ? 0.65 : 1;
  scaled.pet_xp = Math.max(0, Math.round(Number(scaled.pet_xp || 0) * multiplier));
  scaled.community_xp = Math.max(0, Math.round(Number(scaled.community_xp || 0) * multiplier));
  scaled.moon_gold = Math.max(0, Math.round(Number(scaled.moon_gold || 0) * multiplier));
  return { rewards: scaled, modifier: underdogWin ? 'underdog_bonus' : highLevelWin ? 'high_level_reduced' : 'normal' };
}
async function completePetArenaBattle(db, battle) {
  const claim = await db.prepare(`UPDATE telegram_pet_arena_battles SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE battle_id=? AND status IN ('readying','active')`).bind(battle.battle_id).run();
  const duplicateCompletion = claim?.meta?.changes !== undefined && Number(claim.meta.changes || 0) <= 0;
  const p1 = Number(battle.player1_power || 0), p2 = Number(battle.player2_power || 0); const result = ['player1_win','player2_win','draw'].includes(String(battle.result || '')) ? String(battle.result) : (Number(battle.player1_hp ?? PET_ARENA_MAX_HP) === Number(battle.player2_hp ?? PET_ARENA_MAX_HP) ? 'draw' : Number(battle.player1_hp ?? PET_ARENA_MAX_HP) > Number(battle.player2_hp ?? PET_ARENA_MAX_HP) ? 'player1_win' : 'player2_win'); const winner = result === 'draw' ? null : (result === 'player1_win' ? battle.player1_telegram_id : battle.player2_telegram_id);
  await db.prepare(`UPDATE telegram_pet_arena_battles SET winner_telegram_id=?, result=? WHERE battle_id=?`).bind(winner, result, battle.battle_id).run();
  const winRewards = result === 'draw' ? { pet_xp: 18, community_xp: 3, moon_gold: 8 } : { pet_xp: 34, community_xp: 7, moon_gold: 20 };
  const lossRewards = { pet_xp: 10, community_xp: 0, moon_gold: 3 };
  const player1Scaled = scalePetArenaRewardsForPlayer(battle, result, String(battle.player1_telegram_id), result === 'player1_win' || result === 'draw' ? winRewards : lossRewards);
  const player2Scaled = scalePetArenaRewardsForPlayer(battle, result, String(battle.player2_telegram_id), result === 'player2_win' || result === 'draw' ? winRewards : lossRewards);
  const [player1Faction, player2Faction] = await Promise.all([
    db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id=?').bind(String(battle.player1_telegram_id)).first().catch(() => null),
    battle.player2_telegram_id && battle.player2_telegram_id !== 'app'
      ? db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id=?').bind(String(battle.player2_telegram_id)).first().catch(() => null) : null,
  ]);
  const player1Adjusted = applyPetFactionBonus(player1Scaled.rewards, player1Faction?.faction, 'arena');
  const player2Adjusted = applyPetFactionBonus(player2Scaled.rewards, player2Faction?.faction, 'arena');
  await awardPetKaijuPlayerResult(db, String(battle.player1_telegram_id), { match_id: battle.battle_id, mode: 'pet_arena', reward_modifier: player1Scaled.modifier, faction_bonus: player1Adjusted.bonus }, result === 'player1_win' ? 'arena_win' : result === 'draw' ? 'arena_draw' : 'arena_loss', player1Adjusted.rewards);
  if (battle.player2_telegram_id && battle.player2_telegram_id !== 'app') await awardPetKaijuPlayerResult(db, String(battle.player2_telegram_id), { match_id: battle.battle_id, mode: 'pet_arena', reward_modifier: player2Scaled.modifier, faction_bonus: player2Adjusted.bonus }, result === 'player2_win' ? 'arena_win' : result === 'draw' ? 'arena_draw' : 'arena_loss', player2Adjusted.rewards);
  await reconcileSanctuaryBestEffort(db, String(battle.player1_telegram_id), 'arena_terminal');
  if (battle.player2_telegram_id && battle.player2_telegram_id !== 'app') await reconcileSanctuaryBestEffort(db, String(battle.player2_telegram_id), 'arena_terminal');
  return { accepted:true, duplicate: duplicateCompletion, reason: duplicateCompletion ? 'already_completed' : 'arena_completed', battle: await getPetArenaBattle(db, battle.battle_id), result, rewards: { player1: { ...player1Scaled, rewards: player1Adjusted.rewards, faction_bonus: player1Adjusted.bonus }, player2: { ...player2Scaled, rewards: player2Adjusted.rewards, faction_bonus: player2Adjusted.bonus } } };
}
async function readyPetArenaBattle(db, battle, telegramId) {
  const isP1 = String(battle.player1_telegram_id) === String(telegramId);
  const isP2 = String(battle.player2_telegram_id) === String(telegramId);
  if (!isP1 && !isP2) return { accepted:false, reason:'not_participant', battle };
  const column = isP1 ? 'player1_ready_at' : 'player2_ready_at';
  await db.prepare(`UPDATE telegram_pet_arena_battles SET ${column}=COALESCE(${column}, CURRENT_TIMESTAMP), expires_at=?
    WHERE battle_id=? AND status IN ('readying','active')`).bind(petArenaExpiryTimestamp(), battle.battle_id).run();
  let updated = await getPetArenaBattle(db, battle.battle_id);
  if (updated?.player1_ready_at && updated?.player2_ready_at) {
    await db.prepare(`UPDATE telegram_pet_arena_battles SET status='active', expires_at=?
      WHERE battle_id=? AND status='readying' AND player1_ready_at IS NOT NULL AND player2_ready_at IS NOT NULL`)
      .bind(petArenaExpiryTimestamp(), battle.battle_id).run();
    updated = await getPetArenaBattle(db, battle.battle_id);
    await ensurePetArenaRound(db, battle.battle_id, Number(updated?.current_round || 1));
    return { accepted:true, reason:'round_prompt', battle: updated };
  }
  return { accepted:true, reason:'waiting_for_opponent', battle: updated };
}
async function forfeitPetArenaBattle(db, battle, telegramId) {
  const isP1 = String(battle.player1_telegram_id) === String(telegramId), isP2 = String(battle.player2_telegram_id) === String(telegramId);
  if (!isP1 && !isP2) return { accepted:false, reason:'not_participant', battle };
  if (!['readying','active'].includes(String(battle.status))) return { accepted:true, duplicate:true, reason:'already_completed', battle };
  const winner = isP1 ? battle.player2_telegram_id : battle.player1_telegram_id;
  const claim = await db.prepare(`UPDATE telegram_pet_arena_battles SET winner_telegram_id=?, result=?, player1_hp=?, player2_hp=? WHERE battle_id=? AND status IN ('readying','active')`).bind(winner === 'app' ? null : winner, isP1 ? 'player2_win' : 'player1_win', isP1 ? 0 : Number(battle.player1_hp || PET_ARENA_MAX_HP), isP2 ? 0 : Number(battle.player2_hp || PET_ARENA_MAX_HP), battle.battle_id).run();
  if (Number(claim?.meta?.changes || 0) <= 0) return { accepted:true, duplicate:true, reason:'already_completed', battle: await getPetArenaBattle(db, battle.battle_id) };
  return completePetArenaBattle(db, await getPetArenaBattle(db, battle.battle_id));
}
async function applyPetArenaMove(db, battle, telegramId, expectedRound, move) {
  const isP1 = String(battle.player1_telegram_id) === String(telegramId), isP2 = String(battle.player2_telegram_id) === String(telegramId);
  if (!isP1 && !isP2) return { accepted:false, reason:'not_participant', battle };
  if (String(battle.status) !== 'active') return { accepted:false, reason:'battle_not_active', battle };
  const roundNumber = Number(battle.current_round || 1); if (Number(expectedRound || 0) !== roundNumber) return { accepted:false, reason:'stale_arena_round', battle }; await ensurePetArenaRound(db, battle.battle_id, roundNumber);
  const col = isP1 ? 'player1_move' : 'player2_move';
  const claim = await db.prepare(`UPDATE telegram_pet_arena_rounds SET ${col}=? WHERE battle_id=? AND round_number=? AND status='selecting' AND ${col} IS NULL`).bind(move, battle.battle_id, roundNumber).run();
  if (Number(claim?.meta?.changes || 0) <= 0) return { accepted:true, duplicate:true, reason:'move_already_locked', battle: await getPetArenaBattle(db, battle.battle_id) };
  let round = await db.prepare(`SELECT * FROM telegram_pet_arena_rounds WHERE battle_id=? AND round_number=?`).bind(battle.battle_id, roundNumber).first();
  if (String(battle.player2_telegram_id) === 'app' && !round.player2_move) { const ai = selectPetArenaAppMove(battle); await db.prepare(`UPDATE telegram_pet_arena_rounds SET player2_move=? WHERE battle_id=? AND round_number=? AND player2_move IS NULL`).bind(ai, battle.battle_id, roundNumber).run(); round = { ...round, player2_move: ai }; }
  if (!round.player1_move || !round.player2_move) { await refreshPetArenaExpiry(db, battle.battle_id); return { accepted:true, reason:'waiting_for_opponent', battle: await getPetArenaBattle(db, battle.battle_id) }; }
  const resolved = resolvePetArenaRoundState(battle, round.player1_move, round.player2_move);
  const end = resolved.player1_hp <= 0 || resolved.player2_hp <= 0 || roundNumber >= Number(battle.max_rounds || PET_ARENA_MAX_ROUNDS);
  const result = resolved.player1_hp === resolved.player2_hp ? 'draw' : resolved.player1_hp > resolved.player2_hp ? 'player1_win' : 'player2_win';
  await db.prepare(`UPDATE telegram_pet_arena_rounds SET player1_damage=?, player2_damage=?, result_json=?, status='resolved', resolved_at=CURRENT_TIMESTAMP WHERE battle_id=? AND round_number=? AND status='selecting'`).bind(resolved.player1_damage, resolved.player2_damage, JSON.stringify(resolved), battle.battle_id, roundNumber).run();
  await db.prepare(`UPDATE telegram_pet_arena_battles SET player1_hp=?, player2_hp=?, player1_special=?, player2_special=?, current_round=?, last_round_log_json=?, result=?, winner_telegram_id=? WHERE battle_id=?`).bind(resolved.player1_hp, resolved.player2_hp, resolved.player1_special, resolved.player2_special, end ? roundNumber : roundNumber + 1, JSON.stringify({ round: roundNumber, moves: [round.player1_move, round.player2_move], log: resolved.log }), end ? result : battle.result, end && result !== 'draw' ? (result === 'player1_win' ? battle.player1_telegram_id : battle.player2_telegram_id) : null, battle.battle_id).run();
  if (!end) { await ensurePetArenaRound(db, battle.battle_id, roundNumber + 1); await refreshPetArenaExpiry(db, battle.battle_id); return { accepted:true, reason:'round_resolved', battle: await getPetArenaBattle(db, battle.battle_id), round, resolved }; }
  return completePetArenaBattle(db, await getPetArenaBattle(db, battle.battle_id));
}
async function cmdPetArena(db, tok, chatId, telegramId, argStr = '', chatType = '') {
  await db.prepare(`UPDATE telegram_pet_arena_queue SET status='expired', updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND status='waiting' AND updated_at < datetime('now', ?)`).bind(String(chatId), `-${PET_ARENA_QUEUE_TTL_MINUTES} minutes`).run().catch(() => {});
  await db.prepare(`UPDATE telegram_pet_arena_battles SET status='expired', completed_at=CURRENT_TIMESTAMP WHERE chat_id=? AND status IN ('readying','active') AND COALESCE(expires_at, created_at) < ?`).bind(String(chatId), new Date().toISOString()).run().catch(() => {});
  const arg = String(argStr || '').trim();
  if (arg.startsWith('ff:')) { const battleId = arg.slice(3); const battle = await getPetArenaBattle(db, battleId); if (!battle || String(battle.chat_id) !== String(chatId)) { await sendTelegramMessage(tok, chatId, 'That Pet Arena battle expired. Run /petarena for a fresh match.'); return; } const done = await forfeitPetArenaBattle(db, battle, telegramId); const copy = await appendMoonpetReaction(db, telegramId, 'arena', formatPetArenaResult(done.battle || battle), null, { activity_label: 'the arena result' }); await sendTelegramMessage(tok, chatId, copy); return; }
  if (arg.startsWith('mv:')) { const [, battleId, roundText, move] = arg.match(/^mv:(a-[a-f0-9]{10}):(\d{1,2}):(ah|ab|bh|bb|ch|sp)$/) || []; const battle = await getPetArenaBattle(db, battleId); if (!battle || String(battle.chat_id) !== String(chatId) || Number(battle.current_round || 1) < 1 || String(battle.status) !== 'active') { await sendTelegramMessage(tok, chatId, 'Stale Pet Arena move. Choose from the latest round prompt.'); return; } const applied = await applyPetArenaMove(db, battle, telegramId, Number(roundText), move); if (applied.reason === 'stale_arena_round') { await sendTelegramMessage(tok, chatId, 'Stale Pet Arena move. Choose from the latest round prompt.'); return; } if (applied.reason === 'waiting_for_opponent') { await sendTelegramMessage(tok, chatId, 'Move locked. Waiting for opponent.'); return; } if (applied.reason === 'move_already_locked') { await sendTelegramMessage(tok, chatId, 'Move already locked for this round. Waiting for the next round.'); return; } const latestBattle = applied.battle || battle; const prompt = formatPetArenaRoundPrompt(latestBattle); const copy = latestBattle.status === 'completed' ? await appendMoonpetReaction(db, telegramId, 'arena', prompt, null, { activity_label: 'the arena result' }) : prompt; await sendTelegramMessage(tok, chatId, copy, { reply_markup: (latestBattle.status === 'active') ? buildPetArenaMoveReplyMarkup(battleId, latestBattle.current_round) : undefined }); return; }
  if (arg.startsWith('stop:')) { const battleId = arg.slice(5); await db.prepare(`UPDATE telegram_pet_arena_battles SET status='cancelled', completed_at=CURRENT_TIMESTAMP WHERE battle_id=? AND chat_id=? AND status IN ('readying','active') AND (player1_telegram_id=? OR player2_telegram_id=?)`).bind(battleId, String(chatId), telegramId, telegramId).run(); await sendTelegramMessage(tok, chatId, 'Pet Arena battle cancelled.'); return; }
  if (arg === 'cancel') { await db.prepare(`UPDATE telegram_pet_arena_queue SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND telegram_id=? AND status='waiting'`).bind(String(chatId), telegramId).run(); await sendTelegramMessage(tok, chatId, 'Pet Arena queue cancelled.'); return; }
  const eligible = await ensurePetArenaEligible(db, telegramId); if (!eligible.ok) { await sendTelegramMessage(tok, chatId, eligible.reason === 'level_locked' ? 'Pet Arena unlocks at level 10. Keep growing your Moonpet.' : 'Adopt or heal your Moonpet before entering Pet Arena.'); return; }
  const pet = eligible.pet;
  if (!arg) { await sendTelegramMessage(tok, chatId, `<b>⚔️ Pet Arena</b>\nBattle Moonpet vs Moonpet. Gear, morale, condition, level and controlled RNG all matter.`, { reply_markup: buildPetArenaMenuReplyMarkup() }); return; }
  if (arg.startsWith('ready:')) { const battleId = arg.slice(6); const battle = await getPetArenaBattle(db, battleId); if (!battle || String(battle.chat_id) !== String(chatId) || !['readying','active'].includes(String(battle.status))) { await sendTelegramMessage(tok, chatId, 'That Pet Arena battle expired. Run /petarena for a fresh match.'); return; } const ready = await readyPetArenaBattle(db, battle, telegramId); if (ready.reason === 'waiting_for_opponent') { await sendTelegramMessage(tok, chatId, 'Ready locked. Waiting for the other Moonpet trainer.'); return; } if (!ready.accepted) { await sendTelegramMessage(tok, chatId, 'Only the two matched players can ready this Pet Arena battle.'); return; } await sendTelegramMessage(tok, chatId, formatPetArenaRoundPrompt(ready.battle || battle), { reply_markup: buildPetArenaMoveReplyMarkup(battleId, ready.battle?.current_round) }); return; }
  if (arg === 'status') { await sendTelegramMessage(tok, chatId, `Arena status: ${escapeHtml(pet.pet_name)} LVL ${getPetLevel(pet.pet_xp)} ${getPetArenaRankBucket(getPetLevel(pet.pet_xp))}. Power now: ${calculatePetArenaPower(pet, 'status')}.`); return; }
  if (await hasActivePetArenaBattle(db, chatId, telegramId)) { await sendTelegramMessage(tok, chatId, 'Finish your current Pet Arena battle first.'); return; }
  if (arg === 'app' || chatType === 'private') { const appPet = { ...pet, telegram_id: 'app', pet_name: 'App Moonpet', pet_xp: Math.max(0, Number(pet.pet_xp || 0) + 80), energy: 82, health: 88, happiness: 80, cleanliness: 80 }; const battle = await createPetArenaBattle(db, chatId, pet, appPet, 'app'); await sendTelegramMessage(tok, chatId, formatPetArenaRoundPrompt(battle), { reply_markup: buildPetArenaMoveReplyMarkup(battle.battle_id, battle.current_round) }); return; }
  const acceptAnyRank = arg === 'any' ? 1 : 0;
  const bucket = getPetArenaRankBucket(getPetLevel(pet.pet_xp)); await db.prepare(`INSERT INTO telegram_pet_arena_queue (id,chat_id,telegram_id,rank_bucket,pet_snapshot_json,status,accept_any_rank) VALUES (?,?,?,?,?,'waiting',?) ON CONFLICT(chat_id,telegram_id) WHERE status='waiting' DO UPDATE SET rank_bucket=excluded.rank_bucket, pet_snapshot_json=excluded.pet_snapshot_json, accept_any_rank=MAX(telegram_pet_arena_queue.accept_any_rank, excluded.accept_any_rank), updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), String(chatId), telegramId, bucket, JSON.stringify(buildPetArenaSnapshot(pet)), acceptAnyRank).run();
  const idx = PET_ARENA_BUCKET_ORDER.indexOf(bucket); const lower = PET_ARENA_BUCKET_ORDER[idx - 1] || ''; const upper = PET_ARENA_BUCKET_ORDER[idx + 1] || '';
  const rows = await db.prepare(`SELECT * FROM telegram_pet_arena_queue WHERE chat_id=? AND status='waiting' AND telegram_id<>? AND (rank_bucket=? OR rank_bucket IN (?,?) OR accept_any_rank=1 OR ?=1 OR updated_at < datetime('now', ?)) ORDER BY CASE WHEN rank_bucket=? THEN 0 WHEN rank_bucket IN (?,?) THEN 1 ELSE 2 END, created_at ASC LIMIT 6`).bind(String(chatId), telegramId, bucket, lower, upper, acceptAnyRank, `-${PET_ARENA_ANY_RANK_TIMEOUT_MINUTES} minutes`, bucket, lower, upper).all().catch(()=>({results:[]}));
  const opponent = (rows.results || []).find((row) => String(row.telegram_id) !== telegramId);
  if (!opponent) { await sendTelegramMessage(tok, chatId, 'Queued for Pet Arena. Prefer same rank; tap Accept Any Rank if matchmaking is slow.', { reply_markup: { inline_keyboard: [[{ text:'Accept Any Rank', callback_data:'pet:arena:any' }, { text:'Cancel Queue', callback_data:'pet:arena:cancel' }]] } }); return; }
  if (await hasActivePetArenaBattle(db, chatId, opponent.telegram_id)) { await sendTelegramMessage(tok, chatId, 'Queued for Pet Arena. A nearby trainer is finishing another battle first.'); return; }
  const oppPet = JSON.parse(opponent.pet_snapshot_json || '{}');
  const claimRows = await db.prepare(`UPDATE telegram_pet_arena_queue SET status='matched', updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND telegram_id IN (?,?) AND status='waiting'`).bind(String(chatId), telegramId, String(opponent.telegram_id)).run();
  if (Number(claimRows?.meta?.changes || 0) !== 2) { await db.prepare(`UPDATE telegram_pet_arena_queue SET status='waiting', updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND telegram_id=? AND status='matched'`).bind(String(chatId), telegramId).run().catch(() => {}); await sendTelegramMessage(tok, chatId, 'Pet Arena queue changed before the match was claimed. You are still queued; tap Find Pet Battle again to retry.'); return; }
  const battle = await createPetArenaBattle(db, chatId, pet, oppPet, 'group'); await sendTelegramMessage(tok, chatId, `<b>Pet Arena Match Found</b>
${escapeHtml(pet.pet_name)} LVL ${getPetLevel(pet.pet_xp)} vs ${escapeHtml(oppPet.pet_name || 'RivalPet')} LVL ${getPetLevel(oppPet.pet_xp)}`, { reply_markup: buildPetArenaMatchReplyMarkup(battle.battle_id) });
}
function formatPetArenaRoundPrompt(battle) { const p1 = safeParsePetArenaSnapshot(battle.player1_pet_snapshot_json); const p2 = safeParsePetArenaSnapshot(battle.player2_pet_snapshot_json); const last = safeParsePetArenaSnapshot(battle.last_round_log_json); const log = Array.isArray(last.log) ? `\n\nLast round: ${last.log.map(escapeHtml).join(' ')}` : ''; if (String(battle.status) === 'completed') return formatPetArenaResult(battle); return `<b>⚔️ Pet Arena Round ${Number(battle.current_round || 1)}</b>\n${escapeHtml(p1.pet_name || 'Moonpet')} HP: ${Number(battle.player1_hp ?? PET_ARENA_MAX_HP)}/${PET_ARENA_MAX_HP} | Special: ${Number(battle.player1_special || 0)}/${PET_ARENA_SPECIAL_COST}\n${escapeHtml(p2.pet_name || 'App Moonpet')} HP: ${Number(battle.player2_hp ?? PET_ARENA_MAX_HP)}/${PET_ARENA_MAX_HP} | Special: ${Number(battle.player2_special || 0)}/${PET_ARENA_SPECIAL_COST}${log}\n\nChoose your next move.`; }
function formatPetArenaResult(battle) { const winner = battle.winner_telegram_id || 'Draw'; return `<b>⚔️ Pet Arena Result</b>
Battle <code>${escapeHtml(battle.battle_id)}</code>
Winner: ${escapeHtml(String(winner))}
Final HP: ${Number(battle.player1_hp ?? PET_ARENA_MAX_HP)} vs ${Number(battle.player2_hp ?? PET_ARENA_MAX_HP)}
Key moves: attack head/body, block head/body, charge special, special move
Rewards: winner Moon Gold + pet XP + Community XP; loser consolation pet XP. Gear effects used from armor, weapon, charm, outfit and toy.`; }

async function expireOldPetActivitySessions(db, telegramId, now = new Date()) {
  await db.prepare(`
    UPDATE telegram_pet_activity_sessions
    SET status = 'expired'
    WHERE telegram_id = ? AND status = 'active' AND ends_at < datetime(?, ?)
  `).bind(String(telegramId), now.toISOString(), `-${PET_ACTIVITY_GRACE_SECONDS} seconds`).run().catch(() => {});
}

async function getActivePetActivitySession(db, telegramId, now = new Date()) {
  await expireOldPetActivitySessions(db, telegramId, now);
  return db.prepare(`
    SELECT * FROM telegram_pet_activity_sessions
    WHERE telegram_id = ? AND status = 'active'
    ORDER BY started_at DESC LIMIT 1
  `).bind(String(telegramId)).first().catch(() => null);
}

function parsePetActivitySessionMetadata(session) {
  try {
    const parsed = JSON.parse(session?.metadata || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function getRecoverablePetActivitySession(db, telegramId) {
  return db.prepare(`
    SELECT * FROM telegram_pet_activity_sessions
    WHERE telegram_id = ?
      AND ${PET_RECOVERABLE_ACTIVITY_PREDICATE}
    ORDER BY claimed_at ASC LIMIT 1
  `).bind(String(telegramId)).first().catch(() => null);
}

function getRecoverablePetActivityClaim(session) {
  const metadata = parsePetActivitySessionMetadata(session);
  const computed = metadata.computed;
  if (session?.status !== 'completed' || metadata.claim_state !== 'claiming' || !computed?.rewards) return null;
  const claimedAtMs = parseSqliteTs(session.claimed_at);
  return {
    computed,
    eventKey: metadata.reward_idempotency_key || buildStablePetEventKey(['pet_activity_claim', session.telegram_id, session.id]),
    rewardNow: claimedAtMs == null ? new Date() : new Date(claimedAtMs),
  };
}

function parsePersistedPetReward(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getPersistedPetActivityAward(db, telegramId, eventKey) {
  const persisted = await db.prepare(`
    SELECT claim.claim_id, claim.applied_rewards,
           event.pet_xp_awarded, event.xp_awarded
    FROM telegram_pet_reward_claims AS claim
    JOIN telegram_pet_events AS event
      ON event.telegram_id = claim.telegram_id
     AND event.event_key = ?
     AND event.status = 'accepted'
     AND json_valid(event.metadata) = 1
     AND json_extract(event.metadata, '$.source') = 'pet_activity'
     AND json_extract(event.metadata, '$.idempotency_key') = ?
    WHERE claim.telegram_id = ?
      AND claim.source = 'pet_activity'
      AND claim.idempotency_key = ?
      AND claim.status = 'awarded'
    LIMIT 1
  `).bind(eventKey, eventKey, String(telegramId), eventKey).first().catch(() => null);
  const rewards = parsePersistedPetReward(persisted?.applied_rewards);
  if (!persisted || !rewards) return null;
  const pet = await db.prepare(`SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?`)
    .bind(String(telegramId)).first().catch(() => null);
  if (!pet) return null;
  return {
    accepted: true,
    duplicate: true,
    claim_id: persisted.claim_id,
    pet_xp_awarded: Math.max(0, Math.floor(Number(persisted.pet_xp_awarded) || 0)),
    xp_awarded: Math.max(0, Math.floor(Number(persisted.xp_awarded) || 0)),
    rewards,
    pet,
  };
}

function computePetActivityRewards(activityType, elapsedSeconds) {
  const type = normalizePetActivityType(activityType);
  const cap = PET_ACTIVITY_CAP_SECONDS[type] || PET_ACTIVITY_MIN_SECONDS;
  const seconds = Math.max(0, Math.min(Math.floor(Number(elapsedSeconds) || 0), cap));
  const units = seconds / 1800;
  const rewards = { pet_xp: 0, community_xp: 0, moon_gold: 0, moon_crystals: 0, item_key: null, health: 0, hunger: 0, cleanliness: 0, energy: 0, happiness: 0 };
  if (type === 'sleep') Object.assign(rewards, { energy: Math.ceil(10 + units * 12), health: Math.ceil(4 + units * 5), hunger: Math.ceil(units * 3), cleanliness: -Math.ceil(units) });
  if (type === 'train') Object.assign(rewards, { pet_xp: Math.ceil(6 + units * 20), community_xp: Math.ceil(units * 2), energy: -Math.ceil(8 + units * 10), hunger: Math.ceil(5 + units * 5), cleanliness: -Math.ceil(2 + units * 3), happiness: Math.ceil(units * 2) });
  if (type === 'work') Object.assign(rewards, { moon_gold: Math.ceil(8 + units * 18), pet_xp: Math.ceil(2 + units * 4), community_xp: Math.ceil(units), energy: -Math.ceil(6 + units * 5), hunger: Math.ceil(units * 2) });
  if (type === 'explore') {
    Object.assign(rewards, { pet_xp: Math.ceil(4 + units * 8), moon_gold: Math.ceil(units * 8), energy: -Math.ceil(5 + units * 4), hunger: Math.ceil(units * 2), cleanliness: -Math.ceil(units * 2) });
    if (seconds >= 7200) rewards.item_key = 'adventure_map';
    else if (seconds >= 1800) rewards.moon_crystals = 1;
  }
  return { type, seconds, capped_seconds: seconds, rewards };
}

async function startPetActivitySession(db, telegramId, activityTypeRaw, options = {}) {
  const activityType = normalizePetActivityType(activityTypeRaw);
  if (!activityType) return { accepted: false, reason: 'invalid_activity' };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted' };
  const now = options.now || new Date();
  const active = await getActivePetActivitySession(db, telegramId, now);
  if (active) return { accepted: false, reason: 'already_busy', session: active, pet };
  const pendingClaim = await getRecoverablePetActivitySession(db, telegramId);
  if (pendingClaim) return { accepted: false, reason: 'activity_claim_pending', session: pendingClaim, pet };
  const cap = PET_ACTIVITY_CAP_SECONDS[activityType];
  const sessionId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO telegram_pet_activity_sessions
      (id, telegram_id, activity_type, started_at, ends_at, status, metadata)
    VALUES (?, ?, ?, ?, datetime(?, ?), 'active', ?)
  `).bind(sessionId, telegramId, activityType, now.toISOString(), now.toISOString(), `+${cap} seconds`, JSON.stringify({ source: options.source || 'telegram_bot', cap_seconds: cap })).run();
  return { accepted: true, reason: 'started', session: await getActivePetActivitySession(db, telegramId, now), pet };
}

async function claimPetActivitySession(db, telegramId, options = {}) {
  const now = options.now || new Date();
  let session = await getActivePetActivitySession(db, telegramId, now);
  let recovery = null;

  if (!session) {
    session = await getRecoverablePetActivitySession(db, telegramId);
    recovery = getRecoverablePetActivityClaim(session);
    if (!session || !recovery) return { accepted: false, reason: 'no_active_activity' };
  }

  let computed;
  let eventKey;
  let rewardNow;

  if (recovery) {
    ({ computed, eventKey, rewardNow } = recovery);
  } else {
    const startedAtMs = parseSqliteTs(session.started_at);
    if (startedAtMs == null) return { accepted: false, reason: 'activity_timestamp_invalid', session };
    const elapsedSeconds = Math.floor((now.getTime() - startedAtMs) / 1000);
    if (elapsedSeconds < PET_ACTIVITY_MIN_SECONDS) {
      return { accepted: false, reason: 'activity_too_short', retry_after_seconds: PET_ACTIVITY_MIN_SECONDS - elapsedSeconds, session };
    }
    eventKey = buildStablePetEventKey(['pet_activity_claim', telegramId, session.id]);
    computed = computePetActivityRewards(session.activity_type, elapsedSeconds);
    rewardNow = now;
    const claimMetadata = JSON.stringify({ computed, claim_state: 'claiming', reward_idempotency_key: eventKey });
    const claimResult = await db.prepare(`
      UPDATE telegram_pet_activity_sessions
      SET status = 'completed', claimed_at = ?, metadata = ?
      WHERE id = ? AND telegram_id = ? AND status = 'active'
        AND ends_at >= datetime(?, ?)
    `).bind(
      now.toISOString(), claimMetadata, session.id, telegramId, now.toISOString(),
      `-${PET_ACTIVITY_GRACE_SECONDS} seconds`,
    ).run();
    if (Number(claimResult?.meta?.changes || 0) !== 1) {
      const closedSession = await db.prepare(`SELECT * FROM telegram_pet_activity_sessions WHERE id = ? AND telegram_id = ? LIMIT 1`)
        .bind(session.id, telegramId).first().catch(() => session);
      recovery = getRecoverablePetActivityClaim(closedSession);
      if (!recovery) {
        return { accepted: false, reason: 'activity_already_closed', session: closedSession || session, computed };
      }
      session = closedSession;
      ({ computed, eventKey, rewardNow } = recovery);
    } else {
      session = { ...session, status: 'completed', claimed_at: now.toISOString(), metadata: claimMetadata };
    }
  }

  const { item_key: itemKey, health, hunger, cleanliness, energy, happiness, ...permanentRewards } = computed.rewards;
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_activity', idempotency_key: eventKey, event_key: eventKey,
    event_type: 'activity_claim', reason: session.activity_type,
    rewards: { ...permanentRewards, items: itemKey ? { [itemKey]: 1 } : {} },
    profile_deltas: { health, hunger, cleanliness, energy, happiness }, touch_streak: true, now: rewardNow,
    context: { source: options.source || 'telegram_bot', session_id: session.id, activity_type: session.activity_type },
  });
  if (!awarded.accepted) return { ...awarded, session, computed };

  const authoritativeAward = awarded.duplicate
    ? await getPersistedPetActivityAward(db, telegramId, eventKey)
    : awarded;
  if (!authoritativeAward) {
    return { accepted: false, reason: 'activity_reward_recovery_pending', session, computed };
  }
  const settledComputed = {
    ...computed,
    rewards: {
      ...computed.rewards,
      pet_xp: authoritativeAward.pet_xp_awarded,
      community_xp: authoritativeAward.xp_awarded,
      moon_gold: authoritativeAward.rewards.moon_gold,
      moon_crystals: authoritativeAward.rewards.moon_crystals,
      style_tokens: authoritativeAward.rewards.style_tokens,
    },
  };

  const settledMetadata = JSON.stringify({
    computed: settledComputed,
    applied_rewards: authoritativeAward.rewards,
    claim_state: 'settled',
    reward_idempotency_key: eventKey,
  });
  await db.prepare(`
    UPDATE telegram_pet_activity_sessions
    SET metadata = ?
    WHERE id = ? AND telegram_id = ? AND status = 'completed'
      AND json_valid(metadata) = 1
      AND json_extract(metadata, '$.claim_state') = 'claiming'
      AND json_extract(metadata, '$.reward_idempotency_key') = ?
  `).bind(settledMetadata, session.id, telegramId, eventKey).run();

  await awardActivePetActivityGrowthMark(db, telegramId, eventKey, rewardNow);

  await reconcileSanctuaryBestEffort(db, telegramId, 'activity_claim', { now: now.toISOString() });

  return {
    ...authoritativeAward,
    reason: authoritativeAward.duplicate ? 'duplicate' : 'claimed',
    session: { ...session, status: 'completed', metadata: settledMetadata },
    computed: settledComputed,
  };
}

async function awardActivePetActivityGrowthMark(db, telegramId, settlementEventKey, settledAt = new Date()) {
  try {
    const active = await findActivePetSlot(db, telegramId);
    if (!active) return { accepted: false, non_fatal: true, reason: 'active_pet_missing' };
    return await awardPetGrowthMark(db, {
      pet_id: active.pet_id,
      telegram_id: active.telegram_id,
      season_key: active.season_key,
      milestone: 'care',
      evidence_key: `care:activity:${settlementEventKey}`,
      earned_at: settledAt instanceof Date ? settledAt.toISOString() : settledAt,
    });
  } catch {
    return { accepted: false, non_fatal: true, reason: 'growth_mark_unavailable' };
  }
}

async function cancelPetActivitySession(db, telegramId) {
  const session = await getActivePetActivitySession(db, telegramId);
  if (!session) return { accepted: false, reason: 'no_active_activity' };
  const cancelResult = await db.prepare(`UPDATE telegram_pet_activity_sessions SET status = 'cancelled' WHERE id = ? AND telegram_id = ? AND status = 'active'`).bind(session.id, telegramId).run();
  if (Number(cancelResult?.meta?.changes || 0) !== 1) {
    return { accepted: false, reason: 'activity_already_closed', session };
  }
  await reconcileSanctuaryBestEffort(db, telegramId, 'activity_cancel');
  return { accepted: true, reason: 'cancelled', session };
}

async function processPetAction(db, telegramId, action, options = {}) {
  const normalizedAction = normalizePetAction(action);
  if (!normalizedAction && action !== 'adopt' && action !== 'rename') {
    return { accepted: false, reason: 'invalid_action', xp_awarded: 0, pet_xp_awarded: 0 };
  }

  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:${normalizedAction || action}:${telegramId}:${Date.now()}`).slice(0, 120);

  if (action === 'adopt') {
    const existingPet = await getPetProfile(db, telegramId);
    if (existingPet) {
      await ensurePetStarterSeasonSlot(db, telegramId, now);
      const lifecycleRow = await db.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE telegram_id=?')
        .bind(telegramId).first().catch(() => null);
      if (!lifecycleRow) {
        await createMoonEggLifecycle(db, telegramId, `${eventKey}:lifecycle-repair`);
        await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${eventKey}:memory-repair`, memory_type: 'first_adoption', milestone: 'first_adoption' });
        await evolveMoonpet(db, { telegram_id: telegramId, evolution_id: 'moon_egg', event_key: `${eventKey}:moon-egg-repair` });
      }
      return { accepted: false, reason: 'pet_already_adopted', xp_awarded: 0, pet_xp_awarded: 0, pet: existingPet };
    }
    const pet = await getOrCreatePetProfile(db, telegramId, options);
    await savePetProfile(db, pet);
    await createMoonEggLifecycle(db, telegramId, `${eventKey}:lifecycle`);
    await recordMoonpetMemory(db, { telegram_id: telegramId, event_key: `${eventKey}:memory`, memory_type: 'first_adoption', milestone: 'first_adoption' });
    await evolveMoonpet(db, { telegram_id: telegramId, evolution_id: 'moon_egg', event_key: `${eventKey}:moon_egg` });
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

  const existing = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (existing) {
    if (['feed', 'play', 'clean', 'sleep'].includes(String(existing.event_type || normalizedAction))) {
      await recordDailyCareChallenge(db, { telegram_id: telegramId, event_key: eventKey, utc_day: existing.day_key, now });
    }
    return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0, pet };
  }

  const busySession = await getActivePetActivitySession(db, telegramId, now);
  if (busySession && ['sleep', 'train'].includes(normalizedAction)) {
    return { accepted: false, reason: 'pet_busy', session: busySession, pet };
  }

  const lastAction = await db.prepare(`
    SELECT created_at FROM telegram_pet_events
    WHERE telegram_id = ? AND event_type = ? AND status = 'accepted'
    ORDER BY created_at DESC LIMIT 1
  `).bind(telegramId, normalizedAction).first().catch(() => null);
  if (lastAction?.created_at) {
    const elapsedSeconds = (now.getTime() - (parseSqliteTs(lastAction.created_at) ?? now.getTime())) / 1000;
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
  const actionHasWalletReward = hasPetAccountWalletDelta(tokenRewards);
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
  if (actionHasWalletReward && !(await ensurePetAccountWalletReadyForMutation(db, telegramId, now))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }

  pet.hunger = clampPetStat(Number(pet.hunger || 0) + rule.hunger);
  pet.happiness = clampPetStat(Number(pet.happiness || 0) + rule.happiness);
  pet.cleanliness = clampPetStat(Number(pet.cleanliness || 0) + rule.cleanliness);
  pet.energy = clampPetStat(Number(pet.energy || 0) + rule.energy);
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();

  const eventId = crypto.randomUUID();
  const metadata = JSON.stringify({ source: options.source || 'telegram_bot', rewards: tokenRewards });
  const actionResults = await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO telegram_pet_events
        (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pet_action_pending', ?
      WHERE ${actionHasWalletReward ? accountWalletRecoveryResolvedSql('?') : '1 = 1'}
        AND (? = '' OR EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ?))
      RETURNING id
    `).bind(eventId, pet.pet_id || null, telegramId, normalizedAction, eventKey, communityXp, petXp, season.key, dayKey, weekKey, metadata,
      ...(actionHasWalletReward ? [telegramId] : []), pet.pet_id || '', pet.pet_id || '', telegramId),
    accountWalletDeltaStatement(db, telegramId, tokenRewards,
      "EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')", [eventId]),
    db.prepare(`UPDATE telegram_pet_profiles SET
        pet_xp = ?,
        level = ?,
        stage = ?,
        hunger = ?,
        happiness = ?,
        cleanliness = ?,
        energy = ?,
        health = ?,
        streak_days = ?,
        last_active_day = ?,
        last_decay_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')`)
      .bind(pet.pet_xp, getPetLevel(pet.pet_xp), getPetGrowthStage(pet.pet_xp), pet.hunger, pet.happiness, pet.cleanliness, pet.energy, pet.health,
        pet.streak_days, pet.last_active_day, pet.last_decay_at, telegramId, eventId),
    db.prepare(`UPDATE telegram_pet_instances SET
        pet_xp = ?,
        level = ?,
        stage = ?,
        hunger = ?,
        happiness = ?,
        cleanliness = ?,
        energy = ?,
        health = ?,
        streak_days = ?,
        last_active_day = ?,
        last_decay_at = ?,
        source_profile_updated_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND pet_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')`)
      .bind(pet.pet_xp, getPetLevel(pet.pet_xp), getPetGrowthStage(pet.pet_xp), pet.hunger, pet.happiness, pet.cleanliness, pet.energy, pet.health,
        pet.streak_days, pet.last_active_day, pet.last_decay_at, PET_INSTANCE_AUTHORITY_VERSION, telegramId, pet.pet_id || '', eventId),
    db.prepare(`
      INSERT INTO telegram_pet_season_state
        (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET
        season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key,
        weekly_key = excluded.weekly_key,
        updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey, eventId),
    db.prepare(`UPDATE telegram_pet_events
      SET status = 'accepted', reason = ?
      WHERE id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ? AND pet_xp = ?)
        AND (
          pet_id IS NULL OR EXISTS (
            SELECT 1 FROM telegram_pet_instances WHERE pet_id = telegram_pet_events.pet_id AND telegram_id = ? AND pet_xp = ?
          )
        )
      RETURNING id`)
      .bind(reason, eventId, telegramId, pet.pet_xp, telegramId, pet.pet_xp),
  ]);
  if (!actionResults?.[5]?.results?.[0]) {
    const acceptedDuplicate = await buildAcceptedPetEventDuplicate(db, telegramId, eventKey, pet, { action: normalizedAction, season });
    if (acceptedDuplicate) {
      if (['feed', 'play', 'clean', 'sleep'].includes(normalizedAction)) {
        const existingEvent = await readAcceptedPetEventByKey(db, telegramId, eventKey);
        await recordDailyCareChallenge(db, {
          telegram_id: telegramId,
          event_key: eventKey,
          utc_day: existingEvent?.day_key,
          now,
        });
      }
      return acceptedDuplicate;
    }
    return { accepted: false, reason: 'pet_action_not_persisted', action: normalizedAction, xp_awarded: 0, pet_xp_awarded: 0, pet };
  }

  if (communityXp > 0) {
    await awardCommunityXp(db, telegramId, communityXp, `pet_${normalizedAction}`, eventKey);
  }

  const persistedPet = await getPetProfile(db, telegramId);
  if (persistedPet) Object.assign(persistedPet, await readPetAccountWallet(db, telegramId) || {});

  const careBehaviour = ['feed', 'play', 'clean', 'sleep'].includes(normalizedAction) ? 'care' : 'combat';
  await recordMoonpetBehaviour(db, { telegram_id: telegramId, event_key: `${eventKey}:personality`, behaviour: careBehaviour, activity: careBehaviour });
  if (careBehaviour === 'care') {
    const existingEvent = await readAcceptedPetEventByKey(db, telegramId, eventKey);
    await recordDailyCareChallenge(db, {
      telegram_id: telegramId,
      event_key: eventKey,
      utc_day: existingEvent?.day_key,
      now,
    });
  }

  return { accepted: true, reason, action: normalizedAction, xp_awarded: communityXp, pet_xp_awarded: petXp, pet: persistedPet || pet, season };
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
  const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  if (getPetLevel(pet.pet_xp) < item.min_level) return { accepted: false, reason: 'level_locked', item, pet };
  if (String(pet[`equipped_${item.slot}`] || '') === item.key) return { accepted: false, reason: 'already_equipped', item, pet };
  if (!(await ensurePetAccountWalletReadyForMutation(db, telegramId, now))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', item, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  Object.assign(pet, await readPetAccountWallet(db, telegramId) || {});
  if (!canAffordPetItem(pet, item)) return { accepted: false, reason: 'not_enough_pet_currency', item, pet };

  const cost = item.cost || {};
  const walletDeltas = {
    moon_gold: -Math.max(0, Number(cost.moon_gold || 0)),
    moon_crystals: -Math.max(0, Number(cost.moon_crystals || 0)),
    style_tokens: -Math.max(0, Number(cost.style_tokens || 0)),
  };
  const eventId = crypto.randomUUID();
  const metadata = JSON.stringify({ source: options.source || 'telegram_bot', item_key: item.key, slot: item.slot, cost });
  const purchasedAt = now.toISOString();
  const purchaseResults = await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO telegram_pet_events
        (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, 'buy', ?, 0, 0, ?, ?, ?, 'pending', 'shop_purchase_pending', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles
        WHERE telegram_id = ? AND ${accountWalletAffordabilitySql()} AND ${accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id')})
      RETURNING id
    `).bind(eventId, telegramId, eventKey, season.key, dayKey, weekKey, metadata, telegramId,
      walletDeltas.moon_gold, walletDeltas.moon_crystals, walletDeltas.style_tokens),
    accountWalletDeltaStatement(db, telegramId, walletDeltas,
      "EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')", [eventId]),
    db.prepare(`
      UPDATE telegram_pet_profiles
      SET equipped_${item.slot} = ?, last_decay_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
    `).bind(item.key, purchasedAt, telegramId, eventId),
    db.prepare(`
      UPDATE telegram_pet_instances
      SET equipped_${item.slot} = ?, last_decay_at = ?, source_profile_updated_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND pet_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
    `).bind(item.key, purchasedAt, PET_INSTANCE_AUTHORITY_VERSION, telegramId, pet.pet_id || '', eventId),
    db.prepare(`
      UPDATE telegram_pet_events
      SET status = 'accepted', reason = 'shop_purchase'
      WHERE id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ? AND equipped_${item.slot} = ?)
      RETURNING id
    `).bind(eventId, telegramId, item.key),
  ]);
  if (!purchaseResults?.[4]?.results?.[0]) {
    const acceptedDuplicate = await buildAcceptedPetEventDuplicate(db, telegramId, eventKey, pet, { item });
    if (acceptedDuplicate) return acceptedDuplicate;
    return { accepted: false, reason: 'not_enough_pet_currency', item, pet };
  }
  const persistedPet = await getPetProfile(db, telegramId);
  if (persistedPet) Object.assign(persistedPet, await readPetAccountWallet(db, telegramId) || {});
  return { accepted: true, reason: 'shop_purchase', item, pet: persistedPet || pet, xp_awarded: 0, pet_xp_awarded: 0 };
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
  const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (duplicate) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  if (!(await ensurePetAccountWalletReadyForMutation(db, telegramId, now))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  Object.assign(pet, await readPetAccountWallet(db, telegramId) || {});
  if (clampPetCurrency(pet.moon_gold) < wager) return { accepted: false, reason: 'not_enough_moon_gold', pet };

  const lastTrade = await db.prepare(`
    SELECT created_at FROM telegram_pet_events
    WHERE telegram_id = ? AND event_type = 'trade' AND status = 'accepted'
    ORDER BY created_at DESC LIMIT 1
  `).bind(telegramId).first().catch(() => null);
  if (lastTrade?.created_at) {
    const elapsedSeconds = (now.getTime() - (parseSqliteTs(lastTrade.created_at) ?? now.getTime())) / 1000;
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
  const walletDeltas = { moon_gold: goldDelta, moon_crystals: crystalDelta };
  pet.pet_xp = Math.max(0, Math.floor(Number(pet.pet_xp || 0) + petXp));
  updatePetStreakForAction(pet, dayKey);
  pet.last_decay_at = now.toISOString();

  const eventId = crypto.randomUUID();
  const metadata = JSON.stringify({ source: options.source || 'telegram_bot', wager, won, gold_delta: goldDelta, crystal_delta: crystalDelta, roll });
  const tradeResults = await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO telegram_pet_events
        (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, 'trade', ?, 0, ?, ?, ?, ?, 'pending', 'trade_pending', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles
        WHERE telegram_id = ? AND ${accountWalletAffordabilitySql()} AND ${accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id')})
      RETURNING id
    `).bind(eventId, telegramId, eventKey, petXp, season.key, dayKey, weekKey, metadata, telegramId,
      walletDeltas.moon_gold, walletDeltas.moon_crystals, walletDeltas.style_tokens || 0),
    accountWalletDeltaStatement(db, telegramId, walletDeltas,
      "EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')", [eventId]),
    db.prepare(`
      UPDATE telegram_pet_profiles
      SET pet_xp = ?, level = ?, stage = ?, streak_days = ?, last_active_day = ?, last_decay_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
    `).bind(pet.pet_xp, getPetLevel(pet.pet_xp), getPetGrowthStage(pet.pet_xp), pet.streak_days, pet.last_active_day, pet.last_decay_at, telegramId, eventId),
    db.prepare(`
      UPDATE telegram_pet_instances
      SET pet_xp = ?, level = ?, stage = ?, streak_days = ?, last_active_day = ?, last_decay_at = ?, source_profile_updated_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND pet_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
    `).bind(pet.pet_xp, getPetLevel(pet.pet_xp), getPetGrowthStage(pet.pet_xp), pet.streak_days, pet.last_active_day, pet.last_decay_at,
      PET_INSTANCE_AUTHORITY_VERSION, telegramId, pet.pet_id || '', eventId),
    db.prepare(`
      INSERT INTO telegram_pet_season_state
        (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET
        season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key,
        weekly_key = excluded.weekly_key,
        updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, season.key, petXp, petXp, petXp, dayKey, weekKey, eventId),
    db.prepare(`
      UPDATE telegram_pet_events
      SET status = 'accepted', reason = ?
      WHERE id = ? AND status = 'pending'
      RETURNING id
    `).bind(won ? 'trade_won' : 'trade_lost', eventId),
  ]);
  if (!tradeResults?.[5]?.results?.[0]) {
    const acceptedDuplicate = await buildAcceptedPetEventDuplicate(db, telegramId, eventKey, pet, { wager });
    if (acceptedDuplicate) return acceptedDuplicate;
    return { accepted: false, reason: 'not_enough_moon_gold', pet };
  }
  const persistedPet = await getPetProfile(db, telegramId);
  if (persistedPet) Object.assign(persistedPet, await readPetAccountWallet(db, telegramId) || {});

  return { accepted: true, reason: won ? 'trade_won' : 'trade_lost', wager, won, gold_delta: goldDelta, crystal_delta: crystalDelta, xp_awarded: 0, pet_xp_awarded: petXp, pet: persistedPet || pet };
}

async function processPetAdventure(db, telegramId, adventureKeyRaw, options = {}) {
  const requestedChoice = normalizePetAdventureChoice(adventureKeyRaw);
  const encounterKey = String(options.encounter_key || options.encounterKey || '').trim();
  const now = new Date();
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
    const elapsedSeconds = (now.getTime() - (parseSqliteTs(lastAdventure.created_at) ?? now.getTime())) / 1000;
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

  const outcome = pickPetRandomEventOutcome(choice);
  const applied = applyPetRandomEventDeltas(
    { ...pet },
    { ...outcome.rewards },
    outcome.costs,
  );
  const profileDeltas = buildPetProfileDeltas(applied.rewardsApplied, {
    ...applied.costsApplied,
    energy: Number(applied.costsApplied.energy || 0),
  });
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_adventure', idempotency_key: eventKey, event_key: eventKey,
    event_type: 'adventure', reason: `${encounter.key}:${choice.key}:${outcome.kind}`,
    rewards: applied.rewardsApplied, currency_costs: applied.costsApplied, profile_deltas: profileDeltas,
    touch_streak: true, now,
    context: { source: options.source || 'telegram_bot', encounter_key: encounter.key, choice_key: choice.key, result_kind: outcome.kind, copy: outcome.copy },
  });
  applied.rewardsApplied = awarded.rewards;
  applied.deltas.pet_xp = awarded.pet_xp_awarded;
  if (awarded.accepted) {
    await recordMoonpetBehaviour(db, { telegram_id: telegramId, event_key: `${eventKey}:personality`, behaviour: 'exploration', activity: 'adventure' });
    await recordMoonpetBiggestReward(db, { telegram_id: telegramId, reward_amount: awarded.rewards?.moon_gold, reward_currency: 'moon_gold' });
  }

  return {
    ...awarded,
    reason: awarded.duplicate ? 'duplicate' : `${encounter.key}:${choice.key}`,
    encounter,
    choice,
    result_copy: outcome.copy,
    applied,
  };
}

function serializePetLeaderboardEntry(row, index = 0) {
  const phase = ['egg', 'young', 'adult', 'rare'].includes(String(row?.lifecycle_phase || ''))
    ? String(row.lifecycle_phase)
    : 'egg';
  const revealed = phase !== 'egg';
  const speciesId = revealed && MOONPET_SPECIES[row?.lifecycle_species_id] ? String(row.lifecycle_species_id) : null;
  const rareMorphId = phase === 'rare' && row?.rare_morph_id ? String(row.rare_morph_id) : null;
  return {
    rank: Math.max(1, Number(row?.rank) || Number(index) + 1),
    pet_name: row?.pet_name || 'Moonpet',
    stage: rareMorphId || row?.stage || 'moon_egg',
    phase,
    species_id: speciesId,
    species_name: speciesId ? MOONPET_SPECIES[speciesId].name : null,
    rare_morph_id: rareMorphId,
    rare_morph_name: rareMorphId ? rareMorphId.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : null,
    level: Number(row?.level || 1),
    pet_xp: Number(row?.pet_xp || 0),
    moon_gold: clampPetCurrency(row?.moon_gold),
    moon_crystals: clampPetCurrency(row?.moon_crystals),
    style_tokens: clampPetCurrency(row?.style_tokens),
    streak_days: Number(row?.streak_days || 0),
  };
}

async function materializePetLeaderboardRows(db, rows = []) {
  return Promise.all(rows.map(async (row) => {
    if (row.lifecycle_phase && (row.lifecycle_phase === 'egg' || row.lifecycle_species_id)) return row;
    await ensurePetStarterSeasonSlot(db, row.telegram_id).catch(() => null);
    await ensureActivePetInstance(db, row.telegram_id).catch(() => null);
    const lifecycle = await ensureMoonpetLifecycle(db, row.telegram_id).catch(() => null);
    if (!lifecycle) return row;
    return {
      ...row,
      lifecycle_phase: lifecycle.phase,
      lifecycle_species_id: lifecycle.species_id,
      rare_morph_id: lifecycle.rare_morph_id,
    };
  }));
}

function serializePet(pet, identity = null) {
  if (!pet) return null;
  const decayed = applyPetDecay({ ...pet });
  const currentEvolution = identity?.current_stage || null;
  return {
    pet_id: decayed.pet_id || null,
    telegram_id: decayed.telegram_id,
    pet_name: decayed.pet_name,
    species: decayed.species,
    stage: currentEvolution?.name || null,
    evolution_id: currentEvolution?.evolution_id || null,
    evolution_stage: currentEvolution ? Math.max(0, Number(currentEvolution.stage) || 0) : null,
    growth_stage: getPetGrowthStage(decayed.pet_xp),
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
    equipped_armor: decayed.equipped_armor || null,
    equipped_weapon: decayed.equipped_weapon || null,
    equipped_charm: decayed.equipped_charm || null,
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
  const nextDayKey = getPetDayKey(new Date(now.getTime() + 86400000));
  const [events, equipmentUpgradeEvents, pet] = await Promise.all([
    db.prepare(`
      SELECT event_type, COUNT(*) AS count
      FROM telegram_pet_events
      WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'
      GROUP BY event_type
    `).bind(telegramId, dayKey).all().catch(() => ({ results: [] })),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM telegram_pet_system_events
      WHERE telegram_id = ? AND system_key = 'equipment_upgrade' AND status = 'completed'
        AND updated_at >= ? AND updated_at < ?
    `).bind(telegramId, dayKey, nextDayKey).first().catch(() => null),
    getPetProfile(db, telegramId).catch(() => null),
  ]);
  const counts = Object.fromEntries((events.results || []).map((row) => [row.event_type, Number(row.count || 0)]));
  const equipmentUpgradeCount = Number(equipmentUpgradeEvents?.count || 0);
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
      { key: `pet-daily-shop:${dayKey}`, title: 'Buy or upgrade one pet item', completed: Number(counts.buy || 0) + equipmentUpgradeCount > 0 },
      { key: `pet-daily-adventure:${dayKey}`, title: 'Run one pet adventure', completed: Number(counts.adventure || 0) + Number(counts.run_extract || 0) + Number(counts.run_complete || 0) + Number(counts.district_mission || 0) + Number(counts.event_chain || 0) + Number(counts.seasonal_boss || 0) > 0 },
      { key: `pet-daily-bank:${dayKey}`, title: 'Bank 50 Moon Gold', completed: clampPetCurrency(pet?.moon_gold) >= 50 },
    ],
  };
}

function getPetNeedsAlert(pet, missions = null) {
  const p = serializePet(pet);
  if (!p) return null;
  const unfinishedMission = missions?.daily?.find((mission) => !mission.completed);
  if (p.health <= 45) return { reason: 'health_low', destination: 'home', text: `${p.pet_name} health is low. Open Moonpet OS and restore its needs before taking risks.` };
  if (p.hunger >= 75) return { reason: 'hungry', destination: 'home', text: `${p.pet_name} is hungry. Open Moonpet OS and feed it before health drops.` };
  if (p.cleanliness <= 35) return { reason: 'dirty', destination: 'home', text: `${p.pet_name} needs cleaning. Open Moonpet OS to restore cleanliness.` };
  if (p.energy <= 25) return { reason: 'tired', destination: 'home', text: `${p.pet_name} is tired. Open Moonpet OS and sleep before training or adventures.` };
  if (p.happiness <= 35) return { reason: 'lonely', destination: 'home', text: `${p.pet_name} wants attention. Open Moonpet OS for a play session.` };
  if (unfinishedMission) return { reason: 'mission_open', destination: 'missions', text: `${p.pet_name} still has a daily mission open: ${unfinishedMission.title}.` };
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
    const telegramId = String(row.telegram_id);
    const pet = applyPetDecay({ ...row });
    let guidanceState = null;
    let guidanceNotices = [];
    try {
      guidanceState = await buildPetGuidanceState(env.DB, telegramId, pet);
      guidanceNotices = await persistPetGuidanceNotices(
        env.DB,
        telegramId,
        buildPetGuidanceCandidates(guidanceState || {}),
      );
    } catch (error) {
      logApiFailure('telegram_pet_guidance_notification_failed', {
        telegramId,
        message: error?.message || String(error),
      });
    }
    const missions = guidanceState
      ? { daily: guidanceState.missions || [] }
      : await buildPetMissions(env.DB, telegramId).catch(() => null);
    const alert = guidanceNotices.length
      ? {
          reason: 'progress_ready',
          destination: 'home',
          text: `${guidanceNotices.slice(0, 3).map((notice) => `🎉 ${notice.title}`).join('\n')}${guidanceNotices.length > 3 ? `\n+${guidanceNotices.length - 3} more unlocks are available.` : ''}\nOpen Moonpet OS for the best next move.`,
        }
      : getPetNeedsAlert(pet, missions);
    if (!alert) {
      skipped += 1;
      continue;
    }
    const result = await sendTelegramMessage(tok, telegramId, `<b>Crypto Moonboy Pet Update</b>\n${escapeHtml(alert.text)}\n\nAlert settings are inside Moonpet OS.`, { reply_markup: buildPetMiniAppLaunchReplyMarkup(alert.destination || 'home') });
    if (result?.ok) {
      sent += 1;
      if (guidanceNotices.length) await markPetGuidanceNoticesShown(env.DB, telegramId, guidanceNotices).catch((error) => {
        logApiFailure('telegram_pet_guidance_notification_mark_failed', {
          telegramId,
          message: error?.message || String(error),
        });
      });
      await env.DB.prepare(`
        UPDATE telegram_pet_notification_settings
        SET last_notified_at = CURRENT_TIMESTAMP, last_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `).bind(alert.reason, telegramId).run().catch(() => {});
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
  const updatedAtTs = parseSqliteTs(existing?.updated_at);
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

async function authenticatePetMiniApp(body, env) {
  if (body?.init_data) {
    const verified = await verifyTelegramMiniAppInitData(body.init_data, env.TELEGRAM_BOT_TOKEN, { max_age_seconds: 3600 });
    if (!verified.ok) return { error: verified.reason, status: 401 };
    return verified;
  }
  const verified = await verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth);
  if (verified.error) return verified;
  return { ok: true, telegramId: verified.telegramId, user: verified.user, authDate: Number(verified.authPayload?.auth_date || 0) };
}

function serializePetMiniAppArenaBattle(battle, telegramId = '') {
  if (!battle) return null;
  const isPlayer2 = String(battle.player2_telegram_id || '') === String(telegramId);
  const player = safeParsePetArenaSnapshot(isPlayer2 ? battle.player2_pet_snapshot_json : battle.player1_pet_snapshot_json);
  const opponent = safeParsePetArenaSnapshot(isPlayer2 ? battle.player1_pet_snapshot_json : battle.player2_pet_snapshot_json);
  delete player.telegram_id;
  delete opponent.telegram_id;
  const winner = battle.winner_telegram_id || null;
  const mode = String(battle.player2_telegram_id) === 'app' ? 'solo' : 'multiplayer';
  const outcome = !battle.result ? null : battle.result === 'draw' ? 'draw' : String(winner || '') === String(telegramId) ? 'win' : 'loss';
  return {
    battle_id: battle.battle_id,
    status: battle.status,
    result: battle.result,
    current_round: Number(battle.current_round || 1),
    max_rounds: Number(battle.max_rounds || PET_ARENA_MAX_ROUNDS),
    player_hp: Number(isPlayer2 ? battle.player2_hp ?? PET_ARENA_MAX_HP : battle.player1_hp ?? PET_ARENA_MAX_HP),
    opponent_hp: Number(isPlayer2 ? battle.player1_hp ?? PET_ARENA_MAX_HP : battle.player2_hp ?? PET_ARENA_MAX_HP),
    player_special: Number(isPlayer2 ? battle.player2_special || 0 : battle.player1_special || 0),
    opponent_special: Number(isPlayer2 ? battle.player1_special || 0 : battle.player2_special || 0),
    special_cost: PET_ARENA_SPECIAL_COST,
    player,
    opponent,
    moves: buildPetArenaMovePreviews(battle, telegramId),
    opponent_intent: mode === 'solo' && battle.status === 'active'
      ? serializePetArenaMovePreview(selectPetArenaAppMove(battle), Number(battle.player2_special || 0))
      : null,
    last_round: orientPetArenaLastRound(battle, isPlayer2),
    outcome,
    mode,
    ready: Boolean(isPlayer2 ? battle.player2_ready_at : battle.player1_ready_at),
    opponent_ready: Boolean(isPlayer2 ? battle.player1_ready_at : battle.player2_ready_at),
  };
}

function serializePetMiniAppKaijuMatch(match, telegramId = '') {
  if (!match) return null;
  const isPlayer2 = String(match.player2_telegram_id || '') === String(telegramId);
  const ownCard = isPlayer2 ? match.player2_card_key : match.player1_card_key;
  const opponentCard = isPlayer2 ? match.player1_card_key : (match.mode === 'solo' ? match.cpu_card_key : match.player2_card_key);
  const winner = match.winner_telegram_id || null;
  const completed = match.status === 'completed';
  const category = PET_KAIJU_CATEGORIES.find((entry) => entry.key === match.category_key) || null;
  const rawScore = completed ? safeParsePetArenaSnapshot(match.score_json) : {};
  const ownScore = isPlayer2 ? rawScore.opponent : rawScore.player1;
  const rivalScore = isPlayer2 ? rawScore.player1 : rawScore.opponent;
  return {
    match_id: match.match_id,
    mode: match.mode,
    status: match.status,
    result: completed ? match.result : null,
    category_key: category?.key || null,
    category,
    roll: category ? Number(match.roll || category.roll || 0) : null,
    score_json: completed ? match.score_json : null,
    score: completed ? {
      player: Number(ownScore?.score || 0),
      opponent: Number(rivalScore?.score || 0),
    } : null,
    own_card_key: ownCard || null,
    opponent_card_key: completed ? opponentCard || null : null,
    role: isPlayer2 ? 'player2' : 'player1',
    own_card_locked: Boolean(ownCard),
    opponent_card_locked: Boolean(opponentCard),
    outcome: !match.result ? null : match.result === 'draw' ? 'draw' : String(winner || '') === String(telegramId) ? 'win' : 'loss',
  };
}

const PET_MINI_APP_LEADERBOARD_PERIODS = new Set(['daily', 'weekly', 'seasonal', 'all_time', 'run_depth']);

async function buildPetMiniAppLeaderboard(db, telegramId, requestedPeriod = 'seasonal', requestedLimit = 25) {
  const period = PET_MINI_APP_LEADERBOARD_PERIODS.has(String(requestedPeriod || '').toLowerCase())
    ? String(requestedPeriod).toLowerCase()
    : 'seasonal';
  const limit = Math.min(Math.max(Number(requestedLimit) || 25, 1), 50);
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const season = getPetSeasonInfo(now);
  let scoreSql;
  let scoreBindings = [];
  if (period === 'daily') {
    scoreSql = `SELECT telegram_id, SUM(pet_xp_awarded) AS pet_xp
      FROM telegram_pet_events WHERE day_key = ? AND status = 'accepted' GROUP BY telegram_id`;
    scoreBindings = [dayKey];
  } else if (period === 'weekly') {
    scoreSql = `SELECT telegram_id, SUM(pet_xp_awarded) AS pet_xp
      FROM telegram_pet_events WHERE week_key = ? AND status = 'accepted' GROUP BY telegram_id`;
    scoreBindings = [weekKey];
  } else if (period === 'all_time') {
    scoreSql = 'SELECT telegram_id, pet_xp FROM telegram_pet_profiles';
  } else if (period === 'run_depth') {
    scoreSql = `SELECT telegram_id, MAX(depth) AS pet_xp FROM telegram_pet_runs WHERE status IN ('completed','extracted','failed') GROUP BY telegram_id`;
  } else {
    scoreSql = 'SELECT telegram_id, season_xp AS pet_xp FROM telegram_pet_season_state WHERE season_key = ?';
    scoreBindings = [season.key];
  }
  const rows = await db.prepare(`
    WITH scores AS (${scoreSql}),
    ranked AS (
      SELECT scores.telegram_id, scores.pet_xp, p.pet_name,
        COALESCE(
          (SELECT pe.evolution_id FROM telegram_pet_evolutions_by_pet pe
            WHERE pe.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = scores.telegram_id)
            ORDER BY pe.stage DESC LIMIT 1),
          (SELECT pe.evolution_id FROM telegram_pet_evolutions pe WHERE pe.telegram_id=scores.telegram_id ORDER BY pe.stage DESC LIMIT 1),
          'moon_egg'
        ) AS stage,
        p.level, p.moon_gold, p.moon_crystals, p.style_tokens, p.streak_days, p.updated_at,
        l.phase AS lifecycle_phase, l.species_id AS lifecycle_species_id, l.rare_morph_id,
        ROW_NUMBER() OVER (ORDER BY scores.pet_xp DESC, COALESCE(p.updated_at, '') ASC, scores.telegram_id ASC) AS rank
      FROM scores
      LEFT JOIN telegram_pet_profiles p ON p.telegram_id = scores.telegram_id
      LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.telegram_id = scores.telegram_id AND l.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = scores.telegram_id)
    )
    SELECT * FROM ranked WHERE rank <= ? OR telegram_id = ? ORDER BY rank
  `).bind(...scoreBindings, limit, String(telegramId)).all();
  const materialized = await materializePetLeaderboardRows(db, rows.results || []);
  const serialized = materialized.map((row) => ({
    ...serializePetLeaderboardEntry(row, Number(row.rank || 1) - 1),
    is_current: String(row.telegram_id) === String(telegramId),
  }));
  return {
    period,
    season,
    entries: serialized.filter((entry) => entry.rank <= limit),
    self: serialized.find((entry) => entry.is_current) || null,
  };
}

const miniAppProgressInteger = (value, fallback = 0) => Math.max(0, Math.floor(Number(value ?? fallback) || 0));

function countMiniAppCompletedJourneyObjectives(rows = [], definitions = {}) {
  return rows.reduce((count, row) => {
    const objective = definitions[String(row.challenge_id || row.objective_id || '')];
    if (!objective) return count;
    const target = miniAppProgressInteger(objective.target, 1);
    const progressMode = String(objective.progress_mode || objective.validation_rules?.progress_mode || 'add');
    const progress = progressMode === 'max'
      ? miniAppProgressInteger(row.max_progress, target)
      : Math.min(target, miniAppProgressInteger(row.additive_progress, target));
    return progress >= target ? count + 1 : count;
  }, 0);
}

async function countPetMiniAppCompletedDailyJourneyObjectives(db, telegramId, petId, seasonKey, dayKey) {
  const rows = await db.prepare(`SELECT challenge_id, SUM(progress_value) AS additive_progress, MAX(progress_value) AS max_progress
    FROM telegram_pet_daily_journey_objectives
    WHERE pet_id=? AND telegram_id=? AND season_key=? AND utc_day=? AND status='accepted'
    GROUP BY challenge_id`)
    .bind(petId, telegramId, seasonKey, dayKey).all().catch(() => ({ results: [] }));
  return countMiniAppCompletedJourneyObjectives(rows.results || [], PET_DAILY_CHALLENGES);
}

async function countPetMiniAppCompletedWeeklyJourneyObjectives(db, telegramId, petId, seasonKey, week) {
  const rows = await db.prepare(`SELECT objective_id, SUM(progress_value) AS additive_progress, MAX(progress_value) AS max_progress
    FROM telegram_pet_weekly_journey_objectives
    WHERE pet_id=? AND telegram_id=? AND season_key=? AND qualification_week=? AND status='accepted'
    GROUP BY objective_id`)
    .bind(petId, telegramId, seasonKey, week).all().catch(() => ({ results: [] }));
  return countMiniAppCompletedJourneyObjectives(rows.results || [], PET_WEEKLY_JOURNEY_OBJECTIVES);
}

async function buildPetMiniAppJourneySummary(db, telegramId, seasonSlots, now = new Date()) {
  const activeSlot = (seasonSlots?.slots || []).find((slot) => slot.active) || null;
  const petId = String(activeSlot?.pet_id || '');
  const seasonKey = String(activeSlot?.season_key || seasonSlots?.season?.key || '');
  const dayKey = getPetDayKey(now);
  const week = Math.min(13, Math.max(1, Number(seasonSlots?.current_season_week || getPetSeasonWeek(seasonSlots?.season || getPetSeasonInfo(now), now)) || 1));
  if (!petId || !seasonKey) {
    return {
      daily: { utc_day: dayKey, completed_objectives: 0, required_objectives: 3, growth_mark_awarded: false, duplicate_blocked: false, reason: 'active_pet_required' },
      weekly: { qualification_week: week, completed_objectives: 0, required_objectives: 5, weekly_crest_awarded: false, duplicate_blocked: false, reason: 'active_pet_required' },
    };
  }
  const [dailyObjectives, dailyReceipt, weeklyObjectives, weeklyReceipt] = await Promise.all([
    countPetMiniAppCompletedDailyJourneyObjectives(db, telegramId, petId, seasonKey, dayKey),
    db.prepare(`SELECT status, reason, growth_mark_id, completed_objectives
      FROM telegram_pet_daily_journey_receipts
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND utc_day=?
      ORDER BY created_at DESC LIMIT 1`)
      .bind(petId, telegramId, seasonKey, dayKey).first().catch(() => null),
    countPetMiniAppCompletedWeeklyJourneyObjectives(db, telegramId, petId, seasonKey, week),
    db.prepare(`SELECT status, reason, crest_id, completed_objectives
      FROM telegram_pet_weekly_journey_receipts
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND qualification_week=?
      ORDER BY created_at DESC LIMIT 1`)
      .bind(petId, telegramId, seasonKey, week).first().catch(() => null),
  ]);
  const dailyCompleted = Math.max(Number(dailyObjectives || 0), Number(dailyReceipt?.completed_objectives || 0));
  const weeklyCompleted = Math.max(Number(weeklyObjectives || 0), Number(weeklyReceipt?.completed_objectives || 0));
  return {
    daily: {
      pet_id: petId, season_key: seasonKey, utc_day: dayKey,
      completed_objectives: dailyCompleted, required_objectives: 3,
      growth_mark_awarded: Boolean(dailyReceipt?.status === 'accepted' && dailyReceipt?.growth_mark_id),
      duplicate_blocked: dailyReceipt?.reason === 'daily_journey_growth_mark_duplicate',
      reason: dailyReceipt?.reason || (dailyCompleted >= 3 ? 'daily_journey_ready' : 'daily_journey_in_progress'),
    },
    weekly: {
      pet_id: petId, season_key: seasonKey, qualification_week: week,
      completed_objectives: weeklyCompleted, required_objectives: 5,
      weekly_crest_awarded: Boolean(weeklyReceipt?.status === 'accepted' && weeklyReceipt?.crest_id),
      duplicate_blocked: weeklyReceipt?.reason === 'weekly_journey_crest_duplicate',
      reason: weeklyReceipt?.reason || (weeklyCompleted >= 5 ? 'weekly_journey_ready' : 'weekly_journey_in_progress'),
    },
  };
}

async function buildPetMiniAppState(db, telegramId, botToken) {
  // State preparation owns current-season initialization. Roster projection
  // remains read-only and assumes this authoritative bootstrap already ran.
  await preparePetMiniAppState(db, telegramId);
  const petRaw = await getPetProfile(db, telegramId).catch(() => null);
  if (!petRaw) {
    return {
      adopted: false,
      pet: null,
      next: { key: 'adopt', title: 'Wake the Moon Egg', detail: 'Adopt your first Moonpet to begin.', action: 'adopt' },
      jobs: Object.values(PET_JOBS),
      shop_items: [],
      inventory: [],
      missions: [],
      season_slots: null,
    };
  }

  const pet = serializePet(petRaw);
  const lifecycle = await getMoonpetLifecycle(db, telegramId).catch(() => null);
  const [guidance, inventory, runtime, gear, materials, relics, arena, arenaQueue, recentArena, kaiju, kaijuQueue, recentKaiju, leaderboard, notifications, seasonSlots, sanctuary] = await Promise.all([
    buildPetGuidanceState(db, telegramId, petRaw),
    getPetInventory(db, telegramId).catch(() => []),
    getOrCreatePetRuntimeState(db, telegramId, getPetDayKey(new Date())).catch(() => null),
    db.prepare(`SELECT item_key, slot, item_level, item_xp, mastery_xp, mastery_tier
      FROM telegram_pet_equipment_progression WHERE telegram_id = ?
      ORDER BY slot, item_level DESC, item_key`).bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT material_key, quantity FROM telegram_pet_material_balances
      WHERE telegram_id = ? AND quantity > 0 ORDER BY material_key`).bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT relic_id, acquired_at FROM telegram_pet_relics
      WHERE telegram_id = ? ORDER BY acquired_at DESC`).bind(telegramId).all().catch(() => ({ results: [] })),
    getPetArenaBattleForPlayer(db, PET_MINI_APP_ARENA_LOBBY, telegramId)
      .then((battle) => battle || getPetArenaBattleForPlayer(db, `mini:${telegramId}`, telegramId)),
    getPetArenaQueueState(db, PET_MINI_APP_ARENA_LOBBY, telegramId),
    db.prepare(`SELECT * FROM telegram_pet_arena_battles WHERE status='completed'
      AND (player1_telegram_id=? OR player2_telegram_id=?) ORDER BY completed_at DESC LIMIT 1`)
      .bind(String(telegramId), String(telegramId)).first().catch(() => null),
    getPetKaijuMatchForPlayer(db, telegramId).then((match) => match || getActivePetKaijuMatch(db, `mini:kaiju:${telegramId}`)).catch(() => null),
    getPetKaijuQueueState(db, telegramId),
    db.prepare(`SELECT * FROM telegram_pet_kaiju_matches WHERE status='completed'
      AND (player1_telegram_id=? OR player2_telegram_id=?) ORDER BY completed_at DESC LIMIT 1`)
      .bind(String(telegramId), String(telegramId)).first().catch(() => null),
    db.prepare(`SELECT p.telegram_id, p.pet_name,
        COALESCE(
          (SELECT e.evolution_id FROM telegram_pet_evolutions_by_pet e
            WHERE e.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = p.telegram_id)
            ORDER BY e.stage DESC LIMIT 1),
          (SELECT e.evolution_id FROM telegram_pet_evolutions e WHERE e.telegram_id=p.telegram_id ORDER BY e.stage DESC LIMIT 1),
          'moon_egg'
        ) AS stage,
        p.level, p.pet_xp, p.moon_gold, p.moon_crystals, p.style_tokens, p.streak_days,
        l.phase AS lifecycle_phase, l.species_id AS lifecycle_species_id, l.rare_morph_id
      FROM telegram_pet_profiles p
      LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.telegram_id = p.telegram_id AND l.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = p.telegram_id)
      ORDER BY p.pet_xp DESC, p.updated_at ASC LIMIT 10`)
      .all().catch(() => ({ results: [] })),
    getPetNotificationPreference(db, telegramId),
    buildPetSeasonSlotSummary(db, telegramId).catch(() => null),
    listSanctuaryPets(db, telegramId).catch(() => []),
  ]);
  const leaderboardRows = await materializePetLeaderboardRows(db, leaderboard.results || []);
  const journeySummary = await buildPetMiniAppJourneySummary(db, telegramId, seasonSlots).catch(() => null);
  const hydratedKaiju = await ensurePetKaijuMatchCategory(db, kaiju).catch(() => kaiju);
  const encounter = selectPetRandomEncounter(guidance?.identity || {});
  const adventureBase = selectPetAdventureEncounter(petRaw);
  const adventure = adventureBase ? {
    ...adventureBase,
    event_key: `${adventureBase.key}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 120),
  } : null;
  const [encounterToken, adventureToken] = await Promise.all([
    encounter ? issuePetMiniAppChallenge({ type: 'event', telegram_id: telegramId, encounter_key: encounter.key, event_key: encounter.event_key }, botToken) : null,
    adventure ? issuePetMiniAppChallenge({ type: 'adventure', telegram_id: telegramId, encounter_key: adventure.key, event_key: adventure.event_key }, botToken) : null,
  ]);
  const canonicalPet = serializePet(petRaw, guidance?.identity);
  if (guidance) {
    guidance.pet = canonicalPet;
    if (guidance.identity) guidance.identity.lifecycle = lifecycle;
  }
  const liveSystems = await buildPetLiveSystemsState(db, telegramId, canonicalPet, runtime, gear.results || [], materials.results || []);
  const guidedNext = guidance ? choosePetNextAction(guidance) : null;
  const affordableUpgrade = liveSystems.upgrades.find((item) => item.affordable && !item.maxed);
  const availableDistrict = liveSystems.regions.find((region) => region.available && !region.completed);
  const affordableCosmetic = liveSystems.cosmetics.find((item) => item.affordable && (!item.unlocked || item.repeatable));
  const activeChain = liveSystems.chains.find((chain) => chain.available);
  const liveNext = liveSystems.prestige.ready
    ? { key: 'prestige', title: 'Ascend Prestige', detail: 'Requires Level 100, 3 mastered items and 4 completed districts. Cost: 5,000 Gold + 50 Gems. Reward: +1 Prestige rank and 3 Mastery Tokens.', action: 'prestige', destination: 'profile' }
    : affordableUpgrade
      ? { key: 'gear_upgrade', title: `Upgrade ${String(affordableUpgrade.item_key).replaceAll('_', ' ')}`, detail: `Cost: ${Object.entries(affordableUpgrade.cost).map(([key, value]) => `${value} ${key.replaceAll('_', ' ')}`).join(' + ')}. Reward: gear level ${affordableUpgrade.target_level}.`, action: 'gear_upgrade', destination: 'economy' }
      : liveSystems.seasonal_boss.available
        ? { key: 'seasonal_boss', title: `Raid ${liveSystems.seasonal_boss.title}`, detail: `Requires Level ${liveSystems.seasonal_boss.min_level}. Cost: 18 Energy. Defeat reward: 150 XP, 250 Gold, 8 Gems, 8 ${String(liveSystems.seasonal_boss.reward).replaceAll('_', ' ')} and 1 Mastery Token.`, action: 'seasonal_boss', destination: 'explore' }
        : availableDistrict
          ? { key: 'district_mission', title: `Build ${availableDistrict.title} mastery`, detail: `Cost: 10 Energy. Choose safe, balanced or bold: the server previews clear odds, mastery and reward ceiling. Setbacks bank partial mastery; crossing each 100-mastery line requires a district boss clear.`, action: 'district_mission', destination: 'explore' }
          : affordableCosmetic
            ? { key: 'cosmetic_unlock', title: `Unlock ${String(affordableCosmetic.key).replaceAll('_', ' ')}`, detail: `Cost: ${Object.entries(affordableCosmetic.cost).map(([key, value]) => `${value} ${key.replaceAll('_', ' ')}`).join(' + ')}. Reward: permanent Style Lab unlock${affordableCosmetic.repeatable ? ' that may be collected again' : ''}.`, action: 'cosmetic_unlock', destination: 'economy' }
            : activeChain
              ? { key: 'event_chain', title: `Continue ${String(activeChain.key).replaceAll('_', ' ')}`, detail: `Current step ${activeChain.step_index + 1}/${activeChain.steps.length}: ${String(activeChain.current_step).replaceAll('_', ' ')}. Choose one of two authored routes; each choice adds its shown bonus to the protected base reward.`, action: 'event_chain', destination: 'explore' }
              : null;
  const next = lifecycle?.phase === 'egg'
    ? { key: 'incubate', title: lifecycle.incubation.ready ? 'Hatch the Moon Egg' : 'Shape the Moon Egg', detail: lifecycle.incubation.ready ? 'The shell is answering. Hatch when ready.' : `Build ${lifecycle.incubation.target} signal with at least three kinds of care.`, action: lifecycle.incubation.ready ? 'hatch' : 'incubate', destination: 'home' }
    : lifecycle?.rare?.ready
      ? { key: 'rare_morph', title: 'Answer the hidden signal', detail: 'Your companion history has opened a one-of-one morph path.', action: 'rare_morph', destination: 'profile' }
      : guidedNext?.key && guidedNext.key !== 'maintain' ? guidedNext : liveNext || guidedNext;
  const guidanceNotices = guidance
    ? await persistPetGuidanceNotices(db, telegramId, buildPetGuidanceCandidates(guidance)).catch(() => [])
    : [];
  const activeRun = guidance?.active_run || null;
  const dailyReservation = activeRun
    ? await getDailyMoonRunReservation(db, { telegram_id: telegramId, run_id: activeRun.run_id })
    : null;
  let dailyRoom = null;
  if (dailyReservation) {
    const roomNumber = Math.max(1, Number(dailyReservation.current_room || 0) + 1);
    const row = await db.prepare(`SELECT room_number, room_type, status, generated_data
      FROM telegram_pet_run_rooms
      WHERE telegram_id = ? AND run_id = ? AND room_number = ? LIMIT 1`)
      .bind(telegramId, activeRun.run_id, roomNumber).first().catch(() => null);
    if (row) {
      const persistedRoom = { ...safeJsonParse(row.generated_data, {}), room: row.room_number, room_type: row.room_type, status: row.status };
      const roomDefinition = PET_ROGUELITE_ROOMS[persistedRoom.content_id] || null;
      const authoredRoom = serializePetRunRoom(
        { ...activeRun, depth: Number(dailyReservation.current_room || 0) },
        roomDefinition,
        persistedRoom.boss_id || persistedRoom.enemy_id || null,
      );
      dailyRoom = authoredRoom ? { ...persistedRoom, ...authoredRoom, choices: persistedRoom.choices || [] } : persistedRoom;
    }
  }
  const runChoices = activeRun
    ? (dailyReservation
      ? (dailyRoom?.choices || []).map((choice) => ({
        key: choice.choice_id,
        label: choice.label || choice.title || choice.copy || String(choice.choice_id || '').replaceAll('_', ' '),
        type: dailyRoom.room_type,
      }))
      : getPetRunStepChoices(activeRun).map((choice) => serializePetRunChoicePreview(activeRun, choice, petRaw, inventory)))
    : [];
  return {
    adopted: true,
    pet: canonicalPet,
    lifecycle,
    next,
    guidance,
    notices: guidanceNotices,
    progress: runtime,
    season_slots: seasonSlots,
    daily_journey: journeySummary?.daily || null,
    weekly_journey: journeySummary?.weekly || null,
    sanctuary,
    gear: gear.results || [],
    materials: Object.entries(PET_CRAFTING_MATERIALS).map(([key, definition]) => ({
      key,
      label: definition.label,
      quantity: Math.max(0, Number((materials.results || []).find((row) => row.material_key === key)?.quantity || 0)),
      sources: definition.sources,
    })),
    relics: relics.results || [],
    regions: liveSystems.regions,
    live_systems: liveSystems,
    inventory,
    run: activeRun ? {
      ...activeRun,
      daily: Boolean(dailyReservation),
      current_room: Number(dailyReservation?.current_room ?? activeRun.current_room ?? activeRun.depth ?? 0),
      max_room: Number(dailyReservation?.max_room ?? activeRun.max_room ?? activeRun.max_depth ?? 0),
      expected_step_index: Number(dailyReservation ? dailyReservation.current_room : Number(activeRun.depth || 0) + 1),
      room: dailyRoom || activeRun.room || null,
      choices: runChoices,
    } : null,
    encounter: encounter ? {
      key: encounter.key,
      event_key: encounter.event_key,
      challenge_token: encounterToken,
      title: encounter.title,
      intro: encounter.intro,
      choices: encounter.choices.map((choice) => ({ key: choice.key, label: choice.label })),
    } : null,
    adventure: adventure ? {
      key: adventure.key,
      event_key: adventure.event_key,
      challenge_token: adventureToken,
      title: adventure.title,
      intro: adventure.intro,
      choices: adventure.choices.map((choice) => ({ key: choice.key, label: choice.label })),
    } : null,
    arena: serializePetMiniAppArenaBattle(arena, telegramId),
    arena_queue: arenaQueue,
    arena_result: serializePetMiniAppArenaBattle(recentArena, telegramId),
    kaiju: {
      match: serializePetMiniAppKaijuMatch(hydratedKaiju, telegramId),
      queue: kaijuQueue,
      result: serializePetMiniAppKaijuMatch(recentKaiju, telegramId),
      cards: PET_KAIJU_CARDS.map((card) => serializePetKaijuCardPreview(card, hydratedKaiju?.category_key)),
      categories: PET_KAIJU_CATEGORIES,
    },
    leaderboard: leaderboardRows.map((entry, index) => serializePetLeaderboardEntry(entry, index)),
    notifications: {
      enabled: Boolean(notifications?.enabled),
      last_notified_at: notifications?.last_notified_at || null,
      last_reason: notifications?.last_reason || null,
    },
    server_time: new Date().toISOString(),
  };
}

function petMiniAppEventKey(telegramId, action, requestId) {
  const suffix = String(requestId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72);
  return buildStablePetEventKey(['mini', telegramId, action, suffix]);
}

const PET_MINI_APP_FUTURE_COMBAT_ACTIONS = new Set([
  'arena_start', 'arena_matchmake', 'arena_queue_cancel', 'arena_ready', 'arena_move', 'arena_forfeit',
  'kaiju_start', 'kaiju_matchmake', 'kaiju_queue_cancel', 'kaiju_card',
]);

async function hasCompletedPetMiniAppSeasonPet(db, telegramId, now = new Date()) {
  const seasonKey = getPetSeasonInfo(now).key;
  const row = await db.prepare(`SELECT 1 AS completed
    FROM telegram_pet_season_completions
    WHERE telegram_id=? AND season_key=?
    LIMIT 1`)
    .bind(String(telegramId), seasonKey).first().catch(() => null);
  return Boolean(row?.completed);
}

async function processPetMiniAppAction(db, telegramId, user, body, botToken) {
  const action = String(body?.action || '').trim().toLowerCase();
  const eventKey = petMiniAppEventKey(telegramId, action, body?.request_id);
  const source = 'telegram_mini_app';
  if (action === 'adopt') return processPetAction(db, telegramId, 'adopt', { event_key: eventKey, source });
  if (action === 'incubate') return incubateMoonEgg(db, telegramId, body.care_type, eventKey);
  if (action === 'hatch') return hatchMoonpet(db, telegramId, eventKey);
  if (action === 'rare_morph') return morphMoonpetRare(db, telegramId, eventKey);
  const lifecycle = await getMoonpetLifecycle(db, telegramId).catch(() => null);
  const eggAllowedActions = ['guidance_ack', 'notification_set', 'season_slots', 'buy_pet_slot', 'switch_pet_slot'];
  if (lifecycle?.phase === 'egg' && !eggAllowedActions.includes(action)) {
    return { accepted: false, reason: 'moon_egg_must_hatch', lifecycle };
  }
  if (PET_MINI_APP_FUTURE_COMBAT_ACTIONS.has(action) && !await hasCompletedPetMiniAppSeasonPet(db, telegramId)) {
    return { accepted: false, reason: 'completed_season_pet_required' };
  }
  if (action === 'season_slots') return { accepted: true, reason: 'season_slots', season_slots: await buildPetSeasonSlotSummary(db, telegramId) };
  if (action === 'buy_pet_slot') return buyPetSeasonSlot(db, telegramId, body.slot_number, { event_key: eventKey, switch_active: body.switch_active });
  if (action === 'switch_pet_slot') return switchActivePetSeasonSlot(db, telegramId, body.pet_id || body.slot_number);
  if (['feed', 'play', 'clean', 'sleep', 'train'].includes(action)) {
    const result = await processPetAction(db, telegramId, action, { event_key: eventKey, source });
    if (result.accepted) await applyPetRuntimeCommandAward(db, telegramId, `runtime:mini:${eventKey}`, action);
    return result;
  }
  if (action === 'rename') return processPetAction(db, telegramId, 'rename', { event_key: eventKey, pet_name: body.pet_name, source });
  if (action === 'buy') return processPetShopPurchase(db, telegramId, body.item_key, { event_key: eventKey, source });
  if (action === 'use_item') return processPetUseItem(db, telegramId, body.item_key, { event_key: eventKey, source });
  if (action === 'trade') return processPetGoldTrade(db, telegramId, body.wager, { event_key: eventKey, source });
  if (action === 'work') {
    const result = await processPetJob(db, telegramId, body.job_key, { event_key: eventKey, source });
    if (result.accepted) await applyPetRuntimeCommandAward(db, telegramId, `runtime:mini:${eventKey}`, 'job');
    return result;
  }
  if (action === 'daily_chest') {
    const result = await processPetDailyChest(db, telegramId, { event_key: eventKey, source });
    if (result.accepted) await applyPetRuntimeCommandAward(db, telegramId, `runtime:mini:${eventKey}`, 'daily_chest');
    return result;
  }
  if (action === 'random_event') {
    const challenge = await verifyPetMiniAppChallenge(body.challenge_token, botToken, { type: 'event', telegram_id: telegramId });
    if (!challenge.ok) return { accepted: false, reason: challenge.reason };
    const displayedEventKey = String(challenge.payload.event_key || '').slice(0, 120);
    const encounter = resolvePetRandomEncounter(displayedEventKey);
    if (!encounter || encounter.key !== challenge.payload.encounter_key) return { accepted: false, reason: 'invalid_event_key' };
    return processPetRandomEvent(db, telegramId, body.choice, { event_key: displayedEventKey, encounter, source });
  }
  if (action === 'adventure') {
    const challenge = await verifyPetMiniAppChallenge(body.challenge_token, botToken, { type: 'adventure', telegram_id: telegramId });
    if (!challenge.ok) return { accepted: false, reason: challenge.reason };
    const displayedEventKey = String(challenge.payload.event_key || '').slice(0, 120);
    const encounter = resolvePetAdventureEncounter(displayedEventKey);
    if (!encounter || encounter.key !== challenge.payload.encounter_key) return { accepted: false, reason: 'invalid_adventure_key' };
    return processPetAdventure(db, telegramId, body.adventure_key, { event_key: displayedEventKey, encounter, source });
  }
  if (action === 'run_start') return startOrResumePetRun(db, telegramId, { run_id: body.run_id, source });
  if (action === 'daily_run_start') return createDailyMoonRun(db, { telegram_id: telegramId });
  if (action === 'run_step') {
    const reservation = await getDailyMoonRunReservation(db, { telegram_id: telegramId, run_id: body.run_id });
    return reservation
      ? processDailyMoonRunStep(db, { telegram_id: telegramId, run_id: body.run_id, choice_key: body.choice_key, expected_step_index: body.expected_step_index })
      : processPetRunStep(db, telegramId, body.run_id, body.choice_key, { event_key: eventKey, expected_step_index: body.expected_step_index, source });
  }
  if (action === 'run_extract') {
    const reservation = await getDailyMoonRunReservation(db, { telegram_id: telegramId, run_id: body.run_id });
    return reservation
      ? extractDailyMoonRun(db, { telegram_id: telegramId, run_id: body.run_id })
      : processPetRunExtract(db, telegramId, body.run_id, { event_key: eventKey, source });
  }
  if (action === 'activity_start') return startPetActivitySession(db, telegramId, body.activity_type, { source });
  if (action === 'activity_claim') {
    const result = await claimPetActivitySession(db, telegramId, { source });
    if (result.accepted) {
      const runtimeAction = result.session.activity_type === 'train' ? 'timed_train' : result.session.activity_type === 'work' ? 'timed_work' : result.session.activity_type;
      await applyPetRuntimeCommandAward(db, telegramId, `runtime:activity:${result.session.id}`, runtimeAction);
    }
    return result;
  }
  if (action === 'activity_cancel') return cancelPetActivitySession(db, telegramId);
  if (action === 'notification_set') {
    const preference = await setPetNotificationPreference(db, telegramId, body.enabled === true);
    return { accepted: true, reason: preference.enabled ? 'notifications_enabled' : 'notifications_disabled', preference };
  }
  if (action === 'guidance_ack') {
    const keys = [...new Set((Array.isArray(body.notice_keys) ? body.notice_keys : [])
      .map((key) => String(key || '').trim().slice(0, 180)).filter(Boolean))].slice(0, 50);
    await markPetGuidanceNoticesShown(db, telegramId, keys.map((key) => ({ key })));
    return { accepted: true, reason: 'guidance_acknowledged', acknowledged: keys.length };
  }
  if (action === 'bounty_claim') return claimPetEconomyBounty(db, telegramId, body.bounty_key);
  if (action === 'expedition') return runPetCrystalExpedition(db, telegramId, new Date(), eventKey);
  if (action === 'market_buy') return buyPetMarketOffer(db, telegramId, body.offer_key);
  if (action === 'district_mission') {
    const petRaw = await getPetProfileWithAtomicDecay(db, telegramId, new Date());
    if (!petRaw) return { accepted: false, reason: 'pet_not_adopted' };
    const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
    const runtime = await getOrCreatePetRuntimeState(db, telegramId, getPetDayKey(new Date()));
    const faction = await db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id=?').bind(telegramId).first().catch(() => null);
    return processPetDistrictMission(db, telegramId, body.region_key, serializePet(petRaw, identity), runtime, (args) => awardPetReward(db, args), faction?.faction, body.approach_key);
  }
  if (action === 'event_chain') {
    const petRaw = await getPetProfile(db, telegramId);
    if (!petRaw) return { accepted: false, reason: 'pet_not_adopted' };
    const faction = await db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id=?').bind(telegramId).first().catch(() => null);
    return processPetEventChain(db, telegramId, body.chain_key, (args) => awardPetReward(db, args), faction?.faction, body.choice_key);
  }
  if (action === 'seasonal_boss') {
    const petRaw = await getPetProfileWithAtomicDecay(db, telegramId, new Date());
    if (!petRaw) return { accepted: false, reason: 'pet_not_adopted' };
    const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
    return processPetSeasonalBoss(db, telegramId, serializePet(petRaw, identity), (args) => awardPetReward(db, args));
  }
  if (action === 'gear_upgrade') return processPetEquipmentUpgrade(db, telegramId, body.item_key, eventKey);
  if (action === 'craft') return processPetCraftRecipe(db, telegramId, body.recipe_key, eventKey);
  if (action === 'cosmetic_unlock') return processPetCosmeticUnlock(db, telegramId, body.cosmetic_key, eventKey);
  if (action === 'prestige') {
    const petRaw = await getPetProfile(db, telegramId);
    if (!petRaw) return { accepted: false, reason: 'pet_not_adopted' };
    const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
    const runtime = await getOrCreatePetRuntimeState(db, telegramId, getPetDayKey(new Date()));
    const [gear, materials] = await Promise.all([
      db.prepare('SELECT item_key, slot, item_level, item_xp, mastery_xp, mastery_tier FROM telegram_pet_equipment_progression WHERE telegram_id=?').bind(telegramId).all(),
      db.prepare('SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all(),
    ]);
    const live = await buildPetLiveSystemsState(db, telegramId, serializePet(petRaw, identity), runtime, gear.results || [], materials.results || []);
    return processPetPrestige(db, telegramId, live, eventKey);
  }
  if (action === 'weekly_boss') return processPetWeeklyBoss(db, telegramId, body.move, eventKey);
  if (action === 'season_claim') return claimPetSeasonReward(db, telegramId, body.tier_id, eventKey);
  if (action === 'evolve') {
    const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
    const next = Object.values(MOONPET_EVOLUTIONS).find((entry) => entry.stage === Number(identity?.current_stage?.stage || 0) + 1);
    if (!next) return { accepted: false, reason: 'final_evolution_reached' };
    const result = await evolveMoonpet(db, { telegram_id: telegramId, evolution_id: body.evolution_id || next.evolution_id, event_key: eventKey });
    if (result.accepted && !result.duplicate) result.lifecycle = await syncMoonpetLifecycleStage(db, telegramId, next.stage);
    if (result.accepted) await finalizeActivePetEvolutionProgress(db, telegramId);
    return result;
  }
  if (action === 'arena_start') {
    const eligible = await ensurePetArenaEligible(db, telegramId);
    if (!eligible.ok) return { accepted: false, reason: eligible.reason };
    const miniChatId = `mini:${telegramId}`;
    const active = await getPetArenaBattleForPlayer(db, PET_MINI_APP_ARENA_LOBBY, telegramId)
      || await getPetArenaBattleForPlayer(db, miniChatId, telegramId);
    if (active) return { accepted: false, reason: 'arena_battle_active' };
    const appPet = { ...eligible.pet, telegram_id: 'app', pet_name: 'CRT-9 Rival', pet_xp: Math.max(0, Number(eligible.pet.pet_xp || 0) + 80), energy: 82, health: 88, happiness: 80, cleanliness: 80 };
    const battle = await createPetArenaBattle(db, miniChatId, eligible.pet, appPet, 'app', { mini_app_solo_guard: true });
    if (!battle) return { accepted: false, reason: 'arena_queue_active' };
    return { accepted: true, reason: 'arena_started', battle };
  }
  if (action === 'arena_matchmake') return queuePetArenaMiniApp(db, telegramId, body.accept_any_rank === true);
  if (action === 'arena_queue_cancel') return cancelPetArenaMiniAppQueue(db, telegramId);
  if (action === 'arena_ready') {
    const battle = await getPetArenaBattle(db, body.battle_id);
    if (!battle || ![battle.player1_telegram_id, battle.player2_telegram_id].map(String).includes(String(telegramId))) {
      return { accepted: false, reason: 'arena_battle_not_found' };
    }
    return readyPetArenaBattle(db, battle, telegramId);
  }
  if (action === 'arena_move') {
    const move = String(body.move || '').trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(PET_ARENA_MOVES, move)) return { accepted: false, reason: 'arena_move_invalid' };
    const battle = await getPetArenaBattle(db, body.battle_id);
    if (!battle || ![battle.player1_telegram_id, battle.player2_telegram_id].map(String).includes(String(telegramId))) return { accepted: false, reason: 'arena_battle_not_found' };
    return applyPetArenaMove(db, battle, telegramId, body.expected_round, move);
  }
  if (action === 'arena_forfeit') {
    const battle = await getPetArenaBattle(db, body.battle_id);
    if (!battle || ![battle.player1_telegram_id, battle.player2_telegram_id].map(String).includes(String(telegramId))) return { accepted: false, reason: 'arena_battle_not_found' };
    return forfeitPetArenaBattle(db, battle, telegramId);
  }
  if (action === 'kaiju_start') {
    const pet = await getPetProfile(db, telegramId);
    if (!pet) return { accepted: false, reason: 'pet_not_adopted' };
    const miniChatId = `mini:kaiju:${telegramId}`;
    const active = await getPetKaijuMatchForPlayer(db, telegramId) || await getActivePetKaijuMatch(db, miniChatId);
    if (active) return { accepted: true, reason: active.mode === 'solo' ? 'kaiju_resumed' : 'kaiju_match_active', match: active };
    const match = await createPetKaijuMatch(db, miniChatId, telegramId, 'solo', { mini_app_solo_guard: true });
    if (!match) return { accepted: false, reason: 'kaiju_queue_active' };
    return { accepted: true, reason: 'kaiju_started', match };
  }
  if (action === 'kaiju_matchmake') return matchmakePetKaijuMiniApp(db, telegramId);
  if (action === 'kaiju_queue_cancel') return cancelPetKaijuMiniAppQueue(db, telegramId);
  if (action === 'kaiju_card') {
    const fresh = await getFreshPetKaijuMatch(db, body.match_id);
    const match = fresh.match;
    const cardKey = normalizePetKaijuCardKey(body.card_key);
    if (fresh.expired) return { accepted: false, reason: 'kaiju_expired' };
    const participant = match && [match.player1_telegram_id, match.player2_telegram_id].map(String).includes(String(telegramId));
    const validMiniMatch = match && (String(match.chat_id) === `mini:kaiju:${telegramId}` || String(match.chat_id).startsWith('mini:kaiju:match:'));
    if (!match || !participant || !validMiniMatch) {
      return { accepted: false, reason: 'kaiju_match_not_found' };
    }
    if (!cardKey) return { accepted: false, reason: 'kaiju_card_invalid' };
    if (match.status === 'completed') return finishPetKaijuMatch(db, match);
    const isPlayer1 = String(match.player1_telegram_id) === String(telegramId);
    const cpuCard = match.mode === 'solo' ? pickPetKaijuCpuCard(cardKey).id : null;
    const category = match.category_key ? PET_KAIJU_CATEGORIES.find((entry) => entry.key === match.category_key) : pickPetKaijuCategory();
    const locked = isPlayer1
      ? await db.prepare(`UPDATE telegram_pet_kaiju_matches
          SET player1_card_key=?, cpu_card_key=COALESCE(?, cpu_card_key), category_key=COALESCE(category_key, ?),
              roll=CASE WHEN roll IS NULL OR roll=0 THEN ? ELSE roll END, updated_at=CURRENT_TIMESTAMP
          WHERE match_id=? AND status='selecting' AND player1_card_key IS NULL`)
        .bind(cardKey, cpuCard, category.key, category.roll, match.match_id).run()
      : await db.prepare(`UPDATE telegram_pet_kaiju_matches SET player2_card_key=?, updated_at=CURRENT_TIMESTAMP
          WHERE match_id=? AND status='selecting' AND player2_card_key IS NULL`)
        .bind(cardKey, match.match_id).run();
    if (Number(locked?.meta?.changes || 0) <= 0) return { accepted: false, reason: 'kaiju_card_locked' };
    const updated = await getPetKaijuMatch(db, match.match_id);
    const ready = updated.mode === 'solo'
      ? updated.player1_card_key && updated.cpu_card_key
      : updated.player1_card_key && updated.player2_card_key;
    if (!ready) return { accepted: true, reason: 'kaiju_card_waiting', match: updated };
    return finishPetKaijuMatch(db, updated);
  }
  return { accepted: false, reason: 'mini_app_action_invalid' };
}

function serializePetMiniAppActionResult(result = {}, identity = null, telegramId = '') {
  const output = {
    accepted: Boolean(result.accepted),
    duplicate: Boolean(result.duplicate),
    reason: String(result.reason || (result.accepted ? 'accepted' : 'rejected')),
  };
  for (const key of ['pet_xp_awarded', 'xp_awarded', 'damage', 'action', 'attempt', 'retry_after_seconds', 'gold_delta', 'crystal_delta', 'won']) {
    if (result[key] !== undefined) output[key] = result[key];
  }
  for (const key of ['rewards', 'applied', 'job', 'item', 'recipe', 'encounter', 'choice', 'result_copy', 'reaction', 'boss', 'progress', 'tier', 'expedition', 'offer', 'bounty', 'queue', 'run', 'room', 'session', 'computed', 'resolved', 'match', 'reward_results', 'region', 'chain_key', 'step', 'final', 'cosmetic', 'cost', 'faction_bonus', 'prestige_count', 'acknowledged', 'lifecycle', 'species', 'rare_morph', 'care_type', 'season_slots']) {
    if (result[key] !== undefined) output[key] = result[key];
  }
  if (output.result_copy === undefined && result.outcome?.copy) {
    output.result_copy = clampText(result.outcome.copy, 500, 'run_outcome');
  }
  if (result.pet) output.pet = serializePet(result.pet, identity);
  if (result.battle) output.battle = serializePetMiniAppArenaBattle(result.battle, telegramId);
  if (result.match) output.match = serializePetMiniAppKaijuMatch(result.match, telegramId);
  return output;
}

async function recordPetMiniAppPerformance(db, telegramId, body = {}) {
  const qualityTier = ['low', 'medium', 'high'].includes(String(body.quality_tier || '')) ? String(body.quality_tier) : null;
  const averageFps = Math.max(0, Math.min(240, Number(body.average_fps) || 0));
  const slowFramePct = Math.max(0, Math.min(100, Number(body.slow_frame_pct) || 0));
  const reducedMotion = Boolean(body.reduced_motion);
  const renderDurationMs = body.render_duration_ms == null || body.render_duration_ms === '' ? null : Number.isFinite(Number(body.render_duration_ms)) ? Math.max(0.01, Math.min(10000, Number(body.render_duration_ms))) : null;
  const viewportWidth = Math.max(1, Math.min(10000, Math.floor(Number(body.viewport_width) || 0)));
  const viewportHeight = Math.max(1, Math.min(10000, Math.floor(Number(body.viewport_height) || 0)));
  if (!qualityTier || viewportWidth <= 1 || viewportHeight <= 1 || (reducedMotion ? renderDurationMs == null : averageFps <= 0)) return { accepted: false, reason: 'performance_sample_invalid' };
  const deviceMemory = body.device_memory == null || body.device_memory === '' ? null : Number.isFinite(Number(body.device_memory)) ? Math.max(0, Math.min(64, Number(body.device_memory))) : null;
  const hardwareConcurrency = body.hardware_concurrency == null || body.hardware_concurrency === '' ? null : Number.isFinite(Number(body.hardware_concurrency)) ? Math.max(1, Math.min(128, Math.floor(Number(body.hardware_concurrency)))) : null;
  await db.batch([
    db.prepare(`INSERT INTO telegram_pet_client_performance
      (sample_id, telegram_id, quality_tier, average_fps, slow_frame_pct, render_duration_ms, device_memory, hardware_concurrency, viewport_width, viewport_height, reduced_motion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), telegramId, qualityTier, averageFps, slowFramePct, renderDurationMs, deviceMemory, hardwareConcurrency, viewportWidth, viewportHeight, reducedMotion ? 1 : 0),
    db.prepare("DELETE FROM telegram_pet_client_performance WHERE sampled_at < datetime('now','-90 days')"),
  ]);
  return { accepted: true };
}

function getPetMiniAppReactionContext(action, result = {}) {
  if (action === 'work') return 'job';
  if (action === 'random_event' || action === 'event_chain') return 'event';
  if (action === 'run_start' || action === 'daily_run_start' || action === 'adventure') return 'adventure';
  if (action === 'run_step') return 'run';
  if (action === 'run_extract') return 'extract';
  if (action.startsWith('arena_')) return 'arena';
  if (action.startsWith('kaiju_')) return 'kaiju';
  if (action === 'weekly_boss' || action === 'seasonal_boss') return 'boss';
  if (action === 'season_claim') return 'season';
  if (action === 'evolve') return 'evolution';
  if (action === 'buy' || action === 'market_buy' || action === 'cosmetic_unlock' || action === 'gear_upgrade' || action === 'craft') return 'purchase';
  if (action === 'use_item') return 'item';
  if (action === 'daily_chest' || action === 'bounty_claim') return 'daily';
  if (action.startsWith('activity_')) return action;
  return result.action || action;
}

async function attachPetMiniAppReaction(db, telegramId, action, result, state) {
  if (!result?.accepted || result.duplicate || !state?.pet || ['guidance_ack', 'notification_set', 'arena_queue_cancel', 'kaiju_queue_cancel'].includes(action)) return result;
  const context = getPetMiniAppReactionContext(action, result);
  const activityLabel = result.job?.title || result.item?.title || result.encounter?.title || result.boss?.title
    || result.region?.title || result.tier?.title || String(action || '').replaceAll('_', ' ');
  const reaction = await selectMoonpetReaction(db, telegramId, context, state.guidance?.identity || {}, {
    pet: state.pet,
    activity_label: activityLabel,
  }).catch(() => buildMoonpetReaction(context, state.guidance?.identity || {}, { pet: state.pet, activity_label: activityLabel }));
  return { ...result, reaction };
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
        await creditArcadeXpWallet(env.DB, telegramId, grantXp);

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

    // ── Crypto Moonboys Pets Mini App API ─────────────────────────────────
    // Auth is accepted only in the POST body. Telegram Mini App initData is
    // verified against the bot token on every request and never echoed back.
    if (path === '/telegram-pets/app/state' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('invalid json', 400); }
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/state', body, corsHeaders, { ipLimit: 90 }); if (limited) return limited; }
      const verified = await authenticatePetMiniApp(body, env);
      if (verified.error || !verified.ok) return err(verified.error || 'mini app auth required', verified.status || 401);
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/state', null, corsHeaders, { includeIp: false, telegramId: verified.telegramId }); if (limited) return limited; }
      await upsertTelegramUser(env.DB, verified.user).catch(() => {});
      try {
        const state = await buildPetMiniAppState(env.DB, verified.telegramId, env.TELEGRAM_BOT_TOKEN);
        return json({ ok: true, state });
      } catch (error) {
        logApiFailure('pet_mini_app_state_failed', {
          telegramId: verified.telegramId,
          message: error?.message || String(error),
        });
        return err('mini_app_state_failed', 500);
      }
    }

    if (path === '/telegram-pets/app/leaderboard' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('invalid json', 400); }
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/leaderboard', body, corsHeaders, { ipLimit: 90 }); if (limited) return limited; }
      const verified = await authenticatePetMiniApp(body, env);
      if (verified.error || !verified.ok) return err(verified.error || 'mini app auth required', verified.status || 401);
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/leaderboard', null, corsHeaders, { includeIp: false, telegramId: verified.telegramId }); if (limited) return limited; }
      try {
        return json(await buildPetMiniAppLeaderboard(env.DB, verified.telegramId, body.period, body.limit));
      } catch (error) {
        logApiFailure('pet_mini_app_leaderboard_failed', { telegramId: verified.telegramId, message: error?.message || String(error) });
        return err('mini_app_leaderboard_failed', 500);
      }
    }

    if (path === '/telegram-pets/app/sanctuary' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('invalid json', 400); }
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/sanctuary', body, corsHeaders, { ipLimit: 90 }); if (limited) return limited; }
      const verified = await authenticatePetMiniApp(body, env);
      if (verified.error || !verified.ok) return err(verified.error || 'mini app auth required', verified.status || 401);
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/sanctuary', null, corsHeaders, { includeIp: false, telegramId: verified.telegramId }); if (limited) return limited; }
      try {
        return json({ pets: await listSanctuaryPetsPrivate(env.DB, verified.telegramId) });
      } catch (error) {
        logApiFailure('pet_mini_app_sanctuary_failed', { telegramId: verified.telegramId, message: error?.message || String(error) });
        return err('mini_app_sanctuary_failed', 500);
      }
    }

    if (path === '/telegram-pets/app/performance' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('invalid json', 400); }
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/performance', body, corsHeaders, { ipLimit: 20 }); if (limited) return limited; }
      const verified = await authenticatePetMiniApp(body, env);
      if (verified.error || !verified.ok) return err(verified.error || 'mini app auth required', verified.status || 401);
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/performance', null, corsHeaders, { includeIp: false, telegramId: verified.telegramId, telegramLimit: 6 }); if (limited) return limited; }
      try {
        return json({ ok: true, result: await recordPetMiniAppPerformance(env.DB, verified.telegramId, body) });
      } catch (error) {
        logApiFailure('pet_mini_app_performance_failed', { telegramId: verified.telegramId, message: error?.message || String(error) });
        return err('performance_sample_failed', 500);
      }
    }

    if (path === '/telegram-pets/app/action' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return err('invalid json', 400); }
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/action', body, corsHeaders, { ipLimit: 120 }); if (limited) return limited; }
      const verified = await authenticatePetMiniApp(body, env);
      if (verified.error || !verified.ok) return err(verified.error || 'mini app auth required', verified.status || 401);
      { const limited = await enforcePublicRateLimit(request, env, '/telegram-pets/app/action', null, corsHeaders, { includeIp: false, telegramId: verified.telegramId }); if (limited) return limited; }
      await upsertTelegramUser(env.DB, verified.user).catch(() => {});
      let result;
      try {
        await getPetProfile(env.DB, verified.telegramId);
        result = await processPetMiniAppAction(env.DB, verified.telegramId, verified.user, body, env.TELEGRAM_BOT_TOKEN);
        await mirrorPetProfileToActiveInstance(env.DB, verified.telegramId);
      } catch (error) {
        logApiFailure('mini_app_action_failed', { telegramId: verified.telegramId, action: String(body.action || ''), message: error?.message || String(error) });
        return err('mini_app_action_failed', 500);
      }
      const state = await buildPetMiniAppState(env.DB, verified.telegramId, env.TELEGRAM_BOT_TOKEN).catch(() => null);
      result = await attachPetMiniAppReaction(env.DB, verified.telegramId, String(body.action || ''), result, state);
      return json({ ok: Boolean(result.accepted), result: serializePetMiniAppActionResult(result, state?.guidance?.identity, verified.telegramId), state }, result.accepted ? 200 : 409);
    }

    // ── Crypto Moonboys Pets API ──────────────────────────────────────────
    if (path === '/telegram-pets/season/current' && request.method === 'GET') {
      return json({ season: getPetSeasonInfo(new Date()) });
    }

    // Public collection projection: ownership is selected by the server query,
    // never by client-side filtering. Mutations are deliberately unavailable.
    if (path === '/telegram/pets/sanctuary' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id required');
      return json({ pets: await listSanctuaryPets(env.DB, telegramId) });
    }

    if (path === '/telegram-pets/state' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id required');
      const pet = await getPetProfile(env.DB, telegramId).catch(() => null);
      if (!pet) return err('Pet profile not found', 404);
      const identity = await getMoonpetIdentitySummary(env.DB, telegramId).catch(() => null);
      return json({ pet: serializePet(pet, identity), missions: await buildPetMissions(env.DB, telegramId) });
    }

    if (path === '/telegram-pets/inventory' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id required');
      const pet = await getPetProfile(env.DB, telegramId).catch(() => null);
      if (!pet) return err('Pet profile not found', 404);
      const identity = await getMoonpetIdentitySummary(env.DB, telegramId).catch(() => null);
      return json({ pet: serializePet(pet, identity), inventory: await getPetInventory(env.DB, telegramId) });
    }

    if (path === '/telegram-pets/missions' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      if (!/^\d{1,20}$/.test(telegramId)) return err('telegram_id required');
      return json({ missions: await buildPetMissions(env.DB, telegramId) });
    }

    if (path === '/telegram-pets/shop' && request.method === 'GET') {
      const telegramId = String(url.searchParams.get('telegram_id') || '').trim();
      const pet = /^\d{1,20}$/.test(telegramId) ? await getPetProfile(env.DB, telegramId).catch(() => null) : null;
      const identity = pet ? await getMoonpetIdentitySummary(env.DB, telegramId).catch(() => null) : null;
      return json({
        currencies: ['moon_gold', 'moon_crystals', 'style_tokens'],
        pet: serializePet(pet, identity),
        items: petShopItemsForPet(pet),
        usable_items: Object.values(PET_INVENTORY_ITEMS),
        jobs: Object.values(PET_JOBS),
      });
    }

    if (path === '/telegram-pets/activity' && request.method === 'GET') {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 50);
      const rows = await env.DB.prepare(`
        SELECT e.event_type, e.xp_awarded, e.pet_xp_awarded, e.reason, e.created_at,
               p.pet_name, COALESCE(
                 (SELECT pe.evolution_id FROM telegram_pet_evolutions_by_pet pe
                   WHERE pe.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = e.telegram_id)
                   ORDER BY pe.stage DESC LIMIT 1),
                 (SELECT pe.evolution_id FROM telegram_pet_evolutions pe WHERE pe.telegram_id=e.telegram_id ORDER BY pe.stage DESC LIMIT 1),
                 'moon_egg'
               ) AS stage,
               u.username, u.first_name, u.last_name
        FROM telegram_pet_events e
        LEFT JOIN telegram_pet_profiles p ON p.telegram_id = e.telegram_id
        LEFT JOIN telegram_users u ON u.telegram_id = e.telegram_id
        WHERE e.status = 'accepted'
          AND e.event_key <> ?
        ORDER BY e.created_at DESC
        LIMIT ?
      `).bind(PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY, limit).all().catch(() => ({ results: [] }));
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
          SELECT e.telegram_id, SUM(e.pet_xp_awarded) AS pet_xp, p.pet_name, COALESCE(
                   (SELECT pe.evolution_id FROM telegram_pet_evolutions_by_pet pe
                     WHERE pe.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = e.telegram_id)
                     ORDER BY pe.stage DESC LIMIT 1),
                   (SELECT pe.evolution_id FROM telegram_pet_evolutions pe WHERE pe.telegram_id=e.telegram_id ORDER BY pe.stage DESC LIMIT 1),
                   'moon_egg'
                 ) AS stage,
                 p.level, p.moon_gold, p.moon_crystals, p.style_tokens, p.streak_days, p.updated_at,
                 l.phase AS lifecycle_phase, l.species_id AS lifecycle_species_id, l.rare_morph_id,
                 u.username, u.first_name, u.last_name
          FROM telegram_pet_events e
          LEFT JOIN telegram_pet_profiles p ON p.telegram_id = e.telegram_id
          LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.telegram_id = e.telegram_id AND l.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = e.telegram_id)
          LEFT JOIN telegram_users u ON u.telegram_id = e.telegram_id
          WHERE e.day_key = ? AND e.status = 'accepted'
          GROUP BY e.telegram_id
          ORDER BY pet_xp DESC
          LIMIT ?
        `).bind(dayKey, limit).all().catch(() => ({ results: [] }));
      } else if (period === 'weekly') {
        rows = await env.DB.prepare(`
          SELECT e.telegram_id, SUM(e.pet_xp_awarded) AS pet_xp, p.pet_name, COALESCE(
                   (SELECT pe.evolution_id FROM telegram_pet_evolutions_by_pet pe
                     WHERE pe.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = e.telegram_id)
                     ORDER BY pe.stage DESC LIMIT 1),
                   (SELECT pe.evolution_id FROM telegram_pet_evolutions pe WHERE pe.telegram_id=e.telegram_id ORDER BY pe.stage DESC LIMIT 1),
                   'moon_egg'
                 ) AS stage,
                 p.level, p.moon_gold, p.moon_crystals, p.style_tokens, p.streak_days, p.updated_at,
                 l.phase AS lifecycle_phase, l.species_id AS lifecycle_species_id, l.rare_morph_id,
                 u.username, u.first_name, u.last_name
          FROM telegram_pet_events e
          LEFT JOIN telegram_pet_profiles p ON p.telegram_id = e.telegram_id
          LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.telegram_id = e.telegram_id AND l.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = e.telegram_id)
          LEFT JOIN telegram_users u ON u.telegram_id = e.telegram_id
          WHERE e.week_key = ? AND e.status = 'accepted'
          GROUP BY e.telegram_id
          ORDER BY pet_xp DESC
          LIMIT ?
        `).bind(weekKey, limit).all().catch(() => ({ results: [] }));
      } else if (period === 'all_time') {
        rows = await env.DB.prepare(`
          SELECT p.telegram_id, p.pet_xp, p.pet_name, COALESCE(
                   (SELECT pe.evolution_id FROM telegram_pet_evolutions_by_pet pe
                     WHERE pe.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = p.telegram_id)
                     ORDER BY pe.stage DESC LIMIT 1),
                   (SELECT pe.evolution_id FROM telegram_pet_evolutions pe WHERE pe.telegram_id=p.telegram_id ORDER BY pe.stage DESC LIMIT 1),
                   'moon_egg'
                 ) AS stage,
                 p.level, p.moon_gold, p.moon_crystals, p.style_tokens, p.streak_days, p.updated_at,
                 l.phase AS lifecycle_phase, l.species_id AS lifecycle_species_id, l.rare_morph_id,
                 u.username, u.first_name, u.last_name
          FROM telegram_pet_profiles p
          LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.telegram_id = p.telegram_id AND l.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = p.telegram_id)
          LEFT JOIN telegram_users u ON u.telegram_id = p.telegram_id
          ORDER BY p.pet_xp DESC
          LIMIT ?
        `).bind(limit).all().catch(() => ({ results: [] }));
      } else {
        rows = await env.DB.prepare(`
          SELECT s.telegram_id, s.season_xp AS pet_xp, p.pet_name, COALESCE(
                   (SELECT pe.evolution_id FROM telegram_pet_evolutions_by_pet pe
                     WHERE pe.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = s.telegram_id)
                     ORDER BY pe.stage DESC LIMIT 1),
                   (SELECT pe.evolution_id FROM telegram_pet_evolutions pe WHERE pe.telegram_id=s.telegram_id ORDER BY pe.stage DESC LIMIT 1),
                   'moon_egg'
                 ) AS stage,
                 p.level, p.moon_gold, p.moon_crystals, p.style_tokens, p.streak_days, p.updated_at,
                 l.phase AS lifecycle_phase, l.species_id AS lifecycle_species_id, l.rare_morph_id,
                 u.username, u.first_name, u.last_name
          FROM telegram_pet_season_state s
          LEFT JOIN telegram_pet_profiles p ON p.telegram_id = s.telegram_id
          LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.telegram_id = s.telegram_id AND l.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = s.telegram_id)
          LEFT JOIN telegram_users u ON u.telegram_id = s.telegram_id
          WHERE s.season_key = ?
          ORDER BY s.season_xp DESC
          LIMIT ?
        `).bind(season.key, limit).all().catch(() => ({ results: [] }));
      }
      const leaderboardRows = await materializePetLeaderboardRows(env.DB, rows.results || []);
      return json({
        period,
        season,
        entries: leaderboardRows.map((row, index) => ({
          ...serializePetLeaderboardEntry(row, index),
          display_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username || 'Anonymous',
          username: row.username || null,
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
      await getPetProfile(env.DB, telegramId);
      const lifecycleBeforeAction = await getMoonpetLifecycle(env.DB, telegramId).catch(() => null);
      const eggAllowedActions = ['adopt', 'season_slots', 'buy_pet_slot', 'switch_pet_slot'];
      if (lifecycleBeforeAction?.phase === 'egg' && !eggAllowedActions.includes(String(body.action || ''))) {
        result = { accepted: false, reason: 'moon_egg_must_hatch', lifecycle: lifecycleBeforeAction };
      } else if (body.action === 'season_slots') {
        result = { accepted: true, reason: 'season_slots', season_slots: await buildPetSeasonSlotSummary(env.DB, telegramId) };
      } else if (body.action === 'buy_pet_slot') {
        result = await buyPetSeasonSlot(env.DB, telegramId, body.slot_number, {
          event_key: body.event_key,
          switch_active: body.switch_active,
        });
      } else if (body.action === 'switch_pet_slot') {
        result = await switchActivePetSeasonSlot(env.DB, telegramId, body.pet_id || body.slot_number);
      } else if (body.action === 'buy') {
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
        const dailyReservation = await getDailyMoonRunReservation(env.DB, { telegram_id: telegramId, run_id: body.run_id });
        result = dailyReservation
          ? await processDailyMoonRunStep(env.DB, {
            telegram_id: telegramId,
            run_id: body.run_id,
            choice_key: body.choice_key,
            expected_step_index: body.expected_step_index,
          })
          : await processPetRunStep(env.DB, telegramId, body.run_id, body.choice_key, {
            event_key: body.event_key,
            expected_step_index: body.expected_step_index,
            source: 'telegram_pets_api',
          });
      } else if (body.action === 'run_extract') {
        const dailyReservation = await getDailyMoonRunReservation(env.DB, { telegram_id: telegramId, run_id: body.run_id });
        result = dailyReservation
          ? await extractDailyMoonRun(env.DB, { telegram_id: telegramId, run_id: body.run_id })
          : await processPetRunExtract(env.DB, telegramId, body.run_id, {
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
      } else if (body.action === 'daily_run') {
        result = await createDailyMoonRun(env.DB, { telegram_id: telegramId });
      } else if (body.action === 'daily_run_sync') {
        result = await syncDailyMoonRun(env.DB, { telegram_id: telegramId, utc_day: body.utc_day, run_id: body.run_id });
      } else if (body.action === 'evolve') {
        result = await evolveMoonpet(env.DB, { telegram_id: telegramId, evolution_id: body.evolution_id, event_key: body.event_key });
        if (result.accepted && !result.duplicate) {
          const identity = await getMoonpetIdentitySummary(env.DB, telegramId).catch(() => null);
          result.lifecycle = await syncMoonpetLifecycleStage(env.DB, telegramId, identity?.current_stage?.stage || 0);
        }
        if (result.accepted) await finalizeActivePetEvolutionProgress(env.DB, telegramId);
      } else {
        result = await processPetAction(env.DB, telegramId, body.action, {
          event_key: body.event_key,
          pet_name: body.pet_name,
          species: body.species,
          source: 'telegram_pets_api',
        });
      }
      await mirrorPetProfileToActiveInstance(env.DB, telegramId);
      if (result.pet) result.pet = await getPetProfile(env.DB, telegramId);
      const identity = await getMoonpetIdentitySummary(env.DB, telegramId).catch(() => null);
      return json({ ...result, pet: serializePet(result.pet, identity) }, result.accepted ? 200 : 409);
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

        const walletRecoveredXp = await reconcileArcadeXpWalletFromEvents(env.DB, verified.telegramId);
        if (xpBatchAwarded > 0 || walletRecoveredXp > 0) {
          await logTelegramActivity(env.DB, verified.telegramId, 'arcade_progress_sync', JSON.stringify({
            runs_synced: acceptedCount,
            xp_awarded: xpBatchAwarded,
            wallet_recovered_xp: walletRecoveredXp,
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
const MOONPET_MINI_APP_URL = `${SITE_URL}/moonpet-game.html?v=20260814-moonpet-aaa-pass`;
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
  lost_delivery_drone: Object.freeze({
    key: 'lost_delivery_drone', min_evolution_stage: 1, title: 'Lost Delivery Drone',
    intro: 'A damaged courier drone repeats one address while sparks skip across its shell.',
    choices: Object.freeze([
      Object.freeze({ key: 'return_drone', label: 'Return It', copy: 'Your Moonpet leads the drone home and earns an honest finder fee.', rewards: Object.freeze({ pet_xp: [9, 15], moon_gold: [10, 16] }), costs: Object.freeze({ energy: [1, 2] }) }),
      Object.freeze({ key: 'repair_drone', label: 'Repair It', copy: 'The repair works and the grateful drone drops a crystal.', rewards: Object.freeze({ pet_xp: [12, 18], moon_crystals: [0, 2] }), costs: Object.freeze({ moon_gold: [2, 5] }), risk: Object.freeze({ chance: 0.3, copy: 'The repair only half works, but your Moonpet learns from the wiring.', rewards: Object.freeze({ pet_xp: [5, 9] }), costs: Object.freeze({ moon_gold: [1, 3] }) }) }),
      Object.freeze({ key: 'salvage_drone', label: 'Salvage It', copy: 'You salvage loose parts and leave the core untouched.', rewards: Object.freeze({ pet_xp: [5, 9], moon_gold: [7, 12] }), costs: Object.freeze({}) }),
    ]),
  }),
  neon_storm: Object.freeze({
    key: 'neon_storm', min_evolution_stage: 2, title: 'Neon Storm',
    intro: 'Charged rain sweeps across the rooftops and every sign starts speaking at once.',
    choices: Object.freeze([
      Object.freeze({ key: 'surf_current', label: 'Surf Current', copy: 'Your Cyber Moonpet rides the charge through the skyline.', rewards: Object.freeze({ pet_xp: [16, 24], style_tokens: [1, 3] }), costs: Object.freeze({ energy: [3, 5] }), risk: Object.freeze({ chance: 0.35, copy: 'The current throws you sideways, but the lesson sticks.', rewards: Object.freeze({ pet_xp: [7, 12] }), costs: Object.freeze({ energy: [4, 7] }) }) }),
      Object.freeze({ key: 'ground_signs', label: 'Ground Signs', copy: 'You safely ground the signs and collect a maintenance reward.', rewards: Object.freeze({ pet_xp: [10, 16], moon_gold: [12, 20] }), costs: Object.freeze({ energy: [1, 2] }) }),
      Object.freeze({ key: 'shelter_storm', label: 'Take Shelter', copy: 'Your Moonpet remembers that survival can be the clever play.', rewards: Object.freeze({ pet_xp: [5, 8], energy: [1, 3] }), costs: Object.freeze({}) }),
    ]),
  }),
  underground_cipher: Object.freeze({
    key: 'underground_cipher', min_evolution_stage: 2, title: 'Underground Cipher',
    intro: 'A tiled wall flickers with a code that reacts to your Moonpet’s footsteps.',
    choices: Object.freeze([
      Object.freeze({ key: 'solve_cipher', label: 'Solve It', copy: 'The wall opens a cache hidden between stations.', rewards: Object.freeze({ pet_xp: [15, 22], moon_crystals: [1, 2] }), costs: Object.freeze({ energy: [2, 3] }), risk: Object.freeze({ chance: 0.3, copy: 'The code resets, but your Moonpet remembers half the sequence.', rewards: Object.freeze({ pet_xp: [7, 11] }), costs: Object.freeze({ energy: [2, 4] }) }) }),
      Object.freeze({ key: 'paint_cipher', label: 'Paint Over It', copy: 'Your answer becomes a piece of street art the tunnel cannot ignore.', rewards: Object.freeze({ pet_xp: [11, 17], style_tokens: [2, 4] }), costs: Object.freeze({ moon_gold: [2, 4] }) }),
      Object.freeze({ key: 'record_cipher', label: 'Record It', copy: 'You save the pattern for later and move on.', rewards: Object.freeze({ pet_xp: [6, 10], moon_gold: [4, 8] }), costs: Object.freeze({}) }),
    ]),
  }),
  elite_crew_audition: Object.freeze({
    key: 'elite_crew_audition', min_evolution_stage: 3, title: 'Elite Crew Audition',
    intro: 'An elite crew offers one chance to prove your Moonpet belongs in the room.',
    choices: Object.freeze([
      Object.freeze({ key: 'show_strength', label: 'Show Strength', copy: 'Your Moonpet owns the floor and earns the crew mark.', rewards: Object.freeze({ pet_xp: [18, 26], style_tokens: [2, 4], moon_gold: [8, 14] }), costs: Object.freeze({ energy: [3, 5] }), risk: Object.freeze({ chance: 0.35, copy: 'The move misses, but the crew respects the nerve.', rewards: Object.freeze({ pet_xp: [8, 13], style_tokens: [0, 1] }), costs: Object.freeze({ energy: [4, 6] }) }) }),
      Object.freeze({ key: 'show_style', label: 'Show Style', copy: 'The room goes quiet, then erupts.', rewards: Object.freeze({ pet_xp: [14, 21], style_tokens: [3, 5] }), costs: Object.freeze({}) }),
      Object.freeze({ key: 'study_crew', label: 'Study Crew', copy: 'Your Moonpet learns every tell without exposing its own.', rewards: Object.freeze({ pet_xp: [8, 12], moon_gold: [5, 9] }), costs: Object.freeze({}) }),
    ]),
  }),
  guardian_distress_call: Object.freeze({
    key: 'guardian_distress_call', min_evolution_stage: 4, title: 'Guardian Distress Call',
    intro: 'A signal only a Legendary Moon Guardian can hear cuts through the district.',
    choices: Object.freeze([
      Object.freeze({ key: 'answer_call', label: 'Answer Call', copy: 'Your guardian reaches the danger first and brings everyone home.', rewards: Object.freeze({ pet_xp: [20, 30], moon_gold: [15, 25], style_tokens: [2, 4] }), costs: Object.freeze({ energy: [4, 7] }), risk: Object.freeze({ chance: 0.25, copy: 'The rescue gets rough, but nobody is left behind.', rewards: Object.freeze({ pet_xp: [10, 16], moon_gold: [6, 12] }), costs: Object.freeze({ energy: [6, 9] }) }) }),
      Object.freeze({ key: 'guide_patrol', label: 'Guide Patrol', copy: 'You coordinate the response from above.', rewards: Object.freeze({ pet_xp: [15, 22], moon_crystals: [1, 3] }), costs: Object.freeze({ energy: [2, 4] }) }),
      Object.freeze({ key: 'seal_signal', label: 'Seal Signal', copy: 'Your Moonpet closes the breach before anything follows it.', rewards: Object.freeze({ pet_xp: [12, 18], style_tokens: [1, 3] }), costs: Object.freeze({}) }),
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

function selectPetRandomEncounter(identity = null) {
  const evolutionStage = Math.max(0, Math.floor(Number(identity?.current_stage?.stage) || 0));
  const encounters = Object.values(PET_RANDOM_EVENTS).filter((entry) => (
    evolutionStage >= Math.max(0, Number(entry.min_evolution_stage) || 0)
  ));
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
      [{ text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' }],
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
      [{ text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' }],
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
    rows[0] = [{ text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' }];
  }
  rows.push([{ text: '🌕 Pet Status', callback_data: 'pet:back' }]);
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
  rows.push([{ text: '⬅️ Management', callback_data: 'pet:menu:management' }]);
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
  rows.push([{ text: '⚙️ Management', callback_data: 'pet:menu:management' }]);
  rows.push([{ text: '⬅️ Back', callback_data: 'pet:back' }]);
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

async function sendTelegramPetReply(botToken, chatId, text, extra = {}, mediaKey = null, guidance = null) {
  let guidedReply = null;
  if (guidance?.db && guidance?.telegram_id && guidance?.pet) {
    guidedReply = await buildPetGuidedReply(
      guidance.db,
      String(guidance.telegram_id),
      guidance.pet,
      text,
      extra.reply_markup || null,
      { surface_notices: guidance.surface_notices !== false },
    );
    text = guidedReply.text;
    extra = { ...extra, reply_markup: guidedReply.reply_markup };
  }
  const finishDelivery = (result) => markPetGuidanceAfterDelivery(
    guidance?.db,
    String(guidance?.telegram_id || ''),
    guidedReply?.notices || [],
    result,
  );
  const resolvedMediaKey = resolvePetMediaKey(mediaKey);
  const photoUrl = resolvedMediaKey ? buildPetMediaUrl(resolvedMediaKey) : null;
  if (!photoUrl) {
    return finishDelivery(await sendTelegramMessage(botToken, chatId, text, extra));
  }

  const caption = formatTelegramPetMediaCaption(text, resolvedMediaKey);
  const captionOnly = shouldUsePhotoCaptionOnly(text, resolvedMediaKey);
  const { reply_markup: replyMarkup, ...nonKeyboardExtra } = extra;
  const photoExtra = {
    ...(captionOnly ? extra : nonKeyboardExtra),
    caption: captionOnly ? caption : formatTelegramPetHeroCaption(text, resolvedMediaKey),
    parse_mode: 'HTML',
  };
  const photoResult = await sendTelegramPhoto(botToken, chatId, photoUrl, photoExtra)
    .catch((error) => ({ ok: false, error: error?.message || String(error) }));
  if (!photoResult.ok) {
    return finishDelivery(await sendTelegramMessage(botToken, chatId, text, extra));
  }
  if (!captionOnly) {
    return finishDelivery(await sendTelegramMessage(botToken, chatId, text, replyMarkup ? { ...extra, reply_markup: replyMarkup } : extra));
  }
  return finishDelivery(photoResult);
}

function resolvePetOutcomeMediaKey(action, beforePet, result = null) {
  const beforeLevel = beforePet ? getPetLevel(beforePet.pet_xp) : 0;
  const afterLevel = result?.pet ? getPetLevel(result.pet.pet_xp) : 0;
  if (afterLevel > beforeLevel) return 'level_up';
  return resolvePetMediaKey(action, result);
}

export const __petMediaTestHooks = Object.freeze({
  ensurePetStarterSeasonSlot,
  preparePetMiniAppState,
  findActivePetSlot,
  ensureActivePetInstance,
  readActivePetInstance,
  writeActivePetInstance,
  mirrorActivePetInstanceToProfile,
  mirrorPetProfileToActiveInstance,
  getPetProfile,
  savePetProfile,
  PET_ACHIEVEMENTS,
  PET_SEASON_REWARD_TIERS,
  PET_JOBS,
  MOONPET_EVOLUTIONS,
  MOONPET_PERSONALITY_TRAITS,
  MOONPET_SPECIES,
  createMoonEggLifecycle,
  getMoonpetLifecycle,
  hatchMoonpet,
  incubateMoonEgg,
  awardActivePetActivityGrowthMark,
  morphMoonpetRare,
  syncMoonpetLifecycleStage,
  PET_ROGUELITE_BOSSES,
  PET_ROGUELITE_ENEMIES,
  PET_ROGUELITE_REGIONS,
  PET_ROGUELITE_RELICS,
  PET_ROGUELITE_ROOMS,
  PET_RUN_MODIFIERS,
  advancePetRun,
  awardPetReward,
  buildPetProfileDeltas,
  choosePetRunModifier,
  completePetRun,
  createPetRunRoom,
  extractPetRogueliteRun,
  failPetRun,
  finishPetRogueliteRun,
  generatePetRunRoom,
  persistPetRunRoomOutcome,
  resolvePetRunRoom,
  rewardPetRogueliteBoss,
  rewardPetRunRoom,
  startPetRogueliteRun,
  validatePetRelicContent,
  validatePetRogueliteContent,
  validatePetRunModifier,
  evolveMoonpet,
  formatMoonpetIdentitySummary,
  getMoonpetIdentityAnalytics,
  getMoonpetIdentitySummary,
  recordMoonpetBehaviour,
  recordMoonpetBiggestReward,
  recordMoonpetMemory,
  buildMoonpetReaction,
  calculatePetWeeklyBossDamage,
  getPetEvolutionPerk,
  getPetWeeklyBoss,
  syncPetAchievements,
  processPetWeeklyBoss,
  awardStoredWeeklyBossVictoryCrest,
  recordWeeklyBossVictoryCrest,
  PET_DAILY_CHALLENGES,
  PET_WEEKLY_JOURNEY_OBJECTIVES,
  finalizeWeeklyJourneyCrest,
  recordWeeklyJourneyObjectiveEvidence,
  getPetSeasonInfo,
  getPetSeasonRewardState,
  claimPetSeasonReward,
  validateMoonpetEvolutionContent,
  PET_MEDIA_MANIFEST,
  PET_RUN_CHOICE_LIBRARY,
  PET_RUN_MAX_DEPTH,
  PET_RUN_STEP_CHOICES,
  PET_KAIJU_CARDS,
  PET_KAIJU_CATEGORIES,
  PET_ARENA_MOVE_GUIDE,
  PET_RANDOM_EVENTS,
  PET_REPEAT_REWARD_RULES,
  PET_ECONOMY_ROUTES,
  getPetEconomyState,
  claimPetEconomyBounty,
  runPetCrystalExpedition,
  buyPetMarketOffer,
  applyPetItemActionBonuses,
  awardPetKaijuPlayerResult,
  finishPetKaijuMatch,
  getPetHighLevelGearXpMultiplier,
  getPetRepeatRewardMultiplier,
  parsePetRepeatRewardReservation,
  processPetJob,
  processPetAction,
  processPetDailyChest,
  processPetShopPurchase,
  processPetGoldTrade,
  processPetRandomEvent,
  processPetAdventure,
  claimPetActivitySession,
  cancelPetActivitySession,
  expireOldPetActivitySessions,
  getPetInventory,
  processPetUseItem,
  startOrResumePetRun,
  processPetRunExtract,
  recordPetRunBankedEvent,
  processPetRunStep,
  serializePetRun,
  reservePetRepeatRewardEvent,
  scalePetRewards,
  buildPetKaijuCardReplyMarkup,
  buildPetKaijuLobbyReplyMarkup,
  buildPetKaijuMatchId,
  resolvePetKaijuBattle,
  getPetArenaRankBucket,
  calculatePetArenaPower,
  buildPetArenaMenuReplyMarkup,
  buildPetArenaMatchReplyMarkup,
  buildPetArenaMoveReplyMarkup,
  parsePetArenaCallbackPayload,
  resolvePetArenaRoundState,
  sumPetArenaGearPower,
  scalePetArenaRewardsForPlayer,
  getPetArenaBucketDistance,
  processPetMiniAppAction,
  buildPetMiniAppJourneySummary,
  hasCompletedPetMiniAppSeasonPet,
  PET_SEASON_EXTRA_SLOT_COSTS,
  buildPetSeasonSlotSummary,
  buyPetSeasonSlot,
  switchActivePetSeasonSlot,
  serializePetMiniAppActionResult,
  serializePetMiniAppArenaBattle,
  serializePetMiniAppKaijuMatch,
  getPetArenaBattleForPlayer,
  getPetArenaQueueState,
  getPetKaijuMatchForPlayer,
  getPetKaijuQueueState,
  serializePet,
  serializePetLeaderboardEntry,
  materializePetLeaderboardRows,
  formatPetStatus,
  formatPetDetails,
  getPetEvolutionGuidance,
  buildPetGuidanceState,
  persistPetGuidanceNotices,
  markPetGuidanceAfterDelivery,
  buildPetGuidedReply,
  petReplyMarkup,
  buildPetAdventureMenuReplyMarkup,
  buildPetManagementMenuReplyMarkup,
  buildPetProgressMenuReplyMarkup,
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
  normalizePetActivityType,
  computePetActivityRewards,
  formatPetActivityLine,
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
      if (resolvePetCallbackRoute(data, env.PET_MINI_APP_ENABLED) === 'mini_app') {
        await answerTelegramCallback(tok, query.id, 'Opening Moonpet OS');
        await cmdPetMiniAppLauncher(tok, chatId, telegramId, String(query.message?.chat?.type || 'private'), petMiniAppDestinationForCallback(data), petMiniAppFocusForCallback(data));
        return;
      }
      /* Legacy callback routing is retained below for rollback safety. */
      const payload = data.slice(4);
      const callbackLifecycle = await getMoonpetLifecycle(db, telegramId).catch(() => null);
      if (callbackLifecycle?.phase === 'egg') {
        await answerTelegramCallback(tok, query.id, 'Hatch your Moon Egg first');
        await sendTelegramMessage(tok, chatId, 'Your Moon Egg must be cared for and hatched in the Moonpet Mini App before gameplay unlocks.');
        return;
      }
      const eventKey = buildTelegramCallbackPetEventKey(query, telegramId, data);
      const chatType = String(query.message?.chat?.type || '');
      if (payload === 'back') { await answerTelegramCallback(tok, query.id, '/pet'); await cmdPetStatus(db, tok, chatId, telegramId); return; }
      if (payload === 'menu:adventure') { await answerTelegramCallback(tok, query.id, 'Adventure'); await cmdPetMenu(tok, chatId, 'adventure'); return; }
      if (payload === 'menu:management') { await answerTelegramCallback(tok, query.id, 'Management'); await cmdPetMenu(tok, chatId, 'management'); return; }
      if (payload === 'menu:progress') { await answerTelegramCallback(tok, query.id, 'Progress'); await cmdPetMenu(tok, chatId, 'progress'); return; }
      if (payload === 'coach') { await answerTelegramCallback(tok, query.id, '/petcoach'); await cmdPetCoach(db, tok, chatId, telegramId); return; }
      if (payload === 'details') { await answerTelegramCallback(tok, query.id, 'Details'); await cmdPetDetails(db, tok, chatId, telegramId); return; }
      if (payload === 'missions') { await answerTelegramCallback(tok, query.id, '/petmissions'); await cmdPetMissions(db, tok, chatId, telegramId); return; }
      if (payload === 'equipment') { await answerTelegramCallback(tok, query.id, '/petgear'); await cmdPetGear(db, tok, chatId, telegramId); return; }
      if (payload === 'trade') { await answerTelegramCallback(tok, query.id, 'Trade'); await cmdPetTradeMenu(tok, chatId); return; }
      if (payload === 'economy') { await answerTelegramCallback(tok, query.id, '/peteconomy'); await cmdPetEconomy(db, tok, chatId, telegramId); return; }
      if (payload === 'bounties') { await answerTelegramCallback(tok, query.id, '/petbounties'); await cmdPetBounties(db, tok, chatId, telegramId); return; }
      if (payload.startsWith('bounty:')) { const key = payload.slice(7); await answerTelegramCallback(tok, query.id, 'Claim bounty'); await cmdPetBountyClaim(db, tok, chatId, telegramId, key); return; }
      if (payload === 'expedition') { await answerTelegramCallback(tok, query.id, '/petexpedition'); await cmdPetExpedition(db, tok, chatId, telegramId); return; }
      if (payload === 'expedition:go') { await answerTelegramCallback(tok, query.id, 'Start expedition'); await cmdPetExpedition(db, tok, chatId, telegramId, true, eventKey); return; }
      if (payload === 'market') { await answerTelegramCallback(tok, query.id, '/petmarket'); await cmdPetMarket(db, tok, chatId, telegramId); return; }
      if (payload.startsWith('market:')) { const key = payload.slice(7); await answerTelegramCallback(tok, query.id, 'Buy market offer'); await cmdPetMarketBuy(db, tok, chatId, telegramId, key); return; }
      if (payload.startsWith('trade:')) { const wager = payload.slice(6); await answerTelegramCallback(tok, query.id, `/pettrade ${wager}`); await cmdPetTrade(db, tok, chatId, telegramId, wager, eventKey); return; }
      if (payload.startsWith('identity:')) { const section = payload.slice(9); await answerTelegramCallback(tok, query.id, 'Moonpet identity'); await cmdPetIdentity(db, tok, chatId, telegramId, section); return; }
      if (payload === 'achievements') { await answerTelegramCallback(tok, query.id, '/petachievements'); await cmdPetAchievements(db, tok, chatId, telegramId); return; }
      if (payload === 'season') { await answerTelegramCallback(tok, query.id, '/petseason'); await cmdPetSeason(db, tok, chatId, telegramId, '', eventKey); return; }
      if (payload.startsWith('season:claim:')) { const tierId = payload.slice(13); await answerTelegramCallback(tok, query.id, 'Claim season reward'); await cmdPetSeason(db, tok, chatId, telegramId, tierId, eventKey); return; }
      if (payload === 'boss') { await answerTelegramCallback(tok, query.id, '/petboss'); await cmdPetWeeklyBoss(db, tok, chatId, telegramId, '', eventKey); return; }
      if (payload.startsWith('boss:')) { const action = payload.slice(5); await answerTelegramCallback(tok, query.id, 'Weekly boss'); await cmdPetWeeklyBoss(db, tok, chatId, telegramId, action, eventKey); return; }
      if (payload === 'evolve') { await answerTelegramCallback(tok, query.id, '/petevolve'); await cmdPetEvolve(db, tok, chatId, telegramId, '', eventKey); return; }
      if (payload === 'leaderboard') { await answerTelegramCallback(tok, query.id, '/petleaderboard'); await cmdPetLeaderboard(db, tok, chatId, buildPetProgressMenuReplyMarkup()); return; }
      if (payload === 'streak') { await answerTelegramCallback(tok, query.id, 'Streak'); await cmdPetStreak(db, tok, chatId, telegramId); return; }
      if (payload === 'activity') { await answerTelegramCallback(tok, query.id, '/petactivity'); await cmdPetActivity(db, tok, chatId, telegramId); return; }
      if (payload === 'claim') { await answerTelegramCallback(tok, query.id, '/petclaim'); await cmdPetClaim(db, tok, chatId, telegramId); return; }
      if (payload === 'cancel') { await answerTelegramCallback(tok, query.id, '/petcancel'); await cmdPetCancel(db, tok, chatId, telegramId); return; }
      if (payload.startsWith('start:')) { const a = payload.slice(6); await answerTelegramCallback(tok, query.id, `/petstart ${a}`); await cmdPetStart(db, tok, chatId, telegramId, a); return; }
      if (payload === 'shop') {
        await answerTelegramCallback(tok, query.id, '/petshop');
        await cmdPetShop(db, tok, chatId, telegramId);
        return;
      }
      if (payload === 'arena') { await answerTelegramCallback(tok, query.id, '/petarena'); await cmdPetArena(db, tok, chatId, telegramId, '', chatType); return; }
      if (payload.startsWith('arena:')) { const arenaPayload = parsePetArenaCallbackPayload(payload); await answerTelegramCallback(tok, query.id, '/petarena'); await cmdPetArena(db, tok, chatId, telegramId, arenaPayload, chatType); return; }
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

  if (env.PET_MINI_APP_ENABLED === 'true' && (isPetMiniAppCommand(cmdBase) || (cmdBase === 'start' && isPetMiniAppStartArgument(argStr)))) {
    await cmdPetMiniAppLauncher(tok, chatId, telegramId, chatType, petMiniAppDestinationForCommand(cmdBase, argStr), petMiniAppFocusForCommand(cmdBase, argStr));
    return;
  }

  const legacyPetGameplayCommands = new Set([
    'feed', 'play', 'clean', 'sleep', 'train', 'petstart', 'petclaim', 'petcancel', 'pettrade', 'petname',
    'petshop', 'peteconomy', 'petbounties', 'petexpedition', 'petmarket', 'petbag', 'petbuy', 'petuse',
    'petwork', 'petdaily', 'petevent', 'petarena', 'petkaiju', 'kaiju', 'petrun', 'petextract',
    'petadventure', 'petmissions', 'petseason', 'petboss', 'petevolve', 'petgear',
  ]);
  if (legacyPetGameplayCommands.has(cmdBase)) {
    const lifecycle = await getMoonpetLifecycle(db, telegramId).catch(() => null);
    if (lifecycle?.phase === 'egg') {
      await sendTelegramMessage(tok, chatId, 'Your Moon Egg must be cared for and hatched in the Moonpet Mini App before gameplay unlocks.');
      return;
    }
  }

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
    case 'petcoach':     await cmdPetCoach(db, tok, chatId, telegramId);             break;
    case 'petprogress':  await cmdPetProgress(db, tok, chatId, telegramId);          break;
    case 'petachievements': await cmdPetAchievements(db, tok, chatId, telegramId);   break;
    case 'petseason':    await cmdPetSeason(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petboss':      await cmdPetWeeklyBoss(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petevolve':    await cmdPetEvolve(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petgear':      await cmdPetGear(db, tok, chatId, telegramId);              break;
    case 'adopt':        await cmdPetAction(db, tok, chatId, telegramId, fromUser, 'adopt', stableEventKey); break;
    case 'feed':
    case 'play':
    case 'clean':
    case 'sleep':
    case 'train':        await cmdPetAction(db, tok, chatId, telegramId, fromUser, cmdBase, stableEventKey); break;
    case 'petstart':    await cmdPetStart(db, tok, chatId, telegramId, argStr); break;
    case 'petclaim':    await cmdPetClaim(db, tok, chatId, telegramId); break;
    case 'petcancel':   await cmdPetCancel(db, tok, chatId, telegramId); break;
    case 'petactivity': await cmdPetActivity(db, tok, chatId, telegramId); break;
    case 'pettrade':     await cmdPetTrade(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petname':      await cmdPetRename(db, tok, chatId, telegramId, argStr);    break;
    case 'petmissions':  await cmdPetMissions(db, tok, chatId, telegramId);          break;
    case 'petshop':      await cmdPetShop(db, tok, chatId, telegramId);              break;
    case 'peteconomy':   await cmdPetEconomy(db, tok, chatId, telegramId);           break;
    case 'petbounties':  await cmdPetBounties(db, tok, chatId, telegramId);          break;
    case 'petexpedition': await cmdPetExpedition(db, tok, chatId, telegramId, argStr === 'go', stableEventKey); break;
    case 'petmarket':    await cmdPetMarket(db, tok, chatId, telegramId);            break;
    case 'petbag':       await cmdPetBag(db, tok, chatId, telegramId);               break;
    case 'petbuy':       await cmdPetBuy(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petuse':       await cmdPetUse(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petwork':      await cmdPetWork(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petdaily':     await cmdPetDaily(db, tok, chatId, telegramId, stableEventKey); break;
    case 'petevent':     await cmdPetEvent(db, tok, chatId, telegramId, argStr, stableEventKey); break;
    case 'petarena':    await cmdPetArena(db, tok, chatId, telegramId, argStr, chatType); break;
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

const PET_MINI_APP_COMMANDS = new Set([
  'moonpet', 'pet', 'petcoach', 'petprogress', 'petachievements', 'petseason', 'petboss', 'petevolve', 'petgear',
  'adopt', 'feed', 'play', 'clean', 'sleep', 'train', 'petstart', 'petclaim', 'petcancel', 'petactivity',
  'pettrade', 'petname', 'petmissions', 'petshop', 'peteconomy', 'petbounties', 'petexpedition', 'petmarket',
  'petbag', 'petbuy', 'petuse', 'petwork', 'petdaily', 'petevent', 'petarena', 'petkaiju', 'kaiju', 'petrun',
  'petextract', 'petadventure', 'petnotify', 'petleaderboard', 'petscore',
]);

function isPetMiniAppCommand(command) {
  return PET_MINI_APP_COMMANDS.has(String(command || '').toLowerCase());
}

const PET_MINI_APP_SCREENS = new Set(['home', 'missions', 'explore', 'work', 'economy', 'profile']);
const PET_MINI_APP_FOCUSES = new Set(['recommended', 'vitals', 'care', 'details', 'missions', 'achievements', 'districts', 'moon-run', 'adventure', 'street-event', 'weekly-boss', 'story-chains', 'seasonal-boss', 'arena', 'kaiju', 'timed-activity', 'jobs', 'equipment', 'materials', 'relics', 'bounties', 'expedition', 'market', 'shop', 'style-lab', 'inventory', 'trade', 'rare-morph', 'memories', 'callsign', 'evolution', 'faction', 'prestige', 'tracks', 'features', 'alerts', 'season', 'leaderboard']);
const PET_MINI_APP_COMMAND_FOCUSES = Object.freeze({
  petcoach: 'recommended',
  adopt: 'care', feed: 'care', play: 'care', clean: 'care', sleep: 'care', train: 'care', petdaily: 'care',
  petmissions: 'missions', petachievements: 'achievements', petarena: 'arena', petkaiju: 'kaiju', kaiju: 'kaiju',
  petrun: 'moon-run', petextract: 'moon-run', petadventure: 'moon-run', petevent: 'street-event', petboss: 'weekly-boss',
  petstart: 'timed-activity', petclaim: 'timed-activity', petcancel: 'timed-activity', petactivity: 'timed-activity', petwork: 'jobs',
  petshop: 'shop', petbounties: 'bounties', petexpedition: 'expedition', petmarket: 'market', petbag: 'inventory',
  petbuy: 'shop', petuse: 'inventory', pettrade: 'trade', petgear: 'equipment', petprogress: 'tracks', petseason: 'season',
  petevolve: 'evolution', petnotify: 'alerts', petleaderboard: 'leaderboard', petscore: 'leaderboard', petname: 'callsign',
});
const PET_MINI_APP_COMMAND_DESTINATIONS = Object.freeze({
  petmissions: 'missions',
  petachievements: 'missions',
  petarena: 'explore',
  petkaiju: 'explore',
  kaiju: 'explore',
  petrun: 'explore',
  petextract: 'explore',
  petadventure: 'explore',
  petevent: 'explore',
  petboss: 'explore',
  petstart: 'work',
  petclaim: 'work',
  petcancel: 'work',
  petactivity: 'work',
  petwork: 'work',
  petshop: 'economy',
  peteconomy: 'economy',
  petbounties: 'economy',
  petexpedition: 'economy',
  petmarket: 'economy',
  petbag: 'economy',
  petbuy: 'economy',
  petuse: 'economy',
  pettrade: 'economy',
  petgear: 'economy',
  petcoach: 'home',
  petprogress: 'profile',
  petseason: 'profile',
  petevolve: 'profile',
  petnotify: 'profile',
  petleaderboard: 'profile',
  petscore: 'profile',
  petname: 'profile',
});

function normalizePetMiniAppDestination(destination) {
  const screen = String(destination || 'home').toLowerCase();
  return PET_MINI_APP_SCREENS.has(screen) ? screen : 'home';
}

function parsePetMiniAppStartArgument(argument) {
  const match = String(argument || '').toLowerCase().match(/^moonpet(?:_(home|missions|explore|work|economy|profile))?(?:_([a-z0-9-]+))?$/);
  if (!match) return null;
  return { screen: normalizePetMiniAppDestination(match[1] || 'home'), focus: PET_MINI_APP_FOCUSES.has(match[2]) ? match[2] : '' };
}

function petMiniAppDestinationForCommand(command, startArgument = '') {
  const normalizedCommand = String(command || '').toLowerCase();
  if (normalizedCommand === 'start') return parsePetMiniAppStartArgument(startArgument)?.screen || 'home';
  return PET_MINI_APP_COMMAND_DESTINATIONS[normalizedCommand] || 'home';
}

function petMiniAppFocusForCommand(command, startArgument = '') {
  const normalizedCommand = String(command || '').toLowerCase();
  if (normalizedCommand === 'start') return parsePetMiniAppStartArgument(startArgument)?.focus || '';
  return PET_MINI_APP_COMMAND_FOCUSES[normalizedCommand] || '';
}

function isPetMiniAppStartArgument(argument) {
  return Boolean(parsePetMiniAppStartArgument(argument));
}

function petMiniAppDestinationForCallback(data) {
  const payload = String(data || '').toLowerCase().replace(/^pet:/, '');
  if (payload === 'missions' || payload.startsWith('mission:') || payload.startsWith('achievement')) return 'missions';
  if (payload === 'menu:adventure' || /^(arena|kaiju|run|extract|adventure|event|boss|district|chain|seasonal_boss)/.test(payload)) return 'explore';
  if (/^(work|activity|job|start:|claim$|cancel$)/.test(payload)) return 'work';
  if (payload === 'menu:management' || /^(shop|economy|bount|expedition|market|bag|buy|use|trade|equipment|gear|cosmetic)/.test(payload)) return 'economy';
  if (payload === 'menu:progress' || /^(details|progress|season|evolve|leaderboard|score|streak|notify|name|prestige|identity)/.test(payload)) return 'profile';
  return 'home';
}

function petMiniAppFocusForCallback(data) {
  const payload = String(data || '').toLowerCase().replace(/^pet:/, '');
  if (payload === 'coach') return 'recommended';
  if (payload === 'details' || payload.startsWith('identity') || payload.startsWith('streak')) return 'details';
  if (payload === 'missions' || payload.startsWith('mission:')) return 'missions';
  if (payload.startsWith('achievement')) return 'achievements';
  if (payload.startsWith('arena')) return 'arena';
  if (payload.startsWith('kaiju')) return 'kaiju';
  if (/^(run|extract)/.test(payload)) return 'moon-run';
  if (payload.startsWith('adventure')) return 'adventure';
  if (/^(event_chain|chain)/.test(payload)) return 'story-chains';
  if (payload.startsWith('event')) return 'street-event';
  if (payload.startsWith('seasonal_boss')) return 'seasonal-boss';
  if (payload.startsWith('district')) return 'districts';
  if (payload.startsWith('boss')) return 'weekly-boss';
  if (/^(work|activity|job|start:|claim$|cancel$)/.test(payload)) return payload.startsWith('job') || payload === 'work' ? 'jobs' : 'timed-activity';
  if (/^(bount)/.test(payload)) return 'bounties';
  if (/^(expedition)/.test(payload)) return 'expedition';
  if (/^(market)/.test(payload)) return 'market';
  if (/^(bag|use)/.test(payload)) return 'inventory';
  if (/^(trade)/.test(payload)) return 'trade';
  if (/^(equipment|gear)/.test(payload)) return 'equipment';
  if (/^(shop|buy)/.test(payload)) return 'shop';
  if (/^(cosmetic)/.test(payload)) return 'style-lab';
  if (/^(season)/.test(payload)) return 'season';
  if (/^(evolve)/.test(payload)) return 'evolution';
  if (/^(leaderboard|score)/.test(payload)) return 'leaderboard';
  if (/^(notify)/.test(payload)) return 'alerts';
  if (/^(name)/.test(payload)) return 'callsign';
  if (/^(prestige)/.test(payload)) return 'prestige';
  if (/^(progress)/.test(payload)) return 'tracks';
  return '';
}

async function setPetMiniAppMenuButton(botToken, telegramId) {
  if (!botToken || !telegramId) return;
  const url = MOONPET_MINI_APP_URL;
  await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      menu_button: { type: 'web_app', text: 'Moonpet OS', web_app: { url } },
    }),
  }).catch(() => null);
}

function petMiniAppLaunchUrl(destination = 'home', requestedFocus = '') {
  const screen = normalizePetMiniAppDestination(destination);
  const focus = PET_MINI_APP_FOCUSES.has(String(requestedFocus || '')) ? String(requestedFocus) : '';
  return `${MOONPET_MINI_APP_URL}#screen=${screen}${focus ? `&focus=${focus}` : ''}`;
}

function buildPetMiniAppLaunchReplyMarkup(destination = 'home', focus = '') {
  return { inline_keyboard: [[{ text: 'OPEN MOONPET OS', web_app: { url: petMiniAppLaunchUrl(destination, focus) } }]] };
}

async function cmdPetMiniAppLauncher(botToken, chatId, telegramId, chatType = 'private', destination = 'home', focus = '') {
  const screen = normalizePetMiniAppDestination(destination);
  const normalizedFocus = PET_MINI_APP_FOCUSES.has(String(focus || '')) ? String(focus) : '';
  const url = petMiniAppLaunchUrl(screen, normalizedFocus);
  if (String(chatType) === 'private') await setPetMiniAppMenuButton(botToken, telegramId);
  const launchButton = String(chatType) === 'private'
    ? { text: 'OPEN MOONPET OS', web_app: { url } }
    : { text: 'OPEN MOONPET OS', url: `https://t.me/WIKICOMSBOT?start=moonpet_${screen}${normalizedFocus ? `_${normalizedFocus}` : ''}` };
  await sendTelegramMessage(botToken, chatId,
    `<b>MOONPET OS</b>\nThe pet game now runs inside its HTML5 Mini App. Chat gameplay controls are retired.`,
    { reply_markup: { inline_keyboard: [[launchButton]] } },
  );
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
    `/pet — Open Moonpet OS\n` +
    `• All pet care, progression, jobs, economy, runs, bosses, Arena, Kaiju, alerts and leaderboards now run inside Moonpet OS.\n` +
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

function formatPetActivityLine(session, now = new Date()) {
  if (!session) return '';
  const elapsed = Math.max(0, Math.floor((now.getTime() - (parseSqliteTs(session.started_at) ?? now.getTime())) / 1000));
  const remaining = Math.max(0, PET_ACTIVITY_MIN_SECONDS - elapsed);
  return `${escapeHtml(session.activity_type)}: ${formatPetDuration(elapsed)} elapsed, ${remaining > 0 ? `claim ready in ${formatPetDuration(remaining)}` : 'claim ready now'}`;
}

function formatPetStat(label, value) {
  const safeValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const filled = safeValue > 0 ? Math.ceil(safeValue / 10) : 0;
  return `${label}\n${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${safeValue}%`;
}

function formatPetStatus(pet, identity = null, activity = null, reaction = undefined) {
  const p = serializePet(pet, identity);
  if (!p) return 'No Crypto Moonboy Pet found. Use /adopt to start.';
  const stage = p.stage || 'Moon Egg';
  const traits = Array.isArray(identity?.personalities) ? identity.personalities.slice(0, 2) : [];
  const favourite = String(identity?.memories?.favourite_activity || '').trim();
  const needsCare = p.health <= 45 || p.hunger >= 75 || p.cleanliness <= 35 || p.happiness <= 35 || p.energy <= 25;
  const identityLines = [];
  if (reaction !== null) identityLines.push(`<i>“${escapeHtml(reaction === undefined ? buildMoonpetReaction('status', identity || {}, { pet: p }) : reaction)}”</i>`);
  if (traits.length) identityLines.push(`<b>Personality:</b> ${traits.map((trait) => escapeHtml(trait.name)).join(' · ')}`);
  if (favourite) identityLines.push(`<b>Favourite:</b> ${escapeHtml(favourite)}`);
  if (identity?.memories?.first_boss_id) identityLines.push(`<b>Remembers:</b> first defeating ${escapeHtml(String(identity.memories.first_boss_id).replaceAll('_', ' '))}`);
  return [
    `🌕 <b>${escapeHtml(p.pet_name || 'Moonpet')}</b>`,
    '',
    `<b>${escapeHtml(stage)}</b>`,
    `Level ${p.level} | XP ${p.pet_xp} | ${100 - (p.pet_xp % 100)} XP to next level`,
    ...identityLines,
    '',
    formatPetStat('❤️ Health', p.health),
    '',
    formatPetStat('🍖 Hunger', p.hunger),
    '',
    formatPetStat('😊 Happiness', p.happiness),
    '',
    formatPetStat('🧼 Cleanliness', p.cleanliness),
    '',
    formatPetStat('⚡ Energy', p.energy),
    needsCare ? '\n⚠️ <b>Needs attention:</b>\nYour Moonpet requires care.' : '\n✅ Your Moonpet is feeling good.',
    activity ? `\n🌙 <b>Activity:</b> ${formatPetActivityLine(activity)}` : '',
  ].join('\n');
}

async function getMoonpetIdentityWithLifecycle(db, telegramId) {
  const [identity, lifecycle] = await Promise.all([
    getMoonpetIdentitySummary(db, telegramId).catch(() => null),
    getExistingMoonpetLifecycle(db, telegramId).catch(() => null),
  ]);
  if (identity) identity.lifecycle = lifecycle;
  return identity;
}

async function appendMoonpetReaction(db, telegramId, context, text, pet = null, detail = {}) {
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
  const reaction = await selectMoonpetReaction(db, telegramId, context, identity || {}, { ...detail, pet })
    .catch(() => buildMoonpetReaction(context, identity || {}, { ...detail, pet }));
  return `${text}\n\n<i>${escapeHtml(reaction)}</i>`;
}

function formatPetDisplayNumber(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-GB');
}

function formatPetItemDisplayName(itemKey, fallback = 'None equipped') {
  const key = String(itemKey || '').trim();
  if (!key || key === 'none') return fallback;
  if (key === 'basic') return 'Basic';
  const title = PET_SHOP_ITEMS[key]?.title || PET_INVENTORY_ITEMS[key]?.title;
  if (title) return title;
  return key
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPetStageIcon(stageName) {
  const stage = String(stageName || '').toLowerCase();
  if (stage.includes('egg')) return '🥚';
  if (stage.includes('hatch') || stage.includes('baby')) return '🐣';
  if (stage.includes('legendary') || stage.includes('guardian')) return '👑';
  if (stage.includes('adult') || stage.includes('evolved')) return '🌕';
  return '🧬';
}

function getPetMissionIcon(mission = {}) {
  const key = `${mission.key || ''} ${mission.title || ''}`.toLowerCase();
  if (key.includes('care') || (key.includes('feed') && key.includes('play') && key.includes('clean'))) return '❤️';
  if (key.includes('feed')) return '🍖';
  if (key.includes('train')) return '🏋️';
  if (key.includes('trade')) return '💱';
  if (key.includes('shop') || key.includes('buy') || key.includes('equip')) return '🛒';
  if (key.includes('adventure') || key.includes('run')) return '⚔️';
  if (key.includes('bank') || key.includes('gold')) return '🏦';
  return '🎯';
}

function formatPetDetails(pet, missions = null, activity = null, identity = null) {
  const p = serializePet(pet, identity);
  if (!p) return 'No Crypto Moonboy Pet found. Use /adopt to start.';
  const missionLines = Array.isArray(missions?.daily)
    ? missions.daily.map((mission) => `${mission.completed ? '✅' : '⬜️'} ${getPetMissionIcon(mission)} ${escapeHtml(mission.title)}`)
    : [];
  const warnings = [];
  if (p.health <= 45) warnings.push('🩹 Low health: urgent care needed.');
  if (p.hunger >= 75) warnings.push('🍖 High hunger: feed soon.');
  if (p.cleanliness <= 35) warnings.push('🧼 Low cleanliness: clean soon.');
  if (p.happiness <= 35) warnings.push('🎮 Low happiness: play soon.');
  if (p.energy <= 25) warnings.push('😴 Low energy: sleep before adventure.');
  const stage = p.stage || 'Moon Egg';
  return [
    `📋 <b>${escapeHtml(p.pet_name)} Details</b>`,
    `${getPetStageIcon(stage)} <b>${escapeHtml(stage)}</b>`,
    `⭐ Level ${formatPetDisplayNumber(p.level)} · ✨ ${formatPetDisplayNumber(p.pet_xp)} XP`,
    `📈 ${formatPetDisplayNumber(100 - (p.pet_xp % 100))} XP to Level ${formatPetDisplayNumber(p.level + 1)}`,
    activity ? `⏱️ <b>Current activity:</b> ${formatPetActivityLine(activity)}` : '',
    '',
    '💰 <b>Wallet</b>',
    `🪙 ${formatPetDisplayNumber(p.moon_gold)} Moon Gold`,
    `💎 ${formatPetDisplayNumber(p.moon_crystals)} Moon Crystals`,
    `🎨 ${formatPetDisplayNumber(p.style_tokens)} Style`,
    '',
    '🎒 <b>Equipment</b>',
    `🍖 <b>Food</b> — ${escapeHtml(formatPetItemDisplayName(p.equipped_food, 'Basic Food'))}`,
    `🎾 <b>Toy</b> — ${escapeHtml(formatPetItemDisplayName(p.equipped_toy, 'Basic Toy'))}`,
    `👕 <b>Outfit</b> — ${escapeHtml(formatPetItemDisplayName(p.equipped_outfit))}`,
    `🛡️ <b>Armor</b> — ${escapeHtml(formatPetItemDisplayName(p.equipped_armor))}`,
    `🥊 <b>Weapon</b> — ${escapeHtml(formatPetItemDisplayName(p.equipped_weapon))}`,
    `🧿 <b>Charm</b> — ${escapeHtml(formatPetItemDisplayName(p.equipped_charm))}`,
    '',
    '❤️‍🩹 <b>Needs</b>',
    ...(warnings.length ? warnings : ['✅ All needs are stable.']),
    '',
    '🎯 <b>Daily Missions</b>',
    ...(missionLines.length ? missionLines : ['▫️ No missions available.']),
    '',
    '🔥 <b>Streak</b>',
    `🔥 ${formatPetDisplayNumber(p.streak_days)}-day streak`,
  ].filter(Boolean).join('\n');
}

async function getPetEvolutionGuidance(db, telegramId, pet, identity) {
  const currentStage = Math.max(0, Number(identity?.current_stage?.stage) || 0);
  const next = Object.values(MOONPET_EVOLUTIONS).find((entry) => Number(entry.stage) === currentStage + 1) || null;
  if (!next) return null;
  const [inventory, materials, victories, relicCount, authority] = await Promise.all([
    db.prepare(`SELECT asset_type, asset_key, quantity FROM telegram_pet_inventory WHERE telegram_id = ? AND quantity > 0`)
      .bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id = ? AND quantity > 0`)
      .bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT boss_id, victories FROM telegram_pet_boss_victories WHERE telegram_id = ?`)
      .bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id = ?`)
      .bind(telegramId).first().catch(() => ({ count: 0 })),
    evaluateMoonpetEvolutionRequirements(db, { telegram_id: telegramId, evolution_id: next.evolution_id }),
  ]);
  const inventoryCounts = new Map((inventory.results || []).map((row) => [`${row.asset_type}:${row.asset_key}`, Math.max(0, Number(row.quantity) || 0)]));
  for (const row of materials.results || []) inventoryCounts.set(`material:${row.material_key}`, Math.max(0, Number(row.quantity) || 0));
  const bossCounts = new Map((victories.results || []).map((row) => [String(row.boss_id), Math.max(0, Number(row.victories) || 0)]));
  const missing = [];
  const level = getPetLevel(pet?.pet_xp);
  if (level < Number(next.requirements.pet_level || 1)) missing.push({
    key: 'level', label: 'Moonpet level', current: level, required: next.requirements.pet_level,
    source: 'Care, jobs, activities and Moon Runs award Pet XP.', callback_data: 'pet:coach',
  });
  for (const [bossId, required] of Object.entries(next.requirements.boss_victories || {})) {
    const current = bossCounts.get(bossId) || 0;
    if (current < Number(required)) missing.push({
      key: `boss:${bossId}`, label: `${bossId.replaceAll('_', ' ')} victories`, current, required,
      source: 'Defeat this boss at the end of Moon Runs.', callback_data: 'pet:run',
    });
  }
  const requiredRelics = Math.max(0, Number(next.requirements.relics_owned) || 0);
  const currentRelics = Math.max(0, Number(relicCount?.count) || 0);
  if (currentRelics < requiredRelics) missing.push({
    key: 'relics', label: 'Relics owned', current: currentRelics, required: requiredRelics,
    source: 'Moon Run bosses can drop relics.', callback_data: 'pet:run',
  });
  for (const [assetType, assets] of Object.entries(next.requirements.inventory || {})) {
    for (const [assetKey, required] of Object.entries(assets || {})) {
      const current = inventoryCounts.get(`${assetType}:${assetKey}`) || 0;
      if (current < Number(required)) missing.push({
        key: `${assetType}:${assetKey}`, label: assetKey.replaceAll('_', ' '), current, required,
        source: 'Find it in Moon Run enemy, loot and boss rewards.', callback_data: 'pet:run',
      });
    }
  }
  if (!authority.ready && missing.length === 0) missing.push({
    key: `authority:${authority.reason || 'evolution_authority_unavailable'}`,
    label: authority.reason === 'requirements_not_met' ? 'Season age, Growth Marks, or Weekly Crests' : 'Evolution authority',
    current: 0,
    required: 1,
    source: authority.reason === 'requirements_not_met'
      ? 'Continue qualified daily and weekly activity in the active pet season.'
      : 'Server validation is temporarily unavailable; retry shortly.',
    callback_data: 'pet:coach',
  });
  return {
    evolution_id: next.evolution_id,
    name: next.name,
    stage: next.stage,
    perk: getPetEvolutionPerk(next.stage).perk,
    ready: authority.ready,
    authority_reason: authority.reason,
    missing,
  };
}

function getPetGuidanceFeatures(level) {
  return [
    { key: 'care_console', title: 'Care Console', available: level >= 1, detail: 'Feed, play, clean, sleep and train from the Pet screen.', callback_data: 'pet:details' },
    { key: 'daily_missions', title: 'Daily Missions', available: level >= 1, detail: 'Seven tracked goals reset at 00:00 UTC.', callback_data: 'pet:missions' },
    { key: 'timed_activities', title: 'Timed Activities', available: level >= 1, detail: 'Sleep, train, work or explore while rewards build over time.', callback_data: 'pet:activity' },
    { key: 'moon_runs', title: 'Moon Runs', available: level >= 1, detail: 'Choose routes, risk unbanked rewards and extract before defeat.', callback_data: 'pet:run' },
    { key: 'street_events', title: 'Street Events', available: level >= 1, detail: 'Server-selected encounters change with your choices.', callback_data: 'pet:event' },
    { key: 'kaiju_cards', title: 'Kaiju Code Cards', available: level >= 1, detail: 'Battle a CRT rival or match with another player.', callback_data: 'pet:kaiju' },
    { key: 'weekly_boss', title: 'Weekly Boss', available: level >= 5, detail: 'One personal boss attack is available per UTC day.', callback_data: 'pet:boss' },
    { key: 'pet_arena', title: 'Pet Arena', available: level >= PET_ARENA_MIN_LEVEL, detail: `Arena battles are available from Level ${PET_ARENA_MIN_LEVEL}.`, callback_data: 'pet:arena' },
    { key: 'moon_economy', title: 'Moon Economy', available: level >= 1, detail: 'Daily bounties, Crystal Expeditions and rotating Moon Market offers are now available.', callback_data: 'pet:economy' },
    { key: 'equipment_upgrades', title: 'Equipment Upgrades', available: level >= 15, detail: 'Owned equipment can now be upgraded through ten levels.', callback_data: 'pet:gear' },
    { key: 'prestige', title: 'Prestige', available: level >= 100, detail: 'Prestige becomes possible after its gear, district and currency requirements are complete.', callback_data: 'pet:progress' },
  ];
}

function canAffordPetWallet(pet, cost = {}) {
  return ['moon_gold', 'moon_crystals', 'style_tokens'].every((key) =>
    Math.max(0, Number(pet?.[key]) || 0) >= Math.max(0, Number(cost?.[key]) || 0));
}

async function getPetEconomyState(db, telegramId, petRaw = null, now = new Date()) {
  const pet = serializePet(petRaw || await getPetProfile(db, telegramId).catch(() => null));
  if (!pet) return null;
  const dayKey = getPetDayKey(now);
  const level = getPetLevel(pet.pet_xp);
  const [eventRows, claimRows] = await Promise.all([
    db.prepare(`SELECT event_type, COUNT(*) AS total FROM telegram_pet_events
      WHERE telegram_id = ? AND day_key = ? AND status = 'accepted' GROUP BY event_type`)
      .bind(telegramId, dayKey).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT source, idempotency_key FROM telegram_pet_reward_claims
      WHERE telegram_id = ? AND day_key = ? AND status = 'awarded'
        AND source IN ('pet_bounty', 'pet_expedition', 'pet_market')`)
      .bind(telegramId, dayKey).all().catch(() => ({ results: [] })),
  ]);
  const counts = new Map((eventRows.results || []).map((row) => [String(row.event_type), Math.max(0, Number(row.total) || 0)]));
  const claims = claimRows.results || [];
  const claimedKeys = new Set(claims.map((row) => `${row.source}:${row.idempotency_key}`));
  const bounties = getPetDailyBounties(dayKey).map((bounty) => {
    const progress = bounty.event_types.reduce((sum, eventType) => sum + (counts.get(eventType) || 0), 0);
    return { ...bounty, progress: Math.min(bounty.required, progress), complete: progress >= bounty.required,
      claimed: claimedKeys.has(`pet_bounty:${dayKey}:${bounty.key}`) };
  });
  const marketOffers = getPetMarketOffers(dayKey).map((offer) => ({
    ...offer,
    unlocked: level >= offer.min_level,
    affordable: level >= offer.min_level && canAffordPetWallet(pet, offer.cost),
    purchased: claimedKeys.has(`pet_market:${dayKey}:${offer.key}`),
  }));
  const expeditionAttempts = claims.filter((row) => row.source === 'pet_expedition').length;
  const expedition = getPetExpedition(level);
  const state = {
    day_key: dayKey,
    pet,
    routes: PET_ECONOMY_ROUTES,
    bounties,
    market_offers: marketOffers,
    expedition,
    expedition_attempts: expeditionAttempts,
    expedition_attempts_left: Math.max(0, 3 - expeditionAttempts),
  };
  return { ...state, guidance_actions: buildPetEconomyGuidanceActions(state) };
}

async function claimPetEconomyBounty(db, telegramId, bountyKey, now = new Date()) {
  const state = await getPetEconomyState(db, telegramId, null, now);
  if (!state) return { accepted: false, reason: 'pet_not_adopted' };
  const bounty = state.bounties.find((entry) => entry.key === String(bountyKey || ''));
  if (!bounty) return { accepted: false, reason: 'bounty_not_available', state };
  if (!bounty.complete) return { accepted: false, reason: 'bounty_incomplete', bounty, state };
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_bounty', idempotency_key: `${state.day_key}:${bounty.key}`,
    event_key: `pet:economy:bounty:${telegramId}:${state.day_key}:${bounty.key}`,
    event_type: 'economy_bounty', reason: bounty.key, rewards: bounty.reward, touch_streak: true, now,
    context: { bounty_key: bounty.key, verified_progress: bounty.progress },
  });
  return { ...awarded, reason: awarded.accepted ? 'bounty_claimed' : awarded.reason, bounty };
}

async function runPetCrystalExpedition(db, telegramId, now = new Date(), requestKey = '') {
  const state = await getPetEconomyState(db, telegramId, null, now);
  if (!state) return { accepted: false, reason: 'pet_not_adopted' };
  if (!state.expedition_attempts_left) return { accepted: false, reason: 'expedition_daily_limit', state };
  if (Number(state.pet.energy || 0) < state.expedition.energy) return { accepted: false, reason: 'pet_tired', state };
  const attempt = state.expedition_attempts + 1;
  const resolved = resolvePetExpeditionReward(state.day_key, telegramId, attempt, state.pet.level);
  const settlementKey = String(requestKey || `${state.day_key}:${attempt}`).slice(0, 120);
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_expedition', idempotency_key: settlementKey,
    event_key: `pet:economy:expedition:${telegramId}:${settlementKey}`.slice(0, 220),
    event_type: 'economy_expedition', reason: resolved.expedition.key, rewards: { ...resolved.reward, pet_xp: 12 },
    profile_deltas: { energy: -resolved.expedition.energy }, touch_streak: true, now,
    context: { expedition_key: resolved.expedition.key, attempt, day_key: state.day_key, energy_cost: resolved.expedition.energy },
  });
  return { ...awarded, reason: awarded.accepted ? 'expedition_complete' : awarded.reason, attempt, expedition: resolved.expedition };
}

async function buyPetMarketOffer(db, telegramId, offerKey, now = new Date()) {
  const state = await getPetEconomyState(db, telegramId, null, now);
  if (!state) return { accepted: false, reason: 'pet_not_adopted' };
  const offer = state.market_offers.find((entry) => entry.key === String(offerKey || ''));
  if (!offer) return { accepted: false, reason: 'market_offer_not_available', state };
  if (offer.purchased) return { accepted: true, duplicate: true, reason: 'market_offer_sold', offer, state };
  if (!offer.unlocked) return { accepted: false, reason: 'market_offer_locked', offer, state };
  if (!offer.affordable) return { accepted: false, reason: 'not_enough_pet_currency', offer, state };
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_market', idempotency_key: `${state.day_key}:${offer.key}`,
    event_key: `pet:economy:market:${telegramId}:${state.day_key}:${offer.key}`,
    event_type: 'economy_market', reason: offer.key, rewards: offer.reward, currency_costs: offer.cost,
    touch_streak: false, now, context: { offer_key: offer.key },
  });
  return { ...awarded, reason: awarded.accepted ? 'market_purchase' : awarded.reason, offer };
}

async function buildPetGuidanceState(db, telegramId, petRaw = null) {
  const sourcePet = petRaw || await getPetProfile(db, telegramId).catch(() => null);
  const pet = serializePet(sourcePet);
  if (!pet) return null;
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const [identity, activity, activeRun, missions, seasonState, achievements, weeklyProgress, weeklyAttempt, runtime] = await Promise.all([
    getMoonpetIdentityWithLifecycle(db, telegramId),
    getActivePetActivitySession(db, telegramId, now).catch(() => null),
    getActivePetRun(db, telegramId).catch(() => null),
    buildPetMissions(db, telegramId).catch(() => ({ daily: [] })),
    getPetSeasonRewardState(db, telegramId),
    syncPetAchievements(db, telegramId),
    db.prepare(`SELECT boss_id, attempts, damage, defeated_at FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?`)
      .bind(telegramId, weekKey).first().catch(() => null),
    db.prepare(`SELECT 1 AS used FROM telegram_pet_weekly_boss_events WHERE telegram_id = ? AND week_key = ? AND day_key = ?`)
      .bind(telegramId, weekKey, dayKey).first().catch(() => null),
    getOrCreatePetRuntimeState(db, telegramId, dayKey).catch(() => null),
  ]);
  Object.assign(pet, serializePet(sourcePet, identity));
  const [evolution, economy] = await Promise.all([
    getPetEvolutionGuidance(db, telegramId, pet, identity),
    getPetEconomyState(db, telegramId, pet, now),
  ]);
  const level = getPetLevel(pet.pet_xp);
  const stage = Math.max(0, Number(identity?.current_stage?.stage) || 0);
  const elapsedSeconds = activity ? Math.max(0, Math.floor((now.getTime() - (parseSqliteTs(activity.started_at) ?? now.getTime())) / 1000)) : 0;
  const boss = getPetWeeklyBoss(weekKey);
  return {
    pet,
    day_key: dayKey,
    week_key: weekKey,
    identity,
    activity: activity ? {
      ...activity,
      ready: elapsedSeconds >= PET_ACTIVITY_MIN_SECONDS,
      detail: elapsedSeconds >= PET_ACTIVITY_MIN_SECONDS ? 'Claim ready now.' : `Claim ready in ${formatPetDuration(PET_ACTIVITY_MIN_SECONDS - elapsedSeconds)}.`,
    } : null,
    active_run: activeRun,
    missions: missions.daily || [],
    evolution,
    current_evolution_perk: getPetEvolutionPerk(stage),
    season: {
      key: seasonState.season.key,
      xp: seasonState.season_xp,
      evolution_bonus_style: seasonState.evolution_stage,
      tiers: seasonState.tiers,
    },
    achievements,
    personalities: identity?.personalities || [],
    weekly_boss: {
      boss_id: boss.boss_id,
      title: boss.title,
      hp: boss.hp,
      damage: Math.max(0, Number(weeklyProgress?.damage) || 0),
      remaining_hp: Math.max(0, boss.hp - Math.max(0, Number(weeklyProgress?.damage) || 0)),
      attempts: Math.max(0, Number(weeklyProgress?.attempts) || 0),
      max_attempts: 7,
      weakness: boss.weakness,
      reward: boss.reward,
      available: level >= 5 && !weeklyProgress?.defeated_at && !weeklyAttempt && Number(pet.energy || 0) >= 12,
      attempt_used: Boolean(weeklyAttempt),
      defeated: Boolean(weeklyProgress?.defeated_at),
    },
    features: getPetGuidanceFeatures(level),
    jobs: Object.values(PET_JOBS).map((job) => ({
      ...job,
      lore: PET_JOB_LORE[job.key] || '',
      required_track: PET_ELITE_JOBS[job.key]?.required_track || null,
      required_xp: PET_ELITE_JOBS[job.key]?.required_xp || 0,
      current_xp: PET_ELITE_JOBS[job.key]
        ? Math.max(0, Number(runtime?.[`${PET_ELITE_JOBS[job.key].required_track}_xp`]) || 0) : 0,
      available: level >= job.min_level && stage >= job.min_evolution_stage
        && (!PET_ELITE_JOBS[job.key] || canStartPetEliteJob(job.key, { ...runtime, level })),
    })),
    shop_items: petShopItemsForPet(pet),
    economy,
    economy_actions: economy?.guidance_actions || [],
  };
}

async function markPetGuidanceNoticesShown(db, telegramId, notices) {
  if (!notices.length) return;
  await db.batch(notices.map((notice) => db.prepare(`UPDATE telegram_pet_guidance_notices
    SET shown_at = CURRENT_TIMESTAMP WHERE telegram_id = ? AND notice_key = ? AND shown_at IS NULL`)
    .bind(telegramId, notice.key || notice.notice_key)));
}

async function markPetGuidanceAfterDelivery(db, telegramId, notices, delivery) {
  if (!delivery?.ok || !db || !telegramId || !notices?.length) return delivery;
  await markPetGuidanceNoticesShown(db, telegramId, notices).catch((error) => {
    logApiFailure('telegram_pet_guidance_delivery_mark_failed', {
      telegramId,
      message: error?.message || String(error),
    });
  });
  return delivery;
}

async function sendTelegramBuiltPetGuidedReply(botToken, chatId, db, telegramId, guided) {
  const delivery = await sendTelegramMessage(botToken, chatId, guided.text, { reply_markup: guided.reply_markup });
  return markPetGuidanceAfterDelivery(db, telegramId, guided.notices, delivery);
}

async function persistPetGuidanceNotices(db, telegramId, candidates) {
  const writes = candidates.map((notice) => db.prepare(`INSERT OR IGNORE INTO telegram_pet_guidance_notices
    (telegram_id, notice_key, notice_type, title, detail, callback_data)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(telegramId, notice.key, notice.type, String(notice.title).slice(0, 160), String(notice.detail || '').slice(0, 500), String(notice.callback_data || 'pet:coach').slice(0, 100)));
  if (writes.length) await db.batch(writes);
  const pending = await db.prepare(`SELECT notice_key AS key, notice_type AS type, title, detail, callback_data
    FROM telegram_pet_guidance_notices WHERE telegram_id = ? AND shown_at IS NULL
    ORDER BY CASE notice_type
      WHEN 'evolution_ready' THEN 100 WHEN 'season_reward' THEN 90 WHEN 'personality' THEN 80
      WHEN 'achievement' THEN 70 WHEN 'feature' THEN 60 WHEN 'job' THEN 50 ELSE 40 END DESC,
      created_at ASC LIMIT 50`).bind(telegramId).all();
  return pending.results || [];
}

async function buildPetGuidedReply(db, telegramId, pet, text, replyMarkup = null, options = {}) {
  const state = await buildPetGuidanceState(db, telegramId, pet);
  if (!state) return { text, reply_markup: replyMarkup || { inline_keyboard: [] }, state: null, notices: [] };
  const candidates = buildPetGuidanceCandidates(state);
  const notices = options.surface_notices === false ? [] : await persistPetGuidanceNotices(db, telegramId, candidates);
  const next = choosePetNextAction(state);
  const sections = [text];
  if (notices.length) {
    const visible = notices.slice(0, 3);
    sections.push(`<b>🎉 New progress</b>\n${visible.map((notice) => `• ${escapeHtml(notice.title)}`).join('\n')}${notices.length > visible.length ? `\n• +${notices.length - visible.length} more unlocks available across your menus` : ''}`);
  }
  if (next) sections.push(`<b>🧭 Recommended Next Move</b>\n<b>${escapeHtml(next.title)}</b>\n${escapeHtml(next.detail)}`);
  return {
    text: sections.join('\n\n'),
    reply_markup: mergePetGuidanceReplyMarkup(replyMarkup, next),
    state,
    notices,
    next,
  };
}

function petReplyMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '🍖 Feed', callback_data: 'pet:feed' },
        { text: '🎮 Play', callback_data: 'pet:play' },
      ],
      [
        { text: '🧼 Clean', callback_data: 'pet:clean' },
        { text: '😴 Sleep', callback_data: 'pet:sleep' },
      ],
      [
        { text: '🏋️ Train', callback_data: 'pet:train' },
        { text: '⚔️ Adventure', callback_data: 'pet:menu:adventure' },
      ],
      [{ text: '⏱ Activities', callback_data: 'pet:activity' }, { text: '⚙️ Management', callback_data: 'pet:menu:management' }],
      [{ text: '🧭 Coach', callback_data: 'pet:coach' }, { text: '📋 Details', callback_data: 'pet:details' }],
    ],
  };
}

function buildPetAdventureMenuReplyMarkup() {
  return { inline_keyboard: [
    [{ text: '🏃 Moon Run', callback_data: 'pet:run' }],
    [{ text: '👑 Weekly Boss', callback_data: 'pet:boss' }],
    [{ text: '💼 Pet Jobs', callback_data: 'pet:work' }],
    [{ text: '🎲 Random Events', callback_data: 'pet:event' }],
    [{ text: '🦖 Kaiju', callback_data: 'pet:kaiju' }],
    [{ text: '⚔️ Arena', callback_data: 'pet:arena' }],
    [{ text: '🎁 Daily', callback_data: 'pet:daily' }],
    [{ text: '⬅️ Back', callback_data: 'pet:back' }],
  ] };
}

function buildPetManagementMenuReplyMarkup() {
  return { inline_keyboard: [
    [{ text: '💰 Economy', callback_data: 'pet:economy' }],
    [{ text: '🎒 Bag', callback_data: 'pet:bag' }],
    [{ text: '🛒 Shop', callback_data: 'pet:shop' }],
    [{ text: '⚙️ Equipment', callback_data: 'pet:equipment' }],
    [{ text: '💱 Trade', callback_data: 'pet:trade' }],
    [{ text: '⬅️ Back', callback_data: 'pet:back' }],
  ] };
}

function buildPetProgressMenuReplyMarkup() {
  return { inline_keyboard: [
    [{ text: '🧭 Recommended Next Move', callback_data: 'pet:coach' }],
    [{ text: '📋 Details', callback_data: 'pet:details' }],
    [{ text: '🎯 Missions', callback_data: 'pet:missions' }],
    [{ text: '🧬 Evolution', callback_data: 'pet:identity:evolution' }],
    [{ text: '🧠 Personality', callback_data: 'pet:identity:personality' }],
    [{ text: '📖 Memories', callback_data: 'pet:identity:memories' }],
    [{ text: '🏅 Achievements', callback_data: 'pet:achievements' }],
    [{ text: '🎟 Season Rewards', callback_data: 'pet:season' }],
    [{ text: '🏆 Leaderboard', callback_data: 'pet:leaderboard' }],
    [{ text: '🔥 Streak', callback_data: 'pet:streak' }],
    [{ text: '⬅️ Back', callback_data: 'pet:back' }],
  ] };
}

async function syncPetAchievements(db, telegramId) {
  const [profile, events, memory, personalities, evolution] = await Promise.all([
    db.prepare(`SELECT 1 AS adopted FROM telegram_pet_profiles WHERE telegram_id = ?`).bind(telegramId).first().catch(() => null),
    db.prepare(`SELECT
      SUM(CASE WHEN event_type IN ('feed','play','clean','sleep','train') AND status='accepted' THEN 1 ELSE 0 END) AS care_actions,
      SUM(CASE WHEN event_type='random_event' AND status='accepted' THEN 1 ELSE 0 END) AS event_actions,
      SUM(CASE WHEN event_type='work' AND status='accepted' THEN 1 ELSE 0 END) AS job_actions,
      COUNT(DISTINCT CASE WHEN event_type='work' AND status='accepted' THEN reason END) AS distinct_jobs
      FROM telegram_pet_events WHERE telegram_id = ?`).bind(telegramId).first().catch(() => null),
    db.prepare(`SELECT total_runs, total_bosses_defeated FROM telegram_pet_memories WHERE telegram_id = ?`).bind(telegramId).first().catch(() => null),
    db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE telegram_id = ? AND unlocked_at IS NOT NULL`).bind(telegramId).first().catch(() => null),
    db.prepare(`SELECT COALESCE(
      (SELECT MAX(stage) FROM telegram_pet_evolutions_by_pet WHERE telegram_id = ?),
      (SELECT MAX(stage) FROM telegram_pet_evolutions WHERE telegram_id = ?),
      0
    ) AS stage`).bind(telegramId, telegramId).first().catch(() => null),
  ]);
  if (!profile) return [];
  const values = {
    adoption: 1,
    care_actions: Number(events?.care_actions || 0),
    event_actions: Number(events?.event_actions || 0),
    job_actions: Number(events?.job_actions || 0),
    distinct_jobs: Number(events?.distinct_jobs || 0),
    runs_completed: Number(memory?.total_runs || 0),
    bosses_defeated: Number(memory?.total_bosses_defeated || 0),
    personalities: Number(personalities?.count || 0),
    evolution_stage: Number(evolution?.stage || 0),
  };
  const statements = Object.entries(PET_ACHIEVEMENTS).map(([achievementId, definition]) => {
    const progress = Math.max(0, Math.floor(values[definition.source] || 0));
    return db.prepare(`INSERT INTO telegram_pet_achievements (telegram_id, achievement_id, progress, target, unlocked_at)
      VALUES (?, ?, ?, ?, CASE WHEN ? >= ? THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT(telegram_id, achievement_id) DO UPDATE SET
        progress = MAX(telegram_pet_achievements.progress, excluded.progress), target = excluded.target,
        unlocked_at = COALESCE(telegram_pet_achievements.unlocked_at,
          CASE WHEN MAX(telegram_pet_achievements.progress, excluded.progress) >= excluded.target THEN CURRENT_TIMESTAMP ELSE NULL END),
        updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, achievementId, progress, definition.target, progress, definition.target);
  });
  await db.batch(statements);
  const rows = await db.prepare(`SELECT achievement_id, progress, target, unlocked_at FROM telegram_pet_achievements
    WHERE telegram_id = ? ORDER BY unlocked_at IS NULL, unlocked_at, achievement_id`).bind(telegramId).all();
  return (rows.results || []).map((row) => ({ ...row, ...PET_ACHIEVEMENTS[row.achievement_id] }));
}

async function settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progress) {
  if (!progress?.defeated_at) return null;
  const rewardKey = `weekly_boss:${telegramId}:${weekKey}:${boss.boss_id}`;
  const award = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_weekly_boss', idempotency_key: rewardKey, event_key: rewardKey,
    event_type: 'weekly_boss_reward', reason: boss.boss_id, rewards: boss.reward, touch_streak: true,
    context: { week_key: weekKey, boss_id: boss.boss_id },
  });
  if (award.accepted || award.duplicate) {
    await db.prepare(`UPDATE telegram_pet_weekly_boss_progress SET reward_claimed_at = COALESCE(reward_claimed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND week_key = ? AND defeated_at IS NOT NULL`).bind(telegramId, weekKey).run();
  }
  return award;
}

async function awardStoredWeeklyBossVictoryCrest(db, telegramId, weekKey, bossId, now = new Date()) {
  try {
    const victory = await db.prepare(`SELECT pet_id, telegram_id, season_key, victory_event_key, defeated_at
      FROM telegram_pet_weekly_boss_victories_by_pet WHERE telegram_id=? AND week_key=? AND boss_id=? LIMIT 1`)
      .bind(telegramId, weekKey, bossId).first();
    if (!victory) return { accepted: false, non_fatal: true, reason: 'victorious_pet_evidence_missing' };
    const defeatedAtIso = normalizeServerTimestamp(victory.defeated_at, now);
    const defeatedAt = new Date(defeatedAtIso);
    const season = getPetSeasonInfo(defeatedAt);
    if (victory.season_key !== season.key) return { accepted: false, non_fatal: true, reason: 'victory_season_mismatch' };
    return await awardPetWeeklyCrest(db, {
      pet_id: victory.pet_id, telegram_id: victory.telegram_id, season_key: victory.season_key,
      season_week: getPetSeasonWeek(season, defeatedAt), objective: 'weekly_boss',
      evidence_key: `weekly-boss:${victory.victory_event_key}`,
      earned_at: defeatedAtIso,
    });
  } catch (error) {
    return { accepted: false, non_fatal: true, reason: 'weekly_crest_unavailable' };
  }
}

async function recordWeeklyBossVictoryCrest(db, telegramId, weekKey, bossId, eventKey, defeatedAt = new Date(), victoriousPet = null) {
  try {
    const active = victoriousPet || await findActivePetSlot(db, telegramId);
    if (!active || String(active.telegram_id) !== String(telegramId)) return { accepted: false, non_fatal: true, reason: 'victorious_pet_missing' };
    const defeatedAtIso = normalizeServerTimestamp(defeatedAt);
    const season = getPetSeasonInfo(new Date(defeatedAtIso));
    if (active.season_key !== season.key) return { accepted: false, non_fatal: true, reason: 'active_pet_previous_season' };
    await db.prepare(`INSERT OR IGNORE INTO telegram_pet_weekly_boss_victories_by_pet
      (telegram_id, week_key, boss_id, pet_id, season_key, victory_event_key, defeated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
      telegramId, weekKey, bossId, active.pet_id, active.season_key, eventKey, defeatedAtIso,
    ).run();
    return awardStoredWeeklyBossVictoryCrest(db, telegramId, weekKey, bossId, defeatedAtIso);
  } catch (error) {
    return { accepted: false, non_fatal: true, reason: 'weekly_crest_unavailable' };
  }
}

async function processPetWeeklyBoss(db, telegramId, actionRaw, eventKeyRaw = '') {
  const action = ['strike', 'outsmart', 'endure'].includes(String(actionRaw || '').trim().toLowerCase()) ? String(actionRaw).trim().toLowerCase() : null;
  const now = new Date();
  const weekKey = getPetWeekKey(now);
  const dayKey = getPetDayKey(now);
  const boss = getPetWeeklyBoss(weekKey);
  const [pet, identity, existing, victoriousPet] = await Promise.all([
    getPetProfileWithAtomicDecay(db, telegramId, now),
    getMoonpetIdentityWithLifecycle(db, telegramId),
    db.prepare(`SELECT event_id, action, damage FROM telegram_pet_weekly_boss_events WHERE telegram_id = ? AND week_key = ? AND day_key = ?`)
      .bind(telegramId, weekKey, dayKey).first().catch(() => null),
    findActivePetSlot(db, telegramId),
  ]);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', boss, week_key: weekKey };
  const progressBefore = await db.prepare(`SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?`)
    .bind(telegramId, weekKey).first().catch(() => null);
  if (!action) return { accepted: true, preview: true, boss, progress: progressBefore, week_key: weekKey, energy_cost: 12, pet };
  if (getPetLevel(pet.pet_xp) < 5) return { accepted: false, reason: 'boss_level_locked', required_level: 5, boss, progress: progressBefore };
  if (progressBefore?.defeated_at) {
    const reward = progressBefore.reward_claimed_at
      ? null
      : await settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progressBefore);
    await awardStoredWeeklyBossVictoryCrest(db, telegramId, weekKey, boss.boss_id, now);
    return { accepted: true, duplicate: true, reason: 'boss_already_defeated', boss, progress: progressBefore, reward, week_key: weekKey, pet };
  }
  if (existing) {
    const progress = progressBefore || await db.prepare(`SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?`).bind(telegramId, weekKey).first();
    const reward = await settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progress);
    return { accepted: true, duplicate: true, reason: 'daily_attempt_used', boss, progress, reward, week_key: weekKey, pet };
  }
  if (Number(pet.energy || 0) < 12) return { accepted: false, reason: 'pet_tired', boss, progress: progressBefore };
  const random = new Uint8Array(1);
  crypto.getRandomValues(random);
  const damage = calculatePetWeeklyBossDamage({
    action, boss, level: getPetLevel(pet.pet_xp), evolution_stage: identity?.current_stage?.stage,
    personality_ids: (identity?.personalities || []).map((trait) => trait.trait_id), health: pet.health, energy: pet.energy, roll: random[0] % 13,
  });
  const eventId = crypto.randomUUID();
  const eventKey = String(eventKeyRaw || `pet:weekly_boss:${telegramId}:${weekKey}:${dayKey}`).slice(0, 180);
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_weekly_boss_events
      (event_id, telegram_id, week_key, day_key, boss_id, event_key, action, damage)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
        (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ? AND energy >= 12)`)
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
    await recordWeeklyBossVictoryCrest(db, telegramId, weekKey, boss.boss_id, `${weekKey}:${boss.boss_id}`, progress.defeated_at || now, victoriousPet);
  }
  await mirrorPetProfileToActiveInstance(db, telegramId);
  return { accepted: true, duplicate: false, reason: newlyDefeated ? 'boss_defeated' : 'boss_damaged', boss, progress, damage, action, reward, week_key: weekKey, pet: await getPetProfile(db, telegramId) };
}

async function getPetSeasonRewardState(db, telegramId) {
  const season = getPetSeasonInfo(new Date());
  const [state, claims, identity] = await Promise.all([
    db.prepare(`SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id = ? AND season_key = ?`).bind(telegramId, season.key).first().catch(() => null),
    db.prepare(`SELECT tier_id, claimed_at FROM telegram_pet_season_reward_claims WHERE telegram_id = ? AND season_key = ?`).bind(telegramId, season.key).all().catch(() => ({ results: [] })),
    getMoonpetIdentityWithLifecycle(db, telegramId),
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
  const identity = pet ? await getMoonpetIdentityWithLifecycle(db, telegramId) : null;
  const reaction = pet ? await selectMoonpetReaction(db, telegramId, 'status', identity || {}, { pet }).catch(() => buildMoonpetReaction('status', identity || {}, { pet })) : null;
  await sendTelegramPetReply(tok, chatId, formatPetStatus(pet, identity, activity, reaction), { reply_markup: petReplyMarkup() }, 'how_to_play', { db, telegram_id: telegramId, pet });
}

async function cmdPetDetails(db, tok, chatId, telegramId) {
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const missions = pet ? await buildPetMissions(db, telegramId).catch(() => null) : null;
  const activity = pet ? await getActivePetActivitySession(db, telegramId).catch(() => null) : null;
  const identity = pet ? await getMoonpetIdentityWithLifecycle(db, telegramId) : null;
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
  if (!identity) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const next = Object.values(MOONPET_EVOLUTIONS).find((entry) => entry.stage === Number(identity.current_stage?.stage || 0) + 1);
  const requested = String(evolutionIdRaw || next?.evolution_id || '').trim().toLowerCase();
  if (!next) {
    await sendTelegramMessage(tok, chatId, `<b>🧬 Legendary Moon Guardian</b>\nFinal evolution reached.\n${escapeHtml(getPetEvolutionPerk(5).perk)}`, { reply_markup: buildPetProgressMenuReplyMarkup() });
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
  if (!result.duplicate) await syncMoonpetLifecycleStage(db, telegramId, next.stage);
  await finalizeActivePetEvolutionProgress(db, telegramId);
  await mirrorPetProfileToActiveInstance(db, telegramId);
  const updated = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const category = PET_KAIJU_CATEGORIES.find((entry) => entry.key === match?.category_key) || null;
  return [
    `🦖 <b>Kaiju Sticker Battle</b>`,
    `Table: <code>${escapeHtml(match.match_id)}</code>`,
    '',
    `Host: <code>${escapeHtml(match.player1_telegram_id)}</code>`,
    `Mode: ${match.mode === 'group' ? 'Group 2-player' : 'Player vs App'}`,
    category ? `Active category: <b>${escapeHtml(category.name)} [${escapeHtml(category.label)}]</b>` : `Active category: arming`,
    '',
    `Pick the card with the highest active-category stat. The rival card stays sealed until resolution.`,
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
      `🦖 <b>Kaiju Sticker Battle: Player vs App</b>\nChoose the strongest card for the active category.\n\n${formatPetKaijuCardList(match)}`,
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
    const [pet, identity] = await Promise.all([getPetProfile(db, telegramId), getMoonpetIdentityWithLifecycle(db, telegramId)]);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
  const reaction = await selectMoonpetReaction(db, telegramId, 'daily', identity || {}, { pet: result.pet }).catch(() => buildMoonpetReaction('daily', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `Daily chest opened: +${result.pet_xp_awarded || 0} pet XP.\n<i>${escapeHtml(reaction)}</i>\n\n${formatPetStatus(result.pet, identity, null, null)}`, { reply_markup: petReplyMarkup() }, 'daily', { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetEvent(db, tok, chatId, telegramId, argStr, eventKey = null) {
  const choice = normalizePetRandomEventChoice(argStr);
  if (!choice || (!eventKey && choice !== 'open' && choice !== 'sell' && choice !== 'ignore')) {
    const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const [identity, pet] = await Promise.all([getMoonpetIdentityWithLifecycle(db, telegramId), getPetProfile(db, telegramId).catch(() => null)]);
  const reaction = await selectMoonpetReaction(db, telegramId, 'activity_start', identity || {}, { pet, activity_label: result.session.activity_type }).catch(() => buildMoonpetReaction('activity_start', identity || {}, { pet }));
  await sendTelegramMessage(tok, chatId, `Started ${escapeHtml(result.session.activity_type)}. Tiny rewards unlock after 5m; rewards scale until the cap.\n\n<i>${escapeHtml(reaction)}</i>`, { reply_markup: { inline_keyboard: [[{ text: 'Claim', callback_data: 'pet:claim' }, { text: 'Cancel', callback_data: 'pet:cancel' }], [{ text: '⬅️ Back', callback_data: 'pet:back' }]] } });
}
async function cmdPetClaim(db, tok, chatId, telegramId) {
  const result = await claimPetActivitySession(db, telegramId, { source: 'telegram_command' }).catch((error) => ({ accepted: false, reason: error?.message || 'activity_claim_failed' }));
  if (!result.accepted) { await sendTelegramMessage(tok, chatId, result.reason === 'activity_too_short' ? `Claim ready in ${formatPetDuration(result.retry_after_seconds)}.` : formatPetBlockedCopy('activity claim', result.reason, result)); return; }
  const runtimeAction = result.session.activity_type === 'train' ? 'timed_train' : result.session.activity_type === 'work' ? 'timed_work' : result.session.activity_type;
  await applyPetRuntimeCommandAward(db, telegramId, `runtime:activity:${result.session.id}`, runtimeAction);
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
  const reaction = await selectMoonpetReaction(db, telegramId, 'activity_claim', identity || {}, { pet: result.pet, activity_label: result.session.activity_type }).catch(() => buildMoonpetReaction('activity_claim', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `Claimed ${escapeHtml(result.session.activity_type)} rewards: +${result.pet_xp_awarded} pet XP, +${result.xp_awarded} Community XP, +${result.computed?.rewards?.moon_gold || 0} gold, +${result.computed?.rewards?.moon_crystals || 0} crystals.\n<i>${escapeHtml(reaction)}</i>\n\n${formatPetStatus(result.pet, identity, null, null)}`, { reply_markup: petReplyMarkup() }, result.session.activity_type, { db, telegram_id: telegramId, pet: result.pet });
}
async function cmdPetCancel(db, tok, chatId, telegramId) {
  const result = await cancelPetActivitySession(db, telegramId).catch((error) => ({ accepted: false, reason: error?.message || 'activity_cancel_failed' }));
  let copy = formatPetBlockedCopy('activity cancel', result.reason, result);
  if (result.accepted) {
    const [identity, pet] = await Promise.all([getMoonpetIdentityWithLifecycle(db, telegramId), getPetProfile(db, telegramId).catch(() => null)]);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
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
    SELECT s.telegram_id, s.season_xp, p.pet_name, COALESCE(
             (SELECT pe.evolution_id FROM telegram_pet_evolutions_by_pet pe
               WHERE pe.pet_id = (SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id = s.telegram_id)
               ORDER BY pe.stage DESC LIMIT 1),
             (SELECT pe.evolution_id FROM telegram_pet_evolutions pe WHERE pe.telegram_id=s.telegram_id ORDER BY pe.stage DESC LIMIT 1),
             'moon_egg'
           ) AS stage, p.level,
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

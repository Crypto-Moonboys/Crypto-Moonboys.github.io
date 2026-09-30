Y��x-���jם��i��+��j[h��ܢ���m��}���o+^����םimport { getPracticeBoard, processPracticeAction } from './pets/practice-progression.js';
import { getStyleLoadout, equipPetStyle } from './pets/style-loadout.js';
import { RELIC_ROUTE_DETAILS } from './pets/relic-passives.js';
import { requirePetFirstReadResult, requirePetReadResult } from './pets/read-result.js';
import { readCommunityLeaderboard } from './community-leaderboard.js';
import { selectCommunitySeason, communitySeasonSql } from './community-season-authority.js';
import { getCombatEligibility, PET_ARENA_MIN_LEVEL as COMBAT_ARENA_MIN_LEVEL, PET_WEEKLY_BOSS_MIN_LEVEL } from './pets/combat-eligibility.js';
import { readDailyCompletion, claimDailyCompletion, getSeasonFinales, processSeasonFinale } from './pets/completion-features.js';
import { PET_STATE_RECOVERY_LIMITS, boundedRecoveryLimit, claimPetRecoveryBatch } from './pets/recovery-limits.js';
import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP, GEMS_MAX, GEMS_MIN, TELEGRAM_AUTH_MAX_AGE, XP_MAX, XP_MIN } from './blocktopia/config.js';
import { verifyTelegramIdentityFromBody } from './blocktopia/auth.js';
import { getOrCreateBlockTopiaProgression, hasBlockTopiaFactionColumns } from './blocktopia/db.js';
import { handleBlockTopiaProgressionRoute } from './blocktopia/routes.js';
import { buildDailyLoopState, handleDailyLoopStateRoute } from './routes/daily-loop-state.js';
import { handleRogueliteDailyRoutes } from './routes/daily-digest.js';
import { handleRadioStream } from './routes/radio-stream.js';
import { getContractBoard, processContractAction } from './pets/continuing-contracts.js';
import { recoverPetJourneyAwards } from './pets/journey-recovery.js';
import { recoverPetWeeklyBossVictories } from './pets/weekly-boss-recovery.js';
import { PET_EQUIPMENT_UTILITY, getPetEquipmentMultiplier, withPetEquipmentProgression, recoverPetEquipmentRows, snapshotPetEquipmentProgression, PET_EQUIPMENT_SNAPSHOT_MATCH_SQL } from './pets/equipment-progression.js';
import { recoverPetRuntimeAwards, standardStepRuntimeKey } from './pets/runtime-recovery.js';
import { petCareDeltaStatements, petCareCommunityStatements } from './pets/care-writes.js';
import { chooseDailyRunTactic, dailyTacticalBoard, previewDailyChoice, readDailyModifiers } from './pets/daily-run-tactics.js';
import { handleWaxBridgeRoute } from './routes/wax/index.js';
import { applyPetRuntimeAward, getPetRuntimeSourceDropRoll, getPetRuntimeMaterialSources, buildPetGearSummary, buildPetProgressSummary, getOrCreatePetRuntimeState } from './pets/runtime-phase-5a.js';
import {
  createDailyMoonRun, extractDailyMoonRun, getDailyMoonRunReservation, getDailyMoonRunSummary, processDailyMoonRunStep, recoverDailyMoonRunEndings,
  DAILY_JOURNEY_REQUIRED_OBJECTIVES, PET_DAILY_CHALLENGES, recordDailyCareChallenge, syncDailyMoonRun,
} from './pets/daily-moon-run.js';
import {
  PET_WEEKLY_JOURNEY_OBJECTIVES, WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, finalizeWeeklyJourneyCrest, recordWeeklyJourneyObjectiveEvidence, readWeeklyJourneyObjectiveProgress,
} from './pets/weekly-journey.js';
import {
  MOONPET_EVOLUTIONS, MOONPET_PERSONALITY_TRAITS, evolveMoonpet, formatMoonpetIdentitySummary,
  evaluateMoonpetEvolutionRequirements, getMoonpetIdentityAnalytics, getMoonpetIdentitySummary, recordMoonpetBehaviour, recordMoonpetBiggestReward, recordMoonpetMemory,
  readActivePetIdentityScope, validateMoonpetEvolutionContent,
} from './pets/moonpet-identity.js';
import {
  MOONPET_SPECIES, createMoonEggLifecycle, ensureMoonpetLifecycle, getExistingMoonpetLifecycle, getMoonpetLifecycle, hatchMoonpet, incubateMoonEgg, morphMoonpetRare,
  MOONPET_IDENTITY_REVEAL_STAGE, MOONPET_UNKNOWN_NAME, resolveMoonpetDisplayName, syncMoonpetLifecycleStage,
} from './pets/species-lifecycle.js';
import {
  PET_JOB_COOLDOWN_SECONDS, PET_ADVENTURE_COOLDOWN_SECONDS,
  PET_ROGUELITE_BOSSES, PET_ROGUELITE_ENEMIES, PET_ROGUELITE_REGIONS, PET_ROGUELITE_RELICS, PET_ROGUELITE_ROOMS, PET_RUN_MODIFIERS,
  advancePetRun, awardPetReward as awardLegacyPetReward, buildPetProfileDeltas, choosePetRunModifier, completePetRun, createPetRunRoom,
  extractPetRogueliteRun, failPetRun, finishPetRogueliteRun, generatePetRunRoom, persistPetRunRoomOutcome,
  resolvePetRunRoom, rewardPetRogueliteBoss, rewardPetRunRoom, startPetRogueliteRun,
  validatePetRelicContent, validatePetRogueliteContent, validatePetRunModifier,
} from './pets/roguelite-foundation.js';
import { reconcileLegacyPetInventory } from './pets/inventory-cutover.js';
import { awardPetGrowthMark, awardPetWeeklyCrest, evaluatePetSeasonCompletion, getPetSeasonWeek, reconcileEvolutionGrowthMarks } from './pets/season-completion.js';
import { getMoonpetSeasonInfo } from './pets/season-authority.js';
import { readPetLeaderboard, readPetActivity } from './pets/leaderboard.js';
import { listSanctuaryPets, PET_RECOVERABLE_ACTIVITY_PREDICATE, reconcileCompletedPetsToSanctuary } from './pets/sanctuary.js';
import {
  PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY,
  PET_INSTANCE_AUTHORITY_VERSION,
  accountWalletRecoveryResolvedSql,
  ensurePetAccountWalletReadyForMutation,
  reconcilePetInstanceWalletToProfile,
} from './pets/wallet-reconciliation.js';
import {
  PET_ACHIEVEMENTS, PET_SEASON_REWARD_TIERS, buildMoonpetReaction, calculatePetWeeklyBossDamage,
  getPetEvolutionPerk, getPetSeasonRewardTier, getPetWeeklyBoss, previewPetWeeklyBossChoices,
  selectMoonpetReaction,
} from './pets/player-expansion.js';
import {
  buildPetGuidanceCandidates, choosePetNextAction, mergePetGuidanceReplyMarkup,
} from './pets/player-guidance.js';
import {
  PET_ECONOMY_ROUTES, PET_EXPEDITION_TIERS, buildPetEconomyGuidanceActions, formatPetEconomyValue,
  getPetDailyBounties, getPetExpedition, getPetMarketOffers, getPetMarketCapacity, resolvePetExpeditionReward,
} from './pets/economy-expansion.js';
import { PET_CRAFTING_MATERIALS, PET_CRAFTING_RECIPES, getActivePetSetBonuses } from './pets/economy-phase-3.js';
import { PET_ELITE_JOBS, canStartPetEliteJob } from './pets/content-phase-4.js';
import { PET_JOB_LORE, buildPetRegionDirectory } from './pets/game-content.js';
import { PET_VISIBLE_LEVEL_CURVE, getPetVisibleLevel, getPetVisibleLevelSql, getPetXpToNextVisibleLevel } from './pets/progression-phase-2.js';
import { previewEncounterChoice, previewChoiceAffordability } from './pets/choice-preview.js';
import {
  applyPetFactionBonus, buildPetLiveSystemsState, processPetCosmeticUnlock, processPetCraftRecipe, processPetDistrictMission,
  processPetEquipmentUpgrade, processPetEventChain, processPetSeasonalBoss, claimPetSeasonalBossReward, recoverPetLiveSystemEndings,
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
const PET_SPECIAL_ACTION_POLICIES = Object.freeze({
  energy_drink: Object.freeze({ cooldown_seconds: 600, daily_limit: 3 }),
  dance: Object.freeze({ cooldown_seconds: 300, daily_limit: 5 }),
  cuddles: Object.freeze({ cooldown_seconds: 300, daily_limit: 5 }),
});
const PET_SPECIAL_STAT_ONLY_ACTIONS = new Set(['energy_drink', 'dance', 'cuddles']);
const PET_CARE_BEHAVIOUR_ACTIONS = new Set(['feed', 'play', 'clean', 'sleep', 'energy_drink', 'dance', 'cuddles']);
const PET_DAILY_CHALLENGE_ACTIONS = new Set(['feed', 'play', 'clean', 'sleep']);
const PET_REPEAT_REWARD_RULES = Object.freeze({
  event: Object.freeze({ full_rewarded: 6, reduced_rewarded: 10, reduced_multiplier: 0.5 }),
  kaiju: Object.freeze({ full_rewarded: 5, reduced_rewarded: 10, reduced_multiplier: 0.5 }),
});
const PET_TRADE_MIN_GOLD = 10;
const PET_TRADE_MAX_GOLD = 250;
const PET_TRADE_COOLDOWN_SECONDS = 300;
const PET_NOTIFICATION_COOLDOWN_MINUTES = 180;
const PET_NOTIFICATION_BATCH_LIMIT = 35;
const PET_KAIJU_MATCH_TTL_MINUTES = 20;
const PET_KAIJU_QUEUE_LIMIT = 12;
const PET_ARENA_MIN_LEVEL = COMBAT_ARENA_MIN_LEVEL;
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function escapeSqlLikePattern(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
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

function readTelegramAuthEvidenceFromAuthorization(request) {
  const authorization = String(request?.headers?.get?.('Authorization') || '').trim();
  const match = authorization.match(/^(?:Bearer|Telegram)\s+(.+)$/i);
  return match ? match[1].trim() : '';
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
  const season = await selectCommunitySeason(db);
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

async function resolveMoonpetAuditIdentityScope(db, telegramId, request = {}) {
  const petId = String(request.pet_id || '').trim();
  const seasonKey = String(request.season_key || '').trim();
  if (Boolean(petId) !== Boolean(seasonKey)) return null;
  if (!petId) {
    const active = await db.prepare(`
      SELECT s.pet_id, s.telegram_id, s.season_key
      FROM telegram_pet_active_slots a
      JOIN telegram_pet_season_slots s
        ON s.pet_id = a.pet_id AND s.telegram_id = a.telegram_id AND s.season_key = a.season_key
      JOIN telegram_pet_instances i
        ON i.pet_id = s.pet_id
       AND i.telegram_id = s.telegram_id
       AND i.season_key = s.season_key
       AND i.slot_number = s.slot_number
      WHERE a.telegram_id = ?
        AND s.status = 'active'
        AND i.status = 'active'
      LIMIT 1
    `).bind(telegramId).first();
    return active ? { pet_id: active.pet_id, telegram_id: telegramId, season_key: active.season_key } : null;
  }
  const row = await firstMoonpetAuditRow(db.prepare(`
    SELECT s.pet_id, s.telegram_id, s.season_key
    FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i
      ON i.pet_id = s.pet_id
     AND i.telegram_id = s.telegram_id
     AND i.season_key = s.season_key
     AND i.slot_number = s.slot_number
    WHERE s.pet_id = ?
      AND s.telegram_id = ?
      AND s.season_key = ?
      AND s.status IN ('active', 'archived')
      AND i.status IN ('active', 'archived')
    LIMIT 1
  `).bind(petId, telegramId, seasonKey).first());
  return row?.pet_id ? { pet_id: row.pet_id, telegram_id: row.telegram_id, season_key: row.season_key } : null;
}

async function allMoonpetAuditRows(statementPromise) {
  const rows = await statementPromise;
  if (rows?.success === false) throw new Error('identity_authority_audit_query_failed');
  if (!rows || !Array.isArray(rows.results)) throw new Error('identity_authority_audit_query_failed');
  return rows.results;
}

async function firstMoonpetAuditRow(statementPromise) {
  const row = await statementPromise;
  if (row?.success === false) throw new Error('identity_authority_audit_query_failed');
  return row || null;
}

function redactMoonpetInvalidAuthorityRow(row) {
  return {
    table_name: String(row?.table_name || ''),
    row_key: row?.row_key == null ? null : String(row.row_key),
    reason: String(row?.reason || 'invalid_authority'),
  };
}

async function buildMoonpetIdentityAuthorityAudit(db, telegramId, request = {}) {
  const scope = await resolveMoonpetAuditIdentityScope(db, telegramId, request);
  if (!scope) return null;
  const bindAuthority = (sql) => db.prepare(sql).bind(scope.pet_id, scope.telegram_id, scope.season_key);
  const memories = await firstMoonpetAuditRow(bindAuthority(`
    SELECT COUNT(*) AS count
    FROM telegram_pet_memories
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
  `).first());
  const personalityTraits = await allMoonpetAuditRows(bindAuthority(`
    SELECT trait_id, progress, unlocked_at, updated_at
    FROM telegram_pet_personality_traits
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
    ORDER BY trait_id
    LIMIT 100
  `).all());
  const achievements = await allMoonpetAuditRows(bindAuthority(`
    SELECT achievement_id, progress, target, unlocked_at, updated_at
    FROM telegram_pet_achievements
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
    ORDER BY achievement_id
    LIMIT 100
  `).all());
  const bossVictories = await allMoonpetAuditRows(bindAuthority(`
    SELECT boss_id, victories, updated_at
    FROM telegram_pet_boss_victories
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
    ORDER BY boss_id
    LIMIT 100
  `).all());
  const identityEvents = await allMoonpetAuditRows(bindAuthority(`
    SELECT event_id, event_key, event_kind, day_key, progress_delta, created_at, applied_at
    FROM telegram_pet_identity_events
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
    ORDER BY created_at DESC, event_id DESC
    LIMIT 100
  `).all());
  const identityAnalytics = await allMoonpetAuditRows(bindAuthority(`
    SELECT analytics_id, event_type, evolution_id, trait_id, milestone_id, duration_seconds, created_at
    FROM telegram_pet_identity_analytics
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
    ORDER BY created_at DESC, analytics_id DESC
    LIMIT 100
  `).all());
  const invalidAuthorityRows = await allMoonpetAuditRows(db.prepare(`
    SELECT table_name, pet_id, telegram_id, season_key, row_key, reason
    FROM moonpet_invalid_identity_authority_rows
    WHERE pet_id = ?
    ORDER BY table_name, row_key
    LIMIT 100
  `).bind(scope.pet_id).all());
  const safeInvalidAuthorityRows = invalidAuthorityRows.map(redactMoonpetInvalidAuthorityRow);
  return {
    pet_id: scope.pet_id,
    telegram_id: scope.telegram_id,
    season_key: scope.season_key,
    memories_count: Number(memories?.count || 0),
    personality_traits: personalityTraits,
    achievements,
    boss_victories: bossVictories,
    identity_events: identityEvents,
    identity_analytics: identityAnalytics,
    orphans: safeInvalidAuthorityRows,
    invalid_authority_rows: safeInvalidAuthorityRows,
  };
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
  energy_drink: { pet_xp: 0, community_xp: 0, hunger: 0, happiness: 0, cleanliness: 0, energy: 28, gold: 0, crystals: 0, style_tokens: 0 },
  dance: { pet_xp: 0, community_xp: 0, hunger: 0, happiness: 18, cleanliness: 0, energy: 0, gold: 0, crystals: 0, style_tokens: 0 },
  cuddles: { pet_xp: 0, community_xp: 0, hunger: 0, happiness: 8, cleanliness: 0, energy: 0, gold: 0, crystals: 0, style_tokens: 0 },
});

const PET_INVENTORY_ITEMS = Object.freeze({
  moon_snack: {
    key: 'moon_snack',
    title: 'Moon Snack',
    kind: 'usable_item',
    description: 'Use: reduce hunger by 18, restore 8 energy and gain up to 4 Pet XP. Stat limits and the daily XP cap apply.',
  },
  energy_drink: {
    key: 'energy_drink',
    title: 'Energy Drink',
    kind: 'usable_item',
    description: 'Use: restore 22 energy and gain up to 6 Pet XP. Stat limits and the daily XP cap apply. This consumes a bag item; the Care button is separate.',
  },
  clean_wipe: {
    key: 'clean_wipe',
    title: 'Clean Wipe',
    kind: 'usable_item',
    description: 'Use: restore 24 cleanliness and 4 happiness, plus up to 4 Pet XP. Stat limits and the daily XP cap apply.',
  },
  lucky_charm: {
    key: 'lucky_charm',
    title: 'Lucky Charm',
    kind: 'usable_item',
    description: 'Use now for up to 8 Pet XP, or keep it for an automatic risk/reward bonus in a standard Moon Run. A run room consumes the charm; using it here does not apply a future buff.',
  },
  style_patch: {
    key: 'style_patch',
    title: 'Style Patch',
    kind: 'usable_item',
    description: 'Use: add 2 Style Tokens and up to 5 Pet XP, subject to wallet and daily XP caps. This is a consumable, not equipped clothing.',
  },
  adventure_map: {
    key: 'adventure_map',
    title: 'Adventure Map',
    kind: 'usable_item',
    description: 'Use now for 6 energy and up to 5 Pet XP, or keep it in the bag for gold and sneak-risk bonuses in a standard Moon Run. Stat limits and the daily XP cap apply.',
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
    description: 'Feed, Play, Clean, Sleep and Train add +2 pet XP.',
    cost: { moon_gold: 60, moon_crystals: 0, style_tokens: 6 },
    min_level: 2,
  },
  moon_armor: {
    key: 'moon_armor',
    slot: 'outfit',
    title: 'Moon Armor',
    description: 'Feed, Play, Clean, Sleep and Train add +5 pet XP and +1 gold.',
    cost: { moon_gold: 180, moon_crystals: 8, style_tokens: 12 },
    min_level: 8,
  },
  crystal_bowl: {
    key: 'crystal_bowl',
    slot: 'food',
    title: 'Crystal Bowl',
    description: 'Feed restores more hunger and energy and adds +18 pet XP.',
    cost: { moon_gold: 360, moon_crystals: 18, style_tokens: 0 },
    min_level: 12,
  },
  hoverboard: {
    key: 'hoverboard',
    slot: 'toy',
    title: 'Moon Hoverboard',
    description: 'Play gives more happiness, XP and gold. Standard Runs gain extra gold and safer Sneak choices.',
    cost: { moon_gold: 240, moon_crystals: 10, style_tokens: 4 },
    min_level: 7,
  },
  crown_jacket: {
    key: 'crown_jacket',
    slot: 'outfit',
    title: 'Crown Jacket',
    description: 'Feed, Play, Clean, Sleep and Train add +8 pet XP, +2 gold and +1 style.',
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
  const petId = String(row.pet_id || '').trim();
  return {
    claimed: true,
    resumed: true,
    reservation_id: row.id,
    pet_id: petId || null,
    claimed_slot: claimedSlot,
    multiplier: getPetRepeatRewardMultiplier(mode, claimedSlot),
    energy_paid: Math.max(0, Math.floor(Number(match[2]) || 0)),
    day_key: dayKey,
    week_key: weekKey,
    season_key: seasonKey,
  };
}

async function cancelLegacyPendingRepeatRewardReservation(db, details) {
  const reservation = details?.reservation || {};
  const reservationId = String(reservation.reservation_id || '').trim();
  const telegramId = String(details?.telegram_id || '').trim();
  const eventKey = String(details?.event_key || '').trim();
  const dayKey = String(reservation.day_key || '').trim();
  const mode = String(details?.mode || '').trim().toLowerCase();
  if (!reservationId || !telegramId || !eventKey || !dayKey || !mode || String(reservation.pet_id || '').trim()) {
    return { cancelled: false, released: false };
  }
  const results = await db.batch([
    db.prepare(`
      UPDATE telegram_pet_events
      SET status = 'cancelled', reason = 'legacy_repeat_reward_missing_pet_authority'
      WHERE id = ? AND telegram_id = ? AND event_key = ? AND status = 'pending'
        AND (pet_id IS NULL OR pet_id = '')
      RETURNING id
    `).bind(reservationId, telegramId, eventKey),
    db.prepare(`
      UPDATE telegram_pet_repeat_reward_slots
      SET claimed_count = MAX(0, claimed_count - 1), updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND day_key = ? AND mode = ?
        AND EXISTS (
          SELECT 1 FROM telegram_pet_events
          WHERE id = ? AND status = 'cancelled' AND reason = 'legacy_repeat_reward_missing_pet_authority'
        )
      RETURNING claimed_count
    `).bind(telegramId, dayKey, mode, reservationId),
  ]);
  return {
    cancelled: Boolean(results?.[0]?.results?.[0]),
    released: Boolean(results?.[1]?.results?.[0]),
  };
}

async function reservePetRepeatRewardEvent(db, details) {
  const normalizedMode = String(details.mode || '').trim().toLowerCase();
  if (!PET_REPEAT_REWARD_RULES[normalizedMode]) throw new Error('invalid_pet_repeat_reward_mode');
  const telegramId = String(details.telegram_id);
  const eventKey = String(details.event_key);
  const existing = details.existing_event || await db.prepare(`
    SELECT id, pet_id, status, reason, day_key, week_key, season_key
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?
  `).bind(telegramId, eventKey).first();
  if (existing) return parsePetRepeatRewardReservation(existing, normalizedMode);

  const reservationId = crypto.randomUUID();
  const petId = String(details.pet_id || '').trim();
  const seasonKey = String(details.season_key || '').trim();
  if (normalizedMode === 'event' && (!petId || !seasonKey)) throw new Error('pet_repeat_reward_authority_required');
  const energyCost = normalizedMode === 'kaiju' ? Math.max(0, Math.floor(Number(details.energy_cost || 0))) : 0;
  const sourceSettlement = normalizedMode === 'kaiju' && details.source_pet_settlement === true && Boolean(petId && seasonKey);
  const metadata = JSON.stringify({ source: details.source || 'telegram_bot', mode: normalizedMode, equipment_snapshot: details.equipment_snapshot || {} });
  const insert = sourceSettlement
    ? db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
        (id,pet_id,telegram_id,event_type,event_key,xp_awarded,pet_xp_awarded,season_key,day_key,week_key,status,reason,metadata)
      SELECT ?,?,?,?,?,0,0,?,?,?,'pending','repeat_reward_pending',?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=? AND energy>=?)`)
      .bind(reservationId,petId,telegramId,String(details.event_type),eventKey,seasonKey,String(details.day_key),String(details.week_key),metadata,
        petId,telegramId,seasonKey,energyCost)
    : normalizedMode === 'kaiju'
    ? db.prepare(`
        INSERT OR IGNORE INTO telegram_pet_events
          (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
        SELECT ?, NULLIF(?, ''), ?, ?, ?, 0, 0, ?, ?, ?, 'pending', 'repeat_reward_pending', ?
        WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ? AND energy >= ?)
          ${petId ? `AND EXISTS (SELECT 1 FROM telegram_pet_active_slots a JOIN telegram_pet_instances p
            ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key
            WHERE a.telegram_id=? AND a.pet_id=? AND a.season_key=? AND p.energy>=?)` : ''}
      `).bind(
        reservationId, petId, telegramId, String(details.event_type), eventKey, seasonKey,
        String(details.day_key), String(details.week_key), metadata, telegramId, energyCost,
        ...(petId ? [telegramId, petId, seasonKey, energyCost] : []),
      )
    : db.prepare(`
        INSERT OR IGNORE INTO telegram_pet_events
          (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
        VALUES (?, NULLIF(?, ''), ?, ?, ?, 0, 0, ?, ?, ?, 'pending', 'repeat_reward_pending', ?)
      `).bind(
        reservationId, petId, telegramId, String(details.event_type), eventKey, seasonKey,
        String(details.day_key), String(details.week_key), metadata,
      );
  const statements = [insert];
  if (sourceSettlement) {
    statements.push(db.prepare(`UPDATE telegram_pet_instances SET energy=energy-?,source_profile_updated_at=?,updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND energy>=?
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id=? AND status='pending')`)
      .bind(energyCost,PET_INSTANCE_AUTHORITY_VERSION,petId,telegramId,seasonKey,energyCost,reservationId));
    statements.push(db.prepare(`UPDATE telegram_pet_profiles SET energy=(SELECT energy FROM telegram_pet_instances WHERE pet_id=?),updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_active_slots WHERE telegram_id=? AND pet_id=? AND season_key=?)
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id=? AND status='pending')`)
      .bind(petId,telegramId,telegramId,petId,seasonKey,reservationId));
  } else if (normalizedMode === 'kaiju') {
    statements.push(db.prepare(`
      UPDATE telegram_pet_profiles
      SET energy = energy - ?, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND energy >= ?
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
    `).bind(energyCost, telegramId, energyCost, reservationId));
    if (petId) statements.push(db.prepare(`UPDATE telegram_pet_instances
      SET energy=energy-?, source_profile_updated_at=?, updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND telegram_id=? AND season_key=?
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id=? AND status='pending')`)
      .bind(energyCost, PET_INSTANCE_AUTHORITY_VERSION, petId, telegramId, seasonKey, reservationId));
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
      RETURNING id, pet_id, status, reason, day_key, week_key, season_key
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
    SELECT id, pet_id, status, reason, day_key, week_key, season_key
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?
  `).bind(telegramId, eventKey).first();
  if (concurrent) return parsePetRepeatRewardReservation(concurrent, normalizedMode);
  if (normalizedMode === 'kaiju') return { claimed: false, reason: 'insufficient_energy', reservation_id: null };
  throw new Error('pet_repeat_reward_reservation_failed');
}

function getPetLevel(petXp) {
  return getPetVisibleLevel(petXp);
}

function getPetEquippedItem(pet, slot) {
  const key = String(pet?.[`equipped_${slot}`] || '').trim();
  const item = PET_SHOP_ITEMS[key];
  return item && item.slot === slot ? item : null;
}

function applyPetItemActionBonuses(pet, action, rule, rewards) {
  if (PET_SPECIAL_STAT_ONLY_ACTIONS.has(String(action || ''))) return;
  const food = getPetEquippedItem(pet, 'food');
  const toy = getPetEquippedItem(pet, 'toy');
  const outfit = getPetEquippedItem(pet, 'outfit');
  const scale = (item, value) => Math.round(value * getPetEquipmentMultiplier(pet, item?.key));
  const basePetXp = Math.max(0, Math.floor(Number(rewards.pet_xp) || 0));

  if (action === 'feed' && food?.key === 'moon_kibble') {
    rule.hunger -= scale(food, 12);
    rewards.pet_xp += scale(food, 4);
  }
  if (action === 'feed' && food?.key === 'crystal_bowl') {
    rule.hunger -= scale(food, 32);
    rule.energy += scale(food, 10);
    rewards.pet_xp += scale(food, 18);
  }
  if (action === 'feed' && food?.key === 'nebula_snack') {
    rule.hunger -= scale(food, 22);
    rule.energy += scale(food, 6);
    rewards.pet_xp += scale(food, 10);
  }
  if (action === 'play' && toy?.key === 'laser_ball') {
    rule.happiness += scale(toy, 10);
    rewards.pet_xp += scale(toy, 5);
  }
  if (action === 'play' && toy?.key === 'hoverboard') {
    rule.happiness += scale(toy, 16);
    rewards.pet_xp += scale(toy, 8);
    rewards.moon_gold += scale(toy, 2);
  }
  if (outfit?.key === 'street_hoodie') {
    rewards.pet_xp += scale(outfit, 2);
  }
  if (outfit?.key === 'moon_armor') {
    rewards.pet_xp += scale(outfit, 5);
    rewards.moon_gold += scale(outfit, 1);
  }
  if (['feed', 'play', 'clean', 'sleep', 'train'].includes(action) && outfit?.key === 'crown_jacket') {
    rewards.pet_xp += scale(outfit, 8);
    rewards.moon_gold += scale(outfit, 2);
    rewards.style_tokens += scale(outfit, 1);
  }

  const gearBonusPetXp = Math.max(0, Math.floor(Number(rewards.pet_xp) || 0) - basePetXp);
  rewards.pet_xp = basePetXp + Math.floor(gearBonusPetXp * getPetHighLevelGearXpMultiplier(pet));
}

async function getPetSpecialActionLimitState(db, telegramId, action, policy, dayKey, now = new Date()) {
  if (!policy) return null;
  // Daily limits and cooldowns are mutation authority. If D1 cannot read them,
  // do not grant another special-care use as though the history were empty.
  const row = await db.prepare(`SELECT
      SUM(CASE WHEN day_key = ? THEN 1 ELSE 0 END) AS used_today,
      MAX(created_at) AS last_created_at
    FROM telegram_pet_events
    WHERE telegram_id = ? AND event_type = ? AND status IN ('pending','accepted')`)
    .bind(dayKey, telegramId, action)
    .first();
  const usedToday = Math.max(0, Number(row?.used_today || 0));
  if (usedToday >= policy.daily_limit) {
    const cooldown = normalizePetCooldownWindow(getNextPetUtcDayResetAt(now), now);
    return {
      blocked: true,
      reason: 'daily_limit',
      used_today: usedToday,
      daily_limit: policy.daily_limit,
      cooldown,
      retry_after_seconds: cooldown.remaining_seconds,
      remaining_seconds: cooldown.remaining_seconds,
      expires_at: cooldown.expires_at,
    };
  }
  const cooldown = buildPetCooldownFromStart(row?.last_created_at, policy.cooldown_seconds, now);
  if ((cooldown?.remaining_seconds || 0) > 0) {
    return {
      blocked: true,
      reason: 'cooldown',
      used_today: usedToday,
      daily_limit: policy.daily_limit,
      cooldown,
      retry_after_seconds: cooldown.remaining_seconds,
      remaining_seconds: cooldown.remaining_seconds,
      expires_at: cooldown.expires_at,
    };
  }
  return { blocked: false, used_today: usedToday, daily_limit: policy.daily_limit };
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
  const scale = (item, value) => value * getPetEquipmentMultiplier(pet, item?.key);
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
    if (choice?.type === 'sneak') bonus.risk_delta -= scale(toy, 0.08);
    bonus.gold_bonus += scale(toy, 6);
  }
  if (outfit?.key === 'crown_jacket') {
    bonus.style_bonus += scale(outfit, choice?.type === 'boss' ? 4 : 1);
    if (choice?.type === 'boss') bonus.reward_multiplier += scale(outfit, 0.12);
  }
  if (food?.key === 'crystal_bowl') {
    if (choice?.type === 'rest') bonus.reward_multiplier += scale(food, 0.12);
    bonus.survival_bonus += scale(food, 0.06);
    bonus.risk_delta -= scale(food, 0.04);
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

function serializePetRunChoicePreview(run, choice, pet, inventory = [], wallet = null) {
  const affordability = previewChoiceAffordability([choice.costs || {}], wallet);
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
    ...affordability,
    risk_percent: riskPercent,
    risk_band: riskBand,
    reward_preview: rewards,
    cost_preview: costs,
    advantages,
    detail: [`${riskBand} RISK ${riskPercent}%`, rewards.join(' + '), costs.length ? `COST ${costs.join(' + ')}` : 'NO DIRECT COST', advantages.join(' + '), affordability.affordability_detail].filter(Boolean).join(' // '),
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
  `).bind(telegramId).first();
  return row ? serializePetRun(row) : null;
}

async function getPetRunById(db, telegramId, runId) {
  const row = await db.prepare(`
    SELECT * FROM telegram_pet_runs
    WHERE telegram_id = ? AND run_id = ?
    LIMIT 1
  `).bind(telegramId, runId).first();
  return row ? serializePetRun(row) : null;
}

// Standard controls cannot mutate a saved official/canonical room run. The
// Daily route owns its room choices, ten-room ending and settlement rules.
async function blockCanonicalPetRun(db, telegramId, run) {
  const canonical = await db.prepare(`SELECT 1 AS found WHERE
    EXISTS (SELECT 1 FROM telegram_pet_daily_runs WHERE telegram_id=? AND run_id=?)
    OR EXISTS (SELECT 1 FROM telegram_pet_run_rooms WHERE telegram_id=? AND run_id=?)`)
    .bind(telegramId, run.run_id, telegramId, run.run_id).first();
  return canonical || run.run_id.startsWith('daily:') ? {
    accepted: false, reason: 'daily_run_requires_mini_app', run,
    result_copy: 'Continue your saved Daily Run in Explore in the Moonpet Mini App.',
    xp_awarded: 0, pet_xp_awarded: 0,
  } : null;
}

async function startOrResumePetRun(db, telegramId, options = {}) {
  await recoverPetStandardRunEndings(db, telegramId).catch((error) => {
    logApiFailure('pet_standard_run_recovery_failed', { message: error?.message || String(error) });
  });
  const requestedRunId = String(options.run_id || '').trim().slice(0, 80);
  if (requestedRunId) {
    const requestedRun = await getPetRunById(db, telegramId, requestedRunId);
    if (requestedRun && ['active', 'extractable'].includes(requestedRun.status)) {
      const blocked = await blockCanonicalPetRun(db, telegramId, requestedRun);
      if (blocked) return blocked;
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
    const blocked = await blockCanonicalPetRun(db, telegramId, active);
    if (blocked) return blocked;
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
  const runtimeEventKey = options.completed ? null : `runtime:run-extract:${eventKey}`;
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
    telegram_id: telegramId, pet_id: rewardRun.pet_id, season_key: rewardRun.season_key,
    source: 'pet_run_legacy', idempotency_key: eventKey, event_key: eventKey,
    event_type: eventType, xp_action: `pet_${eventType}`, reason: options.completed ? 'run_completed' : 'run_extracted',
    rewards: { pet_xp: rewardRun.unbanked_pet_xp, community_xp: requestedCommunityXpAuthority,
      moon_gold: rewardRun.unbanked_moon_gold, moon_crystals: rewardRun.unbanked_moon_crystals,
      style_tokens: rewardRun.unbanked_style_tokens, items: bankedItemsAuthority },
    touch_streak: true, now,
    context: { source: options.source || 'telegram_command', run_id: rewardRun.run_id, depth: rewardRun.depth, max_depth: rewardRun.max_depth,
      equipment_snapshot: pet.equipment_progression || {}, ...(runtimeEventKey ? { runtime_event_key: runtimeEventKey } : {}) },
  });
  if (awardedAuthority.accepted || awardedAuthority.duplicate) {
    await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, eventKey);
  }
  if (!awardedAuthority.accepted) return { ...awardedAuthority, run: rewardRun, pet };
  const receipt = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  await recordMoonpetBehaviour(db, {
    telegram_id: telegramId, pet_id: rewardRun.pet_id, season_key: rewardRun.season_key,
    event_key: `${rewardRun.run_id}:terminal:personality`, source_event_key: eventKey, source_event_type: eventType,
    behaviour: 'exploration', activity: 'adventure', amount: 2, recover_source_event: true,
  });
  await recordMoonpetMemory(db, { telegram_id: telegramId, pet_id: rewardRun.pet_id, season_key: rewardRun.season_key,
    event_key: `${rewardRun.run_id}:terminal:memory`, source_event_key: eventKey, source_event_type: eventType,
    recover_source_event: true, memory_type: options.completed ? 'run_completed' : 'extraction',
    milestone: options.completed ? 'first_run_completed' : 'first_extraction', reward_amount: awardedAuthority.rewards?.moon_gold, reward_currency: 'moon_gold' });
  // Legacy runs have no persisted canonical boss room. Their completion may
  // record exploration and completion memories, but never boss authority.
  await reconcileSanctuaryBestEffort(db, telegramId, options.completed ? 'run_completed' : 'run_extracted');
  const savedRuntimeKey = parsePersistedPetReward(receipt?.metadata)?.context?.runtime_event_key;
  await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward,
    { run_id: rewardRun.run_id, action: options.completed ? 'run_step' : 'run_extract', event_key: '__terminal__' });
  return { ...awardedAuthority, source_event_key: receipt?.event_key,
    runtime_event_key: savedRuntimeKey === runtimeEventKey ? runtimeEventKey : null,
    accounting_window: { day_key: receipt?.day_key }, reason: awardedAuthority.duplicate ? 'duplicate' : (options.completed ? 'run_completed' : 'run_extracted'),
    run: rewardRun, banked_items: bankedItemsAuthority };
}

// Standard run steps and their banked snapshot survive a lost terminal reward
// response. Only source-backed owned runs may enter this bounded recovery queue.
async function recoverPetStandardRunEndings(db, telegramId, runIdRaw = '', limit) {
  const owner = String(telegramId || '').trim();
  if (!owner) return [];
  const runId = String(runIdRaw || '').trim();
  const recoveryKey = "r.started_at||':'||r.run_id";
  const terminalKey = "SUBSTR('pet_run_'||CASE WHEN r.status='extracted' THEN 'extract' ELSE 'complete' END||':'||r.telegram_id||':'||r.run_id,1,120)";
  const candidates = await db.prepare(`SELECT r.*,${recoveryKey} AS recovery_key,recovery_state.setting_value AS recovery_cursor FROM telegram_pet_runs r
    JOIN telegram_pet_instances i ON i.pet_id=r.pet_id AND i.telegram_id=r.telegram_id AND i.season_key=r.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    LEFT JOIN telegram_pet_recovery_cursors recovery_state ON recovery_state.telegram_id=r.telegram_id AND recovery_state.setting_key='moonpet:recovery:standard-endings'
    WHERE r.telegram_id=? AND r.depth>0 AND (?='' OR r.run_id=?)
      AND (r.status='extracted' OR r.status='completed' AND r.depth>=r.max_depth
        OR r.status IN ('active','extractable') AND r.depth>=MAX(?,r.max_depth,r.max_room))
      AND EXISTS (SELECT 1 FROM telegram_pet_run_steps step WHERE step.run_id=r.run_id AND step.telegram_id=r.telegram_id
        AND step.pet_id=r.pet_id AND step.step_index=r.depth AND step.success=1)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_daily_runs d WHERE d.run_id=r.run_id)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_run_rooms room WHERE room.run_id=r.run_id)
      AND (NOT EXISTS (SELECT 1 FROM telegram_pet_reward_claims c WHERE c.telegram_id=r.telegram_id
        AND c.source='pet_run_legacy' AND c.status='awarded' AND c.idempotency_key=${terminalKey})
        OR EXISTS (SELECT 1 FROM telegram_pet_events e WHERE e.telegram_id=r.telegram_id AND e.pet_id=r.pet_id
          AND e.season_key=r.season_key AND e.event_key=${terminalKey} AND e.status='accepted'
          AND e.event_type=CASE WHEN r.status='extracted' THEN 'run_extract' ELSE 'run_complete' END
          AND (NOT EXISTS (SELECT 1 FROM telegram_pet_identity_events identity WHERE identity.telegram_id=e.telegram_id
            AND identity.pet_id=e.pet_id AND identity.season_key=e.season_key AND identity.event_kind='personality'
            AND identity.event_key=SUBSTR(r.run_id||':terminal:personality',1,180) AND identity.applied_at IS NOT NULL)
          OR NOT EXISTS (SELECT 1 FROM telegram_pet_identity_events identity WHERE identity.telegram_id=e.telegram_id
            AND identity.pet_id=e.pet_id AND identity.season_key=e.season_key AND identity.event_kind='memory'
            AND identity.event_key=SUBSTR(r.run_id||':terminal:memory',1,180) AND identity.applied_at IS NOT NULL))))
    ORDER BY CASE WHEN ${recoveryKey}>COALESCE(recovery_state.setting_value,'') THEN 0 ELSE 1 END,
      ${recoveryKey} LIMIT ?`).bind(owner, runId, runId, PET_RUN_MAX_DEPTH, boundedRecoveryLimit(limit, 5)).all();
  if (!runId && !await claimPetRecoveryBatch(db, owner, 'standard-endings', candidates.results || [])) return [];
  const results = [];
  for (const row of candidates.results || []) {
    try {
      const run = serializePetRun(row);
      const pet = await getPetInstanceWithAtomicDecay(db, run.pet_id);
      if (!pet || pet.telegram_id !== owner || pet.season_key !== run.season_key) continue;
      const result = await recordPetRunBankedEvent(db, owner, run, pet, {
        completed: run.status !== 'extracted', source: 'standard_run_ending_recovery',
      });
      results.push({ ...result, settlement_recovered: true });
    } catch (error) {
      logApiFailure('pet_standard_run_ending_pending', { telegramId: owner, runId: row.run_id, message: error?.message || String(error) });
    }
  }
  return results;
}

async function getPetRunTerminalRewardClaim(db, telegramId, runId, completed = true) {
  const eventKey = completed ? buildStablePetEventKey(['pet_run_complete', telegramId, runId]) : buildPetRunExtractEventKey(telegramId, runId);
  return db.prepare(`
    SELECT claim_id, status, applied_rewards
    FROM telegram_pet_reward_claims
    WHERE telegram_id = ? AND source = 'pet_run_legacy' AND idempotency_key = ? AND status = 'awarded'
    LIMIT 1
  `).bind(telegramId, eventKey).first().then(requirePetFirstReadResult);
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
  return { ...banked, pet: bankedPet, choice, settlement_recovered: true, reason: banked.accepted ? (banked.duplicate ? 'duplicate' : 'run_completed') : banked.reason };
}

async function processPetRunExtract(db, telegramId, runIdRaw = '', options = {}) {
  const runId = String(runIdRaw || '').trim();
  const run = runId ? await getPetRunById(db, telegramId, runId) : await getActivePetRun(db, telegramId);
  if (!run) return { accepted: false, reason: 'run_not_found', xp_awarded: 0, pet_xp_awarded: 0 };
  const blocked = await blockCanonicalPetRun(db, telegramId, run);
  if (blocked) return blocked;
  if (run.status === 'extracted' || (run.depth >= PET_RUN_MAX_DEPTH && ['active', 'extractable', 'completed'].includes(run.status))) {
    const recovered = (await recoverPetStandardRunEndings(db, telegramId, run.run_id))[0];
    if (recovered) return recovered;
    // A saved final step can settle or retry, but can never create room 101.
    if (['active', 'extractable'].includes(run.status)) return { accepted: false, reason: 'run_closed', run, xp_awarded: 0, pet_xp_awarded: 0 };
  }
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
  const result = await processPetRunStepResult(db, telegramId, runIdRaw, choiceKeyRaw, options);
  if (result.accepted && result.run) await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward,
    { run_id: result.run.run_id, action: 'run_step', event_key: options.event_key });
  return result;
}

async function processPetRunStepResult(db, telegramId, runIdRaw, choiceKeyRaw, options = {}) {
  const runId = String(runIdRaw || '').trim();
  const run = runId ? await getPetRunById(db, telegramId, runId) : await getActivePetRun(db, telegramId);
  if (!run) return { accepted: false, reason: 'run_not_found', xp_awarded: 0, pet_xp_awarded: 0 };
  const blocked = await blockCanonicalPetRun(db, telegramId, run);
  if (blocked) return blocked;
  if (run.depth >= PET_RUN_MAX_DEPTH && ['active', 'extractable', 'completed'].includes(run.status)) {
    const recovered = (await recoverPetStandardRunEndings(db, telegramId, run.run_id))[0];
    if (recovered) return recovered;
    // A saved final step can settle or retry, but can never create room 101.
    if (['active', 'extractable'].includes(run.status)) return { accepted: false, reason: 'run_closed', run, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const stepIndex = Math.max(1, Math.floor(Number(run.depth || 0) + 1));
  const suppliedExpectedStepIndex = options.expected_step_index === undefined || options.expected_step_index === null || options.expected_step_index === ''
    ? null
    : Number(options.expected_step_index);
  const expectedStepIndex = suppliedExpectedStepIndex === null
    ? null
    : Math.max(1, Math.floor(Number.isFinite(suppliedExpectedStepIndex) ? suppliedExpectedStepIndex : 0));
  const explicitEventKey = options.event_key ? String(options.event_key).slice(0, 120) : null;
  if (explicitEventKey) {
    const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, explicitEventKey).first();
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
    const duplicate = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE telegram_id = ? AND event_key = ?`).bind(telegramId, eventKey).first();
    if (duplicate) {
      const recovered = await retryUnsettledTerminalRunStep(db, telegramId, run, duplicate, choice, options);
      if (recovered) return recovered;
      return { accepted: true, duplicate: true, reason: 'duplicate', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
    }
  }
  if (expectedStepIndex !== null && expectedStepIndex !== stepIndex) {
    return { accepted: false, reason: 'stale_run_step', run, choice, expected_step_index: expectedStepIndex, current_step_index: stepIndex, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const existingStep = await db.prepare(`SELECT * FROM telegram_pet_run_steps WHERE run_id = ? AND step_index = ?`).bind(run.run_id, stepIndex).first();
  if (existingStep) {
    const recovered = await retryUnsettledTerminalRunStep(db, telegramId, run, existingStep, choice, options);
    if (recovered) return recovered;
    return { accepted: true, duplicate: true, reason: 'step_already_resolved', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  if (!run.pet_id) return { accepted: false, reason: 'legacy_run_pet_authority_missing', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetInstanceWithAtomicDecay(db, run.pet_id);
  if (!pet || pet.telegram_id !== telegramId) return { accepted: false, reason: 'run_pet_not_found', run, choice, xp_awarded: 0, pet_xp_awarded: 0 };
  if (clampPetStat(pet.energy) <= 0) return { accepted: false, reason: 'pet_tired', run, choice, pet, xp_awarded: 0, pet_xp_awarded: 0 };
  // Reject a stale absolute write if care, rewards or equipment change this pet
  // while the choice is resolving. Guard the step reservation so costs stay atomic.
  const sourceState = PET_INSTANCE_STATE_COLUMNS.map(column => pet[column] ?? null);
  const sourceEquipment = snapshotPetEquipmentProgression(pet);
  const inventory = await getPetInventory(db, telegramId);
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
  const season = { key: run.season_key };
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
      AND EXISTS (SELECT 1 FROM telegram_pet_instances source_pet
        WHERE source_pet.pet_id=? AND source_pet.telegram_id=? AND source_pet.season_key=?
          AND ${PET_INSTANCE_STATE_COLUMNS.map(column => `source_pet.${column} IS ?`).join(' AND ')})
      AND ${PET_EQUIPMENT_SNAPSHOT_MATCH_SQL}
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
    JSON.stringify({ source: options.source || 'telegram_command', runtime_event_key: standardStepRuntimeKey(eventKey, options.source), equipment_snapshot: pet.equipment_progression || {}, risk_chance: outcome.risk_chance, costs: outcome.costs, copy: outcome.copy }),
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
    run.pet_id, telegramId, run.season_key, ...sourceState, sourceEquipment, telegramId,
  );
  const consumedItemEventId = outcome.consumed_item_key ? crypto.randomUUID() : null;
  const consumedItemStatements = outcome.consumed_item_key
    ? [db.prepare(`
      INSERT OR IGNORE INTO telegram_pet_events
        (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, 'run_item_use', ?, 0, 0, ?, ?, ?, 'accepted', 'run_item_consumed', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_run_steps WHERE id = ? AND telegram_id = ? AND run_id = ?)
    `).bind(
      consumedItemEventId,
      run.pet_id,
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
      const currentRun = await getPetRunById(db, telegramId, run.run_id);
      const stateChanged = currentRun && ['active','extractable'].includes(currentRun.status) && currentRun.depth === run.depth;
      return { accepted: false, reason: stateChanged ? 'run_state_changed' : 'run_closed', run: currentRun, choice,
        result_copy: stateChanged ? 'Your pet or run changed. Refresh and choose again.' : undefined,
        xp_awarded: 0, pet_xp_awarded: 0 };
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
    const currentRun = await getPetRunById(db, telegramId, run.run_id);
    const stateChanged = currentRun && ['active','extractable'].includes(currentRun.status) && currentRun.depth === run.depth;
    return { accepted: false, reason: stateChanged ? 'run_state_changed' : 'run_closed', run: currentRun, choice,
      result_copy: stateChanged ? 'Your pet or run changed. Refresh and choose again.' : undefined,
      xp_awarded: 0, pet_xp_awarded: 0 };
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
    return { ...banked, pet: bankedPet, choice, outcome, reason: banked.accepted ? (banked.duplicate ? 'duplicate' : 'run_completed') : banked.reason };
  }
  return { accepted: true, reason: 'run_step_complete', run: updatedRun, choice, outcome, pet: persistedPet || pet, xp_awarded: 0, pet_xp_awarded: 0 };
}

async function getPetInventory(db, telegramId) {
  await reconcileLegacyPetInventory(db, telegramId);
  const rows = await db.prepare(`
    SELECT asset_key, quantity
    FROM telegram_pet_inventory
    WHERE telegram_id = ? AND asset_type = 'item' AND quantity > 0
  `).bind(telegramId).all().then(requirePetReadResult);
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
  let pet = await getPetProfile(db, telegramId);
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
  pet = await prepareCurrentSeasonActivePetForWeeklyJourneySource(db, telegramId, now);
  if (!pet) return { accepted: false, reason: 'pet_current_season_unavailable', xp_awarded: 0, pet_xp_awarded: 0 };
  const effects = {
    moon_snack: { hunger: -18, energy: 8, pet_xp: 4 },
    energy_drink: { energy: 22, pet_xp: 6 },
    clean_wipe: { cleanliness: 24, happiness: 4, pet_xp: 4 },
    lucky_charm: { pet_xp: 8 },
    style_patch: { style_tokens: 2, pet_xp: 5 },
    adventure_map: { energy: 6, pet_xp: 5 },
  }[key];
  const petXp = Math.max(0, Math.floor(Number(effects.pet_xp || 0)));
  const walletRewards = { style_tokens: Math.max(0, Math.floor(Number(effects.style_tokens || 0))) };
  const itemHasWalletReward = hasPetAccountWalletDelta(walletRewards);
  if (itemHasWalletReward && !(await ensurePetAccountWalletReadyForMutation(db, telegramId, now))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const consumeEventId = crypto.randomUUID();
  const claimId = crypto.randomUUID();
  const rewardMetadata = JSON.stringify({
    source: options.source || 'telegram_bot',
    inventory_authority: true,
    consumed_item_key: key,
    rewards: { pet_xp: petXp, style_tokens: walletRewards.style_tokens },
    profile_deltas: { hunger: effects.hunger || 0, energy: effects.energy || 0, cleanliness: effects.cleanliness || 0, happiness: effects.happiness || 0 },
  });
  const requestedRewards = JSON.stringify({ pet_xp: petXp, community_xp: 0, moon_gold: 0, moon_crystals: 0, style_tokens: walletRewards.style_tokens, materials: {}, items: {}, relics: {} });
  const consumeResults = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
      (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, 'use_item', ?, 0,
        MIN(?,MAX(0,?-(SELECT COALESCE(SUM(pet_xp_awarded),0) FROM telegram_pet_events WHERE telegram_id=? AND day_key=? AND status='accepted'))),
        ?, ?, ?, 'pending', 'item_use_pending', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_inventory
        WHERE telegram_id = ? AND asset_type = 'item' AND asset_key = ? AND quantity > 0)
        ${itemHasWalletReward ? `AND ${accountWalletRecoveryResolvedSql('?')}` : ''}
        AND EXISTS (SELECT 1 FROM telegram_pet_instances p
          WHERE p.pet_id=? AND p.telegram_id=? AND p.season_key=? AND p.status='active')
      RETURNING id`).bind(consumeEventId, pet.pet_id || null, telegramId, eventKey, petXp, PETS_DAILY_PET_XP_CAP, telegramId, dayKey, season.key, dayKey, weekKey, rewardMetadata,
        telegramId, key, ...(itemHasWalletReward ? [telegramId] : []), pet.pet_id, telegramId, season.key),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_claims
      (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata)
      SELECT ?, ?, ?, 'pet_item_use', ?, ?, 'pending', ?, json_set(?, '$.pet_xp', pet_xp_awarded),
        json_set(?, '$.rewards.pet_xp', pet_xp_awarded) FROM telegram_pet_events WHERE id=? AND status='pending'`)
      .bind(claimId, pet.pet_id || null, telegramId, `item_use:${eventKey}`, dayKey, requestedRewards, requestedRewards, rewardMetadata, consumeEventId),
    db.prepare(`UPDATE telegram_pet_inventory
      SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND asset_type = 'item' AND asset_key = ? AND quantity > 0
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')`)
      .bind(telegramId, key, consumeEventId, claimId),
    accountWalletDeltaStatement(db, telegramId, walletRewards,
      "EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending') AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')",
      [consumeEventId, claimId]),
    ...petCareDeltaStatements(db, { eventId: consumeEventId, claimId, dayKey, previousDayKey: getPreviousPetDayKey(dayKey), now,
      deltas: effects, stages: PET_GROWTH_STAGE_THRESHOLDS }),
    db.prepare(`INSERT INTO telegram_pet_season_state
        (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, pet_xp_awarded, pet_xp_awarded, pet_xp_awarded, ?, ? FROM telegram_pet_events WHERE id=? AND status='pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET
        season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key,
        weekly_key = excluded.weekly_key,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, season.key, dayKey, weekKey, consumeEventId, claimId),
    db.prepare(`UPDATE telegram_pet_events
      SET status = 'accepted', reason = 'item_used', metadata=json_set(metadata,'$.rewards.pet_xp',pet_xp_awarded)
      WHERE id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')
        AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)
        AND (
          pet_id IS NULL OR EXISTS (
            SELECT 1 FROM telegram_pet_instances WHERE pet_id = telegram_pet_events.pet_id AND telegram_id = ?
          )
        )
      RETURNING id,pet_xp_awarded`)
      .bind(consumeEventId, claimId, telegramId, telegramId),
    db.prepare(`UPDATE telegram_pet_reward_claims
      SET status = 'awarded', awarded_at = CURRENT_TIMESTAMP
      WHERE claim_id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'accepted')
      RETURNING claim_id`)
      .bind(claimId, consumeEventId),
  ]);
  const consumed = Boolean(consumeResults?.[0]?.results?.[0] && consumeResults?.at(-2)?.results?.[0] && consumeResults?.at(-1)?.results?.[0]);
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
    const inventory = await getPetInventory(db, telegramId);
    return { accepted: false, reason: inventory.some(entry=>entry.key===key && entry.count>0) ? 'pet_action_state_changed' : 'item_not_found', pet };
  }
  const inventory = await getPetInventory(db, telegramId);
  const updatedPet = pet.pet_id ? await getPetInstanceWithAtomicDecay(db, pet.pet_id).catch(() => null) : await getPetProfile(db, telegramId);
  if (updatedPet) Object.assign(updatedPet, await readPetAccountWallet(db, telegramId) || {});
  return { accepted: true, reason: 'item_used', xp_awarded: 0, pet_xp_awarded: Number(consumeResults.at(-2).results[0].pet_xp_awarded), item: { ...item, count: inventory.find((entry) => entry.key === key)?.count || 0 }, pet: updatedPet };
}

async function processPetJob(db, telegramId, jobKeyRaw, options = {}) {
  const key = normalizePetJobKey(jobKeyRaw);
  if (!key) return { accepted: false, reason: 'invalid_job', xp_awarded: 0, pet_xp_awarded: 0 };
  const now = new Date();
  const eventKey = String(options.event_key || `pet:work:${telegramId}:${key}:${Date.now()}`).slice(0, 120);
  const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (duplicate) {
    const pet = duplicate.pet_id ? await getPetInstanceWithAtomicDecay(db, duplicate.pet_id) : null;
    if (pet) Object.assign(pet, await readPetAccountWallet(db, telegramId) || {});
    return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0, pet,
      accounting_window: { day_key: duplicate.day_key } };
  }
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
    const runtime = await getOrCreatePetRuntimeState(db, telegramId, getPetDayKey(now), activePetRewardAuthority(pet)).catch(() => null);
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
  const cooldown = await getPetAcceptedActionCooldown(db, telegramId, 'work', PET_JOB_COOLDOWN_SECONDS, now);
  if (cooldown) {
    return attachPetCooldown({ accepted: false, reason: 'cooldown', retry_after_seconds: cooldown.remaining_seconds, cooldown, pet }, cooldown);
  }
  const sourceAuthority = activePetRewardAuthority(pet);
  if (!sourceAuthority) return { accepted: false, reason: 'source_pet_authority_required', xp_awarded: 0, pet_xp_awarded: 0, pet };
  const factionRow = await db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id = ?').bind(telegramId).first();
  const adjusted = applyPetFactionBonus(job, factionRow?.faction, 'jobs');
  const setEffects = getPetActiveSetEffects(pet);
  const jobSetPct = Math.max(0, Number(setEffects.job_reward_pct) || 0);
  const scalableJobRewards = new Set(['pet_xp', 'community_xp', 'moon_gold', 'moon_crystals', 'style_tokens']);
  const rewards = Object.fromEntries(Object.entries(adjusted.rewards).map(([rewardKey, value]) => [rewardKey, scalableJobRewards.has(rewardKey) && typeof value === 'number' && value > 0 ? Math.floor(value * (100 + jobSetPct) / 100) : value]));
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_job', idempotency_key: eventKey, event_key: eventKey,
    pet_id: sourceAuthority.pet_id, season_key: sourceAuthority.season_key,
    event_type: 'work', reason: key, rewards, touch_streak: true,
    context: { source: options.source || 'telegram_bot', runtime_event_key: options.runtime_event_key || null, equipment_snapshot: pet.equipment_progression || {}, job_key: key, faction_bonus: adjusted.bonus, equipment_set_bonus: jobSetPct ? { job_reward_pct: jobSetPct } : null },
  });
  if (!awarded.accepted) {
    const cooldown = await getPetAcceptedActionCooldown(db, telegramId, 'work', PET_JOB_COOLDOWN_SECONDS);
    return cooldown
      ? attachPetCooldown({ ...awarded, reason: 'cooldown', retry_after_seconds: cooldown.remaining_seconds, cooldown }, cooldown)
      : awarded;
  }
  if (awarded.accepted) {
    await runPetIdentityWriteHook(options, { event_key: eventKey, ...sourceAuthority, event_type: 'work' });
    await syncPetAchievementsForPet(db, telegramId, sourceAuthority.pet_id, sourceAuthority.season_key).catch(() => []);
  }
  const receipt = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  // A competing request may have committed this key for another pet first.
  const receiptPet = receipt?.pet_id ? await getPetInstanceWithAtomicDecay(db, receipt.pet_id) : null;
  if (receiptPet) Object.assign(receiptPet, await readPetAccountWallet(db, telegramId) || {});
  return { ...awarded, pet: receiptPet, accounting_window: { day_key: receipt?.day_key },
    reason: awarded.duplicate ? 'duplicate' : key, job: rewards, faction_bonus: adjusted.bonus };
}

async function processPetDailyChest(db, telegramId, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const dayKey = getPetDayKey(now), weekKey = getPetWeekKey(now), season = getPetSeasonInfo(now);
  const eventKey = String(options.event_key || `pet:daily:${telegramId}:${dayKey}`).slice(0, 120);
  const duplicate = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (duplicate) {
    await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, eventKey, { accepted_event: duplicate });
    const pet = duplicate.pet_id ? await getPetInstanceWithAtomicDecay(db, duplicate.pet_id) : null;
    if (pet) Object.assign(pet, await readPetAccountWallet(db, telegramId) || {});
    return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0, pet, accounting_window: { day_key: duplicate.day_key } };
  }
  if (!await getPetProfile(db, telegramId)) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await prepareCurrentSeasonActivePetForWeeklyJourneySource(db, telegramId, now);
  if (!pet) return { accepted: false, reason: 'current_season_pet_required', xp_awarded: 0, pet_xp_awarded: 0 };
  const claimed = await readAcceptedDailyChestPetEventForDay(db, telegramId, dayKey);
  if (claimed) {
    await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, claimed.event_key, { accepted_event: claimed });
    return { accepted: false, reason: 'daily_claimed', pet };
  }
  if (!(await ensurePetAccountWalletReadyForMutation(db, telegramId, now))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', pet, xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const eventId = crypto.randomUUID();
  const metadata = JSON.stringify({ source: options.source || 'telegram_bot', runtime_event_key: options.runtime_event_key || null, rewards: { moon_gold: 40, style_tokens: 2 } });
  const nextXp = 'pet_xp + (SELECT pet_xp_awarded FROM daily_award)';
  const nextStage = `CASE ${PET_GROWTH_STAGE_THRESHOLDS.slice().reverse().map((stage) => `WHEN ${nextXp} >= ${stage.min_xp} THEN '${stage.stage}'`).join(' ')} END`;
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,xp_awarded,pet_xp_awarded,season_key,day_key,week_key,status,reason,metadata)
      SELECT ?,?,?,'daily_chest',?,0,MIN(40,MAX(0,?-(SELECT COALESCE(SUM(pet_xp_awarded),0) FROM telegram_pet_events
        WHERE telegram_id=? AND day_key=? AND status='accepted'))),?,?,?,'pending','daily_chest_pending',?
      WHERE NOT EXISTS (SELECT 1 FROM telegram_pet_events WHERE telegram_id=? AND event_type='daily_chest' AND day_key=? AND status='accepted')
        AND ${accountWalletRecoveryResolvedSql('?')}
        AND EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=? AND status='active')`)
      .bind(eventId, pet.pet_id, telegramId, eventKey, PETS_DAILY_PET_XP_CAP, telegramId, dayKey, season.key, dayKey, weekKey, metadata,
        telegramId, dayKey, telegramId, pet.pet_id, telegramId, pet.season_key),
    accountWalletDeltaStatement(db, telegramId, { moon_gold: 40, style_tokens: 2 },
      "EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND status = 'pending')", [eventId]),
    db.prepare(`WITH daily_award AS (SELECT pet_id,telegram_id,pet_xp_awarded FROM telegram_pet_events WHERE id=? AND status='pending')
      UPDATE telegram_pet_instances SET pet_xp=${nextXp}, level=${getPetVisibleLevelSql(nextXp)}, stage=${nextStage},
        streak_days=CASE WHEN last_active_day>? THEN streak_days WHEN last_active_day=? THEN MAX(1,streak_days) WHEN last_active_day=? THEN streak_days+1 ELSE 1 END,
        last_active_day=CASE WHEN last_active_day>? THEN last_active_day ELSE ? END,
        source_profile_updated_at=?, updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=(SELECT pet_id FROM daily_award) AND telegram_id=(SELECT telegram_id FROM daily_award)`)
      .bind(eventId, dayKey, dayKey, getPreviousPetDayKey(dayKey), dayKey, dayKey, PET_INSTANCE_AUTHORITY_VERSION),
    // Mirror only if this is still the selected pet. The instance owns the award.
    db.prepare(`UPDATE telegram_pet_profiles SET
        (pet_xp,level,stage,streak_days,last_active_day,last_decay_at)=
          (SELECT pet_xp,level,stage,streak_days,last_active_day,last_decay_at FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=?),
        updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id=? AND status='pending')
        AND EXISTS (SELECT 1 FROM telegram_pet_active_slots WHERE telegram_id=? AND pet_id=? AND season_key=?)`)
      .bind(pet.pet_id, telegramId, telegramId, eventId, telegramId, pet.pet_id, pet.season_key),
    db.prepare(`INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp,weekly_xp,daily_xp,daily_key,weekly_key)
      SELECT ?,?,pet_xp_awarded,pet_xp_awarded,pet_xp_awarded,?,? FROM telegram_pet_events WHERE id=? AND status='pending'
      ON CONFLICT(telegram_id,season_key) DO UPDATE SET season_xp=season_xp+excluded.season_xp,
        weekly_xp=CASE WHEN weekly_key=excluded.weekly_key THEN weekly_xp+excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp=CASE WHEN daily_key=excluded.daily_key THEN daily_xp+excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key=excluded.daily_key,weekly_key=excluded.weekly_key,updated_at=CURRENT_TIMESTAMP`)
      .bind(telegramId, season.key, dayKey, weekKey, eventId),
    db.prepare(`UPDATE telegram_pet_events SET status='accepted',reason='daily_chest'
      WHERE id=? AND status='pending' RETURNING id,pet_xp_awarded`).bind(eventId),
  ]);
  const accepted = results?.[5]?.results?.[0];
  if (!accepted) {
    const previous = await readAcceptedDailyChestPetEventForDay(db, telegramId, dayKey);
    if (previous) await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, previous.event_key, { accepted_event: previous });
    if (previous?.event_key === eventKey) {
      const receiptPet = previous.pet_id ? await getPetInstanceWithAtomicDecay(db, previous.pet_id) : null;
      if (receiptPet) Object.assign(receiptPet, await readPetAccountWallet(db, telegramId) || {});
      return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0, pet: receiptPet, accounting_window: { day_key: previous.day_key } };
    }
    return { accepted: false, reason: previous ? 'daily_claimed' : 'daily_cache_state_changed', xp_awarded: 0, pet_xp_awarded: 0, pet };
  }
  const persistedPet = await getPetInstanceWithAtomicDecay(db, pet.pet_id);
  if (persistedPet) Object.assign(persistedPet, await readPetAccountWallet(db, telegramId) || {});
  await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, eventKey);
  return { accepted: true, reason: 'daily_chest', xp_awarded: 0, pet_xp_awarded: accepted.pet_xp_awarded, pet: persistedPet, accounting_window: { day_key: dayKey } };
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
    SELECT id, pet_id, status, reason, day_key, week_key, season_key
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?
  `).bind(telegramId, eventKey).first();
  if (duplicate && duplicate.status !== 'pending') {
    if (String(duplicate.status) === 'cancelled' && String(duplicate.reason) === 'legacy_repeat_reward_missing_pet_authority') {
      return { accepted: false, duplicate: true, reason: 'legacy_repeat_reward_missing_pet_authority', xp_awarded: 0, pet_xp_awarded: 0 };
    }
    return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const pet = await getPetProfileWithAtomicDecay(db, telegramId, now);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', xp_awarded: 0, pet_xp_awarded: 0 };
  const sourceAuthority = activePetRewardAuthority(pet);
  if (!sourceAuthority) return { accepted: false, reason: 'source_pet_authority_required', xp_awarded: 0, pet_xp_awarded: 0, pet };
  const reservation = await reservePetRepeatRewardEvent(db, {
    telegram_id: telegramId,
    pet_id: sourceAuthority.pet_id,
    event_type: 'random_event',
    event_key: eventKey,
    season_key: sourceAuthority.season_key,
    day_key: dayKey,
    week_key: weekKey,
    mode: 'event',
    source: options.source || 'telegram_bot',
    existing_event: duplicate,
  });
  if (!reservation.claimed) return { accepted: true, duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const rewardAuthority = reservation.pet_id && reservation.season_key
    ? { pet_id: String(reservation.pet_id), season_key: String(reservation.season_key) }
    : null;
  if (!rewardAuthority) {
    if (reservation.resumed) {
      const legacyResolution = await cancelLegacyPendingRepeatRewardReservation(db, {
        telegram_id: telegramId,
        event_key: eventKey,
        mode: 'event',
        reservation,
      });
      if (legacyResolution.cancelled) {
        return {
          accepted: false,
          reason: 'legacy_repeat_reward_missing_pet_authority',
          cancelled: true,
          released_slot: legacyResolution.released,
          reward_slot: reservation.claimed_slot,
          xp_awarded: 0,
          pet_xp_awarded: 0,
          pet,
        };
      }
    }
    return { accepted: false, reason: 'source_pet_authority_required', xp_awarded: 0, pet_xp_awarded: 0, pet };
  }

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
    pet_id: rewardAuthority.pet_id,
    event_type: 'random_event', reason: `${encounter.key}:${choice.key}:${outcome.kind}`,
    reservation_id: reservation.reservation_id, rewards: rewardsApplied, currency_costs: costsApplied,
    profile_deltas: profileDeltas, touch_streak: true, now, day_key: accountingDayKey, week_key: accountingWeekKey, season_key: accountingSeasonKey,
    context: { source: options.source || 'telegram_bot', encounter_key: encounter.key, choice_key: choice.key, result_kind: outcome.kind, reward_slot: rewardSlot.claimed_slot, reward_multiplier: rewardSlot.multiplier, copy: outcome.copy },
  });
  if (awarded.accepted) {
    await runPetIdentityWriteHook(options, { event_key: eventKey, ...rewardAuthority, event_type: 'random_event' });
    await recordMoonpetBehaviour(db, {
      pet_id: rewardAuthority.pet_id, season_key: rewardAuthority.season_key,
      telegram_id: telegramId, event_key: `${eventKey}:personality`, source_event_key: eventKey, source_event_type: 'random_event',
      behaviour: 'event', activity: 'event',
    });
    await recordMoonpetBiggestReward(db, {
      pet_id: rewardAuthority.pet_id, season_key: rewardAuthority.season_key,
      telegram_id: telegramId, event_key: `${eventKey}:biggest-reward`, source_event_key: eventKey, source_event_type: 'random_event',
      reward_amount: awarded.rewards?.moon_gold, reward_currency: 'moon_gold',
    });
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
  const owned = new Set(pet?.owned_equipment || []);
  return Object.values(PET_SHOP_ITEMS).map((item) => ({
    ...item,
    owned: owned.has(item.key),
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

async function getPetProfile(db, telegramId, includeOwnedEquipment = false) {
  await reconcilePetInstanceWalletToProfile(db, telegramId);
  const instance = await readActivePetInstance(db, telegramId);
  const profile = await db.prepare(`
    SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?
  `).bind(telegramId).first().then(requirePetFirstReadResult);
  if (!instance) return withPetEquipmentProgression(db, profile ? applyPetDecay(profile) : null, includeOwnedEquipment);
  const walletFields = profile ? pickPetAccountWallet(profile) : {};

  if (profile && petStateColumnsDiffer(profile, instance)) {
    const profileUpdatedAt = petStateTimestamp(profile.updated_at);
    const instanceProfileVersion = petStateTimestamp(instance.source_profile_updated_at);
    const instanceUpdatedAt = petStateTimestamp(instance.updated_at);
    const hasInstanceAuthority = instance.source_profile_updated_at === PET_INSTANCE_AUTHORITY_VERSION;
    if (hasInstanceAuthority) {
      await mirrorActivePetOwnedStateToProfile(db, instance);
      return withPetEquipmentProgression(db, applyPetDecay({ ...instance, ...walletFields }), includeOwnedEquipment);
    }
    const profileIsNewer = !hasInstanceAuthority && (profileUpdatedAt > instanceProfileVersion
      || (profileUpdatedAt === instanceProfileVersion && instanceUpdatedAt <= instanceProfileVersion));
    if (profileIsNewer) {
      await writeActivePetInstance(db, telegramId, profile);
      return withPetEquipmentProgression(db, applyPetDecay({ ...instance, ...profile, ...walletFields, pet_id: instance.pet_id }), includeOwnedEquipment);
    }
    await mirrorActivePetInstanceToProfile(db, instance);
  }
  return withPetEquipmentProgression(db, applyPetDecay({ ...instance, ...walletFields }), includeOwnedEquipment);
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
    const stored = await db.prepare(`SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?`).bind(telegramId).first().then(requirePetFirstReadResult);
    if (!stored) return null;
    const priorDecayAt = stored.last_decay_at;
    const decayed = applyPetDecay({ ...stored }, now);
    if (decayed.last_decay_at === priorDecayAt) return withPetEquipmentProgression(db, decayed);
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
    if (Number(sync?.meta?.changes || 0) === 1) return withPetEquipmentProgression(db, decayed);
  }
  throw new Error('pet_decay_sync_conflict');
}

async function getPetInstanceWithAtomicDecay(db, petId, now = new Date()) {
  const normalizedPetId = String(petId || '').trim();
  if (!normalizedPetId) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await db.prepare(`SELECT * FROM telegram_pet_instances WHERE pet_id = ? LIMIT 1`).bind(normalizedPetId).first().then(requirePetFirstReadResult);
    if (!stored) return null;
    const priorDecayAt = stored.last_decay_at;
    const decayed = applyPetDecay({ ...stored }, now);
    if (decayed.last_decay_at === priorDecayAt) return withPetEquipmentProgression(db, decayed);
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
    return withPetEquipmentProgression(db, { ...stored, ...decayed, updated_at: syncedAt, source_profile_updated_at: syncedAt });
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
  return /no such table: telegram_pet_(instances|season_slots|active_slots)/i.test(String(error?.cause?.message || error?.message || error));
}

function petStateTimestamp(value) {
  if (!value) return 0;
  const normalizedValue = String(value).trim();
  const zoned = normalizedValue.includes('T') ? normalizedValue : `${normalizedValue.replace(' ', 'T')}Z`;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(zoned)
    ? zoned.replace(/\.\d+(?=(Z|[+-]\d\d:\d\d)$)/, '')
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
    .bind(telegramId).first().then(requirePetFirstReadResult);
  return profile ? pickPetAccountWallet(profile) : null;
}

async function readAcceptedPetEventByKey(db, telegramId, eventKey) {
  // This lookup is the shared idempotency authority for care, work, shopping,
  // item use and reward recovery. An outage must stop the mutation path.
  return db.prepare(`
    SELECT id, pet_id, telegram_id, event_type, event_key, status, reason, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, metadata
    FROM telegram_pet_events
    WHERE telegram_id = ? AND event_key = ? AND status = 'accepted'
    LIMIT 1
  `).bind(telegramId, eventKey).first().then(requirePetFirstReadResult);
}

async function readAcceptedDailyChestPetEventForDay(db, telegramId, dayKey) {
  const owner = String(telegramId || '').trim();
  const day = String(dayKey || '').trim();
  if (!owner || !day) return null;
  return db.prepare(`
    SELECT id, pet_id, telegram_id, event_type, event_key, status, reason,
           xp_awarded, pet_xp_awarded, season_key, day_key, week_key, metadata
    FROM telegram_pet_events
    WHERE telegram_id = ?
      AND day_key = ?
      AND event_type = 'daily_chest'
      AND status = 'accepted'
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `).bind(owner, day).first().then(requirePetFirstReadResult);
}

const WEEKLY_JOURNEY_SOURCE_OBJECTIVES = Object.freeze({
  feed: 'weekly_care',
  play: 'weekly_care',
  clean: 'weekly_care',
  sleep: 'weekly_care',
  train: 'weekly_training',
  run: 'weekly_run',
  run_complete: 'weekly_run',
  run_extract: 'weekly_run',
  daily_run: 'weekly_run',
  daily_moon_run: 'weekly_run',
  weekly_boss: 'weekly_boss_attempt',
  boss_fought: 'weekly_boss_attempt',
  weekly_boss_reward: 'weekly_boss_attempt',
  check_in: 'weekly_check_in',
  daily_check_in: 'weekly_check_in',
  weekly_check_in: 'weekly_check_in',
  daily_chest: 'weekly_check_in',
});

const WEEKLY_JOURNEY_DIRECT_ACTION_PREP_ACTIONS = Object.freeze(['feed', 'play', 'clean', 'sleep', 'train', 'energy_drink', 'dance', 'cuddles']);

function requiresWeeklyJourneyDirectActionPetPreparation(action) {
  return WEEKLY_JOURNEY_DIRECT_ACTION_PREP_ACTIONS.includes(String(action || ''));
}

async function prepareCurrentSeasonActivePetForWeeklyJourneySource(db, telegramId, now = new Date()) {
  const owner = String(telegramId || '').trim();
  if (!owner) return null;
  const prepared = await preparePetMiniAppState(db, owner, now);
  if (!prepared) return null;
  const pet = await getPetProfile(db, owner);
  const season = getPetSeasonInfo(now);
  if (!String(pet?.pet_id || '').trim()) return null;
  if (String(pet.season_key || '') !== String(season.key || '')) return null;
  return pet;
}

async function recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, eventKey, options = {}) {
  const acceptedEvent = options.accepted_event || await readAcceptedPetEventByKey(db, telegramId, eventKey);
  const eventType = String(acceptedEvent?.event_type || '');
  const objectiveId = WEEKLY_JOURNEY_SOURCE_OBJECTIVES[eventType];
  if (!acceptedEvent || !objectiveId) return { accepted: false, reason: acceptedEvent ? 'weekly_journey_source_unmapped' : 'weekly_journey_source_event_missing' };
  const petId = String(acceptedEvent.pet_id || '').trim();
  const seasonKey = String(acceptedEvent.season_key || '').trim();
  const dayKey = String(acceptedEvent.day_key || '').trim();
  if (!petId || !seasonKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return { accepted: false, reason: 'weekly_journey_source_incomplete' };
  const season = getPetSeasonInfo(`${dayKey}T00:00:00.000Z`);
  const qualificationWeek = getPetSeasonWeek(season, new Date(`${dayKey}T00:00:00.000Z`));
  const objective = PET_WEEKLY_JOURNEY_OBJECTIVES[objectiveId];
  if (!objective || qualificationWeek < 1 || qualificationWeek > 13) return { accepted: false, reason: 'weekly_journey_source_incomplete' };
  return recordWeeklyJourneyObjectiveEvidence(db, {
    telegram_id: String(acceptedEvent.telegram_id || telegramId),
    pet_id: petId,
    season_key: seasonKey,
    qualification_week: qualificationWeek,
    objective_id: objectiveId,
    source_event_key: acceptedEvent.event_key,
    progress_value: objective.target,
    earned_at: `${dayKey}T00:00:00.000Z`,
    evidence: {
      authority: 'live_weekly_journey_source_event',
      source_event_type: eventType,
      source_event_key: acceptedEvent.event_key,
      source_event_id: acceptedEvent.id || null,
    },
  }).catch((error) => ({ accepted: false, reason: error?.message || 'weekly_journey_progress_unavailable' }));
}

async function readAcceptedWeeklyBossPetEvent(db, telegramId, weekKey, dayKey, bossId) {
  const owner = String(telegramId || '').trim();
  const week = String(weekKey || '').trim();
  const day = String(dayKey || '').trim();
  const boss = String(bossId || '').trim();
  if (!owner || !week || !boss) return null;
  const baseSql = `
    SELECT id, pet_id, telegram_id, event_type, event_key, status, reason,
           xp_awarded, pet_xp_awarded, season_key, day_key, week_key, metadata
    FROM telegram_pet_events
    WHERE telegram_id = ?
      AND week_key = ?
      AND event_type = 'weekly_boss'
      AND status = 'accepted'
      AND metadata LIKE ? ESCAPE '\\'
  `;
  const bossPattern = `%\"boss_id\":\"${escapeSqlLikePattern(boss)}\"%`;
  const sameDayEvent = day ? await db.prepare(`${baseSql}
      AND day_key = ?
    ORDER BY created_at ASC, id ASC
    LIMIT 1`).bind(owner, week, bossPattern, day).first().then(requirePetFirstReadResult) : null;
  if (sameDayEvent) return sameDayEvent;
  return db.prepare(`${baseSql}
    ORDER BY day_key ASC, created_at ASC, id ASC
    LIMIT 1`).bind(owner, week, bossPattern).first().then(requirePetFirstReadResult);
}

async function readWeeklyBossVictoryPetAttribution(db, telegramId, weekKey, bossId) {
  const owner = String(telegramId || '').trim();
  const week = String(weekKey || '').trim();
  const boss = String(bossId || '').trim();
  if (!owner || !week || !boss) return null;
  return db.prepare(`SELECT pet_id, season_key, victory_event_key, defeated_at
    FROM telegram_pet_weekly_boss_victories_by_pet
    WHERE telegram_id = ? AND week_key = ? AND boss_id = ?
    ORDER BY defeated_at ASC
    LIMIT 1`).bind(owner, week, boss).first().then(requirePetFirstReadResult);
}

async function ensureAcceptedWeeklyBossPetEvent(db, telegramId, weekKey, dayKey, boss, attemptRow, season) {
  const bossId = String(boss?.boss_id || boss || '').trim();
  const existing = await readAcceptedWeeklyBossPetEvent(db, telegramId, weekKey, dayKey, bossId);
  if (existing) return existing;
  if (!attemptRow) return null;
  const victoryPet = await readWeeklyBossVictoryPetAttribution(db, telegramId, weekKey, bossId);
  const petId = String(victoryPet?.pet_id || '').trim();
  if (!petId) return null;
  const attemptDay = String(attemptRow.day_key || dayKey || '').trim();
  const eventKey = String(attemptRow.event_key || `pet:weekly_boss:${telegramId}:${weekKey}:${attemptDay}:${bossId}`).slice(0, 180);
  const eventId = `${String(attemptRow.event_id || eventKey)}:pet-event`.slice(0, 180);
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    SELECT ?, ?, ?, 'weekly_boss', ?, 0, 0, ?, ?, ?, 'accepted', 'weekly_boss_attempt', ?
    WHERE EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_events WHERE event_id = ?)
      AND EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ?)`)
    .bind(
      eventId,
      petId,
      telegramId,
      eventKey,
      victoryPet?.season_key || season?.key || getPetSeasonInfo(new Date()).key,
      attemptDay,
      weekKey,
      JSON.stringify({
        source: 'pet_weekly_boss_backfill',
        boss_id: bossId,
        action: attemptRow.action || null,
        damage: attemptRow.damage ?? null,
      }),
      attemptRow.event_id,
      petId,
      telegramId,
    ).run();
  return readAcceptedWeeklyBossPetEvent(db, telegramId, weekKey, attemptDay, bossId);
}

async function readWeeklyBossAttemptRow(db, telegramId, weekKey, dayKey, bossId) {
  const owner = String(telegramId || '').trim();
  const week = String(weekKey || '').trim();
  const day = String(dayKey || '').trim();
  const boss = String(bossId || '').trim();
  if (!owner || !week || !boss) return null;
  const baseSql = `SELECT event_id, telegram_id, week_key, day_key, boss_id, event_key, action, damage
    FROM telegram_pet_weekly_boss_events
    WHERE telegram_id = ? AND week_key = ? AND boss_id = ?`;
  const sameDay = day ? await db.prepare(`${baseSql} AND day_key = ? ORDER BY created_at ASC LIMIT 1`)
    .bind(owner, week, boss, day).first().then(requirePetFirstReadResult) : null;
  if (sameDay) return sameDay;
  return db.prepare(`${baseSql} ORDER BY day_key ASC, created_at ASC LIMIT 1`)
    .bind(owner, week, boss).first().then(requirePetFirstReadResult);
}

async function recordWeeklyJourneyFromAcceptedWeeklyBossEvent(db, telegramId, weekKey, dayKey, boss, attemptRow, victoriousPet, season) {
  const acceptedWeeklyBossEvent = await ensureAcceptedWeeklyBossPetEvent(db, telegramId, weekKey, dayKey, boss, attemptRow, season);
  if (!acceptedWeeklyBossEvent) return { accepted: false, reason: 'weekly_journey_source_event_missing' };
  return recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, acceptedWeeklyBossEvent.event_key, {
    accepted_event: acceptedWeeklyBossEvent,
  });
}

async function readDailyMoonRunTerminalEvent(db, telegramId, runId, terminalType) {
  const eventKey = `daily-moon-run:${telegramId}:${runId}:${terminalType}`.slice(0, 180);
  return readAcceptedPetEventByKey(db, telegramId, eventKey);
}

async function ensureAcceptedDailyMoonRunTerminalEvent(db, telegramId, runId, terminalType) {
  const owner = String(telegramId || '').trim();
  const terminal = terminalType === 'extracted' ? 'extracted' : terminalType === 'completed' ? 'completed' : '';
  const normalizedRunId = String(runId || '').trim();
  if (!owner || !normalizedRunId || !terminal) return null;
  const existing = await readDailyMoonRunTerminalEvent(db, owner, normalizedRunId, terminal);
  if (existing) return existing;
  const row = await db.prepare(`SELECT d.pet_id, d.telegram_id, d.utc_day, d.run_id, d.status AS daily_status,
      r.season_key, r.status AS authoritative_status, r.current_room, r.max_room, r.score, r.depth
    FROM telegram_pet_daily_runs d
    JOIN telegram_pet_runs r ON r.run_id = d.run_id AND r.telegram_id = d.telegram_id
    WHERE d.telegram_id = ? AND d.run_id = ? LIMIT 1`).bind(owner, normalizedRunId).first().catch(() => null);
  if (!row || !String(row.pet_id || '').trim() || String(row.authoritative_status || row.daily_status) !== terminal) return null;
  const dayKey = String(row.utc_day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const eventKey = `daily-moon-run:${owner}:${normalizedRunId}:${terminal}`.slice(0, 180);
  const eventId = `${eventKey}:pet-event`.slice(0, 180);
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
    (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
    SELECT ?, ?, ?, 'daily_moon_run', ?, 0, 0, ?, ?, ?, 'accepted', ?, ?
    WHERE EXISTS (SELECT 1 FROM telegram_pet_daily_runs WHERE telegram_id = ? AND run_id = ?)
      AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE telegram_id = ? AND run_id = ? AND status = ?)
      AND EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ?)`)
    .bind(
      eventId,
      row.pet_id,
      owner,
      eventKey,
      row.season_key || getPetSeasonInfo(`${dayKey}T00:00:00.000Z`).key,
      dayKey,
      getPetWeekKey(new Date(`${dayKey}T00:00:00.000Z`)),
      terminal === 'completed' ? 'daily_moon_run_completed' : 'daily_moon_run_extracted',
      JSON.stringify({
        source: 'daily_moon_run_terminal',
        run_id: normalizedRunId,
        terminal_type: terminal,
        rooms_completed: row.current_room ?? row.depth ?? null,
        score: row.score ?? null,
      }),
      owner,
      normalizedRunId,
      owner,
      normalizedRunId,
      terminal,
      row.pet_id,
      owner,
    ).run();
  return readDailyMoonRunTerminalEvent(db, owner, normalizedRunId, terminal);
}

async function recordWeeklyJourneyFromDailyMoonRunTerminal(db, telegramId, runId, terminalType) {
  try {
    const acceptedEvent = await ensureAcceptedDailyMoonRunTerminalEvent(db, telegramId, runId, terminalType);
    if (!acceptedEvent) return { accepted: false, reason: 'daily_moon_run_source_event_missing' };
    return await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, acceptedEvent.event_key, { accepted_event: acceptedEvent });
  } catch (error) {
    return {
      accepted: false,
      reason: 'daily_moon_run_weekly_journey_unavailable',
      error_message: String(error?.message || error || '').slice(0, 180),
    };
  }
}

async function processDailyMoonRunStepWithWeeklyJourney(db, request = {}) {
  const result = await processDailyMoonRunStep(db, request);
  const runId = String(request.run_id || result?.daily_run?.run_id || '').trim();
  const telegramId = String(request.telegram_id || result?.daily_run?.telegram_id || '').trim();
  if (telegramId && runId) await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward, { run_id: runId });
  const terminalStatus = result?.reason === 'daily_run_completed'
    ? 'completed'
    : result?.reason === 'daily_run_terminal' && ['completed', 'extracted'].includes(String(result?.daily_run?.authoritative_status || ''))
      ? String(result.daily_run.authoritative_status)
      : '';
  if (telegramId && runId && terminalStatus) {
    await recordWeeklyJourneyFromDailyMoonRunTerminal(db, telegramId, runId, terminalStatus);
  }
  return result;
}

async function extractDailyMoonRunWithWeeklyJourney(db, request = {}) {
  const result = await extractDailyMoonRun(db, request);
  const runId = String(request.run_id || result?.daily_run?.run_id || '').trim();
  const telegramId = String(request.telegram_id || result?.daily_run?.telegram_id || '').trim();
  if (telegramId && runId) await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward, { run_id: runId });
  const terminalStatus = result?.reason === 'daily_run_completed' ? 'completed'
    : result?.accepted || result?.duplicate || String(result?.extraction?.status || '') === 'extracted'
    ? 'extracted'
    : '';
  if (telegramId && runId && terminalStatus) {
    await recordWeeklyJourneyFromDailyMoonRunTerminal(db, telegramId, runId, terminalStatus);
  }
  return result;
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
    `).bind(String(telegramId)).first().then(requirePetFirstReadResult);
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
  if (slot) return db.prepare(`SELECT * FROM telegram_pet_instances WHERE pet_id = ? LIMIT 1`).bind(slot.pet_id).first().then(requirePetFirstReadResult);
  // Migration-safe repair is deliberately limited to the free starter. A paid
  // slot with a missing instance must never be synthesized from the active pet.
  let starter;
  try {
    starter = await db.prepare(`SELECT s.* FROM telegram_pet_active_slots a
      JOIN telegram_pet_season_slots s ON s.pet_id=a.pet_id AND s.telegram_id=a.telegram_id AND s.season_key=a.season_key
      WHERE a.telegram_id=? AND s.slot_number=1 AND s.acquisition_type='free' AND s.status='active' LIMIT 1`)
      .bind(String(telegramId)).first().then(requirePetFirstReadResult);
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
    return await db.prepare(`SELECT * FROM telegram_pet_instances WHERE pet_id = ? LIMIT 1`).bind(starter.pet_id).first().then(requirePetFirstReadResult);
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
  if (owner && options?.pet_id && options?.season_key && !Object.hasOwn(options.context || {}, 'equipment_snapshot')) {
    const source = await db.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=?')
      .bind(options.pet_id, owner, options.season_key).first().then(requirePetFirstReadResult);
    const equipped = await withPetEquipmentProgression(db, source);
    options = { ...options, context: { ...options.context, equipment_snapshot: equipped?.equipment_progression || {} } };
  }
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

function activePetRewardAuthority(pet = null) {
  const petId = String(pet?.pet_id || '').trim();
  const seasonKey = String(pet?.season_key || '').trim();
  return petId && seasonKey ? { pet_id: petId, season_key: seasonKey } : null;
}

function petArenaParticipantAuthority(match = {}, telegramId = '') {
  const owner = String(telegramId || '').trim();
  const isPlayer1 = String(match?.player1_telegram_id || '') === owner;
  const isPlayer2 = String(match?.player2_telegram_id || '') === owner;
  const petId = isPlayer1 ? match.player1_pet_id : isPlayer2 ? match.player2_pet_id : match.pet_id;
  const seasonKey = isPlayer1 ? match.player1_season_key : isPlayer2 ? match.player2_season_key : match.season_key;
  const normalizedPetId = String(petId || '').trim();
  const normalizedSeasonKey = String(seasonKey || '').trim();
  return normalizedPetId && normalizedSeasonKey ? { pet_id: normalizedPetId, season_key: normalizedSeasonKey } : null;
}

async function runPetIdentityWriteHook(options = {}, context = {}) {
  const hook = options.before_identity_write || options.beforeIdentityWrite;
  if (typeof hook === 'function') await hook(context);
}

async function recordPetActionBehaviourFromAcceptedEvent(db, {
  telegram_id: telegramId,
  event_key: eventKey,
  action,
  behaviour,
  activity,
  pet,
}) {
  const accepted = await readAcceptedPetEventByKey(db, telegramId, eventKey);
  if (!accepted) return { accepted: false, reason: 'source_event_not_accepted' };
  const petId = String(accepted.pet_id || '').trim();
  const seasonKey = String(accepted.season_key || '').trim();
  if (petId && seasonKey) {
    return recordMoonpetBehaviour(db, {
      telegram_id: telegramId,
      pet_id: petId,
      season_key: seasonKey,
      event_key: `${eventKey}:personality`,
      source_event_key: eventKey,
      source_event_type: String(accepted.event_type || action || ''),
      behaviour,
      activity,
      day_key: accepted.day_key,
    });
  }
  const legacyAuthority = activePetRewardAuthority(pet);
  if (!legacyAuthority) return { accepted: false, reason: 'source_pet_authority_required' };
  return recordMoonpetBehaviour(db, {
    telegram_id: telegramId,
    pet_id: legacyAuthority.pet_id,
    season_key: legacyAuthority.season_key,
    event_key: `${eventKey}:personality`,
    behaviour,
    activity,
    day_key: accepted.day_key,
  });
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
  // Keep the selected pet stable while these owner-scoped sessions are pending.
  // A failed lookup must not clear the switch/rollover guard.
  const pendingSystems = [
    ['pet_run_active', `SELECT run_id AS id FROM telegram_pet_runs WHERE telegram_id=? AND status='active' LIMIT 1`],
    ['pet_arena_active', `SELECT battle_id AS id FROM telegram_pet_arena_battles WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired') LIMIT 1`],
    ['pet_kaiju_active', `SELECT match_id AS id FROM telegram_pet_kaiju_matches WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired') LIMIT 1`],
  ];
  for (const [reason, sql] of pendingSystems) {
    const bindings = (reason === 'pet_arena_active' || reason === 'pet_kaiju_active') ? [owner, owner] : [owner];
    const pending = await db.prepare(sql).bind(...bindings).first().then(requirePetFirstReadResult);
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
    .bind(owner).first();
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
  const evolutionStage = Math.max(0, Number(row?.evolution_stage) || 0);
  const artIdentityId = row?.lifecycle_species_id || row?.species || null;
  const displayName = resolveMoonpetDisplayName({ evolution_stage: evolutionStage, art_identity_id: artIdentityId });
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
      name: displayName,
      pet_name: displayName,
      display_name: displayName,
      species: evolutionStage >= MOONPET_IDENTITY_REVEAL_STAGE ? artIdentityId : null,
      art_identity_id: publicMoonpetArtIdentityId(artIdentityId, evolutionStage),
      variant: row?.rare_morph_id || null,
      stage: evolutionStage === 0 ? 'secret_bot' : row?.lifecycle_phase || row?.stage || 'street_moonpet',
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
    .bind(normalizedTelegramId).first();
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
          l.species_id AS lifecycle_species_id, l.rare_morph_id,
          COALESCE((SELECT MAX(e.stage) FROM telegram_pet_evolutions_by_pet e WHERE e.pet_id=s.pet_id), 0) AS evolution_stage
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
      `).bind(normalizedTelegramId).first(),
      db.prepare(`SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ? LIMIT 1`)
        .bind(normalizedTelegramId).first(),
      db.prepare(`SELECT arcade_xp_spendable, arcade_xp_spent FROM arcade_xp_wallets WHERE telegram_id = ? LIMIT 1`)
        .bind(normalizedTelegramId).first(),
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
  const profile = await db.prepare(`SELECT telegram_id FROM telegram_pet_profiles WHERE telegram_id=? LIMIT 1`)
    .bind(owner).first().then(requirePetFirstReadResult);
  if (!profile) return { accepted: false, reason: 'pet_not_adopted' };
  await ensurePetStarterSeasonSlot(db, owner, options.now || new Date());
  await getOrCreateArcadeProgressionState(db, owner);
  const existing = await db.prepare(`SELECT pet_id FROM telegram_pet_season_slots WHERE telegram_id=? AND season_key=? AND slot_number=? LIMIT 1`)
    .bind(owner, season.key, slotNumber).first().then(requirePetFirstReadResult);
  if (existing) return { accepted: false, reason: 'pet_slot_already_owned', season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };

  const previous = await db.prepare(`SELECT 1 AS owned FROM telegram_pet_season_slots WHERE telegram_id=? AND season_key=? AND slot_number=?`)
    .bind(owner, season.key, slotNumber - 1).first().then(requirePetFirstReadResult);
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
  const created = await db.prepare(`SELECT pet_id FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? LIMIT 1`)
    .bind(petId, owner).first().then(requirePetFirstReadResult);
  if (!created) {
    const wallet = await db.prepare(`SELECT arcade_xp_spendable FROM arcade_xp_wallets WHERE telegram_id=?`)
      .bind(owner).first().then(requirePetFirstReadResult);
    const duplicate = await db.prepare(`SELECT 1 AS owned FROM telegram_pet_season_slots WHERE telegram_id=? AND season_key=? AND slot_number=?`)
      .bind(owner, season.key, slotNumber).first().then(requirePetFirstReadResult);
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
    .bind(requested, owner, season.key).first().then(requirePetFirstReadResult);
  if (!slot) return { accepted: false, reason: 'pet_slot_not_switchable', season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
  // Reconcile any newer compatibility-profile write onto the currently active
  // instance before moving the pointer. Otherwise selecting another pet could
  // strand or overwrite a same-second legacy gameplay mutation.
  await getPetProfile(db, owner);
  // Resolve the complete target authority before changing the active pointer.
  // If D1 cannot read it, the failed switch must leave the current pet active.
  const pet = await db.prepare(`SELECT * FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=?`)
    .bind(slot.pet_id, owner).first().then(requirePetFirstReadResult);
  if (!pet) return { accepted: false, reason: 'pet_slot_not_switchable', season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
  const switched = await db.prepare(`UPDATE telegram_pet_active_slots SET pet_id=?, season_key=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?`)
    .bind(slot.pet_id, season.key, owner).run();
  if (Number(switched?.meta?.changes || 0) !== 1) {
    return { accepted: false, reason: 'active_pet_pointer_missing', season_slots: await buildPetSeasonSlotSummary(db, owner, options.now) };
  }
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
  `).bind(telegramId, dayKey).first().then(requirePetFirstReadResult);
  const week = await db.prepare(`
    SELECT COALESCE(SUM(xp_awarded), 0) AS community_xp,
           COALESCE(SUM(pet_xp_awarded), 0) AS pet_xp
    FROM telegram_pet_events
    WHERE telegram_id = ? AND week_key = ? AND status = 'accepted'
  `).bind(telegramId, weekKey).first().then(requirePetFirstReadResult);
  return {
    day: { community_xp: Number(day?.community_xp || 0), pet_xp: Number(day?.pet_xp || 0) },
    week: { community_xp: Number(week?.community_xp || 0), pet_xp: Number(week?.pet_xp || 0) },
  };
}

async function getPetDayXpTotal(db, petId, dayKey) {
  const row = await db.prepare(`SELECT COALESCE(SUM(pet_xp_awarded), 0) AS pet_xp
    FROM telegram_pet_events WHERE pet_id = ? AND day_key = ? AND status = 'accepted'`)
    .bind(String(petId || '').trim(), dayKey).first().then(requirePetFirstReadResult);
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
      AND NOT (player1_card_key IS NOT NULL AND (CASE WHEN mode='solo' THEN cpu_card_key ELSE player2_card_key END) IS NOT NULL)
  `).bind(String(chatId), `-${PET_KAIJU_MATCH_TTL_MINUTES} minutes`).run();
  const row = await db.prepare(`
    SELECT * FROM telegram_pet_kaiju_matches
    WHERE chat_id = ? AND status IN ('open', 'selecting')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(String(chatId)).first();
  return serializePetKaijuMatch(row);
}

async function getPetKaijuMatch(db, matchId) {
  const row = await db.prepare(`
    SELECT * FROM telegram_pet_kaiju_matches
    WHERE match_id = ?
    LIMIT 1
  `).bind(String(matchId || '')).first();
  return serializePetKaijuMatch(row);
}


async function getFreshPetKaijuMatch(db, matchId) {
  const id = String(matchId || '');
  const expireResult = await db.prepare(`
    UPDATE telegram_pet_kaiju_matches
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE match_id = ? AND status IN ('open', 'selecting') AND updated_at < datetime('now', ?)
      AND NOT (player1_card_key IS NOT NULL AND (CASE WHEN mode='solo' THEN cpu_card_key ELSE player2_card_key END) IS NOT NULL)
  `).bind(id, `-${PET_KAIJU_MATCH_TTL_MINUTES} minutes`).run();
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
  const player2 = options.player2_telegram_id ? String(options.player2_telegram_id) : null;
  const status = mode === 'group' && !player2 ? 'open' : 'selecting';
  const category = pickPetKaijuCategory();
  const inserted = options.mini_app_solo_guard
    ? await db.prepare(`
    INSERT INTO telegram_pet_kaiju_matches
      (id, match_id, chat_id, mode, status, player1_telegram_id, player2_telegram_id, category_key, roll)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM telegram_pet_kaiju_queue
      WHERE chat_id = ? AND telegram_id = ?
        AND (status = 'waiting' OR updated_at LIKE 'claim:%')
    )
  `).bind(crypto.randomUUID(), matchId, String(chatId), mode, status, String(telegramId), player2, category.key, category.roll,
      PET_MINI_APP_KAIJU_LOBBY, String(telegramId)).run()
    : await db.prepare(`
    INSERT INTO telegram_pet_kaiju_matches
      (id, match_id, chat_id, mode, status, player1_telegram_id, player2_telegram_id, category_key, roll)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), matchId, String(chatId), mode, status, String(telegramId), player2, category.key, category.roll).run();
  if (Number(inserted?.meta?.changes || 0) !== 1) return null;
  return getPetKaijuMatch(db, matchId);
}

async function ensurePetKaijuEligible(db, telegramId, existingPet = null) {
  const pet = existingPet || await getPetProfile(db, telegramId);
  if (!pet) return { ok: false, reason: 'pet_not_adopted' };
  let lifecycle;
  try {
    lifecycle = await getMoonpetLifecycle(db, telegramId);
  } catch (error) {
    return { ok: false, reason: 'combat_authority_unavailable', error: error?.message || String(error) };
  }
  const combat = getCombatEligibility({
    activePetExists: true,
    lifecycleKnown: Boolean(lifecycle),
    hatched: Boolean(lifecycle && lifecycle.phase !== 'egg'),
    level: getPetLevel(pet.pet_xp),
  });
  return { ok: combat.kaiju_unlocked, reason: combat.kaiju_reason, pet };
}

async function enqueuePetKaijuPlayer(db, chatId, telegramId) {
  await db.prepare(`
    UPDATE telegram_pet_kaiju_queue
    SET updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = ? AND telegram_id = ? AND status = 'waiting'
  `).bind(String(chatId), String(telegramId)).run();
  await db.prepare(`
    INSERT OR IGNORE INTO telegram_pet_kaiju_queue (id, chat_id, telegram_id, status)
    VALUES (?, ?, ?, 'waiting')
  `).bind(crypto.randomUUID(), String(chatId), String(telegramId)).run();
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM telegram_pet_kaiju_queue
    WHERE chat_id = ? AND status = 'waiting'
  `).bind(String(chatId)).first();
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
  `).bind(String(chatId), PET_KAIJU_QUEUE_LIMIT).all();
  return (rows?.results || []).map((row) => String(row.telegram_id || '')).filter((id) => id && !excludedSet.has(id));
}

async function getPetKaijuMatchForPlayer(db, telegramId) {
  await db.prepare(`UPDATE telegram_pet_kaiju_matches SET status='cancelled', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id LIKE 'mini:kaiju:match:%' AND status IN ('open','selecting') AND updated_at < datetime('now', ?)
      AND NOT (player1_card_key IS NOT NULL AND (CASE WHEN mode='solo' THEN cpu_card_key ELSE player2_card_key END) IS NOT NULL)`)
    .bind(`-${PET_KAIJU_MATCH_TTL_MINUTES} minutes`).run();
  const row = await db.prepare(`SELECT * FROM telegram_pet_kaiju_matches
    WHERE chat_id LIKE 'mini:kaiju:match:%' AND status IN ('open','selecting')
      AND (player1_telegram_id=? OR player2_telegram_id=?)
    ORDER BY created_at DESC LIMIT 1`).bind(String(telegramId), String(telegramId)).first();
  return serializePetKaijuMatch(row);
}

async function getPetKaijuQueueState(db, telegramId) {
  await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='expired', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND status='waiting' AND updated_at < datetime('now', ?)`)
    .bind(PET_MINI_APP_KAIJU_LOBBY, `-${PET_KAIJU_MATCH_TTL_MINUTES} minutes`).run();
  const row = await db.prepare(`SELECT queued_at FROM telegram_pet_kaiju_queue
    WHERE chat_id=? AND telegram_id=? AND status='waiting' LIMIT 1`)
    .bind(PET_MINI_APP_KAIJU_LOBBY, String(telegramId)).first();
  if (!row) return null;
  const position = await db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_kaiju_queue
    WHERE chat_id=? AND status='waiting' AND queued_at <= ?`).bind(PET_MINI_APP_KAIJU_LOBBY, row.queued_at).first();
  return { waiting: true, position: Math.max(1, Number(position?.count || 1)) };
}

async function matchmakePetKaijuMiniApp(db, telegramId) {
  const pet = await getPetProfile(db, telegramId);
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
    .bind(PET_MINI_APP_KAIJU_LOBBY, String(telegramId)).all();
  const opponent = (rows.results || []).find((row) => String(row.telegram_id) !== String(telegramId));
  if (!opponent) return { accepted: true, reason: 'kaiju_queued', queue: await getPetKaijuQueueState(db, telegramId) };
  const claimToken = `claim:${crypto.randomUUID()}`;
  const claimed = await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='played', updated_at=?
    WHERE chat_id=? AND telegram_id IN (?,?) AND status='waiting'`)
    .bind(claimToken, PET_MINI_APP_KAIJU_LOBBY, String(telegramId), String(opponent.telegram_id)).run();
  if (Number(claimed?.meta?.changes || 0) !== 2) {
    await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status=CASE WHEN EXISTS (
        SELECT 1 FROM telegram_pet_kaiju_matches b WHERE b.status IN ('open','selecting')
          AND b.chat_id LIKE 'mini:kaiju:match:%'
          AND (b.player1_telegram_id=telegram_pet_kaiju_queue.telegram_id OR b.player2_telegram_id=telegram_pet_kaiju_queue.telegram_id)
      ) THEN 'played' ELSE 'waiting' END, updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='played' AND updated_at=?`).bind(PET_MINI_APP_KAIJU_LOBBY, claimToken).run().catch(() => {});
    return { accepted: true, reason: 'kaiju_queued', queue: await getPetKaijuQueueState(db, telegramId) };
  }
  try {
    const room = `mini:kaiju:match:${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const created = await createPetKaijuMatch(db, room, opponent.telegram_id, 'group', { player2_telegram_id: telegramId });
    await db.prepare(`UPDATE telegram_pet_kaiju_queue SET updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='played' AND updated_at=?`).bind(PET_MINI_APP_KAIJU_LOBBY, claimToken).run();
    return { accepted: true, reason: 'kaiju_match_found', match: await getPetKaijuMatch(db, created.match_id) };
  } catch (error) {
    await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status=CASE WHEN EXISTS (
        SELECT 1 FROM telegram_pet_kaiju_matches b WHERE b.status IN ('open','selecting')
          AND b.chat_id LIKE 'mini:kaiju:match:%'
          AND (b.player1_telegram_id=telegram_pet_kaiju_queue.telegram_id OR b.player2_telegram_id=telegram_pet_kaiju_queue.telegram_id)
      ) THEN 'played' ELSE 'waiting' END, updated_at=CURRENT_TIMESTAMP
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

async function cancelPetKaijuMiniAppMatch(db, telegramId, matchId = '') {
  const cancelled = await db.prepare(`UPDATE telegram_pet_kaiju_matches
    SET status='cancelled', updated_at=CURRENT_TIMESTAMP
    WHERE match_id=? AND chat_id LIKE 'mini:kaiju:%' AND mode='solo' AND status IN ('open','selecting')
      AND player1_telegram_id=? AND player2_telegram_id IS NULL`)
    .bind(String(matchId || ''), String(telegramId)).run();
  if (Number(cancelled?.meta?.changes || 0) <= 0) return { accepted: false, reason: 'kaiju_match_not_found' };
  return { accepted: true, reason: 'kaiju_match_cancelled', match: await getPetKaijuMatch(db, matchId) };
}

function petKaijuRewardSource(match, telegramId) {
  return safeJsonParse(match?.score_json, {}).reward_sources?.[String(telegramId)] || null;
}

async function applyPetKaijuCard(db, match, telegramId, cardKey) {
  const owner = String(telegramId);
  const isPlayer1 = String(match.player1_telegram_id) === owner;
  if (!isPlayer1 && String(match.player2_telegram_id || '') !== owner) return { accepted: false, reason: 'not_participant' };
  if (match.status === 'completed') return finishPetKaijuMatch(db, match);
  if (match.status !== 'selecting') return { accepted: false, reason: 'kaiju_match_not_active' };
  const column = isPlayer1 ? 'player1_card_key' : 'player2_card_key';
  if (!match[column]) {
    const pet = await getPetProfile(db, owner);
    const authority = activePetRewardAuthority(pet);
    if (!authority) return { accepted: false, reason: 'source_pet_authority_required' };
    const source = JSON.stringify({ ...authority, equipment_snapshot: pet.equipment_progression || {} });
    const category = PET_KAIJU_CATEGORIES.find(entry => entry.key === match.category_key) || pickPetKaijuCategory();
    const cpuCard = isPlayer1 && match.mode === 'solo' ? pickPetKaijuCpuCard(cardKey).id : null;
    // The card and its pet/gear provenance commit together. A concurrent switch
    // rejects the lock; retries never replace a saved card, CPU choice or source.
    await db.prepare(`UPDATE telegram_pet_kaiju_matches SET ${column}=?,
        cpu_card_key=COALESCE(cpu_card_key,?), category_key=COALESCE(category_key,?),
        roll=CASE WHEN roll IS NULL OR roll=0 THEN ? ELSE roll END,
        score_json=json_set(CASE WHEN json_valid(score_json) THEN score_json ELSE '{}' END, ?, json(?)),
        updated_at=CURRENT_TIMESTAMP
      WHERE match_id=? AND status='selecting' AND ${column} IS NULL
        AND EXISTS (SELECT 1 FROM telegram_pet_active_slots WHERE telegram_id=? AND pet_id=? AND season_key=?)`)
      .bind(cardKey,cpuCard,category.key,category.roll,`$.reward_sources."${owner}"`,source,
        match.match_id,owner,authority.pet_id,authority.season_key).run();
  }
  const saved = await getPetKaijuMatch(db, match.match_id);
  if (saved?.status === 'completed') return finishPetKaijuMatch(db, saved);
  if (saved?.status !== 'selecting') return { accepted: false, reason: 'kaiju_match_not_active', match: saved };
  if (!saved[column]) return { accepted: false, reason: 'source_pet_changed', match: saved };
  const ready = saved.player1_card_key && (saved.mode === 'solo' ? saved.cpu_card_key : saved.player2_card_key);
  if (!ready) return { accepted: true, reason: 'kaiju_card_waiting', match: saved };
  return finishPetKaijuMatch(db, saved);
}

async function awardPetKaijuPlayerResult(db, telegramId, match, outcome, rewards = {}, options = {}) {
  if (match?.mode === 'pet_arena') {
    const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
    const sourceAuthority = petArenaParticipantAuthority(match, telegramId);
    if (!sourceAuthority) return { accepted: false, reason: 'source_pet_authority_required', xp_awarded: 0, pet_xp_awarded: 0 };
    const pet = await getPetInstanceWithAtomicDecay(db, sourceAuthority.pet_id);
    if (!pet || String(pet.telegram_id) !== String(telegramId) || String(pet.season_key) !== sourceAuthority.season_key) {
      return { accepted: false, reason: 'source_pet_authority_required', xp_awarded: 0, pet_xp_awarded: 0 };
    }
    const matchId = String(match.match_id || match.battle_id || '');
    const eventKey = buildStablePetEventKey(['pet_arena', matchId, telegramId]);
    const awarded = await awardPetReward(db, {
      telegram_id: telegramId, source: 'pet_arena', idempotency_key: eventKey, event_key: eventKey,
      pet_id: sourceAuthority.pet_id, season_key: sourceAuthority.season_key,
      event_type: 'arena_battle', reason: outcome, rewards,
      profile_deltas: { happiness: rewards.happiness }, touch_streak: true, now,
      context: { source: 'telegram_arena', match_id: matchId, mode: match.mode,
        equipment_snapshot: safeParsePetArenaSnapshot(String(match.player1_telegram_id) === String(telegramId)
          ? match.player1_pet_snapshot_json : match.player2_pet_snapshot_json).equipment_progression || {} },
    });
    if (awarded.accepted) {
      await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward, { action: 'arena_complete' });
      await runPetIdentityWriteHook(options, { event_key: eventKey, ...sourceAuthority, event_type: 'arena_battle' });
      await recordMoonpetBehaviour(db, {
        pet_id: sourceAuthority.pet_id, season_key: sourceAuthority.season_key,
        telegram_id: telegramId, event_key: `${eventKey}:personality`, source_event_key: eventKey, source_event_type: 'arena_battle',
        behaviour: 'combat', activity: 'combat',
      });
      await recordMoonpetBiggestReward(db, {
        pet_id: sourceAuthority.pet_id, season_key: sourceAuthority.season_key,
        telegram_id: telegramId, event_key: `${eventKey}:biggest-reward`, source_event_key: eventKey, source_event_type: 'arena_battle',
        reward_amount: awarded.rewards?.moon_gold, reward_currency: 'moon_gold',
      });
    }
    return { ...awarded, reward_slot: null, reward_multiplier: 1 };
  }
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  const eventKey = buildStablePetEventKey(['pet_kaiju', match.match_id, telegramId]);
  const duplicate = await db.prepare(`
    SELECT id, pet_id, status, reason, day_key, week_key, season_key, metadata
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?
  `).bind(telegramId, eventKey).first();
  if (duplicate && duplicate.status !== 'pending') return { accepted: duplicate.status === 'accepted', duplicate: true, reason: 'duplicate', xp_awarded: 0, pet_xp_awarded: 0 };
  const savedSource = petKaijuRewardSource(match, telegramId);
  const sourceAuthority = duplicate?.pet_id
    ? { pet_id: duplicate.pet_id, season_key: duplicate.season_key } : savedSource;
  if (!sourceAuthority?.pet_id || !sourceAuthority?.season_key) return { accepted: false, reason: 'source_pet_authority_required', xp_awarded: 0, pet_xp_awarded: 0 };
  const pet = await getPetInstanceWithAtomicDecay(db, sourceAuthority.pet_id, now);
  if (!pet || String(pet.telegram_id) !== String(telegramId) || String(pet.season_key) !== sourceAuthority.season_key) {
    return { accepted: false, reason: 'source_pet_authority_required', xp_awarded: 0, pet_xp_awarded: 0 };
  }
  const equipmentSnapshot = savedSource?.pet_id === sourceAuthority.pet_id && savedSource?.season_key === sourceAuthority.season_key
    ? savedSource.equipment_snapshot || {} : safeJsonParse(duplicate?.metadata, {}).equipment_snapshot || {};
  const completedAt = parseSqliteTs(match.completed_at);
  const earnedAt = Number.isFinite(completedAt) && completedAt > 0 ? new Date(completedAt) : now;
  const dayKey = getPetDayKey(earnedAt);
  const weekKey = getPetWeekKey(earnedAt);
  const season = getPetSeasonInfo(earnedAt);
  const energyCost = Math.max(0, Math.floor(Number(rewards.energy_cost || 0)));
  const reservation = await reservePetRepeatRewardEvent(db, {
    telegram_id: telegramId,
    pet_id: sourceAuthority.pet_id,
    event_type: 'kaiju_battle',
    event_key: eventKey,
    season_key: sourceAuthority.season_key,
    day_key: dayKey,
    week_key: weekKey,
    mode: 'kaiju',
    source: 'telegram_kaiju',
    energy_cost: energyCost,
    existing_event: duplicate,
    source_pet_settlement: true,
    equipment_snapshot: equipmentSnapshot,
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
    // Pre-upgrade reservations without a pet retain their existing legacy path.
    // Never stamp a guessed current pet onto a previously paid/held receipt.
    ...(reservation.pet_id ? { pet_id: reservation.pet_id } : {}),
    event_type: 'kaiju_battle', xp_action: 'pet_kaiju_battle', reason: outcome, reservation_id: reservation.reservation_id,
    rewards: scaledRewardsAuthority, profile_deltas: { happiness: scaledRewardsAuthority.happiness },
    touch_streak: true, now, day_key: rewardSlotAuthority.day_key, week_key: rewardSlotAuthority.week_key, season_key: rewardSlotAuthority.season_key,
    context: { source: 'telegram_kaiju', equipment_snapshot: equipmentSnapshot, match_id: match.match_id, mode: match.mode, reward_slot: rewardSlotAuthority.claimed_slot, reward_multiplier: rewardSlotAuthority.multiplier, energy_cost: energyCost },
  });
  await getPetProfile(db, telegramId);
  if (awardedAuthority.accepted && outcome === 'kaiju_win') {
    await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward, { action: 'kaiju_win' });
  }
  return { ...awardedAuthority, reward_slot: rewardSlotAuthority.claimed_slot, reward_multiplier: rewardSlotAuthority.multiplier,
    accounting_window: { day_key: rewardSlotAuthority.day_key, week_key: rewardSlotAuthority.week_key, season_key: rewardSlotAuthority.season_key } };
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
    reward_sources: safeJsonParse(match.score_json, {}).reward_sources || {},
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
  const saved = await getPetKaijuMatch(db, match.match_id);
  if (saved?.status !== 'completed' || !['player1_win','player2_win','draw'].includes(saved.result)) {
    return { accepted: false, reason: 'kaiju_match_not_active', match: saved };
  }
  match = saved;
  // Only the committed result authorizes a payout, including concurrent retries.
  const committed = { ...resolved, result: saved.result };
  const rewardResults = await awardPetKaijuMatchResults(db, match, committed);
  await db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='played', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND telegram_id IN (?,?) AND status='waiting'`)
    .bind(String(match.chat_id),String(match.player1_telegram_id),String(match.player2_telegram_id || '')).run();
  const queue = await getPetKaijuQueue(db, match.chat_id, [match.player1_telegram_id, match.player2_telegram_id || '']);
  await reconcileSanctuaryBestEffort(db, String(match.player1_telegram_id), 'kaiju_terminal');
  if (match.player2_telegram_id) await reconcileSanctuaryBestEffort(db, String(match.player2_telegram_id), 'kaiju_terminal');
  const duplicate = Number(completionResult?.meta?.changes || 0) === 0;
  return { accepted: true, duplicate, reason: duplicate ? 'already_completed' : 'kaiju_completed',
    match, resolved: committed, reward_results: rewardResults, queue };
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
function petArenaGearEffect(pet, slot) {
  const key = String(pet?.[`equipped_${slot}`] || '');
  const multiplier = getPetEquipmentMultiplier(pet, key);
  return Object.fromEntries(Object.entries(PET_SHOP_ITEMS[key]?.arena || {}).map(([stat,value]) => [stat, Math.round(value * multiplier)]));
}
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
  const isAppOpponent = String(pet?.telegram_id || '') === 'app';
  const identityRevealed = isAppOpponent || pet?.identity_revealed === true || Number(pet?.evolution_stage || 0) >= MOONPET_IDENTITY_REVEAL_STAGE;
  const displayName = isAppOpponent
    ? String(pet?.display_name || pet?.pet_name || 'APP MOONPET')
    : identityRevealed ? String(pet?.display_name || MOONPET_UNKNOWN_NAME) : MOONPET_UNKNOWN_NAME;
  return { equipment_progression: pet?.equipment_progression || {}, telegram_id: String(pet?.telegram_id || ''), name: displayName, pet_name: displayName, display_name: displayName, identity_revealed: identityRevealed, evolution_stage: Math.max(0, Number(pet?.evolution_stage || 0)), level, pet_xp: Math.max(0, Number(pet?.pet_xp || 0)), health: clampPetStat(pet?.health), energy: clampPetStat(pet?.energy), happiness: clampPetStat(pet?.happiness), cleanliness: clampPetStat(pet?.cleanliness), equipped_food: pet?.equipped_food || null, equipped_toy: pet?.equipped_toy || null, equipped_outfit: pet?.equipped_outfit || null, equipped_armor: pet?.equipped_armor || null, equipped_weapon: pet?.equipped_weapon || null, equipped_charm: pet?.equipped_charm || null };
}
function calculatePetArenaPower(pet, seed = '') {
  const s = buildPetArenaSnapshot(pet); const armor = petArenaGearEffect(s, 'armor'); const weapon = petArenaGearEffect(s, 'weapon'); const charm = petArenaGearEffect(s, 'charm');
  const outfit = Math.round((PET_SHOP_ITEMS[s.equipped_outfit]?.min_level || 0) * getPetEquipmentMultiplier(s, s.equipped_outfit));
  const toy = Math.round((PET_SHOP_ITEMS[s.equipped_toy]?.min_level || 0) * getPetEquipmentMultiplier(s, s.equipped_toy));
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
async function ensurePetArenaEligible(db, telegramId) {
  const pet = await getPetProfile(db, telegramId);
  if (!pet) return { ok:false, reason:'pet_not_adopted' };
  let lifecycle;
  try {
    lifecycle = await getMoonpetLifecycle(db, telegramId);
  } catch (error) {
    return { ok:false, reason:'combat_authority_unavailable', error: error?.message || String(error) };
  }
  if (!lifecycle || lifecycle.phase === 'egg') return { ok:false, reason: lifecycle ? 'moon_egg_must_hatch' : 'moonpet_lifecycle_required' };
  const identity = await getMoonpetIdentitySummary(db, telegramId).catch(() => null);
  const serialized = serializePet(pet, identity, { include_art_identity: true });
  const safePet = { ...pet, name: serialized.name, pet_name: serialized.pet_name, display_name: serialized.display_name, identity_revealed: serialized.evolution_stage >= MOONPET_IDENTITY_REVEAL_STAGE, evolution_stage: serialized.evolution_stage };
  const combat = getCombatEligibility({
    activePetExists: true,
    lifecycleKnown: true,
    hatched: true,
    level: getPetLevel(pet.pet_xp),
  });
  if (!combat.arena_unlocked) return { ok:false, reason: combat.arena_reason, pet: safePet };
  if (clampPetStat(pet.health) < 15) return { ok:false, reason:'health_low', pet: safePet };
  return { ok:true, pet: safePet };
}
async function getPetArenaBattle(db, battleId) { return db.prepare(`SELECT * FROM telegram_pet_arena_battles WHERE battle_id = ? LIMIT 1`).bind(String(battleId || '')).first(); }
async function hasActivePetArenaBattle(db, chatId, telegramId) {
  const row = await db.prepare(`SELECT battle_id FROM telegram_pet_arena_battles WHERE chat_id = ? AND status IN ('readying', 'active') AND (player1_telegram_id = ? OR player2_telegram_id = ?) LIMIT 1`).bind(String(chatId), String(telegramId), String(telegramId)).first();
  return Boolean(row?.battle_id);
}
async function getPetArenaBattleForPlayer(db, chatId, telegramId) {
  await db.prepare(`UPDATE telegram_pet_arena_battles SET status='expired', completed_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND status IN ('readying','active') AND COALESCE(expires_at, created_at) < ?`)
    .bind(String(chatId), new Date().toISOString()).run();
  return db.prepare(`SELECT * FROM telegram_pet_arena_battles
    WHERE chat_id=? AND status IN ('readying','active') AND (player1_telegram_id=? OR player2_telegram_id=?)
    ORDER BY created_at DESC LIMIT 1`).bind(String(chatId), String(telegramId), String(telegramId)).first();
}
async function getPetArenaQueueState(db, chatId, telegramId) {
  await db.prepare(`UPDATE telegram_pet_arena_queue SET status='expired', updated_at=CURRENT_TIMESTAMP
    WHERE chat_id=? AND status='waiting' AND updated_at < datetime('now', ?)`)
    .bind(String(chatId), `-${PET_ARENA_QUEUE_TTL_MINUTES} minutes`).run();
  const row = await db.prepare(`SELECT rank_bucket, accept_any_rank, created_at FROM telegram_pet_arena_queue
    WHERE chat_id=? AND telegram_id=? AND status='waiting' LIMIT 1`)
    .bind(String(chatId), String(telegramId)).first();
  if (!row) return null;
  const position = await db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_arena_queue
    WHERE chat_id=? AND status='waiting' AND created_at <= ?`).bind(String(chatId), row.created_at).first();
  return { waiting: true, rank_bucket: row.rank_bucket, accept_any_rank: Boolean(row.accept_any_rank), position: Math.max(1, Number(position?.count || 1)) };
}
async function queuePetArenaMiniApp(db, telegramId, acceptAnyRank = false) {
  const eligible = await ensurePetArenaEligible(db, telegramId);
  if (!eligible.ok) return { accepted: false, reason: eligible.reason };
  const active = await getPetArenaBattleForPlayer(db, PET_MINI_APP_ARENA_LOBBY, telegramId)
    || await getPetArenaBattleForPlayer(db, `mini:${telegramId}`, telegramId);
  if (active) return { accepted: true, reason: 'arena_match_active', battle: active };
  const pet = eligible.pet;
  const sourceAuthority = activePetRewardAuthority(pet);
  if (!sourceAuthority) return { accepted: false, reason: 'source_pet_authority_required' };
  const bucket = getPetArenaRankBucket(getPetLevel(pet.pet_xp));
  await db.prepare(`INSERT INTO telegram_pet_arena_queue
    (id,chat_id,telegram_id,pet_id,season_key,rank_bucket,pet_snapshot_json,status,accept_any_rank)
    VALUES (?,?,?,?,?,?,?,'waiting',?)
    ON CONFLICT(chat_id,telegram_id) WHERE status='waiting' DO UPDATE SET
      pet_id=excluded.pet_id, season_key=excluded.season_key,
      rank_bucket=excluded.rank_bucket, pet_snapshot_json=excluded.pet_snapshot_json,
      accept_any_rank=MAX(telegram_pet_arena_queue.accept_any_rank, excluded.accept_any_rank), updated_at=CURRENT_TIMESTAMP`)
    .bind(crypto.randomUUID(), PET_MINI_APP_ARENA_LOBBY, String(telegramId), sourceAuthority.pet_id, sourceAuthority.season_key, bucket, JSON.stringify(buildPetArenaSnapshot(pet)), acceptAnyRank ? 1 : 0).run();
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
      `-${PET_ARENA_ANY_RANK_TIMEOUT_MINUTES} minutes`, bucket, lower, upper).all();
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
    await db.prepare(`UPDATE telegram_pet_arena_queue SET status=CASE WHEN EXISTS (
        SELECT 1 FROM telegram_pet_arena_battles b WHERE b.status IN ('readying','active')
          AND b.chat_id=telegram_pet_arena_queue.chat_id
          AND (b.player1_telegram_id=telegram_pet_arena_queue.telegram_id OR b.player2_telegram_id=telegram_pet_arena_queue.telegram_id)
      ) THEN 'matched' ELSE 'waiting' END, updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='matched' AND updated_at=?`).bind(PET_MINI_APP_ARENA_LOBBY, claimToken).run().catch(() => {});
    return { accepted: true, reason: 'arena_queued', queue: await getPetArenaQueueState(db, PET_MINI_APP_ARENA_LOBBY, telegramId) };
  }
  try {
    const opponentPet = {
      ...safeParsePetArenaSnapshot(opponent.pet_snapshot_json),
      pet_id: opponent.pet_id,
      season_key: opponent.season_key,
    };
    const battle = await createPetArenaBattle(db, PET_MINI_APP_ARENA_LOBBY, pet, opponentPet, 'group');
    await db.prepare(`UPDATE telegram_pet_arena_queue SET updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status='matched' AND updated_at=?`).bind(PET_MINI_APP_ARENA_LOBBY, claimToken).run();
    return { accepted: true, reason: 'arena_match_found', battle };
  } catch (error) {
    await db.prepare(`UPDATE telegram_pet_arena_queue SET status=CASE WHEN EXISTS (
        SELECT 1 FROM telegram_pet_arena_battles b WHERE b.status IN ('readying','active')
          AND b.chat_id=telegram_pet_arena_queue.chat_id
          AND (b.player1_telegram_id=telegram_pet_arena_queue.telegram_id OR b.player2_telegram_id=telegram_pet_arena_queue.telegram_id)
      ) THEN 'matched' ELSE 'waiting' END, updated_at=CURRENT_TIMESTAMP
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
  const p1Authority = activePetRewardAuthority(p1);
  const p2Authority = mode === 'app' ? null : activePetRewardAuthority(p2);
  if (!p1Authority || (mode !== 'app' && !p2Authority)) return null;
  const values = [
    crypto.randomUUID(), battleId, String(chatId), String(p1.telegram_id), mode === 'app' ? 'app' : String(p2.telegram_id),
    p1Authority.pet_id, p1Authority.season_key, p2Authority?.pet_id || null, p2Authority?.season_key || null,
    JSON.stringify(buildPetArenaSnapshot(p1)), JSON.stringify(buildPetArenaSnapshot(p2)), p1p, p2p, status, mode, 1, PET_ARENA_MAX_ROUNDS, PET_ARENA_MAX_HP, PET_ARENA_MAX_HP, 0, 0, petArenaExpiryTimestamp(), mode === 'app' ? now : null, mode === 'app' ? now : null,
  ];
  const columns = '(id,battle_id,chat_id,player1_telegram_id,player2_telegram_id,player1_pet_id,player1_season_key,player2_pet_id,player2_season_key,player1_pet_snapshot_json,player2_pet_snapshot_json,player1_power,player2_power,status,result,current_round,max_rounds,player1_hp,player2_hp,player1_special,player2_special,expires_at,player1_ready_at,player2_ready_at)';
  const inserted = options.mini_app_solo_guard
    ? await db.prepare(`INSERT INTO telegram_pet_arena_battles ${columns}
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE NOT EXISTS (
          SELECT 1 FROM telegram_pet_arena_queue
          WHERE chat_id=? AND telegram_id=?
            AND (status='waiting' OR updated_at LIKE 'claim:%')
        )`).bind(...values, PET_MINI_APP_ARENA_LOBBY, String(p1.telegram_id)).run()
    : await db.prepare(`INSERT INTO telegram_pet_arena_battles ${columns} VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
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
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_arena_rounds (id,battle_id,round_number,status) VALUES (?,?,?,'selecting')`).bind(crypto.randomUUID(), String(battleId), Number(roundNumber || 1)).run();
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
function petArenaResult(battle) {
  if (['player1_win','player2_win','draw'].includes(String(battle.result || ''))) return battle.result;
  const p1 = Number(battle.player1_hp ?? PET_ARENA_MAX_HP), p2 = Number(battle.player2_hp ?? PET_ARENA_MAX_HP);
  return p1 === p2 ? 'draw' : p1 > p2 ? 'player1_win' : 'player2_win';
}
async function awardPetArenaParticipant(db, battle, telegramId) {
  const result = petArenaResult(battle);
  const won = String(telegramId) === String(result === 'player1_win' ? battle.player1_telegram_id : battle.player2_telegram_id);
  const baseRewards = result === 'draw' ? { pet_xp: 18, community_xp: 3, moon_gold: 8 }
    : won ? { pet_xp: 34, community_xp: 7, moon_gold: 20 } : { pet_xp: 10, community_xp: 0, moon_gold: 3 };
  const scaled = scalePetArenaRewardsForPlayer(battle, result, String(telegramId), baseRewards);
  const faction = await db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id=?').bind(String(telegramId)).first();
  const adjusted = applyPetFactionBonus(scaled.rewards, faction?.faction, 'arena');
  const award = await awardPetKaijuPlayerResult(db, String(telegramId), {
    ...battle, match_id: battle.battle_id, mode: 'pet_arena', reward_modifier: scaled.modifier, faction_bonus: adjusted.bonus,
  }, result === 'draw' ? 'arena_draw' : won ? 'arena_win' : 'arena_loss', adjusted.rewards);
  if (!award.accepted) throw new Error(award.reason || 'arena_reward_pending');
  await reconcileSanctuaryBestEffort(db, String(telegramId), 'arena_terminal');
  return { ...scaled, rewards: adjusted.rewards, faction_bonus: adjusted.bonus };
}
async function completePetArenaBattle(db, battle, newlyCompleted = false) {
  const result = petArenaResult(battle);
  const winner = result === 'draw' ? null : result === 'player1_win' ? battle.player1_telegram_id : battle.player2_telegram_id;
  // Persist the ending and its outcome together before delivering either award.
  const claim = await db.prepare(`UPDATE telegram_pet_arena_battles SET status='completed', completed_at=CURRENT_TIMESTAMP,
    winner_telegram_id=?, result=? WHERE battle_id=? AND status IN ('readying','active')`)
    .bind(winner, result, battle.battle_id).run();
  const saved = await getPetArenaBattle(db, battle.battle_id);
  if (saved?.status !== 'completed') return { accepted:false, reason:'battle_not_active', battle:saved };
  const duplicateCompletion = !newlyCompleted && Number(claim?.meta?.changes || 0) === 0;
  const player1 = await awardPetArenaParticipant(db, saved, saved.player1_telegram_id);
  const player2 = saved.player2_telegram_id && saved.player2_telegram_id !== '�my��$z{-���jםeId,
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
const TELEGRAM_GAMES_MENU_URL = `${SITE_URL}/games/telegram/?v=20260903-games-shell-v8`;
const TELEGRAM_GAMES_MENU_TEXT = 'Games';
const MOONPET_MINI_APP_URL = `${SITE_URL}/moonpet-game.html?v=20260930-state-retry-v1`;
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
        : item.owned && item.unlocked
          ? `Equip free ${item.title}`
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

const TELEGRAM_PET_GUIDANCE_RETRY_COPY = 'Live recommendations are temporarily unavailable. The saved result above remains authoritative.';

async function sendTelegramPetReply(botToken, chatId, text, extra = {}, mediaKey = null, guidance = null) {
  let guidedReply = null;
  if (guidance?.db && guidance?.telegram_id && guidance?.pet) {
    try {
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
    } catch (error) {
      logApiFailure('telegram_pet_guidance_read_failed', {
        telegramId: String(guidance.telegram_id),
        message: error?.message || String(error),
      });
      text = `${text}\n\n<i>${TELEGRAM_PET_GUIDANCE_RETRY_COPY}</i>`;
    }
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
  cmdPetRename,
  PET_ACTIONS,
  PET_SPECIAL_ACTION_POLICIES,
  normalizePetCooldownWindow,
  buildPetCooldownFromSeconds,
  buildPetMiniAppCooldownSummary,
  getPetSpecialActionCooldownEntries,
  getPetSpecialActionCooldownEntriesFromState,
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
  buildMoonpetIdentityAuthorityAudit,
  buildMoonpetReaction,
  calculatePetWeeklyBossDamage,
  getPetEvolutionPerk,
  getPetWeeklyBoss,
  syncPetAchievements,
  syncPetAchievementsForPet,
  processPetWeeklyBoss,
  claimPetWeeklyBossReward,
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
  cmdPetKaiju,
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
  recoverPetStandardRunEndings,
  processPetRunStep,
  serializePetRun,
  serializePetRunChoicePreview,
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
  buildPetMiniAppFutureSystemState,
  buildPetMiniAppCapabilities,
  buildPetMiniAppState,
  hasCompletedPetMiniAppSeasonPet,
  getPetMiniAppCombatEligibility,
  getPetGuidanceFeatures,
  DAILY_JOURNEY_REQUIRED_OBJECTIVES,
  WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
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
  buildPetMiniAppLeaderboard,
  formatPetStatus,
  formatPetDetails,
  getPetEvolutionGuidance,
  buildPetGuidanceState,
  readTelegramPetPresentation,
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
  buildPetActivityOptions,
  buildPetActivitySummary,
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
      const callbackLifecycle = await getMoonpetLifecycle(db, telegramId);
      if (callbackLifecycle?.phase === 'egg') {
        await answerTelegramCallback(tok, query.id, 'Complete EGGYONE BREAKOUT first');
        await sendTelegramMessage(tok, chatId, 'Your Secret Bot must be cared for and complete BREAKOUT in the Moonpet Mini App before gameplay unlocks.');
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
      if (payload === 'expedition:go' || payload.startsWith('expedition:go:')) { await answerTelegramCallback(tok, query.id, 'Start expedition'); await cmdPetExpedition(db, tok, chatId, telegramId, true, eventKey, payload.slice('expedition:go:'.length)); return; }
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

  if (String(chatType) === 'private' && telegramId) {
    await setDefaultTelegramGamesMenuButton(tok, telegramId);
  }

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
    const lifecycle = await getMoonpetLifecycle(db, telegramId);
    if (lifecycle?.phase === 'egg') {
      await sendTelegramMessage(tok, chatId, 'Your Secret Bot must be cared for and complete BREAKOUT in the Moonpet Mini App before gameplay unlocks.');
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
const PET_MINI_APP_FOCUSES = new Set(['contracts', 'play-now', 'practice', 'daily-journey', 'weekly-journey', 'daily-objectives', 'recommended', 'vitals', 'care', 'details', 'missions', 'achievements', 'districts', 'moon-run', 'adventure', 'street-event', 'weekly-boss', 'story-chains', 'seasonal-boss', 'arena', 'kaiju', 'timed-activity', 'jobs', 'equipment', 'materials', 'crafting', 'relics', 'bounties', 'expedition', 'market', 'shop', 'style-lab', 'inventory', 'trade', 'rare-morph', 'memories', 'callsign', 'evolution', 'faction', 'prestige', 'tracks', 'features', 'alerts', 'season', 'leaderboard']);
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
  if (/^(prestige)/.test(payload)) return 'tracks';
  if (/^(progress)/.test(payload)) return 'tracks';
  return '';
}

async function setDefaultTelegramGamesMenuButton(botToken, telegramId) {
  if (!botToken || !telegramId) return;
  await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      menu_button: { type: 'web_app', text: TELEGRAM_GAMES_MENU_TEXT, web_app: { url: TELEGRAM_GAMES_MENU_URL } },
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
  if (String(chatType) === 'private') await setDefaultTelegramGamesMenuButton(botToken, telegramId);
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
    `• Pet care, progression, jobs, economy, runs, bosses, alerts and leaderboards run inside Moonpet OS. Arena and Kaiju unlock only after you complete a Season pet and your active Moonpet has hatched; locked players see future panels and stale-state cleanup only.\n` +
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
  const stage = p.stage || 'Secret Bot';
  const traits = Array.isArray(identity?.personalities) ? identity.personalities.slice(0, 2) : [];
  const favourite = String(identity?.memories?.favourite_activity || '').trim();
  const needsCare = p.health <= 45 || p.hunger >= 75 || p.cleanliness <= 35 || p.happiness <= 35 || p.energy <= 25;
  const identityLines = [];
  const visibleLevel = getPetLevel(p.pet_xp);
  if (reaction !== null) identityLines.push(`<i>“${escapeHtml(reaction === undefined ? buildMoonpetReaction('status', identity || {}, { pet: p }) : reaction)}”</i>`);
  if (traits.length) identityLines.push(`<b>Personality:</b> ${traits.map((trait) => escapeHtml(trait.name)).join(' · ')}`);
  if (favourite) identityLines.push(`<b>Favourite:</b> ${escapeHtml(favourite)}`);
  if (identity?.memories?.first_boss_id) identityLines.push(`<b>Remembers:</b> first defeating ${escapeHtml(String(identity.memories.first_boss_id).replaceAll('_', ' '))}`);
  return [
    `🌕 <b>${escapeHtml(p.display_name || 'UNKNOWN')}</b>`,
    '',
    `<b>${escapeHtml(stage)}</b>`,
    `Level ${visibleLevel} | XP ${p.pet_xp} | ${getPetXpToNextVisibleLevel(p.pet_xp)} XP to next level`,
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

async function getMoonpetIdentityWithLifecycle(db, telegramId, { required = false } = {}) {
  // Guidance is authoritative display state. Optional reaction text may still
  // use its existing fallback, but cannot turn a failed read into game progress.
  const read = promise => required ? promise : promise.catch(() => null);
  const [identity, lifecycle] = await Promise.all([
    read(getMoonpetIdentitySummary(db, telegramId)),
    read(getExistingMoonpetLifecycle(db, telegramId)),
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
  const stage = p.stage || 'Secret Bot';
  const visibleLevel = getPetLevel(p.pet_xp);
  const xpToNextVisibleLevel = getPetXpToNextVisibleLevel(p.pet_xp);
  const levelProgressLine = visibleLevel >= PET_VISIBLE_LEVEL_CURVE.max_level || xpToNextVisibleLevel === 0
    ? `📈 Level ${formatPetDisplayNumber(PET_VISIBLE_LEVEL_CURVE.max_level)} cap reached`
    : `📈 ${formatPetDisplayNumber(xpToNextVisibleLevel)} XP to Level ${formatPetDisplayNumber(visibleLevel + 1)}`;
  return [
    `📋 <b>${escapeHtml(p.display_name || 'UNKNOWN')} Details</b>`,
    `${getPetStageIcon(stage)} <b>${escapeHtml(stage)}</b>`,
    `⭐ Level ${formatPetDisplayNumber(visibleLevel)} · ✨ ${formatPetDisplayNumber(p.pet_xp)} XP`,
    levelProgressLine,
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
      .bind(telegramId).all().then(requirePetReadResult),
    db.prepare(`SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id = ? AND quantity > 0`)
      .bind(telegramId).all().then(requirePetReadResult),
    identity?.scope?.pet_id
      ? db.prepare(`SELECT boss_id, victories FROM telegram_pet_boss_victories
          WHERE pet_id = ? AND telegram_id = ? AND season_key = ?`)
        .bind(identity.scope.pet_id, telegramId, identity.scope.season_key).all().then(requirePetReadResult)
      : Promise.resolve({ results: [] }),
    db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id = ?`)
      .bind(telegramId).first().then(requirePetFirstReadResult),
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

function getPetGuidanceFeatures(level, combatEligibility = {}) {
  const arenaUnlocked = combatEligibility.arena_unlocked === true;
  const kaijuUnlocked = combatEligibility.kaiju_unlocked === true;
  const weeklyBossUnlocked = combatEligibility.weekly_boss_unlocked === true;
  const combatLockDetail = combatEligibility.reason === 'combat_unlocked'
    ? ''
    : combatEligibility.reason === 'moon_egg_must_hatch'
      ? 'Requires a hatched active Moonpet.'
      : combatEligibility.reason === 'moonpet_lifecycle_required'
        ? 'Requires a synced active Moonpet lifecycle before combat unlocks.'
        : 'Requires an adopted active Moonpet.';
  const arenaLockDetail = combatEligibility.arena_reason === 'arena_level_locked'
    ? `Requires Level ${PET_ARENA_MIN_LEVEL}.`
    : combatLockDetail;
  const kaijuLockDetail = combatEligibility.kaiju_reason === 'combat_unlocked'
    ? ''
    : combatLockDetail;
  return [
    { key: 'care_console', title: 'Care Console', available: level >= 1, detail: 'Feed, play, clean, sleep, train, boost energy, dance and cuddle from the Pet screen.', callback_data: 'pet:details' },
    { key: 'daily_missions', title: 'Daily Missions', available: level >= 1, detail: 'Seven tracked goals reset at 00:00 UTC.', callback_data: 'pet:missions' },
    { key: 'timed_activities', title: 'Timed Activities', available: level >= 1, detail: 'Sleep, train, work or explore while rewards build over time.', callback_data: 'pet:activity' },
    { key: 'moon_runs', title: 'Moon Runs', available: level >= 1, detail: 'Choose routes, risk unbanked rewards and extract before defeat.', callback_data: 'pet:run' },
    { key: 'street_events', title: 'Street Events', available: level >= 1, detail: 'Server-selected encounters change with your choices.', callback_data: 'pet:event' },
    { key: 'kaiju_cards', title: 'Kaiju Code Cards', available: level >= 1 && kaijuUnlocked, detail: kaijuUnlocked ? 'Battle a CRT rival or match with another player.' : kaijuLockDetail, callback_data: 'pet:kaiju' },
    { key: 'weekly_boss', title: 'Weekly Boss', available: weeklyBossUnlocked, detail: weeklyBossUnlocked ? 'One personal boss attack is available per UTC day.' : (combatEligibility.weekly_boss_reason === 'boss_level_locked' ? `Requires Level ${PET_WEEKLY_BOSS_MIN_LEVEL}.` : combatLockDetail), callback_data: 'pet:boss' },
    { key: 'pet_arena', title: 'Pet Arena', available: level >= PET_ARENA_MIN_LEVEL && arenaUnlocked, detail: arenaUnlocked ? `Arena battles are available from Level ${PET_ARENA_MIN_LEVEL}.` : arenaLockDetail, callback_data: 'pet:arena' },
    { key: 'moon_economy', title: 'Moon Economy', available: level >= 1, detail: 'Daily bounties, Crystal Expeditions and rotating Moon Market offers are now available.', callback_data: 'pet:economy' },
    { key: 'equipment_upgrades', title: 'Equipment Upgrades', available: level >= 15, detail: 'Owned equipment can now be upgraded through ten levels.', callback_data: 'pet:gear' },
    { key: 'prestige', title: 'Prestige', available: false, detail: 'Future expansion content. Not available yet.', callback_data: 'pet:progress' },
  ];
}

function canAffordPetWallet(pet, cost = {}) {
  return ['moon_gold', 'moon_crystals', 'style_tokens'].every((key) =>
    Math.max(0, Number(pet?.[key]) || 0) >= Math.max(0, Number(cost?.[key]) || 0));
}

async function getPetEconomyState(db, telegramId, petRaw = null, now = new Date()) {
  const pet = serializePet(petRaw || await getPetProfile(db, telegramId));
  if (!pet) return null;
  const dayKey = getPetDayKey(now);
  const level = getPetLevel(pet.pet_xp);
  await reconcileLegacyPetInventory(db, telegramId);
  const [eventRows, claimRows, sourcePet, itemRows, materialRows] = await Promise.all([
    db.prepare(`SELECT event_type, COUNT(*) AS total FROM telegram_pet_events
      WHERE telegram_id = ? AND day_key = ? AND status = 'accepted' GROUP BY event_type`)
      .bind(telegramId, dayKey).all().then(requirePetReadResult),
    db.prepare(`SELECT source, idempotency_key, pet_id, metadata, applied_rewards FROM telegram_pet_reward_claims
      WHERE telegram_id = ? AND day_key = ? AND status = 'awarded'
        AND source IN ('pet_bounty', 'pet_expedition', 'pet_market')`)
      .bind(telegramId, dayKey).all().then(requirePetReadResult),
    db.prepare(`SELECT p.status,l.phase FROM telegram_pet_instances p JOIN telegram_pet_lifecycle_by_pet l
      ON l.pet_id=p.pet_id AND l.telegram_id=p.telegram_id WHERE p.pet_id=? AND p.telegram_id=?`)
      .bind(pet.pet_id, telegramId).first().then(requirePetFirstReadResult),
    db.prepare("SELECT asset_key,quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item'").bind(telegramId).all().then(requirePetReadResult),
    db.prepare('SELECT material_key,quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all().then(requirePetReadResult),
  ]);
  const counts = new Map((eventRows.results || []).map((row) => [String(row.event_type), Math.max(0, Number(row.total) || 0)]));
  const claims = claimRows.results || [];
  const claimedKeys = new Set(claims.map((row) => `${row.source}:${row.idempotency_key}`));
  const bounties = getPetDailyBounties(dayKey).map((bounty) => {
    const progress = bounty.event_types.reduce((sum, eventType) => sum + (counts.get(eventType) || 0), 0);
    return { ...bounty, progress: Math.min(bounty.required, progress), complete: progress >= bounty.required,
      claimed: claimedKeys.has(`pet_bounty:${dayKey}:${bounty.key}`) };
  });
  const itemBalances = Object.fromEntries((itemRows.results || []).map((row) => [row.asset_key, row.quantity]));
  const materialBalances = Object.fromEntries((materialRows.results || []).map((row) => [row.material_key, row.quantity]));
  const marketOffers = getPetMarketOffers(dayKey).map((offer) => {
    const capacity = getPetMarketCapacity(offer, pet, itemBalances, materialBalances);
    const unlocked = level >= offer.min_level, affordable = unlocked && canAffordPetWallet(pet, offer.cost);
    const purchased = claimedKeys.has(`pet_market:${dayKey}:${offer.key}`);
    return { ...offer, unlocked, affordable, purchased, capacity,
      available: sourcePet?.status === 'active' && sourcePet?.phase !== 'egg' && Boolean(sourcePet)
        && unlocked && affordable && !purchased && capacity.available };
  });
  const expeditionAttempts = claims.filter((row) => row.source === 'pet_expedition').length;
  const expedition = getPetExpedition(level);
  const attemptsLeft = Math.max(0, 3 - expeditionAttempts);
  const state = {
    day_key: dayKey,
    pet,
    routes: PET_ECONOMY_ROUTES,
    bounties,
    market_offers: marketOffers,
    expedition,
    expedition_attempts: expeditionAttempts,
    expedition_attempts_left: attemptsLeft,
    expedition_cooldown: attemptsLeft ? null : normalizePetCooldownWindow(getNextPetUtcDayResetAt(now), now),
    expedition_options: PET_EXPEDITION_TIERS.map((entry) => ({ ...entry,
      unlocked: level >= entry.min_level, affordable: Number(pet.energy) >= entry.energy,
      available: sourcePet?.status === 'active' && sourcePet?.phase !== 'egg'
        && level >= entry.min_level && Number(pet.energy) >= entry.energy && attemptsLeft > 0,
    })),
    expedition_history: claims.filter((row) => row.source === 'pet_expedition').map((row) => {
      const context = safeJsonParse(row.metadata, {}).context || {};
      const destination = PET_EXPEDITION_TIERS.find((entry) => entry.key === context.expedition_key);
      return { pet_id: row.pet_id, attempt: context.attempt, title: destination?.title || 'Expedition',
        energy_cost: context.energy_cost, rewards: safeJsonParse(row.applied_rewards, {}) };
    }).sort((a, b) => Number(a.attempt) - Number(b.attempt)),
  };
  return { ...state, guidance_actions: buildPetEconomyGuidanceActions(state) };
}

async function claimPetEconomyBounty(db, telegramId, bountyKey, now = new Date()) {
  const state = await getPetEconomyState(db, telegramId, null, now);
  if (!state) return { accepted: false, reason: 'pet_not_adopted' };
  const sourceAuthority = activePetRewardAuthority(state.pet);
  if (!sourceAuthority) return { accepted: false, reason: 'source_pet_authority_required' };
  const bounty = state.bounties.find((entry) => entry.key === String(bountyKey || ''));
  if (!bounty) return { accepted: false, reason: 'bounty_not_available', state };
  if (!bounty.complete) return { accepted: false, reason: 'bounty_incomplete', bounty, state };
  const awarded = await awardPetReward(db, {
    ...sourceAuthority, telegram_id: telegramId, source: 'pet_bounty', idempotency_key: `${state.day_key}:${bounty.key}`,
    event_key: `pet:economy:bounty:${telegramId}:${state.day_key}:${bounty.key}`,
    event_type: 'economy_bounty', reason: bounty.key, rewards: bounty.reward, touch_streak: true, now,
    context: { bounty_key: bounty.key, verified_progress: bounty.progress },
  });
  return { ...awarded, reason: awarded.accepted ? 'bounty_claimed' : awarded.reason, bounty };
}

async function readPetExpeditionReceipt(db, telegramId, key) {
  if (!key) return null;
  const receipt = await db.prepare(`SELECT pet_id, day_key, metadata, applied_rewards FROM telegram_pet_reward_claims
    WHERE telegram_id=? AND source='pet_expedition' AND idempotency_key=? AND status='awarded'`)
    .bind(telegramId, key).first().then(requirePetFirstReadResult);
  if (!receipt) return null;
  const context = safeJsonParse(receipt.metadata, {}).context || {};
  return { accepted: true, duplicate: true, reason: 'expedition_complete', pet_xp_awarded: 0, xp_awarded: 0, rewards: {},
    attempt: context.attempt, expedition: PET_EXPEDITION_TIERS.find((entry) => entry.key === context.expedition_key) || null,
    receipt: { pet_id: receipt.pet_id, day_key: receipt.day_key, energy_cost: context.energy_cost, rewards: safeJsonParse(receipt.applied_rewards, {}) } };
}

async function runPetCrystalExpedition(db, telegramId, now = new Date(), requestKey = '', expeditionKey = '', expectedPetId = '') {
  const requestedKey = String(requestKey || '').slice(0, 120);
  const duplicate = await readPetExpeditionReceipt(db, telegramId, requestedKey);
  if (duplicate) return duplicate;
  const state = await getPetEconomyState(db, telegramId, null, now);
  if (!state) return { accepted: false, reason: 'pet_not_adopted' };
  const sourceAuthority = activePetRewardAuthority(state.pet);
  if (!sourceAuthority) return { accepted: false, reason: 'source_pet_authority_required' };
  if (expectedPetId && expectedPetId !== sourceAuthority.pet_id) return { accepted: false, reason: 'expedition_pet_changed' };
  const lifecycle = await db.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND telegram_id=?')
    .bind(sourceAuthority.pet_id, telegramId).first().then(requirePetFirstReadResult);
  if (!lifecycle || lifecycle.phase === 'egg') return { accepted: false, reason: 'moon_egg_must_hatch' };
  if (!state.expedition_attempts_left) return { accepted: false, reason: 'expedition_daily_limit', state };
  const attempt = state.expedition_attempts + 1;
  const level = getPetLevel(state.pet.pet_xp);
  const resolved = resolvePetExpeditionReward(state.day_key, telegramId, attempt, level, expeditionKey);
  if (!resolved) return { accepted: false, reason: 'expedition_locked', state };
  if (Number(state.pet.energy || 0) < resolved.expedition.energy) return { accepted: false, reason: 'pet_tired', expedition: resolved.expedition, state };
  const settlementKey = requestedKey || `${state.day_key}:${attempt}`;
  const awarded = await awardPetReward(db, {
    telegram_id: telegramId, source: 'pet_expedition', idempotency_key: settlementKey,
    pet_id: sourceAuthority.pet_id, season_key: sourceAuthority.season_key,
    event_key: `pet:economy:expedition:${telegramId}:${settlementKey}`.slice(0, 220),
    event_type: 'economy_expedition', reason: resolved.expedition.key, rewards: { ...resolved.reward, pet_xp: 12 },
    profile_deltas: { energy: -resolved.expedition.energy }, touch_streak: true, now,
    context: { expedition_key: resolved.expedition.key, attempt, day_key: state.day_key, energy_cost: resolved.expedition.energy, min_level: resolved.expedition.min_level },
  });
  if (awarded.duplicate) return await readPetExpeditionReceipt(db, telegramId, settlementKey) || awarded;
  if (!awarded.accepted && awarded.reason === 'reward_not_authorized') {
    const refreshed = await getPetEconomyState(db, telegramId, null, now);
    const sourcePet = await getPetInstanceWithAtomicDecay(db, sourceAuthority.pet_id);
    return { ...awarded, reason: !refreshed ? 'pet_not_adopted' : !refreshed.expedition_attempts_left ? 'expedition_daily_limit'
      : Number(sourcePet?.energy || 0) < resolved.expedition.energy ? 'pet_tired' : 'expedition_state_changed',
    expedition: resolved.expedition, state: refreshed };
  }
  return { ...awarded, reason: awarded.accepted ? 'expedition_complete' : awarded.reason, attempt, expedition: resolved.expedition };
}

async function buyPetMarketOffer(db, telegramId, offerKey, now = new Date()) {
  const state = await getPetEconomyState(db, telegramId, null, now);
  if (!state) return { accepted: false, reason: 'pet_not_adopted' };
  const offer = state.market_offers.find((entry) => entry.key === String(offerKey || ''));
  if (!offer) return { accepted: false, reason: 'market_offer_not_available', state };
  if (offer.purchased) return { accepted: true, duplicate: true, reason: 'market_offer_sold', offer, state };
  if (!offer.unlocked) return { accepted: false, reason: 'market_offer_locked', offer, state };
  if (!offer.capacity.available) return { accepted: false, reason: 'market_capacity_full', offer, state };
  if (!offer.affordable) return { accepted: false, reason: 'not_enough_pet_currency', offer, state };
  if (!offer.available) return { accepted: false, reason: 'market_pet_unavailable', offer, state };
  const awarded = await awardPetReward(db, {
    pet_id: state.pet.pet_id, season_key: state.pet.season_key,
    telegram_id: telegramId, source: 'pet_market', idempotency_key: `${state.day_key}:${offer.key}`,
    event_key: `pet:economy:market:${telegramId}:${state.day_key}:${offer.key}`,
    event_type: 'economy_market', reason: offer.key, rewards: offer.reward, currency_costs: offer.cost,
    touch_streak: false, now, context: { offer_key: offer.key, pet_id: state.pet.pet_id, season_key: state.pet.season_key, min_level: offer.min_level },
  });
  if (!awarded.accepted && awarded.reason === 'reward_not_authorized') {
    const refreshed = await getPetEconomyState(db, telegramId, null, now);
    const current = refreshed?.market_offers.find((entry) => entry.key === offer.key);
    return { ...awarded, reason: current?.capacity.available === false ? 'market_capacity_full' : 'market_state_changed', offer: current || offer };
  }
  return { ...awarded, reason: awarded.accepted ? 'market_purchase' : awarded.reason, offer };
}

async function getPendingPetWeeklyBossRewards(db, telegramId) {
  // A failed claim-list read must retain the last valid UI through refresh retry,
  // not hide an earned payout behind a successful empty list.
  const rows = await db.prepare(`SELECT v.pet_id, v.season_key, v.week_key, v.boss_id
    FROM telegram_pet_weekly_boss_victories_by_pet v
    JOIN telegram_pet_weekly_boss_progress p ON p.telegram_id=v.telegram_id AND p.week_key=v.week_key AND p.boss_id=v.boss_id
    JOIN telegram_pet_instances i ON i.pet_id=v.pet_id AND i.telegram_id=v.telegram_id AND i.season_key=v.season_key
    WHERE v.telegram_id=? AND p.defeated_at IS NOT NULL AND p.reward_claimed_at IS NULL
    ORDER BY v.defeated_at LIMIT 10`).bind(telegramId).all();
  if (rows?.success === false || !Array.isArray(rows?.results)) {
    throw new Error('weekly_reward_list_unavailable');
  }
  return rows.results.filter((row) => getPetWeeklyBoss(row.week_key).boss_id === row.boss_id)
    .map((row) => ({ ...row, title: getPetWeeklyBoss(row.week_key).title, reward: getPetWeeklyBoss(row.week_key).reward }));
}

async function buildPetGuidanceState(db, telegramId, petRaw = null, options = {}) {
  let sourcePet = petRaw || await getPetProfile(db, telegramId, true);
  if (sourcePet && !sourcePet.owned_equipment) sourcePet = await withPetEquipmentProgression(db, sourcePet, true);
  const pet = serializePet(sourcePet);
  if (!pet) return null;
  const now = new Date();
  const dayKey = getPetDayKey(now);
  const weekKey = getPetWeekKey(now);
  const identityPromise = Object.hasOwn(options, 'identity')
    ? Promise.resolve(options.identity)
    : getMoonpetIdentityWithLifecycle(db, telegramId, { required: true });
  const runtimePromise = Object.hasOwn(options, 'runtime')
    ? Promise.resolve(options.runtime)
    : getOrCreatePetRuntimeState(db, telegramId, dayKey, activePetRewardAuthority(sourcePet));
  const [identity, activity, activeRun, missions, seasonState, achievements, weeklyProgress, weeklyAttempt, runtime, specialActions, weeklyPending, dailyCache, dailyTotals] = await Promise.all([
    identityPromise,
    getActivePetActivitySession(db, telegramId, now).then((active) => active || getRecoverablePetActivitySession(db, telegramId)),
    getActivePetRun(db, telegramId),
    buildPetMissions(db, telegramId, sourcePet),
    getPetSeasonRewardState(db, telegramId, { identity: identityPromise }),
    syncPetAchievements(db, telegramId, true),
    db.prepare(`SELECT boss_id, attempts, damage, defeated_at, reward_claimed_at FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?`)
      .bind(telegramId, weekKey).first().then(requirePetFirstReadResult),
    db.prepare(`SELECT action, damage, event_key FROM telegram_pet_weekly_boss_events WHERE telegram_id = ? AND week_key = ? AND day_key = ?`)
      .bind(telegramId, weekKey, dayKey).first().then(requirePetFirstReadResult),
    runtimePromise,
    getPetSpecialActionGuidanceState(db, telegramId, now),
    getPendingPetWeeklyBossRewards(db, telegramId),
    readAcceptedDailyChestPetEventForDay(db, telegramId, dayKey),
    getPetWindowTotals(db, telegramId, dayKey, weekKey),
  ]);
  Object.assign(pet, serializePet(sourcePet, identity));
  const [evolution, economy] = await Promise.all([
    getPetEvolutionGuidance(db, telegramId, pet, identity),
    getPetEconomyState(db, telegramId, pet, now),
  ]);
  const combatEligibility = await getPetMiniAppCombatEligibility(db, telegramId, identity?.lifecycle);
  const level = getPetLevel(pet.pet_xp);
  const stage = Math.max(0, Number(identity?.current_stage?.stage) || 0);
  const boss = getPetWeeklyBoss(weekKey);
  const weeklyBossDefeated = Boolean(weeklyProgress?.defeated_at);
  const weeklyAttemptCooldown = weeklyAttempt && !weeklyBossDefeated ? normalizePetCooldownWindow(getNextPetUtcDayResetAt(now), now) : null;
  const nextBossWeek = new Date(now);
  nextBossWeek.setUTCDate(nextBossWeek.getUTCDate() + 8 - (nextBossWeek.getUTCDay() || 7));
  nextBossWeek.setUTCHours(0, 0, 0, 0);
  return {
    pet,
    day_key: dayKey,
    week_key: weekKey,
    identity,
    activity: buildPetActivitySummary(activity, now),
    activity_options: buildPetActivityOptions(),
    daily_cache: {
      available: !dailyCache && Boolean(identity?.lifecycle && identity.lifecycle.phase !== 'egg'), claimed: Boolean(dailyCache),
      rewards: { pet_xp: 40, moon_gold: 40, style_tokens: 2 },
      available_pet_xp: Math.min(40, Math.max(0, PETS_DAILY_PET_XP_CAP - dailyTotals.day.pet_xp)),
      receipt: dailyCache ? { pet_id: dailyCache.pet_id, event_key: dailyCache.event_key, pet_xp_awarded: dailyCache.pet_xp_awarded } : null,
      cooldown: normalizePetCooldownWindow(getNextPetUtcDayResetAt(now), now),
    },
    active_run: activeRun,
    missions: missions.daily || [],
    daily_completion: missions.completion || null,
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
      week_key: weekKey,
      boss_id: boss.boss_id,
      title: boss.title,
      hp: boss.hp,
      damage: Math.max(0, Number(weeklyProgress?.damage) || 0),
      remaining_hp: Math.max(0, boss.hp - Math.max(0, Number(weeklyProgress?.damage) || 0)),
      attempts: Math.max(0, Number(weeklyProgress?.attempts) || 0),
      max_attempts: 7,
      weakness: boss.weakness,
      reward: boss.reward,
      min_level: 5,
      energy_cost: 12,
      choices: previewPetWeeklyBossChoices({ boss, level, evolution_stage: stage,
        personality_ids: (identity?.personalities || []).map((trait) => trait.trait_id), health: pet.health, energy: pet.energy }),
      available: level >= 5 && Boolean(identity?.lifecycle && identity.lifecycle.phase !== 'egg') && !weeklyBossDefeated && !weeklyAttempt && Number(pet.energy || 0) >= 12,
      attempt_used: Boolean(weeklyAttempt),
      last_attempt: weeklyAttempt || null,
      pending_rewards: weeklyPending,
      reward_claimed: Boolean(weeklyProgress?.reward_claimed_at),
      rotation_cooldown: normalizePetCooldownWindow(nextBossWeek.toISOString(), now),
      cooldown: weeklyAttemptCooldown,
      expires_at: weeklyAttemptCooldown?.expires_at || null,
      remaining_seconds: weeklyAttemptCooldown?.remaining_seconds || 0,
      defeated: weeklyBossDefeated,
    },
    features: getPetGuidanceFeatures(level, combatEligibility),
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
    shop_items: petShopItemsForPet(sourcePet),
    economy,
    economy_actions: economy?.guidance_actions || [],
    special_actions: specialActions,
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
  // One statement instead of one per candidate; JSON keeps D1's parameter
  // limit independent of the number of unlocks. Existing/shown notices stay put.
  if (candidates.length) await db.prepare(`INSERT OR IGNORE INTO telegram_pet_guidance_notices
    (telegram_id, notice_key, notice_type, title, detail, callback_data)
    SELECT ?, json_extract(value,'$.key'), json_extract(value,'$.type'),
      json_extract(value,'$.title'), json_extract(value,'$.detail'), json_extract(value,'$.callback_data')
    FROM json_each(?)`)
    .bind(telegramId, JSON.stringify(candidates.map(notice => ({
      key: notice.key, type: notice.type, title: String(notice.title).slice(0, 160),
      detail: String(notice.detail || '').slice(0, 500), callback_data: String(notice.callback_data || 'pet:coach').slice(0, 100),
    })))).run();
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

async function syncPetAchievementsForPet(db, telegramId, petIdRaw, seasonKeyRaw, recoverSource = false, requiredReads = recoverSource) {
  // A recovery completion marker requires successful authoritative reads.
  // Required player-facing projections also preserve unavailable vs missing.
  const unavailable = (error) => { if (requiredReads) throw error; return null; };
  const petId = String(petIdRaw || '').trim();
  const seasonKey = String(seasonKeyRaw || '').trim();
  if (!telegramId || !petId || !seasonKey) return [];
  const scope = await db.prepare(`SELECT s.pet_id, s.telegram_id, s.season_key, s.slot_number
    FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i
      ON i.pet_id = s.pet_id
     AND i.telegram_id = s.telegram_id
     AND i.season_key = s.season_key
     AND i.slot_number = s.slot_number
    WHERE s.pet_id = ? AND s.telegram_id = ? AND s.season_key = ?
      AND s.status ${recoverSource ? "IN ('active','archived')" : "= 'active'"}
      AND i.status ${recoverSource ? "IN ('active','archived')" : "= 'active'"}
    LIMIT 1`)
    .bind(petId, telegramId, seasonKey).first().catch(unavailable);
  if (!scope || !scope.pet_id || !scope.telegram_id || !scope.season_key) return [];
  const corruptExisting = await db.prepare(`SELECT 1 AS corrupt FROM telegram_pet_achievements
    WHERE pet_id = ? AND NOT (telegram_id = ? AND season_key = ?) LIMIT 1`)
    .bind(petId, telegramId, seasonKey).first();
  if (corruptExisting) throw new Error('moonpet_achievement_authority_tuple_mismatch');
  const [profile, events, memory, personalities, evolution] = await Promise.all([
    db.prepare(`SELECT 1 AS adopted FROM telegram_pet_profiles WHERE telegram_id = ?`).bind(telegramId).first().catch(unavailable),
    db.prepare(`SELECT
      SUM(CASE WHEN event_type IN ('feed','play','clean','sleep','train') AND status='accepted' THEN 1 ELSE 0 END) AS care_actions,
      SUM(CASE WHEN event_type='random_event' AND status='accepted' THEN 1 ELSE 0 END) AS event_actions,
      SUM(CASE WHEN event_type='work' AND status='accepted' THEN 1 ELSE 0 END) AS job_actions,
      COUNT(DISTINCT CASE WHEN event_type='work' AND status='accepted' THEN reason END) AS distinct_jobs
      FROM telegram_pet_events WHERE telegram_id = ? AND pet_id = ? AND season_key = ?`).bind(telegramId, petId, seasonKey).first().catch(unavailable),
    db.prepare(`SELECT total_runs, total_bosses_defeated FROM telegram_pet_memories
      WHERE pet_id = ? AND telegram_id = ? AND season_key = ?`).bind(petId, telegramId, seasonKey).first().catch(unavailable),
    db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_personality_traits
      WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND unlocked_at IS NOT NULL`).bind(petId, telegramId, seasonKey).first().catch(unavailable),
    db.prepare(`SELECT COALESCE((
      SELECT MAX(e.stage)
      FROM telegram_pet_evolutions_by_pet e
      WHERE e.pet_id = ? AND e.telegram_id = ?
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_instances stale_i
          WHERE stale_i.pet_id = e.pet_id AND stale_i.telegram_id = e.telegram_id AND stale_i.season_key <> ?)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_season_slots stale_s
          WHERE stale_s.pet_id = e.pet_id AND stale_s.telegram_id = e.telegram_id AND stale_s.season_key <> ?)
    ), 0) AS stage`)
      .bind(petId, telegramId, seasonKey, seasonKey).first().catch(unavailable),
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
  const achievements = Object.entries(PET_ACHIEVEMENTS).map(([achievementId, definition]) => ({
    id: achievementId, progress: Math.max(0, Math.floor(values[definition.source] || 0)), target: definition.target,
  }));
  // The conflict guard remains authoritative under concurrent refreshes. Do
  // not rewrite unchanged rows (including updated_at) on every state request.
  await db.prepare(`INSERT INTO telegram_pet_achievements (pet_id, telegram_id, season_key, achievement_id, progress, target, unlocked_at)
    SELECT ?, ?, ?, json_extract(value,'$.id'), json_extract(value,'$.progress'), json_extract(value,'$.target'),
      CASE WHEN json_extract(value,'$.progress') >= json_extract(value,'$.target') THEN CURRENT_TIMESTAMP ELSE NULL END
    FROM json_each(?) WHERE 1
    ON CONFLICT(pet_id, achievement_id) DO UPDATE SET
      progress = MAX(telegram_pet_achievements.progress, excluded.progress), target = excluded.target,
      unlocked_at = COALESCE(telegram_pet_achievements.unlocked_at,
        CASE WHEN MAX(telegram_pet_achievements.progress, excluded.progress) >= excluded.target THEN CURRENT_TIMESTAMP ELSE NULL END),
      updated_at = CURRENT_TIMESTAMP
    WHERE telegram_pet_achievements.pet_id = excluded.pet_id
      AND telegram_pet_achievements.telegram_id = excluded.telegram_id
      AND telegram_pet_achievements.season_key = excluded.season_key
      AND (telegram_pet_achievements.progress < excluded.progress OR telegram_pet_achievements.target <> excluded.target
        OR telegram_pet_achievements.unlocked_at IS NULL AND MAX(telegram_pet_achievements.progress, excluded.progress) >= excluded.target)`)
    .bind(petId, telegramId, seasonKey, JSON.stringify(achievements)).run();
  const rows = await db.prepare(`SELECT achievement_id, progress, target, unlocked_at FROM telegram_pet_achievements
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
    ORDER BY unlocked_at IS NULL, unlocked_at, achievement_id`).bind(petId, telegramId, seasonKey).all().then(requirePetReadResult);
  return (rows.results || []).map((row) => ({ ...row, ...PET_ACHIEVEMENTS[row.achievement_id] }));
}

async function syncActivePetAchievements(db, telegramId, requiredReads = false) {
  const scope = await readActivePetIdentityScope(db, telegramId)
    .catch((error) => { if (requiredReads) throw error; return null; });
  if (!scope?.pet_id || !scope?.season_key) return [];
  return syncPetAchievementsForPet(db, telegramId, scope.pet_id, scope.season_key, false, requiredReads);
}

async function syncPetAchievements(db, telegramId, requiredReads = false) {
  return syncActivePetAchievements(db, telegramId, requiredReads);
}

async function settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progress) {
  if (!progress?.defeated_at) return null;
  const victory = await readWeeklyBossVictoryPetAttribution(db, telegramId, weekKey, boss.boss_id);
  if (!victory) return { accepted: false, reason: 'weekly_boss_pet_authority_missing' };
  const rewardKey = `weekly_boss:${telegramId}:${weekKey}:${boss.boss_id}`;
  const award = await awardPetReward(db, {
    telegram_id: telegramId, pet_id: victory.pet_id, season_key: victory.season_key,
    source: 'pet_weekly_boss', idempotency_key: rewardKey, event_key: rewardKey,
    event_type: 'weekly_boss_reward', reason: boss.boss_id, rewards: boss.reward, touch_streak: true,
    now: new Date(normalizeServerTimestamp(victory.defeated_at)),
    context: { week_key: weekKey, boss_id: boss.boss_id },
  });
  if (award.accepted || award.duplicate) {
    await db.prepare(`UPDATE telegram_pet_weekly_boss_progress SET reward_claimed_at = COALESCE(reward_claimed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND week_key = ? AND defeated_at IS NOT NULL`).bind(telegramId, weekKey).run();
    await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, rewardKey);
  }
  return award;
}

async function claimPetWeeklyBossReward(db, telegramId, request = {}) {
  const weekKey = typeof request.week_key === 'string' ? request.week_key : '';
  if (!/^\d{4}-W\d{2}$/.test(weekKey)) return { accepted: false, reason: 'weekly_boss_reward_not_found' };
  const boss = getPetWeeklyBoss(weekKey);
  if (request.boss_id !== boss.boss_id) return { accepted: false, reason: 'weekly_boss_reward_not_found' };
  const [progress, victory] = await Promise.all([
    db.prepare('SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id=? AND week_key=? AND boss_id=?').bind(telegramId, weekKey, boss.boss_id).first().then(requirePetFirstReadResult),
    readWeeklyBossVictoryPetAttribution(db, telegramId, weekKey, boss.boss_id),
  ]);
  if (!progress?.defeated_at || !victory || request.pet_id !== victory.pet_id) return { accepted: false, reason: 'weekly_boss_reward_not_found' };
  try {
    const reward = await settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progress);
    if (!reward?.accepted) return { ...reward, accepted: false, reason: reward?.reason || 'weekly_boss_reward_pending' };
    await finishPetWeeklyBossVictory(db, telegramId, weekKey, boss, victory);
    return { ...reward, reason: 'weekly_boss_reward_claimed', boss, week_key: weekKey };
  } catch {
    return { accepted: false, reason: 'weekly_boss_reward_pending' };
  }
}

async function finishPetWeeklyBossVictory(db, telegramId, weekKey, boss, victory) {
  // New victories preserve the exact defeating event in the attack transaction.
  // Older evidence keys remain valid for their existing reward and crest receipt.
  const event = await db.prepare(`SELECT id, event_key, day_key, metadata FROM telegram_pet_events
    WHERE telegram_id=? AND pet_id=? AND season_key=? AND event_key=? AND event_type='weekly_boss' AND status='accepted'`)
    .bind(telegramId, victory.pet_id, victory.season_key, victory.victory_event_key).first().then(requirePetFirstReadResult);
  if (event) {
    await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, event.event_key);
    const memory = await recordMoonpetMemory(db, { telegram_id: telegramId, pet_id: victory.pet_id, season_key: victory.season_key,
      event_key: `${event.event_key}:memory`, source_event_key: event.event_key, source_event_type: 'weekly_boss',
      source_event_reason: 'weekly_boss_attempt', source_event_category: 'pet_weekly_boss',
      memory_type: 'boss_victory', boss_id: boss.boss_id, milestone: 'first_boss_victory', recover_source_event: true });
    if (!memory.accepted && !memory.duplicate) return;
    const achievements = await syncPetAchievementsForPet(db, telegramId, victory.pet_id, victory.season_key, true);
    if (!achievements.length) return;
    const runtime = await applyPetRuntimeCommandAward(db, telegramId, `runtime:${event.event_key}`, 'run_boss', { ...victory, day_key: event.day_key, source_event_id: event.id, equipment_snapshot: safeJsonParse(event.metadata, {}).equipment_snapshot || {} });
    if (!runtime?.ok) return;
  }
  const crest = await awardStoredWeeklyBossVictoryCrest(db, telegramId, weekKey, boss.boss_id);
  if (!event || (!crest.accepted && !crest.duplicate)) return;
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_system_events
    (id,pet_id,telegram_id,season_key,system_key,action_key,period_key,status)
    VALUES (?,?,?,?,'weekly_boss_finish',?,?,'completed')`)
    .bind(crypto.randomUUID(), victory.pet_id, telegramId, victory.season_key, event.event_key, weekKey).run();
}

async function awardStoredWeeklyBossVictoryCrest(db, telegramId, weekKey, bossId, now = new Date()) {
  try {
    const victory = await db.prepare(`SELECT pet_id, telegram_id, season_key, victory_event_key, defeated_at
      FROM telegram_pet_weekly_boss_victories_by_pet WHERE telegram_id=? AND week_key=? AND boss_id=? LIMIT 1`)
      .bind(telegramId, weekKey, bossId).first().then(requirePetFirstReadResult);
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

async function processPetWeeklyBoss(db, telegramId, actionRaw, eventKeyRaw = '', expectedPetId = '') {
  const action = ['strike', 'outsmart', 'endure'].includes(String(actionRaw || '').trim().toLowerCase()) ? String(actionRaw).trim().toLowerCase() : null;
  const now = new Date();
  const weekKey = getPetWeekKey(now);
  const dayKey = getPetDayKey(now);
  const season = getPetSeasonInfo(now);
  const boss = getPetWeeklyBoss(weekKey);
  const [pet, existing, victoriousPet] = await Promise.all([
    getPetProfileWithAtomicDecay(db, telegramId, now),
    db.prepare(`SELECT event_id, telegram_id, week_key, day_key, boss_id, event_key, action, damage
      FROM telegram_pet_weekly_boss_events WHERE telegram_id = ? AND week_key = ? AND day_key = ?`)
      .bind(telegramId, weekKey, dayKey).first().then(requirePetFirstReadResult),
    findActivePetSlot(db, telegramId),
  ]);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted', boss, week_key: weekKey };
  const progressBefore = await db.prepare(`SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?`)
    .bind(telegramId, weekKey).first().then(requirePetFirstReadResult);
  if (!action) return { accepted: true, preview: true, boss, progress: progressBefore, week_key: weekKey, energy_cost: 12, pet };
  const bossPetAuthority = victoriousPet?.pet_id && victoriousPet?.season_key && victoriousPet.pet_id === pet.pet_id
    ? { pet_id: String(victoriousPet.pet_id), season_key: String(victoriousPet.season_key) }
    : null;
  if (progressBefore?.defeated_at) {
    if (!bossPetAuthority && progressBefore.reward_claimed_at) {
      return { accepted: true, duplicate: true, reason: 'boss_already_defeated', boss, progress: progressBefore, reward: null, week_key: weekKey, pet };
    }
    const reward = progressBefore.reward_claimed_at
      ? null
      : await settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progressBefore).catch(() => ({ accepted: false, reason: 'weekly_boss_reward_pending' }));
    const victory = await readWeeklyBossVictoryPetAttribution(db, telegramId, weekKey, boss.boss_id);
    if (victory) await finishPetWeeklyBossVictory(db, telegramId, weekKey, boss, victory);
    await awardStoredWeeklyBossVictoryCrest(db, telegramId, weekKey, boss.boss_id, now);
    const bossAttempt = existing || await readWeeklyBossAttemptRow(db, telegramId, weekKey, dayKey, boss.boss_id);
    await recordWeeklyJourneyFromAcceptedWeeklyBossEvent(db, telegramId, weekKey, bossAttempt?.day_key || dayKey, boss, bossAttempt, victoriousPet, season);
    return { accepted: true, duplicate: true, reason: 'boss_already_defeated', boss, progress: progressBefore, reward, week_key: weekKey, pet };
  }
  if (existing) {
    const progress = progressBefore || await db.prepare(`SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?`).bind(telegramId, weekKey).first().then(requirePetFirstReadResult);
    const reward = await settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progress);
    await recordWeeklyJourneyFromAcceptedWeeklyBossEvent(db, telegramId, weekKey, dayKey, boss, existing, victoriousPet, season);
    return { accepted: true, duplicate: true, reason: 'daily_attempt_used', boss, progress, reward, damage: existing.damage, action: existing.action, week_key: weekKey, pet };
  }
  if (!bossPetAuthority) {
    return { accepted: false, reason: 'weekly_boss_pet_authority_missing', boss, progress: progressBefore, week_key: weekKey, pet };
  }
  if (expectedPetId && expectedPetId !== bossPetAuthority.pet_id) return { accepted: false, reason: 'weekly_boss_pet_changed' };
  const [activeIdentity, lifecycle] = await Promise.all([
    getMoonpetIdentityWithLifecycle(db, telegramId),
    db.prepare('SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND telegram_id=?').bind(bossPetAuthority.pet_id, telegramId).first().then(requirePetFirstReadResult),
  ]);
  const identity = activeIdentity?.scope?.pet_id === bossPetAuthority.pet_id && activeIdentity?.scope?.season_key === bossPetAuthority.season_key
    ? activeIdentity : await getMoonpetIdentitySummary(db, telegramId, bossPetAuthority);
  if (!lifecycle || lifecycle.phase === 'egg') return { accepted: false, reason: 'moon_egg_must_hatch' };
  const combat = getCombatEligibility({ activePetExists: true, lifecycleKnown: true, hatched: true, level: getPetLevel(pet.pet_xp) });
  if (!combat.weekly_boss_unlocked) return { accepted: false, reason: combat.weekly_boss_reason, required_level: PET_WEEKLY_BOSS_MIN_LEVEL, boss, progress: progressBefore };
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
        (SELECT 1 FROM telegram_pet_instances p JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=p.pet_id AND l.telegram_id=p.telegram_id
          WHERE p.pet_id=? AND p.telegram_id=? AND p.season_key=? AND p.status='active' AND l.phase<>'egg'
            AND p.energy>=12 AND ${getPetVisibleLevelSql('p.pet_xp')}>=5 AND p.pet_xp=? AND p.energy=? AND p.health=?)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_progress WHERE telegram_id=? AND week_key=? AND defeated_at IS NOT NULL)`)
      .bind(eventId, telegramId, weekKey, dayKey, boss.boss_id, eventKey, action, damage,
        bossPetAuthority.pet_id, telegramId, bossPetAuthority.season_key, pet.pet_xp, pet.energy, pet.health, telegramId, weekKey),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
      (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, 'weekly_boss', ?, 0, 0, ?, ?, ?, 'accepted', 'weekly_boss_attempt', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_events WHERE event_id = ?)
        AND ? <> ''
        AND EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ?)`)
      .bind(
        `${eventId}:pet-event`,
        bossPetAuthority.pet_id,
        telegramId,
        eventKey,
        bossPetAuthority.season_key,
        dayKey,
        weekKey,
        JSON.stringify({ source: 'pet_weekly_boss', boss_id: boss.boss_id, action, damage, equipment_snapshot: pet.equipment_progression || {} }),
        eventId,
        bossPetAuthority.pet_id,
        bossPetAuthority.pet_id,
        telegramId,
      ),
    db.prepare(`UPDATE telegram_pet_instances SET energy = energy - 12, source_profile_updated_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE pet_id = ? AND telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_events WHERE event_id = ?)`)
      .bind(PET_INSTANCE_AUTHORITY_VERSION, bossPetAuthority.pet_id, telegramId, eventId),
    db.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id, week_key, boss_id, attempts, damage, defeated_at)
      SELECT ?, ?, ?, 1, ?, CASE WHEN ? >= ? THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_events WHERE event_id = ?)
      ON CONFLICT(telegram_id, week_key) DO UPDATE SET attempts = telegram_pet_weekly_boss_progress.attempts + 1,
        damage = telegram_pet_weekly_boss_progress.damage + excluded.damage,
        defeated_at = COALESCE(telegram_pet_weekly_boss_progress.defeated_at,
          CASE WHEN telegram_pet_weekly_boss_progress.damage + excluded.damage >= ? THEN CURRENT_TIMESTAMP ELSE NULL END),
        updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, weekKey, boss.boss_id, damage, damage, boss.hp, eventId, boss.hp),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_weekly_boss_victories_by_pet
      (telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
      SELECT ?,?,?,?, ?,?, p.defeated_at FROM telegram_pet_weekly_boss_progress p
      WHERE p.telegram_id=? AND p.week_key=? AND p.boss_id=? AND p.defeated_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_events WHERE event_id=?)`)
      .bind(telegramId, weekKey, boss.boss_id, bossPetAuthority.pet_id, bossPetAuthority.season_key, eventKey,
        telegramId, weekKey, boss.boss_id, eventId),
  ]);
  if (!results?.[0]?.meta?.changes) {
    const used = await db.prepare('SELECT action,damage FROM telegram_pet_weekly_boss_events WHERE telegram_id=? AND week_key=? AND day_key=?').bind(telegramId, weekKey, dayKey).first().then(requirePetFirstReadResult);
    if (!used) return { accepted: false, reason: 'weekly_boss_state_changed', boss };
    const progress = await db.prepare('SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id=? AND week_key=?').bind(telegramId, weekKey).first().then(requirePetFirstReadResult);
    return { accepted: true, duplicate: true, reason: 'daily_attempt_used', boss, progress, ...used, week_key: weekKey,
      pet: await getPetInstanceWithAtomicDecay(db, bossPetAuthority.pet_id) };
  }
  await recordWeeklyJourneyFromAcceptedPetEvent(db, telegramId, eventKey);
  const progress = await db.prepare(`SELECT * FROM telegram_pet_weekly_boss_progress WHERE telegram_id = ? AND week_key = ?`).bind(telegramId, weekKey).first().then(requirePetFirstReadResult);
  const newlyDefeated = !progressBefore?.defeated_at && Boolean(progress?.defeated_at);
  let reward = null;
  if (newlyDefeated) {
    reward = await settlePetWeeklyBossReward(db, telegramId, weekKey, boss, progress).catch(() => ({ accepted: false, reason: 'weekly_boss_reward_pending' }));
    const victory = await readWeeklyBossVictoryPetAttribution(db, telegramId, weekKey, boss.boss_id);
    if (victory) await finishPetWeeklyBossVictory(db, telegramId, weekKey, boss, victory);
  }
  return { accepted: true, duplicate: false, reason: newlyDefeated ? 'boss_defeated' : 'boss_damaged', boss, progress, damage, action, reward,
    reward_pending: newlyDefeated && !reward?.accepted, week_key: weekKey, pet: await getPetInstanceWithAtomicDecay(db, bossPetAuthority.pet_id) };
}

async function getPetSeasonRewardState(db, telegramId, options = {}) {
  const season = getPetSeasonInfo(new Date());
  const identityPromise = Object.hasOwn(options, 'identity')
    ? Promise.resolve(options.identity)
    : getMoonpetIdentityWithLifecycle(db, telegramId, { required: true });
  const [state, claims, identity] = await Promise.all([
    db.prepare(`SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id = ? AND season_key = ?`).bind(telegramId, season.key).first().then(requirePetFirstReadResult),
    db.prepare(`SELECT idempotency_key, COALESCE(awarded_at,created_at) AS claimed_at FROM telegram_pet_reward_claims
      WHERE telegram_id=? AND source='pet_season_reward' AND status='awarded'`).bind(telegramId).all().then(requirePetReadResult),
    identityPromise,
  ]);
  const claimed = new Map((claims.results || []).map((row) => [row.idempotency_key, row.claimed_at]));
  const seasonXp = Math.max(0, Math.floor(Number(state?.season_xp) || 0));
  return { season, season_xp: seasonXp, evolution_stage: Math.max(0, Number(identity?.current_stage?.stage) || 0), tiers: PET_SEASON_REWARD_TIERS.map((tier) => ({ ...tier, unlocked: seasonXp >= tier.required_xp, claimed_at: claimed.get(`season_reward:${telegramId}:${season.key}:${tier.tier_id}`) || null })) };
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
  const sourceAuthority = activePetRewardAuthority(await getPetProfile(db, telegramId));
  if (!sourceAuthority) return { accepted: false, reason: 'source_pet_authority_required', tier, state };
  const rewardKey = `season_reward:${telegramId}:${state.season.key}:${tier.tier_id}`;
  const award = await awardPetReward(db, {
    ...sourceAuthority, telegram_id: telegramId, source: 'pet_season_reward', idempotency_key: rewardKey, event_key: rewardKey,
    event_type: 'season_reward', reason: tier.tier_id, rewards, touch_streak: false,
    context: { season_key: state.season.key, tier_id: tier.tier_id, evolution_stage: state.evolution_stage },
  });
  if (!award.accepted && !award.duplicate) return { accepted: false, reason: award.reason || 'season_reward_pending', tier, award, state };
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_season_reward_claims
    (telegram_id, season_key, tier_id, event_key) VALUES (?, ?, ?, ?)`)
    .bind(telegramId, state.season.key, tier.tier_id, eventKey).run().catch((error) => {
      logApiFailure('telegram_pet_season_claim_receipt_failed', {
        telegramId, message: error?.message || String(error),
      });
    });
  let updatedState;
  try {
    updatedState = await getPetSeasonRewardState(db, telegramId);
  } catch (error) {
    logApiFailure('telegram_pet_season_claim_followup_failed', {
      telegramId, message: error?.message || String(error),
    });
    updatedState = { ...state, tiers: state.tiers.map((entry) =>
      entry.tier_id === tier.tier_id ? { ...entry, claimed_at: new Date().toISOString() } : entry) };
  }
  return { accepted: true, duplicate: Boolean(award.duplicate), tier, rewards, award, state: updatedState };
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

const TELEGRAM_PET_READ_RETRY_COPY = 'Moonpet data is temporarily unavailable. No new action was applied. Please try again shortly.';

async function readTelegramPetPresentation(tok, chatId, telegramId, surface, reader) {
  try {
    return { ok: true, value: await reader() };
  } catch (error) {
    logApiFailure('telegram_pet_presentation_read_failed', {
      telegramId,
      surface,
      message: error?.message || String(error),
    });
    await sendTelegramMessage(tok, chatId, TELEGRAM_PET_READ_RETRY_COPY);
    return { ok: false, value: null };
  }
}

async function cmdPetStatus(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'status', async () => {
    const pet = await getPetProfile(db, telegramId);
    if (!pet) return { pet: null, activity: null, identity: null };
    const [activity, identity] = await Promise.all([
      getActivePetActivitySession(db, telegramId),
      getMoonpetIdentityWithLifecycle(db, telegramId, { required: true }),
    ]);
    return { pet, activity, identity };
  });
  if (!read.ok) return;
  const { pet, activity, identity } = read.value;
  const reaction = pet ? await selectMoonpetReaction(db, telegramId, 'status', identity || {}, { pet }).catch(() => buildMoonpetReaction('status', identity || {}, { pet })) : null;
  await sendTelegramPetReply(tok, chatId, formatPetStatus(pet, identity, activity, reaction), { reply_markup: petReplyMarkup() }, 'how_to_play', { db, telegram_id: telegramId, pet });
}

async function cmdPetDetails(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'details', async () => {
    const pet = await getPetProfile(db, telegramId);
    if (!pet) return { pet: null, guided: null };
    const [missions, activity, identity] = await Promise.all([
      buildPetMissions(db, telegramId),
      getActivePetActivitySession(db, telegramId),
      getMoonpetIdentityWithLifecycle(db, telegramId, { required: true }),
    ]);
    const guided = await buildPetGuidedReply(db, telegramId, pet,
      formatPetDetails(pet, missions, activity, identity), buildPetProgressMenuReplyMarkup());
    return { pet, guided };
  });
  if (!read.ok) return;
  const { pet } = read.value;
  const guided = read.value.guided || {
    text: formatPetDetails(null, null, null, null),
    reply_markup: buildPetProgressMenuReplyMarkup(),
  };
  await sendTelegramBuiltPetGuidedReply(tok, chatId, db, telegramId, guided);
}

async function cmdPetCoach(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'coach', async () => {
    const pet = await getPetProfile(db, telegramId);
    const guided = pet ? await buildPetGuidedReply(
      db,
      telegramId,
      pet,
      '<b>🧭 Moonpet Coach</b>\nI checked needs, active runs, missions, evolution, rewards, jobs and affordable upgrades.',
      petReplyMarkup(),
    ) : null;
    return { pet, guided };
  });
  if (!read.ok) return;
  const { pet, guided } = read.value;
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const evolution = guided.state?.evolution;
  const evolutionLines = evolution
    ? evolution.ready
      ? `\n\n<b>🧬 ${escapeHtml(evolution.name)}</b>\n✅ Every evolution requirement is complete.`
      : `\n\n<b>🧬 ${escapeHtml(evolution.name)} progress</b>\n${evolution.missing.map((item) => `• ${escapeHtml(item.label)}: ${item.current}/${item.required}`).join('\n')}`
    : '\n\n<b>🧬 Evolution</b>\n✅ Final evolution reached.';
  await sendTelegramBuiltPetGuidedReply(tok, chatId, db, telegramId, { ...guided, text: `${guided.text}${evolutionLines}` });
}

async function cmdPetIdentity(db, tok, chatId, telegramId, section) {
  const identityRead = await readTelegramPetPresentation(tok, chatId, telegramId, 'identity', () =>
    getMoonpetIdentityWithLifecycle(db, telegramId, { required: true }));
  if (!identityRead.ok) return;
  const identity = identityRead.value;
  if (!identity) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const memory = identity.memories || {};
  let sectionCopy = {
    evolution: `<b>🧬 Evolution</b>\n${escapeHtml(identity.current_stage?.name || 'Secret Bot')}\n${escapeHtml(getPetEvolutionPerk(identity.current_stage?.stage).perk)}`,
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
    const evolutionRead = await readTelegramPetPresentation(tok, chatId, telegramId, 'identity_evolution', async () => {
      const pet = await getPetProfile(db, telegramId);
      return getPetEvolutionGuidance(db, telegramId, pet, identity);
    });
    if (!evolutionRead.ok) return;
    evolutionProgress = evolutionRead.value;
    sectionCopy = evolutionProgress
      ? `<b>🧬 Evolution</b>\nCurrent: <b>${escapeHtml(identity.current_stage?.name || 'Secret Bot')}</b>\nNext: <b>${escapeHtml(evolutionProgress.name)}</b>\n\n${evolutionProgress.ready ? '✅ All requirements complete.' : evolutionProgress.missing.map((entry) => `• ${escapeHtml(entry.label)}: ${entry.current}/${entry.required}\n  <i>${escapeHtml(entry.source)}</i>`).join('\n')}\n\n${escapeHtml(getPetEvolutionPerk(evolutionProgress.stage).perk)}`
      : `<b>🧬 Evolution</b>\n<b>${escapeHtml(identity.current_stage?.name || 'Legendary Moon Guardian')}</b>\n✅ Final evolution reached.`;
  }
  const markup = section === 'evolution' && evolutionProgress
    ? { inline_keyboard: [[{ text: '🧬 Attempt Next Evolution', callback_data: 'pet:evolve' }], ...buildPetProgressMenuReplyMarkup().inline_keyboard] }
    : buildPetProgressMenuReplyMarkup();
  await sendTelegramMessage(tok, chatId, sectionCopy || formatMoonpetIdentitySummary(identity), { reply_markup: markup });
}

async function cmdPetAchievements(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'achievements', () =>
    syncPetAchievements(db, telegramId, true));
  if (!read.ok) return;
  const achievements = read.value;
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
  if (String(action || '').startsWith('claim:')) {
    const weekKey = String(action).slice(6);
    const boss = getPetWeeklyBoss(weekKey);
    const victory = await readWeeklyBossVictoryPetAttribution(db, telegramId, weekKey, boss.boss_id);
    const claimed = await claimPetWeeklyBossReward(db, telegramId, { week_key: weekKey, boss_id: boss.boss_id, pet_id: victory?.pet_id });
    await sendTelegramMessage(tok, chatId, claimed.accepted
      ? `${claimed.duplicate ? 'Already collected' : 'Recovered'}: ${boss.title} (${weekKey}). No new attack or energy cost.`
      : formatPetBlockedCopy('weekly reward', claimed.reason, claimed));
    return;
  }
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
  let board = null;
  let guidanceUnavailable = false;
  try {
    board = (await buildPetGuidanceState(db, telegramId))?.weekly_boss;
  } catch (error) {
    guidanceUnavailable = true;
    logApiFailure('telegram_pet_boss_guidance_read_failed', {
      telegramId, message: error?.message || String(error),
    });
  }
  const reaction = await selectMoonpetReaction(db, telegramId, 'boss', identity || {}, { pet: result.pet, activity_label: `${boss.title} boss fight` }).catch(() => buildMoonpetReaction('boss', identity || {}));
  const previews = (board?.choices || []).map((choice) => `${choice.title}: ${choice.minimum_damage}–${choice.maximum_damage} damage · ${choice.energy} Energy${choice.weakness_bonus ? ' · weakness bonus included' : ''}`).join('\n');
  const bossText = `<b>👑 Weekly Boss: ${escapeHtml(boss.title)}</b>\nWeek ${escapeHtml(result.week_key || getPetWeekKey(new Date()))}\nWeakness: ${escapeHtml(boss.weakness)}\nStatus: <b>${escapeHtml(status)}</b>\nAttempts: ${Number(progress.attempts || 0)}/7${actionLine}${duplicateLine}${rewardLine}\n\n${escapeHtml(previews)}\nLevel 5 after hatching. One account attempt per UTC day. Endure deals damage; it does not heal.\n\n<i>${escapeHtml(reaction)}</i>${guidanceUnavailable ? `\n\n<i>${TELEGRAM_PET_GUIDANCE_RETRY_COPY}</i>` : ''}`;
  const bossMarkup = { inline_keyboard: [
      ...(board?.available ? [[{ text: '⚔️ Strike', callback_data: 'pet:boss:strike' }, { text: '🧠 Outsmart', callback_data: 'pet:boss:outsmart' }, { text: '🛡 Endure', callback_data: 'pet:boss:endure' }]] : []),
      ...(board?.pending_rewards || []).map((claim) => [{ text: `Recover ${claim.week_key} reward`, callback_data: `pet:boss:claim:${claim.week_key}` }]),
      [{ text: '⬅️ Adventure', callback_data: 'pet:menu:adventure' }],
    ] };
  await sendTelegramPetReply(tok, chatId, bossText, { reply_markup: bossMarkup }, null,
    guidanceUnavailable ? null : { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetSeason(db, tok, chatId, telegramId, tierId = '', eventKey = '') {
  let claim = null;
  if (tierId) claim = await claimPetSeasonReward(db, telegramId, tierId, eventKey).catch((error) => ({ accepted: false, reason: error?.message || 'season_claim_failed' }));
  if (tierId && !claim?.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('season reward', claim?.reason, claim || {}));
    return;
  }
  let state = claim?.state || null;
  if (!state) {
    const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'season', () => getPetSeasonRewardState(db, telegramId));
    if (!read.ok) return;
    state = read.value;
  }
  const lines = state.tiers.map((tier) => `${tier.claimed_at ? '✅' : tier.unlocked ? '🎁' : '🔒'} <b>${escapeHtml(tier.title)}</b> — ${tier.required_xp} season XP${tier.claimed_at ? ' · claimed' : ''}`);
  const buttons = state.tiers.filter((tier) => tier.unlocked && !tier.claimed_at).map((tier) => [{ text: `Claim ${tier.title}`, callback_data: `pet:season:claim:${tier.tier_id}` }]);
  const text = `${claim ? `<b>🎟 ${escapeHtml(claim.tier.title)} claimed.</b>\n\n` : ''}<b>Season Rewards</b>\n${escapeHtml(state.season.key)} · ${state.season_xp} XP\nEvolution bonus: +${state.evolution_stage} Style per claimed tier\n\n${lines.join('\n')}`;
  const copy = claim ? await appendMoonpetReaction(db, telegramId, 'season', text, null, { activity_label: `claiming ${claim.tier.title}` }) : text;
  const pet = await getPetProfile(db, telegramId).catch(() => null);
  const seasonMarkup = { inline_keyboard: [...buttons, [{ text: '⬅️ Progress', callback_data: 'pet:menu:progress' }]] };
  await sendTelegramPetReply(tok, chatId, copy, { reply_markup: seasonMarkup }, null,
    pet ? { db, telegram_id: telegramId, pet } : null);
}

async function cmdPetEvolve(db, tok, chatId, telegramId, evolutionIdRaw = '', eventKey = '') {
  const identityRead = await readTelegramPetPresentation(tok, chatId, telegramId, 'evolve', () =>
    getMoonpetIdentityWithLifecycle(db, telegramId, { required: true }));
  if (!identityRead.ok) return;
  const identity = identityRead.value;
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
    const progressRead = await readTelegramPetPresentation(tok, chatId, telegramId, 'evolve_progress', async () => {
      const pet = await getPetProfile(db, telegramId);
      return getPetEvolutionGuidance(db, telegramId, pet, identity);
    });
    if (!progressRead.ok) return;
    const progress = progressRead.value;
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
  await sendTelegramPetReply(tok, chatId, evolutionText, { reply_markup: buildPetProgressMenuReplyMarkup() }, null,
    pet ? { db, telegram_id: telegramId, pet } : null);
}

async function cmdPetStreak(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'streak', () => getPetProfile(db, telegramId));
  if (!read.ok) return;
  const pet = serializePet(read.value);
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
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'progress', async () => {
    const pet = await getPetProfile(db, telegramId);
    if (!pet) return { pet: null, state: null, identity: null };
    const [state, identity] = await Promise.all([
      getOrCreatePetRuntimeState(db, telegramId, getPetDayKey(new Date()), activePetRewardAuthority(pet)),
      getMoonpetIdentityWithLifecycle(db, telegramId, { required: true }),
    ]);
    return { pet, state, identity };
  });
  if (!read.ok) return;
  const { pet, state, identity } = read.value;
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const identityCopy = identity ? `\n\n${formatMoonpetIdentitySummary(identity)}` : '';
  await sendTelegramMessage(tok, chatId, `${buildPetProgressSummary(state || {})}${identityCopy}`, { reply_markup: buildPetProgressMenuReplyMarkup() });
}

async function cmdPetGear(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'gear', async () => {
    await recoverPetEquipmentRows(db, telegramId);
    const pet = await getPetProfile(db, telegramId);
    const rows = pet ? await db.prepare(`SELECT item_key, slot, item_level, item_xp, mastery_xp, mastery_tier FROM telegram_pet_equipment_progression WHERE telegram_id = ? ORDER BY slot, item_level DESC, item_key`)
      .bind(telegramId).all().then(requirePetReadResult) : { results: [] };
    return { pet, rows };
  });
  if (!read.ok) return;
  const { pet, rows } = read.value;
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  await sendTelegramMessage(tok, chatId, buildPetGearSummary(rows.results, PET_SHOP_ITEMS), { reply_markup: buildPetManagementMenuReplyMarkup() });
}

export async function applyPetRuntimeCommandAward(db, telegramId, eventKey, action, options = {}) {
  const stableKey = String(eventKey || '').trim();
  if (!stableKey) return null;
  try {
    const source = activePetRewardAuthority(options) || activePetRewardAuthority(options.pet);
    const pet = source
      ? await db.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=?')
        .bind(source.pet_id, telegramId, source.season_key).first()
      : options.pet || await getPetProfile(db, telegramId);
    const authority = source || activePetRewardAuthority(pet);
    if (!pet || !authority) return null;
    const [equipped, factionRow] = await Promise.all([
      withPetEquipmentProgression(db, pet),
      db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id=?').bind(telegramId).first(),
    ]);
    const factionBonus = action === 'train' || action === 'timed_train'
      ? applyPetFactionBonus({}, factionRow?.faction, 'training').bonus : null;
    return await applyPetRuntimeAward(db, telegramId, stableKey, action, {
      ...authority, day_key: getPetDayKey(new Date()), ...options,
      drop_roll: await getPetRuntimeSourceDropRoll(action, telegramId, options.source_event_id),
      material_amount: 1,
      equipment_rows: Object.values(Object.hasOwn(options, 'equipment_snapshot')
        ? (typeof options.equipment_snapshot === 'string' ? safeJsonParse(options.equipment_snapshot, {}) : options.equipment_snapshot) || {}
        : equipped.equipment_progression),
      track_multiplier: 1 + Number(factionBonus?.effect?.training_xp_pct || 0) / 100,
    });
  } catch (error) {
    logApiFailure('runtime_award_failed', { telegramId, action, eventKey: stableKey, message: error?.message || String(error) });
    return null;
  }
}

async function cmdPetBag(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'bag', async () => {
    const pet = await getPetProfile(db, telegramId);
    const inventory = pet ? await getPetInventory(db, telegramId) : [];
    return { pet, inventory };
  });
  if (!read.ok) return;
  const { pet, inventory } = read.value;
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
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
  const pet = await getPetProfile(db, telegramId);
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'You need a Moonpet first. Use /adopt to start.');
    return;
  }

  const args = String(argStr || '').trim().split(':').filter(Boolean);
  const action = args.shift() || '';
  const groupChat = isTelegramGroupChat(chatId, chatType);
  const requireKaijuEligibility = async () => {
    const eligibility = await ensurePetKaijuEligible(db, telegramId, pet);
    if (eligibility.ok) return true;
    const copy = eligibility.reason === 'moon_egg_must_hatch'
      ? 'Your Moon Egg must hatch before entering a Kaiju battle.'
      : eligibility.reason === 'combat_authority_unavailable'
        ? 'Kaiju eligibility is temporarily unavailable. Try again shortly.'
        : eligibility.reason === 'moonpet_lifecycle_required'
          ? 'Moonpet lifecycle authority is still syncing. Try Kaiju again shortly.'
          : 'You need an eligible active Moonpet before entering a Kaiju battle.';
    await sendTelegramMessage(tok, chatId, copy);
    return false;
  };

  if (action === 'join') {
    if (!await requireKaijuEligibility()) return;
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
    if (!await requireKaijuEligibility()) return;
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
    if (!await requireKaijuEligibility()) return;
    const completed = await applyPetKaijuCard(db, match, telegramId, cardKey);
    if (completed.reason === 'kaiju_card_waiting') {
      await sendTelegramMessage(tok, chatId, `Card locked for <code>${escapeHtml(telegramId)}</code>. Waiting for the other player.`);
      return;
    }
    if (!completed.accepted) {
      await sendTelegramMessage(tok, chatId, 'That Kaiju table changed before the choice settled. Use /petkaiju to refresh.');
      return;
    }
    const copy = await appendMoonpetReaction(db, telegramId, 'kaiju', formatPetKaijuResult(completed), pet, { activity_label: 'the Kaiju battle result' });
    await sendTelegramPetReply(tok, chatId, copy, { reply_markup: petReplyMarkup() }, 'play');
    return;
  }

  if (!await requireKaijuEligibility()) return;

  if (!groupChat) {
    const active = await getActivePetKaijuMatch(db, chatId);
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

  const active = await getActivePetKaijuMatch(db, chatId);
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
  if (code === 'daily_run_requires_mini_app') return `Your official Daily Run is saved. Continue its choices or extract in Explore: ${MOONPET_MINI_APP_URL}`;
  if (code === 'run_not_found') return `No active pet run found. Use /petrun to start one.`;
  if (code === 'run_empty') return `Clear at least one run step before extracting. Use /petrun to pick a route.`;
  if (code === 'invalid_run_choice') return `That run choice is not available on this step. Use /petrun to refresh the run.`;
  if (code === 'run_closed') return `That run is already closed. Use /petrun to start or resume the next one.`;
  if (code === 'stale_run_step') return `That run button is from an older step. Use /petrun to see the current choice.`;
  if (code === 'insufficient_run_cost') return `Moonpet cannot afford that run choice cost. Try another route or extract first.`;
  if (code === 'pet_not_adopted') return `You need a Moonpet first. Use /adopt to start.`;
  if (code === 'equipment_not_owned') return 'Buy this permanent gear once in Shop before equipping it for free.';
  if (code === 'equipment_state_changed') return 'Your active pet or equipment changed. Refresh and choose again. Nothing was charged.';
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
    runtime_event_key: `runtime:job:${eventKey || jobKey}`,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_work_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('job', result.reason, result));
    return;
  }
  await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward, { action: 'job' });
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
  const reaction = await selectMoonpetReaction(db, telegramId, 'job', identity || {}, { pet: result.pet, activity_label: result.job?.title || jobKey }).catch(() => buildMoonpetReaction('job', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `Job complete: ${escapeHtml(result.job?.title || jobKey)}.\n<i>${escapeHtml(reaction)}</i>\n\n${formatPetStatus(result.pet, identity, null, null)}`, { reply_markup: petReplyMarkup() }, 'work', { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetDaily(db, tok, chatId, telegramId, eventKey = null) {
  const dayKey = getPetDayKey(new Date());
  const result = await processPetDailyChest(db, telegramId, {
    event_key: eventKey || buildStablePetEventKey(['tg', telegramId, 'daily', dayKey]),
    runtime_event_key: `runtime:daily:${eventKey || dayKey}`,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_daily_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy('daily chest', result.reason, result));
    return;
  }
  await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward, { action: 'daily_chest' });
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
    runtime_event_key: `runtime:care:${stableEventKey || action}`,
    source: 'telegram_command',
  }).catch((error) => ({ accepted: false, reason: error?.message || 'pet_action_failed' }));
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, formatPetBlockedCopy(action, result.reason, result));
    return;
  }
  if (action !== 'adopt' && result.pet) {
    await recoverPetRuntimeAwards(db, telegramId, applyPetRuntimeCommandAward, { action });
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
  if (!result.accepted) {
    await sendTelegramMessage(tok, chatId, 'Pet rename was not saved. Your active pet may have changed. Check /pet and try /petname again.');
    return;
  }
  const identity = await getMoonpetIdentityWithLifecycle(db, telegramId);
  const reaction = await selectMoonpetReaction(db, telegramId, 'rename', identity || {}, { pet: result.pet }).catch(() => buildMoonpetReaction('rename', identity || {}, { pet: result.pet }));
  await sendTelegramPetReply(tok, chatId, `🌕 Pet renamed.\n\n${formatPetStatus(result.pet, identity, null, reaction)}`, { reply_markup: petReplyMarkup() }, 'level_up', { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetMissions(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'missions', () => buildPetMissions(db, telegramId));
  if (!read.ok) return;
  const missions = read.value;
  const daily = missions.daily.map((m) => `${m.completed ? '✅' : '⬜'} ${escapeHtml(m.title)}${m.detail ? '\n' + escapeHtml(m.detail) : ''}`).join('\n');
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
  const rows = (state?.market_offers || []).filter((offer) => !offer.purchased && offer.unlocked && offer.capacity?.available !== false)
    .map((offer) => [{ text: `${offer.affordable ? '🛍️' : '🔒'} ${offer.title}`.slice(0, 40), callback_data: `pet:market:${offer.key}` }]);
  return { inline_keyboard: [...rows, [{ text: '💰 Economy', callback_data: 'pet:economy' }, { text: '⬅️ Back', callback_data: 'pet:menu:management' }]] };
}

async function cmdPetEconomy(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'economy', () => getPetEconomyState(db, telegramId));
  if (!read.ok) return;
  const state = read.value;
  if (!state) { await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.'); return; }
  const complete = state.bounties.filter((entry) => entry.complete && !entry.claimed).length;
  const p = state.pet;
  await sendTelegramPetReply(tok, chatId,
    `<b>💰 Moonpet Economy</b>\n` +
    `<i>Earn → spend → upgrade → unlock. Rewards are server-verified and daily routes are capped.</i>\n\n` +
    `<b>Wallet</b>\n🪙 ${formatPetDisplayNumber(p.moon_gold)} gold · 💎 ${formatPetDisplayNumber(p.moon_crystals)} crystals · 🎨 ${formatPetDisplayNumber(p.style_tokens)} style\n\n` +
    `<b>Earn now</b>\n📜 ${complete} bounties ready to claim\n⛏️ ${state.expedition_attempts_left}/3 expedition attempts left\n💼 Jobs, Activities, Moon Runs, events and bosses remain active\n\n` +
    `<b>Spend and upgrade</b>\n🌙 ${state.market_offers.filter((offer) => !offer.purchased).length} rotating offers in stock\n🛒 Permanent equipment unlocks in Shop\n🧬 Materials, gear and XP feed evolution requirements\n\n` +
    `<b>Safeguards</b>\nBounties can only claim recorded actions. Expedition attempts and market stock reset at 00:00 UTC. Repeated buttons cannot pay twice.`,
    { reply_markup: buildPetEconomyMenuReplyMarkup() }, 'economy', { db, telegram_id: telegramId, pet: p });
}

async function cmdPetBounties(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'bounties', () => getPetEconomyState(db, telegramId));
  if (!read.ok) return;
  const state = read.value;
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

async function cmdPetExpedition(db, tok, chatId, telegramId, start = false, eventKey = '', expeditionKey = '') {
  if (start) {
    const result = await runPetCrystalExpedition(db, telegramId, new Date(), eventKey, expeditionKey).catch((error) => ({ accepted: false, reason: error?.message || 'expedition_failed' }));
    if (!result.accepted) {
      const copy = result.reason === 'expedition_daily_limit' ? 'All 3 Crystal Expedition attempts are used. Return after 00:00 UTC.'
        : result.reason === 'pet_tired' ? `Not enough Energy. This expedition costs ${result.expedition?.energy || 12} Energy; compare cheaper unlocked routes or recover first.`
          : 'The expedition could not start. Open Economy to check its requirements.';
      await sendTelegramMessage(tok, chatId, copy, { reply_markup: buildPetEconomyMenuReplyMarkup() }); return;
    }
    if (result.duplicate) { await sendTelegramMessage(tok, chatId, 'That expedition button was already settled. No duplicate reward or Energy cost was applied.'); return; }
    await sendTelegramPetReply(tok, chatId,
      `⛏️ <b>${escapeHtml(result.expedition.title)} complete</b>\nAttempt ${result.attempt}/3 · Cost ${result.expedition.energy} Energy\nFound ${escapeHtml(formatPetEconomyValue(result.rewards))}.`,
      { reply_markup: buildPetEconomyMenuReplyMarkup() }, 'adventure_win', { db, telegram_id: telegramId, pet: result.pet });
    return;
  }
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'expedition', () => getPetEconomyState(db, telegramId));
  if (!read.ok) return;
  const state = read.value;
  if (!state) { await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.'); return; }
  await sendTelegramPetReply(tok, chatId,
    `<b>⛏️ Choose an expedition</b>\n` +
    `${state.expedition_attempts_left}/3 shared attempts remain today. Older destinations remain available as you level up.\n\n` +
    state.expedition_options.map((entry) => `${entry.unlocked ? '⛏️' : '🔒'} ${escapeHtml(entry.title)} · Level ${entry.min_level} · ${entry.energy} Energy\nPossible finds: ${entry.rewards.map((reward) => escapeHtml(formatPetEconomyValue(reward))).join(' / ')}`).join('\n\n') + '\n\n' +
    `Current Energy: ${formatPetDisplayNumber(state.pet.energy)}.`,
    { reply_markup: { inline_keyboard: [...state.expedition_options.filter((entry) => entry.available).map((entry) => [{ text: `⛏️ ${entry.title} · ${entry.energy} Energy`, callback_data: `pet:expedition:go:${entry.key}` }]), [{ text: '💰 Economy', callback_data: 'pet:economy' }, { text: '⬅️ Back', callback_data: 'pet:menu:management' }]] } },
    'economy', { db, telegram_id: telegramId, pet: state.pet });
}

async function cmdPetMarket(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'market', () => getPetEconomyState(db, telegramId));
  if (!read.ok) return;
  const state = read.value;
  if (!state) { await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.'); return; }
  const lines = state.market_offers.map((offer) =>
    `${offer.purchased ? '✅ SOLD' : !offer.unlocked ? `🔒 LEVEL ${offer.min_level}` : !offer.capacity.available ? '🔒 STORAGE FULL' : offer.affordable ? '🛍️ READY' : '🔒 SAVE'} <b>${escapeHtml(offer.title)}</b>\n` +
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
      : result.reason === 'market_capacity_full' ? 'The whole bundle must fit in storage. Use items or spend materials/currency first. Nothing was charged; the offer remains in stock.'
      : result.reason === 'market_state_changed' ? 'Your pet or balances changed before purchase. Nothing was charged. Reopen the Market and check the offer.'
      : 'That Moon Market offer is not available now.';
    await sendTelegramMessage(tok, chatId, copy, { reply_markup: buildPetEconomyMenuReplyMarkup() }); return;
  }
  if (result.duplicate) { await sendTelegramMessage(tok, chatId, 'That daily offer is already sold. No duplicate currency was charged.'); return; }
  await sendTelegramPetReply(tok, chatId,
    `🛍️ <b>${escapeHtml(result.offer.title)} purchased</b>\nSpent ${escapeHtml(formatPetEconomyValue(result.offer.cost))}.\nReceived ${escapeHtml(formatPetEconomyValue(result.rewards))}.`,
    { reply_markup: buildPetEconomyMenuReplyMarkup() }, 'purchase_complete', { db, telegram_id: telegramId, pet: result.pet });
}

async function cmdPetShop(db, tok, chatId, telegramId) {
  const read = await readTelegramPetPresentation(tok, chatId, telegramId, 'shop', () => getPetProfile(db, telegramId, true));
  if (!read.ok) return;
  const pet = read.value;
  if (!pet) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pet found. Use /adopt to start.');
    return;
  }
  const p = serializePet(pet);
  const items = petShopItemsForPet(pet);
  const lines = items.map((item) => {
    const cost = item.cost || {};
    const state = item.equipped ? 'equipped' : item.owned && item.unlocked ? 'owned: equip free' : item.affordable ? 'ready' : item.unlocked ? 'need currency' : `level ${item.min_level}`;
    return `${item.equipped ? '✅' : '⬜'} <code>${escapeHtml(item.key)}</code> — ${escapeHtml(item.title)} [${escapeHtml(state)}]\n` +
      (item.owned ? '  Owned: switching is free; keeps upgrades and mastery.\n' : `  Cost: ${cost.moon_gold || 0} gold, ${cost.moon_crystals || 0} crystals, ${cost.style_tokens || 0} style\n`) +
      `  ${escapeHtml(item.description)}`;
  }).join('\n\n');
  await sendTelegramPetReply(tok, chatId,
    `<b>🛒 Crypto Moonboy Pet Shop</b>\n` +
    `Balance: ${p.moon_gold} gold · ${p.moon_crystals} crystals · ${p.style_tokens} style\n\n` +
    `${lines}\n\n` +
    `Buy new / switch owned gear free: <code>/petbuy moon_kibble</code>\n` +
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
    `${result.reason === 'equipment_equipped' ? 'Free equipment switch' : 'Gear purchased'}: <b>${escapeHtml(result.item.title)}</b>.\n\n` +
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
  const { season, rows: entries } = await readPetLeaderboard(db, { period: 'seasonal', limit: 10 });
  const rows = { results: entries };
  if (!rows.results?.length) {
    await sendTelegramMessage(tok, chatId, 'No Crypto Moonboy Pets leaderboard entries yet. Use /adopt to start.', replyMarkup ? { reply_markup: replyMarkup } : {});
    return;
  }
  const lines = rows.results.map((row, index) => {
    const entry = serializePetLeaderboardEntry(row, index);
    return `${index + 1}. ${escapeHtml(displayNameFromRow(row))} — ${escapeHtml(entry.display_name)} (${escapeHtml(entry.stage)}) ${entry.pet_xp || 0} pet XP`;
  });
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
  let board;
  try {
    board = await readCommunityLeaderboard(db, 10);
  } catch {
    await sendTelegramMessage(tok, chatId,
      'Community XP is unavailable. Please retry /gkleaderboard.');
    return;
  }
  const seasonLabel = board.season ? `Community season: ${escapeHtml(board.season.name || String(board.season.id))}` : 'All-time Community XP';
  if (!board.rows.length) {
    await sendTelegramMessage(tok, chatId,
      `📊 <b>${seasonLabel}</b>\n\nNo Community XP recorded for this period yet.`);
    return;
  }
  const lines = board.rows.map((r, i) => {
    const name = escapeHtml(displayNameFromRow(r));
    return `${i + 1}. ${name} — ${r.xp || 0} Community XP`;
  }).join('\n');
  await sendTelegramMessage(tok, chatId,
    `🏆 <b>Leaderboard — ${seasonLabel}</b>\n\n${lines}`);
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

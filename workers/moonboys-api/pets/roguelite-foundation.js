import {
  PET_ROGUELITE_BOSSES,
  PET_ROGUELITE_ENEMIES,
  PET_ROGUELITE_REGIONS,
  PET_ROGUELITE_RELICS,
  PET_ROGUELITE_ROOMS,
  PET_RUN_MODIFIERS,
  validatePetRelicContent,
  validatePetRogueliteContent,
  validatePetRunModifierContent,
} from './content/index.js';
import { SELECTED_RUN_PET_SQL, requireRunMutationResults, recoverDeletedPetRunStarts, isDeletedRunPet } from './run-ownership.js';
import { PET_CARE_SNAPSHOT_COLUMNS } from './care-decay.js';
import { communitySeasonSql, communityReceiptTimestampSql } from '../community-season-authority.js';
import { getPetSeasonRewardTier } from './player-expansion.js';
import { recordMoonpetBehaviour, recordMoonpetBiggestReward, recordMoonpetMemory } from './moonpet-identity.js';
import { reconcileLegacyPetInventory } from './inventory-cutover.js';
import { getMoonpetSeasonKey } from './season-authority.js';
import { DAILY_COMPLETION_REWARD, SEASON_FINALE_REWARD, dailyCompletionKey, seasonFinaleKey, completionRewardAuthorization } from './completion-policy.js';
import { requirePetFirstReadResult, requirePetMutationResult } from './read-result.js';
import { projectCommittedPetResult } from './committed-result.js';
import {
  PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY,
  PET_INSTANCE_AUTHORITY_VERSION,
  accountWalletRecoveryResolvedSql,
  ensurePetAccountWalletReadyForMutation,
  reconcilePetInstanceWalletToProfile,
} from './wallet-reconciliation.js';

export {
  PET_ROGUELITE_BOSSES,
  PET_ROGUELITE_ENEMIES,
  PET_ROGUELITE_REGIONS,
  PET_ROGUELITE_RELICS,
  PET_ROGUELITE_ROOMS,
  PET_RUN_MODIFIERS,
  validatePetRelicContent,
  validatePetRogueliteContent,
};

const DAILY_PET_XP_CAP = 1200;
const DAILY_COMMUNITY_XP_CAP = 250;
const DAILY_ROGUELITE_MATERIAL_CAP = 40;
const DAILY_ROGUELITE_ITEM_CAP = 10;
const MAX_ROGUELITE_MOON_GOLD_PER_CLAIM = 100;
const MAX_ROGUELITE_MOON_CRYSTALS_PER_CLAIM = 5;
const MAX_ROGUELITE_STYLE_TOKENS_PER_CLAIM = 5;
import { getPetVisibleLevelSql } from './progression-phase-2.js';

const MAX_CURRENCY = 999999;
export const PET_JOB_COOLDOWN_SECONDS = 45;
export const PET_ADVENTURE_COOLDOWN_SECONDS = 1800;

export const PET_RUN_STATUSES = Object.freeze(['active', 'completed', 'failed', 'abandoned', 'extracted']);
export const PET_ROOM_TYPES = Object.freeze(['battle', 'choice_event', 'loot', 'elite', 'boss']);
export const PET_REWARD_SOURCES = Object.freeze([
  'pet_event', 'pet_kaiju', 'pet_job', 'pet_activity', 'pet_adventure', 'pet_arena', 'pet_run_legacy', 'pet_action', 'pet_item_use',
  'pet_weekly_boss', 'pet_season_reward', 'pet_contract', 'pet_daily_completion', 'pet_season_finale',
  'pet_bounty', 'pet_expedition', 'pet_market',
  'pet_district', 'pet_event_chain', 'pet_seasonal_boss',
  'roguelite_room', 'roguelite_boss', 'roguelite_completion',
]);

const PERMANENT_REWARD_KEYS = new Set(['pet_xp', 'community_xp', 'moon_gold', 'moon_crystals', 'style_tokens', 'materials', 'items', 'relics']);
const PET_RELIC_RARITIES = new Set(['common', 'rare', 'epic', 'legendary']);

function positiveInteger(value, ceiling = MAX_CURRENCY) {
  return Math.min(ceiling, Math.max(0, Math.floor(Number(value) || 0)));
}

function safeJson(value) {
  return JSON.stringify(value == null ? {} : value);
}

function parsePersistedTimestamp(value, fallback = Date.now()) {
  if (!value) return fallback;
  const raw = String(value).trim();
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function normalizeCollection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key, amount]) => [String(key).trim().toLowerCase().slice(0, 80), positiveInteger(amount)])
    .filter(([key, amount]) => /^[a-z0-9][a-z0-9_-]*$/.test(key) && amount > 0));
}

function signedStat(value) {
  return Math.max(-100, Math.min(100, Math.floor(Number(value) || 0)));
}

function normalizeRelics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const relics = {};
  for (const [rawKey, rawRelic] of Object.entries(value)) {
    const key = String(rawKey).trim().toLowerCase().slice(0, 80);
    const rarity = String(rawRelic?.rarity || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(key) || !PET_RELIC_RARITIES.has(rarity)) continue;
    const effects = rawRelic?.effects && typeof rawRelic.effects === 'object' && !Array.isArray(rawRelic.effects) ? rawRelic.effects : {};
    relics[key] = { rarity, effects };
  }
  return relics;
}

export function normalizePetReward(reward = {}) {
  return {
    pet_xp: positiveInteger(reward.pet_xp, DAILY_PET_XP_CAP),
    community_xp: positiveInteger(reward.community_xp, DAILY_COMMUNITY_XP_CAP),
    moon_gold: positiveInteger(reward.moon_gold),
    moon_crystals: positiveInteger(reward.moon_crystals),
    style_tokens: positiveInteger(reward.style_tokens),
    materials: normalizeCollection(reward.materials),
    items: normalizeCollection(reward.items),
    relics: normalizeRelics(reward.relics),
  };
}

function normalizeProfileDeltas(value = {}) {
  return Object.fromEntries(['health', 'hunger', 'cleanliness', 'energy', 'happiness'].map((key) => [key, signedStat(value?.[key])]));
}

export function buildPetProfileDeltas(rewards = {}, costs = {}) {
  return Object.fromEntries(['health', 'hunger', 'cleanliness', 'energy', 'happiness'].map((key) => {
    const reward = Math.max(0, Number(rewards?.[key]) || 0);
    const cost = Math.max(0, Number(costs?.[key]) || 0);
    // Hunger is a negative need: costs make the pet hungrier, rewards recover it.
    return [key, signedStat(key === 'hunger' ? cost - reward : reward - cost)];
  }));
}

function normalizeCurrencyCosts(value = {}) {
  return Object.fromEntries(['moon_gold', 'moon_crystals', 'style_tokens'].map((key) => [key, positiveInteger(value?.[key])]));
}

function hasAccountWalletMovement(rewards = {}, costs = {}) {
  return ['moon_gold', 'moon_crystals', 'style_tokens'].some((key) => positiveInteger(rewards?.[key]) || positiveInteger(costs?.[key]));
}

export function validatePetRunModifier(modifier) {
  return validatePetRunModifierContent(modifier);
}

function getRewardAuthorization(source, telegramId, context = {}, now = new Date(), petId = '') {
  if (source === 'pet_daily_completion' || source === 'pet_season_finale') return completionRewardAuthorization(source, telegramId, petId, context);
  const runId = String(context.run_id || '').trim();
  const roomId = String(context.room_id || '').trim();
  if (source === 'pet_season_reward') {
    const tier = getPetSeasonRewardTier(context.tier_id);
    const seasonKey = String(context.season_key || '');
    if (!tier || !/^pet-s\d{4}-00[1-4]$/.test(seasonKey) || seasonKey > getMoonpetSeasonKey(now)) throw new Error('invalid_pet_reward_context');
    return { sql: `AND EXISTS (SELECT 1 FROM telegram_pet_season_state
      WHERE telegram_id=? AND season_key=? AND season_xp>=?)
      ${context.request_key ? `AND NOT EXISTS (SELECT 1 FROM telegram_pet_reward_claims previous
        WHERE previous.telegram_id=? AND previous.source='pet_season_reward' AND previous.status IN ('pending','awarded')
          AND previous.idempotency_key<>?
          AND json_extract(CASE WHEN json_valid(previous.metadata) THEN previous.metadata ELSE '{}' END,'$.context.request_key')=?)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_season_reward_claims previous
          WHERE previous.telegram_id=? AND previous.event_key=? AND (previous.season_key<>? OR previous.tier_id<>?))` : ''}`,
    args: [telegramId, seasonKey, tier.required_xp, ...(context.request_key
      ? [telegramId, `season_reward:${telegramId}:${seasonKey}:${tier.tier_id}`, context.request_key,
        telegramId, context.request_key, seasonKey, tier.tier_id] : [])] };
  }
  if (source === 'pet_market') {
    if (!context.pet_id || !context.season_key || !context.min_level) throw new Error('invalid_pet_reward_context');
    return { sql: `AND EXISTS (SELECT 1 FROM telegram_pet_instances p
      JOIN telegram_pet_active_slots a ON a.pet_id=p.pet_id AND a.telegram_id=p.telegram_id AND a.season_key=p.season_key
      JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=p.pet_id AND l.telegram_id=p.telegram_id
      WHERE p.pet_id=? AND p.telegram_id=? AND p.season_key=? AND p.status='active' AND l.phase<>'egg'
        AND ${getPetVisibleLevelSql('p.pet_xp')} >= ?)
      ${context.request_key ? `AND NOT EXISTS (SELECT 1 FROM telegram_pet_reward_claims previous
        WHERE previous.telegram_id=? AND previous.source='pet_market' AND previous.status IN ('pending','awarded')
          AND json_extract(CASE WHEN json_valid(previous.metadata) THEN previous.metadata ELSE '{}' END,'$.context.request_key')=?)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_system_events acknowledged
          WHERE acknowledged.pet_id='' AND acknowledged.telegram_id=? AND acknowledged.season_key=''
            AND acknowledged.system_key='market_request' AND acknowledged.action_key='purchase'
            AND acknowledged.period_key=? AND acknowledged.status='completed')` : ''}`,
    args: [context.pet_id, telegramId, context.season_key, context.min_level,
      ...(context.request_key ? [telegramId, context.request_key, telegramId, context.request_key] : [])] };
  }
  if (source === 'pet_job' || source === 'pet_adventure') {
    const adventure = source === 'pet_adventure';
    const seconds = adventure ? PET_ADVENTURE_COOLDOWN_SECONDS : PET_JOB_COOLDOWN_SECONDS;
    const cutoff = new Date(now.getTime() - seconds * 1000).toISOString();
    const minimumEnergy = positiveInteger(context.minimum_energy, 100);
    if (adventure && (!petId || !minimumEnergy)) throw new Error('invalid_pet_reward_context');
    return {
      sql: `AND NOT EXISTS (SELECT 1 FROM telegram_pet_events
        WHERE telegram_id = ? AND event_type = ? AND status IN ('pending', 'accepted')
          AND julianday(created_at) > julianday(?))
        ${adventure ? 'AND EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? AND energy >= ?)' : ''}`,
      args: [telegramId, adventure ? 'adventure' : 'work', cutoff, ...(adventure ? [petId, telegramId, minimumEnergy] : [])],
    };
  }
  if (source === 'pet_district' || source === 'pet_event_chain') {
    const systemEventId = String(context.system_event_id || '').trim();
    const petId = String(context.pet_id || '').trim();
    const petSeasonKey = String(context.pet_season_key || '').trim();
    if (!systemEventId || !petId || !petSeasonKey) throw new Error('invalid_pet_reward_context');
    return {
      sql: "AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id = ? AND telegram_id = ? AND pet_id = ? AND season_key = ? AND status IN ('settling','completed'))",
      args: [systemEventId, telegramId, petId, petSeasonKey],
    };
  }
  if (source === 'pet_seasonal_boss') {
    const seasonKey = String(context.season_key || '').trim();
    const petSeasonKey = String(context.pet_season_key || '').trim();
    const petId = String(context.pet_id || '').trim();
    const bossKey = String(context.boss_key || '').trim();
    if (!seasonKey || !bossKey) throw new Error('invalid_pet_reward_context');
    if ((petId && !petSeasonKey) || (!petId && petSeasonKey)) throw new Error('invalid_pet_reward_context');
    if (petId && petSeasonKey) {
      return {
        sql: 'AND EXISTS (SELECT 1 FROM telegram_pet_seasonal_boss_progress WHERE pet_id = ? AND telegram_id = ? AND pet_season_key = ? AND season_key = ? AND boss_key = ? AND defeated_at IS NOT NULL)',
        args: [petId, telegramId, petSeasonKey, seasonKey, bossKey],
      };
    }
    return {
      sql: "AND EXISTS (SELECT 1 FROM telegram_pet_seasonal_boss_progress WHERE pet_id = '' AND telegram_id = ? AND pet_season_key = '' AND season_key = ? AND boss_key = ? AND defeated_at IS NOT NULL)",
      args: [telegramId, seasonKey, bossKey],
    };
  }
  if (source === 'pet_expedition') {
    const dayKey = String(context.day_key || '').trim();
    const energyCost = positiveInteger(context.energy_cost, 100);
    const attempt = Number(context.attempt);
    const minimumLevel = positiveInteger(context.min_level, 100);
    if (!dayKey || !energyCost || !petId || !minimumLevel || !Number.isInteger(attempt) || attempt < 1 || attempt > 3) throw new Error('invalid_pet_reward_context');
    return {
      sql: `AND (SELECT COUNT(*) FROM telegram_pet_reward_claims
        WHERE telegram_id = ? AND source = 'pet_expedition' AND day_key = ? AND status IN ('pending', 'awarded')) < 3
        AND (SELECT COUNT(*) FROM telegram_pet_reward_claims
          WHERE telegram_id = ? AND source = 'pet_expedition' AND day_key = ? AND status IN ('pending', 'awarded')) = ?
        AND EXISTS (SELECT 1 FROM telegram_pet_instances p JOIN telegram_pet_lifecycle_by_pet l
          ON l.pet_id = p.pet_id AND l.telegram_id = p.telegram_id
          WHERE p.pet_id = ? AND p.telegram_id = ? AND p.status = 'active' AND l.phase <> 'egg'
            AND p.energy >= ? AND ${getPetVisibleLevelSql('p.pet_xp')} >= ?)`,
      args: [telegramId, dayKey, telegramId, dayKey, attempt - 1, petId, telegramId, energyCost, minimumLevel],
    };
  }
  if (source === 'pet_weekly_boss') {
    const weekKey = String(context.week_key || '');
    const bossId = String(context.boss_id || '');
    if (!weekKey || !bossId || !petId) throw new Error('invalid_pet_reward_context');
    return { sql: `AND EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_victories_by_pet v
      JOIN telegram_pet_weekly_boss_progress p ON p.telegram_id=v.telegram_id AND p.week_key=v.week_key AND p.boss_id=v.boss_id
      WHERE v.telegram_id=? AND v.pet_id=? AND v.week_key=? AND v.boss_id=? AND p.defeated_at IS NOT NULL)`,
    args: [telegramId, petId, weekKey, bossId] };
  }
  if (source === 'roguelite_completion') {
    if (!runId) throw new Error('invalid_pet_reward_context');
    return { sql: "AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('completed', 'extracted'))", args: [runId, telegramId] };
  }
  if (source === 'pet_contract') {
    const contractId = String(context.contract_id || '');
    const petId = String(context.pet_id || '');
    const seasonKey = String(context.season_key || '');
    const earnedAt = String(context.competition_earned_at || '');
    if (!contractId || !petId || !seasonKey) throw new Error('invalid_pet_reward_context');
    return { sql: `AND EXISTS (SELECT 1 FROM telegram_pet_contracts c
      JOIN telegram_pet_instances p ON p.pet_id=c.pet_id AND p.telegram_id=c.telegram_id AND p.season_key=c.season_key
      JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
      WHERE c.contract_id=? AND c.telegram_id=? AND c.pet_id=? AND c.season_key=? AND c.status='completed' AND c.reward_xp=20
        AND (?='' OR c.reward_day=date(?)))`, args: [contractId, telegramId, petId, seasonKey, earnedAt, earnedAt] };
  }
  if (source === 'pet_run_legacy') {
    if (!runId) throw new Error('invalid_pet_reward_context');
    const earnedAt = String(context.competition_earned_at || '');
    return { sql: "AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable', 'completed', 'extracted') AND (?='' OR julianday(completed_at)=julianday(?)))", args: [runId, telegramId, earnedAt, earnedAt] };
  }
  if (source === 'pet_arena' && context.competition_earned_at) {
    const battleId = String(context.match_id || '');
    if (!battleId || !petId) throw new Error('invalid_pet_reward_context');
    return { sql: `AND EXISTS (SELECT 1 FROM telegram_pet_arena_battles
      WHERE battle_id=? AND status='completed' AND julianday(completed_at)=julianday(?)
        AND ((player1_telegram_id=? AND player1_pet_id=?) OR (player2_telegram_id=? AND player2_pet_id=?)))`,
    args: [battleId, context.competition_earned_at, telegramId, petId, telegramId, petId] };
  }
  if (source === 'roguelite_room' || source === 'roguelite_boss') {
    if (!runId || !roomId) throw new Error('invalid_pet_reward_context');
    const bossGuard = source === 'roguelite_boss' ? "AND room_type = 'boss'" : '';
    // A saved official final-boss win may outlive a failed payout. Permit only
    // that source-backed ending to settle after completion/extraction.
    const dailyEndingGuard = source === 'roguelite_boss' ? ` OR EXISTS (
      SELECT 1 FROM telegram_pet_daily_runs d JOIN telegram_pet_runs r ON r.run_id=d.run_id AND r.telegram_id=d.telegram_id AND r.pet_id=d.pet_id
      JOIN telegram_pet_run_rooms f ON f.run_id=r.run_id AND f.telegram_id=r.telegram_id AND f.pet_id=r.pet_id AND f.room_number=r.max_room
      WHERE r.run_id=? AND r.telegram_id=? AND r.pet_id=? AND r.status IN ('completed','extracted') AND r.current_room>=r.max_room
        AND f.room_id=? AND f.status='resolved' AND f.room_type='boss' AND r.max_room>0
        AND json_valid(f.outcome_data) AND COALESCE(json_extract(f.outcome_data,'$.success'),1)<>0
        AND json_valid(f.generated_data) AND json_extract(f.generated_data,'$.boss_id')=?
    )` : '';
    return {
      sql: `AND EXISTS (SELECT 1 FROM telegram_pet_run_rooms WHERE room_id = ? AND run_id = ? AND telegram_id = ? AND status = 'resolved' ${bossGuard})
        AND (EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable'))${dailyEndingGuard})`,
      args: [roomId, runId, telegramId, runId, telegramId, ...(source === 'roguelite_boss' ? [runId, telegramId, petId, roomId, String(context.boss_id || '')] : [])],
    };
  }
  return { sql: '', args: [] };
}

export async function awardPetReward(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const petId = String(request.pet_id || '').trim();
  const source = String(request.source || '').trim().toLowerCase().slice(0, 80);
  const idempotencyKey = String(request.idempotency_key || '').trim().slice(0, 160);
  if (!telegramId || !PET_REWARD_SOURCES.includes(source) || !idempotencyKey) throw new Error('invalid_pet_reward_request');
  await reconcileLegacyPetInventory(db, telegramId);
  const now = request.now instanceof Date ? request.now : new Date(request.now || Date.now());
  const reservationId = String(request.reservation_id || '').trim();
  // Old nullable receipts retain account reward evidence, but do not identify
  // any lifetime owner. Recovery must not credit whichever pet is selected.
  const petlessReservation = Boolean(reservationId && !petId && request.preserve_petless_reservation === true);
  let rewards = normalizePetReward(request.rewards);
  if (source === 'pet_daily_completion' || source === 'pet_season_finale') {
    const daily = source === 'pet_daily_completion';
    const key = daily ? dailyCompletionKey(telegramId, request.context?.utc_day) : String(request.context?.reward_key || '');
    if (!petId || request.context?.season_key !== request.season_key || idempotencyKey !== key || request.event_key !== key
      || request.event_type !== (daily ? 'daily_completion' : 'season_finale')) throw Error('invalid_pet_reward_context');
    if (!daily && (!request.context?.competition_season_key || ![seasonFinaleKey(petId, request.context.competition_season_key), `season-finale:${petId}:${request.season_key}`].includes(key))) throw Error('invalid_pet_reward_context');
    rewards = normalizePetReward(daily ? DAILY_COMPLETION_REWARD : SEASON_FINALE_REWARD);
  }
  if (source === 'pet_season_reward') {
    const tier = getPetSeasonRewardTier(request.context?.tier_id);
    const key = `season_reward:${telegramId}:${request.context?.season_key}:${tier?.tier_id}`;
    if (!petId || !tier || idempotencyKey !== key || request.event_key !== key || request.event_type !== 'season_reward') throw Error('invalid_pet_reward_context');
    rewards = normalizePetReward({ ...tier.reward, style_tokens: positiveInteger(tier.reward.style_tokens) + positiveInteger(request.context?.evolution_stage, 5) });
  }
  if (source === 'pet_contract') {
    if (!petId || petId !== request.context?.pet_id || request.season_key !== request.context?.season_key || idempotencyKey !== request.context?.contract_id) throw new Error('invalid_pet_reward_context');
    rewards = normalizePetReward({ pet_xp: 20 });
  }
  if (source.startsWith('roguelite_')) rewards = {
    ...rewards,
    moon_gold: Math.min(rewards.moon_gold, MAX_ROGUELITE_MOON_GOLD_PER_CLAIM),
    moon_crystals: Math.min(rewards.moon_crystals, MAX_ROGUELITE_MOON_CRYSTALS_PER_CLAIM),
    style_tokens: Math.min(rewards.style_tokens, MAX_ROGUELITE_STYLE_TOKENS_PER_CLAIM),
  };
  const dayKey = String((reservationId && request.day_key) || now.toISOString().slice(0, 10));
  const weekDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekDay = weekDate.getUTCDay() || 7;
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - weekDay);
  const weekYearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((weekDate - weekYearStart) / 86400000) + 1) / 7);
  const weekKey = String((reservationId && request.week_key) || `${weekDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`);
  const seasonKey = String(request.season_key || getMoonpetSeasonKey(now));
  // Pet ownership and event receipts retain their original source season.
  // Reserved rewards retain their earning day even when recovered later.
  const competitionEarnedAt = ['pet_run_legacy', 'pet_contract', 'pet_arena'].includes(source) ? request.context?.competition_earned_at : null;
  if (competitionEarnedAt && !Number.isFinite(Date.parse(competitionEarnedAt))) throw new Error('invalid_pet_reward_context');
  const competitionSeasonKey = source === 'pet_season_finale' ? request.context.competition_season_key : getMoonpetSeasonKey(competitionEarnedAt || `${dayKey}T00:00:00.000Z`);
  // Community seasons can change within a UTC day. New rewards retain the
  // server's full source time; existing reservations use their saved receipt
  // time/day without substituting the recovery time or active pet's season.
  const communityEarnedAt = competitionEarnedAt || now.toISOString();
  const communityTimestampSql = reservationId ? communityReceiptTimestampSql('event') : '?';
  const authorization = getRewardAuthorization(source, telegramId, request.context, now, petId);
  const claimId = crypto.randomUUID();
  const eventId = reservationId || crypto.randomUUID();
  const finalizationId = crypto.randomUUID();
  const eventKey = String(request.event_key || `pet_reward:${source}:${idempotencyKey}`).slice(0, 220);
  const eventType = String(request.event_type || 'unified_reward').trim().toLowerCase().slice(0, 80);
  const xpAction = String(request.xp_action || `pet_${source}`).trim().toLowerCase().slice(0, 80);
  const reason = String(request.reason || 'reward_awarded').trim().slice(0, 120);
  const profileDeltas = normalizeProfileDeltas(petlessReservation ? {} : request.profile_deltas);
  const currencyCosts = normalizeCurrencyCosts(request.currency_costs);
  // Only verified earned bounty/season currency claims may skip egg state.
  // Keep its immutable pet receipt while paying account currencies alone.
  const eggCurrencyOnly = request.currency_only_egg_bounty === true || request.currency_only_egg_season_reward === true;
  const hasEggPolicy = Object.hasOwn(request, 'currency_only_egg_bounty') || Object.hasOwn(request, 'currency_only_egg_season_reward');
  const validEggPolicy = source === 'pet_bounty'
    ? request.currency_only_egg_bounty === true && !Object.hasOwn(request, 'currency_only_egg_season_reward')
    : source === 'pet_season_reward' && request.currency_only_egg_season_reward === true && !Object.hasOwn(request, 'currency_only_egg_bounty');
  if (hasEggPolicy && (!eggCurrencyOnly || !validEggPolicy || !petId || reservationId
    || rewards.pet_xp || rewards.community_xp || request.touch_streak === true
    || Object.keys(rewards.items).length || Object.keys(rewards.materials).length || Object.keys(rewards.relics).length
    || Object.values(profileDeltas).some(Boolean) || Object.values(currencyCosts).some(Boolean))) {
    throw new Error('invalid_pet_reward_context');
  }
  if (eggCurrencyOnly) {
    // Recheck the read-time egg decision in the settlement transaction. A
    // concurrent hatch, switch or deletion must not change its payout policy.
    authorization.sql += ` AND EXISTS (SELECT 1 FROM telegram_pet_instances p
      JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
      JOIN telegram_pet_active_slots a ON a.pet_id=p.pet_id AND a.telegram_id=p.telegram_id AND a.season_key=p.season_key
      JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=p.pet_id AND l.telegram_id=p.telegram_id
      WHERE p.pet_id=? AND p.telegram_id=? AND p.season_key=? AND p.status='active' AND s.status='active' AND l.phase='egg')`;
    authorization.args.push(petId, telegramId, seasonKey);
  }
  // Paid market bundles are all-or-nothing. Guard every included asset in the
  // same transaction as stock reservation and debit, before any capped writes.
  const capacity = { sql: '', args: [] };
  if (source === 'pet_market') {
    for (const [key, quantity] of Object.entries(rewards.items)) {
      capacity.sql += ` AND COALESCE((SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?),0) <= ?`;
      capacity.args.push(telegramId, key, MAX_CURRENCY - quantity);
    }
    for (const [key, quantity] of Object.entries(rewards.materials)) {
      capacity.sql += ' AND COALESCE((SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=?),0) <= ?';
      capacity.args.push(telegramId, key, 9999 - quantity);
    }
    for (const key of ['moon_gold', 'moon_crystals', 'style_tokens']) if (rewards[key]) {
      capacity.sql += ` AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND ${key} - ? + ? <= ?)`;
      capacity.args.push(telegramId, currencyCosts[key], rewards[key], MAX_CURRENCY);
    }
  }
  if (hasAccountWalletMovement(rewards, currencyCosts) && !(await ensurePetAccountWalletReadyForMutation(db, telegramId, now))) {
    return { accepted: false, duplicate: false, reason: 'wallet_reconciliation_recovery_pending', pet_xp_awarded: 0, xp_awarded: 0, rewards: normalizePetReward() };
  }
  if (!hasAccountWalletMovement(rewards, currencyCosts)) await reconcilePetInstanceWalletToProfile(db, telegramId, now);
  const touchStreak = request.touch_streak === true ? 1 : 0;
  const previousDay = new Date(`${dayKey}T00:00:00.000Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const previousDayKey = previousDay.toISOString().slice(0, 10);
  const reservationGuard = reservationId
    ? `AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND telegram_id = ? AND status = 'pending'
        ${petlessReservation ? 'AND pet_id IS NULL AND season_key=? AND day_key=? AND week_key=?' : ''})`
    : '';
  // A supplied pet_id is the immutable Pet XP/stat settlement target. Wallet
  // currencies remain account-owned on the compatibility profile row until a
  // dedicated account wallet table exists.
  const petAuthority = Boolean(petId);
  const petOwnerGuard = petAuthority
    ? 'AND EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? AND season_key = ?)'
    : '';
  // The immutable pet owns the reward, while every accepted account receipt
  // shares the daily allowance, including older nullable source evidence.
  const metadata = safeJson({ finalization_id: finalizationId, source, idempotency_key: idempotencyKey, requested: rewards, currency_costs: currencyCosts, profile_deltas: profileDeltas, context: request.context || {} });
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_claims
      (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, metadata, applied_rewards)
      SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?,
        json_object('moon_gold',MIN(?,MAX(0,?-moon_gold+?)),
          'moon_crystals',MIN(?,MAX(0,?-moon_crystals+?)),
          'style_tokens',MIN(?,MAX(0,?-style_tokens+?)))
      FROM telegram_pet_profiles WHERE telegram_id = ?
        AND moon_gold >= ? AND moon_crystals >= ? AND style_tokens >= ?
        AND ${accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id')}
      ${petOwnerGuard} ${authorization.sql} ${reservationGuard} ${capacity.sql}`)
      .bind(claimId, petId || null, telegramId, source, idempotencyKey, dayKey, safeJson(rewards), metadata,
        rewards.moon_gold, MAX_CURRENCY, currencyCosts.moon_gold,
        rewards.moon_crystals, MAX_CURRENCY, currencyCosts.moon_crystals,
        rewards.style_tokens, MAX_CURRENCY, currencyCosts.style_tokens, telegramId,
        currencyCosts.moon_gold, currencyCosts.moon_crystals, currencyCosts.style_tokens,
        ...(petAuthority ? [petId, telegramId, seasonKey] : []),
        ...authorization.args, ...(reservationId ? [reservationId, telegramId] : []),
        ...(petlessReservation ? [seasonKey, dayKey, weekKey] : []), ...capacity.args),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
      (id, pet_id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'pending', 'reward_pending', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')`)
      .bind(eventId, petId || null, telegramId, eventType, eventKey, seasonKey, dayKey, weekKey, metadata, claimId),
    db.prepare(`UPDATE telegram_pet_events SET pet_id = ?
      WHERE ? <> '' AND id = ? AND telegram_id = ? AND status = 'pending' AND pet_id IS NULL
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')`)
      .bind(petId || null, petId, eventId, telegramId, claimId),
    db.prepare(`UPDATE telegram_pet_events
      SET pet_xp_awarded = MIN(?, MAX(0, ? - (SELECT COALESCE(SUM(pet_xp_awarded), 0) FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'))),
          xp_awarded = MIN(?, MAX(0, ? - (SELECT COALESCE(SUM(xp_awarded), 0) FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'))),
          status = 'accepted', reason = ?, metadata = ?
      WHERE id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')
        ${petAuthority ? 'AND pet_id = ?' : 'AND pet_id IS NULL'}
      RETURNING pet_xp_awarded, xp_awarded`)
      .bind(rewards.pet_xp, DAILY_PET_XP_CAP, telegramId, dayKey, rewards.community_xp, DAILY_COMMUNITY_XP_CAP, telegramId, dayKey, reason, metadata, eventId, claimId, ...(petAuthority ? [petId] : [])),
    petlessReservation || eggCurrencyOnly
      ? db.prepare('SELECT 1')
      : db.prepare(`UPDATE ${petAuthority ? 'telegram_pet_instances' : 'telegram_pet_profiles'} SET
        pet_xp = pet_xp + COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0),
        ${petAuthority ? '' : 'moon_gold = MIN(?, MAX(0, moon_gold + ? - ?)), moon_crystals = MIN(?, MAX(0, moon_crystals + ? - ?)), style_tokens = MIN(?, MAX(0, style_tokens + ? - ?)),'}
        health = MIN(100, MAX(0, health + ?)), hunger = MIN(100, MAX(0, hunger + ?)),
        cleanliness = MIN(100, MAX(0, cleanliness + ?)), energy = MIN(100, MAX(0, energy + ?)), happiness = MIN(100, MAX(0, happiness + ?)),
        streak_days = CASE WHEN ? = 0 THEN streak_days WHEN last_active_day > ? THEN streak_days WHEN last_active_day = ? THEN MAX(1, streak_days) WHEN last_active_day = ? THEN streak_days + 1 ELSE 1 END,
        last_active_day = CASE WHEN ? = 0 THEN last_active_day WHEN last_active_day > ? THEN last_active_day ELSE ? END,
        last_decay_at = CASE WHEN ? = 0 OR julianday(last_decay_at) > julianday(?) THEN last_decay_at ELSE ? END,
        level = level,
        ${petAuthority ? `source_profile_updated_at = '${PET_INSTANCE_AUTHORITY_VERSION}',` : ''}
        updated_at = CURRENT_TIMESTAMP
      WHERE ${petAuthority ? 'pet_id = ? AND telegram_id = ?' : `telegram_id = ? AND ${accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id')}`}
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
      .bind(eventId, metadata,
        ...(petAuthority ? [] : [MAX_CURRENCY, rewards.moon_gold, currencyCosts.moon_gold, MAX_CURRENCY, rewards.moon_crystals, currencyCosts.moon_crystals, MAX_CURRENCY, rewards.style_tokens, currencyCosts.style_tokens]),
        profileDeltas.health, profileDeltas.hunger, profileDeltas.cleanliness, profileDeltas.energy, profileDeltas.happiness,
        touchStreak, dayKey, dayKey, previousDayKey, touchStreak, dayKey, dayKey, touchStreak, now.toISOString(), now.toISOString(),
        ...(petAuthority ? [petId, telegramId] : [telegramId]), eventId, metadata),
    petAuthority || petlessReservation
      ? db.prepare(`UPDATE telegram_pet_profiles SET
          moon_gold = MIN(?, MAX(0, moon_gold + ? - ?)),
          moon_crystals = MIN(?, MAX(0, moon_crystals + ? - ?)),
          style_tokens = MIN(?, MAX(0, style_tokens + ? - ?))
        WHERE telegram_id = ?
          AND ${accountWalletRecoveryResolvedSql('telegram_pet_profiles.telegram_id')}
          AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
        .bind(MAX_CURRENCY, rewards.moon_gold, currencyCosts.moon_gold, MAX_CURRENCY, rewards.moon_crystals, currencyCosts.moon_crystals, MAX_CURRENCY, rewards.style_tokens, currencyCosts.style_tokens,
          telegramId, eventId, metadata)
      : db.prepare(`SELECT 1 WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
        .bind(eventId, metadata),
    petlessReservation || eggCurrencyOnly
      ? db.prepare('SELECT 1')
      : db.prepare(`UPDATE ${petAuthority ? 'telegram_pet_instances' : 'telegram_pet_profiles'} SET
        stage = CASE WHEN pet_xp >= 1800 THEN 'legendary companion' WHEN pet_xp >= 900 THEN 'moon guardian'
          WHEN pet_xp >= 360 THEN 'street scout' WHEN pet_xp >= 120 THEN 'runner' WHEN pet_xp >= 25 THEN 'hatchling' ELSE 'egg' END,
        level = ${getPetVisibleLevelSql('pet_xp')},
        health = CASE WHEN ? <> 0 THEN health
          ELSE MIN(100, MAX(0, ROUND(((100 - hunger) + happiness + cleanliness + energy) / 4.0))) END
      WHERE ${petAuthority ? 'pet_id = ? AND telegram_id = ?' : 'telegram_id = ?'} AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
      .bind(profileDeltas.health, ...(petAuthority ? [petId, telegramId] : [telegramId]), eventId, metadata),
    db.prepare(`INSERT INTO telegram_xp_log (telegram_id, action, xp_change, reference_id)
      SELECT ?, ?, xp_awarded, ? FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted' AND xp_awarded > 0`)
      .bind(telegramId, xpAction, eventKey, eventId, metadata),
    db.prepare(`UPDATE telegram_users SET
        xp = xp + COALESCE((SELECT xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0),
        level = CAST((xp + COALESCE((SELECT xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0)) / 100 AS INTEGER) + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
      .bind(eventId, metadata, eventId, metadata, telegramId, eventId, metadata),
    db.prepare(`INSERT INTO telegram_leaderboard (telegram_id, season_id, xp)
      SELECT ?, season.id, event.xp_awarded FROM telegram_seasons AS season, telegram_pet_events AS event
      WHERE ${communitySeasonSql('season', communityTimestampSql)}
        AND event.id = ? AND event.metadata = ? AND event.status = 'accepted' AND event.xp_awarded > 0
      ORDER BY julianday(season.start_date) DESC, season.id DESC LIMIT 1
      ON CONFLICT(telegram_id, season_id) DO UPDATE SET xp = xp + excluded.xp, updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, ...(reservationId ? [] : [communityEarnedAt, communityEarnedAt]), eventId, metadata),
    db.prepare(`INSERT INTO telegram_pet_season_state (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, pet_xp_awarded, pet_xp_awarded, pet_xp_awarded, ?, ? FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key, weekly_key = excluded.weekly_key, updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, competitionSeasonKey, dayKey, weekKey, eventId, metadata),
  ];
  const rogueliteAsset = source.startsWith('roguelite_');
  for (const [kind, collection, dailyCap] of [['material', rewards.materials, DAILY_ROGUELITE_MATERIAL_CAP], ['item', rewards.items, DAILY_ROGUELITE_ITEM_CAP]]) {
    for (const [key, quantity] of Object.entries(collection)) {
      statements.push(
        db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_assets (claim_id, asset_type, asset_key, amount)
          SELECT ?, ?, ?, MIN(?, MAX(0, ? - COALESCE((
            SELECT SUM(asset.amount) FROM telegram_pet_reward_assets AS asset
            JOIN telegram_pet_reward_claims AS prior ON prior.claim_id = asset.claim_id
            WHERE prior.telegram_id = ? AND prior.day_key = ? AND prior.source LIKE 'roguelite_%' AND asset.asset_type = ?
          ), 0)), MAX(0, ? - COALESCE((SELECT quantity FROM ${kind === 'material' ? 'telegram_pet_material_balances' : 'telegram_pet_inventory'}
            WHERE telegram_id=? AND ${kind === 'material' ? 'material_key=?' : "asset_type='item' AND asset_key=?"}),0)))
          WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
          .bind(claimId, kind, key, quantity, rogueliteAsset ? dailyCap : MAX_CURRENCY, telegramId, dayKey, kind,
            kind === 'material' ? 9999 : MAX_CURRENCY, telegramId, key, eventId, metadata),
        kind === 'material'
          ? db.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity, updated_at)
              SELECT ?, asset_key, amount, CURRENT_TIMESTAMP FROM telegram_pet_reward_assets
              WHERE claim_id = ? AND asset_type = 'material' AND asset_key = ? AND amount > 0
              ON CONFLICT(telegram_id, material_key) DO UPDATE SET quantity = MIN(?, quantity + excluded.quantity), updated_at = CURRENT_TIMESTAMP`)
            .bind(telegramId, claimId, key, 9999)
          : db.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity, updated_at)
              SELECT ?, asset_type, asset_key, amount, CURRENT_TIMESTAMP FROM telegram_pet_reward_assets
              WHERE claim_id = ? AND asset_type = ? AND asset_key = ? AND amount > 0
              ON CONFLICT(telegram_id, asset_type, asset_key) DO UPDATE SET quantity = MIN(?, quantity + excluded.quantity), updated_at = CURRENT_TIMESTAMP`)
            .bind(telegramId, claimId, kind, key, MAX_CURRENCY),
      );
    }
  }
  for (const [relicId, relic] of Object.entries(rewards.relics)) {
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_assets (claim_id, asset_type, asset_key, amount)
        SELECT ?, 'relic', ?, CASE WHEN EXISTS (SELECT 1 FROM telegram_pet_relics WHERE telegram_id=? AND relic_id=?) THEN 0 ELSE 1 END
        WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
        .bind(claimId, relicId, telegramId, relicId, eventId, metadata),
      db.prepare(`INSERT OR IGNORE INTO telegram_pet_relics (telegram_id, relic_id, rarity, effects_json)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_reward_assets WHERE claim_id = ? AND asset_type = 'relic' AND asset_key = ?)`)
        .bind(telegramId, relicId, relic.rarity, safeJson(relic.effects), claimId, relicId),
    );
  }
  statements.push(db.prepare(`UPDATE telegram_pet_reward_claims SET status = 'awarded',
      applied_rewards = json_object('pet_xp', COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ?), 0),
        'community_xp', COALESCE((SELECT xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ?), 0),
        'moon_gold', json_extract(applied_rewards,'$.moon_gold'),
        'moon_crystals', json_extract(applied_rewards,'$.moon_crystals'),
        'style_tokens', json_extract(applied_rewards,'$.style_tokens'),
        'materials', json(COALESCE((SELECT json_group_object(asset_key, amount) FROM telegram_pet_reward_assets WHERE claim_id = ? AND asset_type = 'material' AND amount > 0), '{}')),
        'items', json(COALESCE((SELECT json_group_object(asset_key, amount) FROM telegram_pet_reward_assets WHERE claim_id = ? AND asset_type = 'item' AND amount > 0), '{}')),
        'relics', json(COALESCE((SELECT json_group_object(asset_key, amount) FROM telegram_pet_reward_assets WHERE claim_id = ? AND asset_type = 'relic' AND amount > 0), '{}'))), awarded_at = CURRENT_TIMESTAMP
      WHERE claim_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')
      RETURNING applied_rewards`)
    .bind(eventId, metadata, eventId, metadata, claimId, claimId, claimId, claimId, eventId, metadata));
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== statements.length) throw new Error('pet_state_write_unavailable');
  for (const result of results) requirePetMutationResult(result);
  const awarded = results?.[3]?.results?.[0];
  if (!awarded) {
    // The batch may have lost a race to an existing claim. A failed receipt
    // lookup cannot be treated as an unauthorized reward or a new callback.
    const existing = await db.prepare(`SELECT claim_id, status, applied_rewards FROM telegram_pet_reward_claims WHERE telegram_id = ? AND source = ? AND idempotency_key = ?`).bind(telegramId, source, idempotencyKey).first().then(requirePetFirstReadResult);
    return existing?.status === 'awarded'
      ? { accepted: true, duplicate: true, claim_id: existing.claim_id, pet_xp_awarded: 0, xp_awarded: 0,
        rewards: normalizePetReward(), receipt_rewards: JSON.parse(existing.applied_rewards) }
      : { accepted: false, duplicate: false, reason: existing ? 'reward_pending' : 'reward_not_authorized', pet_xp_awarded: 0, xp_awarded: 0, rewards: normalizePetReward() };
  }
  // Return the exact capped asset receipt from the settlement transaction.
  // Re-reading it after commit could reject a reward that has already paid.
  const receiptResult = requirePetMutationResult(results.at(-1));
  const receiptRows = receiptResult?.results;
  if (!Array.isArray(receiptRows) || receiptRows.length !== 1 || typeof receiptRows[0]?.applied_rewards !== 'string') {
    throw new Error('pet_reward_receipt_unavailable');
  }
  let receipt;
  try { receipt = JSON.parse(receiptRows[0].applied_rewards); } catch {}
  const receiptFields = ['pet_xp', 'community_xp', 'moon_gold', 'moon_crystals', 'style_tokens', 'materials', 'items', 'relics'];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || !receiptFields.every((field) => Object.hasOwn(receipt, field))
    || !receiptFields.slice(0, 5).every((field) => Number.isFinite(Number(receipt[field])))
    || !receiptFields.slice(5).every((field) => receipt[field] && typeof receipt[field] === 'object' && !Array.isArray(receipt[field]))) {
    throw new Error('pet_reward_receipt_unavailable');
  }
  const receiptRelics = Object.entries(receipt.relics);
  if (receiptRelics.some(([key, amount]) => !Object.hasOwn(rewards.relics, key) || positiveInteger(amount) !== 1)) {
    throw new Error('pet_reward_receipt_unavailable');
  }
  const appliedRewards = { ...normalizePetReward(receipt), relics: receipt.relics };
  const committed = {
    accepted: true,
    duplicate: false,
    claim_id: claimId,
    pet_xp_awarded: positiveInteger(awarded.pet_xp_awarded),
    xp_awarded: positiveInteger(awarded.xp_awarded),
    rewards: { ...appliedRewards, pet_xp: positiveInteger(awarded.pet_xp_awarded), community_xp: positiveInteger(awarded.xp_awarded) },
    profile_deltas: profileDeltas,
    currency_costs: currencyCosts,
    pet: null,
  };
  return projectCommittedPetResult(committed, async () => {
    const pet = await db.prepare(petAuthority
      ? `SELECT * FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ?`
      : `SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?`)
      .bind(...(petAuthority ? [petId, telegramId] : [telegramId])).first().then(requirePetFirstReadResult);
    const wallet = petAuthority
      ? await db.prepare(`SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id = ?`)
        .bind(telegramId).first().then(requirePetFirstReadResult)
      : null;
    return { ...committed, pet: wallet && pet ? { ...pet, moon_gold: wallet.moon_gold, moon_crystals: wallet.moon_crystals, style_tokens: wallet.style_tokens } : pet };
  });
}

function stableContentRoll(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function pickContentId(pool, roll) {
  return Array.isArray(pool) && pool.length > 0 ? pool[roll % pool.length] : null;
}

function buildPetBossRewards(boss, run, room) {
  const rewards = normalizePetReward(boss.rewards);
  const rollKey = `${run.run_id}:${room.room_id}:${boss.boss_id}`;
  const chanceRoll = stableContentRoll(`${rollKey}:chance`) % 10000;
  if (chanceRoll >= positiveInteger(boss.relic_chance_bps, 10000)) return rewards;
  const relicId = pickContentId(boss.relic_pool, stableContentRoll(`${rollKey}:relic`));
  const relic = PET_ROGUELITE_RELICS[relicId];
  if (!relic) return rewards;
  return { ...rewards, relics: { [relicId]: { rarity: relic.rarity, effects: relic.effects } } };
}

export function generatePetRunRoom(run) {
  const room = Math.max(1, Number(run.current_room || 0) + 1);
  const maxRoom = Math.max(room, Number(run.max_room || 5));
  const region = PET_ROGUELITE_REGIONS[String(run.region || 'moon_alley')] || PET_ROGUELITE_REGIONS.moon_alley;
  const seed = Math.floor(Number(run.seed) || 0);
  const bossRooms = region.room_pool.filter((roomId) => PET_ROGUELITE_ROOMS[roomId]?.room_type === 'boss');
  const regularRooms = region.room_pool.filter((roomId) => PET_ROGUELITE_ROOMS[roomId]?.room_type !== 'boss');
  const contentId = room === maxRoom
    ? pickContentId(bossRooms, stableContentRoll(`${seed}:${room}:boss`))
    : pickContentId(regularRooms, room - 1);
  const definition = PET_ROGUELITE_ROOMS[contentId];
  if (!definition) throw new Error('missing_pet_roguelite_room_content');
  const enemyPool = definition.enemy_pool?.length ? definition.enemy_pool : region.enemy_pool;
  const enemyId = ['battle', 'elite'].includes(definition.room_type)
    ? pickContentId(enemyPool, stableContentRoll(`${seed}:${room}:enemy`))
    : null;
  return {
    room_id: `${run.run_id}:${room}`,
    run_id: run.run_id,
    room,
    content_id: definition.room_id,
    name: definition.name,
    room_type: definition.room_type,
    choices: definition.choices,
    enemy_id: enemyId,
    boss_id: definition.boss_id || null,
    status: 'pending',
  };
}

export function resolvePetRunRoom(room, outcome = {}) {
  if (room?.status !== 'pending') return { ...room, duplicate: true };
  return { ...room, status: outcome.success === false ? 'failed' : 'resolved', outcome: { success: outcome.success !== false, ...outcome } };
}

async function resolveActiveRunPetId(db, telegramId) {
  const active = await db.prepare(`SELECT i.pet_id FROM telegram_pet_active_slots a
    JOIN telegram_pet_instances i ON i.pet_id = a.pet_id AND i.telegram_id = a.telegram_id
    WHERE a.telegram_id = ? AND i.status = 'active' LIMIT 1`).bind(telegramId).first().then(requirePetFirstReadResult);
  return String(active?.pet_id || '').trim() || null;
}

async function resolveRequestedRunPetId(db, telegramId, petId, seasonKey) {
  const requestedPetId = String(petId || '').trim();
  if (!requestedPetId) return null;
  const row = await db.prepare(`SELECT i.pet_id FROM telegram_pet_instances i
    JOIN telegram_pet_season_slots s ON s.pet_id = i.pet_id AND s.telegram_id = i.telegram_id
      AND s.season_key = i.season_key AND s.slot_number = i.slot_number
    WHERE i.pet_id = ? AND i.telegram_id = ? AND i.season_key = ? AND i.status = 'active' AND s.status = 'active'
    LIMIT 1`).bind(requestedPetId, telegramId, seasonKey).first().then(requirePetFirstReadResult);
  return String(row?.pet_id || '').trim() || null;
}

function requireRunPetId(run) {
  const petId = String(run?.pet_id || '').trim();
  if (!petId) throw new Error('run_pet_id_authority_missing');
  return petId;
}

function requireRunSeasonKey(run) {
  const seasonKey = String(run?.season_key || '').trim();
  if (!seasonKey) throw new Error('run_season_authority_missing');
  return seasonKey;
}

function runIdentityAuthority(run, extra = {}) {
  return {
    telegram_id: run.telegram_id,
    pet_id: requireRunPetId(run),
    season_key: requireRunSeasonKey(run),
    // A paid source may need identity repair after the original pet is archived.
    ...(extra.source_event_key ? { recover_source_event: true } : {}),
    ...extra,
  };
}

async function runAwardedRewards(db, run, source, idempotencyKey, result) {
  if (!result.duplicate) return result.rewards;
  // Duplicate callbacks grant no new assets. Identity repair still needs the
  // exact original payout, scoped to the saved run pet and reward key.
  const receipt = await db.prepare(`SELECT applied_rewards FROM telegram_pet_reward_claims
    WHERE telegram_id=? AND pet_id=? AND source=? AND idempotency_key=? AND status='awarded'`)
    .bind(run.telegram_id, requireRunPetId(run), source, idempotencyKey).first().then(requirePetFirstReadResult);
  let rewards;
  try { rewards = JSON.parse(receipt?.applied_rewards); } catch {}
  if (!rewards || typeof rewards !== 'object' || Array.isArray(rewards)
    || !Number.isSafeInteger(rewards.moon_gold) || rewards.moon_gold < 0) throw new Error('pet_reward_receipt_unavailable');
  return rewards;
}

export async function startPetRogueliteRun(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const region = PET_ROGUELITE_REGIONS[String(request.region || 'moon_alley')];
  if (!telegramId || !region) throw new Error('invalid_pet_roguelite_run');
  await recoverDeletedPetRunStarts(db, telegramId);
  const runId = String(request.run_id || `rogue-${crypto.randomUUID()}`).slice(0, 120);
  const seed = Math.floor(Number(request.seed) || 0);
  const maxRoom = Math.max(1, Math.min(100, Math.floor(Number(request.max_room) || region.max_rooms || 10)));
  const seasonKey = String(request.season_key || `pet-s${new Date().getUTCFullYear()}-001`);
  const requestedPetId = String(request.pet_id || '').trim();
  const petId = requestedPetId
    ? await resolveRequestedRunPetId(db, telegramId, requestedPetId, seasonKey)
    : await resolveActiveRunPetId(db, telegramId);
  if (requestedPetId && !petId) {
    return { accepted: false, duplicate: false, reason: 'run_pet_authority_mismatch', run_id: runId, pet_id: null,
      region: region.region_id, difficulty: region.difficulty, seed, max_room: maxRoom };
  }
  const existingRun = await db.prepare(`SELECT run_id, pet_id, season_key, region, difficulty, seed, max_room
    FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ?`)
    .bind(runId, telegramId).first().then(requirePetFirstReadResult);
  if (existingRun) {
    if (await isDeletedRunPet(db, { ...existingRun, telegram_id: telegramId })) return { accepted: false, duplicate: false, reason: 'run_source_recovery_required', run_id: runId, refresh_state: true };
    const existingPetId = String(existingRun.pet_id || '').trim();
    const existingSeasonKey = String(existingRun.season_key || '').trim();
    if (!existingPetId) {
      return { accepted: false, duplicate: true, reason: 'run_pet_authority_required',
        run_id: existingRun.run_id, pet_id: null, region: String(existingRun.region || ''),
        difficulty: Math.max(1, Math.floor(Number(existingRun.difficulty) || 1)), seed: Math.floor(Number(existingRun.seed) || 0),
        max_room: Math.max(1, Math.floor(Number(existingRun.max_room) || 1)) };
    }
    if (requestedPetId && (existingPetId !== petId || existingSeasonKey !== seasonKey)) {
      return { accepted: false, duplicate: false, reason: 'run_pet_authority_mismatch',
        run_id: existingRun.run_id, pet_id: existingPetId || null, season_key: existingSeasonKey || null,
        requested_pet_id: petId, requested_season_key: seasonKey,
        region: String(existingRun.region || ''), difficulty: Math.max(1, Math.floor(Number(existingRun.difficulty) || 1)),
        seed: Math.floor(Number(existingRun.seed) || 0), max_room: Math.max(1, Math.floor(Number(existingRun.max_room) || 1)) };
    }
    return { accepted: false, duplicate: true, reason: 'run_exists',
      run_id: existingRun.run_id, pet_id: existingPetId || null, region: String(existingRun.region || ''),
      difficulty: Math.max(1, Math.floor(Number(existingRun.difficulty) || 1)), seed: Math.floor(Number(existingRun.seed) || 0),
      max_room: Math.max(1, Math.floor(Number(existingRun.max_room) || 1)) };
  }
  if (!petId) throw new Error('active_pet_instance_not_found');
  const analyticsId = `${runId}:start`;
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_runs
      (id, pet_id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room, depth, max_depth, risk_level)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, 0, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)
        AND ${SELECTED_RUN_PET_SQL}`)
      .bind(crypto.randomUUID(), petId, telegramId, runId, seasonKey, region.region_id, region.difficulty, seed, maxRoom, maxRoom, region.difficulty, telegramId,
        petId, telegramId, seasonKey),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, pet_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, ?, 'run_start', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND pet_id=? AND season_key=?)`)
      .bind(analyticsId, petId, runId, telegramId, safeJson({ region: region.region_id, difficulty: region.difficulty, seed }), runId, telegramId, petId, seasonKey),
  ]);
  requireRunMutationResults(results, 2);
  const accepted = results[0].meta.changes === 1;
  const persistedRun = await db.prepare(`SELECT run_id, pet_id, season_key FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ?`)
    .bind(runId, telegramId).first().then(requirePetFirstReadResult);
  if (!persistedRun) return { accepted: false, duplicate: false, reason: 'run_start_state_changed', run_id: runId, refresh_state: true };
  if (persistedRun.pet_id !== petId || persistedRun.season_key !== seasonKey) return { accepted: false, duplicate: false, reason: 'run_pet_authority_mismatch', run_id: runId, refresh_state: true };
  if (persistedRun) await recordMoonpetMemory(db, {
    telegram_id: telegramId, pet_id: persistedRun.pet_id, season_key: persistedRun.season_key,
    event_key: `${runId}:memory:start`, memory_type: 'first_run', milestone: 'first_run',
  });
  if (!String(persistedRun?.pet_id || '').trim()) {
    return { accepted: false, duplicate: !accepted, reason: 'run_pet_authority_required', run_id: runId, pet_id: null,
      region: region.region_id, difficulty: region.difficulty, seed, max_room: maxRoom };
  }
  return { accepted, duplicate: !accepted, run_id: runId, pet_id: persistedRun.pet_id, region: region.region_id, difficulty: region.difficulty, seed, max_room: maxRoom };
}

export async function createPetRunRoom(db, run) {
  const room = generatePetRunRoom(run);
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_rooms
      (room_id, pet_id, run_id, telegram_id, room_number, room_type, status, generated_data)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(room.room_id, requireRunPetId(run), run.run_id, run.telegram_id, room.room, room.room_type, safeJson(room)),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, pet_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, ?, 'room_generated', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_run_rooms WHERE room_id = ?)`)
      .bind(`${room.room_id}:generated`, requireRunPetId(run), run.run_id, run.telegram_id, safeJson(room), room.room_id),
  ]);
  return { ...room, duplicate: !results?.[0]?.meta?.changes };
}

export async function persistPetRunRoomOutcome(db, run, room, outcome = {}, options = {}) {
  const resolved = resolvePetRunRoom(room, outcome);
  const tacticCount = Number.isSafeInteger(outcome.daily_tactic_count) ? outcome.daily_tactic_count : null;
  const dailyOutcome = tacticCount !== null || ['daily_moon_run_server_outcome_v1', 'daily_moon_run_server_outcome_v2'].includes(outcome.authority);
  const tacticGuard = tacticCount === null ? '' : ` AND
    (SELECT COUNT(*) FROM telegram_pet_run_modifiers WHERE run_id=? AND modifier_id IN ('daily_tactic_3','daily_tactic_6'))=?`;
  const dailyRunGuard = dailyOutcome ? ` AND EXISTS (SELECT 1 FROM telegram_pet_runs
    WHERE run_id=? AND telegram_id=? AND current_room=? AND status IN ('active','extractable'))` : '';
  const source = options.source_pet;
  const sourceGuard = source ? ` AND pet_id=? AND EXISTS (SELECT 1 FROM telegram_pet_instances p
    WHERE p.pet_id=? AND p.telegram_id=? AND p.season_key=?
      AND ${PET_CARE_SNAPSHOT_COLUMNS.map(column => `p.${column} IS ?`).join(' AND ')})` : '';
  const result = await db.prepare(`UPDATE telegram_pet_run_rooms SET status = ?, outcome_data = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE room_id = ? AND run_id = ? AND telegram_id=? AND status = 'pending'${tacticGuard}${dailyRunGuard}${sourceGuard} RETURNING room_id`)
    .bind(resolved.status, safeJson(resolved.outcome), room.room_id, run.run_id, run.telegram_id,
      ...(tacticCount === null ? [] : [run.run_id, tacticCount]),
      ...(dailyOutcome ? [run.run_id, run.telegram_id, room.room - 1] : []),
      ...(source ? [run.pet_id, run.pet_id, run.telegram_id, run.season_key,
        ...PET_CARE_SNAPSHOT_COLUMNS.map(column => source[column] ?? null)] : [])).first().then(requirePetFirstReadResult);
  if (!result) {
    const persisted = await db.prepare(`SELECT status, outcome_data FROM telegram_pet_run_rooms WHERE room_id=? AND run_id=? AND telegram_id=?`)
      .bind(room.room_id, run.run_id, run.telegram_id).first().then(requirePetFirstReadResult);
    // A losing request must use the winning persisted outcome, never its own roll.
    return { ...room, status: persisted?.status || 'pending', outcome: JSON.parse(persisted?.outcome_data || '{}'), duplicate: true };
  }
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, pet_id, run_id, telegram_id, event_type, event_data)
    VALUES (?, ?, ?, ?, 'room_resolved', ?)`).bind(`${room.room_id}:resolved`, requireRunPetId(run), run.run_id, run.telegram_id, safeJson({ room: room.room, room_type: room.room_type, outcome: resolved.outcome })).run();
  return resolved;
}

export async function choosePetRunModifier(db, run, modifierId) {
  const modifier = PET_RUN_MODIFIERS[String(modifierId || '')];
  if (!modifier) throw new Error('unknown_pet_run_modifier');
  validatePetRunModifier(modifier);
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_modifiers (run_id, pet_id, telegram_id, modifier_id, effects_json)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable'))`)
      .bind(run.run_id, requireRunPetId(run), run.telegram_id, modifier.modifier_id, safeJson(modifier.effects), run.run_id, run.telegram_id),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, pet_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, ?, 'modifier_chosen', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_run_modifiers WHERE run_id = ? AND modifier_id = ?)`)
      .bind(`${run.run_id}:modifier:${modifier.modifier_id}`, requireRunPetId(run), run.run_id, run.telegram_id, safeJson(modifier), run.run_id, modifier.modifier_id),
  ]);
  return { accepted: Boolean(results?.[0]?.meta?.changes), duplicate: !results?.[0]?.meta?.changes, modifier };
}

export async function rewardPetRunRoom(db, run, room, rewards = {}, costs = {}) {
  if (room?.status !== 'resolved') return { accepted: false, reason: 'room_not_resolved' };
  const eventKey = `pet_reward:roguelite_room:${room.room_id}`;
  const awarded = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    pet_id: requireRunPetId(run),
    season_key: requireRunSeasonKey(run),
    source: 'roguelite_room',
    idempotency_key: room.room_id,
    event_key: eventKey,
    event_type: 'roguelite_room',
    rewards,
    profile_deltas: buildPetProfileDeltas(rewards, costs),
    context: { run_id: run.run_id, room_id: room.room_id, room: room.room, room_type: room.room_type },
  });
  if (awarded.accepted && !awarded.duplicate) {
    await db.prepare(`UPDATE telegram_pet_run_analytics SET event_data = json_set(event_data,
      '$.rewards', json(?), '$.relics_discovered', json(?)) WHERE analytics_id = ?`)
      .bind(safeJson(awarded.rewards), safeJson(Object.keys(awarded.rewards?.relics || {})), `${room.room_id}:resolved`).run();
  }
  if (awarded.accepted) {
    const earnedRewards = await runAwardedRewards(db, run, 'roguelite_room', room.room_id, awarded);
    const behaviour = ['battle', 'elite', 'boss'].includes(String(room.room_type)) ? 'combat' : 'exploration';
    await recordMoonpetBehaviour(db, runIdentityAuthority(run, { event_key: `${room.room_id}:personality`, source_event_key: eventKey, source_event_type: 'roguelite_room', behaviour,
      activity: behaviour === 'exploration' ? 'adventure' : 'combat' }));
    await recordMoonpetBiggestReward(db, runIdentityAuthority(run, {
      event_key: `${room.room_id}:biggest-reward`, source_event_key: eventKey, source_event_type: 'roguelite_room',
      reward_amount: earnedRewards?.moon_gold, reward_currency: 'moon_gold',
    }));
  }
  return awarded;
}

export async function rewardPetRogueliteBoss(db, run, bossId, room = null) {
  const boss = PET_ROGUELITE_BOSSES[bossId];
  if (!boss) throw new Error('unknown_pet_roguelite_boss');
  const persistedRoom = room?.room_id
    ? room
    : await db.prepare(`SELECT room_id, room_number AS room, room_type, status FROM telegram_pet_run_rooms
        WHERE run_id = ? AND telegram_id = ? AND room_type = 'boss' AND status = 'resolved' ORDER BY room_number DESC LIMIT 1`)
      .bind(run.run_id, run.telegram_id).first().then(requirePetFirstReadResult);
  if (!persistedRoom?.room_id) return { accepted: false, reason: 'boss_room_not_resolved', pet_xp_awarded: 0, xp_awarded: 0 };
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, pet_id, run_id, telegram_id, event_type, event_data)
    VALUES (?, ?, ?, ?, 'boss_fought', ?)`).bind(`${run.run_id}:boss:${persistedRoom.room_id}:${bossId}:attempt`, requireRunPetId(run), run.run_id, run.telegram_id,
      safeJson({ boss_id: bossId, room_id: persistedRoom.room_id, name: boss.name, difficulty: boss.difficulty, outcome: 'attempt' })).run();
  const rewards = buildPetBossRewards(boss, run, persistedRoom);
  const eventKey = `pet_reward:roguelite_boss:${persistedRoom.room_id}:${bossId}`;
  const awarded = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    pet_id: requireRunPetId(run),
    season_key: requireRunSeasonKey(run),
    source: 'roguelite_boss',
    idempotency_key: `${persistedRoom.room_id}:${bossId}`,
    event_key: eventKey,
    event_type: 'roguelite_boss',
    rewards,
    profile_deltas: buildPetProfileDeltas(rewards, boss.costs),
    context: { run_id: run.run_id, room_id: persistedRoom.room_id, boss_id: bossId },
  });
  const earnedRewards = awarded.accepted
    ? await runAwardedRewards(db, run, 'roguelite_boss', `${persistedRoom.room_id}:${bossId}`, awarded) : null;
  if (awarded.accepted && !awarded.duplicate) {
    await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, pet_id, run_id, telegram_id, event_type, event_data)
      VALUES (?, ?, ?, ?, 'boss_fought', ?)`).bind(`${run.run_id}:boss:${persistedRoom.room_id}:${bossId}:win`, requireRunPetId(run), run.run_id, run.telegram_id,
        safeJson({ boss_id: bossId, room_id: persistedRoom.room_id, outcome: 'win', rewards: awarded.rewards,
          relics_discovered: Object.keys(awarded.rewards?.relics || {}), achievement_id: boss.achievement_id || null })).run();
  }
  if (awarded.accepted && awarded.duplicate) {
    const analyticsId = `${run.run_id}:boss:${persistedRoom.room_id}:${bossId}:win`;
    const existing = await db.prepare('SELECT 1 AS recorded FROM telegram_pet_run_analytics WHERE analytics_id=?').bind(analyticsId).first().then(requirePetFirstReadResult);
    if (!existing) {
      // Duplicate results deliberately contain zero rewards. Recover the win
      // from the awarded receipt, never from that empty callback payload.
      await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, pet_id, run_id, telegram_id, event_type, event_data)
        VALUES (?, ?, ?, ?, 'boss_fought', ?)`).bind(analyticsId, requireRunPetId(run), run.run_id, run.telegram_id,
          safeJson({ boss_id: bossId, room_id: persistedRoom.room_id, outcome: 'win', rewards: earnedRewards,
            relics_discovered: Object.keys(earnedRewards.relics || {}), achievement_id: boss.achievement_id || null })).run();
    }
  }
  if (awarded.accepted) {
    await recordMoonpetBehaviour(db, runIdentityAuthority(run, {
      event_key: `${persistedRoom.room_id}:${bossId}:personality`, source_event_key: eventKey, source_event_type: 'roguelite_boss',
      behaviour: 'combat', activity: 'combat', amount: 2,
    }));
    await recordMoonpetMemory(db, runIdentityAuthority(run, {
      event_key: `${persistedRoom.room_id}:${bossId}:memory`, source_event_key: eventKey, source_event_type: 'roguelite_boss',
      memory_type: 'boss_victory', boss_id: bossId, milestone: 'first_boss_victory',
      reward_amount: earnedRewards?.moon_gold, reward_currency: 'moon_gold',
    }));
  }
  return awarded;
}

export async function finishPetRogueliteRun(db, run, status, analytics = {}, options = {}) {
  if (!PET_RUN_STATUSES.includes(status) || status === 'active') throw new Error('invalid_terminal_run_status');
  const durationSeconds = Math.max(0, Math.floor((Date.now() - parsePersistedTimestamp(run.started_at)) / 1000));
  const finalizationId = `${run.run_id}:end`;
  const dailyExpectedRoom = options.daily_expected_room;
  const dailyExtractionGuard = status === 'extracted' && Number.isSafeInteger(dailyExpectedRoom)
    ? ` AND current_room=? AND NOT EXISTS (SELECT 1 FROM telegram_pet_run_rooms pending
        WHERE pending.run_id=telegram_pet_runs.run_id AND pending.telegram_id=telegram_pet_runs.telegram_id
          AND pending.pet_id=telegram_pet_runs.pet_id AND pending.room_number=telegram_pet_runs.current_room+1
          AND pending.status IN ('resolved','failed'))` : '';
  const roomsCompleted = positiveInteger(analytics.rooms_completed ?? run.current_room);
  const terminalAnalytics = {
    status,
    depth: roomsCompleted,
    duration_seconds: durationSeconds,
    extracted: status === 'extracted',
    ...analytics,
  };
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_runs SET status = ?, ended_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP,
        death_reason = ?, rewards_earned = ?, rooms_completed = ?, modifiers_chosen = ?, boss_fought = ?, updated_at = CURRENT_TIMESTAMP
        WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable')${dailyExtractionGuard} RETURNING run_id`)
      .bind(status, analytics.death_reason || null, safeJson(analytics.rewards_earned || {}), roomsCompleted, safeJson(analytics.modifiers_chosen || []), analytics.boss_fought || null, run.run_id, run.telegram_id,
        ...(dailyExtractionGuard ? [dailyExpectedRoom] : [])),
    db.prepare(`DELETE FROM telegram_pet_run_modifiers WHERE run_id = ?
      AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status = ?)`)
      .bind(run.run_id, run.run_id, run.telegram_id, status),
    db.prepare(`INSERT INTO telegram_pet_run_history
      (telegram_id, runs_completed, bosses_defeated, highest_room_reached, best_score, fastest_completion_seconds, rare_discoveries)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status = ?)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_run_analytics WHERE analytics_id = ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        runs_completed = runs_completed + excluded.runs_completed,
        bosses_defeated = bosses_defeated + excluded.bosses_defeated,
        highest_room_reached = MAX(highest_room_reached, excluded.highest_room_reached),
        best_score = MAX(best_score, excluded.best_score),
        fastest_completion_seconds = CASE WHEN excluded.fastest_completion_seconds IS NULL THEN fastest_completion_seconds
          WHEN fastest_completion_seconds IS NULL THEN excluded.fastest_completion_seconds ELSE MIN(fastest_completion_seconds, excluded.fastest_completion_seconds) END,
        rare_discoveries = CASE WHEN excluded.rare_discoveries = '[]' THEN rare_discoveries ELSE excluded.rare_discoveries END,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(run.telegram_id, ['completed', 'extracted'].includes(status) ? 1 : 0, ['completed', 'extracted'].includes(status) && analytics.boss_fought ? 1 : 0,
        roomsCompleted, positiveInteger(run.score), ['completed', 'extracted'].includes(status) ? durationSeconds : null,
        safeJson(analytics.rare_discoveries || []), run.run_id, run.telegram_id, status, finalizationId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, pet_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, ?, 'run_end', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status = ?)`)
      .bind(finalizationId, requireRunPetId(run), run.run_id, run.telegram_id, safeJson(terminalAnalytics), run.run_id, run.telegram_id, status),
  ]);
  const terminal = results?.[0]?.results?.[0];
  if (!terminal) {
    const existing = await db.prepare('SELECT status FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ?').bind(run.run_id, run.telegram_id).first().then(requirePetFirstReadResult);
    if (['completed', 'extracted'].includes(existing?.status)) {
      await recordMoonpetBehaviour(db, runIdentityAuthority(run, { event_key: `${run.run_id}:terminal:personality`, behaviour: 'exploration', activity: 'adventure', amount: 2 }));
      await recordMoonpetMemory(db, runIdentityAuthority(run, { event_key: `${run.run_id}:terminal:memory`,
        memory_type: existing.status === 'extracted' ? 'extraction' : 'run_completed',
        milestone: existing.status === 'extracted' ? 'first_extraction' : 'first_run_completed' }));
    }
    return { accepted: true, duplicate: true, status: existing?.status || null };
  }
  if (['completed', 'extracted'].includes(status)) {
    await recordMoonpetBehaviour(db, runIdentityAuthority(run, { event_key: `${run.run_id}:terminal:personality`, behaviour: 'exploration', activity: 'adventure', amount: 2 }));
    await recordMoonpetMemory(db, runIdentityAuthority(run, { event_key: `${run.run_id}:terminal:memory`,
      memory_type: status === 'extracted' ? 'extraction' : 'run_completed',
      milestone: status === 'extracted' ? 'first_extraction' : 'first_run_completed' }));
  }
  return { accepted: true, duplicate: false, status };
}

export function advancePetRun(run, resolvedRoom) {
  if (resolvedRoom?.status !== 'resolved') throw new Error('room_not_resolved');
  const currentRoom = Math.max(Number(run.current_room || 0), Number(resolvedRoom.room || 0));
  return { ...run, current_room: currentRoom, score: positiveInteger(Number(run.score || 0) + Number(resolvedRoom.outcome?.score || 0)) };
}

export async function completePetRun(db, run, completionRewards = {}, analytics = {}) {
  if (!String(run?.pet_id || '').trim()) return { accepted: false, duplicate: false, reason: 'run_pet_authority_required', status: run?.status || null, reward: null };
  const terminal = await finishPetRogueliteRun(db, run, 'completed', analytics);
  if (terminal.status !== 'completed') return { ...terminal, reward: null };
  const reward = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    pet_id: requireRunPetId(run),
    season_key: requireRunSeasonKey(run),
    source: 'roguelite_completion',
    idempotency_key: run.run_id,
    event_key: `pet_reward:roguelite_completion:${run.run_id}`,
    event_type: 'roguelite_completion',
    rewards: completionRewards,
    context: { run_id: run.run_id, rooms_completed: analytics.rooms_completed ?? run.current_room },
  });
  if (reward.accepted && !reward.duplicate) {
    await db.prepare(`UPDATE telegram_pet_run_analytics SET event_data = json_set(event_data,
      '$.rewards', json(?), '$.relics_discovered', json(?)) WHERE analytics_id = ?`)
      .bind(safeJson(reward.rewards), safeJson(Object.keys(reward.rewards?.relics || {})), `${run.run_id}:end`).run();
  }
  if (reward.accepted) {
    const earnedRewards = await runAwardedRewards(db, run, 'roguelite_completion', run.run_id, reward);
    await recordMoonpetBiggestReward(db, runIdentityAuthority(run, {
      event_key: `${run.run_id}:completion:biggest-reward`,
      source_event_key: `pet_reward:roguelite_completion:${run.run_id}`,
      source_event_type: 'roguelite_completion',
      reward_amount: earnedRewards?.moon_gold, reward_currency: 'moon_gold',
    }));
  }
  return { ...terminal, duplicate: Boolean(reward.duplicate), ending_replayed: Boolean(terminal.duplicate),
    reward_pending: !reward.accepted, reward };
}
export async function extractPetRogueliteRun(db, run, extractionRewards = {}, analytics = {}, options = {}) {
  if (!String(run?.pet_id || '').trim()) return { accepted: false, duplicate: false, reason: 'run_pet_authority_required', status: run?.status || null, reward: null };
  const terminal = await finishPetRogueliteRun(db, run, 'extracted', { ...analytics, extracted: true }, options);
  if (terminal.status !== 'extracted') return { ...terminal, reward: null };
  const reward = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    pet_id: requireRunPetId(run),
    season_key: requireRunSeasonKey(run),
    source: 'roguelite_completion',
    idempotency_key: `${run.run_id}:extract`,
    event_key: `pet_reward:roguelite_completion:${run.run_id}:extract`,
    event_type: 'roguelite_completion',
    rewards: extractionRewards,
    context: { run_id: run.run_id, rooms_completed: analytics.rooms_completed ?? run.current_room, extracted: true },
  });
  if (reward.accepted && !reward.duplicate) {
    await db.prepare(`UPDATE telegram_pet_run_analytics SET event_data = json_set(event_data,
      '$.rewards', json(?), '$.relics_discovered', json(?)) WHERE analytics_id = ?`)
      .bind(safeJson(reward.rewards), safeJson(Object.keys(reward.rewards?.relics || {})), `${run.run_id}:end`).run();
  }
  if (reward.accepted) {
    const earnedRewards = await runAwardedRewards(db, run, 'roguelite_completion', `${run.run_id}:extract`, reward);
    await recordMoonpetBiggestReward(db, runIdentityAuthority(run, {
      event_key: `${run.run_id}:extraction:biggest-reward`,
      source_event_key: `pet_reward:roguelite_completion:${run.run_id}:extract`,
      source_event_type: 'roguelite_completion',
      reward_amount: earnedRewards?.moon_gold, reward_currency: 'moon_gold',
    }));
  }
  return { ...terminal, duplicate: Boolean(reward.duplicate), ending_replayed: Boolean(terminal.duplicate),
    reward_pending: !reward.accepted, reward };
}
export const failPetRun = (db, run, analytics = {}) => finishPetRogueliteRun(db, run, 'failed', analytics);
export const abandonPetRun = (db, run, analytics = {}) => finishPetRogueliteRun(db, run, 'abandoned', analytics);

export const __rogueliteFoundationTestHooks = Object.freeze({
  buildPetBossRewards,
  DAILY_PET_XP_CAP,
  DAILY_COMMUNITY_XP_CAP,
  DAILY_ROGUELITE_MATERIAL_CAP,
  DAILY_ROGUELITE_ITEM_CAP,
  MAX_ROGUELITE_MOON_GOLD_PER_CLAIM,
  MAX_ROGUELITE_MOON_CRYSTALS_PER_CLAIM,
  MAX_ROGUELITE_STYLE_TOKENS_PER_CLAIM,
  PERMANENT_REWARD_KEYS,
});

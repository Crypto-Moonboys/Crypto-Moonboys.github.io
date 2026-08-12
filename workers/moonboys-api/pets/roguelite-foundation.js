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
import { recordMoonpetBehaviour, recordMoonpetBiggestReward, recordMoonpetMemory } from './moonpet-identity.js';
import { reconcileLegacyPetInventory } from './inventory-cutover.js';

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
const MAX_CURRENCY = 999999;

export const PET_RUN_STATUSES = Object.freeze(['active', 'completed', 'failed', 'abandoned', 'extracted']);
export const PET_ROOM_TYPES = Object.freeze(['battle', 'choice_event', 'loot', 'elite', 'boss']);
export const PET_REWARD_SOURCES = Object.freeze([
  'pet_event', 'pet_kaiju', 'pet_job', 'pet_activity', 'pet_adventure', 'pet_arena', 'pet_run_legacy', 'pet_action', 'pet_item_use',
  'pet_weekly_boss', 'pet_season_reward',
  'pet_bounty', 'pet_expedition', 'pet_market',
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

export function validatePetRunModifier(modifier) {
  return validatePetRunModifierContent(modifier);
}

function getRewardAuthorization(source, telegramId, context = {}) {
  const runId = String(context.run_id || '').trim();
  const roomId = String(context.room_id || '').trim();
  if (source === 'pet_expedition') {
    const dayKey = String(context.day_key || '').trim();
    const energyCost = positiveInteger(context.energy_cost, 100);
    if (!dayKey || !energyCost) throw new Error('invalid_pet_reward_context');
    return {
      sql: `AND (SELECT COUNT(*) FROM telegram_pet_reward_claims
        WHERE telegram_id = ? AND source = 'pet_expedition' AND day_key = ? AND status IN ('pending', 'awarded')) < 3
        AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ? AND energy >= ?)`,
      args: [telegramId, dayKey, telegramId, energyCost],
    };
  }
  if (source === 'roguelite_completion') {
    if (!runId) throw new Error('invalid_pet_reward_context');
    return { sql: "AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('completed', 'extracted'))", args: [runId, telegramId] };
  }
  if (source === 'pet_run_legacy') {
    if (!runId) throw new Error('invalid_pet_reward_context');
    return { sql: "AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable', 'completed', 'extracted'))", args: [runId, telegramId] };
  }
  if (source === 'roguelite_room' || source === 'roguelite_boss') {
    if (!runId || !roomId) throw new Error('invalid_pet_reward_context');
    const bossGuard = source === 'roguelite_boss' ? "AND room_type = 'boss'" : '';
    return {
      sql: `AND EXISTS (SELECT 1 FROM telegram_pet_run_rooms WHERE room_id = ? AND run_id = ? AND telegram_id = ? AND status = 'resolved' ${bossGuard})
        AND EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable'))`,
      args: [roomId, runId, telegramId, runId, telegramId],
    };
  }
  return { sql: '', args: [] };
}

export async function awardPetReward(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const source = String(request.source || '').trim().toLowerCase().slice(0, 80);
  const idempotencyKey = String(request.idempotency_key || '').trim().slice(0, 160);
  if (!telegramId || !PET_REWARD_SOURCES.includes(source) || !idempotencyKey) throw new Error('invalid_pet_reward_request');
  await reconcileLegacyPetInventory(db, telegramId);
  const reservationId = String(request.reservation_id || '').trim();
  let rewards = normalizePetReward(request.rewards);
  if (source.startsWith('roguelite_')) rewards = {
    ...rewards,
    moon_gold: Math.min(rewards.moon_gold, MAX_ROGUELITE_MOON_GOLD_PER_CLAIM),
    moon_crystals: Math.min(rewards.moon_crystals, MAX_ROGUELITE_MOON_CRYSTALS_PER_CLAIM),
    style_tokens: Math.min(rewards.style_tokens, MAX_ROGUELITE_STYLE_TOKENS_PER_CLAIM),
  };
  const now = request.now instanceof Date ? request.now : new Date(request.now || Date.now());
  const dayKey = String((reservationId && request.day_key) || now.toISOString().slice(0, 10));
  const weekDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekDay = weekDate.getUTCDay() || 7;
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - weekDay);
  const weekYearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((weekDate - weekYearStart) / 86400000) + 1) / 7);
  const weekKey = String((reservationId && request.week_key) || `${weekDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`);
  const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - yearStart) / 86400000);
  const seasonKey = String((reservationId && request.season_key) || `pet-s${now.getUTCFullYear()}-${String(Math.floor(dayOfYear / 90) + 1).padStart(3, '0')}`);
  const authorization = getRewardAuthorization(source, telegramId, request.context);
  const claimId = crypto.randomUUID();
  const eventId = reservationId || crypto.randomUUID();
  const finalizationId = crypto.randomUUID();
  const eventKey = String(request.event_key || `pet_reward:${source}:${idempotencyKey}`).slice(0, 220);
  const eventType = String(request.event_type || 'unified_reward').trim().toLowerCase().slice(0, 80);
  const xpAction = String(request.xp_action || `pet_${source}`).trim().toLowerCase().slice(0, 80);
  const reason = String(request.reason || 'reward_awarded').trim().slice(0, 120);
  const profileDeltas = normalizeProfileDeltas(request.profile_deltas);
  const currencyCosts = normalizeCurrencyCosts(request.currency_costs);
  const touchStreak = request.touch_streak === true ? 1 : 0;
  const previousDay = new Date(`${dayKey}T00:00:00.000Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const previousDayKey = previousDay.toISOString().slice(0, 10);
  const reservationGuard = reservationId
    ? 'AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND telegram_id = ? AND status = \'pending\')'
    : '';
  const metadata = safeJson({ finalization_id: finalizationId, source, idempotency_key: idempotencyKey, requested: rewards, currency_costs: currencyCosts, profile_deltas: profileDeltas, context: request.context || {} });
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_claims
      (claim_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, metadata)
      SELECT ?, ?, ?, ?, ?, 'pending', ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?
        AND moon_gold >= ? AND moon_crystals >= ? AND style_tokens >= ?)
      ${authorization.sql} ${reservationGuard}`)
      .bind(claimId, telegramId, source, idempotencyKey, dayKey, safeJson(rewards), safeJson(request.context || {}), telegramId,
        currencyCosts.moon_gold, currencyCosts.moon_crystals, currencyCosts.style_tokens,
        ...authorization.args, ...(reservationId ? [reservationId, telegramId] : [])),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
      (id, telegram_id, event_type, event_key, xp_awarded, pet_xp_awarded, season_key, day_key, week_key, status, reason, metadata)
      SELECT ?, ?, ?, ?, 0, 0, ?, ?, ?, 'pending', 'reward_pending', ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')`)
      .bind(eventId, telegramId, eventType, eventKey, seasonKey, dayKey, weekKey, metadata, claimId),
    db.prepare(`UPDATE telegram_pet_events
      SET pet_xp_awarded = MIN(?, MAX(0, ? - (SELECT COALESCE(SUM(pet_xp_awarded), 0) FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'))),
          xp_awarded = MIN(?, MAX(0, ? - (SELECT COALESCE(SUM(xp_awarded), 0) FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND status = 'accepted'))),
          status = 'accepted', reason = ?, metadata = ?
      WHERE id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE claim_id = ? AND status = 'pending')
      RETURNING pet_xp_awarded, xp_awarded`)
      .bind(rewards.pet_xp, DAILY_PET_XP_CAP, telegramId, dayKey, rewards.community_xp, DAILY_COMMUNITY_XP_CAP, telegramId, dayKey, reason, metadata, eventId, claimId),
    db.prepare(`UPDATE telegram_pet_profiles SET
        pet_xp = pet_xp + COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0),
        moon_gold = MIN(?, MAX(0, moon_gold + ? - ?)), moon_crystals = MIN(?, MAX(0, moon_crystals + ? - ?)), style_tokens = MIN(?, MAX(0, style_tokens + ? - ?)),
        health = MIN(100, MAX(0, health + ?)), hunger = MIN(100, MAX(0, hunger + ?)),
        cleanliness = MIN(100, MAX(0, cleanliness + ?)), energy = MIN(100, MAX(0, energy + ?)), happiness = MIN(100, MAX(0, happiness + ?)),
        streak_days = CASE WHEN ? = 0 THEN streak_days WHEN last_active_day > ? THEN streak_days WHEN last_active_day = ? THEN MAX(1, streak_days) WHEN last_active_day = ? THEN streak_days + 1 ELSE 1 END,
        last_active_day = CASE WHEN ? = 0 THEN last_active_day WHEN last_active_day > ? THEN last_active_day ELSE ? END,
        last_decay_at = CASE WHEN ? = 0 THEN last_decay_at ELSE ? END,
        level = CAST((pet_xp + COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'), 0)) / 100 AS INTEGER) + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
      .bind(eventId, metadata, MAX_CURRENCY, rewards.moon_gold, currencyCosts.moon_gold, MAX_CURRENCY, rewards.moon_crystals, currencyCosts.moon_crystals, MAX_CURRENCY, rewards.style_tokens, currencyCosts.style_tokens,
        profileDeltas.health, profileDeltas.hunger, profileDeltas.cleanliness, profileDeltas.energy, profileDeltas.happiness,
        touchStreak, dayKey, dayKey, previousDayKey, touchStreak, dayKey, dayKey, touchStreak, now.toISOString(),
        eventId, metadata, telegramId, eventId, metadata),
    db.prepare(`UPDATE telegram_pet_profiles SET
        stage = CASE WHEN pet_xp >= 1800 THEN 'legendary companion' WHEN pet_xp >= 900 THEN 'moon guardian'
          WHEN pet_xp >= 360 THEN 'street scout' WHEN pet_xp >= 120 THEN 'runner' WHEN pet_xp >= 25 THEN 'hatchling' ELSE 'egg' END,
        health = CASE WHEN ? <> 0 THEN health
          ELSE MIN(100, MAX(0, ROUND(((100 - hunger) + happiness + cleanliness + energy) / 4.0))) END
      WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
      .bind(profileDeltas.health, telegramId, eventId, metadata),
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
      WHERE date(?) >= date(season.start_date) AND (season.end_date IS NULL OR date(?) <= date(season.end_date))
        AND event.id = ? AND event.metadata = ? AND event.status = 'accepted' AND event.xp_awarded > 0
      ORDER BY season.start_date DESC LIMIT 1
      ON CONFLICT(telegram_id, season_id) DO UPDATE SET xp = xp + excluded.xp, updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, dayKey, dayKey, eventId, metadata),
    db.prepare(`INSERT INTO telegram_pet_season_state (telegram_id, season_key, season_xp, weekly_xp, daily_xp, daily_key, weekly_key)
      SELECT ?, ?, pet_xp_awarded, pet_xp_awarded, pet_xp_awarded, ?, ? FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted'
      ON CONFLICT(telegram_id, season_key) DO UPDATE SET season_xp = season_xp + excluded.season_xp,
        weekly_xp = CASE WHEN weekly_key = excluded.weekly_key THEN weekly_xp + excluded.weekly_xp ELSE excluded.weekly_xp END,
        daily_xp = CASE WHEN daily_key = excluded.daily_key THEN daily_xp + excluded.daily_xp ELSE excluded.daily_xp END,
        daily_key = excluded.daily_key, weekly_key = excluded.weekly_key, updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, seasonKey, dayKey, weekKey, eventId, metadata),
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
          ), 0)))
          WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
          .bind(claimId, kind, key, quantity, rogueliteAsset ? dailyCap : MAX_CURRENCY, telegramId, dayKey, kind, eventId, metadata),
        kind === 'material'
          ? db.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity, updated_at)
              SELECT ?, asset_key, amount, CURRENT_TIMESTAMP FROM telegram_pet_reward_assets
              WHERE claim_id = ? AND asset_type = 'material' AND asset_key = ? AND amount > 0
              ON CONFLICT(telegram_id, material_key) DO UPDATE SET quantity = MIN(?, quantity + excluded.quantity), updated_at = CURRENT_TIMESTAMP`)
            .bind(telegramId, claimId, key, MAX_CURRENCY)
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
        SELECT ?, 'relic', ?, 1 WHERE EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
        .bind(claimId, relicId, eventId, metadata),
      db.prepare(`INSERT OR IGNORE INTO telegram_pet_relics (telegram_id, relic_id, rarity, effects_json)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_reward_assets WHERE claim_id = ? AND asset_type = 'relic' AND asset_key = ?)`)
        .bind(telegramId, relicId, relic.rarity, safeJson(relic.effects), claimId, relicId),
    );
  }
  statements.push(db.prepare(`UPDATE telegram_pet_reward_claims SET status = 'awarded',
      applied_rewards = json_object('pet_xp', COALESCE((SELECT pet_xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ?), 0),
        'community_xp', COALESCE((SELECT xp_awarded FROM telegram_pet_events WHERE id = ? AND metadata = ?), 0),
        'moon_gold', ?, 'moon_crystals', ?, 'style_tokens', ?,
        'materials', json(COALESCE((SELECT json_group_object(asset_key, amount) FROM telegram_pet_reward_assets WHERE claim_id = ? AND asset_type = 'material' AND amount > 0), '{}')),
        'items', json(COALESCE((SELECT json_group_object(asset_key, amount) FROM telegram_pet_reward_assets WHERE claim_id = ? AND asset_type = 'item' AND amount > 0), '{}')),
        'relics', json(COALESCE((SELECT json_group_object(asset_key, amount) FROM telegram_pet_reward_assets WHERE claim_id = ? AND asset_type = 'relic' AND amount > 0), '{}'))), awarded_at = CURRENT_TIMESTAMP
      WHERE claim_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id = ? AND metadata = ? AND status = 'accepted')`)
    .bind(eventId, metadata, eventId, metadata, rewards.moon_gold, rewards.moon_crystals, rewards.style_tokens, claimId, claimId, claimId, claimId, eventId, metadata));
  const results = await db.batch(statements);
  const awarded = results?.[2]?.results?.[0];
  if (!awarded) {
    const existing = await db.prepare(`SELECT claim_id FROM telegram_pet_reward_claims WHERE telegram_id = ? AND source = ? AND idempotency_key = ?`).bind(telegramId, source, idempotencyKey).first().catch(() => null);
    return existing
      ? { accepted: true, duplicate: true, pet_xp_awarded: 0, xp_awarded: 0, rewards: normalizePetReward() }
      : { accepted: false, duplicate: false, reason: 'reward_not_authorized', pet_xp_awarded: 0, xp_awarded: 0, rewards: normalizePetReward() };
  }
  const claim = await db.prepare(`SELECT applied_rewards FROM telegram_pet_reward_claims WHERE claim_id = ?`).bind(claimId).first().catch(() => null);
  let appliedRewards = rewards;
  try { appliedRewards = { ...rewards, ...JSON.parse(claim?.applied_rewards || '{}') }; } catch {}
  const pet = await db.prepare(`SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?`).bind(telegramId).first().catch(() => null);
  return {
    accepted: true,
    duplicate: false,
    claim_id: claimId,
    pet_xp_awarded: positiveInteger(awarded.pet_xp_awarded),
    xp_awarded: positiveInteger(awarded.xp_awarded),
    rewards: { ...appliedRewards, pet_xp: positiveInteger(awarded.pet_xp_awarded), community_xp: positiveInteger(awarded.xp_awarded) },
    profile_deltas: profileDeltas,
    currency_costs: currencyCosts,
    pet,
  };
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

export async function startPetRogueliteRun(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const region = PET_ROGUELITE_REGIONS[String(request.region || 'moon_alley')];
  if (!telegramId || !region) throw new Error('invalid_pet_roguelite_run');
  const runId = String(request.run_id || `rogue-${crypto.randomUUID()}`).slice(0, 120);
  const seed = Math.floor(Number(request.seed) || 0);
  const maxRoom = Math.max(1, Math.min(100, Math.floor(Number(request.max_room) || region.max_rooms || 10)));
  const seasonKey = String(request.season_key || `pet-s${new Date().getUTCFullYear()}-001`);
  const analyticsId = `${runId}:start`;
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_runs
      (id, telegram_id, run_id, season_key, region, difficulty, seed, status, current_room, max_room, depth, max_depth, risk_level)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, 0, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)`)
      .bind(crypto.randomUUID(), telegramId, runId, seasonKey, region.region_id, region.difficulty, seed, maxRoom, maxRoom, region.difficulty, telegramId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, 'run_start', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ?)`)
      .bind(analyticsId, runId, telegramId, safeJson({ region: region.region_id, difficulty: region.difficulty, seed }), runId, telegramId),
  ]);
  const accepted = Boolean(results?.[0]?.meta?.changes);
  const persistedRun = accepted || await db.prepare(`SELECT run_id FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ?`).bind(runId, telegramId).first().catch(() => null);
  if (persistedRun) await recordMoonpetMemory(db, {
    telegram_id: telegramId, event_key: `${runId}:memory:start`, memory_type: 'first_run', milestone: 'first_run',
  });
  return { accepted, duplicate: !accepted, run_id: runId, region: region.region_id, difficulty: region.difficulty, seed, max_room: maxRoom };
}

export async function createPetRunRoom(db, run) {
  const room = generatePetRunRoom(run);
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_rooms
      (room_id, run_id, telegram_id, room_number, room_type, status, generated_data)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(room.room_id, run.run_id, run.telegram_id, room.room, room.room_type, safeJson(room)),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, 'room_generated', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_run_rooms WHERE room_id = ?)`)
      .bind(`${room.room_id}:generated`, run.run_id, run.telegram_id, safeJson(room), room.room_id),
  ]);
  return { ...room, duplicate: !results?.[0]?.meta?.changes };
}

export async function persistPetRunRoomOutcome(db, run, room, outcome = {}) {
  const resolved = resolvePetRunRoom(room, outcome);
  const result = await db.prepare(`UPDATE telegram_pet_run_rooms SET status = ?, outcome_data = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE room_id = ? AND run_id = ? AND status = 'pending' RETURNING room_id`).bind(resolved.status, safeJson(resolved.outcome), room.room_id, run.run_id).first();
  if (!result) return { ...resolved, duplicate: true };
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
    VALUES (?, ?, ?, 'room_resolved', ?)`).bind(`${room.room_id}:resolved`, run.run_id, run.telegram_id, safeJson({ room: room.room, room_type: room.room_type, outcome: resolved.outcome })).run();
  return resolved;
}

export async function choosePetRunModifier(db, run, modifierId) {
  const modifier = PET_RUN_MODIFIERS[String(modifierId || '')];
  if (!modifier) throw new Error('unknown_pet_run_modifier');
  validatePetRunModifier(modifier);
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_modifiers (run_id, telegram_id, modifier_id, effects_json)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable'))`)
      .bind(run.run_id, run.telegram_id, modifier.modifier_id, safeJson(modifier.effects), run.run_id, run.telegram_id),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, 'modifier_chosen', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_run_modifiers WHERE run_id = ? AND modifier_id = ?)`)
      .bind(`${run.run_id}:modifier:${modifier.modifier_id}`, run.run_id, run.telegram_id, safeJson(modifier), run.run_id, modifier.modifier_id),
  ]);
  return { accepted: Boolean(results?.[0]?.meta?.changes), duplicate: !results?.[0]?.meta?.changes, modifier };
}

export async function rewardPetRunRoom(db, run, room, rewards = {}, costs = {}) {
  if (room?.status !== 'resolved') return { accepted: false, reason: 'room_not_resolved' };
  const awarded = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    source: 'roguelite_room',
    idempotency_key: room.room_id,
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
    const behaviour = ['battle', 'elite', 'boss'].includes(String(room.room_type)) ? 'combat' : 'exploration';
    await recordMoonpetBehaviour(db, { telegram_id: run.telegram_id, event_key: `${room.room_id}:personality`, behaviour,
      activity: behaviour === 'exploration' ? 'adventure' : 'combat' });
    await recordMoonpetBiggestReward(db, { telegram_id: run.telegram_id, reward_amount: awarded.rewards?.moon_gold, reward_currency: 'moon_gold' });
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
      .bind(run.run_id, run.telegram_id).first().catch(() => null);
  if (!persistedRoom?.room_id) return { accepted: false, reason: 'boss_room_not_resolved', pet_xp_awarded: 0, xp_awarded: 0 };
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
    VALUES (?, ?, ?, 'boss_fought', ?)`).bind(`${run.run_id}:boss:${persistedRoom.room_id}:${bossId}:attempt`, run.run_id, run.telegram_id,
      safeJson({ boss_id: bossId, room_id: persistedRoom.room_id, name: boss.name, difficulty: boss.difficulty, outcome: 'attempt' })).run();
  const rewards = buildPetBossRewards(boss, run, persistedRoom);
  const awarded = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    source: 'roguelite_boss',
    idempotency_key: `${persistedRoom.room_id}:${bossId}`,
    rewards,
    profile_deltas: buildPetProfileDeltas(rewards, boss.costs),
    context: { run_id: run.run_id, room_id: persistedRoom.room_id, boss_id: bossId },
  });
  if (awarded.accepted && !awarded.duplicate) {
    await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      VALUES (?, ?, ?, 'boss_fought', ?)`).bind(`${run.run_id}:boss:${persistedRoom.room_id}:${bossId}:win`, run.run_id, run.telegram_id,
        safeJson({ boss_id: bossId, room_id: persistedRoom.room_id, outcome: 'win', rewards: awarded.rewards,
          relics_discovered: Object.keys(awarded.rewards?.relics || {}), achievement_id: boss.achievement_id || null })).run();
  }
  if (awarded.accepted) {
    await recordMoonpetBehaviour(db, { telegram_id: run.telegram_id, event_key: `${persistedRoom.room_id}:${bossId}:personality`, behaviour: 'combat', activity: 'combat', amount: 2 });
    await recordMoonpetMemory(db, { telegram_id: run.telegram_id, event_key: `${persistedRoom.room_id}:${bossId}:memory`, memory_type: 'boss_victory',
      boss_id: bossId, milestone: 'first_boss_victory', reward_amount: awarded.rewards?.moon_gold, reward_currency: 'moon_gold' });
  }
  return awarded;
}

export async function finishPetRogueliteRun(db, run, status, analytics = {}) {
  if (!PET_RUN_STATUSES.includes(status) || status === 'active') throw new Error('invalid_terminal_run_status');
  const durationSeconds = Math.max(0, Math.floor((Date.now() - new Date(run.started_at || Date.now()).getTime()) / 1000));
  const finalizationId = `${run.run_id}:end`;
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
        WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable') RETURNING run_id`)
      .bind(status, analytics.death_reason || null, safeJson(analytics.rewards_earned || {}), roomsCompleted, safeJson(analytics.modifiers_chosen || []), analytics.boss_fought || null, run.run_id, run.telegram_id),
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
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_analytics (analytics_id, run_id, telegram_id, event_type, event_data)
      SELECT ?, ?, ?, 'run_end', ? WHERE EXISTS (SELECT 1 FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ? AND status = ?)`)
      .bind(finalizationId, run.run_id, run.telegram_id, safeJson(terminalAnalytics), run.run_id, run.telegram_id, status),
  ]);
  const terminal = results?.[0]?.results?.[0];
  if (!terminal) {
    const existing = await db.prepare('SELECT status FROM telegram_pet_runs WHERE run_id = ? AND telegram_id = ?').bind(run.run_id, run.telegram_id).first();
    if (['completed', 'extracted'].includes(existing?.status)) {
      await recordMoonpetBehaviour(db, { telegram_id: run.telegram_id, event_key: `${run.run_id}:terminal:personality`, behaviour: 'exploration', activity: 'adventure', amount: 2 });
      await recordMoonpetMemory(db, { telegram_id: run.telegram_id, event_key: `${run.run_id}:terminal:memory`,
        memory_type: existing.status === 'extracted' ? 'extraction' : 'run_completed',
        milestone: existing.status === 'extracted' ? 'first_extraction' : 'first_run_completed' });
    }
    return { accepted: true, duplicate: true, status: existing?.status || null };
  }
  if (['completed', 'extracted'].includes(status)) {
    await recordMoonpetBehaviour(db, { telegram_id: run.telegram_id, event_key: `${run.run_id}:terminal:personality`, behaviour: 'exploration', activity: 'adventure', amount: 2 });
    await recordMoonpetMemory(db, { telegram_id: run.telegram_id, event_key: `${run.run_id}:terminal:memory`,
      memory_type: status === 'extracted' ? 'extraction' : 'run_completed',
      milestone: status === 'extracted' ? 'first_extraction' : 'first_run_completed' });
  }
  return { accepted: true, duplicate: false, status };
}

export function advancePetRun(run, resolvedRoom) {
  if (resolvedRoom?.status !== 'resolved') throw new Error('room_not_resolved');
  const currentRoom = Math.max(Number(run.current_room || 0), Number(resolvedRoom.room || 0));
  return { ...run, current_room: currentRoom, score: positiveInteger(Number(run.score || 0) + Number(resolvedRoom.outcome?.score || 0)) };
}

export async function completePetRun(db, run, completionRewards = {}, analytics = {}) {
  const terminal = await finishPetRogueliteRun(db, run, 'completed', analytics);
  if (terminal.status !== 'completed') return { ...terminal, reward: null };
  const reward = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    source: 'roguelite_completion',
    idempotency_key: run.run_id,
    rewards: completionRewards,
    context: { run_id: run.run_id, rooms_completed: analytics.rooms_completed ?? run.current_room },
  });
  if (reward.accepted && !reward.duplicate) {
    await db.prepare(`UPDATE telegram_pet_run_analytics SET event_data = json_set(event_data,
      '$.rewards', json(?), '$.relics_discovered', json(?)) WHERE analytics_id = ?`)
      .bind(safeJson(reward.rewards), safeJson(Object.keys(reward.rewards?.relics || {})), `${run.run_id}:end`).run();
  }
  if (reward.accepted) await recordMoonpetBiggestReward(db, { telegram_id: run.telegram_id,
    reward_amount: reward.rewards?.moon_gold, reward_currency: 'moon_gold' });
  return { ...terminal, reward };
}
export async function extractPetRogueliteRun(db, run, extractionRewards = {}, analytics = {}) {
  const terminal = await finishPetRogueliteRun(db, run, 'extracted', { ...analytics, extracted: true });
  if (terminal.status !== 'extracted') return { ...terminal, reward: null };
  const reward = await awardPetReward(db, {
    telegram_id: run.telegram_id,
    source: 'roguelite_completion',
    idempotency_key: `${run.run_id}:extract`,
    rewards: extractionRewards,
    context: { run_id: run.run_id, rooms_completed: analytics.rooms_completed ?? run.current_room, extracted: true },
  });
  if (reward.accepted && !reward.duplicate) {
    await db.prepare(`UPDATE telegram_pet_run_analytics SET event_data = json_set(event_data,
      '$.rewards', json(?), '$.relics_discovered', json(?)) WHERE analytics_id = ?`)
      .bind(safeJson(reward.rewards), safeJson(Object.keys(reward.rewards?.relics || {})), `${run.run_id}:end`).run();
  }
  if (reward.accepted) await recordMoonpetBiggestReward(db, { telegram_id: run.telegram_id,
    reward_amount: reward.rewards?.moon_gold, reward_currency: 'moon_gold' });
  return { ...terminal, reward };
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

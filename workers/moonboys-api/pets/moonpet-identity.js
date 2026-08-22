import evolutions from './content/evolutions.json' with { type: 'json' };
import { reconcileLegacyPetInventory } from './inventory-cutover.js';

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const FORBIDDEN_EVOLUTION_KEYS = /(?:^|_)(?:xp|reward)_multiplier$|cap_(?:increase|bonus)$|(?:pet|community)_xp_cap/i;
const MOONPET_MEMORY_MILESTONES = new Set([
  'first_adoption', 'first_run', 'first_run_completed', 'first_extraction', 'first_boss_victory',
  'first_daily_moon_run', 'highest_daily_score', 'longest_daily_streak', 'fastest_moon_alley_clear', 'daily_boss_victory',
  ...evolutions.map(({ evolution_id: evolutionId }) => `evolution_${evolutionId}`),
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function positiveInteger(value, maximum = 999999) {
  return Math.min(maximum, Math.max(0, Math.floor(Number(value) || 0)));
}

function safeJson(value) {
  return JSON.stringify(value == null ? {} : value);
}

function escapeTelegramHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function safeTelegramText(value, maximum = 80) {
  return escapeTelegramHtml(String(value ?? '').slice(0, maximum));
}

function sourceEventTypes(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map((entry) => String(entry || '').trim()).filter(Boolean);
}

function sourceEventKeyFor(request = {}) {
  return String(request.source_event_key || '').trim();
}

export async function readActivePetIdentityScope(db, telegramId) {
  let scope = await db.prepare(`SELECT s.pet_id, s.season_key, s.slot_number, s.acquisition_type
    FROM telegram_pet_active_slots a
    JOIN telegram_pet_season_slots s
      ON s.pet_id = a.pet_id AND s.telegram_id = a.telegram_id AND s.season_key = a.season_key
    JOIN telegram_pet_instances i
      ON i.pet_id = s.pet_id AND i.telegram_id = s.telegram_id AND i.season_key = s.season_key AND i.slot_number = s.slot_number
    WHERE a.telegram_id = ? AND s.status = 'active' AND i.status = 'active'
    LIMIT 1`).bind(telegramId).first().catch(() => null);
  if (scope) return scope;
  return db.prepare(`SELECT s.pet_id, s.season_key, s.slot_number, s.acquisition_type
    FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i
      ON i.pet_id = s.pet_id AND i.telegram_id = s.telegram_id AND i.season_key = s.season_key AND i.slot_number = s.slot_number
    WHERE s.telegram_id = ? AND s.slot_number = 1 AND s.status = 'active' AND i.status = 'active'
    ORDER BY s.updated_at DESC
    LIMIT 1`).bind(telegramId).first().catch(() => null);
}

async function readMoonpetIdentityScope(db, telegramId, request = {}) {
  const requestedPetId = String(request.pet_id || '').trim();
  const requestedSeasonKey = String(request.season_key || '').trim();
  const includeArchived = request.include_archived === true;
  if (Boolean(requestedPetId) !== Boolean(requestedSeasonKey)) return null;
  if (!requestedPetId) return readActivePetIdentityScope(db, telegramId);
  const statusPredicate = includeArchived ? "IN ('active', 'archived')" : "= 'active'";
  return db.prepare(`SELECT s.pet_id, s.season_key, s.slot_number, s.acquisition_type, s.status
    FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i
      ON i.pet_id = s.pet_id AND i.telegram_id = s.telegram_id AND i.season_key = s.season_key AND i.slot_number = s.slot_number
    WHERE s.pet_id = ? AND s.telegram_id = ? AND s.season_key = ?
      AND s.status ${statusPredicate}
      AND i.status ${statusPredicate}
    LIMIT 1`).bind(requestedPetId, telegramId, requestedSeasonKey).first().catch(() => null);
}

async function resolveMoonpetIdentityScope(db, telegramId, request = {}) {
  const requestedPetId = String(request.pet_id || '').trim();
  const requestedSeasonKey = String(request.season_key || '').trim();
  if (Boolean(requestedPetId) !== Boolean(requestedSeasonKey)) return null;
  if (requestedPetId && requestedSeasonKey) {
    return db.prepare(`SELECT s.pet_id, s.season_key, s.slot_number, s.acquisition_type
      FROM telegram_pet_season_slots s
      JOIN telegram_pet_instances i
        ON i.pet_id = s.pet_id AND i.telegram_id = s.telegram_id AND i.season_key = s.season_key AND i.slot_number = s.slot_number
      WHERE s.pet_id = ? AND s.telegram_id = ? AND s.season_key = ? AND s.status = 'active' AND i.status = 'active'
      LIMIT 1`).bind(requestedPetId, telegramId, requestedSeasonKey).first().catch(() => null);
  }
  return readActivePetIdentityScope(db, telegramId);
}

async function readMoonpetIdentitySourceEvent(db, telegramId, request = {}) {
  const sourceEventKey = sourceEventKeyFor(request);
  if (!sourceEventKey) return { ok: true, source_event_key: null, source_event: null };
  const row = await db.prepare(`SELECT pet_id, telegram_id, season_key, event_type, status, reason, metadata
    FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ? LIMIT 1`)
    .bind(telegramId, sourceEventKey).first().catch(() => null);
  if (!row || row.status !== 'accepted') return { ok: false, reason: 'source_event_not_accepted', source_event_key: sourceEventKey };
  return { ok: true, source_event_key: sourceEventKey, source_event: row };
}

function verifyMoonpetIdentitySourceEvent(request = {}, scope, source, expectedTypes = []) {
  if (!source?.source_event_key) return { ok: true, source_event_key: null, source_event: null };
  const sourceEventKey = source.source_event_key;
  const row = source.source_event;
  if (!row) return { ok: false, reason: 'source_event_not_accepted', source_event_key: sourceEventKey };
  const allowedTypes = sourceEventTypes(expectedTypes);
  if (row.status !== 'accepted') return { ok: false, reason: 'source_event_not_accepted', source_event_key: sourceEventKey };
  if (String(row.telegram_id) !== String(request.telegram_id || scope.telegram_id || '')) return { ok: false, reason: 'source_event_owner_mismatch', source_event_key: sourceEventKey };
  if (String(row.pet_id || '') !== String(scope.pet_id || '')) return { ok: false, reason: 'source_event_pet_mismatch', source_event_key: sourceEventKey };
  if (String(row.season_key || '') !== String(scope.season_key || '')) return { ok: false, reason: 'source_event_season_mismatch', source_event_key: sourceEventKey };
  if (allowedTypes.length && !allowedTypes.includes(String(row.event_type || ''))) return { ok: false, reason: 'source_event_type_mismatch', source_event_key: sourceEventKey };
  if (request.source_event_reason && String(row.reason || '') !== String(request.source_event_reason)) {
    return { ok: false, reason: 'source_event_reason_mismatch', source_event_key: sourceEventKey };
  }
  if (request.source_event_category) {
    let metadata = {};
    try { metadata = JSON.parse(row.metadata || '{}'); } catch {}
    if (String(metadata.source || '') !== String(request.source_event_category)) {
      return { ok: false, reason: 'source_event_category_mismatch', source_event_key: sourceEventKey };
    }
  }
  return { ok: true, source_event_key: sourceEventKey, source_event: row };
}

async function resolveMoonpetIdentityAuthority(db, telegramId, request = {}, expectedTypes = []) {
  const source = await readMoonpetIdentitySourceEvent(db, telegramId, request);
  if (!source.ok) return { ok: false, reason: source.reason, source_event_key: source.source_event_key };
  const hasSource = Boolean(source.source_event_key && source.source_event);
  const requestedPetId = String(request.pet_id || '').trim();
  const requestedSeasonKey = String(request.season_key || '').trim();
  if (hasSource && requestedPetId && String(source.source_event.pet_id || '') !== requestedPetId) {
    return { ok: false, reason: 'source_event_pet_mismatch', source_event_key: source.source_event_key };
  }
  if (hasSource && requestedSeasonKey && String(source.source_event.season_key || '') !== requestedSeasonKey) {
    return { ok: false, reason: 'source_event_season_mismatch', source_event_key: source.source_event_key };
  }
  let scope = null;
  if (hasSource) {
    scope = await resolveMoonpetIdentityScope(db, telegramId, {
      ...request,
      pet_id: source.source_event.pet_id,
      season_key: source.source_event.season_key,
    });
  } else {
    scope = await resolveMoonpetIdentityScope(db, telegramId, request);
  }
  if (!scope?.pet_id || !scope?.season_key) return { ok: false, reason: 'identity_authority_unavailable', source_event_key: source.source_event_key };
  const verified = verifyMoonpetIdentitySourceEvent(request, { ...scope, telegram_id: telegramId }, source, expectedTypes);
  if (!verified.ok) return verified;
  return { ok: true, scope, source: verified };
}

function validateInventoryRequirements(inventory) {
  if (inventory == null) return true;
  if (typeof inventory !== 'object' || Array.isArray(inventory)) throw new Error('invalid_evolution_inventory_requirements');
  for (const [assetType, assets] of Object.entries(inventory)) {
    if (!['material', 'item'].includes(assetType) || !assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('invalid_evolution_inventory_requirements');
    for (const [assetKey, quantity] of Object.entries(assets)) {
      if (!ID_PATTERN.test(assetKey) || positiveInteger(quantity) !== Number(quantity) || Number(quantity) < 1) throw new Error('invalid_evolution_inventory_requirements');
    }
  }
  return true;
}

function rejectForbiddenEvolutionEffects(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVOLUTION_KEYS.test(key)) throw new Error('evolution_cannot_change_reward_authority');
    rejectForbiddenEvolutionEffects(child);
  }
}

export function validateMoonpetEvolutionContent(content = evolutions) {
  if (!Array.isArray(content) || content.length !== 6) throw new Error('invalid_evolution_content');
  const ids = new Set();
  for (const [index, evolution] of content.entries()) {
    if (!ID_PATTERN.test(String(evolution?.evolution_id || '')) || ids.has(evolution.evolution_id)) throw new Error('invalid_evolution_id');
    if (typeof evolution.name !== 'string' || evolution.name.length < 2 || Number(evolution.stage) !== index) throw new Error('invalid_evolution_stage');
    if (!evolution.requirements || typeof evolution.requirements !== 'object' || Array.isArray(evolution.requirements)) throw new Error('invalid_evolution_requirements');
    if (positiveInteger(evolution.requirements.pet_level, 1000) !== Number(evolution.requirements.pet_level) || Number(evolution.requirements.pet_level) < 1) throw new Error('invalid_evolution_requirements');
    if (!Array.isArray(evolution.cosmetic_unlocks) || !Array.isArray(evolution.achievement_unlocks)) throw new Error('invalid_evolution_unlocks');
    for (const unlock of [...evolution.cosmetic_unlocks, ...evolution.achievement_unlocks]) if (!ID_PATTERN.test(String(unlock || ''))) throw new Error('invalid_evolution_unlocks');
    const victories = evolution.requirements.boss_victories || {};
    if (typeof victories !== 'object' || Array.isArray(victories)) throw new Error('invalid_evolution_requirements');
    for (const [bossId, count] of Object.entries(victories)) if (!ID_PATTERN.test(bossId) || positiveInteger(count) !== Number(count) || Number(count) < 1) throw new Error('invalid_evolution_requirements');
    validateInventoryRequirements(evolution.requirements.inventory);
    for (const key of ['min_age_days', 'growth_marks', 'weekly_crests']) {
      if (evolution.stage > 0 && positiveInteger(evolution.requirements[key], 1000) !== Number(evolution.requirements[key])) throw new Error('invalid_evolution_requirements');
    }
    rejectForbiddenEvolutionEffects(evolution);
    ids.add(evolution.evolution_id);
  }
  return true;
}

validateMoonpetEvolutionContent();

export const MOONPET_EVOLUTIONS = deepFreeze(Object.fromEntries(evolutions.map((entry) => [entry.evolution_id, entry])));

export const MOONPET_PERSONALITY_TRAITS = deepFreeze({
  combat: { trait_id: 'street_fighter', name: 'Street Fighter', threshold: 20, daily_cap: 4, max_event_progress: 2, allowed_effects: ['dialogue', 'cosmetic', 'event_preference', 'future_content'] },
  exploration: { trait_id: 'explorer', name: 'Explorer', threshold: 16, daily_cap: 4, max_event_progress: 2, allowed_effects: ['dialogue', 'cosmetic', 'event_preference', 'future_content'] },
  care: { trait_id: 'loyal', name: 'Loyal', threshold: 18, daily_cap: 3, max_event_progress: 1, allowed_effects: ['dialogue', 'cosmetic', 'event_preference', 'future_content'] },
  event: { trait_id: 'curious', name: 'Curious', threshold: 12, daily_cap: 3, max_event_progress: 1, allowed_effects: ['dialogue', 'cosmetic', 'event_preference', 'future_content'] },
});

export async function recordMoonpetBehaviour(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const eventKey = String(request.event_key || '').trim().slice(0, 180);
  const behaviour = String(request.behaviour || '').trim().toLowerCase();
  const definition = MOONPET_PERSONALITY_TRAITS[behaviour];
  const amount = Math.min(positiveInteger(request.amount == null ? 1 : request.amount, 100), Number(definition?.max_event_progress || 1));
  const dayKey = String(request.day_key || new Date().toISOString().slice(0, 10));
  const activity = String(request.activity || behaviour).trim().toLowerCase();
  if (!telegramId || !eventKey || !definition || amount < 1) throw new Error('invalid_moonpet_behaviour');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !['combat', 'exploration', 'care', 'event', 'adventure'].includes(activity)) throw new Error('invalid_moonpet_behaviour');
  const authority = await resolveMoonpetIdentityAuthority(db, telegramId, request, request.source_event_types || request.source_event_type || []);
  if (!authority.ok) return { accepted: false, duplicate: false, reason: authority.reason, source_event_key: authority.source_event_key };
  const petId = authority.scope.pet_id;
  const seasonKey = authority.scope.season_key;
  const sourceEventKey = authority.source.source_event_key;
  const eventId = crypto.randomUUID();
  const analyticsId = `personality_unlock:${petId}:${definition.trait_id}`;
  const corruptTrait = await db.prepare(`SELECT 1 AS corrupt FROM telegram_pet_personality_traits
    WHERE pet_id = ? AND trait_id = ? AND NOT (telegram_id = ? AND season_key = ?) LIMIT 1`)
    .bind(petId, definition.trait_id, telegramId, seasonKey).first();
  const corruptMemory = await db.prepare(`SELECT 1 AS corrupt FROM telegram_pet_memories
    WHERE pet_id = ? AND NOT (telegram_id = ? AND season_key = ?) LIMIT 1`)
    .bind(petId, telegramId, seasonKey).first();
  if (corruptTrait || corruptMemory) throw new Error('moonpet_identity_authority_tuple_mismatch');
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_events
      (event_id, pet_id, telegram_id, season_key, event_key, event_kind, payload, day_key, progress_delta)
      SELECT ?, ?, ?, ?, ?, 'personality', ?, ?, MIN(?, MAX(0, ? - COALESCE((SELECT SUM(progress_delta)
        FROM telegram_pet_identity_events WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND event_kind = 'personality' AND day_key = ?
          AND json_extract(payload, '$.behaviour') = ?), 0)))
      WHERE EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND status = 'active')`)
      .bind(eventId, petId, telegramId, seasonKey, eventKey, safeJson({ behaviour, requested_amount: amount, trait_id: definition.trait_id, activity, source_event_key: sourceEventKey }), dayKey,
        amount, definition.daily_cap, petId, telegramId, seasonKey, dayKey, behaviour, petId, telegramId, seasonKey),
    db.prepare(`INSERT INTO telegram_pet_personality_traits (pet_id, telegram_id, season_key, trait_id, progress, unlocked_at)
      SELECT ?, ?, ?, ?, progress_delta, CASE WHEN progress_delta >= ? THEN CURRENT_TIMESTAMP ELSE NULL END
      FROM telegram_pet_identity_events WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL AND progress_delta > 0
        AND (NOT EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id = ?)
          OR EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?))
      ON CONFLICT(pet_id, trait_id) DO UPDATE SET
        progress = MIN(?, telegram_pet_personality_traits.progress + excluded.progress),
        unlocked_at = COALESCE(telegram_pet_personality_traits.unlocked_at,
          CASE WHEN telegram_pet_personality_traits.progress + excluded.progress >= ? THEN CURRENT_TIMESTAMP ELSE NULL END),
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_pet_personality_traits.pet_id = excluded.pet_id
        AND telegram_pet_personality_traits.telegram_id = excluded.telegram_id
        AND telegram_pet_personality_traits.season_key = excluded.season_key`)
      .bind(petId, telegramId, seasonKey, definition.trait_id, definition.threshold, eventId, petId, telegramId, seasonKey,
        petId, petId, telegramId, seasonKey, definition.threshold, definition.threshold),
    db.prepare(`INSERT INTO telegram_pet_memories
      (pet_id, telegram_id, season_key, combat_actions, exploration_actions, care_actions, event_actions, adventure_actions)
      SELECT ?, ?, ?, CASE WHEN ?='combat' THEN progress_delta ELSE 0 END, CASE WHEN ?='exploration' THEN progress_delta ELSE 0 END,
        CASE WHEN ?='care' THEN progress_delta ELSE 0 END, CASE WHEN ?='event' THEN progress_delta ELSE 0 END,
        CASE WHEN ?='adventure' THEN progress_delta ELSE 0 END
      FROM telegram_pet_identity_events WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL AND progress_delta > 0
        AND (NOT EXISTS (SELECT 1 FROM telegram_pet_personality_traits WHERE pet_id = ? AND trait_id = ?)
          OR EXISTS (SELECT 1 FROM telegram_pet_personality_traits WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND trait_id = ?))
      ON CONFLICT(pet_id) DO UPDATE SET
        combat_actions = telegram_pet_memories.combat_actions + excluded.combat_actions,
        exploration_actions = telegram_pet_memories.exploration_actions + excluded.exploration_actions,
        care_actions = telegram_pet_memories.care_actions + excluded.care_actions,
        event_actions = telegram_pet_memories.event_actions + excluded.event_actions,
        adventure_actions = telegram_pet_memories.adventure_actions + excluded.adventure_actions,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_pet_memories.pet_id = excluded.pet_id
        AND telegram_pet_memories.telegram_id = excluded.telegram_id
        AND telegram_pet_memories.season_key = excluded.season_key`)
      .bind(petId, telegramId, seasonKey, activity, activity, activity, activity, activity, eventId, petId, telegramId, seasonKey,
        petId, definition.trait_id, petId, telegramId, seasonKey, definition.trait_id),
    db.prepare(`UPDATE telegram_pet_memories SET favourite_activity = CASE
      WHEN adventure_actions >= combat_actions AND adventure_actions >= exploration_actions AND adventure_actions >= care_actions AND adventure_actions >= event_actions AND adventure_actions > 0 THEN 'Adventure'
      WHEN exploration_actions >= combat_actions AND exploration_actions >= care_actions AND exploration_actions >= event_actions AND exploration_actions > 0 THEN 'Exploration'
      WHEN combat_actions >= care_actions AND combat_actions >= event_actions AND combat_actions > 0 THEN 'Combat'
      WHEN care_actions >= event_actions AND care_actions > 0 THEN 'Care'
      WHEN event_actions > 0 THEN 'Events' ELSE favourite_activity END
      WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
        AND EXISTS (SELECT 1 FROM telegram_pet_identity_events WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL AND progress_delta > 0)`)
      .bind(petId, telegramId, seasonKey, eventId, petId, telegramId, seasonKey),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_analytics
      (analytics_id, pet_id, telegram_id, season_key, event_type, trait_id, event_data)
      SELECT ?, ?, ?, ?, 'personality_unlock', ?, ? FROM telegram_pet_personality_traits
      WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND trait_id = ? AND unlocked_at IS NOT NULL`)
      .bind(analyticsId, petId, telegramId, seasonKey, definition.trait_id, safeJson({ behaviour, threshold: definition.threshold }), petId, telegramId, seasonKey, definition.trait_id),
    db.prepare(`UPDATE telegram_pet_identity_events SET applied_at = CURRENT_TIMESTAMP
      WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL
        AND (progress_delta = 0 OR (
          EXISTS (SELECT 1 FROM telegram_pet_personality_traits WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND trait_id = ?)
          AND EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?)
        ))`).bind(eventId, petId, telegramId, seasonKey, petId, telegramId, seasonKey, definition.trait_id, petId, telegramId, seasonKey),
  ]);
  const identityEvent = await db.prepare(`SELECT progress_delta FROM telegram_pet_identity_events
    WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ?`).bind(eventId, petId, telegramId, seasonKey).first().catch(() => null);
  const trait = await db.prepare(`SELECT trait_id, progress, unlocked_at FROM telegram_pet_personality_traits
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND trait_id = ?`).bind(petId, telegramId, seasonKey, definition.trait_id).first().catch(() => null);
  return { accepted: Boolean(results?.[5]?.meta?.changes), duplicate: !results?.[0]?.meta?.changes,
    unlocked: Boolean(results?.[4]?.meta?.changes), progress_applied: positiveInteger(identityEvent?.progress_delta),
    daily_capped: Boolean(results?.[0]?.meta?.changes) && positiveInteger(identityEvent?.progress_delta) === 0, trait };
}

function memoryValues(request) {
  const type = String(request.memory_type || '').trim().toLowerCase();
  const completedRun = ['run_completed', 'extraction'].includes(type) ? 1 : 0;
  return {
    type,
    first_adoption: type === 'first_adoption' ? 1 : 0,
    first_run: type === 'first_run' ? 1 : 0,
    first_extraction: type === 'extraction' ? 1 : 0,
    first_boss: type === 'boss_victory' ? 1 : 0,
    total_runs: completedRun,
    total_bosses: type === 'boss_victory' ? 1 : 0,
    boss_id: type === 'boss_victory' ? String(request.boss_id || '').trim().toLowerCase().slice(0, 80) : '',
    reward_amount: positiveInteger(request.reward_amount),
    reward_currency: String(request.reward_currency || 'moon_gold').trim().toLowerCase().slice(0, 40),
    milestone: String(request.milestone || '').trim().toLowerCase().slice(0, 80),
  };
}

export async function recordMoonpetMemory(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const eventKey = String(request.event_key || '').trim().slice(0, 180);
  const values = memoryValues(request);
  if (!telegramId || !eventKey || !['first_adoption', 'first_run', 'run_completed', 'extraction', 'boss_victory', 'milestone'].includes(values.type)) throw new Error('invalid_moonpet_memory');
  if (values.boss_id && !ID_PATTERN.test(values.boss_id)) throw new Error('invalid_moonpet_memory');
  if ((values.type === 'milestone' && !values.milestone) || (values.milestone && (!ID_PATTERN.test(values.milestone) || !MOONPET_MEMORY_MILESTONES.has(values.milestone)))) throw new Error('invalid_moonpet_memory');
  const expectedTypes = request.source_event_types || request.source_event_type || (values.type === 'boss_victory' ? ['weekly_boss', 'run_boss', 'daily_moon_run'] : []);
  const authority = await resolveMoonpetIdentityAuthority(db, telegramId, request, expectedTypes);
  if (!authority.ok) return { accepted: false, duplicate: false, reason: authority.reason, source_event_key: authority.source_event_key };
  const petId = authority.scope.pet_id;
  const seasonKey = authority.scope.season_key;
  const sourceEventKey = authority.source.source_event_key;
  const eventId = crypto.randomUUID();
  const milestoneJson = safeJson(values.milestone ? [values.milestone] : []);
  const corruptMemory = await db.prepare(`SELECT 1 AS corrupt FROM telegram_pet_memories
    WHERE pet_id = ? AND NOT (telegram_id = ? AND season_key = ?) LIMIT 1`)
    .bind(petId, telegramId, seasonKey).first();
  const corruptBoss = values.boss_id
    ? await db.prepare(`SELECT 1 AS corrupt FROM telegram_pet_boss_victories
        WHERE pet_id = ? AND boss_id = ? AND NOT (telegram_id = ? AND season_key = ?) LIMIT 1`)
      .bind(petId, values.boss_id, telegramId, seasonKey).first()
    : null;
  if (corruptMemory || corruptBoss) throw new Error('moonpet_identity_authority_tuple_mismatch');
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_events
      (event_id, pet_id, telegram_id, season_key, event_key, event_kind, payload)
      SELECT ?, ?, ?, ?, ?, 'memory', ? WHERE EXISTS
        (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND status = 'active')`)
      .bind(eventId, petId, telegramId, seasonKey, eventKey, safeJson({ ...values, source_event_key: sourceEventKey }), petId, telegramId, seasonKey),
    db.prepare(`INSERT INTO telegram_pet_memories
      (pet_id, telegram_id, season_key, first_adoption_at, first_run_at, first_extraction_at, first_boss_victory_at, first_boss_id,
       biggest_reward_amount, biggest_reward_currency, total_runs, total_bosses_defeated, milestones)
      SELECT ?, ?, ?, CASE WHEN ?=1 THEN CURRENT_TIMESTAMP END, CASE WHEN ?=1 THEN CURRENT_TIMESTAMP END,
        CASE WHEN ?=1 THEN CURRENT_TIMESTAMP END, CASE WHEN ?=1 THEN CURRENT_TIMESTAMP END, NULLIF(?, ''), ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_identity_events WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_boss_victories
          WHERE pet_id = ? AND boss_id = ? AND NOT (telegram_id = ? AND season_key = ?))
      ON CONFLICT(pet_id) DO UPDATE SET
        first_adoption_at = COALESCE(telegram_pet_memories.first_adoption_at, excluded.first_adoption_at),
        first_run_at = COALESCE(telegram_pet_memories.first_run_at, excluded.first_run_at),
        first_extraction_at = COALESCE(telegram_pet_memories.first_extraction_at, excluded.first_extraction_at),
        first_boss_victory_at = COALESCE(telegram_pet_memories.first_boss_victory_at, excluded.first_boss_victory_at),
        first_boss_id = COALESCE(telegram_pet_memories.first_boss_id, excluded.first_boss_id),
        biggest_reward_currency = CASE WHEN excluded.biggest_reward_amount > telegram_pet_memories.biggest_reward_amount THEN excluded.biggest_reward_currency ELSE telegram_pet_memories.biggest_reward_currency END,
        biggest_reward_amount = MAX(telegram_pet_memories.biggest_reward_amount, excluded.biggest_reward_amount),
        total_runs = telegram_pet_memories.total_runs + excluded.total_runs,
        total_bosses_defeated = telegram_pet_memories.total_bosses_defeated + excluded.total_bosses_defeated,
        milestones = CASE WHEN json_array_length(excluded.milestones)=0 OR EXISTS (SELECT 1 FROM json_each(telegram_pet_memories.milestones) WHERE value=json_extract(excluded.milestones, '$[0]'))
          THEN telegram_pet_memories.milestones ELSE json_insert(telegram_pet_memories.milestones, '$[#]', json_extract(excluded.milestones, '$[0]')) END,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_pet_memories.pet_id = excluded.pet_id
        AND telegram_pet_memories.telegram_id = excluded.telegram_id
        AND telegram_pet_memories.season_key = excluded.season_key`)
      .bind(petId, telegramId, seasonKey, values.first_adoption, values.first_run, values.first_extraction, values.first_boss, values.boss_id,
        values.reward_amount, values.reward_currency, values.total_runs, values.total_bosses, milestoneJson, eventId, petId, telegramId, seasonKey,
        petId, values.boss_id, telegramId, seasonKey),
  ];
  if (values.boss_id) statements.push(db.prepare(`INSERT INTO telegram_pet_boss_victories (pet_id, telegram_id, season_key, boss_id, victories)
    SELECT ?, ?, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM telegram_pet_identity_events WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_memories
        WHERE pet_id = ? AND NOT (telegram_id = ? AND season_key = ?))
    ON CONFLICT(pet_id, boss_id) DO UPDATE SET victories = telegram_pet_boss_victories.victories + 1, updated_at = CURRENT_TIMESTAMP
      WHERE telegram_pet_boss_victories.pet_id = excluded.pet_id
        AND telegram_pet_boss_victories.telegram_id = excluded.telegram_id
        AND telegram_pet_boss_victories.season_key = excluded.season_key`)
    .bind(petId, telegramId, seasonKey, values.boss_id, eventId, petId, telegramId, seasonKey, petId, telegramId, seasonKey));
  if (values.milestone) statements.push(db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_analytics
    (analytics_id, pet_id, telegram_id, season_key, event_type, milestone_id, event_data)
    SELECT ?, ?, ?, ?, 'memory_milestone', ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_identity_events WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL)`)
    .bind(`memory_milestone:${petId}:${values.milestone}`, petId, telegramId, seasonKey, values.milestone, safeJson({ memory_type: values.type }), eventId, petId, telegramId, seasonKey));
  statements.push(db.prepare(`UPDATE telegram_pet_identity_events SET applied_at = CURRENT_TIMESTAMP
    WHERE event_id = ? AND pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL
      AND EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM telegram_pet_boss_victories WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND boss_id = ?))`)
    .bind(eventId, petId, telegramId, seasonKey, petId, telegramId, seasonKey, values.boss_id, petId, telegramId, seasonKey, values.boss_id));
  const results = await db.batch(statements);
  return { accepted: Boolean(results?.[results.length - 1]?.meta?.changes), duplicate: !results?.[0]?.meta?.changes };
}

export async function recordMoonpetBiggestReward(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const amount = positiveInteger(request.reward_amount);
  const currency = String(request.reward_currency || 'moon_gold').trim().toLowerCase().slice(0, 40);
  if (!telegramId || amount < 1 || !ID_PATTERN.test(currency)) return { accepted: false, reason: 'invalid_moonpet_reward_memory' };
  const authority = await resolveMoonpetIdentityAuthority(db, telegramId, request, request.source_event_types || request.source_event_type || []);
  if (!authority.ok) return { accepted: false, reason: authority.reason || 'invalid_moonpet_reward_memory', source_event_key: authority.source_event_key };
  const scope = authority.scope;
  const corruptExisting = await db.prepare(`SELECT 1 AS corrupt FROM telegram_pet_memories
    WHERE pet_id = ? AND NOT (telegram_id = ? AND season_key = ?) LIMIT 1`)
    .bind(scope.pet_id, telegramId, scope.season_key).first();
  if (corruptExisting) throw new Error('moonpet_identity_authority_tuple_mismatch');
  const result = await db.prepare(`INSERT INTO telegram_pet_memories (pet_id, telegram_id, season_key, biggest_reward_amount, biggest_reward_currency)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND status = 'active')
    ON CONFLICT(pet_id) DO UPDATE SET
      biggest_reward_currency = CASE WHEN excluded.biggest_reward_amount > telegram_pet_memories.biggest_reward_amount THEN excluded.biggest_reward_currency ELSE telegram_pet_memories.biggest_reward_currency END,
      biggest_reward_amount = MAX(telegram_pet_memories.biggest_reward_amount, excluded.biggest_reward_amount),
      updated_at = CURRENT_TIMESTAMP
    WHERE telegram_pet_memories.pet_id = excluded.pet_id
      AND telegram_pet_memories.telegram_id = excluded.telegram_id
      AND telegram_pet_memories.season_key = excluded.season_key`).bind(scope.pet_id, telegramId, scope.season_key, amount, currency, scope.pet_id, telegramId, scope.season_key).run();
  return { accepted: Number(result?.meta?.changes || 0) > 0, amount, currency };
}

function evolutionRequirementSql(definition, telegramId, petId, seasonKey) {
  const requirements = definition.requirements;
  const clauses = [`EXISTS (SELECT 1 FROM telegram_pet_profiles p WHERE p.telegram_id = ? AND (CAST(p.pet_xp / 100 AS INTEGER) + 1) >= ?)`];
  const args = [telegramId, requirements.pet_level];
  if (definition.stage > 0) {
    const previous = evolutions[definition.stage - 1];
    clauses.push(`EXISTS (SELECT 1 FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND telegram_id=? AND evolution_id=?)`);
    args.push(petId, telegramId, previous.evolution_id);
    clauses.push(`EXISTS (SELECT 1 FROM telegram_pet_season_slots s
      WHERE s.pet_id=? AND s.telegram_id=? AND s.season_key=?
        AND datetime(s.created_at, '+' || ? || ' days') <= CURRENT_TIMESTAMP)`);
    args.push(petId, telegramId, seasonKey, positiveInteger(requirements.min_age_days));
    clauses.push(`(SELECT COUNT(DISTINCT earned_day) FROM telegram_pet_growth_marks
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND earned_day IS NOT NULL) >= ?`);
    args.push(petId, telegramId, seasonKey, positiveInteger(requirements.growth_marks));
    clauses.push(`(SELECT COUNT(DISTINCT qualification_week) FROM telegram_pet_weekly_crests
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND qualification_week IS NOT NULL) >= ?`);
    args.push(petId, telegramId, seasonKey, positiveInteger(requirements.weekly_crests));
  }
  for (const [bossId, count] of Object.entries(requirements.boss_victories || {})) {
    clauses.push(`EXISTS (SELECT 1 FROM telegram_pet_boss_victories WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND boss_id = ? AND victories >= ?)`);
    args.push(petId, telegramId, seasonKey, bossId, count);
  }
  if (positiveInteger(requirements.relics_owned) > 0) {
    clauses.push(`(SELECT COUNT(*) FROM telegram_pet_relics WHERE telegram_id = ?) >= ?`);
    args.push(telegramId, positiveInteger(requirements.relics_owned));
  }
  for (const [assetType, assets] of Object.entries(requirements.inventory || {})) for (const [assetKey, quantity] of Object.entries(assets)) {
    if (assetType === 'material') {
      clauses.push(`EXISTS (SELECT 1 FROM telegram_pet_material_balances WHERE telegram_id = ? AND material_key = ? AND quantity >= ?)`);
      args.push(telegramId, assetKey, quantity);
    } else {
      clauses.push(`EXISTS (SELECT 1 FROM telegram_pet_inventory WHERE telegram_id = ? AND asset_type = ? AND asset_key = ? AND quantity >= ?)`);
      args.push(telegramId, assetType, assetKey, quantity);
    }
  }
  return { sql: clauses.join(' AND '), args };
}

export async function evaluateMoonpetEvolutionRequirements(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const evolutionId = String(request.evolution_id || '').trim().toLowerCase();
  const definition = MOONPET_EVOLUTIONS[evolutionId];
  if (!telegramId || !definition) return { ready: false, reason: 'invalid_evolution', pet_id: null };
  let scope = null;
  try {
    const requestedPetId = String(request.pet_id || '').trim();
    const requestedSeasonKey = String(request.season_key || '').trim();
    if (Boolean(requestedPetId) !== Boolean(requestedSeasonKey)) {
      return { ready: false, reason: 'evolution_authority_unavailable', pet_id: requestedPetId || null };
    }
    scope = requestedPetId && requestedSeasonKey
      ? await db.prepare(`SELECT s.pet_id, s.season_key, s.slot_number, s.acquisition_type
          FROM telegram_pet_season_slots s JOIN telegram_pet_instances i
            ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key
          WHERE s.pet_id=? AND s.telegram_id=? AND s.season_key=? AND s.status='active' AND i.status='active' LIMIT 1`)
        .bind(requestedPetId, telegramId, requestedSeasonKey).first()
      : await readActivePetIdentityScope(db, telegramId);
  } catch {
    return { ready: false, reason: 'evolution_authority_unavailable', pet_id: null };
  }
  const petId = scope?.pet_id || null;
  if (!petId) return { ready: false, reason: 'evolution_authority_unavailable', pet_id: null };
  const requirements = evolutionRequirementSql(definition, telegramId, petId, scope.season_key);
  let row = null;
  try {
    row = await db.prepare(`SELECT CASE WHEN ${requirements.sql} THEN 1 ELSE 0 END AS ready`)
      .bind(...requirements.args).first();
  } catch {
    return { ready: false, reason: 'evolution_authority_unavailable', pet_id: petId };
  }
  if (!row) return { ready: false, reason: 'evolution_authority_unavailable', pet_id: petId };
  const ready = Number(row.ready || 0) === 1;
  return { ready, reason: ready ? null : 'requirements_not_met', pet_id: petId };
}

export async function evolveMoonpet(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const evolutionId = String(request.evolution_id || '').trim().toLowerCase();
  const eventKey = String(request.event_key || `pet:evolve:${telegramId}:${evolutionId}`).trim().slice(0, 180);
  const definition = MOONPET_EVOLUTIONS[evolutionId];
  if (!telegramId || !eventKey || !definition) return { accepted: false, duplicate: false, reason: 'invalid_evolution' };
  await reconcileLegacyPetInventory(db, telegramId);
  let scope = null;
  try {
    scope = await readActivePetIdentityScope(db, telegramId);
  } catch {
    return { accepted: false, duplicate: false, reason: 'evolution_authority_unavailable' };
  }
  const petId = scope?.pet_id || null;
  if (!petId || !scope?.season_key) return { accepted: false, duplicate: false, reason: 'evolution_authority_unavailable' };
  const existing = await db.prepare(`SELECT evolution_id, stage, unlocked_at FROM telegram_pet_evolutions_by_pet WHERE pet_id = ? AND evolution_id = ?`)
    .bind(petId, evolutionId).first().catch(() => null);
  if (existing) return { accepted: true, duplicate: true, reason: 'already_evolved', evolution: existing };
  const requirements = evolutionRequirementSql(definition, telegramId, petId, scope.season_key);
  const evolutionMilestone = `evolution_${evolutionId}`;
  const corruptMemory = await db.prepare(`SELECT 1 AS corrupt FROM telegram_pet_memories
    WHERE pet_id = ? AND NOT (telegram_id = ? AND season_key = ?) LIMIT 1`)
    .bind(petId, telegramId, scope.season_key).first();
  if (corruptMemory) throw new Error('moonpet_identity_authority_tuple_mismatch');
  const statements = [db.prepare(`INSERT OR IGNORE INTO telegram_pet_evolutions_by_pet
      (pet_id, telegram_id, evolution_id, stage, unlock_event_key, cosmetic_unlocks, achievement_unlocks, materials_consumed)
      SELECT ?, ?, ?, ?, ?, ?, ?, 0
      WHERE EXISTS (SELECT 1 FROM telegram_pet_instances
        WHERE pet_id=? AND telegram_id=? AND season_key=? AND status='active')
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_memories
          WHERE pet_id = ? AND NOT (telegram_id = ? AND season_key = ?))
        AND ${requirements.sql}`)
      .bind(petId, telegramId, evolutionId, definition.stage, eventKey, safeJson(definition.cosmetic_unlocks),
        safeJson(definition.achievement_unlocks), petId, telegramId, scope.season_key, petId, telegramId, scope.season_key, ...requirements.args)];
  for (const [assetType, assets] of Object.entries(definition.requirements.inventory || {})) for (const [assetKey, quantity] of Object.entries(assets)) {
    if (assetType === 'material') {
      statements.push(db.prepare(`UPDATE telegram_pet_material_balances SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ? AND material_key = ? AND quantity >= ?
            AND EXISTS (SELECT 1 FROM telegram_pet_evolutions_by_pet WHERE pet_id = ? AND evolution_id = ? AND materials_consumed = 0)`)
          .bind(quantity, telegramId, assetKey, quantity, petId, evolutionId));
    } else {
      statements.push(db.prepare(`UPDATE telegram_pet_inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ? AND asset_type = ? AND asset_key = ? AND quantity >= ?
            AND EXISTS (SELECT 1 FROM telegram_pet_evolutions_by_pet WHERE pet_id = ? AND evolution_id = ? AND materials_consumed = 0)`)
          .bind(quantity, telegramId, assetType, assetKey, quantity, petId, evolutionId));
    }
  }
  statements.push(db.prepare(`INSERT INTO telegram_pet_memories (pet_id, telegram_id, season_key, milestones)
    SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_evolutions_by_pet
      WHERE pet_id=? AND telegram_id=? AND evolution_id=? AND materials_consumed=0)
    ON CONFLICT(pet_id) DO UPDATE SET
      milestones = CASE WHEN EXISTS (SELECT 1 FROM json_each(telegram_pet_memories.milestones) WHERE value = ?)
        THEN telegram_pet_memories.milestones ELSE json_insert(telegram_pet_memories.milestones, '$[#]', ?) END,
      updated_at = CURRENT_TIMESTAMP
    WHERE telegram_pet_memories.pet_id = excluded.pet_id
      AND telegram_pet_memories.telegram_id = excluded.telegram_id
      AND telegram_pet_memories.season_key = excluded.season_key`)
    .bind(petId, telegramId, scope.season_key, safeJson([evolutionMilestone]), petId, telegramId, evolutionId, evolutionMilestone, evolutionMilestone));
  statements.push(db.prepare(`UPDATE telegram_pet_evolutions_by_pet SET materials_consumed = 1
    WHERE pet_id = ? AND telegram_id = ? AND evolution_id = ? AND materials_consumed = 0
      AND EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?)`)
    .bind(petId, telegramId, evolutionId, petId, telegramId, scope.season_key));
  statements.push(db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_analytics
      (analytics_id, pet_id, telegram_id, season_key, event_type, evolution_id, duration_seconds, event_data)
      SELECT ?, ?, ?, ?, 'evolution_unlock', ?, MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(COALESCE(m.first_adoption_at, e.unlocked_at))) * 86400 AS INTEGER)), ?
      FROM telegram_pet_evolutions_by_pet e LEFT JOIN telegram_pet_memories m
        ON m.pet_id = e.pet_id AND m.telegram_id = e.telegram_id AND m.season_key = ?
      WHERE e.pet_id = ? AND e.telegram_id = ? AND e.evolution_id = ?`)
      .bind(`evolution_unlock:${petId}:${evolutionId}`, petId, telegramId, scope.season_key, evolutionId,
        safeJson({ pet_id: petId, stage: definition.stage, name: definition.name }), scope.season_key, petId, telegramId, evolutionId));
  statements.push(db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_analytics
      (analytics_id, pet_id, telegram_id, season_key, event_type, milestone_id, event_data)
      SELECT ?, ?, ?, ?, 'memory_milestone', ?, ? WHERE EXISTS
        (SELECT 1 FROM telegram_pet_evolutions_by_pet WHERE pet_id = ? AND telegram_id = ? AND evolution_id = ?)`)
      .bind(`memory_milestone:${petId}:${evolutionMilestone}`, petId, telegramId, scope.season_key, evolutionMilestone,
        safeJson({ memory_type: 'milestone', evolution_id: evolutionId, pet_id: petId }), petId, telegramId, evolutionId));
  const results = await db.batch(statements);
  if (!results?.[0]?.meta?.changes) {
    const concurrent = await db.prepare(`SELECT evolution_id, stage, unlocked_at FROM telegram_pet_evolutions_by_pet WHERE pet_id = ? AND evolution_id = ?`)
      .bind(petId, evolutionId).first().catch(() => null);
    if (concurrent) return { accepted: true, duplicate: true, reason: 'already_evolved', evolution: concurrent };
    return { accepted: false, duplicate: false, reason: 'requirements_not_met' };
  }
  return { accepted: true, duplicate: false, reason: 'evolved', evolution: definition };
}

export async function getMoonpetIdentitySummary(db, telegramIdRaw, request = {}) {
  const telegramId = String(telegramIdRaw || '').trim();
  const explicitScopeRequested = Boolean(String(request.pet_id || '').trim() || String(request.season_key || '').trim());
  const scope = await readMoonpetIdentityScope(db, telegramId, request);
  if (explicitScopeRequested && !scope) return null;
  const evolution = scope?.pet_id
    ? await db.prepare(`SELECT e.evolution_id, e.stage, e.unlocked_at
        FROM telegram_pet_evolutions_by_pet e
        JOIN telegram_pet_instances i ON i.pet_id = e.pet_id AND i.telegram_id = e.telegram_id
        WHERE e.pet_id = ? AND e.telegram_id = ? AND i.season_key = ?
        ORDER BY e.stage DESC LIMIT 1`)
      .bind(scope.pet_id, telegramId, scope.season_key).first().catch(() => null)
    : null;
  const [legacyEvolution, traits, memory, bossVictories] = await Promise.all([
    (!explicitScopeRequested && !evolution && (!scope?.pet_id || Number(scope?.slot_number || 1) <= 1 || scope?.acquisition_type === 'free'))
      ? db.prepare(`SELECT evolution_id, stage, unlocked_at FROM telegram_pet_evolutions WHERE telegram_id = ? ORDER BY stage DESC LIMIT 1`).bind(telegramId).first().catch(() => null)
      : Promise.resolve(null),
    scope?.pet_id
      ? db.prepare(`SELECT trait_id, progress, unlocked_at FROM telegram_pet_personality_traits
          WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND unlocked_at IS NOT NULL
          ORDER BY unlocked_at, trait_id LIMIT 4`).bind(scope.pet_id, telegramId, scope.season_key).all().catch(() => ({ results: [] }))
      : Promise.resolve({ results: [] }),
    scope?.pet_id
      ? db.prepare(`SELECT * FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?`).bind(scope.pet_id, telegramId, scope.season_key).first().catch(() => null)
      : Promise.resolve(null),
    scope?.pet_id
      ? db.prepare(`SELECT boss_id, victories, updated_at FROM telegram_pet_boss_victories
          WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
          ORDER BY victories DESC, boss_id LIMIT 20`).bind(scope.pet_id, telegramId, scope.season_key).all().catch(() => ({ results: [] }))
      : Promise.resolve({ results: [] }),
  ]);
  const currentEvolution = evolution || legacyEvolution;
  const current = currentEvolution ? MOONPET_EVOLUTIONS[currentEvolution.evolution_id] : MOONPET_EVOLUTIONS.moon_egg;
  let milestones = [];
  try { milestones = JSON.parse(memory?.milestones || '[]'); } catch {}
  if (!Array.isArray(milestones)) milestones = [];
  milestones = milestones.slice(0, 20);
  return {
    scope,
    current_stage: { evolution_id: current.evolution_id, name: current.name, stage: current.stage, unlocked_at: currentEvolution?.unlocked_at || null },
    personalities: (traits.results || []).map((trait) => ({ ...trait, name: Object.values(MOONPET_PERSONALITY_TRAITS).find((entry) => entry.trait_id === trait.trait_id)?.name || trait.trait_id })),
    memories: memory ? { ...memory, milestones } : null,
    boss_victories: (bossVictories.results || []).map((row) => ({
      boss_id: row.boss_id,
      victories: positiveInteger(row.victories),
      updated_at: row.updated_at || null,
    })),
  };
}

export function formatMoonpetIdentitySummary(summary = {}) {
  const personalities = summary.personalities?.length ? summary.personalities.slice(0, 4).map((trait) => `- ${safeTelegramText(trait.name)}`).join('\n') : '- Still forming';
  const memory = summary.memories || {};
  const bossName = memory.first_boss_id
    ? String(memory.first_boss_id).split('_').slice(0, 8).map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ')
    : null;
  const memoryLines = [
    bossName ? `- First Boss Defeated: ${safeTelegramText(bossName)}` : null,
    Number(memory.total_runs || 0) > 0 ? `- Runs Completed: ${Number(memory.total_runs)}` : null,
    memory.favourite_activity ? `- Favourite: ${safeTelegramText(memory.favourite_activity)}` : null,
    Number(memory.biggest_reward_amount || 0) > 0 ? `- Biggest Reward: ${Number(memory.biggest_reward_amount)} ${memory.biggest_reward_currency === 'moon_gold' ? 'Moon Gold' : safeTelegramText(memory.biggest_reward_currency, 40)}` : null,
  ].filter(Boolean);
  return `Current Stage:\n${safeTelegramText(summary.current_stage?.name || 'Moon Egg')}\n\nPersonality:\n${personalities}\n\nMemories:\n${memoryLines.length ? memoryLines.slice(0, 4).join('\n') : '- Your story is just beginning'}`;
}

export async function getMoonpetIdentityAnalytics(db) {
  const rows = await db.prepare(`SELECT event_type, evolution_id, trait_id, COUNT(*) AS unlocks,
    AVG(duration_seconds) AS average_time_to_evolution_seconds
    FROM telegram_pet_identity_analytics GROUP BY event_type, evolution_id, trait_id ORDER BY event_type, evolution_id, trait_id`).all();
  const adopted = await db.prepare(`SELECT COUNT(DISTINCT pet_id) AS count FROM telegram_pet_memories WHERE first_adoption_at IS NOT NULL`).first();
  const adoptedPets = positiveInteger(adopted?.count);
  return {
    adopted_pets: adoptedPets,
    events: (rows.results || []).map((row) => ({
      ...row,
      personality_unlock_rate: row.event_type === 'personality_unlock' && adoptedPets > 0 ? Number(row.unlocks || 0) / adoptedPets : null,
    })),
  };
}

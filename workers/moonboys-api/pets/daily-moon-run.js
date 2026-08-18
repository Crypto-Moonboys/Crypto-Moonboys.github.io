import dailyChallenges from './content/daily-challenges.json' with { type: 'json' };
import {
  PET_ROGUELITE_BOSSES,
  PET_ROGUELITE_ENEMIES,
  PET_ROGUELITE_REGIONS,
  PET_RUN_MODIFIERS,
  advancePetRun,
  choosePetRunModifier,
  completePetRun,
  createPetRunRoom,
  extractPetRogueliteRun,
  failPetRun,
  generatePetRunRoom,
  persistPetRunRoomOutcome,
  resolvePetRunRoom,
  rewardPetRogueliteBoss,
  startPetRogueliteRun,
} from './roguelite-foundation.js';
import { recordMoonpetMemory } from './moonpet-identity.js';
import { getMoonpetSeasonKey } from './season-authority.js';
import { awardPetGrowthMark } from './season-completion.js';

const UTC_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const TERMINAL_DAILY_STATUSES = new Set(['completed', 'failed', 'abandoned', 'extracted']);
const SUCCESSFUL_DAILY_STATUSES = new Set(['completed', 'extracted']);
const CARE_ACTIONS = new Set(['feed', 'play', 'clean', 'sleep']);
const DAILY_JOURNEY_REQUIRED_OBJECTIVES = 3;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function positiveInteger(value, maximum = 999999999) {
  return Math.min(maximum, Math.max(0, Math.floor(Number(value) || 0)));
}

function safeJson(value) {
  return JSON.stringify(value == null ? {} : value);
}

function validUtcDay(value) {
  const day = String(value || '');
  if (!UTC_DAY_PATTERN.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function utcDayFromNow(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error('invalid_daily_run_time');
  return date.toISOString().slice(0, 10);
}

function parseSqliteDate(value) {
  if (!value) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(String(value)) ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validateDailyChallengeContent(content = dailyChallenges) {
  if (!Array.isArray(content) || content.length !== 5) throw new Error('invalid_daily_challenge_content');
  const ids = new Set();
  const categories = new Set(['combat', 'explorer', 'extraction', 'boss', 'care']);
  for (const challenge of content) {
    if (!ID_PATTERN.test(String(challenge?.challenge_id || '')) || ids.has(challenge.challenge_id)) throw new Error('invalid_daily_challenge_id');
    if (!categories.has(challenge.category) || ids.has(challenge.category)) throw new Error('invalid_daily_challenge_category');
    if (positiveInteger(challenge.target, 100) !== Number(challenge.target) || challenge.target < 1) throw new Error('invalid_daily_challenge_target');
    if (typeof challenge.description !== 'string' || challenge.description.length < 8 || challenge.description.length > 180) throw new Error('invalid_daily_challenge_description');
    const rules = challenge.validation_rules;
    if (!rules || typeof rules !== 'object' || Array.isArray(rules) || !['add', 'max'].includes(rules.progress_mode)) throw new Error('invalid_daily_challenge_validation');
    if (typeof rules.authority !== 'string' || !rules.authority.startsWith('telegram_pet_')) throw new Error('invalid_daily_challenge_validation');
    ids.add(challenge.challenge_id);
    ids.add(challenge.category);
  }
  return true;
}

validateDailyChallengeContent();

export const PET_DAILY_CHALLENGES = deepFreeze(Object.fromEntries(dailyChallenges.map((challenge) => [challenge.challenge_id, challenge])));
const DAILY_JOURNEY_TOTAL_OBJECTIVES = Object.keys(PET_DAILY_CHALLENGES).length;

export async function generateDailyMoonRunSeed(utcDayRaw) {
  const utcDay = String(utcDayRaw || '');
  if (!validUtcDay(utcDay)) throw new Error('invalid_daily_run_day');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`crypto_moonboys_daily_${utcDay}`));
  const bytes = new Uint8Array(digest);
  const runSeed = (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0) || 1;
  return Object.freeze({ utc_day: utcDay, seed: `${utcDay}-${String(runSeed).padStart(10, '0')}`, run_seed: runSeed });
}

export function getDailySeasonId(utcDayRaw) {
  const utcDay = String(utcDayRaw || '');
  if (!validUtcDay(utcDay)) throw new Error('invalid_daily_run_day');
  return getMoonpetSeasonKey(`${utcDay}T00:00:00.000Z`);
}

function dailyRunId(telegramId, utcDay) {
  return `daily:${utcDay}:${telegramId}`.slice(0, 120);
}

function dailyModifierId(runSeed) {
  const ids = Object.keys(PET_RUN_MODIFIERS).sort();
  if (!ids.length) throw new Error('daily_run_modifier_catalog_empty');
  return ids[runSeed % ids.length];
}

async function getDailyRunRow(db, telegramId, utcDay) {
  return db.prepare(`SELECT d.*, r.season_key, r.status AS authoritative_status, r.region, r.difficulty, r.current_room, r.max_room, r.started_at, r.ended_at,
      r.completed_at AS run_completed_at, r.rooms_completed, r.score AS authoritative_score, r.depth AS authoritative_depth
    FROM telegram_pet_daily_runs d JOIN telegram_pet_runs r ON r.run_id = d.run_id AND r.telegram_id = d.telegram_id
    WHERE d.telegram_id = ? AND d.utc_day = ?`).bind(telegramId, utcDay).first().catch(() => null);
}

export async function getDailyMoonRunReservation(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const runId = String(request.run_id || '').trim();
  if (!telegramId || !runId) return null;
  return db.prepare(`SELECT d.*, r.status AS authoritative_status, r.region, r.difficulty, r.seed AS run_seed,
      r.current_room, r.max_room, r.score AS authoritative_score, r.depth AS authoritative_depth, r.started_at
    FROM telegram_pet_daily_runs d JOIN telegram_pet_runs r ON r.run_id = d.run_id AND r.telegram_id = d.telegram_id
    WHERE d.telegram_id = ? AND d.run_id = ? LIMIT 1`).bind(telegramId, runId).first().catch(() => null);
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function dailyRoomScore(room) {
  return ({ choice_event: 50, loot: 75, battle: 100, elite: 175, boss: 250 })[String(room?.room_type)] || 50;
}

function stableDailyOutcomeRoll(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function dailyChoiceRiskAdjustment(choiceId) {
  const choice = String(choiceId || '').toLowerCase();
  if (/(?:safe|escape|hide|leave|retreat|sneak|scan|ignore)/.test(choice)) return 700;
  if (/(?:risk|gamble|steal|challenge|fight|confront)/.test(choice)) return -300;
  return 0;
}

function dailyRoomDifficulty(room) {
  if (room?.boss_id) return positiveInteger(PET_ROGUELITE_BOSSES[room.boss_id]?.difficulty, 10);
  if (room?.enemy_id) return positiveInteger(PET_ROGUELITE_ENEMIES[room.enemy_id]?.difficulty, 10);
  return room?.room_type === 'elite' ? 3 : 0;
}

async function resolveAuthoritativeDailyRoomOutcome(db, run, room, choiceId) {
  const petId = String(run?.pet_id || '').trim();
  if (!petId) throw new Error('run_pet_authority_required');
  const [pet, modifierRows] = await Promise.all([
    db.prepare(`SELECT pet_xp, level, health, energy, happiness, cleanliness
      FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? LIMIT 1`).bind(petId, run.telegram_id).first(),
    db.prepare(`SELECT modifier_id, effects_json FROM telegram_pet_run_modifiers
      WHERE run_id = ? AND telegram_id = ? ORDER BY modifier_id`).bind(run.run_id, run.telegram_id).all()
      .catch(() => ({ results: [] })),
  ]);
  if (!pet) throw new Error('daily_run_pet_not_found');
  const modifiers = (modifierRows.results || []).map((row) => ({
    modifier_id: String(row.modifier_id || ''),
    effects: parseJsonObject(row.effects_json),
  }));
  const effects = modifiers.reduce((combined, modifier) => ({ ...combined, ...modifier.effects }), {});
  const roomType = String(room?.room_type || 'choice_event');
  const baseChance = ({ choice_event: 9000, loot: 9500, battle: 8200, elite: 7600, boss: 7000 })[roomType] || 8500;
  const stateAverage = ['health', 'energy', 'happiness', 'cleanliness']
    .reduce((total, key) => total + Math.max(0, Math.min(100, Number(pet[key]) || 0)), 0) / 4;
  const authoritativeLevel = Math.max(1, positiveInteger(pet.level, 100), Math.floor(positiveInteger(pet.pet_xp) / 100) + 1);
  const playerAdjustment = Math.round((stateAverage - 50) * 25) + Math.min(1000, authoritativeLevel * 20);
  const modifierAdjustment = (Number(effects.event_outcome_pct) || 0) * 100
    + (Number(effects.damage_dealt_pct) || 0) * 15
    - (Number(effects.damage_taken_pct) || 0) * 15
    - (Number(effects.enemy_speed_pct) || 0) * 20
    - (Number(effects.energy_cost_modifier) || 0) * 30;
  const difficulty = dailyRoomDifficulty(room);
  const successChanceBps = Math.max(500, Math.min(9950, Math.round(baseChance + playerAdjustment + modifierAdjustment
    + dailyChoiceRiskAdjustment(choiceId) - (difficulty * 350))));
  const rollKey = [run.seed, room.room, room.content_id, room.enemy_id || room.boss_id || '', choiceId,
    ...modifiers.map((modifier) => modifier.modifier_id)].join(':');
  const riskRollBps = stableDailyOutcomeRoll(rollKey) % 10000;
  const success = riskRollBps < successChanceBps;
  return {
    success,
    choice_id: choiceId,
    score: success ? dailyRoomScore(room) : 0,
    risk_roll_bps: riskRollBps,
    success_chance_bps: successChanceBps,
    difficulty,
    modifier_ids: modifiers.map((modifier) => modifier.modifier_id),
    player_state: {
      level: authoritativeLevel,
      health: positiveInteger(pet.health, 100),
      energy: positiveInteger(pet.energy, 100),
      happiness: positiveInteger(pet.happiness, 100),
      cleanliness: positiveInteger(pet.cleanliness, 100),
    },
    authority: 'daily_moon_run_server_outcome_v1',
  };
}

async function getPersistedDailyRoom(db, run, roomNumber) {
  const row = await db.prepare(`SELECT room_id, run_id, telegram_id, room_number, room_type, status, generated_data, outcome_data
    FROM telegram_pet_run_rooms WHERE run_id = ? AND telegram_id = ? AND room_number = ? LIMIT 1`)
    .bind(run.run_id, run.telegram_id, roomNumber).first().catch(() => null);
  if (!row) return null;
  const generated = parseJsonObject(row.generated_data);
  return {
    ...generated,
    room_id: row.room_id,
    run_id: row.run_id,
    telegram_id: row.telegram_id,
    room: row.room_number,
    room_type: row.room_type,
    status: row.status,
    outcome: parseJsonObject(row.outcome_data),
  };
}

async function persistDailyRunAdvance(db, run, advanced) {
  await db.prepare(`UPDATE telegram_pet_runs SET current_room = MAX(current_room, ?), depth = MAX(depth, ?),
      rooms_completed = MAX(rooms_completed, ?), score = MAX(score, ?), updated_at = CURRENT_TIMESTAMP
    WHERE run_id = ? AND telegram_id = ? AND status IN ('active', 'extractable')`)
    .bind(advanced.current_room, advanced.current_room, advanced.current_room, advanced.score, run.run_id, run.telegram_id).run();
}

async function resolveDailyRunSeasonPet(db, telegramId, seasonKey) {
  const active = await db.prepare(`SELECT a.pet_id, a.season_key FROM telegram_pet_active_slots a
    JOIN telegram_pet_season_slots s ON s.pet_id = a.pet_id AND s.telegram_id = a.telegram_id AND s.season_key = a.season_key
    JOIN telegram_pet_instances i ON i.pet_id = s.pet_id AND i.telegram_id = s.telegram_id
      AND i.season_key = s.season_key AND i.slot_number = s.slot_number
    WHERE a.telegram_id = ? AND s.status = 'active' AND i.status = 'active' LIMIT 1`)
    .bind(telegramId).first().catch(() => null);
  if (active?.season_key === seasonKey) return { accepted: true, pet_id: active.pet_id, season_key: seasonKey };
  const currentSeasonPet = await db.prepare(`SELECT s.pet_id, s.season_key FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i ON i.pet_id = s.pet_id AND i.telegram_id = s.telegram_id
      AND i.season_key = s.season_key AND i.slot_number = s.slot_number
    WHERE s.telegram_id = ? AND s.season_key = ? AND s.status = 'active' AND i.status = 'active'
    ORDER BY CASE WHEN s.slot_number = 1 THEN 0 ELSE 1 END, s.slot_number, s.created_at LIMIT 1`)
    .bind(telegramId, seasonKey).first().catch(() => null);
  if (!currentSeasonPet) return { accepted: false, reason: 'daily_run_current_season_pet_required' };
  return { accepted: true, pet_id: currentSeasonPet.pet_id, season_key: seasonKey, recovered: true };
}

export async function createDailyMoonRun(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  if (!telegramId) throw new Error('invalid_daily_run_player');
  const utcDay = utcDayFromNow(request.now);
  const generated = await generateDailyMoonRunSeed(utcDay);
  const runId = dailyRunId(telegramId, utcDay);
  const region = PET_ROGUELITE_REGIONS.moon_alley;
  const seasonId = getDailySeasonId(utcDay);
  const existingDaily = await getDailyRunRow(db, telegramId, utcDay);
  if (!existingDaily) {
    const seasonPet = await resolveDailyRunSeasonPet(db, telegramId, seasonId);
    if (!seasonPet.accepted) {
      return { accepted: false, duplicate: false, reason: seasonPet.reason, utc_day: utcDay, seed: generated.seed };
    }
    const started = await startPetRogueliteRun(db, {
      telegram_id: telegramId,
      run_id: runId,
      region: 'moon_alley',
      seed: generated.run_seed,
      max_room: region.max_rooms,
      season_key: seasonId,
      pet_id: seasonPet.pet_id,
    });
    if (!started.accepted && !started.duplicate) {
      return { accepted: false, duplicate: false, reason: started.reason || 'daily_run_pet_authority_mismatch', utc_day: utcDay, run_id: runId, seed: generated.seed };
    }
  } else {
    const seasonPet = await resolveDailyRunSeasonPet(db, telegramId, seasonId);
    if (!seasonPet.accepted) {
      return { accepted: false, duplicate: false, reason: seasonPet.reason, utc_day: utcDay, seed: generated.seed };
    }
    if (
      String(existingDaily.pet_id || '') !== String(seasonPet.pet_id || '') ||
      String(existingDaily.season_key || '') !== String(seasonId)
    ) {
      return {
        accepted: false,
        duplicate: false,
        reason: 'daily_run_pet_authority_mismatch',
        utc_day: utcDay,
      };
    }
  }
  const authoritativeRun = await db.prepare(`SELECT * FROM telegram_pet_runs WHERE telegram_id = ? AND run_id = ?`)
    .bind(telegramId, runId).first().catch(() => null);
  if (!authoritativeRun) return { accepted: false, duplicate: false, reason: 'active_run_exists', utc_day: utcDay, seed: generated.seed };
  if (!String(authoritativeRun.pet_id || '').trim()) {
    return { accepted: false, duplicate: false, reason: 'run_pet_authority_required', utc_day: utcDay, run_id: runId, seed: generated.seed };
  }
  const modifierId = dailyModifierId(generated.run_seed);
  const writes = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_daily_runs
      (telegram_id, pet_id, utc_day, seed, run_id, status, score, depth, boss_defeated)
      SELECT ?, pet_id, ?, ?, run_id, CASE WHEN status = 'extractable' THEN 'active' ELSE status END, score, MAX(depth, current_room), 0
      FROM telegram_pet_runs WHERE telegram_id = ? AND run_id = ?`)
      .bind(telegramId, utcDay, generated.seed, telegramId, runId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_daily_analytics
      (analytics_id, pet_id, telegram_id, utc_day, run_id, event_type, event_data)
      SELECT ?, pet_id, ?, ?, ?, 'run_created', ? FROM telegram_pet_daily_runs
        WHERE telegram_id = ? AND utc_day = ? AND run_id = ?`)
      .bind(`${runId}:daily:created`, telegramId, utcDay, runId,
        safeJson({ seed: generated.seed, run_seed: generated.run_seed, region: 'moon_alley', difficulty: region.difficulty, modifier_id: modifierId }),
        telegramId, utcDay, runId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_seasonal_achievements
      (telegram_id, season_id, achievement_id, metadata)
      SELECT ?, ?, 'first_daily_moon_run', ? WHERE EXISTS
        (SELECT 1 FROM telegram_pet_daily_runs WHERE telegram_id = ? AND utc_day = ?)`)
      .bind(telegramId, seasonId, safeJson({ utc_day: utcDay }), telegramId, utcDay),
  ]);
  await choosePetRunModifier(db, authoritativeRun, modifierId);
  const room = ['active', 'extractable'].includes(String(authoritativeRun.status))
    && positiveInteger(authoritativeRun.current_room) < positiveInteger(authoritativeRun.max_room)
    ? await createPetRunRoom(db, authoritativeRun)
    : null;
  await recordMoonpetMemory(db, {
    telegram_id: telegramId,
    event_key: `daily:memory:first-run:${telegramId}`,
    memory_type: 'milestone',
    milestone: 'first_daily_moon_run',
  });
  const daily = await getDailyRunRow(db, telegramId, utcDay);
  return {
    accepted: true,
    duplicate: !writes?.[0]?.meta?.changes,
    reason: writes?.[0]?.meta?.changes ? 'daily_run_created' : 'daily_run_exists',
    daily_run: daily,
    challenge_seed: generated.seed,
    run_seed: generated.run_seed,
    modifier_id: modifierId,
    room,
    challenges: Object.values(PET_DAILY_CHALLENGES),
  };
}

export async function processDailyMoonRunStep(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const runId = String(request.run_id || '').trim();
  const choiceId = String(request.choice_key || '').trim();
  if (!telegramId || !runId || !choiceId) throw new Error('invalid_daily_run_step');
  const daily = await getDailyMoonRunReservation(db, { telegram_id: telegramId, run_id: runId });
  if (!daily) return { accepted: false, duplicate: false, reason: 'daily_run_not_found' };
  if (!String(daily.pet_id || '').trim()) return { accepted: false, duplicate: false, reason: 'run_pet_authority_required', daily_run: daily };
  if (!['active', 'extractable'].includes(String(daily.authoritative_status))) {
    return { accepted: false, duplicate: true, reason: 'daily_run_terminal', daily_run: daily };
  }
  const run = {
    ...daily,
    telegram_id: telegramId,
    run_id: runId,
    seed: daily.run_seed,
    score: daily.authoritative_score,
    depth: daily.authoritative_depth,
    status: daily.authoritative_status,
  };
  const generated = generatePetRunRoom(run);
  const expectedRoom = request.expected_step_index == null ? null : positiveInteger(request.expected_step_index) + 1;
  if (expectedRoom != null && expectedRoom !== generated.room) {
    return { accepted: false, duplicate: false, reason: 'stale_daily_room', expected_room: generated.room };
  }
  let room = await createPetRunRoom(db, run);
  if (room.duplicate) room = await getPersistedDailyRoom(db, run, generated.room) || room;
  if (!Array.isArray(room.choices) || !room.choices.some((choice) => choice.choice_id === choiceId)) {
    return { accepted: false, duplicate: false, reason: 'invalid_daily_room_choice', room };
  }
  let resolved = room;
  if (room.status === 'pending') {
    const outcome = await resolveAuthoritativeDailyRoomOutcome(db, run, room, choiceId);
    const authoritativeResolution = resolvePetRunRoom(room, outcome);
    resolved = await persistPetRunRoomOutcome(db, run, room, authoritativeResolution.outcome);
  }
  if (resolved.status === 'failed') {
    await failPetRun(db, run, { rooms_completed: positiveInteger(run.current_room), death_reason: 'daily_room_failed' });
    const synchronized = await syncDailyMoonRun(db, { telegram_id: telegramId, utc_day: daily.utc_day, run_id: runId, now: request.now });
    return { ...synchronized, accepted: true, duplicate: Boolean(resolved.duplicate), reason: 'daily_room_failed', room: resolved };
  }
  if (resolved.status !== 'resolved') return { accepted: false, duplicate: true, reason: 'daily_room_not_pending', room: resolved };
  const advanced = advancePetRun(run, resolved);
  await persistDailyRunAdvance(db, run, advanced);
  let boss_reward = null;
  if (resolved.boss_id) boss_reward = await rewardPetRogueliteBoss(db, advanced, resolved.boss_id, resolved);
  let completion = null;
  if (advanced.current_room >= positiveInteger(run.max_room)) {
    completion = await completePetRun(db, advanced, {}, {
      rooms_completed: advanced.current_room,
      boss_fought: resolved.boss_id || null,
    });
  } else {
    const nextRun = { ...advanced, status: 'active' };
    await createPetRunRoom(db, nextRun);
  }
  const synchronized = await syncDailyMoonRun(db, { telegram_id: telegramId, utc_day: daily.utc_day, run_id: runId, now: request.now });
  return {
    ...synchronized,
    accepted: true,
    duplicate: Boolean(resolved.duplicate),
    reason: completion ? 'daily_run_completed' : 'daily_room_resolved',
    room: resolved,
    boss_reward,
    completion,
  };
}

export async function extractDailyMoonRun(db, request = {}) {
  const daily = await getDailyMoonRunReservation(db, request);
  if (!daily) return { accepted: false, duplicate: false, reason: 'daily_run_not_found' };
  if (!String(daily.pet_id || '').trim()) return { accepted: false, duplicate: false, reason: 'run_pet_authority_required', daily_run: daily, extraction: null };
  const completedRoom = positiveInteger(daily.authoritative_depth) > 0
    ? { count: 1 }
    : await db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_run_rooms
      WHERE run_id = ? AND telegram_id = ? AND status = 'resolved'`).bind(daily.run_id, daily.telegram_id).first();
  if (positiveInteger(daily.authoritative_depth) <= 0 && positiveInteger(completedRoom?.count) <= 0) {
    return { accepted: false, duplicate: false, reason: 'daily_run_empty', daily_run: daily, extraction: null };
  }
  const run = {
    ...daily,
    telegram_id: daily.telegram_id,
    run_id: daily.run_id,
    seed: daily.run_seed,
    score: daily.authoritative_score,
    depth: daily.authoritative_depth,
    status: daily.authoritative_status,
  };
  const extraction = await extractPetRogueliteRun(db, run, {}, { rooms_completed: positiveInteger(run.current_room) });
  const synchronized = await syncDailyMoonRun(db, {
    telegram_id: daily.telegram_id, utc_day: daily.utc_day, run_id: daily.run_id, now: request.now,
  });
  return { ...synchronized, accepted: Boolean(extraction.accepted), duplicate: Boolean(extraction.duplicate), extraction };
}

async function recordChallengeEvidence(db, request) {
  const challenge = PET_DAILY_CHALLENGES[request.challenge_id];
  if (!challenge) throw new Error('invalid_daily_challenge');
  const telegramId = String(request.telegram_id || '').trim();
  const utcDay = String(request.utc_day || '');
  const eventKey = String(request.event_key || '').trim().slice(0, 180);
  if (!telegramId || !validUtcDay(utcDay) || !eventKey) throw new Error('invalid_daily_challenge_evidence');
  const eventId = crypto.randomUUID();
  const value = Math.min(challenge.target, positiveInteger(request.progress_value, challenge.target));
  if (value < 1) return { accepted: false, duplicate: false, completed: false, progress: 0 };
  const seasonId = getDailySeasonId(utcDay);
  const requestedPetId = String(request.pet_id || request.evidence?.pet_id || '').trim();
  const participatingPet = requestedPetId
    ? await db.prepare(`SELECT pet_id, telegram_id, season_key FROM telegram_pet_season_slots
      WHERE pet_id = ? AND telegram_id = ? AND season_key = ? LIMIT 1`)
      .bind(requestedPetId, telegramId, seasonId).first().catch(() => null)
    : await db.prepare(`SELECT pet_id, telegram_id, ? AS season_key FROM telegram_pet_daily_runs
      WHERE telegram_id = ? AND utc_day = ? AND pet_id IS NOT NULL LIMIT 1`)
      .bind(seasonId, telegramId, utcDay).first().catch(() => null);
  const petId = String(participatingPet?.pet_id || '').trim();
  const analyticsId = `daily:challenge:${telegramId}:${utcDay}:${challenge.challenge_id}`;
  const nextProgressSql = challenge.validation_rules.progress_mode === 'max'
    ? `MAX(telegram_pet_daily_challenge_progress.progress, excluded.progress)`
    : `MIN(${challenge.target}, telegram_pet_daily_challenge_progress.progress + excluded.progress)`;
  const results = await db.batch([
    ...(petId ? [db.prepare(`INSERT OR IGNORE INTO telegram_pet_daily_journey_objectives
      (event_id, telegram_id, pet_id, season_key, utc_day, challenge_id, event_key, progress_value, status, evidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)`)
      .bind(`daily-journey:objective:${petId}:${utcDay}:${challenge.challenge_id}:${eventKey}`,
        telegramId, petId, seasonId, utcDay, challenge.challenge_id, eventKey, value, safeJson(request.evidence))] : []),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_daily_challenge_events
      (event_id, telegram_id, utc_day, challenge_id, event_key, progress_value, evidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(eventId, telegramId, utcDay, challenge.challenge_id, eventKey, value, safeJson(request.evidence)),
    db.prepare(`INSERT INTO telegram_pet_daily_challenge_progress
      (telegram_id, utc_day, challenge_id, progress, completed_at)
      SELECT ?, ?, ?, progress_value, CASE WHEN progress_value >= ? THEN CURRENT_TIMESTAMP END
      FROM telegram_pet_daily_challenge_events WHERE event_id = ? AND applied_at IS NULL
      ON CONFLICT(telegram_id, utc_day, challenge_id) DO UPDATE SET
        progress = ${nextProgressSql},
        completed_at = COALESCE(telegram_pet_daily_challenge_progress.completed_at,
          CASE WHEN ${nextProgressSql} >= ${challenge.target} THEN CURRENT_TIMESTAMP END)`)
      .bind(telegramId, utcDay, challenge.challenge_id, challenge.target, eventId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_daily_analytics
      (analytics_id, pet_id, telegram_id, utc_day, event_type, event_data)
      SELECT ?, (SELECT pet_id FROM telegram_pet_daily_runs WHERE telegram_id = ? AND utc_day = ?), ?, ?, 'challenge_completed', ? FROM telegram_pet_daily_challenge_progress
      WHERE telegram_id = ? AND utc_day = ? AND challenge_id = ? AND completed_at IS NOT NULL`)
      .bind(analyticsId, telegramId, utcDay, telegramId, utcDay, safeJson({ challenge_id: challenge.challenge_id, category: challenge.category, target: challenge.target }),
        telegramId, utcDay, challenge.challenge_id),
    db.prepare(`INSERT INTO telegram_pet_seasonal_challenge_state
      (telegram_id, season_id, completed_daily_challenges)
      SELECT ?, ?, 1 WHERE EXISTS (SELECT 1 FROM telegram_pet_daily_analytics WHERE analytics_id = ? AND applied_at IS NULL)
      ON CONFLICT(telegram_id, season_id) DO UPDATE SET
        completed_daily_challenges = telegram_pet_seasonal_challenge_state.completed_daily_challenges + 1,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(telegramId, seasonId, analyticsId),
    db.prepare(`UPDATE telegram_pet_daily_analytics SET applied_at = CURRENT_TIMESTAMP
      WHERE analytics_id = ? AND applied_at IS NULL`).bind(analyticsId),
    db.prepare(`UPDATE telegram_pet_daily_challenge_events SET applied_at = CURRENT_TIMESTAMP
      WHERE event_id = ? AND applied_at IS NULL`).bind(eventId),
  ]);
  const legacyResultOffset = petId ? 1 : 0;
  const progress = await db.prepare(`SELECT progress, completed_at FROM telegram_pet_daily_challenge_progress
    WHERE telegram_id = ? AND utc_day = ? AND challenge_id = ?`).bind(telegramId, utcDay, challenge.challenge_id).first().catch(() => null);
  const dailyJourney = petId ? await finalizeDailyJourneyGrowthMark(db, {
    telegram_id: telegramId,
    pet_id: petId,
    season_key: seasonId,
    utc_day: utcDay,
  }) : null;
  return {
    accepted: Boolean(results?.[legacyResultOffset]?.meta?.changes),
    duplicate: !results?.[legacyResultOffset]?.meta?.changes,
    completed: Boolean(progress?.completed_at),
    newly_completed: Boolean(results?.[legacyResultOffset + 2]?.meta?.changes),
    progress: positiveInteger(progress?.progress, challenge.target),
    target: challenge.target,
    daily_journey: dailyJourney,
  };
}

async function insertDailyJourneyReceipt(db, receipt) {
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_daily_journey_receipts
    (receipt_id, event_key, telegram_id, pet_id, season_key, utc_day, completed_objectives, status, reason, growth_mark_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(receipt.receipt_id, receipt.event_key, receipt.telegram_id, receipt.pet_id, receipt.season_key, receipt.utc_day,
      receipt.completed_objectives, receipt.status, receipt.reason, receipt.growth_mark_id || null).run();
}

async function finalizeDailyJourneyGrowthMark(db, request) {
  const progressRows = await db.prepare(`SELECT challenge_id, SUM(progress_value) AS additive_progress, MAX(progress_value) AS max_progress
    FROM telegram_pet_daily_journey_objectives
    WHERE telegram_id = ? AND pet_id = ? AND season_key = ? AND utc_day = ? AND status = 'accepted'
    GROUP BY challenge_id`)
    .bind(request.telegram_id, request.pet_id, request.season_key, request.utc_day).all().catch(() => ({ results: [] }));
  const completedObjectives = (progressRows.results || []).reduce((count, row) => {
    const challenge = PET_DAILY_CHALLENGES[String(row.challenge_id || '')];
    if (!challenge) return count;
    const progressMode = String(challenge.validation_rules?.progress_mode || 'add');
    const progress = progressMode === 'max'
      ? positiveInteger(row.max_progress, challenge.target)
      : Math.min(challenge.target, positiveInteger(row.additive_progress, challenge.target));
    return progress >= positiveInteger(challenge.target) ? count + 1 : count;
  }, 0);
  const eventKey = `daily-journey:${request.pet_id}:${request.season_key}:${request.utc_day}:growth-mark`;
  if (completedObjectives < DAILY_JOURNEY_REQUIRED_OBJECTIVES) {
    return {
      accepted: false,
      duplicate: false,
      completed_objectives: completedObjectives,
      required_objectives: DAILY_JOURNEY_REQUIRED_OBJECTIVES,
      total_objectives: DAILY_JOURNEY_TOTAL_OBJECTIVES,
    };
  }
  const existing = await db.prepare(`SELECT status, growth_mark_id FROM telegram_pet_daily_journey_receipts
    WHERE event_key = ? AND status = 'accepted' LIMIT 1`).bind(eventKey).first().catch(() => null);
  if (existing) {
    await insertDailyJourneyReceipt(db, {
      receipt_id: `${eventKey}:rejected:duplicate`,
      event_key: eventKey,
      telegram_id: request.telegram_id,
      pet_id: request.pet_id,
      season_key: request.season_key,
      utc_day: request.utc_day,
      completed_objectives: completedObjectives,
      status: 'rejected',
      reason: 'daily_journey_growth_mark_duplicate',
      growth_mark_id: existing.growth_mark_id,
    });
    return {
      accepted: false,
      duplicate: true,
      reason: 'daily_journey_growth_mark_duplicate',
      completed_objectives: completedObjectives,
      required_objectives: DAILY_JOURNEY_REQUIRED_OBJECTIVES,
      total_objectives: DAILY_JOURNEY_TOTAL_OBJECTIVES,
      growth_mark_id: existing.growth_mark_id,
      event_key: eventKey,
    };
  }
  const evidenceKey = `daily-run:${request.utc_day}:${DAILY_JOURNEY_REQUIRED_OBJECTIVES}-of-${DAILY_JOURNEY_TOTAL_OBJECTIVES}`;
  const expectedMarkId = `growth:${request.pet_id}:${request.season_key}:daily_moon_run_milestone:${evidenceKey}`;
  const mark = await awardPetGrowthMark(db, {
    pet_id: request.pet_id,
    telegram_id: request.telegram_id,
    season_key: request.season_key,
    milestone: 'daily_run',
    evidence_key: evidenceKey,
    earned_at: `${request.utc_day}T00:00:00.000Z`,
  });
  const authoritativeMark = mark.mark_id ? await db.prepare(`SELECT mark_id FROM telegram_pet_growth_marks
    WHERE mark_id=? AND pet_id=? AND telegram_id=? AND season_key=? AND earned_day=? LIMIT 1`)
    .bind(mark.mark_id, request.pet_id, request.telegram_id, request.season_key, request.utc_day).first().catch(() => null) : null;
  if (!mark.accepted && mark.duplicate && authoritativeMark?.mark_id === expectedMarkId) {
    await insertDailyJourneyReceipt(db, {
      receipt_id: `${eventKey}:accepted`,
      event_key: eventKey,
      telegram_id: request.telegram_id,
      pet_id: request.pet_id,
      season_key: request.season_key,
      utc_day: request.utc_day,
      completed_objectives: completedObjectives,
      status: 'accepted',
      reason: 'daily_journey_qualified',
      growth_mark_id: authoritativeMark.mark_id,
    });
    return {
      accepted: true,
      duplicate: false,
      recovered: true,
      reason: 'daily_journey_qualified',
      completed_objectives: completedObjectives,
      required_objectives: DAILY_JOURNEY_REQUIRED_OBJECTIVES,
      total_objectives: DAILY_JOURNEY_TOTAL_OBJECTIVES,
      growth_mark_id: authoritativeMark.mark_id,
      event_key: eventKey,
    };
  }
  const accepted = Boolean(mark.accepted);
  const rejectionReason = mark.duplicate ? 'daily_journey_growth_mark_duplicate' : (mark.reason || 'daily_journey_growth_mark_rejected');
  await insertDailyJourneyReceipt(db, {
    receipt_id: `${eventKey}:${accepted ? 'accepted' : 'rejected'}`,
    event_key: eventKey,
    telegram_id: request.telegram_id,
    pet_id: request.pet_id,
    season_key: request.season_key,
    utc_day: request.utc_day,
    completed_objectives: completedObjectives,
    status: accepted ? 'accepted' : 'rejected',
    reason: accepted ? 'daily_journey_qualified' : rejectionReason,
    growth_mark_id: authoritativeMark?.mark_id || null,
  });
  return {
    accepted,
    duplicate: Boolean(mark.duplicate),
    reason: accepted ? 'daily_journey_qualified' : rejectionReason,
    completed_objectives: completedObjectives,
    required_objectives: DAILY_JOURNEY_REQUIRED_OBJECTIVES,
    total_objectives: DAILY_JOURNEY_TOTAL_OBJECTIVES,
    growth_mark_id: authoritativeMark?.mark_id || null,
    event_key: eventKey,
  };
}

export async function recordDailyCareChallenge(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const eventKey = String(request.event_key || '').trim();
  if (!telegramId || !eventKey) throw new Error('invalid_daily_care_evidence');
  const evidence = await db.prepare(`SELECT pet_id, event_type, event_key, day_key FROM telegram_pet_events
    WHERE telegram_id = ? AND event_key = ? AND status = 'accepted' LIMIT 1`)
    .bind(telegramId, eventKey).first().catch(() => null);
  if (!evidence || !CARE_ACTIONS.has(String(evidence.event_type))) return { accepted: false, duplicate: false, reason: 'care_evidence_not_authorized' };
  const utcDay = String(evidence.day_key || '');
  if (!validUtcDay(utcDay)) return { accepted: false, duplicate: false, reason: 'care_evidence_not_authorized' };
  return recordChallengeEvidence(db, {
    telegram_id: telegramId,
    pet_id: evidence.pet_id,
    utc_day: utcDay,
    challenge_id: 'daily_care',
    event_key: `care:${eventKey}`,
    progress_value: 1,
    evidence: { authority: 'telegram_pet_events', pet_id: evidence.pet_id, event_key: eventKey, action: evidence.event_type },
  });
}

async function reconcileRunChallenges(db, daily) {
  const results = [];
  const rooms = await db.prepare(`SELECT room_id, room_number, room_type, status, generated_data, outcome_data
    FROM telegram_pet_run_rooms WHERE run_id = ? AND telegram_id = ? ORDER BY room_number`)
    .bind(daily.run_id, daily.telegram_id).all().catch(() => ({ results: [] }));
  for (const room of rooms.results || []) {
    if (room.status !== 'resolved') continue;
    if (['battle', 'elite'].includes(room.room_type)) results.push(await recordChallengeEvidence(db, {
      telegram_id: daily.telegram_id, pet_id: daily.pet_id, utc_day: daily.utc_day, challenge_id: 'daily_combat',
      event_key: `room:${room.room_id}:enemy`, progress_value: 1,
      evidence: { authority: 'telegram_pet_run_rooms', pet_id: daily.pet_id, run_id: daily.run_id, room_id: room.room_id },
    }));
    results.push(await recordChallengeEvidence(db, {
      telegram_id: daily.telegram_id, pet_id: daily.pet_id, utc_day: daily.utc_day, challenge_id: 'daily_explorer',
      event_key: `room:${room.room_id}:depth`, progress_value: room.room_number,
      evidence: { authority: 'telegram_pet_run_rooms', pet_id: daily.pet_id, run_id: daily.run_id, room_id: room.room_id, depth: room.room_number },
    }));
  }
  if (daily.status === 'extracted') results.push(await recordChallengeEvidence(db, {
    telegram_id: daily.telegram_id, pet_id: daily.pet_id, utc_day: daily.utc_day, challenge_id: 'daily_extraction',
    event_key: `run:${daily.run_id}:extracted`, progress_value: 1,
    evidence: { authority: 'telegram_pet_runs', pet_id: daily.pet_id, run_id: daily.run_id, status: daily.status },
  }));
  if (daily.boss_defeated) results.push(await recordChallengeEvidence(db, {
    telegram_id: daily.telegram_id, pet_id: daily.pet_id, utc_day: daily.utc_day, challenge_id: 'daily_boss',
    event_key: `run:${daily.run_id}:boss:alley_king`, progress_value: 1,
    evidence: { authority: 'telegram_pet_run_analytics', pet_id: daily.pet_id, run_id: daily.run_id, boss_id: 'alley_king' },
  }));
  return results;
}

function calculateStreaks(rows = [], referenceDayRaw = null) {
  const referenceDay = String(referenceDayRaw || '');
  const statusesByDay = new Map(rows
    .filter((row) => validUtcDay(String(row.utc_day)))
    .map((row) => [String(row.utc_day), String(row.status || 'completed')]));
  const days = [...statusesByDay.keys()].sort();
  let longest = 0;
  let sequence = 0;
  let previous = null;
  for (const day of days) {
    const time = new Date(`${day}T00:00:00.000Z`).getTime();
    if (!SUCCESSFUL_DAILY_STATUSES.has(statusesByDay.get(day))) {
      sequence = 0;
      previous = time;
      continue;
    }
    sequence = previous != null && time - previous === 86400000 ? sequence + 1 : 1;
    longest = Math.max(longest, sequence);
    previous = time;
  }
  let current = 0;
  if (validUtcDay(referenceDay) && SUCCESSFUL_DAILY_STATUSES.has(statusesByDay.get(referenceDay))) {
    let cursor = new Date(`${referenceDay}T00:00:00.000Z`);
    while (SUCCESSFUL_DAILY_STATUSES.has(statusesByDay.get(cursor.toISOString().slice(0, 10)))) {
      current += 1;
      cursor = new Date(cursor.getTime() - 86400000);
    }
  }
  return { current, longest };
}

async function finalizeDailyRecords(db, daily, referenceDay) {
  const analyticsId = `${daily.run_id}:daily:terminal`;
  const previous = await db.prepare(`SELECT * FROM telegram_pet_daily_leaderboard_records WHERE telegram_id = ?`)
    .bind(daily.telegram_id).first().catch(() => null);
  const dailyHistory = await db.prepare(`SELECT utc_day, status FROM telegram_pet_daily_runs
    WHERE telegram_id = ? AND utc_day <= ? ORDER BY utc_day`)
    .bind(daily.telegram_id, referenceDay).all().catch(() => ({ results: [] }));
  const streaks = calculateStreaks(dailyHistory.results || [], referenceDay);
  const startedAt = parseSqliteDate(daily.started_at);
  const completedAt = parseSqliteDate(daily.completed_at);
  const durationSeconds = startedAt && completedAt ? Math.max(0, Math.floor((completedAt - startedAt) / 1000)) : null;
  const fastest = daily.status === 'completed' ? durationSeconds : null;
  const seasonId = getDailySeasonId(daily.utc_day);
  const achievements = [
    positiveInteger(daily.score) > positiveInteger(previous?.highest_score) ? ['highest_daily_score', { score: positiveInteger(daily.score) }] : null,
    positiveInteger(daily.depth) > positiveInteger(previous?.deepest_run) ? ['deepest_daily_run', { depth: positiveInteger(daily.depth) }] : null,
    fastest != null && (previous?.fastest_completion_seconds == null || fastest < Number(previous.fastest_completion_seconds)) ? ['fastest_daily_clear', { duration_seconds: fastest }] : null,
    daily.boss_defeated ? ['daily_boss_victory', { boss_id: 'alley_king' }] : null,
    daily.status === 'extracted' ? ['daily_extraction', {}] : null,
    streaks.longest > positiveInteger(previous?.longest_streak) ? ['longest_daily_streak', { streak: streaks.longest }] : null,
  ].filter(Boolean);
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_daily_analytics
      (analytics_id, pet_id, telegram_id, utc_day, run_id, event_type, event_data)
      VALUES (?, ?, ?, ?, ?, 'run_terminal', ?)`)
      .bind(analyticsId, daily.pet_id, daily.telegram_id, daily.utc_day, daily.run_id,
        safeJson({ status: daily.status, score: daily.score, depth: daily.depth, boss_defeated: Boolean(daily.boss_defeated), duration_seconds: durationSeconds })),
    db.prepare(`INSERT INTO telegram_pet_daily_leaderboard_records
      (telegram_id, highest_score, fastest_completion_seconds, deepest_run, boss_completions, extraction_successes, streak_length, longest_streak, runs_recorded)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE EXISTS
        (SELECT 1 FROM telegram_pet_daily_analytics WHERE analytics_id = ? AND applied_at IS NULL)
      ON CONFLICT(telegram_id) DO UPDATE SET
        highest_score = MAX(telegram_pet_daily_leaderboard_records.highest_score, excluded.highest_score),
        fastest_completion_seconds = CASE WHEN excluded.fastest_completion_seconds IS NULL THEN telegram_pet_daily_leaderboard_records.fastest_completion_seconds
          WHEN telegram_pet_daily_leaderboard_records.fastest_completion_seconds IS NULL THEN excluded.fastest_completion_seconds
          ELSE MIN(telegram_pet_daily_leaderboard_records.fastest_completion_seconds, excluded.fastest_completion_seconds) END,
        deepest_run = MAX(telegram_pet_daily_leaderboard_records.deepest_run, excluded.deepest_run),
        boss_completions = telegram_pet_daily_leaderboard_records.boss_completions + excluded.boss_completions,
        extraction_successes = telegram_pet_daily_leaderboard_records.extraction_successes + excluded.extraction_successes,
        streak_length = excluded.streak_length,
        longest_streak = MAX(telegram_pet_daily_leaderboard_records.longest_streak, excluded.longest_streak),
        runs_recorded = telegram_pet_daily_leaderboard_records.runs_recorded + 1,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(daily.telegram_id, positiveInteger(daily.score), fastest, positiveInteger(daily.depth), daily.boss_defeated ? 1 : 0,
        daily.status === 'extracted' ? 1 : 0, streaks.current, streaks.longest, analyticsId),
    db.prepare(`INSERT INTO telegram_pet_seasonal_challenge_state
      (telegram_id, season_id, daily_streak, boss_records)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_daily_analytics WHERE analytics_id = ? AND applied_at IS NULL)
      ON CONFLICT(telegram_id, season_id) DO UPDATE SET daily_streak = excluded.daily_streak,
        boss_records = telegram_pet_seasonal_challenge_state.boss_records + excluded.boss_records,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(daily.telegram_id, seasonId, streaks.current, daily.boss_defeated ? 1 : 0, analyticsId),
  ];
  for (const [achievementId, metadata] of achievements) statements.push(db.prepare(`INSERT OR IGNORE INTO telegram_pet_seasonal_achievements
    (telegram_id, season_id, achievement_id, metadata)
    SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_daily_analytics WHERE analytics_id = ? AND applied_at IS NULL)`)
    .bind(daily.telegram_id, seasonId, achievementId, safeJson({ utc_day: daily.utc_day, ...metadata }), analyticsId));
  statements.push(db.prepare(`UPDATE telegram_pet_seasonal_challenge_state SET personal_achievements =
      (SELECT COUNT(*) FROM telegram_pet_seasonal_achievements a WHERE a.telegram_id = ? AND a.season_id = ?), updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ? AND season_id = ? AND EXISTS
      (SELECT 1 FROM telegram_pet_daily_analytics WHERE analytics_id = ? AND applied_at IS NULL)`)
    .bind(daily.telegram_id, seasonId, daily.telegram_id, seasonId, analyticsId));
  statements.push(db.prepare(`UPDATE telegram_pet_daily_analytics SET applied_at = CURRENT_TIMESTAMP
    WHERE analytics_id = ? AND applied_at IS NULL`).bind(analyticsId));
  const results = await db.batch(statements);
  if (!results?.[0]?.meta?.changes) return { duplicate: true, duration_seconds: durationSeconds, streaks };
  const memories = [
    positiveInteger(daily.score) > positiveInteger(previous?.highest_score) && positiveInteger(daily.score) > 0
      ? ['highest_daily_score', `daily:memory:highest-score:${daily.telegram_id}`] : null,
    fastest != null && (previous?.fastest_completion_seconds == null || fastest < Number(previous.fastest_completion_seconds))
      ? ['fastest_moon_alley_clear', `daily:memory:fastest-clear:${daily.telegram_id}`] : null,
    streaks.longest > positiveInteger(previous?.longest_streak)
      ? ['longest_daily_streak', `daily:memory:longest-streak:${daily.telegram_id}`] : null,
    daily.boss_defeated ? ['daily_boss_victory', `daily:memory:boss-victory:${daily.telegram_id}`] : null,
  ].filter(Boolean);
  for (const [milestone, eventKey] of memories) await recordMoonpetMemory(db, {
    telegram_id: daily.telegram_id, event_key: eventKey, memory_type: 'milestone', milestone,
  });
  return { duplicate: false, duration_seconds: durationSeconds, streaks };
}

export async function syncDailyMoonRun(db, request = {}) {
  const telegramId = String(request.telegram_id || '').trim();
  const referenceDay = utcDayFromNow(request.now);
  const requestedDay = String(request.utc_day || '');
  const requestedRunId = String(request.run_id || '').trim();
  let utcDay = requestedDay;
  if (!utcDay && requestedRunId) {
    const reservation = await getDailyMoonRunReservation(db, { telegram_id: telegramId, run_id: requestedRunId });
    utcDay = String(reservation?.utc_day || '');
  }
  if (!utcDay) {
    const reservation = await db.prepare(`SELECT utc_day FROM telegram_pet_daily_runs
      WHERE telegram_id = ? ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, utc_day DESC LIMIT 1`)
      .bind(telegramId).first().catch(() => null);
    utcDay = String(reservation?.utc_day || utcDayFromNow(request.now));
  }
  if (!telegramId || !validUtcDay(utcDay)) throw new Error('invalid_daily_run_sync');
  let daily = await getDailyRunRow(db, telegramId, utcDay);
  if (!daily) return { accepted: false, duplicate: false, reason: 'daily_run_not_found' };
  const boss = await db.prepare(`SELECT 1 AS defeated FROM telegram_pet_run_analytics
    WHERE run_id = ? AND telegram_id = ? AND event_type = 'boss_fought'
      AND json_valid(event_data) AND json_extract(event_data, '$.boss_id') = 'alley_king'
      AND json_extract(event_data, '$.outcome') = 'win' LIMIT 1`).bind(daily.run_id, telegramId).first().catch(() => null);
  const authoritativeStatus = String(daily.authoritative_status || 'active');
  const status = ['completed', 'failed', 'abandoned', 'extracted'].includes(authoritativeStatus) ? authoritativeStatus : 'active';
  const score = positiveInteger(daily.authoritative_score);
  const depth = Math.max(positiveInteger(daily.authoritative_depth), positiveInteger(daily.current_room), positiveInteger(daily.rooms_completed));
  const completedAt = TERMINAL_DAILY_STATUSES.has(status) ? (daily.run_completed_at || daily.ended_at || new Date().toISOString()) : null;
  await db.prepare(`UPDATE telegram_pet_daily_runs SET status = ?, score = ?, depth = ?, boss_defeated = ?,
      completed_at = CASE WHEN ? IS NULL THEN completed_at ELSE COALESCE(completed_at, ?) END
    WHERE telegram_id = ? AND utc_day = ? AND run_id = ?`)
    .bind(status, score, depth, boss ? 1 : 0, completedAt, completedAt, telegramId, utcDay, daily.run_id).run();
  daily = { ...daily, status, score, depth, boss_defeated: boss ? 1 : 0, completed_at: completedAt };
  const challenge_results = await reconcileRunChallenges(db, daily);
  const records = TERMINAL_DAILY_STATUSES.has(status) ? await finalizeDailyRecords(db, daily, referenceDay) : null;
  return { accepted: true, duplicate: Boolean(records?.duplicate), reason: TERMINAL_DAILY_STATUSES.has(status) ? 'daily_run_synchronized' : 'daily_run_active', daily_run: daily, challenge_results, records };
}

export async function getDailyMoonRunLeaderboard(db, request = {}) {
  const utcDay = String(request.utc_day || utcDayFromNow(request.now));
  if (!validUtcDay(utcDay)) throw new Error('invalid_daily_leaderboard_day');
  const limit = Math.min(100, Math.max(1, positiveInteger(request.limit, 100) || 25));
  const rows = await db.prepare(`SELECT d.telegram_id, d.utc_day, d.score, d.depth, d.status, d.boss_defeated,
      MAX(0, CAST((julianday(d.completed_at) - julianday(run.started_at)) * 86400 AS INTEGER)) AS completion_seconds,
      r.streak_length, r.longest_streak, r.highest_score, r.fastest_completion_seconds, r.deepest_run,
      r.boss_completions, r.extraction_successes, p.pet_name, p.stage, u.username, u.first_name, u.last_name
    FROM telegram_pet_daily_runs d
    JOIN telegram_pet_runs run ON run.run_id = d.run_id AND run.telegram_id = d.telegram_id
    LEFT JOIN telegram_pet_daily_leaderboard_records r ON r.telegram_id = d.telegram_id
    LEFT JOIN telegram_pet_profiles p ON p.telegram_id = d.telegram_id
    LEFT JOIN telegram_users u ON u.telegram_id = d.telegram_id
    WHERE d.utc_day = ?
    ORDER BY d.score DESC, d.boss_defeated DESC, d.depth DESC,
      CASE WHEN d.status IN ('completed', 'extracted') THEN completion_seconds ELSE NULL END ASC, d.created_at ASC
    LIMIT ?`).bind(utcDay, limit).all();
  return { utc_day: utcDay, entries: (rows.results || []).map((row, index) => ({ rank: index + 1, ...row })) };
}

export async function getDailyMoonRunAnalytics(db, request = {}) {
  const utcDay = String(request.utc_day || utcDayFromNow(request.now));
  if (!validUtcDay(utcDay)) throw new Error('invalid_daily_analytics_day');
  const [runs, failures, boss, challenges, streaks] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS participation, SUM(CASE WHEN status IN ('completed','extracted') THEN 1 ELSE 0 END) AS completions,
      AVG(depth) AS average_depth FROM telegram_pet_daily_runs WHERE utc_day = ?`).bind(utcDay).first(),
    db.prepare(`SELECT json_extract(rr.generated_data, '$.content_id') AS room_id, rr.room_number, COUNT(*) AS failures
      FROM telegram_pet_run_rooms rr JOIN telegram_pet_daily_runs d ON d.run_id = rr.run_id
      WHERE d.utc_day = ? AND rr.status = 'failed' GROUP BY room_id, rr.room_number ORDER BY failures DESC, rr.room_number`).bind(utcDay).all(),
    db.prepare(`SELECT COUNT(DISTINCT CASE WHEN a.event_type='boss_fought' THEN d.run_id END) AS attempts,
      COUNT(DISTINCT CASE WHEN a.event_type='boss_fought' AND json_valid(a.event_data) AND json_extract(a.event_data,'$.outcome')='win' THEN d.run_id END) AS wins
      FROM telegram_pet_daily_runs d LEFT JOIN telegram_pet_run_analytics a ON a.run_id=d.run_id WHERE d.utc_day=?`).bind(utcDay).first(),
    db.prepare(`SELECT challenge_id, COUNT(*) AS participants, SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completions
      FROM telegram_pet_daily_challenge_progress WHERE utc_day = ? GROUP BY challenge_id ORDER BY challenge_id`).bind(utcDay).all(),
    db.prepare(`SELECT AVG(r.streak_length) AS average_streak, MAX(r.longest_streak) AS longest_streak
      FROM telegram_pet_daily_leaderboard_records r WHERE EXISTS
        (SELECT 1 FROM telegram_pet_daily_runs d WHERE d.telegram_id=r.telegram_id AND d.utc_day=?)`).bind(utcDay).first(),
  ]);
  const participation = positiveInteger(runs?.participation);
  const attempts = positiveInteger(boss?.attempts);
  return {
    utc_day: utcDay,
    daily_participation: participation,
    completion_rate: participation ? positiveInteger(runs?.completions) / participation : 0,
    average_depth: Number(runs?.average_depth || 0),
    failure_rooms: failures.results || [],
    boss_win_percentage: attempts ? (positiveInteger(boss?.wins) / attempts) * 100 : 0,
    challenge_completion_percentage: Object.values(PET_DAILY_CHALLENGES).map((challenge) => {
      const row = (challenges.results || []).find((entry) => entry.challenge_id === challenge.challenge_id);
      const denominator = Math.max(participation, positiveInteger(row?.participants));
      return { challenge_id: challenge.challenge_id, percentage: denominator ? (positiveInteger(row?.completions) / denominator) * 100 : 0 };
    }),
    average_streak: Number(streaks?.average_streak || 0),
    longest_streak: positiveInteger(streaks?.longest_streak),
  };
}

export const __dailyMoonRunTestHooks = Object.freeze({
  calculateStreaks,
  dailyModifierId,
  dailyRunId,
  recordChallengeEvidence,
  resolveAuthoritativeDailyRoomOutcome,
  validUtcDay,
});

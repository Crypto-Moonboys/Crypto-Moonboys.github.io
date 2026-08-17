import evolutions from './content/evolutions.json' with { type: 'json' };
import { evaluateMoonpetEvolutionRequirements } from './moonpet-identity.js';

// Product balancing assumptions: five post-egg evolution milestones and ten
// qualifying weeks. Named here so balancing never hides in route/UI code.
export const PET_SEASON_COMPLETION_CONFIG = Object.freeze({
  authority_version: 2,
  required_growth_marks: 60,
  required_weekly_crests: 10,
  season_days: 90,
  sanctuary_transition: 'season_settlement',
});

export const PET_GROWTH_MILESTONES = Object.freeze({
  incubation: Object.freeze({ type: 'incubation_care', evidence_prefix: 'incubation:' }),
  evolution: Object.freeze({ type: 'lifecycle_evolution', evidence_prefix: 'evolution:' }),
  care: Object.freeze({ type: 'care_milestone', evidence_prefix: 'care:' }),
  boss: Object.freeze({ type: 'boss_milestone', evidence_prefix: 'boss:' }),
  daily_run: Object.freeze({ type: 'daily_moon_run_milestone', evidence_prefix: 'daily-run:' }),
  guided: Object.freeze({ type: 'guided_progression_milestone', evidence_prefix: 'guided:' }),
});

export const PET_WEEKLY_CREST_OBJECTIVES = Object.freeze({
  weekly_boss: Object.freeze({ objective_id: 'weekly_boss', evidence_prefix: 'weekly-boss:' }),
  weekly_journey: Object.freeze({ objective_id: 'weekly_journey', evidence_prefix: 'weekly-journey:' }),
});

const FINAL_EVOLUTION = evolutions.reduce((latest, entry) => Number(entry.stage) > Number(latest.stage) ? entry : latest, evolutions[0]);
const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));

function safeAwardTimestamp(value, fallback = new Date()) {
  const parsed = value == null ? NaN : Date.parse(value);
  const fallbackTime = new Date(fallback).getTime();
  return new Date(Number.isFinite(parsed) ? parsed : (Number.isFinite(fallbackTime) ? fallbackTime : Date.now())).toISOString();
}

export function getPetSeasonWeek(season, now = new Date()) {
  const start = Date.parse(season?.start_at || season?.startAt || '');
  const current = new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(current) || current < start) return 1;
  return Math.min(13, Math.floor((current - start) / 604800000) + 1);
}

async function ownedPet(db, petId, seasonKey, telegramId = null) {
  const ownerClause = telegramId == null ? '' : ' AND s.telegram_id=?';
  const args = telegramId == null ? [petId, seasonKey] : [petId, seasonKey, String(telegramId)];
  return db.prepare(`SELECT s.pet_id, s.telegram_id, s.season_key, i.level, i.pet_xp
    FROM telegram_pet_season_slots s JOIN telegram_pet_instances i ON i.pet_id=s.pet_id
    WHERE s.pet_id=? AND s.season_key=?${ownerClause} LIMIT 1`).bind(...args).first();
}

export async function isPetLegendary(db, petId, seasonKey) {
  const pet = await ownedPet(db, petId, seasonKey);
  if (!pet) return false;
  const row = await db.prepare(`SELECT 1 AS qualified FROM telegram_pet_evolutions_by_pet
    WHERE pet_id=? AND telegram_id=? AND evolution_id=? AND stage=? LIMIT 1`)
    .bind(petId, pet.telegram_id, FINAL_EVOLUTION.evolution_id, FINAL_EVOLUTION.stage).first();
  return Boolean(row?.qualified);
}

export async function awardPetGrowthMark(db, award) {
  const registry = PET_GROWTH_MILESTONES[String(award?.milestone || '')];
  const petId = String(award?.pet_id || '');
  const seasonKey = String(award?.season_key || '');
  const evidenceKey = String(award?.evidence_key || '');
  const pet = registry && evidenceKey.startsWith(registry.evidence_prefix)
    ? await ownedPet(db, petId, seasonKey, award.telegram_id) : null;
  if (!pet) return { accepted: false, duplicate: false, reason: 'invalid_growth_mark_authority' };
  const markId = `growth:${petId}:${seasonKey}:${registry.type}:${evidenceKey}`;
  const earnedAt = safeAwardTimestamp(award.earned_at);
  const earnedDay = earnedAt.slice(0, 10);
  const result = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_growth_marks
    (mark_id, pet_id, telegram_id, season_key, milestone_type, evidence_key, earned_day, earned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`)
    .bind(markId, petId, pet.telegram_id, seasonKey, registry.type, evidenceKey, earnedDay, earnedAt).run();
  const response = { accepted: Number(result?.meta?.changes || 0) === 1, duplicate: Number(result?.meta?.changes || 0) === 0, mark_id: markId };
  await finalizePetSeasonCompletionIfEligible(db, petId, seasonKey, { telegram_id: pet.telegram_id, now: earnedAt });
  return response;
}

export async function awardPetWeeklyCrest(db, award) {
  const objective = PET_WEEKLY_CREST_OBJECTIVES[String(award?.objective || '')];
  const petId = String(award?.pet_id || '');
  const seasonKey = String(award?.season_key || '');
  const evidenceKey = String(award?.evidence_key || '');
  const week = integer(award?.season_week);
  const pet = objective && week >= 1 && week <= 13 && evidenceKey.startsWith(objective.evidence_prefix)
    ? await ownedPet(db, petId, seasonKey, award.telegram_id) : null;
  if (!pet) return { accepted: false, duplicate: false, reason: 'invalid_weekly_crest_authority' };
  const crestId = `crest:${petId}:${seasonKey}:${week}:${objective.objective_id}`;
  const earnedAt = safeAwardTimestamp(award.earned_at);
  const result = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_weekly_crests
    (crest_id, pet_id, telegram_id, season_key, season_week, qualification_week, objective_id, evidence_key, earned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`)
    .bind(crestId, petId, pet.telegram_id, seasonKey, week, week, objective.objective_id, evidenceKey, earnedAt).run();
  const response = { accepted: Number(result?.meta?.changes || 0) === 1, duplicate: Number(result?.meta?.changes || 0) === 0, crest_id: crestId };
  await finalizePetSeasonCompletionIfEligible(db, petId, seasonKey, { telegram_id: pet.telegram_id, now: earnedAt });
  return response;
}

export async function reconcileEvolutionGrowthMarks(db, petId, seasonKey) {
  const pet = await ownedPet(db, petId, seasonKey);
  if (!pet) return;
  const rows = await db.prepare(`SELECT evolution_id, stage, unlock_event_key, unlocked_at FROM telegram_pet_evolutions_by_pet
    WHERE pet_id=? AND telegram_id=? AND stage>0 ORDER BY stage`).bind(petId, pet.telegram_id).all();
  for (const row of rows.results || []) await awardPetGrowthMark(db, {
    pet_id: petId, telegram_id: pet.telegram_id, season_key: seasonKey, milestone: 'evolution',
    evidence_key: `evolution:${row.evolution_id}:${row.unlock_event_key}`, earned_at: row.unlocked_at,
  });
}

export async function buildPetLifecycleProgress(db, petId, seasonKey) {
  const pet = await ownedPet(db, petId, seasonKey);
  if (!pet) return null;
  const current = await db.prepare(`SELECT evolution_id, stage FROM telegram_pet_evolutions_by_pet
    WHERE pet_id=? AND telegram_id=? ORDER BY stage DESC LIMIT 1`).bind(petId, pet.telegram_id).first();
  const stage = integer(current?.stage);
  const next = evolutions.find((entry) => Number(entry.stage) === stage + 1) || null;
  const level = Math.max(1, integer(pet.level || integer(pet.pet_xp / 100) + 1));
  let bossProgress = [];
  let itemProgress = [];
  let relicProgress = { current: 0, required: integer(next?.requirements?.relics_owned), complete: !next?.requirements?.relics_owned };
  if (next) {
    bossProgress = await Promise.all(Object.entries(next.requirements.boss_victories || {}).map(async ([bossId, required]) => {
      const row = await db.prepare(`SELECT victories FROM telegram_pet_boss_victories WHERE telegram_id=? AND boss_id=?`).bind(pet.telegram_id, bossId).first();
      return { boss_id: bossId, current: integer(row?.victories), required: integer(required), complete: integer(row?.victories) >= integer(required) };
    }));
    itemProgress = await Promise.all(Object.entries(next.requirements.inventory || {}).flatMap(([assetType, assets]) => Object.entries(assets).map(async ([assetKey, required]) => {
      const row = assetType === 'material'
        ? await db.prepare(`SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=?`).bind(pet.telegram_id, assetKey).first()
        : await db.prepare(`SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type=? AND asset_key=?`).bind(pet.telegram_id, assetType, assetKey).first();
      return { asset_type: assetType, asset_key: assetKey, current: integer(row?.quantity), required: integer(required), complete: integer(row?.quantity) >= integer(required) };
    })));
    const relics = await db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_relics WHERE telegram_id=?`).bind(pet.telegram_id).first();
    relicProgress = { current: integer(relics?.count), required: integer(next.requirements.relics_owned), complete: integer(relics?.count) >= integer(next.requirements.relics_owned) };
  }
  const levelProgress = next ? { current: level, required: next.requirements.pet_level, complete: level >= next.requirements.pet_level } : null;
  const authority = next ? await evaluateMoonpetEvolutionRequirements(db, {
    telegram_id: pet.telegram_id,
    pet_id: petId,
    season_key: seasonKey,
    evolution_id: next.evolution_id,
  }) : { ready: false };
  const evolutionReady = Boolean(next && authority.pet_id === petId && authority.ready);
  return {
    current_stage: stage + 1, total_stages: evolutions.length,
    current_evolution: current?.evolution_id || evolutions[0].evolution_id,
    next_evolution: next ? { evolution_id: next.evolution_id, name: next.name } : null,
    requirements: next ? { pet_level: levelProgress, boss_victories: bossProgress, required_items: itemProgress, relics: relicProgress } : null,
    evolution_ready: evolutionReady,
    authority_reason: next ? authority.reason : null,
  };
}

export async function evaluatePetSeasonCompletion(db, petId, seasonKey, now = new Date(), options = {}) {
  const pet = await ownedPet(db, petId, seasonKey, options.telegram_id);
  if (!pet) return null;
  const seasonWeek = Math.min(13, Math.max(1, integer(options.season_week || 1)));
  const [legendary, growth, crests, currentCrest, existing, lifecycle] = await Promise.all([
    isPetLegendary(db, petId, seasonKey),
    db.prepare(`SELECT COUNT(DISTINCT earned_day) AS earned FROM telegram_pet_growth_marks WHERE pet_id=? AND telegram_id=? AND season_key=? AND earned_day IS NOT NULL`).bind(petId, pet.telegram_id, seasonKey).first(),
    db.prepare(`SELECT COUNT(*) AS evidence_rows, COUNT(DISTINCT qualification_week) AS earned FROM telegram_pet_weekly_crests WHERE pet_id=? AND telegram_id=? AND season_key=? AND qualification_week IS NOT NULL`).bind(petId, pet.telegram_id, seasonKey).first(),
    db.prepare(`SELECT 1 AS earned FROM telegram_pet_weekly_crests WHERE pet_id=? AND telegram_id=? AND season_key=? AND qualification_week=? LIMIT 1`).bind(petId, pet.telegram_id, seasonKey, seasonWeek).first(),
    db.prepare(`SELECT completed_at FROM telegram_pet_season_completions WHERE pet_id=? AND telegram_id=? AND season_key=?`).bind(petId, pet.telegram_id, seasonKey).first(),
    buildPetLifecycleProgress(db, petId, seasonKey),
  ]);
  const growthEarned = integer(growth?.earned);
  const crestEarned = integer(crests?.earned);
  const requirementsMet = legendary && growthEarned >= PET_SEASON_COMPLETION_CONFIG.required_growth_marks && crestEarned >= PET_SEASON_COMPLETION_CONFIG.required_weekly_crests;
  const completion = existing;
  return {
    pet_id: petId, lifecycle, legendary,
    state: completion ? 'season_complete' : legendary ? 'legendary' : 'not_legendary',
    growth_marks: { earned: growthEarned, required: PET_SEASON_COMPLETION_CONFIG.required_growth_marks },
    weekly_crests: { earned: crestEarned, required: PET_SEASON_COMPLETION_CONFIG.required_weekly_crests, weeks_completed: crestEarned, evidence_rows: integer(crests?.evidence_rows), current_season_week: seasonWeek, current_week_crest_earned: Boolean(currentCrest?.earned) },
    requirements_met: requirementsMet, season_complete: Boolean(completion), completed_at: completion?.completed_at || null,
    completion_season: completion ? seasonKey : null, sanctuary_eligible: Boolean(completion),
    sanctuary_transition: PET_SEASON_COMPLETION_CONFIG.sanctuary_transition,
  };
}

export async function finalizePetSeasonCompletionIfEligible(db, petId, seasonKey, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const state = await evaluatePetSeasonCompletion(db, petId, seasonKey, now, options);
  if (!state?.requirements_met && !state?.season_complete) return state;
  const pet = await ownedPet(db, petId, seasonKey, options.telegram_id);
  if (!pet) return null;
  if (!state.season_complete) await db.prepare(`INSERT OR IGNORE INTO telegram_pet_season_completions
    (pet_id, telegram_id, season_key, completed_at, legendary_evolution_id, growth_marks_earned, weekly_crests_earned, authority_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    petId, pet.telegram_id, seasonKey, now.toISOString(), FINAL_EVOLUTION.evolution_id,
    state.growth_marks.earned, state.weekly_crests.earned, PET_SEASON_COMPLETION_CONFIG.authority_version,
  ).run();
  // Season completion is now only the authority marker. Moving the pet into
  // Sanctuary is deliberately deferred until explicit season settlement so the
  // current-season slot remains stable and a completed active pet does not lose
  // its active pointer or collide with a same-season successor egg.
  return evaluatePetSeasonCompletion(db, petId, seasonKey, now, options);
}

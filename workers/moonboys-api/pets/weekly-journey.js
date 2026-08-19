import { awardPetWeeklyCrest, getPetSeasonWeek } from './season-completion.js';
import { getMoonpetSeasonInfo, getMoonpetSeasonKey } from './season-authority.js';

const MS_PER_DAY = 86400000;

// Weekly Journey is intentionally a 5/5 foundation authority for PR #1231.
// Until a future player-facing caller is added, these helpers are exposed only
// through test hooks so no live route can mint Weekly Journey Crests.
export const WEEKLY_JOURNEY_REQUIRED_OBJECTIVES = 5;

export const PET_WEEKLY_JOURNEY_OBJECTIVES = Object.freeze({
  weekly_care: Object.freeze({ objective_id: 'weekly_care', target: 5, progress_mode: 'add' }),
  weekly_training: Object.freeze({ objective_id: 'weekly_training', target: 3, progress_mode: 'add' }),
  weekly_run: Object.freeze({ objective_id: 'weekly_run', target: 3, progress_mode: 'add' }),
  weekly_boss_attempt: Object.freeze({ objective_id: 'weekly_boss_attempt', target: 1, progress_mode: 'max' }),
  weekly_check_in: Object.freeze({ objective_id: 'weekly_check_in', target: 2, progress_mode: 'add' }),
});

const WEEKLY_JOURNEY_OBJECTIVE_SOURCE_TYPES = Object.freeze({
  weekly_care: Object.freeze(new Set(['feed', 'play', 'clean', 'sleep'])),
  weekly_training: Object.freeze(new Set(['train'])),
  weekly_run: Object.freeze(new Set(['run', 'run_complete', 'run_extract', 'daily_run', 'daily_moon_run'])),
  weekly_boss_attempt: Object.freeze(new Set(['boss_fought', 'weekly_boss', 'weekly_boss_reward'])),
  weekly_check_in: Object.freeze(new Set(['check_in', 'daily_check_in', 'weekly_check_in'])),
});

export const WEEKLY_JOURNEY_TOTAL_OBJECTIVES = Object.freeze(Object.keys(PET_WEEKLY_JOURNEY_OBJECTIVES).length);

// Authority invariant: Weekly Crest difficulty is intentionally full completion.
// Any future objective count change must update this rule deliberately.
if (WEEKLY_JOURNEY_REQUIRED_OBJECTIVES !== WEEKLY_JOURNEY_TOTAL_OBJECTIVES) {
  throw new Error('weekly_journey_threshold_drift');
}

// Production exposure for this PR is deliberately narrow: this module supplies
// authority primitives only. Future live callers must provide a persisted source
// event, pet_id, season_key, and qualification_week before any Crest can settle.

const integer = (value, fallback = 0) => Math.max(0, Math.floor(Number(value ?? fallback) || 0));
const safeText = (value, max = 180) => String(value || '').trim().slice(0, max);

function safeJson(value) {
  try { return JSON.stringify(value ?? {}); }
  catch { return '{}'; }
}

function normalizeTimestamp(value, fallback = new Date()) {
  const parsed = value == null ? NaN : Date.parse(value);
  const fallbackTime = new Date(fallback).getTime();
  return new Date(Number.isFinite(parsed) ? parsed : (Number.isFinite(fallbackTime) ? fallbackTime : Date.now())).toISOString();
}

function validQualificationWeek(value) {
  const week = integer(value);
  return week >= 1 && week <= 13 ? week : 0;
}

function validUtcDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return false;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function dayBelongsToQualificationWeek(day, season, qualificationWeek) {
  const eventTime = Date.parse(`${day}T00:00:00.000Z`);
  const seasonStart = Date.parse(season?.start_at || '');
  const seasonEnd = Date.parse(season?.end_at || '');
  if (!Number.isFinite(eventTime) || !Number.isFinite(seasonStart) || !Number.isFinite(seasonEnd)) return false;
  if (eventTime < seasonStart || eventTime >= seasonEnd) return false;
  const weekStart = seasonStart + ((qualificationWeek - 1) * 7 * MS_PER_DAY);
  const weekEnd = qualificationWeek === 13 ? seasonEnd : Math.min(seasonEnd, weekStart + (7 * MS_PER_DAY));
  return eventTime >= weekStart && eventTime < weekEnd;
}

function sourceMatchesObjective(objectiveId, sourceEvent) {
  const allowed = WEEKLY_JOURNEY_OBJECTIVE_SOURCE_TYPES[String(objectiveId || '')];
  return Boolean(allowed?.has(String(sourceEvent?.event_type || '')));
}

async function ownedPet(db, petId, telegramId, seasonKey) {
  return db.prepare(`SELECT s.pet_id, s.telegram_id, s.season_key
    FROM telegram_pet_season_slots s JOIN telegram_pet_instances i ON i.pet_id=s.pet_id
    WHERE s.pet_id=? AND s.telegram_id=? AND s.season_key=? LIMIT 1`)
    .bind(petId, telegramId, seasonKey).first();
}

async function readSourceEvent(db, telegramId, eventKey) {
  return db.prepare(`SELECT pet_id, telegram_id, event_type, event_key, season_key, day_key, week_key, status, metadata, created_at
    FROM telegram_pet_events
    WHERE telegram_id=? AND event_key=? AND status='accepted' LIMIT 1`)
    .bind(telegramId, eventKey).first();
}

async function validateWeeklyEvidenceAuthority(db, request) {
  const telegramId = safeText(request.telegram_id);
  const petId = safeText(request.pet_id);
  const seasonKey = safeText(request.season_key, 80);
  const sourceEventKey = safeText(request.source_event_key || request.event_key);
  const qualificationWeek = validQualificationWeek(request.qualification_week);
  if (!telegramId || !petId || !seasonKey || !sourceEventKey || !qualificationWeek) {
    return { accepted: false, reason: 'invalid_weekly_journey_evidence' };
  }

  const sourceEvent = await readSourceEvent(db, telegramId, sourceEventKey).catch(() => null);
  if (!sourceEvent) return { accepted: false, reason: 'weekly_journey_source_event_missing' };
  if (String(sourceEvent.season_key || '') !== seasonKey) return { accepted: false, reason: 'weekly_journey_season_authority_mismatch' };
  const pet = await ownedPet(db, petId, telegramId, seasonKey).catch(() => null);
  if (!pet) return { accepted: false, reason: 'weekly_journey_pet_authority_mismatch' };
  if (String(sourceEvent.pet_id || '') !== petId) return { accepted: false, reason: 'weekly_journey_pet_authority_mismatch' };
  if (!sourceMatchesObjective(request.objective_id, sourceEvent)) {
    return { accepted: false, reason: 'weekly_journey_objective_source_mismatch' };
  }
  const day = String(sourceEvent.day_key || '');
  if (!validUtcDay(day)) return { accepted: false, reason: 'weekly_journey_invalid_source_window' };
  if (getMoonpetSeasonKey(`${day}T00:00:00.000Z`) !== seasonKey) return { accepted: false, reason: 'weekly_journey_season_authority_mismatch' };
  const season = getMoonpetSeasonInfo(`${day}T00:00:00.000Z`);
  if (getPetSeasonWeek(season, new Date(`${day}T00:00:00.000Z`)) !== qualificationWeek) {
    return { accepted: false, reason: 'weekly_journey_invalid_source_window' };
  }
  if (!dayBelongsToQualificationWeek(day, season, qualificationWeek)) {
    return { accepted: false, reason: 'weekly_journey_invalid_source_window' };
  }
  return { accepted: true, pet, source_event: sourceEvent, source_day: day, qualification_week: qualificationWeek };
}

async function insertWeeklyJourneyReceipt(db, receipt) {
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_weekly_journey_receipts
    (receipt_id, event_key, telegram_id, pet_id, season_key, qualification_week, completed_objectives, status, reason, crest_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(receipt.receipt_id, receipt.event_key, receipt.telegram_id, receipt.pet_id, receipt.season_key,
      receipt.qualification_week, receipt.completed_objectives, receipt.status, receipt.reason, receipt.crest_id || null).run();
}

async function readExistingWeeklyJourneyCrest(db, request) {
  return db.prepare(`SELECT crest_id, objective_id, evidence_key FROM telegram_pet_weekly_crests
    WHERE pet_id=? AND telegram_id=? AND season_key=? AND qualification_week=? LIMIT 1`)
    .bind(request.pet_id, request.telegram_id, request.season_key, request.qualification_week).first().catch(() => null);
}

export async function finalizeWeeklyJourneyCrest(db, request) {
  const telegramId = safeText(request.telegram_id);
  const petId = safeText(request.pet_id);
  const seasonKey = safeText(request.season_key, 80);
  const qualificationWeek = validQualificationWeek(request.qualification_week);
  if (!telegramId || !petId || !seasonKey || !qualificationWeek) {
    return { accepted: false, duplicate: false, reason: 'invalid_weekly_journey_authority' };
  }

  const rows = await db.prepare(`SELECT objective_id, SUM(progress_value) AS additive_progress, MAX(progress_value) AS max_progress
    FROM telegram_pet_weekly_journey_objectives
    WHERE telegram_id=? AND pet_id=? AND season_key=? AND qualification_week=? AND status='accepted'
    GROUP BY objective_id`)
    .bind(telegramId, petId, seasonKey, qualificationWeek).all().catch(() => ({ results: [] }));
  const completedObjectives = (rows.results || []).reduce((count, row) => {
    const objective = PET_WEEKLY_JOURNEY_OBJECTIVES[String(row.objective_id || '')];
    if (!objective) return count;
    const progress = objective.progress_mode === 'max'
      ? integer(row.max_progress, objective.target)
      : Math.min(objective.target, integer(row.additive_progress, objective.target));
    return progress >= objective.target ? count + 1 : count;
  }, 0);
  const eventKey = `weekly-journey:${petId}:${seasonKey}:${qualificationWeek}:weekly-crest`;
  if (completedObjectives < WEEKLY_JOURNEY_REQUIRED_OBJECTIVES) {
    return {
      accepted: false,
      duplicate: false,
      completed_objectives: completedObjectives,
      required_objectives: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
      total_objectives: WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
    };
  }

  const existingReceipt = await db.prepare(`SELECT status, crest_id FROM telegram_pet_weekly_journey_receipts
    WHERE event_key=? AND status='accepted' LIMIT 1`).bind(eventKey).first().catch(() => null);
  if (existingReceipt?.crest_id) {
    return {
      accepted: true,
      duplicate: true,
      recovered: false,
      reason: 'weekly_journey_qualified',
      completed_objectives: completedObjectives,
      required_objectives: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
      total_objectives: WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
      crest_id: existingReceipt.crest_id,
      event_key: eventKey,
    };
  }

  const evidenceKey = `weekly-journey:${seasonKey}:${qualificationWeek}:${WEEKLY_JOURNEY_REQUIRED_OBJECTIVES}-of-${WEEKLY_JOURNEY_TOTAL_OBJECTIVES}`;
  const existingCrest = await readExistingWeeklyJourneyCrest(db, {
    telegram_id: telegramId, pet_id: petId, season_key: seasonKey, qualification_week: qualificationWeek,
  });
  if (existingCrest?.objective_id === 'weekly_journey' && existingCrest.evidence_key === evidenceKey) {
    await insertWeeklyJourneyReceipt(db, {
      receipt_id: `${eventKey}:accepted`,
      event_key: eventKey,
      telegram_id: telegramId,
      pet_id: petId,
      season_key: seasonKey,
      qualification_week: qualificationWeek,
      completed_objectives: completedObjectives,
      status: 'accepted',
      reason: 'weekly_journey_qualified',
      crest_id: existingCrest.crest_id,
    });
    return {
      accepted: true,
      duplicate: false,
      recovered: true,
      reason: 'weekly_journey_qualified',
      completed_objectives: completedObjectives,
      required_objectives: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
      total_objectives: WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
      crest_id: existingCrest.crest_id,
      event_key: eventKey,
    };
  }
  if (existingCrest) {
    await insertWeeklyJourneyReceipt(db, {
      receipt_id: `${eventKey}:rejected`,
      event_key: eventKey,
      telegram_id: telegramId,
      pet_id: petId,
      season_key: seasonKey,
      qualification_week: qualificationWeek,
      completed_objectives: completedObjectives,
      status: 'rejected',
      reason: 'weekly_journey_crest_duplicate',
      crest_id: existingCrest.crest_id,
    });
    return {
      accepted: false,
      duplicate: true,
      recovered: false,
      reason: 'weekly_journey_crest_duplicate',
      completed_objectives: completedObjectives,
      required_objectives: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
      total_objectives: WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
      crest_id: existingCrest.crest_id,
      event_key: eventKey,
    };
  }

  const earnedAt = normalizeTimestamp(request.earned_at || request.now);
  const award = await awardPetWeeklyCrest(db, {
    pet_id: petId,
    telegram_id: telegramId,
    season_key: seasonKey,
    season_week: qualificationWeek,
    objective: 'weekly_journey',
    evidence_key: evidenceKey,
    earned_at: earnedAt,
  });
  const crest = await readExistingWeeklyJourneyCrest(db, {
    telegram_id: telegramId, pet_id: petId, season_key: seasonKey, qualification_week: qualificationWeek,
  });
  const recoveredMatchingCrest = Boolean(!award.accepted && award.duplicate
    && crest?.objective_id === 'weekly_journey' && crest.evidence_key === evidenceKey);
  const accepted = Boolean((award.accepted || recoveredMatchingCrest) && crest?.crest_id);
  const reason = accepted ? 'weekly_journey_qualified' : (award.duplicate ? 'weekly_journey_crest_duplicate' : (award.reason || 'weekly_journey_crest_rejected'));
  await insertWeeklyJourneyReceipt(db, {
    receipt_id: `${eventKey}:${accepted ? 'accepted' : 'rejected'}`,
    event_key: eventKey,
    telegram_id: telegramId,
    pet_id: petId,
    season_key: seasonKey,
    qualification_week: qualificationWeek,
    completed_objectives: completedObjectives,
    status: accepted ? 'accepted' : 'rejected',
    reason,
    crest_id: crest?.crest_id || null,
  });
  return {
    accepted,
    duplicate: recoveredMatchingCrest ? false : Boolean(award.duplicate),
    recovered: recoveredMatchingCrest,
    reason,
    completed_objectives: completedObjectives,
    required_objectives: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
    total_objectives: WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
    crest_id: crest?.crest_id || null,
    event_key: eventKey,
  };
}

export async function recordWeeklyJourneyObjectiveEvidence(db, request = {}) {
  const objective = PET_WEEKLY_JOURNEY_OBJECTIVES[String(request.objective_id || '')];
  if (!objective) throw new Error('invalid_weekly_journey_objective');
  const authority = await validateWeeklyEvidenceAuthority(db, request);
  if (!authority.accepted) return { accepted: false, duplicate: false, completed: false, reason: authority.reason };
  // Additive objectives count one authoritative persisted source event as one
  // unit. Future variable quantities must come from validated source metadata,
  // never caller-supplied request payloads.
  const progressValue = objective.progress_mode === 'add' ? 1 : Math.min(objective.target, integer(request.progress_value, objective.target));
  if (progressValue < 1) return { accepted: false, duplicate: false, completed: false, progress: 0 };
  const eventId = `weekly-journey:objective:${authority.pet.pet_id}:${authority.pet.season_key}:${authority.qualification_week}:${objective.objective_id}:${authority.source_event.event_key}`;
  const result = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_weekly_journey_objectives
    (event_id, telegram_id, pet_id, season_key, qualification_week, objective_id, source_event_key, source_event_type, progress_value, status, evidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)`)
    .bind(eventId, authority.pet.telegram_id, authority.pet.pet_id, authority.pet.season_key, authority.qualification_week,
      objective.objective_id, authority.source_event.event_key, authority.source_event.event_type, progressValue, safeJson(request.evidence)).run();
  const journey = await finalizeWeeklyJourneyCrest(db, {
    telegram_id: authority.pet.telegram_id,
    pet_id: authority.pet.pet_id,
    season_key: authority.pet.season_key,
    qualification_week: authority.qualification_week,
    earned_at: request.earned_at || request.now || `${authority.source_day}T00:00:00.000Z`,
  });
  return {
    accepted: Number(result?.meta?.changes || 0) === 1,
    duplicate: Number(result?.meta?.changes || 0) === 0,
    completed: Boolean(journey.accepted),
    progress: progressValue,
    target: objective.target,
    weekly_journey: journey,
  };
}

export const __weeklyJourneyTestHooks = Object.freeze({
  dayBelongsToQualificationWeek,
  finalizeWeeklyJourneyCrest,
  recordWeeklyJourneyObjectiveEvidence,
  validateWeeklyEvidenceAuthority,
});

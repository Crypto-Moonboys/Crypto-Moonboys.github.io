import { getPetOwnershipPeriod, getPetJourneyWeek, getPetJourneyWeekBounds } from './ownership-period.js';
import { getPetVisibleLevelSql } from './progression-phase-2.js';
import { requirePetFirstReadResult, requirePetMutationResult } from './read-result.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from './wallet-reconciliation.js';

const SOURCE_TYPES = "('weekly_boss','weekly_boss_reward','boss_fought')";

// The shared fight uses UTC weeks; each permanent pet's Journey uses its own
// retained ownership clock. A rematch is needed only when that pet lacks an
// accepted attempt in its current Journey week.
export async function readPetWeeklyBossParticipation(db, telegramId, pet, now = new Date()) {
  const slot = await db.prepare(`SELECT s.created_at,s.journey_clock FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id
      AND i.season_key=s.season_key AND i.slot_number=s.slot_number
    WHERE s.pet_id=? AND s.telegram_id=? AND s.season_key=? AND s.status='active' AND i.status='active'`)
    .bind(pet.pet_id, telegramId, pet.season_key).first().then(requirePetFirstReadResult);
  if (!slot) throw new Error('weekly_boss_pet_authority_missing');
  const period = getPetOwnershipPeriod(pet.season_key, slot.created_at, slot.journey_clock);
  const qualificationWeek = getPetJourneyWeek(period, now);
  const bounds = getPetJourneyWeekBounds(period, qualificationWeek);
  const startDay = bounds.start_at.slice(0, 10), endDay = bounds.end_at.slice(0, 10);
  let attempt = await db.prepare(`SELECT event_key,day_key,reason FROM telegram_pet_events
    WHERE telegram_id=? AND pet_id=? AND season_key=? AND status='accepted'
      AND event_type IN ${SOURCE_TYPES} AND day_key>=? AND day_key<?
      AND length(day_key)=10 AND date(day_key,'+0 days')=day_key
    ORDER BY day_key,event_key LIMIT 1`)
    .bind(telegramId, pet.pet_id, pet.season_key, startDay, endDay).first().then(requirePetFirstReadResult);
  // Older interrupted source-event backfills can still have a saved defeating
  // account attack and an exact pet-attributed victory. Recover that attempt;
  // do not charge its owner for an unnecessary participation challenge.
  if (!attempt) attempt = await db.prepare(`SELECT a.event_key,a.day_key,'weekly_boss_attempt' AS reason
    FROM telegram_pet_weekly_boss_victories_by_pet v JOIN telegram_pet_weekly_boss_events a
      ON a.telegram_id=v.telegram_id AND a.week_key=v.week_key AND a.boss_id=v.boss_id AND a.event_key=v.victory_event_key
    WHERE v.telegram_id=? AND v.pet_id=? AND v.season_key=? AND a.day_key>=? AND a.day_key<?
      AND length(a.day_key)=10 AND date(a.day_key,'+0 days')=a.day_key
    ORDER BY a.day_key,a.event_key LIMIT 1`)
    .bind(telegramId, pet.pet_id, pet.season_key, startDay, endDay).first().then(requirePetFirstReadResult);
  return { qualification_week: qualificationWeek, start_day: startDay, end_day: endDay, attempt };
}

export async function commitPetWeeklyBossParticipation(db, request) {
  const { telegram_id: owner, pet, participation, boss, week_key: week, day_key: day, now, action, damage, event_key: eventKey } = request;
  const eventId = crypto.randomUUID();
  const metadata = JSON.stringify({ source: 'pet_weekly_boss', boss_id: boss.boss_id, action, damage,
    participation_only: true, qualification_week: participation.qualification_week });
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,xp_awarded,pet_xp_awarded,season_key,day_key,week_key,status,reason,metadata,created_at)
      SELECT ?,?,?,'weekly_boss',?,0,0,?,?,?,'accepted','weekly_boss_participation',?,?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_instances i
        JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
          AND s.season_key=i.season_key AND s.slot_number=i.slot_number
        JOIN telegram_pet_active_slots a ON a.pet_id=i.pet_id AND a.telegram_id=i.telegram_id AND a.season_key=i.season_key
        JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=i.pet_id AND l.telegram_id=i.telegram_id
        WHERE i.pet_id=? AND i.telegram_id=? AND i.season_key=? AND i.status='active' AND s.status='active'
          AND l.phase<>'egg' AND i.energy>=12 AND ${getPetVisibleLevelSql('i.pet_xp')}>=5
          AND i.pet_xp=? AND i.energy=? AND i.health=?)
      AND EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_progress
        WHERE telegram_id=? AND week_key=? AND boss_id=? AND defeated_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_events
        WHERE telegram_id=? AND pet_id=? AND season_key=? AND status='accepted'
          AND event_type IN ${SOURCE_TYPES} AND day_key>=? AND day_key<?
          AND length(day_key)=10 AND date(day_key,'+0 days')=day_key)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_victories_by_pet v JOIN telegram_pet_weekly_boss_events a
        ON a.telegram_id=v.telegram_id AND a.week_key=v.week_key AND a.boss_id=v.boss_id AND a.event_key=v.victory_event_key
        WHERE v.telegram_id=? AND v.pet_id=? AND v.season_key=? AND a.day_key>=? AND a.day_key<?
          AND length(a.day_key)=10 AND date(a.day_key,'+0 days')=a.day_key)`)
      .bind(eventId, pet.pet_id, owner, eventKey, pet.season_key, day, week, metadata, now.toISOString(),
        pet.pet_id, owner, pet.season_key, pet.pet_xp, pet.energy, pet.health, owner, week, boss.boss_id,
        owner, pet.pet_id, pet.season_key, participation.start_day, participation.end_day,
        owner, pet.pet_id, pet.season_key, participation.start_day, participation.end_day),
    db.prepare(`UPDATE telegram_pet_instances SET energy=energy-12,source_profile_updated_at=?,updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND telegram_id=? AND season_key=?
        AND EXISTS (SELECT 1 FROM telegram_pet_events WHERE id=? AND reason='weekly_boss_participation')`)
      .bind(PET_INSTANCE_AUTHORITY_VERSION, pet.pet_id, owner, pet.season_key, eventId),
  ]);
  if (!Array.isArray(results) || results.length !== 2) throw new Error('weekly_boss_participation_pending');
  for (const result of results) {
    requirePetMutationResult(result);
    if (!Number.isInteger(result?.meta?.changes) || result.meta.changes < 0) throw new Error('weekly_boss_participation_pending');
  }
  if (Number(results[0].meta.changes) === 1 && Number(results[1].meta.changes) === 1) {
    return { accepted: true, duplicate: false, event_key: eventKey };
  }
  if (results.some(result => result.meta.changes !== 0)) throw new Error('weekly_boss_participation_pending');
  const saved = await readPetWeeklyBossParticipation(db, owner, pet, now);
  return saved.attempt
    ? { accepted: true, duplicate: true, event_key: saved.attempt.event_key }
    : { accepted: false, reason: 'weekly_boss_state_changed' };
}

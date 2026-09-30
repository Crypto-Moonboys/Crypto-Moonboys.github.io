import { boundedRecoveryLimit } from './recovery-limits.js';
import { PET_DAILY_CHALLENGES, DAILY_JOURNEY_REQUIRED_OBJECTIVES, finalizeDailyJourneyGrowthMark, recordDailyCareChallenge } from './daily-moon-run.js';
import { PET_WEEKLY_JOURNEY_OBJECTIVES, WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, WEEKLY_JOURNEY_SOURCE_OBJECTIVES, finalizeWeeklyJourneyCrest, recordWeeklyJourneyObjectiveEvidence } from './weekly-journey.js';
import { finalizePetSeasonCompletionIfEligible, getPetSeasonWeek } from './season-completion.js';
import { getMoonpetSeasonInfo } from './season-authority.js';

const types = Object.keys(WEEKLY_JOURNEY_SOURCE_OBJECTIVES).map((type) => `'${type}'`).join(',');
const objectives = Object.entries(WEEKLY_JOURNEY_SOURCE_OBJECTIVES).map(([type, objective]) => `WHEN '${type}' THEN '${objective}'`).join(' ');
const sourceWeek = `MIN(13,1+CAST((julianday(e.day_key)-julianday(date(e.day_key,'start of month',
  printf('-%d months',(CAST(strftime('%m',e.day_key) AS INTEGER)-1)%3))))/7 AS INTEGER))`;
const missingWeekly = `NOT EXISTS (SELECT 1 FROM telegram_pet_weekly_journey_objectives o
    WHERE o.telegram_id=e.telegram_id AND o.pet_id=e.pet_id AND o.season_key=e.season_key
      AND o.qualification_week=${sourceWeek}
      AND o.source_event_key=e.event_key AND o.objective_id=CASE e.event_type ${objectives} END AND o.status='accepted')`;
const missingDaily = `e.event_type IN ('feed','play','clean','sleep') AND NOT EXISTS (
    SELECT 1 FROM telegram_pet_daily_journey_objectives o
    WHERE o.telegram_id=e.telegram_id AND o.pet_id=e.pet_id AND o.season_key=e.season_key AND o.utc_day=e.day_key
      AND o.challenge_id='daily_care' AND o.event_key=substr('care:'||e.event_key,1,180) AND o.status='accepted')`;
const sourceJoins = `JOIN telegram_pet_instances i ON i.pet_id=e.pet_id AND i.telegram_id=e.telegram_id AND i.season_key=e.season_key
  JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number`;
const validSource = `e.status='accepted' AND e.event_key<>'' AND e.event_key=trim(e.event_key) AND length(e.event_key)<=180
  AND e.event_type IN (${types}) AND length(e.day_key)=10 AND date(e.day_key,'+0 days')=e.day_key
  AND e.season_key=printf('pet-s%s-%03d',strftime('%Y',e.day_key),1+(CAST(strftime('%m',e.day_key) AS INTEGER)-1)/3)`;

async function claimJourneyRecoveryBatch(db, owner, queue, candidates) {
  if (!candidates.length) return false;
  // Advance before attempting the bounded batch, so failed/rejected work also
  // yields its turn. This cursor schedules retries; it never proves an award.
  // A stale overlapping refresh cannot move the cursor back to its snapshot.
  const result = await db.prepare(`INSERT INTO telegram_settings (telegram_id,setting_key,setting_value)
    VALUES (?,?,?) ON CONFLICT(telegram_id,setting_key) DO UPDATE SET
      setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP
    WHERE telegram_settings.setting_value IS ?`)
    .bind(owner, `moonpet:journey-recovery:${queue}`, candidates.at(-1).recovery_key, candidates[0].recovery_cursor ?? null).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function recoverJourneySourceEvidence(db, owner, limit) {
  // Validate source ownership and its canonical UTC season before the limit.
  // Older malformed/unowned events must not repeatedly consume the budget.
  const recoveryKey = "e.day_key||':'||e.id";
  const rows = await db.prepare(`SELECT e.event_key,e.event_type,e.pet_id,e.season_key,e.day_key,
      ${recoveryKey} AS recovery_key,recovery_state.setting_value AS recovery_cursor,
      (${missingWeekly}) AS missing_weekly, (${missingDaily}) AS missing_daily
    FROM telegram_pet_events e ${sourceJoins}
    LEFT JOIN telegram_settings recovery_state ON recovery_state.telegram_id=e.telegram_id AND recovery_state.setting_key='moonpet:journey-recovery:sources'
    WHERE e.telegram_id=? AND ${validSource}
      AND ((${missingWeekly}) OR (${missingDaily}))
    ORDER BY CASE WHEN ${recoveryKey}>COALESCE(recovery_state.setting_value,'') THEN 0 ELSE 1 END,
      ${recoveryKey} LIMIT ?`).bind(owner, boundedRecoveryLimit(limit, 50)).all();
  if (!await claimJourneyRecoveryBatch(db, owner, 'sources', rows.results || [])) return;
  for (const event of rows.results || []) {
    if (event.missing_weekly) {
      try {
        const at = new Date(`${event.day_key}T00:00:00.000Z`);
        await recordWeeklyJourneyObjectiveEvidence(db, {
          telegram_id: owner, pet_id: event.pet_id, season_key: event.season_key,
          qualification_week: getPetSeasonWeek(getMoonpetSeasonInfo(at), at),
          objective_id: WEEKLY_JOURNEY_SOURCE_OBJECTIVES[event.event_type], source_event_key: event.event_key,
          evidence: { authority: 'live_weekly_journey_source_event', source_event_type: event.event_type, source_event_key: event.event_key },
        }, { defer_award: true });
      } catch (error) { console.error('moonpet_journey_evidence_pending', 'weekly', error?.message || String(error)); }
    }
    if (event.missing_daily) {
      try { await recordDailyCareChallenge(db, { telegram_id: owner, event_key: event.event_key }, { defer_award: true }); }
      catch (error) { console.error('moonpet_journey_evidence_pending', 'daily', error?.message || String(error)); }
    }
  }
}

// Only persisted, accepted objective evidence can enter this queue. A refresh
// supplies the authenticated owner, never a pet, date, score or completion flag.
// Bound writes per refresh; older pets/periods retain their original authority.
const JOURNEYS = [
  { kind: 'daily', period: 'utc_day', objective: 'challenge_id', reward: 'growth_mark_id',
    required: DAILY_JOURNEY_REQUIRED_OBJECTIVES, definitions: PET_DAILY_CHALLENGES, finalize: finalizeDailyJourneyGrowthMark },
  { kind: 'weekly', period: 'qualification_week', objective: 'objective_id', reward: 'crest_id',
    required: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, definitions: PET_WEEKLY_JOURNEY_OBJECTIVES, finalize: finalizeWeeklyJourneyCrest },
];

export async function recoverPetJourneyAwards(db, telegramId, options = {}) {
  const owner = String(telegramId || '').trim();
  if (!owner) return;
  await recoverJourneySourceEvidence(db, owner, options.source_limit);
  for (const journey of JOURNEYS) {
    const { kind, period, objective, reward } = journey;
    const definitions = Object.entries(journey.definitions);
    const targetSql = definitions.map(([id, definition]) => `WHEN '${id}' THEN ${Number(definition.target)}`).join(' ');
    const maxIds = definitions.filter(([, definition]) => (definition.progress_mode || definition.validation_rules?.progress_mode) === 'max').map(([id]) => `'${id}'`);
    const checkInProgress = kind === 'weekly' ? "WHEN o.objective_id='weekly_check_in' THEN COUNT(DISTINCT e.day_key) " : '';
    const progressSql = maxIds.length ? `CASE ${checkInProgress}WHEN o.${objective} IN (${maxIds.join(',')}) THEN MAX(o.progress_value) ELSE SUM(o.progress_value) END` : 'SUM(o.progress_value)';
    // Apply the same source authority before LIMIT and when deriving the date.
    // Missing sources must not consume every slot in the recovery budget.
    const sourceJoin = kind === 'weekly' ? `JOIN telegram_pet_events e ON e.event_key=o.source_event_key AND e.telegram_id=o.telegram_id
      AND e.pet_id=o.pet_id AND e.season_key=o.season_key AND e.status='accepted' AND e.day_key<>''` : '';
    // A partial evidence batch must not freeze a later earning date while an
    // earlier action for this same week is still waiting. Other scopes proceed.
    const evidenceReady = kind === 'weekly' ? `AND NOT EXISTS (
      SELECT 1 FROM telegram_pet_events e ${sourceJoins}
      WHERE e.telegram_id=o.telegram_id AND e.pet_id=o.pet_id AND e.season_key=o.season_key
        AND ${validSource} AND ${sourceWeek}=o.qualification_week AND ${missingWeekly})` : '';
    const recoveryKey = `eligible.season_key||':'||${kind === 'weekly' ? "printf('%02d',eligible.qualification_week)" : 'eligible.utc_day'}||':'||eligible.pet_id`;
    const pending = await db.prepare(`SELECT eligible.*,${recoveryKey} AS recovery_key,recovery_state.setting_value AS recovery_cursor FROM (
      SELECT pet_id, season_key, ${period} FROM (
      SELECT o.pet_id, o.season_key, o.${period}, o.${objective}
      FROM telegram_pet_season_slots s
      JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key AND i.slot_number=s.slot_number
      JOIN telegram_pet_${kind}_journey_objectives o ON o.pet_id=s.pet_id AND o.telegram_id=s.telegram_id AND o.season_key=s.season_key
      ${sourceJoin}
      WHERE s.telegram_id=? AND o.status='accepted' ${evidenceReady} AND NOT EXISTS (
        SELECT 1 FROM telegram_pet_${kind}_journey_receipts r
        WHERE r.telegram_id=o.telegram_id AND r.pet_id=o.pet_id AND r.season_key=o.season_key AND r.${period}=o.${period}
          AND r.${reward} IS NOT NULL AND (r.status='accepted' OR r.reason='${kind}_journey_${kind === 'daily' ? 'growth_mark' : 'crest'}_duplicate'))
      GROUP BY o.pet_id, o.season_key, o.${period}, o.${objective}
      HAVING ${progressSql} >= CASE o.${objective} ${targetSql} END
      ) GROUP BY pet_id, season_key, ${period} HAVING COUNT(*)>=?
    ) eligible LEFT JOIN telegram_settings recovery_state ON recovery_state.telegram_id=? AND recovery_state.setting_key=?
    ORDER BY CASE WHEN ${recoveryKey}>COALESCE(recovery_state.setting_value,'') THEN 0 ELSE 1 END,
      ${recoveryKey} LIMIT ?`).bind(owner, journey.required, owner, `moonpet:journey-recovery:${kind}`, boundedRecoveryLimit(options.award_limit, 5)).all();
    if (!await claimJourneyRecoveryBatch(db, owner, kind, pending.results || [])) continue;
    for (const scope of pending.results || []) {
      try {
        let earnedAt;
        if (kind === 'weekly') {
          // Extra actions after qualification cannot move the earning day.
          // Count each objective in source-day order, take its first threshold
          // crossing, then the latest of those crossings for the full Journey.
          const source = await db.prepare(`SELECT MAX(day) AS day FROM (
            SELECT objective_id, MIN(day) AS day FROM (
              SELECT objective_id, day,
                CASE WHEN objective_id IN (${maxIds.join(',')})
                  THEN MAX(day_progress) OVER objective_progress
                  ELSE SUM(day_progress) OVER objective_progress END AS progress
              FROM (
                SELECT o.objective_id,e.day_key AS day,
                  CASE WHEN o.objective_id='weekly_check_in' THEN 1
                    WHEN o.objective_id IN (${maxIds.join(',')}) THEN MAX(o.progress_value)
                    ELSE SUM(o.progress_value) END AS day_progress
                FROM telegram_pet_weekly_journey_objectives o
                ${sourceJoin}
                WHERE o.telegram_id=? AND o.pet_id=? AND o.season_key=? AND o.qualification_week=? AND o.status='accepted'
                GROUP BY o.objective_id,e.day_key
              )
              WINDOW objective_progress AS (PARTITION BY objective_id ORDER BY day
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            ) WHERE progress >= CASE objective_id ${targetSql} END
            GROUP BY objective_id
          ) HAVING COUNT(*)=?`)
            .bind(owner, scope.pet_id, scope.season_key, scope.qualification_week, journey.required).first();
          if (!source?.day) continue;
          earnedAt = `${source.day}T00:00:00.000Z`;
        }
        // An award insert may have succeeded before its season-completion
        // marker failed. Repair that marker before a receipt closes the queue.
        // Completion is recorded now; the mark/crest keeps its earned period.
        await finalizePetSeasonCompletionIfEligible(db, scope.pet_id, scope.season_key, { telegram_id: owner });
        await journey.finalize(db, { ...scope, telegram_id: owner, earned_at: earnedAt });
      } catch (error) {
        // Leave evidence pending for the next refresh; one failed settlement
        // must not hide the game or prevent another pet's recovery.
        console.error('moonpet_journey_recovery_pending', kind, error?.message || String(error));
      }
    }
  }
}

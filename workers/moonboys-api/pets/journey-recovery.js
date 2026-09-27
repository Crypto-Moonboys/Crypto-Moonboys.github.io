import { PET_DAILY_CHALLENGES, DAILY_JOURNEY_REQUIRED_OBJECTIVES, finalizeDailyJourneyGrowthMark } from './daily-moon-run.js';
import { PET_WEEKLY_JOURNEY_OBJECTIVES, WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, finalizeWeeklyJourneyCrest } from './weekly-journey.js';
import { finalizePetSeasonCompletionIfEligible } from './season-completion.js';

// Only persisted, accepted objective evidence can enter this queue. A refresh
// supplies the authenticated owner, never a pet, date, score or completion flag.
// Bound writes per refresh; older pets/periods retain their original authority.
const JOURNEYS = [
  { kind: 'daily', period: 'utc_day', objective: 'challenge_id', reward: 'growth_mark_id',
    required: DAILY_JOURNEY_REQUIRED_OBJECTIVES, definitions: PET_DAILY_CHALLENGES, finalize: finalizeDailyJourneyGrowthMark },
  { kind: 'weekly', period: 'qualification_week', objective: 'objective_id', reward: 'crest_id',
    required: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, definitions: PET_WEEKLY_JOURNEY_OBJECTIVES, finalize: finalizeWeeklyJourneyCrest },
];

export async function recoverPetJourneyAwards(db, telegramId) {
  const owner = String(telegramId || '').trim();
  if (!owner) return;
  for (const journey of JOURNEYS) {
    const { kind, period, objective, reward } = journey;
    const definitions = Object.entries(journey.definitions);
    const targetSql = definitions.map(([id, definition]) => `WHEN '${id}' THEN ${Number(definition.target)}`).join(' ');
    const maxIds = definitions.filter(([, definition]) => (definition.progress_mode || definition.validation_rules?.progress_mode) === 'max').map(([id]) => `'${id}'`);
    const progressSql = maxIds.length ? `CASE WHEN o.${objective} IN (${maxIds.join(',')}) THEN MAX(o.progress_value) ELSE SUM(o.progress_value) END` : 'SUM(o.progress_value)';
    // Apply the same source authority before LIMIT and when deriving the date.
    // Missing sources must not consume every slot in the recovery budget.
    const sourceJoin = kind === 'weekly' ? `JOIN telegram_pet_events e ON e.event_key=o.source_event_key AND e.telegram_id=o.telegram_id
      AND e.pet_id=o.pet_id AND e.season_key=o.season_key AND e.status='accepted' AND e.day_key<>''` : '';
    const pending = await db.prepare(`SELECT pet_id, season_key, ${period} FROM (
      SELECT o.pet_id, o.season_key, o.${period}, o.${objective}
      FROM telegram_pet_season_slots s
      JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key AND i.slot_number=s.slot_number
      JOIN telegram_pet_${kind}_journey_objectives o ON o.pet_id=s.pet_id AND o.telegram_id=s.telegram_id AND o.season_key=s.season_key
      ${sourceJoin}
      WHERE s.telegram_id=? AND o.status='accepted' AND NOT EXISTS (
        SELECT 1 FROM telegram_pet_${kind}_journey_receipts r
        WHERE r.telegram_id=o.telegram_id AND r.pet_id=o.pet_id AND r.season_key=o.season_key AND r.${period}=o.${period}
          AND r.${reward} IS NOT NULL AND (r.status='accepted' OR r.reason='${kind}_journey_${kind === 'daily' ? 'growth_mark' : 'crest'}_duplicate'))
      GROUP BY o.pet_id, o.season_key, o.${period}, o.${objective}
      HAVING ${progressSql} >= CASE o.${objective} ${targetSql} END
    ) GROUP BY pet_id, season_key, ${period} HAVING COUNT(*)>=?
    ORDER BY season_key, ${period}, pet_id LIMIT 5`).bind(owner, journey.required).all();
    for (const scope of pending.results || []) {
      try {
        let earnedAt;
        if (kind === 'weekly') {
          // Extra actions after qualification cannot move the earning day.
          // Count each objective in source-day order, take its first threshold
          // crossing, then the latest of those crossings for the full Journey.
          const source = await db.prepare(`SELECT MAX(day) AS day FROM (
            SELECT objective_id, MIN(day) AS day FROM (
              SELECT o.objective_id, e.day_key AS day,
                CASE WHEN o.objective_id IN (${maxIds.join(',')})
                  THEN MAX(o.progress_value) OVER objective_progress
                  ELSE SUM(o.progress_value) OVER objective_progress END AS progress
              FROM telegram_pet_weekly_journey_objectives o
              ${sourceJoin}
              WHERE o.telegram_id=? AND o.pet_id=? AND o.season_key=? AND o.qualification_week=? AND o.status='accepted'
              WINDOW objective_progress AS (PARTITION BY o.objective_id ORDER BY e.day_key, o.event_id
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

import { boundedRecoveryLimit, claimPetRecoveryBatch } from './recovery-limits.js';
import { PET_WEEKLY_BOSSES } from './player-expansion.js';
import { weeklyBossLegacySourceProofSql } from './weekly-boss-evidence.js';
import { requirePetReadResult } from './read-result.js';

// Currency settlement is separate from victory progression. Its paid marker
// cannot prove that the memory, specialist award, Crest and completion finished.
// The joined saved tuple authorizes lifetime periods and retained older pets;
// ownership keys do not have to equal the quarter when the victory was earned.
// Legacy victory timestamps can cross midnight after their accepted attack's
// saved day. The exact source tuple/key proves the earning day; clock equality
// is not required and retained historical rows are never rewritten.
export async function recoverPetWeeklyBossVictories(db, owner, finish, limit) {
  const recoveryKey = "v.defeated_at||':'||v.week_key||':'||v.pet_id";
  const rows = await db.prepare(`SELECT v.*,${recoveryKey} AS recovery_key,recovery_state.setting_value AS recovery_cursor FROM telegram_pet_weekly_boss_victories_by_pet v
    JOIN telegram_pet_weekly_boss_progress p ON p.telegram_id=v.telegram_id AND p.week_key=v.week_key AND p.boss_id=v.boss_id
    LEFT JOIN telegram_pet_events e ON e.telegram_id=v.telegram_id AND e.pet_id=v.pet_id AND e.season_key=v.season_key
      AND e.event_key=v.victory_event_key AND e.event_type='weekly_boss' AND e.status='accepted'
      AND e.reason='weekly_boss_attempt' AND e.week_key=v.week_key
      AND length(e.day_key)=10 AND date(e.day_key,'+0 days')=e.day_key
    JOIN telegram_pet_instances i ON i.pet_id=v.pet_id AND i.telegram_id=v.telegram_id AND i.season_key=v.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    LEFT JOIN telegram_pet_recovery_cursors recovery_state ON recovery_state.telegram_id=v.telegram_id AND recovery_state.setting_key='moonpet:recovery:weekly-boss'
    WHERE v.telegram_id=? AND p.defeated_at IS NOT NULL
      AND i.status IN ('active','archived') AND s.status IN ('active','archived')
      AND v.boss_id IN (${PET_WEEKLY_BOSSES.map(() => '?').join(',')})
      AND ((e.id IS NOT NULL AND e.event_key<>'' AND e.event_key=trim(e.event_key) AND length(e.event_key)<=180
        AND json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.source') IN ('pet_weekly_boss','pet_weekly_boss_backfill')
        AND json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.boss_id')=v.boss_id
        AND ${weeklyBossLegacySourceProofSql()})
        OR (e.id IS NULL AND EXISTS (SELECT 1 FROM telegram_pet_weekly_boss_events b
          WHERE b.telegram_id=v.telegram_id AND b.week_key=v.week_key AND b.boss_id=v.boss_id
            AND b.event_key=v.victory_event_key AND b.event_key<>'' AND b.event_key=trim(b.event_key) AND length(b.event_key)<=180
            AND length(b.day_key)=10 AND date(b.day_key,'+0 days')=b.day_key)))
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_system_events done WHERE done.telegram_id=v.telegram_id
        AND done.pet_id=v.pet_id AND done.season_key=v.season_key AND done.system_key='weekly_boss_finish'
        AND done.action_key=v.victory_event_key AND done.period_key=v.week_key AND done.status='completed')
    ORDER BY CASE WHEN ${recoveryKey}>COALESCE(recovery_state.setting_value,'') THEN 0 ELSE 1 END,
      ${recoveryKey} LIMIT ?`)
    .bind(owner, ...PET_WEEKLY_BOSSES.map(boss => boss.boss_id), boundedRecoveryLimit(limit, 20)).all().then(requirePetReadResult);
  if (!await claimPetRecoveryBatch(db, owner, 'weekly-boss', rows.results || [])) return;
  for (const victory of rows.results || []) {
    try {
      await finish(db, owner, victory.week_key, PET_WEEKLY_BOSSES.find(boss => boss.boss_id === victory.boss_id), victory);
    } catch (error) {
      console.error('moonpet_weekly_boss_recovery_pending', error?.message || String(error));
    }
  }
}

import { PET_WEEKLY_BOSSES } from './player-expansion.js';

// Currency settlement is separate from victory progression. Its paid marker
// cannot prove that the memory, specialist award, Crest and completion finished.
export async function recoverPetWeeklyBossVictories(db, owner, finish) {
  const rows = await db.prepare(`SELECT v.* FROM telegram_pet_weekly_boss_victories_by_pet v
    JOIN telegram_pet_weekly_boss_progress p ON p.telegram_id=v.telegram_id AND p.week_key=v.week_key AND p.boss_id=v.boss_id
    JOIN telegram_pet_events e ON e.telegram_id=v.telegram_id AND e.pet_id=v.pet_id AND e.season_key=v.season_key
      AND e.event_key=v.victory_event_key AND e.event_type='weekly_boss' AND e.status='accepted'
      AND e.reason='weekly_boss_attempt' AND e.week_key=v.week_key AND e.day_key=date(v.defeated_at)
    JOIN telegram_pet_instances i ON i.pet_id=v.pet_id AND i.telegram_id=v.telegram_id AND i.season_key=v.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    WHERE v.telegram_id=? AND p.defeated_at IS NOT NULL
      AND i.status IN ('active','archived') AND s.status IN ('active','archived')
      AND v.boss_id IN (${PET_WEEKLY_BOSSES.map(() => '?').join(',')})
      AND e.event_key<>'' AND e.event_key=trim(e.event_key) AND length(e.event_key)<=180
      AND json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.source')='pet_weekly_boss'
      AND json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.boss_id')=v.boss_id
      AND v.season_key=printf('pet-s%s-%03d',strftime('%Y',v.defeated_at),1+(CAST(strftime('%m',v.defeated_at) AS INTEGER)-1)/3)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_system_events done WHERE done.telegram_id=v.telegram_id
        AND done.pet_id=v.pet_id AND done.season_key=v.season_key AND done.system_key='weekly_boss_finish'
        AND done.action_key=v.victory_event_key AND done.period_key=v.week_key AND done.status='completed')
    ORDER BY v.defeated_at,v.week_key,v.pet_id LIMIT 20`)
    .bind(owner, ...PET_WEEKLY_BOSSES.map(boss => boss.boss_id)).all();
  for (const victory of rows.results || []) {
    try {
      await finish(db, owner, victory.week_key, PET_WEEKLY_BOSSES.find(boss => boss.boss_id === victory.boss_id), victory);
    } catch (error) {
      console.error('moonpet_weekly_boss_recovery_pending', error?.message || String(error));
    }
  }
}

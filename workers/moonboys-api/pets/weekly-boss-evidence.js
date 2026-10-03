import { requirePetFirstReadResult, requirePetMutationResult } from './read-result.js';

const metadata = alias => `CASE WHEN json_valid(${alias}.metadata) THEN ${alias}.metadata ELSE '{}' END`;

// A legacy account attack has no pet attribution. Only the exact saved victory
// can prove it. Earlier attempts remain unassigned, including old bad backfills;
// retain those rows but do not consume them as new pet-specific evidence.
export function weeklyBossLegacySourceProofSql(alias = 'e') {
  const json = metadata(alias);
  return `(COALESCE(json_extract(${json},'$.source'),'') <> 'pet_weekly_boss_backfill' OR EXISTS (
    SELECT 1 FROM telegram_pet_weekly_boss_victories_by_pet legacy_v
    JOIN telegram_pet_weekly_boss_events legacy_b ON legacy_b.telegram_id=legacy_v.telegram_id
      AND legacy_b.week_key=legacy_v.week_key AND legacy_b.boss_id=legacy_v.boss_id
      AND legacy_b.event_key=legacy_v.victory_event_key
    WHERE legacy_v.telegram_id=${alias}.telegram_id AND legacy_v.pet_id=${alias}.pet_id
      AND legacy_v.season_key=${alias}.season_key AND legacy_v.week_key=${alias}.week_key
      AND legacy_v.victory_event_key=${alias}.event_key AND ${alias}.event_type='weekly_boss'
      AND ${alias}.reason='weekly_boss_attempt' AND legacy_b.day_key=${alias}.day_key
      AND legacy_v.boss_id=json_extract(${json},'$.boss_id')
      AND legacy_b.action=json_extract(${json},'$.action')
      AND legacy_b.damage=json_extract(${json},'$.damage')
  ))`;
}

export async function readWeeklyBossVictoryEvent(db, owner, weekKey, bossId) {
  return db.prepare(`SELECT e.* FROM telegram_pet_events e
    JOIN telegram_pet_weekly_boss_victories_by_pet v ON v.telegram_id=e.telegram_id
      AND v.pet_id=e.pet_id AND v.season_key=e.season_key AND v.victory_event_key=e.event_key AND v.week_key=e.week_key
    JOIN telegram_pet_instances i ON i.pet_id=v.pet_id AND i.telegram_id=v.telegram_id AND i.season_key=v.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    WHERE v.telegram_id=? AND v.week_key=? AND v.boss_id=? AND v.defeated_at IS NOT NULL
      AND e.event_type='weekly_boss' AND e.status='accepted' AND e.reason='weekly_boss_attempt'
      AND e.event_key<>'' AND e.event_key=trim(e.event_key) AND length(e.event_key)<=180
      AND length(e.day_key)=10 AND date(e.day_key,'+0 days')=e.day_key
      AND json_extract(${metadata('e')},'$.boss_id')=v.boss_id
      AND json_extract(${metadata('e')},'$.source') IN ('pet_weekly_boss','pet_weekly_boss_backfill')
      AND ${weeklyBossLegacySourceProofSql()}
    LIMIT 1`).bind(owner, weekKey, bossId).first().then(requirePetFirstReadResult);
}

export async function ensureWeeklyBossVictoryEvent(db, owner, weekKey, bossId) {
  const existing = await readWeeklyBossVictoryEvent(db, owner, weekKey, bossId);
  if (existing) return existing;
  // Freeze the account attack and winner together. Never fall back to the
  // current pet, current day, or the first attack from that account/week.
  const source = await db.prepare(`SELECT v.pet_id,v.season_key,v.victory_event_key,b.event_id
    FROM telegram_pet_weekly_boss_victories_by_pet v
    JOIN telegram_pet_weekly_boss_events b ON b.telegram_id=v.telegram_id AND b.week_key=v.week_key
      AND b.boss_id=v.boss_id AND b.event_key=v.victory_event_key
    JOIN telegram_pet_instances i ON i.pet_id=v.pet_id AND i.telegram_id=v.telegram_id AND i.season_key=v.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    WHERE v.telegram_id=? AND v.week_key=? AND v.boss_id=? AND v.defeated_at IS NOT NULL
      AND b.event_key<>'' AND b.event_key=trim(b.event_key) AND length(b.event_key)<=180
      AND length(b.day_key)=10 AND date(b.day_key,'+0 days')=b.day_key LIMIT 1`)
    .bind(owner, weekKey, bossId).first().then(requirePetFirstReadResult);
  if (!source) return null;
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,xp_awarded,pet_xp_awarded,season_key,day_key,week_key,status,reason,metadata)
    SELECT ?,v.pet_id,v.telegram_id,'weekly_boss',v.victory_event_key,0,0,v.season_key,b.day_key,b.week_key,
      'accepted','weekly_boss_attempt',json_object('source','pet_weekly_boss_backfill','boss_id',b.boss_id,
        'action',b.action,'damage',b.damage,'equipment_evidence','unavailable')
    FROM telegram_pet_weekly_boss_victories_by_pet v
    JOIN telegram_pet_weekly_boss_events b ON b.telegram_id=v.telegram_id AND b.week_key=v.week_key
      AND b.boss_id=v.boss_id AND b.event_key=v.victory_event_key
    JOIN telegram_pet_instances i ON i.pet_id=v.pet_id AND i.telegram_id=v.telegram_id AND i.season_key=v.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    WHERE v.telegram_id=? AND v.week_key=? AND v.boss_id=? AND v.pet_id=? AND v.season_key=?
      AND v.victory_event_key=? AND b.event_id=? AND v.defeated_at IS NOT NULL
      AND length(b.day_key)=10 AND date(b.day_key,'+0 days')=b.day_key`)
    .bind(`${source.event_id}:pet-event`.slice(0, 180), owner, weekKey, bossId, source.pet_id,
      source.season_key, source.victory_event_key, source.event_id).run().then(requirePetMutationResult);
  const saved = await readWeeklyBossVictoryEvent(db, owner, weekKey, bossId);
  if (!saved) throw new Error('weekly_boss_evidence_pending');
  return saved;
}

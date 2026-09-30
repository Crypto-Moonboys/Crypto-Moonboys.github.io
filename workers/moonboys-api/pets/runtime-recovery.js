import { boundedRecoveryLimit, claimPetRecoveryBatch } from './recovery-limits.js';
import { PET_SEASONAL_BOSSES } from './content-phase-4.js';

// Keys come from committed game records, never from the current selection or
// retry request. Keeping the original keys also deduplicates pre-upgrade awards.
export function standardStepRuntimeKey(eventKey, source) {
  if (source === 'telegram_mini_app') return `runtime:mini:${eventKey}`;
  if (source === 'telegram_pets_api') return `runtime:api:${eventKey}`;
  return `runtime:run-step:${eventKey}`;
}

export async function recoverPetRuntimeAwards(db, owner, award, filter = {}) {
  // Targeted retries must not move the background queue past unrelated sources.
  const rotate = !filter.run_id && !filter.action && !filter.event_key;
  const recoveryKey = "c.day_key||':'||c.pet_id||':'||c.season_key||':'||c.event_key";
  // Match JS trim before excluding paid rows. Old oversized API keys may have
  // longer specialist receipts than their 120-character primary source key;
  // those ambiguous prefixes must not be paid again under the shortened key.
  // D1 permits at most five terms in one compound SELECT. Materialize the
  // four-source groups so SQLite cannot flatten them back into eight terms.
  const rows = await db.prepare(`WITH run_candidates AS MATERIALIZED (
    SELECT s.pet_id, r.season_key, r.run_id, 'run_step' AS action, date(s.created_at) AS day_key,
      COALESCE(json_extract(CASE WHEN json_valid(s.metadata) THEN s.metadata ELSE '{}' END,'$.runtime_event_key'),
        CASE json_extract(CASE WHEN json_valid(s.metadata) THEN s.metadata ELSE '{}' END,'$.source')
          WHEN 'telegram_mini_app' THEN 'runtime:mini:'||s.event_key
          WHEN 'telegram_pets_api' THEN 'runtime:api:'||s.event_key
          WHEN 'telegram_command' THEN CASE WHEN s.event_key LIKE 'pet_run_step:%' THEN 'runtime:run-step:'||s.event_key END END) AS event_key,
      json_extract(CASE WHEN json_valid(s.metadata) THEN s.metadata ELSE '{}' END,'$.equipment_snapshot') AS equipment_snapshot,
      'run_'||s.choice_type AS equipment_action, s.id AS source_event_id
    FROM telegram_pet_run_steps s JOIN telegram_pet_runs r
      ON r.run_id=s.run_id AND r.telegram_id=s.telegram_id AND r.pet_id=s.pet_id
    WHERE s.telegram_id=? AND NOT EXISTS (SELECT 1 FROM telegram_pet_daily_runs d WHERE d.run_id=r.run_id)
      AND (?='' OR s.event_key=? OR r.status='completed' AND s.step_index=r.depth)
    UNION ALL
    SELECT e.pet_id,e.season_key,r.run_id,'run_extract',e.day_key,
      json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.runtime_event_key'),
      json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.equipment_snapshot'), NULL, e.id
    FROM telegram_pet_events e JOIN telegram_pet_runs r
      ON e.event_key=SUBSTR('pet_run_extract:'||r.telegram_id||':'||r.run_id,1,120)
      AND r.telegram_id=e.telegram_id AND r.pet_id=e.pet_id AND r.season_key=e.season_key
    WHERE e.telegram_id=? AND e.status='accepted' AND e.event_type='run_extract' AND r.status='extracted'
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_daily_runs d WHERE d.run_id=r.run_id)
    UNION ALL
    SELECT room.pet_id,r.season_key,r.run_id,'run_step',date(room.resolved_at),
      json_extract(CASE WHEN json_valid(room.outcome_data) THEN room.outcome_data ELSE '{}' END,'$.runtime_event_key'),
      json_extract(CASE WHEN json_valid(room.outcome_data) THEN room.outcome_data ELSE '{}' END,'$.equipment_snapshot'), NULL, room.room_id
    FROM telegram_pet_run_rooms room JOIN telegram_pet_runs r
      ON r.run_id=room.run_id AND r.telegram_id=room.telegram_id AND r.pet_id=room.pet_id
    JOIN telegram_pet_daily_runs d ON d.run_id=r.run_id AND d.telegram_id=r.telegram_id AND d.pet_id=r.pet_id
    WHERE room.telegram_id=? AND room.status IN ('resolved','failed')
    UNION ALL
    SELECT m.pet_id,r.season_key,r.run_id,'run_extract',date(m.created_at),
      json_extract(CASE WHEN json_valid(m.event_data) THEN m.event_data ELSE '{}' END,'$.runtime_event_key'),
      json_extract(CASE WHEN json_valid(m.event_data) THEN m.event_data ELSE '{}' END,'$.equipment_snapshot'), NULL, m.analytics_id
    FROM telegram_pet_run_analytics m JOIN telegram_pet_runs r
      ON r.run_id=m.run_id AND r.telegram_id=m.telegram_id AND r.pet_id=m.pet_id
    JOIN telegram_pet_daily_runs d ON d.run_id=r.run_id AND d.telegram_id=r.telegram_id AND d.pet_id=r.pet_id
    WHERE m.telegram_id=? AND m.event_type='run_end' AND r.status='extracted' AND r.current_room<r.max_room
  ), other_candidates(pet_id,season_key,run_id,action,day_key,event_key,equipment_snapshot,equipment_action,source_event_id) AS MATERIALIZED (
    SELECT e.pet_id,e.season_key,'','explore',e.day_key,
      CASE WHEN e.event_type='adventure' THEN
        CASE json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.source')
          WHEN 'telegram_mini_app' THEN 'runtime:mini:'||e.event_key
          WHEN 'telegram_pets_api' THEN 'runtime:api:'||e.event_key END
        ELSE json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.runtime_event_key') END,
      json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.equipment_snapshot'), NULL, e.id
    FROM telegram_pet_events e WHERE e.telegram_id=? AND e.status='accepted'
      AND e.event_type IN ('adventure','district_mission','event_chain')
    UNION ALL
    SELECT e.pet_id,e.season_key,'',CASE e.event_type WHEN 'work' THEN 'job' ELSE e.event_type END,e.day_key,
      COALESCE(json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.runtime_event_key'),
        json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.runtime_event_key'),
        CASE COALESCE(json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.source'),
          json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.source'))
          WHEN 'telegram_mini_app' THEN 'runtime:mini:'||e.event_key
          WHEN 'telegram_pets_api' THEN 'runtime:api:'||e.event_key END),
      COALESCE(json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.equipment_snapshot'),
        json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.equipment_snapshot')), NULL, e.id
    FROM telegram_pet_events e WHERE e.telegram_id=? AND e.status='accepted'
      AND e.event_type IN ('feed','play','clean','sleep','train','energy_drink','dance','cuddles','work','daily_chest')
    UNION ALL
    SELECT e.pet_id,e.season_key,'',CASE e.event_type WHEN 'arena_battle' THEN 'arena_complete' ELSE 'kaiju_win' END,
      e.day_key,'runtime:'||e.event_key,
      json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.equipment_snapshot'), NULL, e.id
    FROM telegram_pet_events e WHERE e.telegram_id=? AND e.status='accepted'
      AND (e.event_type='arena_battle' AND e.reason IN ('arena_win','arena_draw','arena_loss')
        OR e.event_type='kaiju_battle' AND e.reason='kaiju_win')
    UNION ALL
    SELECT b.pet_id,b.pet_season_key,'','run_boss',date(b.defeated_at),
      'runtime:mini:seasonal-boss:'||b.pet_id||':'||b.season_key,
      json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.context.equipment_snapshot'), NULL, e.id
    FROM telegram_pet_seasonal_boss_progress b LEFT JOIN telegram_pet_events e
      ON e.telegram_id=b.telegram_id AND e.pet_id=b.pet_id AND e.season_key=b.pet_season_key
      AND e.event_key='seasonal:'||b.season_key||':'||b.telegram_id||':'||b.pet_id
      AND e.event_type='seasonal_boss' AND e.status='accepted'
    WHERE b.telegram_id=? AND b.defeated_at IS NOT NULL AND b.boss_key IN (${Object.keys(PET_SEASONAL_BOSSES).map(() => '?').join(',')})
  ), raw_candidates AS (
    SELECT * FROM run_candidates UNION ALL SELECT * FROM other_candidates
  ), candidates AS (
    SELECT pet_id,season_key,run_id,action,day_key,
      TRIM(event_key, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) AS event_key, equipment_snapshot, equipment_action, source_event_id
    FROM raw_candidates
  ) SELECT c.*,${recoveryKey} AS recovery_key${rotate ? ',recovery_state.setting_value AS recovery_cursor' : ''} FROM candidates c
    JOIN telegram_pet_instances p ON p.pet_id=c.pet_id AND p.telegram_id=? AND p.season_key=c.season_key
    JOIN telegram_pet_season_slots slot ON slot.pet_id=p.pet_id AND slot.telegram_id=p.telegram_id
      AND slot.season_key=p.season_key AND slot.slot_number=p.slot_number
    ${rotate ? "LEFT JOIN telegram_pet_recovery_cursors recovery_state ON recovery_state.telegram_id=p.telegram_id AND recovery_state.setting_key='moonpet:recovery:runtime'" : ''}
    WHERE c.event_key<>'' AND c.day_key IS NOT NULL
      AND (?='' OR c.run_id=?) AND (?='' OR c.action=?)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_specialist_events e WHERE e.telegram_id=p.telegram_id
        AND e.pet_id=c.pet_id AND e.season_key=c.season_key AND
        (e.event_key=c.event_key OR (c.event_key LIKE 'runtime:api:%' AND length(c.event_key)=132
          AND substr(e.event_key,1,132)=c.event_key)))
    GROUP BY c.pet_id,c.season_key,c.event_key
    ORDER BY ${rotate ? `CASE WHEN ${recoveryKey}>COALESCE(recovery_state.setting_value,'') THEN 0 ELSE 1 END,` : ''}
      ${recoveryKey} LIMIT ?`)
    .bind(owner, filter.event_key || '', filter.event_key || '', owner, owner, owner, owner, owner, owner, owner,
      ...Object.keys(PET_SEASONAL_BOSSES), owner, filter.run_id || '', filter.run_id || '', filter.action || '', filter.action || '', boundedRecoveryLimit(filter.limit, 20)).all();
  if (rotate && !await claimPetRecoveryBatch(db, owner, 'runtime', rows.results || [])) return;
  for (const row of rows.results || []) {
    try { await award(db, owner, row.event_key, row.action, row); }
    catch (error) { console.error('moonpet_runtime_award_pending', error?.message || String(error)); }
  }
}

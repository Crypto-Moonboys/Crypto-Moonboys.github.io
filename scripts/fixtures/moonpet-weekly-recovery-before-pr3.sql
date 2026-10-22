SELECT eligible.*,eligible.season_key||':'||printf('%02d',eligible.qualification_week)||':'||eligible.pet_id AS recovery_key,recovery_state.setting_value AS recovery_cursor FROM (
        SELECT pet_id, season_key, qualification_week FROM (
        SELECT o.pet_id, o.season_key, o.qualification_week, o.objective_id
        FROM telegram_pet_season_slots s
        JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key AND i.slot_number=s.slot_number
        JOIN telegram_pet_weekly_journey_objectives o ON o.pet_id=s.pet_id AND o.telegram_id=s.telegram_id AND o.season_key=s.season_key
        JOIN telegram_pet_events e ON e.event_key=o.source_event_key AND e.telegram_id=o.telegram_id
        AND e.pet_id=o.pet_id AND e.season_key=o.season_key AND e.status='accepted' AND e.day_key<>''
        AND (COALESCE(json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.source'),'') <> 'pet_weekly_boss_backfill' OR EXISTS (
    SELECT 1 FROM telegram_pet_weekly_boss_victories_by_pet legacy_v
    JOIN telegram_pet_weekly_boss_events legacy_b ON legacy_b.telegram_id=legacy_v.telegram_id
      AND legacy_b.week_key=legacy_v.week_key AND legacy_b.boss_id=legacy_v.boss_id
      AND legacy_b.event_key=legacy_v.victory_event_key
    WHERE legacy_v.telegram_id=e.telegram_id AND legacy_v.pet_id=e.pet_id
      AND legacy_v.season_key=e.season_key AND legacy_v.week_key=e.week_key
      AND legacy_v.victory_event_key=e.event_key AND e.event_type='weekly_boss'
      AND e.reason='weekly_boss_attempt' AND legacy_b.day_key=e.day_key
      AND legacy_v.boss_id=json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.boss_id')
      AND legacy_b.action=json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.action')
      AND legacy_b.damage=json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.damage')
  ))
        WHERE s.telegram_id=? AND o.status='accepted' AND NOT EXISTS (
        SELECT 1 FROM telegram_pet_events e JOIN telegram_pet_instances i ON i.pet_id=e.pet_id AND i.telegram_id=e.telegram_id AND i.season_key=e.season_key
  JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
        WHERE e.telegram_id=o.telegram_id AND e.pet_id=o.pet_id AND e.season_key=o.season_key
          AND e.status='accepted' AND e.event_key<>'' AND e.event_key=trim(e.event_key) AND length(e.event_key)<=180
  AND e.event_type IN ('feed','play','clean','sleep','train','run','run_complete','run_extract','daily_run','daily_moon_run','boss_fought','weekly_boss','check_in','daily_check_in','weekly_check_in','daily_chest') AND length(e.day_key)=10 AND date(e.day_key,'+0 days')=e.day_key
  AND e.day_key>=CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END AND (COALESCE(json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.source'),'') <> 'pet_weekly_boss_backfill' OR EXISTS (
    SELECT 1 FROM telegram_pet_weekly_boss_victories_by_pet legacy_v
    JOIN telegram_pet_weekly_boss_events legacy_b ON legacy_b.telegram_id=legacy_v.telegram_id
      AND legacy_b.week_key=legacy_v.week_key AND legacy_b.boss_id=legacy_v.boss_id
      AND legacy_b.event_key=legacy_v.victory_event_key
    WHERE legacy_v.telegram_id=e.telegram_id AND legacy_v.pet_id=e.pet_id
      AND legacy_v.season_key=e.season_key AND legacy_v.week_key=e.week_key
      AND legacy_v.victory_event_key=e.event_key AND e.event_type='weekly_boss'
      AND e.reason='weekly_boss_attempt' AND legacy_b.day_key=e.day_key
      AND legacy_v.boss_id=json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.boss_id')
      AND legacy_b.action=json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.action')
      AND legacy_b.damage=json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.damage')
  )) AND CASE WHEN CASE WHEN s.journey_clock='legacy_quarter' AND (s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
  OR s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]') THEN date(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END,'+3 months') END IS NOT NULL AND e.day_key>=CASE WHEN s.journey_clock='legacy_quarter' AND (s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
  OR s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]') THEN date(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END,'+3 months') END
  THEN 14+CAST((julianday(e.day_key)-julianday(CASE WHEN s.journey_clock='legacy_quarter' AND (s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
  OR s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]') THEN date(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END,'+3 months') END))/7 AS INTEGER)
  WHEN CASE WHEN s.journey_clock='legacy_quarter' AND (s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
  OR s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]') THEN date(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END,'+3 months') END IS NOT NULL THEN MIN(13,1+CAST((julianday(e.day_key)-julianday(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END))/7 AS INTEGER))
  ELSE 1+CAST((julianday(e.day_key)-julianday(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END))/7 AS INTEGER) END=o.qualification_week AND NOT EXISTS (SELECT 1 FROM telegram_pet_weekly_journey_objectives o
    WHERE o.telegram_id=e.telegram_id AND o.pet_id=e.pet_id AND o.season_key=e.season_key
      AND o.qualification_week=CASE WHEN CASE WHEN s.journey_clock='legacy_quarter' AND (s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
  OR s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]') THEN date(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END,'+3 months') END IS NOT NULL AND e.day_key>=CASE WHEN s.journey_clock='legacy_quarter' AND (s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
  OR s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]') THEN date(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END,'+3 months') END
  THEN 14+CAST((julianday(e.day_key)-julianday(CASE WHEN s.journey_clock='legacy_quarter' AND (s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
  OR s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]') THEN date(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END,'+3 months') END))/7 AS INTEGER)
  WHEN CASE WHEN s.journey_clock='legacy_quarter' AND (s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
  OR s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]') THEN date(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END,'+3 months') END IS NOT NULL THEN MIN(13,1+CAST((julianday(e.day_key)-julianday(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END))/7 AS INTEGER))
  ELSE 1+CAST((julianday(e.day_key)-julianday(CASE
  WHEN s.journey_clock='created_at' THEN date(s.created_at)
  WHEN s.season_key GLOB 'pet-s[0-9][0-9][0-9][0-9]-00[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,6,4),(CAST(substr(s.season_key,13,1) AS INTEGER)-1)*3+1)
  WHEN s.season_key GLOB '[0-9][0-9][0-9][0-9]-q[1-4]'
    THEN printf('%s-%02d-01',substr(s.season_key,1,4),(CAST(substr(s.season_key,7,1) AS INTEGER)-1)*3+1)
  ELSE date(s.created_at) END))/7 AS INTEGER) END
      AND o.source_event_key=e.event_key AND o.objective_id=CASE e.event_type WHEN 'feed' THEN 'weekly_care' WHEN 'play' THEN 'weekly_care' WHEN 'clean' THEN 'weekly_care' WHEN 'sleep' THEN 'weekly_care' WHEN 'train' THEN 'weekly_training' WHEN 'run' THEN 'weekly_run' WHEN 'run_complete' THEN 'weekly_run' WHEN 'run_extract' THEN 'weekly_run' WHEN 'daily_run' THEN 'weekly_run' WHEN 'daily_moon_run' THEN 'weekly_run' WHEN 'boss_fought' THEN 'weekly_boss_attempt' WHEN 'weekly_boss' THEN 'weekly_boss_attempt' WHEN 'check_in' THEN 'weekly_check_in' WHEN 'daily_check_in' THEN 'weekly_check_in' WHEN 'weekly_check_in' THEN 'weekly_check_in' WHEN 'daily_chest' THEN 'weekly_check_in' END AND o.status='accepted'))
           AND NOT EXISTS (
          SELECT 1 FROM telegram_pet_weekly_journey_receipts r
          WHERE r.telegram_id=o.telegram_id AND r.pet_id=o.pet_id AND r.season_key=o.season_key AND r.qualification_week=o.qualification_week
            AND r.crest_id IS NOT NULL AND (r.status='accepted' OR r.reason='weekly_journey_crest_duplicate'))
        GROUP BY o.pet_id, o.season_key, o.qualification_week, o.objective_id
        HAVING CASE WHEN o.objective_id='weekly_check_in' THEN COUNT(DISTINCT e.day_key) WHEN o.objective_id IN ('weekly_boss_attempt') THEN MAX(o.progress_value) ELSE SUM(o.progress_value) END >= CASE o.objective_id WHEN 'weekly_care' THEN 5 WHEN 'weekly_training' THEN 3 WHEN 'weekly_run' THEN 3 WHEN 'weekly_boss_attempt' THEN 1 WHEN 'weekly_check_in' THEN 2 END
        ) GROUP BY pet_id, season_key, qualification_week HAVING COUNT(*)>=?
      ) eligible LEFT JOIN telegram_pet_recovery_cursors recovery_state ON recovery_state.telegram_id=? AND recovery_state.setting_key=?
      ORDER BY CASE WHEN eligible.season_key||':'||printf('%02d',eligible.qualification_week)||':'||eligible.pet_id>COALESCE(recovery_state.setting_value,'') THEN 0 ELSE 1 END,
        eligible.season_key||':'||printf('%02d',eligible.qualification_week)||':'||eligible.pet_id LIMIT ?
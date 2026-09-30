-- An accepted official Daily Moon Run is an Adventure for the seven-goal
-- daily checklist. Recreate both durable latch triggers so the credit survives
-- state-refresh failures and UTC day rollover.
DROP TRIGGER IF EXISTS pet_daily_completion_event_insert;
DROP TRIGGER IF EXISTS pet_daily_completion_event_accept;

CREATE TRIGGER pet_daily_completion_event_insert
AFTER INSERT ON telegram_pet_events
WHEN NEW.status='accepted' AND NEW.event_type IN ('feed','play','clean','train','trade','buy','adventure','run_extract','run_complete','daily_moon_run','district_mission','event_chain','seasonal_boss')
  AND NEW.event_key NOT LIKE 'moonpet_wallet_reconcile:%'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits)
  VALUES (NEW.telegram_id,NEW.day_key,CASE NEW.event_type WHEN 'feed' THEN 1 WHEN 'play' THEN 2 WHEN 'clean' THEN 4 WHEN 'train' THEN 8 WHEN 'trade' THEN 16 WHEN 'buy' THEN 32 ELSE 64 END)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|excluded.progress_bits
  WHERE (progress_bits|excluded.progress_bits)<>progress_bits;
END;

CREATE TRIGGER pet_daily_completion_event_accept
AFTER UPDATE OF status ON telegram_pet_events
WHEN NEW.status='accepted' AND OLD.status<>'accepted'
  AND NEW.event_type IN ('feed','play','clean','train','trade','buy','adventure','run_extract','run_complete','daily_moon_run','district_mission','event_chain','seasonal_boss')
  AND NEW.event_key NOT LIKE 'moonpet_wallet_reconcile:%'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits)
  VALUES (NEW.telegram_id,NEW.day_key,CASE NEW.event_type WHEN 'feed' THEN 1 WHEN 'play' THEN 2 WHEN 'clean' THEN 4 WHEN 'train' THEN 8 WHEN 'trade' THEN 16 WHEN 'buy' THEN 32 ELSE 64 END)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|excluded.progress_bits
  WHERE (progress_bits|excluded.progress_bits)<>progress_bits;
END;

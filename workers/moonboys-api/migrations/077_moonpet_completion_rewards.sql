-- Earned daily checklist bits survive spending, refresh failures and midnight.
-- Reward assignment is frozen on the first claim; currency remains account-owned.
CREATE TABLE IF NOT EXISTS telegram_pet_daily_completion (
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  progress_bits INTEGER NOT NULL DEFAULT 0 CHECK (progress_bits BETWEEN 0 AND 255),
  pet_id TEXT,
  season_key TEXT,
  claimed_at TEXT,
  PRIMARY KEY (telegram_id, utc_day),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key) REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS pet_daily_completion_event_insert
AFTER INSERT ON telegram_pet_events
WHEN NEW.status='accepted' AND NEW.event_type IN ('feed','play','clean','train','trade','buy','adventure','run_extract','run_complete','district_mission','event_chain','seasonal_boss')
  AND NEW.event_key NOT LIKE 'moonpet_wallet_reconcile:%'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits)
  VALUES (NEW.telegram_id,NEW.day_key,CASE NEW.event_type WHEN 'feed' THEN 1 WHEN 'play' THEN 2 WHEN 'clean' THEN 4 WHEN 'train' THEN 8 WHEN 'trade' THEN 16 WHEN 'buy' THEN 32 ELSE 64 END)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|excluded.progress_bits
  WHERE (progress_bits|excluded.progress_bits)<>progress_bits;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_event_accept
AFTER UPDATE OF status ON telegram_pet_events
WHEN NEW.status='accepted' AND OLD.status<>'accepted'
  AND NEW.event_type IN ('feed','play','clean','train','trade','buy','adventure','run_extract','run_complete','district_mission','event_chain','seasonal_boss')
  AND NEW.event_key NOT LIKE 'moonpet_wallet_reconcile:%'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits)
  VALUES (NEW.telegram_id,NEW.day_key,CASE NEW.event_type WHEN 'feed' THEN 1 WHEN 'play' THEN 2 WHEN 'clean' THEN 4 WHEN 'train' THEN 8 WHEN 'trade' THEN 16 WHEN 'buy' THEN 32 ELSE 64 END)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|excluded.progress_bits
  WHERE (progress_bits|excluded.progress_bits)<>progress_bits;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_bank_insert
AFTER INSERT ON telegram_pet_profiles WHEN NEW.moon_gold>=50
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (NEW.telegram_id,date('now'),128)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|128 WHERE (progress_bits&128)=0;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_bank_update
AFTER UPDATE OF moon_gold ON telegram_pet_profiles WHEN NEW.moon_gold>=50 OR OLD.moon_gold>=50
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (NEW.telegram_id,date('now'),128)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|128 WHERE (progress_bits&128)=0;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_upgrade_insert
AFTER INSERT ON telegram_pet_system_events WHEN NEW.system_key='equipment_upgrade' AND NEW.status='completed'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (NEW.telegram_id,date(NEW.updated_at),32)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|32 WHERE (progress_bits&32)=0;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_upgrade_finish
AFTER UPDATE OF status ON telegram_pet_system_events WHEN NEW.system_key='equipment_upgrade' AND NEW.status='completed' AND OLD.status<>'completed'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (NEW.telegram_id,date(NEW.updated_at),32)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|32 WHERE (progress_bits&32)=0;
END;

-- One saved finale per owned pet/season. Revision stays monotonic across retries.
CREATE TABLE IF NOT EXISTS telegram_pet_season_finales (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','failed','won')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt>0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  defeated_at TEXT,
  claimed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id,season_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id,telegram_id,season_key) REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_finales_owner ON telegram_pet_season_finales(telegram_id,season_key);

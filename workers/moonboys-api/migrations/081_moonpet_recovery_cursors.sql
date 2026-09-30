-- Keep Moonpet recovery state independent from the historical production
-- telegram_settings table, whose deployed schema is global key/value.
CREATE TABLE IF NOT EXISTS telegram_pet_recovery_cursors (
  telegram_id   TEXT NOT NULL,
  setting_key   TEXT NOT NULL,
  setting_value TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, setting_key)
);

-- Crypto Moonboys Pets notifications and 24/7 needs loop.

CREATE TABLE IF NOT EXISTS telegram_pet_notification_settings (
  telegram_id       TEXT PRIMARY KEY,
  enabled           INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  last_notified_at  DATETIME,
  last_reason       TEXT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_notification_settings_due
  ON telegram_pet_notification_settings(enabled, last_notified_at);

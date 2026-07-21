CREATE TABLE IF NOT EXISTS telegram_pet_activity_sessions (
  id            TEXT PRIMARY KEY,
  telegram_id   TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('sleep', 'train', 'work', 'explore')),
  started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at       DATETIME NOT NULL,
  claimed_at    DATETIME,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  metadata      TEXT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_activity_one_active
  ON telegram_pet_activity_sessions(telegram_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_telegram_pet_activity_user_status
  ON telegram_pet_activity_sessions(telegram_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_activity_expiry
  ON telegram_pet_activity_sessions(status, ends_at);

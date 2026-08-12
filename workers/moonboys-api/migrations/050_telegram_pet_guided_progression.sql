-- One-time player-facing progression notices. The unique owner/key pair keeps
-- repeated status checks and Telegram callback retries from spamming players.

CREATE TABLE telegram_pet_guidance_notices (
  telegram_id TEXT NOT NULL,
  notice_key TEXT NOT NULL CHECK (length(notice_key) BETWEEN 1 AND 160),
  notice_type TEXT NOT NULL CHECK (notice_type IN ('evolution_ready', 'season_reward', 'personality', 'achievement', 'feature', 'job', 'shop')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  detail TEXT NOT NULL DEFAULT '' CHECK (length(detail) <= 500),
  callback_data TEXT NOT NULL DEFAULT 'pet:coach' CHECK (length(callback_data) BETWEEN 1 AND 100),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  shown_at DATETIME,
  PRIMARY KEY (telegram_id, notice_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX idx_telegram_pet_guidance_notices_unshown
  ON telegram_pet_guidance_notices (telegram_id, shown_at, created_at);

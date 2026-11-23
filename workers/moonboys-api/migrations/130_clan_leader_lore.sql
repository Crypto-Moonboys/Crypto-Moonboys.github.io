CREATE TABLE IF NOT EXISTS clan_leader_lore_usage (
  utc_day TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  questions INTEGER NOT NULL CHECK (questions > 0),
  PRIMARY KEY (utc_day, telegram_id)
) WITHOUT ROWID;

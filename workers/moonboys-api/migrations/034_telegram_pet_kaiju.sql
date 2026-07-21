CREATE TABLE IF NOT EXISTS telegram_pet_kaiju_matches (
  id                  TEXT PRIMARY KEY,
  match_id            TEXT NOT NULL UNIQUE,
  chat_id             TEXT NOT NULL,
  mode                TEXT NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'group')),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'selecting', 'completed', 'cancelled')),
  player1_telegram_id TEXT NOT NULL,
  player2_telegram_id TEXT,
  player1_card_key    TEXT,
  player2_card_key    TEXT,
  cpu_card_key        TEXT,
  roll                INTEGER NOT NULL DEFAULT 0,
  category_key        TEXT,
  winner_telegram_id  TEXT,
  result              TEXT,
  score_json          TEXT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at        DATETIME,
  FOREIGN KEY (player1_telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_one_open_chat
  ON telegram_pet_kaiju_matches(chat_id)
  WHERE status IN ('open', 'selecting');

CREATE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_chat_status
  ON telegram_pet_kaiju_matches(chat_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_kaiju_queue (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'played', 'left', 'expired')),
  queued_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_queue_one_waiting
  ON telegram_pet_kaiju_queue(chat_id, telegram_id)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_queue_chat
  ON telegram_pet_kaiju_queue(chat_id, status, queued_at ASC);

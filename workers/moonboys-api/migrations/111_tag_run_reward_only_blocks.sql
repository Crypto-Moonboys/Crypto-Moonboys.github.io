-- TAG RUN reward-only exclusion periods.
-- Street Cred, ranks and leaderboards continue normally. These immutable
-- periods prevent messages sent while reward-blocked from later becoming
-- Community Pot weight after an unblock.

-- Preserve both clocks: Telegram send time owns reward exclusion, while the
-- Worker processing clock owns cooldown and duplicate-content enforcement.
ALTER TABLE tag_run_messages ADD COLUMN processed_unix INTEGER;
UPDATE tag_run_messages
SET processed_unix=message_unix
WHERE processed_unix IS NULL;
CREATE INDEX IF NOT EXISTS tag_run_messages_member_processing
  ON tag_run_messages(chat_id,telegram_id,day_key,processed_unix);
CREATE INDEX IF NOT EXISTS tag_run_messages_hash_processing
  ON tag_run_messages(chat_id,telegram_id,content_hash,processed_unix);
-- Keeps the already-deployed migration-103 Worker safe during the short
-- migration-before-deploy window: its message_unix value was processing time.
CREATE TRIGGER IF NOT EXISTS tag_run_message_processing_clock
AFTER INSERT ON tag_run_messages
WHEN NEW.processed_unix IS NULL
BEGIN
  UPDATE tag_run_messages
  SET processed_unix=NEW.message_unix
  WHERE chat_id=NEW.chat_id AND message_id=NEW.message_id;
END;

CREATE TABLE IF NOT EXISTS tag_run_reward_exclusion_periods (
  exclusion_id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL
    CHECK(telegram_id NOT GLOB '*[^0-9]*' AND length(telegram_id) BETWEEN 1 AND 20),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  updated_by TEXT NOT NULL
    CHECK(updated_by NOT GLOB '*[^0-9]*' AND length(updated_by) BETWEEN 1 AND 20),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ended_at IS NULL OR ended_at>=started_at),
  FOREIGN KEY(chat_id,telegram_id)
    REFERENCES tag_run_member_blocks(chat_id,telegram_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tag_run_reward_exclusion_open
  ON tag_run_reward_exclusion_periods(chat_id,telegram_id)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS tag_run_reward_exclusion_lookup
  ON tag_run_reward_exclusion_periods(
    chat_id,telegram_id,started_at,ended_at
  );

-- Preserve any active exclusions created after migration 110 but before this
-- migration is applied.
INSERT INTO tag_run_reward_exclusion_periods
  (chat_id,telegram_id,started_at,updated_by)
SELECT b.chat_id,b.telegram_id,COALESCE(b.blocked_at,b.updated_at),b.updated_by
FROM tag_run_member_blocks b
WHERE b.blocked=1
  AND NOT EXISTS (
    SELECT 1 FROM tag_run_reward_exclusion_periods e
    WHERE e.chat_id=b.chat_id AND e.telegram_id=b.telegram_id
      AND e.ended_at IS NULL
  );

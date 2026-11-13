-- TAG RUN reward-only exclusion periods.
-- Street Cred, ranks and leaderboards continue normally. These immutable
-- periods prevent messages sent while reward-blocked from later becoming
-- Community Pot weight after an unblock.

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

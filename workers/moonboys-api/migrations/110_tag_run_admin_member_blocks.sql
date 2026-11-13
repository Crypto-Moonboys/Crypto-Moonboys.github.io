-- TAG RUN private-admin member blocks.
-- Historical Street Cred/audit receipts remain immutable; active blocks stop
-- new scoring and all future unreserved Community Pot selection.

CREATE TABLE IF NOT EXISTS tag_run_member_blocks (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL CHECK(telegram_id GLOB '[0-9]*' AND length(telegram_id) BETWEEN 1 AND 20),
  username TEXT NOT NULL COLLATE NOCASE CHECK(length(username) BETWEEN 5 AND 32),
  blocked INTEGER NOT NULL DEFAULT 1 CHECK(blocked IN (0,1)),
  updated_by TEXT NOT NULL CHECK(updated_by GLOB '[0-9]*' AND length(updated_by) BETWEEN 1 AND 20),
  blocked_at TEXT,
  unblocked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,telegram_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS tag_run_member_blocks_username
  ON tag_run_member_blocks(chat_id,username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS tag_run_member_blocks_active
  ON tag_run_member_blocks(chat_id,blocked,telegram_id);

-- TAG RUN private-admin member blocks.
-- Historical Street Cred/audit receipts remain immutable; active blocks stop
-- new scoring and all future unreserved Community Pot selection.

CREATE TABLE IF NOT EXISTS tag_run_member_blocks (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL CHECK(telegram_id NOT GLOB '*[^0-9]*' AND length(telegram_id) BETWEEN 1 AND 20),
  username TEXT NOT NULL COLLATE NOCASE CHECK(length(username) BETWEEN 5 AND 32 AND username NOT GLOB '*[^A-Za-z0-9_]*'),
  blocked INTEGER NOT NULL DEFAULT 1 CHECK(blocked IN (0,1)),
  updated_by TEXT NOT NULL CHECK(updated_by NOT GLOB '*[^0-9]*' AND length(updated_by) BETWEEN 1 AND 20),
  blocked_at TEXT,
  unblocked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,telegram_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS tag_run_member_blocks_username
  ON tag_run_member_blocks(chat_id,username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS tag_run_member_blocks_active
  ON tag_run_member_blocks(chat_id,blocked,telegram_id);

-- Freeze each member's active block state when a draw is committed. This
-- complements migration 107: every participation row remains present for its
-- completeness proof, while blocked rows are ineligible in the replay.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_member_block_insert_guard
BEFORE INSERT ON tag_run_v2_draw_workflows BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.participation') j
    WHERE json_type(j.value,'$.blocked') IS NULL
      OR json_type(j.value,'$.blocked')!='integer'
      OR json_extract(j.value,'$.blocked') NOT IN (0,1)
      OR json_extract(j.value,'$.blocked')!=CASE WHEN EXISTS(
        SELECT 1 FROM tag_run_member_blocks b
        WHERE b.chat_id=NEW.chat_id
          AND b.telegram_id=json_extract(j.value,'$.telegram_id')
          AND b.blocked=1
      ) THEN 1 ELSE 0 END
  ) THEN RAISE(ABORT,'v2_draw_member_block_changed') END;
END;


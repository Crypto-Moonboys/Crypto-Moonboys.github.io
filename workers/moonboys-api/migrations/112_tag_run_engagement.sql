-- Apply before deploying TAG_RUN_ENGAGEMENT_ENABLED=true.
-- Reply metadata is recorded only for accepted scoring receipts.
ALTER TABLE tag_run_messages ADD COLUMN reply_to_id TEXT;
CREATE INDEX IF NOT EXISTS tag_run_messages_reply_target
 ON tag_run_messages(chat_id,telegram_id,day_key,reply_to_id);
CREATE INDEX IF NOT EXISTS tag_run_messages_group_hash
 ON tag_run_messages(chat_id,content_hash,processed_unix);
CREATE TABLE IF NOT EXISTS tag_run_engagement_posts (
 chat_id TEXT NOT NULL,
 event_key TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('attempted','sent','needs_review')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 3500),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(chat_id,event_key)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tag_run_engagement_config (
 config_id INTEGER PRIMARY KEY CHECK(config_id=1),
 started_day TEXT NOT NULL
);
INSERT OR IGNORE INTO tag_run_engagement_config(config_id,started_day)
 VALUES(1,date('now'));

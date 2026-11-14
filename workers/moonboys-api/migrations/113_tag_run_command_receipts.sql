-- Claim before command execution/Telegram delivery. Never automatically reclaim:
-- a lost acknowledgement cannot prove that Telegram did not post the reply.
CREATE TABLE IF NOT EXISTS tag_run_command_receipts (
  bot_id TEXT NOT NULL,
  update_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'attempted' CHECK (status IN ('attempted','completed','failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  PRIMARY KEY (bot_id, update_id),
  UNIQUE (bot_id, chat_id, message_id)
);

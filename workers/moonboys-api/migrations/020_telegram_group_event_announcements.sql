-- Migration 020: Telegram group event announcement dedupe/log table
-- Stores one row per community-wide group announcement so scheduled jobs and
-- manual retries cannot duplicate group posts.

CREATE TABLE IF NOT EXISTS telegram_group_announcement_log (
  announcement_key   TEXT PRIMARY KEY,
  utc_day            TEXT NOT NULL,
  event_id           TEXT,
  announcement_type  TEXT NOT NULL,
  scheduled_for      TEXT NOT NULL,
  sent_at            TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  error_message      TEXT,
  metadata_json      TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_group_announcement_key
  ON telegram_group_announcement_log(announcement_key);

CREATE INDEX IF NOT EXISTS idx_telegram_group_announcement_due
  ON telegram_group_announcement_log(utc_day, announcement_type, status, scheduled_for);

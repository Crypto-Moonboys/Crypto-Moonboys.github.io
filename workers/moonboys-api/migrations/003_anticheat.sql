-- Migration 003: Anti-cheat scanner — risk state and event audit tables
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/003_anticheat.sql --remote
--
-- Tables created:
--   telegram_anticheat_state   — per-user risk buckets + block status
--   telegram_anticheat_events  — immutable audit log of every risk event / admin action

-- ── Per-user anti-cheat state ────────────────────────────────────────────────
-- season_risk_score  — accumulates within the active 90-day season; resets when a new
--                      season starts (same epoch as leaderboard-worker.js).
-- year_risk_score    — accumulates within the active UTC calendar year; resets on Jan 1.
-- lifetime_strikes   — incremented on every fresh ceiling breach; NEVER auto-reset.
-- is_blocked         — 1 while any block is active.
-- block_type         — 'season' | 'year' | 'lifetime'
-- current_season_number / current_year — cached so the worker can detect rollovers.

CREATE TABLE IF NOT EXISTS telegram_anticheat_state (
  telegram_id           TEXT PRIMARY KEY,
  season_risk_score     REAL    NOT NULL DEFAULT 0,
  year_risk_score       REAL    NOT NULL DEFAULT 0,
  lifetime_strikes      INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_strikes >= 0),
  is_blocked            INTEGER NOT NULL DEFAULT 0 CHECK (is_blocked IN (0, 1)),
  block_type            TEXT    CHECK (block_type IN ('season', 'year', 'lifetime')),
  blocked_reason        TEXT,
  current_season_number INTEGER NOT NULL DEFAULT 0,
  current_year          INTEGER NOT NULL DEFAULT 0,
  last_scan_at          DATETIME,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_anticheat_state_blocked
  ON telegram_anticheat_state(is_blocked, block_type)
  WHERE is_blocked = 1;

CREATE INDEX IF NOT EXISTS idx_anticheat_state_last_scan
  ON telegram_anticheat_state(last_scan_at);

-- ── Immutable anti-cheat event log ───────────────────────────────────────────
-- event_type examples:
--   'season_risk'       — season bucket increased
--   'year_risk'         — year bucket increased
--   'ceiling_breach'    — a risk ceiling was crossed → strike issued
--   'user_blocked'      — block applied (auto or admin)
--   'admin_unblock'     — admin cleared a block
--   'admin_block'       — admin applied a manual block
--   'admin_clear_strikes' — admin zeroed lifetime_strikes

CREATE TABLE IF NOT EXISTS telegram_anticheat_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id   TEXT    NOT NULL,
  event_type    TEXT    NOT NULL,
  season_number INTEGER,
  year          INTEGER,
  risk_delta    REAL    NOT NULL DEFAULT 0,
  metadata      TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_anticheat_events_telegram_created
  ON telegram_anticheat_events(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anticheat_events_type_created
  ON telegram_anticheat_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anticheat_events_season
  ON telegram_anticheat_events(season_number, created_at DESC);

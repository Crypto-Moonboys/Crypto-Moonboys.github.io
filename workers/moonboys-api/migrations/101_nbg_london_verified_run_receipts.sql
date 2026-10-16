-- #1530 PR3B: replay-unique, source-owned NBG London verified run receipts.
-- Additive, no backfill: existing game boards/period totals remain unchanged.
-- No Community XP, Arcade XP, Moonpet XP or prize payout authority.
-- Do NOT deploy the gated trusted writer before this migration is explicitly
-- backed up, remotely applied and verified by the owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nbg_london_runs_id_owner
  ON nbg_london_runs(run_id,telegram_id);

CREATE TABLE IF NOT EXISTS nbg_london_verified_runs (
  run_id TEXT NOT NULL PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id),
  day_key TEXT NOT NULL CHECK(length(day_key)=10),
  finished_at_ms INTEGER NOT NULL CHECK(finished_at_ms>=1704067200000),
  time_ms INTEGER NOT NULL CHECK(time_ms BETWEEN 65000 AND 1800000),
  verified_xp INTEGER NOT NULL CHECK(verified_xp BETWEEN 0 AND 1000000),
  replay_version INTEGER NOT NULL CHECK(replay_version=1),
  replay_sha256 TEXT NOT NULL UNIQUE
    CHECK(length(replay_sha256)=64 AND replay_sha256 NOT GLOB '*[^0-9a-f]*'),
  input_sha256 TEXT NOT NULL UNIQUE
    CHECK(length(input_sha256)=64 AND input_sha256 NOT GLOB '*[^0-9a-f]*'),
  authority TEXT NOT NULL DEFAULT 'server_replay'
    CHECK(authority='server_replay'),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>=finished_at_ms),
  FOREIGN KEY (run_id,telegram_id)
    REFERENCES nbg_london_runs(run_id,telegram_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK(strftime('%Y-%m-%d',finished_at_ms/1000,'unixepoch')=day_key)
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_verified_owner_day_best
  ON nbg_london_verified_runs(telegram_id,day_key,verified_xp DESC,finished_at_ms ASC);

-- UNIQUE replay_sha256 blocks a previously accepted identical byte stream
-- across different sessions/accounts. UNIQUE input_sha256 additionally blocks
-- simple timing-only edits to the very same control sequence. Both are
-- atomic with the finished-session claim; a collision rolls back the run.
-- These checks are replay-reuse defenses, NOT proof against newly generated
-- automated input. Per-session game-state challenge binding remains a
-- separately reviewed extension, and Clout activation remains gated.

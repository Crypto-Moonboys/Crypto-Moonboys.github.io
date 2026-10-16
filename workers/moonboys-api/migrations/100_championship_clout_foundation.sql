-- Issue #1530 PR1: additive foundation for non-spendable Championship Clout.
-- This does NOT award Clout; a future receipt-verified adapter alone may write.
-- Does not alter Arcade XP, Community XP, Moonpet XP, faction clout or wallets.
-- Do not apply remotely until reviewed, backed up and explicitly approved.
--
-- A source_event_id MUST be unique to the accepted user's qualifying source
-- event. A shared boss/event must use its PER-OWNER accepted receipt, never its
-- global event identifier, to avoid falsely treating multiple owners as one.
CREATE TABLE IF NOT EXISTS championship_clout_effects (
  source_system TEXT NOT NULL CHECK(length(source_system) BETWEEN 1 AND 64),
  source_event_id TEXT NOT NULL CHECK(length(source_event_id) BETWEEN 1 AND 180),
  effect_kind TEXT NOT NULL
    CHECK(effect_kind IN ('skill','mission','variety','community','streak')),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 48),
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id),
  verification_kind TEXT NOT NULL
    CHECK(verification_kind IN ('server_receipt','server_replay','server_settlement')),
  earned_at_ms INTEGER NOT NULL CHECK(earned_at_ms >= 1704067200000),
  verified_at_ms INTEGER NOT NULL CHECK(verified_at_ms >= 1704067200000 AND verified_at_ms >= earned_at_ms),
  day_key TEXT NOT NULL CHECK(length(day_key)=10),
  game_key TEXT CHECK(game_key IS NULL OR length(game_key) BETWEEN 1 AND 64),
  source_pet_id TEXT,
  normalized_skill INTEGER CHECK(normalized_skill BETWEEN 0 AND 100),
  fixed_points INTEGER CHECK(fixed_points BETWEEN 0 AND 25),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 1704067200000),
  PRIMARY KEY (source_system, source_event_id, effect_kind, policy_version),
  CHECK (
    (effect_kind = 'skill' AND game_key IS NOT NULL
      AND normalized_skill IS NOT NULL AND fixed_points IS NULL)
    OR
    (effect_kind = 'variety' AND game_key IS NOT NULL
      AND normalized_skill IS NULL AND fixed_points IS NULL)
    OR
    (effect_kind IN ('mission','community','streak') AND normalized_skill IS NULL
      AND fixed_points IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_championship_clout_effect_owner_day
  ON championship_clout_effects (telegram_id, day_key, policy_version);
CREATE INDEX IF NOT EXISTS idx_championship_clout_effect_day
  ON championship_clout_effects (day_key, policy_version, effect_kind);
CREATE INDEX IF NOT EXISTS idx_championship_clout_effect_source
  ON championship_clout_effects (source_system, telegram_id, earned_at_ms);

-- Materialized daily snapshot computed only from trusted effects above.
-- A later guarded adapter must recalculate this in a D1 transaction; never
-- increment total_points by client-provided or repeated deltas.
CREATE TABLE IF NOT EXISTS championship_clout_daily (
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id),
  day_key TEXT NOT NULL CHECK(length(day_key)=10),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 48),
  skill_points INTEGER NOT NULL DEFAULT 0 CHECK(skill_points BETWEEN 0 AND 40),
  mission_points INTEGER NOT NULL DEFAULT 0 CHECK(mission_points BETWEEN 0 AND 25),
  variety_points INTEGER NOT NULL DEFAULT 0 CHECK(variety_points BETWEEN 0 AND 15),
  community_points INTEGER NOT NULL DEFAULT 0 CHECK(community_points BETWEEN 0 AND 10),
  streak_points INTEGER NOT NULL DEFAULT 0 CHECK(streak_points BETWEEN 0 AND 10),
  total_points INTEGER NOT NULL DEFAULT 0 CHECK(total_points BETWEEN 0 AND 100),
  game_keys_json TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid(game_keys_json) AND json_type(game_keys_json)='array'),
  first_earned_at_ms INTEGER NOT NULL CHECK(first_earned_at_ms >= 1704067200000),
  recalculated_at_ms INTEGER NOT NULL CHECK(recalculated_at_ms >= 1704067200000),
  PRIMARY KEY (telegram_id, day_key, policy_version),
  CHECK(total_points = skill_points + mission_points + variety_points +
    community_points + streak_points)
);
CREATE INDEX IF NOT EXISTS idx_championship_clout_daily_period
  ON championship_clout_daily (policy_version, day_key, total_points DESC, telegram_id);

-- Immutable period snapshot is a *future* release step. PR1 has no freezing
-- scheduler or payout job; no Worker code writes this table.
CREATE TABLE IF NOT EXISTS championship_clout_archives (
  period_kind TEXT NOT NULL
    CHECK(period_kind IN ('daily','weekly','quarterly','annual')),
  period_key TEXT NOT NULL CHECK(length(period_key) BETWEEN 4 AND 20),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 48),
  period_start_ms INTEGER NOT NULL,
  period_end_ms INTEGER NOT NULL,
  frozen_at_ms INTEGER NOT NULL,
  standings_json TEXT NOT NULL
    CHECK(json_valid(standings_json) AND json_type(standings_json)='array'),
  PRIMARY KEY (period_kind, period_key, policy_version),
  CHECK(period_end_ms > period_start_ms),
  CHECK(frozen_at_ms >= period_end_ms)
);

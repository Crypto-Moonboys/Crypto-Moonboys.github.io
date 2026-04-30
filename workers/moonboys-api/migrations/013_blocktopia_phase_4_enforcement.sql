-- Migration 013: Block Topia Phase 4 enforcement state
-- Adds PPS, cooldown tracking, and mini-game anti-farm telemetry.
--
-- Production safety notes:
-- * SQLite/D1 does not support "ALTER TABLE … ADD COLUMN IF NOT EXISTS".
-- * If any of these columns already exist (e.g. because schema.sql was used to bootstrap
--   the live DB), the statements below will fail with "duplicate column name".
-- * That error is expected and safe to ignore on repeat runs.
-- * To check before running:
--   SELECT player_pressure_score, pps_updated_at, cooldown_strikes,
--          last_cooldown_at, mini_game_skip_count, mini_game_last_played,
--          mini_game_entropy_seed
--   FROM blocktopia_progression LIMIT 1;

ALTER TABLE blocktopia_progression ADD COLUMN player_pressure_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN pps_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE blocktopia_progression ADD COLUMN cooldown_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN last_cooldown_at DATETIME;
ALTER TABLE blocktopia_progression ADD COLUMN mini_game_skip_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN mini_game_last_played TEXT;
ALTER TABLE blocktopia_progression ADD COLUMN mini_game_entropy_seed INTEGER NOT NULL DEFAULT 0;

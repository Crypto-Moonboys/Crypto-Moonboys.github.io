-- Migration 013: Block Topia Phase 4 enforcement state
-- Adds PPS, cooldown tracking, and mini-game anti-farm telemetry.

ALTER TABLE blocktopia_progression ADD COLUMN player_pressure_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN pps_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE blocktopia_progression ADD COLUMN cooldown_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN last_cooldown_at DATETIME;
ALTER TABLE blocktopia_progression ADD COLUMN mini_game_skip_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN mini_game_last_played TEXT;
ALTER TABLE blocktopia_progression ADD COLUMN mini_game_entropy_seed INTEGER NOT NULL DEFAULT 0;

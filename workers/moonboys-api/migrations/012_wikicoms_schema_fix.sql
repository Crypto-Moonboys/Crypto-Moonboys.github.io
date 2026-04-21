-- Migration 012: Production-safe wikicoms schema compatibility fix.
--
-- Required to align live blocktopia_progression with worker expectations.
-- Idempotent-safe for repeat runs using IF NOT EXISTS guards.

ALTER TABLE blocktopia_progression ADD COLUMN IF NOT EXISTS faction TEXT DEFAULT 'unaligned';
ALTER TABLE blocktopia_progression ADD COLUMN IF NOT EXISTS faction_xp INTEGER DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN IF NOT EXISTS faction_last_switch TEXT;

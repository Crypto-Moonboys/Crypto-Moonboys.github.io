-- Migration 012: ensure optional Block Topia progression faction columns exist.
-- Safe to run multiple times because each ALTER uses IF NOT EXISTS.

ALTER TABLE blocktopia_progression ADD COLUMN IF NOT EXISTS faction TEXT DEFAULT 'unaligned';
ALTER TABLE blocktopia_progression ADD COLUMN IF NOT EXISTS faction_xp INTEGER DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN IF NOT EXISTS faction_last_switch TEXT;

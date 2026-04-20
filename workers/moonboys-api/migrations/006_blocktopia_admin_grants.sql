-- Add audit fields for admin-authored Block Topia progression events.
ALTER TABLE blocktopia_progression_events ADD COLUMN admin_telegram_id TEXT;
ALTER TABLE blocktopia_progression_events ADD COLUMN reason TEXT;

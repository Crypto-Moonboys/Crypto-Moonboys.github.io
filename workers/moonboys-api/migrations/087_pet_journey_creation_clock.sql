-- Preserve the evidence numbering of every existing pet. New pet creation
-- explicitly writes created_at; its Journey weeks start on its saved UTC day.
-- No ownership, XP, event, Crest or receipt is rewritten.
ALTER TABLE telegram_pet_season_slots ADD COLUMN journey_clock TEXT NOT NULL
  DEFAULT 'legacy_quarter' CHECK (journey_clock IN ('legacy_quarter', 'created_at'));

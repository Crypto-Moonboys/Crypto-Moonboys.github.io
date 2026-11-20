-- Versioned state for operations that do not use the original mining fields.
ALTER TABLE clan_operation_days ADD COLUMN operation_state TEXT NOT NULL DEFAULT '{}';

-- Keep the version 1 mining trigger and historical receipts intact.
CREATE TRIGGER clan_operation_award_at_wall_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.faction_id = 'graffpunks' AND NEW.rules_version = 2
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'wall-v2-' || NEW.route_index || '-' || NEW.tier, NEW.updated_at);
END;

-- The previous row contains the verified performance style for the set.
CREATE TRIGGER clan_operation_award_at_spotlight_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.faction_id = 'blockstars' AND NEW.rules_version = 8
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'spotlight-v8-' || NEW.route_index || '-' || NEW.tier || '-' ||
        CASE WHEN json_extract(OLD.operation_state, '$.style') = 'freestyle' THEN 'freestyle' ELSE 'headliner' END,
      NEW.updated_at);
END;

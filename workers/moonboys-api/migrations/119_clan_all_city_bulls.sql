-- District holds use the existing atomic daily Renown and collectible ledger.
CREATE TRIGGER clan_operation_award_at_district_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.faction_id = 'all-city-bulls' AND NEW.rules_version = 4
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'district-v4-' || NEW.route_index || '-' || NEW.tier, NEW.updated_at);
END;

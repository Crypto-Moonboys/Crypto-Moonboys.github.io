-- Verified signals use the existing atomic daily Renown and collectible ledger.
CREATE TRIGGER clan_operation_award_at_signal_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.faction_id = 'crypto-moongirls' AND NEW.rules_version = 5
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'signal-v5-' || NEW.route_index || '-' || NEW.tier, NEW.updated_at);
END;

-- Nomad Bears use the shared versioned state and bank into the same ledger.
CREATE TRIGGER clan_operation_award_at_trail_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.faction_id = 'nomad-bears' AND NEW.rules_version = 3
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'trail-v3-' || NEW.route_index || '-' || NEW.tier, NEW.updated_at);
END;

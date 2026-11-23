-- Read the completed chain grade from the previous row as the Worker banks it.
CREATE TRIGGER clan_operation_award_at_burst_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.faction_id = 'blockchain-furies' AND NEW.rules_version = 7
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'burst-v7-' || NEW.route_index || '-' || NEW.tier || '-' ||
        CASE WHEN json_extract(OLD.operation_state, '$.comeback') = 1 THEN 'comeback' ELSE 'clean' END,
      NEW.updated_at);
END;

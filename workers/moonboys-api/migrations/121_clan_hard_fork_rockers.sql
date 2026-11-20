-- The previous row contains the completed fork chosen by the Worker.
CREATE TRIGGER clan_operation_award_at_fork_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.faction_id = 'hard-fork-rockers' AND NEW.rules_version = 6
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'fork-v6-' || NEW.route_index || '-' || NEW.tier || '-' ||
        CASE WHEN json_extract(OLD.operation_state, '$.fork') = 'edge' THEN 'edge' ELSE 'stable' END,
      NEW.updated_at);
END;

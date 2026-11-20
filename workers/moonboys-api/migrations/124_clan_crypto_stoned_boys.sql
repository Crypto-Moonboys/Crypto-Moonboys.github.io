-- The previous row records a verified outcome and the artifact grade.
CREATE TRIGGER clan_operation_award_at_chaos_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.faction_id = 'crypto-stoned-boys' AND NEW.rules_version = 9
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'chaos-v9-' || NEW.route_index || '-' || NEW.tier || '-' || json_extract(OLD.operation_state, '$.grade'),
      NEW.updated_at);
END;

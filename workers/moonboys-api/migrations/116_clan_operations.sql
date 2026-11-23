-- One account/day route. Renown and specimen receipts are inserted by the
-- same SQLite statement that advances a tier.
CREATE TABLE clan_operation_days (
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  faction_id TEXT NOT NULL,
  rules_version INTEGER NOT NULL,
  route_index INTEGER NOT NULL CHECK (route_index BETWEEN 0 AND 2),
  revision INTEGER NOT NULL DEFAULT 0,
  tier INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 3),
  ore INTEGER NOT NULL DEFAULT 0 CHECK (ore BETWEEN 0 AND 8),
  braced INTEGER NOT NULL DEFAULT 0 CHECK (braced IN (0, 1)),
  collapsed INTEGER NOT NULL DEFAULT 0 CHECK (collapsed IN (0, 1)),
  last_action TEXT,
  last_outcome TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (telegram_id, utc_day)
);

CREATE TABLE clan_operation_awards (
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  faction_id TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 3),
  renown INTEGER NOT NULL CHECK (renown > 0),
  specimen_key TEXT NOT NULL,
  awarded_at TEXT NOT NULL,
  PRIMARY KEY (telegram_id, utc_day, tier),
  FOREIGN KEY (telegram_id, utc_day) REFERENCES clan_operation_days (telegram_id, utc_day)
);

CREATE INDEX clan_operation_awards_crew_day
  ON clan_operation_awards (faction_id, utc_day);

CREATE TRIGGER clan_operation_award_at_bank
AFTER UPDATE OF tier ON clan_operation_days
WHEN NEW.tier = OLD.tier + 1 AND NEW.rules_version = 1
BEGIN
  INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
  VALUES
    (NEW.telegram_id, NEW.utc_day, NEW.faction_id, NEW.tier, 10000,
      'mine-v1-' || NEW.route_index || '-' || NEW.tier, NEW.updated_at);
END;

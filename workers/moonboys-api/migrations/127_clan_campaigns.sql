CREATE TABLE clan_campaigns (
  season_id INTEGER PRIMARY KEY REFERENCES telegram_seasons(id),
  starts_on TEXT NOT NULL,
  ends_before TEXT NOT NULL,
  plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
  CHECK (starts_on < ends_before)
);

CREATE TABLE clan_campaign_window_results (
  season_id INTEGER NOT NULL REFERENCES clan_campaigns(season_id),
  window_id TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_before TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  progress_json TEXT NOT NULL CHECK (json_valid(progress_json)),
  eligible_factions_json TEXT NOT NULL CHECK (json_valid(eligible_factions_json)),
  collectible TEXT,
  PRIMARY KEY (season_id, window_id),
  CHECK (starts_on < ends_before)
);

CREATE TABLE clan_campaign_collectible_receipts (
  season_id INTEGER NOT NULL,
  window_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  collectible TEXT NOT NULL,
  PRIMARY KEY (season_id, window_id, telegram_id),
  FOREIGN KEY (season_id, window_id) REFERENCES clan_campaign_window_results (season_id, window_id)
);

CREATE INDEX clan_campaign_collectible_receipts_owner
  ON clan_campaign_collectible_receipts (telegram_id, season_id);

CREATE TRIGGER clan_campaign_grant_collectible
AFTER INSERT ON clan_campaign_window_results
WHEN NEW.collectible IS NOT NULL
BEGIN
  INSERT INTO clan_campaign_collectible_receipts (season_id, window_id, telegram_id, collectible)
  SELECT DISTINCT NEW.season_id, NEW.window_id, bank.telegram_id, NEW.collectible
  FROM json_each(NEW.eligible_factions_json) AS eligible
  JOIN clan_operation_awards AS bank ON bank.faction_id = eligible.value
    AND bank.utc_day >= NEW.starts_on AND bank.utc_day < NEW.ends_before
  JOIN clan_crew_roster_entries AS roster ON roster.telegram_id = bank.telegram_id
    AND roster.faction_id = bank.faction_id
    AND roster.week_start = date(NEW.starts_on, '-6 days', 'weekday 1');
END;

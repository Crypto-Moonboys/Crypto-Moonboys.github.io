CREATE TABLE clan_crew_roster_entries (
  week_start TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  faction_id TEXT NOT NULL,
  PRIMARY KEY (week_start, telegram_id)
);

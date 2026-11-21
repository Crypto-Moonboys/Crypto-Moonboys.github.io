CREATE TABLE clan_period_results (
  kind TEXT NOT NULL CHECK (kind IN ('weekly', 'monthly', 'seasonal')),
  period_key TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_before TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  standings_json TEXT NOT NULL CHECK (json_valid(standings_json)),
  PRIMARY KEY (kind, period_key),
  CHECK (starts_on < ends_before)
);

CREATE TABLE clan_period_reward_receipts (
  kind TEXT NOT NULL,
  period_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  faction_id TEXT NOT NULL,
  PRIMARY KEY (kind, period_key, telegram_id, faction_id),
  FOREIGN KEY (kind, period_key) REFERENCES clan_period_results (kind, period_key)
);

CREATE INDEX clan_period_reward_receipts_owner
  ON clan_period_reward_receipts (telegram_id, kind, period_key);

-- The final snapshot and every earned entitlement commit in one statement.
CREATE TRIGGER clan_period_grant_rewards
AFTER INSERT ON clan_period_results
BEGIN
  INSERT INTO clan_period_reward_receipts (kind, period_key, telegram_id, faction_id)
  SELECT DISTINCT NEW.kind, NEW.period_key, roster.telegram_id, roster.faction_id
  FROM json_each(NEW.standings_json) AS standings
  JOIN clan_crew_roster_entries AS roster
    ON roster.faction_id = json_extract(standings.value, '$.faction_id')
  WHERE json_extract(standings.value, '$.rank') = 1
    AND roster.week_start >= date(NEW.starts_on, '-6 days')
    AND roster.week_start < NEW.ends_before
    AND EXISTS (
      SELECT 1 FROM clan_operation_awards AS bank
      WHERE bank.telegram_id = roster.telegram_id AND bank.faction_id = roster.faction_id
        AND bank.utc_day >= MAX(NEW.starts_on, roster.week_start)
        AND bank.utc_day < MIN(NEW.ends_before, date(roster.week_start, '+7 days'))
    );
END;

CREATE INDEX clan_operation_awards_signal_time
  ON clan_operation_awards (awarded_at);

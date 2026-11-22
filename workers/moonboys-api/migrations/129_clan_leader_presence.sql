CREATE TABLE IF NOT EXISTS clan_leader_slowdowns (
  account_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  target_faction TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('talk', 'paid')),
  option_id TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK (ends_at > starts_at AND ends_at <= starts_at + 86400),
  available_at INTEGER NOT NULL CHECK (available_at >= ends_at),
  talk_day INTEGER,
  currency TEXT CHECK (currency IN ('xp', 'gems')),
  cost INTEGER NOT NULL,
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, talk_day),
  CHECK ((kind = 'talk' AND talk_day IS NOT NULL AND currency IS NULL AND cost = 0)
    OR (kind = 'paid' AND talk_day IS NULL AND currency IS NOT NULL AND cost > 0))
);

CREATE INDEX IF NOT EXISTS clan_leader_slowdowns_target ON clan_leader_slowdowns (target_faction, available_at);

CREATE TRIGGER IF NOT EXISTS clan_leader_slowdown_spend
AFTER INSERT ON clan_leader_slowdowns
WHEN NEW.kind = 'paid'
BEGIN
  UPDATE blocktopia_progression
  SET xp = xp - CASE WHEN NEW.currency = 'xp' THEN NEW.cost ELSE 0 END,
      gems = gems - CASE WHEN NEW.currency = 'gems' THEN NEW.cost ELSE 0 END,
      updated_at = strftime('%Y-%m-%d %H:%M:%S', NEW.starts_at, 'unixepoch')
  WHERE telegram_id = NEW.account_id
    AND ((NEW.currency = 'xp' AND xp >= NEW.cost) OR (NEW.currency = 'gems' AND gems >= NEW.cost));
  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'clan_leader_insufficient_balance') END;
  INSERT INTO blocktopia_progression_events (id, telegram_id, action, action_type, xp_change, gems_change, reason, created_at)
  VALUES ('clan-leader:' || NEW.account_id || ':' || NEW.request_id, NEW.account_id,
    'clan_leader_slowdown', NEW.option_id,
    CASE WHEN NEW.currency = 'xp' THEN -NEW.cost ELSE 0 END,
    CASE WHEN NEW.currency = 'gems' THEN -NEW.cost ELSE 0 END,
    NEW.target_faction, strftime('%Y-%m-%d %H:%M:%S', NEW.starts_at, 'unixepoch'));
END;

CREATE TABLE IF NOT EXISTS clan_leader_rounds (
  faction_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  site_path TEXT NOT NULL,
  PRIMARY KEY (faction_id, slot)
);

CREATE INDEX IF NOT EXISTS clan_leader_rounds_by_slot ON clan_leader_rounds (slot);

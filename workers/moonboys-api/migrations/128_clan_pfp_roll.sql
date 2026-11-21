CREATE TABLE clan_pfp_rounds (
  utc_day TEXT PRIMARY KEY NOT NULL,
  round_json TEXT NOT NULL CHECK (json_valid(round_json))
);

CREATE TABLE clan_pfp_rolls (
  telegram_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  utc_day TEXT NOT NULL REFERENCES clan_pfp_rounds(utc_day),
  roll_number INTEGER NOT NULL CHECK (roll_number > 0),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (telegram_id, request_id),
  UNIQUE (telegram_id, utc_day, roll_number)
);

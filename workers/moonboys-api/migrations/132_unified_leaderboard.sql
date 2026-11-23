-- Ranking-only points. These tables do not change XP balances or native prizes.
CREATE TABLE unified_leaderboard_epoch (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  starts_at TEXT NOT NULL
);
INSERT INTO unified_leaderboard_epoch VALUES (1, strftime('%Y-%m-%dT00:00:00.000Z','now','+1 day'));

CREATE TABLE unified_leaderboard_periods (
  kind TEXT NOT NULL CHECK (kind IN ('daily','weekly','monthly','seasonal')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  policy_version INTEGER NOT NULL,
  closed_at TEXT NOT NULL,
  close_token TEXT NOT NULL,
  PRIMARY KEY (kind, starts_at)
);
CREATE INDEX unified_leaderboard_period_end ON unified_leaderboard_periods (kind, ends_at);

CREATE TABLE unified_leaderboard_results (
  kind TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global','factions','games','clan-players','no-clan')),
  category TEXT NOT NULL,
  entrant TEXT NOT NULL,
  base_points INTEGER NOT NULL CHECK (base_points >= 0),
  bonus_points INTEGER NOT NULL CHECK (bonus_points >= 0),
  rank INTEGER NOT NULL CHECK (rank > 0),
  award_points INTEGER NOT NULL CHECK (award_points >= 0),
  breakdown TEXT NOT NULL CHECK (json_valid(breakdown)),
  clan_perk TEXT CHECK (clan_perk IS NULL OR (clan_perk IN ('rally','relay','supply')
    AND kind = 'weekly' AND scope = 'factions' AND base_points > 0)),
  PRIMARY KEY (kind, starts_at, scope, category, entrant),
  FOREIGN KEY (kind, starts_at) REFERENCES unified_leaderboard_periods (kind, starts_at) ON DELETE CASCADE
);
CREATE INDEX unified_leaderboard_result_rank
  ON unified_leaderboard_results (kind, starts_at, scope, category, rank, entrant);

-- Exactly one source for the rank, selection and level shown on both boards.
CREATE VIEW unified_weekly_clan_perks AS
SELECT date(p.ends_at) AS week_start, r.entrant AS faction, r.rank,
       10-r.rank AS level, r.clan_perk AS perk
FROM unified_leaderboard_periods p
JOIN unified_leaderboard_results r ON r.kind=p.kind AND r.starts_at=p.starts_at
WHERE p.kind='weekly' AND r.scope='factions' AND r.category=''
  AND r.clan_perk IS NOT NULL AND r.rank BETWEEN 1 AND 9;

CREATE INDEX IF NOT EXISTS idx_unified_arcade_time ON arcade_progression_events (processed_at);
CREATE INDEX IF NOT EXISTS idx_unified_nbg_finish ON nbg_london_runs (finished_at_ms) WHERE finish_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_pet_day ON telegram_pet_events (day_key) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_unified_signal_day ON daily_wtf_player_events (utc_day) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_unified_community_time ON telegram_community_xp_awards (earned_at);
CREATE INDEX IF NOT EXISTS idx_unified_tag_day ON tag_run_messages (day_key);
CREATE INDEX IF NOT EXISTS idx_unified_bank_day ON clan_operation_awards (utc_day);
CREATE INDEX IF NOT EXISTS idx_unified_blocktopia_time ON blocktopia_progression_events (created_at) WHERE action = 'mini_game_win';

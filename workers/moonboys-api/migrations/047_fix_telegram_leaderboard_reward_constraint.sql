-- Restore the composite uniqueness required by awardPetReward()'s leaderboard
-- upsert. Existing rows are preserved. Duplicate rows intentionally make this
-- migration fail so production data is never merged or deleted implicitly.

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_leaderboard_unique_user_season
  ON telegram_leaderboard(telegram_id, season_id);

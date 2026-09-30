-- Moonpet Mini App state hot-path indexes.
-- These are additive only: no gameplay data or authority is rewritten.

-- Care/work/trade/adventure cooldowns and grouped recent-action reads all start
-- with the same owner + event type + status predicate and then need the newest
-- accepted row.
CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_type_status_created
  ON telegram_pet_events(telegram_id, event_type, status, created_at DESC);

-- Mini App state reads the latest completed Arena/Kaiju result for either
-- participant. Separate participant indexes let SQLite use its OR optimization
-- instead of scanning combat history as those ledgers grow.
CREATE INDEX IF NOT EXISTS idx_pet_arena_battles_p1_status_completed
  ON telegram_pet_arena_battles(player1_telegram_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_arena_battles_p2_status_completed
  ON telegram_pet_arena_battles(player2_telegram_id, status, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pet_kaiju_matches_p1_status_completed
  ON telegram_pet_kaiju_matches(player1_telegram_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_kaiju_matches_p2_status_completed
  ON telegram_pet_kaiju_matches(player2_telegram_id, status, completed_at DESC);

-- Restore the idempotency keys required by Pet Jobs and Pet Events.
-- Explicit indexes repair databases whose tables predate the inline UNIQUE
-- declarations without rebuilding either event ledger or touching player rows.

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_events_owner_event_key_unique
  ON telegram_pet_events (telegram_id, event_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_runtime_events_owner_event_key_unique
  ON telegram_pet_runtime_events (telegram_id, event_key);

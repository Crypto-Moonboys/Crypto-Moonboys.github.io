-- Bounded Moonpet reward-settlement authority.
-- Nullable preserves only pre-cutover legacy claims; new pet-authority claims
-- persist the immutable participating instance on both settlement ledgers.

ALTER TABLE telegram_pet_reward_claims ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_events ADD COLUMN pet_id TEXT;

CREATE INDEX IF NOT EXISTS idx_telegram_pet_reward_claims_pet
  ON telegram_pet_reward_claims(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_pet_day
  ON telegram_pet_events(pet_id, day_key, status);

-- Permanent, immutable-at-rest snapshots for server-completed Legendary pets.
-- No backfill is performed: entry is an explicit server-authoritative action.
CREATE TABLE IF NOT EXISTS telegram_pet_sanctuary (
  sanctuary_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  original_season_key TEXT NOT NULL,
  completed_at DATETIME NOT NULL,
  entered_sanctuary_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  species TEXT NOT NULL,
  variant TEXT,
  stage TEXT NOT NULL,
  legendary_evolution_id TEXT NOT NULL,
  identity_snapshot_json TEXT NOT NULL,
  cosmetic_snapshot_json TEXT NOT NULL,
  trait_snapshot_json TEXT NOT NULL,
  memory_snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'resident',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

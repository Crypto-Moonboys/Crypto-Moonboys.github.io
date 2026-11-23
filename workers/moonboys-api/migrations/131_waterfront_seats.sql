CREATE TABLE IF NOT EXISTS waterfront_seats (
  faction_id TEXT PRIMARY KEY CHECK (faction_id IN (
    'all-city-bulls', 'nomad-bears', 'hard-fork-rockers', 'rugpull-miners', 'crypto-moongirls',
    'blockchain-furies', 'graffpunks', 'crypto-stoned-boys', 'blockstars'
  )),
  telegram_id TEXT NOT NULL UNIQUE,
  lease_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;

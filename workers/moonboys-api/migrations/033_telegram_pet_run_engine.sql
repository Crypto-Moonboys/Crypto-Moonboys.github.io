-- Crypto Moonboy Pets: persistent Pet Run Engine v1.

CREATE TABLE IF NOT EXISTS telegram_pet_runs (
  id                       TEXT PRIMARY KEY,
  telegram_id              TEXT NOT NULL,
  run_id                   TEXT NOT NULL,
  season_key               TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extractable', 'completed', 'failed', 'extracted')),
  depth                    INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  max_depth                INTEGER NOT NULL DEFAULT 5 CHECK (max_depth >= 1),
  risk_level               INTEGER NOT NULL DEFAULT 1 CHECK (risk_level >= 1),
  unbanked_pet_xp          INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_pet_xp >= 0),
  unbanked_moon_gold       INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_moon_gold >= 0),
  unbanked_moon_crystals   INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_moon_crystals >= 0),
  unbanked_style_tokens    INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_style_tokens >= 0),
  unbanked_items           TEXT NOT NULL DEFAULT '{}',
  started_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at             DATETIME,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id),
  UNIQUE(telegram_id, run_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_runs_one_open
  ON telegram_pet_runs(telegram_id)
  WHERE status IN ('active', 'extractable');

CREATE INDEX IF NOT EXISTS idx_telegram_pet_runs_user_status
  ON telegram_pet_runs(telegram_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_run_steps (
  id                       TEXT PRIMARY KEY,
  telegram_id              TEXT NOT NULL,
  run_id                   TEXT NOT NULL,
  step_index               INTEGER NOT NULL CHECK (step_index >= 1),
  choice_key               TEXT NOT NULL,
  choice_type              TEXT NOT NULL,
  event_key                TEXT NOT NULL,
  success                  INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
  risk_roll                REAL NOT NULL DEFAULT 0,
  pet_xp_delta             INTEGER NOT NULL DEFAULT 0,
  moon_gold_delta          INTEGER NOT NULL DEFAULT 0,
  moon_crystals_delta      INTEGER NOT NULL DEFAULT 0,
  style_tokens_delta       INTEGER NOT NULL DEFAULT 0,
  item_key                 TEXT,
  metadata                 TEXT,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, event_key),
  UNIQUE(run_id, step_index),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_steps_run
  ON telegram_pet_run_steps(run_id, step_index);

CREATE TABLE IF NOT EXISTS telegram_pet_effects (
  id          TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  effect_key  TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'pet_run',
  metadata    TEXT,
  expires_at  DATETIME,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_effects_user_effect
  ON telegram_pet_effects(telegram_id, effect_key, expires_at);

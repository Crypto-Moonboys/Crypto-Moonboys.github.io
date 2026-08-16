-- Per-pet Moonpet state foundation. Gameplay continues to use the legacy
-- telegram_pet_profiles row until a later migration enables pet switching.

CREATE TABLE IF NOT EXISTS telegram_pet_instances (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
  pet_name TEXT NOT NULL DEFAULT 'Moonpet',
  species TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'egg',
  pet_xp INTEGER NOT NULL DEFAULT 0 CHECK (pet_xp >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  hunger INTEGER NOT NULL DEFAULT 25 CHECK (hunger BETWEEN 0 AND 100),
  happiness INTEGER NOT NULL DEFAULT 70 CHECK (happiness BETWEEN 0 AND 100),
  cleanliness INTEGER NOT NULL DEFAULT 70 CHECK (cleanliness BETWEEN 0 AND 100),
  energy INTEGER NOT NULL DEFAULT 70 CHECK (energy BETWEEN 0 AND 100),
  health INTEGER NOT NULL DEFAULT 75 CHECK (health BETWEEN 0 AND 100),
  streak_days INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  moon_gold INTEGER NOT NULL DEFAULT 0 CHECK (moon_gold >= 0),
  moon_crystals INTEGER NOT NULL DEFAULT 0 CHECK (moon_crystals >= 0),
  style_tokens INTEGER NOT NULL DEFAULT 0 CHECK (style_tokens >= 0),
  equipped_food TEXT,
  equipped_toy TEXT,
  equipped_outfit TEXT,
  equipped_armor TEXT,
  equipped_weapon TEXT,
  equipped_charm TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'archived')),
  last_active_day TEXT,
  last_decay_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_profile_updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, season_key, slot_number),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_season_slots(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_instances_owner_season_slot
  ON telegram_pet_instances(telegram_id, season_key, slot_number);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_instances_season_status_pet_xp
  ON telegram_pet_instances(season_key, status, pet_xp DESC);

INSERT OR IGNORE INTO telegram_pet_instances (
  pet_id, telegram_id, season_key, slot_number, pet_name, species, stage,
  pet_xp, level, hunger, happiness, cleanliness, energy, health, streak_days,
  moon_gold, moon_crystals, style_tokens, equipped_food, equipped_toy,
  equipped_outfit, equipped_armor, equipped_weapon, equipped_charm, status,
  last_active_day, last_decay_at, source_profile_updated_at, created_at, updated_at
)
SELECT
  s.pet_id, s.telegram_id, s.season_key, s.slot_number, p.pet_name, p.species,
  p.stage, p.pet_xp, p.level, p.hunger, p.happiness, p.cleanliness, p.energy,
  p.health, p.streak_days, p.moon_gold, p.moon_crystals, p.style_tokens,
  p.equipped_food, p.equipped_toy, p.equipped_outfit, p.equipped_armor,
  p.equipped_weapon, p.equipped_charm, s.status, p.last_active_day,
  p.last_decay_at, p.updated_at, p.created_at, p.updated_at
FROM telegram_pet_season_slots s
JOIN telegram_pet_profiles p ON p.telegram_id = s.telegram_id
WHERE s.slot_number = 1 AND s.status = 'active';

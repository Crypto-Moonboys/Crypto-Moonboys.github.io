-- Rebuild evolution tables so the new Legendary stage 5 can persist. D1 does
-- not support altering CHECK constraints in place. Copy every historical row.
CREATE TABLE telegram_pet_evolutions_stage5 (
  telegram_id TEXT NOT NULL,
  evolution_id TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 0 AND 5),
  unlock_event_key TEXT NOT NULL,
  cosmetic_unlocks TEXT NOT NULL DEFAULT '[]',
  achievement_unlocks TEXT NOT NULL DEFAULT '[]',
  materials_consumed INTEGER NOT NULL DEFAULT 0 CHECK (materials_consumed IN (0, 1)),
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, evolution_id),
  UNIQUE (telegram_id, stage),
  UNIQUE (telegram_id, unlock_event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
INSERT INTO telegram_pet_evolutions_stage5
SELECT telegram_id, evolution_id,
  CASE WHEN evolution_id = 'legendary_moon_guardian' AND stage = 4 THEN 5 ELSE stage END,
  unlock_event_key, cosmetic_unlocks, achievement_unlocks, materials_consumed, unlocked_at
FROM telegram_pet_evolutions;
DROP TABLE telegram_pet_evolutions;
ALTER TABLE telegram_pet_evolutions_stage5 RENAME TO telegram_pet_evolutions;

CREATE TABLE telegram_pet_evolutions_by_pet_stage5 (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  evolution_id TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 0 AND 5),
  unlock_event_key TEXT NOT NULL,
  cosmetic_unlocks TEXT NOT NULL DEFAULT '[]',
  achievement_unlocks TEXT NOT NULL DEFAULT '[]',
  materials_consumed INTEGER NOT NULL DEFAULT 0 CHECK (materials_consumed IN (0, 1)),
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, evolution_id),
  UNIQUE (pet_id, stage),
  UNIQUE (pet_id, unlock_event_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
INSERT INTO telegram_pet_evolutions_by_pet_stage5
SELECT pet_id, telegram_id, evolution_id,
  CASE WHEN evolution_id = 'legendary_moon_guardian' AND stage = 4 THEN 5 ELSE stage END,
  unlock_event_key, cosmetic_unlocks, achievement_unlocks, materials_consumed, unlocked_at
FROM telegram_pet_evolutions_by_pet;
DROP TABLE telegram_pet_evolutions_by_pet;
ALTER TABLE telegram_pet_evolutions_by_pet_stage5 RENAME TO telegram_pet_evolutions_by_pet;

CREATE INDEX idx_pet_evolutions_by_pet_owner ON telegram_pet_evolutions_by_pet(telegram_id, stage DESC, unlocked_at DESC);
CREATE INDEX idx_pet_evolutions_by_pet_stage ON telegram_pet_evolutions_by_pet(stage, unlocked_at DESC);

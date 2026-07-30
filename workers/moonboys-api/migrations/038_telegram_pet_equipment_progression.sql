-- Crypto Moonboys Pets equipment utility, levels and mastery progression.

CREATE TABLE IF NOT EXISTS telegram_pet_equipment_progression (
  telegram_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  slot TEXT NOT NULL,
  item_level INTEGER NOT NULL DEFAULT 1 CHECK (item_level BETWEEN 1 AND 10),
  item_xp INTEGER NOT NULL DEFAULT 0 CHECK (item_xp >= 0),
  mastery_xp INTEGER NOT NULL DEFAULT 0 CHECK (mastery_xp >= 0),
  mastery_tier INTEGER NOT NULL DEFAULT 0 CHECK (mastery_tier BETWEEN 0 AND 5),
  unlocked_effects_json TEXT NOT NULL DEFAULT '{}',
  last_used_action TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_pet_equipment_progression_owner_slot
  ON telegram_pet_equipment_progression (telegram_id, slot, item_level DESC, mastery_tier DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_equipment_events (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  action TEXT NOT NULL,
  event_key TEXT NOT NULL,
  item_xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (item_xp_awarded >= 0),
  mastery_xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (mastery_xp_awarded >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_pet_equipment_events_owner_item_created
  ON telegram_pet_equipment_events (telegram_id, item_key, created_at DESC);

-- Seed progression rows from currently equipped items without inventing ownership.
INSERT OR IGNORE INTO telegram_pet_equipment_progression (telegram_id, item_key, slot)
SELECT telegram_id, equipped_food, 'food' FROM telegram_pet_profiles WHERE equipped_food IS NOT NULL AND equipped_food <> '';
INSERT OR IGNORE INTO telegram_pet_equipment_progression (telegram_id, item_key, slot)
SELECT telegram_id, equipped_toy, 'toy' FROM telegram_pet_profiles WHERE equipped_toy IS NOT NULL AND equipped_toy <> '';
INSERT OR IGNORE INTO telegram_pet_equipment_progression (telegram_id, item_key, slot)
SELECT telegram_id, equipped_outfit, 'outfit' FROM telegram_pet_profiles WHERE equipped_outfit IS NOT NULL AND equipped_outfit <> '';
INSERT OR IGNORE INTO telegram_pet_equipment_progression (telegram_id, item_key, slot)
SELECT telegram_id, equipped_armor, 'armor' FROM telegram_pet_profiles WHERE equipped_armor IS NOT NULL AND equipped_armor <> '';
INSERT OR IGNORE INTO telegram_pet_equipment_progression (telegram_id, item_key, slot)
SELECT telegram_id, equipped_weapon, 'weapon' FROM telegram_pet_profiles WHERE equipped_weapon IS NOT NULL AND equipped_weapon <> '';
INSERT OR IGNORE INTO telegram_pet_equipment_progression (telegram_id, item_key, slot)
SELECT telegram_id, equipped_charm, 'charm' FROM telegram_pet_profiles WHERE equipped_charm IS NOT NULL AND equipped_charm <> '';

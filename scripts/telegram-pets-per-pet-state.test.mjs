import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const migration055 = await readFile(new URL('../workers/moonboys-api/migrations/055_telegram_pet_season_slots.sql', import.meta.url), 'utf8');
const migration056 = await readFile(new URL('../workers/moonboys-api/migrations/056_telegram_pet_instance_state.sql', import.meta.url), 'utf8');

assert.doesNotMatch(migration056, /CREATE\s+TRIGGER/i, 'migration 056 must not rely on trigger DDL');

const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE telegram_pet_profiles (
    telegram_id TEXT PRIMARY KEY,
    pet_name TEXT NOT NULL DEFAULT 'Moonpet', species TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'egg', pet_xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1, hunger INTEGER NOT NULL DEFAULT 25,
    happiness INTEGER NOT NULL DEFAULT 70, cleanliness INTEGER NOT NULL DEFAULT 70,
    energy INTEGER NOT NULL DEFAULT 70, health INTEGER NOT NULL DEFAULT 75,
    streak_days INTEGER NOT NULL DEFAULT 0, moon_gold INTEGER NOT NULL DEFAULT 0,
    moon_crystals INTEGER NOT NULL DEFAULT 0, style_tokens INTEGER NOT NULL DEFAULT 0,
    equipped_food TEXT, equipped_toy TEXT, equipped_outfit TEXT,
    equipped_armor TEXT, equipped_weapon TEXT, equipped_charm TEXT,
    last_active_day TEXT, last_decay_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE telegram_pet_season_state (
    telegram_id TEXT NOT NULL, season_key TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_id, season_key)
  );
`);

db.prepare(`INSERT INTO telegram_pet_profiles (
  telegram_id, pet_name, species, stage, pet_xp, level, hunger, happiness,
  cleanliness, energy, health, streak_days, moon_gold, moon_crystals,
  style_tokens, equipped_food, equipped_toy, equipped_outfit, equipped_armor,
  equipped_weapon, equipped_charm, last_active_day, last_decay_at, created_at,
  updated_at
) VALUES (${Array(25).fill('?').join(', ')})`).run(
  'state-player', 'Nova', 'neon_raccoon', 'adult', 4321, 12, 31, 82, 63,
  54, 91, 8, 777, 44, 19, 'pizza', 'orb', 'jacket', 'shell', 'laser',
  'star', '2026-08-15', '2026-08-15T12:00:00Z', '2026-01-02T03:04:05Z',
  '2026-08-16T01:02:03Z',
);
db.prepare('INSERT INTO telegram_pet_season_state (telegram_id, season_key, updated_at) VALUES (?, ?, ?)')
  .run('state-player', '2026-q3', '2026-08-15T00:00:00Z');

db.exec(migration055);
db.exec(migration056);
db.exec(migration056);

assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_pet_instances').get().count, 1, 'exactly one starter-slot instance must be backfilled');
const instance = db.prepare('SELECT * FROM telegram_pet_instances').get();
assert.deepEqual(
  [instance.pet_id, instance.telegram_id, instance.season_key, instance.slot_number, instance.status],
  ['pet:state-player:2026-q3:1', 'state-player', '2026-q3', 1, 'active'],
  'the backfill must represent the active starter season slot',
);
assert.deepEqual(
  {
    pet_name: instance.pet_name, species: instance.species, stage: instance.stage,
    pet_xp: instance.pet_xp, level: instance.level, hunger: instance.hunger,
    happiness: instance.happiness, cleanliness: instance.cleanliness,
    energy: instance.energy, health: instance.health, streak_days: instance.streak_days,
    moon_gold: instance.moon_gold, moon_crystals: instance.moon_crystals,
    style_tokens: instance.style_tokens, equipped_food: instance.equipped_food,
    equipped_toy: instance.equipped_toy, equipped_outfit: instance.equipped_outfit,
    equipped_armor: instance.equipped_armor, equipped_weapon: instance.equipped_weapon,
    equipped_charm: instance.equipped_charm, last_active_day: instance.last_active_day,
    last_decay_at: instance.last_decay_at, source_profile_updated_at: instance.source_profile_updated_at,
    created_at: instance.created_at, updated_at: instance.updated_at,
  },
  {
    pet_name: 'Nova', species: 'neon_raccoon', stage: 'adult', pet_xp: 4321,
    level: 12, hunger: 31, happiness: 82, cleanliness: 63, energy: 54,
    health: 91, streak_days: 8, moon_gold: 777, moon_crystals: 44,
    style_tokens: 19, equipped_food: 'pizza', equipped_toy: 'orb',
    equipped_outfit: 'jacket', equipped_armor: 'shell', equipped_weapon: 'laser',
    equipped_charm: 'star', last_active_day: '2026-08-15',
    last_decay_at: '2026-08-15T12:00:00Z', source_profile_updated_at: '2026-08-16T01:02:03Z',
    created_at: '2026-01-02T03:04:05Z', updated_at: '2026-08-16T01:02:03Z',
  },
  'the starter instance must copy profile identity, progression, stats, currencies, gear, and timestamps',
);

db.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent)
  VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run('pet:state-player:2026-q3:2', 'state-player', '2026-q3', 2, 'arcade_xp', 'manual-paid-slot', 500);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_pet_instances').get().count, 1, 'manually adding a paid slot must not auto-create an instance');

console.log('telegram-pets-per-pet-state.test.mjs passed');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const migration = await readFile(new URL('../workers/moonboys-api/migrations/055_telegram_pet_season_slots.sql', import.meta.url), 'utf8');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE telegram_pet_profiles (
    telegram_id TEXT PRIMARY KEY,
    species TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'egg',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE telegram_pet_season_state (
    telegram_id TEXT NOT NULL,
    season_key TEXT NOT NULL,
    season_xp INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_id, season_key)
  );
`);

db.prepare("INSERT INTO telegram_pet_profiles (telegram_id, species) VALUES (?, ?)").run('legacy-player', 'legacy_species');
db.prepare("INSERT INTO telegram_pet_profiles (telegram_id, species) VALUES (?, ?)").run('known-player', 'neon_raccoon');
db.prepare("INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)").run('blank-player');
db.prepare("INSERT INTO telegram_pet_season_state (telegram_id, season_key, season_xp, updated_at) VALUES (?, ?, ?, ?)").run('legacy-player', '2026-q3', 100, '2026-08-15T00:00:00Z');

assert.ok(!migration.includes('CREATE TRIGGER'), 'D1 production migration must not rely on trigger DDL');
db.exec(migration);
db.exec(migration);

assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_pet_season_slots').get().count, 3, 'migration must create exactly one starter slot per existing pet profile');
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_pet_active_slots').get().count, 3, 'migration must create exactly one active slot pointer per existing pet profile');
assert.equal(db.prepare("SELECT season_key FROM telegram_pet_season_slots WHERE telegram_id='legacy-player'").get().season_key, '2026-q3', 'existing season state should seed the starter slot season');
assert.equal(db.prepare("SELECT season_key FROM telegram_pet_season_slots WHERE telegram_id='blank-player'").get().season_key, 'legacy-season', 'profiles without season state should get a stable legacy fallback season');
assert.equal(db.prepare("SELECT species FROM telegram_pet_profiles WHERE telegram_id='legacy-player'").get().species, '', 'non-canonical species placeholders must be cleared');
assert.equal(db.prepare("SELECT species FROM telegram_pet_profiles WHERE telegram_id='known-player'").get().species, 'neon_raccoon', 'known species must be preserved');


db.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent)
  VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run('pet:legacy-player:2026-q3:2', 'legacy-player', '2026-q3', 2, 'arcade_xp', 'arcade-buy-2', 500);
db.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent)
  VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run('pet:legacy-player:2026-q3:3', 'legacy-player', '2026-q3', 3, 'arcade_xp', 'arcade-buy-3', 1000);
assert.throws(() => db.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type)
  VALUES (?, ?, ?, ?, ?)`)
  .run('pet:legacy-player:2026-q3:4', 'legacy-player', '2026-q3', 4, 'arcade_xp'), /CHECK constraint failed/, 'season slots must be capped at three');

console.log('telegram-pets-season-slots.test.mjs passed');

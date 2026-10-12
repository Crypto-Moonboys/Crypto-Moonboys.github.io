import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const oldSchema = fs.readFileSync(new URL('../workers/moonboys-api/migrations/079_moonpet_training_and_style.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/091_moonpet_style_catalog_expansion.sql', import.meta.url), 'utf8');

test('migration 091 preserves saved ownership and enables only approved style keys', () => {
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE telegram_pet_instances (pet_id TEXT PRIMARY KEY)');
  db.exec("INSERT INTO telegram_pet_instances VALUES ('pet-a'),('pet-b')");
  db.exec(oldSchema);
  db.prepare("INSERT INTO telegram_pet_style_loadouts VALUES ('pet-a','account-a','profile_frame',1)").run();
  db.prepare("INSERT INTO telegram_pet_style_loadouts VALUES ('pet-a','account-a','victory_pose',0)").run();
  db.prepare("INSERT INTO telegram_pet_style_loadouts VALUES ('pet-b','account-b','run_trail',1)").run();
  const saved=db.prepare('SELECT pet_id,telegram_id,cosmetic_key,enabled FROM telegram_pet_style_loadouts ORDER BY pet_id,cosmetic_key').all();
  db.exec(migration);
  assert.deepEqual(db.prepare('SELECT pet_id,telegram_id,cosmetic_key,enabled FROM telegram_pet_style_loadouts ORDER BY pet_id,cosmetic_key').all(),saved);
  const added=['neon_aura','street_sparks','gold_frame','cyber_scanlines'];
  for(const key of added) {
    db.prepare('INSERT INTO telegram_pet_style_loadouts (pet_id,telegram_id,cosmetic_key,enabled) VALUES (?,?,?,?)').run('pet-a','account-a',key,1);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM telegram_pet_style_loadouts').get().n,7);
  assert.throws(()=>db.prepare("INSERT INTO telegram_pet_style_loadouts VALUES ('pet-a','account-a','invalid_hack',1)").run(),/CHECK constraint/);
  assert.throws(()=>db.prepare("INSERT INTO telegram_pet_style_loadouts VALUES ('unknown','account-a','neon_aura',1)").run(),/FOREIGN KEY constraint/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='telegram_pet_style_loadouts_legacy_091'").get().n,0);
  db.close();
});

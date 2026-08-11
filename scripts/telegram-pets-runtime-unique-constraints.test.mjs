import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = fs.readFileSync(
  new URL('../workers/moonboys-api/migrations/046_fix_pet_runtime_unique_constraints.sql', import.meta.url),
  'utf8',
);

const statements = migration
  .split(';')
  .map((statement) => statement.replace(/--.*$/gm, '').trim())
  .filter(Boolean);

assert.equal(statements.length, 2, 'migration 046 must contain only the two required unique indexes');
assert.match(statements[0], /^CREATE UNIQUE INDEX IF NOT EXISTS\s+\S+\s+ON telegram_pet_events\s*\(telegram_id, event_key\)$/i);
assert.match(statements[1], /^CREATE UNIQUE INDEX IF NOT EXISTS\s+\S+\s+ON telegram_pet_runtime_events\s*\(telegram_id, event_key\)$/i);
assert.doesNotMatch(migration, /\b(?:ALTER|DROP|DELETE|UPDATE|INSERT)\b/i, 'migration 046 must not rewrite player data or migration bookkeeping');
assert.doesNotMatch(migration, /d1_migrations/i, 'migration 046 must leave d1_migrations to Wrangler');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE telegram_pet_events (
    id TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_key TEXT NOT NULL
  );
  CREATE TABLE telegram_pet_runtime_events (
    id TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    event_key TEXT NOT NULL,
    action TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE telegram_pet_inventory (
    telegram_id TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    asset_key TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    PRIMARY KEY (telegram_id, asset_type, asset_key)
  );
  CREATE TABLE telegram_pet_evolutions (
    telegram_id TEXT NOT NULL,
    evolution_id TEXT NOT NULL,
    stage INTEGER NOT NULL,
    PRIMARY KEY (telegram_id, evolution_id)
  );
  INSERT INTO telegram_pet_inventory VALUES ('existing-player', 'item', 'moon_snack', 7);
  INSERT INTO telegram_pet_evolutions VALUES ('existing-player', 'street_moonpet', 1);
`);

const conflictInsert = (table, values) => db.prepare(`
  INSERT INTO ${table} (${table === 'telegram_pet_events' ? 'id, telegram_id, event_type, event_key' : 'id, telegram_id, event_key, action'})
  VALUES (?, ?, ?, ?)
  ON CONFLICT (telegram_id, event_key) DO NOTHING
  RETURNING id
`).get(...values);

assert.throws(
  () => conflictInsert('telegram_pet_runtime_events', ['pre-migration-runtime', 'existing-player', 'runtime:job:1', 'job']),
  /ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint/,
  'the rehearsal fixture must reproduce the production runtime failure before migration 046',
);
assert.throws(
  () => conflictInsert('telegram_pet_events', ['pre-migration-event', 'existing-player', 'work', 'pet:job:1']),
  /ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint/,
  'the rehearsal fixture must reproduce the pet-event conflict mismatch before migration 046',
);

db.exec(migration);

const jobEvent = conflictInsert('telegram_pet_events', ['job-event', 'existing-player', 'work', 'pet:job:1']);
const jobRuntime = conflictInsert('telegram_pet_runtime_events', ['job-runtime', 'existing-player', 'runtime:job:1', 'job']);
assert.equal(jobEvent.id, 'job-event', 'pet job creation must create its primary event');
assert.equal(jobRuntime.id, 'job-runtime', 'pet job creation must create its runtime event');

const petEvent = conflictInsert('telegram_pet_events', ['pet-event', 'existing-player', 'random_event', 'pet:event:1']);
assert.equal(petEvent.id, 'pet-event', 'pet event creation must succeed after migration 046');

assert.equal(conflictInsert('telegram_pet_events', ['pet-event-retry', 'existing-player', 'random_event', 'pet:event:1']), undefined);
assert.equal(conflictInsert('telegram_pet_runtime_events', ['job-runtime-retry', 'existing-player', 'runtime:job:1', 'job']), undefined);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = 'existing-player' AND event_key = 'pet:event:1'").get().count, 1,
  'duplicate pet callbacks must remain single-write');
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM telegram_pet_runtime_events WHERE telegram_id = 'existing-player' AND event_key = 'runtime:job:1'").get().count, 1,
  'duplicate runtime callbacks must remain single-write');

assert.deepEqual({ ...db.prepare("SELECT asset_type, asset_key, quantity FROM telegram_pet_inventory WHERE telegram_id = 'existing-player'").get() },
  { asset_type: 'item', asset_key: 'moon_snack', quantity: 7 }, 'migration 046 must not change inventory');
assert.deepEqual({ ...db.prepare("SELECT evolution_id, stage FROM telegram_pet_evolutions WHERE telegram_id = 'existing-player'").get() },
  { evolution_id: 'street_moonpet', stage: 1 }, 'migration 046 must not change evolution state');
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');

console.log('telegram-pets-runtime-unique-constraints.test.mjs passed');

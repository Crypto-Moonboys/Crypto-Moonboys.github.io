import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  MOONPET_SPECIES, createMoonEggLifecycle, getMoonpetLifecycle, hatchMoonpet, incubateMoonEgg,
} from '../workers/moonboys-api/pets/species-lifecycle.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.adapter.database.prepare(this.sql).all(...this.args) }; }
  async run() { const result = this.adapter.database.prepare(this.sql).run(...this.args); return { meta: { changes: Number(result.changes || 0) } }; }
}
class D1 {
  constructor() { this.database = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.database.exec('COMMIT'); return results; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
}

const db = new D1();
db.database.exec(`
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE telegram_pet_evolutions (telegram_id TEXT, stage INTEGER);
  CREATE TABLE telegram_pet_memories (telegram_id TEXT PRIMARY KEY, exploration_actions INTEGER DEFAULT 0, total_runs INTEGER DEFAULT 0,
    combat_actions INTEGER DEFAULT 0, total_bosses_defeated INTEGER DEFAULT 0, care_actions INTEGER DEFAULT 0, event_actions INTEGER DEFAULT 0,
    adventure_actions INTEGER DEFAULT 0);
  CREATE TABLE telegram_pet_personality_traits (telegram_id TEXT, trait_id TEXT, unlocked_at TEXT);
`);
db.database.exec(await (await import('node:fs/promises')).readFile(new URL('../workers/moonboys-api/migrations/053_telegram_pet_species_lifecycle.sql', import.meta.url), 'utf8'));
db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run('new-player');
db.database.prepare('DELETE FROM telegram_pet_lifecycle WHERE telegram_id=?').run('new-player');
await createMoonEggLifecycle(db, 'new-player', 'adopt:1');
let lifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(lifecycle.phase, 'egg');
assert.equal(lifecycle.species_id, null, 'species must stay secret before hatching');

for (const [index, care] of ['warm', 'talk', 'music', 'warm', 'talk', 'music'].entries()) {
  assert.equal((await incubateMoonEgg(db, 'new-player', care, `care:${index}`)).accepted, true);
}
for (const care of ['warm', 'talk', 'music', 'rest']) {
  assert.equal((await incubateMoonEgg(db, 'new-player', care, `cap:${care}`)).accepted, care === 'warm' || care === 'talk');
}
assert.equal((await incubateMoonEgg(db, 'new-player', 'rest', 'cap:blocked')).reason, 'incubation_daily_cap');
assert.equal((await incubateMoonEgg(db, 'new-player', 'music', 'care:0')).duplicate, true, 'request keys must be idempotent');
lifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(lifecycle.incubation.ready, true);
const hatched = await hatchMoonpet(db, 'new-player', 'hatch:1');
assert.equal(hatched.accepted, true);
assert.ok(Object.hasOwn(MOONPET_SPECIES, hatched.lifecycle.species_id));
assert.equal(hatched.lifecycle.innate_traits.length, 2);

console.log('telegram-pets-species-lifecycle.test.mjs passed');

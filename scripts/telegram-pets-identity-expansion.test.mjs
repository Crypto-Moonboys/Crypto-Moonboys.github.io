import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  MOONPET_EVOLUTIONS,
  MOONPET_PERSONALITY_TRAITS,
  evolveMoonpet,
  getMoonpetIdentityAnalytics,
  getMoonpetIdentitySummary,
  recordMoonpetBehaviour,
  recordMoonpetMemory,
  validateMoonpetEvolutionContent,
} from '../workers/moonboys-api/pets/moonpet-identity.js';
import { __rogueliteFoundationTestHooks } from '../workers/moonboys-api/pets/roguelite-foundation.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/043_telegram_pet_identity_expansion.sql', import.meta.url), 'utf8');
const identitySource = fs.readFileSync(new URL('../workers/moonboys-api/pets/moonpet-identity.js', import.meta.url), 'utf8');

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() { return this.adapter.database.prepare(this.sql).get(...this.args) || null; }
  async run() {
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { results: [], meta: { changes: Number(result.changes || 0) } };
  }
  async all() { return { results: this.adapter.database.prepare(this.sql).all(...this.args) }; }
}

class D1 {
  constructor() { this.database = new DatabaseSync(':memory:'); this.database.exec(schema); this.queue = Promise.resolve(); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    const execute = () => {
      this.database.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => {
          const prepared = this.database.prepare(statement.sql);
          if (/\bRETURNING\b/i.test(statement.sql)) {
            const rows = prepared.all(...statement.args);
            return { results: rows, meta: { changes: rows.length } };
          }
          const result = prepared.run(...statement.args);
          return { results: [], meta: { changes: Number(result.changes || 0) } };
        });
        this.database.exec('COMMIT');
        return results;
      } catch (error) {
        this.database.exec('ROLLBACK');
        throw error;
      }
    };
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
}

function seedPlayer(telegramId = 'identity-player') {
  const db = new D1();
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES (?, 1900, 20)').run(telegramId);
  return db;
}

for (const table of ['telegram_pet_evolutions', 'telegram_pet_personality_traits', 'telegram_pet_memories', 'telegram_pet_identity_events', 'telegram_pet_identity_analytics']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in canonical schema`);
  assert.ok(migration.includes(`CREATE TABLE ${table}`), `${table} must exist in migration 043`);
}
const migrationDb = new DatabaseSync(':memory:');
migrationDb.exec(schema.split('-- Crypto Moonboy Pets identity expansion.')[0]);
migrationDb.prepare("INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('backfill-player', 0, 1)").run();
migrationDb.prepare("INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level, created_at) VALUES ('backfill-player', 400, 5, '2026-01-02 03:04:05')").run();
migrationDb.exec(migration);
assert.equal(migrationDb.prepare('PRAGMA foreign_key_check').all().length, 0, 'migration 043 must preserve referential integrity');
assert.deepEqual({ ...migrationDb.prepare("SELECT evolution_id, stage, materials_consumed FROM telegram_pet_evolutions WHERE telegram_id='backfill-player'").get() },
  { evolution_id: 'moon_egg', stage: 0, materials_consumed: 1 }, 'migration 043 must give existing Moonpets their permanent starting identity');
assert.equal(migrationDb.prepare("SELECT first_adoption_at FROM telegram_pet_memories WHERE telegram_id='backfill-player'").get().first_adoption_at,
  '2026-01-02 03:04:05', 'migration 043 must preserve existing adoption history');
assert.deepEqual(Object.values(MOONPET_EVOLUTIONS).map(({ name }) => name), [
  'Moon Egg', 'Street Moonpet', 'Cyber Moonpet', 'Elite Moonpet', 'Legendary Moon Guardian',
]);
assert.deepEqual(Object.values(MOONPET_PERSONALITY_TRAITS).map(({ name }) => name), ['Street Fighter', 'Explorer', 'Loyal', 'Curious']);
assert.equal(validateMoonpetEvolutionContent(), true);
assert.throws(() => validateMoonpetEvolutionContent(Object.values(MOONPET_EVOLUTIONS).map((entry, index) => (
  index === 2 ? { ...entry, requirements: { ...entry.requirements, xp_multiplier: 2 } } : entry
))), /evolution_cannot_change_reward_authority/);

const invalidDb = seedPlayer('invalid-evolution');
assert.deepEqual(await evolveMoonpet(invalidDb, { telegram_id: 'invalid-evolution', evolution_id: 'not_real', event_key: 'invalid' }),
  { accepted: false, duplicate: false, reason: 'invalid_evolution' });

const evolutionDb = seedPlayer();
evolutionDb.database.prepare("INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES ('identity-player', 'material', 'neon_scrap', 15)").run();
evolutionDb.database.prepare("INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES ('identity-player', 'item', 'evolution_fragment', 3)").run();
for (const relicId of ['bitcoin_heart', 'cyber_collar']) evolutionDb.database.prepare(
  "INSERT INTO telegram_pet_relics (telegram_id, relic_id, rarity, effects_json) VALUES ('identity-player', ?, 'rare', '{}')",
).run(relicId);
evolutionDb.database.prepare("INSERT INTO telegram_pet_boss_victories (telegram_id, boss_id, victories) VALUES ('identity-player', 'alley_king', 3)").run();
await recordMoonpetMemory(evolutionDb, { telegram_id: 'identity-player', event_key: 'adoption', memory_type: 'first_adoption', milestone: 'first_adoption' });
assert.equal((await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'cyber_moonpet', event_key: 'skip' })).reason,
  'evolution_requirements_not_met', 'evolution stages cannot be skipped');
assert.equal((await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'moon_egg', event_key: 'egg' })).accepted, true);
assert.equal((await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'street_moonpet', event_key: 'street' })).accepted, true);
const cyber = await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'cyber_moonpet', event_key: 'cyber' });
assert.equal(cyber.accepted, true, 'valid evolution must succeed');
assert.equal(cyber.duplicate, false);
assert.deepEqual(evolutionDb.database.prepare("SELECT asset_key, quantity FROM telegram_pet_inventory WHERE telegram_id='identity-player' ORDER BY asset_key").all().map((row) => ({ ...row })), [
  { asset_key: 'evolution_fragment', quantity: 0 }, { asset_key: 'neon_scrap', quantity: 0 },
]);
const duplicateCyber = await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'cyber_moonpet', event_key: 'cyber-retry' });
assert.equal(duplicateCyber.duplicate, true, 'duplicate evolution cannot happen');
assert.equal(evolutionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_evolutions WHERE evolution_id='cyber_moonpet'").get().count, 1);
assert.equal(evolutionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE event_type='evolution_unlock'").get().count, 3);

const concurrentEvolutionDb = seedPlayer('concurrent-evolution');
concurrentEvolutionDb.database.prepare("INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES ('concurrent-evolution', 'material', 'neon_scrap', 5)").run();
await evolveMoonpet(concurrentEvolutionDb, { telegram_id: 'concurrent-evolution', evolution_id: 'moon_egg', event_key: 'concurrent-egg' });
const concurrentEvolutionCallbacks = await Promise.all(Array.from({ length: 8 }, (_, index) => evolveMoonpet(concurrentEvolutionDb, {
  telegram_id: 'concurrent-evolution', evolution_id: 'street_moonpet', event_key: `concurrent-street:${index}`,
})));
assert.equal(concurrentEvolutionCallbacks.filter(({ duplicate }) => !duplicate).length, 1, 'concurrent evolution callbacks must unlock once');
assert.equal(concurrentEvolutionDb.database.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id='concurrent-evolution' AND asset_key='neon_scrap'").get().quantity, 0,
  'concurrent evolution callbacks must consume authoritative materials once');

const personalityDb = seedPlayer('personality-player');
await recordMoonpetMemory(personalityDb, { telegram_id: 'personality-player', event_key: 'personality-adoption', memory_type: 'first_adoption', milestone: 'first_adoption' });
for (let index = 0; index < 10; index += 1) await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: `arena:${index}`, behaviour: 'combat',
});
const duplicateBehaviour = await recordMoonpetBehaviour(personalityDb, { telegram_id: 'personality-player', event_key: 'arena:9', behaviour: 'combat' });
assert.equal(duplicateBehaviour.duplicate, true, 'duplicate callbacks must not double personality progress');
assert.deepEqual({ ...personalityDb.database.prepare("SELECT progress, unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_personality_traits WHERE trait_id='street_fighter'").get() },
  { progress: 10, unlocked: 1 });
assert.equal(personalityDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE event_type='personality_unlock'").get().count, 1,
  'repeated behaviour unlocks a trait exactly once');

const memoryDb = seedPlayer('memory-player');
const bossCallbacks = await Promise.all(Array.from({ length: 8 }, () => recordMoonpetMemory(memoryDb, {
  telegram_id: 'memory-player', event_key: 'boss:alley-king:1', memory_type: 'boss_victory', boss_id: 'alley_king',
  activity: 'combat', milestone: 'first_boss_victory', reward_amount: 42, reward_currency: 'moon_gold',
})));
assert.equal(bossCallbacks.filter(({ duplicate }) => !duplicate).length, 1, 'boss victory records once');
assert.deepEqual({ ...memoryDb.database.prepare("SELECT first_boss_id, total_bosses_defeated, biggest_reward_amount FROM telegram_pet_memories WHERE telegram_id='memory-player'").get() },
  { first_boss_id: 'alley_king', total_bosses_defeated: 1, biggest_reward_amount: 42 });
assert.equal(memoryDb.database.prepare("SELECT victories FROM telegram_pet_boss_victories WHERE telegram_id='memory-player' AND boss_id='alley_king'").get().victories, 1);
assert.equal(memoryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE event_type='memory_milestone'").get().count, 1,
  'duplicate callbacks cannot duplicate memory milestones');

const summary = await getMoonpetIdentitySummary(evolutionDb, 'identity-player');
assert.equal(summary.current_stage.name, 'Cyber Moonpet');
assert.ok(summary.memories.milestones.includes('first_adoption'));
const analytics = await getMoonpetIdentityAnalytics(evolutionDb);
assert.equal(analytics.adopted_pets, 1);
assert.ok(analytics.events.some(({ event_type, average_time_to_evolution_seconds }) => event_type === 'evolution_unlock' && Number(average_time_to_evolution_seconds) >= 0));
const personalityAnalytics = await getMoonpetIdentityAnalytics(personalityDb);
assert.equal(personalityAnalytics.events.find(({ event_type }) => event_type === 'personality_unlock').personality_unlock_rate, 1,
  'personality unlock rate must be available for balancing');

for (const definition of Object.values(MOONPET_EVOLUTIONS)) {
  assert.equal(definition.xp_multiplier, undefined);
  assert.equal(definition.reward_multiplier, undefined);
  assert.equal(definition.cap_increase, undefined);
}
assert.equal(identitySource.includes('awardPetReward('), false, 'identity systems cannot create a reward-authority bypass');
assert.equal(__rogueliteFoundationTestHooks.DAILY_PET_XP_CAP, 1200, 'Pet XP cap must remain unchanged');
assert.equal(__rogueliteFoundationTestHooks.DAILY_COMMUNITY_XP_CAP, 250, 'Community XP cap must remain unchanged');

console.log('Telegram Pets identity expansion tests passed.');

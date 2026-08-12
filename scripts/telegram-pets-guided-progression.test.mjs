import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  buildPetGuidanceCandidates,
  choosePetNextAction,
  mergePetGuidanceReplyMarkup,
} from '../workers/moonboys-api/pets/player-guidance.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const healthyPet = {
  pet_name: 'Sparky', health: 100, hunger: 10, cleanliness: 90,
  energy: 80, happiness: 90,
};

const candidates = buildPetGuidanceCandidates({
  evolution: { evolution_id: 'street_moonpet', name: 'Street Moonpet', ready: true },
  season: { key: '2026-S3', tiers: [{ tier_id: 'street', title: 'Street Cache', required_xp: 250, unlocked: true, claimed_at: null }] },
  personalities: [{ trait_id: 'loyal', name: 'Loyal', unlocked_at: '2026-08-12' }],
  achievements: [{ achievement_id: 'caring_hand', title: 'Caring Hand', description: 'Complete 25 care actions.', unlocked_at: '2026-08-12' }],
  features: [{ key: 'pet_arena', title: 'Pet Arena', available: true, callback_data: 'pet:arena' }],
  jobs: [{ key: 'courier', title: 'Courier', min_level: 1, min_evolution_stage: 0, available: true }],
  shop_items: [{ key: 'laser_ball', title: 'Laser Ball', unlocked: true, affordable: true }],
});
assert.deepEqual(candidates.map(({ type }) => type), ['evolution_ready', 'season_reward', 'personality', 'achievement', 'feature', 'job', 'shop']);
assert.equal(new Set(candidates.map(({ key }) => key)).size, candidates.length, 'each one-time notice needs a stable unique key');

assert.equal(choosePetNextAction({ pet: { ...healthyPet, hunger: 90 } }).key, 'feed', 'urgent care must outrank grinding');
assert.equal(choosePetNextAction({ pet: healthyPet, activity: { ready: true, activity_type: 'work' } }).key, 'claim_activity');
assert.equal(choosePetNextAction({ pet: healthyPet, active_run: { run_id: 'run-1', status: 'extractable' } }).callback_data, 'pet:run:run-1:extract');
assert.equal(choosePetNextAction({ pet: healthyPet, season: { tiers: [{ tier_id: 'street', title: 'Street Cache', unlocked: true }] } }).key, 'season:street');
assert.equal(choosePetNextAction({ pet: healthyPet, evolution: { name: 'Street Moonpet', ready: true } }).key, 'evolve');
const materialGrind = choosePetNextAction({
  pet: healthyPet,
  evolution: { name: 'Street Moonpet', ready: false, missing: [{ key: 'material:neon_scrap', label: 'neon scrap', current: 3, required: 5, source: 'Find it in Moon Runs.', callback_data: 'pet:run' }] },
});
assert.equal(materialGrind.callback_data, 'pet:run');
assert.match(materialGrind.detail, /3\/5/);
assert.equal(choosePetNextAction({ pet: healthyPet, missions: [{ key: 'pet-daily-train', title: 'Train once', completed: false }] }).callback_data, 'pet:train');

const merged = mergePetGuidanceReplyMarkup({ inline_keyboard: [[{ text: 'Feed', callback_data: 'pet:feed' }]] }, { label: 'Feed Now', callback_data: 'pet:feed' });
assert.equal(merged.inline_keyboard[0].length, 1, 'a recommendation must not duplicate an existing action button');
assert.equal(merged.inline_keyboard[0][0].callback_data, 'pet:coach');

const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/050_telegram_pet_guided_progression.sql', import.meta.url), 'utf8');
assert.match(migration, /CREATE TABLE telegram_pet_guidance_notices/);
assert.match(migration, /PRIMARY KEY \(telegram_id, notice_key\)/);
const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY);
  INSERT INTO telegram_pet_profiles (telegram_id) VALUES ('player-1');
`);
db.exec(migration);
db.prepare(`INSERT INTO telegram_pet_guidance_notices
  (telegram_id, notice_key, notice_type, title, detail, callback_data)
  VALUES (?, ?, ?, ?, ?, ?)`).run('player-1', 'feature:pet_arena', 'feature', 'Pet Arena unlocked', 'Fight now.', 'pet:arena');
assert.throws(() => db.prepare(`INSERT INTO telegram_pet_guidance_notices
  (telegram_id, notice_key, notice_type, title, detail, callback_data)
  VALUES (?, ?, ?, ?, ?, ?)`).run('player-1', 'feature:pet_arena', 'feature', 'Duplicate', '', 'pet:arena'), /UNIQUE constraint failed/);
db.prepare(`UPDATE telegram_pet_guidance_notices SET shown_at = CURRENT_TIMESTAMP WHERE telegram_id = 'player-1'`).run();

db.exec(`
  CREATE TABLE telegram_pet_inventory (
    telegram_id TEXT NOT NULL, asset_type TEXT NOT NULL, asset_key TEXT NOT NULL, quantity INTEGER NOT NULL,
    PRIMARY KEY (telegram_id, asset_type, asset_key)
  );
  CREATE TABLE telegram_pet_boss_victories (
    telegram_id TEXT NOT NULL, boss_id TEXT NOT NULL, victories INTEGER NOT NULL,
    PRIMARY KEY (telegram_id, boss_id)
  );
  CREATE TABLE telegram_pet_relics (
    telegram_id TEXT NOT NULL, relic_id TEXT NOT NULL,
    PRIMARY KEY (telegram_id, relic_id)
  );
  INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
  VALUES ('player-1', 'material', 'neon_scrap', 3);
`);
class D1DatabaseAdapter {
  constructor(database) { this.database = database; }
  prepare(sql) {
    const statement = this.database.prepare(sql);
    let values = [];
    return {
      bind(...params) { values = params; return this; },
      async first() { return statement.get(...values) || null; },
      async all() { return { results: statement.all(...values).map((row) => ({ ...row })) }; },
      async run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes || 0) } }; },
    };
  }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}
const d1 = new D1DatabaseAdapter(db);
const identity = { current_stage: { evolution_id: 'moon_egg', stage: 0 } };
const blockedEvolution = await hooks.getPetEvolutionGuidance(d1, 'player-1', { pet_xp: 4200 }, identity);
assert.equal(blockedEvolution.name, 'Street Moonpet');
assert.deepEqual(blockedEvolution.missing.map(({ key, current, required }) => ({ key, current, required })), [
  { key: 'material:neon_scrap', current: 3, required: 5 },
]);
db.prepare(`UPDATE telegram_pet_inventory SET quantity = 5 WHERE telegram_id = 'player-1' AND asset_key = 'neon_scrap'`).run();
assert.equal((await hooks.getPetEvolutionGuidance(d1, 'player-1', { pet_xp: 4200 }, identity)).ready, true);
const oneTime = await hooks.persistPetGuidanceNotices(d1, 'player-1', [{
  key: 'evolution-ready:street_moonpet', type: 'evolution_ready', title: 'Street Moonpet evolution is ready', detail: 'Evolve now.', callback_data: 'pet:evolve',
}]);
assert.equal(oneTime.length, 1);
assert.equal((await hooks.persistPetGuidanceNotices(d1, 'player-1', [{
  key: 'evolution-ready:street_moonpet', type: 'evolution_ready', title: 'Street Moonpet evolution is ready', detail: 'Evolve now.', callback_data: 'pet:evolve',
}])).length, 0, 'a shown progression notice must never repeat');
db.close();

const workerSource = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
assert.match(workerSource, /case 'petcoach'/);
assert.match(workerSource, /payload === 'coach'/);
assert.match(workerSource, /Recommended Next Move/);
assert.match(workerSource, /getPetEvolutionGuidance/);
assert.ok((workerSource.match(/telegram_pet_guidance_notices/g) || []).length >= 2);

console.log('Telegram Pets guided progression tests passed.');

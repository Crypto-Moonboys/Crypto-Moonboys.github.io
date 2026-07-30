import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPetGearSummary,
  buildPetProgressSummary,
  buildPetRuntimeAwardPlan,
  calculatePetRuntimeTrackAwards,
  mergePetTraitProgress,
  normalizePetRuntimeAction,
} from '../workers/moonboys-api/pets/runtime-phase-5a.js';

const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/039_telegram_pet_runtime_progression.sql', import.meta.url), 'utf8');

assert.equal(normalizePetRuntimeAction('FEED'), 'feed');
assert.equal(normalizePetRuntimeAction('constructor'), null);
assert.equal(normalizePetRuntimeAction('__proto__'), null);

const feedPlan = buildPetRuntimeAwardPlan('feed', { trait_amount: 4 });
assert.deepEqual(feedPlan.tracks, { care: 8, bond: 5 });
assert.deepEqual(feedPlan.traits, { loyal: 4 });

const capped = calculatePetRuntimeTrackAwards(feedPlan, { care_daily: 298, bond_daily: 180 });
assert.deepEqual(capped, { care: 2 }, 'daily track caps must be applied independently');

const traits = mergePetTraitProgress('{"loyal":138}', { loyal: 4, brave: 2 });
assert.deepEqual(traits, { loyal: 142, brave: 2 });
assert.deepEqual(mergePetTraitProgress('not-json', { lucky: 3 }), { lucky: 3 });

const dropPlan = buildPetRuntimeAwardPlan('run_extract', { drop_roll: 0 });
assert.equal(dropPlan.material, 'crystal_shard');
assert.equal(buildPetRuntimeAwardPlan('missing'), null);

const progressText = buildPetProgressSummary({
  care_xp: 800,
  training_xp: 0,
  adventure_xp: 320,
  arena_xp: 50,
  job_xp: 200,
  bond_xp: 75,
  traits_json: '{"loyal":140,"brave":99}',
  prestige_count: 2,
});
assert.match(progressText, /PET PROGRESSION/);
assert.match(progressText, /Care XP: 800/);
assert.match(progressText, /Job rank: crew_member/);
assert.match(progressText, /Traits: loyal/);
assert.match(progressText, /Prestige: 2/);

const gearText = buildPetGearSummary([{ item_key: 'hoverboard', item_level: 4, mastery_xp: 1000 }]);
assert.match(gearText, /PET GEAR/);
assert.match(gearText, /hoverboard · Lv\.4 · Mastery 3\/5/);
assert.match(buildPetGearSummary([]), /No equipment progression recorded yet/);

for (const table of ['telegram_pet_progression_state', 'telegram_pet_material_balances', 'telegram_pet_runtime_events']) {
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must be persisted`);
}
assert.ok(migration.includes('UNIQUE (telegram_id, event_key)'), 'runtime events must be idempotent');
assert.ok(migration.includes('REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE'), 'runtime state must cascade with pet deletion');
assert.ok(migration.includes('INSERT OR IGNORE INTO telegram_pet_progression_state'), 'existing pet profiles must be seeded safely');

console.log('telegram-pets-runtime-phase-5a.test.mjs passed');

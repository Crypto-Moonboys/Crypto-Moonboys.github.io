import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPetGearSummary,
  buildPetProgressSummary,
  buildPetRuntimeAwardPlan,
  calculateCreditedMaterialAmount,
  calculatePetRuntimeTrackAwards,
  mergePetTraitProgress,
  normalizePetRuntimeAction,
} from '../workers/moonboys-api/pets/runtime-phase-5a.js';

const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/039_telegram_pet_runtime_progression.sql', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const runtimeSource = fs.readFileSync(new URL('../workers/moonboys-api/pets/runtime-phase-5a.js', import.meta.url), 'utf8');

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

assert.equal(calculateCreditedMaterialAmount(9990, 9999), 9);
assert.equal(calculateCreditedMaterialAmount(9999, 9999), 0, 'full stacks must report zero credited units');
assert.equal(calculateCreditedMaterialAmount(20, 15), 0, 'credited material cannot be negative');

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

for (const sql of [migration, schema]) {
  for (const table of ['telegram_pet_progression_state', 'telegram_pet_material_balances', 'telegram_pet_runtime_events']) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in migration and canonical schema`);
  }
  assert.ok(sql.includes('UNIQUE (telegram_id, event_key)'), 'runtime events must be idempotent');
  assert.ok(sql.includes('REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE'), 'runtime state must cascade with pet deletion');
}
assert.ok(migration.includes('INSERT OR IGNORE INTO telegram_pet_progression_state'), 'existing pet profiles must be seeded safely');

assert.match(runtimeSource, /await db\.batch\(statements\)/, 'event claim and reward writes must use one D1 transaction');
assert.match(runtimeSource, /WHERE pet_id = \? AND EXISTS \(SELECT 1 FROM telegram_pet_runtime_events WHERE id = \?\) RETURNING \*/, 'the complete state mutation must require the newly inserted claim');
assert.match(runtimeSource, /bindings\.push\(petId, claimId\)/, 'state update bindings must include the owner and claim gate');
assert.match(runtimeSource, /quantity_awarded: credited/, 'material messaging must report the persisted balance delta');
assert.doesNotMatch(runtimeSource, /SELECT quantity[\s\S]*?nextQuantity[\s\S]*?DO UPDATE SET quantity = excluded\.quantity/, 'material writes must not use a stale read-modify-write balance');
assert.match(runtimeSource, /MIN\(\?, telegram_pet_material_balances\.quantity \+ excluded\.quantity\)/, 'material increments must be atomic and capped');
assert.match(runtimeSource, /json_set\(/, 'trait increments must be atomic SQL updates');

console.log('telegram-pets-runtime-phase-5a.test.mjs passed');

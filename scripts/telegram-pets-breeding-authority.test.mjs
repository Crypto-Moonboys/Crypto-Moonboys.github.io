import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  generateBreedingSeed,
  generateOffspringTraits,
  requestMoonpetBreeding,
} from '../workers/moonboys-api/pets/breeding-authority.js';

class Statement {
  constructor(d1, sql, args = []) { this.d1 = d1; this.db = d1.database; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.d1, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (this.d1.failNextOffspringPersistence && /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+telegram_pet_season_slots/i.test(this.sql)) {
      this.d1.failNextOffspringPersistence = false;
      throw new Error('simulated_offspring_persistence_failure');
    }
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.failNextOffspringPersistence = false;
    this.reserveSlotBeforeBatch = null;
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    if (this.reserveSlotBeforeBatch) {
      const reservation = this.reserveSlotBeforeBatch;
      this.reserveSlotBeforeBatch = null;
      this.database.prepare(`INSERT INTO telegram_pet_season_slots
        (pet_id, telegram_id, season_key, slot_number, acquisition_type, status)
        VALUES (?, ?, ?, ?, 'free', 'active')`)
        .run(reservation.petId, reservation.telegramId, reservation.seasonKey, reservation.slotNumber);
    }
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const schema = await readFile(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const seasonCompletionMigration = await readFile(new URL('../workers/moonboys-api/migrations/058_telegram_pet_season_completion.sql', import.meta.url), 'utf8');
const breedingMigration = await readFile(new URL('../workers/moonboys-api/migrations/069_moonpet_breeding_authority.sql', import.meta.url), 'utf8');
const breedingSource = await readFile(new URL('../workers/moonboys-api/pets/breeding-authority.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');

for (const table of ['telegram_pet_breeding_receipts', 'telegram_pet_breeding_cooldowns']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in canonical schema`);
  assert.ok(breedingMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in migration 069`);
}
assert.doesNotMatch(breedingMigration, /\b(?:ALTER\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+telegram_)\b/i,
  'migration 069 must be additive only');
for (const indexName of [
  'idx_telegram_pet_breeding_receipts_owner_season',
  'idx_telegram_pet_breeding_receipts_parent_pair',
  'idx_telegram_pet_breeding_receipts_offspring',
  'idx_telegram_pet_breeding_cooldowns_owner',
]) assert.ok(breedingMigration.includes(indexName), `${indexName} must exist for D1 lookups and audit support`);
assert.match(breedingSource, /getMoonpetSeasonKey\(now\) !== seasonKey/,
  'breeding must bind requests to the server season authority');
assert.match(breedingSource, /telegram_pet_season_completions/,
  'breeding must require the completed-pet authority table');
assert.match(breedingSource, /Cooldown authority is per parent pet/,
  'breeding source must document that cooldown belongs to each parent pet');
assert.match(breedingSource, /db\.batch\(statements\)/,
  'breeding settlement must use D1 batch transaction authority');
assert.match(breedingSource, /PET_LIFECYCLE_SCHEMA_VERSION, receipt\.seed/,
  'breeding offspring lifecycle rows must use lifecycle schema version, not breeding authority version');
assert.doesNotMatch(breedingSource, /lifecycle_version[\s\S]{0,220}PET_BREEDING_AUTHORITY_VERSION, receipt\.seed/,
  'breeding offspring lifecycle version must stay decoupled from breeding authority version changes');
assert.match(breedingMigration, /Cooldowns are per parent pet/,
  'migration 069 must document the per-parent cooldown authority model');
assert.doesNotMatch(workerSource, /body\.action === 'breed'|processMoonpetBreeding|requestMoonpetBreeding/i,
  'breeding PR #1232 must remain foundation-only with no live player-facing route');

function createDb() {
  const db = new D1();
  db.database.exec('PRAGMA foreign_keys=ON');
  db.database.exec(schema);
  db.database.exec(seasonCompletionMigration);
  db.database.exec(breedingMigration);
  db.database.exec(breedingMigration);
  assert.equal(db.database.prepare('PRAGMA foreign_key_check').all().length, 0, 'breeding migrations must be D1/sqlite-clean');
  return db;
}

function seedPlayer(db, telegramId) {
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES (?, 0, 1)').run(telegramId);
}

function seedPet(db, {
  telegramId,
  petId,
  slotNumber,
  seasonKey = 'pet-s2026-003',
  complete = true,
  active = true,
  species = 'neon_raccoon',
  palette = 'mint_punch',
  marking = 'moon_mask',
  eyes = 'bright',
  temperament = 'bold',
  innate = ['night_owl', 'collector'],
}) {
  db.database.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, status)
    VALUES (?, ?, ?, ?, 'free', ?)`).run(petId, telegramId, seasonKey, slotNumber, active ? 'active' : 'archived');
  db.database.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_name, species, stage, pet_xp, level,
     status, source_profile_updated_at)
    VALUES (?, ?, ?, ?, 'Moonpet', ?, 'adult', 1000, 10, ?, ?)`)
    .run(petId, telegramId, seasonKey, slotNumber, species, active ? 'active' : 'archived', '2026-08-19T00:00:00.000Z');
  db.database.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet
    (pet_id, telegram_id, identity_seed, phase, species_id, palette_id, marking_id,
     eye_style, temperament, innate_traits_json, incubation_json, adult_at)
    VALUES (?, ?, ?, 'adult', ?, ?, ?, ?, ?, ?, '{}', ?)`)
    .run(petId, telegramId, `seed:${petId}`, species, palette, marking, eyes, temperament, JSON.stringify(innate), '2026-08-18T00:00:00.000Z');
  if (complete) {
    db.database.prepare(`INSERT INTO telegram_pet_season_completions
      (pet_id, telegram_id, season_key, completed_at, legendary_evolution_id, growth_marks_earned, weekly_crests_earned, authority_version)
      VALUES (?, ?, ?, ?, 'final_form', 60, 10, 2)`)
      .run(petId, telegramId, seasonKey, '2026-08-18T00:00:00.000Z');
  }
}

function seedBreedingPair(db, owner = 'breeder', options = {}) {
  seedPlayer(db, owner);
  const parentA = `pet:${owner}:a`;
  const parentB = `pet:${owner}:b`;
  seedPet(db, {
    telegramId: owner,
    petId: parentA,
    slotNumber: 1,
    species: 'neon_raccoon',
    palette: 'mint_punch',
    marking: 'moon_mask',
    eyes: 'bright',
    temperament: 'bold',
    innate: ['night_owl', 'collector'],
    ...options.parentA,
  });
  seedPet(db, {
    telegramId: owner,
    petId: parentB,
    slotNumber: 2,
    species: 'bubble_ram',
    palette: 'coral_pop',
    marking: 'spray_stripe',
    eyes: 'focused',
    temperament: 'calm',
    innate: ['soft_hearted', 'lucky_steps'],
    ...options.parentB,
  });
  return { owner, parentA, parentB };
}

function baseRequest(pair, requestKey = 'breed-1') {
  return {
    owner_id: pair.owner,
    parent_pet_a_id: pair.parentA,
    parent_pet_b_id: pair.parentB,
    season_key: 'pet-s2026-003',
    request_key: requestKey,
    now: '2026-08-19T12:00:00.000Z',
  };
}

const ownershipDb = createDb();
seedPlayer(ownershipDb, 'owner-a');
seedPlayer(ownershipDb, 'owner-b');
seedPet(ownershipDb, { telegramId: 'owner-a', petId: 'pet-owner-a', slotNumber: 1 });
seedPet(ownershipDb, { telegramId: 'owner-b', petId: 'pet-owner-b', slotNumber: 1 });
const ownershipRejected = await requestMoonpetBreeding(ownershipDb, {
  owner_id: 'owner-a',
  parent_pet_a_id: 'pet-owner-a',
  parent_pet_b_id: 'pet-owner-b',
  season_key: 'pet-s2026-003',
  request_key: 'wrong-owner',
  now: '2026-08-19T12:00:00.000Z',
});
assert.equal(ownershipRejected.accepted, false, 'Test 1: breeding rejects a parent owned by another player');
assert.equal(ownershipRejected.reason, 'breeding_parent_authority_mismatch');

const incompleteDb = createDb();
const incompletePair = seedBreedingPair(incompleteDb, 'incomplete-player', { parentA: { complete: false } });
const incompleteRejected = await requestMoonpetBreeding(incompleteDb, baseRequest(incompletePair, 'incomplete'));
assert.equal(incompleteRejected.accepted, false, 'Test 2: incomplete parent cannot breed');
assert.equal(incompleteRejected.reason, 'breeding_parent_incomplete');

const incompleteParentBDb = createDb();
const incompleteParentBPair = seedBreedingPair(incompleteParentBDb, 'incomplete-parent-b-player', { parentB: { complete: false } });
const incompleteParentBRejected = await requestMoonpetBreeding(incompleteParentBDb, baseRequest(incompleteParentBPair, 'incomplete-parent-b'));
assert.equal(incompleteParentBRejected.accepted, false, 'Test 2b: completed Parent A plus incomplete Parent B cannot breed');
assert.equal(incompleteParentBRejected.reason, 'breeding_parent_incomplete');
assert.equal(incompleteParentBDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 0,
  'Test 2b: incomplete Parent B writes no breeding receipt');
assert.equal(incompleteParentBDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id LIKE 'pet:breed:%'`).get().count, 0,
  'Test 2b: incomplete Parent B creates no offspring');

const inactiveDb = createDb();
const inactivePair = seedBreedingPair(inactiveDb, 'inactive-player', { parentB: { active: false } });
const inactiveRejected = await requestMoonpetBreeding(inactiveDb, baseRequest(inactivePair, 'inactive'));
assert.equal(inactiveRejected.accepted, false, 'Inactive parent cannot breed');
assert.equal(inactiveRejected.reason, 'breeding_parent_inactive');

const crossCallerDb = createDb();
const crossCallerPair = seedBreedingPair(crossCallerDb, 'cross-owner-a');
seedPlayer(crossCallerDb, 'cross-owner-b');
const crossCallerAccepted = await requestMoonpetBreeding(crossCallerDb, baseRequest(crossCallerPair, 'shared-request'));
const crossCallerRejected = await requestMoonpetBreeding(crossCallerDb, {
  owner_id: 'cross-owner-b',
  parent_pet_a_id: crossCallerPair.parentA,
  parent_pet_b_id: crossCallerPair.parentB,
  season_key: 'pet-s2026-003',
  request_key: 'shared-request',
  now: '2026-08-19T12:00:00.000Z',
});
assert.equal(crossCallerAccepted.accepted, true, 'Test 2c: Player A can create the original breeding receipt');
assert.equal(crossCallerRejected.accepted, false, 'Test 2c: Player B cannot reuse Player A parent context');
assert.equal(crossCallerRejected.reason, 'breeding_parent_authority_mismatch');
assert.equal(crossCallerRejected.offspring_pet_id, undefined, 'Test 2c: cross-caller rejection leaks no offspring id');
assert.equal(crossCallerDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 1,
  'Test 2c: cross-caller rejection creates no duplicate receipt');
assert.equal(crossCallerDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id LIKE 'pet:breed:%'`).get().count, 1,
  'Test 2c: cross-caller rejection creates no offspring');
assert.equal(crossCallerDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_cooldowns`).get().count, 2,
  'Test 2c: cross-caller rejection performs no recovery cooldown writes');

const receiptContextDb = createDb();
const receiptContextPair = seedBreedingPair(receiptContextDb, 'receipt-owner-a');
seedPlayer(receiptContextDb, 'receipt-owner-b');
const forgedRequest = {
  owner_id: 'receipt-owner-b',
  parent_pet_a_id: receiptContextPair.parentA,
  parent_pet_b_id: receiptContextPair.parentB,
  season_key: 'pet-s2026-003',
  request_key: 'shared-request',
  now: '2026-08-19T12:00:00.000Z',
};
const forgedSeed = await generateBreedingSeed(forgedRequest);
receiptContextDb.database.prepare(`INSERT INTO telegram_pet_breeding_receipts
  (receipt_id, event_key, request_key, telegram_id, parent_pet_a_id, parent_pet_b_id, season_key,
   seed, offspring_pet_id, offspring_slot_number, offspring_traits_json, status, reason, cooldown_available_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 3, '{}', 'accepted', 'breeding_authorized', ?, ?, ?)`)
  .run(`breeding-receipt:${forgedSeed.seed}`, `breeding:${forgedSeed.seed}`, forgedSeed.request_key,
    receiptContextPair.owner, receiptContextPair.parentA, receiptContextPair.parentB, 'pet-s2026-003',
    forgedSeed.seed, `pet:breed:${forgedSeed.seed}`, '2026-08-26T12:00:00.000Z',
    '2026-08-19T12:00:00.000Z', '2026-08-19T12:00:00.000Z');
const receiptContextRejected = await requestMoonpetBreeding(receiptContextDb, forgedRequest);
assert.equal(receiptContextRejected.accepted, false, 'Test 2d: caller cannot recover another authority context receipt');
assert.equal(receiptContextRejected.reason, 'breeding_authority_mismatch');
assert.equal(receiptContextRejected.offspring_pet_id, undefined, 'Test 2d: rejected receipt context leaks no offspring id');
assert.equal(receiptContextDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id LIKE 'pet:breed:%'`).get().count, 0,
  'Test 2d: rejected receipt context performs no recovery writes');
assert.equal(receiptContextDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_cooldowns`).get().count, 0,
  'Test 2d: rejected receipt context writes no cooldown');

const duplicateDb = createDb();
const duplicatePair = seedBreedingPair(duplicateDb, 'duplicate-player');
const duplicateOne = await requestMoonpetBreeding(duplicateDb, baseRequest(duplicatePair, 'same-request'));
const duplicateTwo = await requestMoonpetBreeding(duplicateDb, baseRequest(duplicatePair, 'same-request'));
assert.equal(duplicateOne.accepted, true, 'Test 3: first breeding request is accepted');
assert.equal(duplicateTwo.accepted, true, 'Test 3: duplicate breeding request recovers the accepted receipt');
assert.equal(duplicateTwo.duplicate, true, 'Test 3: second matching request is a duplicate recovery/no-op');
assert.equal(duplicateTwo.recovered, false, 'Test 3: normal duplicate reports no authority recovery');
assert.equal(duplicateOne.offspring_pet_id, duplicateTwo.offspring_pet_id, 'Test 3: duplicate request returns the same offspring');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 1,
  'Test 3: duplicate retries leave one receipt');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id=?`).get(duplicateOne.offspring_pet_id).count, 1,
  'Test 3: duplicate retries leave one offspring instance');
duplicateDb.database.prepare(`DELETE FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?`).run(duplicateOne.offspring_pet_id);
duplicateDb.database.prepare(`DELETE FROM telegram_pet_instances WHERE pet_id=?`).run(duplicateOne.offspring_pet_id);
duplicateDb.database.prepare(`DELETE FROM telegram_pet_season_slots WHERE pet_id=?`).run(duplicateOne.offspring_pet_id);
const recoveredOffspring = await requestMoonpetBreeding(duplicateDb, baseRequest(duplicatePair, 'same-request'));
assert.equal(recoveredOffspring.accepted, true, 'Test 3a: retry recovery accepts an existing receipt with missing offspring');
assert.equal(recoveredOffspring.duplicate, false, 'Test 3a: missing offspring repair reports authority recovery, not a duplicate no-op');
assert.equal(recoveredOffspring.recovered, true, 'Test 3a: missing offspring repair is marked recovered');
assert.equal(recoveredOffspring.offspring_pet_id, duplicateOne.offspring_pet_id, 'Test 3a: recovery preserves the deterministic offspring id');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 1,
  'Test 3a: receipt recovery keeps one breeding receipt');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id=?`).get(duplicateOne.offspring_pet_id).count, 1,
  'Test 3a: receipt recovery rebuilds the missing offspring instance');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_cooldowns WHERE last_receipt_id=?`).get(recoveredOffspring.receipt_id).count, 2,
  'Test 3a: receipt recovery leaves the per-parent cooldown authority intact');

duplicateDb.database.prepare(`DELETE FROM telegram_pet_breeding_cooldowns WHERE last_receipt_id=?`).run(duplicateOne.receipt_id);
const recoveredCooldown = await requestMoonpetBreeding(duplicateDb, baseRequest(duplicatePair, 'same-request'));
assert.equal(recoveredCooldown.accepted, true, 'Test 3b: retry recovery accepts an existing receipt with missing cooldowns');
assert.equal(recoveredCooldown.duplicate, false, 'Test 3b: missing cooldown repair reports authority recovery');
assert.equal(recoveredCooldown.recovered, true, 'Test 3b: missing cooldown repair is marked recovered');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 1,
  'Test 3b: cooldown recovery creates no duplicate receipt');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id=?`).get(duplicateOne.offspring_pet_id).count, 1,
  'Test 3b: cooldown recovery creates no duplicate offspring');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_cooldowns WHERE last_receipt_id=?`).get(recoveredCooldown.receipt_id).count, 2,
  'Test 3b: cooldown recovery restores one cooldown row per parent pet');

const partialFailureDb = createDb();
const partialFailurePair = seedBreedingPair(partialFailureDb, 'partial-failure-player');
partialFailureDb.failNextOffspringPersistence = true;
await assert.rejects(
  requestMoonpetBreeding(partialFailureDb, baseRequest(partialFailurePair, 'partial-failure')),
  /simulated_offspring_persistence_failure/,
  'Test 3c: simulated worker failure happens inside atomic settlement',
);
assert.equal(partialFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 0,
  'Test 3c: atomic partial failure rolls back the accepted receipt');
assert.equal(partialFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id LIKE 'pet:breed:%'`).get().count, 0,
  'Test 3c: atomic partial failure leaves no offspring before retry');
assert.equal(partialFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_cooldowns`).get().count, 0,
  'Test 3c: atomic partial failure leaves no cooldown before retry');
const partialFailureRetry = await requestMoonpetBreeding(partialFailureDb, baseRequest(partialFailurePair, 'partial-failure'));
assert.equal(partialFailureRetry.accepted, true, 'Test 3c: retry after rollback settles a fresh accepted request');
assert.equal(partialFailureRetry.duplicate, false, 'Test 3c: retry after rollback is not a duplicate');
assert.equal(partialFailureRetry.recovered, false, 'Test 3c: retry after rollback does not need authority recovery');
assert.equal(partialFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 1,
  'Test 3c: retry leaves one breeding receipt');
assert.equal(partialFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id=?`).get(partialFailureRetry.offspring_pet_id).count, 1,
  'Test 3c: retry creates one deterministic offspring');
assert.equal(partialFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id LIKE 'pet:breed:%'`).get().count, 1,
  'Test 3c: retry creates no duplicate offspring');
assert.equal(partialFailureDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_cooldowns WHERE last_receipt_id=?`).get(partialFailureRetry.receipt_id).count, 2,
  'Test 3c: retry creates one cooldown row per parent pet');

const deterministicSeedA = await generateBreedingSeed(baseRequest(duplicatePair, 'same-request'));
const deterministicSeedB = await generateBreedingSeed({
  ...baseRequest(duplicatePair, 'same-request'),
  parent_pet_a_id: duplicatePair.parentB,
  parent_pet_b_id: duplicatePair.parentA,
});
assert.equal(deterministicSeedA.seed, deterministicSeedB.seed, 'Test 4: parent order cannot change the deterministic seed');
assert.equal(duplicateOne.receipt_id, `breeding-receipt:${deterministicSeedA.seed}`,
  'Test 4: receipt identity uses the full deterministic breeding seed');
assert.equal(duplicateOne.offspring_pet_id, `pet:breed:${deterministicSeedA.seed}`,
  'Test 4: offspring identity uses the full deterministic breeding seed');
const parentRows = duplicateDb.database.prepare(`SELECT l.*, i.species, i.stage, i.pet_xp, i.level
  FROM telegram_pet_lifecycle_by_pet l JOIN telegram_pet_instances i ON i.pet_id=l.pet_id
  WHERE l.pet_id IN (?, ?) ORDER BY l.pet_id`).all(duplicatePair.parentA, duplicatePair.parentB);
assert.deepEqual(
  generateOffspringTraits(deterministicSeedA.seed, parentRows[0], parentRows[1]),
  generateOffspringTraits(deterministicSeedA.seed, parentRows[0], parentRows[1]),
  'Test 4: same parents and seed produce the same offspring traits',
);
assert.equal(duplicateDb.database.prepare(`SELECT lifecycle_version FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?`).get(duplicateOne.offspring_pet_id).lifecycle_version, 1,
  'Test 4: newborn offspring use lifecycle schema version independent from breeding authority version');

const canonicalForwardDb = createDb();
const canonicalForwardPair = seedBreedingPair(canonicalForwardDb, 'canonical-player');
const canonicalForward = await requestMoonpetBreeding(canonicalForwardDb, baseRequest(canonicalForwardPair, 'canonical-order'));
const canonicalReverseDb = createDb();
const canonicalReversePair = seedBreedingPair(canonicalReverseDb, 'canonical-player');
const canonicalReverse = await requestMoonpetBreeding(canonicalReverseDb, {
  ...baseRequest(canonicalReversePair, 'canonical-order'),
  parent_pet_a_id: canonicalReversePair.parentB,
  parent_pet_b_id: canonicalReversePair.parentA,
});
assert.equal(canonicalForward.seed, canonicalReverse.seed, 'Test 4a: reversed parent request keeps the same seed');
assert.equal(canonicalForward.receipt_id, canonicalReverse.receipt_id, 'Test 4a: reversed parent request keeps the same receipt identity');
assert.equal(canonicalForward.offspring_pet_id, canonicalReverse.offspring_pet_id, 'Test 4a: reversed parent request keeps the same offspring identity');
assert.deepEqual(canonicalForward.offspring, canonicalReverse.offspring,
  'Test 4a: reversed parent request produces identical canonical offspring traits');

const cooldownDb = createDb();
const cooldownPair = seedBreedingPair(cooldownDb, 'cooldown-player');
const cooldownFirst = await requestMoonpetBreeding(cooldownDb, baseRequest(cooldownPair, 'cooldown-one'));
const cooldownSecond = await requestMoonpetBreeding(cooldownDb, baseRequest(cooldownPair, 'cooldown-two'));
assert.equal(cooldownFirst.accepted, true, 'Test 5: initial breeding before cooldown is accepted');
assert.equal(cooldownSecond.accepted, false, 'Test 5: immediate new breeding request is rejected');
assert.equal(cooldownSecond.reason, 'breeding_parent_cooldown');
assert.ok(cooldownSecond.cooldown_available_at > '2026-08-19T12:00:00.000Z',
  'Test 5: cooldown rejection returns a persisted UTC availability timestamp');
assert.deepEqual(
  cooldownDb.database.prepare(`SELECT parent_pet_id, last_receipt_id FROM telegram_pet_breeding_cooldowns ORDER BY parent_pet_id`).all()
    .map((row) => ({ ...row })),
  [
    { parent_pet_id: cooldownPair.parentA, last_receipt_id: cooldownFirst.receipt_id },
    { parent_pet_id: cooldownPair.parentB, last_receipt_id: cooldownFirst.receipt_id },
  ],
  'Test 5: cooldown authority is stored once per parent pet',
);

cooldownDb.database.prepare(`DELETE FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?`).run(cooldownFirst.offspring_pet_id);
cooldownDb.database.prepare(`DELETE FROM telegram_pet_instances WHERE pet_id=?`).run(cooldownFirst.offspring_pet_id);
cooldownDb.database.prepare(`DELETE FROM telegram_pet_season_slots WHERE pet_id=?`).run(cooldownFirst.offspring_pet_id);
const parentC = 'pet:cooldown-player:c';
seedPet(cooldownDb, {
  telegramId: cooldownPair.owner,
  petId: parentC,
  slotNumber: 3,
  species: 'comet_gecko',
  palette: 'cobalt_lime',
  marking: 'star_patch',
});
const parentACooldown = await requestMoonpetBreeding(cooldownDb, {
  ...baseRequest(cooldownPair, 'cooldown-parent-a-c'),
  parent_pet_b_id: parentC,
});
assert.equal(parentACooldown.accepted, false, 'Test 5a: Parent A cannot bypass cooldown by breeding with Parent C');
assert.equal(parentACooldown.reason, 'breeding_parent_cooldown');
assert.equal(parentACooldown.cooldown_parent_pet_id, cooldownPair.parentA,
  'Test 5a: cooldown belongs to the parent pet, not only the original pair');

const exhaustedDb = createDb();
const exhaustedPair = seedBreedingPair(exhaustedDb, 'slot-exhausted-player');
seedPet(exhaustedDb, { telegramId: exhaustedPair.owner, petId: 'pet:slot-exhausted-player:c', slotNumber: 3 });
const exhaustedRejected = await requestMoonpetBreeding(exhaustedDb, baseRequest(exhaustedPair, 'slot-exhausted'));
assert.equal(exhaustedRejected.accepted, false, 'Test 5b: full season roster rejects breeding before receipt creation');
assert.equal(exhaustedRejected.reason, 'breeding_offspring_slot_unavailable');
assert.equal(exhaustedDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 0,
  'Test 5b: slot exhaustion writes no breeding receipt');
assert.equal(exhaustedDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id LIKE 'pet:breed:%'`).get().count, 0,
  'Test 5b: slot exhaustion creates no offspring');
assert.equal(exhaustedDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_cooldowns`).get().count, 0,
  'Test 5b: slot exhaustion writes no cooldown');

const slotRaceDb = createDb();
const slotRacePair = seedBreedingPair(slotRaceDb, 'slot-race-player');
slotRaceDb.reserveSlotBeforeBatch = {
  telegramId: slotRacePair.owner,
  seasonKey: 'pet-s2026-003',
  slotNumber: 3,
  petId: 'pet:slot-race-player:other-settlement',
};
const slotRaceRejected = await requestMoonpetBreeding(slotRaceDb, baseRequest(slotRacePair, 'slot-race'));
assert.equal(slotRaceRejected.accepted, false, 'Test 5c: stale slot selection rejects when another settlement takes the slot');
assert.equal(slotRaceRejected.reason, 'breeding_offspring_slot_unavailable');
assert.equal(slotRaceDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 0,
  'Test 5c: slot race loser leaves no breeding receipt');
assert.equal(slotRaceDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id LIKE 'pet:breed:%'`).get().count, 0,
  'Test 5c: slot race loser leaves no offspring instance');
assert.equal(slotRaceDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_cooldowns`).get().count, 0,
  'Test 5c: slot race loser writes no cooldown');

const seasonDb = createDb();
seedPlayer(seasonDb, 'season-player');
seedPet(seasonDb, { telegramId: 'season-player', petId: 'old-season-a', slotNumber: 1, seasonKey: 'pet-s2026-002' });
seedPet(seasonDb, { telegramId: 'season-player', petId: 'old-season-b', slotNumber: 2, seasonKey: 'pet-s2026-002' });
const seasonRejected = await requestMoonpetBreeding(seasonDb, {
  owner_id: 'season-player',
  parent_pet_a_id: 'old-season-a',
  parent_pet_b_id: 'old-season-b',
  season_key: 'pet-s2026-003',
  request_key: 'old-season',
  now: '2026-08-19T12:00:00.000Z',
});
assert.equal(seasonRejected.accepted, false, 'Test 6: old season pets cannot authorize a new-season breeding request');
assert.equal(seasonRejected.reason, 'breeding_season_authority_mismatch');
assert.equal(seasonDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_breeding_receipts`).get().count, 0,
  'Test 6: rejected season authority mismatch writes no receipt');

console.log('telegram-pets-breeding-authority.test.mjs passed');

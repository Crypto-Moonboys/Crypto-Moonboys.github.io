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
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor() { this.database = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Statement(this, sql); }
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

const inactiveDb = createDb();
const inactivePair = seedBreedingPair(inactiveDb, 'inactive-player', { parentB: { active: false } });
const inactiveRejected = await requestMoonpetBreeding(inactiveDb, baseRequest(inactivePair, 'inactive'));
assert.equal(inactiveRejected.accepted, false, 'Inactive parent cannot breed');
assert.equal(inactiveRejected.reason, 'breeding_parent_inactive');

const duplicateDb = createDb();
const duplicatePair = seedBreedingPair(duplicateDb, 'duplicate-player');
const duplicateOne = await requestMoonpetBreeding(duplicateDb, baseRequest(duplicatePair, 'same-request'));
const duplicateTwo = await requestMoonpetBreeding(duplicateDb, baseRequest(duplicatePair, 'same-request'));
assert.equal(duplicateOne.accepted, true, 'Test 3: first breeding request is accepted');
assert.equal(duplicateTwo.accepted, true, 'Test 3: duplicate breeding request recovers the accepted receipt');
assert.equal(duplicateTwo.duplicate, true, 'Test 3: second matching request is a duplicate recovery/no-op');
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
assert.equal(recoveredOffspring.offspring_pet_id, duplicateOne.offspring_pet_id, 'Test 3a: recovery preserves the deterministic offspring id');
assert.equal(duplicateDb.database.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_instances WHERE pet_id=?`).get(duplicateOne.offspring_pet_id).count, 1,
  'Test 3a: receipt recovery rebuilds the missing offspring instance');

const deterministicSeedA = await generateBreedingSeed(baseRequest(duplicatePair, 'same-request'));
const deterministicSeedB = await generateBreedingSeed({
  ...baseRequest(duplicatePair, 'same-request'),
  parent_pet_a_id: duplicatePair.parentB,
  parent_pet_b_id: duplicatePair.parentA,
});
assert.equal(deterministicSeedA.seed, deterministicSeedB.seed, 'Test 4: parent order cannot change the deterministic seed');
const parentRows = duplicateDb.database.prepare(`SELECT l.*, i.species, i.stage, i.pet_xp, i.level
  FROM telegram_pet_lifecycle_by_pet l JOIN telegram_pet_instances i ON i.pet_id=l.pet_id
  WHERE l.pet_id IN (?, ?) ORDER BY l.pet_id`).all(duplicatePair.parentA, duplicatePair.parentB);
assert.deepEqual(
  generateOffspringTraits(deterministicSeedA.seed, parentRows[0], parentRows[1]),
  generateOffspringTraits(deterministicSeedA.seed, parentRows[0], parentRows[1]),
  'Test 4: same parents and seed produce the same offspring traits',
);

const cooldownDb = createDb();
const cooldownPair = seedBreedingPair(cooldownDb, 'cooldown-player');
const cooldownFirst = await requestMoonpetBreeding(cooldownDb, baseRequest(cooldownPair, 'cooldown-one'));
const cooldownSecond = await requestMoonpetBreeding(cooldownDb, baseRequest(cooldownPair, 'cooldown-two'));
assert.equal(cooldownFirst.accepted, true, 'Test 5: initial breeding before cooldown is accepted');
assert.equal(cooldownSecond.accepted, false, 'Test 5: immediate new breeding request is rejected');
assert.equal(cooldownSecond.reason, 'breeding_parent_cooldown');
assert.ok(cooldownSecond.cooldown_available_at > '2026-08-19T12:00:00.000Z',
  'Test 5: cooldown rejection returns a persisted UTC availability timestamp');

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

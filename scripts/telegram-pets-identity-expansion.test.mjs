import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  MOONPET_EVOLUTIONS,
  MOONPET_PERSONALITY_TRAITS,
  evaluateMoonpetEvolutionRequirements,
  evolveMoonpet,
  formatMoonpetIdentitySummary,
  getMoonpetIdentityAnalytics,
  getMoonpetIdentitySummary,
  recordMoonpetBehaviour,
  recordMoonpetMemory,
  validateMoonpetEvolutionContent,
} from '../workers/moonboys-api/pets/moonpet-identity.js';
import { __rogueliteFoundationTestHooks } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { buildPetProgressSummary } from '../workers/moonboys-api/pets/runtime-phase-5a.js';
import { __petMediaTestHooks as workerHooks } from '../workers/moonboys-api/worker.js';
import { awardPetGrowthMark } from '../workers/moonboys-api/pets/season-completion.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/043_telegram_pet_identity_expansion.sql', import.meta.url), 'utf8');
const stage5Migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/062_moonpet_evolution_stage_5.sql', import.meta.url), 'utf8');
const identitySource = fs.readFileSync(new URL('../workers/moonboys-api/pets/moonpet-identity.js', import.meta.url), 'utf8');
const TEST_SEASON_KEY = 'pet-s2026-003';

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
  constructor() {
    this.database = new DatabaseSync(':memory:'); this.database.exec(schema);
    this.database.exec(`CREATE TABLE telegram_pet_growth_marks(mark_id TEXT PRIMARY KEY,pet_id TEXT,telegram_id TEXT,season_key TEXT,milestone_type TEXT,evidence_key TEXT,earned_day TEXT,earned_at TEXT,UNIQUE(pet_id,season_key,earned_day));
      CREATE TABLE telegram_pet_weekly_crests(crest_id TEXT PRIMARY KEY,pet_id TEXT,telegram_id TEXT,season_key TEXT,season_week INTEGER,qualification_week INTEGER,objective_id TEXT,evidence_key TEXT,earned_at TEXT);
      CREATE TABLE telegram_pet_season_completions(pet_id TEXT,telegram_id TEXT,season_key TEXT,completed_at TEXT,legendary_evolution_id TEXT,growth_marks_earned INTEGER,weekly_crests_earned INTEGER,authority_version INTEGER);`);
    this.queue = Promise.resolve();
  }
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

function seedPetSlot(db, telegramId, slotNumber, acquisitionType = 'free', seedCalendar = true) {
  const petId = `pet:${telegramId}:${TEST_SEASON_KEY}:${slotNumber}`;
  db.database.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`)
    .run(petId, telegramId, TEST_SEASON_KEY, slotNumber, acquisitionType, slotNumber > 1 ? `fixture:slot:${slotNumber}` : null, slotNumber > 1 ? 500 : 0);
  db.database.prepare(`UPDATE telegram_pet_season_slots SET created_at='2026-01-01T00:00:00Z' WHERE pet_id=?`).run(petId);
  db.database.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_name, source_profile_updated_at, status)
    VALUES (?, ?, ?, ?, 'Moonpet', '2026-08-16T00:00:00Z', 'active')`)
    .run(petId, telegramId, TEST_SEASON_KEY, slotNumber);
  if (seedCalendar) {
    for (let day = 1; day <= 60; day += 1) db.database.prepare(`INSERT INTO telegram_pet_growth_marks VALUES (?,?,?,?,?,?,?,?)`)
      .run(`mark:${petId}:${day}`, petId, telegramId, TEST_SEASON_KEY, 'fixture', `fixture:${day}`, new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10), new Date(Date.UTC(2026, 0, day)).toISOString());
    for (let week = 1; week <= 10; week += 1) db.database.prepare(`INSERT INTO telegram_pet_weekly_crests VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(`crest:${petId}:${week}`, petId, telegramId, TEST_SEASON_KEY, week, week, 'fixture', `fixture:${week}`, new Date(Date.UTC(2026, 0, week * 7)).toISOString());
  }
  return petId;
}

function setActivePetSlot(db, telegramId, petId) {
  db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET pet_id=excluded.pet_id, season_key=excluded.season_key, updated_at=CURRENT_TIMESTAMP`)
    .run(telegramId, petId, TEST_SEASON_KEY);
}

function seedPlayer(telegramId = 'identity-player', seedCalendar = true) {
  const db = new D1();
  db.database.prepare('INSERT INTO telegram_users (telegram_id, xp, level) VALUES (?, 0, 1)').run(telegramId);
  db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES (?, 1900, 20)').run(telegramId);
  setActivePetSlot(db, telegramId, seedPetSlot(db, telegramId, 1, 'free', seedCalendar));
  return db;
}

const stage5Db = seedPlayer('stage5-migration');
const stage5PetId = `pet:stage5-migration:${TEST_SEASON_KEY}:1`;
stage5Db.database.prepare(`INSERT INTO telegram_pet_evolutions
  (telegram_id,evolution_id,stage,unlock_event_key) VALUES ('stage5-migration','legendary_moon_guardian',4,'legacy:legendary')`).run();
stage5Db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
  (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,'stage5-migration','legendary_moon_guardian',4,'legacy:pet:legendary')`).run(stage5PetId);
stage5Db.database.exec(stage5Migration);
assert.equal(stage5Db.database.prepare('PRAGMA foreign_key_check').all().length, 0, 'stage 5 migration preserves evolution foreign-key integrity');
assert.equal(stage5Db.database.prepare(`SELECT stage FROM telegram_pet_evolutions WHERE evolution_id='legendary_moon_guardian'`).get().stage, 5,
  'migration 062 promotes legacy account Legendary rows to stage 5');
assert.equal(stage5Db.database.prepare(`SELECT stage FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='legendary_moon_guardian'`).get(stage5PetId).stage, 5,
  'migration 062 promotes legacy per-pet Legendary rows to the final stage');
stage5Db.database.prepare(`INSERT INTO telegram_pet_evolutions
  (telegram_id,evolution_id,stage,unlock_event_key) VALUES ('stage5-migration','moon_guardian',4,'stage5:guardian')`).run();
assert.equal(stage5Db.database.prepare(`SELECT stage FROM telegram_pet_evolutions WHERE evolution_id='moon_guardian'`).get().stage, 4,
  'stage 4 remains available for Moon Guardian after legacy promotion');

const freshDb = seedPlayer('fresh-progression', false);
freshDb.database.prepare(`UPDATE telegram_pet_profiles SET pet_xp=400,level=5 WHERE telegram_id='fresh-progression'`).run();
freshDb.database.prepare(`UPDATE telegram_pet_season_slots SET created_at='2026-01-01T00:00:00Z' WHERE telegram_id='fresh-progression'`).run();
freshDb.database.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES ('fresh-progression','scrap_metal',5)`).run();
assert.equal((await evolveMoonpet(freshDb, { telegram_id: 'fresh-progression', evolution_id: 'moon_egg', event_key: 'fresh:egg' })).accepted, true);
const freshPetId = `pet:fresh-progression:${TEST_SEASON_KEY}:1`;
for (let day = 1; day <= 7; day += 1) await awardPetGrowthMark(freshDb, {
  pet_id: freshPetId, telegram_id: 'fresh-progression', season_key: TEST_SEASON_KEY,
  milestone: 'incubation', evidence_key: `incubation:fresh:${day}`, earned_at: `2026-01-${String(day).padStart(2, '0')}T12:00:00Z`,
});
freshDb.database.prepare(`INSERT INTO telegram_pet_weekly_crests VALUES (?,?,?,?,?,?,?,?,?)`).run(
  'fresh:crest', freshPetId, 'fresh-progression', TEST_SEASON_KEY, 1, 1, 'weekly_boss', 'weekly-boss:fresh:1', '2026-01-07T12:00:00Z',
);
assert.equal((await evolveMoonpet(freshDb, {
  telegram_id: 'fresh-progression', evolution_id: 'street_moonpet', event_key: 'fresh:street',
})).accepted, true, 'fresh pet can earn pre-evolution Growth Marks and progress from egg to Street');

for (const table of ['telegram_pet_evolutions', 'telegram_pet_evolutions_by_pet', 'telegram_pet_personality_traits', 'telegram_pet_memories', 'telegram_pet_identity_events', 'telegram_pet_identity_analytics']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in canonical schema`);
  if (table !== 'telegram_pet_evolutions_by_pet') assert.ok(migration.includes(`CREATE TABLE ${table}`), `${table} must exist in migration 043`);
}
const migrationDb = new DatabaseSync(':memory:');
migrationDb.exec(schema.split('-- Crypto Moonboy Pets identity expansion.')[0]);
migrationDb.prepare("INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('backfill-player', 777, 8)").run();
migrationDb.prepare("INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level, created_at, equipped_armor) VALUES ('backfill-player', 1900, 20, '2026-01-02 03:04:05', 'street_armor')").run();
migrationDb.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot, item_level, item_xp, mastery_xp) VALUES ('backfill-player', 'street_armor', 'armor', 4, 77, 23)").run();
migrationDb.prepare("INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity) VALUES ('backfill-player', 'material', 'neon_scrap', 17)").run();
migrationDb.prepare("INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status, depth, unbanked_pet_xp) VALUES ('backfill-run-row', 'backfill-player', 'backfill-run', 'season', 'active', 4, 31)").run();
const protectedBeforeMigration = {
  community: { ...migrationDb.prepare("SELECT xp, level FROM telegram_users WHERE telegram_id='backfill-player'").get() },
  profile: { ...migrationDb.prepare("SELECT pet_xp, level, equipped_armor FROM telegram_pet_profiles WHERE telegram_id='backfill-player'").get() },
  gear: { ...migrationDb.prepare("SELECT item_key, item_level, item_xp, mastery_xp FROM telegram_pet_equipment_progression WHERE telegram_id='backfill-player'").get() },
  inventory: { ...migrationDb.prepare("SELECT asset_type, asset_key, quantity FROM telegram_pet_inventory WHERE telegram_id='backfill-player'").get() },
  run: { ...migrationDb.prepare("SELECT run_id, status, depth, unbanked_pet_xp FROM telegram_pet_runs WHERE telegram_id='backfill-player'").get() },
};
migrationDb.exec(migration);
assert.equal(migrationDb.prepare('PRAGMA foreign_key_check').all().length, 0, 'migration 043 must preserve referential integrity');
assert.deepEqual({
  community: { ...migrationDb.prepare("SELECT xp, level FROM telegram_users WHERE telegram_id='backfill-player'").get() },
  profile: { ...migrationDb.prepare("SELECT pet_xp, level, equipped_armor FROM telegram_pet_profiles WHERE telegram_id='backfill-player'").get() },
  gear: { ...migrationDb.prepare("SELECT item_key, item_level, item_xp, mastery_xp FROM telegram_pet_equipment_progression WHERE telegram_id='backfill-player'").get() },
  inventory: { ...migrationDb.prepare("SELECT asset_type, asset_key, quantity FROM telegram_pet_inventory WHERE telegram_id='backfill-player'").get() },
  run: { ...migrationDb.prepare("SELECT run_id, status, depth, unbanked_pet_xp FROM telegram_pet_runs WHERE telegram_id='backfill-player'").get() },
}, protectedBeforeMigration, 'migration 043 cannot reset or mutate existing XP, gear, inventory, or runs');
assert.doesNotMatch(migration, /(?:ALTER|DROP|DELETE)\s+(?:TABLE\s+)?telegram_pet_(?:profiles|equipment|inventory|runs)/i,
  'migration 043 must not destructively alter protected pet tables');
assert.doesNotMatch(migration, /UPDATE\s+telegram_pet_(?:profiles|equipment|inventory|runs)/i,
  'migration 043 backfill must write identity tables only');
assert.deepEqual({ ...migrationDb.prepare("SELECT evolution_id, stage, materials_consumed FROM telegram_pet_evolutions WHERE telegram_id='backfill-player'").get() },
  { evolution_id: 'moon_egg', stage: 0, materials_consumed: 1 }, 'migration 043 must give existing Moonpets their permanent starting identity');
assert.equal(migrationDb.prepare("SELECT first_adoption_at FROM telegram_pet_memories WHERE telegram_id='backfill-player'").get().first_adoption_at,
  '2026-01-02 03:04:05', 'migration 043 must preserve existing adoption history');
assert.deepEqual(Object.values(MOONPET_EVOLUTIONS).map(({ name }) => name), [
  'Moon Egg', 'Street Moonpet', 'Cyber Moonpet', 'Elite Moonpet', 'Moon Guardian', 'Legendary Moon Guardian',
]);
assert.deepEqual(Object.values(MOONPET_PERSONALITY_TRAITS).map(({ name }) => name), ['Street Fighter', 'Explorer', 'Loyal', 'Curious']);
assert.equal(validateMoonpetEvolutionContent(), true);
assert.throws(() => validateMoonpetEvolutionContent(Object.values(MOONPET_EVOLUTIONS).map((entry, index) => (
  index === 2 ? { ...entry, requirements: { ...entry.requirements, xp_multiplier: 2 } } : entry
))), /evolution_cannot_change_reward_authority/);

const invalidDb = seedPlayer('invalid-evolution');
assert.deepEqual(await evolveMoonpet(invalidDb, { telegram_id: 'invalid-evolution', evolution_id: 'not_real', event_key: 'invalid' }),
  { accepted: false, duplicate: false, reason: 'invalid_evolution' });
const missingScopeDb = seedPlayer('missing-scope');
missingScopeDb.database.prepare(`DELETE FROM telegram_pet_active_slots WHERE telegram_id='missing-scope'`).run();
missingScopeDb.database.prepare(`DELETE FROM telegram_pet_instances WHERE telegram_id='missing-scope'`).run();
assert.deepEqual(await evolveMoonpet(missingScopeDb, { telegram_id: 'missing-scope', evolution_id: 'moon_egg', event_key: 'missing:scope' }),
  { accepted: false, duplicate: false, reason: 'evolution_authority_unavailable' },
  'missing authoritative pet scope fails closed instead of using account evolution state');

const evolutionDb = seedPlayer();
evolutionDb.database.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('identity-player', 'scrap_metal', 15)").run();
evolutionDb.database.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('identity-player', 'evolution_fragment', 3)").run();
for (const relicId of ['bitcoin_heart', 'cyber_collar']) evolutionDb.database.prepare(
  "INSERT INTO telegram_pet_relics (telegram_id, relic_id, rarity, effects_json) VALUES ('identity-player', ?, 'rare', '{}')",
).run(relicId);
evolutionDb.database.prepare("INSERT INTO telegram_pet_boss_victories (telegram_id, boss_id, victories) VALUES ('identity-player', 'alley_king', 3)").run();
await recordMoonpetMemory(evolutionDb, { telegram_id: 'identity-player', event_key: 'adoption', memory_type: 'first_adoption', milestone: 'first_adoption' });
assert.equal((await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'cyber_moonpet', event_key: 'skip' })).reason,
  'requirements_not_met', 'evolution stages cannot be skipped');
assert.equal((await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'moon_egg', event_key: 'egg' })).accepted, true);
assert.equal((await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'street_moonpet', event_key: 'street' })).accepted, true);
const cyber = await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'cyber_moonpet', event_key: 'cyber' });
assert.equal(cyber.accepted, true, 'valid evolution must succeed');
assert.equal(cyber.duplicate, false);
assert.deepEqual(evolutionDb.database.prepare("SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id='identity-player' ORDER BY material_key").all().map((row) => ({ ...row })), [
  { material_key: 'evolution_fragment', quantity: 0 }, { material_key: 'scrap_metal', quantity: 0 },
]);
const duplicateCyber = await evolveMoonpet(evolutionDb, { telegram_id: 'identity-player', evolution_id: 'cyber_moonpet', event_key: 'cyber-retry' });
assert.equal(duplicateCyber.duplicate, true, 'duplicate evolution cannot happen');
assert.equal(evolutionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_evolutions_by_pet WHERE evolution_id='cyber_moonpet'").get().count, 1);
assert.equal(evolutionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE event_type='evolution_unlock'").get().count, 3);

evolutionDb.database.prepare("UPDATE telegram_pet_profiles SET pet_xp=5000,level=50 WHERE telegram_id='identity-player'").run();
evolutionDb.database.prepare("UPDATE telegram_pet_boss_victories SET victories=15 WHERE telegram_id='identity-player' AND boss_id='alley_king'").run();
evolutionDb.database.prepare("UPDATE telegram_pet_material_balances SET quantity=CASE material_key WHEN 'scrap_metal' THEN 40 ELSE 15 END WHERE telegram_id='identity-player'").run();
for (let index = 3; index <= 10; index += 1) evolutionDb.database.prepare(
  "INSERT INTO telegram_pet_relics (telegram_id,relic_id,rarity,effects_json) VALUES ('identity-player',?,'rare','{}')",
).run(`legendary-relic-${index}`);
const identityPetId = `pet:identity-player:${TEST_SEASON_KEY}:1`;
evolutionDb.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
  (pet_id,telegram_id,evolution_id,stage,unlock_event_key,cosmetic_unlocks,achievement_unlocks,materials_consumed)
  VALUES (?, 'identity-player','elite_moonpet',3,'fixture:elite','[]','[]',1),
         (?, 'identity-player','moon_guardian',4,'fixture:guardian','[]','[]',1)`).run(identityPetId, identityPetId);
evolutionDb.database.prepare(`UPDATE telegram_pet_growth_marks SET season_key='previous-season' WHERE pet_id=?`).run(identityPetId);
evolutionDb.database.prepare(`UPDATE telegram_pet_weekly_crests SET season_key='previous-season' WHERE pet_id=?`).run(identityPetId);
const previousSeasonAuthority = await evaluateMoonpetEvolutionRequirements(evolutionDb, {
  telegram_id: 'identity-player', evolution_id: 'legendary_moon_guardian',
});
assert.equal(previousSeasonAuthority.ready, false, 'previous-season Marks and Crests cannot authorize the active season');
assert.equal(previousSeasonAuthority.reason, 'requirements_not_met', 'successful authority checks explain unmet requirements');
evolutionDb.database.prepare(`UPDATE telegram_pet_growth_marks SET season_key=? WHERE pet_id=?`).run(TEST_SEASON_KEY, identityPetId);
evolutionDb.database.prepare(`UPDATE telegram_pet_weekly_crests SET season_key=? WHERE pet_id=?`).run(TEST_SEASON_KEY, identityPetId);
const legendaryAuthority = await evaluateMoonpetEvolutionRequirements(evolutionDb, {
  telegram_id: 'identity-player', evolution_id: 'legendary_moon_guardian',
});
assert.equal(legendaryAuthority.ready, true, 'qualified calendar evidence and gameplay requirements authorize Legendary');
assert.equal(legendaryAuthority.reason, null);
const inactiveQualifiedPetId = seedPetSlot(evolutionDb, 'identity-player', 2, 'arcade_xp', true);
for (const [stage, evolutionId] of ['moon_egg', 'street_moonpet', 'cyber_moonpet', 'elite_moonpet', 'moon_guardian'].entries()) {
  evolutionDb.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
    (pet_id,telegram_id,evolution_id,stage,unlock_event_key,cosmetic_unlocks,achievement_unlocks,materials_consumed)
    VALUES (?,'identity-player',?,?,?,'[]','[]',1)`).run(inactiveQualifiedPetId, evolutionId, stage, `inactive:${stage}`);
}
const inactiveQualified = await evaluateMoonpetEvolutionRequirements(evolutionDb, {
  telegram_id: 'identity-player', pet_id: inactiveQualifiedPetId, season_key: TEST_SEASON_KEY,
  evolution_id: 'legendary_moon_guardian',
});
assert.equal(inactiveQualified.ready, true, 'an eligible inactive roster pet is evaluated using its own authority scope');
const inactiveBlockedPetId = seedPetSlot(evolutionDb, 'identity-player', 3, 'arcade_xp', false);
evolutionDb.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
  (pet_id,telegram_id,evolution_id,stage,unlock_event_key,cosmetic_unlocks,achievement_unlocks,materials_consumed)
  VALUES (?,'identity-player','moon_egg',0,'inactive:blocked:egg','[]','[]',1)`).run(inactiveBlockedPetId);
const inactiveBlocked = await evaluateMoonpetEvolutionRequirements(evolutionDb, {
  telegram_id: 'identity-player', pet_id: inactiveBlockedPetId, season_key: TEST_SEASON_KEY,
  evolution_id: 'street_moonpet',
});
assert.equal(inactiveBlocked.reason, 'requirements_not_met', 'a blocked inactive roster pet reports its own missing qualification');
const failedValidation = await evaluateMoonpetEvolutionRequirements({
  prepare() { throw new Error('validation failed'); },
}, { telegram_id: 'identity-player', evolution_id: 'legendary_moon_guardian' });
assert.equal(failedValidation.reason, 'evolution_authority_unavailable', 'scope lookup failures are classified as unavailable');
const unavailableValidation = await evaluateMoonpetEvolutionRequirements({
  prepare(sql) {
    if (sql.startsWith('SELECT CASE WHEN')) throw new Error('requirement query failed');
    return evolutionDb.prepare(sql);
  },
}, { telegram_id: 'identity-player', evolution_id: 'legendary_moon_guardian' });
assert.equal(unavailableValidation.reason, 'evolution_authority_unavailable', 'requirement query errors report unavailable authority');
const legendaryGuidance = await workerHooks.getPetEvolutionGuidance(evolutionDb, 'identity-player', { pet_xp: 5000 }, { current_stage: { stage: 4 } });
assert.equal(legendaryGuidance.ready, legendaryAuthority.ready, 'UI guidance uses the same authoritative validation as evolveMoonpet');
const legendary = await evolveMoonpet(evolutionDb, {
  telegram_id: 'identity-player', evolution_id: 'legendary_moon_guardian', event_key: 'legendary:stage-5',
});
assert.equal(legendary.accepted, true, 'Legendary stage 5 persists through the authoritative evolution path');
assert.equal(evolutionDb.database.prepare(`SELECT stage FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='legendary_moon_guardian'`).get(identityPetId).stage, 5);

const concurrentEvolutionDb = seedPlayer('concurrent-evolution');
concurrentEvolutionDb.database.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('concurrent-evolution', 'scrap_metal', 5)").run();
await evolveMoonpet(concurrentEvolutionDb, { telegram_id: 'concurrent-evolution', evolution_id: 'moon_egg', event_key: 'concurrent-egg' });
const concurrentEvolutionCallbacks = await Promise.all(Array.from({ length: 8 }, (_, index) => evolveMoonpet(concurrentEvolutionDb, {
  telegram_id: 'concurrent-evolution', evolution_id: 'street_moonpet', event_key: `concurrent-street:${index}`,
})));
assert.equal(concurrentEvolutionCallbacks.filter(({ duplicate }) => !duplicate).length, 1, 'concurrent evolution callbacks must unlock once');
assert.equal(concurrentEvolutionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_evolutions_by_pet WHERE telegram_id='concurrent-evolution' AND evolution_id='street_moonpet'").get().count, 1,
  'concurrent evolution callbacks must create one evolution row');
assert.equal(concurrentEvolutionDb.database.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='concurrent-evolution' AND material_key='scrap_metal'").get().quantity, 0,
  'concurrent evolution callbacks must consume authoritative materials once');
const concurrentEvolutionMemory = JSON.parse(concurrentEvolutionDb.database.prepare("SELECT milestones FROM telegram_pet_memories WHERE telegram_id='concurrent-evolution'").get().milestones);
assert.equal(concurrentEvolutionMemory.filter((milestone) => milestone === 'evolution_street_moonpet').length, 1,
  'concurrent evolution callbacks must create one memory milestone');
assert.equal(concurrentEvolutionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE milestone_id='evolution_street_moonpet'").get().count, 1,
  'concurrent evolution callbacks must create one memory analytics entry');

const personalityDb = seedPlayer('personality-player');
await recordMoonpetMemory(personalityDb, { telegram_id: 'personality-player', event_key: 'personality-adoption', memory_type: 'first_adoption', milestone: 'first_adoption' });
for (let index = 0; index < 10; index += 1) await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: `arena:day1:${index}`, behaviour: 'combat', day_key: '2026-08-01',
});
assert.deepEqual({ ...personalityDb.database.prepare("SELECT progress, unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_personality_traits WHERE trait_id='street_fighter'").get() },
  { progress: 4, unlocked: 0 }, 'cheap repeated actions must stop at the independent daily personality cap');
const duplicateBehaviour = await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: 'arena:day1:9', behaviour: 'combat', day_key: '2026-08-01',
});
assert.equal(duplicateBehaviour.duplicate, true, 'duplicate callbacks must not double personality progress');
for (let day = 2; day <= 5; day += 1) for (let index = 0; index < 4; index += 1) await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: `arena:day${day}:${index}`, behaviour: 'combat', day_key: `2026-08-0${day}`,
});
assert.deepEqual({ ...personalityDb.database.prepare("SELECT progress, unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_personality_traits WHERE trait_id='street_fighter'").get() },
  { progress: 20, unlocked: 1 });
assert.equal(personalityDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE event_type='personality_unlock'").get().count, 1,
  'repeated behaviour unlocks a trait exactly once');
await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: 'arena:day6:post-unlock', behaviour: 'combat', day_key: '2026-08-06', amount: 2,
});
assert.deepEqual({ ...personalityDb.database.prepare("SELECT progress, unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_personality_traits WHERE trait_id='street_fighter'").get() },
  { progress: 20, unlocked: 1 }, 'unlocked trait progress must remain capped at its permanent threshold');
assert.equal(personalityDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE event_type='personality_unlock'").get().count, 1,
  'post-unlock behaviour cannot duplicate personality unlock analytics');
for (const definition of Object.values(MOONPET_PERSONALITY_TRAITS)) {
  const minimumDays = Math.ceil(definition.threshold / definition.daily_cap);
  assert.ok(minimumDays >= 4 && minimumDays <= 6, `${definition.trait_id} weighting must remain balanced across several days`);
  assert.ok(definition.max_event_progress <= 2, `${definition.trait_id} cannot be unlocked by a single weighted callback`);
}

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
assert.equal(memoryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_events WHERE event_kind='memory'").get().count, 1,
  'duplicate milestone callbacks cannot create unbounded memory event rows');
await assert.rejects(() => recordMoonpetMemory(memoryDb, {
  telegram_id: 'memory-player', event_key: 'ordinary-activity', memory_type: 'activity', activity: 'care',
}), /invalid_moonpet_memory/, 'ordinary activity cannot create memory spam; only important milestones use the memory ledger');
await assert.rejects(() => recordMoonpetMemory(memoryDb, {
  telegram_id: 'memory-player', event_key: 'invented-milestone', memory_type: 'milestone', milestone: 'clicked_button_9000',
}), /invalid_moonpet_memory/, 'memory milestones must come from the bounded important-milestone allowlist');

const summary = await getMoonpetIdentitySummary(evolutionDb, 'identity-player');
assert.equal(summary.current_stage.name, 'Legendary Moon Guardian');
assert.ok(summary.memories.milestones.includes('first_adoption'));
const multiPetDb = seedPlayer('multi-pet-evolution');
multiPetDb.database.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('multi-pet-evolution', 'scrap_metal', 10)").run();
await recordMoonpetMemory(multiPetDb, { telegram_id: 'multi-pet-evolution', event_key: 'multi-adoption', memory_type: 'first_adoption', milestone: 'first_adoption' });
assert.equal((await evolveMoonpet(multiPetDb, { telegram_id: 'multi-pet-evolution', evolution_id: 'moon_egg', event_key: 'multi-starter-egg' })).accepted, true);
assert.equal((await evolveMoonpet(multiPetDb, { telegram_id: 'multi-pet-evolution', evolution_id: 'street_moonpet', event_key: 'multi-starter-street' })).accepted, true);
const paidPetId = seedPetSlot(multiPetDb, 'multi-pet-evolution', 2, 'arcade_xp');
setActivePetSlot(multiPetDb, 'multi-pet-evolution', paidPetId);
assert.equal((await getMoonpetIdentitySummary(multiPetDb, 'multi-pet-evolution')).current_stage.evolution_id, 'moon_egg',
  'switching to a paid pet must not inherit the starter evolution rows');
assert.equal((await evolveMoonpet(multiPetDb, { telegram_id: 'multi-pet-evolution', evolution_id: 'moon_egg', event_key: 'multi-paid-egg' })).accepted, true);
assert.equal((await evolveMoonpet(multiPetDb, { telegram_id: 'multi-pet-evolution', evolution_id: 'street_moonpet', event_key: 'multi-paid-street' })).accepted, true);
assert.equal(multiPetDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_evolutions_by_pet WHERE telegram_id='multi-pet-evolution' AND evolution_id='street_moonpet'").get().count, 2,
  'starter and paid pets must each retain their own street-stage unlock');
const analytics = await getMoonpetIdentityAnalytics(evolutionDb);
assert.equal(analytics.adopted_pets, 1);
assert.ok(analytics.events.some(({ event_type, average_time_to_evolution_seconds }) => event_type === 'evolution_unlock' && Number(average_time_to_evolution_seconds) >= 0));
const personalityAnalytics = await getMoonpetIdentityAnalytics(personalityDb);
assert.equal(personalityAnalytics.events.find(({ event_type }) => event_type === 'personality_unlock').personality_unlock_rate, 1,
  'personality unlock rate must be available for balancing');
const telegramSafeProgress = formatMoonpetIdentitySummary({
  current_stage: { name: '<b>'.repeat(1000) },
  personalities: Array.from({ length: 20 }, () => ({ name: '<Explorer & Loyal>' })),
  memories: { first_boss_id: 'alley_king', favourite_activity: '<Adventure>', biggest_reward_amount: 42, biggest_reward_currency: '<gold>' },
});
assert.ok(telegramSafeProgress.length < 1200, '/petprogress identity output must remain well below Telegram message limits');
assert.equal(/<(?!\/?(?:b|i|code)>)/.test(telegramSafeProgress), false, '/petprogress identity values must be escaped for Telegram HTML mode');
assert.ok(`${buildPetProgressSummary({ traits_json: JSON.stringify(Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`spam_${index}`, 999999]))) })}\n\n${telegramSafeProgress}`.length < 4096,
  'complete /petprogress output is bounded and does not require pagination');

for (const definition of Object.values(MOONPET_EVOLUTIONS)) {
  assert.equal(definition.xp_multiplier, undefined);
  assert.equal(definition.reward_multiplier, undefined);
  assert.equal(definition.cap_increase, undefined);
}
assert.equal(identitySource.includes('awardPetReward('), false, 'identity systems cannot create a reward-authority bypass');
assert.equal(__rogueliteFoundationTestHooks.DAILY_PET_XP_CAP, 1200, 'Pet XP cap must remain unchanged');
assert.equal(__rogueliteFoundationTestHooks.DAILY_COMMUNITY_XP_CAP, 250, 'Community XP cap must remain unchanged');

console.log('Telegram Pets identity expansion tests passed.');

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
  recordMoonpetBiggestReward,
  recordMoonpetBehaviour,
  recordMoonpetMemory,
  validateMoonpetEvolutionContent,
} from '../workers/moonboys-api/pets/moonpet-identity.js';
import { __rogueliteFoundationTestHooks } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { buildPetProgressSummary } from '../workers/moonboys-api/pets/runtime-phase-5a.js';
import { __petMediaTestHooks as workerHooks } from '../workers/moonboys-api/worker.js';
import { awardPetGrowthMark, buildPetLifecycleProgress, isPetLegendary } from '../workers/moonboys-api/pets/season-completion.js';

const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/043_telegram_pet_identity_expansion.sql', import.meta.url), 'utf8');
const stage5Migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/062_moonpet_evolution_stage_5.sql', import.meta.url), 'utf8');
const petIdentityAuthorityMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/070_moonpet_pet_identity_achievement_authority.sql', import.meta.url), 'utf8');
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
  (telegram_id,evolution_id,stage,unlock_event_key,unlocked_at) VALUES ('stage5-migration','legendary_moon_guardian',4,'legacy:legendary','2026-01-04T05:06:07Z')`).run();
stage5Db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
  (pet_id,telegram_id,evolution_id,stage,unlock_event_key,unlocked_at) VALUES (?,'stage5-migration','legendary_moon_guardian',4,'legacy:pet:legendary','2026-01-08T09:10:11Z')`).run(stage5PetId);
stage5Db.database.exec(stage5Migration);
assert.equal(stage5Db.database.prepare('PRAGMA foreign_key_check').all().length, 0, 'stage 5 migration preserves evolution foreign-key integrity');
assert.deepEqual({ ...stage5Db.database.prepare(`SELECT telegram_id, stage, unlock_event_key, unlocked_at FROM telegram_pet_evolutions WHERE evolution_id='legendary_moon_guardian'`).get() }, {
  telegram_id: 'stage5-migration',
  stage: 5,
  unlock_event_key: 'legacy:legendary',
  unlocked_at: '2026-01-04T05:06:07Z',
},
  'migration 062 promotes legacy account Legendary rows to stage 5');
assert.deepEqual({ ...stage5Db.database.prepare(`SELECT pet_id, telegram_id, stage, unlock_event_key, unlocked_at
  FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='legendary_moon_guardian'`).get(stage5PetId) }, {
  pet_id: stage5PetId,
  telegram_id: 'stage5-migration',
  stage: 5,
  unlock_event_key: 'legacy:pet:legendary',
  unlocked_at: '2026-01-08T09:10:11Z',
},
  'migration 062 promotes legacy per-pet Legendary rows to the final stage');
assert.equal(await isPetLegendary(stage5Db, stage5PetId, TEST_SEASON_KEY), true,
  'a migrated beta Legendary remains final-evolution authority for season completion');
const migratedLegendaryRetry = await evolveMoonpet(stage5Db, {
  telegram_id: 'stage5-migration', evolution_id: 'legendary_moon_guardian', event_key: 'stage5:migrated:retry',
});
assert.deepEqual({
  ...migratedLegendaryRetry,
  evolution: { ...migratedLegendaryRetry.evolution },
}, {
  accepted: true,
  duplicate: true,
  reason: 'already_evolved',
  evolution: {
    evolution_id: 'legendary_moon_guardian',
    stage: 5,
    unlocked_at: '2026-01-08T09:10:11Z',
  },
}, 'a migrated Legendary pet stays in the valid final state and does not regress into a stage-4 gate');
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

const migration070Db = new DatabaseSync(':memory:');
migration070Db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY, xp INTEGER, level INTEGER);
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY, pet_xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1, moon_gold INTEGER DEFAULT 0);
  CREATE TABLE telegram_pet_season_slots (
    pet_id TEXT NOT NULL, telegram_id TEXT NOT NULL, season_key TEXT NOT NULL, slot_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', UNIQUE(pet_id, telegram_id, season_key)
  );
  CREATE TABLE telegram_pet_instances (pet_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, season_key TEXT NOT NULL, slot_number INTEGER, status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE telegram_pet_material_balances (telegram_id TEXT, material_key TEXT, quantity INTEGER);
  CREATE TABLE telegram_pet_personality_traits (telegram_id TEXT NOT NULL, trait_id TEXT NOT NULL, progress INTEGER DEFAULT 0, unlocked_at TEXT, updated_at TEXT, PRIMARY KEY(telegram_id, trait_id));
  CREATE TABLE telegram_pet_memories (telegram_id TEXT PRIMARY KEY, first_adoption_at TEXT, first_run_at TEXT, first_extraction_at TEXT, first_boss_victory_at TEXT, first_boss_id TEXT, biggest_reward_amount INTEGER DEFAULT 0, biggest_reward_currency TEXT, favourite_activity TEXT, total_runs INTEGER DEFAULT 0, total_bosses_defeated INTEGER DEFAULT 0, milestones TEXT DEFAULT '[]', combat_actions INTEGER DEFAULT 0, exploration_actions INTEGER DEFAULT 0, care_actions INTEGER DEFAULT 0, event_actions INTEGER DEFAULT 0, adventure_actions INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
  CREATE TABLE telegram_pet_boss_victories (telegram_id TEXT NOT NULL, boss_id TEXT NOT NULL, victories INTEGER DEFAULT 0, updated_at TEXT, PRIMARY KEY(telegram_id, boss_id));
  CREATE TABLE telegram_pet_identity_events (event_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, event_key TEXT NOT NULL, event_kind TEXT NOT NULL, payload TEXT DEFAULT '{}', day_key TEXT DEFAULT '2026-08-01', progress_delta INTEGER DEFAULT 0, created_at TEXT, applied_at TEXT, UNIQUE(telegram_id,event_key,event_kind));
  CREATE TABLE telegram_pet_identity_analytics (analytics_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, event_type TEXT NOT NULL, evolution_id TEXT, trait_id TEXT, milestone_id TEXT, duration_seconds INTEGER, event_data TEXT DEFAULT '{}', created_at TEXT);
  CREATE TABLE telegram_pet_achievements (telegram_id TEXT NOT NULL, achievement_id TEXT NOT NULL, progress INTEGER DEFAULT 0, target INTEGER, unlocked_at TEXT, updated_at TEXT, PRIMARY KEY(telegram_id,achievement_id));
`);
migration070Db.prepare("INSERT INTO telegram_users VALUES ('old-owner', 777, 8)").run();
migration070Db.prepare("INSERT INTO telegram_pet_profiles VALUES ('old-owner', 1234, 12, 999)").run();
migration070Db.prepare("INSERT INTO telegram_pet_season_slots VALUES ('pet:old-owner:season:1', 'old-owner', 'season', 1, 'active')").run();
migration070Db.prepare("INSERT INTO telegram_pet_instances VALUES ('pet:old-owner:season:1', 'old-owner', 'season', 1, 'active')").run();
migration070Db.prepare("INSERT INTO telegram_pet_material_balances VALUES ('old-owner', 'scrap_metal', 42)").run();
migration070Db.prepare("INSERT INTO telegram_pet_memories (telegram_id, first_boss_id, total_bosses_defeated) VALUES ('old-owner', 'wrong_pet_boss', 99)").run();
migration070Db.prepare("INSERT INTO telegram_pet_personality_traits VALUES ('old-owner', 'street_fighter', 20, '2026-08-01', '2026-08-01')").run();
migration070Db.prepare("INSERT INTO telegram_pet_boss_victories VALUES ('old-owner', 'alley_king', 99, '2026-08-01')").run();
migration070Db.prepare("INSERT INTO telegram_pet_identity_events (event_id, telegram_id, event_key, event_kind) VALUES ('contaminated-event', 'old-owner', 'source', 'memory')").run();
migration070Db.prepare("INSERT INTO telegram_pet_identity_analytics (analytics_id, telegram_id, event_type) VALUES ('contaminated-analytics', 'old-owner', 'memory_milestone')").run();
migration070Db.prepare("INSERT INTO telegram_pet_achievements VALUES ('old-owner', 'boss_breaker', 5, 5, '2026-08-01', '2026-08-01')").run();
migration070Db.exec(petIdentityAuthorityMigration);
assert.equal(migration070Db.prepare("SELECT COUNT(*) AS count FROM telegram_pet_memories").get().count, 0,
  'migration 070 resets contaminated account-scoped memories');
assert.equal(migration070Db.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits").get().count, 0,
  'migration 070 resets contaminated account-scoped personality traits');
assert.equal(migration070Db.prepare("SELECT COUNT(*) AS count FROM telegram_pet_achievements").get().count, 0,
  'migration 070 resets contaminated account-scoped achievements');
assert.deepEqual({ ...migration070Db.prepare("SELECT xp, level FROM telegram_users WHERE telegram_id='old-owner'").get() }, { xp: 777, level: 8 },
  'migration 070 preserves Telegram user authority');
assert.deepEqual({ ...migration070Db.prepare("SELECT pet_xp, level, moon_gold FROM telegram_pet_profiles WHERE telegram_id='old-owner'").get() }, { pet_xp: 1234, level: 12, moon_gold: 999 },
  'migration 070 preserves profile wallet/progression authority');
assert.equal(migration070Db.prepare("SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id='old-owner' AND material_key='scrap_metal'").get().quantity, 42,
  'migration 070 preserves account-owned material authority');
assert.equal(migration070Db.prepare("SELECT cutover_key FROM moonpet_identity_authority_cutovers").get().cutover_key, 'pet_identity_achievement_authority_v1',
  'migration 070 writes a cutover marker');
migration070Db.exec(petIdentityAuthorityMigration);
assert.equal(migration070Db.prepare('PRAGMA foreign_key_check').all().length, 0, 'migration 070 retry remains schema-valid');
assert.equal(migration070Db.prepare("SELECT COUNT(*) AS count FROM moonpet_identity_authority_cutovers").get().count, 1,
  'migration 070 retry keeps a single cutover marker');
const canonical070Db = new DatabaseSync(':memory:');
canonical070Db.exec(schema);
canonical070Db.exec(petIdentityAuthorityMigration);
canonical070Db.exec(petIdentityAuthorityMigration);
assert.equal(canonical070Db.prepare('PRAGMA foreign_key_check').all().length, 0,
  'migration 070 can replay against canonical schema fixtures');

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
const evolveSource = identitySource.slice(identitySource.indexOf('export async function evolveMoonpet'), identitySource.indexOf('export async function getMoonpetIdentitySummary'));
assert.doesNotMatch(evolveSource, /\btelegram_pet_evolutions\b(?!_by_pet)/,
  'the evolution mutation path contains no account-level evolution fallback');

const evolutionDb = seedPlayer();
evolutionDb.database.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('identity-player', 'scrap_metal', 15)").run();
evolutionDb.database.prepare("INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES ('identity-player', 'evolution_fragment', 3)").run();
for (const relicId of ['bitcoin_heart', 'cyber_collar']) evolutionDb.database.prepare(
  "INSERT INTO telegram_pet_relics (telegram_id, relic_id, rarity, effects_json) VALUES ('identity-player', ?, 'rare', '{}')",
).run(relicId);
const identityPetId = `pet:identity-player:${TEST_SEASON_KEY}:1`;
evolutionDb.database.prepare("INSERT INTO telegram_pet_boss_victories (pet_id, telegram_id, season_key, boss_id, victories) VALUES (?, 'identity-player', ?, 'alley_king', 3)").run(identityPetId, TEST_SEASON_KEY);
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
evolutionDb.database.prepare("UPDATE telegram_pet_boss_victories SET victories=15 WHERE pet_id=? AND telegram_id='identity-player' AND boss_id='alley_king'").run(identityPetId);
evolutionDb.database.prepare("UPDATE telegram_pet_material_balances SET quantity=CASE material_key WHEN 'scrap_metal' THEN 40 ELSE 15 END WHERE telegram_id='identity-player'").run();
for (let index = 3; index <= 10; index += 1) evolutionDb.database.prepare(
  "INSERT INTO telegram_pet_relics (telegram_id,relic_id,rarity,effects_json) VALUES ('identity-player',?,'rare','{}')",
).run(`legendary-relic-${index}`);
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
evolutionDb.database.prepare("INSERT INTO telegram_pet_boss_victories (pet_id, telegram_id, season_key, boss_id, victories) VALUES (?, 'identity-player', ?, 'alley_king', 15)").run(inactiveQualifiedPetId, TEST_SEASON_KEY);
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
const inactiveQualifiedLifecycle = await buildPetLifecycleProgress(evolutionDb, inactiveQualifiedPetId, TEST_SEASON_KEY);
assert.equal(inactiveQualifiedLifecycle.evolution_ready, false,
  'inactive roster lifecycle guidance does not infer next Legendary level from migrated zero instance counters');
assert.equal(inactiveQualifiedLifecycle.requirements.pet_level.current, 45,
  'inactive roster lifecycle guidance only infers the current Moon Guardian level already earned');
assert.equal(inactiveQualifiedLifecycle.requirements.pet_level.required, 50,
  'inactive roster lifecycle guidance keeps the next Legendary level requirement visible');
const inactiveBlockedPetId = seedPetSlot(evolutionDb, 'identity-player', 3, 'arcade_xp', false);
evolutionDb.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
  (pet_id,telegram_id,evolution_id,stage,unlock_event_key,cosmetic_unlocks,achievement_unlocks,materials_consumed)
  VALUES (?,'identity-player','moon_egg',0,'inactive:blocked:egg','[]','[]',1)`).run(inactiveBlockedPetId);
const inactiveBlocked = await evaluateMoonpetEvolutionRequirements(evolutionDb, {
  telegram_id: 'identity-player', pet_id: inactiveBlockedPetId, season_key: TEST_SEASON_KEY,
  evolution_id: 'street_moonpet',
});
assert.equal(inactiveBlocked.reason, 'requirements_not_met', 'a blocked inactive roster pet reports its own missing qualification');
const inactiveBlockedLifecycle = await buildPetLifecycleProgress(evolutionDb, inactiveBlockedPetId, TEST_SEASON_KEY);
assert.equal(inactiveBlockedLifecycle.evolution_ready, false,
  'inactive roster lifecycle guidance does not borrow the active pet readiness');
assert.equal(inactiveBlockedLifecycle.authority_reason, 'requirements_not_met',
  'inactive roster lifecycle guidance exposes the requested pet blocking reason');
const partialScope = await evaluateMoonpetEvolutionRequirements(evolutionDb, {
  telegram_id: 'identity-player', pet_id: inactiveQualifiedPetId, evolution_id: 'legendary_moon_guardian',
});
assert.equal(partialScope.reason, 'evolution_authority_unavailable',
  'an incomplete explicit pet scope cannot silently fall back to the active pet');
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
const concurrentEvolutionMemory = JSON.parse(concurrentEvolutionDb.database.prepare("SELECT milestones FROM telegram_pet_memories WHERE pet_id='pet:concurrent-evolution:pet-s2026-003:1'").get().milestones);
assert.equal(concurrentEvolutionMemory.filter((milestone) => milestone === 'evolution_street_moonpet').length, 1,
  'concurrent evolution callbacks must create one memory milestone');
assert.equal(concurrentEvolutionDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE milestone_id='evolution_street_moonpet'").get().count, 1,
  'concurrent evolution callbacks must create one memory analytics entry');

const personalityDb = seedPlayer('personality-player');
await recordMoonpetMemory(personalityDb, { telegram_id: 'personality-player', event_key: 'personality-adoption', memory_type: 'first_adoption', milestone: 'first_adoption' });
for (let index = 0; index < 10; index += 1) await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: `arena:day1:${index}`, behaviour: 'combat', day_key: '2026-08-01',
});
assert.deepEqual({ ...personalityDb.database.prepare("SELECT progress, unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_personality_traits WHERE pet_id='pet:personality-player:pet-s2026-003:1' AND trait_id='street_fighter'").get() },
  { progress: 4, unlocked: 0 }, 'cheap repeated actions must stop at the independent daily personality cap');
const duplicateBehaviour = await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: 'arena:day1:9', behaviour: 'combat', day_key: '2026-08-01',
});
assert.equal(duplicateBehaviour.duplicate, true, 'duplicate callbacks must not double personality progress');
for (let day = 2; day <= 5; day += 1) for (let index = 0; index < 4; index += 1) await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: `arena:day${day}:${index}`, behaviour: 'combat', day_key: `2026-08-0${day}`,
});
assert.deepEqual({ ...personalityDb.database.prepare("SELECT progress, unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_personality_traits WHERE pet_id='pet:personality-player:pet-s2026-003:1' AND trait_id='street_fighter'").get() },
  { progress: 20, unlocked: 1 });
assert.equal(personalityDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_analytics WHERE event_type='personality_unlock'").get().count, 1,
  'repeated behaviour unlocks a trait exactly once');
await recordMoonpetBehaviour(personalityDb, {
  telegram_id: 'personality-player', event_key: 'arena:day6:post-unlock', behaviour: 'combat', day_key: '2026-08-06', amount: 2,
});
assert.deepEqual({ ...personalityDb.database.prepare("SELECT progress, unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_personality_traits WHERE pet_id='pet:personality-player:pet-s2026-003:1' AND trait_id='street_fighter'").get() },
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
assert.deepEqual({ ...memoryDb.database.prepare("SELECT first_boss_id, total_bosses_defeated, biggest_reward_amount FROM telegram_pet_memories WHERE pet_id='pet:memory-player:pet-s2026-003:1'").get() },
  { first_boss_id: 'alley_king', total_bosses_defeated: 1, biggest_reward_amount: 42 });
assert.equal(memoryDb.database.prepare("SELECT victories FROM telegram_pet_boss_victories WHERE pet_id='pet:memory-player:pet-s2026-003:1' AND telegram_id='memory-player' AND boss_id='alley_king'").get().victories, 1);
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

const isolationDb = seedPlayer('isolation-player', false);
const petA = `pet:isolation-player:${TEST_SEASON_KEY}:1`;
const petB = seedPetSlot(isolationDb, 'isolation-player', 2, 'arcade_xp', false);
const petC = seedPetSlot(isolationDb, 'isolation-player', 3, 'arcade_xp', false);
assert.equal(isolationDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_season_slots WHERE telegram_id='isolation-player' AND status='active'").get().count, 3,
  'one account can retain three active seasonal pets');
await recordMoonpetMemory(isolationDb, {
  telegram_id: 'isolation-player', pet_id: petA, season_key: TEST_SEASON_KEY,
  event_key: 'source:first-run:a', memory_type: 'first_run', milestone: 'first_run',
});
isolationDb.database.prepare(`INSERT INTO telegram_pet_events
  (id, pet_id, telegram_id, event_type, event_key, season_key, day_key, week_key, status, reason, metadata)
  VALUES ('identity-source-boss-a', ?, 'isolation-player', 'weekly_boss', 'source:boss:a', ?, '2026-08-01', '2026-W31', 'accepted', 'weekly_boss_attempt', ?)`)
  .run(petA, TEST_SEASON_KEY, JSON.stringify({ source: 'pet_weekly_boss' }));
await recordMoonpetMemory(isolationDb, {
  telegram_id: 'isolation-player', pet_id: petA, season_key: TEST_SEASON_KEY,
  event_key: 'source:boss:a', source_event_key: 'source:boss:a', source_event_type: 'weekly_boss', source_event_reason: 'weekly_boss_attempt',
  source_event_category: 'pet_weekly_boss', memory_type: 'boss_victory', boss_id: 'alley_king', milestone: 'first_boss_victory',
});
for (let day = 1; day <= 5; day += 1) for (let index = 0; index < 4; index += 1) await recordMoonpetBehaviour(isolationDb, {
  telegram_id: 'isolation-player', pet_id: petA, season_key: TEST_SEASON_KEY,
  event_key: `source:combat:a:${day}:${index}`, behaviour: 'combat', day_key: `2026-08-0${day}`,
});
assert.deepEqual(isolationDb.database.prepare(`SELECT pet_id, first_run_at IS NOT NULL AS first_run, total_bosses_defeated
  FROM telegram_pet_memories ORDER BY pet_id`).all().map((row) => ({ ...row })), [
  { pet_id: petA, first_run: 1, total_bosses_defeated: 1 },
], 'Pet A memory events do not create identity state for Pet B or Pet C');
assert.equal(isolationDb.database.prepare("SELECT victories FROM telegram_pet_boss_victories WHERE pet_id=? AND boss_id='alley_king'").get(petA).victories, 1,
  'Pet A boss victory is recorded on Pet A');
assert.equal(isolationDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_boss_victories WHERE pet_id IN (?, ?)").get(petB, petC).count, 0,
  'Pet A boss victory does not satisfy Pet B or Pet C boss history');
assert.equal(isolationDb.database.prepare("SELECT unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='street_fighter'").get(petA).unlocked, 1,
  'Pet A personality progress unlocks Pet A trait');
assert.equal(isolationDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id IN (?, ?)").get(petB, petC).count, 0,
  'Pet A personality progress does not unlock traits for Pet B or Pet C');
const retry = await recordMoonpetMemory(isolationDb, {
  telegram_id: 'isolation-player', pet_id: petA, season_key: TEST_SEASON_KEY,
  event_key: 'source:boss:a', source_event_key: 'source:boss:a', source_event_type: 'weekly_boss', source_event_reason: 'weekly_boss_attempt',
  source_event_category: 'pet_weekly_boss', memory_type: 'boss_victory', boss_id: 'alley_king', milestone: 'first_boss_victory',
});
assert.equal(retry.duplicate, true, 'duplicate source events are idempotent per pet_id');
const crossPetSourceReplay = await recordMoonpetMemory(isolationDb, {
  telegram_id: 'isolation-player', pet_id: petB, season_key: TEST_SEASON_KEY,
  event_key: 'source:boss:a', source_event_key: 'source:boss:a', source_event_type: 'weekly_boss', source_event_reason: 'weekly_boss_attempt',
  source_event_category: 'pet_weekly_boss', memory_type: 'boss_victory', boss_id: 'alley_king', milestone: 'first_boss_victory',
});
assert.equal(crossPetSourceReplay.accepted, false, 'the same accepted source event cannot be used for another pet');
assert.equal(crossPetSourceReplay.reason, 'source_event_pet_mismatch');
assert.equal(isolationDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_identity_events WHERE event_key='source:boss:a'").get().count, 1,
  'accepted source-event idempotency is scoped to the participating pet only');
isolationDb.database.prepare(`INSERT INTO telegram_pet_events
  (id, pet_id, telegram_id, event_type, event_key, season_key, day_key, week_key, status, reason, metadata)
  VALUES ('identity-source-random-a', ?, 'isolation-player', 'random_event', 'source:random:a', ?, '2026-08-01', '2026-W31', 'accepted', 'random:choice:reward', ?)`)
  .run(petA, TEST_SEASON_KEY, JSON.stringify({ source: 'telegram_bot' }));
setActivePetSlot(isolationDb, 'isolation-player', petB);
const sourceScopedBehaviour = await recordMoonpetBehaviour(isolationDb, {
  telegram_id: 'isolation-player', event_key: 'source:random:a:personality', source_event_key: 'source:random:a', source_event_type: 'random_event',
  behaviour: 'event', activity: 'event',
});
assert.equal(sourceScopedBehaviour.accepted, true, 'source-event-key-only behaviour resolves the participating pet before active-pet fallback');
assert.equal(isolationDb.database.prepare("SELECT progress FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='curious'").get(petA).progress, 1,
  'source-event-key-only behaviour writes personality progress to the accepted source-event pet');
assert.equal(isolationDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='curious'").get(petB).count, 0,
  'source-event-key-only behaviour does not write to the current active pet');
const sourceScopedReward = await recordMoonpetBiggestReward(isolationDb, {
  telegram_id: 'isolation-player', event_key: 'source:random:a:biggest-reward', source_event_key: 'source:random:a', source_event_type: 'random_event',
  reward_amount: 333, reward_currency: 'moon_gold',
});
assert.equal(sourceScopedReward.accepted, true, 'source-event-key-only biggest reward resolves the participating pet before active-pet fallback');
assert.equal(isolationDb.database.prepare('SELECT biggest_reward_amount FROM telegram_pet_memories WHERE pet_id=?').get(petA).biggest_reward_amount, 333,
  'source-event-key-only biggest reward writes to the accepted source-event pet');
assert.equal(isolationDb.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_memories WHERE pet_id=?').get(petB).count, 0,
  'source-event-key-only biggest reward does not create memory for the current active pet');

function seedProducerAuthorityPlayer(telegramId) {
  const db = seedPlayer(telegramId, false);
  const firstPet = `pet:${telegramId}:${TEST_SEASON_KEY}:1`;
  const secondPet = seedPetSlot(db, telegramId, 2, 'arcade_xp', false);
  db.database.prepare(`UPDATE telegram_pet_profiles
    SET pet_xp=5200, level=52, energy=100, hunger=0, happiness=90, cleanliness=90, health=100,
      moon_gold=1000, moon_crystals=100, style_tokens=100
    WHERE telegram_id=?`).run(telegramId);
  db.database.prepare(`UPDATE telegram_pet_instances
    SET pet_xp=5200, level=52, energy=100, hunger=0, happiness=90, cleanliness=90, health=100
    WHERE pet_id=?`).run(firstPet);
  db.database.prepare(`UPDATE telegram_pet_instances
    SET pet_xp=10, level=1, energy=70, hunger=0, happiness=70, cleanliness=70, health=75
    WHERE pet_id=?`).run(secondPet);
  return { db, firstPet, secondPet };
}

function switchAwayAfterSource(db, telegramId, targetPetId) {
  return async () => { setActivePetSlot(db, telegramId, targetPetId); };
}

const randomProducer = seedProducerAuthorityPlayer('producer-random-player');
const randomEventKey = 'moon_crate_found-producer-random';
const randomResult = await workerHooks.processPetRandomEvent(randomProducer.db, 'producer-random-player', 'flip_it_fast', {
  event_key: randomEventKey,
  before_identity_write: switchAwayAfterSource(randomProducer.db, 'producer-random-player', randomProducer.secondPet),
});
assert.equal(randomResult.accepted, true, 'random event producer accepts under Pet A authority');
assert.equal(randomProducer.db.database.prepare('SELECT pet_id FROM telegram_pet_events WHERE event_key=?').get(randomEventKey).pet_id, randomProducer.firstPet,
  'random event source row stores Pet A authority before identity writes');
assert.equal(randomProducer.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='curious'").get(randomProducer.firstPet).count, 1,
  'random event personality lands on Pet A after the active pet switches');
assert.ok(randomProducer.db.database.prepare('SELECT biggest_reward_amount FROM telegram_pet_memories WHERE pet_id=?').get(randomProducer.firstPet).biggest_reward_amount > 0,
  'random event biggest reward lands on Pet A after the active pet switches');
assert.equal(randomProducer.db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=?').get(randomProducer.secondPet).count, 0,
  'random event does not create personality rows on Pet B');
assert.equal(randomProducer.db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_memories WHERE pet_id=?').get(randomProducer.secondPet).count, 0,
  'random event does not create memory rows on Pet B');

const adventureProducer = seedProducerAuthorityPlayer('producer-adventure-player');
const adventureEventKey = 'moon_alley-producer-adventure';
const adventureResult = await workerHooks.processPetAdventure(adventureProducer.db, 'producer-adventure-player', 'cash_out', {
  event_key: adventureEventKey,
  before_identity_write: switchAwayAfterSource(adventureProducer.db, 'producer-adventure-player', adventureProducer.secondPet),
});
assert.equal(adventureResult.accepted, true, 'adventure producer accepts under Pet A authority');
assert.equal(adventureProducer.db.database.prepare('SELECT pet_id FROM telegram_pet_events WHERE event_key=?').get(adventureEventKey).pet_id, adventureProducer.firstPet,
  'adventure source row stores Pet A authority before identity writes');
assert.equal(adventureProducer.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='explorer'").get(adventureProducer.firstPet).count, 1,
  'adventure personality lands on Pet A after the active pet switches');
assert.equal(adventureProducer.db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=?').get(adventureProducer.secondPet).count, 0,
  'adventure does not create personality rows on Pet B');
assert.equal(adventureProducer.db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_memories WHERE pet_id=?').get(adventureProducer.secondPet).count, 0,
  'adventure does not create memory rows on Pet B');

const arenaProducer = seedProducerAuthorityPlayer('producer-arena-player');
const arenaEventKey = 'pet_arena:producer-arena-1:producer-arena-player';
const arenaResult = await workerHooks.awardPetKaijuPlayerResult(arenaProducer.db, 'producer-arena-player', {
  match_id: 'producer-arena-1',
  mode: 'pet_arena',
}, 'arena_win', { pet_xp: 24, moon_gold: 30, happiness: 5 }, {
  before_identity_write: switchAwayAfterSource(arenaProducer.db, 'producer-arena-player', arenaProducer.secondPet),
});
assert.equal(arenaResult.accepted, true, 'pet arena producer accepts under Pet A authority');
assert.equal(arenaProducer.db.database.prepare('SELECT pet_id FROM telegram_pet_events WHERE event_key=?').get(arenaEventKey).pet_id, arenaProducer.firstPet,
  'pet arena source row stores Pet A authority before identity writes');
assert.equal(arenaProducer.db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=? AND trait_id='street_fighter'").get(arenaProducer.firstPet).count, 1,
  'pet arena personality lands on Pet A after the active pet switches');
assert.equal(arenaProducer.db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_personality_traits WHERE pet_id=?').get(arenaProducer.secondPet).count, 0,
  'pet arena does not create personality rows on Pet B');
assert.equal(arenaProducer.db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_memories WHERE pet_id=?').get(arenaProducer.secondPet).count, 0,
  'pet arena does not create memory rows on Pet B');

const jobProducer = seedProducerAuthorityPlayer('producer-job-player');
const jobEventKey = 'producer-job-street-artist';
const jobResult = await workerHooks.processPetJob(jobProducer.db, 'producer-job-player', 'street_artist', {
  event_key: jobEventKey,
  before_identity_write: switchAwayAfterSource(jobProducer.db, 'producer-job-player', jobProducer.secondPet),
});
assert.equal(jobResult.accepted, true, 'job producer accepts under Pet A authority');
assert.equal(jobProducer.db.database.prepare('SELECT pet_id FROM telegram_pet_events WHERE event_key=?').get(jobEventKey).pet_id, jobProducer.firstPet,
  'job source row stores Pet A authority before achievement sync');
assert.equal(jobProducer.db.database.prepare("SELECT progress FROM telegram_pet_achievements WHERE pet_id=? AND achievement_id='honest_hustle'").get(jobProducer.firstPet).progress, 1,
  'syncPetAchievementsForPet counts job_actions for Pet A');
assert.equal(jobProducer.db.database.prepare("SELECT progress FROM telegram_pet_achievements WHERE pet_id=? AND achievement_id='job_hopper'").get(jobProducer.firstPet).progress, 1,
  'syncPetAchievementsForPet counts distinct_jobs for Pet A');
assert.equal(jobProducer.db.database.prepare('SELECT COUNT(*) AS count FROM telegram_pet_achievements WHERE pet_id=?').get(jobProducer.secondPet).count, 0,
  'job achievement sync does not create Pet B progress from Pet A source events');

setActivePetSlot(isolationDb, 'isolation-player', petC);
isolationDb.database.prepare(`INSERT INTO telegram_pet_events
  (id, pet_id, telegram_id, event_type, event_key, season_key, day_key, week_key, status, reason, metadata)
  VALUES ('identity-source-before-switch', ?, 'isolation-player', 'daily_moon_run', 'accepted-before-switch-source', ?, '2026-08-01', '2026-W31', 'accepted', 'daily_moon_run_terminal', ?)`)
  .run(petB, TEST_SEASON_KEY, JSON.stringify({ source: 'daily_moon_run' }));
await recordMoonpetMemory(isolationDb, {
  telegram_id: 'isolation-player', pet_id: petB, season_key: TEST_SEASON_KEY,
  event_key: 'accepted-before-switch', source_event_key: 'accepted-before-switch-source', source_event_type: 'daily_moon_run',
  source_event_reason: 'daily_moon_run_terminal', source_event_category: 'daily_moon_run',
  memory_type: 'milestone', milestone: 'first_extraction',
});
assert.ok(JSON.parse(isolationDb.database.prepare('SELECT milestones FROM telegram_pet_memories WHERE pet_id=?').get(petB).milestones).includes('first_extraction'),
  'active-pet switching cannot redirect an accepted source event with pet_id');
assert.equal(isolationDb.database.prepare("SELECT milestones FROM telegram_pet_memories WHERE pet_id=?").get(petC), undefined,
  'the current active pet does not receive the already-scoped memory write');
setActivePetSlot(isolationDb, 'isolation-player', petA);
await workerHooks.syncPetAchievements(isolationDb, 'isolation-player');
assert.equal(isolationDb.database.prepare("SELECT unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_achievements WHERE pet_id=? AND achievement_id='boss_breaker'").get(petA).unlocked, 0,
  'Pet A partial achievement progress stays on Pet A');
isolationDb.database.prepare("UPDATE telegram_pet_memories SET total_bosses_defeated=5 WHERE pet_id=?").run(petA);
await workerHooks.syncPetAchievements(isolationDb, 'isolation-player');
assert.equal(isolationDb.database.prepare("SELECT unlocked_at IS NOT NULL AS unlocked FROM telegram_pet_achievements WHERE pet_id=? AND achievement_id='boss_breaker'").get(petA).unlocked, 1,
  'Pet A achievement progress unlocks Pet A achievement');
setActivePetSlot(isolationDb, 'isolation-player', petB);
await workerHooks.syncPetAchievements(isolationDb, 'isolation-player');
assert.equal(isolationDb.database.prepare("SELECT unlocked_at FROM telegram_pet_achievements WHERE pet_id=? AND achievement_id='boss_breaker'").get(petB).unlocked_at, null,
  'Pet A achievement progress does not unlock Pet B achievement');
const isolatedSummary = await getMoonpetIdentitySummary(isolationDb, 'isolation-player');
assert.equal(isolatedSummary.scope.pet_id, petB, 'identity summary reads the active pet scope');
assert.equal(isolatedSummary.memories.first_boss_id, null, 'identity summary does not inherit another pet source event memory');
assert.equal(isolationDb.database.prepare("SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id='isolation-player'").get().moon_gold, 0,
  'account-owned economy remains unchanged by identity authority writes');

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

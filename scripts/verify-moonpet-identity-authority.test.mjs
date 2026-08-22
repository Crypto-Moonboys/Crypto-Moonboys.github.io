import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  auditIdentityAuthorityDb,
  auditMoonpetOwnershipBoundariesDb,
  auditRuntimeIdentityQueries,
  IDENTITY_AUTHORITY_TABLES,
} from './verify-moonpet-identity-authority.mjs';
import { MOONPET_LIVE_SYSTEM_OWNERSHIP_CLASSIFICATION } from '../workers/moonboys-api/pets/live-system-ownership-classification.js';
import { getMoonpetIdentitySummary } from '../workers/moonboys-api/pets/moonpet-identity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

class SqliteD1Statement {
  constructor(database, sql, bindings = []) { this.database = database; this.sql = sql; this.bindings = bindings; }
  bind(...bindings) { return new SqliteD1Statement(this.database, this.sql, bindings); }
  async first() { return this.database.prepare(this.sql).get(...this.bindings) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.bindings) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return { meta: { changes: result.changes } };
  }
}

class SqliteD1 {
  constructor(database) { this.database = database; }
  prepare(sql) { return new SqliteD1Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
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

function createVerifierDb(viewSql) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE telegram_pet_season_slots (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_instances (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_memories (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT);
    CREATE TABLE telegram_pet_boss_victories (pet_id TEXT, telegram_id TEXT, season_key TEXT, boss_id TEXT);
    CREATE TABLE telegram_pet_identity_events (event_id TEXT, pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_identity_analytics (analytics_id TEXT, pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_achievements (pet_id TEXT, telegram_id TEXT, season_key TEXT, achievement_id TEXT);
    ${viewSql}
  `);
  return db;
}

async function assertSelectedPetIdentityScoping() {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE telegram_pet_active_slots (
        telegram_id TEXT PRIMARY KEY,
        pet_id TEXT NOT NULL,
        season_key TEXT NOT NULL
      );
      CREATE TABLE telegram_pet_season_slots (
        pet_id TEXT NOT NULL,
        telegram_id TEXT NOT NULL,
        season_key TEXT NOT NULL,
        slot_number INTEGER NOT NULL,
        acquisition_type TEXT NOT NULL DEFAULT 'free',
        status TEXT NOT NULL DEFAULT 'active',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (pet_id, telegram_id, season_key),
        UNIQUE (pet_id, telegram_id, season_key, slot_number)
      );
      CREATE TABLE telegram_pet_instances (
        pet_id TEXT PRIMARY KEY,
        telegram_id TEXT NOT NULL,
        season_key TEXT NOT NULL,
        slot_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        UNIQUE (pet_id, telegram_id, season_key, slot_number)
      );
      CREATE TABLE telegram_pet_evolutions (
        telegram_id TEXT NOT NULL,
        evolution_id TEXT NOT NULL,
        stage INTEGER NOT NULL,
        unlocked_at TEXT
      );
      CREATE TABLE telegram_pet_evolutions_by_pet (
        pet_id TEXT NOT NULL,
        telegram_id TEXT NOT NULL,
        evolution_id TEXT NOT NULL,
        stage INTEGER NOT NULL,
        unlocked_at TEXT,
        PRIMARY KEY (pet_id, evolution_id)
      );
      CREATE TABLE telegram_pet_personality_traits (
        pet_id TEXT NOT NULL,
        telegram_id TEXT NOT NULL,
        season_key TEXT NOT NULL,
        trait_id TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        unlocked_at TEXT,
        updated_at TEXT,
        PRIMARY KEY (pet_id, trait_id)
      );
      CREATE TABLE telegram_pet_memories (
        pet_id TEXT PRIMARY KEY,
        telegram_id TEXT NOT NULL,
        season_key TEXT NOT NULL,
        first_adoption_at TEXT,
        first_run_at TEXT,
        first_extraction_at TEXT,
        first_boss_victory_at TEXT,
        first_boss_id TEXT,
        biggest_reward_amount INTEGER DEFAULT 0,
        biggest_reward_currency TEXT,
        favourite_activity TEXT,
        total_runs INTEGER DEFAULT 0,
        total_bosses_defeated INTEGER DEFAULT 0,
        milestones TEXT DEFAULT '[]',
        combat_actions INTEGER DEFAULT 0,
        exploration_actions INTEGER DEFAULT 0,
        care_actions INTEGER DEFAULT 0,
        event_actions INTEGER DEFAULT 0,
        adventure_actions INTEGER DEFAULT 0
      );
      CREATE TABLE telegram_pet_boss_victories (
        pet_id TEXT NOT NULL,
        telegram_id TEXT NOT NULL,
        season_key TEXT NOT NULL,
        boss_id TEXT NOT NULL,
        victories INTEGER DEFAULT 0,
        updated_at TEXT,
        PRIMARY KEY (pet_id, boss_id)
      );
      INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number, acquisition_type, status) VALUES
        ('pet:owner:season-a:1', 'owner', 'season-a', 1, 'free', 'active'),
        ('pet:owner:season-a:2', 'owner', 'season-a', 2, 'arcade_xp', 'active'),
        ('pet:owner:season-a:3', 'owner', 'season-a', 3, 'arcade_xp', 'active'),
        ('pet:owner:season-a:2', 'owner', 'season-stale', 2, 'arcade_xp', 'archived'),
        ('pet:owner:season-old:1', 'owner', 'season-old', 1, 'free', 'archived');
      INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, status) VALUES
        ('pet:owner:season-a:1', 'owner', 'season-a', 1, 'active'),
        ('pet:owner:season-a:2', 'owner', 'season-a', 2, 'active'),
        ('pet:owner:season-a:3', 'owner', 'season-a', 3, 'active'),
        ('pet:owner:season-old:1', 'owner', 'season-old', 1, 'archived');
      INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
        VALUES ('owner', 'pet:owner:season-a:1', 'season-a');
      INSERT INTO telegram_pet_evolutions (telegram_id, evolution_id, stage, unlocked_at)
        VALUES ('owner', 'legendary_guardian', 5, '2026-08-01T00:00:00Z');
      INSERT INTO telegram_pet_evolutions_by_pet (pet_id, telegram_id, evolution_id, stage, unlocked_at) VALUES
        ('pet:owner:season-a:1', 'owner', 'street_moonpet', 1, '2026-08-02T00:00:00Z'),
        ('pet:owner:season-a:2', 'owner', 'moon_egg', 0, '2026-08-03T00:00:00Z'),
        ('pet:owner:season-a:2', 'owner', 'legendary_guardian', 5, '2026-08-04T00:00:00Z'),
        ('pet:owner:season-old:1', 'owner', 'cyber_moonpet', 2, '2026-07-01T00:00:00Z'),
        ('pet:owner:season-a:2', 'intruder', 'moon_guardian', 4, '2026-08-04T00:00:00Z');
      INSERT INTO telegram_pet_personality_traits
        (pet_id, telegram_id, season_key, trait_id, progress, unlocked_at) VALUES
        ('pet:owner:season-a:1', 'owner', 'season-a', 'street_fighter', 20, '2026-08-02T01:00:00Z'),
        ('pet:owner:season-a:2', 'owner', 'season-a', 'curious', 12, '2026-08-03T01:00:00Z'),
        ('pet:owner:season-old:1', 'owner', 'season-old', 'explorer', 16, '2026-07-01T01:00:00Z');
      INSERT INTO telegram_pet_memories
        (pet_id, telegram_id, season_key, first_boss_id, favourite_activity, total_runs, total_bosses_defeated, milestones, combat_actions, exploration_actions, care_actions, event_actions, adventure_actions) VALUES
        ('pet:owner:season-a:1', 'owner', 'season-a', 'alley_king', 'Combat', 7, 1, '["starter_memory"]', 4, 0, 1, 0, 2),
        ('pet:owner:season-a:2', 'owner', 'season-a', NULL, 'Care', 1, 0, '["paid_memory"]', 0, 0, 6, 1, 0),
        ('pet:owner:season-old:1', 'owner', 'season-old', 'old_boss', 'Exploration', 13, 2, '["archived_memory"]', 1, 8, 0, 0, 4);
      INSERT INTO telegram_pet_boss_victories
        (pet_id, telegram_id, season_key, boss_id, victories) VALUES
        ('pet:owner:season-a:1', 'owner', 'season-a', 'alley_king', 3),
        ('pet:owner:season-a:2', 'owner', 'season-a', 'cache_wraith', 1),
        ('pet:owner:season-old:1', 'owner', 'season-old', 'old_boss', 5);
    `);
    const d1 = new SqliteD1(db);
    const starter = await getMoonpetIdentitySummary(d1, 'owner');
    assert.equal(starter.scope.pet_id, 'pet:owner:season-a:1');
    assert.equal(starter.current_stage.evolution_id, 'street_moonpet');
    assert.deepEqual(starter.personalities.map((trait) => trait.trait_id), ['street_fighter']);
    assert.equal(starter.memories.first_boss_id, 'alley_king');
    assert.equal(starter.memories.favourite_activity, 'Combat');
    assert.deepEqual(starter.boss_victories.map((boss) => boss.boss_id), ['alley_king']);

    db.prepare(`UPDATE telegram_pet_active_slots SET pet_id='pet:owner:season-a:2', season_key='season-a' WHERE telegram_id='owner'`).run();
    const paid = await getMoonpetIdentitySummary(d1, 'owner');
    assert.equal(paid.scope.pet_id, 'pet:owner:season-a:2');
    assert.equal(paid.current_stage.evolution_id, 'moon_egg');
    assert.deepEqual(paid.personalities.map((trait) => trait.trait_id), ['curious']);
    assert.equal(paid.memories.first_boss_id, null);
    assert.equal(paid.memories.favourite_activity, 'Care');
    assert.deepEqual(paid.boss_victories.map((boss) => boss.boss_id), ['cache_wraith']);
    assert.notEqual(paid.current_stage.evolution_id, 'legendary_guardian', 'active paid pet must not fall back to owner-scoped evolution unlocks');
    assert.notEqual(paid.current_stage.stage, 5, 'pet_id alone must not let a corrupt evolution owner row leak final-form state');
    assert.equal(paid.memories.total_runs, 1, 'active paid pet must not inherit starter memories');

    db.prepare(`UPDATE telegram_pet_active_slots SET pet_id='pet:owner:season-a:3', season_key='season-a' WHERE telegram_id='owner'`).run();
    const paidWithoutPetEvolution = await getMoonpetIdentitySummary(d1, 'owner');
    assert.equal(paidWithoutPetEvolution.scope.pet_id, 'pet:owner:season-a:3');
    assert.equal(paidWithoutPetEvolution.current_stage.evolution_id, 'moon_egg',
      'stale account-wide evolution compatibility rows cannot leak into a selected paid pet with no pet-specific evolution row');
    assert.notEqual(paidWithoutPetEvolution.current_stage.stage, 5,
      'selected pet display must ignore stale legacy evolution stage when the selected pet has no by-pet evolution row');

    const archived = await getMoonpetIdentitySummary(d1, 'owner', {
      pet_id: 'pet:owner:season-old:1',
      season_key: 'season-old',
      include_archived: true,
    });
    assert.equal(archived.scope.status, 'archived');
    assert.equal(archived.current_stage.evolution_id, 'cyber_moonpet');
    assert.deepEqual(archived.personalities.map((trait) => trait.trait_id), ['explorer']);
    assert.equal(archived.memories.first_boss_id, 'old_boss');
    assert.equal(archived.memories.milestones[0], 'archived_memory');
    assert.deepEqual(archived.boss_victories.map((boss) => boss.boss_id), ['old_boss']);

    assert.equal(await getMoonpetIdentitySummary(d1, 'owner', {
      pet_id: 'pet:owner:season-old:1',
    }), null, 'pet_id alone is insufficient identity authority and must not fall back to the active pet');
    assert.equal(await getMoonpetIdentitySummary(d1, 'owner', {
      pet_id: 'pet:owner:season-old:1',
      season_key: 'season-a',
      include_archived: true,
    }), null, 'wrong season tuple cannot leak archived pet evolution or identity state');

    const archivedWithoutReadFlag = await getMoonpetIdentitySummary(d1, 'owner', {
      pet_id: 'pet:owner:season-old:1',
      season_key: 'season-old',
    });
    assert.equal(archivedWithoutReadFlag, null, 'archived pets require an explicit read-only archived scope');
  } finally {
    db.close();
  }
}

await assertSelectedPetIdentityScoping();

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moonpet-authority-test-'));
try {
  const badRuntimeRoot = path.join(tmpRoot, 'bad');
  fs.mkdirSync(badRuntimeRoot);
  fs.writeFileSync(path.join(badRuntimeRoot, 'bad.js'), `
    export async function bad(db, telegramId) {
      return db.prepare(\`SELECT pet_id, season_key FROM telegram_pet_memories WHERE telegram_id = ?\`).bind(telegramId).first();
    }
  `);
  const badRuntimeViolations = auditRuntimeIdentityQueries({ root: badRuntimeRoot });
  assert.equal(badRuntimeViolations.length, 1, 'verifier rejects a missing pet_id/season_key authority tuple in WHERE');

  const selectOnlyRoot = path.join(tmpRoot, 'select-only');
  fs.mkdirSync(selectOnlyRoot);
  fs.writeFileSync(path.join(selectOnlyRoot, 'select-only.js'), `
    export async function bad(db, telegramId) {
      return db.prepare(\`SELECT pet_id, season_key FROM telegram_pet_memories WHERE telegram_id = ?\`).bind(telegramId).first();
    }
  `);
  assert.equal(auditRuntimeIdentityQueries({ root: selectOnlyRoot }).length, 1,
    'verifier does not accept authority columns that appear only in SELECT');

  const orRuntimeRoot = path.join(tmpRoot, 'or');
  fs.mkdirSync(orRuntimeRoot);
  fs.writeFileSync(path.join(orRuntimeRoot, 'or.js'), `
    export async function bad(db, petId, telegramId, seasonKey) {
      return db.prepare(\`SELECT * FROM telegram_pet_memories WHERE pet_id = ? OR telegram_id = ? OR season_key = ?\`).bind(petId, telegramId, seasonKey).first();
    }
  `);
  assert.equal(auditRuntimeIdentityQueries({ root: orRuntimeRoot }).length, 1,
    'verifier rejects OR-conjoined authority predicates');

  const topLevelOrRoot = path.join(tmpRoot, 'top-level-or');
  fs.mkdirSync(topLevelOrRoot);
  fs.writeFileSync(path.join(topLevelOrRoot, 'top-level-or.js'), `
    export async function bad(db, petId, telegramId, seasonKey) {
      return db.prepare(\`SELECT * FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ? OR telegram_id = ?\`).bind(petId, telegramId, seasonKey, telegramId).first();
    }
  `);
  assert.equal(auditRuntimeIdentityQueries({ root: topLevelOrRoot }).length, 1,
    'verifier rejects top-level OR bypasses after a complete tuple');

  const singleQuotedRoot = path.join(tmpRoot, 'single-quoted');
  fs.mkdirSync(singleQuotedRoot);
  fs.writeFileSync(path.join(singleQuotedRoot, 'single-quoted.js'), `
    export async function bad(db, telegramId) {
      return db.prepare('SELECT pet_id, season_key FROM telegram_pet_memories WHERE telegram_id = ?').bind(telegramId).first();
    }
  `);
  assert.equal(auditRuntimeIdentityQueries({ root: singleQuotedRoot }).length, 1,
    'verifier audits single-quoted SQL strings');

  const goodRuntimeRoot = path.join(tmpRoot, 'good');
  fs.mkdirSync(goodRuntimeRoot);
  fs.writeFileSync(path.join(goodRuntimeRoot, 'good.js'), `
    export async function good(db, petId, telegramId, seasonKey) {
      return db.prepare(\`SELECT pet_id FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?\`).bind(petId, telegramId, seasonKey).first();
    }
  `);
  assert.equal(auditRuntimeIdentityQueries({ root: goodRuntimeRoot }).length, 0,
    'verifier accepts the full authority tuple in WHERE');

  const guardSubqueryRoot = path.join(tmpRoot, 'guard-subquery');
  fs.mkdirSync(guardSubqueryRoot);
  fs.writeFileSync(path.join(guardSubqueryRoot, 'guard-subquery.js'), `
    export async function guarded(db, petId, telegramId, seasonKey, traitId) {
      return db.prepare(\`
        SELECT pet_id, telegram_id, season_key FROM telegram_pet_identity_events
        WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND applied_at IS NULL
          AND (NOT EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id = ?)
            OR EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?))
      \`).bind(petId, telegramId, seasonKey, petId, petId, telegramId, seasonKey).all();
    }
  `);
  assert.equal(auditRuntimeIdentityQueries({ root: guardSubqueryRoot }).length, 0,
    'verifier does not false-positive on NOT EXISTS guard subqueries with partial tuple');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

const mismatchDb = createVerifierDb(`
  CREATE VIEW moonpet_invalid_identity_authority_rows AS
    SELECT 'telegram_pet_memories' AS table_name, 'other-pet' AS pet_id, 'owner' AS telegram_id,
           'season' AS season_key, 'other-pet' AS row_key, 'season_slot_tuple_missing' AS reason
    WHERE 1 = 0;
`);
try {
  mismatchDb.prepare(`INSERT INTO telegram_pet_memories (pet_id, telegram_id, season_key)
    VALUES ('missing-authority-pet', 'owner', 'season')`).run();
  const result = auditIdentityAuthorityDb(mismatchDb);
  assert.ok(result.violations.some((row) => row.reason === 'season_slot_tuple_missing'),
    'verifier reports rows missing their authority tuple');
  assert.ok(result.violations.some((row) => row.reason === 'view_rows_mismatch'),
    'verifier fails when the migration view rows differ from the standalone authority query');
} finally {
  mismatchDb.close();
}

const staleAuthorityDb = new DatabaseSync(':memory:');
try {
  staleAuthorityDb.exec(`
    CREATE TABLE telegram_pet_active_slots (telegram_id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, season_key TEXT NOT NULL);
    CREATE TABLE telegram_pet_season_slots (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_instances (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_specialist_progression (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key) VALUES ('owner', 'pet:missing', 'season-a');
    INSERT INTO telegram_pet_specialist_progression (pet_id, telegram_id, season_key) VALUES
      ('pet:missing', 'owner', 'season-a'),
      ('', 'owner', 'season-a'),
      (NULL, 'owner', 'season-a'),
      ('pet:no-season', 'owner', ''),
      ('pet:null-season', 'owner', NULL);
  `);
  const ownershipViolations = auditMoonpetOwnershipBoundariesDb(staleAuthorityDb);
  assert.ok(ownershipViolations.some((row) => row.reason === 'stale_active_slot_authority_link'),
    'ownership audit reports stale active-slot authority links');
  assert.ok(ownershipViolations.some((row) =>
    row.table_name === 'telegram_pet_specialist_progression'
      && row.reason === 'pet_id_missing'
      && row.pet_id === ''),
  'ownership audit reports empty pet_id in pet-owned progression ledgers');
  assert.ok(ownershipViolations.some((row) =>
    row.table_name === 'telegram_pet_specialist_progression'
      && row.reason === 'pet_id_missing'
      && row.pet_id == null),
  'ownership audit reports NULL pet_id in pet-owned progression ledgers');
  assert.ok(ownershipViolations.some((row) =>
    row.table_name === 'telegram_pet_specialist_progression'
      && row.reason === 'season_key_missing'
      && row.season_key === ''),
  'ownership audit reports empty season_key in pet-owned progression ledgers');
  assert.ok(ownershipViolations.some((row) =>
    row.table_name === 'telegram_pet_specialist_progression'
      && row.reason === 'season_key_missing'
      && row.season_key == null),
  'ownership audit reports NULL season_key in pet-owned progression ledgers');
  assert.ok(ownershipViolations.some((row) => row.table_name === 'telegram_pet_specialist_progression' && row.reason === 'invalid_pet_authority_reference'),
    'ownership audit reports invalid pet ownership references in pet-owned progression ledgers');
  assert.ok(!ownershipViolations.some((row) => row.reason === 'account_system_writes_pet_owned_table' || row.reason === 'pet_system_writes_account_owned_table'),
    'live ownership classification must not drift account-owned and pet-owned table boundaries');
  assert.ok(!ownershipViolations.some((row) => row.reason === 'pet_owned_table_missing_classification' || row.reason === 'account_owned_table_missing_classification'),
    'live ownership classification must cover every owned table boundary');
  assert.ok(!ownershipViolations.some((row) => row.reason === 'ownership_classification_missing' || row.reason === 'ownership_classification_ambiguous'),
    'live ownership classification must resolve every telegram_pet table to exactly one ownership class');
} finally {
  staleAuthorityDb.close();
}

const systemEventsOwnershipDb = new DatabaseSync(':memory:');
try {
  systemEventsOwnershipDb.exec(`
    CREATE TABLE telegram_pet_season_slots (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_instances (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_system_events (
      id TEXT PRIMARY KEY,
      pet_id TEXT,
      telegram_id TEXT,
      season_key TEXT,
      system_key TEXT
    );
    INSERT INTO telegram_pet_system_events (id, pet_id, telegram_id, season_key, system_key) VALUES
      ('account-row', '', 'owner', '', 'kaiju'),
      ('pet-row-missing-pet', '', 'owner', 'season-a', 'district'),
      ('pet-row-null-pet', NULL, 'owner', 'season-a', 'event_chain'),
      ('pet-row-missing-season', 'pet:district', 'owner', '', 'district'),
      ('pet-row-null-season', 'pet:seasonal', 'owner', NULL, 'seasonal_boss');
  `);
  const systemEventViolations = auditMoonpetOwnershipBoundariesDb(systemEventsOwnershipDb);
  assert.ok(systemEventViolations.some((row) => row.table_name === 'telegram_pet_system_events' && row.reason === 'pet_id_missing'),
    'ownership audit flags missing pet_id for pet-owned system event rows');
  assert.ok(systemEventViolations.some((row) =>
    row.table_name === 'telegram_pet_system_events'
      && row.reason === 'season_key_missing'
      && row.season_key === ''),
  'ownership audit flags empty season_key for pet-owned system event rows');
  assert.ok(systemEventViolations.some((row) =>
    row.table_name === 'telegram_pet_system_events'
      && row.reason === 'season_key_missing'
      && row.season_key == null),
  'ownership audit flags NULL season_key for pet-owned system event rows');
  assert.ok(!systemEventViolations.some((row) => row.table_name === 'telegram_pet_system_events' && row.row_key === ':owner:' && row.reason === 'pet_id_missing'),
    'ownership audit does not treat account-owned system event rows as pet-owned corruption');
} finally {
  systemEventsOwnershipDb.close();
}

const identityClassificationRow = MOONPET_LIVE_SYSTEM_OWNERSHIP_CLASSIFICATION
  .find((row) => row.system_key === 'achievements_identity_memories_personality');
assert.ok(identityClassificationRow, 'identity ownership classification row must exist');
const originalWriteTables = [...identityClassificationRow.write_tables];
try {
  identityClassificationRow.write_tables = identityClassificationRow.write_tables
    .filter((table) => table !== 'telegram_pet_memories');
  const coverageViolations = auditMoonpetOwnershipBoundariesDb(new DatabaseSync(':memory:'));
  assert.ok(coverageViolations.some((row) => row.reason === 'pet_owned_table_missing_classification' && row.row_key === 'telegram_pet_memories'),
    'ownership audit fails when a pet-owned table is removed from live ownership classification');
} finally {
  identityClassificationRow.write_tables = originalWriteTables;
}

const missingClassificationDb = new DatabaseSync(':memory:');
try {
  missingClassificationDb.exec(`
    CREATE TABLE telegram_pet_new_feature_state (id TEXT PRIMARY KEY);
  `);
  const missingClassificationViolations = auditMoonpetOwnershipBoundariesDb(missingClassificationDb);
  assert.ok(missingClassificationViolations.some((row) =>
    row.reason === 'ownership_classification_missing' && row.row_key === 'telegram_pet_new_feature_state'),
  'ownership audit fails when a new telegram_pet table has no declared ownership classification');
} finally {
  missingClassificationDb.close();
}

const defaultCliResult = spawnSync(process.execPath, ['scripts/verify-moonpet-identity-authority.mjs'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.equal(defaultCliResult.status, 0, 'default CLI audit fixture must execute complete ownership audit surface');
assert.match(defaultCliResult.stdout, /STATUS: PASS/);
assert.match(defaultCliResult.stdout, /telegram_pet_specialist_progression:\s*\d+/);
assert.match(defaultCliResult.stdout, /telegram_pet_daily_journey_objectives:\s*\d+/);
assert.match(defaultCliResult.stdout, /telegram_pet_daily_runs:\s*\d+/);
assert.match(defaultCliResult.stdout, /telegram_pet_live_progression_state:\s*\d+/);
assert.match(defaultCliResult.stdout, /audited tables:\s*\d+/);
assert.match(defaultCliResult.stdout, /violations:\s*0/);

const cliResult = spawnSync(process.execPath, ['scripts/verify-moonpet-identity-authority.mjs', '--sqlite'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.notEqual(cliResult.status, 0, '--sqlite without a path must fail');
assert.match(`${cliResult.stderr}\n${cliResult.stdout}`, /--sqlite requires a path/);

const externalDbPath = path.join(os.tmpdir(), `moonpet-authority-external-${process.pid}.sqlite`);
const externalDb = new DatabaseSync(externalDbPath);
try {
  externalDb.exec(`
    CREATE TABLE telegram_pet_season_slots (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_instances (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_memories (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT);
    CREATE TABLE telegram_pet_boss_victories (pet_id TEXT, telegram_id TEXT, season_key TEXT, boss_id TEXT);
    CREATE TABLE telegram_pet_identity_events (event_id TEXT, pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_identity_analytics (analytics_id TEXT, pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_achievements (pet_id TEXT, telegram_id TEXT, season_key TEXT, achievement_id TEXT);
    CREATE TABLE telegram_pet_specialist_progression (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_specialist_events (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_journey_objectives (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_journey_receipts (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_growth_marks (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_journey_objectives (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_journey_receipts (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_crests (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_runs (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_runs (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_run_analytics (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_live_progression_state (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_system_events (pet_id TEXT, telegram_id TEXT, season_key TEXT, system_key TEXT);
    CREATE TABLE telegram_pet_event_chain_progress (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_boss_progress (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_seasonal_boss_progress (pet_id TEXT, telegram_id TEXT, pet_season_key TEXT);
    CREATE VIEW moonpet_invalid_identity_authority_rows AS
      SELECT 'telegram_pet_memories' AS table_name, NULL AS pet_id, NULL AS telegram_id, NULL AS season_key, NULL AS row_key, 'empty' AS reason WHERE 1 = 0;
  `);
} finally {
  externalDb.close();
}
const externalCliResult = spawnSync(process.execPath, ['scripts/verify-moonpet-identity-authority.mjs', '--sqlite', externalDbPath], {
  cwd: repoRoot,
  encoding: 'utf8',
});
try {
  assert.notEqual(externalCliResult.status, 0, '--sqlite external DB must run schema/index validation');
  assert.match(`${externalCliResult.stderr}\n${externalCliResult.stdout}`, /missing identity authority index/);
} finally {
  fs.rmSync(externalDbPath, { force: true });
}

const incompleteOwnershipSurfaceDbPath = path.join(os.tmpdir(), `moonpet-authority-incomplete-${process.pid}.sqlite`);
const incompleteOwnershipSurfaceDb = new DatabaseSync(incompleteOwnershipSurfaceDbPath);
try {
  incompleteOwnershipSurfaceDb.exec(`
    CREATE TABLE telegram_pet_season_slots (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_instances (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_memories (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT);
    CREATE TABLE telegram_pet_boss_victories (pet_id TEXT, telegram_id TEXT, season_key TEXT, boss_id TEXT);
    CREATE TABLE telegram_pet_identity_events (event_id TEXT, pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_identity_analytics (analytics_id TEXT, pet_id TEXT, telegram_id TEXT, season_key TEXT, created_at TEXT);
    CREATE TABLE telegram_pet_achievements (pet_id TEXT, telegram_id TEXT, season_key TEXT, achievement_id TEXT);
    CREATE VIEW moonpet_invalid_identity_authority_rows AS
      SELECT 'telegram_pet_memories' AS table_name, NULL AS pet_id, NULL AS telegram_id, NULL AS season_key, NULL AS row_key, 'empty' AS reason WHERE 1 = 0;
  `);
} finally {
  incompleteOwnershipSurfaceDb.close();
}
const incompleteOwnershipSurfaceCli = spawnSync(
  process.execPath,
  ['scripts/verify-moonpet-identity-authority.mjs', '--sqlite', incompleteOwnershipSurfaceDbPath],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
);
try {
  assert.notEqual(incompleteOwnershipSurfaceCli.status, 0, '--sqlite must fail closed when ownership audit tables are missing');
  assert.match(`${incompleteOwnershipSurfaceCli.stderr}\n${incompleteOwnershipSurfaceCli.stdout}`, /missing ownership audit table/);
} finally {
  fs.rmSync(incompleteOwnershipSurfaceDbPath, { force: true });
}

const badAuthorityDbPath = path.join(os.tmpdir(), `moonpet-authority-bad-row-${process.pid}.sqlite`);
const badAuthorityDb = new DatabaseSync(badAuthorityDbPath);
try {
  badAuthorityDb.exec(`
    CREATE TABLE telegram_pet_season_slots (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_instances (pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER);
    CREATE TABLE telegram_pet_memories (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT);
    CREATE TABLE telegram_pet_boss_victories (pet_id TEXT, telegram_id TEXT, season_key TEXT, boss_id TEXT);
    CREATE TABLE telegram_pet_identity_events (event_id TEXT, pet_id TEXT, telegram_id TEXT, season_key TEXT, event_key TEXT, event_kind TEXT, created_at TEXT);
    CREATE TABLE telegram_pet_identity_analytics (analytics_id TEXT, pet_id TEXT, telegram_id TEXT, season_key TEXT, event_type TEXT, created_at TEXT);
    CREATE TABLE telegram_pet_achievements (pet_id TEXT, telegram_id TEXT, season_key TEXT, achievement_id TEXT);
    CREATE TABLE telegram_pet_specialist_progression (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_specialist_events (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_journey_objectives (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_journey_receipts (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_growth_marks (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_journey_objectives (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_journey_receipts (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_crests (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_runs (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_runs (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_run_analytics (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_live_progression_state (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_system_events (pet_id TEXT, telegram_id TEXT, season_key TEXT, system_key TEXT);
    CREATE TABLE telegram_pet_event_chain_progress (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_boss_progress (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_seasonal_boss_progress (pet_id TEXT, telegram_id TEXT, pet_season_key TEXT);
    CREATE INDEX idx_telegram_pet_identity_events_owner
      ON telegram_pet_identity_events(pet_id, telegram_id, season_key, created_at);
    CREATE INDEX idx_telegram_pet_identity_events_pet_kind_day
      ON telegram_pet_identity_events(pet_id, event_kind, created_at);
    CREATE INDEX idx_telegram_pet_achievements_owner
      ON telegram_pet_achievements(pet_id, telegram_id, season_key, achievement_id);
    CREATE INDEX idx_telegram_pet_identity_analytics_owner
      ON telegram_pet_identity_analytics(pet_id, telegram_id, season_key, created_at);
    CREATE VIEW moonpet_invalid_identity_authority_rows AS
      SELECT 'telegram_pet_memories' AS table_name, NULL AS pet_id, NULL AS telegram_id, NULL AS season_key, NULL AS row_key, 'empty' AS reason WHERE 1 = 0;
    INSERT INTO telegram_pet_specialist_progression (pet_id, telegram_id, season_key) VALUES
      (NULL, 'owner', 'season-a'),
      ('', 'owner', 'season-a'),
      ('pet:missing-season-null', 'owner', NULL),
      ('pet:missing-season-empty', 'owner', '');
    INSERT INTO telegram_pet_system_events (pet_id, telegram_id, season_key, system_key) VALUES
      ('pet:orphan-district', 'owner', 'season-a', 'district');
  `);
} finally {
  badAuthorityDb.close();
}
const badAuthorityCli = spawnSync(
  process.execPath,
  ['scripts/verify-moonpet-identity-authority.mjs', '--sqlite', badAuthorityDbPath],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
);
try {
  assert.notEqual(badAuthorityCli.status, 0, 'bad ownership authority rows must force STATUS: FAIL');
  assert.match(badAuthorityCli.stdout, /STATUS: FAIL/);
  assert.match(`${badAuthorityCli.stderr}\n${badAuthorityCli.stdout}`, /"table_name":\s*"telegram_pet_specialist_progression"[\s\S]*"reason":\s*"pet_id_missing"/);
  assert.match(`${badAuthorityCli.stderr}\n${badAuthorityCli.stdout}`, /"table_name":\s*"telegram_pet_system_events"[\s\S]*"reason":\s*"invalid_pet_authority_reference"/);
  assert.match(`${badAuthorityCli.stderr}\n${badAuthorityCli.stdout}`, /"reason":\s*"pet_id_missing"/);
  assert.match(`${badAuthorityCli.stderr}\n${badAuthorityCli.stdout}`, /"reason":\s*"season_key_missing"/);
} finally {
  fs.rmSync(badAuthorityDbPath, { force: true });
}

assert.deepEqual(IDENTITY_AUTHORITY_TABLES, [
  'telegram_pet_memories',
  'telegram_pet_personality_traits',
  'telegram_pet_boss_victories',
  'telegram_pet_identity_events',
  'telegram_pet_identity_analytics',
  'telegram_pet_achievements',
], 'verifier covers every Moonpet identity ledger');

console.log('verify-moonpet-identity-authority.test.mjs passed');

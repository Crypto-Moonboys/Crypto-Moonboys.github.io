import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  auditIdentityAuthorityDb,
  auditRuntimeIdentityQueries,
  IDENTITY_AUTHORITY_TABLES,
} from './verify-moonpet-identity-authority.mjs';
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
        pet_id TEXT PRIMARY KEY,
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
        ('pet:owner:season-old:1', 'owner', 'season-old', 1, 'free', 'archived');
      INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number, status) VALUES
        ('pet:owner:season-a:1', 'owner', 'season-a', 1, 'active'),
        ('pet:owner:season-a:2', 'owner', 'season-a', 2, 'active'),
        ('pet:owner:season-old:1', 'owner', 'season-old', 1, 'archived');
      INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
        VALUES ('owner', 'pet:owner:season-a:1', 'season-a');
      INSERT INTO telegram_pet_evolutions (telegram_id, evolution_id, stage, unlocked_at)
        VALUES ('owner', 'legendary_guardian', 5, '2026-08-01T00:00:00Z');
      INSERT INTO telegram_pet_evolutions_by_pet (pet_id, telegram_id, evolution_id, stage, unlocked_at) VALUES
        ('pet:owner:season-a:1', 'owner', 'street_moonpet', 1, '2026-08-02T00:00:00Z'),
        ('pet:owner:season-a:2', 'owner', 'moon_egg', 0, '2026-08-03T00:00:00Z'),
        ('pet:owner:season-old:1', 'owner', 'cyber_moonpet', 2, '2026-07-01T00:00:00Z');
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
    assert.equal(paid.memories.total_runs, 1, 'active paid pet must not inherit starter memories');

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

    const archivedWithoutReadFlag = await getMoonpetIdentitySummary(d1, 'owner', {
      pet_id: 'pet:owner:season-old:1',
      season_key: 'season-old',
    });
    assert.equal(archivedWithoutReadFlag.scope, null, 'archived pets require an explicit read-only archived scope');
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

assert.deepEqual(IDENTITY_AUTHORITY_TABLES, [
  'telegram_pet_memories',
  'telegram_pet_personality_traits',
  'telegram_pet_boss_victories',
  'telegram_pet_identity_events',
  'telegram_pet_identity_analytics',
  'telegram_pet_achievements',
], 'verifier covers every Moonpet identity ledger');

console.log('verify-moonpet-identity-authority.test.mjs passed');

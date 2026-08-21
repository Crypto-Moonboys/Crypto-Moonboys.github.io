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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

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

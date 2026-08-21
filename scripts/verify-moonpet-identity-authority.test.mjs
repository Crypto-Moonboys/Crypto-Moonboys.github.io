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

  const goodRuntimeRoot = path.join(tmpRoot, 'good');
  fs.mkdirSync(goodRuntimeRoot);
  fs.writeFileSync(path.join(goodRuntimeRoot, 'good.js'), `
    export async function good(db, petId, telegramId, seasonKey) {
      return db.prepare(\`SELECT pet_id FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?\`).bind(petId, telegramId, seasonKey).first();
    }
  `);
  assert.equal(auditRuntimeIdentityQueries({ root: goodRuntimeRoot }).length, 0,
    'verifier accepts the full authority tuple in WHERE');
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

assert.deepEqual(IDENTITY_AUTHORITY_TABLES, [
  'telegram_pet_memories',
  'telegram_pet_personality_traits',
  'telegram_pet_boss_victories',
  'telegram_pet_identity_events',
  'telegram_pet_identity_analytics',
  'telegram_pet_achievements',
], 'verifier covers every Moonpet identity ledger');

console.log('verify-moonpet-identity-authority.test.mjs passed');

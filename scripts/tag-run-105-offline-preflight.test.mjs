import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MIGRATION_105 = new URL('../workers/moonboys-api/migrations/105_tag_run_v2_payout_execution.sql', import.meta.url);
import { DatabaseSync } from 'node:sqlite';
import { verifyMigration105 } from './tag-run-105-offline-preflight.mjs';

function fixture({ applyMigration = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tag-run-105-preflight-'));
  const before = join(dir, 'before.db');
  const after = join(dir, 'after.db');
  const db = new DatabaseSync(before);
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE telegram_pet_profiles(telegram_id TEXT PRIMARY KEY);
      CREATE TABLE telegram_pet_season_slots (
        pet_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, season_key TEXT NOT NULL,
        slot_number INTEGER NOT NULL, UNIQUE(telegram_id, season_key, slot_number),
        FOREIGN KEY(telegram_id) REFERENCES telegram_pet_profiles(telegram_id)
      );
      CREATE UNIQUE INDEX idx_telegram_pet_season_slots_pet_owner_tuple
        ON telegram_pet_season_slots(pet_id, telegram_id, season_key, slot_number);
      CREATE TABLE telegram_pet_instances (
        pet_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, season_key TEXT NOT NULL,
        slot_number INTEGER NOT NULL, pet_xp INTEGER NOT NULL,
        FOREIGN KEY(pet_id, telegram_id, season_key, slot_number)
          REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key, slot_number)
      );
      CREATE TABLE tag_run_wallets(telegram_id TEXT PRIMARY KEY, account TEXT);
      CREATE TABLE tag_run_v2_assets(asset_key TEXT PRIMARY KEY);
      CREATE TABLE tag_run_v2_snapshots(
        chat_id TEXT NOT NULL, day_key TEXT NOT NULL, asset_key TEXT NOT NULL,
        PRIMARY KEY(chat_id,day_key,asset_key),
        FOREIGN KEY(asset_key) REFERENCES tag_run_v2_assets(asset_key)
      );
      INSERT INTO tag_run_v2_assets VALUES('asset');
      INSERT INTO tag_run_v2_snapshots VALUES('chat','2026-11-03','asset');
      INSERT INTO telegram_pet_profiles VALUES('a');
      INSERT INTO telegram_pet_season_slots VALUES('pet-1','a','season',1);
      INSERT INTO telegram_pet_instances VALUES('pet-1','a','season',1,100);
      INSERT INTO tag_run_wallets VALUES('a','waxabc');
    `);
  } finally { db.close(); }
  copyFileSync(before, after);
  const post = new DatabaseSync(after);
  try {
    if (applyMigration) {
      // The positive fixture must use the actual, checked-in production SQL.
      post.exec(readFileSync(MIGRATION_105, 'utf8'));
    } else {
      // This is the false positive accepted by the original preflight.
      post.exec(`
        CREATE TABLE tag_run_v2_payout_caps(id TEXT PRIMARY KEY);
        CREATE TABLE tag_run_v2_payout_intents(id TEXT PRIMARY KEY);
      `);
      for (let i = 0; i < 7; i++) {
        post.exec(`CREATE TRIGGER tag_run_v2_payout_fixture_${i}
          BEFORE INSERT ON tag_run_v2_payout_caps BEGIN SELECT 1; END;`);
      }
    }
  } finally { post.close(); }
  return { dir, before, after, cleanup: () => rmSync(dir, { force: true, recursive: true }) };
}

function withFixture(fn, options) {
  const state = fixture(options);
  try { fn(state); }
  finally { state.cleanup(); }
}

test('rehearsal retains original rows, schema, MoonPet owner tuple and paused empty ledgers', () =>
  withFixture(({ before, after }) => {
    const result = verifyMigration105(before, after);
    assert.equal(result.originalTables, 6);
    assert.equal(result.originalRows, 6);
    assert.equal(result.payoutTriggers, 7);
    assert.deepEqual(result.addedTables, ['tag_run_v2_payout_caps', 'tag_run_v2_payout_intents']);
    assert.equal(result.foreignKeyViolations, 0);
  }));

test('original table data mutation fails offline acceptance', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec("UPDATE telegram_pet_instances SET pet_xp = 999 WHERE pet_id = 'pet-1'");
    db.close();
    assert.throws(() => verifyMigration105(before, after), /original table data changed/);
  }));

test('missing parent composite unique index fails even if integrity_check passes', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec('DROP INDEX idx_telegram_pet_season_slots_pet_owner_tuple');
    db.close();
    assert.throws(() => verifyMigration105(before, after), /unique index missing/);
  }));

test('missing payout trigger fails offline acceptance', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec('DROP TRIGGER tag_run_v2_payout_cap_no_delete');
    db.close();
    assert.throws(() => verifyMigration105(before, after), /payout schema differs from checked-in migration 105/);
  }));

test('nonempty payout ledger fails offline acceptance', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec('DROP TRIGGER tag_run_v2_payout_cap_source_guard');
    db.exec(`INSERT INTO tag_run_v2_payout_caps
      (chat_id,day_key,asset_key,snapshot_digest,daily_limit_units,
       per_transfer_limit_units,authorized_by)
      VALUES ('chat','2026-11-03','asset','${'a'.repeat(64)}','50','5','offline-fixture')`);
    db.close();
    assert.throws(() => verifyMigration105(before, after), /payout table is not empty/);
  }));

test('changed original schema object fails even without row changes', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec('CREATE INDEX added_unexpected_index ON tag_run_wallets(account)');
    db.close();
    assert.throws(() => verifyMigration105(before, after), /original schema objects/);
  }));

test('fake payout tables and seven no-op guards cannot pass migration-105 comparison', () =>
  withFixture(({ before, after }) => {
    assert.throws(() => verifyMigration105(before, after),
      /payout schema differs from checked-in migration 105/);
  }, { applyMigration: false }));

test('same-named payout guard with no-op body is rejected', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec('DROP TRIGGER tag_run_v2_payout_cap_no_delete; CREATE TRIGGER tag_run_v2_payout_cap_no_delete BEFORE DELETE ON tag_run_v2_payout_caps BEGIN SELECT 1; END;');
    db.close();
    assert.throws(() => verifyMigration105(before, after),
      /payout schema differs from checked-in migration 105/);
  }));

test('modified payout table definition cannot pass migration-105 comparison', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec('ALTER TABLE tag_run_v2_payout_intents ADD COLUMN malicious INTEGER');
    db.close();
    assert.throws(() => verifyMigration105(before, after),
      /payout schema differs from checked-in migration 105/);
  }));

test('missing payout index cannot pass migration-105 comparison', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec('DROP INDEX tag_run_v2_payout_intents_state');
    db.close();
    assert.throws(() => verifyMigration105(before, after),
      /payout schema differs from checked-in migration 105/);
  }));

test('payout-prefixed index on original wallet table is not silently excluded', () =>
  withFixture(({ before, after }) => {
    const db = new DatabaseSync(after);
    db.exec('CREATE INDEX tag_run_v2_payout_wallet_idx ON tag_run_wallets(account)');
    db.close();
    assert.throws(() => verifyMigration105(before, after), /original schema objects/);
  }));

test('identical SQLite INTEGER values exceeding Number.MAX_SAFE_INTEGER pass', () =>
  withFixture(({ before, after }) => {
    for (const file of [before, after]) {
      const db = new DatabaseSync(file);
      db.exec("CREATE TABLE large_units(id TEXT PRIMARY KEY, units INTEGER); INSERT INTO large_units VALUES('one',9007199254740993)");
      db.close();
    }
    const result = verifyMigration105(before, after);
    assert.equal(result.originalTables, 7);
    assert.equal(result.originalRows, 7);
  }));

test('changed large SQLite INTEGER is detected with exact BigInt comparison', () =>
  withFixture(({ before, after }) => {
    for (const [file, units] of [[before,'9007199254740993'],[after,'9007199254740994']]) {
      const db = new DatabaseSync(file);
      db.exec("CREATE TABLE large_units(id TEXT PRIMARY KEY, units INTEGER); INSERT INTO large_units VALUES('one'," + units + ")");
      db.close();
    }
    assert.throws(() => verifyMigration105(before, after), /original table data changed: large_units/);
  }));

test('restore-time FK mismatch disappears once the parent index is created', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE telegram_pet_season_slots (
        pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, slot_number INTEGER
      );
      CREATE TABLE telegram_pet_instances (
        pet_id TEXT, telegram_id TEXT, season_key TEXT, slot_number INTEGER,
        FOREIGN KEY(pet_id, telegram_id, season_key, slot_number)
          REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key, slot_number)
      );
      INSERT INTO telegram_pet_season_slots VALUES ('pet','member','season',1);
    `);
    db.exec('PRAGMA foreign_keys=ON');
    assert.throws(() => db.exec("INSERT INTO telegram_pet_instances VALUES ('pet','member','season',1)"),
      /foreign key mismatch/);
    db.exec(`CREATE UNIQUE INDEX idx_telegram_pet_season_slots_pet_owner_tuple
      ON telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number)`);
    db.exec("INSERT INTO telegram_pet_instances VALUES ('pet','member','season',1)");
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});
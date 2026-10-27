import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectMoonpetBetaReset } from './moonpet-v1-beta-inventory.mjs';

function fixture(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec([
    'PRAGMA foreign_keys=ON;',
    'CREATE TABLE telegram_users(telegram_id TEXT PRIMARY KEY,xp INTEGER);',
    'CREATE TABLE arcade_progression_state(telegram_id TEXT PRIMARY KEY,arcade_xp_total INTEGER);',
    'CREATE TABLE arcade_xp_wallets(telegram_id TEXT PRIMARY KEY,arcade_xp_spendable INTEGER);',
    'CREATE TABLE telegram_pet_profiles(telegram_id TEXT PRIMARY KEY REFERENCES telegram_users(telegram_id),pet_xp INTEGER);',
    'CREATE TABLE telegram_pet_instances(pet_id TEXT PRIMARY KEY,telegram_id TEXT REFERENCES telegram_pet_profiles(telegram_id));',
    'CREATE TABLE telegram_pet_season_slots(pet_id TEXT PRIMARY KEY REFERENCES telegram_pet_instances(pet_id),telegram_id TEXT,status TEXT);',
    'CREATE TABLE moonpet_beta_records(pet_id TEXT,telegram_id TEXT);',
    'CREATE TABLE external_pet_awards(pet_id TEXT,telegram_id TEXT REFERENCES telegram_pet_profiles(telegram_id) ON DELETE RESTRICT);',
    "INSERT INTO telegram_users VALUES ('a',300);",
    "INSERT INTO arcade_progression_state VALUES ('a',1300);",
    "INSERT INTO arcade_xp_wallets VALUES ('a',800);",
    "INSERT INTO telegram_pet_profiles VALUES ('a',100);",
    "INSERT INTO telegram_pet_instances VALUES ('p','a');",
    "INSERT INTO telegram_pet_season_slots VALUES ('p','a','active');",
    "INSERT INTO moonpet_beta_records VALUES ('p','a');",
    "INSERT INTO external_pet_awards VALUES ('p','a');",
  ].join('\n'));
  return db;
}

test('read-only inventory identifies MoonPet, shared tables and external references', () => {
  const db = fixture();
  try {
    const snapshot = ['telegram_users','arcade_xp_wallets','telegram_pet_profiles']
      .map(name => db.prepare('SELECT * FROM ' + name).all());
    const report = inspectMoonpetBetaReset(db);
    assert.equal(report.mode, 'READ_ONLY_INVENTORY');
    assert.equal(report.writes_performed, 0);
    assert.equal(report.ready_for_reset, false);
    assert.deepEqual(report.moonpet_tables.map(x => x.table), [
      'moonpet_beta_records','telegram_pet_instances','telegram_pet_profiles','telegram_pet_season_slots',
    ]);
    assert.equal(report.moonpet_row_count, 4);
    assert.deepEqual(report.protected_shared_tables, [
      'arcade_progression_state','arcade_xp_wallets','telegram_users',
    ]);
    assert.deepEqual(report.moonpet_tables.find(x => x.table === 'telegram_pet_profiles')
      .inbound_non_moonpet_references, [{ table: 'external_pet_awards', on_delete: 'RESTRICT' }]);
    assert.deepEqual(report.possible_external_pet_sources, [
      { table: 'external_pet_awards', has_owner_column: true },
    ]);
    assert.deepEqual(['telegram_users','arcade_xp_wallets','telegram_pet_profiles']
      .map(name => db.prepare('SELECT * FROM ' + name).all()),snapshot);
  } finally { db.close(); }
});

test('CLI reads an offline backup without modifying bytes and rejects reset flags', () => {
  const dir = mkdtempSync(join(tmpdir(),'moonpet-v1-'));
  const file = join(dir,'backup.sqlite');
  try {
    fixture(file).close();
    const before = readFileSync(file);
    const script = fileURLToPath(new URL('./moonpet-v1-beta-inventory.mjs', import.meta.url));
    const result = spawnSync(process.execPath,[script,'--db',file],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).moonpet_row_count,4);
    const denied = spawnSync(process.execPath,[script,'--reset',file],{encoding:'utf8'});
    assert.notEqual(denied.status,0);
    assert.match(denied.stderr,/Read-only usage/);
    assert.deepEqual(readFileSync(file),before);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

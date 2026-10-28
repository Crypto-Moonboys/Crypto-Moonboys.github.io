import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectMoonpetBetaReset } from './moonpet-v1-beta-inventory.mjs';

function fixture(file = ':memory:', { compositeForeignKeys = false } = {}) {
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
  if (compositeForeignKeys) db.exec([
    'CREATE TABLE telegram_pet_reward_claims(claim_id TEXT,telegram_id TEXT,PRIMARY KEY(claim_id,telegram_id));',
    'CREATE TABLE telegram_pet_reward_assets(asset_id TEXT PRIMARY KEY,claim_id TEXT,telegram_id TEXT,',
    ' FOREIGN KEY(claim_id,telegram_id) REFERENCES telegram_pet_reward_claims(claim_id,telegram_id) ON DELETE CASCADE);',
    'CREATE TABLE external_claim_reviews(review_id TEXT PRIMARY KEY,claim_id TEXT,telegram_id TEXT,',
    ' FOREIGN KEY(claim_id,telegram_id) REFERENCES telegram_pet_reward_claims(claim_id,telegram_id) ON DELETE RESTRICT);',
    "INSERT INTO telegram_pet_reward_claims VALUES ('claim','a');",
    "INSERT INTO telegram_pet_reward_assets VALUES ('asset','claim','a');",
    "INSERT INTO external_claim_reviews VALUES ('review','claim','a');",
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

test('retains internal and external foreign-key edges grouped by composite constraint', () => {
  const db = fixture(':memory:', { compositeForeignKeys: true });
  try {
    const report = inspectMoonpetBetaReset(db);
    assert.equal(report.ready_for_reset, false);
    const claims = report.moonpet_tables.find(row => row.table === 'telegram_pet_reward_claims');
    const assets = report.moonpet_tables.find(row => row.table === 'telegram_pet_reward_assets');
    const columns = [
      { seq: 0, from: 'claim_id', to: 'claim_id' },
      { seq: 1, from: 'telegram_id', to: 'telegram_id' },
    ];
    const outbound = assets.outbound_foreign_keys.find(ref => ref.target_table === claims.table);
    assert.ok(outbound, 'internal asset-to-claim cascade must not disappear');
    assert.equal(outbound.source_table, assets.table);
    assert.equal(outbound.on_delete, 'CASCADE');
    assert.equal(outbound.columns.length, 2, 'two columns are one FK constraint');
    assert.deepEqual(outbound.columns, columns);
    const incoming = claims.inbound_foreign_keys.find(ref => ref.source_table === assets.table);
    assert.deepEqual(incoming, outbound, 'parent report must preserve full inbound constraint');
    const external = claims.inbound_foreign_keys.find(ref => ref.source_table === 'external_claim_reviews');
    assert.ok(external, 'non-MoonPet inbound composite FK must be retained');
    assert.deepEqual(external.columns, columns);
    assert.equal(external.on_delete, 'RESTRICT');
    assert.deepEqual(claims.inbound_non_moonpet_references,
      [{ table: 'external_claim_reviews', on_delete: 'RESTRICT' }]);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM telegram_pet_reward_assets').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM external_claim_reviews').get().count, 1);
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


test('CLI inspects a closed WAL-mode backup without creating source journals, twice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moonpet-v1-inventory-wal-'));
  const file = join(dir,'backup.sqlite');
  const sidecars = ['-wal','-shm','-journal'];
  const script = fileURLToPath(new URL('./moonpet-v1-beta-inventory.mjs',import.meta.url));
  const run = path => spawnSync(process.execPath,[script,'--db',path],{encoding:'utf8'});
  try {
    const db = fixture(file);
    db.exec('PRAGMA journal_mode=WAL');
    db.close();
    const original = readFileSync(file);
    for(const suffix of sidecars) assert.equal(existsSync(file+suffix),false);
    for(let attempt=0;attempt<2;attempt++){
      const result=run(file);
      assert.equal(result.status,0,result.stderr);
      const report=JSON.parse(result.stdout);
      assert.equal(report.moonpet_row_count,4);
      assert.equal(report.writes_performed,0);
      assert.equal(report.ready_for_reset,false);
      assert.deepEqual(readFileSync(file),original);
      for(const suffix of sidecars)
        assert.equal(existsSync(file+suffix),false,'inventory must never create source SQLite journals');
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CLI rejects active source journals and database-file symlinks without touching them', {skip:process.platform==='win32'}, () => {
  const dir=mkdtempSync(join(tmpdir(),'moonpet-v1-inventory-guard-'));
  const file=join(dir,'backup.sqlite'),alias=join(dir,'backup-link.sqlite');
  const script=fileURLToPath(new URL('./moonpet-v1-beta-inventory.mjs',import.meta.url));
  try {
    fixture(file).close();
    const original=readFileSync(file);
    const journal=file+'-wal';
    writeFileSync(journal,'UNTOUCHED');
    let result=spawnSync(process.execPath,[script,'--db',file],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/active SQLite journal/);
    assert.deepEqual(readFileSync(journal),Buffer.from('UNTOUCHED'));
    rmSync(journal);
    symlinkSync(file,alias);
    result=spawnSync(process.execPath,[script,'--db',alias],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/regular local SQLite backup/);
    assert.deepEqual(readFileSync(file),original);
    for(const suffix of ['-wal','-shm','-journal'])assert.equal(existsSync(file+suffix),false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

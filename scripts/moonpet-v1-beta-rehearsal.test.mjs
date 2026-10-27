import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectMoonpetBetaReset } from './moonpet-v1-beta-inventory.mjs';
import { MOONPET_V1_BETA_RESET_TABLES } from './moonpet-v1-beta-reset-tables.mjs';
import { planMoonpetV1BetaRehearsal, rehearseMoonpetV1BetaReset } from './moonpet-v1-beta-rehearsal.mjs';

const script = fileURLToPath(new URL('./moonpet-v1-beta-rehearsal.mjs', import.meta.url));
const sourceSql = readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const isPet = name => /^telegram_pet(?:_|s$)|^moonpet_/u.test(name);
const rows = (db, table) => JSON.parse(JSON.stringify(db.prepare('SELECT * FROM ' + table).all()));

function fixture(file) {
  const db = new DatabaseSync(file);
  db.exec([
    'PRAGMA foreign_keys=ON;',
    'CREATE TABLE telegram_users(telegram_id TEXT PRIMARY KEY,xp INTEGER);',
    'CREATE TABLE arcade_progression_state(telegram_id TEXT PRIMARY KEY,arcade_xp_total INTEGER);',
    'CREATE TABLE arcade_xp_wallets(telegram_id TEXT PRIMARY KEY,arcade_xp_spendable INTEGER);',
    'CREATE TABLE blocktopia_progression(telegram_id TEXT PRIMARY KEY,gems INTEGER);',
    'CREATE TABLE telegram_pet_profiles(telegram_id TEXT PRIMARY KEY REFERENCES telegram_users(telegram_id),pet_xp INTEGER,moon_gold INTEGER);',
    'CREATE TABLE telegram_pet_instances(pet_id TEXT PRIMARY KEY,telegram_id TEXT REFERENCES telegram_pet_profiles(telegram_id));',
    'CREATE TABLE telegram_pet_season_slots(pet_id TEXT PRIMARY KEY REFERENCES telegram_pet_instances(pet_id),telegram_id TEXT,status TEXT);',
    'CREATE TABLE telegram_pet_reward_claims(claim_id TEXT,telegram_id TEXT,PRIMARY KEY(claim_id,telegram_id));',
    'CREATE TABLE telegram_pet_reward_assets(asset_id TEXT PRIMARY KEY,claim_id TEXT,telegram_id TEXT,',
    ' FOREIGN KEY(claim_id,telegram_id) REFERENCES telegram_pet_reward_claims(claim_id,telegram_id) ON DELETE CASCADE);',
    "INSERT INTO telegram_users VALUES ('owner',99);",
    "INSERT INTO arcade_progression_state VALUES ('owner',1700);",
    "INSERT INTO arcade_xp_wallets VALUES ('owner',440);",
    "INSERT INTO blocktopia_progression VALUES ('owner',14);",
    "INSERT INTO telegram_pet_profiles VALUES ('owner',700,120);",
    "INSERT INTO telegram_pet_instances VALUES ('pet-one','owner');",
    "INSERT INTO telegram_pet_season_slots VALUES ('pet-one','owner','active');",
    "INSERT INTO telegram_pet_reward_claims VALUES ('reward','owner');",
    "INSERT INTO telegram_pet_reward_assets VALUES ('asset','reward','owner');",
  ].join('\n'));
  return db;
}

function sandbox(run) {
  const dir = mkdtempSync(join(tmpdir(),'moonpet-v1-offline-'));
  const src = join(dir,'backup.sqlite'), dst = join(dir,'new-copy.sqlite');
  try { fixture(src).close(); return run({src,dst,dir}); }
  finally { rmSync(dir,{recursive:true,force:true}); }
}

test('static allowlist matches reviewed MoonPet schema (not shared games)', () => {
  const names = [...sourceSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["]?([a-zA-Z_0-9]+)["]?\s*\(/gi)]
    .map(m => m[1]).filter(isPet).sort();
  assert.equal(names.length,81,'schema drift requires manual allowlist review');
  assert.deepEqual([...MOONPET_V1_BETA_RESET_TABLES],names);
  for(const shared of ['telegram_users','arcade_progression_state','arcade_xp_wallets','blocktopia_progression'])
    assert.equal(names.includes(shared),false);
});

test('fresh rehearsal copy clears pets with FK enforcement but never changes account tables or backup', () => sandbox(({src,dst}) => {
  const before = readFileSync(src);
  const source = new DatabaseSync(src,{readOnly:true});
  try {
    const plan = planMoonpetV1BetaRehearsal(source);
    assert.equal(plan.ready_for_live_reset,false);
    assert.equal(plan.source_row_count,5);
    assert.ok(plan.delete_order.indexOf('telegram_pet_reward_assets') <
      plan.delete_order.indexOf('telegram_pet_reward_claims'));
    assert.ok(plan.delete_order.indexOf('telegram_pet_instances') <
      plan.delete_order.indexOf('telegram_pet_profiles'));
  } finally {source.close();}
  const report = rehearseMoonpetV1BetaReset(src,dst);
  assert.equal(report.mode,'LOCAL_OFFLINE_REHEARSAL_COMPLETED');
  assert.equal(report.moonpet_rows_removed,5);
  assert.equal(report.foreign_keys_enforced,true);
  assert.equal(report.ready_for_live_reset,false);
  assert.deepEqual(readFileSync(src),before);
  const copy = new DatabaseSync(dst,{readOnly:true});
  try {
    assert.equal(inspectMoonpetBetaReset(copy).moonpet_row_count,0);
    assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.deepEqual(rows(copy,'telegram_users'),[{telegram_id:'owner',xp:99}]);
    assert.deepEqual(rows(copy,'arcade_progression_state'),[{telegram_id:'owner',arcade_xp_total:1700}]);
    assert.deepEqual(rows(copy,'arcade_xp_wallets'),[{telegram_id:'owner',arcade_xp_spendable:440}]);
    assert.deepEqual(rows(copy,'blocktopia_progression'),[{telegram_id:'owner',gems:14}]);
  } finally {copy.close();}
}));

test('unknown MoonPet schema and non-pet pet references fail closed before copying', () => sandbox(({src,dst}) => {
  let db = new DatabaseSync(src);
  db.exec('CREATE TABLE telegram_pet_unreviewed(value TEXT)');
  db.close();
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst),/unreviewed_moonpet_tables/);
  assert.equal(existsSync(dst),false);
  db = new DatabaseSync(src);
  db.exec('DROP TABLE telegram_pet_unreviewed; CREATE TABLE outside_records(pet_id TEXT)');
  db.close();
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst),/external_pet_id_dependency/);
  assert.equal(existsSync(dst),false);
}));

test('external FK into MoonPet and DELETE triggers fail closed', () => sandbox(({src,dst}) => {
  let db = new DatabaseSync(src);
  db.exec('CREATE TABLE outside_reference(owner TEXT REFERENCES telegram_pet_profiles(telegram_id))');
  db.close();
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst),/external_fk_moonpet_dependency/);
  db = new DatabaseSync(src);
  db.exec('DROP TABLE outside_reference; CREATE TRIGGER bad_delete AFTER DELETE ON telegram_pet_profiles BEGIN UPDATE telegram_users SET xp=0; END');
  db.close();
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst),/moonpet_delete_trigger_requires_review/);
  assert.equal(existsSync(dst),false);
}));

test('rehearsal blocks in-place, overwrite and any CLI execution without explicit local flags', () => sandbox(({src,dst}) => {
  const before=readFileSync(src);
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,src),/in_place_reset_forbidden/);
  writeFileSync(dst,'existing copy');
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst),/existing_output_forbidden/);
  assert.equal(readFileSync(dst,'utf8'),'existing copy');
  const child=spawnSync(process.execPath,[script,'--source',src,'--output',dst+'2'],{encoding:'utf8'});
  assert.notEqual(child.status,0);
  assert.match(child.stderr,/offline only/);
  assert.equal(existsSync(dst+'2'),false);
  assert.deepEqual(readFileSync(src),before);
}));


test('existing destination WAL, SHM and journal artifacts are refused without modification', () => sandbox(({src,dst,dir}) => {
  const sourceBefore=readFileSync(src);
  const paths=['-wal','-shm','-journal'].map(ext=>dst+ext);
  for(const path of paths)writeFileSync(path,'saved content: '+path);
  const snapshots=paths.map(path=>readFileSync(path));
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst),/existing_output_sidecars_forbidden/);
  assert.equal(existsSync(dst),false);
  for(let i=0;i<paths.length;i++)assert.deepEqual(readFileSync(paths[i]),snapshots[i]);
  assert.deepEqual(readFileSync(src),sourceBefore);
  const dangling=join(dir,'dangling-copy.sqlite');
  symlinkSync(join(dir,'no-such-target'),dangling+'-journal');
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dangling),/existing_output_sidecars_forbidden/);
  assert.equal(existsSync(dangling),false);
}));

test('a closed WAL-mode backup is never opened and can be rehearsed twice', () => sandbox(({src,dst,dir}) => {
  const db=new DatabaseSync(src);
  db.exec('PRAGMA journal_mode=WAL');
  db.close();
  const before=readFileSync(src);
  for(const suffix of ['-wal','-shm','-journal'])
    assert.equal(existsSync(src+suffix),false,'fixture must have no active journals');
  const first=rehearseMoonpetV1BetaReset(src,dst);
  assert.equal(first.moonpet_rows_removed,5);
  for(const suffix of ['-wal','-shm','-journal'])
    assert.equal(existsSync(src+suffix),false,'source journal metadata cannot be created');
  assert.deepEqual(readFileSync(src),before);
  const second=join(dir,'second-copy.sqlite');
  const repeat=rehearseMoonpetV1BetaReset(src,second);
  assert.equal(repeat.moonpet_rows_removed,5);
  assert.deepEqual(readFileSync(src),before);
  for(const suffix of ['-wal','-shm','-journal'])assert.equal(existsSync(src+suffix),false);
}));

test('mixed-case SQLite REFERENCES are canonicalized for ordering and external blockers', () => sandbox(({src,dst}) => {
  let db=new DatabaseSync(src);
  db.exec("CREATE TABLE telegram_pet_daily_completion(id TEXT PRIMARY KEY,owner TEXT REFERENCES TELEGRAM_PET_PROFILES(telegram_id));");
  db.exec("INSERT INTO telegram_pet_daily_completion VALUES ('daily','owner');");
  const plan=planMoonpetV1BetaRehearsal(db);
  assert.ok(plan.delete_order.indexOf('telegram_pet_daily_completion') <
    plan.delete_order.indexOf('telegram_pet_profiles'),
    'uppercase REFERENCES must not invert parent/child deletion order');
  db.close();
  const report=rehearseMoonpetV1BetaReset(src,dst);
  assert.equal(report.moonpet_rows_removed,6);
  assert.equal(report.foreign_keys_enforced,true);
  db=new DatabaseSync(src);
  db.exec('CREATE TABLE outside_reference(owner TEXT REFERENCES TELEGRAM_PET_PROFILES(telegram_id));');
  db.close();
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst+'2'),/external_fk_moonpet_dependency/);
  assert.equal(existsSync(dst+'2'),false);
});


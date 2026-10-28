import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  MOONPET_V1_BETA_RESET_TABLES,MOONPET_V1_BETA_PROTECTED_TABLES,
} from './moonpet-v1-beta-reset-tables.mjs';
import {auditMoonpetV1BetaBackup,auditMoonpetBackupPath} from './moonpet-v1-beta-backup-audit.mjs';

const script=fileURLToPath(new URL('./moonpet-v1-beta-backup-audit.mjs',import.meta.url));
const required=[
  '064_moonpet_beta_runtime_cutover.sql',
  '070_moonpet_pet_identity_achievement_authority.sql',
  '078_moonpet_beta_season_xp_rebaseline.sql',
  '080_moonpet_beta_xp_quarantine.sql',
  '082_moonpet_post_reward_overwrite_rebaseline.sql',
  '097_moonpet_room_furniture.sql',
];
function fixture(file){
  const db=new DatabaseSync(file);
  db.exec([
    'PRAGMA foreign_keys=ON',
    'CREATE TABLE telegram_users(telegram_id TEXT PRIMARY KEY)',
    'CREATE TABLE arcade_xp_wallets(telegram_id TEXT PRIMARY KEY,xp INTEGER)',
    'CREATE TABLE arcade_progression_state(telegram_id TEXT PRIMARY KEY,arcade_xp_total INTEGER)',
    'CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT)',
    'CREATE TABLE championship_clout_sources(source_system TEXT,source_event_id TEXT)',
  ].join(';'));
  for(const name of MOONPET_V1_BETA_RESET_TABLES){
    if(name==='moonpet_identity_authority_cutovers'||name==='telegram_pet_runtime_cutovers')
      db.exec('CREATE TABLE "'+name+'"(cutover_key TEXT PRIMARY KEY,other TEXT)');
    else db.exec('CREATE TABLE "'+name+'"(record_id TEXT PRIMARY KEY)');
  }
  for(const [idx,name] of required.entries())
    db.prepare('INSERT INTO d1_migrations VALUES (?,?)').run(idx+1,name);
  db.exec("INSERT INTO moonpet_identity_authority_cutovers(cutover_key) VALUES ('pet_identity_achievement_authority_v1')");
  db.exec("INSERT INTO telegram_pet_runtime_cutovers(cutover_key) VALUES ('moonpet-beta-pet-id-2026-08')");
  db.exec("INSERT INTO telegram_users VALUES ('owner')");
  db.exec("INSERT INTO arcade_xp_wallets VALUES ('owner',500)");
  db.exec("INSERT INTO arcade_progression_state VALUES ('owner',1000)");
  db.exec("INSERT INTO telegram_pet_growth_marks VALUES ('old-mark')");
  return db;
}
function sandbox(run){
 const dir=mkdtempSync(join(tmpdir(),'moonpet-v1-audit-'));
 const src=join(dir,'closed-backup.sqlite');
 try{fixture(src).close();return run({src,dir});}
 finally{rmSync(dir,{recursive:true,force:true});}
}
test('complete schema and both cutover markers qualify only for OFFLINE rehearsal',()=>sandbox(({src})=>{
  const db=new DatabaseSync(src,{readOnly:true});
  try{
    const report=auditMoonpetV1BetaBackup(db);
    assert.equal(report.status,'READY_FOR_OFFLINE_REHEARSAL');
    assert.equal(report.ready_for_offline_rehearsal,true);
    assert.equal(report.ready_for_live_reset,false);
    assert.equal(report.known_moonpet_tables,93);
    assert.equal(report.clearable_table_names,88);
    assert.equal(report.protected_table_names,5);
    assert.equal(report.protected_rows,2);
    assert.equal(report.source_row_count,3);
    assert.equal(report.moonpet_clout_sources,0);
    assert.deepEqual(report.blockers,[]);
    assert.equal(report.planned_cleared_rows,1);
  }finally{db.close();}
}));
test('cutover marker and migration omissions fail closed',()=>sandbox(({src})=>{
  const db=new DatabaseSync(src);
  db.exec('DELETE FROM moonpet_identity_authority_cutovers');
  db.exec("DELETE FROM d1_migrations WHERE name='070_moonpet_pet_identity_achievement_authority.sql'");
  const report=auditMoonpetV1BetaBackup(db);
  assert.equal(report.status,'BLOCKED');
  assert.ok(report.blockers.includes('required_cutover_marker_missing:moonpet_identity_authority_cutovers'));
  assert.ok(report.blockers.includes('required_migrations_missing'));
  assert.equal(report.ready_for_live_reset,false);
  db.close();
}));
test('MoonPet Clout receipts, unknown MoonPet tables, and external dependencies block',()=>sandbox(({src})=>{
  const db=new DatabaseSync(src);
  db.exec("INSERT INTO championship_clout_sources VALUES (' MoonPet ','mark-1')");
  db.exec('CREATE TABLE telegram_pet_unreviewed_new_table(n INTEGER)');
  db.exec('CREATE TABLE non_moonpet_pet_reference(pet_id TEXT)');
  const report=auditMoonpetV1BetaBackup(db);
  assert.equal(report.status,'BLOCKED');
  assert.ok(report.blockers.includes('moonpet_clout_source_provenance_requires_review'));
  assert.ok(report.blockers.includes('unreviewed_moonpet_tables'));
  assert.ok(report.blockers.some(v=>v.startsWith('reset_plan_blocked:')));
  assert.deepEqual(report.unexpected_moonpet_tables,['telegram_pet_unreviewed_new_table']);
  db.close();
}));
test('CLI audits only temporary copy; source bytes unchanged and no SQLite sidecars',async()=>sandbox(async({src})=>{
  const db=new DatabaseSync(src);
  db.exec('PRAGMA journal_mode=WAL');db.close();
  const before=readFileSync(src);
  const report=await auditMoonpetBackupPath(src);
  assert.equal(report.ready_for_live_reset,false);
  assert.equal(report.original_source_untouched,true);
  assert.match(report.backup_sha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(readFileSync(src),before);
  for(const suffix of ['-wal','-shm','-journal'])
    assert.equal(existsSync(src+suffix),false);
  const cli=spawnSync(process.execPath,[script,'--db',src],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);
  assert.equal(JSON.parse(cli.stdout).status,'READY_FOR_OFFLINE_REHEARSAL');
  assert.deepEqual(readFileSync(src),before);
}));
test('CLI rejects source journal and invalid command; neither makes an output',async()=>sandbox(async({src})=>{
  const before=readFileSync(src);
  writeFileSync(src+'-shm','do not touch');
  await assert.rejects(auditMoonpetBackupPath(src),/source_has_sqlite_sidecar/);
  assert.equal(readFileSync(src+'-shm','utf8'),'do not touch');
  rmSync(src+'-shm');
  const bad=spawnSync(process.execPath,[script,'--apply',src],{encoding:'utf8'});
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/Read-only usage/);
  assert.deepEqual(readFileSync(src),before);
}));

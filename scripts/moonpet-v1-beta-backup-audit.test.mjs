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
    'CREATE TABLE championship_clout_effects(source_system TEXT,source_event_id TEXT,game_key TEXT,source_pet_id TEXT)',
    'CREATE TABLE championship_clout_daily(game_keys_json TEXT)',
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
async function sandbox(run){
 const dir=mkdtempSync(join(tmpdir(),'moonpet-v1-audit-'));
 const src=join(dir,'closed-backup.sqlite');
 try{fixture(src).close();return await run({src,dir});}
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
test('live WAL writer opening during async hash blocks an otherwise clean backup audit',async()=>sandbox(async({src})=>{
  const setup=new DatabaseSync(src);
  setup.exec('PRAGMA journal_mode=WAL');
  setup.close();
  for(const suffix of ['-wal','-shm','-journal'])
    assert.equal(existsSync(src+suffix),false,'backup starts closed');
  const pending=auditMoonpetBackupPath(src);
  // The concurrent writer starts before the first async SHA-256 completes.
  // Its commit lives in WAL while the original main-file bytes may remain
  // identical. An old audit falsely returned READY in exactly this state.
  const writer=new DatabaseSync(src);
  try {
    writer.exec("INSERT INTO telegram_pet_growth_marks VALUES ('concurrent-new-mark')");
    assert.equal(existsSync(src+'-wal'),true,'writer keeps live WAL present during inspection');
    await assert.rejects(pending,/source_has_sqlite_sidecar/,
      'an active WAL must stop the READY_FOR_OFFLINE_REHEARSAL result');
  } finally {
    writer.close();
  }
  const verify=new DatabaseSync(src,{readOnly:true});
  try {
    assert.equal(verify.prepare('SELECT COUNT(*) AS n FROM telegram_pet_growth_marks').get().n,2,
      'the external writer committed normally; audit did not modify the source');
  } finally {verify.close();}
}));

test('post-hash source sidecar sentinel fails closed and is never removed by audit',async()=>sandbox(async({src})=>{
  const pending=auditMoonpetBackupPath(src);
  writeFileSync(src+'-journal','external writer journal');
  try {
    await assert.rejects(pending,/source_has_sqlite_sidecar/);
    assert.equal(readFileSync(src+'-journal','utf8'),'external writer journal');
  } finally {rmSync(src+'-journal');}
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

test('orphan shared Clout effect or daily projection blocks an apparently clean D1 backup',()=>sandbox(({src})=>{
  const db=new DatabaseSync(src);
  try {
    db.exec("INSERT INTO championship_clout_effects VALUES ('MoonPet','old-crest',NULL,'old-pet')");
    let status=auditMoonpetV1BetaBackup(db);
    assert.equal(status.status,'BLOCKED');
    assert.equal(status.moonpet_clout_sources,0);
    assert.equal(status.moonpet_clout_effects,1);
    assert.ok(status.blockers.includes('moonpet_clout_effects_provenance_requires_review'));
    db.exec('DELETE FROM championship_clout_effects');
    db.exec("INSERT INTO championship_clout_daily VALUES ('[\"moonpet\"]')");
    status=auditMoonpetV1BetaBackup(db);
    assert.equal(status.status,'BLOCKED');
    assert.equal(status.moonpet_clout_daily_projections,1);
    assert.ok(status.blockers.includes('moonpet_clout_daily_projection_requires_review'));
  } finally {db.close();}
}));
test('missing Clout effects and daily projection tables block current-backup acceptance',()=>sandbox(({src})=>{
  const db=new DatabaseSync(src);
  try {
    db.exec('DROP TABLE championship_clout_effects; DROP TABLE championship_clout_daily');
    const status=auditMoonpetV1BetaBackup(db);
    assert.equal(status.status,'BLOCKED');
    assert.deepEqual(status.missing_clout_projection_tables,
      ['championship_clout_effects','championship_clout_daily']);
    assert.ok(status.blockers.includes('championship_clout_projection_tables_missing'));
  } finally{db.close();}
}));


test('backup acceptance refuses nested or non-string Clout daily keys even with no MoonPet receipt',()=>sandbox(({src})=>{
  const samples=[
    [['moonpet']], [{game_key:'moonpet'}], [null], [1],
    ['dead-run','dead-run'],
  ];
  const db=new DatabaseSync(src);
  try {
    const insert=db.prepare('INSERT INTO championship_clout_daily(game_keys_json) VALUES (?)');
    for(const games of samples){
      db.exec('DELETE FROM championship_clout_daily');
      insert.run(JSON.stringify(games));
      const status=auditMoonpetV1BetaBackup(db);
      assert.equal(status.status,'BLOCKED',JSON.stringify(games));
      assert.equal(status.moonpet_clout_sources,0);
      assert.equal(status.moonpet_clout_effects,0);
      assert.equal(status.moonpet_clout_daily_unverifiable_json,1);
      assert.ok(status.blockers.includes('championship_clout_daily_json_unverifiable'));
      assert.equal(status.ready_for_live_reset,false);
    }
    db.exec('DELETE FROM championship_clout_daily');
    insert.run('["dead-run"]');
    const status=auditMoonpetV1BetaBackup(db);
    assert.equal(status.status,'READY_FOR_OFFLINE_REHEARSAL');
    assert.equal(status.moonpet_clout_daily_unverifiable_json,0);
    assert.equal(status.ready_for_live_reset,false);
  }finally{db.close();}
}));

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectMoonpetBetaReset } from './moonpet-v1-beta-inventory.mjs';
import { MOONPET_V1_BETA_RESET_TABLES, MOONPET_V1_BETA_SCHEMA_TABLES, MOONPET_V1_BETA_LEGACY_TABLES, MOONPET_V1_BETA_PROTECTED_TABLES, MOONPET_V1_BETA_CLEAR_TABLES } from './moonpet-v1-beta-reset-tables.mjs';
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
  assert.equal(names.length,81,'checked-in schema drift requires manual review');
  assert.deepEqual([...MOONPET_V1_BETA_SCHEMA_TABLES],names);
  const historical = [
    'moonpet_beta_xp_rebaseline',
    'moonpet_identity_authority_cutovers',
    'telegram_pet_growth_marks',
    'telegram_pet_practice',
    'telegram_pet_runtime_cutovers',
    'telegram_pet_sanctuary',
    'telegram_pet_season_completions',
    'telegram_pet_season_reward_claims',
    'telegram_pet_weekly_boss_events',
    'telegram_pet_weekly_boss_progress',
    'telegram_pet_weekly_boss_victories_by_pet',
    'telegram_pet_weekly_crests',
  ];
  assert.deepEqual([...MOONPET_V1_BETA_LEGACY_TABLES],historical);
  assert.equal(MOONPET_V1_BETA_RESET_TABLES.length,93);
  assert.deepEqual([...MOONPET_V1_BETA_RESET_TABLES],
    [...names,...historical].sort(),'reviewed live D1 legacy list and source schema must match');
  assert.equal(new Set(MOONPET_V1_BETA_RESET_TABLES).size,93);
  assert.deepEqual([...MOONPET_V1_BETA_PROTECTED_TABLES],[
    'moonpet_beta_xp_quarantine',
    'moonpet_beta_xp_rebaseline',
    'moonpet_beta_xp_rebaseline_v2',
    'moonpet_identity_authority_cutovers',
    'telegram_pet_runtime_cutovers',
  ]);
  assert.equal(MOONPET_V1_BETA_CLEAR_TABLES.length,88);
  assert.ok(MOONPET_V1_BETA_CLEAR_TABLES.every(name => !MOONPET_V1_BETA_PROTECTED_TABLES.includes(name)));
  assert.deepEqual([...MOONPET_V1_BETA_CLEAR_TABLES].sort(),MOONPET_V1_BETA_RESET_TABLES
    .filter(name => !MOONPET_V1_BETA_PROTECTED_TABLES.includes(name)));
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

test('twelve legacy MoonPet names preserve cutovers while clearing beta gameplay in an offline copy', () => sandbox(({src,dst}) => {
  const db=new DatabaseSync(src);
  db.exec('PRAGMA foreign_keys=ON');
  for(const name of MOONPET_V1_BETA_LEGACY_TABLES) {
    const protectedRecord=MOONPET_V1_BETA_PROTECTED_TABLES.includes(name);
    const refs=protectedRecord ? '' :
      ',FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)'
      + ',FOREIGN KEY(telegram_id) REFERENCES telegram_pet_profiles(telegram_id)';
    db.exec('CREATE TABLE "'+name+'" (k TEXT PRIMARY KEY,pet_id TEXT,telegram_id TEXT'+refs+')');
    db.prepare('INSERT INTO "'+name+'" (k,pet_id,telegram_id) VALUES (?,?,?)')
      .run(name,'pet-one','owner');
  }
  db.close();
  const original=readFileSync(src);
  const srcDb=new DatabaseSync(src,{readOnly:true});
  let plan;
  try{
    plan=planMoonpetV1BetaRehearsal(srcDb);
    assert.equal(plan.source_table_count,17);
    assert.equal(plan.source_row_count,17);
    assert.equal(plan.protected_row_count,3);
    assert.equal(plan.cleared_row_count,14);
    assert.equal(plan.cleared_table_count,14);
    for(const name of MOONPET_V1_BETA_LEGACY_TABLES){
      if(MOONPET_V1_BETA_PROTECTED_TABLES.includes(name))
        assert.ok(!plan.delete_order.includes(name), name+' is a durable migration/correction ledger');
      else assert.ok(plan.delete_order.indexOf(name)<plan.delete_order.indexOf('telegram_pet_instances'),
        name+' must delete before its source pet');
    }
  }finally{srcDb.close();}
  const result=rehearseMoonpetV1BetaReset(src,dst);
  assert.equal(result.moonpet_tables_cleared,14);
  assert.equal(result.moonpet_rows_removed,14);
  assert.equal(result.protected_moonpet_rows_preserved,3);
  assert.equal(result.ready_for_live_reset,false);
  assert.deepEqual(readFileSync(src),original);
  const copy=new DatabaseSync(dst,{readOnly:true});
  try{
    assert.equal(inspectMoonpetBetaReset(copy).moonpet_row_count,3);
    for(const name of MOONPET_V1_BETA_LEGACY_TABLES){
      const row=copy.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get();
      assert.equal(row.n,MOONPET_V1_BETA_PROTECTED_TABLES.includes(name)?1:0,name);
    }
    assert.deepEqual(rows(copy,'arcade_xp_wallets'),[{telegram_id:'owner',arcade_xp_spendable:440}]);
    assert.deepEqual(rows(copy,'arcade_progression_state'),[{telegram_id:'owner',arcade_xp_total:1700}]);
    assert.deepEqual(rows(copy,'telegram_users'),[{telegram_id:'owner',xp:99}]);
    assert.deepEqual(rows(copy,'blocktopia_progression'),[{telegram_id:'owner',gems:14}]);
    assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{copy.close();}
}));

test('all five migration sentinels and correction ledgers survive a reset of pet gameplay', () => sandbox(({src,dst}) => {
  const db=new DatabaseSync(src);
  for(const name of MOONPET_V1_BETA_PROTECTED_TABLES){
    db.exec('CREATE TABLE "'+name+'" (marker TEXT PRIMARY KEY,applied_at TEXT)');
    db.prepare('INSERT INTO "'+name+'" VALUES (?,?)').run('cutover:'+name,'2026-10-01');
  }
  db.close();
  const before=readFileSync(src);
  const planDb=new DatabaseSync(src,{readOnly:true});
  let plan;
  try{plan=planMoonpetV1BetaRehearsal(planDb);}
  finally{planDb.close();}
  assert.equal(plan.protected_row_count,5);
  assert.equal(plan.cleared_row_count,5);
  assert.deepEqual([...plan.protected_tables].sort(),[...MOONPET_V1_BETA_PROTECTED_TABLES].sort());
  const outcome=rehearseMoonpetV1BetaReset(src,dst);
  assert.equal(outcome.moonpet_tables_cleared,5);
  assert.equal(outcome.moonpet_rows_removed,5);
  assert.equal(outcome.protected_moonpet_rows_preserved,5);
  assert.equal(outcome.shared_and_protected_table_digests_verified,9);
  assert.deepEqual(readFileSync(src),before);
  const copy=new DatabaseSync(dst,{readOnly:true});
  try{
    assert.equal(inspectMoonpetBetaReset(copy).moonpet_row_count,5);
    for(const name of MOONPET_V1_BETA_PROTECTED_TABLES)
      assert.deepEqual(rows(copy,'"'+name+'"'),[{marker:'cutover:'+name,applied_at:'2026-10-01'}],name);
    assert.deepEqual(rows(copy,'arcade_xp_wallets'),[{telegram_id:'owner',arcade_xp_spendable:440}]);
  }finally{copy.close();}
}));

test('protected migration marker may not reference a cleared pet through a foreign key', () => sandbox(({src,dst}) => {
  const db=new DatabaseSync(src);
  db.exec('CREATE TABLE moonpet_identity_authority_cutovers (cutover_key TEXT PRIMARY KEY,telegram_id TEXT REFERENCES telegram_pet_profiles(telegram_id))');
  db.exec("INSERT INTO moonpet_identity_authority_cutovers VALUES ('identity-guard','owner')");
  db.close();
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst),/protected_moonpet_fk_depends_on_cleared_pet/);
  assert.equal(existsSync(dst),false);
}));

test('Championship Clout must not retain orphaned MoonPet proof when gameplay receipts are cleared', () => sandbox(({src,dst}) => {
  const db=new DatabaseSync(src);
  db.exec('CREATE TABLE championship_clout_sources (source_system TEXT NOT NULL, source_event_id TEXT NOT NULL)');
  db.exec("INSERT INTO championship_clout_sources VALUES ('dead_run','independent-run')");
  db.close();
  const successful=rehearseMoonpetV1BetaReset(src,dst);
  assert.equal(successful.moonpet_rows_removed,5);
  const copy=new DatabaseSync(dst,{readOnly:true});
  try{assert.deepEqual(rows(copy,'championship_clout_sources'),[{source_system:'dead_run',source_event_id:'independent-run'}]);}
  finally{copy.close();}
  const changed=new DatabaseSync(src);
  changed.exec("INSERT INTO championship_clout_sources VALUES ('moonpet','historical-growth-mark')");
  changed.close();
  const second=dst+'-blocked';
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,second),/moonpet_clout_source_provenance_requires_review/);
  assert.equal(existsSync(second),false);
  const schemaDb=new DatabaseSync(src);
  schemaDb.exec('DROP TABLE championship_clout_sources; CREATE TABLE championship_clout_sources(unrecognized TEXT)');
  schemaDb.close();
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,second),/championship_clout_source_schema_unavailable/);
  assert.equal(existsSync(second),false);
}));

test('mixed-case shared Clout table and MoonPet source labels fail closed', () => sandbox(({src,dst}) => {
  const db=new DatabaseSync(src);
  db.exec('CREATE TABLE Championship_Clout_Sources(source_system TEXT, source_event_id TEXT)');
  db.exec("INSERT INTO Championship_Clout_Sources VALUES ('MoonPet','old-weekly-crest')");
  db.close();
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dst),/moonpet_clout_source_provenance_requires_review/);
  assert.equal(existsSync(dst),false);
  const db2=new DatabaseSync(src);
  db2.exec("UPDATE Championship_Clout_Sources SET source_system='DEAD_RUN'");
  db2.close();
  const success=rehearseMoonpetV1BetaReset(src,dst);
  assert.equal(success.moonpet_rows_removed,5);
  const copy=new DatabaseSync(dst,{readOnly:true});
  try{ assert.deepEqual(rows(copy,'Championship_Clout_Sources'),
    [{source_system:'DEAD_RUN',source_event_id:'old-weekly-crest'}]); }
  finally{copy.close();}
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
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,src+'-wal'),/source_or_journal_target_overlap_forbidden/);
  assert.equal(existsSync(src+'-wal'),false);
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
}));

test('dangling journal symlink is rejected without modifying the source', { skip: process.platform === 'win32' }, () => sandbox(({src,dir}) => {
  const before=readFileSync(src);
  const dangling=join(dir,'dangling-copy.sqlite');
  symlinkSync(join(dir,'no-such-target'),dangling+'-journal');
  assert.throws(()=>rehearseMoonpetV1BetaReset(src,dangling),/existing_output_sidecars_forbidden/);
  assert.equal(existsSync(dangling),false);
  assert.deepEqual(readFileSync(src),before);
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
}));



test('directory symlink cannot disguise original backup journal as an output', { skip: process.platform === 'win32' }, () => sandbox(({src,dir}) => {
  const before = readFileSync(src);
  const alias = join(dir, 'directory-alias');
  symlinkSync(dir, alias, 'dir');
  const maliciousTarget = join(alias, 'backup.sqlite-wal');
  assert.throws(() => rehearseMoonpetV1BetaReset(src, maliciousTarget),
    /source_or_journal_target_overlap_forbidden/,
    'canonical parent directory must expose target as source WAL file');
  assert.equal(existsSync(src + '-wal'), false);
  assert.deepEqual(readFileSync(src), before);
  assert.throws(() => rehearseMoonpetV1BetaReset(join(alias, 'backup.sqlite'), src + '-shm'),
    /source_or_journal_target_overlap_forbidden/,
    'source directory alias must not bypass the inverse overlap check');
  assert.equal(existsSync(src + '-shm'), false);
  assert.deepEqual(readFileSync(src), before);
}));

test('directory symlink preserves valid new-copy rehearsal while source stays clean', { skip: process.platform === 'win32' }, () => sandbox(({src,dir}) => {
  const alias = join(dir, 'output-alias');
  symlinkSync(dir, alias, 'dir');
  const original = readFileSync(src);
  const dst = join(alias, 'alias-output.sqlite');
  const report = rehearseMoonpetV1BetaReset(src, dst);
  assert.equal(report.moonpet_rows_removed, 5);
  assert.equal(report.output_path, join(dir, 'alias-output.sqlite'),
    'output is reported using the canonical parent');
  assert.deepEqual(readFileSync(src), original);
  for (const extension of ['-wal', '-shm', '-journal'])
    assert.equal(existsSync(src + extension), false, 'backup sidecar must remain absent');
  const db = new DatabaseSync(report.output_path, { readOnly: true });
  try {
    assert.equal(inspectMoonpetBetaReset(db).moonpet_row_count, 0);
  } finally { db.close(); }
}));

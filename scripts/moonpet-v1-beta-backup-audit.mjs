#!/usr/bin/env node
/**
 * MoonPet V1 private beta: read-only readiness audit of a CLOSED LOCAL D1
 * SQLite export. It never updates any database or recommends a live wipe.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, constants, createReadStream, lstatSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectMoonpetBetaReset } from './moonpet-v1-beta-inventory.mjs';
import { planMoonpetV1BetaRehearsal } from './moonpet-v1-beta-rehearsal.mjs';
import {
  MOONPET_V1_BETA_RESET_TABLES,
  MOONPET_V1_BETA_PROTECTED_TABLES,
  MOONPET_V1_BETA_CLEAR_TABLES,
} from './moonpet-v1-beta-reset-tables.mjs';

// Applied migrations, NOT the application-level version of the live Worker.
const REQUIRED_MIGRATIONS = Object.freeze([
  '064_moonpet_beta_runtime_cutover.sql',
  '070_moonpet_pet_identity_achievement_authority.sql',
  '078_moonpet_beta_season_xp_rebaseline.sql',
  '080_moonpet_beta_xp_quarantine.sql',
  '082_moonpet_post_reward_overwrite_rebaseline.sql',
  '097_moonpet_room_furniture.sql',
]);
const canonical = path => {
  const absolute = resolve(path);
  return join(realpathSync(dirname(absolute)),basename(absolute));
};
const existsEvenIfDangling = path => lstatSync(path,{throwIfNoEntry:false}) !== undefined;
const quote = name => '"' + String(name).replaceAll('"','""') + '"';

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(row=>row.name);
}
function hasTable(tables, name) {
  return tables.find(table => table.toLowerCase() === name.toLowerCase()) || null;
}
function countRows(db,table) {
  const n=db.prepare('SELECT COUNT(*) AS n FROM '+quote(table)).get()?.n;
  if(!Number.isSafeInteger(n)||n<0) throw Error('backup_audit_invalid_count:'+table);
  return n;
}
function add(blockers,code) {
  if (!blockers.includes(code)) blockers.push(code);
}

/** Pure read-only inspection. No mutation or network access. */
export function auditMoonpetV1BetaBackup(db) {
  const all=tableNames(db);
  const inventory=inspectMoonpetBetaReset(db);
  const actual=inventory.moonpet_tables.map(row=>row.table);
  const expected=new Set(MOONPET_V1_BETA_RESET_TABLES.map(name=>name.toLowerCase()));
  const actualSet=new Set(actual.map(name=>name.toLowerCase()));
  const unexpected=actual.filter(name=>!expected.has(name));
  const missing=MOONPET_V1_BETA_RESET_TABLES.filter(name=>!actualSet.has(name));
  const blockers=[];
  if(unexpected.length) add(blockers,'unreviewed_moonpet_tables');
  if(missing.length) add(blockers,'missing_reviewed_moonpet_tables');

  const protectedCount=MOONPET_V1_BETA_PROTECTED_TABLES
    .filter(name=>actualSet.has(name.toLowerCase()))
    .reduce((sum,name)=>sum+countRows(db,hasTable(all,name)),0);
  const cloutTable=hasTable(all,'championship_clout_sources');
  let cloutCount=null;
  if(cloutTable){
    const cols=db.prepare('PRAGMA table_info('+quote(cloutTable)+')').all()
      .map(row=>String(row.name).toLowerCase());
    if(!cols.includes('source_system')||!cols.includes('source_event_id'))
      add(blockers,'championship_clout_schema_unavailable');
    else {
      cloutCount=db.prepare('SELECT COUNT(*) AS n FROM '+quote(cloutTable)+
        " WHERE lower(trim(source_system))='moonpet'").get().n;
      if(cloutCount>0) add(blockers,'moonpet_clout_source_provenance_requires_review');
    }
  } else {
    // No table is normal only for a backup predating migration 100. Requiring
    // that migration below ensures a current-release backup fails closed.
    add(blockers,'championship_clout_source_table_missing');
  }

  const migrationTable=hasTable(all,'d1_migrations');
  let missingMigrations=[...REQUIRED_MIGRATIONS];
  if(migrationTable) {
    try {
      const names=new Set(db.prepare('SELECT name FROM '+quote(migrationTable)).all()
        .map(row=>String(row.name)));
      missingMigrations=REQUIRED_MIGRATIONS.filter(name=>!names.has(name));
    } catch {add(blockers,'migration_ledger_unreadable');}
  } else add(blockers,'migration_ledger_missing');
  if(missingMigrations.length)add(blockers,'required_migrations_missing');

  function requireMarker(table,key) {
    const found=hasTable(all,table);
    if(!found){add(blockers,'required_cutover_table_missing:'+table);return;}
    try{
      const marker=db.prepare('SELECT COUNT(*) AS n FROM '+quote(found)+' WHERE cutover_key=?')
        .get(key)?.n;
      if(marker!==1)add(blockers,'required_cutover_marker_missing:'+table);
    }catch {add(blockers,'required_cutover_marker_unreadable:'+table);}
  }
  requireMarker('moonpet_identity_authority_cutovers','pet_identity_achievement_authority_v1');
  requireMarker('telegram_pet_runtime_cutovers','moonpet-beta-pet-id-2026-08');

  const quick=db.prepare('PRAGMA quick_check').all();
  if(quick.length!==1||quick[0].quick_check!=='ok')add(blockers,'sqlite_integrity_check_failed');
  let plan=null;
  try{plan=planMoonpetV1BetaRehearsal(db);}
  catch(error){add(blockers,'reset_plan_blocked:'+String(error?.message||error));}

  const qualified=blockers.length===0;
  return {
    kind:'moonpet_v1_private_beta_offline_backup_audit',
    status:qualified?'READY_FOR_OFFLINE_REHEARSAL':'BLOCKED',
    ready_for_offline_rehearsal:qualified,
    ready_for_live_reset:false,
    known_moonpet_tables:actual.length,
    expected_moonpet_tables:MOONPET_V1_BETA_RESET_TABLES.length,
    clearable_table_names:MOONPET_V1_BETA_CLEAR_TABLES.length,
    protected_table_names:MOONPET_V1_BETA_PROTECTED_TABLES.length,
    protected_rows:protectedCount,
    missing_reviewed_tables:missing,
    unexpected_moonpet_tables:unexpected,
    missing_required_migrations:missingMigrations,
    moonpet_clout_sources:cloutCount,
    source_row_count:inventory.moonpet_row_count,
    planned_cleared_rows:plan?.cleared_row_count??null,
    planned_preserved_rows:plan?.protected_row_count??null,
    blockers,
    outstanding_live_release_gates:[
      'Rehearse on an independent new copy of this CLOSED export and verify protected/shared row digests',
      'Manually reconcile external Community XP, Championship Clout and other game proof without database foreign keys',
      'Prove a D1 restore/rollback drill and capture the current Worker deployment provenance',
      'Run signed Telegram fresh-player checks before a separately authorised live reset',
    ],
  };
}

async function fileHash(path) {
  const hash=createHash('sha256');
  for await (const part of createReadStream(path)) hash.update(part);
  return hash.digest('hex');
}
export async function auditMoonpetBackupPath(inputPath) {
  const source=canonical(inputPath);
  const info=lstatSync(source,{throwIfNoEntry:false});
  if(!info||!info.isFile()||info.isSymbolicLink())
    throw Error('existing_regular_closed_backup_required');
  for(const suffix of ['-wal','-shm','-journal'])
    if(existsEvenIfDangling(source+suffix)) throw Error('source_has_sqlite_sidecar:'+suffix);
  const before=await fileHash(source);
  const originalSize=statSync(source).size;
  const scratch=mkdtempSync(join(tmpdir(),'moonpet-v1-backup-audit-'));
  try {
    const copy=join(scratch,'offline.sqlite');
    copyFileSync(source,copy,constants.COPYFILE_EXCL);
    if(await fileHash(copy)!==before)throw Error('backup_copy_hash_mismatch');
    const db=new DatabaseSync(copy,{readOnly:true});
    let report;
    try {
      db.exec('PRAGMA query_only=ON');
      report=auditMoonpetV1BetaBackup(db);
    }finally {db.close();}
    const after=await fileHash(source);
    if(before!==after||statSync(source).size!==originalSize)
      throw Error('backup_changed_during_audit');
    return {...report,backup_sha256:before,backup_size_bytes:originalSize,original_source_untouched:true};
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--db'||!args[1])
    throw Error('Read-only usage: node scripts/moonpet-v1-beta-backup-audit.mjs --db CLOSED_LOCAL_D1_EXPORT.sqlite');
  process.stdout.write(JSON.stringify(await auditMoonpetBackupPath(args[1]),null,2)+'\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}

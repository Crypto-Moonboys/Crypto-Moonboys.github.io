#!/usr/bin/env node
/**
 * MoonPet V1 private beta: read-only readiness audit of a CLOSED LOCAL D1
 * SQLite export. It never updates any database or recommends a live wipe.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, constants, createReadStream, lstatSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectMoonpetBetaReset } from './moonpet-v1-beta-inventory.mjs';
import { planMoonpetV1BetaRehearsal } from './moonpet-v1-beta-rehearsal.mjs';
import { auditMoonpetSharedCloutProof } from './moonpet-v1-beta-shared-clout-proof.mjs';
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

// A source may become active while an asynchronous file hash yields. Check
// WAL, SHM and rollback journals before AND after each awaited read. Also
// reject a replaced or checkpointed source even if its size is unchanged.
// This is a fail-closed validation of a CLOSED EXPORT, not a live DB lock.
function assertClosedBackupSource(source, baseline) {
  const info=lstatSync(source,{throwIfNoEntry:false});
  if(!info||!info.isFile()||info.isSymbolicLink())
    throw Error('existing_regular_closed_backup_required');
  for(const suffix of ['-wal','-shm','-journal'])
    if(existsEvenIfDangling(source+suffix)) throw Error('source_has_sqlite_sidecar:'+suffix);
  if(baseline && (
      info.dev!==baseline.dev || info.ino!==baseline.ino ||
      info.size!==baseline.size || info.mtimeMs!==baseline.mtimeMs ||
      info.ctimeMs!==baseline.ctimeMs))
    throw Error('backup_source_changed_during_audit');
  return info;
}

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
  const clout = auditMoonpetSharedCloutProof(db);
  for (const reason of clout.blockers) add(blockers,reason);
  if (!hasTable(all,'championship_clout_sources'))
    add(blockers,'championship_clout_source_table_missing');
  if (clout.missing_projection_tables.length)
    add(blockers,'championship_clout_projection_tables_missing');

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
    moonpet_clout_sources:clout.source_rows,
    moonpet_clout_effects:clout.effect_rows,
    moonpet_clout_daily_projections:clout.daily_rows,
    moonpet_clout_daily_unverifiable_json:clout.invalid_daily_json_rows,
    championship_archived_periods:clout.archived_periods,
    missing_clout_projection_tables:clout.missing_projection_tables,
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
  const initial=assertClosedBackupSource(source);
  const before=await fileHash(source);
  // A concurrent SQLite writer can create a WAL *without changing the main
  // file hash*; re-check the source before cloning the apparently closed DB.
  assertClosedBackupSource(source,initial);
  const originalSize=initial.size;
  const scratch=mkdtempSync(join(tmpdir(),'moonpet-v1-backup-audit-'));
  try {
    assertClosedBackupSource(source,initial);
    const copy=join(scratch,'offline.sqlite');
    copyFileSync(source,copy,constants.COPYFILE_EXCL);
    if(await fileHash(copy)!==before)throw Error('backup_copy_hash_mismatch');
    assertClosedBackupSource(source,initial);
    const db=new DatabaseSync(copy,{readOnly:true});
    let report;
    try {
      db.exec('PRAGMA query_only=ON');
      report=auditMoonpetV1BetaBackup(db);
    }finally {db.close();}
    assertClosedBackupSource(source,initial);
    const after=await fileHash(source);
    // Re-check after the FINAL await before certifying offline rehearsal
    // eligibility; hashing the main file alone cannot detect active WAL.
    assertClosedBackupSource(source,initial);
    if(before!==after) throw Error('backup_changed_during_audit');
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

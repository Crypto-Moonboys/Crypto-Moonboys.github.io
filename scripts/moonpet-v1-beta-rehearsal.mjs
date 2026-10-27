#!/usr/bin/env node
/**
 * MoonPet OS V1 beta: LOCAL OFFLINE REHEARSAL ONLY.
 * Reads an existing offline SQLite backup and writes only to a NEW local copy.
 * No Cloudflare connection, D1 mutation, in-place reset or remote operation.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, constants, lstatSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectMoonpetBetaReset } from './moonpet-v1-beta-inventory.mjs';
import { MOONPET_V1_BETA_RESET_TABLES } from './moonpet-v1-beta-reset-tables.mjs';

const quote = name => '"' + String(name).replaceAll('"', '""') + '"';
const allowed = new Set(MOONPET_V1_BETA_RESET_TABLES);
const sidecars = path => [path + '-wal', path + '-shm', path + '-journal'];
// Unlike existsSync, lstat also identifies dangling symlinks that SQLite
// might follow, replace or remove when opening a database.
const occupied = path => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
// Resolve directory aliases before comparing SQLite main/journal paths. Keep
// the final filename un-followed so final-component symlinks are still refused.
const canonicalFilePath = value => {
  const full = resolve(value);
  return join(realpathSync(dirname(full)), basename(full));
};

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(row => row.name);
}

function sharedTableDigests(db, resetNames) {
  return tableNames(db).filter(name => !resetNames.has(name)).map(name => {
    const hash = createHash('sha256');
    let rows = 0;
    for (const row of db.prepare('SELECT * FROM ' + quote(name)).iterate()) {
      hash.update(JSON.stringify(row)); hash.update('\n'); rows++;
    }
    return { table: name, rows, sha256: hash.digest('hex') };
  });
}

function childrenBeforeParents(names, inventory) {
  const outgoing = new Map(names.map(name => [name, new Set()]));
  const inboundCounts = new Map(names.map(name => [name, 0]));
  for (const row of inventory.moonpet_tables) {
    for (const fk of row.outbound_foreign_keys) {
      // The inventory canonicalizes PRAGMA FK target spelling to actual table
      // names. The remaining comparison is therefore exact and unambiguous.
      if (!outgoing.has(fk.target_table) || outgoing.get(row.table).has(fk.target_table)) continue;
      outgoing.get(row.table).add(fk.target_table);
      inboundCounts.set(fk.target_table, inboundCounts.get(fk.target_table) + 1);
    }
  }
  const queue = names.filter(name => inboundCounts.get(name) === 0).sort();
  const result = [];
  while (queue.length) {
    const child = queue.shift(); result.push(child);
    for (const parent of outgoing.get(child)) {
      inboundCounts.set(parent, inboundCounts.get(parent) - 1);
      if (inboundCounts.get(parent) === 0) { queue.push(parent); queue.sort(); }
    }
  }
  if (result.length !== names.length) throw Error('moonpet_fk_cycle_requires_manual_review');
  return result;
}

export function planMoonpetV1BetaRehearsal(db) {
  const inventory = inspectMoonpetBetaReset(db);
  const names = inventory.moonpet_tables.map(row => row.table);
  const unknown = names.filter(name => !allowed.has(name));
  if (unknown.length) throw Error('unreviewed_moonpet_tables: ' + unknown.join(','));
  for (const name of ['telegram_pet_profiles','telegram_pet_instances','telegram_pet_season_slots'])
    if (!names.includes(name)) throw Error('moonpet_core_table_missing: ' + name);
  const outside = inventory.moonpet_tables.flatMap(row => row.inbound_non_moonpet_references
    .map(ref => ref.table + '->' + row.table));
  if (outside.length) throw Error('external_fk_moonpet_dependency: ' + outside.join(','));
  if (inventory.possible_external_pet_sources.length)
    throw Error('external_pet_id_dependency: ' +
      inventory.possible_external_pet_sources.map(row => row.table).join(','));
  const deleteTriggers = db.prepare("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='trigger'").all()
    .filter(row => names.includes(row.tbl_name) &&
      /\b(?:BEFORE|AFTER|INSTEAD\s+OF)\s+DELETE\b/iu.test(row.sql || ''));
  if (deleteTriggers.length)
    throw Error('moonpet_delete_trigger_requires_review: ' + deleteTriggers.map(row => row.name).join(','));
  if (db.prepare('PRAGMA foreign_key_check').all().length)
    throw Error('source_foreign_key_check_failed');
  return Object.freeze({
    mode: 'OFFLINE_REHEARSAL_PLAN',
    ready_for_live_reset: false,
    source_table_count: names.length,
    source_row_count: inventory.moonpet_row_count,
    delete_order: childrenBeforeParents(names, inventory),
    shared_table_count: tableNames(db).length - names.length,
  });
}

export function rehearseMoonpetV1BetaReset(source, output) {
  // StatementSync.iterate() requires at least Node 22.13.0.
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 13) throw Error('node_22_13_or_newer_required');
  const input = canonicalFilePath(source), target = canonicalFilePath(output);
  if (input === target) throw Error('in_place_reset_forbidden');
  if (sidecars(input).includes(target) || sidecars(target).includes(input))
    throw Error('source_or_journal_target_overlap_forbidden');
  const sourceInfo = lstatSync(input, { throwIfNoEntry: false });
  if (!sourceInfo || sourceInfo.isSymbolicLink() || !sourceInfo.isFile())
    throw Error('source_must_be_regular_offline_sqlite_backup');
  if (occupied(target)) throw Error('existing_output_forbidden');
  const existingSidecars = sidecars(target).filter(occupied);
  if (existingSidecars.length)
    throw Error('existing_output_sidecars_forbidden: ' + existingSidecars.map(path => path.slice(target.length)).join(','));
  if (sidecars(input).some(occupied))
    throw Error('source_has_sqlite_wal_sidecars_use_a_closed_backup');

  // Even readOnly SQLite can create WAL/SHM metadata when opening a WAL-mode
  // file. Never open the original backup: preflight only an isolated copy.
  const scratch = mkdtempSync(join(tmpdir(), 'moonpet-v1-preflight-'));
  let plan, before;
  try {
    const preflight = join(scratch, 'backup.sqlite');
    copyFileSync(input, preflight, constants.COPYFILE_EXCL);
    const original = new DatabaseSync(preflight, { readOnly: true });
    try {
      original.exec('PRAGMA query_only=ON');
      plan = planMoonpetV1BetaRehearsal(original);
      before = sharedTableDigests(original, new Set(plan.delete_order));
    } finally { original.close(); }
  } finally { rmSync(scratch, { recursive: true, force: true }); }

  // A concurrent process might have claimed the destination during preflight.
  // COPYFILE_EXCL refuses it rather than replacing the file.
  if (occupied(target) || sidecars(target).some(occupied))
    throw Error('existing_output_or_sidecars_forbidden');
  copyFileSync(input, target, constants.COPYFILE_EXCL);
  let clone;
  try {
    clone = new DatabaseSync(target);
    clone.exec('PRAGMA foreign_keys=ON');
    if (Number(clone.prepare('PRAGMA foreign_keys').get().foreign_keys) !== 1)
      throw Error('foreign_keys_not_enabled');
    clone.exec('BEGIN IMMEDIATE');
    try {
      for (const name of plan.delete_order) clone.exec('DELETE FROM ' + quote(name));
      const remain = plan.delete_order.filter(name =>
        Number(clone.prepare('SELECT COUNT(*) AS n FROM ' + quote(name)).get().n) !== 0);
      if (remain.length) throw Error('moonpet_tables_not_empty: ' + remain.join(','));
      if (clone.prepare('PRAGMA foreign_key_check').all().length)
        throw Error('rehearsal_foreign_key_check_failed');
      const after = sharedTableDigests(clone, new Set(plan.delete_order));
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw Error('non_moonpet_table_changed');
      clone.exec('COMMIT');
    } catch (error) {
      // SQLite RAISE(ROLLBACK) may already have ended the transaction. Do not
      // replace its original error with 'no transaction is active'.
      try { clone.exec('ROLLBACK'); } catch { /* Already rolled back. */ }
      throw error;
    }
    return {
      mode: 'LOCAL_OFFLINE_REHEARSAL_COMPLETED',
      ready_for_live_reset: false,
      source_unchanged: true,
      output_path: target,
      moonpet_tables_cleared: plan.source_table_count,
      moonpet_rows_removed: plan.source_row_count,
      non_moonpet_tables_verified_unchanged: before.length,
      foreign_keys_enforced: true,
    };
  } catch (error) {
    if (clone) { clone.close(); clone = null; }
    rmSync(target, { force: true });
    for (const sidecar of sidecars(target)) rmSync(sidecar, { force: true });
    throw error;
  } finally { if (clone) clone.close(); }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 5 || args[0] !== '--source' || args[2] !== '--output' ||
      args[4] !== '--rehearse' || !args[1] || !args[3])
    throw Error('Usage (offline only): node scripts/moonpet-v1-beta-rehearsal.mjs --source BACKUP.sqlite --output NEW.sqlite --rehearse');
  process.stdout.write(JSON.stringify(rehearseMoonpetV1BetaReset(args[1], args[3]), null, 2) + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

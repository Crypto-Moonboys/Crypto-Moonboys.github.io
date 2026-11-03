#!/usr/bin/env node
// Read-only acceptance check for the owner-restored D1 SQL dump and migration 105 rehearsal.
// This file never invokes Wrangler, Cloudflare, D1 migrations or a WAX signer.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED_INDEX = 'idx_telegram_pet_season_slots_pet_owner_tuple';
const OWNER_COLUMNS = ['pet_id', 'telegram_id', 'season_key', 'slot_number'];
const PAYOUT_TABLES = ['tag_run_v2_payout_caps', 'tag_run_v2_payout_intents'];
// Build the reference catalogue by executing the checked-in migration, not by
// trusting expected names or counting triggers in the rehearsal database.
const PAYOUT_MIGRATION_URL = new URL('../workers/moonboys-api/migrations/105_tag_run_v2_payout_execution.sql', import.meta.url);

function belongsToPayoutTable(row) {
  return PAYOUT_TABLES.includes(row.tbl_name);
}

function expectedPayoutSchema() {
  const reference = new DatabaseSync(':memory:');
  try {
    reference.exec(readFileSync(PAYOUT_MIGRATION_URL, 'utf8'));
    const objects = readSchema(reference).filter(belongsToPayoutTable);
    assert(objects.filter(row => row.type === 'table').length === 2
      && objects.filter(row => row.type === 'index').length === 1
      && objects.filter(row => row.type === 'trigger').length === 7,
    'checked-in migration 105 has an unexpected payout schema; review the migration');
    return objects;
  } finally { reference.close(); }
}

function assert(condition, message) {
  if (!condition) throw Error(message);
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function selectTables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(row => row.name);
}

function readSchema(db) {
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name,tbl_name")
    .all();
}

function validatePetForeignKey(db, label) {
  const index = db.prepare("PRAGMA index_list('telegram_pet_season_slots')").all()
    .find(row => row.name === EXPECTED_INDEX);
  assert(index && Number(index.unique) === 1 && Number(index.partial) === 0,
    `${label}: required full MoonPet owner-tuple unique index missing`);
  const cols = db.prepare(`PRAGMA index_info(${quoteIdentifier(EXPECTED_INDEX)})`).all()
    .sort((a, b) => a.seqno - b.seqno).map(row => row.name);
  assert(JSON.stringify(cols) === JSON.stringify(OWNER_COLUMNS),
    `${label}: MoonPet owner-tuple unique index columns/order are wrong`);
  const allFks = db.prepare("PRAGMA foreign_key_list('telegram_pet_instances')").all();
  const group = allFks.filter(row => row.table === 'telegram_pet_season_slots');
  assert(group.length === 4 && group.every(row => row.id === group[0].id),
    `${label}: MoonPet instances have no four-column owner foreign key`);
  group.sort((a, b) => a.seq - b.seq);
  assert(JSON.stringify(group.map(row => row.from)) === JSON.stringify(OWNER_COLUMNS)
    && JSON.stringify(group.map(row => row.to)) === JSON.stringify(OWNER_COLUMNS),
    `${label}: MoonPet instances owner foreign-key columns/order changed`);
}

function verifyDatabase(db, label) {
  const integrity = db.prepare('PRAGMA integrity_check').all();
  assert(integrity.length === 1 && integrity[0].integrity_check === 'ok',
    `${label}: SQLite integrity_check failed`);
  validatePetForeignKey(db, label);
  let fkViolations;
  try { fkViolations = db.prepare('PRAGMA foreign_key_check').all(); }
  catch (error) { throw Error(`${label}: foreign_key_check failed: ${error.message}`); }
  assert(fkViolations.length === 0, `${label}: foreign_key_check found ${fkViolations.length} violations`);
}

function rowDigest(db, table) {
  const hashes = [];
  const sql = `SELECT * FROM ${quoteIdentifier(table)}`;
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  for (const row of statement.iterate()) {
    const serialized = JSON.stringify(row, (_key, value) =>
      typeof value === 'bigint' ? { __bigint: String(value) } : value);
    hashes.push(createHash('sha256').update(serialized).digest('hex'));
  }
  // Hash the entire multiset, not SQLite's unspecified SELECT row order.
  hashes.sort();
  const hash = createHash('sha256');
  for (const value of hashes) hash.update(value + '\n');
  return { count: hashes.length, digest: hash.digest('hex') };
}

export function verifyMigration105(beforePath, afterPath) {
  const beforeFile = resolve(beforePath);
  const afterFile = resolve(afterPath);
  assert(beforeFile !== afterFile, 'before/after must be different database files');
  assert(existsSync(beforeFile) && existsSync(afterFile), 'both existing local database files are required');
  const before = new DatabaseSync(beforeFile, { readOnly: true });
  let after;
  try {
    after = new DatabaseSync(afterFile, { readOnly: true });
    before.exec('PRAGMA query_only=ON');
    after.exec('PRAGMA query_only=ON');
    verifyDatabase(before, 'before');
    verifyDatabase(after, 'after');

    const beforeTables = selectTables(before);
    const afterTables = selectTables(after);
    const added = afterTables.filter(name => !beforeTables.includes(name));
    const removed = beforeTables.filter(name => !afterTables.includes(name));
    assert(removed.length === 0, `original tables missing: ${removed.join(', ')}`);
    assert(JSON.stringify(added) === JSON.stringify([...PAYOUT_TABLES].sort()),
      `unexpected new tables: ${added.join(', ')}`);
    const beforeObjects = readSchema(before);
    const afterObjects = readSchema(after);
    // Only exclude schema objects *owned by* the two newly created payout
    // tables. A payout-prefixed index on an existing wallet table is NOT exempt.
    const unchangedObjects = afterObjects.filter(row => !belongsToPayoutTable(row));
    assert(JSON.stringify(beforeObjects) === JSON.stringify(unchangedObjects),
      'original schema objects (tables, views, indexes or triggers) changed');

    let rows = 0;
    for (const table of beforeTables) {
      const a = rowDigest(before, table);
      const b = rowDigest(after, table);
      assert(a.count === b.count && a.digest === b.digest, `original table data changed: ${table}`);
      rows += a.count;
    }
    for (const table of PAYOUT_TABLES) {
      assert(Number(after.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(table)}`).get().n) === 0,
        `payout table is not empty: ${table}`);
    }
    const actualPayoutObjects = afterObjects.filter(belongsToPayoutTable);
    const approvedPayoutObjects = expectedPayoutSchema();
    assert(JSON.stringify(actualPayoutObjects) === JSON.stringify(approvedPayoutObjects),
      'payout schema differs from checked-in migration 105 (tables, index or guard triggers)');
    return { originalTables: beforeTables.length, originalRows: rows,
      addedTables: added, newPayoutRows: 0, payoutTriggers: 7,
      originalSchemaUnchanged: true, foreignKeyViolations: 0, integrity: 'ok' };
  } finally {
    after?.close();
    before.close();
  }
}

function runCli(argv) {
  // Fixed filenames are the ones created by the approved, existing owner rehearsal.
  const args = { before: 'tag-run-pre-migration-105-restore-v2.db', after: 'tag-run-migration-105-rehearsal.db' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--before', '--after'].includes(key) || !argv[i + 1])
      throw Error('Usage: node scripts/tag-run-105-offline-preflight.mjs [--before backup.db --after rehearsal.db]');
    args[key.slice(2)] = argv[i + 1];
  }
  const result = verifyMigration105(args.before, args.after);
  console.log(JSON.stringify({ status: 'PASS (OFFLINE ONLY)', ...result }, null, 2));
  console.log('NO production migration or token payout was attempted.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { runCli(process.argv.slice(2)); }
  catch (error) { console.error(`MIGRATION 105 OFFLINE PREFLIGHT FAILED: ${error.message}`); process.exitCode = 1; }
}
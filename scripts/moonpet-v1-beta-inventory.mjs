#!/usr/bin/env node
// MoonPet V1 private beta: read-only inventory of a LOCAL SQLite D1 backup.
// This module has no delete, drop, reset or mutation mode.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isPet = name => /^telegram_pet(?:_|s$)/u.test(name) || /^moonpet_/u.test(name);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const sharedPrefixes = ['arcade_', 'blocktopia_', 'championship_', 'telegram_website_', 'telegram_faction_', 'telegram_xp_', 'wiki_'];
const sharedNames = new Set(['telegram_users', 'telegram_factions', 'telegram_seasons']);

export function inspectMoonpetBetaReset(db) {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(row => row.name);
  const columns = new Map(names.map(name => [name,
    db.prepare('PRAGMA table_info(' + quote(name) + ')').all().map(col => col.name)]));
  // SQLite emits one row per column, not per foreign-key constraint.
  // Group by constraint id within its source table so composite references
  // remain intact and reset reviewers can inspect deletion order correctly.
  const foreignKeys = new Map(names.map(name => {
    const groups = new Map();
    for (const fk of db.prepare('PRAGMA foreign_key_list(' + quote(name) + ')').all()) {
      const id = Number(fk.id);
      if (!groups.has(id)) groups.set(id, {
        constraint_id: id, source_table: name, target_table: fk.table,
        on_update: fk.on_update, on_delete: fk.on_delete, match: fk.match, columns: [],
      });
      groups.get(id).columns.push({ seq: Number(fk.seq), from: fk.from, to: fk.to });
    }
    return [name, [...groups.values()].map(ref => ({
      ...ref, columns: ref.columns.sort((a, b) => a.seq - b.seq),
    }))];
  }));
  const pets = names.filter(isPet), petNames = new Set(pets);
  const triggers = db.prepare("SELECT tbl_name,name FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
  const moonpetTables = pets.map(name => ({
    table: name,
    rows: Number(db.prepare('SELECT COUNT(*) AS n FROM ' + quote(name)).get().n),
    has_owner_column: columns.get(name).includes('telegram_id'),
    has_pet_id_column: columns.get(name).includes('pet_id'),
    // Preserve every edge (including MoonPet-to-MoonPet edges). These arrays
    // retain grouped composite column mappings; category summaries below are
    // kept for consumers of the initial inventory format.
    outbound_foreign_keys: foreignKeys.get(name),
    inbound_foreign_keys: names.flatMap(source =>
      foreignKeys.get(source).filter(ref => ref.target_table === name)),
    shared_parent_references: foreignKeys.get(name)
      .filter(ref => !petNames.has(ref.target_table))
      .map(ref => ({table: ref.target_table, on_delete: ref.on_delete})),
    inbound_non_moonpet_references: names.filter(source => !petNames.has(source))
      .flatMap(source => foreignKeys.get(source).filter(ref => ref.target_table === name)
        .map(ref => ({table: source, on_delete: ref.on_delete}))),
    triggers: triggers.filter(t => t.tbl_name === name).map(t => t.name),
  }));
  return {
    schema_version: 1,
    purpose: 'moonpet_v1_beta_reset_discovery',
    mode: 'READ_ONLY_INVENTORY',
    writes_performed: 0,
    ready_for_reset: false,
    moonpet_table_count: moonpetTables.length,
    moonpet_row_count: moonpetTables.reduce((sum, table) => sum + table.rows, 0),
    moonpet_tables: moonpetTables,
    possible_external_pet_sources: names.filter(name => !petNames.has(name)
      && columns.get(name).includes('pet_id'))
      .map(name => ({table: name, has_owner_column: columns.get(name).includes('telegram_id')})),
    protected_shared_tables: names.filter(name => !petNames.has(name)
      && (sharedNames.has(name) || sharedPrefixes.some(prefix => name.startsWith(prefix)))),
    review_required: [
      'Approve an exact MoonPet reset allowlist from this real schema and external sources',
      'Inspect inbound references, triggers and reward ownership before choosing a deletion order',
      'Back up and rehearse on disposable SQLite with foreign keys enabled',
      'Preserve Telegram identity, global Arcade XP, website and other game data',
      'Only a separately approved PR may implement or execute destructive reset logic',
    ],
  };
}

function cli() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--db' || !args[1])
    throw Error('Read-only usage: node scripts/moonpet-v1-beta-inventory.mjs --db LOCAL_SQLITE_BACKUP');
  const file = resolve(args[1]);
  if (!existsSync(file) || !statSync(file).isFile())
    throw Error('An existing local SQLite backup file is required');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON');
    process.stdout.write(JSON.stringify(inspectMoonpetBetaReset(db), null, 2) + '\n');
  } finally { db.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { cli(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

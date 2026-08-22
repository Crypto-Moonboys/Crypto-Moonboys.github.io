import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { MOONPET_LIVE_SYSTEM_OWNERSHIP_CLASSIFICATION } from '../workers/moonboys-api/pets/live-system-ownership-classification.js';

export const IDENTITY_AUTHORITY_TABLES = [
  'telegram_pet_memories',
  'telegram_pet_personality_traits',
  'telegram_pet_boss_victories',
  'telegram_pet_identity_events',
  'telegram_pet_identity_analytics',
  'telegram_pet_achievements',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const workerRoot = path.join(repoRoot, 'workers', 'moonboys-api');
const migrationsRoot = path.join(workerRoot, 'migrations');
const PET_OWNED_TABLES = new Set([
  'telegram_pet_memories',
  'telegram_pet_personality_traits',
  'telegram_pet_boss_victories',
  'telegram_pet_identity_events',
  'telegram_pet_identity_analytics',
  'telegram_pet_achievements',
  'telegram_pet_specialist_progression',
  'telegram_pet_specialist_events',
  'telegram_pet_daily_journey_objectives',
  'telegram_pet_daily_journey_receipts',
  'telegram_pet_growth_marks',
  'telegram_pet_weekly_journey_objectives',
  'telegram_pet_weekly_journey_receipts',
  'telegram_pet_weekly_crests',
  'telegram_pet_daily_runs',
  'telegram_pet_runs',
  'telegram_pet_run_analytics',
  'telegram_pet_live_progression_state',
  'telegram_pet_weekly_boss_progress',
]);
const ACCOUNT_OWNED_TABLES = new Set([
  'telegram_pet_profiles',
  'telegram_pet_material_balances',
  'telegram_pet_inventory',
  'telegram_pet_cosmetic_unlocks',
  'telegram_pet_equipment_progression',
  'telegram_pet_equipment_events',
]);
const OWNERSHIP_AUDIT_TUPLE_TABLE_SPECS = [
  { table: 'telegram_pet_specialist_progression', seasonColumn: 'season_key' },
  { table: 'telegram_pet_specialist_events', seasonColumn: 'season_key' },
  { table: 'telegram_pet_daily_journey_objectives', seasonColumn: 'season_key' },
  { table: 'telegram_pet_daily_journey_receipts', seasonColumn: 'season_key' },
  { table: 'telegram_pet_growth_marks', seasonColumn: 'season_key' },
  { table: 'telegram_pet_weekly_journey_objectives', seasonColumn: 'season_key' },
  { table: 'telegram_pet_weekly_journey_receipts', seasonColumn: 'season_key' },
  { table: 'telegram_pet_weekly_crests', seasonColumn: 'season_key' },
  { table: 'telegram_pet_daily_runs', seasonColumn: 'season_key' },
  { table: 'telegram_pet_runs', seasonColumn: 'season_key' },
  { table: 'telegram_pet_run_analytics', seasonColumn: 'season_key' },
  { table: 'telegram_pet_live_progression_state', seasonColumn: 'season_key' },
  {
    table: 'telegram_pet_system_events',
    seasonColumn: 'season_key',
    petOwnedRowFilter: "t.system_key IN ('district', 'event_chain', 'seasonal_boss')",
  },
  { table: 'telegram_pet_event_chain_progress', seasonColumn: 'season_key' },
  { table: 'telegram_pet_weekly_boss_progress', seasonColumn: 'season_key' },
  { table: 'telegram_pet_seasonal_boss_progress', seasonColumn: 'pet_season_key' },
];

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function walkJavaScriptFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

function hasColumnReference(sql, column) {
  return new RegExp(`\\b${column}\\b`, 'i').test(sql);
}

function hasBoundAuthorityPredicate(sql, column) {
  return new RegExp(`(?:\\b[a-z_][a-z0-9_]*\\s*\\.\\s*)?\\b${column}\\s*=\\s*\\?`, 'i').test(sql);
}

function stripSqlStringLiterals(sql) {
  return String(sql || '').replace(/'([^']|'')*'/g, "''").replace(/"([^"]|"")*"/g, '""');
}

function flattenSql(sql) {
  const text = stripSqlStringLiterals(sql);
  let result = '';
  let depth = 0;
  const selectDepths = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '(') {
      depth += 1;
      const inner = text.slice(i + 1).trimStart();
      if (/^SELECT\b/i.test(inner)) {
        selectDepths.push(depth);
        if (selectDepths.length === 1) result += '(';
      } else if (selectDepths.length === 0) {
        result += '(';
      }
    } else if (char === ')') {
      if (selectDepths.length > 0 && selectDepths[selectDepths.length - 1] === depth) {
        selectDepths.pop();
        if (selectDepths.length === 0) result += ')';
      } else if (selectDepths.length === 0) {
        result += ')';
      }
      if (depth > 0) depth -= 1;
    } else if (selectDepths.length === 0) {
      result += char;
    }
  }
  return result;
}

function hasTopLevelOr(sql) {
  const text = stripSqlStringLiterals(sql);
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')' && depth > 0) depth -= 1;
    else if (depth === 0 && /\s/i.test(text[index - 1] || ' ') && /^OR\b/i.test(text.slice(index))) return true;
  }
  return false;
}

function hasCompleteAuthorityWhereClause(whereClause) {
  if (hasTopLevelOr(whereClause)) return false;
  const columns = ['pet_id', 'telegram_id', 'season_key'];
  const normalized = stripSqlStringLiterals(whereClause);
  return columns.every((column) => hasBoundAuthorityPredicate(normalized, column));
}

function hasAnyBoundAuthorityPredicate(whereClause) {
  return ['pet_id', 'telegram_id', 'season_key'].some((column) => hasBoundAuthorityPredicate(whereClause, column));
}

function extractPreparedSql(source) {
  return [...String(source || '').matchAll(/db\.prepare\(\s*([`'"])([\s\S]*?)\1/g)]
    .map((match) => match[2]);
}

export function auditRuntimeIdentityQueries({ root = workerRoot } = {}) {
  const violations = [];
  for (const file of walkJavaScriptFiles(root)) {
    const source = fs.readFileSync(file, 'utf8');
    const sqlStatements = extractPreparedSql(source);
    const relative = path.relative(repoRoot, file).replaceAll(path.sep, '/');
    for (const table of IDENTITY_AUTHORITY_TABLES) {
      const statementPattern = new RegExp(`(?:FROM|UPDATE|DELETE\\s+FROM)\\s+${table}\\b[\\s\\S]{0,900}?WHERE\\s+([\\s\\S]{0,500}?)(?:;|\\n\\s*\\)|ORDER\\s+BY|GROUP\\s+BY|LIMIT\\s+|$)`, 'gi');
      for (const sql of sqlStatements) for (const match of flattenSql(sql).matchAll(statementPattern)) {
        const statement = match[0];
        const whereClause = match[1] || '';
        if (hasAnyBoundAuthorityPredicate(whereClause) && !hasCompleteAuthorityWhereClause(whereClause)) {
          violations.push({
            type: 'runtime_identity_query_missing_pet_authority',
            file: relative,
            table,
            excerpt: statement.replace(/\s+/g, ' ').slice(0, 220),
          });
        }
      }
      const insertPattern = new RegExp(`INSERT\\s+(?:OR\\s+IGNORE\\s+)?INTO\\s+${table}\\s*\\(([^)]*)\\)`, 'gi');
      for (const sql of sqlStatements) for (const match of sql.matchAll(insertPattern)) {
        const columns = match[1];
        for (const required of ['pet_id', 'telegram_id', 'season_key']) {
          if (!hasColumnReference(columns, required)) {
            violations.push({
              type: 'runtime_identity_insert_missing_pet_authority',
              file: relative,
              table,
              excerpt: match[0].replace(/\s+/g, ' ').slice(0, 220),
            });
            break;
          }
        }
      }
    }
  }
  return violations;
}

function identityAuthorityViolationSql() {
  const rowKeys = {
    telegram_pet_memories: 'r.pet_id',
    telegram_pet_personality_traits: "r.pet_id || ':' || r.trait_id",
    telegram_pet_boss_victories: "r.pet_id || ':' || r.boss_id",
    telegram_pet_identity_events: 'r.event_id',
    telegram_pet_identity_analytics: 'r.analytics_id',
    telegram_pet_achievements: "r.pet_id || ':' || r.achievement_id",
  };
  return IDENTITY_AUTHORITY_TABLES.map((table) => `
    SELECT '${table}' AS table_name,
           r.pet_id,
           r.telegram_id,
           r.season_key,
           ${rowKeys[table]} AS row_key,
           CASE
             WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
             WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
             WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
             WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
             WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
             WHEN s.slot_number <> i.slot_number THEN 'authority_tuple_mismatch'
             ELSE 'invalid_relationship'
           END AS reason
    FROM ${table} r
    LEFT JOIN telegram_pet_season_slots s
      ON s.pet_id = r.pet_id
     AND s.telegram_id = r.telegram_id
     AND s.season_key = r.season_key
    LEFT JOIN telegram_pet_instances i
      ON i.pet_id = r.pet_id
     AND i.telegram_id = r.telegram_id
     AND i.season_key = r.season_key
    WHERE r.pet_id IS NULL
       OR r.pet_id = ''
       OR r.telegram_id IS NULL
       OR r.telegram_id = ''
       OR r.season_key IS NULL
       OR r.season_key = ''
       OR s.pet_id IS NULL
       OR i.pet_id IS NULL
       OR s.slot_number <> i.slot_number
  `).join('\nUNION ALL\n');
}

function comparableViolation(row) {
  return {
    table_name: String(row.table_name || ''),
    pet_id: row.pet_id == null ? null : String(row.pet_id),
    telegram_id: row.telegram_id == null ? null : String(row.telegram_id),
    season_key: row.season_key == null ? null : String(row.season_key),
    row_key: row.row_key == null ? null : String(row.row_key),
    reason: String(row.reason || ''),
  };
}

function compareViolationRows(expectedRows, viewRows) {
  const expected = expectedRows.map(comparableViolation)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const actual = viewRows.map(comparableViolation)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  return [{
    table_name: 'moonpet_invalid_identity_authority_rows',
    row_key: 'verification_view',
    reason: 'view_rows_mismatch',
    expected_rows: expected,
    actual_rows: actual,
  }];
}

function hasTable(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

function hasColumns(db, table, columns) {
  const defined = new Set(
    db.prepare(`PRAGMA table_info(${table})`).all()
      .map((row) => String(row?.name || '').toLowerCase()),
  );
  return columns.every((column) => defined.has(String(column).toLowerCase()));
}

function normalizeOwnershipClassificationViolations(db) {
  const violations = [];
  const classifiedPetOwnedTables = new Set();
  const classifiedAccountOwnedTables = new Set();
  const explicitlyMixedEventOwnedTables = new Set();
  const addMixedEventOwnedTable = (table) => {
    if (!PET_OWNED_TABLES.has(table) && !ACCOUNT_OWNED_TABLES.has(table) && /^telegram_pet_/i.test(table)) {
      explicitlyMixedEventOwnedTables.add(table);
    }
  };
  for (const row of MOONPET_LIVE_SYSTEM_OWNERSHIP_CLASSIFICATION) {
    for (const table of row.write_tables) addMixedEventOwnedTable(table);
    for (const table of row.read_tables) addMixedEventOwnedTable(table);
    if (row.authority_owner === 'pet' || row.authority_owner === 'mixed') {
      for (const table of row.write_tables) {
        if (PET_OWNED_TABLES.has(table)) classifiedPetOwnedTables.add(table);
      }
    }
    if (row.authority_owner === 'account' || row.authority_owner === 'mixed') {
      for (const table of row.write_tables) {
        if (ACCOUNT_OWNED_TABLES.has(table)) classifiedAccountOwnedTables.add(table);
      }
    }
    if (row.authority_owner === 'account') {
      const petWrites = row.write_tables.filter((table) => PET_OWNED_TABLES.has(table));
      if (petWrites.length) {
        violations.push({
          table_name: 'moonpet_live_system_ownership_classification',
          row_key: row.system_key,
          reason: 'account_system_writes_pet_owned_table',
          offending_tables: petWrites,
        });
      }
    }
    if (row.authority_owner === 'pet') {
      const accountWrites = row.write_tables.filter((table) => ACCOUNT_OWNED_TABLES.has(table));
      if (accountWrites.length) {
        violations.push({
          table_name: 'moonpet_live_system_ownership_classification',
          row_key: row.system_key,
          reason: 'pet_system_writes_account_owned_table',
          offending_tables: accountWrites,
        });
      }
    }
  }
  for (const table of PET_OWNED_TABLES) {
    if (!classifiedPetOwnedTables.has(table)) {
      violations.push({
        table_name: 'moonpet_live_system_ownership_classification',
        row_key: table,
        reason: 'pet_owned_table_missing_classification',
      });
    }
  }
  for (const table of ACCOUNT_OWNED_TABLES) {
    if (!classifiedAccountOwnedTables.has(table)) {
      violations.push({
        table_name: 'moonpet_live_system_ownership_classification',
        row_key: table,
        reason: 'account_owned_table_missing_classification',
      });
    }
  }
  if (db) {
    const moonpetTables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name LIKE 'telegram_pet_%'
      ORDER BY name
    `).all().map((row) => String(row.name || ''));
    for (const table of moonpetTables) {
      const classes = [];
      if (PET_OWNED_TABLES.has(table)) classes.push('pet-owned');
      if (ACCOUNT_OWNED_TABLES.has(table)) classes.push('account-owned');
      if (explicitlyMixedEventOwnedTables.has(table)) classes.push('mixed/event-owned');
      if (classes.length === 0) {
        violations.push({
          table_name: 'moonpet_live_system_ownership_classification',
          row_key: table,
          reason: 'ownership_classification_missing',
        });
      } else if (classes.length > 1) {
        violations.push({
          table_name: 'moonpet_live_system_ownership_classification',
          row_key: table,
          reason: 'ownership_classification_ambiguous',
          ownership_classes: classes,
        });
      }
    }
  }
  return violations;
}

function auditStaleAuthorityLinks(db) {
  const violations = [];
  if (hasTable(db, 'telegram_pet_active_slots') && hasTable(db, 'telegram_pet_season_slots') && hasTable(db, 'telegram_pet_instances')) {
    const staleActiveRows = db.prepare(`
      SELECT a.telegram_id, a.pet_id, a.season_key
      FROM telegram_pet_active_slots a
      LEFT JOIN telegram_pet_season_slots s
        ON s.pet_id = a.pet_id
       AND s.telegram_id = a.telegram_id
       AND s.season_key = a.season_key
      LEFT JOIN telegram_pet_instances i
        ON i.pet_id = a.pet_id
       AND i.telegram_id = a.telegram_id
       AND i.season_key = a.season_key
      WHERE s.pet_id IS NULL
         OR i.pet_id IS NULL
      ORDER BY a.telegram_id, a.pet_id, a.season_key
    `).all();
    for (const row of staleActiveRows) {
      violations.push({
        table_name: 'telegram_pet_active_slots',
        pet_id: row.pet_id,
        telegram_id: row.telegram_id,
        season_key: row.season_key,
        row_key: `${row.telegram_id}:${row.pet_id}:${row.season_key}`,
        reason: 'stale_active_slot_authority_link',
      });
    }
  }
  for (const { table, seasonColumn, petOwnedRowFilter = '1=1' } of OWNERSHIP_AUDIT_TUPLE_TABLE_SPECS) {
    if (!hasTable(db, table)) continue;
    if (!hasColumns(db, table, ['pet_id', 'telegram_id', seasonColumn])) continue;
    const invalidRows = db.prepare(`
      SELECT t.pet_id, t.telegram_id, t.${seasonColumn} AS season_key
      FROM ${table} t
      LEFT JOIN telegram_pet_season_slots s
        ON s.pet_id = t.pet_id
       AND s.telegram_id = t.telegram_id
       AND s.season_key = t.${seasonColumn}
      LEFT JOIN telegram_pet_instances i
        ON i.pet_id = t.pet_id
       AND i.telegram_id = t.telegram_id
       AND i.season_key = t.${seasonColumn}
      WHERE (${petOwnedRowFilter})
        AND (
          t.pet_id IS NULL
          OR t.pet_id = ''
          OR t.telegram_id IS NULL
          OR t.telegram_id = ''
          OR t.${seasonColumn} IS NULL
          OR t.${seasonColumn} = ''
          OR s.pet_id IS NULL
          OR i.pet_id IS NULL
        )
      ORDER BY t.telegram_id, t.pet_id
      LIMIT 200
    `).all();
    for (const row of invalidRows) {
      let reason = 'invalid_pet_authority_reference';
      if (row.pet_id == null || row.pet_id === '') reason = 'pet_id_missing';
      else if (row.season_key == null || row.season_key === '') reason = 'season_key_missing';
      else if (row.telegram_id == null || row.telegram_id === '') reason = 'telegram_id_missing';
      violations.push({
        table_name: table,
        pet_id: row.pet_id,
        telegram_id: row.telegram_id,
        season_key: row.season_key,
        row_key: `${row.pet_id}:${row.telegram_id}:${row.season_key}`,
        reason,
      });
    }
  }
  return violations;
}

export function auditMoonpetOwnershipBoundariesDb(db) {
  return [
    ...auditStaleAuthorityLinks(db),
    ...normalizeOwnershipClassificationViolations(db),
  ];
}

export function auditIdentityAuthorityDb(db) {
  const tableCounts = Object.fromEntries(IDENTITY_AUTHORITY_TABLES.map((table) => [
    table,
    Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0),
  ]));
  const checkedRows = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
  const violations = db.prepare(identityAuthorityViolationSql()).all();
  const viewRows = db.prepare(`SELECT table_name, pet_id, telegram_id, season_key, row_key, reason
    FROM moonpet_invalid_identity_authority_rows`).all();
  violations.push(...compareViolationRows(violations, viewRows));
  violations.push(...auditMoonpetOwnershipBoundariesDb(db));
  return { checkedRows, tableCounts, violations };
}

function createProductionSchemaBeforeAuthorityChain() {
  return `
    PRAGMA foreign_keys = ON;
    CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1);
    CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY, pet_xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1);
    CREATE TABLE telegram_pet_season_slots (
      pet_id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      season_key TEXT NOT NULL,
      slot_number INTEGER NOT NULL,
      acquisition_type TEXT NOT NULL DEFAULT 'free',
      source_event_key TEXT,
      arcade_xp_spent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      UNIQUE (pet_id, telegram_id, season_key),
      UNIQUE (pet_id, telegram_id, season_key, slot_number)
    );
    CREATE TABLE telegram_pet_instances (
      pet_id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      season_key TEXT NOT NULL,
      slot_number INTEGER NOT NULL,
      pet_name TEXT DEFAULT 'Moonpet',
      status TEXT NOT NULL DEFAULT 'active',
      source_profile_updated_at TEXT
    );
    CREATE TABLE telegram_pet_arena_queue (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      telegram_id TEXT NOT NULL,
      rank_bucket TEXT NOT NULL,
      pet_snapshot_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'waiting',
      accept_any_rank INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE telegram_pet_arena_battles (
      id TEXT PRIMARY KEY,
      battle_id TEXT NOT NULL UNIQUE,
      chat_id TEXT NOT NULL,
      player1_telegram_id TEXT NOT NULL,
      player2_telegram_id TEXT,
      player1_pet_snapshot_json TEXT NOT NULL DEFAULT '{}',
      player2_pet_snapshot_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'readying'
    );
    CREATE TABLE telegram_pet_personality_traits (telegram_id TEXT NOT NULL, trait_id TEXT NOT NULL, progress INTEGER DEFAULT 0, unlocked_at TEXT, updated_at TEXT, PRIMARY KEY(telegram_id, trait_id));
    CREATE TABLE telegram_pet_memories (telegram_id TEXT PRIMARY KEY, first_adoption_at TEXT, first_run_at TEXT, first_extraction_at TEXT, first_boss_victory_at TEXT, first_boss_id TEXT, biggest_reward_amount INTEGER DEFAULT 0, biggest_reward_currency TEXT, favourite_activity TEXT, total_runs INTEGER DEFAULT 0, total_bosses_defeated INTEGER DEFAULT 0, milestones TEXT DEFAULT '[]', combat_actions INTEGER DEFAULT 0, exploration_actions INTEGER DEFAULT 0, care_actions INTEGER DEFAULT 0, event_actions INTEGER DEFAULT 0, adventure_actions INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
    CREATE TABLE telegram_pet_boss_victories (telegram_id TEXT NOT NULL, boss_id TEXT NOT NULL, victories INTEGER DEFAULT 0, updated_at TEXT, PRIMARY KEY(telegram_id, boss_id));
    CREATE TABLE telegram_pet_identity_events (event_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, event_key TEXT NOT NULL, event_kind TEXT NOT NULL, payload TEXT DEFAULT '{}', day_key TEXT DEFAULT '2026-08-01', progress_delta INTEGER DEFAULT 0, created_at TEXT, applied_at TEXT, UNIQUE(telegram_id,event_key,event_kind));
    CREATE TABLE telegram_pet_identity_analytics (analytics_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, event_type TEXT NOT NULL, evolution_id TEXT, trait_id TEXT, milestone_id TEXT, duration_seconds INTEGER, event_data TEXT DEFAULT '{}', created_at TEXT);
    CREATE TABLE telegram_pet_achievements (telegram_id TEXT NOT NULL, achievement_id TEXT NOT NULL, progress INTEGER DEFAULT 0, target INTEGER, unlocked_at TEXT, updated_at TEXT, PRIMARY KEY(telegram_id,achievement_id));
    CREATE TABLE telegram_pet_specialist_progression (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_specialist_events (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_journey_objectives (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_journey_receipts (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_growth_marks (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_journey_objectives (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_journey_receipts (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_crests (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_daily_runs (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_runs (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_run_analytics (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_live_progression_state (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_system_events (pet_id TEXT, telegram_id TEXT, season_key TEXT, system_key TEXT);
    CREATE TABLE telegram_pet_event_chain_progress (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_weekly_boss_progress (pet_id TEXT, telegram_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_seasonal_boss_progress (pet_id TEXT, telegram_id TEXT, pet_season_key TEXT);
  `;
}

function applyMigrationChain(db) {
  db.exec(createProductionSchemaBeforeAuthorityChain());
  db.exec(readRepoFile('workers/moonboys-api/migrations/070_moonpet_pet_identity_achievement_authority.sql'));
  db.exec(readRepoFile('workers/moonboys-api/migrations/071_moonpet_arena_pet_authority.sql'));
  db.exec(readRepoFile('workers/moonboys-api/migrations/072_moonpet_identity_authority_verification.sql'));
}

function seedValidIdentityRows(db) {
  db.prepare("INSERT INTO telegram_users (telegram_id, xp, level) VALUES ('audit-player', 0, 1)").run();
  db.prepare("INSERT INTO telegram_pet_profiles (telegram_id, pet_xp, level) VALUES ('audit-player', 10, 1)").run();
  db.prepare(`INSERT INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
    VALUES ('pet:audit-player:pet-s2026-003:1', 'audit-player', 'pet-s2026-003', 1, 'free', 'fixture', 0, 'active')`).run();
  db.prepare(`INSERT INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_name, status, source_profile_updated_at)
    VALUES ('pet:audit-player:pet-s2026-003:1', 'audit-player', 'pet-s2026-003', 1, 'Audit Pet', 'active', '2026-08-21T00:00:00Z')`).run();
  db.prepare(`INSERT INTO telegram_pet_memories
    (pet_id, telegram_id, season_key, first_run_at, milestones)
    VALUES ('pet:audit-player:pet-s2026-003:1', 'audit-player', 'pet-s2026-003', '2026-08-21T00:00:00Z', '["first_run"]')`).run();
  db.prepare(`INSERT INTO telegram_pet_personality_traits
    (pet_id, telegram_id, season_key, trait_id, progress)
    VALUES ('pet:audit-player:pet-s2026-003:1', 'audit-player', 'pet-s2026-003', 'curious', 1)`).run();
  db.prepare(`INSERT INTO telegram_pet_boss_victories
    (pet_id, telegram_id, season_key, boss_id, victories)
    VALUES ('pet:audit-player:pet-s2026-003:1', 'audit-player', 'pet-s2026-003', 'alley_king', 1)`).run();
  db.prepare(`INSERT INTO telegram_pet_identity_events
    (event_id, pet_id, telegram_id, season_key, event_key, event_kind)
    VALUES ('audit-event', 'pet:audit-player:pet-s2026-003:1', 'audit-player', 'pet-s2026-003', 'audit:event', 'memory')`).run();
  db.prepare(`INSERT INTO telegram_pet_identity_analytics
    (analytics_id, pet_id, telegram_id, season_key, event_type)
    VALUES ('audit-analytics', 'pet:audit-player:pet-s2026-003:1', 'audit-player', 'pet-s2026-003', 'memory_milestone')`).run();
  db.prepare(`INSERT INTO telegram_pet_achievements
    (pet_id, telegram_id, season_key, achievement_id, progress, target)
    VALUES ('pet:audit-player:pet-s2026-003:1', 'audit-player', 'pet-s2026-003', 'boss_breaker', 1, 5)`).run();
}

function assertRequiredTablesAndIndexes(db) {
  for (const table of IDENTITY_AUTHORITY_TABLES) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!row) throw new Error(`missing identity authority table: ${table}`);
  }
  for (const index of [
    'idx_telegram_pet_identity_events_owner',
    'idx_telegram_pet_identity_events_pet_kind_day',
    'idx_telegram_pet_achievements_owner',
  ]) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(index);
    if (!row) throw new Error(`missing identity authority index: ${index}`);
  }
  const analyticsIndex = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_telegram_pet_identity_analytics_owner'").get();
  if (!analyticsIndex) throw new Error('missing identity authority index: idx_telegram_pet_identity_analytics_owner');
  const analyticsColumns = db.prepare("PRAGMA index_info('idx_telegram_pet_identity_analytics_owner')").all()
    .sort((a, b) => Number(a.seqno) - Number(b.seqno))
    .map((row) => row.name);
  const expectedAnalyticsColumns = ['pet_id', 'telegram_id', 'season_key', 'created_at'];
  if (JSON.stringify(analyticsColumns) !== JSON.stringify(expectedAnalyticsColumns)) {
    throw new Error(`idx_telegram_pet_identity_analytics_owner columns must be ${expectedAnalyticsColumns.join(', ')}`);
  }
  const view = db.prepare("SELECT name FROM sqlite_master WHERE type = 'view' AND name = 'moonpet_invalid_identity_authority_rows'").get();
  if (!view) throw new Error('missing identity authority verification view');
}

function assertOwnershipAuditSurfaceTables(db) {
  for (const { table } of OWNERSHIP_AUDIT_TUPLE_TABLE_SPECS) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!row) throw new Error(`missing ownership audit table: ${table}`);
  }
}

function assertArenaAuthorityIntegration() {
  const worker = readRepoFile('workers/moonboys-api/worker.js');
  const queueInsert = /INSERT INTO telegram_pet_arena_queue\s+\(id,chat_id,telegram_id,pet_id,season_key,/i.test(worker);
  const battleInsert = /player1_pet_id[\s\S]{0,220}player1_season_key[\s\S]{0,220}player2_pet_id[\s\S]{0,220}player2_season_key/i.test(worker);
  const settlementAuthority = worker.includes("if (!sourceAuthority) return { accepted: false, reason: 'source_pet_authority_required'") &&
    worker.includes("pet_id: sourceAuthority.pet_id, season_key: sourceAuthority.season_key") &&
    worker.includes("await runPetIdentityWriteHook(options, { event_key: eventKey, ...sourceAuthority, event_type: 'arena_battle' })");
  if (!queueInsert) throw new Error('Pet Arena queue must persist pet_id and season_key authority');
  if (!battleInsert) throw new Error('Pet Arena battles must carry both players pet_id and season_key authority');
  if (!settlementAuthority) throw new Error('Pet Arena settlement must pass pet_id and season_key into identity writes');
}

function assertMigrationViewSafety() {
  const migration072 = readRepoFile('workers/moonboys-api/migrations/072_moonpet_identity_authority_verification.sql');
  const schema = readRepoFile('workers/moonboys-api/schema.sql');
  const worker = readRepoFile('workers/moonboys-api/worker.js');
  if (!/\bCREATE\s+VIEW\s+moonpet_invalid_identity_authority_rows\b/i.test(migration072)) {
    throw new Error('migration 072 must create the read-only identity authority verification view');
  }
  if (!/\bCREATE\s+VIEW\s+IF\s+NOT\s+EXISTS\s+moonpet_invalid_identity_authority_rows\b/i.test(schema)) {
    throw new Error('schema.sql must own the canonical identity authority verification view');
  }
  if (/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b[\s\S]{0,160}\bmoonpet_invalid_identity_authority_rows\b/i.test(worker)) {
    throw new Error('worker runtime must not mutate the identity authority verification view');
  }
}

export async function runMoonpetIdentityAuthorityAudit({ sqlitePath = null } = {}) {
  const runtimeViolations = auditRuntimeIdentityQueries();
  assertArenaAuthorityIntegration();
  assertMigrationViewSafety();
  if (runtimeViolations.length) {
    return {
      checkedRows: 0,
      tableCounts: Object.fromEntries(IDENTITY_AUTHORITY_TABLES.map((table) => [table, 0])),
      violations: runtimeViolations,
    };
  }

  await import(pathToFileURL(path.join(workerRoot, 'worker.js')).href);

  const db = sqlitePath ? new DatabaseSync(sqlitePath) : new DatabaseSync(':memory:');
  try {
    if (!sqlitePath) {
      applyMigrationChain(db);
      seedValidIdentityRows(db);
      assertOwnershipAuditSurfaceTables(db);
    }
    assertRequiredTablesAndIndexes(db);
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyViolations.length) {
      return {
        checkedRows: 0,
        tableCounts: Object.fromEntries(IDENTITY_AUTHORITY_TABLES.map((table) => [table, 0])),
        violations: foreignKeyViolations.map((row) => ({ ...row, reason: 'foreign_key_violation' })),
      };
    }
    return auditIdentityAuthorityDb(db);
  } finally {
    db.close();
  }
}

function parseArgs(argv) {
  const args = { sqlitePath: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--sqlite') {
      if (!argv[index + 1] || String(argv[index + 1]).startsWith('--')) {
        throw new Error('--sqlite requires a path');
      }
      args.sqlitePath = path.resolve(argv[index + 1]);
      index += 1;
    }
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runMoonpetIdentityAuthorityAudit(parseArgs(process.argv.slice(2)));
  console.log('Moonpet Identity Authority Audit');
  console.log('');
  console.log('Migration chain: 070 -> 071 -> 072');
  console.log('');
  for (const table of IDENTITY_AUTHORITY_TABLES) {
    console.log(`${table}: ${Number(result.tableCounts?.[table] || 0)}`);
  }
  console.log('');
  console.log(`Invalid authority rows: ${result.violations.length}`);
  console.log('');
  if (result.violations.length) {
    console.error(JSON.stringify(result.violations, null, 2));
    console.log('STATUS: FAIL');
    process.exit(1);
  }
  console.log('STATUS: PASS');
}

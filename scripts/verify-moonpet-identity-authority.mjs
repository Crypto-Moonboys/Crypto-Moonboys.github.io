import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

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

export function auditRuntimeIdentityQueries({ root = workerRoot } = {}) {
  const violations = [];
  for (const file of walkJavaScriptFiles(root)) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(repoRoot, file).replaceAll(path.sep, '/');
    for (const table of IDENTITY_AUTHORITY_TABLES) {
      const statementPattern = new RegExp(`(?:FROM|UPDATE|DELETE\\s+FROM)\\s+${table}\\b[\\s\\S]{0,900}?WHERE\\s+([\\s\\S]{0,500}?)(?:\`|;|\\n\\s*\\)|ORDER\\s+BY|GROUP\\s+BY|LIMIT\\s+)`, 'gi');
      for (const match of source.matchAll(statementPattern)) {
        const statement = match[0];
        if (!/\btelegram_id\s*=\s*\?/i.test(statement)) continue;
        if (!hasColumnReference(statement, 'pet_id') || !hasColumnReference(statement, 'season_key')) {
          violations.push({
            type: 'runtime_identity_query_missing_pet_authority',
            file: relative,
            table,
            excerpt: statement.replace(/\s+/g, ' ').slice(0, 220),
          });
        }
      }
      const insertPattern = new RegExp(`INSERT\\s+(?:OR\\s+IGNORE\\s+)?INTO\\s+${table}\\s*\\(([^)]*)\\)`, 'gi');
      for (const match of source.matchAll(insertPattern)) {
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
             WHEN s.pet_id IS NULL THEN 'ownership_mismatch'
             WHEN i.pet_id IS NULL THEN 'identity_pet_instance_missing'
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
  `).join('\nUNION ALL\n');
}

export function auditIdentityAuthorityDb(db) {
  const tableCounts = Object.fromEntries(IDENTITY_AUTHORITY_TABLES.map((table) => [
    table,
    Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0),
  ]));
  const checkedRows = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
  const violations = db.prepare(identityAuthorityViolationSql()).all();
  const viewCount = db.prepare('SELECT COUNT(*) AS count FROM moonpet_invalid_identity_authority_rows').get().count;
  if (Number(viewCount) !== Number(violations.length)) {
    violations.push({
      table_name: 'moonpet_invalid_identity_authority_rows',
      row_key: 'verification_view',
      reason: `view_count_mismatch:${viewCount}:${violations.length}`,
    });
  }
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
  const view = db.prepare("SELECT name FROM sqlite_master WHERE type = 'view' AND name = 'moonpet_invalid_identity_authority_rows'").get();
  if (!view) throw new Error('missing identity authority verification view');
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
      assertRequiredTablesAndIndexes(db);
      seedValidIdentityRows(db);
    }
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
      args.sqlitePath = argv[index + 1] ? path.resolve(argv[index + 1]) : null;
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

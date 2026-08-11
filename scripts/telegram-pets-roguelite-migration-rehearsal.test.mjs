import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const profiles = read('../workers/moonboys-api/migrations/030_telegram_pets.sql');
const v1 = read('../workers/moonboys-api/migrations/033_telegram_pet_run_engine.sql');
const repeatRewards = read('../workers/moonboys-api/migrations/041_telegram_pet_repeat_reward_slots.sql');
const migration = read('../workers/moonboys-api/migrations/042_telegram_pet_roguelite_foundation.sql');
const identity = read('../workers/moonboys-api/migrations/043_telegram_pet_identity_expansion.sql');
const dailyRuns = read('../workers/moonboys-api/migrations/044_telegram_pet_daily_runs.sql');
const reconciliation = read('../workers/moonboys-api/migrations/045_telegram_pet_inventory_cutover_reconciliation.sql');

const migrationSequence = [repeatRewards, migration, identity, dailyRuns, reconciliation];

function applyD1Migration(db, sql) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'each D1 migration must finish with valid foreign keys');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function assertTables(db, names, label) {
  const found = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map(({ name }) => name));
  for (const name of names) assert.ok(found.has(name), `${label} must contain ${name}`);
}

const requiredTables = [
  'telegram_pet_runs',
  'telegram_pet_run_steps',
  'telegram_pet_inventory',
  'telegram_pet_inventory_legacy_sync_042',
  'telegram_pet_reward_claims',
  'telegram_pet_reward_assets',
  'telegram_pet_run_rooms',
  'telegram_pet_run_modifiers',
  'telegram_pet_relics',
  'telegram_pet_run_history',
  'telegram_pet_run_analytics',
  'telegram_pet_evolutions',
  'telegram_pet_personality_traits',
  'telegram_pet_memories',
  'telegram_pet_identity_events',
  'telegram_pet_identity_analytics',
  'telegram_pet_daily_runs',
  'telegram_pet_daily_challenge_progress',
  'telegram_pet_daily_challenge_events',
  'telegram_pet_daily_leaderboard_records',
  'telegram_pet_seasonal_challenge_state',
  'telegram_pet_seasonal_achievements',
  'telegram_pet_daily_analytics',
];

// D1 remote migration execution rejects trigger programs with internal statement
// terminators as incomplete input. Keep 042 and its forward reconciliation free
// of CREATE TRIGGER and explicit transaction blocks; Wrangler owns the transaction.
assert.doesNotMatch(migration, /^--.*['"]/m, 'migration 042 line comments must not contain quote characters');
assert.doesNotMatch(`${migration}\n${reconciliation}`, /CREATE\s+TRIGGER|\bBEGIN(?:\s+TRANSACTION)?\b|\bCOMMIT\b|\bROLLBACK\b/i,
  'D1 migrations must not contain trigger programs or user-managed transactions');

// Fresh pre-041 rehearsal: apply the pending migrations in the exact order
// Wrangler uses, with each file isolated in its own transaction.
const freshDb = new DatabaseSync(':memory:');
freshDb.exec('PRAGMA foreign_keys = ON');
freshDb.exec('CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY)');
freshDb.exec(profiles);
freshDb.exec(v1);
for (const sql of migrationSequence) applyD1Migration(freshDb, sql);
assertTables(freshDb, requiredTables, 'fresh 041 -> 045 rehearsal');
assert.equal(freshDb.prepare('PRAGMA foreign_key_check').all().length, 0);

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY);
  CREATE TABLE telegram_pet_profiles (
    telegram_id TEXT PRIMARY KEY,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
  );
  CREATE TABLE telegram_pet_events (
    id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, event_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'accepted', metadata TEXT NOT NULL DEFAULT '{}'
  );`);
for (const telegramId of ['migration-player', 'extractable-player', 'extracted-player']) db.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)').run(telegramId);
for (const telegramId of ['migration-player', 'extractable-player', 'extracted-player']) db.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run(telegramId);
db.exec(v1);

const insertRun = db.prepare(`INSERT INTO telegram_pet_runs
  (id, telegram_id, run_id, season_key, status, depth, max_depth, risk_level,
   unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items,
   started_at, completed_at, updated_at)
  VALUES (?, ?, ?, 'v1-season', ?, ?, 5, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
insertRun.run('open-id', 'migration-player', 'open-run', 'active', 2, 3, 111, 22, 3, 4, '{"scrap":2}', '2026-07-01T01:02:03Z', null, '2026-07-01T02:03:04Z');
insertRun.run('extractable-id', 'extractable-player', 'extractable-run', 'extractable', 4, 5, 222, 33, 4, 5, '{"circuit":1}', '2026-07-02T01:02:03Z', null, '2026-07-02T02:03:04Z');
insertRun.run('extracted-id', 'extracted-player', 'extracted-run', 'extracted', 5, 2, 333, 44, 5, 6, '{"alloy":3}', '2026-07-03T01:02:03Z', '2026-07-03T03:04:05Z', '2026-07-03T03:04:05Z');
db.prepare(`INSERT INTO telegram_pet_run_steps
  (id, telegram_id, run_id, step_index, choice_key, choice_type, event_key, success, risk_roll,
   pet_xp_delta, moon_gold_delta, moon_crystals_delta, style_tokens_delta, item_key, metadata, created_at)
  VALUES ('step-id', 'migration-player', 'open-run', 1, 'fight', 'battle', 'callback:key:1', 1, 0.75, 12, 3, 1, 2, 'scrap', '{"kept":true}', '2026-07-01T01:30:00Z')`).run();
db.prepare("INSERT INTO telegram_pet_events (id, telegram_id, event_key) VALUES ('callback-id', 'migration-player', 'callback:key:1')").run();
db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_key, metadata) VALUES
  ('legacy-item-1', 'migration-player', 'legacy:item:1', '{"item_key":"moon_snack","count":2}'),
  ('legacy-item-2', 'migration-player', 'legacy:item:2', '{"inventory_key":"energy_drink"}'),
  ('legacy-use-1', 'migration-player', 'legacy:use:1', '{"consumed_item_key":"moon_snack"}'),
  ('legacy-equipment', 'migration-player', 'legacy:equipment', '{"item_key":"moon_armor"}'),
  ('legacy-invalid-json', 'migration-player', 'legacy:invalid', 'not-json')`).run();

applyD1Migration(db, repeatRewards);
applyD1Migration(db, migration);

const open = db.prepare("SELECT * FROM telegram_pet_runs WHERE run_id = 'open-run'").get();
assert.deepEqual({ status: open.status, depth: open.depth, current_room: open.current_room, risk_level: open.risk_level,
  pet_xp: open.unbanked_pet_xp, gold: open.unbanked_moon_gold, crystals: open.unbanked_moon_crystals,
  style: open.unbanked_style_tokens, items: open.unbanked_items, started: open.started_at, updated: open.updated_at },
{ status: 'active', depth: 2, current_room: 2, risk_level: 3, pet_xp: 111, gold: 22, crystals: 3,
  style: 4, items: '{"scrap":2}', started: '2026-07-01T01:02:03Z', updated: '2026-07-01T02:03:04Z' });
assert.equal(db.prepare("SELECT status FROM telegram_pet_runs WHERE run_id = 'extractable-run'").get().status, 'extractable');
assert.equal(db.prepare("SELECT status, completed_at, ended_at FROM telegram_pet_runs WHERE run_id = 'extracted-run'").get().status, 'extracted');
const step = db.prepare("SELECT * FROM telegram_pet_run_steps WHERE id = 'step-id'").get();
assert.equal(step.event_key, 'callback:key:1');
assert.equal(step.metadata, '{"kept":true}');
assert.equal(db.prepare("SELECT event_key FROM telegram_pet_events WHERE id = 'callback-id'").get().event_key, 'callback:key:1');
assert.deepEqual(db.prepare("SELECT asset_key, quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' ORDER BY asset_key").all().map((row) => ({ ...row })), [
  { asset_key: 'energy_drink', quantity: 1 },
  { asset_key: 'moon_snack', quantity: 1 },
], 'migration must materialize net legacy item balances in the authoritative inventory table');

// Cutover timeline: migration first, then the still-deployed legacy Worker
// grants and consumes through accepted event INSERTs before the new Worker starts.
db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-legacy-reward', 'migration-player', 'cutover:legacy:reward', '{"item_key":"moon_snack","count":2}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 1,
  'legacy writes remain in the event ledger until the forward reconciliation');
db.prepare(`INSERT OR IGNORE INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-legacy-reward-duplicate', 'migration-player', 'cutover:legacy:reward', '{"item_key":"moon_snack","count":2}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 1,
  'a duplicate legacy callback cannot alter authority before reconciliation');
db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-legacy-consume', 'migration-player', 'cutover:legacy:consume', '{"consumed_item_key":"moon_snack"}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 1,
  'legacy consumption remains in the event ledger until reconciliation');
db.prepare(`INSERT OR IGNORE INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-legacy-consume-duplicate', 'migration-player', 'cutover:legacy:consume', '{"consumed_item_key":"moon_snack"}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 1,
  'a duplicate legacy consumption cannot decrement authority before reconciliation');

// Simulate mixed-version propagation: new authority changes the table directly
// and marks its audit event so the bridge cannot apply the same consumption twice.
db.prepare(`UPDATE telegram_pet_inventory SET quantity = quantity + 1
  WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'`).run();
db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-late-legacy-consume', 'migration-player', 'cutover:late-legacy:consume',
    '{"consumed_item_key":"moon_snack"}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 2,
  'a late old-Worker consumption must not overwrite a concurrent authority grant');
db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-authority-consume', 'migration-player', 'cutover:authority:consume',
    '{"inventory_authority":true,"consumed_item_key":"moon_snack"}')`).run();
db.prepare(`UPDATE telegram_pet_inventory SET quantity = quantity - 1
  WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack' AND quantity > 0`).run();
applyD1Migration(db, identity);
applyD1Migration(db, dailyRuns);
applyD1Migration(db, reconciliation);
assertTables(db, requiredTables, 'production-like 041 -> 045 rehearsal');
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 1,
  'reconciliation must preserve new authority writes while applying the legacy ledger delta once');
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory_legacy_sync_042 WHERE telegram_id = 'migration-player' AND asset_key = 'moon_snack'").get().quantity, 1,
  'the cutover checkpoint must retain the reconciled legacy ledger contribution');
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name IN ('telegram_pet_legacy_item_grant_042', 'telegram_pet_legacy_item_consume_042')").get().count, 0,
  'D1-compatible migrations must not install parser-hostile trigger programs');
db.prepare(`INSERT INTO telegram_pet_reward_claims
  (claim_id, telegram_id, source, idempotency_key, day_key, status)
  VALUES ('rehearsal-claim', 'migration-player', 'roguelite_room', 'room:1', '2026-07-01', 'awarded')`).run();
db.prepare(`INSERT INTO telegram_pet_reward_assets (claim_id, asset_type, asset_key, amount)
  VALUES ('rehearsal-claim', 'material', 'neon_scrap', 2)`).run();
db.prepare(`INSERT INTO telegram_pet_run_rooms
  (room_id, run_id, telegram_id, room_number, room_type, status, reward_claim_id)
  VALUES ('rehearsal-room', 'open-run', 'migration-player', 1, 'loot', 'resolved', 'rehearsal-claim')`).run();
db.prepare(`INSERT INTO telegram_pet_daily_runs
  (telegram_id, utc_day, seed, run_id, status)
  VALUES ('migration-player', '2026-07-01', 'seed-1', 'open-run', 'active')`).run();
assert.equal(db.prepare("SELECT status FROM telegram_pet_reward_claims WHERE claim_id = 'rehearsal-claim'").get().status, 'awarded', 'reward claims must remain authoritative');
assert.equal(db.prepare("SELECT reward_claim_id FROM telegram_pet_run_rooms WHERE room_id = 'rehearsal-room'").get().reward_claim_id, 'rehearsal-claim', 'roguelite rooms must retain reward links');
assert.equal(db.prepare("SELECT run_id FROM telegram_pet_daily_runs WHERE telegram_id = 'migration-player'").get().run_id, 'open-run', 'daily runs must retain run authority');
assert.equal(db.prepare("SELECT evolution_id FROM telegram_pet_evolutions WHERE telegram_id = 'migration-player'").get().evolution_id, 'moon_egg', 'identity backfill must preserve existing players');
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'migration cannot leave orphan run steps');
assert.throws(() => db.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('second-open', 'migration-player', 'second-open', 'v1-season', 'active')`).run(), /UNIQUE/, 'migration must preserve one-open-run protection');
assert.throws(() => db.prepare(`INSERT INTO telegram_pet_run_steps (id, telegram_id, run_id, step_index, choice_key, choice_type, event_key) VALUES ('orphan', 'migration-player', 'missing', 1, 'x', 'x', 'orphan-key')`).run(), /FOREIGN KEY/, 'new run steps cannot be orphaned');
assert.throws(() => db.prepare(`INSERT INTO telegram_pet_run_steps (id, telegram_id, run_id, step_index, choice_key, choice_type, event_key) VALUES ('duplicate-callback', 'migration-player', 'open-run', 2, 'x', 'x', 'callback:key:1')`).run(), /UNIQUE/, 'callback keys remain duplicate protected');

console.log('Telegram Pets migration 042 rehearsal passed.');

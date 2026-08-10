import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const v1 = read('../workers/moonboys-api/migrations/033_telegram_pet_run_engine.sql');
const migration = read('../workers/moonboys-api/migrations/042_telegram_pet_roguelite_foundation.sql');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY);
  CREATE TABLE telegram_pet_events (
    id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, event_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'accepted', metadata TEXT NOT NULL DEFAULT '{}'
  );`);
for (const telegramId of ['migration-player', 'extractable-player', 'extracted-player']) db.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)').run(telegramId);
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

db.exec('BEGIN IMMEDIATE');
try { db.exec(migration); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }

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
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 3,
  'a legacy reward written after migration 042 must be mirrored without losing items');
db.prepare(`INSERT OR IGNORE INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-legacy-reward-duplicate', 'migration-player', 'cutover:legacy:reward', '{"item_key":"moon_snack","count":2}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 3,
  'a duplicate legacy reward callback must not duplicate authoritative quantity');
db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-legacy-consume', 'migration-player', 'cutover:legacy:consume', '{"consumed_item_key":"moon_snack"}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 2,
  'a legacy consumption written after migration 042 must be mirrored exactly once');
db.prepare(`INSERT OR IGNORE INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-legacy-consume-duplicate', 'migration-player', 'cutover:legacy:consume', '{"consumed_item_key":"moon_snack"}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 2,
  'a duplicate legacy consumption callback must not decrement authoritative quantity twice');

// Simulate mixed-version propagation: new authority changes the table directly
// and marks its audit event so the bridge cannot apply the same consumption twice.
db.prepare(`UPDATE telegram_pet_inventory SET quantity = quantity + 1
  WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'`).run();
db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-late-legacy-consume', 'migration-player', 'cutover:late-legacy:consume',
    '{"consumed_item_key":"moon_snack"}')`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 2,
  'a late old-Worker consumption must reconcile only the legacy contribution and preserve a concurrent authority grant');
db.prepare(`INSERT INTO telegram_pet_events (id, telegram_id, event_key, metadata)
  VALUES ('cutover-authority-consume', 'migration-player', 'cutover:authority:consume',
    '{"inventory_authority":true,"consumed_item_key":"moon_snack"}')`).run();
db.prepare(`UPDATE telegram_pet_inventory SET quantity = quantity - 1
  WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack' AND quantity > 0`).run();
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id = 'migration-player' AND asset_type = 'item' AND asset_key = 'moon_snack'").get().quantity, 1,
  'new authority writes must coexist with the bridge without duplicate grants or consumption');
assert.equal(db.prepare("SELECT quantity FROM telegram_pet_inventory_legacy_sync_042 WHERE telegram_id = 'migration-player' AND asset_key = 'moon_snack'").get().quantity, 1,
  'the bridge checkpoint must retain the exact legacy ledger contribution after cutover');
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name IN ('telegram_pet_legacy_item_grant_042', 'telegram_pet_legacy_item_consume_042')").get().count, 2,
  'migration 042 must install both temporary cutover triggers');
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0, 'migration cannot leave orphan run steps');
assert.throws(() => db.prepare(`INSERT INTO telegram_pet_runs (id, telegram_id, run_id, season_key, status) VALUES ('second-open', 'migration-player', 'second-open', 'v1-season', 'active')`).run(), /UNIQUE/, 'migration must preserve one-open-run protection');
assert.throws(() => db.prepare(`INSERT INTO telegram_pet_run_steps (id, telegram_id, run_id, step_index, choice_key, choice_type, event_key) VALUES ('orphan', 'migration-player', 'missing', 1, 'x', 'x', 'orphan-key')`).run(), /FOREIGN KEY/, 'new run steps cannot be orphaned');
assert.throws(() => db.prepare(`INSERT INTO telegram_pet_run_steps (id, telegram_id, run_id, step_index, choice_key, choice_type, event_key) VALUES ('duplicate-callback', 'migration-player', 'open-run', 2, 'x', 'x', 'callback:key:1')`).run(), /UNIQUE/, 'callback keys remain duplicate protected');

console.log('Telegram Pets migration 042 rehearsal passed.');

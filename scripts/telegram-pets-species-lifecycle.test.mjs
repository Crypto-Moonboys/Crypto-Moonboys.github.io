import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  MOONPET_SPECIES, createMoonEggLifecycle, getMoonpetLifecycle, hatchMoonpet, incubateMoonEgg, incubationAgeDays, morphMoonpetRare,
  resolveMoonpetDisplayName, syncMoonpetLifecycleStage,
} from '../workers/moonboys-api/pets/species-lifecycle.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const SPECIES_LABELS = Object.freeze({
  neon_raccoon: 'F1 EDDY',
  bubble_ram: 'JAKE THE SNAKE',
  comet_gecko: 'TUBBY',
  vinyl_crab: 'BOTTY',
  lantern_fox: 'RED ALERT',
  sneaker_snail: 'THE TING',
  alley_drake: 'TATTOO JOHN',
  moon_ferret: 'TIN BOB',
});

assert.equal(incubationAgeDays({ created_at: '2026-08-01 00:00:00' }, '2026-08-08T00:00:00Z'), 7);
assert.equal(incubationAgeDays({ created_at: '2026-08-01T02:00:00+02:00' }, '2026-08-08T00:00:00Z'), 7,
  'D1 UTC timestamps and equivalent offset timestamps produce identical incubation age');

class Statement {
  constructor(adapter, sql, args = []) { this.adapter = adapter; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.adapter, this.sql, args); }
  async first() {
    this.adapter.beforeFirst?.(this.sql, this.args);
    return this.adapter.database.prepare(this.sql).get(...this.args) || null;
  }
  async all() {
    const override = this.adapter.beforeAll?.(this.sql, this.args);
    if (override !== undefined) return override;
    return { results: this.adapter.database.prepare(this.sql).all(...this.args) };
  }
  async run() {
    this.adapter.beforeRun?.(this.sql, this.args);
    const result = this.adapter.database.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}
class D1 {
  constructor() { this.database = new DatabaseSync(':memory:'); this.beforeFirst = null; this.beforeAll = null; this.beforeRun = null; this.beforeBatch = null; }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    const override = await this.beforeBatch?.(statements);
    if (override !== undefined) return override;
    this.database.exec('BEGIN IMMEDIATE');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.database.exec('COMMIT'); return results; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
}
function provisionActivePet(database, telegramId) {
  database.exec(`
    CREATE TABLE telegram_pet_instances (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, slot_number INTEGER DEFAULT 1,
      species TEXT DEFAULT '', stage TEXT DEFAULT 'egg', source_profile_updated_at TEXT,
      level INTEGER DEFAULT 1, pet_xp INTEGER DEFAULT 0, status TEXT DEFAULT 'active', updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE telegram_pet_season_slots (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, slot_number INTEGER DEFAULT 1, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE telegram_pet_active_slots (telegram_id TEXT PRIMARY KEY, pet_id TEXT, season_key TEXT);
    CREATE TABLE telegram_pet_growth_marks (mark_id TEXT PRIMARY KEY, pet_id TEXT, telegram_id TEXT, season_key TEXT, milestone_type TEXT, evidence_key TEXT, earned_day TEXT, earned_at TEXT, UNIQUE(pet_id,season_key,earned_day));
    CREATE TABLE telegram_pet_weekly_crests (pet_id TEXT, telegram_id TEXT, season_key TEXT, qualification_week INTEGER);
    CREATE TABLE telegram_pet_season_completions (pet_id TEXT, telegram_id TEXT, season_key TEXT, completed_at TEXT);
    CREATE TABLE telegram_pet_relics (telegram_id TEXT, relic_id TEXT);
    CREATE TABLE telegram_pet_boss_victories (pet_id TEXT, telegram_id TEXT, season_key TEXT, boss_id TEXT, victories INTEGER DEFAULT 0);
    CREATE TABLE telegram_pet_material_balances (telegram_id TEXT, material_key TEXT, quantity INTEGER DEFAULT 0);
    CREATE TABLE telegram_pet_inventory (telegram_id TEXT, asset_type TEXT, asset_key TEXT, quantity INTEGER DEFAULT 0);
    CREATE TABLE telegram_pet_lifecycle_by_pet (
      pet_id TEXT PRIMARY KEY, telegram_id TEXT, lifecycle_version INTEGER DEFAULT 1, identity_seed TEXT,
      phase TEXT DEFAULT 'egg', species_id TEXT, palette_id TEXT, marking_id TEXT, eye_style TEXT, temperament TEXT,
      innate_traits_json TEXT DEFAULT '[]', incubation_progress INTEGER DEFAULT 0, incubation_json TEXT DEFAULT '{}',
      rare_route_index INTEGER, rare_morph_id TEXT, hatched_at TEXT, adult_at TEXT, rare_morphed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE telegram_pet_lifecycle_events_by_pet (
      event_id TEXT PRIMARY KEY, pet_id TEXT, telegram_id TEXT, event_key TEXT, action TEXT,
      payload_json TEXT DEFAULT '{}', progress_delta INTEGER DEFAULT 0, day_key TEXT DEFAULT (strftime('%Y-%m-%d', 'now')),
      applied_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(pet_id, event_key)
    );
  `);
  const petId = `pet:${telegramId}:test:1`;
  database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number) VALUES (?, ?, 'test', 1)`).run(petId, telegramId);
  database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number) VALUES (?, ?, 'test', 1)`).run(petId, telegramId);
  database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key) VALUES (?, ?, 'test')`).run(telegramId, petId);
}

const db = new D1();
db.database.exec(`
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY, species TEXT NOT NULL DEFAULT '', stage TEXT DEFAULT 'egg', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE telegram_pet_evolutions (telegram_id TEXT, stage INTEGER);
  CREATE TABLE telegram_pet_memories (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, exploration_actions INTEGER DEFAULT 0, total_runs INTEGER DEFAULT 0,
    combat_actions INTEGER DEFAULT 0, total_bosses_defeated INTEGER DEFAULT 0, care_actions INTEGER DEFAULT 0, event_actions INTEGER DEFAULT 0,
    adventure_actions INTEGER DEFAULT 0);
  CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT, unlocked_at TEXT);
  CREATE TABLE telegram_pet_evolutions_by_pet (pet_id TEXT, telegram_id TEXT, evolution_id TEXT, stage INTEGER);
`);
db.database.exec(await (await import('node:fs/promises')).readFile(new URL('../workers/moonboys-api/migrations/053_telegram_pet_species_lifecycle.sql', import.meta.url), 'utf8'));
db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run('new-player');
provisionActivePet(db.database, 'new-player');
assert.equal(db.database.prepare('SELECT species FROM telegram_pet_profiles WHERE telegram_id=?').get('new-player').species, '', 'new pet profiles must not default to a fake species');
db.database.prepare('DELETE FROM telegram_pet_lifecycle_by_pet WHERE telegram_id=?').run('new-player');
const created = await createMoonEggLifecycle(db, 'new-player', 'adopt:1');
assert.equal(Object.hasOwn(created, 'identity_seed'), false, 'private identity seed must never be returned');
let lifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(lifecycle.phase, 'egg');
assert.equal(lifecycle.species_id, null, 'species must stay secret before hatching');

for (const [index, care] of ['warm', 'talk', 'music', 'warm', 'talk', 'music'].entries()) {
  assert.equal((await incubateMoonEgg(db, 'new-player', care, `care:${index}`)).accepted, true);
}
for (const care of ['warm', 'talk', 'music', 'rest']) {
  assert.equal((await incubateMoonEgg(db, 'new-player', care, `cap:${care}`)).accepted, care === 'warm' || care === 'talk');
}
assert.equal((await incubateMoonEgg(db, 'new-player', 'rest', 'cap:blocked')).reason, 'incubation_daily_cap');
assert.equal((await incubateMoonEgg(db, 'new-player', 'music', 'care:0')).duplicate, true, 'request keys must be idempotent');
lifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(lifecycle.incubation.ready, false, 'strong engagement cannot compress incubation below seven days');
assert.equal((await hatchMoonpet(db, 'new-player', 'hatch:too-early')).reason, 'egg_not_ready');
db.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET created_at=datetime('now','-7 days') WHERE telegram_id=?`).run('new-player');
for (let offset = 1; offset <= 6; offset += 1) {
  const awardDay = new Date(Date.now() + offset * 86400000);
  assert.equal((await incubateMoonEgg(db, 'new-player', 'warm', `growth-day:${offset}`, awardDay)).accepted, true);
}
assert.equal(db.database.prepare(`SELECT COUNT(DISTINCT earned_day) count FROM telegram_pet_growth_marks WHERE pet_id='pet:new-player:test:1'`).get().count, 7,
  'fresh eggs have a server-authoritative daily Growth Mark path before Street evolution');
lifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(lifecycle.incubation.ready, true, 'strong engagement enables the earliest day-seven hatch');
const hatched = await hatchMoonpet(db, 'new-player', 'hatch:1');
assert.equal(hatched.accepted, true);
assert.equal((await hatchMoonpet(db, 'new-player', 'hatch:1')).duplicate, true, 'hatching must be idempotent');
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE telegram_id=? AND action='hatch' AND applied_at IS NOT NULL").get('new-player').count, 1, 'hatch must have exactly one applied audit event');
assert.equal(hatched.lifecycle.species_id, null);
assert.equal(hatched.lifecycle.species_name, 'UNKNOWN');
assert.equal(hatched.lifecycle.display_name, 'UNKNOWN');
assert.ok(Object.hasOwn(MOONPET_SPECIES, hatched.lifecycle.art_identity_id));
assert.equal(hatched.lifecycle.innate_traits.length, 2);
assert.ok(hatched.lifecycle.preferences.length >= 1, 'identity must expose stable behaviour preferences');
assert.equal(db.database.prepare('SELECT species FROM telegram_pet_profiles WHERE telegram_id=?').get('new-player').species, hatched.lifecycle.art_identity_id,
  'the server-owned identity remains assigned even while its display name is masked');
assert.deepEqual({ ...db.database.prepare('SELECT species,stage,source_profile_updated_at FROM telegram_pet_instances WHERE pet_id=?').get('pet:new-player:test:1') },
  { species: hatched.lifecycle.art_identity_id, stage: 'young', source_profile_updated_at: '0001-01-01 00:00:00' },
  'hatching must persist lifecycle state to the authoritative pet instance before route reconciliation');
for (const [speciesId, speciesName] of Object.entries(SPECIES_LABELS)) {
  db.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet
    SET phase='young', species_id=?, temperament='bold', innate_traits_json='[]'
    WHERE telegram_id=?`).run(speciesId, 'new-player');
  const mapped = await getMoonpetLifecycle(db, 'new-player');
  assert.equal(mapped.species_id, null);
  assert.equal(mapped.species_name, 'UNKNOWN', `Stage 0-2 public lifecycle must mask ${speciesName}`);
  assert.equal(mapped.art_identity_id, speciesId, 'private art selection remains stable without becoming a display label');
  for (let stage = 0; stage <= 5; stage += 1) {
    assert.equal(resolveMoonpetDisplayName({ evolution_stage: stage, art_identity_id: speciesId }), stage < 3 ? 'UNKNOWN' : speciesName,
      `${speciesName} must follow the Stage-3 reveal boundary at stage ${stage}`);
  }
}
db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet VALUES ('pet:new-player:test:1','new-player','cyber_moonpet',2)`).run();
await syncMoonpetLifecycleStage(db, 'new-player', 2);
assert.equal(db.database.prepare("SELECT stage FROM telegram_pet_instances WHERE pet_id='pet:new-player:test:1'").get().stage, 'adult',
  'evolution lifecycle synchronization must update the authoritative pet instance');
db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet VALUES ('pet:new-player:test:1','new-player','elite_moonpet',3)`).run();
const revealedLifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(revealedLifecycle.species_id, revealedLifecycle.art_identity_id);
assert.equal(revealedLifecycle.species_name, SPECIES_LABELS[revealedLifecycle.species_id]);
db.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet
  SET phase='rare', rare_route_index=0, rare_morph_id='celestial_serpent'
  WHERE telegram_id='new-player'`).run();
const rareLifecycle = await getMoonpetLifecycle(db, 'new-player');
assert.equal(rareLifecycle.rare_morph_id, 'celestial_serpent', 'public lifecycle must expose the stable rare morph ID');
assert.equal(rareLifecycle.rare.id, 'celestial_serpent', 'rare lifecycle details must include the stable route ID');
assert.equal(rareLifecycle.rare.name, 'Celestial Serpent');
db.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET phase='adult' WHERE telegram_id='new-player'`).run();
db.database.prepare(`INSERT OR REPLACE INTO telegram_pet_memories VALUES ('pet:new-player:test:1','new-player','test',100,100,100,100,100,100,100)`).run();
for (const trait of ['explorer', 'curious', 'street_fighter', 'loyal']) db.database.prepare(
  `INSERT INTO telegram_pet_personality_traits VALUES ('pet:new-player:test:1','new-player','test',?,CURRENT_TIMESTAMP)`,
).run(trait);
db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet VALUES ('pet:new-player:test:1','new-player','moon_guardian',4)`).run();
assert.equal((await morphMoonpetRare(db, 'new-player', 'rare:before-legendary')).reason, 'rare_signal_not_ready',
  'rare morph cannot trigger at the former final stage before Legendary stage 5');
db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet VALUES ('pet:new-player:test:1','new-player','legendary_moon_guardian',5)`).run();
const rareMorph = await morphMoonpetRare(db, 'new-player', 'rare:legendary');
assert.equal(rareMorph.accepted, true);
assert.equal(db.database.prepare("SELECT stage FROM telegram_pet_instances WHERE pet_id='pet:new-player:test:1'").get().stage, 'rare',
  'rare morph must persist to the authoritative pet instance before route reconciliation');
db.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:new-player:test:2', 'new-player', 'test', 2)`).run();
db.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:new-player:test:2', 'new-player', 'test', 2)`).run();
db.database.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet
  (pet_id, telegram_id, identity_seed, phase, species_id, rare_route_index)
  VALUES ('pet:new-player:test:2', 'new-player', 'pet-b-seed', 'adult', 'lunar_fox', 0)`).run();
db.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet VALUES ('pet:new-player:test:2','new-player','legendary_moon_guardian',5)`).run();
db.database.prepare(`UPDATE telegram_pet_active_slots SET pet_id='pet:new-player:test:2' WHERE telegram_id='new-player'`).run();
const petBRareAttempt = await morphMoonpetRare(db, 'new-player', 'rare:pet-b-no-identity');
assert.equal(petBRareAttempt.reason, 'rare_signal_not_ready',
  'rare morph readiness for Pet B must not use Pet A memories or personality traits');

db.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run('guaranteed-player');
db.database.prepare(`INSERT INTO telegram_pet_instances (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:guaranteed-player:test:1', 'guaranteed-player', 'test', 1)`).run();
db.database.prepare(`INSERT INTO telegram_pet_season_slots (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:guaranteed-player:test:1', 'guaranteed-player', 'test', 1)`).run();
db.database.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key) VALUES ('guaranteed-player', 'pet:guaranteed-player:test:1', 'test')`).run();
db.database.prepare('DELETE FROM telegram_pet_lifecycle_by_pet WHERE telegram_id=?').run('guaranteed-player');
await createMoonEggLifecycle(db, 'guaranteed-player', 'adopt:guaranteed');
db.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET created_at=datetime('now','-14 days') WHERE telegram_id=?`).run('guaranteed-player');
assert.equal((await hatchMoonpet(db, 'guaranteed-player', 'hatch:guaranteed')).accepted, true, 'day fourteen guarantees hatch without engagement acceleration');

const pendingDb = new D1();
pendingDb.database.exec(`
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY, species TEXT NOT NULL DEFAULT '', stage TEXT DEFAULT 'egg', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE telegram_pet_evolutions (telegram_id TEXT, stage INTEGER);
  CREATE TABLE telegram_pet_evolutions_by_pet (pet_id TEXT, telegram_id TEXT, evolution_id TEXT, stage INTEGER);
  CREATE TABLE telegram_pet_memories (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, exploration_actions INTEGER DEFAULT 0, total_runs INTEGER DEFAULT 0,
    combat_actions INTEGER DEFAULT 0, total_bosses_defeated INTEGER DEFAULT 0, care_actions INTEGER DEFAULT 0, event_actions INTEGER DEFAULT 0,
    adventure_actions INTEGER DEFAULT 0);
  CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT, unlocked_at TEXT);
`);
pendingDb.database.exec(await (await import('node:fs/promises')).readFile(new URL('../workers/moonboys-api/migrations/053_telegram_pet_species_lifecycle.sql', import.meta.url), 'utf8'));
pendingDb.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run('pending-player');
provisionActivePet(pendingDb.database, 'pending-player');
pendingDb.database.prepare('DELETE FROM telegram_pet_lifecycle_by_pet WHERE telegram_id=?').run('pending-player');
await createMoonEggLifecycle(pendingDb, 'pending-player', 'adopt:pending');
pendingDb.database.prepare(`INSERT INTO telegram_pet_lifecycle_events_by_pet
  (event_id, pet_id, telegram_id, event_key, action, payload_json, progress_delta)
  VALUES ('pending-event', 'pet:pending-player:test:1', 'pending-player', 'pending-care', 'incubate_warm', '{}', 2)`).run();
const pendingRetry = await incubateMoonEgg(pendingDb, 'pending-player', 'warm', 'pending-care');
assert.equal(pendingRetry.accepted, false, 'a reserved but unapplied lifecycle event must not be reported as an accepted duplicate');
assert.equal(pendingRetry.reason, 'incubation_conflict');

const recoveryDb = new D1();
recoveryDb.database.exec(`
  CREATE TABLE telegram_pet_profiles (telegram_id TEXT PRIMARY KEY, species TEXT NOT NULL DEFAULT '', stage TEXT DEFAULT 'egg', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE telegram_pet_evolutions (telegram_id TEXT, stage INTEGER);
  CREATE TABLE telegram_pet_evolutions_by_pet (pet_id TEXT, telegram_id TEXT, evolution_id TEXT, stage INTEGER);
  CREATE TABLE telegram_pet_memories (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, exploration_actions INTEGER DEFAULT 0, total_runs INTEGER DEFAULT 0,
    combat_actions INTEGER DEFAULT 0, total_bosses_defeated INTEGER DEFAULT 0, care_actions INTEGER DEFAULT 0, event_actions INTEGER DEFAULT 0,
    adventure_actions INTEGER DEFAULT 0);
  CREATE TABLE telegram_pet_personality_traits (pet_id TEXT, telegram_id TEXT, season_key TEXT, trait_id TEXT, unlocked_at TEXT);
`);
recoveryDb.database.exec(await (await import('node:fs/promises')).readFile(new URL('../workers/moonboys-api/migrations/053_telegram_pet_species_lifecycle.sql', import.meta.url), 'utf8'));
recoveryDb.database.prepare('INSERT INTO telegram_pet_profiles (telegram_id) VALUES (?)').run('recovery-player');
provisionActivePet(recoveryDb.database, 'recovery-player');
recoveryDb.database.prepare('DELETE FROM telegram_pet_lifecycle_by_pet WHERE telegram_id=?').run('recovery-player');
await createMoonEggLifecycle(recoveryDb, 'recovery-player', 'adopt:recovery');
const crossActionReplay = await incubateMoonEgg(recoveryDb, 'recovery-player', 'warm', 'adopt:recovery');
assert.equal(crossActionReplay.accepted, false, 'an egg-creation receipt cannot be recovered as an incubation');
assert.equal(crossActionReplay.reason, 'incubation_conflict');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_growth_marks WHERE evidence_key='incubation:adopt:recovery'").get().count, 0,
  'a receipt for a different lifecycle action must not mint an incubation Growth Mark');

recoveryDb.beforeAll = (sql) => {
  if (/FROM telegram_pet_lifecycle_events_by_pet[\s\S]*WHERE telegram_id=\? AND event_key=\?/i.test(sql)) throw new Error('injected_lifecycle_receipt_read_failure');
};
await assert.rejects(
  incubateMoonEgg(recoveryDb, 'recovery-player', 'warm', 'recovery:receipt-read'),
  /injected_lifecycle_receipt_read_failure/,
  'a failed lifecycle receipt read must not be converted into a missing receipt',
);
recoveryDb.beforeAll = null;
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE event_key='recovery:receipt-read'").get().count, 0,
  'receipt read outages must not create a second lifecycle action');
recoveryDb.beforeAll = (sql) => (/FROM telegram_pet_lifecycle_events_by_pet[\s\S]*WHERE telegram_id=\? AND event_key=\?/i.test(sql)
  ? { success: false, error: 'injected_resolved_lifecycle_receipt_read_failure' }
  : undefined);
await assert.rejects(
  incubateMoonEgg(recoveryDb, 'recovery-player', 'warm', 'recovery:resolved-receipt-read'),
  /pet_state_read_unavailable/,
  'a resolved D1 failure must not be treated as an empty lifecycle receipt result',
);
recoveryDb.beforeAll = null;
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE event_key='recovery:resolved-receipt-read'").get().count, 0);

// These driver-result failures do not execute SQL. They prove fail-closed
// acknowledgement/follow-up behavior, separately from the real SQL rollback
// test below. Earlier statements' changes metadata is not commit authority.
const batchFailures = [
  ...[0, 1, 2, 3].map(index => [`statement-${index + 1}`, () => Array.from({ length: 4 }, (_, position) =>
    position === index ? { success: false, error: 'injected_resolved_care_failure', meta: { changes: 1 } }
      : { success: true, meta: { changes: 1 } })]),
  ['missing-result', () => Array.from({ length: 3 }, () => ({ meta: { changes: 1 } }))],
  ['extra-result', () => Array.from({ length: 5 }, () => ({ meta: { changes: 1 } }))],
  ['missing-changes', () => [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { success: true }]],
];
for (const [failure, failedResults] of batchFailures) {
  const before = {
    lifecycle: recoveryDb.database.prepare('SELECT * FROM telegram_pet_lifecycle_by_pet').all(),
    events: recoveryDb.database.prepare('SELECT * FROM telegram_pet_lifecycle_events_by_pet').all(),
    marks: recoveryDb.database.prepare('SELECT * FROM telegram_pet_growth_marks').all(),
  };
  let injected = false, followUps = 0;
  const observeFollowUp = () => { if (injected) followUps += 1; };
  recoveryDb.beforeFirst = observeFollowUp;
  recoveryDb.beforeAll = observeFollowUp;
  recoveryDb.beforeRun = observeFollowUp;
  recoveryDb.beforeBatch = statements => {
    if (injected) { followUps += 1; return; }
    if (statements.length !== 4 || !statements[0].args.includes('incubate_warm')) return;
    injected = true;
    return failedResults();
  };
  await assert.rejects(
    incubateMoonEgg(recoveryDb, 'recovery-player', 'warm', `recovery:care-batch:${failure}`, new Date('2026-08-02T12:00:00Z')),
    /pet_state_write_unavailable/,
    `${failure} cannot acknowledge care or continue Growth Mark settlement`,
  );
  assert.equal(injected, true, `${failure} must reach the real four-statement care batch`);
  assert.equal(followUps, 0, `${failure} must stop before projection, settlement or acknowledgement`);
  assert.deepEqual({
    lifecycle: recoveryDb.database.prepare('SELECT * FROM telegram_pet_lifecycle_by_pet').all(),
    events: recoveryDb.database.prepare('SELECT * FROM telegram_pet_lifecycle_events_by_pet').all(),
    marks: recoveryDb.database.prepare('SELECT * FROM telegram_pet_growth_marks').all(),
  }, before, `${failure} driver injection performs no SQL writes`);
  recoveryDb.beforeFirst = null; recoveryDb.beforeAll = null; recoveryDb.beforeRun = null; recoveryDb.beforeBatch = null;
}

let failGrowthMarkOnce = true;
recoveryDb.beforeRun = (sql) => {
  if (failGrowthMarkOnce && /INSERT OR IGNORE INTO telegram_pet_growth_marks/i.test(sql)) {
    failGrowthMarkOnce = false;
    throw new Error('injected_growth_mark_write_failure');
  }
};
await assert.rejects(
  incubateMoonEgg(recoveryDb, 'recovery-player', 'warm', 'recovery:growth-mark', new Date('2026-08-02T12:00:00Z')),
  /injected_growth_mark_write_failure/,
  'a Growth Mark failure rolls back the care transaction and remains visible to the caller',
);
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE event_key='recovery:growth-mark'").get().count, 0,
  'the lifecycle action cannot commit without its earned daily Mark');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_growth_marks WHERE evidence_key='incubation:recovery:growth-mark'").get().count, 0);
recoveryDb.beforeRun = null;
const recoveredGrowthMark = await incubateMoonEgg(recoveryDb, 'recovery-player', 'warm', 'recovery:growth-mark', new Date('2026-08-02T12:00:00Z'));
assert.equal(recoveredGrowthMark.accepted, true, 'retrying the rolled-back lifecycle key commits care and its Mark together');
assert.equal(Boolean(recoveredGrowthMark.duplicate), false);
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_growth_marks WHERE evidence_key='incubation:recovery:growth-mark'").get().count, 1,
  'Growth Mark recovery is idempotent and creates exactly one authoritative mark');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE event_key='recovery:growth-mark'").get().count, 1,
  'Growth Mark recovery never repeats lifecycle progress');

recoveryDb.database.prepare("DELETE FROM telegram_pet_growth_marks WHERE evidence_key='incubation:recovery:growth-mark'").run();
recoveryDb.database.prepare(`INSERT INTO telegram_pet_instances
  (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:recovery-player:test:2', 'recovery-player', 'test', 2)`).run();
recoveryDb.database.prepare(`INSERT INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number) VALUES ('pet:recovery-player:test:2', 'recovery-player', 'test', 2)`).run();
recoveryDb.database.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet
  (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
  VALUES ('pet:recovery-player:test:2', 'recovery-player', 'recovery-player-b', 'egg', '{}', '[]')`).run();
recoveryDb.database.prepare(`UPDATE telegram_pet_active_slots
  SET pet_id='pet:recovery-player:test:2' WHERE telegram_id='recovery-player'`).run();
const switchedPetRecovery = await incubateMoonEgg(
  recoveryDb, 'recovery-player', 'warm', 'recovery:growth-mark', new Date('2026-08-03T12:00:00Z'),
);
assert.equal(switchedPetRecovery.duplicate, true, 'a replay after pet switching resolves the original lifecycle receipt');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_growth_marks WHERE pet_id='pet:recovery-player:test:1' AND evidence_key='incubation:recovery:growth-mark'").get().count, 1,
  'post-switch recovery settles the original pet Growth Mark');
assert.equal(recoveryDb.database.prepare("SELECT earned_day FROM telegram_pet_growth_marks WHERE pet_id='pet:recovery-player:test:1' AND evidence_key='incubation:recovery:growth-mark'").get().earned_day, '2026-08-02',
  'post-switch recovery preserves the original action day instead of using the retry day');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id='pet:recovery-player:test:2' AND event_key='recovery:growth-mark'").get().count, 0,
  'post-switch recovery never applies the original action key to the newly active egg');
recoveryDb.database.prepare(`UPDATE telegram_pet_active_slots
  SET pet_id='pet:recovery-player:test:1' WHERE telegram_id='recovery-player'`).run();

recoveryDb.database.prepare("UPDATE telegram_pet_lifecycle_by_pet SET created_at=datetime('now','-14 days') WHERE telegram_id='recovery-player'").run();
recoveryDb.beforeFirst = (sql) => {
  if (/FROM telegram_pet_lifecycle_events_by_pet[\s\S]*action='hatch'/i.test(sql)) throw new Error('injected_hatch_receipt_read_failure');
};
await assert.rejects(hatchMoonpet(recoveryDb, 'recovery-player', 'recovery:hatch'), /injected_hatch_receipt_read_failure/,
  'a failed hatch receipt read must not be converted into a new hatch');
recoveryDb.beforeFirst = null;
assert.equal(recoveryDb.database.prepare("SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE telegram_id='recovery-player'").get().phase, 'egg');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE event_key='recovery:hatch'").get().count, 0);

recoveryDb.database.prepare(`UPDATE telegram_pet_lifecycle_by_pet
  SET phase='adult', species_id='neon_raccoon', rare_route_index=0 WHERE telegram_id='recovery-player'`).run();
assert.equal((await incubateMoonEgg(
  recoveryDb, 'recovery-player', 'warm', 'recovery:growth-mark', new Date('2026-08-02T12:00:00Z'),
)).duplicate, true, 'a committed incubation receipt remains recoverable after the source pet hatches');
recoveryDb.database.prepare(`INSERT INTO telegram_pet_memories
  (pet_id, telegram_id, season_key, exploration_actions, total_runs)
  VALUES ('pet:recovery-player:test:1', 'recovery-player', 'test', 30, 10)`).run();
for (const trait of ['explorer', 'curious']) recoveryDb.database.prepare(`INSERT INTO telegram_pet_personality_traits
  (pet_id, telegram_id, season_key, trait_id, unlocked_at)
  VALUES ('pet:recovery-player:test:1', 'recovery-player', 'test', ?, CURRENT_TIMESTAMP)`).run(trait);
recoveryDb.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
  (pet_id, telegram_id, evolution_id, stage)
  VALUES ('pet:recovery-player:test:1', 'recovery-player', 'legendary_moon_guardian', 5)`).run();
recoveryDb.beforeFirst = (sql) => {
  if (/FROM telegram_pet_lifecycle_events_by_pet[\s\S]*action='rare_morph'/i.test(sql)) throw new Error('injected_rare_receipt_read_failure');
};
await assert.rejects(morphMoonpetRare(recoveryDb, 'recovery-player', 'recovery:rare'), /injected_rare_receipt_read_failure/,
  'a failed rare-morph receipt read must not be converted into a new morph');
recoveryDb.beforeFirst = null;
assert.equal(recoveryDb.database.prepare("SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE telegram_id='recovery-player'").get().phase, 'adult');
assert.equal(recoveryDb.database.prepare("SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet WHERE event_key='recovery:rare'").get().count, 0);

// Hatch and Rare Morph are five-statement identity transactions. One failed
// result cannot be masked by positive changes in its peers and acknowledged.
for (const action of ['hatch', 'rare_morph']) {
  recoveryDb.database.prepare('UPDATE telegram_pet_lifecycle_by_pet SET phase=? WHERE pet_id=?')
    .run(action === 'hatch' ? 'egg' : 'adult', 'pet:recovery-player:test:1');
  for (const [failure, badBatch] of [
    ...[0, 1, 2, 3, 4].map(index => [`failed-${index}`, () => Array.from({ length: 5 }, (_, position) => position === index
      ? { success: false, error: 'lifecycle_write_failed', meta: { changes: 1 } } : { meta: { changes: 1 } })]),
    ['short', () => Array.from({ length: 4 }, () => ({ meta: { changes: 1 } }))],
    ['missing-metadata', () => [{}, ...Array.from({ length: 4 }, () => ({ meta: { changes: 1 } }))]],
  ]) {
    const lifecycleBefore = recoveryDb.database.prepare('SELECT * FROM telegram_pet_lifecycle_by_pet').all();
    let injected = false, followUps = 0;
    recoveryDb.beforeFirst = () => { if (injected) followUps++; };
    recoveryDb.beforeAll = () => { if (injected) followUps++; };
    recoveryDb.beforeBatch = statements => {
      if (statements.length !== 5 || !statements[0].sql.includes(`'${action}'`)) return;
      injected = true;
      return badBatch();
    };
    const request = action === 'hatch' ? hatchMoonpet : morphMoonpetRare;
    await assert.rejects(request(recoveryDb, 'recovery-player', `integrity:${action}:${failure}`), /pet_state_write_unavailable/,
      'failed lifecycle transaction must reject before reporting or projecting a new identity');
    assert.equal(injected, true);
    assert.equal(followUps, 0, 'unverified identity writes cannot run post-commit projections');
    assert.deepEqual(recoveryDb.database.prepare('SELECT * FROM telegram_pet_lifecycle_by_pet').all(), lifecycleBefore);
    recoveryDb.beforeFirst = null; recoveryDb.beforeAll = null; recoveryDb.beforeBatch = null;
  }
}

// The legacy action API can commit A's evolution, then resolve its follow-up
// after another request selects B. The stage argument is only a stale hint.
for (const switchPoint of ['before-lifecycle-read', 'before-lifecycle-write']) {
  const switched = new D1();
  switched.database.exec(await (await import('node:fs/promises')).readFile(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  switched.database.exec(`INSERT INTO telegram_users (telegram_id) VALUES ('evolution-owner');
    INSERT INTO telegram_pet_profiles (telegram_id,stage,species) VALUES ('evolution-owner','young','neon_raccoon');`);
  for (const [petId, slot, stage] of [['evolved-a', 1, 2], ['young-b', 2, 1]]) {
    switched.database.prepare(`INSERT INTO telegram_pet_season_slots
      (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,'evolution-owner','2026-q3',?,'free')`).run(petId, slot);
    switched.database.prepare(`INSERT INTO telegram_pet_instances
      (pet_id,telegram_id,season_key,slot_number,stage,species,source_profile_updated_at) VALUES (?,'evolution-owner','2026-q3',?,'young','neon_raccoon','0001-01-01 00:00:00')`).run(petId, slot);
    switched.database.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet
      (pet_id,telegram_id,identity_seed,phase,species_id) VALUES (?,'evolution-owner',?,'young','neon_raccoon')`).run(petId, petId);
    switched.database.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
      (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,'evolution-owner',?,?,?)`)
      .run(petId, stage === 2 ? 'cyber_moonpet' : 'street_moonpet', stage, `saved:${petId}`);
  }
  switched.database.exec(`INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key)
    VALUES ('evolution-owner','evolved-a','2026-q3')`);
  let switchedOnce = false;
  const selectB = () => {
    switchedOnce = true;
    switched.database.exec(`UPDATE telegram_pet_active_slots SET pet_id='young-b' WHERE telegram_id='evolution-owner';
      UPDATE telegram_pet_profiles SET stage='young' WHERE telegram_id='evolution-owner'`);
  };
  if (switchPoint === 'before-lifecycle-read') switched.beforeFirst = sql => {
    if (!switchedOnce && sql.includes('SELECT l.*, s.season_key')) selectB();
  };
  else switched.beforeBatch = statements => {
    if (!switchedOnce && statements[0].sql.includes("SET phase='adult'")) selectB();
  };
  await syncMoonpetLifecycleStage(switched, 'evolution-owner', 2);
  assert.equal(switchedOnce, true);
  assert.equal(switched.database.prepare("SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id='young-b'").get().phase, 'young',
    'A saved Stage 2 follow-up cannot promote selected B with only Stage 1');
  assert.equal(switched.database.prepare("SELECT stage FROM telegram_pet_profiles WHERE telegram_id='evolution-owner'").get().stage, 'young',
    'A lifecycle write cannot overwrite the compatibility profile after B becomes selected');
  assert.equal(switched.database.prepare("SELECT stage FROM telegram_pet_instances WHERE pet_id='young-b'").get().stage, 'young');
  switched.beforeFirst = null; switched.beforeBatch = null;
  switched.database.exec("UPDATE telegram_pet_active_slots SET pet_id='evolved-a' WHERE telegram_id='evolution-owner'");
  await syncMoonpetLifecycleStage(switched, 'evolution-owner', 2);
  assert.equal(switched.database.prepare("SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id='evolved-a'").get().phase, 'adult',
    'The original pet can still finish its committed Stage 2 follow-up');
  switched.database.close();
}

console.log('telegram-pets-species-lifecycle.test.mjs passed');

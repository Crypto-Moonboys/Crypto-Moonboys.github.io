import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  listSanctuaryPetsPrivate,
  movePetToSanctuaryIfEligible,
  reconcileCompletedPetsToSanctuary,
} from '../workers/moonboys-api/pets/sanctuary.js';
import { finalizePetSeasonCompletionIfEligible } from '../workers/moonboys-api/pets/season-completion.js';

class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { const result = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: result.changes } }; }
}

class D1 {
  constructor(db) { this.db = db; this.beforeBatch = null; }
  prepare(sql) { return new Statement(this.db, sql); }
  async batch(statements) {
    if (this.beforeBatch) { const hook = this.beforeBatch; this.beforeBatch = null; hook(); }
    this.db.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE telegram_pet_profiles(telegram_id TEXT PRIMARY KEY,pet_name TEXT DEFAULT 'Moonpet',species TEXT DEFAULT '',stage TEXT DEFAULT 'egg',pet_xp INTEGER DEFAULT 0,level INTEGER DEFAULT 1,hunger INTEGER DEFAULT 25,happiness INTEGER DEFAULT 70,cleanliness INTEGER DEFAULT 70,energy INTEGER DEFAULT 70,health INTEGER DEFAULT 75,streak_days INTEGER DEFAULT 0,moon_gold INTEGER DEFAULT 0,moon_crystals INTEGER DEFAULT 0,style_tokens INTEGER DEFAULT 0,equipped_food TEXT,equipped_toy TEXT,equipped_outfit TEXT,equipped_armor TEXT,equipped_weapon TEXT,equipped_charm TEXT,last_active_day TEXT,last_decay_at TEXT,updated_at TEXT);
CREATE TABLE telegram_pet_season_slots(pet_id TEXT PRIMARY KEY,telegram_id TEXT,season_key TEXT,slot_number INTEGER,acquisition_type TEXT DEFAULT 'free',source_event_key TEXT,arcade_xp_spent INTEGER DEFAULT 0,status TEXT,created_at TEXT,updated_at TEXT,UNIQUE(pet_id,telegram_id,season_key),UNIQUE(telegram_id,season_key,slot_number));
CREATE TABLE telegram_pet_instances(pet_id TEXT PRIMARY KEY,telegram_id TEXT,season_key TEXT,slot_number INTEGER DEFAULT 1,pet_name TEXT,species TEXT,stage TEXT,equipped_food TEXT,equipped_toy TEXT,equipped_outfit TEXT,equipped_armor TEXT,equipped_weapon TEXT,equipped_charm TEXT,status TEXT,updated_at TEXT,created_at TEXT,level INTEGER NOT NULL DEFAULT 1,pet_xp INTEGER NOT NULL DEFAULT 0,hunger INTEGER NOT NULL DEFAULT 25,happiness INTEGER NOT NULL DEFAULT 70,cleanliness INTEGER NOT NULL DEFAULT 70,energy INTEGER NOT NULL DEFAULT 70,health INTEGER NOT NULL DEFAULT 75,streak_days INTEGER NOT NULL DEFAULT 0,moon_gold INTEGER NOT NULL DEFAULT 0,moon_crystals INTEGER NOT NULL DEFAULT 0,style_tokens INTEGER NOT NULL DEFAULT 0,last_active_day TEXT,last_decay_at TEXT,source_profile_updated_at TEXT);
CREATE TABLE telegram_pet_active_slots(telegram_id TEXT PRIMARY KEY,pet_id TEXT,season_key TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE telegram_pet_season_completions(pet_id TEXT,telegram_id TEXT,season_key TEXT,completed_at TEXT,legendary_evolution_id TEXT,growth_marks_earned INTEGER NOT NULL DEFAULT 0,weekly_crests_earned INTEGER NOT NULL DEFAULT 0,authority_version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(pet_id,season_key));
CREATE TABLE telegram_pet_lifecycle_by_pet(pet_id TEXT PRIMARY KEY,telegram_id TEXT,species_id TEXT,palette_id TEXT,rare_morph_id TEXT,lifecycle_version INTEGER DEFAULT 1,identity_seed TEXT DEFAULT '',phase TEXT DEFAULT 'egg',marking_id TEXT,eye_style TEXT,temperament TEXT,innate_traits_json TEXT DEFAULT '[]',incubation_progress INTEGER DEFAULT 0,incubation_json TEXT DEFAULT '{}',created_at TEXT,updated_at TEXT);
CREATE TABLE telegram_pet_evolutions_by_pet(pet_id TEXT,telegram_id TEXT,evolution_id TEXT,stage INTEGER,cosmetic_unlocks TEXT,achievement_unlocks TEXT,unlocked_at TEXT);
CREATE TABLE telegram_pet_personality_traits(pet_id TEXT,telegram_id TEXT,season_key TEXT,trait_id TEXT,progress INTEGER,unlocked_at TEXT);
CREATE TABLE telegram_pet_memories(pet_id TEXT PRIMARY KEY,telegram_id TEXT,season_key TEXT,milestones TEXT,updated_at TEXT);
CREATE TABLE telegram_pet_inventory(telegram_id TEXT,asset_type TEXT,asset_key TEXT,quantity INTEGER);
CREATE TABLE telegram_pet_equipment_progression(telegram_id TEXT,item_key TEXT,slot TEXT,item_level INTEGER,mastery_tier INTEGER);
CREATE TABLE telegram_pet_progression_state(telegram_id TEXT PRIMARY KEY,traits_json TEXT);
CREATE TABLE telegram_pet_growth_marks(pet_id TEXT,telegram_id TEXT,season_key TEXT,earned_day TEXT);
CREATE TABLE telegram_pet_weekly_crests(pet_id TEXT,telegram_id TEXT,season_key TEXT,season_week INTEGER,qualification_week INTEGER);
CREATE TABLE telegram_pet_boss_victories(telegram_id TEXT,boss_id TEXT,victories INTEGER);
CREATE TABLE telegram_pet_material_balances(telegram_id TEXT,material_key TEXT,quantity INTEGER);
CREATE TABLE telegram_pet_relics(telegram_id TEXT,relic_id TEXT);
CREATE TABLE telegram_pet_runs(run_id TEXT PRIMARY KEY,telegram_id TEXT,status TEXT);
CREATE TABLE telegram_pet_activity_sessions(id TEXT PRIMARY KEY,telegram_id TEXT,status TEXT,metadata TEXT);
CREATE TABLE telegram_pet_arena_battles(battle_id TEXT PRIMARY KEY,player1_telegram_id TEXT,player2_telegram_id TEXT,status TEXT);
CREATE TABLE telegram_pet_kaiju_matches(match_id TEXT PRIMARY KEY,player1_telegram_id TEXT,player2_telegram_id TEXT,status TEXT);`);

const sanctuaryMigration = await readFile(new URL('../workers/moonboys-api/migrations/059_telegram_pet_sanctuary.sql', import.meta.url), 'utf8');
assert.doesNotMatch(sanctuaryMigration, /CREATE\s+TRIGGER|\bBEGIN\b|\bEND\b/i, 'D1 migration contains no trigger programs');
assert.equal((sanctuaryMigration.match(/CREATE\s+TABLE/gi) || []).length, 1, 'migration 059 contains one table statement');
assert.doesNotMatch(sanctuaryMigration, /CREATE\s+(?:UNIQUE\s+)?INDEX|\bCHECK\s*\(|\bFOREIGN\s+KEY\b/i, 'migration 059 contains only D1-safe basic table DDL');
sqlite.exec(sanctuaryMigration);

const sanctuaryIndexMigration = await readFile(new URL('../workers/moonboys-api/migrations/060_telegram_pet_sanctuary_indexes.sql', import.meta.url), 'utf8');
assert.doesNotMatch(sanctuaryIndexMigration, /CREATE\s+TRIGGER|\bBEGIN\b|\bEND\b/i, 'index migration contains no compound statements');
sqlite.exec(sanctuaryIndexMigration);

const sanctuaryIndexes = sqlite.prepare(`PRAGMA index_list('telegram_pet_sanctuary')`).all();
assert.ok(sanctuaryIndexes.some((index) => index.name === 'idx_pet_sanctuary_owner_completed'), 'owner/completion index is retained');
assert.ok(sanctuaryIndexes.some((index) => index.name === 'idx_pet_sanctuary_completion_link'), 'completion linkage index is retained');
assert.ok(sanctuaryIndexes.some((index) => index.name === 'idx_pet_sanctuary_pet' && index.unique === 1), 'pet uniqueness is retained');

const db = new D1(sqlite);
const completionSource = await readFile(new URL('../workers/moonboys-api/pets/season-completion.js', import.meta.url), 'utf8');
assert.doesNotMatch(
  completionSource,
  /finalizePetSeasonCompletionIfEligible[\s\S]*movePetToSanctuaryIfEligible\(db,/,
  'authoritative completion is decoupled from immediate Sanctuary transition',
);
assert.match(completionSource, /sanctuary_transition:\s*'season_settlement'/, 'completion advertises season-settlement Sanctuary policy');

sqlite.exec(`INSERT INTO telegram_pet_profiles(telegram_id,pet_name,moon_gold,moon_crystals,style_tokens) VALUES('owner','Nova',888,77,66),('attacker','Bad',0,0,0),('auto-owner','Auto',0,0,0),('reconcile-owner','Reconcile',0,0,0),('settlement-owner','Settlement',0,0,0),('year-end-owner','Year End',0,0,0);
INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,status,created_at,updated_at) VALUES
 ('complete','owner','s1',1,'active','2026-01-01',NULL),('replacement','owner','s1',2,'active','2026-01-01',NULL),('legendary-only','owner','s1',3,'active','2026-01-01',NULL),
 ('auto','auto-owner','s2',1,'active','2026-01-01',NULL),('auto-b','auto-owner','s2',2,'active','2026-01-01',NULL),
 ('reconcile','reconcile-owner','pet-s2026-003',1,'active','2026-01-01',NULL),('reconcile-b','reconcile-owner','pet-s2026-003',2,'active','2026-01-01',NULL),
 ('settlement','settlement-owner','pet-s2026-003',1,'active','2026-01-01',NULL),('settlement-b','settlement-owner','pet-s2026-003',2,'active','2026-01-01',NULL),
 ('year-end','year-end-owner','pet-s2026-004',1,'active','2026-12-27',NULL);
INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,pet_name,species,stage,status,level,pet_xp,equipped_outfit,equipped_weapon,moon_gold,moon_crystals,style_tokens) VALUES
 ('complete','owner','s1',1,'Nova','fox','legendary','active',50,5000,'crown','laser',111,11,1),('replacement','owner','s1',2,'Other','fox','egg','active',1,0,NULL,NULL,7,2,1),('legendary-only','owner','s1',3,'Legend','fox','legendary','active',50,5000,NULL,NULL,0,0,0),
 ('auto','auto-owner','s2',1,'Auto','fox','legendary','active',50,5000,NULL,NULL,0,0,0),('auto-b','auto-owner','s2',2,'Auto B','fox','egg','active',1,0,NULL,NULL,0,0,0),
 ('reconcile','reconcile-owner','pet-s2026-003',1,'Reconcile','fox','legendary','active',50,5000,NULL,NULL,0,0,0),('reconcile-b','reconcile-owner','pet-s2026-003',2,'Reconcile B','fox','egg','active',1,0,NULL,NULL,0,0,0),
 ('settlement','settlement-owner','pet-s2026-003',1,'Settlement','fox','legendary','active',50,5000,NULL,NULL,0,0,0),('settlement-b','settlement-owner','pet-s2026-003',2,'Settlement B','fox','egg','active',1,0,NULL,NULL,0,0,0),
 ('year-end','year-end-owner','pet-s2026-004',1,'Year End','fox','legendary','active',50,5000,NULL,NULL,0,0,0);
INSERT INTO telegram_pet_active_slots(telegram_id,pet_id,season_key) VALUES('owner','complete','s1'),('auto-owner','auto','s2'),('reconcile-owner','reconcile','pet-s2026-003'),('settlement-owner','settlement','pet-s2026-003'),('year-end-owner','year-end','pet-s2026-004');
INSERT INTO telegram_pet_season_completions(pet_id,telegram_id,season_key,completed_at,legendary_evolution_id,growth_marks_earned,weekly_crests_earned,authority_version) VALUES
 ('complete','owner','s1','2026-03-31','legendary_moon_guardian',60,10,2),('reconcile','reconcile-owner','pet-s2026-003','2026-06-30','legendary_moon_guardian',60,10,2),('settlement','settlement-owner','pet-s2026-003','2026-06-30','legendary_moon_guardian',60,10,2),('year-end','year-end-owner','pet-s2026-004','2026-12-31','legendary_moon_guardian',60,10,2);
INSERT INTO telegram_pet_lifecycle_by_pet(pet_id,telegram_id,species_id,palette_id,rare_morph_id,created_at) VALUES
 ('complete','owner','lunar_fox','neon','neon_fox','2026-01-01'),('auto','auto-owner','lunar_fox','neon',NULL,'2026-01-01'),('reconcile','reconcile-owner','lunar_fox','neon',NULL,'2026-01-01'),('settlement','settlement-owner','lunar_fox','neon',NULL,'2026-01-01'),('year-end','year-end-owner','lunar_fox','neon',NULL,'2026-12-27');
INSERT INTO telegram_pet_evolutions_by_pet VALUES
 ('auto','auto-owner','moon_egg',0,'[]','[]','2026-01-01'),('auto','auto-owner','street_moonpet',1,'[]','[]','2026-01-02'),('auto','auto-owner','cyber_moonpet',2,'[]','[]','2026-01-03'),('auto','auto-owner','elite_moonpet',3,'[]','[]','2026-01-04'),('auto','auto-owner','moon_guardian',4,'[]','[]','2026-01-05'),('auto','auto-owner','legendary_moon_guardian',5,'[]','[]','2026-03-20');
INSERT INTO telegram_pet_personality_traits VALUES('complete','owner','s1','brave',100,'2026-02-01');
INSERT INTO telegram_pet_memories VALUES('complete','owner','s1','["first_boss"]',NULL);
INSERT INTO telegram_pet_inventory VALUES('owner','cosmetic','crown',1);
INSERT INTO telegram_pet_equipment_progression VALUES('owner','laser','weapon',5,2);
INSERT INTO telegram_pet_progression_state VALUES('owner','{"brave":100}');
WITH RECURSIVE days(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM days WHERE value<60)
INSERT INTO telegram_pet_growth_marks SELECT 'auto','auto-owner','s2',date('2026-01-01','+' || (value-1) || ' days') FROM days;
INSERT INTO telegram_pet_weekly_crests SELECT 'auto','auto-owner','s2',value,value FROM json_each('[1,2,3,4,5,6,7,8,9,10]');`);

const input = { pet_id: 'complete', telegram_id: 'owner', season_key: 's1' };
assert.equal((await movePetToSanctuaryIfEligible(db, { ...input, telegram_id: 'attacker' })).reason, 'pet_not_owned', 'ownership is authoritative');
assert.equal((await movePetToSanctuaryIfEligible(db, { pet_id: 'legendary-only', telegram_id: 'owner', season_key: 's1' })).reason, 'season_not_complete', 'Legendary alone is rejected');

const autoState = await finalizePetSeasonCompletionIfEligible(db, 'auto', 's2', { telegram_id: 'auto-owner', now: '2026-03-31T00:00:00Z' });
assert.equal(autoState.season_complete, true, 'completion authority still records season completion');
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_sanctuary WHERE pet_id='auto'`).get().count, 0, 'completion does not immediately enter Sanctuary');
assert.equal(sqlite.prepare(`SELECT status FROM telegram_pet_instances WHERE pet_id='auto'`).get().status, 'active', 'completion leaves active seasonal pet state intact');
assert.equal(sqlite.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='auto-owner'`).get().pet_id, 'auto', 'completion leaves active pointer intact');

const move = await movePetToSanctuaryIfEligible(db, input);
assert.equal(move.accepted, true, 'explicit Sanctuary movement accepts completed pet');
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_sanctuary WHERE pet_id='complete'`).get().count, 1, 'explicit move writes one Sanctuary resident');
assert.equal(sqlite.prepare(`SELECT status FROM telegram_pet_instances WHERE pet_id='complete'`).get().status, 'archived', 'explicit move archives seasonal pet');
assert.equal(sqlite.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='owner'`).get().pet_id, 'replacement', 'explicit move assigns another active seasonal pet');
assert.equal(sqlite.prepare(`SELECT pet_name FROM telegram_pet_profiles WHERE telegram_id='owner'`).get().pet_name, 'Other', 'replacement instance is mirrored to the profile');
assert.deepEqual(
  { ...sqlite.prepare(`SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id='owner'`).get() },
  { moon_gold: 888, moon_crystals: 77, style_tokens: 66 },
  'Sanctuary archival/replacement mirroring must preserve account wallet authority independently from pet instance wallet fields',
);

const snapshotBefore = (await listSanctuaryPetsPrivate(db, 'owner'))[0];
sqlite.prepare(`UPDATE telegram_pet_instances SET equipped_outfit='changed' WHERE pet_id='complete'`).run();
assert.equal(
  (await listSanctuaryPetsPrivate(db, 'owner'))[0].cosmetics.equipment.equipped_outfit,
  snapshotBefore.cosmetics.equipment.equipped_outfit,
  'Sanctuary snapshot is immutable when live state changes',
);

assert.equal((await movePetToSanctuaryIfEligible(db, input)).duplicate, true, 'duplicate retry succeeds idempotently');
assert.deepEqual(await movePetToSanctuaryIfEligible(db, { ...input, operation: 'update' }), { accepted: false, reason: 'sanctuary_snapshot_is_immutable' }, 'Sanctuary updates are rejected');
assert.deepEqual(await movePetToSanctuaryIfEligible(db, { ...input, operation: 'delete' }), { accepted: false, reason: 'sanctuary_history_is_append_only' }, 'Sanctuary deletes are rejected');
sqlite.prepare(`INSERT INTO telegram_pet_season_completions
  (pet_id,telegram_id,season_key,completed_at,legendary_evolution_id,growth_marks_earned,weekly_crests_earned,authority_version)
  VALUES('replacement','owner','s1','2026-03-31','legendary_moon_guardian',60,10,2)`).run();
sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet(pet_id,telegram_id,species_id,palette_id,created_at)
  VALUES('replacement','owner','lunar_fox','plain','2026-01-01')`).run();
const replacementMove = await movePetToSanctuaryIfEligible(db, { pet_id: 'replacement', telegram_id: 'owner', season_key: 's1' });
assert.equal(replacementMove.accepted, true, 'Pet B can enter Sanctuary without inheriting Pet A identity rows');
const replacementSnapshot = (await listSanctuaryPetsPrivate(db, 'owner')).find((entry) => entry.pet_id === 'replacement');
assert.deepEqual(replacementSnapshot.traits, [], 'Sanctuary snapshot for Pet B must not include Pet A personality traits');
assert.deepEqual(replacementSnapshot.memories, {}, 'Sanctuary snapshot for Pet B must not include Pet A memories');

sqlite.prepare(`INSERT INTO telegram_pet_activity_sessions(id,telegram_id,status) VALUES('reconcile-activity','reconcile-owner','active')`).run();
await reconcileCompletedPetsToSanctuary(db, 'reconcile-owner', { season_settlement: true });
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_sanctuary WHERE pet_id='reconcile'`).get().count, 0, 'pending activity blocks season-settlement reconciliation');
sqlite.prepare(`DELETE FROM telegram_pet_activity_sessions WHERE id='reconcile-activity'`).run();
await reconcileCompletedPetsToSanctuary(db, 'reconcile-owner', { now: '2026-08-17T00:00:00Z' });
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_sanctuary WHERE pet_id='reconcile'`).get().count, 0, 'ordinary Worker reconciliation skips the active slot-authority current season');
const settlementTransitions = await reconcileCompletedPetsToSanctuary(db, 'settlement-owner', { season_settlement: true, now: '2026-08-17T00:00:00Z' });
assert.equal(settlementTransitions[0]?.accepted, true, 'explicit season-settlement reconciliation moves an eligible completed current-season pet');
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_sanctuary WHERE pet_id='settlement'`).get().count, 1, 'valid season-settlement reconciliation writes the Sanctuary resident');
assert.equal(sqlite.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='settlement-owner'`).get().pet_id, 'settlement-b', 'season-settlement reconciliation assigns the replacement active pet');
await reconcileCompletedPetsToSanctuary(db, 'reconcile-owner', { now: '2026-10-01T00:00:00Z' });
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_sanctuary WHERE pet_id='reconcile'`).get().count, 1, 'ordinary Worker reconciliation can move completed past-season pets after slot-season rollover');
assert.equal(sqlite.prepare(`SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='reconcile-owner'`).get().pet_id, 'reconcile-b', 'reconciliation assigns replacement pet');
await reconcileCompletedPetsToSanctuary(db, 'year-end-owner', { now: '2026-12-31T00:00:00Z' });
assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM telegram_pet_sanctuary WHERE pet_id='year-end'`).get().count, 0, 'ordinary Worker reconciliation treats year-end pet-s2026-004 as the current slot-authority season, not a past 90-day segment');

console.log('telegram pets sanctuary tests passed');

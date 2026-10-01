import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
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
assert.doesNotMatch(completionSource, /sanctuary_eligible|sanctuary_transition|movePetToSanctuaryIfEligible/, 'retired Sanctuary gameplay is absent from completion');

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

const autoState = await finalizePetSeasonCompletionIfEligible(db, 'auto', 's2', { telegram_id: 'auto-owner', now: '2026-03-31T00:00:00Z' });
assert.equal(autoState.season_complete, true, 'completion is still recorded');
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM telegram_pet_sanctuary WHERE pet_id='auto'").get().count, 0);
assert.equal(sqlite.prepare("SELECT status FROM telegram_pet_instances WHERE pet_id='auto'").get().status, 'active');
assert.equal(sqlite.prepare("SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id='auto-owner'").get().pet_id, 'auto');

// Immutable historical snapshots are readable after recovery; no new retirement API remains.
const workerSource = await readFile(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
assert.doesNotMatch(workerSource, /movePetToSanctuaryIfEligible|reconcileCompletedPetsToSanctuary|reconcileSanctuaryBestEffort/);
function archive(petId, owner, seasonKey, { paid = false, completion = true, historyOwner = owner, historySeason = seasonKey, retired = false } = {}) {
  sqlite.prepare("UPDATE telegram_pet_season_slots SET status=?,acquisition_type=?,arcade_xp_spent=?,source_event_key=? WHERE pet_id=?").run(retired ? 'retired' : 'archived',paid ? 'arcade_xp' : 'free',paid ? 500 : 0,paid ? 'original-purchase' : 'profile_insert',petId);
  sqlite.prepare('UPDATE telegram_pet_instances SET status=? WHERE pet_id=?').run(retired ? 'retired' : 'archived',petId);
  if (completion) sqlite.prepare(`INSERT OR IGNORE INTO telegram_pet_season_completions VALUES (?,?,?,'2026-03-31','legendary_moon_guardian',60,10,2)`).run(petId,owner,seasonKey);
  sqlite.prepare(`INSERT INTO telegram_pet_sanctuary (sanctuary_id,pet_id,telegram_id,original_season_key,completed_at,species,stage,legendary_evolution_id,identity_snapshot_json,cosmetic_snapshot_json,trait_snapshot_json,memory_snapshot_json)
    VALUES (?,?,?,?,'2026-03-31','fox','legendary','legendary_moon_guardian','{"pet_name":"Nova"}','{"equipment":{"equipped_outfit":"crown"}}','["brave"]','{"first_boss":true}')`).run('history:'+petId,petId,historyOwner,historySeason);
}
archive('auto-b','auto-owner','s2');
sqlite.prepare("UPDATE telegram_pet_season_slots SET status='active' WHERE pet_id='auto-b'").run();
archive('reconcile-b','reconcile-owner','pet-s2026-003');
sqlite.prepare("UPDATE telegram_pet_instances SET status='active' WHERE pet_id='reconcile-b'").run();
archive('complete','owner','s1');
archive('replacement','owner','s1',{paid:true});
archive('legendary-only','owner','s1',{completion:false});
archive('reconcile','reconcile-owner','pet-s2026-003',{historyOwner:'attacker'});
archive('settlement','settlement-owner','pet-s2026-003',{historySeason:'wrong-season'});
archive('year-end','year-end-owner','pet-s2026-004',{retired:true});
const historiesBefore = sqlite.prepare('SELECT * FROM telegram_pet_sanctuary ORDER BY pet_id').all();
const profilesBefore = sqlite.prepare('SELECT * FROM telegram_pet_profiles ORDER BY telegram_id').all();
const instancesBefore = sqlite.prepare("SELECT * FROM telegram_pet_instances WHERE pet_id IN ('complete','replacement') ORDER BY pet_id").all();
const slotsBefore = sqlite.prepare("SELECT * FROM telegram_pet_season_slots WHERE pet_id IN ('complete','replacement') ORDER BY pet_id").all();
const pointersBefore = sqlite.prepare('SELECT * FROM telegram_pet_active_slots ORDER BY telegram_id').all();
const recovery = await readFile(new URL('../workers/moonboys-api/migrations/086_restore_permanent_pet_ownership.sql', import.meta.url), 'utf8');
sqlite.exec(recovery);
for (const table of ['telegram_pet_instances','telegram_pet_season_slots']) {
  for (const petId of ['complete','replacement','auto-b','reconcile-b']) assert.equal(sqlite.prepare(`SELECT status FROM ${table} WHERE pet_id=?`).get(petId).status,'active');
  for (const petId of ['legendary-only','reconcile','settlement']) assert.equal(sqlite.prepare(`SELECT status FROM ${table} WHERE pet_id=?`).get(petId).status,'archived','unproven archives are untouched');
  assert.equal(sqlite.prepare(`SELECT status FROM ${table} WHERE pet_id='year-end'`).get().status,'retired','explicitly retired pets stay retired');
}
const withoutStatus = rows => rows.map(({status,...row}) => ({...row}));
assert.deepEqual(withoutStatus(sqlite.prepare("SELECT * FROM telegram_pet_instances WHERE pet_id IN ('complete','replacement') ORDER BY pet_id").all()),withoutStatus(instancesBefore),'XP, stats, equipment, identity and timestamps survive recovery');
assert.deepEqual(withoutStatus(sqlite.prepare("SELECT * FROM telegram_pet_season_slots WHERE pet_id IN ('complete','replacement') ORDER BY pet_id").all()),withoutStatus(slotsBefore),'purchase costs, event keys and source tuples survive recovery');
assert.deepEqual(sqlite.prepare('SELECT * FROM telegram_pet_profiles ORDER BY telegram_id').all(),profilesBefore,'account balances are never replaced by pet balances');
assert.deepEqual(sqlite.prepare('SELECT * FROM telegram_pet_active_slots ORDER BY telegram_id').all(),pointersBefore,'recovery never redirects the active pet');
assert.deepEqual(sqlite.prepare('SELECT * FROM telegram_pet_sanctuary ORDER BY pet_id').all(),historiesBefore);
const savedSnapshot=sqlite.prepare("SELECT cosmetic_snapshot_json FROM telegram_pet_sanctuary WHERE pet_id='complete'").get();
assert.equal(JSON.parse(savedSnapshot.cosmetic_snapshot_json).equipment.equipped_outfit,'crown');
sqlite.prepare("UPDATE telegram_pet_instances SET equipped_outfit='changed' WHERE pet_id='complete'").run();
assert.deepEqual(sqlite.prepare("SELECT cosmetic_snapshot_json FROM telegram_pet_sanctuary WHERE pet_id='complete'").get(),savedSnapshot,'historical snapshots remain immutable');
const changes = sqlite.prepare('SELECT total_changes() AS n').get().n;
sqlite.exec(recovery);
assert.equal(sqlite.prepare('SELECT total_changes() AS n').get().n,changes,'ownership recovery is safe to retry');
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('telegram pets sanctuary history and safe recovery tests passed');

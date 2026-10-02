import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

import { claimPetSeasonalBossReward, processPetCraftRecipe, getPetEquipmentUpgradeQuote, processPetEquipmentUpgrade, processPetCosmeticUnlock } from '../workers/moonboys-api/pets/live-systems.js';
import { PET_COSMETIC_SINKS } from '../workers/moonboys-api/pets/economy-phase-3.js';
import { claimDailyCompletion, getSeasonFinales, processSeasonFinale, readDailyCompletion } from '../workers/moonboys-api/pets/completion-features.js';

const currentSeason = hooks.getPetSeasonInfo(new Date()).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { db.statementCount++; if (db.beforeFirst) { const reply = await db.beforeFirst(this); if (reply !== undefined) return reply; } return sql.prepare(this.query).get(...this.args) || null; }
    async all() { db.statementCount++; if (db.beforeAll) { const reply = await db.beforeAll(this); if (reply !== undefined) return reply; } return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      db.statementCount++;
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { statementCount: 0, beforeBatch: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
    for (const statement of statements) {
      if (/^\s*SELECT\b/i.test(statement.query)) {
        if (this.beforeFirst) { const reply = await this.beforeFirst(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
        if (this.beforeAll) { const reply = await this.beforeAll(statement); if (reply?.success === false) throw Error('pet_state_read_unavailable'); }
      } else if (this.beforeRun) await this.beforeRun(statement);
    }
    if (this.beforeBatch) await this.beforeBatch(statements);
    sql.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(s.exec()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Test player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
  sql.prepare("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')").run();
  function pet(id, season = currentSeason, xp = 200, slot = 1) {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id, owner, season, slot);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,?,?,100,'0001-01-01 00:00:00')").run(id, owner, season, slot, xp);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(id, owner, id);
  }
  pet('current-' + owner, currentSeason, 10000);
  sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000 WHERE telegram_id=?').run(owner);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, 'current-' + owner, currentSeason);
  sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=1000,moon_crystals=100,style_tokens=100 WHERE telegram_id=?').run(owner);
  const active = (id, season = currentSeason) => {
    sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?').run(id, season, owner);
    const p = sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(id);
    sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=?,equipped_food=?,level=? WHERE telegram_id=?').run(p.pet_xp, p.equipped_food, p.level, owner);
  };
  const act = body => dispatchRenderedPetAction(db,owner,{id:owner},body,'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, get };
}

for (const mode of ['core', 'full', 'missions']) for (const returnToOriginal of [false, true]) test(`${mode} state rejects an active-pet switch between profile and lifecycle reads${returnToOriginal ? ', including A to B to A' : ''}`, async () => {
  const f = fixture('source-switch-' + mode + (returnToOriginal ? '-aba' : ''));
  await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
  const original = await hooks.getPetProfile(f.db, f.owner);
  const replacementId = 'egg-' + f.owner;
  f.pet(replacementId, currentSeason, 0, 2);
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg',species_id=NULL WHERE pet_id=?").run(replacementId);
  const petStats = () => f.sql.prepare(`SELECT pet_id,pet_xp,level,health,hunger,happiness,cleanliness,energy
    FROM telegram_pet_instances WHERE telegram_id=? ORDER BY pet_id`).all(f.owner);
  const before = petStats();
  let switched = false, returned = false, finishInterleaving;
  const interleavingFinished = new Promise(resolve => { finishInterleaving = resolve; });
  const lifecycleRead = statement => statement.query.includes('SELECT l.*, s.season_key');
  const restoreOriginal = async () => {
    if (!returnToOriginal || !switched || returned) return;
    returned = true;
    const changed = await hooks.switchActivePetSeasonSlot(f.db, f.owner, original.pet_id);
    assert.equal(changed.accepted, true, JSON.stringify(changed));
  };
  f.db.beforeFirst = async statement => {
    if (!lifecycleRead(statement)) return;
    // Run the real switch after the projection has captured A, then allow the
    // lifecycle query to read B. No mock lifecycle or hand-built state is used.
    f.db.beforeFirst = null;
    const changed = await hooks.switchActivePetSeasonSlot(f.db, f.owner, replacementId);
    assert.equal(changed.accepted, true, JSON.stringify(changed));
    switched = true;
  };
  // Restore A after the real lifecycle read/batch completes. Without an atomic
  // read guard, an end-of-projection pointer check alone would miss this ABA.
  const readDb = !returnToOriginal ? f.db : {
    prepare(query) {
      const wrap = statement => ({
        query: statement.query, args: statement.args,
        bind(...args) { return wrap(statement.bind(...args)); },
        async first(...args) {
          try { return await statement.first(...args); }
          finally { if (lifecycleRead(statement)) { await restoreOriginal(); finishInterleaving(); } }
        },
        all() { return statement.all(); }, run() { return statement.run(); }, exec() { return statement.exec(); },
      });
      return wrap(f.db.prepare(query));
    },
    async batch(statements) {
      try { return await f.db.batch(statements); }
      finally { if (statements.some(lifecycleRead)) { await restoreOriginal(); finishInterleaving(); } }
    },
  };
  const projection = mode === 'core'
    ? hooks.buildPetMiniAppCoreState(readDb, f.owner, { prepared: true, petRaw: original })
    : hooks.buildPetMiniAppState(readDb, f.owner, 'fixture-token', mode === 'missions' ? { mode: 'missions' } : {});
  await assert.rejects(projection, /pet_state_source_changed/, 'A stats and B lifecycle must never publish as one save');
  // Another source-bound projection may detect B first. Wait for the actual
  // lifecycle transaction and restore before checking the interleaving result.
  if (returnToOriginal) await interleavingFinished;
  assert.equal(switched, true, 'the interleaving must reach the actual lifecycle read');
  assert.equal(returned, returnToOriginal);
  const selectedId = returnToOriginal ? original.pet_id : replacementId;
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner).pet_id, selectedId);
  assert.deepEqual(petStats(), before, 'projection rejection cannot rewrite either pet’s XP or needs');
  const restored = mode === 'core'
    ? await hooks.buildPetMiniAppCoreState(f.db, f.owner)
    : await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token', mode === 'missions' ? { mode: 'missions' } : {});
  assert.equal(restored.pet.pet_id, selectedId);
  assert.equal(restored.lifecycle.phase, returnToOriginal ? 'young' : 'egg');
  assert.equal(restored.season_slots.slots.find(slot => slot.active).pet_id, selectedId);
});

for (const mode of ['core', 'full', 'missions']) test(`${mode} state rejects a late switch at its final source check`, async () => {
  const f = fixture('late-source-switch-' + mode);
  await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
  const original = await hooks.getPetProfile(f.db, f.owner);
  const replacementId = 'egg-' + f.owner;
  f.pet(replacementId, currentSeason, 0, 2);
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg',species_id=NULL WHERE pet_id=?").run(replacementId);
  const project = () => mode === 'core'
    ? hooks.buildPetMiniAppCoreState(f.db, f.owner, { prepared: true, petRaw: original })
    : hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token', mode === 'missions' ? { mode: 'missions' } : {});
  const isActivePointer = statement => statement.query.includes('SELECT s.pet_id, s.telegram_id, s.season_key, s.slot_number, s.status, s.acquisition_type');
  // Calibrate the unchanged fixture's read path rather than coupling this race
  // to a hard-coded number of preparation or identity queries.
  let pointerReads = 0;
  f.db.beforeFirst = statement => { if (isActivePointer(statement)) pointerReads += 1; };
  const baseline = await project();
  assert.equal(baseline.pet.pet_id, original.pet_id);
  assert.ok(pointerReads > 0);
  const finalPointerRead = pointerReads;
  const petStats = () => f.sql.prepare(`SELECT pet_id,pet_xp,level,health,hunger,happiness,cleanliness,energy
    FROM telegram_pet_instances WHERE telegram_id=? ORDER BY pet_id`).all(f.owner);
  const before = petStats();
  pointerReads = 0;
  let switched = false;
  f.db.beforeFirst = async statement => {
    if (!isActivePointer(statement) || ++pointerReads !== finalPointerRead) return;
    f.db.beforeFirst = null;
    const changed = await hooks.switchActivePetSeasonSlot(f.db, f.owner, replacementId);
    assert.equal(changed.accepted, true, JSON.stringify(changed));
    switched = true;
  };
  await assert.rejects(project(), /pet_state_source_changed/);
  assert.equal(switched, true, 'the switch occurs after earlier source-sensitive reads have completed');
  assert.deepEqual(petStats(), before, 'a late projection conflict preserves both pets');
});

for (const mode of ['full', 'missions', 'guidance', 'achievements']) test(`${mode} binds achievements to captured A across an A to B to A switch`, async () => {
  const f = fixture('achievement-switch-' + mode);
  const original = await hooks.getPetProfile(f.db, f.owner);
  const otherId = 'other-' + f.owner;
  const otherSeason = hooks.getPetSeasonInfo(new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 15))).key;
  f.pet(otherId, otherSeason, 300, 2);
  f.sql.prepare(`INSERT INTO telegram_pet_achievements
    (pet_id,telegram_id,season_key,achievement_id,progress,target,unlocked_at)
    VALUES (?,?,?,'boss_breaker',7,1,'2001-01-01 00:00:00')`).run(otherId, f.owner, otherSeason);
  await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
  const before = f.sql.prepare('SELECT * FROM telegram_pet_achievements ORDER BY pet_id,achievement_id').all();
  const sourceRead = statement => /WHERE s.pet_id = \? AND s.telegram_id = \? AND s.season_key = \?/.test(statement.query)
    && statement.query.includes('SELECT s.pet_id, s.telegram_id, s.season_key, s.slot_number');
  let switched = false, returned = false;
  f.db.beforeFirst = async statement => {
    if (!sourceRead(statement)) return;
    f.db.beforeFirst = null;
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, otherId)).accepted, true);
    switched = true;
  };
  const restoreOriginal = async () => {
    if (!switched || returned) return;
    returned = true;
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db, f.owner, original.pet_id)).accepted, true);
  };
  const readDb = {
    prepare(query) {
      const wrap = statement => ({
        query: statement.query, args: statement.args,
        bind(...args) { return wrap(statement.bind(...args)); },
        async first(...args) {
          try { return await statement.first(...args); }
          finally { if (sourceRead(statement)) await restoreOriginal(); }
        },
        all() { return statement.all(); }, run() { return statement.run(); }, exec() { return statement.exec(); },
      });
      return wrap(f.db.prepare(query));
    },
    async batch(statements) {
      try { return await f.db.batch(statements); }
      finally { if (statements.some(sourceRead)) await restoreOriginal(); }
    },
  };
  const project = database => mode === 'guidance'
    ? hooks.buildPetGuidanceState(database, f.owner, original)
    : mode === 'achievements' ? hooks.syncPetAchievements(database, f.owner, true)
      : hooks.buildPetMiniAppState(database, f.owner, 'fixture-token', mode === 'missions' ? { mode } : {});
  await assert.rejects(project(readDb), /pet_state_source_changed/,
    'returning to A cannot hide the switch observed while loading its achievements');
  assert.equal(switched, true);
  assert.equal(returned, true);
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner).pet_id, original.pet_id);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_achievements ORDER BY pet_id,achievement_id').all(), before,
    'a rejected achievement projection preserves both pets’ saved achievements');
  const fresh = await project(f.db);
  const achievements = mode === 'achievements' ? fresh : mode === 'guidance' ? fresh.achievements : fresh.guidance.achievements;
  assert.ok(achievements.length);
  assert.ok(achievements.every(entry => entry.pet_id === original.pet_id && entry.season_key === original.season_key));
  assert.equal(achievements.find(entry => entry.achievement_id === 'boss_breaker').progress, 0,
    'B’s seven boss victories never appear in A’s refreshed state');
});

for (const field of ['pet_id', 'season_key']) test(`achievement projection rejects inconsistent ${field} provenance while A stays selected`, async () => {
  const f = fixture('achievement-provenance-' + field);
  const original = await hooks.getPetProfile(f.db, f.owner);
  await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
  const batch = f.db.batch.bind(f.db);
  f.db.batch = async statements => {
    const result = await batch(statements);
    const index = statements.findIndex(statement => /SELECT achievement_id, progress, target, unlocked_at/.test(statement.query));
    if (index >= 0) result[index].results[0][field] = 'wrong-source';
    return result;
  };
  await assert.rejects(hooks.buildPetGuidanceState(f.db, f.owner, original), /pet_state_source_changed/);
});

const targets = {
  inventory: /SELECT asset_key, quantity\s+FROM telegram_pet_inventory/,
  gear: /SELECT item_key, slot, item_level, item_xp, mastery_xp, mastery_tier\s+FROM telegram_pet_equipment_progression[\s\S]*ORDER BY slot/,
  materials: /SELECT material_key, quantity FROM telegram_pet_material_balances[\s\S]*ORDER BY material_key/,
  missions: /SELECT event_type, COUNT\(\*\) AS count\s+FROM telegram_pet_events/,
  daily_journey: /SELECT challenge_id, SUM\(progress_value\)/,
  daily_bonus: /SELECT \* FROM telegram_pet_daily_completion/,
  season_finale: /SELECT i.pet_id,i.season_key,i.slot_number,f.status/,
  story: /SELECT chain_key, step_index, completed_cycles/,
  raid: /SELECT season_key, boss_key, damage, defeated_at, reward_claimed_at/,
  cosmetics: /SELECT cosmetic_key, quantity, unlocked_at/,
  live_attempts: /SELECT system_key, action_key, period_key, status, payload_json, updated_at/,
  raid_rewards: /SELECT b.pet_id,b.season_key,b.boss_key/,
  cooldowns: /SELECT event_type, MAX\(created_at\) AS created_at/,
  special_care: /SELECT event_type, MAX\(created_at\) AS last_created_at/,
  economy_progress: /SELECT event_type, COUNT\(\*\) AS total/,
  economy_claims: /SELECT source, idempotency_key, pet_id, metadata, applied_rewards/,
  economy_items: /SELECT asset_key,quantity FROM telegram_pet_inventory/,
  economy_materials: /SELECT material_key,quantity FROM telegram_pet_material_balances/,
  achievements: /SELECT achievement_id, progress, target, unlocked_at/,
  season_claims: /SELECT idempotency_key, COALESCE\(awarded_at,created_at\)/,
  style_loadout: /SELECT s\.cosmetic_key FROM telegram_pet_style_loadouts/,
  contracts: /SELECT c\.contract_id,c\.pet_id,c\.season_key,c\.reward_day/,
  daily_run_recovery: /SELECT d\.run_id,d\.utc_day,recovery_state\.setting_value AS recovery_cursor FROM telegram_pet_daily_runs d/,
};
function durableSnapshot(f) {
  return ['telegram_pet_instances','telegram_pet_profiles','telegram_pet_equipment_progression','telegram_pet_material_balances','telegram_pet_inventory','telegram_pet_reward_claims','telegram_pet_events','telegram_pet_system_events','telegram_pet_daily_completion']
    .map(table => f.sql.prepare('SELECT * FROM '+table).all());
}
async function savedFixture(owner) {
  const f=fixture(owner);
  await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot,item_level) VALUES (?,'moon_kibble','food',4)").run(owner);
  f.sql.prepare("INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,'scrap_metal',30)").run(owner);
  f.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item','moon_snack',3)").run(owner);
  f.sql.prepare("INSERT INTO telegram_pet_relics (telegram_id,relic_id,rarity) VALUES (?,'alley_crown','rare')").run(owner);
  f.sql.prepare("UPDATE telegram_pet_daily_completion SET progress_bits=255 WHERE telegram_id=?").run(owner);
  return f;
}
for (const [name,query] of Object.entries(targets)) test(`resolved failed ${name} read cannot publish a normal Mini App snapshot`,async()=>{
  const f=await savedFixture('read-'+name);
  const baseline=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  const before=durableSnapshot(f);
  let hit=false;
  f.db.beforeAll=s=>{if(query.test(s.query)){hit=true;return {success:false,results:[],error:'injected_private_d1_details'};}};
  await assert.rejects(hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token'));
  assert.equal(hit,true,'fault must reach the target');
  f.db.beforeAll=null;
  const restored=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  for(const key of ['inventory','gear','materials'])assert.deepEqual(restored[key],baseline[key],key);
  assert.equal(restored.guidance.daily_completion.ready,true);
  assert.deepEqual(durableSnapshot(f),before,'read outages cannot consume inventory or rewards');
});
test('failed Daily Run summary read cannot publish not-started authority',async()=>{
  const f=await savedFixture('daily-summary-read');
  let hit=false;
  f.db.beforeFirst=s=>{
    if(s.query.includes('FROM telegram_pet_daily_runs d JOIN telegram_pet_runs r')){
      hit=true;
      throw Error('daily_summary_read_unavailable');
    }
  };
  await assert.rejects(hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token'),/daily_summary_read_unavailable/);
  assert.equal(hit,true);
});
const firstReadTargets = {
 active_pet_authority: /SELECT s\.pet_id, s\.telegram_id, s\.season_key, s\.slot_number,[\s\S]*FROM telegram_pet_active_slots a/,
 contract_authority: /SELECT p\.pet_id FROM telegram_pet_instances p JOIN telegram_pet_active_slots/,
 contract_stats: /SELECT COALESCE\(MAX\(sequence\),0\)\+1 AS next_sequence[\s\S]*FROM telegram_pet_contracts/,
 daily_summary: /SELECT d\.run_id, d\.pet_id, r\.status, r\.current_room, r\.score[\s\S]*FROM telegram_pet_daily_runs d/,
 live_pet_authority: /SELECT 1 AS ok FROM telegram_pet_instances WHERE pet_id=/,
 live_progression: /SELECT \* FROM telegram_pet_live_progression_state/,
 faction: /SELECT faction FROM blocktopia_progression/,
 economy_pet_authority: /SELECT p\.status,l\.phase FROM telegram_pet_instances p JOIN telegram_pet_lifecycle_by_pet/,
 weekly_boss_progress: /SELECT boss_id, attempts, damage, defeated_at, reward_claimed_at FROM telegram_pet_weekly_boss_progress/,
 weekly_boss_attempt: /SELECT action, damage, event_key FROM telegram_pet_weekly_boss_events/,
 daily_window_totals: /SELECT COALESCE\(SUM\(xp_awarded\), 0\) AS community_xp,[\s\S]*day_key = \?/,
};
for (const [name,query] of Object.entries(firstReadTargets)) test(`resolved failed ${name} first read cannot publish a normal Mini App snapshot`,async()=>{
  const f=await savedFixture('first-read-'+name);
  let hit=false;
  f.db.beforeFirst=s=>{
    if(query.test(s.query)){
      hit=true;
      return {success:false,error:'injected_private_d1_details'};
    }
  };
  await assert.rejects(hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token'),/pet_state_read_unavailable/);
  assert.equal(hit,true,'fault must reach the target');
});
test('active pet lookup preserves the migration fallback for a resolved missing-schema read',async()=>{
 const db={prepare(){return {bind(){return this;},async first(){return {success:false,error:'no such table: telegram_pet_active_slots'};}};}};
 assert.equal(await hooks.findActivePetSlot(db,'legacy-owner'),null);
});
for(const [name,query] of [
 ['expedition receipt',/SELECT pet_id, day_key, metadata, applied_rewards FROM telegram_pet_reward_claims/],
 ['expedition lifecycle',/SELECT phase FROM telegram_pet_lifecycle_by_pet WHERE pet_id=/],
]) test(`${name} read failure cannot claim or start an expedition`,async()=>{
 const f=await savedFixture('first-expedition-'+name.replaceAll(' ','-'));
 const before=durableSnapshot(f); let hit=false;
 f.db.beforeFirst=s=>{
  if(query.test(s.query)){hit=true;return {success:false,error:'private expedition read failure'};}
 };
 await assert.rejects(hooks.runPetCrystalExpedition(f.db,f.owner,new Date(),'expedition-outage'),/pet_state_read_unavailable/);
 assert.equal(hit,true);
 assert.deepEqual(durableSnapshot(f),before);
});
for(const payload of [{success:false,results:[]},{success:false},{success:true},{success:true,results:{}},null]) {
 test(`Relic Vault reports unavailable for ${JSON.stringify(payload)} instead of empty ownership`,async()=>{
  const f=await savedFixture('relic-'+JSON.stringify(payload));
  f.db.beforeAll=s=>s.query.includes('SELECT relic_id,')?payload:undefined;
  const state=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  assert.equal(state.relics_available,false);
  f.db.beforeAll=null;
  const restored=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  assert.equal(restored.relics_available,true);
  assert.equal(restored.relics[0].relic_id,'alley_crown');
 });
}
for(const period of ['daily','weekly','seasonal','all_time','run_depth','activity']) for(const payload of [{success:false,results:[]},{success:false},{success:true},{success:true,results:{}},null]) {
 test(`public ${period} rejects ${JSON.stringify(payload)}`,async()=>{
  const db={prepare(){return {bind(){return this;},async all(){return payload;}};}};
  const path=period==='activity'?'/telegram-pets/activity':'/telegram-pets/leaderboard?period='+period;
  const response=await worker.fetch(new Request('https://moonboys-api.test'+path),{DB:db});
  assert.equal(response.status,503);
  const body=await response.text();assert.ok(!body.includes('injected_private_d1_details'));
 });
}


test('Weekly Journey marks failed objective reads unavailable and recovers on refresh',async()=>{
 const f=await savedFixture('weekly-resolved');
 f.db.beforeAll=s=>s.query.includes('SELECT o.objective_id,')?{success:false,results:[]}:undefined;
 const state=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
 assert.equal(state.weekly_journey.active,false);
 f.db.beforeAll=null;
 assert.equal((await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token')).weekly_journey.active,true);
});
for(const [name,act] of [
 ['craft',f=>processPetCraftRecipe(f.db,f.owner,'street_rations','outage')],
 ['upgrade',f=>processPetEquipmentUpgrade(f.db, f.owner, 'moon_kibble', 'outage', getPetEquipmentUpgradeQuote('moon_kibble', 5))],
 ['cosmetic',f=>processPetCosmeticUnlock(f.db,f.owner,Object.keys(PET_COSMETIC_SINKS)[0],'outage')],
]) test(`${name} cannot interpret an unavailable material read as insufficient funds or spend currency`,async()=>{
 const f=await savedFixture('action-'+name);
 f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=500000 WHERE telegram_id=?').run(f.owner);
 const before=durableSnapshot(f);
 f.db.beforeAll=s=>s.query.includes('SELECT material_key, quantity FROM telegram_pet_material_balances')?{success:false,results:[],error:'private failure'}:undefined;
 await assert.rejects(act(f),/pet_state_read_unavailable/);
 assert.deepEqual(durableSnapshot(f),before);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_system_events').get().n,0);
});
for(const [name,query,act,prepare] of [
 ['craft profile',/SELECT pet_xp, level FROM telegram_pet_profiles/,f=>processPetCraftRecipe(f.db,f.owner,'street_rations','first-outage'),f=>f.sql.prepare("INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,'moon_fabric',30)").run(f.owner)],
 ['craft capacity',/SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=\? AND asset_type='item'/,f=>processPetCraftRecipe(f.db,f.owner,'street_rations','capacity-outage'),f=>f.sql.prepare("INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,'moon_fabric',30)").run(f.owner)],
 ['upgrade ownership',/SELECT item_key, item_level FROM telegram_pet_equipment_progression/,f=>processPetEquipmentUpgrade(f.db, f.owner, 'moon_kibble', 'ownership-outage', getPetEquipmentUpgradeQuote('moon_kibble', 5))],
 ['upgrade profile',/SELECT pet_xp, moon_gold FROM telegram_pet_profiles/,f=>processPetEquipmentUpgrade(f.db, f.owner, 'moon_kibble', 'profile-outage', getPetEquipmentUpgradeQuote('moon_kibble', 5))],
 ['cosmetic ownership',/SELECT quantity FROM telegram_pet_cosmetic_unlocks/,f=>processPetCosmeticUnlock(f.db,f.owner,Object.keys(PET_COSMETIC_SINKS)[0],'owned-outage')],
 ['cosmetic wallet',/SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles/,f=>processPetCosmeticUnlock(f.db,f.owner,Object.keys(PET_COSMETIC_SINKS)[0],'wallet-outage')],
]) test(`${name} cannot convert a resolved failed first read into a normal purchase result`,async()=>{
 const f=await savedFixture('first-action-'+name.replaceAll(' ','-'));
 f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=500000 WHERE telegram_id=?').run(f.owner);
 if(prepare) prepare(f);
 const before=durableSnapshot(f); let hit=false;
 f.db.beforeFirst=s=>{if(query.test(s.query)){hit=true;return {success:false,error:'private first-read failure'};}};
 await assert.rejects(act(f),/pet_state_read_unavailable/);
 assert.equal(hit,true);
 assert.deepEqual(durableSnapshot(f),before);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_system_events').get().n,0);
});
for(const [name,query,act] of [
 ['daily completion claim',/SELECT \* FROM telegram_pet_daily_completion WHERE telegram_id=/,async f=>claimDailyCompletion(f.db,f.owner,f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner),{utc_day:new Date().toISOString().slice(0,10),pet_id:'current-'+f.owner},async()=>({accepted:true}))],
 ['season finale',/SELECT f\.\* FROM telegram_pet_season_finales/,f=>processSeasonFinale(f.db,f.owner,{action:'finale_start',pet_id:'current-'+f.owner,season_key:currentSeason,competition_season_key:currentSeason,build:'striker'},async()=>({accepted:true}))],
 ['weekly boss claim',/SELECT \* FROM telegram_pet_weekly_boss_progress WHERE telegram_id=\? AND week_key=\? AND boss_id=/,f=>{const week='2026-W40';return hooks.claimPetWeeklyBossReward(f.db,f.owner,{week_key:week,boss_id:hooks.getPetWeeklyBoss(week).boss_id,pet_id:'current-'+f.owner});}],
 ['seasonal boss claim authority',/SELECT p\.pet_id,p\.season_key FROM telegram_pet_instances p/,f=>claimPetSeasonalBossReward(f.db,f.owner,{},async()=>({accepted:true}),{pet_id:'current-'+f.owner,boss_key:'null_prophet',season_instance:'test'} )],
]) test(`${name} cannot report a false not-ready result from a resolved failed read`,async()=>{
 const f=await savedFixture('first-reward-'+name.replaceAll(' ','-')); const before=durableSnapshot(f); let hit=false;
 f.db.beforeFirst=s=>{if(query.test(s.query)){hit=true;return {success:false,error:'private reward read failure'};}};
 await assert.rejects(act(f),/pet_state_read_unavailable/);
 assert.equal(hit,true);
 assert.deepEqual(durableSnapshot(f),before);
});
for(const [name,act] of [
 ['craft',f=>processPetCraftRecipe(f.db,f.owner,'street_rations','replay-outage')],
 ['upgrade',f=>processPetEquipmentUpgrade(f.db, f.owner, 'moon_kibble', 'replay-outage', getPetEquipmentUpgradeQuote('moon_kibble', 5))],
 ['cosmetic',f=>processPetCosmeticUnlock(f.db,f.owner,Object.keys(PET_COSMETIC_SINKS)[0],'replay-outage')],
]) test(`${name} cannot treat an unavailable replay receipt as a new purchase`,async()=>{
 const f=await savedFixture('replay-'+name);
 f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=500000 WHERE telegram_id=?').run(f.owner);
 const before=durableSnapshot(f);
 let hit=false;
 f.db.beforeFirst=s=>{
  if(s.query.includes('FROM telegram_pet_system_events') && s.query.includes("status='completed'")){
   hit=true;throw Error('mutation_replay_read_unavailable');
  }
 };
 await assert.rejects(act(f),/mutation_replay_read_unavailable/);
 assert.equal(hit,true);
 assert.deepEqual(durableSnapshot(f),before);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_system_events').get().n,0);
});
test('shared accepted-event outage stops timed work before reward settlement',async()=>{
 const f=await savedFixture('accepted-event-replay');
 const before=durableSnapshot(f);
 let hit=false;
 f.db.beforeFirst=s=>{
  if(s.query.includes('FROM telegram_pet_events') && s.query.includes("status = 'accepted'") && s.query.includes('event_key = ?')){
   hit=true;throw Error('accepted_event_read_unavailable');
  }
 };
 await assert.rejects(hooks.processPetJob(f.db,f.owner,'street_artist',{event_key:'timed-work-outage'}),/accepted_event_read_unavailable/);
 assert.equal(hit,true);
 assert.deepEqual(durableSnapshot(f),before);
});
for(const [name,act] of [
 ['care',f=>hooks.processPetAction(f.db,f.owner,'feed',{event_key:'care-cooldown-outage'})],
 ['timed work',f=>hooks.processPetJob(f.db,f.owner,'street_artist',{event_key:'work-cooldown-outage'})],
 ['trade',f=>hooks.processPetGoldTrade(f.db,f.owner,'50',{event_key:'trade-cooldown-outage'})],
]) test(`${name} cannot treat an unavailable cooldown read as ready`,async()=>{
 const f=await savedFixture('cooldown-'+name.replaceAll(' ','-'));
 const before=durableSnapshot(f);
 let hit=false;
 f.db.beforeFirst=s=>{
  if(s.query.includes('SELECT created_at FROM telegram_pet_events') && s.query.includes("status = 'accepted'")){
   hit=true;return {success:false,error:'private cooldown failure'};
  }
 };
 await assert.rejects(act(f),/pet_state_read_unavailable/);
 assert.equal(hit,true);
 assert.deepEqual(durableSnapshot(f),before);
});
test('special-care limit lookup rejects a resolved D1 failure after the atomic guard blocks a repeat',async()=>{
 const f=await savedFixture('special-limit-outage');
 const now=new Date();
 f.sql.prepare(`INSERT INTO telegram_pet_events
  (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,created_at)
  VALUES ('existing-dance',?,?,?,?,?,?,?,'accepted',?)`)
  .run('current-'+f.owner,f.owner,'dance','existing-dance',currentSeason,now.toISOString().slice(0,10),'test-week',now.toISOString());
 let hit=false;
 f.db.beforeFirst=s=>{
  if(s.query.includes('SUM(CASE WHEN day_key = ? THEN 1 ELSE 0 END)')){
   hit=true;return {success:false,error:'private special-limit failure'};
  }
 };
 await assert.rejects(hooks.processPetAction(f.db,f.owner,'dance',{event_key:'new-dance'}),/pet_state_read_unavailable/);
 assert.equal(hit,true);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='dance'").get().n,1);
});
test('adventure replay authority rejects a resolved D1 failure before rewards or costs',async()=>{
 const f=await savedFixture('adventure-replay-outage');
 const before=durableSnapshot(f);let hit=false;
 f.db.beforeFirst=s=>{
  if(s.query.startsWith('SELECT id FROM telegram_pet_events WHERE telegram_id = ? AND event_key = ?')){
   hit=true;return {success:false,error:'private adventure replay failure'};
  }
 };
 await assert.rejects(hooks.processPetAdventure(f.db,f.owner,'push_forward',{
  encounter_key:'moon_alley',event_key:'adventure-replay-outage',source:'test',
 }),/pet_state_read_unavailable/);
 assert.equal(hit,true);assert.deepEqual(durableSnapshot(f),before);
});
test('resolved Daily Journey receipt failure cannot publish false incomplete progress',async()=>{
 const f=await savedFixture('daily-journey-receipt-outage');
 let hit=false;
 f.db.beforeFirst=s=>{
  if(s.query.includes('FROM telegram_pet_daily_journey_receipts')){
   hit=true;return {success:false,error:'private Daily Journey receipt failure'};
  }
 };
 await assert.rejects(hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token'),/pet_state_read_unavailable/);
 assert.equal(hit,true);
});
test('Daily Cache cannot treat an unavailable same-day receipt as unclaimed',async()=>{
 const f=await savedFixture('daily-cache-receipt');
 const before=durableSnapshot(f);
 let hit=false;
 f.db.beforeFirst=s=>{
  if(s.query.includes("event_type = 'daily_chest'") && s.query.includes("status = 'accepted'")){
   hit=true;throw Error('daily_cache_receipt_unavailable');
  }
 };
 await assert.rejects(hooks.processPetDailyChest(f.db,f.owner,{event_key:'daily-cache-outage'}),/daily_cache_receipt_unavailable/);
 assert.equal(hit,true);
 assert.deepEqual(durableSnapshot(f),before);
});
for(const [name,read] of [
 ['daily completion', db=>readDailyCompletion(db,'owner','2026-09-29',{},0,0)],
 ['season finale', db=>getSeasonFinales(db,'owner','pet')],
]) test(`${name} preserves explicit unavailable state for a resolved missing migration`,async()=>{
 const table=name==='season finale'?'telegram_pet_season_finales':'telegram_pet_daily_completion';
 const db={prepare(){return {bind(){return this;},async all(){return {success:false,error:'no such table: '+table,results:[]};}};}};
 assert.equal((await read(db)).available,false);
});
test('successfully empty public rankings and activity remain valid',async()=>{
 for(const payload of [{results:[]},{success:true,results:[]}]) {
  const db={prepare(){return {bind(){return this;},async all(){return payload;}};}};
  for(const path of ['/telegram-pets/leaderboard','/telegram-pets/activity']) {
   const r=await worker.fetch(new Request('https://moonboys-api.test'+path),{DB:db});
   assert.equal(r.status,200);
  }
 }
});

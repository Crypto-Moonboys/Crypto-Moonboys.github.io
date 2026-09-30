import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

import { claimPetSeasonalBossReward, processPetCraftRecipe, processPetEquipmentUpgrade, processPetCosmeticUnlock } from '../workers/moonboys-api/pets/live-systems.js';
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
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { statementCount: 0, beforeBatch: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
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
  const act = body => hooks.processPetMiniAppAction(db,owner,{id:owner},body,'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, get };
}

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
  practice: /SELECT c\.run_id,c\.pet_id,c\.reward_day[\s\S]*telegram_pet_practice/,
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
 practice_authority: /SELECT 1 WHERE EXISTS[\s\S]*telegram_pet_instances p[\s\S]*telegram_pet_active_slots/,
 practice_stats: /SELECT COALESCE\(MAX\(sequence\),0\)\+1 next_sequence[\s\S]*FROM telegram_pet_practice/,
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
 ['upgrade',f=>processPetEquipmentUpgrade(f.db,f.owner,'moon_kibble','outage')],
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
 ['upgrade ownership',/SELECT item_key, item_level FROM telegram_pet_equipment_progression/,f=>processPetEquipmentUpgrade(f.db,f.owner,'moon_kibble','ownership-outage')],
 ['upgrade profile',/SELECT pet_xp, moon_gold FROM telegram_pet_profiles/,f=>processPetEquipmentUpgrade(f.db,f.owner,'moon_kibble','profile-outage')],
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
 ['season finale',/SELECT f\.\* FROM telegram_pet_season_finales/,f=>processSeasonFinale(f.db,f.owner,{action:'finale_start',pet_id:'current-'+f.owner,season_key:currentSeason,build:'striker'},async()=>({accepted:true}))],
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
 ['upgrade',f=>processPetEquipmentUpgrade(f.db,f.owner,'moon_kibble','replay-outage')],
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
]) test(`${name} cannot treat an unavailable cooldown read as ready`,async()=>{
 const f=await savedFixture('cooldown-'+name.replaceAll(' ','-'));
 const before=durableSnapshot(f);
 let hit=false;
 f.db.beforeFirst=s=>{
  if(s.query.includes('SELECT created_at FROM telegram_pet_events') && s.query.includes("status = 'accepted'")){
   hit=true;throw Error('cooldown_read_unavailable');
  }
 };
 await assert.rejects(act(f),/cooldown_read_unavailable/);
 assert.equal(hit,true);
 assert.deepEqual(durableSnapshot(f),before);
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

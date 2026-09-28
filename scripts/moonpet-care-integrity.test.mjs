import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getPetVisibleLevel } from '../workers/moonboys-api/pets/progression-phase-2.js';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const now = new Date();
const currentSeason = hooks.getPetSeasonInfo(now).key;
const oldSeason = hooks.getPetSeasonInfo(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 15))).key;
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { beforeBatch: null, beforeRun: null, failReward: false, rejectReward: false, prepare(query) { return new Statement(query); }, async batch(statements) {
    if (this.failReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.failReward = false;
      throw Error('interrupted_terminal_reward');
    }
    if (this.rejectReward && statements.some(s => /INSERT OR IGNORE INTO telegram_pet_reward_claims/.test(s.query))) {
      this.rejectReward = false;
      return statements.map(() => ({ results: [], meta: { changes: 0 } }));
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
  pet('current-' + owner);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, 'current-' + owner, currentSeason);
  sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=1000,moon_crystals=100,style_tokens=100 WHERE telegram_id=?').run(owner);
  const active = (id, season = currentSeason) => {
    sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?').run(id, season, owner);
    const p = sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get(id);
    sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=?,equipped_food=?,level=? WHERE telegram_id=?').run(p.pet_xp, p.equipped_food, p.level, owner);
  };
  const act = body => hooks.processPetMiniAppAction(db,owner,{id:owner},body,'fixture-token');
  const reveal = id => sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'elite_moonpet',3,'reveal')").run(id,owner);
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, reveal, state, get };
}

function xp(f) { return f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner).pet_xp; }
function care(f,action,key) { return hooks.processPetAction(f.db,f.owner,action,{event_key:key}); }
function cap(f,petXp=1198,communityXp=249) {
  f.sql.prepare("INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,xp_awarded,pet_xp_awarded,season_key,day_key,week_key,status) VALUES ('cap',?,?,'run','cap',?,?,?,?,?,'accepted')").run('current-'+f.owner,f.owner,communityXp,petXp,currentSeason,now.toISOString().slice(0,10),'fixture');
}
function items(f,key,count=2) {
  f.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item',?,?)").run(f.owner,key,count);
}

test('rapid repeated care cannot bypass the ordinary cooldown', async()=>{
  const f=fixture('83001');
  const result=await Promise.all([care(f,'feed','feed-1'),care(f,'feed','feed-2')]);
  assert.equal(result.filter(r=>r.accepted).length,1);
  assert.equal(result.find(r=>!r.accepted).reason,'cooldown');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='feed' AND status='accepted'").get().n,1);
});

test('different overlapping care actions retain all pet XP and stat changes', async()=>{
  const f=fixture('83002');
  const result=await Promise.all([care(f,'feed','feed'),care(f,'play','play')]);
  assert.ok(result.every(r=>r.accepted));
  const earned=result.reduce((sum,r)=>sum+r.pet_xp_awarded,0);
  assert.equal(xp(f),200+earned);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_profiles').get().pet_xp,200+earned);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state').get().season_xp,earned);
  const expected={hunger:25,happiness:70,cleanliness:70,energy:100};
  for(const {event_type} of f.sql.prepare("SELECT event_type FROM telegram_pet_events WHERE status='accepted' ORDER BY rowid").all()) {
    for(const key of Object.keys(expected)) expected[key]=Math.max(0,Math.min(100,expected[key]+hooks.PET_ACTIONS[event_type][key]));
  }
  assert.deepEqual({...f.sql.prepare('SELECT hunger,happiness,cleanliness,energy FROM telegram_pet_instances').get()},expected);
});

test('care rechecks the active pet inside its transaction', async()=>{
  const f=fixture('83003'); f.pet('other',currentSeason,300,2);
  f.db.beforeBatch=async statements=>{
    if(!statements[0].query.includes('pet_action_pending')) return;
    f.db.beforeBatch=null;
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'other')).accepted,true);
  };
  const r=await care(f,'feed','switch');
  assert.equal(r.accepted,false);
  assert.equal(xp(f),200);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_profiles').get().pet_xp,300);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,1000);
});

test('overlapping care clamps both XP caps at commit time', async()=>{
  const f=fixture('83004'); cap(f);
  const result=await Promise.all([care(f,'feed','feed'),care(f,'play','play')]);
  assert.ok(result.every(r=>r.accepted));
  assert.equal(result.reduce((n,r)=>n+r.pet_xp_awarded,0),2);
  assert.equal(result.reduce((n,r)=>n+r.xp_awarded,0),1);
  assert.equal(xp(f),202);
  assert.equal(f.sql.prepare('SELECT xp FROM telegram_users').get().xp,1);
  assert.equal(f.sql.prepare('SELECT xp FROM telegram_leaderboard').get().xp,1);
});

test('Community XP failure rolls care back so retry settles every projection once', async()=>{
  const f=fixture('83005');
  // Inject a real SQL failure at the Community projection, inside or outside a batch.
  f.sql.exec("CREATE TRIGGER reject_community BEFORE INSERT ON telegram_xp_log BEGIN SELECT RAISE(ABORT,'interrupted_community'); END");
  await assert.rejects(care(f,'feed','retry'),/interrupted_community/);
  assert.equal(xp(f),200,'a failed Community write must not leave a paid pet event');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_key='retry'").get().n,0);
  f.sql.exec('DROP TRIGGER reject_community');
  const r=await care(f,'feed','retry');
  assert.equal(r.accepted,true);
  assert.equal((await care(f,'feed','retry')).duplicate,true);
  assert.equal(f.sql.prepare('SELECT xp FROM telegram_users').get().xp,r.xp_awarded);
  assert.equal(f.sql.prepare('SELECT xp FROM telegram_leaderboard').get().xp,r.xp_awarded);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_xp_log').get().n,1);
});

test('overlapping consumables share the remaining Pet XP allowance', async()=>{
  const f=fixture('83006'); cap(f); items(f,'moon_snack');
  const result=await Promise.all([1,2].map(i=>hooks.processPetUseItem(f.db,f.owner,'moon_snack',{event_key:'snack-'+i})));
  assert.ok(result.every(r=>r.accepted));
  assert.equal(result.reduce((n,r)=>n+r.pet_xp_awarded,0),2);
  assert.equal(xp(f),202);
  assert.equal(f.sql.prepare("SELECT SUM(pet_xp_awarded) n FROM telegram_pet_events WHERE status='accepted'").get().n,1200);
  for (const claim of f.sql.prepare("SELECT applied_rewards FROM telegram_pet_reward_claims WHERE source='pet_item_use'").all()) assert.ok(JSON.parse(claim.applied_rewards).pet_xp<=2);
});

test('switching pets during item use preserves the original reward and the new pet mirror', async()=>{
  const f=fixture('83007'); items(f,'moon_snack'); f.pet('other',currentSeason,300,2);
  f.db.beforeBatch=async statements=>{
    if(!statements[0].query.includes('item_use_pending')) return;
    f.db.beforeBatch=null;
    assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'other')).accepted,true);
  };
  const r=await hooks.processPetUseItem(f.db,f.owner,'moon_snack',{event_key:'switch-item'});
  assert.equal(r.accepted,true);
  assert.equal(r.pet.pet_id,'current-'+f.owner);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE asset_key='moon_snack'").get().quantity,1);
  assert.equal(xp(f),204);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_profiles').get().pet_xp,300);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='other'").get().pet_xp,300);
});


test('mixed care and consumables retain stats, both receipts and one shared cap', async()=>{
  const f=fixture('83008'); cap(f); items(f,'energy_drink');
  const result=await Promise.all([care(f,'feed','feed'),hooks.processPetUseItem(f.db,f.owner,'energy_drink',{event_key:'drink'})]);
  assert.ok(result.every(r=>r.accepted));
  assert.equal(result.reduce((n,r)=>n+r.pet_xp_awarded,0),2);
  assert.equal(xp(f),202);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE asset_key='energy_drink'").get().quantity,1);
});

test('starting a timed activity during care blocks Sleep and Train at commit', async()=>{
  for(const action of ['sleep','train']) {
    const f=fixture('83009'+action);
    f.db.beforeBatch=async statements=>{
      if(!statements[0].query.includes('pet_action_pending')) return;
      f.db.beforeBatch=null;
      assert.equal((await f.act({action:'activity_start',activity_type:'explore'})).accepted,true);
    };
    const r=await care(f,action,'busy');
    assert.equal(r.accepted,false); assert.equal(r.reason,'pet_busy'); assert.equal(xp(f),200);
  }
});

test('training checks energy consumed by an overlapping action', async()=>{
  const f=fixture('83010');
  f.sql.exec('UPDATE telegram_pet_instances SET energy=18; UPDATE telegram_pet_profiles SET energy=18');
  f.db.beforeBatch=async statements=>{
    if(!statements[0].query.includes('pet_action_pending')) return;
    f.db.beforeBatch=null;
    assert.equal((await care(f,'play','play')).accepted,true);
  };
  const r=await care(f,'train','train');
  assert.equal(r.accepted,false);
  assert.equal(xp(f),210);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances').get().energy,6);
});

test('item effects apply elapsed decay and preserve the current visible level curve', async()=>{
  const f=fixture('83011'); items(f,'moon_snack');
  const past=new Date(Date.now()-3600000).toISOString();
  for(const table of ['telegram_pet_instances','telegram_pet_profiles']) f.sql.prepare(`UPDATE ${table} SET pet_xp=10000,hunger=25,happiness=70,cleanliness=70,energy=70,last_decay_at=?`).run(past);
  const r=await hooks.processPetUseItem(f.db,f.owner,'moon_snack',{event_key:'decay'});
  assert.equal(r.accepted,true);
  const row=f.sql.prepare('SELECT * FROM telegram_pet_instances').get();
  assert.equal(row.hunger,12); assert.equal(row.happiness,67); assert.equal(row.cleanliness,67); assert.equal(row.energy,76);
  assert.equal(row.level,getPetVisibleLevel(10004));
  assert.equal(f.sql.prepare('SELECT level FROM telegram_pet_profiles').get().level,row.level);
});

test('accepted care and consumables agree with quests, public activity and every XP board', async()=>{
  const f=fixture('83012'), petId='current-'+f.owner; f.reveal(petId); items(f,'moon_snack');
  const careResult=await Promise.all(['feed','play','clean'].map(a=>care(f,a,a)));
  const item=await hooks.processPetUseItem(f.db,f.owner,'moon_snack',{event_key:'snack'});
  const total=careResult.reduce((sum,r)=>sum+r.pet_xp_awarded,0)+item.pet_xp_awarded;
  assert.equal(f.sql.prepare("SELECT progress FROM telegram_pet_daily_challenge_progress WHERE challenge_id='daily_care'").get().progress,3);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_weekly_journey_objectives WHERE objective_id='weekly_care' AND status='accepted'").get().n,3);
  for(const period of ['daily','weekly','seasonal','all_time']) {
    const publicBoard=await f.get('/telegram-pets/leaderboard?period='+period);
    const mini=await hooks.buildPetMiniAppLeaderboard(f.db,f.owner,period,10);
    assert.equal(publicBoard.entries[0].pet_xp,(period==='all_time'?200:0)+total,period);
    assert.equal(mini.entries[0].pet_xp,publicBoard.entries[0].pet_xp);
  }
  const activity=await f.get('/telegram-pets/activity');
  for(const type of ['feed','play','clean','use_item']) assert.equal(activity.items.find(e=>e.event_type===type).display_name,'BOTTY');
  const community=careResult.reduce((sum,r)=>sum+r.xp_awarded,0);
  assert.equal((await f.get('/telegram/leaderboard')).entries[0].xp,community);
  assert.equal(f.sql.prepare('SELECT SUM(xp_change) n FROM telegram_xp_log').get().n,community);
  // A refresh retains every ordinary care cooldown and rejected retries add no evidence.
  const state=await f.state();
  for(const action of ['feed','play','clean']) {
    assert.ok(state.cooldowns.entries.some(e=>e.key==='action:'+action && e.remaining_seconds>0));
    assert.equal((await care(f,action,action+'-again')).reason,'cooldown');
  }
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_weekly_journey_objectives WHERE objective_id='weekly_care' AND status='accepted'").get().n,3);
});


test('a duplicate Mini App care request cannot give specialist progress to a newly selected pet', async()=>{
  const f=fixture('83013'), body={action:'feed',request_id:'duplicate-care'};
  assert.equal((await f.act(body)).accepted,true);
  const original=f.sql.prepare('SELECT care_xp,bond_xp FROM telegram_pet_specialist_progression WHERE pet_id=?').get('current-'+f.owner);
  assert.ok(original.care_xp>0);
  f.pet('retry-second',currentSeason,300,2);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'retry-second')).accepted,true);
  const duplicate=await f.act(body);
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.pet.pet_id,'current-'+f.owner);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE pet_id='retry-second'").get().n,0);
  assert.deepEqual(f.sql.prepare('SELECT care_xp,bond_xp FROM telegram_pet_specialist_progression WHERE pet_id=?').get('current-'+f.owner),original);
});

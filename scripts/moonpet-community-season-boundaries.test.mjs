import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { awardPetReward as awardUnifiedPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { selectCommunitySeason } from '../workers/moonboys-api/community-season-authority.js';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const currentSeason = 'pet-s2026-004';
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql', import.meta.url), 'utf8'));
  for (const migration of ['058_telegram_pet_season_completion.sql','061_moonpet_season_economy_calibration.sql']) sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/'+migration, import.meta.url),'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { if (db.beforeFirst) await db.beforeFirst(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (sql.prepare(this.query).columns().length && !/\bRETURNING\b/i.test(this.query)) return { results: sql.prepare(this.query).all(...this.args), meta: { changes: 0 } };
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
  sql.function('current_timestamp', () => new Date().toISOString().replace('T', ' ').slice(0, 19));
  sql.exec("INSERT INTO telegram_seasons(id,name,start_date,end_date,is_active) VALUES (1,'Morning','2026-10-01','2026-10-02T12:00:00Z',1),(2,'Afternoon','2026-10-02T12:00:00Z','2026-10-03T12:00:00Z',1),(3,'Tomorrow','2026-10-03T12:00:00Z','2027-01-01',1)");
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
  const act = body => dispatchRenderedPetAction(db,owner,{id:owner},body,'fixture-token');
  const reveal = id => sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'elite_moonpet',3,'reveal')").run(id,owner);
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, reveal, state, get };
}

const boundary = '2026-10-02T12:00:00.000Z';
const leaderboard = f => f.sql.prepare('SELECT season_id,xp FROM telegram_leaderboard WHERE telegram_id=? ORDER BY season_id').all(f.owner).map(row=>({...row}));
const communityTotal = f => f.sql.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(f.owner).xp;
function seedRun(f, runId, petId='current-'+f.owner, season=currentSeason, completedAt=null) {
  f.sql.prepare(`INSERT INTO telegram_pet_runs (id,run_id,telegram_id,pet_id,season_key,status,depth,current_room,max_depth,max_room,
    unbanked_pet_xp,unbanked_moon_gold,completed_at) VALUES (?,?,?,?,?,?,2,2,100,100,24,9,?)`)
    .run(runId,runId,f.owner,petId,season,completedAt ? 'extracted' : 'active',completedAt);
  f.sql.prepare(`INSERT INTO telegram_pet_run_steps (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success,created_at)
    VALUES (?,?,?,?,2,'fight','fight',?,1,?)`).run(runId+':step',runId,f.owner,petId,runId+':step',completedAt || new Date().toISOString());
}
function addOtherPets(f) {
  f.pet('old-'+f.owner,'pet-s2026-002',200,2);
  f.pet('third-'+f.owner,'pet-s2026-003',200,3);
}

for (const action of ['feed','run_extract']) for (const [time,seasonId] of [
  ['2026-10-02T11:59:59.999Z',1], [boundary,2], ['2026-10-02T20:00:00.000Z',2],
]) test(`${action} selects the same intraday Community season as public ranking at ${time}`, async t => {
  t.mock.timers.enable({apis:['Date'],now:new Date(time)});
  const f=fixture(action+'-'+seasonId+'-'+time); addOtherPets(f);
  if(action==='run_extract')seedRun(f,'boundary-run');
  const body={action,request_id:'boundary-action',...(action==='run_extract'?{run_id:'boundary-run'}:{})};
  const result=await f.act(body);assert.equal(result.accepted,true,JSON.stringify(result));assert.ok(result.xp_awarded>0);
  const rows=leaderboard(f);assert.deepEqual(rows,[{season_id:seasonId,xp:result.xp_awarded}]);assert.equal(communityTotal(f),result.xp_awarded);
  assert.equal((await selectCommunitySeason(f.db,new Date())).id,seasonId);
  const publicBoard=await f.get('/telegram/leaderboard');assert.equal(publicBoard.season.id,seasonId);
  assert.equal(publicBoard.entries[0].xp,result.xp_awarded);
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND status='accepted' AND xp_awarded>0").get(f.owner);
  assert.equal(receipt.pet_id,'current-'+f.owner);assert.equal(receipt.season_key,currentSeason);
  // A retry after another pet is selected and another Community season begins
  // must preserve the original receipt and leaderboard allocation.
  f.active('third-'+f.owner,'pet-s2026-003'); t.mock.timers.setTime(Date.parse('2026-10-03T20:00:00Z'));
  const replay=await f.act(body);assert.equal(replay.duplicate,true,JSON.stringify(replay));
  assert.deepEqual(leaderboard(f),rows);assert.equal(communityTotal(f),result.xp_awarded);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events WHERE id=?').get(receipt.id),receipt);
});

test('care captures its earning timestamp before a batch crosses the exact boundary', async t => {
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-02T11:59:59.950Z')});const f=fixture('care-boundary-race');
  f.db.beforeBatch=statements=>{if(statements[0].query.includes('pet_action_pending')){f.db.beforeBatch=null;t.mock.timers.setTime(Date.parse(boundary)+50);}};
  const result=await f.act({action:'feed',request_id:'before-noon'});assert.equal(result.accepted,true);
  assert.deepEqual(leaderboard(f),[{season_id:1,xp:result.xp_awarded}]);
  const receipt=f.sql.prepare("SELECT created_at,day_key FROM telegram_pet_events WHERE event_type='feed'").get();
  assert.equal(receipt.created_at,'2026-10-02T11:59:59.950Z');assert.equal(receipt.day_key,'2026-10-02');
  assert.equal((await selectCommunitySeason(f.db,new Date())).id,2);
});

for(const [earnedAt,seasonId] of [['2026-10-02T11:59:59.999Z',1],[boundary,2]])
 test(`delayed Standard Run settlement retains saved full source timestamp ${earnedAt}`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-03T20:00:00Z')});const f=fixture('historical-run-'+seasonId);addOtherPets(f);
  seedRun(f,'saved-run','old-'+f.owner,'pet-s2026-002',earnedAt);f.active('third-'+f.owner,'pet-s2026-003');
  const sourceBefore=f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get('saved-run');
  const result=await f.act({action:'run_extract',run_id:'saved-run',request_id:'recover-run'});assert.equal(result.accepted,true,JSON.stringify(result));
  assert.deepEqual(leaderboard(f),[{season_id:seasonId,xp:result.xp_awarded}]);assert.equal(communityTotal(f),result.xp_awarded);
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND event_type='run_extract' AND status='accepted'").get(f.owner);
  assert.equal(receipt.pet_id,'old-'+f.owner);assert.equal(receipt.season_key,'pet-s2026-002');assert.equal(receipt.day_key,'2026-10-02');
  assert.equal(f.sql.prepare('SELECT completed_at FROM telegram_pet_runs WHERE run_id=?').get('saved-run').completed_at,sourceBefore.completed_at);
  assert.equal((await selectCommunitySeason(f.db,new Date())).id,3);
  const replay=await f.act({action:'run_extract',run_id:'saved-run',request_id:'recover-run'});assert.equal(replay.duplicate,true);
  assert.deepEqual(leaderboard(f),[{season_id:seasonId,xp:result.xp_awarded}]);
});

for(const [savedAt,expectedSeason] of [['2026-10-02 11:59:59',1],['2026-10-02T12:00:00.000Z',2],['2026-10-03T20:00:00.000Z',1]])
 test(`pending reservation preserves source provenance ${savedAt}`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-03T20:00:00Z')});const f=fixture('reservation-'+savedAt);addOtherPets(f);
  const petId='old-'+f.owner,season='pet-s2026-002';f.active('third-'+f.owner,'pet-s2026-003');
  f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,reason,created_at)
    VALUES ('held',?,?,'random_event','held-key',?,'2026-10-02','2026-W40','pending','repeat_reward_slot:1',?)`).run(petId,f.owner,season,savedAt);
  const reward={telegram_id:f.owner,pet_id:petId,season_key:season,source:'pet_event',idempotency_key:'held-key',event_key:'held-key',
    event_type:'random_event',reservation_id:'held',day_key:'2026-10-02',week_key:'2026-W40',now:new Date(),rewards:{community_xp:7,pet_xp:9}};
  const result=await awardUnifiedPetReward(f.db,reward);assert.equal(result.accepted,true);assert.deepEqual(leaderboard(f),[{season_id:expectedSeason,xp:7}]);
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='held'").get();
  assert.equal(receipt.created_at,savedAt);assert.equal(receipt.day_key,'2026-10-02');assert.equal(receipt.pet_id,petId);
  assert.equal((await awardUnifiedPetReward(f.db,reward)).duplicate,true);assert.deepEqual(leaderboard(f),[{season_id:expectedSeason,xp:7}]);
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='held'").get(),receipt);
});

test('three pets share Community totals without confusing ownership seasons with the scoring season',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-02T20:00:00Z')});const f=fixture('three-pet-community');addOtherPets(f);
  for(const [id,season,action] of [['current-'+f.owner,currentSeason,'feed'],['old-'+f.owner,'pet-s2026-002','play'],['third-'+f.owner,'pet-s2026-003','clean']]){
    f.active(id,season);const result=await f.act({action,request_id:'care-'+action});assert.equal(result.accepted,true,JSON.stringify(result));
    const receipt=f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_events WHERE event_type=? AND status=\'accepted\'').get(action);
    assert.equal(receipt.pet_id,id);assert.equal(receipt.season_key,season);
  }
  assert.deepEqual(leaderboard(f),[{season_id:2,xp:communityTotal(f)}]);assert.ok(communityTotal(f)>0);
});

for(const [earnedAt,recoveredAt,expectedSeason] of [
  ['2026-10-02T11:59:59.950Z','2026-10-02T20:00:00Z',1],
  [boundary,'2026-10-02T20:00:00Z',2],
  ['2026-10-02T20:00:00Z','2026-10-03T20:00:00Z',2],
  ['2026-09-30T23:59:59.950Z','2026-10-03T20:00:00Z',4],
]) test(`fresh Kaiju payout reservation retains saved ending ${earnedAt} during recovery ${recoveredAt}`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(recoveredAt)});const f=fixture('kaiju-'+earnedAt);addOtherPets(f);
  f.sql.prepare("INSERT INTO telegram_seasons(id,name,start_date,end_date,is_active) VALUES (4,'September','2026-09-01','2026-10-01',1)").run();
  const petId='old-'+f.owner,season='pet-s2026-002';f.active('third-'+f.owner,'pet-s2026-003');
  const match={match_id:'saved-kaiju',mode:'solo',player1_telegram_id:f.owner,status:'completed',completed_at:earnedAt,
    score_json:JSON.stringify({reward_sources:{[f.owner]:{pet_id:petId,season_key:season,equipment_snapshot:{}}}})};
  const rewards={community_xp:8,pet_xp:38,energy_cost:6};
  const result=await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'kaiju_win',rewards);assert.equal(result.accepted,true,JSON.stringify(result));
  assert.deepEqual(leaderboard(f),[{season_id:expectedSeason,xp:8}]);
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='kaiju_battle'").get();
  assert.equal(receipt.created_at,new Date(earnedAt).toISOString());assert.equal(receipt.day_key,earnedAt.slice(0,10));assert.equal(receipt.pet_id,petId);assert.equal(receipt.season_key,season);
  assert.equal((await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'kaiju_win',rewards)).duplicate,true);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events WHERE id=?').get(receipt.id),receipt);
  assert.deepEqual(leaderboard(f),[{season_id:expectedSeason,xp:8}]);
});

test('saved pre-upgrade Kaiju reservation keeps its historical day and timestamp instead of adopting the new timestamp path',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-03T20:00:00Z')});const f=fixture('legacy-kaiju-community');addOtherPets(f);
  const petId='old-'+f.owner,season='pet-s2026-002',key=`pet_kaiju:saved-kaiju:${f.owner}`;
  f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,reason,created_at,metadata)
    VALUES ('legacy-held',?,?,'kaiju_battle',?,?,'2026-10-02','2026-W40','pending','repeat_reward_slot:1:energy_paid:6','2026-10-03 12:00:00','{"source":"legacy","equipment_snapshot":{}}')`).run(petId,f.owner,key,season);
  f.active('third-'+f.owner,'pet-s2026-003');
  const match={match_id:'saved-kaiju',mode:'solo',player1_telegram_id:f.owner,status:'completed',completed_at:'2026-10-02T20:00:00Z',
    score_json:JSON.stringify({reward_sources:{[f.owner]:{pet_id:petId,season_key:season,equipment_snapshot:{}}}})};
  const result=await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'kaiju_win',{community_xp:8,pet_xp:38,energy_cost:6});assert.equal(result.accepted,true);
  assert.deepEqual(leaderboard(f),[{season_id:1,xp:8}]);
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='legacy-held'").get();
  assert.equal(receipt.created_at,'2026-10-03 12:00:00');assert.equal(receipt.day_key,'2026-10-02');assert.equal(receipt.pet_id,petId);assert.equal(receipt.season_key,season);
  assert.equal((await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'kaiju_win',{community_xp:8,pet_xp:38,energy_cost:6})).duplicate,true);
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='legacy-held'").get(),receipt);
});

test('retry does not rewrite an already sealed pre-fix Community allocation or source receipt',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-02T20:00:00Z')});const f=fixture('retained-sealed-community');
  const body={action:'feed',request_id:'historical-care'};const first=await f.act(body);assert.equal(first.accepted,true);
  // Model the retained pre-fix database: source evidence proves the afternoon
  // action, but its accepted payout was already allocated to the morning board.
  f.sql.prepare('UPDATE telegram_leaderboard SET season_id=1 WHERE telegram_id=?').run(f.owner);
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='feed'").get(),saved=leaderboard(f);
  t.mock.timers.setTime(Date.parse('2026-10-03T20:00:00Z'));
  assert.equal((await f.act(body)).duplicate,true);assert.deepEqual(leaderboard(f),saved);
  assert.equal(communityTotal(f),first.xp_awarded);assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events WHERE id=?').get(receipt.id),receipt);
});

for(const action of ['feed','run_extract']) for(const [label,earlier,later] of [
  ['mixed ISO and SQLite','2026-10-02T05:00:00Z','2026-10-02 18:00:00'],
  ['equal instants use higher id','2026-10-02T18:00:00Z','2026-10-02 18:00:00'],
  ['timezone-normalized instants','2026-10-02T19:00:00+02:00','2026-10-02 18:00:00'],
]) test(`${action}: ${label} seasons are ordered by timestamp`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-02T19:00:00Z')});const f=fixture(`${action}-${label}`);
  f.sql.exec('DELETE FROM telegram_seasons');
  const insert=f.sql.prepare('INSERT INTO telegram_seasons(id,name,start_date,is_active) VALUES (?,?,?,1)');
  insert.run(1,'Earlier',earlier);insert.run(2,'Latest',later);
  if(action==='run_extract')seedRun(f,'format-run');
  const result=await f.act({action,request_id:'format-action',...(action==='run_extract'?{run_id:'format-run'}:{})});assert.equal(result.accepted,true);
  assert.deepEqual(leaderboard(f),[{season_id:2,xp:result.xp_awarded}]);
  assert.equal((await selectCommunitySeason(f.db,new Date())).id,2);
  const board=await f.get('/telegram/leaderboard');assert.equal(board.season.id,2);assert.equal(board.entries[0].xp,result.xp_awarded);
});

for(const action of ['feed','run_extract']) for(const [fraction,expectedSeason] of [
  ['499',1],['500',2],['501',2],['749',2],['750',3],
]) test(`${action}: fractional Community boundary at 12:00:00.${fraction} preserves inclusive start and exclusive end`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(`2026-10-02T12:00:00.${fraction}Z`)});const f=fixture(`${action}-fraction-${fraction}`);
  f.sql.exec(`DELETE FROM telegram_seasons;
    INSERT INTO telegram_seasons(id,name,start_date,end_date,is_active) VALUES
      (1,'Before','2026-10-02T00:00:00Z','2026-10-02T12:00:00.500Z',1),
      (2,'Fraction','2026-10-02 12:00:00.500','2026-10-02 12:00:00.750',1),
      (3,'After','2026-10-02T12:00:00.750Z',NULL,1);`);
  if(action==='run_extract')seedRun(f,'fraction-run');
  const result=await f.act({action,request_id:'fraction-action',...(action==='run_extract'?{run_id:'fraction-run'}:{})});assert.equal(result.accepted,true);
  assert.deepEqual(leaderboard(f),[{season_id:expectedSeason,xp:result.xp_awarded}]);
  assert.equal((await selectCommunitySeason(f.db,new Date())).id,expectedSeason);
  const board=await f.get('/telegram/leaderboard');assert.equal(board.season.id,expectedSeason);assert.equal(board.entries[0].xp,result.xp_awarded);
});

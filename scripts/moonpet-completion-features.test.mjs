import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { readDailyCompletion, getSeasonFinales, newFinale, advanceFinale, finaleChoices, processSeasonFinale } from '../workers/moonboys-api/pets/completion-features.js';

const today = new Date().toISOString().slice(0, 10), season = hooks.getPetSeasonInfo(new Date()).key;
function weekKey() { const d=new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7)); return `${d.getUTCFullYear()}-W${String(Math.ceil(((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000+1)/7)).padStart(2,'0')}`; }
const file = name => fs.readFileSync(new URL('../workers/moonboys-api/' + name, import.meta.url), 'utf8');
function fixture(owner, legacyFinale = false) {
  const sql = new DatabaseSync(':memory:');
  const schema = file('schema.sql');
  const oldFinale = file('migrations/077_moonpet_completion_rewards.sql').split('-- One saved finale')[1];
  sql.exec(legacyFinale ? schema.replace(/-- One saved finale[\s\S]*?(?=-- Per-pet equipped cosmetic styles\.)/, '-- One saved finale' + oldFinale + '\n') : schema);
  for (const migration of ['048_telegram_pet_player_expansion.sql', '058_telegram_pet_season_completion.sql', '061_moonpet_season_economy_calibration.sql', '085_permanent_pet_weekly_evidence.sql']) sql.exec(file('migrations/' + migration));
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
    async run() { if (db.beforeRun) { const result = await db.beforeRun(this); if (result) return result; } return this.exec(); }
  }
  const db = { prepare: query => new Statement(query), async batch(statements) {
    if (db.beforeBatch) await db.beforeBatch(statements);
    sql.exec('BEGIN');
    try { const results = statements.map(s => s.exec()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Test player');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy) VALUES (?,200,100)').run(owner);
  function pet(id, slot = 1, sourceSeason = season, phase = 'young') {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id, owner, sourceSeason, slot);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,?,200,100,'0001-01-01 00:00:00')").run(id, owner, sourceSeason, slot);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,?,'vinyl_crab','{}','[]')").run(id, owner, id, phase);
    sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'legendary_moon_guardian',5,'test')").run(id, owner);
  }
  const petId = `pet-${owner}`; pet(petId);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner, petId, season);
  const active = id => sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=? WHERE telegram_id=?').run(id, owner);
  function event(type, date = today, status = 'accepted', xp = 0) {
    const id = crypto.randomUUID();
    sql.prepare('INSERT INTO telegram_pet_events (id,telegram_id,pet_id,event_type,event_key,day_key,week_key,season_key,status,pet_xp_awarded) VALUES (?,?,?,?,?,?,?, ?,?,?)')
      .run(id, owner, petId, type, id, date, weekKey(), season, status, xp);
    return id;
  }
  const completeDaily = () => {
    sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=50 WHERE telegram_id=?').run(owner);
    for (const type of ['feed','play','clean','train','trade','buy','adventure']) event(type);
  };
  const completeSeason = (id = petId, sourceSeason = season) => sql.prepare(`INSERT INTO telegram_pet_season_completions
    (pet_id,telegram_id,season_key,legendary_evolution_id,growth_marks_earned,weekly_crests_earned) VALUES (?,?,?,'legendary_moon_guardian',60,10)`).run(id, owner, sourceSeason);
  const act = body => dispatchRenderedPetAction(db, owner, { id: owner }, body, 'test-token');
  const board = () => getSeasonFinales(db, owner, petId);
  const battle = () => sql.prepare('SELECT * FROM telegram_pet_season_finales WHERE pet_id=?').get(petId);
  const get = async path => { const response = await worker.fetch(new Request('https://test.local' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, petId, pet, active, event, completeDaily, completeSeason, act, board, battle, get };
}
const dailyClaim = f => ({ action: 'daily_completion_claim', utc_day: today, pet_id: f.petId });
const finaleBody = (f, action, extra = {}) => ({ action, pet_id: f.petId, season_key: f.sourceSeason || season, competition_season_key: f.competitionSeason || season, ...extra });

for (const action of ['finale_start', 'finale_retry', 'finale_step']) test(`${action} rejects failed or malformed persistence without acknowledging a saved turn`, async () => {
  const f = fixture(`write-integrity-${action}`);
  f.completeSeason();
  let rewards = 0;
  const award = async () => { rewards++; assert.fail('failed finale mutations cannot pay rewards'); };
  if (action !== 'finale_start') {
    assert.equal((await processSeasonFinale(f.db, f.owner, finaleBody(f, 'finale_start', { build: 'guardian' }), award)).accepted, true);
    if (action === 'finale_retry') f.sql.prepare("UPDATE telegram_pet_season_finales SET status='failed' WHERE pet_id=?").run(f.petId);
  }
  const before = f.battle();
  for (const response of [{ success: false, error: 'write_offline', meta: { changes: 1 } }, {}, { meta: { changes: '1' } }]) {
    f.db.beforeRun = statement => /(?:INSERT OR IGNORE INTO|UPDATE) telegram_pet_season_finales/.test(statement.query) ? response : undefined;
    await assert.rejects(processSeasonFinale(f.db, f.owner, finaleBody(f, action, {
      build: 'guardian', revision: before?.revision ?? 0, move: 'guard',
    }), award), /pet_state_write_unavailable/);
    assert.deepEqual(f.battle(), before, 'failed driver response cannot advance the saved battle');
    assert.equal(rewards, 0);
  }
});

async function win(f) {
  for (let turn = 0; turn < 20; turn++) {
    const row = f.battle(); if (row.status !== 'active') return row;
    const state = JSON.parse(row.state_json);
    const move = (state.round - 1) % 3 === 2 ? 'surge' : 'guard';
    assert.equal((await f.act(finaleBody(f, 'finale_step', { revision: row.revision, move }))).accepted, true);
  }
  assert.fail('finale did not end');
}

test('daily checklist latches every accepted goal, ignores pending actions, and survives spending without a state refresh', async () => {
  const f = fixture('daily-bits');
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=50 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=0 WHERE telegram_id=?').run(f.owner);
  for (const type of ['feed','play','clean','train','trade','buy']) f.event(type);
  const id = f.event('adventure', today, 'pending');
  assert.equal((await f.act(dailyClaim(f))).accepted, false);
  f.sql.prepare("UPDATE telegram_pet_events SET status='accepted' WHERE id=?").run(id);
  const before = await readDailyCompletion(f.db,f.owner,today,{},0,0);
  assert.equal(before.ready, true);
  assert.equal(before.progress_bits, 255);
  const response = await f.act(dailyClaim(f));
  assert.equal(response.accepted, true); assert.equal(response.pet_xp_awarded, 25);
  const snapshot = await hooks.buildPetMiniAppState(f.db,f.owner,'test-token');
  assert.equal(snapshot.guidance.missions.filter(m => m.completed).length, 7);
  assert.equal(snapshot.guidance.daily_completion.claimed, true);
});

test('an accepted official Daily Moon Run supplies durable Adventure checklist credit', async () => {
  const f = fixture('daily-run-adventure');
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=50 WHERE telegram_id=?').run(f.owner);
  for (const type of ['feed','play','clean','train','trade','buy']) f.event(type);
  f.event('daily_moon_run');
  const completion = await readDailyCompletion(f.db, f.owner, today, { daily_moon_run: 1 }, 0, 0);
  assert.equal(completion.progress_bits, 255);
  assert.equal(completion.ready, true);
  assert.equal((await f.act(dailyClaim(f))).accepted, true);
});

test('concurrent daily claims pay once, survive midnight, and match every public leaderboard period', async () => {
  const f = fixture('daily-once'); f.completeDaily();
  const rewards = await Promise.all([f.act(dailyClaim(f)), f.act(dailyClaim(f))]);
  assert.equal(rewards.filter(r => r.accepted && !r.duplicate).length, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_daily_completion'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT moon_gold,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold, 100);
  for (const period of ['daily','weekly','seasonal','all_time']) {
    const publicBoard = await f.get('/telegram-pets/leaderboard?period=' + period);
    assert.equal(publicBoard.entries[0].pet_xp, period === 'all_time' ? 225 : 25);
    const mini = await hooks.buildPetMiniAppLeaderboard(f.db,f.owner,period,25);
    assert.equal(mini.entries[0].pet_xp,publicBoard.entries[0].pet_xp);
  }
  assert.match((await f.get('/telegram-pets/activity')).items.find(x => x.event_type === 'daily_completion').text,/7\/7 daily bonus/);
  f.sql.prepare("UPDATE telegram_pet_daily_completion SET utc_day='2000-01-01',claimed_at=NULL,pet_id=NULL,season_key=NULL WHERE telegram_id=?").run(f.owner);
  const saved = await readDailyCompletion(f.db,f.owner,'2000-01-02',{},0,0);
  assert.equal(saved.ready,false); assert.equal(saved.pending[0].utc_day,'2000-01-01');
  assert.equal((await f.act({ ...dailyClaim(f), utc_day: '2000-01-01' })).accepted,true);
});

test('a failed daily payout remains assigned to its original pet after switching to an egg', async () => {
  const f = fixture('daily-retry'); f.completeDaily();
  f.db.beforeBatch = statements => { if (statements.some(s => s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && s.args.includes('pet_daily_completion'))) throw Error('payout_offline'); };
  await assert.rejects(f.act(dailyClaim(f)),/payout_offline/);
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_daily_completion WHERE telegram_id=? AND utc_day=?').get(f.owner,today).pet_id,f.petId);
  f.pet('new-egg',2,season,'egg'); f.active('new-egg');
  f.db.beforeBatch = null;
  const resumed = await f.act(dailyClaim(f)); assert.equal(resumed.accepted,true,JSON.stringify(resumed));
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp,225);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='new-egg'").get().pet_xp,200);
  assert.equal((await f.act(dailyClaim(f))).duplicate,true);
});

test('daily claim acknowledgement failures recover from the awarded receipt; forged reward amounts and caps cannot inflate XP', async () => {
  const f = fixture('daily-caps'); f.completeDaily(); f.event('test_cap',today,'accepted',1190);
  f.db.beforeRun = statement => { if (statement.query.startsWith('UPDATE telegram_pet_daily_completion SET claimed_at')) throw Error('ack_offline'); };
  const paid = await f.act({ ...dailyClaim(f), rewards: { pet_xp: 999999 } });
  assert.equal(paid.accepted,true);assert.equal(paid.refresh_state,true);assert.equal(paid.reward_pending,true);
  assert.equal(paid.pet_xp_awarded,10);assert.equal(paid.rewards.moon_gold,50);
  assert.equal(f.sql.prepare("SELECT pet_xp_awarded FROM telegram_pet_events WHERE event_type='daily_completion'").get().pet_xp_awarded,10);
  f.db.beforeRun = null;
  assert.equal((await f.act(dailyClaim(f))).duplicate,true);
  assert.ok(f.sql.prepare('SELECT claimed_at FROM telegram_pet_daily_completion WHERE telegram_id=? AND utc_day=?').get(f.owner,today).claimed_at);
  await assert.rejects(awardPetReward(f.db,{ telegram_id:f.owner,pet_id:f.petId,season_key:season,source:'pet_daily_completion',idempotency_key:'forged',context:{pet_id:f.petId,season_key:season,utc_day:today},rewards:{pet_xp:99999} }),/invalid_pet_reward_context/);
});

test('resolved daily acknowledgement errors retain the paid result and exact original pet on retry', async () => {
  const f=fixture('daily-ack-resolved');f.completeDaily();
  f.db.beforeRun=s=>s.query.startsWith('UPDATE telegram_pet_daily_completion SET claimed_at') ? {success:false,error:'ack_offline'} : null;
  const paid=await f.act(dailyClaim(f));
  assert.equal(paid.accepted,true);assert.equal(paid.refresh_state,true);assert.equal(paid.reward_pending,true);
  assert.equal(paid.pet_xp_awarded,25);assert.equal(paid.rewards.moon_gold,50);
  assert.equal(f.sql.prepare('SELECT claimed_at FROM telegram_pet_daily_completion WHERE telegram_id=?').get(f.owner).claimed_at,null);
  f.pet('daily-ack-egg',2,season,'egg');
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'daily-ack-egg')).accepted,true);
  f.db.beforeRun=null;
  const recovered=await f.act(dailyClaim(f));
  assert.equal(recovered.accepted,true);assert.equal(recovered.duplicate,true);assert.equal(recovered.reward_pending,false);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp,225);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='daily-ack-egg'").get().pet_xp,200);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_daily_completion'").get().n,1);
});

test('equipment upgrade completion supplies the shop goal without double-counting retries', async () => {
  const f=fixture('daily-upgrade'); f.completeDaily();
  f.sql.prepare('UPDATE telegram_pet_daily_completion SET progress_bits=progress_bits&223 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_system_events (id,telegram_id,system_key,action_key,period_key,status) VALUES ('gear',?,'equipment_upgrade','test','test','pending')").run(f.owner);
  assert.equal((await f.act(dailyClaim(f))).accepted,false);
  f.sql.prepare("UPDATE telegram_pet_system_events SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id='gear'").run();
  assert.equal((await f.act(dailyClaim(f))).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_system_events SET status='completed' WHERE id='gear'").run();
  assert.equal((await f.act(dailyClaim(f))).duplicate,true);
});

test('all finale builds can win with previewed tactics and fail through poor choices', () => {
  for (const build of ['striker','guardian','tactician']) {
    let state=newFinale(build),status='active';
    for(let i=0;i<20 && status==='active';i++) {
      const move=(state.round-1)%3===2?'surge':'guard';
      const preview=finaleChoices(state).find(c=>c.key===move),before=state;
      ({state,status}=advanceFinale(state,move));
      assert.equal(state.boss_health,Math.max(0,before.boss_health-preview.damage));
      assert.equal(state.health,Math.max(0,before.health-(state.boss_health?preview.taken:0)));
    }
    assert.equal(status,'won',build);
    state=newFinale(build);status='active';
    assert.equal(advanceFinale(state,'surge'),null,'unearned charge is rejected');
    for(let i=0;i<20 && status==='active';i++) ({state,status}=advanceFinale(state,'strike'));
    assert.equal(status,'failed',build);
  }
});

test('finale requires actual qualification or preserved completion, rejects foreign pets, and leaves completion history intact', async () => {
  const f=fixture('finale-gate');
  assert.equal((await f.act(finaleBody(f,'finale_start',{build:'striker',growth_marks:60,weekly_crests:10}))).accepted,false);
  assert.equal((await f.board()).pets[0].eligible,false);
  f.completeSeason();
  const completion=f.sql.prepare('SELECT * FROM telegram_pet_season_completions').get();
  assert.equal((await f.act(finaleBody(f,'finale_start',{build:'guardian',pet_id:'foreign'}))).accepted,false);
  assert.equal((await f.act(finaleBody(f,'finale_start',{build:'guardian'}))).accepted,true);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_season_completions').get(),completion);
  assert.equal((await f.act(finaleBody(f,'finale_claim'))).accepted,false);
});

test('saved finale turns reject overlaps and stale replay; failure permits a new build with monotonic revisions', async () => {
  const f=fixture('finale-turns');f.completeSeason();
  await f.act(finaleBody(f,'finale_start',{build:'striker'}));
  const body=finaleBody(f,'finale_step',{move:'strike',revision:0});
  const overlap=await Promise.all([f.act(body),f.act(body)]);
  assert.equal(overlap.filter(r=>r.accepted).length,1);assert.equal(f.battle().revision,1);
  const saved=JSON.parse(f.battle().state_json);
  assert.deepEqual((await f.board()).pets[0].state,saved,'reload returns the exact saved turn');
  while(f.battle().status==='active') await f.act(finaleBody(f,'finale_step',{move:'strike',revision:f.battle().revision}));
  const revision=f.battle().revision;
  assert.equal((await f.act(finaleBody(f,'finale_retry',{build:'guardian',revision}))).accepted,true);
  assert.equal(f.battle().revision,revision+1);assert.equal(f.battle().attempt,2);
  assert.equal((await f.act(body)).accepted,false);
  assert.equal((await win(f)).status,'won');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='season_finale'").get().n,1);
});

test('finale payout failure after victory survives an egg switch, pays the earning pet once, and appears publicly', async () => {
  const f=fixture('finale-recovery');f.completeSeason();
  await f.act(finaleBody(f,'finale_start',{build:'tactician'}));
  f.db.beforeBatch=statements=>{if(statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims')))throw Error('payout_offline');};
  assert.equal((await win(f)).status,'won');assert.equal(f.battle().claimed_at,null);
  f.pet('egg-after-finale',2,season,'egg');f.active('egg-after-finale');f.db.beforeBatch=null;
  assert.equal((await f.act(finaleBody(f,'finale_claim'))).accepted,true);
  assert.equal((await f.act(finaleBody(f,'finale_claim'))).duplicate,true);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp,300);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='egg-after-finale'").get().pet_xp,200);
  const rows=(await f.get('/telegram-pets/activity')).items.filter(x=>x.event_type==='season_finale');
  assert.equal(rows.length,1);assert.match(rows[0].text,/defeated Signal Sovereign/);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,500);
  assert.equal((await f.act(finaleBody(f,'finale_retry',{revision:f.battle().revision,build:'guardian'}))).accepted,false);
});

for (const resolved of [false,true]) test(`a saved finale claim retains its payment after a ${resolved ? 'resolved' : 'thrown'} acknowledgement failure`, async () => {
  const f=fixture('finale-ack-'+resolved);f.completeSeason();
  assert.equal((await f.act(finaleBody(f,'finale_start',{build:'tactician'}))).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_season_finales SET status='won',defeated_at=CURRENT_TIMESTAMP WHERE pet_id=?").run(f.petId);
  f.db.beforeRun=s=>{
    if (!s.query.startsWith('UPDATE telegram_pet_season_finales SET claimed_at')) return;
    if (resolved) return {success:false,error:'ack_offline'};
    throw Error('ack_offline');
  };
  const paid=await f.act(finaleBody(f,'finale_claim'));
  assert.equal(paid.accepted,true);assert.equal(paid.refresh_state,true);assert.equal(paid.reward_pending,true);
  assert.equal(paid.pet_xp_awarded,100);assert.equal(paid.rewards.moon_gold,200);assert.equal(paid.rewards.style_tokens,5);
  assert.equal(f.battle().claimed_at,null);
  f.pet('finale-ack-egg-'+resolved,2,season,'egg');
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'finale-ack-egg-'+resolved)).accepted,true);
  f.db.beforeRun=null;
  const recovered=await f.act(finaleBody(f,'finale_claim'));
  assert.equal(recovered.accepted,true);assert.equal(recovered.duplicate,true);assert.equal(recovered.reward_pending,false);
  assert.ok(f.battle().claimed_at);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp,300);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('finale-ack-egg-'+resolved).pet_xp,200);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_season_finale'").get().n,1);
  assert.equal(f.sql.prepare('SELECT moon_gold,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold,200);
});

test('a finishing finale move stays accepted when the saved victory read fails before payout', async () => {
  const f=fixture('finale-victory-read');f.completeSeason();
  await f.act(finaleBody(f,'finale_start',{build:'tactician'}));
  const state=JSON.parse(f.battle().state_json);state.boss_health=1;
  f.sql.prepare('UPDATE telegram_pet_season_finales SET state_json=? WHERE pet_id=?').run(JSON.stringify(state),f.petId);
  f.db.beforeFirst=s=>{
    if (s.query.startsWith('SELECT f.* FROM telegram_pet_season_finales') && f.battle().status==='won') throw Error('saved_victory_offline');
  };
  const won=await f.act(finaleBody(f,'finale_step',{move:'strike',revision:0}));
  assert.equal(won.accepted,true);assert.equal(won.reason,'finale_won');assert.equal(won.refresh_state,true);assert.equal(won.reward_pending,true);
  assert.equal(f.battle().status,'won');assert.equal(f.battle().revision,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_season_finale'").get().n,0);
  f.db.beforeFirst=null;
  assert.equal((await f.act(finaleBody(f,'finale_step',{move:'strike',revision:0}))).accepted,false);
  assert.equal((await f.act(finaleBody(f,'finale_claim'))).accepted,true);
  assert.equal((await f.act(finaleBody(f,'finale_claim'))).duplicate,true);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp,300);
});

test('a finishing finale move forwards an already paid reward when its acknowledgement fails', async () => {
  const f=fixture('finale-win-ack');f.completeSeason();
  await f.act(finaleBody(f,'finale_start',{build:'tactician'}));
  const state=JSON.parse(f.battle().state_json);state.boss_health=1;
  f.sql.prepare('UPDATE telegram_pet_season_finales SET state_json=? WHERE pet_id=?').run(JSON.stringify(state),f.petId);
  f.db.beforeRun=s=>{if(s.query.startsWith('UPDATE telegram_pet_season_finales SET claimed_at'))throw Error('ack_offline');};
  const won=await f.act(finaleBody(f,'finale_step',{move:'strike',revision:0}));
  assert.equal(won.accepted,true);assert.equal(won.reason,'finale_won');assert.equal(won.refresh_state,true);assert.equal(won.reward_pending,true);
  assert.equal(won.reward.accepted,true);assert.equal(won.pet_xp_awarded,100);assert.equal(won.rewards.moon_gold,200);
  assert.equal(f.battle().status,'won');assert.equal(f.battle().claimed_at,null);
  f.db.beforeRun=null;
  assert.equal((await f.act(finaleBody(f,'finale_claim'))).duplicate,true);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp,300);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_season_finale'").get().n,1);
});

test('migration 077 upgrades a pre-feature database and is safely re-runnable', async () => {
  const sql=new DatabaseSync(':memory:');
  const schema=file('schema.sql').split('-- Earned daily checklist bits')[0];
  sql.exec(schema);
  sql.exec("INSERT INTO telegram_users(telegram_id) VALUES ('migration'); INSERT INTO telegram_pet_profiles(telegram_id,moon_gold) VALUES ('migration',80)");
  const migration=file('migrations/077_moonpet_completion_rewards.sql');sql.exec(migration);sql.exec(migration);
  sql.exec("UPDATE telegram_pet_profiles SET moon_gold=0 WHERE telegram_id='migration'");
  assert.equal(sql.prepare('SELECT progress_bits FROM telegram_pet_daily_completion').get().progress_bits,128);
  assert.equal(sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,0);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('migration 083 adds durable Daily Moon Run checklist credit and is safely re-runnable', () => {
  const sql = new DatabaseSync(':memory:');
  const pre083 = file('schema.sql').replaceAll(",'daily_moon_run'", '');
  sql.exec(pre083);
  sql.exec("INSERT INTO telegram_users(telegram_id) VALUES ('migration-083'); INSERT INTO telegram_pet_profiles(telegram_id) VALUES ('migration-083')");
  const insertEvent = (id, day) => sql.prepare(`INSERT INTO telegram_pet_events
    (id,telegram_id,event_type,event_key,day_key,week_key,season_key,status) VALUES (?,?,'daily_moon_run',?,?,?,'pet-s2026-003','accepted')`)
    .run(id, 'migration-083', id, day, '2026-W40');
  insertEvent('before-083', '2026-09-29');
  sql.prepare(`INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits)
    VALUES ('migration-083','2026-09-29',191)`).run();
  assert.equal(sql.prepare("SELECT progress_bits FROM telegram_pet_daily_completion WHERE telegram_id='migration-083' AND utc_day='2026-09-29'").get().progress_bits, 191);
  const migration = file('migrations/083_moonpet_daily_run_completion_credit.sql');
  sql.exec(migration); sql.exec(migration);
  assert.equal(sql.prepare("SELECT progress_bits FROM telegram_pet_daily_completion WHERE telegram_id='migration-083' AND utc_day='2026-09-29'").get().progress_bits, 255,
    'migration 083 must backfill the Adventure bit for accepted Daily Runs written before trigger installation');
  insertEvent('after-083', '2026-09-30');
  assert.equal(sql.prepare("SELECT progress_bits FROM telegram_pet_daily_completion WHERE telegram_id='migration-083' AND utc_day='2026-09-30'").get().progress_bits, 64);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
});

test('finale qualification counts distinct days and weeks before a completion marker exists', async () => {
  const f=fixture('finale-qualified');
  for(let n=0;n<240;n++) {
    const date=new Date(Date.UTC(2026,0,1+n)).toISOString().slice(0,10);
    f.sql.prepare(`INSERT INTO telegram_pet_growth_marks (mark_id,pet_id,telegram_id,season_key,milestone_type,evidence_key,earned_day)
      VALUES (?,?,?,?,'care_milestone',?,?)`).run('mark-'+n,f.petId,f.owner,season,'care:'+n,date);
  }
  for(let n=1;n<=43;n++) f.sql.prepare(`INSERT INTO telegram_pet_weekly_crests
    (crest_id,pet_id,telegram_id,season_key,season_week,qualification_week,objective_id,evidence_key)
    VALUES (?,?,?,?,?,?,'weekly_journey',?)`).run('crest-'+n,f.petId,f.owner,season,n,n,'weekly:'+n);
  assert.equal((await f.act(finaleBody(f,'finale_start',{build:'guardian'}))).accepted,false);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_crests
    (crest_id,pet_id,telegram_id,season_key,season_week,qualification_week,objective_id,evidence_key)
    VALUES ('last',?,?,?,44,44,'weekly_journey','weekly:last')`).run(f.petId,f.owner,season);
  assert.equal((await f.board()).pets[0].eligible,true);
  assert.equal((await f.act(finaleBody(f,'finale_start',{build:'guardian'}))).accepted,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_season_completions').get().n,0,'the extra boss never rewrites season completion');
});

test('a retained completed pet keeps its finale while new rewards count in the current competition', async () => {
  const f=fixture('finale-archived');
  const old='pet-s2025-001',id='archived-finalist';
  f.pet(id,1,old);f.completeSeason(id,old);
  const original={...f,petId:id,sourceSeason:old,battle:()=>f.sql.prepare('SELECT * FROM telegram_pet_season_finales WHERE pet_id=?').get(id)};
  assert.equal((await f.act(finaleBody(original,'finale_start',{build:'guardian'}))).accepted,true);
  assert.equal((await win(original)).status,'won');
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp,200);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?').get(f.owner,season).season_xp,100);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=seasonal')).entries[0].pet_xp,100);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=daily')).entries[0].pet_xp,100);
});

test('partial schema rollout shows unavailable features, while ordinary database failures propagate', async () => {
  const f=fixture('rollout');
  f.sql.exec('DROP TABLE telegram_pet_season_finales');
  assert.equal((await f.board()).available,false);
  f.sql.exec('DROP TABLE telegram_pet_daily_completion');
  assert.deepEqual(await readDailyCompletion(f.db,f.owner,today,{feed:1},0,0),{available:false,progress_bits:1,pending:[]});
  const failing={prepare(){throw Error('storage_unavailable');}};
  await assert.rejects(getSeasonFinales(failing,f.owner,f.petId),/storage_unavailable/);
  await assert.rejects(readDailyCompletion(failing,f.owner,today,{},0,0),/storage_unavailable/);
});


test('quarter-boundary victory remains claimable while the same permanent pet starts and wins its next Finale', async () => {
  const f = fixture('finale-quarter-boundary'); f.completeSeason();
  const before = new Date('2030-09-30T23:59:59.999Z'), after = new Date('2030-10-01T00:00:00.001Z');
  const q3 = hooks.getPetSeasonInfo(before).key, q4 = hooks.getPetSeasonInfo(after).key;
  let now = before;
  const act = body => processSeasonFinale(f.db, f.owner, body, (db, request) => awardPetReward(db, { ...request, now }), now);
  const forQuarter = key => ({ ...f, act, competitionSeason: key,
    battle: () => f.sql.prepare('SELECT * FROM telegram_pet_season_finales WHERE pet_id=? AND competition_season_key=?').get(f.petId, key) });
  const previous = forQuarter(q3), current = forQuarter(q4);
  const ownership = f.sql.prepare('SELECT * FROM telegram_pet_season_slots WHERE pet_id=?').get(f.petId);
  assert.equal((await act(finaleBody(previous, 'finale_start', { build: 'guardian' }))).accepted, true);
  f.db.beforeBatch = statements => { if (statements.some(s => s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims'))) throw Error('payout_offline'); };
  assert.equal((await win(previous)).status, 'won');
  assert.equal(previous.battle().defeated_at, before.toISOString());
  assert.equal(previous.battle().claimed_at, null);
  now = after; f.db.beforeBatch = null;
  const board = await getSeasonFinales(f.db, f.owner, f.petId, now);
  assert.equal(board.competition_season_key, q4);
  assert.deepEqual(board.pets.map(p => [p.competition_season_key, p.status]), [[q4, 'not_started'], [q3, 'won']]);
  assert.equal(board.pets[0].eligible, true);
  assert.equal((await act(finaleBody(previous, 'finale_start', { build: 'guardian' }))).reason, 'finale_quarter_changed');
  assert.equal((await act(finaleBody(current, 'finale_start', { build: 'guardian' }))).accepted, true);
  assert.equal((await act(finaleBody(current, 'finale_start', { build: 'striker' }))).accepted, false);
  const currentBefore = current.battle();
  assert.equal((await act(finaleBody(current, 'finale_claim'))).accepted, false, 'old victory cannot claim this quarter');
  assert.equal((await act(finaleBody(previous, 'finale_claim', { season_key: 'foreign-ownership' }))).accepted, false);
  assert.equal((await processSeasonFinale(f.db, 'foreign-owner', finaleBody(previous, 'finale_claim'), awardPetReward, now)).accepted, false);
  f.pet('quarter-switch-pet', 2); f.active('quarter-switch-pet');
  const claims = await Promise.all([act(finaleBody(previous, 'finale_claim')), act(finaleBody(previous, 'finale_claim'))]);
  assert.equal(claims.filter(r => r.pet_xp_awarded === 100).length, 1);
  assert.equal((await act(finaleBody(previous, 'finale_claim'))).duplicate, true);
  assert.deepEqual(current.battle(), currentBefore, 'recovering the old reward cannot advance the new battle');
  assert.equal((await win(current)).status, 'won');
  assert.equal((await act(finaleBody(current, 'finale_claim'))).duplicate, true);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp, 400);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='quarter-switch-pet'").get().pet_xp, 200);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_season_slots WHERE pet_id=?').get(f.petId), ownership);
  assert.deepEqual(f.sql.prepare('SELECT season_key,season_xp FROM telegram_pet_season_state WHERE telegram_id=? ORDER BY season_key').all(f.owner).map(r => [r.season_key, r.season_xp]), [[q3,100],[q4,100]]);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_season_finale'").get().n, 2);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='season_finale'").get().n, 2);
});

test('unfinished and failed previous-quarter Finales resume independently and keep deletion blocked until settled', async () => {
  const f = fixture('finale-unfinished-rollover'); f.completeSeason();
  let now = new Date('2030-09-30T23:59:59.999Z');
  const previousKey = hooks.getPetSeasonInfo(now).key;
  const act = body => processSeasonFinale(f.db, f.owner, body, (db, request) => awardPetReward(db, { ...request, now }), now);
  const previous = { ...f, act, competitionSeason: previousKey,
    battle: () => f.sql.prepare('SELECT * FROM telegram_pet_season_finales WHERE pet_id=? AND competition_season_key=?').get(f.petId, previousKey) };
  await act(finaleBody(previous, 'finale_start', { build: 'striker' }));
  now = new Date('2030-10-01T00:00:00.001Z');
  const currentKey = hooks.getPetSeasonInfo(now).key;
  assert.equal((await act(finaleBody(f, 'finale_start', { build: 'tactician', competition_season_key: currentKey }))).accepted, true);
  assert.equal((await hooks.deletePetSlot(f.db, f.owner, { pet_id: f.petId, confirm_pet_id: f.petId, confirmed: true })).reason, 'pet_delete_blocked');
  while (previous.battle().status === 'active') await act(finaleBody(previous, 'finale_step', { move: 'strike', revision: previous.battle().revision }));
  assert.equal(previous.battle().status, 'failed');
  const board = await getSeasonFinales(f.db, f.owner, f.petId, now);
  assert.equal(board.pets.find(p => p.competition_season_key === previousKey).playable, true);
  const revision = previous.battle().revision;
  assert.equal((await act(finaleBody(previous, 'finale_retry', { build: 'guardian', revision }))).accepted, true);
  assert.equal((await act(finaleBody(previous, 'finale_retry', { build: 'guardian', revision }))).accepted, false);
  assert.equal((await win(previous)).status, 'won');
  assert.equal(f.sql.prepare('SELECT revision FROM telegram_pet_season_finales WHERE competition_season_key=?').get(currentKey).revision, 0);
});

test('migration 088 retains legacy rows, original ownership and exact paid reward keys through rollover recovery', async () => {
  const f = fixture('finale-migration-088', true); f.completeSeason();
  await hooks.getPetProfile(f.db, f.owner);
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=300 WHERE pet_id=?').run(f.petId);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=300,moon_gold=200,style_tokens=5 WHERE telegram_id=?').run(f.owner);
  const victory = '2030-09-30T23:59:59.999Z', later = '2030-10-01T01:00:00.000Z';
  const oldQuarter = hooks.getPetSeasonInfo(new Date(victory)).key;
  const key = `season-finale:${f.petId}:${season}`;
  f.sql.prepare(`INSERT INTO telegram_pet_season_finales
    (pet_id,telegram_id,season_key,status,state_json,defeated_at,updated_at)
    VALUES (?,?,?,'won',?,?,?)`).run(f.petId, f.owner, season, JSON.stringify(newFinale('guardian')), victory, later);
  f.sql.prepare(`INSERT INTO telegram_pet_reward_claims
    (claim_id,pet_id,telegram_id,source,idempotency_key,day_key,status,applied_rewards,awarded_at)
    VALUES ('legacy-paid',?,?,'pet_season_finale',?,'2030-09-30','awarded','{"pet_xp":100,"moon_gold":200,"style_tokens":5}',?)`).run(f.petId, f.owner, key, victory);
  const before = f.battle(), receipt = f.sql.prepare("SELECT * FROM telegram_pet_reward_claims WHERE claim_id='legacy-paid'").get();
  const ownership = f.sql.prepare('SELECT * FROM telegram_pet_season_slots').all();
  assert.equal((await f.board()).available, false, 'pre-migration rollout is explicitly unavailable');
  f.sql.exec(file('migrations/088_moonpet_finale_competition_quarters.sql'));
  const migrated = f.battle();
  for (const field of Object.keys(before)) assert.equal(migrated[field], before[field], field + ' is retained verbatim');
  assert.equal(migrated.competition_season_key, oldQuarter, 'victory time wins over delayed update/claim time');
  assert.equal(migrated.reward_key, key);
  const result = await processSeasonFinale(f.db, f.owner, finaleBody(f, 'finale_claim', { competition_season_key: oldQuarter }), awardPetReward, new Date(later));
  assert.equal(result.accepted, true); assert.equal(result.duplicate, true); assert.ok(f.battle().claimed_at);
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_reward_claims WHERE claim_id='legacy-paid'").get(), receipt);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_season_slots').all(), ownership);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp, 300, 'already-paid legacy receipt never pays again');
  assert.equal((await processSeasonFinale(f.db, f.owner, finaleBody(f, 'finale_start', { competition_season_key: hooks.getPetSeasonInfo(new Date(later)).key, build: 'guardian' }), awardPetReward, new Date(later))).accepted, true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_season_finales').get().n, 2);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(), []);
});

test('Missions and Profile preserve a retained pet’s Finale Victor achievement beside its fresh current-quarter battle', async () => {
  const f = fixture('finale-achievement-rollover');
  const sourceSeason = 'pet-s2025-001', petId = 'retained-quarter-victor';
  f.pet(petId, 1, sourceSeason); f.completeSeason(petId, sourceSeason);
  f.sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?').run(petId, sourceSeason, f.owner);
  const date = new Date(), prior = new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 0, 23, 59, 59));
  const previous = hooks.getPetSeasonInfo(prior).key;
  f.sql.prepare(`INSERT INTO telegram_pet_season_finales
    (pet_id,telegram_id,season_key,competition_season_key,reward_key,status,state_json,defeated_at,claimed_at)
    VALUES (?,?,?,?,?,'won',?,?,?)`).run(petId, f.owner, sourceSeason, previous,
      `season-finale-quarter:${petId}:${previous}`, JSON.stringify(newFinale('guardian')), prior.toISOString(), prior.toISOString());
  for (const mode of ['full', 'missions']) {
    const snapshot = await hooks.buildPetMiniAppState(f.db, f.owner, 'test-token', { mode });
    const achievement = snapshot.guidance.achievements.find(a => a.achievement_id === 'finale_victor');
    assert.equal(achievement.pet_id, petId); assert.equal(achievement.season_key, sourceSeason);
    assert.equal(achievement.progress, 1); assert.equal(achievement.unlocked_at, prior.toISOString());
    assert.equal(snapshot.season_finales.pets.find(p => p.pet_id === petId && p.competition_season_key === season).status, 'not_started');
  }
});

for (const [status, updatedAt] of [['active', '2030-09-30 23:59:59'], ['failed', '2030-09-30 23:59:59'], ['active', 'legacy-unknown-time']]) {
  test(`migration 088 preserves and resumes legacy ${status} Finale with ${updatedAt.startsWith('2030') ? 'saved battle time' : 'unparseable time'} without replacing ownership`, async () => {
    const f = fixture('finale-legacy-' + status + '-' + updatedAt, true); f.completeSeason();
    const now = new Date('2030-10-01T01:00:00.000Z');
    const oldQuarter = updatedAt.startsWith('2030') ? 'pet-s2030-003' : season;
    const nextQuarter = hooks.getPetSeasonInfo(now).key;
    const state = newFinale('guardian');
    state.round = 3; state.charge = 2; state.last = 'Previously saved battle';
    if (status === 'failed') state.health = 0;
    f.sql.prepare(`INSERT INTO telegram_pet_season_finales
      (pet_id,telegram_id,season_key,status,attempt,revision,state_json,updated_at)
      VALUES (?,?,?,?,4,8,?,?)`).run(f.petId, f.owner, season, status, JSON.stringify(state), updatedAt);
    const before = f.battle();
    const ownership = f.sql.prepare('SELECT * FROM telegram_pet_season_slots').all();
    const pet = f.sql.prepare('SELECT * FROM telegram_pet_instances').get();
    f.sql.exec(file('migrations/088_moonpet_finale_competition_quarters.sql'));
    const migrated = f.battle();
    for (const key of Object.keys(before)) assert.equal(migrated[key], before[key], key + ' must remain intact');
    assert.equal(migrated.competition_season_key, oldQuarter);
    assert.equal(migrated.reward_key, `season-finale:${f.petId}:${season}`);
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_season_slots').all(), ownership);
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_instances').get(), pet);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_reward_claims').get().n, 0);
    assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(), []);
    const act = body => processSeasonFinale(f.db, f.owner, body, (db, request) => awardPetReward(db, { ...request, now }), now);
    const old = { ...f, act, competitionSeason: oldQuarter,
      battle: () => f.sql.prepare('SELECT * FROM telegram_pet_season_finales WHERE pet_id=? AND competition_season_key=?').get(f.petId, oldQuarter) };
    assert.equal((await act(finaleBody(f, 'finale_start', { competition_season_key: nextQuarter, build: 'striker' }))).accepted, true);
    if (status === 'failed') {
      assert.equal((await act(finaleBody(old, 'finale_retry', { build: 'guardian', revision: 8 }))).accepted, true);
      assert.equal(old.battle().attempt, 5);
      assert.equal((await act(finaleBody(old, 'finale_retry', { build: 'guardian', revision: 8 }))).accepted, false);
    }
    assert.equal((await win(old)).status, 'won');
    assert.equal((await act(finaleBody(old, 'finale_claim'))).duplicate, true);
    assert.equal(f.sql.prepare('SELECT revision FROM telegram_pet_season_finales WHERE competition_season_key=?').get(nextQuarter).revision, 0);
    assert.equal(f.sql.prepare('SELECT idempotency_key FROM telegram_pet_reward_claims').get().idempotency_key, migrated.reward_key);
    assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE season_key=?').get(oldQuarter).season_xp, 100);
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_season_slots').all(), ownership);
  });
}

test('an archived pet can recover its migrated unpaid Finale once without regaining play or redirecting reward to the replacement', async () => {
  const f = fixture('finale-archived-unpaid', true); f.completeSeason();
  await hooks.getPetProfile(f.db, f.owner);
  const defeatedAt = '2030-09-30T23:59:59.999Z', now = new Date('2030-10-01T01:00:00.000Z');
  const oldQuarter = hooks.getPetSeasonInfo(new Date(defeatedAt)).key;
  const nextQuarter = hooks.getPetSeasonInfo(now).key;
  f.sql.prepare(`INSERT INTO telegram_pet_season_finales
    (pet_id,telegram_id,season_key,status,state_json,defeated_at,updated_at)
    VALUES (?,?,?,'won',?,?,?)`).run(f.petId, f.owner, season, JSON.stringify({ ...newFinale('guardian'), boss_health: 0 }), defeatedAt, defeatedAt);
  f.sql.exec(file('migrations/088_moonpet_finale_competition_quarters.sql'));
  const originalKey = f.battle().reward_key;
  f.pet('archived-finale-replacement', 2, season, 'egg');
  f.active('archived-finale-replacement');
  f.sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id=?").run(f.petId);
  f.sql.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id=?").run(f.petId);
  const ownership = f.sql.prepare('SELECT * FROM telegram_pet_season_slots ORDER BY pet_id').all();
  const board = await getSeasonFinales(f.db, f.owner, 'archived-finale-replacement', now);
  const victory = board.pets.find(row => row.pet_id === f.petId && row.competition_season_key === oldQuarter);
  assert.equal(victory.status, 'won'); assert.equal(victory.claimed, false);
  assert.equal(victory.playable, false); assert.equal(victory.eligible, false);
  const claim = finaleBody(f, 'finale_claim', { competition_season_key: oldQuarter });
  const act = body => processSeasonFinale(f.db, f.owner, body, (db, request) => awardPetReward(db, { ...request, now }), now);
  assert.equal((await act(claim)).pet_xp_awarded, 100);
  assert.equal((await act(claim)).duplicate, true);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).pet_xp, 300);
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='archived-finale-replacement'").get().pet_xp, 200);
  assert.equal(f.sql.prepare('SELECT idempotency_key FROM telegram_pet_reward_claims').get().idempotency_key, originalKey);
  assert.ok(f.battle().claimed_at);
  assert.equal((await act(finaleBody(f, 'finale_start', { competition_season_key: nextQuarter, build: 'guardian' }))).accepted, false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_season_finales WHERE pet_id=?').get(f.petId).n, 1);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_season_slots ORDER BY pet_id').all(), ownership);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).status, 'archived');
  assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner).pet_id, 'archived-finale-replacement');
});

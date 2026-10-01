import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { readDailyCompletion, getSeasonFinales, newFinale, advanceFinale, finaleChoices } from '../workers/moonboys-api/pets/completion-features.js';

const today = new Date().toISOString().slice(0, 10), season = hooks.getPetSeasonInfo(new Date()).key;
function weekKey() { const d=new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7)); return `${d.getUTCFullYear()}-W${String(Math.ceil(((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000+1)/7)).padStart(2,'0')}`; }
const file = name => fs.readFileSync(new URL('../workers/moonboys-api/' + name, import.meta.url), 'utf8');
function fixture(owner) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(file('schema.sql'));
  for (const migration of ['048_telegram_pet_player_expansion.sql', '058_telegram_pet_season_completion.sql', '061_moonpet_season_economy_calibration.sql', '085_permanent_pet_weekly_evidence.sql']) sql.exec(file('migrations/' + migration));
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
  const act = body => hooks.processPetMiniAppAction(db, owner, { id: owner }, body, 'test-token');
  const board = () => getSeasonFinales(db, owner, petId);
  const battle = () => sql.prepare('SELECT * FROM telegram_pet_season_finales WHERE pet_id=?').get(petId);
  const get = async path => { const response = await worker.fetch(new Request('https://test.local' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, petId, pet, active, event, completeDaily, completeSeason, act, board, battle, get };
}
const dailyClaim = f => ({ action: 'daily_completion_claim', utc_day: today, pet_id: f.petId });
const finaleBody = (f, action, extra = {}) => ({ action, pet_id: f.petId, season_key: f.sourceSeason || season, ...extra });
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
  await assert.rejects(f.act({ ...dailyClaim(f), rewards: { pet_xp: 999999 } }), /ack_offline/);
  assert.equal(f.sql.prepare("SELECT pet_xp_awarded FROM telegram_pet_events WHERE event_type='daily_completion'").get().pet_xp_awarded,10);
  f.db.beforeRun = null;
  assert.equal((await f.act(dailyClaim(f))).duplicate,true);
  assert.ok(f.sql.prepare('SELECT claimed_at FROM telegram_pet_daily_completion WHERE telegram_id=? AND utc_day=?').get(f.owner,today).claimed_at);
  await assert.rejects(awardPetReward(f.db,{ telegram_id:f.owner,pet_id:f.petId,season_key:season,source:'pet_daily_completion',idempotency_key:'forged',context:{pet_id:f.petId,season_key:season,utc_day:today},rewards:{pet_xp:99999} }),/invalid_pet_reward_context/);
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

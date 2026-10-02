import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import { createDailyMoonRun } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { recoverDeletedPetRunStarts } from '../workers/moonboys-api/pets/run-ownership.js';

// Execute the production SQL against SQLite. Injection happens before the
// transaction, or rolls the entire transaction back: never partial D1 commits.
let fixtureId = 981900;
function fixture(label) {
  const owner = String(++fixtureId);
  const sql = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/048_telegram_pet_player_expansion.sql',
    'migrations/058_telegram_pet_season_completion.sql', 'migrations/061_moonpet_season_economy_calibration.sql']) {
    sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/' + file, import.meta.url), 'utf8'));
  }
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    async first() { const injected = await db.beforeFirst?.(this); return injected === undefined ? sql.prepare(this.query).get(...this.args) || null : injected; }
    async all() { return { success: true, results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      const prepared = sql.prepare(this.query);
      if (prepared.columns().length) {
        const results = prepared.all(...this.args);
        return { success: true, results, meta: { changes: /\bRETURNING\b/i.test(this.query) ? results.length : 0 } };
      }
      return { success: true, results: [], meta: { changes: Number(prepared.run(...this.args).changes) } };
    }
    async run() { const injected = await db.beforeRun?.(this); return injected === undefined ? this.exec() : injected; }
  }
  const db = {
    prepare: query => new Statement(query),
    async batch(statements) {
      const injected = await this.beforeBatch?.(statements);
      if (injected !== undefined) return injected;
      sql.exec('BEGIN');
      let results;
      try {
        results = statements.map((statement, index) => {
          const result = statement.exec();
          this.insideBatch?.(statement, index);
          return result;
        });
        sql.exec('COMMIT');
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
      await this.afterBatch?.(statements);
      return results;
    },
  };
  const season = hooks.getPetSeasonInfo(new Date()).key, petId = `pet-${owner}`;
  sql.prepare('INSERT INTO telegram_users (telegram_id,first_name) VALUES (?,?)').run(owner, 'Run authority');
  sql.prepare('INSERT INTO telegram_pet_profiles (telegram_id,pet_xp,energy,moon_gold) VALUES (?,200,100,1000)').run(owner);
  sql.exec("INSERT INTO telegram_seasons (name,start_date,end_date) VALUES ('Community','2000-01-01','2999-01-01')");
  function pet(id, sourceSeason = season, xp = 200, slot = 1) {
    sql.prepare("INSERT INTO telegram_pet_season_slots (pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES (?,?,?,?,'free')").run(id,owner,sourceSeason,slot);
    sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,energy,source_profile_updated_at) VALUES (?,?,?,?,?,100,'0001-01-01 00:00:00')").run(id,owner,sourceSeason,slot,xp);
    sql.prepare("INSERT INTO telegram_pet_lifecycle_by_pet (pet_id,telegram_id,identity_seed,phase,species_id,incubation_json,innate_traits_json) VALUES (?,?,?,'young','vinyl_crab','{}','[]')").run(id,owner,id);
  }
  pet(petId);
  sql.prepare('INSERT INTO telegram_pet_active_slots (telegram_id,pet_id,season_key) VALUES (?,?,?)').run(owner,petId,season);
  function run(id, { sourcePet = petId, sourceSeason = season, depth = 2, status = 'active', xp = 24, gold = 9, evidence = true } = {}) {
    sql.prepare(`INSERT INTO telegram_pet_runs (id,run_id,telegram_id,pet_id,season_key,status,depth,current_room,max_depth,max_room,unbanked_pet_xp,unbanked_moon_gold)
      VALUES (?,?,?,?,?,?,?,?,100,100,?,?)`).run(id,id,owner,sourcePet,sourceSeason,status,depth,depth,xp,gold);
    if (evidence && depth > 0) sql.prepare(`INSERT INTO telegram_pet_run_steps (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success)
      VALUES (?,?,?,?,?,'fight','fight',?,1)`).run(`${id}-step`,id,owner,sourcePet,depth,`${id}-step`);
  }
  const select = (id, sourceSeason = season) => sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?').run(id,sourceSeason,owner);
  const remove = () => hooks.deletePetSlot(db, owner, { pet_id: petId, confirmed: true, confirm_pet_id: petId });
  const api = async body => {
    const response = await worker.fetch(new Request('https://moonboys-api.test/telegram-pets/action', {
      method:'POST', headers:{'content-type':'application/json','x-pets-bot-secret':'fixture-secret'}, body:JSON.stringify({telegram_id:owner,...body}),
    }), {DB:db,TELEGRAM_PETS_BOT_SECRET:'fixture-secret'});
    assert.equal(response.status,409);
    return response.json();
  };
  return {sql,db,owner,petId,season,pet,run,select,remove,api};
}
const isRunInsert = statement => /INSERT OR IGNORE INTO telegram_pet_runs\s/.test(statement.query);
const isStepBatch = statements => statements.some(s => /INSERT OR IGNORE INTO telegram_pet_run_steps/.test(s.query));
const readRun = (f,id) => f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(id);
const count = (f,table) => f.sql.prepare(`SELECT COUNT(*) n FROM ${table}${table === 'telegram_pet_reward_claims' ? " WHERE source IN ('pet_run_legacy','roguelite_completion','roguelite_boss')" : ''}`).get().n;
const firstChoice = (id,depth) => hooks.buildPetRunChoiceReplyMarkup({run_id:id,depth,max_depth:100,unbanked_items:'{}'}).inline_keyboard[0][0].callback_data.split(':').at(-1);

for (const differentPet of [false,true]) test(`final-step replay cannot complete another ${differentPet ? 'pet' : 'run'}`, async () => {
  const f = fixture(`replay-${differentPet}`);
  await hooks.getPetProfile(f.db,f.owner);
  f.run('paid-original',{status:'completed',depth:100});
  f.sql.prepare("UPDATE telegram_pet_run_steps SET event_key=? WHERE run_id='paid-original'").run(`mini:${f.owner}:run_step:old-request`);
  assert.equal((await hooks.recoverPetStandardRunEndings(f.db,f.owner,'paid-original'))[0].accepted,true);
  const sourcePet = differentPet ? 'retained-pet' : f.petId, sourceSeason = differentPet ? 'pet-s2025-001' : f.season;
  if (differentPet) { f.pet(sourcePet,sourceSeason,500); f.select(sourcePet,sourceSeason); }
  f.run('fresh-partial',{sourcePet,sourceSeason});
  const before = readRun(f,'fresh-partial'), xp = f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all();
  const body = {action:'run_step',run_id:'fresh-partial',choice_key:'fight',request_id:'old-request'};
  const replies = await Promise.all([1,2].map(() => dispatchRenderedPetAction(f.db,f.owner,{id:f.owner},body,'fixture-token')));
  for (const reply of replies) { assert.equal(reply.accepted,false); assert.equal(reply.reason,'run_step_source_mismatch'); }
  assert.deepEqual(readRun(f,'fresh-partial'),before);
  assert.deepEqual(f.sql.prepare('SELECT pet_id,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all(),xp);
  assert.equal(count(f,'telegram_pet_reward_claims'),1);
  const foreign = await hooks.processPetRunStep(f.db,'another-owner','fresh-partial','fight',{event_key:`mini:${f.owner}:run_step:old-request`});
  assert.equal(foreign.accepted,false); assert.equal(foreign.reason,'run_not_found');
  const originalRetry = await hooks.processPetRunStep(f.db,f.owner,'paid-original','fight',{event_key:`mini:${f.owner}:run_step:old-request`});
  assert.equal(originalRetry.accepted,true); assert.equal(originalRetry.duplicate,true);
  assert.equal(count(f,'telegram_pet_reward_claims'),1);
});

test('room 100 saves its earning timestamp with the step and recovers the original quarter/day cap', async t => {
  const f = fixture('quarter-final'); await hooks.getPetProfile(f.db,f.owner);
  f.run('final',{depth:99,gold:0});
  f.sql.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status)
    VALUES ('earlier',?,?,'train','earlier',1190,?,'2026-09-30','2026-W40','accepted')`).run(f.petId,f.owner,f.season);
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-09-30T23:59:59Z')});
  let interrupted = false;
  f.db.afterBatch = statements => {
    if (!isStepBatch(statements)) return;
    f.db.afterBatch = null;
    f.db.beforeFirst = statement => {
      if (!statement.query.includes('FROM telegram_pet_runs') || !statement.query.includes('run_id = ?')) return;
      f.db.beforeFirst = null; interrupted = true; throw Error('saved_step_response_lost');
    };
  };
  t.mock.method(Math,'random',() => .99);
  const accepted = await hooks.processPetRunStep(f.db,f.owner,'final',firstChoice('final',99),{event_key:'earned-step-100'});
  assert.equal(accepted.accepted,true,JSON.stringify(accepted)); assert.equal(accepted.refresh_state,true,JSON.stringify(accepted)); assert.equal(interrupted,true);
  assert.equal(readRun(f,'final').completed_at,'2026-09-30T23:59:59.000Z');
  assert.equal(readRun(f,'final').depth,100);
  t.mock.timers.setTime(Date.parse('2026-10-01T00:00:01Z'));
  const recovered = (await hooks.recoverPetStandardRunEndings(f.db,f.owner,'final'))[0];
  assert.equal(recovered.accepted,true); assert.equal(recovered.pet_xp_awarded,10);
  const receipt = f.sql.prepare("SELECT day_key,week_key,pet_xp_awarded FROM telegram_pet_events WHERE event_type='run_complete'").get();
  assert.deepEqual({...receipt},{day_key:'2026-09-30',week_key:'2026-W40',pet_xp_awarded:10});
  assert.equal(f.sql.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key='pet-s2026-003'").get(f.owner).season_xp,10);
  assert.equal(f.sql.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key='pet-s2026-004'").get(f.owner)?.season_xp || 0,0);
  await hooks.recoverPetStandardRunEndings(f.db,f.owner,'final');
  assert.equal(count(f,'telegram_pet_reward_claims'),1); assert.equal(readRun(f,'final').completed_at,'2026-09-30T23:59:59.000Z');
});

for (const status of ['extractable','completed']) test(`old ${status} final-step recovery uses intact original evidence without changing it`, async t => {
  const f = fixture(`old-${status}`); await hooks.getPetProfile(f.db,f.owner);
  f.run('old-final',{depth:100,status});
  f.sql.exec("UPDATE telegram_pet_run_steps SET created_at='2026-09-30 23:59:59'");
  const originalStep = f.sql.prepare('SELECT * FROM telegram_pet_run_steps').get();
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-01T00:00:01Z')});
  const recovered = (await hooks.recoverPetStandardRunEndings(f.db,f.owner,'old-final'))[0];
  assert.equal(recovered.accepted,true); assert.equal(readRun(f,'old-final').completed_at,'2026-09-30 23:59:59');
  assert.equal(f.sql.prepare("SELECT day_key FROM telegram_pet_events WHERE event_type='run_complete'").get().day_key,'2026-09-30');
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_run_steps').get(),originalStep);
  assert.equal(f.sql.prepare("SELECT season_xp FROM telegram_pet_season_state WHERE season_key='pet-s2026-003'").get().season_xp,24);
});

for (const invalid of ['missing','other-pet','failed','invalid-date']) test(`old final without ${invalid === 'missing' ? '' : 'valid '}terminal evidence (${invalid}) cannot invent a reward`, async () => {
  const f = fixture(`invalid-${invalid}`); await hooks.getPetProfile(f.db,f.owner);
  f.run('old-final',{depth:100,status:'extractable',evidence:invalid!=='missing'});
  if (invalid==='other-pet') { f.pet('other',f.season,200,2); f.sql.exec("UPDATE telegram_pet_run_steps SET pet_id='other'"); }
  if (invalid==='failed') f.sql.exec('UPDATE telegram_pet_run_steps SET success=0');
  if (invalid==='invalid-date') f.sql.exec("UPDATE telegram_pet_run_steps SET created_at='not-a-date'");
  const before = readRun(f,'old-final');
  const recovered = await hooks.recoverPetStandardRunEndings(f.db,f.owner,'old-final');
  assert.ok(recovered.every(result=>!result.accepted));
  assert.deepEqual(readRun(f,'old-final'),before); assert.equal(count(f,'telegram_pet_reward_claims'),0);
});

for (const mode of ['failed','throw']) test(`whole final-step batch ${mode} leaves no terminal timestamp or partial cost`, async t => {
  const f = fixture(`batch-${mode}`); await hooks.getPetProfile(f.db,f.owner); f.run('final',{depth:99});
  const before = readRun(f,'final'), petBefore=f.sql.prepare('SELECT pet_xp,energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId);
  t.mock.method(Math,'random',()=>.99);
  if (mode==='failed') f.db.beforeBatch = statements => isStepBatch(statements) ? statements.map(()=>({success:false,results:[],meta:{changes:0}})) : undefined;
  else f.db.insideBatch = statement => { if (/INSERT OR IGNORE INTO telegram_pet_run_steps/.test(statement.query)) throw Error('whole_batch_rollback'); };
  await assert.rejects(hooks.processPetRunStep(f.db,f.owner,'final',firstChoice('final',99),{event_key:'earned-step-100'}),/pet_state_write_unavailable|whole_batch_rollback/);
  assert.deepEqual(readRun(f,'final'),before); assert.equal(count(f,'telegram_pet_run_steps'),1);
  assert.deepEqual(f.sql.prepare('SELECT pet_xp,energy FROM telegram_pet_instances WHERE pet_id=?').get(f.petId),petBefore);
  f.db.beforeBatch=null; f.db.insideBatch=null;
  assert.equal((await hooks.processPetRunStep(f.db,f.owner,'final',firstChoice('final',99),{event_key:'earned-step-100'})).accepted,true);
  assert.equal(count(f,'telegram_pet_reward_claims'),1);
});

for (const type of ['Standard','Daily']) for (const surface of ['direct','api','mini']) test(`${surface} ${type} start loses safely to confirmed deletion`, async () => {
  const f = fixture(`delete-${surface}-${type}`); await hooks.getPetProfile(f.db,f.owner);
  let deleted=false;
  const deleteBeforeInsert = async statements => {
    if (!statements.some(isRunInsert)) return;
    f.db.beforeRun=null; f.db.beforeBatch=null;
    const result=await f.remove(); assert.equal(result.accepted,true); deleted=true;
  };
  f.db.beforeRun = statement => deleteBeforeInsert([statement]);
  f.db.beforeBatch = deleteBeforeInsert;
  let result;
  if (surface==='api') result=await f.api({action:type==='Standard'?'run':'daily_run'});
  else if (surface==='mini') result=await dispatchRenderedPetAction(f.db,f.owner,{id:f.owner},{action:type==='Standard'?'run_start':'daily_run_start'},'fixture-token');
  else result=type==='Standard' ? await hooks.startOrResumePetRun(f.db,f.owner) : await createDailyMoonRun(f.db,{telegram_id:f.owner});
  assert.equal(deleted,true); assert.equal(result.accepted,false);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).status,'archived');
  assert.equal(count(f,'telegram_pet_runs'),0); assert.equal(count(f,'telegram_pet_run_analytics'),0); assert.equal(count(f,'telegram_pet_daily_runs'),0);
  assert.equal(count(f,'telegram_pet_reward_claims'),0);
});

for (const type of ['Standard','Daily']) test(`${type} insertion winning the race blocks deletion, and a selected-pet switch rejects a stale insert`, async () => {
  const f = fixture(`start-wins-${type}`); await hooks.getPetProfile(f.db,f.owner);
  const start = () => type==='Standard' ? hooks.startOrResumePetRun(f.db,f.owner) : createDailyMoonRun(f.db,{telegram_id:f.owner});
  const second='second-pet'; f.pet(second,'pet-s2025-001');
  const switchBeforeInsert = statements => { if (statements.some(isRunInsert)) { f.select(second,'pet-s2025-001'); f.db.beforeRun=null; f.db.beforeBatch=null; } };
  if (type==='Standard') f.db.beforeRun = statement => switchBeforeInsert([statement]); else f.db.beforeBatch=switchBeforeInsert;
  assert.equal((await start()).accepted,false); assert.equal(count(f,'telegram_pet_runs'),0);
  f.select(f.petId); assert.equal((await start()).accepted,true);
  assert.equal((await f.remove()).accepted,false); assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).status,'active');
  assert.equal(count(f,'telegram_pet_runs'),1);
});

for (const type of ['Standard','Daily']) for (const mode of ['failed','throw','malformed']) test(`${type} ${mode} creation is unavailable, then a healthy retry starts exactly once`, async () => {
  const f=fixture(`start-fail-${type}-${mode}`); await hooks.getPetProfile(f.db,f.owner);
  const rejected=mode==='malformed'?{success:true,results:[]}:{success:false,error:'write_unavailable',results:[],meta:{changes:0}};
  if (type==='Standard') f.db.beforeRun=statement=>{if(isRunInsert(statement)) {if(mode==='throw') throw Error('write_unavailable'); return rejected;}};
  else if (mode!=='throw') f.db.beforeBatch=statements=>statements.some(isRunInsert)?statements.map(()=>rejected):undefined;
  else f.db.insideBatch=statement=>{if(isRunInsert(statement)) throw Error('write_unavailable');};
  const start=()=>type==='Standard'?hooks.startOrResumePetRun(f.db,f.owner):createDailyMoonRun(f.db,{telegram_id:f.owner});
  await assert.rejects(start(),/write_unavailable/);
  assert.equal(count(f,'telegram_pet_runs'),0); assert.equal(count(f,'telegram_pet_run_analytics'),0); assert.equal(count(f,'telegram_pet_daily_runs'),0);
  f.db.beforeRun=null; f.db.beforeBatch=null; f.db.insideBatch=null;
  assert.equal((await start()).accepted,true); await start();
  assert.equal(count(f,'telegram_pet_runs'),1); assert.equal(count(f,'telegram_pet_reward_claims'),0);
});

for (const progressed of [false,true]) test(`${progressed?'progressed':'empty'} historic deleted-pet run preserves evidence and never pays invented rewards`, async () => {
  const f=fixture(`orphan-${progressed}`); await hooks.getPetProfile(f.db,f.owner);
  assert.equal((await f.remove()).accepted,true);
  f.run('historic-orphan',{depth:progressed?2:0,xp:progressed?24:0,gold:0});
  const steps=f.sql.prepare('SELECT * FROM telegram_pet_run_steps').all();
  assert.equal(await recoverDeletedPetRunStarts(f.db,f.owner),progressed?0:1);
  assert.equal(await recoverDeletedPetRunStarts(f.db,f.owner),0);
  const result=await hooks.startOrResumePetRun(f.db,f.owner);
  assert.equal(result.accepted,!progressed);
  if(progressed) assert.equal(result.reason,'run_source_recovery_required');
  assert.equal(readRun(f,'historic-orphan').status,progressed?'active':'abandoned');
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_run_steps').all(),steps);
  assert.equal(count(f,'telegram_pet_reward_claims'),0);
  assert.equal(f.sql.prepare('SELECT status,pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(f.petId).status,'archived');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_identity_events WHERE event_key=?').get(`pet:delete:${f.petId}`).n,1);
});

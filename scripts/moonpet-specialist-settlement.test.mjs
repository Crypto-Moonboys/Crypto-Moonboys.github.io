import { getPetEquipmentUpgradeQuote } from '../workers/moonboys-api/pets/live-systems.js';
import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { applyPetRuntimeAward, getPetRuntimeSourceDropRoll, getOrCreatePetRuntimeState } from '../workers/moonboys-api/pets/runtime-phase-5a.js';
import { resolvePetRareDrop } from '../workers/moonboys-api/pets/economy-phase-3.js';
import worker, { applyPetRuntimeCommandAward, __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { getActiveSeasonalBoss } from '../workers/moonboys-api/pets/live-systems.js';
import { recoverPetRuntimeAwards } from '../workers/moonboys-api/pets/runtime-recovery.js';

const now = new Date();
const currentSeason = hooks.getPetSeasonInfo(now).key;
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
    if (this.beforeBatch) { const reply = await this.beforeBatch(statements); if (reply !== undefined) return reply; }
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
  const act = body => dispatchRenderedPetAction(db,owner,{id:owner},body,'fixture-token');
  const reveal = id => sql.prepare("INSERT INTO telegram_pet_evolutions_by_pet (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,'elite_moonpet',3,'reveal')").run(id,owner);
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, reveal, state, get };
}

function authority(f) { return { pet_id: 'current-'+f.owner, season_key: currentSeason }; }
function runtime(f,key,day,action='feed',options={}) { return applyPetRuntimeAward(f.db,f.owner,key,action,{...authority(f),day_key:day,...options}); }
function progress(f) { return f.sql.prepare('SELECT * FROM telegram_pet_specialist_progression WHERE pet_id=?').get('current-'+f.owner); }

const day = now.toISOString().slice(0, 10);
const countReceipts = f => f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_specialist_events').get().n;
function equipArmor(f) {
  f.sql.prepare("UPDATE telegram_pet_instances SET equipped_outfit='moon_armor' WHERE telegram_id=?").run(f.owner);
  f.sql.prepare("UPDATE telegram_pet_profiles SET equipped_outfit='moon_armor' WHERE telegram_id=?").run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'moon_armor','outfit')").run(f.owner);
}
function signedState(f) {
  const token='123456:fixture-only-token';
  const fields=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(f.owner),first_name:'Fixture'})});
  const check=[...fields.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  fields.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));
  return worker.fetch(new Request('https://moonboys-api.test/telegram-pets/app/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({init_data:fields.toString()})}),{DB:f.db,TELEGRAM_BOT_TOKEN:token});
}

for (const source of ['pet','faction','equipment']) for (const mode of ['resolved','malformed','thrown']) {
  test(`${source} ${mode} evidence leaves the specialist award recoverable`, async () => {
    const f=fixture(`evidence-${source}-${mode}`); equipArmor(f);
    f.sql.prepare("INSERT INTO blocktopia_progression (telegram_id,faction) VALUES (?,'hard-fork-rockers')").run(f.owner);
    const matches=query=>source==='pet' ? query==='SELECT * FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=?'
      : source==='faction' ? query==='SELECT faction FROM blocktopia_progression WHERE telegram_id=?'
      : query.includes('FROM telegram_pet_equipment_progression WHERE telegram_id = ?');
    const fault=statement=>{
      if (!matches(statement.query)) return;
      if (mode==='thrown') throw Error('required_evidence_failed');
      return mode==='resolved' ? {success:false,error:'required_evidence_failed'} : source==='equipment' ? {results:[{}]} : {};
    };
    f.db.beforeFirst=fault; f.db.beforeAll=fault;
    assert.equal(await applyPetRuntimeCommandAward(f.db,f.owner,'required-evidence','train',authority(f)),null);
    assert.equal(countReceipts(f),0);
    f.db.beforeFirst=null; f.db.beforeAll=null;
    const recovered=await applyPetRuntimeCommandAward(f.db,f.owner,'required-evidence','train',authority(f));
    assert.equal(recovered.ok,true); assert.equal(progress(f).training_xp,13);
    assert.equal((await applyPetRuntimeCommandAward(f.db,f.owner,'required-evidence','train',authority(f))).duplicate,true);
    assert.equal(progress(f).training_xp,13); assert.equal(countReceipts(f),1);
  });
}

test('signed full-state recovery defers failed faction evidence then credits the correct training bonus once', async () => {
  const f=fixture('987654321');
  f.sql.prepare("INSERT INTO blocktopia_progression (telegram_id,faction) VALUES (?,'hard-fork-rockers')").run(f.owner);
  f.sql.prepare(`INSERT INTO telegram_pet_events (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,status,metadata)
    VALUES ('signed-train',?,?,'train','saved-train',?,?,'accepted','{"context":{"source":"telegram_mini_app","equipment_snapshot":{}}}')`)
    .run(authority(f).pet_id,f.owner,currentSeason,day);
  f.db.beforeFirst=s=>s.query==='SELECT faction FROM blocktopia_progression WHERE telegram_id=?' ? {success:false,error:'unavailable'} : undefined;
  assert.equal((await signedState(f)).status,200); assert.equal(countReceipts(f),0);
  f.db.beforeFirst=null;
  assert.equal((await signedState(f)).status,200); assert.equal(progress(f).training_xp,13);
  assert.equal((await signedState(f)).status,200); assert.equal(progress(f).training_xp,13); assert.equal(countReceipts(f),1);
});

for (const index of Array.from({length:8},(_,i)=>i)) test(`specialist batch member ${index} resolved failure cannot report duplicate after whole rollback`, async () => {
  const f=fixture('batch-'+index); equipArmor(f);
  // A resolved failed D1 transaction rolls every write back, including writes
  // preceding the reported error. No statement executes in this fault mode.
  f.db.beforeBatch=statements=>statements.map((s,i)=>i===index ? {success:false,error:'rolled_back',results:[],meta:{changes:0}} : {success:true,results:[],meta:{changes:0}});
  const options={...authority(f),day_key:day,equipment_rows:[{item_key:'moon_armor'}],drop_roll:0.1,source_event_id:'material-source'};
  await assert.rejects(applyPetRuntimeAward(f.db,f.owner,'whole-batch','run_boss',options),/unavailable/);
  assert.equal(countReceipts(f),0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_material_balances').get().n,0);
  assert.equal(f.sql.prepare("SELECT mastery_xp FROM telegram_pet_equipment_progression WHERE item_key='moon_armor'").get().mastery_xp,0);
  f.db.beforeBatch=null;
  const [first,retry]=await Promise.all([applyPetRuntimeAward(f.db,f.owner,'whole-batch','run_boss',options),applyPetRuntimeAward(f.db,f.owner,'whole-batch','run_boss',options)]);
  assert.equal(first.ok,true); assert.equal(retry.duplicate,true);
  assert.equal(countReceipts(f),1); assert.equal(progress(f).adventure_xp,30);
});

test('successful no-op is not a duplicate without its canonical receipt', async () => {
  const f=fixture('absent-receipt');
  await getOrCreatePetRuntimeState(f.db,f.owner,day,authority(f));
  f.db.beforeBatch=statements=>statements.map((s,i)=>({results:i===1?[progress(f)]:[],meta:{changes:0}}));
  await assert.rejects(runtime(f,'absent',day),/receipt_unavailable/);
  assert.equal(countReceipts(f),0);
});

for (const mode of ['resolved','thrown']) test(`30-minute Train remains recoverable after ${mode} whole specialist rollback`, async () => {
  const f=fixture('timed-'+mode);
  const started=await f.act({action:'activity_start',activity_type:'train'});
  f.sql.prepare('UPDATE telegram_pet_activity_sessions SET started_at=? WHERE id=?').run(new Date(now.getTime()-1800_000).toISOString(),started.session.id);
  assert.equal(started.accepted,true);
  f.db.beforeBatch=statements=>{
    if (!statements.some(s=>s.query.includes('WITH daily_usage AS'))) return;
    if (mode==='thrown') throw Error('specialist_whole_rollback');
    return statements.map(()=>({success:false,error:'specialist_whole_rollback',results:[],meta:{changes:0}}));
  };
  const first=await hooks.claimPetActivitySession(f.db,f.owner,{session_id:started.session.id,now});
  assert.equal(first.accepted,true); assert.equal(first.pet_xp_awarded,26); assert.equal(first.reason,'activity_reward_recovery_pending');
  assert.equal(countReceipts(f),0);
  assert.equal(JSON.parse(f.sql.prepare('SELECT metadata FROM telegram_pet_activity_sessions').get().metadata).claim_state,'claiming');
  f.db.beforeBatch=null;
  f.pet('second-'+mode,currentSeason,300,2); f.active('second-'+mode);
  const xp=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id).pet_xp;
  const retry=await hooks.claimPetActivitySession(f.db,f.owner,{session_id:started.session.id,now});
  assert.equal(retry.accepted,true); assert.equal(progress(f).training_xp,18); assert.equal(countReceipts(f),1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id).pet_xp,xp);
  assert.equal(JSON.parse(f.sql.prepare('SELECT metadata FROM telegram_pet_activity_sessions').get().metadata).claim_state,'settled');
  await f.state(); await f.state(); assert.equal(progress(f).training_xp,18);
});

test('already closed historical timed activity recovers a missing specialist receipt from its accepted source', async () => {
  const f=fixture('old-closed-activity');
  const started=await f.act({action:'activity_start',activity_type:'train'});
  f.sql.prepare('UPDATE telegram_pet_activity_sessions SET started_at=? WHERE id=?').run(new Date(now.getTime()-1800_000).toISOString(),started.session.id);
  f.db.beforeBatch=statements=>statements.some(s=>s.query.includes('WITH daily_usage AS')) ? statements.map(()=>({success:false,error:'rollback',results:[],meta:{changes:0}})) : undefined;
  await hooks.claimPetActivitySession(f.db,f.owner,{session_id:started.session.id,now});
  f.db.beforeBatch=null;
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET metadata=json_set(metadata,'$.claim_state','settled')").run();
  const xp=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  await f.state(); await f.state();
  assert.equal(progress(f).training_xp,18); assert.equal(countReceipts(f),1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,xp);
});

for (const mode of ['resolved','thrown']) test(`raid ${mode} whole payout rollback cannot seal missing gear mastery or material draw`, async () => {
  const f=fixture('raid-'+mode); equipArmor(f); const boss=getActiveSeasonalBoss(now);
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
    (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(authority(f).pet_id,f.owner,currentSeason,boss.season_instance,boss.key,boss.hp,now.toISOString());
  f.db.beforeBatch=statements=>{
    if (!statements.some(s=>s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && s.args.includes('pet_seasonal_boss'))) return;
    if(mode==='thrown') throw Error('raid_payout_rollback');
    return statements.map(()=>({success:false,error:'raid_payout_rollback',results:[],meta:{changes:0}}));
  };
  const claim={action:'seasonal_boss_claim',pet_id:authority(f).pet_id,boss_key:boss.key,season_instance:boss.season_instance};
  await assert.rejects(f.act(claim),/rollback|unavailable/);
  await f.state(); assert.equal(countReceipts(f),0); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_events').get().n,0);
  f.db.beforeBatch=null;
  const result=await f.act(claim); assert.equal(result.accepted,true,JSON.stringify(result));
  const receipt=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='seasonal_boss'").get();
  const specialist=f.sql.prepare('SELECT payload_json FROM telegram_pet_specialist_events').get();
  const payload=JSON.parse(specialist.payload_json);
  assert.equal(payload.material_source_id,receipt.id); assert.equal(progress(f).adventure_xp,30);
  assert.equal(f.sql.prepare("SELECT mastery_xp FROM telegram_pet_equipment_progression WHERE item_key='moon_armor'").get().mastery_xp,1);
  const material=resolvePetRareDrop('run',await getPetRuntimeSourceDropRoll('run_boss',f.owner,receipt.id));
  assert.equal(payload.material,material); assert.equal(f.sql.prepare('SELECT SUM(quantity) n FROM telegram_pet_material_balances').get().n,10);
  const before=f.sql.prepare('SELECT * FROM telegram_pet_material_balances ORDER BY material_key').all();
  await f.act(claim); await f.state();
  assert.equal(countReceipts(f),1); assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_material_balances ORDER BY material_key').all(),before);
});

for (const mode of ['resolved','malformed','thrown']) test(`duplicate receipt ${mode} read cannot close required followups`, async () => {
  const f=fixture('duplicate-read-'+mode);
  assert.equal((await runtime(f,'existing',day)).ok,true);
  f.db.beforeFirst=s=>{
    if(!s.query.includes('SELECT id, action, payload_json FROM telegram_pet_specialist_events')) return;
    if(mode==='thrown') throw Error('receipt_read_failed');
    return mode==='resolved' ? {success:false,error:'receipt_read_failed'} : {};
  };
  await assert.rejects(runtime(f,'existing',day),/unavailable|failed/);
  assert.equal(countReceipts(f),1); assert.equal(progress(f).care_xp,8);
  f.db.beforeFirst=null;
  assert.equal((await runtime(f,'existing',day)).duplicate,true); assert.equal(progress(f).care_xp,8);
});

test('a partial pet row cannot erase source equipment from the specialist plan', async () => {
  const f=fixture('partial-pet'); equipArmor(f);
  f.db.beforeFirst=s=>s.query==='SELECT * FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=?'
    ? {...authority(f),telegram_id:f.owner} : undefined;
  assert.equal(await applyPetRuntimeCommandAward(f.db,f.owner,'partial-row','run_boss',authority(f)),null);
  assert.equal(countReceipts(f),0);
});

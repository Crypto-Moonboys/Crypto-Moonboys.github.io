import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { applyPetRuntimeAward, getPetRuntimeSourceDropRoll, getOrCreatePetRuntimeState } from '../workers/moonboys-api/pets/runtime-phase-5a.js';
import { resolvePetRareDrop } from '../workers/moonboys-api/pets/economy-phase-3.js';
import deployedWorker from '../workers/moonboys-api/deployment-entry.js';
import worker, { applyPetRuntimeCommandAward, __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { recoverPetRuntimeAwards } from '../workers/moonboys-api/pets/runtime-recovery.js';
import { MOONPET_D1_PERFORMANCE_BUDGETS } from './moonpet-d1-performance-budget.mjs';
import { buildMoonpetReactionChoice } from '../workers/moonboys-api/pets/moonpet-reactions.js';

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
    async first() { db.statementCount++; if (db.beforeFirst) await db.beforeFirst(this); return sql.prepare(this.query).get(...this.args) || null; }
    async all() { db.statementCount++; if (db.beforeAll) await db.beforeAll(this); return { results: sql.prepare(this.query).all(...this.args) }; }
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

test('specialist recovery rotates beyond a full failed batch and continues within a partially failed batch', async () => {
  const f = fixture('runtime-fair'); await f.state();
  const petId = authority(f).pet_id, day = now.toISOString().slice(0,10);
  for (let i=0;i<22;i++) f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
    VALUES (?,?,?,'feed',?,?,?,'fixture-week','accepted',?)`)
    .run('source-'+i,petId,f.owner,'fair-'+String(i).padStart(2,'0'),currentSeason,day,JSON.stringify({context:{source:'telegram_mini_app'}}));
  const before = f.sql.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all();
  let failed = new Set(Array.from({length:20},(_,i)=>'runtime:mini:fair-'+String(i).padStart(2,'0')));
  const award = async (db,owner,key,action,row) => {
    if (failed.has(key)) throw Error('persistent_specialist_failure');
    return applyPetRuntimeCommandAward(db,owner,key,action,row);
  };
  await recoverPetRuntimeAwards(f.db,f.owner,award,{limit:20});
  await recoverPetRuntimeAwards(f.db,f.owner,award,{limit:20});
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,2,'sources beyond the failed batch must receive their awards');
  failed = new Set(['runtime:mini:fair-18']);
  for(let pass=0;pass<3;pass++) await recoverPetRuntimeAwards(f.db,f.owner,award,{limit:20});
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,21,'a failed row cannot abort its whole batch');
  failed.clear(); await recoverPetRuntimeAwards(f.db,f.owner,award,{limit:20});
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,22);
  await recoverPetRuntimeAwards(f.db,f.owner,award,{limit:20});
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all(),before,'recovery cannot rewrite primary rewards or public XP');
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,200);
});

test('two failed Weekly Boss finishes do not strand a later victor and remain recoverable after a pet switch', async () => {
  const f=fixture('weekly-fair'); await f.state();
  const year=now.getUTCFullYear()-1, season=hooks.getPetSeasonInfo(new Date(Date.UTC(year,0,15))).key;
  f.pet('old-weekly-fair',season,300);
  const victories=[15,22,29].map(date=>savedWeeklyVictory(f,`${year}-01-${date}`,'old-weekly-fair'));
  f.sql.exec(`CREATE TRIGGER fail_old_finishes BEFORE INSERT ON telegram_pet_system_events
    WHEN NEW.system_key='weekly_boss_finish' AND NEW.action_key NOT LIKE '%-01-29'
    BEGIN SELECT RAISE(ABORT,'persistent_weekly_finish_failure'); END`);
  await f.state(); await f.state();
  const finished=()=>f.sql.prepare("SELECT action_key FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish' ORDER BY action_key").all();
  assert.deepEqual(finished().map(row=>row.action_key),[victories[2].key]);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n,3,'successful substeps remain once per original week');
  f.sql.exec('DROP TRIGGER fail_old_finishes');
  await f.state(); await f.state();
  assert.equal(finished().length,3);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n,3);
  assert.equal(f.sql.prepare("SELECT total_bosses_defeated FROM telegram_pet_memories WHERE pet_id='old-weekly-fair'").get().total_bosses_defeated,3);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,500,'finishing progression does not duplicate already paid primary XP');
});

test('overlapping specialist recovery cannot rewind scheduling and targeted repair leaves the background cursor alone', async () => {
  const f=fixture('runtime-overlap'); await f.state();
  const day=now.toISOString().slice(0,10);
  for(const suffix of ['a','b','c']) f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
    VALUES (?,?,?,'feed',?,?,?,'test','accepted',?)`)
    .run(suffix,authority(f).pet_id,f.owner,'overlap-'+suffix,currentSeason,day,JSON.stringify({context:{source:'telegram_mini_app'}}));
  let release,entered;
  const paused=new Promise(resolve=>{entered=resolve;}),resume=new Promise(resolve=>{release=resolve;});
  let first=true;
  f.db.beforeRun=async statement=>{
    if(first && statement.query.startsWith('INSERT INTO telegram_pet_recovery_cursors') && statement.args.includes('moonpet:recovery:runtime')) {
      first=false;entered();await resume;
    }
  };
  const attempted=[];
  const fail=async (_db,_owner,key)=>{attempted.push(key);return {accepted:false,reason:'fixture_pending'};};
  const stale=recoverPetRuntimeAwards(f.db,f.owner,fail,{limit:1});
  await paused;
  await recoverPetRuntimeAwards(f.db,f.owner,fail,{limit:1});
  await recoverPetRuntimeAwards(f.db,f.owner,fail,{limit:1});
  release(); await stale;
  const cursor=()=>f.sql.prepare("SELECT setting_value FROM telegram_pet_recovery_cursors WHERE telegram_id=? AND setting_key='moonpet:recovery:runtime'").get(f.owner).setting_value;
  assert.match(cursor(),/overlap-b$/);
  assert.deepEqual(attempted,['runtime:mini:overlap-a','runtime:mini:overlap-b'],'stale reader must not retry or rewind its old batch');
  const before=cursor();
  await recoverPetRuntimeAwards(f.db,f.owner,applyPetRuntimeCommandAward,{action:'feed',limit:1});
  assert.equal(cursor(),before,'targeted action repair does not skip unrelated background work');
  await recoverPetRuntimeAwards(f.db,f.owner,applyPetRuntimeCommandAward,{limit:1});
  assert.ok(f.sql.prepare("SELECT event_key FROM telegram_pet_specialist_events WHERE event_key='runtime:mini:overlap-c'").get());
});
async function api(f,body,secret='pet-secret') {
  const response=await deployedWorker.fetch(new Request('https://moonboys-api.test/telegram-pets/action',{
    method:'POST', headers:{'content-type':'application/json','x-pets-bot-secret':secret},
    body:JSON.stringify({telegram_id:f.owner,...body})
  }),{DB:f.db,TELEGRAM_PETS_BOT_SECRET:'pet-secret'});
  return { status:response.status, ...await response.json() };
}

test('owned relics reach full state, remain private, and distinguish a read outage from empty inventory', async () => {
  const f=fixture('vault-owner');
  f.sql.prepare("INSERT INTO telegram_pet_relics (telegram_id,relic_id,rarity,unlocked_at) VALUES (?,'alley_crown','rare','2026-09-01 12:00:00')").run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_relics (telegram_id,relic_id,rarity,unlocked_at) VALUES (?,'neon_shard','common','2026-09-02 12:00:00')").run(f.owner);
  f.sql.prepare("INSERT INTO telegram_users (telegram_id) VALUES ('other-vault')").run();
  f.sql.prepare("INSERT INTO telegram_pet_relics (telegram_id,relic_id,rarity) VALUES ('other-vault','private_relic','rare')").run();
  const first=await f.state();
  assert.equal(first.relics_available,true);
  assert.deepEqual(first.relics.map(r=>r.relic_id),['neon_shard','alley_crown']);
  assert.equal(first.relics[1].acquired_at,'2026-09-01 12:00:00');
  f.db.beforeAll=statement=>{if(statement.query.includes('SELECT relic_id,')) throw Error('isolated_vault_outage');};
  const failed=await f.state();
  assert.equal(failed.relics_available,false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_relics WHERE telegram_id=?').get(f.owner).n,2);
  f.db.beforeAll=null;
  assert.deepEqual((await f.state()).relics,first.relics);
});

test('core Mini App bootstrap stays below its SQL budget and omits heavy modules', async () => {
  const f=fixture('core-state-budget');
  await f.state();
  f.db.statementCount=0;
  const core=await hooks.buildPetMiniAppCoreState(f.db,f.owner);
  const coreStatements=f.db.statementCount;
  assert.ok(coreStatements<=MOONPET_D1_PERFORMANCE_BUDGETS.core_bootstrap_max_statements,
    `core bootstrap executed ${coreStatements} statements`);
  assert.equal(core.hydration?.full,false);
  assert.equal(core.hydration?.mode,'core');
  assert.equal(core.season_slots?.hydrated,false);
  assert.ok(core.pet?.pet_id);
  assert.ok(core.lifecycle);
  for(const heavy of ['contracts','live_systems','leaderboard','arena','kaiju','daily_journey','weekly_journey','season_finales']) {
    assert.equal(core[heavy],undefined,`core bootstrap must not hydrate ${heavy}`);
  }
  console.log(`Core-state budget: ${coreStatements}/${MOONPET_D1_PERFORMANCE_BUDGETS.core_bootstrap_max_statements} SQL statements`);
});

test('Missions uses less SQL, preserves its panels and never loads unrelated module projections', async () => {
  const f = fixture('missions-state-budget');
  const full = await f.state();
  const queries = [];
  f.db.beforeFirst = statement => { queries.push(statement.query); };
  f.db.beforeAll = statement => { queries.push(statement.query); };
  f.db.statementCount = 0;
  const missions = await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token', { mode: 'missions' });
  const count = f.db.statementCount;
  assert.ok(count <= MOONPET_D1_PERFORMANCE_BUDGETS.missions_state_max_statements, `Missions executed ${count} statements`);
  console.log(`Missions-state budget: ${count}/${MOONPET_D1_PERFORMANCE_BUDGETS.missions_state_max_statements} SQL statements`);
  const stable = value => JSON.parse(JSON.stringify(value, (key, entry) => ['server_time', 'remaining_seconds'].includes(key) ? undefined : entry));
  assert.equal(missions.hydration.mode, 'missions');
  assert.deepEqual(missions.hydration.modules, ['missions']);
  for (const key of ['contracts', 'season_finales', 'daily_journey', 'weekly_journey']) {
    assert.deepEqual(stable(missions[key]), stable(full[key]), `Missions preserves ${key}`);
  }
  for (const key of ['missions', 'daily_completion', 'achievements']) {
    assert.deepEqual(stable(missions.guidance[key]), stable(full.guidance[key]), `Missions preserves guidance.${key}`);
  }
  assert.deepEqual(missions.season_slots.slots.find(slot => slot.active).pet.progression,
    full.season_slots.slots.find(slot => slot.active).pet.progression);
  for (const key of [ 'live_systems', 'leaderboard', 'arena', 'kaiju', 'inventory', 'gear', 'run', 'style_loadout']) {
    assert.equal(missions[key], undefined, `Missions defers ${key}`);
  }
  assert.ok(!queries.some(query => /ORDER BY slot, item_level DESC, item_key|SELECT material_key, quantity[\s\S]*ORDER BY material_key|SELECT relic_id, unlocked_at|SELECT \* FROM telegram_pet_arena_battles WHERE status='completed'|SELECT \* FROM telegram_pet_kaiju_matches WHERE status='completed'/.test(query)));
  f.db.beforeAll = statement => { if (/SELECT event_type, COUNT\(\*\) AS count/.test(statement.query)) throw new Error('missions_read_outage'); };
  await assert.rejects(hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token', { mode: 'missions' }), /missions_read_outage/);
});

test('Missions reactions follow the active evolution through every stage and pet switches', async () => {
  const f = fixture('missions-reaction-stages');
  await f.state();
  const petId = authority(f).pet_id;
  for (const evolution of Object.values(hooks.MOONPET_EVOLUTIONS)) {
    f.sql.prepare(`INSERT INTO telegram_pet_evolutions_by_pet
      (pet_id,telegram_id,evolution_id,stage,unlock_event_key) VALUES (?,?,?,?,?)`)
      .run(petId, f.owner, evolution.evolution_id, evolution.stage, 'missions-stage-' + evolution.stage);
    const missions = await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token', { mode: 'missions' });
    const full = await f.state();
    const identity = missions.guidance.identity;
    for (const key of ['evolution_id', 'name', 'stage']) {
      assert.equal(identity.current_stage[key], full.guidance.identity.current_stage[key]);
    }
    const choices = Array.from({ length: 100 }, (_, seed) => buildMoonpetReactionChoice('generic', identity, { seed: String(seed) }));
    const evolutionChoices = choices.filter(choice => choice.source === 'evolution');
    assert.ok(evolutionChoices.length, 'exercise evolution-specific reaction selection');
    assert.ok(evolutionChoices.every(choice => choice.key.startsWith('evolution:' + evolution.evolution_id + ':')));
    if (evolution.stage > 0) assert.ok(choices.every(choice => !/EGGYONE|Secret Bot/.test(choice.text)));
    if (evolution.stage <= 1) {
      assert.equal(missions.pet.art_identity_id, null);
      assert.equal(missions.lifecycle.species_id, null);
    }
  }
  f.pet('other-missions-reaction', currentSeason, 200, 2);
  f.active('other-missions-reaction');
  const switched = await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token', { mode: 'missions' });
  assert.equal(switched.guidance.identity.current_stage.evolution_id, 'moon_egg', 'never reuse the previous pet evolution');
});

test('warm state stays below its SQL budget and does not rewrite unchanged achievements', async () => {
  const f=fixture('state-budget'); await f.state();
  f.sql.prepare("UPDATE telegram_pet_achievements SET updated_at='2000-01-01 00:00:00' WHERE telegram_id=?").run(f.owner);
  const before=f.sql.prepare('SELECT * FROM telegram_pet_achievements WHERE telegram_id=? ORDER BY achievement_id').all(f.owner);
  f.db.statementCount=0;
  await f.state();
  const warmStateStatements=f.db.statementCount;
  assert.ok(warmStateStatements<=MOONPET_D1_PERFORMANCE_BUDGETS.warm_state_max_statements,`warm state executed ${warmStateStatements} statements`);
  console.log(`Warm-state budget: ${warmStateStatements}/${MOONPET_D1_PERFORMANCE_BUDGETS.warm_state_max_statements} SQL statements`);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_achievements WHERE telegram_id=? ORDER BY achievement_id').all(f.owner),before);
  await f.act({action:'feed',request_id:'budget-feed'});
  await f.state();
  assert.ok(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_achievements WHERE telegram_id=? AND updated_at<>'2000-01-01 00:00:00'").get(f.owner).n>0,'new gameplay still advances achievements');
  const earned=f.sql.prepare('SELECT * FROM telegram_pet_achievements WHERE telegram_id=? ORDER BY achievement_id').all(f.owner);
  await Promise.all([f.state(),f.state()]);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_achievements WHERE telegram_id=? ORDER BY achievement_id').all(f.owner),earned,'overlapping unchanged refreshes preserve progress and unlock timestamps');
});

test('bulk guidance notices fit D1 parameters and keep shown notices one-time', async () => {
  const f=fixture('notice-budget');
  const notices=Array.from({length:100},(_,i)=>({key:'bulk-'+i,type:'feature',title:'Notice '+i,detail:'Saved notice',callback_data:'pet:coach'}));
  f.db.beforeRun=statement=>assert.ok(statement.args.length<=100,'D1 parameter limit');
  await hooks.persistPetGuidanceNotices(f.db,f.owner,notices);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_guidance_notices').get().n,100);
  f.sql.prepare("UPDATE telegram_pet_guidance_notices SET shown_at='2026-09-01' WHERE telegram_id=?").run(f.owner);
  assert.deepEqual(await hooks.persistPetGuidanceNotices(f.db,f.owner,notices),[]);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_guidance_notices').get().n,100);
});

test('large recovery backlog drains within per-refresh SQL budget across failures and pet switches', async () => {
  const f=fixture('backlog-budget'); await f.state();
  const sourcePet=authority(f).pet_id;
  f.pet('other-budget-pet',currentSeason,300,2);
  const sourceDay=new Date(now.getTime()-86400000).toISOString().slice(0,10);
  const sourceSeason=hooks.getPetSeasonInfo(new Date(sourceDay+'T12:00:00Z')).key;
  // Use an owned historical pet if the test runs across a season boundary.
  const earnedPet=sourceSeason===currentSeason?sourcePet:'old-budget-pet';
  if(earnedPet!==sourcePet) f.pet(earnedPet,sourceSeason);
  for(let i=0;i<50;i++) f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status,reason,metadata)
    VALUES (?,?,?,'feed',?,0,?,?,'original-week','accepted','pet_feed',?)`)
    .run('saved-source-'+i,earnedPet,f.owner,'saved-feed-'+i,sourceSeason,sourceDay,JSON.stringify({context:{source:'telegram_mini_app',equipment_snapshot:{}}}));
  const sourceXp=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(earnedPet).pet_xp;
  const sourceEvents=f.sql.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all();
  let failed=false;
  f.db.beforeRun=statement=>{
    if(!failed && statement.query.includes('INSERT OR IGNORE INTO telegram_pet_weekly_journey_objectives')) {failed=true;throw Error('interrupted_budget_evidence');}
  };
  let peak=0;
  for(let pass=0;pass<4;pass++) {
    if(pass===1) f.active('other-budget-pet');
    f.db.statementCount=0;
    const state=await f.state();
    assert.equal(state.adopted,true);
    peak=Math.max(peak,f.db.statementCount);
    assert.ok(f.db.statementCount<=MOONPET_D1_PERFORMANCE_BUDGETS.recovery_refresh_max_statements,`refresh ${pass} executed ${f.db.statementCount} statements`);
    if(pass===0) {
      assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,20);
      assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_daily_journey_objectives').get().n,20);
    }
  }
  assert.equal(failed,true);
  for(const table of ['telegram_pet_specialist_events','telegram_pet_daily_journey_objectives','telegram_pet_weekly_journey_objectives']) {
    assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE pet_id=?`).get(earnedPet).n,50,table);
    assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE pet_id='other-budget-pet'`).get().n,0,table);
  }
  const specialist=f.sql.prepare('SELECT care_xp,bond_xp FROM telegram_pet_specialist_progression WHERE pet_id=?').get(earnedPet);
  assert.deepEqual({...specialist},{care_xp:300,bond_xp:180},'original daily caps remain enforced');
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(earnedPet).pet_xp,sourceXp);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all(),sourceEvents,'no primary reward replay');
  console.log(`Recovery budget: peak ${peak} SQL statements; 50 saved sources fully recovered`);
});

test('a job retry after switching pets cannot credit the new pet',async()=>{
  const f=fixture('84001'); f.pet('second-job',currentSeason,300,2);
  const body={action:'work',job_key:'street_artist',request_id:'job-retry'};
  assert.equal((await f.act(body)).accepted,true);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'second-job')).accepted,true);
  assert.equal((await f.act(body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT SUM(job_xp) xp FROM telegram_pet_specialist_progression').get().xp,14);
  assert.equal(progress(f).job_xp,14);
});

test('old-day recovery preserves current daily allowance and both historical caps',async()=>{
  const f=fixture('84002');
  await runtime(f,'old-1','2026-09-26','feed',{track_multiplier:40});
  await runtime(f,'new-1','2026-09-27','feed',{track_multiplier:40});
  const before=progress(f);
  const recovered=await runtime(f,'old-2','2026-09-26');
  assert.deepEqual(recovered.tracks,{});
  assert.equal(progress(f).daily_key,'2026-09-27');
  assert.equal(progress(f).care_daily,300);
  assert.equal((await runtime(f,'new-2','2026-09-27')).tracks.care,undefined);
  assert.equal(progress(f).care_xp,before.care_xp);
});

test('a stale state read cannot reset a newer daily counter',async()=>{
  const f=fixture('84003');
  await runtime(f,'old','2026-09-26');
  f.db.beforeRun=async statement=>{
    if(!statement.query.includes('UPDATE telegram_pet_specialist_progression')) return;
    f.db.beforeRun=null;
    await runtime(f,'new','2026-09-27');
  };
  const state=await getOrCreatePetRuntimeState(f.db,f.owner,'2026-09-27',authority(f));
  assert.equal(state.care_daily,8);
  const historical=await getOrCreatePetRuntimeState(f.db,f.owner,'2026-09-26',authority(f));
  assert.equal(historical.daily_key,'2026-09-27');
  assert.equal(historical.care_daily,8);
});

test('the deployed API credits only pet-scoped progression and repairs it on retry',async()=>{
  const f=fixture('84004');
  const body={action:'work',job_key:'street_artist',event_key:'api-job'};
  const first=await api(f,body);
  assert.equal(first.accepted,true,JSON.stringify(first));
  assert.equal(progress(f).job_xp,14);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_runtime_events').get().n,0);
  // Simulate a primary reward committed before the specialist transaction.
  f.sql.exec('DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression;');
  f.pet('second-api',currentSeason,300,2);
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'second-api')).accepted,true);
  const retry=await api(f,body);
  assert.equal(retry.duplicate,true);
  assert.equal(progress(f).job_xp,14);
  assert.equal(f.sql.prepare('SELECT SUM(job_xp) xp FROM telegram_pet_specialist_progression').get().xp,14);
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(progress(f).job_xp,14);
});

test('timed activity retains a recoverable claim until specialist progression commits',async()=>{
  const f=fixture('84005');
  assert.equal((await f.act({action:'activity_start',activity_type:'train'})).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes')").run();
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const first=await f.act({action:'activity_claim'});
  assert.equal(first.reason,'activity_reward_recovery_pending');
  const xpBefore=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  f.sql.exec('DROP TRIGGER fail_specialist');
  const retry=await f.act({action:'activity_claim'});
  assert.equal(retry.accepted,true,JSON.stringify(retry));
  assert.equal(progress(f).training_xp,18);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,xpBefore);
  assert.equal((await f.act({action:'activity_claim'})).reason,'no_active_activity');
});


test('overlapping specialist claims clamp both tracks and duplicate keys exactly once',async()=>{
  const f=fixture('84006');
  const day='2026-09-27';
  await getOrCreatePetRuntimeState(f.db,f.owner,day,authority(f));
  f.sql.prepare('UPDATE telegram_pet_specialist_progression SET care_xp=298,care_daily=298,bond_xp=178,bond_daily=178').run();
  const results=await Promise.all(['one','two','one'].map(key=>runtime(f,key,day)));
  assert.equal(results.filter(r=>r.duplicate).length,1);
  assert.equal(results.reduce((n,r)=>n+(r.tracks.care||0),0),2);
  assert.equal(results.reduce((n,r)=>n+(r.tracks.bond||0),0),2);
  assert.equal(progress(f).care_xp,300); assert.equal(progress(f).bond_xp,180);
  const receipts=f.sql.prepare('SELECT payload_json FROM telegram_pet_specialist_events').all().map(r=>JSON.parse(r.payload_json));
  assert.equal(receipts.reduce((n,r)=>n+r.awarded_tracks.care,0),2);
  assert.ok(receipts.every(r=>r.day_key===day));
  await runtime(f,'tomorrow','2026-09-28');
  assert.deepEqual((await runtime(f,'late',day)).tracks,{},'historical allowance retains a preexisting daily counter captured in the receipt');
});

test('historical legacy receipts constrain recovery without rewriting earning history',async()=>{
  const f=fixture('84007');
  await getOrCreatePetRuntimeState(f.db,f.owner,'2026-09-27',authority(f));
  f.sql.prepare("INSERT INTO telegram_pet_specialist_events (id,pet_id,telegram_id,season_key,event_key,action,payload_json,created_at) VALUES ('legacy',?,?,?,'legacy','feed',?,'2026-09-26 12:00:00')")
    .run(authority(f).pet_id,f.owner,currentSeason,JSON.stringify({tracks:{care:300,bond:180}}));
  const recovered=await runtime(f,'recover','2026-09-26');
  assert.deepEqual(recovered.tracks,{});
  assert.equal(progress(f).daily_key,'2026-09-27');
  assert.equal(f.sql.prepare("SELECT payload_json FROM telegram_pet_specialist_events WHERE id='legacy'").get().payload_json,JSON.stringify({tracks:{care:300,bond:180}}));
});

test('specialist batch failure rolls back its receipt, tracks, traits and materials',async()=>{
  const f=fixture('84008');
  f.sql.exec("CREATE TRIGGER reject_material BEFORE INSERT ON telegram_pet_material_balances BEGIN SELECT RAISE(ABORT,'material_failure'); END");
  await assert.rejects(runtime(f,'retry','2026-09-27','job',{drop_roll:0}),/material_failure/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  f.sql.exec('DROP TRIGGER reject_material');
  const first=await runtime(f,'retry','2026-09-27','job',{drop_roll:0});
  const duplicate=await runtime(f,'retry','2026-09-27','job',{drop_roll:0});
  assert.equal(first.ok,true); assert.equal(duplicate.duplicate,true);
  assert.equal(progress(f).job_xp,14);
  assert.equal(first.material.quantity_awarded,1);
  assert.deepEqual(JSON.parse(progress(f).traits_json),first.traits);
});

test('deployed retry uses the accepted event day and ignores client-supplied material rolls',async()=>{
  const f=fixture('84009');
  const body={action:'work',job_key:'street_artist',event_key:'  spaced-key  ',drop_roll:0,material_amount:25};
  assert.equal((await api(f,body)).accepted,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,1);
  assert.equal(f.sql.prepare('SELECT SUM(quantity) n FROM telegram_pet_material_balances').get().n,1,'the server grants one draw, never the client-requested 25');
  f.sql.exec('DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression; DELETE FROM telegram_pet_material_balances;');
  f.sql.prepare("UPDATE telegram_pet_events SET day_key='2026-09-26' WHERE event_key=?").run(body.event_key);
  await runtime(f,'today','2026-09-27','job');
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(progress(f).daily_key,'2026-09-27');
  assert.equal(progress(f).job_daily,14);
  assert.equal(progress(f).job_xp,28);
  const receipt=f.sql.prepare("SELECT payload_json FROM telegram_pet_specialist_events WHERE event_key LIKE 'runtime:api:%'").get();
  assert.equal(JSON.parse(receipt.payload_json).day_key,'2026-09-26');
});

test('deployed repair cannot change reward type or infer a pet for legacy source events',async()=>{
  const f=fixture('84010');
  const body={action:'work',job_key:'street_artist',event_key:'accepted-job'};
  await api(f,body);
  f.sql.exec('DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression;');
  assert.equal((await api(f,{action:'feed',event_key:body.event_key})).duplicate,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  f.sql.prepare('UPDATE telegram_pet_events SET pet_id=NULL WHERE event_key=?').run(body.event_key);
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  assert.equal((await api(f,{...body,event_key:'missing'},'wrong-secret')).status,401);
  assert.equal((await api(f,{...body,event_key:'x'.repeat(121)})).status,400);
});

test('deployed Standard Run step retry repairs the original run pet only',async()=>{
  const f=fixture('84011'); f.pet('second-run',currentSeason,300,2);
  f.sql.prepare("INSERT INTO telegram_pet_runs (id,run_id,telegram_id,pet_id,season_key,status,depth,current_room) VALUES ('run','run',?,?,?,'active',1,1)")
    .run(f.owner,authority(f).pet_id,currentSeason);
  f.sql.prepare("INSERT INTO telegram_pet_run_steps (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success,created_at,metadata) VALUES ('step','run',?,?,1,'fight','fight','saved-step',1,'2026-09-26 12:00:00','{\"source\":\"telegram_pets_api\"}')")
    .run(f.owner,authority(f).pet_id);
  f.active('second-run');
  const body={action:'run_step',run_id:'run',choice_key:'fight',event_key:'saved-step',expected_step_index:1};
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(progress(f).adventure_xp,10);
  assert.equal(progress(f).daily_key,'2026-09-26');
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,10);
});

test('timed recovery across midnight uses its saved claim date',async()=>{
  const f=fixture('84012');
  assert.equal((await f.act({action:'activity_start',activity_type:'work'})).accepted,true);
  const claimTime=new Date(now.getTime()-86400000);
  const sourceDay=claimTime.toISOString().slice(0,10), currentDay=now.toISOString().slice(0,10);
  f.sql.prepare('UPDATE telegram_pet_activity_sessions SET started_at=?,ends_at=?').run(new Date(claimTime.getTime()-1800000).toISOString(),new Date(claimTime.getTime()+3600000).toISOString());
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  assert.equal((await hooks.claimPetActivitySession(f.db,f.owner,{now:claimTime})).reason,'activity_reward_recovery_pending');
  f.sql.exec('DROP TRIGGER fail_specialist');
  await runtime(f,'today',currentDay,'job');
  assert.equal((await f.act({action:'activity_claim'})).accepted,true);
  assert.equal(progress(f).job_daily,14);
  assert.equal(progress(f).job_xp,34);
  const receipt=f.sql.prepare("SELECT payload_json FROM telegram_pet_specialist_events WHERE action='timed_work'").get();
  assert.equal(JSON.parse(receipt.payload_json).day_key,sourceDay);
});


test('Daily Cache specialist recovery retains its original day and pet',async()=>{
  const f=fixture('84013'); f.pet('cache-second',currentSeason,300,2);
  const body={action:'daily_chest',request_id:'cache-retry'};
  assert.equal((await f.act(body)).accepted,true);
  f.sql.exec('DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression;');
  f.sql.prepare("UPDATE telegram_pet_events SET day_key='2026-09-26' WHERE event_type='daily_chest'").run();
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'cache-second')).accepted,true);
  assert.equal((await f.act(body)).duplicate,true);
  assert.equal(progress(f).bond_xp,8);
  assert.equal(progress(f).daily_key,'2026-09-26');
  assert.equal(f.sql.prepare('SELECT SUM(bond_xp) xp FROM telegram_pet_specialist_progression').get().xp,8);
});

test('job replay leaves quest evidence, public activity and both XP leaderboards in sync',async()=>{
  const f=fixture('84014'); f.reveal(authority(f).pet_id);
  const body={action:'work',job_key:'street_artist',request_id:'public-job'};
  const first=await f.act(body);
  assert.equal(first.accepted,true);
  const before=await f.get('/telegram-pets/activity');
  assert.equal(before.items.find(e=>e.event_type==='work').display_name,'BOTTY');
  const publicBoard=await f.get('/telegram-pets/leaderboard?period=seasonal');
  assert.equal(publicBoard.entries[0].pet_xp,first.pet_xp_awarded);
  assert.deepEqual((await f.state()).leaderboard,publicBoard.entries.map(({player_display_name,username,last_active_label,...entry})=>entry));
  const quests=f.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_objectives ORDER BY rowid').all();
  assert.equal((await f.act(body)).duplicate,true);
  const stableActivity=items=>items.map(({time_ago,...item})=>item);
  assert.deepEqual(stableActivity((await f.get('/telegram-pets/activity')).items),stableActivity(before.items));
  for(const period of ['daily','weekly','seasonal']) assert.equal((await f.get('/telegram-pets/leaderboard?period='+period)).entries[0].pet_xp,first.pet_xp_awarded);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,200+first.pet_xp_awarded);
  assert.equal(first.xp_awarded,0,'this job awards Pet XP without Community XP');
  assert.deepEqual((await f.get('/telegram/leaderboard')).entries,[],'a zero-Community-XP job does not populate the Community season');
  assert.equal(f.sql.prepare('SELECT COALESCE(SUM(xp_change),0) xp FROM telegram_xp_log').get().xp,first.xp_awarded);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_objectives ORDER BY rowid').all(),quests);
});


test('special care actions award the same specialist tracks through the deployed API',async()=>{
  for(const [index,action,care,bond] of [[1,'energy_drink',1,1],[2,'dance',2,3],[3,'cuddles',2,6]]) {
    const f=fixture('8410'+index);
    const result=await api(f,{action,event_key:'special-'+action});
    assert.equal(result.accepted,true,JSON.stringify(result));
    assert.equal(progress(f)?.care_xp,care);
    assert.equal(progress(f)?.bond_xp,bond);
    assert.equal((await api(f,{action,event_key:'special-'+action})).duplicate,true);
    assert.equal(progress(f).bond_xp,bond);
  }
});

function standardRun(f,id,depth=2) {
  f.sql.prepare(`INSERT INTO telegram_pet_runs (id,run_id,telegram_id,pet_id,season_key,status,depth,current_room,max_depth,max_room,unbanked_pet_xp,unbanked_moon_gold)
    VALUES (?,?,?,?,?,'extractable',?,?,100,100,24,9)`).run(id,id,f.owner,authority(f).pet_id,currentSeason,depth,depth);
  f.sql.prepare(`INSERT INTO telegram_pet_run_steps (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success,metadata)
    VALUES (?,?,?,?,?,'fight','fight',?,1,'{"source":"telegram_pets_api"}')`).run(id+'-prior',id,f.owner,authority(f).pet_id,depth,id+'-prior');
}

for (const persistent of [false,true]) test(`Standard extraction repairs its canonical receipt after ${persistent?'persistent':'one'} specialist failure`,async()=>{
  const f=fixture(persistent?'84202':'84201'); standardRun(f,'extract-repair');
  let failed=false;
  f.db.beforeBatch=async statements=>{
    if(statements.some(s=>s.query.includes('INSERT INTO telegram_pet_specialist_events')) && (persistent||!failed)) {
      failed=true; throw Error('interrupted_extraction_specialist');
    }
  };
  const body={action:'run_extract',run_id:'extract-repair',event_key:'client-extract-key'};
  const first=await api(f,body);
  assert.equal(first.accepted,true,JSON.stringify(first));
  assert.ok(failed);
  assert.equal(f.sql.prepare("SELECT event_key FROM telegram_pet_events WHERE event_type='run_extract'").get().event_key,hooks.buildPetRunExtractEventKey(f.owner,body.run_id));
  const paid=f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_instances').get();
  if(persistent) {
    assert.equal(progress(f)?.adventure_xp||0,0);
    f.db.beforeBatch=null;
    f.pet('extract-second',currentSeason,300,2); f.active('extract-second');
    assert.equal((await api(f,body)).accepted,true);
  }
  assert.equal(progress(f)?.adventure_xp,24);
  assert.equal((await api(f,{...body,event_key:'replacement-client-key'})).accepted,true);
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,24);
  assert.deepEqual(f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id),paid);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_extract'").get().n,1);
});

for(const changedKey of [false,true]) test(`final Standard Run step repairs on first successful settlement with ${changedKey?'a new':'the original'} request key`,async()=>{
  const f=fixture(changedKey?'84204':'84203'); standardRun(f,'final-repair',99);
  f.sql.exec("CREATE TRIGGER fail_ending BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_run_legacy' BEGIN SELECT RAISE(ABORT,'interrupted_final_reward'); END");
  const body={action:'run_step',run_id:'final-repair',choice_key:'boss',expected_step_index:100,event_key:'saved-final-step'};
  const random=Math.random; Math.random=()=>0.999;
  try { await assert.rejects(api(f,body),/interrupted_final_reward/); }
  finally { Math.random=random; }
  assert.equal(f.sql.prepare("SELECT depth FROM telegram_pet_runs WHERE run_id='final-repair'").get().depth,100);
  assert.equal(progress(f)?.adventure_xp||0,0);
  f.sql.exec('DROP TRIGGER fail_ending');
  // Recovery may happen on another day and with another pet selected.
  f.sql.prepare("UPDATE telegram_pet_run_steps SET created_at='2026-09-26 12:00:00' WHERE event_key='saved-final-step'").run();
  f.pet('final-second',currentSeason,300,2); f.active('final-second');
  const retry=await api(f,{...body,event_key:changedKey?'new-finish-request':body.event_key});
  assert.equal(retry.accepted,true,JSON.stringify(retry));
  assert.equal(retry.settlement_recovered,true);
  assert.equal(progress(f)?.adventure_xp,10);
  assert.equal(progress(f).daily_key,'2026-09-26');
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,10);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='run_complete'").get().n,1);
});

test('Mini App and API extraction retries share one saved reward identity',async()=>{
  const f=fixture('84205'); standardRun(f,'shared-extract');
  assert.equal((await f.act({action:'run_extract',run_id:'shared-extract',request_id:'mini-extract'})).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
  assert.equal((await api(f,{action:'run_extract',run_id:'shared-extract',event_key:'api-retry'})).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_extract'").get().n,1);
});

test('historical extraction without a saved runtime identity cannot mint a new award under a different request key',async()=>{
  const f=fixture('84206'); standardRun(f,'legacy-extract');
  await api(f,{action:'run_extract',run_id:'legacy-extract',event_key:'old-client-key'});
  f.sql.prepare("UPDATE telegram_pet_events SET metadata=json_remove(metadata,'$.context.runtime_event_key') WHERE event_type='run_extract'").run();
  f.sql.prepare("UPDATE telegram_pet_specialist_events SET event_key='runtime:api:old-client-key' WHERE action='run_extract'").run();
  assert.equal((await api(f,{action:'run_extract',run_id:'legacy-extract',event_key:'new-client-key'})).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
  await deployedWorker.fetch(new Request('https://moonboys-api.test/telegram/webhook',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query:{id:'legacy-retry',from:{id:f.owner},data:'pet:run:legacy-extract:extract'}})}),{DB:f.db});
  assert.equal(progress(f).adventure_xp,24,'a callback cannot reinterpret an old API award as new progress');
});

test('saved final-step repair does not repay an already credited step or award extraction progress',async()=>{
  const f=fixture('84207'); standardRun(f,'credited-final',100);
  f.sql.prepare("UPDATE telegram_pet_runs SET status='completed' WHERE run_id='credited-final'").run();
  const key='credited-final-prior',day=now.toISOString().slice(0,10);
  await runtime(f,'runtime:api:'+key,day,'run_step');
  const before=progress(f);
  const result=await api(f,{action:'run_step',run_id:'credited-final',choice_key:'boss',event_key:'new-client-key'});
  assert.equal(result.accepted,true); assert.equal(result.settlement_recovered,true);
  assert.equal(progress(f).adventure_xp,10);
  assert.equal(progress(f).traits_json,before.traits_json);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_extract'").get().n,0);
});


test('an uncredited historical API extraction repairs when no ambiguous legacy award exists',async()=>{
  const f=fixture('84208'); standardRun(f,'unpaid-legacy');
  f.sql.exec("CREATE TRIGGER fail_extract_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const body={action:'run_extract',run_id:'unpaid-legacy',event_key:'legacy-client-key'};
  assert.equal((await api(f,body)).accepted,true);
  f.sql.exec('DROP TRIGGER fail_extract_specialist');
  f.sql.prepare("UPDATE telegram_pet_events SET metadata=json_remove(metadata,'$.context.runtime_event_key') WHERE event_type='run_extract'").run();
  assert.equal((await api(f,body)).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
  assert.equal((await api(f,{...body,event_key:'another-retry'})).accepted,true);
  assert.equal(progress(f).adventure_xp,24);
});

for (const finish of [false, true]) test(`Mini App repairs ${finish ? 'final step' : 'extraction'} progression on refresh after a failed specialist write`, async () => {
  const f = fixture(finish ? '84302' : '84301'); standardRun(f, 'mini-repair', finish ? 99 : 2);
  // The already-played room has its normal existing award.
  await runtime(f, 'runtime:api:mini-repair-prior', now.toISOString().slice(0,10), 'run_step');
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const body = finish ? {action:'run_step',run_id:'mini-repair',choice_key:'boss',expected_step_index:100,request_id:'finish'}
    : {action:'run_extract',run_id:'mini-repair',request_id:'extract'};
  const random = Math.random; Math.random = () => 0.999;
  try { assert.equal((await f.act(body)).accepted, true); } finally { Math.random = random; }
  assert.equal(progress(f).adventure_xp, 10);
  const paid = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id);
  f.sql.exec('DROP TRIGGER fail_specialist');
  f.pet('mini-second', currentSeason, 300, 2); f.active('mini-second');
  await f.state();
  assert.equal(progress(f).adventure_xp, finish ? 20 : 34);
  await f.state(); await f.act({...body,request_id:'changed-request'});
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp, finish ? 20 : 34);
  assert.deepEqual(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id), paid);
});

test('Mini App terminal reward recovery credits its saved final step on the original day', async () => {
  const f = fixture('84303'); standardRun(f,'mini-ending',99);
  await runtime(f,'runtime:api:mini-ending-prior',now.toISOString().slice(0,10),'run_step');
  f.sql.exec("CREATE TRIGGER fail_ending BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_run_legacy' BEGIN SELECT RAISE(ABORT,'interrupted_final_reward'); END");
  const body={action:'run_step',run_id:'mini-ending',choice_key:'boss',expected_step_index:100,request_id:'mini-final'};
  const random=Math.random; Math.random=()=>0.999;
  try { await assert.rejects(f.act(body),/interrupted_final_reward/); } finally { Math.random=random; }
  f.sql.exec('DROP TRIGGER fail_ending');
  f.sql.prepare("UPDATE telegram_pet_run_steps SET created_at='2026-09-26 12:00:00' WHERE step_index=100").run();
  const result=await f.act({...body,request_id:'new-request'});
  assert.equal(result.accepted,true);
  assert.equal(progress(f).adventure_xp,20);
  assert.equal(progress(f).adventure_daily,10,'recovery does not consume today’s allowance');
});

test('a saved raid victory repairs specialist progression on refresh for its original pet', async () => {
  const f=fixture('84304');
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
    (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at,reward_claimed_at)
    VALUES (?,?,?,'season1:w2959','neon_titan',900,'2026-09-26 12:00:00',CURRENT_TIMESTAMP)`)
    .run(authority(f).pet_id,f.owner,currentSeason);
  f.pet('raid-second',currentSeason,300,2); f.active('raid-second');
  await f.state();
  assert.equal(progress(f)?.adventure_xp,30);
  assert.equal(progress(f).arena_xp,8);
  assert.equal(progress(f).daily_key,'2026-09-26');
  await f.state();
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,30);
});

test('API cannot pay a Mini App room again by replaying its saved request key', async () => {
  const f=fixture('84305'); standardRun(f,'shared-step');
  const random=Math.random; Math.random=()=>0.999;
  let result;
  try { result=await f.act({action:'run_step',run_id:'shared-step',choice_key:'fight',expected_step_index:3,request_id:'mini-room'}); }
  finally { Math.random=random; }
  assert.equal(result.accepted,true);
  const key=f.sql.prepare('SELECT event_key FROM telegram_pet_run_steps WHERE step_index=3').get().event_key;
  const before=progress(f).adventure_xp;
  assert.equal((await api(f,{action:'run_step',run_id:'shared-step',choice_key:'fight',expected_step_index:3,event_key:key})).duplicate,true);
  assert.equal(progress(f).adventure_xp,before);
});

for (const action of ['district_mission', 'event_chain']) test(`${action} repairs the saved specialist award after a new request ID`, async () => {
  const { PET_EVENT_CHAINS } = await import('../workers/moonboys-api/pets/content-phase-4.js');
  const f=fixture(action==='event_chain'?'84307':'84306');
  f.sql.exec('UPDATE telegram_pet_instances SET pet_xp=1000000; UPDATE telegram_pet_profiles SET pet_xp=1000000;');
  const body={action,region_key:'moon_alley',chain_key:Object.keys(PET_EVENT_CHAINS)[0],request_id:'original-explore'};
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const first=await f.act(body);
  assert.equal(first.accepted,true,JSON.stringify(first));
  assert.equal(progress(f)?.adventure_xp||0,0);
  const paid=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  f.sql.exec('DROP TRIGGER fail_specialist');
  assert.equal((await f.act({...body,request_id:'retry-new-key'})).duplicate,true);
  assert.equal(progress(f)?.adventure_xp,14);
  await f.state();
  assert.equal(progress(f).adventure_xp,14);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp,paid);
});

for (const extract of [false,true]) test(`Official Daily ${extract?'extraction':'room'} survives specialist failure and pet switching`, async () => {
  const { __dailyMoonRunTestHooks: daily } = await import('../workers/moonboys-api/pets/daily-moon-run.js');
  const f=fixture(extract?'84309':'84308');
  f.sql.prepare("UPDATE telegram_pet_instances SET equipped_outfit='moon_armor'").run();
  f.sql.prepare("UPDATE telegram_pet_profiles SET equipped_outfit='moon_armor'").run();
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'moon_armor','outfit')").run(f.owner);
  const created=await f.act({action:'daily_run_start'});
  assert.equal(created.accepted,true,JSON.stringify(created));
  const run=f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(created.daily_run.run_id);
  const room=created.room;
  // Choose a deterministic successful fixture seed; play still uses the real
  // authoritative resolver and persisted room, rather than mocking its result.
  let choice;
  for(let seed=1;seed<=100 && !choice;seed++) {
    run.seed=seed;
    for(const option of room.choices) if((await daily.resolveAuthoritativeDailyRoomOutcome(f.db,run,room,option.choice_id)).success) { choice=option.choice_id; break; }
  }
  assert.ok(choice);
  f.sql.prepare('UPDATE telegram_pet_runs SET seed=? WHERE run_id=?').run(run.seed,run.run_id);
  if(!extract) f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const step=await f.act({action:'run_step',run_id:run.run_id,choice_key:choice,expected_step_index:0,request_id:'daily-room'});
  assert.equal(step.reason,'daily_room_resolved',JSON.stringify(step));
  if(extract) {
    f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
    assert.equal((await f.act({action:'run_extract',run_id:run.run_id,request_id:'daily-extract'})).accepted,true);
  }
  const before=progress(f)?.adventure_xp||0;
  assert.equal(before,extract?10:0);
  f.sql.exec('DROP TRIGGER fail_specialist');
  f.pet('daily-second',currentSeason,300,2); f.active('daily-second');
  await f.state();
  assert.equal(progress(f).adventure_xp,extract?34:10);
  if(extract) await assertSourceMaterial(f,'run_extract',f.sql.prepare("SELECT analytics_id FROM telegram_pet_run_analytics WHERE event_type='run_end'").get().analytics_id,'run');
  assert.equal(f.sql.prepare("SELECT mastery_xp FROM telegram_pet_equipment_progression WHERE item_key='moon_armor'").get().mastery_xp,extract?2:1);
  await f.state();
  if(extract) await api(f,{action:'run_extract',run_id:run.run_id,event_key:'api-daily-retry'});
  else await api(f,{action:'run_step',run_id:run.run_id,choice_key:choice,expected_step_index:0,event_key:'api-daily-retry'});
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,extract?34:10);
});

test('new Daily boss settlement repairs only its saved step on refresh or finish', async () => {
  const { createPetRunRoom, persistPetRunRoomOutcome } = await import('../workers/moonboys-api/pets/roguelite-foundation.js');
  const f=fixture('84310');
  const created=await f.act({action:'daily_run_start'});
  const run=f.sql.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(created.daily_run.run_id);
  run.current_room=9; run.depth=9;
  f.sql.prepare('UPDATE telegram_pet_runs SET current_room=9,depth=9 WHERE run_id=?').run(run.run_id);
  const room=await createPetRunRoom(f.db,run);
  await persistPetRunRoomOutcome(f.db,run,room,{success:true,score:100,choice_id:room.choices[0].choice_id,runtime_event_key:`runtime:daily-step:${room.room_id}`});
  f.sql.prepare("UPDATE telegram_pet_run_rooms SET resolved_at='2026-09-26 12:00:00' WHERE room_id=?").run(room.room_id);
  f.sql.prepare('UPDATE telegram_pet_runs SET current_room=10,depth=10 WHERE run_id=?').run(run.run_id);
  const result=await f.act({action:'run_extract',run_id:run.run_id,request_id:'finish-saved'});
  assert.equal(result.reason,'daily_run_completed');
  assert.equal(progress(f).adventure_xp,10);
  assert.equal(progress(f).daily_key,'2026-09-26');
  await f.state();
  await api(f,{action:'run_extract',run_id:run.run_id,event_key:'finish-again'});
  assert.equal(progress(f).adventure_xp,10);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_extract'").get().n,0);
});

test('story retries retain the first reserved identity when primary settlement fails', async () => {
  const { PET_EVENT_CHAINS } = await import('../workers/moonboys-api/pets/content-phase-4.js');
  const f=fixture('84311');
  const body={action:'event_chain',chain_key:Object.keys(PET_EVENT_CHAINS)[0],request_id:'reserved-story'};
  f.sql.exec("CREATE TRIGGER fail_primary BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.source='pet_event_chain' BEGIN SELECT RAISE(ABORT,'primary-story-failure'); END");
  const pending=await f.act(body);
  assert.equal(pending.accepted,true); assert.equal(pending.reward_pending,true); assert.equal(pending.refresh_state,true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_event_chain'").get().n,0);
  f.sql.exec('DROP TRIGGER fail_primary');
  assert.equal((await f.act({...body,request_id:'different-retry'})).accepted,true);
  assert.equal(progress(f).adventure_xp,14);
  assert.match(f.sql.prepare("SELECT event_key FROM telegram_pet_specialist_events WHERE action='explore'").get().event_key,/reserved-story$/);
  await f.state();
  assert.equal(progress(f).adventure_xp,14);
});

test('Adventure API retry restores its original pet progression once', async () => {
  const f=fixture('84312');
  const encounter=hooks.resolvePetAdventureEncounter('moon_alley');
  const body={action:'adventure',adventure_key:encounter.choices[0].key,event_key:'moon_alley'};
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  assert.equal((await api(f,body)).accepted,true);
  f.sql.exec('DROP TRIGGER fail_specialist');
  f.pet('adventure-second',currentSeason,300,2); f.active('adventure-second');
  assert.equal((await api(f,body)).duplicate,true);
  assert.equal(progress(f).adventure_xp,14);
  await f.state();
  assert.equal(f.sql.prepare('SELECT SUM(adventure_xp) xp FROM telegram_pet_specialist_progression').get().xp,14);
  assert.equal((await api(f,{...body,event_key:'x'.repeat(121)})).status,400);
});

test('recovery filters invalid owners before its bound and drains paid candidates on later refreshes', async () => {
  const f=fixture('84313'); standardRun(f,'queue',1);
  f.sql.prepare('DELETE FROM telegram_pet_run_steps').run();
  for(let i=0;i<47;i++) f.sql.prepare(`INSERT INTO telegram_pet_run_steps
    (id,pet_id,telegram_id,run_id,step_index,choice_key,choice_type,event_key,success,metadata,created_at)
    VALUES (?,?,?,'queue',?,'fight','fight',?,1,'{"source":"telegram_pets_api"}','2026-09-26 12:00:00')`)
    .run('queue-'+i,i<25?'missing-pet':authority(f).pet_id,f.owner,i+1,'queue-'+i);
  await f.state();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,20);
  await f.state();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,22);
  assert.equal(progress(f).adventure_xp,220);
  await f.state();
  assert.equal(progress(f).adventure_xp,220);
});

test('an earlier season raid stays visible and claimable while the selected pet is an egg', async () => {
  const f=fixture('84314'); f.pet('old-raid','pet-s2026-002',5000,1); f.reveal('old-raid');
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(authority(f).pet_id);
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
    (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at)
    VALUES ('old-raid',?,'pet-s2026-002','neon_uprising:w2900','neon_titan',900,'2026-05-12 12:00:00')`).run(f.owner);
  const snapshot=await f.state();
  const claim=snapshot.live_systems.seasonal_boss.pending_rewards.find(r=>r.pet_id==='old-raid');
  assert.ok(claim,'old season rewards remain reachable from the current pet');
  const result=await f.act({action:'seasonal_boss_claim',...claim});
  assert.equal(result.accepted,true,JSON.stringify(result));
  assert.equal(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='old-raid'").get().pet_xp,5150);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id).pet_xp,200);
  assert.equal((await f.state()).live_systems.seasonal_boss.pending_rewards.length,0);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=daily')).entries[0].pet_xp,150);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=weekly')).entries[0].pet_xp,150);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,5350);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE season_key=?').get(currentSeason).season_xp,150);
  assert.equal((await f.get('/telegram-pets/activity')).items.find(e=>e.event_type==='seasonal_boss').display_name,'BOTTY');

  const total=f.sql.prepare('SELECT SUM(pet_xp) xp FROM telegram_pet_instances').get().xp;
  assert.equal((await f.act({action:'seasonal_boss_claim',...claim})).duplicate,true);
  assert.equal(f.sql.prepare('SELECT SUM(pet_xp) xp FROM telegram_pet_instances').get().xp,total);
  assert.equal((await f.act({action:'seasonal_boss_claim',...claim,pet_id:'unowned'})).accepted,false);
});


test('historical oversized Adventure keys cannot create a second award during refresh', async () => {
  const f=fixture('84315'), key='a'.repeat(120), day=now.toISOString().slice(0,10);
  f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
    VALUES ('legacy-long',?,?,'adventure',?,?,?,'week','accepted','{"context":{"source":"telegram_pets_api"}}')`)
    .run(authority(f).pet_id,f.owner,key,currentSeason,day);
  await runtime(f,'runtime:api:'+key+'-legacy-suffix',day,'explore');
  await f.state();
  assert.equal(progress(f).adventure_xp,14);
});

for (const [index, [action, track, amount]] of [['feed','care',8], ['work','job',14], ['daily_chest','bond',8]].entries()) {
  test(`${action} repairs interrupted progression on refresh and rejects cross-surface double credit`, async () => {
    const f = fixture('8451' + index);
    f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
    const first = await f.act({ action, job_key: 'street_artist', request_id: 'ordinary-refresh' });
    assert.equal(first.accepted, true);
    const event = f.sql.prepare('SELECT event_key FROM telegram_pet_events WHERE status=\'accepted\' AND event_type=?').get(action);
    f.sql.exec('DROP TRIGGER fail_specialist');
    f.pet('ordinary-replacement', currentSeason, 200, 2); f.active('ordinary-replacement');
    await f.state();
    assert.equal(progress(f)?.[track + '_xp'], amount);
    assert.equal((await api(f, { action, job_key: 'street_artist', event_key: event.event_key })).duplicate, true);
    assert.equal(progress(f)[track + '_xp'], amount);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n, 1);
  });
  test(`${action} API replay of a successful Mini App action cannot award another specialist receipt`, async () => {
    const f = fixture('8452' + index);
    assert.equal((await f.act({ action, job_key: 'street_artist', request_id: 'ordinary-replay' })).accepted, true);
    const event = f.sql.prepare('SELECT event_key FROM telegram_pet_events WHERE status=\'accepted\' AND event_type=?').get(action);
    assert.equal((await api(f, { action, job_key: 'street_artist', event_key: event.event_key })).duplicate, true);
    assert.equal(progress(f)[track + '_xp'], amount);
  });
}

test('a paid Weekly Boss victory repairs missing specialist progression on refresh', async () => {
  const f = fixture('84040');
  f.sql.exec('UPDATE telegram_pet_instances SET pet_xp=3240; UPDATE telegram_pet_profiles SET pet_xp=3240;');
  const preview = await hooks.processPetWeeklyBoss(f.db, f.owner, '');
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts)
    VALUES (?,?,?,?,1)`).run(f.owner, preview.week_key, preview.boss.boss_id, preview.boss.hp - 1);
  f.sql.exec("CREATE TRIGGER fail_specialist BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'interrupted_specialist'); END");
  const victory = await hooks.processPetWeeklyBoss(f.db, f.owner, 'strike', 'weekly-saved-victory');
  assert.equal(victory.reason, 'boss_defeated');
  assert.equal(victory.reward.accepted, true);
  f.sql.exec('DROP TRIGGER fail_specialist');
  f.pet('weekly-replacement', currentSeason, 200, 2); f.active('weekly-replacement');
  await f.state();
  assert.equal(progress(f)?.adventure_xp, 30);
  assert.equal(progress(f)?.arena_xp, 8);
  const receipt = f.sql.prepare("SELECT * FROM telegram_pet_specialist_events WHERE action='run_boss'").get();
  assert.equal(receipt.pet_id, authority(f).pet_id);
  await f.state();
  assert.equal(progress(f).adventure_xp, 30);
});

for (const missing of ['memory', 'crest']) test(`Weekly Boss refresh repairs interrupted ${missing} after its main reward is paid`, async () => {
  const f = fixture('weekly-' + missing);
  f.sql.exec('UPDATE telegram_pet_instances SET pet_xp=3240; UPDATE telegram_pet_profiles SET pet_xp=3240;');
  const preview = await hooks.processPetWeeklyBoss(f.db, f.owner, '');
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts)
    VALUES (?,?,?,?,1)`).run(f.owner, preview.week_key, preview.boss.boss_id, preview.boss.hp - 1);
  const table = missing === 'memory' ? 'telegram_pet_memories' : 'telegram_pet_weekly_crests';
  const memoryBefore = f.sql.prepare('SELECT * FROM telegram_pet_memories WHERE pet_id=?').get(authority(f).pet_id);
  f.sql.exec(`CREATE TRIGGER fail_finish BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'interrupted_finish'); END`);
  const attempt = await hooks.processPetWeeklyBoss(f.db, f.owner, 'strike', 'weekly-' + missing);
  assert.equal(attempt.accepted, true, 'a saved victory must remain accepted after its follow-up fails');
  assert.equal(attempt.reason, 'boss_defeated');
  assert.equal(attempt.reward.accepted, true, 'the main reward was already committed');
  if (missing === 'memory') {
    assert.equal(attempt.refresh_state, true, 'an interrupted saved-source follow-up requests authoritative refresh');
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_memories WHERE pet_id=?').get(authority(f).pet_id), memoryBefore,
      'failed memory settlement leaves the saved memory unchanged until recovery');
  }
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_weekly_boss' AND status='awarded'").get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish' AND status='completed'").get().n, 0,
    'the unfinished saved-source bookkeeping must remain recoverable');
  assert.ok(f.sql.prepare('SELECT reward_claimed_at FROM telegram_pet_weekly_boss_progress').get().reward_claimed_at);
  f.sql.exec('DROP TRIGGER fail_finish');
  const gold = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  await f.state();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n, 1);
  assert.equal(f.sql.prepare('SELECT total_bosses_defeated n FROM telegram_pet_memories WHERE pet_id=?').get(authority(f).pet_id)?.n, 1);
  assert.equal(progress(f)?.adventure_xp, 30);
  await f.state();
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, gold);
  assert.equal(f.sql.prepare('SELECT total_bosses_defeated n FROM telegram_pet_memories WHERE pet_id=?').get(authority(f).pet_id).n, 1);
});

function savedWeeklyVictory(f, day, petId = authority(f).pet_id) {
  const at = new Date(day + 'T12:00:00Z');
  const iso = new Date(at); iso.setUTCHours(0,0,0,0); iso.setUTCDate(iso.getUTCDate() + 4 - (iso.getUTCDay() || 7));
  const week = `${iso.getUTCFullYear()}-W${String(Math.ceil(((iso - Date.UTC(iso.getUTCFullYear(),0,1)) / 86400000 + 1) / 7)).padStart(2,'0')}`;
  const season = hooks.getPetSeasonInfo(at).key, boss = hooks.getPetWeeklyBoss(week);
  const key = 'saved-weekly:' + petId + ':' + day;
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts,defeated_at,reward_claimed_at)
    VALUES (?,?,?,?,1,?,?)`).run(f.owner, week, boss.boss_id, boss.hp, at.toISOString(), at.toISOString());
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet (telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
    VALUES (?,?,?,?,?,?,?)`).run(f.owner, week, boss.boss_id, petId, season, key, at.toISOString());
  f.sql.prepare(`INSERT INTO telegram_pet_events (id,telegram_id,pet_id,season_key,event_type,event_key,day_key,week_key,status,reason,metadata,created_at)
    VALUES (?,?,?,?,'weekly_boss',?,?,?,'accepted','weekly_boss_attempt',?,?)`)
    .run(key, f.owner, petId, season, key, day, week, JSON.stringify({source:'pet_weekly_boss',boss_id:boss.boss_id}), at.toISOString());
  return { pet_id: petId, season, week, boss, key, at };
}

test('Weekly Boss recovery preserves the original date and achievements for an archived victor', async () => {
  const f = fixture('84530');
  const day = (now.getUTCFullYear() - 1) + '-01-15';
  const season = hooks.getPetSeasonInfo(new Date(day)).key;
  f.pet('archived-weekly', season, 3200);
  f.sql.prepare("UPDATE telegram_pet_instances SET status='archived' WHERE pet_id='archived-weekly'").run();
  f.sql.prepare("UPDATE telegram_pet_season_slots SET status='archived' WHERE pet_id='archived-weekly'").run();
  const saved = savedWeeklyVictory(f, day, 'archived-weekly');
  const before = await f.get('/telegram-pets/leaderboard?period=all_time');
  await f.state();
  const receipt = f.sql.prepare("SELECT * FROM telegram_pet_specialist_events WHERE action='run_boss'").get();
  assert.equal(receipt.pet_id, 'archived-weekly');
  assert.equal(JSON.parse(receipt.payload_json).day_key, day);
  const crest = f.sql.prepare('SELECT * FROM telegram_pet_weekly_crests').get();
  assert.equal(crest.pet_id, 'archived-weekly'); assert.equal(crest.earned_at, saved.at.toISOString());
  const memory = f.sql.prepare("SELECT * FROM telegram_pet_memories WHERE pet_id='archived-weekly'").get();
  assert.equal(memory.total_bosses_defeated, 1); assert.equal(memory.first_boss_victory_at, saved.at.toISOString());
  assert.equal(f.sql.prepare("SELECT progress FROM telegram_pet_achievements WHERE pet_id='archived-weekly' AND achievement_id='boss_breaker'").get()?.progress, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 1);
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_boss'").get().n, 1);
  assert.deepEqual((await f.get('/telegram-pets/leaderboard?period=all_time')).entries, before.entries);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 1000);
});

for (const lookup of ['authority','memory']) test(`Weekly Boss ${lookup} lookup failure must leave completion open for repair`, async () => {
  const f = fixture('weekly-lookup-' + lookup);
  savedWeeklyVictory(f, now.toISOString().slice(0,10));
  let failed = false;
  f.db.beforeFirst = async statement => {
    if (!(lookup === 'authority'
      ? statement.query.startsWith('SELECT s.pet_id, s.telegram_id, s.season_key, s.slot_number')
      : statement.query.startsWith('SELECT total_runs, total_bosses_defeated FROM telegram_pet_memories'))) return;
    f.db.beforeFirst = null; failed = true; throw Error('interrupted_achievement_lookup');
  };
  await f.state();
  assert.equal(failed, true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 0);
  await f.state();
  assert.equal(f.sql.prepare("SELECT progress FROM telegram_pet_achievements WHERE pet_id=? AND achievement_id='boss_breaker'").get(authority(f).pet_id)?.progress,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 1);
  assert.equal(progress(f).adventure_xp,30);
});

test('Weekly Boss completion-marker failure retries without repeating any award', async () => {
  const f = fixture('84531');
  savedWeeklyVictory(f, now.toISOString().slice(0,10));
  f.sql.exec("CREATE TRIGGER fail_finish_marker BEFORE INSERT ON telegram_pet_system_events WHEN NEW.system_key='weekly_boss_finish' BEGIN SELECT RAISE(ABORT,'interrupted_finish_marker'); END");
  await f.state();
  assert.equal(progress(f).adventure_xp, 30);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 0);
  f.sql.exec('DROP TRIGGER fail_finish_marker');
  await f.state();
  assert.equal(progress(f).adventure_xp, 30);
  assert.equal(f.sql.prepare('SELECT total_bosses_defeated n FROM telegram_pet_memories').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n, 1);
});

test('unbacked Weekly Boss victories cannot fill the recovery queue ahead of a valid victory', async () => {
  const f = fixture('84532'), pets = new Map();
  for (let index=0; index<22; index++) {
    const day = new Date(Date.UTC(now.getUTCFullYear()-1,0,15+index*7)).toISOString().slice(0,10);
    const season = hooks.getPetSeasonInfo(new Date(day)).key;
    if (!pets.has(season)) { pets.set(season, 'weekly-'+season); f.pet(pets.get(season), season); }
    const saved = savedWeeklyVictory(f, day, pets.get(season));
    if (index<21) f.sql.prepare('DELETE FROM telegram_pet_events WHERE event_key=?').run(saved.key);
  }
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_specialist_events WHERE action='run_boss'").get().n, 1);
  assert.equal(f.sql.prepare('SELECT SUM(total_bosses_defeated) n FROM telegram_pet_memories').get().n, 1);
});

test('new Telegram command receipts retain their exact specialist identity for refresh and API retries', async () => {
  const f = fixture('84533');
  const options = (action) => ({event_key:'bot-primary-'+action, source:'telegram_command', runtime_event_key:'runtime:bot-original-'+action});
  assert.equal((await hooks.processPetAction(f.db,f.owner,'feed',options('feed'))).accepted,true);
  assert.equal((await hooks.processPetJob(f.db,f.owner,'street_artist',options('work'))).accepted,true);
  assert.equal((await hooks.processPetDailyChest(f.db,f.owner,options('daily_chest'))).accepted,true);
  await f.state();
  assert.equal(progress(f).care_xp,8); assert.equal(progress(f).job_xp,14); assert.equal(progress(f).bond_xp,13);
  for (const action of ['feed','work','daily_chest']) {
    assert.equal((await api(f,{action,event_key:options(action).event_key,job_key:'street_artist'})).duplicate,true);
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,3);
  assert.ok(f.sql.prepare('SELECT event_key FROM telegram_pet_specialist_events').all().every(row=>row.event_key.startsWith('runtime:bot-original-')));
});

test('already paid whitespace keys cannot starve recovery behind the batch limit', async () => {
  const f=fixture('84316'); standardRun(f,'spaces',21);
  f.sql.prepare('DELETE FROM telegram_pet_run_steps').run();
  for(let i=0;i<21;i++) {
    const key='spaces-'+i+' \t';
    f.sql.prepare(`INSERT INTO telegram_pet_run_steps
      (id,pet_id,telegram_id,run_id,step_index,choice_key,choice_type,event_key,success,metadata)
      VALUES (?,?,?,'spaces',?,'fight','fight',?,1,'{"source":"telegram_pets_api"}')`)
      .run('spaces-'+i,authority(f).pet_id,f.owner,i+1,key);
    if(i<20) await runtime(f,'runtime:api:'+key,now.toISOString().slice(0,10),'run_step');
  }
  await f.state();
  assert.equal(progress(f).adventure_xp,210);
});

test('Mini App shop purchases create gear progression and preserve it on API replay', async () => {
  const f = fixture('84601');
  const body = { action: 'buy', item_key: 'moon_kibble', request_id: 'gear-buy' };
  assert.equal((await f.act(body)).accepted, true);
  const gear = f.sql.prepare('SELECT * FROM telegram_pet_equipment_progression WHERE telegram_id=?').get(f.owner);
  assert.equal(gear?.item_key, 'moon_kibble');
  assert.equal((await f.state()).gear.some(row => row.item_key === 'moon_kibble'), true);
  const eventKey = f.sql.prepare("SELECT event_key FROM telegram_pet_events WHERE event_type='buy'").get().event_key;
  assert.equal((await api(f, { action: 'buy', item_key: 'moon_kibble', event_key: eventKey })).duplicate, true);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold, 955);
});

test('equipped gear mastery is persisted once with specialist awards and public totals remain unchanged on retry', async () => {
  const f = fixture('gear-mastery');
  assert.equal((await f.act({ action: 'buy', item_key: 'moon_kibble' })).accepted, true);
  const body = { action: 'feed', request_id: 'gear-feed' };
  assert.equal((await f.act(body)).accepted, true);
  const gear = () => f.sql.prepare("SELECT * FROM telegram_pet_equipment_progression WHERE item_key='moon_kibble'").get();
  assert.equal(gear()?.mastery_xp, 1);
  assert.equal(gear()?.item_xp, 1);
  const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  await f.act(body); await f.state();
  assert.equal(gear().mastery_xp, 1);
  assert.equal(progress(f).care_xp, 8);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_equipment_events').get().n, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp, xp);
});

test('gear write failure rolls back the specialist receipt so refresh can repair the whole award', async () => {
  const f = fixture('gear-rollback');
  await f.act({ action: 'buy', item_key: 'moon_kibble' });
  f.sql.exec("CREATE TRIGGER fail_gear BEFORE INSERT ON telegram_pet_equipment_events BEGIN SELECT RAISE(ABORT,'gear_failure'); END");
  assert.equal((await f.act({ action: 'feed', request_id: 'gear-failed-feed' })).accepted, true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n, 0);
  const xp = f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  f.sql.exec('DROP TRIGGER fail_gear');
  await f.state(); await f.state();
  assert.equal(progress(f).care_xp, 8);
  assert.equal(f.sql.prepare('SELECT mastery_xp FROM telegram_pet_equipment_progression').get().mastery_xp, 1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp, xp);
});

for (const lookup of ['equipment','faction']) test(`specialist ${lookup} read failure cannot close an incomplete award`, async () => {
  const f = fixture('gear-read-' + lookup);
  await f.act({ action: 'buy', item_key: 'moon_kibble' });
  let failed = false;
  const hook = lookup === 'equipment' ? 'beforeAll' : 'beforeFirst';
  f.db[hook] = async statement => {
    if (!(lookup === 'equipment' ? statement.query.includes('FROM telegram_pet_equipment_progression') : statement.query === 'SELECT faction FROM blocktopia_progression WHERE telegram_id=?')) return;
    f.db[hook] = null; failed = true; throw Error('runtime_dependency_unavailable');
  };
  const first = await applyPetRuntimeCommandAward(f.db, f.owner, 'runtime:dependency', 'train', authority(f));
  assert.equal(failed, true);
  assert.equal(first, null);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n, 0);
  assert.equal((await applyPetRuntimeCommandAward(f.db, f.owner, 'runtime:dependency', 'train', authority(f))).ok, true);
  assert.equal(progress(f).training_xp, 12);
});

test('purchased gear levels and mastery change equipped care and Arena effects', async () => {
  const f = fixture('gear-effects');
  f.sql.prepare("UPDATE telegram_pet_instances SET equipped_food='moon_kibble',equipped_weapon='laser_claws',source_profile_updated_at='moonpet-instance-v1'").run();
  f.sql.prepare("UPDATE telegram_pet_profiles SET equipped_food='moon_kibble',equipped_weapon='laser_claws'").run();
  for (const [key, slot] of [['moon_kibble','food'],['laser_claws','weapon']]) f.sql.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,?,?)').run(f.owner,key,slot);
  const basePet = await hooks.getPetProfile(f.db, f.owner);
  const baseRewards = { pet_xp: 10, moon_gold: 0, style_tokens: 0 }, baseRule = { hunger: -10, energy: 0, happiness: 0 };
  hooks.applyPetItemActionBonuses(basePet, 'feed', baseRule, baseRewards);
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET item_level=10,mastery_xp=5000,mastery_tier=5').run();
  const upgradedPet = await hooks.getPetProfile(f.db, f.owner);
  const rewards = { pet_xp: 10, moon_gold: 0, style_tokens: 0 }, rule = { hunger: -10, energy: 0, happiness: 0 };
  hooks.applyPetItemActionBonuses(upgradedPet, 'feed', rule, rewards);
  assert.ok(rewards.pet_xp > baseRewards.pet_xp);
  assert.ok(rule.hunger < baseRule.hunger);
  assert.ok(hooks.calculatePetArenaPower(upgradedPet,'fixed') > hooks.calculatePetArenaPower(basePet,'fixed'));
});

test('a failed gear registration rolls the whole purchase back', async () => {
  const f = fixture('gear-shop-rollback');
  f.sql.exec("CREATE TRIGGER fail_gear_purchase BEFORE INSERT ON telegram_pet_equipment_progression BEGIN SELECT RAISE(ABORT,'gear_purchase_failure'); END");
  await assert.rejects(f.act({ action:'buy', item_key:'moon_kibble' }), /gear_purchase_failure/);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,1000);
  assert.equal(f.sql.prepare('SELECT equipped_food FROM telegram_pet_instances').get().equipped_food,null);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='buy'").get().n,0);
});

test('ownership recovery restores earlier purchased gear without spending or guessing mastery', async () => {
  const f = fixture('gear-owned');
  await f.act({ action:'buy', item_key:'moon_kibble' });
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000').run();
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000').run();
  assert.equal((await f.act({ action:'buy', item_key:'nebula_snack' })).accepted,true);
  const balance = f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  f.sql.exec('DELETE FROM telegram_pet_equipment_progression');
  const snapshot = await f.state();
  assert.deepEqual(snapshot.gear.map(row=>row.item_key).sort(),['moon_kibble','nebula_snack']);
  assert.ok(snapshot.gear.every(row=>row.mastery_xp===0));
  await f.state();
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,balance);
});

test('saved care credits its original equipment after replacement and pet switching', async () => {
  const f = fixture('gear-source');
  await f.act({ action:'buy', item_key:'moon_kibble' });
  f.sql.exec("CREATE TRIGGER fail_saved_gear BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'saved_gear_failure'); END");
  await f.act({ action:'feed', request_id:'old-gear-feed' });
  f.sql.exec('DROP TRIGGER fail_saved_gear');
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000').run();
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000').run();
  assert.equal((await f.act({ action:'buy', item_key:'nebula_snack' })).accepted,true);
  f.pet('new-gear-pet',currentSeason,300,2);
  await hooks.switchActivePetSeasonSlot(f.db,f.owner,'new-gear-pet');
  await f.state();
  const rows = f.sql.prepare('SELECT item_key,mastery_xp FROM telegram_pet_equipment_progression').all();
  assert.equal(rows.find(row=>row.item_key==='moon_kibble').mastery_xp,1);
  assert.equal(rows.find(row=>row.item_key==='nebula_snack').mastery_xp,0);
  assert.equal(progress(f).care_xp,8);
});

test('legacy specialist recovery cannot give newly purchased gear invented historical mastery', async () => {
  const f = fixture('gear-legacy');
  await f.act({ action:'feed', request_id:'legacy-feed' });
  f.sql.exec("DELETE FROM telegram_pet_specialist_events; DELETE FROM telegram_pet_specialist_progression; UPDATE telegram_pet_events SET metadata=json_remove(metadata,'$.equipment_snapshot') WHERE event_type='feed'");
  await f.act({ action:'buy', item_key:'moon_kibble' });
  await f.state();
  assert.equal(progress(f).care_xp,8);
  assert.equal(f.sql.prepare('SELECT mastery_xp FROM telegram_pet_equipment_progression').get().mastery_xp,0);
});

test('gear mastery threshold and daily/weekly/public action totals stay consistent', async () => {
  const f = fixture('gear-public');
  await f.act({action:'buy',item_key:'moon_kibble'});
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET mastery_xp=74').run();
  const first = await f.act({action:'feed',request_id:'tier-feed'});
  assert.equal(f.sql.prepare('SELECT mastery_tier FROM telegram_pet_equipment_progression').get().mastery_tier,1);
  for (const period of ['daily','weekly','seasonal']) {
    const board = await f.get('/telegram-pets/leaderboard?period='+period);
    assert.equal(board.entries[0].pet_xp,first.pet_xp_awarded);
  }
  const state = await f.state();
  assert.equal(state.gear[0].mastery_xp,75);
  assert.equal(state.guidance.missions.find(m=>m.key.startsWith('pet-daily-feed:')).completed,true);
  const activity = await f.get('/telegram-pets/activity');
  assert.equal(activity.items.filter(row=>row.event_type==='feed').length,1);
});

test('Standard Run previews use upgraded source gear without borrowing the active pet loadout', async () => {
  const f = fixture('gear-run-preview');
  f.sql.prepare("UPDATE telegram_pet_instances SET equipped_toy='hoverboard'").run();
  f.sql.prepare("UPDATE telegram_pet_profiles SET equipped_toy='hoverboard'").run();
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'hoverboard','toy')").run(f.owner);
  const base = await hooks.getPetProfile(f.db,f.owner);
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET item_level=10,mastery_xp=5000').run();
  const upgraded = await hooks.getPetProfile(f.db,f.owner);
  const run = {depth:1,difficulty:1}, choice = {key:'sneak',type:'sneak',base_risk:0.3,rewards:{moon_gold:[10,10]},costs:{}};
  const first = hooks.serializePetRunChoicePreview(run,choice,base,[],base);
  const second = hooks.serializePetRunChoicePreview(run,choice,upgraded,[],upgraded);
  assert.ok(second.risk_percent < first.risk_percent);
  assert.notDeepEqual(second.reward_preview,first.reward_preview);
  f.pet('other-run-pet',currentSeason,300,2);
  await hooks.switchActivePetSeasonSlot(f.db,f.owner,'other-run-pet');
  const other = await hooks.getPetProfile(f.db,f.owner);
  assert.deepEqual(other.equipment_progression,{});
});

test('training faction bonus survives a failed dependency read and is credited once', async () => {
  const f = fixture('gear-faction-bonus');
  f.sql.prepare("INSERT INTO blocktopia_progression (telegram_id,faction) VALUES (?,'hard-fork-rockers')").run(f.owner);
  f.db.beforeFirst = async statement => {
    if(statement.query !== 'SELECT faction FROM blocktopia_progression WHERE telegram_id=?') return;
    f.db.beforeFirst=null; throw Error('faction_read_failed');
  };
  assert.equal(await applyPetRuntimeCommandAward(f.db,f.owner,'runtime:faction','train',authority(f)),null);
  await applyPetRuntimeCommandAward(f.db,f.owner,'runtime:faction','train',authority(f));
  await applyPetRuntimeCommandAward(f.db,f.owner,'runtime:faction','train',authority(f));
  assert.equal(progress(f).training_xp,13);
});

test('Arena completion repairs frozen gear and specialist XP after an interrupted award', async () => {
  const f = fixture('gear-arena');
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'laser_claws','weapon')").run(f.owner);
  const match = {battle_id:'arena-gear',match_id:'arena-gear',mode:'pet_arena',player1_telegram_id:f.owner,
    player1_pet_id:authority(f).pet_id,player1_season_key:currentSeason,
    player1_pet_snapshot_json:JSON.stringify({equipment_progression:{laser_claws:{item_key:'laser_claws',slot:'weapon',item_level:1,mastery_xp:0}}})};
  f.sql.exec("CREATE TRIGGER fail_arena_gear BEFORE INSERT ON telegram_pet_specialist_events BEGIN SELECT RAISE(ABORT,'arena_specialist_failure'); END");
  const result=await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,'arena_win',{pet_xp:20,moon_gold:10});
  assert.equal(result.accepted,true,JSON.stringify(result));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  const gold=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  f.sql.exec('DROP TRIGGER fail_arena_gear');
  await f.state(); await f.state();
  assert.equal(progress(f).arena_xp,20);
  assert.equal(f.sql.prepare('SELECT mastery_xp FROM telegram_pet_equipment_progression').get().mastery_xp,1);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,gold);
});

test('Mini App equipment upgrade spends once, completes its mission and appears publicly without XP inflation', async () => {
  const f=fixture('gear-upgrade-action');
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=100000').run();
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=100000').run();
  await f.act({action:'buy',item_key:'moon_kibble'});
  const before=(await f.state()).gear.find(row=>row.item_key==='moon_kibble');
  assert.equal(before.item_level,1);
  for(const material of ['moon_dust','scrap_metal','crystal_shard','mastery_token','battery_cell']) {
    f.sql.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,100)').run(f.owner,material);
  }
  const body={action:'gear_upgrade',item_key:'moon_kibble',request_id:'upgrade-once'};
  const result=await f.act(body);
  assert.equal(result.accepted,true,JSON.stringify(result));
  const gold=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  assert.equal((await f.act(body)).duplicate,true);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,gold);
  const state=await f.state();
  assert.equal(state.gear.find(row=>row.item_key==='moon_kibble').item_level,2);
  assert.equal(state.guidance.missions.find(m=>m.key.startsWith('pet-daily-shop:')).completed,true);
  const events=(await f.get('/telegram-pets/activity')).items.filter(row=>row.event_type==='equipment_upgrade');
  assert.equal(events.length,1);
  assert.match(events[0].text,/upgraded Moon Kibble/);
  assert.equal(events[0].pet_xp_awarded,0);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,100000);
});

for (const [choice, matching] of [['fight','laser_claws'],['sneak','hoverboard'],['rest','crystal_bowl'],['boss','crown_jacket']]) {
  test(`saved Standard ${choice} keeps its equipment action and original specialist award`, async () => {
    const f=fixture('gear-choice-'+choice);
    standardRun(f,'choice-run',choice==='boss'?10:2);
    const loadout=[['laser_claws','weapon'],['hoverboard','toy'],['crystal_bowl','food'],[choice==='boss'?'crown_jacket':'moon_armor','outfit']];
    const snapshot=Object.fromEntries(loadout.map(([item_key,slot])=>[item_key,{item_key,slot,item_level:1,mastery_xp:0}]));
    for(const [key,slot] of loadout) f.sql.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,?,?)').run(f.owner,key,slot);
    f.sql.prepare('UPDATE telegram_pet_run_steps SET choice_key=?,choice_type=?,metadata=?').run(choice,choice,JSON.stringify({source:'telegram_pets_api',equipment_snapshot:snapshot}));
    f.pet('choice-other',currentSeason,300,2); f.active('choice-other');
    await f.state(); await f.state();
    assert.equal(progress(f).adventure_xp,10,'a boss room remains a step award, not a standalone boss award');
    const receipt=JSON.parse(f.sql.prepare('SELECT payload_json FROM telegram_pet_specialist_events').get().payload_json);
    assert.equal(receipt.action,'run_step');
    assert.equal(receipt.equipment_action,'run_'+choice);
    const gear=f.sql.prepare('SELECT item_key,mastery_xp FROM telegram_pet_equipment_progression').all();
    for(const row of gear) assert.equal(row.mastery_xp,row.item_key===matching||row.item_key==='moon_armor'?1:0,row.item_key);
  });
}

for(const [item,slot] of [['crown_jacket','outfit'],['hoverboard','toy']]) test(`Arena ${slot} power uses both paid levels and mastery`, async () => {
  const f=fixture('gear-arena-'+slot);
  f.sql.prepare(`UPDATE telegram_pet_instances SET equipped_${slot}=?,source_profile_updated_at='moonpet-instance-v1'`).run(item);
  f.sql.prepare(`UPDATE telegram_pet_profiles SET equipped_${slot}=?`).run(item);
  f.sql.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,?,?)').run(f.owner,item,slot);
  const power=async()=>hooks.calculatePetArenaPower(await hooks.getPetProfile(f.db,f.owner),'fixed');
  const base=await power();
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET item_level=10').run();
  const leveled=await power();
  assert.ok(leveled>base);
  f.sql.prepare('UPDATE telegram_pet_equipment_progression SET mastery_xp=5000,mastery_tier=5').run();
  assert.ok(await power()>leveled);
});

for(const surface of ['API','Telegram']) for(const action of ['feed','work']) {
  test(`immediate ${surface} ${action} credits saved gear when a concurrent purchase replaces it`, async () => {
    const f=fixture('847'+(surface==='API'?'1':'2')+(action==='feed'?'1':'2'));
    f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=10000').run();
    f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=10000').run();
    const [original,replacement]=action==='feed'?['moon_kibble','nebula_snack']:['street_hoodie','moon_armor'];
    assert.equal((await f.act({action:'buy',item_key:original})).accepted,true);
    const batch=f.db.batch.bind(f.db);
    let replaced=false;
    f.db.batch=async statements=>{
      const result=await batch(statements);
      if(!replaced && f.sql.prepare("SELECT 1 FROM telegram_pet_events WHERE event_type=? AND status='accepted'").get(action)) {
        replaced=true;
        assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
        assert.equal((await f.act({action:'buy',item_key:replacement})).accepted,true);
      }
      return result;
    };
    const body={action,job_key:'street_artist',event_key:'concurrent-gear'};
    const originalFetch=globalThis.fetch;
    const invoke=surface==='API'?async()=>assert.equal((await api(f,body)).accepted,true):async()=>{
      const response=await worker.fetch(new Request('https://moonboys-api.test/telegram/webhook',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:{message_id:1,
          chat:{id:Number(f.owner),type:'private'},from:{id:Number(f.owner),first_name:'Test player'},
          text:action==='feed'?'/feed':'/petwork street_artist'}})
      }),{DB:f.db,TELEGRAM_BOT_TOKEN:'fixture-only-token',PET_MINI_APP_ENABLED:'false'});
      assert.equal(response.status,200);
    };
    globalThis.fetch=async url=>{
      assert.match(String(url),/^https:\/\/api\.telegram\.org\/botfixture-only-token\//);
      return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{headers:{'content-type':'application/json'}});
    };
    try { await invoke(); await invoke(); } finally { globalThis.fetch=originalFetch; }
    assert.equal(replaced,true,'replacement happened after the accepted primary receipt');
    await f.state();
    const gear=Object.fromEntries(f.sql.prepare('SELECT item_key,mastery_xp FROM telegram_pet_equipment_progression').all().map(row=>[row.item_key,row.mastery_xp]));
    assert.equal(gear[original],1);
    assert.equal(gear[replacement],0);
    assert.equal(progress(f)[action==='feed'?'care_xp':'job_xp'],action==='feed'?8:14);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,1);
  });
}

async function assertSourceMaterial(f, action, sourceId, table) {
  const receipt=f.sql.prepare('SELECT payload_json FROM telegram_pet_specialist_events WHERE action=?').get(action);
  assert.ok(receipt,'specialist receipt exists');
  const plan=JSON.parse(receipt.payload_json);
  const expected=resolvePetRareDrop(table,await getPetRuntimeSourceDropRoll(action,f.owner,sourceId));
  assert.equal(plan.material_source_id,sourceId);
  assert.equal(plan.material,expected);
  assert.equal(f.sql.prepare('SELECT quantity FROM telegram_pet_material_balances WHERE material_key=?').get(expected)?.quantity,1);
}

test('live job material draw is server-owned, atomic and stable across failed settlement, pet switching and API retries', async()=>{
  const f=fixture('84801');
  const body={action:'work',job_key:'street_artist',event_key:'source-draw',source_event_id:'forged',drop_roll:0,material_amount:25};
  f.sql.exec("CREATE TRIGGER fail_material_draw BEFORE INSERT ON telegram_pet_material_balances BEGIN SELECT RAISE(ABORT,'interrupted_material_draw'); END");
  assert.equal((await api(f,body)).accepted,true);
  const event=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='work'").get();
  assert.ok(event); assert.notEqual(event.id,body.source_event_id);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  const xp=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances').get().pet_xp;
  f.sql.exec('DROP TRIGGER fail_material_draw');
  f.pet('draw-other',currentSeason,300,2); f.active('draw-other');
  await f.state();
  await assertSourceMaterial(f,'job',event.id,'job');
  assert.equal((await api(f,{...body,drop_roll:0.9999,material_amount:9999})).duplicate,true);
  await f.state();
  assert.equal(f.sql.prepare('SELECT SUM(quantity) n FROM telegram_pet_material_balances').get().n,1);
  assert.equal(progress(f).job_xp,14);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(authority(f).pet_id).pet_xp,xp);
});

test('Standard extraction gets one source-backed material draw across different request keys', async()=>{
  const f=fixture('84802'); standardRun(f,'material-extract');
  const first=await api(f,{action:'run_extract',run_id:'material-extract',event_key:'client-extract'});
  assert.equal(first.accepted,true,JSON.stringify(first));
  const event=f.sql.prepare("SELECT id FROM telegram_pet_events WHERE event_type='run_extract'").get();
  await assertSourceMaterial(f,'run_extract',event.id,'run');
  await api(f,{action:'run_extract',run_id:'material-extract',event_key:'different-client-extract'});
  await f.state();
  assert.equal(f.sql.prepare('SELECT SUM(quantity) n FROM telegram_pet_material_balances').get().n,1);
});

test('timed Work keeps its material draw pending until the whole specialist award commits', async()=>{
  const f=fixture('draw-timed');
  assert.equal((await f.act({action:'activity_start',activity_type:'work'})).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes')").run();
  f.sql.exec("CREATE TRIGGER fail_timed_material BEFORE INSERT ON telegram_pet_material_balances BEGIN SELECT RAISE(ABORT,'interrupted_timed_material'); END");
  assert.equal((await f.act({action:'activity_claim'})).reason,'activity_reward_recovery_pending');
  const event=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_type='activity_claim'").get();
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  f.sql.exec('DROP TRIGGER fail_timed_material');
  assert.equal((await f.act({action:'activity_claim'})).accepted,true);
  await assertSourceMaterial(f,'timed_work',event.id,'job');
  await f.act({action:'activity_claim'}); await f.state();
  assert.equal(f.sql.prepare('SELECT SUM(quantity) n FROM telegram_pet_material_balances').get().n,1);
});

for(const outcome of ['arena_win','arena_draw','arena_loss','kaiju_win']) test(`${outcome} awards one material from its committed combat receipt`, async()=>{
  const f=fixture('draw-'+outcome);
  const arena=outcome.startsWith('arena_');
  const match={match_id:'draw-match',battle_id:'draw-match',mode:arena?'pet_arena':'solo',
    player1_telegram_id:f.owner,player1_pet_id:authority(f).pet_id,player1_season_key:currentSeason,
    score_json:JSON.stringify({reward_sources:{[f.owner]:{...authority(f),equipment_snapshot:{}}}})};
  const reward=await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,outcome,{pet_xp:20,moon_gold:10});
  assert.equal(reward.accepted,true,JSON.stringify(reward));
  const event=f.sql.prepare('SELECT id FROM telegram_pet_events WHERE event_type=?').get(arena?'arena_battle':'kaiju_battle');
  await assertSourceMaterial(f,arena?'arena_complete':'kaiju_win',event.id,arena?'arena':'kaiju');
  await hooks.awardPetKaijuPlayerResult(f.db,f.owner,match,outcome,{pet_xp:20,moon_gold:10});
  await f.state();
  assert.equal(f.sql.prepare('SELECT SUM(quantity) n FROM telegram_pet_material_balances').get().n,1);
});

test('Weekly Boss recovery retains its source material draw and does not close after a failed material write', async()=>{
  const f=fixture('draw-weekly');
  const victory=savedWeeklyVictory(f,now.toISOString().slice(0,10));
  f.sql.exec("CREATE TRIGGER fail_boss_material BEFORE INSERT ON telegram_pet_material_balances BEGIN SELECT RAISE(ABORT,'interrupted_boss_material'); END");
  await f.state();
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").get().n,0);
  f.sql.exec('DROP TRIGGER fail_boss_material');
  await f.state(); await f.state();
  await assertSourceMaterial(f,'run_boss',victory.key,'run');
  assert.equal(f.sql.prepare('SELECT SUM(quantity) n FROM telegram_pet_material_balances').get().n,1);
});

test('material draws respect stack caps without reopening completed specialist rewards', async()=>{
  const f=fixture('draw-cap');
  for(const key of ['scrap_metal','moon_fabric','spray_core']) f.sql.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,9999)').run(f.owner,key);
  assert.equal((await f.act({action:'work',job_key:'street_artist',request_id:'cap-draw'})).accepted,true);
  const plan=JSON.parse(f.sql.prepare('SELECT payload_json FROM telegram_pet_specialist_events').get().payload_json);
  assert.ok(plan.material);
  f.sql.prepare('UPDATE telegram_pet_material_balances SET quantity=9998').run();
  await f.state();
  assert.ok(f.sql.prepare('SELECT quantity FROM telegram_pet_material_balances').all().every(row=>row.quantity===9998));
});

for(const type of ['crafting','cosmetic_unlock']) test(`completed ${type} is public once with zero ranking XP and unfinished purchases stay hidden`, async()=>{
  const f=fixture('public-'+type);
  f.sql.exec('UPDATE telegram_pet_instances SET pet_xp=10000; UPDATE telegram_pet_profiles SET pet_xp=10000;');
  for(const key of ['scrap_metal','moon_fabric']) f.sql.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,10)').run(f.owner,key);
  const body=type==='crafting'?{action:'craft',recipe_key:'street_rations',request_id:'public-once'}:{action:'cosmetic_unlock',cosmetic_key:'profile_frame',request_id:'public-once'};
  assert.equal((await f.act(body)).accepted,true);
  const balance=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get();
  assert.equal((await f.act(body)).duplicate,true);
  for(const status of ['pending','rejected','settling']) f.sql.prepare('INSERT INTO telegram_pet_system_events (id,telegram_id,system_key,action_key,period_key,status) VALUES (?,?,?,?,?,?)').run(status,f.owner,type==='crafting'?'crafting':'cosmetic','unfinished',status,status);
  const activity=(await f.get('/telegram-pets/activity')).items.filter(row=>row.event_type===type);
  assert.equal(activity.length,1);
  assert.match(activity[0].text,type==='crafting'?/crafted Street Rations/:/collected profile frame/);
  assert.equal(activity[0].pet_xp_awarded,0); assert.equal(activity[0].xp_awarded,0);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,10000);
  for(const period of ['daily','weekly','seasonal']) assert.equal((await f.get('/telegram-pets/leaderboard?period='+period)).entries.reduce((sum,row)=>sum+row.pet_xp,0),0);
  assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),balance);
});

test('material source hints describe live settlement routes, including weighted draws', async()=>{
  const f=fixture('material-hints');
  const materials=Object.fromEntries((await f.state()).materials.map(row=>[row.key,row.sources]));
  assert.ok(materials.scrap_metal.includes('job_material_draw'));
  assert.ok(materials.battery_cell.includes('moon_run_extraction_material_draw'));
  assert.ok(materials.arena_token.includes('arena_completion_material_draw'));
  assert.deepEqual(materials.evolution_fragment,['daily_run_boss']);
  assert.deepEqual(materials.mastery_token,['seasonal_raid_victory']);
  for(const sources of Object.values(materials)) assert.ok(!sources.some(source=>['run_fight','run_loot','arena_daily','event','arena_win','arena_draw'].includes(source)));
});

test('a saved seasonal raid reward repairs its material draw once from the accepted reward receipt', async()=>{
  const f=fixture('draw-raid');
  const rotation='saved-raid-rotation', source='saved-raid-reward';
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
    (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at,reward_claimed_at)
    VALUES (?,?,?,?,'neon_titan',900,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
    .run(authority(f).pet_id,f.owner,currentSeason,rotation);
  f.sql.prepare(`INSERT INTO telegram_pet_events
    (id,pet_id,telegram_id,season_key,event_type,event_key,day_key,week_key,status)
    VALUES (?,?,?,?,'seasonal_boss',?,?,'fixture','accepted')`)
    .run(source,authority(f).pet_id,f.owner,currentSeason,`seasonal:${rotation}:${f.owner}:${authority(f).pet_id}`,now.toISOString().slice(0,10));
  await f.state(); await f.state();
  await assertSourceMaterial(f,'run_boss',source,'run');
  assert.equal(f.sql.prepare('SELECT SUM(quantity) n FROM telegram_pet_material_balances').get().n,1);
});

test('a transient timed-claim receipt lookup cannot settle without its material draw', async()=>{
  const f=fixture('draw-source-read');
  await f.act({action:'activity_start',activity_type:'work'});
  f.sql.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes')").run();
  let failed=false;
  f.db.beforeFirst=async statement=>{
    if(!statement.query.includes('SELECT id, pet_id, telegram_id, event_type, event_key, status, reason, xp_awarded') ||
      !f.sql.prepare("SELECT 1 FROM telegram_pet_events WHERE event_type='activity_claim' AND status='accepted'").get()) return;
    f.db.beforeFirst=null; failed=true; throw Error('receipt_read_unavailable');
  };
  await assert.rejects(f.act({action:'activity_claim'}),/receipt_read_unavailable/);
  assert.equal(failed,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_specialist_events').get().n,0);
  const event=f.sql.prepare("SELECT id FROM telegram_pet_events WHERE event_type='activity_claim'").get();
  assert.equal((await f.act({action:'activity_claim'})).accepted,true);
  await assertSourceMaterial(f,'timed_work',event.id,'job');
});


test('full Mini App actions for two equipped pets compile under the production compound SELECT limit', async () => {
  const f = fixture('84999');
  f.sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/059_telegram_pet_sanctuary.sql',import.meta.url),'utf8'));
  f.pet('second-d1-limit', currentSeason, 300, 2);
  for (const table of ['telegram_pet_profiles', 'telegram_pet_instances']) {
    f.sql.prepare(`UPDATE ${table} SET equipped_food='crystal_bowl',equipped_toy='hoverboard',equipped_outfit='crown_jacket',
      equipped_armor='cyber_armor',equipped_weapon='moon_blaster',equipped_charm='shield_charm' WHERE telegram_id=?`).run(f.owner);
  }
  const statements = new Map();
  const capture = statement => {
    statements.set(statement.query, statement.args);
  };
  f.db.beforeFirst = capture; f.db.beforeAll = capture; f.db.beforeRun = capture;
  f.db.beforeBatch = batch => batch.forEach(capture);
  const token = 'isolated-mini-app-test-token';
  const auth = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: Number(f.owner), first_name: 'D1 test player' }) });
  const check = [...auth].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  auth.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(check).digest('hex'));
  async function request(path, body = {}) {
    const response = await deployedWorker.fetch(new Request(`https://moonboys.test/telegram-pets/app/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ init_data: auth.toString(), displayed_pet_id: f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner)?.pet_id, ...body }),
    }), { DB: f.db, TELEGRAM_BOT_TOKEN: token });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.ok(data.state?.pet, 'the full HTTP response includes a usable state');
    if (path === 'action') assert.equal(data.result.accepted, true);
    return data;
  }
  await request('state');
  await request('action', { action: 'feed', request_id: 'd1-feed' });
  await request('action', { action: 'switch_pet_slot', pet_id: 'second-d1-limit', request_id: 'd1-switch' });
  const played = await request('action', { action: 'play', request_id: 'd1-play' });
  assert.equal(played.state.pet.pet_id, 'second-d1-limit');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_equipment_progression').get().n, 6);
  assert.equal(progress(f).care_xp, 8);
  assert.equal(f.sql.prepare('SELECT care_xp FROM telegram_pet_specialist_progression WHERE pet_id=?').get('second-d1-limit').care_xp, 7);

  for (const table of ['telegram_pet_profiles','telegram_pet_instances']) {
    f.sql.prepare(`UPDATE ${table} SET pet_xp=10000,health=100,energy=100 WHERE telegram_id=?`).run(f.owner);
  }
  const arena = await request('action', { action:'arena_start' });
  await request('action', { action:'arena_move',battle_id:arena.result.battle.battle_id,expected_round:1,move:'ab' });
  await request('action', { action:'arena_forfeit',battle_id:arena.result.battle.battle_id });
  const kaiju = await request('action', { action:'kaiju_start' });
  await request('action', { action:'kaiju_card',match_id:kaiju.result.match.match_id,card_key:'big-daddy-kong' });

  // Node SQLite does not expose sqlite3_limit. Python 3.11+ exposes the real
  // SQLite compiler limit, unlike counting UNION tokens (which misses nesting).
  const schema = f.sql.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END").all().map(row => row.sql + ';').join('\n');
  assert.ok(statements.size > 100, 'compile all SQL reached by full HTTP state, care, switch and combat flows');
  const compiled = spawnSync('python3', ['-c', `
import json, sqlite3, sys
payload = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
db.executescript(payload['schema'])
db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT, 5)
db.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 100)
db.setlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG, 32)
try:
    db.execute(' UNION ALL '.join(['SELECT 1'] * 6))
except sqlite3.OperationalError as error:
    assert 'too many terms in compound SELECT' in str(error)
else:
    raise AssertionError('D1 compound limit was not enforced')
for query, args in payload['statements']:
    try:
        db.execute('EXPLAIN ' + query, args).fetchall()
    except Exception as error:
        raise AssertionError(str(error) + '\\n' + query) from error
print('Compiled', len(payload['statements']), 'actual Mini App statements with compound limit 5')
`], { input: JSON.stringify({ schema, statements: [...statements] }), encoding: 'utf8' });
  assert.ifError(compiled.error);
  assert.equal(compiled.status, 0, compiled.stderr);
  console.log(compiled.stdout.trim());
});

for (const [label, method, match] of [
  ['adoption authority', 'beforeFirst', q=>q.includes('SELECT telegram_id FROM telegram_pet_profiles WHERE telegram_id = ? LIMIT 1')],
  ['account wallet profile', 'beforeFirst', q=>q.trim()==='SELECT * FROM telegram_pet_profiles WHERE telegram_id = ?'],
  ['saved lifecycle', 'beforeFirst', q=>q.includes('SELECT l.*, s.season_key')],
  ['evolution reveal', 'beforeFirst', q=>q.includes('SELECT MAX(stage) AS stage FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND telegram_id=?')],
  ['incubation daily count', 'beforeFirst', q=>q.includes('SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet')],
  ['rare morph memory', 'beforeFirst', q=>q==='SELECT * FROM telegram_pet_memories WHERE pet_id=? AND telegram_id=? AND season_key=?'],
  ['rare morph stage', 'beforeFirst', q=>q==='SELECT MAX(stage) AS stage FROM telegram_pet_evolutions_by_pet WHERE pet_id=?'],
  ['rare morph traits', 'beforeAll', q=>q.includes('SELECT trait_id FROM telegram_pet_personality_traits WHERE pet_id=? AND telegram_id=? AND season_key=? AND unlocked_at IS NOT NULL')],
  ['pet age', 'beforeFirst', q=>q.includes('SELECT s.pet_id, s.telegram_id, s.season_key, i.level, i.pet_xp, s.created_at AS season_slot_created_at') && q.includes('WHERE s.pet_id=? AND s.season_key=?')],
  ['identity scope', 'beforeFirst', q=>q.includes('SELECT s.pet_id, s.season_key, s.slot_number, s.acquisition_type') && q.includes('FROM telegram_pet_active_slots')],
  ['identity stage', 'beforeFirst', q=>q.includes('SELECT e.evolution_id, e.stage, e.unlocked_at')],
  ['identity memories', 'beforeFirst', q=>q==='SELECT * FROM telegram_pet_memories WHERE pet_id = ? AND telegram_id = ? AND season_key = ?'],
  ['identity personalities', 'beforeAll', q=>q.includes('SELECT trait_id, progress, unlocked_at FROM telegram_pet_personality_traits')],
  ['identity boss victories', 'beforeAll', q=>q.includes('SELECT boss_id, victories, updated_at FROM telegram_pet_boss_victories')],
]) test(`required ${label} read failure cannot display missing or reset pet progress`, async()=>{
  const f=fixture('read-'+label.replaceAll(' ','-'));
  f.reveal(authority(f).pet_id);
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='adult' WHERE pet_id=?").run(authority(f).pet_id);
  const before=await f.state();
  let triggered=false;
  f.db[method]=s=>{if(match(s.query)){triggered=true;throw Error('required_pet_read_unavailable');}};
  if(label==='pet age') {
    const failed=await f.state();
    assert.equal(failed.season_slots.slots.find(s=>s.active).pet.progression,null,'age outage uses the existing PROGRESSION UNAVAILABLE card');
  } else await assert.rejects(f.state(),/required_pet_read_unavailable/);
  assert.equal(triggered,true);
  f.db[method]=null;
  const after=await f.state();
  assert.equal(after.adopted,true);
  assert.deepEqual(after.lifecycle,before.lifecycle);
  assert.equal(after.pet.moon_gold,before.pet.moon_gold);
});

for (const [label, method, match] of [
  ['roster adoption', 'beforeFirst', q=>q.includes('SELECT telegram_id FROM telegram_pet_profiles WHERE telegram_id = ? LIMIT 1')],
  ['roster active pointer', 'beforeFirst', q=>q.includes('SELECT pet_id, season_key FROM telegram_pet_active_slots')],
  ['Arcade lifetime XP', 'beforeFirst', q=>q.includes('SELECT arcade_xp_total FROM arcade_progression_state')],
  ['Arcade spendable XP', 'beforeFirst', q=>q.includes('SELECT arcade_xp_spendable, arcade_xp_spent FROM arcade_xp_wallets')],
  ['roster owned pets', 'beforeAll', q=>q.includes('FROM telegram_pet_season_slots s') && q.includes('AS source_slot_number')],
]) test(`account audit: ${label} outage cannot reset roster or hide earned purchasing options`, async()=>{
  const f=fixture('roster-'+label.replaceAll(' ','-'));
  f.pet('selected-roster-pet',currentSeason,300,2); f.active('selected-roster-pet');
  await f.state();
  f.sql.prepare('INSERT OR REPLACE INTO arcade_progression_state (telegram_id,arcade_xp_total) VALUES (?,50000)').run(f.owner);
  f.sql.prepare('INSERT OR REPLACE INTO arcade_xp_wallets (telegram_id,arcade_xp_earned,arcade_xp_spendable,arcade_xp_spent) VALUES (?,50000,40000,10000)').run(f.owner);
  const before=await hooks.buildPetSeasonSlotSummary(f.db,f.owner,now);
  assert.equal(before.active_pet_id,'selected-roster-pet'); assert.equal(before.arcade_xp_available,40000);
  let triggered=false;
  f.db[method]=s=>{if(match(s.query)){triggered=true;throw Error('roster_read_unavailable');}};
  await assert.rejects(hooks.buildPetSeasonSlotSummary(f.db,f.owner,now),/roster_read_unavailable/);
  await assert.rejects(f.state(),/roster_read_unavailable/,'full state must preserve the last good roster on the client');
  assert.equal(triggered,true); f.db[method]=null;
  assert.deepEqual(await hooks.buildPetSeasonSlotSummary(f.db,f.owner,now),before);
});

for(const system of ['run','arena','kaiju']) test(`account audit: unreadable pending ${system} cannot permit a pet switch`,async()=>{
  const f=fixture('pending-'+system); f.pet('switch-target',currentSeason,300,2); await f.state();
  if(system==='run') { standardRun(f,'pending-run'); f.sql.exec("UPDATE telegram_pet_runs SET status='active'"); }
  if(system==='arena') f.sql.prepare(`INSERT INTO telegram_pet_arena_battles (id,battle_id,chat_id,player1_telegram_id,player1_pet_snapshot_json,player2_pet_snapshot_json) VALUES ('pending','pending','fixture',?,'{}','{}')`).run(f.owner);
  if(system==='kaiju') f.sql.prepare(`INSERT INTO telegram_pet_kaiju_matches (id,match_id,chat_id,player1_telegram_id) VALUES ('pending','pending','fixture',?)`).run(f.owner);
  const before=f.sql.prepare('SELECT * FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner);
  f.db.beforeFirst=s=>{if(s.query.includes(' AS id FROM telegram_pet_'+({run:'runs',arena:'arena_battles',kaiju:'kaiju_matches'}[system])))throw Error('pending_work_unavailable');};
  await assert.rejects(hooks.switchActivePetSeasonSlot(f.db,f.owner,'switch-target'),/pending_work_unavailable/);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner),before);
  f.db.beforeFirst=null;
  assert.equal((await hooks.switchActivePetSeasonSlot(f.db,f.owner,'switch-target')).reason,'pet_'+system+'_active');
});

for(const kind of ['objectives','latest receipt','accepted receipt']) test(`account audit: Daily Journey ${kind} failure cannot advertise lost or unsettled progress`,async()=>{
  const f=fixture('daily-display-'+kind.replaceAll(' ','-')); const state=await f.state();
  const day=state.daily_journey.utc_day;
  f.sql.prepare(`INSERT INTO telegram_pet_daily_journey_receipts (receipt_id,event_key,telegram_id,pet_id,season_key,utc_day,completed_objectives,status,reason,growth_mark_id)
    VALUES ('earned','earned',?,?,?,?,3,'accepted','daily_journey_growth_mark_awarded','saved-mark')`).run(f.owner,authority(f).pet_id,currentSeason,day);
  const before=await hooks.buildPetMiniAppJourneySummary(f.db,f.owner,state.season_slots,now);
  assert.equal(before.daily.growth_mark_awarded,true);
  let triggered=false;
  const match=q=>kind==='objectives' ? q.includes('FROM telegram_pet_daily_journey_objectives') && q.includes('GROUP BY')
    :q.includes('SELECT status, reason, growth_mark_id, completed_objectives') && q.includes(kind==='latest receipt'?'ORDER BY created_at DESC':'ORDER BY created_at ASC');
  const fail=s=>{if(match(s.query)){triggered=true;throw Error('daily_journey_read_unavailable');}};
  f.db.beforeFirst=fail; f.db.beforeAll=fail;
  await assert.rejects(hooks.buildPetMiniAppJourneySummary(f.db,f.owner,state.season_slots,now),/daily_journey_read_unavailable/);
  await assert.rejects(f.state(),/daily_journey_read_unavailable/);
  assert.equal(triggered,true); f.db.beforeFirst=null; f.db.beforeAll=null;
  assert.deepEqual((await hooks.buildPetMiniAppJourneySummary(f.db,f.owner,state.season_slots,now)).daily,before.daily);
});

test('account audit: Weekly Journey latest receipt failure uses its existing syncing state',async()=>{
  const f=fixture('weekly-display'); const state=await f.state();
  f.db.beforeFirst=s=>{if(s.query.includes('SELECT status, reason, crest_id, completed_objectives') && s.query.includes('ORDER BY created_at DESC'))throw Error('weekly_journey_read_unavailable');};
  const failed=await hooks.buildPetMiniAppJourneySummary(f.db,f.owner,state.season_slots,now);
  assert.equal(failed.weekly.authority_available,false);
  assert.equal(failed.weekly.reason,'weekly_journey_authority_syncing');
  f.db.beforeFirst=null;
  assert.equal((await hooks.buildPetMiniAppJourneySummary(f.db,f.owner,state.season_slots,now)).weekly.authority_available,true);
});

test('account audit: genuine empty roster wallet and unearned journeys remain valid',async()=>{
  const f=fixture('empty-account'); const state=await f.state();
  assert.equal(state.season_slots.arcade_xp_available,0);
  assert.equal(state.season_slots.can_buy_next_slot,false);
  assert.equal(state.daily_journey.completed_objectives,0);
  assert.equal(state.daily_journey.growth_mark_awarded,false);
  assert.equal(state.weekly_journey.weekly_crest_awarded,false);
});

const weeklyRewardReadFailures = [
  ['thrown', () => { throw Error('weekly_reward_list_unavailable'); }],
  ['resolved failure', () => ({ success: false, error: 'D1 unavailable', results: [] })],
  ['missing results', () => ({ success: true })],
  ['malformed results', () => ({ success: true, results: {} })],
  ['null response', () => null],
];
for (const [failure, failRead] of weeklyRewardReadFailures)
for (const pending of [false, true]) test(`Weekly Boss reward-list ${failure} outage cannot advertise ${pending ? 'a missing saved payout' : 'an empty claim list'}`, async () => {
  const f = fixture('weekly-claim-list-' + pending);
  await f.state();
  if (pending) {
    const day = `${now.getUTCFullYear() - 1}-01-15`;
    const oldSeason = hooks.getPetSeasonInfo(new Date(day + 'T12:00:00Z')).key;
    f.pet('old-claim-list', oldSeason, 300);
    savedWeeklyVictory(f, day, 'old-claim-list');
    f.sql.prepare('UPDATE telegram_pet_weekly_boss_progress SET reward_claimed_at=NULL WHERE telegram_id=?').run(f.owner);
    // Keep the durable victory pending while testing only the display read.
    f.db.beforeBatch = statements => {
      if (statements.some(s => s.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && s.args.includes('pet_weekly_boss'))) throw Error('fixture_payout_pending');
    };
  }
  const before = await f.state();
  assert.equal(before.guidance.weekly_boss.pending_rewards.length, pending ? 1 : 0);
  let triggered = false;
  const prepare = f.db.prepare.bind(f.db);
  f.db.prepare = query => {
    const statement = prepare(query);
    if (/SELECT v\.pet_id,\s*v\.season_key,\s*v\.week_key,\s*v\.boss_id/.test(query)) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...args) => {
        const bound = bind(...args);
        bound.all = async () => { triggered = true; return failRead(); };
        return bound;
      };
    }
    return statement;
  };
  await assert.rejects(f.state(), /weekly_reward_list_unavailable/);
  assert.equal(triggered, true);
  f.db.prepare = prepare;
  const after = await f.state();
  assert.deepEqual(after.guidance.weekly_boss.pending_rewards, before.guidance.weekly_boss.pending_rewards);
  assert.equal(after.pet.moon_gold, before.pet.moon_gold);
  assert.equal(after.pet.pet_xp, before.pet.pet_xp);
});

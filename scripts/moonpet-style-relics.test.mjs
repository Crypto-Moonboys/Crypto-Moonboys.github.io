import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { readOwnedRelics, initializeRelicRoute, relicRouteChoices, relicRouteSuccess, relicSearchSalvage } from '../workers/moonboys-api/pets/relic-passives.js';
import { createContractState, contractChoices, advanceContract, getContractBoard } from '../workers/moonboys-api/pets/continuing-contracts.js';
import { equipPetStyle } from '../workers/moonboys-api/pets/style-loadout.js';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

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
    async first() {
      if (db.beforeFirst) {
        const injected = await db.beforeFirst(this);
        if (injected !== undefined) return injected;
      }
      return sql.prepare(this.query).get(...this.args) || null;
    }
    async all() { if (db.beforeAll) return db.beforeAll(this); return { results: sql.prepare(this.query).all(...this.args) }; }
    exec() {
      if (/\bRETURNING\b/i.test(this.query)) { const results = sql.prepare(this.query).all(...this.args); return { results, meta: { changes: results.length } }; }
      return { results: [], meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
    async run() { if (db.beforeRun) await db.beforeRun(this); return this.exec(); }
  }
  const db = { beforeBatch: null, beforeFirst: null, beforeRun: null, prepare(query) { return new Statement(query); }, async batch(statements) {
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
  const state = () => hooks.buildPetMiniAppState(db, owner, 'fixture-token');
  return { sql, db, owner, pet, active, act, state };
}
const petRow=f=>f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('current-'+f.owner);
test('all three styles equip and remove free, persist per pet, reject unowned/foreign/stale pets',async()=>{
  const f=fixture('style-controls');await f.state();const before=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get();
  assert.equal((await f.act({action:'style_equip',pet_id:petRow(f).pet_id,cosmetic_key:'profile_frame',enabled:true})).accepted,false);
  for(const key of ['profile_frame','victory_pose','run_trail']) {
    f.sql.prepare('INSERT INTO telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key,quantity)VALUES(?,?,1)').run(f.owner,key);
    const req={action:'style_equip',pet_id:petRow(f).pet_id,cosmetic_key:key,enabled:true};
    assert.equal((await f.act(req)).accepted,true);assert.equal((await f.act(req)).accepted,true);
    assert.ok((await f.state()).style_loadout.equipped.includes(key));
    assert.equal((await f.act({...req,enabled:false})).accepted,true);
    assert.ok(!(await f.state()).style_loadout.equipped.includes(key));
    await f.act(req);
  }
  assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),before);
  f.pet('style-second',currentSeason,200,2);f.active('style-second');
  assert.deepEqual((await f.state()).style_loadout.equipped,[]);
  assert.equal((await f.act({action:'style_equip',pet_id:petRow(f).pet_id,cosmetic_key:'profile_frame',enabled:true})).accepted,false);
  assert.equal((await f.act({action:'style_equip',pet_id:'foreign',cosmetic_key:'profile_frame',enabled:true})).accepted,false);
});

test('Style mutations fail closed on resolved D1 read failures',async()=>{
  const f=fixture('style-fail-closed'),pet=petRow(f);
  const failFirst=pattern=>{
    f.db.beforeFirst=statement=>{
      if(!pattern.test(statement.query))return undefined;
      f.db.beforeFirst=null;
      return {success:false,error:'simulated D1 outage'};
    };
  };
  f.sql.prepare("INSERT INTO telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key,quantity)VALUES(?,'profile_frame',1)").run(f.owner);
  failFirst(/INSERT INTO telegram_pet_style_loadouts/);
  await assert.rejects(()=>equipPetStyle(f.db,f.owner,pet,{pet_id:pet.pet_id,cosmetic_key:'profile_frame',enabled:true}),/pet_state_read_unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_style_loadouts').get().n,0,'failed style write cannot be reported as equipped');
});

test('all ten relics have effective route mechanics, while empty loadouts preserve old choices',()=>{
  const plain=createContractState('scout','bruiser',1,'relic');
  const s=initializeRelicRoute(structuredClone(plain),['bitcoin_heart','moon_battery']);assert.equal(s.health,plain.health+18);
  const choices=[{key:'bold',odds:60,damage:20,salvage:10},{key:'search',odds:60,damage:20,salvage:10},{key:'rest',odds:100,damage:0,salvage:0,detail:'Rest.'}];
  assert.deepEqual(relicRouteChoices(plain,choices),choices);
  let mods=relicRouteChoices({relics:['cyber_collar','chain_shield','lucky_coin','infinite_spray_can','hacker_lens']},choices,{graffiti:true});
  assert.equal(mods[0].odds,85);assert.equal(mods[0].damage,18);assert.equal(mods[1].odds,85);assert.equal(mods[3].key,'hidden');
  const ghost={relics:['ghost_tag']};assert.equal(relicRouteSuccess(ghost,false,true),false);assert.equal(relicRouteSuccess(ghost,false,false),true);assert.equal(relicRouteSuccess(ghost,false,false),false);
  assert.equal(relicSearchSalvage({relics:['golden_sticker']},'search',299),30);assert.equal(relicSearchSalvage({relics:['golden_sticker']},'search',300),0);
  const rest=initializeRelicRoute(createContractState('scout','scout',1,'boots'),['neon_boots']);rest.health=1;
  assert.equal(advanceContract(rest,'rest',0,10000).state.health,30);
  const contract=initializeRelicRoute(createContractState('scout','bruiser',1,'relics'),['hacker_lens','chain_shield','ghost_tag']);
  assert.ok(contractChoices(contract).some(c=>c.key==='hidden'));
  const advanced=advanceContract(contract,'hidden',99);assert.equal(advanced.state.relic_ghost_used,true);assert.equal(advanced.state.wins,1);
});

test('relic reads fail closed and new drops cannot alter an already saved contract',async()=>{
  const f=fixture('relic-snapshot');await f.state();
  f.sql.prepare("INSERT INTO telegram_pet_relics(telegram_id,relic_id,rarity,effects_json)VALUES(?,'bitcoin_heart','rare','{\"start_energy\":9999}')").run(f.owner);
  const b=await getContractBoard(f.db,f.owner,petRow(f));
  assert.equal((await f.act({action:'contract_start',pet_id:petRow(f).pet_id,sequence:b.next_sequence,goal:'scout',build:'bruiser',tier:1})).accepted,true);
  assert.equal((await getContractBoard(f.db,f.owner,petRow(f))).run.max_health,120,'use canonical rules, not stored effects');
  f.sql.prepare("INSERT INTO telegram_pet_relics(telegram_id,relic_id,rarity,effects_json)VALUES(?,'moon_battery','rare','{}')").run(f.owner);
  assert.equal((await getContractBoard(f.db,f.owner,petRow(f))).run.max_health,120,'saved snapshot is immutable');
  f.db.beforeAll=()=>({success:false,error:'outage'});await assert.rejects(()=>readOwnedRelics(f.db,f.owner));
});

test('migration 079 can be applied and rerun without losing owned styles',async()=>{
  const f=fixture('style-migration');await f.state();
  f.sql.prepare("INSERT INTO telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key,quantity)VALUES(?,'profile_frame',1)").run(f.owner);
  await f.act({action:'style_equip',pet_id:petRow(f).pet_id,cosmetic_key:'profile_frame',enabled:true});
  const migration=fs.readFileSync(new URL('../workers/moonboys-api/migrations/079_moonpet_training_and_style.sql',import.meta.url),'utf8');
  f.sql.exec(migration);f.sql.exec(migration);
  assert.deepEqual((await f.state()).style_loadout.equipped,['profile_frame']);
  const tables=new DatabaseSync(':memory:');
  tables.exec('CREATE TABLE telegram_pet_instances(pet_id TEXT PRIMARY KEY);');
  tables.exec(migration);tables.exec(migration);
  assert.equal(tables.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='telegram_pet_style_loadouts'").get().n,1);
});

test('removed mode has no engine, board, table or accepted action',async()=>{
  const f=fixture('removed-mode');
  assert.equal(fs.existsSync(new URL('../js/moonpet-practice.js',import.meta.url)),false);
  assert.equal(fs.existsSync(new URL('../workers/moonboys-api/pets/practice-progression.js',import.meta.url)),false);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='telegram_pet_practice'").get().n,0);
  assert.equal('practice' in await f.state(),false);
  const before=f.sql.prepare('SELECT total_changes() n').get().n;
  for(const action of ['practice_start','practice_step','practice_claim']) {
    const result=await f.act({action});assert.equal(result.accepted,false);assert.equal(result.reason,'mini_app_action_invalid');
  }
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before,'retired actions cannot mutate saves or rewards');
});

test('retired nameplate cannot be bought or equipped and saved history is kept',async()=>{
  const f=fixture('retired-nameplate');await f.state();const pet=petRow(f);
  f.sql.prepare("INSERT INTO telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key,quantity)VALUES(?,'rename_badge',1)").run(f.owner);
  f.sql.prepare("INSERT INTO telegram_pet_style_loadouts(pet_id,telegram_id,cosmetic_key,enabled)VALUES(?,?,'rename_badge',1)").run(pet.pet_id,f.owner);
  const before=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  assert.ok(!(await f.state()).style_loadout.equipped.includes('rename_badge'));
  assert.equal((await f.act({action:'style_equip',pet_id:pet.pet_id,cosmetic_key:'rename_badge',enabled:true})).accepted,false);
  assert.equal((await f.act({action:'cosmetic_unlock',cosmetic_key:'rename_badge'})).accepted,false);
  assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner),before);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_cosmetic_unlocks WHERE telegram_id=? AND cosmetic_key='rename_badge'").get(f.owner).quantity,1);
  assert.equal(f.sql.prepare("SELECT enabled FROM telegram_pet_style_loadouts WHERE pet_id=? AND cosmetic_key='rename_badge'").get(pet.pet_id).enabled,1);
});

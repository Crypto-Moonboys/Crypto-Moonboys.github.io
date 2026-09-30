import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildPetGearSummary } from '../workers/moonboys-api/pets/runtime-phase-5a.js';
import worker, { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

const currentSeason = hooks.getPetSeasonInfo(new Date()).key;
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


import { PET_MARKET_OFFERS, getPetMarketOffers } from '../workers/moonboys-api/pets/economy-expansion.js';
import { PET_CRAFTING_RECIPES } from '../workers/moonboys-api/pets/economy-phase-3.js';
import { processPetCraftRecipe, processPetEquipmentUpgrade } from '../workers/moonboys-api/pets/live-systems.js';
function funded(id) {
  const f=fixture(id);
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=500000 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=500000,moon_gold=900000,moon_crystals=9000,style_tokens=9000 WHERE telegram_id=?').run(f.owner);
  for(const key of ['scrap_metal','moon_fabric','crystal_shard','battery_cell','spray_core','kaiju_fragment','arena_token','evolution_fragment','mastery_token'])
    f.sql.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,9000)').run(f.owner,key);
  return f;
}

test('gear summary uses live Shop descriptions without advertising unused utility targets', async () => {
  const f = funded('gear-copy');
  const state = await hooks.buildPetMiniAppState(f.db, f.owner, 'fixture-token');
  const catalog = Object.fromEntries(state.guidance.shop_items.map(item => [item.key, item]));
  const text = buildPetGearSummary(Object.values(catalog).map(item => ({ item_key: item.key, item_level: 10, mastery_xp: 5000 })), catalog);
  for (const item of Object.values(catalog)) assert.ok(text.includes(item.description), item.key);
  assert.match(text, /bonus ×1\.978/);
  assert.doesNotMatch(text, /strength training|guard job|explore reward|run fight|health restore/);
  assert.ok(text.length <= 4096, 'a complete collection must fit one Telegram message');
  assert.match(catalog.crystal_bowl.description, /energy/);
  assert.doesNotMatch(catalog.crystal_bowl.description, /health/);
  assert.match(catalog.hoverboard.description, /Standard Runs/);
  for (const key of ['street_hoodie', 'moon_armor', 'crown_jacket']) assert.match(catalog[key].description, /Feed, Play, Clean, Sleep and Train/);
  const rule = { ...hooks.PET_ACTIONS.feed };
  const rewards = { pet_xp: rule.pet_xp, moon_gold: rule.gold, style_tokens: 0 };
  hooks.applyPetItemActionBonuses({ pet_xp: 0, equipped_food: 'crystal_bowl' }, 'feed', rule, rewards);
  assert.equal(rule.energy, hooks.PET_ACTIONS.feed.energy + 10);
  assert.equal(rule.health, undefined, 'Crystal Bowl does not grant the previously advertised health');
  for (const action of ['dance', 'energy_drink', 'cuddles']) {
    const specialRule = { ...hooks.PET_ACTIONS[action] };
    const specialRewards = { pet_xp: 0, moon_gold: 0, style_tokens: 0 };
    hooks.applyPetItemActionBonuses({ equipped_outfit: 'crown_jacket' }, action, specialRule, specialRewards);
    assert.deepEqual(specialRewards, { pet_xp: 0, moon_gold: 0, style_tokens: 0 });
  }
});
test('audit every permanent Shop item, each upgrade level, and replay',async()=>{
 const f=funded('catalog');
 const state=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
 assert.equal(state.guidance.shop_items.length,17);
 for(const item of state.guidance.shop_items){
   const before=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
   const body={action:'buy',item_key:item.key,request_id:'purchase:'+item.key};
   const bought=await f.act(body);assert.equal(bought.accepted,true,item.key);
   const after=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
   for(const key of Object.keys(before))assert.equal(before[key]-after[key],item.cost[key]||0,item.key+' '+key);
   assert.equal(bought.pet['equipped_'+item.slot],item.key);
   assert.equal((await f.act(body)).duplicate,true);
   assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner),after);
   for(let level=2;level<=10;level++){
     const key=item.key+':level:'+level;
     const result=await processPetEquipmentUpgrade(f.db,f.owner,item.key,key);
     assert.equal(result.accepted,true,item.key+' level '+level+' '+result.reason);
     assert.equal(result.item.item_level,level);
     assert.equal((await processPetEquipmentUpgrade(f.db,f.owner,item.key,key)).duplicate,true);
   }
 }
 console.log('17 purchases and 153 upgrades verified; replay did not spend twice');
});
test('audit all recipes and consumable use',async()=>{
 const f=funded('recipes');
 for(const [key,recipe] of Object.entries(PET_CRAFTING_RECIPES)){
  const r=await processPetCraftRecipe(f.db,f.owner,key,key);assert.equal(r.accepted,true,key);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?").get(f.owner,recipe.output.item_key).quantity,recipe.output.quantity);
  assert.equal((await processPetCraftRecipe(f.db,f.owner,key,key)).duplicate,true);
 }
 for(const key of ['moon_snack','energy_drink','clean_wipe','lucky_charm','style_patch','adventure_map']){
  const p=funded('consume-'+key);
  p.sql.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item',?,2)").run(p.owner,key);
  const body={action:'use_item',item_key:key,request_id:key};
  const r=await p.act(body);assert.equal(r.accepted,true,key);
  assert.equal((await p.act(body)).duplicate,true,key);
  assert.equal(p.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?").get(p.owner,key).quantity,1);
  for(const period of ['daily','weekly','seasonal','all_time']){
   const board=await p.get('/telegram-pets/leaderboard?period='+period);
   assert.equal(board.entries[0].pet_xp,r.pet_xp_awarded+(period==='all_time'?500000:0),key+period);
  }
 }
 console.log('5 recipes and 6 consumables verified with single use and four-period XP parity');
});

test('all twelve market offers deliver their full bundle exactly once', async () => {
  const dates = new Map();
  for (let offset=0;offset<120 && dates.size<PET_MARKET_OFFERS.length;offset++) {
    const at=new Date(Date.UTC(2026,6,1+offset,12));
    for (const offer of getPetMarketOffers(at.toISOString().slice(0,10))) if (!dates.has(offer.key)) dates.set(offer.key,at);
  }
  assert.equal(dates.size,12);
  for (const offer of PET_MARKET_OFFERS) {
    const f=funded('market-'+offer.key);
    const at=dates.get(offer.key);
    const wallet=()=>f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
    const before=wallet();
    const bought=await hooks.buyPetMarketOffer(f.db,f.owner,offer.key,at);
    assert.equal(bought.accepted,true,offer.key+': '+bought.reason);
    const after=wallet();
    for (const key of Object.keys(before)) assert.equal(after[key],before[key]-(offer.cost[key]||0)+(offer.reward[key]||0),offer.key+' '+key);
    for (const [key,quantity] of Object.entries(offer.reward.items||{})) assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?").get(f.owner,key).quantity,quantity);
    for (const [key,quantity] of Object.entries(offer.reward.materials||{})) assert.equal(f.sql.prepare('SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=?').get(f.owner,key).quantity,9000+quantity);
    assert.equal((await hooks.buyPetMarketOffer(f.db,f.owner,offer.key,at)).duplicate,true);
    assert.deepEqual(wallet(),after);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE telegram_id=? AND event_type='economy_market' AND status='accepted'").get(f.owner).n,1);
    assert.equal(f.sql.prepare("SELECT SUM(pet_xp_awarded) n FROM telegram_pet_events WHERE telegram_id=? AND status='accepted'").get(f.owner).n,0);
  }
});

const wallet = f => f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
const shopMission = state => state.guidance.missions.find(m => m.key.startsWith('pet-daily-shop:'));
for (const action of ['equip','buy']) test(`${action} switches owned gear free without shopping or XP credit`, async () => {
  const f=funded('free-'+action);
  for (const key of ['moon_kibble','nebula_snack']) assert.equal((await f.act({action:'buy',item_key:key,request_id:key})).accepted,true);
  f.sql.prepare("UPDATE telegram_pet_equipment_progression SET item_level=10,mastery_tier=4,mastery_xp=950 WHERE telegram_id=? AND item_key='moon_kibble'").run(f.owner);
  // Purchases happened yesterday; today's switch must not fill shopping.
  f.sql.prepare("UPDATE telegram_pet_events SET day_key='2000-01-01' WHERE telegram_id=?").run(f.owner);
  f.sql.prepare('DELETE FROM telegram_pet_daily_completion WHERE telegram_id=?').run(f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=0,moon_crystals=0,style_tokens=0 WHERE telegram_id=?').run(f.owner);
  const state=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  assert.equal(state.guidance.shop_items.find(x=>x.key==='moon_kibble').owned,true);
  assert.equal(shopMission(state).completed,false);
  assert.match(shopMission(state).detail,/Market purchases, crafting and free equipment switches do not count/);
  const before=wallet(f), gear=f.sql.prepare('SELECT * FROM telegram_pet_equipment_progression WHERE telegram_id=?').all(f.owner);
  const body={action,item_key:'moon_kibble',pet_id:state.pet.pet_id,request_id:'free-switch'};
  const equipped=await f.act(body); assert.equal(equipped.accepted,true,equipped.reason); assert.equal(equipped.reason,'equipment_equipped');
  assert.equal(equipped.pet.equipped_food,'moon_kibble');
  assert.equal(equipped.pet.equipment_progression.moon_kibble.item_level,10);
  assert.equal((await f.act(body)).duplicate,true);
  assert.deepEqual(wallet(f),before);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_equipment_progression WHERE telegram_id=?').all(f.owner),gear);
  assert.equal(shopMission(await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token')).completed,false);
  const e=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND event_type='equip'").all(f.owner);
  assert.equal(e.length,1); assert.equal(e[0].pet_xp_awarded,0); assert.equal(e[0].xp_awarded,0);
  assert.equal(e[0].pet_id,state.pet.pet_id);
});

test('equipment switch rejects unowned, under-level and stale-pet requests',async()=>{
  const f=funded('free-guards');
  assert.equal((await f.act({action:'equip',item_key:'moon_kibble',request_id:'unowned'})).reason,'equipment_not_owned');
  for(const key of ['moon_kibble','nebula_snack']) await f.act({action:'buy',item_key:key,request_id:key});
  assert.equal((await f.act({action:'equip',item_key:'moon_kibble',pet_id:'someone-else',request_id:'stale'})).reason,'equipment_state_changed');
  f.pet('new-pet',currentSeason,0,2); f.active('new-pet');
  assert.equal((await f.act({action:'equip',item_key:'nebula_snack',request_id:'low-level'})).reason,'level_locked');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='equip'").get().n,0);
});

for(const conflict of ['active pet','ownership','loadout']) test(`equipment reservation rejects concurrent ${conflict} changes`,async()=>{
  const f=funded('equip-race-'+conflict);
  for(const key of ['moon_kibble','nebula_snack']) await f.act({action:'buy',item_key:key,request_id:key});
  f.pet('second-pet',currentSeason,500000,2);
  const before=wallet(f); let injected=false;
  f.db.beforeBatch=statements=>{
    if(!statements.some(s=>s.query.includes("'equipment_switch_pending'")))return;
    injected=true;
    if(conflict==='active pet')f.active('second-pet');
    if(conflict==='ownership')f.sql.prepare("DELETE FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key='moon_kibble'").run(f.owner);
    if(conflict==='loadout')f.sql.prepare("UPDATE telegram_pet_instances SET equipped_food='crystal_bowl' WHERE telegram_id=?").run(f.owner);
  };
  const r=await f.act({action:'equip',item_key:'moon_kibble',request_id:'race'});
  assert.equal(injected,true);assert.equal(r.accepted,false);assert.equal(r.reason,'equipment_state_changed');
  assert.deepEqual(wallet(f),before);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='equip'").get().n,0);
});

test('purchase race cannot charge gear bought by another request',async()=>{
  const f=funded('buy-race-owned');const before=wallet(f);let injected=false;
  f.db.beforeBatch=statements=>{
    if(!statements.some(s=>s.query.includes("'shop_purchase_pending'")))return;
    injected=true; f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'moon_kibble','food')").run(f.owner);
  };
  const r=await f.act({action:'buy',item_key:'moon_kibble',request_id:'race'});
  assert.equal(injected,true);assert.equal(r.accepted,false);assert.deepEqual(wallet(f),before);
  f.db.beforeBatch=null;
  assert.equal((await f.act({action:'buy',item_key:'moon_kibble',request_id:'retry'})).reason,'equipment_equipped');
  assert.deepEqual(wallet(f),before);
});

test('legacy accepted purchase recovers ownership before a free switch',async()=>{
  const f=funded('old-gear');
  for(const key of ['moon_kibble','nebula_snack'])await f.act({action:'buy',item_key:key,request_id:key});
  f.sql.prepare("DELETE FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key='moon_kibble'").run(f.owner);
  const before=wallet(f);
  assert.equal((await f.act({action:'equip',item_key:'moon_kibble',request_id:'recover'})).reason,'equipment_equipped');
  assert.deepEqual(wallet(f),before);
});

test('fully upgraded collection keeps daily completion reachable without repeat purchases',async()=>{
  const f=funded('maxed-collection');
  const initial=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  for(const item of initial.guidance.shop_items)f.sql.prepare('INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot,item_level) VALUES (?,?,?,10)').run(f.owner,item.key,item.slot);
  f.sql.prepare("UPDATE telegram_pet_equipment_progression SET item_level=9 WHERE telegram_id=? AND item_key='moon_kibble'").run(f.owner);
  assert.equal(shopMission(await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token')).completed,false);
  f.sql.prepare("UPDATE telegram_pet_equipment_progression SET item_level=10 WHERE telegram_id=? AND item_key='moon_kibble'").run(f.owner);
  const state=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  assert.equal(shopMission(state).completed,true);
  assert.match(shopMission(state).detail,/automatically complete/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type IN ('buy','equip')").get().n,0);
});

const rebaselineSql=fs.readFileSync(new URL('../workers/moonboys-api/migrations/078_moonpet_beta_season_xp_rebaseline.sql',import.meta.url),'utf8');
const postRewardRebaselineSql=fs.readFileSync(new URL('../workers/moonboys-api/migrations/082_moonpet_post_reward_overwrite_rebaseline.sql',import.meta.url),'utf8');
for(const [stored,actual] of [[9077,6935],[4099,4027],[2400,1901]]) test(`beta rebaseline repairs impossible ${stored}/${actual} totals without wiping progression`,async()=>{
  const f=funded('xp-'+stored);
  await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=? WHERE telegram_id=?').run(actual,f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=? WHERE telegram_id=?').run(actual,f.owner);
  f.sql.prepare('INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp) VALUES (?,?,?) ON CONFLICT(telegram_id,season_key) DO UPDATE SET season_xp=excluded.season_xp').run(f.owner,currentSeason,stored);
  f.sql.prepare("INSERT INTO telegram_pet_events (id,telegram_id,pet_id,event_key,event_type,season_key,day_key,week_key,pet_xp_awarded,status,created_at) VALUES ('e',?,?,'e','feed',?,'2000-01-01','2000-W01',12,'accepted','2000-01-01 00:00:00')").run(f.owner,'current-'+f.owner,currentSeason);
  const before=wallet(f), receipts=f.sql.prepare('SELECT * FROM telegram_pet_events').all();
  f.sql.exec('BEGIN'); f.sql.exec(rebaselineSql); f.sql.exec('COMMIT');
  const row=f.sql.prepare('SELECT * FROM moonpet_beta_xp_rebaseline').get();
  assert.equal(row.previous_season_xp,stored);assert.equal(row.retained_season_xp,actual);assert.equal(row.accepted_receipt_xp,12);assert.ok(row.applied_at);
  assert.deepEqual(wallet(f),before);assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events').all(),receipts);
  for(const period of ['seasonal','all_time']) assert.equal((await f.get('/telegram-pets/leaderboard?period='+period)).entries[0].pet_xp,actual);
  // A new real reward increments the rebased season and authoritative pet together.
  const reward=await f.act({action:'feed',request_id:'after-rebase'});assert.equal(reward.accepted,true,reward.reason);assert.ok(reward.pet_xp_awarded>0);
  f.sql.exec(rebaselineSql);
  for(const period of ['seasonal','all_time']) assert.equal((await f.get('/telegram-pets/leaderboard?period='+period)).entries[0].pet_xp,actual+reward.pet_xp_awarded);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM moonpet_beta_xp_rebaseline').get().n,1);
});

test('beta rebaseline respects multiple seasons, valid counters and unowned instance rows',async()=>{
  const f=funded('xp-scope');
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=100 WHERE telegram_id=?').run(f.owner);
  f.pet('old-pet','pet-s2025-001',500);
  // Invalid orphan must not become public XP or rescue an impossible counter.
  f.sql.exec('PRAGMA foreign_keys=OFF');
  f.sql.prepare("INSERT INTO telegram_pet_instances (pet_id,telegram_id,season_key,slot_number,pet_xp,source_profile_updated_at) VALUES ('orphan',?,?,3,999999,'0001-01-01 00:00:00')").run(f.owner,currentSeason);
  f.sql.exec('PRAGMA foreign_keys=ON');
  for(const [season,xp] of [[currentSeason,800],['pet-s2025-001',500]])f.sql.prepare('INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp) VALUES (?,?,?)').run(f.owner,season,xp);
  f.sql.exec(rebaselineSql);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?').get(f.owner,currentSeason).season_xp,100);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?').get(f.owner,'pet-s2025-001').season_xp,500);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM moonpet_beta_xp_rebaseline').get().n,1);
  assert.equal((await f.get('/telegram-pets/leaderboard?period=all_time')).entries[0].pet_xp,600);
});

test('post-reward overwrite rebaseline repairs only newly impossible season counters',async()=>{
  const f=funded('post-reward-overwrite');
  await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token');
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=2198 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=2198 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare('INSERT INTO telegram_pet_season_state (telegram_id,season_key,season_xp) VALUES (?,?,2258) ON CONFLICT(telegram_id,season_key) DO UPDATE SET season_xp=2258').run(f.owner,currentSeason);
  f.sql.exec(postRewardRebaselineSql);
  const correction=f.sql.prepare('SELECT previous_season_xp,retained_season_xp,difference,applied_at FROM moonpet_beta_xp_rebaseline_v2 WHERE telegram_id=?').get(f.owner);
  assert.deepEqual({previous_season_xp:correction.previous_season_xp,retained_season_xp:correction.retained_season_xp,difference:correction.difference},
    {previous_season_xp:2258,retained_season_xp:2198,difference:60});
  assert.ok(correction.applied_at);
  for(const period of ['seasonal','all_time']) assert.equal((await f.get('/telegram-pets/leaderboard?period='+period)).entries[0].pet_xp,2198);
  f.sql.exec(postRewardRebaselineSql);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM moonpet_beta_xp_rebaseline_v2').get().n,1,'migration must be idempotent');
  f.sql.prepare('UPDATE telegram_pet_season_state SET season_xp=2258 WHERE telegram_id=? AND season_key=?').run(f.owner,currentSeason);
  f.sql.exec(postRewardRebaselineSql);
  assert.equal(f.sql.prepare('SELECT season_xp FROM telegram_pet_season_state WHERE telegram_id=? AND season_key=?').get(f.owner,currentSeason).season_xp,2198,
    'a post-migration recurrence must be repairable after the Worker rollout');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM moonpet_beta_xp_rebaseline_v2').get().n,2,
    'each repeated correction must retain its own audit row');
});

for (const failure of ['ownership read','legacy recovery']) test(`resolved ${failure} failure cannot charge again for owned gear`,async()=>{
  const f=funded('owned-outage-'+failure);
  for (const key of ['moon_kibble','nebula_snack'])await f.act({action:'buy',item_key:key,request_id:key});
  if(failure==='legacy recovery') f.sql.prepare("DELETE FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key='moon_kibble'").run(f.owner);
  const before=wallet(f), prepare=f.db.prepare.bind(f.db);let injected=false;
  f.db.prepare=query=>{
    const statement=prepare(query);
    if(failure==='legacy recovery' ? query.includes('WITH definitions(item_key,slot)') : query.includes('FROM telegram_pet_equipment_progression WHERE telegram_id = ?')){
      const bind=statement.bind.bind(statement);
      statement.bind=(...args)=>{const bound=bind(...args);bound[failure==='legacy recovery'?'run':'all']=async()=>{injected=true;return {success:false,error:'D1 unavailable',results:[]};};return bound;};
    }
    return statement;
  };
  await assert.rejects(f.act({action:'buy',item_key:'moon_kibble',request_id:'outage'}),/equipment_ownership_unavailable/);
  assert.equal(injected,true);assert.deepEqual(wallet(f),before);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='buy'").get().n,2);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
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

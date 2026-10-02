import { dispatchRenderedPetAction } from './moonpet-mini-app-action-fixture.mjs';
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
    try { const results = []; for (const s of statements) results.push(Object.hasOwn(s,'run') ? await s.run() : Object.hasOwn(s,'all') ? await s.all() : s.exec()); sql.exec('COMMIT'); return results; }
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
  const act = body => dispatchRenderedPetAction(db,owner,{id:owner},body,'fixture-token');
  const get = async path => { const response = await worker.fetch(new Request('https://moonboys-api.test' + path), { DB: db }); assert.equal(response.status, 200); return response.json(); };
  return { sql, db, owner, pet, active, act, get };
}


import { PET_MARKET_OFFERS, getPetMarketOffers } from '../workers/moonboys-api/pets/economy-expansion.js';
import { PET_CRAFTING_RECIPES } from '../workers/moonboys-api/pets/economy-phase-3.js';
import { processPetCraftRecipe, processPetEquipmentUpgrade, processPetCosmeticUnlock } from '../workers/moonboys-api/pets/live-systems.js';
function funded(id) {
  const f=fixture(id);
  f.sql.prepare('UPDATE telegram_pet_instances SET pet_xp=500000 WHERE telegram_id=?').run(f.owner);
  f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=500000,moon_gold=900000,moon_crystals=9000,style_tokens=9000 WHERE telegram_id=?').run(f.owner);
  for(const key of ['scrap_metal','moon_fabric','crystal_shard','battery_cell','spray_core','kaiju_fragment','arena_token','evolution_fragment','mastery_token'])
    f.sql.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,9000)').run(f.owner,key);
  return f;
}

for (const action of ['craft', 'upgrade', 'cosmetic']) test(`${action} rejects failed or malformed spending transactions`, async () => {
  for (const failure of ['failed-reservation', 'failed-member', 'missing-member', 'malformed-member']) {
    const f=funded(`economy-result-${action}-${failure}`);
    f.sql.prepare("INSERT INTO telegram_pet_equipment_progression (telegram_id,item_key,slot) VALUES (?,'moon_kibble','food')").run(f.owner);
    const snapshot=()=>({wallet:wallet(f),materials:f.sql.prepare('SELECT * FROM telegram_pet_material_balances').all(),
      items:f.sql.prepare('SELECT * FROM telegram_pet_inventory').all(),gear:f.sql.prepare('SELECT * FROM telegram_pet_equipment_progression').all(),
      styles:f.sql.prepare('SELECT * FROM telegram_pet_cosmetic_unlocks').all()});
    const before=snapshot(), nativeBatch=f.db.batch.bind(f.db), nativePrepare=f.db.prepare.bind(f.db);
    let injected=false;
    if(failure==='failed-reservation') f.db.prepare=query=>{
      const statement=nativePrepare(query), bind=statement.bind.bind(statement);
      if(query.includes('INSERT OR IGNORE INTO telegram_pet_system_events')) statement.bind=(...args)=>{
        const bound=bind(...args);
        bound.run=async()=>{injected=true;return {success:false,error:'reservation_unavailable',meta:{changes:1}};};
        return bound;
      };
      return statement;
    };
    else f.db.batch=async statements=>{
      if(!statements[0]?.query.includes("UPDATE telegram_pet_system_events SET status='settling'")) return nativeBatch(statements);
      injected=true;
      const replies=statements.map(()=>({meta:{changes:1}}));
      if(failure==='failed-member') replies[1]={success:false,error:'spend_unavailable',meta:{changes:1}};
      if(failure==='missing-member') replies.pop();
      if(failure==='malformed-member') replies[1]={};
      return replies;
    };
    const request=()=>action==='craft' ? processPetCraftRecipe(f.db,f.owner,'battery_pack','broken-spend')
      : action==='upgrade' ? processPetEquipmentUpgrade(f.db,f.owner,'moon_kibble','broken-spend')
        : processPetCosmeticUnlock(f.db,f.owner,'profile_frame','broken-spend');
    await assert.rejects(request(),/pet_state_write_unavailable/,failure+' cannot acknowledge a purchase or an ordinary cost conflict');
    assert.equal(injected,true);
    assert.deepEqual(snapshot(),before,'unverified transactions must not change owned balances or goods');
    f.db.batch=nativeBatch;f.db.prepare=nativePrepare;
    const paid=await request();assert.equal(paid.accepted,true,paid.reason);
    const saved=snapshot();
    const retry=await request();assert.equal(retry.accepted,true);assert.equal(retry.duplicate,true);
    assert.deepEqual(snapshot(),saved,'retry settles this request exactly once');
  }
});

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
  const before=f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?").get(f.owner,recipe.output.item_key)?.quantity||0;
  const r=await processPetCraftRecipe(f.db,f.owner,key,key);assert.equal(r.accepted,true,key);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?").get(f.owner,recipe.output.item_key).quantity,before+recipe.output.quantity);
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
 console.log('6 recipes and 6 consumables verified with single use and four-period XP parity');
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

test('a Market request retried after UTC midnight cannot buy the next day stock', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 1, 23, 59, 59) });
  const f = funded('market-midnight-replay');
  const request = { action: 'market_buy', offer_key: 'snack_crate', request_id: 'saved-market-click' };
  for (const day of ['2026-10-01', '2026-10-02']) assert.ok(getPetMarketOffers(day).some(offer => offer.key === request.offer_key));
  assert.equal((await f.act(request)).accepted, true);
  const snapshot = () => ({ wallet: wallet(f),
    items: f.sql.prepare('SELECT * FROM telegram_pet_inventory WHERE telegram_id=?').all(f.owner),
    receipts: f.sql.prepare("SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").all(f.owner) });
  const saved = snapshot();
  t.mock.timers.tick(2000);
  const retry = await f.act(request);
  assert.equal(retry.accepted, true);
  assert.equal(retry.duplicate, true, 'the saved request remains the original purchase across the UTC reset');
  assert.deepEqual(snapshot(), saved, 'retry cannot debit currency, grant goods or consume the next day stock');
  const fresh = await f.act({ ...request, request_id: 'new-market-click' });
  assert.equal(fresh.accepted, true, 'a new request can buy the new daily stock');
  assert.equal(fresh.duplicate, false);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_key='moon_snack'").get(f.owner).quantity, 6);
});

test('a Market retry keeps its receipt when season rollover removes the offer', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 30, 23, 59, 59) });
  const f = funded('market-season-replay');
  const request = { action: 'market_buy', offer_key: 'clean_kit', request_id: 'saved-old-season-market-click' };
  assert.ok(getPetMarketOffers('2026-09-30').some(offer => offer.key === request.offer_key));
  assert.ok(!getPetMarketOffers('2026-10-01').some(offer => offer.key === request.offer_key));
  assert.equal((await f.act(request)).accepted, true);
  const saved = wallet(f);
  t.mock.timers.tick(2000);
  const retry = await f.act(request);
  assert.equal(retry.accepted, true, 'a committed purchase remains acknowledged after its offer rotates away');
  assert.equal(retry.duplicate, true);
  assert.deepEqual(wallet(f), saved);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").get(f.owner).n, 1);
});

test('overlapping Market requests across midnight reserve the same click once', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 1, 23, 59, 59) });
  const f = funded('market-midnight-race');
  const request = { action: 'market_buy', offer_key: 'snack_crate', request_id: 'racing-market-click' };
  const before = wallet(f);
  let concurrent;
  f.db.beforeBatch = async statements => {
    if (!statements.some(statement => statement.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && statement.args.includes('pet_market'))) return;
    f.db.beforeBatch = null;
    t.mock.timers.tick(2000);
    concurrent = await f.act(request);
    assert.equal(concurrent.accepted, true);
  };
  const first = await f.act(request);
  assert.ok(concurrent, 'the next-day request commits after the first receipt read and before reservation');
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, true, 'the losing request acknowledges the already committed purchase');
  assert.equal(wallet(f).moon_gold, before.moon_gold - 70);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_key='moon_snack'").get(f.owner).quantity, 3);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").get(f.owner).n, 1);
});

test('Market request tracking preserves daily stock from older receipts without a request key', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 1, 12) });
  const f = funded('market-legacy-daily-stock');
  assert.equal((await hooks.buyPetMarketOffer(f.db, f.owner, 'snack_crate')).accepted, true);
  const savedWallet = wallet(f);
  const saved = f.sql.prepare("SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").all(f.owner);
  assert.equal(JSON.parse(saved[0].metadata).context.request_key, undefined);
  const result = await f.act({ action: 'market_buy', offer_key: 'snack_crate', request_id: 'new-client-old-stock' });
  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, true);
  assert.deepEqual(wallet(f), savedWallet);
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").all(f.owner), saved);
});

test('a stale-tab Market duplicate stays free when its response is retried after midnight', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 1, 23, 59, 59) });
  const f = funded('market-duplicate-request-alias');
  assert.equal((await f.act({ action: 'market_buy', offer_key: 'snack_crate', request_id: 'first-tab-click' })).accepted, true);
  const request = { action: 'market_buy', offer_key: 'snack_crate', request_id: 'stale-second-tab-click' };
  const second = await f.act(request);
  assert.equal(second.accepted, true);
  assert.equal(second.duplicate, true);
  const saved = { wallet: wallet(f), items: f.sql.prepare('SELECT * FROM telegram_pet_inventory WHERE telegram_id=?').all(f.owner) };
  t.mock.timers.tick(2000);
  const retry = await f.act(request);
  assert.equal(retry.accepted, true);
  assert.equal(retry.duplicate, true, 'an acknowledged duplicate cannot become a paid purchase on retry');
  assert.deepEqual({ wallet: wallet(f), items: f.sql.prepare('SELECT * FROM telegram_pet_inventory WHERE telegram_id=?').all(f.owner) }, saved);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").get(f.owner).n, 1,
    'duplicate acknowledgement needs no extra reward claim');
});

test('a delayed Market duplicate cannot replace a next-day paid request receipt', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 1, 23, 59, 59) });
  const f = funded('market-alias-loses-race');
  await f.act({ action: 'market_buy', offer_key: 'snack_crate', request_id: 'first-tab-click' });
  const request = { action: 'market_buy', offer_key: 'snack_crate', request_id: 'racing-stale-tab-click' };
  let injected = false;
  f.db.beforeRun = async statement => {
    if (injected || !statement.query.includes('INSERT OR IGNORE INTO telegram_pet_system_events')
      || !statement.query.includes('market_request')) return;
    injected = true;
    t.mock.timers.tick(2000);
    const paid = await f.act(request);
    assert.equal(paid.accepted, true);
    assert.equal(paid.duplicate, false);
  };
  const delayed = await f.act(request);
  assert.equal(injected, true, 'pause duplicate acknowledgement before its durable request alias');
  assert.equal(delayed.accepted, true);
  assert.equal(delayed.duplicate, true);
  const saved = wallet(f);
  const replay = await f.act(request);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.receipt.day_key, '2026-10-02', 'the paid request must remain the authoritative receipt');
  assert.deepEqual(wallet(f), saved);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").get(f.owner).n, 2);
});

test('a prior-day Market duplicate wins atomically against a next-day spend already in flight', async t => {
  const originalNow = new Date(Date.UTC(2026, 9, 1, 23, 59, 59));
  t.mock.timers.enable({ apis: ['Date'], now: originalNow.getTime() });
  const f = funded('market-alias-wins-race');
  await f.act({ action: 'market_buy', offer_key: 'snack_crate', request_id: 'first-tab-click' });
  const saved = wallet(f);
  const request = { action: 'market_buy', offer_key: 'snack_crate', request_id: 'racing-stale-tab-click' };
  t.mock.timers.tick(2000);
  let injected = false;
  f.db.beforeBatch = async statements => {
    const claim = statements.find(statement => statement.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && statement.args.includes('pet_market'));
    if (injected || !claim) return;
    injected = true;
    const metadata = claim.args.map(value => {
      try { return typeof value === 'string' ? JSON.parse(value) : null; } catch { return null; }
    }).find(value => value?.context?.request_key);
    assert.ok(metadata?.context.request_key);
    // This earlier request captured its board time before midnight and resumes
    // its duplicate acknowledgement before the next-day reservation commits.
    const duplicate = await hooks.buyPetMarketOffer(f.db, f.owner, 'snack_crate', originalNow, metadata.context.request_key);
    assert.equal(duplicate.accepted, true);
    assert.equal(duplicate.duplicate, true);
  };
  const result = await f.act(request);
  assert.equal(injected, true);
  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, true, 'reservation must recheck the newly committed duplicate alias');
  assert.deepEqual(wallet(f), saved);
  assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_key='moon_snack'").get(f.owner).quantity, 3);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").get(f.owner).n, 1);
});

test('a failed Market duplicate alias write cannot acknowledge an unremembered request', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 1, 23, 59, 59) });
  const f = funded('market-alias-write-failure');
  await f.act({ action: 'market_buy', offer_key: 'snack_crate', request_id: 'first-tab-click' });
  const saved = wallet(f), prepare = f.db.prepare.bind(f.db);
  let injected = false;
  f.db.prepare = query => {
    const statement = prepare(query), bind = statement.bind.bind(statement);
    if (query.includes('INSERT OR IGNORE INTO telegram_pet_system_events') && query.includes('market_request')) {
      statement.bind = (...args) => {
        const bound = bind(...args);
        bound.run = async () => { injected = true; return { success: false, error: 'alias_storage_offline', meta: { changes: 1 } }; };
        return bound;
      };
    }
    return statement;
  };
  const acknowledge = () => hooks.buyPetMarketOffer(f.db, f.owner, 'snack_crate', new Date(), 'unremembered-request');
  await assert.rejects(acknowledge(), /pet_state_write_unavailable/);
  assert.equal(injected, true);
  assert.deepEqual(wallet(f), saved);
  f.db.prepare = prepare;
  assert.equal((await acknowledge()).duplicate, true, 'recovery must durably acknowledge the duplicate');
  t.mock.timers.tick(2000);
  assert.equal((await acknowledge()).duplicate, true);
  assert.deepEqual(wallet(f), saved);
});

test('a same-day Market reservation loser remembers its duplicate request across midnight', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 1, 23, 59, 59) });
  const f = funded('market-alias-reservation-loser');
  const request = { action: 'market_buy', offer_key: 'snack_crate', request_id: 'losing-tab-click' };
  let injected = false;
  f.db.beforeBatch = async statements => {
    if (injected || !statements.some(statement => statement.query.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && statement.args.includes('pet_market'))) return;
    injected = true;
    const winner = await f.act({ ...request, request_id: 'winning-tab-click' });
    assert.equal(winner.accepted, true);
    assert.equal(winner.duplicate, false);
  };
  const duplicate = await f.act(request);
  assert.equal(injected, true);
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  const saved = wallet(f);
  t.mock.timers.tick(2000);
  const retry = await f.act(request);
  assert.equal(retry.duplicate, true, 'losing stock reservation must remember the same acknowledgement as an already-sold board');
  assert.deepEqual(wallet(f), saved);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_market'").get(f.owner).n, 1);
});

const wallet = f => f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
const shopMission = state => state.guidance.missions.find(m => m.key.startsWith('pet-daily-shop:'));
for (const operation of ['purchase','equip']) test(`direct ${operation} cannot acknowledge a failed peer write`, async () => {
  for (const failure of ['failed-peer','malformed-peer','missing-peer']) {
    const f=funded(`direct-gear-${operation}-${failure}`);
    if(operation==='equip') for(const key of ['moon_kibble','nebula_snack'])
      assert.equal((await hooks.processPetShopPurchase(f.db,f.owner,key,{event_key:key})).accepted,true);
    const before=wallet(f), beforePet=f.sql.prepare('SELECT equipped_food FROM telegram_pet_instances WHERE telegram_id=?').get(f.owner);
    const nativeBatch=f.db.batch.bind(f.db);let injected=false;
    f.db.batch=async statements=>{
      if(!statements[0]?.query.includes(operation==='purchase' ? 'shop_purchase_pending' : 'equipment_switch_pending'))return nativeBatch(statements);
      injected=true;
      assert.equal(statements.length,operation==='purchase'?6:4,'exact mutation batch under test');
      const replies=statements.map(()=>({results:[{id:'unverified-receipt'}],meta:{changes:1}}));
      if(failure==='failed-peer')replies[1]={success:false,error:'equipment_peer_write_failed',meta:{changes:1}};
      if(failure==='malformed-peer')replies[1]={};
      if(failure==='missing-peer')replies.pop();
      return replies;
    };
    const request=()=>hooks.processPetShopPurchase(f.db,f.owner,'moon_kibble',{event_key:'direct-integrity'});
    await assert.rejects(request(),/pet_state_write_unavailable/,failure+' must not acknowledge unsaved equipment');
    assert.equal(injected,true);
    assert.deepEqual(wallet(f),before);
    assert.deepEqual(f.sql.prepare('SELECT equipped_food FROM telegram_pet_instances WHERE telegram_id=?').get(f.owner),beforePet);
    f.db.batch=nativeBatch;
    const saved=await request();assert.equal(saved.accepted,true);
    assert.equal(saved.reason,operation==='purchase'?'shop_purchase':'equipment_equipped');
    const after=wallet(f);assert.equal((await request()).duplicate,true);assert.deepEqual(wallet(f),after);
  }
});

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
  assert.equal(injected,true);assert.equal(r.accepted,false);assert.equal(r.reason,conflict==='active pet'?'displayed_pet_changed':'equipment_state_changed');
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

test('legacy account purchase receipts preserve gear ownership without assigning a pet',async()=>{
  const f=funded('nullable-gear-receipt');
  for(const item_key of ['moon_kibble','nebula_snack']) await f.act({action:'buy',item_key,request_id:item_key});
  // Migration 065 added nullable source pets without rewriting older receipts.
  // The account paid for this item before immutable pet sources were recorded.
  f.sql.prepare("UPDATE telegram_pet_events SET pet_id=NULL WHERE telegram_id=? AND event_type='buy' AND json_extract(metadata,'$.item_key')='moon_kibble'").run(f.owner);
  f.sql.prepare("DELETE FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key='moon_kibble'").run(f.owner);
  const receipts=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND event_type='buy' ORDER BY id").all(f.owner);
  const before=wallet(f);
  const result=await f.act({action:'buy',item_key:'moon_kibble',request_id:'legacy-free-switch'});
  assert.equal(result.reason,'equipment_equipped','an older paid item must be recovered before the Buy control can charge again');
  assert.equal(result.accepted,true);
  assert.deepEqual(wallet(f),before);
  assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_events WHERE telegram_id=? AND event_type='buy' ORDER BY id").all(f.owner),receipts,
    'legacy recovery preserves historical receipts and does not assign their XP or identity to the active pet');
  assert.equal(f.sql.prepare("SELECT item_level FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key='moon_kibble'").get(f.owner).item_level,1);
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
  await assert.rejects(f.act({action:'buy',item_key:'moon_kibble',request_id:'outage'}),/equipment_ownership_unavailable|pet_state_read_unavailable/);
  assert.equal(injected,true);assert.deepEqual(wallet(f),before);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='buy'").get().n,2);
});

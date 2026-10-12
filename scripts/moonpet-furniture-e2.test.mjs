import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fixture, hooks, currentSeason } from './moonpet-audit-regression-fixture.mjs';
import { PET_HOME_FURNITURE, PET_FURNITURE_SLOTS, readPetFurnitureState } from '../workers/moonboys-api/pets/home-furniture.js';
import { PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_SOURCE, PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_EVENT_KEY } from '../workers/moonboys-api/pets/wallet-reconciliation.js';
import { buildPetEconomyReachabilityAudit } from '../workers/moonboys-api/pets/economy-reachability-audit.js';

const migration=fs.readFileSync(new URL('../workers/moonboys-api/migrations/094_moonpet_home_furniture.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../workers/moonboys-api/worker.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../js/moonpet-mini-app.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../moonpet-game.html',import.meta.url),'utf8');

test('094 migration is additive and the twelve prices/positions are server-owned',()=>{
  const f=fixture('furniture-schema');
  f.sql.exec('PRAGMA foreign_keys=ON');
  f.sql.exec(migration);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(Object.keys(PET_HOME_FURNITURE).length,12);
  assert.deepEqual(PET_FURNITURE_SLOTS,['left','right','wall']);
  assert.deepEqual(Object.values(PET_HOME_FURNITURE).reduce((a,item)=>(a[item.slot]=(a[item.slot]||0)+1,a),{}),{left:4,right:4,wall:4});
  assert.ok(Object.values(PET_HOME_FURNITURE).every(item=>item.price_gold>=100&&item.price_gold<=900));
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS c FROM telegram_pet_house_layouts").get().c,0,'free E1 layout is untouched');
  assert.throws(()=>f.sql.prepare("INSERT INTO telegram_pet_furniture_unlocks(telegram_id,item_key,price_gold,purchase_event_key) VALUES (?,?,?,?)").run(f.owner,'unlisted',1,'bad'),/CHECK constraint/);
  f.sql.close();
});

test('purchase debits once, duplicate is idempotent, invalid prices and insufficient Gold cannot buy',async()=>{
  const f=fixture('furniture-buy');
  const gold=()=>f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  const initial=gold();
  const first=await f.act({action:'furniture_buy',item_key:'neon_lamp',price_gold:0});
  assert.equal(first.accepted,true);
  assert.equal(first.reason,'pet_furniture_purchased');
  assert.equal(gold(),initial-120,'the Worker price, not client price, is charged');
  const repeated=await f.act({action:'furniture_buy',item_key:'neon_lamp'});
  assert.equal(repeated.accepted,true);
  assert.equal(repeated.duplicate,true);
  assert.equal(gold(),initial-120);
  assert.equal((await f.act({action:'furniture_buy',item_key:'__proto__'})).accepted,false);
  assert.equal((await f.act({action:'furniture_buy',item_key:'gold_throne'})).accepted,false,'cannot afford 900 after spending 120');
  assert.equal(gold(),initial-120);
  const receipt=f.sql.prepare("SELECT price_gold,purchase_event_key FROM telegram_pet_furniture_unlocks WHERE telegram_id=? AND item_key='neon_lamp'").get(f.owner);
  assert.equal(receipt.price_gold,120);
  assert.ok(receipt.purchase_event_key);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_furniture_unlocks').get().c,1);
  f.sql.close();
});

test('pending wallet recovery freezes furniture Gold purchases',async()=>{
  const f=fixture('furniture-wallet-freeze');
  const original=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  f.sql.prepare("INSERT INTO telegram_pet_reward_claims(claim_id,pet_id,telegram_id,source,idempotency_key,day_key,status,requested_rewards,applied_rewards,metadata) " +
    "VALUES (?,NULL,?,?,?,'2026-10-12','pending','{}','{}','{}')")
    .run('furniture-recovery-marker',f.owner,PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_SOURCE,PET_ACCOUNT_WALLET_RECOVERY_REQUIRED_EVENT_KEY);
  const blocked=await f.act({action:'furniture_buy',item_key:'neon_lamp'});
  assert.equal(blocked.accepted,false);
  assert.equal(blocked.reason,'wallet_reconciliation_recovery_pending');
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold,original);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_furniture_unlocks').get().c,0);
  f.sql.close();
});

test('concurrent duplicate purchases produce one receipt and one debit',async()=>{
  const f=fixture('furniture-concurrent');
  const [first,second]=await Promise.all([
    f.act({action:'furniture_buy',item_key:'speaker_stack'}),
    f.act({action:'furniture_buy',item_key:'speaker_stack'}),
  ]);
  assert.equal(first.accepted,true);
  assert.equal(second.accepted,true);
  assert.equal([first,second].filter(r=>r.reason==='pet_furniture_purchased').length,1);
  assert.equal([first,second].filter(r=>r.duplicate===true).length,1);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold,760);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_furniture_unlocks').get().c,1);
  f.sql.close();
});

test('failed unlock insert rolls back the conditional Gold debit',async()=>{
  const f=fixture('furniture-rollback');
  const before=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  let armed=false;
  f.db.beforeBatch=async statements=>{
    if(!armed && statements.some(stmt=>stmt.query.includes('INSERT INTO telegram_pet_furniture_unlocks'))) {
      armed=true;
      f.sql.exec("CREATE TRIGGER reject_furniture_unlock BEFORE INSERT ON telegram_pet_furniture_unlocks BEGIN SELECT RAISE(ABORT,'unlock_failed'); END");
    }
  };
  await assert.rejects(f.act({action:'furniture_buy',item_key:'neon_lamp'}),/unlock_failed/);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold,before);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_furniture_unlocks').get().c,0);
  f.sql.close();
});

test('owned furniture places only in matching slots and survives pet switches without double charging',async()=>{
  const f=fixture('furniture-ownership');
  const petA='current-'+f.owner,petB='second-'+f.owner;
  f.pet(petB,currentSeason,0,2);
  assert.equal((await f.act({action:'furniture_buy',item_key:'neon_lamp'})).accepted,true);
  assert.equal((await f.act({action:'furniture_buy',item_key:'graffiti_frame'})).accepted,true);
  assert.equal((await f.act({action:'furniture_place',item_key:'neon_lamp',slot_key:'right'})).accepted,false);
  assert.equal((await f.act({action:'furniture_place',item_key:'speaker_stack',slot_key:'left'})).accepted,false,'not owned');
  assert.equal((await f.act({action:'furniture_place',item_key:'neon_lamp',slot_key:'left'})).accepted,true);
  assert.equal((await f.act({action:'furniture_place',item_key:'graffiti_frame',slot_key:'wall'})).accepted,true);
  const balance=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
  f.active(petB);
  const other=await hooks.buildPetMiniAppCoreState(f.db,f.owner);
  assert.equal(other.pet_furniture.pet_id,petB);
  assert.equal(other.pet_furniture.placements.left,null);
  assert.ok(other.pet_furniture.owned.includes('neon_lamp'));
  assert.equal((await f.act({action:'furniture_place',item_key:'neon_lamp',slot_key:'left'})).accepted,true);
  assert.equal((await f.act({action:'furniture_remove',slot_key:'left'})).accepted,true);
  assert.equal((await f.act({action:'furniture_remove',slot_key:'left'})).accepted,true,'empty slot is idempotent');
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold,balance);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_furniture_unlocks WHERE telegram_id=?').get(f.owner).c,2);
  f.active(petA);
  const original=await hooks.buildPetMiniAppCoreState(f.db,f.owner);
  assert.equal(original.pet_furniture.placements.left,'neon_lamp');
  assert.equal(original.pet_furniture.placements.wall,'graffiti_frame');
  f.sql.close();
});

test('egg stage permits furniture ownership and placement; missions/live never read furniture',async()=>{
  const f=fixture('furniture-egg');
  const pet='egg-'+f.owner;
  f.pet(pet,currentSeason,0,2);
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(pet);
  f.sql.prepare("UPDATE telegram_pet_instances SET stage='egg' WHERE pet_id=?").run(pet);
  f.active(pet);
  assert.equal((await f.act({action:'furniture_buy',item_key:'neon_lamp'})).accepted,true);
  assert.equal((await f.act({action:'furniture_place',item_key:'neon_lamp',slot_key:'left'})).accepted,true);
  const core=await hooks.buildPetMiniAppCoreState(f.db,f.owner);
  assert.equal(core.pet_furniture.placements.left,'neon_lamp');
  assert.equal(core.lifecycle.phase,'egg');
  let reads=0;
  f.db.beforeAll=statement=>{if(statement.query.includes('telegram_pet_furniture_unlocks')) reads++;};
  const missions=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{mode:'missions'});
  assert.equal(missions.pet_furniture,undefined);
  await hooks.buildPetMiniAppLiveState(f.db,f.owner);
  assert.equal(reads,0,'no extra furniture reads on high-frequency live path');
  const profile=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{mode:'profile'});
  assert.equal(profile.pet_furniture.placements.left,'neon_lamp');
  assert.equal(reads,1);
  f.sql.close();
});

test('wrong owner, stale selected pet and missing unlocks fail closed',async()=>{
  const f=fixture('furniture-security');
  const pet={pet_id:'current-'+f.owner,season_key:currentSeason};
  assert.equal((await readPetFurnitureState(f.db,'other-account',pet)).owned.length,0);
  assert.equal((await f.act({action:'furniture_place',item_key:'neon_lamp',slot_key:'left'})).accepted,false);
  assert.equal((await f.act({action:'furniture_buy',item_key:'neon_lamp',displayed_pet_id:'someone-else'})).accepted,false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_furniture_unlocks').get().c,0);
  f.sql.close();
});

test('furniture UI and main-canvas draw use existing pet render, no new timer or canvas',()=>{
  assert.match(worker,/readPetFurnitureState\(lifecycleScope\.db/);
  assert.match(worker,/readPetFurnitureState\(identityScope\.db/);
  assert.match(worker,/createDisplayedPetScope\(db, telegramId, pet\.pet_id, pet\.season_key\)/);
  assert.match(client,/function renderFurnitureShop\(/);
  assert.match(client,/function drawPurchasedFurniture\(/);
  assert.match(client,/function savedPurchasedFurniture\(/);
  assert.match(client,/furniture_buy/);
  assert.match(client,/furniture_place/);
  assert.match(client,/furniture_remove/);
  assert.match(entry,/moonpet-mini-app\.js\?v=20261012-canvas-layout-v1/);
  const art=client.split('// TEST-EXPORT: purchasedFurniture:start')[1].split('// TEST-EXPORT: purchasedFurniture:end')[0];
  assert.doesNotMatch(art,/fetch\(|requestAnimationFrame|setInterval|setTimeout|createElement/);
  const calls=[];
  const context=vm.createContext({BOT_RENDER_BASELINE_Y:219,drawPixelRect:(x,y,w,h,color)=>calls.push({x,y,w,h,color})});
  vm.runInContext(art,context);
  for(const [key,item] of Object.entries(PET_HOME_FURNITURE)) {
    calls.length=0;context.drawPurchasedFurniture(key,item.slot);
    assert.ok(calls.length>=2 && calls.length<=15,key);
    assert.ok(calls.every(c=>c.x>=0&&c.y>=0&&c.x+c.w<=320&&c.y+c.h<=220),key);
  }
});

test('economy audit includes every Gold furniture sink without introducing reward sources',()=>{
  const audit=buildPetEconomyReachabilityAudit();
  const offers=audit.surfaces.filter(entry=>entry.kind==='furniture_offer');
  assert.equal(offers.length,12);
  assert.deepEqual(new Set(offers.map(x=>x.key)),new Set(Object.keys(PET_HOME_FURNITURE)));
  assert.ok(offers.every(x=>x.cost.moon_gold===PET_HOME_FURNITURE[x.key].price_gold));
  const gold=audit.surfaces.find(x=>x.kind==='currency'&&x.key==='moon_gold');
  assert.ok(Object.keys(PET_HOME_FURNITURE).every(key=>gold.sinks.includes('furniture:'+key)));
  assert.equal(audit.invalid_material_references.length,0);
});

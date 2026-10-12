import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { fixture, hooks, currentSeason } from './moonpet-audit-regression-fixture.mjs';
const client=fs.readFileSync(new URL('../js/moonpet-mini-app.js',import.meta.url),'utf8');
const scene=client.split('// TEST-EXPORT: homeScene:start')[1].split('// TEST-EXPORT: homeScene:end')[0];

function painter() {
  const calls=[], stack=[];
  const ctx={globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();}};
  const runtime=vm.createContext({ctx,BOT_RENDER_BASELINE_Y:219,BOT_RENDER_CENTER_X:160,
    drawPixelRect:(x,y,w,h,color)=>calls.push({x,y,w,h,color,alpha:ctx.globalAlpha}),
    drawCompanionFloor:()=>calls.push({originalFloor:true})});
  vm.runInContext(scene,runtime);
  return {runtime,calls,ctx};
}

test('invalid, missing, unavailable and wrong-pet House state use safe appearance without writing',()=>{
  const {runtime}=painter();
  const fallback={wall:'warehouse_brick',floor:'concrete',furniture:'sleep_mat'};
  for(const house of [null,{}, {available:false}, {available:true,pet_id:'other',layout:{wall:'night_wall'}},
    {available:true,pet_id:'pet',layout:{wall:'constructor',floor:'hacked',furniture:null}}]) {
    const snapshot={adopted:true,pet:{pet_id:'pet'},pet_house:house};
    const original=structuredClone(snapshot);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.savedHomeLayout(snapshot))),fallback);
    assert.deepEqual(snapshot,original);
  }
  const good={adopted:true,pet:{pet_id:'pet'},pet_house:{available:true,pet_id:'pet',layout:{wall:'studio_white',floor:'steel',furniture:'plant_pot'}}};
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.savedHomeLayout(good))),good.pet_house.layout);
});

test('every starter option paints a distinct layer with bounded work and restored canvas alpha',()=>{
  const {runtime,calls,ctx}=painter();
  for(const [fn,options] of [['drawHomeWall',['warehouse_brick','night_wall','studio_white']],
    ['drawHomeFloor',['concrete','checkerboard','steel']],['drawHomeFurniture',['sleep_mat','record_deck','plant_pot']]]) {
    const outputs=[];
    for(const option of options) {
      calls.length=0; runtime[fn](option,true);
      assert.ok(calls.length>0 && calls.length<100);
      assert.equal(ctx.globalAlpha,1,'layer opacity must not affect pet sprites');
      assert.ok(calls.filter(c=>!c.originalFloor).every(c=>c.x>=0 && c.y>=0 && c.x+c.w<=320 && c.y+c.h<=220));
      if(fn==='drawHomeFurniture') assert.ok(calls.every(c=>c.x>252),'furniture stays outside original companion bounds');
      outputs.push(JSON.stringify(calls));
    }
    assert.equal(new Set(outputs).size,3,fn+' distinguishes all existing choices');
  }
  assert.doesNotMatch(scene,/fetch\(|post\(|requestAnimationFrame|setTimeout|setInterval|createElement/,'static layers do not add requests, loops or a second canvas');
});

test('core/full responses restore each pet Home and live polling makes no House reads',async()=>{
  const f=fixture('home-projection');
  try {
    const first='current-'+f.owner, second='egg-'+f.owner;
    f.pet(second,currentSeason,0,2);
    f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(second);
    await f.state();
    assert.equal((await f.act({action:'house_place',slot_key:'wall',item_key:'night_wall'})).accepted,true);
    const balances=()=>f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
    const original=balances();
    let reads=0;
    f.db.beforeAll=statement=>{if(statement.query.includes('FROM telegram_pet_house_layouts')) reads++;};
    for(const mode of ['core','full','profile']) {
      const state=mode==='core'?await hooks.buildPetMiniAppCoreState(f.db,f.owner):await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{mode});
      assert.equal(state.pet_house.pet_id,first);
      assert.equal(state.pet_house.layout.wall,'night_wall');
    }
    assert.equal(reads,3,'one bounded layout query per existing projection');
    const missions=await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{mode:'missions'});
    assert.equal(missions.pet_house,undefined,'Missions retains its existing query budget');
    assert.equal(reads,3);
    await hooks.buildPetMiniAppLiveState(f.db,f.owner);
    assert.equal(reads,3,'high-frequency live reads do not query layouts');
    assert.deepEqual(balances(),original);
    f.active(second);
    const egg=await hooks.buildPetMiniAppCoreState(f.db,f.owner);
    assert.equal(egg.pet_house.pet_id,second);
    assert.equal(egg.pet_house.layout.wall,'warehouse_brick');
    assert.equal(egg.lifecycle.phase,'egg');
    assert.equal(f.sql.prepare('SELECT item_key FROM telegram_pet_house_layouts WHERE pet_id=?').get(first).item_key,'night_wall');
    f.db.beforeAll=statement=>{if(statement.query.includes('FROM telegram_pet_house_layouts')) throw Error('layout_unavailable');};
    const unavailable=await hooks.buildPetMiniAppCoreState(f.db,f.owner);
    assert.equal(unavailable.adopted,true);
    assert.equal(unavailable.pet_house.available,false,'cosmetic outage cannot block care or invent an editable save');
  } finally {f.sql.close();}
});

test('Missions preserves only the same pet Home and never hides an explicit failed read',()=>{
  const source=client.slice(client.indexOf('  function setStateSnapshot('),client.indexOf('  // TEST-EXPORT: cooldownRefresh:start'));
  const home={available:true,pet_id:'one',layout:{wall:'night_wall'}};
  const runtime=vm.createContext({state:{pet:{pet_id:'one'},pet_house:home},authenticationFailure:false,
    stateRequestGate:{isCurrent:n=>n===1},readSleepLatch:()=>false,hatchArtTransitionActive:()=>false,
    selectBotArtForState:()=>Promise.resolve(),performance:{now:()=>1},scheduleCooldownRefresh(){},
    stateNeedsScreenHydration:()=>false,activeScreen:'missions'});
  vm.runInContext(source,runtime);
  const patch={pet:{pet_id:'one'},hydration:{mode:'missions'}};
  assert.equal(runtime.setStateSnapshot(patch,1),true);
  assert.equal(runtime.state.pet_house,home);
  assert.equal(patch.pet_house,undefined,'retention must not mutate the response');
  runtime.setStateSnapshot({pet:{pet_id:'one'},pet_house:{available:false},hydration:{mode:'full'}},1);
  assert.equal(runtime.state.pet_house.available,false);
  runtime.state={pet:{pet_id:'one'},pet_house:home};
  runtime.setStateSnapshot({pet:{pet_id:'two'},hydration:{mode:'missions'}},1);
  assert.equal(runtime.state.pet_house,undefined,'pet switch cannot transfer the old Home');
});

test('Home layers precede the pet/effects and the original hatch reveal excludes them',()=>{
  const source=client.split('// TEST-EXPORT: drawWorld:start')[1].split('// TEST-EXPORT: drawWorld:end')[0];
  const calls=[];
  const runtime=vm.createContext({state:{adopted:true,pet:{pet_id:'one'},lifecycle:{phase:'young'}},reducedMotion:true,performance:{now:()=>7},
    BOT_RENDER_BASELINE_Y:219,STAGE_ZERO_BACKGROUND_URL:'egg',backgroundArtState:{},botArtRendererReady:true,
    HOME_ROOMS:['main','kitchen','garden','gym'],activeHomeRoom:'main',
    stageZeroPresentationActive:()=>true,hatching:false,ctx:{save(){},restore(){}},
    drawStageZeroBackground:()=>calls.push('egg'),savedHomeLayout:()=>({wall:'night_wall',floor:'steel',furniture:'plant_pot'}),
    drawHomeWall:()=>calls.push('wall'),drawHomeFloor:()=>calls.push('floor+shadow'),drawHomeFurniture:()=>calls.push('furniture'),
    drawDedicatedHomeRoom:room=>calls.push('room:'+room),
    drawEquippedStyles:(_,front)=>calls.push(front?'effects-front':'effects-back'),drawPet:()=>calls.push('pet')});
  vm.runInContext('function hatchArtTransitionActive(){return hatching;}'+source,runtime);
  runtime.drawWorld(0);
  assert.deepEqual(calls,['egg','wall','floor+shadow','furniture','effects-back','pet','effects-front']);
  runtime.activeHomeRoom='kitchen';calls.length=0;runtime.drawWorld(0);
  assert.deepEqual(calls,['egg','room:kitchen','effects-back','pet','effects-front']);
  assert.equal(runtime.backgroundArtState.home.active_room,'kitchen');
  assert.deepEqual(Array.from(runtime.backgroundArtState.home.rooms),['main','kitchen','garden','gym']);
  runtime.activeHomeRoom='main';
  runtime.hatching=true;calls.length=0;runtime.drawWorld(0);
  assert.deepEqual(calls,['egg','effects-back','pet','effects-front']);
  assert.equal(runtime.backgroundArtState.home,null);
});

const roomsSource=client.split('// TEST-EXPORT: homeRoomsCanvas:start')[1].split('// TEST-EXPORT: homeRoomsCanvas:end')[0];
test('E4 Kitchen, Garden and Gym render as distinct full-canvas rooms without text',()=>{
  const paint=[];
  const runtime=vm.createContext({state:{pet_garden:{status:'ready'}},
    drawPixelRect:(x,y,w,h,color)=>paint.push({x,y,w,h,color})});
  vm.runInContext(roomsSource,runtime);
  const signatures={};
  for(const room of ['kitchen','garden','gym']) {
    paint.length=0;
    runtime.drawDedicatedHomeRoom(room);
    assert.ok(paint.length>=15,room+' has a real room scene rather than a tiny station prop');
    assert.ok(paint.every(rect=>rect.x>=0&&rect.y>=0&&rect.w>0&&rect.h>0&&rect.x+rect.w<=320&&rect.y+rect.h<=220),room+' stays inside the 320x220 world');
    assert.ok(paint.some(rect=>rect.w===320),room+' paints a full-width room surface');
    signatures[room]=JSON.stringify(paint);
  }
  assert.notEqual(signatures.kitchen,signatures.garden);
  assert.notEqual(signatures.kitchen,signatures.gym);
  assert.notEqual(signatures.garden,signatures.gym);
  assert.doesNotMatch(roomsSource,/fillText|strokeText/,'room art must not bake labels into the canvas');
  assert.doesNotMatch(client,/HOME_STATION_HOTSPOTS|homeStationAt\(/,'retired station hitboxes must not remain');
});

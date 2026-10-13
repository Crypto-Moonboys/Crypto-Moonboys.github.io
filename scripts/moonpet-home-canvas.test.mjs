import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { fixture, hooks, currentSeason } from './moonpet-audit-regression-fixture.mjs';
const client=fs.readFileSync(new URL('../js/moonpet-mini-app.js',import.meta.url),'utf8');
const scene=client.split('// TEST-EXPORT: homeScene:start')[1].split('// TEST-EXPORT: homeScene:end')[0];

function painter() {
  const calls=[], stack=[];
  const ctx={globalAlpha:1,drawImage:(image,...args)=>calls.push({source:image.src,args}),save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();}};
  const runtime=vm.createContext({ctx,Image:function(){this.complete=true;this.naturalWidth=1280;this.naturalHeight=1280;},reducedMotion:false,backgroundArtState:{},BOT_RENDER_BASELINE_Y:219,BOT_RENDER_CENTER_X:160,
    drawPixelRect:(x,y,w,h,color)=>calls.push({x,y,w,h,color,alpha:ctx.globalAlpha}),
    drawCompanionFloor:()=>calls.push({originalFloor:true})});
  vm.runInContext(scene,runtime);
  return {runtime,calls,ctx};
}

test('invalid, missing, unavailable and wrong-pet House state use safe appearance without writing',()=>{
  const {runtime}=painter();
  const fallback={room:'main',wall:'warehouse_brick',floor:'concrete',furniture:'sleep_mat'};
  for(const house of [null,{}, {available:false}, {available:true,pet_id:'other',layout:{wall:'night_wall'}},
    {available:true,pet_id:'pet',layout:{wall:'constructor',floor:'hacked',furniture:null}}]) {
    const snapshot={adopted:true,pet:{pet_id:'pet'},pet_house:house};
    const original=structuredClone(snapshot);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.savedHomeLayout(snapshot))),fallback);
    assert.deepEqual(snapshot,original);
  }
  const good={adopted:true,pet:{pet_id:'pet'},pet_house:{available:true,pet_id:'pet',layout:{room:'main',wall:'studio_white',floor:'steel',furniture:'plant_pot'}}};
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.savedHomeLayout(good))),good.pet_house.layout);
});

test('all Home wall choices leave the graffiti background completely untouched',()=>{
  const {runtime,calls,ctx}=painter();
  for(const wall of ['warehouse_brick','night_wall','studio_white']) {
    calls.length=0; runtime.drawHomeWall(wall);
    assert.equal(calls.length,0,wall+' must paint no border, seam, tint or overlay');
    assert.equal(ctx.globalAlpha,1,'wall selection cannot change canvas alpha');
  }
  assert.doesNotMatch(scene,/globalAlpha\s*=\s*(?:0\.22|0\.42|0\.68)/,'retired wall alpha values stay removed');
  assert.doesNotMatch(scene,/drawPixelRect\([^\n]*wall|for \(var seam/,'wall renderer must not draw decorative geometry over graffiti');
});

test('transparent full-canvas mat choices and furniture remain distinct',()=>{
  const {runtime,calls,ctx}=painter();
  for(const [fn,options] of [['drawHomeFloor',['concrete','checkerboard','steel']],['drawHomeFurniture',['sleep_mat','record_deck','plant_pot']]]) {
    const outputs=[];
    for(const option of options) {
      calls.length=0; runtime[fn](option,true);
      assert.ok(calls.length>0 && calls.length<100);
      assert.equal(ctx.globalAlpha,1,'layer opacity must not affect pet sprites');
      assert.ok(calls.filter(c=>!c.originalFloor&&!c.source).every(c=>c.x>=0 && c.y>=0 && c.x+c.w<=320 && c.y+c.h<=220));
      if(fn==='drawHomeFurniture') assert.ok(calls.filter(c=>!c.source).every(c=>c.x>252),'pixel furniture stays outside original companion bounds');
      if(fn==='drawHomeFurniture'&&option==='plant_pot') {
        assert.equal(calls[0].source,'/img/pot-pot.png');
        assert.deepEqual(calls[0].args,[66,92,125,145,222,172-74*145/125,74,74*145/125],'plant frame retains the right-side visible footprint');
      }
      outputs.push(JSON.stringify(calls));
    }
    assert.equal(new Set(outputs).size,3,'saved mats and furniture distinguish all existing choices');
  }
  calls.length=0;runtime.drawHomeFloor('concrete',true,false);
  assert.equal(calls[0].source,'/img/blacknsilvermatt.png');
  assert.deepEqual(calls[0].args,[0,0,320,220]);
  assert.doesNotMatch(scene,/fetch\(|post\(|requestAnimationFrame|setTimeout|setInterval|createElement/,'static layers do not add requests, loops or a second canvas');
});

test('plant sheet advances, wraps and freezes for reduced motion without shifting its placement',()=>{
  const {runtime,calls}=painter();
  runtime.drawHomeFurniture('plant_pot',0);const first=calls.at(-1).args;
  runtime.drawHomeFurniture('plant_pot',125);const next=calls.at(-1).args;
  assert.deepEqual(next.slice(0,4),[322,92,125,145]);
  assert.deepEqual(next.slice(4),first.slice(4));
  runtime.drawHomeFurniture('plant_pot',3125);assert.deepEqual(calls.at(-1).args,first);
  runtime.reducedMotion=true;runtime.drawHomeFurniture('plant_pot',1375);
  assert.deepEqual(calls.at(-1).args,first);
  assert.doesNotMatch(scene,/Neon_PurplePlant|setInterval|requestAnimationFrame/,'old static art and extra animation loops are absent');
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
    drawStageZeroBackground:()=>calls.push('egg'),savedHomeLayout:()=>({room:runtime.selectedRoom||'main',wall:'night_wall',floor:'steel',furniture:'plant_pot'}),
    drawHomeWall:()=>calls.push('wall'),drawHomeFloor:()=>calls.push('floor+shadow'),drawHomeFurniture:()=>calls.push('furniture'),
    drawDedicatedHomeRoom:room=>calls.push('room:'+room),
    drawEquippedStyles:(_,front)=>calls.push(front?'effects-front':'effects-back'),drawPet:()=>calls.push('pet')});
  vm.runInContext('function hatchArtTransitionActive(){return hatching;}'+source,runtime);
  runtime.drawWorld(0);
  assert.deepEqual(calls,['egg','wall','floor+shadow','furniture','effects-back','pet','effects-front']);
  runtime.selectedRoom='kitchen';calls.length=0;runtime.drawWorld(0);
  assert.deepEqual(calls,['egg','room:kitchen','effects-back','pet','effects-front']);
  assert.equal(runtime.backgroundArtState.home.active_room,'kitchen');
  assert.deepEqual(Array.from(runtime.backgroundArtState.home.rooms),['main','kitchen','garden','gym']);
  runtime.state.pet_house={available:true,pet_id:'one',floor_saved:true};
  for(const room of ['kitchen','garden','gym']) {
    runtime.selectedRoom=room;calls.length=0;runtime.drawWorld(0);
    assert.deepEqual(calls,['egg','room:'+room,'floor+shadow','effects-back','pet','effects-front'],
      'saved mat draws above each room background and below the pet');
  }
  runtime.state.pet_house.pet_id='other';calls.length=0;runtime.drawWorld(0);
  assert.equal(calls.includes('floor+shadow'),false,'other pet floor cannot decorate this room');
  runtime.selectedRoom='main';
  runtime.hatching=true;calls.length=0;runtime.drawWorld(0);
  assert.deepEqual(calls,['egg','effects-back','pet','effects-front']);
  assert.equal(runtime.backgroundArtState.home,null);
});

const roomsSource=client.split('// TEST-EXPORT: homeRoomsCanvas:start')[1].split('// TEST-EXPORT: homeRoomsCanvas:end')[0];
test('saved rooms load the requested JPEG art with cover cropping and reuse images',()=>{
  const paint=[], images=[];
  function Image() { this.complete=false; this.naturalWidth=640; this.naturalHeight=480; images.push(this); }
  const runtime=vm.createContext({Image,reducedMotion:false,backgroundArtState:{},
    ctx:{save(){},restore(){},drawImage:(...args)=>paint.push(args)}});
  vm.runInContext(roomsSource,runtime);
  const sources={kitchen:'/img/Neon_Moon_Pets_Cyberpunk_Kitchen.jpg',garden:'/img/Neon_MoonPets_Lab.jpg',gym:'/img/Neon_Graffiti_Moonpets_Gym.jpg'};
  for(const [room,source] of Object.entries(sources)) {
    assert.equal(runtime.drawDedicatedHomeRoom(room),false,'loading retains the existing fallback');
    const image=images.at(-1); assert.equal(image.src,source); image.complete=true;
    assert.equal(runtime.drawDedicatedHomeRoom(room),true);
    assert.deepEqual(paint.at(-1).slice(1),[0,20,640,440,0,0,320,220]);
    assert.equal(runtime.backgroundArtState.source,source);
    assert.equal(runtime.drawDedicatedHomeRoom(room),true);
  }
  assert.equal(images.length,3,'one cached image per room');
  images[0].naturalWidth=0;
  assert.equal(runtime.drawDedicatedHomeRoom('kitchen'),false,'failed art retains fallback');
  assert.equal(runtime.drawDedicatedHomeRoom('main'),false,'Main Room is untouched');
  assert.doesNotMatch(roomsSource,/fillText|strokeText|drawPixelRect/,'retired procedural scenes and labels are removed');
});

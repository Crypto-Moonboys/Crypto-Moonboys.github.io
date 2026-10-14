import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture,currentSeason} from './moonpet-audit-regression-fixture.mjs';
import {saveRoomFurniture,readRoomFurniture,validArrangement} from '../workers/moonboys-api/pets/room-furniture.js';
const free=[{key:'sleep_mat',x:6,y:35},{key:'record_deck',x:282,y:27},{key:'plant_pot',x:222,y:86}];
const paid=['neon_lamp','speaker_stack','arcade_cabinet','tool_chest','street_sofa','retro_tv','crystal_altar','gold_throne'];
function setup(name){const f=fixture(name);for(const key of paid)f.sql.prepare('INSERT INTO telegram_pet_furniture_unlocks(telegram_id,item_key,price_gold,purchase_event_key) VALUES (?,?,120,?)').run(f.owner,key,key);return f;}
test('eight combined items save per pet and room without spending or altering legacy saves',async()=>{
 const f=setup('room-eight'),pet={pet_id:'current-'+f.owner,season_key:currentSeason};
 try {
 const balance=f.sql.prepare('SELECT moon_gold,pet_xp,moon_crystals FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
 const items=free.concat(paid.slice(0,5).map(key=>({key,x:10,y:150})));
 assert.equal((await f.act({action:'furniture_arrange',room_key:'main',items})).accepted,true);
 assert.deepEqual(await readRoomFurniture(f.db,f.owner,pet,paid),{main:items});
 assert.equal((await f.act({action:'furniture_arrange',room_key:'gym',items:paid.map(key=>({key,x:10,y:150}))})).accepted,true);
 const saved=await readRoomFurniture(f.db,f.owner,pet,paid);assert.equal(saved.main.length,8);assert.equal(saved.gym.length,8);
 assert.deepEqual(f.sql.prepare('SELECT moon_gold,pet_xp,moon_crystals FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner),balance);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_house_layouts').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_furniture_placements').get().n,0);
 const other='second-'+f.owner;f.pet(other,currentSeason,0,2);f.active(other);
 assert.deepEqual(await readRoomFurniture(f.db,f.owner,{pet_id:other,season_key:currentSeason},paid),{});
 }finally{f.sql.close();}
});
test('free items outside Main, ninth items, unowned keys and invalid coordinates reject',async()=>{
 const f=setup('room-reject');try{
 for(const [room,items] of [['garden',free],['main',free.concat(paid.slice(0,6).map(key=>({key,x:10,y:150})))],['main',[{key:'neon_sign',x:10,y:30}]],['main',[{key:'__proto__',x:10,y:30}]],['main',[{key:'sleep_mat',x:300,y:30}]],['main',[{key:'sleep_mat',x:6,y:0}]],['main',[free[0],free[0]]]])
 assert.equal((await f.act({action:'furniture_arrange',room_key:room,items})).accepted,false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_room_furniture').get().n,0);
 assert.equal(validArrangement('gym',[{key:'neon_lamp',x:10,y:150}]),true);
 }finally{f.sql.close();}
});
test('concurrent edits retain the limit; a save can explicitly clear a room',async()=>{
 const f=setup('room-concurrent'),pet={pet_id:'current-'+f.owner,season_key:currentSeason};try{
 const results=await Promise.all([saveRoomFurniture(f.db,f.owner,pet,'main',free),saveRoomFurniture(f.db,f.owner,pet,'main',paid.map(key=>({key,x:10,y:150})))]);
 assert.ok(results.every(r=>r.accepted));assert.equal((await readRoomFurniture(f.db,f.owner,pet,paid)).main.length,8);
 assert.equal((await saveRoomFurniture(f.db,f.owner,pet,'main',[])).accepted,true);
 assert.deepEqual((await readRoomFurniture(f.db,f.owner,pet,paid)).main,[]);
 }finally{f.sql.close();}
});
test('wrong owner, stale active pet and failed D1 writes cannot save arrangements',async()=>{
 const f=setup('room-authority'),pet={pet_id:'current-'+f.owner,season_key:currentSeason};try{
 assert.equal((await saveRoomFurniture(f.db,'other-owner',pet,'main',free)).accepted,false);
 const other='other-'+f.owner;f.pet(other,currentSeason,0,2);f.active(other);
 assert.equal((await saveRoomFurniture(f.db,f.owner,pet,'main',free)).accepted,false);
 f.active(pet.pet_id);f.db.beforeRun=stmt=>{if(stmt.query.includes('INSERT INTO telegram_pet_room_furniture'))throw Error('fixture write failure');};
 await assert.rejects(()=>saveRoomFurniture(f.db,f.owner,pet,'main',free),/fixture write failure/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_room_furniture').get().n,0);
 }finally{f.sql.close();}
});
test('saved Main arrangement rejects legacy furniture writes without changing either save',async()=>{
 const f=setup('room-legacy-write'),pet={pet_id:'current-'+f.owner,season_key:currentSeason};
 try{
 assert.equal((await f.act({action:'house_place',slot_key:'furniture',item_key:'sleep_mat'})).accepted,true);
 assert.equal((await f.act({action:'furniture_place',item_key:'neon_lamp',slot_key:'left'})).accepted,true);
 const items=[{key:'sleep_mat',x:6,y:35},{key:'neon_lamp',x:10,y:150}];
 assert.equal((await saveRoomFurniture(f.db,f.owner,pet,'main',items)).accepted,true);
 const freeWrite=await f.act({action:'house_place',slot_key:'furniture',item_key:'record_deck'});
 const paidWrite=await f.act({action:'furniture_place',item_key:'speaker_stack',slot_key:'left'});
 const paidRemove=await f.act({action:'furniture_remove',slot_key:'left'});
 for(const result of [freeWrite,paidWrite,paidRemove]){
  assert.equal(result.accepted,false);
  assert.equal(result.reason,'pet_room_furniture_authoritative');
 }
 assert.deepEqual(await readRoomFurniture(f.db,f.owner,pet,paid),{main:items});
 assert.equal(f.sql.prepare("SELECT item_key FROM telegram_pet_house_layouts WHERE pet_id=? AND slot_key='furniture'").get(pet.pet_id).item_key,'sleep_mat');
 assert.equal(f.sql.prepare("SELECT item_key FROM telegram_pet_furniture_placements WHERE pet_id=? AND slot_key='left'").get(pet.pet_id).item_key,'neon_lamp');
 assert.equal((await f.act({action:'house_place',slot_key:'floor',item_key:'steel'})).accepted,true);
 }finally{f.sql.close();}
});
test('lava lamp uses exactly twenty stable frames and reduced motion',()=>{
 const client=fs.readFileSync('js/moonpet-mini-app.js','utf8'),source=client.split('// TEST-EXPORT: homeScene:start')[1].split('// TEST-EXPORT: homeScene:end')[0];
 const calls=[],runtime=vm.createContext({ctx:{save(){},restore(){},drawImage(image,...args){calls.push({src:image.src,args});}},Image:function(){this.complete=true;this.naturalWidth=1280;this.naturalHeight=1024;},backgroundArtState:{},BOT_RENDER_BASELINE_Y:219,reducedMotion:false});
 vm.runInContext(source,runtime);runtime.drawHomeFurniture('record_deck',0);const first=calls.at(-1);
 assert.equal(first.src,'/img/lamp-larvalampy.png');assert.deepEqual(first.args,[93,14,70,226,282,27,35,113]);
 runtime.drawHomeFurniture('record_deck',2375);assert.deepEqual(calls.at(-1).args.slice(0,4),[1117,782,70,226]);
 runtime.drawHomeFurniture('record_deck',2500);assert.deepEqual(calls.at(-1),first);
 runtime.reducedMotion=true;runtime.drawHomeFurniture('record_deck',125);assert.deepEqual(calls.at(-1),first);
});
test('migration is idempotent, enforces eight-item storage and retains legacy records',()=>{
 const f=setup('room-schema');try{
 const ddl=fs.readFileSync('workers/moonboys-api/migrations/097_moonpet_room_furniture.sql','utf8');
 const before=f.sql.prepare('SELECT * FROM telegram_pet_furniture_unlocks WHERE telegram_id=?').all(f.owner);
 f.sql.exec(ddl);f.sql.exec(ddl);
 assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_furniture_unlocks WHERE telegram_id=?').all(f.owner),before);
 assert.throws(()=>f.sql.prepare('INSERT INTO telegram_pet_room_furniture(pet_id,telegram_id,season_key,room_key,items_json) VALUES (?,?,?,?,?)').run('current-'+f.owner,f.owner,currentSeason,'main',JSON.stringify(Array(9).fill(free[0]))),/CHECK constraint/);
 }finally{f.sql.close();}
});
test('resolved failed D1 write/read results cannot claim a saved room',async()=>{
 const f=setup('room-d1'),pet={pet_id:'current-'+f.owner,season_key:currentSeason};try{
 const batch=f.db.batch;f.db.batch=async()=>[{success:false,meta:{changes:1}},{success:true,results:[{items_json:JSON.stringify(free)}]}];
 await assert.rejects(()=>saveRoomFurniture(f.db,f.owner,pet,'main',free));
 f.db.batch=async()=>[{success:true,meta:{changes:1}},{success:false,results:[]}];
 await assert.rejects(()=>saveRoomFurniture(f.db,f.owner,pet,'main',free));
 f.db.batch=batch;
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_room_furniture').get().n,0);
 }finally{f.sql.close();}
});

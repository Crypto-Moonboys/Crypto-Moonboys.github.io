import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { PET_HOUSE_CHOICES, PET_HOUSE_DEFAULTS, readPetHouseLayout, setPetHouseLayout, validPetHouseChoice } from '../workers/moonboys-api/pets/house-layout.js';
import { createDisplayedPetScope } from '../workers/moonboys-api/pets/displayed-pet-scope.js';

const migration=fs.readFileSync(new URL('../workers/moonboys-api/migrations/092_moonpet_house_layouts.sql', import.meta.url),'utf8');
const roomFurnitureMigration=fs.readFileSync(new URL('../workers/moonboys-api/migrations/097_moonpet_room_furniture.sql', import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../moonpet-game.html', import.meta.url),'utf8');

function fixture() {
  const sql=new DatabaseSync(':memory:');
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(`CREATE TABLE telegram_pet_instances (
    pet_id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,season_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',slot_number INTEGER NOT NULL DEFAULT 1
  ); CREATE TABLE telegram_pet_season_slots (
    pet_id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,season_key TEXT NOT NULL,
    slot_number INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active',
    UNIQUE(pet_id,telegram_id,season_key)
  ); CREATE TABLE telegram_pet_active_slots (
    telegram_id TEXT PRIMARY KEY,pet_id TEXT NOT NULL,season_key TEXT NOT NULL
  ); CREATE TABLE telegram_pet_profiles (
    telegram_id TEXT PRIMARY KEY,moon_gold INTEGER NOT NULL,pet_xp INTEGER NOT NULL
  );`);
  sql.prepare('INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,status) VALUES (?,?,?,?)')
    .run('pet-1','owner-a','old-quarter','active');
  sql.prepare('INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,status) VALUES (?,?,?,?)')
    .run('pet-2','owner-a','new-quarter','active');
  sql.prepare('INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,status) VALUES (?,?,?,?)')
    .run('pet-other','owner-b','old-quarter','active');
  sql.prepare('INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key) VALUES (?,?,?)').run('pet-1','owner-a','old-quarter');
  sql.prepare('INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key) VALUES (?,?,?)').run('pet-2','owner-a','new-quarter');
  sql.prepare('INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key) VALUES (?,?,?)').run('pet-other','owner-b','old-quarter');
  sql.prepare('INSERT INTO telegram_pet_active_slots VALUES (?,?,?)').run('owner-a','pet-1','old-quarter');
  sql.prepare('INSERT INTO telegram_pet_active_slots VALUES (?,?,?)').run('owner-b','pet-other','old-quarter');
  sql.prepare('INSERT INTO telegram_pet_profiles VALUES (?,?,?)').run('owner-a',750,2300);
  sql.exec(migration);
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/096_moonpet_home_rooms.sql', import.meta.url),'utf8'));
  sql.exec(roomFurnitureMigration);
  const d1={
    prepare(statement) {
      let values=[];
      return {
        bind(...args) { values=args; return this; },
        async all() {return {results:sql.prepare(statement).all(...values)};},
        async run() {const result=sql.prepare(statement).run(...values);return {meta:{changes:Number(result.changes)}};},
        exec() {
          if(sql.prepare(statement).columns().length) return {results:sql.prepare(statement).all(...values)};
          const result=sql.prepare(statement).run(...values);
          return {meta:{changes:Number(result.changes)}};
        },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const results=statements.map(statement=>statement.exec());
        sql.exec('COMMIT');
        return results;
      } catch(error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {sql,d1,pet1:{pet_id:'pet-1',season_key:'old-quarter'},
    pet2:{pet_id:'pet-2',season_key:'new-quarter'},close:()=>sql.close()};
}

test('092 schema and house options admit only valid bounded placements',()=>{
  const f=fixture();
  f.sql.exec(migration);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.match(schema,/FOREIGN KEY \(pet_id,telegram_id,season_key\) REFERENCES telegram_pet_season_slots\(pet_id,telegram_id,season_key\) ON DELETE CASCADE/);
  assert.deepEqual(Object.keys(PET_HOUSE_CHOICES),['room','wall','floor','furniture']);
  for(const [slot,options] of Object.entries(PET_HOUSE_CHOICES)){
    assert.equal(options.length,3);
    for(const item of options) assert.equal(validPetHouseChoice(slot,item.key),true);
  }
  assert.equal(validPetHouseChoice('__proto__','warehouse_brick'),false);
  assert.equal(validPetHouseChoice('wall','unverified_item'),false);
  assert.throws(()=>f.sql.prepare("INSERT INTO telegram_pet_house_layouts(pet_id,telegram_id,season_key,slot_key,item_key) VALUES ('pet-1','owner-a','old-quarter','wall','hacked')").run(),/CHECK constraint/);
  assert.throws(()=>f.sql.prepare("INSERT INTO telegram_pet_house_layouts(pet_id,telegram_id,season_key,slot_key,item_key) VALUES ('missing','owner-a','old-quarter','wall','night_wall')").run(),/FOREIGN KEY constraint/);
  for(const [owner,season] of [['owner-b','old-quarter'],['owner-a','new-quarter']]){
    assert.throws(()=>f.sql.prepare("INSERT INTO telegram_pet_house_layouts(pet_id,telegram_id,season_key,slot_key,item_key) VALUES ('pet-1',? ,?,'wall','night_wall')").run(owner,season),/FOREIGN KEY constraint/);
  }
  f.sql.prepare("INSERT INTO telegram_pet_house_layouts(pet_id,telegram_id,season_key,slot_key,item_key) VALUES ('pet-1','owner-a','old-quarter','wall','night_wall')").run();
  f.sql.prepare("DELETE FROM telegram_pet_season_slots WHERE pet_id='pet-1'").run();
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS c FROM telegram_pet_house_layouts WHERE pet_id='pet-1'").get().c,0,'deleting the owning season slot cascades to room placements');
  f.close();
});

test('house design persists per pet, across cycles, without awarding/spending rewards',async()=>{
  const f=fixture();
  const initial=await readPetHouseLayout(f.d1,'owner-a',f.pet1);
  assert.equal(initial.available,true);
  assert.equal(initial.floor_saved,false,'unsaved floor uses the free Main Room mat');
  assert.deepEqual(initial.layout,PET_HOUSE_DEFAULTS);
  assert.equal(initial.pet_id,'pet-1');
  for(const [slot,item] of [['wall','night_wall'],['floor','checkerboard'],['furniture','record_deck']]){
    const save=await setPetHouseLayout(f.d1,'owner-a',f.pet1,slot,item);
    assert.equal(save.accepted,true,slot);
    assert.equal(save.pet_house.layout[slot],item);
    if(slot==='floor') assert.equal(save.pet_house.floor_saved,true,'saved floor overrides the built-in mat');
    assert.deepEqual(save.pet_house.reward,{});
  }
  const repeat=await setPetHouseLayout(f.d1,'owner-a',f.pet1,'wall','night_wall');
  assert.equal(repeat.accepted,true,'same placement can be retried without spending');
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS c FROM telegram_pet_house_layouts WHERE pet_id='pet-1'").get().c,3);
  assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet2)).layout.wall,PET_HOUSE_DEFAULTS.wall);
  assert.equal((await readPetHouseLayout(f.d1,'owner-b',f.pet1)).layout.wall,PET_HOUSE_DEFAULTS.wall,'another owner cannot read other pet room');
  assert.deepEqual({ ...f.sql.prepare('SELECT moon_gold,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get('owner-a') },{moon_gold:750,pet_xp:2300});
  f.close();
});

test('invalid, inactive, switched and cross-account writes fail closed',async()=>{
  const f=fixture();
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet1,'wall','invalid')).reason,'pet_house_choice_invalid');
  assert.equal((await setPetHouseLayout(f.d1,'owner-b',f.pet1,'wall','night_wall')).reason,'displayed_pet_changed');
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet2,'wall','night_wall')).reason,'displayed_pet_changed');
  f.sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?')
    .run('pet-2','new-quarter','owner-a');
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet1,'wall','night_wall')).reason,'displayed_pet_changed');
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet2,'wall','studio_white')).accepted,true);
  assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet1)).layout.wall,PET_HOUSE_DEFAULTS.wall);
  f.sql.prepare("UPDATE telegram_pet_instances SET status='deleted' WHERE pet_id='pet-2'").run();
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet2,'floor','steel')).accepted,false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_house_layouts').get().c,1);
  f.close();
});

test('resolved failed D1 reads and writes do not create fake success',async()=>{
  const f=fixture();
  const readFailure={prepare(){return{bind(){return this;},async all(){return {success:false,error:'offline'};}};}};
  await assert.rejects(readPetHouseLayout(readFailure,'owner-a',f.pet1),/pet_state_read_unavailable/);
  const writeFailure={prepare(){return{bind(){return this;}};},async batch(){return [{success:false,error:'offline'},{results:[]}];}};
  await assert.rejects(setPetHouseLayout(writeFailure,'owner-a',f.pet1,'wall','night_wall'),/pet_state_write_unavailable/);
  const savedReadFailure={...writeFailure,async batch(){return [{meta:{changes:1}},{success:false,error:'offline',results:[]}];}};
  await assert.rejects(setPetHouseLayout(savedReadFailure,'owner-a',f.pet1,'wall','night_wall'),/pet_state_read_unavailable/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_house_layouts').get().c,0);
  f.close();
});

test('a switch after the scoped save commits cannot reject or transfer the saved room',async()=>{
  const f=fixture();
  const nativeBatch=f.d1.batch.bind(f.d1);
  let batches=0;
  f.d1.batch=async statements=>{
    batches++;
    const results=await nativeBatch(statements);
    f.sql.prepare('UPDATE telegram_pet_active_slots SET pet_id=?,season_key=? WHERE telegram_id=?')
      .run('pet-2','new-quarter','owner-a');
    return results;
  };
  const scope=createDisplayedPetScope(f.d1,'owner-a','pet-1','old-quarter');
  const saved=await setPetHouseLayout(scope.db,'owner-a',f.pet1,'wall','night_wall');
  assert.equal(saved.accepted,true);
  assert.equal(saved.pet_house.pet_id,'pet-1');
  assert.equal(saved.pet_house.layout.wall,'night_wall');
  assert.equal(batches,1,'write, projection and authority check share one transaction');
  assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet1)).layout.wall,'night_wall');
  assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet2)).layout.wall,PET_HOUSE_DEFAULTS.wall);
  await assert.rejects(setPetHouseLayout(scope.db,'owner-a',f.pet1,'floor','steel'),/moonpet_displayed_pet_changed/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_house_layouts').get().c,1);
  f.close();
});

test('a failed read in the save transaction rolls back the placement',async()=>{
  const f=fixture();
  const nativePrepare=f.d1.prepare.bind(f.d1);
  f.d1.prepare=statement=>{
    const prepared=nativePrepare(statement);
    if(statement.startsWith('SELECT slot_key,item_key')) prepared.exec=()=>{throw new Error('read_offline');};
    return prepared;
  };
  await assert.rejects(setPetHouseLayout(f.d1,'owner-a',f.pet1,'wall','night_wall'),/read_offline/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_house_layouts').get().c,0);
  f.close();
});

test('house is wired only through signed selected-pet state and actions',()=>{
  assert.match(worker,/getPetHouseLayout|readPetHouseLayout/);
  assert.match(worker,/action === 'house_place'/);
  assert.match(client,/function renderPetHouse\(/);
  assert.match(entry,/moonpet-mini-app\.js\?v=20261022-background-refresh-v1/);
  assert.doesNotMatch(client,/house_place[\s\S]{0,90}moon_gold/);
  assert.match(worker,/readPetHouseLayout\(lifecycleScope\.singleReads, telegramId, petRaw\)/);
  assert.match(worker,/readPetHouseLayout\(identityScope\.singleReads, telegramId, petRaw\)/);
  assert.match(worker,/hydration: \{ mode: 'full', full: true, modules: options\.mode === 'profile' \? \['profile'\] : \[\] \}/);
});

test('notice acknowledgments preserve Profile hydration without adding requests',async()=>{
  const start=client.indexOf('  async function showPendingNotices()');
  const end=client.indexOf('\n  function actionAnimationFamily',start);
  assert.ok(start>=0 && end>start);
  for(const activeScreen of ['profile','home','missions']){
    const requests=[];
    const state={pet:{pet_id:'pet-1',season_key:'old-quarter'},notices:[
      {key:'notice-1',scope:'pet',pet_id:'pet-1',season_key:'old-quarter',title:'Saved progress'},
    ]};
    const context={
      state,activeScreen,document:{hidden:false},noticesBusy:false,haptic(){},tell(){},crypto:{randomUUID:()=> 'test-notice'},
      beginStateRequest:()=>1,
      async post(path,body){
        requests.push(body);
        return {state:{...state,hydration:{mode:'full',full:true,modules:body.state_mode === 'profile'?['profile']:[]}}};
      },
      setStateSnapshot(snapshot){context.state=snapshot;return true;},render(){},
    };
    vm.runInNewContext(client.slice(start,end),context);
    await context.showPendingNotices();
    assert.equal(requests.length,1);
    assert.equal(requests[0].state_mode,activeScreen === 'profile'?'profile':undefined);
    assert.equal(context.state.hydration.modules.includes('profile'),activeScreen === 'profile');
  }
});


test('room selection defaults to Main, persists per pet and preserves old layout/rewards',async()=>{
  const f=fixture();
  await setPetHouseLayout(f.d1,'owner-a',f.pet1,'wall','night_wall');
  const oldRows=f.sql.prepare('SELECT * FROM telegram_pet_house_layouts').all();
  const balances=f.sql.prepare('SELECT * FROM telegram_pet_profiles').all();
  assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet1)).layout.room,'main');
  for(const room of ['kitchen','garden','gym']){
    const saved=await setPetHouseLayout(f.d1,'owner-a',f.pet1,'room',room);
    assert.equal(saved.accepted,true);assert.equal(saved.pet_house.layout.room,room);
    assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet1)).layout.room,room);
    assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet2)).layout.room,'main');
  }
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_house_layouts').all(),oldRows);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_profiles').all(),balances);
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet1,'room','unverified')).accepted,false);
  assert.equal((await setPetHouseLayout(f.d1,'owner-b',f.pet1,'room','kitchen')).accepted,false);
  f.sql.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-2',season_key='new-quarter' WHERE telegram_id='owner-a'").run();
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet1,'room','kitchen')).accepted,false);
  assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet1)).layout.room,'gym');
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet1,'room','main')).accepted,false,'reset cannot target another selected pet');
  f.sql.prepare("UPDATE telegram_pet_active_slots SET pet_id='pet-1',season_key='old-quarter' WHERE telegram_id='owner-a'").run();
  assert.equal((await setPetHouseLayout(f.d1,'owner-a',f.pet1,'room','main')).accepted,true);
  assert.equal((await readPetHouseLayout(f.d1,'owner-a',f.pet1)).layout.room,'main');
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_house_layouts').all(),oldRows);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_profiles').all(),balances);
  f.close();
});


test('room save read failures roll back and failed D1 mutations cannot claim success',async()=>{
  const f=fixture();const nativePrepare=f.d1.prepare.bind(f.d1);
  f.d1.prepare=statement=>{
    const prepared=nativePrepare(statement);
    if(statement.startsWith('SELECT slot_key,item_key')) prepared.exec=()=>{throw Error('room_read_offline');};
    return prepared;
  };
  await assert.rejects(setPetHouseLayout(f.d1,'owner-a',f.pet1,'room','kitchen'),/room_read_offline/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_house_rooms').get().c,0);
  f.d1.prepare=nativePrepare;f.d1.batch=async()=>[{success:false},{results:[]}];
  await assert.rejects(setPetHouseLayout(f.d1,'owner-a',f.pet1,'room','garden'),/pet_state_write_unavailable/);
  f.close();
});

test('096 is additive/idempotent and enforces room ownership and valid choices',async()=>{
  const f=fixture();const roomMigration=fs.readFileSync(new URL('../workers/moonboys-api/migrations/096_moonpet_home_rooms.sql',import.meta.url),'utf8');
  await setPetHouseLayout(f.d1,'owner-a',f.pet1,'room','garden');
  const saved=f.sql.prepare('SELECT * FROM telegram_pet_house_rooms').all();
  f.sql.exec(roomMigration);assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_house_rooms').all(),saved);
  for(const [owner,season,key] of [['owner-b','new-quarter','gym'],['owner-a','old-quarter','gym'],['owner-a','new-quarter','hacked']]){
    assert.throws(()=>f.sql.prepare('INSERT INTO telegram_pet_house_rooms(pet_id,telegram_id,season_key,room_key) VALUES (?,?,?,?)')
      .run('pet-2',owner,season,key),/constraint/i);
  }
  f.sql.prepare("DELETE FROM telegram_pet_season_slots WHERE pet_id='pet-1'").run();
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS c FROM telegram_pet_house_rooms').get().c,0);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);f.close();
});

test('PR3 home status shows saved selected-pet ownership without inventing comfort upgrades', () => {
  const source=fs.readFileSync(new URL('../js/moonpet-mini-app.js',import.meta.url),'utf8');
  const block=source.split('// TEST-EXPORT: homeStatusSummary:start')[1].split('// TEST-EXPORT: homeStatusSummary:end')[0];
  const ctx={state:{pet:{pet_id:'pet-a'},lifecycle:{phase:'young'},pet_house:{available:true,pet_id:'pet-a',floor_saved:true,layout:{room:'kitchen',floor:'steel'}},pet_furniture:{available:true,pet_id:'pet-a',arrangements_available:true,owned:['neon_lamp'],catalog:{neon_lamp:{label:'Neon Lamp'}},arrangements:{kitchen:[{key:'neon_lamp',x:15,y:30}]}}},savedHomeLayout:s=>s.pet_house.layout,furnitureRoom:s=>s.lifecycle.phase==='egg'?'main':s.pet_house.layout.room,roomFurnitureItems:(s,room)=>s.pet_furniture.arrangements[room]||[],FREE_HOME_LABELS:{sleep_mat:'Fish Tank'},escapeHtml:String};
  vm.createContext(ctx);vm.runInContext(block,ctx);
  const out=ctx.renderHomeStatusSummary();
  assert.match(out,/CURRENT ROOM \/\/ KITCHEN \/\/ DISPLAYED/);
  assert.match(out,/CURRENT MATT \/\/ CAMO MATT/);
  assert.match(out,/DISPLAYED \/\/ 1\/8 \/\/ Neon Lamp/);
  assert.match(out,/ACCOUNT PAID FURNITURE OWNED \/\/ 1\/1/);
  assert.match(out,/NO COMFORT, HEALTH, XP OR PASSIVE REWARD EFFECT/);
  ctx.state.lifecycle.phase='egg';
  ctx.state.pet_furniture.arrangements.main=[{key:'sleep_mat',x:6,y:35}];
  ctx.state.pet_house.floor_saved=false;
  const egg=ctx.renderHomeStatusSummary();
  assert.ok(egg.includes("CURRENT ROOM // MAIN // DISPLAYED"), "Expected egg display to include CURRENT ROOM // MAIN // DISPLAYED");
  assert.ok(egg.includes("SAVED FOR AFTER HATCHING // KITCHEN"), "Expected egg display to include SAVED FOR AFTER HATCHING // KITCHEN");
  assert.ok(egg.includes("CURRENT MATT // FREE BLACK / SILVER MATT"), "Expected egg display to include CURRENT MATT // FREE BLACK / SILVER MATT");
  assert.ok(egg.includes("DISPLAYED // 1/8 // Fish Tank"), "Expected egg display to include DISPLAYED // 1/8 // Fish Tank");
  assert.ok(egg.includes("DISPLAYED // 1/8 // Neon Lamp") === false, "Expected egg display to exclude DISPLAYED // 1/8 // Neon Lamp");
  ctx.state.pet.pet_id='pet-b';
  assert.match(ctx.renderHomeStatusSummary(),/SYNCING/);
});

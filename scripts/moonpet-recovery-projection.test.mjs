import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery } from './moonpet-pr3-fixture.mjs';
import { readPetCombatProjection } from '../workers/moonboys-api/pets/combat-projection.js';
import { reconcileLegacyPetInventory } from '../workers/moonboys-api/pets/inventory-cutover.js';
import { getExistingMoonpetLifecycle } from '../workers/moonboys-api/pets/species-lifecycle.js';
import { readPetRecoveryPresence } from '../workers/moonboys-api/pets/recovery-presence.js';
const options={arenaLobby:'mini:arena:global',kaijuLobby:'mini:kaiju:global',arenaTtl:20,kaijuTtl:20};
const wallets=f=>f.sql.prepare('SELECT pet_id,pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_instances ORDER BY pet_id').all();
function arena(f,id,chat,status='readying',expires='2026-10-21T11:00:00Z') {
  f.sql.prepare(`INSERT INTO telegram_pet_arena_battles
    (id,battle_id,chat_id,player1_telegram_id,player2_telegram_id,player1_pet_snapshot_json,player2_pet_snapshot_json,status,expires_at)
    VALUES (?,?,?,?, 'app','{}','{}',?,?)`).run(id,id,chat,f.owner,status,expires);
}
function kaiju(f,id,chat,locked=false) {
  f.sql.prepare(`INSERT INTO telegram_pet_kaiju_matches
    (id,match_id,chat_id,player1_telegram_id,status,player1_card_key,cpu_card_key,updated_at)
    VALUES (?,?,?,?,'selecting',?,?,'2026-10-21 11:00:00')`).run(id,id,chat,f.owner,locked?'card-a':null,locked?'card-b':null);
}

test('full signed settled refresh batches all combat fields, keeps its guard and skips only empty inventory compatibility',async()=>{
  const f=await performanceFixture();
  try {
    seedRecoveryEvidence(f); await f.state(); await f.state();
    const before=wallets(f),batches=[];
    f.db.beforeBatch=entries=>batches.push(entries.map(s=>s.query));
    const {state,report}=await f.measureHttp();
    assert.equal(state.hydration.full,true);
    for(const key of ['arena','arena_queue','arena_result','kaiju','inventory','daily_journey','weekly_journey','season_slots']) assert.ok(Object.hasOwn(state,key),key);
    const combat=batches.filter(entries=>entries.some(q=>q.includes('SELECT q.rank_bucket')));
    assert.equal(combat.length,1);
    assert.equal(combat[0].filter(q=>q.includes('AS displayed_pet_authority')).length,1);
    assert.equal(combat[0].filter(q=>/^UPDATE/.test(q)).length,5);
    assert.equal(batches.flat().filter(q=>q.includes('INSERT OR IGNORE INTO telegram_pet_inventory_legacy_sync_042')).length,0);
    assert.ok(report.calls<96);assert.ok(report.statements<149);
    assert.deepEqual(wallets(f),before);
  } finally {f.close();}
});

test('combat snapshot expires abandoned inputs and queues but retains locked accepted decisions',async()=>{
  const f=await performanceFixture();
  try {
    arena(f,'abandoned',options.arenaLobby);
    arena(f,'locked','mini:'+f.owner,'active');
    f.sql.prepare(`INSERT INTO telegram_pet_arena_rounds
      (id,battle_id,round_number,player1_move) VALUES ('locked-round','locked',1,'attack')`).run();
    kaiju(f,'abandoned-kaiju','mini:kaiju:match:abandoned');
    kaiju(f,'locked-kaiju','mini:kaiju:match:locked',true);
    f.sql.prepare(`INSERT INTO telegram_pet_arena_queue (id,chat_id,telegram_id,rank_bucket,updated_at)
      VALUES ('old',?,?,'bronze','2026-10-21 11:00:00')`).run(options.arenaLobby,f.owner);
    f.sql.prepare(`INSERT INTO telegram_pet_kaiju_queue (id,chat_id,telegram_id,updated_at)
      VALUES ('old',?,?,'2026-10-21 11:00:00')`).run(options.kaijuLobby,f.owner);
    const before=wallets(f);
    const state=await readPetCombatProjection(f.db,f.owner,options);
    assert.equal(state.arena.battle_id,'locked');assert.equal(state.kaiju.match_id,'locked-kaiju');
    assert.equal(state.arenaQueue,null);assert.equal(state.kaijuQueue,null);
    assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_arena_battles WHERE battle_id='abandoned'").get().status,'expired');
    assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_kaiju_matches WHERE match_id='abandoned-kaiju'").get().status,'cancelled');
    assert.deepEqual(wallets(f),before);
  } finally {f.close();}
});

test('combat lobby/player priority, fallback housekeeping and claimed queue positions match current rules',async()=>{
  const f=await performanceFixture();
  try {
    arena(f,'lobby',options.arenaLobby,'readying','2026-10-22T00:00:00Z');
    arena(f,'solo','mini:'+f.owner,'readying','2026-10-22T00:00:00Z');
    kaiju(f,'player','mini:kaiju:match:player',true);
    // An unrelated old chat row is not expired while the player match wins.
    kaiju(f,'fallback','mini:kaiju:'+f.owner);
    f.sql.prepare("INSERT INTO telegram_users (telegram_id,first_name) VALUES ('another-owner','Other fixture')").run();
    f.sql.prepare("UPDATE telegram_pet_kaiju_matches SET player1_telegram_id='another-owner' WHERE match_id='fallback'").run();
    f.sql.prepare(`INSERT INTO telegram_pet_arena_queue (id,chat_id,telegram_id,rank_bucket,status,updated_at)
      VALUES ('claim',?,?,'bronze','claimed','claim:saved')`).run(options.arenaLobby,f.owner);
    f.sql.prepare(`INSERT INTO telegram_pet_kaiju_queue (id,chat_id,telegram_id,updated_at)
      VALUES ('claim',?,?,'claim:saved')`).run(options.kaijuLobby,f.owner);
    const state=await readPetCombatProjection(f.db,f.owner,options);
    assert.equal(state.arena.battle_id,'lobby');assert.equal(state.kaiju.match_id,'player');
    assert.equal(state.arenaQueue.position,1);assert.equal(state.kaijuQueue.position,1);
    assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_kaiju_matches WHERE match_id='fallback'").get().status,'selecting');
    f.sql.exec("UPDATE telegram_pet_kaiju_matches SET status='completed' WHERE match_id='player'");
    assert.equal((await readPetCombatProjection(f.db,f.owner,options)).kaiju,null);
    assert.equal(f.sql.prepare("SELECT status FROM telegram_pet_kaiju_matches WHERE match_id='fallback'").get().status,'cancelled');
  } finally {f.close();}
});

test('complete combat SELECTs use existing chat/player indexes instead of scanning historical application tables',async()=>{
  const f=await performanceFixture();let reads=0;
  try {
    f.db.beforeBatch=entries=>{
      for(const statement of entries.filter(s=>/^SELECT\b/.test(s.query))){
        const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+statement.query).all(...statement.args).map(row=>row.detail);
        assert.deepEqual(plan.filter(detail=>/^SCAN telegram_pet_/.test(detail)),[],plan.join('\n'));
        assert.ok(plan.some(detail=>detail.startsWith('SEARCH ')),plan.join('\n'));reads++;
      }
    };
    await readPetCombatProjection(f.db,f.owner,options);assert.equal(reads,6);
  } finally {f.close();}
});

for(const failure of ['throw','resolved','malformed'])test('complete signed combat projection fails closed on '+failure+' D1 failure',async()=>{
  const f=await performanceFixture();
  try {
    const before=wallets(f);let hit=false;
    f.db.beforeAll=statement=>{
      if(statement.query.includes('SELECT q.rank_bucket')){
        hit=true;if(failure==='throw')throw Error('fixture_d1_failure');
        return failure==='resolved'?{success:false,results:[]}:{results:null};
      }
    };
    await f.measureHttp('full',{status:503});assert.equal(hit,true);assert.deepEqual(wallets(f),before);
    f.db.beforeAll=null;assert.equal((await f.measureHttp()).state.adopted,true);
  } finally {f.close();}
});

test('pet switch inside combat snapshot aborts the guarded transaction and fresh state selects the new pet',async()=>{
  const f=await performanceFixture({pets:3});
  try {
    let switched=false;
    f.db.beforeBatch=entries=>{if(!switched&&entries.some(s=>s.query.includes('SELECT q.rank_bucket'))){switched=true;f.active('fixture-space-2','pet-s2026-004');}};
    await f.measureHttp('full',{status:503});assert.equal(switched,true);
    f.db.beforeBatch=null;const next=await f.measureHttp();
    assert.equal(next.state.pet.pet_id,'fixture-space-2');assert.equal(next.state.season_slots.active_pet_id,'fixture-space-2');
  } finally {f.close();}
});

test('legacy positive balances and exhausted historical checkpoints retain exact inventory reconciliation',async()=>{
  const f=await performanceFixture();
  try {
    const before=wallets(f);
    f.sql.prepare(`INSERT INTO telegram_pet_events(id,telegram_id,event_type,event_key,status,season_key,day_key,week_key,metadata)
      VALUES ('legacy',?,'buy','legacy','accepted','pet-s2026-004','2026-10-20','2026-W43',?)`).run(f.owner,JSON.stringify({item_key:'moon_snack',count:3}));
    await reconcileLegacyPetInventory(f.db,f.owner,{skipEmpty:true});
    const quantity=()=>f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_key='moon_snack'").get(f.owner).quantity;
    assert.equal(quantity(),3);await reconcileLegacyPetInventory(f.db,f.owner,{skipEmpty:true});assert.equal(quantity(),3);
    f.sql.exec("UPDATE telegram_pet_events SET status='rejected' WHERE id='legacy'");
    await reconcileLegacyPetInventory(f.db,f.owner,{skipEmpty:true});assert.equal(quantity(),0);
    assert.deepEqual(wallets(f),before);
  } finally {f.close();}
});

for(const malformed of [null,{}, {success:false}, {needed:null}])test('failed inventory probe never means no historical consumer: '+JSON.stringify(malformed),async()=>{
  const f=await performanceFixture();
  try {
    f.db.beforeFirst=statement=>statement.query.includes('AS needed')?malformed:undefined;
    await assert.rejects(reconcileLegacyPetInventory(f.db,f.owner,{skipEmpty:true}),/pet_state_read_unavailable/);
  } finally {f.close();}
});

test('settled Journey queues use one candidate transaction, with no reconciliation or reward write on retry',async()=>{
  const f=await performanceFixture();
  try {
    await seedPr3Recovery(f,{archived:false});await f.state();await f.state();
    const before=wallets(f),batches=[];
    f.db.beforeBatch=entries=>batches.push(entries.map(s=>s.query));
    const {events}=await f.measureHttp();
    assert.equal(batches.filter(entries=>entries.some(q=>q.includes('AS missing_weekly'))).length,1);
    const source=events.find(e=>e.stage==='journey_source_recovery');
    assert.equal(source.d1_calls,1);assert.equal(source.sql_statements,3);
    for(const kind of ['daily','weekly'])assert.equal(events.find(e=>e.stage===kind+'_journey_award_recovery').d1_calls,0);
    assert.deepEqual(wallets(f),before);
  } finally {f.close();}
});

test('equipped and accepted historical gear repairs only missing catalog rows, retaining saved level/XP/mastery',async()=>{
  const f=await performanceFixture({pets:3});
  try {
    for(const table of ['telegram_pet_profiles','telegram_pet_instances'])f.sql.exec("UPDATE "+table+" SET equipped_food='moon_kibble'");
    assert.equal((await readPetRecoveryPresence(f.db,f.owner)).equipment,1);
    await f.state();
    f.sql.prepare("UPDATE telegram_pet_equipment_progression SET item_xp=123,item_level=4,mastery_xp=91 WHERE telegram_id=? AND item_key='moon_kibble'").run(f.owner);
    const before=f.sql.prepare('SELECT * FROM telegram_pet_equipment_progression ORDER BY item_key').all();
    assert.equal((await readPetRecoveryPresence(f.db,f.owner)).equipment,0);
    let repairs=0;f.db.beforeRun=s=>{if(s.query.includes('WITH definitions(item_key,slot)'))repairs++;};
    await f.measureHttp();assert.equal(repairs,0);
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_equipment_progression ORDER BY item_key').all(),before);
    f.sql.prepare(`INSERT INTO telegram_pet_events(id,telegram_id,pet_id,event_type,event_key,status,season_key,day_key,week_key,metadata)
      VALUES ('gear-history',?,?,'buy','gear-history','accepted','pet-s2026-004','2026-10-20','2026-W43',?)`)
      .run(f.owner,'fixture-space-2',JSON.stringify({item_key:'laser_ball',inventory_authority:1}));
    for(const table of ['telegram_pet_instances','telegram_pet_season_slots'])f.sql.exec("UPDATE "+table+" SET status='archived' WHERE pet_id='fixture-space-2'");
    assert.equal((await readPetRecoveryPresence(f.db,f.owner)).equipment,1);
    await f.measureHttp();assert.equal((await readPetRecoveryPresence(f.db,f.owner)).equipment,0);
    assert.ok(f.sql.prepare("SELECT item_key FROM telegram_pet_equipment_progression WHERE item_key='laser_ball'").get());
  } finally {f.close();}
});

test('lifecycle evolution evidence starts while independent incubation totals are blocked',async()=>{
  const f=await performanceFixture();let release;
  const blocked=new Promise(resolve=>{release=resolve;});let started=false,evolutionRead=false;
  try {
    f.db.beforeFirst=async statement=>{
      if(statement.query.includes('SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet')){started=true;await blocked;}
      if(started&&statement.query.includes('SELECT MAX(stage) AS stage FROM telegram_pet_evolutions_by_pet'))evolutionRead=true;
    };
    const reading=getExistingMoonpetLifecycle(f.db,f.owner);
    for(let i=0;i<20&&!started;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(started,true);assert.equal(evolutionRead,true);
    release();assert.equal((await reading).phase,'young');
  } finally {release();f.close();}
});

for(const [name,boundary] of Object.entries({daily:'2026-10-22T00:00:00Z',monday:'2026-10-26T00:00:00Z',journey:'2026-10-28T00:00:00Z',monthly:'2026-11-01T00:00:00Z',quarterly:'2027-01-01T00:00:00Z'})){
  test(name+' UTC boundary keeps saved lifetime rewards and uses fresh daily/weekly periods',async()=>{
    const f=await performanceFixture();
    try {
      await seedPr3Recovery(f);await f.state();await f.state();
      if(name==='journey')f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-10-21 00:00:00' WHERE telegram_id=?").run(f.owner);
      const before=wallets(f),marks=f.sql.prepare('SELECT * FROM telegram_pet_growth_marks ORDER BY mark_id').all(),crests=f.sql.prepare('SELECT * FROM telegram_pet_weekly_crests ORDER BY crest_id').all();
      f.advance(Date.parse(boundary)-Date.now()-1);const first=(await f.measureHttp()).state;
      f.advance(1);const next=(await f.measureHttp()).state;
      assert.equal(next.guidance.day_key,boundary.slice(0,10));assert.notEqual(next.guidance.day_key,first.guidance.day_key);
      if(name==='monday')assert.notEqual(first.guidance.week_key,next.guidance.week_key);
      if(name==='journey')assert.equal(next.weekly_journey.qualification_week,first.weekly_journey.qualification_week+1);
      if(name==='quarterly')assert.notEqual(first.competition_season.key,next.competition_season.key);
      assert.equal(next.daily_journey.growth_mark_awarded,false);
      assert.deepEqual(wallets(f),before);
      assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_growth_marks ORDER BY mark_id').all(),marks);
      assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_weekly_crests ORDER BY crest_id').all(),crests);
    } finally {f.close();}
  });
}

// Historical baseline-only diagnostic (cae48482af09f535ffddc0b1881d62f4a6b00e03); not fixed-head CI.
// Local authenticated Worker requests and in-memory SQLite only.
import assert from 'node:assert/strict';
import {fixture,clockFixture,hooks,httpAction} from './moonpet-audit-regression-fixture.mjs';
import {createContractState,getContractBoard} from '../workers/moonboys-api/pets/continuing-contracts.js';
import {getActiveSeasonalBoss} from '../workers/moonboys-api/pets/live-systems.js';
const reports=[];
const wallet=f=>f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get();
function seeded(owner,at='2026-10-03T12:00:00.000Z'){
 const f=fixture(owner,'pet-s2026-003'),clock=clockFixture(f,at),id='current-'+owner;
 f.pet('second','pet-s2026-002',10000,2);f.pet('third','pet-s2025-001',10000,3);
 f.sql.prepare('UPDATE telegram_pet_instances SET last_decay_at=?').run(clock.now());
 return {f,clock,id};
}
{
 const {f,clock,id}=seeded('980101');
 try{
  const season=f.sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get(id).season_key;
  f.sql.prepare("INSERT INTO telegram_pet_contracts(contract_id,pet_id,telegram_id,season_key,sequence,status,state_json,reward_xp,reward_day) VALUES('saved-contract',?,?,?,1,'completed',?,20,'2026-10-03')").run(id,f.owner,season,JSON.stringify(createContractState('scout','scout',1,'audit')));
  f.sql.exec('CREATE TRIGGER ignore_contract_ack BEFORE UPDATE OF reward_settled ON telegram_pet_contracts BEGIN SELECT RAISE(IGNORE); END');
  const r=await httpAction(f,{action:'contract_claim',contract_id:'saved-contract',pet_id:id});assert.equal(r.status,200);assert.equal(r.body.result.accepted,true);
  const row=f.sql.prepare('SELECT reward_settled FROM telegram_pet_contracts').get();
  const pending=(await getContractBoard(f.db,f.owner,{pet_id:id,season_key:season})).pending_rewards.length;
  const xp=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(id).pet_xp;
  reports.push({finding:'contract_acknowledgement',result:r.body.result,source_marker:row.reward_settled,pending_claims:pending});
  f.sql.exec('DROP TRIGGER ignore_contract_ack');f.active('third','pet-s2025-001');
  const retry=await httpAction(f,{action:'contract_claim',contract_id:'saved-contract',pet_id:id});assert.equal(retry.body.result.accepted,true);assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(id).pet_xp,xp);
 }finally{clock.restore();f.sql.close();}
}
{
 const {f,clock,id}=seeded('980102');
 try{
  const boss=getActiveSeasonalBoss(new Date());
  f.sql.prepare('INSERT INTO telegram_pet_seasonal_boss_progress(pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at) VALUES(?,?,?,?,?,?,?)').run(id,f.owner,'pet-s2026-003',boss.season_instance,boss.key,boss.hp,clock.now());
  f.sql.exec('CREATE TRIGGER ignore_raid_ack BEFORE UPDATE OF reward_claimed_at ON telegram_pet_seasonal_boss_progress BEGIN SELECT RAISE(IGNORE); END');
  const body={action:'seasonal_boss_claim',pet_id:id,boss_key:boss.key,season_instance:boss.season_instance};
  const r=await httpAction(f,body);assert.equal(r.status,200);assert.equal(r.body.result.accepted,true);
  reports.push({finding:'raid_acknowledgement',result:r.body.result,source_marker:f.sql.prepare('SELECT reward_claimed_at FROM telegram_pet_seasonal_boss_progress').get().reward_claimed_at});
  const paid=wallet(f),xp=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(id).pet_xp;
  f.sql.exec('DROP TRIGGER ignore_raid_ack');f.active('third','pet-s2025-001');
  const retry=await httpAction(f,body);assert.equal(retry.body.result.duplicate,true);assert.deepEqual(wallet(f),paid);assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(id).pet_xp,xp);
 }finally{clock.restore();f.sql.close();}
}
{
 const {f,clock,id}=seeded('980103');
 try{
  const week='2026-W40',boss=hooks.getPetWeeklyBoss(week);
  f.sql.prepare('INSERT INTO telegram_pet_weekly_boss_progress(telegram_id,week_key,boss_id,damage,attempts) VALUES(?,?,?,?,1)').run(f.owner,week,boss.boss_id,boss.hp-1);
  f.sql.exec('CREATE TRIGGER ignore_weekly_ack BEFORE UPDATE OF reward_claimed_at ON telegram_pet_weekly_boss_progress BEGIN SELECT RAISE(IGNORE); END');
  const r=await httpAction(f,{action:'weekly_boss',move:'strike',pet_id:id,request_id:'winning-hit'});assert.equal(r.status,200);assert.equal(r.body.result.accepted,true);
  reports.push({finding:'weekly_victory_pending_flag',result:r.body.result,source_marker:f.sql.prepare('SELECT reward_claimed_at FROM telegram_pet_weekly_boss_progress').get().reward_claimed_at});
 }finally{clock.restore();f.sql.close();}
}
{
 const {f,clock,id}=seeded('980104','2026-09-30T23:59:59.999Z');
 try{
  const boss=getActiveSeasonalBoss(new Date());
  f.sql.prepare('INSERT INTO telegram_pet_seasonal_boss_progress(pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at) VALUES(?,?,?,?,?,?,?)').run(id,f.owner,'pet-s2026-003',boss.season_instance,boss.key,boss.hp,clock.now());
  clock.advance(2);f.active('third','pet-s2025-001');
  const r=await httpAction(f,{action:'seasonal_boss_claim',pet_id:id,boss_key:boss.key,season_instance:boss.season_instance});assert.equal(r.status,200);assert.equal(r.body.result.accepted,true);
  reports.push({finding:'raid_earning_quarter',saved_victory:'2026-09-30T23:59:59.999Z',claim_clock:clock.now(),awarded_xp:r.body.result.pet_xp_awarded,season_scores:f.sql.prepare('SELECT season_key,season_xp FROM telegram_pet_season_state').all(),source_xp:f.sql.prepare('SELECT pet_id,season_key,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all()});
 }finally{clock.restore();f.sql.close();}
}
{
 const {f,clock,id}=seeded('980105');
 try{
  f.sql.prepare('UPDATE telegram_pet_profiles SET moon_gold=0,moon_crystals=0,style_tokens=0').run();
  const boss=getActiveSeasonalBoss(new Date());
  f.sql.prepare('INSERT INTO telegram_pet_seasonal_boss_progress(pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at) VALUES(?,?,?,?,?,?,?)').run('second',f.owner,'pet-s2026-002',boss.season_instance,boss.key,boss.hp,clock.now());
  let interleaved=false;
  f.db.beforeAll=async statement=>{
   if(!interleaved && statement.query.includes('WITH owned_pets AS')){
    interleaved=true;
    const award=(await httpAction(f,{action:'seasonal_boss_claim',pet_id:'second',boss_key:boss.key,season_instance:boss.season_instance})).body.result;
    assert.equal(award.accepted,true);
   }
  };
  const state=await f.state();assert.equal(interleaved,true);
  reports.push({finding:'mixed_economic_projection',selected_pet:state.pet.pet_id,header:{gold:state.pet.moon_gold,gems:state.pet.moon_crystals,xp:state.pet.pet_xp},guidance_season:state.guidance.season,leaderboard:state.leaderboard,shop:state.guidance.shop_items,stored_wallet:wallet(f)});
 }finally{clock.restore();f.sql.close();}
}
{
 const {f,clock,id}=seeded('980106');
 try{
  const start=await httpAction(f,{action:'daily_run_start',request_id:'daily-projection-read'});assert.equal(start.body.result.accepted,true,JSON.stringify(start.body));
  const good=await f.state(),saved=f.sql.prepare('SELECT * FROM telegram_pet_run_rooms').all();
  let hit=false;f.db.beforeFirst=statement=>{
   if(statement.query.includes('SELECT room_number, room_type, status, generated_data') && statement.query.includes('FROM telegram_pet_run_rooms')){hit=true;return {success:false,error:'failed_daily_room_projection'};}
  };
  let bad,error;
  try{bad=await f.state();}catch(e){error=e.message;}
  assert.equal(hit,true);assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_run_rooms').all(),saved);
  f.db.beforeFirst=null;const recovered=await f.state();assert.equal(recovered.run.choices.length,good.run.choices.length);
  reports.push({finding:'failed_daily_room_projection',healthy_choices:good.run.choices.length,published:!!bad,failed_choices:bad?.run?.choices.length,room:bad?.run?.room,error,recovered_choices:recovered.run.choices.length,source_pet:id});
 }finally{clock.restore();f.sql.close();}
}
console.log(JSON.stringify(reports,null,2));

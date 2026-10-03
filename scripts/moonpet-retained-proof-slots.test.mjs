import assert from 'node:assert/strict';
import { fixture, clockFixture, hooks, httpAction } from './moonpet-audit-regression-fixture.mjs';
import { recoverDailyMoonRunEndings } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { awardPetReward } from '../workers/moonboys-api/pets/roguelite-foundation.js';

let sequence=997000, cases=0;
function setup(count=3) {
  const f=fixture(String(++sequence),'pet-s2026-003'), clock=clockFixture(f,'2026-10-03T12:00:00Z');
  f.pet('second','pet-s2026-002',10000,2);
  if(count===3) f.pet('third','pet-s2025-001',10000,3);
  f.sql.prepare('UPDATE telegram_pet_instances SET last_decay_at=?').run(clock.now());
  return {f,clock,source:'current-'+f.owner};
}
async function ending(f,source,outcome,generated=null,suffix='') {
  const start=await httpAction(f,{action:'daily_run_start'});
  assert.equal(start.body.result.accepted,true);
  const run=f.sql.prepare('SELECT * FROM telegram_pet_runs ORDER BY rowid DESC LIMIT 1').get();
  f.sql.prepare("UPDATE telegram_pet_runs SET current_room=max_room,depth=0,rooms_completed=max_room,status='completed' WHERE run_id=?").run(run.run_id);
  const room=hooks.generatePetRunRoom({...run,current_room:run.max_room-1});
  f.sql.prepare(`INSERT INTO telegram_pet_run_rooms(room_id,pet_id,run_id,telegram_id,room_number,room_type,status,generated_data,outcome_data)
    VALUES(?,?,?,?,?,'boss','resolved',?,?)`).run('final'+suffix,source,run.run_id,f.owner,run.max_room,generated ?? JSON.stringify(room),outcome);
  return {...run,room_id:'final'+suffix};
}
const rewards=f=>f.sql.prepare("SELECT * FROM telegram_pet_reward_claims WHERE source<>'wallet_reconciliation' ORDER BY claim_id").all();

for(const count of [2,3]) for(const malformed of ['outcome','generated','analytics']) {
  const {f,clock,source}=setup(count);
  try {
    const run=await ending(f,source,malformed==='outcome' ? '{broken' : '{"success":true}',malformed==='generated' ? '{broken' : null);
    // A separate valid older ending in the same owner's bounded scan must recover.
    const other='second', otherSeason='pet-s2026-002', validRun='valid-run';
    f.sql.prepare(`INSERT INTO telegram_pet_runs(run_id,pet_id,telegram_id,season_key,status,current_room,max_room,depth,rooms_completed)
      VALUES(?,?,?,?,'completed',7,7,0,7)`).run(validRun,other,f.owner,otherSeason);
    f.sql.prepare(`INSERT INTO telegram_pet_daily_runs(run_id,pet_id,telegram_id,utc_day,status,seed)
      VALUES(?,?,?,'2026-10-02','active','saved-seed')`).run(validRun,other,f.owner);
    f.sql.prepare(`INSERT INTO telegram_pet_run_rooms(room_id,pet_id,run_id,telegram_id,room_number,room_type,status,generated_data,outcome_data)
      VALUES('valid-final',?,?,?,7,'boss','resolved','{"boss_id":"alley_king"}','{"success":true}')`).run(other,validRun,f.owner);
    if(malformed==='analytics') f.sql.prepare(`INSERT INTO telegram_pet_daily_analytics(analytics_id,run_id,telegram_id,utc_day,event_type,event_data,applied_at)
      VALUES(?,?,?,'2026-10-03','run_terminal','{broken',CURRENT_TIMESTAMP)`).run(run.run_id+':daily:terminal',run.run_id,f.owner);
    const retained=f.sql.prepare('SELECT room_id,generated_data,outcome_data FROM telegram_pet_run_rooms ORDER BY room_id').all();
    await recoverDailyMoonRunEndings(f.db,f.owner,new Date());
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_reward_claims WHERE pet_id=? AND source='roguelite_boss' AND status='awarded'").get(other).n,1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM telegram_pet_reward_claims WHERE pet_id=? AND source='roguelite_boss' AND status='awarded'").get(source).n,malformed==='analytics' ? 1 : 0);
    assert.deepEqual(f.sql.prepare('SELECT room_id,generated_data,outcome_data FROM telegram_pet_run_rooms ORDER BY room_id').all(),retained);
    const paid=rewards(f); await recoverDailyMoonRunEndings(f.db,f.owner,new Date()); assert.deepEqual(rewards(f),paid);
    cases++;
  } finally {clock.restore();f.sql.close();}
}

for(const count of [2,3]) for(const malformed of ['outcome','generated','valid']) {
  const {f,clock,source}=setup(count);
  try {
    const run=await ending(f,source,malformed==='outcome' ? '{broken' : '{"success":true}',malformed==='generated' ? '{broken' : null);
    const before=rewards(f);
    const result=await awardPetReward(f.db,{telegram_id:f.owner,pet_id:source,season_key:'pet-s2026-003',source:'roguelite_boss',idempotency_key:'fallback',
      rewards:{pet_xp:20,moon_gold:10},context:{pet_id:source,run_id:run.run_id,room_id:run.room_id,boss_id:'alley_king'}});
    assert.equal(result.accepted,malformed==='valid');
    if(malformed!=='valid') assert.deepEqual(rewards(f),before);
    else {
      const paid=rewards(f);
      assert.equal((await awardPetReward(f.db,{telegram_id:f.owner,pet_id:source,season_key:'pet-s2026-003',source:'roguelite_boss',idempotency_key:'fallback',
        rewards:{pet_xp:20,moon_gold:10},context:{pet_id:source,run_id:run.run_id,room_id:run.room_id,boss_id:'alley_king'}})).duplicate,true);
      assert.deepEqual(rewards(f),paid);
    }
    cases++;
  } finally {clock.restore();f.sql.close();}
}

for(const count of [2,3]) for(const malformed of ['outcome','generated','valid']) for(const blocker of ['boss','daily_terminal']) {
  const {f,clock,source}=setup(count);
  try {
    const run=await ending(f,source,malformed==='outcome' ? '{broken' : '{"success":true}',malformed==='generated' ? '{broken' : null);
    f.sql.prepare("UPDATE telegram_pet_daily_runs SET status='completed' WHERE run_id=?").run(run.run_id);
    if(blocker==='boss') f.sql.prepare(`INSERT INTO telegram_pet_daily_analytics(analytics_id,run_id,telegram_id,utc_day,event_type,event_data,applied_at)
      VALUES(?,?,?,'2026-10-03','run_terminal','{}',CURRENT_TIMESTAMP)`).run(run.run_id+':daily:terminal',run.run_id,f.owner);
    if(blocker==='boss') f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
      VALUES('run_terminal',?,?,'run_complete',?,'pet-s2026-003','2026-10-03','2026-W40','accepted')`).run(source,f.owner,'daily-moon-run:'+f.owner+':'+run.run_id+':completed');
    if(blocker==='daily_terminal') f.sql.prepare(`INSERT INTO telegram_pet_reward_claims(claim_id,pet_id,telegram_id,source,idempotency_key,day_key,status)
      VALUES('saved-boss-payment',?,?,'roguelite_boss',?,'2026-10-03','awarded')`).run(source,f.owner,run.room_id+':alley_king');
    const retained=f.sql.prepare('SELECT * FROM telegram_pet_run_rooms').all(), otherXp=f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='second'").get();
    const result=await hooks.deletePetSlot(f.db,f.owner,{pet_id:source,confirmed:true,confirm_pet_id:source});
    assert.equal(result.accepted,malformed!=='valid');
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_run_rooms').all(),retained);
    assert.deepEqual(f.sql.prepare("SELECT pet_xp FROM telegram_pet_instances WHERE pet_id='second'").get(),otherXp);
    cases++;
  } finally {clock.restore();f.sql.close();}
}

for(const count of [2,3]) for(const legacy of [false,true]) {
  const {f,clock,source}=setup(count);
  try {
    const decision=cost=>({version:1,encounter_key:'black_market_tip',choice_key:'follow_lead',kind:'success',copy:'Saved result',
      rewards:{moon_gold:20},costs:{moon_gold:cost},reward_draws:{},cost_draws:{}});
    const reserve=(key,pet=source,cost=0,day='2026-10-03',mode='event')=>hooks.reservePetRepeatRewardEvent(f.db,{telegram_id:f.owner,pet_id:pet,
      event_type:mode==='event' ? 'random_event' : 'kaiju_battle',event_key:key,season_key:pet===source ? 'pet-s2026-003':'pet-s2026-002',
      day_key:day,week_key:'2026-W40',mode,energy_cost:0,saved_event_decision:decision(cost)});
    const first=await reserve('first',source,10000);
    if(legacy) f.sql.prepare("UPDATE telegram_pet_events SET pet_id=NULL,metadata='{}' WHERE id=?").run(first.reservation_id);
    f.sql.prepare(`INSERT INTO telegram_pet_events(id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
      VALUES('bad-history',?,'random_event','bad-history','pet-s2026-003','2026-10-03','2026-W40','cancelled','{broken')`).run(f.owner);
    for(let i=2;i<=7;i++) {
      const r=await reserve('later-'+i,'second'); assert.equal(r.claimed_slot,i);
      const paid=await hooks.processPetRandomEvent(f.db,f.owner,'',{saved_event_id:r.reservation_id});
      assert.equal(paid.accepted,true);assert.equal(paid.reward_slot,i);
      assert.equal(paid.rewards.moon_gold,i<=6 ? 20 : 10);
    }
    const later=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE status='accepted' ORDER BY id").all(), paid=rewards(f);
    f.active('second','pet-s2026-002');
    const cancelled=legacy ? await hooks.processPetRandomEvent(f.db,f.owner,'follow_lead',{event_key:'first',encounter:hooks.PET_RANDOM_EVENTS.black_market_tip})
      : await hooks.processPetRandomEvent(f.db,f.owner,'',{saved_event_id:first.reservation_id});
    assert.equal(cancelled.cancelled,true);
    assert.equal(f.sql.prepare("SELECT claimed_count FROM telegram_pet_repeat_reward_slots WHERE mode='event'").get().claimed_count,7);
    assert.equal((await hooks.processPetRandomEvent(f.db,f.owner,'',{saved_event_id:first.reservation_id})).duplicate,true);
    assert.deepEqual(rewards(f),paid);
    assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_events WHERE status='accepted' ORDER BY id").all(),later);
    // Two concurrent callers reserve different events. Exactly one consumes the released slot.
    const [a,b]=await Promise.all([reserve('reuse-a','second'),reserve('reuse-b',source)]);
    assert.deepEqual([a.claimed_slot,b.claimed_slot].sort((a,b)=>a-b),[1,8]);
    assert.equal((await reserve('reuse-a','second')).claimed_slot,a.claimed_slot);
    const reused=a.claimed_slot===1 ? a : b;
    assert.equal((await hooks.processPetRandomEvent(f.db,f.owner,'',{saved_event_id:reused.reservation_id})).rewards.moon_gold,20);
    for(const slot of [9,10,11]) assert.equal((await reserve('cap-'+slot)).multiplier,slot<=10 ? 0.5 : 0);
    assert.equal((await reserve('next-day',source,0,'2026-10-04')).claimed_slot,1);
    f.active(source,'pet-s2026-003');
    assert.equal((await reserve('other-mode',source,0,'2026-10-03','kaiju')).claimed_slot,1);
    cases++;
  } finally {clock.restore();f.sql.close();}
}
// A missing consumption marker must roll back the fresh reservation and keep
// the released ordinal available. Retrying after repair consumes it once.
for(const failure of ['IGNORE',"ABORT,'release_failure'"]) {
  const {f,clock,source}=setup();
  try {
    const reserve=key=>hooks.reservePetRepeatRewardEvent(f.db,{telegram_id:f.owner,pet_id:source,event_type:'random_event',event_key:key,
      season_key:'pet-s2026-003',day_key:'2026-10-03',week_key:'2026-W40',mode:'event',saved_event_decision:{version:1,
        encounter_key:'black_market_tip',choice_key:'follow_lead',kind:'success',copy:'Saved',rewards:{moon_gold:20},costs:{moon_gold:10000},reward_draws:{},cost_draws:{}}});
    const first=await reserve('first');
    assert.equal((await hooks.processPetRandomEvent(f.db,f.owner,'',{saved_event_id:first.reservation_id})).cancelled,true);
    const prior=f.sql.prepare('SELECT * FROM telegram_pet_events').all();
    f.sql.exec(`CREATE TRIGGER fail_release BEFORE UPDATE OF metadata ON telegram_pet_events
      WHEN json_extract(NEW.metadata,'$.released_slot_consumed_by') IS NOT NULL
      BEGIN SELECT RAISE(${failure}); END`);
    await assert.rejects(reserve('retry'));
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events').all(),prior);
    f.sql.exec('DROP TRIGGER fail_release');
    const next=await reserve('retry');assert.equal(next.claimed_slot,1);
    assert.equal((await reserve('retry')).reservation_id,next.reservation_id);
    assert.equal((await reserve('another')).claimed_slot,2);
    cases++;
  } finally {clock.restore();f.sql.close();}
}
console.log(`PASS retained proof safety and released repeat slots: ${cases} cases`);

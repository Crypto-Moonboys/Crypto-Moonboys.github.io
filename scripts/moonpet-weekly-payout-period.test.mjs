import assert from 'node:assert/strict';
import {fixture,clockFixture,hooks,httpAction} from './moonpet-audit-regression-fixture.mjs';
import {ensureWeeklyBossVictoryEvent} from '../workers/moonboys-api/pets/weekly-boss-evidence.js';
const reports=[];
for(const backfillFirst of [false,true]){
 const f=fixture(backfillFirst?'975002':'975001'),clock=clockFixture(f,'2026-10-06T12:00:00.000Z'); const petId='legacy-victor',week='2026-W40',boss=hooks.getPetWeeklyBoss(week),season='pet-s2026-003';
 f.pet(petId,season,10000,2);f.pet('pet-c','pet-s2026-002',10000,3);f.active('pet-c','pet-s2026-002');
 f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-09-28 00:00:00'").run();
 f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_events(event_id,telegram_id,week_key,day_key,boss_id,event_key,action,damage,created_at) VALUES('win',?,?,'2026-10-04',?,'exact-win','strike',?,'2026-10-04T23:59:59.999Z')`).run(f.owner,week,boss.boss_id,boss.hp);
 f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress(telegram_id,week_key,boss_id,damage,attempts,defeated_at) VALUES(?,?,?,?,1,'2026-10-05T00:00:00.001Z')`).run(f.owner,week,boss.boss_id,boss.hp);
 f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet(telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at) VALUES(?,?,?,?,?,'exact-win','2026-10-05T00:00:00.001Z')`).run(f.owner,week,boss.boss_id,petId,season);
 if(backfillFirst)await ensureWeeklyBossVictoryEvent(f.db,f.owner,week,boss.boss_id);
 const body={action:'weekly_boss_claim',pet_id:petId,boss_id:boss.boss_id,week_key:week,request_id:'claim'};
 const response=await httpAction(f,body);assert.equal(response.status,200);assert.equal(response.body.result.accepted,true,JSON.stringify(response.body));
 const earned=f.sql.prepare("SELECT pet_id,pet_xp_awarded,day_key,week_key,season_key,created_at FROM telegram_pet_events WHERE event_type='weekly_boss_reward'").get();
 const replay=await httpAction(f,body);assert.equal(replay.body.result.duplicate,true);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_weekly_boss' AND status='awarded'").get().n,1);
 reports.push({backfill_first:backfillFirst,xp:response.body.result.pet_xp_awarded,event:earned,journey:f.sql.prepare('SELECT qualification_week,objective_id,source_event_key FROM telegram_pet_weekly_journey_objectives ORDER BY qualification_week,source_event_key').all()});
 clock.restore();f.sql.close();
}
assert.equal(reports[0].event.day_key,'2026-10-04');assert.equal(reports[1].event.day_key,'2026-10-04');
assert.ok(reports[0].journey.every(r=>r.qualification_week===1));assert.ok(reports[1].journey.every(r=>r.qualification_week===1));
console.log('Moonpet weekly payout: direct and backfilled claims retain the same proven victory period and pay once.');

// Keep incorrect historical receipts/objectives intact, but a payout is never
// a new attempt and cannot qualify a new Journey week or block its rematch.
{
 const f=fixture('975003'),clock=clockFixture(f,'2026-10-06T12:00:00.000Z');
 try {
  const pet='legacy-victor',season='pet-s2026-003';f.pet(pet,season,10000,2);
  f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-09-28 00:00:00' WHERE pet_id=?").run(pet);
  f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,reason)
    VALUES('retained-wrong-payout',?,?,'weekly_boss_reward','retained-wrong-payout',?,'2026-10-05','2026-W41','accepted','legacy-boss')`).run(pet,f.owner,season);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_journey_objectives(event_id,pet_id,telegram_id,season_key,qualification_week,objective_id,source_event_key,source_event_type,progress_value,status)
    VALUES('retained-wrong-objective',?,?,?,2,'weekly_boss_attempt','retained-wrong-payout','weekly_boss_reward',1,'accepted')`).run(pet,f.owner,season);
  const events=f.sql.prepare('SELECT * FROM telegram_pet_events').all(),objectives=f.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_objectives').all();
  const {readWeeklyJourneyObjectiveProgress}=await import('../workers/moonboys-api/pets/weekly-journey.js');
  const {readPetWeeklyBossParticipation}=await import('../workers/moonboys-api/pets/weekly-boss-participation.js');
  const progress=await readWeeklyJourneyObjectiveProgress(f.db,{telegram_id:f.owner,pet_id:pet,season_key:season,qualification_week:2});
  assert.equal(progress.results.length,0);
  assert.equal((await readPetWeeklyBossParticipation(f.db,f.owner,{pet_id:pet,season_key:season},new Date())).attempt,null);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events').all(),events);
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_weekly_journey_objectives').all(),objectives);
 } finally {clock.restore();f.sql.close();}
}

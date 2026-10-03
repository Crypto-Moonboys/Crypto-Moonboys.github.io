import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, hooks, clockFixture } from './moonpet-audit-regression-fixture.mjs';
import { ensureWeeklyBossVictoryEvent } from '../workers/moonboys-api/pets/weekly-boss-evidence.js';
import { readWeeklyJourneyObjectiveProgress, recordWeeklyJourneyObjectiveEvidence } from '../workers/moonboys-api/pets/weekly-journey.js';

const week='2026-W40', sourceSeason='pet-s2026-003';
function legacy(f, { earlier=true, badBackfill=false }={}) {
  const petId='legacy-victor', boss=hooks.getPetWeeklyBoss(week);
  f.pet(petId,sourceSeason,10000,2); f.active(petId,sourceSeason);
  f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-09-01 00:00:00' WHERE pet_id=?").run(petId);
  const attempts=earlier ? [['old-first','2026-09-28',20],['old-win','2026-10-01',boss.hp-20]] : [['old-win','2026-10-01',boss.hp]];
  for(const [key,day,damage] of attempts) f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_events
    (event_id,telegram_id,week_key,day_key,boss_id,event_key,action,damage,created_at) VALUES(?,?,?,?,?,?,'strike',?,?)`)
    .run(key,f.owner,week,day,boss.boss_id,key,damage,day+'T12:00:00.000Z');
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress(telegram_id,week_key,boss_id,damage,attempts,defeated_at)
    VALUES(?,?,?,?,?,'2026-10-01T12:00:00.000Z')`).run(f.owner,week,boss.boss_id,boss.hp,attempts.length);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet
    (telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at) VALUES(?,?,?,?,?,'old-win','2026-10-01T12:00:00.000Z')`)
    .run(f.owner,week,boss.boss_id,petId,sourceSeason);
  if(badBackfill) {
    f.sql.prepare(`INSERT INTO telegram_pet_events(id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,reason,metadata)
      VALUES('bad-old-first',?,?,'weekly_boss','old-first',?,'2026-09-28',?,'accepted','weekly_boss_attempt',?)`)
      .run(petId,f.owner,sourceSeason,week,JSON.stringify({source:'pet_weekly_boss_backfill',boss_id:boss.boss_id,action:'strike',damage:20}));
    f.sql.prepare(`INSERT INTO telegram_pet_weekly_journey_objectives
      (event_id,pet_id,telegram_id,season_key,qualification_week,objective_id,source_event_key,source_event_type,progress_value,status)
      VALUES('bad-objective',?,?,?,4,'weekly_boss_attempt','old-first','weekly_boss',1,'accepted')`).run(petId,f.owner,sourceSeason);
  }
  return {petId,boss};
}
function ledger(f) { return {
  wallet:f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner),
  pets:f.sql.prepare('SELECT pet_id,season_key,pet_xp FROM telegram_pet_instances ORDER BY pet_id').all(),
  tracks:f.sql.prepare('SELECT * FROM telegram_pet_specialist_progression ORDER BY pet_id').all(),
  memory:f.sql.prepare('SELECT * FROM telegram_pet_memories ORDER BY pet_id').all(),
  receipts:f.sql.prepare('SELECT source,idempotency_key,applied_rewards FROM telegram_pet_reward_claims ORDER BY claim_id').all(),
}; }
const finishes=f=>f.sql.prepare("SELECT * FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").all();

for(const [name,options] of [['multiple legacy attempts',{}],['only exact winner',{earlier:false}],['retained wrong backfill',{badBackfill:true}]]) test(`${name}: recover exact winner, finish and delete without rewriting history`,async t=>{
  const f=fixture('95510'+name.length),clock=clockFixture(f);t.after(()=>{clock.restore();f.sql.close();});
  const {petId,boss}=legacy(f,options), original=f.sql.prepare('SELECT * FROM telegram_pet_weekly_boss_events ORDER BY event_key').all();
  const bad=options.badBackfill?f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='bad-old-first'").get():null;
  // Today's account equipment is deliberately newer than the original victory.
  f.sql.prepare("INSERT INTO telegram_pet_equipment_progression(telegram_id,item_key,slot,item_level,item_xp) VALUES(?,'moon_kibble','food',10,50)").run(f.owner);
  f.sql.prepare("UPDATE telegram_pet_instances SET equipped_food='moon_kibble' WHERE pet_id=?").run(petId);
  const accepted=await f.act({action:'weekly_boss',move:'strike',pet_id:petId,request_id:'recover-winner'});
  assert.equal(accepted.accepted,true); assert.equal(accepted.reward.accepted,true);
  const winner=f.sql.prepare("SELECT * FROM telegram_pet_events WHERE event_key='old-win'").get();
  assert.equal(winner.pet_id,petId);assert.equal(winner.season_key,sourceSeason);assert.equal(winner.day_key,'2026-10-01');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_identity_events WHERE event_key='old-win:memory' AND applied_at IS NOT NULL").get().n,1);
  assert.equal(finishes(f).length,1);
  assert.equal(JSON.parse(finishes(f)[0].payload_json).equipment_evidence,'unavailable');
  assert.equal(f.sql.prepare("SELECT item_xp FROM telegram_pet_equipment_progression WHERE item_key='moon_kibble'").get().item_xp,50,'no current gear bonus is invented');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_weekly_journey_objectives WHERE source_event_key='old-first'").get().n,options.badBackfill?1:0);
  const wrongWeek=await readWeeklyJourneyObjectiveProgress(f.db,{telegram_id:f.owner,pet_id:petId,season_key:sourceSeason,qualification_week:4});
  assert.equal(wrongWeek.results.length,0,'old unproven rows are retained but not counted');
  if(bad)assert.deepEqual(f.sql.prepare("SELECT * FROM telegram_pet_events WHERE id='bad-old-first'").get(),bad);
  const state=await f.state();assert.equal(state.guidance.weekly_boss.recovery_history[0].pet_id,petId);
  assert.equal(state.guidance.weekly_boss.recovery_history[0].week_key,week);
  const settled=ledger(f); await f.state();await f.state();
  assert.equal((await hooks.claimPetWeeklyBossReward(f.db,f.owner,{pet_id:petId,boss_id:boss.boss_id,week_key:week})).duplicate,true);
  assert.deepEqual(ledger(f),settled,'recovery cannot repay, replay memory or repeat specialist progress');
  const switched=await f.act({action:'switch_pet_slot',pet_id:'current-'+f.owner});assert.equal(switched.accepted,true);
  assert.deepEqual((await f.state()).guidance.weekly_boss.recovery_history,[],'audit history is bound to the displayed pet');
  assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_weekly_boss_events ORDER BY event_key').all(),original);
  assert.equal((await f.act({action:'delete_pet_slot',pet_id:petId,confirm_pet_id:petId,confirmed:true})).accepted,true);
  assert.equal(f.sql.prepare('SELECT status FROM telegram_pet_instances WHERE pet_id=?').get(petId).status,'archived');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='pet_weekly_boss' AND status='awarded'").get().n,1);
});

test('bounded state recovery backfills an older victory while another source pet is selected',async t=>{
  const f=fixture('955201'),clock=clockFixture(f);t.after(()=>{clock.restore();f.sql.close();});
  const {petId,boss}=legacy(f);
  f.pet('third-pet','pet-s2026-002',2000,3);f.active('third-pet','pet-s2026-002');clock.advance(7*86400000);
  const original=f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('third-pet').pet_xp;
  await f.state(); assert.equal(finishes(f).length,1);
  assert.equal(finishes(f)[0].pet_id,petId);assert.equal(finishes(f)[0].period_key,week);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_identity_events WHERE event_key='old-win:memory' AND applied_at IS NOT NULL").get().n,1);
  assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get('third-pet').pet_xp,original);
  const paid=await hooks.claimPetWeeklyBossReward(f.db,f.owner,{pet_id:petId,boss_id:boss.boss_id,week_key:week});assert.equal(paid.accepted,true);
  const after=ledger(f);await f.state();
  assert.equal((await hooks.claimPetWeeklyBossReward(f.db,f.owner,{pet_id:petId,boss_id:boss.boss_id,week_key:week})).duplicate,true);
  assert.deepEqual(ledger(f),after);
});

for(const [stage,mode] of [['backfill','ABORT'],['memory','ABORT'],['finish','ABORT'],['backfill','IGNORE'],['finish','IGNORE']]) test(`an actual SQLite ${mode} during ${stage} retries without double payout`,async t=>{
  const f=fixture('9553'+stage.length),clock=clockFixture(f);t.after(()=>{clock.restore();f.sql.close();});const {petId,boss}=legacy(f);
  const table={backfill:'telegram_pet_events',memory:'telegram_pet_identity_events',finish:'telegram_pet_system_events'}[stage];
  const condition={backfill:"NEW.event_key='old-win'",memory:"NEW.event_key='old-win:memory'",finish:"NEW.system_key='weekly_boss_finish'"}[stage];
  const failure=mode==='IGNORE' ? 'RAISE(IGNORE)' : `RAISE(ABORT,'interrupted_${stage}')`;
  f.sql.exec(`CREATE TRIGGER fail_recovery BEFORE INSERT ON ${table} WHEN ${condition} BEGIN SELECT ${failure}; END`);
  const result=await hooks.claimPetWeeklyBossReward(f.db,f.owner,{pet_id:petId,boss_id:boss.boss_id,week_key:week});
  assert.equal(result.accepted,true,'committed currency remains accepted');assert.equal(result.refresh_state,true);
  assert.equal(finishes(f).length,0);
  const wallet=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold;
  f.sql.exec('DROP TRIGGER fail_recovery');await f.state();
  assert.equal(finishes(f).length,1);
  assert.equal((await hooks.claimPetWeeklyBossReward(f.db,f.owner,{pet_id:petId,boss_id:boss.boss_id,week_key:week})).duplicate,true);
  assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,wallet);
});

for(const invalid of ['missing-attack','wrong-key','wrong-owner','wrong-season','invalid-day']) test(`${invalid} legacy evidence stays unassigned and cannot finish`,async t=>{
  const f=fixture('9554'+invalid.length),clock=clockFixture(f);t.after(()=>{clock.restore();f.sql.close();});const {petId,boss}=legacy(f);
  if(invalid==='missing-attack')f.sql.prepare("DELETE FROM telegram_pet_weekly_boss_events WHERE event_key='old-win'").run();
  if(invalid==='wrong-key')f.sql.prepare("UPDATE telegram_pet_weekly_boss_victories_by_pet SET victory_event_key='unproven'").run();
  if(invalid==='wrong-owner') {
    f.sql.prepare("INSERT INTO telegram_users(telegram_id,first_name) VALUES('another-account','Other')").run();
    f.sql.prepare("INSERT INTO telegram_pet_profiles(telegram_id) VALUES('another-account')").run();
    f.sql.prepare("UPDATE telegram_pet_weekly_boss_events SET telegram_id='another-account' WHERE event_key='old-win'").run();
  }
  if(invalid==='wrong-season') {
    // Simulate an inconsistent historical import; modern foreign keys already
    // prevent this relation, and runtime must also refuse it during recovery.
    f.sql.exec('PRAGMA foreign_keys=OFF');
    f.sql.prepare("UPDATE telegram_pet_weekly_boss_victories_by_pet SET season_key='pet-s2025-001'").run();
  }
  if(invalid==='invalid-day')f.sql.prepare("UPDATE telegram_pet_weekly_boss_events SET day_key='2026-02-30' WHERE event_key='old-win'").run();
  assert.equal(await ensureWeeklyBossVictoryEvent(f.db,f.owner,week,boss.boss_id),null);await f.state();
  assert.equal(finishes(f).length,0);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE event_type='weekly_boss'").get().n,0);
  const rejected=await recordWeeklyJourneyObjectiveEvidence(f.db,{telegram_id:f.owner,pet_id:petId,season_key:sourceSeason,
    qualification_week:4,objective_id:'weekly_boss_attempt',source_event_key:'old-first'});
  assert.equal(rejected.accepted,false);
  assert.equal((await f.act({action:'delete_pet_slot',pet_id:petId,confirm_pet_id:petId,confirmed:true})).reason,'pet_delete_blocked');
});

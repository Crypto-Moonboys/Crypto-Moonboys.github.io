import test from 'node:test';
import assert from 'node:assert/strict';
import { createPetStateTimings, measurePetDatabaseStage } from '../workers/moonboys-api/pets/state-timings.js';
import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';

test('database spans count calls and statements once without exposing SQL, binds or errors', async () => {
  const events = [], trace = createPetStateTimings({ emit: e => events.push(e) });
  const raw = [];
  const db = { prepare(sql) { return { bind(...args) { this.args=args; return this; }, async first() { return 7; }, async all() { throw Error('private-error'); } }; }, async batch(items) { raw.push(...items); return items.map(() => ({ results: [] })); } };
  await measurePetDatabaseStage(trace, 'boss_victory_recovery', db, async measured => {
    const s = measured.prepare('private-sql').bind('private-owner');
    assert.equal(await s.first(), 7);
    await measured.batch([s,s]);
    await assert.rejects(s.all(), /private-error/);
  });
  assert.equal(events[0].sql_statements, 4);
  assert.equal(events[0].d1_calls, 3);
  assert.equal(JSON.stringify(events).includes('private-'), false);
  assert.deepEqual(raw[0].args, ['private-owner']);
  await assert.rejects(measurePetDatabaseStage(trace, 'journey_source_recovery', db, d => d.prepare('secret').all()));
  assert.equal(events[1].outcome, 'failed');
  assert.equal(events[1].d1_calls, 1);
});

for (const pets of [1,3]) test(`recovery profiling ${pets} pets preserves rewards on retry and includes all queues`, async () => {
  const f = await performanceFixture({ pets });
  try {
    seedRecoveryEvidence(f, 20);
    const first = await f.measureHttp();
    // Care evidence has no boss-victory source. Its queue must now be skipped,
    // while actual Journey/runtime work remains observable and awaited.
    assert.equal(first.events.some(e=>e.stage==='boss_victory_recovery'),false);
    for (const stage of ['journey_source_recovery','daily_journey_award_recovery','weekly_journey_award_recovery','pet_state_projection']) {
      const event = first.events.find(e => e.stage === stage);
      assert.ok(event, stage);
      assert.ok(event.sql_statements >= event.d1_calls && event.d1_calls > 0);
    }
    const snapshot = () => ['telegram_pet_profiles','telegram_pet_weekly_journey_objectives','telegram_pet_growth_marks','telegram_pet_weekly_crests'].map(table => f.sql.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
    const before = snapshot();
    await f.measureHttp();
    assert.deepEqual(snapshot(), before);
  } finally { f.close(); }
});
import { PET_DAILY_CHALLENGES } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { PET_WEEKLY_JOURNEY_OBJECTIVES, recordWeeklyJourneyObjectiveEvidence } from '../workers/moonboys-api/pets/weekly-journey.js';

// Seed accepted persisted objectives, as an interrupted official Daily Run would
// leave them. This isolates award recovery; source gameplay has its own suite.
function qualifyingDaily(f, petId, season) {
  for (const [id, goal] of Object.entries(PET_DAILY_CHALLENGES).slice(0,3)) {
    const key = `qualifying-daily:${id}`;
    f.sql.prepare(`INSERT INTO telegram_pet_daily_journey_objectives
      (event_id,telegram_id,pet_id,season_key,utc_day,challenge_id,event_key,progress_value,status)
      VALUES (?,?,?,?,?,?,?,?, 'accepted')`).run(key,f.owner,petId,season,'2026-10-15',id,key,goal.target);
  }
}
async function qualifyingWeekly(f, petId, season) {
  const types = { weekly_care:'feed', weekly_training:'train', weekly_run:'run_complete', weekly_boss_attempt:'boss_fought', weekly_check_in:'check_in' };
  for (const [id, goal] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
    for (let n=0;n<goal.target;n++) {
      const key = `qualifying-weekly:${id}:${n}`, day = id==='weekly_check_in' && n===1 ? '2026-10-16':'2026-10-15';
      f.sql.prepare(`INSERT INTO telegram_pet_events
        (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
        VALUES (?,?,?,?,?,?,?,'2026-W42','accepted')`).run(key,petId,f.owner,types[id],key,season,day);
      const saved = await recordWeeklyJourneyObjectiveEvidence(f.db, {
        telegram_id:f.owner,pet_id:petId,season_key:season,qualification_week:3,objective_id:id,source_event_key:key,
      }, { defer_award:true });
      assert.equal(saved.accepted,true);
    }
  }
}
function pendingBoss(f, petId, season) {
  const week='2026-W40', boss=f.hooks.getPetWeeklyBoss(week);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_events
    (event_id,telegram_id,week_key,day_key,boss_id,event_key,action,damage,created_at)
    VALUES ('profile-win',?,?,'2026-10-01',?,'profile-win','strike',?,'2026-10-01T12:00:00.000Z')`).run(f.owner,week,boss.boss_id,boss.hp);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress
    (telegram_id,week_key,boss_id,damage,attempts,defeated_at)
    VALUES (?,?,?,?,1,'2026-10-01T12:00:00.000Z')`).run(f.owner,week,boss.boss_id,boss.hp);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet
    (telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
    VALUES (?,?,?,?,?,'profile-win','2026-10-01T12:00:00.000Z')`).run(f.owner,week,boss.boss_id,petId,season);
}
for (const pets of [1,3]) test(`timed HTTP settles qualifying Journeys and boss for ${pets===1?'active original':'archived original with another pet selected'}`, async () => {
  const f=await performanceFixture({pets}), petId='current-'+f.owner, season='pet-s2026-004';
  try {
    f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-10-01 00:00:00' WHERE pet_id=?").run(petId);
    qualifyingDaily(f,petId,season);
    await qualifyingWeekly(f,petId,season);
    pendingBoss(f,petId,season);
    if(pets===3) {
      f.active('fixture-space-2',season);
      for(const table of ['telegram_pet_instances','telegram_pet_season_slots']) f.sql.prepare(`UPDATE ${table} SET status='archived' WHERE pet_id=?`).run(petId);
    }
    const marks=()=>f.sql.prepare("SELECT * FROM telegram_pet_growth_marks WHERE milestone_type='daily_moon_run_milestone'").all();
    const crests=()=>f.sql.prepare("SELECT * FROM telegram_pet_weekly_crests WHERE objective_id='weekly_journey'").all();
    const finishes=()=>f.sql.prepare("SELECT * FROM telegram_pet_system_events WHERE system_key='weekly_boss_finish'").all();
    assert.equal(marks().length,0);assert.equal(crests().length,0);assert.equal(finishes().length,0);
    const first=await f.measureHttp();
    assert.equal(first.state.pet.pet_id,pets===1?petId:'fixture-space-2');
    assert.equal(marks().length,1);assert.equal(crests().length,1);assert.equal(finishes().length,1);
    for(const row of [...marks(),...crests(),...finishes()]) {
      assert.equal(row.telegram_id,f.owner);assert.equal(row.pet_id,petId);assert.equal(row.season_key,season);
    }
    assert.equal(marks()[0].earned_day,'2026-10-15');
    assert.equal(crests()[0].qualification_week,3);assert.equal(crests()[0].earned_at.slice(0,10),'2026-10-16');
    assert.equal(finishes()[0].period_key,'2026-W40');assert.equal(finishes()[0].status,'completed');
    for(const stage of ['boss_victory_recovery','daily_journey_award_recovery','weekly_journey_award_recovery']) {
      const span=first.events.find(e=>e.stage===stage);
      assert.equal(span.outcome,'completed');assert.ok(span.d1_calls>1,stage+' must execute settlement, not just scan an empty queue');
    }
    const snapshot=()=>['telegram_pet_growth_marks','telegram_pet_weekly_crests','telegram_pet_system_events','telegram_pet_reward_claims','telegram_pet_daily_journey_receipts','telegram_pet_weekly_journey_receipts','telegram_pet_memories','telegram_pet_specialist_progression'].map(table=>f.sql.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
    const settled=snapshot(), wallet=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles').get();
    await f.measureHttp();await f.measureHttp();
    assert.deepEqual(snapshot(),settled);
    assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles').get(),wallet);
  } finally {f.close();}
});

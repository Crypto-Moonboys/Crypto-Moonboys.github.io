import assert from 'node:assert/strict';
import test from 'node:test';
import { makeFixture } from './moonpet-worker-virtual-player.mjs';
import { getPetOwnershipPeriod, getPetJourneyWeek } from '../workers/moonboys-api/pets/ownership-period.js';
import { simulateWorkerCampaign,WORKER_YEAR_START,WORKER_YEAR_DAY_MS,WORKER_YEAR_TARGETS } from './moonpet-worker-year-simulator.mjs';

test('week 14: real Worker care event persists a permanent-pet qualification week beyond legacy limit',async t=>{
  t.mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
  const f=makeFixture(()=>Date.now());
  try{
    const p=f.createPlayer('virtual-permanent-week14');
    const ownership=f.sql.prepare('SELECT season_key,created_at,journey_clock FROM telegram_pet_season_slots WHERE pet_id=?').get(p.petId);
    assert.equal(ownership.journey_clock,'created_at','a newly adopted pet must use its own saved creation date, not legacy quarter weeks');
    const period=getPetOwnershipPeriod(ownership.season_key,ownership.created_at,ownership.journey_clock);
    const week14At=WORKER_YEAR_START+13*7*WORKER_YEAR_DAY_MS+60_000;
    assert.equal(getPetJourneyWeek(period,new Date(week14At)),14,'week 14 must follow exactly 13 full ownership weeks');
    t.mock.timers.setTime(week14At);
    const result=await f.action(p.owner,'feed',{request_id:'year-week14-source-feed'});
    assert.equal(result.accepted,true,JSON.stringify(result));
    const source=f.sql.prepare("SELECT event_type,day_key,pet_id FROM telegram_pet_events WHERE telegram_id=? AND event_type='feed' AND status='accepted' ORDER BY rowid DESC LIMIT 1").get(p.owner);
    assert.equal(source?.day_key,new Date(week14At).toISOString().slice(0,10),'real Worker must save the source action on the simulated UTC day');
    assert.equal(source?.pet_id,p.petId);
    const rows=f.sql.prepare(`SELECT qualification_week,objective_id,status FROM telegram_pet_weekly_journey_objectives
      WHERE pet_id=? ORDER BY qualification_week DESC`).all(p.petId);
    assert.ok(rows.some(row=>row.qualification_week===14 && row.objective_id==='weekly_care' && row.status==='accepted'),
      'permanent pet must accept genuine Worker evidence in week 14: '+JSON.stringify({ownership,week14At:new Date(week14At).toISOString(),source,rows}));
    const tableNames=['telegram_pet_weekly_journey_objectives','telegram_pet_weekly_journey_receipts','telegram_pet_weekly_crests'];
    for(const table of tableNames){
      const ddl=f.sql.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get('table',table)?.sql;
      assert.ok(ddl,'missing migrated table '+table);
      assert.doesNotMatch(ddl,/qualification_week\s+INTEGER[^,]*BETWEEN\s+1\s+AND\s+13/i,
        'legacy 13-week schema cap must be lifted: '+table);
    }
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_weekly_crests WHERE pet_id=?').get(p.petId).n,0,
      'one care action alone must not award a Crest');
  }finally{f.close();t.mock.timers.reset();}
});


test('legacy-quarter pet preserves the real quarter boundary for week 14 after migration 085',async t=>{
  t.mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
  const f=makeFixture(()=>Date.now());
  try{
    const pet=f.createPlayer('virtual-legacy-quarter-week14');
    // Explicit fixture-only legacy pet, as opposed to newly adopted pets.
    // No XP, Crest, event, or timestamp is pre-awarded.
    f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='legacy_quarter' WHERE pet_id=?").run(pet.petId);
    const slot=f.sql.prepare('SELECT season_key,created_at,journey_clock FROM telegram_pet_season_slots WHERE pet_id=?').get(pet.petId);
    const period=getPetOwnershipPeriod(slot.season_key,slot.created_at,slot.journey_clock);
    const quarterEnd=Date.parse(period.legacy_end_at);
    assert.ok(Number.isFinite(quarterEnd),'legacy quarter must have saved season end');
    const boundary=quarterEnd+60_000;
    assert.equal(getPetJourneyWeek(period,new Date(boundary)),14);
    t.mock.timers.setTime(boundary);
    const result=await f.action(pet.owner,'feed',{request_id:'legacy-week14-worker-care'});
    assert.equal(result.accepted,true,JSON.stringify(result));
    const rows=f.sql.prepare("SELECT qualification_week FROM telegram_pet_weekly_journey_objectives WHERE pet_id=? AND objective_id='weekly_care' AND status='accepted'").all(pet.petId);
    assert.ok(rows.some(row=>row.qualification_week===14),
      'legacy-quarter pet must earn authentic week-14 source evidence after migration 085: '+JSON.stringify({slot,quarterEnd:new Date(quarterEnd).toISOString(),rows}));
  }finally{f.close();t.mock.timers.reset();}
});

test('short real Worker calendar runs and never fabricates Legendary',async t=>{
  t.mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
  try{
    const result=await simulateWorkerCampaign({days:2,startAt:WORKER_YEAR_START,
      owner:'virtual-two-day-real-worker',setTime:at=>t.mock.timers.setTime(at)});
    assert.equal(result.days,2);
    assert.equal(result.final.verifiedFromWorkerPersistedRows,true);
    assert.equal(result.legendaryVerified,false);
    assert.ok(result.actions.accepted>0);
    assert.equal(result.actions.attempts,result.actions.accepted+result.actions.rejected);
    assert.equal(result.dailyRuns.started<=2,true);
    assert.equal(result.final.growthMarks,result.final.distinctGrowthDays);
    assert.equal(result.final.weeklyCrests,result.final.distinctQualificationWeeks);
    assert.equal(result.final.relics,result.final.distinctRelics);
    console.log('MOONPET_TWO_DAY_WORKER_TRACE',JSON.stringify(result));
  }finally{t.mock.timers.reset();}
});

test('14-day real Worker weekly boss attempt reaches genuine Weekly Journey evidence',async t=>{
  t.mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
  try{
    const result=await simulateWorkerCampaign({days:14,startAt:WORKER_YEAR_START,
      owner:'virtual-two-week-weekly-boss',
      setTime:at=>t.mock.timers.setTime(at)});
    assert.equal(result.actions.attempts,result.actions.accepted+result.actions.rejected);
    assert.ok(result.weeklyBoss.previews>=14,'every simulated UTC day checks boss eligibility');
    const weeks=Object.values(result.final.weeklyByWeek);
    const bossEvidence=weeks.reduce((sum,week)=>sum+(week.weekly_boss_attempt?.progress||0),0);
    const checkIns=weeks.reduce((sum,week)=>sum+(week.weekly_check_in?.progress||0),0);
    const training=weeks.reduce((sum,week)=>sum+(week.weekly_training?.progress||0),0);
    assert.ok(training>=3 && checkIns>=2,'care and check-in source receipts must survive within their ownership week');
    assert.ok(result.weeklyBoss.accepted>=1,
      'at least one legal Weekly Boss action must be accepted after reaching level five: '+JSON.stringify(result.weeklyBoss));
    assert.ok(bossEvidence>=1,
      'accepted Weekly Boss action must yield genuine source-backed Weekly Journey evidence: '+JSON.stringify({boss:result.weeklyBoss,weeks:result.final.weeklyByWeek}));
    assert.deepEqual(result.final.fullyQualifiedButUnsettledWeeks,[],
      'Worker must persist one Crest for every genuinely 5/5 qualified week: '+JSON.stringify({
        qualified:result.final.qualifyingWeeks,sourceEvidence:result.final.weeklyByWeek,
      }));
    console.log('MOONPET_TWO_WEEK_WEEKLY_OBJECTIVE_EVIDENCE',JSON.stringify({
      boss:result.weeklyBoss,weeks:result.final.weeklyByWeek,crests:result.final.weeklyCrests,
      runs:result.dailyRuns,marks:result.final.growthMarks,
    }));
  }finally{t.mock.timers.reset();}
});

test('opt-in real Worker 7/30/90/365-day same-pet campaign; no fabricated progression',async t=>{
  const days=Number(process.env.MOONPET_WORKER_YEAR_DAYS||0);
  if(!days) return t.skip('set MOONPET_WORKER_YEAR_DAYS=365 to run full real-Worker gameplay');
  assert.ok(Number.isInteger(days)&&days>=7&&days<=365);
  t.mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
  try{
    const result=await simulateWorkerCampaign({
      days,startAt:WORKER_YEAR_START,owner:'year-simulation-player',
      setTime:at=>t.mock.timers.setTime(at),
    });
    assert.ok(result.actions.accepted>0);
    assert.equal(result.actions.attempts,result.actions.accepted+result.actions.rejected);
    assert.equal(result.final.growthMarks,result.final.distinctGrowthDays);
    assert.equal(result.final.weeklyCrests,result.final.distinctQualificationWeeks);
    assert.equal(result.final.relics,result.final.distinctRelics);
    assert.ok(result.final.growthMarks<=days);
    assert.ok(result.final.weeklyCrests<=Math.ceil(days/7)+1);
    if(days<365)assert.equal(result.legendaryVerified,false);
    if(days===365) {
      assert.equal(result.targets.marks,WORKER_YEAR_TARGETS.marks);
      assert.equal(result.targets.crests,WORKER_YEAR_TARGETS.crests);
      assert.equal(result.targets.relics,WORKER_YEAR_TARGETS.relics);
      console.log('MOONPET_365_DAY_REAL_WORKER_RESULT',JSON.stringify(result));
    }else console.log('MOONPET_WORKER_CAMPAIGN_RESULT',JSON.stringify(result));
  }finally{t.mock.timers.reset();}
});

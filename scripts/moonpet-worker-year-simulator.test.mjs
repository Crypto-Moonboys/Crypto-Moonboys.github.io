import assert from 'node:assert/strict';
import test from 'node:test';
import { makeFixture } from './moonpet-worker-virtual-player.mjs';
import { simulateWorkerCampaign,WORKER_YEAR_START,WORKER_YEAR_DAY_MS,WORKER_YEAR_TARGETS } from './moonpet-worker-year-simulator.mjs';

test('week 14: real Worker care event persists a permanent-pet qualification week beyond legacy limit',async t=>{
  t.mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
  const f=makeFixture(()=>Date.now());
  try{
    const p=f.createPlayer('virtual-permanent-week14');
    t.mock.timers.setTime(WORKER_YEAR_START+13*7*WORKER_YEAR_DAY_MS+60_000);
    const result=await f.action(p.owner,'feed',{request_id:'year-week14-source-feed'});
    assert.equal(result.accepted,true,JSON.stringify(result));
    const rows=f.sql.prepare(`SELECT qualification_week,objective_id,status FROM telegram_pet_weekly_journey_objectives
      WHERE pet_id=? ORDER BY qualification_week DESC`).all(p.petId);
    assert.ok(rows.some(row=>row.qualification_week===14 && row.objective_id==='weekly_care' && row.status==='accepted'),
      'permanent pet must accept genuine Worker evidence in week 14');
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

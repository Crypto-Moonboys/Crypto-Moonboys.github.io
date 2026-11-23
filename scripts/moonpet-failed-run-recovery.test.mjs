import assert from 'node:assert/strict';
import test from 'node:test';
import { nextFailedRunOpportunity } from './moonpet-failed-run-recovery.js';

const failed = Object.freeze({
  run_id:'daily:2026-11-10:virtual-test',
  pet_id:'virtual-source-pet', telegram_id:'virtual-test',
  status:'failed', depth:9, score:728,
});

test('failure stays terminal; next-day candidate cannot grant progress',()=>{
  const before=structuredClone(failed);
  const plan=nextFailedRunOpportunity({
    run:failed,dayKey:'2026-11-10',now:'2026-11-10T23:59:59.000Z',
    choiceKeys:['challenge','rest','trade'],lastChoiceKey:'challenge',
  });
  assert.equal(plan.terminalStatus,'failed');
  assert.equal(plan.terminalDepth,9);
  assert.equal(plan.terminalScore,728);
  assert.equal(plan.nextEligibleUtcDay,'2026-11-11');
  assert.equal(plan.suggestedChoice,'rest');
  assert.equal(plan.mayAttemptNewDay,false);
  assert.equal(plan.authoritativeEligibilityVerified,false);
  assert.equal(plan.rewardsAwarded,0);
  assert.equal(plan.marksAwarded,0);
  assert.equal(plan.crestsAwarded,0);
  assert.deepEqual(failed,before,'failed official run must not be rewritten');
  assert.equal(nextFailedRunOpportunity({run:failed,dayKey:'2026-11-10',now:'2026-11-11T00:00:00Z'}).mayAttemptNewDay,true);
});

test('calendar rollover and empty choices fail safe',()=>{
  const plan=nextFailedRunOpportunity({run:failed,dayKey:'2026-12-31',now:'2027-01-01T01:00:00Z'});
  assert.equal(plan.nextEligibleUtcDay,'2027-01-01');
  assert.equal(plan.suggestedChoice,null);
  assert.equal(plan.authoritativeEligibilityVerified,false);
});

test('no new attempt for nonfailed run, invalid ownership or invalid day',()=>{
  assert.equal(nextFailedRunOpportunity({run:{...failed,status:'completed'},dayKey:'2026-11-10'}),null);
  assert.throws(()=>nextFailedRunOpportunity({run:{...failed,pet_id:''},dayKey:'2026-11-10'}),/failed_run_source_required/);
  assert.throws(()=>nextFailedRunOpportunity({run:failed,dayKey:'2026-02-30'}),/invalid_utc_day/);
});

test('rotated suggestion remains advisory, including repeated choice lists',()=>{
  const plan=nextFailedRunOpportunity({run:failed,dayKey:'2026-11-10',choiceKeys:['a','a','b'],lastChoiceKey:'b'});
  assert.equal(plan.suggestedChoice,'a');
  assert.equal(plan.authoritativeEligibilityVerified,false);
});

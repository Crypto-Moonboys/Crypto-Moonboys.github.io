import test from 'node:test';
import assert from 'node:assert/strict';
import {selectConservativeDailyChoice,summarizeLegalRunProgress} from './moonpet-run-risk-policy.mjs';

test('select only a Worker-advertised legal choice with highest documented chance',()=>{
  const choice=selectConservativeDailyChoice([
    {key:'fight',success_chance_bps:7100},
    {key:'search',success_chance_bps:9200},
    {key:'escape',success_chance_bps:9950,available:false},
  ]);
  assert.equal(choice.key,'search');
  assert.equal(choice.advertisedChanceBps,9200);
  assert.equal(choice.guaranteedSuccess,false);
});
test('missing chance is not converted into invented high-confidence odds',()=>{
  assert.equal(selectConservativeDailyChoice([{key:'blind'},{key:'shown',success_chance_bps:5000}]).key,'shown');
  assert.equal(selectConservativeDailyChoice([{key:'blind'}]).previewAvailable,false);
  assert.equal(selectConservativeDailyChoice([]),null);
});
test('mark and Crest projection exposes 90-day bottleneck without treating forecast as earned evidence',()=>{
  const result=summarizeLegalRunProgress({days:90,marks:18,crests:0,completedRuns:18,failedRuns:72});
  assert.equal(result.marksRemaining,222);
  assert.equal(result.crestsRemaining,44);
  assert.equal(result.projected365Marks,73);
  assert.equal(result.projected365Crests,0);
  assert.equal(result.legendaryProven,false);
});
test('perfect theoretical marks and weeks are still not proof of Legendary',()=>{
  const r=summarizeLegalRunProgress({days:365,marks:240,crests:44,completedRuns:240,failedRuns:125});
  assert.equal(r.marksRemaining,0);
  assert.equal(r.crestsRemaining,0);
  assert.equal(r.legendaryProven,false);
  assert.throws(()=>summarizeLegalRunProgress({days:90,marks:-1,crests:0,completedRuns:0,failedRuns:0}),/invalid_marks/);
});

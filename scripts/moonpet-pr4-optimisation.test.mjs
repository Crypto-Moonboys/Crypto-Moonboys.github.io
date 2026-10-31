import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery } from './moonpet-pr3-fixture.mjs';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/moonpet-pr4-baseline.json',import.meta.url)));
const current=JSON.parse(readFileSync(new URL('./fixtures/moonpet-pr3-current-response-parity.json',import.meta.url)));
const currentByScenario=new Map(current.cases.map(item=>[item.scenario,item]));
assert.deepEqual([...currentByScenario.keys()].sort(),baseline.cases.filter(item=>item.scenario!=='zero').map(item=>item.scenario).sort(),
  'PR4 nonzero parity must cover all current response scenarios');
for(const expected of baseline.cases)test('PR4 full first/retry response and saved state parity: '+expected.scenario,()=>{
 const actual=JSON.parse(execFileSync(process.execPath,['scripts/moonpet-pr4-parity-case.mjs',expected.scenario],{encoding:'utf8'}));
 // Keep PR4's original persistent-data baseline immutable. Only the historical
 // signed response projection hashes have drifted on main since this snapshot.
 for(const key of ['first_persisted_hash','retry_persisted_hash'])assert.equal(actual[key],expected[key],key);
 const responseExpected=expected.scenario==='zero'?expected:currentByScenario.get(expected.scenario);
 assert.ok(responseExpected,'missing_current_PR4_response_contract');
 for(const key of ['first_response_hash','retry_response_hash'])assert.equal(actual[key],responseExpected[key],key);
 assert.equal(actual.first_response_hash,actual.retry_response_hash,'stable_signed_retry_response');
 assert.equal(actual.first_persisted_hash,actual.retry_persisted_hash,'stable_saved_retry_state');
 for(const request of ['first','second']){assert.ok(actual[request].calls<=expected[request].calls-(expected.scenario==='zero'?0:15));assert.ok(actual[request].statements<=expected[request].statements+(expected.scenario==='zero'?0:1));}
});
const targets=['SELECT event_type, COUNT(*) AS count','SELECT COUNT(*) AS count\n      FROM telegram_pet_system_events','SELECT season_xp FROM','SELECT season_key, season_xp FROM','SELECT idempotency_key, COALESCE','SELECT boss_id, attempts','SELECT action, damage','SELECT pet_id,season_key,period_key AS week_key','SELECT event_type, COUNT(*) AS total','SELECT source, idempotency_key, pet_id','SELECT p.status,l.phase','SELECT asset_key,quantity','SELECT material_key,quantity','SELECT event_type,COUNT(*) AS total','SELECT idempotency_key FROM telegram_pet_reward_claims','SELECT COUNT(*) AS total FROM telegram_pet_system_events'];
for(const failure of ['throw','resolved','malformed'])test('PR4 mandatory grouped reads fail closed: '+failure,async()=>{
 for(const target of targets){const f=await performanceFixture();let hit=false;try{const before=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles').get();f.db.beforeBatch=entries=>{if(!hit&&entries.some(s=>s.query.includes(target))){hit=true;if(failure==='throw')throw Error('injected_d1_failure');}};const original=f.db.batch;f.db.batch=async entries=>{const result=await original(entries);if(hit&&failure!=='throw'){const i=entries.findIndex(s=>s.query.includes(target));if(i>=0)result[i]=failure==='resolved'?{success:false,results:[]}:{success:true,results:null};}return result;};await assert.rejects(f.state(),/injected_d1_failure|pet_state_read_unavailable/);assert.equal(hit,true,target);assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles').get(),before);}finally{await new Promise(resolve=>setTimeout(resolve,10));f.close();}}
});
test('PR4 economy batch detects in-flight switch and permits only a fresh new-pet request',async()=>{
 const f=await performanceFixture({pets:3});try{let hit=false;f.db.beforeBatch=entries=>{if(!hit&&entries.some(s=>s.query.includes('SELECT p.status,l.phase'))){hit=true;f.active('fixture-space-2','pet-s2026-004');}};await assert.rejects(f.state(),/pet_state_source_changed/);assert.equal(hit,true);f.db.beforeBatch=null;const state=await f.state();assert.equal(state.pet.pet_id,'fixture-space-2');assert.equal(state.season_slots.active_pet_id,state.pet.pet_id);}finally{f.close();}
});
test('PR4 concurrently initiated heavy refreshes preserve receipts, wallet and original-pet attribution',async()=>{
 const f=await performanceFixture({pets:3});try{await seedPr3Recovery(f,{archived:true});const initial=await Promise.allSettled([f.state(),f.state()]);for(const result of initial)if(result.status==='rejected')assert.match(result.reason.message,/pet_state_source_changed/);await f.state();const tables=['telegram_pet_reward_claims','telegram_pet_growth_marks','telegram_pet_weekly_crests','telegram_pet_profiles','telegram_pet_instances','telegram_pet_season_slots'];const saved=()=>Object.fromEntries(tables.map(t=>[t,f.sql.prepare('SELECT * FROM '+t+' ORDER BY 1').all()]));const before=saved();await Promise.all([f.state(),f.state()]);assert.deepEqual(saved(),before);const duplicate=f.sql.prepare('SELECT source,idempotency_key,COUNT(*) AS n FROM telegram_pet_reward_claims GROUP BY telegram_id,source,idempotency_key HAVING COUNT(*)>1').all();assert.deepEqual(duplicate,[]);}finally{f.close();}
});

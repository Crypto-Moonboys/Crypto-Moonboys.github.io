import assert from 'node:assert/strict';
import test from 'node:test';
import {performanceFixture} from './moonpet-state-performance-fixture.mjs';
import {httpAction} from './moonpet-audit-regression-fixture.mjs';
import {savedProgress} from './moonpet-sandbox-players.mjs';

for(const longSession of [false,true])test('1,000 signed replays: '+(longSession?'40-minute session':'rate-limited burst'),async()=>{
 const f=await performanceFixture({pets:3,serializedWrites:true,owner:longSession?'980902':'980901'});
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('sandbox_outbound_disabled');};
 try{
  if(longSession)f.advance(61000); // Next rate-limit window after the preceding burst.
  const action={action:'feed',request_id:'sandbox-fixed-feed'};
  const first=await httpAction(f,action);assert.equal(first.body.result.accepted,true);
  // Care naturally decays as the clock advances. Compare permanent progression exactly.
  const progression=()=>{const save=savedProgress(f);if(!longSession)return save;
   for(const user of save.telegram_users){assert.equal(user.updated_at,new Date().toISOString().replace('T',' ').slice(0,19));user.updated_at='<verified-auth-activity-time>';}
   for(const table of ['telegram_pet_instances','telegram_pet_profiles'])save[table]=save[table].map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['hunger','energy','happiness','cleanliness','health','last_decay_at','updated_at'].includes(key))));return save;};
  const before=progression(), pages=f.sql.prepare('PRAGMA page_count').get().page_count;
  const started=performance.now();let duplicates=0,throttled=0;
  for(let batch=0;batch<200;batch++){
   if(longSession && batch && batch%5===0) f.advance(61000);
   const responses=await Promise.all(Array.from({length:5},()=>httpAction(f,action)));
   for(const r of responses){if(r.status===429){assert.equal(r.body.error,'rate_limited');assert.ok(r.body.retry_after_seconds>0);throttled++;}else{assert.equal(r.status,200);assert.equal(r.body.result.duplicate,true);duplicates++;}}
   assert.deepEqual(progression(),before);
  }
  assert.deepEqual(progression(),before);
  assert.equal(f.sql.prepare('PRAGMA page_count').get().page_count,pages,'replays must not grow the database');
  if(longSession){assert.equal(throttled,0);assert.equal(duplicates,1000);}else{assert.ok(throttled>0);assert.ok(duplicates>0);}
  const full=await f.measureHttp();assert.equal(full.state.pet.pet_xp,before.telegram_pet_profiles[0].pet_xp);
  assert.equal(full.state.hydration.full,true);
  console.log('SANDBOX_STRESS '+JSON.stringify({longSession,requests:1000,duplicates,throttled,parallel:5,duration_ms:Math.round(performance.now()-started),sqlite_pages:pages,progression_unchanged:true}));
 }finally{globalThis.fetch=originalFetch;await f.drain();f.close();}
});

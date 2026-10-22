import assert from 'node:assert/strict';
import test from 'node:test';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { httpAction } from './moonpet-audit-regression-fixture.mjs';
import { buildPetLiveSystemsState } from '../workers/moonboys-api/pets/live-systems.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const guidanceRead = s => /SELECT event_type, COUNT\(\*\) AS total FROM telegram_pet_events/.test(s.query);

test('PR8 full HTTP starts independent modules while guidance is blocked', {timeout:5000}, async () => {
  const f = await performanceFixture({ serializedWrites:true });
  const blocked = deferred(), release = deferred(), seen = new Set();
  let projecting=false;
  const observe = async s => {
    if(s.query.includes('AS economic_snapshot')) projecting=true;
    if(!projecting)return;
    for (const table of ['telegram_pet_style_loadouts','telegram_pet_house_layouts','telegram_pet_contracts','telegram_pet_event_chain_progress','telegram_pet_weekly_journey_receipts']) {
      if (s.query.includes(table)) seen.add(table);
    }
    if (guidanceRead(s)) { blocked.resolve(); await release.promise; }
  };
  f.db.beforeFirst = observe; f.db.beforeAll = observe;
  const request = f.measureHttp();
  try {
    await blocked.promise; await turn();
    assert.equal(seen.size,5,'presentation, live and journey reads must not wait for guidance');
    release.resolve();
    const {state} = await request;
    assert.equal(state.hydration.full,true);
    assert.equal(state.pet.pet_id,'current-'+f.owner);
    assert.ok(state.live_systems && state.contracts && state.weekly_journey);
  } finally { release.resolve(); await request.catch(()=>{}); f.close(); }
});

test('PR8 live progression initialization does not block unrelated owned-source reads',{timeout:5000},async()=>{
  const f=await performanceFixture(); const blocked=deferred(), release=deferred(); let chains=false;
  try {
    const state=await f.state();
    f.db.beforeRun=async s=>{if(s.query.includes('INSERT OR IGNORE INTO telegram_pet_live_progression_state')){blocked.resolve();await release.promise;}};
    f.db.beforeAll=async s=>{if(s.query.includes('FROM telegram_pet_event_chain_progress'))chains=true;};
    const request=buildPetLiveSystemsState(f.db,f.owner,state.pet,state.progress,state.gear,[],new Date());
    try { await blocked.promise;await turn();assert.equal(chains,true); }
    finally {release.resolve();await request;}
  }finally{release.resolve();f.close();}
});

for(const failure of ['throw','resolved'])test('PR8 mandatory early contract failure rejects complete signed HTTP: '+failure,{timeout:5000},async()=>{
  const f=await performanceFixture();
  try {
    const before=f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_profiles').get();
    f.db.beforeAll=async s=>{if(s.query.includes('SELECT c.contract_id,c.pet_id,c.season_key,c.reward_day')){if(failure==='throw')throw Error('fixture unavailable');return {success:false};}};
    await assert.rejects(f.measureHttp(),/performance_fixture_http_503/);
    // Production has already settled sibling mutations before returning 503.
    f.db.beforeAll=null;
    const result=await f.measureHttp();assert.equal(result.state.hydration.full,true);
    assert.deepEqual(f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_profiles').get(),before);
  }finally{f.close();}
});

test('PR8 signed care during slow full projection invalidates stale state and exact retry cannot pay twice',{timeout:5000},async()=>{
  const f=await performanceFixture({pets:3,serializedWrites:true});
  const blocked=deferred(),release=deferred();let once=true;
  f.db.beforeAll=async s=>{if(once&&guidanceRead(s)){once=false;blocked.resolve();await release.promise;}};
  const request=f.measureHttp();const rejected=assert.rejects(request,/performance_fixture_http_503/);
  try {
    await blocked.promise;
    const body={action:'feed',request_id:'pr8-care-race'};
    const first=await httpAction(f,body);assert.equal(first.status,200);assert.equal(first.body.result.accepted,true);
    const after=f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_profiles').get();
    const retry=await httpAction(f,body);assert.equal(retry.status,200);assert.equal(retry.body.result.duplicate,true);
    assert.deepEqual(f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_profiles').get(),after);
    release.resolve();await rejected;
    const fresh=await f.measureHttp();assert.equal(fresh.state.pet.pet_xp,after.pet_xp);
    assert.equal(fresh.state.pet.moon_gold,after.moon_gold);
    assert.equal(fresh.state.season_slots.slots.filter(s=>s.unlocked).length,3);
  }finally{release.resolve();await rejected;f.close();}
});

test('PR8 latency model serializes complete writes while allowing independent reads',{timeout:5000},async()=>{
  const f=await performanceFixture({serializedWrites:true,delayMs:5});
  const blocked=deferred(),release=deferred();let writes=0;
  try {
    f.db.beforeRun=async()=>{writes++;if(writes===1){blocked.resolve();await release.promise;}};
    const one=f.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=moon_gold+1 WHERE telegram_id=?').bind(f.owner).run();
    await blocked.promise;
    const two=f.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=moon_gold+1 WHERE telegram_id=?').bind(f.owner).run();
    assert.equal((await f.db.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').bind(f.owner).first()).moon_gold,1000);
    assert.equal(writes,1,'queued second write must not enter before the first finishes');
    release.resolve();await Promise.all([one,two]);
    assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,1002);
  }finally{release.resolve();await f.drain();f.close();}
});

for(const held of ['runtime','achievement','live'])test('PR8 failed signed request settles '+held+' writes before returning 503',{timeout:5000},async()=>{
  const f=await performanceFixture();const blocked=deferred(),release=deferred();let settled=false;
  const query={runtime:'INSERT OR IGNORE INTO telegram_pet_specialist_progression',achievement:'INSERT INTO telegram_pet_achievements',live:'INSERT OR IGNORE INTO telegram_pet_live_progression_state'}[held];
  f.db.beforeRun=async s=>{if(s.query.includes(query)){blocked.resolve();await release.promise;}};
  f.db.beforeAll=async s=>{if(s.query.includes('SELECT c.contract_id,c.pet_id,c.season_key,c.reward_day'))throw Error('mandatory contract unavailable');};
  const request=f.measureHttp();const rejection=assert.rejects(request,/performance_fixture_http_503/).then(()=>{settled=true;});
  try {
    await blocked.promise;await turn();
    assert.equal(settled,false,'503 must wait for mutation-bearing sibling, without a fixture drain');
    release.resolve();await rejection;
    f.db.beforeRun=null;f.db.beforeAll=null;
    assert.equal((await f.measureHttp()).state.hydration.full,true,'immediate retry is safe');
  }finally{release.resolve();await rejection;f.close();}
});

test('PR8 live read failure waits for its in-flight progression initialization',{timeout:5000},async()=>{
  const f=await performanceFixture();const blocked=deferred(),release=deferred();let settled=false;
  try {
    const state=await f.state();
    f.db.beforeRun=async s=>{if(s.query.includes('INSERT OR IGNORE INTO telegram_pet_live_progression_state')){blocked.resolve();await release.promise;}};
    f.db.beforeAll=async s=>{if(s.query.includes('FROM telegram_pet_event_chain_progress'))throw Error('chains unavailable');};
    const request=buildPetLiveSystemsState(f.db,f.owner,state.pet,state.progress,state.gear,[],new Date());
    const rejection=assert.rejects(request,/chains unavailable/).then(()=>{settled=true;});
    try{await blocked.promise;await turn();assert.equal(settled,false);}
    finally{release.resolve();await rejection;}
  }finally{release.resolve();f.close();}
});

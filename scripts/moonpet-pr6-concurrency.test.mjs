import assert from 'node:assert/strict';
import test from 'node:test';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { createDisplayedPetScope } from '../workers/moonboys-api/pets/displayed-pet-scope.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
for (const explicit of [false, true]) test('PR6 overlapping reads drain before '+(explicit ? 'explicit batch' : 'mutation')+' and later reads wait', async () => {
  const f = await performanceFixture();
  try {
    const scope = createDisplayedPetScope(f.db, f.owner, 'current-'+f.owner, 'pet-s2026-004', { coalesceReads:true, concurrentReads:true });
    const original = f.db.batch, started = [], releases = [];
    f.db.batch = async entries => {
      started.push(entries[0].query);
      await new Promise(resolve => releases.push(resolve));
      return original(entries);
    };
    const q = () => scope.singleReads.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').bind(f.owner).first('moon_gold');
    const one = q(), two = q();
    await turn();
    assert.equal(started.length,2,'read network waits must overlap');
    const update = scope.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=moon_gold+1 WHERE telegram_id=?').bind(f.owner);
    const write = explicit ? scope.db.batch([update]) : update.run();
    const later = q();
    await turn(); assert.equal(started.length,2);
    releases[1](); await turn(); assert.equal(started.length,2,'must drain every read');
    releases[0](); assert.deepEqual(await Promise.all([one,two]),[1000,1000]);
    await turn(); assert.equal(started.length,3);
    releases[2](); await write;
    await turn(); assert.equal(started.length,4);
    releases[3](); assert.equal(await later,1001);
  } finally { f.close(); }
});

test('PR6 stale concurrent reader blocks a queued write even after active pet switches back',async()=>{
  const f=await performanceFixture({pets:3});
  try {
    const scope=createDisplayedPetScope(f.db,f.owner,'current-'+f.owner,'pet-s2026-004',{concurrentReads:true});
    const original=f.db.batch;let release;
    f.db.batch=async entries=>{await new Promise(resolve=>{release=resolve;});return original(entries);};
    const read=scope.db.prepare('SELECT 1').first();
    const failure=assert.rejects(read,/moonpet_displayed_pet_changed/);
    await turn(); f.active('fixture-space-2','pet-s2026-004'); release(); await failure;
    f.active('current-'+f.owner,'pet-s2026-004');
    await assert.rejects(scope.db.prepare('UPDATE telegram_pet_profiles SET moon_gold=0').run(),/moonpet_displayed_pet_changed/);
    assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles').get().moon_gold,1000);
  } finally { f.close(); }
});

const {readFileSync}=await import('node:fs');
const {execFileSync}=await import('node:child_process');
const coreBaseline=JSON.parse(readFileSync(new URL('./fixtures/moonpet-pr6-core-baseline.json',import.meta.url)));
for(const expected of coreBaseline)test('PR6 core signed first/retry response and persistence parity: '+expected.scenario,()=>{
  const actual=JSON.parse(execFileSync(process.execPath,['scripts/moonpet-pr4-parity-case.mjs',expected.scenario,process.cwd(),'core'],{encoding:'utf8'}));
  for(const key of ['first_response_hash','first_persisted_hash','retry_response_hash','retry_persisted_hash'])assert.equal(actual[key],expected[key],key);
});

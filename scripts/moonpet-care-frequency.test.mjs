import {readPetInstanceWithAtomicCareDecay} from '../workers/moonboys-api/pets/care-decay.js';
import assert from 'node:assert/strict';
import {fixture,clockFixture,hooks,httpAction} from './moonpet-audit-regression-fixture.mjs';
const outcomes=[];
for(const step of [10,60,3600]){
 const f=fixture('care-refresh-'+step);const clock=clockFixture(f);const id='current-'+f.owner;
 for(const table of ['telegram_pet_instances','telegram_pet_profiles']) f.sql.prepare(`UPDATE ${table} SET hunger=0,happiness=100,cleanliness=100,energy=100,health=100,last_decay_at=?,updated_at=?`).run(clock.now(),clock.now());
 for(let second=step;second<=3600;second+=step){clock.advance(step*1000);await readPetInstanceWithAtomicCareDecay(f.db,{pet_id:id},new Date());}
 const row=f.sql.prepare('SELECT hunger,happiness,cleanliness,energy,health,last_decay_at FROM telegram_pet_instances WHERE pet_id=?').get(id);
 outcomes.push({refresh_seconds:step,...row});clock.restore();f.sql.close();
}

for(const outcome of outcomes){for(const stat of ['hunger','happiness','cleanliness','energy','health'])assert.ok(Math.abs(outcome[stat]-outcomes.at(-1)[stat])<1e-8, `${stat} must not depend on read frequency`);}
assert.ok(Math.abs(outcomes[0].hunger-4.5)<1e-8);assert.ok(Math.abs(outcomes[0].energy-97.8)<1e-8);



const retries=[];
for(const step of [10,60,3600]){
 const f=fixture(String(975700+step)),clock=clockFixture(f);const id='current-'+f.owner;
 for(const table of ['telegram_pet_instances','telegram_pet_profiles']) f.sql.prepare(`UPDATE ${table} SET hunger=0,happiness=100,cleanliness=100,energy=100,health=100,last_decay_at=?,updated_at=?`).run(clock.now(),clock.now());
 const body={action:'weekly_boss',move:'strike',pet_id:id,request_id:'same-attempt'};
 const firstResponse=await httpAction(f,body);assert.equal(firstResponse.status,200);const first=firstResponse.body.result;assert.equal(first.accepted,true,JSON.stringify(first));
 const ledger=f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_events').get().n;
 for(let second=step;second<=3600;second+=step){clock.advance(step*1000);const reply=await httpAction(f,body);assert.equal(reply.status,200);const r=reply.body.result;assert.equal(r.accepted,true,JSON.stringify(r));assert.equal(r.duplicate,true,JSON.stringify(r));}
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_events').get().n,ledger);
 retries.push({retry_seconds:step,...f.sql.prepare('SELECT hunger,happiness,cleanliness,energy,health,last_decay_at FROM telegram_pet_instances WHERE pet_id=?').get(id)});
 clock.restore();f.sql.close();
}
for(const outcome of retries){for(const stat of ['hunger','happiness','cleanliness','energy','health'])assert.ok(Math.abs(outcome[stat]-retries.at(-1)[stat])<1e-8, `${stat} must not depend on duplicate frequency`);}
console.log('Moonpet care frequency: elapsed care survives sub-minute reads and authenticated duplicate Weekly Boss retries.');

// Real care settlement, ownership switches and a concurrent writer preserve
// fractions in the same existing columns used by Daily Run source reads.
{
 const f=fixture('976601'),clock=clockFixture(f),season='pet-s2026-003';
 try {
  f.pet('second-pet',season,10000,2);f.pet('third-pet','pet-s2026-002',200,3);
  f.sql.prepare(`UPDATE telegram_pet_instances SET hunger=50.375,happiness=70.6,cleanliness=70.2,energy=70.875,last_decay_at=?`).run(clock.now());
  f.active('second-pet',season);clock.advance(10000);
  const feed=await f.act({action:'feed',request_id:'fractional-feed'});assert.equal(feed.accepted,true);
  const stored=f.sql.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id=?').get('second-pet');
  assert.ok(Math.abs(stored.energy-(74.875-2.2/360))<1e-6,'care SQL retains sub-minute decay and reward fractions');
  assert.ok(Math.abs(stored.hunger-(22.375+4.5/360))<1e-6);
  f.active('third-pet','pet-s2026-002');
  const others=f.sql.prepare("SELECT pet_id,hunger,happiness,cleanliness,energy,pet_xp FROM telegram_pet_instances WHERE pet_id<>'second-pet' ORDER BY pet_id").all();
  clock.advance(3600000);
  let raced=false;f.db.beforeRun=statement=>{
   if(!raced && statement.query.includes('SET hunger = ?')){
    raced=true;f.sql.prepare("UPDATE telegram_pet_instances SET energy=energy+1 WHERE pet_id='second-pet'").run();
   }
  };
  const source=await readPetInstanceWithAtomicCareDecay(f.db,{pet_id:'second-pet',telegram_id:f.owner,season_key:season},new Date());
  assert.equal(raced,true);assert.ok(Math.abs(source.energy-(stored.energy+1-2.2))<1e-8,'guarded retry incorporates the newer write');
  assert.equal(source.pet_xp,stored.pet_xp);
  assert.deepEqual(f.sql.prepare("SELECT pet_id,hunger,happiness,cleanliness,energy,pet_xp FROM telegram_pet_instances WHERE pet_id<>'second-pet' ORDER BY pet_id").all(),others);
  assert.equal(await readPetInstanceWithAtomicCareDecay(f.db,{pet_id:'second-pet',telegram_id:'different-owner'},new Date()),null);
  const state=await f.state();for(const key of ['energy','hunger','happiness','cleanliness'])assert.ok(Number.isInteger(state.pet[key]),'public needs remain integer meters');
 } finally {clock.restore();f.sql.close();}
}

// A meter that rounds to the published entry cost stays usable, and the
// exact debit clamps at zero rather than violating the existing CHECK.
{
 const f=fixture('976602'),clock=clockFixture(f);
 try {
  f.sql.prepare('UPDATE telegram_pet_instances SET energy=11.75,last_decay_at=?').run(clock.now());
  const response=await httpAction(f,{action:'weekly_boss',move:'strike',request_id:'meter-threshold'});
  assert.equal(response.body.result.accepted,true);
  assert.equal(f.sql.prepare('SELECT energy FROM telegram_pet_instances').get().energy,0);
 } finally {clock.restore();f.sql.close();}
}

// A paid reward within the existing short-read threshold cannot discard the
// anchored interval; the next decay settles its full elapsed minute.
{
 const f=fixture('976603'),clock=clockFixture(f),petId='current-'+f.owner;
 try {
  const anchor=clock.now();
  f.sql.prepare('UPDATE telegram_pet_instances SET hunger=20,happiness=80,cleanliness=80,energy=80,last_decay_at=?').run(anchor);
  clock.advance(10000);
  assert.equal((await httpAction(f,{action:'daily_chest',request_id:'short-care-anchor'})).body.result.accepted,true);
  assert.equal(f.sql.prepare('SELECT last_decay_at FROM telegram_pet_instances').get().last_decay_at,anchor);
  clock.advance(50000);
  const pet=await readPetInstanceWithAtomicCareDecay(f.db,{pet_id:petId},new Date());
  assert.ok(Math.abs(pet.hunger-20.075)<1e-8);
  assert.ok(Math.abs(pet.energy-(80-2.2/60))<1e-8);
 } finally {clock.restore();f.sql.close();}
}

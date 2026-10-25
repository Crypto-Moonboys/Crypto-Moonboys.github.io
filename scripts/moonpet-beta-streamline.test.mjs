import assert from 'node:assert/strict';
import test from 'node:test';
import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery } from './moonpet-pr3-fixture.mjs';
import { readPetRecoveryPresence } from '../workers/moonboys-api/pets/recovery-presence.js';
import { repairPaidPetOnboarding } from '../workers/moonboys-api/pets/onboarding.js';

const presenceQuery = s => s.query.includes('AS objectives') && s.query.includes('AS equipment');
const tables = ['telegram_pet_instances','telegram_pet_profiles','telegram_pet_reward_claims',
  'telegram_pet_growth_marks','telegram_pet_weekly_crests','telegram_pet_daily_journey_receipts',
  'telegram_pet_weekly_journey_receipts','telegram_pet_material_balances'];
const snapshot = f => Object.fromEntries(tables.map(table => [table,f.sql.prepare('SELECT * FROM '+table+' ORDER BY 1').all()]));

test('missing optional Journey migration disables skipping and preserves the locked module contract',async()=>{
  const f=await performanceFixture();
  try {
    f.sql.exec('DROP TABLE telegram_pet_weekly_journey_objectives');
    assert.deepEqual(await readPetRecoveryPresence(f.db,f.owner),{runs:1,daily:1,live:1,combat:1,events:1,bosses:1,objectives:1,equipment:1});
    const {state}=await f.measureHttp();
    assert.equal(state.weekly_journey.state,'LOCKED');
    assert.equal(state.weekly_journey.reason,'weekly_journey_authority_syncing');
  } finally {f.close();}
});

test('parallel bootstrap does not repair paid onboarding for an account without a profile',async()=>{
  const f=await performanceFixture({pets:3});
  try {
    f.sql.exec("UPDATE telegram_pet_season_slots SET acquisition_type='arcade_xp' WHERE slot_number=2; DELETE FROM telegram_pet_profiles");
    const before=f.sql.prepare('SELECT * FROM telegram_pet_memories ORDER BY 1').all();
    assert.equal(await repairPaidPetOnboarding(f.db,f.owner,{requireProfile:true}),0);
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_memories ORDER BY 1').all(),before);
  } finally {f.close();}
});

test('presence probes use owner/pet indexes rather than scanning application tables',async()=>{
  const f=await performanceFixture();let inspected=false;
  try {
    f.db.beforeFirst=async s=>{if(presenceQuery(s)){
      const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+s.query).all(...s.args).map(row=>row.detail);
      // d is the fixed equipment catalog; p/o are materialized owner-scoped
      // CTE results. Application tables must still use their owner/pet indexes.
      const boundedCteScan = /^SCAN (?:CONSTANT ROW|\d+ CONSTANT ROWS|d|p|o)\b/;
      assert.deepEqual(plan.filter(detail=>/^SCAN /.test(detail)&&!boundedCteScan.test(detail)),[],plan.join('\n'));
      inspected=true;
    }};
    await readPetRecoveryPresence(f.db,f.owner);assert.equal(inspected,true);
  } finally {f.close();}
});

test('empty signed full refresh skips source-less recovery and duplicate inventory bridge',async()=>{
  const f=await performanceFixture(); const queries=[];
  try {
    // Observe actual transactions once (the fixture's read hooks can both fire).
    f.db.beforeBatch=async ss=>queries.push(...ss.map(s=>s.query));
    f.db.beforeAll=async s=>{if(s.query.startsWith('WITH run_candidates'))throw Error('empty runtime scan');};
    const {state,report}=await f.measureHttp();
    assert.equal(state.hydration.full,true);
    assert.ok(report.calls<=92); assert.ok(report.statements<=145);
    assert.equal(queries.filter(q=>q.includes('INSERT OR IGNORE INTO telegram_pet_inventory_legacy_sync_042')).length,0,
      'an account without legacy item sources needs no inventory bridge transaction');
  } finally {f.close();}
});

for(const response of [null,{}, {success:false,error:'fixture unavailable'}, {runs:0,daily:0,live:0,combat:0,events:0,bosses:0,objectives:0,equipment:null}]) {
  test('a failed/malformed presence read cannot authorize skipping recovery: '+JSON.stringify(response),async()=>{
    const f=await performanceFixture();
    try {
      const before=snapshot(f);
      f.db.beforeFirst=async s=>{if(presenceQuery(s))return response;};
      await f.measureHttp('full',{status:503});
      assert.deepEqual(snapshot(f),before);
      f.db.beforeFirst=null;
      assert.equal((await f.measureHttp()).state.hydration.full,true);
    } finally {f.close();}
  });
}

test('accepted pending care evidence activates runtime and journey recovery after an empty request',async()=>{
  const f=await performanceFixture();
  try {
    await f.measureHttp();
    assert.equal((await readPetRecoveryPresence(f.db,f.owner)).events,0);
    seedRecoveryEvidence(f,5);
    assert.equal((await readPetRecoveryPresence(f.db,f.owner)).events,1);
    let runtime=0,journey=0;
    f.db.beforeAll=async s=>{if(s.query.startsWith('WITH run_candidates'))runtime++;
      if(s.query.includes('AS missing_weekly'))journey++;};
    await f.measureHttp();
    assert.equal(runtime,1);assert.equal(journey,1);
    const saved=snapshot(f);
    await f.measureHttp();assert.deepEqual(snapshot(f),saved);
  } finally {f.close();}
});

test('historical unpaid awards remain recoverable for the original archived pet and do not pay twice',async()=>{
  const f=await performanceFixture({pets:3});
  try {
    await seedPr3Recovery(f,{archived:true});
    const selected=f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots').get().pet_id;
    await f.measureHttp();
    assert.ok(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_growth_marks').get().n>0);
    assert.ok(f.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_weekly_crests').get().n>0);
    const saved=snapshot(f);await f.measureHttp();assert.deepEqual(snapshot(f),saved);
    assert.equal(f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots').get().pet_id,selected);
  } finally {f.close();}
});

test('intact profile fast path falls back for a divergent mirror and preserves instance XP and wallet',async()=>{
  const f=await performanceFixture();
  try {
    const pet=f.sql.prepare('SELECT * FROM telegram_pet_instances').get();
    f.sql.prepare('UPDATE telegram_pet_profiles SET pet_xp=17').run();
    const {state}=await f.measureHttp();
    assert.equal(state.pet.pet_xp,pet.pet_xp);
    assert.equal(f.sql.prepare('SELECT pet_xp FROM telegram_pet_profiles').get().pet_xp,pet.pet_xp);
    assert.equal(state.pet.moon_gold,1000);
  } finally {f.close();}
});

test('absent wallet cutover receipt runs original reconciliation without discarding currency',async()=>{
  const f=await performanceFixture();
  try {
    f.sql.prepare("DELETE FROM telegram_pet_reward_claims WHERE source='wallet_reconciliation'").run();
    const {state}=await f.measureHttp();
    assert.equal(state.pet.moon_gold,1000);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_reward_claims WHERE source='wallet_reconciliation' AND status='awarded'").get().n,1);
  } finally {f.close();}
});

test('a failed runtime recovery retains evidence and the next request retries it',async()=>{
  const f=await performanceFixture();
  try {
    seedRecoveryEvidence(f,1);let attempted=0;
    f.db.beforeAll=async s=>{if(s.query.startsWith('WITH run_candidates')){attempted++;throw Error('fixture unavailable');}};
    await f.measureHttp(); assert.equal(attempted,1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM telegram_pet_events WHERE id='performance-evidence-0'").get().n,1);
    f.db.beforeAll=async s=>{if(s.query.startsWith('WITH run_candidates'))attempted++;};
    await f.measureHttp(); assert.equal(attempted,2);
    const saved=snapshot(f);await f.measureHttp();assert.deepEqual(snapshot(f),saved);
  } finally {f.close();}
});

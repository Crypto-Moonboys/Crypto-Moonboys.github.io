import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PET_ROGUELITE_BOSSES } from '../workers/moonboys-api/pets/content/index.js';
import { __rogueliteFoundationTestHooks } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { mixBossRelicSelectionRoll, selectBossRelicId } from '../workers/moonboys-api/pets/relic-selection.js';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source = read('workers/moonboys-api/pets/roguelite-foundation.js');
const DAY_MS = 86_400_000;
function oldRoll(input) {
  let hash=2166136261;
  for (const char of String(input||'')) hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return hash>>>0;
}

function campaign(boss,owner,days=365) {
  const relicCounts = new Map();
  let eligibleDrops=0, outcomes=0;
  for(let day=0;day<days;day++) {
    const utc=new Date(Date.UTC(2026,10,1)+day*DAY_MS).toISOString().slice(0,10);
    const runId='daily:'+utc+':'+owner, roomId=runId+':10';
    const key=runId+':'+roomId+':'+boss.boss_id;
    const isDrop=oldRoll(key+':chance')%10000 < boss.relic_chance_bps;
    const actual=__rogueliteFoundationTestHooks.buildPetBossRewards(boss,{run_id:runId},{room_id:roomId});
    const ids=Object.keys(actual.relics||{});
    assert.equal(ids.length,isDrop?1:0, 'drop occurrence must be unchanged at '+key);
    if(isDrop) {
      eligibleDrops++;
      const expected=selectBossRelicId(boss.relic_pool,oldRoll(key+':relic'));
      assert.deepEqual(ids,[expected],'actual production builder must use the v2 selection');
      relicCounts.set(expected,(relicCounts.get(expected)||0)+1);
    }
    outcomes++;
  }
  return {outcomes,eligibleDrops,distinct:[...relicCounts.keys()].sort(),counts:relicCounts};
}

test('selection changes only relic index; invalid rolls fail safely',()=>{
  assert.equal(mixBossRelicSelectionRoll(0xffffffff), 0xffff0000);
  assert.equal(selectBossRelicId([],0),null);
  assert.throws(()=>mixBossRelicSelectionRoll(-1),/invalid_boss_relic_roll/);
  assert.throws(()=>mixBossRelicSelectionRoll(2**32),/invalid_boss_relic_roll/);
  assert.equal(selectBossRelicId(['only'],0), 'only');
  assert.match(source,/selectBossRelicId\(boss\.relic_pool, stableContentRoll\(\x60\$\{rollKey\}:relic\x60\)\)/);
  assert.match(source,/chanceRoll = stableContentRoll\(\x60\$\{rollKey\}:chance\x60\) % 10000/);
});

test('365-day Alley King hypothetical successful boss sequence can select all ten relics',()=>{
  const boss=PET_ROGUELITE_BOSSES.alley_king;
  assert.equal(boss.relic_chance_bps,2500,'do not alter the 25% drop chance');
  assert.equal(boss.relic_pool.length,10,'Legendary 10-relic pool retained');
  for (const owner of ['virtual-relic-audit','year-player','123456','virtual-test','1','2']) {
    const result=campaign(boss,owner);
    assert.equal(result.outcomes,365);
    assert.deepEqual(result.distinct,[...boss.relic_pool].sort(),'all ten IDs must be reachable: '+owner);
  }
});

test('fresh boss payout selection remains deterministic and independent of duplicate callbacks',()=>{
  const boss=PET_ROGUELITE_BOSSES.alley_king;
  const run={run_id:'daily:2026-11-01:repeat-owner'},room={room_id:'daily:2026-11-01:repeat-owner:10'};
  const expected=__rogueliteFoundationTestHooks.buildPetBossRewards(boss,run,room);
  for(let i=0;i<30;i++)
    assert.deepEqual(__rogueliteFoundationTestHooks.buildPetBossRewards(boss,run,room),expected);
  // Existing settled rewards remain immutable in D1 via the original receipt
  // guard. The full Worker-backed concurrency test covers callback replay.
  assert.match(source,/idempotency_key: \x60\$\{persistedRoom\.room_id\}:\$\{bossId\}\x60/);
});

test('other boss pools retain configured drop chances and valid selections',()=>{
  for(const id of ['neon_warden','chrome_jackal']) {
    const boss=PET_ROGUELITE_BOSSES[id], result=campaign(boss,'virtual-relic-audit');
    assert.ok(result.eligibleDrops>0);
    assert.ok(result.distinct.every(relic=>boss.relic_pool.includes(relic)));
    assert.deepEqual(result.distinct,[...boss.relic_pool].sort());
  }
});

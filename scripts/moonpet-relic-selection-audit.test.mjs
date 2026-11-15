import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import bosses from '../workers/moonboys-api/pets/content/bosses.json' with { type: 'json' };
import regions from '../workers/moonboys-api/pets/content/regions.json' with { type: 'json' };

const source = readFileSync(new URL('../workers/moonboys-api/pets/roguelite-foundation.js', import.meta.url), 'utf8');
const lifecycleSource = readFileSync(new URL('../workers/moonboys-api/pets/season-completion.js', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');
const bossById = Object.fromEntries(bosses.map(boss => [boss.boss_id, boss]));
const DAY = 86400000;

// Mirrors only the production deterministic relic selection; source guards
// below deliberately fail if production's formula changes.
function stableContentRoll(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
function hypotheticalBossDrop({bossId, runId, roomId}) {
  const boss = bossById[bossId];
  if (!boss) throw new Error('unknown_boss');
  const key = `${runId}:${roomId}:${boss.boss_id}`;
  if (stableContentRoll(`${key}:chance`) % 10000 >= boss.relic_chance_bps) return null;
  return boss.relic_pool[stableContentRoll(`${key}:relic`) % boss.relic_pool.length];
}
function simulateDailyIds({owner='virtual-relic-audit',days=365,startDay='2026-11-01',bossId='alley_king'}={}) {
  const start=Date.parse(startDay+'T00:00:00.000Z');
  const drops=[];
  for(let day=0;day<days;day++) {
    const utc=new Date(start+day*DAY).toISOString().slice(0,10);
    const runId=`daily:${utc}:${owner}`;
    const relic=hypotheticalBossDrop({bossId,runId,roomId:`${runId}:10`});
    if(relic)drops.push(relic);
  }
  return {days,drops:drops.length,uniqueRelics:[...new Set(drops)].sort()};
}

test('source-locked production relic hash and Alley King pool',()=>{
  assert.match(source,/function stableContentRoll\(value\) \{[\s\S]*?2166136261[\s\S]*?Math\.imul\(hash \^ char\.charCodeAt\(0\), 16777619\)/);
  assert.match(source,/const rollKey = `\$\{run\.run_id\}:\$\{room\.room_id\}:\$\{boss\.boss_id\}`/);
  assert.match(source,/stableContentRoll\(`\$\{rollKey\}:chance`\) % 10000/);
  assert.match(source,/stableContentRoll\(`\$\{rollKey\}:relic`\)/);
  assert.equal(bossById.alley_king.relic_chance_bps,2500);
  assert.equal(bossById.alley_king.relic_pool.length,10);
});

test('365 hypothetical Alley King boss victories select just five relic IDs',()=>{
  for(const owner of ['virtual-relic-audit','virtual-test','123456','year-player']) {
    const result=simulateDailyIds({owner});
    assert.ok(result.drops>0);
    assert.equal(result.uniqueRelics.length,5,`owner=${owner}`);
    assert.ok(result.uniqueRelics.every(id=>bossById.alley_king.relic_pool.indexOf(id)%2===0));
  }
});

test('different boss hash keys exhibit different parity; access must be independently proven',()=>{
  const neon=simulateDailyIds({bossId:'neon_warden'});
  const chrome=simulateDailyIds({bossId:'chrome_jackal'});
  assert.ok(neon.uniqueRelics.every(id=>bossById.neon_warden.relic_pool.indexOf(id)%2===1));
  assert.ok(chrome.uniqueRelics.every(id=>bossById.chrome_jackal.relic_pool.indexOf(id)%2===0));
});

test('emit possible outcomes, not fabricated earned relics',()=>{
  const result=simulateDailyIds();
  console.log('MOONPET_RELIC_DIAGNOSTIC',JSON.stringify({
    boss:'alley_king',days:result.days,assumesEveryDailyBossWasDefeated:true,
    hypotheticalDrops:result.drops,distinctRelicIds:result.uniqueRelics.length,
    reachable:result.uniqueRelics,
    excluded:bossById.alley_king.relic_pool.filter(id=>!result.uniqueRelics.includes(id)),
    verifiedPlayerInventory:false,
  }));
  assert.equal(result.uniqueRelics.length,5);
});


test('hypothetical post-hash mixing can reach all ten relic IDs without increasing drop frequency',()=>{
  // A prototype only. DO NOT use this as the live payout algorithm without
  // explicit approval and security/replay review.
  const boss=bossById.alley_king;
  const start=Date.parse('2026-11-01T00:00:00Z');
  for(const owner of ['virtual-relic-audit','year-player','123456']){
    let existingDrops=0,mixedDrops=0;
    const currentIds=new Set(),mixedIds=new Set();
    for(let d=0;d<365;d++){
      const day=new Date(start+d*DAY).toISOString().slice(0,10);
      const runId=`daily:${day}:${owner}`;
      const rollKey=`${runId}:${runId}:10:${boss.boss_id}`;
      if(stableContentRoll(`${rollKey}:chance`) % 10000 >= boss.relic_chance_bps)continue;
      existingDrops++;
      const raw=stableContentRoll(`${rollKey}:relic`);
      currentIds.add(boss.relic_pool[raw % boss.relic_pool.length]);
      // Candidate finalizer decorrelates the least significant bits used
      // for selection from the common salted hash suffix.
      const mixed=(raw ^ (raw >>> 16)) >>> 0;
      mixedIds.add(boss.relic_pool[mixed % boss.relic_pool.length]);
      mixedDrops++;
    }
    assert.equal(existingDrops,mixedDrops);
    assert.equal(currentIds.size,5);
    assert.equal(mixedIds.size,10);
  }
});


test('Legendary relic threshold counts unique account-owned IDs, not repeated drop rolls',()=>{
  assert.match(schemaSource,/CREATE TABLE IF NOT EXISTS telegram_pet_relics \([\s\S]*?PRIMARY KEY \(telegram_id, relic_id\)/);
  assert.match(lifecycleSource,/SELECT COUNT\(\*\) AS count FROM telegram_pet_relics WHERE telegram_id=\?/);
  // Five repeatedly dropped ID values still represent exactly five owned
  // relic types because collection storage is keyed by (account, relic ID).
  const observed=['bitcoin_heart','hacker_lens','hacker_lens','moon_battery','bitcoin_heart'];
  assert.equal(new Set(observed).size,3);
});


test('current official Moon Alley route has ten rooms and only Alley King in its boss pool',()=>{
  const moonAlley=regions.find(region=>region.region_id==='moon_alley');
  assert.ok(moonAlley);
  assert.equal(moonAlley.max_rooms,10);
  assert.deepEqual(moonAlley.boss_pool,['alley_king']);
  assert.equal(regions.length,1,'audit route authority if new regions are introduced');
});

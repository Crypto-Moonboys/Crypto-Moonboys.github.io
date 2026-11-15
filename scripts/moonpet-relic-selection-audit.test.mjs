import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import bosses from '../workers/moonboys-api/pets/content/bosses.json' with { type: 'json' };

const source = readFileSync(new URL('../workers/moonboys-api/pets/roguelite-foundation.js', import.meta.url), 'utf8');
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

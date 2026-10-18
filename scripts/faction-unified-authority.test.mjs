import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_FACTION_READ_SQL, canonicalFactionProjection,
} from '../workers/moonboys-api/shared/faction-projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(path.join(ROOT, name), 'utf8');

test('canonical progression is one account-bound faction source across all nine factions', () => {
  const keys = [
    'hard-fork-rockers', 'rugpull-miners', 'graffpunks', 'blockchain-furies',
    'crypto-moongirls', 'blockstars', 'all-city-bulls', 'nomad-bears',
    'crypto-stoned-boys',
  ];
  for (const key of keys) {
    const result = canonicalFactionProjection({ faction:key, faction_xp:21 });
    assert.equal(result.joined, true);
    assert.equal(result.name, key);
    assert.equal(result.faction_id, key);
    assert.equal(result.faction_xp,21);
  }
  assert.equal(canonicalFactionProjection({faction:'graff-punks',faction_xp:0}).name,'graffpunks');
  assert.deepEqual(canonicalFactionProjection(null), {
    joined:false, faction_id:'unaligned', name:null, faction_xp:0,
    source:'blocktopia_progression',
  });
  assert.equal(canonicalFactionProjection({ faction:'unaligned' }).joined, false);
  for (const bad of ['', 'not-a-faction', null, 'old-test-account']) {
    assert.throws(() => canonicalFactionProjection({faction:bad}), /faction_source_invalid/u);
  }
  assert.equal(CANONICAL_FACTION_READ_SQL,
    'SELECT faction, faction_xp FROM blocktopia_progression WHERE telegram_id=? LIMIT 1');
});

test('the Worker status, Action Plan, and Daily Loop share authority without membership fallbacks', () => {
  const worker = read('workers/moonboys-api/worker.js');
  const status = worker.slice(worker.indexOf("path === '/faction/status'"),
    worker.indexOf("path === '/faction/join'"));
  assert.match(status, /getOrCreateBlockTopiaProgression/u,
    'faction/status is the authoritative signed user progression read');
  assert.match(status, /progression\?\.faction/u);
  const sources = read('workers/moonboys-api/player-action-plan/sources.js');
  const loop = read('workers/moonboys-api/routes/daily-loop-state.js');
  assert.match(sources, /canonicalFactionProjection\(/u);
  assert.match(sources, /CANONICAL_FACTION_READ_SQL/u);
  assert.match(loop, /canonicalFactionProjection\(/u);
  assert.match(loop, /CANONICAL_FACTION_READ_SQL/u);
  assert.match(sources, /'onboarding\.faction': 'blocktopia_progression'/u);
  assert.match(loop, /faction_state: \['blocktopia_progression'/u);
  assert.doesNotMatch(sources, /FROM telegram_faction_members/u,
    'legacy membership cannot decide personal faction task eligibility');
  assert.doesNotMatch(loop, /FROM telegram_faction_members/u,
    'legacy membership cannot decide daily-loop membership');
  assert.match(sources, /!factionHealthy \? 'sync_unavailable'/u);
  assert.match(sources, /faction: !factionHealthy \? null/u);
  assert.match(loop, /statusQueryFailed\('worker_d1'/u);
});

test('all player pages either consume canonical status or reject stale identities', () => {
  const factionApi = read('js/faction-alignment.js');
  const chamber = read('js/battle-chamber-factions.js');
  const operations = read('js/faction-operations.js');
  const summary = read('js/my-moonboy.js');
  const daily = read('js/components/connection-status-panel.js');
  assert.match(factionApi, /request\('\/faction\/status'/u);
  assert.match(factionApi, /!identityTelegramId \|\| !cachedTelegramId \|\| cachedTelegramId !== identityTelegramId/u);
  assert.match(chamber, /factionApi\.loadStatus\(\)/u);
  assert.match(operations, /valid\?\.faction_state\?\.faction_id/u);
  assert.match(operations, /sourceState\(valid, 'faction_state'\)/u);
  assert.match(summary, /const faction = owner\.faction/u);
  assert.match(daily, /dailyLoopOwnsFaction/u);
  assert.match(read('docs/LIVE_DAILY_LOOP_TRUTH_MAP.md'),
    /blocktopia_progression\.faction/u);
});

console.log('Canonical faction authority parity: server and all private player pages guarded.');

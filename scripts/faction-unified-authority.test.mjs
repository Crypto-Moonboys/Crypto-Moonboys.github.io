import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_FACTION_READ_SQL, canonicalFactionProjection, canonicalFactionMetadataLookup, readCanonicalFactionProfile,
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

test('faction browser cache rejects anonymous, previous-owner and unscoped rows', () => {
  const rows = new Map();
  let activeId = '123456';
  const storage = {
    getItem(key) { return rows.get(key) || null; },
    setItem(key, value) { rows.set(key, String(value)); },
    removeItem(key) { rows.delete(key); },
  };
  const window = {
    MOONBOYS_IDENTITY: { getTelegramId() { return activeId; } },
    addEventListener() {},
    dispatchEvent() {},
  };
  vm.runInNewContext(read('js/faction-alignment.js'), { window, localStorage:storage }, {
    filename:'faction-alignment.js',
  });
  const api = window.MOONBOYS_FACTION;
  const key = 'moonboys_faction_status_v1';
  rows.set(key, JSON.stringify({ faction:'graffpunks', faction_xp:70 }));
  assert.equal(api.getCachedStatus(), null, 'unscoped cache cannot authorize membership');
  rows.set(key, JSON.stringify({ telegram_id:'another-owner', faction:'graffpunks' }));
  assert.equal(api.getCachedStatus(), null, 'other owner must not leak membership');
  rows.set(key, JSON.stringify({ telegram_id:'123456', faction:'graffpunks', faction_xp:70 }));
  assert.equal(api.getCachedStatus().faction, 'graffpunks');
  activeId = 'another-owner';
  assert.equal(api.getCachedStatus(), null, 'account switch invalidates old owner cache');
  activeId = null;
  assert.equal(api.getCachedStatus(), null, 'guest cannot inherit linked membership');
});


test('metadata alias lookup covers original seeded rows without redefining membership', () => {
  for (const [canonical, legacy] of [
    ['hard-fork-rockers', 'diamond-hands'],
    ['rugpull-miners', 'hodl-warriors'],
    ['graffpunks', 'graff-punks'],
  ]) {
    const lookup = canonicalFactionMetadataLookup(canonical);
    assert.ok(lookup.sql.includes('FROM telegram_factions WHERE name IN'));
    assert.ok(lookup.params.includes(canonical));
    assert.ok(lookup.params.includes(legacy));
    assert.equal(lookup.params.at(-1), canonical);
    assert.equal(lookup.sql.match(/\?/gu).length, lookup.params.length);
  }
  assert.equal(canonicalFactionMetadataLookup('unaligned'), null);
});

test('Telegram profile and digest use the same read-only saved faction without a legacy fallback', async () => {
  const calls = [];
  const database = {
    prepare(sql) {
      return { bind(...params) {
        return { async first() {
          calls.push({ sql, params });
          if (sql.includes('FROM blocktopia_progression')) {
            return params[0] === 'graff-owner'
              ? { faction:'graffpunks', faction_xp:57 } : null;
          }
          if (sql.includes('FROM telegram_factions')) {
            return { id:3, name:'graffpunks', description:'Graffiti crew', icon:'paint' };
          }
          throw new Error('unexpected query');
        } };
      } };
    },
  };
  const result = await readCanonicalFactionProfile(database, 'graff-owner');
  assert.equal(result.name, 'graffpunks');
  assert.equal(result.faction_xp, 57);
  assert.equal(result.id,3);
  assert.equal(await readCanonicalFactionProfile(database,'different-owner'),null);
  assert.ok(calls.every(call => /^\s*SELECT\b/u.test(call.sql)));
  assert.ok(calls.every(call => !/telegram_faction_members/u.test(call.sql)));
  assert.deepEqual(calls.filter(call => call.sql.includes('FROM blocktopia_progression'))
    .map(call => call.params[0]), ['graff-owner','different-owner']);
  const worker = read('workers/moonboys-api/worker.js');
  const digest = read('workers/moonboys-api/routes/daily-digest.js');
  assert.match(worker, /if \(path === '\/telegram\/profile'\)/u);
  assert.match(worker, /Method not allowed; signed POST required/u);
  assert.match(worker, /verifyTelegramIdentityFromBody\(profileBody, env, verifyTelegramAuth\)/u);
  assert.match(worker, /const telegramId = verified.telegramId/u);
  assert.doesNotMatch(worker, /url.searchParams.get\('telegram_id'\)[\s\S]{0,80}getUserFaction\(env.DB/u);
  const communityClient = read('js/telegram-community.js');
  assert.match(communityClient, /fetch\(BASE \+ '\/telegram\/profile'/u);
  assert.match(communityClient, /method: 'POST'/u);
  assert.match(communityClient, /getFreshTelegramAuth/u);
  assert.doesNotMatch(communityClient, /\/telegram\/profile\?telegram_id=/u);
  assert.match(communityClient, /String\(data.profile.telegram_id \|\| ''\) !== telegramId/u);
  assert.match(worker, /return readCanonicalFactionProfile\(db, telegramId\)/u);
  assert.match(digest, /return readCanonicalFactionProfile\(db, telegramId\)/u);
  assert.doesNotMatch(worker, /FROM telegram_faction_members/u);
  assert.doesNotMatch(digest, /FROM telegram_faction_members/u);
  assert.match(worker, /const normalizedFaction = normalizeFaction\(factionId\)/u);
});

console.log('Canonical faction authority parity: server and all private player pages guarded.');

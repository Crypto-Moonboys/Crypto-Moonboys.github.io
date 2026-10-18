import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const parity = JSON.parse(await readFile(new URL('../data/player-action-sync-claim-parity.v1.json', import.meta.url)));
const registry = JSON.parse(await readFile(new URL('../data/player-action-plan-source-registry.v1.json', import.meta.url)));
const myMoonboy = await readFile(new URL('../js/my-moonboy.js', import.meta.url), 'utf8');
const mini = await readFile(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const sync = await readFile(new URL('../js/player-action-sync.js', import.meta.url), 'utf8');
const siteShell = await readFile(new URL('../js/site-shell.js', import.meta.url), 'utf8');
const moonpetPage = await readFile(new URL('../moonpet-game.html', import.meta.url), 'utf8');

test('PR5 MoonPet Saved Status parity matrix references real action-plan sources or explicit gaps', () => {
  assert.equal(parity.schema_version, 1);
  const sourceKeys = new Set(registry.sources.map(item => item.key));
  assert.ok(parity.mappings.length >= 8);
  for (const mapping of parity.mappings) {
    assert.ok(mapping.saved_status);
    assert.ok(mapping.parity);
    assert.ok(mapping.notes);
    if (mapping.action_plan_source) {
      assert.ok(sourceKeys.has(mapping.action_plan_source), mapping.action_plan_source);
    } else {
      assert.equal(mapping.parity, 'gap', mapping.saved_status + ' missing adapter must be explicit');
      assert.equal(mapping.claim_badge, false, mapping.saved_status + ' gap cannot inflate claim badge');
    }
  }
});

test('PR5 claim badge is restricted to verified action-plan summary and never fills known Saved Status gaps', () => {
  const badgeMappings = parity.mappings.filter(item => item.claim_badge);
  assert.ok(badgeMappings.every(item => item.action_plan_source));
  assert.ok(badgeMappings.every(item => ['direct','partial'].includes(item.parity)));
  assert.match(myMoonboy, /summary\.claims_ready/u);
  assert.match(myMoonboy, /!state\.stale && !state\.offline/u);
  assert.match(myMoonboy, /task\.status === 'claim_ready' && task\.source_health === 'live'/u);
  assert.doesNotMatch(myMoonboy, /daily_cache.*claim_ready|season_tier.*claim_ready/iu,
    'frontend cannot invent claim readiness for parity gaps');
});

test('PR5 MoonPet emits invalidation only inside the server-accepted branch and carries no pet/auth/reward payload', () => {
  const marker = "var actionAccepted = Boolean(data.result && data.result.accepted);";
  const start = mini.indexOf(marker);
  assert.ok(start >= 0);
  const sample = mini.slice(start, start + 1200);
  assert.match(sample, /if \(actionAccepted\) \{/u);
  assert.match(sample, /new CustomEvent\('moonpet:action-accepted'/u);
  const eventBlock = sample.slice(sample.indexOf("new CustomEvent('moonpet:action-accepted'"),
    sample.indexOf("if (['adventure'", sample.indexOf("new CustomEvent('moonpet:action-accepted'")));
  assert.match(eventBlock, /source: 'moonpet'/u);
  for (const forbidden of ['pet_id','telegram_id','telegram_auth','request_id','receipt','reward']) {
    assert.doesNotMatch(eventBlock, new RegExp(forbidden, 'u'), forbidden + ' cannot cross tab');
  }
});

test('PR5 action sync is globally loaded for shell pages and directly for standalone MoonPet', () => {
  assert.match(siteShell, /\/js\/player-action-sync\.js/u);
  assert.match(siteShell, /data\.playerActionSync/u);
  assert.match(moonpetPage, /src="\/js\/player-action-sync\.js"/u);
  assert.ok(moonpetPage.indexOf('src="/js/player-action-sync.js"') <
    moonpetPage.indexOf('src="/js/moonpet-mini-app.js"'));
  assert.match(sync, /BroadcastChannel/u);
  assert.doesNotMatch(sync, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage\.(?:setItem|getItem|removeItem|clear)/u,
    'sync channel is invalidation-only');
});

test('PR5 accepted-action channel does not subscribe to rejection/error notifications', () => {
  assert.doesNotMatch(sync, /moonboys:progression-sync-error/u);
  assert.doesNotMatch(sync, /moonpet:action-rejected/u);
  assert.match(sync, /moonboys:server-action-accepted/u);
  assert.match(sync, /moonboys:score-updated/u);
  assert.match(sync, /moonboys:wiki-mission-complete/u);
});

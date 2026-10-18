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
const playOptions = await readFile(new URL('../js/moonpet-play-options.js', import.meta.url), 'utf8');
const leaderboardClient = await readFile(new URL('../js/leaderboard-client.js', import.meta.url), 'utf8');
const arcadeLeaderboard = await readFile(new URL('../js/arcade-leaderboard.js', import.meta.url), 'utf8');
const gameShell = await readFile(new URL('../js/arcade/core/game-shell.js', import.meta.url), 'utf8');
const snakePage = await readFile(new URL('../games/snake-run/index.html', import.meta.url), 'utf8');
const invadersPage = await readFile(new URL('../games/invaders-3008/index.html', import.meta.url), 'utf8');

test('PR5 MoonPet Saved Status parity matrix references real action-plan sources or explicit gaps', () => {
  assert.equal(parity.schema_version, 1);
  const sourceKeys = new Set(registry.sources.map(item => item.key));
  assert.ok(parity.mappings.length >= 12);
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

test('PR5 parity inventory covers every live Saved Status claim class that lacks an action-plan adapter', () => {
  const rows = new Map(parity.mappings.map(item => [item.saved_status, item]));
  const liveGapMarkers = [
    ['finale_claim', /finale_claim/u],
    ['extra_bounty_claim', /extra_bounty_claim/u],
    ['weekly_bounty_claim', /weekly_bounty_claim/u],
  ];
  for (const [key, marker] of liveGapMarkers) {
    assert.match(playOptions, marker, key + ' must still exist in MoonPet Saved Status');
    assert.ok(rows.has(key), key + ' missing from parity inventory');
    assert.equal(rows.get(key).parity, 'gap');
    assert.equal(rows.get(key).claim_badge, false);
    assert.equal(rows.get(key).action_plan_source, null);
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
  assert.match(siteShell, /script\.dataset\.playerActionSync/u);
  assert.match(moonpetPage, /src="\/js\/player-action-sync\.js"/u);
  assert.ok(moonpetPage.indexOf('/js/player-action-sync.js') <
    moonpetPage.indexOf('/js/moonpet-mini-app.js'),
    'action sync must load before MoonPet Mini App regardless of HTML quote style');
  assert.match(sync, /BroadcastChannel/u);
  assert.doesNotMatch(sync, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage\.(?:setItem|getItem|removeItem|clear)/u,
    'sync channel is invalidation-only');
});

test('PR5 standalone Arcade pages await action sync through the shared game shell before gameplay', () => {
  assert.match(gameShell, /function ensurePlayerActionSync\(\)/u);
  assert.match(gameShell, /script\.src = ['"]\/js\/player-action-sync\.js['"]/u);
  assert.match(gameShell, /export async function mountGame\(options\) \{[\s\S]{0,260}await ensurePlayerActionSync\(\)/u,
    'shared Arcade shell must await bus setup before bootstrap/gate work');
  for (const [name, html] of [['SnakeRun', snakePage], ['Invaders', invadersPage]]) {
    assert.match(html, /\/js\/arcade\/core\/game-shell\.js/u,
      name + ' must mount through the shared game shell');
    assert.doesNotMatch(html, /\/js\/site-shell\.js/u,
      name + ' remains standalone; shared game shell must provide sync');
  }
});

test('PR5 arcade invalidation uses confirmed submission signal, not public leaderboard display movement', () => {
  assert.match(leaderboardClient, /data && data\.accepted === true[\s\S]{0,900}moonboys:arcade-score-accepted/u);
  assert.match(arcadeLeaderboard, /moonboys:score-updated/u,
    'public leaderboard still owns display-only score update events');
  assert.doesNotMatch(sync, /['"]moonboys:score-updated['"]\s*:/u);
});

test('PR5 delayed Arcade settlements emit follow-up invalidations only after confirmed writes resolve', () => {
  const acceptedBranch = leaderboardClient.indexOf('} else if (data && data.accepted === true) {');
  const initialSignal = leaderboardClient.indexOf('moonboys:arcade-score-accepted', acceptedBranch);
  const factionAwait = leaderboardClient.indexOf('await callFactionEarn("score_accept", score)', acceptedBranch);
  const factionSignal = leaderboardClient.indexOf('source: "faction"', factionAwait);
  assert.ok(acceptedBranch >= 0 && initialSignal > acceptedBranch);
  assert.ok(factionAwait > initialSignal && factionSignal > factionAwait,
    'faction invalidation must follow the awaited settlement, not only initial score acceptance');

  const blockAwait = leaderboardClient.indexOf(
    'await ArcadeSync.syncBlockTopiaProgressionOnAcceptedScore(score, gameKey)', factionSignal);
  const blockSignal = leaderboardClient.indexOf('source: "arcade_progression"', blockAwait);
  assert.ok(blockAwait > factionSignal && blockSignal > blockAwait,
    'Block Topia progression invalidation must follow its awaited server settlement');

  const pendingAwait = leaderboardClient.indexOf(
    'await ArcadeSync.syncPendingArcadeProgress({ entries: [competitiveProgressEntry] })', blockSignal);
  const pendingCondition = leaderboardClient.indexOf(
    'if (!syncSummary?.skipped && (Number(syncSummary?.synced) || 0) > 0)', pendingAwait);
  const pendingSignal = leaderboardClient.indexOf('source: "arcade_progression"', pendingCondition);
  assert.ok(pendingAwait > blockSignal && pendingCondition > pendingAwait && pendingSignal > pendingCondition,
    'shared Arcade progression emits a follow-up for full or partial confirmed success');
});

test('PR5 faction and Block Topia follow-ups require explicit confirmed settlement payloads', () => {
  const factionAwait = leaderboardClient.indexOf('await callFactionEarn("score_accept", score)');
  const factionGuard = leaderboardClient.indexOf(
    'factionEarn && factionEarn.ok === true && factionEarn.skipped !== true', factionAwait);
  const factionSignal = leaderboardClient.indexOf('source: "faction"', factionGuard);
  assert.ok(factionAwait >= 0 && factionGuard > factionAwait && factionSignal > factionGuard,
    'faction follow-up invalidation must be inside explicit ok/non-skipped settlement guard');

  const blockAwait = leaderboardClient.indexOf(
    'await ArcadeSync.syncBlockTopiaProgressionOnAcceptedScore(score, gameKey)');
  const blockGuard = leaderboardClient.indexOf(
    'if (progression && progression.ok === true)', blockAwait);
  const blockSignal = leaderboardClient.indexOf('source: "arcade_progression"', blockGuard);
  assert.ok(blockAwait >= 0 && blockGuard > blockAwait && blockSignal > blockGuard,
    'Block Topia follow-up invalidation must require progression.ok === true');
});

test('PR5 accepted-action channel does not subscribe to rejection/error notifications', () => {
  assert.doesNotMatch(sync, /moonboys:progression-sync-error/u);
  assert.doesNotMatch(sync, /moonpet:action-rejected/u);
  assert.match(sync, /moonboys:server-action-accepted/u);
  assert.match(sync, /moonboys:arcade-score-accepted/u);
  assert.doesNotMatch(sync, /['"]moonboys:score-updated['"]\s*:/u,
    'public leaderboard display updates are not accepted-action authority');
  assert.match(sync, /moonboys:wiki-mission-complete/u);
});

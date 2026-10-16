import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const game=readFileSync('game/nbg-level1.js','utf8');
const client=readFileSync('game/nbg-london-leaderboards.js','utf8');
const source=readFileSync('workers/leaderboard/nbg-london-records.js','utf8');
const replay=readFileSync('workers/leaderboard/nbg-london-replay.js','utf8');
const schema=readFileSync('workers/moonboys-api/migrations/101_nbg_london_verified_run_receipts.sql','utf8');
const entry=readFileSync('workers/leaderboard/deployment-entry.js','utf8');

test('challenge rollout stays code-locked and original prize payout disabled',()=>{
  assert.match(client,/NBG_CHALLENGE_CLIENT_RELEASED = false/);
  assert.match(entry,/NBG_VERIFIED_RUN_RECEIPTS_RELEASED = false/);
  assert.match(entry,/NBG_LONDON_PRIZES_RELEASED = false/);
});
test('v2 ranked handshake awaits signed challenge before any replay tick',()=>{
  assert.match(game,/pendingChallengeStart = Promise\.resolve\(\)/);
  assert.match(game,/return window\.NBG_REQUEST_RANKED_CHALLENGE\(\)/);
  assert.match(game,/if \(pendingChallengeStart\) return pendingChallengeStart/);
  assert.match(game,/if \(runSequence !== expectedSequence\)/);
  assert.match(game,/\.catch\(function\(\)\{\s*\/\/ A network\/auth failure[\s\S]*?if \(runSequence !== expectedSequence\) return window\.NBGLevel1State;/,
    'stale challenge failure must not restart gameplay after reset');
  assert.match(game,/challengeHandshakeComplete = true/);
  assert.match(game,/rankedChallengeVersion === 2 && !lastTime/);
  assert.match(game,/requestAnimationFrame\(function\(next\)\{tick\(next,sequence\);\}\)/);
  assert.match(game,/return;\s*}\s*if \(!lastTime\) lastTime = time/);
  for(const control of ['KeyS','KeyX','ArrowLeft','KeyA','ArrowUp','Space','KeyW']){
    assert.ok(game.includes(control),'must preserve keyboard startup '+control);
  }
  assert.match(game,/pendingJumpPresses/);
  assert.match(game,/if \(assetsLoaded && window\.NBG_CHALLENGE_CLIENT_RELEASED !== true\) return;/,
    'v2 must queue initiating taps even when game assets are already loaded');
  assert.match(game,/if \(!pendingInitialInput\) pendingInitialInput = \{ control: control \};/,
    'first S, X, Left, Right, Jump or touch initiation must survive the handshake');
  assert.match(game,/initialInputReplay = pendingInitialInput;/);
  assert.match(game,/if \(keys\.KeyS \|\| keys\.KeyX \|\| touch\.spray \|\| \(replay && replay\.control === 'spray'\)\)/,
    'the recorded initial spray must be consumed on the first post-handshake frame');
  assert.match(game,/touch\.spray/);
  // Touch controls are stored in the generic touch[control] map. The
  // implementation counts jump presses separately, not as touch.jump.
  assert.match(game,/touch\[control\] = active/);
  assert.match(game,/if \(control === 'jump'\) pendingJumpPresses/);
});
test('server challenge is generated, saved, owner-checked and used for physics',()=>{
  assert.match(source,/crypto\.getRandomValues\(new Uint32Array\(1\)\)/);
  assert.match(source,/challenge_seed, challenge_version/);
  assert.match(source,/session\.challenge_version !== 2/);
  assert.match(source,/challengeSeed:session\.challenge_seed/);
  assert.match(replay,/challengeV2 \? challengeSeed >>> 0/);
  assert.match(replay,/accelerationFactor=challengeV2/);
  assert.match(replay,/replay\.version===2/);
  assert.match(schema,/ALTER TABLE nbg_london_runs ADD COLUMN challenge_seed/);
  assert.match(schema,/CHECK\(replay_version=2\)/);
});
test('legacy practice and v1 boards remain supported, v2 requires signed preplay source',()=>{
  assert.match(game,/rankedChallengeVersion = 1/);
  assert.match(game,/rankedChallengeSeed = null/);
  assert.match(client,/Guest practice/);
  assert.match(client,/requestRankedChallengeBeforePlay/);
  assert.match(client,/var startOperation=serverStartQueue\.catch/);
  assert.match(client,/serverStartQueue=startOperation\.catch/);
  assert.match(client,/runPromise=startOperation/);
  assert.doesNotMatch(client,/serverStartQueue\s*=\s*null/,
    'local resets and identity changes must never drop the server-start queue');
  assert.match(client,/current!==generation/);
  assert.match(client,/detail\.replay\.version !== 2/);
  assert.match(source,/body\?\.replay_capability === 'challenge_v2'/,
    'server must require explicit v2 client negotiation');
  assert.match(source,/challengeVersion = challengedStart \? 2 : 1/);
  assert.match(source,/const trustedForSession = trustedReceiptsEnabled &&/,
    'trusted receipt gate is per issued run, not global Worker release');
  assert.match(source,/if \(trustedReceiptsEnabled && !trustedForSession/);
  assert.match(client,/replay_capability:'challenge_v2'/);
  assert.match(client,/session\.replay_version===2\?2:1/,
    'cached legacy client must select its issued replay version');
  assert.match(client,/event\?\.detail\?\.replay_version === 2/,
    'mixed cached legacy game must still start the old session path');
});

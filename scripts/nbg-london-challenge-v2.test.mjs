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
  assert.match(game,/challengeHandshakeComplete = true/);
  assert.match(game,/rankedChallengeVersion === 2 && !lastTime/);
  assert.match(game,/requestAnimationFrame\(function\(next\)\{tick\(next,sequence\);\}\)/);
  assert.match(game,/return;\s*}\s*if \(!lastTime\) lastTime = time/);
  for(const control of ['KeyS','KeyX','ArrowLeft','KeyA','ArrowUp','Space','KeyW']){
    assert.ok(game.includes(control),'must preserve keyboard startup '+control);
  }
  assert.match(game,/pendingJumpPresses/);
  assert.match(game,/touch\.spray/);
  assert.match(game,/touch\.jump/);
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
  assert.match(client,/runPromise=\(async function\(\)/);
  assert.match(client,/current!==generation/);
  assert.match(client,/detail\.replay\.version !== 2/);
  assert.match(source,/trustedReceiptsEnabled \? 2 : 1/);
});

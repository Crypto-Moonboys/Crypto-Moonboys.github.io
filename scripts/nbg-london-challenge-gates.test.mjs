import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
  NBG_V2_CHALLENGE_GATE_COUNT,
  NBG_V2_CHALLENGE_FIRST_X,
  NBG_V2_CHALLENGE_STEP_X,
  nbgChallengeGateDirection,
  nbgChallengeGateStep,
  nbgChallengeGateX,
} from '../workers/leaderboard/nbg-london-run-challenge.js';

// No browser-provided nonce, hash field or self-attested "success" is
// accepted by the trusted verifier. It uses a D1-owned seed to demand an
// actual physical player-direction input at all 32 progression marks.
test('every seed bit determines one mutually exclusive physical course action',()=>{
  assert.equal(NBG_V2_CHALLENGE_GATE_COUNT,32);
  assert.equal(NBG_V2_CHALLENGE_FIRST_X,1900);
  assert.equal(NBG_V2_CHALLENGE_STEP_X,600);
  assert.equal(nbgChallengeGateX(0),1900);
  assert.equal(nbgChallengeGateX(31),20500);
  for(let i=0;i<32;i++){
    const oppositeSeed=2**i;
    assert.equal(nbgChallengeGateDirection(0,i),1,'bit zero requires Left');
    assert.equal(nbgChallengeGateDirection(oppositeSeed,i),2,'bit one requires Right');
    assert.equal(nbgChallengeGateStep(0,i,nbgChallengeGateX(i),3).failed,true,
      'left+right cannot satisfy either seed');
  }
});
function attemptWithRecordedActions(issuerSeed,targetSeed){
  let gateIndex=0;
  for(let i=0;i<NBG_V2_CHALLENGE_GATE_COUNT;i++){
    const playerAction=nbgChallengeGateDirection(issuerSeed,i);
    const position=nbgChallengeGateX(i);
    const before=nbgChallengeGateStep(targetSeed,gateIndex,position-1,playerAction);
    assert.equal(before.gateIndex,gateIndex,'must not pass before contact');
    const verdict=nbgChallengeGateStep(targetSeed,gateIndex,position,playerAction);
    if(verdict.failed)return {accepted:false,firstFailedGate:i};
    gateIndex=verdict.gateIndex;
  }
  return {accepted:gateIndex===NBG_V2_CHALLENGE_GATE_COUNT};
}
test('replay from ANY distinct 32-bit seed fails at its first different physical gate',()=>{
  const chosen=[0,1,2,3,37,12345,12382,0x80000000,0xffffffff,0x7fffffff,
    0xf0f0f0f0,0x0f0f0f0f];
  for(const s of chosen){
    assert.equal(attemptWithRecordedActions(s,s).accepted,true);
    for(const other of chosen){
      if(s===other)continue;
      const outcome=attemptWithRecordedActions(s,other);
      assert.equal(outcome.accepted,false,
        'recorded LEFT/RIGHT sequence for '+s+' must fail challenge '+other);
      assert.equal(outcome.firstFailedGate>=0,true);
    }
  }
  // Last bit is non-optional: a challenge differing only at tag #32 fails.
  assert.equal(attemptWithRecordedActions(0,0x80000000).firstFailedGate,31);
  // Exact Codex attack: 12345+37 preserves old acceleration modulo 37.
  assert.equal(attemptWithRecordedActions(12345,12382).accepted,false);
});
test('32 separate input gates cover original finish and are mirrored in browser',()=>{
  const browser=readFileSync('game/nbg-level1.js','utf8');
  const verifier=readFileSync('workers/leaderboard/nbg-london-replay.js','utf8');
  assert.match(browser,/var targetX = 1900 \+ rankedChallengeGateIndex \* 600;/);
  assert.match(browser,/rankedChallengeSeed >>> rankedChallengeGateIndex/);
  assert.match(browser,/if \(\(activeInputMask & 3\) !== required\) rankedChallengeGateFailed = true/);
  assert.match(browser,/updatePlayer\(dt\);\s*updateChallengeGates\(\)/);
  assert.match(browser,/\/32: HOLD /);
  assert.match(verifier,/nbgChallengeGateStep\(challengeSeed,challengeGateIndex,p\.x,mask\)/);
  assert.match(verifier,/if \(gate\.failed\)/);
  assert.match(verifier,/challengeGateIndex!==NBG_V2_CHALLENGE_GATE_COUNT/);
  assert.ok(nbgChallengeGateX(31)<21850,'32nd gate precedes the real level finish');
});
test('invalid mask and unissued seed fail rather than silently granting proof',()=>{
  assert.throws(()=>nbgChallengeGateDirection(-1,0),/invalid_challenge_seed/);
  assert.throws(()=>nbgChallengeGateDirection(2**32,0),/invalid_challenge_seed/);
  assert.equal(nbgChallengeGateStep(17,32,22000,2).complete,true);
  assert.throws(()=>nbgChallengeGateStep(17,0,1900,16),/invalid_challenge_action/);
  assert.throws(()=>nbgChallengeGateX(-1),/invalid_challenge_gate_index/);
});

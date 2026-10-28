import assert from 'node:assert/strict';
import {
  verifyNbgLondonReplay,
  NBG_REPLAY_VERSION,
  isNbgSweptStomp,
} from '../workers/leaderboard/nbg-london-replay.js';

function frameStream(frames) {
  const bytes = [];
  for (const [dt, elapsed, mask] of frames) {
    const d = Math.round(dt * 10);
    const wall=Math.round(elapsed * 10);
    bytes.push(d & 255, (d >> 8) & 255, wall & 255, (wall >> 8) & 255, mask);
  }
  return { version: NBG_REPLAY_VERSION, frames: Buffer.from(bytes).toString('base64') };
}
const id = '00000000-0000-4000-8000-000000000001';
const base = { runId:id, startedAtMs:1000000, now:1100000 };

const sweptStompTarget = { x:500, y:172, w:28, h:42 };
assert.equal(isNbgSweptStomp(
  { x:500, w:32, vy:0 }, 70, 168, 214, sweptStompTarget
), true, 'v3 replay combat must accept a stomp that crosses the full enemy in one tick');
assert.equal(isNbgSweptStomp(
  { x:540, w:32, vy:0 }, 70, 168, 214, sweptStompTarget
), false, 'a swept descent outside the enemy width must not become a stomp');

// Fabricated physics time cannot exceed recorded real time, including at
// the 1ms/2.5ms edge that previously allowed accelerated scores.
const forgedTime = frameStream(Array.from({length:3000}, () => [2.5,1,2]));
assert.equal((await verifyNbgLondonReplay({
  ...base, replay:forgedTime
})).valid, false, 'input frames cannot simulate more time than actually elapsed');

// Adjacent-frame grounded jump + double-jump is valid game input, not a
// malformed replay even though this short input stream cannot finish.
const quickDouble = frameStream(Array.from({length:40},(_,i) =>
  [33,33,2 | (i<2?4:0)]));
const quickDoubleResult = await verifyNbgLondonReplay({
  ...base, replay:quickDouble, debug:true
});
assert.equal(quickDoubleResult.debug?.reason, 'finish',
  'the Worker must accept adjacent-frame double jump transitions');

const invalid = await verifyNbgLondonReplay({ ...base, replay: {
  version:1, frames:'obviously-invalid'
} });
assert.equal(invalid.valid, false, 'malformed replay must not save');

const spoof = await verifyNbgLondonReplay({
  ...base,
  replay: { ...frameStream(Array.from({length:3000}, () => [33,33,2])), xp:1000000,
    complete:true, coins:312 }
});
assert.equal(spoof.valid, false,
  'browser-reported million XP and a simple held-right script cannot skip crates');

// Generate a physically driven course completion against the SAME replay
// physics, then replay those recorded bytes independently with no callbacks.
let legitimate = null;
const diagnostics = [];
for (const approach of [80,95,110,125,140,160]) {
  const frames = Array.from({length:5100}, () => [33,33,0]);
  const masks=[];
  let lastJump=-1000;
  const inspected = await verifyNbgLondonReplay({
    runId:id, replay:frameStream(frames),
    startedAtMs:1000000, now:1000000+5100*33, debug:true,
    testInputOverride(state) {
      const obstacle = state.obstacles.filter(o =>
        o.x + o.w > state.x && o.x < state.x + 190)
        .sort((a,b)=>a.x-b.x)[0];
      const distance=obstacle ? obstacle.x-state.x : Infinity;
      const canJump=state.elapsed-lastJump>180;
      let mask=10; // move right + spray
      if(canJump && state.grounded && distance < approach && distance > -35) {
        mask|=4;lastJump=state.elapsed;
      } else if(canJump && !state.grounded && state.jumps===1 &&
          state.vy>1 && distance<55 && distance>-35) {
        mask|=4;lastJump=state.elapsed;
      }
      masks.push(mask);
      return mask;
    }
  });
  diagnostics.push({approach, ...(inspected.debug || {}), valid:inspected.valid});
  if(!inspected.debug?.complete) continue;
  const count=inspected.debug.consumedFrames;
  const replay=frameStream(masks.slice(0,count).map(mask=>[33,33,mask]));
  const calculated=await verifyNbgLondonReplay({
    runId:id, replay, startedAtMs:1000000, now:1000000+count*33
  });
  if(calculated.valid){legitimate={replay,count,result:calculated};break;}
}
assert.ok(legitimate, 'at least one physically completed replay must save: ' +
  JSON.stringify(diagnostics));

const tampered = await verifyNbgLondonReplay({
  runId:id, startedAtMs:1000000, now:1000000+legitimate.count*33,
  replay: { ...legitimate.replay, xp:1000000, coins:312, complete:true }
});
assert.equal(tampered.xp, legitimate.result.xp,
  'untrusted counters never change server-computed XP');
assert.ok(legitimate.result.xp < 1000000 && legitimate.result.xp >= 0,
  'official XP is bounded by rewards physically reachable in the course');

// Replay frame format remains v1; course version 2 is an explicit additive
// layout capability. Cached players omit it and continue using the original
// 6 secrets, original enemy placement and two-jump physics.
const tripleInputs = frameStream(Array.from({length:15},(_,i) =>
  [33,33,2 | ([0,2,4,6].includes(i) ? 4 : 0)]));
const tripleReplay = { ...tripleInputs, course_version: 2 };
const tripleVerified = await verifyNbgLondonReplay({
  ...base, replay:tripleReplay, debug:true
});
assert.equal(tripleVerified.debug?.courseVersion, 2,
  'revision 2 must be selected explicitly, never inferred from cached v1 replay frames');
assert.equal(tripleVerified.debug?.jumps, 3,
  'three distinct airborne Jump presses consume the third jump, the fourth does not');
const oldDouble = await verifyNbgLondonReplay({
  ...base, replay:tripleInputs, debug:true
});
assert.equal(oldDouble.debug?.jumps, 2,
  'cached v1 clients must retain their original two-jump mechanics');
const alignedTriple = await verifyNbgLondonReplay({
  ...base, replay: { ...tripleReplay, course_version: 3 }, debug: true
});
assert.equal(alignedTriple.debug?.courseVersion, 3,
  'revision 3 must remain verifiable with its original recurring spawn rules');
const singleRatTriple = await verifyNbgLondonReplay({
  ...base, replay: { ...tripleReplay, course_version: 4 }, debug: true
});
assert.equal(singleRatTriple.debug?.courseVersion, 4,
  'revision 4 must select the single start-area parachute rule');
const mechanicsTriple = await verifyNbgLondonReplay({
  ...base, replay: { ...tripleReplay, course_version: 5 }, debug: true
});
assert.equal(mechanicsTriple.debug?.courseVersion, 5,
  'revision 5 must select speed-box, Graffbot-fire and balloon-enemy rules');
const legacySix = await verifyNbgLondonReplay({
  ...base, replay: { ...tripleReplay, course_version: 6 }, debug: true
});
assert.equal(legacySix.debug?.courseVersion, 6,
  'existing version 6 collision geometry must remain accepted');
const crouchSeven = await verifyNbgLondonReplay({
  ...base, replay: { ...tripleReplay, course_version: 7 }, debug: true
});
assert.equal(crouchSeven.debug?.courseVersion, 7,
  'revision 7 must accept crouch-capable client replays');
const crouchInput = frameStream(Array.from({length:20}, () => [33,33,16]));
const crouched = await verifyNbgLondonReplay({
  ...base, replay: { ...crouchInput, course_version: 7 }, debug:true
});
assert.equal(crouched.debug?.reason, 'finish', 'v7 input bit 16 must be decoded as crouch');
assert.equal(crouched.debug?.height, 22, 'the Worker must shorten the crouched collision box');
assert.equal(crouched.debug?.crouching, true, 'crouch must persist while Down is held');
assert.equal(crouched.debug?.x, 64, 'Down alone must not steer or cause friction drift');
const sneaking = await verifyNbgLondonReplay({
  ...base, replay: { ...frameStream(Array.from({length:20}, () => [33,33,18])), course_version:7 }, debug:true
});
assert.equal(sneaking.debug?.crouching, true, 'Down+Right must remain crouched');
assert.ok(sneaking.debug?.x > 64, 'Down+Right must move the player');
const releasedCrouch = await verifyNbgLondonReplay({
  ...base, replay: { ...frameStream([
    ...Array.from({length:20}, () => [33,33,16]),
    ...Array.from({length:5}, () => [33,33,0])
  ]), course_version:7 }, debug:true
});
assert.equal(releasedCrouch.debug?.height, 34,
  'releasing Down with enough headroom restores the standing box');
const rejectedLegacyMask = await verifyNbgLondonReplay({
  ...base, replay: { ...crouchInput, course_version:6 }, debug:true
});
assert.equal(rejectedLegacyMask.debug, undefined,
  'versions older than v7 must reject unknown crouch input bits');
// Browser-observed timeline: the game emits a zero-dt start frame, starts
// spray on a 33ms frame, then presses Down for seven 33ms frames. The browser
// crouches on the seventh Down frame (264ms elapsed), with x=82 after the
// *previous* spray sprite's 70px overhang clamp. Earlier Worker logic lagged
// this transition by one tick, shifting hitboxes/XP for ranked replay.
const observedSprayRelease = [
  [0,0,0], [33,33,8],
  ...Array.from({length:7}, () => [33,33,16])
];
const observedParity = await verifyNbgLondonReplay({
  ...base, replay:{ ...frameStream(observedSprayRelease), course_version:7 }, debug:true
});
assert.deepEqual(
  [observedParity.debug?.x, observedParity.debug?.y,
    observedParity.debug?.height, observedParity.debug?.crouching],
  [82,192,22,true],
  'v7 Worker must match the browser at the exact spray-to-Down transition'
);
const beforeCrouch = await verifyNbgLondonReplay({
  ...base,
  replay:{ ...frameStream(observedSprayRelease.slice(0,-1)), course_version:7 },
  debug:true
});
assert.deepEqual(
  [beforeCrouch.debug?.x, beforeCrouch.debug?.y,
    beforeCrouch.debug?.height, beforeCrouch.debug?.crouching],
  [82,180,34,false],
  'v7 Worker must not crouch a frame before the browser allows it'
);
const oldVersionSpray = await verifyNbgLondonReplay({
  ...base,
  replay:{ ...frameStream(observedSprayRelease.map(([dt,ms,mask]) =>
    [dt,ms,mask & ~16])), course_version:6 },
  debug:true
});
assert.equal(oldVersionSpray.debug?.x,64,
  'archived v6 must retain its original world-boundary and spray behaviour');
// Reproduces the reviewed v7 third-jump clash: spray on frame seven makes
// the previous frame's render margin 70px, but a third Jump on frame nine
// changes to the 24px-margin backflip before that frame's horizontal clamp.
// Failing to use the pre-clamp backflip art leaves the Worker stuck at x=82.
const thirdJumpAfterSpray = Array.from({length:9}, (_, index) =>
  [33,33,1 | ([0,4,8].includes(index) ? 4 : 0) | (index===6 ? 8 : 0)]);
const thirdJumpFrame8 = await verifyNbgLondonReplay({
  ...base, replay:{...frameStream(thirdJumpAfterSpray.slice(0,8)),course_version:7},debug:true
});
assert.equal(thirdJumpFrame8.debug?.x,82,
  'spray art must still keep the v7 player at x=82 just before third Jump');
const thirdJumpFrame9 = await verifyNbgLondonReplay({
  ...base, replay:{...frameStream(thirdJumpAfterSpray),course_version:7},debug:true
});
assert.equal(thirdJumpFrame9.debug?.jumps,3,
  'frame nine must be the legitimate third airborne Jump');
assert.ok(Math.abs(thirdJumpFrame9.debug?.x - 71.308) < 0.001,
  'third Jump must replace the spray margin with the narrower backflip margin before clamping');
assert.equal(thirdJumpFrame9.debug?.height,34,
  'the backflip must not apply crouched collision geometry');
// Cached v1 replays omit the property completely. An explicitly present
// null/undefined/invalid version is not equivalent and must be rejected.
for (const courseVersion of [null, undefined, 0, 1, '2', false, {}, []]) {
  const checked = await verifyNbgLondonReplay({
    ...base,
    replay: { ...tripleInputs, course_version: courseVersion },
    debug: true
  });
  assert.equal(checked.valid, false,
    'explicit unsupported course_version must reject: ' + String(courseVersion));
  assert.equal(checked.debug, undefined,
    'unsupported versions must fail before replay physics is simulated');
}
assert.equal(oldDouble.debug?.courseVersion, 1,
  'omitting course_version retains the original legacy course');

// Revision 4 deterministically creates one visible start-area rat and never
// replenishes it after the old recurring timer window has elapsed.
let maxParachuteSpawns = 0;
let firstParachuteX = null;
await verifyNbgLondonReplay({
  runId:id,
  replay:{ ...frameStream(Array.from({length:420},()=>[33,33,0])), course_version:4 },
  startedAtMs:1000000, now:1000000+420*33, debug:true,
  testInputOverride(state) {
    maxParachuteSpawns=Math.max(maxParachuteSpawns,state.parachuteSpawnCount);
    if(firstParachuteX===null && state.parachuteRatX!==null) firstParachuteX=state.parachuteRatX;
    return 0;
  }
});
assert.equal(maxParachuteSpawns,1,
  'authoritative v4 replay must spawn exactly one parachute rat in 13+ seconds');
assert.ok(firstParachuteX>=350 && firstParachuteX<=430,
  'authoritative v4 rat must share the browser start-area position');

// Exercise an entire physically completed revision-5 course with the finite
// speed boxes, Graffbot fire, balloon reward and single start-area rat,
// then verify the recorded input bytes independently. No browser XP claims.
let updatedCourse = null;
const revision5Diagnostics = [];
for (const approach of [60,80,100,120,140,160,180]) {
  const frames = Array.from({length:5600}, () => [33,33,0]);
  const masks=[];
  let lastJump=-1000;
  const input = state => {
    // Version 5 can move at 6 px/step while boosted. Scale the obstacle lead
    // by current velocity so this remains a physical control replay instead
    // of driving the faster runner with the legacy fixed-distance timing.
    const lead=approach+Math.abs(state.vx)*20+
      (state.speedBoostActive ? 35 : 0);
    const obstacle = state.obstacles.filter(o =>
      o.x + o.w > state.x && o.x < state.x + Math.max(240,lead+45))
      .sort((a,b)=>a.x-b.x)[0];
    const distance=obstacle ? obstacle.x-state.x : Infinity;
    const canJump=state.elapsed-lastJump>180;
    let mask=10; // right + spray: legal gameplay controls
    if(canJump && state.grounded && distance<lead && distance>-35) {
      mask|=4;lastJump=state.elapsed;
    } else if(canJump && !state.grounded && state.jumps>=1 &&
        state.jumps<3 && state.vy>1 && distance<lead-25 && distance>-35) {
      mask|=4;lastJump=state.elapsed;
    }
    masks.push(mask);
    return mask;
  };
  const inspected = await verifyNbgLondonReplay({
    runId:id, replay:{ ...frameStream(frames), course_version:5 },
    startedAtMs:1000000, now:1000000+5600*33, debug:true,
    testInputOverride:input
  });
  revision5Diagnostics.push({approach, ...(inspected.debug||{}), valid:inspected.valid});
  if(!inspected.debug?.complete) continue;
  const count=inspected.debug.consumedFrames;
  const replay={...frameStream(masks.slice(0,count).map(mask=>[33,33,mask])),course_version:5};
  const verified=await verifyNbgLondonReplay({
    runId:id, replay, startedAtMs:1000000, now:1000000+count*33,
    debug:true
  });
  if(verified.valid){updatedCourse={replay,count,result:verified,debug:verified.debug};break;}
}
assert.ok(updatedCourse, 'updated course must remain physically finishable and server-verifiable: '+
  JSON.stringify(revision5Diagnostics));
assert.ok(updatedCourse.result.xp>0 &&
  updatedCourse.result.secret_coins<=42,
  'revision-5 source XP and secret coins must be independently bounded');
assert.ok(updatedCourse.debug.speedBoxesCollected>0,
  'authoritative v5 replay must collect and reproduce in-world speed boxes');
assert.ok(updatedCourse.debug.balloonRewardTotal>=10&&updatedCourse.debug.balloonRewardTotal<=10000,
  'authoritative v5 replay must independently roll one bounded balloon XP reward');
// Confirm actual five-byte recorded masks containing grounded spray inputs
// are independently evaluated by the authoritative Worker. The browser-only
// injected brown-rat fixture above is NOT a valid ranked replay source;
// only Worker-created canonical enemies may contribute verified XP.
const canonicalSprayFrames = Buffer.from(updatedCourse.replay.frames, 'base64');
assert.ok(Array.from({length:canonicalSprayFrames.length / 5}, (_, i) => i * 5)
  .some(offset => (canonicalSprayFrames[offset + 4] & 8) !== 0),
  'successful revision-5 replay must contain genuine recorded spray inputs');
const noSprayFrames = Buffer.from(canonicalSprayFrames);
for (let offset = 4; offset < noSprayFrames.length; offset += 5)
  noSprayFrames[offset] &= ~8;
const noSprayReplay = {
  ...updatedCourse.replay, frames: noSprayFrames.toString('base64')
};
const withoutSpray = await verifyNbgLondonReplay({
  runId:id, replay:noSprayReplay,
  startedAtMs:1000000, now:1000000+updatedCourse.count*33
});
assert.ok(!withoutSpray.valid || withoutSpray.xp < updatedCourse.result.xp,
  'removing all spray from the same canonical complete input must invalidate the run or reduce authoritative Worker XP');
const spoofedUpdated=await verifyNbgLondonReplay({
  runId:id, replay:{...updatedCourse.replay,xp:1000000,coins:999},
  startedAtMs:1000000, now:1000000+updatedCourse.count*33
});
assert.equal(spoofedUpdated.xp,updatedCourse.result.xp,
  'untrusted 1-million browser XP must not affect revision-5 authoritative scoring');

console.log('[PASS] NBG London server-derived replay score protection');

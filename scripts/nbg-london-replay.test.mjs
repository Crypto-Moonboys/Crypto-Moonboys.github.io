import assert from 'node:assert/strict';
import { verifyNbgLondonReplay, NBG_REPLAY_VERSION } from '../workers/leaderboard/nbg-london-replay.js';

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
  'revision 3 must select aligned combat geometry without changing replay bytes');
assert.equal((await verifyNbgLondonReplay({
  ...base, replay: { ...tripleReplay, course_version: 4 }
})).valid, false, 'unapproved course revisions must fail rather than silently downgrade');
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

// Exercise an entire physically completed revision-3 course (with more
// enemies, all eighteen sections of secrets and faster parachute encounters),
// then verify the recorded input bytes independently. No browser XP claims.
let updatedCourse = null;
const revision3Diagnostics = [];
for (const approach of [80,95,110,125,140,160,175]) {
  const frames = Array.from({length:5600}, () => [33,33,0]);
  const masks=[];
  let lastJump=-1000;
  const input = state => {
    const obstacle = state.obstacles.filter(o =>
      o.x + o.w > state.x && o.x < state.x + 210)
      .sort((a,b)=>a.x-b.x)[0];
    const distance=obstacle ? obstacle.x-state.x : Infinity;
    const canJump=state.elapsed-lastJump>180;
    let mask=10; // right + spray: legal gameplay controls
    if(canJump && state.grounded && distance<approach && distance>-35) {
      mask|=4;lastJump=state.elapsed;
    } else if(canJump && !state.grounded && state.jumps===1 &&
        state.vy>1 && distance<65 && distance>-35) {
      mask|=4;lastJump=state.elapsed;
    }
    masks.push(mask);
    return mask;
  };
  const inspected = await verifyNbgLondonReplay({
    runId:id, replay:{ ...frameStream(frames), course_version:3 },
    startedAtMs:1000000, now:1000000+5600*33, debug:true,
    testInputOverride:input
  });
  revision3Diagnostics.push({approach, ...(inspected.debug||{}), valid:inspected.valid});
  if(!inspected.debug?.complete) continue;
  const count=inspected.debug.consumedFrames;
  const replay={...frameStream(masks.slice(0,count).map(mask=>[33,33,mask])),course_version:3};
  const verified=await verifyNbgLondonReplay({
    runId:id, replay, startedAtMs:1000000, now:1000000+count*33
  });
  if(verified.valid){updatedCourse={replay,count,result:verified};break;}
}
assert.ok(updatedCourse, 'updated course must remain physically finishable and server-verifiable: '+
  JSON.stringify(revision3Diagnostics));
assert.ok(updatedCourse.result.xp>0 &&
  updatedCourse.result.secret_coins<=42,
  'revision-3 source XP and secret coins must be independently bounded');
// Confirm actual five-byte recorded masks containing grounded spray inputs
// are independently evaluated by the authoritative Worker. The browser-only
// injected brown-rat fixture above is NOT a valid ranked replay source;
// only Worker-created canonical enemies may contribute verified XP.
const canonicalSprayFrames = Buffer.from(updatedCourse.replay.frames, 'base64');
assert.ok(Array.from({length:canonicalSprayFrames.length / 5}, (_, i) => i * 5)
  .some(offset => (canonicalSprayFrames[offset + 4] & 8) !== 0),
  'successful revision-3 replay must contain genuine recorded spray inputs');
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
  'untrusted 1-million browser XP must not affect revision-2 authoritative scoring');

console.log('[PASS] NBG London server-derived replay score protection');

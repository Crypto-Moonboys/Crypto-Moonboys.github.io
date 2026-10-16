import assert from 'node:assert/strict';
import { verifyNbgLondonReplay, NBG_REPLAY_VERSION } from '../workers/leaderboard/nbg-london-replay.js';

function frameStream(frames) {
  const bytes = [];
  for (const [dt, elapsed, mask] of frames) {
    const d = Math.round(dt * 10);
    bytes.push(d & 255, (d >> 8) & 255, elapsed & 255, (elapsed >> 8) & 255, mask);
  }
  return { version: NBG_REPLAY_VERSION, frames: Buffer.from(bytes).toString('base64') };
}
const id = '00000000-0000-4000-8000-000000000001';
const base = { runId:id, startedAtMs:1000000, now:1100000 };

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
console.log('[PASS] NBG London server-derived replay score protection');

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

// Find a simulated input sequence that actually finishes the 22,000 px
// level. Use the server's completion frame, not a browser-computed position.
let legitimate = null;
const diagnostics = [];
for (const period of [8,10,12,14,16,18,20,24,30]) {
  const frames = Array.from({length:5100}, (_,i) =>
    [33,33,10 | (i % period === 0 ? 4 : 0)]);
  const inspected = await verifyNbgLondonReplay({
    runId:id, replay:frameStream(frames),
    startedAtMs:1000000, now:1000000+5100*33, debug:true
  });
  diagnostics.push({period, ...(inspected.debug || {}), valid:inspected.valid});
  if(!inspected.debug?.complete) continue;
  const count=inspected.debug.consumedFrames;
  const completedReplay=frameStream(frames.slice(0,count));
  const calculated = await verifyNbgLondonReplay({
    runId:id, replay:completedReplay,
    startedAtMs:1000000, now:1000000+count*33
  });
  if(calculated.valid) {
    legitimate={replay:completedReplay, count, result:calculated};
    break;
  }
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

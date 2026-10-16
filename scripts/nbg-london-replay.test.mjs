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

// A complete *physical* replay must derive points from the level's
// collectibles and checkpoints. A scripted replay may be fast, but cannot
// claim extra XP that the simulator did not earn.
const honestInputs = [];
for(let i=0;i<5100;i++){
  honestInputs.push([33,33,10 | (i % 10 === 0 ? 4 : 0)]);
}
const honestReplay = frameStream(honestInputs);
const result = await verifyNbgLondonReplay({
  runId:id, replay:honestReplay,
  startedAtMs:1000000, now:1000000+5100*33
});
// If this replay does not complete the level, it must be rejected: no
// authenticated account, elapsed clock or plausible XP claim overrides it.
assert.ok(result.valid === false || (result.complete === true &&
  Number.isSafeInteger(result.xp) && result.xp >= 0 && result.xp < 1000000));
if(result.valid) {
  const tampered = await verifyNbgLondonReplay({
    runId:id, startedAtMs:1000000, now:1000000+5100*33,
    replay: { ...honestReplay, xp:1000000, coins:312, complete:true }
  });
  assert.equal(tampered.xp, result.xp, 'untrusted counters never change calculated XP');
}
console.log('[PASS] NBG London server-derived replay score protection');

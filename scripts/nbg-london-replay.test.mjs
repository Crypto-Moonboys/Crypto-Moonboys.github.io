import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifyNbgLondonReplay, NBG_REPLAY_VERSION, fingerprintNbgLondonReplay } from '../workers/leaderboard/nbg-london-replay.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

function frameStream(frames) {
  const bytes = [];
  for (const [dt, elapsed, mask] of frames) {
    const d = Math.round(dt * 10);
    const wall=Math.round(elapsed * 10);
    bytes.push(d & 255, (d >> 8) & 255, wall & 255, (wall >> 8) & 255, mask);
  }
  return { version: NBG_REPLAY_VERSION, frames: Buffer.from(bytes).toString('base64') };
}
const commonInputs = frameStream([[33,33,2],[33,33,6],[33,33,2],[33,33,10]]);
const sameControlsDifferentTime = frameStream([[32,32,2],[32,32,6],[32,32,2],[32,32,10]]);
const differentControls = frameStream([[33,33,2],[33,33,6],[33,33,2],[33,33,2]]);
const fingerprints = await fingerprintNbgLondonReplay(commonInputs);
const timingVariant = await fingerprintNbgLondonReplay(sameControlsDifferentTime);
const controlVariant = await fingerprintNbgLondonReplay(differentControls);
assert.match(fingerprints.replay_sha256,/^[a-f0-9]{64}$/);
assert.match(fingerprints.input_sha256,/^[a-f0-9]{64}$/);
assert.equal(fingerprints.replay_version,NBG_REPLAY_VERSION);
assert.equal(fingerprints.frame_count,4);
assert.equal(fingerprints.input_sha256,timingVariant.input_sha256,
  'time-only edits to the same physical button presses share the anti-replay digest');
assert.notEqual(fingerprints.replay_sha256,timingVariant.replay_sha256,
  'raw replay proof detects any changed timing bytes');
assert.notEqual(fingerprints.input_sha256,controlVariant.input_sha256);
assert.equal((await fingerprintNbgLondonReplay({...commonInputs,frames:'bad%%'})),null,
  'malformed base64 cannot generate a trusted source fingerprint');
assert.equal((await fingerprintNbgLondonReplay({...commonInputs,version:99})),null,
  'unknown replay versions cannot be promoted to trusted receipts');

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

// Codex P2: a copied valid run can change spray bits during the 230 ms
// cooldown without changing physics, XP, or completion. Uncanonicalized
// raw control hashes treat that copy as a new run. The Worker now hashes
// the actual server-applied action stream instead.
const acceptedBytes=Buffer.from(legitimate.replay.frames,'base64');
const ignoredSprayFrame=legitimate.result.effective_input_masks.findIndex(
  (effective,i)=>(acceptedBytes[i*5+4]&8)!==0 && (effective&8)===0,
);
assert.ok(ignoredSprayFrame>=0,
  'the real completed replay must contain a spray tap ignored by cooldown');
const editedBytes=Buffer.from(acceptedBytes);
editedBytes[ignoredSprayFrame*5+4]&=~8;
const editedReplay={version:1,frames:editedBytes.toString('base64')};
const editedVerified=await verifyNbgLondonReplay({
  runId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  replay:editedReplay,
  startedAtMs:1000000,now:1000000+legitimate.count*33,
});
assert.equal(editedVerified.valid,true,
  'removing a semantically ignored spray tap must leave source replay valid');
assert.equal(editedVerified.xp,legitimate.result.xp,
  'changing a cooldown-ignored button cannot alter score');
assert.equal(editedVerified.time_ms,legitimate.result.time_ms);
const originalFingerprints=await fingerprintNbgLondonReplay(
  legitimate.replay,legitimate.result.effective_input_masks,
);
const editedFingerprints=await fingerprintNbgLondonReplay(
  editedReplay,editedVerified.effective_input_masks,
);
assert.notEqual(originalFingerprints.replay_sha256,editedFingerprints.replay_sha256,
  'decoded bytes are visibly different');
assert.equal(originalFingerprints.input_sha256,editedFingerprints.input_sha256,
  'canonical effective-action fingerprint blocks the disguised copied run');
assert.notEqual(
  (await fingerprintNbgLondonReplay(legitimate.replay)).input_sha256,
  editedFingerprints.input_sha256,
  'original uncanonicalized raw stream is not authoritative for trusted receipts',
);

console.log('[PASS] NBG London server-derived replay score protection');

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.resolve(here, '../main.js');
const source = await fs.readFile(mainPath, 'utf8');

class FakeCanvas {}

const fakeDoc = {
  body: { appendChild() {} },
  getElementById() {
    return null;
  },
  createElement() {
    return {
      style: {},
      setAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      getContext() {
        return null;
      },
    };
  },
};

const context = vm.createContext({
  console,
  Math,
  Date,
  setTimeout,
  clearTimeout,
  performance: { now: () => 0 },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  HTMLCanvasElement: FakeCanvas,
  window: {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  },
  document: fakeDoc,
});
context.window.document = fakeDoc;
context.window.HTMLCanvasElement = FakeCanvas;
context.window.requestAnimationFrame = context.requestAnimationFrame;
context.window.cancelAnimationFrame = context.cancelAnimationFrame;

vm.runInContext(source, context, { filename: 'main.js' });
const api = context.window.BlockTopiaMap;
assert.ok(api, 'BlockTopiaMap API should initialize.');

function feedbackMessages() {
  return (api.getSnapshot().feedback || []).map((entry) => String(entry.message || ''));
}

function feedMessages() {
  return (api.getSnapshot().feed || []).map((entry) => String(entry || ''));
}

api.setInputEnabled(true);
api.setConnectionStatus({ ws: 'connected', joined: true, roomId: 'city' });
api.setNpcs([{ id: 'npc_1', x: 1, y: 1, hp: 20, maxHp: 40, kind: 'raider' }]);

// 1) Downed player attack => DOWNED/respawn message
api.clearFeedback();
api.setLocalPlayer({ x: 1, y: 1, hp: 0, respawnAt: Date.now() + 3000 });
api.triggerAttack();
assert.ok(
  feedbackMessages().some((msg) => msg.includes('DOWNED') && msg.includes('respawning')),
  'Downed player attack should emit a DOWNED/respawning feedback message.',
);

// 2) No NPC in range => No NPC in range
api.clearFeedback();
api.setLocalPlayer({ x: 1, y: 1, hp: 100, respawnAt: 0 });
api.setNpcs([{ id: 'npc_far', x: 19, y: 19, hp: 20, maxHp: 40, kind: 'raider' }]);
api.triggerAttack();
assert.ok(
  feedbackMessages().some((msg) => msg.includes('No NPC in range')),
  'Out-of-range attack should emit "No NPC in range".',
);

// 3) Disconnected / send false => Not connected
api.clearFeedback();
api.setConnectionStatus({ ws: 'offline', joined: false, roomId: '' });
api.setNpcs([{ id: 'npc_near', x: 1, y: 2, hp: 20, maxHp: 40, kind: 'raider' }]);
api.setAttackSink(() => ({ ok: false, reason: 'disconnected' }));
api.triggerAttack();
assert.ok(
  feedbackMessages().some((msg) => msg.includes('Not connected')),
  'Disconnected attack attempt should emit "Not connected".',
);

// 4) Valid attack => sink called, no error feedback
let sinkCalls = 0;
api.clearFeedback();
api.setConnectionStatus({ ws: 'connected', joined: true, roomId: 'city' });
api.setNpcs([{ id: 'npc_near_2', x: 1, y: 2, hp: 20, maxHp: 40, kind: 'raider' }]);
api.setAttackSink(() => {
  sinkCalls += 1;
  return { ok: true };
});
api.triggerAttack();
assert.equal(sinkCalls, 1, 'Valid attack should call attack sink exactly once.');
assert.equal(
  feedbackMessages().some((msg) => msg.includes('Not connected') || msg.includes('No NPC in range') || msg.includes('Attack cooling down')),
  false,
  'Valid attack should not emit an error feedback message.',
);

// 5) Local cooldown active => Attack cooling down
api.triggerAttack();
assert.ok(
  feedbackMessages().some((msg) => msg.includes('Attack cooling down')),
  'Cooldown attack attempt should emit "Attack cooling down".',
);

// 6) Feed dedupe should throttle repeated identical class-key events only
api.pushFeed('System: Player_1111 neutralized npc_2.');
api.pushFeed('System: Player_1111 neutralized npc_2.');
api.pushFeed('System: Player_1111 neutralized npc_3.');
api.pushFeed('System: Player_1111 was downed by npc_9.');
api.pushFeed('System: Player_1111 was downed by npc_9.');
api.pushFeed('System: Player_2222 was downed by npc_9.');
const feedAfter = feedMessages().slice(-6);
const neutralizedNpc2Count = feedAfter.filter((msg) => msg.includes('neutralized npc_2')).length;
const neutralizedNpc3Count = feedAfter.filter((msg) => msg.includes('neutralized npc_3')).length;
const downed1111Count = feedAfter.filter((msg) => msg.includes('Player_1111 was downed by npc_9')).length;
const downed2222Count = feedAfter.filter((msg) => msg.includes('Player_2222 was downed by npc_9')).length;
assert.equal(neutralizedNpc2Count, 1, 'Repeated neutralized feed for same NPC should dedupe.');
assert.equal(neutralizedNpc3Count, 1, 'Distinct NPC neutralization should still appear.');
assert.equal(downed1111Count, 1, 'Repeated downed feed for same player/NPC pair should dedupe.');
assert.equal(downed2222Count, 1, 'Distinct downed feed for another player should still appear.');

console.log('Block Topia attack feedback smoke checks passed.');

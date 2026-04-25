import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const npcSystemPath = path.resolve(here, '../world/npc-system.js');
const isoRendererPath = path.resolve(here, '../render/iso-renderer.js');
const networkPath = path.resolve(here, '../network.js');
const source = await fs.readFile(npcSystemPath, 'utf8');
const isoSource = await fs.readFile(isoRendererPath, 'utf8');
const networkSource = await fs.readFile(networkPath, 'utf8');

const createNpcDefIndex = source.indexOf('function createNpc(');
assert.notEqual(
  createNpcDefIndex,
  -1,
  'Expected module-scope function createNpc(...) to exist in npc-system.js.',
);

const ensureStart = source.indexOf('function ensureHunterEntities(');
assert.notEqual(
  ensureStart,
  -1,
  'Expected ensureHunterEntities(...) to exist in npc-system.js.',
);

const stepHunterStart = source.indexOf('function stepHunterNpc(');
assert.notEqual(
  stepHunterStart,
  -1,
  'Expected stepHunterNpc(...) to exist in npc-system.js.',
);

const ensureBody = source.slice(ensureStart, stepHunterStart);
const createNpcCallInEnsure = ensureBody.indexOf('createNpc(');
assert.notEqual(
  createNpcCallInEnsure,
  -1,
  'Expected ensureHunterEntities(...) to reference createNpc(...).',
);

const createNpcCallIndex = ensureStart + createNpcCallInEnsure;
assert.ok(
  createNpcDefIndex < createNpcCallIndex,
  'createNpc(...) must be defined before ensureHunterEntities(...) references it.',
);

const npcSystemModule = await import(pathToFileURL(npcSystemPath).href);
assert.equal(
  typeof npcSystemModule.createNpcSystem,
  'function',
  'Expected npc-system.js to import successfully and export createNpcSystem.',
);

const covertOverlayStart = isoSource.indexOf('function drawCovertNodeOverlay(');
assert.notEqual(
  covertOverlayStart,
  -1,
  'Expected drawCovertNodeOverlay(...) to exist in iso-renderer.js.',
);

const covertOverlayEnd = isoSource.indexOf('function drawSignalRouterOverlay(', covertOverlayStart);
assert.notEqual(
  covertOverlayEnd,
  -1,
  'Expected drawSignalRouterOverlay(...) to exist after drawCovertNodeOverlay(...).',
);

const covertOverlayBody = isoSource.slice(covertOverlayStart, covertOverlayEnd);
assert.ok(
  covertOverlayBody.includes('if (!node || !node.id || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;'),
  'drawCovertNodeOverlay(...) must guard null/invalid node data before reading node fields.',
);
assert.ok(
  covertOverlayBody.includes('Number(covert?.risk)'),
  'drawCovertNodeOverlay(...) must read covert risk with optional chaining.',
);
assert.equal(
  covertOverlayBody.includes('covert.risk'),
  false,
  'drawCovertNodeOverlay(...) must not directly read covert.risk without null guards.',
);

const isRoomOpenStart = networkSource.indexOf('function isRoomOpen() {');
assert.notEqual(
  isRoomOpenStart,
  -1,
  'Expected isRoomOpen() to exist in network.js.',
);

const isConnectedStart = networkSource.indexOf('export function isConnected()', isRoomOpenStart);
assert.notEqual(
  isConnectedStart,
  -1,
  'Expected isConnected() to exist after isRoomOpen() in network.js.',
);

const isRoomOpenBody = networkSource.slice(isRoomOpenStart, isConnectedStart);
assert.ok(
  isRoomOpenBody.includes('if (!room || !room.sessionId) return false;'),
  'isRoomOpen() must require a joined room with sessionId.',
);
assert.ok(
  isRoomOpenBody.includes('conn.ws'),
  'isRoomOpen() must support room.connection.ws shape.',
);
assert.ok(
  isRoomOpenBody.includes('conn.transport?.ws'),
  'isRoomOpen() must support room.connection.transport.ws shape.',
);
assert.ok(
  isRoomOpenBody.includes('conn.transport?.socket'),
  'isRoomOpen() must support room.connection.transport.socket fallback shape.',
);
assert.ok(
  isRoomOpenBody.includes('conn.socket'),
  'isRoomOpen() must support room.connection.socket fallback shape.',
);
assert.ok(
  isRoomOpenBody.includes('conn.websocket'),
  'isRoomOpen() must support room.connection.websocket fallback shape.',
);
assert.ok(
  isRoomOpenBody.includes("typeof candidate.readyState === 'number'"),
  'isRoomOpen() must inspect socket readyState before treating a candidate as open.',
);
assert.ok(
  isRoomOpenBody.includes('return ws.readyState === OPEN;'),
  'isRoomOpen() must still return false for genuinely closed transport.',
);

console.log('Block Topia npc/overlay/network smoke/static checks passed.');

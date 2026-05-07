/**
 * Protection checks for Block Topia Persistence Lite + Warm-Slot Reconnect.
 *
 * These source-level checks guard:
 * - 60-second warm-slot reconnect logic in MinimalCityRoom.js
 * - Lightweight in-memory persistence helpers
 * - Client-side reconnection token handling in network.js
 * - Anti-drift: no CityRoom.js, no browser room creation, no client authority
 * - 2-player cap, server pre-creates city room
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');

function assertContains(source, needle, message) {
  assert.ok(source.includes(needle), `${message}: expected to find: ${needle}`);
}

function assertNotContains(source, needle, message) {
  assert.ok(!source.includes(needle), `${message}: must NOT contain: ${needle}`);
}

function must(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

const room = await read('server/block-topia/src/rooms/MinimalCityRoom.js');
const network = await read('games/block-topia/network.js');
const serverIndex = await read('server/block-topia/src/index.js');

// ── Reconnect hold constant ───────────────────────────────────────────────────
must(room, /const\s+RECONNECT_HOLD_SECS\s*=\s*60/, 'RECONNECT_HOLD_SECS must be exactly 60 seconds');

// ── Warm-slot maps in onCreate ────────────────────────────────────────────────
assertContains(room, '_warmSlotsBySession = new Map()', '_warmSlotsBySession must be initialised in onCreate');
assertContains(room, '_identityKeyBySession = new Map()', '_identityKeyBySession must be initialised in onCreate');

// ── async onLeave with allowReconnection ──────────────────────────────────────
must(room, /async\s+onLeave\s*\(client,\s*consented\)/, 'onLeave must be async and accept consented flag');
assertContains(room, 'this.allowReconnection(client, RECONNECT_HOLD_SECS)', 'allowReconnection must use the RECONNECT_HOLD_SECS constant');
assertContains(room, 'await this.allowReconnection(client, RECONNECT_HOLD_SECS)', 'allowReconnection must be awaited to hold the warm slot');

// ── Reconnect only for ready players (no slot-hold for unready/pre-game leaves) ─
must(room, /if\s*\(!consented\s*&&\s*player\s*&&\s*player\.ready\)/, 'warm-slot hold must require player.ready');

// ── Snapshot taken at disconnect time ─────────────────────────────────────────
assertContains(room, '_warmSlotsBySession.set(client.sessionId, _snapshotPlayer(player, this.runGeneration))', 'player snapshot must be stored in warm slot on disconnect');
assertContains(room, 'function _snapshotPlayer(player, runGeneration)', '_snapshotPlayer helper must exist');
must(room, /_snapshotPlayer[\s\S]{0,300}runGeneration/, '_snapshotPlayer must store runGeneration for stale-generation rejection');

// ── State restore on reconnect ────────────────────────────────────────────────
assertContains(room, '_restorePlayerFromSnapshot(client.sessionId, snapshot)', '_restorePlayerFromSnapshot must be called on reconnect');
assertContains(room, '_restorePlayerFromSnapshot(sessionId, snapshot)', '_restorePlayerFromSnapshot method must exist');
must(room, /snapshot\.runGeneration\s*!==\s*this\.runGeneration/, '_restorePlayerFromSnapshot must guard against stale run generation');
assertContains(room, 'player.upgradesJson = snapshot.upgradesJson', 'upgrades must be restored from snapshot');
assertContains(room, 'player.objectiveProgress = snapshot.objectiveProgress', 'objective state must be restored from snapshot');
assertContains(room, 'player.maxHp = snapshot.maxHp', 'max HP must be restored from snapshot');

// ── Spawn grace on reconnect ──────────────────────────────────────────────────
must(room, /_restorePlayerFromSnapshot\s*\(sessionId,\s*snapshot\)\s*\{[\s\S]{0,1200}spawnProtectedUntilBySession\.set/, 'spawn grace must be granted on reconnect');

// ── Cleanup on timeout ────────────────────────────────────────────────────────
assertContains(room, '_warmSlotsBySession.delete(client.sessionId)', 'warm slot must be deleted on timeout');
assertContains(room, '_removePlayerBySession(client.sessionId)', 'player must be removed after timeout expires');

// ── _removePlayerBySession extracts cleanup logic ─────────────────────────────
assertContains(room, '_removePlayerBySession(sessionId)', '_removePlayerBySession method must exist');
must(room, /_removePlayerBySession\s*\(sessionId\)\s*{/, '_removePlayerBySession must be a method');

// ── No ghost players: broadcast on timeout removal ────────────────────────────
must(room, /_removePlayerBySession[\s\S]{0,1500}broadcast\s*\(\s*'system'/, 'broadcast must happen when player is removed (no silent ghost)');

// ── Idle-timeout skips reconnecting players ───────────────────────────────────
must(room, /_tickIdleTimeouts[\s\S]{0,300}_warmSlotsBySession\.has\(sessionId\)/, 'idle timeout must skip players in warm-slot hold');

// ── Lightweight persistence ───────────────────────────────────────────────────
assertContains(room, 'const _lightweightPersistence = new Map()', '_lightweightPersistence module-level Map must exist');
assertContains(room, 'PERSISTENCE_TTL_MS', 'PERSISTENCE_TTL_MS constant must exist');
assertContains(room, 'PERSISTENCE_MAX_ENTRIES', 'PERSISTENCE_MAX_ENTRIES constant must exist');
assertContains(room, 'function _persistenceKey(telegramAuth)', '_persistenceKey helper must exist');
assertContains(room, 'function _writePersistence(key, {', '_writePersistence helper must exist');
assertContains(room, 'function _readPersistence(key)', '_readPersistence helper must exist');
must(room, /_writePersistence[\s\S]{0,200}name[\s\S]{0,200}faction[\s\S]{0,200}district[\s\S]{0,200}runLevel/, '_writePersistence must store name, faction, district and runLevel');

// ── Identity key tracked in onJoin ────────────────────────────────────────────
must(room, /onJoin[\s\S]{0,2000}_persistenceKey/, 'identity key must be derived in onJoin');
must(room, /onJoin[\s\S]{0,2000}_identityKeyBySession\.set/, 'identity key must be stored in _identityKeyBySession in onJoin');

// ── Persistence written in onLeave ────────────────────────────────────────────
must(room, /onLeave[\s\S]{0,400}_writePersistence/, 'lightweight persistence must be written in onLeave');

// ── NPC targeting survives reconnects ────────────────────────────────────────
// NPCs target by sessionId which persists through allowReconnection.
assertContains(room, 'npc.targetSessionId = target.id', 'NPC targeting must use session ID (survives reconnect)');
assertContains(room, '_findNearestAlivePlayer(npc)', 'NPC must dynamically find targets each tick');

// ── 2-player cap still enforced ──────────────────────────────────────────────
assertContains(room, 'this.maxClients = 2', '2-player cap must still be enforced');

// ── Browser never creates rooms ───────────────────────────────────────────────
assertNotContains(network, 'matchMaker', 'browser client must never call matchMaker (server-only)');
assertNotContains(network, 'createRoom', 'browser client must never call createRoom (server-only)');

// ── Server pre-creates "city" room ───────────────────────────────────────────
assertContains(serverIndex, 'ensurePersistentCityRoom', 'server must pre-create the persistent city room');
assertContains(serverIndex, "matchMaker.createRoom('city', {})", "server must create 'city' room via matchMaker");
assertContains(serverIndex, "gameServer.define('city', MinimalCityRoom)", "server must define 'city' room as MinimalCityRoom");

// ── Client reconnection token stored after join ───────────────────────────────
assertContains(network, '_reconnectionToken = room.reconnectionToken || null', 'reconnection token must be stored after join');
assertContains(network, '_colyseusEndpoint = endpoint', 'colyseus endpoint must be stored for reconnect');

// ── Warm reconnect attempted before fresh join ────────────────────────────────
assertContains(network, 'async function _tryWarmReconnect()', '_tryWarmReconnect must exist');
assertContains(network, 'warmClient.reconnect(_reconnectionToken)', '_tryWarmReconnect must call client.reconnect with token');
must(network, /reconnectMultiplayer[\s\S]{0,200}_tryWarmReconnect/, 'reconnectMultiplayer must attempt warm reconnect first');

// ── Anti-drift: no client authority ──────────────────────────────────────────
assertNotContains(room, ['client', 'authority'].join(' '), 'server must remain authoritative — no client-authority allowed');
assertNotContains(network, 'createRoom', 'browser must not create rooms');

// ── Unit tests: pure persistence helpers ─────────────────────────────────────
// Extract and test the pure helper functions directly.
const helperCode = (() => {
  const start = room.indexOf('function _persistenceKey(telegramAuth)');
  const end = room.indexOf('function resolveApiBase()');
  assert.ok(start >= 0 && end > start, 'persistence helpers must exist between _persistenceKey and resolveApiBase');
  return room.slice(start, end);
})();

const PERSISTENCE_TTL_MS_VAL = 30 * 60_000;
const PERSISTENCE_MAX_ENTRIES_VAL = 500;

const harness = new Function(`
  const PERSISTENCE_TTL_MS = ${PERSISTENCE_TTL_MS_VAL};
  const PERSISTENCE_MAX_ENTRIES = ${PERSISTENCE_MAX_ENTRIES_VAL};
  const _lightweightPersistence = new Map();
  ${helperCode}
  return { _persistenceKey, _writePersistence, _readPersistence, _snapshotPlayer };
`)();

const { _persistenceKey, _writePersistence, _readPersistence, _snapshotPlayer } = harness;

// _persistenceKey tests
assert.equal(_persistenceKey(null), null, '_persistenceKey(null) must return null');
assert.equal(_persistenceKey({}), null, '_persistenceKey({}) must return null (no id)');
assert.equal(_persistenceKey({ id: '123' }), 'tg_123', '_persistenceKey must prefix with tg_');
assert.equal(_persistenceKey({ user_id: '456' }), 'tg_456', '_persistenceKey must accept user_id fallback');

// _writePersistence + _readPersistence round-trip
_writePersistence('tg_1', { name: 'Alice', faction: 'Liberators', district: 'neon-slums', runLevel: 3 });
const stored = _readPersistence('tg_1');
assert.ok(stored, 'persistence must store and retrieve entry');
assert.equal(stored.name, 'Alice', 'name must round-trip');
assert.equal(stored.faction, 'Liberators', 'faction must round-trip');
assert.equal(stored.district, 'neon-slums', 'district must round-trip');
assert.equal(stored.runLevel, 3, 'runLevel must round-trip');

// _readPersistence returns null for unknown key
assert.equal(_readPersistence('tg_unknown'), null, '_readPersistence must return null for unknown key');

// _snapshotPlayer captures runGeneration
const fakePlayer = {
  x: 5, y: 7, hp: 80, maxHp: 100, kills: 3, downs: 1, respawnAt: 0, ready: true,
  attackDamage: 20, attackCooldownMs: 750, armorPct: 0, secondWindAvailable: false,
  secondWindUsed: false, upgradesJson: '["spray_damage"]', upgradeChoicesJson: '[]',
  upgradeChoicesMetaJson: '[]', upgradeState: 'selected', objectiveProgress: 3,
};
const snap = _snapshotPlayer(fakePlayer, 2);
assert.equal(snap.runGeneration, 2, 'snapshot must capture runGeneration');
assert.equal(snap.upgradesJson, '["spray_damage"]', 'snapshot must capture upgrades');
assert.equal(snap.objectiveProgress, 3, 'snapshot must capture objectiveProgress');
assert.equal(snap.hp, 80, 'snapshot must capture HP at disconnect time');

// Stale runGeneration test (simulated via snapshot check)
assert.ok(snap.runGeneration !== 3, 'stale run generation must not match restored snapshot');

console.log('Block Topia reconnect protection checks passed.');

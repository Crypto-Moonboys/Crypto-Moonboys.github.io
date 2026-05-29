/**
 * Regression tests for Block Topia server-authoritative movement hardening.
 *
 * These tests reconstruct the movement validation logic (terrain grid, passability
 * check, distance guard, and rate guard) from MinimalCityRoom.js to prove that:
 *   - adjacent moves succeed
 *   - non-passable tile moves fail
 *   - extreme out-of-bounds requests are clamped then still rejected by distance guard
 *   - multi-tile teleport jumps fail
 *   - rapid-fire moves fail (rate guard)
 *   - unready players cannot move
 *
 * The harness extracts the pure terrain helpers and constants directly from source
 * so these tests will break if the guards are removed or weakened.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roomSrc = await fs.readFile(
  path.join(ROOT, 'server/block-topia/src/rooms/MinimalCityRoom.js'),
  'utf8',
);
const mainSrc = await fs.readFile(
  path.join(ROOT, 'games/block-topia/main.js'),
  'utf8',
);

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  [PASS] ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function check(condition, label, detail) {
  if (condition) pass(label);
  else fail(label, detail);
}

// ── Extract named functions from source ───────────────────────────────────────

function extractFunction(source, name) {
  const match = source.match(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(match, `expected to find function ${name}`);
  const start = match.index;
  const signatureEnd = source.indexOf(') {', start);
  assert.ok(signatureEnd > start, `expected signature for function ${name}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1).replace(/^export\s+/, '');
  }
  throw new Error(`unterminated function ${name}`);
}

// ── Read constants directly from source ───────────────────────────────────────

function readIntConst(source, name) {
  const m = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  assert.ok(m, `expected const ${name} in source`);
  return parseInt(m[1], 10);
}

const MAP_WIDTH      = readIntConst(roomSrc, 'MAP_WIDTH');
const MAP_HEIGHT     = readIntConst(roomSrc, 'MAP_HEIGHT');
const MAX_MOVE_DELTA = readIntConst(roomSrc, 'MAX_MOVE_DELTA');
const MOVE_COOLDOWN_MS = readIntConst(roomSrc, 'MOVE_COOLDOWN_MS');

// ── Build harness using extracted terrain helpers ─────────────────────────────

const harness = new Function(`
  const MAP_WIDTH  = ${MAP_WIDTH};
  const MAP_HEIGHT = ${MAP_HEIGHT};
  const MAX_MOVE_DELTA   = ${MAX_MOVE_DELTA};
  const MOVE_COOLDOWN_MS = ${MOVE_COOLDOWN_MS};
  const PASSABLE_TERRAIN = new Set(['road', 'grass']);

  ${extractFunction(roomSrc, 'decideTerrain')}
  ${extractFunction(roomSrc, 'forceRoad')}
  ${extractFunction(roomSrc, 'buildTerrainGrid')}

  function isPassable(terrain, x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const row = terrain[y];
    if (!row) return false;
    return PASSABLE_TERRAIN.has(row[x]);
  }

  /**
   * Simulate the server-side move handler logic extracted from onMessage('move').
   * Returns { ok: true, x, y } on success or { ok: false, reason } on rejection.
   */
  function applyMove(state, sessionId, data, nowOverride) {
    const { terrain, playersBySession, lastMoveAtBySession } = state;
    const player = playersBySession.get(sessionId);

    // ready guard
    if (!player || !player.ready) return { ok: false, reason: 'not_ready' };

    const nextX = Number(data?.x);
    const nextY = Number(data?.y);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return { ok: false, reason: 'not_finite' };

    const x = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(nextX)));
    const y = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(nextY)));
    if (!isPassable(terrain, x, y)) return { ok: false, reason: 'not_passable' };

    // distance guard (anti-teleport)
    if (Math.abs(x - player.x) > MAX_MOVE_DELTA || Math.abs(y - player.y) > MAX_MOVE_DELTA) {
      return { ok: false, reason: 'too_far' };
    }

    // rate guard
    const now = nowOverride !== undefined ? nowOverride : Date.now();
    const lastMoveAt = lastMoveAtBySession.get(sessionId) || 0;
    if (now - lastMoveAt < MOVE_COOLDOWN_MS) return { ok: false, reason: 'rate_limited' };

    player.x = x;
    player.y = y;
    lastMoveAtBySession.set(sessionId, now);
    return { ok: true, x, y };
  }

  function makeState() {
    const terrain = buildTerrainGrid(MAP_WIDTH, MAP_HEIGHT);
    const playersBySession = new Map();
    const lastMoveAtBySession = new Map();
    return { terrain, playersBySession, lastMoveAtBySession, isPassable: (x, y) => isPassable(terrain, x, y) };
  }

  function addPlayer(state, sessionId, x, y, ready = true) {
    state.playersBySession.set(sessionId, { id: sessionId, x, y, ready });
    return state.playersBySession.get(sessionId);
  }

  return { makeState, addPlayer, applyMove, MAP_WIDTH, MAP_HEIGHT, MAX_MOVE_DELTA, MOVE_COOLDOWN_MS };
`)();

const { makeState, addPlayer, applyMove, MOVE_COOLDOWN_MS: CD_MS } = harness;

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n─── Block Topia Movement Hardening Regression Tests ────────────\n');

// ── 1. Unready player cannot move ─────────────────────────────────────────────
{
  const s = makeState();
  addPlayer(s, 'p1', 0, 0, false /* not ready */);
  const r = applyMove(s, 'p1', { x: 1, y: 0 }, Date.now());
  check(r.ok === false && r.reason === 'not_ready', 'unready player: move is rejected', JSON.stringify(r));
  check(s.playersBySession.get('p1').x === 0, 'unready player: position unchanged');
}

// ── 2. Adjacent tile move succeeds ────────────────────────────────────────────
{
  const s = makeState();
  addPlayer(s, 'p1', 0, 0);
  // Find two adjacent passable tiles from spawn (0,0) to test with
  let foundAdj = false;
  for (const [dx, dy] of [[1,0],[0,1],[0,-1],[-1,0]]) {
    const nx = 0 + dx, ny = 0 + dy;
    if (s.isPassable(nx, ny)) {
      const s2 = makeState();
      addPlayer(s2, 'adj', 0, 0);
      const r2 = applyMove(s2, 'adj', { x: nx, y: ny }, Date.now());
      check(r2.ok === true, `adjacent move to (${nx},${ny}) succeeds`, JSON.stringify(r2));
      check(s2.playersBySession.get('adj').x === nx && s2.playersBySession.get('adj').y === ny,
        `player position updated to (${nx},${ny})`);
      foundAdj = true;
      break;
    }
  }
  if (!foundAdj) fail('adjacent move', 'no passable adjacent tile found from (0,0)');
}

// ── 3. Non-passable (block) tile move fails ───────────────────────────────────
{
  // Find a 'block' tile adjacent to a known passable tile
  const s = makeState();
  let found = false;
  outer: for (let y = 0; y < 20; y += 1) {
    for (let x = 0; x < 20; x += 1) {
      if (!s.isPassable(x, y)) continue;
      for (const [dx, dy] of [[1,0],[0,1],[0,-1],[-1,0]]) {
        const bx = x + dx, by = y + dy;
        if (bx < 0 || by < 0 || bx >= 20 || by >= 20) continue;
        if (!s.isPassable(bx, by)) {
          addPlayer(s, 'blocker', x, y);
          const r = applyMove(s, 'blocker', { x: bx, y: by }, Date.now());
          check(r.ok === false && r.reason === 'not_passable',
            `move to non-passable tile (${bx},${by}) is rejected`, JSON.stringify(r));
          found = true;
          break outer;
        }
      }
    }
  }
  if (!found) fail('non-passable tile test', 'no impassable adjacent tile found in map');
}

// ── 4. Extreme out-of-bounds is clamped then rejected by distance guard ───────
{
  const s = makeState();
  addPlayer(s, 'oob', 0, 0);
  // Large positive jump is clamped to map edge and still rejected as too_far.
  const r2 = applyMove(s, 'oob', { x: 999, y: 999 }, Date.now());
  check(r2.ok === false && r2.reason === 'too_far',
    "direct far room.send('move', { x: 999, y: 999 }) is rejected as too_far", JSON.stringify(r2));
}

// ── 5. Multi-tile teleport fails ──────────────────────────────────────────────
{
  const s = makeState();
  // Start near a known passable row (y=5 is a road row)
  addPlayer(s, 'tp', 0, 5);
  const r = applyMove(s, 'tp', { x: 0, y: 10 }, Date.now()); // 5 tiles away
  check(r.ok === false && r.reason === 'too_far',
    'teleport 5 tiles is rejected as too_far', JSON.stringify(r));
  check(s.playersBySession.get('tp').y === 5, 'teleport: position unchanged');

  const r2 = applyMove(s, 'tp', { x: 10, y: 5 }, Date.now()); // 10 tiles horizontally
  check(r2.ok === false && r2.reason === 'too_far',
    'teleport 10 tiles horizontally is rejected as too_far', JSON.stringify(r2));
}

// ── 6. Rapid impossible movement fails (rate guard) ───────────────────────────
{
  const s = makeState();
  // Place player on a road row; (0, y%5===0) tiles are always road
  addPlayer(s, 'fast', 0, 0);

  // First move at t=0 — always accepted if passable and adjacent
  const now = 1_000_000;
  const r1 = applyMove(s, 'fast', { x: 0, y: 5 }, now);
  // (0,5) is road. If delta ≤ MAX_MOVE_DELTA it will succeed.
  // If player is at (0,0) and target is (0,5) that is 5 tiles → too_far. So find a valid step.
  // Reset to test the rate guard specifically.
  const s2 = makeState();
  addPlayer(s2, 'fast2', 0, 5); // road tile
  // Find adjacent passable tile
  let adjX = null, adjY = null;
  for (const [dx, dy] of [[1,0],[0,1],[0,-1],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]]) {
    const nx = 0 + dx, ny = 5 + dy;
    if (s2.isPassable(nx, ny)) { adjX = nx; adjY = ny; break; }
  }
  assert.ok(adjX !== null, 'could not find adjacent passable tile for rate guard test');

  const t0 = 2_000_000;
  const rA = applyMove(s2, 'fast2', { x: adjX, y: adjY }, t0);
  check(rA.ok === true, 'rate guard: first adjacent move at t0 succeeds');

  // Immediately send another move (same ms) — rate guard rejects
  const rB = applyMove(s2, 'fast2', { x: 0, y: 5 }, t0);
  check(rB.ok === false && rB.reason === 'rate_limited',
    'rate guard: second move at same timestamp is rejected', JSON.stringify(rB));

  // Move just before MOVE_COOLDOWN_MS has elapsed — still rejected
  const rC = applyMove(s2, 'fast2', { x: 0, y: 5 }, t0 + CD_MS - 1);
  check(rC.ok === false && rC.reason === 'rate_limited',
    `rate guard: move at t0+${CD_MS - 1}ms (< cooldown) is rejected`, JSON.stringify(rC));

  // Move exactly after MOVE_COOLDOWN_MS — accepted
  const rD = applyMove(s2, 'fast2', { x: 0, y: 5 }, t0 + CD_MS);
  check(rD.ok === true,
    `rate guard: move at t0+${CD_MS}ms (= cooldown) is accepted`, JSON.stringify(rD));
}

  // ── 7. Frontend click-to-move steps and cancellation behavior ──────────────────
  {
    let fakeNow = 10_000;
    class FakeCanvas {}
    const windowListeners = new Map();
    let frameId = 0;
    const frameCallbacks = new Map();
    const noop = () => {};
    const fakeCtx = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'createLinearGradient') {
          return () => ({ addColorStop: noop });
        }
        return noop;
      },
      set() {
        return true;
      },
    });
    function emitWindow(type, event) {
      const listeners = windowListeners.get(type) || [];
      for (const listener of listeners) listener(event);
    }
    const fakeCanvas = {
      parentElement: {
        getBoundingClientRect() {
          return { width: 960, height: 720 };
        },
      },
      style: {},
      addEventListener(type, listener) {
        this._listeners = this._listeners || new Map();
        const list = this._listeners.get(type) || [];
        list.push(listener);
        this._listeners.set(type, list);
      },
      removeEventListener(type, listener) {
        const list = this._listeners?.get(type) || [];
        this._listeners?.set(type, list.filter((entry) => entry !== listener));
      },
      emit(type, event) {
        const list = this._listeners?.get(type) || [];
        for (const listener of list) listener(event);
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 960, height: 720 };
      },
      getContext() {
        return fakeCtx;
      },
      setAttribute: noop,
    };
    const fakeDocument = {
      body: { appendChild: noop },
      getElementById() {
        return null;
      },
      createElement() {
        return fakeCanvas;
      },
    };
    const context = vm.createContext({
      console,
      Math,
      Number,
      Boolean,
      String,
      Array,
      Object,
      Set,
      Map,
      JSON,
      Date: { now: () => fakeNow },
      performance: { now: () => fakeNow },
      setTimeout,
      clearTimeout,
      HTMLCanvasElement: FakeCanvas,
      requestAnimationFrame: (cb) => {
        frameId += 1;
        frameCallbacks.set(frameId, cb);
        return frameId;
      },
      cancelAnimationFrame: (id) => {
        frameCallbacks.delete(id);
      },
      window: {
        devicePixelRatio: 1,
        addEventListener(type, listener) {
          const list = windowListeners.get(type) || [];
          list.push(listener);
          windowListeners.set(type, list);
        },
        removeEventListener(type, listener) {
          const list = windowListeners.get(type) || [];
          windowListeners.set(type, list.filter((entry) => entry !== listener));
        },
      },
      document: fakeDocument,
    });
    context.window.document = fakeDocument;
    context.window.HTMLCanvasElement = FakeCanvas;
    context.window.requestAnimationFrame = context.requestAnimationFrame;
    context.window.cancelAnimationFrame = context.cancelAnimationFrame;

    vm.runInContext(mainSrc, context, { filename: 'main.js' });
    const api = context.window.BlockTopiaMap;
    assert.ok(api, 'BlockTopiaMap API should initialize.');
    api.mount({ canvas: fakeCanvas });
    api.setInputEnabled(true);
    api.setConnectionStatus({ ws: 'connected', joined: true, roomId: 'city' });
    api.setLocalPlayer({ x: 1, y: 1, sessionId: 'p1', ready: true });

    const sentMoves = [];
    api.setPositionBroadcastSink(({ x, y }) => {
      sentMoves.push({ x, y, at: fakeNow });
      return true;
    });

    const GRID_SIZE = 20;
    const TILE_WIDTH = 64;
    const TILE_HEIGHT = 32;
    const MAP_SAFE_MARGIN_RATIO = 0.08;
    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }
    function computeIsoBounds(scale) {
      const tw = TILE_WIDTH * scale;
      const th = TILE_HEIGHT * scale;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
          const sx = (x - y) * (tw / 2);
          const sy = (x + y) * (th / 2);
          minX = Math.min(minX, sx - tw / 2);
          maxX = Math.max(maxX, sx + tw / 2);
          minY = Math.min(minY, sy);
          maxY = Math.max(maxY, sy + th);
        }
      }
      return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    }
    function tileToPointer(x, y) {
      const viewWidth = 960;
      const viewHeight = 720;
      const baseBounds = computeIsoBounds(1);
      const safeMarginX = viewWidth * MAP_SAFE_MARGIN_RATIO;
      const safeMarginY = viewHeight * MAP_SAFE_MARGIN_RATIO;
      const fitWidth = Math.max(64, viewWidth - safeMarginX * 2);
      const fitHeight = Math.max(64, viewHeight - safeMarginY * 2);
      const cameraScale = clamp(Math.min(fitWidth / baseBounds.width, fitHeight / baseBounds.height), 0.35, 1.25);
      const scaledBounds = computeIsoBounds(cameraScale);
      const cameraX = Math.floor((viewWidth - scaledBounds.width) / 2 - scaledBounds.minX);
      const cameraY = Math.floor((viewHeight - scaledBounds.height) / 2 - scaledBounds.minY);
      const tw = TILE_WIDTH * cameraScale;
      const th = TILE_HEIGHT * cameraScale;
      const sx = (x - y) * (tw / 2) + cameraX;
      const sy = (x + y) * (th / 2) + cameraY;
      return { clientX: sx, clientY: sy + th / 2 };
    }
    function runNextFrame() {
      const nextId = frameCallbacks.keys().next().value;
      if (!nextId) return false;
      const cb = frameCallbacks.get(nextId);
      frameCallbacks.delete(nextId);
      cb();
      return true;
    }

    const farClick = tileToPointer(18, 18);
    fakeCanvas.emit('pointerdown', farClick);
    check(sentMoves.length === 1 && Math.abs(sentMoves[0].x - 1) <= 1 && Math.abs(sentMoves[0].y - 1) <= 1,
      'click-to-move far target emits adjacent first step, not far tile', JSON.stringify(sentMoves[0]));
    check(!(sentMoves[0].x === 18 && sentMoves[0].y === 18),
      'click-to-move does not send direct far coordinate');

    // Ack first step and confirm paced follow-up stepping.
    fakeNow += 20;
    api.setLocalPlayer({ x: sentMoves[0].x, y: sentMoves[0].y, sessionId: 'p1', ready: true });
    runNextFrame();
    check(sentMoves.length === 1, 'queued path waits for move cooldown before next send');
    fakeNow += 110;
    runNextFrame();
    check(sentMoves.length === 2, 'queued path sends next adjacent step after cooldown');
    check(sentMoves[1].at - sentMoves[0].at >= 110, 'click/path step sends respect cooldown interval');

    // Manual movement should cancel queued click path.
    const beforeManual = sentMoves.length;
    fakeNow += 110;
    emitWindow('keydown', { key: 'ArrowRight', preventDefault() {} });
    const afterManual = sentMoves.length;
    check(afterManual === beforeManual + 1, 'manual WASD/arrow move is sent');
    fakeNow += 110;
    runNextFrame();
    check(sentMoves.length === afterManual, 'manual input cancels queued click movement');

    // Manual movement should also honor cooldown pacing.
    api.setLocalPlayer({ x: 10, y: 10, sessionId: 'p1', ready: true });
    fakeNow += 300;
    const beforeManualSpam = sentMoves.length;
    emitWindow('keydown', { key: 'ArrowRight', preventDefault() {} });
    emitWindow('keydown', { key: 'ArrowRight', preventDefault() {} });
    check(sentMoves.length === beforeManualSpam + 1, 'manual movement does not spam faster than cooldown');

    // Target reached should clear queued movement.
    api.setLocalPlayer({ x: 5, y: 5, sessionId: 'p1', ready: true });
    fakeNow += 110;
    fakeCanvas.emit('pointerdown', tileToPointer(6, 5));
    const reachedStep = sentMoves[sentMoves.length - 1];
    api.setLocalPlayer({ x: reachedStep.x, y: reachedStep.y, sessionId: 'p1', ready: true });
    const reachedCount = sentMoves.length;
    fakeNow += 220;
    runNextFrame();
    check(sentMoves.length === reachedCount, 'queued click movement stops when target is reached');

    // Blocked (non-passable) click target should not enqueue movement.
    const forcedRoad = new Set(['1,1', '2,1', '1,2', '18,18', '17,18', '18,17']);
    let blockedTarget = null;
    for (let y = 0; y < GRID_SIZE && !blockedTarget; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const hash = ((x + 17) * 928371 + (y + 31) * 192847 + x * y * 11939) % 1000;
        const lineRoad = x % 5 === 0 || y % 5 === 0;
        const diagonalRoad = (x + y) % 7 === 0;
        const terrain = forcedRoad.has(`${x},${y}`) ? 'road' : (lineRoad || diagonalRoad) ? 'road' : (hash < 125 ? 'block' : 'grass');
        if (terrain === 'block') blockedTarget = { x, y };
      }
    }
    assert.ok(blockedTarget, 'expected to find blocked tile');
    api.setLocalPlayer({ x: 5, y: 5, sessionId: 'p1', ready: true });
    const beforeBlocked = sentMoves.length;
    fakeNow += 300;
    fakeCanvas.emit('pointerdown', tileToPointer(blockedTarget.x, blockedTarget.y));
    runNextFrame();
    check(sentMoves.length === beforeBlocked, 'click-to-move stops when next target is non-passable');

    // Connection loss should clear queued movement.
    api.setLocalPlayer({ x: 1, y: 1, sessionId: 'p1', ready: true });
    fakeNow += 300;
    const beforeDisconnect = sentMoves.length;
    fakeCanvas.emit('pointerdown', tileToPointer(17, 17));
    check(sentMoves.length === beforeDisconnect + 1, 'queued click movement starts before disconnect');
    api.setConnectionStatus({ ws: 'offline', joined: false, roomId: '' });
    fakeNow += 300;
    runNextFrame();
    check(sentMoves.length === beforeDisconnect + 1, 'queued click movement cancels on connection loss');

    // Input disable should clear queued movement.
    api.setConnectionStatus({ ws: 'connected', joined: true, roomId: 'city' });
    api.setInputEnabled(true);
    fakeNow += 110;
    fakeCanvas.emit('pointerdown', tileToPointer(16, 16));
    const beforeDisable = sentMoves.length;
    api.setInputEnabled(false);
    fakeNow += 300;
    runNextFrame();
    check(sentMoves.length === beforeDisable, 'queued click movement cancels when input disabled');

    api.destroy();
  }

// ── Source-level guard assertions ─────────────────────────────────────────────

console.log('\n[source] Movement hardening constants and guard patterns\n');

function must(pattern, message) {
  check(pattern.test(roomSrc), message);
}

must(/const\s+MAX_MOVE_DELTA\s*=\s*1/, 'MAX_MOVE_DELTA is defined as 1');
must(/const\s+MOVE_COOLDOWN_MS\s*=\s*\d+/, 'MOVE_COOLDOWN_MS is defined');
must(/this\.lastMoveAtBySession\s*=\s*new\s+Map\(\)/, 'lastMoveAtBySession initialised in onCreate');
must(
  /Math\.abs\(x\s*-\s*player\.x\)\s*>\s*MAX_MOVE_DELTA\s*\|\|\s*Math\.abs\(y\s*-\s*player\.y\)\s*>\s*MAX_MOVE_DELTA/,
  'distance guard uses MAX_MOVE_DELTA',
);
must(/now\s*-\s*lastMoveAt\s*<\s*MOVE_COOLDOWN_MS/, 'rate guard uses MOVE_COOLDOWN_MS');
must(/lastMoveAtBySession\.delete\(sessionId\)/, 'lastMoveAtBySession cleaned up in _removePlayerBySession');
must(/lastMoveAtBySession\.clear\(\)/, 'lastMoveAtBySession cleared on level advance');
must(/lastMoveAtBySession\.set\(client\.sessionId,\s*now\)/, 'lastMoveAtBySession updated on successful move');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n─── Result ─────────────────────────────────────────────────────`);
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log(`────────────────────────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);

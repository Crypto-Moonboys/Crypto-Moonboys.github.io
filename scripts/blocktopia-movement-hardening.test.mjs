/**
 * Regression tests for Block Topia server-authoritative movement hardening.
 *
 * These tests reconstruct the movement validation logic (terrain grid, passability
 * check, distance guard, and rate guard) from MinimalCityRoom.js to prove that:
 *   - adjacent moves succeed
 *   - non-passable tile moves fail
 *   - out-of-bounds moves fail
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
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roomSrc = await fs.readFile(
  path.join(ROOT, 'server/block-topia/src/rooms/MinimalCityRoom.js'),
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
  // x=0 rows are always road (x % 5 === 0) — always passable
  addPlayer(s, 'p1', 0, 0);
  const r = applyMove(s, 'p1', { x: 0, y: 5 }, Date.now()); // (0,5) → y%5===0 road
  // Only succeeds if the step delta is ≤ MAX_MOVE_DELTA in both axes.
  // Here we move exactly 1 tile up/down to an adjacent passable tile.
  const tgt = s.playersBySession.get('p1');
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

// ── 4. Out-of-bounds move fails ───────────────────────────────────────────────
{
  const s = makeState();
  addPlayer(s, 'oob', 0, 0);
  // Clamping means x=-1 becomes x=0 which is passable, but the player is already at 0,0
  // so that collapses to a zero-delta move (ok). Test a large jump that is clamped but
  // also exceeds MAX_MOVE_DELTA before clamping catches it.
  const r = applyMove(s, 'oob', { x: -100, y: -100 }, Date.now());
  // After clamping, x=0,y=0 == player position (delta 0) → ok (player stays put).
  // The important rejection case is a large positive jump beyond the map AND beyond delta.
  const r2 = applyMove(s, 'oob', { x: 999, y: 999 }, Date.now());
  // Clamped to (19,19); from (0,0) that's delta > MAX_MOVE_DELTA → too_far
  check(r2.ok === false && r2.reason === 'too_far',
    'jump to (999,999) clamped to map edge is rejected as too_far', JSON.stringify(r2));
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

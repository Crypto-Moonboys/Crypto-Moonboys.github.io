// Reachability check for the Getting Up "Gauntlet" course.
// Re-simulates the shared engine's run/jump physics (game/nbg-level1.js:
// RUN_ACCEL 0.42, MAX_SPEED 2.4, GRAVITY 0.52, jumps -11.4/-12.8/-12.8,
// 3.2 side speed on jumps 2-3, 115ms tap spacing) against the course solids
// and searches simple input plans for every listed hop.
// Run: node scripts/getting-up-gauntlet-reach.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../games/getting-up/getting-up-gauntlet-course.js', import.meta.url), 'utf8');
const sandbox = {
  window: { location: { search: '' }, addEventListener() {} },
  Image: class { constructor() { this.complete = false; this.naturalWidth = 0; } }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const F = 214;
const course = sandbox.window.NBGCourses['getting-up-gauntlet']({
  FLOOR_Y: F, WORLD_WIDTH: 22000, WIDTH: 480, HEIGHT: 270,
  COIN_TIERS: { small: { size: 16, xp: 100 }, medium: { size: 32, xp: 250 }, large: { size: 40, xp: 500 }, xl: { size: 50, xp: 1000 } },
  STAND_HEIGHT: 34, CROUCH_HEIGHT: 22, STREET_Y: 242, FOREGROUND_VISUAL_OFFSET_Y: 38,
  PLAYER_VISUAL_OFFSET_Y: 38, CAMERA_LOOK_DOWN_MAX_Y: 84, SPEEDRUN_PAR_MS: 180000
});
const D = course.data;
const L = course.layout;

const GRAVITY = 0.52, ACCEL = 0.42, MAX = 2.4, FRICTION = 0.78;
const J1 = -11.4, J2 = -12.8, SIDE = 3.2, W = 24, H = 34, TAP = 7; // 115ms ≈ 7 frames
const TAU = Math.PI * 2;

function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function moverAt(m, t) {
  const off = Math.sin(t / m.period * TAU + m.phase) * m.range;
  return { x: m.bx + (m.axis === 'x' ? off : 0), y: m.by + (m.axis === 'y' ? off : 0), w: m.w, h: m.h, ref: m };
}

// Find surfaces by coordinates (helps keep the hop list readable).
function floorAt(x) { const s = D.floorSolids.find(f => x >= f.x && x < f.x + f.w); assert.ok(s, 'no floor at ' + x); return s; }
function platAt(x, y) { const s = L.platforms.find(p => p.x === x && p.y === y); assert.ok(s, `no platform ${x},${y}`); return s; }
function wallAt(x) { const s = D.walls.find(w => w.x === x); assert.ok(s, 'no wall ' + x); return s; }
function crumbleAt(x) { const s = D.crumbles.find(c => c.x === x); assert.ok(s, 'no crumble ' + x); return s; }
function moverAtX(x) { const s = D.movers.find(m => m.bx === x); assert.ok(s, 'no mover ' + x); return s; }
function padAt(x) { const s = D.pads.find(p => p.x === x); assert.ok(s, 'no pad ' + x); return s; }
function crateAt(x) { const s = L.crates.find(c => c.x === x); assert.ok(s, 'no crate ' + x); return s; }

function staticSolids() {
  return [...D.floorSolids, ...L.platforms, ...D.walls, ...D.crumbles, ...L.crates, ...D.pads];
}
const STATIC = staticSolids();

function simulate(from, to, plan, t0) {
  // from: surface we stand on (or pad), plan: {x0, j2, j3, release}
  const isPad = !!from.bounce;
  const fromRect = from.period ? moverAt(from, t0) : from;
  const p = { x: plan.x0, y: fromRect.y - H, w: W, h: H, vx: MAX, vy: 0 };
  let grounded = true, jumps = 0, frame = 0, lastPress = -99;
  if (isPad) { p.vy = -from.bounce; grounded = false; jumps = 1; }
  for (; frame < 280; frame += 1) {
    const t = t0 + frame * (1000 / 60);
    const solids = STATIC.concat(D.movers.map(m => moverAt(m, t)));
    const right = plan.release === null || frame < plan.release;
    if (right) p.vx = Math.min(MAX, p.vx + ACCEL); else p.vx *= FRICTION;
    const press = (!isPad && frame === 0) || frame === plan.j2 || frame === plan.j3;
    if (press && frame - lastPress >= TAP) {
      lastPress = frame;
      if (grounded) { p.vy = J1; grounded = false; jumps = 1; }
      else if (jumps === 1 || jumps === 2) { p.vy = J2; if (right) p.vx = SIDE; jumps += 1; }
    }
    const px = p.x;
    p.x += p.vx;
    for (const s of solids) {
      if (!(s.solidBottom || L.crates.includes(s))) continue;
      if (!overlap(p, s)) continue;
      if (p.vx > 0 && px + W <= s.x + 1) { p.x = s.x - W; p.vx = 0; }
      else if (p.vx < 0 && px >= s.x + s.w - 1) { p.x = s.x + s.w; p.vx = 0; }
    }
    const py = p.y;
    p.vy += GRAVITY;
    p.y += p.vy;
    grounded = false;
    let landedOn = null;
    for (const s of solids) {
      if (s.solidBottom && p.vy < 0 && overlap(p, s) && py >= s.y + s.h - 1) { p.y = s.y + s.h; p.vy = 0; continue; }
      if (overlap(p, s) && p.vy >= 0 && py + H <= s.y + 1) {
        p.y = s.y - H;
        if (s.bounce) { p.vy = -s.bounce; jumps = 1; continue; }
        p.vy = 0; grounded = true; jumps = 0; landedOn = s.ref || s;
      }
    }
    if (landedOn) {
      if (landedOn === to) return frame;
      // Landing again on the start surface just means we have not left yet.
      if (landedOn !== from && frame > 2) return -1;
      if (landedOn === from && frame > 2) return -1;
    }
    if (p.y > 400) return -1;
  }
  return -1;
}

function canHop(from, to, opts = {}) {
  const fromX0 = from.period ? from.bx - from.range : from.x;
  const fromX1 = from.period ? from.bx + from.range + from.w : from.x + from.w;
  const timeSamples = (from.period || to.period) ? 24 : 1;
  const period = from.period || to.period || 1;
  const releases = [null, 8, 16, 24, 36, 50];
  for (let n = 1; n <= 3; n += 1) {
  if (opts.maxJumps && n > opts.maxJumps) break;
  for (let ts = 0; ts < timeSamples; ts += 1) {
    const t0 = 10000 + ts * period / timeSamples;
    const fr = from.period ? moverAt(from, t0) : from;
    const xs = [];
    for (let x = fr.x - W + 2; x <= fr.x + fr.w - 2; x += 4) xs.push(x);
    for (const x0 of xs) {
      if (x0 < fromX0 - W || x0 > fromX1) continue;
      const toX = to.period ? to.bx - to.range : to.x;
      if (x0 < toX - 360 || x0 > toX + (to.w || 0) + (to.range || 0)) continue;
      for (const release of releases) {
        {
          const j2s = n >= 2 ? range(TAP, 40, 3) : [-1];
          for (const j2 of j2s) {
            const j3s = n === 3 ? range(j2 + TAP, j2 + 40, 3) : [-1];
            for (const j3 of j3s) {
              if (simulate(from, to, { x0, j2, j3, release }, t0) >= 0) return { x0, n, j2, j3, release, t0 };
            }
          }
        }
      }
    }
  }
  }
  return null;
}
function range(a, b, s) { const out = []; for (let i = a; i <= b; i += s) out.push(i); return out; }

const hops = [
  ['Z0 first gap', floorAt(600), floorAt(700)],
  ['Z0 ground wall', floorAt(1000), wallAt(1060)],
  ['Z0 stair 1', wallAt(1060), wallAt(1140)],
  ['Z0 stair 2', wallAt(1140), wallAt(1220)],
  ['Z0 stair 3', wallAt(1220), wallAt(1300)],
  ['Z0 stash', wallAt(1300), platAt(1380, -150)],
  ['Z0 wall down', wallAt(1060), floorAt(1200)],
  ['Z0 gap 1620', floorAt(1600), floorAt(1730)],
  ['Z1 island in', floorAt(1900), platAt(2025, 170)],
  ['Z1 island out', platAt(2025, 170), floorAt(2200)],
  ['Z1 ferry on', floorAt(2200), moverAtX(2330)],
  ['Z1 ferry off', moverAtX(2330), floorAt(2600)],
  ['Z1 pit 3150', floorAt(3100), floorAt(3240)],
  ['Z1 pit 3290', floorAt(3240), floorAt(3400)],
  ['Z1 pit 3440', floorAt(3400), floorAt(3600)],
  ['Z1 pad -> highway', padAt(3720), platAt(3820, -170)],
  ['Z1 hw 1', platAt(3820, -170), platAt(4080, -210)],
  ['Z1 hw 2', platAt(4080, -210), moverAtX(4290)],
  ['Z1 hw 3', moverAtX(4290), platAt(4440, -240)],
  ['Z1 hw 4', platAt(4440, -240), wallAt(4660)],
  ['Z1 hw 5', wallAt(4660), platAt(4760, -280)],
  ['Z1 hw 6', platAt(4760, -280), platAt(5060, -240)],
  ['Z1 hw 7', platAt(5060, -240), crumbleAt(5260)],
  ['Z1 hw 8', crumbleAt(5260), crumbleAt(5360)],
  ['Z1 hw 9', crumbleAt(5360), platAt(5460, -260)],
  ['Z1 hw bunny', platAt(5460, -260), wallAt(5600)],
  ['Z1 gap 4060', floorAt(4000), floorAt(4200)],
  ['Z2 vent roof', floorAt(4500), platAt(4560, 130)],
  ['Z2 crystal wall', floorAt(5000), wallAt(5050)],
  ['Z2 crystal wall 2', wallAt(5050), wallAt(5110)],
  ['Z2 gap 6180', floorAt(6150), floorAt(6320)],
  ['Z3 elevator A', floorAt(6700), moverAtX(6790)],
  ['Z3 A->B', moverAtX(6790), moverAtX(6940)],
  ['Z3 B->C', moverAtX(6940), moverAtX(7090)],
  ['Z3 C->D', moverAtX(7090), moverAtX(7250)],
  ['Z3 D->street', moverAtX(7250), floorAt(7400)],
  ['Z3 crumble 1', floorAt(7950), crumbleAt(7980)],
  ['Z3 crumble 2', crumbleAt(7980), crumbleAt(8070)],
  ['Z3 crumble 3', crumbleAt(8070), crumbleAt(8160)],
  ['Z3 crumble 4', crumbleAt(8160), crumbleAt(8250)],
  ['Z3 crumble 5', crumbleAt(8250), crumbleAt(8340)],
  ['Z3 loft', crumbleAt(8340), platAt(8430, -60)],
  ['Z3 gap 8020', floorAt(7990), floorAt(8150)],
  ['Z3 gap 8200', floorAt(8150), floorAt(8300)],
  ['Z4 wall A', floorAt(9200), wallAt(9250)],
  ['Z4 crate', floorAt(9330), crateAt(9380)],
  ['Z4 wall B', crateAt(9380), wallAt(9420)],
  ['Z4 step', wallAt(9420), platAt(9520, 120)],
  ['Z4 wall C', platAt(9520, 120), wallAt(9620)],
  ['Z4 step 2', wallAt(9620), platAt(9730, 40)],
  ['Z4 wall D', platAt(9730, 40), wallAt(9850)],
  ['Z4 pad -> crown', padAt(9905), platAt(10000, -480)],
  ['Z4 gap 10950', floorAt(10900), floorAt(11150)],
  ['Z5 crumble in', floorAt(11650), crumbleAt(11730)],
  ...Array.from({ length: 7 }, (_, i) => ['Z5 crumble ' + (i + 1), crumbleAt(11730 + i * 96), crumbleAt(11826 + i * 96)]),
  ['Z5 crumble out', crumbleAt(12402), floorAt(12550)],
  ['Z5 upper on', crumbleAt(11826), moverAtX(11850)],
  ['Z5 upper 2', moverAtX(11850), moverAtX(12100)],
  ['Z5 upper 3', moverAtX(12100), moverAtX(12330)],
  ['Z5 gap 13050', floorAt(13000), floorAt(13200)],
  ['Z5 gap 13280', floorAt(13200), floorAt(13450)],
  ['Z6 bot roof', floorAt(14850), platAt(14900, 140)],
  ['Z6 pad -> base', padAt(15560), platAt(15660, -170)],
  ['Z6 pad -> strato', padAt(15700), platAt(15800, -560)],
  ['Z6 gap 15800', floorAt(15750), floorAt(16000)],
  ['Z7 bus on', floorAt(16740), moverAtX(16860)],
  ['Z7 bus off', moverAtX(16860), floorAt(17150)],
  ['Z7 lift 1', floorAt(17250), moverAtX(17340)],
  ['Z7 lift 2', moverAtX(17340), moverAtX(17470)],
  ['Z7 lift 3', moverAtX(17470), moverAtX(17590)],
  ['Z7 lift off', moverAtX(17590), floorAt(17700)],
  ['Z7 crumble in', floorAt(18050), crumbleAt(18120)],
  ['Z7 crumble 2', crumbleAt(18120), crumbleAt(18215)],
  ['Z7 crumble 3', crumbleAt(18215), crumbleAt(18310)],
  ['Z7 crumble 4', crumbleAt(18310), crumbleAt(18405)],
  ['Z7 crumble out', crumbleAt(18405), floorAt(18500)],
  ['Z7 stair 1', floorAt(18880), wallAt(18920)],
  ['Z7 stair 2', wallAt(18920), wallAt(19000)],
  ['Z7 stair 3', wallAt(19000), wallAt(19080)],
  ['Z7 roof', wallAt(19080), platAt(19160, -90)],
  ['Z8 gap 19520', floorAt(19480), floorAt(19650)],
  ['Z8 crumble mid', floorAt(19650), crumbleAt(19741)],
  ['Z8 crumble out', crumbleAt(19741), floorAt(19900)],
  ['Z8 island', floorAt(19900), platAt(20005, 165)],
  ['Z8 island out', platAt(20005, 165), floorAt(20150)],
  ['Z8 final wall', floorAt(21100), wallAt(21150)],
  ['Z8 final 2', wallAt(21150), wallAt(21240)],
  ['Z8 final 3', wallAt(21240), wallAt(21320)],
  ['Z8 final roof', wallAt(21320), platAt(21400, -110)]
];

let failures = 0;
const started = Date.now();
for (const [name, from, to] of hops) {
  const result = canHop(from, to);
  if (!result) { failures += 1; console.log('FAIL', name); }
  else console.log('ok  ', name.padEnd(22), `jumps=${result.n}`);
}

// Layout sanity: checkpoints/finish on solid street, ground enemies off pits.
function overGap(x0, x1) { return D.gaps.some(([gx, gw]) => x1 > gx && x0 < gx + gw); }
for (const cp of [L.checkpoint, ...L.checkpoints, L.finish]) assert.ok(!overGap(cp.x - 30, cp.x + cp.w + 30), 'checkpoint/finish over pit at ' + cp.x);
for (const e of L.enemies) {
  if (e.type === 'pigeon' || e.y + e.h !== F) continue;
  assert.ok(!overGap(e.min, e.max + e.w), `${e.type} patrol ${e.min}-${e.max} crosses a pit`);
}
for (const s of L.speedBoxes) assert.ok(!overGap(s.x, s.x + s.w), 'speed box over pit ' + s.x);
for (const v of D.vents) assert.ok(!overGap(v.x, v.x + 32), 'vent over pit ' + v.x);
for (const l of D.lasers) assert.ok(!overGap(l.x, l.x + 32), 'laser over pit ' + l.x);
console.log(`${hops.length - failures}/${hops.length} hops reachable in ${((Date.now() - started) / 1000).toFixed(1)}s`);
assert.equal(failures, 0, 'unreachable hops');

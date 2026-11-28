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
let STATIC = staticSolids();
let MOVERS = D.movers;

function simulate(from, to, plan, t0) {
  // from: surface we stand on (or pad), plan: {x0, j2, j3, release}
  const isPad = !!from.bounce;
  const fromRect = from.period ? moverAt(from, t0) : from;
  const p = { x: plan.x0, y: fromRect.y - H, w: W, h: H, vx: MAX, vy: 0 };
  let grounded = true, jumps = 0, frame = 0, lastPress = -99;
  if (isPad) { p.vy = -from.bounce; grounded = false; jumps = 1; }
  for (; frame < 280; frame += 1) {
    const t = t0 + frame * (1000 / 60);
    const solids = STATIC.concat(MOVERS.map(m => moverAt(m, t)));
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

// NIGHT TRAIN easter egg: from the braking carriage (moving toward the start
// at brakeSpeed), a triple jump must reach the hidden perch before the
// carriage carries the runner off the left screen edge; stream gaps must be
// crossable between carriages moving at streamSpeed.
function trainJump(startX, carSpeed, target, plan) {
  const p = { x: startX, y: NT.railY - H, vx: 0, vy: 0 };
  let grounded = true, jumps = 0, last = -99;
  for (let f = 0; f < 300; f += 1) {
    if (plan.dir > 0) p.vx = Math.min(MAX, p.vx + ACCEL);
    else if (plan.dir < 0) p.vx = Math.max(-MAX, p.vx - ACCEL);
    else p.vx *= FRICTION;
    if ((f === plan.j1 || f === plan.j2 || f === plan.j3) && f - last >= TAP) {
      last = f;
      if (grounded) { p.vy = J1; grounded = false; jumps = 1; }
      else if (jumps === 1 || jumps === 2) { p.vy = J2; if (plan.dir) p.vx = SIDE * plan.dir; jumps += 1; }
    }
    p.x += p.vx;
    if (grounded) p.x -= carSpeed;
    const py = p.y;
    p.vy += GRAVITY;
    p.y += p.vy;
    const tgt = target(f);
    if (p.vy >= 0 && py + H <= tgt.y + 1 && p.y + H >= tgt.y && p.x < tgt.x + tgt.w && p.x + W > tgt.x) return f;
    if (grounded) { p.y = NT.railY - H; p.vy = 0; }
    if (p.y > 300) return -1;
  }
  return -1;
}
const NT = D.nightTrain;
let perchPlans = 0;
for (let startX = NT.lockCamX + 200; startX > NT.lockCamX - W; startX -= 4) {
  for (const dir of [-1, 0, 1]) for (let j2 = 7; j2 < 40; j2 += 3) for (let j3 = j2 + 7; j3 < j2 + 40; j3 += 3) {
    if (trainJump(startX, NT.brakeSpeed, () => NT.perch, { dir, j1: 0, j2, j3 }) >= 0) perchPlans += 1;
  }
}
console.log('night train perch plans', perchPlans);
let doublePlans = 0;
for (let startX = NT.lockCamX + 200; startX > NT.lockCamX - W; startX -= 8) {
  for (const dir of [-1, 0, 1]) for (let j2 = 7; j2 < 40; j2 += 3) {
    if (trainJump(startX, NT.brakeSpeed, () => NT.perch, { dir, j1: 0, j2, j3: -1 }) >= 0) doublePlans += 1;
  }
}
assert.equal(doublePlans, 0, 'night-train perch must need a triple jump');
assert.ok(perchPlans > 0, 'night-train perch unreachable');
for (const [w, gapPx] of [[234, 260], [234, 230], [234, 150]]) {
  // Runner at the right end of carriage A; carriage B starts gapPx to the right.
  let ok = false;
  for (let back = 0; back < w - 10 && !ok; back += 6) for (let j2 = -1; j2 < 40 && !ok; j2 += 3) {
    const startX = 1000 + w - W - back;
    const target = f => ({ x: 1000 + w + gapPx - NT.streamSpeed * f, y: NT.railY, w: 150 });
    if (trainJump(startX, NT.streamSpeed, target, { dir: 1, j1: 0, j2, j3: -1 }) >= 0) ok = true;
  }
  assert.ok(ok, `night train gap ${gapPx} not crossable`);
}
console.log('night train stream gaps ok');

// LEVEL 1A sky structures: hops from the carriage roofs (a roof strip at the
// rail line) up through every structure, with ground walls disabled as in-game.
const A1 = D.level1A;
const ROOF = { x: 0, y: NT.railY, w: 22000, h: 12, roof: true };
STATIC = [ROOF, ...A1.platforms, ...A1.walls, ...A1.crumbles, ...A1.pads, ...L.platforms];
MOVERS = A1.movers;
const ap = (x, y) => { const s = A1.platforms.find(p => p.x === x && (y === undefined || p.y === y)) || L.platforms.find(p => p.x === x && p.y === y); assert.ok(s, 'no 1A platform ' + x); return s; };
const aw = x => { const s = A1.walls.find(w => w.x === x); assert.ok(s, 'no 1A wall ' + x); return s; };
const am = x => { const s = A1.movers.find(m => m.bx === x); assert.ok(s, 'no 1A mover ' + x); return s; };
const ac = x => { const s = A1.crumbles.find(c => c.x === x); assert.ok(s, 'no 1A crumble ' + x); return s; };
const apad = x => { const s = A1.pads.find(p => p.x === x); assert.ok(s, 'no 1A pad ' + x); return s; };
const roofAt = x => Object.assign({}, ROOF, { x: x - 300, w: 300 });
const R1 = NT.railY;
const hops1A = [
  ['1A signal 1', roofAt(2450), aw(2450)], ['1A signal 2', aw(2450), aw(2540)], ['1A signal 3', aw(2540), aw(2630)],
  ['1A signal top', aw(2630), ap(2720)],
  ['1A underpass 1', roofAt(3650), ap(3650)], ['1A underpass 2', ap(3650), ap(3740)], ['1A -> pigeon hwy', ap(3740), ap(3820, -170)],
  ['1A beam alley lift', roofAt(6500), am(6500)], ['1A beam alley top', am(6500), ap(6720)],
  ['1A clouds 1', roofAt(7600), ac(7600)], ['1A clouds 2', ac(7600), ac(7700)], ['1A clouds 3', ac(7700), ac(7800)],
  ['1A clouds 4', ac(7800), ac(7900)], ['1A clouds 5', ac(7900), ac(8000)], ['1A clouds 6', ac(8000), ac(8100)],
  ['1A clouds top', ac(8100), ap(8200)],
  ['1A storm 1', roofAt(9660), ap(9660)], ['1A storm lift', ap(9660), am(9760)], ['1A storm 2', am(9760), ap(9860)],
  ['1A storm top', ap(9860), aw(10020)],
  ['1A towers pad', roofAt(11000), ap(11000)], ['1A tower 1', apad(11020), aw(11120)], ['1A towers bridge', aw(11120), am(11250)],
  ['1A tower 2', am(11250), aw(11420)],
  ['1A grid 1', roofAt(13300), ap(13300)], ['1A grid 2', ap(13300), ap(13420)], ['1A grid 3', ap(13420), ap(13540)],
  ['1A strato 1', roofAt(14600), ap(14600)], ['1A strato pad 1', apad(14625), ap(14760)], ['1A strato pad 2', apad(14785), ap(14960)],
  ['1A spike lift', roofAt(17000), am(17000)], ['1A spike top', am(17000), ap(17120)],
  ['1A final 1', roofAt(21250), ap(21250)], ['1A -> all city roof', ap(21250), ap(21400, -110)],
  ['1A final 2', ap(21400, -110), aw(21560)], ['1A final 3', aw(21560), aw(21650)], ['1A final vault', aw(21650), ap(21720)]
];
let fail1A = 0;
for (const [name, from, to] of hops1A) {
  const r = canHop(from, to);
  if (!r) { fail1A += 1; console.log('FAIL', name); } else console.log('ok  ', name.padEnd(22), `jumps=${r.n}`);
}
assert.equal(fail1A, 0, 'unreachable Level 1A hops');
// Low gantries must be clearable standing-crouched (bottom edge above a crouched head).
for (const b of A1.beams) assert.ok(b.y + b.h <= NT.railY - 22 && b.y + b.h > NT.railY - 34, 'gantry at ' + b.x + ' must hit standing, clear crouching');
STATIC = staticSolids();
MOVERS = D.movers;

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

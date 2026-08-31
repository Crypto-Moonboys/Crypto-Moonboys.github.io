import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEAD_RUN_HARD_SPEED_MPS,
  buildCombatPlan,
  buildRoutePlan,
  difficultyForPlayer,
  distanceMeters,
  hordeEventDescriptor,
  movePoint,
  processTelemetryBatch,
  scoreRun,
} from '../workers/moonboys-api/routes/dead-run-core.js';

const origin = { lat: 51.5074, lng: -0.1278 };

const moved = movePoint(origin, 90, 100);
assert.ok(Math.abs(distanceMeters(origin, moved) - 100) < 1.5, 'geo helpers should preserve requested metres');

const rookie = difficultyForPlayer({ xp_total: 0, best_survival_seconds: 0, runs_total: 0 });
const veteran = difficultyForPlayer({ xp_total: 6000, best_survival_seconds: 1800, runs_total: 100 });
assert.equal(rookie.tier, 1);
assert.equal(veteran.tier, 5);
assert.ok(veteran.base_speed_mps > rookie.base_speed_mps, 'difficulty must scale zombie speed');
assert.ok(veteran.spawn_count > rookie.spawn_count, 'difficulty must scale horde size');

const routeA = buildRoutePlan(origin, 123456, { heading_deg: 42 });
const routeB = buildRoutePlan(origin, 123456, { heading_deg: 42 });
assert.deepEqual(routeA, routeB, 'safe route plans must be deterministic per server seed');
assert.ok(routeA.waypoints.length >= 4 && routeA.waypoints.length <= 10);
assert.equal(routeA.pickups.length, routeA.waypoints.length);
for (const point of routeA.waypoints) {
  assert.ok(distanceMeters(origin, point) < 610, 'generated route point must stay local to the run origin');
}
assert.match(routeA.warning, /real-world conditions/i, 'route response must carry a pedestrian safety warning');

const combatA = buildCombatPlan(origin, 123456, rookie);
const combatB = buildCombatPlan(origin, 123456, rookie);
assert.deepEqual(combatA, combatB, 'combat plan must be deterministic per server seed');
assert.equal(combatA.waves.length, rookie.wave_count);
assert.equal(combatA.waves[0].zombies[0].id, 'w0z0');

const now = Date.now();
const plausible1 = movePoint(origin, 90, 7);
const plausible2 = movePoint(plausible1, 90, 8);
const telemetry = processTelemetryBatch({
  last_lat: origin.lat,
  last_lng: origin.lng,
  last_sample_at_ms: now - 6000,
  last_client_seq: 0,
  last_speed_mps: 0,
}, [
  { seq: 1, timestamp_ms: now - 4000, lat: plausible1.lat, lng: plausible1.lng, accuracy_m: 8 },
  { seq: 2, timestamp_ms: now - 2000, lat: plausible2.lat, lng: plausible2.lng, accuracy_m: 8 },
], now);
assert.equal(telemetry.accepted, 2);
assert.ok(telemetry.distance_delta_m > 12 && telemetry.distance_delta_m < 20, 'plausible running telemetry should count server-side distance');
assert.equal(telemetry.flags.length, 0);

const teleport = movePoint(origin, 90, DEAD_RUN_HARD_SPEED_MPS * 5 + 150);
const cheated = processTelemetryBatch({
  last_lat: origin.lat,
  last_lng: origin.lng,
  last_sample_at_ms: now - 5000,
  last_client_seq: 0,
  last_speed_mps: 0,
}, [
  { seq: 1, timestamp_ms: now - 1000, lat: teleport.lat, lng: teleport.lng, accuracy_m: 5 },
], now);
assert.ok(cheated.suspicious_delta >= 2, 'teleport/impossible-speed GPS must increase risk');
assert.ok(cheated.flags.includes('impossible_speed'));
assert.equal(cheated.distance_delta_m, 0, 'impossible movement must not count toward charge or score');

const score = scoreRun({ verified_distance_m: 4200, survival_seconds: 1800, kills: 90, crates: 12, shove_count: 5 }, veteran);
assert.ok(score.score > 0);
assert.ok(score.xp > 0 && score.xp <= 250, 'per-run XP must remain capped');

const horde = hordeEventDescriptor(Date.UTC(2026, 7, 31, 13, 10, 0));
assert.equal(horde.event_id, 'horde:2026-08-31:12');
assert.equal(Date.parse(horde.end_at) - Date.parse(horde.start_at), 6 * 60 * 60 * 1000);
assert.equal(horde.target_kills, 750);

const routeSource = fs.readFileSync(new URL('../workers/moonboys-api/routes/dead-run.js', import.meta.url), 'utf8');
assert.match(routeSource, /DEAD_RUN_ROUTE_PREFIX = '\/api\/dead-run'/, 'Dead Run API prefix must remain stable');
for (const suffix of [
  '/profile',
  '/session/start',
  '/session/resume',
  '/session/telemetry',
  '/session/action',
  '/session/finish',
  '/leaderboard',
  '/horde/current',
]) assert.ok(routeSource.includes('`${DEAD_RUN_ROUTE_PREFIX}' + suffix + '`'), `missing Dead Run route ${suffix}`);
assert.match(routeSource, /verifyTelegramMiniAppInitData/, 'Dead Run writes must authenticate Telegram Mini App initData');
assert.match(routeSource, /arcade_progression_state/, 'ranked settlement must credit shared Arcade XP');
assert.match(routeSource, /arcade_xp_wallets/, 'ranked settlement must credit spendable Arcade XP authority');
assert.match(routeSource, /start_lat = NULL[\s\S]*last_lng = NULL/, 'finished/abandoned sessions must clear precise stored GPS coordinates');

console.log('Dead Run API/core contract: PASS');

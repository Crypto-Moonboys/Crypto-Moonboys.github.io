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
const now = Date.now();
const routeSource = fs.readFileSync(new URL('../workers/moonboys-api/routes/dead-run.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../games/dead-run/app.js', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('../games/dead-run/index.html', import.meta.url), 'utf8');
const phase5Source = fs.readFileSync(new URL('../workers/moonboys-api/worker-phase5-final.js', import.meta.url), 'utf8');
const migration075 = fs.readFileSync(new URL('../workers/moonboys-api/migrations/075_dead_run_gps_survival.sql', import.meta.url), 'utf8');
const schemaSql = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');

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
assert.ok(telemetry.distance_delta_m > 12 && telemetry.distance_delta_m < 20, 'plausible telemetry should count server-side distance');
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

assert.match(routeSource, /DEAD_RUN_ROUTE_PREFIX = '\/api\/dead-run'/, 'Dead Run API prefix must remain stable');
for (const suffix of ['/profile', '/session/start', '/session/resume', '/session/telemetry', '/session/action', '/session/finish', '/leaderboard', '/horde/current']) {
  assert.ok(routeSource.includes('`${DEAD_RUN_ROUTE_PREFIX}' + suffix + '`'), `missing Dead Run route ${suffix}`);
}
assert.match(routeSource, /verifyTelegramMiniAppInitData/, 'Dead Run writes must authenticate Telegram Mini App initData');
assert.match(routeSource, /arcade_progression_state/, 'ranked settlement must credit shared Arcade XP');
assert.match(routeSource, /arcade_xp_wallets/, 'ranked settlement must credit spendable Arcade XP authority');
assert.match(routeSource, /start_lat = NULL[\s\S]*last_lng = NULL/, 'finished/abandoned sessions must clear precise stored GPS coordinates');

console.log('Dead Run API/core contract: PASS');

// Anti-spoof: rejected movement must not advance the accepted coordinate.
{
  const base = movePoint(origin, 0, 10);
  const teleportPos = movePoint(origin, 90, DEAD_RUN_HARD_SPEED_MPS * 10 + 200);
  const validAfterTeleport = movePoint(base, 0, 5);
  const batchWithTeleport = processTelemetryBatch(
    { last_lat: origin.lat, last_lng: origin.lng, last_sample_at_ms: now - 10000, last_client_seq: 0, last_speed_mps: 0 },
    [
      { seq: 1, timestamp_ms: now - 8000, lat: base.lat, lng: base.lng, accuracy_m: 5 },
      { seq: 2, timestamp_ms: now - 6000, lat: teleportPos.lat, lng: teleportPos.lng, accuracy_m: 5 },
      { seq: 3, timestamp_ms: now - 4000, lat: validAfterTeleport.lat, lng: validAfterTeleport.lng, accuracy_m: 5 },
    ],
    now,
  );
  assert.ok(batchWithTeleport.flags.includes('impossible_speed'), 'teleport sample must be flagged impossible_speed');
  assert.ok(batchWithTeleport.last, 'at least one sample should be accepted');
  assert.ok(distanceMeters({ lat: batchWithTeleport.last.lat, lng: batchWithTeleport.last.lng }, teleportPos) > 50,
    'last accepted position must not be the rejected teleport');
  assert.equal(batchWithTeleport.accepted, 2, 'seq 1 and seq 3 should be accepted');
}

// Auth lifetime must match the two-hour run window plus recovery margin.
assert.match(routeSource, /TELEGRAM_INIT_DATA_MAX_AGE_SECONDS\s*=\s*Math\.ceil\(ACTIVE_SESSION_TTL_MS \/ 1000\) \+ 900/,
  'initData max age must be tied to the active session TTL plus a recovery margin');
assert.doesNotMatch(routeSource, /max_age_seconds:\s*3600/, 'Dead Run must not hard-code one-hour auth for a two-hour session');

// Survival and combat must be bounded by active verified movement, not one late heartbeat.
assert.match(routeSource, /ACTIVE_PLAY_MIN_SPEED_MPS/, 'active play must include a movement-coverage threshold');
assert.match(routeSource, /function activePlaySeconds\([\s\S]*verified_distance_m[\s\S]*ACTIVE_PLAY_MIN_SPEED_MPS[\s\S]*telemetryBoundSeconds/,
  'activePlaySeconds must cap credited survival by verified movement coverage and telemetry time');
assert.match(routeSource, /const telemetryBoundSeconds = activePlaySeconds\(session, lastSampleMs\)/,
  'handleFinish must use activePlaySeconds for survival authority');
assert.match(routeSource, /function hordeActivePlayMs\([\s\S]*activePlaySeconds\(session, lastSampleMs\)/,
  'combat movement must use active-play time derived from activePlaySeconds');
assert.match(routeSource, /const hordeActiveMs = hordeActivePlayMs\(session, lastSampleMs, headStartEndMs\)/,
  'shoot range must use active-play horde time, not raw wall-clock elapsed time');
assert.doesNotMatch(routeSource, /const hordeActiveMs = Math\.max\(0, lastSampleMs - headStartEndMs\)/,
  'one fresh heartbeat must not make hordeActiveMs cover the whole idle interval');

// Action atomicity: sequential INSERT-first protocol — claim record before mutating state.
{
  const handleActionStart = routeSource.indexOf('async function handleAction(');
  const handleActionEnd = routeSource.indexOf('\nfunction previousUtcDay', handleActionStart);
  const handleActionSource = routeSource.slice(handleActionStart, handleActionEnd);

  // INSERT must appear before UPDATE in the source — action-first ordering.
  const insertIdx = handleActionSource.indexOf('INSERT INTO dead_run_actions');
  const updateIdx = handleActionSource.indexOf('UPDATE dead_run_sessions\n    SET ammo = ?, slow_inventory');
  assert.ok(insertIdx > -1, 'handleAction must INSERT the action record as the first step');
  assert.ok(updateIdx > -1, 'handleAction must UPDATE session state as the second step');
  assert.ok(insertIdx < updateIdx, 'action record INSERT must precede the session CAS UPDATE (action-first protocol)');

  // The INSERT must use INSERT...SELECT gated on full CAS conditions (no batch needed).
  assert.match(handleActionSource,
    /INSERT INTO dead_run_actions[\s\S]{0,400}SELECT[\s\S]{0,400}FROM dead_run_sessions[\s\S]{0,100}AND ammo = \?/,
    'action INSERT must be conditional on session CAS preconditions via SELECT FROM dead_run_sessions');

  // The INSERT must NOT be inside a db.batch() together with the UPDATE (removes the loser-
  // corrupts-winner race where the batch loser's UPDATE still sees the winner's accepted row).
  assert.ok(
    !handleActionSource.slice(0, updateIdx).includes('env.DB.batch('),
    'handleAction INSERT and UPDATE must be sequential (not batched) to prevent duplicate-race corruption',
  );

  // CAS must cover ammo, kills, slow_inventory, shove_count, crates and current_wave.
  assert.match(handleActionSource,
    /AND ammo = \? AND kills = \? AND slow_inventory = \? AND shove_count = \?/,
    'handleAction state update must include ammo/kills/inventory/shove CAS values');
  assert.match(handleActionSource,
    /AND crates = \? AND current_wave = \?/,
    'handleAction state update must CAS on crates and current_wave');

  // On CAS failure we must only mark OUR OWN claimed row (scoped by telegram_id).
  assert.match(handleActionSource,
    /UPDATE dead_run_actions SET accepted = 0, reason = 'action_conflict'[\s\S]{0,80}AND telegram_id = \?/,
    'conflicted action records must be rejected only for the owning telegram_id');

  // Duplicate race: when INSERT changes=0, we must look up existing record and NOT write to it.
  assert.match(handleActionSource,
    /claimed[\s\S]{0,600}actionAlreadyProcessed/,
    'when INSERT is skipped (claimed=false), existing record must be looked up for replay');
  assert.match(handleActionSource, /dead_run_action_conflict/, 'handleAction must return conflict error code');
}

// Settlement retries: aggregate effects must be idempotent under concurrent retries.
{
  const creditFn = routeSource.slice(routeSource.indexOf('async function creditArcadeXp('), routeSource.indexOf('\nasync function applyHordeContribution'));
  assert.match(creditFn, /db\.batch\(/, 'creditArcadeXp must batch its side effects');
  assert.match(creditFn, /WHERE NOT EXISTS \(SELECT 1 FROM arcade_progression_events WHERE id = \?\)[\s\S]*arcade_xp_wallets/,
    'Arcade wallet/state writes must be guarded by the unique progression event idempotency key');
  assert.match(creditFn, /INSERT OR IGNORE INTO arcade_progression_events/, 'Arcade progression event insert must be idempotent');
  assert.match(creditFn, /SET arcade_xp_applied = 1\s+WHERE session_id = \? AND arcade_xp_applied = 0/,
    'arcade_xp_applied must be a conditional settlement flag');

  const hordeFn = routeSource.slice(routeSource.indexOf('async function applyHordeContribution('), routeSource.indexOf('\nasync function handleFinish'));
  assert.match(hordeFn, /db\.batch\(/, 'applyHordeContribution must batch its side effects');
  assert.match(hordeFn, /UPDATE dead_run_horde_events[\s\S]*AND NOT EXISTS \([\s\S]*dead_run_horde_contributions[\s\S]*event_id = \? AND session_id = \?/,
    'Horde totals must update only when the contribution row does not already exist');
  assert.match(hordeFn, /INSERT OR IGNORE INTO dead_run_horde_contributions/, 'Horde contribution insert must be idempotent');
  assert.match(hordeFn, /SET horde_applied = 1\s+WHERE session_id = \? AND horde_applied = 0/,
    'horde_applied must be a conditional settlement flag');

  const finishFn = routeSource.slice(routeSource.indexOf('async function handleFinish('), routeSource.indexOf('\nasync function handleResume'));
  assert.match(finishFn, /EXISTS \([\s\S]*player_stats_applied = 0[\s\S]*\)[\s\S]*SET player_stats_applied = 1/,
    'player aggregate writes must be guarded by and paired with player_stats_applied');
  assert.match(finishFn, /!Number\(session\.arcade_xp_applied\)[\s\S]*await creditArcadeXp/,
    'handleFinish must gate Arcade XP settlement on arcade_xp_applied');
  assert.match(finishFn, /!Number\(session\.horde_applied\)[\s\S]*stillRanked && !rejected && eventActive[\s\S]*await applyHordeContribution/,
    'handleFinish must gate horde settlement on horde_applied plus ranked/non-rejected/active-event authority');
}

// Settlement ordering: finished must remain the final step.
{
  const settlingIdx = routeSource.lastIndexOf("SET status = 'settling'");
  const playerIdx = routeSource.lastIndexOf('player_stats_applied = 1');
  const creditIdx = routeSource.lastIndexOf('await creditArcadeXp');
  const hordeIdx = routeSource.lastIndexOf('await applyHordeContribution');
  const finishedIdx = routeSource.lastIndexOf("SET status = 'finished'");
  assert.ok(settlingIdx < playerIdx, 'player aggregate must come after active→settling transition');
  assert.ok(playerIdx < creditIdx, 'creditArcadeXp must come after player aggregate batch');
  assert.ok(creditIdx < hordeIdx, 'applyHordeContribution must come after creditArcadeXp');
  assert.ok(hordeIdx < finishedIdx, 'settling→finished transition must be the last settlement step');
}

// Privacy retention and scheduled cleanup.
assert.match(routeSource, /function cleanupExpiredSessions|export async function cleanupExpiredSessions/, 'must export cleanupExpiredSessions');
assert.match(routeSource, /status = 'settling'[\s\S]{0,220}updated_at < \?/, 'cleanup must scrub stale settling sessions');
assert.match(routeSource, /settlingCutoff[\s\S]{0,80}ACTIVE_SESSION_TTL_MS/, 'settling cleanup must use the full session TTL');
assert.doesNotMatch(routeSource, /30 \* 60 \* 1000/, 'settling cleanup must not use a shorter 30-minute TTL');
assert.match(phase5Source, /cleanupExpiredSessions/, 'worker-phase5-final must import and call cleanupExpiredSessions');
assert.match(phase5Source, /async scheduled[\s\S]{0,300}cleanupExpiredSessions/, 'scheduled handler must run cleanupExpiredSessions');
assert.match(phase5Source, /ctx\.waitUntil[\s\S]{0,80}cleanupExpiredSessions/, 'scheduled cleanup must use ctx.waitUntil');

// Client DOM and telemetry contracts.
for (const id of [
  'timeText', 'timeLabel', 'distanceText', 'nearestText', 'ammoText', 'chargeFill', 'shoveBtn',
  'banner', 'startPanel', 'gameOverPanel', 'gameOverTitle', 'finalStats', 'xpResult', 'slowCount',
  'gpsStatus', 'profileBox', 'hordeStrip', 'riskBadge', 'safetyAck', 'resumeBtn', 'leaderboardPanel',
  'leaderboardList', 'startBtn', 'demoBtn', 'againBtn', 'leaderboardBtn', 'closeLeaderboardBtn',
  'centerBtn', 'slowBtn', 'gameLeaderboardBtn',
]) {
  assert.ok(htmlSource.includes(`id="${id}"`), `index.html must contain id="${id}"`);
  assert.ok(appSource.includes(`'${id}'`) || appSource.includes(`"${id}"`), `app.js must reference id "${id}"`);
}
assert.ok(htmlSource.includes('data-metric="score"'), 'leaderboard tabs must use data-metric');
assert.ok(!htmlSource.includes('data-board='), 'index.html must not contain stale data-board attributes');
assert.match(appSource, /_telemetryInFlight/, 'client must serialize telemetry flushes');
assert.match(appSource, /_telemetryInFlight\.then/, 'telemetry flushes must chain on the in-flight promise');
assert.doesNotMatch(appSource, /attributionControl:\s*false/, 'MapLibre attribution must not be suppressed');
assert.match(htmlSource, /Content-Security-Policy/, 'dead-run index.html must include a CSP meta tag');
assert.match(htmlSource, /default-src 'none'/, "CSP must start from 'none'");

// Supply-chain hardening: MapLibre from unpkg must have SRI integrity attributes.
assert.match(htmlSource, /maplibre-gl\.js[\s\S]{0,200}integrity="sha384-/,
  'MapLibre JS script tag must include an SRI sha384 integrity attribute');
assert.match(htmlSource, /maplibre-gl\.css[\s\S]{0,200}integrity="sha384-/,
  'MapLibre CSS link tag must include an SRI sha384 integrity attribute');
assert.match(htmlSource, /crossorigin="anonymous"/, 'SRI-protected resources must set crossorigin=anonymous');

// Tile URL must be configurable and not hardcoded as an opaque string.
assert.match(appSource, /MOONBOYS_API[\s\S]{0,60}DEAD_RUN_TILE_URL/,
  'tile URL must be read from window.MOONBOYS_API.DEAD_RUN_TILE_URL so production can override it');
assert.match(appSource, /TILE_ATTRIBUTION/,
  'tile attribution must derive from a configurable constant so it stays accurate for any provider');

// Migration/schema authority.
for (const flag of ['player_stats_applied', 'arcade_xp_applied', 'horde_applied']) {
  assert.ok(migration075.includes(flag), `migration 075 must define ${flag}`);
  assert.ok(schemaSql.includes(flag), `schema.sql must include ${flag}`);
}

console.log('Dead Run P1/P2 regression checks: PASS');

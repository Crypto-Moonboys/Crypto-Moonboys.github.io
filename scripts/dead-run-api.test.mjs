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

// ---------------------------------------------------------------------------
// Anti-spoof: rejected samples (impossible_speed / speed_spike) must NOT
// advance the persisted session position. A subsequent valid sample must be
// evaluated against the last ACCEPTED coordinate, not the rejected one.
// ---------------------------------------------------------------------------
{
  const base = movePoint(origin, 0, 10);
  const teleportPos = movePoint(origin, 90, DEAD_RUN_HARD_SPEED_MPS * 10 + 200);
  const validAfterTeleport = movePoint(base, 0, 5); // close to base, not teleport

  const batchWithTeleport = processTelemetryBatch(
    { last_lat: origin.lat, last_lng: origin.lng, last_sample_at_ms: now - 10000, last_client_seq: 0, last_speed_mps: 0 },
    [
      // First sample: accepted (moves ~10m from origin)
      { seq: 1, timestamp_ms: now - 8000, lat: base.lat, lng: base.lng, accuracy_m: 5 },
      // Second sample: teleport (impossible speed) — must be REJECTED and must NOT update previous
      { seq: 2, timestamp_ms: now - 6000, lat: teleportPos.lat, lng: teleportPos.lng, accuracy_m: 5 },
      // Third sample: valid from base position — must be accepted if previous stayed at base
      { seq: 3, timestamp_ms: now - 4000, lat: validAfterTeleport.lat, lng: validAfterTeleport.lng, accuracy_m: 5 },
    ],
    now,
  );

  assert.ok(batchWithTeleport.flags.includes('impossible_speed'), 'teleport sample must be flagged impossible_speed');
  // last accepted position must be near validAfterTeleport, not the teleport location
  assert.ok(batchWithTeleport.last, 'at least one sample should be accepted');
  const lastPos = { lat: batchWithTeleport.last.lat, lng: batchWithTeleport.last.lng };
  const distFromTeleport = distanceMeters(lastPos, teleportPos);
  assert.ok(
    distFromTeleport > 50,
    `last accepted position must not be the rejected teleport (got ${distFromTeleport.toFixed(1)} m from teleport, expected > 50 m)`,
  );
  assert.equal(batchWithTeleport.accepted, 2, 'the non-teleport samples must both be accepted (seq 1 and seq 3)');
}

// ---------------------------------------------------------------------------
// Speed-spike samples must also not advance the accepted position.
// ---------------------------------------------------------------------------
{
  const p1 = movePoint(origin, 0, 5);
  // This position would give ~8 m/s over 1.5 s — above MAX_ACCEPTED_SPEED (7.5) but below HARD_SPEED
  const spikePos = movePoint(p1, 0, 12);
  const p2 = movePoint(p1, 0, 4); // valid continuation from p1

  const batchWithSpike = processTelemetryBatch(
    { last_lat: origin.lat, last_lng: origin.lng, last_sample_at_ms: now - 9000, last_client_seq: 0, last_speed_mps: 0 },
    [
      { seq: 1, timestamp_ms: now - 7000, lat: p1.lat, lng: p1.lng, accuracy_m: 6 },
      { seq: 2, timestamp_ms: now - 5500, lat: spikePos.lat, lng: spikePos.lng, accuracy_m: 6 },
      { seq: 3, timestamp_ms: now - 3500, lat: p2.lat, lng: p2.lng, accuracy_m: 6 },
    ],
    now,
  );

  if (batchWithSpike.flags.includes('speed_spike')) {
    // If spike was flagged, last position must not be spikePos
    const lastPos = { lat: batchWithSpike.last.lat, lng: batchWithSpike.last.lng };
    assert.ok(
      distanceMeters(lastPos, spikePos) > 2,
      'last accepted position must not be a rejected speed_spike sample',
    );
  }
}

// ---------------------------------------------------------------------------
// Survival authority: source code must bound survival at last telemetry time.
// ---------------------------------------------------------------------------
{
  assert.match(
    routeSource,
    /TELEMETRY_GRACE_SECONDS/,
    'handleFinish must define a telemetry grace bound for survival',
  );
  assert.match(
    routeSource,
    /last_sample_at_ms/,
    'survival must reference the last accepted telemetry timestamp',
  );
  assert.match(
    routeSource,
    /telemetryBoundSeconds/,
    'survival must be explicitly bounded by telemetry timestamp',
  );
}

// ---------------------------------------------------------------------------
// Settlement idempotency: source must handle settling status for recovery.
// ---------------------------------------------------------------------------
{
  assert.match(
    routeSource,
    /session\.status !== 'settling'/,
    'handleFinish must guard against non-settling status before recovery path',
  );
  assert.match(
    routeSource,
    /status = 'finished'[\s\S]{0,300}status = 'settling'/,
    'settling→finished transition must be a conditional UPDATE guarding on settling status',
  );
  assert.match(
    routeSource,
    /player_stats_applied/,
    'player aggregate update must be guarded by an idempotency flag, not the transition result',
  );
  assert.doesNotMatch(
    routeSource,
    /justTransitioned/,
    'justTransitioned guard must be replaced by player_stats_applied for crash-safe idempotency',
  );
}

// ---------------------------------------------------------------------------
// Action concurrency: session state UPDATE must include expected values (CAS).
// ---------------------------------------------------------------------------
{
  assert.match(
    routeSource,
    /AND ammo = \? AND kills = \?/,
    'handleAction state update must include expected ammo and kills as CAS conditions',
  );
  assert.match(
    routeSource,
    /dead_run_action_conflict/,
    'handleAction must return action_conflict when CAS update finds concurrent mutation',
  );
}

// ---------------------------------------------------------------------------
// Action timing: shot cooldown must use ms-precision ISO timestamps.
// ---------------------------------------------------------------------------
{
  assert.match(
    routeSource,
    /new Date\(serverMs\)\.toISOString\(\)/,
    'recordAction must store ms-precision ISO timestamps for shoot cooldown',
  );
  assert.match(
    routeSource,
    /Date\.parse\(row\.iso_ts\)/,
    'latestShootAt must parse the stored ISO timestamp for ms precision',
  );
  assert.doesNotMatch(
    routeSource,
    /strftime\('%s', created_at\)/,
    'latestShootAt must not use strftime second-precision extraction',
  );
}

// ---------------------------------------------------------------------------
// Horde contribution: only ranked non-rejected runs may contribute.
// ---------------------------------------------------------------------------
{
  assert.match(
    routeSource,
    /stillRanked && !rejected[\s\S]{0,150}applyHordeContribution/,
    'applyHordeContribution must be guarded by stillRanked && !rejected',
  );
}

// ---------------------------------------------------------------------------
// Privacy retention: global cleanup must cover both active and settling sessions.
// ---------------------------------------------------------------------------
{
  assert.match(
    routeSource,
    /cleanupExpiredSessions/,
    'must export a global cleanupExpiredSessions function',
  );
  assert.match(
    routeSource,
    /status = 'settling'[\s\S]{0,200}updated_at < \?/,
    'global cleanup must scrub coordinates from stale settling sessions',
  );
  assert.match(
    routeSource,
    /Math\.random\(\) < 0\.01/,
    'global cleanup must be triggered stochastically on every request',
  );
}

// ---------------------------------------------------------------------------
// Client telemetry: flushTelemetry must be serialized.
// ---------------------------------------------------------------------------
{
  const appSource = fs.readFileSync(new URL('../games/dead-run/app.js', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /_telemetryInFlight/,
    'client must serialize telemetry flushes to prevent out-of-order batches',
  );
  assert.match(
    appSource,
    /_telemetryInFlight\.then/,
    'each flush must chain on the in-flight promise for ordering',
  );
}

// ---------------------------------------------------------------------------
// Map attribution: attributionControl must not be disabled.
// ---------------------------------------------------------------------------
{
  const appSource = fs.readFileSync(new URL('../games/dead-run/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(
    appSource,
    /attributionControl:\s*false/,
    'maplibre attributionControl must not be suppressed',
  );
}

// ---------------------------------------------------------------------------
// CSP: index.html must include a Content-Security-Policy meta tag.
// ---------------------------------------------------------------------------
{
  const htmlSource = fs.readFileSync(new URL('../games/dead-run/index.html', import.meta.url), 'utf8');
  assert.match(
    htmlSource,
    /Content-Security-Policy/,
    'dead-run index.html must include a CSP meta tag',
  );
  assert.match(
    htmlSource,
    /default-src 'none'/,
    "CSP must start from 'none' default",
  );
}

// ---------------------------------------------------------------------------
// Combat authority: shoot range must use last accepted telemetry timestamp,
// not wall-clock time. Offline waiting must not collapse zombie distances.
// ---------------------------------------------------------------------------
{
  assert.match(
    routeSource,
    /STALE_TELEMETRY_SHOOT_MS/,
    'handleAction must define a stale-telemetry threshold for shoot rejection',
  );
  assert.match(
    routeSource,
    /telemetry_required/,
    'handleAction must reject shoot when no telemetry has been accepted',
  );
  assert.match(
    routeSource,
    /telemetry_stale/,
    'handleAction must reject shoot when last accepted telemetry is too old',
  );
  assert.match(
    routeSource,
    /last_sample_at_ms[\s\S]{0,300}headStartEndMs/,
    'zombie movement must be derived from last_sample_at_ms, not nowMs',
  );
  assert.doesNotMatch(
    routeSource,
    /elapsedSinceStart[\s\S]{0,60}Date\.now/,
    'zombie range must not use wall-clock elapsed time for movement calculation',
  );
  assert.match(
    routeSource,
    /SHOVE_PUSHBACK_M/,
    'shove pushback must be included in zombie estimated distance',
  );
  // Verify that a session with no telemetry has combat blocked at the source level.
  // (last_sample_at_ms = 0 → telemetry_required must be hit before any distance check)
  assert.ok(
    routeSource.indexOf('telemetry_required') < routeSource.indexOf('estimatedDistance'),
    'telemetry_required check must precede any distance calculation in handleAction',
  );
}

// ---------------------------------------------------------------------------
// Settlement order: finished must be the LAST step in the settling path.
// ---------------------------------------------------------------------------
{
  // Use the call-site patterns (not function definitions) for ordering.
  const settlingIdx = routeSource.lastIndexOf("SET status = 'settling'");
  const playerBatchIdx = routeSource.lastIndexOf('player_stats_applied = 1');
  const creditIdx = routeSource.lastIndexOf('await creditArcadeXp');
  const hordeIdx = routeSource.lastIndexOf('await applyHordeContribution');
  const finishedIdx = routeSource.lastIndexOf("SET status = 'finished'");
  assert.ok(settlingIdx < playerBatchIdx, 'player aggregate must come after active→settling transition');
  assert.ok(playerBatchIdx < creditIdx, 'creditArcadeXp must come after player aggregate batch');
  assert.ok(creditIdx < hordeIdx, 'applyHordeContribution must come after creditArcadeXp');
  assert.ok(hordeIdx < finishedIdx, 'settling→finished transition must be the last settlement step');
}

// ---------------------------------------------------------------------------
// Scheduled cleanup: worker-phase5-final.js must invoke cleanupExpiredSessions
// in the scheduled handler so GPS coordinates are scrubbed by cron, not only by
// probabilistic request traffic.
// ---------------------------------------------------------------------------
{
  const phase5Source = fs.readFileSync(
    new URL('../workers/moonboys-api/worker-phase5-final.js', import.meta.url),
    'utf8',
  );
  assert.match(
    phase5Source,
    /cleanupExpiredSessions/,
    'worker-phase5-final must import and call cleanupExpiredSessions',
  );
  assert.match(
    phase5Source,
    /async scheduled[\s\S]{0,300}cleanupExpiredSessions/,
    'cleanupExpiredSessions must be called inside the scheduled handler',
  );
  assert.match(
    phase5Source,
    /ctx\.waitUntil[\s\S]{0,80}cleanupExpiredSessions/,
    'scheduled cleanup must use ctx.waitUntil so it does not block the cron response',
  );
}

console.log('Dead Run P1 regression checks: PASS');

// ---------------------------------------------------------------------------
// DOM contract: every ID used in app.js must be present in index.html.
// ---------------------------------------------------------------------------
{
  const htmlSource = fs.readFileSync(
    new URL('../games/dead-run/index.html', import.meta.url),
    'utf8',
  );
  const appSource = fs.readFileSync(
    new URL('../games/dead-run/app.js', import.meta.url),
    'utf8',
  );
  const requiredIds = [
    'timeText', 'timeLabel', 'distanceText', 'nearestText', 'ammoText',
    'chargeFill', 'shoveBtn', 'banner', 'startPanel', 'gameOverPanel',
    'gameOverTitle', 'finalStats', 'xpResult', 'slowCount', 'gpsStatus',
    'profileBox', 'hordeStrip', 'riskBadge', 'safetyAck', 'resumeBtn',
    'leaderboardPanel', 'leaderboardList',
    'startBtn', 'demoBtn', 'againBtn', 'leaderboardBtn', 'closeLeaderboardBtn',
    'centerBtn', 'slowBtn', 'gameLeaderboardBtn',
  ];
  for (const id of requiredIds) {
    assert.ok(
      htmlSource.includes(`id="${id}"`),
      `index.html must contain id="${id}" (used by app.js)`,
    );
    assert.ok(
      appSource.includes(`'${id}'`) || appSource.includes(`"${id}"`),
      `app.js must reference id "${id}"`,
    );
  }
  // Tabs must use data-metric to match app.js dataset.metric reads.
  assert.ok(
    htmlSource.includes('data-metric="score"'),
    'leaderboard tabs must use data-metric attribute to match app.js dataset.metric',
  );
  assert.ok(
    !htmlSource.includes('data-board='),
    'index.html must not contain stale data-board attributes',
  );
}

// ---------------------------------------------------------------------------
// Action atomicity: action-first INSERT...SELECT must precede the CAS UPDATE.
// ---------------------------------------------------------------------------
{
  const insertSelectIdx = routeSource.indexOf('INSERT INTO dead_run_actions');
  const casUpdateIdx = routeSource.lastIndexOf(
    'UPDATE dead_run_sessions\n    SET ammo = ?, slow_inventory',
  );
  assert.ok(insertSelectIdx > -1, 'handleAction must use INSERT...SELECT for action-first protocol');
  assert.ok(casUpdateIdx > -1, 'handleAction must retain CAS UPDATE for session state mutation');
  assert.ok(
    insertSelectIdx < casUpdateIdx,
    'action record INSERT must precede the session state CAS UPDATE (action-first protocol)',
  );
  // Verify the INSERT uses SELECT...FROM dead_run_sessions to gate on CAS conditions.
  assert.match(
    routeSource,
    /INSERT INTO dead_run_actions[\s\S]{0,300}SELECT[\s\S]{0,300}FROM dead_run_sessions[\s\S]{0,300}AND ammo = \?/,
    'action INSERT must be conditional on CAS preconditions via SELECT FROM dead_run_sessions',
  );
  // Verify rejected-CAS path marks the claimed action record as rejected.
  assert.match(
    routeSource,
    /UPDATE dead_run_actions SET accepted = 0[\s\S]{0,60}action_conflict/,
    'a CAS failure after action claim must update the action record to rejected',
  );
}

// ---------------------------------------------------------------------------
// Settlement holes: arcade_xp_applied and horde_applied flags must be set
// inside a db.batch() together with the side-effect writes they guard.
// ---------------------------------------------------------------------------
{
  // Verify both new flags exist in the session schema.
  assert.match(
    routeSource,
    /arcade_xp_applied/,
    'dead-run.js must reference arcade_xp_applied settlement flag',
  );
  assert.match(
    routeSource,
    /horde_applied/,
    'dead-run.js must reference horde_applied settlement flag',
  );

  // creditArcadeXp: arcade_xp_applied flag must be set inside a db.batch() call.
  const creditFnStart = routeSource.indexOf('async function creditArcadeXp(');
  const creditFnEnd = routeSource.indexOf('\nasync function', creditFnStart + 1);
  const creditFn = routeSource.slice(creditFnStart, creditFnEnd > -1 ? creditFnEnd : undefined);
  assert.match(
    creditFn,
    /db\.batch\(/,
    'creditArcadeXp must use db.batch() for atomic writes',
  );
  assert.match(
    creditFn,
    /SET arcade_xp_applied = 1/,
    'creditArcadeXp batch must set arcade_xp_applied = 1 inside the same batch',
  );

  // applyHordeContribution: horde_applied flag must be set inside a db.batch() call.
  const hordeFnStart = routeSource.indexOf('async function applyHordeContribution(');
  const hordeFnEnd = routeSource.indexOf('\nasync function', hordeFnStart + 1);
  const hordeFn = routeSource.slice(hordeFnStart, hordeFnEnd > -1 ? hordeFnEnd : undefined);
  assert.match(
    hordeFn,
    /db\.batch\(/,
    'applyHordeContribution must use db.batch() for atomic writes',
  );
  assert.match(
    hordeFn,
    /SET horde_applied = 1/,
    'applyHordeContribution batch must set horde_applied = 1 inside the same batch',
  );

  // handleFinish recovery must gate each step on its flag.
  assert.match(
    routeSource,
    /session\.arcade_xp_applied[\s\S]{0,60}creditArcadeXp/,
    'handleFinish must gate creditArcadeXp on arcade_xp_applied flag',
  );
  assert.match(
    routeSource,
    /session\.horde_applied[\s\S]{0,100}applyHordeContribution/,
    'handleFinish must gate applyHordeContribution on horde_applied flag',
  );
}

// ---------------------------------------------------------------------------
// Scheduled cleanup TTL: settling sessions must use the full ACTIVE_SESSION_TTL_MS
// window, not a shorter 30-minute cutoff.
// ---------------------------------------------------------------------------
{
  // The settlingCutoff must reference ACTIVE_SESSION_TTL_MS, not a literal minute count.
  assert.match(
    routeSource,
    /settlingCutoff[\s\S]{0,80}ACTIVE_SESSION_TTL_MS/,
    'settling cleanup cutoff must be based on ACTIVE_SESSION_TTL_MS, not a shorter literal TTL',
  );
  // Confirm the old 30-minute literal is gone.
  assert.ok(
    !routeSource.includes('30 * 60 * 1000'),
    'settling cleanup must not use the old 30-minute hard-coded TTL',
  );
}

// ---------------------------------------------------------------------------
// Migration schema: new settlement flags must be present in both 075 and schema.sql.
// ---------------------------------------------------------------------------
{
  const migration075 = fs.readFileSync(
    new URL('../workers/moonboys-api/migrations/075_dead_run_gps_survival.sql', import.meta.url),
    'utf8',
  );
  const schemaSql = fs.readFileSync(
    new URL('../workers/moonboys-api/schema.sql', import.meta.url),
    'utf8',
  );
  for (const flag of ['arcade_xp_applied', 'horde_applied']) {
    assert.ok(
      migration075.includes(flag),
      `migration 075 must define the ${flag} column`,
    );
    assert.ok(
      schemaSql.includes(flag),
      `schema.sql must include the ${flag} column`,
    );
  }
}

console.log('Dead Run P1 regression checks (round 2): PASS');

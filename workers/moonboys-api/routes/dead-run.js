import { verifyTelegramMiniAppInitData } from '../pets/mini-app-auth.js';
import {
  DEAD_RUN_CHARGE_METERS,
  DEAD_RUN_DAILY_RANKED_LIMIT,
  DEAD_RUN_HEAD_START_SECONDS,
  DEAD_RUN_MAX_AMMO,
  DEAD_RUN_MAX_SESSION_SECONDS,
  DEAD_RUN_PICKUP_RADIUS_M,
  DEAD_RUN_SHOOT_RANGE_M,
  buildCombatPlan,
  buildRoutePlan,
  difficultyForPlayer,
  displayName,
  distanceMeters,
  hordeEventDescriptor,
  pickupById,
  processTelemetryBatch,
  scoreRun,
  zombieById,
} from './dead-run-core.js';

const DEAD_RUN_ROUTE_PREFIX = '/api/dead-run';
const ACTIVE_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const SHOOT_COOLDOWN_MS = 180;
const SUSPICIOUS_UNRANKED_THRESHOLD = 6;
const SUSPICIOUS_REJECT_THRESHOLD = 14;
const DEAD_RUN_RATE_WINDOW_MS = 60_000;
const DEAD_RUN_RATE_BUCKETS = new Map();
const DEAD_RUN_RATE_MAX_BUCKETS = 5000;

function enforceDeadRunRateLimit(request, pathname) {
  const ip = String(request?.headers?.get('CF-Connecting-IP') || request?.headers?.get('X-Forwarded-For') || 'unknown')
    .split(',', 1)[0].trim().slice(0, 80);
  const now = Date.now();
  const key = `${ip}:${pathname}`;
  const limit = pathname.endsWith('/session/telemetry') ? 120
    : pathname.endsWith('/session/action') ? 120
      : 60;
  let bucket = DEAD_RUN_RATE_BUCKETS.get(key);
  if (!bucket || now - bucket.started_at >= DEAD_RUN_RATE_WINDOW_MS) bucket = { started_at: now, count: 0 };
  bucket.count += 1;
  DEAD_RUN_RATE_BUCKETS.set(key, bucket);
  if (DEAD_RUN_RATE_BUCKETS.size > DEAD_RUN_RATE_MAX_BUCKETS) {
    const oldest = [...DEAD_RUN_RATE_BUCKETS.entries()].sort((left, right) => left[1].started_at - right[1].started_at).slice(0, 500);
    for (const [oldKey] of oldest) DEAD_RUN_RATE_BUCKETS.delete(oldKey);
  }
  if (bucket.count <= limit) return null;
  return new Response(JSON.stringify({ ok: false, error: 'dead_run_rate_limited' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(Math.max(1, Math.ceil((bucket.started_at + DEAD_RUN_RATE_WINDOW_MS - now) / 1000))),
      ...corsHeaders(request),
    },
  });
}
const CORS_ALLOWED_ORIGINS = new Set([
  'https://cryptomoonboys.com',
  'https://www.cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
]);

function boolEnv(env, key, fallback = true) {
  const value = String(env?.[key] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return !['0', 'false', 'off', 'no'].includes(value);
}

function integerEnv(env, key, fallback, min, max) {
  const parsed = Math.floor(Number(env?.[key]));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function corsHeaders(request) {
  const origin = String(request?.headers?.get('Origin') || '').trim();
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
  if (origin && CORS_ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
  });
}

function errorJson(request, error, status = 400, detail = undefined) {
  return json(request, { ok: false, error, ...(detail ? { detail } : {}) }, status);
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function safeNowMs() { return Date.now(); }
function isoNow(nowMs = safeNowMs()) { return new Date(nowMs).toISOString(); }
function dayKey(nowMs = safeNowMs()) { return new Date(nowMs).toISOString().slice(0, 10); }

function randomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] >>> 0;
}

function positionFromBody(body) {
  const source = body?.position || body?.gps || {};
  const lat = Number(source.lat);
  const lng = Number(source.lng);
  const accuracy = Number(source.accuracy_m ?? source.accuracy);
  const timestamp = Number(source.timestamp_ms ?? source.timestamp ?? Date.now());
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 100) return null;
  if (!Number.isFinite(timestamp)) return null;
  return { lat, lng, accuracy_m: accuracy, timestamp_ms: Math.floor(timestamp) };
}

async function verifyIdentity(request, env, body) {
  if (!env?.TELEGRAM_BOT_TOKEN) return { ok: false, status: 503, reason: 'dead_run_telegram_not_configured' };
  const initData = String(body?.init_data || body?.telegram_init_data || '').trim();
  const verified = await verifyTelegramMiniAppInitData(initData, env.TELEGRAM_BOT_TOKEN, { max_age_seconds: 3600 });
  if (!verified.ok) return { ok: false, status: 401, reason: verified.reason || 'dead_run_auth_rejected' };
  return { ok: true, ...verified };
}

async function ensureTables(db) {
  const names = [
    'dead_run_players',
    'dead_run_sessions',
    'dead_run_actions',
    'dead_run_horde_events',
    'dead_run_horde_contributions',
  ];
  for (const table of names) {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1").bind(table).first();
    if (!row?.name) return false;
  }
  return true;
}

async function upsertTelegramUser(db, identity) {
  const user = identity.user || {};
  const telegramId = identity.telegramId;
  await db.prepare(`
    INSERT INTO telegram_users (telegram_id, username, first_name, last_name, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    telegramId,
    user.username || null,
    user.first_name || null,
    user.last_name || null,
  ).run();

  await db.prepare(`
    INSERT INTO dead_run_players (telegram_id, display_name, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, displayName(user)).run();
}

async function getPlayer(db, telegramId) {
  return db.prepare(`
    SELECT telegram_id, display_name, xp_total, runs_total, ranked_runs_total,
           best_survival_seconds, best_distance_m, best_score, kills_total,
           crates_total, horde_events_total, current_streak, best_streak,
           last_run_day, created_at, updated_at
    FROM dead_run_players
    WHERE telegram_id = ? LIMIT 1
  `).bind(telegramId).first();
}

async function getDailyRunCount(db, telegramId, key) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM dead_run_sessions
    WHERE telegram_id = ? AND day_key = ? AND status = 'finished' AND ranked = 1
  `).bind(telegramId, key).first();
  return Math.max(0, Math.floor(Number(row?.count) || 0));
}

async function ensureHordeEvent(db, nowMs = Date.now()) {
  const descriptor = hordeEventDescriptor(nowMs);
  await db.prepare(`
    INSERT INTO dead_run_horde_events
      (event_id, starts_at, ends_at, target_kills, kills_total, participants, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(
    descriptor.event_id,
    descriptor.start_at,
    descriptor.end_at,
    descriptor.target_kills,
  ).run();
  return db.prepare(`
    SELECT event_id, starts_at, ends_at, target_kills, kills_total, participants, status
    FROM dead_run_horde_events WHERE event_id = ? LIMIT 1
  `).bind(descriptor.event_id).first();
}

function publicHorde(row, nowMs = Date.now()) {
  if (!row) return null;
  const target = Math.max(1, Number(row.target_kills) || 1);
  const kills = Math.max(0, Number(row.kills_total) || 0);
  return {
    event_id: String(row.event_id),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    target_kills: target,
    kills_total: kills,
    participants: Math.max(0, Number(row.participants) || 0),
    status: kills >= target ? 'cleared' : String(row.status || 'active'),
    progress: Math.min(1, kills / target),
    remaining_seconds: Math.max(0, Math.floor((Date.parse(row.ends_at) - nowMs) / 1000)),
    xp_multiplier: 1.1,
  };
}

function sessionOrigin(session) {
  if (session?.start_lat == null || session?.start_lng == null) return null;
  return { lat: Number(session.start_lat), lng: Number(session.start_lng) };
}

function sessionPlayerPosition(session) {
  if (session?.last_lat == null || session?.last_lng == null) return sessionOrigin(session);
  return { lat: Number(session.last_lat), lng: Number(session.last_lng) };
}

function sessionDifficulty(session) {
  return difficultyForPlayer({
    xp_total: Number(session?.difficulty_xp_basis) || 0,
    best_survival_seconds: Number(session?.difficulty_best_basis) || 0,
    runs_total: Number(session?.difficulty_runs_basis) || 0,
  });
}

function riskLabel(points) {
  const value = Number(points) || 0;
  if (value >= SUSPICIOUS_REJECT_THRESHOLD) return 'rejected';
  if (value >= SUSPICIOUS_UNRANKED_THRESHOLD) return 'unranked';
  if (value >= 2) return 'watch';
  return 'clean';
}

async function listConsumedTargets(db, sessionId) {
  const rows = await db.prepare(`
    SELECT action_type, target_id
    FROM dead_run_actions
    WHERE session_id = ? AND accepted = 1 AND target_id IS NOT NULL
  `).bind(sessionId).all().catch(() => ({ results: [] }));
  const killed = [];
  const collected = [];
  for (const row of rows.results || []) {
    if (row.action_type === 'shoot') killed.push(String(row.target_id));
    if (row.action_type === 'pickup') collected.push(String(row.target_id));
  }
  return { killed, collected };
}

async function sessionPayload(db, session, nowMs = Date.now()) {
  const origin = sessionOrigin(session);
  const difficulty = sessionDifficulty(session);
  const route = origin ? buildRoutePlan(origin, Number(session.seed) || 0, { heading_deg: Number(session.heading_deg) }) : null;
  const combat = origin ? buildCombatPlan(origin, Number(session.seed) || 0, difficulty) : null;
  const consumed = await listConsumedTargets(db, session.session_id);
  const horde = await ensureHordeEvent(db, nowMs);
  return {
    session_id: session.session_id,
    server_time: isoNow(nowMs),
    status: session.status,
    ranked: Number(session.ranked) === 1,
    day_key: session.day_key,
    head_start_seconds: DEAD_RUN_HEAD_START_SECONDS,
    started_at: session.started_at,
    difficulty,
    route,
    combat,
    state: {
      verified_distance_m: Math.max(0, Number(session.verified_distance_m) || 0),
      ammo: Math.max(0, Number(session.ammo) || 0),
      slow_inventory: Math.max(0, Number(session.slow_inventory) || 0),
      charge_m: Math.max(0, Number(session.charge_m) || 0),
      charge_ratio: Math.min(1, Math.max(0, Number(session.charge_m) || 0) / DEAD_RUN_CHARGE_METERS),
      kills: Math.max(0, Number(session.kills) || 0),
      crates: Math.max(0, Number(session.crates) || 0),
      shove_count: Math.max(0, Number(session.shove_count) || 0),
      current_wave: Math.max(0, Number(session.current_wave) || 0),
      last_client_seq: Math.max(0, Number(session.last_client_seq) || 0),
      slow_until_ms: Math.max(0, Number(session.slow_until_ms) || 0),
      suspicious_points: Math.max(0, Number(session.suspicious_points) || 0),
      risk: riskLabel(session.suspicious_points),
      killed_targets: consumed.killed,
      collected_targets: consumed.collected,
    },
    horde: publicHorde(horde, nowMs),
  };
}

async function handleProfile(request, env, body) {
  const identity = await verifyIdentity(request, env, body);
  if (!identity.ok) return errorJson(request, identity.reason, identity.status);
  if (!await ensureTables(env.DB)) return errorJson(request, 'dead_run_schema_not_applied', 503);
  await upsertTelegramUser(env.DB, identity);
  const nowMs = Date.now();
  const player = await getPlayer(env.DB, identity.telegramId);
  const dailyRuns = await getDailyRunCount(env.DB, identity.telegramId, dayKey(nowMs));
  const dailyLimit = integerEnv(env, 'DEAD_RUN_DAILY_RANKED_LIMIT', DEAD_RUN_DAILY_RANKED_LIMIT, 1, 20);
  const horde = await ensureHordeEvent(env.DB, nowMs);
  const active = await env.DB.prepare(`
    SELECT * FROM dead_run_sessions
    WHERE telegram_id = ? AND status = 'active'
    ORDER BY started_at DESC LIMIT 1
  `).bind(identity.telegramId).first().catch(() => null);
  return json(request, {
    ok: true,
    player,
    daily: { ranked_completed: dailyRuns, ranked_limit: dailyLimit, ranked_remaining: Math.max(0, dailyLimit - dailyRuns) },
    horde: publicHorde(horde, nowMs),
    active_session: active ? await sessionPayload(env.DB, active, nowMs) : null,
  });
}

async function cleanupExpiredSessions(db, nowMs) {
  const activeCutoff = new Date(nowMs - ACTIVE_SESSION_TTL_MS).toISOString();
  // Stale settling sessions: stuck > 30 min — scrub coordinates and mark abandoned.
  const settlingCutoff = new Date(nowMs - 30 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare(`
      UPDATE dead_run_sessions
      SET status = 'abandoned', ended_at = CURRENT_TIMESTAMP,
          start_lat = NULL, start_lng = NULL, last_lat = NULL, last_lng = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'active' AND started_at < ?
    `).bind(activeCutoff),
    db.prepare(`
      UPDATE dead_run_sessions
      SET status = 'abandoned',
          start_lat = NULL, start_lng = NULL, last_lat = NULL, last_lng = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'settling' AND updated_at < ?
    `).bind(settlingCutoff),
  ]);
}

async function abandonExpiredActiveSessions(db, telegramId, nowMs) {
  const cutoff = new Date(nowMs - ACTIVE_SESSION_TTL_MS).toISOString();
  await db.prepare(`
    UPDATE dead_run_sessions
    SET status = 'abandoned', ended_at = CURRENT_TIMESTAMP,
        start_lat = NULL, start_lng = NULL, last_lat = NULL, last_lng = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ? AND status = 'active' AND started_at < ?
  `).bind(telegramId, cutoff).run();
}

async function handleStart(request, env, body) {
  const identity = await verifyIdentity(request, env, body);
  if (!identity.ok) return errorJson(request, identity.reason, identity.status);
  if (!boolEnv(env, 'DEAD_RUN_ENABLED', true)) return errorJson(request, 'dead_run_disabled', 503);
  if (!await ensureTables(env.DB)) return errorJson(request, 'dead_run_schema_not_applied', 503);
  const position = positionFromBody(body);
  if (!position) return errorJson(request, 'valid_gps_fix_required');
  if (position.accuracy_m > 60) return errorJson(request, 'gps_accuracy_too_low', 409, 'Move to open sky and wait for a better GPS fix.');
  const nowMs = Date.now();
  if (Math.abs(nowMs - position.timestamp_ms) > 60_000) return errorJson(request, 'gps_fix_stale', 409);

  await upsertTelegramUser(env.DB, identity);
  await abandonExpiredActiveSessions(env.DB, identity.telegramId, nowMs);
  const existing = await env.DB.prepare(`
    SELECT * FROM dead_run_sessions
    WHERE telegram_id = ? AND status = 'active'
    ORDER BY started_at DESC LIMIT 1
  `).bind(identity.telegramId).first();
  if (existing) return json(request, { ok: true, resumed: true, session: await sessionPayload(env.DB, existing, nowMs) });

  const player = await getPlayer(env.DB, identity.telegramId);
  const dailyLimit = integerEnv(env, 'DEAD_RUN_DAILY_RANKED_LIMIT', DEAD_RUN_DAILY_RANKED_LIMIT, 1, 20);
  const completedToday = await getDailyRunCount(env.DB, identity.telegramId, dayKey(nowMs));
  const ranked = boolEnv(env, 'DEAD_RUN_RANKED_ENABLED', true) && completedToday < dailyLimit;
  const seed = randomSeed();
  const sessionId = crypto.randomUUID();
  const difficulty = difficultyForPlayer(player || {});
  const heading = Number(body?.heading_deg);
  const safeHeading = Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : null;
  const event = await ensureHordeEvent(env.DB, nowMs);

  await env.DB.prepare(`
    INSERT INTO dead_run_sessions (
      session_id, telegram_id, day_key, status, ranked, seed, event_id,
      difficulty_tier, difficulty_xp_basis, difficulty_best_basis, difficulty_runs_basis,
      heading_deg, started_at, start_lat, start_lng, last_lat, last_lng,
      last_accuracy_m, last_sample_at_ms, last_client_seq, ammo, slow_inventory,
      charge_m, verified_distance_m, suspicious_points, current_wave, kills,
      crates, shove_count, slow_until_ms, max_speed_mps, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP)
  `).bind(
    sessionId,
    identity.telegramId,
    dayKey(nowMs),
    ranked ? 1 : 0,
    seed,
    event?.event_id || null,
    difficulty.tier,
    Number(player?.xp_total) || 0,
    Number(player?.best_survival_seconds) || 0,
    Number(player?.runs_total) || 0,
    safeHeading,
    isoNow(nowMs),
    position.lat,
    position.lng,
    position.lat,
    position.lng,
    position.accuracy_m,
    position.timestamp_ms,
    0,
  ).run();

  const session = await env.DB.prepare(`SELECT * FROM dead_run_sessions WHERE session_id = ? LIMIT 1`).bind(sessionId).first();
  return json(request, {
    ok: true,
    resumed: false,
    daily: { ranked_completed: completedToday, ranked_limit: dailyLimit, ranked_remaining_after_start: Math.max(0, dailyLimit - completedToday - (ranked ? 1 : 0)) },
    session: await sessionPayload(env.DB, session, nowMs),
  }, 201);
}

async function loadOwnedActiveSession(db, telegramId, sessionId) {
  if (!sessionId) return null;
  return db.prepare(`
    SELECT * FROM dead_run_sessions
    WHERE session_id = ? AND telegram_id = ? AND status = 'active'
    LIMIT 1
  `).bind(String(sessionId), telegramId).first();
}

async function handleTelemetry(request, env, body) {
  const identity = await verifyIdentity(request, env, body);
  if (!identity.ok) return errorJson(request, identity.reason, identity.status);
  if (!await ensureTables(env.DB)) return errorJson(request, 'dead_run_schema_not_applied', 503);
  const session = await loadOwnedActiveSession(env.DB, identity.telegramId, body?.session_id);
  if (!session) return errorJson(request, 'dead_run_session_not_active', 404);
  const nowMs = Date.now();
  if (nowMs - Date.parse(session.started_at) > ACTIVE_SESSION_TTL_MS) {
    await abandonExpiredActiveSessions(env.DB, identity.telegramId, nowMs);
    return errorJson(request, 'dead_run_session_expired', 410);
  }
  const telemetry = processTelemetryBatch(session, body?.samples, nowMs);
  if (!telemetry.last) return json(request, { ok: true, accepted: 0, ignored: telemetry.ignored, flags: telemetry.flags });
  const newSuspicious = Math.max(0, Number(session.suspicious_points) || 0) + telemetry.suspicious_delta;
  const ranked = Number(session.ranked) === 1 && newSuspicious < SUSPICIOUS_UNRANKED_THRESHOLD;
  const newDistance = Math.max(0, Number(session.verified_distance_m) || 0) + telemetry.distance_delta_m;
  const newCharge = Math.min(DEAD_RUN_CHARGE_METERS * 2, Math.max(0, Number(session.charge_m) || 0) + telemetry.distance_delta_m);
  await env.DB.prepare(`
    UPDATE dead_run_sessions
    SET last_lat = ?, last_lng = ?, last_accuracy_m = ?, last_sample_at_ms = ?,
        last_client_seq = ?, last_speed_mps = ?, max_speed_mps = ?,
        verified_distance_m = ?, charge_m = ?, suspicious_points = ?, ranked = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND telegram_id = ? AND status = 'active'
  `).bind(
    telemetry.last.lat,
    telemetry.last.lng,
    Number([...(body?.samples || [])].reverse().find((sample) => Number(sample?.seq) === Number(telemetry.last.seq))?.accuracy_m) || Number(session.last_accuracy_m) || 10,
    telemetry.last.timestamp_ms,
    telemetry.last.seq,
    Number(telemetry.last.speed_mps) || 0,
    telemetry.max_speed_mps,
    newDistance,
    newCharge,
    newSuspicious,
    ranked ? 1 : 0,
    session.session_id,
    identity.telegramId,
  ).run();
  return json(request, {
    ok: true,
    accepted: telemetry.accepted,
    ignored: telemetry.ignored,
    flags: telemetry.flags,
    verified_distance_m: Math.round(newDistance * 10) / 10,
    charge_m: Math.round(newCharge * 10) / 10,
    charge_ratio: Math.min(1, newCharge / DEAD_RUN_CHARGE_METERS),
    suspicious_points: newSuspicious,
    risk: riskLabel(newSuspicious),
    ranked,
  });
}

async function actionAlreadyProcessed(db, sessionId, actionId) {
  if (!actionId) return null;
  return db.prepare(`
    SELECT accepted, response_json FROM dead_run_actions
    WHERE session_id = ? AND action_id = ? LIMIT 1
  `).bind(sessionId, String(actionId)).first();
}

async function recordAction(db, session, actionId, actionType, targetId, accepted, reason, response, serverMs = Date.now()) {
  await db.prepare(`
    INSERT INTO dead_run_actions
      (session_id, action_id, telegram_id, action_type, target_id, accepted, reason, response_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, action_id) DO NOTHING
  `).bind(
    session.session_id,
    String(actionId),
    session.telegram_id,
    actionType,
    targetId || null,
    accepted ? 1 : 0,
    reason || null,
    JSON.stringify(response || {}),
    new Date(serverMs).toISOString(),
  ).run();
}

async function latestShootAt(db, sessionId) {
  const row = await db.prepare(`
    SELECT created_at AS iso_ts
    FROM dead_run_actions
    WHERE session_id = ? AND action_type = 'shoot' AND accepted = 1
    ORDER BY created_at DESC LIMIT 1
  `).bind(sessionId).first();
  if (!row?.iso_ts) return 0;
  const ts = Date.parse(row.iso_ts);
  return Number.isFinite(ts) ? ts : 0;
}

async function acceptedKillCountForWave(db, sessionId, waveIndex) {
  const prefix = `w${waveIndex}z%`;
  const row = await db.prepare(`
    SELECT COUNT(*) AS count FROM dead_run_actions
    WHERE session_id = ? AND action_type = 'shoot' AND accepted = 1 AND target_id LIKE ?
  `).bind(sessionId, prefix).first();
  return Math.max(0, Number(row?.count) || 0);
}

async function handleAction(request, env, body) {
  const identity = await verifyIdentity(request, env, body);
  if (!identity.ok) return errorJson(request, identity.reason, identity.status);
  if (!await ensureTables(env.DB)) return errorJson(request, 'dead_run_schema_not_applied', 503);
  const session = await loadOwnedActiveSession(env.DB, identity.telegramId, body?.session_id);
  if (!session) return errorJson(request, 'dead_run_session_not_active', 404);
  const actionId = String(body?.action_id || '').trim();
  const action = String(body?.action || '').trim().toLowerCase();
  const targetId = String(body?.target_id || '').trim();
  if (!/^[a-zA-Z0-9:_-]{8,100}$/.test(actionId)) return errorJson(request, 'action_id_required');
  if (!['shoot', 'pickup', 'slow', 'shove'].includes(action)) return errorJson(request, 'unsupported_dead_run_action');

  const duplicate = await actionAlreadyProcessed(env.DB, session.session_id, actionId);
  if (duplicate) {
    let response = {};
    try { response = JSON.parse(duplicate.response_json || '{}'); } catch {}
    return json(request, { ok: Number(duplicate.accepted) === 1, replayed: true, ...response }, Number(duplicate.accepted) === 1 ? 200 : 409);
  }

  const nowMs = Date.now();
  const origin = sessionOrigin(session);
  const playerPos = sessionPlayerPosition(session);
  const difficulty = sessionDifficulty(session);
  const routePlan = buildRoutePlan(origin, Number(session.seed) || 0, { heading_deg: Number(session.heading_deg) });
  const combatPlan = buildCombatPlan(origin, Number(session.seed) || 0, difficulty);
  let accepted = false;
  let reason = '';
  let update = {};
  let status = 200;

  if (action === 'pickup') {
    const pickup = pickupById(routePlan, targetId);
    if (!pickup) reason = 'pickup_unknown';
    else {
      const existing = await env.DB.prepare(`
        SELECT 1 AS hit FROM dead_run_actions
        WHERE session_id = ? AND action_type = 'pickup' AND target_id = ? AND accepted = 1 LIMIT 1
      `).bind(session.session_id, targetId).first();
      if (existing) reason = 'pickup_already_collected';
      else if (!playerPos || distanceMeters(playerPos, pickup) > DEAD_RUN_PICKUP_RADIUS_M) reason = 'pickup_too_far';
      else {
        accepted = true;
        if (pickup.type === 'ammo') {
          update.ammo = Math.min(DEAD_RUN_MAX_AMMO, Math.max(0, Number(session.ammo) || 0) + 3);
          update.crates = Math.max(0, Number(session.crates) || 0) + 1;
        } else {
          update.slow_inventory = Math.max(0, Number(session.slow_inventory) || 0) + 1;
        }
      }
    }
  } else if (action === 'slow') {
    const interactionSpeed = Math.max(0, Number(session.last_speed_mps) || 0);
    if (interactionSpeed > 1.8) reason = 'stop_to_interact';
    const inventory = Math.max(0, Number(session.slow_inventory) || 0);
    if (!reason && inventory < 1) reason = 'slow_inventory_empty';
    else if (!reason) {
      accepted = true;
      update.slow_inventory = inventory - 1;
      update.slow_until_ms = Math.max(nowMs, Number(session.slow_until_ms) || 0) + 15_000;
    }
  } else if (action === 'shove') {
    const interactionSpeed = Math.max(0, Number(session.last_speed_mps) || 0);
    if (interactionSpeed > 1.8) reason = 'stop_to_interact';
    const charge = Math.max(0, Number(session.charge_m) || 0);
    if (!reason && charge < DEAD_RUN_CHARGE_METERS) reason = 'charge_not_ready';
    else if (!reason) {
      accepted = true;
      update.charge_m = Math.max(0, charge - DEAD_RUN_CHARGE_METERS);
      update.shove_count = Math.max(0, Number(session.shove_count) || 0) + 1;
    }
  } else if (action === 'shoot') {
    const zombie = zombieById(combatPlan, targetId);
    const ammo = Math.max(0, Number(session.ammo) || 0);
    const currentWave = Math.max(0, Number(session.current_wave) || 0);
    const elapsedSinceStart = (nowMs - Date.parse(session.started_at)) / 1000;
    const hordeElapsed = elapsedSinceStart - DEAD_RUN_HEAD_START_SECONDS;
    if (!zombie) reason = 'zombie_unknown';
    else if (hordeElapsed < 0) reason = 'head_start_active';
    else if (zombie.wave !== currentWave) reason = 'zombie_wave_not_active';
    else if (ammo < 1) reason = 'ammo_empty';
    else {
      const existing = await env.DB.prepare(`
        SELECT 1 AS hit FROM dead_run_actions
        WHERE session_id = ? AND action_type = 'shoot' AND target_id = ? AND accepted = 1 LIMIT 1
      `).bind(session.session_id, targetId).first();
      if (existing) reason = 'zombie_already_killed';
      else {
        const lastShotAt = await latestShootAt(env.DB, session.session_id);
        if (lastShotAt && nowMs - lastShotAt < SHOOT_COOLDOWN_MS) reason = 'shoot_rate_limited';
        else {
          const lastSpeed = Math.max(0, Number(session.last_speed_mps) || 0);
          if (lastSpeed > 1.8) reason = 'stop_to_interact';
          else {
            const baseDistance = distanceMeters(playerPos, zombie);
            const estimatedDistance = Math.max(0, baseDistance - zombie.speed_mps * Math.max(0, hordeElapsed));
            if (estimatedDistance > DEAD_RUN_SHOOT_RANGE_M) reason = 'zombie_out_of_range';
            else {
              accepted = true;
              update.ammo = ammo - 1;
              update.kills = Math.max(0, Number(session.kills) || 0) + 1;
              const killedInWave = await acceptedKillCountForWave(env.DB, session.session_id, currentWave);
              const waveSize = combatPlan.waves[currentWave]?.zombies.length || 0;
              if (waveSize > 0 && killedInWave + 1 >= waveSize && currentWave + 1 < combatPlan.waves.length) {
                update.current_wave = currentWave + 1;
              }
            }
          }
        }
      }
    }
  }

  if (!accepted) {
    status = 409;
    const response = { action, target_id: targetId || null, reason };
    await recordAction(env.DB, session, actionId, action, targetId, false, reason, response, nowMs);
    return json(request, { ok: false, ...response }, status);
  }

  const next = {
    ammo: update.ammo ?? (Number(session.ammo) || 0),
    slow_inventory: update.slow_inventory ?? (Number(session.slow_inventory) || 0),
    slow_until_ms: update.slow_until_ms ?? (Number(session.slow_until_ms) || 0),
    charge_m: update.charge_m ?? (Number(session.charge_m) || 0),
    kills: update.kills ?? (Number(session.kills) || 0),
    crates: update.crates ?? (Number(session.crates) || 0),
    shove_count: update.shove_count ?? (Number(session.shove_count) || 0),
    current_wave: update.current_wave ?? (Number(session.current_wave) || 0),
  };
  const cas = await env.DB.prepare(`
    UPDATE dead_run_sessions
    SET ammo = ?, slow_inventory = ?, slow_until_ms = ?, charge_m = ?, kills = ?,
        crates = ?, shove_count = ?, current_wave = ?, updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND telegram_id = ? AND status = 'active'
      AND ammo = ? AND kills = ? AND slow_inventory = ? AND shove_count = ?
  `).bind(
    next.ammo,
    next.slow_inventory,
    next.slow_until_ms,
    next.charge_m,
    next.kills,
    next.crates,
    next.shove_count,
    next.current_wave,
    session.session_id,
    identity.telegramId,
    Number(session.ammo) || 0,
    Number(session.kills) || 0,
    Number(session.slow_inventory) || 0,
    Number(session.shove_count) || 0,
  ).run();
  if (Math.max(0, Number(cas?.meta?.changes) || 0) < 1) {
    const concurrent = await actionAlreadyProcessed(env.DB, session.session_id, actionId);
    if (concurrent) {
      let concurrentResponse = {};
      try { concurrentResponse = JSON.parse(concurrent.response_json || '{}'); } catch {}
      return json(request, { ok: Number(concurrent.accepted) === 1, replayed: true, ...concurrentResponse },
        Number(concurrent.accepted) === 1 ? 200 : 409);
    }
    return errorJson(request, 'dead_run_action_conflict', 409);
  }
  const response = {
    action,
    target_id: targetId || null,
    state: {
      ammo: next.ammo,
      slow_inventory: next.slow_inventory,
      slow_until_ms: next.slow_until_ms,
      charge_m: next.charge_m,
      charge_ratio: Math.min(1, next.charge_m / DEAD_RUN_CHARGE_METERS),
      kills: next.kills,
      crates: next.crates,
      shove_count: next.shove_count,
      current_wave: next.current_wave,
    },
  };
  await recordAction(env.DB, session, actionId, action, targetId, true, null, response, nowMs);
  return json(request, { ok: true, ...response });
}

function previousUtcDay(key) {
  const ms = Date.parse(`${key}T00:00:00Z`);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms - 86400000).toISOString().slice(0, 10);
}

async function creditArcadeXp(db, telegramId, session, score, xpAwarded, eventMultiplier) {
  if (xpAwarded <= 0) return 0;
  const eventId = `dead_run:${session.session_id}`;
  const insert = await db.prepare(`
    INSERT OR IGNORE INTO arcade_progression_events
      (id, telegram_id, client_run_id, game, raw_score, local_meta_points, normalized_points, xp_awarded, status, reason, processed_at)
    VALUES (?, ?, ?, 'dead-run', ?, 0, ?, ?, 'accepted', ?, CURRENT_TIMESTAMP)
  `).bind(
    eventId,
    telegramId,
    session.session_id,
    score,
    score,
    xpAwarded,
    eventMultiplier > 1 ? 'verified_gps_horde_event' : 'verified_gps_run',
  ).run();
  const inserted = Math.max(0, Number(insert?.meta?.changes) || 0) > 0;
  if (!inserted) return 0;
  const key = dayKey();
  await db.batch([
    db.prepare(`
      INSERT INTO arcade_progression_state
        (telegram_id, arcade_xp_total, arcade_daily_xp, arcade_daily_key, arcade_restriction_level, restricted_until, updated_at)
      VALUES (?, ?, ?, ?, 0, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_id) DO UPDATE SET
        arcade_xp_total = arcade_progression_state.arcade_xp_total + excluded.arcade_xp_total,
        arcade_daily_xp = CASE
          WHEN arcade_progression_state.arcade_daily_key = excluded.arcade_daily_key
            THEN arcade_progression_state.arcade_daily_xp + excluded.arcade_daily_xp
          ELSE excluded.arcade_daily_xp
        END,
        arcade_daily_key = excluded.arcade_daily_key,
        updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, xpAwarded, xpAwarded, key),
    db.prepare(`
      INSERT INTO arcade_xp_wallets
        (telegram_id, arcade_xp_earned, arcade_xp_spendable, arcade_xp_spent, updated_at)
      VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_id) DO UPDATE SET
        arcade_xp_earned = arcade_xp_wallets.arcade_xp_earned + excluded.arcade_xp_earned,
        arcade_xp_spendable = arcade_xp_wallets.arcade_xp_spendable + excluded.arcade_xp_spendable,
        updated_at = CURRENT_TIMESTAMP
    `).bind(telegramId, xpAwarded, xpAwarded),
    db.prepare(`
      INSERT INTO telegram_activity_log (telegram_id, action, metadata, created_at)
      VALUES (?, 'dead_run_finish', ?, CURRENT_TIMESTAMP)
    `).bind(telegramId, JSON.stringify({ session_id: session.session_id, score, xp_awarded: xpAwarded })),
  ]);
  return xpAwarded;
}

async function applyHordeContribution(db, session, kills) {
  if (!session.event_id || kills <= 0) return null;
  const insert = await db.prepare(`
    INSERT OR IGNORE INTO dead_run_horde_contributions
      (event_id, session_id, telegram_id, kills, distance_m, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    session.event_id,
    session.session_id,
    session.telegram_id,
    kills,
    Math.max(0, Number(session.verified_distance_m) || 0),
  ).run();
  if (Math.max(0, Number(insert?.meta?.changes) || 0) < 1) return null;
  await db.prepare(`
    UPDATE dead_run_horde_events
    SET kills_total = kills_total + ?,
        participants = participants + 1,
        status = CASE WHEN kills_total + ? >= target_kills THEN 'cleared' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
    WHERE event_id = ?
  `).bind(kills, kills, session.event_id).run();
  return db.prepare(`SELECT * FROM dead_run_horde_events WHERE event_id = ? LIMIT 1`).bind(session.event_id).first();
}

const TELEMETRY_GRACE_SECONDS = 60;

async function handleFinish(request, env, body) {
  const identity = await verifyIdentity(request, env, body);
  if (!identity.ok) return errorJson(request, identity.reason, identity.status);
  if (!await ensureTables(env.DB)) return errorJson(request, 'dead_run_schema_not_applied', 503);
  const sessionId = String(body?.session_id || '').trim();
  let session = await env.DB.prepare(`
    SELECT * FROM dead_run_sessions WHERE session_id = ? AND telegram_id = ? LIMIT 1
  `).bind(sessionId, identity.telegramId).first();
  if (!session) return errorJson(request, 'dead_run_session_not_found', 404);
  if (session.status === 'finished') {
    const player = await getPlayer(env.DB, identity.telegramId);
    return json(request, {
      ok: true,
      replayed: true,
      result: {
        score: Number(session.score) || 0,
        xp_awarded: Number(session.xp_awarded) || 0,
        survival_seconds: Number(session.survival_seconds) || 0,
        verified_distance_m: Number(session.verified_distance_m) || 0,
        ranked: Number(session.ranked) === 1,
        risk: riskLabel(session.suspicious_points),
      },
      player,
    });
  }

  const nowMs = Date.now();

  if (session.status === 'active') {
    const startMs = Date.parse(session.started_at);
    const lastSampleMs = Number(session.last_sample_at_ms) || 0;
    const elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    // Cap survival at the time of the last accepted telemetry sample plus a grace window so
    // a client cannot earn ranked survival time by going offline after the minimum movement.
    const telemetryBoundSeconds = lastSampleMs > startMs
      ? Math.floor((lastSampleMs - startMs) / 1000) + TELEMETRY_GRACE_SECONDS
      : TELEMETRY_GRACE_SECONDS;
    const survivalSeconds = Math.max(0, Math.min(
      DEAD_RUN_MAX_SESSION_SECONDS,
      elapsed - DEAD_RUN_HEAD_START_SECONDS,
      telemetryBoundSeconds - DEAD_RUN_HEAD_START_SECONDS,
    ));
    const suspicious = Math.max(0, Number(session.suspicious_points) || 0);
    const verifiedDistance = Math.max(0, Number(session.verified_distance_m) || 0);
    const kills = Math.max(0, Number(session.kills) || 0);
    const crates = Math.max(0, Number(session.crates) || 0);
    const shoveCount = Math.max(0, Number(session.shove_count) || 0);
    const difficulty = sessionDifficulty(session);
    const scored = scoreRun({
      verified_distance_m: verifiedDistance,
      survival_seconds: survivalSeconds,
      kills,
      crates,
      shove_count: shoveCount,
    }, difficulty);
    const horde = session.event_id
      ? await env.DB.prepare(`SELECT * FROM dead_run_horde_events WHERE event_id = ? LIMIT 1`).bind(session.event_id).first().catch(() => null)
      : null;
    const eventActive = horde && nowMs <= Date.parse(horde.ends_at);
    const eventMultiplier = eventActive ? 1.1 : 1;
    const stillRanked = Number(session.ranked) === 1
      && suspicious < SUSPICIOUS_UNRANKED_THRESHOLD
      && verifiedDistance >= 40
      && survivalSeconds >= 20;
    const rejected = suspicious >= SUSPICIOUS_REJECT_THRESHOLD;
    const xpAwarded = stillRanked && !rejected ? Math.min(275, Math.floor(scored.xp * eventMultiplier)) : 0;
    const score = stillRanked && !rejected ? scored.score : 0;
    const finishReason = String(body?.reason || 'ended').slice(0, 40);

    const claim = await env.DB.prepare(`
      UPDATE dead_run_sessions
      SET status = 'settling', survival_seconds = ?, score = ?, xp_awarded = ?,
          finish_reason = ?, ranked = ?, ended_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND telegram_id = ? AND status = 'active'
    `).bind(
      survivalSeconds,
      score,
      xpAwarded,
      finishReason,
      stillRanked && !rejected ? 1 : 0,
      isoNow(nowMs),
      session.session_id,
      identity.telegramId,
    ).run();
    if (Math.max(0, Number(claim?.meta?.changes) || 0) < 1) return errorJson(request, 'dead_run_finish_race', 409);
    // Re-read so recovery path uses the authoritative stored values.
    session = await env.DB.prepare(`SELECT * FROM dead_run_sessions WHERE session_id = ? LIMIT 1`).bind(session.session_id).first() || session;
  }

  if (session.status !== 'settling') return errorJson(request, 'dead_run_session_not_finishable', 409);

  // Recovery path: session is 'settling'. All settlement values are read from the stored row so
  // retrying this endpoint is safe. The settling→finished transition is the idempotency gate for
  // the player aggregate update: only the request that owns the transition runs the player write.
  const survivalSeconds = Math.max(0, Number(session.survival_seconds) || 0);
  const score = Math.max(0, Number(session.score) || 0);
  const xpAwarded = Math.max(0, Number(session.xp_awarded) || 0);
  const stillRanked = Number(session.ranked) === 1;
  const suspicious = Math.max(0, Number(session.suspicious_points) || 0);
  const rejected = suspicious >= SUSPICIOUS_REJECT_THRESHOLD;
  const verifiedDistance = Math.max(0, Number(session.verified_distance_m) || 0);
  const kills = Math.max(0, Number(session.kills) || 0);
  const crates = Math.max(0, Number(session.crates) || 0);
  const shoveCount = Math.max(0, Number(session.shove_count) || 0);
  const key = session.day_key || dayKey(nowMs);
  const horde = session.event_id
    ? await env.DB.prepare(`SELECT * FROM dead_run_horde_events WHERE event_id = ? LIMIT 1`).bind(session.event_id).first().catch(() => null)
    : null;
  const eventActive = horde && nowMs <= Date.parse(horde.ends_at);
  const eventMultiplier = eventActive ? 1.1 : 1;

  // Atomic transition: settling → finished + coordinate scrub.
  // Returns 1 change when this request owns the transition; returns 0 if a concurrent retry
  // already completed it. Player aggregates are updated only by the owning request.
  const transition = await env.DB.prepare(`
    UPDATE dead_run_sessions
    SET status = 'finished',
        start_lat = NULL, start_lng = NULL, last_lat = NULL, last_lng = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND telegram_id = ? AND status = 'settling'
  `).bind(session.session_id, identity.telegramId).run();
  const justTransitioned = Math.max(0, Number(transition?.meta?.changes) || 0) > 0;

  if (justTransitioned) {
    const playerBefore = await getPlayer(env.DB, identity.telegramId);
    const previousDay = previousUtcDay(key);
    const previousLastDay = String(playerBefore?.last_run_day || '');
    const streak = previousLastDay === key
      ? Math.max(1, Number(playerBefore?.current_streak) || 1)
      : previousLastDay === previousDay
        ? Math.max(1, Number(playerBefore?.current_streak) || 0) + 1
        : 1;
    const bestStreak = Math.max(streak, Number(playerBefore?.best_streak) || 0);
    await env.DB.prepare(`
      UPDATE dead_run_players
      SET xp_total = xp_total + ?,
          runs_total = runs_total + 1,
          ranked_runs_total = ranked_runs_total + ?,
          best_survival_seconds = MAX(best_survival_seconds, ?),
          best_distance_m = MAX(best_distance_m, ?),
          best_score = MAX(best_score, ?),
          kills_total = kills_total + ?,
          crates_total = crates_total + ?,
          horde_events_total = horde_events_total + ?,
          current_streak = ?, best_streak = ?, last_run_day = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(
      xpAwarded,
      stillRanked && !rejected ? 1 : 0,
      survivalSeconds,
      Math.round(verifiedDistance),
      score,
      kills,
      crates,
      eventActive ? 1 : 0,
      streak,
      bestStreak,
      key,
      identity.telegramId,
    ).run();
  }

  // creditArcadeXp and applyHordeContribution both use INSERT OR IGNORE so they are safe to
  // call on retry — the second call is a no-op.
  const credited = await creditArcadeXp(env.DB, identity.telegramId, session, score, xpAwarded, eventMultiplier);
  // Only ranked non-rejected runs may contribute to global horde totals.
  const hordeAfter = (stillRanked && !rejected)
    ? await applyHordeContribution(env.DB, session, kills)
    : null;

  const player = await getPlayer(env.DB, identity.telegramId);
  return json(request, {
    ok: true,
    result: {
      score,
      xp_awarded: credited || xpAwarded,
      survival_seconds: survivalSeconds,
      verified_distance_m: Math.round(verifiedDistance * 10) / 10,
      kills,
      crates,
      shove_count: shoveCount,
      ranked: stillRanked && !rejected,
      risk: riskLabel(suspicious),
      suspicious_points: suspicious,
      horde: publicHorde(hordeAfter || horde, nowMs),
    },
    player,
  });
}

async function handleResume(request, env, body) {
  const identity = await verifyIdentity(request, env, body);
  if (!identity.ok) return errorJson(request, identity.reason, identity.status);
  if (!await ensureTables(env.DB)) return errorJson(request, 'dead_run_schema_not_applied', 503);
  const session = await loadOwnedActiveSession(env.DB, identity.telegramId, body?.session_id);
  if (!session) return errorJson(request, 'dead_run_session_not_active', 404);
  return json(request, { ok: true, session: await sessionPayload(env.DB, session) });
}

function leaderboardMetric(metric) {
  if (metric === 'survival') return { column: 'survival_seconds', label: 'survival_seconds' };
  if (metric === 'distance') return { column: 'verified_distance_m', label: 'verified_distance_m' };
  return { column: 'score', label: 'score' };
}

async function handleLeaderboard(request, env, url) {
  if (!await ensureTables(env.DB)) return errorJson(request, 'dead_run_schema_not_applied', 503);
  const metricName = String(url.searchParams.get('metric') || 'score').toLowerCase();
  const metric = leaderboardMetric(metricName);
  const period = String(url.searchParams.get('period') || 'daily').toLowerCase() === 'all' ? 'all' : 'daily';
  const limit = Math.max(5, Math.min(100, Math.floor(Number(url.searchParams.get('limit')) || 25)));
  const where = period === 'daily' ? "AND s.day_key = ?" : '';
  const binds = period === 'daily' ? [dayKey(), limit] : [limit];
  const result = await env.DB.prepare(`
    SELECT p.display_name, s.score, s.survival_seconds, s.verified_distance_m,
           s.kills, s.difficulty_tier, s.ended_at
    FROM dead_run_sessions s
    JOIN dead_run_players p ON p.telegram_id = s.telegram_id
    WHERE s.status = 'finished' AND s.ranked = 1 ${where}
    ORDER BY s.${metric.column} DESC, s.ended_at ASC
    LIMIT ?
  `).bind(...binds).all();
  const rows = (result.results || []).map((row, index) => ({
    rank: index + 1,
    display_name: row.display_name || 'Runner',
    score: Number(row.score) || 0,
    survival_seconds: Number(row.survival_seconds) || 0,
    verified_distance_m: Math.round(Number(row.verified_distance_m) || 0),
    kills: Number(row.kills) || 0,
    difficulty_tier: Number(row.difficulty_tier) || 1,
    ended_at: row.ended_at,
  }));
  return json(request, { ok: true, period, metric: metric.label, day_key: period === 'daily' ? dayKey() : null, rows });
}

async function handleHordeCurrent(request, env) {
  if (!await ensureTables(env.DB)) return errorJson(request, 'dead_run_schema_not_applied', 503);
  const nowMs = Date.now();
  const event = await ensureHordeEvent(env.DB, nowMs);
  const contributors = await env.DB.prepare(`
    SELECT p.display_name, SUM(c.kills) AS kills, COUNT(DISTINCT c.session_id) AS runs
    FROM dead_run_horde_contributions c
    JOIN dead_run_players p ON p.telegram_id = c.telegram_id
    WHERE c.event_id = ?
    GROUP BY c.telegram_id, p.display_name
    ORDER BY kills DESC, runs ASC
    LIMIT 10
  `).bind(event.event_id).all().catch(() => ({ results: [] }));
  return json(request, {
    ok: true,
    horde: publicHorde(event, nowMs),
    top_contributors: (contributors.results || []).map((row, index) => ({
      rank: index + 1,
      display_name: row.display_name || 'Runner',
      kills: Number(row.kills) || 0,
      runs: Number(row.runs) || 0,
    })),
  });
}

export async function handleDeadRunRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(DEAD_RUN_ROUTE_PREFIX)) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const rateLimited = enforceDeadRunRateLimit(request, url.pathname);
  if (rateLimited) return rateLimited;
  if (!env?.DB) return errorJson(request, 'dead_run_database_not_configured', 503);

  // Run global coordinate/expiry cleanup on ~1% of requests so precise GPS data is
  // scrubbed for users who never return, regardless of which Telegram ID started the session.
  if (Math.random() < 0.01) {
    cleanupExpiredSessions(env.DB, Date.now()).catch(() => {});
  }

  try {
    if (url.pathname === `${DEAD_RUN_ROUTE_PREFIX}/leaderboard` && request.method === 'GET') {
      return handleLeaderboard(request, env, url);
    }
    if (url.pathname === `${DEAD_RUN_ROUTE_PREFIX}/horde/current` && request.method === 'GET') {
      return handleHordeCurrent(request, env);
    }
    if (request.method !== 'POST') return errorJson(request, 'method_not_allowed', 405);
    const body = await readJson(request);
    if (!body) return errorJson(request, 'invalid_json');
    if (url.pathname === `${DEAD_RUN_ROUTE_PREFIX}/profile`) return handleProfile(request, env, body);
    if (url.pathname === `${DEAD_RUN_ROUTE_PREFIX}/session/start`) return handleStart(request, env, body);
    if (url.pathname === `${DEAD_RUN_ROUTE_PREFIX}/session/resume`) return handleResume(request, env, body);
    if (url.pathname === `${DEAD_RUN_ROUTE_PREFIX}/session/telemetry`) return handleTelemetry(request, env, body);
    if (url.pathname === `${DEAD_RUN_ROUTE_PREFIX}/session/action`) return handleAction(request, env, body);
    if (url.pathname === `${DEAD_RUN_ROUTE_PREFIX}/session/finish`) return handleFinish(request, env, body);
    return errorJson(request, 'dead_run_route_not_found', 404);
  } catch (error) {
    console.log('[dead-run]', JSON.stringify({
      event: 'dead_run_request_failed',
      path: url.pathname,
      message: error?.message || String(error),
      timestamp: new Date().toISOString(),
    }));
    return errorJson(request, 'dead_run_internal_error', 500);
  }
}

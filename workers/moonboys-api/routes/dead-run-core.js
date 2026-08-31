export const DEAD_RUN_HEAD_START_SECONDS = 60;
export const DEAD_RUN_DAILY_RANKED_LIMIT = 5;
export const DEAD_RUN_MAX_SESSION_SECONDS = 2 * 60 * 60;
export const DEAD_RUN_CHARGE_METERS = 300;
export const DEAD_RUN_MAX_AMMO = 6;
export const DEAD_RUN_PICKUP_RADIUS_M = 28;
export const DEAD_RUN_SHOOT_RANGE_M = 160;
export const DEAD_RUN_MAX_ACCEPTED_SPEED_MPS = 7.5;
export const DEAD_RUN_HARD_SPEED_MPS = 11;

const EARTH_RADIUS_M = 6371000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRad(value) { return Number(value) * Math.PI / 180; }
function toDeg(value) { return Number(value) * 180 / Math.PI; }

export function distanceMeters(left, right) {
  if (!left || !right) return Infinity;
  const lat1 = Number(left.lat);
  const lng1 = Number(left.lng);
  const lat2 = Number(right.lat);
  const lng2 = Number(right.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function movePoint(origin, bearingDeg, meters) {
  const lat1 = toRad(Number(origin.lat));
  const lon1 = toRad(Number(origin.lng));
  const bearing = toRad(Number(bearingDeg));
  const angularDistance = Number(meters) / EARTH_RADIUS_M;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: toDeg(lat2), lng: toDeg(lon2) };
}

export function bearingBetween(left, right) {
  const y = Math.sin(toRad(right.lng - left.lng)) * Math.cos(toRad(right.lat));
  const x = Math.cos(toRad(left.lat)) * Math.sin(toRad(right.lat))
    - Math.sin(toRad(left.lat)) * Math.cos(toRad(right.lat)) * Math.cos(toRad(right.lng - left.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function mulberry32(seed) {
  let value = Number(seed) >>> 0;
  return function random() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seededPoint(origin, random, minM, maxM, bearingBase = null, bearingSpread = 360) {
  const distance = minM + random() * (maxM - minM);
  const bearing = bearingBase == null
    ? random() * 360
    : (bearingBase + (random() - 0.5) * bearingSpread + 360) % 360;
  return movePoint(origin, bearing, distance);
}

export function difficultyForPlayer(player = {}) {
  const xp = Math.max(0, Number(player.xp_total) || 0);
  const best = Math.max(0, Number(player.best_survival_seconds) || 0);
  const runs = Math.max(0, Number(player.runs_total) || 0);
  const rating = xp / 450 + best / 180 + runs / 12;
  const tier = rating >= 14 ? 5 : rating >= 9 ? 4 : rating >= 5 ? 3 : rating >= 2 ? 2 : 1;
  const configs = {
    1: { tier: 1, base_speed_mps: 1.45, max_speed_mps: 2.15, spawn_count: 6, wave_speed_step: 0.08, wave_count: 6 },
    2: { tier: 2, base_speed_mps: 1.58, max_speed_mps: 2.35, spawn_count: 7, wave_speed_step: 0.09, wave_count: 6 },
    3: { tier: 3, base_speed_mps: 1.72, max_speed_mps: 2.55, spawn_count: 8, wave_speed_step: 0.10, wave_count: 7 },
    4: { tier: 4, base_speed_mps: 1.88, max_speed_mps: 2.80, spawn_count: 9, wave_speed_step: 0.11, wave_count: 7 },
    5: { tier: 5, base_speed_mps: 2.02, max_speed_mps: 3.00, spawn_count: 10, wave_speed_step: 0.12, wave_count: 8 },
  };
  return configs[tier];
}

export function buildRoutePlan(origin, seed, options = {}) {
  const random = mulberry32(seed ^ 0xA5A55A5A);
  const waypointCount = clamp(Math.floor(Number(options.waypoint_count) || 6), 4, 10);
  const initialBearing = Number.isFinite(Number(options.heading_deg))
    ? (Number(options.heading_deg) + 360) % 360
    : random() * 360;
  const waypoints = [];
  let cursor = { lat: Number(origin.lat), lng: Number(origin.lng) };
  let bearing = initialBearing;

  for (let index = 0; index < waypointCount; index += 1) {
    const legMeters = 90 + random() * 90;
    const turn = index === waypointCount - 1
      ? ((bearingBetween(cursor, origin) - bearing + 540) % 360) - 180
      : (random() - 0.5) * 70;
    bearing = (bearing + clamp(turn, -65, 65) + 360) % 360;
    cursor = movePoint(cursor, bearing, legMeters);
    if (distanceMeters(origin, cursor) > 520) {
      bearing = bearingBetween(cursor, origin);
      cursor = movePoint(cursor, bearing, legMeters * 0.75);
    }
    waypoints.push({ id: `wp${index + 1}`, lat: cursor.lat, lng: cursor.lng });
  }

  const pickups = [];
  for (let index = 0; index < waypoints.length; index += 1) {
    const point = waypoints[index];
    pickups.push({
      id: `p${index + 1}`,
      type: index % 3 === 2 ? 'slow' : 'ammo',
      lat: point.lat,
      lng: point.lng,
    });
  }
  return {
    safety_mode: 'advisory-pedestrian-corridor',
    warning: 'Waypoints never override real-world conditions. Stay on legal pedestrian routes and skip any unsafe point.',
    waypoints,
    pickups,
  };
}

export function buildCombatPlan(origin, seed, difficulty) {
  const config = difficulty || difficultyForPlayer();
  const random = mulberry32(seed ^ 0x1F2E3D4C);
  const waves = [];
  for (let waveIndex = 0; waveIndex < config.wave_count; waveIndex += 1) {
    const count = config.spawn_count + Math.floor(waveIndex / 2);
    const zombies = [];
    for (let zombieIndex = 0; zombieIndex < count; zombieIndex += 1) {
      const spawn = seededPoint(origin, random, 220 + waveIndex * 8, 420 + waveIndex * 14);
      const speed = Math.min(
        config.max_speed_mps,
        config.base_speed_mps + waveIndex * config.wave_speed_step + (random() - 0.5) * 0.22,
      );
      zombies.push({
        id: `w${waveIndex}z${zombieIndex}`,
        wave: waveIndex,
        lat: spawn.lat,
        lng: spawn.lng,
        speed_mps: Math.max(1.1, Number(speed.toFixed(3))),
      });
    }
    waves.push({ index: waveIndex, zombies });
  }
  return { waves };
}

export function zombieById(plan, targetId) {
  for (const wave of plan?.waves || []) {
    const zombie = wave.zombies.find((entry) => entry.id === targetId);
    if (zombie) return zombie;
  }
  return null;
}

export function pickupById(routePlan, targetId) {
  return (routePlan?.pickups || []).find((entry) => entry.id === targetId) || null;
}

function samplePosition(sample) {
  return { lat: Number(sample.lat), lng: Number(sample.lng) };
}

function validCoordinateSample(sample) {
  const lat = Number(sample?.lat);
  const lng = Number(sample?.lng);
  const accuracy = Number(sample?.accuracy_m);
  const timestamp = Number(sample?.timestamp_ms);
  const seq = Number(sample?.seq);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180
    && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 150
    && Number.isSafeInteger(Math.floor(timestamp))
    && Number.isSafeInteger(Math.floor(seq)) && seq >= 0;
}

export function processTelemetryBatch(session, samples, nowMs = Date.now()) {
  const input = Array.isArray(samples) ? samples.slice(0, 24) : [];
  let previous = session?.last_lat == null || session?.last_lng == null
    ? null
    : {
      lat: Number(session.last_lat),
      lng: Number(session.last_lng),
      timestamp_ms: Number(session.last_sample_at_ms) || 0,
      seq: Number(session.last_client_seq) || -1,
      speed_mps: Number(session.last_speed_mps) || 0,
    };
  let distanceDelta = 0;
  let suspiciousDelta = 0;
  let accepted = 0;
  let ignored = 0;
  let maxSpeed = Math.max(0, Number(session?.max_speed_mps) || 0);
  const flags = [];

  for (const sample of input) {
    if (!validCoordinateSample(sample)) {
      suspiciousDelta += 1;
      ignored += 1;
      flags.push('invalid_sample');
      continue;
    }
    const timestamp = Math.floor(Number(sample.timestamp_ms));
    const seq = Math.floor(Number(sample.seq));
    const accuracy = Number(sample.accuracy_m);
    if (timestamp > nowMs + 15_000 || timestamp < nowMs - 180_000) {
      suspiciousDelta += 1;
      ignored += 1;
      flags.push('clock_skew');
      continue;
    }
    if (previous && (seq <= previous.seq || timestamp <= previous.timestamp_ms)) {
      suspiciousDelta += 1;
      ignored += 1;
      flags.push('non_monotonic');
      continue;
    }
    if (accuracy > 75) {
      suspiciousDelta += 1;
      ignored += 1;
      flags.push('poor_accuracy');
      continue;
    }
    if (accuracy > 45) suspiciousDelta += 0.25;

    const current = { ...samplePosition(sample), timestamp_ms: timestamp, seq };
    let speed = 0;
    if (previous) {
      const elapsedSeconds = Math.max(0.001, (timestamp - previous.timestamp_ms) / 1000);
      const segment = distanceMeters(previous, current);
      speed = segment / elapsedSeconds;
      maxSpeed = Math.max(maxSpeed, speed);
      if (elapsedSeconds < 0.55) {
        ignored += 1;
        continue;
      }
      if (segment > 75 || speed > DEAD_RUN_HARD_SPEED_MPS) {
        suspiciousDelta += 2;
        ignored += 1;
        flags.push('impossible_speed');
        continue;
      }
      if (speed > DEAD_RUN_MAX_ACCEPTED_SPEED_MPS) {
        suspiciousDelta += 1;
        ignored += 1;
        flags.push('speed_spike');
        continue;
      }
      const previousSpeed = Math.max(0, Number(previous.speed_mps) || 0);
      const acceleration = Math.abs(speed - previousSpeed) / elapsedSeconds;
      if (acceleration > 6.5 && segment > 8) {
        suspiciousDelta += 0.5;
        flags.push('acceleration_spike');
      }
      if (segment >= 0.8) distanceDelta += segment;
    }
    accepted += 1;
    previous = { ...current, speed_mps: speed };
  }

  return {
    accepted,
    ignored,
    distance_delta_m: Number(distanceDelta.toFixed(3)),
    suspicious_delta: Number(suspiciousDelta.toFixed(2)),
    max_speed_mps: Number(maxSpeed.toFixed(3)),
    last: previous,
    flags: [...new Set(flags)],
  };
}

export function scoreRun(summary = {}, difficulty = {}) {
  const distance = clamp(Number(summary.verified_distance_m) || 0, 0, 50_000);
  const survival = clamp(Number(summary.survival_seconds) || 0, 0, DEAD_RUN_MAX_SESSION_SECONDS);
  const kills = clamp(Number(summary.kills) || 0, 0, 5000);
  const crates = clamp(Number(summary.crates) || 0, 0, 500);
  const shoves = clamp(Number(summary.shove_count) || 0, 0, 100);
  const tier = clamp(Number(difficulty.tier) || 1, 1, 5);
  const multiplier = 1 + (tier - 1) * 0.08;
  const score = Math.floor((distance * 1.8 + survival * 5 + kills * 65 + crates * 25 + shoves * 35) * multiplier);
  const xp = Math.min(250, Math.floor(
    distance / 20 + survival / 7 + kills * 7 + crates * 3 + shoves * 2,
  ));
  return { score: Math.max(0, score), xp: Math.max(0, xp) };
}

export function hordeEventDescriptor(nowMs = Date.now()) {
  const date = new Date(nowMs);
  const hour = date.getUTCHours();
  const bucketHour = Math.floor(hour / 6) * 6;
  const start = Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), bucketHour, 0, 0, 0,
  );
  const end = start + 6 * 60 * 60 * 1000;
  const day = new Date(start).toISOString().slice(0, 10);
  return {
    event_id: `horde:${day}:${String(bucketHour).padStart(2, '0')}`,
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
    target_kills: 750,
    xp_multiplier: 1.1,
  };
}

export function displayName(user = {}) {
  const username = String(user.username || '').replace(/^@/, '').trim();
  if (username) return `@${username.slice(0, 32)}`;
  const first = String(user.first_name || '').trim();
  return first ? first.slice(0, 32) : 'Runner';
}

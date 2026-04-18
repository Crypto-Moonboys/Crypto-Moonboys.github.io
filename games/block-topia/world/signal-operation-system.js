const MAX_ACTIVE_OPERATIONS = 3;

function hashSeed(text) {
  const raw = String(text || '');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveDistrictId(state, signal) {
  const allDistricts = state.districtState || [];
  if (!allDistricts.length) return state.player.districtId || 'neon-slums';

  const tags = Array.isArray(signal?.tags) ? signal.tags.map((tag) => String(tag || '').toLowerCase()) : [];
  const tagMatch = allDistricts.find((district) => tags.includes(String(district.id || '').toLowerCase()));
  if (tagMatch?.id) return tagMatch.id;

  const laneDistrict = allDistricts.find((district) => tags.includes(String(district.name || '').toLowerCase()));
  if (laneDistrict?.id) return laneDistrict.id;

  const seed = hashSeed(signal?.id || signal?.questPulse || signal?.worldFeed);
  return allDistricts[seed % allDistricts.length]?.id || state.player.districtId || 'neon-slums';
}

function resolveSignalTitle(signal) {
  const lane = String(signal?.lane || 'world');
  if (lane === 'world') return 'Investigate Instability';
  if (lane === 'ops') return 'Intercept and Secure';
  if (lane === 'clue') return 'Locate Hidden Relay';
  if (lane === 'quest') return 'Mission Pulse';
  return 'Signal Operation';
}

function resolveSignalObjective(signal, districtName) {
  const pulse = String(signal?.questPulse || '').trim();
  if (pulse) return pulse;
  const lane = String(signal?.lane || 'world');
  if (lane === 'world') return `Trace instability pressure in ${districtName} and stabilise the zone`;
  if (lane === 'ops') return `Intercept courier route traffic in ${districtName} and secure relay flow`;
  if (lane === 'clue') return `Find the hidden relay path in ${districtName} and decode glyph residue`;
  return `Follow mission pulse into ${districtName} and complete the active signal route`;
}

function findOperationPosition(state, district, seed) {
  const mapWidth = state.map.width;
  const mapHeight = state.map.height;
  const grid = district?.grid || { col: 0, row: 0, w: mapWidth, h: mapHeight };
  const xOffset = (seed % Math.max(grid.w, 1));
  const yOffset = (Math.floor(seed / 7) % Math.max(grid.h, 1));
  const x = clamp(grid.col + xOffset, 0, mapWidth - 1);
  const y = clamp(grid.row + yOffset, 0, mapHeight - 1);
  return { x, y };
}

export function createSignalOperationSystem(state, liveIntelligence) {
  state.signalOperations = state.signalOperations || { active: [], lastSyncAt: 0 };
  const resolvedSignals = new Map();

  function getActiveOperations() {
    const now = Date.now();
    state.signalOperations.active = (state.signalOperations.active || []).filter((operation) => {
      if (!operation || operation.resolved) return false;
      const expiresAtMs = Date.parse(operation.expiresAt || '');
      return !Number.isFinite(expiresAtMs) || expiresAtMs > now;
    });
    return state.signalOperations.active;
  }

  function syncFromSignals({ force = false } = {}) {
    const now = Date.now();
    for (const [signalId, expiresAtMs] of resolvedSignals) {
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
        resolvedSignals.delete(signalId);
      }
    }
    const beforeIds = new Set(getActiveOperations().map((operation) => operation.id));
    const activeSignals = (liveIntelligence?.getActiveSignals?.() || [])
      .filter((signal) => ['world', 'ops', 'clue', 'quest'].includes(signal?.lane))
      .sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));

    const signalById = new Map(activeSignals.map((signal) => [signal.id, signal]));
    state.signalOperations.active = getActiveOperations().filter((operation) => signalById.has(operation.signalId));

    const existingBySignalId = new Set(state.signalOperations.active.map((operation) => operation.signalId));
    const next = [...state.signalOperations.active];

    for (const signal of activeSignals) {
      if (next.length >= MAX_ACTIVE_OPERATIONS) break;
      if (existingBySignalId.has(signal.id)) continue;
      if (resolvedSignals.has(signal.id)) continue;

      const districtId = resolveDistrictId(state, signal);
      const district = state.districts.byId.get(districtId) || state.districts.byId.get(state.player.districtId);
      const seed = hashSeed(`${signal.id}:${districtId}`);
      const { x, y } = findOperationPosition(state, district, seed);
      const priority = clamp(Number(signal.priority || 3), 1, 5);
      const radius = clamp(1.25 + priority * 0.28, 1.2, 2.9);
      const intensity = clamp(0.45 + priority * 0.12, 0.55, 1.15);
      const expiresAtMs = Date.parse(signal.expiresAt || '');
      const expiry = Number.isFinite(expiresAtMs)
        ? new Date(expiresAtMs).toISOString()
        : new Date(now + 20 * 60 * 1000).toISOString();
      const districtName = district?.name || state.player.districtName || 'the district';

      next.push({
        id: `signal-op-${signal.id}`,
        signalId: signal.id,
        title: resolveSignalTitle(signal),
        objective: resolveSignalObjective(signal, districtName),
        districtId,
        x,
        y,
        radius,
        intensity,
        expiresAt: expiry,
        resolved: false,
      });
      existingBySignalId.add(signal.id);
    }

    state.signalOperations.active = next.slice(0, MAX_ACTIVE_OPERATIONS);
    state.signalOperations.lastSyncAt = now;

    const afterIds = new Set(state.signalOperations.active.map((operation) => operation.id));
    const spawned = [...afterIds].filter((id) => !beforeIds.has(id));
    const changed = force || spawned.length > 0 || beforeIds.size !== afterIds.size;
    return { changed, spawnedCount: spawned.length };
  }

  function tick(_dt, hooks = {}) {
    const now = Date.now();
    const kept = [];
    const playerX = state.player?.x ?? 0;
    const playerY = state.player?.y ?? 0;

    for (const operation of getActiveOperations()) {
      const expiresAtMs = Date.parse(operation.expiresAt || '');
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) {
        hooks.onOperationExpired?.(operation);
        continue;
      }

      const dist = Math.hypot(playerX - operation.x, playerY - operation.y);
      if (dist <= operation.radius) {
        operation.resolved = true;
        resolvedSignals.set(operation.signalId, Date.parse(operation.expiresAt || '') || (now + 15 * 60 * 1000));
        state.effects.signalOperationPulseUntil = now + 1300;
        state.effects.signalOperationPulse = {
          x: operation.x,
          y: operation.y,
          radius: operation.radius,
          intensity: operation.intensity,
        };
        hooks.onOperationResolved?.(operation);
        continue;
      }

      kept.push(operation);
    }

    state.signalOperations.active = kept;
  }

  function getOperationByDistrict(districtId) {
    return getActiveOperations().find((operation) => operation.districtId === districtId) || null;
  }

  return {
    syncFromSignals,
    tick,
    getActiveOperations,
    getOperationByDistrict,
  };
}

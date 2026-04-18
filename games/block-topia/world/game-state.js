function nowUtcDaySeed() {
  return new Date().toISOString().slice(0, 10);
}

const PLAYER_MOVEMENT_SPEED = 3.2;
const MOVE_TARGET_ARRIVAL_DISTANCE = 0.06;
// Seconds a player must stand in a district (Night) before a capture preview tick fires
const CAPTURE_TICK_INTERVAL = 2;
// Visual progress increment per tick (0–100 scale); server owns the real control value
const CAPTURE_PROGRESS_DELTA = 3;

function computeSeasonIndex(epochMs, cycleDays) {
  const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - epochMs) / cycleMs);
}

function syncPlayerSpatialState(state) {
  state.player.x = Math.max(0, Math.min(state.map.width - 1, state.player.x));
  state.player.y = Math.max(0, Math.min(state.map.height - 1, state.player.y));

  const current = state.districts.fromGrid(state.player.x, state.player.y);
  if (current) {
    state.player.districtId = current.id;
    state.player.districtName = current.name;
  }

  const isoX = (state.player.x - state.player.y) * 32;
  const isoY = (state.player.x + state.player.y) * 16;
  state.camera.x = isoX;
  state.camera.y = isoY;
}

function buildDistrictLookup(districts) {
  const byId = new Map(districts.map((district) => [district.id, district]));

  function fromGrid(col, row) {
    return districts.find((district) => {
      const g = district.grid;
      return col >= g.col && row >= g.row && col < g.col + g.w && row < g.row + g.h;
    });
  }

  return { byId, fromGrid };
}

export function createGameState(bundle) {
  const districts = bundle.districts.districts || [];
  const districtLookup = buildDistrictLookup(districts);
  const initialDistrict = districts[0] || { id: 'neon-slums', name: 'Neon Slums', grid: { col: 0, row: 0, w: 6, h: 6 } };
  const seasonEpochMs = Date.parse(bundle.seasonModel.epoch || '2026-01-01T00:00:00Z');
  const seasonCycleDays = bundle.seasonModel.cycleDays || 90;

  return {
    map: {
      width: bundle.districts.mapWidth || 20,
      height: bundle.districts.mapHeight || 20,
    },
    room: {
      id: bundle.roomModel.id || 'city',
      maxPlayers: bundle.roomModel.maxPlayers || 100,
      autoScale: bundle.roomModel.autoScale || { enabled: true, overflowPolicy: 'spawn_sibling_room' },
      identity: {
        roomStateSeed: nowUtcDaySeed(),
        roomMemoryKey: `city-${nowUtcDaySeed()}`,
      },
    },
    season: {
      cycleDays: seasonCycleDays,
      epochMs: seasonEpochMs,
      index: computeSeasonIndex(seasonEpochMs, seasonCycleDays),
    },
    factions: {
      primary: bundle.factions.primary,
      secondary: bundle.factions.secondary,
      switchRules: bundle.factions.switchRules || {},
    },
    districts: districtLookup,
    districtState: districts.map((district) => ({
      id: district.id,
      name: district.name,
      control: 50,
      owner: bundle.factions.primary?.name || 'Liberators',
      activeEvents: [],
      memoryFlags: [],
    })),
    player: {
      name: `Rebel_${Math.floor(Math.random() * 9999)}`,
      x: initialDistrict.grid.col + 1,
      y: initialDistrict.grid.row + 1,
      districtId: initialDistrict.id,
      districtName: initialDistrict.name,
      xp: 0,
      score: 0,
      faction: bundle.factions.primary?.name || 'Liberators',
      moveTarget: null,
    },
    remotePlayers: [],
    camera: { x: 0, y: 0, zoom: 1, zoomIndex: 1 },
    phase: 'Day',
    captureTimer: 0,
    // Visual-only capture progress shown to the player while they hold a district at Night.
    // Server owns the real district control value; this is purely for client-side feedback.
    capturePreview: null,
    // Latest NPC position array from the server (lean snapshot format).
    // npc-system reads this to lerp local entities toward server-authoritative positions.
    npcTargets: null,
    npc: {
      activeTarget: bundle.npcArchetypes.split?.active || 24,
      activeCap: bundle.npcArchetypes.split?.activeCap || 120,
      crowdTarget: bundle.npcArchetypes.split?.crowd || 60,
      crowdCap: bundle.npcArchetypes.split?.crowdCap || 120,
      archetypes: bundle.npcArchetypes.archetypes || [],
      entities: [],
    },
    mouse: {
      hoverTile: null,
      selectedTile: null,
      hoverNpcId: '',
    },
    sam: {
      phases: bundle.samPhases.phases || [],
      currentIndex: 0,
      timer: 0,
      postMutationHooks: bundle.samPhases.postMutationHooks || [],
      signalRushHook: bundle.samPhases.signalRushHook || {},
    },
    effects: {
      phaseFlashUntil: 0,
      samImpactUntil: 0,
      districtPulseUntil: 0,
      districtPulseId: '',
      signalOperationPulseUntil: 0,
      signalOperationPulse: null,
    },
    signalOperations: {
      active: [],
      lastSyncAt: 0,
    },
    quests: {
      model: bundle.questModel,
      active: [],
      hooks: bundle.questModel.dynamicHooks || [],
    },
    memory: {
      id: `memory-${nowUtcDaySeed()}`,
      factionWins: [],
      districtChanges: [],
      samEvents: [],
      playerActions: [],
      log: [],
    },
    lore: {
      wikiHooks: bundle.seasonModel.wikiHooks || [],
      legacy: bundle.legacy,
    },
  };
}

export function applyRemotePlayers(state, players) {
  const filtered = players
    .filter((player) => typeof player.x === 'number' && typeof player.y === 'number');
  const existingById = new Map(state.remotePlayers.map((p) => [p.id, p]));
  state.remotePlayers = filtered.map((player) => {
    const existing = existingById.get(player.id);
    if (existing) {
      // Keep the current interpolated position; only update the interpolation target.
      existing._targetX = player.x;
      existing._targetY = player.y;
      existing.name = player.name || 'Player';
      existing.faction = player.faction || 'unknown';
      return existing;
    }
    // New player — snap directly to received position and initialise target.
    return {
      id: player.id,
      name: player.name || 'Player',
      x: player.x,
      y: player.y,
      _targetX: player.x,
      _targetY: player.y,
      faction: player.faction || 'unknown',
    };
  });
}

/**
 * Award XP and score to the local player.
 * Returns the new XP and score values.
 */
export function awardXp(state, xp) {
  state.player.xp += xp;
  state.player.score += Math.round(xp * 1.5);
  return { xp: state.player.xp, score: state.player.score };
}

export function updatePlayerMotion(state, input, dt, moveSender) {
  let moved = false;

  if (input.w || input.arrowup) {
    state.player.y -= PLAYER_MOVEMENT_SPEED * dt;
    moved = true;
  }
  if (input.s || input.arrowdown) {
    state.player.y += PLAYER_MOVEMENT_SPEED * dt;
    moved = true;
  }
  if (input.a || input.arrowleft) {
    state.player.x -= PLAYER_MOVEMENT_SPEED * dt;
    moved = true;
  }
  if (input.d || input.arrowright) {
    state.player.x += PLAYER_MOVEMENT_SPEED * dt;
    moved = true;
  }

  syncPlayerSpatialState(state);

  if (moved) {
    moveSender(state.player.x, state.player.y);
  }

  return moved;
}

export function movePlayerTowardTarget(state, dt, moveSender) {
  const target = state.player.moveTarget;
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    state.player.moveTarget = null;
    return false;
  }

  const dx = target.x - state.player.x;
  const dy = target.y - state.player.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= MOVE_TARGET_ARRIVAL_DISTANCE) {
    state.player.x = target.x;
    state.player.y = target.y;
    state.player.moveTarget = null;
    syncPlayerSpatialState(state);
    moveSender(state.player.x, state.player.y);
    return true;
  }

  const step = PLAYER_MOVEMENT_SPEED * dt;
  const ratio = Math.min(1, step / distance);
  state.player.x += dx * ratio;
  state.player.y += dy * ratio;
  syncPlayerSpatialState(state);
  moveSender(state.player.x, state.player.y);
  return true;
}

/**
 * Visual-only district capture preview tick.
 *
 * Accumulates client-side capture progress in `state.capturePreview` while the
 * player stands in a district during Night phase.  The REAL district control
 * value is owned by the server (`updateDistricts`) and reflected via
 * `worldSnapshot` / `districtCaptureChanged`.  This function MUST NOT mutate
 * `districtState[].control` or award XP — that would re-introduce local
 * authority that belongs to the server.
 *
 * Callers can read `state.capturePreview` to show a capture progress overlay.
 * Reset `state.capturePreview` when the player changes district.
 */
export function tickDistrictCapture(state, dt) {
  if (state.phase !== 'Night') return;

  state.captureTimer += dt;
  if (state.captureTimer < CAPTURE_TICK_INTERVAL) return;
  state.captureTimer = 0;

  const prev = state.capturePreview;
  state.capturePreview = {
    districtId: state.player.districtId,
    progress: Math.min(100, (prev?.districtId === state.player.districtId ? prev.progress : 0) + CAPTURE_PROGRESS_DELTA),
  };
}

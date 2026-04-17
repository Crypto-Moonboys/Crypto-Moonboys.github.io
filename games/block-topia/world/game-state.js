function nowUtcDaySeed() {
  return new Date().toISOString().slice(0, 10);
}

const PLAYER_MOVEMENT_SPEED = 3.2;

function computeSeasonIndex(epochMs, cycleDays) {
  const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - epochMs) / cycleMs);
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
    },
    remotePlayers: [],
    camera: { x: 0, y: 0 },
    phase: 'Day',
    captureTimer: 0,
    npc: {
      activeTarget: bundle.npcArchetypes.split?.active || 60,
      activeCap: bundle.npcArchetypes.split?.activeCap || 80,
      crowdTarget: bundle.npcArchetypes.split?.crowd || 300,
      crowdCap: bundle.npcArchetypes.split?.crowdCap || 600,
      archetypes: bundle.npcArchetypes.archetypes || [],
      entities: [],
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

  state.player.x = Math.max(0, Math.min(state.map.width - 1, state.player.x));
  state.player.y = Math.max(0, Math.min(state.map.height - 1, state.player.y));

  const current = state.districts.fromGrid(state.player.x, state.player.y);
  if (current) {
    state.player.districtId = current.id;
    state.player.districtName = current.name;
  }

  const isoX = (state.player.x - state.player.y) * 36;
  const isoY = (state.player.x + state.player.y) * 18;
  state.camera.x = isoX;
  state.camera.y = isoY;

  if (moved) {
    moveSender(state.player.x, state.player.y);
  }
}

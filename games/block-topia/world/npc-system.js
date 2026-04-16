const FACTION_SWITCH_PROBABILITY = 0.005;

// District-aware NPC spawn bands (col, row, w, h) matching districts.json grid regions
const DISTRICT_SPAWN_REGIONS = [
  { id: 'neon-slums',         col: 0,  row: 0,  w: 10, h: 8  },
  { id: 'signal-spire',       col: 10, row: 0,  w: 10, h: 8  },
  { id: 'crypto-core',        col: 0,  row: 8,  w: 8,  h: 12 },
  { id: 'moonlit-underbelly', col: 8,  row: 8,  w: 6,  h: 12 },
  { id: 'revolt-plaza',       col: 14, row: 8,  w: 6,  h: 12 },
];

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min));
}

function spawnPos(regionIndex, count) {
  const region = DISTRICT_SPAWN_REGIONS[regionIndex % DISTRICT_SPAWN_REGIONS.length];
  return {
    col: region.col + randInt(0, region.w),
    row: region.row + randInt(0, region.h),
    districtId: region.id,
  };
}

export function createNpcSystem(state) {
  const factionPool = ['Liberators', 'Wardens', 'Neutral'];

  // Initialise NPC entities with grid positions on first call
  if (state.npc.entities.length === 0) {
    for (let activeIndex = 0; activeIndex < state.npc.activeTarget; activeIndex += 1) {
      const pos = spawnPos(activeIndex, state.npc.activeTarget);
      state.npc.entities.push({
        id: `active-${activeIndex}`,
        role: state.npc.archetypes[activeIndex % Math.max(state.npc.archetypes.length, 1)]?.id || 'drifter',
        mode: 'active',
        faction: factionPool[activeIndex % factionPool.length],
        col: pos.col,
        row: pos.row,
        districtId: pos.districtId,
        moveTimer: Math.random() * 4,
        memoryHooks: [],
        dialogueHooks: [],
        routine: 'district_patrol',
      });
    }

    for (let crowdIndex = 0; crowdIndex < state.npc.crowdTarget; crowdIndex += 1) {
      const pos = spawnPos(crowdIndex, state.npc.crowdTarget);
      state.npc.entities.push({
        id: `crowd-${crowdIndex}`,
        role: 'crowd',
        mode: 'crowd',
        faction: 'Neutral',
        col: pos.col,
        row: pos.row,
        districtId: pos.districtId,
        moveTimer: Math.random() * 6,
        memoryHooks: [],
        dialogueHooks: [],
        routine: 'ambient_flow',
      });
    }
  }

  const MAP_W = state.map.width;
  const MAP_H = state.map.height;

  function tick(dt) {
    for (const npc of state.npc.entities) {
      if (!npc) continue;

      // Move active NPCs every ~4s, crowd NPCs every ~6s
      npc.moveTimer -= dt;
      if (npc.moveTimer > 0) continue;
      npc.moveTimer = npc.mode === 'active'
        ? 3 + Math.random() * 2
        : 5 + Math.random() * 3;

      // Random walk within district or one step in any direction
      const dc = randInt(-1, 2);
      const dr = randInt(-1, 2);
      const nc = Math.max(0, Math.min(MAP_W - 1, npc.col + dc));
      const nr = Math.max(0, Math.min(MAP_H - 1, npc.row + dr));
      npc.col = nc;
      npc.row = nr;

      // Refresh behaviour hooks each movement tick
      npc.dialogueHooks = ['react_to_player_presence', 'district_rumor_ping'];
      npc.memoryHooks   = ['track_faction_shift', 'track_daily_routine'];

      // Faction switching only applies to active NPCs
      if (npc.mode === 'active' && Math.random() < FACTION_SWITCH_PROBABILITY) {
        if (npc.faction === 'Neutral') {
          npc.faction = Math.random() < 0.5 ? 'Liberators' : 'Wardens';
        } else {
          npc.faction = npc.faction === 'Liberators' ? 'Wardens' : 'Liberators';
        }
      }
    }
  }

  return { tick };
}

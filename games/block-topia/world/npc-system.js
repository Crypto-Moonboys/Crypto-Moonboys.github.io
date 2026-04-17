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

function roleLabel(role) {
  if (role === 'vendor') return 'Vendor';
  if (role === 'fighter') return 'Fighter';
  if (role === 'agent') return 'Agent';
  if (role === 'lore-keeper') return 'Lore Keeper';
  if (role === 'recruiter') return 'Recruiter';
  if (role === 'drifter') return 'Drifter';
  return 'Citizen';
}

function sample(list, fallback = '') {
  if (!Array.isArray(list) || list.length === 0) return fallback;
  return list[Math.floor(Math.random() * list.length)] || fallback;
}

export function createNpcSystem(state) {
  const factionPool = ['Liberators', 'Wardens', 'Neutral'];
  const profileByRole = new Map(
    (state.lore?.legacy?.npcProfiles?.profiles || []).map((profile) => [profile.role, profile]),
  );
  const roleToProfile = {
    vendor: 'market_maker',
    fighter: 'enforcer',
    agent: 'courier',
    'lore-keeper': 'seer',
  };

  // Initialise NPC entities with grid positions on first call
  if (state.npc.entities.length === 0) {
    for (let activeIndex = 0; activeIndex < state.npc.activeTarget; activeIndex += 1) {
      const pos = spawnPos(activeIndex, state.npc.activeTarget);
      const role = state.npc.archetypes[activeIndex % Math.max(state.npc.archetypes.length, 1)]?.id || 'drifter';
      state.npc.entities.push({
        id: `active-${activeIndex}`,
        role,
        roleLabel: roleLabel(role),
        name: `${roleLabel(role)} ${activeIndex + 1}`,
        mode: 'active',
        faction: factionPool[activeIndex % factionPool.length],
        col: pos.col,
        row: pos.row,
        districtId: pos.districtId,
        moveTimer: Math.random() * 4,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.7 + Math.random() * 0.9,
        interactionRadius: 1.2 + Math.random() * 0.5,
        dialogue: [],
        memoryHooks: [],
        dialogueHooks: [],
        routine: role === 'vendor'
          ? 'stall_anchor'
          : role === 'fighter'
            ? 'aggressive_patrol'
            : role === 'agent'
              ? 'signal_route'
              : 'district_patrol',
      });
    }

    for (let crowdIndex = 0; crowdIndex < state.npc.crowdTarget; crowdIndex += 1) {
      const pos = spawnPos(crowdIndex, state.npc.crowdTarget);
      state.npc.entities.push({
        id: `crowd-${crowdIndex}`,
        role: 'crowd',
        roleLabel: 'Crowd',
        name: `Citizen ${crowdIndex + 1}`,
        mode: 'crowd',
        faction: 'Neutral',
        col: pos.col,
        row: pos.row,
        districtId: pos.districtId,
        moveTimer: Math.random() * 6,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.3 + Math.random() * 0.4,
        interactionRadius: 0.9 + Math.random() * 0.3,
        dialogue: [],
        memoryHooks: [],
        dialogueHooks: [],
        routine: 'ambient_flow',
      });
    }
  }

  const MAP_W = state.map.width;
  const MAP_H = state.map.height;

  function getDialogueLine(npc) {
    const mapped = roleToProfile[npc.role];
    const profile = mapped ? profileByRole.get(mapped) : null;
    if (profile?.rumors?.length) {
      return sample(profile.rumors, 'Keep moving. Signals are watching.');
    }
    const loreRumors = state.lore?.legacy?.lore?.npc_rumors;
    return sample(loreRumors, 'Move smart. The district remembers.');
  }

  function nearestInteractive(playerX, playerY) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const npc of state.npc.entities) {
      if (!npc || npc.mode !== 'active') continue;
      const dx = npc.col - playerX;
      const dy = npc.row - playerY;
      const dist = Math.hypot(dx, dy);
      if (dist < npc.interactionRadius && dist < nearestDist) {
        nearest = npc;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  function tick(dt) {
    for (const npc of state.npc.entities) {
      if (!npc) continue;
      npc.bobPhase += dt * npc.bobSpeed;

      // Move active NPCs every ~4s, crowd NPCs every ~6s
      npc.moveTimer -= dt;
      if (npc.moveTimer > 0) continue;
      npc.moveTimer = npc.mode === 'active'
        ? (npc.role === 'fighter' ? 1.8 + Math.random() * 1.8 : 2.6 + Math.random() * 2.4)
        : 4.5 + Math.random() * 3;

      // Street Signal feature reintroduced: role-weighted movement routines.
      const vendorDrift = npc.role === 'vendor' ? 0.5 : 1;
      const dc = randInt(-1, 2) * vendorDrift;
      const dr = randInt(-1, 2) * vendorDrift;
      const nc = Math.max(0, Math.min(MAP_W - 1, npc.col + dc));
      const nr = Math.max(0, Math.min(MAP_H - 1, npc.row + dr));
      npc.col = nc;
      npc.row = nr;

      // Refresh behaviour hooks each movement tick
      npc.dialogueHooks = ['react_to_player_presence', 'district_rumor_ping'];
      npc.memoryHooks   = ['track_faction_shift', 'track_daily_routine'];
      npc.dialogue = [getDialogueLine(npc)];

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

  return {
    tick,
    nearestInteractive,
    getDialogueLine,
  };
}

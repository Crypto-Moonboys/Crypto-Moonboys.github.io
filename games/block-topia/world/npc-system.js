const FACTION_SWITCH_PROBABILITY = 0.005;
const FIGHTER_MOVE_INTERVAL_MIN = 0.8;
const FIGHTER_MOVE_INTERVAL_RANGE = 0.8;
const ACTIVE_MOVE_INTERVAL_MIN = 1.2;
const ACTIVE_MOVE_INTERVAL_RANGE = 1.0;
const VENDOR_MOVE_INTERVAL_MIN = 1.7;
const VENDOR_MOVE_INTERVAL_RANGE = 0.9;
const PATROL_MOVE_INTERVAL_MIN = 1.1;
const PATROL_MOVE_INTERVAL_RANGE = 0.9;
const CROWD_MOVE_INTERVAL_MIN = 2.0;
const CROWD_MOVE_INTERVAL_RANGE = 1.5;
const UPDATE_BATCH = 40;
const MAX_ACTIVE_NPCS = 120;
const LIVE_DIALOGUE_CHANCE_WITH_OPERATION = 0.7;
const LIVE_DIALOGUE_CHANCE_BASE = 0.3;
const ROLE_OPERATION_LINE_CHANCE = 0.6;

// District-aware NPC spawn bands (col, row, w, h) matching districts.json grid regions
const DISTRICT_SPAWN_REGIONS = [
  { id: 'neon-slums',         col: 0,  row: 0,  w: 24, h: 18 },
  { id: 'signal-spire',       col: 24, row: 0,  w: 24, h: 18 },
  { id: 'crypto-core',        col: 0,  row: 18, w: 16, h: 30 },
  { id: 'moonlit-underbelly', col: 16, row: 18, w: 16, h: 30 },
  { id: 'revolt-plaza',       col: 32, row: 18, w: 16, h: 30 },
];

// Per-role inline fallback dialogue — used when no server NPC profiles are available.
const ROLE_DIALOGUE = {
  vendor: [
    'Signal parts fresh off the relay. Cheap today.',
    'Buying or selling? Make it quick — phase is shifting.',
    'District prices follow SAM. Buy before the next cycle.',
    'I move faction surplus. No ledgers, no questions.',
    'The Crypto Core runs dry after SAM sweeps. Stock up now.',
    'Best crates in the underbelly. Ask anyone.',
  ],
  fighter: [
    'This block is contested. Keep moving, or pick a side.',
    'Wardens pushed through last cycle. We hold here.',
    'I run patrols when SAM goes quiet. Risky business.',
    'You looking for a contract or trouble? Same answer either way.',
    'Signal Spire is heating up. Liberators are making a push.',
    'Every district has a price. Mine is non-negotiable.',
  ],
  agent: [
    'Signal relay is down two nodes east. Rerouting through the Slums.',
    'I carry messages the network cannot route cleanly.',
    'District memory is fragmented here. Trust nothing written.',
    'The factions pay me. The city keeps me breathing.',
    'Three drops, two dead drops, one live relay. Average Tuesday.',
    'I know which nodes SAM watches. For a price.',
  ],
  'lore-keeper': [
    'This district remembers everything — even what you want forgotten.',
    'The SAM cycle started in this very block. I watched it happen.',
    'When the signal first came, it rewrote the walls.',
    'Ask the city. It always answers — but not always clearly.',
    'The old relay maps are buried under Revolt Plaza. I know the depth.',
    'Faction wars leave marks in the grid. I catalog them all.',
  ],
  recruiter: [
    'Liberators are expanding east. The timing is right to join.',
    'Wardens are offering protection contracts in the Core. Good pay.',
    'Undecided? Stay neutral and stay mobile. For now.',
    'Faction allegiance is a tool, not a chain. Wield it smart.',
    'The balance shifts every phase. Tonight you can tip it.',
    'I recruit for results, not ideals. What can you bring?',
  ],
  drifter: [
    'Just passing through. As always.',
    'I never stay in one district long enough to care.',
    'Watch the SAM lines. They tell you where the pressure is.',
    'The city shifts. I shift with it.',
    'Revolt Plaza used to be quiet. Not anymore.',
    'You hear the hum? That is the signal layer. Always listening.',
  ],
};

// Faction-specific overlay lines that append to standard dialogue
const FACTION_DIALOGUE_OVERLAY = {
  Liberators: [
    'The Liberators will reclaim this district before dawn.',
    'We move where the signal is weakest and plant our flags.',
    'Warden control is slipping. This is our moment.',
  ],
  Wardens: [
    'The Wardens hold what the Liberators cannot keep.',
    'Order is maintained through pressure and presence.',
    'We do not capture — we consolidate.',
  ],
};

const OPERATION_ROLE_DIALOGUE = {
  vendor: [
    (district) => `Supply lanes in ${district} are breaking. Prices spike every pulse.`,
    (district) => `Market pressure is climbing in ${district}. Relay stock moves before sunrise.`,
    (district) => `Courier caches in ${district} are hot. I can barely keep crates moving.`,
  ],
  fighter: [
    (district) => `${district} is under territory strain. We hold this lane or lose the block.`,
    (district) => `Conflict pressure in ${district} is rising. Expect hard resistance near the relay.`,
    (district) => `Signal routes in ${district} are contested. Every corner is a frontline.`,
  ],
  agent: [
    (district) => `Route integrity in ${district} is unstable. Courier traffic is rerouting right now.`,
    (district) => `A relay trace in ${district} just lit up. Follow the courier corridor.`,
    (district) => `Courier intel says ${district} has an active operation marker on-grid.`,
  ],
  'lore-keeper': [
    (district) => `An omen hangs over ${district}. The relay remembers who ignored this warning.`,
    (district) => `Memory static in ${district} is rising. The city is trying to tell us something.`,
    (district) => `The warning lines around ${district} are old, but tonight they are awake again.`,
  ],
  recruiter: [
    (district) => `${district} needs support now. Momentum swings to whoever answers this operation first.`,
    (district) => `Alignment pressure in ${district} is peaking. Bring allies before the lane collapses.`,
    (district) => `Support routes in ${district} are open for a moment. We should move now.`,
  ],
};

// Character name pools per role — give each NPC a proper identity.
const NPC_NAMES = {
  vendor: ['Maxis', 'Creo', 'Dice', 'Sal', 'Brix', 'Parch'],
  fighter: ['Kira', 'Blox', 'Neon', 'Rust', 'Shard', 'Hex'],
  agent: ['Zero-K', 'Circuit', 'Codec', 'Wire', 'Phase', 'Node'],
  'lore-keeper': ['The Watcher', 'Old Seq', 'Archon', 'Mem', 'Sable'],
  recruiter: ['Kai', 'Proxy', 'Sway', 'Signal', 'Align'],
  drifter: ['Ghost', 'Null', 'Transit', 'Flux', 'Walker'],
};

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

function getRoutineForRole(role) {
  if (role === 'vendor') return 'stall_anchor';
  if (role === 'fighter') return 'aggressive_patrol';
  if (role === 'agent') return 'signal_route';
  return 'district_patrol';
}

function getMoveInterval(mode, role) {
  if (mode === 'active') {
    if (role === 'fighter') {
      return FIGHTER_MOVE_INTERVAL_MIN + Math.random() * FIGHTER_MOVE_INTERVAL_RANGE;
    }
    if (role === 'vendor') {
      return VENDOR_MOVE_INTERVAL_MIN + Math.random() * VENDOR_MOVE_INTERVAL_RANGE;
    }
    if (role === 'agent' || role === 'recruiter') {
      return PATROL_MOVE_INTERVAL_MIN + Math.random() * PATROL_MOVE_INTERVAL_RANGE;
    }
    return ACTIVE_MOVE_INTERVAL_MIN + Math.random() * ACTIVE_MOVE_INTERVAL_RANGE;
  }
  return CROWD_MOVE_INTERVAL_MIN + Math.random() * CROWD_MOVE_INTERVAL_RANGE;
}

function getInitialMoveTimer(mode, role) {
  return Math.random() * getMoveInterval(mode, role);
}

export function createNpcSystem(state, liveIntelligence = null) {
  let batchIndex = 0;
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
    const activeCap = Number.isFinite(state.npc.activeCap)
      ? state.npc.activeCap
      : state.npc.activeTarget;
    const activeCount = Math.min(
      state.npc.activeTarget,
      activeCap,
      MAX_ACTIVE_NPCS,
    );
    for (let activeIndex = 0; activeIndex < activeCount; activeIndex += 1) {
      const pos = spawnPos(activeIndex, state.npc.activeTarget);
      const role = state.npc.archetypes[activeIndex % Math.max(state.npc.archetypes.length, 1)]?.id || 'drifter';
      const namePool = NPC_NAMES[role] || NPC_NAMES.drifter;
      const npcName = namePool[activeIndex % namePool.length];
      state.npc.entities.push({
        id: `active-${activeIndex}`,
        role,
        roleLabel: roleLabel(role),
        name: npcName,
        mode: 'active',
        faction: factionPool[activeIndex % factionPool.length],
        col: pos.col,
        row: pos.row,
        districtId: pos.districtId,
        moveTimer: getInitialMoveTimer('active', role),
        seed: Math.random() * Math.PI * 2,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.7 + Math.random() * 0.9,
        interactionRadius: 1.2 + Math.random() * 0.5,
        dialogue: [],
        memoryHooks: [],
        dialogueHooks: [],
        routine: getRoutineForRole(role),
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
        moveTimer: getInitialMoveTimer('crowd', ''),
        seed: Math.random() * Math.PI * 2,
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

  function sampleOperationRoleLine(npc, operation) {
    if (!operation) return '';
    const districtName = state.districts.byId.get(operation.districtId)?.name || state.player?.districtName || 'this district';
    const builders = OPERATION_ROLE_DIALOGUE[npc.role];
    if (!Array.isArray(builders) || !builders.length) return '';
    const fn = sample(builders);
    if (typeof fn !== 'function') return '';
    return fn(districtName);
  }

  function getDistrictOperation(districtId) {
    const ops = state.signalOperations?.active || [];
    return ops.find((operation) => operation.districtId === districtId && !operation.resolved) || null;
  }

  function getDialogueLine(npc) {
    const districtOp = getDistrictOperation(npc?.districtId);
    const liveLine = liveIntelligence?.pickNpcLine?.(npc);
    const liveChance = districtOp ? LIVE_DIALOGUE_CHANCE_WITH_OPERATION : LIVE_DIALOGUE_CHANCE_BASE;
    if (districtOp && Math.random() < ROLE_OPERATION_LINE_CHANCE) {
      const roleOpLine = sampleOperationRoleLine(npc, districtOp);
      if (roleOpLine) return roleOpLine;
    }
    if (liveLine && Math.random() < liveChance) return liveLine;

    const mapped = roleToProfile[npc.role];
    const profile = mapped ? profileByRole.get(mapped) : null;
    if (profile?.rumors?.length) {
      return sample(profile.rumors, 'Keep moving. Signals are watching.');
    }
    const loreRumors = state.lore?.legacy?.lore?.npc_rumors;
    if (Array.isArray(loreRumors) && loreRumors.length) {
      return sample(loreRumors, 'Move smart. The district remembers.');
    }
    const inlineFallback = ROLE_DIALOGUE[npc.role] || [];
    const baseLine = sample(inlineFallback, 'Move smart. The district remembers.');
    // Occasionally blend in a faction-specific line for immersion
    const overlay = FACTION_DIALOGUE_OVERLAY[npc.faction];
    if (overlay && Math.random() < 0.28) {
      return sample(overlay, baseLine);
    }
    return baseLine;
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
    const npcs = state.npc.entities || [];
    const total = npcs.length;
    if (!total) return;

    // When the server has sent NPC targets, follow server positions via lerp.
    // Local simulation acts as a fallback when no server targets are available.
    if (state.npcTargets?.length) {
      const targets = state.npcTargets;
      const len = Math.min(total, targets.length);
      for (let i = 0; i < len; i += 1) {
        const entity = npcs[i];
        const target = targets[i];
        if (!entity || !target) continue;
        entity.col += (target.col - entity.col) * 0.2;
        entity.row += (target.row - entity.row) * 0.2;
        if (Number.isFinite(target.bobPhase)) {
          entity.bobPhase += (target.bobPhase - entity.bobPhase) * 0.2;
        }
        if (target.faction) entity.faction = target.faction;
      }
      return;
    }

    // Fallback: local simulation when no server targets are available.
    const batchSize = Math.min(UPDATE_BATCH, total);
    for (let i = 0; i < batchSize; i += 1) {
      const npc = npcs[(batchIndex + i) % total];
      // Only active NPCs are updated in the simulation batch; crowd and other non-active modes
      // are visual-only and skipped here (they still incur a minimal skip-check per batch slot).
      if (!npc || npc.mode !== 'active') continue;

      npc.bobPhase += dt * npc.bobSpeed;
      npc.moveTimer -= dt;
      if (npc.moveTimer > 0) continue;
      npc.moveTimer = getMoveInterval(npc.mode, npc.role);

      // Street Signal feature reintroduced: role-weighted movement routines.
      let dc = randInt(-1, 2);
      let dr = randInt(-1, 2);
      if (npc.role === 'vendor' && Math.random() < 0.55) {
        dc = 0;
        dr = 0;
      } else if (npc.role === 'fighter') {
        dc = randInt(-1, 2);
        dr = Math.random() < 0.65 ? randInt(-1, 2) : randInt(-2, 3);
      } else if (npc.role === 'agent') {
        dc = Math.random() < 0.5 ? randInt(-2, 3) : 0;
        dr = Math.random() < 0.5 ? randInt(-2, 3) : 0;
      } else if (npc.role === 'recruiter') {
        dc = Math.random() < 0.6 ? randInt(-1, 2) : 0;
        dr = Math.random() < 0.6 ? randInt(-1, 2) : 0;
      }
      const nc = Math.max(0, Math.min(MAP_W - 1, npc.col + dc));
      const nr = Math.max(0, Math.min(MAP_H - 1, npc.row + dr));
      npc.col = nc;
      npc.row = nr;

      // Refresh behaviour hooks each movement tick
      npc.dialogueHooks = ['react_to_player_presence', 'district_rumor_ping'];
      npc.memoryHooks   = ['track_faction_shift', 'track_daily_routine'];
      npc.dialogue = [getDialogueLine(npc)];

      if (Math.random() < FACTION_SWITCH_PROBABILITY) {
        if (npc.faction === 'Neutral') {
          npc.faction = Math.random() < 0.5 ? 'Liberators' : 'Wardens';
        } else {
          npc.faction = npc.faction === 'Liberators' ? 'Wardens' : 'Liberators';
        }
      }
    }
    batchIndex = (batchIndex + batchSize) % total;
  }

  return {
    tick,
    nearestInteractive,
    getDialogueLine,
  };
}

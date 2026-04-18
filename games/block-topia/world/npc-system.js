import { NETWORK_LINES } from './network-lines.js';

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
const MAX_ACTIVE_NPCS = 60;
const MAX_TOTAL_NPCS = 60;
const LIVE_DIALOGUE_CHANCE_WITH_OPERATION = 0.7;
const LIVE_DIALOGUE_CHANCE_BASE = 0.3;
const ROLE_OPERATION_LINE_CHANCE = 0.6;
const CONTROL_NODE_NUDGE_PROBABILITY = 0.005;
const CONTROL_NODE_VILLAIN_DRAIN = 5;
const CONTROL_NODE_HELPER_GAIN = 5;
const INTERFERENCE_REACTION_DURATION_MS = 9000;
const INTERFERENCE_DISTRICT_DIALOGUE_CHANCE = 0.65;
const INTERFERENCE_NODE_RADIUS_SQ = 36;
const INTERFERENCE_WANDER_CHANCE = 0.28;
const UNSTABLE_VILLAIN_SPAWN_CHANCE = 0.3;

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

const INTERFERENCE_ROLE_DIALOGUE = {
  vendor: [
    'Node surge is trashing local prices. Buy now or bleed credits.',
    'Signal instability just burned my relay stock. Move fast.',
  ],
  fighter: [
    'That node pulse lit the block. Hold the lane.',
    'Interference hit this district hard. Stay ready.',
  ],
  agent: [
    'Node noise rerouted our courier lanes. Stay off open channels.',
    'Interference pressure is climbing. Use backup relays only.',
  ],
  'lore-keeper': [
    'The control node is screaming. District memory is destabilising.',
    'Signal static from that node is rewriting old routes.',
  ],
  recruiter: [
    'Node disruption opened a pressure window. Pull allies in now.',
    'District morale swings when node interference spikes.',
  ],
  drifter: [
    'I heard that node crackle two blocks away.',
    'Interference always drags SAM eyes closer.',
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

function lineCoordKey(point) {
  return `${point.x},${point.y}`;
}

const LINE_BY_ID = new Map(NETWORK_LINES.map((line) => [line.id, line]));
const LINES_BY_COORD = new Map();
for (const line of NETWORK_LINES) {
  const fromKey = lineCoordKey(line.from);
  const toKey = lineCoordKey(line.to);

  const fromExisting = LINES_BY_COORD.get(fromKey) || [];
  fromExisting.push(line);
  LINES_BY_COORD.set(fromKey, fromExisting);

  const toExisting = LINES_BY_COORD.get(toKey) || [];
  toExisting.push(line);
  LINES_BY_COORD.set(toKey, toExisting);
}

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

function pickRandomLineId() {
  if (!NETWORK_LINES.length) return '';
  return NETWORK_LINES[Math.floor(Math.random() * NETWORK_LINES.length)].id;
}

function getLine(lineId) {
  return LINE_BY_ID.get(lineId);
}

function pointEquals(a, b) {
  return a?.x === b?.x && a?.y === b?.y;
}

function randomLineDirectionSign() {
  return Math.random() < 0.5 ? 1 : -1;
}

function pickNextLine(npc) {
  const current = getLine(npc.lineId);
  if (!current) {
    return {
      lineId: pickRandomLineId(),
      lineDirection: randomLineDirectionSign(),
    };
  }

  const currentDirection = npc.lineDirection === -1 ? -1 : 1;
  const arrivalNode = currentDirection === 1 ? current.to : current.from;
  const options = LINES_BY_COORD.get(lineCoordKey(arrivalNode)) || [];

  if (!options.length) {
    return {
      lineId: pickRandomLineId(),
      lineDirection: randomLineDirectionSign(),
    };
  }

  let candidateOptions = options;
  if (options.length > 1) {
    const withoutImmediateBounce = options.filter((line) => line.id !== current.id);
    if (withoutImmediateBounce.length) {
      candidateOptions = withoutImmediateBounce;
    }
  }

  const nextLine = candidateOptions[Math.floor(Math.random() * candidateOptions.length)];
  const lineDirection = pointEquals(nextLine.from, arrivalNode) ? 1 : -1;
  return {
    lineId: nextLine.id,
    lineDirection,
  };
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
  let crowdLerpSkipToggle = false;
  let interferenceContext = null;
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

  function createNpc({
    id,
    role,
    roleLabel: label,
    name,
    mode,
    faction,
    col,
    row,
    districtId,
    bobSpeed,
    interactionRadius,
    routine,
    type,
  }) {
    return {
      id,
      role,
      roleLabel: label,
      name,
      mode,
      faction,
      col,
      row,
      districtId,
      moveTimer: getInitialMoveTimer(mode, role),
      seed: Math.random() * Math.PI * 2,
      bobPhase: Math.random() * Math.PI * 2,
      bobSpeed,
      interactionRadius,
      dialogue: [],
      memoryHooks: [],
      dialogueHooks: [],
      routine,
      lineId: pickRandomLineId(),
      lineDirection: randomLineDirectionSign(),
      t: Math.random(),
      speed: 0.2 + Math.random() * 0.3,
      type: type || 'helper',
    };
  }

  // Initialise NPC entities with grid positions on first call
  if (state.npc.entities.length === 0) {
    const activeCap = Number.isFinite(state.npc.activeCap)
      ? state.npc.activeCap
      : state.npc.activeTarget;
    const activeCount = Math.min(
      state.npc.activeTarget,
      activeCap,
      MAX_ACTIVE_NPCS,
      MAX_TOTAL_NPCS,
    );
    for (let activeIndex = 0; activeIndex < activeCount; activeIndex += 1) {
      const pos = spawnPos(activeIndex, state.npc.activeTarget);
      const role = state.npc.archetypes[activeIndex % Math.max(state.npc.archetypes.length, 1)]?.id || 'drifter';
      const namePool = NPC_NAMES[role] || NPC_NAMES.drifter;
      const npcName = namePool[activeIndex % namePool.length];
      state.npc.entities.push(createNpc({
        id: `active-${activeIndex}`,
        role,
        roleLabel: roleLabel(role),
        name: npcName,
        mode: 'active',
        faction: factionPool[activeIndex % factionPool.length],
        col: pos.col,
        row: pos.row,
        districtId: pos.districtId,
        bobSpeed: 0.7 + Math.random() * 0.9,
        interactionRadius: 1.2 + Math.random() * 0.5,
        routine: getRoutineForRole(role),
      }));
    }

    const crowdCap = Number.isFinite(state.npc.crowdCap)
      ? state.npc.crowdCap
      : state.npc.crowdTarget;
    const crowdCount = Math.min(
      state.npc.crowdTarget,
      crowdCap,
      Math.max(0, MAX_TOTAL_NPCS - activeCount),
    );
    for (let crowdIndex = 0; crowdIndex < crowdCount; crowdIndex += 1) {
      const pos = spawnPos(crowdIndex, state.npc.crowdTarget);
      state.npc.entities.push(createNpc({
        id: `crowd-${crowdIndex}`,
        role: 'crowd',
        roleLabel: 'Crowd',
        name: `Citizen ${crowdIndex + 1}`,
        mode: 'crowd',
        faction: 'Neutral',
        col: pos.col,
        row: pos.row,
        districtId: pos.districtId,
        bobSpeed: 0.3 + Math.random() * 0.4,
        interactionRadius: 0.9 + Math.random() * 0.3,
        routine: 'ambient_flow',
      }));
    }

    state.npc.activeEntities = state.npc.entities.filter((npc) => npc?.mode === 'active');
    state.npc.activeEntitiesSourceLen = state.npc.entities.length;
  }

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
    const now = Date.now();
    if (interferenceContext && now >= interferenceContext.expiresAt) {
      interferenceContext = null;
    }
    if (
      interferenceContext
      && interferenceContext.districtId
      && npc?.districtId === interferenceContext.districtId
      && Math.random() < INTERFERENCE_DISTRICT_DIALOGUE_CHANCE
    ) {
      const hotLines = INTERFERENCE_ROLE_DIALOGUE[npc.role];
      if (Array.isArray(hotLines) && hotLines.length) {
        return sample(hotLines, 'Signal instability is rising across the district.');
      }
    }

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
    const canonRumors = state.lore?.canon?.npcRumors;
    if (Array.isArray(canonRumors) && canonRumors.length) {
      return sample(canonRumors, 'Move smart. The district remembers.');
    }
    const loreRumors = state.lore?.legacy?.lore?.npc_rumors;
    if (Array.isArray(loreRumors) && loreRumors.length) {
      return `Fallback intel: ${sample(loreRumors, 'Move smart. The district remembers.')}`;
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

  function rebuildActiveEntitiesIfNeeded() {
    const entities = state.npc.entities || [];
    if (
      !Array.isArray(state.npc.activeEntities)
      || state.npc.activeEntitiesSourceLen !== entities.length
    ) {
      state.npc.activeEntities = entities.filter((npc) => npc?.mode === 'active');
      state.npc.activeEntitiesSourceLen = entities.length;
    }
  }

  function nearestInteractive(playerX, playerY) {
    rebuildActiveEntitiesIfNeeded();
    const pool = state.npc.activeEntities || [];
    let nearest = null;
    let nearestDistSq = Infinity;
    for (const npc of pool) {
      if (!npc) continue;
      const dx = npc.col - playerX;
      const dy = npc.row - playerY;
      const distSq = dx * dx + dy * dy;
      const radius = npc.interactionRadius || 1.5;
      const radiusSq = radius * radius;

      if (distSq < radiusSq && distSq < nearestDistSq) {
        nearest = npc;
        nearestDistSq = distSq;
      }
    }

    return nearest;
  }

  function tick(dt) {
    if (interferenceContext && Date.now() >= interferenceContext.expiresAt) {
      interferenceContext = null;
    }
    const npcs = state.npc.entities || [];
    const total = npcs.length;
    if (!total) return;
    if (!NETWORK_LINES.length) return;
    rebuildActiveEntitiesIfNeeded();

    // When the server has sent NPC targets, follow server positions via lerp.
    // Local simulation acts as a fallback when no server targets are available.
    if (state.npcTargets?.length) {
      const targets = state.npcTargets;
      const len = Math.min(total, targets.length);
      crowdLerpSkipToggle = !crowdLerpSkipToggle;
      for (let i = 0; i < len; i += 1) {
        const entity = npcs[i];
        const target = targets[i];
        if (!entity || !target) continue;
        if (entity.mode === 'crowd' && !crowdLerpSkipToggle) continue;

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
    const movementDt = Math.min(0.1, Math.max(0, dt));
    for (let i = 0; i < batchSize; i += 1) {
      const npc = npcs[(batchIndex + i) % total];
      if (!npc) continue;
      npc.type = npc.type || 'helper';
      if (!npc.lineId) npc.lineId = pickRandomLineId();
      if (npc.lineDirection !== 1 && npc.lineDirection !== -1) {
        npc.lineDirection = randomLineDirectionSign();
      }
      if (!Number.isFinite(npc.t)) npc.t = Math.random();
      if (!Number.isFinite(npc.speed)) npc.speed = 0.2 + Math.random() * 0.3;

      let line = getLine(npc.lineId);
      if (!line) continue;

      npc.t += npc.speed * movementDt;
      if (npc.t > 1) {
        const next = pickNextLine(npc);
        npc.lineId = next.lineId;
        npc.lineDirection = next.lineDirection;
        npc.t = 0;
        line = getLine(npc.lineId);
        if (!line) continue;
      }

      // Occasional random network jump (1% chance) — keeps NPCs spreading
      // across the entire network instead of converging on heavily-connected hubs.
      if (Math.random() < 0.01) {
        npc.lineId = pickRandomLineId();
        npc.lineDirection = randomLineDirectionSign();
        npc.t = Math.random();
        line = getLine(npc.lineId);
        if (!line) continue;
      }

      const direction = npc.lineDirection === -1 ? -1 : 1;
      const from = direction === 1 ? line.from : line.to;
      const to = direction === 1 ? line.to : line.from;
      npc.col = from.x + (to.x - from.x) * npc.t;
      npc.row = from.y + (to.y - from.y) * npc.t;

      // Only active NPCs receive behaviour/dialogue updates in the simulation batch.
      // Crowd and other non-active modes still move along network lines in fallback mode.
      if (npc.mode !== 'active') continue;

      npc.bobPhase += movementDt * npc.bobSpeed;
      npc.moveTimer -= movementDt;
      if (npc.moveTimer > 0) continue;
      npc.moveTimer = getMoveInterval(npc.mode, npc.role);

      // Refresh behaviour hooks each movement tick
      npc.dialogueHooks = ['react_to_player_presence', 'district_rumor_ping'];
      npc.memoryHooks   = ['track_faction_shift', 'track_daily_routine'];
      npc.dialogue = [getDialogueLine(npc)];

      // Active NPCs occasionally nudge a random control node (villains drain it)
      if (Array.isArray(state.controlNodes) && state.controlNodes.length && Math.random() < CONTROL_NODE_NUDGE_PROBABILITY) {
        const node = state.controlNodes[Math.floor(Math.random() * state.controlNodes.length)];
        if (node) {
          const delta = npc.type === 'villain' ? -CONTROL_NODE_VILLAIN_DRAIN : CONTROL_NODE_HELPER_GAIN;
          node.control = Math.max(0, Math.min(100, node.control + delta));
        }
      }

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

  function spawnSamWave() {
    if (!state.npc.entities?.length) return;
    const activePool = state.npc.entities.filter((entity) => entity?.mode === 'active');
    const shuffled = [...activePool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picks = Math.min(5, shuffled.length);
    for (let i = 0; i < picks; i += 1) {
      const npc = shuffled[i];
      if (!npc) continue;
      npc.type = 'villain';
      npc.lineId = pickRandomLineId();
      npc.lineDirection = randomLineDirectionSign();
      npc.t = 0;
    }
  }

  function reactToNodeInterference(payload = {}) {
    const districtId = payload.districtId || '';
    const nodeX = Number(payload.nodeX);
    const nodeY = Number(payload.nodeY);
    const now = Date.now();
    interferenceContext = {
      districtId,
      nodeId: payload.nodeId || '',
      status: payload.status || 'contested',
      expiresAt: now + INTERFERENCE_REACTION_DURATION_MS,
      samPressureDelta: Number(payload.samPressureDelta) || 0,
      sourcePlayerId: payload.sourcePlayerId || '',
    };

    const activePool = state.npc.activeEntities || state.npc.entities?.filter((npc) => npc?.mode === 'active') || [];
    if (!activePool.length) return;
    for (const npc of activePool) {
      if (!npc) continue;
      const sameDistrict = districtId && npc.districtId === districtId;
      let nearNode = false;
      if (Number.isFinite(nodeX) && Number.isFinite(nodeY)) {
        const dx = npc.col - nodeX;
        const dy = npc.row - nodeY;
        nearNode = (dx * dx + dy * dy) <= INTERFERENCE_NODE_RADIUS_SQ;
      }
      if (!sameDistrict && !nearNode) continue;
      npc.dialogueHooks = ['react_to_player_presence', 'district_rumor_ping', 'node_interference_alert'];
      npc.dialogue = [getDialogueLine(npc)];
      if (Math.random() < INTERFERENCE_WANDER_CHANCE) {
        npc.lineId = pickRandomLineId();
        npc.lineDirection = randomLineDirectionSign();
        npc.t = 0;
      }
      if (payload.status === 'unstable' && Math.random() < UNSTABLE_VILLAIN_SPAWN_CHANCE) {
        npc.type = 'villain';
      }
    }
  }

  return {
    tick,
    nearestInteractive,
    getDialogueLine,
    spawnSamWave,
    reactToNodeInterference,
  };
}

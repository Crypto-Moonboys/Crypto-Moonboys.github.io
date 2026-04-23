import { Room } from 'colyseus';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { clampPosition, validateMovement } from '../systems/player-system.js';
import { getDistrictForPosition, createDistrictPayload } from '../systems/district-system.js';
import { checkAndCompleteQuests } from '../systems/quest-system.js';
import { createDuelSystem } from '../systems/duel-system.js';
import {
  HUNTER_MODE_CONFIG,
  buildDistrictPatrolPlans,
  buildHunterAssignmentQueue,
  buildHunterDetectionFields,
  trimHunterActivities,
} from '../systems/hunter-system.js';
import { CONTROL_NODES, CONTROL_LINKS } from '../../../../games/block-topia/world/control-grid.js';

const ACTIVE_NPC_COUNT = 40;
const CROWD_NPC_COUNT = 20;
const DISTRICT_DRIFT_INTERVAL_MS = 1200;
const WORLD_SNAPSHOT_INTERVAL_MS = 300;
const DISTRICT_CAPTURE_THRESHOLD = 90;
const NODE_INTERFERENCE_GAIN = 18;
const NODE_UNSTABLE_THRESHOLD = 65;
const NODE_COOLDOWN_MS = 6500;
const NODE_PULSE_DURATION_MS = 1200;
const NODE_INTERFERENCE_DECAY = 2;
const NODE_DISTRICT_SHIFT = 3;
const SAM_PRESSURE_FROM_INTERFERENCE = 9;
const SAM_PRESSURE_PHASE_THRESHOLD = 100;
const SAM_PRESSURE_RESET_FLOOR = 20;
const DUEL_DISTRICT_PRESSURE_SHIFT = 4;
const DUEL_SAM_PRESSURE_SHIFT = 2;
const SAM_STATE_INTERVAL_MS = 1500;
const HUNTER_UPDATE_INTERVAL_MS = 250;
const MAX_SYSTEM_EVENTS_PER_TICK = 4;
const WAR_TICK_INTERVAL_MS = 250;
const WAR_CONTEST_THRESHOLD = 18;
const WAR_COMBAT_THRESHOLD = 30;
const RECRUITMENT_NODE_BOOST = 1.4;
const RECRUITMENT_SUPPORT_GAIN = 2.2;
const RECRUITMENT_SAM_SUPPRESSION = 1.6;
const REINFORCEMENT_THRESHOLD = 10;
const DISTRICT_INSTABILITY_DECAY = 1.2;
const DISTRICT_INSTABILITY_CONFLICT_GAIN = 4.5;
const DISTRICT_INSTABILITY_SAM_GAIN = 1.5;
const NODE_CONFLICT_DECAY = 2.5;
const SAM_WAR_IMPACT_CLAMP = 18;
const PLAYER_NODE_SUPPORT_RADIUS = 8;
const PLAYER_NODE_SUPPORT_TICK = 1.4;
const PLAYER_DISTRICT_SUPPORT_TICK = 1.1;
const COVERT_DISTRICT_REPORT_TTL_MS = 90 * 1000;
const PLAYER_WAR_ACTION_IMPACT = {
  interfere: 7,
  operation_success: 10,
  operation_failure: 8,
  operation_skip: 4,
  duel_win: 9,
  duel_loss: 6,
};

const WORLD_DISTRICTS = [
  { id: 'neon-slums', name: 'Neon Slums' },
  { id: 'signal-spire', name: 'Signal Spire' },
  { id: 'crypto-core', name: 'Crypto Core' },
  { id: 'moonlit-underbelly', name: 'Moonlit Underbelly' },
  { id: 'revolt-plaza', name: 'Revolt Plaza' },
];
const SAM_HUNTER_COUNT = 4;

const NPC_ROLES = ['vendor', 'fighter', 'agent', 'lore-keeper', 'recruiter', 'drifter'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class PlayerState extends Schema {
  constructor() {
    super();
    this.id = '';
    this.name = '';
    this.x = 0;
    this.y = 0;
    this.xp = 0;
    this.currentDistrict = '';
    this.warStance = 'neutral';
  }
}

defineTypes(PlayerState, {
  id: 'string',
  name: 'string',
  x: 'number',
  y: 'number',
  xp: 'number',
  currentDistrict: 'string',
  warStance: 'string',
});

class RoomState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}

defineTypes(RoomState, {
  players: { map: PlayerState },
});

export class CityRoom extends Room {
  onCreate(options) {
    this.setState(new RoomState());
    this.maxClients = 100;
    // Keep the room alive even when all players have left so that reconnecting
    // clients can always use client.join() rather than client.joinOrCreate().
    // This ensures there is always exactly ONE "city" room instance.
    this.autoDispose = false;
    this.worldTickCount = 0;
    this.samTimerMs = 0;
    this.districtTimerMs = 0;
    this.snapshotTimerMs = 0;
    this.systemEventsThisTick = 0;
    this.hunterTimerMs = 0;

    this.completedQuests = new Map(); // sessionId -> Set
    this.world = this.createInitialWorld();
    this.world.nodeLookup = new Map(this.world.controlNodes.map((node) => [node.id, node]));
    this.world.linkAdjacency = this.buildLinkAdjacency();
    this.bootstrapSamHunters();
    this.duels = createDuelSystem({
      getPlayerName: (playerId) => this.state.players.get(playerId)?.name || 'Player',
      getSamPhase: () => this.world.samPhase,
    });

    console.log('🏙️ CityRoom with District and Quest systems created', options);
    this.setSimulationInterval((dt) => this.updateWorld(dt), 50);

    this.onMessage('move', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const { x, y } = data || {};
      if (typeof x !== 'number' || typeof y !== 'number') return;

      const previous = { x: player.x, y: player.y };
      const next = clampPosition(x, y);

      if (!validateMovement(previous, next)) return;

      player.x = next.x;
      player.y = next.y;

      this.handleDistrictChange(client.sessionId, player);
      this.handleQuestProgress(client.sessionId, player);
    });

    this.onMessage('interact', (client, data) => {
      this.broadcast('interaction', {
        playerId: client.sessionId,
        target: data?.target || null,
      });
    });

    this.onMessage('nodeInterfere', (client, data) => {
      this.handleNodeInterference(client, data);
    });

    this.onMessage('warAction', (client, data) => {
      this.handlePlayerWarAction(client, data);
    });

    this.onMessage('covertPressureSync', (client, data) => {
      this.handleCovertPressureSync(client, data);
    });

    this.onMessage('duelChallenge', (client, data) => {
      this.handleDuelChallenge(client, data);
    });

    this.onMessage('duelAccept', (client, data) => {
      this.handleDuelAccept(client, data);
    });

    this.onMessage('duelAction', (client, data) => {
      this.handleDuelAction(client, data);
    });
  }

  createInitialWorld() {
    const controlNodes = CONTROL_NODES.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      districtId: node.districtId,
      nodeType: node.nodeType || 'relay',
      owner: null,
      control: 0,
      interference: 0,
      status: 'stable',
      cooldownUntil: 0,
      lastInterferedBy: null,
      pulseUntil: 0,
      warState: 'patrolling',
      contestedBy: null,
      conflictLevel: 0,
      recruitmentLevel: 0,
      samInstability: 0,
    }));
    const links = CONTROL_LINKS.map((link) => ({
      from: link.from.id,
      to: link.to.id,
    }));
    const nodeIds = controlNodes.map((node) => node.id);
    const npcs = [];

    for (let i = 0; i < ACTIVE_NPC_COUNT; i += 1) {
      const startNode = nodeIds[i % nodeIds.length];
      const altNode = nodeIds[(i + 7) % nodeIds.length];
      const start = controlNodes.find((node) => node.id === startNode) || controlNodes[0];
      npcs.push({
        id: `active-${i}`,
        role: NPC_ROLES[i % NPC_ROLES.length],
        roleLabel: NPC_ROLES[i % NPC_ROLES.length],
        name: `Citizen ${i + 1}`,
        mode: 'active',
        faction: i % 2 === 0 ? 'Liberators' : 'Wardens',
        col: (start?.x || 0) / 2.5,
        row: (start?.y || 0) / 2.5,
        currentNode: startNode,
        targetNode: altNode,
        path: [],
        pathProgress: 0,
        bobSpeed: 0.8 + Math.random() * 0.8,
        interactionRadius: 1.3,
        routeCooldownMs: (i % 4) * 120,
        combatState: 'patrolling',
        reinforceCharge: 0,
        recruitPower: NPC_ROLES[i % NPC_ROLES.length] === 'recruiter' ? 1.3 : 0.45,
        retreatUntil: 0,
      });
    }

    for (let i = 0; i < CROWD_NPC_COUNT; i += 1) {
      npcs.push({
        id: `crowd-${i}`,
        role: 'crowd',
        roleLabel: 'Crowd',
        name: `Crowd ${i + 1}`,
        mode: 'crowd',
        faction: 'Neutral',
        col: (controlNodes[i % controlNodes.length]?.x || 0) / 2.5,
        row: (controlNodes[i % controlNodes.length]?.y || 0) / 2.5,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.4 + Math.random() * 0.3,
        interactionRadius: 1.0,
      });
    }

    return {
      npcs,
      districts: WORLD_DISTRICTS.map((district, index) => ({
        id: district.id,
        name: district.name,
        control: 45 + index * 4,
        owner: index % 2 === 0 ? 'Liberators' : 'Wardens',
        instability: 12 + (index * 2),
        support: {
          Liberators: 45 + (index % 2 === 0 ? 6 : -4),
          Wardens: 45 + (index % 2 === 1 ? 6 : -4),
        },
        pressure: { Liberators: 0, Wardens: 0, neutral: 0 },
        controlState: 'contested',
        alliedSupport: 50,
        hostilePresence: 50,
      })),
      controlNodes,
      links,
      factions: {
        Liberators: { strength: 50, warMomentum: 0, recruitment: 0, pressure: 50 },
        Wardens: { strength: 50, warMomentum: 0, recruitment: 0, pressure: 50 },
      },
      samPhase: 0,
      samPressure: 0,
      playerInterferenceSpike: 0,
      unstableNodeCount: 0,
      samHunters: [],
      hunterFields: [],
      districtPatrols: WORLD_DISTRICTS.map((district) => ({
        districtId: district.id,
        districtName: district.name,
        patrolMode: 'patrol',
        pressureScore: 0,
        focusNodeId: '',
        focusNodeIds: [],
        hottestNodeId: '',
        repeatedTargetNodeId: '',
        activityWeight: 0,
        instability: 0,
        watchLabel: 'watched',
        postureState: 'normal',
        postureScore: 0,
        postureTrend: 'holding',
        warningLine: `${district.name} is operating on a normal surveillance cycle`,
        surveillanceTone: 'nominal watch',
        localTraceCount: 0,
        routeDisruptionCount: 0,
        nodeScanCount: 0,
        covertPressureWeight: 0,
        activeHunters: 0,
      })),
      hunterActivities: [],
      covertDistrictReports: [],
      warTickMs: 0,
      warSamPressureDelta: 0,
      warEventCooldowns: new Map(),
    };
  }

  updateWorld(dt) {
    this.worldTickCount += 1;
    this.systemEventsThisTick = 0;
    this.samTimerMs += dt;
    this.districtTimerMs += dt;
    this.snapshotTimerMs += dt;
    this.hunterTimerMs += dt;

    this.updateNPCs(dt);
    this.updateWarLayer(dt);
    this.updateFactionState();
    this.updateDistricts();
    this.updateNodeInterference();
    this.updateSAM();
    this.updateSamHunters(dt);
    this.updateDuels();

    if (this.snapshotTimerMs >= WORLD_SNAPSHOT_INTERVAL_MS) {
      this.snapshotTimerMs = 0;
      this.broadcast('worldSnapshot', this.buildLeanSnapshot());
    }
  }

  buildLeanSnapshot() {
    return {
      npcs: this.world.npcs.map((npc) => ({
        id: npc.id,
        mode: npc.mode,
        col: npc.col,
        row: npc.row,
        bobPhase: npc.bobPhase,
        faction: npc.faction,
        currentNode: npc.currentNode || null,
        targetNode: npc.targetNode || null,
        combatState: npc.combatState || 'patrolling',
        reinforceCharge: Number(npc.reinforceCharge) || 0,
      })),
      districts: this.world.districts.map((d) => ({
        id: d.id,
        name: d.name,
        control: d.control,
        owner: d.owner,
        instability: d.instability || 0,
        support: d.support || { Liberators: 50, Wardens: 50 },
        pressure: d.pressure || { Liberators: 0, Wardens: 0, neutral: 0 },
        controlState: d.controlState || 'contested',
        alliedSupport: d.alliedSupport || 50,
        hostilePresence: d.hostilePresence || 50,
      })),
      samHunters: this.world.samHunters.map((hunter) => ({
        id: hunter.id,
        districtId: hunter.districtId,
        currentNodeId: hunter.currentNodeId || null,
        targetNodeId: hunter.targetNodeId || null,
        focusNodeId: hunter.focusNodeId || null,
        patrolMode: hunter.patrolMode || 'patrol',
        detectionRadius: Number(hunter.detectionRadius) || 1,
        intensity: Number(hunter.intensity) || 0,
        heatFocus: Number(hunter.heatFocus) || 0,
        riskFocus: Number(hunter.riskFocus) || 0,
        active: hunter.active !== false,
        col: Number(hunter.col) || 0,
        row: Number(hunter.row) || 0,
        pathNodeIds: Array.isArray(hunter.pathNodeIds) ? hunter.pathNodeIds.slice(0, 5) : [],
        routeNodeIds: Array.isArray(hunter.routeNodeIds) ? hunter.routeNodeIds.slice(0, 4) : [],
        idleUntil: hunter.idleUntil || 0,
      })),
      hunterFields: this.world.hunterFields.map((field) => ({
        node_id: field.node_id,
        district_id: field.district_id,
        intensity: Number(field.intensity) || 0,
        patrol_mode: field.patrol_mode || 'patrol',
        hunter_ids: Array.isArray(field.hunter_ids) ? field.hunter_ids.slice(0, 4) : [],
        nearest_steps: Number(field.nearest_steps) || 0,
      })),
      districtPatrols: this.world.districtPatrols.map((plan) => ({
        districtId: plan.districtId,
        districtName: plan.districtName,
        patrolMode: plan.patrolMode || 'patrol',
        pressureScore: Number(plan.pressureScore) || 0,
        focusNodeId: plan.focusNodeId || null,
        focusNodeIds: Array.isArray(plan.focusNodeIds) ? plan.focusNodeIds.slice(0, 4) : [],
        hottestNodeId: plan.hottestNodeId || null,
        repeatedTargetNodeId: plan.repeatedTargetNodeId || null,
        activityWeight: Number(plan.activityWeight) || 0,
        instability: Number(plan.instability) || 0,
        watchLabel: plan.watchLabel || 'watched',
        postureState: plan.postureState || 'normal',
        postureScore: Number(plan.postureScore) || 0,
        postureTrend: plan.postureTrend || 'holding',
        warningLine: plan.warningLine || `${plan.districtName || plan.districtId} is operating on a normal surveillance cycle`,
        surveillanceTone: plan.surveillanceTone || 'nominal watch',
        localTraceCount: Number(plan.localTraceCount) || 0,
        routeDisruptionCount: Number(plan.routeDisruptionCount) || 0,
        nodeScanCount: Number(plan.nodeScanCount) || 0,
        covertPressureWeight: Number(plan.covertPressureWeight) || 0,
        activeHunters: Number(plan.activeHunters) || 0,
      })),
      controlNodes: this.world.controlNodes.map((node) => ({
        nodeId: node.id,
        districtId: node.districtId,
        nodeX: node.x,
        nodeY: node.y,
        nodeType: node.nodeType,
        interference: node.interference,
        status: node.status,
        control: node.control,
        owner: node.owner,
        warState: node.warState || 'patrolling',
        contestedBy: node.contestedBy || null,
        conflictLevel: node.conflictLevel || 0,
        recruitmentLevel: node.recruitmentLevel || 0,
        samInstability: node.samInstability || 0,
        cooldownUntil: node.cooldownUntil,
        pulseUntil: node.pulseUntil,
        sourcePlayerId: node.lastInterferedBy,
      })),
      links: this.world.links.map((link) => ({ from: link.from, to: link.to })),
      factions: this.world.factions,
      samPhase: this.world.samPhase,
      samPressure: this.world.samPressure,
    };
  }

  bootstrapSamHunters() {
    const seedPlans = buildDistrictPatrolPlans({
      districts: this.world.districts,
      controlNodes: this.world.controlNodes,
      activities: [],
      covertReports: this.world.covertDistrictReports,
      existingPlans: this.world.districtPatrols,
    });
    const queue = buildHunterAssignmentQueue(seedPlans, SAM_HUNTER_COUNT);
    const planByDistrict = new Map(seedPlans.map((plan) => [plan.districtId, plan]));
    this.world.samHunters = queue.map((districtId, index) => {
      const plan = planByDistrict.get(districtId) || seedPlans[index % Math.max(seedPlans.length, 1)];
      const nodeId = plan?.focusNodeId || this.world.controlNodes[index % this.world.controlNodes.length]?.id || '';
      const node = this.world.nodeLookup.get(nodeId) || this.world.controlNodes[index % this.world.controlNodes.length];
      return {
        id: `hunter-${index + 1}`,
        districtId: plan?.districtId || node?.districtId || 'signal-spire',
        currentNodeId: node?.id || '',
        targetNodeId: node?.id || '',
        focusNodeId: node?.id || '',
        patrolMode: 'patrol',
        detectionRadius: 1,
        intensity: 3,
        heatFocus: 0,
        riskFocus: 0,
        active: true,
        col: node?.x || 0,
        row: node?.y || 0,
        pathNodeIds: node?.id ? [node.id] : [],
        routeNodeIds: node?.id ? [node.id] : [],
        pathProgress: 0,
        idleUntil: 0,
      };
    });
    this.world.hunterFields = buildHunterDetectionFields({
      hunters: this.world.samHunters,
      controlNodes: this.world.controlNodes,
      shortestNodeDistance: (fromNodeId, toNodeId, maxDepth) => this.shortestNodeDistance(fromNodeId, toNodeId, maxDepth),
    });
    this.world.districtPatrols = seedPlans;
  }

  shortestNodeDistance(fromNodeId, toNodeId, maxDepth = 6) {
    if (!fromNodeId || !toNodeId) return Infinity;
    if (fromNodeId === toNodeId) return 0;
    const adjacency = this.world.linkAdjacency;
    if (!adjacency.has(fromNodeId) || !adjacency.has(toNodeId)) return Infinity;
    const queue = [{ nodeId: fromNodeId, depth: 0 }];
    const visited = new Set([fromNodeId]);
    while (queue.length) {
      const current = queue.shift();
      if (!current || current.depth >= maxDepth) continue;
      for (const neighborId of adjacency.get(current.nodeId) || []) {
        if (neighborId === toNodeId) return current.depth + 1;
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push({ nodeId: neighborId, depth: current.depth + 1 });
      }
    }
    return Infinity;
  }

  buildLinkAdjacency() {
    const adjacency = new Map();
    for (const node of this.world.controlNodes) {
      adjacency.set(node.id, []);
    }
    for (const link of this.world.links) {
      if (!adjacency.has(link.from) || !adjacency.has(link.to)) continue;
      adjacency.get(link.from).push(link.to);
      adjacency.get(link.to).push(link.from);
    }
    for (const [nodeId, neighbors] of adjacency.entries()) {
      neighbors.sort((a, b) => a.localeCompare(b));
      adjacency.set(nodeId, neighbors);
    }
    return adjacency;
  }

  findPath(fromNodeId, toNodeId) {
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return [fromNodeId].filter(Boolean);
    const adjacency = this.world.linkAdjacency;
    if (!adjacency.has(fromNodeId) || !adjacency.has(toNodeId)) return [];

    const queue = [fromNodeId];
    const visited = new Set([fromNodeId]);
    const prev = new Map();

    while (queue.length) {
      const current = queue.shift();
      if (current === toNodeId) break;
      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        prev.set(neighbor, current);
        queue.push(neighbor);
      }
    }

    if (!visited.has(toNodeId)) return [];
    const path = [toNodeId];
    let cursor = toNodeId;
    while (prev.has(cursor)) {
      cursor = prev.get(cursor);
      path.push(cursor);
    }
    return path.reverse();
  }

  emitSystemEvent(message) {
    if (this.systemEventsThisTick >= MAX_SYSTEM_EVENTS_PER_TICK) return;
    this.systemEventsThisTick += 1;
    this.broadcast('system', { message });
  }

  emitWarEvent(key, message, cooldownMs = 3000) {
    const now = Date.now();
    const nextAllowed = this.world.warEventCooldowns.get(key) || 0;
    if (nextAllowed > now) return;
    this.world.warEventCooldowns.set(key, now + cooldownMs);
    this.emitSystemEvent(message);
  }

  updateNPCs(dt) {
    const dtSeconds = dt / 1000;
    for (const npc of this.world.npcs) {
      npc.bobPhase += dtSeconds * npc.bobSpeed;
      if (!npc || npc.mode !== 'active') continue;

      npc.routeCooldownMs = Math.max(0, (npc.routeCooldownMs || 0) - dt);
      const currentNode = this.world.nodeLookup.get(npc.currentNode);
      if (!currentNode) continue;

      if (!npc.targetNode || npc.targetNode === npc.currentNode) {
        const neighbors = this.world.linkAdjacency.get(npc.currentNode) || [];
        if (neighbors.length) {
          const deterministicIndex = (this.worldTickCount + Number.parseInt(npc.id.split('-')[1], 10)) % neighbors.length;
          npc.targetNode = neighbors[deterministicIndex];
          npc.path = this.findPath(npc.currentNode, npc.targetNode).slice(1);
          this.emitSystemEvent(`🛰️ ${npc.name} rerouting to node ${npc.targetNode}`);
        }
      }

      if ((!npc.path || !npc.path.length) && npc.targetNode && npc.targetNode !== npc.currentNode) {
        npc.path = this.findPath(npc.currentNode, npc.targetNode).slice(1);
      }

      if (!npc.path?.length || npc.routeCooldownMs > 0) {
        npc.col = currentNode.x / 2.5;
        npc.row = currentNode.y / 2.5;
        this.applyNpcNodeInfluence(npc, currentNode, dtSeconds * 0.4);
        continue;
      }

      const nextNodeId = npc.path[0];
      const nextNode = this.world.nodeLookup.get(nextNodeId);
      if (!nextNode) {
        npc.path.shift();
        continue;
      }

      const targetCol = nextNode.x / 2.5;
      const targetRow = nextNode.y / 2.5;
      const stepRate = 2.2 * dtSeconds;
      const dx = targetCol - npc.col;
      const dy = targetRow - npc.row;
      const distance = Math.hypot(dx, dy);
      if (distance <= stepRate || distance < 0.001) {
        npc.col = targetCol;
        npc.row = targetRow;
        npc.currentNode = nextNodeId;
        npc.path.shift();
        npc.routeCooldownMs = 180;
        this.applyNpcNodeInfluence(npc, nextNode, 1.2);
        this.emitSystemEvent(`🚶 ${npc.name} reached ${nextNode.id} (${nextNode.districtId})`);
        if (!npc.path.length) {
          const districtPeers = this.world.controlNodes.filter(
            (node) => node.districtId === nextNode.districtId && node.id !== nextNode.id,
          );
          if (districtPeers.length) {
            const jitter = Math.floor(Math.random() * districtPeers.length);
            const pick = districtPeers[(this.worldTickCount + nextNode.id.length + jitter) % districtPeers.length];
            npc.targetNode = pick.id;
            npc.path = this.findPath(npc.currentNode, npc.targetNode).slice(1);
          }
        }
      } else {
        npc.col += (dx / distance) * stepRate;
        npc.row += (dy / distance) * stepRate;
      }
    }
  }

  buildNodePresence() {
    const byNode = new Map(this.world.controlNodes.map((node) => [node.id, {
      Liberators: 0,
      Wardens: 0,
      recruiterLiberators: 0,
      recruiterWardens: 0,
    }]));
    for (const npc of this.world.npcs) {
      if (!npc || npc.mode !== 'active' || !byNode.has(npc.currentNode)) continue;
      if (npc.faction !== 'Liberators' && npc.faction !== 'Wardens') continue;
      const slot = byNode.get(npc.currentNode);
      slot[npc.faction] += 1;
      if (npc.role === 'recruiter') {
        const recruiterKey = npc.faction === 'Liberators' ? 'recruiterLiberators' : 'recruiterWardens';
        slot[recruiterKey] += 1;
      }
    }
    return byNode;
  }

  buildPlayerWarPresence() {
    const nodePresence = new Map(this.world.controlNodes.map((node) => [node.id, { assist: 0, disrupt: 0, neutral: 0 }]));
    const districtPresence = new Map(this.world.districts.map((district) => [district.id, { assist: 0, disrupt: 0, neutral: 0 }]));
    for (const player of this.state.players.values()) {
      if (!player) continue;
      const stance = String(player.warStance || 'neutral');
      const districtSlot = districtPresence.get(player.currentDistrict);
      if (districtSlot) {
        if (stance === 'assist') districtSlot.assist += 1;
        else if (stance === 'disrupt') districtSlot.disrupt += 1;
        else districtSlot.neutral += 1;
      }
      for (const node of this.world.controlNodes) {
        const distance = Math.hypot(player.x - node.x, player.y - node.y);
        if (distance > PLAYER_NODE_SUPPORT_RADIUS) continue;
        const slot = nodePresence.get(node.id);
        if (!slot) continue;
        if (stance === 'assist') slot.assist += 1;
        else if (stance === 'disrupt') slot.disrupt += 1;
        else slot.neutral += 1;
      }
    }
    return { nodePresence, districtPresence };
  }

  getDistrictControlState(district) {
    const control = Number(district?.control || 50);
    const instability = Number(district?.instability || 0);
    const supportGap = (district?.support?.Liberators || 50) - (district?.support?.Wardens || 50);
    const owner = district?.owner || 'Contested';
    if ((owner === 'Liberators' || owner === 'Wardens') && control >= 85 && instability <= 28) return 'captured';
    if (instability >= 78 || (owner === 'Contested' && control >= 42 && control <= 58 && instability >= 62)) return 'collapsing';
    if (instability >= 56 || Math.abs(supportGap) <= 4) return 'unstable';
    if (owner === 'Contested' || (control > 35 && control < 65)) return 'contested';
    return 'secure';
  }

  applyDistrictStateConsequences(district, previousState = '') {
    district.controlState = this.getDistrictControlState(district);
    const ally = district.owner === 'Wardens' ? 'Wardens' : 'Liberators';
    district.alliedSupport = ally === 'Liberators' ? district.support?.Liberators || 50 : district.support?.Wardens || 50;
    district.hostilePresence = ally === 'Liberators' ? district.support?.Wardens || 50 : district.support?.Liberators || 50;

    if (district.controlState === 'secure') this.world.warSamPressureDelta -= 1.2;
    if (district.controlState === 'contested') this.world.warSamPressureDelta += 0.8;
    if (district.controlState === 'unstable') this.world.warSamPressureDelta += 1.8;
    if (district.controlState === 'collapsing') this.world.warSamPressureDelta += 3.2;
    if (district.controlState === 'captured') this.world.warSamPressureDelta -= 2.4;

    if (previousState && previousState !== district.controlState) {
      this.broadcast('districtControlStateChanged', {
        districtId: district.id,
        districtName: district.name,
        control: district.control,
        owner: district.owner,
        controlState: district.controlState,
        instability: district.instability,
        support: district.support,
        samPressure: this.world.samPressure,
      });
      if (district.controlState === 'captured') {
        this.emitWarEvent(`district-captured-state:${district.id}`, `🏴 ${district.name} locked into CAPTURED control under ${district.owner}`, 3200);
      } else if (district.controlState === 'collapsing') {
        this.emitWarEvent(`district-collapse-state:${district.id}`, `🕳️ ${district.name} is COLLAPSING · SAM vectors widening`, 3200);
      } else {
        this.emitWarEvent(`district-state:${district.id}:${district.controlState}`, `🗺️ ${district.name} shifted to ${district.controlState.toUpperCase()} state`, 2800);
      }
    }
  }

  applyPlayerWarImpact({
    playerId,
    districtId,
    nodeId,
    intent = 'disrupt',
    intensity = 6,
    source = 'interfere',
  }) {
    const player = playerId ? this.state.players.get(playerId) : null;
    const district = this.world.districts.find((entry) => entry.id === districtId) || this.world.districts.find((entry) => entry.id === player?.currentDistrict);
    let node = nodeId ? this.world.nodeLookup.get(nodeId) : null;
    if (!node && player) {
      const nearest = this.world.controlNodes
        .map((entry) => ({ entry, d: Math.hypot(player.x - entry.x, player.y - entry.y) }))
        .sort((a, b) => a.d - b.d)[0];
      node = nearest?.d <= PLAYER_NODE_SUPPORT_RADIUS * 1.6 ? nearest.entry : null;
    }
    if (!district || !node) return null;

    const signedIntent = intent === 'assist' ? 1 : intent === 'disrupt' ? -1 : 0;
    const clampedIntensity = Math.max(1, Math.min(18, Number(intensity) || 6));
    node.conflictLevel = Math.max(0, Math.min(100, node.conflictLevel + (Math.abs(signedIntent) * clampedIntensity * 0.7)));
    node.interference = Math.max(0, Math.min(100, node.interference + (signedIntent < 0 ? clampedIntensity * 0.9 : clampedIntensity * 0.35)));
    node.samInstability = Math.max(0, Math.min(100, node.samInstability + (signedIntent < 0 ? clampedIntensity * 0.7 : -clampedIntensity * 0.28)));
    node.control = Math.max(-100, Math.min(100, node.control + (signedIntent * clampedIntensity * 1.15)));
    if (signedIntent !== 0) node.warState = signedIntent > 0 ? 'reinforcing' : 'contesting';

    const supportShift = clampedIntensity * 0.45;
    if (signedIntent > 0) {
      district.support.Liberators = Math.max(0, Math.min(100, (district.support.Liberators || 50) + supportShift));
      district.support.Wardens = Math.max(0, Math.min(100, (district.support.Wardens || 50) - (supportShift * 0.5)));
    } else if (signedIntent < 0) {
      district.support.Wardens = Math.max(0, Math.min(100, (district.support.Wardens || 50) + supportShift));
      district.support.Liberators = Math.max(0, Math.min(100, (district.support.Liberators || 50) - (supportShift * 0.5)));
    }

    this.world.samPressure = Math.max(0, Math.min(140, this.world.samPressure + (signedIntent < 0 ? clampedIntensity * 0.55 : -clampedIntensity * 0.32)));
    this.world.playerInterferenceSpike = Math.max(0, this.world.playerInterferenceSpike + (signedIntent < 0 ? clampedIntensity : clampedIntensity * 0.4));

    this.broadcast('playerWarImpact', {
      source,
      playerId: playerId || '',
      districtId: district.id,
      districtName: district.name,
      nodeId: node.id,
      intent,
      controlState: district.controlState || this.getDistrictControlState(district),
      intensity: clampedIntensity,
      nodeControl: node.control,
      nodeConflictLevel: node.conflictLevel,
      samPressure: this.world.samPressure,
    });

    this.emitWarEvent(`player-impact:${district.id}:${intent}:${source}`, `🧑‍🚀 Player ${intent} action at ${node.id} shifted ${district.name} pressure`, 2200);
    return { district, node };
  }

  updateWarLayer(dt) {
    this.world.warTickMs += dt;
    if (this.world.warTickMs < WAR_TICK_INTERVAL_MS) return;
    const warDt = this.world.warTickMs / 1000;
    this.world.warTickMs = 0;
    const presence = this.buildNodePresence();
    const playerPresence = this.buildPlayerWarPresence();
    const districtWar = new Map(this.world.districts.map((district) => [district.id, {
      conflict: 0,
      liberatorPressure: 0,
      wardenPressure: 0,
      samPressure: 0,
    }]));

    for (const node of this.world.controlNodes) {
      const slot = presence.get(node.id) || {};
      const lCount = slot.Liberators || 0;
      const wCount = slot.Wardens || 0;
      const district = this.world.districts.find((entry) => entry.id === node.districtId);
      const districtStats = districtWar.get(node.districtId);
      const pressureGap = lCount - wCount;
      const totalPressure = lCount + wCount;
      const playerNodePressure = playerPresence.nodePresence.get(node.id) || { assist: 0, disrupt: 0, neutral: 0 };
      const playerDistrictPressure = playerPresence.districtPresence.get(node.districtId) || { assist: 0, disrupt: 0, neutral: 0 };
      const playerGap = (playerNodePressure.assist - playerNodePressure.disrupt)
        + ((playerDistrictPressure.assist - playerDistrictPressure.disrupt) * 0.65);
      const nodeIsContested = lCount > 0 && wCount > 0;
      const previousState = node.warState || 'patrolling';
      node.contestedBy = nodeIsContested ? 'Both' : pressureGap > 0 ? 'Liberators' : pressureGap < 0 ? 'Wardens' : null;

      if (nodeIsContested) {
        node.warState = Math.abs(pressureGap) <= 1 ? 'fighting' : 'contesting';
        node.conflictLevel = Math.min(100, (node.conflictLevel || 0) + ((2 + totalPressure) * warDt * 4));
        node.status = node.status === 'unstable' ? node.status : 'contested';
        node.interference = Math.min(100, node.interference + (totalPressure * 0.35));
        districtStats.conflict += node.conflictLevel;
        this.emitWarEvent(`clash:${node.id}`, `⚔️ Faction clash at ${node.id} (${node.districtId})`);
      } else {
        node.conflictLevel = Math.max(0, (node.conflictLevel || 0) - (NODE_CONFLICT_DECAY * warDt * 4));
      }

      if (pressureGap > 0) {
        node.control = Math.min(100, node.control + (pressureGap * warDt * 5));
        districtStats.liberatorPressure += pressureGap;
      } else if (pressureGap < 0) {
        node.control = Math.max(-100, node.control + (pressureGap * warDt * 5));
        districtStats.wardenPressure += Math.abs(pressureGap);
      }
      if (playerGap !== 0) {
        node.control = Math.max(-100, Math.min(100, node.control + (playerGap * PLAYER_NODE_SUPPORT_TICK * warDt)));
        if (playerGap > 0) districtStats.liberatorPressure += Math.abs(playerGap) * PLAYER_DISTRICT_SUPPORT_TICK;
        else districtStats.wardenPressure += Math.abs(playerGap) * PLAYER_DISTRICT_SUPPORT_TICK;
        node.conflictLevel = Math.max(0, Math.min(100, node.conflictLevel + (Math.abs(playerGap) * 0.85)));
      }

      const recruiterCount = (slot.recruiterLiberators || 0) + (slot.recruiterWardens || 0);
      if (recruiterCount > 0 && district) {
        const lRecruit = slot.recruiterLiberators || 0;
        const wRecruit = slot.recruiterWardens || 0;
        const samPenalty = (this.world.samPressure / 100) * RECRUITMENT_SAM_SUPPRESSION;
        const districtSupport = district.support || { Liberators: 50, Wardens: 50 };
        const deltaLiberators = Math.max(0, (lRecruit * RECRUITMENT_SUPPORT_GAIN) - samPenalty);
        const deltaWardens = Math.max(0, (wRecruit * RECRUITMENT_SUPPORT_GAIN) - samPenalty);
        districtSupport.Liberators = Math.max(0, Math.min(100, districtSupport.Liberators + deltaLiberators - (deltaWardens * 0.4)));
        districtSupport.Wardens = Math.max(0, Math.min(100, districtSupport.Wardens + deltaWardens - (deltaLiberators * 0.4)));
        district.support = districtSupport;
        node.recruitmentLevel = Math.max(0, Math.min(100, (node.recruitmentLevel || 0) + ((deltaLiberators + deltaWardens) * RECRUITMENT_NODE_BOOST)));
        if (deltaLiberators > 0 || deltaWardens > 0) {
          const recruitedFaction = deltaLiberators >= deltaWardens ? 'Liberators' : 'Wardens';
          this.emitWarEvent(
            `recruit:${node.id}:${recruitedFaction}`,
            `🗣️ Recruiter secured support at ${district.name} for ${recruitedFaction}`,
            4200,
          );
        } else {
          this.emitWarEvent(`recruit-blocked:${node.id}`, `🧱 SAM pressure disrupted recruitment at ${node.id}`, 5000);
        }
      } else {
        node.recruitmentLevel = Math.max(0, (node.recruitmentLevel || 0) - (warDt * 5));
      }

      const nodeSamPush = ((node.conflictLevel || 0) * 0.01) + ((node.interference || 0) * 0.02);
      node.samInstability = Math.max(0, Math.min(100, (node.samInstability || 0) + nodeSamPush - (warDt * 2)));
      if (node.samInstability >= 45) {
        districtStats.samPressure += 1;
      }

      if (Math.abs(node.control) >= WAR_COMBAT_THRESHOLD && node.conflictLevel >= WAR_COMBAT_THRESHOLD) {
        node.warState = 'fighting';
      } else if (node.recruitmentLevel >= REINFORCEMENT_THRESHOLD) {
        node.warState = 'reinforcing';
      } else if ((node.conflictLevel || 0) >= WAR_CONTEST_THRESHOLD) {
        node.warState = 'contesting';
      } else if ((node.samInstability || 0) >= 50) {
        node.warState = 'retreating';
      } else {
        node.warState = 'patrolling';
      }

      if (previousState !== node.warState && node.warState === 'reinforcing') {
        this.emitWarEvent(`reinforce:${node.id}`, `🚚 Reinforcement convoy arrived at ${node.id}`);
      }
      if (previousState !== node.warState && node.warState === 'retreating') {
        this.emitWarEvent(`retreat:${node.id}`, `🏃 Units retreating from ${node.id} under SAM pressure`);
      }
    }

    for (const npc of this.world.npcs) {
      if (!npc || npc.mode !== 'active') continue;
      const node = this.world.nodeLookup.get(npc.currentNode);
      if (!node) continue;
      npc.combatState = node.warState || 'patrolling';
      const factionBoost = node.contestedBy === npc.faction ? 1.4 : 0.65;
      npc.reinforceCharge = Math.max(0, Math.min(16, (npc.reinforceCharge || 0) + (npc.recruitPower * factionBoost * warDt)));
      if (npc.reinforceCharge >= REINFORCEMENT_THRESHOLD && (node.warState === 'contesting' || node.warState === 'fighting')) {
        const bonus = npc.faction === 'Liberators' ? 3 : -3;
        node.control = Math.max(-100, Math.min(100, node.control + bonus));
        npc.reinforceCharge = 0;
      }
    }

    let samDelta = 0;
    for (const district of this.world.districts) {
      const previousState = district.controlState || 'contested';
      const stats = districtWar.get(district.id) || {};
      const netPressure = (stats.liberatorPressure || 0) - (stats.wardenPressure || 0);
      const conflictWeight = (stats.conflict || 0) * 0.004;
      const supportGap = (district.support?.Liberators || 50) - (district.support?.Wardens || 50);
      district.pressure = {
        Liberators: Number((stats.liberatorPressure || 0).toFixed(2)),
        Wardens: Number((stats.wardenPressure || 0).toFixed(2)),
        neutral: Number((stats.conflict || 0).toFixed(2)),
      };
      district.instability = Math.max(
        0,
        Math.min(
          100,
          (district.instability || 0)
            + conflictWeight * DISTRICT_INSTABILITY_CONFLICT_GAIN
            + (stats.samPressure || 0) * DISTRICT_INSTABILITY_SAM_GAIN
            - DISTRICT_INSTABILITY_DECAY,
        ),
      );
      district.control = Math.max(
        0,
        Math.min(100, district.control + (netPressure * 0.5) + (supportGap * 0.06) - ((district.instability - 30) * 0.03)),
      );

      if (district.control >= DISTRICT_CAPTURE_THRESHOLD) district.owner = 'Liberators';
      else if (district.control <= (100 - DISTRICT_CAPTURE_THRESHOLD)) district.owner = 'Wardens';
      else district.owner = 'Contested';
      this.applyDistrictStateConsequences(district, previousState);

      if (district.owner === 'Contested' && district.instability >= 68) {
        samDelta += 2.4;
        this.emitWarEvent(`district-collapse:${district.id}`, `🌪️ ${district.name} stability collapsing under active conflict`, 4500);
      } else if (district.owner !== 'Contested' && district.instability <= 26) {
        samDelta -= 1.6;
        this.emitWarEvent(`district-hold:${district.id}:${district.owner}`, `🛡️ ${district.name} stabilizing under ${district.owner}`, 4500);
      }
    }

    this.world.warSamPressureDelta = Math.max(-SAM_WAR_IMPACT_CLAMP, Math.min(SAM_WAR_IMPACT_CLAMP, samDelta));
  }

  updateDistricts() {
    if (this.districtTimerMs < DISTRICT_DRIFT_INTERVAL_MS) return;
    this.districtTimerMs = 0;

    const districtNodeTotals = new Map(this.world.districts.map((district) => [district.id, 0]));
    const districtNodeCounts = new Map(this.world.districts.map((district) => [district.id, 0]));

    for (const node of this.world.controlNodes) {
      if (!districtNodeTotals.has(node.districtId)) continue;
      districtNodeTotals.set(node.districtId, districtNodeTotals.get(node.districtId) + node.control);
      districtNodeCounts.set(node.districtId, districtNodeCounts.get(node.districtId) + 1);
    }

    for (const district of this.world.districts) {
      const previousOwner = district.owner;
      const previousState = district.controlState || 'contested';
      const count = districtNodeCounts.get(district.id) || 1;
      const sum = districtNodeTotals.get(district.id) || 0;
      const normalized = Math.max(-100, Math.min(100, sum / count));
      const instabilityPenalty = ((district.instability || 0) - 35) * 0.12;
      const supportGap = (district.support?.Liberators || 50) - (district.support?.Wardens || 50);
      district.control = Math.max(0, Math.min(100, 50 + normalized + (supportGap * 0.14) - instabilityPenalty));
      if (district.control >= DISTRICT_CAPTURE_THRESHOLD) {
        district.owner = 'Liberators';
      } else if (district.control <= (100 - DISTRICT_CAPTURE_THRESHOLD)) {
        district.owner = 'Wardens';
      } else {
        district.owner = 'Contested';
      }
      this.applyDistrictStateConsequences(district, previousState);
      if (previousOwner !== district.owner) {
        if (district.owner === 'Liberators' || district.owner === 'Wardens') {
          this.emitWarEvent(`district-flip:${district.id}:${district.owner}`, `🏳️ ${district.name} fell to ${district.owner}`, 3000);
        } else {
          this.emitWarEvent(`district-contested:${district.id}`, `⚠️ ${district.name} is now contested`, 3000);
        }
      }
    }
  }

  updateSAM() {
    if (this.samTimerMs < SAM_STATE_INTERVAL_MS) return;
    this.samTimerMs = 0;
    const factionGap = Math.abs((this.world.factions.Liberators?.strength || 0) - (this.world.factions.Wardens?.strength || 0));
    const unstablePressure = this.world.unstableNodeCount * 1.9;
    const interferencePressure = this.world.playerInterferenceSpike * 0.6;
    const factionPressure = factionGap * 0.35;
    const warPressure = this.world.warSamPressureDelta || 0;
    const pressureRise = unstablePressure + interferencePressure + factionPressure + warPressure;
    const pressureDecay = 4;
    this.world.samPressure = Math.max(0, Math.min(140, this.world.samPressure + pressureRise - pressureDecay));
    this.world.playerInterferenceSpike = Math.max(0, this.world.playerInterferenceSpike - 4);
    this.world.warSamPressureDelta = 0;

    if (pressureRise >= 14) {
      this.emitSystemEvent(`🚨 SAM pressure spike detected (+${Math.round(pressureRise)})`);
    } else if (warPressure <= -3) {
      this.emitWarEvent('sam-suppressed', '🧯 Coordinated faction defense suppressed local SAM spread', 4000);
    }

    if (this.world.samPressure >= SAM_PRESSURE_PHASE_THRESHOLD) {
      this.world.samPressure = SAM_PRESSURE_RESET_FLOOR;
      this.world.samPhase = (this.world.samPhase + 1) % 4;
      this.broadcast('samPhaseChanged', { phaseIndex: this.world.samPhase });
      this.emitSystemEvent(`🧠 SAM phase shift triggered by world pressure (phase ${this.world.samPhase})`);
    }
  }

  recordHunterActivity({ districtId = '', nodeId = '', type = 'pressure', weight = 1 }) {
    this.world.hunterActivities.push({
      at: Date.now(),
      districtId,
      nodeId,
      type,
      weight: Math.max(0.5, Number(weight) || 1),
    });
    this.world.hunterActivities = trimHunterActivities(this.world.hunterActivities);
  }

  trimCovertDistrictReports(nowMs = Date.now()) {
    const trimmed = (this.world.covertDistrictReports || []).filter((entry) => (
      entry
      && entry.districtId
      && (nowMs - Number(entry.reportedAt || 0)) <= COVERT_DISTRICT_REPORT_TTL_MS
    ));
    this.world.covertDistrictReports = trimmed;
    return trimmed;
  }

  updateSamHunters(dt) {
    if (this.hunterTimerMs < HUNTER_UPDATE_INTERVAL_MS) return;
    const elapsedMs = this.hunterTimerMs;
    this.hunterTimerMs = 0;
    this.world.hunterActivities = trimHunterActivities(this.world.hunterActivities);
    this.trimCovertDistrictReports();
    const patrolPlans = buildDistrictPatrolPlans({
      districts: this.world.districts,
      controlNodes: this.world.controlNodes,
      activities: this.world.hunterActivities,
      covertReports: this.world.covertDistrictReports,
      existingPlans: this.world.districtPatrols,
    });
    const planByDistrict = new Map(patrolPlans.map((plan) => [plan.districtId, { ...plan }]));
    const assignmentQueue = buildHunterAssignmentQueue(patrolPlans, this.world.samHunters.length);
    const assignedNodes = new Map();

    for (let index = 0; index < this.world.samHunters.length; index += 1) {
      const hunter = this.world.samHunters[index];
      const districtId = assignmentQueue[index] || patrolPlans[index % Math.max(patrolPlans.length, 1)]?.districtId || hunter.districtId;
      const plan = planByDistrict.get(districtId) || patrolPlans[0];
      if (!plan) continue;
      const pickedSet = assignedNodes.get(districtId) || new Set();
      const focusNodeId = (plan.focusNodeIds || []).find((nodeId) => !pickedSet.has(nodeId))
        || plan.focusNodeId
        || hunter.currentNodeId;
      pickedSet.add(focusNodeId);
      assignedNodes.set(districtId, pickedSet);

      const modeConfig = HUNTER_MODE_CONFIG[plan.patrolMode] || HUNTER_MODE_CONFIG.patrol;
      const nextPath = this.findPath(hunter.currentNodeId || focusNodeId, focusNodeId);
      if (focusNodeId && focusNodeId !== hunter.targetNodeId) {
        hunter.targetNodeId = focusNodeId;
        hunter.pathNodeIds = nextPath.length ? nextPath : [focusNodeId];
        hunter.pathProgress = 0;
      } else if (!Array.isArray(hunter.pathNodeIds) || !hunter.pathNodeIds.length) {
        hunter.pathNodeIds = nextPath.length ? nextPath : [focusNodeId];
      }

      hunter.districtId = districtId;
      hunter.focusNodeId = focusNodeId;
      hunter.patrolMode = plan.patrolMode;
      hunter.detectionRadius = modeConfig.detectionRadius;
      hunter.intensity = clamp(
        modeConfig.intensity + Math.round((Number(plan.pressureScore) || 0) / 24),
        1,
        9,
      );
      hunter.heatFocus = clamp(Number(plan.activityWeight) || 0, 0, 20);
      hunter.riskFocus = clamp(Number(plan.pressureScore) || 0, 0, 100);
      hunter.active = true;
      hunter.routeNodeIds = Array.isArray(hunter.pathNodeIds) ? hunter.pathNodeIds.slice(0, 4) : [focusNodeId];

      const now = Date.now();
      if ((hunter.idleUntil || 0) > now && (hunter.pathNodeIds?.length || 0) <= 1) {
        const anchorNode = this.world.nodeLookup.get(hunter.currentNodeId || focusNodeId);
        if (anchorNode) {
          hunter.col = anchorNode.x;
          hunter.row = anchorNode.y;
        }
        plan.activeHunters += 1;
        continue;
      }

      const pathNodeIds = Array.isArray(hunter.pathNodeIds) ? hunter.pathNodeIds : [];
      if (pathNodeIds.length >= 2) {
        const fromNode = this.world.nodeLookup.get(pathNodeIds[0]);
        const toNode = this.world.nodeLookup.get(pathNodeIds[1]);
        if (fromNode && toNode) {
          hunter.pathProgress = Math.min(1, (Number(hunter.pathProgress) || 0) + ((elapsedMs / 1000) * modeConfig.moveSpeed));
          hunter.col = fromNode.x + ((toNode.x - fromNode.x) * hunter.pathProgress);
          hunter.row = fromNode.y + ((toNode.y - fromNode.y) * hunter.pathProgress);
          hunter.currentNodeId = fromNode.id;
          if (hunter.pathProgress >= 0.995) {
            hunter.pathNodeIds = pathNodeIds.slice(1);
            hunter.currentNodeId = toNode.id;
            hunter.pathProgress = 0;
            if ((hunter.pathNodeIds?.length || 0) <= 1) {
              hunter.idleUntil = now + modeConfig.idleMs;
            }
          }
        }
      } else {
        const anchorNode = this.world.nodeLookup.get(hunter.currentNodeId || focusNodeId);
        if (anchorNode) {
          hunter.currentNodeId = anchorNode.id;
          hunter.col = anchorNode.x;
          hunter.row = anchorNode.y;
        }
        hunter.idleUntil = now + modeConfig.idleMs;
      }
      plan.activeHunters += 1;
    }

    this.world.districtPatrols = patrolPlans.map((plan) => ({
      ...plan,
      activeHunters: planByDistrict.get(plan.districtId)?.activeHunters || 0,
    }));
    this.world.hunterFields = buildHunterDetectionFields({
      hunters: this.world.samHunters,
      controlNodes: this.world.controlNodes,
      shortestNodeDistance: (fromNodeId, toNodeId, maxDepth) => this.shortestNodeDistance(fromNodeId, toNodeId, maxDepth),
    });
  }

  updateNodeInterference() {
    const now = Date.now();
    let unstableCount = 0;
    for (const node of this.world.controlNodes) {
      if (!node) continue;
      if (node.cooldownUntil > now) {
        if (node.pulseUntil <= now && node.status !== 'cooldown') {
          node.status = 'cooldown';
        }
        continue;
      }
      if (node.status !== 'stable') {
        node.status = 'stable';
      }
      node.pulseUntil = 0;
      node.interference = Math.max(0, node.interference - NODE_INTERFERENCE_DECAY);
      node.samInstability = Math.max(0, (node.samInstability || 0) - 1.3);
      node.recruitmentLevel = Math.max(0, (node.recruitmentLevel || 0) - 0.8);
      if (node.interference >= NODE_UNSTABLE_THRESHOLD) {
        unstableCount += 1;
      }
      if ((node.conflictLevel || 0) <= 0 && node.status === 'stable') {
        node.warState = 'patrolling';
      }
      if (node.interference === 0 && Math.abs(node.control) < 5) {
        node.owner = null;
        node.lastInterferedBy = null;
      }
    }
    this.world.unstableNodeCount = unstableCount;
  }

  applyNpcNodeInfluence(npc, node, amount = 0.5) {
    if (!npc || !node || npc.faction === 'Neutral') return;
    const direction = npc.faction === 'Liberators' ? 1 : -1;
    const previousOwner = node.owner;
    node.control = Math.max(-100, Math.min(100, node.control + (direction * amount)));
    if (node.control >= 15) {
      node.owner = 'Liberators';
    } else if (node.control <= -15) {
      node.owner = 'Wardens';
    }
    if (node.owner && node.owner !== previousOwner) {
      this.emitSystemEvent(`🏳️ ${node.id} captured by ${node.owner}`);
    } else if (!node.owner && previousOwner) {
      this.emitSystemEvent(`⚠️ ${node.id} lost by ${previousOwner}`);
    }
  }

  updateFactionState() {
    let liberatorNodes = 0;
    let wardenNodes = 0;
    let liberatorRecruitment = 0;
    let wardenRecruitment = 0;
    let contestedNodes = 0;
    for (const node of this.world.controlNodes) {
      if (node.owner === 'Liberators') liberatorNodes += 1;
      if (node.owner === 'Wardens') wardenNodes += 1;
      if (node.contestedBy === 'Both') contestedNodes += 1;
      if ((node.contestedBy === 'Liberators' || node.owner === 'Liberators') && (node.recruitmentLevel || 0) > 0) {
        liberatorRecruitment += node.recruitmentLevel;
      }
      if ((node.contestedBy === 'Wardens' || node.owner === 'Wardens') && (node.recruitmentLevel || 0) > 0) {
        wardenRecruitment += node.recruitmentLevel;
      }
    }
    const nodeDelta = liberatorNodes - wardenNodes;
    const recruitmentDelta = (liberatorRecruitment - wardenRecruitment) * 0.04;
    this.world.factions.Liberators.strength = Math.max(0, Math.min(100, 50 + nodeDelta + recruitmentDelta));
    this.world.factions.Wardens.strength = Math.max(0, Math.min(100, 50 - nodeDelta - recruitmentDelta));
    this.world.factions.Liberators.recruitment = Math.round(liberatorRecruitment);
    this.world.factions.Wardens.recruitment = Math.round(wardenRecruitment);
    this.world.factions.Liberators.warMomentum = Math.round((liberatorNodes * 2) + recruitmentDelta - contestedNodes);
    this.world.factions.Wardens.warMomentum = Math.round((wardenNodes * 2) - recruitmentDelta - contestedNodes);
    this.world.factions.Liberators.pressure = Math.round(Math.max(0, Math.min(100, 50 + nodeDelta - this.world.samPressure * 0.2)));
    this.world.factions.Wardens.pressure = Math.round(Math.max(0, Math.min(100, 50 - nodeDelta - this.world.samPressure * 0.2)));
    if (Math.abs(liberatorNodes - wardenNodes) >= 8 && this.worldTickCount % 20 === 0) {
      const leadingFaction = liberatorNodes > wardenNodes ? 'Liberators' : 'Wardens';
      this.emitSystemEvent(`⚔️ Faction clash escalates · ${leadingFaction} pressing advantage`);
    }
  }

  handleNodeInterference(client, data) {
    const nodeId = String(data?.nodeId || '').toLowerCase();
    if (!nodeId) return;
    const now = Date.now();
    const node = this.world.controlNodes.find((entry) => entry.id === nodeId);
    if (!node) return;
    if (node.cooldownUntil > now) return;

    const intent = String(data?.intent || 'disrupt').toLowerCase() === 'assist' ? 'assist' : 'disrupt';
    this.recordHunterActivity({
      districtId: node.districtId,
      nodeId: node.id,
      type: intent === 'assist' ? 'stabilize' : 'interference',
      weight: intent === 'assist' ? 0.8 : 1.6,
    });
    const impact = this.applyPlayerWarImpact({
      playerId: client.sessionId,
      districtId: node.districtId,
      nodeId: node.id,
      intent,
      intensity: PLAYER_WAR_ACTION_IMPACT.interfere,
      source: 'interference',
    });

    node.interference = Math.max(0, Math.min(100, node.interference + NODE_INTERFERENCE_GAIN));
    node.control = Math.max(-100, Math.min(100, node.control - NODE_DISTRICT_SHIFT));
    node.lastInterferedBy = client.sessionId;
    node.pulseUntil = now + NODE_PULSE_DURATION_MS;
    node.cooldownUntil = now + NODE_COOLDOWN_MS;
    node.status = node.interference >= NODE_UNSTABLE_THRESHOLD ? 'unstable' : 'contested';
    node.warState = node.status === 'unstable' ? 'retreating' : 'contesting';
    node.conflictLevel = Math.max(node.conflictLevel || 0, 22);
    node.samInstability = Math.max(node.samInstability || 0, 30);
    if (node.interference >= NODE_UNSTABLE_THRESHOLD) {
      node.owner = 'UNSTABLE';
    }
    this.world.playerInterferenceSpike = Math.max(0, this.world.playerInterferenceSpike + NODE_INTERFERENCE_GAIN);

    const district = impact?.district || this.world.districts.find((entry) => entry.id === node.districtId);
    if (!district) return;

    const samPressureDelta = SAM_PRESSURE_FROM_INTERFERENCE;
    this.world.samPressure = Math.max(0, Math.min(140, this.world.samPressure + samPressureDelta));

    this.broadcast('nodeInterferenceChanged', {
      nodeId: node.id,
      districtId: node.districtId,
      nodeX: node.x,
      nodeY: node.y,
      interference: node.interference,
      status: node.status,
      control: node.control,
      owner: node.owner,
      warState: node.warState,
      conflictLevel: node.conflictLevel,
      recruitmentLevel: node.recruitmentLevel,
      contestedBy: node.contestedBy,
      samInstability: node.samInstability,
      cooldownUntil: node.cooldownUntil,
      pulseUntil: node.pulseUntil,
      sourcePlayerId: client.sessionId,
      districtControl: district.control,
      districtOwner: district.owner,
      districtControlState: district.controlState || 'contested',
      districtInstability: district.instability || 0,
      samPressureDelta,
      samPressure: this.world.samPressure,
    });

    this.emitSystemEvent(`⚡ NODE ${node.id.toUpperCase()} INTERFERED · ${district.name} pressure shifting`);
    this.emitSystemEvent(`🧷 Recruitment pulse spotted near ${node.id}`);
  }

  onJoin(client, options) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = options?.name || 'Rebel';
    player.x = 50;
    player.y = 50;
    player.xp = 0;
    player.warStance = 'neutral';

    this.state.players.set(client.sessionId, player);
    this.completedQuests.set(client.sessionId, new Set());

    this.handleDistrictChange(client.sessionId, player);
    client.send('worldSnapshot', this.buildLeanSnapshot());

    const playerCount = this.state.players.size;
    console.log(`[CityRoom] ${player.name} joined · players: ${playerCount}/${this.maxClients}`);
    this.broadcast('system', {
      message: `${player.name} has entered Block Topia.`,
    });
  }

  onLeave(client) {
    const endedDuel = this.duels?.onPlayerLeave?.(client.sessionId);
    if (endedDuel) {
      this.broadcast('duelEnded', {
        duelId: endedDuel.duelId,
        status: 'ended',
        message: 'Duel ended: participant disconnected.',
      });
    }
    this.state.players.delete(client.sessionId);
    this.completedQuests.delete(client.sessionId);

    const playerCount = this.state.players.size;
    console.log(`[CityRoom] Player left · players: ${playerCount}/${this.maxClients}`);
    this.broadcast('system', {
      message: `A rebel has left the city.`,
    });
  }

  handleDistrictChange(sessionId, player) {
    const district = getDistrictForPosition(player.x, player.y);
    const districtId = district?.id || '';

    if (player.currentDistrict !== districtId) {
      player.currentDistrict = districtId;

      this.broadcast('districtChanged',
        createDistrictPayload(sessionId, district)
      );
    }
  }

  handleQuestProgress(sessionId, player) {
    const completed = this.completedQuests.get(sessionId);
    const newlyCompleted = checkAndCompleteQuests(player, completed);

    for (const quest of newlyCompleted) {
      this.broadcast('questCompleted', {
        playerId: sessionId,
        questId: quest.id,
        title: quest.title,
        rewardXp: quest.rewardXp,
        totalXp: player.xp,
      });
    }
  }

  handlePlayerWarAction(client, data) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const actionType = String(data?.actionType || '').toLowerCase();
    const intent = String(data?.intent || '').toLowerCase() === 'assist' ? 'assist' : 'disrupt';
    const districtId = String(data?.districtId || player.currentDistrict || '');
    const nodeId = String(data?.nodeId || '').toLowerCase();
    const baseImpact = PLAYER_WAR_ACTION_IMPACT[actionType] || 5;
    const result = this.applyPlayerWarImpact({
      playerId: client.sessionId,
      districtId,
      nodeId,
      intent,
      intensity: baseImpact,
      source: actionType || 'player_action',
    });
    if (!result) return;
    this.recordHunterActivity({
      districtId,
      nodeId,
      type: actionType || 'player_action',
      weight: intent === 'assist' ? Math.max(0.75, baseImpact / 8) : Math.max(1, baseImpact / 5),
    });
    player.warStance = intent;

    const district = result.district;
    this.broadcast('districtCaptureChanged', {
      districtId: district.id,
      control: district.control,
      owner: district.owner,
      controlState: district.controlState,
      instability: district.instability,
      support: district.support,
    });

    this.emitWarEvent(
      `player-war-action:${district.id}:${actionType}:${intent}`,
      `🎯 ${player.name} ${intent === 'assist' ? 'stabilized' : 'destabilized'} ${district.name} via ${actionType || 'operation'}`,
      1500,
    );
  }

  handleCovertPressureSync(client, data) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const reports = Array.isArray(data?.reports) ? data.reports.slice(0, 4) : [];
    if (!reports.length) return;
    const now = Date.now();
    this.trimCovertDistrictReports(now);

    for (const report of reports) {
      const districtId = String(report?.districtId || '').trim();
      if (!districtId || !WORLD_DISTRICTS.some((entry) => entry.id === districtId)) continue;
      this.world.covertDistrictReports = this.world.covertDistrictReports.filter(
        (entry) => !(entry?.playerId === client.sessionId && entry?.districtId === districtId),
      );
      this.world.covertDistrictReports.push({
        playerId: client.sessionId,
        playerName: player.name,
        districtId,
        reportedAt: now,
        pressureWeight: Math.max(0, Number(report?.pressureWeight) || 0),
        repeatedPressure: Math.max(0, Number(report?.repeatedPressure) || 0),
        localTraceCount: Math.max(0, Number(report?.localTraceCount) || 0),
        routeDisruptionCount: Math.max(0, Number(report?.routeDisruptionCount) || 0),
        nodeScanCount: Math.max(0, Number(report?.nodeScanCount) || 0),
        hunterPressure: Math.max(0, Number(report?.hunterPressure) || 0),
        networkHeat: Math.max(0, Number(report?.networkHeat) || 0),
        samAwareness: Math.max(0, Number(report?.samAwareness) || 0),
        districtInstability: Math.max(0, Number(report?.districtInstability) || 0),
      });
    }
  }

  onDispose() {
    console.log('🗑️ CityRoom disposed');
  }

  handleDuelChallenge(client, data) {
    const targetPlayerId = String(data?.targetPlayerId || '');
    const challengerId = client.sessionId;
    const challenger = this.state.players.get(challengerId);
    const target = this.state.players.get(targetPlayerId);
    if (!challenger || !target) return;

    const result = this.duels.createChallenge(challengerId, targetPlayerId);
    if (result?.error) {
      client.send('system', { message: `Duel request rejected (${result.error})` });
      return;
    }
    const duel = result.duel;
    this.broadcast('duelRequested', {
      duelId: duel.duelId,
      playerA: duel.playerA,
      playerB: duel.playerB,
      playerAName: duel.playerAName,
      playerBName: duel.playerBName,
      challengerName: duel.playerAName,
      defenderName: duel.playerBName,
      status: duel.status,
      message: `${duel.playerAName} challenged ${duel.playerBName}.`,
    });
  }

  handleDuelAccept(client, data) {
    const duelId = String(data?.duelId || '');
    if (!duelId) return;
    const result = this.duels.acceptChallenge(client.sessionId, duelId);
    if (result?.error) {
      client.send('system', { message: `Duel accept failed (${result.error})` });
      return;
    }
    const duel = result.duel;
    this.broadcast('duelStarted', {
      duelId: duel.duelId,
      playerA: duel.playerA,
      playerB: duel.playerB,
      playerAName: duel.playerAName,
      playerBName: duel.playerBName,
      status: duel.status,
      round: duel.round,
      healthA: duel.healthA,
      healthB: duel.healthB,
      roundDeadline: duel.roundDeadline,
      message: `Duel started: ${duel.playerAName} vs ${duel.playerBName}`,
    });
  }

  handleDuelAction(client, data) {
    const duelId = String(data?.duelId || '');
    const action = String(data?.action || '').toLowerCase();
    if (!duelId || !action) return;
    const result = this.duels.submitAction(client.sessionId, duelId, action);
    if (result?.error) {
      client.send('system', { message: `Duel action rejected (${result.error})` });
      return;
    }
    const duel = result.duel;
    if (!duel) return;
    const side = client.sessionId === duel.playerA ? 'a' : 'b';
    this.broadcast('duelActionSubmitted', {
      duelId: duel.duelId,
      playerId: client.sessionId,
      side,
      action,
    });

    if (!result.resolved) return;
    const resolution = result.resolution || {};
    this.broadcast('duelResolved', {
      duelId: duel.duelId,
      status: duel.status,
      round: Number(duel.resolvedRound || duel.round || 1),
      actionA: duel.lastActionA || '',
      actionB: duel.lastActionB || '',
      healthA: duel.healthA,
      healthB: duel.healthB,
      roundDeadline: duel.roundDeadline,
      samWarning: resolution.samWarning || '',
      message: `${duel.playerAName}(${duel.healthA}) · ${duel.playerBName}(${duel.healthB})`,
    });
    if (resolution.ended) {
      this.finalizeDuel(duel.duelId, resolution.winnerId, resolution.samWarning || '');
    }
  }

  updateDuels() {
    const events = this.duels.tick();
    if (!Array.isArray(events) || !events.length) return;
    for (const entry of events) {
      const duel = entry.duel;
      if (!duel) continue;
      if (entry.reason === 'request-timeout') {
        this.broadcast('duelEnded', {
          duelId: duel.duelId,
          status: 'ended',
          message: 'Duel request expired.',
        });
        this.duels.remove(duel.duelId);
        continue;
      }
      if (entry.reason === 'round-resolved') {
        const result = entry.result || {};
        this.broadcast('duelResolved', {
          duelId: duel.duelId,
          status: duel.status,
          round: Number(duel.resolvedRound || duel.round || 1),
          actionA: duel.lastActionA || '',
          actionB: duel.lastActionB || '',
          healthA: duel.healthA,
          healthB: duel.healthB,
          roundDeadline: duel.roundDeadline,
          samWarning: result.samWarning || '',
          message: `${duel.playerAName}(${duel.healthA}) · ${duel.playerBName}(${duel.healthB})`,
        });
        if (result.ended) {
          this.finalizeDuel(duel.duelId, result.winnerId, result.samWarning || '');
        }
        continue;
      }
      if (entry.reason === 'cleanup') {
        this.duels.remove(duel.duelId);
      }
    }
  }

  finalizeDuel(duelId, winnerId = '', samWarning = '') {
    const duel = this.duels.endDuel(duelId, 'resolved');
    if (!duel) return;

    const winner = winnerId ? this.state.players.get(winnerId) : null;
    let rippleDistrict = winner ? this.world.districts.find((district) => district.id === winner.currentDistrict) : null;
    if (!rippleDistrict && this.world.districts.length) {
      const seed = Math.abs(String(duelId).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0));
      rippleDistrict = this.world.districts[seed % this.world.districts.length];
    }
    if (rippleDistrict) {
      const pressureDirection = winnerId === duel.playerA ? 1 : winnerId === duel.playerB ? -1 : 0;
      this.applyPlayerWarImpact({
        playerId: winnerId,
        districtId: rippleDistrict.id,
        intent: pressureDirection >= 0 ? 'assist' : 'disrupt',
        intensity: pressureDirection >= 0 ? PLAYER_WAR_ACTION_IMPACT.duel_win : PLAYER_WAR_ACTION_IMPACT.duel_loss,
        source: 'duel',
      });
      rippleDistrict.control = Math.max(
        0,
        Math.min(100, rippleDistrict.control + (pressureDirection * DUEL_DISTRICT_PRESSURE_SHIFT)),
      );
      if (rippleDistrict.control >= DISTRICT_CAPTURE_THRESHOLD) {
        rippleDistrict.owner = 'Liberators';
      } else if (rippleDistrict.control <= (100 - DISTRICT_CAPTURE_THRESHOLD)) {
        rippleDistrict.owner = 'Wardens';
      }
      this.broadcast('districtCaptureChanged', {
        districtId: rippleDistrict.id,
        control: rippleDistrict.control,
        owner: rippleDistrict.owner,
        controlState: rippleDistrict.controlState,
        instability: rippleDistrict.instability,
        support: rippleDistrict.support,
      });
    }
    this.world.samPressure = Math.max(0, Math.min(100, this.world.samPressure + DUEL_SAM_PRESSURE_SHIFT));

    this.broadcast('duelEnded', {
      duelId: duel.duelId,
      status: 'ended',
      winnerId,
      samWarning,
      rippleDistrictId: rippleDistrict?.id || '',
      rippleDistrictControl: rippleDistrict?.control,
      samPressure: this.world.samPressure,
      message: winnerId
        ? `Duel resolved. Winner: ${this.state.players.get(winnerId)?.name || winnerId}`
        : 'Duel resolved with no winner.',
    });
    this.broadcast('system', {
      message: `⚔️ Duel ripple registered${rippleDistrict ? ` · ${rippleDistrict.name} pressure shifted` : ''}`,
    });
    this.emitSystemEvent(`🎮 Mini-game outcome logged · ${winnerId ? 'victory claimed' : 'draw'} in duel ${duel.duelId}`);
  }
}

import { Room } from 'colyseus';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { clampPosition, validateMovement } from '../systems/player-system.js';
import { getDistrictForPosition, createDistrictPayload } from '../systems/district-system.js';
import { checkAndCompleteQuests } from '../systems/quest-system.js';
import { createDuelSystem } from '../systems/duel-system.js';
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
const MAX_SYSTEM_EVENTS_PER_TICK = 4;

const WORLD_DISTRICTS = [
  { id: 'neon-slums', name: 'Neon Slums' },
  { id: 'signal-spire', name: 'Signal Spire' },
  { id: 'crypto-core', name: 'Crypto Core' },
  { id: 'moonlit-underbelly', name: 'Moonlit Underbelly' },
  { id: 'revolt-plaza', name: 'Revolt Plaza' },
];

const NPC_ROLES = ['vendor', 'fighter', 'agent', 'lore-keeper', 'recruiter', 'drifter'];

class PlayerState extends Schema {
  constructor() {
    super();
    this.id = '';
    this.name = '';
    this.x = 0;
    this.y = 0;
    this.xp = 0;
    this.currentDistrict = '';
  }
}

defineTypes(PlayerState, {
  id: 'string',
  name: 'string',
  x: 'number',
  y: 'number',
  xp: 'number',
  currentDistrict: 'string',
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
    this.worldTickCount = 0;
    this.samTimerMs = 0;
    this.districtTimerMs = 0;
    this.snapshotTimerMs = 0;
    this.systemEventsThisTick = 0;

    this.completedQuests = new Map(); // sessionId -> Set
    this.world = this.createInitialWorld();
    this.world.nodeLookup = new Map(this.world.controlNodes.map((node) => [node.id, node]));
    this.world.linkAdjacency = this.buildLinkAdjacency();
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
      })),
      controlNodes,
      links,
      factions: {
        Liberators: { strength: 50 },
        Wardens: { strength: 50 },
      },
      samPhase: 0,
      samPressure: 0,
      playerInterferenceSpike: 0,
      unstableNodeCount: 0,
    };
  }

  updateWorld(dt) {
    this.worldTickCount += 1;
    this.systemEventsThisTick = 0;
    this.samTimerMs += dt;
    this.districtTimerMs += dt;
    this.snapshotTimerMs += dt;

    this.updateNPCs(dt);
    this.updateFactionState();
    this.updateDistricts();
    this.updateNodeInterference();
    this.updateSAM();
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
      })),
      districts: this.world.districts.map((d) => ({
        id: d.id,
        control: d.control,
        owner: d.owner,
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
            const pick = districtPeers[(this.worldTickCount + nextNode.id.length) % districtPeers.length];
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
      const count = districtNodeCounts.get(district.id) || 1;
      const sum = districtNodeTotals.get(district.id) || 0;
      const normalized = Math.max(-100, Math.min(100, sum / count));
      district.control = Math.max(0, Math.min(100, 50 + normalized));
      if (district.control >= DISTRICT_CAPTURE_THRESHOLD) {
        district.owner = 'Liberators';
      } else if (district.control <= (100 - DISTRICT_CAPTURE_THRESHOLD)) {
        district.owner = 'Wardens';
      } else {
        district.owner = 'Contested';
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
    const pressureRise = unstablePressure + interferencePressure + factionPressure;
    const pressureDecay = 4;
    this.world.samPressure = Math.max(0, Math.min(140, this.world.samPressure + pressureRise - pressureDecay));
    this.world.playerInterferenceSpike = Math.max(0, this.world.playerInterferenceSpike - 4);

    if (pressureRise >= 14) {
      this.emitSystemEvent(`🚨 SAM pressure spike detected (+${Math.round(pressureRise)})`);
    }

    if (this.world.samPressure >= SAM_PRESSURE_PHASE_THRESHOLD) {
      this.world.samPressure = SAM_PRESSURE_RESET_FLOOR;
      this.world.samPhase = (this.world.samPhase + 1) % 4;
      this.broadcast('samPhaseChanged', { phaseIndex: this.world.samPhase });
      this.emitSystemEvent(`🧠 SAM phase shift triggered by world pressure (phase ${this.world.samPhase})`);
    }
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
      if (node.interference >= NODE_UNSTABLE_THRESHOLD) {
        unstableCount += 1;
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
    for (const node of this.world.controlNodes) {
      if (node.owner === 'Liberators') liberatorNodes += 1;
      if (node.owner === 'Wardens') wardenNodes += 1;
    }
    this.world.factions.Liberators.strength = Math.max(0, Math.min(100, 50 + (liberatorNodes - wardenNodes)));
    this.world.factions.Wardens.strength = Math.max(0, Math.min(100, 50 + (wardenNodes - liberatorNodes)));
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

    node.interference = Math.max(0, Math.min(100, node.interference + NODE_INTERFERENCE_GAIN));
    node.control = Math.max(-100, Math.min(100, node.control - NODE_DISTRICT_SHIFT));
    node.lastInterferedBy = client.sessionId;
    node.pulseUntil = now + NODE_PULSE_DURATION_MS;
    node.cooldownUntil = now + NODE_COOLDOWN_MS;
    node.status = node.interference >= NODE_UNSTABLE_THRESHOLD ? 'unstable' : 'contested';
    if (node.interference >= NODE_UNSTABLE_THRESHOLD) {
      node.owner = 'UNSTABLE';
    }
    this.world.playerInterferenceSpike = Math.max(0, this.world.playerInterferenceSpike + NODE_INTERFERENCE_GAIN);

    const district = this.world.districts.find((entry) => entry.id === node.districtId);
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
      cooldownUntil: node.cooldownUntil,
      pulseUntil: node.pulseUntil,
      sourcePlayerId: client.sessionId,
      districtControl: district.control,
      districtOwner: district.owner,
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

    this.state.players.set(client.sessionId, player);
    this.completedQuests.set(client.sessionId, new Set());

    this.handleDistrictChange(client.sessionId, player);
    client.send('worldSnapshot', this.buildLeanSnapshot());

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

    let rippleDistrict = null;
    if (this.world.districts.length) {
      const seed = Math.abs(String(duelId).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0));
      rippleDistrict = this.world.districts[seed % this.world.districts.length];
    }
    if (rippleDistrict) {
      const pressureDirection = winnerId === duel.playerA ? 1 : winnerId === duel.playerB ? -1 : 0;
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

import { Room } from 'colyseus';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { clampPosition, validateMovement } from '../systems/player-system.js';
import { getDistrictForPosition, createDistrictPayload } from '../systems/district-system.js';
import { checkAndCompleteQuests } from '../systems/quest-system.js';

const WORLD_MAP_WIDTH = 20;
const WORLD_MAP_HEIGHT = 20;
const ACTIVE_NPC_COUNT = 40;
const CROWD_NPC_COUNT = 20;
const SAM_PHASE_INTERVAL_MS = 30000;
const DISTRICT_DRIFT_INTERVAL_MS = 1200;
const WORLD_SNAPSHOT_INTERVAL_MS = 300;
const DISTRICT_CAPTURE_THRESHOLD = 90;
const NODE_INTERFERENCE_GAIN = 18;
const NODE_UNSTABLE_THRESHOLD = 65;
const NODE_COOLDOWN_MS = 6500;
const NODE_PULSE_DURATION_MS = 1200;
const NODE_INTERFERENCE_DECAY = 2;
const NODE_DISTRICT_SHIFT = 3;
const SAM_PRESSURE_FROM_INTERFERENCE = 4;
const SAM_PRESSURE_PHASE_THRESHOLD = 100;
const SAM_PRESSURE_TRIGGER_CHANCE = 0.45;
const SAM_PRESSURE_RESET_FLOOR = 20;

const CONTROL_NODES = [
  { id: 'core', x: 24, y: 24, districtId: 'crypto-core' },
  { id: 'north', x: 24, y: 10, districtId: 'signal-spire' },
  { id: 'east', x: 38, y: 24, districtId: 'revolt-plaza' },
  { id: 'south', x: 24, y: 38, districtId: 'moonlit-underbelly' },
  { id: 'west', x: 10, y: 24, districtId: 'neon-slums' },
];

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

    this.completedQuests = new Map(); // sessionId -> Set
    this.world = this.createInitialWorld();

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
  }

  createInitialWorld() {
    const npcs = [];

    for (let i = 0; i < ACTIVE_NPC_COUNT; i += 1) {
      npcs.push({
        id: `active-${i}`,
        role: NPC_ROLES[i % NPC_ROLES.length],
        roleLabel: NPC_ROLES[i % NPC_ROLES.length],
        name: `Citizen ${i + 1}`,
        mode: 'active',
        faction: i % 2 === 0 ? 'Liberators' : 'Wardens',
        col: Math.floor(Math.random() * WORLD_MAP_WIDTH),
        row: Math.floor(Math.random() * WORLD_MAP_HEIGHT),
        seed: Math.random() * Math.PI * 2,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.8 + Math.random() * 0.8,
        interactionRadius: 1.3,
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
        col: Math.floor(Math.random() * WORLD_MAP_WIDTH),
        row: Math.floor(Math.random() * WORLD_MAP_HEIGHT),
        seed: Math.random() * Math.PI * 2,
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
      controlNodes: CONTROL_NODES.map((node) => ({
        ...node,
        owner: null,
        control: 0,
        interference: 0,
        status: 'stable',
        cooldownUntil: 0,
        lastInterferedBy: null,
        pulseUntil: 0,
      })),
      samPhase: 0,
      samPressure: 0,
    };
  }

  updateWorld(dt) {
    this.worldTickCount += 1;
    this.samTimerMs += dt;
    this.districtTimerMs += dt;
    this.snapshotTimerMs += dt;

    this.updateNPCs(dt);
    this.updateDistricts();
    this.updateNodeInterference();
    this.updateSAM();

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
        interference: node.interference,
        status: node.status,
        control: node.control,
        owner: node.owner,
        cooldownUntil: node.cooldownUntil,
        pulseUntil: node.pulseUntil,
        sourcePlayerId: node.lastInterferedBy,
      })),
      samPhase: this.world.samPhase,
      samPressure: this.world.samPressure,
    };
  }

  updateNPCs(dt) {
    const dtSeconds = dt / 1000;
    const time = Date.now() * 0.001;
    for (const npc of this.world.npcs) {
      if (!npc || npc.mode !== 'active') continue;
      const phase = time + npc.seed;
      const sinOffset = Math.sin(phase);
      const cosOffset = Math.cos(phase);

      npc.bobPhase += dtSeconds * npc.bobSpeed;
      npc.col = Math.max(
        0,
        Math.min(
          WORLD_MAP_WIDTH - 1,
          npc.col + sinOffset * 0.05,
        ),
      );
      npc.row = Math.max(
        0,
        Math.min(
          WORLD_MAP_HEIGHT - 1,
          npc.row + cosOffset * 0.05,
        ),
      );
    }
  }

  updateDistricts() {
    if (this.districtTimerMs < DISTRICT_DRIFT_INTERVAL_MS) return;
    this.districtTimerMs = 0;

    for (const district of this.world.districts) {
      const drift = Math.random() < 0.5 ? -2 : 2;
      district.control = Math.max(0, Math.min(100, district.control + drift));
      if (district.control >= DISTRICT_CAPTURE_THRESHOLD) {
        district.owner = 'Liberators';
      } else if (district.control <= (100 - DISTRICT_CAPTURE_THRESHOLD)) {
        district.owner = 'Wardens';
      }
    }
  }

  updateSAM() {
    if (this.samTimerMs < SAM_PHASE_INTERVAL_MS) return;
    this.samTimerMs = 0;
    this.world.samPhase = (this.world.samPhase + 1) % 4;
    this.broadcast('samPhaseChanged', { phaseIndex: this.world.samPhase });
  }

  updateNodeInterference() {
    const now = Date.now();
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
      node.control = node.interference;
      if (node.interference === 0) {
        node.owner = null;
        node.lastInterferedBy = null;
      }
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
    node.control = node.interference;
    node.lastInterferedBy = client.sessionId;
    node.pulseUntil = now + NODE_PULSE_DURATION_MS;
    node.cooldownUntil = now + NODE_COOLDOWN_MS;
    node.status = node.interference >= NODE_UNSTABLE_THRESHOLD ? 'unstable' : 'contested';
    node.owner = node.interference >= NODE_UNSTABLE_THRESHOLD ? 'UNSTABLE' : node.owner;

    const district = this.world.districts.find((entry) => entry.id === node.districtId);
    if (!district) return;

    const towardContest = district.control >= 50 ? -1 : 1;
    district.control = Math.max(0, Math.min(100, district.control + (NODE_DISTRICT_SHIFT * towardContest)));
    if (district.control >= DISTRICT_CAPTURE_THRESHOLD) {
      district.owner = 'Liberators';
    } else if (district.control <= (100 - DISTRICT_CAPTURE_THRESHOLD)) {
      district.owner = 'Wardens';
    }

    const samPressureDelta = Math.random() < SAM_PRESSURE_TRIGGER_CHANCE ? SAM_PRESSURE_FROM_INTERFERENCE : 0;
    if (samPressureDelta > 0) {
      this.world.samPressure = Math.max(0, Math.min(100, this.world.samPressure + samPressureDelta));
      if (this.world.samPressure >= SAM_PRESSURE_PHASE_THRESHOLD) {
        this.world.samPressure = SAM_PRESSURE_RESET_FLOOR;
        this.world.samPhase = (this.world.samPhase + 1) % 4;
        this.broadcast('samPhaseChanged', { phaseIndex: this.world.samPhase });
      }
    }

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

    this.broadcast('system', {
      message: `⚡ NODE ${node.id.toUpperCase()} INTERFERED · ${district.name} pressure shifting`,
    });
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
}

import { Room } from 'colyseus';
import { Schema, ArraySchema, defineTypes } from '@colyseus/schema';
import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP } from '../../../../shared/block-topia/constants.js';

const MAP_WIDTH = 20;
const MAP_HEIGHT = 20;
const PLAYER_SPEED_HINT = 3.2;
const DEFAULT_MOONBOYS_API_BASE = 'https://moonboys-api.sercullen.workers.dev';
const PROGRESSION_FETCH_TIMEOUT_MS = 3000;

const SPAWN_SLOTS = [
  { x: 6, y: 10 },
  { x: 14, y: 10 },
];

const NPC_COUNT = 14;
const SIM_TICK_MS = 200;
const ATTACK_RANGE = 1.3;
const ATTACK_DAMAGE = 20;
const ATTACK_COOLDOWN_MS = 750;
const PLAYER_MAX_HP = 100;
const NPC_MAX_HP = 60;
const NPC_CONTACT_DAMAGE = 6;
const NPC_ATTACK_COOLDOWN_MS = 2500;
const PLAYER_NPC_DAMAGE_COOLDOWN_MS = 2500;
const SPAWN_GRACE_MS = 5000;
const RESPAWN_DELAY_MS = 3000;
const NPC_RESPAWN_DELAY_MS = 6500;
const NPC_RESPAWN_MIN_DISTANCE = 4;
const MISSION_SURVIVE_MS = 60000;
const MISSION_REQUIRED_KILLS = 5;
const READY_TIMEOUT_MS = 30000;
const FREE_ROAM_MS = 60_000; // Dev timing. Production target: 10 minutes.
const WARNING_MS = 10_000;
const EVENT_MS = 90_000;
const RECOVERY_MS = 30_000; // Dev timing. Production target: 10 minutes.
const MISSION_COMPLETE_MS = 8000;
const MAX_ROOM_RUN_MS = 20 * 60_000;
const IDLE_RESET_MS = 2 * 60_000;
const PHASE_FREE_ROAM = 'FREE_ROAM';
const PHASE_WARNING = 'WARNING';
const PHASE_EVENT_ACTIVE = 'EVENT_ACTIVE';
const PHASE_RECOVERY = 'RECOVERY';
const PHASE_MISSION_COMPLETE = 'MISSION_COMPLETE';
const OBJECTIVE_PATROL_SWEEP = 'PATROL_SWEEP';
const OBJECTIVE_SIGNAL_HACK = 'SIGNAL_HACK';
const MIN_ATTACK_COOLDOWN_MS = 350;
const EXTRACTION_SAFE_DISTANCE = 3;
const UPGRADE_POOL = [
  { id: 'street_medic', name: 'Street Medic', description: '+25 max HP and full heal next level' },
  { id: 'spray_damage', name: 'Spray Damage', description: '+10 attack damage' },
  { id: 'quick_trigger', name: 'Quick Trigger', description: '-150ms attack cooldown' },
  { id: 'armour_plate', name: 'Armour Plate', description: '-20% NPC contact damage' },
  { id: 'second_wind', name: 'Second Wind', description: 'One emergency revive per level' },
  { id: 'scanner', name: 'Scanner', description: 'Lower objective requirement this run' },
];
const PASSABLE_TERRAIN = new Set(['road', 'grass']);

class PlayerState extends Schema {
  constructor() {
    super();
    this.id = '';
    this.x = 0;
    this.y = 0;
    this.name = '';
    this.faction = 'Liberators';
    this.district = 'neon-slums';
    this.hp = PLAYER_MAX_HP;
    this.kills = 0;
    this.downs = 0;
    this.respawnAt = 0;
    this.ready = false;
    this.maxHp = PLAYER_MAX_HP;
    this.attackDamage = ATTACK_DAMAGE;
    this.attackCooldownMs = ATTACK_COOLDOWN_MS;
    this.armorPct = 0;
    this.secondWindAvailable = false;
    this.secondWindUsed = false;
    this.runLevel = 1;
    this.upgradesJson = '[]';
    this.upgradeChoicesJson = '[]';
    this.upgradeChoicesMetaJson = '[]';
    this.upgradeState = '';
    this.objectiveProgress = 0;
  }
}

defineTypes(PlayerState, {
  id: 'string',
  x: 'number',
  y: 'number',
  name: 'string',
  faction: 'string',
  district: 'string',
  hp: 'number',
  kills: 'number',
  downs: 'number',
  respawnAt: 'number',
  ready: 'boolean',
  maxHp: 'number',
  attackDamage: 'number',
  attackCooldownMs: 'number',
  armorPct: 'number',
  secondWindAvailable: 'boolean',
  secondWindUsed: 'boolean',
  runLevel: 'number',
  upgradesJson: 'string',
  upgradeChoicesJson: 'string',
  upgradeChoicesMetaJson: 'string',
  upgradeState: 'string',
  objectiveProgress: 'number',
});

class NpcState extends Schema {
  constructor() {
    super();
    this.id = '';
    this.x = 0;
    this.y = 0;
    this.hp = NPC_MAX_HP;
    this.maxHp = NPC_MAX_HP;
    this.kind = 'drone';
    this.targetSessionId = '';
  }
}

defineTypes(NpcState, {
  id: 'string',
  x: 'number',
  y: 'number',
  hp: 'number',
  maxHp: 'number',
  kind: 'string',
  targetSessionId: 'string',
});

class MinimalRoomState extends Schema {
  constructor() {
    super();
    this.players = new ArraySchema();
    this.npcs = new ArraySchema();
    this.worldMode = 'single-player';
    this.worldPhase = PHASE_FREE_ROAM;
    this.phaseStartedAt = 0;
    this.phaseEndsAt = 0;
    this.eventLevel = 1;
    this.eventObjective = 'Patrol Sweep: survive and neutralize 5 NPCs, then extract.';
    this.roomRunStartedAt = 0;
    this.eventObjectiveType = OBJECTIVE_PATROL_SWEEP;
    this.objectiveTarget = MISSION_REQUIRED_KILLS;
    this.objectiveProgress = 0;
    this.extractionX = MAP_WIDTH - 2;
    this.extractionY = MAP_HEIGHT - 2;
    this.hackX = 1;
    this.hackY = 1;
    this.hackProgressTarget = 30;
    this.runStartedAt = 0;
  }
}

defineTypes(MinimalRoomState, {
  players: [PlayerState],
  npcs: [NpcState],
  worldMode: 'string',
  worldPhase: 'string',
  phaseStartedAt: 'number',
  phaseEndsAt: 'number',
  eventLevel: 'number',
  eventObjective: 'string',
  roomRunStartedAt: 'number',
  eventObjectiveType: 'string',
  objectiveTarget: 'number',
  objectiveProgress: 'number',
  extractionX: 'number',
  extractionY: 'number',
  hackX: 'number',
  hackY: 'number',
  hackProgressTarget: 'number',
  runStartedAt: 'number',
});

export class MinimalCityRoom extends Room {
  onCreate() {
    this.setState(new MinimalRoomState());
    this.maxClients = 2;
    this.autoDispose = false;
    this.playersBySession = new Map();
    this.lastAttackAtBySession = new Map();
    this.lastNpcDamageAtByNpcAndTarget = new Map();
    this.lastNpcDamageAtByTarget = new Map();
    this.spawnProtectedUntilBySession = new Map();
    this.pendingRespawnBySession = new Map();
    this.pendingRespawnByNpcId = new Map();
    this.pendingReadyTimeoutBySession = new Map();
    this.completedSessions = new Set();
    this.missionStartedAtBySession = new Map();
    this.lastActiveAtBySession = new Map();
    this.runGeneration = 0;
    this.terrain = buildTerrainGrid(MAP_WIDTH, MAP_HEIGHT);
    this._seedNpcs();

    this.onMessage('move', (client, data) => {
      const player = this.playersBySession.get(client.sessionId);
      if (!player || !player.ready) return;

      const nextX = Number(data?.x);
      const nextY = Number(data?.y);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

      const x = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(nextX)));
      const y = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(nextY)));
      if (!this._isPassable(x, y)) return;

      player.x = x;
      player.y = y;
      this._markActivity(client.sessionId);
    });

    this.onMessage('attack', (client) => {
      const player = this.playersBySession.get(client.sessionId);
      if (this.completedSessions.has(client.sessionId)) return;
      if (!player || !player.ready || player.hp <= 0) return;
      const now = Date.now();
      const lastAttackAt = this.lastAttackAtBySession.get(client.sessionId) || 0;
      const attackCooldownMs = Math.max(MIN_ATTACK_COOLDOWN_MS, Math.floor(player.attackCooldownMs || ATTACK_COOLDOWN_MS));
      if (now - lastAttackAt < attackCooldownMs) return;
      if (this.state.worldPhase !== PHASE_EVENT_ACTIVE) return;
      this.lastAttackAtBySession.set(client.sessionId, now);
      const target = this._findNearestNpc(player, ATTACK_RANGE);
      if (!target) return;
      target.hp = Math.max(0, target.hp - Math.max(1, Math.floor(player.attackDamage || ATTACK_DAMAGE)));
      if (target.hp <= 0) {
        player.kills += 1;
        player.objectiveProgress = this._currentObjectiveProgressForPlayer(player.id);
        this.state.objectiveProgress = Math.max(this.state.objectiveProgress, player.objectiveProgress);
        this.broadcast('system', { message: `${player.name} neutralized ${target.id}.`, mode: this.state.worldMode });
        this._scheduleNpcRespawn(target.id);
      }
      this._markActivity(client.sessionId);
    });

    this.onMessage('extract', (client) => {
      const player = this.playersBySession.get(client.sessionId);
      if (!player) return;
      if (!this._canExtractPlayer(client.sessionId, player)) return;
      this.completedSessions.add(client.sessionId);
      this.pendingRespawnBySession.delete(client.sessionId);
      player.hp = Math.max(1, player.hp);
      player.respawnAt = 0;
      this._markActivity(client.sessionId);
      this._maybeMarkMissionComplete();
    });

    this.onMessage('ready', (client) => {
      this._setPlayerReady(client.sessionId);
      this._markActivity(client.sessionId);
    });
    this.onMessage('startRun', (client) => {
      this._setPlayerReady(client.sessionId);
      this._markActivity(client.sessionId);
    });
    this.onMessage('restartRun', (client) => {
      const player = this.playersBySession.get(client.sessionId);
      if (!player || !player.ready) return;
      if (!this._canRestartRun()) return;
      this._startRun({ eventLevel: this.state.eventLevel + 1, keepPlayerUpgrades: true });
      this.broadcast('system', { message: `City run restarted at event level ${this.state.eventLevel}.`, mode: this.state.worldMode });
    });
    this.onMessage('chooseUpgrade', (client, data) => {
      const player = this.playersBySession.get(client.sessionId);
      if (!player || !player.ready) return;
      if (this.state.worldPhase !== PHASE_RECOVERY && this.state.worldPhase !== PHASE_MISSION_COMPLETE) return;
      const upgradeId = String(data?.upgradeId || '').trim();
      if (!upgradeId) return;
      const choices = safeParseJsonArray(player.upgradeChoicesJson);
      if (!choices.includes(upgradeId)) return;
      this._applyUpgrade(player, upgradeId);
      player.upgradeChoicesJson = '[]';
      player.upgradeChoicesMetaJson = '[]';
      player.upgradeState = 'selected';
      this.broadcast('system', { message: `${player.name} activated ${upgradeId.replaceAll('_', ' ').toUpperCase()}.`, mode: this.state.worldMode });
    });

    this.clock.setInterval(() => {
      this._tickPhase();
      this._tickObjectives();
      this._tickNpcs();
      this._tickIdleTimeouts();
      this._updateWorldMode();
    }, SIM_TICK_MS);
  }

  async onJoin(client, options = {}) {
    const validation = await validateMultiplayerEntry(options);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    if (this.state.players.length === 0) {
      this._startRun({ eventLevel: 1 });
    }

    const slotIndex = this.state.players.length % SPAWN_SLOTS.length;
    const spawn = SPAWN_SLOTS[slotIndex];

    const player = new PlayerState();
    player.id = client.sessionId;
    player.x = spawn.x;
    player.y = spawn.y;
    player.name = String(options?.name || `Player_${this.state.players.length + 1}`).slice(0, 24);
    player.faction = String(options?.faction || 'Liberators').slice(0, 24);
    player.district = String(options?.district || 'neon-slums').slice(0, 32);
    player.ready = false;
    player.upgradeState = this.state.eventLevel > 1 ? 'joined_late' : '';

    this.state.players.push(player);
    this.playersBySession.set(client.sessionId, player);
    this.completedSessions.delete(client.sessionId);
    this.missionStartedAtBySession.set(client.sessionId, 0);
    this.spawnProtectedUntilBySession.set(client.sessionId, Date.now() + SPAWN_GRACE_MS);
    this.lastActiveAtBySession.set(client.sessionId, Date.now());
    this._scheduleReadyTimeout(client.sessionId);
    this._updateWorldMode();

    this.broadcast('system', {
      message: `${player.name} joined Block Topia (${this.state.worldMode}).`,
      map: { width: MAP_WIDTH, height: MAP_HEIGHT },
      playerSpeed: PLAYER_SPEED_HINT,
      npcCount: this.state.npcs.length,
      mode: this.state.worldMode,
      phase: this.state.worldPhase,
      phaseEndsAt: this.state.phaseEndsAt,
      eventLevel: this.state.eventLevel,
      eventObjective: this.state.eventObjective,
      objectiveType: this.state.eventObjectiveType,
      objectiveTarget: this.state.objectiveTarget,
      objectiveProgress: this.state.objectiveProgress,
      extractionX: this.state.extractionX,
      extractionY: this.state.extractionY,
      hackX: this.state.hackX,
      hackY: this.state.hackY,
      hackProgressTarget: this.state.hackProgressTarget,
    });
  }

  onLeave(client) {
    const player = this.playersBySession.get(client.sessionId);
    const npcDamageKeySuffix = `:${client.sessionId}`;
    for (const key of this.lastNpcDamageAtByNpcAndTarget.keys()) {
      if (key.endsWith(npcDamageKeySuffix)) {
        this.lastNpcDamageAtByNpcAndTarget.delete(key);
      }
    }
    this.playersBySession.delete(client.sessionId);
    this.completedSessions.delete(client.sessionId);
    this.lastAttackAtBySession.delete(client.sessionId);
    this.spawnProtectedUntilBySession.delete(client.sessionId);
    this.lastNpcDamageAtByTarget.delete(client.sessionId);
    this.pendingRespawnBySession.delete(client.sessionId);
    this.pendingReadyTimeoutBySession.delete(client.sessionId);
    this.missionStartedAtBySession.delete(client.sessionId);
    this.lastActiveAtBySession.delete(client.sessionId);
    if (player) {
      const index = this.state.players.findIndex((entry) => entry.id === client.sessionId);
      if (index >= 0) this.state.players.splice(index, 1);
      this.broadcast('system', { message: `${player.name} left the city.` });
    }
    if (this.state.players.length === 0) this._startRun({ eventLevel: 1 });
    this._updateWorldMode();
  }

  _seedNpcs() {
    for (let i = 0; i < NPC_COUNT; i += 1) {
      const spawn = this._findRandomPassableTile();
      const npc = new NpcState();
      npc.id = `npc_${i + 1}`;
      npc.x = spawn.x;
      npc.y = spawn.y;
      npc.hp = NPC_MAX_HP;
      npc.maxHp = NPC_MAX_HP;
      npc.kind = i % 2 === 0 ? 'drone' : 'raider';
      npc.targetSessionId = '';
      this.state.npcs.push(npc);
    }
  }

  _updateWorldMode() {
    const count = this.state.players.length;
    this.state.worldMode = count >= 2 ? 'duo-vs-npc' : 'single-player-vs-npc';
  }

  _phaseDuration(phase) {
    if (phase === PHASE_FREE_ROAM) return FREE_ROAM_MS;
    if (phase === PHASE_WARNING) return WARNING_MS;
    if (phase === PHASE_EVENT_ACTIVE) return EVENT_MS;
    if (phase === PHASE_RECOVERY) return RECOVERY_MS;
    if (phase === PHASE_MISSION_COMPLETE) return MISSION_COMPLETE_MS;
    return 0;
  }

  _setPhase(phase) {
    const now = Date.now();
    this.state.worldPhase = phase;
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + this._phaseDuration(phase);
    if (phase === PHASE_EVENT_ACTIVE) {
      this._setupObjectiveForLevel();
      this.state.eventObjective = this.state.eventObjectiveType === OBJECTIVE_SIGNAL_HACK
        ? `Signal Hack L${this.state.eventLevel}: hold the hack tile, then extract.`
        : `Patrol Sweep L${this.state.eventLevel}: survive and neutralize ${this.state.objectiveTarget} NPCs, then extract.`;
    } else if (phase === PHASE_WARNING) {
      this.state.eventObjective = `Warning: patrol sweep level ${this.state.eventLevel} incoming.`;
    } else if (phase === PHASE_RECOVERY) {
      this.state.eventObjective = `Recovery: regroup before level ${this.state.eventLevel + 1}.`;
      this._ensureUpgradeChoicesForReadyPlayers();
    } else if (phase === PHASE_FREE_ROAM) {
      this.state.eventObjective = `Free roam: explore the city. Event level ${this.state.eventLevel} starts soon.`;
    } else if (phase === PHASE_MISSION_COMPLETE) {
      this.state.eventObjective = `Level ${this.state.eventLevel} complete. Recovery before level ${this.state.eventLevel + 1}.`;
      this._ensureUpgradeChoicesForReadyPlayers();
    }
  }

  _startRun({ eventLevel = 1, keepPlayerUpgrades = false } = {}) {
    const now = Date.now();
    this.runGeneration += 1;
    this.completedSessions.clear();
    this.pendingRespawnBySession.clear();
    this.pendingRespawnByNpcId.clear();
    this.state.eventLevel = Math.max(1, Math.floor(eventLevel));
    this.state.roomRunStartedAt = now;
    this.state.runStartedAt = now;
    this.state.objectiveProgress = 0;
    this._setPhase(PHASE_FREE_ROAM);
    for (const player of this.state.players) {
      if (!player) continue;
      if (!keepPlayerUpgrades) {
        player.maxHp = PLAYER_MAX_HP;
        player.attackDamage = ATTACK_DAMAGE;
        player.attackCooldownMs = ATTACK_COOLDOWN_MS;
        player.armorPct = 0;
        player.secondWindAvailable = false;
        player.secondWindUsed = false;
        player.upgradesJson = '[]';
      } else {
        player.secondWindUsed = false;
      }
      player.runLevel = this.state.eventLevel;
      player.upgradeChoicesJson = '[]';
      player.upgradeChoicesMetaJson = '[]';
      player.upgradeState = '';
      player.objectiveProgress = 0;
      player.hp = player.maxHp;
      player.kills = 0;
      player.downs = 0;
      player.respawnAt = 0;
      const spawn = this._findRandomPassableTile();
      player.x = spawn.x;
      player.y = spawn.y;
      this.spawnProtectedUntilBySession.set(player.id, now + SPAWN_GRACE_MS);
      this.missionStartedAtBySession.set(player.id, player.ready ? now : 0);
    }
    for (const npc of this.state.npcs) {
      if (!npc) continue;
      const spawn = this._findRandomPassableTileAwayFromPlayers(NPC_RESPAWN_MIN_DISTANCE);
      npc.x = spawn.x;
      npc.y = spawn.y;
      const npcMaxHp = this._scaledNpcMaxHp();
      npc.hp = npcMaxHp;
      npc.maxHp = npcMaxHp;
      npc.targetSessionId = '';
    }
  }

  _tickPhase() {
    const now = Date.now();
    if (this.state.players.length === 0) return;
    if (
      this.state.worldPhase !== PHASE_MISSION_COMPLETE &&
      this.state.roomRunStartedAt &&
      now - this.state.roomRunStartedAt > MAX_ROOM_RUN_MS
    ) {
      this._setPhase(PHASE_MISSION_COMPLETE);
      this.state.roomRunStartedAt = 0;
      return;
    }
    if (this.state.phaseEndsAt && now < this.state.phaseEndsAt) return;
    if (this.state.worldPhase === PHASE_FREE_ROAM) this._setPhase(PHASE_WARNING);
    else if (this.state.worldPhase === PHASE_WARNING) this._setPhase(PHASE_EVENT_ACTIVE);
    else if (this.state.worldPhase === PHASE_EVENT_ACTIVE) this._setPhase(PHASE_RECOVERY);
    else if (this.state.worldPhase === PHASE_RECOVERY) this._setPhase(PHASE_WARNING);
    else if (this.state.worldPhase === PHASE_MISSION_COMPLETE) {
      this._advanceToNextLevel();
    } else this._setPhase(PHASE_FREE_ROAM);
  }

  _canRestartRun() {
    if (this.state.worldPhase !== PHASE_MISSION_COMPLETE) return false;
    const readyPlayers = this.state.players.filter((p) => p && p.ready);
    if (!readyPlayers.length) return true;
    return readyPlayers.every((p) => this.completedSessions.has(p.id));
  }

  _maybeMarkMissionComplete() {
    if (this.state.worldPhase === PHASE_MISSION_COMPLETE) return;
    const readyPlayers = this.state.players.filter((p) => p && p.ready);
    if (!readyPlayers.length) return;
    const allReadyCompleted = readyPlayers.every((p) => this.completedSessions.has(p.id));
    if (allReadyCompleted) this._setPhase(PHASE_MISSION_COMPLETE);
  }

  _advanceToNextLevel() {
    const now = Date.now();
    this.runGeneration += 1;
    this.completedSessions.clear();
    this.lastAttackAtBySession.clear();
    this.lastNpcDamageAtByTarget.clear();
    this.lastNpcDamageAtByNpcAndTarget.clear();
    this.pendingRespawnBySession.clear();
    this.pendingRespawnByNpcId.clear();
    this.state.eventLevel += 1;
    this.state.objectiveProgress = 0;
    for (const player of this.state.players) {
      if (!player || !player.ready) continue;
      if (safeParseJsonArray(player.upgradeChoicesJson).length && player.upgradeState !== 'selected') {
        player.upgradeState = 'missed';
      } else if (player.upgradeState === 'selected') {
        player.upgradeState = '';
      }
      player.runLevel = this.state.eventLevel;
      player.secondWindUsed = false;
      player.objectiveProgress = 0;
      player.hp = player.maxHp;
      player.kills = 0;
      player.respawnAt = 0;
      player.upgradeChoicesJson = '[]';
      player.upgradeChoicesMetaJson = '[]';
      this.spawnProtectedUntilBySession.set(player.id, now + SPAWN_GRACE_MS);
      this.missionStartedAtBySession.set(player.id, now);
    }
    for (const npc of this.state.npcs) {
      if (!npc) continue;
      const npcMaxHp = this._scaledNpcMaxHp();
      npc.hp = npcMaxHp;
      npc.maxHp = npcMaxHp;
      npc.targetSessionId = '';
    }
    this._setPhase(PHASE_FREE_ROAM);
  }

  _ensureUpgradeChoicesForReadyPlayers() {
    for (const player of this.state.players) {
      if (!player || !player.ready) continue;
      if (player.upgradeState === 'selected') continue;
      if (safeParseJsonArray(player.upgradeChoicesJson).length) continue;
      const choices = pickUpgradeChoices(player.upgradesJson);
      player.upgradeChoicesJson = JSON.stringify(choices);
      player.upgradeChoicesMetaJson = JSON.stringify(choices.map((choiceId) => toUpgradeMeta(choiceId)));
      player.upgradeState = choices.length ? 'pending' : 'none';
    }
  }

  _isPassable(x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const row = this.terrain[y];
    if (!row) return false;
    return PASSABLE_TERRAIN.has(row[x]);
  }

  _findRandomPassableTile() {
    for (let i = 0; i < 1000; i += 1) {
      const x = Math.floor(Math.random() * MAP_WIDTH);
      const y = Math.floor(Math.random() * MAP_HEIGHT);
      if (this._isPassable(x, y)) return { x, y };
    }
    return { x: 1, y: 1 };
  }

  _findRandomPassableTileAwayFromPlayers(minDistance = 0) {
    const inRecoveryOrComplete = this.state.worldPhase === PHASE_RECOVERY || this.state.worldPhase === PHASE_MISSION_COMPLETE;
    const objectiveType = this.state.eventObjectiveType;
    for (let i = 0; i < 1000; i += 1) {
      const x = Math.floor(Math.random() * MAP_WIDTH);
      const y = Math.floor(Math.random() * MAP_HEIGHT);
      if (!this._isPassable(x, y)) continue;
      if (minDistance <= 0) return { x, y };
      const tooClose = this.state.players.some((player) => player && player.hp > 0 && distance(x, y, player.x, player.y) < minDistance);
      const nearExtraction = distance(x, y, this.state.extractionX, this.state.extractionY) < EXTRACTION_SAFE_DISTANCE;
      const nearHack = objectiveType === OBJECTIVE_SIGNAL_HACK && distance(x, y, this.state.hackX, this.state.hackY) < EXTRACTION_SAFE_DISTANCE;
      const clustered = this.state.npcs.some((npc) => npc && npc.hp > 0 && distance(x, y, npc.x, npc.y) < 1.5);
      const avoidObjectiveArea = (inRecoveryOrComplete && nearExtraction) || nearHack;
      if (avoidObjectiveArea) continue;
      if (clustered) continue;
      if (!tooClose) return { x, y };
    }
    return this._findRandomPassableTile();
  }

  _findNearestNpc(player, range) {
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const npc of this.state.npcs) {
      if (!npc || npc.hp <= 0) continue;
      const dist = distance(player.x, player.y, npc.x, npc.y);
      if (dist <= range && dist < bestDist) {
        best = npc;
        bestDist = dist;
      }
    }
    return best;
  }

  _findNearestAlivePlayer(npc) {
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const player of this.state.players) {
      if (!player || !player.ready || player.hp <= 0) continue;
      if (this.completedSessions.has(player.id)) continue;
      const dist = distance(player.x, player.y, npc.x, npc.y);
      if (dist < bestDist) {
        best = player;
        bestDist = dist;
      }
    }
    return best;
  }

  _tickNpcs() {
    for (const npc of this.state.npcs) {
      if (!npc || npc.hp <= 0) continue;
      const target = this._findNearestAlivePlayer(npc);
      if (!target) {
        npc.targetSessionId = '';
        if (Math.random() < 0.05) this._roamNpc(npc);
        continue;
      }

      npc.targetSessionId = target.id;
      if (this.state.worldPhase === PHASE_FREE_ROAM || this.state.worldPhase === PHASE_RECOVERY) {
        if (Math.random() < 0.08) this._roamNpc(npc);
        continue;
      }
      if (
        this.state.eventObjectiveType === OBJECTIVE_SIGNAL_HACK &&
        target.x === this.state.hackX &&
        target.y === this.state.hackY &&
        Math.random() < 0.55
      ) {
        if (Math.random() < 0.06) this._roamNpc(npc);
        continue;
      }
      const dist = distance(npc.x, npc.y, target.x, target.y);
      if (dist <= 1.01) {
        this._tryNpcDamagePlayer(npc, target);
        continue;
      }

      const stepX = target.x === npc.x ? 0 : target.x > npc.x ? 1 : -1;
      const stepY = target.y === npc.y ? 0 : target.y > npc.y ? 1 : -1;
      const candidates = [
        { x: npc.x + stepX, y: npc.y + stepY },
        { x: npc.x + stepX, y: npc.y },
        { x: npc.x, y: npc.y + stepY },
      ];
      const move = candidates.find((c) => this._isPassable(c.x, c.y));
      if (move) {
        npc.x = move.x;
        npc.y = move.y;
      }
    }
  }

  _roamNpc(npc) {
    const candidates = [
      { x: npc.x + 1, y: npc.y },
      { x: npc.x - 1, y: npc.y },
      { x: npc.x, y: npc.y + 1 },
      { x: npc.x, y: npc.y - 1 },
    ].filter((c) => this._isPassable(c.x, c.y));
    if (!candidates.length) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    npc.x = pick.x;
    npc.y = pick.y;
  }

  _tryNpcDamagePlayer(npc, target) {
    if (!target?.ready) return;
    if (this.completedSessions.has(target?.id)) return;
    if (!npc || !target || target.hp <= 0) return;
    if (this.state.worldPhase !== PHASE_EVENT_ACTIVE) return;
    const now = Date.now();
    const graceUntil = this.spawnProtectedUntilBySession.get(target.id) || 0;
    if (graceUntil > now) return;

    const pairKey = `${npc.id}:${target.id}`;
    const lastPairDamageAt = this.lastNpcDamageAtByNpcAndTarget.get(pairKey) || 0;
    const npcAttackCooldown = Math.max(800, NPC_ATTACK_COOLDOWN_MS - Math.max(0, this.state.eventLevel - 1) * 60);
    if (now - lastPairDamageAt < npcAttackCooldown) return;

    const lastTargetDamageAt = this.lastNpcDamageAtByTarget.get(target.id) || 0;
    if (now - lastTargetDamageAt < PLAYER_NPC_DAMAGE_COOLDOWN_MS) return;

    this.lastNpcDamageAtByNpcAndTarget.set(pairKey, now);
    this.lastNpcDamageAtByTarget.set(target.id, now);

    const npcDamage = NPC_CONTACT_DAMAGE + Math.min(8, Math.max(0, this.state.eventLevel - 1) * 2);
    const armorPct = clamp01(Number(target.armorPct) || 0);
    const reducedDamage = Math.max(1, Math.floor(npcDamage * (1 - armorPct)));
    target.hp = Math.max(0, target.hp - reducedDamage);
    if (target.hp > 0) return;

    if (target.secondWindAvailable && !target.secondWindUsed) {
      target.secondWindUsed = true;
      target.hp = Math.min(target.maxHp, 40);
      this.spawnProtectedUntilBySession.set(target.id, now + 1200);
      this.broadcast('system', { message: `${target.name} triggered SECOND WIND!`, mode: this.state.worldMode });
      return;
    }
    target.hp = 0;
    target.downs += 1;
    target.respawnAt = now + RESPAWN_DELAY_MS;
    this.broadcast('system', { message: `${target.name} was downed by ${npc.id}.`, mode: this.state.worldMode });
    this._schedulePlayerRespawn(target.id);
  }

  _tickObjectives() {
    if (this.state.worldPhase !== PHASE_EVENT_ACTIVE) return;
    if (this.state.eventObjectiveType === OBJECTIVE_SIGNAL_HACK) {
      for (const player of this.state.players) {
        if (!player || !player.ready || player.hp <= 0) continue;
        if (player.x === this.state.hackX && player.y === this.state.hackY) {
          player.objectiveProgress = Math.min(this.state.hackProgressTarget, (player.objectiveProgress || 0) + 1);
          this.state.objectiveProgress = Math.max(this.state.objectiveProgress, player.objectiveProgress);
        }
      }
    } else {
      let best = 0;
      for (const player of this.state.players) {
        if (!player || !player.ready) continue;
        player.objectiveProgress = player.kills || 0;
        best = Math.max(best, player.objectiveProgress);
      }
      this.state.objectiveProgress = best;
    }
  }

  _schedulePlayerRespawn(sessionId) {
    if (this.pendingRespawnBySession.get(sessionId)) return;
    const scheduledGeneration = this.runGeneration;
    this.pendingRespawnBySession.set(sessionId, true);
    this.clock.setTimeout(() => {
      this.pendingRespawnBySession.delete(sessionId);
      if (scheduledGeneration !== this.runGeneration) return;
      if (this.completedSessions.has(sessionId)) return;
      const live = this.playersBySession.get(sessionId);
      if (!live) return;
      if (live.hp > 0) return;
      const spawn = this._findRandomPassableTile();
      live.x = spawn.x;
      live.y = spawn.y;
      live.hp = live.maxHp;
      live.respawnAt = 0;
      this.spawnProtectedUntilBySession.set(sessionId, Date.now() + SPAWN_GRACE_MS);
    }, RESPAWN_DELAY_MS);
  }

  _setPlayerReady(sessionId) {
    const player = this.playersBySession.get(sessionId);
    if (!player || player.ready) return;
    player.ready = true;
    this.pendingReadyTimeoutBySession.delete(sessionId);
    player.hp = player.maxHp || PLAYER_MAX_HP;
    player.respawnAt = 0;
    this.missionStartedAtBySession.set(sessionId, Date.now());
    this.spawnProtectedUntilBySession.set(sessionId, Date.now() + SPAWN_GRACE_MS);
    this.lastActiveAtBySession.set(sessionId, Date.now());
    if (this.state.worldPhase === PHASE_RECOVERY || this.state.worldPhase === PHASE_MISSION_COMPLETE) {
      this._ensureUpgradeChoicesForReadyPlayers();
    }
  }

  _scheduleReadyTimeout(sessionId) {
    if (this.pendingReadyTimeoutBySession.get(sessionId)) return;
    this.pendingReadyTimeoutBySession.set(sessionId, true);
    this.clock.setTimeout(() => {
      this.pendingReadyTimeoutBySession.delete(sessionId);
      const player = this.playersBySession.get(sessionId);
      if (!player || player.ready) return;
      const client = this.clients.find((entry) => entry?.sessionId === sessionId);
      if (!client) return;
      client.leave(1000);
    }, READY_TIMEOUT_MS);
  }

  _markActivity(sessionId) {
    if (!sessionId) return;
    this.lastActiveAtBySession.set(sessionId, Date.now());
  }

  _tickIdleTimeouts() {
    const now = Date.now();
    for (const client of this.clients) {
      const sessionId = client?.sessionId;
      if (!sessionId) continue;
      const lastActiveAt = this.lastActiveAtBySession.get(sessionId) || now;
      if (now - lastActiveAt < IDLE_RESET_MS) continue;
      const player = this.playersBySession.get(sessionId);
      if (!player) continue;
      if (!player.ready) continue;
      client.leave(1000);
    }
  }

  _canExtractPlayer(sessionId, player) {
    if (!player?.ready) return false;
    if (this.state.worldPhase !== PHASE_EVENT_ACTIVE) return false;
    const startedAt = this.missionStartedAtBySession.get(sessionId) || 0;
    if (Date.now() - startedAt < MISSION_SURVIVE_MS) return false;
    if (!this._isObjectiveCompleteForPlayer(player)) return false;
    return this._isExtractionTile(player?.x, player?.y);
  }

  _isExtractionTile(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const ex = Number(this.state.extractionX);
    const ey = Number(this.state.extractionY);
    if (Number.isFinite(ex) && Number.isFinite(ey) && this._isPassable(ex, ey)) {
      return x === ex && y === ey;
    }
    const fallbackX = MAP_WIDTH - 2;
    const fallbackY = MAP_HEIGHT - 2;
    return this._isPassable(fallbackX, fallbackY) && x === fallbackX && y === fallbackY;
  }

  _scheduleNpcRespawn(npcId) {
    if (this.pendingRespawnByNpcId.has(npcId)) return;
    const scheduledGeneration = this.runGeneration;
    this.pendingRespawnByNpcId.set(npcId, true);
    this.clock.setTimeout(() => {
      this.pendingRespawnByNpcId.delete(npcId);
      if (scheduledGeneration !== this.runGeneration) return;
      const npc = this.state.npcs.find((entry) => entry.id === npcId);
      if (!npc) return;
      if (npc.hp > 0) return;
      const spawn = this._findRandomPassableTileAwayFromPlayers(NPC_RESPAWN_MIN_DISTANCE);
      npc.x = spawn.x;
      npc.y = spawn.y;
      const npcMaxHp = this._scaledNpcMaxHp();
      npc.hp = npcMaxHp;
      npc.maxHp = npcMaxHp;
      npc.targetSessionId = '';
    }, NPC_RESPAWN_DELAY_MS);
  }

  _scaledNpcMaxHp() {
    return NPC_MAX_HP + Math.min(50, Math.max(0, this.state.eventLevel - 1) * 10);
  }

  _scaledKillTarget() {
    return MISSION_REQUIRED_KILLS + Math.min(5, Math.floor(Math.max(0, this.state.eventLevel - 1) / 1));
  }

  _setupObjectiveForLevel() {
    this.state.objectiveProgress = 0;
    const scannerBonus = this._scannerTargetBonus();
    this.state.objectiveTarget = Math.max(1, this._scaledKillTarget() - scannerBonus);
    this.state.eventObjectiveType = this.state.eventLevel % 2 === 0 ? OBJECTIVE_SIGNAL_HACK : OBJECTIVE_PATROL_SWEEP;
    const extractionTile = this._findRandomPassableTileAwayFromPlayers(4);
    this.state.extractionX = extractionTile.x;
    this.state.extractionY = extractionTile.y;
    const hackTile = this._findRandomPassableTileAwayFromPlayers(4);
    this.state.hackX = hackTile.x;
    this.state.hackY = hackTile.y;
    const baseHackTarget = 30 + Math.min(40, this.state.eventLevel * 5);
    this.state.hackProgressTarget = Math.max(10, baseHackTarget - (scannerBonus * 6));
  }

  _isObjectiveComplete() {
    if (this.state.eventObjectiveType === OBJECTIVE_SIGNAL_HACK) {
      return this.state.objectiveProgress >= this.state.hackProgressTarget;
    }
    return this.state.objectiveProgress >= this.state.objectiveTarget;
  }

  _isObjectiveCompleteForPlayer(player) {
    if (!player) return false;
    if (this.state.eventObjectiveType === OBJECTIVE_SIGNAL_HACK) {
      return this.state.objectiveProgress >= this.state.hackProgressTarget;
    }
    return (player.kills || 0) >= this.state.objectiveTarget;
  }

  _currentObjectiveProgressForPlayer(sessionId) {
    const player = this.playersBySession.get(sessionId);
    if (!player) return 0;
    if (this.state.eventObjectiveType === OBJECTIVE_SIGNAL_HACK) return player.objectiveProgress || 0;
    return player.kills || 0;
  }

  _applyUpgrade(player, upgradeId) {
    const picked = String(upgradeId || '');
    const known = new Set(UPGRADE_POOL.map((u) => u.id));
    if (!known.has(picked)) return;
    const upgrades = safeParseJsonArray(player.upgradesJson);
    if (upgrades.includes(picked)) return;
    upgrades.push(picked);
    player.upgradesJson = JSON.stringify(upgrades);
    if (picked === 'street_medic') {
      player.maxHp += 25;
      player.hp = player.maxHp;
    } else if (picked === 'spray_damage') {
      player.attackDamage += 10;
    } else if (picked === 'quick_trigger') {
      player.attackCooldownMs = Math.max(MIN_ATTACK_COOLDOWN_MS, player.attackCooldownMs - 150);
    } else if (picked === 'armour_plate') {
      player.armorPct = Math.min(0.6, player.armorPct + 0.2);
    } else if (picked === 'second_wind') {
      player.secondWindAvailable = true;
      player.secondWindUsed = false;
    } else if (picked === 'scanner') {
      // Scanner modifies next-level objective thresholds in _setupObjectiveForLevel().
    }
  }

  _scannerTargetBonus() {
    for (const player of this.state.players) {
      if (!player || !player.ready) continue;
      const upgrades = safeParseJsonArray(player.upgradesJson);
      if (upgrades.includes('scanner')) return 2;
    }
    return 0;
  }
}

function resolveApiBase() {
  return String(process.env.MOONBOYS_API_BASE || DEFAULT_MOONBOYS_API_BASE).replace(/\/$/, '');
}

async function validateMultiplayerEntry(options = {}) {
  const telegramAuth = normalizeAuthPayload(options.telegram_auth ?? options.telegramAuth ?? options.identity_token);
  if (!telegramAuth) {
    return { ok: false, reason: 'telegram_required' };
  }

  const apiBase = resolveApiBase();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('progression_timeout'), PROGRESSION_FETCH_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch(`${apiBase}/blocktopia/progression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: telegramAuth }),
      signal: controller.signal,
    });
  } catch {
    return { ok: false, reason: 'progression_unavailable' };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response) {
    return { ok: false, reason: 'progression_unavailable' };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    return { ok: false, reason: 'auth_invalid' };
  }

  const arcadeXpTotal = Math.max(0, Math.floor(Number(payload?.progression?.arcade_xp_total) || 0));
  if (arcadeXpTotal < BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP) {
    return { ok: false, reason: 'xp_required' };
  }

  return { ok: true };
}

function normalizeAuthPayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function safeParseJsonArray(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || ''));
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => String(entry || ''));
  } catch {
    return [];
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pickUpgradeChoices(existingUpgradesJson) {
  const existing = new Set(safeParseJsonArray(existingUpgradesJson));
  const available = UPGRADE_POOL.filter((entry) => !existing.has(entry.id));
  if (available.length <= 3) return available.map((entry) => entry.id);
  const picks = [];
  const pool = available.slice();
  while (pool.length && picks.length < 3) {
    const index = Math.floor(Math.random() * pool.length);
    const [pick] = pool.splice(index, 1);
    if (!pick) continue;
    picks.push(pick.id);
  }
  return picks;
}

function toUpgradeMeta(upgradeId) {
  const match = UPGRADE_POOL.find((entry) => entry.id === upgradeId);
  if (!match) return { id: String(upgradeId || ''), name: String(upgradeId || '').toUpperCase(), description: 'Run upgrade' };
  return { id: match.id, name: match.name, description: match.description };
}

function buildTerrainGrid(width, height) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = [];
    for (let x = 0; x < width; x += 1) {
      row.push(decideTerrain(x, y));
    }
    rows.push(row);
  }
  forceRoad(rows, 1, 1);
  forceRoad(rows, 2, 1);
  forceRoad(rows, 1, 2);
  forceRoad(rows, width - 2, height - 2);
  forceRoad(rows, width - 3, height - 2);
  forceRoad(rows, width - 2, height - 3);
  return rows;
}

function decideTerrain(x, y) {
  const lineRoad = x % 5 === 0 || y % 5 === 0;
  const diagonalRoad = (x + y) % 7 === 0;
  const hash = ((x + 17) * 928371 + (y + 31) * 192847 + x * y * 11939) % 1000;
  if (lineRoad || diagonalRoad) return 'road';
  if (hash < 125) return 'block';
  return 'grass';
}

function forceRoad(rows, x, y) {
  if (y < 0 || y >= rows.length) return;
  const row = rows[y];
  if (!row || x < 0 || x >= row.length) return;
  row[x] = 'road';
}

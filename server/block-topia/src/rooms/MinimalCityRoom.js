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
const NPC_CONTACT_DAMAGE = 12;
const NPC_ATTACK_COOLDOWN_MS = 1200;
const PLAYER_NPC_DAMAGE_COOLDOWN_MS = 1000;
const SPAWN_GRACE_MS = 4000;
const RESPAWN_DELAY_MS = 3000;
const NPC_RESPAWN_DELAY_MS = 6500;
const NPC_RESPAWN_MIN_DISTANCE = 4;
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
  }
}

defineTypes(MinimalRoomState, {
  players: [PlayerState],
  npcs: [NpcState],
  worldMode: 'string',
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
    this.completedSessions = new Set();
    this.terrain = buildTerrainGrid(MAP_WIDTH, MAP_HEIGHT);
    this._seedNpcs();

    this.onMessage('move', (client, data) => {
      const player = this.playersBySession.get(client.sessionId);
      if (!player) return;

      const nextX = Number(data?.x);
      const nextY = Number(data?.y);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

      const x = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(nextX)));
      const y = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(nextY)));
      if (!this._isPassable(x, y)) return;

      player.x = x;
      player.y = y;
    });

    this.onMessage('attack', (client) => {
      const player = this.playersBySession.get(client.sessionId);
      if (this.completedSessions.has(client.sessionId)) return;
      if (!player || player.hp <= 0) return;
      const now = Date.now();
      const lastAttackAt = this.lastAttackAtBySession.get(client.sessionId) || 0;
      if (now - lastAttackAt < ATTACK_COOLDOWN_MS) return;
      this.lastAttackAtBySession.set(client.sessionId, now);
      const target = this._findNearestNpc(player, ATTACK_RANGE);
      if (!target) return;
      target.hp = Math.max(0, target.hp - ATTACK_DAMAGE);
      if (target.hp <= 0) {
        player.kills += 1;
        this.broadcast('system', { message: `${player.name} neutralized ${target.id}.`, mode: this.state.worldMode });
        this._scheduleNpcRespawn(target.id);
      }
    });

    this.onMessage('extract', (client) => {
      const player = this.playersBySession.get(client.sessionId);
      if (!player) return;
      this.completedSessions.add(client.sessionId);
      player.hp = Math.max(1, player.hp);
      player.respawnAt = 0;
    });

    this.clock.setInterval(() => {
      this._tickNpcs();
      this._updateWorldMode();
    }, SIM_TICK_MS);
  }

  async onJoin(client, options = {}) {
    const validation = await validateMultiplayerEntry(options);
    if (!validation.ok) {
      throw new Error(validation.reason);
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

    this.state.players.push(player);
    this.playersBySession.set(client.sessionId, player);
    this.completedSessions.delete(client.sessionId);
    this.spawnProtectedUntilBySession.set(client.sessionId, Date.now() + SPAWN_GRACE_MS);
    this._updateWorldMode();

    this.broadcast('system', {
      message: `${player.name} joined Block Topia (${this.state.worldMode}).`,
      map: { width: MAP_WIDTH, height: MAP_HEIGHT },
      playerSpeed: PLAYER_SPEED_HINT,
      npcCount: this.state.npcs.length,
      mode: this.state.worldMode,
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
    if (player) {
      const index = this.state.players.findIndex((entry) => entry.id === client.sessionId);
      if (index >= 0) this.state.players.splice(index, 1);
      this.broadcast('system', { message: `${player.name} left the city.` });
    }
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
    for (let i = 0; i < 1000; i += 1) {
      const x = Math.floor(Math.random() * MAP_WIDTH);
      const y = Math.floor(Math.random() * MAP_HEIGHT);
      if (!this._isPassable(x, y)) continue;
      if (minDistance <= 0) return { x, y };
      const tooClose = this.state.players.some((player) => player && player.hp > 0 && distance(x, y, player.x, player.y) < minDistance);
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
      if (!player || player.hp <= 0) continue;
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
        continue;
      }

      npc.targetSessionId = target.id;
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

  _tryNpcDamagePlayer(npc, target) {
    if (this.completedSessions.has(target?.id)) return;
    if (!npc || !target || target.hp <= 0) return;
    const now = Date.now();
    const graceUntil = this.spawnProtectedUntilBySession.get(target.id) || 0;
    if (graceUntil > now) return;

    const pairKey = `${npc.id}:${target.id}`;
    const lastPairDamageAt = this.lastNpcDamageAtByNpcAndTarget.get(pairKey) || 0;
    if (now - lastPairDamageAt < NPC_ATTACK_COOLDOWN_MS) return;

    const lastTargetDamageAt = this.lastNpcDamageAtByTarget.get(target.id) || 0;
    if (now - lastTargetDamageAt < PLAYER_NPC_DAMAGE_COOLDOWN_MS) return;

    this.lastNpcDamageAtByNpcAndTarget.set(pairKey, now);
    this.lastNpcDamageAtByTarget.set(target.id, now);

    target.hp = Math.max(0, target.hp - NPC_CONTACT_DAMAGE);
    if (target.hp > 0) return;

    target.hp = 0;
    target.downs += 1;
    target.respawnAt = now + RESPAWN_DELAY_MS;
    this.broadcast('system', { message: `${target.name} was downed by ${npc.id}.`, mode: this.state.worldMode });
    this._schedulePlayerRespawn(target.id);
  }

  _schedulePlayerRespawn(sessionId) {
    if (this.pendingRespawnBySession.get(sessionId)) return;
    this.pendingRespawnBySession.set(sessionId, true);
    this.clock.setTimeout(() => {
      this.pendingRespawnBySession.delete(sessionId);
      const live = this.playersBySession.get(sessionId);
      if (!live) return;
      const spawn = this._findRandomPassableTile();
      live.x = spawn.x;
      live.y = spawn.y;
      live.hp = PLAYER_MAX_HP;
      live.respawnAt = 0;
      this.spawnProtectedUntilBySession.set(sessionId, Date.now() + SPAWN_GRACE_MS);
    }, RESPAWN_DELAY_MS);
  }

  _scheduleNpcRespawn(npcId) {
    if (this.pendingRespawnByNpcId.has(npcId)) return;
    this.pendingRespawnByNpcId.set(npcId, true);
    this.clock.setTimeout(() => {
      this.pendingRespawnByNpcId.delete(npcId);
      const npc = this.state.npcs.find((entry) => entry.id === npcId);
      if (!npc) return;
      const spawn = this._findRandomPassableTileAwayFromPlayers(NPC_RESPAWN_MIN_DISTANCE);
      npc.x = spawn.x;
      npc.y = spawn.y;
      npc.hp = NPC_MAX_HP;
      npc.maxHp = NPC_MAX_HP;
      npc.targetSessionId = '';
    }, NPC_RESPAWN_DELAY_MS);
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

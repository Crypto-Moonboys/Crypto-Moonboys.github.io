import { Room } from 'colyseus';
import { Schema, ArraySchema, defineTypes } from '@colyseus/schema';
import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP } from '../../../../shared/blocktopia/constants.js';

const MAP_WIDTH = 20;
const MAP_HEIGHT = 20;
const PLAYER_SPEED_HINT = 3.2;
const DEFAULT_MOONBOYS_API_BASE = 'https://moonboys-api.sercullen.workers.dev';

const SPAWN_SLOTS = [
  { x: 6, y: 10 },
  { x: 14, y: 10 },
];

class PlayerState extends Schema {
  constructor() {
    super();
    this.id = '';
    this.x = 0;
    this.y = 0;
    this.name = '';
    this.faction = 'Liberators';
    this.district = 'neon-slums';
  }
}

defineTypes(PlayerState, {
  id: 'string',
  x: 'number',
  y: 'number',
  name: 'string',
  faction: 'string',
  district: 'string',
});

class MinimalRoomState extends Schema {
  constructor() {
    super();
    this.players = new ArraySchema();
  }
}

defineTypes(MinimalRoomState, {
  players: [PlayerState],
});

export class MinimalCityRoom extends Room {
  onCreate() {
    this.setState(new MinimalRoomState());
    this.maxClients = 2;
    // Keep the city room alive even when empty so join("city") never races
    // against room disposal and returns 4211.
    this.autoDispose = false;
    this.playersBySession = new Map();

    this.onMessage('move', (client, data) => {
      const player = this.playersBySession.get(client.sessionId);
      if (!player) {
        console.warn(`[MinimalCityRoom] move rejected: no player for session=${client.sessionId}`);
        return;
      }

      const nextX = Number(data?.x);
      const nextY = Number(data?.y);
      console.log(`[MinimalCityRoom] move received session=${client.sessionId} x=${nextX} y=${nextY} (from ${player.x},${player.y})`);

      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
        console.warn(`[MinimalCityRoom] move rejected: non-finite coords x=${data?.x} y=${data?.y} session=${client.sessionId}`);
        return;
      }

      const x = Math.max(0, Math.min(19, nextX));
      const y = Math.max(0, Math.min(19, nextY));

      player.x = x;
      player.y = y;
      console.log('[MOVE APPLIED]', client.sessionId, x, y);
    });
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

    this.broadcast('system', {
      message: `${player.name} joined the 2-player city.`,
      map: { width: MAP_WIDTH, height: MAP_HEIGHT },
      playerSpeed: PLAYER_SPEED_HINT,
    });
  }

  onLeave(client) {
    const player = this.playersBySession.get(client.sessionId);
    this.playersBySession.delete(client.sessionId);
    if (player) {
      const index = this.state.players.findIndex((entry) => entry.id === client.sessionId);
      if (index >= 0) this.state.players.splice(index, 1);
    }

    if (player) {
      this.broadcast('system', { message: `${player.name} left the city.` });
    }
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
  const response = await fetch(`${apiBase}/blocktopia/progression`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_auth: telegramAuth }),
  }).catch(() => null);

  if (!response) {
    return { ok: false, reason: 'auth_invalid' };
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

import { Room } from 'colyseus';
import { Schema, ArraySchema, defineTypes } from '@colyseus/schema';
import { clampPosition, validateMovement } from '../systems/player-system.js';

const MAP_WIDTH = 20;
const MAP_HEIGHT = 20;
const PLAYER_SPEED_HINT = 3.2;
const MAX_MOVE_DISTANCE = 5;

// Minimal blocked cells for server-authoritative passability validation.
const BLOCKED_CELLS = new Set([
  '9,9',
  '9,10',
  '10,9',
  '10,10',
  '4,15',
  '15,4',
]);

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
    this.playersBySession = new Map();

    this.onMessage('move', (client, data) => {
      const player = this.playersBySession.get(client.sessionId);
      if (!player) return;

      const nextX = Number(data?.x);
      const nextY = Number(data?.y);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

      const next = clampPosition(nextX, nextY, { min: 0, max: MAP_WIDTH - 1 });
      const previous = { x: player.x, y: player.y };
      if (!validateMovement(previous, next, MAX_MOVE_DISTANCE)) return;
      if (!this.isPassable(next.x, next.y)) return;

      player.x = next.x;
      player.y = next.y;
    });
  }

  onJoin(client, options = {}) {
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

  isPassable(x, y) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= MAP_WIDTH || iy >= MAP_HEIGHT) return false;
    return !BLOCKED_CELLS.has(`${ix},${iy}`);
  }
}

import { Room } from 'colyseus';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

const MAP_WIDTH = 20;
const MAP_HEIGHT = 20;
const PLAYER_SPEED_HINT = 3.2;

const SPAWN_SLOTS = [
  { x: 6, y: 10 },
  { x: 14, y: 10 },
];

class PlayerState extends Schema {
  x = 0;
  y = 0;
  name = '';
  faction = 'Liberators';
  district = 'neon-slums';
}

defineTypes(PlayerState, {
  x: 'number',
  y: 'number',
  name: 'string',
  faction: 'string',
  district: 'string',
});

class MinimalRoomState extends Schema {
  players = new MapSchema();
}

defineTypes(MinimalRoomState, {
  players: { map: PlayerState },
});

export class MinimalCityRoom extends Room {
  onCreate() {
    this.setState(new MinimalRoomState());
    this.maxClients = 2;

    this.onMessage('move', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const nextX = Number(data?.x);
      const nextY = Number(data?.y);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

      player.x = Math.max(0, Math.min(MAP_WIDTH - 1, nextX));
      player.y = Math.max(0, Math.min(MAP_HEIGHT - 1, nextY));
    });
  }

  onJoin(client, options = {}) {
    const slotIndex = this.state.players.size % SPAWN_SLOTS.length;
    const spawn = SPAWN_SLOTS[slotIndex];

    const player = new PlayerState();
    player.x = spawn.x;
    player.y = spawn.y;
    player.name = String(options?.name || `Player_${this.state.players.size + 1}`).slice(0, 24);
    player.faction = String(options?.faction || 'Liberators').slice(0, 24);
    player.district = String(options?.district || 'neon-slums').slice(0, 32);

    this.state.players.set(client.sessionId, player);

    this.broadcast('system', {
      message: `${player.name} joined the 2-player city.`,
      map: { width: MAP_WIDTH, height: MAP_HEIGHT },
      playerSpeed: PLAYER_SPEED_HINT,
    });
  }

  onLeave(client) {
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (player) {
      this.broadcast('system', { message: `${player.name} left the city.` });
    }
  }
}


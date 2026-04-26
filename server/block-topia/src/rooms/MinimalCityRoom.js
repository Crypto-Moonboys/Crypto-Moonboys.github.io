import { Room } from 'colyseus';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

const MAP_WIDTH = 20;
const MAP_HEIGHT = 20;
const PLAYER_SPEED_HINT = 3.2;

const SPAWN_SLOTS = [
  { x: 6, y: 10 },
  { x: 14, y: 10 },
];

// Mirror the client's tile map so the server can validate passability.
// Must stay in sync with the decideTerrain() / forceRoad() logic in
// games/block-topia/main.js.
function isPassable(x, y) {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;

  // Forced-road overrides applied by forceRoad() in main.js (spawn surrounds).
  // Some of these would be blocks under the hash formula — the override wins.
  if ((x === 1 && y === 1) || (x === 2 && y === 1) || (x === 1 && y === 2)) return true;
  if (
    (x === MAP_WIDTH - 2 && y === MAP_HEIGHT - 2) ||
    (x === MAP_WIDTH - 3 && y === MAP_HEIGHT - 2) ||
    (x === MAP_WIDTH - 2 && y === MAP_HEIGHT - 3)
  ) return true;

  // Road tiles (line roads and diagonal roads) are always passable.
  if (x % 5 === 0 || y % 5 === 0 || (x + y) % 7 === 0) return true;

  // Deterministic block hash — same formula as decideTerrain() in main.js.
  const hash = ((x + 17) * 928371 + (y + 31) * 192847 + x * y * 11939) % 1000;
  return hash >= 125; // hash < 125 → block tile
}

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

      const nextX = Math.floor(Number(data?.x));
      const nextY = Math.floor(Number(data?.y));
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

      // Server is the source of truth — reject moves into blocked or out-of-bounds tiles.
      if (!isPassable(nextX, nextY)) return;

      player.x = nextX;
      player.y = nextY;
      // Colyseus automatically broadcasts the schema delta to all clients.
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


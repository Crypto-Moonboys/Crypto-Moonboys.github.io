import { Room } from 'colyseus';
import { Schema, MapSchema, type } from '@colyseus/schema';

class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') xp = 0;
}

class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema();
}

export class CityRoom extends Room {
  onCreate(options) {
    this.setState(new RoomState());
    this.maxClients = 100;

    console.log('🏙️ CityRoom created', options);

    // Handle player movement
    this.onMessage('move', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const { x, y } = data;

      // Basic server-side validation
      if (typeof x === 'number' && typeof y === 'number') {
        player.x = Math.max(0, Math.min(100, x));
        player.y = Math.max(0, Math.min(100, y));
      }
    });

    // Interaction messages
    this.onMessage('interact', (client, data) => {
      this.broadcast('interaction', {
        playerId: client.sessionId,
        target: data?.target || null,
      });
    });
  }

  onJoin(client, options) {
    console.log(`👤 Player joined: ${client.sessionId}`);

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = options?.name || 'Rebel';
    player.x = 50;
    player.y = 50;

    this.state.players.set(client.sessionId, player);

    this.broadcast('system', {
      message: `${player.name} has entered Block Topia.`,
    });
  }

  onLeave(client) {
    console.log(`👤 Player left: ${client.sessionId}`);
    this.state.players.delete(client.sessionId);

    this.broadcast('system', {
      message: `A rebel has left the city.`,
    });
  }

  onDispose() {
    console.log('🗑️ CityRoom disposed');
  }
}
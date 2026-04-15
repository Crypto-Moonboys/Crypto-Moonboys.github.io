# Block Topia Multiplayer Server

This directory contains the Colyseus-based multiplayer backend for Block Topia. The server is designed to run on a Contabo VPS and provide authoritative room-based gameplay for the frontend hosted on GitHub Pages.

## Features
- Room-based multiplayer using Colyseus
- Support for up to 100 players per `CityRoom`
- Server-authoritative player movement
- Basic interaction messaging
- SAM webhook endpoint for live world events
- Health check endpoint for monitoring

## Folder Structure
```
server/block-topia/
  package.json
  README.md
  src/
    index.js
    rooms/
      CityRoom.js
    webhooks/
      samWebhook.js
```

## Prerequisites
- Node.js 18 or higher
- npm or yarn

## Installation
```bash
cd server/block-topia
npm install
```

## Running the Server
### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The server will start on port `2567` by default. You can override this using an environment variable:

```bash
PORT=3000 npm start
```

## Endpoints
| Endpoint | Description |
|---------|-------------|
| `/health` | Health check for monitoring |
| `/colyseus` | Colyseus monitor dashboard |
| `/webhooks/sam` | Receives events from the SAM wiki agent |

## Connecting from the Client
Install the Colyseus client in your frontend project:

```bash
npm install colyseus.js
```

Example connection code:

```javascript
import { Client } from 'colyseus.js';

const client = new Client('wss://your-domain.com');
const room = await client.joinOrCreate('city', { name: 'Rebel' });

room.onStateChange((state) => {
  console.log('Room state updated:', state);
});

room.send('move', { x: 10, y: 20 });
```

## Deployment Notes
- Host this server on your Contabo VPS.
- Use Cloudflare to proxy WebSocket traffic and provide SSL.
- Ensure the VPS firewall allows inbound traffic on the configured port.

## Next Steps
- Add Redis for presence and scaling.
- Integrate PostgreSQL for persistent player data.
- Implement faction, district, and quest systems on the server.
- Broadcast SAM-driven Signal Rush events to active rooms.

---

Block Topia is now ready to evolve into a fully multiplayer living city.

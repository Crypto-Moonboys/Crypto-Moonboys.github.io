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

## Deployment Notes (Nginx + Let's Encrypt + Colyseus)
- Host this server on your Contabo VPS.
- Ensure the VPS firewall allows inbound traffic on ports 80/443.
- Keep the Colyseus process running locally on `127.0.0.1:2567`.
- Client default endpoint is `wss://game.cryptomoonboys.com`, so `game.cryptomoonboys.com` must terminate TLS on `443` and reverse-proxy to `127.0.0.1:2567`.

### Nginx Two-Phase Rollout

Use the templates in:

```
server/block-topia/deploy/nginx/cryptomoonboys.com.phase1.conf
server/block-topia/deploy/nginx/cryptomoonboys.com.phase2.conf
```

#### Phase 1 (HTTP-only, before SSL issuance)

```bash
sudo cp server/block-topia/deploy/nginx/cryptomoonboys.com.phase1.conf /etc/nginx/sites-available/cryptomoonboys.com
sudo ln -s /etc/nginx/sites-available/cryptomoonboys.com /etc/nginx/sites-enabled/cryptomoonboys.com
sudo nginx -t
sudo systemctl reload nginx
```

Issue certificates with webroot:

```bash
sudo certbot certonly --webroot -w /var/www/cryptomoonboys.com \
  -d cryptomoonboys.com -d www.cryptomoonboys.com
```

#### Phase 2 (HTTPS enabled + HTTP redirect)

```bash
sudo cp server/block-topia/deploy/nginx/cryptomoonboys.com.phase2.conf /etc/nginx/sites-available/cryptomoonboys.com
sudo nginx -t
sudo systemctl reload nginx
```

### Game Subdomain (required for multiplayer)

Use the dedicated game vhost template:

```
server/block-topia/deploy/nginx/game.cryptomoonboys.com.conf
```

Install and enable:

```bash
sudo cp server/block-topia/deploy/nginx/game.cryptomoonboys.com.conf /etc/nginx/sites-available/game.cryptomoonboys.com
sudo ln -s /etc/nginx/sites-available/game.cryptomoonboys.com /etc/nginx/sites-enabled/game.cryptomoonboys.com
sudo nginx -t
sudo systemctl reload nginx
```

Issue TLS certificate for the game host:

```bash
sudo certbot certonly --webroot -w /var/www/cryptomoonboys.com -d game.cryptomoonboys.com
sudo nginx -t
sudo systemctl reload nginx
```

## Next Steps
- Add Redis for presence and scaling.
- Integrate PostgreSQL for persistent player data.
- Implement faction, district, and quest systems on the server.
- Broadcast SAM-driven Signal Rush events to active rooms.

---

Block Topia is now ready to evolve into a fully multiplayer living city.

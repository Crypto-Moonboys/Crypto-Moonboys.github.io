# Block Topia Multiplayer Server

This directory contains the Colyseus-based multiplayer backend for Block Topia Live City (`/games/block-topia/`). The server is designed to run on a Contabo VPS and provide authoritative room-based gameplay for the frontend hosted on GitHub Pages.

## Features
- Room-based multiplayer using Colyseus (`MinimalCityRoom`)
- 2-player cap per room
- Server-authoritative player movement, NPCs, attacks, HP, downs, and respawns
- Timed world phases (FREE_ROAM → WARNING → EVENT_ACTIVE → RECOVERY → MISSION_COMPLETE)
- Objectives and extraction
- Upgrade choices generated in RECOVERY / MISSION_COMPLETE phases
- SAM webhook endpoint stub (not live world control)
- Health check endpoint for monitoring

## Folder Structure
```
server/block-topia/
  package.json
  README.md
  src/
    index.js
    rooms/
      MinimalCityRoom.js
    webhooks/
      samWebhook.js
```

## Prerequisites
- Node.js 22 or higher (required by Colyseus 0.17)
- npm or yarn

## Installation
```bash
cd server/block-topia
npm ci
```

## Running the Server
### Development
```bash
npm run dev
```

### Production
```bash
NODE_ENV=production npm start
```

The server will start on port `2567` by default. You can override this using an environment variable:

```bash
PORT=3000 npm start
```

## Environment Variables

Copy `.env.example` to `.env` and configure before starting:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `2567` | Server listen port |
| `NODE_ENV` | Yes (prod) | `development` | Set to `production` in production |
| `CORS_ORIGIN` | No | `https://cryptomoonboys.com` | Comma-separated allowed browser origins |
| `MONITOR_USERNAME` | No | `admin` | Username for `/colyseus` monitor Basic Auth |
| `MONITOR_PASSWORD` | **Yes in production** | _(none)_ | Password for `/colyseus` monitor. **Required in production** — if not set, `/colyseus` is disabled entirely |
| `BLOCKTOPIA_FREE_ROAM_MS` | No | `600000` (prod) / `60000` (dev) | Free-roam phase duration in ms |
| `BLOCKTOPIA_WARNING_MS` | No | `10000` | Event-incoming warning duration in ms |
| `BLOCKTOPIA_EVENT_MS` | No | `90000` | Active event phase duration in ms |
| `BLOCKTOPIA_RECOVERY_MS` | No | `600000` (prod) / `30000` (dev) | Recovery/upgrade phase duration in ms |
| `BLOCKTOPIA_MISSION_COMPLETE_MS` | No | `8000` | Mission-complete display phase in ms |

## Endpoints
| Endpoint | Auth | Description |
|---------|------|-------------|
| `/health` | None | Health check — always public |
| `/colyseus` | Basic Auth | Colyseus monitor dashboard — requires `MONITOR_PASSWORD` in production |
| `/webhooks/sam` | None | Receives events from the SAM wiki agent |

### Colyseus Monitor

The `/colyseus` monitor dashboard is protected by HTTP Basic Auth in all environments.

- **Development**: username `admin`, password from `.env` (or blank = unprotected in dev only)
- **Production**: **MONITOR_PASSWORD must be set**. If it is missing, the `/colyseus` route returns 404.

Set credentials:
```bash
MONITOR_USERNAME=admin MONITOR_PASSWORD=<secret> npm start
```

## Connecting from the Client
The website's `colyseus-client.mjs` reads `/health` before joining. Servers with
`client_protocol: "0.17"` serve the exact installed browser SDK at
`/client/colyseus.js`. Legacy servers without that field use the pinned 0.16.22
client until the VPS is upgraded. Failed/unknown health responses do not select
a guessed protocol. A fresh connection checks health again, including rollback.

For a separate client targeting the upgraded server:

```bash
npm install @colyseus/sdk@0.17.43
```

Example connection code:

```javascript
import { Client } from '@colyseus/sdk';

const client = new Client('wss://your-domain.com');
// Use the same verified Telegram auth payload as the website; XP is checked by the server.
const room = await client.join('city', { name: 'Rebel', telegram_auth: telegramAuth });

room.onStateChange((state) => {
  console.log('Room state updated:', state);
});

room.send('ready');
// Movement must be adjacent, passable and within the server's cooldown.
```

## Deployment Notes (Nginx + Let's Encrypt + Colyseus)
- Host this server on your Contabo VPS.
- Ensure the VPS firewall allows inbound traffic on ports 80/443.
- Keep the Colyseus process running locally on `127.0.0.1:2567`.
- Client default endpoint is `wss://game.cryptomoonboys.com`, so `game.cryptomoonboys.com` must terminate TLS on `443` and reverse-proxy to `127.0.0.1:2567`.

### Security dependency upgrade (29 September 2026)

The server now uses explicit Colyseus core/monitor/WebSocket modules on 0.17,
schema 4 and a pinned matching SDK. The unused umbrella package's OAuth, Redis
and uWebSockets peer trees were removed. Nano ID, WebSocket and Express parser
dependencies are patched. `npm audit` in this directory reports zero findings
at this revision, down from 16; there are no audit suppressions or overrides.

Colyseus 0.17 uses numeric leave codes. Only `CloseCode.CONSENTED` is an explicit
leave; disconnected ready players retain the existing 60-second warm slot.
The website retains control of reconnect timing rather than also using the
SDK's automatic retries. Express and Colyseus HTTP routes use the same CORS
allowlist. Two-player capacity, XP gating, server-owned movement and rewards
retain their existing rules.

After merge, the Pages change can publish before the VPS upgrade because it
still supports the old server protocol. On the VPS, in the repository checkout:

```bash
node --version # must be v22 or newer; upgrade Node before installing if needed
git switch main
git pull --ff-only origin main
npm ci --prefix server/block-topia --omit=dev
npm audit --prefix server/block-topia
npm test --prefix server/block-topia
```

Restart the **existing Block Topia process** using its current service manager
(for PM2, use `pm2 ls` to identify it, then `pm2 restart <existing-name> --update-env`).
Keep its production environment, Telegram/API configuration and monitor secret.
If Node was upgraded, ensure that service uses the new Node executable too.
Verify `https://game.cryptomoonboys.com/health` reports `client_protocol: "0.17"`,
then reload `/games/block-topia/` and check an authenticated join and reconnect.
Restarting this in-memory server disconnects current rooms; schedule accordingly.
**No D1 migration or Cloudflare Worker deploy is required.**

`npm test` exercises actual HTTP and WebSocket connections with a local-only
progression fixture. CI installs and audits this separate lockfile explicitly.

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
- Add Redis for presence and scaling (future phase).
- Integrate PostgreSQL for persistent player data (future phase).
- Implement faction, district, and quest systems on the server (future phase).
- Wire SAM-driven Signal Rush events to active rooms once SAM webhook stub is properly specced and tested.

## Current Product Split

- `/games/block-topia/` = Block Topia Live City, current gated 2-player Colyseus survival/mission prototype.
- `/games/block-topia-quest-maze/` = separate Quest Maze arcade/RPG score game.
- `/games/city-block-topia/` or `/games/block-topia/neon-sprawl/` = planned City Block Topia / Neon Sprawl deeper living-wiki layer, not current live runtime.

## Do Not Drift

- Do not describe Block Topia Live City as a clean map base only.
- Do not merge City Block Topia / Neon Sprawl into the current live Block Topia page.
- Do not claim SAM, seasons, full economy, full HODL Wars, or Neon Sprawl integration are live unless the code is wired, accessible, tested, and documented.
- Do not blur Score, Arcade XP, Faction XP, Block Topia XP / City XP, Rebel Ink, tokens, or NFTs.

---

Block Topia Live City is running. Evolve it in deliberate phases.

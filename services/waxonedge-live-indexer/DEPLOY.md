# WaxOnEdge Live Indexer VPS Deployment

This guide wires the existing WaxOnEdge live indexer skeleton for VPS runtime checks. It does not enable production Worker proxying or switch the frontend from safe snapshot polling.

## Requirements

- Linux VPS with systemd or PM2.
- Node.js 22 or newer.
- Git access to `Crypto-Moonboys/Crypto-Moonboys.github.io`.
- A private service port bound to `127.0.0.1` by default.
- No secrets committed to the repository.

## Install

```bash
sudo useradd --system --home /opt/crypto-moonboys --shell /usr/sbin/nologin waxonedge
sudo mkdir -p /opt/crypto-moonboys
sudo chown waxonedge:waxonedge /opt/crypto-moonboys
sudo -u waxonedge git clone https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io.git /opt/crypto-moonboys
cd /opt/crypto-moonboys/services/waxonedge-live-indexer
npm install --omit=dev
```

For an existing checkout:

```bash
cd /opt/crypto-moonboys
sudo -u waxonedge git pull --ff-only origin main
cd services/waxonedge-live-indexer
npm install --omit=dev
```

## Environment

Copy the production example and fill secrets outside git:

```bash
sudo cp /opt/crypto-moonboys/services/waxonedge-live-indexer/.env.production.example /etc/waxonedge-live-indexer.env
sudo chmod 600 /etc/waxonedge-live-indexer.env
sudo chown root:root /etc/waxonedge-live-indexer.env
sudo nano /etc/waxonedge-live-indexer.env
```

Required keys:

```text
WAXONEDGE_LIVE_PORT=8789
WAXONEDGE_HYPERION_API=https://wax.eosusa.io/v2
WAXONEDGE_STATE_HISTORY_ENDPOINT=
WAXONEDGE_LIVE_SHARED_SECRET=
WAXONEDGE_LIVE_ENABLE_STREAM=false
WAXONEDGE_LIVE_BIND_HOST=127.0.0.1
```

Do not put real secrets in `.env.example`, `.env.production.example`, the systemd unit, or git history.

## Run Locally

```bash
cd /opt/crypto-moonboys/services/waxonedge-live-indexer
set -a
. /etc/waxonedge-live-indexer.env
set +a
npm start
```

Check contracts:

```bash
curl -fsS http://127.0.0.1:8789/health
curl -fsS http://127.0.0.1:8789/snapshot
curl -N http://127.0.0.1:8789/stream
npm run check
```

Expected skeleton status is `not_connected` with `uses_fake_live_data=false`. The service must not emit `token_update` events until real Hyperion/state-history live deltas are implemented.

## systemd

Install the unit template:

```bash
sudo cp /opt/crypto-moonboys/services/waxonedge-live-indexer/waxonedge-live-indexer.service.example /etc/systemd/system/waxonedge-live-indexer.service
sudo systemctl daemon-reload
sudo systemctl enable waxonedge-live-indexer
sudo systemctl start waxonedge-live-indexer
```

Check status and logs:

```bash
systemctl status waxonedge-live-indexer --no-pager
journalctl -u waxonedge-live-indexer -n 100 --no-pager
journalctl -u waxonedge-live-indexer -f
```

Restart after deploy:

```bash
sudo systemctl restart waxonedge-live-indexer
npm --prefix /opt/crypto-moonboys/services/waxonedge-live-indexer run check
```

## PM2 Alternative

```bash
cd /opt/crypto-moonboys/services/waxonedge-live-indexer
set -a
. /etc/waxonedge-live-indexer.env
set +a
pm2 start src/index.mjs --name waxonedge-live-indexer
pm2 save
pm2 logs waxonedge-live-indexer
pm2 restart waxonedge-live-indexer
npm run check
```

## Worker Future Env

Future Worker-to-VPS integration should use:

```text
WAXONEDGE_LIVE_INDEXER_URL=http://127.0.0.1:8789
WAXONEDGE_LIVE_SHARED_SECRET=<same secret>
```

The Worker must keep secrets out of health responses and should send the secret using:

```text
x-waxonedge-live-secret
```

Do not proxy `/api/waxonedge/live/stream` to this service until health, shared-secret validation, no-fake checks, and fallback behavior are proven in production.

## Rollback

```bash
cd /opt/crypto-moonboys
sudo -u waxonedge git fetch origin main
sudo -u waxonedge git checkout <known-good-commit>
cd services/waxonedge-live-indexer
npm install --omit=dev
sudo systemctl restart waxonedge-live-indexer
npm run check
```

Rollback should keep `WAXONEDGE_LIVE_ENABLE_STREAM=false` unless a later PR explicitly proves stable real streaming.

## No-Fake-Data Guarantee

This deployment wiring must not add fake live ticks, fake token updates, fake price, fake volume, fake TVL, fake candles, browser Hyperion fetching, public DEX fallback, frontend stream switching, or committed secrets.

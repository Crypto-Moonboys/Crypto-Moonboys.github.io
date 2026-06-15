# WaxOnEdge Live Indexer Service

This is the VPS-side WaxOnEdge live bubble update service. It polls only verified WAX Hyperion/state-history trade action streams, keeps an in-memory token update cache, and can emit real `token_update` SSE events when streaming is enabled.

## Current Status

- Status: connects only after real verified trade rows are observed.
- Real live token deltas: from verified Hyperion/state-history trade rows only.
- Fake token updates: never emitted.
- Worker integration: health probe/snapshot contract remains unchanged until a later Worker proxy PR.

## Verified Streams

The service is reserved for these verified WaxOnEdge trade streams:

- `alcordexmain::buymatch`
- `alcordexmain::sellmatch`
- `swap.alcor::logswap`
- `swap.taco::exchangelog`
- `swap.box::swaplog`
- `swap.nefty::logswap`

Table-only sources such as `swap.adex` and `dapp.fusion` are not live trade streams until verified separately.

## Configuration

Copy `.env.example` to your VPS environment manager and set values as process environment variables. Do not commit secrets.

```text
WAXONEDGE_LIVE_PORT=8789
WAXONEDGE_HYPERION_API=https://wax.eosusa.io/v2
WAXONEDGE_STATE_HISTORY_ENDPOINT=
WAXONEDGE_LIVE_SHARED_SECRET=
WAXONEDGE_LIVE_ENABLE_STREAM=false
WAXONEDGE_LIVE_BIND_HOST=127.0.0.1
```

Future Worker-to-VPS calls must send the shared secret in:

```text
x-waxonedge-live-secret
```

## Run Locally

```bash
cd services/waxonedge-live-indexer
npm start
```

Then check:

```bash
curl http://127.0.0.1:8789/health
curl http://127.0.0.1:8789/snapshot
curl -N http://127.0.0.1:8789/stream
```

## Endpoint Contracts

### `GET /health`

Reports config presence, uptime, connection state, verified stream list, and no-fake-data flags. Until a real stream connection is implemented, it returns:

```json
{
  "ok": false,
  "status": "not_connected",
  "uses_fake_live_data": false
}
```

### `GET /snapshot`

Returns compact live token updates observed in memory from verified trade rows. Until a real trade is observed, it returns `ok:false`, `status:"not_connected"`, and `tokens:[]`.

### `GET /stream`

Returns heartbeat events and, when `WAXONEDGE_LIVE_ENABLE_STREAM=true`, real `token_update` events from observed verified trade rows. It does not emit fake updates.

## Deployment Notes

For the VPS runtime runbook, systemd template, PM2 alternative, rollback steps, and health-check command, see `DEPLOY.md`.

Deploy this service on a VPS behind a private network path, tunnel, firewall rule, or reverse proxy that the Worker can reach later. The Worker probe and production stream routing remain unchanged until a later integration PR verifies:

- shared-secret request validation,
- Worker proxy/fallback behavior,
- no fake token updates,
- no browser Hyperion fetching.

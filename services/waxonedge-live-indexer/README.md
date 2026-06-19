# WaxOnEdge Live Indexer Service

This is the VPS-side WaxOnEdge live bubble update service. It polls only verified WAX Hyperion/state-history trade action streams, persists observed trade rows as fresh-start rolling history, keeps an in-memory token update cache, and can emit real `token_update` SSE events when streaming is enabled.

## Current Status

- Status: connects only after real verified trade rows are observed.
- Real live token deltas: from verified Hyperion/state-history trade rows only.
- Rolling history: fresh-start only from observed persisted rows.
- Full historical backfill: not claimed; SHIP/state-history deep-history mode remains future optional work.
- Fake token updates: never emitted.
- Worker integration: health probe/snapshot contract remains unchanged until a later Worker proxy PR.

## Verified Streams

The service is reserved for these verified WaxOnEdge trade streams:

- `alcordexmain::buymatch` -> `source: "alcor"`, `og_source: "alcor_buy"`
- `alcordexmain::sellmatch` -> `source: "alcor"`, `og_source: "alcor_sell"`
- `swap.alcor::logswap` -> `source: "swap.alcor"`, `og_source: "alcorv2"`
- `swap.taco::exchangelog` -> `source: "swap.taco"`, `og_source: "taco"`
- `swap.box::swaplog` -> `source: "swap.box"`, `og_source: "defibox"`
- `swap.nefty::logswap` -> `source: "swap.nefty"`, `og_source: "neftyblocks"`

Table-only sources such as `swap.adex` and `dapp.fusion` are not live trade streams until verified separately.

## Configuration

Copy `.env.example` to your VPS environment manager and set values as process environment variables. Do not commit secrets.

```text
WAXONEDGE_LIVE_PORT=8789
WAXONEDGE_HYPERION_API=https://wax.eosusa.io/v2
WAXONEDGE_STATE_HISTORY_ENDPOINT=
WAXNODE_ENDPOINT=
WAXONEDGE_LIVE_SHARED_SECRET=
WAXONEDGE_LIVE_ENABLE_STREAM=false
WAXONEDGE_LIVE_BIND_HOST=127.0.0.1
WAXONEDGE_LIVE_POLL_MS=1000
WAXONEDGE_LIVE_HISTORY_PATH=/opt/crypto-moonboys/services/waxonedge-live-indexer/data/waxonedge-live-history.json
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
curl http://127.0.0.1:8789/history
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

The `history` object is always honest fresh-start metadata:

```json
{
  "history_mode": "fresh_start",
  "history_complete": false,
  "history_backfilled": false,
  "requires_ship_for_deep_history": true
}
```

### `GET /snapshot`

Returns compact live token updates observed in memory from verified trade rows. Until a real trade is observed, it returns `ok:false`, `status:"not_connected"`, and `tokens:[]`.

When persisted observed trades exist after a restart, the token cache and rolling metrics hydrate from those real rows only. `fresh_history_volume_7d_complete` and `fresh_history_volume_30d_complete` remain false until enough wall-clock time has elapsed since `history_started_at`.

Fresh rolling metrics include latest observed price, latest trade time, 1h volume, 24h volume, and percentage change only when an actual older observed price exists inside that window. Missing windows stay unavailable; they are not filled from reserves or generated history.

### `GET /history`

Returns compact fresh-start history metadata, persisted observed trade count, rolling 1D candle count, and completion flags. It does not expose fake backfill status and does not build candles from reserves.

### `GET /history/trades`

Returns a bounded, paginated list of persisted real WAXCASH-related trade rows observed by the live indexer. Use `limit` and `cursor` query parameters. This endpoint exposes only persisted observed rows; it does not synthesize missing trades or backfill from reserves.

### `GET /stream`

Returns heartbeat events and, when `WAXONEDGE_LIVE_ENABLE_STREAM=true`, real `token_update` events from observed verified trade rows. It does not emit fake updates.

## Deployment Notes

For the VPS runtime runbook, systemd template, PM2 alternative, rollback steps, and health-check command, see `DEPLOY.md`.

Deploy this service on a VPS behind a private network path, tunnel, firewall rule, or reverse proxy that the Worker can reach later. The Worker probe and production stream routing remain unchanged until a later integration PR verifies:

- shared-secret request validation,
- Worker proxy/fallback behavior,
- no fake token updates,
- no browser Hyperion fetching.

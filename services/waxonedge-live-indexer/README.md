# WaxOnEdge Live Indexer Service

This is the VPS-side foundation for future WaxOnEdge live bubble updates. It is intentionally a skeleton/contract service: it defines the local HTTP and SSE surface, verified action streams, configuration, and no-fake-data guarantees without pretending to have a stable live Hyperion/state-history connection yet.

## Current Status

- Status: skeleton/contract.
- Real live token deltas: not connected yet.
- Fake token updates: never emitted.
- Worker integration: contract metadata only in this PR.

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

Returns compact live token updates in the same general shape as the Worker snapshot endpoint. Until connected, it returns `ok:false`, `status:"not_connected"`, and `tokens:[]`.

### `GET /stream`

Returns an SSE contract with heartbeat events only. It does not emit `token_update` events until real indexed trade deltas are connected.

## Deployment Notes

Deploy this service on a VPS behind a private network path, tunnel, firewall rule, or reverse proxy that the Worker can reach later. The next integration PR should verify:

- real Hyperion/state-history connectivity,
- shared-secret request validation,
- Worker proxy/fallback behavior,
- no fake token updates,
- no browser Hyperion fetching.

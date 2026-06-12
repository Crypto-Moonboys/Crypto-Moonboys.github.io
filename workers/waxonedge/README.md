# WAXONEDGE Cloudflare Worker Scaffold

This directory is the historical non-deployed scaffold for the WAXONEDGE indexer/API layer.
The live implementation is now wired through `workers/moonboys-api` using the existing
production `wikicoms` D1 binding and `/api/waxonedge/*` routes.

It exists to stop the rebuild from drifting into static frontend guesses. The current production site can remain static, but the OG WaxOnEdge experience requires a cached/indexed backend.

## Intended deploy target

Cloudflare Worker with:

- D1 for relational indexed market data
- optional KV/R2 for large chart/snapshot payloads
- scheduled cron triggers for source sync
- public read-only `/api/waxonedge/*` endpoints

## Deployment rule

Do not deploy this scaffold. Extend `workers/moonboys-api/routes/waxonedge.js` unless
Cloudflare routing is intentionally split into a dedicated Worker later.

## Worker binding draft

```toml
name = "waxonedge-api"
main = "src/index.js"
compatibility_date = "2026-06-12"

[[d1_databases]]
binding = "WAXONEDGE_DB"
database_name = "waxonedge"
database_id = "REPLACE_WITH_REAL_D1_ID"

[triggers]
crons = ["*/5 * * * *"]
```

## Required first live endpoints

- `GET /api/waxonedge/summary`
- `GET /api/waxonedge/tokens/top`
- `GET /api/waxonedge/pairs/top`
- `GET /api/waxonedge/sync-status`

Token-specific endpoints come after the base sync is proven.

## No-fake-data rule

The worker must return unavailable warnings instead of guessed values. Empty but honest data is acceptable. Fake complete data is not.

# WAXONEDGE Cloudflare Worker Scaffold

This directory is a non-deployed scaffold for the real WAXONEDGE indexer/API layer.

It exists to stop the rebuild from drifting into static frontend guesses. The current production site can remain static, but the OG WaxOnEdge experience requires a cached/indexed backend.

## Intended deploy target

Cloudflare Worker with:

- D1 for relational indexed market data
- optional KV/R2 for large chart/snapshot payloads
- scheduled cron triggers for source sync
- public read-only `/api/waxonedge/*` endpoints

## Deployment rule

Do not deploy this scaffold until real Cloudflare project names, D1 binding names, routes, and source rate limits are confirmed.

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

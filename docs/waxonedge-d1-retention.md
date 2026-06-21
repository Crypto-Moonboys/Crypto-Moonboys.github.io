# WaxOnEdge D1 Retention

Cloudflare D1 Time Travel is backup/restore retention. It does not delete old application rows from `waxonedge_trades`, compact `raw_json`, prune holder snapshots, or remove old sync logs. WaxOnEdge owns those app-table cleanup rules in the Worker.

## Execution Path

Cloudflare Cron Trigger calls the `moonboys-api` Worker `scheduled()` handler. The Worker delegates WaxOnEdge cron work to `runWaxOnEdgeScheduledSync()`, which runs bounded retention cleanup as part of the normal WaxOnEdge scheduled cycle.

There is also an admin-only diagnostic path:

`GET /api/waxonedge/retention-cleanup`

This route requires `X-Admin-Secret` to match `ADMIN_SECRET` and returns the same cleanup counters used by cron.

## Deploy Order

Worker deploys do not apply D1 migrations. Apply the retention index migration to remote D1 before judging cleanup performance:

```bash
npx wrangler d1 migrations apply wikicoms --config workers/moonboys-api/wrangler.toml --remote
```

Then deploy the Worker:

```bash
npx wrangler deploy workers/moonboys-api/worker.js --config workers/moonboys-api/wrangler.toml --no-assets
```

Migration `028_waxonedge_retention_indexes.sql` should be applied before relying on retention cleanup in production.

## Retention Rules

- `waxonedge_trades`: delete rows where `traded_at` is older than 32 days.
- `waxonedge_trades.raw_json`: set to `NULL` after 2 days while preserving normalized trade fields until the 32-day row cutoff.
- `waxonedge_chart_candles`: keep intraday intervals (`1m`, `5m`, `15m`, `30m`, `1h`) for 32 days and daily intervals (`1D`, `1d`, `D`) for 90 days.
- `waxonedge_holders`: keep the latest 3 snapshots per token.
- `waxonedge_sync_runs`: delete rows older than 14 days.
- `waxonedge_snapshots`: compact oversized diagnostic example arrays to 5 examples per source.

Every cleanup mutation is bounded with a batch limit so a single cron run does not try to perform unbounded D1 deletes. The 32-day trade retention keeps the data needed for 24h, 7d, and 30d volume windows.

## Diagnostics

The cleanup result includes:

- `trades_deleted`
- `raw_json_compacted`
- `candles_deleted`
- `holders_deleted`
- `sync_runs_deleted`
- `snapshots_compacted`
- cutoff timestamps
- `no_fake_value: true`

If more rows remain after one run, later cron invocations continue cleanup in safe batches.

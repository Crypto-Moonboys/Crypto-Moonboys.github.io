# WaxOnEdge post-1066 live data audit

Date: 2026-07-20

## Production observations

- `https://cryptomoonboys.com/api/waxonedge/token/graffitiking/WAXCASH` returned current price, liquidity, TVL, source keys, and indexed pair counts.
- The same token response returned `null` for `volume_24h`, `volume_24h_wax`, `volume_7d`, `volume_30d`, `change_24h`, and `price_change_24h`.
- `https://cryptomoonboys.com/api/waxonedge/tokens/top` also returned WAXCASH with populated price/liquidity/TVL and `null` rolling volume/change fields.
- `https://cryptomoonboys.com/api/waxonedge/pairs/top` returned live Alcor pair rows with `volume_24h_wax` and `change_24h`, proving pair/ticker current-state data still displays where the source provides it.
- The documented `top-*` paths are not active routes; the Worker exposes `/api/waxonedge/tokens/top` and `/api/waxonedge/pairs/top`.
- `https://cryptomoonboys.com/api/waxonedge/indexer-health` reported free-safe mode, candle generation disabled, live indexer reachable, and row counts for Alcor, Taco, Nefty, Box, A-DEX, and WaxFusion pair tables.
- `https://cryptomoonboys.com/api/waxonedge/sync-status` showed recent token aggregate partial-success runs and D1 CPU limit failures on Alcor market data.

## Root cause

PR #1066 correctly disabled legacy OHLC candle generation, but the replacement live-data path was incomplete for the bubble modal:

1. Free-safe cron rotation no longer scheduled `runWaxOnEdgeTradeBackfill`, so raw `waxonedge_trades` rows were not refreshed on the deployed quarter-hour cadence.
2. `aggregateTokenAnalytics` selected and persisted 24h pair/ticker volume, but did not select or write pair-level `volume_7d` / `volume_30d` into `waxonedge_token_stats`.
3. The clicked-bubble modal requested `/api/waxonedge/token/*` and `/pairs`, but only read token-level 7d/30d fields. It ignored pair-window rolling summaries even when the pair endpoint could derive them from indexed trades.

## Missing data path

Expected path:

```text
DEX trades
  -> waxonedge_trades
  -> rolling pair trade windows
  -> token analytics / bubble modal
```

Broken path after #1066:

```text
DEX current-state feeds
  -> waxonedge_pairs / waxonedge_token_stats
  -> price, liquidity, TVL, sources, pairs

DEX trade feeds
  -> not run in free-safe cron
  -> not rolled into token/modal fields
  -> null volume/change fields
```

## Fix in this PR

- Restores trade backfill as a free-safe cron rotation slot without reintroducing candle generation.
- Moves aggregate rebuild into the maintenance slot after trade backfill can refresh rows.
- Persists aggregate 7d/30d WAX-volume summaries to `waxonedge_token_stats`.
- Exposes `volume_7d_wax`, `volume_7d_usd`, `volume_30d_wax`, and `volume_30d_usd` aliases from derived token rows.
- Enriches `/api/waxonedge/token/*/pairs` with indexed trade-window volume summaries.
- Lets `waxonedge.html` modal fall back to pair-window summaries for 24h/7d/30d volume and selected-pair 24h change.

## Cost note

Cloudflare is still spending on useful current-state indexing: price, liquidity, TVL, sources, pairs, and selected price are visible. Before this fix, spending on trade ingestion/live-indexer plumbing was not producing useful public rolling-volume output because the cron and frontend/backend summary bridge were disconnected.

This PR keeps candles disabled and routes rolling analytics through trade summaries instead.

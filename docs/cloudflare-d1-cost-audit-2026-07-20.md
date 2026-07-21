# Cloudflare D1 Production Cost Audit - 2026-07-20

Scope: `Crypto-Moonboys/Crypto-Moonboys.github.io`, Cloudflare account `3592ec63de342253a785be80cdbe5b13`, D1 database `wikicoms` (`8a36e17a-18fa-4b98-90e1-3f269164b166`).

## Production Evidence

- Cloudflare D1 `wikicoms` was the only D1 database returned by Wrangler.
- `wrangler d1 info wikicoms` reported, for the last 24h:
  - `read_queries_24h`: 67,109
  - `write_queries_24h`: 2,225,953
  - `rows_read_24h`: 799,930,506
  - `rows_written_24h`: 5,140,993
  - `database_size`: 2.15 GB
- Production table counts:
  - `waxonedge_trades`: 833,979 rows
  - `waxonedge_chart_candles`: 66,961 rows
  - `waxonedge_pairs`: 22,593 rows
  - `waxonedge_tokens`: 2,044 rows, all updated within minutes of audit time
  - `waxonedge_sync_runs`: 33,423 rows since 2026-07-06
  - `waxonedge_holders`: 0 rows
- Non-WaxOnEdge production table counts are tiny by comparison:
  - `blocktopia_progression_events`: 1,164
  - `telegram_xp_log`: 189
  - `telegram_activity_log`: 182
  - `telegram_pet_events`: 115
  - `arcade_progression_events`: 51
  - `wiki_comments`: 6
  - `scores`, `activity_feed`: 0

Confirmed candle finding: `waxonedge_chart_candles` was actively receiving rows. Production had 66,961 rows, with latest updates on 2026-07-20. `waxonedge_sync_runs` showed 290 `candle_backfill` runs in the prior 24 hours, roughly every five minutes. The `candle_backfill` snapshot recorded 545,247 attempted pair checks, 137,130 candle builds from trade rows, and 487,165 cumulative candle write attempts.

Conclusion: the cost spike is WaxOnEdge D1 activity in `workers/moonboys-api/routes/waxonedge.js`, primarily scheduled current-state rewrites and repeated readiness scans. The candle system was an unnecessary exchange-style OHLC subsystem for WaxOnEdge's actual goal of live token analytics and price tracking.

## Worker Routes And Cron Jobs

Production D1-bound Workers:

- `workers/moonboys-api`: route `cryptomoonboys.com/api/waxonedge/*`, D1 `wikicoms`.
- `workers/anti-cheat`: weekly Sunday cron, D1 `wikicoms`, low-volume anti-cheat/admin state.
- `workers/leaderboard`: daily cron, D1 `wikicoms`, low-volume identity/status reads.

Blocked/non-production Worker configs:

- `blocktopia-leaderboard`, `blocktopia-engagement`, `blocktopia-district`, `blocktopia-realtime` contain placeholder KV IDs and are marked `stub-blocked`.
- `workers/waxonedge` is documented as a historical scaffold and must not be deployed.

Main cron finding:

- Before this PR, `moonboys-api` ran WaxOnEdge every minute via `* * * * *`.
- In free-safe mode, that produced five rotating D1-heavy subtasks every five minutes:
  - Alcor token/pair snapshot and upserts.
  - Core DEX pair upserts.
  - Token aggregate recomputation.
  - Candle backfill planning and trade-table readiness scans.
  - Supply/holder/retention maintenance.

After this PR, legacy `waxonedge-candle-backfill` returns a disabled no-op marker. Normal scheduled rotation no longer calls candle planning, no user chart request builds candles, and active Worker code contains no `INSERT INTO waxonedge_chart_candles`.

## Top D1 Write Sources

1. `aggregateTokenAnalytics` -> `waxonedge_token_stats`
   - Estimate: up to 2,854 UPSERTs per aggregate run; historically about every 5 minutes.
   - Reason: full aggregate recompute rewrites current-state rows with a fresh `updated_at`.
   - Fix: throttle scheduled aggregate to quarter-hour rotation and guard UPSERTs so unchanged metrics do not update.

2. `aggregateTokenAnalytics` -> `waxonedge_tokens`
   - Estimate: up to about 2,044 token updates per aggregate run.
   - Reason: selected price propagation rewrote tokens and recalculated `pair_count` by subquery.
   - Fix: use in-memory `agg.pairCount`; update only when price or pair count changes.

3. `syncAlcorMarketData` -> `waxonedge_tokens`
   - Estimate: 2,044 UPSERTs per Alcor run.
   - Reason: Alcor token snapshots were written even when only timestamp changed.
   - Fix: no-op guard on token UPSERTs.

4. `syncAlcorMarketData` -> `waxonedge_pairs`
   - Estimate: 967 Alcor pair UPSERTs per run.
   - Reason: current pair rows were rewritten on every scheduled refresh.
   - Fix: no-op guard on pair UPSERTs.

5. `syncCoreDexAdapters` -> `waxonedge_pairs`
   - Estimate: up to 1,000 pair rows per active adapter page in free-safe mode.
   - Reason: DEX table rows were repeatedly persisted while cursors advanced.
   - Fix: quarter-hour rotation plus no-op guarded pair UPSERTs.

6. `syncSupplyInputs` -> `waxonedge_tokens`
   - Estimate: 5 supply targets per free-safe run, previously every 5 minutes.
   - Reason: supply writes updated timestamp even when supply was unchanged.
   - Fix: update only when decimals, total supply, or max supply changes.

7. `syncSupplyInputs` -> `waxonedge_token_stats`
   - Estimate: 5 token stats writes per run.
   - Reason: wrote `updated_at` while setting FDV fields to `NULL`.
   - Fix: only update existing rows if FDV values need clearing.

8. `recordSyncRun` -> `waxonedge_sync_runs`
   - Evidence: 33,423 rows since 2026-07-06.
   - Reason: success, partial, and skipped cron outcomes appended audit rows.
   - Fix: do not write `skipped` rows; keep state/snapshot tables for diagnostics.

9. `writeSnapshot` -> `waxonedge_snapshots`
   - Estimate: multiple snapshot writes per scheduled subtask.
   - Reason: unchanged skipped/deferred payloads were rewritten with new `fetched_at`.
   - Fix: compare existing `payload_json`; skip unchanged snapshots.

10. `upsertSourceIndexState` -> `waxonedge_source_index_state`
    - Estimate: one write per subtask state update.
    - Reason: updates refreshed `updated_at` even when source state did not change.
    - Fix: skip source-state writes when all meaningful fields are unchanged.

## Top D1 Read Sources

1. `planWaxOnEdgeCandleBackfill` trade-count query
   - Measured: 833,988 rows read for `SELECT source, COUNT(*) FROM waxonedge_trades ... GROUP BY source`.
   - Reason: scans the full 833,979-row trade table to decide candle readiness.
   - Fix: disabled active candle planning. WaxOnEdge charts now read lightweight `waxonedge_price_snapshots`.

2. Public/diagnostic trade counts in `waxcashTradeRowDiagnostics`
   - Measured equivalent: `COUNT(*) FROM waxonedge_trades` reads 833,979 rows.
   - Reason: diagnostic endpoints can scan the full trade table per request.
   - Fix: move trade-count diagnostics to cached summary rows/KV.

3. `planWaxOnEdgeCandleBackfill` recent-trade existence checks
   - Reason: repeated `waxonedge_trades` lookups run from the cron planner.
   - Fix: disabled active candle planning and removed automatic trade-readiness scans for candle generation.

4. `planWaxOnEdgeCandleBackfill` candidate pair page
   - Measured: 23,768 rows read for `ORDER BY source, CAST(pair_id AS NUMERIC), pair_id LIMIT 2 OFFSET 7704`.
   - Reason: OFFSET pagination over pair table.
   - Fix: disabled active candle planning; no scheduled candidate-pair pages are read for candles.

5. `aggregateTokenAnalytics` full pair load
   - Estimate: 22,593 pair rows per aggregate run.
   - Reason: aggregate recomputes from all pairs.
   - Fix: quarter-hour rotation; future delta aggregation by changed source.

6. `listTopPairs`
   - Estimate: scans/sorts public pair feed from `waxonedge_pairs`.
   - Reason: `ORDER BY CAST(COALESCE(volume_24h_wax, '0') AS NUMERIC)` cannot use the existing text index efficiently.
   - Fix: serve from cached JSON/KV; consider numeric shadow columns.

7. `loadReserveRouteGraphRows`
   - Estimate: up to 22,593 rows scanned/sorted, limited to 2,000 output rows.
   - Reason: route graph built from current pair rows.
   - Fix: cache route graph snapshots.

8. `getIndexerHealth`
   - Estimate: many count/existence queries over `waxonedge_pairs`, `waxonedge_price_snapshots`, and `waxonedge_token_stats`.
   - Reason: health endpoint calculates deep diagnostics live.
   - Fix: make health use source-state/snapshot summaries by default; gate deep diagnostics behind admin/debug.

9. `syncSupplyInputs` target selection
   - Measured: 4,065 rows read for pair-token target count.
   - Reason: joins tokens and token stats every supply run.
   - Fix: throttled by quarter-hour rotation; later keep target cursor/count in source state.

10. Public token analytics (`token-page`, WAXCASH analytics)
    - Reason: token detail paths can load pair rows, route graph rows, LastStats, and trade windows.
    - Fix: current in-isolate cache helps only per isolate; move heavy public payloads to KV/cached JSON.

## Runaway Loops

No infinite loop was found. The runaway behavior is architectural: a legitimate every-minute cron fans into bulk D1 rewrites and repeated scans. The billing shape matches scheduled ingestion, not visitor-triggered writes.

The candle subsystem was the clearest unnecessary loop. It repeatedly scanned `waxonedge_trades`, paged candidate pairs, generated 1D OHLC candles through `buildInternalDailyCandlesForPair` / `buildDailyCandlesFromTradeRows`, and wrote `waxonedge_chart_candles`. WaxOnEdge does not need that architecture.

## Fixes In This PR

Critical:

- Change `moonboys-api` WaxOnEdge cron from `* * * * *` to `*/15 * * * *`.
- Keep backward compatibility for the old minute cron but gate it to quarter-hour slices in free-safe mode.
- Rotate free-safe WaxOnEdge work across quarter-hour slots.
- Disable scheduled candle generation/backfill entirely.
- Disable request-triggered candle generation; token chart requests read `waxonedge_price_snapshots` and never scan `waxonedge_trades`.
- Add `waxonedge_price_snapshots` for lightweight token history: timestamp, contract, symbol, source, pair_id, WAX/USD price, liquidity, and 24h volume.
- Store snapshots only when meaningful values change.
- Guard against future active `INSERT INTO waxonedge_chart_candles` through the cost test.
- Stop writing skipped sync-run audit rows.
- Avoid rewriting unchanged snapshots.
- Avoid rewriting unchanged `waxonedge_pairs`, `waxonedge_tokens`, and `waxonedge_token_stats`.
- Remove per-token `pair_count` subquery from aggregate token updates.
- Skip unchanged `waxonedge_source_index_state` writes.

High priority follow-ups:

- Move public WaxOnEdge bootstrap/summary/top-pairs/top-tokens and WAXCASH analytics payloads to KV or generated JSON with 60-300 second TTL.
- Store cached `waxonedge_source_counts` / `waxonedge_trade_counts` summary rows during ingestion so diagnostics do not scan `waxonedge_trades`.
- Add numeric shadow columns for volume/liquidity sort keys so public feeds do not cast text values on every request.

Nice optimisations:

- Split diagnostics from public health: default public health should read source state only; admin/debug can run deep table scans.
- Consider Durable Objects for per-token live current state if sub-minute live updates are needed.
- Move historical trade archival to R2 JSON or compressed objects if long retention is needed.

## Candle Removal Result

- Are candles generated now? No. Scheduled `waxonedge-candle-backfill` is a disabled no-op and normal cron rotation no longer calls `planWaxOnEdgeCandleBackfill`.
- Is `waxonedge_chart_candles` receiving inserts now? Active Worker code now has no `INSERT INTO waxonedge_chart_candles`. Existing rows remain as legacy data.
- What wrote it before? `planWaxOnEdgeCandleBackfill` called `buildInternalDailyCandlesForPair`, which loaded indexed trade rows and called `buildDailyCandlesFromTradeRows` before writing chart candles.
- How often? Production `waxonedge_sync_runs` showed 290 `candle_backfill` runs in the prior 24 hours, about every five minutes.
- How many rows? Production contained 66,961 `waxonedge_chart_candles` rows. Snapshot counters showed 487,165 cumulative candle write attempts.
- Was candle data calculated from trades? Yes. The old path calculated 1D OHLC rows from `waxonedge_trades`.
- Is `planWaxOnEdgeCandleBackfill` only planning now? Yes. It returns disabled metadata and performs no D1 scans or writes.
- Current purpose of `waxonedge_chart_candles`: legacy read-only data. It can remain in place until a later cleanup/migration decision.
- Estimated D1 read reduction: at least about 242 million rows/day removed from normal cron, based only on 290 daily candle runs times the measured 833,979-row `waxonedge_trades` count scan. This excludes additional pair OFFSET pages and per-pair trade lookups, so it is conservative.
- Estimated D1 write reduction: candle-table writes from active code drop to zero. Production showed 2,291 candle rows updated on 2026-07-20 before the change and 487,165 cumulative candle write attempts in the candle snapshot; sync-state/snapshot writes for normal candle planning are also removed.

## WaxOnEdge Storage Cleanup - 2026-07-21

PR #1068 removed WaxOnEdge from production by deleting the active Worker routes,
scheduled jobs, generated feeds, and external DEX connections. Post-removal
Cloudflare D1 metrics dropped from roughly 778M rows read per day and 4.6M rows
written per day to roughly 14.5M rows read per day and 29K rows written per day,
confirming WaxOnEdge is no longer active.

The remaining `waxonedge_*` D1 tables are retired storage only. Migration
`038_remove_waxonedge_tables.sql` drops the confirmed unused WaxOnEdge tables to
recover storage:

- `waxonedge_price_snapshots`
- `waxonedge_source_index_state`
- `waxonedge_trades`
- `waxonedge_chart_candles`
- `waxonedge_holders`
- `waxonedge_token_stats`
- `waxonedge_pairs`
- `waxonedge_tokens`
- `waxonedge_snapshots`
- `waxonedge_sync_runs`

This removes historical market indexing data only. Core Crypto Moonboys systems
remain unaffected, including wiki pages, comments, Telegram identity, XP,
leaderboards, pets, arcade progression, and community features.

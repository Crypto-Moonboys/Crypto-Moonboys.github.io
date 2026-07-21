-- Migration 038: Retire unused WaxOnEdge D1 storage after production removal.
-- PR #1068 removed active WaxOnEdge routes, cron work, feeds, and DEX connections.
-- These tables now contain only historical market indexing data and are no longer
-- read or written by production Workers.

DROP TABLE IF EXISTS waxonedge_price_snapshots;
DROP TABLE IF EXISTS waxonedge_source_index_state;
DROP TABLE IF EXISTS waxonedge_trades;
DROP TABLE IF EXISTS waxonedge_chart_candles;
DROP TABLE IF EXISTS waxonedge_holders;
DROP TABLE IF EXISTS waxonedge_token_stats;
DROP TABLE IF EXISTS waxonedge_pairs;
DROP TABLE IF EXISTS waxonedge_tokens;
DROP TABLE IF EXISTS waxonedge_snapshots;
DROP TABLE IF EXISTS waxonedge_sync_runs;

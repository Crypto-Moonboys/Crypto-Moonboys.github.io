-- Migration 038: Retire smaller unused WaxOnEdge D1 storage tables.
-- PR #1068 removed active WaxOnEdge routes, cron work, feeds, and DEX connections.
-- These tables now contain only historical market indexing data and are no longer
-- read or written by production Workers.
-- Drops are intentionally split across migrations to avoid D1 remote migration
-- timeouts and remain safe if the previous large drop attempt partially ran.

DROP TABLE IF EXISTS waxonedge_price_snapshots;
DROP TABLE IF EXISTS waxonedge_source_index_state;
DROP TABLE IF EXISTS waxonedge_holders;
DROP TABLE IF EXISTS waxonedge_sync_runs;
DROP TABLE IF EXISTS waxonedge_snapshots;

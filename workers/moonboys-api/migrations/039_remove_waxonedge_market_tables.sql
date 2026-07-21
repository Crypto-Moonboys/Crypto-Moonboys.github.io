-- Migration 039: Retire WaxOnEdge market storage tables.
-- Split from the original large WaxOnEdge cleanup migration to avoid D1 remote
-- migration timeouts. Forward-only and safe if a previous attempt partially ran.

DROP TABLE IF EXISTS waxonedge_tokens;
DROP TABLE IF EXISTS waxonedge_token_stats;
DROP TABLE IF EXISTS waxonedge_pairs;
DROP TABLE IF EXISTS waxonedge_chart_candles;

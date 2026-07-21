-- Migration 040: Retire the large WaxOnEdge trades storage table.
-- Kept isolated to avoid D1 remote migration timeouts. Forward-only and safe if
-- a previous cleanup attempt partially ran.

DROP TABLE IF EXISTS waxonedge_trades;

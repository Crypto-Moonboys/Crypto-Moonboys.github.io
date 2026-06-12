-- Migration 023: WaxOnEdge token aggregate analytics columns
-- All decimal analytics stay as TEXT. Values are populated only from indexed sources.

ALTER TABLE waxonedge_token_stats ADD COLUMN liquidity_wax TEXT;
ALTER TABLE waxonedge_token_stats ADD COLUMN liquidity_usd TEXT;
ALTER TABLE waxonedge_token_stats ADD COLUMN tvl_wax TEXT;
ALTER TABLE waxonedge_token_stats ADD COLUMN tvl_usd TEXT;
ALTER TABLE waxonedge_token_stats ADD COLUMN selected_price_wax TEXT;
ALTER TABLE waxonedge_token_stats ADD COLUMN selected_price_usd TEXT;
ALTER TABLE waxonedge_token_stats ADD COLUMN selected_pair_source TEXT;
ALTER TABLE waxonedge_token_stats ADD COLUMN selected_pair_id TEXT;
ALTER TABLE waxonedge_token_stats ADD COLUMN burned_amount TEXT;

CREATE INDEX IF NOT EXISTS idx_waxonedge_token_stats_liquidity
  ON waxonedge_token_stats (liquidity_wax, updated_at);

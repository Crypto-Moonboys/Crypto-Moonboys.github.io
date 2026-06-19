# WAXCASH build lock

## Product definition

WAXCASH is not an all-WAX token scanner and it is not a trading page.

WAXCASH is a WAXCASH-centred liquidity graph:

- `graffitiking::WAXCASH` is the root node.
- Every token with a direct indexed WAXCASH pair becomes a graph node.
- Every indexed WAXCASH pair becomes an edge between the root and the paired token.
- Clicking a token opens the full token analytics route already exposed by the WaxOnEdge analytics system.
- No swap UI, wallet trade execution, order builder, route execution, or contract interaction belongs on this page.

## Implementation decision

The uploaded `waxonedge_backend_public-public.zip` contains the OG WaxOnEdge backend structure and must be used as the reference for WAXCASH parity. It includes the real old backend shape:

```text
app/api.js
reader
readerrows
indexer
liquiditypricesindexer
laststatsindexer
klinesindexer
socketio
rows/models
exchange adapters
multi-DEX table/action config
```

The uploaded `waxonedge_contract_public-main.zip` is the old swap contract reference and must not be installed for this no-trading WAXCASH analytics page.

The uploaded Codex `waxonedge-live-indexer.zip` is a live trade-event indexer only. It can help with fresh trade ticks and recent observed volume, but it is not a full valuation engine because it does not provide token supply, holders, market cap, TVL, full pair discovery, or WAXCASH graph logic.

## Current branch scope

The WAXCASH rebuild is an OG WaxOnEdge-style analytics page:

- `/api/waxonedge/waxcash-analytics` is the token stats and proof source.
- `/api/waxonedge/waxcash-analytics/chart-feed` is a display-only Alcor pool `#8388` chart feed.
- `/api/waxonedge/waxcash-graph` remains available for graph consumers.
- Existing token analytics links remain read-only.
- No swap UI, wallet execution, order builder, route execution, or fake fallback values belong on this page.

The chart is display-only. It must not control selected WAXCASH price, TVL, liquidity, market cap, volume, or token stats. Token stats come from indexed WaxOnEdge backend logic.

## Data rules

- Do not fake missing values.
- Do not use fallback trading math as valuation truth.
- Do not size bubbles from aggregate values unless the backend exposes them as indexed/proof-backed values.
- Keep selected direct WAX pair liquidity, cumulated pair liquidity, and TVL as separate concepts.
- Select WAXCASH price from the deepest usable direct WAX/WAXCASH pool, including verified Alcor V3 PoolV3 price proofs.
- Use the WAXCASH-only OG parity rule `og_woe_total_supply_as_circulating_for_waxcash` only when live `get_currency_stats` total supply exists and no locked/burned exclusion source exists.
- Keep holder count unavailable unless a real holder snapshot/indexer source exists.

## Future backend fix target

If USD values remain wrong, the fix belongs in the current indexed aggregation layer, not in the page renderer. The likely files are:

```text
workers/moonboys-api/routes/waxonedge.js
services/waxonedge-live-indexer/src/index.mjs
```

The known weak point in the live indexer is AMM trade parsing. A naive `quantity_out / quantity_in` price is not enough unless the parser normalizes base/quote direction and only emits a WAX-denominated price when WAX or a verified WAX route is present.

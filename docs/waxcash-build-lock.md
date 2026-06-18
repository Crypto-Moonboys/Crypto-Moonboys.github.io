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

The uploaded `waxonedge_backend_public-public.zip` is not the full OG pricing engine. Local inspection showed a small older backend/API reader shape:

```text
app/api.js
app/daemon.js
app/config.js
app/libs/antelope-ship-reader/dist
```

It did not contain the expected full OG market stack:

```text
reader
readerrows
indexer
liquiditypricesindexer
laststatsindexer
klinesindexer
socketio
multi-DEX pool calculators
```

The uploaded `waxonedge_contract_public-main.zip` is the old swap contract reference and must not be installed for this no-trading WAXCASH graph.

The uploaded Codex `waxonedge-live-indexer.zip` is a live trade-event indexer only. It can help with fresh trade ticks and recent observed volume, but it is not a full valuation engine because it does not provide token supply, holders, market cap, TVL, full pair discovery, or WAXCASH graph logic.

## Current branch scope

This branch adds a new `waxcash.html` page and a dedicated `js/waxcash-graph.js` renderer that uses the existing indexed WaxOnEdge API:

- `/api/waxonedge/bootstrap`
- existing token analytics links
- existing indexed token and pair rows

The renderer filters the existing indexed pair rows down to direct WAXCASH pairs only.

## Data rules

- Do not fake missing values.
- Do not use fallback trading math as valuation truth.
- Do not size bubbles from aggregate values unless the backend exposes them as indexed/proof-backed values.
- Use direct WAXCASH pair liquidity first for WAXCASH graph sizing.
- Keep market cap disabled or empty where circulating supply and selected price are not live/proof-backed.

## Future backend fix target

If USD values remain wrong, the fix belongs in the current indexed aggregation layer, not in the page renderer. The likely files are:

```text
workers/moonboys-api/routes/waxonedge.js
services/waxonedge-live-indexer/src/index.mjs
```

The known weak point in the live indexer is AMM trade parsing. A naive `quantity_out / quantity_in` price is not enough unless the parser normalizes base/quote direction and only emits a WAX-denominated price when WAX or a verified WAX route is present.

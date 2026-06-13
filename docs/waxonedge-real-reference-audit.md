# WaxOnEdge Real Reference Audit

This audit compares the current Moonboys Cloudflare/D1 WaxOnEdge analytics rebuild with the public WaxOnEdge reference repositories:

- `https://github.com/Wapaca/waxonedge_backend_public`
- `https://github.com/Wapaca/waxonedge_contract_public`

Both reference repositories include MIT licenses. This PR uses them as technical references for architecture, table names, data model, and route behavior; it does not vendor or copy their implementation.

## Reference API Surface

The reference backend exposes these analytics families:

| Area | Reference routes |
| --- | --- |
| Health | `/status` |
| AMM pools | `/pools`, `/pool/:src/:id` |
| Alcor v2 concentrated pools | `/poolsv3`, `/poolv3/:src/:id` |
| Alcor order-book markets | `/markets`, `/market/:src/:id` |
| Tokens and prices | `/tokens`, `/wax_price/:contract/:ticker` |
| Charts and trades | `/candles`, `/trades` |
| Last stats | `/lastVolumes`, `/lastPriceChanges` |
| Routing | `/routes/:tokenIn/:tokenOut`, `/pairDirectSources/:tokenA/:tokenB`, `/swapRoutes` |
| Realtime/session | `/socket-session-token` |

The Moonboys Worker intentionally keeps `/api/waxonedge/bootstrap` as the primary product data path and exposes token, pair, chart, and status subroutes underneath the current Cloudflare route. Wallet swap execution and route-building are out of scope for this analytics PR.

## Adapter And Table Mapping

| Moonboys source key | Reference source label | Contract code | Table | Pair id | Reserve fields | Fee assumption |
| --- | --- | --- | --- | --- | --- | --- |
| `swap.alcor` | `alcorv2` | `swap.alcor` | `pools` | `id` | `tokenA`, `tokenB`, v3 slot/liquidity fields | `fee / 100` bps |
| `swap.taco` | `taco` | `swap.taco` | `pairs` | `id` | `pool1`, `pool2` | default 30 bps |
| `swap.nefty` | `neftyblocks` | `swap.nefty` | `pairs` | `code` | `reserve0`, `reserve1`, `total_liquidity`, `active` | default 30 bps |
| `swap.box` | `defibox` | `swap.box` | `pairs` | `id` | `token0`, `token1`, `reserve0`, `reserve1`, `liquidity_token` | default 30 bps |

The contract reference also supports:

| DEX code | Source | Contract |
| --- | --- | --- |
| `a2` | Alcor v2 | `swap.alcor` |
| `ad` | Alcor order book | `alcordexmain` |
| `d` | Defibox | `swap.box` |
| `t` | Taco | `swap.taco` |
| `a` | Adex | `swap.adex` |
| `n` | NeftyBlocks | `swap.nefty` |
| `wf` | WaxFusion | `dapp.fusion` |

Current configured aggregate sources remain intentionally limited to `alcor`, `swap.alcor`, `swap.taco`, `swap.nefty`, `swap.box`, and `token_aggregates`.

## What Was Corrected In This PR

- Adapter metadata now records the real reference source label and contract DEX code for `swap.alcor`, `swap.taco`, `swap.nefty`, and `swap.box`.
- Alcor v2 pool fees are scaled from the reference representation with `fee / 100`.
- Taco, NeftyBlocks, and BOX pools default to the reference 30 bps fee when the row has no explicit fee.
- Inactive NeftyBlocks rows are filtered before pair persistence.
- Quote-priority matching now follows the reference `isPairReverted` quote list: `USDT`, `WAXUSDT`, `WAXUSDC`, `WAXDAI`, `WAXBUSD`, `WAXWBTC`, `ARBTC`, `WAXRBTC`, `WAXWETH`, and `WAX`.

## Current Cloudflare/D1 Simplifications

The reference backend is heavier than the current Worker/D1 implementation in these areas:

- Candles: the reference stores dynamic tables named like `klines_${src}_${pair_id}` and supports durations `1m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `12h`, and `1d`.
- Candle direction: the reference can `reverseCandles` by reciprocating OHLC, swapping high/low correctly, and using pair quote priority for chart orientation.
- Candle paging: `/candles` honors `countBack` and prepends earlier rows when the requested range is short.
- Candle volume: the reference stores `volumeA` and `volumeB`, plus trade count and account counts. The current D1 schema has one chart volume field, so 7d/30d volume remains unavailable unless backed by indexed stats.
- Trade ingestion: the reference computes candles and last stats from `swapOrders`, `marketMatches`, and `swapVThreeOrders`. The current Worker only serves candles when D1 candle rows already exist and never fabricates missing candles.
- Alcor v2 math: the reference uses v3 pool slot/tick/liquidity math. The current normalizer reads token sides/reserves when available, but does not fully reproduce concentrated liquidity pricing.
- Alcor order book: the reference includes `alcordexmain` markets. Moonboys still uses the public Alcor API `alcor` source plus core on-chain AMM sources.
- Scam and pool filtering: the reference skips `scam_contracts` and `pools_blacklist`. Moonboys does not copy that list in this PR; production parity should add an owned denylist source before claiming full scam filtering.
- Routing: the contract memo format and `swapRoutes` action generation are documented for future work only. This PR does not add wallet transaction flows.

## Price, Liquidity, And Volume Parity

- Token WAX price selection in Moonboys remains based on the strongest indexed WAX quote liquidity, which is close to the reference `getDeepestWaxPool` behavior.
- TVL and cumulated liquidity remain honest best-effort values from indexed pair reserves and known token prices. If a side cannot be valued, the API leaves the value unavailable.
- 24h volume is only used when an indexed row or aggregate stat supplies it. The API does not infer volume from reserves.
- 7d and 30d volume should stay unavailable until D1 stores source-backed historical volume stats.
- Market cap and FDV must remain unavailable unless real supply and price inputs are indexed.

## Chart Rules

Moonboys must continue to follow these rules:

- Use TradingView Lightweight Charts on the frontend.
- Use backend/D1 candle data only.
- Select the chart source from the strongest trusted WAX liquidity pair when candles are indexed.
- Show clean unavailable states for missing candles: `Unavailable`, `Source not indexed yet`, or `Requires indexed backend`.
- Do not generate fake candles or fake volumes.

## Remaining Parity Work

- Add source-backed trade ingestion for swap orders, Alcor market matches, and Alcor v2 swap orders.
- Add D1 candle aggregation with reference-compatible durations, `volumeA`/`volumeB`, previous-close opens, and reversible OHLC.
- Add an owned blacklist/scam-contract feed instead of copying operational lists blindly.
- Consider indexing `alcordexmain` order-book markets as a distinct source once it is product-approved.
- Implement route-computing analytics separately from live wallet swap execution.

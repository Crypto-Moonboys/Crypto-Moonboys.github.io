# WaxOnEdge Metric Source Map

Status: source-of-truth map only. This file documents WaxOnEdge metric provenance and known gaps before any backend or frontend implementation changes.

## Source Inventory

| Source | Current repo path | Indexed today | Notes |
| --- | --- | --- | --- |
| Alcor public API | `workers/moonboys-api/routes/waxonedge.js` `syncAlcorMarketData` | yes | `/tokens`, `/pairs`, `/tickers`, and `/analytics/global` snapshots feed token metadata, pairs, tickers, WAX/USD, and selected prices. |
| Alcor order-book trades | `syncAlcorMarketTradeRows` | conditional | Uses configured Hyperion/state-history `history/get_actions` for `alcordexmain` `buymatch`/`sellmatch`; builds D1 trade rows only when `WAXONEDGE_HYPERION_API` is configured. |
| Alcor V2 | `CORE_DEX_ADAPTERS` `swap.alcor` | yes | WAX RPC `get_table_rows` on `swap.alcor` `pools`; reserves and fees normalize into `waxonedge_pairs`. |
| Taco | `CORE_DEX_ADAPTERS` `swap.taco` | yes | WAX RPC `get_table_rows` on `swap.taco` `pairs`; reserves normalize into `waxonedge_pairs`. |
| NeftyBlocks | `CORE_DEX_ADAPTERS` `swap.nefty` | yes | ABI-first WAX RPC check, then `pairs`; inactive rows are skipped. |
| Defibox | `CORE_DEX_ADAPTERS` `swap.box` | yes | WAX RPC `get_table_rows` on `swap.box` `pairs`; reserves normalize into `waxonedge_pairs`. |
| A-DEX | `CORE_DEX_ADAPTERS` `swap.adex` | indexed as table rows | Included in aggregate source list, but trade history is marked not verified from OG refs. |
| WaxFusion | `CORE_DEX_ADAPTERS` `dapp.fusion` | indexed as table rows | Special global pool row, not a normal DEX trade stream. |
| Token supply | `syncSupplyInputs` | partial | WAX RPC `get_currency_stats` stores issued `total_supply` and `max_supply` for top indexed tokens. |
| Holders | `waxonedge_holders` | schema only | D1 table exists, but the holder read endpoint is currently stubbed/unimplemented. Product holder UI must stay hidden until the endpoint reads latest real D1 holder snapshots and a holder snapshot writer/indexer writes real rows. |
| Candles/OHLCV | `waxonedge_trades`, `waxonedge_chart_candles` | conditional | Only real D1 trade rows can create candles. Reserve-derived candles are not allowed. |

## Metric Map

| Product metric | Source of truth | Table/action/API route | Exists today in repo | Current live backend returns it | Formula | Missing implementation | Tests needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| token symbol | Token rows and pair sides | `waxonedge_tokens.symbol`, `waxonedge_pairs.token_*_symbol`; `/api/waxonedge/bootstrap` | yes | yes when token/pair indexed | normalized uppercase symbol | none | bootstrap token rows include `symbol` |
| contract | Token rows and pair sides | `waxonedge_tokens.contract`, `waxonedge_pairs.token_*_contract` | yes | yes when token/pair indexed | normalized lowercase account | none | bootstrap token rows include `contract` |
| decimals | Alcor token metadata and parsed assets | `waxonedge_tokens.decimals`; parsed reserve precision | yes | yes when indexed token metadata exists | source decimal precision | improve non-Alcor token decimal persistence from parsed pair assets | token detail preserves decimals when present |
| selected WAX price | Strongest valued indexed pair route | `waxonedge_pairs`, `waxonedge_tokens.price_wax`, `waxonedge_token_stats.selected_price_wax` | yes | yes for tokens with valued pairs | direct WAX pair price wins when trusted; otherwise opposite token WAX route from indexed price map | deeper graph routing beyond one valued opposite token | all-pairs valuation uses non-WAX pair when opposite has WAX route |
| selected USD price | selected WAX price and live WAX/USD | `waxonedge_token_stats.selected_price_usd`, WAX row or Alcor global | yes | yes when WAX/USD exists | `selected_price_wax * WAX/USD` | none for priced tokens | bootstrap includes selected USD for priced tokens |
| 24h price change | Indexed pair/ticker/trade stats | `waxonedge_pairs.change_24h`, `waxonedge_token_stats.change_24h` | partial | yes only where source rows provide it | strongest selected pair `change_24h` | trade-derived aggregate change for all routed pairs | primary UI filters tokens without change |
| 24h volume WAX/USD | Indexed source volume converted through WAX route | `waxonedge_pairs.volume_24h*`, `waxonedge_token_stats.volume_24h*` | yes | yes when source volume exists | sum usable pair `volume_24h_wax`; USD = WAX volume * WAX/USD | per-side volume validation for every AMM source | health counts `tokens_with_24h_volume` |
| 7d volume WAX/USD | Indexed trade/candle history | `waxonedge_trades`, future aggregate columns | schema partial | not reliable today | sum real indexed trade value in 7 days | aggregate 7d windows from D1 trades/candles | 7D control hidden until populated |
| 30d volume WAX/USD | Indexed trade/candle history | `waxonedge_trades`, future aggregate columns | schema partial | not reliable today | sum real indexed trade value in 30 days | aggregate 30d windows from D1 trades/candles | 30D control hidden until populated |
| liquidity WAX/USD | Valued indexed pair reserves | `waxonedge_pairs.reserve_*`, token price index | yes | yes for valued pairs | for each pair, value both reserves in WAX when either side has WAX price; sum contributions | multi-hop graph beyond indexed opposite token price map | pair endpoint exposes contribution fields |
| TVL WAX/USD | Token value locked across indexed sources | `waxonedge_token_stats.tvl_*` derived from pair reserve values | yes | yes, same calculation basis as aggregate pair liquidity today | equals indexed reserve value across supported pairs because sources do not expose separate token TVL | independent protocol TVL sources if product wants separate TVL | UI does not imply TVL is independent from liquidity |
| circulating supply | Verified circulating supply feed | `waxonedge_token_stats.circulating_supply` | schema only | no reliable values today | `total_supply - excluded locked/burned balances` only after verified exclusion list | owned circulating-supply index/list per token | market-cap primary mode hidden while absent |
| total supply | WAX chain token stat | `/v1/chain/get_currency_stats`; `waxonedge_tokens.total_supply` | yes | partial for top tokens | parse `supply` asset amount | expand coverage beyond top 50 per sync | FDV test uses total supply only |
| max supply | WAX chain token stat | `/v1/chain/get_currency_stats`; `waxonedge_tokens.max_supply` | yes | partial for top tokens | parse `max_supply` asset amount | expand coverage beyond top 50 per sync | token detail includes max supply when present |
| market cap WAX/USD | Circulating supply and selected price | `waxonedge_token_stats.market_cap_*` | schema only | no reliable values today | `circulating_supply * selected_price` | circulating supply source/index | Mkt Cap primary mode hidden if market cap absent |
| FDV WAX/USD | Issued/total supply and selected price | `waxonedge_token_stats.fdv_*` | yes | yes when supply and price exist | `total_supply * selected_price` | broader supply sync | FDV remains secondary, not primary market cap |
| holder count | Real balance snapshot | `waxonedge_holders`, `waxonedge_token_stats.holder_count` | schema only | no | count accounts with latest positive balance snapshot | implement real-only holders endpoint + holder snapshot writer/indexer | holders UI hidden until endpoint and rows exist |
| top holders | Real balance snapshot | `waxonedge_holders` latest `snapshot_at` | schema only | no | order latest snapshot balances desc | implement holders endpoint + holder indexer/VPS snapshot path | holders endpoint must read latest real D1 rows only |
| holder token amount | Real balance snapshot | `waxonedge_holders.balance` | schema only | no | parsed account balance | implement holders endpoint + holder indexer/VPS snapshot path | holders endpoint must expose balance only from real snapshots |
| holder % of supply | Real balance snapshot plus supply | `waxonedge_holders.percentage` or latest supply | schema only | no | `balance / total_supply * 100` | implement holders endpoint + holder indexer/VPS snapshot path | holders endpoint must expose percentage only from real snapshots |
| all indexed pairs | DEX adapters and Alcor pairs | `waxonedge_pairs`; `/api/waxonedge/token/:contract/:symbol/pairs` | yes | yes | every row where token is side A or B | continue source cursor coverage | pair endpoint returns complete paged rows |
| pair reserves | DEX table reserves | `waxonedge_pairs.reserve_a`, `reserve_b` | yes | yes | parsed asset reserve quantities | concentrated liquidity math parity for Alcor V2 | pair proof rows include reserves |
| pair source/DEX | Adapter metadata | `waxonedge_pairs.source` | yes | yes | normalized source key | none | source labels remain distinct |
| pair fee | DEX table or reference default | `waxonedge_pairs.fee_bps` | yes | yes where known | Alcor fee scale or source default bps | source-specific dynamic fees if exposed | pair rows include `fee_bps` |
| pair TVL/liquidity contribution | Reserves valued in WAX/USD | future `/api/waxonedge/token/:contract/:symbol/pairs` contribution fields | planned | not guaranteed today | pair WAX contribution = valued reserve total for that indexed pair | backend proof fields for contribution route and valued reserves | contribution proof tests |
| chart candles/OHLCV | D1 candles from indexed trades | `waxonedge_chart_candles`; `/api/waxonedge/token/:contract/:symbol/chart` | yes | conditional | OHLCV bucketed from `waxonedge_trades` only | more trade stream coverage | no synthetic candle tests |
| source count | Aggregated pair source keys | `waxonedge_token_stats.source_count`, `source_keys` | yes | yes | unique indexed sources for token | none | bootstrap includes source count |
| indexed pair count | Aggregated pair rows | `waxonedge_token_stats.indexed_pair_count` | yes | yes | count pair rows with token side | none | bootstrap includes pair count |
| strongest pair | Selected price pair | `selected_pair_source`, `selected_pair_id`, debug `strongest_pair` | yes | yes when priced | highest tier, liquidity, then volume | none | debug exposes strongest pair proof |
| WAX/USD price | Alcor global or WAX token selected USD | `alcor_global`, `eosio.token::WAX` token row | yes | yes when indexed | WAX token USD price or Alcor global price | alternate oracle source | bootstrap summary includes WAX/USD |

## Product Decisions

- Holder UI remains hidden until the holders endpoint is implemented to read real latest `waxonedge_holders` snapshots and those snapshots exist in D1.
- Market-cap primary scanner mode must remain hidden until `circulating_supply` and `market_cap_*` are real.
- 7D and 30D scanner controls must remain hidden until real indexed history populates 7d/30d volume fields.
- TVL and liquidity currently share the same indexed pair-reserve valuation basis. They are both backend fields, but UI must not present them as independent protocol facts.
- Bubble sizing and metric modes must not substitute unrelated fields for missing primary metrics.

## Cannot Complete Locally Without

- **Holder endpoint and indexer:** the repo has holder schema only. The holders endpoint is currently stubbed and must be implemented before holder UI can become live. Local Worker code cannot safely discover every token holder by scanning arbitrary WAX account balances inside edge request budgets. A VPS holder indexer or verified holder snapshot feed must write latest positive-balance rows into D1 before `holder_count`, top holders, balance, and percentage become live.
- **Circulating supply source:** market cap requires a verified circulating-supply feed or an owned exclusion list for locked/burned/team/treasury balances per token. FDV is enabled from total supply and selected price; market cap remains absent until `circulating_supply` is real.
- **Deployed WAX Hyperion configuration:** 24h trade-derived change, 7D volume, 30D volume, and candle coverage require `WAXONEDGE_HYPERION_API` pointed at a real WAX Hyperion/state-history endpoint so the trade indexers can write D1 `waxonedge_trades` and `waxonedge_chart_candles`.
- **Live D1 history rows:** 7D/30D controls cannot be enabled locally until deployed D1 contains enough real trade/candle history to populate those windows.
- **Scheduled source sync after deploy:** all-pairs valuation, supply rotation, FDV, source coverage, and contribution proofs need the scheduled Worker jobs to run after deployment so D1 has current `waxonedge_pairs`, `waxonedge_tokens`, and `waxonedge_token_stats`.
- **Worker or VPS full supply sweep:** WAX RPC `get_currency_stats` coverage is budget-bound. A bounded Worker rotation or VPS sweep is required if production token count exceeds Worker budgets and immediate full coverage is needed.
- **Independent protocol TVL source:** current TVL equals indexed pair reserve value. A separate protocol TVL adapter is required before the product can show TVL and liquidity as separate facts.
- **D1 migration/deploy state:** if new schema columns are added later for holder snapshots, history windows, or circulating supply provenance, the live D1 migration must be deployed before UI capabilities can turn on.

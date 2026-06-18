# WaxOnEdge DEX Adapter Contract

Layer 1 valuation repair locks WaxOnEdge valuation to verified adapter-specific rules. These rules are the contract for indexed analytics and live bubbles; unverified adapters must return weak or unavailable proof instead of guessed price/liquidity.

| Adapter | Contract | Table(s) | Live actions | Pricing type |
| --- | --- | --- | --- | --- |
| Alcor orderbook | `alcordexmain` | `markets` | `sellmatch`, `buymatch` | orderbook market match |
| Alcor concentrated pool | `swap.alcor` | `pools`, `positions`, `ticks` | `logswap`, `logmint`, `logburn`, `logcollect`, `logpool` | concentrated liquidity, not V2 reserve ratio |
| Taco | `swap.taco` | `pairs` | `exchangelog`, `liquiditylog`, `inittoken` | V2 constant-product |
| Defibox | `swap.box` | `pairs` | `swaplog`, `liquiditylog`, `createlog` | V2 constant-product |
| NeftyBlocks | `swap.nefty` | `pairs` | `logswap`, `lognewpair` | V2 constant-product |
| A-DEX | `swap.adex` | `pools` | listing action `createpool` | table-only until swap action verified |
| WaxFusion | `dapp.fusion` | `global` | n/a | special staking-rate source, not a DEX pair |

Every normalized pair proof must expose the canonical fields used by the Worker:

- `source`
- `pair_id`
- `token_a_contract`
- `token_a_symbol`
- `token_a_decimals`
- `token_b_contract`
- `token_b_symbol`
- `token_b_decimals`
- `reserve_a_decimal`
- `reserve_b_decimal`
- `fee_bps`
- `updated_at`
- `valuation_basis`
- `proof_status`
- `reason_codes`

Selection rules:

- Use verified pair prices only.
- Reject zero or null prices.
- Reject pairs under the existing minimum trusted WAX liquidity threshold.
- Reject extreme outliers before selecting a price.
- Select the liquidity-weighted median price.
- Keep `selected_pair_source` and `selected_pair_id` as proof.
- Do not blindly average DEX prices.

Product rules:

- `/waxonedge.html` is the product path.
- WaxOnEdge remains live analytics and bubbles only.
- No swaps, route execution, wallet transaction path, order builder, fake data, fake candles, or browser Hyperion fetching.

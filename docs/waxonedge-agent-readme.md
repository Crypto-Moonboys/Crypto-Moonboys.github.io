# WaxOnEdge Agent README

This document is the anti-drift handover for future agents working on WaxOnEdge inside `Crypto-Moonboys/Crypto-Moonboys.github.io`.

WaxOnEdge is not an Alcor-only widget and must not be treated as a normal static frontend feature. It is a WAX multi-DEX market-data indexer and scanner built on the Crypto Moonboys site stack.

## Current architecture

WaxOnEdge currently lives in the Moonboys GitHub Pages + Cloudflare Worker stack.

Primary repository:

```text
Crypto-Moonboys/Crypto-Moonboys.github.io
```

Primary frontend files:

```text
waxonedge.html
css/waxonedge-bubbles-v2.css
js/waxonedge-bubbles-v2.js
```

Primary Worker/API files:

```text
workers/moonboys-api/routes/waxonedge.js
workers/moonboys-api/wrangler.toml
```

Primary tests:

```text
scripts/waxonedge-smoke.test.mjs
scripts/waxonedge-live-backend.test.mjs
```

Core API route family:

```text
/api/waxonedge/bootstrap
/api/waxonedge/indexer-health
/api/waxonedge/sync-status
/api/waxonedge/token/:contract/:symbol/debug
/api/waxonedge/candles
```

Cloudflare is the current runtime:

```text
Cloudflare Pages = static site/frontend
Cloudflare Worker moonboys-api = WaxOnEdge API and scheduled indexer chunks
Cloudflare D1 = indexed token, pair, aggregate, trade, and candle data
Workers Paid = active and required for realistic indexing capacity
```

Do not move WaxOnEdge to Railway, Vercel, or the Moonboys VPS unless Cloudflare Workers Paid still proves insufficient after the internal kline/trade-indexing work has been completed and verified. The existing Moonboys VPS is currently for the 2-player game and should not be overloaded casually.

## Runtime configuration

Workers Paid is active, but the shared Moonboys API Worker should still run
WaxOnEdge cron in free-safe rotation unless a short, supervised backfill window is
being deployed.

The Worker should run with:

```text
WAXONEDGE_FREE_SAFE_MODE=true
```

This must be visible in health output:

```json
"runtime_config": {
  "free_safe_mode": true
}
```

Expected paid-mode fields include:

```text
active_candle_backfill_pair_limit
active_trade_index_pair_limit
active_trade_rows_per_market_limit
active_source_page_limit
active_cron_rotation_mode
```

Keep `active_cron_rotation_mode` as isolated heavy workloads. Paid mode should increase safe limits, not revert to one giant everything-at-once cron job.

## Non-negotiable rules

Never add fake market data.

Do not fake:

```text
prices
volume
TVL/liquidity
holders
market cap
FDV
candles
trades
supply
source coverage
```

If data is not indexed or cannot be computed from indexed rows, show an unavailable reason.

Valid missing-data language includes:

```text
Requires indexed backend
Requires indexed candle or trade history
Trade rows not indexed yet
Candles not indexed yet
Source indexed; price unavailable
Circulating supply not indexed
No fake candles are shown
```

Do not hardcode WUF or any specific token.

Do not add swap/wallet execution flows. WaxOnEdge is currently analytics/scanner/indexing only.

Do not use AntBubbles live APIs. AntBubbles is a visual reference only.

Do not make WaxOnEdge Alcor-only.

## Multi-DEX source model

WaxOnEdge must use all configured WAX DEX/indexed sources where available:

```text
alcor
swap.alcor
swap.taco
swap.nefty
swap.box
```

The scanner, token detail, aggregates, and source badges must reflect multi-DEX coverage.

Token/pair stats should use:

```text
selected price source
strongest pair
source count
indexed pair count
24h volume where real
indexed liquidity/TVL where real
FDV where total supply + selected price exists
market cap only when circulating supply + price are real
```

## Current frontend direction

PR #710 replaced the old weak scanner with an AntBubbles-style frontend.

The frontend should be a black/orange, canvas-based bubble scanner that uses only WaxOnEdge backend data.

It should provide:

```text
Top 100 token bubbles
metric/timeframe controls
search
live/indexer status
bottom stats bar
hover tooltip
token modal
source badges
selected pair/source details
unavailable reasons for missing fields
```

The scanner must be frontend/static compatible with GitHub Pages. Do not introduce Next.js, Vercel-only architecture, or server-rendered assumptions unless the repo is intentionally migrated.

Useful visual references uploaded during development:

```text
antbubbles-main.zip = main visual/UX reference
wax-bubble-chart-main.zip = secondary/simple D3 bubble-layout reference only
```

Do not copy AntBubbles data calls. Do not use old CSV sample data. Do not commit font files from uploaded references.

## Current backend/indexer direction

WaxOnEdge began by indexing pairs, selected prices, liquidity, source counts, and partial aggregates. It then added health/debug endpoints to stop guessing why tokens were dead.

Important completed/merged concepts:

```text
PR #702: complete token aggregate metrics from indexed pair rows
PR #703: indexer health and token debug endpoints
PR #704: chunked source sync and partial_success aggregates
PR #705: source cursor progression and initial candle backfill plan
PR #706: Taco cursor resume and candle cron activation
PR #708: isolated cron workloads, Free-safe/Paid mode limits, selected-price count scoping
PR #709: internal WaxOnEdge-style kline builder and /api/waxonedge/candles compatibility
PR #710: AntBubbles-style multi-DEX bubble frontend
PR #711: Alcor trade-row indexing for internal klines
```

Important current issue after PR #711:

```text
The internal candle builder is structurally active, but candles remain unavailable until real trade rows are indexed.
```

At the time of this handover, health showed:

```text
free_safe_mode=true
trade_indexing active
trade_rows_indexed=0
rows_written=0
last_error=502 Bad Gateway
candle_backfill last_error=trade rows not indexed yet
candles_written=0
latest_1d_candle_count=0
```

Meaning:

```text
The architecture is right, but Alcor trade-history fetching/upstream handling still needs hardening or a different ingestion source.
```

PR #712 was opened to harden Alcor trade-row fetch diagnostics. Check its current state before continuing.

## WaxOnEdge reference repos

Uploaded/public reference repos used for architecture:

```text
Wapaca/waxonedge_backend_public
Wapaca/waxonedge_contract_public
```

The backend reference is the important one for candles/klines:

```text
app/bin/Indexers/Klines.js
app/bin/Models/Rows/Kline.js
app/api.js
README_API.md
```

Reference behaviour:

```text
GET /candles
query: duration, src, pair_id, is_reversed, startAt, endAt, countBack
src=alcormarket for Alcor market candles
startAt/endAt in milliseconds in the reference API
1m candles built from indexed trades/swaps
higher intervals built from lower intervals
1d candles built from 12h in the original reference
Alcor market trade price derived from unit_price / 10^8
no fake candles
```

The contract reference is useful for table/source confirmation:

```text
alcordexmain::markets
swap.alcor::pools
swap.taco::pairs
swap.box::pairs
swap.nefty::pairs
```

Do not assume the contract repo contains HTTP candle API logic.

## Candle and trade indexing rules

Do not depend on guessed public Alcor chart endpoints as the core candle path. Earlier attempts produced repeated 404s such as:

```text
no_chart_endpoint: alcor pair 36 returned 404
```

The correct long-term direction is internal klines from real indexed trade/swap rows.

For Alcor market candles:

```text
index real market match/trade rows into waxonedge_trades
preserve source and pair/market id link to waxonedge_pairs
build 1D candles only from real trade rows
store OHLCV in waxonedge_chart_candles
serve via /api/waxonedge/candles with src and pair_id
```

For pool sources:

```text
swap.alcor
swap.taco
swap.nefty
swap.box
```

Only build candles if real swap/trade history is indexed. Do not invent OHLC candles from reserve snapshots alone.

If swap history is unavailable, report:

```text
swap_rows_not_indexed
trade_history_not_available_for_source
```

## Candle API usage

`/api/waxonedge/candles` requires `src` and `pair_id`.

A bare request will correctly return:

```json
{
  "unavailable": "src and pair_id are required"
}
```

Example format:

```text
/api/waxonedge/candles?duration=1d&src=swap.alcor&pair_id=314
/api/waxonedge/candles?duration=1d&src=alcormarket&pair_id=843
```

Use the source/pair values exposed by token debug or candle URL examples. Do not guess.

Token debug should expose:

```text
chart_src
chart_pair_id
candle_url_example
```

## Health signals to watch

Use:

```text
/api/waxonedge/indexer-health
/api/waxonedge/sync-status
```

Healthy signs:

```text
runtime_config.free_safe_mode=false
stale_sync_rows=[]
aggregate_rebuild.status=success or partial_success
aggregate_rebuild.fresh_after_latest_pair_sync=true
aggregate_rebuild_not_run_after_pair_sync=0
source cursors progressing or complete
trade_indexing active without stale failure
candle_backfill active
budget_exhausted=false
```

Still-broken candle signs:

```text
trade_rows_indexed=0
rows_written=0
candles_written=0
latest_1d_candle_count=0
trade rows not indexed yet
upstream 5xx from trade endpoint
```

Health count invariants that must hold:

```text
tokens_with_selected_price + tokens_without_selected_price = total_indexed_tokens
tokens_with_selected_pair + tokens_without_selected_pair = total_indexed_tokens
```

If either invariant fails, fix scoping before trusting health output.

## Common pitfalls already fixed once

Do not reintroduce these issues:

```text
unbounded all-priced-token queries per token request
0.00% fake price change when change is unavailable
rounding tiny non-zero prices to 0.00
selected-pair counts exceeding total indexed tokens
source counts based on pairs outside waxonedge_tokens
chart candle health counting non-1D intervals
partial sync treated as hard failure
Too many subrequests from one giant cron invocation
candle endpoint 404 treated as fatal Worker failure
external_chart_endpoint_unsupported conflated with internal unsupported reasons
oldest 5000 trades selected instead of newest 5000
raw_json parsed repeatedly per trade row
trade index partial cursor marked truncated/stale
```

## PR template requirements

The repo has a strict PR template validator. PR bodies should use exact sections similar to:

```text
# Summary
# Scope lock
# Files changed
# Runtime impact
# Deploy notes
# Tests run
# Live verification needed
# Anti-drift checklist
# Merge decision
```

Runtime impact checkboxes must be structured. Deploy notes should explicitly state whether Worker deploy and D1 migration are required.

For WaxOnEdge Worker/API PRs, usually:

```text
Worker deploy required: Yes
D1 migration required: No
VPS restart required: No
GitHub Pages only: No
```

For frontend-only scanner PRs:

```text
Worker deploy required: No
D1 migration required: No
VPS restart required: No
GitHub Pages only: Yes
```

Avoid control characters, malformed backticks, or escaped junk in PR bodies. The validator has failed on bad text before.

## Deployment notes

After any Worker/API change:

```cmd
cd C:\Users\GOD\Crypto-Moonboys.github.io
git checkout main
git pull origin main
cd workers\moonboys-api
npx wrangler deploy
```

After frontend-only changes, wait for GitHub Pages deploy and hard-refresh the page.

## When to use the VPS

Do not move WaxOnEdge to the VPS by default.

Use Cloudflare Workers Paid first.

Consider the existing Moonboys VPS only if all of the following remain true after trade indexing and internal klines are complete:

```text
historical trade crawling needs long-running jobs
Worker cron still cannot keep up
D1 read/write pressure becomes excessive
retry queues/backfills need always-on processing
```

If that happens, the correct split is:

```text
Existing VPS = heavy WaxOnEdge indexer, historical trade crawler, kline builder
Cloudflare Worker/D1 = public API and cached analytics reads
GitHub Pages = frontend
```

Do not use Vercel as the fix for market-data indexing.

## WharfKit note

WharfKit may be useful later for cleaner WAX/Antelope RPC calls, table reads, and future wallet/session work.

Do not mix WharfKit into the AntBubbles frontend PR or candle rendering work unless there is a clear Cloudflare Worker-compatible backend refactor reason.

Potential later PR:

```text
refactor(waxonedge): evaluate WharfKit for WAX RPC table reads
```

## Current priority order

Future agents should continue in this order:

```text
1. Finish PR #712 or current trade-fetch diagnostic PR.
2. Get alcor_trade_rows writing real rows into waxonedge_trades.
3. Confirm candle_backfill builds real 1D candles from trade rows.
4. Confirm latest_1d_candle_count > 0 and tokens_with_chart_candles > 0.
5. Confirm /api/waxonedge/candles returns rows with real src/pair_id.
6. Verify the AntBubbles-style frontend uses WaxOnEdge multi-DEX data only.
7. Only then improve polish/performance/extra metrics.
```

Do not drift into unrelated wiki pages, token-specific patches, old scanner tables, swap execution, or platform migrations until the real trade/candle pipeline is working.

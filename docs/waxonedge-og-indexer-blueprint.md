# WAXONEDGE OG Indexer Blueprint

Status: planning and implementation scaffold. This document intentionally does **not** claim the current static page is a complete WaxOnEdge rebuild.

## Why this exists

The merged static WAXONEDGE page is useful as a front-end shell, but the original WaxOnEdge experience shown in the reference screenshots requires indexed data. A browser-only page cannot reliably reproduce:

- token holder counts
- top holders
- long-range 7d / 30d volume
- complete pool/pair liquidity across WAX DEX sources
- market cap / FDV from verified supply + price
- chart/candle history for selected token pairs
- source-normalized DEX rows with reserves, volume, price, and routing metadata

The next build must be a Cloudflare-backed indexer and cache layer before the UI can honestly match OG WaxOnEdge.

## Non-negotiable rule

If a value is not backed by indexed or directly fetched source data, the UI/API must return one of:

- `Unavailable`
- `Requires indexed backend`
- `Source not indexed yet`

It must never infer or fabricate holder counts, 7d/30d volume, TVL, liquidity, market cap, FDV, chart data, or DEX coverage.

## Target architecture

```text
WAX / DEX public sources
  -> Cloudflare Worker scheduled sync
  -> D1 relational index
  -> KV/R2 optional snapshot cache
  -> /api/waxonedge/* read endpoints
  -> /waxonedge frontend
```

## Source adapters

Each source must have its own adapter and must declare which fields it can actually provide.

### Alcor

Use for:

- token list
- pairs
- tickers
- global analytics
- market candles/charts where supported
- latest trades where supported

Do not assume every token has a chartable Alcor market.

### `swap.nefty`

Use WAX RPC only.

Required sequence:

1. `get_abi` for `swap.nefty`
2. confirm available table names
3. only then call `get_table_rows`
4. normalize rows only when token symbols, reserves, and pair identifiers can be parsed honestly

Do not hardcode unverified table assumptions as live data.

### Hyperion / WAX history

Use for:

- transfers
- action history
- account movement
- possible holder index seed data

Do not call account token balances “holder distribution.” True holder counts require indexed balances or a verified holder source.

### Future DEX adapters

Adapters may be added for TacoSwap, Defibox, A-DEX, WaxFusion, or other WAX market sources only after their endpoints/contracts/tables are confirmed.

The UI must not say “all WAX DEXs” until all listed adapters are actually active and indexed.

## API contract

All endpoints are read-only.

```text
GET /api/waxonedge/summary
GET /api/waxonedge/tokens/top
GET /api/waxonedge/pairs/top
GET /api/waxonedge/token/:contract/:symbol
GET /api/waxonedge/token/:contract/:symbol/pairs
GET /api/waxonedge/token/:contract/:symbol/chart
GET /api/waxonedge/token/:contract/:symbol/holders
GET /api/waxonedge/token/:contract/:symbol/trades
GET /api/waxonedge/sync-status
```

### Response shape rule

Every response must include:

```json
{
  "ok": true,
  "source": "waxonedge-indexer",
  "updated_at": "ISO timestamp or null",
  "data": {},
  "warnings": []
}
```

If data is missing:

```json
{
  "ok": false,
  "source": "waxonedge-indexer",
  "updated_at": null,
  "data": null,
  "warnings": ["Requires indexed backend"]
}
```

## D1 tables

```sql
-- source sync status
CREATE TABLE IF NOT EXISTS waxonedge_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS waxonedge_tokens (
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER,
  total_supply TEXT,
  max_supply TEXT,
  price_wax REAL,
  price_usd REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (contract, symbol)
);

CREATE TABLE IF NOT EXISTS waxonedge_pairs (
  source TEXT NOT NULL,
  pair_id TEXT NOT NULL,
  token_a_contract TEXT,
  token_a_symbol TEXT,
  token_b_contract TEXT,
  token_b_symbol TEXT,
  price REAL,
  change_24h REAL,
  volume_24h REAL,
  liquidity_wax REAL,
  liquidity_usd REAL,
  reserve_a TEXT,
  reserve_b TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, pair_id)
);

CREATE TABLE IF NOT EXISTS waxonedge_token_stats (
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  holder_count INTEGER,
  circulating_supply TEXT,
  volume_24h REAL,
  volume_7d REAL,
  volume_30d REAL,
  market_cap_wax REAL,
  market_cap_usd REAL,
  fdv_wax REAL,
  fdv_usd REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (contract, symbol)
);

CREATE TABLE IF NOT EXISTS waxonedge_holders (
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  account TEXT NOT NULL,
  balance TEXT NOT NULL,
  percentage REAL,
  snapshot_at TEXT NOT NULL,
  PRIMARY KEY (contract, symbol, account, snapshot_at)
);

CREATE TABLE IF NOT EXISTS waxonedge_chart_candles (
  source TEXT NOT NULL,
  pair_id TEXT NOT NULL,
  interval TEXT NOT NULL,
  bucket_time TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, pair_id, interval, bucket_time)
);
```

## Sync schedule

Start conservative. Increase later only after source rate limits are understood.

- every 1 minute: WAX price, Alcor tickers, top pairs, top volume
- every 5 minutes: token list, pair list, `swap.nefty` ABI and confirmed pool rows
- every 15 minutes: token supply and FDV inputs
- every 1 to 6 hours: holder snapshots, top holders, whale concentration

## Frontend rules

The WAXONEDGE page should read from `/api/waxonedge/*` first. Browser-side direct source fetching may remain only as a diagnostic fallback and must not fill missing metrics with guesses.

Default page should show:

1. OG top bar
2. top tokens and top pairs
3. selected token detail only after a real token is selected or an indexed default exists
4. chart/stats/pair matrix from cached API data

The normal wiki sidebar should be hidden in WAXONEDGE terminal mode by default once the indexed backend is active.

## Release gates

Do not call the rebuild “OG complete” until:

- API returns top tokens
- API returns top pairs
- token detail has real price, supply, pair matrix, and chart data
- holder count is real or explicitly unavailable
- 7d/30d volume is real or explicitly unavailable
- no DEX appears unless its adapter produced rows
- default page does not land on a dead token state
- browser page does not depend on public API calls for every visitor

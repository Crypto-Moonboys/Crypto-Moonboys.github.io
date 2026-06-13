const WAXONEDGE_API_PREFIX = '/api/waxonedge';

const ALCOR_API = 'https://wax.alcor.exchange/api/v2';
const WAX_RPC = 'https://wax.greymass.com';
const UNAVAILABLE = 'Unavailable';
const REQUIRES_INDEXED_BACKEND = 'Requires indexed backend';
const SOURCE_NOT_INDEXED = 'Source not indexed yet';
const CHAIN_TABLE_PAGE_LIMIT = 1000;
const MAX_CHAIN_TABLE_PAGES = 20;
const CORE_DEX_PAGES_PER_INVOCATION = 3;
const CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE = 3;
const SOURCE_STALE_MINUTES = 30;
const MIN_TRUSTED_WAX_LIQUIDITY = 10;
const CANDLE_BACKFILL_SOURCE = 'candle_backfill';
const CANDLE_BACKFILL_PLAN = 'Internal 1D kline backfill planned from indexed trade rows; no fake candles are inserted.';
const WAXONEDGE_FREE_SAFE_MODE_DEFAULT = true;
const DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT = 24;
const FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION = 1;
const FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE = 1;
const FREE_SAFE_CANDLE_BACKFILL_PAIR_LIMIT = 2;
const FREE_SAFE_CANDLE_SUBREQUEST_BUDGET = 2;
const CANDLE_BACKFILL_LOOKBACK_DAYS = 120;
const STUCK_CURSOR_RETRY_LIMIT = 3;
const WAXONEDGE_AGGREGATE_SOURCES = Object.freeze([
  'alcor',
  'swap.alcor',
  'swap.taco',
  'swap.nefty',
  'swap.box',
]);
const TOKEN_PAIR_PAGE_LIMIT = 100;
const TOKEN_PAIR_MAX_PAGE_LIMIT = 250;
const LARGE_SNAPSHOT_SOURCES = Object.freeze([
  'swap.alcor_pools',
  'swap.taco_pairs',
  'swap.nefty_pairs',
  'swap.box_pairs',
]);

function waxonedgeFreeSafeMode(env) {
  return String(env?.WAXONEDGE_FREE_SAFE_MODE ?? WAXONEDGE_FREE_SAFE_MODE_DEFAULT).toLowerCase() !== 'false';
}

function coreDexPagesPerInvocation(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION : CORE_DEX_PAGES_PER_INVOCATION;
}

function coreDexRpcBudgetPerSource(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE : CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE;
}

function candleBackfillPairLimit(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_CANDLE_BACKFILL_PAIR_LIMIT : DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT;
}

function candleSubrequestBudget(env) {
  return waxonedgeFreeSafeMode(env) ? FREE_SAFE_CANDLE_SUBREQUEST_BUDGET : DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT;
}

function isSubrequestBudgetError(error) {
  return /too many subrequests|subrequest/i.test(String(error?.message || error || ''));
}

function isNotFoundError(error) {
  return /^404\b|not found/i.test(String(error?.message || error || ''));
}

function normalizeCandleInterval(value) {
  const text = String(value || '1D').trim().toLowerCase();
  if (text === '1d' || text === 'd') return '1D';
  if (text === '1m') return '1m';
  return text.toUpperCase();
}

function referenceCandleSource(source) {
  const key = aggregateSourceKey(source);
  if (key === 'alcor') return 'alcormarket';
  return key;
}

function moonboysCandleSource(source) {
  const key = String(source || '').trim().toLowerCase();
  if (key === 'alcormarket' || key === 'alcordexmain') return 'alcor';
  return aggregateSourceKey(key);
}

function selectCoreDexAdapterForCron(minute) {
  return CORE_DEX_ADAPTERS[Math.floor(Math.max(0, minute) / 4) % CORE_DEX_ADAPTERS.length];
}

const CORE_DEX_ADAPTERS = Object.freeze([
  {
    source: 'swap.alcor',
    label: 'Alcor',
    referenceSource: 'alcorv2',
    dexCode: 'a2',
    poolType: 'poolsv3',
    contract: 'swap.alcor',
    table: 'pools',
    normalizer: 'tokenA-tokenB',
    feeScale: 100,
    explorer: 'https://waxblock.io/account/swap.alcor',
  },
  {
    source: 'swap.taco',
    label: 'Taco',
    referenceSource: 'taco',
    dexCode: 't',
    poolType: 'pools',
    contract: 'swap.taco',
    table: 'pairs',
    normalizer: 'pool1-pool2',
    defaultFeeBps: 30,
    explorer: 'https://waxblock.io/account/swap.taco',
  },
  {
    source: 'swap.nefty',
    label: 'NeftyBlocks',
    referenceSource: 'neftyblocks',
    dexCode: 'n',
    poolType: 'pools',
    contract: 'swap.nefty',
    table: 'pairs',
    normalizer: 'reserve0-reserve1',
    defaultFeeBps: 30,
    explorer: 'https://waxblock.io/account/swap.nefty',
  },
  {
    source: 'swap.box',
    label: 'BOX',
    referenceSource: 'defibox',
    dexCode: 'd',
    poolType: 'pools',
    contract: 'swap.box',
    table: 'pairs',
    normalizer: 'box-pairs',
    defaultFeeBps: 30,
    explorer: 'https://waxblock.io/account/swap.box',
  },
]);

const REFERENCE_QUOTE_TOKENS = Object.freeze([
  ['usdt.alcor', 'USDT'],
  ['eth.token', 'WAXUSDT'],
  ['eth.token', 'WAXUSDC'],
  ['eth.token', 'WAXDAI'],
  ['eth.token', 'WAXBUSD'],
  ['eth.token', 'WAXWBTC'],
  ['s.architect', 'ARBTC'],
  ['eth.token', 'WAXRBTC'],
  ['eth.token', 'WAXWETH'],
  ['eosio.token', 'WAX'],
]);

const PREFERRED_QUOTES = Object.freeze(
  REFERENCE_QUOTE_TOKENS.map(([contract, symbol]) => tokenKey(contract, symbol)),
);

function aggregateSourceKey(source) {
  return String(source || '').trim().toLowerCase();
}

function sourceCoverageFromKeys(sourceKeys) {
  const keys = new Set(Array.isArray(sourceKeys) ? sourceKeys.map(aggregateSourceKey).filter(Boolean) : []);
  return {
    alcor: keys.has('alcor'),
    swap_alcor: keys.has('swap.alcor'),
    swap_taco: keys.has('swap.taco'),
    swap_nefty: keys.has('swap.nefty'),
    swap_box: keys.has('swap.box'),
  };
}

function parseSourceKeys(value) {
  if (Array.isArray(value)) return value.map(aggregateSourceKey).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(aggregateSourceKey)
    .filter(Boolean);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function waxonedgeJson(payload, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

function envelope({ ok = true, data = null, warnings = [], error = null, updatedAt = null }) {
  const body = {
    ok,
    source: 'moonboys-api/waxonedge',
    updated_at: updatedAt,
    data,
    warnings,
  };
  if (error) body.error = error;
  return body;
}

function ok(data, warnings = [], updatedAt = null, corsHeaders = {}) {
  return waxonedgeJson(envelope({ ok: true, data, warnings, updatedAt }), 200, corsHeaders);
}

function unavailable(message, status = 503, corsHeaders = {}) {
  return waxonedgeJson(envelope({
    ok: false,
    data: null,
    warnings: [message || REQUIRES_INDEXED_BACKEND],
    error: message || REQUIRES_INDEXED_BACKEND,
  }), status, corsHeaders);
}

function nowIso() {
  return new Date().toISOString();
}

function safeString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function safeDecimal(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = String(value).trim();
  return /^[-+]?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(text) ? text : null;
}

function incrementNumericCursor(cursor) {
  const text = String(cursor || '').trim();
  if (!/^\d+$/.test(text)) return '';
  try {
    return String(BigInt(text) + 1n);
  } catch {
    return '';
  }
}

function asNumber(value) {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function sourceRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeContract(value) {
  return String(value || '').trim().toLowerCase();
}

function parseAsset(asset) {
  const raw = String(asset || '').trim();
  const match = raw.match(/^([+-]?\d+(?:\.\d+)?)\s+([A-Z0-9._-]+)$/i);
  if (!match) return { raw, amount: asNumber(raw), symbol: '', precision: null };
  return {
    raw,
    amount: asNumber(match[1]),
    symbol: normalizeSymbol(match[2]),
    precision: match[1].includes('.') ? match[1].split('.')[1].length : 0,
  };
}

function parseSymbolCode(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d+),([A-Z0-9._-]+)$/i);
  if (!match) return { precision: null, symbol: normalizeSymbol(text) };
  return { precision: Number(match[1]), symbol: normalizeSymbol(match[2]) };
}

function tokenKey(contract, symbol) {
  const c = normalizeContract(contract);
  const s = normalizeSymbol(symbol);
  return c && s ? `${c}::${s}` : '';
}

function getSymbolValue(symbolField) {
  if (symbolField == null) return '';
  if (typeof symbolField === 'string') return normalizeSymbol(symbolField);
  if (typeof symbolField === 'object') {
    return normalizeSymbol(symbolField.name || symbolField.symbol || symbolField.code || '');
  }
  return '';
}

function getTokenSideInfo(side) {
  if (!side) return { symbol: '', contract: '', quantity: '', amount: null, decimals: null };
  if (typeof side === 'string') {
    const parsed = parseAsset(side);
    return {
      symbol: parsed.symbol || normalizeSymbol(side),
      contract: '',
      quantity: parsed.raw,
      amount: parsed.amount,
      decimals: parsed.precision,
    };
  }
  const quantity = side.quantity || side.reserve || side.amount || side.balance || side.value || '';
  const parsed = parseAsset(quantity);
  const parsedSymbolCode = parseSymbolCode(side.symbol);
  const symbol = parsed.symbol ||
    parsedSymbolCode.symbol ||
    getSymbolValue(side.symbol) ||
    side.currency ||
    side.token_symbol ||
    side.sym;
  return {
    symbol: normalizeSymbol(symbol),
    contract: normalizeContract(side.contract || side.contract_name || side.code || side.token_contract || side.scope),
    quantity: parsed.raw || String(quantity || ''),
    amount: parsed.amount,
    decimals: side.decimals != null ? Number(side.decimals) : (parsed.precision ?? parsedSymbolCode.precision),
    precision: side.precision != null ? Number(side.precision) : (parsed.precision ?? parsedSymbolCode.precision),
  };
}

function getPairTokens(pair) {
  const sides = [
    pair?.base_token,
    pair?.quote_token,
    pair?.base,
    pair?.target,
    pair?.pool1,
    pair?.pool2,
    pair?.token0,
    pair?.token1,
    pair?.token_a,
    pair?.token_b,
  ];
  const tokens = [];
  for (const side of sides) {
    const token = getTokenSideInfo(side);
    if (!token.symbol && !token.contract) continue;
    const key = tokenKey(token.contract, token.symbol);
    if (key && tokens.some((item) => tokenKey(item.contract, item.symbol) === key)) continue;
    tokens.push(token);
    if (tokens.length >= 2) break;
  }
  return tokens;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpcPost(path, body) {
  return fetchJson(WAX_RPC + path, {
    method: 'POST',
    timeoutMs: 12000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function recordSyncRun(db, source, status, startedAt, error = null) {
  await db.prepare(
    `INSERT INTO waxonedge_sync_runs (source, status, started_at, finished_at, error)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(source, status, startedAt, nowIso(), error ? String(error).slice(0, 1000) : null).run();
}

async function writeSnapshot(db, source, payload, fetchedAt) {
  if (LARGE_SNAPSHOT_SOURCES.includes(source) && Array.isArray(payload?.rows)) {
    throw new Error(`Refusing oversized raw DEX snapshot for ${source}; write compact metadata instead`);
  }
  await db.prepare(
    `INSERT INTO waxonedge_snapshots (source, fetched_at, payload_json)
     VALUES (?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       fetched_at = excluded.fetched_at,
       payload_json = excluded.payload_json`
  ).bind(source, fetchedAt, JSON.stringify(payload)).run();
}

async function writeCompactDexSnapshot(db, adapter, metadata, fetchedAt) {
  await writeSnapshot(db, `${adapter.source}_${adapter.table}`, {
    contract: adapter.contract,
    table: adapter.table,
    row_count: metadata.row_count || 0,
    page_count: metadata.page_count || 0,
    fetched_at: fetchedAt,
    truncated: !!metadata.truncated,
    status: metadata.status || null,
    request_count: metadata.request_count || 0,
    previous_cursor: metadata.previous_cursor || '',
    current_cursor: metadata.current_cursor ?? metadata.cursor ?? '',
    cursor_changed_at: metadata.cursor_changed_at || null,
    chunks_completed: metadata.chunks_completed || 0,
    retry_count: metadata.retry_count || 0,
    skipped_cursor_count: metadata.skipped_cursor_count || 0,
    skipped_cursor_reason: metadata.skipped_cursor_reason || null,
    error: metadata.error || null,
    cursor: metadata.cursor || '',
    sync_cycle_id: metadata.sync_cycle_id || '',
    compact: true,
  }, fetchedAt);
}

async function readSnapshot(db, source) {
  const row = await db.prepare(
    `SELECT fetched_at, payload_json FROM waxonedge_snapshots WHERE source = ? LIMIT 1`
  ).bind(source).first().catch(() => null);
  if (!row?.payload_json) return { fetched_at: null, data: null };
  try {
    return { fetched_at: row.fetched_at || null, data: JSON.parse(row.payload_json) };
  } catch {
    return { fetched_at: row.fetched_at || null, data: null };
  }
}

function buildTokenPriceIndex(tokens) {
  const index = new Map();
  for (const token of sourceRows(tokens)) {
    const symbol = normalizeSymbol(token.symbol || token.id);
    const contract = normalizeContract(token.contract);
    const key = tokenKey(contract, symbol);
    if (!key) continue;
    index.set(key, {
      priceWax: asNumber(token.system_price),
      priceUsd: asNumber(token.usd_price),
    });
  }
  return index;
}

function normalizeToken(token, pairCounts, syncedAt) {
  const symbol = normalizeSymbol(token.symbol || token.id);
  const contract = normalizeContract(token.contract);
  if (!symbol || !contract) return null;
  return {
    contract,
    symbol,
    decimals: token.decimals != null ? Number(token.decimals) : null,
    total_supply: safeDecimal(token.total_supply),
    max_supply: safeDecimal(token.max_supply),
    price_wax: safeDecimal(token.system_price),
    price_usd: safeDecimal(token.usd_price),
    pair_count: pairCounts.get(tokenKey(contract, symbol)) || 0,
    icon_url: safeString(token.logo || token.icon || token.image),
    updated_at: syncedAt,
  };
}

function normalizePair(pair, tickerByMarketId, priceIndex, syncedAt) {
  const ticker = tickerByMarketId.get(String(pair?.ticker_id || '')) ||
    tickerByMarketId.get(String(pair?.id || pair?.market_id || pair?.pair_id || '')) ||
    {};
  const pairId = safeString(ticker.market_id || pair?.id || pair?.market_id || pair?.pair_id || pair?.ticker_id);
  if (!pairId) return null;
  const tokens = getPairTokens(pair);
  if (tokens.length < 2) return null;
  const [tokenA, tokenB] = tokens;
  const price = safeDecimal(ticker.last_price ?? ticker.last ?? pair.last_price ?? pair.price);
  const change24 = safeDecimal(ticker.change24 ?? ticker.price_change_percent ?? ticker.change_24h);
  const volume24 = safeDecimal(ticker.base_volume ?? ticker.volume24 ?? ticker.volume_24h);
  const volume24Raw = asNumber(volume24);
  const reserveA = safeDecimal(tokenA.amount ?? ticker.base_amm_liquidity);
  const reserveB = safeDecimal(tokenB.amount ?? ticker.target_amm_liquidity);

  let liquidityWax = null;
  let liquidityUsd = null;
  const priceA = priceIndex.get(tokenKey(tokenA.contract, tokenA.symbol));
  const priceB = priceIndex.get(tokenKey(tokenB.contract, tokenB.symbol));
  const normalizedVolume = normalizeTokenAVolume(volume24Raw, tokenA, tokenB, price, priceIndex);
  const volume24Wax = normalizedVolume.wax;
  const volume24Usd = normalizedVolume.usd;
  if (tokenA.amount != null && tokenB.amount != null && priceA?.priceWax != null && priceB?.priceWax != null) {
    liquidityWax = safeDecimal((tokenA.amount * priceA.priceWax) + (tokenB.amount * priceB.priceWax));
  }
  if (tokenA.amount != null && tokenB.amount != null && priceA?.priceUsd != null && priceB?.priceUsd != null) {
    liquidityUsd = safeDecimal((tokenA.amount * priceA.priceUsd) + (tokenB.amount * priceB.priceUsd));
  }
  if (liquidityWax == null && normalizeSymbol(tokenB.symbol) === 'WAX') {
    const targetLiquidity = asNumber(ticker.target_amm_liquidity);
    const baseLiquidity = asNumber(ticker.base_amm_liquidity);
    const lastPrice = asNumber(ticker.last_price);
    if (targetLiquidity != null && baseLiquidity != null && lastPrice != null) {
      liquidityWax = safeDecimal(targetLiquidity + (baseLiquidity * lastPrice));
    }
  }
  if (liquidityUsd == null && liquidityWax != null) {
    const waxPrice = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
    if (waxPrice != null) liquidityUsd = safeDecimal(asNumber(liquidityWax) * waxPrice);
  }

  return {
    source: 'alcor',
    pair_id: pairId,
    token_a_contract: tokenA.contract || null,
    token_a_symbol: tokenA.symbol || null,
    token_b_contract: tokenB.contract || null,
    token_b_symbol: tokenB.symbol || null,
    price,
    change_24h: change24,
    volume_24h: volume24,
    volume_24h_wax: volume24Wax,
    volume_24h_usd: volume24Usd,
    liquidity_wax: liquidityWax,
    liquidity_usd: liquidityUsd,
    reserve_a: reserveA,
    reserve_b: reserveB,
    fee_bps: safeDecimal(pair.fee),
    updated_at: syncedAt,
  };
}

function liquidityFromSides(tokenA, tokenB, priceIndex) {
  let liquidityWax = null;
  let liquidityUsd = null;
  const priceA = priceIndex.get(tokenKey(tokenA.contract, tokenA.symbol));
  const priceB = priceIndex.get(tokenKey(tokenB.contract, tokenB.symbol));
  if (tokenA.amount != null && tokenB.amount != null && priceA?.priceWax != null && priceB?.priceWax != null) {
    liquidityWax = safeDecimal((tokenA.amount * priceA.priceWax) + (tokenB.amount * priceB.priceWax));
  }
  if (tokenA.amount != null && tokenB.amount != null && priceA?.priceUsd != null && priceB?.priceUsd != null) {
    liquidityUsd = safeDecimal((tokenA.amount * priceA.priceUsd) + (tokenB.amount * priceB.priceUsd));
  }
  if (liquidityWax == null && normalizeSymbol(tokenA.symbol) === 'WAX' && tokenA.amount != null) {
    liquidityWax = safeDecimal(tokenA.amount * 2);
  }
  if (liquidityWax == null && normalizeSymbol(tokenB.symbol) === 'WAX' && tokenB.amount != null) {
    liquidityWax = safeDecimal(tokenB.amount * 2);
  }
  if (liquidityUsd == null && liquidityWax != null) {
    const waxPrice = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
    if (waxPrice != null) liquidityUsd = safeDecimal(asNumber(liquidityWax) * waxPrice);
  }
  return { liquidityWax, liquidityUsd };
}

function pairPriceWaxForToken(pair, contract, symbol) {
  const key = tokenKey(contract, symbol);
  const tokenAKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
  const tokenBKey = tokenKey(pair.token_b_contract, pair.token_b_symbol);
  const tokenAWax = normalizeContract(pair.token_a_contract) === 'eosio.token' && normalizeSymbol(pair.token_a_symbol) === 'WAX';
  const tokenBWax = normalizeContract(pair.token_b_contract) === 'eosio.token' && normalizeSymbol(pair.token_b_symbol) === 'WAX';
  const reserveA = asNumber(pair.reserve_a);
  const reserveB = asNumber(pair.reserve_b);
  if (key === tokenAKey && tokenBWax) {
    if (pair.price != null) return asNumber(pair.price);
    if (reserveA != null && reserveA > 0 && reserveB != null) return reserveB / reserveA;
  }
  if (key === tokenBKey && tokenAWax) {
    const sourcePrice = asNumber(pair.price);
    if (sourcePrice != null && sourcePrice > 0) return 1 / sourcePrice;
    if (reserveB != null && reserveB > 0 && reserveA != null) return reserveA / reserveB;
  }
  return null;
}

function hasRealPairReserves(pair) {
  const reserveA = asNumber(pair.reserve_a);
  const reserveB = asNumber(pair.reserve_b);
  return reserveA != null && reserveA > 0 && reserveB != null && reserveB > 0;
}

function hasWaxQuoteForToken(pair, contract, symbol) {
  const key = tokenKey(contract, symbol);
  const tokenAKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
  const tokenBKey = tokenKey(pair.token_b_contract, pair.token_b_symbol);
  const waxKey = tokenKey('eosio.token', 'WAX');
  return (key === tokenAKey && tokenBKey === waxKey) || (key === tokenBKey && tokenAKey === waxKey);
}

function isWaxToken(contract, symbol) {
  return tokenKey(contract, symbol) === tokenKey('eosio.token', 'WAX');
}

function normalizeTokenAVolume(volume24Raw, tokenA, tokenB, pairPrice, priceIndex) {
  if (volume24Raw == null) return { wax: null, usd: null };
  const priceA = priceIndex.get(tokenKey(tokenA.contract, tokenA.symbol));
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  let volumeWax = priceA?.priceWax != null ? volume24Raw * priceA.priceWax : null;
  if (volumeWax == null && isWaxToken(tokenA.contract, tokenA.symbol)) {
    volumeWax = volume24Raw;
  } else if (volumeWax == null && isWaxToken(tokenB.contract, tokenB.symbol)) {
    const price = asNumber(pairPrice);
    if (price != null && price > 0) volumeWax = volume24Raw * price;
  }
  let volumeUsd = priceA?.priceUsd != null ? volume24Raw * priceA.priceUsd : null;
  if (volumeUsd == null && volumeWax != null && waxUsd != null) {
    volumeUsd = volumeWax * waxUsd;
  }
  return {
    wax: safeDecimal(volumeWax),
    usd: safeDecimal(volumeUsd),
  };
}

function isFalseLike(value) {
  return value === false || value === 0 || String(value).toLowerCase() === 'false';
}

function adapterFeeBps(adapter, row) {
  const rawFee = asNumber(row.fee ?? row.marketFee ?? row.pool_fee);
  if (rawFee != null) {
    return safeDecimal(adapter.feeScale ? rawFee / adapter.feeScale : rawFee);
  }
  return adapter.defaultFeeBps != null ? safeDecimal(adapter.defaultFeeBps) : null;
}

function normalizeCoreDexPair(adapter, row, priceIndex, syncedAt) {
  if (isFalseLike(row.active)) return null;
  let tokenA = null;
  let tokenB = null;
  if (adapter.normalizer === 'tokenA-tokenB') {
    tokenA = getTokenSideInfo(row.tokenA);
    tokenB = getTokenSideInfo(row.tokenB);
  } else if (adapter.normalizer === 'pool1-pool2') {
    tokenA = getTokenSideInfo(row.pool1);
    tokenB = getTokenSideInfo(row.pool2);
  } else if (adapter.normalizer === 'reserve0-reserve1') {
    tokenA = getTokenSideInfo(row.reserve0);
    tokenB = getTokenSideInfo(row.reserve1);
  } else if (adapter.normalizer === 'box-pairs') {
    tokenA = getTokenSideInfo({
      contract: row.token0?.contract,
      symbol: row.token0?.symbol,
      quantity: row.reserve0,
    });
    tokenB = getTokenSideInfo({
      contract: row.token1?.contract,
      symbol: row.token1?.symbol,
      quantity: row.reserve1,
    });
  }
  if (!tokenA?.contract || !tokenA?.symbol || !tokenB?.contract || !tokenB?.symbol) return null;
  if (tokenA.amount == null || tokenB.amount == null) return null;
  if (tokenA.amount <= 0 || tokenB.amount <= 0) return null;
  const pairId = safeString(row.id ?? row.code ?? row.pair_id);
  if (!pairId) return null;
  const price = tokenA.amount > 0 ? safeDecimal(tokenB.amount / tokenA.amount) : null;
  const liquidity = liquidityFromSides(tokenA, tokenB, priceIndex);
  const volume24 = safeDecimal(row.volume_24h ?? row.volume24);
  const volume24Raw = asNumber(volume24);
  const normalizedVolume = normalizeTokenAVolume(volume24Raw, tokenA, tokenB, price, priceIndex);
  const volume24Wax = normalizedVolume.wax;
  const volume24Usd = normalizedVolume.usd;
  return {
    source: adapter.source,
    pair_id: String(pairId),
    token_a_contract: tokenA.contract,
    token_a_symbol: tokenA.symbol,
    token_b_contract: tokenB.contract,
    token_b_symbol: tokenB.symbol,
    price,
    change_24h: null,
    volume_24h: volume24,
    volume_24h_wax: volume24Wax,
    volume_24h_usd: volume24Usd,
    liquidity_wax: liquidity.liquidityWax,
    liquidity_usd: liquidity.liquidityUsd,
    reserve_a: safeDecimal(tokenA.amount),
    reserve_b: safeDecimal(tokenB.amount),
    fee_bps: adapterFeeBps(adapter, row),
    updated_at: syncedAt,
  };
}

async function getAbiTableNames(contract) {
  const abi = await rpcPost('/v1/chain/get_abi', { account_name: contract });
  return Array.isArray(abi?.abi?.tables)
    ? abi.abi.tables.map((table) => table.name).filter(Boolean)
    : [];
}

async function fetchTableRows(contract, table, options = {}) {
  const limit = options.limit || CHAIN_TABLE_PAGE_LIMIT;
  const requestBudget = Math.max(1, Number(options.requestBudget || options.maxPages || MAX_CHAIN_TABLE_PAGES));
  const maxPages = Math.min(options.maxPages || MAX_CHAIN_TABLE_PAGES, requestBudget);
  const rows = [];
  let lowerBound = options.lowerBound || '';
  let nextKey = '';
  let truncated = false;
  let pageCount = 0;
  let requestCount = 0;
  let complete = false;
  for (let page = 0; page < maxPages; page += 1) {
    if (requestCount >= requestBudget) {
      truncated = true;
      break;
    }
    const data = await rpcPost('/v1/chain/get_table_rows', {
      code: contract,
      scope: contract,
      table,
      json: true,
      lower_bound: lowerBound,
      limit,
    });
    requestCount += 1;
    pageCount += 1;
    if (Array.isArray(data?.rows)) rows.push(...data.rows);
    nextKey = data?.next_key || '';
    if (!data?.more || !nextKey) {
      complete = true;
      break;
    }
    if (page === maxPages - 1) {
      truncated = true;
      break;
    }
    lowerBound = nextKey;
  }
  return { rows, truncated, complete, next_key: nextKey, page_count: pageCount, request_count: requestCount };
}

async function upsertPairs(db, pairs) {
  if (!pairs.length) return;
  const statements = pairs.map((pair) => db.prepare(
    `INSERT INTO waxonedge_pairs
     (source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
      price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd, liquidity_wax, liquidity_usd,
      reserve_a, reserve_b, fee_bps, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, pair_id) DO UPDATE SET
       token_a_contract = excluded.token_a_contract,
       token_a_symbol = excluded.token_a_symbol,
       token_b_contract = excluded.token_b_contract,
       token_b_symbol = excluded.token_b_symbol,
       price = excluded.price,
       change_24h = excluded.change_24h,
       volume_24h = excluded.volume_24h,
       volume_24h_wax = excluded.volume_24h_wax,
       volume_24h_usd = excluded.volume_24h_usd,
       liquidity_wax = excluded.liquidity_wax,
       liquidity_usd = excluded.liquidity_usd,
       reserve_a = excluded.reserve_a,
       reserve_b = excluded.reserve_b,
       fee_bps = excluded.fee_bps,
       updated_at = excluded.updated_at`
  ).bind(
    pair.source, pair.pair_id, pair.token_a_contract, pair.token_a_symbol,
    pair.token_b_contract, pair.token_b_symbol, pair.price, pair.change_24h,
    pair.volume_24h, pair.volume_24h_wax, pair.volume_24h_usd,
    pair.liquidity_wax, pair.liquidity_usd, pair.reserve_a,
    pair.reserve_b, pair.fee_bps, pair.updated_at,
  ));
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
}

function buildPairCounts(pairs) {
  const counts = new Map();
  for (const pair of sourceRows(pairs)) {
    for (const side of getPairTokens(pair)) {
      const key = tokenKey(side.contract, side.symbol);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function buildTickerIndex(tickers) {
  const index = new Map();
  for (const ticker of sourceRows(tickers)) {
    const marketId = ticker?.market_id != null ? String(ticker.market_id) : '';
    if (marketId) index.set(marketId, ticker);
    const tickerId = ticker?.ticker_id != null ? String(ticker.ticker_id) : '';
    if (tickerId) index.set(tickerId, ticker);
  }
  return index;
}

async function syncAlcorMarketData(env, reason, syncCycleId = '') {
  const db = env.DB;
  const startedAt = nowIso();
  try {
    const [tokens, pairs, tickers, globalAnalytics] = await Promise.all([
      fetchJson(`${ALCOR_API}/tokens`),
      fetchJson(`${ALCOR_API}/pairs`),
      fetchJson(`${ALCOR_API}/tickers`),
      fetchJson(`${ALCOR_API}/analytics/global`).catch((error) => ({ unavailable: true, error: error.message })),
    ]);
    const syncedAt = nowIso();
    await writeSnapshot(db, 'alcor_tokens', tokens, syncedAt);
    await writeSnapshot(db, 'alcor_pairs', pairs, syncedAt);
    await writeSnapshot(db, 'alcor_tickers', tickers, syncedAt);
    await writeSnapshot(db, 'alcor_global', globalAnalytics, syncedAt);

    const tokenRows = sourceRows(tokens);
    const pairRows = sourceRows(pairs);
    const pairCounts = buildPairCounts(pairRows);
    const normalizedTokens = tokenRows
      .map((token) => normalizeToken(token, pairCounts, syncedAt))
      .filter(Boolean);
    const priceIndex = buildTokenPriceIndex(tokens);
    const tickerIndex = buildTickerIndex(tickers);
    const normalizedPairs = pairRows
      .map((pair) => normalizePair(pair, tickerIndex, priceIndex, syncedAt))
      .filter(Boolean);

    const tokenStatements = normalizedTokens.map((token) => db.prepare(
      `INSERT INTO waxonedge_tokens
       (contract, symbol, decimals, total_supply, max_supply, price_wax, price_usd, pair_count, icon_url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(contract, symbol) DO UPDATE SET
         decimals = excluded.decimals,
         total_supply = excluded.total_supply,
         max_supply = excluded.max_supply,
         price_wax = excluded.price_wax,
         price_usd = excluded.price_usd,
         pair_count = excluded.pair_count,
         icon_url = excluded.icon_url,
         updated_at = excluded.updated_at`
    ).bind(
      token.contract, token.symbol, token.decimals, token.total_supply, token.max_supply,
      token.price_wax, token.price_usd, token.pair_count, token.icon_url, token.updated_at,
    ));
    if (tokenStatements.length) await db.batch(tokenStatements);
    await upsertPairs(db, normalizedPairs);

    await recordSyncRun(db, reason || 'alcor_market_data', 'success', startedAt);
    await recordSyncRun(db, 'alcor', 'success', startedAt);
    if (syncCycleId) {
      await upsertSourceIndexState(db, 'alcor', {
        sync_cycle_id: syncCycleId,
        cursor: '',
        page_count: 1,
        row_count: normalizedPairs.length,
        complete: 1,
        truncated: 0,
        status: 'success',
        error: null,
        started_at: startedAt,
      }).catch(() => {});
    }
    return { ok: true, tokens: normalizedTokens.length, pairs: normalizedPairs.length };
  } catch (error) {
    await recordSyncRun(db, reason || 'alcor_market_data', 'failed', startedAt, error?.message || String(error)).catch(() => {});
    await recordSyncRun(db, 'alcor', 'failed', startedAt, error?.message || String(error)).catch(() => {});
    if (syncCycleId) {
      await upsertSourceIndexState(db, 'alcor', {
        sync_cycle_id: syncCycleId,
        complete: 0,
        truncated: 0,
        status: 'failed',
        error: error?.message || String(error),
        started_at: startedAt,
      }).catch(() => {});
    }
    return { ok: false, error: error?.message || String(error) };
  }
}

async function readSourceIndexState(db, source) {
  return db.prepare(
    `SELECT source, sync_cycle_id, cursor, page_count, row_count, complete, truncated,
            status, error, started_at, updated_at
     FROM waxonedge_source_index_state
     WHERE source = ? LIMIT 1`
  ).bind(source).first().catch(() => null);
}

async function upsertSourceIndexState(db, source, patch) {
  const now = nowIso();
  const existing = await readSourceIndexState(db, source);
  const next = {
    sync_cycle_id: patch.sync_cycle_id ?? existing?.sync_cycle_id ?? '',
    cursor: patch.cursor ?? existing?.cursor ?? '',
    page_count: patch.page_count ?? existing?.page_count ?? 0,
    row_count: patch.row_count ?? existing?.row_count ?? 0,
    complete: patch.complete ?? existing?.complete ?? 0,
    truncated: patch.truncated ?? existing?.truncated ?? 0,
    status: patch.status ?? existing?.status ?? 'pending',
    error: patch.error ?? existing?.error ?? null,
    started_at: patch.started_at ?? existing?.started_at ?? now,
    updated_at: patch.updated_at ?? now,
  };
  await db.prepare(
    `INSERT INTO waxonedge_source_index_state
     (source, sync_cycle_id, cursor, page_count, row_count, complete, truncated, status, error, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       sync_cycle_id = excluded.sync_cycle_id,
       cursor = excluded.cursor,
       page_count = excluded.page_count,
       row_count = excluded.row_count,
       complete = excluded.complete,
       truncated = excluded.truncated,
       status = excluded.status,
       error = excluded.error,
       started_at = excluded.started_at,
       updated_at = excluded.updated_at`
  ).bind(
    source,
    next.sync_cycle_id,
    next.cursor,
    next.page_count,
    next.row_count,
    next.complete,
    next.truncated,
    next.status,
    next.error ? String(next.error).slice(0, 1000) : null,
    next.started_at,
    next.updated_at,
  ).run();
  return { source, ...next };
}

async function getActiveSourceCycleId(db) {
  const rows = await db.prepare(
    `SELECT sync_cycle_id
     FROM waxonedge_source_index_state
     WHERE source IN (${CORE_DEX_ADAPTERS.map(() => '?').join(',')})
       AND complete = 0
       AND sync_cycle_id IS NOT NULL
       AND sync_cycle_id != ''
     ORDER BY updated_at DESC
     LIMIT 1`
  ).bind(...CORE_DEX_ADAPTERS.map((adapter) => adapter.source)).all().catch(() => ({ results: [] }));
  return rows.results?.[0]?.sync_cycle_id || `woe-${Date.now()}`;
}

async function syncCoreDexAdapters(env, syncCycleId = '', options = {}) {
  const startedAt = nowIso();
  const priceRows = await env.DB.prepare(
    `SELECT contract, symbol, price_wax, price_usd FROM waxonedge_tokens`
  ).all().catch(() => ({ results: [] }));
  const priceIndex = new Map();
  for (const row of priceRows.results || []) {
    priceIndex.set(tokenKey(row.contract, row.symbol), {
      priceWax: asNumber(row.price_wax),
      priceUsd: asNumber(row.price_usd),
    });
  }
  const results = [];
  const syncedAt = nowIso();
  const adapters = options.source
    ? CORE_DEX_ADAPTERS.filter((adapter) => adapter.source === options.source)
    : CORE_DEX_ADAPTERS;
  for (const adapter of adapters) {
    const adapterStartedAt = nowIso();
    let activeCycleId = syncCycleId || '';
    try {
      activeCycleId = activeCycleId || await getActiveSourceCycleId(env.DB);
      let state = await readSourceIndexState(env.DB, adapter.source);
      if (state?.complete === 1 && state.sync_cycle_id === activeCycleId) {
        results.push({ source: adapter.source, ok: true, complete: true, skipped: true, cycle: activeCycleId });
        continue;
      }
      if (state?.status === 'running' && minutesSince(state.updated_at || state.started_at) > SOURCE_STALE_MINUTES) {
        state = await upsertSourceIndexState(env.DB, adapter.source, {
          sync_cycle_id: activeCycleId,
          complete: 0,
          truncated: 0,
          status: 'partial',
          error: 'Resuming stale running state from saved cursor',
          started_at: state.started_at || adapterStartedAt,
        });
      }
      const isNewCycle = !state || state.sync_cycle_id !== activeCycleId || state.status === 'failed';
      if (isNewCycle) {
        await env.DB.prepare(`DELETE FROM waxonedge_pairs WHERE source = ?`).bind(adapter.source).run();
        state = await upsertSourceIndexState(env.DB, adapter.source, {
          sync_cycle_id: activeCycleId,
          cursor: '',
          page_count: 0,
          row_count: 0,
          complete: 0,
          truncated: 0,
          status: 'running',
          error: null,
          started_at: adapterStartedAt,
        });
      }
      const tables = await getAbiTableNames(adapter.contract);
      await writeSnapshot(env.DB, `${adapter.source}_abi`, {
        contract: adapter.contract,
        detected_tables: tables,
        expected_table: adapter.table,
        core_adapter: true,
      }, syncedAt);
      if (!tables.includes(adapter.table)) {
        const error = `ABI table not found: ${adapter.table}`;
        await recordSyncRun(env.DB, adapter.source, 'skipped', adapterStartedAt, error);
        await upsertSourceIndexState(env.DB, adapter.source, {
          sync_cycle_id: activeCycleId,
          complete: 0,
          truncated: 0,
          status: 'failed',
          error,
          started_at: state.started_at || adapterStartedAt,
        });
        results.push({ source: adapter.source, ok: true, skipped: true, error });
        continue;
      }
      const tableResult = await fetchTableRows(adapter.contract, adapter.table, {
        limit: CHAIN_TABLE_PAGE_LIMIT,
        lowerBound: state.cursor || '',
        maxPages: options.maxPages || coreDexPagesPerInvocation(env),
        requestBudget: options.requestBudget || coreDexRpcBudgetPerSource(env),
      });
      const rows = tableResult.rows;
      const pairs = rows
        .map((row) => normalizeCoreDexPair(adapter, row, priceIndex, syncedAt))
        .filter(Boolean);
      await upsertPairs(env.DB, pairs);
      const complete = tableResult.complete ? 1 : 0;
      const status = complete ? 'success' : 'partial';
      let error = complete ? null : `Partial source sync checkpoint saved after ${tableResult.page_count} page(s) and ${tableResult.request_count} table row request(s); next_key=${tableResult.next_key || 'unknown'}`;
      const previousSnapshot = await readSnapshot(env.DB, `${adapter.source}_${adapter.table}`);
      const previousCursor = state.cursor || '';
      const reportedCursor = complete ? '' : (tableResult.next_key || '');
      const cursorChanged = previousCursor !== reportedCursor;
      const sameSnapshotCycle = previousSnapshot.data?.sync_cycle_id === activeCycleId;
      const previousRetryCount = sameSnapshotCycle ? (asNumber(previousSnapshot.data?.retry_count) || 0) : 0;
      const retryCount = (!complete && reportedCursor && !cursorChanged) ? previousRetryCount + 1 : 0;
      const previousSkippedCursorCount = sameSnapshotCycle && !cursorChanged
        ? (asNumber(previousSnapshot.data?.skipped_cursor_count) || 0)
        : 0;
      let skippedCursorCount = previousSkippedCursorCount;
      let skippedCursorReason = null;
      let savedCursor = reportedCursor;
      if (!complete && reportedCursor && retryCount >= STUCK_CURSOR_RETRY_LIMIT) {
        const advancedCursor = incrementNumericCursor(reportedCursor);
        if (advancedCursor) {
          savedCursor = advancedCursor;
          skippedCursorCount += 1;
          skippedCursorReason = `stuck_cursor: ${adapter.source} cursor ${reportedCursor} repeated ${retryCount} time(s); next cron will resume at ${advancedCursor}`;
          error = `${error}; ${skippedCursorReason}`;
        } else {
          skippedCursorReason = `stuck_cursor: ${adapter.source} cursor ${reportedCursor} repeated ${retryCount} time(s); unable to auto-advance non-numeric cursor`;
          error = `${error}; ${skippedCursorReason}`;
        }
      }
      const previousCursorChangedAt = previousSnapshot.data?.cursor_changed_at || state.updated_at || state.started_at || adapterStartedAt;
      const effectiveCursorChanged = previousCursor !== savedCursor;
      const cursorChangedAt = effectiveCursorChanged ? nowIso() : previousCursorChangedAt;
      const chunksCompleted = (asNumber(previousSnapshot.data?.chunks_completed) ?? 0) + 1;
      const nextPageCount = (state.page_count || 0) + tableResult.page_count;
      const nextRowCount = (state.row_count || 0) + rows.length;
      await upsertSourceIndexState(env.DB, adapter.source, {
        sync_cycle_id: activeCycleId,
        cursor: complete ? '' : savedCursor,
        page_count: nextPageCount,
        row_count: nextRowCount,
        complete,
        truncated: 0,
        status,
        error,
        started_at: state.started_at || adapterStartedAt,
      });
      await writeCompactDexSnapshot(env.DB, adapter, {
        row_count: nextRowCount,
        page_count: nextPageCount,
        truncated: 0,
        error,
        cursor: complete ? '' : savedCursor,
        sync_cycle_id: activeCycleId,
        status,
        request_count: tableResult.request_count,
        previous_cursor: previousCursor,
        current_cursor: savedCursor,
        cursor_changed_at: cursorChangedAt,
        chunks_completed: chunksCompleted,
        retry_count: retryCount,
        skipped_cursor_count: skippedCursorCount,
        skipped_cursor_reason: skippedCursorReason,
      }, syncedAt);
      if (complete) {
        await recordSyncRun(env.DB, adapter.source, 'success', adapterStartedAt);
      } else {
        await recordSyncRun(env.DB, adapter.source, 'partial', adapterStartedAt, error);
      }
      results.push({
        source: adapter.source,
        ok: true,
        pairs: pairs.length,
        rows: rows.length,
        complete: !!complete,
        status,
        request_count: tableResult.request_count,
        cursor: complete ? '' : savedCursor,
        reported_cursor: reportedCursor,
        retry_count: retryCount,
        skipped_cursor_count: skippedCursorCount,
        skipped_cursor_reason: skippedCursorReason,
        cycle: activeCycleId,
      });
    } catch (error) {
      await recordSyncRun(env.DB, adapter.source, 'failed', adapterStartedAt, error?.message || String(error)).catch(() => {});
      await upsertSourceIndexState(env.DB, adapter.source, {
        sync_cycle_id: activeCycleId,
        complete: 0,
        truncated: /truncated/i.test(String(error?.message || error)) ? 1 : 0,
        status: 'failed',
        error: error?.message || String(error),
        started_at: adapterStartedAt,
      }).catch(() => {});
      results.push({ source: adapter.source, ok: false, error: error?.message || String(error) });
    }
  }
  return { ok: results.every((result) => result.ok), complete: results.every((result) => result.complete || result.skipped), free_safe_mode: waxonedgeFreeSafeMode(env), results };
}

async function getAggregateRunStatus(db) {
  const rows = await db.prepare(
    `SELECT source, sync_cycle_id, complete, truncated, status, error, row_count
     FROM waxonedge_source_index_state
     WHERE source IN (${WAXONEDGE_AGGREGATE_SOURCES.map(() => '?').join(',')})`
  ).bind(...WAXONEDGE_AGGREGATE_SOURCES).all().catch(() => ({ results: [] }));
  const states = new Map();
  for (const row of rows.results || []) {
    const source = aggregateSourceKey(row.source);
    if (!states.has(source)) states.set(source, row);
  }
  const cycleIds = WAXONEDGE_AGGREGATE_SOURCES
    .map((source) => states.get(source)?.sync_cycle_id)
    .filter(Boolean);
  const syncCycleId = cycleIds[0] || '';
  const sameCycle = !!syncCycleId && cycleIds.length === WAXONEDGE_AGGREGATE_SOURCES.length && cycleIds.every((id) => id === syncCycleId);
  const processed = [];
  const failed = [];
  const partialSources = [];
  const truncatedSources = [];
  for (const source of WAXONEDGE_AGGREGATE_SOURCES) {
    const row = states.get(source);
    if (row && row.status === 'success' && asNumber(row.complete) === 1 && row.sync_cycle_id === syncCycleId) {
      processed.push(source);
    } else if (row && ['partial', 'running'].includes(row.status) && asNumber(row.row_count) > 0 && row.sync_cycle_id === syncCycleId) {
      processed.push(source);
      partialSources.push(source);
    } else {
      failed.push(source);
    }
    if (row && (asNumber(row.truncated) === 1 || /truncated/i.test(String(row.error || '')))) truncatedSources.push(source);
  }
  return {
    required: WAXONEDGE_AGGREGATE_SOURCES.slice(),
    syncCycleId,
    processed,
    failed,
    partialSources,
    partial: partialSources.length > 0,
    truncated: truncatedSources.length > 0,
    truncatedSources,
    complete: sameCycle && failed.length === 0 && partialSources.length === 0 && truncatedSources.length === 0,
    partialSuccess: processed.length > 0 && (!sameCycle || failed.length > 0 || partialSources.length > 0 || truncatedSources.length > 0),
    sourceErrorSummary: failed.length ? `source_errors: ${failed.join(', ')}` : null,
  };
}

async function aggregateTokenAnalytics(env) {
  const startedAt = nowIso();
  const runStatus = await getAggregateRunStatus(env.DB);
  const [pairRows, tokenRows] = await Promise.all([
    env.DB.prepare(
      `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
              price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
              liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
       FROM waxonedge_pairs`
    ).all(),
    env.DB.prepare(
      `SELECT contract, symbol, total_supply, max_supply, price_wax, price_usd
       FROM waxonedge_tokens`
    ).all().catch(() => ({ results: [] })),
  ]);
  const waxToken = await env.DB.prepare(
    `SELECT price_usd FROM waxonedge_tokens WHERE contract = 'eosio.token' AND symbol = 'WAX' LIMIT 1`
  ).first().catch(() => null);
  const waxUsd = asNumber(waxToken?.price_usd);
  const priceIndex = buildDbTokenPriceIndex(tokenRows.results || []);
  const tokenInfo = new Map();
  for (const token of tokenRows.results || []) {
    const key = tokenKey(token.contract, token.symbol);
    if (key) tokenInfo.set(key, token);
  }
  const aggregates = new Map();
  const requiredSources = runStatus.required;
  function ensure(contract, symbol) {
    const key = tokenKey(contract, symbol);
    if (!key) return null;
    if (!aggregates.has(key)) {
      aggregates.set(key, {
        contract: normalizeContract(contract),
        symbol: normalizeSymbol(symbol),
        liquidityWax: 0,
        liquidityUsd: 0,
        hasLiquidityWax: false,
        hasLiquidityUsd: false,
        volume24: 0,
        hasVolume24: false,
        pairCount: 0,
        sources: new Set(),
        pairs: [],
        selected: null,
      });
    }
    return aggregates.get(key);
  }
  for (const pair of pairRows.results || []) {
    const source = aggregateSourceKey(pair.source);
    if (!WAXONEDGE_AGGREGATE_SOURCES.includes(source)) continue;
    const sides = [
      { contract: pair.token_a_contract, symbol: pair.token_a_symbol },
      { contract: pair.token_b_contract, symbol: pair.token_b_symbol },
    ];
    for (const side of sides) {
      const agg = ensure(side.contract, side.symbol);
      if (!agg) continue;
      agg.pairCount += 1;
      agg.sources.add(source);
      agg.pairs.push(pair);
      const liquidityWax = liquidityWaxFromIndexedPair(pair, priceIndex);
      const liquidityUsd = liquidityUsdFromWax(liquidityWax, pair, priceIndex);
      if (liquidityWax != null) {
        agg.liquidityWax += liquidityWax;
        agg.hasLiquidityWax = true;
      }
      if (liquidityUsd != null) {
        agg.liquidityUsd += liquidityUsd;
        agg.hasLiquidityUsd = true;
      }
      const volume24Wax = asNumber(pair.volume_24h_wax);
      if (volume24Wax != null) {
        agg.volume24 += volume24Wax;
        agg.hasVolume24 = true;
      }
      const priceWax = priceWaxFromIndexedPair(pair, side.contract, side.symbol, priceIndex);
      if (
        priceWax != null &&
        liquidityWax != null &&
        hasRealPairReserves(pair)
      ) {
        const directWax = hasWaxQuoteForToken(pair, side.contract, side.symbol);
        const trusted = liquidityWax >= MIN_TRUSTED_WAX_LIQUIDITY;
        const tier = directWax && trusted ? 3 : (directWax ? 2 : 1);
        const score = liquidityWax;
        const volumeScore = volume24Wax || 0;
        if (!agg.selected || tier > agg.selected.tier || (tier === agg.selected.tier && score > agg.selected.score)) {
          agg.selected = {
            tier,
            score,
            volumeScore,
            priceWax,
            priceUsd: waxUsd != null ? priceWax * waxUsd : null,
            source,
            pairId: pair.pair_id,
            change24: asNumber(pair.change_24h),
          };
        } else if (agg.selected && tier === agg.selected.tier && score === agg.selected.score && volumeScore > agg.selected.volumeScore) {
          agg.selected = {
            tier,
            score,
            volumeScore,
            priceWax,
            priceUsd: waxUsd != null ? priceWax * waxUsd : null,
            source,
            pairId: pair.pair_id,
            change24: asNumber(pair.change_24h),
          };
        }
      }
    }
  }
  const statements = [];
  for (const agg of aggregates.values()) {
    const detailStats = deriveTokenPairMetrics(
      tokenInfo.get(tokenKey(agg.contract, agg.symbol)) || agg,
      {
        aggregate_complete: runStatus.complete ? 1 : 0,
        aggregate_truncated: runStatus.truncated ? 1 : 0,
      },
      agg.pairs,
      tokenRows.results || [],
    );
    const presentSources = requiredSources.filter((source) => agg.sources.has(source));
    statements.push(env.DB.prepare(
      `INSERT INTO waxonedge_token_stats
       (contract, symbol, volume_24h, volume_24h_wax, volume_24h_usd,
        liquidity_wax, liquidity_usd, tvl_wax, tvl_usd, change_24h,
        selected_price_wax, selected_price_usd, selected_pair_source, selected_pair_id,
        fdv_wax, fdv_usd, source_count, indexed_pair_count, source_keys, aggregate_complete,
        aggregate_sources_required, aggregate_sources_present, aggregate_sources_processed,
        aggregate_sources_failed, aggregate_truncated, aggregate_sources_truncated, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(contract, symbol) DO UPDATE SET
         volume_24h = excluded.volume_24h,
         volume_24h_wax = excluded.volume_24h_wax,
         volume_24h_usd = excluded.volume_24h_usd,
         liquidity_wax = excluded.liquidity_wax,
         liquidity_usd = excluded.liquidity_usd,
         tvl_wax = excluded.tvl_wax,
         tvl_usd = excluded.tvl_usd,
         change_24h = excluded.change_24h,
         selected_price_wax = excluded.selected_price_wax,
         selected_price_usd = excluded.selected_price_usd,
         selected_pair_source = excluded.selected_pair_source,
         selected_pair_id = excluded.selected_pair_id,
         fdv_wax = excluded.fdv_wax,
         fdv_usd = excluded.fdv_usd,
         source_count = excluded.source_count,
         indexed_pair_count = excluded.indexed_pair_count,
         source_keys = excluded.source_keys,
         aggregate_complete = excluded.aggregate_complete,
         aggregate_sources_required = excluded.aggregate_sources_required,
         aggregate_sources_present = excluded.aggregate_sources_present,
         aggregate_sources_processed = excluded.aggregate_sources_processed,
         aggregate_sources_failed = excluded.aggregate_sources_failed,
         aggregate_truncated = excluded.aggregate_truncated,
         aggregate_sources_truncated = excluded.aggregate_sources_truncated,
         updated_at = excluded.updated_at`
    ).bind(
      agg.contract,
      agg.symbol,
      detailStats.volume_24h_wax,
      detailStats.volume_24h_wax,
      detailStats.volume_24h_usd,
      detailStats.liquidity_wax,
      detailStats.liquidity_usd,
      detailStats.tvl_wax,
      detailStats.tvl_usd,
      detailStats.change_24h,
      detailStats.selected_price_wax,
      detailStats.selected_price_usd,
      detailStats.selected_pair_source,
      detailStats.selected_pair_id,
      detailStats.fdv_wax,
      detailStats.fdv_usd,
      detailStats.source_count,
      detailStats.indexed_pair_count,
      detailStats.source_keys,
      runStatus.complete ? 1 : 0,
      requiredSources.join(','),
      presentSources.join(','),
      runStatus.processed.join(','),
      runStatus.failed.join(','),
      runStatus.truncated ? 1 : 0,
      runStatus.truncatedSources.join(','),
      nowIso(),
    ));
    if (detailStats.selected_price_wax != null) {
      statements.push(env.DB.prepare(
        `UPDATE waxonedge_tokens
         SET price_wax = ?, price_usd = COALESCE(?, price_usd), pair_count = (
           SELECT COUNT(*) FROM waxonedge_pairs
           WHERE (token_a_contract = ? AND token_a_symbol = ?)
              OR (token_b_contract = ? AND token_b_symbol = ?)
         ), updated_at = ?
         WHERE contract = ? AND symbol = ?`
      ).bind(
        detailStats.selected_price_wax,
        detailStats.selected_price_usd,
        agg.contract,
        agg.symbol,
        agg.contract,
        agg.symbol,
        nowIso(),
        agg.contract,
        agg.symbol,
      ));
    }
  }
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50));
  }
  const aggregateStatus = runStatus.complete ? 'success' : (aggregates.size > 0 ? 'partial_success' : 'failed');
  const aggregateError = aggregateStatus === 'failed'
    ? 'Aggregate failed: no usable source rows or D1 write failed'
    : (aggregateStatus === 'partial_success' ? `Aggregate partial_success: ${[runStatus.partialSources.length ? `waiting for ${runStatus.partialSources.join(', ')} to finish source cursors` : null, runStatus.sourceErrorSummary].filter(Boolean).join('; ')}` : null);
  await upsertSourceIndexState(env.DB, 'token_aggregates', {
    sync_cycle_id: runStatus.syncCycleId || '',
    cursor: '',
    page_count: 1,
    row_count: aggregates.size,
    complete: runStatus.complete ? 1 : 0,
    truncated: runStatus.truncated ? 1 : 0,
    status: aggregateStatus,
    error: aggregateError,
    started_at: startedAt,
  }).catch(() => {});
  await recordSyncRun(env.DB, 'token_aggregates', aggregateStatus, startedAt, aggregateError);
  return { ok: aggregateStatus !== 'failed', tokens: aggregates.size, status: aggregateStatus, runStatus };
}

async function syncNeftyAbi(env) {
  const startedAt = nowIso();
  try {
    const adapter = CORE_DEX_ADAPTERS.find((entry) => entry.source === 'swap.nefty');
    const tables = await getAbiTableNames(adapter.contract);
    await writeSnapshot(env.DB, 'swap_nefty_abi', {
      contract: adapter.contract,
      detected_tables: tables,
      note: 'ABI-first core adapter. Pairs normalize only when real reserves and token symbols are present.',
    }, nowIso());
    await recordSyncRun(env.DB, 'swap_nefty_abi', 'success', startedAt);
    return { ok: true, tables };
  } catch (error) {
    await recordSyncRun(env.DB, 'swap_nefty_abi', 'failed', startedAt, error?.message || String(error)).catch(() => {});
    return { ok: false, error: error?.message || String(error) };
  }
}

async function syncSupplyInputs(env) {
  const startedAt = nowIso();
  const rows = await env.DB.prepare(
    `SELECT contract, symbol FROM waxonedge_tokens ORDER BY pair_count DESC, updated_at DESC LIMIT 50`
  ).all().catch(() => ({ results: [] }));
  let updated = 0;
  for (const row of rows.results || []) {
    try {
      const stats = await rpcPost('/v1/chain/get_currency_stats', {
        code: row.contract,
        symbol: row.symbol,
      });
      const stat = stats?.[row.symbol] || null;
      if (!stat) continue;
      const supply = parseAsset(stat.supply);
      const maxSupply = parseAsset(stat.max_supply);
      await env.DB.prepare(
        `UPDATE waxonedge_tokens
         SET total_supply = COALESCE(?, total_supply),
             max_supply = COALESCE(?, max_supply),
             updated_at = ?
         WHERE contract = ? AND symbol = ?`
      ).bind(safeDecimal(supply.amount), safeDecimal(maxSupply.amount), nowIso(), row.contract, row.symbol).run();
      updated += 1;
    } catch {
      // Individual token supply lookups are best-effort and recorded in the run row.
    }
  }
  await recordSyncRun(env.DB, 'wax_rpc_supply', updated > 0 ? 'success' : 'skipped', startedAt, updated > 0 ? null : SOURCE_NOT_INDEXED).catch(() => {});
  return { ok: true, updated };
}

async function listTopTokens(db) {
  const rows = await db.prepare(
    `SELECT t.contract, t.symbol, t.decimals, t.total_supply, t.max_supply, t.price_wax, t.price_usd,
            t.pair_count, t.icon_url, t.updated_at,
            s.volume_24h, s.volume_24h_wax, s.volume_24h_usd, s.volume_7d, s.volume_30d,
            s.liquidity_wax, s.liquidity_usd,
            s.tvl_wax, s.tvl_usd, s.change_24h, s.selected_price_wax, s.selected_price_usd,
            s.selected_pair_source, s.selected_pair_id, s.holder_count, s.circulating_supply,
            s.burned_amount, s.market_cap_wax, s.market_cap_usd, s.fdv_wax, s.fdv_usd,
            s.source_count, s.indexed_pair_count, s.source_keys, s.aggregate_complete,
            s.aggregate_sources_required, s.aggregate_sources_present, s.aggregate_sources_processed,
            s.aggregate_sources_failed, s.aggregate_truncated, s.aggregate_sources_truncated
     FROM waxonedge_tokens t
     LEFT JOIN waxonedge_token_stats s
       ON s.contract = t.contract AND s.symbol = t.symbol
     ORDER BY t.pair_count DESC, t.updated_at DESC
     LIMIT 250`
  ).all();
  return rows.results || [];
}

async function listTopPairs(db) {
  const rows = await db.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
     FROM waxonedge_pairs
     ORDER BY CAST(COALESCE(volume_24h_wax, '0') AS NUMERIC) DESC, updated_at DESC
     LIMIT 250`
  ).all();
  return rows.results || [];
}

async function listTokenPairs(db, contract, symbol, options = {}) {
  const limit = clampInteger(options.limit, TOKEN_PAIR_PAGE_LIMIT, 1, TOKEN_PAIR_MAX_PAGE_LIMIT);
  const offset = clampInteger(options.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
  const rows = await db.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
     FROM waxonedge_pairs
     WHERE (token_a_contract = ? AND token_a_symbol = ?)
        OR (token_b_contract = ? AND token_b_symbol = ?)
     ORDER BY CAST(COALESCE(liquidity_wax, '0') AS NUMERIC) DESC,
              CAST(COALESCE(volume_24h_wax, '0') AS NUMERIC) DESC,
              updated_at DESC
     LIMIT ? OFFSET ?`
  ).bind(contract, symbol, contract, symbol, limit + 1, offset).all();
  const pageRows = rows.results || [];
  const hasMore = pageRows.length > limit;
  return {
    rows: pageRows.slice(0, limit),
    next_cursor: hasMore ? String(offset + limit) : null,
    complete: !hasMore,
  };
}

async function listBestChartCandles(db, contract, symbol) {
  const best = await db.prepare(
    `SELECT p.source, p.pair_id, p.token_a_contract, p.token_a_symbol, p.token_b_contract, p.token_b_symbol,
            p.volume_24h, p.volume_24h_wax, p.liquidity_wax, p.liquidity_usd, COUNT(c.bucket_time) AS candle_count
     FROM waxonedge_pairs p
     JOIN waxonedge_chart_candles c
       ON c.source = p.source AND c.pair_id = p.pair_id
     WHERE ((p.token_a_contract = ? AND p.token_a_symbol = ?)
         OR (p.token_b_contract = ? AND p.token_b_symbol = ?))
       AND c.interval = '1D'
     GROUP BY p.source, p.pair_id
     HAVING candle_count > 0
     ORDER BY CAST(COALESCE(p.liquidity_wax, '0') AS NUMERIC) DESC,
              CAST(COALESCE(p.volume_24h_wax, '0') AS NUMERIC) DESC,
              candle_count DESC
     LIMIT 1`
  ).bind(contract, symbol, contract, symbol).first().catch(() => null);
  if (!best) {
    return {
      chart_source: null,
      candles: [],
      unavailable: SOURCE_NOT_INDEXED,
    };
  }
  const rows = await db.prepare(
    `SELECT source, pair_id, interval, bucket_time, open, high, low, close, volume
     FROM waxonedge_chart_candles
     WHERE source = ? AND pair_id = ? AND interval = '1D'
     ORDER BY bucket_time DESC
     LIMIT 120`
  ).bind(best.source, best.pair_id).all();
  return {
    chart_source: best,
    candles: (rows.results || []).reverse(),
    unavailable: null,
  };
}

function reverseStoredCandle(candle) {
  function reciprocal(value) {
    const n = asNumber(value);
    return n && n !== 0 ? safeDecimal(1 / n) : null;
  }
  const reversedOpen = reciprocal(candle.open);
  const reversedHigh = reciprocal(candle.low);
  const reversedLow = reciprocal(candle.high);
  const reversedClose = reciprocal(candle.close);
  if (!reversedOpen || !reversedHigh || !reversedLow || !reversedClose) return candle;
  return {
    ...candle,
    open: reversedOpen,
    high: reversedHigh,
    low: reversedLow,
    close: reversedClose,
  };
}

async function listChartCandlesBySource(db, query) {
  const source = moonboysCandleSource(query.src || query.source);
  const pairId = safeString(query.pair_id || query.pairId);
  const interval = normalizeCandleInterval(query.duration || query.interval);
  const countBack = clampInteger(query.countBack || query.limit, 120, 1, 1000);
  if (!source || !pairId) {
    return { chart_source: null, candles: [], unavailable: 'src and pair_id are required' };
  }
  const startAt = asNumber(query.startAt);
  const endAt = asNumber(query.endAt);
  const startIso = startAt == null ? null : new Date(startAt).toISOString();
  const endIso = endAt == null ? null : new Date(endAt).toISOString();
  const filters = ['source = ?', 'pair_id = ?', 'interval = ?'];
  const params = [source, pairId, interval];
  if (startIso) {
    filters.push('bucket_time >= ?');
    params.push(startIso);
  }
  if (endIso) {
    filters.push('bucket_time <= ?');
    params.push(endIso);
  }
  params.push(countBack);
  const rows = await db.prepare(
    `SELECT source, pair_id, interval, bucket_time, open, high, low, close, volume
     FROM waxonedge_chart_candles
     WHERE ${filters.join(' AND ')}
     ORDER BY bucket_time DESC
     LIMIT ?`
  ).bind(...params).all();
  let candles = (rows.results || []).reverse();
  if (String(query.is_reversed || query.isReversed || '').toLowerCase() === 'true') {
    candles = candles.map(reverseStoredCandle);
  }
  return {
    chart_source: {
      source,
      reference_src: referenceCandleSource(source),
      pair_id: pairId,
      interval,
    },
    candles,
    unavailable: candles.length ? null : SOURCE_NOT_INDEXED,
  };
}

function buildDbTokenPriceIndex(rows) {
  const index = new Map();
  for (const row of rows || []) {
    index.set(tokenKey(row.contract, row.symbol), {
      priceWax: asNumber(row.price_wax),
      priceUsd: asNumber(row.price_usd),
    });
  }
  return index;
}

function collectTokenPriceKeysForPairs(pairRows) {
  const keys = new Map();
  function add(contract, symbol) {
    const normalizedContract = normalizeContract(contract);
    const normalizedSymbol = normalizeSymbol(symbol);
    const key = tokenKey(normalizedContract, normalizedSymbol);
    if (key && !keys.has(key)) {
      keys.set(key, { contract: normalizedContract, symbol: normalizedSymbol });
    }
  }
  add('eosio.token', 'WAX');
  for (const [contract, symbol] of REFERENCE_QUOTE_TOKENS) add(contract, symbol);
  for (const pair of pairRows || []) {
    add(pair.token_a_contract, pair.token_a_symbol);
    add(pair.token_b_contract, pair.token_b_symbol);
  }
  return Array.from(keys.values());
}

async function loadTokenPriceRowsForPairs(db, pairRows) {
  const keys = collectTokenPriceKeysForPairs(pairRows);
  if (!keys.length) return [];
  const rows = [];
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50);
    const where = chunk.map(() => '(contract = ? AND symbol = ?)').join(' OR ');
    const params = chunk.flatMap((key) => [key.contract, key.symbol]);
    const result = await db.prepare(
      `SELECT contract, symbol, price_wax, price_usd
       FROM waxonedge_tokens
       WHERE ${where}`
    ).bind(...params).all().catch(() => ({ results: [] }));
    rows.push(...(result.results || []));
  }
  return rows;
}

function pairTokenSide(pair, contract, symbol) {
  const key = tokenKey(contract, symbol);
  const tokenAKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
  const tokenBKey = tokenKey(pair.token_b_contract, pair.token_b_symbol);
  if (key === tokenAKey) {
    return {
      side: 'a',
      token: { contract: pair.token_a_contract, symbol: pair.token_a_symbol, reserve: asNumber(pair.reserve_a) },
      quote: { contract: pair.token_b_contract, symbol: pair.token_b_symbol, reserve: asNumber(pair.reserve_b) },
    };
  }
  if (key === tokenBKey) {
    return {
      side: 'b',
      token: { contract: pair.token_b_contract, symbol: pair.token_b_symbol, reserve: asNumber(pair.reserve_b) },
      quote: { contract: pair.token_a_contract, symbol: pair.token_a_symbol, reserve: asNumber(pair.reserve_a) },
    };
  }
  return null;
}

function priceWaxFromIndexedPair(pair, contract, symbol, priceIndex) {
  const directWaxPrice = pairPriceWaxForToken(pair, contract, symbol);
  if (directWaxPrice != null) return directWaxPrice;
  const side = pairTokenSide(pair, contract, symbol);
  if (!side) return null;
  const quotePriceWax = priceIndex.get(tokenKey(side.quote.contract, side.quote.symbol))?.priceWax;
  const pairPrice = asNumber(pair.price);
  if (quotePriceWax == null || pairPrice == null || pairPrice <= 0) return null;
  if (side.side === 'a') return pairPrice * quotePriceWax;
  return quotePriceWax / pairPrice;
}

function liquidityWaxFromIndexedPair(pair, priceIndex) {
  const indexed = asNumber(pair.liquidity_wax);
  if (indexed != null) return indexed;
  const reserveA = asNumber(pair.reserve_a);
  const reserveB = asNumber(pair.reserve_b);
  if (reserveA == null || reserveB == null) return null;
  if (isWaxToken(pair.token_a_contract, pair.token_a_symbol)) return reserveA * 2;
  if (isWaxToken(pair.token_b_contract, pair.token_b_symbol)) return reserveB * 2;
  const priceA = priceIndex.get(tokenKey(pair.token_a_contract, pair.token_a_symbol))?.priceWax;
  const priceB = priceIndex.get(tokenKey(pair.token_b_contract, pair.token_b_symbol))?.priceWax;
  if (priceA == null || priceB == null) return null;
  return (reserveA * priceA) + (reserveB * priceB);
}

function liquidityUsdFromWax(liquidityWax, pair, priceIndex) {
  const indexed = asNumber(pair.liquidity_usd);
  if (indexed != null) return indexed;
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  return liquidityWax != null && waxUsd != null ? liquidityWax * waxUsd : null;
}

function volumeWaxFromIndexedPair(pair, priceIndex) {
  const indexed = asNumber(pair.volume_24h_wax);
  if (indexed != null) return indexed;
  const volume24Raw = asNumber(pair.volume_24h);
  if (volume24Raw == null) return null;
  const tokenA = {
    contract: pair.token_a_contract,
    symbol: pair.token_a_symbol,
  };
  const tokenB = {
    contract: pair.token_b_contract,
    symbol: pair.token_b_symbol,
  };
  return asNumber(normalizeTokenAVolume(volume24Raw, tokenA, tokenB, pair.price, priceIndex).wax);
}

function selectedPairLabel(pair) {
  if (!pair) return null;
  const a = normalizeSymbol(pair.token_a_symbol);
  const b = normalizeSymbol(pair.token_b_symbol);
  const pairName = a && b ? `${a}/${b}` : null;
  return [pair.source, pair.pair_id ? `#${pair.pair_id}` : null, pairName].filter(Boolean).join(' ');
}

function reasonMapForTokenMetrics(metrics) {
  const reasons = {};
  if (metrics.selected_price_wax == null) reasons.selected_price = metrics.selected_pair_id ? 'Source indexed; price unavailable' : 'No indexed pair has enough price data yet';
  if (metrics.change_24h == null) reasons.price_change_24h = 'Requires indexed 24h price-change data';
  if (metrics.volume_24h_wax == null) reasons.volume_24h = 'Requires indexed pair or ticker volume';
  if (metrics.liquidity_wax == null && metrics.liquidity_usd == null) reasons.liquidity = 'Requires valued indexed pair reserves';
  if (metrics.holder_count == null) reasons.holder_count = REQUIRES_INDEXED_BACKEND;
  if (metrics.circulating_supply == null) reasons.circulating_supply = 'Requires indexed circulating supply';
  if (metrics.volume_7d == null) reasons.volume_7d = 'Requires indexed candle or trade history';
  if (metrics.volume_30d == null) reasons.volume_30d = 'Requires indexed candle or trade history';
  if (metrics.market_cap_wax == null && metrics.market_cap_usd == null) reasons.market_cap = metrics.selected_price_wax != null ? 'Circulating supply not indexed' : 'Price unavailable';
  if (metrics.fdv_wax == null && metrics.fdv_usd == null) reasons.fdv = 'Requires total supply and selected price';
  return reasons;
}

function deriveTokenPairMetrics(token, stats, pairRows, priceRows) {
  const contract = normalizeContract(token?.contract || stats?.contract);
  const symbol = normalizeSymbol(token?.symbol || stats?.symbol);
  const priceIndex = buildDbTokenPriceIndex(priceRows);
  const waxUsd = priceIndex.get(tokenKey('eosio.token', 'WAX'))?.priceUsd;
  const metrics = { ...(stats || {}) };
  const sources = new Set(parseSourceKeys(stats?.source_keys));
  let pairCount = 0;
  let liquidityWaxTotal = 0;
  let liquidityUsdTotal = 0;
  let volumeWaxTotal = 0;
  let hasLiquidityWax = false;
  let hasLiquidityUsd = false;
  let hasVolumeWax = false;
  let selected = null;

  for (const pair of pairRows || []) {
    if (!pairTokenSide(pair, contract, symbol)) continue;
    if (!hasRealPairReserves(pair)) continue;
    pairCount += 1;
    const source = aggregateSourceKey(pair.source);
    if (source) sources.add(source);
    const liquidityWax = liquidityWaxFromIndexedPair(pair, priceIndex);
    const liquidityUsd = liquidityUsdFromWax(liquidityWax, pair, priceIndex);
    const volumeWax = volumeWaxFromIndexedPair(pair, priceIndex);
    const priceWax = priceWaxFromIndexedPair(pair, contract, symbol, priceIndex);
    const directWax = hasWaxQuoteForToken(pair, contract, symbol);
    if (liquidityWax != null) {
      liquidityWaxTotal += liquidityWax;
      hasLiquidityWax = true;
    }
    if (liquidityUsd != null) {
      liquidityUsdTotal += liquidityUsd;
      hasLiquidityUsd = true;
    }
    if (volumeWax != null) {
      volumeWaxTotal += volumeWax;
      hasVolumeWax = true;
    }
    const trusted = liquidityWax != null && liquidityWax >= MIN_TRUSTED_WAX_LIQUIDITY;
    const tier = priceWax != null
      ? (directWax && trusted ? 3 : (directWax ? 2 : 1))
      : 0;
    const candidate = {
      pair,
      tier,
      trusted,
      directWax,
      priceWax,
      priceUsd: priceWax != null && waxUsd != null ? priceWax * waxUsd : null,
      liquidityWax: liquidityWax ?? null,
      liquidityUsd: liquidityUsd ?? null,
      volumeWax: volumeWax ?? null,
      change24: asNumber(pair.change_24h),
    };
    const selectedLiquidity = selected?.liquidityWax ?? -1;
    const selectedVolume = selected?.volumeWax ?? -1;
    if (
      !selected ||
      candidate.tier > selected.tier ||
      (candidate.tier === selected.tier && (candidate.liquidityWax ?? -1) > selectedLiquidity) ||
      (candidate.tier === selected.tier && (candidate.liquidityWax ?? -1) === selectedLiquidity && (candidate.volumeWax ?? -1) > selectedVolume)
    ) {
      selected = candidate;
    }
  }

  const totalSupply = asNumber(token?.total_supply ?? token?.max_supply);
  const selectedPriceWax = selected?.priceWax ?? asNumber(metrics.selected_price_wax);
  const selectedPriceUsd = selected?.priceUsd ?? asNumber(metrics.selected_price_usd) ?? (selectedPriceWax != null && waxUsd != null ? selectedPriceWax * waxUsd : null);
  const fdvWax = asNumber(metrics.fdv_wax) ?? (totalSupply != null && selectedPriceWax != null ? totalSupply * selectedPriceWax : null);
  const fdvUsd = asNumber(metrics.fdv_usd) ?? (totalSupply != null && selectedPriceUsd != null ? totalSupply * selectedPriceUsd : null);
  const liquidityWax = hasLiquidityWax ? liquidityWaxTotal : asNumber(metrics.liquidity_wax);
  const liquidityUsd = hasLiquidityUsd ? liquidityUsdTotal : asNumber(metrics.liquidity_usd);
  const volumeWax = hasVolumeWax ? volumeWaxTotal : asNumber(metrics.volume_24h_wax ?? metrics.volume_24h);
  const volumeUsd = volumeWax != null && waxUsd != null ? volumeWax * waxUsd : asNumber(metrics.volume_24h_usd);

  metrics.selected_price_wax = safeDecimal(selectedPriceWax);
  metrics.selected_price_usd = safeDecimal(selectedPriceUsd);
  metrics.selected_pair_source = selected?.pair?.source || metrics.selected_pair_source || null;
  metrics.selected_pair_id = selected?.pair?.pair_id || metrics.selected_pair_id || null;
  metrics.selected_pair_label = selectedPairLabel(selected?.pair) || null;
  metrics.selected_price_source = metrics.selected_pair_label || (metrics.selected_pair_source && metrics.selected_pair_id ? `${metrics.selected_pair_source} #${metrics.selected_pair_id}` : null);
  metrics.change_24h = selected?.change24 != null ? safeDecimal(selected.change24) : safeDecimal(metrics.change_24h);
  metrics.price_change_24h = metrics.change_24h;
  metrics.volume_24h = safeDecimal(volumeWax);
  metrics.volume_24h_wax = safeDecimal(volumeWax);
  metrics.volume_24h_usd = safeDecimal(volumeUsd);
  metrics.liquidity_wax = safeDecimal(liquidityWax);
  metrics.liquidity_usd = safeDecimal(liquidityUsd);
  metrics.cumulated_pair_liquidity_wax = safeDecimal(liquidityWax);
  metrics.cumulated_pair_liquidity_usd = safeDecimal(liquidityUsd);
  metrics.tvl_wax = safeDecimal(asNumber(metrics.tvl_wax) ?? liquidityWax);
  metrics.tvl_usd = safeDecimal(asNumber(metrics.tvl_usd) ?? liquidityUsd);
  metrics.source_count = sources.size || asNumber(metrics.source_count) || null;
  metrics.indexed_pair_count = pairCount || asNumber(metrics.indexed_pair_count) || null;
  metrics.source_keys = Array.from(sources).sort().join(',');
  metrics.fdv_wax = safeDecimal(fdvWax);
  metrics.fdv_usd = safeDecimal(fdvUsd);
  metrics.strongest_pair = selected ? {
    source: selected.pair.source,
    pair_id: selected.pair.pair_id,
    label: metrics.selected_pair_label,
    liquidity_wax: safeDecimal(selected.liquidityWax),
    liquidity_usd: safeDecimal(selected.liquidityUsd),
  } : null;
  metrics.aggregate_status = pairCount > 0
    ? (asNumber(metrics.aggregate_complete) === 1 ? 'Canonical aggregate complete' : (hasLiquidityWax || hasLiquidityUsd ? 'Pair liquidity indexed; holder/candle metrics pending' : 'Indexed pairs found; advanced metrics partial'))
    : (asNumber(metrics.aggregate_truncated) === 1 ? 'Aggregate truncated; final metrics unavailable' : 'Aggregate incomplete; final metrics unavailable');
  metrics.unavailable_reasons = reasonMapForTokenMetrics(metrics);
  return metrics;
}

async function loadPairRowsForToken(db, contract, symbol) {
  const rows = await db.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
     FROM waxonedge_pairs
     WHERE (token_a_contract = ? AND token_a_symbol = ?)
        OR (token_b_contract = ? AND token_b_symbol = ?)`
  ).bind(contract, symbol, contract, symbol).all().catch(() => ({ results: [] }));
  return rows.results || [];
}

function diagnoseTokenAggregate(contract, symbol, metrics, pairRows, chartCandleCount, aggregateFresh) {
  const reasons = [];
  const usableReservePairs = pairRows.filter(hasRealPairReserves);
  const waxQuotePairs = pairRows.filter((pair) => hasWaxQuoteForToken(pair, contract, symbol));
  const priced = metrics?.selected_price_wax != null || metrics?.selected_price_usd != null;
  const waxPriced = metrics?.selected_price_wax != null;
  const usdPriced = metrics?.selected_price_usd != null;
  const liquidityValues = pairRows
    .map((pair) => asNumber(pair.liquidity_wax))
    .filter((value) => value != null);
  const derivedStrongestLiquidityWax = asNumber(metrics?.strongest_pair?.liquidity_wax);
  const strongestLiquidityWax = liquidityValues.length
    ? Math.max(...liquidityValues)
    : derivedStrongestLiquidityWax;
  if (!pairRows.length) {
    reasons.push('no indexed pairs found');
  } else if (!usableReservePairs.length) {
    reasons.push('pairs found but no usable reserves');
  }
  if (usableReservePairs.length && !waxQuotePairs.length) {
    reasons.push('reserves found but no WAX quote');
  }
  if (waxQuotePairs.length && !waxPriced) {
    reasons.push('WAX quote found but price calculation failed');
  }
  if (waxPriced && !usdPriced) {
    reasons.push('price found but WAX/USD conversion missing');
  }
  if (strongestLiquidityWax != null && strongestLiquidityWax > 0 && strongestLiquidityWax < MIN_TRUSTED_WAX_LIQUIDITY) {
    reasons.push('liquidity found but below threshold');
  }
  if (!chartCandleCount) {
    reasons.push('chart candles missing');
  }
  if (!aggregateFresh) {
    reasons.push('aggregate rebuild not run after pair sync');
  }
  if (!reasons.length && !priced) {
    reasons.push('No indexed pair has enough price data yet');
  }
  return {
    reasons,
    facts: {
      indexed_pair_count: pairRows.length,
      usable_reserve_pair_count: usableReservePairs.length,
      wax_quote_pair_count: waxQuotePairs.length,
      strongest_liquidity_wax: safeDecimal(strongestLiquidityWax),
      chart_candle_count: chartCandleCount,
      selected_pair_source: metrics?.selected_pair_source || null,
      selected_pair_id: metrics?.selected_pair_id || null,
      selected_price_wax: metrics?.selected_price_wax || null,
      selected_price_usd: metrics?.selected_price_usd || null,
    },
  };
}

async function getToken(db, contract, symbol) {
  const token = await db.prepare(
    `SELECT contract, symbol, decimals, total_supply, max_supply, updated_at
     FROM waxonedge_tokens WHERE contract = ? AND symbol = ? LIMIT 1`
  ).bind(contract, symbol).first();
  const stats = await db.prepare(
    `SELECT holder_count, circulating_supply, volume_24h, volume_24h_wax, volume_24h_usd,
            volume_7d, volume_30d,
            market_cap_wax, market_cap_usd, fdv_wax, fdv_usd, liquidity_wax,
            liquidity_usd, tvl_wax, tvl_usd, selected_price_wax, selected_price_usd,
            change_24h, selected_pair_source, selected_pair_id, burned_amount, source_count,
            indexed_pair_count, source_keys, aggregate_complete, aggregate_sources_required,
            aggregate_sources_present, aggregate_sources_processed, aggregate_sources_failed,
            aggregate_truncated, aggregate_sources_truncated, updated_at
     FROM waxonedge_token_stats WHERE contract = ? AND symbol = ? LIMIT 1`
  ).bind(contract, symbol).first().catch(() => null);
  const pairRows = await loadPairRowsForToken(db, contract, symbol);
  const priceRows = await loadTokenPriceRowsForPairs(db, pairRows);
  const detailStats = deriveTokenPairMetrics(token || { contract, symbol }, stats || {}, pairRows, priceRows);
  return {
    token,
    stats: detailStats,
    source_coverage: sourceCoverageFromKeys(parseSourceKeys(detailStats?.source_keys)),
  };
}

async function getTokenDebug(db, contract, symbol) {
  const detail = await getToken(db, contract, symbol);
  const pairRows = await loadPairRowsForToken(db, contract, symbol);
  const chartCandleCount = await countScalar(db,
    `SELECT COUNT(*) AS count
     FROM waxonedge_chart_candles c
     JOIN waxonedge_pairs p ON p.source = c.source AND p.pair_id = c.pair_id
     WHERE c.interval = '1D'
       AND ((p.token_a_contract = ? AND p.token_a_symbol = ?)
        OR (p.token_b_contract = ? AND p.token_b_symbol = ?))`,
    [contract, symbol, contract, symbol]);
  const [lastAggregateSuccess, latestPairSuccess] = await Promise.all([
    latestAggregateRunRow(db),
    latestPairSyncRunRow(db),
  ]);
  const aggregateFresh = !!lastAggregateSuccess?.finished_at &&
    (!latestPairSuccess?.finished_at || Date.parse(lastAggregateSuccess.finished_at) >= Date.parse(latestPairSuccess.finished_at));
  const sourceStates = await getSourceIndexStates(db);
  const sourceKeys = parseSourceKeys(detail.stats?.source_keys);
  const partialSourceStates = sourceStates.filter((row) =>
    sourceKeys.includes(aggregateSourceKey(row.source)) &&
    ['partial', 'running'].includes(row.status) &&
    asNumber(row.complete) !== 1);
  let nextAction = null;
  if (!chartCandleCount) {
    nextAction = 'waiting for candle backfill';
  } else if (partialSourceStates.length) {
    nextAction = 'source cursor still partial';
  } else if (!aggregateFresh) {
    nextAction = 'aggregate rebuild pending after pair sync';
  }
  return {
    token: detail.token,
    stats: detail.stats,
    diagnostics: diagnoseTokenAggregate(contract, symbol, detail.stats, pairRows, chartCandleCount, aggregateFresh),
    source_coverage: detail.source_coverage,
    sync_diagnostics: {
      selected_price_exists: detail.stats?.selected_price_wax != null || detail.stats?.selected_price_usd != null,
      selected_pair_exists: !!(detail.stats?.selected_pair_source && detail.stats?.selected_pair_id),
      pair_rows_exist: pairRows.length > 0,
      source_sync_partial: partialSourceStates.length > 0,
      partial_sources: partialSourceStates.map((row) => ({
        source: row.source,
        cursor: row.cursor || '',
        row_count: asNumber(row.row_count) || 0,
        status: row.status,
      })),
      aggregate_stale: !aggregateFresh,
      has_1d_candles: chartCandleCount > 0,
      next_action: nextAction,
    },
  };
}

async function getLatestSync(db) {
  const rows = await db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     ORDER BY started_at DESC
     LIMIT 50`
  ).all();
  return rows.results || [];
}

async function getSourceIndexStates(db) {
  const rows = await db.prepare(
    `SELECT source, sync_cycle_id, cursor, page_count, row_count, complete, truncated,
            status, error, started_at, updated_at
     FROM waxonedge_source_index_state
     ORDER BY updated_at DESC`
  ).all().catch(() => ({ results: [] }));
  return rows.results || [];
}

async function countScalar(db, sql, params = []) {
  const statement = db.prepare(sql);
  const row = await (params.length ? statement.bind(...params).first() : statement.first()).catch(() => null);
  return asNumber(row?.count) || 0;
}

async function latestSyncRow(db, source, status = null) {
  const statusClause = status ? ' AND status = ?' : '';
  const params = status ? [source, status] : [source];
  return db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     WHERE source = ?${statusClause}
     ORDER BY finished_at DESC, started_at DESC
     LIMIT 1`
  ).bind(...params).first().catch(() => null);
}

function minutesSince(ts) {
  if (!ts) return null;
  const time = Date.parse(ts);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60000));
}

function sourceStateStale(row) {
  const age = minutesSince(row.updated_at || row.started_at);
  if (row.status === 'failed' || asNumber(row.truncated) === 1) return true;
  if (['partial', 'running'].includes(row.status)) return age != null && age > SOURCE_STALE_MINUTES;
  return asNumber(row.complete) !== 1 && !['planned', 'partial_success', 'skipped', 'budget_limited'].includes(row.status);
}

async function latestAggregateRunRow(db) {
  return db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     WHERE source = 'token_aggregates'
       AND status IN ('success', 'partial_success')
     ORDER BY finished_at DESC, started_at DESC
     LIMIT 1`
  ).first().catch(() => null);
}

async function latestPairSyncRunRow(db) {
  return db.prepare(
    `SELECT source, status, started_at, finished_at, error
     FROM waxonedge_sync_runs
     WHERE source IN (${WAXONEDGE_AGGREGATE_SOURCES.map(() => '?').join(',')})
       AND status IN ('success', 'partial')
     ORDER BY finished_at DESC, started_at DESC
     LIMIT 1`
  ).bind(...WAXONEDGE_AGGREGATE_SOURCES).first().catch(() => null);
}

async function aggregateNeedsRefreshAfterPairSync(db) {
  const [aggregate, pairSync] = await Promise.all([
    latestAggregateRunRow(db),
    latestPairSyncRunRow(db),
  ]);
  const pairSyncFinishedAt = Date.parse(pairSync?.finished_at || '');
  if (!Number.isFinite(pairSyncFinishedAt)) return false;
  const aggregateFinishedAt = Date.parse(aggregate?.finished_at || '');
  if (!Number.isFinite(aggregateFinishedAt)) return true;
  return aggregateFinishedAt < pairSyncFinishedAt;
}

async function sourceRowCounts(db) {
  const counts = {};
  for (const source of WAXONEDGE_AGGREGATE_SOURCES) counts[source] = 0;
  const rows = await db.prepare(
    `SELECT source, COUNT(*) AS count
     FROM waxonedge_pairs
     WHERE source IN (${WAXONEDGE_AGGREGATE_SOURCES.map(() => '?').join(',')})
     GROUP BY source`
  ).bind(...WAXONEDGE_AGGREGATE_SOURCES).all().catch(() => ({ results: [] }));
  for (const row of rows.results || []) counts[aggregateSourceKey(row.source)] = asNumber(row.count) || 0;
  return counts;
}

async function getIndexerHealth(db, env = {}) {
  const pairTokenCte = `
    WITH pair_tokens AS (
      SELECT t.contract, t.symbol
      FROM waxonedge_tokens t
      WHERE EXISTS (
        SELECT 1 FROM waxonedge_pairs p
        WHERE (p.token_a_contract = t.contract AND p.token_a_symbol = t.symbol)
           OR (p.token_b_contract = t.contract AND p.token_b_symbol = t.symbol)
      )
    )`;
  const candleTokenCte = `
    WITH candle_tokens AS (
      SELECT t.contract, t.symbol
      FROM waxonedge_tokens t
      WHERE EXISTS (
        SELECT 1
        FROM waxonedge_pairs p
        JOIN waxonedge_chart_candles c ON c.source = p.source AND c.pair_id = p.pair_id
        WHERE c.interval = '1D'
          AND ((p.token_a_contract = t.contract AND p.token_a_symbol = t.symbol)
            OR (p.token_b_contract = t.contract AND p.token_b_symbol = t.symbol))
      )
    )`;
  const pairTokenRowsCte = `
    WITH pair_tokens AS (
      SELECT t.contract, t.symbol
      FROM waxonedge_tokens t
      WHERE EXISTS (
        SELECT 1 FROM waxonedge_pairs p
        WHERE (p.token_a_contract = t.contract AND p.token_a_symbol = t.symbol)
           OR (p.token_b_contract = t.contract AND p.token_b_symbol = t.symbol)
      )
    ),
    scoped_pairs AS (
      SELECT p.*
      FROM waxonedge_pairs p
      JOIN pair_tokens pt
        ON (p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
        OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol)
    )`;
  const [
    totalTokens,
    tokensWithPairs,
    tokensWithCandles,
    tokensWithSelectedPrice,
    tokensWithLiquidity,
    tokensWithVolume,
    tokensWithSelectedPair,
    sourceCounts,
    sourceStates,
    lastAggregateSuccess,
    latestPairSuccess,
    candleBackfillState,
    candleBackfillSnapshot,
  ] = await Promise.all([
    countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_tokens`),
    countScalar(db, `${pairTokenCte} SELECT COUNT(*) AS count FROM pair_tokens`),
    countScalar(db, `${candleTokenCte} SELECT COUNT(*) AS count FROM candle_tokens`),
    countScalar(db,
      `SELECT COUNT(*) AS count
       FROM waxonedge_tokens t
       JOIN waxonedge_token_stats s ON s.contract = t.contract AND s.symbol = t.symbol
       WHERE s.selected_price_wax IS NOT NULL OR s.selected_price_usd IS NOT NULL`),
    countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_token_stats WHERE liquidity_wax IS NOT NULL OR liquidity_usd IS NOT NULL OR tvl_wax IS NOT NULL OR tvl_usd IS NOT NULL`),
    countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_token_stats WHERE volume_24h_wax IS NOT NULL OR volume_24h_usd IS NOT NULL OR volume_24h IS NOT NULL`),
    countScalar(db,
      `SELECT COUNT(*) AS count
       FROM waxonedge_tokens t
       JOIN waxonedge_token_stats s ON s.contract = t.contract AND s.symbol = t.symbol
       WHERE s.selected_pair_source IS NOT NULL AND s.selected_pair_id IS NOT NULL`),
    sourceRowCounts(db),
    getSourceIndexStates(db),
    latestAggregateRunRow(db),
    latestPairSyncRunRow(db),
    readSourceIndexState(db, CANDLE_BACKFILL_SOURCE),
    readSnapshot(db, CANDLE_BACKFILL_SOURCE),
  ]);
  const staleSyncRows = await Promise.all(sourceStates
    .filter(sourceStateStale)
    .map(async (row) => {
      const adapter = CORE_DEX_ADAPTERS.find((entry) => entry.source === aggregateSourceKey(row.source));
      const snapshot = adapter ? await readSnapshot(db, `${adapter.source}_${adapter.table}`) : { data: null };
      return {
      source: row.source,
      status: row.status,
      complete: asNumber(row.complete) === 1,
      truncated: asNumber(row.truncated) === 1,
      age_minutes: minutesSince(row.updated_at || row.started_at),
      error: row.error || null,
      cursor: row.cursor || '',
      retry_count: asNumber(snapshot.data?.retry_count) || 0,
      skipped_cursor_count: asNumber(snapshot.data?.skipped_cursor_count) || 0,
      skipped_cursor_reason: snapshot.data?.skipped_cursor_reason || null,
      };
    }));
  const aggregateFresh = !!lastAggregateSuccess?.finished_at &&
    (!latestPairSuccess?.finished_at || Date.parse(lastAggregateSuccess.finished_at) >= Date.parse(latestPairSuccess.finished_at));
  const sourceProgress = await Promise.all(sourceStates
    .filter((row) => WAXONEDGE_AGGREGATE_SOURCES.includes(aggregateSourceKey(row.source)))
    .map(async (row) => {
      const adapter = CORE_DEX_ADAPTERS.find((entry) => entry.source === aggregateSourceKey(row.source));
      const snapshot = adapter ? await readSnapshot(db, `${adapter.source}_${adapter.table}`) : { data: null };
      const cursorChangedAt = snapshot.data?.cursor_changed_at || row.updated_at || row.started_at || null;
      const measuredStuckForMinutes = ['partial', 'running'].includes(row.status) ? minutesSince(cursorChangedAt) : 0;
      const stuckForMinutes = Number.isFinite(measuredStuckForMinutes) ? measuredStuckForMinutes : 0;
      const cursor = row.cursor || '';
      const previousCursor = snapshot.data?.previous_cursor || '';
      const retryCount = asNumber(snapshot.data?.retry_count) || 0;
      const skippedCursorCount = asNumber(snapshot.data?.skipped_cursor_count) || 0;
      const skippedCursorReason = snapshot.data?.skipped_cursor_reason || null;
      const nextAction = asNumber(row.complete) === 1
        ? 'complete'
        : (skippedCursorReason
          ? 'stuck cursor skipped; continue from saved cursor'
          : (stuckForMinutes > SOURCE_STALE_MINUTES ? 'resume from saved cursor or reset stuck source' : 'continue from saved cursor'));
      return {
      source: row.source,
      status: row.status,
      complete: asNumber(row.complete) === 1,
      previous_cursor: previousCursor,
      current_cursor: cursor,
      cursor_changed_at: cursorChangedAt,
      chunks_completed: asNumber(snapshot.data?.chunks_completed) ?? asNumber(row.page_count) ?? 0,
      retry_count: retryCount,
      skipped_cursor_count: skippedCursorCount,
      skipped_cursor_reason: skippedCursorReason,
      stuck_for_minutes: stuckForMinutes,
      next_action: nextAction,
      cursor,
      page_count: asNumber(row.page_count) || 0,
      row_count: asNumber(row.row_count) || 0,
      stale_running: row.status === 'running' && minutesSince(row.updated_at || row.started_at) > SOURCE_STALE_MINUTES,
      age_minutes: minutesSince(row.updated_at || row.started_at),
      };
    }));
  const chartCandleCount1d = await countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_chart_candles WHERE interval = '1D'`);
  const deadReasons = {
    no_indexed_pairs_found: Math.max(0, totalTokens - tokensWithPairs),
    pairs_found_but_no_usable_reserves: await countScalar(db, `
      ${pairTokenRowsCte}
      SELECT COUNT(*) AS count
      FROM pair_tokens pt
      WHERE NOT EXISTS (
        SELECT 1 FROM scoped_pairs p
        WHERE ((p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
            OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol))
          AND CAST(COALESCE(p.reserve_a, '0') AS NUMERIC) > 0
          AND CAST(COALESCE(p.reserve_b, '0') AS NUMERIC) > 0
      )`),
    reserves_found_but_no_wax_quote: await countScalar(db, `
      ${pairTokenRowsCte}
      SELECT COUNT(*) AS count
      FROM pair_tokens pt
      WHERE EXISTS (
        SELECT 1 FROM scoped_pairs p
        WHERE ((p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
            OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol))
          AND CAST(COALESCE(p.reserve_a, '0') AS NUMERIC) > 0
          AND CAST(COALESCE(p.reserve_b, '0') AS NUMERIC) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM scoped_pairs p
        WHERE ((p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
            OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol))
          AND ((p.token_a_contract = 'eosio.token' AND p.token_a_symbol = 'WAX')
            OR (p.token_b_contract = 'eosio.token' AND p.token_b_symbol = 'WAX'))
      )`),
    wax_quote_found_but_price_calculation_failed: await countScalar(db, `
      ${pairTokenRowsCte}
      SELECT COUNT(*) AS count
      FROM pair_tokens pt
      JOIN waxonedge_token_stats s ON s.contract = pt.contract AND s.symbol = pt.symbol
      WHERE (s.selected_price_wax IS NULL AND s.selected_price_usd IS NULL)
        AND EXISTS (
          SELECT 1 FROM scoped_pairs p
          WHERE ((p.token_a_contract = pt.contract AND p.token_a_symbol = pt.symbol)
              OR (p.token_b_contract = pt.contract AND p.token_b_symbol = pt.symbol))
            AND ((p.token_a_contract = 'eosio.token' AND p.token_a_symbol = 'WAX')
              OR (p.token_b_contract = 'eosio.token' AND p.token_b_symbol = 'WAX'))
        )`),
    price_found_but_wax_usd_conversion_missing: await countScalar(db, `SELECT COUNT(*) AS count FROM waxonedge_token_stats WHERE selected_price_wax IS NOT NULL AND selected_price_usd IS NULL`),
    liquidity_found_but_below_threshold: await countScalar(db, `
      SELECT COUNT(*) AS count
      FROM waxonedge_token_stats
      WHERE liquidity_wax IS NOT NULL
        AND CAST(liquidity_wax AS NUMERIC) > 0
        AND CAST(liquidity_wax AS NUMERIC) < ?`, [MIN_TRUSTED_WAX_LIQUIDITY]),
    source_rows_inactive: 0,
    chart_candles_missing: Math.max(0, totalTokens - tokensWithCandles),
    aggregate_rebuild_not_run_after_pair_sync: aggregateFresh ? 0 : Math.max(0, tokensWithPairs),
  };
  return {
    generated_at: nowIso(),
    runtime_config: {
      free_safe_mode: waxonedgeFreeSafeMode(env),
      active_candle_backfill_pair_limit: candleBackfillPairLimit(env),
      active_source_page_limit: coreDexPagesPerInvocation(env),
      active_cron_rotation_mode: 'isolated-heavy-workloads',
    },
    totals: {
      total_indexed_tokens: totalTokens,
      tokens_with_selected_price: tokensWithSelectedPrice,
      tokens_without_selected_price: Math.max(0, totalTokens - tokensWithSelectedPrice),
      tokens_with_indexed_pairs: tokensWithPairs,
      tokens_with_zero_indexed_pairs: Math.max(0, totalTokens - tokensWithPairs),
      tokens_with_liquidity: tokensWithLiquidity,
      tokens_without_liquidity: Math.max(0, totalTokens - tokensWithLiquidity),
      tokens_with_24h_volume: tokensWithVolume,
      tokens_without_24h_volume: Math.max(0, totalTokens - tokensWithVolume),
      tokens_with_chart_candles: tokensWithCandles,
      tokens_without_chart_candles: Math.max(0, totalTokens - tokensWithCandles),
      tokens_with_selected_pair: tokensWithSelectedPair,
      tokens_without_selected_pair: Math.max(0, totalTokens - tokensWithSelectedPair),
    },
    per_source_row_counts: sourceCounts,
    source_progress: sourceProgress,
    stale_sync_rows: staleSyncRows,
    aggregate_rebuild: {
      status: lastAggregateSuccess?.status || 'failed',
      last_success_at: lastAggregateSuccess?.finished_at || lastAggregateSuccess?.started_at || null,
      latest_pair_success_at: latestPairSuccess?.finished_at || latestPairSuccess?.started_at || null,
      fresh_after_latest_pair_sync: aggregateFresh,
    },
    dead_token_reason_counts: deadReasons,
    candle_gap: {
      chart_candles_indexed_count: chartCandleCount1d,
      tokens_with_no_chart_source: Math.max(0, totalTokens - tokensWithCandles),
      tokens_with_chart_candidate_but_no_candles: Math.max(0, tokensWithPairs - tokensWithCandles),
    },
    candle_backfill: {
      source: CANDLE_BACKFILL_SOURCE,
      status: candleBackfillState?.status || 'not_started',
      candidate_pair_count: asNumber(candleBackfillSnapshot.data?.candidate_pair_count) || asNumber(candleBackfillState?.row_count) || 0,
      processed_pair_count: asNumber(candleBackfillSnapshot.data?.processed_pair_count) || asNumber(candleBackfillState?.page_count) || 0,
      attempted_pair_count: asNumber(candleBackfillSnapshot.data?.attempted_pair_count) || 0,
      failed_pair_count: asNumber(candleBackfillSnapshot.data?.failed_pair_count) || 0,
      unsupported_pair_count: asNumber(candleBackfillSnapshot.data?.unsupported_pair_count) || 0,
      external_chart_endpoint_unsupported: asNumber(candleBackfillSnapshot.data?.external_chart_endpoint_unsupported) || 0,
      trade_rows_not_indexed: asNumber(candleBackfillSnapshot.data?.trade_rows_not_indexed_count) || 0,
      swap_rows_not_indexed: asNumber(candleBackfillSnapshot.data?.swap_rows_not_indexed_count) || 0,
      candles_built_from_trade_rows: asNumber(candleBackfillSnapshot.data?.candles_built_from_trade_rows) || 0,
      budget_exhausted: !!candleBackfillSnapshot.data?.budget_exhausted,
      unsupported_reason: candleBackfillSnapshot.data?.unsupported_reason || null,
      candles_written: asNumber(candleBackfillSnapshot.data?.candles_written) || 0,
      cursor: candleBackfillState?.cursor || '',
      last_error: candleBackfillSnapshot.data?.last_error || candleBackfillState?.error || null,
      latest_1d_candle_count: chartCandleCount1d,
      plan: CANDLE_BACKFILL_PLAN,
      no_fake_candles: true,
    },
  };
}

function normalizeAlcorChartCandles(data) {
  const candles = [];
  function add(time, open, high, low, close, volume) {
    const ts = asNumber(time);
    const o = asNumber(open);
    const h = asNumber(high);
    const l = asNumber(low);
    const c = asNumber(close);
    const v = asNumber(volume);
    if (ts == null || o == null || h == null || l == null || c == null || v == null) return;
    const millis = ts > 1000000000000 ? ts : ts * 1000;
    const bucket = new Date(millis).toISOString();
    candles.push({
      bucket_time: bucket,
      open: safeDecimal(o),
      high: safeDecimal(h),
      low: safeDecimal(l),
      close: safeDecimal(c),
      volume: safeDecimal(v),
    });
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      if (Array.isArray(item)) {
        add(item[0], item[1], item[2], item[3], item[4], item[5]);
      } else if (item && typeof item === 'object') {
        add(
          item.time ?? item.t ?? item.timestamp,
          item.open ?? item.o,
          item.high ?? item.h,
          item.low ?? item.l,
          item.close ?? item.c,
          item.volume ?? item.v,
        );
      }
    }
  } else if (data && Array.isArray(data.bars)) {
    for (const bar of data.bars) add(bar.time ?? bar.t, bar.open ?? bar.o, bar.high ?? bar.h, bar.low ?? bar.l, bar.close ?? bar.c, bar.volume ?? bar.v);
  } else if (data && Array.isArray(data.t)) {
    for (let i = 0; i < data.t.length; i += 1) {
      add(data.t[i], data.o?.[i], data.h?.[i], data.l?.[i], data.c?.[i], data.v?.[i]);
    }
  }
  return candles.sort((a, b) => Date.parse(a.bucket_time) - Date.parse(b.bucket_time));
}

function parseTradeRawJson(row) {
  if (!row?.raw_json) return {};
  try {
    const parsed = JSON.parse(row.raw_json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function tradeTimestampMillis(row) {
  const raw = parseTradeRawJson(row);
  const value = row?.traded_at ?? raw.traded_at ?? raw.created_at ?? raw.updated_at_time ?? raw.timestamp ?? raw.time;
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric > 1000000000000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priceFromIndexedTradeRow(row, source = '') {
  const raw = parseTradeRawJson(row);
  const unitPrice = raw.unit_price ?? row?.unit_price;
  const sourceKey = moonboysCandleSource(source || row?.source);
  if (sourceKey === 'alcor' && unitPrice != null && unitPrice !== '') {
    const n = asNumber(unitPrice);
    if (n != null) return n / 100000000;
  }
  const price = row?.price ?? raw.price ?? raw.execution_price ?? raw.rate;
  const n = asNumber(price);
  if (n == null) return null;
  return n;
}

function volumeFromIndexedTradeRow(row) {
  const raw = parseTradeRawJson(row);
  const value = row?.volume ?? raw.volume ?? raw.tokenWaxVolume ?? raw.volumeB ?? raw.volumeA ?? row?.amount ?? raw.amount;
  const n = asNumber(value);
  return n == null ? null : n;
}

function utcDayBucketIso(millis) {
  if (!Number.isFinite(millis)) return null;
  const date = new Date(millis);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function buildDailyCandlesFromTradeRows(rows, options = {}) {
  const source = options.source || '';
  const trades = (rows || [])
    .map((row) => {
      const millis = tradeTimestampMillis(row);
      const price = priceFromIndexedTradeRow(row, source);
      const volume = volumeFromIndexedTradeRow(row);
      return { millis, price, volume: volume ?? 0 };
    })
    .filter((trade) => Number.isFinite(trade.millis) && trade.price != null)
    .sort((a, b) => a.millis - b.millis);
  const days = new Map();
  for (const trade of trades) {
    const bucket = utcDayBucketIso(trade.millis);
    if (!bucket) continue;
    if (!days.has(bucket)) {
      days.set(bucket, {
        bucket_time: bucket,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: 0,
        trade_count: 0,
      });
    }
    const candle = days.get(bucket);
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;
    candle.volume += trade.volume;
    candle.trade_count += 1;
  }
  return [...days.values()].map((candle) => ({
    bucket_time: candle.bucket_time,
    open: safeDecimal(candle.open),
    high: safeDecimal(candle.high),
    low: safeDecimal(candle.low),
    close: safeDecimal(candle.close),
    volume: safeDecimal(candle.volume),
    trade_count: candle.trade_count,
  })).filter((candle) =>
    candle.open != null && candle.high != null && candle.low != null && candle.close != null && candle.volume != null);
}

async function loadIndexedTradeRowsForPair(db, source, pairId) {
  const moonboysSource = moonboysCandleSource(source);
  const referenceSource = referenceCandleSource(moonboysSource);
  const startMillis = Date.now() - (CANDLE_BACKFILL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const startIso = new Date(startMillis).toISOString();
  const rows = await db.prepare(
    `SELECT source, trade_id, pair_id, contract, symbol, side, price, amount, volume, tx_id, traded_at, raw_json
     FROM waxonedge_trades
     WHERE pair_id = ?
       AND (source = ? OR source = ?)
       AND traded_at >= ?
     ORDER BY traded_at ASC
     LIMIT 5000`
  ).bind(String(pairId), moonboysSource, referenceSource, startIso).all().catch(() => ({ results: [] }));
  return rows.results || [];
}

async function buildInternalDailyCandlesForPair(db, pair) {
  const source = moonboysCandleSource(pair.source);
  const pairId = String(pair.pair_id || pair.pairId || '');
  if (!source || !pairId) return { ok: false, reason: 'missing_pair_identity', candles_written: 0, candle_count: 0 };
  const rows = await loadIndexedTradeRowsForPair(db, source, pairId);
  if (!rows.length) {
    return {
      ok: true,
      reason: source === 'alcor' ? 'trade_rows_not_indexed' : 'swap_rows_not_indexed',
      candles_written: 0,
      candle_count: 0,
    };
  }
  const candles = buildDailyCandlesFromTradeRows(rows, { source });
  if (!candles.length) {
    return {
      ok: true,
      reason: 'trade_rows_not_usable_for_ohlcv',
      candles_written: 0,
      candle_count: 0,
    };
  }
  const candlesWritten = await writeChartCandles(db, source, pairId, '1D', candles);
  return {
    ok: true,
    reason: 'candles_built_from_trade_rows',
    candles_written: candlesWritten,
    candle_count: candles.length,
  };
}

async function writeChartCandles(db, source, pairId, interval, candles) {
  if (!candles.length) return 0;
  const updatedAt = nowIso();
  const statements = candles.map((candle) => db.prepare(
    `INSERT INTO waxonedge_chart_candles
     (source, pair_id, interval, bucket_time, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, pair_id, interval, bucket_time) DO UPDATE SET
       open = excluded.open,
       high = excluded.high,
       low = excluded.low,
       close = excluded.close,
       volume = excluded.volume,
       updated_at = excluded.updated_at`
  ).bind(
    source,
    pairId,
    interval,
    candle.bucket_time,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
    updatedAt,
  ));
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
  return candles.length;
}

async function planWaxOnEdgeCandleBackfill(env) {
  const startedAt = nowIso();
  const candidatePairCount = await countScalar(env.DB,
    `SELECT COUNT(*) AS count
     FROM waxonedge_pairs
     WHERE source = 'alcor'
       AND pair_id IS NOT NULL
       AND pair_id != ''`);
  const state = await readSourceIndexState(env.DB, CANDLE_BACKFILL_SOURCE);
  const previousSnapshot = await readSnapshot(env.DB, CANDLE_BACKFILL_SOURCE);
  const cursorOffset = clampInteger(state?.cursor || 0, 0, 0, Number.MAX_SAFE_INTEGER);
  const candidates = await env.DB.prepare(
    `SELECT source, pair_id
     FROM waxonedge_pairs
     WHERE source = 'alcor'
       AND pair_id IS NOT NULL
       AND pair_id != ''
     ORDER BY CAST(pair_id AS NUMERIC), pair_id
     LIMIT ? OFFSET ?`
  ).bind(candleBackfillPairLimit(env), cursorOffset).all().catch(() => ({ results: [] }));
  const candidateRows = candidates.results || [];
  let attemptedPairCount = 0;
  let processedPairCount = 0;
  let failedPairCount = 0;
  let unsupportedPairCount = 0;
  let tradeRowsNotIndexedCount = 0;
  let swapRowsNotIndexedCount = 0;
  let candlesBuiltFromTradeRowsCount = 0;
  let candlesWritten = 0;
  let lastError = null;
  let unsupportedReason = null;
  let budgetExhausted = false;
  const requestBudget = candleSubrequestBudget(env);
  for (const pair of candidateRows) {
    if (attemptedPairCount >= requestBudget) {
      budgetExhausted = true;
      lastError = `Budget exhausted before next candle pair; attempted ${attemptedPairCount} of ${candidateRows.length}`;
      break;
    }
    attemptedPairCount += 1;
    try {
      const result = await buildInternalDailyCandlesForPair(env.DB, pair);
      candlesWritten += result.candles_written || 0;
      if (result.reason === 'candles_built_from_trade_rows') {
        candlesBuiltFromTradeRowsCount += 1;
        processedPairCount += 1;
      } else if (result.reason === 'trade_rows_not_indexed') {
        tradeRowsNotIndexedCount += 1;
        lastError = 'trade rows not indexed yet';
      } else if (result.reason === 'swap_rows_not_indexed') {
        swapRowsNotIndexedCount += 1;
        lastError = 'swap rows not indexed yet';
      } else if (result.reason === 'trade_rows_not_usable_for_ohlcv') {
        unsupportedPairCount += 1;
        unsupportedReason = `trade_rows_not_usable_for_ohlcv: ${pair.source} pair ${pair.pair_id}`;
        lastError = unsupportedReason;
      }
    } catch (error) {
      if (isSubrequestBudgetError(error)) {
        budgetExhausted = true;
        lastError = error?.message || String(error);
        break;
      }
      if (isNotFoundError(error)) {
        unsupportedPairCount += 1;
        unsupportedReason = `no_chart_endpoint: alcor pair ${pair.pair_id} returned 404`;
        lastError = unsupportedReason;
        continue;
      }
      failedPairCount += 1;
      lastError = error?.message || String(error);
    }
  }
  const nextCursor = Math.min(candidatePairCount, cursorOffset + attemptedPairCount);
  const totalAttemptedPairCount = (asNumber(previousSnapshot.data?.attempted_pair_count) || 0) + attemptedPairCount;
  const totalProcessedPairCount = (asNumber(previousSnapshot.data?.processed_pair_count) || 0) + processedPairCount;
  const totalFailedPairCount = (asNumber(previousSnapshot.data?.failed_pair_count) || 0) + failedPairCount;
  const totalUnsupportedPairCount = (asNumber(previousSnapshot.data?.unsupported_pair_count) || 0) + unsupportedPairCount;
  const totalTradeRowsNotIndexedCount = (asNumber(previousSnapshot.data?.trade_rows_not_indexed_count) || 0) + tradeRowsNotIndexedCount;
  const totalSwapRowsNotIndexedCount = (asNumber(previousSnapshot.data?.swap_rows_not_indexed_count) || 0) + swapRowsNotIndexedCount;
  const totalCandlesBuiltFromTradeRowsCount = (asNumber(previousSnapshot.data?.candles_built_from_trade_rows) || 0) + candlesBuiltFromTradeRowsCount;
  const totalCandlesWritten = (asNumber(previousSnapshot.data?.candles_written) || 0) + candlesWritten;
  const complete = candidatePairCount > 0 && nextCursor >= candidatePairCount;
  const existingCandleCount = await countScalar(env.DB,
    `SELECT COUNT(*) AS count FROM waxonedge_chart_candles WHERE interval = '1D'`);
  const status = budgetExhausted
    ? 'budget_limited'
    : (complete && failedPairCount === 0
    ? 'success'
    : (attemptedPairCount > 0 ? 'partial' : (lastError ? 'failed' : 'planned')));
  const error = lastError || (status === 'planned' ? CANDLE_BACKFILL_PLAN : null);
  await upsertSourceIndexState(env.DB, CANDLE_BACKFILL_SOURCE, {
    sync_cycle_id: `candle-${new Date().toISOString().slice(0, 10)}`,
    cursor: complete ? '' : String(nextCursor),
    page_count: nextCursor,
    row_count: candidatePairCount,
    complete: complete ? 1 : 0,
    truncated: 0,
    status,
    error,
    started_at: startedAt,
  });
  await writeSnapshot(env.DB, CANDLE_BACKFILL_SOURCE, {
    source: CANDLE_BACKFILL_SOURCE,
    status,
    candidate_pair_count: candidatePairCount,
    processed_pair_count: totalProcessedPairCount,
    attempted_pair_count: totalAttemptedPairCount,
    failed_pair_count: totalFailedPairCount,
    unsupported_pair_count: totalUnsupportedPairCount,
    trade_rows_not_indexed_count: totalTradeRowsNotIndexedCount,
    swap_rows_not_indexed_count: totalSwapRowsNotIndexedCount,
    candles_built_from_trade_rows: totalCandlesBuiltFromTradeRowsCount,
    external_chart_endpoint_unsupported: totalUnsupportedPairCount,
    budget_exhausted: budgetExhausted,
    unsupported_reason: unsupportedReason,
    candles_written: totalCandlesWritten,
    latest_1d_candle_count: existingCandleCount,
    cursor: complete ? '' : String(nextCursor),
    last_error: lastError,
    no_fake_candles: true,
    plan: CANDLE_BACKFILL_PLAN,
  }, nowIso());
  await recordSyncRun(env.DB, CANDLE_BACKFILL_SOURCE, status, startedAt, error);
  return {
    ok: status !== 'failed',
    status,
    candidate_pair_count: candidatePairCount,
    processed_pair_count: totalProcessedPairCount,
    attempted_pair_count: totalAttemptedPairCount,
    failed_pair_count: totalFailedPairCount,
    unsupported_pair_count: totalUnsupportedPairCount,
    trade_rows_not_indexed_count: totalTradeRowsNotIndexedCount,
    swap_rows_not_indexed_count: totalSwapRowsNotIndexedCount,
    candles_built_from_trade_rows: totalCandlesBuiltFromTradeRowsCount,
    external_chart_endpoint_unsupported: totalUnsupportedPairCount,
    budget_exhausted: budgetExhausted,
    unsupported_reason: unsupportedReason,
    candles_written: totalCandlesWritten,
    indexed_1d_candle_count: existingCandleCount,
    cursor: complete ? '' : String(nextCursor),
    last_error: lastError,
    no_fake_candles: true,
    plan: CANDLE_BACKFILL_PLAN,
  };
}

async function handleBootstrap(env, corsHeaders) {
  const coreSnapshotReads = CORE_DEX_ADAPTERS.flatMap((adapter) => [
    readSnapshot(env.DB, `${adapter.source}_abi`),
    readSnapshot(env.DB, `${adapter.source}_${adapter.table}`),
  ]);
  const [tokens, pairs, syncStatus, sourceStates, alcorTokens, alcorPairs, alcorTickers, alcorGlobal, ...coreSnapshots] = await Promise.all([
    listTopTokens(env.DB),
    listTopPairs(env.DB),
    getLatestSync(env.DB),
    getSourceIndexStates(env.DB),
    readSnapshot(env.DB, 'alcor_tokens'),
    readSnapshot(env.DB, 'alcor_pairs'),
    readSnapshot(env.DB, 'alcor_tickers'),
    readSnapshot(env.DB, 'alcor_global'),
    ...coreSnapshotReads,
  ]);
  const coreSources = {};
  const rawCore = {};
  CORE_DEX_ADAPTERS.forEach((adapter, index) => {
    const abiSnapshot = coreSnapshots[index * 2] || {};
    const tableSnapshot = coreSnapshots[index * 2 + 1] || {};
    const key = adapter.source.replaceAll('.', '_');
    coreSources[`${key}_abi`] = {
      updated_at: abiSnapshot.fetched_at,
      indexed: !!abiSnapshot.data,
      detected_tables: abiSnapshot.data?.detected_tables || [],
      expected_table: adapter.table,
      contract: adapter.contract,
    };
    coreSources[`${key}_${adapter.table}`] = {
      updated_at: tableSnapshot.fetched_at,
      indexed: !!tableSnapshot.data,
      contract: adapter.contract,
      table: adapter.table,
      row_count: tableSnapshot.data?.row_count || (Array.isArray(tableSnapshot.data?.rows) ? tableSnapshot.data.rows.length : 0),
      page_count: tableSnapshot.data?.page_count || 0,
      complete: !!tableSnapshot.data && (tableSnapshot.data?.truncated ? false : !tableSnapshot.data?.cursor),
      compact: tableSnapshot.data?.compact === true,
    };
    rawCore[`${key}_detected_tables`] = abiSnapshot.data?.detected_tables || [];
  });
  const updatedAt = [alcorTokens.fetched_at, alcorPairs.fetched_at, alcorTickers.fetched_at]
    .concat(CORE_DEX_ADAPTERS.flatMap((adapter, index) => [
      coreSnapshots[index * 2]?.fetched_at,
      coreSnapshots[index * 2 + 1]?.fetched_at,
    ]))
    .filter(Boolean)
    .sort()
    .pop() || null;
  const aggregateCount = tokens.filter((token) => token.liquidity_wax != null || token.selected_pair_source != null).length;
  const warnings = [];
  if (!updatedAt) warnings.push(REQUIRES_INDEXED_BACKEND);
  warnings.push('Holder distribution requires indexed balance snapshots or a verified holder source.');
  warnings.push('7d/30d volume, market cap, FDV, and chart candles stay unavailable until indexed from source data.');
  return ok({
    summary: {
      token_count: tokens.length,
      pair_count: pairs.length,
      token_aggregate_count: aggregateCount,
      wax_price_source: 'Alcor analytics/global when available',
    },
    tokens,
    pairs,
    sync_status: syncStatus,
    source_index_state: sourceStates,
    sources: {
      alcor_tokens: { updated_at: alcorTokens.fetched_at, indexed: !!alcorTokens.data },
      alcor_pairs: { updated_at: alcorPairs.fetched_at, indexed: !!alcorPairs.data },
      alcor_tickers: { updated_at: alcorTickers.fetched_at, indexed: !!alcorTickers.data },
      alcor_global: { updated_at: alcorGlobal.fetched_at, indexed: !!alcorGlobal.data },
      ...coreSources,
    },
    raw: {
      alcor_tokens: alcorTokens.data || [],
      alcor_pairs: alcorPairs.data || [],
      alcor_tickers: alcorTickers.data || [],
      alcor_global: alcorGlobal.data || null,
      nefty_detected_tables: rawCore.swap_nefty_detected_tables || [],
      core_detected_tables: rawCore,
    },
    unavailable_metrics: {
      holders: REQUIRES_INDEXED_BACKEND,
      volume_7d: SOURCE_NOT_INDEXED,
      volume_30d: SOURCE_NOT_INDEXED,
      market_cap: UNAVAILABLE,
      fdv: UNAVAILABLE,
      chart_candles: SOURCE_NOT_INDEXED,
    },
  }, warnings, updatedAt, corsHeaders);
}

export async function handleWaxOnEdgeRoute(request, env, corsHeaders = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method !== 'GET') {
    return unavailable('Method not allowed', 405, corsHeaders);
  }
  if (!env.DB) return unavailable('DB binding is not configured', 503, corsHeaders);

  try {
    if (path === `${WAXONEDGE_API_PREFIX}/bootstrap`) return handleBootstrap(env, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/summary`) {
      const [tokens, pairs, syncStatus, sourceStates] = await Promise.all([listTopTokens(env.DB), listTopPairs(env.DB), getLatestSync(env.DB), getSourceIndexStates(env.DB)]);
      return ok({ token_count: tokens.length, pair_count: pairs.length, latest_sync: syncStatus.slice(0, 10), source_index_state: sourceStates }, [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/tokens/top`) return ok(await listTopTokens(env.DB), [], null, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/pairs/top`) return ok(await listTopPairs(env.DB), [], null, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/candles`) {
      const chart = await listChartCandlesBySource(env.DB, Object.fromEntries(url.searchParams.entries()));
      return ok(chart, chart.unavailable ? [chart.unavailable] : [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/sync-status`) {
      const [latest_sync, source_index_state] = await Promise.all([getLatestSync(env.DB), getSourceIndexStates(env.DB)]);
      return ok({ latest_sync, source_index_state }, [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/indexer-health`) {
      return ok(await getIndexerHealth(env.DB, env), [], null, corsHeaders);
    }

    const tokenMatch = path.match(/^\/api\/waxonedge\/token\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (tokenMatch) {
      const contract = normalizeContract(decodeURIComponent(tokenMatch[1]));
      const symbol = normalizeSymbol(decodeURIComponent(tokenMatch[2]));
      const child = tokenMatch[3] || '';
      if (child === 'pairs') {
        return ok(await listTokenPairs(env.DB, contract, symbol, {
          cursor: url.searchParams.get('cursor'),
          limit: url.searchParams.get('limit'),
        }), [], null, corsHeaders);
      }
      if (child === 'chart') {
        const chart = await listBestChartCandles(env.DB, contract, symbol);
        return ok(chart, chart.unavailable ? [SOURCE_NOT_INDEXED] : [], null, corsHeaders);
      }
      if (child === 'debug') {
        const debug = await getTokenDebug(env.DB, contract, symbol);
        if (!debug.token) return unavailable('Token not indexed yet', 404, corsHeaders);
        return ok(debug, ['Debug diagnostics are derived from indexed rows and sync state only.'], debug.token.updated_at, corsHeaders);
      }
      if (child === 'holders') return ok([], [REQUIRES_INDEXED_BACKEND], null, corsHeaders);
      if (child === 'trades') return ok([], [SOURCE_NOT_INDEXED], null, corsHeaders);
      if (child) return unavailable('WaxOnEdge endpoint not found', 404, corsHeaders);
      const detail = await getToken(env.DB, contract, symbol);
      if (!detail.token) return unavailable('Token not indexed yet', 404, corsHeaders);
      return ok(detail, ['Missing metrics are honest unavailable states, not inferred data.'], detail.token.updated_at, corsHeaders);
    }

    return unavailable('WaxOnEdge endpoint not found', 404, corsHeaders);
  } catch (error) {
    return unavailable(error?.message || String(error), 503, corsHeaders);
  }
}

export const __waxonedgeTestHooks = {
  deriveTokenPairMetrics,
  collectTokenPriceKeysForPairs,
  diagnoseTokenAggregate,
  buildDailyCandlesFromTradeRows,
  priceFromIndexedTradeRow,
  normalizeCandleInterval,
  moonboysCandleSource,
  referenceCandleSource,
  candleBackfillPairLimit,
};

export async function runWaxOnEdgeAggregateBackfill(env) {
  if (!env.DB) return { ok: false, error: 'DB binding is not configured' };
  return aggregateTokenAnalytics(env);
}

export async function runWaxOnEdgeCandleBackfillPlan(env) {
  if (!env.DB) return { ok: false, error: 'DB binding is not configured' };
  return planWaxOnEdgeCandleBackfill(env);
}

export async function runWaxOnEdgeScheduledSync(env, cron = '') {
  if (!env.DB) return { ok: false, error: 'DB binding is not configured' };
  const freeSafeMode = waxonedgeFreeSafeMode(env);
  if (cron === 'waxonedge-backfill') {
    const aggregates = await aggregateTokenAnalytics(env);
    return { ok: aggregates.ok, backfill: true, free_safe_mode: freeSafeMode, aggregates };
  }
  if (cron === 'waxonedge-candle-backfill') {
    const candleBackfill = await planWaxOnEdgeCandleBackfill(env);
    return { ok: candleBackfill.ok, candle_backfill: true, free_safe_mode: freeSafeMode, candleBackfill };
  }
  const tasks = [];
  const tick = new Date();
  const minute = tick.getUTCMinutes();
  const hour = tick.getUTCHours();
  const isMinuteCron = cron === '* * * * *';
  const shouldRunFullIndex = !cron || cron === '*/5 * * * *' || (isMinuteCron && minute % 5 === 0);
  if (isMinuteCron && freeSafeMode) {
    const rotationSlot = minute % 5;
    if (rotationSlot === 0) {
      tasks.push(syncAlcorMarketData(env, 'alcor_minute_market_data'));
    } else if (rotationSlot === 1) {
      tasks.push((async () => {
        const syncCycleId = await getActiveSourceCycleId(env.DB);
        const adapter = selectCoreDexAdapterForCron(minute);
        const core = await syncCoreDexAdapters(env, syncCycleId, {
          source: adapter.source,
          maxPages: FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION,
          requestBudget: FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE,
        });
        return { ok: core.ok, syncCycleId, source: adapter.source, core };
      })());
    } else if (rotationSlot === 2) {
      tasks.push(aggregateTokenAnalytics(env));
    } else if (rotationSlot === 3) {
      tasks.push(planWaxOnEdgeCandleBackfill(env));
    } else {
      tasks.push(syncSupplyInputs(env));
    }
  } else if (shouldRunFullIndex) {
    tasks.push((async () => {
      const syncCycleId = await getActiveSourceCycleId(env.DB);
      const [alcor, core, nefty] = await Promise.all([
        syncAlcorMarketData(env, 'alcor_five_minute_market_data', syncCycleId),
        syncCoreDexAdapters(env, syncCycleId),
        syncNeftyAbi(env),
      ]);
      const aggregates = await aggregateTokenAnalytics(env);
      const candleBackfill = await planWaxOnEdgeCandleBackfill(env);
      return { ok: alcor.ok && core.ok && nefty.ok && aggregates.ok && candleBackfill.ok, syncCycleId, alcor, core, nefty, aggregates, candleBackfill };
    })());
  } else if (isMinuteCron) {
    tasks.push((async () => {
      const alcor = await syncAlcorMarketData(env, 'alcor_minute_market_data');
      const aggregates = await aggregateTokenAnalytics(env);
      const candleBackfill = await planWaxOnEdgeCandleBackfill(env);
      return { ok: alcor.ok && aggregates.ok && candleBackfill.ok, alcor, aggregates, candleBackfill };
    })());
  }
  if (!freeSafeMode && (!cron || cron === '*/15 * * * *' || (isMinuteCron && minute % 15 === 0))) tasks.push(syncSupplyInputs(env));
  if (!freeSafeMode && (!cron || cron === '0 */2 * * *' || (isMinuteCron && minute === 0 && hour % 2 === 0))) {
    const startedAt = nowIso();
    tasks.push(recordSyncRun(env.DB, 'holders', 'skipped', startedAt, REQUIRES_INDEXED_BACKEND).then(() => ({
      ok: true,
      skipped: 'holders',
    })));
  }
  if (!tasks.length) return { ok: true, skipped: true };
  const results = await Promise.all(tasks);
  let postSyncAggregate = null;
  if (!freeSafeMode && (!cron || isMinuteCron || shouldRunFullIndex)) {
    const needsAggregateRefresh = await aggregateNeedsRefreshAfterPairSync(env.DB);
    if (needsAggregateRefresh) postSyncAggregate = await aggregateTokenAnalytics(env);
  }
  return {
    ok: results.every((result) => result?.ok) && (!postSyncAggregate || postSyncAggregate.ok),
    results,
    post_sync_aggregate: postSyncAggregate,
    free_safe_mode: freeSafeMode,
  };
}

const WAXONEDGE_API_PREFIX = '/api/waxonedge';

const ALCOR_API = 'https://wax.alcor.exchange/api/v2';
const WAX_RPC = 'https://wax.greymass.com';
const UNAVAILABLE = 'Unavailable';
const REQUIRES_INDEXED_BACKEND = 'Requires indexed backend';
const SOURCE_NOT_INDEXED = 'Source not indexed yet';
const CHAIN_TABLE_PAGE_LIMIT = 1000;
const MAX_CHAIN_TABLE_PAGES = 20;
const CORE_DEX_PAGES_PER_INVOCATION = 3;
const MIN_TRUSTED_WAX_LIQUIDITY = 10;
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

const CORE_DEX_ADAPTERS = Object.freeze([
  {
    source: 'swap.alcor',
    label: 'Alcor',
    contract: 'swap.alcor',
    table: 'pools',
    normalizer: 'tokenA-tokenB',
    explorer: 'https://waxblock.io/account/swap.alcor',
  },
  {
    source: 'swap.taco',
    label: 'Taco',
    contract: 'swap.taco',
    table: 'pairs',
    normalizer: 'pool1-pool2',
    explorer: 'https://waxblock.io/account/swap.taco',
  },
  {
    source: 'swap.nefty',
    label: 'NeftyBlocks',
    contract: 'swap.nefty',
    table: 'pairs',
    normalizer: 'reserve0-reserve1',
    explorer: 'https://waxblock.io/account/swap.nefty',
  },
  {
    source: 'swap.box',
    label: 'BOX',
    contract: 'swap.box',
    table: 'pairs',
    normalizer: 'box-pairs',
    explorer: 'https://waxblock.io/account/swap.box',
  },
]);

const PREFERRED_QUOTES = Object.freeze([
  tokenKey('eosio.token', 'WAX'),
  tokenKey('usdt.alcor', 'USDT'),
  tokenKey('eth.token', 'WAXUSDT'),
  tokenKey('eth.token', 'WAXUSDC'),
  tokenKey('btc.ptokens', 'PBTC'),
  tokenKey('eth.ptokens', 'PETH'),
]);

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

function normalizeCoreDexPair(adapter, row, priceIndex, syncedAt) {
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
    fee_bps: safeDecimal(row.fee ?? row.marketFee),
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
  const maxPages = options.maxPages || MAX_CHAIN_TABLE_PAGES;
  const rows = [];
  let lowerBound = options.lowerBound || '';
  let nextKey = '';
  let truncated = false;
  let pageCount = 0;
  let complete = false;
  for (let page = 0; page < maxPages; page += 1) {
    const data = await rpcPost('/v1/chain/get_table_rows', {
      code: contract,
      scope: contract,
      table,
      json: true,
      lower_bound: lowerBound,
      limit,
    });
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
  return { rows, truncated, complete, next_key: nextKey, page_count: pageCount };
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

async function syncCoreDexAdapters(env, syncCycleId = '') {
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
  for (const adapter of CORE_DEX_ADAPTERS) {
    const adapterStartedAt = nowIso();
    let activeCycleId = syncCycleId || '';
    try {
      activeCycleId = activeCycleId || await getActiveSourceCycleId(env.DB);
      let state = await readSourceIndexState(env.DB, adapter.source);
      if (state?.complete === 1 && state.sync_cycle_id === activeCycleId) {
        results.push({ source: adapter.source, ok: true, complete: true, skipped: true, cycle: activeCycleId });
        continue;
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
        maxPages: CORE_DEX_PAGES_PER_INVOCATION,
      });
      const rows = tableResult.rows;
      const pairs = rows
        .map((row) => normalizeCoreDexPair(adapter, row, priceIndex, syncedAt))
        .filter(Boolean);
      await upsertPairs(env.DB, pairs);
      const nextPageCount = (state.page_count || 0) + tableResult.page_count;
      const nextRowCount = (state.row_count || 0) + rows.length;
      const complete = tableResult.complete ? 1 : 0;
      const status = complete ? 'success' : 'running';
      const error = complete ? null : `Partial source sync checkpoint saved after ${tableResult.page_count} page(s); next_key=${tableResult.next_key || 'unknown'}`;
      await upsertSourceIndexState(env.DB, adapter.source, {
        sync_cycle_id: activeCycleId,
        cursor: complete ? '' : tableResult.next_key,
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
        cursor: complete ? '' : tableResult.next_key,
        sync_cycle_id: activeCycleId,
      }, syncedAt);
      if (complete) {
        await recordSyncRun(env.DB, adapter.source, 'success', adapterStartedAt);
      } else {
        await recordSyncRun(env.DB, adapter.source, 'running', adapterStartedAt, error);
      }
      results.push({
        source: adapter.source,
        ok: true,
        pairs: pairs.length,
        rows: rows.length,
        complete: !!complete,
        cursor: complete ? '' : tableResult.next_key,
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
  return { ok: results.every((result) => result.ok), complete: results.every((result) => result.complete || result.skipped), results };
}

async function getAggregateRunStatus(db) {
  const rows = await db.prepare(
    `SELECT source, sync_cycle_id, complete, truncated, status, error
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
  const truncatedSources = [];
  for (const source of WAXONEDGE_AGGREGATE_SOURCES) {
    const row = states.get(source);
    if (row && row.status === 'success' && asNumber(row.complete) === 1 && row.sync_cycle_id === syncCycleId) {
      processed.push(source);
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
    truncated: truncatedSources.length > 0,
    truncatedSources,
    complete: sameCycle && failed.length === 0 && truncatedSources.length === 0,
  };
}

async function aggregateTokenAnalytics(env) {
  const startedAt = nowIso();
  const runStatus = await getAggregateRunStatus(env.DB);
  const pairRows = await env.DB.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, volume_24h_wax, volume_24h_usd,
            liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
     FROM waxonedge_pairs`
  ).all();
  const waxToken = await env.DB.prepare(
    `SELECT price_usd FROM waxonedge_tokens WHERE contract = 'eosio.token' AND symbol = 'WAX' LIMIT 1`
  ).first().catch(() => null);
  const waxUsd = asNumber(waxToken?.price_usd);
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
      const liquidityWax = asNumber(pair.liquidity_wax);
      const liquidityUsd = asNumber(pair.liquidity_usd);
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
      const priceWax = pairPriceWaxForToken(pair, side.contract, side.symbol);
      if (
        priceWax != null &&
        liquidityWax != null &&
        liquidityWax >= MIN_TRUSTED_WAX_LIQUIDITY &&
        hasRealPairReserves(pair) &&
        hasWaxQuoteForToken(pair, side.contract, side.symbol)
      ) {
        const score = liquidityWax;
        const volumeScore = volume24Wax || 0;
        if (!agg.selected || score > agg.selected.score) {
          agg.selected = {
            score,
            volumeScore,
            priceWax,
            priceUsd: waxUsd != null ? priceWax * waxUsd : null,
            source,
            pairId: pair.pair_id,
            change24: asNumber(pair.change_24h),
          };
        } else if (agg.selected && score === agg.selected.score && volumeScore > agg.selected.volumeScore) {
          agg.selected = {
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
    const presentSources = requiredSources.filter((source) => agg.sources.has(source));
    const sourceKeys = Array.from(agg.sources).sort();
    statements.push(env.DB.prepare(
      `INSERT INTO waxonedge_token_stats
       (contract, symbol, volume_24h, volume_24h_wax, volume_24h_usd,
        liquidity_wax, liquidity_usd, tvl_wax, tvl_usd, change_24h,
        selected_price_wax, selected_price_usd, selected_pair_source, selected_pair_id,
        source_count, indexed_pair_count, source_keys, aggregate_complete,
        aggregate_sources_required, aggregate_sources_present, aggregate_sources_processed,
        aggregate_sources_failed, aggregate_truncated, aggregate_sources_truncated, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      agg.hasVolume24 ? safeDecimal(agg.volume24) : null,
      agg.hasVolume24 ? safeDecimal(agg.volume24) : null,
      agg.hasVolume24 && waxUsd != null ? safeDecimal(agg.volume24 * waxUsd) : null,
      agg.hasLiquidityWax ? safeDecimal(agg.liquidityWax) : null,
      agg.hasLiquidityUsd ? safeDecimal(agg.liquidityUsd) : null,
      agg.hasLiquidityWax ? safeDecimal(agg.liquidityWax) : null,
      agg.hasLiquidityUsd ? safeDecimal(agg.liquidityUsd) : null,
      agg.selected?.change24 != null ? safeDecimal(agg.selected.change24) : null,
      agg.selected ? safeDecimal(agg.selected.priceWax) : null,
      agg.selected?.priceUsd != null ? safeDecimal(agg.selected.priceUsd) : null,
      agg.selected?.source || null,
      agg.selected?.pairId || null,
      sourceKeys.length,
      agg.pairCount,
      sourceKeys.join(','),
      runStatus.complete ? 1 : 0,
      requiredSources.join(','),
      presentSources.join(','),
      runStatus.processed.join(','),
      runStatus.failed.join(','),
      runStatus.truncated ? 1 : 0,
      runStatus.truncatedSources.join(','),
      nowIso(),
    ));
    if (agg.selected) {
      statements.push(env.DB.prepare(
        `UPDATE waxonedge_tokens
         SET price_wax = ?, price_usd = COALESCE(?, price_usd), pair_count = (
           SELECT COUNT(*) FROM waxonedge_pairs
           WHERE (token_a_contract = ? AND token_a_symbol = ?)
              OR (token_b_contract = ? AND token_b_symbol = ?)
         ), updated_at = ?
         WHERE contract = ? AND symbol = ?`
      ).bind(
        safeDecimal(agg.selected.priceWax),
        agg.selected.priceUsd != null ? safeDecimal(agg.selected.priceUsd) : null,
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
  await recordSyncRun(env.DB, 'token_aggregates', runStatus.complete ? 'success' : 'failed', startedAt, runStatus.complete ? null : 'Aggregate incomplete: one or more configured sources failed or truncated');
  await upsertSourceIndexState(env.DB, 'token_aggregates', {
    sync_cycle_id: runStatus.syncCycleId || '',
    cursor: '',
    page_count: 1,
    row_count: aggregates.size,
    complete: runStatus.complete ? 1 : 0,
    truncated: runStatus.truncated ? 1 : 0,
    status: runStatus.complete ? 'success' : 'failed',
    error: runStatus.complete ? null : 'Aggregate incomplete: one or more configured sources failed or truncated',
    started_at: startedAt,
  }).catch(() => {});
  return { ok: runStatus.complete, tokens: aggregates.size, runStatus };
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
  return {
    token,
    stats,
    source_coverage: sourceCoverageFromKeys(parseSourceKeys(stats?.source_keys)),
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
    if (path === `${WAXONEDGE_API_PREFIX}/sync-status`) {
      const [latest_sync, source_index_state] = await Promise.all([getLatestSync(env.DB), getSourceIndexStates(env.DB)]);
      return ok({ latest_sync, source_index_state }, [], null, corsHeaders);
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

export async function runWaxOnEdgeScheduledSync(env, cron = '') {
  if (!env.DB) return { ok: false, error: 'DB binding is not configured' };
  const tasks = [];
  const tick = new Date();
  const minute = tick.getUTCMinutes();
  const hour = tick.getUTCHours();
  const isMinuteCron = cron === '* * * * *';
  const shouldRunFullIndex = !cron || cron === '*/5 * * * *' || (isMinuteCron && minute % 5 === 0);
  if (shouldRunFullIndex) {
    tasks.push((async () => {
      const syncCycleId = await getActiveSourceCycleId(env.DB);
      const [alcor, core, nefty] = await Promise.all([
        syncAlcorMarketData(env, 'alcor_five_minute_market_data', syncCycleId),
        syncCoreDexAdapters(env, syncCycleId),
        syncNeftyAbi(env),
      ]);
      const aggregates = await aggregateTokenAnalytics(env);
      return { ok: alcor.ok && core.ok && nefty.ok && aggregates.ok, syncCycleId, alcor, core, nefty, aggregates };
    })());
  } else if (isMinuteCron) {
    tasks.push(syncAlcorMarketData(env, 'alcor_minute_market_data'));
  }
  if (!cron || cron === '*/15 * * * *' || (isMinuteCron && minute % 15 === 0)) tasks.push(syncSupplyInputs(env));
  if (!cron || cron === '0 */2 * * *' || (isMinuteCron && minute === 0 && hour % 2 === 0)) {
    const startedAt = nowIso();
    tasks.push(recordSyncRun(env.DB, 'holders', 'skipped', startedAt, REQUIRES_INDEXED_BACKEND).then(() => ({
      ok: true,
      skipped: 'holders',
    })));
  }
  if (!tasks.length) return { ok: true, skipped: true };
  const results = await Promise.all(tasks);
  return { ok: results.every((result) => result?.ok), results };
}

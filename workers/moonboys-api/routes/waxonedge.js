const WAXONEDGE_API_PREFIX = '/api/waxonedge';

const ALCOR_API = 'https://wax.alcor.exchange/api/v2';
const WAX_RPC = 'https://wax.greymass.com';
const UNAVAILABLE = 'Unavailable';
const REQUIRES_INDEXED_BACKEND = 'Requires indexed backend';
const SOURCE_NOT_INDEXED = 'Source not indexed yet';
const MAX_SYNC_ROWS = 250;
const MAX_CHAIN_POOL_ROWS = 500;
const MIN_TRUSTED_WAX_LIQUIDITY = 10;

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
  await db.prepare(
    `INSERT INTO waxonedge_snapshots (source, fetched_at, payload_json)
     VALUES (?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       fetched_at = excluded.fetched_at,
       payload_json = excluded.payload_json`
  ).bind(source, fetchedAt, JSON.stringify(payload)).run();
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
  const reserveA = safeDecimal(tokenA.amount ?? ticker.base_amm_liquidity);
  const reserveB = safeDecimal(tokenB.amount ?? ticker.target_amm_liquidity);

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
  return {
    source: adapter.source,
    pair_id: String(pairId),
    token_a_contract: tokenA.contract,
    token_a_symbol: tokenA.symbol,
    token_b_contract: tokenB.contract,
    token_b_symbol: tokenB.symbol,
    price,
    change_24h: null,
    volume_24h: safeDecimal(row.volume_24h ?? row.volume24),
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

async function fetchTableRows(contract, table, limit = MAX_CHAIN_POOL_ROWS) {
  const data = await rpcPost('/v1/chain/get_table_rows', {
    code: contract,
    scope: contract,
    table,
    json: true,
    limit,
  });
  return Array.isArray(data?.rows) ? data.rows : [];
}

async function upsertPairs(db, pairs) {
  if (!pairs.length) return;
  const statements = pairs.map((pair) => db.prepare(
    `INSERT INTO waxonedge_pairs
     (source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
      price, change_24h, volume_24h, liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, pair_id) DO UPDATE SET
       token_a_contract = excluded.token_a_contract,
       token_a_symbol = excluded.token_a_symbol,
       token_b_contract = excluded.token_b_contract,
       token_b_symbol = excluded.token_b_symbol,
       price = excluded.price,
       change_24h = excluded.change_24h,
       volume_24h = excluded.volume_24h,
       liquidity_wax = excluded.liquidity_wax,
       liquidity_usd = excluded.liquidity_usd,
       reserve_a = excluded.reserve_a,
       reserve_b = excluded.reserve_b,
       fee_bps = excluded.fee_bps,
       updated_at = excluded.updated_at`
  ).bind(
    pair.source, pair.pair_id, pair.token_a_contract, pair.token_a_symbol,
    pair.token_b_contract, pair.token_b_symbol, pair.price, pair.change_24h,
    pair.volume_24h, pair.liquidity_wax, pair.liquidity_usd, pair.reserve_a,
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

async function syncAlcorMarketData(env, reason) {
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
      .filter(Boolean)
      .slice(0, MAX_SYNC_ROWS);
    const priceIndex = buildTokenPriceIndex(tokens);
    const tickerIndex = buildTickerIndex(tickers);
    const normalizedPairs = pairRows
      .map((pair) => normalizePair(pair, tickerIndex, priceIndex, syncedAt))
      .filter(Boolean)
      .slice(0, MAX_SYNC_ROWS);

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
    return { ok: true, tokens: normalizedTokens.length, pairs: normalizedPairs.length };
  } catch (error) {
    await recordSyncRun(db, reason || 'alcor_market_data', 'failed', startedAt, error?.message || String(error)).catch(() => {});
    return { ok: false, error: error?.message || String(error) };
  }
}

async function syncCoreDexAdapters(env) {
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
    try {
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
        results.push({ source: adapter.source, ok: true, skipped: true, error });
        continue;
      }
      const rows = await fetchTableRows(adapter.contract, adapter.table, MAX_CHAIN_POOL_ROWS);
      await writeSnapshot(env.DB, `${adapter.source}_${adapter.table}`, {
        contract: adapter.contract,
        table: adapter.table,
        rows,
      }, syncedAt);
      const pairs = rows
        .map((row) => normalizeCoreDexPair(adapter, row, priceIndex, syncedAt))
        .filter(Boolean)
        .slice(0, MAX_SYNC_ROWS);
      await env.DB.prepare(`DELETE FROM waxonedge_pairs WHERE source = ?`).bind(adapter.source).run();
      await upsertPairs(env.DB, pairs);
      await recordSyncRun(env.DB, adapter.source, 'success', adapterStartedAt);
      results.push({ source: adapter.source, ok: true, pairs: pairs.length });
    } catch (error) {
      await recordSyncRun(env.DB, adapter.source, 'failed', adapterStartedAt, error?.message || String(error)).catch(() => {});
      results.push({ source: adapter.source, ok: false, error: error?.message || String(error) });
    }
  }
  await aggregateTokenAnalytics(env).catch((error) => recordSyncRun(env.DB, 'token_aggregates', 'failed', startedAt, error?.message || String(error)));
  return { ok: results.every((result) => result.ok), results };
}

async function aggregateTokenAnalytics(env) {
  const startedAt = nowIso();
  const pairRows = await env.DB.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, liquidity_wax, liquidity_usd, reserve_a, reserve_b, updated_at
     FROM waxonedge_pairs`
  ).all();
  const waxToken = await env.DB.prepare(
    `SELECT price_usd FROM waxonedge_tokens WHERE contract = 'eosio.token' AND symbol = 'WAX' LIMIT 1`
  ).first().catch(() => null);
  const waxUsd = asNumber(waxToken?.price_usd);
  const aggregates = new Map();
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
        selected: null,
      });
    }
    return aggregates.get(key);
  }
  for (const pair of pairRows.results || []) {
    const sides = [
      { contract: pair.token_a_contract, symbol: pair.token_a_symbol },
      { contract: pair.token_b_contract, symbol: pair.token_b_symbol },
    ];
    for (const side of sides) {
      const agg = ensure(side.contract, side.symbol);
      if (!agg) continue;
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
      const volume24 = asNumber(pair.volume_24h);
      if (volume24 != null && tokenKey(side.contract, side.symbol) === tokenKey(pair.token_a_contract, pair.token_a_symbol)) {
        agg.volume24 += volume24;
        agg.hasVolume24 = true;
      }
      const priceWax = pairPriceWaxForToken(pair, side.contract, side.symbol);
      if (priceWax != null && liquidityWax != null && liquidityWax >= MIN_TRUSTED_WAX_LIQUIDITY) {
        const score = liquidityWax + (volume24 || 0);
        if (!agg.selected || score > agg.selected.score) {
          agg.selected = {
            score,
            priceWax,
            priceUsd: waxUsd != null ? priceWax * waxUsd : null,
            source: pair.source,
            pairId: pair.pair_id,
          };
        }
      }
    }
  }
  const statements = [];
  for (const agg of aggregates.values()) {
    statements.push(env.DB.prepare(
      `INSERT INTO waxonedge_token_stats
       (contract, symbol, volume_24h, liquidity_wax, liquidity_usd, tvl_wax, tvl_usd,
        selected_price_wax, selected_price_usd, selected_pair_source, selected_pair_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(contract, symbol) DO UPDATE SET
         volume_24h = excluded.volume_24h,
         liquidity_wax = excluded.liquidity_wax,
         liquidity_usd = excluded.liquidity_usd,
         tvl_wax = excluded.tvl_wax,
         tvl_usd = excluded.tvl_usd,
         selected_price_wax = excluded.selected_price_wax,
         selected_price_usd = excluded.selected_price_usd,
         selected_pair_source = excluded.selected_pair_source,
         selected_pair_id = excluded.selected_pair_id,
         updated_at = excluded.updated_at`
    ).bind(
      agg.contract,
      agg.symbol,
      agg.hasVolume24 ? safeDecimal(agg.volume24) : null,
      agg.hasLiquidityWax ? safeDecimal(agg.liquidityWax) : null,
      agg.hasLiquidityUsd ? safeDecimal(agg.liquidityUsd) : null,
      agg.hasLiquidityWax ? safeDecimal(agg.liquidityWax) : null,
      agg.hasLiquidityUsd ? safeDecimal(agg.liquidityUsd) : null,
      agg.selected ? safeDecimal(agg.selected.priceWax) : null,
      agg.selected?.priceUsd != null ? safeDecimal(agg.selected.priceUsd) : null,
      agg.selected?.source || null,
      agg.selected?.pairId || null,
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
  await recordSyncRun(env.DB, 'token_aggregates', 'success', startedAt);
  return { ok: true, tokens: aggregates.size };
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
            s.volume_24h, s.volume_7d, s.volume_30d, s.liquidity_wax, s.liquidity_usd,
            s.tvl_wax, s.tvl_usd, s.selected_price_wax, s.selected_price_usd,
            s.selected_pair_source, s.selected_pair_id, s.holder_count, s.circulating_supply,
            s.burned_amount, s.market_cap_wax, s.market_cap_usd, s.fdv_wax, s.fdv_usd
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
            price, change_24h, volume_24h, liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
     FROM waxonedge_pairs
     ORDER BY CAST(COALESCE(volume_24h, '0') AS NUMERIC) DESC, updated_at DESC
     LIMIT 250`
  ).all();
  return rows.results || [];
}

async function listTokenPairs(db, contract, symbol) {
  const rows = await db.prepare(
    `SELECT source, pair_id, token_a_contract, token_a_symbol, token_b_contract, token_b_symbol,
            price, change_24h, volume_24h, liquidity_wax, liquidity_usd, reserve_a, reserve_b, fee_bps, updated_at
     FROM waxonedge_pairs
     WHERE (token_a_contract = ? AND token_a_symbol = ?)
        OR (token_b_contract = ? AND token_b_symbol = ?)
     ORDER BY CAST(COALESCE(volume_24h, '0') AS NUMERIC) DESC, updated_at DESC
     LIMIT 250`
  ).bind(contract, symbol, contract, symbol).all();
  return rows.results || [];
}

async function listBestChartCandles(db, contract, symbol) {
  const best = await db.prepare(
    `SELECT p.source, p.pair_id, p.token_a_contract, p.token_a_symbol, p.token_b_contract, p.token_b_symbol,
            p.volume_24h, p.liquidity_wax, p.liquidity_usd, COUNT(c.bucket_time) AS candle_count
     FROM waxonedge_pairs p
     JOIN waxonedge_chart_candles c
       ON c.source = p.source AND c.pair_id = p.pair_id
     WHERE ((p.token_a_contract = ? AND p.token_a_symbol = ?)
         OR (p.token_b_contract = ? AND p.token_b_symbol = ?))
       AND c.interval = '1D'
     GROUP BY p.source, p.pair_id
     HAVING candle_count > 0
     ORDER BY CAST(COALESCE(p.volume_24h, '0') AS NUMERIC) DESC,
              CAST(COALESCE(p.liquidity_wax, '0') AS NUMERIC) DESC,
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
    `SELECT contract, symbol, decimals, total_supply, max_supply, price_wax, price_usd, pair_count, icon_url, updated_at
     FROM waxonedge_tokens WHERE contract = ? AND symbol = ? LIMIT 1`
  ).bind(contract, symbol).first();
  const stats = await db.prepare(
    `SELECT holder_count, circulating_supply, volume_24h, volume_7d, volume_30d,
            market_cap_wax, market_cap_usd, fdv_wax, fdv_usd, liquidity_wax,
            liquidity_usd, tvl_wax, tvl_usd, selected_price_wax, selected_price_usd,
            selected_pair_source, selected_pair_id, burned_amount, updated_at
     FROM waxonedge_token_stats WHERE contract = ? AND symbol = ? LIMIT 1`
  ).bind(contract, symbol).first().catch(() => null);
  return { token, stats };
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

async function handleBootstrap(env, corsHeaders) {
  const coreSnapshotReads = CORE_DEX_ADAPTERS.flatMap((adapter) => [
    readSnapshot(env.DB, `${adapter.source}_abi`),
    readSnapshot(env.DB, `${adapter.source}_${adapter.table}`),
  ]);
  const [tokens, pairs, syncStatus, alcorTokens, alcorPairs, alcorTickers, alcorGlobal, ...coreSnapshots] = await Promise.all([
    listTopTokens(env.DB),
    listTopPairs(env.DB),
    getLatestSync(env.DB),
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
      row_count: Array.isArray(tableSnapshot.data?.rows) ? tableSnapshot.data.rows.length : 0,
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
      const [tokens, pairs, syncStatus] = await Promise.all([listTopTokens(env.DB), listTopPairs(env.DB), getLatestSync(env.DB)]);
      return ok({ token_count: tokens.length, pair_count: pairs.length, latest_sync: syncStatus.slice(0, 10) }, [], null, corsHeaders);
    }
    if (path === `${WAXONEDGE_API_PREFIX}/tokens/top`) return ok(await listTopTokens(env.DB), [], null, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/pairs/top`) return ok(await listTopPairs(env.DB), [], null, corsHeaders);
    if (path === `${WAXONEDGE_API_PREFIX}/sync-status`) return ok(await getLatestSync(env.DB), [], null, corsHeaders);

    const tokenMatch = path.match(/^\/api\/waxonedge\/token\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (tokenMatch) {
      const contract = normalizeContract(decodeURIComponent(tokenMatch[1]));
      const symbol = normalizeSymbol(decodeURIComponent(tokenMatch[2]));
      const child = tokenMatch[3] || '';
      if (child === 'pairs') return ok(await listTokenPairs(env.DB, contract, symbol), [], null, corsHeaders);
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
  if (!cron || isMinuteCron) tasks.push(syncAlcorMarketData(env, 'alcor_minute_market_data'));
  if (!cron || cron === '*/5 * * * *' || (isMinuteCron && minute % 5 === 0)) {
    tasks.push(syncAlcorMarketData(env, 'alcor_five_minute_market_data'), syncCoreDexAdapters(env), syncNeftyAbi(env));
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

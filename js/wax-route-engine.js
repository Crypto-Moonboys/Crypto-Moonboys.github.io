(() => {
  'use strict';

  const ALCOR_POOLS_URL = 'https://wax.alcor.exchange/api/v2/swap/pools';
  const WAX_RPC_ENDPOINTS = [
    'https://wax.greymass.com',
    'https://api.waxsweden.org',
    'https://wax.cryptolions.io',
  ];

  const CORE_BRIDGES = [
    { symbol: 'WAX', contract: 'eosio.token' },
    { symbol: 'USDT', contract: 'eth.token' },
    { symbol: 'TACO', contract: 't.taco' },
    { symbol: 'NEFTY', contract: 'token.nefty' },
  ];

  function asNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const match = String(value == null ? '' : value).match(/[+-]?\d+(?:\.\d+)?/);
    const n = match ? Number(match[0]) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  function parseAsset(asset) {
    const raw = String(asset == null ? '' : asset).trim();
    const match = raw.match(/^([+-]?\d+(?:\.\d+)?)\s+([A-Z0-9._-]+)$/i);
    if (!match) return { amount: asNumber(raw), symbol: '', decimals: 0 };
    return {
      amount: asNumber(match[1]),
      symbol: String(match[2] || '').toUpperCase(),
      decimals: match[1].includes('.') ? match[1].split('.')[1].length : 0,
    };
  }

  function normalize(symbol) {
    const s = String(symbol || '').trim().toUpperCase();
    if (s === 'WAXP') return 'WAX';
    if (s === 'WAXUSDT' || s === 'USDT.ETH' || s === 'ETHUSDT') return 'USDT';
    if (s === 'USDC.ETH' || s === 'WAXUSDC') return 'USDC';
    if (s === 'BTC.ETH' || s === 'ETHBTC') return 'BTC';
    return s;
  }

  function tokenKey(token) {
    return `${normalize(token && token.symbol)}:${String((token && token.contract) || '').trim().toLowerCase()}`;
  }

  function sameToken(a, b) {
    return tokenKey(a) === tokenKey(b);
  }

  function feeToMultiplier(rawFee, provider) {
    const f = asNumber(rawFee);
    if (!f) return provider === 'TACO' ? 0.9975 : 0.997;
    if (f >= 100) return 1 - f / 1000000;
    return 1 - f / 10000;
  }

  function feeToPercent(rawFee, provider) {
    const f = asNumber(rawFee);
    if (!f) return provider === 'TACO' ? 0.25 : 0.3;
    if (f >= 100) return f / 10000;
    return f / 100;
  }

  function reserveScore(a, b) {
    const x = asNumber(a);
    const y = asNumber(b);
    if (x <= 0 || y <= 0) return 0;
    return Math.sqrt(x * y);
  }

  function resolveMinLiquidityScore(value) {
    if (typeof value === 'boolean') return value ? 10 : 0;
    const n = asNumber(value);
    return n > 0 ? n : 0;
  }

  function poolDirection(pool, tokenIn, tokenOut) {
    if (sameToken(pool.tokenA, tokenIn) && sameToken(pool.tokenB, tokenOut)) return { reserveIn: pool.tokenA.reserve, reserveOut: pool.tokenB.reserve };
    if (sameToken(pool.tokenB, tokenIn) && sameToken(pool.tokenA, tokenOut)) return { reserveIn: pool.tokenB.reserve, reserveOut: pool.tokenA.reserve };
    return null;
  }

  function getSwapResult(amountIn, resIn, resOut, fee = 0.997) {
    if (amountIn <= 0 || resIn <= 0 || resOut <= 0) return { output: 0, impact: 0 };
    const amountAfterFee = amountIn * fee;
    const output = (amountAfterFee * resOut) / (resIn + amountAfterFee);
    const spotPrice = resOut / resIn;
    const executionPrice = output / amountIn;
    const impact = spotPrice > 0 ? Math.max(0, ((spotPrice - executionPrice) / spotPrice) * 100) : 0;
    return { output, impact };
  }

  function calculateOrderBookOutput(amountIn, orderbook, side) {
    if (!orderbook) return { output: 0, impact: 0 };
    const orders = side === 'buy' ? orderbook.asks : orderbook.bids;
    if (!Array.isArray(orders) || !orders.length) return { output: 0, impact: 0 };
    let remaining = amountIn;
    let totalOut = 0;
    for (const order of orders) {
      const orderPrice = parseFloat(order[0]);
      const orderAmount = parseFloat(order[1]);
      if (!Number.isFinite(orderPrice) || !Number.isFinite(orderAmount) || orderPrice <= 0 || orderAmount <= 0) continue;
      if (side === 'buy') {
        const canTake = Math.min(remaining / orderPrice, orderAmount);
        totalOut += canTake;
        remaining -= canTake * orderPrice;
      } else {
        const canTake = Math.min(remaining, orderAmount);
        totalOut += canTake * orderPrice;
        remaining -= canTake;
      }
      if (remaining <= 0) break;
    }
    const firstPrice = parseFloat(orders[0]?.[0] || '0');
    const finalPrice = totalOut > 0 ? (side === 'buy' ? amountIn / totalOut : totalOut / amountIn) : 0;
    const impact = firstPrice > 0 ? Math.abs((finalPrice - firstPrice) / firstPrice) * 100 : 0;
    return { output: totalOut, impact };
  }

  async function rpcTableRows({ code, scope, table, limit = 1000 }) {
    let lastError;
    for (const endpoint of WAX_RPC_ENDPOINTS) {
      try {
        const res = await fetch(`${endpoint}/v1/chain/get_table_rows`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ json: true, code, scope, table, limit }),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
        return await res.json();
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error(`Table failed: ${code}/${table}`);
  }

  function mapAlcorPool(p) {
    const reserveA = asNumber(p?.tokenA?.quantity ?? p?.reserveA);
    const reserveB = asNumber(p?.tokenB?.quantity ?? p?.reserveB);
    const tvlUSD = asNumber(p?.tvlUSD);
    return {
      id: `alcor:${String(p?.id ?? '')}`,
      sourceId: String(p?.id ?? ''),
      provider: 'ALCOR',
      tokenA: { symbol: String(p?.tokenA?.symbol || '').toUpperCase(), contract: String(p?.tokenA?.contract || ''), reserve: reserveA, decimals: asNumber(p?.tokenA?.decimals) },
      tokenB: { symbol: String(p?.tokenB?.symbol || '').toUpperCase(), contract: String(p?.tokenB?.contract || ''), reserve: reserveB, decimals: asNumber(p?.tokenB?.decimals) },
      liquidityUSD: tvlUSD || null,
      liquidityScore: tvlUSD || reserveScore(reserveA, reserveB),
      liquidityBasis: tvlUSD ? 'tvlUSD' : 'reserve_score',
      fee: asNumber(p?.fee || 3000),
      raw: p,
    };
  }

  function mapTacoPool(row) {
    const pool1 = row?.pool1 || row?.token1 || row?.reserve0 || row?.reserveA || row?.a;
    const pool2 = row?.pool2 || row?.token2 || row?.reserve1 || row?.reserveB || row?.b;
    const aAsset = parseAsset(pool1?.quantity || pool1);
    const bAsset = parseAsset(pool2?.quantity || pool2);
    const aContract = String(pool1?.contract || row?.contract1 || row?.token1_contract || row?.contractA || '').trim();
    const bContract = String(pool2?.contract || row?.contract2 || row?.token2_contract || row?.contractB || '').trim();
    const tvlUSD = asNumber(row?.tvlUSD || row?.liquidityUSD || row?.liquidity_usd);
    const id = row?.id ?? row?.pair_id ?? row?.code ?? `${aContract}:${aAsset.symbol}-${bContract}:${bAsset.symbol}`;
    return {
      id: `taco:${String(id)}`,
      sourceId: String(id),
      provider: 'TACO',
      tokenA: { symbol: aAsset.symbol, contract: aContract, reserve: aAsset.amount, decimals: aAsset.decimals },
      tokenB: { symbol: bAsset.symbol, contract: bContract, reserve: bAsset.amount, decimals: bAsset.decimals },
      liquidityUSD: tvlUSD || null,
      liquidityScore: tvlUSD || reserveScore(aAsset.amount, bAsset.amount),
      liquidityBasis: tvlUSD ? 'tvlUSD' : 'reserve_score',
      fee: asNumber(row?.fee || row?.fee_bps || 25),
      raw: row,
    };
  }

  function mapNeftyPool(row) {
    const r0 = row?.reserve0 || row?.pool1 || row?.token0 || row?.tokenA;
    const r1 = row?.reserve1 || row?.pool2 || row?.token1 || row?.tokenB;
    const aAsset = parseAsset(r0?.quantity || r0);
    const bAsset = parseAsset(r1?.quantity || r1);
    const aContract = String(r0?.contract || row?.contract0 || row?.token0_contract || row?.contractA || '').trim();
    const bContract = String(r1?.contract || row?.contract1 || row?.token1_contract || row?.contractB || '').trim();
    const tvlUSD = asNumber(row?.tvlUSD || row?.liquidityUSD || row?.liquidity_usd);
    const id = row?.code ?? row?.id ?? row?.pair_id ?? `${aContract}:${aAsset.symbol}-${bContract}:${bAsset.symbol}`;
    return {
      id: `nefty:${String(id)}`,
      sourceId: String(id),
      provider: 'NEFTY',
      tokenA: { symbol: aAsset.symbol, contract: aContract, reserve: aAsset.amount, decimals: aAsset.decimals },
      tokenB: { symbol: bAsset.symbol, contract: bContract, reserve: bAsset.amount, decimals: bAsset.decimals },
      liquidityUSD: tvlUSD || null,
      liquidityScore: tvlUSD || reserveScore(aAsset.amount, bAsset.amount),
      liquidityBasis: tvlUSD ? 'tvlUSD' : 'reserve_score',
      fee: asNumber(row?.fee || row?.fee_bps || 30),
      raw: row,
    };
  }

  function validPool(pool) {
    return Boolean(pool && pool.id && pool.provider && pool.tokenA.symbol && pool.tokenB.symbol && pool.tokenA.contract && pool.tokenB.contract && pool.tokenA.reserve > 0 && pool.tokenB.reserve > 0 && pool.liquidityScore > 0);
  }

  function dedupePools(pools) {
    const seen = new Set();
    const out = [];
    for (const pool of pools) {
      const key = `${pool.provider}:${pool.sourceId}:${tokenKey(pool.tokenA)}:${tokenKey(pool.tokenB)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pool);
    }
    return out;
  }

  async function fetchAlcorPools() {
    const res = await fetch(ALCOR_POOLS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Alcor pools failed: ${res.status}`);
    const raw = await res.json();
    return (Array.isArray(raw) ? raw : []).map(mapAlcorPool).filter(validPool);
  }

  async function fetchTacoPools() {
    const data = await rpcTableRows({ code: 'swap.taco', scope: 'swap.taco', table: 'pairs', limit: 1000 });
    return (Array.isArray(data?.rows) ? data.rows : []).map(mapTacoPool).filter(validPool);
  }

  async function fetchNeftyPools() {
    const attempts = [
      { code: 'swap.nefty', scope: 'swap.nefty', table: 'pairs', limit: 1000 },
      { code: 'swap.nefty', scope: 'swap.nefty', table: 'pools', limit: 1000 },
    ];
    for (const args of attempts) {
      try {
        const data = await rpcTableRows(args);
        const rows = (Array.isArray(data?.rows) ? data.rows : []).map(mapNeftyPool).filter(validPool);
        if (rows.length) return rows;
      } catch (_) {}
    }
    return [];
  }

  async function fetchAllPools(chainId = 'wax') {
    if (chainId !== 'wax') return { pools: [], sourceCounts: {}, sourceErrors: {} };
    const loaders = [
      ['ALCOR', fetchAlcorPools],
      ['TACO', fetchTacoPools],
      ['NEFTY', fetchNeftyPools],
    ];
    const settled = await Promise.allSettled(loaders.map(async ([name, fn]) => [name, await fn()]));
    const pools = [];
    const sourceCounts = {};
    const sourceErrors = {};
    for (const item of settled) {
      if (item.status === 'fulfilled') {
        const [name, rows] = item.value;
        sourceCounts[name] = rows.length;
        pools.push(...rows);
      } else {
        const msg = String(item.reason?.message || item.reason || 'failed');
        const source = msg.includes('Taco') ? 'TACO' : msg.includes('Nefty') ? 'NEFTY' : msg.includes('Alcor') ? 'ALCOR' : 'UNKNOWN';
        sourceErrors[source] = msg;
      }
    }
    return { pools: dedupePools(pools), sourceCounts, sourceErrors };
  }

  function routeQuote(pool, amountIn, tokenIn, tokenOut) {
    const dir = poolDirection(pool, tokenIn, tokenOut);
    if (!dir) return null;
    const res = getSwapResult(amountIn, dir.reserveIn, dir.reserveOut, feeToMultiplier(pool.fee, pool.provider));
    if (res.output <= 0) return null;
    return {
      type: 'direct', output: res.output, amountIn, provider: pool.provider, poolId: pool.sourceId, split: false, impact: res.impact, hops: [], routePools: [pool],
      splits: [{ provider: pool.provider.toLowerCase(), poolId: pool.sourceId, amount: amountIn, output: res.output, impact: res.impact, feePercent: feeToPercent(pool.fee, pool.provider) }],
      path: [tokenIn.symbol, tokenOut.symbol], feePercent: feeToPercent(pool.fee, pool.provider), savingsPct: 0,
    };
  }

  function getDirectCandidates(amountIn, tokenIn, tokenOut, pools, minLiquidityScore) {
    return pools.filter((pool) => pool.liquidityScore >= minLiquidityScore).map((pool) => routeQuote(pool, amountIn, tokenIn, tokenOut)).filter(Boolean).sort((a, b) => b.output - a.output);
  }

  function getMultiHopCandidates(amountIn, tokenIn, tokenOut, pools, minLiquidityScore) {
    const usablePools = pools.filter((pool) => pool.liquidityScore >= minLiquidityScore);
    const routes = [];
    for (const bridge of CORE_BRIDGES) {
      if (sameToken(bridge, tokenIn) || sameToken(bridge, tokenOut)) continue;
      for (const poolIn of usablePools) {
        const d1 = poolDirection(poolIn, tokenIn, bridge);
        if (!d1) continue;
        const hop1 = getSwapResult(amountIn, d1.reserveIn, d1.reserveOut, feeToMultiplier(poolIn.fee, poolIn.provider));
        if (hop1.output <= 0) continue;
        for (const poolOut of usablePools) {
          if (poolIn.id === poolOut.id) continue;
          const d2 = poolDirection(poolOut, bridge, tokenOut);
          if (!d2) continue;
          const hop2 = getSwapResult(hop1.output, d2.reserveIn, d2.reserveOut, feeToMultiplier(poolOut.fee, poolOut.provider));
          if (hop2.output <= 0) continue;
          const feePercent = feeToPercent(poolIn.fee, poolIn.provider) + feeToPercent(poolOut.fee, poolOut.provider);
          routes.push({
            type: 'multi-hop', output: hop2.output, amountIn, provider: 'MULTI-HOP ROUTE', split: false, impact: hop1.impact + hop2.impact,
            hops: [poolIn, poolOut], routePools: [poolIn, poolOut],
            splits: [{ provider: 'multi-hop', poolId: `${poolIn.sourceId}>${poolOut.sourceId}`, amount: amountIn, output: hop2.output, impact: hop1.impact + hop2.impact, feePercent }],
            path: [tokenIn.symbol, bridge.symbol, tokenOut.symbol], feePercent, savingsPct: 0,
          });
        }
      }
    }
    return routes.sort((a, b) => b.output - a.output);
  }

  function getSplitCandidate(amountIn, tokenIn, tokenOut, directCandidates) {
    if (directCandidates.length < 2 || amountIn <= 100) return null;
    const selected = directCandidates.slice(0, 3).map((route) => route.routePools[0]).filter(Boolean);
    if (selected.length < 2) return null;
    const amountPer = amountIn / selected.length;
    const splits = [];
    let output = 0;
    let impact = 0;
    let feePercent = 0;
    for (const pool of selected) {
      const dir = poolDirection(pool, tokenIn, tokenOut);
      if (!dir) return null;
      const res = getSwapResult(amountPer, dir.reserveIn, dir.reserveOut, feeToMultiplier(pool.fee, pool.provider));
      if (res.output <= 0) return null;
      const fp = feeToPercent(pool.fee, pool.provider);
      output += res.output;
      impact += res.impact;
      feePercent += fp;
      splits.push({ provider: pool.provider.toLowerCase(), poolId: pool.sourceId, amount: amountPer, output: res.output, impact: res.impact, feePercent: fp });
    }
    return { type: 'split', output, amountIn, provider: 'PxSmart Split', split: true, impact: impact / selected.length, hops: [], routePools: selected, splits, path: [tokenIn.symbol, tokenOut.symbol], feePercent: feePercent / selected.length, savingsPct: 0 };
  }

  function spotCandidate(amountIn, tokenIn, tokenOut, orderbook) {
    if (!orderbook) return null;
    const native = normalize(tokenIn.symbol) === 'WAX';
    const res = calculateOrderBookOutput(amountIn, orderbook, native ? 'buy' : 'sell');
    if (res.output <= 0) return null;
    return { type: 'direct', output: res.output, amountIn, provider: 'SPOT MARKET', split: false, impact: res.impact, hops: [], routePools: [], splits: [{ provider: 'spot', poolId: 'spot', amount: amountIn, output: res.output, impact: res.impact, feePercent: 0 }], path: [tokenIn.symbol, tokenOut.symbol], feePercent: 0, savingsPct: 0 };
  }

  function findOptimalSplit(amountIn, tokenIn, tokenOut, allPools, highLiquidityOnly = false, orderbook, alcorTickers) {
    const minLiquidityScore = resolveMinLiquidityScore(highLiquidityOnly);
    const directCandidates = getDirectCandidates(amountIn, tokenIn, tokenOut, allPools, minLiquidityScore);
    const multiHopCandidates = getMultiHopCandidates(amountIn, tokenIn, tokenOut, allPools, minLiquidityScore);
    const spot = spotCandidate(amountIn, tokenIn, tokenOut, orderbook, alcorTickers);
    const singleCandidates = [...directCandidates, ...multiHopCandidates, spot].filter(Boolean).sort((a, b) => b.output - a.output);
    const bestSingle = singleCandidates[0] || null;
    const split = getSplitCandidate(amountIn, tokenIn, tokenOut, directCandidates);
    const final = split && (!bestSingle || split.output > bestSingle.output) ? split : bestSingle;
    if (!final) return { type: 'none', output: 0, amountIn, savingsPct: 0, provider: 'NO ROUTE', split: false, impact: 0, hops: [], splits: [], path: [tokenIn.symbol, tokenOut.symbol], feePercent: 0, routePools: [], candidates: [] };
    final.savingsPct = bestSingle && bestSingle.output > 0 ? ((final.output - bestSingle.output) / bestSingle.output) * 100 : 0;
    final.candidates = [...singleCandidates, split].filter(Boolean).sort((a, b) => b.output - a.output);
    final.minLiquidityScore = minLiquidityScore;
    return final;
  }

  window.WAX_ROUTE_ENGINE = {
    fetchAllPools,
    getSwapResult,
    findOptimalSplit,
    calculateOrderBookOutput,
    normalize,
    tokenKey,
    sameToken,
    feeToMultiplier,
    feeToPercent,
    resolveMinLiquidityScore,
  };
})();

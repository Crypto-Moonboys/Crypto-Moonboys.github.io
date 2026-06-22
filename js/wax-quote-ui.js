(() => {
  const ALCOR_POOLS_URL = 'https://wax.alcor.exchange/api/v2/swap/pools';
  const WAX_RPC_ENDPOINTS = [
    'https://wax.greymass.com',
    'https://api.waxsweden.org',
    'https://wax.cryptolions.io',
  ];

  const state = {
    pools: [],
    tokens: [],
    ready: false,
    sourceCounts: {},
    sourceErrors: {},
  };

  const els = {
    amount: document.getElementById('amountIn'),
    tokenIn: document.getElementById('tokenIn'),
    tokenOut: document.getElementById('tokenOut'),
    minLiquidity: document.getElementById('minLiquidity'),
    slippage: document.getElementById('slippage'),
    quoteBtn: document.getElementById('quoteBtn'),
    switchBtn: document.getElementById('switchTokens'),
    result: document.getElementById('resultPanel'),
  };

  function htmlEscape(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

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

  function norm(symbol) {
    const s = String(symbol || '').trim().toUpperCase();
    if (s === 'WAXP') return 'WAX';
    if (s === 'WAXUSDT' || s === 'USDT.ETH' || s === 'ETHUSDT') return 'USDT';
    if (s === 'USDC.ETH' || s === 'WAXUSDC') return 'USDC';
    if (s === 'BTC.ETH' || s === 'ETHBTC') return 'BTC';
    return s;
  }

  function keyOf(token) {
    return `${norm(token.symbol)}:${String(token.contract || '').trim().toLowerCase()}`;
  }

  function sameToken(a, b) {
    return keyOf(a) === keyOf(b);
  }

  function feeMultiplier(rawFee, provider) {
    const f = asNumber(rawFee);
    if (!f) {
      if (provider === 'TACO') return 0.9975;
      return 0.997;
    }
    if (f >= 100) return 1 - f / 1000000; // Alcor-style: 3000 = 0.3%.
    return 1 - f / 10000; // bps-style: 30 = 0.3%.
  }

  function feePercent(rawFee, provider) {
    const f = asNumber(rawFee);
    if (!f) {
      if (provider === 'TACO') return 0.25;
      return 0.3;
    }
    if (f >= 100) return f / 10000;
    return f / 100;
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
    return {
      id: `alcor:${String(p?.id ?? '')}`,
      sourceId: String(p?.id ?? ''),
      provider: 'ALCOR',
      tokenA: {
        symbol: String(p?.tokenA?.symbol || '').toUpperCase(),
        contract: String(p?.tokenA?.contract || ''),
        reserve: reserveA,
        decimals: asNumber(p?.tokenA?.decimals),
      },
      tokenB: {
        symbol: String(p?.tokenB?.symbol || '').toUpperCase(),
        contract: String(p?.tokenB?.contract || ''),
        reserve: reserveB,
        decimals: asNumber(p?.tokenB?.decimals),
      },
      liquidityUSD: asNumber(p?.tvlUSD),
      fee: asNumber(p?.fee || 3000),
    };
  }

  function mapTacoPool(row) {
    const pool1 = row?.pool1 || row?.token1 || row?.reserve0 || row?.reserveA || row?.a;
    const pool2 = row?.pool2 || row?.token2 || row?.reserve1 || row?.reserveB || row?.b;
    const aAsset = parseAsset(pool1?.quantity || pool1);
    const bAsset = parseAsset(pool2?.quantity || pool2);
    const aContract = String(pool1?.contract || row?.contract1 || row?.token1_contract || row?.contractA || '').trim();
    const bContract = String(pool2?.contract || row?.contract2 || row?.token2_contract || row?.contractB || '').trim();
    const id = row?.id ?? row?.pair_id ?? row?.code ?? `${aContract}:${aAsset.symbol}-${bContract}:${bAsset.symbol}`;
    return {
      id: `taco:${String(id)}`,
      sourceId: String(id),
      provider: 'TACO',
      tokenA: { symbol: aAsset.symbol, contract: aContract, reserve: aAsset.amount, decimals: aAsset.decimals },
      tokenB: { symbol: bAsset.symbol, contract: bContract, reserve: bAsset.amount, decimals: bAsset.decimals },
      liquidityUSD: asNumber(row?.tvlUSD || row?.liquidityUSD || row?.liquidity_usd) || estimateLiquidity(aAsset.amount, bAsset.amount),
      fee: asNumber(row?.fee || row?.fee_bps || 25),
    };
  }

  function mapNeftyPool(row) {
    const r0 = row?.reserve0 || row?.pool1 || row?.token0 || row?.tokenA;
    const r1 = row?.reserve1 || row?.pool2 || row?.token1 || row?.tokenB;
    const aAsset = parseAsset(r0?.quantity || r0);
    const bAsset = parseAsset(r1?.quantity || r1);
    const aContract = String(r0?.contract || row?.contract0 || row?.token0_contract || row?.contractA || '').trim();
    const bContract = String(r1?.contract || row?.contract1 || row?.token1_contract || row?.contractB || '').trim();
    const id = row?.code ?? row?.id ?? row?.pair_id ?? `${aContract}:${aAsset.symbol}-${bContract}:${bAsset.symbol}`;
    return {
      id: `nefty:${String(id)}`,
      sourceId: String(id),
      provider: 'NEFTY',
      tokenA: { symbol: aAsset.symbol, contract: aContract, reserve: aAsset.amount, decimals: aAsset.decimals },
      tokenB: { symbol: bAsset.symbol, contract: bContract, reserve: bAsset.amount, decimals: bAsset.decimals },
      liquidityUSD: asNumber(row?.tvlUSD || row?.liquidityUSD || row?.liquidity_usd) || estimateLiquidity(aAsset.amount, bAsset.amount),
      fee: asNumber(row?.fee || row?.fee_bps || 30),
    };
  }

  function estimateLiquidity(a, b) {
    const x = asNumber(a);
    const y = asNumber(b);
    if (x <= 0 || y <= 0) return 0;
    return Math.sqrt(x * y);
  }

  function validPool(p) {
    return Boolean(
      p &&
      p.id &&
      p.provider &&
      p.tokenA.symbol &&
      p.tokenB.symbol &&
      p.tokenA.contract &&
      p.tokenB.contract &&
      p.tokenA.reserve > 0 &&
      p.tokenB.reserve > 0 &&
      p.liquidityUSD > 0
    );
  }

  function dedupePools(pools) {
    const seen = new Set();
    const out = [];
    for (const p of pools) {
      const key = `${p.provider}:${p.sourceId}:${keyOf(p.tokenA)}:${keyOf(p.tokenB)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
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
    let last = [];
    for (const args of attempts) {
      try {
        const data = await rpcTableRows(args);
        const rows = (Array.isArray(data?.rows) ? data.rows : []).map(mapNeftyPool).filter(validPool);
        if (rows.length) return rows;
        last = rows;
      } catch (_) {}
    }
    return last;
  }

  function direction(pool, tokenIn, tokenOut) {
    if (sameToken(pool.tokenA, tokenIn) && sameToken(pool.tokenB, tokenOut)) {
      return { reserveIn: pool.tokenA.reserve, reserveOut: pool.tokenB.reserve };
    }
    if (sameToken(pool.tokenB, tokenIn) && sameToken(pool.tokenA, tokenOut)) {
      return { reserveIn: pool.tokenB.reserve, reserveOut: pool.tokenA.reserve };
    }
    return null;
  }

  function quoteConstantProduct(amountIn, reserveIn, reserveOut, fee) {
    if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return { output: 0, impact: 0 };
    const afterFee = amountIn * fee;
    const output = (afterFee * reserveOut) / (reserveIn + afterFee);
    const spot = reserveOut / reserveIn;
    const execution = output / amountIn;
    const impact = Math.max(0, ((spot - execution) / spot) * 100);
    return { output, impact };
  }

  function selectedToken(select) {
    const [symbol, contract] = String(select.value || '').split('::');
    return { symbol, contract };
  }

  function formatNumber(n, max = 8) {
    const value = asNumber(n);
    if (!value) return '0';
    if (Math.abs(value) >= 1000000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (Math.abs(value) >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: Math.min(max, 6) });
    return value.toLocaleString(undefined, { maximumSignificantDigits: max });
  }

  function buildTokens() {
    const map = new Map();
    for (const pool of state.pools) {
      for (const token of [pool.tokenA, pool.tokenB]) {
        const key = `${token.symbol}::${token.contract}`;
        const existing = map.get(key) || { ...token, score: 0, providers: new Set() };
        existing.score += pool.liquidityUSD;
        existing.providers.add(pool.provider);
        map.set(key, existing);
      }
    }
    state.tokens = [...map.values()].map((t) => ({ ...t, providers: [...t.providers] })).sort((a, b) => {
      if (norm(a.symbol) === 'WAX') return -1;
      if (norm(b.symbol) === 'WAX') return 1;
      return b.score - a.score || a.symbol.localeCompare(b.symbol);
    });
  }

  function fillSelects() {
    const currentIn = els.tokenIn.value;
    const currentOut = els.tokenOut.value;
    const options = state.tokens.map((token) => {
      const label = `${token.symbol} — ${token.contract} (${token.providers.join('/')})`;
      return `<option value="${htmlEscape(token.symbol)}::${htmlEscape(token.contract)}">${htmlEscape(label)}</option>`;
    }).join('');
    els.tokenIn.innerHTML = options;
    els.tokenOut.innerHTML = options;
    if (currentIn) els.tokenIn.value = currentIn;
    if (currentOut) els.tokenOut.value = currentOut;
    const wax = state.tokens.find((t) => norm(t.symbol) === 'WAX' && String(t.contract).toLowerCase() === 'eosio.token');
    const tlm = state.tokens.find((t) => norm(t.symbol) === 'TLM' && String(t.contract).toLowerCase() === 'alien.worlds');
    if (!els.tokenIn.value && wax) els.tokenIn.value = `${wax.symbol}::${wax.contract}`;
    if (!els.tokenOut.value && tlm) els.tokenOut.value = `${tlm.symbol}::${tlm.contract}`;
    if (!els.tokenOut.value && state.tokens[1]) els.tokenOut.value = `${state.tokens[1].symbol}::${state.tokens[1].contract}`;
  }

  function findBestRoute() {
    const amountIn = asNumber(els.amount.value);
    const tokenIn = selectedToken(els.tokenIn);
    const tokenOut = selectedToken(els.tokenOut);
    const minLiquidity = asNumber(els.minLiquidity.value);
    const pools = state.pools.filter((p) => p.liquidityUSD >= minLiquidity);
    const direct = [];

    for (const pool of pools) {
      const dir = direction(pool, tokenIn, tokenOut);
      if (!dir) continue;
      const q = quoteConstantProduct(amountIn, dir.reserveIn, dir.reserveOut, feeMultiplier(pool.fee, pool.provider));
      if (q.output > 0) {
        direct.push({ type: 'direct', output: q.output, impact: q.impact, hops: [pool], fee: feePercent(pool.fee, pool.provider) });
      }
    }

    const bridges = findBridgeTokens(tokenIn, tokenOut, pools);
    const multi = [];
    for (const bridge of bridges) {
      for (const first of pools) {
        const d1 = direction(first, tokenIn, bridge);
        if (!d1) continue;
        const q1 = quoteConstantProduct(amountIn, d1.reserveIn, d1.reserveOut, feeMultiplier(first.fee, first.provider));
        if (q1.output <= 0) continue;
        for (const second of pools) {
          if (first.id === second.id) continue;
          const d2 = direction(second, bridge, tokenOut);
          if (!d2) continue;
          const q2 = quoteConstantProduct(q1.output, d2.reserveIn, d2.reserveOut, feeMultiplier(second.fee, second.provider));
          if (q2.output > 0) {
            multi.push({ type: 'multi-hop', output: q2.output, impact: q1.impact + q2.impact, hops: [first, second], fee: feePercent(first.fee, first.provider) + feePercent(second.fee, second.provider), bridge });
          }
        }
      }
    }

    const all = [...direct, ...multi].sort((a, b) => b.output - a.output);
    return { amountIn, tokenIn, tokenOut, best: all[0], all };
  }

  function findBridgeTokens(tokenIn, tokenOut, pools) {
    const priority = [
      { symbol: 'WAX', contract: 'eosio.token' },
      { symbol: 'USDT', contract: 'eth.token' },
      { symbol: 'TLM', contract: 'alien.worlds' },
      { symbol: 'TACO', contract: 't.taco' },
      { symbol: 'NEFTY', contract: 'token.nefty' },
    ];
    const map = new Map(priority.map((t) => [keyOf(t), t]));
    for (const pool of pools) {
      for (const t of [pool.tokenA, pool.tokenB]) {
        if (!sameToken(t, tokenIn) && !sameToken(t, tokenOut)) map.set(keyOf(t), { symbol: t.symbol, contract: t.contract });
      }
    }
    return [...map.values()].filter((t) => !sameToken(t, tokenIn) && !sameToken(t, tokenOut)).slice(0, 16);
  }

  function providerSummary() {
    const parts = ['ALCOR', 'TACO', 'NEFTY'].map((name) => `${name}: ${state.sourceCounts[name] || 0}`);
    const errors = Object.entries(state.sourceErrors).filter(([, v]) => v).map(([k]) => k);
    return `${parts.join(' · ')}${errors.length ? ` · Failed: ${errors.join(', ')}` : ''}`;
  }

  function render() {
    if (!state.ready) return;
    const slippage = asNumber(els.slippage.value);
    const { amountIn, tokenIn, tokenOut, best, all } = findBestRoute();

    if (!amountIn || amountIn <= 0) {
      els.result.innerHTML = `<div class="muted">Enter an amount.<br>${htmlEscape(providerSummary())}</div>`;
      return;
    }
    if (!best) {
      els.result.innerHTML = `<div class="bad">No route found for this pair at the selected TVL filter.</div><div class="warning">${htmlEscape(providerSummary())}</div>`;
      return;
    }

    const minReceived = best.output * (1 - slippage);
    const routeNames = best.hops.map((p) => `${p.provider} ${p.tokenA.symbol}/${p.tokenB.symbol}`).join(' → ');
    const poolIds = best.hops.map((p) => `${p.provider} #${p.sourceId}`).join(', ');
    const topRows = all.slice(0, 5).map((r, idx) => {
      const providers = r.hops.map((p) => p.provider).join(' → ');
      const labels = r.hops.map((p) => `${p.tokenA.symbol}/${p.tokenB.symbol}`).join(' → ');
      return `<div class="route"><strong>${idx === 0 ? 'Best' : `#${idx + 1}`}</strong><div><b>${htmlEscape(r.type)} · ${htmlEscape(providers)}</b><br><small>${htmlEscape(labels)}</small><br><small>Output ${formatNumber(r.output)} · Impact ${formatNumber(r.impact, 4)}%</small></div></div>`;
    }).join('');
    const warn = best.impact > 5 ? '<div class="warning">High price impact. Reduce amount or check another route before using this quote.</div>' : '';

    els.result.innerHTML = `
      <div class="muted">Estimated output</div>
      <div class="big">${formatNumber(best.output)} ${htmlEscape(tokenOut.symbol)}</div>
      <div class="muted">For ${formatNumber(amountIn)} ${htmlEscape(tokenIn.symbol)}</div>
      <div class="stats">
        <div class="stat"><small>Route</small><b>${htmlEscape(best.type)}</b></div>
        <div class="stat"><small>Sources loaded</small><b>${htmlEscape(providerSummary())}</b></div>
        <div class="stat"><small>Impact</small><b>${formatNumber(best.impact, 4)}%</b></div>
        <div class="stat"><small>Fee total</small><b>${formatNumber(best.fee, 4)}%</b></div>
        <div class="stat"><small>Minimum after tolerance</small><b>${formatNumber(minReceived)}</b></div>
        <div class="stat"><small>Candidate routes</small><b>${all.length}</b></div>
      </div>
      <div class="warning">Route: ${htmlEscape(routeNames)}<br>Pool IDs: ${htmlEscape(poolIds)}</div>
      ${warn}
      <div class="routes">${topRows}</div>
    `;
  }

  async function load() {
    state.ready = false;
    els.result.innerHTML = '<div class="muted">Loading Alcor, Taco and Nefty pools...</div>';
    state.sourceCounts = {};
    state.sourceErrors = {};

    const loaders = [
      ['ALCOR', fetchAlcorPools],
      ['TACO', fetchTacoPools],
      ['NEFTY', fetchNeftyPools],
    ];

    const settled = await Promise.allSettled(loaders.map(async ([name, fn]) => [name, await fn()]));
    const pools = [];
    for (const item of settled) {
      if (item.status === 'fulfilled') {
        const [name, rows] = item.value;
        state.sourceCounts[name] = rows.length;
        pools.push(...rows);
      } else {
        const msg = String(item.reason?.message || item.reason || 'failed');
        const source = msg.includes('Taco') ? 'TACO' : msg.includes('Nefty') ? 'NEFTY' : msg.includes('Alcor') ? 'ALCOR' : 'UNKNOWN';
        state.sourceErrors[source] = msg;
      }
    }

    state.pools = dedupePools(pools);
    buildTokens();
    fillSelects();
    state.ready = true;
    render();
  }

  for (const el of [els.amount, els.tokenIn, els.tokenOut, els.minLiquidity, els.slippage]) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  }

  els.quoteBtn.addEventListener('click', load);
  els.switchBtn.addEventListener('click', () => {
    const oldIn = els.tokenIn.value;
    els.tokenIn.value = els.tokenOut.value;
    els.tokenOut.value = oldIn;
    render();
  });

  load();
})();

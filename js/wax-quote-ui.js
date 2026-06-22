(() => {
  const ALCOR_POOLS_URL = 'https://wax.alcor.exchange/api/v2/swap/pools';

  const state = {
    pools: [],
    tokens: [],
    ready: false,
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
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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
    return `${norm(token.symbol)}:${String(token.contract || '').trim()}`;
  }

  function sameToken(a, b) {
    return keyOf(a) === keyOf(b);
  }

  function feeMultiplier(rawFee) {
    const f = asNumber(rawFee);
    if (!f) return 0.997;
    if (f >= 100) return 1 - f / 1000000;
    return 1 - f / 10000;
  }

  function feePercent(rawFee) {
    const f = asNumber(rawFee);
    if (!f) return 0.3;
    if (f >= 100) return f / 10000;
    return f / 100;
  }

  function mapPool(p) {
    const reserveA = asNumber(p?.tokenA?.quantity ?? p?.reserveA);
    const reserveB = asNumber(p?.tokenB?.quantity ?? p?.reserveB);
    return {
      id: String(p?.id ?? ''),
      provider: 'ALCOR',
      tokenA: {
        symbol: String(p?.tokenA?.symbol || ''),
        contract: String(p?.tokenA?.contract || ''),
        reserve: reserveA,
        decimals: asNumber(p?.tokenA?.decimals),
      },
      tokenB: {
        symbol: String(p?.tokenB?.symbol || ''),
        contract: String(p?.tokenB?.contract || ''),
        reserve: reserveB,
        decimals: asNumber(p?.tokenB?.decimals),
      },
      liquidityUSD: asNumber(p?.tvlUSD),
      fee: asNumber(p?.fee || 3000),
    };
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
    if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) {
      return { output: 0, impact: 0 };
    }
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
        const existing = map.get(key) || { ...token, score: 0 };
        existing.score += pool.liquidityUSD;
        map.set(key, existing);
      }
    }
    state.tokens = [...map.values()].sort((a, b) => {
      if (norm(a.symbol) === 'WAX') return -1;
      if (norm(b.symbol) === 'WAX') return 1;
      return b.score - a.score || a.symbol.localeCompare(b.symbol);
    });
  }

  function fillSelects() {
    const options = state.tokens.map((token) => {
      const label = `${token.symbol} — ${token.contract}`;
      return `<option value="${htmlEscape(token.symbol)}::${htmlEscape(token.contract)}">${htmlEscape(label)}</option>`;
    }).join('');
    els.tokenIn.innerHTML = options;
    els.tokenOut.innerHTML = options;

    const wax = state.tokens.find((t) => norm(t.symbol) === 'WAX' && t.contract === 'eosio.token');
    const tlm = state.tokens.find((t) => norm(t.symbol) === 'TLM' && t.contract === 'alien.worlds');
    if (wax) els.tokenIn.value = `${wax.symbol}::${wax.contract}`;
    if (tlm) els.tokenOut.value = `${tlm.symbol}::${tlm.contract}`;
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
      const q = quoteConstantProduct(amountIn, dir.reserveIn, dir.reserveOut, feeMultiplier(pool.fee));
      if (q.output > 0) direct.push({ type: 'direct', pool, output: q.output, impact: q.impact, hops: [pool], fee: feePercent(pool.fee) });
    }

    const bridges = [
      { symbol: 'WAX', contract: 'eosio.token' },
      { symbol: 'USDT', contract: 'eth.token' },
      { symbol: 'TLM', contract: 'alien.worlds' },
    ];

    const multi = [];
    for (const bridge of bridges) {
      if (sameToken(tokenIn, bridge) || sameToken(tokenOut, bridge)) continue;
      for (const first of pools) {
        const d1 = direction(first, tokenIn, bridge);
        if (!d1) continue;
        const q1 = quoteConstantProduct(amountIn, d1.reserveIn, d1.reserveOut, feeMultiplier(first.fee));
        if (q1.output <= 0) continue;
        for (const second of pools) {
          if (first.id === second.id) continue;
          const d2 = direction(second, bridge, tokenOut);
          if (!d2) continue;
          const q2 = quoteConstantProduct(q1.output, d2.reserveIn, d2.reserveOut, feeMultiplier(second.fee));
          if (q2.output > 0) {
            multi.push({ type: 'multi-hop', pool: second, output: q2.output, impact: q1.impact + q2.impact, hops: [first, second], fee: feePercent(first.fee) + feePercent(second.fee), bridge });
          }
        }
      }
    }

    const all = [...direct, ...multi].sort((a, b) => b.output - a.output);
    const best = all[0];
    return { amountIn, tokenIn, tokenOut, best, all };
  }

  function render() {
    if (!state.ready) return;
    const slippage = asNumber(els.slippage.value);
    const { amountIn, tokenIn, tokenOut, best, all } = findBestRoute();

    if (!amountIn || amountIn <= 0) {
      els.result.innerHTML = '<div class="muted">Enter an amount.</div>';
      return;
    }
    if (!best) {
      els.result.innerHTML = '<div class="bad">No route found for this pair at the selected TVL filter.</div>';
      return;
    }

    const minReceived = best.output * (1 - slippage);
    const routeNames = best.hops.map((p) => `${p.tokenA.symbol}/${p.tokenB.symbol}`).join(' → ');
    const poolIds = best.hops.map((p) => `#${p.id}`).join(', ');
    const topRows = all.slice(0, 4).map((r, idx) => `<div class="route"><strong>${idx === 0 ? 'Best' : `#${idx + 1}`}</strong><div><b>${htmlEscape(r.type)}</b><br><small>${htmlEscape(r.hops.map((p) => `${p.tokenA.symbol}/${p.tokenB.symbol}`).join(' → '))}</small><br><small>Output ${formatNumber(r.output)} · Impact ${formatNumber(r.impact, 4)}%</small></div></div>`).join('');
    const warn = best.impact > 5 ? '<div class="warning">High price impact. Reduce amount or check another route before using this quote.</div>' : '';

    els.result.innerHTML = `
      <div class="muted">Estimated output</div>
      <div class="big">${formatNumber(best.output)} ${htmlEscape(tokenOut.symbol)}</div>
      <div class="muted">For ${formatNumber(amountIn)} ${htmlEscape(tokenIn.symbol)}</div>
      <div class="stats">
        <div class="stat"><small>Route</small><b>${htmlEscape(best.type)}</b></div>
        <div class="stat"><small>Impact</small><b>${formatNumber(best.impact, 4)}%</b></div>
        <div class="stat"><small>Pool fee total</small><b>${formatNumber(best.fee, 4)}%</b></div>
        <div class="stat"><small>Min display after tolerance</small><b>${formatNumber(minReceived)}</b></div>
      </div>
      <div class="warning">Route: ${htmlEscape(routeNames)}<br>Pool IDs: ${htmlEscape(poolIds)}</div>
      ${warn}
      <div class="routes">${topRows}</div>
    `;
  }

  async function load() {
    try {
      const res = await fetch(ALCOR_POOLS_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Pool request failed: ${res.status}`);
      const raw = await res.json();
      state.pools = (Array.isArray(raw) ? raw : [])
        .map(mapPool)
        .filter((p) => p.id && p.tokenA.symbol && p.tokenB.symbol && p.tokenA.reserve > 0 && p.tokenB.reserve > 0 && p.liquidityUSD > 0);
      buildTokens();
      fillSelects();
      state.ready = true;
      render();
    } catch (err) {
      console.error(err);
      els.result.innerHTML = '<div class="bad">Pool data failed to load. Check browser console or CORS/network status.</div>';
    }
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

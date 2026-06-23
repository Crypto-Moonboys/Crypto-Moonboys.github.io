(() => {
  'use strict';

  const engine = window.WAX_ROUTE_ENGINE;
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
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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
        existing.score += pool.liquidityScore || pool.liquidityUSD || 0;
        existing.providers.add(pool.provider);
        map.set(key, existing);
      }
    }
    state.tokens = [...map.values()].map((t) => ({ ...t, providers: [...t.providers] })).sort((a, b) => {
      if (engine.normalize(a.symbol) === 'WAX') return -1;
      if (engine.normalize(b.symbol) === 'WAX') return 1;
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

    const wax = state.tokens.find((t) => engine.normalize(t.symbol) === 'WAX' && String(t.contract).toLowerCase() === 'eosio.token');
    const tlm = state.tokens.find((t) => engine.normalize(t.symbol) === 'TLM' && String(t.contract).toLowerCase() === 'alien.worlds');
    if (!els.tokenIn.value && wax) els.tokenIn.value = `${wax.symbol}::${wax.contract}`;
    if (!els.tokenOut.value && tlm) els.tokenOut.value = `${tlm.symbol}::${tlm.contract}`;
    if (!els.tokenOut.value && state.tokens[1]) els.tokenOut.value = `${state.tokens[1].symbol}::${state.tokens[1].contract}`;
  }

  function providerSummary() {
    const parts = ['ALCOR', 'TACO', 'NEFTY'].map((name) => `${name}: ${state.sourceCounts[name] || 0}`);
    const errors = Object.entries(state.sourceErrors).filter(([, v]) => v).map(([k]) => k);
    return `${parts.join(' · ')}${errors.length ? ` · Failed: ${errors.join(', ')}` : ''}`;
  }

  function routePoolLabel(pool) {
    return `${pool.provider} ${pool.tokenA.symbol}/${pool.tokenB.symbol}`;
  }

  function routePoolIds(route) {
    const pools = Array.isArray(route.routePools) ? route.routePools : [];
    if (!pools.length) return route.splits.map((s) => `${s.provider} #${s.poolId}`).join(', ');
    return pools.map((p) => `${p.provider} #${p.sourceId} (${p.liquidityBasis || 'score'})`).join(', ');
  }

  function render() {
    if (!state.ready) return;
    if (!engine) {
      els.result.innerHTML = '<div class="bad">Route engine failed to load.</div>';
      return;
    }

    const amountIn = asNumber(els.amount.value);
    const tokenIn = selectedToken(els.tokenIn);
    const tokenOut = selectedToken(els.tokenOut);
    const minLiquidityScore = asNumber(els.minLiquidity.value);
    const route = engine.findOptimalSplit(amountIn, tokenIn, tokenOut, state.pools, minLiquidityScore);
    const slippage = asNumber(els.slippage.value);

    if (!amountIn || amountIn <= 0) {
      els.result.innerHTML = `<div class="muted">Enter an amount.<br>${htmlEscape(providerSummary())}</div>`;
      return;
    }

    if (!route || route.type === 'none' || route.output <= 0) {
      els.result.innerHTML = `<div class="bad">No route found for this pair at the selected filter.</div><div class="warning">${htmlEscape(providerSummary())}</div>`;
      return;
    }

    const candidates = Array.isArray(route.candidates) ? route.candidates : [route];
    const minReceived = route.output * (1 - slippage);
    const routeNames = Array.isArray(route.routePools) && route.routePools.length
      ? route.routePools.map(routePoolLabel).join(' → ')
      : route.splits.map((s) => `${s.provider} #${s.poolId}`).join(' + ');
    const topRows = candidates.slice(0, 5).map((r, idx) => {
      const pools = Array.isArray(r.routePools) && r.routePools.length ? r.routePools.map(routePoolLabel).join(' → ') : r.splits.map((s) => `${s.provider} #${s.poolId}`).join(' + ');
      return `<div class="route"><strong>${idx === 0 ? 'Best' : `#${idx + 1}`}</strong><div><b>${htmlEscape(r.type)} · ${htmlEscape(r.provider)}</b><br><small>${htmlEscape(pools)}</small><br><small>Output ${formatNumber(r.output)} · Impact ${formatNumber(r.impact, 4)}% · Saving ${formatNumber(r.savingsPct || 0, 4)}%</small></div></div>`;
    }).join('');
    const warn = route.impact > 5 ? '<div class="warning">High price impact. Reduce amount or check another route before using this quote.</div>' : '';

    els.result.innerHTML = `
      <div class="muted">Estimated output</div>
      <div class="big">${formatNumber(route.output)} ${htmlEscape(tokenOut.symbol)}</div>
      <div class="muted">For ${formatNumber(amountIn)} ${htmlEscape(tokenIn.symbol)}</div>
      <div class="stats">
        <div class="stat"><small>Route</small><b>${htmlEscape(route.type)}</b></div>
        <div class="stat"><small>Provider</small><b>${htmlEscape(route.provider)}</b></div>
        <div class="stat"><small>Sources loaded</small><b>${htmlEscape(providerSummary())}</b></div>
        <div class="stat"><small>Impact</small><b>${formatNumber(route.impact, 4)}%</b></div>
        <div class="stat"><small>Fee total</small><b>${formatNumber(route.feePercent, 4)}%</b></div>
        <div class="stat"><small>Minimum after tolerance</small><b>${formatNumber(minReceived)}</b></div>
        <div class="stat"><small>Minimum score</small><b>${formatNumber(minLiquidityScore)}</b></div>
        <div class="stat"><small>Candidate routes</small><b>${candidates.length}</b></div>
        <div class="stat"><small>Split</small><b>${route.split ? 'Yes' : 'No'}</b></div>
      </div>
      <div class="warning">Route: ${htmlEscape(routeNames)}<br>Pool IDs: ${htmlEscape(routePoolIds(route))}</div>
      ${warn}
      <div class="routes">${topRows}</div>
    `;
  }

  async function load() {
    if (!engine) {
      els.result.innerHTML = '<div class="bad">Route engine failed to load.</div>';
      return;
    }
    state.ready = false;
    els.result.innerHTML = '<div class="muted">Loading Alcor, Taco and Nefty pools...</div>';
    const result = await engine.fetchAllPools('wax');
    state.pools = result.pools || [];
    state.sourceCounts = result.sourceCounts || {};
    state.sourceErrors = result.sourceErrors || {};
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

  load().catch((err) => {
    console.error(err);
    els.result.innerHTML = '<div class="bad">Pool data failed to load. Check browser console or network status.</div>';
  });
})();

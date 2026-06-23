(() => {
  'use strict';

  const engine = window.WAX_ROUTE_ENGINE;
  const state = {
    pools: [],
    tokens: [],
    ready: false,
    loadedAt: null,
    sourceCounts: {},
    sourceErrors: {},
    copyStatus: '',
  };

  const els = {
    amount: document.getElementById('amountIn'),
    tokenIn: document.getElementById('tokenIn'),
    tokenOut: document.getElementById('tokenOut'),
    minLiquidity: document.getElementById('minLiquidity'),
    providerFilter: document.getElementById('providerFilter'),
    routeTypeFilter: document.getElementById('routeTypeFilter'),
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

  function optionValue(token) {
    return `${token.symbol}::${token.contract}`;
  }

  function optionExists(select, value) {
    if (!select || !value) return false;
    return Array.prototype.some.call(select.options || [], (option) => option.value === value);
  }

  function setSelectValue(select, value) {
    if (optionExists(select, value)) {
      select.value = value;
      return true;
    }
    return false;
  }

  function formatNumber(n, max = 8) {
    const value = asNumber(n);
    if (!value) return '0';
    if (Math.abs(value) >= 1000000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (Math.abs(value) >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: Math.min(max, 6) });
    return value.toLocaleString(undefined, { maximumSignificantDigits: max });
  }

  function formatLoadedAt() {
    if (!state.loadedAt) return 'not loaded';
    try {
      return state.loadedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
      return 'loaded';
    }
  }

  function readUrlState() {
    try {
      return new URLSearchParams(window.location.search || '');
    } catch (_) {
      return new URLSearchParams();
    }
  }

  function currentQuoteUrl() {
    try {
      return new URL(`${window.location.pathname}${window.location.search}`, window.location.origin).toString();
    } catch (_) {
      return `${window.location.pathname}${window.location.search}`;
    }
  }

  function writeUrlState() {
    if (!window.history || !window.location) return;
    const params = new URLSearchParams();
    if (els.amount.value) params.set('amount', els.amount.value);
    if (els.tokenIn.value) params.set('in', els.tokenIn.value);
    if (els.tokenOut.value) params.set('out', els.tokenOut.value);
    if (els.providerFilter?.value && els.providerFilter.value !== 'ALL') params.set('provider', els.providerFilter.value);
    if (els.routeTypeFilter?.value && els.routeTypeFilter.value !== 'ALL') params.set('route', els.routeTypeFilter.value);
    if (els.minLiquidity?.value && els.minLiquidity.value !== '10') params.set('min', els.minLiquidity.value);
    if (els.slippage?.value && els.slippage.value !== '0.01') params.set('slippage', els.slippage.value);
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash || ''}`) {
      window.history.replaceState(null, '', nextUrl);
    }
  }

  function actionsHtml() {
    const status = state.copyStatus ? `<small class="muted">${htmlEscape(state.copyStatus)}</small>` : '';
    return `<div class="warning"><button type="button" data-quote-action="copy-link">Copy quote link</button> <button type="button" data-quote-action="reset-controls">Reset controls</button>${status ? `<br>${status}` : ''}</div>`;
  }

  async function copyCurrentQuoteUrl() {
    const url = currentQuoteUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        state.copyStatus = 'Quote link copied.';
      } else {
        state.copyStatus = url;
      }
    } catch (_) {
      state.copyStatus = url;
    }
    render();
  }

  function resetControls() {
    state.copyStatus = '';
    els.amount.value = '10';
    if (els.providerFilter) els.providerFilter.value = 'ALL';
    if (els.routeTypeFilter) els.routeTypeFilter.value = 'ALL';
    if (els.minLiquidity) els.minLiquidity.value = '10';
    if (els.slippage) els.slippage.value = '0.01';
    buildTokens();
    fillSelects();
    writeUrlState();
    render();
  }

  function activePools() {
    const provider = String(els.providerFilter?.value || 'ALL').toUpperCase();
    if (provider === 'ALL') return state.pools;
    return state.pools.filter((pool) => pool.provider === provider);
  }

  function sourceCountsForPools(pools) {
    return pools.reduce((acc, pool) => {
      acc[pool.provider] = (acc[pool.provider] || 0) + 1;
      return acc;
    }, {});
  }

  function buildTokens() {
    const map = new Map();
    for (const pool of activePools()) {
      for (const token of [pool.tokenA, pool.tokenB]) {
        const key = optionValue(token);
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

  function setSelectFallbacks(currentIn, currentOut) {
    const values = new Set(state.tokens.map(optionValue));
    const wax = state.tokens.find((t) => engine.normalize(t.symbol) === 'WAX' && String(t.contract).toLowerCase() === 'eosio.token');
    const tlm = state.tokens.find((t) => engine.normalize(t.symbol) === 'TLM' && String(t.contract).toLowerCase() === 'alien.worlds');
    const first = state.tokens[0] ? optionValue(state.tokens[0]) : '';
    const second = state.tokens[1] ? optionValue(state.tokens[1]) : first;

    els.tokenIn.value = values.has(currentIn) ? currentIn : (wax ? optionValue(wax) : first);
    els.tokenOut.value = values.has(currentOut) ? currentOut : (tlm ? optionValue(tlm) : second);

    if (els.tokenIn.value && els.tokenIn.value === els.tokenOut.value && second && second !== els.tokenIn.value) {
      els.tokenOut.value = second;
    }
  }

  function fillSelects() {
    const currentIn = els.tokenIn.value;
    const currentOut = els.tokenOut.value;
    const options = state.tokens.map((token) => {
      const label = `${token.symbol} — ${token.contract} (${token.providers.join('/')})`;
      return `<option value="${htmlEscape(optionValue(token))}">${htmlEscape(label)}</option>`;
    }).join('');
    els.tokenIn.innerHTML = options;
    els.tokenOut.innerHTML = options;
    setSelectFallbacks(currentIn, currentOut);
  }

  function applyUrlState() {
    const params = readUrlState();
    const amount = params.get('amount');
    if (amount != null && amount.trim()) els.amount.value = amount.trim();
    setSelectValue(els.providerFilter, String(params.get('provider') || '').toUpperCase());
    setSelectValue(els.routeTypeFilter, params.get('route'));
    setSelectValue(els.minLiquidity, params.get('min'));
    setSelectValue(els.slippage, params.get('slippage'));
    buildTokens();
    fillSelects();
    setSelectValue(els.tokenIn, params.get('in'));
    setSelectValue(els.tokenOut, params.get('out'));
    if (els.tokenIn.value && els.tokenIn.value === els.tokenOut.value) {
      setSelectFallbacks('', els.tokenOut.value);
    }
  }

  function providerSummary(pools = activePools()) {
    const counts = sourceCountsForPools(pools);
    const parts = ['ALCOR', 'TACO', 'NEFTY'].map((name) => `${name}: ${counts[name] || 0}/${state.sourceCounts[name] || 0}`);
    const errors = Object.entries(state.sourceErrors).filter(([, v]) => v).map(([k]) => k);
    return `${parts.join(' · ')}${errors.length ? ` · Failed: ${errors.join(', ')}` : ''}`;
  }

  function sourceErrorHtml() {
    const entries = Object.entries(state.sourceErrors).filter(([, message]) => message);
    if (!entries.length) return '';
    return '<div class="warning">Source warnings: ' + entries
      .map(([source, message]) => `${htmlEscape(source)}: ${htmlEscape(String(message).slice(0, 120))}`)
      .join(' · ') + '</div>';
  }

  function routeQuality(route) {
    if (!route || route.type === 'none') return 'No route';
    if (route.impact >= 10) return 'Very high impact';
    if (route.impact >= 5) return 'High impact';
    if (route.impact >= 2) return 'Moderate impact';
    return 'Low impact';
  }

  function routePoolLabel(pool) {
    return `${pool.provider} ${pool.tokenA.symbol}/${pool.tokenB.symbol}`;
  }

  function routePoolIds(route) {
    const pools = Array.isArray(route.routePools) ? route.routePools : [];
    if (!pools.length) return route.splits.map((s) => `${s.provider} #${s.poolId}`).join(', ');
    return pools.map((p) => `${p.provider} #${p.sourceId} (${p.liquidityBasis || 'score'})`).join(', ');
  }

  function applyRouteTypeFilter(route) {
    const wanted = String(els.routeTypeFilter?.value || 'ALL');
    if (wanted === 'ALL' || !route || !Array.isArray(route.candidates)) return route;
    const selected = route.candidates.find((candidate) => candidate.type === wanted);
    if (!selected) {
      return { type: 'none', output: 0, candidates: route.candidates, splits: [], routePools: [], provider: 'NO ROUTE', split: false, impact: 0, feePercent: 0 };
    }
    selected.candidates = route.candidates;
    return selected;
  }

  function noRouteDetails(route, pools) {
    const wanted = String(els.routeTypeFilter?.value || 'ALL');
    const availableTypes = Array.isArray(route?.candidates)
      ? [...new Set(route.candidates.map((candidate) => candidate.type))]
      : [];
    const details = [
      `Filters: ${String(els.providerFilter?.value || 'ALL')} · ${wanted} · min score ${asNumber(els.minLiquidity.value)}`,
      `Pools used: ${pools.length}`,
    ];
    if (wanted !== 'ALL' && availableTypes.length) {
      details.push(`Available route types: ${availableTypes.join(', ')}`);
    }
    return details.join(' | ');
  }

  function render() {
    if (!state.ready) return;
    if (!engine) {
      els.result.innerHTML = '<div class="bad">Route engine failed to load.</div>';
      return;
    }

    const pools = activePools();
    const amountIn = asNumber(els.amount.value);
    const tokenIn = selectedToken(els.tokenIn);
    const tokenOut = selectedToken(els.tokenOut);
    const minLiquidityScore = asNumber(els.minLiquidity.value);
    const route = applyRouteTypeFilter(engine.findOptimalSplit(amountIn, tokenIn, tokenOut, pools, minLiquidityScore));
    const slippage = asNumber(els.slippage.value);
    writeUrlState();

    if (!amountIn || amountIn <= 0) {
      els.result.innerHTML = `${actionsHtml()}<div class="muted">Enter an amount.<br>${htmlEscape(providerSummary(pools))}<br>Loaded: ${htmlEscape(formatLoadedAt())}</div>${sourceErrorHtml()}`;
      return;
    }

    if (!route || route.type === 'none' || route.output <= 0) {
      els.result.innerHTML = `${actionsHtml()}<div class="bad">No route found for this pair at the selected filters.</div><div class="warning">${htmlEscape(providerSummary(pools))}<br>${htmlEscape(noRouteDetails(route, pools))}<br>Loaded: ${htmlEscape(formatLoadedAt())}</div>${sourceErrorHtml()}`;
      return;
    }

    const candidates = Array.isArray(route.candidates) ? route.candidates : [route];
    const minReceived = route.output * (1 - slippage);
    const routeNames = Array.isArray(route.routePools) && route.routePools.length
      ? route.routePools.map(routePoolLabel).join(' → ')
      : route.splits.map((s) => `${s.provider} #${s.poolId}`).join(' + ');
    const topRows = candidates.slice(0, 6).map((r, idx) => {
      const routePools = Array.isArray(r.routePools) && r.routePools.length ? r.routePools.map(routePoolLabel).join(' → ') : r.splits.map((s) => `${s.provider} #${s.poolId}`).join(' + ');
      const active = r === route ? ' · selected' : '';
      return `<div class="route"><strong>${idx === 0 ? 'Best' : `#${idx + 1}`}</strong><div><b>${htmlEscape(r.type)} · ${htmlEscape(r.provider)}${active}</b><br><small>${htmlEscape(routePools)}</small><br><small>Output ${formatNumber(r.output)} · Impact ${formatNumber(r.impact, 4)}% · Saving ${formatNumber(r.savingsPct || 0, 4)}%</small></div></div>`;
    }).join('');
    const warn = route.impact > 5 ? '<div class="warning">High price impact. Reduce amount or check another route before using this quote.</div>' : '';

    els.result.innerHTML = `
      ${actionsHtml()}
      <div class="muted">Estimated output</div>
      <div class="big">${formatNumber(route.output)} ${htmlEscape(tokenOut.symbol)}</div>
      <div class="muted">For ${formatNumber(amountIn)} ${htmlEscape(tokenIn.symbol)}</div>
      <div class="stats">
        <div class="stat"><small>Route</small><b>${htmlEscape(route.type)}</b></div>
        <div class="stat"><small>Provider</small><b>${htmlEscape(route.provider)}</b></div>
        <div class="stat"><small>Quality</small><b>${htmlEscape(routeQuality(route))}</b></div>
        <div class="stat"><small>Sources active / loaded</small><b>${htmlEscape(providerSummary(pools))}</b></div>
        <div class="stat"><small>Impact</small><b>${formatNumber(route.impact, 4)}%</b></div>
        <div class="stat"><small>Fee total</small><b>${formatNumber(route.feePercent, 4)}%</b></div>
        <div class="stat"><small>Minimum after tolerance</small><b>${formatNumber(minReceived)}</b></div>
        <div class="stat"><small>Minimum score</small><b>${formatNumber(minLiquidityScore)}</b></div>
        <div class="stat"><small>Candidate routes</small><b>${candidates.length}</b></div>
        <div class="stat"><small>Split</small><b>${route.split ? 'Yes' : 'No'}</b></div>
        <div class="stat"><small>Pool records used</small><b>${pools.length}</b></div>
        <div class="stat"><small>Loaded</small><b>${htmlEscape(formatLoadedAt())}</b></div>
      </div>
      <div class="warning">Route: ${htmlEscape(routeNames)}<br>Pool IDs: ${htmlEscape(routePoolIds(route))}</div>
      ${warn}
      ${sourceErrorHtml()}
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
    state.loadedAt = new Date();
    applyUrlState();
    state.ready = true;
    render();
  }

  for (const el of [els.amount, els.tokenIn, els.tokenOut, els.minLiquidity, els.providerFilter, els.routeTypeFilter, els.slippage]) {
    if (!el) continue;
    el.addEventListener('input', () => {
      state.copyStatus = '';
      if (el === els.providerFilter) {
        buildTokens();
        fillSelects();
      }
      render();
    });
    el.addEventListener('change', () => {
      state.copyStatus = '';
      if (el === els.providerFilter) {
        buildTokens();
        fillSelects();
      }
      render();
    });
  }

  els.result.addEventListener('click', (event) => {
    const button = event.target.closest('[data-quote-action]');
    if (!button) return;
    const action = button.getAttribute('data-quote-action');
    if (action === 'copy-link') copyCurrentQuoteUrl();
    if (action === 'reset-controls') resetControls();
  });

  els.quoteBtn.addEventListener('click', load);
  els.switchBtn.addEventListener('click', () => {
    state.copyStatus = '';
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

/**
 * waxonedge.js
 *
 * WAXONEDGE — read-only WAX token, pool, pair, and DEX analytics.
 *
 * Safety contract:
 *  - ZERO wallet signing, ZERO transaction submission, ZERO private-key handling.
 *  - All data is fetched from public, unauthenticated read-only APIs.
 *  - No swap buttons, no liquidity action buttons, no "Connect Wallet" flows.
 */

/* global
   WAXONEDGE_ALCOR_API, WAXONEDGE_WAX_RPC, WAXONEDGE_WAX_RPC_FALLBACKS,
   WAXONEDGE_NEFTY_CONTRACT, WAXONEDGE_WAXBLOCK_BASE,
   WAXONEDGE_SOURCES, WAXONEDGE_ALCOR_PATHS, WAXONEDGE_RPC_PATHS,
   WAXONEDGE_NEFTY_TABLES,
   LightweightCharts
*/

(function () {
  'use strict';

  var UNAVAILABLE_TEXT = 'Unavailable';
  var INDEXED_BACKEND_TEXT = 'Requires indexed backend';
  var SOURCE_NOT_INDEXED_TEXT = 'Source not indexed yet';
  var WAXONEDGE_FEATURED_TOKENS = Array.isArray(window.WAXONEDGE_FEATURED_TOKENS)
    ? window.WAXONEDGE_FEATURED_TOKENS
    : [];
  var WAXONEDGE_FEATURED_TOKEN_MAP = WAXONEDGE_FEATURED_TOKENS.reduce(function (acc, token) {
    acc[token.key] = token;
    return acc;
  }, {});

  var state = {
    tokens: [],
    pairs: [],
    tickers: [],
    globalAnalytics: null,
    pairIndex: { tokenPairCounts: {}, marketIdsBySymbol: {} },
    tokenMap: { byKey: {}, bySymbol: {} },
    alcorMarkets: [],
    neftyMarkets: [],
    neftyDetectedTables: [],
    neftyTableUsed: '',
    selected: { symbol: '', contract: '', key: '' },
    selectedPair: null,
    missingFeaturedLogged: {},
    summary: {},
    sources: {},
    filters: {
      query: '',
      source: '',
      bubbleMetric: 'liquidity',
    },
    chainStatCache: {},
    chainStatPending: {},
    chartCache: {},
    chartPending: {},
    tokenDetailCache: {},
    tokenPairCache: {},
    tokenChartCache: {},
    tokenBackendPending: {},
    backend: {
      ok: false,
      mode: 'pending',
      updatedAt: null,
      warnings: [],
      sources: {},
    },
  };

  /* ── Utilities ──────────────────────────────────────────────── */

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(n, decimals) {
    var d = decimals == null ? 2 : decimals;
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(d) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(d) + 'K';
    return Number(n).toFixed(d);
  }

  function fmtPrice(n) {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1000) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(4);
    if (Math.abs(n) >= 0.0001) return n.toFixed(6);
    return n.toExponential(4);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '—';
    var sign = n > 0 ? '+' : '';
    return sign + Number(n).toFixed(2) + '%';
  }

  function pctClass(n) {
    if (n == null || isNaN(n)) return '';
    return n > 0 ? 'woe-pos' : n < 0 ? 'woe-neg' : '';
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function hasElement(id) {
    return !!document.getElementById(id);
  }

  function setStatus(id, stateName) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'woe-status-dot woe-status-' + stateName;
    el.title = stateName;
  }

  function asNum(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(n) ? null : n;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function normalizeSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase();
  }

  function normalizeContract(contract) {
    return String(contract || '').trim().toLowerCase();
  }

  function tokenKey(contract, symbol) {
    var c = normalizeContract(contract);
    var s = normalizeSymbol(symbol);
    return c && s ? c + '::' + s : '';
  }

  function parseAssetSymbol(asset) {
    var match = String(asset || '').trim().match(/^[\d.+-]+\s+([A-Z0-9._-]+)$/);
    return match ? match[1] : '';
  }

  function parseAsset(asset) {
    var raw = String(asset || '').trim();
    var match = raw.match(/^([+-]?\d+(?:\.\d+)?)\s+([A-Z0-9._-]+)$/);
    if (!match) {
      return {
        raw: raw,
        amount: asNum(raw),
        symbol: '',
        precision: null,
      };
    }
    return {
      raw: raw,
      amount: asNum(match[1]),
      symbol: normalizeSymbol(match[2]),
      precision: match[1].indexOf('.') === -1 ? 0 : match[1].split('.')[1].length,
    };
  }

  function pairLabel(left, right) {
    var a = normalizeSymbol(left);
    var b = normalizeSymbol(right);
    return a && b ? a + '/' + b : '';
  }

  function normalizePairLabel(label) {
    return String(label || '').trim().replace(/\s+/g, '').toUpperCase();
  }

  function uniqueList(values) {
    return values.filter(function (value, index, list) {
      return value && list.indexOf(value) === index;
    });
  }

  function fmtDate(ts) {
    try {
      return new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch (_) {
      return '—';
    }
  }

  function formatAvailabilityText(text) {
    return text || UNAVAILABLE_TEXT;
  }

  function availabilityHtml(text) {
    return '<span class="woe-unavailable">' + escHtml(formatAvailabilityText(text)) + '</span>';
  }

  function formatDualMetric(waxValue, usdValue, waxSuffix, usdPrefix) {
    var parts = [];
    if (waxValue != null && !isNaN(waxValue)) {
      parts.push(fmtNum(waxValue) + ' ' + (waxSuffix || 'WAX'));
    }
    if (usdValue != null && !isNaN(usdValue)) {
      parts.push((usdPrefix || '$') + fmtNum(usdValue));
    }
    return parts.length ? parts.join(' · ') : UNAVAILABLE_TEXT;
  }

  function formatFeeTier(value) {
    var fee = asNum(value);
    if (fee == null) return UNAVAILABLE_TEXT;
    if (fee > 1) return fee + ' bps';
    return (fee * 100).toFixed(2) + '%';
  }

  function getShortLabel(label, fallback) {
    var clean = String(label || fallback || '?').trim();
    return clean ? clean.slice(0, 2).toUpperCase() : '??';
  }

  function iconPlaceholderHtml(label, variant) {
    var variantClass = variant ? ' woe-icon-placeholder-' + variant : '';
    return '<span class="woe-icon-placeholder' + variantClass + '" aria-hidden="true">' + escHtml(getShortLabel(label)) + '</span>';
  }

  function tokenCellHtml(side) {
    var symbol = side && side.symbol ? side.symbol : 'Unknown';
    var contractHtml = side && side.contract
      ? escHtml(side.contract)
      : availabilityHtml();
    return '<div class="woe-token-cell">' +
      iconPlaceholderHtml(symbol, 'token') +
      '<div class="woe-token-cell-copy">' +
        '<strong class="woe-token-cell-symbol">' + escHtml(symbol) + '</strong>' +
        '<span class="woe-token-cell-contract">' + contractHtml + '</span>' +
      '</div>' +
    '</div>';
  }

  function sourceCellHtml(market) {
    var label = market && market.source ? market.source : 'Source';
    var adapter = market && market.adapter ? String(market.adapter) : '';
    var meta = market && market.sourceMeta ? market.sourceMeta : '';
    var metaHtml = adapter && adapter !== label
      ? '<span class="woe-source-adapter">' + escHtml(adapter) + '</span>'
      : '';
    if (meta && !/Alcor REST \/pairs \+ \/tickers/i.test(meta)) {
      metaHtml += '<span class="woe-source-meta">' + escHtml(meta) + '</span>';
    }
    return '<div class="woe-source-cell">' +
      '<span class="woe-dex-badge">' + escHtml(getDexShortLabel(label)) + '</span>' +
      '<div class="woe-source-cell-copy">' +
        '<strong>' + escHtml(label) + '</strong>' +
        metaHtml +
      '</div>' +
    '</div>';
  }

  function getDexShortLabel(label) {
    var normalized = String(label || '').toLowerCase();
    if (normalized === 'alcor') return 'alcor';
    if (normalized === 'swap.alcor') return 'swap.alcor';
    if (normalized === 'swap.taco') return 'swap.taco';
    if (normalized === 'swap.nefty') return 'swap.nefty';
    if (normalized === 'swap.box') return 'swap.box';
    if (normalized.indexOf('taco') !== -1) return 'swap.taco';
    if (normalized.indexOf('nefty') !== -1) return 'swap.nefty';
    if (normalized.indexOf('box') !== -1) return 'swap.box';
    if (normalized.indexOf('alcor') !== -1) return 'alcor';
    return label || 'DEX';
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
    if (!side) {
      return {
        symbol: '',
        contract: '',
        key: '',
        quantity: '',
        amount: null,
        label: UNAVAILABLE_TEXT,
      };
    }

    if (typeof side === 'string') {
      var parsedString = parseAsset(side);
      var stringSymbol = parsedString.symbol || normalizeSymbol(side);
      return {
        symbol: stringSymbol,
        contract: '',
        key: tokenKey('', stringSymbol),
        quantity: parsedString.raw,
        amount: parsedString.amount,
        label: stringSymbol || parsedString.raw || UNAVAILABLE_TEXT,
      };
    }

    var quantity = side.quantity || side.reserve || side.amount || side.balance || side.value || '';
    var parsed = parseAsset(quantity);
    var symbol = normalizeSymbol(
      getSymbolValue(side.symbol) ||
      side.currency ||
      side.token_symbol ||
      side.sym ||
      parsed.symbol
    );
    var contract = normalizeContract(
      side.contract ||
      side.contract_name ||
      side.code ||
      side.token_contract ||
      side.scope
    );
    var label = symbol && contract ? symbol + ' @ ' + contract : symbol || contract || parsed.raw || UNAVAILABLE_TEXT;
    return {
      symbol: symbol,
      contract: contract,
      key: tokenKey(contract, symbol),
      quantity: parsed.raw || String(quantity || ''),
      amount: parsed.amount,
      label: label,
    };
  }

  function describeToken(side) {
    return side && side.label ? side.label : UNAVAILABLE_TEXT;
  }

  /** Generic JSON fetch with timeout (ms). Returns null on error. */
  function apiFetch(url, timeoutMs, options) {
    var ms = timeoutMs || 10000;
    return new Promise(function (resolve) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        resolve(null);
      }, ms);
      var opts = options ? Object.assign({}, options) : {};
      if (controller) opts.signal = controller.signal;
      fetch(url, opts)
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) {
            resolve(null);
            return;
          }
          return r.json();
        })
        .then(function (data) { resolve(data || null); })
        .catch(function () {
          clearTimeout(timer);
          resolve(null);
        });
    });
  }

  function waxonedgeApi(path) {
    return apiFetch('/api/waxonedge' + path, 12000);
  }

  function backendSourceMeta(source) {
    var key = normalizeContract(source || '');
    var map = {
      alcor: { label: 'Alcor API', meta: 'Alcor REST /pairs + /tickers', sort: 1, explorer: 'https://wax.alcor.exchange', explorerLabel: 'Alcor' },
      'swap.alcor': { label: 'swap.alcor', meta: 'swap.alcor ABI-indexed pools', sort: 2, explorer: 'https://waxblock.io/account/swap.alcor', explorerLabel: 'WaxBlock' },
      'swap.taco': { label: 'swap.taco', meta: 'swap.taco ABI-indexed pairs', sort: 3, explorer: 'https://waxblock.io/account/swap.taco', explorerLabel: 'WaxBlock' },
      'swap.nefty': { label: 'swap.nefty', meta: 'swap.nefty ABI-indexed pairs', sort: 4, explorer: 'https://waxblock.io/account/swap.nefty', explorerLabel: 'WaxBlock' },
      'swap.box': { label: 'swap.box', meta: 'swap.box ABI-indexed pairs', sort: 5, explorer: 'https://waxblock.io/account/swap.box', explorerLabel: 'WaxBlock' },
    };
    return map[key] || { label: source || 'Source', meta: 'Indexed backend adapter', sort: 10, explorer: 'https://waxblock.io/account/' + encodeURIComponent(source || ''), explorerLabel: 'WaxBlock' };
  }

  function mapBackendToken(row) {
    return {
      id: row.symbol,
      symbol: row.symbol,
      contract: row.contract,
      decimals: row.decimals,
      total_supply: row.total_supply,
      max_supply: row.max_supply,
      system_price: row.price_wax,
      usd_price: row.price_usd,
      selected_price_wax: row.selected_price_wax,
      selected_price_usd: row.selected_price_usd,
      holder_count: row.holder_count,
      circulating_supply: row.circulating_supply,
      fdv_wax: row.fdv_wax,
      fdv_usd: row.fdv_usd,
      pair_count: row.pair_count,
      icon_url: row.icon_url,
      updated_at: row.updated_at,
      volume_24h: row.volume_24h,
      volume_24h_wax: row.volume_24h_wax,
      volume_24h_usd: row.volume_24h_usd,
      change_24h: row.change_24h,
      volume_7d: row.volume_7d,
      volume_30d: row.volume_30d,
      liquidity_wax: row.liquidity_wax,
      liquidity_usd: row.liquidity_usd,
      tvl_wax: row.tvl_wax,
      tvl_usd: row.tvl_usd,
      selected_price_confidence: row.selected_price_confidence,
      liquidity_confidence: row.liquidity_confidence,
      tvl_confidence: row.tvl_confidence,
      metric_status: row.metric_status,
      metric_reason_codes: row.metric_reason_codes,
      unavailable_reasons: row.unavailable_reasons,
      selected_pair_source: row.selected_pair_source,
      selected_pair_id: row.selected_pair_id,
      source_count: row.source_count,
      indexed_pair_count: row.indexed_pair_count,
      source_keys: row.source_keys,
      aggregate_complete: row.aggregate_complete,
      aggregate_sources_required: row.aggregate_sources_required,
      aggregate_sources_present: row.aggregate_sources_present,
      aggregate_sources_processed: row.aggregate_sources_processed,
      aggregate_sources_failed: row.aggregate_sources_failed,
      aggregate_truncated: row.aggregate_truncated,
      aggregate_sources_truncated: row.aggregate_sources_truncated,
    };
  }

  function assetFromAmount(amount, symbol) {
    if (amount == null || amount === '') return '';
    return String(amount) + (symbol ? ' ' + normalizeSymbol(symbol) : '');
  }

  function mapBackendPair(row) {
    var sourceMeta = backendSourceMeta(row.source);
    return {
      id: row.pair_id,
      fee: row.fee_bps,
      pool1: {
        contract: row.token_a_contract,
        symbol: row.token_a_symbol,
        quantity: assetFromAmount(row.reserve_a, row.token_a_symbol),
      },
      pool2: {
        contract: row.token_b_contract,
        symbol: row.token_b_symbol,
        quantity: assetFromAmount(row.reserve_b, row.token_b_symbol),
      },
      source: sourceMeta.label,
      sourceMeta: sourceMeta.meta,
      sourceSort: sourceMeta.sort,
      rawSource: row.source,
      adapter: row.source || sourceMeta.label,
      explorerUrl: sourceMeta.explorer,
      explorerLabel: sourceMeta.explorerLabel,
      currentPrice: row.price,
      currentPriceText: row.price != null ? String(row.price) + (row.token_b_symbol ? ' ' + normalizeSymbol(row.token_b_symbol) : '') : UNAVAILABLE_TEXT,
      change24: row.change_24h,
      rawVolume24: row.volume_24h,
      volume24: asNum(row.volume_24h_wax),
      volume24Usd: asNum(row.volume_24h_usd),
      volume24Text: row.volume_24h_wax != null ? String(row.volume_24h_wax) + ' WAX' : UNAVAILABLE_TEXT,
      volume7dText: INDEXED_BACKEND_TEXT,
      volume30dText: INDEXED_BACKEND_TEXT,
      liquidityWax: row.liquidity_wax,
      liquidityUsd: row.liquidity_usd,
      liquidityText: formatDualMetric(asNum(row.liquidity_wax), asNum(row.liquidity_usd)),
      pooledTokenAText: assetFromAmount(row.reserve_a, row.token_a_symbol) || UNAVAILABLE_TEXT,
      pooledTokenBText: assetFromAmount(row.reserve_b, row.token_b_symbol) || UNAVAILABLE_TEXT,
    };
  }

  function mapBackendTicker(row) {
    return {
      market_id: row.pair_id,
      last_price: row.price,
      change24: row.change_24h,
      base_volume: row.volume_24h_wax,
    };
  }

  function markBackendSourceStatus(sourceState) {
    var sourceMap = sourceState || {};
    [
      ['alcor-tokens', 'alcor_tokens'],
      ['alcor-pairs', 'alcor_pairs'],
      ['alcor-tickers', 'alcor_tickers'],
      ['alcor-analytics', 'alcor_global'],
      ['swap-alcor', 'swap_alcor_pools'],
      ['swap-taco', 'swap_taco_pairs'],
      ['nefty-contract', 'swap_nefty_pairs'],
      ['swap-box', 'swap_box_pairs'],
    ].forEach(function (pair) {
      var item = sourceMap[pair[1]];
      if (item) setStatus('src-dot-' + pair[0], item.indexed ? 'ok' : 'error');
    });
    setStatus('src-dot-wax-rpc', (
      (sourceMap.swap_alcor_abi && sourceMap.swap_alcor_abi.indexed) ||
      (sourceMap.swap_taco_abi && sourceMap.swap_taco_abi.indexed) ||
      (sourceMap.swap_nefty_abi && sourceMap.swap_nefty_abi.indexed) ||
      (sourceMap.swap_box_abi && sourceMap.swap_box_abi.indexed)
    ) ? 'ok' : 'checking');
    setStatus('src-dot-hyperion', 'checking');
    renderAdapterStrip(sourceMap);
  }

  function renderAdapterStrip(sourceState) {
    var sourceMap = sourceState || {};
    if (state.backend.mode === 'diagnostic-fallback') {
      setHtml('woe-adapter-strip',
        '<span class="woe-adapter-pill is-pending">Diagnostic fallback active</span>' +
        '<span class="woe-adapter-pill is-pending">Backend adapter status unavailable</span>');
      return;
    }
    var adapters = [
      ['Alcor', 'alcor_pairs'],
      ['swap.alcor', 'swap_alcor_pools'],
      ['swap.taco', 'swap_taco_pairs'],
      ['swap.nefty', 'swap_nefty_pairs'],
      ['swap.box', 'swap_box_pairs'],
      ['token aggregates', 'token_aggregates'],
    ];
    var html = adapters.map(function (adapter) {
      var item = sourceMap[adapter[1]];
      var indexed = item && item.indexed;
      var label = adapter[0] + ': ' + (indexed ? 'indexed' : 'not indexed');
      return '<span class="woe-adapter-pill ' + (indexed ? 'is-indexed' : 'is-pending') + '">' + escHtml(label) + '</span>';
    }).join('');
    setHtml('woe-adapter-strip', html || '<span class="woe-adapter-pill is-pending">Source status unavailable</span>');
  }

  function getTokenMetric(token, field) {
    if (!token) return null;
    var raw = token.raw || token;
    var value = token[field] != null ? token[field] : raw[field];
    return asNum(value);
  }

  function getTokenDisplay(token) {
    if (!token) return UNAVAILABLE_TEXT;
    var symbol = normalizeSymbol(token.symbol || token.id);
    var contract = normalizeContract(token.contract);
    return symbol && contract ? symbol + ' @ ' + contract : symbol || contract || UNAVAILABLE_TEXT;
  }

  function marketLiquiditySort(market) {
    return market && market.liquidityUsd != null ? market.liquidityUsd : (market && market.liquidityWax != null ? market.liquidityWax : 0);
  }

  function marketVolumeSort(market) {
    return market && market.volume24 != null ? market.volume24 : 0;
  }

  function renderMiniTokenList(tokens) {
    if (!tokens.length) return '<p class="woe-unavailable">Unavailable</p>';
    return tokens.map(function (token, index) {
      var symbol = normalizeSymbol(token.symbol || token.id);
      var contract = normalizeContract(token.contract);
      var volume = getTokenMetric(token, 'volume_24h');
      var liquidityWax = getTokenMetric(token, 'liquidity_wax');
      var liquidityUsd = getTokenMetric(token, 'liquidity_usd');
      return '<a class="woe-mini-row woe-token-detail-link" href="' + escHtml(buildTokenHref(symbol, contract)) + '"' +
        ' data-token="' + escHtml(symbol) + '" data-contract="' + escHtml(contract) + '">' +
        '<span class="woe-mini-rank">#' + escHtml(String(index + 1)) + '</span>' +
        '<strong>' + escHtml(symbol || '?') + '</strong>' +
        '<span>' + escHtml(volume != null ? fmtNum(volume) + ' 24h vol' : '24h vol unavailable') + '</span>' +
        '<em>' + escHtml(formatDualMetric(liquidityWax, liquidityUsd)) + '</em>' +
      '</a>';
    }).join('');
  }

  function renderMiniPairList(markets) {
    if (!markets.length) return '<p class="woe-unavailable">Unavailable</p>';
    return markets.map(function (market, index) {
      return '<div class="woe-mini-row">' +
        '<span class="woe-mini-rank">#' + escHtml(String(index + 1)) + '</span>' +
        '<strong>' + escHtml((market.tokenA.symbol || '?') + '/' + (market.tokenB.symbol || '?')) + '</strong>' +
        '<span>' + escHtml(market.source || 'Source') + '</span>' +
        '<em>' + escHtml(market.volume24 != null ? market.volume24Text : '24h vol unavailable') + '</em>' +
      '</div>';
    }).join('');
  }

  function renderDashboard() {
    var markets = getAllMarkets();
    var indexedMarkets = markets.filter(function (market) {
      return market.marketId || marketLiquiditySort(market) > 0 || marketVolumeSort(market) > 0;
    });
    var sourceMap = state.backend.sources || {};
    var adapterKeys = ['alcor_pairs', 'swap_alcor_pools', 'swap_taco_pairs', 'swap_nefty_pairs', 'swap_box_pairs'];
    var activeAdapters = state.backend.mode === 'backend'
      ? adapterKeys.filter(function (key) { return sourceMap[key] && sourceMap[key].indexed; }).length
      : uniqueList(indexedMarkets.map(function (market) { return market.adapter; })).length;
    var totalLiquidityWax = sumMetric(indexedMarkets, 'liquidityWax');
    var totalLiquidityUsd = sumMetric(indexedMarkets, 'liquidityUsd');
    var topTokens = (state.tokens || []).filter(function (token) {
      var isNativeWax = tokenKey(token.contract, token.symbol || token.id) === WAX_NATIVE_KEY;
      var hasRealSignal = getTokenMetric(token, 'volume_24h') > 0 || getTokenMetric(token, 'liquidity_wax') > 0 || getTokenMetric(token, 'liquidity_usd') > 0;
      return !isNativeWax && hasRealSignal;
    }).sort(function (a, b) {
      return (getTokenMetric(b, 'volume_24h') || 0) - (getTokenMetric(a, 'volume_24h') || 0) ||
        (getTokenMetric(b, 'liquidity_usd') || getTokenMetric(b, 'liquidity_wax') || 0) -
        (getTokenMetric(a, 'liquidity_usd') || getTokenMetric(a, 'liquidity_wax') || 0);
    });
    var topPairs = indexedMarkets.slice().sort(function (a, b) {
      return marketVolumeSort(b) - marketVolumeSort(a) || marketLiquiditySort(b) - marketLiquiditySort(a);
    });
    var topToken = topTokens[0] || null;
    var topPair = topPairs[0] || null;
    var updated = state.backend.updatedAt ? fmtDate(state.backend.updatedAt) : 'Unavailable';

    setHtml('woe-dashboard-metrics',
      '<div class="woe-dashboard-card"><span>Indexed tokens</span><strong>' + escHtml(String(state.tokens.length || 0)) + '</strong></div>' +
      '<div class="woe-dashboard-card"><span>Indexed pairs</span><strong>' + escHtml(String(indexedMarkets.length || 0)) + '</strong></div>' +
      '<div class="woe-dashboard-card"><span>Active adapters</span><strong>' + escHtml(String(activeAdapters || 0)) + '</strong></div>' +
      '<div class="woe-dashboard-card"><span>Last sync</span><strong>' + escHtml(updated) + '</strong></div>' +
      '<div class="woe-dashboard-card"><span>Total indexed liquidity</span><strong>' + escHtml(formatDualMetric(totalLiquidityWax, totalLiquidityUsd)) + '</strong></div>' +
      '<div class="woe-dashboard-card"><span>Top token by volume</span><strong>' + escHtml(topToken ? getTokenDisplay(topToken) : UNAVAILABLE_TEXT) + '</strong></div>' +
      '<div class="woe-dashboard-card"><span>Top pair by volume</span><strong>' + escHtml(topPair ? (topPair.tokenA.symbol + '/' + topPair.tokenB.symbol) : UNAVAILABLE_TEXT) + '</strong></div>'
    );
    setHtml('woe-top-tokens-panel-body', renderMiniTokenList(topTokens.slice(0, 6)));
    setHtml('woe-top-pairs-panel-body', renderMiniPairList(topPairs.slice(0, 6)));
    setHtml('woe-featured-token-body', topToken
      ? '<div class="woe-featured-token-card">' +
          '<strong>' + escHtml(getTokenDisplay(topToken)) + '</strong>' +
          '<span>24h volume: ' + escHtml(getTokenMetric(topToken, 'volume_24h') != null ? fmtNum(getTokenMetric(topToken, 'volume_24h')) : UNAVAILABLE_TEXT) + '</span>' +
          '<span>Liquidity: ' + escHtml(formatDualMetric(getTokenMetric(topToken, 'liquidity_wax'), getTokenMetric(topToken, 'liquidity_usd'))) + '</span>' +
          '<span>Selected source: ' + escHtml(topToken.selected_pair_source || (topToken.raw && topToken.raw.selected_pair_source) || UNAVAILABLE_TEXT) + '</span>' +
        '</div>'
      : '<p class="woe-unavailable">No indexed token with real volume/liquidity is available yet.</p>');
    attachTokenSelectionLinks();
  }

  function applyBackendBootstrap(payload) {
    var data = payload && payload.data;
    if (!payload || !payload.ok || !data) return false;
    var raw = data.raw || {};
    var backendTokens = Array.isArray(data.tokens) ? data.tokens.map(mapBackendToken) : [];
    var backendPairs = Array.isArray(data.pairs) ? data.pairs.map(mapBackendPair) : [];
    var backendTickers = Array.isArray(data.pairs) ? data.pairs.map(mapBackendTicker) : [];

    state.tokens = backendTokens.length ? backendTokens : (Array.isArray(raw.alcor_tokens) ? raw.alcor_tokens : []);
    state.pairs = backendPairs;
    state.tickers = backendTickers;
    state.globalAnalytics = raw.alcor_global && typeof raw.alcor_global === 'object' ? raw.alcor_global : null;
    state.neftyMarkets = [];
    state.neftyDetectedTables = Array.isArray(raw.nefty_detected_tables) ? raw.nefty_detected_tables : [];
    state.neftyTableUsed = '';
    state.backend = {
      ok: true,
      mode: 'backend',
      updatedAt: payload.updated_at || data.sources?.alcor_tokens?.updated_at || null,
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      sources: data.sources || {},
    };
    state.summary = data.summary || {};
    state.sources = data.sources || {};
    markBackendSourceStatus(data.sources);
    return true;
  }

  function renderLoadedData() {
    state.tokenMap = buildTokenMap(state.tokens);
    state.pairIndex = buildPairIndex(state.pairs);
    addPairDerivedFeaturedTokenRecords(state.tokenMap, state.pairs);
    state.alcorMarkets = buildAlcorMarkets(state.pairs, state.tickers);
    updateTopBarWaxPrice();
    renderDashboardMetrics();
    renderSourceStrip();
    updateRiskFlags();
    renderDashboard();
    var initialSelection = pickDefaultSelection();
    renderBubbles();
    if (hasElement('woe-token-rank-grid')) renderTokens();
    if (hasElement('woe-pairs-body')) renderGlobalPairMatrix();
    if (initialSelection.key) state.selected = initialSelection;
    if (hasElement('woe-token-summary')) {
      renderSelectedToken();
      ensureSelectedTokenData();
    }
  }

  function loadDiagnosticFallback() {
    state.backend = {
      ok: false,
      mode: 'diagnostic-fallback',
      updatedAt: null,
      warnings: ['Backend bootstrap unavailable; using direct public source diagnostics.'],
      sources: {},
    };
    renderAdapterStrip({});
    pingAllSources();
    var alcorApi = window.WAXONEDGE_ALCOR_API || 'https://wax.alcor.exchange/api/v2';
    var alcorPaths = window.WAXONEDGE_ALCOR_PATHS || {};
    var tokenUrl = alcorApi + (alcorPaths.tokens || '/tokens');
    var pairsUrl = alcorApi + (alcorPaths.pairs || '/pairs');
    var tickerUrl = alcorApi + (alcorPaths.tickers || '/tickers');
    var analyticsUrl = alcorApi + (alcorPaths.analyticsGlobal || '/analytics/global');

    return Promise.all([
      apiFetch(tokenUrl),
      apiFetch(pairsUrl),
      apiFetch(tickerUrl),
      apiFetch(analyticsUrl),
      loadNeftyAdapter(),
    ]).then(function (results) {
      state.tokens = Array.isArray(results[0]) ? results[0] : [];
      state.pairs = Array.isArray(results[1]) ? results[1] : [];
      state.tickers = Array.isArray(results[2]) ? results[2] : [];
      state.globalAnalytics = results[3] && typeof results[3] === 'object' ? results[3] : null;
      state.neftyMarkets = Array.isArray(results[4]) ? results[4] : [];
      renderLoadedData();
    });
  }

  /** WAX RPC POST helper with sequential fallbacks. */
  function rpcPost(path, body) {
    return new Promise(function (resolve) {
      var primary = window.WAXONEDGE_WAX_RPC || 'https://wax.greymass.com';
      var fallbacks = Array.isArray(window.WAXONEDGE_WAX_RPC_FALLBACKS)
        ? window.WAXONEDGE_WAX_RPC_FALLBACKS
        : [];
      var endpoints = uniqueList([primary].concat(fallbacks));

      function tryEndpoint(index) {
        if (index >= endpoints.length) {
          resolve(null);
          return;
        }
        apiFetch(endpoints[index] + path, 12000, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function (data) {
          if (data) {
            resolve(data);
            return;
          }
          tryEndpoint(index + 1);
        });
      }

      tryEndpoint(0);
    });
  }

  function findTokenRecord(tokenMap, contract, symbol) {
    var key = tokenKey(contract, symbol);
    if (key && tokenMap.byKey[key]) return tokenMap.byKey[key];
    var normalizedSymbol = normalizeSymbol(symbol);
    var bySymbol = normalizedSymbol ? tokenMap.bySymbol[normalizedSymbol] : null;
    return bySymbol && bySymbol[0] ? bySymbol[0] : null;
  }

  function buildTokenMap(tokensData) {
    var map = { byKey: {}, bySymbol: {} };
    (tokensData || []).forEach(function (tok) {
      var symbol = normalizeSymbol(tok.symbol || tok.id);
      var contract = normalizeContract(tok.contract);
      var key = tokenKey(contract, symbol);
      if (!key) return;
      var record = {
        key: key,
        symbol: symbol,
        contract: contract,
        id: tok.id || '',
        decimals: tok.decimals != null ? tok.decimals : null,
        systemPrice: asNum(tok.system_price),
        usdPrice: asNum(tok.usd_price),
        selectedPriceWax: asNum(tok.selected_price_wax),
        selectedPriceUsd: asNum(tok.selected_price_usd),
        pairCount: asNum(tok.pair_count),
        volume24: asNum(tok.volume_24h_wax),
        volume24Wax: asNum(tok.volume_24h_wax),
        volume24Usd: asNum(tok.volume_24h_usd),
        change24: asNum(tok.change_24h),
        volume7d: asNum(tok.volume_7d),
        volume30d: asNum(tok.volume_30d),
        liquidityWax: asNum(tok.liquidity_wax),
        liquidityUsd: asNum(tok.liquidity_usd),
        tvlWax: asNum(tok.tvl_wax),
        tvlUsd: asNum(tok.tvl_usd),
        selectedPriceConfidence: metricConfidenceFrom(tok, 'selected_price'),
        liquidityConfidence: metricConfidenceFrom(tok, 'liquidity'),
        tvlConfidence: metricConfidenceFrom(tok, 'tvl'),
        metricReasonCodes: String(tok.metric_reason_codes || tok.reason_codes || tok.unavailable_reasons || '').split(',').map(function (reason) { return reason.trim(); }).filter(Boolean),
        holderCount: asNum(tok.holder_count),
        circulatingSupply: asNum(tok.circulating_supply),
        fdvWax: asNum(tok.fdv_wax),
        fdvUsd: asNum(tok.fdv_usd),
        selectedPairSource: tok.selected_pair_source || '',
        selectedPairId: tok.selected_pair_id || '',
        sourceCount: asNum(tok.source_count),
        indexedPairCount: asNum(tok.indexed_pair_count),
        sourceKeys: String(tok.source_keys || '').split(',').map(function (source) { return source.trim(); }).filter(Boolean),
        aggregateComplete: asNum(tok.aggregate_complete),
        aggregateTruncated: asNum(tok.aggregate_truncated),
        updatedAt: tok.updated_at || '',
        raw: tok,
      };
      map.byKey[key] = record;
      if (!map.bySymbol[symbol]) map.bySymbol[symbol] = [];
      map.bySymbol[symbol].push(record);
    });
    return map;
  }

  function pairDerivedFeaturedTokenRecord(featured, key, pairCount, sourceKeys, strongestPair) {
    var parts = String(key || '').split('::');
    return {
      key: key,
      symbol: normalizeSymbol(parts[1]),
      displaySymbol: featured.label,
      contract: normalizeContract(parts[0]),
      id: key,
      decimals: null,
      systemPrice: null,
      usdPrice: null,
      selectedPriceWax: null,
      selectedPriceUsd: null,
      pairCount: pairCount,
      volume24: null,
      volume24Wax: null,
      volume24Usd: null,
      change24: null,
      volume7d: null,
      volume30d: null,
      liquidityWax: null,
      liquidityUsd: null,
      tvlWax: null,
      tvlUsd: null,
      selectedPriceConfidence: 'unavailable',
      liquidityConfidence: 'unavailable',
      tvlConfidence: 'unavailable',
      metricReasonCodes: [],
      holderCount: null,
      circulatingSupply: null,
      fdvWax: null,
      fdvUsd: null,
      selectedPairSource: '',
      selectedPairId: '',
      sourceCount: sourceKeys.length,
      indexedPairCount: pairCount,
      sourceKeys: sourceKeys,
      strongestPair: strongestPair || null,
      aggregateComplete: null,
      aggregateTruncated: null,
      updatedAt: '',
      raw: null,
    };
  }

  function betterPairRecord(a, b) {
    if (!a) return b;
    if (!b) return a;
    var av = asNum(a.liquidityUsd) || asNum(a.liquidityWax) || asNum(a.volume24Usd) || asNum(a.volume24) || 0;
    var bv = asNum(b.liquidityUsd) || asNum(b.liquidityWax) || asNum(b.volume24Usd) || asNum(b.volume24) || 0;
    return bv > av ? b : a;
  }

  function addPairDerivedFeaturedTokenRecords(tokenMap, pairsData) {
    var pairState = {};
    (pairsData || []).forEach(function (pair) {
      getPairTokens(pair).forEach(function (token) {
        var key = token.key;
        var featured = WAXONEDGE_FEATURED_TOKEN_MAP[key];
        if (!featured || tokenMap.byKey[key]) return;
        if (!pairState[key]) {
          pairState[key] = {
            featured: featured,
            pairCount: 0,
            sources: {},
            strongestPair: null,
          };
        }
        var entry = pairState[key];
        var source = pair && (pair.adapter || pair.rawSource || pair.source);
        if (source) entry.sources[String(source).toLowerCase()] = true;
        entry.pairCount += 1;
        entry.strongestPair = betterPairRecord(entry.strongestPair, pair);
      });
    });
    Object.keys(pairState).forEach(function (key) {
      var entry = pairState[key];
      tokenMap.byKey[key] = pairDerivedFeaturedTokenRecord(
        entry.featured,
        key,
        entry.pairCount,
        Object.keys(entry.sources).sort(),
        entry.strongestPair
      );
    });
    return tokenMap;
  }

  function getPairTokens(pair) {
    var tokens = [];

    function add(side) {
      var info = getTokenSideInfo(side);
      if (!info.symbol && !info.contract) return;
      if (tokens.some(function (token) { return token.key && token.key === info.key; })) return;
      tokens.push(info);
    }

    add(pair && pair.base_token);
    add(pair && pair.quote_token);
    add(pair && pair.base);
    add(pair && pair.target);
    add(pair && pair.pool1);
    add(pair && pair.pool2);
    add(pair && pair.token0);
    add(pair && pair.token1);
    add(pair && pair.token_a);
    add(pair && pair.token_b);

    return tokens;
  }

  function getPairSymbolCandidates(pair) {
    var tokens = getPairTokens(pair);
    var symbols = tokens.map(function (token) { return token.symbol; });
    var candidates = [];

    if (pair && pair.symbol) candidates.push(pair.symbol);
    if (pair && pair.name) candidates.push(pair.name);
    if (pair && pair.market_name) candidates.push(pair.market_name);
    if (symbols.length >= 2) {
      candidates.push(pairLabel(symbols[0], symbols[1]));
      candidates.push(pairLabel(symbols[1], symbols[0]));
    }

    return uniqueList(candidates.map(normalizePairLabel));
  }

  function buildPairIndex(pairsData) {
    var index = {
      tokenPairCounts: {},
      marketIdsBySymbol: {},
    };

    if (!Array.isArray(pairsData)) return index;

    pairsData.forEach(function (pair) {
      var tokens = getPairTokens(pair);
      tokens.forEach(function (token) {
        if (!token.key) return;
        index.tokenPairCounts[token.key] = (index.tokenPairCounts[token.key] || 0) + 1;
      });

      if (pair && pair.id != null) {
        getPairSymbolCandidates(pair).forEach(function (candidate) {
          if (!index.marketIdsBySymbol[candidate]) {
            index.marketIdsBySymbol[candidate] = pair.id;
          }
        });
      }
    });

    return index;
  }

  function buildTickerIndex(tickersData) {
    var index = { byMarketId: {}, bySymbol: {} };
    (tickersData || []).forEach(function (ticker) {
      if (ticker == null) return;
      var marketId = ticker.market_id != null ? String(ticker.market_id) : '';
      if (marketId) index.byMarketId[marketId] = ticker;
      var tickerId = ticker.ticker_id != null ? String(ticker.ticker_id) : '';
      if (tickerId) index.byMarketId[tickerId] = ticker;
      var symbol = normalizePairLabel(ticker.symbol || pairLabel(ticker.base_currency, ticker.target_currency));
      if (symbol) index.bySymbol[symbol] = ticker;
    });
    return index;
  }

  function getKnownPrice(tokenInfo) {
    var tokenRecord = findTokenRecord(state.tokenMap, tokenInfo.contract, tokenInfo.symbol);
    if (tokenRecord) return tokenRecord;
    if (normalizeSymbol(tokenInfo.symbol) === 'WAX') {
      var waxRecord = findTokenRecord(state.tokenMap, 'eosio.token', 'WAX');
      return waxRecord || { systemPrice: 1, usdPrice: null };
    }
    return null;
  }

  function computeLiquidityFromSides(sideA, sideB) {
    var priceA = sideA ? getKnownPrice(sideA) : null;
    var priceB = sideB ? getKnownPrice(sideB) : null;
    var hasAmounts = !!(
      sideA && sideA.amount != null &&
      sideB && sideB.amount != null
    );
    var hasWax = !!(
      hasAmounts &&
      priceA && priceA.systemPrice != null &&
      priceB && priceB.systemPrice != null
    );
    var hasUsd = !!(
      hasAmounts &&
      priceA && priceA.usdPrice != null &&
      priceB && priceB.usdPrice != null
    );

    return {
      wax: hasWax ? (sideA.amount * priceA.systemPrice) + (sideB.amount * priceB.systemPrice) : null,
      usd: hasUsd ? (sideA.amount * priceA.usdPrice) + (sideB.amount * priceB.usdPrice) : null,
    };
  }

  function sumMetric(rows, field) {
    var total = 0;
    var hasAny = false;
    rows.forEach(function (row) {
      if (row[field] != null && !isNaN(row[field])) {
        total += row[field];
        hasAny = true;
      }
    });
    return hasAny ? total : null;
  }

  function sumMetricStrict(rows, field) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][field] == null || isNaN(rows[i][field])) {
        return null;
      }
      total += rows[i][field];
    }
    return total;
  }

  function buildAlcorMarkets(pairsData, tickersData) {
    var tickerIndex = buildTickerIndex(tickersData);
    var markets = [];

    (pairsData || []).forEach(function (pair) {
      var tokens = getPairTokens(pair);
      var tokenA = getTokenSideInfo(pair.pool1 || pair.base_token || pair.token0 || pair.token_a || tokens[0]);
      var tokenB = getTokenSideInfo(pair.pool2 || pair.quote_token || pair.token1 || pair.token_b || tokens[1]);

      if (!tokenA.key && tokens[0]) tokenA = tokens[0];
      if (!tokenB.key && tokens[1]) tokenB = tokens[1];
      if (tokenA.key && tokenA.key === tokenB.key && tokens.length > 1) {
        tokenA = tokens[0];
        tokenB = tokens[1];
      }

      var marketId = pair && pair.id != null ? String(pair.id) : '';
      var ticker = marketId ? tickerIndex.byMarketId[marketId] : null;
      if (!ticker) {
        getPairSymbolCandidates(pair).some(function (candidate) {
          ticker = tickerIndex.bySymbol[candidate];
          return !!ticker;
        });
      }

      var liquidity = computeLiquidityFromSides(tokenA, tokenB);
      var lastPrice = asNum(ticker && (ticker.last_price != null ? ticker.last_price : ticker.last));
      var change24 = asNum(ticker && (ticker.change24 != null ? ticker.change24 : ticker.price_change_percent));
      var volume24 = asNum(ticker && (ticker.base_volume != null ? ticker.base_volume : ticker.volume24));
      var priceUnit = tokenB.symbol || '';
      var currentPriceText = lastPrice != null
        ? fmtPrice(lastPrice) + (priceUnit ? ' ' + priceUnit : '')
        : UNAVAILABLE_TEXT;
      var volume24Text = volume24 != null
        ? fmtNum(volume24) + (tokenA.symbol ? ' ' + tokenA.symbol : '')
        : UNAVAILABLE_TEXT;
      var sourceInfo = pair && pair.adapter ? backendSourceMeta(pair.adapter) : null;

      markets.push({
        adapter: pair && pair.adapter ? pair.adapter : 'alcor',
        source: pair && pair.source ? pair.source : 'Alcor',
        sourceMeta: pair && pair.sourceMeta ? pair.sourceMeta : 'Alcor /pairs + /tickers',
        sourceSort: pair && pair.sourceSort != null ? pair.sourceSort : (sourceInfo ? sourceInfo.sort : 1),
        marketId: marketId,
        rankMetric: liquidity.usd != null ? liquidity.usd : (volume24 != null ? volume24 : 0),
        feeTier: formatFeeTier(pair && pair.fee),
        tokenA: tokenA,
        tokenB: tokenB,
        liquidityWax: pair && pair.liquidityWax != null ? asNum(pair.liquidityWax) : liquidity.wax,
        liquidityUsd: pair && pair.liquidityUsd != null ? asNum(pair.liquidityUsd) : liquidity.usd,
        liquidityText: pair && pair.liquidityText ? pair.liquidityText : formatDualMetric(liquidity.wax, liquidity.usd),
        currentPrice: lastPrice,
        currentPriceText: currentPriceText,
        change24: change24,
        volume24: volume24,
        volume24Text: volume24Text,
        volume7dText: pair && pair.volume7dText ? pair.volume7dText : UNAVAILABLE_TEXT,
        volume30dText: pair && pair.volume30dText ? pair.volume30dText : UNAVAILABLE_TEXT,
        pooledTokenAText: pair && pair.pooledTokenAText ? pair.pooledTokenAText : (tokenA.quantity || UNAVAILABLE_TEXT),
        pooledTokenBText: pair && pair.pooledTokenBText ? pair.pooledTokenBText : (tokenB.quantity || UNAVAILABLE_TEXT),
        explorerUrl: pair && pair.explorerUrl ? pair.explorerUrl : (marketId
          ? 'https://wax.alcor.exchange/trade/' + encodeURIComponent(marketId)
          : 'https://wax.alcor.exchange'),
        explorerLabel: pair && pair.explorerLabel ? pair.explorerLabel + ' ->' : (marketId ? 'Alcor market ->' : 'Alcor ->'),
      });
    });

    return markets;
  }

  function normalizeNeftyRow(row) {
    var tokenA = getTokenSideInfo(row.pool1 || row.base_token || row.token1 || row.token_a || row.token0);
    var tokenB = getTokenSideInfo(row.pool2 || row.quote_token || row.token2 || row.token_b || row.token1);
    var reserveA = row.reserve0 || row.balance1 || row.reserve_a || tokenA.quantity;
    var reserveB = row.reserve1 || row.balance2 || row.reserve_b || tokenB.quantity;
    if (reserveA && !tokenA.quantity) tokenA = getTokenSideInfo(Object.assign({}, tokenA, { quantity: reserveA }));
    if (reserveB && !tokenB.quantity) tokenB = getTokenSideInfo(Object.assign({}, tokenB, { quantity: reserveB }));

    var priceFromReserves = tokenA.amount != null && tokenA.amount > 0 && tokenB.amount != null
      ? tokenB.amount / tokenA.amount
      : null;
    var liquidity = computeLiquidityFromSides(tokenA, tokenB);

    return {
      adapter: 'swap.nefty',
      source: 'swap.nefty',
      sourceMeta: 'ABI-confirmed WAX contract table',
      sourceSort: 2,
      marketId: row.id != null ? String(row.id) : (row.pair_id != null ? String(row.pair_id) : ''),
      rankMetric: liquidity.usd != null ? liquidity.usd : (tokenA.amount != null ? tokenA.amount : 0),
      feeTier: formatFeeTier(row.fee),
      tokenA: tokenA,
      tokenB: tokenB,
      liquidityWax: liquidity.wax,
      liquidityUsd: liquidity.usd,
      liquidityText: formatDualMetric(liquidity.wax, liquidity.usd),
      currentPrice: priceFromReserves,
      currentPriceText: priceFromReserves != null
        ? fmtPrice(priceFromReserves) + (tokenB.symbol ? ' ' + tokenB.symbol : '')
        : UNAVAILABLE_TEXT,
      change24: null,
      volume24: null,
      volume24Text: UNAVAILABLE_TEXT,
      volume7dText: INDEXED_BACKEND_TEXT,
      volume30dText: INDEXED_BACKEND_TEXT,
      pooledTokenAText: tokenA.quantity || UNAVAILABLE_TEXT,
      pooledTokenBText: tokenB.quantity || UNAVAILABLE_TEXT,
      explorerUrl: (window.WAXONEDGE_WAXBLOCK_BASE || 'https://waxblock.io') + '/account/' + (window.WAXONEDGE_NEFTY_CONTRACT || 'swap.nefty'),
      explorerLabel: 'WaxBlock ↗',
    };
  }

  function loadNeftyAdapter() {
    var tables = window.WAXONEDGE_NEFTY_TABLES || {};
    var paths = window.WAXONEDGE_RPC_PATHS || {};
    var contract = window.WAXONEDGE_NEFTY_CONTRACT || 'swap.nefty';
    var rpcPath = paths.getTableRows || '/v1/chain/get_table_rows';
    var abiPath = paths.getAbi || '/v1/chain/get_abi';

    return rpcPost(abiPath, { account_name: contract }).then(function (abiData) {
      var abi = abiData && abiData.abi;
      var abiTables = abi && Array.isArray(abi.tables)
        ? abi.tables.map(function (table) { return table && table.name; }).filter(Boolean)
        : [];
      var detected = uniqueList(abiTables);
      state.neftyDetectedTables = detected;

      var allowedTables = ['pools', 'pairs'].filter(function (name) {
        return detected.indexOf(name) !== -1;
      });
      if (allowedTables.length === 0) {
        state.neftyTableUsed = '';
        return [];
      }

      function tryTable(index) {
        if (index >= allowedTables.length) {
          state.neftyTableUsed = '';
          return Promise.resolve([]);
        }
        var tableName = allowedTables[index];
        var tableConfig = tables[tableName] || { code: contract, scope: contract, table: tableName };
        return rpcPost(rpcPath, {
          code: tableConfig.code,
          scope: tableConfig.scope,
          table: tableConfig.table,
          json: true,
          limit: 200,
        }).then(function (data) {
          if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
            return tryTable(index + 1);
          }
          state.neftyTableUsed = tableName;
          return data.rows.map(normalizeNeftyRow);
        });
      }

      return tryTable(0);
    });
  }

  /* ── Source status cards ────────────────────────────────────── */

  function renderSourceCards() {
    var sources = window.WAXONEDGE_SOURCES || [];
    var html = sources.map(function (src) {
      var explorerHtml = src.explorerLink
        ? '<a class="woe-explorer-link" href="' + escHtml(src.explorerLink) + '" target="_blank" rel="noopener noreferrer">⬡ WaxBlock</a>'
        : '';
      var docsHtml = src.docsUrl
        ? '<a class="woe-explorer-link" href="' + escHtml(src.docsUrl) + '" target="_blank" rel="noopener noreferrer">Docs ↗</a>'
        : '';
      return '<div class="woe-source-card" id="src-card-' + escHtml(src.id) + '">' +
        '<span class="woe-status-dot woe-status-pending" id="src-dot-' + escHtml(src.id) + '" title="pending"></span>' +
        '<div class="woe-source-info">' +
          '<strong>' + escHtml(src.label) + '</strong>' +
          '<span class="woe-source-desc">' + escHtml(src.description) + '</span>' +
          '<div class="woe-source-links">' + explorerHtml + docsHtml + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    setHtml('woe-sources-grid', html);
  }

  function pingSource(src) {
    var url = src.baseUrl + src.healthPath;
    setStatus('src-dot-' + src.id, 'checking');
    apiFetch(url, 6000).then(function (data) {
      setStatus('src-dot-' + src.id, data !== null ? 'ok' : 'error');
    });
  }

  function pingAllSources() {
    var sources = window.WAXONEDGE_SOURCES || [];
    sources.forEach(function (src) { pingSource(src); });
  }

  function sourceStateForId(src) {
    var sourceMap = state.sources || {};
    var keys = {
      'alcor-tokens': 'alcor_tokens',
      'alcor-pairs': 'alcor_pairs',
      'alcor-tickers': 'alcor_tickers',
      'alcor-analytics': 'alcor_global',
      'swap-alcor': 'swap_alcor_pools',
      'swap-taco': 'swap_taco_pairs',
      'nefty-contract': 'swap_nefty_pairs',
      'swap-box': 'swap_box_pairs',
    };
    return sourceMap[keys[src.id] || src.id] || null;
  }

  function renderSourceStrip() {
    var sources = window.WAXONEDGE_SOURCES || [];
    var coreIds = ['alcor-pairs', 'swap-alcor', 'swap-taco', 'nefty-contract', 'swap-box', 'alcor-tickers'];
    var html = sources.filter(function (src) {
      return coreIds.indexOf(src.id) !== -1;
    }).map(function (src) {
      var item = sourceStateForId(src);
      var indexed = item ? !!item.indexed : false;
      var stateName = indexed ? 'ok' : (state.backend.mode === 'backend' ? 'error' : 'checking');
      var rowCount = item && item.row_count != null ? String(item.row_count) + ' rows' : (indexed ? 'indexed' : 'pending');
      return '<div class="woe-source-pill" role="listitem">' +
        '<span class="woe-status-dot woe-status-' + escHtml(stateName) + '" id="src-dot-' + escHtml(src.id) + '" title="' + escHtml(stateName) + '"></span>' +
        '<strong>' + escHtml(src.label) + '</strong>' +
        '<span>' + escHtml(rowCount) + '</span>' +
      '</div>';
    }).join('');
    setHtml('woe-sources-grid', html || '<p class="woe-loading">Source status unavailable.</p>');
  }

  function metricValueForToken(record, metric) {
    if (!record) return null;
    if (metric === 'price') {
      if (record.selectedPriceConfidence !== 'good') return null;
      return record.selectedPriceUsd != null ? record.selectedPriceUsd : record.selectedPriceWax;
    }
    if (metric === 'tvl') {
      if (record.tvlConfidence !== 'good') return null;
      return record.tvlUsd != null ? record.tvlUsd : record.tvlWax;
    }
    if (metric === 'liquidity') {
      if (record.liquidityConfidence !== 'good') return null;
      return record.liquidityUsd != null ? record.liquidityUsd : record.liquidityWax;
    }
    if (metric === 'volume') return record.volume24 != null ? record.volume24 : null;
    if (metric === 'pairs') return record.pairCount != null ? record.pairCount : null;
    var liquidity = metricValueForToken(record, 'liquidity');
    return liquidity != null ? liquidity : metricValueForToken(record, 'tvl');
  }

  function metricConfidenceFrom(row, metricName) {
    var direct = row && (row[metricName + '_confidence'] || row[metricName + 'Confidence']);
    if (direct) return String(direct).toLowerCase();
    var status = row && (row.metric_status || row.metricStatus);
    var metricStatus = status && status[metricName];
    if (!metricStatus) return 'unavailable';
    return metricStatus.live === true ? 'good' : (metricStatus.reason ? 'unavailable' : 'weak');
  }

  function guardedDualMetric(record, metric) {
    var confidence = metric === 'price' ? record.selectedPriceConfidence
      : metric === 'tvl' ? record.tvlConfidence
      : record.liquidityConfidence;
    if (confidence === 'weak') return 'Proof weak';
    if (confidence !== 'good') return UNAVAILABLE_TEXT;
    if (metric === 'price') {
      return formatDualMetric(
        record.selectedPriceWax != null ? record.selectedPriceWax : record.systemPrice,
        record.selectedPriceUsd != null ? record.selectedPriceUsd : record.usdPrice,
        'WAX',
        '$'
      );
    }
    if (metric === 'tvl') return formatDualMetric(record.tvlWax, record.tvlUsd);
    return formatDualMetric(record.liquidityWax, record.liquidityUsd);
  }

  function featuredTokenRecords() {
    return WAXONEDGE_FEATURED_TOKENS.map(function (featured) {
      var record = state.tokenMap && state.tokenMap.byKey ? state.tokenMap.byKey[featured.key] : null;
      if (!record) {
        if (!state.missingFeaturedLogged[featured.key]) {
          state.missingFeaturedLogged[featured.key] = true;
          // eslint-disable-next-line no-console
          console.debug('missing_featured_token', featured.key);
        }
        return null;
      }
      record.displaySymbol = featured.label;
      return record;
    }).filter(Boolean);
  }

  function getTokenSources(selectionKey) {
    var tokenRecord = selectionKey && state.tokenMap.byKey ? state.tokenMap.byKey[selectionKey] : null;
    var aggregateSources = tokenRecord && Array.isArray(tokenRecord.sourceKeys) ? tokenRecord.sourceKeys.filter(Boolean) : [];
    if (aggregateSources.length) return aggregateSources.slice().sort();
    var found = {};
    getAllMarkets().forEach(function (market) {
      if (!marketContainsToken(market, selectionKey)) return;
      var source = market.adapter || market.rawSource || market.source || '';
      if (source) found[String(source).toLowerCase()] = true;
    });
    return Object.keys(found).sort();
  }

  function strongestMarketForToken(selectionKey) {
    var rows = getAllMarkets().filter(function (market) {
      return marketContainsToken(market, selectionKey);
    }).sort(function (a, b) {
      var bw = b.liquidityWax != null ? b.liquidityWax : 0;
      var aw = a.liquidityWax != null ? a.liquidityWax : 0;
      if (bw !== aw) return bw - aw;
      return (b.rankMetric || 0) - (a.rankMetric || 0);
    });
    return rows[0] || null;
  }

  function getMarketPairName(market) {
    return pairLabel(market && market.tokenA && market.tokenA.symbol, market && market.tokenB && market.tokenB.symbol) || ('Pair #' + (market && market.marketId ? market.marketId : '?'));
  }

  function getOtherToken(market, selectionKey) {
    if (!market) return null;
    if (market.tokenA && market.tokenA.key === selectionKey) return market.tokenB || null;
    if (market.tokenB && market.tokenB.key === selectionKey) return market.tokenA || null;
    return market.tokenB || market.tokenA || null;
  }

  function sourceBadgesHtml(sources) {
    if (!sources || sources.length === 0) return '<span class="woe-mini-badge">No rows</span>';
    return sources.slice(0, 5).map(function (source) {
      return '<span class="woe-mini-badge">' + escHtml(source) + '</span>';
    }).join('');
  }

  function renderDashboardMetrics() {
    var summary = state.summary || {};
    setText('woe-kpi-token-count', String(summary.token_count != null ? summary.token_count : state.tokens.length || '--'));
    setText('woe-kpi-pair-count', String(summary.pair_count != null ? summary.pair_count : state.pairs.length || '--'));
    setText('woe-kpi-aggregate-count', String(summary.token_aggregate_count != null ? summary.token_aggregate_count : '--'));
    setText('woe-kpi-last-sync', state.backend.updatedAt ? new Date(state.backend.updatedAt).toLocaleString() : '--');
    var topPrice = document.getElementById('woe-topbar-wax-price');
    if (topPrice) setText('woe-kpi-wax-price', topPrice.textContent || '$ --');
  }

  /* ── Client-side sort/filter helpers ────────────────────────── */

  var sortState = {};

  function attachTableSort(tableId) {
    var table = document.getElementById(tableId);
    if (!table || table.dataset.sortBound === 'true') return;
    table.dataset.sortBound = 'true';
    var headers = table.querySelectorAll('th[data-col]');
    headers.forEach(function (th) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', function () {
        var col = th.getAttribute('data-col');
        var numeric = th.getAttribute('data-numeric') === 'true';
        var prev = sortState[tableId] || {};
        var asc = prev.col === col ? !prev.asc : true;
        sortState[tableId] = { col: col, asc: asc };
        sortTable(table, col, asc, numeric);
        headers.forEach(function (h) { h.removeAttribute('data-sort'); });
        th.setAttribute('data-sort', asc ? 'asc' : 'desc');
      });
    });
  }

  function sortTable(table, col, asc, numeric) {
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    rows.sort(function (a, b) {
      var av = (a.querySelector('td[data-col="' + col + '"]') || {}).getAttribute
        ? (a.querySelector('td[data-col="' + col + '"]').getAttribute('data-sortval') || a.querySelector('td[data-col="' + col + '"]').textContent || '')
        : '';
      var bv = (b.querySelector('td[data-col="' + col + '"]') || {}).getAttribute
        ? (b.querySelector('td[data-col="' + col + '"]').getAttribute('data-sortval') || b.querySelector('td[data-col="' + col + '"]').textContent || '')
        : '';
      if (numeric) {
        av = parseFloat(av) || 0;
        bv = parseFloat(bv) || 0;
        return asc ? av - bv : bv - av;
      }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    rows.forEach(function (r) { tbody.appendChild(r); });
  }

  function attachTableFilter(inputId, tableId) {
    var input = document.getElementById(inputId);
    var table = document.getElementById(tableId);
    if (!input || !table || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      var rows = table.querySelectorAll('tbody tr');
      rows.forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.style.display = q === '' || text.includes(q) ? '' : 'none';
      });
    });
  }

  function attachGlobalSearch() {
    var input = document.getElementById('woe-global-search');
    if (!input || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('input', function () {
      state.filters.query = input.value.toLowerCase().trim();
      renderBubbles();
      renderTokens();
      ['woe-table-pairs', 'woe-table-matrix'].forEach(function (tableId) {
        var table = document.getElementById(tableId);
        if (!table) return;
        table.querySelectorAll('tbody tr').forEach(function (row) {
          row.style.display = state.filters.query === '' || row.textContent.toLowerCase().includes(state.filters.query) ? '' : 'none';
        });
      });
    });
  }

  function attachDashboardControls() {
    var metric = document.getElementById('woe-bubble-metric');
    if (metric && metric.dataset.bound !== 'true') {
      metric.dataset.bound = 'true';
      metric.addEventListener('change', function () {
        state.filters.bubbleMetric = metric.value || 'liquidity';
        renderBubbles();
        renderTokens();
      });
    }
    var source = document.getElementById('woe-source-filter');
    if (source && source.dataset.bound !== 'true') {
      source.dataset.bound = 'true';
      source.addEventListener('change', function () {
        state.filters.source = source.value || '';
        renderBubbles();
        renderTokens();
      });
    }
  }

  /* ── Tokens scanner ─────────────────────────────────────────── */

  function buildTokenHref(symbol, contract) {
    return '/analytics/token/?token=' + encodeURIComponent(normalizeSymbol(symbol)) +
      '&contract=' + encodeURIComponent(normalizeContract(contract));
  }

  function isTokenAnalyticsRoute() {
    var path = window.location.pathname || '';
    return /^\/analytics\/token(?:\/|$)/.test(path);
  }

  function attachTokenSelectionLinks() {
    document.querySelectorAll('.woe-token-detail-link, .woe-bubble-token').forEach(function (link) {
      if (link.dataset.bound === 'true') return;
      link.dataset.bound = 'true';
      link.addEventListener('click', function (event) {
        var token = link.getAttribute('data-token');
        var contract = link.getAttribute('data-contract');
        var href = buildTokenHref(token, contract);
        if (!isTokenAnalyticsRoute()) {
          event.preventDefault();
          window.location.href = href;
          return;
        }
        event.preventDefault();
        selectToken(token, contract, true);
      });
    });
  }

  function renderTokens() {
    var tokensData = getRankedTokenRecords();
    if (!Array.isArray(tokensData) || tokensData.length === 0) {
      setHtml('woe-token-rank-grid', '<div class="woe-chart-empty">No tokens match the current filters.</div>');
      return;
    }

    var selectedKey = state.selected.key;
    var rows = tokensData.map(function (record, index) {
      var sym = record.symbol || record.id || '?';
      var contr = record.contract || '';
      var key = tokenKey(contr, sym);
      var sources = getTokenSources(key);
      var market = strongestMarketForToken(key);
      var change = record.change24 != null ? record.change24 : (market && market.change24 != null ? market.change24 : null);
      var activeClass = key && key === selectedKey ? ' woe-token-rank-active' : '';
      var symbolLink = '<a class="woe-token-detail-link" href="' + escHtml(buildTokenHref(sym, contr)) + '"' +
        ' data-token="' + escHtml(sym) + '"' +
        ' data-contract="' + escHtml(contr) + '">' + escHtml(record.displaySymbol || sym) + '</a>';
      return '<article class="woe-token-rank-card' + activeClass + '">' +
        '<span class="woe-token-rank-number">#' + escHtml(String(index + 1)) + '</span>' +
        '<div><strong>' + symbolLink + '</strong><span>' + escHtml(contr || UNAVAILABLE_TEXT) + '</span></div>' +
        '<div class="woe-token-rank-metrics">' +
          '<span>' + escHtml(guardedDualMetric(record, 'price')) + '</span>' +
          '<span class="' + escHtml(pctClass(change)) + '">' + escHtml(change != null ? fmtPct(change) : UNAVAILABLE_TEXT) + '</span>' +
          '<span>' + escHtml(record.volume24 != null ? fmtNum(record.volume24) + ' vol' : UNAVAILABLE_TEXT) + '</span>' +
        '</div>' +
        '<div class="woe-token-rank-badges">' + sourceBadgesHtml(sources) + '</div>' +
      '</article>';
    }).join('');

    setHtml('woe-token-rank-grid', rows);
    setText('woe-tokens-count', tokensData.length + ' featured tokens');
    attachTokenSelectionLinks();
  }

  /* ── Risk flags panel ────────────────────────────────────────── */

  function getRankedTokenRecords() {
    var q = state.filters.query;
    var sourceFilter = state.filters.source;
    return featuredTokenRecords().filter(function (record) {
      var symbol = normalizeSymbol(record.symbol || record.id);
      var contract = normalizeContract(record.contract);
      var key = tokenKey(contract, symbol);
      if (!key || !WAXONEDGE_FEATURED_TOKEN_MAP[key]) return false;
      var sources = getTokenSources(key);
      if (sourceFilter && sources.indexOf(sourceFilter) === -1) return false;
      if (!q) return true;
      return ((record.displaySymbol || '') + ' ' + symbol + ' ' + contract + ' ' + sources.join(' ')).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      var bv = metricValueForToken(b, state.filters.bubbleMetric);
      var av = metricValueForToken(a, state.filters.bubbleMetric);
      if (bv != null && av == null) return 1;
      if (av != null && bv == null) return -1;
      return (bv || 0) - (av || 0);
    });
  }

  function renderBubbles() {
    var tokens = getRankedTokenRecords();
    if (tokens.length === 0) {
      setHtml('woe-bubble-board', '<div class="woe-chart-empty">No indexed tokens match the current filters.</div>');
      return;
    }
    var maxMetric = tokens.reduce(function (max, record) {
      var metric = metricValueForToken(record, state.filters.bubbleMetric);
      return Math.max(max, metric == null ? 0 : metric);
    }, 1);
    var html = tokens.map(function (record, index) {
      var symbol = normalizeSymbol(record.symbol || record.id);
      var contract = normalizeContract(record.contract);
      var key = tokenKey(contract, symbol);
      var sources = getTokenSources(key);
      var market = strongestMarketForToken(key);
      var metric = metricValueForToken(record, state.filters.bubbleMetric);
      var ratio = metric == null ? 0.08 : Math.max(0.08, Math.min(1, metric / maxMetric));
      var size = Math.round(72 + (ratio * 104));
      var glow = Math.round(12 + (ratio * 34));
      var change = record.change24 != null ? record.change24 : (market && market.change24 != null ? market.change24 : null);
      var colorClass = change == null ? 'woe-bubble-flat' : (change >= 0 ? 'woe-bubble-up' : 'woe-bubble-down');
      var subtitle = state.filters.bubbleMetric === 'volume'
        ? (record.volume24 != null ? fmtNum(record.volume24) + ' vol' : UNAVAILABLE_TEXT)
        : state.filters.bubbleMetric === 'pairs'
          ? (record.pairCount != null || sources.length ? String(record.pairCount != null ? record.pairCount : sources.length) + ' pairs' : UNAVAILABLE_TEXT)
          : state.filters.bubbleMetric === 'price'
            ? guardedDualMetric(record, 'price')
            : state.filters.bubbleMetric === 'tvl'
              ? guardedDualMetric(record, 'tvl')
              : guardedDualMetric(record, 'liquidity');
      return '<button class="woe-bubble-token ' + colorClass + '" type="button"' +
        ' data-token="' + escHtml(symbol) + '" data-contract="' + escHtml(contract) + '"' +
        ' style="--bubble-size:' + escHtml(String(size)) + 'px;--bubble-glow:' + escHtml(String(glow)) + 'px;"' +
        ' title="' + escHtml(symbol + ' @ ' + contract) + '">' +
          '<span class="woe-bubble-rank">#' + escHtml(String(index + 1)) + '</span>' +
          '<strong>' + escHtml(record.displaySymbol || symbol) + '</strong>' +
          '<span class="woe-bubble-metric">' + escHtml(subtitle) + '</span>' +
          '<span class="woe-bubble-change ' + escHtml(pctClass(change)) + '">' + escHtml(change != null ? fmtPct(change) : 'No 24h') + '</span>' +
          '<span class="woe-bubble-badges">' + sourceBadgesHtml(sources) + '</span>' +
        '</button>';
    }).join('');
    setHtml('woe-bubble-board', html);
    attachTokenSelectionLinks();
  }

  function updateRiskFlags() {
    var tokensData = state.tokens;
    var tickersData = state.tickers;
    var pairIndex = state.pairIndex;
    var flags = [];
    var tokenPairCounts = pairIndex && pairIndex.tokenPairCounts ? pairIndex.tokenPairCounts : {};

    if (!tokensData || tokensData.length === 0) {
      flags.push({ level: 'warn', msg: 'Token data unavailable — price risk flags cannot be computed.' });
    } else {
      var noPairs = tokensData.filter(function (t) {
        var key = tokenKey(t.contract, t.symbol || t.id);
        return key && !tokenPairCounts[key];
      });
      if (noPairs.length > 0) {
        flags.push({ level: 'info', msg: noPairs.length + ' token(s) have no detected Alcor pairs.' });
      }
    }

    if (!tickersData || tickersData.length === 0) {
      flags.push({ level: 'warn', msg: 'Ticker data unavailable — spread and price change flags cannot be computed.' });
    } else {
      var highSpread = tickersData.filter(function (ticker) {
        var bid = asNum(ticker.bid);
        var ask = asNum(ticker.ask);
        if (bid == null || ask == null || bid <= 0) return false;
        return ((ask - bid) / bid) > 0.1;
      });
      if (highSpread.length > 0) {
        flags.push({ level: 'warn', msg: highSpread.length + ' pair(s) have a spread > 10% (wide spread risk).' });
      }
      var bigDrop = tickersData.filter(function (ticker) {
        var change = asNum(ticker.change24 != null ? ticker.change24 : ticker.price_change_percent);
        return change != null && change < -20;
      });
      if (bigDrop.length > 0) {
        flags.push({ level: 'alert', msg: bigDrop.length + ' pair(s) dropped more than 20% in 24h.' });
      }
    }

    if (flags.length === 0) {
      flags.push({ level: 'ok', msg: 'No significant risk flags detected in current data.' });
    }

    var html = flags.map(function (flag) {
      return '<div class="woe-flag woe-flag-' + escHtml(flag.level) + '">' +
        '<span class="woe-flag-icon">' + (flag.level === 'alert' ? '⚠' : flag.level === 'warn' ? '◈' : flag.level === 'ok' ? '✓' : 'ℹ') + '</span>' +
        '<span>' + escHtml(flag.msg) + '</span>' +
      '</div>';
    }).join('');
    setHtml('woe-risk-flags', html);
  }

  /* ── Query-string token detail state ────────────────────────── */

  function getSelectionFromLocation() {
    var params = new URLSearchParams(window.location.search || '');
    var symbol = normalizeSymbol(params.get('token'));
    var contract = normalizeContract(params.get('contract'));
    if ((!symbol || !contract) && isTokenAnalyticsRoute()) {
      var parts = (window.location.pathname || '').split('/').filter(Boolean);
      var slug = parts.length >= 3 ? parts[2] : '';
      var slugMatch = slug.match(/^([^_]+)_(.+)$/);
      if (slugMatch) {
        symbol = normalizeSymbol(slugMatch[1]);
        contract = normalizeContract(slugMatch[2]);
      }
    }
    return {
      symbol: symbol,
      contract: contract,
      key: tokenKey(contract, symbol),
    };
  }

  var WAX_NATIVE_KEY = tokenKey('eosio.token', 'WAX');

  function pickDefaultSelection() {
    var requested = getSelectionFromLocation();
    if (requested.key && findTokenRecord(state.tokenMap, requested.contract, requested.symbol)) {
      return requested;
    }
    return { symbol: '', contract: '', key: '' };
  }

  function updateSelectionUrl(selection, pushState) {
    if (!selection || !selection.key || !window.history || !window.location) return;
    var url = buildTokenHref(selection.symbol, selection.contract);
    var stateMethod = pushState && typeof window.history.pushState === 'function'
      ? 'pushState'
      : 'replaceState';
    if (typeof window.history[stateMethod] === 'function') {
      window.history[stateMethod]({}, '', url);
    }
  }

  function selectToken(symbol, contract, pushState) {
    var normalized = {
      symbol: normalizeSymbol(symbol),
      contract: normalizeContract(contract),
      key: tokenKey(contract, symbol),
    };
    if (!normalized.key) return;
    state.selected = normalized;
    updateSelectionUrl(normalized, pushState);
    if (hasElement('woe-token-rank-grid')) renderTokens();
    if (hasElement('woe-token-summary')) {
      renderSelectedToken();
      ensureSelectedTokenData();
    }
  }

  /* ── Token detail analytics ─────────────────────────────────── */

  function marketContainsToken(market, selectionKey) {
    return market && (
      (market.tokenA && market.tokenA.key === selectionKey) ||
      (market.tokenB && market.tokenB.key === selectionKey)
    );
  }

  function getAllMarkets() {
    return state.alcorMarkets.concat(state.neftyMarkets);
  }

  function selectedTokenApiPath(selection, child) {
    if (!selection || !selection.key) return '';
    var path = '/token/' + encodeURIComponent(selection.contract) + '/' + encodeURIComponent(selection.symbol);
    return child ? path + '/' + child : path;
  }

  function tokenRecordFromDetail(detail, fallback) {
    if (!detail || !detail.token) return null;
    var token = detail.token || {};
    var stats = detail.stats || {};
    return {
      key: tokenKey(token.contract || fallback.contract, token.symbol || fallback.symbol),
      symbol: normalizeSymbol(token.symbol || fallback.symbol),
      contract: normalizeContract(token.contract || fallback.contract),
      decimals: token.decimals != null ? token.decimals : null,
      systemPrice: null,
      usdPrice: null,
      selectedPriceWax: asNum(stats.selected_price_wax),
      selectedPriceUsd: asNum(stats.selected_price_usd),
      pairCount: asNum(stats.indexed_pair_count),
      volume24: asNum(stats.volume_24h_wax),
      volume24Wax: asNum(stats.volume_24h_wax),
      volume24Usd: asNum(stats.volume_24h_usd),
      change24: asNum(stats.change_24h),
      volume7d: asNum(stats.volume_7d),
      volume30d: asNum(stats.volume_30d),
      liquidityWax: asNum(stats.liquidity_wax),
      liquidityUsd: asNum(stats.liquidity_usd),
      tvlWax: asNum(stats.tvl_wax),
      tvlUsd: asNum(stats.tvl_usd),
      selectedPriceConfidence: metricConfidenceFrom(stats, 'selected_price'),
      liquidityConfidence: metricConfidenceFrom(stats, 'liquidity'),
      tvlConfidence: metricConfidenceFrom(stats, 'tvl'),
      metricReasonCodes: String(stats.metric_reason_codes || stats.reason_codes || stats.unavailable_reasons || '').split(',').map(function (reason) { return reason.trim(); }).filter(Boolean),
      selectedPairSource: stats.selected_pair_source || '',
      selectedPairId: stats.selected_pair_id || '',
      sourceCount: asNum(stats.source_count),
      indexedPairCount: asNum(stats.indexed_pair_count),
      sourceKeys: String(stats.source_keys || '').split(',').map(function (source) { return source.trim(); }).filter(Boolean),
      aggregateComplete: asNum(stats.aggregate_complete),
      aggregateTruncated: asNum(stats.aggregate_truncated),
      updatedAt: stats.updated_at || token.updated_at || '',
      raw: Object.assign({}, token, stats),
    };
  }

  function getMarketsForSelection(selection) {
    if (!selection || !selection.key) return [];
    if (Array.isArray(state.tokenPairCache[selection.key])) {
      return state.tokenPairCache[selection.key].slice();
    }
    return getAllMarkets().filter(function (market) {
      return marketContainsToken(market, selection.key);
    });
  }

  function isCanonicalAggregateValid(stats) {
    if (!stats) return false;
    var complete = asNum(stats.aggregate_complete);
    var truncated = asNum(stats.aggregate_truncated != null ? stats.aggregate_truncated : stats.aggregate_sources_truncated);
    return complete === 1 && truncated !== 1;
  }

  function tokenStatReason(stats, key) {
    var proof = stats && stats.metric_status && typeof stats.metric_status === 'object'
      ? stats.metric_status[key]
      : null;
    if (proof && proof.reason) return proof.reason;
    var reasons = stats && stats.unavailable_reasons && typeof stats.unavailable_reasons === 'object'
      ? stats.unavailable_reasons
      : {};
    return reasons[key] || '';
  }

  function backendFlag(value) {
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
  }

  function metricStatusLive(stats, key) {
    var proof = stats && stats.metric_status && typeof stats.metric_status === 'object'
      ? stats.metric_status[key]
      : null;
    return proof && backendFlag(proof.live);
  }

  function hasRealHolderSnapshot(stats) {
    if (!stats) return false;
    if (backendFlag(stats.has_real_snapshot)) return true;
    var holderProof = stats.holder_snapshot && typeof stats.holder_snapshot === 'object'
      ? stats.holder_snapshot
      : null;
    return !!(holderProof && backendFlag(holderProof.has_real_snapshot));
  }

  function tokenAvailabilityHtml(stats, key, fallback) {
    return availabilityHtml(tokenStatReason(stats, key) || fallback);
  }

  function isFreshHistoryAccumulating(stats, key) {
    if (!stats) return false;
    var keyComplete = asNum(stats[key + '_complete']);
    if (keyComplete === 0) return true;
    var historyComplete = asNum(stats.history_complete != null ? stats.history_complete : stats.fresh_history_complete);
    if (historyComplete === 0) return true;
    var historyState = String(stats.history_state || stats.history_status || stats.fresh_history_state || '').toLowerCase();
    return /fresh|build|accumulat|incomplete/.test(historyState);
  }

  function historicalVolumeAvailabilityHtml(stats, key) {
    if (isFreshHistoryAccumulating(stats, key)) return availabilityHtml('Building from fresh live history');
    return tokenAvailabilityHtml(stats, key);
  }

  function getSelectedTokenContext() {
    var selection = state.selected;
    var detail = state.tokenDetailCache[selection.key] || null;
    var tokenRecord = tokenRecordFromDetail(detail, selection) || findTokenRecord(state.tokenMap, selection.contract, selection.symbol) || {
      symbol: selection.symbol,
      contract: selection.contract,
      decimals: null,
      systemPrice: null,
      usdPrice: null,
    };
    var relevantMarkets = getMarketsForSelection(selection).sort(function (a, b) {
      return (b.rankMetric || 0) - (a.rankMetric || 0);
    });

    var alcorMarkets = relevantMarkets.filter(function (market) {
      return market.adapter === 'alcor';
    });

    var primaryAlcorMarket = alcorMarkets[0] || null;
    var strongestMarket = relevantMarkets[0] || null;
    var chartMarket = state.backend.mode === 'backend' ? null : primaryAlcorMarket;
    var primaryVolumeMarket = relevantMarkets.find(function (market) {
      return market.volume24 != null && isSelectedTokenBaseMarket(market, selection);
    }) || null;

    var tokenLockedAmount = 0;
    var hasTokenLockedAmount = false;
    var tokenLockedAmountComplete = relevantMarkets.length > 0;
    relevantMarkets.forEach(function (market) {
      var marketHasTokenAmount = false;
      if (market.tokenA && market.tokenA.key === selection.key && market.tokenA.amount != null) {
        tokenLockedAmount += market.tokenA.amount;
        hasTokenLockedAmount = true;
        marketHasTokenAmount = true;
      }
      if (market.tokenB && market.tokenB.key === selection.key && market.tokenB.amount != null) {
        tokenLockedAmount += market.tokenB.amount;
        hasTokenLockedAmount = true;
        marketHasTokenAmount = true;
      }
      if (marketContainsToken(market, selection.key) && !marketHasTokenAmount) {
        tokenLockedAmountComplete = false;
      }
    });

    var pairLiquidityWax = sumMetric(relevantMarkets, 'liquidityWax');
    var pairLiquidityUsd = sumMetric(relevantMarkets, 'liquidityUsd');
    var tokenTvlWax = hasTokenLockedAmount && tokenLockedAmountComplete && tokenRecord.systemPrice != null
      ? tokenLockedAmount * tokenRecord.systemPrice
      : null;
    var tokenTvlUsd = hasTokenLockedAmount && tokenLockedAmountComplete && tokenRecord.usdPrice != null
      ? tokenLockedAmount * tokenRecord.usdPrice
      : null;

    return {
      selection: selection,
      token: tokenRecord,
      detail: detail,
      stats: detail && detail.stats ? detail.stats : null,
      markets: relevantMarkets,
      primaryAlcorMarket: primaryAlcorMarket,
      strongestMarket: strongestMarket,
      chartMarket: chartMarket,
      primaryVolumeMarket: primaryVolumeMarket,
      pairLiquidityWax: pairLiquidityWax,
      pairLiquidityUsd: pairLiquidityUsd,
      tokenTvlWax: tokenTvlWax,
      tokenTvlUsd: tokenTvlUsd,
    };
  }

  function parseChainStat(statRow) {
    if (!statRow) return null;
    return {
      supply: parseAsset(statRow.supply),
      maxSupply: parseAsset(statRow.max_supply),
      issuer: statRow.issuer || '',
    };
  }

  function isSelectedTokenBaseMarket(market, selection) {
    if (!market || !selection || !selection.key || !market.tokenA) return false;
    var tokenAKey = market.tokenA.key || tokenKey(market.tokenA.contract, market.tokenA.symbol);
    return tokenAKey === selection.key;
  }

  function chartBundleHasSelectedBaseVolume(chartBundle, context) {
    if (!chartBundle || !context || !context.selection) return false;
    if (context.chartMarket) return isSelectedTokenBaseMarket(context.chartMarket, context.selection);
    var source = chartBundle.source || chartBundle.chart_source || null;
    if (!source) return false;
    return tokenKey(source.token_a_contract, source.token_a_symbol) === context.selection.key;
  }

  function ensureSelectedChainStat(selection) {
    if (!selection || !selection.key || hasOwn(state.chainStatCache, selection.key) || state.chainStatPending[selection.key]) {
      return;
    }
    state.chainStatPending[selection.key] = true;
    var paths = window.WAXONEDGE_RPC_PATHS || {};
    var tableRowsPath = paths.getTableRows || '/v1/chain/get_table_rows';
    rpcPost(tableRowsPath, {
      code: selection.contract,
      scope: selection.symbol,
      table: 'stat',
      json: true,
      limit: 1,
    }).then(function (data) {
      state.chainStatCache[selection.key] = parseChainStat(data && data.rows && data.rows[0]);
      delete state.chainStatPending[selection.key];
      if (state.selected.key === selection.key) renderSelectedToken();
    });
  }

  function normalizeCandles(data) {
    var candles = [];

    function add(time, open, high, low, close, volume) {
      var ts = asNum(time);
      var c = asNum(close);
      if (ts == null || c == null) return;
      candles.push({
        time: ts,
        open: asNum(open),
        high: asNum(high),
        low: asNum(low),
        close: c,
        volume: asNum(volume),
      });
    }

    if (Array.isArray(data)) {
      data.forEach(function (item) {
        if (Array.isArray(item)) {
          add(item[0], item[1], item[2], item[3], item[4], item[5]);
        } else if (item && typeof item === 'object') {
          add(
            item.time || item.t || item.timestamp,
            item.open || item.o,
            item.high || item.h,
            item.low || item.l,
            item.close || item.c,
            item.volume || item.v
          );
        }
      });
    } else if (data && Array.isArray(data.bars)) {
      data.bars.forEach(function (bar) {
        add(bar.time || bar.t, bar.open || bar.o, bar.high || bar.h, bar.low || bar.l, bar.close || bar.c, bar.volume || bar.v);
      });
    } else if (data && Array.isArray(data.t)) {
      for (var i = 0; i < data.t.length; i++) {
        add(data.t[i], data.o && data.o[i], data.h && data.h[i], data.l && data.l[i], data.c && data.c[i], data.v && data.v[i]);
      }
    }

    return candles.sort(function (a, b) { return a.time - b.time; });
  }

  function loadChartData(marketId) {
    if (!marketId) return Promise.resolve(null);
    if (hasOwn(state.chartCache, marketId)) return Promise.resolve(state.chartCache[marketId]);
    if (state.chartPending[marketId]) return Promise.resolve(null);

    if (state.backend.mode === 'backend') {
      var backendChartKey = marketId;
      var chartContract = state.selected.contract;
      var chartSymbol = state.selected.symbol;
      state.chartPending[backendChartKey] = true;
      return waxonedgeApi('/token/' + encodeURIComponent(chartContract) + '/' + encodeURIComponent(chartSymbol) + '/chart')
        .then(function (payload) {
          var chartData = payload && payload.ok && payload.data ? payload.data : {};
          var candleRows = Array.isArray(chartData.candles) ? chartData.candles : [];
          var candles = candleRows.map(function (row) {
            return {
              time: new Date(row.bucket_time || row.time).getTime(),
              open: asNum(row.open),
              high: asNum(row.high),
              low: asNum(row.low),
              close: asNum(row.close),
              volume: asNum(row.volume),
            };
          }).filter(function (candle) {
            return candle.time && candle.close != null;
          });
          state.chartCache[backendChartKey] = {
            marketId: backendChartKey,
            source: chartData.chart_source || null,
            unavailable: chartData.unavailable || null,
            candles: candles,
          };
          return state.chartCache[backendChartKey];
        }).catch(function () {
          state.chartCache[backendChartKey] = {
            marketId: backendChartKey,
            source: null,
            unavailable: SOURCE_NOT_INDEXED_TEXT,
            candles: [],
          };
          return state.chartCache[backendChartKey];
        }).finally(function () {
          delete state.chartPending[backendChartKey];
        });
    }

    state.chartPending[marketId] = true;
    var alcorApi = window.WAXONEDGE_ALCOR_API || 'https://wax.alcor.exchange/api/v2';
    var paths = window.WAXONEDGE_ALCOR_PATHS || {};
    var marketsBase = paths.markets || '/markets';
    var to = Date.now();
    var from = to - (30 * 24 * 60 * 60 * 1000);
    var chartUrl = alcorApi + marketsBase + '/' + encodeURIComponent(marketId) + '/charts' +
      '?resolution=1D&from=' + String(from) + '&to=' + String(to);

    return apiFetch(chartUrl, 12000).then(function (data) {
      var candles = normalizeCandles(data);
      state.chartCache[marketId] = {
        marketId: marketId,
        candles: candles,
      };
      return state.chartCache[marketId];
    }).catch(function () {
      state.chartCache[marketId] = {
        marketId: marketId,
        candles: [],
      };
      return state.chartCache[marketId];
    }).finally(function () {
      delete state.chartPending[marketId];
    });
  }

  function loadSelectedTokenDetail(selection) {
    if (!selection || !selection.key) return Promise.resolve(null);
    if (hasOwn(state.tokenDetailCache, selection.key)) return Promise.resolve(state.tokenDetailCache[selection.key]);
    var pendingKey = 'detail:' + selection.key;
    if (state.tokenBackendPending[pendingKey]) return state.tokenBackendPending[pendingKey];
    state.tokenBackendPending[pendingKey] = waxonedgeApi(selectedTokenApiPath(selection, ''))
      .then(function (payload) {
        var detail = payload && payload.ok && payload.data ? payload.data : null;
        if (detail) state.tokenDetailCache[selection.key] = detail;
        return detail;
      }).finally(function () {
        delete state.tokenBackendPending[pendingKey];
      });
    return state.tokenBackendPending[pendingKey];
  }

  function loadSelectedTokenPairs(selection) {
    if (!selection || !selection.key) return Promise.resolve([]);
    if (hasOwn(state.tokenPairCache, selection.key)) return Promise.resolve(state.tokenPairCache[selection.key]);
    var pendingKey = 'pairs:' + selection.key;
    if (state.tokenBackendPending[pendingKey]) return state.tokenBackendPending[pendingKey];
    var rows = [];
    function loadPage(cursor) {
      var path = selectedTokenApiPath(selection, 'pairs') + '?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      return waxonedgeApi(path).then(function (payload) {
        var data = payload && payload.ok && payload.data ? payload.data : {};
        var pageRows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data) ? data : []);
        rows = rows.concat(pageRows);
        if (data && data.complete === false && data.next_cursor) return loadPage(data.next_cursor);
        var pairs = rows.map(mapBackendPair);
        var tickers = rows.map(mapBackendTicker);
        state.tokenPairCache[selection.key] = buildAlcorMarkets(pairs, tickers);
        return state.tokenPairCache[selection.key];
      });
    }
    state.tokenBackendPending[pendingKey] = loadPage('').finally(function () {
      delete state.tokenBackendPending[pendingKey];
    });
    return state.tokenBackendPending[pendingKey];
  }

  function loadSelectedTokenChart(selection) {
    if (!selection || !selection.key) return Promise.resolve(null);
    if (hasOwn(state.tokenChartCache, selection.key)) return Promise.resolve(state.tokenChartCache[selection.key]);
    return loadChartData('backend:' + selection.key).then(function (bundle) {
      state.tokenChartCache[selection.key] = bundle;
      return bundle;
    });
  }

  function computeHistoricalVolumes(chartBundle) {
    if (!chartBundle || !Array.isArray(chartBundle.candles) || chartBundle.candles.length === 0) {
      return null;
    }
    var candles = chartBundle.candles;
    var lastTime = candles[candles.length - 1].time;
    var sevenCutoff = lastTime - (7 * 24 * 60 * 60 * 1000);
    var thirtyCutoff = lastTime - (30 * 24 * 60 * 60 * 1000);
    var volumes = {
      last24: null,
      sevenDay: null,
      thirtyDay: null,
    };
    var seven = 0;
    var thirty = 0;
    var hasSeven = false;
    var hasThirty = false;
    candles.forEach(function (candle) {
      if (candle.volume == null) return;
      if (candle.time >= sevenCutoff) {
        seven += candle.volume;
        hasSeven = true;
      }
      if (candle.time >= thirtyCutoff) {
        thirty += candle.volume;
        hasThirty = true;
      }
    });
    volumes.last24 = candles[candles.length - 1].volume;
    volumes.sevenDay = hasSeven ? seven : null;
    volumes.thirtyDay = hasThirty ? thirty : null;
    return volumes;
  }

  function renderLightweightCandles(containerId, candles) {
    var host = document.getElementById(containerId);
    var tv = window.LightweightCharts;
    if (!host || !tv || typeof tv.createChart !== 'function') return false;
    var candleSeriesFactory = tv.CandlestickSeries || null;
    var data = candles.map(function (candle) {
      return {
        time: Math.floor(candle.time / 1000),
        open: candle.open != null ? candle.open : candle.close,
        high: candle.high != null ? candle.high : candle.close,
        low: candle.low != null ? candle.low : candle.close,
        close: candle.close,
      };
    });
    if (!data.length) return false;
    host.innerHTML = '';
    var chart = tv.createChart(host, {
      autoSize: true,
      height: 320,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#dbe7f3',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.14)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.14)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.25)',
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.25)',
      },
    });
    var series = candleSeriesFactory && typeof chart.addSeries === 'function'
      ? chart.addSeries(candleSeriesFactory, {
        upColor: '#00e6b0',
        downColor: '#ff4d6d',
        borderUpColor: '#00e6b0',
        borderDownColor: '#ff4d6d',
        wickUpColor: '#00e6b0',
        wickDownColor: '#ff4d6d',
      })
      : chart.addCandlestickSeries({
        upColor: '#00e6b0',
        downColor: '#ff4d6d',
        borderUpColor: '#00e6b0',
        borderDownColor: '#ff4d6d',
        wickUpColor: '#00e6b0',
        wickDownColor: '#ff4d6d',
      });
    series.setData(data);
    chart.timeScale().fitContent();
    return true;
  }

  function renderTokenSummary(context) {
    var token = context.token;
    var summaryHtml = '<h2 class="woe-token-summary-title">' + escHtml(token.symbol || context.selection.symbol || 'Token') + '</h2>' +
      '<p class="woe-token-summary-subtitle">' +
        'Indexed analytics detail for <code>' + escHtml(token.contract || context.selection.contract || 'unknown-contract') + '</code>. ' +
        'All-pairs WAX valuation sums usable indexed pair value across supported DEXs where a trusted WAX route exists. ' +
        'Click another token in the scanner or share this state with <code>?token=</code> + <code>&amp;contract=</code>.' +
      '</p>';
    setHtml('woe-token-summary', summaryHtml);
    setText('woe-detail-status', context.selection.symbol + ' @ ' + context.selection.contract);

    var metaParts = [];
    if (context.markets.length > 0) {
      metaParts.push(context.markets.length + ' indexed pool/pair row(s)');
    } else {
      metaParts.push('No indexed pool/pair rows detected');
    }
    if (context.primaryAlcorMarket && context.primaryAlcorMarket.marketId) {
      metaParts.push('Primary Alcor market #' + context.primaryAlcorMarket.marketId);
    }
    setText('woe-detail-meta', metaParts.join(' · '));
  }

  function renderTokenStats(context) {
    var token = context.token;
    var selection = context.selection;
    var stats = context.stats || {};
    var chainStat = state.chainStatCache[selection.key] || null;
    var supply = chainStat && chainStat.supply ? chainStat.supply : null;
    var currentPriceWax = asNum(stats.selected_price_wax);
    var currentPriceUsd = asNum(stats.selected_price_usd);
    var selectedSource = stats.selected_price_source ||
      (stats.selected_pair_source && stats.selected_pair_id ? getDexShortLabel(stats.selected_pair_source) + ' #' + stats.selected_pair_id : '');
    var strongestPairData = stats.strongest_pair && typeof stats.strongest_pair === 'object' ? stats.strongest_pair : null;
    var strongestPair = strongestPairData && strongestPairData.label
      ? strongestPairData.label
      : (stats.selected_pair_source && stats.selected_pair_id ? getDexShortLabel(stats.selected_pair_source) + ' #' + stats.selected_pair_id : '');
    var sourceCount = asNum(stats.source_count);
    var indexedPairCount = asNum(stats.indexed_pair_count);
    var volume24 = asNum(stats.volume_24h_wax);
    var volume7d = asNum(stats.volume_7d);
    var volume30d = asNum(stats.volume_30d);
    var liquidityWax = asNum(stats.liquidity_wax);
    var liquidityUsd = asNum(stats.liquidity_usd);
    var cumulatedLiquidityWax = asNum(stats.cumulated_pair_liquidity_wax != null ? stats.cumulated_pair_liquidity_wax : stats.liquidity_wax);
    var cumulatedLiquidityUsd = asNum(stats.cumulated_pair_liquidity_usd != null ? stats.cumulated_pair_liquidity_usd : stats.liquidity_usd);
    var tvlWax = asNum(stats.tvl_wax);
    var tvlUsd = asNum(stats.tvl_usd);
    var fdvWax = asNum(stats.fdv_wax);
    var fdvUsd = asNum(stats.fdv_usd);
    var marketCapWax = asNum(stats.market_cap_wax);
    var marketCapUsd = asNum(stats.market_cap_usd);
    var hasMarketCap = metricStatusLive(stats, 'market_cap');
    var hasFdv = metricStatusLive(stats, 'fdv');
    var hasHolderCount = hasRealHolderSnapshot(stats) && stats.holder_count != null;
    var hasVolume7d = metricStatusLive(stats, 'volume_7d') && volume7d != null;
    var hasVolume30d = metricStatusLive(stats, 'volume_30d') && volume30d != null;
    var change24 = asNum(stats.price_change_24h != null ? stats.price_change_24h : stats.change_24h);
    var aggregateStatus = stats.aggregate_status ||
      (isCanonicalAggregateValid(stats)
        ? 'Canonical aggregate complete'
        : (asNum(stats.aggregate_truncated != null ? stats.aggregate_truncated : stats.aggregate_sources_truncated) === 1 ? 'Aggregate truncated; final metrics unavailable' : 'Indexed pairs found; advanced metrics partial'));
    var totalSupplyText = supply && supply.raw
      ? supply.raw
      : (token && token.raw && token.raw.total_supply != null ? String(token.raw.total_supply) + ' ' + selection.symbol : '');

    function statRow(label, value, options) {
      var valueClass = options && options.muted ? ' woe-stat-muted' : '';
      return '<div class="woe-stat-row">' +
        '<div class="woe-stat-label">' + escHtml(label) + '</div>' +
        '<div class="woe-stat-value' + valueClass + '">' + value + '</div>' +
      '</div>';
    }

    var statsHtml = '';
    statsHtml += statRow('Token', escHtml(selection.symbol + ' @ ' + selection.contract));
    statsHtml += statRow('Aggregate status', escHtml(aggregateStatus), { muted: !isCanonicalAggregateValid(stats) });
    statsHtml += statRow('Selected price source', selectedSource ? escHtml(selectedSource) : tokenAvailabilityHtml(stats, 'selected_price'));
    statsHtml += statRow('Current price in WAX and USD', currentPriceWax != null || currentPriceUsd != null
      ? escHtml(formatDualMetric(currentPriceWax, currentPriceUsd, 'WAX', '$'))
      : tokenAvailabilityHtml(stats, 'selected_price'));
    statsHtml += statRow('24h price change', change24 != null
      ? '<span class="' + escHtml(pctClass(change24)) + '">' + escHtml(fmtPct(change24)) + '</span>'
      : tokenAvailabilityHtml(stats, 'price_change_24h'));
    statsHtml += statRow('24h volume', volume24 != null
      ? escHtml(fmtNum(volume24) + ' WAX')
      : tokenAvailabilityHtml(stats, 'volume_24h'));
    statsHtml += statRow('Total indexed liquidity', liquidityWax != null || liquidityUsd != null
      ? escHtml(formatDualMetric(liquidityWax, liquidityUsd))
      : tokenAvailabilityHtml(stats, 'liquidity'));
    statsHtml += statRow('Cumulated pair liquidity', cumulatedLiquidityWax != null || cumulatedLiquidityUsd != null
      ? escHtml(formatDualMetric(cumulatedLiquidityWax, cumulatedLiquidityUsd))
      : tokenAvailabilityHtml(stats, 'liquidity'));
    statsHtml += statRow('Source count', sourceCount != null ? escHtml(String(sourceCount)) : availabilityHtml());
    statsHtml += statRow('Indexed pair count', indexedPairCount != null ? escHtml(String(indexedPairCount)) : availabilityHtml());
    statsHtml += statRow('Strongest pair', strongestPair ? escHtml(strongestPair) : tokenAvailabilityHtml(stats, 'selected_price'));
    statsHtml += statRow('Holder count', hasHolderCount ? escHtml(String(stats.holder_count)) : tokenAvailabilityHtml(stats, 'holder_count'), { muted: !hasHolderCount });
    statsHtml += statRow('Decimals', token.decimals != null ? escHtml(String(token.decimals)) : availabilityHtml());
    statsHtml += statRow('Total token supply', totalSupplyText ? escHtml(totalSupplyText) : availabilityHtml());
    statsHtml += statRow('Circulating supply', stats.circulating_supply != null ? escHtml(String(stats.circulating_supply) + ' ' + selection.symbol) : tokenAvailabilityHtml(stats, 'circulating_supply'), { muted: stats.circulating_supply == null });
    statsHtml += statRow('Indexed liquidity TVL', tvlWax != null || tvlUsd != null
      ? escHtml(formatDualMetric(tvlWax, tvlUsd))
      : tokenAvailabilityHtml(stats, 'liquidity'));
    statsHtml += statRow('7d volume', hasVolume7d
      ? escHtml(fmtNum(volume7d) + ' WAX')
      : historicalVolumeAvailabilityHtml(stats, 'volume_7d'));
    statsHtml += statRow('30d volume', hasVolume30d
      ? escHtml(fmtNum(volume30d) + ' WAX')
      : historicalVolumeAvailabilityHtml(stats, 'volume_30d'));
    statsHtml += statRow('Market cap', hasMarketCap && (marketCapWax != null || marketCapUsd != null)
      ? escHtml(formatDualMetric(marketCapWax, marketCapUsd))
      : tokenAvailabilityHtml(stats, 'market_cap'), { muted: !(hasMarketCap && (marketCapWax != null || marketCapUsd != null)) });
    statsHtml += statRow('Fully diluted valuation', hasFdv && (fdvWax != null || fdvUsd != null)
      ? escHtml(formatDualMetric(fdvWax, fdvUsd))
      : tokenAvailabilityHtml(stats, 'fdv'));

    setHtml('woe-token-stats', statsHtml);
  }

  function renderChartUnavailable(context, reason, metaLabel) {
    var candidate = context && context.markets && context.markets[0] ? context.markets[0] : null;
    var nextCandidate = context && context.markets && context.markets[1] ? context.markets[1] : null;
    var selectedSource = candidate
      ? candidate.source + (candidate.marketId ? ' #' + candidate.marketId : '')
      : UNAVAILABLE_TEXT;
    var nextSource = nextCandidate
      ? nextCandidate.source + (nextCandidate.marketId ? ' #' + nextCandidate.marketId : '')
      : 'No alternate indexed pair candidate available';
    var statusText = metaLabel || reason || 'Indexed candles not available yet for this pair';
    setHtml('woe-chart-panel',
      '<div class="woe-chart-placeholder-card">' +
        '<div class="woe-chart-placeholder-grid">' +
          '<div><span>Selected source</span><strong>' + escHtml(selectedSource) + '</strong></div>' +
          '<div><span>Status</span><strong>' + escHtml(statusText) + '</strong></div>' +
          '<div><span>Reason</span><strong>' + escHtml(reason || 'No backend OHLCV candles are indexed for this pair yet') + '</strong></div>' +
          '<div><span>Next candidate</span><strong>' + escHtml(nextSource) + '</strong></div>' +
        '</div>' +
        '<p>Indexed candles not available yet for this pair. Pair proof is available below. No fake candles are shown.</p>' +
      '</div>');
    setText('woe-chart-meta', statusText);
  }

  function renderChart(context) {
    var backendChartMeta = '';
    if (state.backend.mode === 'backend') {
      var backendKey = 'backend:' + context.selection.key;
      var backendBundle = state.chartCache[backendKey];
      if (state.chartPending[backendKey] && !backendBundle) {
        setHtml('woe-chart-panel', '<p class="woe-loading">Checking indexed chart candles for the best available source.</p>');
        setText('woe-chart-meta', 'Selecting chart source by indexed candles, volume, and liquidity');
        return;
      }
      if (!backendBundle || !Array.isArray(backendBundle.candles) || backendBundle.candles.length === 0) {
        renderChartUnavailable(context, backendBundle && backendBundle.unavailable ? backendBundle.unavailable : 'No indexed backend candles returned for the selected source', SOURCE_NOT_INDEXED_TEXT);
        return;
      }
      var backendSource = backendBundle.source || {};
      var backendMarket = {
        marketId: backendSource.pair_id || backendSource.pairId || backendKey,
        tokenA: {
          contract: backendSource.token_a_contract || '',
          symbol: backendSource.token_a_symbol || '',
          key: tokenKey(backendSource.token_a_contract, backendSource.token_a_symbol),
        },
        tokenB: {
          contract: backendSource.token_b_contract || '',
          symbol: backendSource.token_b_symbol || '',
          key: tokenKey(backendSource.token_b_contract, backendSource.token_b_symbol),
        },
        currentPriceText: UNAVAILABLE_TEXT,
        change24: null,
      };
      backendChartMeta = backendSource.source
        ? 'Indexed candles from ' + backendSource.source + ' #' + backendMarket.marketId
        : 'Indexed backend candles';
      return renderChartBundle(backendBundle, backendMarket, backendChartMeta);
    }

    var market = context.chartMarket;
    if (!market || !market.marketId) {
      renderChartUnavailable(context, 'No chartable indexed pair is available for the selected token', 'Best chartable indexed pair when available');
      return;
    }

    if (state.chartPending[market.marketId] && !hasOwn(state.chartCache, market.marketId)) {
      setHtml('woe-chart-panel', '<p class="woe-loading">Loading Alcor chart candles for market #' + escHtml(market.marketId) + '…</p>');
      setText('woe-chart-meta', 'Fetching /markets/' + market.marketId + '/charts');
      return;
    }

    var bundle = state.chartCache[market.marketId];
    if (!bundle || !Array.isArray(bundle.candles) || bundle.candles.length === 0) {
      renderChartUnavailable(context, 'Alcor diagnostic candles are unavailable for market #' + market.marketId, 'Alcor chart unavailable');
      return;
    }

    return renderChartBundle(bundle, market, 'Alcor /markets/' + market.marketId + '/charts - 30 day window');
  }

  function renderChartBundle(bundle, market, chartMetaLabel) {
    var candles = bundle.candles.slice(-30);
    var historicalVolumes = computeHistoricalVolumes(bundle);
    var chartHostId = 'woe-lightweight-chart-' + String(bundle.marketId || market.marketId || 'chart').replace(/[^a-z0-9_-]/gi, '-');
    var summaryHtml = '<div class="woe-chart-summary">' +
      '<span><strong>Market:</strong> #' + escHtml(market.marketId) + ' (' + escHtml(describeToken(market.tokenA)) + ' / ' + escHtml(describeToken(market.tokenB)) + ')</span>' +
      '<span><strong>Last:</strong> ' + escHtml(market.currentPriceText) + '</span>' +
      '<span><strong>24h change:</strong> <span class="' + escHtml(pctClass(market.change24)) + '">' + escHtml(market.change24 != null ? fmtPct(market.change24) : UNAVAILABLE_TEXT) + '</span></span>' +
      '<span><strong>30d candles:</strong> ' + escHtml(String(candles.length)) + '</span>' +
      '<span><strong>7d volume:</strong> ' + escHtml(historicalVolumes && historicalVolumes.sevenDay != null ? fmtNum(historicalVolumes.sevenDay) + ' ' + (market.tokenA.symbol || '') : UNAVAILABLE_TEXT) + '</span>' +
    '</div>';
    setHtml('woe-chart-panel', summaryHtml + '<div id="' + escHtml(chartHostId) + '" class="woe-lightweight-chart" role="img" aria-label="Indexed OHLCV candlestick chart"></div>');
    if (!renderLightweightCandles(chartHostId, candles)) {
      setHtml('woe-chart-panel', summaryHtml + '<div class="woe-chart-empty">Source not indexed yet. Lightweight Charts renderer unavailable, and no fallback fake chart is shown.</div>');
    }
    setText('woe-chart-meta', chartMetaLabel);
  }

  function getPairKey(market) {
    var source = market && (market.adapter || market.source) || '';
    var id = market && (market.marketId || market.pairId || market.pair_id || market.id) || '';
    if (!id) {
      var tokenAKey = market && market.tokenA && market.tokenA.key ? market.tokenA.key : '';
      var tokenBKey = market && market.tokenB && market.tokenB.key ? market.tokenB.key : '';
      id = tokenAKey + '|' + tokenBKey;
    }
    return encodeURIComponent(source + '::' + id);
  }

  function pairRowHtml(market, index, selectionKey) {
    var changeClass = pctClass(market.change24);
    var liquiditySort = market.liquidityUsd != null ? market.liquidityUsd : (market.liquidityWax != null ? market.liquidityWax : 0);
    var other = selectionKey ? getOtherToken(market, selectionKey) : null;
    var otherRecord = other ? findTokenRecord(state.tokenMap, other.contract, other.symbol) : null;
    var pairName = getMarketPairName(market);
    var chartStatus = state.backend.mode === 'backend' ? SOURCE_NOT_INDEXED_TEXT : (market.marketId ? 'Indexed Alcor candles' : SOURCE_NOT_INDEXED_TEXT);
    var pairKey = getPairKey(market);
    var reserves = [market.pooledTokenAText, market.pooledTokenBText].filter(function (value) {
      return value && value !== UNAVAILABLE_TEXT;
    }).join(' / ') || UNAVAILABLE_TEXT;
    var otherValue = otherRecord && (otherRecord.systemPrice != null || otherRecord.usdPrice != null)
      ? formatDualMetric(otherRecord.systemPrice, otherRecord.usdPrice, 'WAX', '$')
      : UNAVAILABLE_TEXT;
    return '<tr class="woe-pair-row" data-pair-key="' + escHtml(pairKey) + '">' +
      '<td data-col="rank" data-sortval="' + escHtml(String(index + 1)) + '" class="woe-num">' + escHtml(String(index + 1)) + '</td>' +
      '<td data-col="source">' + sourceCellHtml(market) + '</td>' +
      '<td data-col="pair"><button class="woe-pair-detail-link" type="button" data-pair-key="' + escHtml(pairKey) + '">' + escHtml(pairName) + '</button></td>' +
      (selectionKey
        ? '<td data-col="other">' + tokenCellHtml(other) + '</td><td data-col="value">' + (otherValue === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(otherValue)) + '</td>'
        : '<td data-col="tokenA">' + tokenCellHtml(market.tokenA) + '</td><td data-col="tokenB">' + tokenCellHtml(market.tokenB) + '</td>') +
      '<td data-col="liq" data-sortval="' + escHtml(String(liquiditySort || 0)) + '" class="woe-num">' + (market.liquidityText === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.liquidityText)) + '</td>' +
      '<td data-col="waxliq" data-sortval="' + escHtml(String(market.liquidityWax || 0)) + '" class="woe-num">' + (market.liquidityWax != null ? escHtml(fmtNum(market.liquidityWax) + ' WAX') : availabilityHtml()) + '</td>' +
      '<td data-col="price" data-sortval="' + escHtml(String(market.currentPrice || 0)) + '" class="woe-num">' + (market.currentPriceText === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.currentPriceText)) + '</td>' +
      '<td data-col="chg" data-sortval="' + escHtml(String(market.change24 || 0)) + '" class="woe-num ' + changeClass + '">' + (market.change24 != null ? escHtml(fmtPct(market.change24)) : availabilityHtml()) + '</td>' +
      '<td data-col="vol24" data-sortval="' + escHtml(String(market.volume24 || 0)) + '" class="woe-num">' + (market.volume24Text === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.volume24Text)) + '</td>' +
      '<td data-col="reserves">' + (reserves === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(reserves)) + '</td>' +
      '<td data-col="chart">' + escHtml(chartStatus) + '</td>' +
      '<td><a href="' + escHtml(market.explorerUrl) + '" target="_blank" rel="noopener noreferrer" class="woe-chain-link">' + escHtml(market.explorerLabel) + '</a></td>' +
    '</tr>';
  }

  function attachPairDetailLinks() {
    document.querySelectorAll('.woe-pair-detail-link').forEach(function (button) {
      if (button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';
      button.addEventListener('click', function () {
        var pairKey = button.getAttribute('data-pair-key');
        var rows = state.selected && state.selected.key ? getMarketsForSelection(state.selected) : getAllMarkets();
        var market = rows.find(function (candidate) {
          return getPairKey(candidate) === pairKey;
        });
        if (market) renderPairDetail(market);
      });
    });
  }

  function renderPairDetail(market) {
    state.selectedPair = market;
    setText('woe-pair-detail-status', getMarketPairName(market) + ' / ' + (market.adapter || market.source || 'source'));
    var chartCopy = state.backend.mode === 'backend' ? 'Source not indexed yet' : (market.marketId ? 'Pair chart indexed through Alcor market candles when selected as token chart.' : 'Source not indexed yet');
    var html = '<div class="woe-pair-detail-grid">' +
      '<div class="woe-pair-detail-main">' +
        '<h3>' + escHtml(getMarketPairName(market)) + '</h3>' +
        '<p>' + escHtml(market.adapter || market.source || 'Source') + ' / Pair #' + escHtml(market.marketId || UNAVAILABLE_TEXT) + '</p>' +
        '<div class="woe-stats-grid">' +
          '<div class="woe-stat-row"><div class="woe-stat-label">Token A</div><div class="woe-stat-value">' + escHtml(describeToken(market.tokenA)) + '</div></div>' +
          '<div class="woe-stat-row"><div class="woe-stat-label">Token B</div><div class="woe-stat-value">' + escHtml(describeToken(market.tokenB)) + '</div></div>' +
          '<div class="woe-stat-row"><div class="woe-stat-label">Reserves</div><div class="woe-stat-value">' + escHtml((market.pooledTokenAText || UNAVAILABLE_TEXT) + ' / ' + (market.pooledTokenBText || UNAVAILABLE_TEXT)) + '</div></div>' +
          '<div class="woe-stat-row"><div class="woe-stat-label">Liquidity</div><div class="woe-stat-value">' + escHtml(market.liquidityText || UNAVAILABLE_TEXT) + '</div></div>' +
          '<div class="woe-stat-row"><div class="woe-stat-label">WAX Liquidity</div><div class="woe-stat-value">' + (market.liquidityWax != null ? escHtml(fmtNum(market.liquidityWax) + ' WAX') : availabilityHtml()) + '</div></div>' +
          '<div class="woe-stat-row"><div class="woe-stat-label">24h Volume</div><div class="woe-stat-value">' + escHtml(market.volume24Text || UNAVAILABLE_TEXT) + '</div></div>' +
          '<div class="woe-stat-row"><div class="woe-stat-label">24h Change</div><div class="woe-stat-value ' + escHtml(pctClass(market.change24)) + '">' + escHtml(market.change24 != null ? fmtPct(market.change24) : UNAVAILABLE_TEXT) + '</div></div>' +
          '<div class="woe-stat-row"><div class="woe-stat-label">Selected Price</div><div class="woe-stat-value">' + escHtml(market.currentPriceText || UNAVAILABLE_TEXT) + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="woe-pair-chart-state">' + escHtml(chartCopy) + '</div>' +
    '</div>';
    setHtml('woe-pair-detail-panel', html);
    var detail = document.getElementById('woe-pair-detail');
    if (detail && typeof detail.scrollIntoView === 'function') detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderMatrix(context) {
    var rows = context.markets;
    setText('woe-matrix-meta', state.backend.mode === 'backend'
      ? 'Selected token pairs across alcor, swap.alcor, swap.taco, swap.nefty, swap.box. All-pairs WAX valuation is partial when a pair cannot be valued through a trusted indexed WAX route.'
      : 'Diagnostic fallback active.');

    if (!rows || rows.length === 0) {
      setHtml('woe-matrix-body', '<tr><td colspan="13" class="woe-loading">No indexed pairs detected for this token.</td></tr>');
      setText('woe-matrix-count', '0 rows');
      return;
    }

    setHtml('woe-matrix-body', rows.map(function (market, index) {
      return pairRowHtml(market, index, context.selection.key);
    }).join(''));
    setText('woe-matrix-count', rows.length + ' row(s)');
    attachPairDetailLinks();
    attachTableSort('woe-table-matrix');
    attachTableFilter('woe-filter-matrix', 'woe-table-matrix');
  }

  function renderGlobalPairMatrix() {
    var rows = getAllMarkets().slice().sort(function (a, b) {
      return (b.rankMetric || 0) - (a.rankMetric || 0);
    }).slice(0, 250);
    if (!rows.length) {
      setHtml('woe-pairs-body', '<tr><td colspan="13" class="woe-loading">No indexed pair rows are available.</td></tr>');
      return;
    }
    setHtml('woe-pairs-body', rows.map(function (market, index) {
      return pairRowHtml(market, index, '');
    }).join(''));
    setText('woe-pairs-count', rows.length + ' indexed pair row(s)');
    attachPairDetailLinks();
    attachTableSort('woe-table-pairs');
    attachTableFilter('woe-filter-pairs', 'woe-table-pairs');
  }

  function getFirstNumeric(obj, paths) {
    if (!obj || !Array.isArray(paths)) return null;
    for (var i = 0; i < paths.length; i++) {
      var current = obj;
      var parts = paths[i].split('.');
      for (var j = 0; j < parts.length; j++) {
        if (current == null) break;
        current = current[parts[j]];
      }
      var parsed = asNum(current);
      if (parsed != null) return parsed;
    }
    return null;
  }

  function updateTopBarWaxPrice() {
    var waxPriceEl = document.getElementById('woe-topbar-wax-price');
    var waxMetaEl = document.getElementById('woe-topbar-wax-price-meta');
    if (!waxPriceEl || !waxMetaEl) return;

    var analytics = state.globalAnalytics || null;
    var analyticsUsd = getFirstNumeric(analytics, [
      'wax_price_usd',
      'wax_usd',
      'wax.usd',
      'price_usd',
      'prices.wax_usd',
    ]);
    var analyticsWax = getFirstNumeric(analytics, [
      'wax_price_wax',
      'wax_wax',
      'wax.wax',
      'price_wax',
      'prices.wax_wax',
    ]);
    var waxToken = findTokenRecord(state.tokenMap, 'eosio.token', 'WAX');
    var usdPrice = analyticsUsd != null ? analyticsUsd : (waxToken && waxToken.usdPrice != null ? waxToken.usdPrice : null);
    var waxPrice = analyticsWax != null ? analyticsWax : (waxToken && waxToken.systemPrice != null ? waxToken.systemPrice : null);

    if (usdPrice == null && waxPrice == null) {
      waxPriceEl.textContent = '$ --';
      waxMetaEl.textContent = 'No live WAX price returned yet';
      setText('woe-kpi-wax-price', '$ --');
      return;
    }

    waxPriceEl.textContent = usdPrice != null ? '$' + fmtPrice(usdPrice) : fmtPrice(waxPrice) + ' WAX';
    setText('woe-kpi-wax-price', waxPriceEl.textContent);
    if (usdPrice != null && waxPrice != null) {
      waxMetaEl.textContent = fmtPrice(waxPrice) + ' WAX · read-only public feed';
    } else if (usdPrice != null) {
      waxMetaEl.textContent = 'USD quote · read-only public feed';
    } else {
      waxMetaEl.textContent = 'WAX quote · read-only public feed';
    }
  }

  function renderSelectedToken() {
    if (!state.selected.key) {
      setHtml('woe-token-summary',
        '<div class="woe-scanner-first-state">' +
          '<span class="woe-scanner-first-icon" aria-hidden="true">◫</span>' +
          '<p>Select a token bubble to load indexed analytics.</p>' +
          '<p class="woe-scanner-first-hint">Deep links still work with <code>?token=SYMBOL&amp;contract=CONTRACT</code>.</p>' +
        '</div>');
      setText('woe-detail-status', 'Click a bubble or token row');
      setHtml('woe-token-stats', '');
      setHtml('woe-chart-panel',
        '<div class="woe-chart-empty">Select a token to check indexed candles.</div>');
      setHtml('woe-matrix-body',
        '<tr><td colspan="13" class="woe-loading">Select a token to inspect its indexed pairs.</td></tr>');
      return;
    }

    var context = getSelectedTokenContext();
    renderTokenSummary(context);
    renderTokenStats(context);
    renderChart(context);
    renderMatrix(context);
  }

  function ensureSelectedTokenData() {
    if (!state.selected.key) return;
    var context = getSelectedTokenContext();
    ensureSelectedChainStat(context.selection);
    if (state.backend.mode === 'backend') {
      loadSelectedTokenDetail(context.selection).then(function () {
        if (state.selected.key === context.selection.key) renderSelectedToken();
      });
      loadSelectedTokenPairs(context.selection).then(function () {
        if (state.selected.key === context.selection.key) renderSelectedToken();
      });
      loadSelectedTokenChart(context.selection).then(function () {
        if (state.selected.key === context.selection.key) renderSelectedToken();
      });
    } else if (context.chartMarket && context.chartMarket.marketId) {
      loadChartData(context.chartMarket.marketId).then(function () {
        if (state.selected.key === context.selection.key) renderSelectedToken();
      });
    }
  }

  /* ── Account token balance lookup ───────────────────────────── */

  function renderHolderPlaceholder() {
    setHtml('woe-holders-panel',
      '<div class="woe-placeholder woe-holder-index-empty">' +
        '<span class="woe-placeholder-icon">IDX</span>' +
        '<p>Holder indexing not enabled yet.</p>' +
        '<p>No fake holder rows are shown. Holder count and top-holder rows will appear here only after the WaxOnEdge backend exposes indexed holder data.</p>' +
      '</div>'
    );
    setText('woe-holder-status', 'Holder indexing not enabled yet');
  }
  /* ── Wide / fullscreen analytics terminal mode ──────────────── */

  var WOE_WIDE_CLASS = 'woe-wide-mode';

  function isWideMode() {
    return document.body && document.body.classList.contains(WOE_WIDE_CLASS);
  }

  function applyWideMode(enabled) {
    if (!document.body) return;
    if (enabled) {
      document.body.classList.add(WOE_WIDE_CLASS);
    } else {
      document.body.classList.remove(WOE_WIDE_CLASS);
    }
    var btn = document.getElementById('woe-wide-toggle');
    if (btn) {
      btn.textContent = enabled ? 'Exit Wide' : 'Wide';
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
    try { localStorage.setItem('woe_wide_mode', enabled ? '1' : '0'); } catch (_) {}
  }

  function toggleWideMode() {
    applyWideMode(!isWideMode());
  }

  function restoreWideMode() {
    try {
      if (localStorage.getItem('woe_wide_mode') === '1') {
        applyWideMode(true);
      }
    } catch (_) {}
  }

  /* ── Boot ───────────────────────────────────────────────────── */

  function boot() {
    restoreWideMode();
    var wideBtn = document.getElementById('woe-wide-toggle');
    if (wideBtn && !wideBtn.dataset.bound) {
      wideBtn.dataset.bound = 'true';
      wideBtn.addEventListener('click', toggleWideMode);
    }
    try {
      if (localStorage.getItem('woe_wide_mode') === '0') applyWideMode(false);
    } catch (_) {}

    renderSourceCards();
    attachGlobalSearch();
    attachDashboardControls();
    renderHolderPlaceholder();
    attachTableSort('woe-table-matrix');
    attachTableFilter('woe-filter-matrix', 'woe-table-matrix');

    waxonedgeApi('/bootstrap').then(function (payload) {
      if (applyBackendBootstrap(payload)) {
        renderLoadedData();
        return;
      }
      return loadDiagnosticFallback();
    });

    window.addEventListener('popstate', function () {
      var selection = getSelectionFromLocation();
      if (!selection.key) return;
      state.selected = selection;
      renderTokens();
      renderSelectedToken();
      ensureSelectedTokenData();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());

/**
 * waxonedge-bubbles-v2.js
 *
 * AntBubbles-style canvas scanner for WaxOnEdge. This is a visual reference
 * port only: token data comes from the Moonboys WaxOnEdge multi-DEX backend.
 */
(function () {
  'use strict';

  var BOOTSTRAP_API = '/api/waxonedge/bootstrap';
  var HEALTH_API = '/api/waxonedge/indexer-health';
  var LIVE_API = '/api/waxonedge/live';
  var LIVE_STREAM_API = '/api/waxonedge/live/stream';
  var LIVE_POLL_MS = 1000;
  var WAXONEDGE_FEATURED_TOKENS = Array.isArray(window.WAXONEDGE_FEATURED_TOKENS)
    ? window.WAXONEDGE_FEATURED_TOKENS
    : [];
  var WAXONEDGE_FEATURED_TOKEN_MAP = WAXONEDGE_FEATURED_TOKENS.reduce(function (acc, token) {
    acc[token.key] = token;
    return acc;
  }, {});
  var METRIC_LABELS = {
    change: '% Change',
    price: 'Price',
    volume: 'Volume',
    tvl: 'TVL',
    liquidity: 'Liquidity',
    mcap: 'Mkt Cap',
  };
  var TIMEFRAME_LABELS = { '24h': '24h', '7d': '7D', '30d': '30D' };
  var DEFAULT_METRIC_ALLOWED = {
    change: true,
    price: true,
    volume: true,
    tvl: true,
    liquidity: true,
    mcap: true,
  };
  var DEFAULT_TIMEFRAME_ALLOWED = { '24h': true, '7d': false, '30d': false };
  var SOURCE_ORDER = ['alcor', 'swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box'];
  var IMAGE_CACHE_LIMIT = 160;
  var BUBBLE_CANVAS_CACHE_LIMIT = 240;
  var imageCache = new Map();
  var bubbleCanvasCache = new Map();
  var reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var MOVEMENT_EVENT_TABLE = [
    { min: 1, max: 45, event: 'normal_drift', label: 'normal drift' },
    { min: 46, max: 60, event: 'soft_bounce', label: 'soft bounce' },
    { min: 61, max: 72, event: 'orbit_wobble', label: 'orbit wobble' },
    { min: 73, max: 82, event: 'pulse_drift', label: 'pulse drift' },
    { min: 83, max: 90, event: 'magnetic_repel', label: 'magnetic repel' },
    { min: 91, max: 95, event: 'whale_pulse', label: 'whale pulse' },
    { min: 96, max: 98, event: 'shockwave', label: 'shockwave' },
    { min: 99, max: 99, event: 'bonus_surge', label: 'bonus surge' },
    { min: 100, max: 100, event: 'mega_event', label: 'mega event' },
  ];

  var state = {
    payload: null,
    health: null,
    capabilities: null,
    records: [],
    pairs: [],
    visible: [],
    nodes: [],
    metric: 'mcap',
    timeframe: '24h',
    query: '',
    hovered: null,
    dragging: null,
    selected: null,
    shockwaves: [],
    liveFeed: [],
    missingFeaturedLogged: {},
    lastImpactAt: 0,
    camera: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      focusUntil: 0,
      focusX: 0,
      focusY: 0,
    },
    canvas: null,
    ctx: null,
    board: null,
    tooltip: null,
    raf: 0,
    resizeTimer: 0,
    lastFrame: 0,
    lastUpdated: null,
    connected: false,
    live: {
      eventSource: null,
      pollTimer: 0,
      pollInFlight: false,
      cursor: null,
      cursorFromBackend: false,
      lastEventAt: null,
      transport: 'idle',
    },
  };

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeSymbol(value) {
    return String(value || '').trim().toUpperCase();
  }

  function normalizeContract(value) {
    return String(value || '').trim().toLowerCase();
  }

  function tokenKey(contract, symbol) {
    var c = normalizeContract(contract);
    var s = normalizeSymbol(symbol);
    return c && s ? c + '::' + s : '';
  }

  function asNum(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  function sourceRows(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value && value.value)) return value.value;
    if (Array.isArray(value && value.data)) return value.data;
    if (Array.isArray(value && value.results)) return value.results;
    return [];
  }

  function payloadData(envelope) {
    return envelope && envelope.data ? envelope.data : (envelope || {});
  }

  function fmtNum(value, decimals) {
    var n = asNum(value);
    var d = decimals == null ? 2 : decimals;
    if (n == null) return 'Not indexed';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(d) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(d) + 'K';
    return n.toFixed(d);
  }

  function fmtPrice(value) {
    var n = asNum(value);
    if (n == null) return 'Not indexed';
    if (Math.abs(n) >= 1000) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(4);
    if (Math.abs(n) >= 0.0001) return n.toFixed(6);
    return n.toExponential(4);
  }

  function fmtPct(value) {
    var n = asNum(value);
    if (n == null) return 'Not indexed';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function sourceLabel(value) {
    var source = String(value || '').trim().toLowerCase();
    if (source === 'alcor') return 'alcor';
    if (source === 'swap.alcor') return 'swap.alcor';
    if (source === 'swap.taco') return 'swap.taco';
    if (source === 'swap.nefty') return 'swap.nefty';
    if (source === 'swap.box') return 'swap.box';
    if (source.indexOf('taco') !== -1) return 'swap.taco';
    if (source.indexOf('nefty') !== -1) return 'swap.nefty';
    if (source.indexOf('box') !== -1) return 'swap.box';
    if (source.indexOf('alcor') !== -1) return source === 'alcor' ? 'alcor' : 'swap.alcor';
    return source || 'source';
  }

  function pairSourceKey(pair) {
    return sourceLabel(pair && (pair.source || pair.adapter || pair.rawSource || pair.raw_source));
  }

  function sourceRank(source) {
    var index = SOURCE_ORDER.indexOf(source);
    return index === -1 ? SOURCE_ORDER.length : index;
  }

  function compareSources(a, b) {
    var ar = sourceRank(a);
    var br = sourceRank(b);
    if (ar !== br) return ar - br;
    return String(a || '').localeCompare(String(b || ''));
  }

  function parseSourceKeys(value) {
    if (Array.isArray(value)) return value.map(sourceLabel).filter(Boolean);
    return String(value || '').split(',').map(sourceLabel).filter(Boolean);
  }

  function parseReasonCodes(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(function (item) { return String(item || '').trim(); }).filter(Boolean);
    }
    if (typeof value === 'object') {
      return Object.keys(value).filter(function (key) { return !!value[key]; });
    }
    return String(value || '').split(',').map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function capMap(map, limit) {
    while (map.size > limit) {
      var oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  }

  function metricConfidenceFrom(token, metricName) {
    var direct = token && (token[metricName + '_confidence'] || token[metricName + 'Confidence']);
    if (direct) return normalizeConfidence(direct) || 'unavailable';
    var status = token && (token.metric_status || token.metricStatus);
    var metricStatus = status && status[metricName];
    if (!metricStatus) return 'unavailable';
    return metricStatus.live === true ? 'good' : (metricStatus.reason ? 'unavailable' : 'weak');
  }

  function normalizeConfidence(value) {
    var text = String(value == null ? '' : value).trim().toLowerCase();
    if (text === 'good' || text === 'weak' || text === 'unavailable') return text;
    if (text === 'live' || text === 'true' || text === '1') return 'good';
    if (text === 'false' || text === '0' || text === 'missing' || text === 'not_indexed') return 'unavailable';
    return '';
  }

  function prefersReducedMotion() {
    return !!(reducedMotionQuery && reducedMotionQuery.matches);
  }

  function shouldAnimate() {
    return !document.hidden && !prefersReducedMotion();
  }

  function pairKeys(pair) {
    return [
      tokenKey(pair.token_a_contract, pair.token_a_symbol),
      tokenKey(pair.token_b_contract, pair.token_b_symbol),
    ].filter(Boolean);
  }

  function pairLabel(pair) {
    if (!pair) return 'Not indexed';
    var a = normalizeSymbol(pair.token_a_symbol);
    var b = normalizeSymbol(pair.token_b_symbol);
    return (a && b ? a + '/' + b : 'Pair') + (pair.pair_id ? ' #' + pair.pair_id : '');
  }

  function betterPair(a, b) {
    if (!a) return b;
    if (!b) return a;
    var av = asNum(a.liquidity_wax) || asNum(a.liquidity_usd) || asNum(a.volume_24h_wax) || 0;
    var bv = asNum(b.liquidity_wax) || asNum(b.liquidity_usd) || asNum(b.volume_24h_wax) || 0;
    return bv > av ? b : a;
  }

  function tokenSearchText(record) {
    return [
      record.symbol,
      record.displaySymbol,
      record.contract,
      record.selectedSource,
      record.selectedPair,
      record.strongestPairLabel,
      record.sources.join(' '),
    ].join(' ').toLowerCase();
  }

  function pairDerivedRecord(featured, key) {
    var parts = String(key || '').split('::');
    var contract = normalizeContract(parts[0]);
    var symbol = normalizeSymbol(parts[1]);
    return {
      id: key,
      key: key,
      symbol: symbol,
      displaySymbol: featured && featured.label ? featured.label : symbol,
      contract: contract,
      logoUrl: '',
      selectedPriceWax: null,
      selectedPriceUsd: null,
      change24: null,
      change7d: null,
      change30d: null,
      volume24Wax: null,
      volume24Usd: null,
      volume7dWax: null,
      volume7dUsd: null,
      volume30dWax: null,
      volume30dUsd: null,
      graphLiquidityWax: null,
      graphLiquidityUsd: null,
      liquidityWax: null,
      liquidityUsd: null,
      tvlWax: null,
      tvlUsd: null,
      selectedPriceConfidence: 'unavailable',
      liquidityConfidence: 'unavailable',
      tvlConfidence: 'unavailable',
      metricReasonCodes: [],
      marketCapWax: null,
      marketCapUsd: null,
      marketCapConfidence: 'unavailable',
      fdvWax: null,
      fdvUsd: null,
      fdvConfidence: 'unavailable',
      supply: '',
      selectedPair: '',
      selectedSource: '',
      sourceCount: 0,
      indexedPairCount: 0,
      computedPairCount: 0,
      sourcesMap: {},
      sources: [],
      strongestPair: null,
      strongestPairLabel: '',
      unavailableReasons: '',
    };
  }

  function valueForMetric(record, metric, timeframe) {
    if (metric === 'change') {
      var change = timeframe === '24h' ? record.change24 : record['change' + timeframe];
      return change != null ? Math.abs(change) : null;
    }
    if (metric === 'price') {
      if (record.selectedPriceConfidence !== 'good') return null;
      return record.selectedPriceUsd != null ? record.selectedPriceUsd : record.selectedPriceWax;
    }
    if (metric === 'volume') {
      if (timeframe === '7d') return record.volume7dUsd != null ? record.volume7dUsd : record.volume7dWax;
      if (timeframe === '30d') return record.volume30dUsd != null ? record.volume30dUsd : record.volume30dWax;
      return record.volume24Usd != null ? record.volume24Usd : record.volume24Wax;
    }
    if (metric === 'tvl') {
      if (record.tvlConfidence !== 'good') return null;
      if (record.bubbleTvlUsd != null) return record.bubbleTvlUsd;
      if (record.bubbleTvlWax != null) return record.bubbleTvlWax;
      if ((record.bubbleSuspiciousLiquidityPairCount || 0) > 0) return null;
      return record.tvlUsd != null ? record.tvlUsd : record.tvlWax;
    }
    if (metric === 'liquidity') {
      if (record.liquidityConfidence !== 'good') return null;
      return record.graphLiquidityWax;
    }
    if (metric === 'mcap') {
      if (record.marketCapConfidence !== 'good') return null;
      return record.marketCapWax;
    }
    return null;
  }

  function verifiedBubbleSizeValue(record) {
    if (record.marketCapConfidence === 'good' && record.marketCapWax != null) return record.marketCapWax;
    return null;
  }

  function firstDefinedCapability(keys) {
    var caps = state.capabilities || {};
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(caps, key)) return caps[key];
    }
    return undefined;
  }

  function capabilityEnabled(keys, fallback) {
    var value = firstDefinedCapability(keys);
    if (value == null) return !!fallback;
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    return String(value).toLowerCase() === 'true';
  }

  function metricAllowed(metric) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_METRIC_ALLOWED, metric)) return false;
    if (metric === 'mcap') return capabilityEnabled(['market_cap', 'mcap'], DEFAULT_METRIC_ALLOWED.mcap);
    return capabilityEnabled([metric], DEFAULT_METRIC_ALLOWED[metric]);
  }

  function timeframeAllowed(timeframe) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_TIMEFRAME_ALLOWED, timeframe)) return false;
    if (timeframe === '7d') return capabilityEnabled(['volume_7d', 'history_7d', 'timeframe_7d'], false);
    if (timeframe === '30d') return capabilityEnabled(['volume_30d', 'history_30d', 'timeframe_30d'], false);
    return DEFAULT_TIMEFRAME_ALLOWED[timeframe];
  }

  function updateCapabilityControls() {
    document.querySelectorAll('[data-woe-metric]').forEach(function (button) {
      var metric = button.getAttribute('data-woe-metric') || '';
      var allowed = metricAllowed(metric);
      button.hidden = !allowed;
      button.disabled = !allowed;
      button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
      button.classList.toggle('is-active', allowed && metric === state.metric);
    });
    document.querySelectorAll('[data-woe-timeframe]').forEach(function (button) {
      var timeframe = button.getAttribute('data-woe-timeframe') || '';
      var allowed = timeframeAllowed(timeframe);
      button.hidden = !allowed;
      button.disabled = !allowed;
      button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
      button.classList.toggle('is-active', allowed && timeframe === state.timeframe);
    });
  }

  function extractMetricCapabilities(payload) {
    var data = payloadData(payload);
    var caps = data.metric_capabilities || data.metricCapabilities || {};
    if (data.summary && (data.summary.metric_capabilities || data.summary.metricCapabilities)) {
      caps = data.summary.metric_capabilities || data.summary.metricCapabilities;
    }
    if (caps.metrics) caps = caps.metrics;
    return caps || {};
  }

  function applyMetricCapabilities(payload) {
    state.capabilities = extractMetricCapabilities(payload);
    if (!metricAllowed(state.metric)) {
      state.metric = ['change', 'price', 'volume', 'liquidity', 'tvl', 'mcap'].find(function (metric) {
        return metricAllowed(metric);
      }) || 'change';
    }
    if (!timeframeAllowed(state.timeframe)) state.timeframe = '24h';
    updateCapabilityControls();
  }

  function displayValue(record) {
    if (state.metric === 'change') {
      var change = state.timeframe === '24h' ? record.change24 : record['change' + state.timeframe];
      return fmtPct(change);
    }
    if (state.metric === 'price') {
      if (record.selectedPriceConfidence === 'weak') return 'Proof weak';
      if (record.selectedPriceConfidence !== 'good') return 'Not indexed';
      if (record.selectedPriceUsd != null) return '$' + fmtPrice(record.selectedPriceUsd);
      if (record.selectedPriceWax != null) return fmtPrice(record.selectedPriceWax) + ' WAX';
      return 'No indexed price';
    }
    if (state.metric === 'volume') {
      if (state.timeframe === '7d') return record.volume7dUsd != null ? '$' + fmtNum(record.volume7dUsd) : 'No indexed 7D volume';
      if (state.timeframe === '30d') return record.volume30dUsd != null ? '$' + fmtNum(record.volume30dUsd) : 'No indexed 30D volume';
      if (record.volume24Usd != null) return '$' + fmtNum(record.volume24Usd);
      if (record.volume24Wax != null) return fmtNum(record.volume24Wax) + ' WAX';
      return 'No indexed volume';
    }
    if (state.metric === 'tvl') {
      if (record.tvlConfidence === 'weak') return 'Proof weak';
      if (record.tvlConfidence !== 'good') return 'Not indexed';
      if (record.bubbleTvlUsd != null) return '$' + fmtNum(record.bubbleTvlUsd);
      if (record.bubbleTvlWax != null) return fmtNum(record.bubbleTvlWax) + ' WAX';
      if (record.tvlUsd != null) return '$' + fmtNum(record.tvlUsd);
      if (record.tvlWax != null) return fmtNum(record.tvlWax) + ' WAX';
      return 'No indexed TVL';
    }
    if (state.metric === 'liquidity') {
      if (record.liquidityConfidence === 'weak') return 'Proof weak';
      if (record.liquidityConfidence !== 'good') return 'Not indexed';
      if (record.graphLiquidityWax != null) return fmtNum(record.graphLiquidityWax) + ' WAX graph liq';
      return 'No graph liquidity';
    }
    if (state.metric === 'mcap') {
      if (record.marketCapConfidence === 'weak') return 'Proof weak';
      if (record.marketCapConfidence !== 'good') return 'No verified market cap';
      if (record.marketCapUsd != null) return '$' + fmtNum(record.marketCapUsd) + ' mcap';
      if (record.marketCapWax != null) return fmtNum(record.marketCapWax) + ' WAX mcap';
      return 'No verified market cap';
    }
    return 'Not indexed';
  }

  function waxUsdPrice() {
    var data = payloadData(state.payload);
    var price = data.summary && data.summary.wax_price_usd != null
      ? asNum(data.summary.wax_price_usd)
      : data.raw && data.raw.alcor_global
      ? asNum(data.raw.alcor_global.usd_price || data.raw.alcor_global.wax_usd || data.raw.alcor_global.price)
      : null;
    return price;
  }

  function toUsd(wax, usd) {
    var u = asNum(usd);
    if (u != null) return u;
    var w = asNum(wax);
    var waxUsd = waxUsdPrice();
    return w != null && waxUsd != null ? w * waxUsd : null;
  }

  function reweightedScore(parts) {
    var total = parts.reduce(function (sum, part) {
      return sum + (part.value != null && part.value > 0 ? part.weight : 0);
    }, 0);
    if (total <= 0) return 0;
    return parts.reduce(function (sum, part) {
      if (part.value == null || part.value <= 0) return sum;
      return sum + (Math.log10(1 + part.value) * (part.weight / total));
    }, 0);
  }

  function blendedMarketScore(record) {
    var liquidity = Math.max(
      record.liquidityConfidence === 'good' ? (toUsd(
        record.graphLiquidityWax,
        record.graphLiquidityUsd
      ) || 0) : 0,
      record.tvlConfidence === 'good' ? (toUsd(
        record.bubbleTvlWax != null ? record.bubbleTvlWax : record.tvlWax,
        record.bubbleTvlUsd != null ? record.bubbleTvlUsd : record.tvlUsd
      ) || 0) : 0
    );
    var volume = toUsd(record.volume24Wax, record.volume24Usd);
    var price = record.selectedPriceConfidence === 'good' ? toUsd(record.selectedPriceWax, record.selectedPriceUsd) : null;
    var change = asNum(record.change24);
    var movement = change == null ? null : Math.abs(change);
    var coverage = (record.indexedPairCount || 0) * 10 + (record.sourceCount || 0) * 18;
    var score = reweightedScore([
      { weight: 0.4, value: liquidity },
      { weight: 0.35, value: volume },
      { weight: 0.1, value: movement != null ? movement + (price || 0) * 0.001 : null },
      { weight: 0.15, value: coverage },
    ]);
    record.baseMarketScore = score;
    return score;
  }

  function metricEmphasis(record) {
    if (state.metric === 'volume') return valueForMetric(record, 'volume', state.timeframe) != null ? 1.04 : 1;
    if (state.metric === 'tvl') return valueForMetric(record, 'tvl', state.timeframe) != null ? 1.06 : 1;
    if (state.metric === 'liquidity') return valueForMetric(record, 'liquidity', state.timeframe) != null ? 1.04 : 1;
    if (state.metric === 'mcap') return valueForMetric(record, 'mcap', state.timeframe) != null ? 1.05 : 1;
    return 1;
  }

  function normalizeRecords(payload) {
    var data = payloadData(payload);
    var tokens = sourceRows(data.tokens);
    var pairs = sourceRows(data.pairs);
    var byKey = {};
    var visibleBubbleKeys = {};

    tokens.forEach(function (token) {
      var symbol = normalizeSymbol(token.symbol || token.id);
      var contract = normalizeContract(token.contract);
      var key = tokenKey(contract, symbol);
      var featured = WAXONEDGE_FEATURED_TOKEN_MAP[key];
      if (!key) return;
      if (token.visible_in_waxcash_bubbles !== true) return;
      visibleBubbleKeys[key] = true;
      var sources = parseSourceKeys(token.source_keys || token.sourceKeys || token.sources);
      byKey[key] = {
        id: key,
        key: key,
        symbol: symbol,
        displaySymbol: featured ? featured.label : symbol,
        contract: contract,
        logoUrl: token.icon_url || token.logo || token.image || '',
        selectedPriceWax: asNum(token.selected_price_wax != null ? token.selected_price_wax : token.price_wax),
        selectedPriceUsd: asNum(token.selected_price_usd != null ? token.selected_price_usd : token.price_usd),
        change24: asNum(token.change_24h),
        change7d: null,
        change30d: null,
        volume24Wax: asNum(token.volume_24h_wax != null ? token.volume_24h_wax : token.volume_24h),
        volume24Usd: asNum(token.volume_24h_usd),
        volume7dWax: asNum(token.volume_7d_wax),
        volume7dUsd: asNum(token.volume_7d_usd),
        volume30dWax: asNum(token.volume_30d_wax),
        volume30dUsd: asNum(token.volume_30d_usd),
        graphLiquidityWax: asNum(token.graph_liquidity_wax),
        graphLiquidityUsd: asNum(token.graph_liquidity_usd),
        liquidityWax: asNum(token.liquidity_wax),
        liquidityUsd: asNum(token.liquidity_usd),
        tvlWax: asNum(token.tvl_wax),
        tvlUsd: asNum(token.tvl_usd),
        bubbleLiquidityWax: asNum(token.bubble_liquidity_wax),
        bubbleLiquidityUsd: asNum(token.bubble_liquidity_usd),
        bubbleTvlWax: asNum(token.bubble_tvl_wax),
        bubbleTvlUsd: asNum(token.bubble_tvl_usd),
        bubbleSuspiciousLiquidityPairCount: asNum(token.bubble_suspicious_liquidity_pair_count),
        selectedPriceConfidence: metricConfidenceFrom(token, 'selected_price'),
        liquidityConfidence: metricConfidenceFrom(token, 'liquidity'),
        tvlConfidence: metricConfidenceFrom(token, 'tvl'),
        metricReasonCodes: parseReasonCodes(token.metric_reason_codes || token.reason_codes || token.unavailable_reasons),
        marketCapWax: asNum(token.market_cap_wax),
        marketCapUsd: asNum(token.market_cap_usd),
        marketCapConfidence: metricConfidenceFrom(token, 'market_cap'),
        fdvWax: asNum(token.fdv_wax),
        fdvUsd: asNum(token.fdv_usd),
        fdvConfidence: metricConfidenceFrom(token, 'fdv'),
        supply: token.circulating_supply || token.total_supply || '',
        selectedPair: token.selected_pair_id || '',
        selectedSource: sourceLabel(token.selected_pair_source),
        sourceCount: asNum(token.source_count) != null ? asNum(token.source_count) : (sources.length || 0),
        indexedPairCount: asNum(token.indexed_pair_count != null ? token.indexed_pair_count : token.pair_count) || 0,
        computedPairCount: 0,
        sourcesMap: sources.reduce(function (acc, source) { acc[source] = true; return acc; }, {}),
        sources: sources,
        strongestPair: null,
        strongestPairLabel: '',
        unavailableReasons: parseReasonCodes(token.unavailable_reasons).join(', '),
        visibleInWaxcashBubbles: true,
      };
    });

    pairs.forEach(function (pair) {
      pairKeys(pair).forEach(function (key) {
        if (!visibleBubbleKeys[key]) return;
        var featured = WAXONEDGE_FEATURED_TOKEN_MAP[key];
        if (!byKey[key]) {
          byKey[key] = pairDerivedRecord(featured || null, key);
        }
        var record = byKey[key];
        var source = pairSourceKey(pair);
        if (source) record.sourcesMap[source] = true;
        record.computedPairCount += 1;
        record.strongestPair = betterPair(record.strongestPair, pair);
      });
    });

    return Object.keys(byKey).map(function (key) {
      var record = byKey[key];
      if (!record) return null;
      record.sources = Object.keys(record.sourcesMap).sort(compareSources);
      record.sourceCount = Math.max(record.sourceCount || 0, record.sources.length);
      record.indexedPairCount = Math.max(record.indexedPairCount || 0, record.computedPairCount || 0);
      record.strongestPairLabel = record.strongestPair
        ? sourceLabel(record.strongestPair.source) + ' ' + pairLabel(record.strongestPair)
        : (record.selectedSource && record.selectedPair ? record.selectedSource + ' #' + record.selectedPair : 'Not indexed');
      record.searchText = tokenSearchText(record);
      record.score = (valueForMetric(record, 'price', '24h') != null ? 500000 : 0) +
        (record.indexedPairCount > 0 ? 250000 : 0) +
        (record.selectedPair ? 125000 : 0) +
        Math.log10(1 + (valueForMetric(record, 'liquidity', '24h') || 0)) * 1000 +
        Math.log10(1 + (record.volume24Usd || record.volume24Wax || 0)) * 700;
      return record;
    }).filter(function (record) {
      return record;
    });
  }

  function rankedRecords() {
    var query = state.query.toLowerCase();
    var base = state.records.filter(function (record) {
      if (!query) return true;
      return record.searchText.indexOf(query) !== -1;
    }).sort(function (a, b) {
      var av = valueForMetric(a, state.metric, state.timeframe);
      var bv = valueForMetric(b, state.metric, state.timeframe);
      if (av != null && bv == null) return -1;
      if (bv != null && av == null) return 1;
      if (bv !== av && av != null && bv != null) return Math.abs(bv) - Math.abs(av);
      return b.score - a.score;
    });
    return base.map(function (record, index) {
      record.rank = index + 1;
      return record;
    });
  }

  function computeRadii(records, width, height) {
    var count = Math.max(1, records.length);
    var mobile = width < 680;
    var metric = state.metric;
    var metricWeighted = metric === 'tvl' || metric === 'liquidity' || metric === 'volume' || metric === 'mcap';
    var rawValues = records.map(function (record) {
      var value = metric === 'mcap'
        ? verifiedBubbleSizeValue(record)
        : valueForMetric(record, metric, state.timeframe);
      return value == null ? 0 : Math.abs(value);
    });
    var positives = rawValues.filter(function (value) { return value > 0; }).sort(function (a, b) { return a - b; });
    var maxValue = positives.length ? positives[positives.length - 1] : 0;
    var p95 = positives.length
      ? positives[Math.max(0, Math.floor(positives.length * 0.95) - 1)]
      : maxValue;
    var ref = Math.max(p95 || maxValue || 1, 1);
    var hasOutliers = maxValue > ref * 1.01;
    var topFloor = hasOutliers ? 0.84 : 1;
    var exponent = metricWeighted ? (1 / 3) : 0.5;
    var norms = rawValues.map(function (value) {
      if (value <= 0) return metricWeighted ? 0.035 : 0.06;
      if (value <= ref) return Math.pow(value / ref, exponent) * topFloor;
      var denom = Math.max(0.0001, Math.log(maxValue / ref));
      return topFloor + (Math.log(value / ref) / denom) * (1 - topFloor);
    });
    var sumN = norms.reduce(function (sum, value) { return sum + value; }, 0);
    var sumN2 = norms.reduce(function (sum, value) { return sum + (value * value); }, 0);
    var fillTarget = mobile ? (metricWeighted ? 0.44 : 0.48) : (metricWeighted ? 0.32 : 0.34);
    var ratio = mobile ? (metricWeighted ? 5.6 : 4.1) : (metricWeighted ? 7.6 : 4.8);
    var ratioMinusOne = ratio - 1;
    var denom = count + (2 * ratioMinusOne * sumN) + (ratioMinusOne * ratioMinusOne * sumN2);
    var rawMin = Math.sqrt((width * height * fillTarget) / (Math.PI * Math.max(1, denom)));
    var minR = Math.max(metricWeighted ? (mobile ? 9 : 11) : (mobile ? 12 : 15), Math.round(rawMin));
    var viewportCap = Math.round(Math.min(width, height) * (metricWeighted ? (mobile ? 0.13 : 0.105) : (mobile ? 0.078 : 0.062)));
    var areaCap = Math.round(Math.sqrt(width * height * (metricWeighted ? (mobile ? 0.044 : 0.028) : (mobile ? 0.026 : 0.014)) / Math.PI));
    var maxR = Math.max(minR + (metricWeighted ? 24 : 10), Math.min(viewportCap, areaCap, Math.round(rawMin * ratio)));
    return records.map(function (record, index) {
      var norm = Math.max(metricWeighted ? 0.035 : 0.06, Math.min(1, norms[index] || 0));
      return Math.round(minR + norm * (maxR - minR));
    });
  }
  function seededUnit(seed) {
    var x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function sceneBounds(width, height, radius) {
    var safe = Math.max(radius + 14, 28);
    var top = Math.max(safe, Math.min(112, height * 0.16));
    var bottom = Math.max(safe, Math.min(62, height * 0.09));
    return {
      minX: safe,
      maxX: Math.max(safe, width - safe),
      minY: top,
      maxY: Math.max(top, height - bottom),
    };
  }

  function clampNodeToBounds(node, width, height) {
    var boundsRadius = visualRadius(node);
    var bounds = sceneBounds(width, height, boundsRadius);
    node.x = Math.max(bounds.minX, Math.min(bounds.maxX, node.x));
    node.y = Math.max(bounds.minY, Math.min(bounds.maxY, node.y));
  }

  function layoutPosition(index, count, width, height, radius) {
    var bounds = sceneBounds(width, height, radius);
    var usableW = Math.max(1, bounds.maxX - bounds.minX);
    var usableH = Math.max(1, bounds.maxY - bounds.minY);
    var centerX = bounds.minX + usableW * (0.5 + (seededUnit(count + 17) - 0.5) * 0.05);
    var centerY = bounds.minY + usableH * (0.51 + (seededUnit(count + 31) - 0.5) * 0.06);
    var golden = Math.PI * (3 - Math.sqrt(5));
    var seedA = seededUnit((index + 1) * 19 + count);
    var seedB = seededUnit((index + 1) * 37 + count * 3);
    var ring = Math.sqrt((index + 0.62) / Math.max(count, 1));
    var wobble = 0.78 + seedA * 0.34;
    var angle = (index * golden) + (seedA - 0.5) * 1.8 + count * 0.07;
    var orbitX = usableW * (0.08 + ring * 0.46) * wobble;
    var orbitY = usableH * (0.10 + ring * 0.42) * (0.82 + seedB * 0.30);
    var x = centerX + Math.cos(angle) * orbitX + Math.sin(angle * 2.3) * usableW * 0.045;
    var y = centerY + Math.sin(angle) * orbitY + Math.cos(angle * 1.7) * usableH * 0.05;
    if (index < 8) {
      x = centerX + Math.cos(angle) * usableW * (0.08 + seedA * 0.12);
      y = centerY + Math.sin(angle) * usableH * (0.08 + seedB * 0.12);
    }
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, y)),
    };
  }

  function syncNodes() {
    if (!state.canvas) return;
    var rect = state.canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width);
    var height = Math.max(320, rect.height);
    state.visible = rankedRecords();
    var radii = computeRadii(state.visible, width, height);
    var existing = {};
    state.nodes.forEach(function (node) { existing[node.id] = node; });
    state.nodes = state.visible.map(function (record, index) {
      var old = existing[record.id];
      var position = old ? null : layoutPosition(index, state.visible.length, width, height, radii[index]);
      var node = old || {
        id: record.id,
        x: position.x,
        y: position.y,
        vx: 0,
        vy: 0,
        homeX: position.x,
        homeY: position.y,
        driftPhaseX: seededUnit((index + 1) * 101 + state.visible.length) * Math.PI * 2,
        driftPhaseY: seededUnit((index + 1) * 211 + state.visible.length) * Math.PI * 2,
        driftDir: seededUnit((index + 1) * 307) > 0.5 ? 1 : -1,
        driftAngle: seededUnit((index + 1) * 907 + 19) * Math.PI * 2,
        driftSpeed: 0.018 + seededUnit((index + 1) * 613) * 0.018,
        movementRoll: 1,
        movementEvent: 'normal_drift',
        eventUntil: 0,
        nextMovementRollAt: 0,
        pulseUntil: 0,
        shockwaveUntil: 0,
        lastCollisionAt: 0,
        nearbyRepelUntil: 0,
        depth: 0.9 + ((index * 37) % 21) / 100,
      };
      node.record = record;
      record.nodeX = node.x;
      record.nodeY = node.y;
      node.radius = old ? old.radius : radii[index];
      node.targetRadius = radii[index];
      if (!old) {
        node.homeX = position.x;
        node.homeY = position.y;
      }
      node.rank = index + 1;
      node.depth = old && old.depth ? old.depth : 0.9 + ((index * 37) % 21) / 100;
      clampNodeToBounds(node, width, height);
      node.match = !state.query || record.searchText.indexOf(state.query.toLowerCase()) !== -1;
      return node;
    });
    setStatus();
    updateStats();
    requestDraw();
  }

  function assignLiveNumber(record, prop, value) {
    var n = asNum(value);
    if (n == null || record[prop] === n) return false;
    record[prop] = n;
    return true;
  }

  function liveConfidenceFromUpdate(update, keys, current) {
    for (var i = 0; i < keys.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(update, keys[i])) continue;
      return normalizeConfidence(update[keys[i]]) || current || '';
    }
    return current || '';
  }

  function assignLiveMetricNumber(record, prop, update, keys, confidence) {
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(update, key)) continue;
      var n = asNum(update[key]);
      if (n != null) {
        if (record[prop] === n) return false;
        record[prop] = n;
        return true;
      }
      if ((confidence === 'weak' || confidence === 'unavailable') && record[prop] != null) {
        record[prop] = null;
        return true;
      }
      return false;
    }
    return false;
  }

  function applyLiveTokenUpdate(record, update) {
    var changed = false;
    var previousVolume = record.volume24Usd != null ? record.volume24Usd : record.volume24Wax;
    var previousChange = record.change24;
    var nextPriceConfidence = liveConfidenceFromUpdate(update, ['selected_price_confidence', 'selectedPriceConfidence'], record.selectedPriceConfidence);
    var nextLiquidityConfidence = liveConfidenceFromUpdate(update, ['liquidity_confidence', 'liquidityConfidence'], record.liquidityConfidence);
    var nextTvlConfidence = liveConfidenceFromUpdate(update, ['tvl_confidence', 'tvlConfidence'], record.tvlConfidence);
    var nextMarketCapConfidence = liveConfidenceFromUpdate(update, ['market_cap_confidence', 'marketCapConfidence'], record.marketCapConfidence);
    changed = assignLiveMetricNumber(record, 'selectedPriceWax', update, ['price_wax', 'selected_price_wax'], nextPriceConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'selectedPriceUsd', update, ['price_usd', 'selected_price_usd'], nextPriceConfidence) || changed;
    changed = assignLiveNumber(record, 'change24', update.change_24h) || changed;
    changed = assignLiveNumber(record, 'volume24Wax', update.volume_24h_wax) || changed;
    changed = assignLiveNumber(record, 'volume24Usd', update.volume_24h_usd) || changed;
    changed = assignLiveMetricNumber(record, 'tvlWax', update, ['tvl_wax'], nextTvlConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'tvlUsd', update, ['tvl_usd'], nextTvlConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'graphLiquidityWax', update, ['graph_liquidity_wax'], nextLiquidityConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'graphLiquidityUsd', update, ['graph_liquidity_usd'], nextLiquidityConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'liquidityWax', update, ['liquidity_wax'], nextLiquidityConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'liquidityUsd', update, ['liquidity_usd'], nextLiquidityConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'bubbleTvlWax', update, ['bubble_tvl_wax'], nextTvlConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'bubbleTvlUsd', update, ['bubble_tvl_usd'], nextTvlConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'bubbleLiquidityWax', update, ['bubble_liquidity_wax'], nextLiquidityConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'bubbleLiquidityUsd', update, ['bubble_liquidity_usd'], nextLiquidityConfidence) || changed;
    changed = assignLiveNumber(record, 'bubbleSuspiciousLiquidityPairCount', update.bubble_suspicious_liquidity_pair_count) || changed;
    changed = assignLiveMetricNumber(record, 'marketCapWax', update, ['market_cap_wax'], nextMarketCapConfidence) || changed;
    changed = assignLiveMetricNumber(record, 'marketCapUsd', update, ['market_cap_usd'], nextMarketCapConfidence) || changed;
    changed = assignLiveNumber(record, 'indexedPairCount', update.indexed_pair_count) || changed;
    changed = assignLiveNumber(record, 'sourceCount', update.source_count) || changed;
    [
      ['selectedPriceConfidence', ['selected_price_confidence', 'selectedPriceConfidence']],
      ['liquidityConfidence', ['liquidity_confidence', 'liquidityConfidence']],
      ['tvlConfidence', ['tvl_confidence', 'tvlConfidence']],
      ['marketCapConfidence', ['market_cap_confidence', 'marketCapConfidence']]
    ].forEach(function (entry) {
      var prop = entry[0];
      var keys = entry[1];
      for (var i = 0; i < keys.length; i += 1) {
        if (!Object.prototype.hasOwnProperty.call(update, keys[i])) continue;
        var next = normalizeConfidence(update[keys[i]]);
        if (next && record[prop] !== next) {
          record[prop] = next;
          changed = true;
        }
        break;
      }
    });
    if (Object.prototype.hasOwnProperty.call(update, 'metric_reason_codes') ||
        Object.prototype.hasOwnProperty.call(update, 'reason_codes') ||
        Object.prototype.hasOwnProperty.call(update, 'unavailable_reasons')) {
      var reasonCodes = parseReasonCodes(update.metric_reason_codes || update.reason_codes || update.unavailable_reasons);
      if (reasonCodes.join(',') !== (record.metricReasonCodes || []).join(',')) {
        record.metricReasonCodes = reasonCodes;
        changed = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(update, 'source_keys')) {
      var sources = parseSourceKeys(update.source_keys);
      if (sources.join(',') !== record.sources.join(',')) {
        record.sourcesMap = sources.reduce(function (acc, source) { acc[source] = true; return acc; }, {});
        record.sources = sources.sort(compareSources);
        changed = true;
      }
    }
    if (update.updated_at) record.liveUpdatedAt = update.updated_at;
    if (changed) {
      var nextVolume = record.volume24Usd != null ? record.volume24Usd : record.volume24Wax;
      var now = performance.now();
      record.recentUntil = now + 4200;
      record.pulseUntil = now + 1600;
      if (isVolumeSpike(previousVolume, nextVolume)) record.volumeSpikeUntil = now + 2600;
      if (isLiveImpactEvent(update, previousVolume, nextVolume)) {
        record.shockwavePending = true;
        record.majorUpdatePending = true;
      }
      record.liveMessage = liveMessageForUpdate(record, update, previousVolume, nextVolume, previousChange);
      record.searchText = tokenSearchText(record);
    }
    return changed;
  }

  function refreshLiveTargetRadii() {
    if (!state.canvas) return;
    var rect = state.canvas.getBoundingClientRect();
    var radii = computeRadii(state.visible, Math.max(320, rect.width), Math.max(320, rect.height));
    state.nodes.forEach(function (node, index) {
      node.targetRadius = radii[index] || node.targetRadius;
    });
  }

  function isValidIsoTimestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
    return Number.isFinite(new Date(value).getTime());
  }

  function setBackendLiveCursor(nextCursor) {
    if (!nextCursor) return;
    state.live.cursor = String(nextCursor);
    state.live.cursorFromBackend = true;
  }

  function latestTokenUpdatedAt(tokens) {
    return tokens.reduce(function (latest, token) {
      var value = token && token.updated_at;
      if (!isValidIsoTimestamp(value)) return latest;
      return !latest || value > latest ? value : latest;
    }, null);
  }

  function advanceLiveDisplayTimestamp(value) {
    if (!isValidIsoTimestamp(value)) return;
    state.live.lastEventAt = !state.live.lastEventAt || value > state.live.lastEventAt ? value : state.live.lastEventAt;
    state.lastUpdated = !state.lastUpdated || value > state.lastUpdated ? value : state.lastUpdated;
  }

  function applyLiveSnapshot(snapshot) {
    var data = payloadData(snapshot);
    var tokens = sourceRows(data.tokens);
    var nextCursor = data.next_cursor || snapshot.next_cursor || null;
    if (nextCursor) setBackendLiveCursor(nextCursor);
    var latestUpdate = latestTokenUpdatedAt(tokens);
    var displayTimestamp =
      latestUpdate ||
      (isValidIsoTimestamp(data.generated_at) ? data.generated_at : null) ||
      (isValidIsoTimestamp(snapshot.generated_at) ? snapshot.generated_at : null) ||
      (isValidIsoTimestamp(state.lastUpdated) ? state.lastUpdated : null) ||
      new Date().toISOString();
    advanceLiveDisplayTimestamp(displayTimestamp);
    if (!tokens.length) return;
    var byKey = {};
    state.records.forEach(function (record) { byKey[record.key] = record; });
    var changed = 0;
    var changedRecords = [];
    tokens.forEach(function (update) {
      var key = update.token_key || tokenKey(update.contract, update.symbol);
      var record = byKey[key];
      if (!record) return;
      if (applyLiveTokenUpdate(record, update)) {
        changed += 1;
        changedRecords.push(record);
      }
    });
    if (!changed) return;
    refreshLiveTargetRadii();
    syncNodes();
    changedRecords.forEach(function (record) {
      if (record.liveMessage) addLiveFeed(record.liveMessage, record);
    });
    queuePendingShockwaves();
  }

  function isVolumeSpike(previousVolume, nextVolume) {
    if (previousVolume == null || nextVolume == null || previousVolume <= 0) return false;
    return Math.abs(nextVolume - previousVolume) / previousVolume >= 0.12;
  }

  function isLiveImpactEvent(update, previousVolume, nextVolume) {
    var type = String(update.event_type || update.type || update.reason || '').toLowerCase();
    if (type.indexOf('whale') !== -1 || type.indexOf('volume') !== -1) return true;
    if (update.whale === true || update.is_whale === true || update.volume_event === true) return true;
    if (previousVolume == null || nextVolume == null || previousVolume <= 0) return false;
    return isVolumeSpike(previousVolume, nextVolume) && Math.abs(nextVolume - previousVolume) / previousVolume >= 0.18;
  }

  function liveMessageForUpdate(record, update, previousVolume, nextVolume, previousChange) {
    var type = String(update.event_type || update.type || update.reason || '').toLowerCase();
    if (type.indexOf('whale') !== -1 || update.whale === true || update.is_whale === true) {
      return 'Whale/high-volume update detected for ' + (record.displaySymbol || record.symbol) + ' from indexed snapshot data';
    }
    if (isVolumeSpike(previousVolume, nextVolume)) {
      return 'Volume spike: ' + (record.displaySymbol || record.symbol) + ' 24h volume moved to ' + displayValueForMetric(record, 'volume', '24h');
    }
    var change = asNum(record.change24);
    if (change != null && previousChange !== change) return 'Top mover update: ' + (record.displaySymbol || record.symbol) + ' now ' + fmtPct(change);
    return 'Fresh history building: ' + (record.displaySymbol || record.symbol) + ' updated from WaxOnEdge snapshots';
  }

  function displayValueForMetric(record, metric, timeframeOverride) {
    var oldMetric = state.metric;
    var oldTimeframe = state.timeframe;
    try {
      state.metric = metric;
      if (timeframeOverride) state.timeframe = timeframeOverride;
      return displayValue(record);
    } finally {
      state.metric = oldMetric;
      state.timeframe = oldTimeframe;
    }
  }

  function addLiveFeed(message, record) {
    state.liveFeed.unshift({
      message: message,
      symbol: record.displaySymbol || record.symbol,
      color: ringColor(record),
      time: Date.now(),
    });
    state.liveFeed = state.liveFeed.slice(0, 6);
    if (record.majorUpdatePending) {
      record.majorUpdatePending = false;
    }
    renderLiveFeed();
  }

  function renderLiveFeed() {
    var feed = document.getElementById('woe-ab-live-feed');
    if (!feed) return;
    if (!state.liveFeed.length) {
      feed.innerHTML = '<span class="woe-ab-feed-item"><strong>Live WAX Galaxy</strong><span>Waiting for real WaxOnEdge updates.</span></span>';
      return;
    }
    feed.innerHTML = state.liveFeed.map(function (item) {
      return '<span class="woe-ab-feed-item" style="--feed-color:' + escHtml(item.color) + '">' +
        '<strong>' + escHtml(item.symbol) + '</strong>' +
        '<span>' + escHtml(item.message) + '</span>' +
      '</span>';
    }).join('');
  }

  function queuePendingShockwaves() {
    if (!shouldAnimate()) {
      state.nodes.forEach(function (node) {
        if (node.record) node.record.shockwavePending = false;
      });
      return;
    }
    var now = performance.now();
    state.nodes.forEach(function (node) {
      if (!node.record || !node.record.shockwavePending) return;
      node.record.shockwavePending = false;
      node.record.nodeX = node.x;
      node.record.nodeY = node.y;
      pushShockwave(node, now, 1, 'live_update');
    });
    if (state.shockwaves.length > 24) state.shockwaves = state.shockwaves.slice(-24);
  }

  function movementRollForNode(node, now) {
    var slot = Math.floor(now / 1000);
    var seed = (node.rank || 1) * 73 + String(node.id || '').length * 19 + slot;
    return 1 + Math.floor(seededUnit(seed) * 100);
  }

  function movementEventForRoll(roll) {
    for (var i = 0; i < MOVEMENT_EVENT_TABLE.length; i += 1) {
      var entry = MOVEMENT_EVENT_TABLE[i];
      if (roll >= entry.min && roll <= entry.max) return entry;
    }
    return MOVEMENT_EVENT_TABLE[0];
  }

  function scheduleNextMovementRoll(node, now) {
    var delay = 6000 + seededUnit((node.rank || 1) * 719 + Math.floor(now / 1000)) * 8000;
    node.nextMovementRollAt = now + delay;
  }

  function isWhaleVisualNode(node) {
    var record = node.record || {};
    var tvl = valueForMetric(record, 'tvl', '24h') || 0;
    var liq = valueForMetric(record, 'liquidity', '24h') || 0;
    var volume = asNum(record.volume24Usd != null ? record.volume24Usd : record.volume24Wax) || 0;
    return Math.max(tvl, liq, volume) > 50000 || (node.rank || 999) <= 12;
  }

  function movementEventMessage(node, entry) {
    if (!node.record) return null;
    if (entry.event === 'mega_event') return 'Mega visual event: ' + (node.record.displaySymbol || node.record.symbol) + ' galaxy shockwave';
    if (entry.event === 'bonus_surge') return 'Bonus surge visual: ' + (node.record.displaySymbol || node.record.symbol) + ' drift pulse';
    if (entry.event === 'shockwave') return 'Shockwave visual: ' + (node.record.displaySymbol || node.record.symbol) + ' pushed nearby bubbles';
    if (entry.event === 'whale_pulse' && isWhaleVisualNode(node)) return 'Whale pulse visual: ' + (node.record.displaySymbol || node.record.symbol) + ' glow expanded';
    return null;
  }

  function pushShockwave(node, now, scale, reason) {
    if (!node || !node.record) return;
    state.shockwaves.push({
      x: node.x,
      y: node.y,
      radius: visualRadius(node) * (scale || 1),
      color: ringColor(node.record),
      startedAt: now,
      duration: reason === 'mega_event' ? 1500 : 1100,
    });
    node.shockwaveUntil = Math.max(node.shockwaveUntil || 0, now + 900);
    if (state.shockwaves.length > 28) state.shockwaves = state.shockwaves.slice(-28);
  }

  function rollMovementEvent(node, now) {
    if (!node.nextMovementRollAt) scheduleNextMovementRoll(node, now - 5000);
    if (now < node.nextMovementRollAt) return;
    node.movementRoll = movementRollForNode(node, now);
    var entry = movementEventForRoll(node.movementRoll);
    node.movementEvent = entry.event;
    node.eventUntil = now + (entry.event === 'mega_event' ? 2300 : entry.event === 'normal_drift' ? 1200 : 1600 + seededUnit((node.rank || 1) * 331) * 1200);
    node.driftAngle = (node.driftAngle || 0) + (seededUnit((node.rank || 1) * 991 + node.movementRoll) - 0.5) * (entry.event === 'soft_bounce' ? 1.4 : 0.72);
    if (entry.event === 'soft_bounce') node.driftSpeed = 0.028 + seededUnit(node.movementRoll * 17) * 0.018;
    if (entry.event === 'pulse_drift') node.pulseUntil = Math.max(node.pulseUntil || 0, now + 1300);
    if (entry.event === 'magnetic_repel') node.nearbyRepelUntil = Math.max(node.nearbyRepelUntil || 0, now + 1400);
    if (entry.event === 'whale_pulse' && isWhaleVisualNode(node)) node.pulseUntil = Math.max(node.pulseUntil || 0, now + 1900);
    if (entry.event === 'shockwave' || entry.event === 'bonus_surge' || entry.event === 'mega_event') {
      node.pulseUntil = Math.max(node.pulseUntil || 0, now + 1700);
      pushShockwave(node, now, entry.event === 'mega_event' ? 1.55 : 1.15, entry.event);
      node.nearbyRepelUntil = Math.max(node.nearbyRepelUntil || 0, now + 1200);
    }
    var message = movementEventMessage(node, entry);
    if (message && now - state.lastImpactAt > 1600) {
      state.lastImpactAt = now;
      addLiveFeed(message, node.record);
    }
    scheduleNextMovementRoll(node, now);
  }

  function applyMovementEventForces(node, nodes, index, now) {
    var active = node.eventUntil && now < node.eventUntil;
    var event = active ? node.movementEvent : 'normal_drift';
    var eventBoost = 1;
    if (event === 'pulse_drift') eventBoost = 1.7;
    if (event === 'bonus_surge') eventBoost = 2.25;
    if (event === 'mega_event') eventBoost = 2.75;
    if (event === 'whale_pulse' && isWhaleVisualNode(node)) eventBoost = 1.35;
    var speed = (node.driftSpeed || 0.022) * eventBoost;
    if (event === 'orbit_wobble') {
      node.driftAngle += Math.sin(now / 520 + index) * 0.012;
      speed *= 1.24;
    }
    node.vx += Math.cos(node.driftAngle || 0) * speed;
    node.vy += Math.sin(node.driftAngle || 0) * speed;
    if (event === 'magnetic_repel' || event === 'mega_event' || (node.nearbyRepelUntil && now < node.nearbyRepelUntil)) {
      for (var i = 0; i < nodes.length; i += 1) {
        var other = nodes[i];
        if (other === node) continue;
        var dx = node.x - other.x;
        var dy = node.y - other.y;
        var distSq = dx * dx + dy * dy;
        var range = visualRadius(node) + visualRadius(other) + (event === 'mega_event' ? 120 : 70);
        if (distSq > 0 && distSq < range * range) {
          var dist = Math.sqrt(distSq);
          var force = (range - dist) / range * (event === 'mega_event' ? 0.18 : 0.07);
          node.vx += (dx / dist) * force;
          node.vy += (dy / dist) * force;
          if (state.dragging !== other) {
            other.vx -= (dx / dist) * force * 0.62;
            other.vy -= (dy / dist) * force * 0.62;
          }
        }
      }
    }
  }
  function forceSimulationEquivalent(width, height) {
    var nodes = state.nodes;
    var animate = shouldAnimate();
    var now = performance.now();
    nodes.forEach(function (node, index) {
      node.radius += (node.targetRadius - node.radius) * 0.075;
      if (!animate) return;
      if (!Number.isFinite(node.vx)) node.vx = 0;
      if (!Number.isFinite(node.vy)) node.vy = 0;
      if (node.driftAngle == null) node.driftAngle = seededUnit((index + 1) * 907 + 19) * Math.PI * 2;
      if (node.driftSpeed == null) node.driftSpeed = 0.018 + seededUnit((index + 1) * 613) * 0.018;
      if (node.driftPhaseX == null) node.driftPhaseX = seededUnit((index + 1) * 101 + nodes.length) * Math.PI * 2;
      if (node.driftPhaseY == null) node.driftPhaseY = seededUnit((index + 1) * 211 + nodes.length) * Math.PI * 2;
      rollMovementEvent(node, now);
      if (seededUnit(Math.floor(now / 11000) + (index + 1) * 409) > 0.996) {
        node.driftAngle += (seededUnit(index * 113 + Math.floor(now / 9000)) - 0.5) * 0.36;
      }
      var homePull = 0.00034;
      node.vx += ((node.homeX || node.x) - node.x) * homePull;
      node.vy += ((node.homeY || node.y) - node.y) * homePull;
      var phaseX = node.driftPhaseX + now / (15000 + index * 37);
      var phaseY = node.driftPhaseY + now / (17500 + index * 41);
      node.vx += Math.cos((node.driftAngle || 0) + phaseX * 0.12) * 0.004;
      node.vy += Math.sin((node.driftAngle || 0) + phaseY * 0.12) * 0.004;
      applyMovementEventForces(node, nodes, index, now);
    });

    for (var pass = 0; pass < 7; pass += 1) {
      for (var i = 0; i < nodes.length; i += 1) {
        for (var j = i + 1; j < nodes.length; j += 1) {
          var a = nodes[i];
          var b = nodes[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var distSq = dx * dx + dy * dy;
          var min = visualRadius(a) + visualRadius(b) + 18;
          if (distSq > 0 && distSq < min * min) {
            var dist = Math.sqrt(distSq);
            var nx = dx / dist;
            var ny = dy / dist;
            var overlap = min - dist;
            var ar = visualRadius(a);
            var br = visualRadius(b);
            var total = ar + br || 1;
            var aShare = br / total;
            var bShare = ar / total;
            if (state.dragging !== a) {
              a.x -= nx * overlap * aShare * 0.62;
              a.y -= ny * overlap * aShare * 0.62;
              a.vx -= nx * overlap * 0.018;
              a.vy -= ny * overlap * 0.018;
            }
            if (state.dragging !== b) {
              b.x += nx * overlap * bShare * 0.62;
              b.y += ny * overlap * bShare * 0.62;
              b.vx += nx * overlap * 0.018;
              b.vy += ny * overlap * 0.018;
            }
            if (overlap > 1.2) {
              a.collisionUntil = Math.max(a.collisionUntil || 0, now + 360);
              b.collisionUntil = Math.max(b.collisionUntil || 0, now + 360);
              a.lastCollisionAt = now;
              b.lastCollisionAt = now;
              if (overlap > 7) {
                a.driftAngle = Math.atan2(-ny, -nx);
                b.driftAngle = Math.atan2(ny, nx);
              }
            }
          }
        }
      }
    }

    nodes.forEach(function (node) {
      if (state.dragging !== node && animate) {
        node.vx *= 0.965;
        node.vy *= 0.965;
        var speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        var maxSpeed = 0.72;
        if (speed > maxSpeed) {
          node.vx = (node.vx / speed) * maxSpeed;
          node.vy = (node.vy / speed) * maxSpeed;
        }
        node.x += node.vx;
        node.y += node.vy;
      }
      var bounds = sceneBounds(width, height, visualRadius(node));
      if (node.x < bounds.minX) {
        node.x = bounds.minX;
        node.vx = Math.abs(node.vx || 0) * 0.62;
        node.collisionUntil = Math.max(node.collisionUntil || 0, now + 260);
      } else if (node.x > bounds.maxX) {
        node.x = bounds.maxX;
        node.vx = -Math.abs(node.vx || 0) * 0.62;
        node.collisionUntil = Math.max(node.collisionUntil || 0, now + 260);
      }
      if (node.y < bounds.minY) {
        node.y = bounds.minY;
        node.vy = Math.abs(node.vy || 0) * 0.62;
        node.collisionUntil = Math.max(node.collisionUntil || 0, now + 260);
      } else if (node.y > bounds.maxY) {
        node.y = bounds.maxY;
        node.vy = -Math.abs(node.vy || 0) * 0.62;
        node.collisionUntil = Math.max(node.collisionUntil || 0, now + 260);
      }
    });
  }
  function visualRadius(node) {
    var now = performance.now();
    var eventPulse = node.pulseUntil && now < node.pulseUntil ? Math.max(0, (node.pulseUntil - now) / 1900) : 0;
    var eventName = node.eventUntil && now < node.eventUntil ? node.movementEvent : '';
    var eventScale = eventName === 'mega_event' ? 0.18 : eventName === 'bonus_surge' ? 0.13 : eventName === 'whale_pulse' ? 0.10 : eventName === 'pulse_drift' ? 0.075 : 0;
    return node.radius * (node.depth || 1) * (1 + Math.min(0.20, eventPulse * eventScale));
  }

  function signal(record) {
    var change = state.metric === 'change' && state.timeframe !== '24h' ? record['change' + state.timeframe] : record.change24;
    return asNum(change);
  }

  function ringColor(record) {
    var change = signal(record);
    if (change == null) return '#00e5ff';
    if (change > 5) return '#39ff88';
    if (change > 0) return '#00d7ff';
    if (change < -5) return '#ff2bd6';
    if (change < 0) return '#ff4d6a';
    return '#00e5ff';
  }

  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (imageCache.has(url)) {
      var cached = imageCache.get(url);
      imageCache.delete(url);
      imageCache.set(url, cached);
      return Promise.resolve(cached);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { imageCache.set(url, img); capMap(imageCache, IMAGE_CACHE_LIMIT); resolve(img); requestDraw(); };
      img.onerror = function () { imageCache.set(url, null); capMap(imageCache, IMAGE_CACHE_LIMIT); resolve(null); };
      img.src = url;
    });
  }

  function textFit(ctx, text, maxWidth, baseSize, minSize) {
    var size = baseSize;
    do {
      ctx.font = '800 ' + size + 'px Inter, Arial, sans-serif';
      if (ctx.measureText(text).width <= maxWidth || size <= minSize) return size;
      size -= 1;
    } while (size > minSize);
    return minSize;
  }

  function drawBubbleOffscreen(node, dpr) {
    var record = node.record;
    var r = Math.round(visualRadius(node));
    var img = imageCache.get(record.logoUrl);
    var key = [r, state.metric, state.timeframe, displayValue(record), record.displaySymbol || record.symbol, record.sourceCount, ringColor(record), img ? 1 : 0, dpr].join('|');
    var cached = bubbleCanvasCache.get(record.id);
    if (cached && cached.key === key) {
      bubbleCanvasCache.delete(record.id);
      bubbleCanvasCache.set(record.id, cached);
      return cached.canvas;
    }
    var pad = Math.ceil(Math.max(10, r * 0.26));
    var size = (r * 2) + (pad * 2);
    var canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.translate(r + pad, r + pad);
    var rim = ringColor(record);
    var positive = signal(record) == null || signal(record) >= 0;
    var core = positive ? '#071e14' : '#210711';
    var mid = positive ? '#0b4a27' : '#55111c';
    var lit = positive ? '#77ff9a' : '#ff8a6d';
    var grad = ctx.createRadialGradient(-r * 0.34, -r * 0.38, r * 0.04, 0, 0, r);
    grad.addColorStop(0, lit);
    grad.addColorStop(0.2, mid);
    grad.addColorStop(0.64, core);
    grad.addColorStop(0.88, '#050506');
    grad.addColorStop(1, rim);
    ctx.shadowColor = rim;
    ctx.shadowBlur = Math.max(12, r * 0.34);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
    ctx.clip();
    var lower = ctx.createLinearGradient(0, -r * 0.18, 0, r);
    lower.addColorStop(0, 'rgba(0,0,0,0)');
    lower.addColorStop(0.45, 'rgba(0,0,0,.20)');
    lower.addColorStop(1, 'rgba(0,0,0,.76)');
    ctx.fillStyle = lower;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    drawPlanetBands(ctx, record, r, 0);
    drawPlanetNoise(ctx, record, r);
    ctx.restore();
    var rimGrad = ctx.createRadialGradient(r * 0.35, r * 0.35, r * 0.35, 0, 0, r);
    rimGrad.addColorStop(0, 'rgba(255,255,255,0)');
    rimGrad.addColorStop(0.72, 'rgba(255,255,255,0)');
    rimGrad.addColorStop(0.93, hexToRgba(rim, 0.22));
    rimGrad.addColorStop(1, hexToRgba(rim, 0.68));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.018);
    ctx.strokeStyle = rim;
    ctx.shadowColor = rim;
    ctx.shadowBlur = Math.max(6, r * 0.16);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
    ctx.clip();
    var showText = r > 27;
    if (img && r > 18) {
      var logoSize = showText ? Math.max(18, Math.min(r * 0.72, 54)) : r * 1.15;
      ctx.drawImage(img, -logoSize / 2, showText ? -r * 0.55 : -logoSize / 2, logoSize, logoSize);
    } else if (!showText) {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 ' + Math.max(10, r * 0.35) + 'px Inter, Arial, sans-serif';
      ctx.fillText((record.displaySymbol || record.symbol).slice(0, r > 30 ? 5 : 2), 0, showText ? -r * 0.28 : 0);
    }
    if (showText) {
      var symbolLabel = record.displaySymbol || record.symbol;
      var symSize = textFit(ctx, symbolLabel, r * 1.48, Math.min(30, Math.max(11, r * 0.31)), 8);
      ctx.font = '900 ' + symSize + 'px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.lineWidth = Math.max(2, symSize * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,.72)';
      ctx.shadowColor = 'rgba(0,0,0,.9)';
      ctx.shadowBlur = Math.max(4, r * 0.08);
      ctx.strokeText(symbolLabel, 0, img ? r * 0.05 : -r * 0.02);
      ctx.fillText(symbolLabel, 0, img ? r * 0.05 : -r * 0.02);
      if (r > 36) {
        var valueSize = Math.max(8, Math.min(15, r * 0.16));
        ctx.font = '700 ' + valueSize + 'px Inter, Arial, sans-serif';
        ctx.lineWidth = Math.max(2, valueSize * 0.16);
        ctx.fillStyle = rim;
        ctx.strokeText(displayValue(record).slice(0, 18), 0, r * 0.34);
        ctx.fillText(displayValue(record).slice(0, 18), 0, r * 0.34);
      }
      if (r > 50) {
        var sourceSize = Math.max(7, Math.min(12, r * 0.12));
        ctx.font = '600 ' + sourceSize + 'px Inter, Arial, sans-serif';
        ctx.lineWidth = Math.max(2, sourceSize * 0.16);
        ctx.fillStyle = 'rgba(255,255,255,.72)';
        ctx.strokeText(record.sourceCount + ' src', 0, r * 0.56);
        ctx.fillText(record.sourceCount + ' src', 0, r * 0.56);
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, -r * 0.34, r * 0.34, r * 0.13, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.30)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.42, r * 0.18, r * 0.07, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.56)';
    ctx.fill();
    bubbleCanvasCache.set(record.id, { key: key, canvas: canvas });
    capMap(bubbleCanvasCache, BUBBLE_CANVAS_CACHE_LIMIT);
    return canvas;
  }

  function hashText(value) {
    var hash = 0;
    String(value || '').split('').forEach(function (ch) {
      hash = ((hash << 5) - hash) + ch.charCodeAt(0);
      hash |= 0;
    });
    return Math.abs(hash);
  }

  function hexToRgba(hex, alpha) {
    var value = String(hex || '#f89422').replace('#', '');
    if (value.length === 3) value = value.split('').map(function (ch) { return ch + ch; }).join('');
    var n = parseInt(value, 16);
    if (!Number.isFinite(n)) return 'rgba(248,148,34,' + alpha + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function drawPlanetBands(ctx, record, r, phase) {
    var seed = hashText(record.key || record.symbol);
    ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < 5; i += 1) {
      var y = -r * 0.52 + (i * r * 0.24) + (((seed + i * 17) % 9) - 4);
      var offset = Math.sin(phase + i + seed * 0.001) * r * 0.08;
      ctx.beginPath();
      ctx.ellipse(offset, y, r * (0.78 - i * 0.035), Math.max(1.5, r * (0.035 + ((seed + i) % 4) * 0.01)), 0.08, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : hexToRgba(ringColor(record), 0.12);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPlanetNoise(ctx, record, r) {
    var seed = hashText(record.key || record.symbol);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (var i = 0; i < 14; i += 1) {
      var angle = ((seed + i * 71) % 360) * Math.PI / 180;
      var dist = r * (0.18 + ((seed + i * 31) % 62) / 100);
      var x = Math.cos(angle) * dist;
      var y = Math.sin(angle) * dist;
      if ((x * x) + (y * y) > r * r * 0.72) continue;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.8, r * (0.008 + ((seed + i) % 4) * 0.003)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAnimatedBands(ctx, node, now) {
    if (!shouldAnimate() || node.radius < 28) return;
    var r = visualRadius(node);
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, r * 0.96, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(node.x, node.y);
    ctx.globalAlpha = 0.28;
    drawPlanetBands(ctx, node.record, r, now / 1800);
    ctx.restore();
  }

  function drawCastShadow(ctx, node) {
    var r = visualRadius(node);
    ctx.save();
    ctx.globalAlpha = 0.34 * Math.min(1.25, node.depth || 1);
    ctx.fillStyle = '#000';
    ctx.filter = 'blur(' + Math.max(5, r * 0.12).toFixed(1) + 'px)';
    ctx.beginPath();
    ctx.ellipse(node.x + r * 0.2, node.y + r * 0.72, r * 0.76, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShockwaves(ctx, now) {
    if (!state.shockwaves.length) return;
    state.shockwaves = state.shockwaves.filter(function (wave) {
      var t = (now - wave.startedAt) / wave.duration;
      if (t >= 1) return false;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.72;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = Math.max(1, wave.radius * 0.05 * (1 - t));
      ctx.shadowColor = wave.color;
      ctx.shadowBlur = 18 * (1 - t);
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius * (1.08 + t * 1.35), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius * (1.36 + t * 1.8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return true;
    });
  }

  function updateCamera(width, height, now) {
    var camera = state.camera;
    camera.offsetX = 0;
    camera.offsetY = 0;
    camera.scale = 1;
    camera.focusUntil = 0;
  }

  function applyCamera(ctx, width, height) {
    return;
  }

  function screenToWorld(point) {
    return point;
  }

  function draw() {
    state.raf = 0;
    if (!state.canvas || !state.ctx) return;
    if (document.hidden) return;
    var canvas = state.canvas;
    var ctx = state.ctx;
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var width = Math.max(320, rect.width);
    var height = Math.max(320, rect.height);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncNodes();
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    forceSimulationEquivalent(width, height);
    var now = performance.now();
    updateCamera(width, height, now);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    applyCamera(ctx, width, height);
    state.nodes.forEach(function (node) { drawCastShadow(ctx, node); });
    drawShockwaves(ctx, now);
    state.nodes.slice().sort(function (a, b) { return (a.depth || 1) - (b.depth || 1); }).forEach(function (node) {
      drawGalaxyNode(ctx, node, dpr, now);
    });
    ctx.restore();
    if (shouldAnimate()) state.raf = window.requestAnimationFrame(draw);
  }

  function marketWeather() {
    var records = state.visible || [];
    var scored = records.filter(function (record) { return asNum(record.change24) != null; });
    var avg = scored.length
      ? scored.reduce(function (sum, record) { return sum + asNum(record.change24); }, 0) / scored.length
      : 0;
    if (avg > 2) return { center: 'rgba(0,80,32,.28)' };
    if (avg < -2) return { center: 'rgba(90,0,20,.30)' };
    return { center: 'rgba(0,229,255,.10)' };
  }

  function drawGalaxyNode(ctx, node, dpr, now) {
    var alpha = state.query && !node.match ? 0.16 : 1;
    var record = node.record;
    var r = Math.round(visualRadius(node));
    ctx.save();
    ctx.globalAlpha = alpha;
    var recent = record.recentUntil && now < record.recentUntil;
    var pulse = record.pulseUntil && now < record.pulseUntil ? (record.pulseUntil - now) / 1600 : 0;
    var eventPulse = node.pulseUntil && now < node.pulseUntil ? (node.pulseUntil - now) / 1900 : 0;
    var shockwavePulse = node.shockwaveUntil && now < node.shockwaveUntil ? (node.shockwaveUntil - now) / 900 : 0;
    var volumePulse = record.volumeSpikeUntil && now < record.volumeSpikeUntil ? (record.volumeSpikeUntil - now) / 2600 : 0;
    var collisionPulse = node.collisionUntil && now < node.collisionUntil ? (node.collisionUntil - now) / 320 : 0;
    if (recent || pulse || volumePulse || collisionPulse || eventPulse || shockwavePulse) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 7 + volumePulse * 9 + collisionPulse * 4 + eventPulse * 10 + shockwavePulse * 15, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor(record);
      ctx.globalAlpha = alpha * Math.max(0.25, pulse || volumePulse || collisionPulse * 0.72 || eventPulse * 0.78 || shockwavePulse * 0.9 || 0.22);
      ctx.lineWidth = Math.max(1, r * (0.03 + volumePulse * 0.04 + collisionPulse * 0.018));
      ctx.shadowColor = ringColor(record);
      ctx.shadowBlur = 18 + volumePulse * 18 + collisionPulse * 12 + eventPulse * 20 + shockwavePulse * 24;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha;
    }
    var bubble = drawBubbleOffscreen(node, dpr);
    var pad = Math.ceil(Math.max(10, r * 0.26));
    ctx.drawImage(bubble, node.x - r - pad, node.y - r - pad, r * 2 + pad * 2, r * 2 + pad * 2);
    drawAnimatedBands(ctx, node, now);
    if (state.hovered === node) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor(record);
      ctx.lineWidth = 2;
      ctx.shadowColor = ringColor(record);
      ctx.shadowBlur = 18;
      ctx.stroke();
    }
    ctx.restore();
  }

  function requestDraw() {
    if (!state.raf) state.raf = window.requestAnimationFrame(draw);
  }

  function canvasPoint(event) {
    var rect = state.canvas.getBoundingClientRect();
    return screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  function findNodeAt(point) {
    for (var i = state.nodes.length - 1; i >= 0; i -= 1) {
      var node = state.nodes[i];
      var dx = point.x - node.x;
      var dy = point.y - node.y;
      var r = visualRadius(node);
      if ((dx * dx) + (dy * dy) <= r * r) return node;
    }
    return null;
  }

  function moveTooltip(node, event) {
    if (!state.tooltip) return;
    if (!node) {
      state.tooltip.hidden = true;
      return;
    }
    var record = node.record;
    state.tooltip.hidden = false;
    state.tooltip.style.left = event.clientX + 14 + 'px';
    state.tooltip.style.top = event.clientY + 14 + 'px';
    state.tooltip.innerHTML = '<strong>' + escHtml(record.displaySymbol || record.symbol) + '</strong>' +
      '<span>' + escHtml(record.contract) + '</span>' +
      '<span>' + escHtml(displayValue(record)) + ' / ' + escHtml(fmtPct(record.change24)) + '</span>' +
      '<span>' + escHtml(record.sourceCount + ' source(s), ' + record.indexedPairCount + ' pair(s)') + '</span>' +
      '<span>' + escHtml(record.strongestPairLabel) + '</span>';
  }

  function onPointerMove(event) {
    if (!state.canvas) return;
    var point = canvasPoint(event);
    if (state.dragging) {
      state.dragging.x = point.x;
      state.dragging.y = point.y;
      state.dragging.vx = 0;
      state.dragging.vy = 0;
      return;
    }
    var node = findNodeAt(point);
    state.hovered = node;
    state.canvas.style.cursor = node ? 'pointer' : 'default';
    moveTooltip(node, event);
  }

  function onPointerDown(event) {
    var node = findNodeAt(canvasPoint(event));
    if (!node) return;
    state.dragging = node;
    state.dragging.startedAt = Date.now();
    state.dragging.startX = node.x;
    state.dragging.startY = node.y;
    state.canvas.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event) {
    var node = state.dragging;
    state.dragging = null;
    if (!node) return;
    var moved = Math.hypot(node.x - node.startX, node.y - node.startY);
    if (moved < 8 && Date.now() - node.startedAt < 500) openTokenAnalytics(node.record);
    try { state.canvas.releasePointerCapture(event.pointerId); } catch (_) {}
  }

  function onCanvasKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var node = state.hovered || state.nodes[0];
    if (!node) return;
    event.preventDefault();
    openTokenAnalytics(node.record);
  }

  function tokenAnalyticsUrl(record) {
    return '/analytics/token/?token=' + encodeURIComponent(record.symbol) + '&contract=' + encodeURIComponent(record.contract);
  }

  function openTokenAnalytics(record) {
    if (!record) return;
    window.location.href = tokenAnalyticsUrl(record);
  }

  function apiJson(path) {
    return fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error(path + ' failed: ' + response.status);
      return response.json();
    });
  }

  function liveSnapshotUrl() {
    return state.live.cursor && state.live.cursorFromBackend
      ? LIVE_API + '?cursor=' + encodeURIComponent(state.live.cursor)
      : LIVE_API;
  }

  function scheduleLivePolling(delay) {
    window.clearTimeout(state.live.pollTimer);
    state.live.transport = 'snapshot-polling';
    state.live.pollTimer = window.setTimeout(pollLiveSnapshot, delay == null ? LIVE_POLL_MS : delay);
  }

  function pollLiveSnapshot() {
    if (state.live.pollInFlight || document.hidden) {
      scheduleLivePolling(LIVE_POLL_MS);
      return;
    }
    state.live.pollInFlight = true;
    apiJson(liveSnapshotUrl()).then(function (snapshot) {
      state.connected = true;
      applyLiveSnapshot(snapshot);
      setStatus();
    }).catch(function () {
      state.connected = false;
      setStatus();
    }).finally(function () {
      state.live.pollInFlight = false;
      scheduleLivePolling(LIVE_POLL_MS);
    });
  }

  function startLiveEventSource(endpoint) {
    if (!window.EventSource || !endpoint) {
      scheduleLivePolling(1000);
      return;
    }
    try {
      state.live.transport = 'sse';
      state.live.eventSource = new window.EventSource(endpoint);
      state.live.eventSource.addEventListener('token_update', function (event) {
        try {
          applyLiveSnapshot({ tokens: [JSON.parse(event.data)] });
          setStatus();
        } catch (_) {}
      });
      state.live.eventSource.addEventListener('heartbeat', function () {
        state.connected = true;
        setStatus();
      });
      state.live.eventSource.onerror = function () {
        if (state.live.eventSource) state.live.eventSource.close();
        state.live.eventSource = null;
        scheduleLivePolling(1000);
      };
    } catch (_) {
      scheduleLivePolling(1000);
    }
  }

  function startLiveUpdates() {
    var live = state.health && state.health.live_updates ? state.health.live_updates : {};
    if (live.transport === 'sse' && live.stream_endpoint) {
      startLiveEventSource(live.stream_endpoint || LIVE_STREAM_API);
      return;
    }
    scheduleLivePolling(1000);
  }

  function setStatus() {
    var dot = document.getElementById('woe-ab-live-dot');
    var text = document.getElementById('woe-ab-live-text');
    var updated = document.getElementById('woe-ab-last-updated');
    if (dot) dot.className = 'woe-ab-live-dot ' + (state.connected ? 'is-live' : 'is-waiting');
    if (text) {
      text.textContent = state.live.transport === 'sse' && state.connected
        ? 'INDEXED STREAM'
        : state.live.transport === 'snapshot-polling' && state.connected
        ? 'SYNCED 10s'
        : state.live.transport === 'snapshot-polling'
        ? 'SNAPSHOT POLLING'
        : 'CONNECTING';
    }
    if (updated) updated.textContent = safeTimeLabel(state.lastUpdated) || 'Waiting for sync';
  }

  function safeTimeLabel(value) {
    if (!isValidIsoTimestamp(value)) return '';
    var date = new Date(value);
    return date.toLocaleTimeString();
  }

  function updateStats() {
    var bar = document.getElementById('woe-ab-stats');
    if (!bar) return;
    var records = state.visible || [];
    var metricCount = records.filter(function (r) { return valueForMetric(r, state.metric, state.timeframe) != null; }).length;
    var tokenLabel = metricCount < records.length
      ? records.length + ' tokens / ' + metricCount + ' with ' + METRIC_LABELS[state.metric] + ' data'
      : records.length + ' tokens';
    var gainers = records.filter(function (r) { return asNum(r.change24) > 0; }).length;
    var losers = records.filter(function (r) { return asNum(r.change24) < 0; }).length;
    var volume = records.reduce(function (sum, r) { return sum + (r.volume24Usd || r.volume24Wax || 0); }, 0);
    var topGainer = records.reduce(function (best, r) { return !best || (r.change24 || -Infinity) > (best.change24 || -Infinity) ? r : best; }, null);
    var topLoser = records.reduce(function (best, r) { return !best || (r.change24 || Infinity) < (best.change24 || Infinity) ? r : best; }, null);
    var sources = {};
    records.forEach(function (r) { r.sources.forEach(function (s) { sources[s] = true; }); });
    var candleStatus = state.timeframe !== '24h'
      ? TIMEFRAME_LABELS[state.timeframe] + ' history building from indexed snapshots'
      : state.health && state.health.candle_backfill
      ? (state.health.candle_backfill.latest_1d_candle_count || 0) + ' 1D candles'
      : 'candles not indexed';
    bar.innerHTML = '<span class="woe-ab-stat-cluster">' +
      '<span>' + escHtml(tokenLabel) + '</span>' +
      '<span class="woe-ab-up">Up ' + escHtml(String(gainers)) + '</span>' +
      '<span class="woe-ab-down">Down ' + escHtml(String(losers)) + '</span>' +
      '<span>Vol 24h <strong>' + escHtml(fmtNum(volume)) + '</strong></span>' +
      '<span>Top <strong class="woe-ab-up">' + escHtml(topGainer ? (topGainer.displaySymbol || topGainer.symbol) + ' ' + fmtPct(topGainer.change24) : 'Not indexed') + '</strong></span>' +
      '<span>Bot <strong class="woe-ab-down">' + escHtml(topLoser ? (topLoser.displaySymbol || topLoser.symbol) + ' ' + fmtPct(topLoser.change24) : 'Not indexed') + '</strong></span>' +
      '<span>Sources <strong>' + escHtml(String(Object.keys(sources).length)) + '</strong></span>' +
      '<span>' + escHtml(candleStatus) + '</span>' +
      '<span>WAXCASH graph tokens</span>' +
      '</span>' +
      '<span id="woe-ab-live-feed" class="woe-ab-live-feed" aria-live="polite" aria-label="Live WaxOnEdge market feed"></span>' +
      '<span class="woe-ab-credit">Powered by WaxOnEdge multi-DEX indexer</span>';
    renderLiveFeed();
  }
  function attachControls() {
    document.querySelectorAll('[data-woe-metric]').forEach(function (button) {
      button.addEventListener('click', function () {
        var metric = button.getAttribute('data-woe-metric') || 'change';
        if (!metricAllowed(metric)) return;
        state.metric = metric;
        updateCapabilityControls();
        bubbleCanvasCache.clear();
        syncNodes();
      });
    });
    document.querySelectorAll('[data-woe-timeframe]').forEach(function (button) {
      button.addEventListener('click', function () {
        var timeframe = button.getAttribute('data-woe-timeframe') || '24h';
        if (!timeframeAllowed(timeframe)) return;
        state.timeframe = timeframe;
        updateCapabilityControls();
        bubbleCanvasCache.clear();
        syncNodes();
      });
    });
    var search = document.getElementById('woe-global-search');
    if (search) search.addEventListener('input', function () {
      state.query = String(search.value || '').trim().toLowerCase();
      syncNodes();
    });
    updateCapabilityControls();
  }

  function updateWaxPrice(payload) {
    var data = payloadData(payload);
    var price = data.summary && data.summary.wax_price_usd != null
      ? asNum(data.summary.wax_price_usd)
      : data.sources && data.sources.alcor_global && data.sources.alcor_global.indexed && data.raw && data.raw.alcor_global
      ? asNum(data.raw.alcor_global.usd_price || data.raw.alcor_global.wax_usd || data.raw.alcor_global.price)
      : null;
    var priceEl = document.getElementById('woe-topbar-wax-price');
    var metaEl = document.getElementById('woe-topbar-wax-price-meta');
    if (priceEl) priceEl.textContent = price == null ? '$ --' : '$' + fmtPrice(price);
    if (metaEl) metaEl.textContent = price == null
      ? (state.connected ? 'WAX price not indexed' : 'Connecting to WaxOnEdge indexer')
      : 'WAX price from ' + (data.summary && data.summary.wax_price_source ? data.summary.wax_price_source : 'WaxOnEdge indexer');
  }

  function initCanvas() {
    state.board = document.getElementById('woe-bubble-board');
    if (!state.board) return;
    state.board.innerHTML = '<canvas id="woe-ab-canvas" class="woe-ab-canvas" tabindex="0" role="application" aria-label="WaxOnEdge WAX Galaxy scanner. Use Enter or Space to open the highlighted token analytics page."></canvas>' +
      '<div id="woe-ab-tooltip" class="woe-ab-tooltip" hidden></div>';
    state.canvas = document.getElementById('woe-ab-canvas');
    state.ctx = state.canvas.getContext('2d');
    state.tooltip = document.getElementById('woe-ab-tooltip');
    state.canvas.addEventListener('pointermove', onPointerMove);
    state.canvas.addEventListener('pointerdown', onPointerDown);
    state.canvas.addEventListener('pointerup', onPointerUp);
    state.canvas.addEventListener('keydown', onCanvasKeydown);
    state.canvas.addEventListener('pointerleave', function () { state.hovered = null; moveTooltip(null); });
    renderLiveFeed();
    window.addEventListener('resize', function () { window.clearTimeout(state.resizeTimer); state.resizeTimer = window.setTimeout(syncNodes, 120); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) requestDraw();
    });
    if (reducedMotionQuery) {
      var onMotionChange = function () {
        state.nodes.forEach(function (node) {
          node.vx = 0;
          node.vy = 0;
        });
        requestDraw();
      };
      if (reducedMotionQuery.addEventListener) reducedMotionQuery.addEventListener('change', onMotionChange);
      else if (reducedMotionQuery.addListener) reducedMotionQuery.addListener(onMotionChange);
    }
  }

  function load() {
    attachControls();
    initCanvas();
    Promise.all([
      apiJson(BOOTSTRAP_API),
      apiJson(HEALTH_API).catch(function () { return null; }),
    ]).then(function (results) {
      state.payload = results[0];
      state.health = results[1] ? payloadData(results[1]) : null;
      applyMetricCapabilities(state.payload);
      state.records = normalizeRecords(state.payload);
      state.pairs = sourceRows(payloadData(state.payload).pairs);
      state.connected = true;
      var loadedData = payloadData(state.payload);
      setBackendLiveCursor(loadedData.next_cursor);
      state.lastUpdated =
        (isValidIsoTimestamp(loadedData.updated_at) ? loadedData.updated_at : null) ||
        (isValidIsoTimestamp(loadedData.generated_at) ? loadedData.generated_at : null) ||
        new Date().toISOString();
      advanceLiveDisplayTimestamp(state.lastUpdated);
      updateWaxPrice(state.payload);
      syncNodes();
      setStatus();
      state.nodes.forEach(function (node) { loadImage(node.record.logoUrl); });
      startLiveUpdates();
      requestDraw();
    }).catch(function (error) {
      state.connected = false;
      setStatus();
      if (state.board) state.board.innerHTML = '<div class="woe-ab-empty">WaxOnEdge backend did not return indexed token data. No fake token data is shown.</div>';
      // eslint-disable-next-line no-console
      console.warn(error);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
}());

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
  var LIVE_POLL_MS = 10000;
  var WAX_KEY = tokenKey('eosio.token', 'WAX');
  var TOP_LIMIT = 100;
  var METRIC_LABELS = {
    change: '% Change',
    price: 'Price',
    volume: 'Volume',
    tvl: 'TVL',
    liquidity: 'Liquidity',
    mcap: 'Mkt Cap',
  };
  var TIMEFRAME_LABELS = { '24h': '24h', '7d': '7D', '30d': '30D' };
  var SOURCE_ORDER = ['alcor', 'swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box'];
  var IMAGE_CACHE_LIMIT = 160;
  var BUBBLE_CANVAS_CACHE_LIMIT = 240;
  var imageCache = new Map();
  var bubbleCanvasCache = new Map();
  var reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var state = {
    payload: null,
    health: null,
    records: [],
    pairs: [],
    visible: [],
    nodes: [],
    metric: 'change',
    timeframe: '24h',
    query: '',
    hovered: null,
    dragging: null,
    selected: null,
    shockwaves: [],
    liveFeed: [],
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
    if (n == null) return 'Unavailable';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(d) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(d) + 'K';
    return n.toFixed(d);
  }

  function fmtPrice(value) {
    var n = asNum(value);
    if (n == null) return 'Unavailable';
    if (Math.abs(n) >= 1000) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(4);
    if (Math.abs(n) >= 0.0001) return n.toFixed(6);
    return n.toExponential(4);
  }

  function fmtPct(value) {
    var n = asNum(value);
    if (n == null) return 'Unavailable';
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

  function capMap(map, limit) {
    while (map.size > limit) {
      var oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
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
    if (!pair) return 'Unavailable';
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
      record.contract,
      record.selectedSource,
      record.selectedPair,
      record.strongestPairLabel,
      record.sources.join(' '),
    ].join(' ').toLowerCase();
  }

  function valueForMetric(record, metric, timeframe) {
    if (metric === 'change') {
      var change = timeframe === '24h' ? record.change24 : record['change' + timeframe];
      return change != null ? Math.abs(change) : null;
    }
    if (metric === 'price') return record.selectedPriceUsd != null ? record.selectedPriceUsd : record.selectedPriceWax;
    if (metric === 'volume') {
      if (timeframe === '7d') return record.volume7dUsd != null ? record.volume7dUsd : record.volume7dWax;
      if (timeframe === '30d') return record.volume30dUsd != null ? record.volume30dUsd : record.volume30dWax;
      return record.volume24Usd != null ? record.volume24Usd : record.volume24Wax;
    }
    if (metric === 'tvl') {
      return record.tvlUsd != null ? record.tvlUsd : record.tvlWax;
    }
    if (metric === 'liquidity') return record.liquidityUsd != null ? record.liquidityUsd : record.liquidityWax;
    if (metric === 'mcap') return record.marketCapUsd != null ? record.marketCapUsd : record.marketCapWax;
    return null;
  }

  function displayValue(record) {
    if (state.metric === 'change') {
      var change = state.timeframe === '24h' ? record.change24 : record['change' + state.timeframe];
      return fmtPct(change);
    }
    if (state.metric === 'price') {
      if (record.selectedPriceUsd != null) return '$' + fmtPrice(record.selectedPriceUsd);
      if (record.selectedPriceWax != null) return fmtPrice(record.selectedPriceWax) + ' WAX';
      return 'Price unavailable';
    }
    if (state.metric === 'volume') {
      if (state.timeframe === '7d') return record.volume7dUsd != null ? '$' + fmtNum(record.volume7dUsd) : '7D unavailable';
      if (state.timeframe === '30d') return record.volume30dUsd != null ? '$' + fmtNum(record.volume30dUsd) : '30D unavailable';
      if (record.volume24Usd != null) return '$' + fmtNum(record.volume24Usd);
      if (record.volume24Wax != null) return fmtNum(record.volume24Wax) + ' WAX';
      return 'Volume unavailable';
    }
    if (state.metric === 'tvl') {
      if (record.tvlUsd != null) return '$' + fmtNum(record.tvlUsd);
      if (record.tvlWax != null) return fmtNum(record.tvlWax) + ' WAX';
      return 'TVL unavailable';
    }
    if (state.metric === 'liquidity') {
      if (record.liquidityUsd != null) return '$' + fmtNum(record.liquidityUsd);
      if (record.liquidityWax != null) return fmtNum(record.liquidityWax) + ' WAX';
      return 'Liquidity unavailable';
    }
    if (state.metric === 'mcap') {
      if (record.marketCapUsd != null) return '$' + fmtNum(record.marketCapUsd) + ' mcap';
      return 'Mkt cap unavailable';
    }
    return 'Unavailable';
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
      toUsd(record.liquidityWax, record.liquidityUsd) || 0,
      toUsd(record.tvlWax, record.tvlUsd) || 0
    );
    var volume = toUsd(record.volume24Wax, record.volume24Usd);
    var cap = toUsd(record.marketCapWax, record.marketCapUsd);
    if (cap == null) cap = toUsd(record.fdvWax, record.fdvUsd);
    var price = toUsd(record.selectedPriceWax, record.selectedPriceUsd);
    var change = asNum(record.change24);
    var movement = change == null ? null : Math.abs(change);
    var coverage = (record.indexedPairCount || 0) * 10 + (record.sourceCount || 0) * 18;
    var score = reweightedScore([
      { weight: 0.4, value: liquidity },
      { weight: 0.25, value: volume },
      { weight: 0.15, value: cap },
      { weight: 0.1, value: movement != null ? movement + (price || 0) * 0.001 : null },
      { weight: 0.1, value: coverage },
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

    tokens.forEach(function (token) {
      var symbol = normalizeSymbol(token.symbol || token.id);
      var contract = normalizeContract(token.contract);
      var key = tokenKey(contract, symbol);
      if (!key || key === WAX_KEY) return;
      var sources = parseSourceKeys(token.source_keys || token.sourceKeys || token.sources);
      byKey[key] = {
        id: key,
        key: key,
        symbol: symbol,
        contract: contract,
        logoUrl: token.icon_url || token.logo || token.image || '',
        selectedPriceWax: asNum(token.selected_price_wax || token.price_wax),
        selectedPriceUsd: asNum(token.selected_price_usd || token.price_usd),
        change24: asNum(token.change_24h),
        change7d: null,
        change30d: null,
        volume24Wax: asNum(token.volume_24h_wax || token.volume_24h),
        volume24Usd: asNum(token.volume_24h_usd),
        volume7dWax: asNum(token.volume_7d_wax),
        volume7dUsd: asNum(token.volume_7d_usd),
        volume30dWax: asNum(token.volume_30d_wax),
        volume30dUsd: asNum(token.volume_30d_usd),
        liquidityWax: asNum(token.liquidity_wax),
        liquidityUsd: asNum(token.liquidity_usd),
        tvlWax: asNum(token.tvl_wax),
        tvlUsd: asNum(token.tvl_usd),
        marketCapWax: asNum(token.market_cap_wax),
        marketCapUsd: asNum(token.market_cap_usd),
        fdvWax: asNum(token.fdv_wax),
        fdvUsd: asNum(token.fdv_usd),
        supply: token.circulating_supply || token.total_supply || '',
        selectedPair: token.selected_pair_id || '',
        selectedSource: sourceLabel(token.selected_pair_source),
        sourceCount: asNum(token.source_count) || sources.length || 0,
        indexedPairCount: asNum(token.indexed_pair_count || token.pair_count) || 0,
        computedPairCount: 0,
        sourcesMap: sources.reduce(function (acc, source) { acc[source] = true; return acc; }, {}),
        sources: sources,
        strongestPair: null,
        strongestPairLabel: '',
        unavailableReasons: parseSourceKeys(token.unavailable_reasons).join(', '),
      };
    });

    pairs.forEach(function (pair) {
      pairKeys(pair).forEach(function (key) {
        if (key === WAX_KEY) return;
        if (!byKey[key]) {
          var sideA = key === tokenKey(pair.token_a_contract, pair.token_a_symbol);
          byKey[key] = {
            id: key,
            key: key,
            symbol: normalizeSymbol(sideA ? pair.token_a_symbol : pair.token_b_symbol),
            contract: normalizeContract(sideA ? pair.token_a_contract : pair.token_b_contract),
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
            liquidityWax: null,
            liquidityUsd: null,
            tvlWax: null,
            tvlUsd: null,
            marketCapWax: null,
            marketCapUsd: null,
            fdvWax: null,
            fdvUsd: null,
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
        var record = byKey[key];
        var source = pairSourceKey(pair);
        if (source) record.sourcesMap[source] = true;
        record.computedPairCount += 1;
        record.strongestPair = betterPair(record.strongestPair, pair);
      });
    });

    return Object.keys(byKey).map(function (key) {
      var record = byKey[key];
      record.sources = Object.keys(record.sourcesMap).sort(compareSources);
      record.sourceCount = Math.max(record.sourceCount || 0, record.sources.length);
      record.indexedPairCount = Math.max(record.indexedPairCount || 0, record.computedPairCount || 0);
      record.strongestPairLabel = record.strongestPair
        ? sourceLabel(record.strongestPair.source) + ' ' + pairLabel(record.strongestPair)
        : (record.selectedSource && record.selectedPair ? record.selectedSource + ' #' + record.selectedPair : 'Unavailable');
      record.searchText = tokenSearchText(record);
      record.score = (record.selectedPriceWax != null || record.selectedPriceUsd != null ? 500000 : 0) +
        (record.indexedPairCount > 0 ? 250000 : 0) +
        (record.selectedPair ? 125000 : 0) +
        Math.log10(1 + (record.liquidityUsd || record.liquidityWax || 0)) * 1000 +
        Math.log10(1 + (record.volume24Usd || record.volume24Wax || 0)) * 700;
      return record;
    }).filter(function (record) {
      return record.key !== WAX_KEY && (record.indexedPairCount > 0 || record.selectedPriceWax != null || record.selectedPriceUsd != null);
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
    if (!query) {
      base = base.filter(function (record) { return record.indexedPairCount > 0; });
    }
    return base.slice(0, TOP_LIMIT).map(function (record, index) {
      record.rank = index + 1;
      return record;
    });
  }

  function computeRadii(records, width, height) {
    var scores = records.map(function (record) {
      return blendedMarketScore(record);
    });
    var positives = scores.filter(function (value) { return value > 0; }).sort(function (a, b) { return a - b; });
    var p95 = positives.length ? positives[Math.max(0, Math.floor(positives.length * 0.95) - 1)] : 1;
    var max = Math.max.apply(Math, scores.concat([1]));
    var mobile = width < 680;
    var minR = mobile ? 15 : 20;
    var maxR = Math.max(minR + 8, Math.min(mobile ? 52 : 88, Math.sqrt(width * height * (mobile ? 0.052 : 0.032) / Math.PI)));
    return records.map(function (record, index) {
      var value = scores[index];
      var norm = value <= 0 ? 0.06 : Math.pow(value / Math.max(p95, 1), 0.72);
      if (value > p95 && max > p95) norm = 0.84 + (Math.log(value / p95) / Math.log(max / p95)) * 0.16;
      norm = Math.max(0.06, Math.min(1, norm));
      return Math.round((minR + norm * (maxR - minR)) * metricEmphasis(record));
    });
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
      var angle = index * 2.399963;
      var spiral = Math.sqrt(index + 1) * 24;
      var node = old || {
        id: record.id,
        x: width / 2 + Math.cos(angle) * spiral,
        y: height / 2 + Math.sin(angle) * spiral,
        vx: 0,
        vy: 0,
        depth: 0.9 + ((index * 37) % 21) / 100,
      };
      node.record = record;
      record.nodeX = node.x;
      record.nodeY = node.y;
      node.radius = old ? old.radius : radii[index];
      node.targetRadius = radii[index];
      node.rank = index + 1;
      node.depth = old && old.depth ? old.depth : 0.9 + ((index * 37) % 21) / 100;
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

  function applyLiveTokenUpdate(record, update) {
    var changed = false;
    var previousVolume = record.volume24Usd != null ? record.volume24Usd : record.volume24Wax;
    var previousChange = record.change24;
    changed = assignLiveNumber(record, 'selectedPriceWax', update.price_wax) || changed;
    changed = assignLiveNumber(record, 'selectedPriceUsd', update.price_usd) || changed;
    changed = assignLiveNumber(record, 'change24', update.change_24h) || changed;
    changed = assignLiveNumber(record, 'volume24Wax', update.volume_24h_wax) || changed;
    changed = assignLiveNumber(record, 'volume24Usd', update.volume_24h_usd) || changed;
    changed = assignLiveNumber(record, 'tvlWax', update.tvl_wax) || changed;
    changed = assignLiveNumber(record, 'tvlUsd', update.tvl_usd) || changed;
    changed = assignLiveNumber(record, 'liquidityWax', update.liquidity_wax) || changed;
    changed = assignLiveNumber(record, 'liquidityUsd', update.liquidity_usd) || changed;
    changed = assignLiveNumber(record, 'indexedPairCount', update.indexed_pair_count) || changed;
    changed = assignLiveNumber(record, 'sourceCount', update.source_count) || changed;
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

  function advanceLiveFallbackCursor(update) {
    if (!update || !update.updated_at) return;
    state.live.cursor = !state.live.cursor || update.updated_at > state.live.cursor ? update.updated_at : state.live.cursor;
  }

  function applyLiveSnapshot(snapshot) {
    var data = payloadData(snapshot);
    var tokens = sourceRows(data.tokens);
    var nextCursor = data.next_cursor || snapshot.next_cursor || null;
    if (nextCursor) state.live.cursor = nextCursor;
    if (!tokens.length) return;
    var byKey = {};
    state.records.forEach(function (record) { byKey[record.key] = record; });
    var changed = 0;
    var changedRecords = [];
    tokens.forEach(function (update) {
      if (!nextCursor) advanceLiveFallbackCursor(update);
      var key = update.token_key || tokenKey(update.contract, update.symbol);
      var record = byKey[key];
      if (!record) return;
      if (applyLiveTokenUpdate(record, update)) {
        changed += 1;
        changedRecords.push(record);
      }
    });
    if (!changed) return;
    state.lastUpdated =
      (tokens[tokens.length - 1] && tokens[tokens.length - 1].updated_at) ||
      data.generated_at ||
      new Date().toISOString();
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
      return 'Whale/high-volume update detected for ' + record.symbol + ' from live indexer data';
    }
    if (isVolumeSpike(previousVolume, nextVolume)) {
      return 'Volume spike: ' + record.symbol + ' 24h volume moved to ' + displayValueForMetric(record, 'volume');
    }
    var change = asNum(record.change24);
    if (change != null && previousChange !== change) return 'Top mover update: ' + record.symbol + ' now ' + fmtPct(change);
    return 'Fresh history building: ' + record.symbol + ' updated from WaxOnEdge live data';
  }

  function displayValueForMetric(record, metric) {
    var oldMetric = state.metric;
    state.metric = metric;
    var value = displayValue(record);
    state.metric = oldMetric;
    return value;
  }

  function addLiveFeed(message, record) {
    state.liveFeed.unshift({
      message: message,
      symbol: record.symbol,
      color: ringColor(record),
      time: Date.now(),
    });
    state.liveFeed = state.liveFeed.slice(0, 6);
    if (record.majorUpdatePending) {
      var currentNode = state.nodes.find(function (node) {
        return node.record && node.record.key === record.key;
      });
      state.camera.focusUntil = performance.now() + 3800;
      state.camera.focusX = currentNode ? currentNode.x : (record.nodeX || 0);
      state.camera.focusY = currentNode ? currentNode.y : (record.nodeY || 0);
      record.majorUpdatePending = false;
    }
    renderLiveFeed();
  }

  function renderLiveFeed() {
    var feed = document.getElementById('woe-ab-live-feed');
    if (!feed) return;
    if (!state.liveFeed.length) {
      feed.innerHTML = '<div class="woe-ab-feed-item"><strong>Live WAX Galaxy</strong><span>Waiting for real WaxOnEdge updates.</span></div>';
      return;
    }
    feed.innerHTML = state.liveFeed.map(function (item) {
      return '<div class="woe-ab-feed-item" style="--feed-color:' + escHtml(item.color) + '">' +
        '<strong>' + escHtml(item.symbol) + '</strong>' +
        '<span>' + escHtml(item.message) + '</span>' +
      '</div>';
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
      state.shockwaves.push({
        x: node.x,
        y: node.y,
        radius: visualRadius(node),
        color: ringColor(node.record),
        startedAt: now,
        duration: 1050,
      });
    });
    if (state.shockwaves.length > 24) state.shockwaves = state.shockwaves.slice(-24);
  }

  function forceSimulationEquivalent(width, height) {
    var nodes = state.nodes;
    var cx = width / 2;
    var cy = height / 2;
    var animate = shouldAnimate();
    for (var tick = 0; tick < 2; tick += 1) {
      nodes.forEach(function (node, index) {
        node.radius += (node.targetRadius - node.radius) * 0.1;
        if (!animate) return;
        node.vx += (cx - node.x) * 0.0025;
        node.vy += (cy - node.y) * 0.0025;
        var ring = Math.sqrt(index + 1) * 3;
        node.vx += Math.cos(index * 1.7 + Date.now() / 9000) * ring * 0.0008;
        node.vy += Math.sin(index * 1.3 + Date.now() / 11000) * ring * 0.0008;
      });
      for (var i = 0; i < nodes.length; i += 1) {
        for (var j = i + 1; j < nodes.length; j += 1) {
          var a = nodes[i];
          var b = nodes[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var min = visualRadius(a) + visualRadius(b) + 4;
          if (dist < min) {
            var push = (min - dist) / dist * 0.04;
            var px = dx * push;
            var py = dy * push;
            a.vx -= px; a.vy -= py;
            b.vx += px; b.vy += py;
          }
        }
      }
    }
    nodes.forEach(function (node) {
      if (state.dragging === node) return;
      node.vx *= 0.88;
      node.vy *= 0.88;
      node.x += node.vx;
      node.y += node.vy;
      var boundsRadius = visualRadius(node);
      node.x = Math.max(boundsRadius + 8, Math.min(width - boundsRadius - 8, node.x));
      node.y = Math.max(boundsRadius + 8, Math.min(height - boundsRadius - 8, node.y));
    });
  }

  function visualRadius(node) {
    return node.radius * (node.depth || 1);
  }

  function signal(record) {
    var change = state.metric === 'change' && state.timeframe !== '24h' ? record['change' + state.timeframe] : record.change24;
    return asNum(change);
  }

  function ringColor(record) {
    var change = signal(record);
    if (change == null) return '#f89422';
    if (change > 5) return '#00ff55';
    if (change > 0) return '#00cc66';
    if (change < -5) return '#ff284f';
    if (change < 0) return '#cc1122';
    return '#f89422';
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
    var key = [r, state.metric, state.timeframe, displayValue(record), record.symbol, record.sourceCount, ringColor(record), img ? 1 : 0, dpr].join('|');
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
    rimGrad.addColorStop(0.93, hexToRgba(rim, 0.34));
    rimGrad.addColorStop(1, hexToRgba(rim, 0.9));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.strokeStyle = rim;
    ctx.shadowColor = rim;
    ctx.shadowBlur = Math.max(8, r * 0.2);
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
    } else {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 ' + Math.max(10, r * 0.35) + 'px Inter, Arial, sans-serif';
      ctx.fillText(record.symbol.slice(0, r > 30 ? 5 : 2), 0, showText ? -r * 0.28 : 0);
    }
    if (showText) {
      var symSize = textFit(ctx, record.symbol, r * 1.48, Math.min(30, Math.max(11, r * 0.31)), 8);
      ctx.font = '900 ' + symSize + 'px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.lineWidth = Math.max(2, symSize * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,.72)';
      ctx.shadowColor = 'rgba(0,0,0,.9)';
      ctx.shadowBlur = Math.max(4, r * 0.08);
      ctx.strokeText(record.symbol, 0, img ? r * 0.05 : -r * 0.02);
      ctx.fillText(record.symbol, 0, img ? r * 0.05 : -r * 0.02);
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
    if (!shouldAnimate()) {
      camera.offsetX += (0 - camera.offsetX) * 0.08;
      camera.offsetY += (0 - camera.offsetY) * 0.08;
      camera.scale += (1 - camera.scale) * 0.08;
      return;
    }
    var targetX = Math.sin(now / 11000) * 18;
    var targetY = Math.cos(now / 13000) * 12;
    var targetScale = 1 + Math.sin(now / 17000) * 0.018;
    if (now < camera.focusUntil) {
      targetX = (width / 2) - camera.focusX;
      targetY = (height / 2) - camera.focusY;
      targetScale = 1.08;
    }
    camera.offsetX += (targetX - camera.offsetX) * 0.015;
    camera.offsetY += (targetY - camera.offsetY) * 0.015;
    camera.scale += (targetScale - camera.scale) * 0.012;
  }

  function applyCamera(ctx, width, height) {
    var camera = state.camera;
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-width / 2 + camera.offsetX, -height / 2 + camera.offsetY);
  }

  function screenToWorld(point) {
    if (!state.canvas) return point;
    var rect = state.canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width);
    var height = Math.max(320, rect.height);
    var camera = state.camera;
    return {
      x: ((point.x - width / 2) / camera.scale) + width / 2 - camera.offsetX,
      y: ((point.y - height / 2) / camera.scale) + height / 2 - camera.offsetY,
    };
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
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    var weather = marketWeather();
    var sky = ctx.createRadialGradient(width * 0.5, height * 0.35, 10, width * 0.5, height * 0.5, Math.max(width, height));
    sky.addColorStop(0, weather.center);
    sky.addColorStop(1, '#000');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    var grid = 64;
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < width; gx += grid) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, height); ctx.stroke();
    }
    for (var gy = 0; gy < height; gy += grid) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(width, gy); ctx.stroke();
    }
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
    return { center: 'rgba(248,148,34,.12)' };
  }

  function drawGalaxyNode(ctx, node, dpr, now) {
    var alpha = state.query && !node.match ? 0.16 : 1;
    var record = node.record;
    var r = Math.round(visualRadius(node));
    ctx.save();
    ctx.globalAlpha = alpha;
    var recent = record.recentUntil && now < record.recentUntil;
    var pulse = record.pulseUntil && now < record.pulseUntil ? (record.pulseUntil - now) / 1600 : 0;
    var volumePulse = record.volumeSpikeUntil && now < record.volumeSpikeUntil ? (record.volumeSpikeUntil - now) / 2600 : 0;
    if (recent || pulse || volumePulse) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 7 + volumePulse * 9, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor(record);
      ctx.globalAlpha = alpha * Math.max(0.25, pulse || volumePulse || 0.22);
      ctx.lineWidth = Math.max(1, r * (0.03 + volumePulse * 0.04));
      ctx.shadowColor = ringColor(record);
      ctx.shadowBlur = 18 + volumePulse * 18;
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
      ctx.strokeStyle = '#f89422';
      ctx.lineWidth = 2;
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
    state.tooltip.innerHTML = '<strong>' + escHtml(record.symbol) + '</strong>' +
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
    return state.live.cursor
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
    state.live.cursor = state.lastUpdated || null;
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
    if (text) text.textContent = state.connected ? 'LIVE' : 'CONNECTING';
    if (updated) updated.textContent = safeTimeLabel(state.lastUpdated) || 'Waiting for sync';
  }

  function safeTimeLabel(value) {
    if (!value) return '';
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
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
      ? TIMEFRAME_LABELS[state.timeframe] + ' history building from fresh live data'
      : state.health && state.health.candle_backfill
      ? (state.health.candle_backfill.latest_1d_candle_count || 0) + ' 1D candles'
      : 'candles pending';
    bar.innerHTML = '<span>' + escHtml(tokenLabel) + '</span>' +
      '<span class="woe-ab-up">▲ ' + escHtml(String(gainers)) + '</span>' +
      '<span class="woe-ab-down">▼ ' + escHtml(String(losers)) + '</span>' +
      '<span>Vol 24h <strong>' + escHtml(fmtNum(volume)) + '</strong></span>' +
      '<span>Top <strong class="woe-ab-up">' + escHtml(topGainer ? topGainer.symbol + ' ' + fmtPct(topGainer.change24) : 'Unavailable') + '</strong></span>' +
      '<span>Bot <strong class="woe-ab-down">' + escHtml(topLoser ? topLoser.symbol + ' ' + fmtPct(topLoser.change24) : 'Unavailable') + '</strong></span>' +
      '<span>Sources <strong>' + escHtml(String(Object.keys(sources).length)) + '</strong></span>' +
      '<span>' + escHtml(candleStatus) + '</span>' +
      '<span>All-pairs WAX valuation model</span>' +
      '<span class="woe-ab-credit">Powered by WaxOnEdge multi-DEX indexer</span>';
  }

  function attachControls() {
    document.querySelectorAll('[data-woe-metric]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.metric = button.getAttribute('data-woe-metric') || 'change';
        document.querySelectorAll('[data-woe-metric]').forEach(function (el) { el.classList.toggle('is-active', el === button); });
        bubbleCanvasCache.clear();
        syncNodes();
      });
    });
    document.querySelectorAll('[data-woe-timeframe]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.timeframe = button.getAttribute('data-woe-timeframe') || '24h';
        document.querySelectorAll('[data-woe-timeframe]').forEach(function (el) { el.classList.toggle('is-active', el === button); });
        bubbleCanvasCache.clear();
        syncNodes();
      });
    });
    var search = document.getElementById('woe-global-search');
    if (search) search.addEventListener('input', function () {
      state.query = String(search.value || '').trim().toLowerCase();
      syncNodes();
    });
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
      ? (state.connected ? 'WAX price unavailable' : 'Connecting to WaxOnEdge indexer')
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
      state.records = normalizeRecords(state.payload);
      state.pairs = sourceRows(payloadData(state.payload).pairs);
      state.connected = true;
      var loadedData = payloadData(state.payload);
      state.lastUpdated = loadedData.updated_at || loadedData.generated_at || new Date().toISOString();
      updateWaxPrice(state.payload);
      syncNodes();
      setStatus();
      state.nodes.forEach(function (node) { loadImage(node.record.logoUrl); });
      startLiveUpdates();
      requestDraw();
    }).catch(function (error) {
      state.connected = false;
      setStatus();
      if (state.board) state.board.innerHTML = '<div class="woe-ab-empty">WaxOnEdge backend unavailable. No fake token data is shown.</div>';
      // eslint-disable-next-line no-console
      console.warn(error);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
}());

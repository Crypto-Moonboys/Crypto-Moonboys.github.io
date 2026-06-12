/**
 * waxonedge-bubbles-v2.js
 *
 * Visual scanner layer for WaxOnEdge. This file is read-only: it fetches the
 * same backend bootstrap payload as the main dashboard and replaces the bubble
 * board with a higher-density, AntBubbles-style market map.
 */
(function () {
  'use strict';

  var API_PATH = '/api/waxonedge/bootstrap';
  var WAX_KEY = tokenKey('eosio.token', 'WAX');
  var state = {
    bootstrapped: false,
    payload: null,
    records: [],
    pairs: [],
    rendering: false,
    observer: null,
    resizeTimer: null,
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

  function fmtNum(value, decimals) {
    var n = asNum(value);
    var d = decimals == null ? 2 : decimals;
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(d) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(d) + 'K';
    return n.toFixed(d);
  }

  function fmtPrice(value) {
    var n = asNum(value);
    if (n == null) return '—';
    if (Math.abs(n) >= 1000) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(4);
    if (Math.abs(n) >= 0.0001) return n.toFixed(6);
    return n.toExponential(4);
  }

  function fmtPct(value) {
    var n = asNum(value);
    if (n == null) return 'No 24h';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function pctClass(value) {
    var n = asNum(value);
    if (n == null) return '';
    return n > 0 ? 'woe-pos' : n < 0 ? 'woe-neg' : '';
  }

  function sourceLabel(value) {
    var source = String(value || '').toLowerCase();
    if (source.indexOf('taco') !== -1) return 'Taco';
    if (source.indexOf('nefty') !== -1) return 'Nefty';
    if (source.indexOf('box') !== -1) return 'BOX';
    if (source.indexOf('alcor') !== -1) return source === 'alcor' ? 'Alcor' : 'swap.alcor';
    return source || 'source';
  }

  function metricLabel(metric) {
    if (metric === 'volume') return '24h volume';
    if (metric === 'pairs') return 'pair count';
    return 'liquidity / TVL';
  }

  function sourceRows(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value && value.value)) return value.value;
    if (Array.isArray(value && value.data)) return value.data;
    if (Array.isArray(value && value.results)) return value.results;
    return [];
  }

  function getPayloadData(envelope) {
    if (!envelope) return null;
    return envelope.data || envelope;
  }

  function readControls() {
    var search = document.getElementById('woe-global-search');
    var metric = document.getElementById('woe-bubble-metric');
    var source = document.getElementById('woe-source-filter');
    return {
      query: String(search && search.value || '').trim().toLowerCase(),
      metric: String(metric && metric.value || 'liquidity'),
      source: String(source && source.value || '').trim().toLowerCase(),
    };
  }

  function pairKeys(pair) {
    return [
      tokenKey(pair.token_a_contract, pair.token_a_symbol),
      tokenKey(pair.token_b_contract, pair.token_b_symbol),
    ].filter(Boolean);
  }

  function pairLiquidity(pair) {
    return {
      wax: asNum(pair.liquidity_wax),
      usd: asNum(pair.liquidity_usd),
    };
  }

  function strongerPair(a, b) {
    if (!a) return b;
    if (!b) return a;
    var aLiq = pairLiquidity(a).wax || pairLiquidity(a).usd || 0;
    var bLiq = pairLiquidity(b).wax || pairLiquidity(b).usd || 0;
    if (bLiq !== aLiq) return bLiq > aLiq ? b : a;
    return (asNum(b.volume_24h) || 0) > (asNum(a.volume_24h) || 0) ? b : a;
  }

  function normalizeRecords(payload) {
    var data = getPayloadData(payload) || {};
    var tokens = sourceRows(data.tokens);
    var pairs = sourceRows(data.pairs);
    var byKey = {};

    tokens.forEach(function (token) {
      var symbol = normalizeSymbol(token.symbol || token.id);
      var contract = normalizeContract(token.contract);
      var key = tokenKey(contract, symbol);
      if (!key) return;
      byKey[key] = {
        key: key,
        symbol: symbol,
        contract: contract,
        pairCount: asNum(token.pair_count) || 0,
        computedPairCount: 0,
        pairLiquidityWax: 0,
        pairLiquidityUsd: 0,
        pairVolume24: 0,
        liquidityWax: asNum(token.liquidity_wax || token.tvl_wax),
        liquidityUsd: asNum(token.liquidity_usd || token.tvl_usd),
        volume24: asNum(token.volume_24h),
        selectedPriceWax: asNum(token.selected_price_wax || token.price_wax || token.system_price),
        selectedPriceUsd: asNum(token.selected_price_usd || token.price_usd || token.usd_price),
        change24: null,
        sources: {},
        strongestPair: null,
      };
    });

    pairs.forEach(function (pair) {
      var keys = pairKeys(pair);
      keys.forEach(function (key) {
        if (!byKey[key]) {
          var sideAKey = tokenKey(pair.token_a_contract, pair.token_a_symbol);
          var side = key === sideAKey
            ? { contract: pair.token_a_contract, symbol: pair.token_a_symbol }
            : { contract: pair.token_b_contract, symbol: pair.token_b_symbol };
          byKey[key] = {
            key: key,
            symbol: normalizeSymbol(side.symbol),
            contract: normalizeContract(side.contract),
            pairCount: 0,
            computedPairCount: 0,
            pairLiquidityWax: 0,
            pairLiquidityUsd: 0,
            pairVolume24: 0,
            liquidityWax: null,
            liquidityUsd: null,
            volume24: null,
            selectedPriceWax: null,
            selectedPriceUsd: null,
            change24: null,
            sources: {},
            strongestPair: null,
          };
        }
        var rec = byKey[key];
        var liq = pairLiquidity(pair);
        if (liq.wax != null) rec.pairLiquidityWax += liq.wax;
        if (liq.usd != null) rec.pairLiquidityUsd += liq.usd;
        var vol = asNum(pair.volume_24h);
        if (vol != null) rec.pairVolume24 += vol;
        if (pair.source) rec.sources[String(pair.source).toLowerCase()] = true;
        rec.strongestPair = strongerPair(rec.strongestPair, pair);
        rec.computedPairCount += 1;
      });
    });

    Object.keys(byKey).forEach(function (key) {
      var rec = byKey[key];
      if (rec.computedPairCount > rec.pairCount) rec.pairCount = rec.computedPairCount;
      if (rec.liquidityWax == null && rec.pairLiquidityWax > 0) rec.liquidityWax = rec.pairLiquidityWax;
      if (rec.liquidityUsd == null && rec.pairLiquidityUsd > 0) rec.liquidityUsd = rec.pairLiquidityUsd;
      if (rec.volume24 == null && rec.pairVolume24 > 0) rec.volume24 = rec.pairVolume24;
      if (rec.strongestPair) {
        var pairChange = asNum(rec.strongestPair.change_24h);
        if (pairChange != null) rec.change24 = pairChange;
      }
    });

    return {
      records: Object.keys(byKey).map(function (key) { return byKey[key]; }),
      pairs: pairs,
    };
  }

  function metricValue(record, metric) {
    if (metric === 'volume') return record.volume24 || 0;
    if (metric === 'pairs') return record.pairCount || Object.keys(record.sources || {}).length || 0;
    return record.liquidityUsd || record.liquidityWax || record.volume24 || record.pairCount || 0;
  }

  function recordMatches(record, controls) {
    if (!record || !record.key || record.key === WAX_KEY) return false;
    var sources = Object.keys(record.sources || {});
    if (controls.source && sources.indexOf(controls.source) === -1) return false;
    if (!controls.query) return true;
    return [record.symbol, record.contract, record.key, sources.join(' ')].join(' ').toLowerCase().indexOf(controls.query) !== -1;
  }

  function sourceBadges(record) {
    var sources = Object.keys(record.sources || {}).sort();
    if (!sources.length) return '<span class="woe-mini-badge">No source</span>';
    var shown = sources.slice(0, 4).map(function (source) {
      return '<span class="woe-mini-badge">' + escHtml(sourceLabel(source)) + '</span>';
    }).join('');
    if (sources.length > 4) shown += '<span class="woe-mini-badge">+' + escHtml(String(sources.length - 4)) + '</span>';
    return shown;
  }

  function bubbleSubtitle(record, metric) {
    if (metric === 'volume') return fmtNum(record.volume24 || 0) + ' vol';
    if (metric === 'pairs') return String(record.pairCount || 0) + ' pairs';
    if (record.liquidityUsd != null || record.liquidityWax != null) {
      var pieces = [];
      if (record.liquidityWax != null) pieces.push(fmtNum(record.liquidityWax) + ' WAX');
      if (record.liquidityUsd != null) pieces.push('$' + fmtNum(record.liquidityUsd));
      return pieces.join(' · ');
    }
    return 'Liquidity unavailable';
  }

  function tokenPriceLine(record) {
    if (record.selectedPriceUsd != null) return '$' + fmtPrice(record.selectedPriceUsd);
    if (record.selectedPriceWax != null) return fmtPrice(record.selectedPriceWax) + ' WAX';
    return 'Price unavailable';
  }

  function classForChange(record) {
    var n = asNum(record.change24);
    if (n == null) return 'woe-bubble-flat';
    return n >= 0 ? 'woe-bubble-up' : 'woe-bubble-down';
  }

  function buildLayout(items, board) {
    var width = Math.max(920, Math.floor((board && board.clientWidth) || 1180) - 48);
    var height = Math.max(620, Math.min(960, Math.round(width * 0.58)));
    var placed = [];
    var centerX = width / 2;
    var centerY = height / 2;
    var golden = Math.PI * (3 - Math.sqrt(5));

    items.forEach(function (item, index) {
      var r = item.size / 2;
      var point = null;
      if (index === 0) {
        point = { x: centerX, y: centerY };
      } else {
        for (var step = 0; step < 1300; step += 1) {
          var angle = (index * golden) + (step * 0.42);
          var radius = 24 + Math.sqrt(step) * 20 + index * 1.7;
          var x = centerX + Math.cos(angle) * radius;
          var y = centerY + Math.sin(angle) * radius * 0.68;
          if (x - r < 12 || x + r > width - 12 || y - r < 12 || y + r > height - 12) continue;
          var collides = placed.some(function (other) {
            var dx = x - other.x;
            var dy = y - other.y;
            var min = (r + other.r) * 0.78;
            return Math.sqrt((dx * dx) + (dy * dy)) < min;
          });
          if (!collides) {
            point = { x: x, y: y };
            break;
          }
        }
      }
      if (!point) {
        var fallbackAngle = index * golden;
        var fallbackRadius = 80 + (index % 14) * 34;
        point = {
          x: Math.min(width - r - 12, Math.max(r + 12, centerX + Math.cos(fallbackAngle) * fallbackRadius)),
          y: Math.min(height - r - 12, Math.max(r + 12, centerY + Math.sin(fallbackAngle) * fallbackRadius * 0.7)),
        };
      }
      placed.push({ x: point.x, y: point.y, r: r });
      item.x = (point.x / width) * 100;
      item.y = (point.y / height) * 100;
    });

    return height;
  }

  function getVisibleRecords(controls) {
    return state.records.filter(function (record) {
      return recordMatches(record, controls);
    }).sort(function (a, b) {
      return metricValue(b, controls.metric) - metricValue(a, controls.metric);
    }).slice(0, 99);
  }

  function renderRail(records, controls) {
    var totalLiquidityWax = records.reduce(function (sum, record) { return sum + (record.liquidityWax || 0); }, 0);
    var totalVolume = records.reduce(function (sum, record) { return sum + (record.volume24 || 0); }, 0);
    var sources = {};
    records.forEach(function (record) {
      Object.keys(record.sources || {}).forEach(function (source) { sources[source] = true; });
    });
    return '<div class="woe-v2-rail" aria-label="Visible bubble market summary">' +
      '<div><span>View</span><strong>Top ' + escHtml(String(records.length)) + '</strong><em>' + escHtml(metricLabel(controls.metric)) + '</em></div>' +
      '<div><span>Liquidity</span><strong>' + escHtml(fmtNum(totalLiquidityWax)) + ' WAX</strong><em>visible tokens</em></div>' +
      '<div><span>24h Volume</span><strong>' + escHtml(fmtNum(totalVolume)) + '</strong><em>reported rows</em></div>' +
      '<div><span>Sources</span><strong>' + escHtml(String(Object.keys(sources).length)) + '</strong><em>' + escHtml(Object.keys(sources).map(sourceLabel).slice(0, 3).join(' / ') || 'pending') + '</em></div>' +
    '</div>';
  }

  function renderBubbles() {
    var board = document.getElementById('woe-bubble-board');
    if (!board || !state.records.length) return;
    var controls = readControls();
    var records = getVisibleRecords(controls);
    if (!records.length) {
      state.rendering = true;
      board.classList.add('woe-v2-board');
      board.innerHTML = '<div class="woe-v2-map-shell"><div class="woe-chart-empty">No indexed tokens match the current filters.</div></div>';
      state.rendering = false;
      return;
    }

    var max = records.reduce(function (best, record) {
      return Math.max(best, metricValue(record, controls.metric));
    }, 1);
    var decorated = records.map(function (record, index) {
      var ratio = Math.max(0.08, Math.min(1, metricValue(record, controls.metric) / max));
      var size = Math.round(62 + Math.pow(ratio, 0.55) * 128);
      return { record: record, index: index, ratio: ratio, size: size };
    });
    var height = buildLayout(decorated, board);
    var bubbleHtml = decorated.map(function (item) {
      var record = item.record;
      var change = asNum(record.change24);
      var active = tokenKey(new URLSearchParams(window.location.search || '').get('contract'), new URLSearchParams(window.location.search || '').get('token')) === record.key;
      var pairSource = record.strongestPair && record.strongestPair.source ? sourceLabel(record.strongestPair.source) : 'No pair';
      return '<button class="woe-bubble-token woe-v2-bubble ' + escHtml(classForChange(record)) + (active ? ' woe-v2-bubble-active' : '') + '" type="button"' +
        ' data-token="' + escHtml(record.symbol) + '" data-contract="' + escHtml(record.contract) + '"' +
        ' style="--bubble-size:' + escHtml(String(item.size)) + 'px;--bubble-glow:' + escHtml(String(Math.round(16 + item.ratio * 46))) + 'px;--x:' + escHtml(item.x.toFixed(3)) + ';--y:' + escHtml(item.y.toFixed(3)) + ';--delay:' + escHtml(String((item.index % 9) * -0.7)) + 's;"' +
        ' title="' + escHtml(record.symbol + ' @ ' + record.contract + ' · ' + bubbleSubtitle(record, controls.metric)) + '">' +
          '<span class="woe-bubble-rank">#' + escHtml(String(item.index + 1)) + '</span>' +
          '<strong>' + escHtml(record.symbol) + '</strong>' +
          '<span class="woe-bubble-price">' + escHtml(tokenPriceLine(record)) + '</span>' +
          '<span class="woe-bubble-metric">' + escHtml(bubbleSubtitle(record, controls.metric)) + '</span>' +
          '<span class="woe-bubble-change ' + escHtml(pctClass(change)) + '">' + escHtml(fmtPct(change)) + '</span>' +
          '<span class="woe-v2-pair-source">' + escHtml(pairSource) + ' · ' + escHtml(String(record.pairCount || 0)) + ' pairs</span>' +
          '<span class="woe-bubble-badges">' + sourceBadges(record) + '</span>' +
        '</button>';
    }).join('');

    state.rendering = true;
    board.classList.add('woe-v2-board');
    board.setAttribute('aria-label', 'WaxOnEdge visual bubble map for indexed WAX tokens');
    board.innerHTML = '<div class="woe-v2-map-shell">' +
      renderRail(records, controls) +
      '<div class="woe-v2-map-note">Bubble size follows ' + escHtml(metricLabel(controls.metric)) + '. Colour follows indexed 24h change where available. Missing data is left as unavailable.</div>' +
      '<div class="woe-v2-bubble-cloud" style="--cloud-height:' + escHtml(String(height)) + 'px;">' + bubbleHtml + '</div>' +
    '</div>';
    state.rendering = false;
  }

  function navigateToToken(symbol, contract) {
    if (!symbol || !contract) return;
    var url = new URL(window.location.href);
    url.searchParams.set('token', symbol);
    url.searchParams.set('contract', contract);
    url.hash = 'woe-token-detail';
    window.history.pushState({}, '', url.toString());
    if (typeof PopStateEvent === 'function') {
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      window.dispatchEvent(new Event('popstate'));
    }
    renderBubbles();
    var detail = document.getElementById('woe-token-detail');
    if (detail && typeof detail.scrollIntoView === 'function') {
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function attachBoardDelegates() {
    var board = document.getElementById('woe-bubble-board');
    if (!board || board.dataset.v2Delegates === 'true') return;
    board.dataset.v2Delegates = 'true';
    board.addEventListener('click', function (event) {
      var bubble = event.target && event.target.closest ? event.target.closest('.woe-v2-bubble') : null;
      if (!bubble) return;
      event.preventDefault();
      navigateToToken(bubble.getAttribute('data-token'), bubble.getAttribute('data-contract'));
    });
  }

  function attachControlDelegates() {
    ['woe-global-search', 'woe-bubble-metric', 'woe-source-filter'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.v2Bound === 'true') return;
      el.dataset.v2Bound = 'true';
      var eventName = id === 'woe-global-search' ? 'input' : 'change';
      el.addEventListener(eventName, function () {
        window.setTimeout(renderBubbles, 0);
        window.setTimeout(renderBubbles, 80);
      });
    });
  }

  function enhanceSourceStrip(payload) {
    var data = getPayloadData(payload) || {};
    var sources = data.sources || {};
    var aggregateCount = data.summary && data.summary.token_aggregate_count;
    var meta = document.getElementById('woe-source-status-meta');
    if (meta) {
      var indexedCount = Object.keys(sources).filter(function (key) { return sources[key] && sources[key].indexed; }).length;
      meta.textContent = indexedCount + ' indexed source snapshot(s) · ' + (aggregateCount == null ? '0' : aggregateCount) + ' aggregate token row(s)';
    }
  }

  function startObserver() {
    var board = document.getElementById('woe-bubble-board');
    if (!board || state.observer || typeof MutationObserver === 'undefined') return;
    state.observer = new MutationObserver(function () {
      if (state.rendering || !state.bootstrapped) return;
      window.clearTimeout(board.__woeV2RenderTimer);
      board.__woeV2RenderTimer = window.setTimeout(renderBubbles, 60);
    });
    state.observer.observe(board, { childList: true });
  }

  function handleResize() {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(renderBubbles, 120);
  }

  function fetchBootstrap() {
    return fetch(API_PATH, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('WaxOnEdge bootstrap failed: ' + response.status);
        return response.json();
      });
  }

  function init() {
    attachBoardDelegates();
    attachControlDelegates();
    startObserver();
    fetchBootstrap().then(function (payload) {
      var normalized = normalizeRecords(payload);
      state.payload = payload;
      state.records = normalized.records;
      state.pairs = normalized.pairs;
      state.bootstrapped = true;
      enhanceSourceStrip(payload);
      renderBubbles();
      window.setTimeout(renderBubbles, 500);
      window.setTimeout(renderBubbles, 1500);
    }).catch(function () {
      // The base WaxOnEdge script already owns the diagnostic fallback. This
      // enhancement layer stays silent when the backend is unavailable.
    });
    window.addEventListener('resize', handleResize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());

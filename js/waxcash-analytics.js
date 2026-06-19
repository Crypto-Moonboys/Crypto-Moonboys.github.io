(function () {
  'use strict';

  var ENDPOINT = '/api/waxonedge/waxcash-analytics';
  var DASH = '--';
  var state = {
    payload: null,
    chartFeed: null,
    view: 'selected',
    chart: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function num(value) {
    if (value == null || value === '') return null;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function fmt(value, digits) {
    var parsed = num(value);
    if (parsed == null) return DASH;
    var abs = Math.abs(parsed);
    var maximumFractionDigits = digits == null ? (abs >= 1000 ? 2 : 8) : digits;
    return parsed.toLocaleString(undefined, { maximumFractionDigits: maximumFractionDigits });
  }

  function fmtUsd(value) {
    var parsed = num(value);
    if (parsed == null) return DASH;
    if (Math.abs(parsed) < 0.000001 && parsed !== 0) return '$' + parsed.toExponential(4);
    return '$' + parsed.toLocaleString(undefined, {
      minimumFractionDigits: parsed >= 1 ? 2 : 6,
      maximumFractionDigits: parsed >= 1 ? 2 : 8,
    });
  }

  function fmtWax(value) {
    var parsed = num(value);
    return parsed == null ? DASH : fmt(parsed, parsed >= 1000 ? 2 : 8) + ' WAX';
  }

  function fmtToken(value, symbol) {
    var parsed = num(value);
    return parsed == null ? DASH : fmt(parsed, parsed >= 1000 ? 4 : 8) + (symbol ? ' ' + symbol : '');
  }

  function pct(value) {
    var parsed = num(value);
    if (parsed == null) return DASH;
    return parsed.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' %';
  }

  var REASON_LABELS = {
    paired_token_wax_price_unavailable: 'Paired token WAX price unavailable',
    missing_or_zero_reserves: 'Missing or zero reserves',
    direct_wax_price_unavailable: 'Direct WAX price unavailable',
    selected_price_unavailable: 'Selected price unavailable',
    liquidity_unavailable: 'Liquidity unavailable',
    selected_direct_wax_price_pair_unavailable: 'Selected direct WAX price pair unavailable',
    waxcash_wax_chart_candles_unavailable_after_direction_normalization: 'WAXCASH/WAX chart candles unavailable after direction normalization',
    circulating_supply_unavailable: 'Circulating supply unavailable',
  };

  function humanReason(reason) {
    if (!reason) return '';
    return String(reason)
      .split(',')
      .map(function (part) {
        var key = part.trim();
        if (!key) return '';
        return REASON_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
      })
      .filter(Boolean)
      .join(', ');
  }

  function statusTitle(row) {
    var parts = [];
    if (row && row.source) parts.push('Source: ' + row.source);
    if (row && row.basis) parts.push('Basis: ' + row.basis);
    if (row && row.formula) parts.push('Formula: ' + row.formula);
    var reason = humanReason(row && row.reason);
    if (reason) parts.push('Reason: ' + reason);
    return parts.join(' | ');
  }

  function proofDot(row) {
    var title = statusTitle(row);
    return title ? '<span class="wx-reason-dot" title="' + esc(title) + '" aria-label="' + esc(title) + '">i</span>' : '';
  }

  function valueForStat(row) {
    if (!row || row.live === false) return '<span class="wx-muted">Unavailable</span>' + proofDot(row);
    if (row.key === 'token') return '<span class="wx-token"><strong>WAXCASH</strong>graffitiking</span>';
    if (row.key === 'decimals') return esc(row.value == null ? DASH : row.value) + proofDot(row);
    if (row.key === 'change_24h') {
      var change = num(row.value);
      return '<span class="' + (change == null ? 'wx-muted' : (change >= 0 ? 'wx-positive' : 'wx-negative')) + '">' + esc(pct(change)) + '</span>' + proofDot(row);
    }
    if (row.value_token != null) return esc(fmtToken(row.value_token, row.token_symbol)) + proofDot(row);
    var wax = fmtWax(row.value_wax);
    var usd = fmtUsd(row.value_usd);
    if (wax !== DASH && usd !== DASH) return esc(wax) + '<span class="wx-subvalue">' + esc(usd) + '</span>' + proofDot(row);
    if (wax !== DASH) return esc(wax) + proofDot(row);
    if (usd !== DASH) return esc(usd) + proofDot(row);
    if (row.value != null) return esc(fmt(row.value, 8)) + proofDot(row);
    return '<span class="wx-muted">Unavailable</span>' + proofDot(row);
  }

  function statRow(row) {
    return '<div class="wx-row">' +
      '<div class="wx-label">' + esc(row.label || row.key || '') + '</div>' +
      '<div class="wx-value ' + (row.live === false ? 'wx-muted' : '') + '">' + valueForStat(row) + '</div>' +
      '</div>';
  }

  function renderStats(payload) {
    var sections = payload.sections || {};
    var token = payload.token || {};
    var tokenStats = sections.token_stats || {};
    var rows = Array.isArray(tokenStats.rows) ? tokenStats.rows : [];
    var priceProof = sections.price_proof || {};
    var icon = $('wx-token-icon');
    if (icon && token.icon_url) icon.src = token.icon_url;
    $('wx-price-source').textContent = priceProof.pair_label
      ? 'Price proof: ' + priceProof.pair_label
      : (humanReason(priceProof.reason) || 'Price proof unavailable');
    $('wx-stats').innerHTML = rows.length
      ? rows.map(statRow).join('')
      : statRow({ label: 'Status', live: false, reason: 'Backend token_stats section unavailable.' });
  }

  function pairRows(payload) {
    var sections = payload.sections || {};
    var section = sections.pair_table || {};
    return Array.isArray(section.rows) ? section.rows : [];
  }

  function pairKey(row) {
    return String((row && row.source) || '') + ':' + String((row && row.pair_id) || '');
  }

  function pairLabel(row) {
    if (!row) return 'WAXCASH/WAX';
    return row.pair_label || [row.token_a_symbol, row.token_b_symbol].filter(Boolean).join('/') || 'WAXCASH pair';
  }

  function sourceLabel(row) {
    if (!row) return DASH;
    return [row.source || DASH, row.pair_id ? '#' + row.pair_id : ''].filter(Boolean).join(' ');
  }

  function pickPoolViews(rows) {
    var selected = rows.find(function (row) { return row.is_selected_price_pair; }) || rows[0] || null;
    var valued = rows.filter(function (row) { return num(row.liquidity_wax) != null; });
    var best = valued.slice().sort(function (a, b) { return (num(b.liquidity_wax) || 0) - (num(a.liquidity_wax) || 0); })[0] || selected;
    var low = valued.slice().sort(function (a, b) { return (num(a.liquidity_wax) || 0) - (num(b.liquidity_wax) || 0); })[0] || rows.find(function (row) { return row.status === 'unavailable'; }) || selected;
    var weighted = valued.find(function (row) { return !row.is_selected_price_pair; }) || best || selected;
    return [
      { key: 'selected', label: 'Selected proof pool', row: selected },
      { key: 'best', label: 'Best liquidity pool', row: best },
      { key: 'low', label: 'Worst/low liquidity pool', row: low },
      { key: 'weighted', label: 'Weighted/valued pool view', row: weighted },
    ];
  }

  function activeView(payload) {
    var views = pickPoolViews(pairRows(payload));
    return views.find(function (view) { return view.key === state.view; }) || views[0] || { key: 'selected', label: 'Selected proof pool', row: null };
  }

  function setActiveView(key) {
    state.view = key;
    renderPoolControls(state.payload);
    renderPairDetail(state.payload);
    renderPairs(state.payload);
  }

  function renderPoolControls(payload) {
    var views = pickPoolViews(pairRows(payload));
    $('wx-view-controls').innerHTML = views.map(function (view) {
      var isActive = view.key === state.view;
      return '<button class="wx-view-button ' + (isActive ? 'is-active' : '') + '" type="button" data-view="' + esc(view.key) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '">' +
        esc(view.label + ' detail') +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.wx-view-button'), function (button) {
      button.addEventListener('click', function () { setActiveView(button.getAttribute('data-view')); });
    });
  }

  function dual(wax, usd, reason) {
    var waxText = fmtWax(wax);
    var usdText = fmtUsd(usd);
    if (waxText !== DASH && usdText !== DASH) return '<span>' + esc(waxText) + '</span><span class="wx-cell-sub">' + esc(usdText) + '</span>';
    if (waxText !== DASH) return esc(waxText);
    if (usdText !== DASH) return esc(usdText);
    return '<span class="wx-muted" title="' + esc(humanReason(reason)) + '">Unavailable</span>';
  }

  function pairStatus(row) {
    if (!row) return '<span class="wx-muted">Unavailable</span>';
    if (row.is_selected_price_pair) return '<span class="wx-positive">Selected proof</span>';
    if (row.status === 'unavailable') return '<span class="wx-muted" title="' + esc(humanReason(row.reason)) + '">Unavailable</span>';
    if (num(row.liquidity_wax) != null && num(row.liquidity_wax) < 1) return '<span class="wx-warning">Low liquidity</span>';
    if (row.is_direct_wax_pair) return '<span class="wx-positive">Direct WAX</span>';
    return '<span class="wx-positive">Valued</span>';
  }

  function tokenLabel(row) {
    return '<span class="wx-token"><strong>' + esc(row.token_a_symbol || DASH) + '</strong>' + esc(row.token_a_contract || '') + '</span>' +
      '<span class="wx-token"><strong>' + esc(row.token_b_symbol || DASH) + '</strong>' + esc(row.token_b_contract || '') + '</span>';
  }

  function renderPairDetail(payload) {
    var view = activeView(payload);
    var row = view.row || {};
    $('wx-pair-detail').innerHTML =
      '<div><span>Display view</span>' + esc(view.label) + '</div>' +
      '<div><span>Pair</span>' + esc(pairLabel(row)) + '</div>' +
      '<div><span>Source</span>' + esc(sourceLabel(row)) + '</div>' +
      '<div><span>Status</span>' + pairStatus(row) + '</div>' +
      '<div><span>Liquidity</span>' + dual(row.liquidity_wax, row.liquidity_usd, row.reason) + '</div>' +
      '<div><span>24h volume</span>' + dual(row.volume_24h_wax, row.volume_24h_usd, row.reason) + '</div>' +
      '<div><span>Reserves</span>' + esc(row.reserves_label || DASH) + '</div>' +
      '<div><span>Proof</span>' + esc(humanReason(row.proof_label || row.reason || 'Verified indexed row')) + '</div>';
  }

  function renderPairs(payload) {
    var rows = pairRows(payload);
    var view = activeView(payload);
    var activeKey = pairKey(view.row);
    $('wx-pair-summary').textContent = rows.length + ' indexed WAXCASH pairs';
    if (!rows.length) {
      $('wx-pairs').innerHTML = '<tr><td colspan="9" class="wx-muted">No source-backed WAXCASH pair rows returned.</td></tr>';
      return;
    }
    $('wx-pairs').innerHTML = rows.map(function (row, index) {
      var fee = row.fee_bps != null ? fmt(row.fee_bps / 100, 2) + ' %' : (row.is_direct_wax_pair ? 'Direct' : DASH);
      var pairPrice = row.proof_details && row.proof_details.reserve_ratio != null
        ? fmt(row.proof_details.reserve_ratio, 8) + ' WAXCASH pair ratio'
        : DASH;
      return '<tr class="' + (pairKey(row) === activeKey ? 'is-selected' : '') + '">' +
        '<td>#' + (index + 1) + '</td>' +
        '<td><span class="wx-source">' + esc(row.source || DASH) + '</span><span class="wx-cell-sub">' + esc(row.pair_id || DASH) + '</span></td>' +
        '<td>' + esc(fee) + '</td>' +
        '<td>' + tokenLabel(row) + '</td>' +
        '<td>' + dual(row.liquidity_wax, row.liquidity_usd, row.reason) + '</td>' +
        '<td>' + esc(pairPrice) + '</td>' +
        '<td>' + pairStatus(row) + '</td>' +
        '<td>' + dual(row.volume_24h_wax, row.volume_24h_usd, row.reason) + '</td>' +
        '<td>' + esc(row.reserves_label || DASH) + '</td>' +
        '</tr>';
    }).join('');
  }

  function tradingViewFeedCandles(feed) {
    if (!feed || feed.s !== 'ok' || !Array.isArray(feed.t)) return [];
    return feed.t.map(function (time, index) {
      var close = num(feed.c && feed.c[index]);
      if (time == null || close == null) return null;
      return {
        time: Number(time),
        open: num(feed.o && feed.o[index]) != null ? num(feed.o && feed.o[index]) : close,
        high: num(feed.h && feed.h[index]) != null ? num(feed.h && feed.h[index]) : close,
        low: num(feed.l && feed.l[index]) != null ? num(feed.l && feed.l[index]) : close,
        close: close,
      };
    }).filter(Boolean).sort(function (a, b) { return a.time - b.time; });
  }

  function chartCandles(feed) {
    return tradingViewFeedCandles(feed);
  }

  function renderLightweightCandles(payload, feed) {
    var host = $('wx-chart');
    var candles = chartCandles(feed);
    var tv = window.LightweightCharts;
    if (state.chart && typeof state.chart.remove === 'function') {
      try { state.chart.remove(); } catch (_) {}
      state.chart = null;
    }
    if (!host) return false;
    if (!candles.length) {
      host.innerHTML = '<div class="wx-chart-empty">No indexed WAX-per-WAXCASH chart-feed candles are available.</div>';
      return false;
    }
    if (!tv || typeof tv.createChart !== 'function') {
      host.innerHTML = '<div class="wx-chart-empty">Lightweight Charts renderer unavailable. No alternate chart is shown.</div>';
      return false;
    }
    host.innerHTML = '<div id="wx-lightweight-chart" class="wx-lightweight-chart" role="img" aria-label="WAX per WAXCASH OHLCV candlestick chart"></div>';
    var chartHost = $('wx-lightweight-chart');
    var chart = tv.createChart(chartHost, {
      autoSize: true,
      height: chartHost.clientHeight || 510,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#d8dee8',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.14)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.14)' },
      },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.25)' },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.25)' },
    });
    var factory = tv.CandlestickSeries || null;
    var series = factory && typeof chart.addSeries === 'function'
      ? chart.addSeries(factory, {
        upColor: '#00e6b0',
        downColor: '#ff3d67',
        borderUpColor: '#00e6b0',
        borderDownColor: '#ff3d67',
        wickUpColor: '#00e6b0',
        wickDownColor: '#ff3d67',
      })
      : chart.addCandlestickSeries({
        upColor: '#00e6b0',
        downColor: '#ff3d67',
        borderUpColor: '#00e6b0',
        borderDownColor: '#ff3d67',
        wickUpColor: '#00e6b0',
        wickDownColor: '#ff3d67',
      });
    series.setData(candles);
    chart.timeScale().fitContent();
    state.chart = chart;
    return true;
  }

  function updateChartLabels(payload) {
    var sections = (payload || {}).sections || {};
    var chart = sections.chart || {};
    var external = sections.chart_external || {};
    var feedLabel = external.pool_id
      ? 'Alcor pool #' + external.pool_id + ' display feed'
      : (chart.source && chart.pair_id ? chart.source + ' #' + chart.pair_id + ' display feed' : 'Backend chart display feed');
    $('wx-chart-source').textContent = feedLabel;
    $('wx-chart-feed-label').textContent = feedLabel;
    $('wx-chart-pair-title').textContent = 'WAXCASH/WAX';
  }

  function chartFeedUrl(payload) {
    var sections = (payload || {}).sections || {};
    var chart = sections.chart || {};
    return chart.feed_url || null;
  }

  function renderChart(payload, feed) {
    updateChartLabels(payload);
    renderLightweightCandles(payload, feed || state.chartFeed);
  }

  function loadChartFeed(payload) {
    var feedUrl = chartFeedUrl(payload);
    if (!feedUrl) {
      state.chartFeed = null;
      var host = $('wx-chart');
      if (host) {
        host.innerHTML = '<div class="wx-chart-empty">Chart feed unavailable: backend did not provide sections.chart.feed_url.</div>';
      }
      return Promise.resolve(false);
    }
    return fetch(feedUrl, { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (feedPayload) {
        state.chartFeed = feedPayload && feedPayload.data ? feedPayload.data : feedPayload;
        renderChart(payload, state.chartFeed);
      })
      .catch(function () {
        state.chartFeed = null;
        var host = $('wx-chart');
        if (host) {
          host.innerHTML = '<div class="wx-chart-empty">No indexed WAX-per-WAXCASH chart-feed candles are available.</div>';
        }
      });
  }

  function render(payload) {
    state.payload = payload || {};
    var stats = state.payload.stats || {};
    var sections = state.payload.sections || {};
    var supply = sections.supply_proof || {};
    var status = stats.updated_at ? 'Updated ' + stats.updated_at : 'Indexed analytics loaded';
    if (supply.live === false && supply.reason) status += ' | Supply: ' + humanReason(supply.reason);
    $('wx-status').textContent = status;
    renderStats(state.payload);
    renderPoolControls(state.payload);
    loadChartFeed(state.payload);
    renderPairDetail(state.payload);
    renderPairs(state.payload);
  }

  fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function (payload) {
      render(payload && payload.data ? payload.data : payload);
    })
    .catch(function (error) {
      $('wx-status').textContent = 'Analytics unavailable';
      $('wx-stats').innerHTML = statRow({ label: 'Status', live: false, reason: error.message || String(error) });
      $('wx-chart').innerHTML = '<div class="wx-chart-empty">WAXCASH chart unavailable.</div>';
      $('wx-pair-detail').innerHTML = '<div><span>Status</span>Unavailable</div>';
      $('wx-pairs').innerHTML = '<tr><td colspan="9" class="wx-muted">Pair table unavailable.</td></tr>';
    });
}());

(function () {
  'use strict';

  var TOKEN_PAGE_PATH = '/api/waxonedge/token-page/wuffi/WUF';
  var ALCOR_CANDLES = 'https://wax.alcor.exchange/api/v2/swap/candles';
  var TOKEN_A = 'wuf-wuffi';
  var TOKEN_B = 'wax-eosio.token';
  var CONTAINER_ID = 'wuf-tv-chart-container';
  var RESOLUTIONS = ['1', '5', '15', '30', '60', '240', 'D', 'W', 'M'];
  var activeResolution = '240';
  var subscriptions = {};
  var pairSort = 'liquidity';
  var latestPairs = [];
  var latestSuppressedCount = 0;
  var analyticsRequestId = 0;
  var analyticsController = null;
  var DEX_LOGOS = {
    alcor: '/img/waxonedge/dex/alcor.png',
    'swap.alcor': '/img/waxonedge/dex/alcor.png',
    'swap.taco': '/img/waxonedge/dex/taco.png',
    'swap.nefty': '/img/waxonedge/dex/neftyblocks.png',
    'swap.box': '/img/waxonedge/dex/defibox.png',
    'swap.adex': '/img/waxonedge/dex/adex.png',
    'dapp.fusion': '/img/waxonedge/dex/waxfusion.png'
  };

  function byId(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function num(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
  function firstValue() {
    for (var i = 0; i < arguments.length; i += 1) {
      if (arguments[i] != null && arguments[i] !== '') return arguments[i];
    }
    return null;
  }
  function unavailable() { return '<span class="token-muted">Unavailable</span>'; }
  function fmt(value, suffix) {
    var parsed = num(value);
    if (parsed == null) return 'Unavailable';
    var abs = Math.abs(parsed);
    return parsed.toLocaleString(undefined, { maximumFractionDigits: abs >= 1000 ? 2 : 8 }) + (suffix || '');
  }
  function fmtToken(value, symbol) {
    var parsed = num(value);
    if (parsed == null) return null;
    return parsed.toLocaleString(undefined, { maximumFractionDigits: Math.abs(parsed) >= 1000 ? 2 : 8 }) + (symbol ? ' ' + symbol : '');
  }
  function dual(wax, usd) {
    var parts = [];
    if (num(wax) != null) parts.push(esc(fmt(wax, ' WAX')));
    if (num(usd) != null) parts.push('<small>$' + esc(fmt(usd, '')) + '</small>');
    return parts.length ? parts.join('') : unavailable();
  }
  function pct(value) {
    var parsed = num(value);
    if (parsed == null) return unavailable();
    var klass = parsed < 0 ? 'token-negative' : (parsed > 0 ? 'token-positive' : 'token-muted');
    return '<span class="' + klass + '">' + esc(parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })) + ' %</span>';
  }
  function pairName(row) { return row && row.pair_label || [row && row.token_a_symbol, row && row.token_b_symbol].filter(Boolean).join('/') || 'WUF pair'; }
  function price(row) {
    var value = firstValue(row && row.display_price, row && row.price);
    return num(value) == null ? unavailable() : esc(fmt(value, ''));
  }
  function sourceKey(value) { return String(value || '').trim().toLowerCase(); }
  function sourceLabel(row) {
    var source = row && row.source || 'Unavailable';
    var logo = DEX_LOGOS[sourceKey(source)];
    var image = logo ? '<img class="token-dex-logo" src="' + esc(logo) + '" alt="" loading="lazy" decoding="async">' : '';
    return '<span class="token-source-name">' + image + '<span>' + esc(source) + '</span></span>';
  }
  function tokenIcon(url, symbol) {
    if (!url) return '<span class="token-icon token-icon-fallback" aria-hidden="true">' + esc(String(symbol || '').slice(0, 1).toUpperCase()) + '</span>';
    return '<img class="token-icon" src="' + esc(url) + '" alt="" loading="lazy" decoding="async">';
  }
  function pairCell(row) {
    var badge = row && row.display_liquidity_basis === 'waxcash_verified_pair_liquidity'
      ? '<div class="token-clean-badge">Verified liquidity</div>'
      : '';
    return '<div class="token-pair-line">' +
      tokenIcon(row && row.token_a_icon, row && row.token_a_symbol) +
      '<span>' + esc(row && row.token_a_symbol || 'Token') + '</span>' +
      '<span class="token-muted">/</span>' +
      tokenIcon(row && row.token_b_icon, row && row.token_b_symbol) +
      '<span>' + esc(row && row.token_b_symbol || 'Token') + '</span>' +
      '</div><div class="token-muted">' + esc([row && row.token_a_contract, row && row.token_b_contract].filter(Boolean).join(' / ')) + '</div>' + badge;
  }
  function cleanValue(html) {
    return '<span class="token-value-with-proof">' + html + '</span>';
  }
  function liquidity(row) {
    return cleanValue(dual(
      firstValue(row && row.display_liquidity_wax, row && row.liquidity_wax),
      firstValue(row && row.display_liquidity_usd, row && row.liquidity_usd)
    ));
  }
  function owns(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }
  function volume(row, prefix) {
    var displayWaxKey = 'display_' + prefix + '_wax';
    var displayUsdKey = 'display_' + prefix + '_usd';
    var displayNativeKey = 'display_' + prefix + '_native';
    var displayNativeAKey = 'display_' + prefix + '_a_native';
    var displayNativeBKey = 'display_' + prefix + '_b_native';
    var hasDisplayVolume = owns(row, displayWaxKey) || owns(row, displayUsdKey) || owns(row, displayNativeKey);
    var converted = dual(
      hasDisplayVolume ? row && row[displayWaxKey] : row && row[prefix + '_wax'],
      hasDisplayVolume ? row && row[displayUsdKey] : row && row[prefix + '_usd']
    );
    if (!converted.includes('Unavailable')) {
      return cleanValue(converted);
    }
    var nativeLines = [];
    var nativeA = hasDisplayVolume ? row && row[displayNativeAKey] : row && row[prefix + '_a_native'];
    var nativeB = hasDisplayVolume ? row && row[displayNativeBKey] : row && row[prefix + '_b_native'];
    var native = hasDisplayVolume ? row && row[displayNativeKey] : row && row[prefix];
    var nativeALine = fmtToken(nativeA, row && row.token_a_symbol);
    var nativeBLine = fmtToken(nativeB, row && row.token_b_symbol);
    if (nativeALine) nativeLines.push(nativeALine);
    if (nativeBLine) nativeLines.push(nativeBLine);
    if (!nativeLines.length && num(native) != null) nativeLines.push(fmt(native, ''));
    if (nativeLines.length) {
      return cleanValue('<span>' + esc(nativeLines[0]) + '</span>' + (nativeLines[1] ? '<small>' + esc(nativeLines[1]) + '</small>' : '<small>Native units</small>'));
    }
    return cleanValue(unavailable());
  }
  function updateSortButtons() {
    ['liquidity', 'volume24'].forEach(function (sortKey) {
      var id = sortKey === 'volume24' ? 'wuf-sort-volume24' : 'wuf-sort-liquidity';
      var button = byId(id);
      if (!button) return;
      var active = pairSort === sortKey;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  function setPairSort(sortKey) {
    pairSort = sortKey === 'volume24' ? 'volume24' : 'liquidity';
    updateSortButtons();
    loadAnalytics();
  }
  function tokenPageUrl() {
    var cfg = window.MOONBOYS_API || {};
    var info = typeof cfg.getApiBaseInfo === 'function'
      ? cfg.getApiBaseInfo({ allowProductionFallback: true })
      : null;
    var base = info && info.available && info.url ? String(info.url).replace(/\/$/, '') : '';
    if (!base) throw new Error('API base URL unavailable');
    var url = new URL(base + TOKEN_PAGE_PATH, window.location.origin);
    url.searchParams.set('sort', pairSort);
    return url.toString();
  }

  function renderPairTable() {
    var pairs = latestPairs.slice(0, 30);
    if (byId('wuf-pair-summary')) {
      byId('wuf-pair-summary').textContent = pairs.length + ' indexed WUF pair rows shown, ' + latestSuppressedCount + ' filtered from the public table.';
    }
    if (!byId('wuf-pairs')) return;
    if (!pairs.length) {
      byId('wuf-pairs').innerHTML = '<tr><td colspan="9" class="token-muted">No indexed WUF pair rows returned.</td></tr>';
      return;
    }
    byId('wuf-pairs').innerHTML = pairs.map(function (row, index) {
      var selected = row && row.selected_pair;
      return '<tr class="' + (selected ? 'token-selected-pair' : '') + '">' +
        '<td><span class="token-rank">#' + (index + 1) + '</span>' + (selected ? '<span class="token-selected-marker" title="Selected backend pricing pair">Selected</span>' : '') + '</td>' +
        '<td>' + sourceLabel(row) + '</td>' +
        '<td>' + pairCell(row) + '</td>' +
        '<td>' + liquidity(row) + '</td>' +
        '<td>' + cleanValue(price(row)) + '</td>' +
        '<td>' + cleanValue(pct(firstValue(row && row.display_change_24h, row && row.change_24h))) + '</td>' +
        '<td>' + volume(row, 'volume_24h') + '</td>' +
        '<td>' + volume(row, 'volume_7d') + '</td>' +
        '<td>' + volume(row, 'volume_30d') + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderAnalytics(payload) {
    var data = payload && payload.data ? payload.data : payload || {};
    var stats = data.stats || {};
    pairSort = data.sort === 'volume24' ? 'volume24' : 'liquidity';
    updateSortButtons();
    latestPairs = Array.isArray(data.pairs) ? data.pairs.slice(0, 30) : [];
    latestSuppressedCount = num(data.blocked_pair_count) || 0;
    if (byId('wuf-liquidity')) byId('wuf-liquidity').innerHTML = dual(stats.liquidity_wax, stats.liquidity_usd);
    if (byId('wuf-volume-24h')) byId('wuf-volume-24h').innerHTML = dual(firstValue(stats.volume_24h_wax, stats.volume_24h), stats.volume_24h_usd);
    if (byId('wuf-analytics-updated')) byId('wuf-analytics-updated').textContent = stats.updated_at ? 'Indexed backend updated: ' + stats.updated_at : 'Backend values are not guessed when missing.';
    renderPairTable();
  }

  function initSortControls() {
    ['wuf-sort-liquidity', 'wuf-sort-volume24'].forEach(function (id) {
      var button = byId(id);
      if (!button) return;
      button.addEventListener('click', function () {
        setPairSort(button.getAttribute('data-sort'));
      });
    });
    updateSortButtons();
  }

  function loadAnalytics() {
    var requestId = ++analyticsRequestId;
    if (analyticsController) analyticsController.abort();
    analyticsController = window.AbortController ? new AbortController() : null;
    if (byId('wuf-pair-summary')) byId('wuf-pair-summary').textContent = 'Loading indexed pairs...';
    fetch(tokenPageUrl(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: analyticsController ? analyticsController.signal : undefined
    })
      .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
      .then(function (payload) { if (requestId === analyticsRequestId) renderAnalytics(payload); })
      .catch(function (error) {
        if (error && error.name === 'AbortError') return;
        if (requestId !== analyticsRequestId) return;
        if (byId('wuf-pair-summary')) byId('wuf-pair-summary').textContent = 'Indexed analytics unavailable';
        if (byId('wuf-pairs')) byId('wuf-pairs').innerHTML = '<tr><td colspan="9" class="token-muted">Pair table unavailable: ' + esc(error.message || error) + '</td></tr>';
      })
      .finally(function () {
        if (requestId === analyticsRequestId) analyticsController = null;
      });
  }

  function candleUrl(params) {
    var url = new URL(ALCOR_CANDLES);
    url.searchParams.set('tokenA', TOKEN_A);
    url.searchParams.set('tokenB', TOKEN_B);
    url.searchParams.set('resolution', params.resolution || activeResolution);
    if (params.from != null) url.searchParams.set('from', String(params.from));
    if (params.to != null) url.searchParams.set('to', String(params.to));
    return url.toString();
  }
  function alcorMillis(value) { var time = Number(value); return Number.isFinite(time) && time > 0 ? (time < 100000000000 ? time * 1000 : time) : NaN; }
  function toBar(candle) { return { time: alcorMillis(candle.time), open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume || 0) }; }
  function resolutionMs(resolution) { if (resolution === 'D') return 86400000; if (resolution === 'W') return 604800000; if (resolution === 'M') return 2678400000; var minutes = Number(resolution); return Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : 14400000; }
  function getBarsFromAlcor(resolution, from, to) {
    return fetch(candleUrl({ resolution: resolution, from: Math.floor(from * 1000), to: Math.floor(to * 1000) }), { cache: 'no-store' })
      .then(function (response) { if (!response.ok) throw new Error('Alcor candles HTTP ' + response.status); return response.json(); })
      .then(function (payload) { return (payload.candles || []).map(toBar).filter(function (bar) { return Number.isFinite(bar.time) && Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close); }).sort(function (a, b) { return a.time - b.time; }); });
  }
  function stopLiveFeeds() {
    if (analyticsController) analyticsController.abort();
    analyticsController = null;
    Object.keys(subscriptions).forEach(function (key) {
      clearInterval(subscriptions[key]);
      delete subscriptions[key];
    });
  }
  function initChart() {
    if (!window.TradingView || !byId(CONTAINER_ID)) return;
    var datafeed = {
      onReady: function (callback) { setTimeout(function () { callback({ supported_resolutions: RESOLUTIONS, supports_time: true, supports_marks: false, supports_timescale_marks: false, supports_search: false }); }, 0); },
      searchSymbols: function () {},
      resolveSymbol: function (symbolName, onResolve) { setTimeout(function () { onResolve({ name: 'WUF_WAX', ticker: 'WUF_WAX', description: 'WUF / WAX', type: 'crypto', exchange: 'Alcor', listed_exchange: 'Alcor', timezone: 'Etc/UTC', session: '24x7', minmov: 1, pricescale: 100000000, has_intraday: true, has_daily: true, has_weekly_and_monthly: true, supported_resolutions: RESOLUTIONS, visible_plots_set: 'ohlcv', volume_precision: 2, data_status: 'streaming', format: 'price' }); }, 0); },
      getBars: function (symbolInfo, resolution, periodParams, onHistory, onError) { activeResolution = resolution; getBarsFromAlcor(resolution, Number(periodParams.from), Number(periodParams.to)).then(function (bars) { onHistory(bars, { noData: bars.length === 0 }); if (byId('wuf-chart-status')) byId('wuf-chart-status').textContent = 'Alcor candles loaded directly'; }).catch(function (error) { if (byId('wuf-chart-status')) byId('wuf-chart-status').textContent = 'Alcor chart unavailable'; onError(error.message || String(error)); }); },
      subscribeBars: function (symbolInfo, resolution, onRealtime, subscriberUID) { if (!subscriberUID) return; var timer = setInterval(function () { if (document.hidden) return; var to = Math.floor(Date.now() / 1000); var from = Math.floor((Date.now() - Math.max(resolutionMs(resolution) * 3, 1800000)) / 1000); getBarsFromAlcor(resolution, from, to).then(function (bars) { if (bars.length) onRealtime(bars[bars.length - 1]); }).catch(function () {}); }, 30000); subscriptions[subscriberUID] = timer; },
      unsubscribeBars: function (subscriberUID) { clearInterval(subscriptions[subscriberUID]); delete subscriptions[subscriberUID]; },
      getMarks: function () {}, getTimescaleMarks: function () {}, getServerTime: function (callback) { callback(Math.floor(Date.now() / 1000)); }
    };
    new window.TradingView.widget({ autosize: true, symbol: 'WUF_WAX', interval: '240', container: CONTAINER_ID, datafeed: datafeed, library_path: 'https://alcor.exchange/charting_library/', locale: 'en', timezone: 'Etc/UTC', theme: 'dark', style: '1', toolbar_bg: '#111820', custom_css_url: 'https://alcor.exchange/tv_themed.css', disabled_features: ['symbol_search_hot_key', 'header_symbol_search'], favorites: { intervals: RESOLUTIONS }, loading_screen: { backgroundColor: '#111820', foregroundColor: '#ffd000' } });
  }

  function init() { initSortControls(); initChart(); loadAnalytics(); }
  window.addEventListener('pagehide', stopLiveFeeds);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());

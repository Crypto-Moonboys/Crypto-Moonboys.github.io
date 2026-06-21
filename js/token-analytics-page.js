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

  function byId(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function num(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
  function unavailable() { return '<span class="token-muted">Unavailable</span>'; }
  function fmt(value, suffix) {
    var parsed = num(value);
    if (parsed == null) return 'Unavailable';
    var abs = Math.abs(parsed);
    return parsed.toLocaleString(undefined, { maximumFractionDigits: abs >= 1000 ? 2 : 8 }) + (suffix || '');
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
  function price(row) { return num(row && row.price) == null ? unavailable() : esc(fmt(row.price, '')); }
  function volume(row, prefix) { return dual(row && row[prefix + '_wax'], row && row[prefix + '_usd']); }
  function tokenPageUrl() {
    var cfg = window.MOONBOYS_API || {};
    var info = typeof cfg.getApiBaseInfo === 'function'
      ? cfg.getApiBaseInfo({ allowProductionFallback: true })
      : null;
    var base = info && info.available && info.url ? String(info.url).replace(/\/$/, '') : '';
    if (!base) throw new Error('API base URL unavailable');
    return base + TOKEN_PAGE_PATH;
  }

  function renderAnalytics(payload) {
    var data = payload && payload.data ? payload.data : payload || {};
    var stats = data.stats || {};
    var pairs = Array.isArray(data.pairs) ? data.pairs.slice(0, 30) : [];
    if (byId('wuf-liquidity')) byId('wuf-liquidity').innerHTML = dual(stats.liquidity_wax, stats.liquidity_usd);
    if (byId('wuf-volume-24h')) byId('wuf-volume-24h').innerHTML = dual(stats.volume_24h_wax || stats.volume_24h, stats.volume_24h_usd);
    if (byId('wuf-analytics-updated')) byId('wuf-analytics-updated').textContent = stats.updated_at ? 'Indexed backend updated: ' + stats.updated_at : 'Backend values are not guessed when missing.';
    if (byId('wuf-pair-summary')) byId('wuf-pair-summary').textContent = pairs.length + ' indexed WUF pair rows';
    if (!byId('wuf-pairs')) return;
    if (!pairs.length) {
      byId('wuf-pairs').innerHTML = '<tr><td colspan="9" class="token-muted">No indexed WUF pair rows returned.</td></tr>';
      return;
    }
    byId('wuf-pairs').innerHTML = pairs.map(function (row, index) {
      return '<tr>' +
        '<td>#' + (index + 1) + '</td>' +
        '<td>' + esc(row.source || 'Unavailable') + '</td>' +
        '<td>' + esc(pairName(row)) + '<br><span class="token-muted">' + esc([row.token_a_contract, row.token_b_contract].filter(Boolean).join(' / ')) + '</span></td>' +
        '<td>' + dual(row.liquidity_wax, row.liquidity_usd) + '</td>' +
        '<td>' + price(row) + '</td>' +
        '<td>' + pct(row.change_24h) + '</td>' +
        '<td>' + volume(row, 'volume_24h') + '</td>' +
        '<td>' + volume(row, 'volume_7d') + '</td>' +
        '<td>' + volume(row, 'volume_30d') + '</td>' +
        '</tr>';
    }).join('');
  }

  function loadAnalytics() {
    fetch(tokenPageUrl(), { headers: { Accept: 'application/json' } })
      .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
      .then(renderAnalytics)
      .catch(function (error) {
        if (byId('wuf-pair-summary')) byId('wuf-pair-summary').textContent = 'Indexed analytics unavailable';
        if (byId('wuf-pairs')) byId('wuf-pairs').innerHTML = '<tr><td colspan="9" class="token-muted">Pair table unavailable: ' + esc(error.message || error) + '</td></tr>';
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
    return fetch(candleUrl({ resolution: resolution, from: Math.floor(from * 1000), to: Math.floor(to * 1000) }))
      .then(function (response) { if (!response.ok) throw new Error('Alcor candles HTTP ' + response.status); return response.json(); })
      .then(function (payload) { return (payload.candles || []).map(toBar).filter(function (bar) { return Number.isFinite(bar.time) && Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close); }).sort(function (a, b) { return a.time - b.time; }); });
  }
  function initChart() {
    if (!window.TradingView || !byId(CONTAINER_ID)) return;
    var datafeed = {
      onReady: function (callback) { setTimeout(function () { callback({ supported_resolutions: RESOLUTIONS, supports_time: true, supports_marks: false, supports_timescale_marks: false, supports_search: false }); }, 0); },
      searchSymbols: function () {},
      resolveSymbol: function (symbolName, onResolve) { setTimeout(function () { onResolve({ name: 'WUF_WAX', ticker: 'WUF_WAX', description: 'WUF / WAX', type: 'crypto', exchange: 'Alcor', listed_exchange: 'Alcor', timezone: 'Etc/UTC', session: '24x7', minmov: 1, pricescale: 100000000, has_intraday: true, has_daily: true, has_weekly_and_monthly: true, supported_resolutions: RESOLUTIONS, visible_plots_set: 'ohlcv', volume_precision: 2, data_status: 'streaming', format: 'price' }); }, 0); },
      getBars: function (symbolInfo, resolution, periodParams, onHistory, onError) { activeResolution = resolution; getBarsFromAlcor(resolution, Number(periodParams.from), Number(periodParams.to)).then(function (bars) { onHistory(bars, { noData: bars.length === 0 }); if (byId('wuf-chart-status')) byId('wuf-chart-status').textContent = 'Alcor candles loaded directly'; }).catch(function (error) { if (byId('wuf-chart-status')) byId('wuf-chart-status').textContent = 'Alcor chart unavailable'; onError(error.message || String(error)); }); },
      subscribeBars: function (symbolInfo, resolution, onRealtime, subscriberUID) { if (!subscriberUID) return; var timer = setInterval(function () { var to = Math.floor(Date.now() / 1000); var from = Math.floor((Date.now() - Math.max(resolutionMs(resolution) * 3, 1800000)) / 1000); getBarsFromAlcor(resolution, from, to).then(function (bars) { if (bars.length) onRealtime(bars[bars.length - 1]); }).catch(function () {}); }, 30000); subscriptions[subscriberUID] = timer; },
      unsubscribeBars: function (subscriberUID) { clearInterval(subscriptions[subscriberUID]); delete subscriptions[subscriberUID]; },
      getMarks: function () {}, getTimescaleMarks: function () {}, getServerTime: function (callback) { callback(Math.floor(Date.now() / 1000)); }
    };
    new window.TradingView.widget({ autosize: true, symbol: 'WUF_WAX', interval: '240', container: CONTAINER_ID, datafeed: datafeed, library_path: 'https://alcor.exchange/charting_library/', locale: 'en', timezone: 'Etc/UTC', theme: 'dark', style: '1', toolbar_bg: '#111820', custom_css_url: 'https://alcor.exchange/tv_themed.css', disabled_features: ['symbol_search_hot_key', 'header_symbol_search'], favorites: { intervals: RESOLUTIONS }, loading_screen: { backgroundColor: '#111820', foregroundColor: '#ffd000' } });
  }

  function init() { loadAnalytics(); initChart(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());

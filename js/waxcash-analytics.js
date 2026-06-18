(function () {
  'use strict';

  var ENDPOINT = '/api/waxonedge/waxcash-analytics';
  var DASH = '--';

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

  function dual(wax, usd) {
    var waxText = fmtWax(wax);
    var usdText = fmtUsd(usd);
    if (waxText === DASH && usdText === DASH) return DASH;
    return esc(waxText) + '<small>' + esc(usdText) + '</small>';
  }

  function pct(value) {
    var parsed = num(value);
    if (parsed == null) return DASH;
    return parsed.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' %';
  }

  function statRow(label, html, muted) {
    return '<div class="wx-row">' +
      '<div class="wx-label">' + esc(label) + '</div>' +
      '<div class="wx-value ' + (muted ? 'wx-muted' : '') + '">' + html + '</div>' +
      '</div>';
  }

  function firstPresent(primary, fallback) {
    return primary == null ? fallback : primary;
  }

  function renderStats(payload) {
    var token = payload.token || {};
    var stats = payload.stats || {};
    var priceSource = stats.selected_pair_label || stats.selected_price_source || DASH;
    var change = num(stats.change_24h);
    $('wx-price-source').textContent = priceSource === DASH ? DASH : 'Price proof: ' + priceSource;
    $('wx-stats').innerHTML = [
      statRow('Token', '<span class="wx-token"><strong>WAXCASH</strong>graffitiking</span>'),
      statRow('Decimals', esc(token.decimals == null ? DASH : token.decimals)),
      statRow(
        'Selected Direct WAX Pair Liquidity',
        dual(
          firstPresent(stats.selected_direct_wax_pair_liquidity_wax, stats.liquidity_wax),
          firstPresent(stats.selected_direct_wax_pair_liquidity_usd, stats.liquidity_usd)
        ),
        (stats.selected_direct_wax_pair_liquidity_wax == null && stats.liquidity_wax == null) &&
          (stats.selected_direct_wax_pair_liquidity_usd == null && stats.liquidity_usd == null)
      ),
      statRow('Price', dual(stats.selected_price_wax, stats.selected_price_usd), stats.selected_price_wax == null && stats.selected_price_usd == null),
      statRow('24h price change', '<span class="' + (change == null ? 'wx-muted' : (change >= 0 ? 'wx-positive' : 'wx-negative')) + '">' + esc(pct(change)) + '</span>', change == null),
      statRow('24h volume', dual(stats.volume_24h_wax, stats.volume_24h_usd), stats.volume_24h_wax == null && stats.volume_24h_usd == null),
      statRow('7d volume', stats.volume_7d == null ? DASH : esc(fmt(stats.volume_7d, 4) + ' WAX'), stats.volume_7d == null),
      statRow('30d volume', stats.volume_30d == null ? DASH : esc(fmt(stats.volume_30d, 4) + ' WAX'), stats.volume_30d == null),
      statRow('Circulating supply', stats.circulating_supply == null ? DASH : esc(fmt(stats.circulating_supply, 4) + ' WAXCASH'), stats.circulating_supply == null),
      statRow('Market cap', dual(stats.market_cap_wax, stats.market_cap_usd), stats.market_cap_wax == null && stats.market_cap_usd == null),
      statRow('Total supply', stats.total_supply == null ? DASH : esc(fmt(stats.total_supply, 4) + ' WAXCASH'), stats.total_supply == null),
      statRow('Fully diluted valuation', dual(stats.fdv_wax, stats.fdv_usd), stats.fdv_wax == null && stats.fdv_usd == null),
    ].join('');
  }

  function tokenLabel(token) {
    if (!token || !token.symbol) return DASH;
    return '<span class="wx-token"><strong>' + esc(token.symbol) + '</strong>' + esc(token.contract || '') + '</span>';
  }

  function renderPairs(payload) {
    var pairs = (payload.pairs || []).slice();
    $('wx-pair-summary').textContent = pairs.length + ' indexed WAXCASH pairs';
    if (!pairs.length) {
      $('wx-pairs').innerHTML = '<tr><td colspan="9" class="wx-muted">No indexed WAXCASH pairs returned.</td></tr>';
      return;
    }
    $('wx-pairs').innerHTML = pairs.map(function (pair, index) {
      var change = num(pair.change_24h);
      var proof = pair.reason_codes && pair.reason_codes.length ? pair.reason_codes.join(', ') : 'verified';
      return '<tr>' +
        '<td>#' + (index + 1) + '</td>' +
        '<td>' + tokenLabel({ symbol: pair.token_a_symbol, contract: pair.token_a_contract }) + tokenLabel({ symbol: pair.token_b_symbol, contract: pair.token_b_contract }) + '</td>' +
        '<td><span class="wx-source">' + esc(pair.source || DASH) + '</span><br><span class="wx-muted">' + esc(pair.pair_id || DASH) + '</span></td>' +
        '<td>' + esc(pair.pair_price_relative_to_waxcash == null ? DASH : fmt(pair.pair_price_relative_to_waxcash, 8)) + '</td>' +
        '<td class="' + (change == null ? 'wx-muted' : (change >= 0 ? 'wx-positive' : 'wx-negative')) + '">' + esc(pct(change)) + '</td>' +
        '<td>' + dual(pair.pair_liquidity_wax, pair.pair_liquidity_usd) + '</td>' +
        '<td>' + dual(pair.volume_24h_wax, pair.volume_24h_usd) + '</td>' +
        '<td>' + esc(fmt(pair.reserve_a, 4) + ' ' + (pair.token_a_symbol || '') + ' / ' + fmt(pair.reserve_b, 4) + ' ' + (pair.token_b_symbol || '')) + '</td>' +
        '<td class="' + (proof === 'verified' ? 'wx-positive' : 'wx-muted') + '">' + esc(proof) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderChart(payload) {
    var chart = payload.chart || {};
    var candles = Array.isArray(chart.candles) ? chart.candles : [];
    var source = chart.chart_source || {};
    $('wx-chart-source').textContent = source.source && source.pair_id ? source.source + ' #' + source.pair_id : 'Indexed candles';
    if (!candles.length) {
      $('wx-chart').innerHTML = '<div class="wx-chart-empty">' + esc(chart.unavailable || 'No indexed chart candles are available for WAXCASH yet.') + '</div>';
      return;
    }
    var values = candles.map(function (candle) { return num(candle.close); }).filter(function (value) { return value != null; });
    if (!values.length) {
      $('wx-chart').innerHTML = '<div class="wx-chart-empty">Indexed candles are present but close prices are unavailable.</div>';
      return;
    }
    var min = Math.min.apply(Math, values);
    var max = Math.max.apply(Math, values);
    var spread = max - min || 1;
    var width = 900;
    var height = 280;
    var points = candles.map(function (candle, index) {
      var close = num(candle.close);
      var x = candles.length === 1 ? width / 2 : (index / (candles.length - 1)) * width;
      var y = close == null ? height : height - ((close - min) / spread) * (height - 30) - 15;
      return x.toFixed(2) + ',' + y.toFixed(2);
    }).join(' ');
    $('wx-chart').innerHTML =
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="WAXCASH indexed close-price chart">' +
      '<polyline fill="none" stroke="#04f0e6" stroke-width="3" points="' + esc(points) + '"></polyline>' +
      '</svg>' +
      '<div class="wx-note">Close range: ' + esc(fmt(min, 8)) + ' to ' + esc(fmt(max, 8)) + '</div>';
  }

  function render(payload) {
    var stats = payload.stats || {};
    $('wx-status').textContent = stats.updated_at ? 'Updated ' + stats.updated_at : 'Indexed analytics loaded';
    renderStats(payload);
    renderChart(payload);
    renderPairs(payload);
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
      $('wx-stats').innerHTML = statRow('Status', esc(error.message || String(error)), true);
      $('wx-chart').innerHTML = '<div class="wx-chart-empty">Indexed chart data unavailable.</div>';
      $('wx-pairs').innerHTML = '<tr><td colspan="9" class="wx-muted">Pair table unavailable.</td></tr>';
    });
}());

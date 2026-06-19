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

  function fmtToken(value, symbol) {
    var parsed = num(value);
    return parsed == null ? DASH : fmt(parsed, 4) + (symbol ? ' ' + symbol : '');
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
    invalid_ohlc: 'Invalid OHLC candle',
    invalid_ohlc_range: 'Invalid OHLC candle range',
    ohlc_outside_selected_price_range: 'OHLC outside selected price range',
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

  function reasonHtml(reason) {
    var label = humanReason(reason);
    return label ? '<small class="wx-reason">' + esc(label) + '</small>' : '';
  }

  function valueHtml(row) {
    if (!row || row.live === false) {
      return '<span class="wx-main-value">Unavailable</span>' +
        reasonHtml((row && row.reason) || 'No source-backed value available.');
    }
    if (row.key === 'token') return '<span class="wx-token"><strong>WAXCASH</strong>graffitiking</span>';
    if (row.key === 'decimals') return esc(row.value == null ? DASH : row.value);
    if (row.key === 'change_24h') {
      var change = num(row.value);
      return '<span class="' + (change == null ? 'wx-muted' : (change >= 0 ? 'wx-positive' : 'wx-negative')) + '">' + esc(pct(change)) + '</span>';
    }
    if (row.value_token != null) return esc(fmtToken(row.value_token, row.token_symbol));
    var wax = fmtWax(row.value_wax);
    var usd = fmtUsd(row.value_usd);
    if (wax !== DASH && usd !== DASH) return esc(wax) + '<small>' + esc(usd) + '</small>';
    if (wax !== DASH) return esc(wax);
    if (usd !== DASH) return esc(usd);
    if (row.value != null) return esc(fmt(row.value, 8));
    return '<span class="wx-main-value">Unavailable</span>' +
      reasonHtml(row.reason || 'No source-backed value available.');
  }

  function statRow(row) {
    return '<div class="wx-row">' +
      '<div class="wx-label">' + esc(row.label || row.key || '') + '</div>' +
      '<div class="wx-value ' + (row.live === false ? 'wx-muted' : '') + '">' + valueHtml(row) + '</div>' +
      '</div>';
  }

  function renderStats(payload) {
    var sections = payload.sections || {};
    var tokenStats = sections.token_stats || {};
    var rows = Array.isArray(tokenStats.rows) ? tokenStats.rows : [];
    var priceProof = sections.price_proof || {};
    $('wx-price-source').textContent = priceProof.pair_label
      ? 'Price proof: ' + priceProof.pair_label
      : (priceProof.reason || 'Price proof unavailable');
    $('wx-stats').innerHTML = rows.length
      ? rows.map(statRow).join('')
      : statRow({ label: 'Status', live: false, reason: 'Backend token_stats section unavailable.' });
  }

  function tokenLabel(row) {
    var a = '<span class="wx-token"><strong>' + esc(row.token_a_symbol || DASH) + '</strong>' + esc(row.token_a_contract || '') + '</span>';
    var b = '<span class="wx-token"><strong>' + esc(row.token_b_symbol || DASH) + '</strong>' + esc(row.token_b_contract || '') + '</span>';
    return a + b;
  }

  function pairStatus(row) {
    if (row.is_selected_price_pair) return '<span class="wx-positive">Selected price pair</span>';
    if (row.status === 'unavailable') return '<span class="wx-muted">Unavailable</span>';
    if (num(row.liquidity_wax) != null && num(row.liquidity_wax) < 1) return '<span class="wx-warning">Low liquidity</span>';
    if (row.is_direct_wax_pair) return '<span class="wx-positive">Direct WAX pair</span>';
    return '<span class="wx-positive">Valued</span>';
  }

  function dual(wax, usd, reason) {
    var waxText = fmtWax(wax);
    var usdText = fmtUsd(usd);
    if (waxText !== DASH && usdText !== DASH) return '<span class="wx-main-value">' + esc(waxText) + '</span><small>' + esc(usdText) + '</small>';
    if (waxText !== DASH) return '<span class="wx-main-value">' + esc(waxText) + '</span>';
    if (usdText !== DASH) return '<span class="wx-main-value">' + esc(usdText) + '</span>';
    return '<span class="wx-muted">Unavailable</span>' + reasonHtml(reason);
  }

  function renderPairs(payload) {
    var sections = payload.sections || {};
    var section = sections.pair_table || {};
    var rows = Array.isArray(section.rows) ? section.rows : [];
    $('wx-pair-summary').textContent = rows.length + ' indexed WAXCASH pairs';
    if (!rows.length) {
      $('wx-pairs').innerHTML = '<tr><td colspan="8" class="wx-muted">No source-backed WAXCASH pair rows returned.</td></tr>';
      return;
    }
    $('wx-pairs').innerHTML = rows.map(function (row, index) {
      var proof = humanReason(row.proof_label || row.reason || 'verified');
      return '<tr>' +
        '<td>#' + (index + 1) + '</td>' +
        '<td>' + tokenLabel(row) + '</td>' +
        '<td><span class="wx-source">' + esc(row.source || DASH) + '</span><br><span class="wx-muted">' + esc(row.pair_id || DASH) + '</span></td>' +
        '<td>' + pairStatus(row) + reasonHtml(row.reason) + '</td>' +
        '<td>' + dual(row.liquidity_wax, row.liquidity_usd, row.reason) + '</td>' +
        '<td>' + dual(row.volume_24h_wax, row.volume_24h_usd, row.reason) + '</td>' +
        '<td>' + esc(row.reserves_label || DASH) + '</td>' +
        '<td class="' + (row.status === 'unavailable' ? 'wx-muted' : 'wx-positive') + '">' + esc(proof) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderChart(payload) {
    var sections = payload.sections || {};
    var section = sections.chart_external || {};
    var url = section.url || 'https://alcor.exchange/v/wax/analytics/pools/8388';
    var sourceLabel = section.source === 'alcor' && section.pool_id
      ? 'Alcor pool #' + section.pool_id
      : 'Alcor pool #8388';
    $('wx-chart-source').textContent = sourceLabel;
    $('wx-chart').innerHTML =
      '<div class="wx-external-chart-card">' +
        '<div class="wx-external-chart-copy">' +
          '<strong>External Alcor WAX/WAXCASH pool chart</strong>' +
          '<span>' + esc(sourceLabel) + '</span>' +
          '<p>External visual reference only. WaxOnEdge stats remain backend proof values.</p>' +
        '</div>' +
        '<div class="wx-external-chart-linkcard">' +
          '<span>Open the external Alcor pool chart in a new tab.</span>' +
          '<a class="wx-external-chart-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open Alcor chart</a>' +
        '</div>' +
      '</div>';
  }

  function render(payload) {
    var stats = payload.stats || {};
    var sections = payload.sections || {};
    var supply = sections.supply_proof || {};
    var status = stats.updated_at ? 'Updated ' + stats.updated_at : 'Indexed analytics loaded';
    if (supply.live === false && supply.reason) status += ' - Supply: ' + supply.reason;
    $('wx-status').textContent = status;
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
      $('wx-stats').innerHTML = statRow({ label: 'Status', live: false, reason: error.message || String(error) });
      $('wx-chart').innerHTML = '<div class="wx-chart-empty">External Alcor chart unavailable.</div>';
      $('wx-pairs').innerHTML = '<tr><td colspan="8" class="wx-muted">Pair table unavailable.</td></tr>';
    });
}());

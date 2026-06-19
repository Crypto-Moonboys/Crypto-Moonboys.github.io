(function () {
  'use strict';

  var ENDPOINT = '/api/waxonedge/waxcash-analytics';
  var DASH = '--';
  var DEFAULT_EXTERNAL_CHART = {
    source: 'geckoterminal',
    pool_id: 'swap-alcor-8388',
    pair_label: 'WAXCASH/WAX',
    url: 'https://www.geckoterminal.com/wax/pools/swap-alcor-8388?embed=1',
    role: 'external_visual_reference_only',
    affects_waxonedge_metrics: false,
  };
  var state = {
    payload: null,
    pairSort: null,
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
    var icon = $('wx-token-icon');
    if (icon && token.icon_url) icon.src = token.icon_url;
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
    return row.source_label || row.source || DASH;
  }

  function sourceLogoUrl(row) {
    var key = String((row && (row.source_logo_key || row.source)) || '').toLowerCase();
    var map = {
      'swap.nefty': '/img/waxonedge/dex/neftyblocks.png',
      'neftyblocks': '/img/waxonedge/dex/neftyblocks.png',
      'swap.alcor': '/img/waxonedge/dex/alcor.png',
      'alcor': '/img/waxonedge/dex/alcor.png',
      'alcordexmain': '/img/waxonedge/dex/alcor.png',
      'swap.taco': '/img/waxonedge/dex/taco.png',
      'swap.box': '/img/waxonedge/dex/defibox.png',
      'defibox': '/img/waxonedge/dex/defibox.png',
      'swap.adex': '/img/waxonedge/dex/adex.png',
      'dapp.fusion': '/img/waxonedge/dex/waxfusion.png',
      'waxfusion': '/img/waxonedge/dex/waxfusion.png',
    };
    return map[key] || '';
  }

  function sourceCell(row) {
    var logo = sourceLogoUrl(row);
    return '<span class="wx-source-cell">' +
      (logo ? '<img class="wx-source-logo" src="' + esc(logo) + '" alt="" loading="lazy">' : '') +
      '<span class="wx-source-name">' + esc(sourceLabel(row)) + '</span>' +
      '</span>';
  }

  function dual(wax, usd, reason) {
    var waxText = fmtWax(wax);
    var usdText = fmtUsd(usd);
    if (waxText !== DASH && usdText !== DASH) return '<span>' + esc(waxText) + '</span><span class="wx-cell-sub">' + esc(usdText) + '</span>';
    if (waxText !== DASH) return esc(waxText);
    if (usdText !== DASH) return esc(usdText);
    return '<span class="wx-muted" title="' + esc(humanReason(reason)) + '">Unavailable</span>';
  }

  function tokenLabel(row) {
    return '<span class="wx-token"><strong>' + esc(row.token_a_symbol || DASH) + '</strong>' + esc(row.token_a_contract || '') + '</span>' +
      '<span class="wx-token"><strong>' + esc(row.token_b_symbol || DASH) + '</strong>' + esc(row.token_b_contract || '') + '</span>';
  }

  function priceCell(row) {
    var price = fmt(row && (row.price != null ? row.price : row.pair_price), 8);
    var usd = fmtUsd(row && row.price_usd);
    if (price !== DASH && usd !== DASH) return '<span>' + esc(price) + '</span><span class="wx-cell-sub">' + esc(usd) + '</span>';
    if (price !== DASH) return esc(price);
    return '<span class="wx-muted" title="' + esc(humanReason(row && row.reason)) + '">Unavailable</span>';
  }

  function changeCell(value) {
    var parsed = num(value);
    if (parsed == null) return '<span class="wx-muted">Unavailable</span>';
    var klass = parsed < 0 ? 'wx-negative' : (parsed > 0 ? 'wx-positive' : 'wx-muted');
    return '<span class="' + klass + '">' + esc(pct(parsed)) + '</span>';
  }

  function defaultPairSort(rows) {
    return rows.some(function (row) { return num(row && row.volume_24h_wax) != null; }) ? 'volume24' : null;
  }

  function pairSortMetric(row, sortKey) {
    if (sortKey === 'liquidity') return num(row && row.liquidity_wax);
    if (sortKey === 'volume24') return num(row && row.volume_24h_wax);
    return null;
  }

  function sortedPairRows(rows) {
    var sortKey = state.pairSort || defaultPairSort(rows);
    if (!sortKey) return rows;
    return rows.map(function (row, index) {
      return { row: row, index: index, metric: pairSortMetric(row, sortKey) };
    }).sort(function (a, b) {
      if (a.metric != null && b.metric == null) return -1;
      if (a.metric == null && b.metric != null) return 1;
      if (a.metric != null && b.metric != null && b.metric !== a.metric) return b.metric - a.metric;
      return a.index - b.index;
    }).map(function (entry) { return entry.row; });
  }

  function updateSortButtons(rows) {
    var activeSort = state.pairSort || defaultPairSort(rows);
    Array.prototype.forEach.call(document.querySelectorAll('.wx-sort-button'), function (button) {
      var key = button.getAttribute('data-sort');
      var isActive = key === activeSort;
      var label = key === 'volume24' ? '24h volume' : 'Liquidity';
      button.textContent = isActive ? label + ' ' + String.fromCharCode(8595) : label;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setPairSort(sortKey) {
    state.pairSort = sortKey;
    if (!state.payload) {
      updateSortButtons([]);
      return;
    }
    renderPairs(state.payload);
  }

  function renderPairs(payload) {
    var rows = pairRows(payload);
    var selected = rows.find(function (row) { return row.is_selected_price_pair; }) || null;
    var activeKey = pairKey(selected);
    var displayRows = sortedPairRows(rows);
    updateSortButtons(rows);
    $('wx-pair-summary').textContent = rows.length + ' indexed WAXCASH pairs';
    if (!rows.length) {
      $('wx-pairs').innerHTML = '<tr><td colspan="10" class="wx-muted">No source-backed WAXCASH pair rows returned.</td></tr>';
      return;
    }
    $('wx-pairs').innerHTML = displayRows.map(function (row, index) {
      var fee = row.fee_bps != null ? fmt(row.fee_bps / 100, 2) + ' %' : (row.is_direct_wax_pair ? 'Direct' : DASH);
      return '<tr class="' + (pairKey(row) === activeKey ? 'is-selected' : '') + '">' +
        '<td>#' + (index + 1) + '</td>' +
        '<td>' + sourceCell(row) + '</td>' +
        '<td>' + esc(fee) + '</td>' +
        '<td>' + tokenLabel(row) + '</td>' +
        '<td>' + dual(row.liquidity_wax, row.liquidity_usd, row.reason) + '</td>' +
        '<td>' + priceCell(row) + '</td>' +
        '<td>' + changeCell(row.change_24h) + '</td>' +
        '<td>' + dual(row.volume_24h_wax, row.volume_24h_usd, row.reason) + '</td>' +
        '<td>' + dual(row.volume_7d_wax, row.volume_7d_usd, row.reason) + '</td>' +
        '<td>' + dual(row.volume_30d_wax, row.volume_30d_usd, row.reason) + '</td>' +
        '</tr>';
    }).join('');
  }

  function chartExternalConfig(payload) {
    var sections = (payload || {}).sections || {};
    var external = sections.chart_external || {};
    var url = String(external.url || DEFAULT_EXTERNAL_CHART.url);
    if (!/^https:\/\/www\.geckoterminal\.com\/wax\/pools\/swap-alcor-8388(?:\?|$)/.test(url)) url = DEFAULT_EXTERNAL_CHART.url;
    return {
      source: external.source || DEFAULT_EXTERNAL_CHART.source,
      pool_id: external.pool_id || DEFAULT_EXTERNAL_CHART.pool_id,
      pair_label: external.pair_label || DEFAULT_EXTERNAL_CHART.pair_label,
      url: url,
      role: external.role || DEFAULT_EXTERNAL_CHART.role,
      affects_waxonedge_metrics: external.affects_waxonedge_metrics === true ? true : false,
    };
  }

  function renderExternalChart(payload) {
    var host = $('wx-chart');
    var external = chartExternalConfig(payload);
    if (!host) return;
    var iframe = host.querySelector('.wx-external-chart-frame');
    var title = (external.pair_label || 'WAXCASH/WAX') + ' GeckoTerminal candle chart';
    if (!iframe) {
      host.innerHTML = '<iframe class="wx-external-chart-frame" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>';
      iframe = host.querySelector('.wx-external-chart-frame');
    }
    if (iframe.getAttribute('src') !== external.url) iframe.setAttribute('src', external.url);
    if (iframe.getAttribute('title') !== title) iframe.setAttribute('title', title);
  }

  function render(payload) {
    state.payload = payload || {};
    var sections = state.payload.sections || {};
    var supply = sections.supply_proof || {};
    var status = supply.live === false && supply.reason ? 'Supply: ' + humanReason(supply.reason) : '';
    $('wx-status').textContent = status;
    renderStats(state.payload);
    renderExternalChart(state.payload);
    renderPairs(state.payload);
  }

  renderExternalChart({ sections: { chart_external: DEFAULT_EXTERNAL_CHART } });
  Array.prototype.forEach.call(document.querySelectorAll('.wx-sort-button'), function (button) {
    button.addEventListener('click', function () { setPairSort(button.getAttribute('data-sort')); });
  });

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
      renderExternalChart({ sections: { chart_external: DEFAULT_EXTERNAL_CHART } });
      updateSortButtons([]);
      $('wx-pairs').innerHTML = '<tr><td colspan="10" class="wx-muted">Pair table unavailable.</td></tr>';
    });
}());

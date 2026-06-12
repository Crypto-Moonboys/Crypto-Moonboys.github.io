/**
 * waxonedge.js
 *
 * WAXONEDGE — read-only WAX token, pair, pool, holder, and DEX analytics.
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
   WAXONEDGE_NEFTY_TABLES
*/

(function () {
  'use strict';

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
    if (Math.abs(n) >= 1e9)  return (n / 1e9).toFixed(d) + 'B';
    if (Math.abs(n) >= 1e6)  return (n / 1e6).toFixed(d) + 'M';
    if (Math.abs(n) >= 1e3)  return (n / 1e3).toFixed(d) + 'K';
    return Number(n).toFixed(d);
  }

  function fmtPrice(n) {
    if (n == null || isNaN(n)) return '—';
    if (n < 0.0001) return n.toExponential(4);
    if (n < 1)      return n.toFixed(6);
    return n.toFixed(4);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '—';
    var sign = n > 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
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

  function setStatus(id, state) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'woe-status-dot woe-status-' + state;
    el.title = state;
  }

  /** Generic JSON fetch with timeout (ms). Returns null on error. */
  function apiFetch(url, timeoutMs) {
    var ms = timeoutMs || 10000;
    return new Promise(function (resolve) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        resolve(null);
      }, ms);
      var opts = controller ? { signal: controller.signal } : {};
      fetch(url, opts)
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) { resolve(null); return; }
          return r.json();
        })
        .then(function (data) { resolve(data || null); })
        .catch(function () { clearTimeout(timer); resolve(null); });
    });
  }

  /** WAX RPC POST helper */
  function rpcPost(path, body) {
    return new Promise(function (resolve) {
      var url = (window.WAXONEDGE_WAX_RPC || 'https://wax.greymass.com') + path;
      var timer = setTimeout(function () { resolve(null); }, 12000);
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) { resolve(null); return; }
          return r.json();
        })
        .then(function (d) { resolve(d || null); })
        .catch(function () { clearTimeout(timer); resolve(null); });
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

  /* ── Client-side sort/filter helpers ────────────────────────── */

  var sortState = {};

  function attachTableSort(tableId) {
    var table = document.getElementById(tableId);
    if (!table) return;
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
      var av = (a.querySelector('[data-val="' + col + '"]') || a).getAttribute('data-sortval') ||
               (a.querySelector('td[data-col="' + col + '"]') || {}).textContent || '';
      var bv = (b.querySelector('[data-val="' + col + '"]') || b).getAttribute('data-sortval') ||
               (b.querySelector('td[data-col="' + col + '"]') || {}).textContent || '';
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
    if (!input || !table) return;
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      var rows = table.querySelectorAll('tbody tr');
      rows.forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.style.display = q === '' || text.includes(q) ? '' : 'none';
      });
    });
  }

  /* ── Global search bar ──────────────────────────────────────── */

  function attachGlobalSearch() {
    var input = document.getElementById('woe-global-search');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      var sections = ['woe-table-tokens', 'woe-table-pairs', 'woe-table-nefty'];
      sections.forEach(function (tid) {
        var table = document.getElementById(tid);
        if (!table) return;
        table.querySelectorAll('tbody tr').forEach(function (row) {
          row.style.display = q === '' || row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    });
  }

  /* ── Token table ─────────────────────────────────────────────── */

  function loadTokens() {
    setHtml('woe-tokens-body', '<tr><td colspan="6" class="woe-loading">Loading tokens…</td></tr>');
    var url = (window.WAXONEDGE_ALCOR_API || 'https://wax.alcor.exchange/api') +
              (window.WAXONEDGE_ALCOR_PATHS ? window.WAXONEDGE_ALCOR_PATHS.tokens : '/tokens');
    apiFetch(url).then(function (data) {
      if (!Array.isArray(data) || data.length === 0) {
        setHtml('woe-tokens-body', '<tr><td colspan="6" class="woe-loading woe-error">Failed to load token data.</td></tr>');
        return;
      }
      var rows = data.slice(0, 200).map(function (tok) {
        var sym   = tok.symbol || tok.id || '?';
        var contr = tok.contract || '';
        var usd   = tok.usd_price != null ? fmtPrice(tok.usd_price) : '—';
        var vol   = tok.volume24 != null  ? fmtNum(tok.volume24) : '—';
        var liq   = tok.liquidity != null ? fmtNum(tok.liquidity) : '—';
        var mkts  = tok.marketCount != null ? tok.marketCount : '—';
        var waxLink = contr
          ? '<a href="' + escHtml(window.WAXONEDGE_WAXBLOCK_BASE + '/account/' + contr) + '" target="_blank" rel="noopener noreferrer" class="woe-chain-link">' + escHtml(contr) + ' ↗</a>'
          : '—';
        return '<tr>' +
          '<td data-col="sym"><strong>' + escHtml(sym) + '</strong></td>' +
          '<td data-col="contr">' + waxLink + '</td>' +
          '<td data-col="usd" data-sortval="' + escHtml(String(tok.usd_price || 0)) + '" class="woe-num">' + escHtml(usd) + '</td>' +
          '<td data-col="vol" data-sortval="' + escHtml(String(tok.volume24 || 0)) + '" class="woe-num">' + escHtml(vol) + '</td>' +
          '<td data-col="liq" data-sortval="' + escHtml(String(tok.liquidity || 0)) + '" class="woe-num">' + escHtml(liq) + '</td>' +
          '<td data-col="mkts" data-sortval="' + escHtml(String(tok.marketCount || 0)) + '" class="woe-num">' + escHtml(String(mkts)) + '</td>' +
        '</tr>';
      }).join('');
      setHtml('woe-tokens-body', rows);
      setText('woe-tokens-count', data.length + ' tokens');
      attachTableSort('woe-table-tokens');
      attachTableFilter('woe-filter-tokens', 'woe-table-tokens');
    });
  }

  /* ── Pair/market table ───────────────────────────────────────── */

  function loadPairs() {
    setHtml('woe-pairs-body', '<tr><td colspan="7" class="woe-loading">Loading pairs…</td></tr>');
    var tickerUrl = (window.WAXONEDGE_ALCOR_API || 'https://wax.alcor.exchange/api') +
                   (window.WAXONEDGE_ALCOR_PATHS ? window.WAXONEDGE_ALCOR_PATHS.tickers : '/tickers');
    apiFetch(tickerUrl).then(function (tickers) {
      if (!Array.isArray(tickers) || tickers.length === 0) {
        setHtml('woe-pairs-body', '<tr><td colspan="7" class="woe-loading woe-error">Failed to load pair data.</td></tr>');
        return;
      }
      var rows = tickers.slice(0, 200).map(function (t) {
        var pair  = t.symbol || t.base_currency + '/' + t.target_currency || '?';
        var last  = t.last  != null ? fmtPrice(t.last)  : '—';
        var bid   = t.bid   != null ? fmtPrice(t.bid)   : '—';
        var ask   = t.ask   != null ? fmtPrice(t.ask)   : '—';
        var vol   = t.base_volume  != null ? fmtNum(t.base_volume)  : '—';
        var change = t.price_change_percent != null ? fmtPct(t.price_change_percent) : '—';
        var changeVal = t.price_change_percent;
        var cls   = pctClass(changeVal);
        var marketId = t.market_id || t.id;
        var alcorLink = marketId
          ? '<a href="https://wax.alcor.exchange/trade/' + escHtml(String(marketId)) + '" target="_blank" rel="noopener noreferrer" class="woe-chain-link">Alcor ↗</a>'
          : '—';
        return '<tr>' +
          '<td data-col="pair"><strong>' + escHtml(pair) + '</strong></td>' +
          '<td data-col="last"  data-sortval="' + escHtml(String(t.last || 0)) + '" class="woe-num">' + escHtml(last) + '</td>' +
          '<td data-col="bid"   data-sortval="' + escHtml(String(t.bid  || 0)) + '" class="woe-num">' + escHtml(bid)  + '</td>' +
          '<td data-col="ask"   data-sortval="' + escHtml(String(t.ask  || 0)) + '" class="woe-num">' + escHtml(ask)  + '</td>' +
          '<td data-col="vol"   data-sortval="' + escHtml(String(t.base_volume || 0)) + '" class="woe-num">' + escHtml(vol) + '</td>' +
          '<td data-col="chg"   data-sortval="' + escHtml(String(changeVal || 0)) + '" class="woe-num ' + cls + '">' + escHtml(change) + '</td>' +
          '<td>' + alcorLink + '</td>' +
        '</tr>';
      }).join('');
      setHtml('woe-pairs-body', rows);
      setText('woe-pairs-count', tickers.length + ' pairs');
      attachTableSort('woe-table-pairs');
      attachTableFilter('woe-filter-pairs', 'woe-table-pairs');
    });
  }

  /* ── swap.nefty pools panel ──────────────────────────────────── */

  function loadNeftyPools() {
    setHtml('woe-nefty-body', '<tr><td colspan="5" class="woe-loading">Loading swap.nefty pool data…</td></tr>');
    var tables = window.WAXONEDGE_NEFTY_TABLES || {};
    var poolTable = tables.pools || { code: 'swap.nefty', scope: 'swap.nefty', table: 'pools' };
    var paths = window.WAXONEDGE_RPC_PATHS || {};
    var rpcPath = paths.getTableRows || '/v1/chain/get_table_rows';

    rpcPost(rpcPath, {
      code:       poolTable.code,
      scope:      poolTable.scope,
      table:      poolTable.table,
      json:       true,
      limit:      100,
    }).then(function (data) {
      if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
        setHtml('woe-nefty-body',
          '<tr><td colspan="5" class="woe-loading woe-warn">swap.nefty pool data unavailable or empty. ' +
          'The contract may have restricted public table access.</td></tr>');
        return;
      }
      var rows = data.rows.map(function (pool) {
        var id   = pool.id   != null ? pool.id   : '—';
        var tok0 = pool.token1 || pool.reserve0_token || '—';
        var tok1 = pool.token2 || pool.reserve1_token || '—';
        var res0 = pool.reserve0 || pool.balance1 || '—';
        var res1 = pool.reserve1 || pool.balance2 || '—';
        var liq  = pool.total_liq != null ? fmtNum(pool.total_liq) : '—';
        return '<tr>' +
          '<td class="woe-num">' + escHtml(String(id))   + '</td>' +
          '<td>' + escHtml(String(tok0)) + '</td>' +
          '<td>' + escHtml(String(tok1)) + '</td>' +
          '<td class="woe-num">' + escHtml(String(res0)) + '</td>' +
          '<td class="woe-num">' + escHtml(String(res1)) + '</td>' +
        '</tr>';
      }).join('');
      setHtml('woe-nefty-body', rows);
      setText('woe-nefty-count', data.rows.length + ' pools');
      attachTableSort('woe-table-nefty');
      attachTableFilter('woe-filter-nefty', 'woe-table-nefty');
    });
  }

  /* ── Risk flags panel ────────────────────────────────────────── */

  function updateRiskFlags(tokensData, tickersData) {
    var flags = [];

    if (!tokensData || tokensData.length === 0) {
      flags.push({ level: 'warn', msg: 'Token data unavailable — price risk flags cannot be computed.' });
    } else {
      var noLiq = tokensData.filter(function (t) { return !t.liquidity || t.liquidity < 100; });
      if (noLiq.length > 0) {
        flags.push({ level: 'warn', msg: noLiq.length + ' token(s) have very low or zero liquidity.' });
      }
      var noPairs = tokensData.filter(function (t) { return !t.marketCount || t.marketCount === 0; });
      if (noPairs.length > 0) {
        flags.push({ level: 'info', msg: noPairs.length + ' token(s) have no active trading pairs.' });
      }
    }

    if (!tickersData || tickersData.length === 0) {
      flags.push({ level: 'warn', msg: 'Ticker data unavailable — spread and price change flags cannot be computed.' });
    } else {
      var highSpread = tickersData.filter(function (t) {
        if (!t.bid || !t.ask || t.bid <= 0) return false;
        return ((t.ask - t.bid) / t.bid) > 0.1;
      });
      if (highSpread.length > 0) {
        flags.push({ level: 'warn', msg: highSpread.length + ' pair(s) have a spread > 10% (high slippage risk).' });
      }
      var bigDrop = tickersData.filter(function (t) {
        return t.price_change_percent != null && t.price_change_percent < -20;
      });
      if (bigDrop.length > 0) {
        flags.push({ level: 'alert', msg: bigDrop.length + ' pair(s) dropped more than 20% in 24 h.' });
      }
    }

    if (flags.length === 0) {
      flags.push({ level: 'ok', msg: 'No significant risk flags detected in current data.' });
    }

    var html = flags.map(function (f) {
      return '<div class="woe-flag woe-flag-' + escHtml(f.level) + '">' +
        '<span class="woe-flag-icon">' + (f.level === 'alert' ? '⚠' : f.level === 'warn' ? '◈' : f.level === 'ok' ? '✓' : 'ℹ') + '</span>' +
        '<span>' + escHtml(f.msg) + '</span>' +
      '</div>';
    }).join('');
    setHtml('woe-risk-flags', html);
  }

  /* ── Holder placeholder ──────────────────────────────────────── */

  function renderHolderPlaceholder() {
    setHtml('woe-holders-panel',
      '<div class="woe-placeholder">' +
        '<span class="woe-placeholder-icon">◫</span>' +
        '<p>Holder distribution data is read from the WAX Hyperion API.</p>' +
        '<p>Enter a WAX token contract and symbol below to query on-chain holder data.</p>' +
        '<div class="woe-holder-form">' +
          '<input id="woe-holder-contract" class="woe-input" type="text" placeholder="Contract (e.g. eosio.token)" autocomplete="off">' +
          '<input id="woe-holder-symbol"   class="woe-input" type="text" placeholder="Symbol (e.g. WAX)" autocomplete="off">' +
          '<button id="woe-holder-lookup" class="woe-btn-lookup">Look up holders</button>' +
        '</div>' +
        '<div id="woe-holder-result" class="woe-holder-result"></div>' +
      '</div>'
    );
    attachHolderLookup();
  }

  function attachHolderLookup() {
    var btn = document.getElementById('woe-holder-lookup');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var contract = (document.getElementById('woe-holder-contract') || {}).value || '';
      var symbol   = (document.getElementById('woe-holder-symbol')   || {}).value || '';
      contract = contract.trim().toLowerCase();
      symbol   = symbol.trim().toUpperCase();
      if (!contract || !symbol) {
        setHtml('woe-holder-result', '<p class="woe-error">Enter both contract and symbol.</p>');
        return;
      }
      setHtml('woe-holder-result', '<p class="woe-loading">Querying Hyperion for ' + escHtml(contract) + ':' + escHtml(symbol) + '…</p>');
      var hyperion = window.WAXONEDGE_HYPERION || 'https://wax.eosusa.io/v2';
      var url = hyperion + '/state/get_tokens?account=' + encodeURIComponent(contract);
      apiFetch(url, 10000).then(function (data) {
        if (!data) {
          setHtml('woe-holder-result',
            '<p class="woe-warn">Hyperion did not return data. ' +
            'Holder distribution queries require Hyperion v2 support from the chosen endpoint.</p>');
          return;
        }
        var tokens = data.tokens || [];
        var match  = tokens.filter(function (t) { return t.symbol === symbol; });
        if (match.length === 0) {
          setHtml('woe-holder-result',
            '<p class="woe-warn">Symbol ' + escHtml(symbol) + ' not found at contract ' + escHtml(contract) + '.</p>');
          return;
        }
        var t = match[0];
        setHtml('woe-holder-result',
          '<div class="woe-holder-result-card">' +
            '<div><strong>Symbol:</strong> ' + escHtml(t.symbol) + '</div>' +
            '<div><strong>Balance:</strong> ' + escHtml(String(t.amount || '—')) + '</div>' +
            '<div><strong>Decimals:</strong> ' + escHtml(String(t.decimals || '—')) + '</div>' +
          '</div>');
      });
    });
  }

  /* ── Dashboard boot ──────────────────────────────────────────── */

  var _tokensCache  = null;
  var _tickersCache = null;

  function boot() {
    renderSourceCards();
    pingAllSources();
    attachGlobalSearch();
    renderHolderPlaceholder();

    var alcorApi  = window.WAXONEDGE_ALCOR_API  || 'https://wax.alcor.exchange/api';
    var alcorPaths = window.WAXONEDGE_ALCOR_PATHS || {};

    // Load tokens and tickers in parallel, then run risk flags
    var tokenUrl  = alcorApi + (alcorPaths.tokens  || '/tokens');
    var tickerUrl = alcorApi + (alcorPaths.tickers || '/tickers');

    Promise.all([
      apiFetch(tokenUrl),
      apiFetch(tickerUrl),
    ]).then(function (results) {
      _tokensCache  = results[0];
      _tickersCache = results[1];
      updateRiskFlags(_tokensCache, _tickersCache);
    });

    loadTokens();
    loadPairs();
    loadNeftyPools();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());

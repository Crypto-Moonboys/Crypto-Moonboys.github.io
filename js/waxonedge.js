/**
 * waxonedge.js
 *
 * WAXONEDGE — read-only WAX token, pair, pool, account-balance, and DEX analytics.
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
  WAXONEDGE_NEFTY_TABLES, WAXONEDGE_HYPERION, WAXONEDGE_HYPERION_PATHS
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

  function asNum(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(n) ? null : n;
  }

  function normalizeSymbol(symbol) {
    return String(symbol || '').trim().toUpperCase();
  }

  function normalizeContract(contract) {
    return String(contract || '').trim().toLowerCase();
  }

  function tokenKey(contract, symbol) {
    var c = normalizeContract(contract);
    var s = normalizeSymbol(symbol);
    return c && s ? c + '::' + s : '';
  }

  function parseAssetSymbol(asset) {
    var match = String(asset || '').trim().match(/^[\d.+-]+\s+([A-Z0-9._-]+)$/);
    return match ? match[1] : '';
  }

  function pairLabel(left, right) {
    var a = normalizeSymbol(left);
    var b = normalizeSymbol(right);
    return a && b ? a + '/' + b : '';
  }

  function normalizePairLabel(label) {
    return String(label || '').trim().replace(/\s+/g, '').toUpperCase();
  }

  function uniqueList(values) {
    return values.filter(function (value, index, list) {
      return value && list.indexOf(value) === index;
    });
  }

  /** Generic JSON fetch with timeout (ms). Returns null on error. */
  function apiFetch(url, timeoutMs, options) {
    var ms = timeoutMs || 10000;
    return new Promise(function (resolve) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        resolve(null);
      }, ms);
      var opts = options ? Object.assign({}, options) : {};
      if (controller) opts.signal = controller.signal;
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
      var primary = window.WAXONEDGE_WAX_RPC || 'https://wax.greymass.com';
      var fallbacks = Array.isArray(window.WAXONEDGE_WAX_RPC_FALLBACKS)
        ? window.WAXONEDGE_WAX_RPC_FALLBACKS
        : [];
      var endpoints = uniqueList([primary].concat(fallbacks));

      function tryEndpoint(index) {
        if (index >= endpoints.length) {
          resolve(null);
          return;
        }
        apiFetch(endpoints[index] + path, 12000, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function (data) {
          if (data) {
            resolve(data);
            return;
          }
          tryEndpoint(index + 1);
        });
      }

      tryEndpoint(0);
    });
  }

  function getPairTokens(pair) {
    var tokens = [];

    function add(contract, symbol) {
      var key = tokenKey(contract, symbol);
      if (!key) return;
      if (tokens.some(function (token) { return token.key === key; })) return;
      tokens.push({
        key: key,
        contract: normalizeContract(contract),
        symbol: normalizeSymbol(symbol),
      });
    }

    if (pair && pair.base_token) {
      add(pair.base_token.contract, pair.base_token.symbol || parseAssetSymbol(pair.base_token.quantity));
    }
    if (pair && pair.quote_token) {
      add(pair.quote_token.contract, pair.quote_token.symbol || parseAssetSymbol(pair.quote_token.quantity));
    }
    if (pair && pair.pool1) {
      add(pair.pool1.contract, pair.pool1.symbol || parseAssetSymbol(pair.pool1.quantity));
    }
    if (pair && pair.pool2) {
      add(pair.pool2.contract, pair.pool2.symbol || parseAssetSymbol(pair.pool2.quantity));
    }
    if (pair && pair.token0) add(pair.token0.contract, pair.token0.symbol || pair.token0.currency);
    if (pair && pair.token1) add(pair.token1.contract, pair.token1.symbol || pair.token1.currency);

    return tokens;
  }

  function getPairSymbolCandidates(pair) {
    var tokens = getPairTokens(pair);
    var symbols = tokens.map(function (token) { return token.symbol; });
    var candidates = [];

    if (pair && pair.symbol) candidates.push(pair.symbol);
    if (pair && pair.name) candidates.push(pair.name);
    if (symbols.length >= 2) {
      candidates.push(pairLabel(symbols[0], symbols[1]));
      candidates.push(pairLabel(symbols[1], symbols[0]));
    }

    return uniqueList(candidates.map(normalizePairLabel));
  }

  function buildPairIndex(pairsData) {
    var index = {
      tokenPairCounts: {},
      marketIdsBySymbol: {},
    };

    if (!Array.isArray(pairsData)) return index;

    pairsData.forEach(function (pair) {
      var tokens = getPairTokens(pair);
      tokens.forEach(function (token) {
        index.tokenPairCounts[token.key] = (index.tokenPairCounts[token.key] || 0) + 1;
      });

      if (pair && pair.id != null) {
        getPairSymbolCandidates(pair).forEach(function (candidate) {
          if (!index.marketIdsBySymbol[candidate]) {
            index.marketIdsBySymbol[candidate] = pair.id;
          }
        });
      }
    });

    return index;
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

  function renderTokens(tokensData, pairIndex) {
    var tokenPairCounts = pairIndex && pairIndex.tokenPairCounts ? pairIndex.tokenPairCounts : {};
    if (!Array.isArray(tokensData) || tokensData.length === 0) {
      setHtml('woe-tokens-body', '<tr><td colspan="6" class="woe-loading woe-error">Failed to load token data.</td></tr>');
      return;
    }
    var rows = tokensData.slice(0, 200).map(function (tok) {
      var sym = tok.symbol || tok.id || '?';
      var contr = tok.contract || '';
      var usdVal = asNum(tok.usd_price);
      var sysVal = asNum(tok.system_price);
      var decimalsVal = tok.decimals != null ? tok.decimals : '—';
      var pairCountKey = tokenKey(contr, sym);
      var pairCountVal = pairCountKey ? (tokenPairCounts[pairCountKey] || 0) : null;
      var waxLink = contr
        ? '<a href="' + escHtml(window.WAXONEDGE_WAXBLOCK_BASE + '/account/' + contr) + '" target="_blank" rel="noopener noreferrer" class="woe-chain-link">' + escHtml(contr) + ' ↗</a>'
        : '—';
      return '<tr>' +
        '<td data-col="sym"><strong>' + escHtml(sym) + '</strong></td>' +
        '<td data-col="contr">' + waxLink + '</td>' +
        '<td data-col="usd" data-sortval="' + escHtml(String(usdVal || 0)) + '" class="woe-num">' + escHtml(usdVal != null ? fmtPrice(usdVal) : '—') + '</td>' +
        '<td data-col="sys" data-sortval="' + escHtml(String(sysVal || 0)) + '" class="woe-num">' + escHtml(sysVal != null ? fmtPrice(sysVal) : '—') + '</td>' +
        '<td data-col="dec" data-sortval="' + escHtml(String(tok.decimals || 0)) + '" class="woe-num">' + escHtml(String(decimalsVal)) + '</td>' +
        '<td data-col="pairs" data-sortval="' + escHtml(String(pairCountVal || 0)) + '" class="woe-num">' + escHtml(pairCountVal != null ? String(pairCountVal) : '—') + '</td>' +
      '</tr>';
    }).join('');
    setHtml('woe-tokens-body', rows);
    setText('woe-tokens-count', tokensData.length + ' tokens');
    attachTableSort('woe-table-tokens');
    attachTableFilter('woe-filter-tokens', 'woe-table-tokens');
  }

  function loadTokens(tokensData, pairIndex) {
    setHtml('woe-tokens-body', '<tr><td colspan="6" class="woe-loading">Loading tokens…</td></tr>');
    if (arguments.length > 0) {
      renderTokens(tokensData, pairIndex);
      return;
    }
    var url = (window.WAXONEDGE_ALCOR_API || 'https://wax.alcor.exchange/api/v2') +
              (window.WAXONEDGE_ALCOR_PATHS ? window.WAXONEDGE_ALCOR_PATHS.tokens : '/tokens');
    apiFetch(url).then(function (data) {
      renderTokens(data, pairIndex);
    });
  }

  /* ── Pair/market table ───────────────────────────────────────── */

  function getTickerPairName(ticker) {
    if (ticker.symbol) return ticker.symbol;
    if (ticker.base_token && ticker.quote_token) {
      return pairLabel(ticker.base_token.symbol, ticker.quote_token.symbol);
    }
    if (ticker.base_currency && ticker.target_currency) {
      return pairLabel(ticker.base_currency, ticker.target_currency);
    }
    return '?';
  }

  function renderPairs(tickers, pairIndex) {
    if (!Array.isArray(tickers) || tickers.length === 0) {
      setHtml('woe-pairs-body', '<tr><td colspan="7" class="woe-loading woe-error">Failed to load pair data.</td></tr>');
      return;
    }
    var marketIdsBySymbol = pairIndex && pairIndex.marketIdsBySymbol ? pairIndex.marketIdsBySymbol : {};
    var rows = tickers.slice(0, 200).map(function (t) {
      var pair = getTickerPairName(t);
      var normalizedPair = normalizePairLabel(pair);
      var lastVal = asNum(t.last_price != null ? t.last_price : t.last);
      var bidVal = asNum(t.bid);
      var askVal = asNum(t.ask);
      var volVal = asNum(t.base_volume != null ? t.base_volume : t.volume24);
      var changeVal = asNum(t.change24 != null ? t.change24 : t.price_change_percent);
      var cls = pctClass(changeVal);
      var marketId = t.market_id || t.id || marketIdsBySymbol[normalizedPair];
      var alcorLink = marketId
        ? '<a href="https://wax.alcor.exchange/trade/' + escHtml(String(marketId)) + '" target="_blank" rel="noopener noreferrer" class="woe-chain-link">Alcor ↗</a>'
        : '—';
      return '<tr>' +
        '<td data-col="pair"><strong>' + escHtml(pair) + '</strong></td>' +
        '<td data-col="last" data-sortval="' + escHtml(String(lastVal || 0)) + '" class="woe-num">' + escHtml(lastVal != null ? fmtPrice(lastVal) : '—') + '</td>' +
        '<td data-col="bid" data-sortval="' + escHtml(String(bidVal || 0)) + '" class="woe-num">' + escHtml(bidVal != null ? fmtPrice(bidVal) : '—') + '</td>' +
        '<td data-col="ask" data-sortval="' + escHtml(String(askVal || 0)) + '" class="woe-num">' + escHtml(askVal != null ? fmtPrice(askVal) : '—') + '</td>' +
        '<td data-col="vol" data-sortval="' + escHtml(String(volVal || 0)) + '" class="woe-num">' + escHtml(volVal != null ? fmtNum(volVal) : '—') + '</td>' +
        '<td data-col="chg" data-sortval="' + escHtml(String(changeVal || 0)) + '" class="woe-num ' + cls + '">' + escHtml(changeVal != null ? fmtPct(changeVal) : '—') + '</td>' +
        '<td>' + alcorLink + '</td>' +
      '</tr>';
    }).join('');
    setHtml('woe-pairs-body', rows);
    setText('woe-pairs-count', tickers.length + ' pairs');
    attachTableSort('woe-table-pairs');
    attachTableFilter('woe-filter-pairs', 'woe-table-pairs');
  }

  function loadPairs(tickersData, pairIndex) {
    setHtml('woe-pairs-body', '<tr><td colspan="7" class="woe-loading">Loading pairs…</td></tr>');
    if (arguments.length > 0) {
      renderPairs(tickersData, pairIndex);
      return;
    }
    var tickerUrl = (window.WAXONEDGE_ALCOR_API || 'https://wax.alcor.exchange/api/v2') +
                   (window.WAXONEDGE_ALCOR_PATHS ? window.WAXONEDGE_ALCOR_PATHS.tickers : '/tickers');
    apiFetch(tickerUrl).then(function (tickers) {
      renderPairs(tickers, pairIndex);
    });
  }

  /* ── swap.nefty pools panel ──────────────────────────────────── */

  function setNeftyMeta(html) {
    setHtml('woe-nefty-meta', html);
  }

  function getNeftyValue(row, candidates, fallback) {
    for (var i = 0; i < candidates.length; i++) {
      var value = row[candidates[i]];
      if (value != null && value !== '') return value;
    }
    return fallback;
  }

  function getNeftyTokenLabel(tokenSide, fallbackText) {
    if (!tokenSide) return fallbackText;
    if (typeof tokenSide === 'string') return tokenSide;
    var symbol = tokenSide.symbol || tokenSide.currency || parseAssetSymbol(tokenSide.quantity);
    var contract = tokenSide.contract || tokenSide.contract_name || '';
    if (symbol && contract) return symbol + ' @ ' + contract;
    return symbol || contract || fallbackText;
  }

  function renderNeftyRows(rows, tableName) {
    var html = rows.map(function (row) {
      var id = getNeftyValue(row, ['id', 'pair_id', 'pool_id'], '—');
      var tok0 = getNeftyValue(row, ['token1', 'reserve0_token', 'token_a'], null);
      var tok1 = getNeftyValue(row, ['token2', 'reserve1_token', 'token_b'], null);
      var res0 = getNeftyValue(row, ['reserve0', 'balance1', 'reserve_a'], row.pool1 && row.pool1.quantity);
      var res1 = getNeftyValue(row, ['reserve1', 'balance2', 'reserve_b'], row.pool2 && row.pool2.quantity);
      return '<tr>' +
        '<td class="woe-num">' + escHtml(String(id)) + '</td>' +
        '<td>' + escHtml(String(tok0 || getNeftyTokenLabel(row.pool1 || row.base_token, '—'))) + '</td>' +
        '<td>' + escHtml(String(tok1 || getNeftyTokenLabel(row.pool2 || row.quote_token, '—'))) + '</td>' +
        '<td class="woe-num">' + escHtml(String(res0 || '—')) + '</td>' +
        '<td class="woe-num">' + escHtml(String(res1 || '—')) + '</td>' +
      '</tr>';
    }).join('');
    setHtml('woe-nefty-body', html);
    setText('woe-nefty-count', rows.length + ' ' + tableName);
    attachTableSort('woe-table-nefty');
    attachTableFilter('woe-filter-nefty', 'woe-table-nefty');
  }

  function loadNeftyPools() {
    setHtml('woe-nefty-body', '<tr><td colspan="5" class="woe-loading">Loading swap.nefty pool data…</td></tr>');
    var tables = window.WAXONEDGE_NEFTY_TABLES || {};
    var paths = window.WAXONEDGE_RPC_PATHS || {};
    var contract = window.WAXONEDGE_NEFTY_CONTRACT || 'swap.nefty';
    var rpcPath = paths.getTableRows || '/v1/chain/get_table_rows';
    var abiPath = paths.getAbi || '/v1/chain/get_abi';

    rpcPost(abiPath, { account_name: contract }).then(function (abiData) {
      var abi = abiData && abiData.abi;
      var abiTables = abi && Array.isArray(abi.tables)
        ? abi.tables.map(function (table) { return table && table.name; }).filter(Boolean)
        : [];
      var detected = uniqueList(abiTables);
      var detectedHtml = detected.length > 0
        ? 'Detected ABI tables: <code>' + detected.join('</code>, <code>') + '</code>.'
        : 'ABI lookup did not return supported table metadata.';
      setNeftyMeta(detectedHtml);

      var allowedTables = ['pools', 'pairs'].filter(function (name) {
        return detected.indexOf(name) !== -1;
      });

      if (allowedTables.length === 0) {
        setHtml('woe-nefty-body',
          '<tr><td colspan="5" class="woe-loading woe-warn">swap.nefty table detection did not confirm a readable pools/pairs table.</td></tr>');
        setText('woe-nefty-count', 'ABI check');
        return;
      }

      function tryTable(index) {
        if (index >= allowedTables.length) {
          setHtml('woe-nefty-body',
            '<tr><td colspan="5" class="woe-loading woe-warn">swap.nefty table data unavailable or empty for detected ABI tables.</td></tr>');
          setText('woe-nefty-count', '0 rows');
          return;
        }
        var tableName = allowedTables[index];
        var tableConfig = tables[tableName] || { code: contract, scope: contract, table: tableName };
        rpcPost(rpcPath, {
          code: tableConfig.code,
          scope: tableConfig.scope,
          table: tableConfig.table,
          json: true,
          limit: 100,
        }).then(function (data) {
          if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
            tryTable(index + 1);
            return;
          }
          setNeftyMeta(detectedHtml + ' Showing <code>' + escHtml(tableName) + '</code> rows.');
          renderNeftyRows(data.rows, tableName);
        });
      }

      tryTable(0);
    });
  }

  /* ── Risk flags panel ────────────────────────────────────────── */

  function updateRiskFlags(tokensData, tickersData, pairIndex) {
    var flags = [];
    var tokenPairCounts = pairIndex && pairIndex.tokenPairCounts ? pairIndex.tokenPairCounts : {};

    if (!tokensData || tokensData.length === 0) {
      flags.push({ level: 'warn', msg: 'Token data unavailable — price risk flags cannot be computed.' });
    } else {
      var noPairs = tokensData.filter(function (t) {
        var key = tokenKey(t.contract, t.symbol || t.id);
        return key && !tokenPairCounts[key];
      });
      if (noPairs.length > 0) {
        flags.push({ level: 'info', msg: noPairs.length + ' token(s) have no detected Alcor pairs.' });
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
        var change = asNum(t.change24 != null ? t.change24 : t.price_change_percent);
        return change != null && change < -20;
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

  /* ── Account balance placeholder ─────────────────────────────── */

  function renderHolderPlaceholder() {
    setHtml('woe-holders-panel',
      '<div class="woe-placeholder">' +
        '<span class="woe-placeholder-icon">◫</span>' +
        '<p>Look up the tokens currently held by a WAX account via the Hyperion API.</p>' +
        '<p>Enter an account name below to read the balances returned by <code>/state/get_tokens</code>.</p>' +
        '<div class="woe-holder-form">' +
          '<input id="woe-holder-account" class="woe-input" type="text" placeholder="Account (e.g. cryptomoonboy)" autocomplete="off">' +
          '<button id="woe-holder-lookup" class="woe-btn-lookup">Look up balances</button>' +
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
      var account = (document.getElementById('woe-holder-account') || {}).value || '';
      account = account.trim().toLowerCase();
      if (!account) {
        setHtml('woe-holder-result', '<p class="woe-error">Enter a WAX account name.</p>');
        return;
      }
      setHtml('woe-holder-result', '<p class="woe-loading">Querying Hyperion balances for ' + escHtml(account) + '…</p>');
      var hyperion = window.WAXONEDGE_HYPERION || 'https://wax.eosusa.io/v2';
      var hyperionPaths = window.WAXONEDGE_HYPERION_PATHS || {};
      var getTokensPath = hyperionPaths.getTokens || '/state/get_tokens';
      var url = hyperion + getTokensPath + '?account=' + encodeURIComponent(account);
      apiFetch(url, 10000).then(function (data) {
        if (!data) {
          setHtml('woe-holder-result',
            '<p class="woe-warn">Hyperion did not return data. ' +
            'Account balance lookup requires Hyperion v2 support from the chosen endpoint.</p>');
          return;
        }
        var tokens = data.tokens || [];
        if (tokens.length === 0) {
          setHtml('woe-holder-result',
            '<p class="woe-warn">No token balances were returned for ' + escHtml(account) + '.</p>');
          return;
        }
        var rows = tokens.slice(0, 25).map(function (token) {
          return '<div class="woe-holder-result-card">' +
            '<div><strong>Symbol:</strong> ' + escHtml(String(token.symbol || '—')) + '</div>' +
            '<div><strong>Balance:</strong> ' + escHtml(String(token.amount || '—')) + '</div>' +
            '<div><strong>Contract:</strong> ' + escHtml(String(token.contract || '—')) + '</div>' +
            '<div><strong>Decimals:</strong> ' + escHtml(String(token.decimals || '—')) + '</div>' +
          '</div>';
        }).join('');
        setHtml('woe-holder-result',
          '<p><strong>' + escHtml(account) + '</strong> — ' + escHtml(String(tokens.length)) + ' token balance(s) returned.</p>' +
          rows);
      });
    });
  }

  /* ── Dashboard boot ──────────────────────────────────────────── */

  var _tokensCache  = null;
  var _pairsCache   = null;
  var _tickersCache = null;

  function boot() {
    renderSourceCards();
    pingAllSources();
    attachGlobalSearch();
    renderHolderPlaceholder();

    var alcorApi  = window.WAXONEDGE_ALCOR_API  || 'https://wax.alcor.exchange/api/v2';
    var alcorPaths = window.WAXONEDGE_ALCOR_PATHS || {};
    var pairIndex;

    // Load Alcor datasets in parallel once, then fan out to the renderers.
    var tokenUrl  = alcorApi + (alcorPaths.tokens  || '/tokens');
    var pairsUrl  = alcorApi + (alcorPaths.pairs   || '/pairs');
    var tickerUrl = alcorApi + (alcorPaths.tickers || '/tickers');

    Promise.all([
      apiFetch(tokenUrl),
      apiFetch(pairsUrl),
      apiFetch(tickerUrl),
    ]).then(function (results) {
      _tokensCache  = results[0];
      _pairsCache   = results[1];
      _tickersCache = results[2];
      pairIndex = buildPairIndex(_pairsCache);
      updateRiskFlags(_tokensCache, _tickersCache, pairIndex);
      loadTokens(_tokensCache, pairIndex);
      loadPairs(_tickersCache, pairIndex);
    });

    loadNeftyPools();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());

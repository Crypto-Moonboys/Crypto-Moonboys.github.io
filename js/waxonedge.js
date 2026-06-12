/**
 * waxonedge.js
 *
 * WAXONEDGE — read-only WAX token, pool, pair, and DEX analytics.
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

  var UNAVAILABLE_TEXT = 'Unavailable';
  var INDEXED_BACKEND_TEXT = 'Requires indexed backend';

  var state = {
    tokens: [],
    pairs: [],
    tickers: [],
    pairIndex: { tokenPairCounts: {}, marketIdsBySymbol: {} },
    tokenMap: { byKey: {}, bySymbol: {} },
    alcorMarkets: [],
    neftyMarkets: [],
    neftyDetectedTables: [],
    neftyTableUsed: '',
    selected: { symbol: '', contract: '', key: '' },
    chainStatCache: {},
    chainStatPending: {},
    chartCache: {},
    chartPending: {},
  };

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
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(d) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(d) + 'K';
    return Number(n).toFixed(d);
  }

  function fmtPrice(n) {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1000) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(4);
    if (Math.abs(n) >= 0.0001) return n.toFixed(6);
    return n.toExponential(4);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '—';
    var sign = n > 0 ? '+' : '';
    return sign + Number(n).toFixed(2) + '%';
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

  function setStatus(id, stateName) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'woe-status-dot woe-status-' + stateName;
    el.title = stateName;
  }

  function asNum(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(n) ? null : n;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
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

  function parseAsset(asset) {
    var raw = String(asset || '').trim();
    var match = raw.match(/^([+-]?\d+(?:\.\d+)?)\s+([A-Z0-9._-]+)$/);
    if (!match) {
      return {
        raw: raw,
        amount: asNum(raw),
        symbol: '',
        precision: null,
      };
    }
    return {
      raw: raw,
      amount: asNum(match[1]),
      symbol: normalizeSymbol(match[2]),
      precision: match[1].indexOf('.') === -1 ? 0 : match[1].split('.')[1].length,
    };
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

  function fmtDate(ts) {
    try {
      return new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch (_) {
      return '—';
    }
  }

  function formatAvailabilityText(text) {
    return text || UNAVAILABLE_TEXT;
  }

  function availabilityHtml(text) {
    return '<span class="woe-unavailable">' + escHtml(formatAvailabilityText(text)) + '</span>';
  }

  function formatDualMetric(waxValue, usdValue, waxSuffix, usdPrefix) {
    var parts = [];
    if (waxValue != null && !isNaN(waxValue)) {
      parts.push(fmtNum(waxValue) + ' ' + (waxSuffix || 'WAX'));
    }
    if (usdValue != null && !isNaN(usdValue)) {
      parts.push((usdPrefix || '$') + fmtNum(usdValue));
    }
    return parts.length ? parts.join(' · ') : UNAVAILABLE_TEXT;
  }

  function formatFeeTier(value) {
    var fee = asNum(value);
    if (fee == null) return UNAVAILABLE_TEXT;
    if (fee > 1) return fee + ' bps';
    return (fee * 100).toFixed(2) + '%';
  }

  function getSymbolValue(symbolField) {
    if (symbolField == null) return '';
    if (typeof symbolField === 'string') return normalizeSymbol(symbolField);
    if (typeof symbolField === 'object') {
      return normalizeSymbol(symbolField.name || symbolField.symbol || symbolField.code || '');
    }
    return '';
  }

  function getTokenSideInfo(side) {
    if (!side) {
      return {
        symbol: '',
        contract: '',
        key: '',
        quantity: '',
        amount: null,
        label: UNAVAILABLE_TEXT,
      };
    }

    if (typeof side === 'string') {
      var parsedString = parseAsset(side);
      var stringSymbol = parsedString.symbol || normalizeSymbol(side);
      return {
        symbol: stringSymbol,
        contract: '',
        key: tokenKey('', stringSymbol),
        quantity: parsedString.raw,
        amount: parsedString.amount,
        label: stringSymbol || parsedString.raw || UNAVAILABLE_TEXT,
      };
    }

    var quantity = side.quantity || side.reserve || side.amount || side.balance || side.value || '';
    var parsed = parseAsset(quantity);
    var symbol = normalizeSymbol(
      getSymbolValue(side.symbol) ||
      side.currency ||
      side.token_symbol ||
      side.sym ||
      parsed.symbol
    );
    var contract = normalizeContract(
      side.contract ||
      side.contract_name ||
      side.code ||
      side.token_contract ||
      side.scope
    );
    var label = symbol && contract ? symbol + ' @ ' + contract : symbol || contract || parsed.raw || UNAVAILABLE_TEXT;
    return {
      symbol: symbol,
      contract: contract,
      key: tokenKey(contract, symbol),
      quantity: parsed.raw || String(quantity || ''),
      amount: parsed.amount,
      label: label,
    };
  }

  function describeToken(side) {
    return side && side.label ? side.label : UNAVAILABLE_TEXT;
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
          if (!r.ok) {
            resolve(null);
            return;
          }
          return r.json();
        })
        .then(function (data) { resolve(data || null); })
        .catch(function () {
          clearTimeout(timer);
          resolve(null);
        });
    });
  }

  /** WAX RPC POST helper with sequential fallbacks. */
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

  function findTokenRecord(tokenMap, contract, symbol) {
    var key = tokenKey(contract, symbol);
    if (key && tokenMap.byKey[key]) return tokenMap.byKey[key];
    var normalizedSymbol = normalizeSymbol(symbol);
    var bySymbol = normalizedSymbol ? tokenMap.bySymbol[normalizedSymbol] : null;
    return bySymbol && bySymbol[0] ? bySymbol[0] : null;
  }

  function buildTokenMap(tokensData) {
    var map = { byKey: {}, bySymbol: {} };
    (tokensData || []).forEach(function (tok) {
      var symbol = normalizeSymbol(tok.symbol || tok.id);
      var contract = normalizeContract(tok.contract);
      var key = tokenKey(contract, symbol);
      if (!key) return;
      var record = {
        key: key,
        symbol: symbol,
        contract: contract,
        id: tok.id || '',
        decimals: tok.decimals != null ? tok.decimals : null,
        systemPrice: asNum(tok.system_price),
        usdPrice: asNum(tok.usd_price),
        raw: tok,
      };
      map.byKey[key] = record;
      if (!map.bySymbol[symbol]) map.bySymbol[symbol] = [];
      map.bySymbol[symbol].push(record);
    });
    return map;
  }

  function getPairTokens(pair) {
    var tokens = [];

    function add(side) {
      var info = getTokenSideInfo(side);
      if (!info.symbol && !info.contract) return;
      if (tokens.some(function (token) { return token.key && token.key === info.key; })) return;
      tokens.push(info);
    }

    add(pair && pair.base_token);
    add(pair && pair.quote_token);
    add(pair && pair.pool1);
    add(pair && pair.pool2);
    add(pair && pair.token0);
    add(pair && pair.token1);
    add(pair && pair.token_a);
    add(pair && pair.token_b);

    return tokens;
  }

  function getPairSymbolCandidates(pair) {
    var tokens = getPairTokens(pair);
    var symbols = tokens.map(function (token) { return token.symbol; });
    var candidates = [];

    if (pair && pair.symbol) candidates.push(pair.symbol);
    if (pair && pair.name) candidates.push(pair.name);
    if (pair && pair.market_name) candidates.push(pair.market_name);
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
        if (!token.key) return;
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

  function buildTickerIndex(tickersData) {
    var index = { byMarketId: {}, bySymbol: {} };
    (tickersData || []).forEach(function (ticker) {
      if (ticker == null) return;
      var marketId = ticker.market_id != null ? String(ticker.market_id) : '';
      if (marketId) index.byMarketId[marketId] = ticker;
      var symbol = normalizePairLabel(ticker.symbol || pairLabel(ticker.base_currency, ticker.target_currency));
      if (symbol) index.bySymbol[symbol] = ticker;
    });
    return index;
  }

  function getKnownPrice(tokenInfo) {
    var tokenRecord = findTokenRecord(state.tokenMap, tokenInfo.contract, tokenInfo.symbol);
    if (tokenRecord) return tokenRecord;
    if (normalizeSymbol(tokenInfo.symbol) === 'WAX') {
      var waxRecord = findTokenRecord(state.tokenMap, 'eosio.token', 'WAX');
      return waxRecord || { systemPrice: 1, usdPrice: null };
    }
    return null;
  }

  function computeLiquidityFromSides(sideA, sideB) {
    var waxValue = 0;
    var usdValue = 0;
    var hasWax = false;
    var hasUsd = false;

    function add(side) {
      if (!side || side.amount == null) return;
      var priceRecord = getKnownPrice(side);
      if (!priceRecord) return;
      if (priceRecord.systemPrice != null) {
        waxValue += side.amount * priceRecord.systemPrice;
        hasWax = true;
      }
      if (priceRecord.usdPrice != null) {
        usdValue += side.amount * priceRecord.usdPrice;
        hasUsd = true;
      }
    }

    add(sideA);
    add(sideB);

    return {
      wax: hasWax ? waxValue : null,
      usd: hasUsd ? usdValue : null,
    };
  }

  function sumMetric(rows, field) {
    var total = 0;
    var hasAny = false;
    rows.forEach(function (row) {
      if (row[field] != null && !isNaN(row[field])) {
        total += row[field];
        hasAny = true;
      }
    });
    return hasAny ? total : null;
  }

  function buildAlcorMarkets(pairsData, tickersData) {
    var tickerIndex = buildTickerIndex(tickersData);
    var markets = [];

    (pairsData || []).forEach(function (pair) {
      var tokens = getPairTokens(pair);
      var tokenA = getTokenSideInfo(pair.pool1 || pair.base_token || pair.token0 || pair.token_a || tokens[0]);
      var tokenB = getTokenSideInfo(pair.pool2 || pair.quote_token || pair.token1 || pair.token_b || tokens[1]);

      if (!tokenA.key && tokens[0]) tokenA = tokens[0];
      if (!tokenB.key && tokens[1]) tokenB = tokens[1];
      if (tokenA.key && tokenA.key === tokenB.key && tokens.length > 1) {
        tokenA = tokens[0];
        tokenB = tokens[1];
      }

      var marketId = pair && pair.id != null ? String(pair.id) : '';
      var ticker = marketId ? tickerIndex.byMarketId[marketId] : null;
      if (!ticker) {
        getPairSymbolCandidates(pair).some(function (candidate) {
          ticker = tickerIndex.bySymbol[candidate];
          return !!ticker;
        });
      }

      var liquidity = computeLiquidityFromSides(tokenA, tokenB);
      var lastPrice = asNum(ticker && (ticker.last_price != null ? ticker.last_price : ticker.last));
      var change24 = asNum(ticker && (ticker.change24 != null ? ticker.change24 : ticker.price_change_percent));
      var volume24 = asNum(ticker && (ticker.base_volume != null ? ticker.base_volume : ticker.volume24));
      var priceUnit = tokenB.symbol || '';
      var currentPriceText = lastPrice != null
        ? fmtPrice(lastPrice) + (priceUnit ? ' ' + priceUnit : '')
        : UNAVAILABLE_TEXT;
      var volume24Text = volume24 != null
        ? fmtNum(volume24) + (tokenA.symbol ? ' ' + tokenA.symbol : '')
        : UNAVAILABLE_TEXT;

      markets.push({
        adapter: 'alcor',
        source: 'Alcor',
        sourceMeta: 'Alcor /pairs + /tickers',
        sourceSort: 1,
        marketId: marketId,
        rankMetric: liquidity.usd != null ? liquidity.usd : (volume24 != null ? volume24 : 0),
        feeTier: formatFeeTier(pair && pair.fee),
        tokenA: tokenA,
        tokenB: tokenB,
        liquidityWax: liquidity.wax,
        liquidityUsd: liquidity.usd,
        liquidityText: formatDualMetric(liquidity.wax, liquidity.usd),
        currentPrice: lastPrice,
        currentPriceText: currentPriceText,
        change24: change24,
        volume24: volume24,
        volume24Text: volume24Text,
        volume7dText: UNAVAILABLE_TEXT,
        volume30dText: UNAVAILABLE_TEXT,
        pooledTokenAText: tokenA.quantity || UNAVAILABLE_TEXT,
        pooledTokenBText: tokenB.quantity || UNAVAILABLE_TEXT,
        explorerUrl: marketId
          ? 'https://wax.alcor.exchange/trade/' + encodeURIComponent(marketId)
          : 'https://wax.alcor.exchange',
        explorerLabel: marketId ? 'Alcor market ↗' : 'Alcor ↗',
      });
    });

    return markets;
  }

  function normalizeNeftyRow(row) {
    var tokenA = getTokenSideInfo(row.pool1 || row.base_token || row.token1 || row.token_a || row.token0);
    var tokenB = getTokenSideInfo(row.pool2 || row.quote_token || row.token2 || row.token_b || row.token1);
    var reserveA = row.reserve0 || row.balance1 || row.reserve_a || tokenA.quantity;
    var reserveB = row.reserve1 || row.balance2 || row.reserve_b || tokenB.quantity;
    if (reserveA && !tokenA.quantity) tokenA = getTokenSideInfo(Object.assign({}, tokenA, { quantity: reserveA }));
    if (reserveB && !tokenB.quantity) tokenB = getTokenSideInfo(Object.assign({}, tokenB, { quantity: reserveB }));

    var priceFromReserves = tokenA.amount != null && tokenA.amount > 0 && tokenB.amount != null
      ? tokenB.amount / tokenA.amount
      : null;
    var liquidity = computeLiquidityFromSides(tokenA, tokenB);

    return {
      adapter: 'swap.nefty',
      source: 'swap.nefty',
      sourceMeta: 'ABI-confirmed WAX contract table',
      sourceSort: 2,
      marketId: row.id != null ? String(row.id) : (row.pair_id != null ? String(row.pair_id) : ''),
      rankMetric: liquidity.usd != null ? liquidity.usd : (tokenA.amount != null ? tokenA.amount : 0),
      feeTier: formatFeeTier(row.fee),
      tokenA: tokenA,
      tokenB: tokenB,
      liquidityWax: liquidity.wax,
      liquidityUsd: liquidity.usd,
      liquidityText: formatDualMetric(liquidity.wax, liquidity.usd),
      currentPrice: priceFromReserves,
      currentPriceText: priceFromReserves != null
        ? fmtPrice(priceFromReserves) + (tokenB.symbol ? ' ' + tokenB.symbol : '')
        : UNAVAILABLE_TEXT,
      change24: null,
      volume24: null,
      volume24Text: UNAVAILABLE_TEXT,
      volume7dText: INDEXED_BACKEND_TEXT,
      volume30dText: INDEXED_BACKEND_TEXT,
      pooledTokenAText: tokenA.quantity || UNAVAILABLE_TEXT,
      pooledTokenBText: tokenB.quantity || UNAVAILABLE_TEXT,
      explorerUrl: (window.WAXONEDGE_WAXBLOCK_BASE || 'https://waxblock.io') + '/account/' + (window.WAXONEDGE_NEFTY_CONTRACT || 'swap.nefty'),
      explorerLabel: 'WaxBlock ↗',
    };
  }

  function loadNeftyAdapter() {
    var tables = window.WAXONEDGE_NEFTY_TABLES || {};
    var paths = window.WAXONEDGE_RPC_PATHS || {};
    var contract = window.WAXONEDGE_NEFTY_CONTRACT || 'swap.nefty';
    var rpcPath = paths.getTableRows || '/v1/chain/get_table_rows';
    var abiPath = paths.getAbi || '/v1/chain/get_abi';

    return rpcPost(abiPath, { account_name: contract }).then(function (abiData) {
      var abi = abiData && abiData.abi;
      var abiTables = abi && Array.isArray(abi.tables)
        ? abi.tables.map(function (table) { return table && table.name; }).filter(Boolean)
        : [];
      var detected = uniqueList(abiTables);
      state.neftyDetectedTables = detected;

      var allowedTables = ['pools', 'pairs'].filter(function (name) {
        return detected.indexOf(name) !== -1;
      });
      if (allowedTables.length === 0) {
        state.neftyTableUsed = '';
        return [];
      }

      function tryTable(index) {
        if (index >= allowedTables.length) {
          state.neftyTableUsed = '';
          return Promise.resolve([]);
        }
        var tableName = allowedTables[index];
        var tableConfig = tables[tableName] || { code: contract, scope: contract, table: tableName };
        return rpcPost(rpcPath, {
          code: tableConfig.code,
          scope: tableConfig.scope,
          table: tableConfig.table,
          json: true,
          limit: 200,
        }).then(function (data) {
          if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
            return tryTable(index + 1);
          }
          state.neftyTableUsed = tableName;
          return data.rows.map(normalizeNeftyRow);
        });
      }

      return tryTable(0);
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
    if (!table || table.dataset.sortBound === 'true') return;
    table.dataset.sortBound = 'true';
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
      var av = (a.querySelector('td[data-col="' + col + '"]') || {}).getAttribute
        ? (a.querySelector('td[data-col="' + col + '"]').getAttribute('data-sortval') || a.querySelector('td[data-col="' + col + '"]').textContent || '')
        : '';
      var bv = (b.querySelector('td[data-col="' + col + '"]') || {}).getAttribute
        ? (b.querySelector('td[data-col="' + col + '"]').getAttribute('data-sortval') || b.querySelector('td[data-col="' + col + '"]').textContent || '')
        : '';
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
    if (!input || !table || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      var rows = table.querySelectorAll('tbody tr');
      rows.forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.style.display = q === '' || text.includes(q) ? '' : 'none';
      });
    });
  }

  function attachGlobalSearch() {
    var input = document.getElementById('woe-global-search');
    if (!input || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      ['woe-table-tokens', 'woe-table-matrix'].forEach(function (tableId) {
        var table = document.getElementById(tableId);
        if (!table) return;
        table.querySelectorAll('tbody tr').forEach(function (row) {
          row.style.display = q === '' || row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    });
  }

  /* ── Tokens scanner ─────────────────────────────────────────── */

  function buildTokenHref(symbol, contract) {
    var basePath = window.location.pathname || '/waxonedge.html';
    return basePath + '?token=' + encodeURIComponent(symbol) + '&contract=' + encodeURIComponent(contract) + '#woe-token-detail';
  }

  function attachTokenSelectionLinks() {
    document.querySelectorAll('.woe-token-detail-link').forEach(function (link) {
      if (link.dataset.bound === 'true') return;
      link.dataset.bound = 'true';
      link.addEventListener('click', function (event) {
        event.preventDefault();
        selectToken(link.getAttribute('data-token'), link.getAttribute('data-contract'), true);
        var detail = document.getElementById('woe-token-detail');
        if (detail && typeof detail.scrollIntoView === 'function') {
          detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function renderTokens() {
    var tokensData = state.tokens;
    var tokenPairCounts = state.pairIndex && state.pairIndex.tokenPairCounts ? state.pairIndex.tokenPairCounts : {};
    if (!Array.isArray(tokensData) || tokensData.length === 0) {
      setHtml('woe-tokens-body', '<tr><td colspan="6" class="woe-loading woe-error">Failed to load token data.</td></tr>');
      return;
    }

    var selectedKey = state.selected.key;
    var rows = tokensData.slice(0, 250).map(function (tok) {
      var record = findTokenRecord(state.tokenMap, tok.contract, tok.symbol || tok.id) || tok;
      var sym = record.symbol || tok.symbol || tok.id || '?';
      var contr = record.contract || tok.contract || '';
      var usdVal = record.usdPrice != null ? record.usdPrice : asNum(tok.usd_price);
      var sysVal = record.systemPrice != null ? record.systemPrice : asNum(tok.system_price);
      var pairCountKey = tokenKey(contr, sym);
      var pairCountVal = pairCountKey ? (tokenPairCounts[pairCountKey] || 0) : null;
      var activeClass = pairCountKey && pairCountKey === selectedKey ? ' class="woe-row-active"' : '';
      var symbolLink = '<a class="woe-token-detail-link" href="' + escHtml(buildTokenHref(sym, contr)) + '"' +
        ' data-token="' + escHtml(sym) + '"' +
        ' data-contract="' + escHtml(contr) + '">' + escHtml(sym) + '</a>';
      var waxLink = contr
        ? '<a href="' + escHtml((window.WAXONEDGE_WAXBLOCK_BASE || 'https://waxblock.io') + '/account/' + contr) + '" target="_blank" rel="noopener noreferrer" class="woe-chain-link">' + escHtml(contr) + ' ↗</a>'
        : availabilityHtml();
      return '<tr' + activeClass + '>' +
        '<td data-col="sym"><strong>' + symbolLink + '</strong></td>' +
        '<td data-col="contr">' + waxLink + '</td>' +
        '<td data-col="usd" data-sortval="' + escHtml(String(usdVal || 0)) + '" class="woe-num">' + escHtml(usdVal != null ? fmtPrice(usdVal) : '—') + '</td>' +
        '<td data-col="sys" data-sortval="' + escHtml(String(sysVal || 0)) + '" class="woe-num">' + escHtml(sysVal != null ? fmtPrice(sysVal) : '—') + '</td>' +
        '<td data-col="dec" data-sortval="' + escHtml(String(record.decimals || 0)) + '" class="woe-num">' + escHtml(record.decimals != null ? String(record.decimals) : '—') + '</td>' +
        '<td data-col="pairs" data-sortval="' + escHtml(String(pairCountVal || 0)) + '" class="woe-num">' + escHtml(pairCountVal != null ? String(pairCountVal) : '—') + '</td>' +
      '</tr>';
    }).join('');

    setHtml('woe-tokens-body', rows);
    setText('woe-tokens-count', tokensData.length + ' tokens');
    attachTokenSelectionLinks();
    attachTableSort('woe-table-tokens');
    attachTableFilter('woe-filter-tokens', 'woe-table-tokens');
  }

  /* ── Risk flags panel ────────────────────────────────────────── */

  function updateRiskFlags() {
    var tokensData = state.tokens;
    var tickersData = state.tickers;
    var pairIndex = state.pairIndex;
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
      var highSpread = tickersData.filter(function (ticker) {
        var bid = asNum(ticker.bid);
        var ask = asNum(ticker.ask);
        if (bid == null || ask == null || bid <= 0) return false;
        return ((ask - bid) / bid) > 0.1;
      });
      if (highSpread.length > 0) {
        flags.push({ level: 'warn', msg: highSpread.length + ' pair(s) have a spread > 10% (high slippage risk).' });
      }
      var bigDrop = tickersData.filter(function (ticker) {
        var change = asNum(ticker.change24 != null ? ticker.change24 : ticker.price_change_percent);
        return change != null && change < -20;
      });
      if (bigDrop.length > 0) {
        flags.push({ level: 'alert', msg: bigDrop.length + ' pair(s) dropped more than 20% in 24h.' });
      }
    }

    if (flags.length === 0) {
      flags.push({ level: 'ok', msg: 'No significant risk flags detected in current data.' });
    }

    var html = flags.map(function (flag) {
      return '<div class="woe-flag woe-flag-' + escHtml(flag.level) + '">' +
        '<span class="woe-flag-icon">' + (flag.level === 'alert' ? '⚠' : flag.level === 'warn' ? '◈' : flag.level === 'ok' ? '✓' : 'ℹ') + '</span>' +
        '<span>' + escHtml(flag.msg) + '</span>' +
      '</div>';
    }).join('');
    setHtml('woe-risk-flags', html);
  }

  /* ── Query-string token detail state ────────────────────────── */

  function getSelectionFromLocation() {
    var params = new URLSearchParams(window.location.search || '');
    var symbol = normalizeSymbol(params.get('token'));
    var contract = normalizeContract(params.get('contract'));
    return {
      symbol: symbol,
      contract: contract,
      key: tokenKey(contract, symbol),
    };
  }

  function pickDefaultSelection() {
    var requested = getSelectionFromLocation();
    if (requested.key && findTokenRecord(state.tokenMap, requested.contract, requested.symbol)) {
      return requested;
    }

    var firstWithPairs = state.tokens.find(function (tok) {
      var key = tokenKey(tok.contract, tok.symbol || tok.id);
      return key && state.pairIndex.tokenPairCounts[key];
    });
    var first = firstWithPairs || state.tokens[0];
    if (!first) return { symbol: '', contract: '', key: '' };
    var symbol = normalizeSymbol(first.symbol || first.id);
    var contract = normalizeContract(first.contract);
    return {
      symbol: symbol,
      contract: contract,
      key: tokenKey(contract, symbol),
    };
  }

  function updateSelectionUrl(selection, pushState) {
    if (!selection || !selection.key || !window.history || !window.location) return;
    var url = buildTokenHref(selection.symbol, selection.contract);
    var stateMethod = pushState && typeof window.history.pushState === 'function'
      ? 'pushState'
      : 'replaceState';
    if (typeof window.history[stateMethod] === 'function') {
      window.history[stateMethod]({}, '', url);
    }
  }

  function selectToken(symbol, contract, pushState) {
    var normalized = {
      symbol: normalizeSymbol(symbol),
      contract: normalizeContract(contract),
      key: tokenKey(contract, symbol),
    };
    if (!normalized.key) return;
    state.selected = normalized;
    updateSelectionUrl(normalized, pushState);
    renderTokens();
    renderSelectedToken();
    ensureSelectedTokenData();
  }

  /* ── Token detail analytics ─────────────────────────────────── */

  function marketContainsToken(market, selectionKey) {
    return market && (
      (market.tokenA && market.tokenA.key === selectionKey) ||
      (market.tokenB && market.tokenB.key === selectionKey)
    );
  }

  function getAllMarkets() {
    return state.alcorMarkets.concat(state.neftyMarkets);
  }

  function getSelectedTokenContext() {
    var selection = state.selected;
    var tokenRecord = findTokenRecord(state.tokenMap, selection.contract, selection.symbol) || {
      symbol: selection.symbol,
      contract: selection.contract,
      decimals: null,
      systemPrice: null,
      usdPrice: null,
    };
    var relevantMarkets = getAllMarkets().filter(function (market) {
      return marketContainsToken(market, selection.key);
    }).sort(function (a, b) {
      return (b.rankMetric || 0) - (a.rankMetric || 0);
    });

    var alcorMarkets = relevantMarkets.filter(function (market) {
      return market.adapter === 'alcor';
    });

    var primaryAlcorMarket = alcorMarkets[0] || null;
    var primaryVolumeMarket = alcorMarkets.find(function (market) {
      return market.tokenA && market.tokenA.key === selection.key && market.volume24 != null;
    }) || null;

    var tokenLockedAmount = 0;
    var hasTokenLockedAmount = false;
    relevantMarkets.forEach(function (market) {
      if (market.tokenA && market.tokenA.key === selection.key && market.tokenA.amount != null) {
        tokenLockedAmount += market.tokenA.amount;
        hasTokenLockedAmount = true;
      }
      if (market.tokenB && market.tokenB.key === selection.key && market.tokenB.amount != null) {
        tokenLockedAmount += market.tokenB.amount;
        hasTokenLockedAmount = true;
      }
    });

    var pairLiquidityWax = sumMetric(relevantMarkets, 'liquidityWax');
    var pairLiquidityUsd = sumMetric(relevantMarkets, 'liquidityUsd');
    var tokenTvlWax = hasTokenLockedAmount && tokenRecord.systemPrice != null
      ? tokenLockedAmount * tokenRecord.systemPrice
      : null;
    var tokenTvlUsd = hasTokenLockedAmount && tokenRecord.usdPrice != null
      ? tokenLockedAmount * tokenRecord.usdPrice
      : null;

    return {
      selection: selection,
      token: tokenRecord,
      markets: relevantMarkets,
      primaryAlcorMarket: primaryAlcorMarket,
      primaryVolumeMarket: primaryVolumeMarket,
      pairLiquidityWax: pairLiquidityWax,
      pairLiquidityUsd: pairLiquidityUsd,
      tokenTvlWax: tokenTvlWax,
      tokenTvlUsd: tokenTvlUsd,
    };
  }

  function parseChainStat(statRow) {
    if (!statRow) return null;
    return {
      supply: parseAsset(statRow.supply),
      maxSupply: parseAsset(statRow.max_supply),
      issuer: statRow.issuer || '',
    };
  }

  function ensureSelectedChainStat(selection) {
    if (!selection || !selection.key || hasOwn(state.chainStatCache, selection.key) || state.chainStatPending[selection.key]) {
      return;
    }
    state.chainStatPending[selection.key] = true;
    var paths = window.WAXONEDGE_RPC_PATHS || {};
    var tableRowsPath = paths.getTableRows || '/v1/chain/get_table_rows';
    rpcPost(tableRowsPath, {
      code: selection.contract,
      scope: selection.symbol,
      table: 'stat',
      json: true,
      limit: 1,
    }).then(function (data) {
      state.chainStatCache[selection.key] = parseChainStat(data && data.rows && data.rows[0]);
      delete state.chainStatPending[selection.key];
      if (state.selected.key === selection.key) renderSelectedToken();
    });
  }

  function normalizeCandles(data) {
    var candles = [];

    function add(time, open, high, low, close, volume) {
      var ts = asNum(time);
      var c = asNum(close);
      if (ts == null || c == null) return;
      candles.push({
        time: ts,
        open: asNum(open),
        high: asNum(high),
        low: asNum(low),
        close: c,
        volume: asNum(volume),
      });
    }

    if (Array.isArray(data)) {
      data.forEach(function (item) {
        if (Array.isArray(item)) {
          add(item[0], item[1], item[2], item[3], item[4], item[5]);
        } else if (item && typeof item === 'object') {
          add(
            item.time || item.t || item.timestamp,
            item.open || item.o,
            item.high || item.h,
            item.low || item.l,
            item.close || item.c,
            item.volume || item.v
          );
        }
      });
    } else if (data && Array.isArray(data.bars)) {
      data.bars.forEach(function (bar) {
        add(bar.time || bar.t, bar.open || bar.o, bar.high || bar.h, bar.low || bar.l, bar.close || bar.c, bar.volume || bar.v);
      });
    } else if (data && Array.isArray(data.t)) {
      for (var i = 0; i < data.t.length; i++) {
        add(data.t[i], data.o && data.o[i], data.h && data.h[i], data.l && data.l[i], data.c && data.c[i], data.v && data.v[i]);
      }
    }

    return candles.sort(function (a, b) { return a.time - b.time; });
  }

  function loadChartData(marketId) {
    if (!marketId) return Promise.resolve(null);
    if (hasOwn(state.chartCache, marketId)) return Promise.resolve(state.chartCache[marketId]);
    if (state.chartPending[marketId]) return Promise.resolve(null);

    state.chartPending[marketId] = true;
    var alcorApi = window.WAXONEDGE_ALCOR_API || 'https://wax.alcor.exchange/api/v2';
    var paths = window.WAXONEDGE_ALCOR_PATHS || {};
    var marketsBase = paths.markets || '/markets';
    var to = Date.now();
    var from = to - (30 * 24 * 60 * 60 * 1000);
    var chartUrl = alcorApi + marketsBase + '/' + encodeURIComponent(marketId) + '/charts' +
      '?resolution=1D&from=' + String(from) + '&to=' + String(to);

    return apiFetch(chartUrl, 12000).then(function (data) {
      var candles = normalizeCandles(data);
      state.chartCache[marketId] = {
        marketId: marketId,
        candles: candles,
      };
      delete state.chartPending[marketId];
      return state.chartCache[marketId];
    }).catch(function () {
      delete state.chartPending[marketId];
      state.chartCache[marketId] = null;
      return null;
    });
  }

  function computeHistoricalVolumes(chartBundle) {
    if (!chartBundle || !Array.isArray(chartBundle.candles) || chartBundle.candles.length === 0) {
      return null;
    }
    var candles = chartBundle.candles;
    var lastTime = candles[candles.length - 1].time;
    var sevenCutoff = lastTime - (7 * 24 * 60 * 60 * 1000);
    var thirtyCutoff = lastTime - (30 * 24 * 60 * 60 * 1000);
    var volumes = {
      last24: null,
      sevenDay: null,
      thirtyDay: null,
    };
    var seven = 0;
    var thirty = 0;
    var hasSeven = false;
    var hasThirty = false;
    candles.forEach(function (candle) {
      if (candle.volume == null) return;
      if (candle.time >= sevenCutoff) {
        seven += candle.volume;
        hasSeven = true;
      }
      if (candle.time >= thirtyCutoff) {
        thirty += candle.volume;
        hasThirty = true;
      }
    });
    volumes.last24 = candles[candles.length - 1].volume;
    volumes.sevenDay = hasSeven ? seven : null;
    volumes.thirtyDay = hasThirty ? thirty : null;
    return volumes;
  }

  function renderTokenSummary(context) {
    var token = context.token;
    var summaryHtml = '<h2 class="woe-token-summary-title">' + escHtml(token.symbol || context.selection.symbol || 'Token') + '</h2>' +
      '<p class="woe-token-summary-subtitle">' +
        'Static analytics detail for <code>' + escHtml(token.contract || context.selection.contract || 'unknown-contract') + '</code>. ' +
        'Click another token in the scanner or share this state with <code>?token=</code> + <code>&amp;contract=</code>.' +
      '</p>';
    setHtml('woe-token-summary', summaryHtml);
    setText('woe-detail-status', context.selection.symbol + ' @ ' + context.selection.contract);

    var metaParts = [];
    if (context.markets.length > 0) {
      metaParts.push(context.markets.length + ' indexed pool/pair row(s)');
    } else {
      metaParts.push('No indexed pool/pair rows detected');
    }
    if (context.primaryAlcorMarket && context.primaryAlcorMarket.marketId) {
      metaParts.push('Primary Alcor market #' + context.primaryAlcorMarket.marketId);
    }
    setText('woe-detail-meta', metaParts.join(' · '));
  }

  function renderTokenStats(context) {
    var token = context.token;
    var selection = context.selection;
    var chainStat = state.chainStatCache[selection.key] || null;
    var supply = chainStat && chainStat.supply ? chainStat.supply : null;
    var maxSupply = chainStat && chainStat.maxSupply ? chainStat.maxSupply : null;
    var chartBundle = context.primaryAlcorMarket ? state.chartCache[context.primaryAlcorMarket.marketId] : null;
    var historicalVolumes = computeHistoricalVolumes(chartBundle);
    var canUsePrimaryVolume = context.primaryVolumeMarket && context.primaryVolumeMarket.tokenA && context.primaryVolumeMarket.tokenA.key === selection.key;
    var currentPriceWax = token.systemPrice;
    var currentPriceUsd = token.usdPrice;
    var marketCapWax = supply && supply.amount != null && currentPriceWax != null
      ? supply.amount * currentPriceWax
      : null;
    var marketCapUsd = supply && supply.amount != null && currentPriceUsd != null
      ? supply.amount * currentPriceUsd
      : null;
    var fdvWax = maxSupply && maxSupply.amount != null && currentPriceWax != null
      ? maxSupply.amount * currentPriceWax
      : null;
    var fdvUsd = maxSupply && maxSupply.amount != null && currentPriceUsd != null
      ? maxSupply.amount * currentPriceUsd
      : null;

    function statRow(label, value, options) {
      var valueClass = options && options.muted ? ' woe-stat-muted' : '';
      return '<div class="woe-stat-row">' +
        '<div class="woe-stat-label">' + escHtml(label) + '</div>' +
        '<div class="woe-stat-value' + valueClass + '">' + value + '</div>' +
      '</div>';
    }

    var statsHtml = '';
    statsHtml += statRow('Token', escHtml(selection.symbol + ' @ ' + selection.contract));
    statsHtml += statRow('Holder count', availabilityHtml(INDEXED_BACKEND_TEXT), { muted: true });
    statsHtml += statRow('Decimals', token.decimals != null ? escHtml(String(token.decimals)) : availabilityHtml());
    statsHtml += statRow('Total token supply', supply && supply.raw ? escHtml(supply.raw) : availabilityHtml());
    statsHtml += statRow('Circulating supply', availabilityHtml(INDEXED_BACKEND_TEXT), { muted: true });
    statsHtml += statRow('TVL', context.tokenTvlWax != null || context.tokenTvlUsd != null
      ? escHtml(formatDualMetric(context.tokenTvlWax, context.tokenTvlUsd))
      : availabilityHtml());
    statsHtml += statRow('Cumulated pair liquidity', context.pairLiquidityWax != null || context.pairLiquidityUsd != null
      ? escHtml(formatDualMetric(context.pairLiquidityWax, context.pairLiquidityUsd))
      : availabilityHtml());
    statsHtml += statRow('Current price in WAX and USD', currentPriceWax != null || currentPriceUsd != null
      ? escHtml(formatDualMetric(currentPriceWax, currentPriceUsd, 'WAX', '$'))
      : availabilityHtml());
    statsHtml += statRow('24h price change', context.primaryAlcorMarket && context.primaryAlcorMarket.change24 != null
      ? '<span class="' + escHtml(pctClass(context.primaryAlcorMarket.change24)) + '">' + escHtml(fmtPct(context.primaryAlcorMarket.change24)) + '</span>'
      : availabilityHtml());
    statsHtml += statRow('24h volume', canUsePrimaryVolume && context.primaryVolumeMarket.volume24 != null
      ? escHtml(context.primaryVolumeMarket.volume24Text)
      : availabilityHtml());
    statsHtml += statRow('7d volume', canUsePrimaryVolume && historicalVolumes && historicalVolumes.sevenDay != null
      ? escHtml(fmtNum(historicalVolumes.sevenDay) + ' ' + selection.symbol)
      : availabilityHtml());
    statsHtml += statRow('30d volume', canUsePrimaryVolume && historicalVolumes && historicalVolumes.thirtyDay != null
      ? escHtml(fmtNum(historicalVolumes.thirtyDay) + ' ' + selection.symbol)
      : availabilityHtml());
    statsHtml += statRow('Market cap', marketCapWax != null || marketCapUsd != null
      ? escHtml(formatDualMetric(marketCapWax, marketCapUsd)) + '<br><span class="woe-unavailable">Issued supply basis</span>'
      : availabilityHtml());
    statsHtml += statRow('Fully diluted valuation', fdvWax != null || fdvUsd != null
      ? escHtml(formatDualMetric(fdvWax, fdvUsd))
      : availabilityHtml());

    setHtml('woe-token-stats', statsHtml);
  }

  function renderChart(context) {
    var market = context.primaryAlcorMarket;
    if (!market || !market.marketId) {
      setHtml('woe-chart-panel',
        '<div class="woe-chart-empty">No Alcor market is available for this token yet, so a chart cannot be rendered.</div>');
      setText('woe-chart-meta', 'Primary Alcor market candles when available');
      return;
    }

    if (state.chartPending[market.marketId] && !hasOwn(state.chartCache, market.marketId)) {
      setHtml('woe-chart-panel', '<p class="woe-loading">Loading Alcor chart candles for market #' + escHtml(market.marketId) + '…</p>');
      setText('woe-chart-meta', 'Fetching /markets/' + market.marketId + '/charts');
      return;
    }

    var bundle = state.chartCache[market.marketId];
    if (!bundle || !Array.isArray(bundle.candles) || bundle.candles.length === 0) {
      setHtml('woe-chart-panel',
        '<div class="woe-chart-empty">Alcor chart candles are unavailable for market #' + escHtml(market.marketId) + '. No fake chart is shown.</div>');
      setText('woe-chart-meta', 'Alcor chart unavailable');
      return;
    }

    var candles = bundle.candles.slice(-30);
    var width = 760;
    var height = 320;
    var leftPad = 44;
    var rightPad = 12;
    var topPad = 12;
    var bottomPad = 70;
    var plotWidth = width - leftPad - rightPad;
    var plotHeight = height - topPad - bottomPad;
    var volumeHeight = 52;
    var closes = candles.map(function (c) { return c.close; });
    var highs = candles.map(function (c) { return c.high != null ? c.high : c.close; });
    var lows = candles.map(function (c) { return c.low != null ? c.low : c.close; });
    var minPrice = Math.min.apply(null, lows);
    var maxPrice = Math.max.apply(null, highs);
    var priceRange = Math.max(maxPrice - minPrice, 0.0000001);
    var maxVolume = Math.max.apply(null, candles.map(function (c) { return c.volume || 0; }).concat([1]));
    var step = candles.length > 1 ? plotWidth / (candles.length - 1) : plotWidth;

    function xAt(index) {
      return leftPad + (step * index);
    }

    function yAt(price) {
      return topPad + ((maxPrice - price) / priceRange) * plotHeight;
    }

    var points = candles.map(function (candle, index) {
      return xAt(index).toFixed(2) + ',' + yAt(candle.close).toFixed(2);
    }).join(' ');
    var areaPath = candles.map(function (candle, index) {
      return (index === 0 ? 'M' : 'L') + xAt(index).toFixed(2) + ' ' + yAt(candle.close).toFixed(2);
    }).join(' ') +
      ' L ' + xAt(candles.length - 1).toFixed(2) + ' ' + (topPad + plotHeight).toFixed(2) +
      ' L ' + xAt(0).toFixed(2) + ' ' + (topPad + plotHeight).toFixed(2) + ' Z';

    var gridLines = [0, 0.25, 0.5, 0.75, 1].map(function (ratio) {
      var y = topPad + (plotHeight * ratio);
      return '<line class="woe-chart-grid" x1="' + leftPad + '" y1="' + y.toFixed(2) + '" x2="' + (width - rightPad) + '" y2="' + y.toFixed(2) + '"></line>';
    }).join('');

    var priceLabels = [maxPrice, maxPrice - (priceRange / 2), minPrice].map(function (price, index) {
      var y = index === 0 ? topPad + 4 : index === 1 ? topPad + (plotHeight / 2) : topPad + plotHeight;
      return '<text class="woe-chart-axis" x="' + (width - rightPad) + '" y="' + y.toFixed(2) + '" text-anchor="end">' + escHtml(fmtPrice(price)) + '</text>';
    }).join('');

    var xLabels = [
      { x: leftPad, label: fmtDate(candles[0].time) },
      { x: leftPad + (plotWidth / 2), label: fmtDate(candles[Math.floor(candles.length / 2)].time) },
      { x: width - rightPad, label: fmtDate(candles[candles.length - 1].time) },
    ].map(function (entry) {
      return '<text class="woe-chart-axis" x="' + entry.x.toFixed(2) + '" y="' + (height - 18) + '" text-anchor="middle">' + escHtml(entry.label) + '</text>';
    }).join('');

    var barWidth = Math.max(4, Math.floor(plotWidth / Math.max(candles.length, 12)) - 2);
    var bars = candles.map(function (candle, index) {
      var volume = candle.volume || 0;
      var barHeight = Math.max(2, (volume / maxVolume) * volumeHeight);
      var barY = topPad + plotHeight + 10 + (volumeHeight - barHeight);
      var cls = candle.open != null && candle.close < candle.open ? 'woe-chart-bar-down' : '';
      return '<rect class="woe-chart-bar ' + cls + '" x="' + (xAt(index) - (barWidth / 2)).toFixed(2) + '" y="' + barY.toFixed(2) + '"' +
        ' width="' + barWidth + '" height="' + barHeight.toFixed(2) + '"></rect>';
    }).join('');

    var historicalVolumes = computeHistoricalVolumes(bundle);
    var summaryHtml = '<div class="woe-chart-summary">' +
      '<span><strong>Market:</strong> #' + escHtml(market.marketId) + ' (' + escHtml(describeToken(market.tokenA)) + ' / ' + escHtml(describeToken(market.tokenB)) + ')</span>' +
      '<span><strong>Last:</strong> ' + escHtml(market.currentPriceText) + '</span>' +
      '<span><strong>24h change:</strong> <span class="' + escHtml(pctClass(market.change24)) + '">' + escHtml(market.change24 != null ? fmtPct(market.change24) : UNAVAILABLE_TEXT) + '</span></span>' +
      '<span><strong>30d candles:</strong> ' + escHtml(String(candles.length)) + '</span>' +
      '<span><strong>7d volume:</strong> ' + escHtml(historicalVolumes && historicalVolumes.sevenDay != null ? fmtNum(historicalVolumes.sevenDay) + ' ' + (market.tokenA.symbol || '') : UNAVAILABLE_TEXT) + '</span>' +
    '</div>';

    var svgHtml = '<svg class="woe-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="30 day token price chart">' +
      gridLines +
      '<path class="woe-chart-price-fill" d="' + areaPath + '"></path>' +
      '<polyline class="woe-chart-price-line" points="' + points + '"></polyline>' +
      bars +
      priceLabels +
      xLabels +
    '</svg>';

    setHtml('woe-chart-panel', summaryHtml + svgHtml);
    setText('woe-chart-meta', 'Alcor /markets/' + market.marketId + '/charts · 30 day window');
  }

  function renderMatrix(context) {
    var rows = context.markets;
    var matrixMeta = [];
    matrixMeta.push('Adapters active: Alcor + swap.nefty');
    if (state.neftyDetectedTables.length > 0) {
      matrixMeta.push('swap.nefty ABI tables: ' + state.neftyDetectedTables.join(', '));
    } else {
      matrixMeta.push('swap.nefty ABI tables unavailable');
    }
    if (state.neftyTableUsed) {
      matrixMeta.push('reading table: ' + state.neftyTableUsed);
    }
    setText('woe-matrix-meta', matrixMeta.join(' · '));

    if (!rows || rows.length === 0) {
      setHtml('woe-matrix-body',
        '<tr><td colspan="14" class="woe-loading woe-warn">No indexed pools or pairs were detected for this token across the active read-only adapters.</td></tr>');
      setText('woe-matrix-count', '0 rows');
      return;
    }

    var html = rows.map(function (market, index) {
      var changeClass = pctClass(market.change24);
      var liquiditySort = market.liquidityUsd != null ? market.liquidityUsd : (market.liquidityWax != null ? market.liquidityWax : 0);
      return '<tr>' +
        '<td data-col="rank" data-sortval="' + escHtml(String(index + 1)) + '" class="woe-num">' + escHtml(String(index + 1)) + '</td>' +
        '<td data-col="source">' + escHtml(market.source) + '<br><span class="woe-unavailable">' + escHtml(market.sourceMeta) + '</span></td>' +
        '<td data-col="fee">' + (market.feeTier === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.feeTier)) + '</td>' +
        '<td data-col="tokenA">' + escHtml(describeToken(market.tokenA)) + '</td>' +
        '<td data-col="tokenB">' + escHtml(describeToken(market.tokenB)) + '</td>' +
        '<td data-col="liq" data-sortval="' + escHtml(String(liquiditySort || 0)) + '" class="woe-num">' + (market.liquidityText === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.liquidityText)) + '</td>' +
        '<td data-col="price" data-sortval="' + escHtml(String(market.currentPrice || 0)) + '" class="woe-num">' + (market.currentPriceText === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.currentPriceText)) + '</td>' +
        '<td data-col="chg" data-sortval="' + escHtml(String(market.change24 || 0)) + '" class="woe-num ' + changeClass + '">' + (market.change24 != null ? escHtml(fmtPct(market.change24)) : availabilityHtml()) + '</td>' +
        '<td data-col="vol24" data-sortval="' + escHtml(String(market.volume24 || 0)) + '" class="woe-num">' + (market.volume24Text === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.volume24Text)) + '</td>' +
        '<td data-col="vol7">' + (market.volume7dText === UNAVAILABLE_TEXT || market.volume7dText === INDEXED_BACKEND_TEXT ? availabilityHtml(market.volume7dText) : escHtml(market.volume7dText)) + '</td>' +
        '<td data-col="vol30">' + (market.volume30dText === UNAVAILABLE_TEXT || market.volume30dText === INDEXED_BACKEND_TEXT ? availabilityHtml(market.volume30dText) : escHtml(market.volume30dText)) + '</td>' +
        '<td data-col="poolA">' + (market.pooledTokenAText === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.pooledTokenAText)) + '</td>' +
        '<td data-col="poolB">' + (market.pooledTokenBText === UNAVAILABLE_TEXT ? availabilityHtml() : escHtml(market.pooledTokenBText)) + '</td>' +
        '<td><a href="' + escHtml(market.explorerUrl) + '" target="_blank" rel="noopener noreferrer" class="woe-chain-link">' + escHtml(market.explorerLabel) + '</a></td>' +
      '</tr>';
    }).join('');

    setHtml('woe-matrix-body', html);
    setText('woe-matrix-count', rows.length + ' row(s)');
    attachTableSort('woe-table-matrix');
    attachTableFilter('woe-filter-matrix', 'woe-table-matrix');
  }

  function renderSelectedToken() {
    if (!state.selected.key) {
      setHtml('woe-token-summary', '<p class="woe-loading">No token selected.</p>');
      setHtml('woe-token-stats', '<div class="woe-loading">Select a token from the scanner to load analytics.</div>');
      setHtml('woe-chart-panel', '<p class="woe-loading">Select a token to load chart data.</p>');
      setHtml('woe-matrix-body', '<tr><td colspan="14" class="woe-loading">Select a token to inspect its indexed pools and pairs.</td></tr>');
      return;
    }

    var context = getSelectedTokenContext();
    renderTokenSummary(context);
    renderTokenStats(context);
    renderChart(context);
    renderMatrix(context);
  }

  function ensureSelectedTokenData() {
    if (!state.selected.key) return;
    var context = getSelectedTokenContext();
    ensureSelectedChainStat(context.selection);
    if (context.primaryAlcorMarket && context.primaryAlcorMarket.marketId) {
      loadChartData(context.primaryAlcorMarket.marketId).then(function () {
        if (state.selected.key === context.selection.key) renderSelectedToken();
      });
    }
  }

  /* ── Account token balance lookup ───────────────────────────── */

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
    if (!btn || btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
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
            'Account token balance lookup requires Hyperion v2 support from the chosen endpoint.</p>');
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

  /* ── Boot ───────────────────────────────────────────────────── */

  function boot() {
    renderSourceCards();
    pingAllSources();
    attachGlobalSearch();
    renderHolderPlaceholder();
    attachTableSort('woe-table-tokens');
    attachTableSort('woe-table-matrix');
    attachTableFilter('woe-filter-tokens', 'woe-table-tokens');
    attachTableFilter('woe-filter-matrix', 'woe-table-matrix');

    var alcorApi = window.WAXONEDGE_ALCOR_API || 'https://wax.alcor.exchange/api/v2';
    var alcorPaths = window.WAXONEDGE_ALCOR_PATHS || {};
    var tokenUrl = alcorApi + (alcorPaths.tokens || '/tokens');
    var pairsUrl = alcorApi + (alcorPaths.pairs || '/pairs');
    var tickerUrl = alcorApi + (alcorPaths.tickers || '/tickers');

    Promise.all([
      apiFetch(tokenUrl),
      apiFetch(pairsUrl),
      apiFetch(tickerUrl),
      loadNeftyAdapter(),
    ]).then(function (results) {
      state.tokens = Array.isArray(results[0]) ? results[0] : [];
      state.pairs = Array.isArray(results[1]) ? results[1] : [];
      state.tickers = Array.isArray(results[2]) ? results[2] : [];
      state.neftyMarkets = Array.isArray(results[3]) ? results[3] : [];
      state.tokenMap = buildTokenMap(state.tokens);
      state.pairIndex = buildPairIndex(state.pairs);
      state.alcorMarkets = buildAlcorMarkets(state.pairs, state.tickers);

      updateRiskFlags();
      var initialSelection = pickDefaultSelection();
      renderTokens();
      if (initialSelection.key) {
        state.selected = initialSelection;
      }
      renderSelectedToken();
      ensureSelectedTokenData();
    });

    window.addEventListener('popstate', function () {
      var selection = getSelectionFromLocation();
      if (!selection.key) return;
      state.selected = selection;
      renderTokens();
      renderSelectedToken();
      ensureSelectedTokenData();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());

(function () {
  'use strict';

  var WAXCASH = { contract: 'graffitiking', symbol: 'WAXCASH' };
  var WAXCASH_GRAPH_ENDPOINT = '/api/waxonedge/waxcash-graph';
  var board = document.getElementById('wxcash-board');
  var stats = document.getElementById('wxcash-stats');
  var search = document.getElementById('wxcash-search');
  var liveDot = document.getElementById('wxcash-live-dot');
  var liveText = document.getElementById('wxcash-live-text');
  var updated = document.getElementById('wxcash-last-updated');
  var waxPrice = document.getElementById('wxcash-wax-price');
  var metric = 'liquidity';
  var state = { root: WAXCASH, edges: [], nodes: [], selected: null };

  function safeText(value) {
    return value == null ? '' : String(value).trim();
  }

  function normalizeSymbol(value) {
    return safeText(value).toUpperCase();
  }

  function normalizeContract(value) {
    return safeText(value).toLowerCase();
  }

  function tokenKey(contract, symbol) {
    var c = normalizeContract(contract);
    var s = normalizeSymbol(symbol);
    return c && s ? c + '::' + s : '';
  }

  function tokenRefFromKey(value) {
    var parts = safeText(value).split('::');
    if (parts.length !== 2) return null;
    var contract = normalizeContract(parts[0]);
    var symbol = normalizeSymbol(parts[1]);
    return contract && symbol ? { contract: contract, symbol: symbol, key: tokenKey(contract, symbol) } : null;
  }

  function isWaxcash(contract, symbol) {
    return tokenKey(contract, symbol) === tokenKey(WAXCASH.contract, WAXCASH.symbol);
  }

  function asNumber(value) {
    var n = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  function firstValue(records, names) {
    for (var recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
      var record = records[recordIndex];
      if (!record || typeof record !== 'object') continue;
      for (var nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
        var name = names[nameIndex];
        if (record[name] != null) return record[name];
        if (record.metrics && record.metrics[name] != null) return record.metrics[name];
      }
    }
    return null;
  }

  function firstNumber(records, names) {
    var value = firstValue(records, names);
    return value == null ? null : asNumber(value);
  }

  function suffixFor(records, waxKey) {
    return firstNumber(records, [waxKey]) != null ? ' WAX' : ' USD';
  }

  function formatCompact(value, suffix) {
    var n = asNumber(value);
    if (n == null) return '--';
    var abs = Math.abs(n);
    var out;
    if (abs >= 1e9) out = (n / 1e9).toFixed(3).replace(/\.0+$/, '') + 'B';
    else if (abs >= 1e6) out = (n / 1e6).toFixed(3).replace(/\.0+$/, '') + 'M';
    else if (abs >= 1e3) out = (n / 1e3).toFixed(3).replace(/\.0+$/, '') + 'K';
    else if (abs >= 1) out = n.toFixed(3).replace(/\.0+$/, '');
    else out = n.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '');
    return out + (suffix || '');
  }

  function metricValue(node, edge) {
    var records = [node, node && node.token, edge];
    if (metric === 'volume') return firstNumber(records, ['volume_24h_wax', 'volume_24h_usd']);
    if (metric === 'price') return firstNumber(records, ['selected_price_wax', 'selected_price_usd']);
    if (metric === 'mcap') return firstNumber(records, ['market_cap_wax', 'market_cap_usd']);
    return firstNumber(records, ['liquidity_wax', 'liquidity_usd']);
  }

  function metricSuffix(node, edge) {
    var records = [node, node && node.token, edge];
    if (metric === 'volume') return suffixFor(records, 'volume_24h_wax');
    if (metric === 'price') return suffixFor(records, 'selected_price_wax');
    if (metric === 'mcap') return suffixFor(records, 'market_cap_wax');
    return suffixFor(records, 'liquidity_wax');
  }

  function radiusFor(value) {
    var n = Math.max(0, asNumber(value) || 0);
    if (!n) return 42;
    return Math.max(44, Math.min(128, 34 + Math.log10(n + 1) * 18));
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchJson(path) {
    var response = await fetch(path, { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('WaxOnEdge API ' + response.status);
    return response.json();
  }

  function normalizeRoot(root) {
    var contract = normalizeContract(root && (root.contract || root.token_contract)) || WAXCASH.contract;
    var symbol = normalizeSymbol(root && (root.symbol || root.token_symbol)) || WAXCASH.symbol;
    var key = safeText(root && (root.key || root.id || root.token_key)) || tokenKey(contract, symbol);
    return {
      key: key,
      contract: contract,
      symbol: symbol,
      links: root && root.links && typeof root.links === 'object' ? root.links : {},
      analytics_links: root && root.analytics_links && typeof root.analytics_links === 'object' ? root.analytics_links : {},
    };
  }

  function normalizeGraphNode(node) {
    var token = node && node.token && typeof node.token === 'object' ? node.token : node;
    var contract = normalizeContract(token && (token.contract || token.token_contract));
    var symbol = normalizeSymbol(token && (token.symbol || token.token_symbol));
    var key = safeText(node && (node.key || node.id || node.token_key)) || tokenKey(contract, symbol);
    if (!key || !contract || !symbol) return null;
    return Object.assign({}, node, {
      key: key,
      id: safeText(node && node.id) || key,
      token_key: safeText(node && node.token_key) || key,
      contract: contract,
      symbol: symbol,
      token: token || {},
      links: node && node.links && typeof node.links === 'object' ? node.links : {},
      analytics_links: node && node.analytics_links && typeof node.analytics_links === 'object' ? node.analytics_links : {},
      pairs: [],
    });
  }

  function edgeEndpointKey(edge, name) {
    var value = edge && edge[name];
    var ref = tokenRefFromKey(value);
    return ref ? ref.key : safeText(value);
  }

  function edgeNodeKey(edge, rootKey) {
    var sourceKey = edgeEndpointKey(edge, 'source');
    var targetKey = edgeEndpointKey(edge, 'target');
    if (sourceKey === rootKey && targetKey) return targetKey;
    if (targetKey === rootKey && sourceKey) return sourceKey;
    return '';
  }

  function edgeLink(edge) {
    if (!edge) return '';
    var links = edge.analytics_links || edge.links || {};
    return safeText(links.analytics || links.pair || links.detail || links.candles || links.explorer);
  }

  function tokenAnalyticsUrl(node) {
    if (node && node.links && node.links.analytics) return safeText(node.links.analytics);
    if (node && node.analytics_links && node.analytics_links.detail) return safeText(node.analytics_links.detail);
    return '/analytics/token/?token=' + encodeURIComponent(node.symbol) + '&contract=' + encodeURIComponent(node.contract);
  }

  function buildGraph(payload) {
    var data = payload && payload.data && typeof payload.data === 'object' ? payload.data : {};
    var root = normalizeRoot(data.root);
    var nodeMap = new Map();
    var rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
    var rawEdges = Array.isArray(data.edges) ? data.edges : [];

    rawNodes.forEach(function (rawNode) {
      var node = normalizeGraphNode(rawNode);
      if (!node || isWaxcash(node.contract, node.symbol)) return;
      nodeMap.set(node.key, node);
    });

    var edges = rawEdges.map(function (rawEdge) {
      var key = edgeNodeKey(rawEdge, root.key);
      if (!key || !nodeMap.has(key)) return null;
      return Object.assign({}, rawEdge, {
        key: safeText(rawEdge.key || rawEdge.id || rawEdge.pair_id || rawEdge.pair_key) || key,
        nodeKey: key,
        links: rawEdge.links && typeof rawEdge.links === 'object' ? rawEdge.links : {},
        analytics_links: rawEdge.analytics_links && typeof rawEdge.analytics_links === 'object' ? rawEdge.analytics_links : {},
      });
    }).filter(Boolean);

    edges.forEach(function (edge) {
      var node = nodeMap.get(edge.nodeKey);
      if (node) node.pairs.push(edge);
    });

    var nodes = Array.from(nodeMap.values()).map(function (node) {
      var bestPair = node.pairs.slice().sort(function (a, b) {
        return (firstNumber([b], ['liquidity_wax', 'liquidity_usd']) || 0) - (firstNumber([a], ['liquidity_wax', 'liquidity_usd']) || 0);
      })[0] || null;
      var value = metricValue(node, bestPair);
      return Object.assign(node, {
        bestPair: bestPair,
        value: value,
        radius: radiusFor(value),
      });
    }).filter(function (node) {
      return node.pairs.length > 0;
    });

    nodes.sort(function (a, b) {
      return (asNumber(b.value) || 0) - (asNumber(a.value) || 0) || a.symbol.localeCompare(b.symbol);
    });

    return {
      root: root,
      edges: edges,
      nodes: nodes,
      summary: data.summary || {},
      counts: data.counts || {},
      updated_at: data.updated_at || payload.updated_at || null,
      warnings: payload.warnings || [],
    };
  }

  function nodePosition(index, count, width, height) {
    var centerX = width / 2;
    var centerY = height / 2;
    var ring = Math.floor(index / 14);
    var ringIndex = index % 14;
    var ringCount = Math.min(14, count - ring * 14);
    var angle = (Math.PI * 2 * ringIndex / Math.max(1, ringCount)) - Math.PI / 2 + ring * 0.22;
    var radius = Math.min(width, height) * (0.24 + ring * 0.13);
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  }

  function visibleNodes() {
    var q = normalizeSymbol(search && search.value).toLowerCase();
    if (!q) return state.nodes;
    return state.nodes.filter(function (node) {
      return node.symbol.toLowerCase().includes(q) || node.contract.toLowerCase().includes(q);
    });
  }

  function render() {
    if (!board) return;
    var nodes = visibleNodes();
    var width = Math.max(900, board.clientWidth || 1200);
    var height = Math.max(620, board.clientHeight || 720);
    var centerX = width / 2;
    var centerY = height / 2;
    var positions = nodes.map(function (_, index) {
      return nodePosition(index, nodes.length, width, height);
    });

    var edges = positions.map(function (pos) {
      return '<line x1="' + centerX.toFixed(1) + '" y1="' + centerY.toFixed(1) + '" x2="' + pos.x.toFixed(1) + '" y2="' + pos.y.toFixed(1) + '" />';
    }).join('');

    var bubbles = nodes.map(function (node, index) {
      var pos = positions[index];
      var r = node.radius;
      var selected = state.selected === node.key ? ' is-selected' : '';
      return '<button type="button" class="wxcash-node' + selected + '" data-key="' + escapeHtml(node.key) + '" style="left:' + (pos.x - r).toFixed(1) + 'px;top:' + (pos.y - r).toFixed(1) + 'px;width:' + (r * 2).toFixed(1) + 'px;height:' + (r * 2).toFixed(1) + 'px">' +
        '<strong>' + escapeHtml(node.symbol) + '</strong>' +
        '<span>' + escapeHtml(node.contract) + '</span>' +
        '<em>' + escapeHtml(formatCompact(node.value, metricSuffix(node, node.bestPair))) + '</em>' +
      '</button>';
    }).join('');

    board.innerHTML = '<style>' +
      '.page-waxcash-graph .woe-bubble-board{position:relative;min-height:720px;overflow:hidden;background:radial-gradient(circle at center,rgba(0,255,209,.14),rgba(5,10,18,.96) 42%,#03060c 100%)}' +
      '.wxcash-web{position:absolute;inset:0;width:100%;height:100%;opacity:.5}.wxcash-web line{stroke:rgba(0,255,209,.35);stroke-width:1.2;filter:drop-shadow(0 0 5px rgba(0,255,209,.5))}' +
      '.wxcash-core,.wxcash-node{position:absolute;border:1px solid rgba(0,255,209,.58);border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.22),rgba(0,255,209,.24) 20%,rgba(0,20,30,.88) 62%,rgba(0,0,0,.94));color:#fff;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:0 0 28px rgba(0,255,209,.22),inset 0 0 25px rgba(0,255,209,.2);cursor:pointer}' +
      '.wxcash-core{left:calc(50% - 95px);top:calc(50% - 95px);width:190px;height:190px;z-index:5;border-color:rgba(255,197,63,.8);box-shadow:0 0 54px rgba(255,197,63,.32),inset 0 0 32px rgba(255,197,63,.22)}' +
      '.wxcash-node{z-index:4;font:inherit;padding:8px;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.wxcash-node:hover,.wxcash-node.is-selected{transform:scale(1.08);border-color:#fff;box-shadow:0 0 46px rgba(0,255,209,.42),inset 0 0 30px rgba(0,255,209,.22)}' +
      '.wxcash-node strong,.wxcash-core strong{font-size:13px;color:#00ffd1}.wxcash-core strong{font-size:18px;color:#ffd75a}.wxcash-node span,.wxcash-core span{font-size:9px;color:rgba(255,255,255,.72)}.wxcash-node em,.wxcash-core em{font-size:10px;color:#fff;font-style:normal}' +
      '.wxcash-panel{position:absolute;right:18px;bottom:18px;z-index:8;width:min(460px,calc(100% - 36px));max-height:58%;overflow:auto;padding:18px;border:1px solid rgba(0,255,209,.36);border-radius:18px;background:rgba(3,8,14,.92);box-shadow:0 18px 55px rgba(0,0,0,.45)}.wxcash-panel h3{margin:0 0 8px;color:#00ffd1}.wxcash-panel dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.wxcash-panel dt{color:rgba(255,255,255,.55)}.wxcash-panel dd{margin:0;text-align:right;color:#fff}.wxcash-pair-row{padding:8px 0;border-top:1px solid rgba(255,255,255,.08);font-size:11px}.wxcash-link{color:#00ffd1;text-decoration:none}' +
    '</style>' +
    '<svg class="wxcash-web" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-hidden="true">' + edges + '</svg>' +
    '<button type="button" class="wxcash-core" data-core="true"><strong>' + escapeHtml(state.root.symbol) + '</strong><span>' + escapeHtml(state.root.contract) + '</span><em>ROOT NODE</em></button>' +
    bubbles +
    renderPanel();

    Array.prototype.forEach.call(board.querySelectorAll('.wxcash-node'), function (button) {
      button.addEventListener('click', function () {
        state.selected = button.getAttribute('data-key');
        render();
      });
    });
  }

  function renderMetric(records, waxKey, usdKey) {
    var waxValue = firstNumber(records, [waxKey]);
    var value = waxValue != null ? waxValue : firstNumber(records, [usdKey]);
    return formatCompact(value, waxValue != null ? ' WAX' : ' USD');
  }

  function renderPanel() {
    if (!state.selected) return '';
    var node = state.nodes.find(function (item) { return item.key === state.selected; });
    if (!node) return '';
    var token = node.token || {};
    var records = [node, token];
    var pairRows = node.pairs.slice(0, 12).map(function (pair) {
      var label = '<strong>' + escapeHtml(pair.dex_source || pair.source || 'indexed') + '</strong> pair ' + escapeHtml(pair.pair_id || pair.id || pair.key || '--');
      var pairUrl = edgeLink(pair);
      if (pairUrl) {
        label = '<a class="wxcash-link" href="' + escapeHtml(pairUrl) + '">' + label + '</a>';
      }
      return '<div class="wxcash-pair-row">' + label + '<br>Liquidity: ' + escapeHtml(renderMetric([pair], 'liquidity_wax', 'liquidity_usd')) + ' - Volume 24h: ' + escapeHtml(renderMetric([pair], 'volume_24h_wax', 'volume_24h_usd')) + '</div>';
    }).join('');
    return '<aside class="wxcash-panel">' +
      '<h3>' + escapeHtml(node.symbol) + ' / WAXCASH</h3>' +
      '<p>' + escapeHtml(node.contract) + ' - ' + escapeHtml(node.pairs.length) + ' indexed WAXCASH pair(s)</p>' +
      '<dl>' +
        '<dt>Price</dt><dd>' + escapeHtml(renderMetric(records, 'selected_price_wax', 'selected_price_usd')) + '</dd>' +
        '<dt>Liquidity</dt><dd>' + escapeHtml(renderMetric(records, 'liquidity_wax', 'liquidity_usd')) + '</dd>' +
        '<dt>24h Volume</dt><dd>' + escapeHtml(renderMetric(records, 'volume_24h_wax', 'volume_24h_usd')) + '</dd>' +
        '<dt>Market Cap</dt><dd>' + escapeHtml(renderMetric(records, 'market_cap_wax', 'market_cap_usd')) + '</dd>' +
      '</dl>' +
      '<a class="wxcash-link" href="' + escapeHtml(tokenAnalyticsUrl(node)) + '">Open full token analytics</a>' +
      pairRows +
    '</aside>';
  }

  function setStatus(ok, text) {
    if (liveDot) liveDot.className = 'woe-ab-live-dot ' + (ok ? 'is-live' : 'is-waiting');
    if (liveText) liveText.textContent = text;
  }

  function updateStats(graph) {
    if (waxPrice && graph.summary && graph.summary.wax_price_usd != null) waxPrice.textContent = '$ ' + formatCompact(graph.summary.wax_price_usd);
    if (updated) updated.textContent = graph.updated_at ? 'Updated ' + graph.updated_at : 'Indexed snapshot';
    if (stats) {
      stats.textContent = 'WAXCASH graph: ' + graph.nodes.length + ' direct paired tokens - ' + graph.edges.length + ' WAXCASH pair edges - metric: ' + metric;
    }
  }

  async function load() {
    if (!board) return;
    setStatus(false, 'CONNECTING');
    try {
      var graph = await fetchJson(WAXCASH_GRAPH_ENDPOINT);
      console.log('waxcash graph', graph);
      console.log('node count', graph.data?.nodes?.length);
      console.log('edge count', graph.data?.edges?.length);
      var renderedGraph = buildGraph(graph);
      state.root = renderedGraph.root;
      state.edges = renderedGraph.edges;
      state.nodes = renderedGraph.nodes;
      updateStats(renderedGraph);
      setStatus(true, 'INDEXED');
      render();
    } catch (error) {
      setStatus(false, 'ERROR');
      board.innerHTML = '<p class="woe-loading">WAXCASH graph unavailable: ' + escapeHtml(error.message || error) + '</p>';
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-wxcash-metric]'), function (button) {
    button.addEventListener('click', function () {
      metric = button.getAttribute('data-wxcash-metric') || 'liquidity';
      Array.prototype.forEach.call(document.querySelectorAll('[data-wxcash-metric]'), function (other) {
        other.classList.toggle('is-active', other === button);
      });
      state.nodes.forEach(function (node) {
        node.value = metricValue(node, node.bestPair || {});
        node.radius = radiusFor(node.value);
      });
      render();
      if (stats) stats.textContent = 'WAXCASH graph: ' + visibleNodes().length + ' visible tokens - metric: ' + metric;
    });
  });

  if (search) search.addEventListener('input', render);
  window.addEventListener('resize', function () { window.clearTimeout(state.resizeTimer); state.resizeTimer = window.setTimeout(render, 120); });
  load();
}());

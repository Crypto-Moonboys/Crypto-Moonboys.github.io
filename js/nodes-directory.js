(function () {
  'use strict';

  var PAGE_SIZE = 48;
  var state = { offset: 0, total: 0, loading: false, categoriesLoaded: false };
  var els = {};

  function apiBase() {
    if (window.MOONBOYS_API && typeof window.MOONBOYS_API.getApiBase === 'function') {
      return window.MOONBOYS_API.getApiBase() || '';
    }
    return window.MOONBOYS_API && window.MOONBOYS_API.BASE_URL ? window.MOONBOYS_API.BASE_URL : '';
  }

  function money(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    if (Math.abs(n) >= 1) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return '$' + n.toLocaleString(undefined, { maximumSignificantDigits: 5 });
  }

  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function statusLabel(status) {
    return String(status || 'unknown').replace(/_/g, ' ');
  }

  function card(node) {
    var website = node.links && node.links.website;
    var external = website ? '<a class="node-action secondary" target="_blank" rel="noopener noreferrer" href="' + escapeText(website) + '">Official site</a>' : '';
    var ticker = node.token && node.token.ticker && node.token.ticker !== 'N/A' ? node.token.ticker : '';
    return '<article class="node-card" data-status="' + escapeText(node.status) + '">' +
      '<div class="node-card-top"><div><p class="node-category">' + escapeText(node.category) + '</p>' +
      '<h2>' + escapeText(node.name) + '</h2><p class="node-ticker">' + escapeText(ticker) + '</p></div>' +
      '<span class="node-status">' + escapeText(statusLabel(node.status)) + '</span></div>' +
      '<p class="node-type">' + escapeText(node.node_type) + '</p>' +
      '<dl class="node-market"><div><dt>Price</dt><dd>' + money(node.market && node.market.price_usd) + '</dd></div>' +
      '<div><dt>24h volume</dt><dd>' + money(node.market && node.market.volume_24h_usd) + '</dd></div>' +
      '<div><dt>Largest tracked spot market</dt><dd>' + escapeText((node.market && node.market.main_exchange) || '—') + '</dd></div></dl>' +
      '<p class="node-hardware"><strong>Hardware:</strong> ' + escapeText(node.hardware || 'See documentation') + '</p>' +
      '<p class="node-reward"><strong>Rewards:</strong> ' + escapeText(node.reward_type || 'See documentation') + '</p>' +
      '<div class="node-actions"><a class="node-action" href="' + escapeText(node.wiki_url) + '">Read wiki</a>' + external + '</div>' +
      '</article>';
  }

  function queryParams(reset) {
    if (reset) state.offset = 0;
    var p = new URLSearchParams();
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(state.offset));
    var q = els.search.value.trim();
    var category = els.category.value.trim();
    var status = els.status.value.trim();
    var hardware = els.hardware.value.trim();
    if (q) p.set('q', q);
    if (category) p.set('category', category);
    if (status) p.set('status', status);
    if (hardware) p.set('hardware', hardware);
    return p;
  }

  async function loadNodes(reset) {
    if (state.loading) return;
    state.loading = true;
    els.error.hidden = true;
    try {
      var base = apiBase();
      if (!base) throw new Error('Nodes API is not configured for this environment.');
      var response = await fetch(base + '/api/nodes?' + queryParams(reset).toString(), { credentials: 'omit' });
      if (!response.ok) throw new Error('Nodes API returned HTTP ' + response.status + '.');
      var payload = await response.json();
      var nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      state.total = Number(payload.total || 0);
      if (reset) els.grid.innerHTML = '';
      els.grid.insertAdjacentHTML('beforeend', nodes.map(card).join(''));
      state.offset += nodes.length;
      els.more.hidden = state.offset >= state.total || nodes.length === 0;
      if (!state.total) els.grid.innerHTML = '<p class="nodes-empty">No systems match these filters.</p>';
      if (!state.categoriesLoaded && reset) populateCategories(nodes);
    } catch (error) {
      els.error.textContent = error.message || String(error);
      els.error.hidden = false;
      els.more.hidden = true;
    } finally {
      state.loading = false;
    }
  }

  function populateCategories(nodes) {
    var current = els.category.value;
    var categories = Array.from(new Set(nodes.map(function (node) { return node.category; }).filter(Boolean))).sort();
    categories.forEach(function (value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      els.category.appendChild(option);
    });
    els.category.value = current;
    state.categoriesLoaded = true;
  }

  async function loadMeta() {
    try {
      var base = apiBase();
      if (!base) return;
      var response = await fetch(base + '/api/nodes/meta', { credentials: 'omit' });
      if (!response.ok) return;
      var meta = await response.json();
      els.total.textContent = Number(meta.projects && meta.projects.total || 0).toLocaleString();
      els.marketFresh.textContent = Number(meta.market && meta.market.fresh || 0).toLocaleString();
      els.reviewCount.textContent = Number(meta.reviews && meta.reviews.open || 0).toLocaleString();
    } catch (_) {}
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  function init() {
    els.search = document.getElementById('nodes-search');
    els.category = document.getElementById('nodes-category');
    els.status = document.getElementById('nodes-status');
    els.hardware = document.getElementById('nodes-hardware');
    els.reset = document.getElementById('nodes-reset');
    els.grid = document.getElementById('nodes-grid');
    els.more = document.getElementById('nodes-more');
    els.error = document.getElementById('nodes-error');
    els.total = document.getElementById('nodes-total');
    els.marketFresh = document.getElementById('nodes-market-fresh');
    els.reviewCount = document.getElementById('nodes-review-count');

    var refresh = debounce(function () { loadNodes(true); }, 250);
    els.search.addEventListener('input', refresh);
    els.hardware.addEventListener('input', refresh);
    els.category.addEventListener('change', function () { loadNodes(true); });
    els.status.addEventListener('change', function () { loadNodes(true); });
    els.more.addEventListener('click', function () { loadNodes(false); });
    els.reset.addEventListener('click', function () {
      els.search.value = ''; els.category.value = ''; els.status.value = ''; els.hardware.value = '';
      loadNodes(true);
    });

    loadMeta();
    loadNodes(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());

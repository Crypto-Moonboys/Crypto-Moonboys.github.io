(function () {
  'use strict';

  function apiBase() {
    var api = window.MOONBOYS_API;
    if (!api || typeof api.getApiBase !== 'function') return '';
    return api.getApiBase();
  }

  function apiUrl(path) {
    var base = apiBase();
    if (!base) return '';
    return new URL(base.replace(/\/$/, '') + path, window.location.origin).toString();
  }

  function bridgeEnvelope(data, source, fallbackUsed) {
    return {
      ok: true,
      cached: source !== 'atomicassets',
      source: source || 'static-fallback',
      data: data || {},
      errors: [],
      stale: !!fallbackUsed,
      fallback_used: !!fallbackUsed,
    };
  }

  async function fetchJson(url) {
    var response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  async function getCollectionPageData(collection) {
    var path = '/api/wax/collections/' + encodeURIComponent(collection) + '/page-data';
    var url = apiUrl(path);
    if (!url) throw new Error('WAX API base unavailable');
    return fetchJson(url);
  }

  async function getTemplates(collection, ids) {
    var query = '?collection=' + encodeURIComponent(collection) + '&ids=' + encodeURIComponent((ids || []).join(','));
    var url = apiUrl('/api/wax/templates' + query);
    if (!url) throw new Error('WAX API base unavailable');
    return fetchJson(url);
  }

  async function loadStaticCollectionFallback(collection) {
    var base = '/data/' + collection + '/';
    var files = collection === 'noballgamess'
      ? ['template-rarity.json', 'template-stats.json', 'trait-exposure.json', 'holder-leaderboard.json', 'asset-rarity-leaderboard.json', 'sync-status.json', 'market-analytics.json']
      : ['template-rarity.json', 'template-stats.json', 'trait-exposure.json', 'live-asset-rarity.json', 'sync-status.json', 'market-analytics.json'];
    var payload = { collection: collection, files: {} };
    await Promise.all(files.map(async function (file) {
      try {
        payload.files[file] = await fetchJson(base + file);
      } catch (error) {
        payload.files[file] = { error: error.message || String(error) };
      }
    }));
    return bridgeEnvelope(payload, 'static-fallback', true);
  }

  window.MOONBOYS_WAX_API = Object.freeze({
    apiBase: apiBase,
    apiUrl: apiUrl,
    getCollectionPageData: getCollectionPageData,
    getTemplates: getTemplates,
    loadStaticCollectionFallback: loadStaticCollectionFallback,
  });
}());

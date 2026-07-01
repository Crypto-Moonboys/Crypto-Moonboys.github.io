(function () {
  'use strict';

  var COLLECTIONS = {
    'gkniftyheads-nft-collection': 'gkniftyheads',
    'noballgamess-nft-collection': 'noballgamess',
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function currentCollection() {
    var slug = (document.body && document.body.getAttribute('data-entity-hash') || '').replace(/^nft-/, '');
    var path = String(window.location && window.location.pathname || '');
    if (COLLECTIONS[slug]) return COLLECTIONS[slug];
    if (/gkniftyheads-nft-collection\.html$/i.test(path)) return 'gkniftyheads';
    if (/noballgamess-nft-collection\.html$/i.test(path)) return 'noballgamess';
    return '';
  }

  function articleRoot() {
    return document.querySelector('.wiki-article, .wiki-content, article') || document.body;
  }

  function ensureStatusCard(collection) {
    var article = articleRoot();
    var card = document.querySelector('[data-wax-bridge-status]');
    if (card) return card;
    card = document.createElement('section');
    card.className = 'wiki-section wax-bridge-status';
    card.setAttribute('data-wax-bridge-status', collection);
    card.innerHTML = '<h2>WAX Bridge</h2><p class="lore-paragraph">Checking read-only WAX bridge data...</p>';
    article.insertBefore(card, article.firstChild && article.firstChild.nextSibling);
    return card;
  }

  function ensureBridgeSection(collection) {
    var article = articleRoot();
    var section = document.querySelector('[data-wax-bridge-collection-data]');
    if (section) return section;
    section = document.createElement('section');
    section.className = 'wiki-section wax-bridge-collection-data';
    section.setAttribute('data-wax-bridge-collection-data', collection);
    section.innerHTML = '<h2>WAX Bridge Collection Data</h2><p class="lore-paragraph">Loading collection data...</p>';
    article.appendChild(section);
    return section;
  }

  function rowsFromTemplateRarity(templateRarity) {
    var rows = []
      .concat(templateRarity.ranked_templates || [])
      .concat(templateRarity.utility_open_mint_templates || [])
      .concat(templateRarity.unissued_templates || []);
    var seen = {};
    return rows.filter(function (row) {
      var id = row && row.template_id;
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function normalizePagePayload(envelope) {
    var data = envelope && envelope.data ? envelope.data : {};
    var files = data.files || {};
    var templateRarity = data.template_rarity || files['template-rarity.json'] || {};
    return {
      collection: data.collection || templateRarity.collection || '',
      source: envelope && envelope.source || 'static-fallback',
      fallback_used: !!(envelope && envelope.fallback_used),
      errors: (envelope && envelope.errors) || data.errors || [],
      summary: data.summary || {
        collection: data.collection || templateRarity.collection || '',
        ranked_templates: templateRarity.ranked_templates && templateRarity.ranked_templates.length,
        utility_open_mint_templates: templateRarity.utility_open_mint_templates && templateRarity.utility_open_mint_templates.length,
        unissued_templates: templateRarity.unissued_templates && templateRarity.unissued_templates.length,
        live_data_status: templateRarity.live_data_status || null,
      },
      template_rarity: templateRarity,
      template_stats: data.template_stats || files['template-stats.json'] || {},
      trait_exposure: data.trait_exposure || files['trait-exposure.json'] || {},
      holder_leaderboard: data.holder_leaderboard || files['holder-leaderboard.json'] || {},
      asset_rarity_leaderboard: data.asset_rarity_leaderboard || files['asset-rarity-leaderboard.json'] || files['live-asset-rarity.json'] || {},
      market_analytics: data.market_analytics || files['market-analytics.json'] || {},
      sync_status: data.sync_status || files['sync-status.json'] || {},
      templates: (data.templates && data.templates.length ? data.templates : rowsFromTemplateRarity(templateRarity)).slice(0, 24),
      source_urls: data.source_urls || [],
    };
  }

  function imageUrl(row) {
    var image = row && row.image;
    if (image && image.url) return image.url;
    if (row && row.thumbnail_url) return row.thumbnail_url;
    if (row && row.image_url) return row.image_url;
    if (row && row.image_sources && row.image_sources[0]) return row.image_sources[0];
    return '';
  }

  function templateCard(row) {
    var title = row.title || row.name || ('Template ' + (row.template_id || ''));
    var img = imageUrl(row);
    return '<article class="wiki-rabbit-card wax-template-card">'
      + (img ? '<img class="nft-thumb" src="' + escapeHtml(img) + '" alt="' + escapeHtml(title) + ' NFT artwork" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '<div class="nft-thumb-placeholder">Image unavailable</div>')
      + '<span class="wiki-rabbit-card-title">' + escapeHtml(title) + '</span>'
      + '<span class="wiki-rabbit-card-desc">Template #' + escapeHtml(row.template_id || '') + (row.rarity_band ? ' · ' + escapeHtml(row.rarity_band) : '') + (row.live_supply != null ? ' · Live ' + escapeHtml(row.live_supply) : '') + '</span>'
      + '</article>';
  }

  function statCards(summary) {
    var cards = [
      ['Ranked templates', summary.ranked_templates],
      ['Utility / open mint', summary.utility_open_mint_templates],
      ['Unissued templates', summary.unissued_templates],
      ['Live data status', summary.live_data_status],
    ].filter(function (entry) { return entry[1] != null && entry[1] !== ''; });
    return '<div class="wiki-rabbit-grid">' + cards.map(function (entry) {
      return '<div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">' + escapeHtml(entry[1]) + '</span><span class="wiki-rabbit-card-desc">' + escapeHtml(entry[0]) + '</span></div>';
    }).join('') + '</div>';
  }

  function simpleTable(rows, columns, emptyCopy) {
    if (!rows || !rows.length) return '<p class="lore-paragraph">' + escapeHtml(emptyCopy || 'No rows available.') + '</p>';
    return '<table class="wiki-table"><thead><tr>' + columns.map(function (column) {
      return '<th>' + escapeHtml(column.label) + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.slice(0, 12).map(function (row) {
      return '<tr>' + columns.map(function (column) {
        return '<td>' + escapeHtml(column.value(row)) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }

  function renderStatus(card, payload) {
    var source = payload.source || 'static-fallback';
    var degraded = payload.fallback_used || (payload.errors && payload.errors.length);
    card.innerHTML = '<h2>WAX Bridge</h2>'
      + '<p class="lore-paragraph"><strong>'
      + (degraded ? 'Static/degraded fallback active.' : 'Read-only bridge active.')
      + '</strong> Source: '
      + escapeHtml(source)
      + '. Existing generated JSON remains the page fallback and rarity audit trail.</p>';
  }

  function renderCollectionData(section, payload) {
    var templates = payload.templates || [];
    var traitRows = payload.trait_exposure.schemas || payload.trait_exposure.traits || [];
    var holderRows = payload.holder_leaderboard.holders || [];
    var assetRows = payload.asset_rarity_leaderboard.assets || [];
    section.innerHTML = '<h2>WAX Bridge Collection Data</h2>'
      + '<p class="lore-paragraph">Read-only WAX bridge data hydrated from AtomicAssets/static tracker sources. Rarity scoring still comes from the generated tracker pipeline.</p>'
      + '<h3>Collection Summary</h3>'
      + statCards(payload.summary || {})
      + '<h3>Template Preview</h3>'
      + '<div class="wiki-rabbit-grid">' + templates.slice(0, 12).map(templateCard).join('') + '</div>'
      + '<h3>Trait Exposure</h3>'
      + simpleTable(traitRows, [
        { label: 'Trait / Schema', value: function (row) { return row.schema_name || row.trait || row.name || 'unknown'; } },
        { label: 'Templates', value: function (row) { return row.templates || row.template_count || 0; } },
        { label: 'Live Supply', value: function (row) { return row.live_supply || row.supply || 0; } },
      ], 'Trait exposure is not available in the bridge payload.')
      + '<h3>Holder Leaderboard</h3>'
      + simpleTable(holderRows, [
        { label: 'Holder', value: function (row) { return row.owner || row.account || 'unknown'; } },
        { label: 'Live Assets', value: function (row) { return row.live_assets || row.assets || 0; } },
      ], 'Holder leaderboard is not available for this collection.')
      + '<h3>Asset Rarity Leaderboard</h3>'
      + simpleTable(assetRows, [
        { label: 'Asset ID', value: function (row) { return row.asset_id || ''; } },
        { label: 'Template ID', value: function (row) { return row.template_id || ''; } },
        { label: 'Original Mint', value: function (row) { return row.original_mint_number || ''; } },
        { label: 'Surviving Rank', value: function (row) { return row.surviving_mint_rank || ''; } },
      ], 'Asset rarity leaderboard is not available in the bridge payload.');
  }

  async function init() {
    var collection = currentCollection();
    var client = window.MOONBOYS_WAX_API;
    var statusCard;
    var dataSection;
    var envelope;
    var payload;
    if (!collection || !client) return;
    statusCard = ensureStatusCard(collection);
    dataSection = ensureBridgeSection(collection);
    try {
      envelope = await client.getCollectionPageData(collection);
      if (!envelope || envelope.ok === false) throw new Error('WAX bridge returned unavailable status');
    } catch (error) {
      envelope = await client.loadStaticCollectionFallback(collection);
      envelope.errors.push({ message: error.message || String(error) });
    }
    payload = normalizePagePayload(envelope);
    renderStatus(statusCard, payload);
    renderCollectionData(dataSection, payload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MOONBOYS_WAX_COLLECTION_RENDERER = Object.freeze({
    currentCollection: currentCollection,
    ensureStatusCard: ensureStatusCard,
    ensureBridgeSection: ensureBridgeSection,
    normalizePagePayload: normalizePagePayload,
    renderStatus: renderStatus,
    renderCollectionData: renderCollectionData,
    init: init,
  });
}());


(function () {
  'use strict';

  var COLLECTIONS = {
    'gkniftyheads-nft-collection': 'gkniftyheads',
    'noballgamess-nft-collection': 'noballgamess',
  };

  function currentCollection() {
    var slug = (document.body && document.body.getAttribute('data-entity-hash') || '').replace(/^nft-/, '');
    var path = String(window.location && window.location.pathname || '');
    if (COLLECTIONS[slug]) return COLLECTIONS[slug];
    if (/gkniftyheads-nft-collection\.html$/i.test(path)) return 'gkniftyheads';
    if (/noballgamess-nft-collection\.html$/i.test(path)) return 'noballgamess';
    return '';
  }

  function ensureStatusCard(collection) {
    var article = document.querySelector('.wiki-article, .wiki-content, article') || document.body;
    var card = document.querySelector('[data-wax-bridge-status]');
    if (card) return card;
    card = document.createElement('section');
    card.className = 'wiki-section wax-bridge-status';
    card.setAttribute('data-wax-bridge-status', collection);
    card.innerHTML = '<h2>WAX Bridge</h2><p class="lore-paragraph">Checking read-only WAX bridge status...</p>';
    article.insertBefore(card, article.firstChild && article.firstChild.nextSibling);
    return card;
  }

  function renderStatus(card, envelope) {
    var source = envelope && envelope.source ? envelope.source : 'static-fallback';
    var degraded = envelope && envelope.fallback_used;
    card.innerHTML = '<h2>WAX Bridge</h2>'
      + '<p class="lore-paragraph"><strong>'
      + (degraded ? 'Static fallback active.' : 'Read-only bridge active.')
      + '</strong> Source: '
      + source
      + '. Existing generated JSON remains the page fallback and rarity audit trail.</p>';
  }

  async function init() {
    var collection = currentCollection();
    var client = window.MOONBOYS_WAX_API;
    var card;
    var envelope;
    if (!collection || !client) return;
    card = ensureStatusCard(collection);
    try {
      envelope = await client.getCollectionPageData(collection);
      if (!envelope || envelope.ok === false) throw new Error('WAX bridge returned unavailable status');
    } catch (error) {
      envelope = await client.loadStaticCollectionFallback(collection);
      envelope.errors.push({ message: error.message || String(error) });
    }
    renderStatus(card, envelope);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MOONBOYS_WAX_COLLECTION_RENDERER = Object.freeze({
    currentCollection: currentCollection,
    ensureStatusCard: ensureStatusCard,
    renderStatus: renderStatus,
    init: init,
  });
}());


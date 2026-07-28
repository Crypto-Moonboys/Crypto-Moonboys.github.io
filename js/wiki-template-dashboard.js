(function () {
  'use strict';

  var article = document.querySelector('article.wiki-content[data-battle-layout="dashboard"]');
  if (!article) return;

  var originalPageType = article.dataset.pageType || 'wiki_article';
  article.dataset.pageType = 'nft_collection';

  function textFrom(selector, fallback) {
    var node = article.querySelector(selector);
    return node && node.textContent.trim() ? node.textContent.trim() : fallback;
  }

  function customiseDashboard(deck) {
    if (!deck || deck.dataset.wikiDashboardReady === '1') return;
    deck.dataset.wikiDashboardReady = '1';

    var title = article.dataset.battleTitle || textFrom('h1', 'Wiki Page');
    var kicker = article.dataset.battleKicker || 'About This Page';
    var subtitle = article.dataset.battleSubtitle || textFrom('.wiki-hero-breadcrumb, .eyebrow', 'Crypto Moonboys Wiki');
    var summary = article.dataset.battleSummary || textFrom('.wiki-hero > p:last-child, .lede', 'Explore this Crypto Moonboys wiki page.');

    var mediaHeading = deck.querySelector('.battle-shell--media h3');
    if (mediaHeading) mediaHeading.textContent = 'Page Art';

    var about = deck.querySelector('.gk-collection-about-card');
    if (about) {
      var aboutKicker = about.querySelector('.gk-collection-about-kicker');
      var aboutTitle = about.querySelector('.gk-collection-about-title');
      var aboutSubtitle = about.querySelector('.gk-collection-about-subtitle');
      var aboutCopy = about.querySelector('.gk-collection-about-copy');

      if (aboutKicker) aboutKicker.textContent = kicker;
      if (aboutTitle) {
        aboutTitle.textContent = title;
        aboutTitle.id = 'wiki-dashboard-about-title';
        about.setAttribute('aria-labelledby', aboutTitle.id);
      }
      if (aboutSubtitle) aboutSubtitle.textContent = subtitle;
      if (aboutCopy) aboutCopy.textContent = summary;
    }

    article.dataset.pageType = originalPageType;
  }

  function findDashboard() {
    var deck = document.querySelector('.battle-engagement-deck--collection');
    if (!deck) return false;
    customiseDashboard(deck);
    return true;
  }

  if (findDashboard()) return;

  var observer = new MutationObserver(function () {
    if (!findDashboard()) return;
    observer.disconnect();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.setTimeout(function () {
    article.dataset.pageType = originalPageType;
    observer.disconnect();
  }, 5000);
}());

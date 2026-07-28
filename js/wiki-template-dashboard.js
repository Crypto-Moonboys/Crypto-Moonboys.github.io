(function () {
  'use strict';

  var article = document.querySelector('article.wiki-content[data-battle-layout="dashboard"]');
  if (!article) return;

  var originalPageType = article.dataset.pageType || 'wiki_article';
  var isWikiRoute = window.location.pathname.startsWith('/wiki/');
  article.dataset.pageType = 'nft_collection';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function textFrom(selector, fallback) {
    var node = article.querySelector(selector);
    return node && node.textContent.trim() ? node.textContent.trim() : fallback;
  }

  function pageId() {
    return article.dataset.pageId ||
      (document.querySelector('.wiki-comments') || {}).dataset?.pageId ||
      window.location.pathname.split('/').pop().replace(/\.html$/, '') ||
      'wiki-page';
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

  function missionStatus(feature) {
    var cfg = window.MOONBOYS_API || {};
    var features = cfg.FEATURES || {};
    var identity = window.MOONBOYS_IDENTITY;
    var linked = !!(identity && (
      (identity.isTelegramLinked && identity.isTelegramLinked()) ||
      (identity.getTelegramId && identity.getTelegramId())
    ));

    if (!cfg.BASE_URL || !features[feature]) {
      return '<span class="mission-status mission-status--unavailable">Unavailable</span>';
    }
    if (!linked) {
      return '<span class="mission-status mission-status--locked">Telegram sync required</span>';
    }
    return '<span class="mission-status mission-status--ready">Ready</span>';
  }

  function engagementValue() {
    var cfg = window.MOONBOYS_API || {};
    if (!cfg.BASE_URL || !(cfg.FEATURES || {}).COMMENTS) return Promise.resolve(25);

    return fetch(cfg.BASE_URL + '/comments?page_id=' + encodeURIComponent(pageId()) + '&limit=50')
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        return Math.min(100, ((data && data.comments) || []).length * 5);
      })
      .catch(function () { return 25; });
  }

  function mediaHTML() {
    var template = document.querySelector('template[data-battle-media="nft"]');
    if (!template || !template.content) return '';
    var holder = document.createElement('div');
    holder.appendChild(template.content.cloneNode(true));
    return holder.innerHTML;
  }

  function buildFallbackDashboard(engagement) {
    if (findDashboard()) return;

    var level = engagement > 60 ? 'Hot' : engagement > 30 ? 'Warming Up' : 'Calm';
    var title = article.dataset.battleTitle || textFrom('h1', 'Wiki Page');
    var kicker = article.dataset.battleKicker || 'About This Page';
    var subtitle = article.dataset.battleSubtitle || textFrom('.wiki-hero-breadcrumb, .eyebrow', 'Crypto Moonboys Wiki');
    var summary = article.dataset.battleSummary || textFrom('.wiki-hero > p:last-child, .lede', 'Explore this Crypto Moonboys wiki page.');

    var module = document.createElement('section');
    module.className = 'wiki-engagement-module';
    module.setAttribute('aria-label', 'Wiki engagement');
    module.innerHTML =
      '<div class="battle-deck battle-engagement-deck battle-engagement-deck--collection" data-wiki-dashboard-ready="1">' +
        '<div class="battle-shell battle-shell--media"><div class="battle-shell-inner">' +
          '<h3>Page Art</h3>' + mediaHTML() +
        '</div></div>' +
        '<article class="battle-shell gk-collection-about-card" aria-labelledby="wiki-dashboard-about-title">' +
          '<div class="battle-shell-inner">' +
            '<p class="gk-collection-about-kicker">' + esc(kicker) + '</p>' +
            '<h3 id="wiki-dashboard-about-title" class="gk-collection-about-title">' + esc(title) + '</h3>' +
            '<p class="gk-collection-about-subtitle">' + esc(subtitle) + '</p>' +
            '<p class="gk-collection-about-copy">' + esc(summary) + '</p>' +
          '</div>' +
        '</article>' +
        '<div class="battle-shell battle-shell--missions"><div class="battle-shell-inner">' +
          '<h3>Daily Missions</h3>' +
          '<div class="battle-heat-summary" aria-label="Battle Heat">' +
            '<div class="battle-heat-summary-head"><span>Battle Heat</span><strong>' + engagement + '%</strong></div>' +
            '<div class="battle-meter-shell"><div class="battle-bar-fill" style="width:' + engagement + '%"></div></div>' +
            '<div class="battle-meter-meta"><span>' + esc(level) + ' engagement</span><span>Comments / likes / citation votes</span></div>' +
          '</div>' +
          '<div class="mission-stack">' +
            '<div class="mission-row" data-mission-id="engage"><div><span class="mission-tag">Engage</span><div class="mission-text">Leave a strategic comment on this page to influence the narrative.</div></div>' + missionStatus('COMMENTS') + '</div>' +
            '<div class="mission-row" data-mission-id="signal"><div><span class="mission-tag">Signal</span><div class="mission-text">Like this article to boost its standing in the Moonboys ecosystem.</div></div>' + missionStatus('LIKES') + '</div>' +
            '<div class="mission-row" data-mission-id="cite"><div><span class="mission-tag">Cite</span><div class="mission-text">Vote on citations to strengthen the credibility of this intelligence file.</div></div>' + missionStatus('CITATION_VOTES') + '</div>' +
          '</div>' +
          '<p class="battle-copy">Rewards sync only for Telegram-linked users after supported actions are accepted by the live backend.</p>' +
        '</div></div>' +
      '</div>';

    var hero = article.querySelector('.wiki-hero');
    (hero || article).insertAdjacentElement('afterend', module);

    var like = document.querySelector('.page-like-widget');
    if (!like) {
      like = document.createElement('div');
      like.className = 'page-like-widget';
      like.dataset.pageId = pageId();
      var heat = module.querySelector('.battle-heat-summary');
      heat.insertAdjacentElement('afterend', like);
      if (window.MOONBOYS_ENGAGEMENT && window.MOONBOYS_ENGAGEMENT.initPageLike) {
        window.MOONBOYS_ENGAGEMENT.initPageLike(like);
      }
    }

    article.dataset.pageType = originalPageType;
  }

  if (findDashboard()) return;

  var observer = new MutationObserver(function () {
    if (!findDashboard()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.setTimeout(function () {
    if (findDashboard()) return;
    observer.disconnect();

    if (isWikiRoute) {
      article.dataset.pageType = originalPageType;
      return;
    }

    engagementValue().then(buildFallbackDashboard);
  }, 250);
}());
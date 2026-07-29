(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.location.pathname.startsWith('/wiki/')) return;

  var reconcileTimer = null;
  var reconciling = false;

  function isNftPage(article) {
    if (!article) return false;
    var pageType = String(article.dataset.pageType || '').toLowerCase();
    return pageType === 'nft_collection' || pageType === 'nft_template' ||
      article.classList.contains('nft-collection-article') ||
      article.classList.contains('nft-template-article') ||
      !!article.querySelector('[data-template-id]');
  }

  function ensureStyles() {
    if (!document.querySelector('link[data-wiki-flagship-layout]')) {
      var flagship = document.createElement('link');
      flagship.rel = 'stylesheet';
      flagship.href = '/css/wiki-flagship-layout.css';
      flagship.dataset.wikiFlagshipLayout = 'true';
      document.head.appendChild(flagship);
    }
    if (!document.querySelector('link[data-wiki-runtime-migration]')) {
      var runtime = document.createElement('link');
      runtime.rel = 'stylesheet';
      runtime.href = '/css/wiki-runtime-migration.css';
      runtime.dataset.wikiRuntimeMigration = 'true';
      document.head.appendChild(runtime);
    }
    if (!document.querySelector('link[data-wiki-comments-compact]')) {
      var comments = document.createElement('link');
      comments.rel = 'stylesheet';
      comments.href = '/css/wiki-comments-compact.css';
      comments.dataset.wikiCommentsCompact = 'true';
      document.head.appendChild(comments);
    }
  }

  function ensureScript(src, marker) {
    if (document.querySelector('script[' + marker + ']') || document.querySelector('script[src="' + src + '"]')) return;
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute('data-cfasync', 'false');
    script.setAttribute(marker, 'true');
    document.head.appendChild(script);
  }

  function text(el) {
    return el ? String(el.textContent || '').trim() : '';
  }

  function pageId(article) {
    var comments = document.querySelector('.wiki-comments');
    return article.dataset.pageId ||
      (comments && comments.dataset ? comments.dataset.pageId : '') ||
      window.location.pathname.split('/').pop().replace(/\.html$/, '') ||
      'wiki-page';
  }

  function findTitle(article) {
    return article.querySelector(':scope > header h1, :scope > h1, h1') ||
      document.querySelector('.page-title, main > h1');
  }

  function findSummary(article) {
    return article.querySelector(':scope > header p:last-of-type, :scope > p, section p');
  }

  function buildHero(article) {
    var existing = article.querySelector(':scope > header');
    var title = findTitle(article);
    var summary = findSummary(article);
    var category = document.querySelector('.breadcrumb a:last-of-type, .article-meta a, .category-tags a');

    if (!existing) {
      existing = document.createElement('header');
      existing.className = 'wiki-hero wiki-runtime-hero';
      article.insertBefore(existing, article.firstChild);
    } else {
      existing.classList.add('wiki-hero', 'wiki-runtime-hero');
    }

    if (!existing.querySelector('.wiki-flagship-kicker')) {
      var kicker = document.createElement('p');
      kicker.className = 'wiki-flagship-kicker';
      kicker.textContent = text(category) || 'Crypto Moonboys Wiki';
      existing.insertBefore(kicker, existing.firstChild);
    }

    var heroTitle = existing.querySelector('h1');
    if (!heroTitle && title) {
      heroTitle = title;
      existing.appendChild(heroTitle);
    }
    if (heroTitle) heroTitle.classList.add('wiki-flagship-title');

    if (!existing.querySelector('.wiki-flagship-lead') && summary) {
      if (summary.closest('header') === existing) {
        summary.classList.add('wiki-flagship-lead');
      } else {
        var lead = summary.cloneNode(true);
        lead.className = 'wiki-flagship-lead';
        existing.appendChild(lead);
        summary.remove();
      }
    }

    document.querySelectorAll('.page-title, .page-title-line').forEach(function (node) {
      if (!existing.contains(node)) node.remove();
    });

    return existing;
  }

  function moveMeta(article, hero) {
    var meta = article.querySelector(':scope > .article-meta') || document.querySelector('main > .article-meta');
    if (!meta) return;
    meta.classList.add('wiki-runtime-meta');
    if (meta.parentElement !== article) article.insertBefore(meta, hero.nextSibling);
  }

  function ensureDashboardMedia(article) {
    if (article.querySelector('template[data-battle-media="nft"]')) return;
    var template = document.createElement('template');
    template.className = 'nft-battle-media-template';
    template.dataset.battleMedia = 'nft';
    template.dataset.pageId = pageId(article);

    var pageImage = document.querySelector('meta[property="og:image"]');
    var heroImage = article.querySelector('img.wiki-hero-image, header img, article img');
    var src = heroImage && heroImage.getAttribute('src') ||
      pageImage && pageImage.getAttribute('content') ||
      '/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png';
    var title = text(findTitle(article)) || 'Crypto Moonboys wiki page';

    template.innerHTML = '<figure class="battle-page-media wiki-template-media-card">' +
      '<img class="wiki-hero-image" src="' + String(src).replace(/"/g, '&quot;') + '" alt="' +
      title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') +
      ' page artwork" loading="lazy" decoding="async">' +
      '</figure>';

    var meta = article.querySelector(':scope > .article-meta');
    if (meta) meta.insertAdjacentElement('afterend', template);
    else article.appendChild(template);
  }

  function prepareDashboard(article) {
    if (!article.dataset.runtimeOriginalPageType) {
      article.dataset.runtimeOriginalPageType = article.dataset.pageType || 'wiki_article';
    }
    article.dataset.pageId = pageId(article);
    article.dataset.battleLayout = 'dashboard';
    if (!article.dataset.battleKicker) article.dataset.battleKicker = 'About This Page';
    if (!article.dataset.battleSubtitle) {
      article.dataset.battleSubtitle = text(document.querySelector('.breadcrumb a:last-of-type, .article-meta a, .category-tags a')) || 'Crypto Moonboys Wiki';
    }
    if (!article.dataset.battleSummary) {
      article.dataset.battleSummary = text(article.querySelector('.wiki-flagship-lead')) || 'Explore this Crypto Moonboys wiki page.';
    }

    ensureDashboardMedia(article);

    // The shared battle layer uses the collection deck to produce the required
    // Page Art / About / Daily Missions three-card layout. The dashboard adapter
    // restores the original page type after the deck is created.
    article.dataset.pageType = 'nft_collection';
    ensureScript('/js/wiki-template-dashboard.js', 'data-wiki-template-dashboard-runtime');
    ensureScript('/js/wiki-live-contributors.js', 'data-wiki-live-contributors-runtime');
  }

  function extractInfobox(article, hero) {
    var infobox = document.querySelector('main > .infobox, main > aside.infobox, .wiki-layout > .infobox');
    if (!infobox) return;

    var section = document.createElement('section');
    section.className = 'wiki-flagship-section wiki-runtime-key-facts';
    section.setAttribute('aria-label', 'Key facts');
    section.innerHTML = '<p class="wiki-flagship-kicker">Key facts</p><h2>AT A GLANCE</h2><div class="wiki-flagship-grid"></div>';
    var grid = section.querySelector('.wiki-flagship-grid');

    infobox.querySelectorAll('tr').forEach(function (row) {
      var cells = row.querySelectorAll('th,td');
      if (cells.length < 2) return;
      var card = document.createElement('div');
      card.className = 'wiki-flagship-card';
      var strong = document.createElement('strong');
      strong.textContent = text(cells[0]);
      var value = document.createElement('span');
      value.innerHTML = cells[1].innerHTML;
      card.appendChild(strong);
      card.appendChild(value);
      grid.appendChild(card);
    });

    if (!grid.children.length) {
      infobox.querySelectorAll('.infobox-row, dl > div').forEach(function (row) {
        var label = row.querySelector('dt, .label, strong');
        var valueNode = row.querySelector('dd, .value, span');
        if (!label || !valueNode) return;
        var card = document.createElement('div');
        card.className = 'wiki-flagship-card';
        card.innerHTML = '<strong>' + label.innerHTML + '</strong><span>' + valueNode.innerHTML + '</span>';
        grid.appendChild(card);
      });
    }

    if (grid.children.length) {
      var meta = article.querySelector(':scope > .article-meta');
      article.insertBefore(section, meta ? meta.nextSibling : hero.nextSibling);
    }
    infobox.remove();
  }

  function wrapLooseHeadings(article) {
    Array.from(article.children).forEach(function (child) {
      if (child.matches('section')) child.classList.add('wiki-flagship-section');
    });

    var children = Array.from(article.children);
    children.forEach(function (child) {
      if (child.tagName !== 'H2' || child.closest('section')) return;
      var section = document.createElement('section');
      section.className = 'wiki-flagship-section wiki-runtime-generated-section';
      article.insertBefore(section, child);
      var node = child;
      while (node) {
        var next = node.nextSibling;
        if (node !== child && node.nodeType === 1 && (node.tagName === 'H2' || node.matches('section, .category-tags'))) break;
        section.appendChild(node);
        node = next;
      }
    });
  }

  function styleExistingSections(article) {
    article.querySelectorAll(':scope > section').forEach(function (section) {
      section.classList.add('wiki-flagship-section');
    });
    article.querySelectorAll('.wiki-stat-grid, .internal-link-grid, .wiki-rabbit-grid').forEach(function (grid) {
      grid.classList.add('wiki-flagship-grid');
    });
    article.querySelectorAll('.wiki-card, .internal-link-grid > a, .wiki-rabbit-card').forEach(function (card) {
      card.classList.add('wiki-flagship-card');
    });
  }

  function ensureWrapper(article) {
    if (article.closest('.wiki-flagship-page')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'wiki-flagship-page wiki-runtime-flagship-page';
    article.parentNode.insertBefore(wrapper, article);
    wrapper.appendChild(article);
  }

  function removeLegacyPanels() {
    document.querySelectorAll('#toc, .toc, .citation-vote-panel, [data-citation-vote-panel="true"]').forEach(function (node) {
      node.remove();
    });
  }

  function hasRealSourceEntries(article) {
    var entries = article.querySelectorAll('.sources-list li, .citations-list li, .source-ref-list li');
    return Array.from(entries).some(function (entry) {
      return !!entry.querySelector('a[href]') || text(entry).length > 0;
    });
  }

  function ensureBottomTruth(article) {
    var comments = document.querySelector('.wiki-comments');
    if (!comments) return;

    var hasSources = hasRealSourceEntries(article);
    var existing = document.querySelector('.wiki-live-source-card');
    if (existing && !existing.classList.contains('wiki-runtime-live-source')) return;

    var card = existing;
    if (!card) {
      card = document.createElement('section');
      card.className = 'wiki-live-source-card wiki-runtime-live-source';
      card.setAttribute('aria-label', 'Published source status');
      comments.parentNode.insertBefore(card, comments);
    }

    card.innerHTML = '<p class="wiki-live-source-card__eyebrow">Published record</p>' +
      '<h2>Source Status</h2>' +
      '<p>' + (hasSources
        ? 'This is a Crypto Moonboys editorial record with a listed source archive. The page is published by Crypto Moonboys; citations are provided so readers can inspect supporting material and check facts that may change over time.'
        : 'This is a first-party Crypto Moonboys editorial record published on the official Crypto Moonboys website. It is not marked as unverified. External or time-sensitive facts should be updated when newer primary evidence becomes available.') + '</p>' +
      '<span class="wiki-live-source-card__status">' + (hasSources ? 'Crypto Moonboys record with sources' : 'Official Crypto Moonboys editorial record') + '</span>';
  }

  function reconcile(article) {
    if (!article || isNftPage(article) || reconciling) return;
    reconciling = true;
    try {
      wrapLooseHeadings(article);
      styleExistingSections(article);
      removeLegacyPanels();
      ensureBottomTruth(article);
    } finally {
      reconciling = false;
    }
  }

  function migrate() {
    var article = document.querySelector('article.wiki-content, main article');
    if (!article || isNftPage(article)) return;

    ensureStyles();

    if (article.dataset.flagshipRuntimeReady !== '1') {
      article.dataset.flagshipRuntimeReady = '1';
      article.classList.add('wiki-runtime-article');
      document.body.classList.add('wiki-runtime-flagship-shell', 'page-wiki-template-comments');

      var hero = buildHero(article);
      moveMeta(article, hero);
      extractInfobox(article, hero);
      removeLegacyPanels();
      ensureWrapper(article);
      prepareDashboard(article);
    }

    reconcile(article);
  }

  function scheduleReconcile() {
    if (reconcileTimer) window.clearTimeout(reconcileTimer);
    reconcileTimer = window.setTimeout(function () {
      reconcileTimer = null;
      migrate();
    }, 40);
  }

  function startObserver() {
    if (!document.body || window.__WIKI_FLAGSHIP_MIGRATION_OBSERVER) return;
    var observer = new MutationObserver(function (mutations) {
      var hasAddedContent = mutations.some(function (mutation) {
        return mutation.type === 'childList' && mutation.addedNodes && mutation.addedNodes.length > 0;
      });
      if (hasAddedContent) scheduleReconcile();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__WIKI_FLAGSHIP_MIGRATION_OBSERVER = observer;
  }

  function boot() {
    migrate();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  window.setTimeout(migrate, 500);
  window.setTimeout(migrate, 1800);
}());
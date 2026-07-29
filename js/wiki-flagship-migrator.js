(function () {
  'use strict';

  if (!window.location.pathname.startsWith('/wiki/')) return;

  var busy = false;
  var timer = null;

  function isActualNftPage(article) {
    if (!article) return false;
    var currentType = String(article.dataset.pageType || '').toLowerCase();
    var originalType = String(article.dataset.runtimeOriginalPageType || currentType).toLowerCase();
    var file = (window.location.pathname.split('/').pop() || '').toLowerCase();

    return originalType === 'nft_collection' ||
      originalType === 'nft_template' ||
      article.classList.contains('nft-collection-article') ||
      article.classList.contains('nft-template-article') ||
      file === 'gkniftyheads-nft-collection.html' ||
      /(?:^|-)nft-collection\.html$/.test(file) ||
      /^gkniftyheads-.+-\d+\.html$/.test(file);
  }

  function addStyle(href, marker) {
    if (document.querySelector('link[' + marker + ']')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(marker, 'true');
    document.head.appendChild(link);
  }

  function addScript(src, marker) {
    if (document.querySelector('script[' + marker + ']')) return;
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute('data-cfasync', 'false');
    script.setAttribute(marker, 'true');
    document.head.appendChild(script);
  }

  function cleanText(node) {
    return node ? String(node.textContent || '').trim() : '';
  }

  function getPageId(article) {
    var comments = document.querySelector('.wiki-comments');
    return article.dataset.pageId ||
      (comments && comments.dataset.pageId) ||
      (window.location.pathname.split('/').pop() || 'wiki-page').replace(/\.html$/, '');
  }

  function buildHero(article) {
    var hero = article.querySelector(':scope > header');
    var title = article.querySelector(':scope > h1, h1') || document.querySelector('.page-title, main > h1');
    var summary = hero && hero.querySelector('p:not(.wiki-flagship-kicker), .lede, [class$="-lead"]') ||
      article.querySelector(':scope > p, section p');
    var category = document.querySelector('.breadcrumb a:last-of-type, .article-meta a, .category-tags a');

    if (!hero) {
      hero = document.createElement('header');
      article.insertBefore(hero, article.firstChild);
    }
    hero.classList.add('wiki-hero', 'wiki-runtime-hero');

    if (!hero.querySelector('.wiki-flagship-kicker')) {
      var kicker = document.createElement('p');
      kicker.className = 'wiki-flagship-kicker';
      kicker.textContent = cleanText(category) || 'Crypto Moonboys Wiki';
      hero.insertBefore(kicker, hero.firstChild);
    }

    if (!hero.querySelector('h1') && title) hero.appendChild(title);
    var heroTitle = hero.querySelector('h1');
    if (heroTitle) heroTitle.classList.add('wiki-flagship-title');

    if (!hero.querySelector('.wiki-flagship-lead') && summary) {
      var lead = summary.closest('header') === hero ? summary : summary.cloneNode(true);
      lead.classList.add('wiki-flagship-lead');
      if (lead !== summary) {
        hero.appendChild(lead);
        summary.remove();
      }
    }

    document.querySelectorAll('.page-title, .page-title-line').forEach(function (node) {
      if (!hero.contains(node)) node.remove();
    });
    return hero;
  }

  function moveMeta(article, hero) {
    var meta = article.querySelector(':scope > .article-meta') || document.querySelector('main > .article-meta');
    if (!meta) return;
    meta.classList.add('wiki-runtime-meta');
    if (meta.parentElement !== article) article.insertBefore(meta, hero.nextSibling);
  }

  function convertInfobox(article, hero) {
    var box = document.querySelector('main > .infobox, main > aside.infobox, .wiki-layout > .infobox');
    if (!box) return;
    var section = document.createElement('section');
    section.className = 'wiki-flagship-section wiki-runtime-key-facts';
    section.innerHTML = '<p class="wiki-flagship-kicker">Key facts</p><h2>AT A GLANCE</h2><div class="wiki-flagship-grid"></div>';
    var grid = section.querySelector('.wiki-flagship-grid');

    box.querySelectorAll('tr').forEach(function (row) {
      var cells = row.querySelectorAll('th,td');
      if (cells.length < 2) return;
      var card = document.createElement('div');
      card.className = 'wiki-flagship-card';
      card.innerHTML = '<strong>' + cells[0].innerHTML + '</strong><span>' + cells[1].innerHTML + '</span>';
      grid.appendChild(card);
    });

    if (grid.children.length) {
      var meta = article.querySelector(':scope > .article-meta');
      article.insertBefore(section, meta ? meta.nextSibling : hero.nextSibling);
    }
    box.remove();
  }

  function wrapSections(article) {
    article.querySelectorAll(':scope > section').forEach(function (section) {
      section.classList.add('wiki-flagship-section');
    });

    Array.from(article.children).forEach(function (heading) {
      if (heading.tagName !== 'H2') return;
      var section = document.createElement('section');
      section.className = 'wiki-flagship-section wiki-runtime-generated-section';
      article.insertBefore(section, heading);
      var node = heading;
      while (node) {
        var next = node.nextSibling;
        if (node !== heading && node.nodeType === 1 && (node.tagName === 'H2' || node.matches('section, .category-tags'))) break;
        section.appendChild(node);
        node = next;
      }
    });

    article.querySelectorAll('.wiki-stat-grid, .internal-link-grid, .wiki-rabbit-grid, .midevil-grid').forEach(function (grid) {
      grid.classList.add('wiki-flagship-grid');
    });
    article.querySelectorAll('.wiki-card, .internal-link-grid > a, .wiki-rabbit-card, .midevil-card').forEach(function (card) {
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

  function ensureSourceStatus(article) {
    var comments = document.querySelector('.wiki-comments');
    if (!comments) return;

    var authoredCard = document.querySelector('.wiki-live-source-card:not(.wiki-runtime-live-source)');
    if (authoredCard) return;

    var sourceEntries = article.querySelectorAll('.sources-list li, .citations-list li, .source-ref-list li');
    var hasSources = Array.from(sourceEntries).some(function (item) {
      return item.querySelector('a[href]') || cleanText(item);
    });
    var card = document.querySelector('.wiki-runtime-live-source');
    if (!card) {
      card = document.createElement('section');
      card.className = 'wiki-live-source-card wiki-runtime-live-source';
      comments.parentNode.insertBefore(card, comments);
    }
    card.innerHTML = '<p class="wiki-live-source-card__eyebrow">Published record</p>' +
      '<h2>Source Status</h2>' +
      '<p>' + (hasSources
        ? 'This official Crypto Moonboys editorial record includes a source archive so readers can inspect supporting material and review facts that may change.'
        : 'This is an official first-party Crypto Moonboys editorial record. It is not marked as unverified. External or time-sensitive facts should be updated when newer primary evidence becomes available.') + '</p>' +
      '<span class="wiki-live-source-card__status">' +
      (hasSources ? 'Crypto Moonboys record with sources' : 'Official Crypto Moonboys editorial record') +
      '</span>';
  }

  function prepareDashboard(article) {
    if (!article.dataset.runtimeOriginalPageType) {
      article.dataset.runtimeOriginalPageType = article.dataset.pageType || 'wiki_article';
    }
    article.dataset.pageId = getPageId(article);
    article.dataset.battleLayout = 'dashboard';
    article.dataset.battleKicker = article.dataset.battleKicker || 'About This Page';
    article.dataset.battleSummary = article.dataset.battleSummary || cleanText(article.querySelector('.wiki-flagship-lead'));

    if (!article.querySelector('template[data-battle-media="nft"]')) {
      var template = document.createElement('template');
      template.dataset.battleMedia = 'nft';
      template.dataset.pageId = getPageId(article);
      var image = document.querySelector('meta[property="og:image"]');
      var src = image && image.content ? image.content : '/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png';
      template.innerHTML = '<figure class="battle-page-media wiki-template-media-card"><img class="wiki-hero-image" src="' +
        src.replace(/"/g, '&quot;') + '" alt="Page artwork" loading="lazy" decoding="async"></figure>';
      article.appendChild(template);
    }

    article.dataset.pageType = 'nft_collection';
    addScript('/js/wiki-template-dashboard.js', 'data-wiki-template-dashboard-runtime');
    addScript('/js/wiki-live-contributors.js', 'data-wiki-live-contributors-runtime');
  }

  function migrate() {
    var article = document.querySelector('article.wiki-content, main article');
    if (!article || isActualNftPage(article) || busy) return;
    busy = true;
    try {
      addStyle('/css/wiki-flagship-layout.css', 'data-wiki-flagship-layout');
      addStyle('/css/wiki-runtime-migration.css', 'data-wiki-runtime-migration');
      addStyle('/css/wiki-comments-compact.css', 'data-wiki-comments-compact');
      document.body.classList.add('wiki-runtime-flagship-shell', 'page-wiki-template-comments');

      if (article.dataset.flagshipRuntimeReady !== '1') {
        article.dataset.flagshipRuntimeReady = '1';
        article.classList.add('wiki-runtime-article');
        var hero = buildHero(article);
        moveMeta(article, hero);
        convertInfobox(article, hero);
        ensureWrapper(article);
        prepareDashboard(article);
      }

      document.querySelectorAll('#toc, .toc, .citation-vote-panel, [data-citation-vote-panel="true"]').forEach(function (node) {
        node.remove();
      });
      wrapSections(article);
      ensureSourceStatus(article);
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(migrate, 50);
  }

  function boot() {
    migrate();
    if (!window.__WIKI_FLAGSHIP_MIGRATION_OBSERVER) {
      var observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      window.__WIKI_FLAGSHIP_MIGRATION_OBSERVER = observer;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  setTimeout(migrate, 500);
  setTimeout(migrate, 1800);
}());
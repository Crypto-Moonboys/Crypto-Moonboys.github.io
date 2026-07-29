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
  }

  function text(el) {
    return el ? String(el.textContent || '').trim() : '';
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
      card.setAttribute('aria-label', 'Live source status');
      comments.parentNode.insertBefore(card, comments);
    }

    card.innerHTML = '<p class="wiki-live-source-card__eyebrow">Current truth</p>' +
      '<h2>Live Source</h2>' +
      '<p>' + (hasSources ? 'Use the cited primary sources below to verify claims that may change. Historical material is not proof that a feature remains live.' : 'No dedicated source archive is currently listed on this legacy page. Claims that can change must be verified before the page is treated as current.') + '</p>' +
      '<span class="wiki-live-source-card__status">' + (hasSources ? 'Source archive available' : 'Source review required') + '</span>';
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
      document.body.classList.add('wiki-runtime-flagship-shell');

      var hero = buildHero(article);
      moveMeta(article, hero);
      extractInfobox(article, hero);
      removeLegacyPanels();
      ensureWrapper(article);
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
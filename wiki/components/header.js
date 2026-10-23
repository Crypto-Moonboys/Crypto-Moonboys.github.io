(function () {
  'use strict';

  const config = Object.freeze({
    version: 'swarmsy-lock-v1',
    htmlPath: '/wiki/components/header.html',
    cssPath: '/wiki/components/header.css',
    shellPath: '/wiki/layouts/wiki-shell.html',
    headerId: 'site-header',
    navId: 'global-nav',
    searchResultsId: 'search-results',
    requiredLabels: ['WIKI', 'GAMES', 'BATTLE CHAMBER', 'SWARMSY', 'SYSTEM HUB']
  });

  window.__WIKI_SWARMSY_HEADER__ = config;
})();

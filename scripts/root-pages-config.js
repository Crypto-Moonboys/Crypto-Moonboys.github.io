#!/usr/bin/env node
'use strict';

/**
 * scripts/root-pages-config.js
 *
 * Centralized configuration for approved root/tool pages that should be:
 *   1. In the search index (js/wiki-index.json)
 *   2. In the sitemap (sitemap.xml)
 *   3. Available as searchable content
 *
 * This list is used by:
 *   - scripts/generate-wiki-index.js (to add root pages to index)
 *   - scripts/audit-published-vs-index.js (to verify they're present in index/sitemap)
 *   - scripts/wiki-index-drift-regression.test.mjs (to verify they're indexed)
 *
 * Single source of truth prevents drift between generators and audits.
 */

const APPROVED_ROOT_PAGES = [
  { path: '/gpt-users.html', title: 'SPARKY Creator Studio', changefreq: 'weekly', priority: '0.9' },
  { path: '/join-us-on-the-wax-blockchain.html', title: 'Join us on the WAX blockchain', changefreq: 'weekly', priority: '0.9' },
  { path: '/moonboy-builder.html', title: 'Moonboy Builder', changefreq: 'monthly', priority: '0.8' },
  { path: '/swarmsy.html', title: 'SWARMSY PC Beta', changefreq: 'monthly', priority: '0.7' },
  { path: '/gkniftyheads-incubator.html', title: 'GKniftyHEADS Community', changefreq: 'weekly', priority: '0.8' },
  { path: '/community.html', title: 'Battle Chamber', changefreq: 'weekly', priority: '0.7' },
  { path: '/how-to-play.html', title: 'Arcade How to Play', changefreq: 'monthly', priority: '0.6' },
  { path: '/how-to-play-crypto-moonboy-pets.html', title: 'How to Play Crypto Moonboy Pets', changefreq: 'monthly', priority: '0.6' },
  { path: '/paths.html', title: 'Reading Paths', changefreq: 'monthly', priority: '0.6' },
  { path: '/timeline.html', title: 'Universe Timeline', changefreq: 'monthly', priority: '0.6' },
  { path: '/about.html', title: 'About Crypto Moonboys' },
  { path: '/graffiti-kings-creative-guide.html', title: 'Graffiti Kings Creative Guide' },
  { path: '/categories/index.html', title: 'Categories' },
  { path: '/categories/tools.html', title: 'Tools' },
  { path: '/categories/gkniftyheads.html', title: 'GKniftyheads' },
  { path: '/hubs.html', title: 'Hubs' },
  { path: '/sam.html', title: 'SAM' },
  { path: '/og-templates/wiki-page.html', title: 'Wiki Page OG Template', changefreq: 'monthly', priority: '0.6' },
  { path: '/og-templates/nft-collection-page.html', title: 'NFT Collection OG Template', changefreq: 'monthly', priority: '0.6' },
  { path: '/og-templates/nft-template-page.html', title: 'NFT Template Page OG Template', changefreq: 'monthly', priority: '0.6' },
  { path: '/og-templates/crypto-token-page.html', title: 'Crypto Token OG Template', changefreq: 'monthly', priority: '0.6' }
];

function getRootPages() {
  return APPROVED_ROOT_PAGES;
}

function getRootPagePaths() {
  return APPROVED_ROOT_PAGES.map(p => p.path);
}

module.exports = {
  APPROVED_ROOT_PAGES,
  getRootPages,
  getRootPagePaths
};

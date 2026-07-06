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
  { path: '/waxcash.html', title: 'WAXCASH Analytics' },
  { path: '/about.html', title: 'About Crypto Moonboys' },
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

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_INDEX = path.join(ROOT, 'js', 'wiki-index.json');
const CATEGORIES_DIR = path.join(ROOT, 'categories');
const FULL_COLLECTION_URL = '/wiki/gkniftyheads-nft-collection.html';
const FEATURED_TEMPLATE_LIMIT = 12;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isWikiUrl(url) {
  return String(url || '').startsWith('/wiki/') && String(url || '') !== '/wiki/index.html';
}

function isGkniftyTemplateUrl(url) {
  return /^\/wiki\/gkniftyheads-.+-\d+\.html$/i.test(String(url || ''));
}

function indexByUrl(entries) {
  return new Map(entries.filter((entry) => entry && isWikiUrl(entry.url)).map((entry) => [entry.url, entry]));
}

function titleFor(entry, fallback) {
  return String((entry && entry.title) || fallback || '')
    .replace(/\s+-\s+Crypto Moonboys Wiki$/i, '')
    .replace(/\s+—\s+Crypto Moonboys Wiki$/i, '')
    .trim();
}

function descFor(entry, fallback) {
  return String((entry && entry.desc) || fallback || '').trim();
}

function card(url, title, description, eyebrow = '') {
  return `        <a href="${escapeHtml(url)}" class="category-card nft-hub-card">
          <span class="cat-icon" aria-hidden="true">${escapeHtml(eyebrow || 'NFT')}</span>
          <div><div class="cat-name">${escapeHtml(title)}</div><div class="cat-desc">${escapeHtml(description)}</div></div>
        </a>`;
}

function cards(entries) {
  return entries.map((entry) => card(entry.url, entry.title, entry.description, entry.eyebrow)).join('\n');
}

function section(title, intro, entries) {
  if (!entries.length) return '';
  return `      <section class="wiki-section nft-hub-section">
        <h2>${escapeHtml(title)}</h2>
        <p style="color:var(--color-text-muted);margin-bottom:16px">${escapeHtml(intro)}</p>
        <div class="category-grid nft-hub-card-grid">
${cards(entries)}
        </div>
      </section>`;
}

function pageHtml({ slug, title, description, intro, sections }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${escapeHtml(title)} - Crypto Moonboys Wiki">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://cryptomoonboys.com/categories/${escapeHtml(slug)}.html">
  <meta property="og:image" content="https://cryptomoonboys.com/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png">
  <meta name="twitter:card" content="summary_large_image">
  <title>${escapeHtml(title)} - Crypto Moonboys Wiki</title>
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="icon" type="image/png" href="/favicon.png">
</head>
<body class="page-category page-standard-shell">
<main id="content" role="main">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/index.html">Home</a><span class="sep">&rsaquo;</span><a href="/categories/index.html">Categories</a><span class="sep">&rsaquo;</span><span aria-current="page">${escapeHtml(title)}</span></nav>
      <div class="category-header"><span class="cat-big-icon" aria-hidden="true">NFT</span><div><h1 class="page-title">${escapeHtml(title)}</h1><p style="color:var(--color-text-muted)">${escapeHtml(description)}</p></div></div>
      <div class="page-title-line" aria-hidden="true"></div>
      <p style="color:var(--color-text-muted);margin-bottom:24px">${escapeHtml(intro)}</p>
${sections.join('\n')}
    </main>

<!-- Canonical script boot -->
<script data-cfasync="false" src="/js/api-config.js"></script>
<script data-cfasync="false" src="/js/arcade/core/global-event-bus.js"></script>
<script data-cfasync="false" src="/js/identity-gate.js"></script>
<script data-cfasync="false" src="/js/core/moonboys-state.js"></script>
<script data-cfasync="false" src="/js/core/daily-loop-state.js"></script>
<script data-cfasync="false" src="/js/site-shell.js"></script>
<script data-cfasync="false" src="/js/components/connection-status-panel.js"></script>
<script data-cfasync="false" src="/js/components/global-player-header.js"></script>
<script data-cfasync="false" src="/js/components/live-activity-summary.js"></script>
<script data-cfasync="false" src="/js/wiki.js"></script>
<script data-cfasync="false" src="/js/faction-alignment.js"></script>
</body>
</html>
`;
}

const wikiIndex = readJson(WIKI_INDEX);
const entries = Array.isArray(wikiIndex) ? wikiIndex : [];
const byUrl = indexByUrl(entries);
const entry = (url, fallbackTitle, fallbackDescription, eyebrow = 'NFT') => {
  return {
    url,
    title: fallbackTitle || titleFor(byUrl.get(url)),
    description: fallbackDescription || descFor(byUrl.get(url)),
    eyebrow,
  };
};

const featuredTemplates = entries
  .filter((candidate) => isGkniftyTemplateUrl(candidate.url))
  .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
  .slice(0, FEATURED_TEMPLATE_LIMIT)
  .map((candidate) => ({
    url: candidate.url,
    title: titleFor(candidate),
    description: descFor(candidate, 'Featured GKniftyHEADS WAX AtomicAssets template page.'),
    eyebrow: 'NFT',
  }));

const gkniftyHub = entry('/wiki/gkniftyheads.html', 'GKniftyHEADS Hub', 'Parent brand and lore hub for the GKniftyHEADS collection.', 'Hub');
const collection = entry(FULL_COLLECTION_URL, 'GKniftyHEADS NFT Collection', 'Full generated index for the WAX AtomicAssets collection and all template pages.', 'Index');
const waxCategory = { url: '/categories/wax-nfts.html', title: 'WAX NFTs', description: 'Compact hub for WAX AtomicAssets NFT pages.', eyebrow: 'WAX' };
const gkniftyCategory = { url: '/categories/gkniftyheads.html', title: 'GKniftyHEADS Category', description: 'Parent category for the GKniftyHEADS hub, collection, and templates.', eyebrow: 'GK' };
const nftDigitalArt = { url: '/categories/nfts-digital-art.html', title: 'NFTs & Digital Art', description: 'Broader NFT and digital art category across the Crypto Moonboys wiki.', eyebrow: 'Art' };
const nftsCategory = { url: '/categories/nfts.html', title: 'NFTs', description: 'Compact hub for NFT collection and template pages.', eyebrow: 'NFT' };
const atomicAssets = entry('/wiki/atomicassets.html', 'AtomicAssets', 'WAX NFT standard and data source context used by the generated pages.', 'WAX');
const graffpunks = entry('/wiki/graffpunks.html', 'GraffPUNKS', 'Related faction and culture context for GKniftyHEADS.', 'Lore');
const graffitiKings = entry('/wiki/graffiti-kings.html', 'Graffiti Kings', 'Street art context connected to the GKniftyHEADS universe.', 'Lore');
const hodlWars = entry('/wiki/hodl-wars.html', 'HODL WARS', 'Game and lore context referenced by GKniftyHEADS pages.', 'Lore');

const pages = [
  {
    slug: 'nfts',
    title: 'NFTs',
    description: 'Compact NFT category hub for collection pages, WAX NFT context, and featured GKniftyHEADS templates.',
    intro: 'NFT category buttons route here as a hub, not a complete template dump. The full GKniftyHEADS template index remains on the collection page.',
    sections: [
      section('Main Hubs', 'Start with the primary NFT and GKniftyHEADS navigation points.', [collection, gkniftyHub, waxCategory, gkniftyCategory, nftDigitalArt]),
      section('Collections', 'Collection-level pages belong here; full template lists stay on collection pages.', [collection]),
      section('Featured Templates', `A capped sample of ${FEATURED_TEMPLATE_LIMIT} GKniftyHEADS NFT template pages.`, featuredTemplates),
      section('Explore More', 'Open the complete generated collection index when you need every template.', [collection]),
      section('Related Lore / Factions', 'Context pages that explain the culture around the collection.', [graffpunks, graffitiKings, hodlWars]),
    ],
  },
  {
    slug: 'wax-nfts',
    title: 'WAX NFTs',
    description: 'Compact WAX NFT hub for AtomicAssets-powered collection and template pages.',
    intro: 'WAX NFT category buttons route here for AtomicAssets context, collection navigation, and a capped featured-template preview.',
    sections: [
      section('Main Hubs', 'Start with the WAX NFT collection, parent hub, and AtomicAssets context.', [collection, gkniftyHub, atomicAssets, nftsCategory]),
      section('Collections', 'Collection pages carry the full generated WAX template index.', [collection]),
      section('Featured Templates', `A capped sample of ${FEATURED_TEMPLATE_LIMIT} WAX NFT template pages.`, featuredTemplates),
      section('Explore More', 'Use the collection index for the full 143-template list.', [collection]),
    ],
  },
  {
    slug: 'gkniftyheads',
    title: 'GKniftyHEADS',
    description: 'Compact GKniftyHEADS parent hub for the brand page, collection index, featured templates, and related context.',
    intro: 'This parent category connects the GKniftyHEADS hub, the generated WAX AtomicAssets collection index, and a small featured set of child template pages.',
    sections: [
      section('Main Hubs', 'The parent brand hub and generated collection index are the main routes.', [gkniftyHub, collection]),
      section('Collections', 'Collection-level entry for the complete WAX AtomicAssets template index.', [collection]),
      section('Featured Templates', `A capped sample of ${FEATURED_TEMPLATE_LIMIT} GKniftyHEADS NFT template pages.`, featuredTemplates),
      section('Explore More', 'Open the complete collection page for the full template list.', [collection]),
      section('Related Lore / Factions', 'Related context for GraffPUNKS, Graffiti Kings, and HODL WARS.', [graffpunks, graffitiKings, hodlWars]),
    ],
  },
];

fs.mkdirSync(CATEGORIES_DIR, { recursive: true });
for (const page of pages) {
  const outPath = path.join(CATEGORIES_DIR, `${page.slug}.html`);
  fs.writeFileSync(outPath, pageHtml(page), 'utf8');
  console.log(`wrote categories/${page.slug}.html (${FEATURED_TEMPLATE_LIMIT} featured template cards max)`);
}

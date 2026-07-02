#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PAGE_PATH = path.join(ROOT, 'wiki', 'gkniftyheads-nft-collection.html');

const DESCRIPTION = 'GKniftyHEADS NFT collection hub with rarity ranking, WAX template links, collection actions, schema summary, and source references.';

const ATOMICHUB_FUN_COUPON_URL = 'https://wax.atomichub.io/market?blockchain=wax-mainnet&order=asc&primary_chain=wax-mainnet&sort=price&symbol=WAX&template_id=782888#sales';
const NEFTY_BLEND_URL = 'https://neftyblocks.com/collection/gkniftyheads/blends';
const ATOMICHUB_COLLECTION_URL = 'https://wax.atomichub.io/explorer/collection/gkniftyheads';

const SCHEMA_LABELS = {
  bmhodlwarsyo: ['HODL WARS Battle Mechs', 'HODL WARS / battle-card template schema'],
  bshodlwarsyo: ['HODL WARS Blockstars / Battle Stars', 'HODL WARS / Blockstars battle-card template schema'],
  darrencullen: ['Darren Cullen', 'Darren Cullen / creator template schema'],
  dbhodlwarsyo: ['HODL WARS Ducky Boys', 'HODL WARS / Ducky Boys battle-card template schema'],
  freemindsgk: ['Free Minds GK', 'Free Minds GK creator template schema'],
  gkhodlwarsyo: ['GKniftyHEADS HODL WARS', 'GKniftyHEADS HODL WARS battle-card template schema'],
  gkniftyheads: ['GKniftyHEADS', 'Core GKniftyHEADS collection template schema'],
  killakelafam: ['Killa Kela Family', 'Killa Kela family / creator template schema'],
  moongirlsexy: ['Crypto Moongirls', 'Crypto Moongirls related creator template schema'],
  mrcheowaxnft: ['Mr Cheo WAX NFT', 'Mr Cheo creator template schema'],
  noballgames: ['No Ball Games', 'No Ball Games creator template schema'],
  cryptomoonboys: ['Crypto Moonboys', 'Crypto Moonboys related template schema'],
  graffpunks: ['GraffPUNKS', 'GraffPUNKS related template schema'],
  tphodlwarsyo: ['HODL WARS The Pu55ie$', 'HODL WARS / The Pu55ie$ battle-card template schema'],
};

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function titleCaseSlug(slug) {
  return String(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const date = new Date(numeric);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function replaceOrThrow(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`Could not find ${label} in GKniftyHEADS collection page.`);
  return html.replace(pattern, replacement);
}

function cleanHero(html) {
  if (html.includes('class="gk-intro-card-grid"')) return html;
  const cleanLead = `<div class="gk-intro-card-grid" aria-label="GKniftyHEADS collection overview">
            <div class="gk-info-card gk-info-card--primary">
              <span>Collection hub</span>
              <p>GKniftyHEADS is a WAX AtomicAssets collection hub for templates, collection actions, rarity context, and source-backed navigation into the wider Crypto Moonboys wiki.</p>
            </div>
            <div class="gk-info-card">
              <span>Collector flow</span>
              <p>Use the action buttons for coupons, blends, and AtomicHub collection browsing; use the rarity deck below for template and exact NFT ranking.</p>
            </div>
          </div>
          <div class="wiki-action-row gk-collection-actions" aria-label="GKniftyHEADS collection actions">
            <a class="wiki-action-button" href="${esc(ATOMICHUB_FUN_COUPON_URL)}" target="_blank" rel="noopener noreferrer">Buy / View GKniftyHEADS Fun Coupons</a>
            <a class="wiki-action-button" href="${esc(NEFTY_BLEND_URL)}" target="_blank" rel="noopener noreferrer">Burn / Blend on NeftyBlocks</a>
            <a class="wiki-action-button" href="${esc(ATOMICHUB_COLLECTION_URL)}" target="_blank" rel="noopener noreferrer">View Collection on AtomicHub</a>
          </div>`;
  return replaceOrThrow(
    html,
    /<p class="lead-paragraph">[\s\S]*?<\/p>\s*<div class="wiki-action-row gk-collection-actions"[\s\S]*?<\/div>\s*(?=<div class="category-tags)/,
    `${cleanLead}\n`,
    'raw hero intro'
  );
}

function cleanHeroHubCard(html) {
  if (html.includes('class="gk-info-card gk-parent-hub-card"')) return html;
  return replaceOrThrow(
    html,
    /<p class="lore-paragraph">Parent hub: <a href="\/wiki\/gkniftyheads\.html">GKniftyHEADS<\/a>\. This generated collection index links the parent brand hub to the WAX AtomicAssets NFT template child pages\.<\/p>/,
    `<div class="gk-info-card gk-parent-hub-card">
          <span>Parent hub</span>
          <p><a href="/wiki/gkniftyheads.html">GKniftyHEADS</a> anchors this generated collection index and connects the parent brand hub to WAX AtomicAssets NFT template child pages.</p>
        </div>`,
    'parent hub paragraph'
  );
}

function cleanCollectionSummary(html) {
  if (html.includes('aria-label="Collection summary notes"')) return html;
  return replaceOrThrow(
    html,
    /<p class="lore-paragraph">This page is generated from WAX AtomicAssets API records\. Template pages are used as the main NFT wiki pages because templates describe the unique NFT designs\/types, while individual assets are the minted copies owned by wallets\.<\/p>/,
    `<div class="gk-section-card-grid" aria-label="Collection summary notes">
            <div class="gk-info-card">
              <span>Generated index</span>
              <p>This page is generated from WAX AtomicAssets API records, keeping collection totals and template navigation aligned with the source dataset.</p>
            </div>
            <div class="gk-info-card">
              <span>Template-first wiki</span>
              <p>Template pages act as the main NFT wiki pages because templates describe the unique designs and types; individual assets are wallet-owned minted copies.</p>
            </div>
          </div>`,
    'collection summary paragraph'
  );
}

function schemaRows(schemaTableHtml) {
  const rows = [...schemaTableHtml.matchAll(/<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/gi)];
  return rows.map(([, slugHtml, formatHtml, createdHtml]) => {
    const slug = decodeHtml(slugHtml);
    const [displayName, purpose] = SCHEMA_LABELS[slug] || [titleCaseSlug(slug), `${titleCaseSlug(slug)} template schema`];
    const createdRaw = decodeHtml(createdHtml);
    const createdReadable = formatDate(createdRaw) || 'Unknown';
    return {
      slug,
      displayName,
      purpose,
      createdRaw,
      createdReadable,
      formatHtml,
    };
  });
}

function cleanSchemas(html) {
  if (html.includes('class="wiki-section gk-schema-summary"')) return html;
  const start = html.search(/<section class="wiki-section">\s*<h2 id="schemas">Schemas<\/h2>/i);
  const end = html.search(/<section class="wiki-section">\s*<h2 id="sources">Sources<\/h2>/i);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not find Schemas-to-Sources section boundary in GKniftyHEADS collection page.');
  }
  const oldSection = html.slice(start, end);
  const rows = schemaRows(oldSection);
  const readableRows = rows.map((row) => `            <tr>
              <td><code>${esc(row.slug)}</code></td>
              <td>${esc(row.displayName)}</td>
              <td>${esc(row.purpose)}</td>
              <td><span title="${esc(row.createdRaw)}">${esc(row.createdReadable)}</span></td>
            </tr>`).join('\n');
  const developerRows = rows.map((row) => `              <tr>
                <td><code>${esc(row.slug)}</code></td>
                <td><code>${esc(decodeHtml(row.formatHtml))}</code></td>
                <td>${esc(row.createdRaw)}</td>
              </tr>`).join('\n');
  const cleanSection = `<section class="wiki-section gk-schema-summary">
          <h2 id="schemas">Schema Summary</h2>
          <p class="lore-paragraph">Schemas group GKniftyHEADS templates by creator, collaboration, or HODL WARS card family. The normal view shows readable labels; raw AtomicAssets field formats stay in the collapsed developer details.</p>
          <div class="wiki-table-wrap">
            <table class="wiki-table nft-schema-table">
              <thead>
                <tr><th>Schema</th><th>Display Name</th><th>Purpose / Notes</th><th>Created</th></tr>
              </thead>
              <tbody>
${readableRows}
              </tbody>
            </table>
          </div>
          <details class="developer-details gk-schema-developer-details">
            <summary>Developer schema field details</summary>
            <div class="wiki-table-wrap">
              <table class="wiki-table nft-schema-developer-table">
                <thead>
                  <tr><th>Schema</th><th>AtomicAssets format</th><th>Raw created timestamp</th></tr>
                </thead>
                <tbody>
${developerRows}
                </tbody>
              </table>
            </div>
          </details>
        </section>`;
  return `${html.slice(0, start)}${cleanSection}\n\n        ${html.slice(end)}`;
}

function run() {
  let html = fs.readFileSync(PAGE_PATH, 'utf8');
  html = replaceOrThrow(
    html,
    /<meta name="description" content="[\s\S]*?">\s*<meta name="robots"/,
    `<meta name="description" content="${esc(DESCRIPTION)}">\n  <meta name="robots"`,
    'meta description'
  );
  html = replaceOrThrow(
    html,
    /<meta property="og:description" content="[\s\S]*?">\s*<meta property="og:type"/,
    `<meta property="og:description" content="${esc(DESCRIPTION)}">\n  <meta property="og:type"`,
    'Open Graph description'
  );
  html = html
    .replace(/<meta property="og:title" content="gkniftyheads NFT Collection - Crypto Moonboys Wiki">/, '<meta property="og:title" content="GKniftyHEADS NFT Collection - Crypto Moonboys Wiki">')
    .replace(/<title>gkniftyheads NFT Collection - Crypto Moonboys Wiki<\/title>/, '<title>GKniftyHEADS NFT Collection - Crypto Moonboys Wiki</title>')
    .replace(/<h1 class="page-title">gkniftyheads NFT Collection<\/h1>/, '<h1 class="page-title">GKniftyHEADS NFT Collection</h1>')
    .replace(/<span aria-current="page">gkniftyheads NFT Collection<\/span>/, '<span aria-current="page">GKniftyHEADS NFT Collection</span>')
    .replace(/<a href="\/categories\/gkniftyheads\.html">gkniftyheads<\/a>/, '<a href="/categories/gkniftyheads.html">GKniftyHEADS</a>');
  html = cleanHero(html);
  html = cleanHeroHubCard(html);
  html = cleanCollectionSummary(html);
  html = cleanSchemas(html);
  fs.writeFileSync(PAGE_PATH, html, 'utf8');
  console.log('Cleaned GKniftyHEADS collection page shell.');
}

run();

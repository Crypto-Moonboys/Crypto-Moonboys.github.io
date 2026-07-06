#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function check(condition, message) {
  if (!condition) failures.push(message);
  else console.log(`[PASS] ${message}`);
}

function requireFile(relPath) {
  check(exists(relPath), `${relPath} exists`);
  return exists(relPath) ? read(relPath) : '';
}

const contract = requireFile('docs/og-page-template-contract.md');
const instructions = requireFile('.github/instructions/og-page-templates.instructions.md');
const battleLayer = requireFile('js/battle-layer.js');
const battleCss = requireFile('css/battle-layer.css');
const wikiCss = requireFile('css/wiki.css');
const ciRunner = requireFile('scripts/ci-domain-runner.mjs');

const templates = [
  ['templates/og/wiki-page.html', 'wiki_article'],
  ['templates/og/nft-collection-page.html', 'nft_collection'],
  ['templates/og/nft-template-page.html', 'nft_template'],
  ['templates/og/crypto-token-page.html', 'crypto_token'],
];
const canonicalScripts = [
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/faction-alignment.js',
  '/js/wiki.js',
  '/js/bible-loader.js',
  '/js/engagement.js',
  '/js/comments.js',
  '/js/battle-layer.js',
];

check(
  contract.includes('HODLKONG64/THEY-CALL-ME-THE-DADDY') &&
    instructions.includes('HODLKONG64/THEY-CALL-ME-THE-DADDY'),
  'external page agents are explicitly pointed at the OG template contract',
);
check(
  contract.includes('WAX AtomicAssets pages only') &&
    contract.includes('Keep current collection weighting/ranking semantics'),
  'NFT template contract preserves WAX-only collection ranking authority',
);
check(
  contract.includes('citation voting and comments at the bottom') &&
    instructions.includes('Keep live vote/comment sections at the bottom'),
  'vote/comment bottom placement is documented for future page agents',
);

for (const [relPath, pageType] of templates) {
  const html = requireFile(relPath);
  check(html.includes(`data-page-type="${pageType}"`), `${relPath} declares data-page-type="${pageType}"`);
  check(html.includes('page-wiki page-standard-shell'), `${relPath} uses the shared wiki shell`);
  check(html.includes('<header class="wiki-hero">'), `${relPath} uses the shared top hero card`);
  check(html.includes('/js/battle-layer.js'), `${relPath} loads the engagement layer`);
  check(html.includes('/js/engagement.js') && html.includes('/js/comments.js'), `${relPath} loads live vote/comment scripts`);
  for (const src of canonicalScripts) {
    check(
      html.includes(`<script data-cfasync="false" src="${src}"></script>`),
      `${relPath} loads canonical boot script ${src} with Rocket Loader bypass`,
    );
  }
  check(html.includes('class="wiki-comments"'), `${relPath} keeps comments at the bottom`);
  check(html.includes('citation-vote-panel'), `${relPath} keeps citation voting near the bottom`);
  check(html.includes('data-cite-id="citation-panel"') && !html.includes('data-cite-id="page"'), `${relPath} uses the standard citation panel vote id`);
}

check(
  read('templates/og/wiki-page.html').includes('        {{BODY}}') &&
    !read('templates/og/wiki-page.html').includes('<p>{{BODY}}</p>') &&
    !read('templates/og/wiki-page.html').includes('<p>{{RELATED_PATHS}}</p>') &&
    !read('templates/og/crypto-token-page.html').includes('<p>{{RELATED_PATHS}}</p>'),
  'structured placeholders are not forced into invalid paragraph wrappers',
);

check(
  read('templates/og/nft-collection-page.html').includes('WAX AtomicAssets only') &&
    read('templates/og/nft-template-page.html').includes('WAX AtomicAssets') &&
    read('templates/og/nft-collection-page.html').includes('Ranking uses approved WAX AtomicAssets rarity and supply data; non-WAX markets are not included.'),
  'NFT templates keep WAX-only source language in the page skeletons',
);
check(
  !read('templates/og/nft-collection-page.html').includes('Keep the existing WAX collection ranking weights') &&
    !read('templates/og/crypto-token-page.html').includes('Render only approved feed values') &&
    read('templates/og/crypto-token-page.html').includes('Values are loaded from the approved live feed source shown above; prices are not hardcoded.'),
  'template enforcement copy is reader-facing, not internal agent guidance',
);
check(
  read('templates/og/nft-collection-page.html').includes('og-collapsible-data') &&
    read('templates/og/nft-template-page.html').includes('og-collapsible-data'),
  'NFT templates mark large data blocks for collapsible display',
);

check(
  battleLayer.includes('buildTemplateMediaShell() + buildMissionHTML(pageId, engagement)') &&
    battleLayer.includes('battle-engagement-deck--nft-template'),
  'NFT template pages render art beside one Daily Missions card with embedded Battle Heat',
);
check(
  battleLayer.includes('function injectTemplateMedia(deck)') &&
    battleLayer.includes("document.querySelector('template[data-battle-media=\"nft\"]')") &&
    battleLayer.includes("deck.querySelector('.battle-shell--media .battle-shell-inner')") &&
    battleLayer.includes('mediaTarget.appendChild(clone)'),
  'battle layer owns NFT media template cloning for new OG pages',
);
check(
  battleLayer.includes('function enhanceNftDataDisclosures()') &&
    battleLayer.includes('og-collapsible-data') &&
    battleLayer.includes("id.replace(/-title$/i, '')") &&
    battleLayer.includes("button.textContent = 'Show data'"),
  'current NFT pages get collapsible heavy data controls from the shared layer',
);
check(
  battleCss.includes('battle-engagement-deck--nft-template') &&
    battleCss.includes('.battle-shell--media') &&
    battleCss.includes('.battle-heat-summary'),
  'NFT template engagement deck has scoped media and heat summary styles',
);
check(
  wikiCss.includes('@keyframes ogHeroGlow') &&
    wikiCss.includes('body.page-wiki .wiki-hero h1') &&
    wikiCss.includes('animation: ogHeroGlow') &&
    wikiCss.includes('@media (prefers-reduced-motion: reduce)'),
  'wiki hero titles inherit the requested pulsing/glowing top-card treatment',
);
check(
  wikiCss.includes('body.page-wiki .wiki-comments') &&
    wikiCss.includes('body.page-wiki .comment-form-identity') &&
    wikiCss.includes('body.page-wiki .citation-vote-panel-actions') &&
    wikiCss.includes('margin: clamp(24px, 3vw, 42px) auto 0;'),
  'bottom comments and citation vote panels have shared spacing/padding styles',
);
check(
  ciRunner.includes("['node', 'scripts/og-page-template-contract.test.mjs']"),
  'OG page template contract regression runs in the wiki CI domain',
);

if (failures.length) {
  console.error(`\nOG page template contract failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nOG page template contract passed.\n');

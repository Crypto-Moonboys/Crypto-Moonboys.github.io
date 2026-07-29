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
const generatedNftPage = requireFile('wiki/gkniftyheads-token-temptress-783401.html');

const canonicalTemplates = [
  ['og-templates/wiki-page.html', 'https://cryptomoonboys.com/og-templates/wiki-page.html'],
  ['og-templates/nft-collection-page.html', 'https://cryptomoonboys.com/og-templates/nft-collection-page.html'],
  ['og-templates/nft-template-page.html', 'https://cryptomoonboys.com/og-templates/nft-template-page.html'],
  ['og-templates/crypto-token-page.html', 'https://cryptomoonboys.com/og-templates/crypto-token-page.html'],
];

const retiredRawTemplates = [
  'templates/og/wiki-page.html',
  'templates/og/nft-collection-page.html',
  'templates/og/nft-template-page.html',
  'templates/og/crypto-token-page.html',
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

check(
  canonicalTemplates.every(([relPath]) =>
    contract.includes(`/${relPath}`) && instructions.includes(`/${relPath}`),
  ),
  'canonical OG template routes are documented for future page agents',
);

for (const relPath of retiredRawTemplates) {
  check(!exists(relPath), `${relPath} remains deleted`);
}

for (const [relPath, canonicalUrl] of canonicalTemplates) {
  const html = requireFile(relPath);
  check(html.includes('page-wiki page-standard-shell'), `${relPath} uses the public wiki shell`);
  check(html.includes('<main id="content" role="main">'), `${relPath} preserves the main landmark`);
  check(html.includes('<header class="wiki-hero">'), `${relPath} uses the shared top hero card`);
  check(html.includes('<meta name="robots" content="index, follow">'), `${relPath} is crawlable`);
  check(html.includes(`<link rel="canonical" href="${canonicalUrl}">`), `${relPath} has its canonical URL`);
  check(!html.includes('{{'), `${relPath} does not publish unresolved placeholders`);
  check(!html.includes('/templates/og/'), `${relPath} does not link to deleted raw templates`);
  check(!html.includes('data-template-source='), `${relPath} has no deleted source-template metadata`);
}

const wikiGuide = read('og-templates/wiki-page.html');
check(wikiGuide.includes('/js/battle-layer.js'), 'canonical wiki template loads the engagement layer');
check(wikiGuide.includes('/js/engagement.js') && wikiGuide.includes('/js/comments.js'), 'canonical wiki template loads live vote/comment scripts');
check(wikiGuide.includes('class="wiki-comments"'), 'canonical wiki template keeps comments at the bottom');
check(wikiGuide.includes('/js/wiki-live-contributors.js'), 'canonical wiki template loads live contributors');

check(
  generatedNftPage.includes('<meta name="description"') &&
    generatedNftPage.includes('<meta name="robots" content="index, follow"') &&
    generatedNftPage.includes('<link rel="canonical"') &&
    generatedNftPage.includes('<meta property="og:image"'),
  'current generated NFT page exposes standard SEO metadata',
);

check(
  battleLayer.includes('buildTemplateMediaShell() + buildMissionHTML(pageId, engagement)') &&
    battleLayer.includes('battle-engagement-deck--nft-template'),
  'NFT template pages render art beside Daily Missions with embedded Battle Heat',
);

check(
  battleLayer.includes('function injectTemplateMedia(deck)') &&
    battleLayer.includes("document.querySelector('template[data-battle-media=\"nft\"]')") &&
    battleLayer.includes("deck.querySelector('.battle-shell--media .battle-shell-inner')") &&
    battleLayer.includes('mediaTarget.appendChild(clone)'),
  'battle layer owns NFT media template cloning',
);

check(
  battleLayer.includes('function enhanceNftDataDisclosures()') &&
    battleLayer.includes('og-collapsible-data') &&
    battleLayer.includes("button.textContent = 'Show data'"),
  'current NFT pages retain collapsible heavy-data controls',
);

check(
  battleCss.includes('battle-engagement-deck--nft-template') &&
    battleCss.includes('.battle-shell--media') &&
    battleCss.includes('.battle-heat-summary'),
  'NFT engagement deck styles remain present',
);

check(
  wikiCss.includes('@keyframes ogHeroGlow') &&
    wikiCss.includes('body.page-wiki .wiki-hero h1') &&
    wikiCss.includes('animation: ogHeroGlow') &&
    wikiCss.includes('@media (prefers-reduced-motion: reduce)'),
  'wiki hero titles retain the shared glowing treatment',
);

check(
  wikiCss.includes('body.page-wiki .wiki-comments') &&
    wikiCss.includes('body.page-wiki .comment-form-identity') &&
    battleLayer.includes("'.citations-list li, .source-ref-list li, .sources-list li'"),
  'bottom comments and inline citation hooks remain wired',
);

check(
  ciRunner.includes("['node', 'scripts/og-page-template-contract.test.mjs']"),
  'OG page template contract regression runs in the wiki CI domain',
);

check(
  !read('scripts/import-website-publish-payloads.mjs').includes('function injectBattleMedia'),
  'website payload importer does not emit duplicate inline NFT media injection',
);

if (failures.length) {
  console.error(`\nOG page template contract failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nOG page template contract passed.\n');

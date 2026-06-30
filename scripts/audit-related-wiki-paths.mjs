#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const CORE_PAGE = 'wiki/crypto-moonboys.html';
const MAX_GROUP_ITEMS = 8;
const MAX_NFT_LINKS_IN_SECTION = 8;
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function hrefs(html) {
  return [...String(html || '').matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function extractRelatedSection(html) {
  return html.match(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/i)?.[0] || '';
}

function extractGroups(section) {
  return [...section.matchAll(/<div\b[^>]*class=["'][^"']*\bwiki-rabbit-group\b[^"']*["'][\s\S]*?<\/div>/gi)].map((match) => match[0]);
}

function isNftTemplatePage(file, html) {
  if (/data-page-type=["']nft_collection["']/i.test(html)) return false;
  return /data-page-type=["']nft_template["']/i.test(html) ||
    /class=["'][^"']*\bnft-template-article\b/i.test(html) ||
    /^gkniftyheads-.+-\d{5,}\.html$/i.test(file);
}

function isContentPage(html) {
  if (/\bdata-wiki-stub=["']true["']/i.test(html)) return false;
  if (/<meta\b[^>]*http-equiv=["']refresh["']/i.test(html)) return false;
  if (/<meta\b(?=[^>]*name=["']robots["'])(?=[^>]*content=["'][^"']*\bnoindex\b)[^>]*>/i.test(html)) return false;
  return /<article\b/i.test(html) || /class=["'][^"']*\bwiki-content\b/i.test(html) || /data-page-type=["']nft_/i.test(html);
}

function assertHasLinks(html, relPath, links) {
  for (const link of links) {
    check(html.includes(`href="${link}"`), `${relPath} must link to ${link}`);
  }
}

function assertRelatedSection(relPath, html) {
  const section = extractRelatedSection(html);
  check(Boolean(section), `${relPath} must contain a Related Wiki Paths section`);
  if (!section) return '';

  check(/data-related-wiki-paths=["']true["']/i.test(section), `${relPath} related section must be machine-auditable`);
  check(!/\bhref=["']https?:\/\//i.test(section), `${relPath} related section must not contain external links`);

  const groups = extractGroups(section);
  check(groups.length > 0, `${relPath} related section must contain grouped link blocks`);
  for (const group of groups) {
    const items = (group.match(/<li\b/gi) || []).length;
    check(items <= MAX_GROUP_ITEMS, `${relPath} related group has ${items} links; cap is ${MAX_GROUP_ITEMS}`);
  }

  const nftLinks = hrefs(section).filter((href) => /^\/wiki\/gkniftyheads-.+-\d{5,}\.html$/i.test(href));
  check(
    nftLinks.length <= MAX_NFT_LINKS_IN_SECTION,
    `${relPath} related section has ${nftLinks.length} direct NFT template links; cap is ${MAX_NFT_LINKS_IN_SECTION}`
  );

  return section;
}

const coreHtml = read(CORE_PAGE);
const coreSection = assertRelatedSection(CORE_PAGE, coreHtml);
assertHasLinks(coreHtml, CORE_PAGE, [
  '/wiki/gkniftyheads.html',
  '/wiki/gkniftyheads-nft-collection.html',
  '/wiki/graffpunks.html',
  '/wiki/hodl-wars.html',
  '/wiki/hodl-warriors.html',
  '/wiki/block-topia.html',
  '/timeline.html',
  '/graph.html?mode=hero',
  '/categories/nfts.html',
  '/categories/wax-nfts.html',
  '/categories/nfts-digital-art.html',
  '/categories/lore.html',
  '/categories/gaming.html',
  '/categories/gkniftyheads.html',
]);
check(coreHtml.includes('Crypto Moonboys'), `${CORE_PAGE} must visibly label Crypto Moonboys as a hub/tag path`);

const coreCategoryBlock = coreHtml.match(/<div class=["']category-tags["'] aria-label=["']Article categories["']>[\s\S]*?<\/div>/i)?.[0] || '';
const coreCategoryLinks = hrefs(coreCategoryBlock);
check(
  !(coreCategoryLinks.length === 1 && coreCategoryLinks[0] === '/categories/community-people.html'),
  `${CORE_PAGE} must not expose only Community & People as its category/rabbit-hole path`
);
check(
  coreCategoryLinks.includes('/categories/nfts.html') && coreCategoryLinks.includes('/categories/wax-nfts.html'),
  `${CORE_PAGE} category tags must expose NFT and WAX NFT paths`
);
check(
  coreSection.includes('Core Project Links') &&
    coreSection.includes('Related Categories') &&
    coreSection.includes('Related NFT Templates') &&
    coreSection.includes('Timeline / Graph / Dashboard Links'),
  `${CORE_PAGE} related section must be grouped by wiki path type`
);

const wikiFiles = fs.readdirSync(WIKI_DIR).filter((file) => file.endsWith('.html') && file !== 'index.html').sort();
const nftPages = [];

for (const file of wikiFiles) {
  const relPath = `wiki/${file}`;
  const html = read(relPath);
  if (!isContentPage(html)) continue;
  const section = assertRelatedSection(relPath, html);
  if (!isNftTemplatePage(file, html)) continue;
  nftPages.push(relPath);

  assertHasLinks(section || html, relPath, [
    '/wiki/gkniftyheads-nft-collection.html',
    '/wiki/gkniftyheads.html',
    '/wiki/crypto-moonboys.html',
    '/categories/gkniftyheads.html',
    '/categories/nfts.html',
    '/categories/wax-nfts.html',
    '/categories/nfts-digital-art.html',
  ]);
  check(section.includes('Collection Links'), `${relPath} must group collection links`);
  check(section.includes('Related Categories'), `${relPath} must group category links`);
  check(section.includes('More from this collection'), `${relPath} must group capped collection neighbors`);
}

check(nftPages.length >= 140, `expected at least 140 NFT template pages, found ${nftPages.length}`);

if (failures.length) {
  console.error(`Related Wiki Paths audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Related Wiki Paths audit passed: ${wikiFiles.length} wiki pages and ${nftPages.length} NFT template pages checked.`);

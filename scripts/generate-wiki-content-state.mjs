#!/usr/bin/env node

/**
 * Deterministic wiki content-ownership inventory and rewrite-queue generator.
 *
 * Default behaviour writes both generated artifacts. Pass --check to compare the
 * working tree with freshly generated output without modifying either file.
 * Transaction callers may instead stage both outputs in an empty anchored
 * directory with --output-dir or, preferably, an inherited --output-fd.
 *
 * This file deliberately classifies existing prose; it never edits wiki pages
 * and never attempts to decide disputed lore truth.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractCanonicalContentHtml,
  findFirstActiveOpeningTag,
  inspectOwnershipTopology,
  readHtmlAttribute,
  readHtmlAttributes,
  selectCanonicalContentRoot,
  tokenizeActiveHtml,
} from './wiki-html-structure.mjs';

const require = createRequire(import.meta.url);
const { canonicalizeSlug, isAliasSlug } = require('./wiki-aliases.js');
const publishGate = require('./wiki-publish-gate.js');
const PUBLISH_GATE_CANON = publishGate.loadBrandCanon();

export const MANUAL_CONTENT_BEGIN = '<!-- MANUAL_CONTENT:BEGIN -->';
export const MANUAL_CONTENT_END = '<!-- MANUAL_CONTENT:END -->';
export const SAM_CONTENT_BEGIN = '<!-- SAM_CONTENT:BEGIN -->';
export const SAM_CONTENT_END = '<!-- SAM_CONTENT:END -->';
export const CANONICAL_CONTENT_BEGIN = '<!-- CANONICAL_CONTENT:BEGIN -->';
export const CANONICAL_CONTENT_END = '<!-- CANONICAL_CONTENT:END -->';
export const RELATED_CONTENT_BEGIN = '<!-- RELATED_WIKI_PATHS:BEGIN -->';
export const RELATED_CONTENT_END = '<!-- RELATED_WIKI_PATHS:END -->';

const OWNERSHIP_MARKER_DEFINITIONS = Object.freeze([
  { label: 'MANUAL_CONTENT', begin: MANUAL_CONTENT_BEGIN, end: MANUAL_CONTENT_END },
  { label: 'SAM_CONTENT', begin: SAM_CONTENT_BEGIN, end: SAM_CONTENT_END, maxBlocks: 1 },
  { label: 'CANONICAL_CONTENT', begin: CANONICAL_CONTENT_BEGIN, end: CANONICAL_CONTENT_END, maxBlocks: 1 },
]);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const BIBLE_DIR = path.join(WIKI_DIR, 'bibles');
const MANIFEST_PATH = path.join(ROOT, 'brand-canon', 'wiki-content-state.json');
const REPORT_PATH = path.join(ROOT, 'brand-canon', 'wiki-rewrite-audit.md');
const ABSENT_STUBS_PATH = path.join(ROOT, 'brand-canon', 'wiki-absent-stubs.json');
export const MAX_STUB_ARTICLE_WORDS = 250;

const REWRITE_STATUSES = Object.freeze([
  'KEEP',
  'REWRITE_FULL',
  'RECONCILE',
  'DEDUPE',
  'EXPAND',
  'ARCHIVE_STYLE',
  'GENERATED',
  'NFT_SPECIALIST',
  'FIRST_WITNESS_LOCKED',
  'NEEDS_HUMAN_REVIEW',
]);

const AUTOMATION_POLICIES = Object.freeze([
  'metadata-only',
  'replace-sam-block',
  'canon-locked',
  'stub-allowed',
]);

export const REPORT_CLUSTERS = Object.freeze([
  'Core cosmology / history',
  'Block Topia',
  'Bitcoin KiD / Bitcoin Kids / Bitcoin X Kids',
  'HODL Warriors / HODL X Warriors',
  'NULL / Antichain',
  'Forty factions',
  'GraffPUNKS',
  'GKniftyHEADS',
  'Characters',
  'Historical/archive pages',
  'NFT specialist pages',
  'Generated/non-lore pages',
]);

const HTML_ENTITY_MAP = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
});

const NEAR_DUPLICATE_STOP_WORDS = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'between', 'both', 'but', 'by', 'can',
  'could', 'did', 'do', 'does', 'each', 'for', 'from', 'had', 'has', 'have', 'he',
  'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its',
  'more', 'most', 'no', 'not', 'of', 'on', 'one', 'only', 'or', 'other', 'our',
  'out', 'over', 'same', 'she', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'will', 'with', 'would', 'you', 'your',
]);

const CHARACTER_SLUGS = new Set([
  'aleema-child-of-the-shard', 'alfie-bitcoin-kid-blaze', 'ava-chen',
  'billy-the-goat-kid', 'bit-cap-5000', 'bone-idol-ink', 'dragan-volkov',
  'elder-codex-7', 'hex-tagger-prime', 'iris-7', 'jodie-zoom-2000', 'lady-ink',
  'loopfiend', 'm1ntr-k1ll', 'patchwork', 'pyralith', 'queen-sarah-p-fly',
  'quell', 'rune-tag', 'samaelexe', 'satorebel', 'sister-halcyon',
  'snipey-d-man-sirus', 'thera-9', 'thorne-the-architect',
]);

const REAL_PERSON_SLUGS = new Set([
  'charlie-buster', 'darren-cullen', 'delicious-again-pete', 'exyboy',
  'ian-harrison', 'jillian-godsil', 'jonny-laurence-nelson-tag-records',
  'trevor-fung',
]);

const FORTY_FACTION_SLUGS = new Set([
  'the-allcity-bulls', 'the-aztec-raiders', 'the-bally-boys',
  'the-blockchain-furies', 'the-blockstars', 'the-chain-scribes',
  'the-code-alchemists', 'the-crypto-stoned-boys', 'the-ducky-boys',
  'the-evm-punks', 'the-finance-guild', 'the-gasless-ghosts',
  'the-hard-fork-rockers', 'the-high-hats', 'the-information-mercenaries',
  'the-moonlords', 'the-nice-easy-bois', 'the-nomad-bears',
  'the-og-pixel-saints', 'the-rugpull-miners', 'the-salvagers',
  'the-shard-mothers-of-manhattan', 'the-squeaky-pinks', 'the-tuskon-ogs',
]);

const HISTORICAL_ARCHIVE_SLUGS = new Set([
  '2025-metaverse-launch-party', 'bear-market-siege', 'canvas-clash',
  'fomo-plague', 'genesis-spray-drop', 'moon-mission', 'ngmi-chronicles',
  'pixel-journey', 'rave-relics', 'rug-pull-wars', 'rust2riches',
  'storm-struggle', 'stikfamwars', 'the-great-dip', 'wagmi-prophecy',
]);

const NFT_SPECIALIST_SLUGS = new Set([
  '1m-free-nfts-program', 'atomicassets', 'atomichub',
  'atomichub-graffpunks-collection', 'bitcoin-nfts', 'graffpunks-collection',
  'gkniftyheads-nft-collection', 'hodlmoonboys-nft-collection', 'neftyblocks',
  'nfthive', 'nfts', 'nifty-crowns', 'nifty-wizards',
  'noballgamess-nft-collection', 'wax-nft-marketplaces',
]);

const NON_LORE_REFERENCE_SLUGS = new Set([
  '589-xrpl', '666-xrpl', 'alcor-exchange', 'alien-worlds-tlm', 'altcoins',
  'bitcoin-btc', 'bitcoin', 'blockchain', 'defi', 'defi-mining', 'diamond-hands',
  'ethereum', 'ethereum-ecosystem', 'exchanges', 'memecoins', 'paper-hands',
  'solana', 'staking', 'swap-nefty', 'tacoswap', 'tokenomics', 'wallets',
  'wax-blockchain', 'wax-dexs-defi', 'waxp', 'waxp-exchange', 'web3',
  'xrp-ledger',
]);

const HIGH_CONFLICT_SLUGS = new Set([
  'bitcoin-kid-army', 'bitcoin-kids', 'bitcoin-x-kids', 'the-bitcoin-kid-army',
  'genesis-kernel', 'graffiti-kings', 'graffpunks', 'hard-fork-games',
  'hodl-warriors', 'hodl-wars', 'hodl-x-warriors', 'queen-sarah-p-fly',
  'sacred-chain', 'triple-fork-event',
]);

const FULL_REWRITE_SLUGS = new Set([
  'bitcoin-kid-army', 'bitcoin-kids', 'bitcoin-x-kids', 'the-bitcoin-kid-army',
  'hodl-warriors', 'hodl-wars', 'hodl-x-warriors',
]);

const HODL_SAGA_SLUGS = new Set([
  'bear-market-siege', 'diamond-hands', 'fomo-plague', 'hodl-warriors',
  'hodl-wars', 'hodl-x-warriors', 'ngmi-chronicles', 'paper-hands',
  'rug-pull-wars', 'satoshi-scroll', 'storm-struggle', 'the-great-dip',
  'wagmi-prophecy', 'whale-lords',
]);

const CORE_COSMOLOGY_SLUGS = new Set([
  'crypto-moonboys', 'forkborn-collective', 'forksplit', 'genesis-kernel', 'graffiti-nexus',
  'hard-fork-games', 'harrison-rift', 'metropolis', 'sacred-chain',
  'street-kingdoms', 'triple-fork-event',
]);

const BIBLE_ALIASES = Object.freeze({
  '1m-free-nfts-program': '1m-free-nfts-drop',
  'alfie-bitcoin-kid-blaze': 'alfie-the-bitcoin-kid-blaze',
  'bitcoin-kids': 'bitcoin-kid-army',
  'darren-cullen': 'darren-cullen-ser',
  'games4punks-telegram': 'games4punks-telegram-games',
  'hodl-warriors': 'hodl-warriors-army',
  'gkniftyheads': 'the-gkniftyheads',
  'samaelexe': 'samael-exe',
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function listTopLevelWikiHtmlFiles(wikiDir = WIKI_DIR) {
  const rootStats = fs.lstatSync(wikiDir);
  if (rootStats.isSymbolicLink()) {
    throw new Error('wiki: audited wiki directory must not be a symlink');
  }
  if (!rootStats.isDirectory()) {
    throw new Error('wiki: audited wiki path must be a directory');
  }
  const rootRealPath = fs.realpathSync(wikiDir);
  return fs.readdirSync(wikiDir, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.html'))
    .map((entry) => {
      const absolutePath = path.join(wikiDir, entry.name);
      const stats = fs.lstatSync(absolutePath);
      if (entry.isSymbolicLink() || stats.isSymbolicLink()) {
        throw new Error(`wiki/${entry.name}: symlinked wiki HTML is forbidden`);
      }
      if (!stats.isFile()) {
        throw new Error(`wiki/${entry.name}: top-level wiki HTML entry must be a regular file`);
      }
      const resolvedPath = fs.realpathSync(absolutePath);
      const relativePath = path.relative(rootRealPath, resolvedPath);
      if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new Error(`wiki/${entry.name}: wiki HTML resolves outside the audited wiki directory`);
      }
      return entry.name;
    })
    .sort(compareStrings);
}

export function readTopLevelWikiHtmlFile(wikiDir, fileName) {
  if (path.basename(fileName) !== fileName || !fileName.endsWith('.html')) {
    throw new Error(`${fileName}: invalid top-level wiki HTML name`);
  }
  const rootStats = fs.lstatSync(wikiDir);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error('wiki: audited wiki directory must be a real directory');
  }
  const rootRealPath = fs.realpathSync(wikiDir);
  const absolutePath = path.join(wikiDir, fileName);
  const stats = fs.lstatSync(absolutePath);
  if (stats.isSymbolicLink()) throw new Error(`wiki/${fileName}: symlinked wiki HTML is forbidden`);
  if (!stats.isFile()) throw new Error(`wiki/${fileName}: top-level wiki HTML entry must be a regular file`);
  const resolvedPath = fs.realpathSync(absolutePath);
  const relativePath = path.relative(rootRealPath, resolvedPath);
  if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`wiki/${fileName}: wiki HTML resolves outside the audited wiki directory`);
  }

  const descriptor = fs.openSync(
    absolutePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)
  );
  try {
    if (!fs.fstatSync(descriptor).isFile()) {
      throw new Error(`wiki/${fileName}: opened wiki HTML entry is not a regular file`);
    }
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function countMarker(source, marker) {
  return (String(source).match(new RegExp(escapeRegex(marker), 'gi')) || []).length;
}

export function countCanonicalContentBlocks(source) {
  const html = String(source);
  const markerCount = countMarker(html, CANONICAL_CONTENT_BEGIN);
  const withoutMarkedBlocks = html.replace(
    new RegExp(`${escapeRegex(CANONICAL_CONTENT_BEGIN)}[\\s\\S]*?${escapeRegex(CANONICAL_CONTENT_END)}`, 'gi'),
    ' '
  );
  const attributeCount = tokenizeActiveHtml(withoutMarkedBlocks).filter((token) => {
    if (token.type !== 'tag' || token.closing) return false;
    const attribute = readHtmlAttribute(token.raw, 'data-canonical-content');
    return attribute.present && (attribute.value === null || String(attribute.value).toLowerCase() === 'true');
  }).length;
  return markerCount + attributeCount;
}

export function assertValidWikiContentTopology(html, relPath = '<page>') {
  const topology = inspectOwnershipTopology(html, OWNERSHIP_MARKER_DEFINITIONS);
  if (topology.errors.length > 0) {
    throw new Error(`${relPath}: invalid content ownership topology: ${topology.errors.join('; ')}`);
  }
  return topology;
}

export function assertValidStubAtRest({
  relPath = '<page>',
  stub = false,
  currentWordCount = 0,
  manualBlockCount = 0,
  canonicalBlockCount = 0,
} = {}) {
  if (!stub) return;
  if (currentWordCount > MAX_STUB_ARTICLE_WORDS) {
    throw new Error(
      `${relPath}: stub page has ${currentWordCount} visible words; maximum is ${MAX_STUB_ARTICLE_WORDS}`
    );
  }
  if (manualBlockCount > 0 || canonicalBlockCount > 0) {
    throw new Error(`${relPath}: stub page must not contain MANUAL_CONTENT or CANONICAL_CONTENT ownership`);
  }
}

export function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function gitBlobOid(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

export function sourceTreeHashForPages(pages) {
  const material = pages
    .filter((page) => page.page_exists !== false)
    .map((page) => `${page.path}\0${page.content_hash}`)
    .join('\n');
  return sha256(Buffer.from(material, 'utf8'));
}

export function decodeHtmlEntities(value) {
  return String(value).replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi, (entity, key) => {
    if (key[0] === '#') {
      const isHex = key[1]?.toLowerCase() === 'x';
      const number = Number.parseInt(key.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(number) || number < 0 || number > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(number);
      } catch {
        return entity;
      }
    }
    return HTML_ENTITY_MAP[key.toLowerCase()] ?? entity;
  });
}

export function removeRelatedWikiPaths(value) {
  const pattern = /<!--\s*RELATED_WIKI_PATHS:BEGIN\s*-->[\s\S]*?<!--\s*RELATED_WIKI_PATHS:END\s*-->/gi;
  return String(value).replace(pattern, ' ');
}

export function extractArticleHtml(html) {
  return extractCanonicalContentHtml(html);
}

function removeOwnershipBlocks(html) {
  let unowned = String(html || '');
  for (const [begin, end] of [
    [MANUAL_CONTENT_BEGIN, MANUAL_CONTENT_END],
    [SAM_CONTENT_BEGIN, SAM_CONTENT_END],
    [CANONICAL_CONTENT_BEGIN, CANONICAL_CONTENT_END],
  ]) {
    unowned = unowned.replace(
      new RegExp(`${escapeRegex(begin)}[\\s\\S]*?${escapeRegex(end)}`, 'gi'),
      ' '
    );
  }
  return unowned.replace(
    /<([a-z][\w:-]*)\b(?=[^>]*\bdata-canonical-content(?:\s*=\s*["']true["'])?)[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ' '
  );
}

/**
 * Return whether visible article content remains outside every explicit owner
 * block. Marker presence alone is insufficient: stale unmarked prose beside a
 * valid SAM block must still force review.
 */
export function hasLegacyUnmarkedArticleContent(html, {
  firstWitnessPage = false,
  nftTemplateGeneratedPage = false,
} = {}) {
  if (firstWitnessPage || nftTemplateGeneratedPage) return false;
  if (hasRootWikiStubMarker(html)) return false;
  const unownedArticle = extractArticleHtml(removeOwnershipBlocks(html));
  return htmlToVisibleText(unownedArticle).length > 0;
}

export function htmlToVisibleText(fragment) {
  return decodeHtmlEntities(
    removeRelatedWikiPaths(fragment)
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/gu, ' ').trim();
}

/** article-text-v1: no title outside <article>, no generated related-links block. */
export function normalizeArticleText(html) {
  return htmlToVisibleText(extractArticleHtml(html));
}

export function articleContentHash(html) {
  return sha256(Buffer.from(normalizeArticleText(html), 'utf8'));
}

/**
 * article-markup-v1 is the exact canonical root markup with only the generated
 * Related Wiki Paths block removed. It supplements article-text-v1 so changes
 * to visibility-affecting attributes or author-owned markup cannot be hidden by
 * text normalization.
 */
export function normalizeArticleMarkup(html) {
  const selected = selectCanonicalContentRoot(html);
  if (!selected.root) return '';
  return removeRelatedWikiPaths(
    selected.source.slice(selected.root.start, selected.root.end)
  );
}

export function articleMarkupHash(html) {
  return sha256(Buffer.from(normalizeArticleMarkup(html), 'utf8'));
}

export function countWords(value) {
  return String(value).match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function extractTagTexts(articleHtml, tagPattern) {
  const clean = removeRelatedWikiPaths(articleHtml);
  const pattern = new RegExp(`<(?:${tagPattern})\\b[^>]*>([\\s\\S]*?)<\\/(?:${tagPattern})\\s*>`, 'gi');
  return [...clean.matchAll(pattern)].map((match) => htmlToVisibleText(match[1])).filter(Boolean);
}

function duplicateOccurrences(values, minimumCharacters = 1) {
  const seen = new Map();
  const duplicates = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/gu, ' ').trim().toLowerCase();
    if (normalized.length < minimumCharacters) continue;
    const count = (seen.get(normalized) || 0) + 1;
    seen.set(normalized, count);
    if (count > 1) duplicates.push(value);
  }
  return duplicates;
}

export function findExactDuplicateParagraphs(articleHtml) {
  return duplicateOccurrences(extractTagTexts(articleHtml, 'p'), 40);
}

export function findDuplicateHeadings(articleHtml) {
  return duplicateOccurrences(extractTagTexts(articleHtml, 'h[2-6]'), 1);
}

function sectionRecords(articleHtml) {
  const clean = removeRelatedWikiPaths(articleHtml);
  const explicitSections = [...clean.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section\s*>/gi)]
    .map((match, index) => {
      const heading = extractTagTexts(match[1], 'h[2-6]')[0] || `Section ${index + 1}`;
      return { heading, html: match[1], text: htmlToVisibleText(match[1]) };
    });
  if (explicitSections.length >= 2) return explicitSections;

  const chunks = clean.split(/(?=<h[2-6]\b)/i).filter((chunk) => /<h[2-6]\b/i.test(chunk));
  return chunks.map((chunk, index) => ({
    heading: extractTagTexts(chunk, 'h[2-6]')[0] || `Section ${index + 1}`,
    html: chunk,
    text: htmlToVisibleText(chunk),
  }));
}

function comparisonTokens(text) {
  return new Set(
    (String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [])
      .filter((token) => token.length > 1 && !NEAR_DUPLICATE_STOP_WORDS.has(token))
  );
}

export function findLikelyNearDuplicateSections(articleHtml) {
  const allSections = sectionRecords(articleHtml);
  const sections = allSections
    .map((section) => ({ ...section, tokens: comparisonTokens(section.text) }))
    .filter((section) => section.tokens.size >= 20);
  const matches = [];

  for (let firstIndex = 0; firstIndex < sections.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < sections.length; secondIndex += 1) {
      const first = sections[firstIndex];
      const second = sections[secondIndex];
      const shared = [...first.tokens].filter((token) => second.tokens.has(token)).length;
      const union = new Set([...first.tokens, ...second.tokens]).size;
      const similarity = union ? shared / union : 0;
      if (shared >= 15 && similarity >= 0.72 && similarity < 0.995) {
        matches.push({
          kind: 'section_pair',
          first_heading: first.heading,
          second_heading: second.heading,
          similarity: Number(similarity.toFixed(3)),
          shared_token_count: shared,
        });
      }
    }
  }

  for (const section of allSections) {
    const paragraphs = extractTagTexts(section.html, 'p')
      .map((text, index) => ({ index: index + 1, text, tokens: comparisonTokens(text) }))
      .filter((paragraph) => paragraph.tokens.size >= 12);
    for (let firstIndex = 0; firstIndex < paragraphs.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < paragraphs.length; secondIndex += 1) {
        const first = paragraphs[firstIndex];
        const second = paragraphs[secondIndex];
        if (first.text.replace(/\s+/gu, ' ').trim().toLowerCase()
          === second.text.replace(/\s+/gu, ' ').trim().toLowerCase()) continue;
        const shared = [...first.tokens].filter((token) => second.tokens.has(token)).length;
        const union = new Set([...first.tokens, ...second.tokens]).size;
        const similarity = union ? shared / union : 0;
        if (shared >= 10 && similarity >= 0.72 && similarity < 0.995) {
          matches.push({
            kind: 'paragraph_pair',
            section_heading: section.heading,
            first_paragraph: first.index,
            second_paragraph: second.index,
            similarity: Number(similarity.toFixed(3)),
            shared_token_count: shared,
          });
        }
      }
    }
  }

  return matches.sort((left, right) =>
    compareStrings(left.section_heading || left.first_heading, right.section_heading || right.first_heading)
      || compareStrings(String(left.first_paragraph || left.second_heading), String(right.first_paragraph || right.second_heading))
  );
}

function pageTitle(html, slug) {
  const articleHtml = extractArticleHtml(html);
  const h1 = extractTagTexts(articleHtml || html, 'h1')[0];
  if (h1) return h1;
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  if (title) {
    return htmlToVisibleText(title)
      .replace(/\s+(?:—|-|\|)\s+Crypto Moonboys Wiki.*$/i, '')
      .trim();
  }
  return slug.split('-').map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : '').join(' ');
}

function isFirstWitnessPage(slug) {
  return slug === 'the-first-witness' || slug.startsWith('first-witness-');
}

export function validateAbsentStubDeclarations(value, existingSlugs = new Set()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('brand-canon/wiki-absent-stubs.json must contain an object');
  }
  if (value.schema_version !== 1) {
    throw new Error('brand-canon/wiki-absent-stubs.json schema_version must be 1');
  }
  if (!Array.isArray(value.absent_stub_slugs)) {
    throw new Error('brand-canon/wiki-absent-stubs.json absent_stub_slugs must be an array');
  }

  const seen = new Set();
  const slugs = [];
  for (const rawSlug of value.absent_stub_slugs) {
    if (typeof rawSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug)) {
      throw new Error(`Invalid absent-stub slug: ${JSON.stringify(rawSlug)}`);
    }
    if (seen.has(rawSlug)) throw new Error(`Duplicate absent-stub slug: ${rawSlug}`);
    if (existingSlugs.has(rawSlug)) throw new Error(`Absent-stub declaration already has a wiki page: ${rawSlug}`);
    if (isFirstWitnessPage(rawSlug)) throw new Error(`First Witness cannot be an absent-stub target: ${rawSlug}`);
    if (isAliasSlug(rawSlug)) {
      throw new Error(`Absent-stub slug is a known alias for ${canonicalizeSlug(rawSlug)}: ${rawSlug}`);
    }
    const publishClassification = publishGate.classifySlug(rawSlug, PUBLISH_GATE_CANON);
    if (publishClassification.status === publishGate.STATUS.BLOCKED_SYNTHETIC_SLUG) {
      throw new Error(`Absent-stub slug is blocked by the wiki publish gate: ${rawSlug} (${publishClassification.reason})`);
    }
    seen.add(rawSlug);
    slugs.push(rawSlug);
  }
  return slugs.sort(compareStrings);
}

export function loadAbsentStubDeclarations(existingSlugs, declarationPath = ABSENT_STUBS_PATH) {
  if (!fs.existsSync(declarationPath)) {
    throw new Error(`Absent-stub declaration file not found: ${declarationPath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(declarationPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${declarationPath}: ${error.message}`);
  }
  return validateAbsentStubDeclarations(parsed, existingSlugs);
}

export function absentStubPage(slug) {
  return {
    path: `wiki/${slug}.html`,
    slug,
    title: slug,
    page_exists: false,
    page_type: 'stub',
    current_word_count: 0,
    manual_content_block_count: 0,
    sam_content_block_count: 0,
    canonical_content_block_count: 0,
    legacy_sam_article_wrapper: false,
    legacy_unmarked_content: false,
    duplicate_heading_count: 0,
    exact_duplicate_paragraph_count: 0,
    likely_near_duplicate_sections: [],
    content_hash: null,
    article_content_hash: null,
    article_markup_hash: null,
    git_blob_oid: null,
    wiki_stub_marker_scope: null,
    first_witness_page: false,
    nft_template_generated_page: true,
    likely_lore_page: false,
    rewrite_status: 'GENERATED',
    automation_policy: 'stub-allowed',
    rewrite_cluster: 'Generated/non-lore pages',
    duplicate_severity: 'NONE',
    canon_conflict_severity: 'NOT_APPLICABLE',
    recommended_action: recommendedAction('GENERATED'),
    suggested_priority: 'P4',
    likely_source_family: ['Explicit repository absent-stub authorization'],
    audit_notes: [
      'No wiki HTML file exists. Repository policy permits creation of a short generated metadata stub only.',
    ],
  };
}

function isNftTemplatePage(slug, html) {
  return /\bdata-page-type=["']nft_template["']/i.test(html)
    || /\bnft-template-article\b/i.test(html)
    || /^gkniftyheads-.+-\d+$/.test(slug);
}

function isNftSpecialistPage(slug, html) {
  return isNftTemplatePage(slug, html)
    || NFT_SPECIALIST_SLUGS.has(slug)
    || /(?:^|-)nft(?:s|-|$)/.test(slug)
    || /\bdata-collection=["']/i.test(html);
}

export function rootWikiStubMarkerScope(html) {
  const openingTag = findFirstActiveOpeningTag(html, 'body');
  if (!openingTag) return null;
  const attributes = readHtmlAttributes(openingTag.raw)
    .filter(({ name }) => name === 'data-wiki-stub');
  const attribute = attributes[0];
  return attributes.length === 1 &&
    (attribute.quote === '"' || attribute.quote === "'") &&
    String(attribute.rawValue).toLowerCase() === 'true'
    ? 'body'
    : null;
}

export function hasRootWikiStubMarker(html) {
  return rootWikiStubMarkerScope(html) !== null;
}

function isRedirectPage(html) {
  return tokenizeActiveHtml(html).some((token) => {
    if (token.type !== 'tag' || token.closing || token.name !== 'meta') return false;
    const httpEquiv = readHtmlAttribute(token.raw, 'http-equiv');
    return httpEquiv.present && String(httpEquiv.value || '').toLowerCase() === 'refresh';
  });
}

function directBiblePath(slug, bibleSlugs) {
  const candidate = BIBLE_ALIASES[slug] || slug;
  return bibleSlugs.has(candidate) ? `wiki/bibles/${candidate}.json` : null;
}

function clusterForPage({ slug, firstWitness, nftSpecialist, generated, likelyLore }) {
  if (nftSpecialist) return 'NFT specialist pages';
  if (generated) return 'Generated/non-lore pages';
  if (firstWitness || CORE_COSMOLOGY_SLUGS.has(slug)) {
    return 'Core cosmology / history';
  }
  if (/block-topia|metropolis|croydon-tower-blocks|maidstone-base/.test(slug)) return 'Block Topia';
  if (/bitcoin-(?:kid|kids|x-kids)|alfie/.test(slug) || slug === 'the-bitcoin-kid-army') {
    return 'Bitcoin KiD / Bitcoin Kids / Bitcoin X Kids';
  }
  if (HODL_SAGA_SLUGS.has(slug)) return 'HODL Warriors / HODL X Warriors';
  if (/null|antichain|samael|m1ntr|whitewasher/.test(slug)) return 'NULL / Antichain';
  if (FORTY_FACTION_SLUGS.has(slug)) return 'Forty factions';
  if (/graffpunk|graffiti-kings|games4punks|gang-signs/.test(slug)) return 'GraffPUNKS';
  if (/gkniftyheads|head-tags|nifty-crowns|nifty-wizards/.test(slug)) return 'GKniftyHEADS';
  if (CHARACTER_SLUGS.has(slug)) return 'Characters';
  if (REAL_PERSON_SLUGS.has(slug) || HISTORICAL_ARCHIVE_SLUGS.has(slug)) return 'Historical/archive pages';
  if (likelyLore) return 'Historical/archive pages';
  return 'Generated/non-lore pages';
}

function pageTypeForPage({
  slug, firstWitness, nftTemplate, nftSpecialist, stub, redirect, generated, cluster, likelyLore,
}) {
  if (redirect) return 'redirect';
  if (stub) return 'stub';
  if (firstWitness) return 'first_witness_canon';
  if (nftTemplate) return 'nft_template';
  if (nftSpecialist) return 'nft_specialist';
  if (generated) return 'generated';
  if (cluster === 'Forty factions') return 'faction';
  if (cluster === 'Characters' || cluster === 'NULL / Antichain') return 'character';
  if (cluster === 'Historical/archive pages') return 'historical_archive';
  if (likelyLore) return 'lore';
  if (NON_LORE_REFERENCE_SLUGS.has(slug)) return 'reference';
  return 'project_or_reference';
}

function clusterCanonAnchors(cluster) {
  const anchors = {
    'Core cosmology / history': [
      'wiki/first-witness-concordance.html',
      'wiki/first-witness-master-chronology.html',
      'wiki/first-witness-glossary.html',
    ],
    'Block Topia': [
      'wiki/first-witness-block-topia-reading.html',
      'wiki/first-witness-concordance.html',
    ],
    'Bitcoin KiD / Bitcoin Kids / Bitcoin X Kids': [
      'wiki/first-witness-child-of-fire.html',
      'wiki/first-witness-concordance.html',
    ],
    'HODL Warriors / HODL X Warriors': [
      'wiki/first-witness-hodl-doctrine.html',
      'wiki/first-witness-concordance.html',
    ],
    'NULL / Antichain': [
      'wiki/first-witness-null-erasure.html',
      'wiki/first-witness-concordance.html',
    ],
    'Forty factions': [
      'wiki/first-witness-forty-paths.html',
      'wiki/first-witness-faction-commentaries.html',
    ],
  };
  return anchors[cluster] || [];
}

function w81SourceBucket(cluster) {
  const buckets = {
    'Core cosmology / history': 'major lore/cosmology files',
    'Block Topia': 'W14, W15, w22-w33, w70, w72, w73',
    'Bitcoin KiD / Bitcoin Kids / Bitcoin X Kids': 'W18, w62, w73, M16',
    'HODL Warriors / HODL X Warriors': 'W5, W15, w25, w63, w70, w72, w73',
    'NULL / Antichain': 'W1, W15, W20, w27-w28, w65, w73, w86',
    'Forty factions': 'w34-w63, w68, M16',
    GraffPUNKS: 'W2, W6, W8, w58, w68-w69, w74, w79-w81, w89, w92',
    GKniftyHEADS: 'W2, W6, W8, w21, w61, w68-w69, w74, w79, w85, w87, w90-w91',
    Characters: 'M16, W12, W13, W18, W17, w82, w83, w85, w93',
  };
  return buckets[cluster] || 'unresolved archive bucket';
}

function likelySourceFamily({ firstWitness, likelyLore, directBible, nftSpecialist, generated, slug, cluster }) {
  if (firstWitness) return ['First Witness convergence canon'];
  if (nftSpecialist) return ['Structured NFT/template metadata'];
  if (generated) return ['Generated page structure'];

  const sources = clusterCanonAnchors(cluster);
  if (likelyLore || slug === 'crypto-moonboys') {
    sources.push('about/latest-canon-and-brand-vision.md');
    sources.push('about/w81-condensed-canon-digest.md');
  }
  if (likelyLore) sources.push(`about/w81.zip (${w81SourceBucket(cluster)})`);
  if (directBible) sources.push(`${directBible} (specialist public archive; not identified Tier 4 canon)`);
  if (!sources.length) sources.push('Existing public/reference source verification');
  return sources;
}

function canonConflictSeverity({
  slug, firstWitness, nftSpecialist, generated, likelyLore, cluster,
}) {
  if (firstWitness) return 'NONE';
  if (nftSpecialist || generated) return 'NOT_APPLICABLE';
  if (HIGH_CONFLICT_SLUGS.has(slug)) return 'HIGH';
  if (cluster === 'Characters' || cluster === 'Forty factions') return 'UNKNOWN_REVIEW';
  if (slug === 'crypto-moonboys' || [
    'Core cosmology / history',
    'Block Topia',
    'Bitcoin KiD / Bitcoin Kids / Bitcoin X Kids',
    'HODL Warriors / HODL X Warriors',
    'NULL / Antichain',
    'Forty factions',
    'GraffPUNKS',
    'GKniftyHEADS',
    'Characters',
  ].includes(cluster)) return 'MEDIUM';
  if (likelyLore) return 'UNKNOWN_REVIEW';
  return 'LOW';
}

function duplicateSeverity({ duplicateHeadingCount, exactDuplicateParagraphCount, nearDuplicates }) {
  const issues = duplicateHeadingCount + exactDuplicateParagraphCount + nearDuplicates.length;
  if (issues >= 3 || exactDuplicateParagraphCount >= 2) return 'HIGH';
  if (issues > 0) return 'MEDIUM';
  return 'NONE';
}

function rewriteStatusForPage({
  firstWitness, nftSpecialist, generated, stub, redirect, likelyLore,
  conflictSeverity, duplicateLevel, currentWordCount, cluster, slug,
}) {
  if (firstWitness) return 'FIRST_WITNESS_LOCKED';
  if (nftSpecialist) return 'NFT_SPECIALIST';
  if (generated || stub || redirect) return 'GENERATED';
  if (FULL_REWRITE_SLUGS.has(slug)) return 'REWRITE_FULL';
  if (conflictSeverity === 'UNKNOWN_REVIEW') return 'NEEDS_HUMAN_REVIEW';
  if (duplicateLevel !== 'NONE') return 'DEDUPE';
  if (cluster === 'Historical/archive pages') return 'ARCHIVE_STYLE';
  const mappedCanonCluster = [
    'Core cosmology / history',
    'Block Topia',
    'Bitcoin KiD / Bitcoin Kids / Bitcoin X Kids',
    'HODL Warriors / HODL X Warriors',
    'NULL / Antichain',
    'Forty factions',
    'GraffPUNKS',
    'GKniftyHEADS',
    'Characters',
  ].includes(cluster);
  if (likelyLore && currentWordCount < 180 && mappedCanonCluster) return 'EXPAND';
  if (likelyLore && mappedCanonCluster) return 'RECONCILE';
  if (likelyLore || conflictSeverity === 'UNKNOWN_REVIEW') return 'NEEDS_HUMAN_REVIEW';
  return 'KEEP';
}

function automationPolicyForPage({ firstWitness, stub, redirect, samBlockCount, legacyUnmarked }) {
  if (firstWitness) return 'canon-locked';
  if (stub && !redirect) return 'stub-allowed';
  if (legacyUnmarked) return 'metadata-only';
  if (samBlockCount === 1) return 'replace-sam-block';
  return 'metadata-only';
}

function recommendedAction(status) {
  const actions = {
    KEEP: 'Preserve article prose; allow metadata-only maintenance.',
    REWRITE_FULL: 'Queue a full canon rewrite by the later canon-writing AI.',
    RECONCILE: 'Reconcile against higher-priority sources before replacing prose.',
    DEDUPE: 'Review the reported duplication during the later canon rewrite.',
    EXPAND: 'Expand later from the named source family; do not auto-append.',
    ARCHIVE_STYLE: 'Preserve as public archive and add archival framing in a later canon pass.',
    GENERATED: 'Maintain through its generator or stub/redirect workflow, not lore automation.',
    NFT_SPECIALIST: 'Route structured NFT/template maintenance to the NFT specialist workflow.',
    FIRST_WITNESS_LOCKED: 'Keep locked unless a later explicit canon PR changes it.',
    NEEDS_HUMAN_REVIEW: 'Resolve classification/source ambiguity before any prose write.',
  };
  return actions[status];
}

function priorityForPage({ status, conflictSeverity, duplicateLevel }) {
  if (status === 'FIRST_WITNESS_LOCKED') return 'LOCKED';
  if (status === 'REWRITE_FULL' || conflictSeverity === 'HIGH' || duplicateLevel === 'HIGH') return 'P1';
  if (status === 'RECONCILE' || status === 'DEDUPE' || status === 'NEEDS_HUMAN_REVIEW') return 'P2';
  if (status === 'EXPAND' || status === 'ARCHIVE_STYLE') return 'P3';
  return 'P4';
}

function auditNotes({
  firstWitness, nftTemplate, nftSpecialist, generated, legacyUnmarked, directBible,
  duplicateHeadingCount, exactDuplicateParagraphCount, nearDuplicates, likelyLore,
  legacySamWrapper, cluster,
}) {
  const notes = [];
  if (firstWitness) notes.push('First Witness article prose is canon-locked by repository policy.');
  if (nftTemplate) notes.push('Structured NFT template page; article prose belongs to the NFT specialist/generator path.');
  else if (nftSpecialist) notes.push('NFT-focused page; route substantive maintenance to the NFT specialist workflow.');
  if (generated && !nftTemplate) notes.push('Generated, redirect, or stub surface; not a canon-writing target.');
  if (legacyUnmarked) notes.push('Substantive article content has no MANUAL_CONTENT, SAM_CONTENT, or CANONICAL_CONTENT ownership markers.');
  if (legacySamWrapper && legacyUnmarked) notes.push('Legacy SAM:BEGIN:article shell marker is provenance evidence, not a current SAM_CONTENT ownership block.');
  if (directBible) notes.push(`Specialist archive record found at ${directBible}; it is not automatically the unavailable Tier 4 modern bible.`);
  if (cluster === 'Characters' || cluster === 'Forty factions') notes.push('The requested modern Tier 4 subject bible is not separately identifiable in this checkout; canon classification remains a human-review item.');
  if (duplicateHeadingCount) notes.push(`${duplicateHeadingCount} repeated heading occurrence(s) detected inside the article.`);
  if (exactDuplicateParagraphCount) notes.push(`${exactDuplicateParagraphCount} exact repeated paragraph occurrence(s) detected inside the article.`);
  if (nearDuplicates.length) notes.push(`${nearDuplicates.length} likely near-duplicate section pair(s) reported; no text was removed.`);
  if (likelyLore && !firstWitness) notes.push('Existing wiki prose is surviving public archive, not automatically current canon.');
  if (!notes.length) notes.push('No article-ownership or duplication issue detected by the deterministic audit.');
  return notes;
}

function sourceDescriptor(rank, label, sourcePath, scope = null) {
  if (scope === 'first-witness-family') {
    const files = listTopLevelWikiHtmlFiles(WIKI_DIR)
      .filter((name) => name === 'the-first-witness.html' || /^first-witness-.*\.html$/.test(name))
      .sort();
    const digest = files.map((name) => {
      const bytes = readTopLevelWikiHtmlFile(WIKI_DIR, name);
      return `${name}\0${sha256(bytes)}`;
    }).join('\n');
    return { rank, label, path: 'wiki/{the-first-witness,first-witness-*}.html', file_count: files.length, content_hash: sha256(digest) };
  }
  if (scope === 'bible-family') {
    const files = fs.readdirSync(BIBLE_DIR).filter((name) => name.endsWith('.json')).sort();
    const digest = files.map((name) => {
      const bytes = fs.readFileSync(path.join(BIBLE_DIR, name));
      return `${name}\0${sha256(bytes)}`;
    }).join('\n');
    return { rank, label, path: 'wiki/bibles/*.json', file_count: files.length, content_hash: sha256(digest) };
  }
  const absolutePath = path.join(ROOT, sourcePath);
  const bytes = fs.readFileSync(absolutePath);
  return { rank, label, path: sourcePath, content_hash: sha256(bytes) };
}

export function buildWikiAudit() {
  if (!fs.existsSync(WIKI_DIR)) throw new Error(`Wiki directory not found: ${WIKI_DIR}`);

  const fileNames = listTopLevelWikiHtmlFiles(WIKI_DIR);
  const bibleSlugs = new Set(
    fs.readdirSync(BIBLE_DIR).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5))
  );
  const pages = [];

  for (const fileName of fileNames) {
    const slug = fileName.slice(0, -5);
    const relPath = `wiki/${fileName}`;
    const bytes = readTopLevelWikiHtmlFile(WIKI_DIR, fileName);
    const html = bytes.toString('utf8');
    assertValidWikiContentTopology(html, relPath);
    const articleHtml = extractArticleHtml(html);
    const articleText = htmlToVisibleText(articleHtml);
    const firstWitness = isFirstWitnessPage(slug);
    const nftTemplate = isNftTemplatePage(slug, html);
    const nftSpecialist = isNftSpecialistPage(slug, html);
    const wikiStubMarkerScope = rootWikiStubMarkerScope(html);
    const stub = wikiStubMarkerScope !== null;
    const redirect = isRedirectPage(html);
    const generatedDraft = /\bdraft-notice\b|Action:\s*create_bridge_page/i.test(html);
    const generated = nftTemplate || stub || redirect || generatedDraft || !articleHtml;
    const directBible = directBiblePath(slug, bibleSlugs);
    const explicitLoreCategory = /\/categories\/lore\.html(?:["'#?])/i.test(html);
    const likelyLore = !nftSpecialist && !generated && (firstWitness || (!REAL_PERSON_SLUGS.has(slug) && (
      explicitLoreCategory
      || CHARACTER_SLUGS.has(slug)
      || FORTY_FACTION_SLUGS.has(slug)
      || HIGH_CONFLICT_SLUGS.has(slug)
      || HODL_SAGA_SLUGS.has(slug)
      || CORE_COSMOLOGY_SLUGS.has(slug)
      || /(?:block-topia|street-kingdoms|null-the-prophet|graffpunks|graffiti-kings|gkniftyheads)/.test(slug)
    )));

    const manualBlockCount = countMarker(html, MANUAL_CONTENT_BEGIN);
    const samBlockCount = countMarker(html, SAM_CONTENT_BEGIN);
    const canonicalBlockCount = countCanonicalContentBlocks(html);
    const legacySamWrapper = /<!--\s*SAM:BEGIN:article\s*-->/i.test(html);
    const legacyUnmarked = hasLegacyUnmarkedArticleContent(html, {
      firstWitnessPage: firstWitness,
      nftTemplateGeneratedPage: nftSpecialist || generated,
    });
    const duplicateHeadings = findDuplicateHeadings(articleHtml);
    const exactDuplicateParagraphs = findExactDuplicateParagraphs(articleHtml);
    const nearDuplicates = findLikelyNearDuplicateSections(articleHtml);
    const duplicateLevel = duplicateSeverity({
      duplicateHeadingCount: duplicateHeadings.length,
      exactDuplicateParagraphCount: exactDuplicateParagraphs.length,
      nearDuplicates,
    });
    const cluster = clusterForPage({ slug, firstWitness, nftSpecialist, generated, likelyLore });
    const pageType = pageTypeForPage({
      slug, firstWitness, nftTemplate, nftSpecialist, stub, redirect, generated, cluster, likelyLore,
    });
    const conflictSeverity = canonConflictSeverity({
      slug, firstWitness, nftSpecialist, generated, likelyLore, directBible, cluster,
    });
    const currentWordCount = countWords(articleText);
    assertValidStubAtRest({
      relPath,
      stub,
      currentWordCount,
      manualBlockCount,
      canonicalBlockCount,
    });
    const rewriteStatus = rewriteStatusForPage({
      firstWitness, nftSpecialist, generated, stub, redirect, likelyLore, directBible,
      conflictSeverity, duplicateLevel, currentWordCount, cluster, slug,
    });
    const automationPolicy = automationPolicyForPage({
      firstWitness, stub, redirect, samBlockCount, legacyUnmarked,
    });
    const currentBlobOid = gitBlobOid(bytes);

    const page = {
      path: relPath,
      slug,
      title: pageTitle(html, slug),
      page_exists: true,
      page_type: pageType,
      current_word_count: currentWordCount,
      manual_content_block_count: manualBlockCount,
      sam_content_block_count: samBlockCount,
      canonical_content_block_count: canonicalBlockCount,
      legacy_sam_article_wrapper: legacySamWrapper,
      legacy_unmarked_content: legacyUnmarked,
      duplicate_heading_count: duplicateHeadings.length,
      exact_duplicate_paragraph_count: exactDuplicateParagraphs.length,
      likely_near_duplicate_sections: nearDuplicates,
      content_hash: sha256(bytes),
      article_content_hash: sha256(Buffer.from(articleText, 'utf8')),
      article_markup_hash: articleMarkupHash(html),
      git_blob_oid: currentBlobOid,
      wiki_stub_marker_scope: wikiStubMarkerScope,
      first_witness_page: firstWitness,
      nft_template_generated_page: nftSpecialist || generated,
      likely_lore_page: likelyLore,
      rewrite_status: rewriteStatus,
      automation_policy: automationPolicy,
      rewrite_cluster: cluster,
      duplicate_severity: duplicateLevel,
      canon_conflict_severity: conflictSeverity,
      recommended_action: recommendedAction(rewriteStatus),
      suggested_priority: priorityForPage({ status: rewriteStatus, conflictSeverity, duplicateLevel }),
      likely_source_family: likelySourceFamily({
        firstWitness, likelyLore, directBible, nftSpecialist, generated, slug, cluster,
      }),
      audit_notes: auditNotes({
        firstWitness, nftTemplate, nftSpecialist, generated, legacyUnmarked, directBible,
        duplicateHeadingCount: duplicateHeadings.length,
        exactDuplicateParagraphCount: exactDuplicateParagraphs.length,
        nearDuplicates,
        likelyLore,
        legacySamWrapper,
        cluster,
      }),
    };

    if (!REWRITE_STATUSES.includes(page.rewrite_status)) throw new Error(`Invalid rewrite status for ${relPath}`);
    if (!AUTOMATION_POLICIES.includes(page.automation_policy)) throw new Error(`Invalid automation policy for ${relPath}`);
    pages.push(page);
  }

  const absentStubSlugs = loadAbsentStubDeclarations(new Set(pages.map((page) => page.slug)));
  pages.push(...absentStubSlugs.map(absentStubPage));
  pages.sort((left, right) => compareStrings(left.slug, right.slug));

  const existingPages = pages.filter((page) => page.page_exists);
  const absentStubPages = pages.filter((page) => page.page_exists === false);

  const statusCounts = Object.fromEntries(REWRITE_STATUSES.map((status) => [
    status,
    existingPages.filter((page) => page.rewrite_status === status).length,
  ]));
  const policyCounts = Object.fromEntries(AUTOMATION_POLICIES.map((policy) => [
    policy,
    existingPages.filter((page) => page.automation_policy === policy).length,
  ]));
  const absentStubSourceBytes = fs.readFileSync(ABSENT_STUBS_PATH);

  const manifest = {
    schema_version: 1,
    generator: 'scripts/generate-wiki-content-state.mjs',
    source_tree_hash: sourceTreeHashForPages(pages),
    hash_algorithm: 'sha256',
    page_count: existingPages.length,
    manifest_entry_count: pages.length,
    absent_stub_authorization_source: {
      path: 'brand-canon/wiki-absent-stubs.json',
      content_hash: sha256(absentStubSourceBytes),
    },
    article_hash_normalization: 'article-text-v1',
    article_markup_hash_normalization: 'article-markup-v1',
    article_hash_rules: [
      'Use the first active .wiki-content container, falling back to the first active article element; do not include a title outside that container.',
      'Remove the generated RELATED_WIKI_PATHS marker block, script/style blocks, HTML comments, and tags.',
      'Decode numeric entities plus amp, lt, gt, quot, apos, and nbsp.',
      'Collapse Unicode whitespace to one ASCII space, trim, preserve case/punctuation, then hash UTF-8 bytes with SHA-256.',
    ],
    article_markup_hash_rules: [
      'Use the complete first active .wiki-content/article root, including its opening and closing tags.',
      'Remove only the generated RELATED_WIKI_PATHS marker block; preserve all other bytes and hash them with SHA-256.',
    ],
    audit_scope: 'Every top-level wiki/*.html file; nested files are source inputs only.',
    field_definitions: {
      legacy_unmarked_content: 'True when visible article content remains outside all MANUAL_CONTENT, SAM_CONTENT, and CANONICAL_CONTENT blocks, including when an owned block also exists. First Witness ownership is established by canon lock; NFT specialist/template and structurally generated ownership is established by its dedicated workflow.',
      current_word_count: 'Word count of article-text-v1 visible article text; page shell and generated Related Wiki Paths are excluded.',
      nft_template_generated_page: 'True when the page is an NFT specialist/template surface or another structurally generated stub/redirect page.',
      content_hash: 'SHA-256 of the exact wiki HTML file bytes; use as the stale-revision identity.',
      article_content_hash: 'SHA-256 of article-text-v1 normalized visible article text; excludes generated Related Wiki Paths.',
      article_markup_hash: 'SHA-256 of the exact canonical article/wiki-content root markup after removing generated Related Wiki Paths; protects visibility attributes and author-owned structure.',
      legacy_sam_article_wrapper: 'True when the historical SAM:BEGIN:article shell wrapper is present. It is provenance evidence only and does not grant current SAM_CONTENT ownership.',
      page_exists: 'True for an audited wiki HTML file. False only for a repository-authorized absent stub with null content identities.',
      wiki_stub_marker_scope: '"body" only when the active body element carries data-wiki-stub=true; null otherwise.',
    },
    hierarchy_evidence: 'about/first-witness-bible-build-plan.md',
    canon_hierarchy: [
      sourceDescriptor(1, 'Published First Witness convergence canon', null, 'first-witness-family'),
      sourceDescriptor(2, 'Latest canon and brand vision', 'about/latest-canon-and-brand-vision.md'),
      sourceDescriptor(3, 'W81 condensed canon digest', 'about/w81-condensed-canon-digest.md'),
      {
        rank: 4,
        label: 'Current dedicated character/faction/HODL WARS bibles',
        path: null,
        available: false,
        status: 'not_identified_in_checkout',
        audit_note: 'Referenced by the First Witness source register/build plan but no separately identifiable modern bible files are present in this checkout. Existing wiki/bibles JSON is not promoted into this tier.',
      },
      sourceDescriptor(5, 'W81 raw archive', 'about/w81.zip'),
      { rank: 6, label: 'Existing wiki pages', path: 'wiki/*.html', treatment: 'surviving public archive; not automatically current truth' },
    ],
    supplemental_legacy_sources: [{
      ...sourceDescriptor(null, 'Existing specialist bible JSON', null, 'bible-family'),
      treatment: 'SAM-generated/legacy-migration specialist public archive; not automatically current Tier 4 canon',
    }],
    summary: {
      total_pages_audited: existingPages.length,
      total_manifest_entries: pages.length,
      absent_stub_authorizations: absentStubPages.length,
      rewrite_status_counts: statusCounts,
      automation_policy_counts: policyCounts,
      pages_with_multiple_sam_blocks: existingPages.filter((page) => page.sam_content_block_count > 1).length,
      pages_with_multiple_canonical_blocks: existingPages.filter((page) => page.canonical_content_block_count > 1).length,
      pages_with_legacy_unmarked_content: existingPages.filter((page) => page.legacy_unmarked_content).length,
      pages_with_exact_duplicate_paragraphs: existingPages.filter((page) => page.exact_duplicate_paragraph_count > 0).length,
      pages_with_duplicate_headings: existingPages.filter((page) => page.duplicate_heading_count > 0).length,
      pages_with_likely_near_duplicate_sections: existingPages.filter((page) => page.likely_near_duplicate_sections.length > 0).length,
      pages_with_legacy_sam_article_wrapper: existingPages.filter((page) => page.legacy_sam_article_wrapper).length,
    },
    pages,
  };

  return manifest;
}

function markdownEscape(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/([`\[\]])/g, '\\$1')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function sourceLabel(page) {
  return page.likely_source_family.map((source) => source
    .replace('about/latest-canon-and-brand-vision.md', 'Latest canon/brand vision')
    .replace('about/w81-condensed-canon-digest.md', 'W81 digest')
    .replace(/^wiki\/bibles\/(.+)\.json \(specialist public archive; not identified Tier 4 canon\)$/, 'Specialist archive: $1')
    .replace(/^about\/w81\.zip(?: \((.+)\))?$/, (_, bucket) => bucket ? `W81 raw archive: ${bucket}` : 'W81 raw archive'))
    .join('; ');
}

export function renderRewriteAudit(manifest) {
  const summary = manifest.summary;
  const lines = [
    '# Wiki Content Ownership and Rewrite Audit',
    '',
    '> Generated by `node scripts/generate-wiki-content-state.mjs`. Do not hand-edit this report; edit the deterministic classification rules and regenerate it.',
    '',
    'This is an ownership and rewrite-queue audit only. It does not replace, delete, summarise, or adjudicate any lore prose. Existing wiki articles remain a surviving public archive unless a later canon-writing PR changes them.',
    '',
    '## Audit contract',
    '',
    `- Scope: all ${summary.total_pages_audited} top-level \`wiki/*.html\` pages.`,
    `- Absent-stub authorizations: ${summary.absent_stub_authorizations}. These are explicit repository declarations, not audited pages or links to pages that already exist.`,
    '- Canon hierarchy: published First Witness convergence canon; latest canon/brand vision; W81 condensed digest; current dedicated bibles; raw W81 archive; existing wiki archive.',
    '- Tier 4 source gap: the modern dedicated character/faction/HODL WARS bibles referenced by the First Witness register are not separately identifiable in this checkout. Historical `wiki/bibles/*.json` SAM records remain lower-tier public archive inputs and ambiguous mappings stay review items.',
    '- `content_hash` is SHA-256 of exact file bytes and is the stale-write identity. `article_content_hash` is SHA-256 of deterministic `article-text-v1` visible article text. `article_markup_hash` protects the exact canonical content-root markup, excluding only generated Related Wiki Paths.',
    '- Exact paragraph duplicates count repeated occurrences after the first, case-folded and whitespace-normalised, with fragments shorter than 40 characters ignored.',
    '- Near-duplicate report candidates compare sections (at least 20 significant unique tokens and 15 shared tokens) and paragraphs within one section (at least 12 significant unique tokens and 10 shared tokens) at Jaccard similarity 0.72 or higher. Nothing is deleted automatically.',
    '- `legacy_unmarked_content` covers visible article prose outside every ownership block, even when a SAM/manual/canonical block also exists. First Witness ownership is established by its mandatory lock; NFT specialist/template and structurally generated pages use their dedicated ownership workflows.',
    '- First Witness pages are always `FIRST_WITNESS_LOCKED` / `canon-locked` for article prose.',
    '',
    '## Summary',
    '',
    '| Measure | Count |',
    '|---|---:|',
    `| Total pages audited | ${summary.total_pages_audited} |`,
    `| Absent stub authorizations | ${summary.absent_stub_authorizations} |`,
    ...REWRITE_STATUSES.map((status) => `| ${status} | ${summary.rewrite_status_counts[status]} |`),
    `| Pages with multiple SAM blocks | ${summary.pages_with_multiple_sam_blocks} |`,
    `| Pages with multiple canonical blocks | ${summary.pages_with_multiple_canonical_blocks} |`,
    `| Pages with legacy unmarked content | ${summary.pages_with_legacy_unmarked_content} |`,
    `| Pages with exact duplicate paragraphs | ${summary.pages_with_exact_duplicate_paragraphs} |`,
    `| Pages with duplicate headings | ${summary.pages_with_duplicate_headings} |`,
    `| Pages with likely near-duplicate sections | ${summary.pages_with_likely_near_duplicate_sections} |`,
    `| Pages with legacy SAM article shell wrappers | ${summary.pages_with_legacy_sam_article_wrapper} |`,
    '',
    '## Automation policy summary',
    '',
    '| Policy | Pages | Meaning |',
    '|---|---:|---|',
    `| canon-locked | ${summary.automation_policy_counts['canon-locked']} | Automated article-body writes are rejected. |`,
    `| metadata-only | ${summary.automation_policy_counts['metadata-only']} | Search, relationship, and metadata maintenance only; article prose is preserved. |`,
    `| replace-sam-block | ${summary.automation_policy_counts['replace-sam-block']} | A single existing SAM block may be replaced, never appended. |`,
    `| stub-allowed | ${summary.automation_policy_counts['stub-allowed']} | A stub may be created only while no real canonical page exists. |`,
    '',
    '## Rewrite queue by cluster',
    '',
  ];

  for (const cluster of REPORT_CLUSTERS) {
    const pages = manifest.pages.filter((page) => page.page_exists && page.rewrite_cluster === cluster);
    if (!pages.length) continue;
    lines.push(`### ${cluster}`, '');
    lines.push('| Page | Status | Duplication | Canon conflict | Action | Priority | Likely source family |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const page of pages) {
      const pageLink = `[${markdownEscape(page.title)}](../${page.path})`;
      lines.push(`| ${pageLink} (\`${page.slug}\`) | ${page.rewrite_status} | ${page.duplicate_severity} | ${page.canon_conflict_severity} | ${markdownEscape(page.recommended_action)} | ${page.suggested_priority} | ${markdownEscape(sourceLabel(page))} |`);
    }
    lines.push('');
  }

  const absentStubPages = manifest.pages.filter((page) => page.page_exists === false);
  lines.push('## Explicit absent-stub authorizations', '');
  lines.push('These entries come only from `brand-canon/wiki-absent-stubs.json`. They authorize creation of a short generated metadata stub while the target file remains absent; they do not authorize full article prose or a link to a nonexistent page.', '');
  lines.push('| Target | Policy | Content identity | Action |');
  lines.push('|---|---|---|---|');
  if (absentStubPages.length) {
    for (const page of absentStubPages) {
      lines.push(`| \`${page.path}\` | ${page.automation_policy} | null (page absent) | ${markdownEscape(page.recommended_action)} |`);
    }
  } else {
    lines.push('| _None authorized_ | — | — | Add a reviewed slug to `brand-canon/wiki-absent-stubs.json` before any missing-page creation. |');
  }
  lines.push('');

  const existingPages = manifest.pages.filter((page) => page.page_exists);
  const exactDuplicatePages = existingPages.filter((page) => page.exact_duplicate_paragraph_count > 0);
  const nearDuplicatePages = existingPages.filter((page) => page.likely_near_duplicate_sections.length > 0);
  const legacyPages = existingPages.filter((page) => page.legacy_unmarked_content);
  lines.push('## Duplication and ownership review lists', '');
  lines.push(`- Exact duplicate paragraphs: ${exactDuplicatePages.length ? exactDuplicatePages.map((page) => `\`${page.slug}\` (${page.exact_duplicate_paragraph_count})`).join(', ') : 'none detected'}.`);
  lines.push(`- Likely near-duplicate sections: ${nearDuplicatePages.length ? nearDuplicatePages.map((page) => `\`${page.slug}\` (${page.likely_near_duplicate_sections.length})`).join(', ') : 'none detected'}.`);
  lines.push(`- Legacy unmarked articles: ${legacyPages.length}. See \`brand-canon/wiki-content-state.json\` for the complete machine-readable page list and notes.`);
  lines.push('');
  lines.push('## Handoff rule', '');
  lines.push('A later canon-writing AI may use this queue and the named source families to prepare prose changes. It must not infer that an existing wiki claim is current truth merely because the page survived, and ambiguity remains `NEEDS_HUMAN_REVIEW`.');

  return `${lines.join('\n')}\n`;
}

function outputs() {
  const manifest = buildWikiAudit();
  return {
    manifest,
    json: `${JSON.stringify(manifest, null, 2)}\n`,
    markdown: renderRewriteAudit(manifest),
  };
}

let generatedWriteSequence = 0;

function requireDirectoryAnchoring(label) {
  if (
    process.platform !== 'linux' ||
    !fs.constants.O_DIRECTORY ||
    !fs.existsSync('/proc/self/fd')
  ) {
    throw new Error(`${label} requires Linux /proc/self/fd directory anchoring`);
  }
}

function openOutputDirectoryPath(outputDir, label, { create = false } = {}) {
  const resolvedOutputDir = path.resolve(outputDir);
  requireDirectoryAnchoring(label);

  if (create) fs.mkdirSync(resolvedOutputDir, { recursive: true });

  const stat = fs.lstatSync(resolvedOutputDir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be an existing real directory: ${resolvedOutputDir}`);
  }

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const descriptor = fs.openSync(
    resolvedOutputDir,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
  );
  try {
    const openedStat = fs.fstatSync(descriptor);
    if (!openedStat.isDirectory()) {
      throw new Error(`${label} must remain a real directory: ${resolvedOutputDir}`);
    }
    const anchorPath = `/proc/self/fd/${descriptor}`;
    const anchoredRealPath = fs.realpathSync.native(anchorPath);
    if (path.resolve(anchoredRealPath) !== resolvedOutputDir) {
      throw new Error(`${label} changed identity before it could be anchored: ${resolvedOutputDir}`);
    }
    return { descriptor, anchorPath, closeDescriptor: true };
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

function openInheritedOutputDirectory(value) {
  requireDirectoryAnchoring('--output-fd');
  if (!/^[0-9]+$/.test(String(value)) || Number(value) < 3) {
    throw new Error('--output-fd requires an inherited directory descriptor of 3 or greater');
  }
  const descriptor = Number(value);
  const stat = fs.fstatSync(descriptor);
  if (!stat.isDirectory()) throw new Error(`--output-fd ${descriptor} is not a directory`);
  const anchorPath = `/proc/self/fd/${descriptor}`;
  fs.realpathSync.native(anchorPath);
  return { descriptor, anchorPath, closeDescriptor: false };
}

function lstatIfPresent(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function readAnchoredGeneratedFile(anchor, fileName) {
  const filePath = path.join(anchor.anchorPath, fileName);
  const stat = lstatIfPresent(filePath);
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`generated artifact must be a regular file, not a symlink: ${fileName}`);
  }

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    const openedStat = fs.fstatSync(descriptor);
    if (!openedStat.isFile()) throw new Error(`generated artifact must remain a regular file: ${fileName}`);
    return fs.readFileSync(descriptor, 'utf8');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function checkGeneratedFile(anchor, fileName, displayPath, expected) {
  const actual = readAnchoredGeneratedFile(anchor, fileName);
  if (actual === null) return `${path.relative(ROOT, displayPath)} is missing`;
  return actual === expected ? null : `${path.relative(ROOT, displayPath)} is stale`;
}

function atomicWriteAnchoredGeneratedFile(anchor, fileName, content) {
  const targetPath = path.join(anchor.anchorPath, fileName);
  const existing = lstatIfPresent(targetPath);
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
    throw new Error(`generated artifact target must be a regular file, not a symlink: ${fileName}`);
  }

  generatedWriteSequence += 1;
  const temporaryPath = path.join(
    anchor.anchorPath,
    `.${fileName}.generate-${process.pid}-${generatedWriteSequence}.tmp`
  );
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let descriptor;
  let temporaryExists = false;
  try {
    descriptor = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
      existing ? existing.mode & 0o777 : 0o644
    );
    temporaryExists = true;
    fs.fchmodSync(descriptor, existing ? existing.mode & 0o777 : 0o644);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, targetPath);
    temporaryExists = false;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (temporaryExists) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
}

function writeExclusiveGeneratedArtifacts(anchor, generated) {
  const entries = [
    [path.basename(MANIFEST_PATH), generated.json],
    [path.basename(REPORT_PATH), generated.markdown],
  ];
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const opened = [];
  let completed = false;
  try {
    for (const [fileName] of entries) {
      const filePath = path.join(anchor.anchorPath, fileName);
      const descriptor = fs.openSync(
        filePath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
        0o600
      );
      opened.push({ descriptor, filePath });
    }
    for (let index = 0; index < entries.length; index += 1) {
      fs.writeFileSync(opened[index].descriptor, entries[index][1]);
      fs.fsyncSync(opened[index].descriptor);
    }
    for (const output of opened) {
      fs.closeSync(output.descriptor);
      output.descriptor = undefined;
    }
    completed = true;
  } finally {
    for (const output of opened) {
      if (output.descriptor !== undefined) {
        try {
          fs.closeSync(output.descriptor);
        } catch {
          // The staging directory is disposable; cleanup below remains best-effort.
        }
      }
      if (!completed) {
        try {
          fs.unlinkSync(output.filePath);
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            // Preserve the original write/open error when cleanup also fails.
          }
        }
      }
    }
  }
}

export function writeGeneratedArtifactsToDirectory(outputDir, generated, { exclusive = false } = {}) {
  const anchor = openOutputDirectoryPath(outputDir, 'generated output directory');
  try {
    if (exclusive) {
      writeExclusiveGeneratedArtifacts(anchor, generated);
    } else {
      atomicWriteAnchoredGeneratedFile(anchor, path.basename(MANIFEST_PATH), generated.json);
      atomicWriteAnchoredGeneratedFile(anchor, path.basename(REPORT_PATH), generated.markdown);
    }
  } finally {
    fs.closeSync(anchor.descriptor);
  }
}

export function runCli(args = process.argv.slice(2)) {
  const modeArgs = [];
  const unknown = [];
  let outputDir = null;
  let outputFd = null;

  const usage = 'Usage: node scripts/generate-wiki-content-state.mjs [--write|--check] [--output-dir <absolute-dir>|--output-fd <fd>]';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check' || arg === '--write') {
      modeArgs.push(arg);
      continue;
    }
    if (arg === '--output-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        console.error('--output-dir requires a directory path.');
        console.error(usage);
        return 2;
      }
      if (outputDir !== null) {
        console.error('--output-dir may only be specified once.');
        return 2;
      }
      outputDir = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      const value = arg.slice('--output-dir='.length);
      if (!value) {
        console.error('--output-dir requires a directory path.');
        console.error(usage);
        return 2;
      }
      if (outputDir !== null) {
        console.error('--output-dir may only be specified once.');
        return 2;
      }
      outputDir = value;
      continue;
    }
    if (arg === '--output-fd') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        console.error('--output-fd requires a descriptor number.');
        console.error(usage);
        return 2;
      }
      if (outputFd !== null) {
        console.error('--output-fd may only be specified once.');
        return 2;
      }
      outputFd = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--output-fd=')) {
      const value = arg.slice('--output-fd='.length);
      if (!value) {
        console.error('--output-fd requires a descriptor number.');
        console.error(usage);
        return 2;
      }
      if (outputFd !== null) {
        console.error('--output-fd may only be specified once.');
        return 2;
      }
      outputFd = value;
      continue;
    }
    unknown.push(arg);
  }

  if (unknown.length) {
    console.error(`Unknown argument(s): ${unknown.join(', ')}`);
    console.error(usage);
    return 2;
  }
  if (args.includes('--check') && args.includes('--write')) {
    console.error('Choose either --check or --write, not both.');
    return 2;
  }
  if (outputDir !== null && outputFd !== null) {
    console.error('Choose either --output-dir or --output-fd, not both.');
    return 2;
  }
  if (outputDir !== null && !path.isAbsolute(outputDir)) {
    console.error('--output-dir requires an absolute directory path.');
    return 2;
  }
  if (outputFd !== null && (!/^[0-9]+$/.test(String(outputFd)) || Number(outputFd) < 3)) {
    console.error('--output-fd requires an inherited directory descriptor of 3 or greater.');
    return 2;
  }
  if (modeArgs.includes('--check') && (outputDir !== null || outputFd !== null)) {
    console.error('--output-dir and --output-fd are write-mode staging options.');
    return 2;
  }

  const generated = outputs();
  if (modeArgs.includes('--check')) {
    const anchor = openOutputDirectoryPath(path.dirname(MANIFEST_PATH), 'brand-canon output directory');
    try {
      const failures = [
        checkGeneratedFile(anchor, path.basename(MANIFEST_PATH), MANIFEST_PATH, generated.json),
        checkGeneratedFile(anchor, path.basename(REPORT_PATH), REPORT_PATH, generated.markdown),
      ].filter(Boolean);
      if (failures.length) {
        for (const failure of failures) console.error(failure);
        console.error('Run `node scripts/generate-wiki-content-state.mjs` and commit both generated artifacts.');
        return 1;
      }
      console.log(`Wiki content-state artifacts are current for ${generated.manifest.summary.total_pages_audited} pages.`);
      return 0;
    } finally {
      fs.closeSync(anchor.descriptor);
    }
  }

  if (outputDir !== null || outputFd !== null) {
    const anchor = outputFd !== null
      ? openInheritedOutputDirectory(outputFd)
      : openOutputDirectoryPath(outputDir, '--output-dir');
    try {
      writeExclusiveGeneratedArtifacts(anchor, generated);
    } finally {
      if (anchor.closeDescriptor) fs.closeSync(anchor.descriptor);
    }
    const displayRoot = outputDir || `fd ${outputFd}`;
    console.log(`Audited ${generated.manifest.summary.total_pages_audited} wiki pages.`);
    console.log(`Wrote ${path.join(displayRoot, path.basename(MANIFEST_PATH))}.`);
    console.log(`Wrote ${path.join(displayRoot, path.basename(REPORT_PATH))}.`);
    return 0;
  }

  writeGeneratedArtifactsToDirectory(path.dirname(MANIFEST_PATH), generated);
  console.log(`Audited ${generated.manifest.summary.total_pages_audited} wiki pages.`);
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)}.`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}.`);
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) process.exitCode = runCli();

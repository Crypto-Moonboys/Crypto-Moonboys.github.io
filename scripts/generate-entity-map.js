#!/usr/bin/env node
/**
 * scripts/generate-entity-map.js
 *
 * Reads the canonical wiki index (js/wiki-index.json) produced by
 * generate-wiki-index.js and emits two generated files:
 *
 *   js/entity-map.json   — frontend-friendly canonical entity registry
 *   sam-memory.json      — machine-friendly memory handoff for SAM / brain-side systems
 *
 * Both files are deterministic: same input → same output. JSON keys are
 * sorted and entries are ordered by entity_id to guarantee stable diffs.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP_PATH = path.join(ROOT, 'js', 'entity-map.json');
const SAM_MEMORY_PATH = path.join(ROOT, 'sam-memory.json');

const LEGACY_EXCLUDED_URLS = new Set([
  '/wiki/index.html'
]);

const JUNK_SINGLES = new Set([
  'page', 'wiki', 'article', 'home', 'index', 'site', 'web', 'link',
  'read', 'more', 'click', 'here', 'next', 'prev', 'previous', 'back',
  'top', 'menu', 'nav', 'navigation', 'footer', 'header', 'sidebar',
  'search', 'tag', 'tags', 'category', 'categories', 'list', 'all',
]);

const NAV_PHRASES = new Set([
  'back to top', 'read more', 'click here', 'learn more', 'see also',
  'external link', 'edit page', 'view source', 'table of contents',
  'in this article', 'on this page',
]);

const TITLE_WORD_MAP = {
  nft: 'NFT',
  nfts: 'NFTs',
  btc: 'BTC',
  eth: 'ETH',
  xrp: 'XRP',
  defi: 'DeFi',
  dao: 'DAO',
  gk: 'GK',
  nbg: 'NBG',
  nbgx: 'NBGX',
  dex: 'DEX',
  p2e: 'P2E',
  f2p: 'F2P',
  ai: 'AI',
  api: 'API',
  ui: 'UI',
  ux: 'UX',
  tv: 'TV',
  dj: 'DJ',
};

function normalizeWikiUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\/+/g, '/');
}

function isAllowedCanonicalUrl(url) {
  const normalized = normalizeWikiUrl(url);
  return normalized.startsWith('/wiki/') && !LEGACY_EXCLUDED_URLS.has(normalized);
}

function makeEntityId(title, url) {
  const slug = normalizeWikiUrl(url)
    .replace(/^\/wiki\//, '')
    .replace(/\.html$/, '');

  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function convertSlugToTitle(title) {
  if (!title.includes('_') || title.includes(' ')) return title;

  return title
    .split('_')
    .map(word => {
      if (!word) return word;
      const lower = word.toLowerCase();

      if (Object.prototype.hasOwnProperty.call(TITLE_WORD_MAP, lower)) {
        return TITLE_WORD_MAP[lower];
      }

      if (/^\d+[a-z]$/.test(lower)) {
        return word.slice(0, -1) + word.slice(-1).toUpperCase();
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function generateTags(title) {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'of', 'in', 'for', 'on', 'at', 'to', 'by',
    'or', 'is', 'are', 'it', 'its', 'with', 'as',
  ]);

  return [...new Set(
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopwords.has(w))
  )];
}

function isValidAliasCandidate(candidate, canonicalTitle) {
  if (!candidate || typeof candidate !== 'string') return false;

  const trimmed = candidate.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;

  const lower = trimmed.toLowerCase();

  if (NAV_PHRASES.has(lower)) return false;
  if (!lower.includes(' ') && JUNK_SINGLES.has(lower)) return false;
  if (lower === canonicalTitle.toLowerCase()) return false;
  if (trimmed.split(/\s+/).length === 1 && trimmed.length < 4) return false;

  return true;
}

function generateAliasCandidates(entry) {
  const candidates = new Set();
  const canon = entry.canonical_title.toLowerCase();

  const slugPhrase = entry.canonical_url
    .replace(/^\/wiki\//, '')
    .replace(/\.html$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (slugPhrase && slugPhrase.toLowerCase() !== canon) {
    candidates.add(slugPhrase);
  }

  const titleNoThe = entry.canonical_title.replace(/^(The|A|An)\s+/i, '').trim();
  if (titleNoThe && titleNoThe !== entry.canonical_title) {
    candidates.add(titleNoThe);
  }

  const tagPhrase = (entry.tags || []).join(' ').trim();
  if (
    tagPhrase &&
    tagPhrase.toLowerCase() !== canon &&
    (entry.tags || []).length > 1 &&
    (entry.tags || []).length <= 5
  ) {
    candidates.add(tagPhrase);
  }

  const approvedLower = new Set((entry.aliases || []).map(a => a.toLowerCase()));

  return [...candidates]
    .filter(c => isValidAliasCandidate(c, entry.canonical_title))
    .filter(c => !approvedLower.has(c.toLowerCase()))
    .sort();
}

function deterministicReplacer(key, val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return Object.fromEntries(
      Object.entries(val).sort(([a], [b]) => a.localeCompare(b))
    );
  }
  return val;
}

if (!fs.existsSync(WIKI_INDEX_PATH)) {
  console.error(`Error: ${WIKI_INDEX_PATH} not found.`);
  console.error('Run `node scripts/generate-wiki-index.js` first.');
  process.exit(1);
}

const wikiIndex = JSON.parse(fs.readFileSync(WIKI_INDEX_PATH, 'utf8'));
console.log(`Loaded ${wikiIndex.length} canonical entries from js/wiki-index.json`);

const entityRecords = [];

for (const entry of wikiIndex) {
  if (!entry || typeof entry !== 'object') continue;

  const canonicalUrl = normalizeWikiUrl(entry.url);
  if (!isAllowedCanonicalUrl(canonicalUrl)) continue;

  const canonicalTitle = convertSlugToTitle(String(entry.title || '').trim());
  if (!canonicalTitle) continue;

  const entityId = makeEntityId(canonicalTitle, canonicalUrl);
  if (!entityId) continue;

  const approvedAliases = (entry.aliases || [])
    .map(a => {
      if (typeof a === 'string') return a.trim();
      if (a && typeof a.title === 'string') return a.title.trim();
      return '';
    })
    .filter(Boolean)
    .filter((value, index, arr) => arr.findIndex(v => v.toLowerCase() === value.toLowerCase()) === index);

  const tags = Array.isArray(entry.tags) && entry.tags.length > 0
    ? entry.tags
    : generateTags(canonicalTitle);

  const sourceUrls = [canonicalUrl];

  if (Array.isArray(entry.aliases)) {
    for (const alias of entry.aliases) {
      if (!alias || typeof alias !== 'object' || !alias.url) continue;
      const aliasUrl = normalizeWikiUrl(alias.url);
      if (!isAllowedCanonicalUrl(aliasUrl)) continue;
      if (!sourceUrls.includes(aliasUrl)) sourceUrls.push(aliasUrl);
    }
  }

  entityRecords.push({
    entity_id: entityId,
    canonical_title: canonicalTitle,
    canonical_url: canonicalUrl,
    category: entry.category || 'Lore',
    aliases: approvedAliases,
    tags,
    source_urls: sourceUrls.sort()
  });
}

entityRecords.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

const allCanonicalTitlesLower = new Set(
  entityRecords.map(r => r.canonical_title.toLowerCase())
);

const allApprovedAliasesLower = new Set();
for (const record of entityRecords) {
  record.aliases.forEach(alias => allApprovedAliasesLower.add(alias.toLowerCase()));
}

for (const record of entityRecords) {
  const rawCandidates = generateAliasCandidates(record);

  const safe = rawCandidates.filter(candidate => {
    const lower = candidate.toLowerCase();

    if (
      allCanonicalTitlesLower.has(lower) &&
      lower !== record.canonical_title.toLowerCase()
    ) {
      return false;
    }

    if (allApprovedAliasesLower.has(lower)) return false;
    return true;
  });

  if (safe.length > 0) {
    record.alias_candidates = safe;
  }
}

fs.writeFileSync(
  ENTITY_MAP_PATH,
  JSON.stringify(entityRecords, null, 2) + '\n'
);
console.log(`Generated js/entity-map.json with ${entityRecords.length} entity records`);

const entities = {};
for (const record of entityRecords) {
  entities[record.entity_id] = {
    aliases: record.aliases,
    alias_candidates: record.alias_candidates || [],
    canonical_title: record.canonical_title,
    canonical_url: record.canonical_url,
    category: record.category,
    source_urls: record.source_urls,
    status: 'canonical',
    tags: record.tags,
  };
}

let updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

if (fs.existsSync(SAM_MEMORY_PATH)) {
  try {
    const existing = JSON.parse(fs.readFileSync(SAM_MEMORY_PATH, 'utf8'));
    const existingEntitiesJson = JSON.stringify(existing.entities, deterministicReplacer);
    const newEntitiesJson = JSON.stringify(entities, deterministicReplacer);

    if (existingEntitiesJson === newEntitiesJson && existing.updated_at) {
      updatedAt = existing.updated_at;
    }
  } catch (err) {
    console.warn(
      'Warning: could not parse existing sam-memory.json — using fresh timestamp.',
      err.message
    );
  }
}

const samMemory = {
  entities,
  updated_at: updatedAt,
};

fs.writeFileSync(
  SAM_MEMORY_PATH,
  JSON.stringify(samMemory, deterministicReplacer, 2) + '\n'
);

console.log(`Generated sam-memory.json with ${Object.keys(entities).length} entities`);
console.log(`  updated_at: ${updatedAt}`);
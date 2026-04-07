#!/usr/bin/env node
/**
 * scripts/generate-wiki-index.js
 *
 * Scans every HTML file in /wiki/ and generates js/wiki-index.json.
 * For pages already tracked in the WIKI_INDEX inside js/wiki.js the
 * existing title / desc / category / emoji / tags values are preserved.
 * Pages that exist on disk but are not yet indexed get their metadata
 * extracted from the HTML (title, desc, category) with sensible defaults
 * for emoji and tags.
 *
 * Canonical entity system:
 *   - For every entry a set of alias variations is generated via
 *     generateAutoAliases(): normalised title, title without filler words,
 *     URL-slug form, and phrase-level keyword substitutions (btc↔bitcoin,
 *     nft↔nfts, eth↔ethereum, etc.).
 *   - Entries whose alias sets share any common element are treated as
 *     duplicates and merged via union-find (connected-components approach).
 *     This detects duplicates across naming variations, not just identical
 *     normalised titles.
 *   - The most descriptive (longest-title) entry becomes canonical; others
 *     become aliases stored in canonical.aliases: [{title, url}].
 *   - Alias pages that contain no substantial body content (< 2 KB) are
 *     replaced with a minimal HTML redirect stub.
 *   - Only canonical entries appear in the final index.
 *   - Aliases can also be declared explicitly via the `aliases` field in
 *     wiki-index.json; those files are treated as aliases on the next run.
 *
 * Ranking system:
 *   - Generator-side rank_score is deterministic and query-independent.
 *   - Frontend search remains query-first, with rank_score used as a stable
 *     authority/base-order tie-break.
 *   - Every output entry includes rank_signals, rank_diagnostics, and
 *     precomputed search fields so bad ordering can be inspected without
 *     guessing in the browser.
 *
 * Run after adding new wiki pages:
 *   node scripts/generate-wiki-index.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const OUTPUT   = path.join(ROOT, 'js', 'wiki-index.json');
const WIKI_JS  = path.join(ROOT, 'js', 'wiki.js');
const BASE_URL = 'https://crypto-moonboys.github.io';
const SEARCH_PHILOSOPHY = 'mixed';
const RANK_FORMULA_VERSION = 3;
// Redirect stubs produced by this script are always much smaller than real
// wiki articles.  Any file at or above this byte threshold is treated as a
// full article and will NOT be overwritten with a redirect stub.
const MIN_CONTENT_BYTES = 2000;

/* ── Category → default emoji ───────────────────────────────────────────── */
const CATEGORY_EMOJI = {
  'Cryptocurrencies':           '🪙',
  'Concepts':                   '💡',
  'Technology':                 '⚙️',
  'Tools & Platforms':          '🔧',
  'Tools':                      '🔧',
  'Lore':                       '⚔️',
  'Crypto Designer Toys':       '🧸',
  'Guerilla Marketing':         '📢',
  'Graffiti & Street Art':      '✍️',
  'NFTs & Digital Art':         '🖼️',
  'Punk Culture':               '✊',
  'Gaming':                     '🎮',
  'Community & People':         '👥',
  'Media & Publishing':         '📰',
  'Art & Creativity':           '🎨',
  'Activism & Counter-Culture': '✊',
};

/* ── Category → ranking priority (higher = more important) ───────────────
   Locked ranking strategy:
   - Broad crypto / infrastructure categories sit above niche/lore buckets.
   - This affects deterministic base ordering only.
   - Frontend query relevance still decides the primary match order.
   Change these weights deliberately and document why. ───────────────────── */
const CATEGORY_PRIORITY = {
  'Cryptocurrencies':           10,
  'Technology':                  9,
  'Concepts':                    8,
  'Tools & Platforms':           7,
  'Tools':                       7,
  'NFTs & Digital Art':          6,
  'Gaming':                      5,
  'Community & People':          4,
  'Lore':                        3,
  'Crypto Designer Toys':        3,
  'Guerilla Marketing':          3,
  'Graffiti & Street Art':       3,
  'Media & Publishing':          2,
  'Art & Creativity':            2,
  'Punk Culture':                2,
  'Activism & Counter-Culture':  2,
};

const REQUIRED_RANK_SIGNAL_KEYS = [
  'is_canonical',
  'alias_count',
  'tag_count',
  'category_priority',
  'has_description',
  'article_word_count',
  'keyword_bag_size',
  'article_length_points',
  'description_points',
  'alias_richness_points',
  'taxonomy_completeness_points',
  'content_quality_score',
];

/* ── Decode HTML entities in plain text ─────────────────────────────────── */
function decodeHtmlEntities(str) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  return str
    .replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => named[e] || m)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (m, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function slugToTitle(filename) {
  return filename
    .replace('.html', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const CLEAN_TITLE_WORD_MAP = {
  nft:   'NFT',
  nfts:  'NFTs',
  btc:   'BTC',
  eth:   'ETH',
  xrp:   'XRP',
  defi:  'DeFi',
  dao:   'DAO',
  gk:    'GK',
  nbg:   'NBG',
  nbgx:  'NBGX',
  pmsl:  'PMSL',
  dex:   'DEX',
  p2e:   'P2E',
  f2p:   'F2P',
  ai:    'AI',
  api:   'API',
  ui:    'UI',
  ux:    'UX',
  tv:    'TV',
  dj:    'DJ',
};

function cleanDisplayTitle(title) {
  if (!title) return title;
  if (!title.includes('_') || title.includes(' ')) return title;
  return title
    .split('_')
    .map(word => {
      if (!word) return word;
      const lower = word.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(CLEAN_TITLE_WORD_MAP, lower)) {
        return CLEAN_TITLE_WORD_MAP[lower];
      }
      if (/^\d+[a-z]$/.test(lower)) return word.slice(0, -1) + word.slice(-1).toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function loadExistingIndex() {
  if (fs.existsSync(OUTPUT)) {
    try {
      const arr = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
      const lookup = {};
      arr.forEach(item => {
        const slug = item.url.replace(/^\/wiki\//, '');
        lookup[slug] = Object.assign({}, item, {
          title:    cleanDisplayTitle(decodeHtmlEntities(item.title    || '')),
          desc:     decodeHtmlEntities(item.desc     || ''),
          category: decodeHtmlEntities(item.category || ''),
          aliases:  Array.isArray(item.aliases) ? item.aliases : undefined,
        });
      });
      return lookup;
    } catch (e) {
      console.warn('Could not parse existing wiki-index.json, falling back to wiki.js parse.', e.message);
    }
  }

  if (!fs.existsSync(WIKI_JS)) return {};

  const src = fs.readFileSync(WIKI_JS, 'utf8');
  const startMarker = 'const WIKI_INDEX = [';
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) return {};

  const entrySrc = src.slice(startIdx);
  const lookup   = {};

  const urlRe = /url:\s*"(wiki\/[^"]+)"/g;
  let m;
  while ((m = urlRe.exec(entrySrc)) !== null) {
    const urlValue = m[1];
    const slug     = urlValue.replace('wiki/', '');
    const pos      = m.index;

    let start = pos;
    while (start > 0 && entrySrc[start] !== '{') start--;

    let end   = pos;
    let depth = 0;
    while (end < entrySrc.length) {
      if (entrySrc[end] === '[') depth++;
      if (entrySrc[end] === ']') depth--;
      if (entrySrc[end] === '}' && depth === 0) break;
      end++;
    }

    const block  = entrySrc.slice(start, end + 1);

    const titleM = block.match(/title:\s*"((?:[^"\\]|\\.)*)"/);
    const descM  = block.match(/desc:\s*"((?:[^"\\]|\\.)*)"/);
    const catM   = block.match(/category:\s*"((?:[^"\\]|\\.)*)"/);
    const emojiM = block.match(/emoji:\s*"([^"]+)"/);
    const tagsM  = block.match(/tags:\s*\[([^\]]*)\]/s);

    const tags = tagsM
      ? [...tagsM[1].matchAll(/"([^"]+)"/g)].map(tm => tm[1])
      : [];

    lookup[slug] = {
      title:    titleM  ? titleM[1]  : '',
      url:      urlValue,
      desc:     descM   ? descM[1]   : '',
      category: catM    ? catM[1]    : '',
      emoji:    emojiM  ? emojiM[1]  : '📄',
      tags,
    };
  }

  return lookup;
}

const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'in', 'for', 'on', 'at', 'to', 'by',
  'or', 'is', 'are', 'it', 'its', 'with', 'as',
]);

const KEYWORD_SUBS = {
  'bitcoin':            ['btc'],
  'btc':                ['bitcoin'],
  'ethereum':           ['eth'],
  'eth':                ['ethereum'],
  'nft':                ['nfts'],
  'nfts':               ['nft'],
  'token':              ['tokens'],
  'tokens':             ['token'],
  'solana':             ['sol'],
  'sol':                ['solana'],
  'ripple':             ['xrp'],
  'xrp':                ['ripple'],
  'cardano':            ['ada'],
  'ada':                ['cardano'],
  'defi':               ['decentralized finance', 'decentralised finance'],
  'decentralized':      ['decentralised'],
  'decentralised':      ['decentralized'],
  'nonfungible':        ['non fungible', 'nft'],
  'non':                [],
  'dao':                ['decentralized autonomous organization'],
  'blockchain':         ['chain'],
  'crypto':             ['cryptocurrency', 'cryptocurrencies'],
  'cryptocurrency':     ['crypto'],
  'cryptocurrencies':   ['crypto'],
};

function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/['''"""]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenizeText(text) {
  return normalizeTitle(text)
    .split(/\s+/)
    .filter(Boolean);
}

function generateAutoAliases(entry) {
  const variations = new Set();
  const norm = normalizeTitle(entry.title);
  if (norm) variations.add(norm);

  const noFiller = norm.split(' ').filter(w => !FILLER_WORDS.has(w)).join(' ').trim();
  if (noFiller && noFiller !== norm) variations.add(noFiller);

  const slug = (entry.url || '')
    .replace(/^\/wiki\//, '')
    .replace(/\.html$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const normSlug = normalizeTitle(slug);
  if (normSlug && normSlug !== norm) variations.add(normSlug);

  const words = norm.split(' ');
  for (let i = 0; i < words.length; i++) {
    const subs = KEYWORD_SUBS[words[i]] || [];
    for (const sub of subs) {
      const variant = [...words.slice(0, i), sub, ...words.slice(i + 1)].join(' ').trim();
      if (variant !== norm) variations.add(variant);
    }
  }

  return variations;
}

function deduplicateIndex(entries) {
  const aliasSets = entries.map(e => generateAutoAliases(e));
  const aliasToIndices = new Map();
  aliasSets.forEach((aliasSet, idx) => {
    aliasSet.forEach(alias => {
      if (!aliasToIndices.has(alias)) aliasToIndices.set(alias, []);
      aliasToIndices.get(alias).push(idx);
    });
  });

  const parent = entries.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(x, y) {
    parent[find(x)] = find(y);
  }
  for (const [, indices] of aliasToIndices) {
    for (let i = 1; i < indices.length; i++) {
      union(indices[0], indices[i]);
    }
  }

  const groups = new Map();
  entries.forEach((entry, idx) => {
    const root = find(idx);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(entry);
  });

  const canonicalEntries = [];
  const aliasUrls = new Set();

  for (const [, group] of groups) {
    const canonical = group.slice().sort((a, b) => {
      const aHasAliases = (a.aliases && a.aliases.length > 0) ? 1 : 0;
      const bHasAliases = (b.aliases && b.aliases.length > 0) ? 1 : 0;
      if (bHasAliases !== aHasAliases) return bHasAliases - aHasAliases;
      if (b.title.length !== a.title.length) return b.title.length - a.title.length;
      return a.url.length - b.url.length;
    })[0];

    for (const e of group) {
      if (Array.isArray(e.aliases)) e.aliases.forEach(a => aliasUrls.add(a.url));
    }

    if (group.length === 1) {
      canonicalEntries.push(canonical);
      continue;
    }

    const mergedAliases = Array.isArray(canonical.aliases) ? [...canonical.aliases] : [];

    for (const dupe of group) {
      if (dupe === canonical) continue;
      aliasUrls.add(dupe.url);
      if (!mergedAliases.some(a => a.url === dupe.url)) {
        mergedAliases.push({ title: dupe.title, url: dupe.url });
      }
      console.log(`  ~ duplicate merged: "${dupe.title}" (${dupe.url}) → canonical "${canonical.title}" (${canonical.url})`);
    }

    canonical.aliases = mergedAliases.length > 0 ? mergedAliases : undefined;
    if (canonical.aliases) canonical.aliases.forEach(a => aliasUrls.add(a.url));
    canonicalEntries.push(canonical);
  }

  return { canonicalEntries, aliasUrls };
}

function generateRedirectFile(aliasFilePath, canonicalUrl) {
  if (!/^\/wiki\/[a-z0-9][a-z0-9_-]*\.html$/.test(canonicalUrl)) {
    console.warn(`  ! invalid canonical URL format, skipping redirect: ${canonicalUrl}`);
    return false;
  }

  if (fs.existsSync(aliasFilePath)) {
    const existing = fs.readFileSync(aliasFilePath, 'utf8');
    const isStub = /http-equiv/i.test(existing) && /\brefresh\b/i.test(existing);
    if (!isStub) {
      const byteSize = Buffer.byteLength(existing, 'utf8');
      if (byteSize >= MIN_CONTENT_BYTES) {
        console.log(`  ! skipping redirect for ${path.basename(aliasFilePath)} (has substantial content, ${byteSize} bytes)`);
        return false;
      }
    }
  }

  const redirectHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${canonicalUrl}">
<link rel="canonical" href="${BASE_URL}${canonicalUrl}">
<title>Redirecting…</title>
</head>
<body>
<p>Redirecting to <a href="${canonicalUrl}">canonical page</a>…</p>
</body>
</html>
`;
  fs.writeFileSync(aliasFilePath, redirectHtml, 'utf8');
  console.log(`  → wrote redirect: ${path.basename(aliasFilePath)} → ${canonicalUrl}`);
  return true;
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return null;
  return decodeHtmlEntities(m[1]
    .replace(/\s*[—–-]+\s*Crypto Moonboys Wiki\s*$/i, '')
    .trim());
}

function extractDesc(html) {
  const ogM = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (ogM) return decodeHtmlEntities(ogM[1].trim());
  const m = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

function extractCategory(html) {
  const divM = html.match(/<div class="category-tags"[^>]*>([\s\S]*?)<\/div>/i);
  if (!divM) return null;
  const links = [...divM[1].matchAll(/href="[^"]*categories\/[^"]*"[^>]*>([^<]+)<\/a>/gi)];
  return links.length ? decodeHtmlEntities(links[0][1].trim()) : null;
}

function extractBodyText(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function generateTags(title) {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'of', 'in', 'for', 'on', 'at', 'to', 'by',
    'or', 'is', 'are', 'it', 'its', 'with', 'as',
  ]);
  return [...new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopwords.has(w)),
  )];
}

function buildKeywordBag(entry) {
  const bag = new Set();
  tokenizeText(entry.title).forEach(t => bag.add(t));
  tokenizeText(entry.desc || '').forEach(t => bag.add(t));
  (entry.tags || []).forEach(tag => tokenizeText(tag).forEach(t => bag.add(t)));
  (entry.aliases || []).forEach(alias => tokenizeText(alias.title || '').forEach(t => bag.add(t)));
  return [...bag].sort();
}

function computeArticleLengthPoints(wordCount) {
  if (wordCount >= 5000) return 8;
  if (wordCount >= 3000) return 6;
  if (wordCount >= 1500) return 4;
  if (wordCount >= 750) return 3;
  if (wordCount >= 300) return 2;
  if (wordCount >= 100) return 1;
  return 0;
}

function computeTaxonomyCompletenessPoints(entry) {
  let points = 0;
  if (String(entry.category || '').trim()) points += 2;
  if (Array.isArray(entry.tags) && entry.tags.length >= 1) points += 1;
  if (Array.isArray(entry.tags) && entry.tags.length >= 3) points += 1;
  return points;
}

function computeRankSignals(entry) {
  const aliasCount = Array.isArray(entry.aliases) ? entry.aliases.length : 0;
  const tagCount = Array.isArray(entry.tags) ? entry.tags.length : 0;
  const articleWordCount = Number(entry.article_word_count || 0);
  const hasDescription = Boolean(String(entry.desc || '').trim());
  const articleLengthPoints = computeArticleLengthPoints(articleWordCount);
  const descriptionPoints = hasDescription ? 3 : 0;
  const aliasRichnessPoints = Math.min(aliasCount, 4);
  const taxonomyCompletenessPoints = computeTaxonomyCompletenessPoints(entry);
  const contentQualityScore = articleLengthPoints + descriptionPoints + aliasRichnessPoints + taxonomyCompletenessPoints;

  return {
    is_canonical: true,
    alias_count: aliasCount,
    tag_count: tagCount,
    category_priority: CATEGORY_PRIORITY[entry.category] || 1,
    has_description: hasDescription,
    article_word_count: articleWordCount,
    keyword_bag_size: Array.isArray(entry.keyword_bag) ? entry.keyword_bag.length : 0,
    article_length_points: articleLengthPoints,
    description_points: descriptionPoints,
    alias_richness_points: aliasRichnessPoints,
    taxonomy_completeness_points: taxonomyCompletenessPoints,
    content_quality_score: contentQualityScore,
  };
}

function computeRankScore(signals) {
  return (
    50 +
    signals.category_priority * 2 +
    signals.alias_count * 3 +
    signals.tag_count +
    signals.content_quality_score
  );
}

function buildRankDiagnostics(entry, signals, score) {
  return {
    philosophy: SEARCH_PHILOSOPHY,
    formula_version: RANK_FORMULA_VERSION,
    deterministic: true,
    base_score: 50,
    score_formula: '50 + (category_priority * 2) + (alias_count * 3) + tag_count + content_quality_score',
    score_components: {
      base_score: 50,
      category_priority_points: signals.category_priority * 2,
      alias_points: signals.alias_count * 3,
      tag_points: signals.tag_count,
      content_quality_points: signals.content_quality_score,
    },
    final_rank_score: score,
    title_normalized: normalizeTitle(entry.title),
    alias_titles: (entry.aliases || []).map(a => a.title).sort((a, b) => a.localeCompare(b)),
    searchable_fields: {
      keyword_bag: entry.keyword_bag,
      alias_tokens: entry.alias_tokens,
      title_tokens: entry.title_tokens,
    },
    content_signals: {
      has_description: signals.has_description,
      article_word_count: signals.article_word_count,
      description_length: String(entry.desc || '').trim().length,
      article_length_points: signals.article_length_points,
      description_points: signals.description_points,
      alias_richness_points: signals.alias_richness_points,
      taxonomy_completeness_points: signals.taxonomy_completeness_points,
      content_quality_score: signals.content_quality_score,
    },
  };
}

function validateWikiIndex(index) {
  if (!Array.isArray(index)) {
    throw new Error('wiki-index output is not an array');
  }
  index.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Entry ${idx} is not an object`);
    }
    ['title', 'url', 'desc', 'category', 'emoji'].forEach(key => {
      if (typeof entry[key] !== 'string') {
        throw new Error(`Entry ${idx} missing string field '${key}'`);
      }
    });
    if (!Array.isArray(entry.tags)) {
      throw new Error(`Entry ${idx} missing tags array`);
    }
    if (typeof entry.rank_score !== 'number' || Number.isNaN(entry.rank_score)) {
      throw new Error(`Entry ${idx} has invalid rank_score`);
    }
    if (!entry.rank_signals || typeof entry.rank_signals !== 'object') {
      throw new Error(`Entry ${idx} missing rank_signals`);
    }
    for (const key of REQUIRED_RANK_SIGNAL_KEYS) {
      if (!(key in entry.rank_signals)) {
        throw new Error(`Entry ${idx} rank_signals missing '${key}'`);
      }
    }
    if (!entry.rank_diagnostics || typeof entry.rank_diagnostics !== 'object') {
      throw new Error(`Entry ${idx} missing rank_diagnostics`);
    }
    if (!entry.search_index || typeof entry.search_index !== 'object') {
      throw new Error(`Entry ${idx} missing search_index`);
    }
    ['keyword_bag', 'title_tokens', 'alias_tokens'].forEach(key => {
      if (!Array.isArray(entry.search_index[key])) {
        throw new Error(`Entry ${idx} search_index.${key} must be an array`);
      }
    });
  });
}

const existingLookup = loadExistingIndex();
console.log(`Loaded ${Object.keys(existingLookup).length} existing entries from js/wiki.js`);

const knownAliasUrls = new Set();
for (const entry of Object.values(existingLookup)) {
  if (Array.isArray(entry.aliases)) {
    entry.aliases.forEach(a => knownAliasUrls.add(a.url));
  }
}

const htmlFiles = fs.readdirSync(WIKI_DIR)
  .filter(f => f.endsWith('.html'))
  .sort();

const rawIndex = [];
let fromExisting = 0;
let fromHtml     = 0;

for (const file of htmlFiles) {
  const fileUrl  = `/wiki/${file}`;
  if (knownAliasUrls.has(fileUrl)) continue;

  const html     = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
  const existing = existingLookup[file];
  const articleWordCount = extractBodyText(html).split(/\s+/).filter(Boolean).length;

  if (existing) {
    const entry = {
      title:    existing.title,
      url:      fileUrl,
      desc:     existing.desc,
      category: existing.category,
      emoji:    existing.emoji,
      tags:     existing.tags,
      article_word_count: articleWordCount,
    };
    if (Array.isArray(existing.aliases)) entry.aliases = existing.aliases;
    rawIndex.push(entry);
    fromExisting++;
  } else {
    const rawTitle = extractTitle(html);
    const title    = cleanDisplayTitle(rawTitle || slugToTitle(file));
    const desc     = extractDesc(html)     || '';
    const category = extractCategory(html) || 'Lore';
    const emoji    = CATEGORY_EMOJI[category] || '📄';
    const tags     = generateTags(title);

    rawIndex.push({ title, url: fileUrl, desc, category, emoji, tags, article_word_count: articleWordCount });
    fromHtml++;
    console.log(`  + extracted from HTML: ${file} (category: ${category})`);
  }
}

const { canonicalEntries, aliasUrls } = deduplicateIndex(rawIndex);
let redirectsWritten = 0;
let redirectsSkipped = 0;

for (const aliasUrl of aliasUrls) {
  const file = aliasUrl.replace(/^\/wiki\//, '');
  const filePath = path.join(WIKI_DIR, file);
  if (!fs.existsSync(filePath)) continue;

  let canonicalUrl = null;
  for (const entry of canonicalEntries) {
    if (Array.isArray(entry.aliases) && entry.aliases.some(a => a.url === aliasUrl)) {
      canonicalUrl = entry.url;
      break;
    }
  }
  if (!canonicalUrl) continue;

  if (generateRedirectFile(filePath, canonicalUrl)) {
    redirectsWritten++;
  } else {
    redirectsSkipped++;
  }
}

const wikiIndex = canonicalEntries.map(entry => {
  const keyword_bag = buildKeywordBag(entry);
  const title_tokens = tokenizeText(entry.title);
  const alias_tokens = [...new Set((entry.aliases || []).flatMap(alias => tokenizeText(alias.title || '')))].sort();
  const enriched = {
    ...entry,
    keyword_bag,
    title_tokens,
    alias_tokens,
  };
  const rank_signals = computeRankSignals(enriched);
  const rank_score   = computeRankScore(rank_signals);
  const out = {
    title:        entry.title,
    url:          entry.url,
    desc:         entry.desc,
    category:     entry.category,
    emoji:        entry.emoji,
    tags:         entry.tags,
    rank_score,
    rank_signals,
    rank_diagnostics: buildRankDiagnostics(enriched, rank_signals, rank_score),
    search_index: {
      normalized_title: normalizeTitle(entry.title),
      title_tokens,
      alias_tokens,
      keyword_bag,
    },
  };
  if (Array.isArray(entry.aliases) && entry.aliases.length > 0) {
    out.aliases = entry.aliases;
  }
  return out;
});

validateWikiIndex(wikiIndex);
fs.writeFileSync(OUTPUT, JSON.stringify(wikiIndex, null, 2) + '\n');
console.log(`\nGenerated js/wiki-index.json with ${wikiIndex.length} canonical entries`);
console.log(`  ${fromExisting} from existing index (js/wiki-index.json or js/wiki.js WIKI_INDEX)`);
console.log(`  ${fromHtml} extracted from HTML (new pages)`);
if (aliasUrls.size > 0) {
  console.log(`  ${aliasUrls.size} alias URL(s) deduplicated (${redirectsWritten} redirect(s) written, ${redirectsSkipped} skipped — substantial content)`);
}

const badTitles = wikiIndex.filter(e => e.title.includes('_'));
if (badTitles.length > 0) {
  console.error(`\nERROR: ${badTitles.length} canonical title(s) still contain underscores:`);
  badTitles.forEach(e => console.error(`  ${e.url} → "${e.title}"`));
  process.exit(1);
}
console.log('  ✓ All canonical titles are clean (no underscores)');
console.log('  ✓ Ranking schema validation passed');

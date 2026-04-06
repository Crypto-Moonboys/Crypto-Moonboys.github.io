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

/* ── Decode HTML entities in plain text ─────────────────────────────────── */
function decodeHtmlEntities(str) {
  // Named entities
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  return str
    .replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => named[e] || m)
    // Hex numeric entities (e.g. &#x1F4DA; &#x2014;)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    // Decimal numeric entities (e.g. &#8212;)
    .replace(/&#([0-9]+);/g, (m, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

/* ── Convert a filename slug to a human-readable title ──────────────────── */
function slugToTitle(filename) {
  return filename
    .replace('.html', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* ── Clean a raw title into a human-readable display title ─────────────── */
// Converts underscore-slug titles (e.g. "1m_free_nfts") to Title Case with
// correct handling of known crypto/NFT abbreviations.
// - Only processes titles that contain underscores and no spaces (raw slugs).
// - Titles already containing spaces or proper casing are left unchanged.
// Note: this is a *display* cleaner; the existing normalizeTitle() function
//       below is for duplicate-detection only and must remain untouched.
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
  // Only transform titles that look like raw slugs (underscores, no spaces).
  if (!title.includes('_') || title.includes(' ')) return title;
  return title
    .split('_')
    .map(word => {
      if (!word) return word;
      const lower = word.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(CLEAN_TITLE_WORD_MAP, lower)) {
        return CLEAN_TITLE_WORD_MAP[lower];
      }
      // Numeric prefix with a single letter suffix (e.g. "1m" → "1M")
      if (/^\d+[a-z]$/.test(lower)) return word.slice(0, -1) + word.slice(-1).toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/* ── Load the existing index from wiki-index.json (preferred) or wiki.js ── */
function loadExistingIndex() {
  // Prefer the already-generated JSON — supports incremental updates.
  if (fs.existsSync(OUTPUT)) {
    try {
      const arr = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
      const lookup = {};
      arr.forEach(item => {
        const slug = item.url.replace(/^\/wiki\//, '');
        // Decode any HTML entities that may have been written in a previous run.
        lookup[slug] = Object.assign({}, item, {
          title:    cleanDisplayTitle(decodeHtmlEntities(item.title    || '')),
          desc:     decodeHtmlEntities(item.desc     || ''),
          category: decodeHtmlEntities(item.category || ''),
          // Preserve aliases array if present
          aliases:  Array.isArray(item.aliases) ? item.aliases : undefined,
        });
      });
      return lookup;
    } catch (e) {
      console.warn('Could not parse existing wiki-index.json, falling back to wiki.js parse.', e.message);
    }
  }

  // Fallback: parse WIKI_INDEX entries from wiki.js source.
  if (!fs.existsSync(WIKI_JS)) return {};

  const src = fs.readFileSync(WIKI_JS, 'utf8');
  const startMarker = 'const WIKI_INDEX = [';
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) return {};

  const entrySrc = src.slice(startIdx);
  const lookup   = {};

  // Walk through every `url:` key and extract the surrounding entry block.
  const urlRe = /url:\s*"(wiki\/[^"]+)"/g;
  let m;
  while ((m = urlRe.exec(entrySrc)) !== null) {
    const urlValue = m[1];
    const slug     = urlValue.replace('wiki/', '');
    const pos      = m.index;

    // Find opening '{' before this url: occurrence
    let start = pos;
    while (start > 0 && entrySrc[start] !== '{') start--;

    // Find closing '}' after this url: occurrence (skip nested '[...]')
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

/* ── Filler words stripped when comparing titles ────────────────────────── */
const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'in', 'for', 'on', 'at', 'to', 'by',
  'or', 'is', 'are', 'it', 'its', 'with', 'as',
]);

/* ── Known keyword substitutions for deduplication ─────────────────────── */
// Each key maps to its canonical equivalents; applied at full-phrase level so
// only entries whose entire normalised title overlaps after substitution merge.
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
  'non':                [],  // 'non' alone has no useful substitution; listing it
                             // explicitly prevents accidental partial matches in the
                             // KEYWORD_SUBS loop (e.g. from 'nonfungible' tokenisation)
  'dao':                ['decentralized autonomous organization'],
  'blockchain':         ['chain'],
  'crypto':             ['cryptocurrency', 'cryptocurrencies'],
  'cryptocurrency':     ['crypto'],
  'cryptocurrencies':   ['crypto'],
};

/* ── Normalize a title for duplicate detection ──────────────────────────── */
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/['''"""]/g, '')       // remove quotes/apostrophes
    .replace(/[^a-z0-9]+/g, ' ')   // collapse non-alphanumeric runs to spaces
    .trim();
}

/* ── Generate all alias variations for one entry ───────────────────────── */
// Returns a Set<string> of normalised phrase-level identifiers that represent
// the same entity.  Overlap between two entries' alias sets → they are dupes.
function generateAutoAliases(entry) {
  const variations = new Set();

  // 1. Normalised title (primary key)
  const norm = normalizeTitle(entry.title);
  if (norm) variations.add(norm);

  // 2. Title without filler/stopwords (only when meaningfully different)
  const noFiller = norm.split(' ').filter(w => !FILLER_WORDS.has(w)).join(' ').trim();
  if (noFiller && noFiller !== norm) variations.add(noFiller);

  // 3. Slug-based alias derived from the URL path
  const slug = (entry.url || '')
    .replace(/^\/wiki\//, '')
    .replace(/\.html$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const normSlug = normalizeTitle(slug);
  if (normSlug && normSlug !== norm) variations.add(normSlug);

  // 4. Keyword substitutions applied to the FULL normalised title phrase.
  //    Substituting individual words keeps phrase structure intact and avoids
  //    false-positive merges (e.g. "Bitcoin Cash" ≠ "Bitcoin").
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

/* ── Detect & merge duplicate entries (union-find over alias overlap) ───── */
// Two entries are duplicates when their generateAutoAliases() sets share any
// common element — i.e. they describe the same entity under different names.
//
// Returns { canonicalEntries, aliasUrls }
// - canonicalEntries: deduplicated array of index entries (each may have .aliases)
// - aliasUrls: Set of URL strings that are alias pages (excluded from the index)
function deduplicateIndex(entries) {
  // ── Step 1: generate alias sets for every entry ────────────────────────
  const aliasSets = entries.map(e => generateAutoAliases(e));

  // ── Step 2: build inverted index: alias string → [entry indices] ────────
  const aliasToIndices = new Map();
  aliasSets.forEach((aliasSet, idx) => {
    aliasSet.forEach(alias => {
      if (!aliasToIndices.has(alias)) aliasToIndices.set(alias, []);
      aliasToIndices.get(alias).push(idx);
    });
  });

  // ── Step 3: union-find to compute connected components ──────────────────
  const parent = entries.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path-halving compression
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

  // ── Step 4: group entries by their union-find root ───────────────────────
  const groups = new Map();
  entries.forEach((entry, idx) => {
    const root = find(idx);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(entry);
  });

  // ── Step 5: for each group pick canonical and assign aliases ─────────────
  const canonicalEntries = [];
  const aliasUrls = new Set();

  for (const [, group] of groups) {
    // Select canonical: longest title (most descriptive) first; prefer entries
    // that already carry curated aliases; tiebreak by shortest URL for stability.
    const canonical = group.slice().sort((a, b) => {
      const aHasAliases = (a.aliases && a.aliases.length > 0) ? 1 : 0;
      const bHasAliases = (b.aliases && b.aliases.length > 0) ? 1 : 0;
      if (bHasAliases !== aHasAliases) return bHasAliases - aHasAliases;
      if (b.title.length !== a.title.length) return b.title.length - a.title.length;
      return a.url.length - b.url.length;
    })[0];

    // Register explicit aliases already present on any entry in the group
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

/* ── Write a minimal HTML redirect stub ─────────────────────────────────── */
// Writes only if the file is already a redirect stub, missing, or small
// (< 2 KB on disk, roughly equivalent to < 500 chars of visible text).
// Returns true if written.
function generateRedirectFile(aliasFilePath, canonicalUrl) {
  // Validate canonical URL: must be a safe internal wiki path to prevent injection.
  // Allows lowercase letters, digits, hyphens, and underscores in the filename.
  if (!/^\/wiki\/[a-z0-9][a-z0-9_-]*\.html$/.test(canonicalUrl)) {
    console.warn(`  ! invalid canonical URL format, skipping redirect: ${canonicalUrl}`);
    return false;
  }

  if (fs.existsSync(aliasFilePath)) {
    const existing = fs.readFileSync(aliasFilePath, 'utf8');
    // Detect existing redirect: look for both http-equiv and refresh in any meta tag.
    const isStub = /http-equiv/i.test(existing) && /\brefresh\b/i.test(existing);
    if (!isStub) {
      // Use raw file size as a fast, injection-safe proxy for content length.
      // Real wiki articles are many kilobytes; stubs are under ~500 bytes.
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
<title>Redirecting\u2026</title>
</head>
<body>
<p>Redirecting to <a href="${canonicalUrl}">canonical page</a>\u2026</p>
</body>
</html>
`;
  fs.writeFileSync(aliasFilePath, redirectHtml, 'utf8');
  console.log(`  → wrote redirect: ${path.basename(aliasFilePath)} → ${canonicalUrl}`);
  return true;
}

/* ── HTML metadata extractors ───────────────────────────────────────────── */
function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return null;
  return decodeHtmlEntities(m[1]
    .replace(/\s*[—–-]+\s*Crypto Moonboys Wiki\s*$/i, '')
    .trim());
}

function extractDesc(html) {
  // Prefer the og:description (usually the cleanest single sentence)
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

/* ── Main ───────────────────────────────────────────────────────────────── */
const existingLookup = loadExistingIndex();
console.log(`Loaded ${Object.keys(existingLookup).length} existing entries from js/wiki.js`);

// Build set of alias URLs from existing canonical entries so those files are
// not added as standalone entries in the scan below.
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
  // Skip files that are already declared as aliases by a canonical entry.
  if (knownAliasUrls.has(fileUrl)) continue;

  const html     = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
  const existing = existingLookup[file];

  if (existing) {
    // Preserve all curated metadata; normalise URL to root-absolute.
    const entry = {
      title:    existing.title,
      url:      fileUrl,
      desc:     existing.desc,
      category: existing.category,
      emoji:    existing.emoji,
      tags:     existing.tags,
    };
    if (Array.isArray(existing.aliases)) entry.aliases = existing.aliases;
    rawIndex.push(entry);
    fromExisting++;
  } else {
    // Extract what we can from the HTML file.
    const rawTitle = extractTitle(html);
    const title    = cleanDisplayTitle(rawTitle || slugToTitle(file));
    const desc     = extractDesc(html)     || '';
    const category = extractCategory(html) || 'Lore';
    const emoji    = CATEGORY_EMOJI[category] || '📄';
    const tags     = generateTags(title);

    rawIndex.push({ title, url: fileUrl, desc, category, emoji, tags });
    fromHtml++;
    console.log(`  + extracted from HTML: ${file} (category: ${category})`);
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────
const { canonicalEntries, aliasUrls } = deduplicateIndex(rawIndex);
let redirectsWritten = 0;
let redirectsSkipped = 0;

for (const aliasUrl of aliasUrls) {
  const file = aliasUrl.replace(/^\/wiki\//, '');
  const filePath = path.join(WIKI_DIR, file);
  if (!fs.existsSync(filePath)) continue;

  // Find the canonical URL for this alias
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

// Remove undefined aliases fields (keeps JSON clean when no aliases exist)
const wikiIndex = canonicalEntries.map(entry => {
  const out = {
    title:    entry.title,
    url:      entry.url,
    desc:     entry.desc,
    category: entry.category,
    emoji:    entry.emoji,
    tags:     entry.tags,
  };
  if (Array.isArray(entry.aliases) && entry.aliases.length > 0) {
    out.aliases = entry.aliases;
  }
  return out;
});

fs.writeFileSync(OUTPUT, JSON.stringify(wikiIndex, null, 2) + '\n');
console.log(`\nGenerated js/wiki-index.json with ${wikiIndex.length} canonical entries`);
console.log(`  ${fromExisting} from existing index (js/wiki-index.json or js/wiki.js WIKI_INDEX)`);
console.log(`  ${fromHtml} extracted from HTML (new pages)`);
if (aliasUrls.size > 0) {
  console.log(`  ${aliasUrls.size} alias URL(s) deduplicated (${redirectsWritten} redirect(s) written, ${redirectsSkipped} skipped — substantial content)`);
}

/* ── Integrity check: no canonical title may contain underscores ─────────── */
const badTitles = wikiIndex.filter(e => e.title.includes('_'));
if (badTitles.length > 0) {
  console.error(`\nERROR: ${badTitles.length} canonical title(s) still contain underscores:`);
  badTitles.forEach(e => console.error(`  ${e.url} → "${e.title}"`));
  process.exit(1);
}
console.log('  ✓ All canonical titles are clean (no underscores)');

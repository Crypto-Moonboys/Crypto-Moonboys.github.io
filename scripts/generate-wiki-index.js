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
 *   - Pages with identical normalised titles are treated as duplicates.
 *   - Duplicates are merged: one entry becomes canonical, the rest become
 *     aliases stored in the canonical entry's `aliases` array.
 *   - Alias pages that contain no substantial body content (< 500 chars
 *     of visible text) are replaced with a minimal HTML redirect stub.
 *   - Only canonical entries appear in the final index.
 *   - Alias entries can also be declared explicitly via the `aliases` field
 *     in wiki-index.json (the alias URL files are then treated the same way).
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
          title:    decodeHtmlEntities(item.title    || ''),
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

/* ── Normalize a title for duplicate detection ──────────────────────────── */
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/['''"""]/g, '')       // remove quotes/apostrophes
    .replace(/[^a-z0-9]+/g, ' ')   // collapse non-alphanumeric runs to spaces
    .trim();
}

/* ── Detect & merge duplicate entries ───────────────────────────────────── */
// Returns { canonicalEntries, aliasUrls }
// - canonicalEntries: deduplicated array of index entries (each may have .aliases)
// - aliasUrls: Set of URL strings that are alias pages (excluded from the index)
function deduplicateIndex(entries) {
  // Group entries by normalised title
  const byNorm = new Map();
  for (const entry of entries) {
    const norm = normalizeTitle(entry.title);
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(entry);
  }

  const canonicalEntries = [];
  const aliasUrls = new Set();

  for (const [, group] of byNorm) {
    if (group.length === 1) {
      // No title-based duplicate; still honour explicit aliases already on entry.
      if (group[0].aliases) {
        group[0].aliases.forEach(a => aliasUrls.add(a.url));
      }
      canonicalEntries.push(group[0]);
      continue;
    }

    // Multiple entries share the same normalised title — pick canonical.
    // Sort by URL length first for a stable, deterministic result, then prefer
    // an entry that already carries aliases (preserves curated metadata).
    const sorted = group.slice().sort((a, b) => a.url.length - b.url.length);
    const canonical = sorted.find(e => e.aliases && e.aliases.length > 0) || sorted[0];

    const mergedAliases = Array.isArray(canonical.aliases) ? [...canonical.aliases] : [];

    for (const dupe of group) {
      if (dupe === canonical) continue;
      aliasUrls.add(dupe.url);
      // Add to aliases list if not already present
      if (!mergedAliases.some(a => a.url === dupe.url)) {
        mergedAliases.push({ title: dupe.title, url: dupe.url });
      }
      console.log(`  ~ duplicate merged: "${dupe.title}" (${dupe.url}) → canonical "${canonical.title}" (${canonical.url})`);
    }

    canonical.aliases = mergedAliases.length > 0 ? mergedAliases : undefined;
    // Register any pre-existing alias URLs
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
  // Validate canonical URL: must be a simple internal wiki path to prevent injection.
  if (!/^\/wiki\/[a-z0-9][a-z0-9-]*\.html$/.test(canonicalUrl)) {
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
      if (byteSize >= 2000) {
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
    const title    = rawTitle || slugToTitle(file);
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

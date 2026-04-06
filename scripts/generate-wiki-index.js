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

/* ── Parse the existing WIKI_INDEX from wiki.js ─────────────────────────── */
function loadExistingIndex() {
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

    const titleM = block.match(/title:\s*"([^"]+)"/);
    const descM  = block.match(/desc:\s*"([^"]+)"/);
    const catM   = block.match(/category:\s*"([^"]+)"/);
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

/* ── HTML metadata extractors ───────────────────────────────────────────── */
function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return null;
  return m[1]
    .replace(/\s*[—–-]+\s*Crypto Moonboys Wiki\s*$/i, '')
    .trim();
}

function extractDesc(html) {
  // Prefer the og:description (usually the cleanest single sentence)
  const ogM = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (ogM) return ogM[1].trim();
  const m = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  return m ? m[1].trim() : '';
}

function extractCategory(html) {
  const divM = html.match(/<div class="category-tags"[^>]*>([\s\S]*?)<\/div>/i);
  if (!divM) return null;
  const links = [...divM[1].matchAll(/href="[^"]*categories\/[^"]*"[^>]*>([^<]+)<\/a>/gi)];
  return links.length ? links[0][1].trim() : null;
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

const htmlFiles = fs.readdirSync(WIKI_DIR)
  .filter(f => f.endsWith('.html') && f !== 'index.html')
  .sort();

const wikiIndex = [];
let fromExisting = 0;
let fromHtml     = 0;

for (const file of htmlFiles) {
  const html     = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
  const existing = existingLookup[file];

  if (existing) {
    // Preserve all curated metadata; normalise URL to root-absolute.
    wikiIndex.push({
      title:    existing.title,
      url:      `/wiki/${file}`,
      desc:     existing.desc,
      category: existing.category,
      emoji:    existing.emoji,
      tags:     existing.tags,
    });
    fromExisting++;
  } else {
    // Extract what we can from the HTML file.
    const title    = extractTitle(html)    || file.replace('.html', '');
    const desc     = extractDesc(html)     || '';
    const category = extractCategory(html) || 'Lore';
    const emoji    = CATEGORY_EMOJI[category] || '📄';
    const tags     = generateTags(title);

    wikiIndex.push({ title, url: `/wiki/${file}`, desc, category, emoji, tags });
    fromHtml++;
    console.log(`  + extracted from HTML: ${file} (category: ${category})`);
  }
}

fs.writeFileSync(OUTPUT, JSON.stringify(wikiIndex, null, 2) + '\n');
console.log(`\nGenerated js/wiki-index.json with ${wikiIndex.length} entries`);
console.log(`  ${fromExisting} from existing WIKI_INDEX`);
console.log(`  ${fromHtml} extracted from HTML (new pages)`);

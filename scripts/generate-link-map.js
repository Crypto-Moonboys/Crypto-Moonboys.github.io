#!/usr/bin/env node
/**
 * scripts/generate-link-map.js
 *
 * Phase 1 link-map generator.
 *
 * For every wiki/*.html page, detects which other wiki pages are NOT yet
 * linked and could be linked based on:
 *   1. Title match  — the target's core name appears as text in the page
 *   2. Keyword match — any of the target's search_index.tokens appear in
 *                      the page's own keyword_bag (intersection ≥ 1 meaningful token)
 *
 * Output: js/link-map.json
 *   {
 *     "<source-url>": ["<target-url>", ...],   // sorted, deduped
 *     ...
 *   }
 *
 * Rules:
 *   - No HTML files are modified
 *   - Self-links excluded
 *   - Already-present links excluded
 *   - Duplicates excluded
 *   - Output is deterministically sorted (keys and values)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const WIKI_DIR        = path.join(ROOT, 'wiki');
const WIKI_INDEX_PATH = path.join(ROOT, 'js', 'wiki-index.json');
const OUTPUT_PATH     = path.join(ROOT, 'js', 'link-map.json');

// Tokens that are too generic to use as a basis for a keyword match
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'is', 'it', 'to', 'for',
  'on', 'at', 'as', 'by', 'be', 'this', 'that', 'with', 'from', 'are',
  'was', 'were', 'has', 'have', 'had', 'not', 'but', 'his', 'her', 'its',
  'we', 'you', 'he', 'she', 'they', 'i',
  // domain-generic words that appear in every title
  'crypto', 'moonboys', 'wiki', 'page', 'article',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the entity "core name" from a full wiki title. */
function coreTitle(fullTitle) {
  return (fullTitle.split(' — ')[0] || fullTitle)
    .trim()
    .replace(/_/g, ' ')
    .toLowerCase();
}

/** Extract href="/wiki/…" URLs from raw HTML text. */
function extractWikiLinks(html) {
  const links = new Set();
  const re = /href="(\/wiki\/[^"#?]+\.html)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.add(m[1]);
  }
  return links;
}

/** Normalise a URL (ensure leading slash, lower-case). */
function normalizeUrl(url) {
  return String(url || '').trim().toLowerCase().replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // 1. Load wiki index
  const index = JSON.parse(fs.readFileSync(WIKI_INDEX_PATH, 'utf8'));

  // Build lookup: url → entry
  const byUrl = new Map();
  for (const entry of index) {
    const url = normalizeUrl(entry.url);
    if (url.startsWith('/wiki/') && url.endsWith('.html')) {
      byUrl.set(url, entry);
    }
  }

  // 2. Scan all wiki HTML files
  const htmlFiles = fs.readdirSync(WIKI_DIR)
    .filter(f => f.endsWith('.html') && f !== 'sam.html')
    .sort();

  // Pre-compute per-target data we'll reuse inside the loop
  // targetData: [ { url, coreNorm, tokens } ]
  const targetData = [];
  for (const [url, entry] of byUrl) {
    const core   = coreTitle(entry.title);
    const tokens = (entry.search_index && entry.search_index.tokens)
      ? entry.search_index.tokens.map(t => t.toLowerCase()).filter(t => !STOP_WORDS.has(t))
      : [];
    targetData.push({ url, core, tokens });
  }

  const linkMap = {};

  for (const file of htmlFiles) {
    const sourceUrl = `/wiki/${file}`;
    const html      = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const htmlLower = html.toLowerCase();

    // Existing links in this page
    const existingLinks = extractWikiLinks(html);

    // keyword_bag of this source page (for keyword-match detection)
    const sourceEntry  = byUrl.get(normalizeUrl(sourceUrl));
    const sourceKwBag  = sourceEntry && sourceEntry.search_index && sourceEntry.search_index.keyword_bag
      ? new Set(sourceEntry.search_index.keyword_bag.map(k => k.toLowerCase()).filter(k => !STOP_WORDS.has(k)))
      : new Set();

    const suggested = new Set();

    for (const { url, core, tokens } of targetData) {
      // Skip self-link
      if (normalizeUrl(sourceUrl) === url) continue;

      // Skip already-present links
      if (existingLinks.has(url)) continue;

      // --- Title match ---
      if (core.length >= 3 && htmlLower.includes(core)) {
        suggested.add(url);
        continue;
      }

      // --- Keyword match ---
      // At least one meaningful token from the target appears in the source's keyword_bag
      if (tokens.length > 0 && sourceKwBag.size > 0) {
        const hit = tokens.some(t => t.length >= 4 && sourceKwBag.has(t));
        if (hit) {
          suggested.add(url);
        }
      }
    }

    if (suggested.size > 0) {
      linkMap[sourceUrl] = Array.from(suggested).sort();
    }
  }

  // 3. Sort keys for deterministic output
  const sorted = {};
  for (const key of Object.keys(linkMap).sort()) {
    sorted[key] = linkMap[key];
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

  const totalSuggestions = Object.values(sorted).reduce((s, v) => s + v.length, 0);
  console.log(`✅  link-map written: ${Object.keys(sorted).length} source pages, ${totalSuggestions} suggestions → ${OUTPUT_PATH}`);
}

main();

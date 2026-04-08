#!/usr/bin/env node
/**
 * generate-injection-plan.js
 *
 * Reads js/link-map.json to get suggested_links for each wiki page,
 * scans paragraph content of each wiki/*.html page,
 * finds candidate anchor text matches (derived from URL slugs),
 * and outputs js/injection-plan.json with up to 3 planned link insertions per page.
 *
 * Rules:
 * - NO HTML modification — script only reads HTML, never writes it.
 * - Scans paragraph/body content only (p, li, .lore-paragraph, .lead-paragraph, etc.)
 * - Skips text in: headings, nav, toc, script, style, existing <a> links
 * - Max 3 planned insertions per page
 * - No duplicate target_url per page
 * - Uses only Node.js built-ins (no npm install required)
 * - Output is deterministic (sorted alphabetically by page key, then by target_url)
 *
 * Usage: node scripts/generate-injection-plan.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const LINK_MAP_PATH = path.join(ROOT, 'js', 'link-map.json');
const OUTPUT_PATH   = path.join(ROOT, 'js', 'injection-plan.json');
const WIKI_DIR      = path.join(ROOT, 'wiki');

const MAX_PER_PAGE    = 3;
const SNIPPET_RADIUS  = 60; // chars before/after match

const MIN_PARAGRAPH_CHARS = 40; // eligible paragraph must be >= 40 chars
const MIN_ANCHOR_CHARS    = 6;  // anchor phrase must be >= 6 chars

// Anchors that must not be used as link text
const ANCHOR_BLOCKLIST = new Set([
  'nfts', 'token', 'tokens', 'crypto', 'blockchain', 'defi', 'wiki', 'punk',
]);

// ---------------------------------------------------------------------------
// Minimal HTML parser using pure regex (no external deps)
// ---------------------------------------------------------------------------

/**
 * Extract the main article content block from a wiki page HTML.
 * Looks for <article class="wiki-content"> or <main id="content"> blocks.
 * Falls back to the full HTML if neither is found.
 */
function extractArticleBlock(html) {
  // Try <article class="wiki-content">
  const articleMatch = html.match(/<article[^>]*class="[^"]*wiki-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) return articleMatch[1];

  // Try <main id="content">
  const mainMatch = html.match(/<main[^>]*id="content"[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1];

  // Fallback: strip header/footer/nav blocks and use rest
  return html
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ');
}

/**
 * Remove content from block-level tags that should be skipped entirely.
 * Returns the HTML with those blocks replaced by empty string.
 */
function removeSkippedBlocks(html) {
  // Remove: script, style, headings, nav, existing <a> links
  // Also remove TOC elements and <aside> blocks (infoboxes)
  const blockPatterns = [
    /<script[\s\S]*?<\/script\s*>/gi,
    /<style[\s\S]*?<\/style\s*>/gi,
    /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]\s*>/gi,
    /<nav[^>]*>[\s\S]*?<\/nav\s*>/gi,
    /<aside[^>]*>[\s\S]*?<\/aside\s*>/gi,
    // TOC by id/class/aria-label
    /<[^>]+(?:id\s*=\s*["']toc["']|class\s*=\s*["'][^"']*\btoc\b[^"']*["']|aria-label\s*=\s*["'][^"']*contents[^"']*["'])[^>]*>[\s\S]*?<\/[a-z]+\s*>/gi,
    // Existing links (strip text so matches don't collide with current anchor text)
    /<a(?:\s[^>]*)?>[\s\S]*?<\/a\s*>/gi,
  ];
  let result = html;
  for (const pat of blockPatterns) {
    result = result.replace(pat, ' ');
  }
  return result;
}

/**
 * Extract plain text from eligible paragraph-like content only.
 * Returns a flat string of the combined eligible text content.
 */
function extractEligibleText(html) {
  // First, isolate the article content block (avoids header/footer/nav pollution)
  const articleBlock = extractArticleBlock(html);

  // Then strip skipped inner blocks (headings, nav, aside, existing links, etc.)
  const stripped = removeSkippedBlocks(articleBlock);

  // Collect text from eligible elements:
  // <p>, <li> elements (both capture groups in the alternation)
  const eligiblePattern = /<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/gi;

  const textParts = [];
  let match;
  while ((match = eligiblePattern.exec(stripped)) !== null) {
    const inner = match[1] || '';
    // Strip remaining HTML tags from inner content
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length >= MIN_PARAGRAPH_CHARS) { // skip paragraphs shorter than minimum
      textParts.push(text);
    }
  }

  return textParts.join(' ');
}

/**
 * Derive anchor text candidates from a wiki URL.
 * /wiki/blockchain-technology.html → "blockchain technology"
 * Returns an array of candidate phrases to try.
 */
function deriveAnchorCandidates(targetUrl) {
  // Strip /wiki/ prefix and .html suffix
  const slug = targetUrl.replace(/^\/wiki\//, '').replace(/\.html$/, '');
  // Replace hyphens with spaces
  const phrase = slug.replace(/-/g, ' ');
  return [phrase]; // only one canonical form; matching is case-insensitive
}

/**
 * Find the first occurrence of phrase (case-insensitive, word-boundary safe) in text.
 * Returns the matched text and its index, or null.
 */
function findFirstOccurrence(text, phrase) {
  // Escape regex special chars in the phrase
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Use word boundaries to avoid mid-word matches
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  const match = regex.exec(text);
  if (!match) return null;
  return { index: match.index, matched: match[0] };
}

/**
 * Build a context snippet around a match position in text.
 */
function buildSnippet(text, index, matchLength) {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end   = Math.min(text.length, index + matchLength + SNIPPET_RADIUS);
  let snippet = text.slice(start, end).trim();
  if (start > 0)         snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  return snippet;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // Load link-map
  const linkMap = JSON.parse(fs.readFileSync(LINK_MAP_PATH, 'utf8'));

  const plan = {};

  // Sort pages alphabetically for determinism
  const pages = Object.keys(linkMap).sort();

  for (const pageKey of pages) {
    const { suggested_links: suggestedLinks } = linkMap[pageKey];

    if (!suggestedLinks || suggestedLinks.length === 0) continue;

    // Derive the file path from the page key
    // pageKey is like /wiki/bitcoin.html
    const relPath = pageKey.replace(/^\//, ''); // strip leading /
    const filePath = path.join(ROOT, relPath);

    if (!fs.existsSync(filePath)) continue;

    const html = fs.readFileSync(filePath, 'utf8');
    const eligibleText = extractEligibleText(html);

    if (!eligibleText) continue;

    const matches = [];
    const usedTargets = new Set();

    // Sort suggested links alphabetically for determinism
    const sortedLinks = [...suggestedLinks].sort();

    for (const targetUrl of sortedLinks) {
      if (matches.length >= MAX_PER_PAGE) break;
      if (usedTargets.has(targetUrl)) continue;

      // Don't link to self
      if (targetUrl === pageKey) continue;

      const candidates = deriveAnchorCandidates(targetUrl);

      for (const phrase of candidates) {
        if (phrase.length < MIN_ANCHOR_CHARS) continue; // skip short anchor phrases

        // Skip blocklisted anchor terms
        if (ANCHOR_BLOCKLIST.has(phrase.toLowerCase())) continue;

        const found = findFirstOccurrence(eligibleText, phrase);
        if (!found) continue;

        const snippet = buildSnippet(eligibleText, found.index, found.matched.length);

        matches.push({
          target_url:      targetUrl,
          anchor_text:     found.matched,
          match_type:      'title',
          context_snippet: snippet,
        });

        usedTargets.add(targetUrl);
        break; // only use first candidate phrase that matches
      }
    }

    if (matches.length > 0) {
      // Sort matches by target_url for determinism
      matches.sort((a, b) => a.target_url.localeCompare(b.target_url));
      plan[pageKey] = matches;
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(plan, null, 2) + '\n', 'utf8');

  const totalPages   = Object.keys(plan).length;
  const totalMatches = Object.values(plan).reduce((s, arr) => s + arr.length, 0);
  console.log(`Injection plan written to js/injection-plan.json`);
  console.log(`Pages with matches: ${totalPages} / ${pages.length}`);
  console.log(`Total planned insertions: ${totalMatches}`);
}

main();

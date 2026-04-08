#!/usr/bin/env node
/**
 * scripts/generate-injection-plan.js
 *
 * Builds js/injection-plan.json — a data-layer-only auto-link injection plan.
 *
 * For every wiki/*.html page listed in js/link-map.json, the script:
 *   1. Reads the page's HTML
 *   2. Strips excluded zones (nav, footer, script, style, h1–h6)
 *   3. Scans remaining <p> text for the title phrase of each suggested_link candidate
 *   4. Records up to 3 planned insertions per page (first match per candidate, sorted
 *      candidates alphabetically, paragraphs in document order)
 *
 * Output: js/injection-plan.json
 *   {
 *     "/wiki/page.html": [
 *       {
 *         "target_url": "/wiki/other-page.html",
 *         "anchor_text": "matched phrase",
 *         "match_type": "title|keyword",
 *         "context_snippet": "short surrounding text"
 *       }
 *     ]
 *   }
 *
 * Rules:
 *   - No HTML files are read-written or modified
 *   - Candidates drawn only from suggested_links (existing_links excluded)
 *   - Max 3 insertions per page; no duplicate target_url per page
 *   - Output keys and entry arrays sorted deterministically
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT           = path.resolve(__dirname, '..');
const LINK_MAP_PATH  = path.join(ROOT, 'js', 'link-map.json');
const WIKI_DIR       = path.join(ROOT, 'wiki');
const OUTPUT_PATH    = path.join(ROOT, 'js', 'injection-plan.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a slug like "bitcoin-kids" to a title phrase "Bitcoin Kids". */
function slugToTitle(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Extract the slug from a wiki URL like /wiki/bitcoin-kids.html → bitcoin-kids. */
function urlToSlug(url) {
  return path.basename(url, '.html');
}

/** Strip all HTML tags from a string (leaves inner text). */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

/**
 * Strip a named block element and all its content from HTML.
 * Runs multiple passes to handle (shallowly) nested same-name tags.
 */
function stripBlockTag(html, tagName) {
  const re = new RegExp(`<${tagName}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let prev;
  do {
    prev = html;
    html = html.replace(re, ' ');
  } while (html !== prev);
  return html;
}

/**
 * Extract a context snippet of up to 120 chars centred on the match,
 * trimmed to word boundaries.
 */
function getContextSnippet(text, matchStart, matchEnd) {
  const halfLen = 60;
  let start = Math.max(0, matchStart - halfLen);
  let end   = Math.min(text.length, matchEnd + halfLen);

  // Move start forward to the next word boundary
  if (start > 0) {
    const spaceIdx = text.indexOf(' ', start);
    if (spaceIdx !== -1 && spaceIdx < matchStart) {
      start = spaceIdx + 1;
    }
  }

  // Move end backward to the previous word boundary
  if (end < text.length) {
    const spaceIdx = text.lastIndexOf(' ', end);
    if (spaceIdx !== -1 && spaceIdx > matchEnd) {
      end = spaceIdx;
    }
  }

  return text.slice(start, end).trim();
}

/**
 * Load an HTML file and return an array of paragraph text strings, with:
 *   - nav, footer, script, style, h1–h6 zones removed
 *   - existing <a> elements removed (text inside them is discarded so we
 *     do not re-link already-linked phrases)
 */
function extractParagraphs(html) {
  // Strip excluded block zones
  for (const tag of ['nav', 'footer', 'script', 'style', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    html = stripBlockTag(html, tag);
  }

  const paragraphs = [];
  const pTagRe = /<p(?:\s[^>]*)?>([^]*?)<\/p>/gi;
  let m;
  while ((m = pTagRe.exec(html)) !== null) {
    let content = m[1];
    // Remove entire <a>…</a> elements so already-linked text is not a match target
    content = content.replace(/<a(?:\s[^>]*)?>[\s\S]*?<\/a>/gi, '');
    // Strip any remaining inline tags
    const text = stripTags(content).replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const linkMap  = JSON.parse(fs.readFileSync(LINK_MAP_PATH, 'utf8'));
  const pageKeys = Object.keys(linkMap).sort();

  const result = {};

  for (const pageKey of pageKeys) {
    const { suggested_links } = linkMap[pageKey];
    if (!suggested_links || suggested_links.length === 0) continue;

    // Resolve the corresponding HTML file
    const slug     = urlToSlug(pageKey);
    const htmlPath = path.join(WIKI_DIR, `${slug}.html`);
    if (!fs.existsSync(htmlPath)) continue;

    const html       = fs.readFileSync(htmlPath, 'utf8');
    const paragraphs = extractParagraphs(html);
    if (paragraphs.length === 0) continue;

    // Iterate candidates in sorted (alphabetical) order
    const candidates   = [...suggested_links].sort();
    const matches      = [];
    const usedTargets  = new Set();

    for (const targetUrl of candidates) {
      if (matches.length >= 3) break;
      if (usedTargets.has(targetUrl)) continue;

      const targetSlug  = urlToSlug(targetUrl);
      const titlePhrase = slugToTitle(targetSlug);

      // Case-insensitive, whole-word regex for the title phrase
      const escaped  = titlePhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const phraseRe = new RegExp(`\\b${escaped}\\b`, 'i');

      // Search paragraphs in document order; use the first match found
      for (const paraText of paragraphs) {
        const match = phraseRe.exec(paraText);
        if (match) {
          const anchorText   = match[0];
          const matchStart   = match.index;
          const matchEnd     = matchStart + anchorText.length;
          // "title" if the matched text is exactly the title-cased form; "keyword" otherwise
          const matchType    = anchorText === titlePhrase ? 'title' : 'keyword';
          const contextSnip  = getContextSnippet(paraText, matchStart, matchEnd);

          matches.push({
            target_url:       targetUrl,
            anchor_text:      anchorText,
            match_type:       matchType,
            context_snippet:  contextSnip,
          });

          usedTargets.add(targetUrl);
          break; // first match per candidate only
        }
      }
    }

    if (matches.length > 0) {
      // Sort entries by target_url for deterministic output
      matches.sort((a, b) => a.target_url.localeCompare(b.target_url));
      result[pageKey] = matches;
    }
  }

  // Sort output keys alphabetically
  const sorted = {};
  for (const key of Object.keys(result).sort()) {
    sorted[key] = result[key];
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

  const totalInsertions = Object.values(sorted).reduce((s, v) => s + v.length, 0);
  console.log(
    `✅  injection-plan written: ${Object.keys(sorted).length} pages, ` +
    `${totalInsertions} planned insertions → ${OUTPUT_PATH}`
  );
}

main();

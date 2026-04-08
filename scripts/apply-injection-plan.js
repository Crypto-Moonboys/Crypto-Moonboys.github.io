#!/usr/bin/env node
/**
 * apply-injection-plan.js
 *
 * Reads js/injection-plan.json and applies the planned link insertions into
 * the corresponding wiki/*.html files.
 *
 * Rules:
 * - Inject ONLY inside <p> text -- never inside headings (h1-h6), nav, toc,
 *   script, style, or existing <a> tags.
 * - Replace only the FIRST occurrence of anchor_text within eligible <p> content.
 * - Wrap exactly as: <a href="target_url">anchor_text</a>
 * - Matching is case-sensitive -- use the exact anchor_text from the plan.
 * - Max 3 insertions per page.
 * - No duplicate target_url per page.
 * - Preserve full page structure and formatting.
 * - Deterministic: processing order follows injection-plan array order per page.
 * - Skip silently if anchor_text not found in any <p>, already linked, or
 *   falls inside an excluded zone.
 * - Uses only Node.js built-ins (no npm install required).
 *
 * Usage:
 *   node scripts/apply-injection-plan.js
 *   node scripts/apply-injection-plan.js --dry-run
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const PLAN_PATH    = path.join(ROOT, 'js', 'injection-plan.json');
const MAX_PER_PAGE = 3;
const DRY_RUN      = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for use inside a RegExp literal.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Return true if target_url (or its bare filename) is already an href on the page.
 * Handles both root-relative (/wiki/foo.html) and bare (foo.html) hrefs.
 */
function isAlreadyLinked(html, targetUrl) {
  const bareFile = targetUrl.replace(/^\/wiki\//, '');
  const patterns = [
    new RegExp('href\\s*=\\s*["\']' + escapeRegex(targetUrl) + '["\']', 'i'),
    new RegExp('href\\s*=\\s*["\']' + escapeRegex(bareFile)  + '["\']', 'i'),
  ];
  return patterns.some(function (p) { return p.test(html); });
}

/**
 * Return true if the occurrence of anchorText at position idx in str is at a
 * word boundary on both sides.  Word characters are [A-Za-z0-9_$] — the '$'
 * is included to protect compound token names like $LFGK.
 */
function isAtWordBoundary(str, idx, len) {
  const WORD_CHAR = /[A-Za-z0-9_$]/;
  if (idx > 0 && WORD_CHAR.test(str[idx - 1])) return false;
  if (idx + len < str.length && WORD_CHAR.test(str[idx + len])) return false;
  return true;
}

/**
 * Find the first occurrence of anchorText in innerHtml that:
 *   1. Is at a word boundary on both sides.
 *   2. Is not already inside an <a> tag.
 * Returns the index of the match, or -1 if not found.
 */
function findEligibleIndex(innerHtml, anchorText) {
  let searchFrom = 0;
  while (searchFrom < innerHtml.length) {
    const idx = innerHtml.indexOf(anchorText, searchFrom);
    if (idx === -1) return -1;

    // Word-boundary check
    if (!isAtWordBoundary(innerHtml, idx, anchorText.length)) {
      searchFrom = idx + 1;
      continue;
    }

    // Check that this occurrence is not already inside an <a> tag
    let insideAnchor = false;
    const aPattern = /<a(?:\s[^>]*)?>([\s\S]*?)<\/a\s*>/gi;
    let am;
    while ((am = aPattern.exec(innerHtml)) !== null) {
      if (idx >= am.index && idx < am.index + am[0].length) {
        insideAnchor = true;
        break;
      }
    }
    if (insideAnchor) {
      searchFrom = idx + 1;
      continue;
    }

    return idx;
  }
  return -1;
}

/**
 * Apply one insertion to the HTML string.
 * Scans <p>...</p> blocks; within each, checks that anchor_text is not already
 * inside an <a> tag and is at a word boundary.  Replaces the first eligible
 * occurrence with a hyperlink.
 * Returns the modified HTML string, or null if no replacement was made.
 *
 * Guard rules applied inside this function:
 *   Rule A — Skip metadata paragraphs (containing "Category:", "Tags:", "Aliases:")
 *   Rule B — Skip short paragraphs (inner text < 40 characters)
 *   Rule C — Skip duplicate paragraphs (same innerHtml appears more than once)
 *   Rule D — Scope to <article class="wiki-content"> only
 */
function applyInsertion(html, targetUrl, anchorText) {
  // Rule D: Only inject inside <article class="wiki-content">.
  // If no such block exists on the page, skip entirely.
  const articleRe    = /<article[^>]*class="[^"]*wiki-content[^"]*"[^>]*>([\s\S]*?)<\/article\s*>/i;
  const articleMatch = articleRe.exec(html);
  if (!articleMatch) return null; // Rule D: no wiki-content article — skip page

  const articleStart = articleMatch.index;
  const articleEnd   = articleStart + articleMatch[0].length;
  const articleHtml  = articleMatch[1];

  // Rule C: Pre-compute how many times each innerHtml appears within the article.
  // Any paragraph whose exact innerHTML occurs more than once is a duplicate.
  const P_TAG_RE = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p\s*>/gi;
  const innerHtmlCounts = new Map();
  {
    let s;
    const scanRe = new RegExp(P_TAG_RE.source, 'gi');
    while ((s = scanRe.exec(articleHtml)) !== null) {
      const inner = s[1];
      innerHtmlCounts.set(inner, (innerHtmlCounts.get(inner) || 0) + 1);
    }
  }

  // Regex to find each <p>...</p> block in the full HTML (non-greedy, multi-line).
  const pPattern = new RegExp(P_TAG_RE.source, 'gi');

  let match;
  while ((match = pPattern.exec(html)) !== null) {
    const pStart    = match.index;
    const pFull     = match[0];
    const innerHtml = match[1];

    // Rule D: Skip <p> tags outside <article class="wiki-content">
    if (pStart < articleStart || pStart + pFull.length > articleEnd) continue;

    // Rule A: Skip metadata paragraphs (tag lists / category lines)
    const plainText = innerHtml.replace(/<[^>]+>/g, ' ');
    if (plainText.includes('Category:') ||
        plainText.includes('Tags:')     ||
        plainText.includes('Aliases:')) continue;

    // Rule B: Skip short paragraphs (fewer than 40 characters of visible text)
    const strippedText = plainText.replace(/\s+/g, ' ').trim();
    if (strippedText.length < 40) continue;

    // Rule C: Skip duplicate paragraphs (same innerHtml more than once on page)
    if ((innerHtmlCounts.get(innerHtml) || 0) > 1) continue;

    const anchorIdx = findEligibleIndex(innerHtml, anchorText);
    if (anchorIdx === -1) continue;

    // Find the opening tag end position within pFull
    const openTagEnd = pFull.indexOf('>') + 1;

    // Perform the replacement using string slicing (avoids $ back-reference issues).
    const replacement = '<a href="' + targetUrl + '">' + anchorText + '</a>';
    const newInner = innerHtml.slice(0, anchorIdx) + replacement +
                     innerHtml.slice(anchorIdx + anchorText.length);
    const newP = pFull.slice(0, openTagEnd) + newInner + '</p>';

    // Rebuild full HTML
    const newHtml = html.slice(0, pStart) + newP + html.slice(pStart + pFull.length);
    return newHtml;
  }

  return null; // no replacement made
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Rule E — Generic single-word anchor texts that must be rejected regardless
 * of context.  These are fully-lowercase and carry no meaningful link value.
 */
const GENERIC_ANCHOR_WORDS = new Set([
  'nfts', 'token', 'tokens', 'crypto', 'blockchain', 'defi', 'wiki', 'punk', 'grit',
]);

function main() {
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));

  let totalPagesModified  = 0;
  let totalInsertionsMade = 0;
  let totalSkipped        = 0;

  // Sort pages alphabetically for determinism
  const pageKeys = Object.keys(plan).sort();

  for (const pageKey of pageKeys) {
    const insertions = plan[pageKey];
    if (!insertions || insertions.length === 0) continue;

    // Derive the file path: /wiki/foo.html -> <ROOT>/wiki/foo.html
    const relPath  = pageKey.replace(/^\//, '');
    const filePath = path.join(ROOT, relPath);

    if (!fs.existsSync(filePath)) {
      totalSkipped += insertions.length;
      continue;
    }

    let html = fs.readFileSync(filePath, 'utf8');
    let insertionsMadeOnPage = 0;
    const usedTargets = new Set();

    // Process in plan order; enforce MAX_PER_PAGE cap
    for (const item of insertions) {
      if (insertionsMadeOnPage >= MAX_PER_PAGE) {
        totalSkipped++;
        continue;
      }

      const { target_url: targetUrl, anchor_text: anchorText } = item;

      // Skip duplicate target_url on this page
      if (usedTargets.has(targetUrl)) {
        totalSkipped++;
        continue;
      }

      // Skip if target_url is already linked anywhere on the page
      if (isAlreadyLinked(html, targetUrl)) {
        totalSkipped++;
        usedTargets.add(targetUrl);
        continue;
      }

      // Rule E: Minimum anchor text length and quality checks.
      // Reject anchor texts that are too short or are known generic single words.
      const trimmedAnchor = anchorText.trim();
      if (trimmedAnchor.length < 6) {
        totalSkipped++;
        continue;
      }
      const lowerAnchor = trimmedAnchor.toLowerCase();
      if (trimmedAnchor === lowerAnchor && GENERIC_ANCHOR_WORDS.has(lowerAnchor)) {
        totalSkipped++;
        continue;
      }

      // Attempt the injection
      const newHtml = applyInsertion(html, targetUrl, anchorText);

      if (newHtml === null) {
        // anchor_text not found in any eligible <p>
        totalSkipped++;
      } else {
        html = newHtml;
        insertionsMadeOnPage++;
        totalInsertionsMade++;
        usedTargets.add(targetUrl);
      }
    }

    if (insertionsMadeOnPage > 0) {
      totalPagesModified++;
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, html, 'utf8');
      } else {
        console.log('[dry-run] Would modify: ' + pageKey + ' (' + insertionsMadeOnPage + ' insertion(s))');
      }
    }
  }

  console.log('Applied injection plan.');
  console.log('Pages modified: ' + totalPagesModified);
  console.log('Insertions made: ' + totalInsertionsMade);
  console.log('Insertions skipped: ' + totalSkipped);
}

main();

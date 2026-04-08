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
 * Apply one insertion to the HTML string.
 * Scans <p>...</p> blocks; within each, checks that anchor_text is not already
 * inside an <a> tag.  Replaces the first bare occurrence with a hyperlink.
 * Returns the modified HTML string, or null if no replacement was made.
 */
function applyInsertion(html, targetUrl, anchorText) {
  // Regex to find each <p>...</p> block (non-greedy, multi-line).
  const pPattern = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p\s*>/gi;

  let match;
  while ((match = pPattern.exec(html)) !== null) {
    const pStart   = match.index;
    const pFull    = match[0];
    const innerHtml = match[1];

    // Check if anchor_text appears in the inner HTML at all
    const anchorIdx = innerHtml.indexOf(anchorText);
    if (anchorIdx === -1) continue;

    // Check that the occurrence is not already inside an <a> tag.
    let insideAnchor = false;
    const aPattern = /<a(?:\s[^>]*)?>([\s\S]*?)<\/a\s*>/gi;
    let am;
    while ((am = aPattern.exec(innerHtml)) !== null) {
      if (anchorIdx >= am.index && anchorIdx < am.index + am[0].length) {
        insideAnchor = true;
        break;
      }
    }
    if (insideAnchor) continue;

    // Find the opening tag end position within pFull to compute offset
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

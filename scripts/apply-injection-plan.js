#!/usr/bin/env node
/**
 * scripts/apply-injection-plan.js
 *
 * Reads js/injection-plan.json and applies the planned hyperlinks into
 * wiki/*.html files.
 *
 * Rules:
 * - ONLY injects inside <article class="wiki-content"> blocks
 * - Skips text inside: <a>, h1-h6, <script>, <style>, <nav>, <aside>
 * - Respects section_type from the injection plan: tries to inject in the
 *   planned section first; falls back to first valid occurrence if needed
 * - Injects ONLY the FIRST qualifying match per (page, target_url) pair
 * - Skips injection if target_url is already linked in the article block
 * - Idempotent: running twice does not add duplicate links
 * - Uses only Node.js built-ins (no npm install required)
 *
 * Usage: node scripts/apply-injection-plan.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const PLAN_PATH = path.join(ROOT, 'js', 'injection-plan.json');

// Tags whose content must not be treated as linkable text
const RESTRICTED_TAGS = new Set([
  'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'script', 'style', 'nav', 'aside',
]);

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/**
 * Locate the <article class="wiki-content"…>…</article> block in the full
 * page HTML.  Returns { before, content, after } or null when not found.
 *
 * `before`  — everything up to (and including) the opening tag
 * `content` — the inner HTML of the article element
 * `after`   — "</article>" and everything that follows
 */
function splitArticleBlock(html) {
  const startRe   = /<article[^>]*class="[^"]*wiki-content[^"]*"[^>]*>/i;
  const startMatch = startRe.exec(html);
  if (!startMatch) return null;

  const openEnd  = startMatch.index + startMatch[0].length;
  const closeIdx = html.indexOf('</article>', openEnd);
  if (closeIdx === -1) return null;

  return {
    before:  html.slice(0, openEnd),
    content: html.slice(openEnd, closeIdx),
    after:   html.slice(closeIdx),
  };
}

/**
 * Return true if targetUrl is already referenced by any href attribute
 * inside html.
 */
function alreadyLinked(html, targetUrl) {
  const escaped = targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`href\\s*=\\s*["']${escaped}["']`, 'i').test(html);
}

/**
 * Tokenise articleHtml into an array of { type: 'tag'|'text', value } items.
 */
function tokenise(html) {
  const TAG_RE = /(<[^>]+>)/g;
  const tokens = [];
  let lastIndex = 0;
  let m;

  while ((m = TAG_RE.exec(html)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: 'text', value: html.slice(lastIndex, m.index) });
    }
    tokens.push({ type: 'tag', value: m[0] });
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < html.length) {
    tokens.push({ type: 'text', value: html.slice(lastIndex) });
  }

  return tokens;
}

/**
 * Build a word-boundary-aware RegExp for anchorText.
 *
 * \b is only added at each end when the boundary character is a word char
 * (\w), so that phrases starting/ending with symbols (e.g. "$GK") still
 * match correctly while whole-word constraints are enforced where they apply.
 */
function buildAnchorRegex(anchorText) {
  const escaped = anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix  = /\w/.test(anchorText[0])                           ? '\\b' : '';
  const suffix  = /\w/.test(anchorText[anchorText.length - 1])       ? '\\b' : '';
  return new RegExp(prefix + escaped + suffix, 'i');
}

/**
 * Determine the section type of a <p> or <li> element from its opening tag.
 *
 * @param {string} tagName        - Lowercase tag name ('p' or 'li')
 * @param {string} classAttr      - Value of the class attribute (may be empty)
 * @param {boolean} isFirstParagraph - True if this is the first <p> seen outside restricted blocks
 * @returns {string} section_type key
 */
function detectSectionType(tagName, classAttr, isFirstParagraph) {
  const cls = (classAttr || '').toLowerCase();
  if (cls.includes('lead'))      return 'lead';
  if (cls.includes('lore'))      return 'lore';
  if (cls.includes('summary'))   return 'summary';
  if (cls.includes('explainer')) return 'explainer';
  if (tagName === 'li')          return 'list';
  if (tagName === 'p' && isFirstParagraph) return 'lead';
  return 'fallback';
}

/**
 * Core injection worker.
 *
 * Iterates tokens of articleHtml and injects one link at the first valid
 * text node that satisfies:
 *   1. Not inside a restricted element (RESTRICTED_TAGS)
 *   2. If requiredSectionType is non-null, the text node must be inside a
 *      <p> or <li> whose detected section type matches requiredSectionType.
 *
 * Returns { html: string, injected: boolean }.
 */
function injectLinkCore(articleHtml, anchorText, targetUrl, requiredSectionType) {
  const tokens   = tokenise(articleHtml);
  const anchorRe = buildAnchorRegex(anchorText);

  let restrictedDepth   = 0;
  let sectionElemDepth  = 0;
  let currentSectionType = null;
  let isFirstParagraph  = true;
  let injected = false;
  const parts  = [];

  for (const tok of tokens) {
    if (tok.type === 'tag') {
      const tagM = tok.value.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
      if (tagM) {
        const tagName     = tagM[1].toLowerCase();
        const isClose     = tok.value.startsWith('</');
        const isSelfClose = /\/>$/.test(tok.value);

        // --- Restricted-tag depth tracking ---
        if (RESTRICTED_TAGS.has(tagName)) {
          if (isClose) {
            restrictedDepth = Math.max(0, restrictedDepth - 1);
          } else if (!isSelfClose) {
            restrictedDepth += 1;
          }
        }

        // --- Section-element depth tracking (only outside restricted blocks) ---
        if (tagName === 'p' || tagName === 'li') {
          if (!isClose && !isSelfClose && restrictedDepth === 0) {
            if (sectionElemDepth === 0) {
              // Entering a new top-level section element – determine its type
              const classM = tok.value.match(/class\s*=\s*["']([^"']*)["']/i);
              const cls    = classM ? classM[1] : '';
              currentSectionType = detectSectionType(tagName, cls, isFirstParagraph);
              if (tagName === 'p') isFirstParagraph = false;
            }
            sectionElemDepth++;
          } else if (isClose && restrictedDepth === 0 && sectionElemDepth > 0) {
            sectionElemDepth--;
            if (sectionElemDepth === 0) currentSectionType = null;
          }
        }
      }
      parts.push(tok.value);
      continue;
    }

    // --- Text node ---
    if (!injected && restrictedDepth === 0) {
      const sectionOk = !requiredSectionType || currentSectionType === requiredSectionType;
      if (sectionOk) {
        const m = anchorRe.exec(tok.value);
        if (m) {
          const matched = m[0];
          const idx     = m.index;
          parts.push(
            tok.value.slice(0, idx) +
            `<a href="${targetUrl}">${matched}</a>` +
            tok.value.slice(idx + matched.length),
          );
          injected = true;
          continue;
        }
      }
    }

    parts.push(tok.value);
  }

  return { html: parts.join(''), injected };
}

/**
 * Inject one link into articleHtml, respecting the planned section type.
 *
 * Strategy:
 *   1. If plannedSectionType is a specific section (not 'fallback' / absent),
 *      first attempt injection only within elements of that section type.
 *   2. If that yields no injection (section not found or anchor absent there),
 *      fall back to the first valid occurrence anywhere in the article.
 *
 * Returns { html: string, injected: boolean }.
 */
function injectLink(articleHtml, anchorText, targetUrl, plannedSectionType) {
  const targetSection =
    plannedSectionType && plannedSectionType !== 'fallback'
      ? plannedSectionType
      : null;

  if (targetSection) {
    const result = injectLinkCore(articleHtml, anchorText, targetUrl, targetSection);
    if (result.injected) return result;
  }

  // Fallback: first valid occurrence regardless of section type
  return injectLinkCore(articleHtml, anchorText, targetUrl, null);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(PLAN_PATH)) {
    console.error(`ERROR: injection plan not found at ${PLAN_PATH}`);
    console.error('Run: node scripts/generate-injection-plan.js');
    process.exit(1);
  }

  const plan  = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const pages = Object.keys(plan).sort();

  let totalFiles    = 0;
  let totalInjected = 0;
  let totalSkipped  = 0;

  for (const pageKey of pages) {
    const injections = plan[pageKey];
    if (!injections || injections.length === 0) continue;

    // Resolve file path from the page key (e.g. /wiki/bitcoin.html)
    const filePath = path.join(ROOT, pageKey.replace(/^\//, ''));

    if (!fs.existsSync(filePath)) {
      console.warn(`SKIP (file not found): ${pageKey}`);
      continue;
    }

    const originalHtml = fs.readFileSync(filePath, 'utf8');
    const parts        = splitArticleBlock(originalHtml);

    if (!parts) {
      console.warn(`SKIP (no wiki-content article block): ${pageKey}`);
      continue;
    }

    let { before, content, after } = parts;
    let fileInjected = 0;

    for (const entry of injections) {
      const { target_url: targetUrl, anchor_text: anchorText } = entry;

      // Skip if this target is already linked anywhere inside the article
      if (alreadyLinked(content, targetUrl)) {
        totalSkipped++;
        continue;
      }

      const result = injectLink(content, anchorText, targetUrl, entry.section_type);
      if (result.injected) {
        content = result.html;
        fileInjected++;
        totalInjected++;
      } else {
        totalSkipped++;
      }
    }

    if (fileInjected > 0) {
      fs.writeFileSync(filePath, before + content + after, 'utf8');
      totalFiles++;
      console.log(`  [${fileInjected} link(s) added] ${pageKey}`);
    }
  }

  console.log(`\nDone.`);
  console.log(`Files modified:  ${totalFiles}`);
  console.log(`Links injected:  ${totalInjected}`);
  console.log(`Entries skipped: ${totalSkipped} (already linked or no match in article)`);
}

main();

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
 * Inject one link (<a href="targetUrl">anchorText</a>) into articleHtml.
 *
 * Replaces only the FIRST occurrence of anchorText (case-insensitive) that
 * sits in a plain text node outside any restricted element.
 *
 * Returns { html: string, injected: boolean }.
 */
function injectLink(articleHtml, anchorText, targetUrl) {
  const tokens = tokenise(articleHtml);
  const needle  = anchorText.toLowerCase();

  let restrictedDepth = 0;
  let injected = false;
  const parts  = [];

  for (const tok of tokens) {
    if (tok.type === 'tag') {
      const tagM = tok.value.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
      if (tagM) {
        const tagName     = tagM[1].toLowerCase();
        const isClose     = tok.value.startsWith('</');
        const isSelfClose = /\/>$/.test(tok.value);

        if (RESTRICTED_TAGS.has(tagName)) {
          if (isClose) {
            restrictedDepth = Math.max(0, restrictedDepth - 1);
          } else if (!isSelfClose) {
            restrictedDepth += 1;
          }
        }
      }
      parts.push(tok.value);
      continue;
    }

    // text node — only attempt replacement when outside restricted elements
    if (!injected && restrictedDepth === 0) {
      const idx = tok.value.toLowerCase().indexOf(needle);
      if (idx !== -1) {
        const matched = tok.value.slice(idx, idx + anchorText.length);
        parts.push(
          tok.value.slice(0, idx) +
          `<a href="${targetUrl}">${matched}</a>` +
          tok.value.slice(idx + anchorText.length),
        );
        injected = true;
        continue;
      }
    }

    parts.push(tok.value);
  }

  return { html: parts.join(''), injected };
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

      const result = injectLink(content, anchorText, targetUrl);
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

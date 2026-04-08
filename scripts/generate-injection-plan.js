#!/usr/bin/env node
/**
 * generate-injection-plan.js
 *
 * Reads js/link-map.json to get suggested_links for each wiki page,
 * scans paragraph content of each wiki/*.html page,
 * finds candidate anchor text matches (derived from URL slugs),
 * and outputs js/injection-plan.json with up to 3 planned link insertions per page.
 *
 * Candidate selection uses entity-graph scores (js/entity-graph.json) when
 * available; falls back to alphabetical order (original keyword/title match).
 * Entity-graph scores include authority-weighted boosts (rank_score_boost,
 * authority_score_boost, graph_centrality_boost) from Phase 10,
 * reinforcement boosts (reinforcement_boost, cluster_support_boost,
 * co_citation_boost) from Phase 11, and freshness/decay adjustments
 * (freshness_boost, decay_penalty, recency_balance) from Phase 12.
 * The final_score field from Phase 12 is used for candidate ranking so that
 * stale dominant targets lose priority and newly-relevant targets can rise.
 *
 * Section-aware placement:
 * - Each candidate match is scored by the section type of the paragraph it
 *   appears in: lead (4) > summary/explainer (3) > lore (2) > list (1) > fallback (0)
 * - For each target URL, the best-scoring paragraph is chosen; ties broken by
 *   entity-graph score then by document order (earlier first).
 * - section_type and placement_score are stored in each plan entry.
 *
 * Cluster-balance logic (Phase 11):
 * - Up to MAX_SCAN_LINKS candidates are evaluated per page (instead of stopping
 *   at the first 3 matches) so that candidates from different categories can be
 *   considered together.
 * - When selecting the final MAX_PER_PAGE insertions, at most MAX_SAME_CATEGORY
 *   targets from the same entity category are selected.  If no other-category
 *   candidates exist, the cap is relaxed so all 3 slots are still filled.
 * - Final selection order: placement_score DESC → entity-graph score DESC →
 *   target_url ASC (deterministic).
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

const ROOT              = path.resolve(__dirname, '..');
const LINK_MAP_PATH     = path.join(ROOT, 'js', 'link-map.json');
const ENTITY_GRAPH_PATH = path.join(ROOT, 'js', 'entity-graph.json');
const ENTITY_MAP_PATH   = path.join(ROOT, 'js', 'entity-map.json');
const OUTPUT_PATH       = path.join(ROOT, 'js', 'injection-plan.json');
const WIKI_DIR          = path.join(ROOT, 'wiki');

const MAX_PER_PAGE    = 3;
const SNIPPET_RADIUS  = 60; // chars before/after match

const MIN_PARAGRAPH_CHARS = 40; // eligible paragraph must be >= 40 chars
const MIN_ANCHOR_CHARS    = 6;  // anchor phrase must be >= 6 chars

// Cluster-balance constants (Phase 11)
// Scan up to this many suggested links per page to enable diversity selection.
const MAX_SCAN_LINKS    = 20;
// At most this many injection targets from the same entity category per page.
// Falls back to selecting over-represented categories if no alternatives exist.
const MAX_SAME_CATEGORY = 2;

// Anchors that must not be used as link text
const ANCHOR_BLOCKLIST = new Set([
  'nfts', 'token', 'tokens', 'crypto', 'blockchain', 'defi', 'wiki', 'punk',
]);

// ---------------------------------------------------------------------------
// Section-aware placement scoring
// ---------------------------------------------------------------------------

// Placement scores by section type (higher = better placement)
const PLACEMENT_SCORES = {
  lead:      4,
  summary:   3,
  explainer: 3,
  lore:      2,
  list:      1,
  fallback:  0,
};

/**
 * Determine the section type of a paragraph element.
 *
 * @param {string} tag            - Lowercase tag name ('p' or 'li')
 * @param {string} cls            - Lowercase class attribute value
 * @param {string} headingText    - Lowercase text of the most recent heading
 * @param {boolean} isFirstParagraph - True if this is the first <p> in the article
 * @returns {string} section type key
 */
function determineSectionType(tag, cls, headingText, isFirstParagraph) {
  if (cls.includes('lead'))      return 'lead';
  if (cls.includes('lore'))      return 'lore';
  if (cls.includes('summary'))   return 'summary';
  if (cls.includes('explainer')) return 'explainer';
  if (tag === 'li')              return 'list';

  // Plain <p> element: use position and nearest heading context
  if (isFirstParagraph) return 'lead';

  const h = headingText.toLowerCase();
  if (/summar|overview|tl.?dr/.test(h))                      return 'summary';
  if (/explain|how it|what is|mechanism|how does/.test(h))   return 'explainer';
  if (/lore|story|legend|myth|origin|background/.test(h))    return 'lore';

  return 'fallback';
}

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
 * Remove content from block-level tags that should be skipped entirely,
 * but keep heading elements for section-context detection.
 */
function removeSkippedBlocksKeepHeadings(html) {
  const blockPatterns = [
    /<script[\s\S]*?<\/script\s*>/gi,
    /<style[\s\S]*?<\/style\s*>/gi,
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
 * Extract eligible paragraphs from a wiki page with section-type metadata.
 *
 * Returns an array of:
 *   { text: string, section_type: string, document_order: number }
 *
 * Headings are scanned in document order to provide section context for
 * subsequent plain <p> elements. Skipped blocks (nav, aside, TOC, links)
 * are stripped before scanning.
 */
function extractEligibleParagraphs(html) {
  const articleBlock = extractArticleBlock(html);
  // Keep headings for section-context detection; strip nav/aside/toc/links
  const content = removeSkippedBlocksKeepHeadings(articleBlock);

  const paragraphs = [];
  let isFirstParagraph = true;
  let currentHeadingText = '';

  // Match headings and paragraph-like elements in document order.
  // Backreference \1 ensures the closing tag matches the opening tag.
  const elemRe = /<(h[1-6]|p|li)([^>]*?)>([\s\S]*?)<\/\1\s*>/gi;
  let match;

  while ((match = elemRe.exec(content)) !== null) {
    const [, tag, attrs, inner] = match;
    const tagLower = tag.toLowerCase();
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Update heading context; headings are not themselves eligible paragraphs
    if (/^h[1-6]$/.test(tagLower)) {
      currentHeadingText = text;
      continue;
    }

    // Skip paragraphs below minimum length
    if (text.length < MIN_PARAGRAPH_CHARS) {
      if (tagLower === 'p') isFirstParagraph = false;
      continue;
    }

    const classMatch = attrs.match(/class\s*=\s*["']([^"']*)["']/i);
    const cls = (classMatch ? classMatch[1] : '').toLowerCase();

    const section_type = determineSectionType(tagLower, cls, currentHeadingText, isFirstParagraph);
    if (tagLower === 'p') isFirstParagraph = false;

    paragraphs.push({ text, section_type, document_order: paragraphs.length });
  }

  return paragraphs;
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

  // Load entity-graph for score-based candidate ranking (optional – falls back
  // to alphabetical order if the file does not exist yet)
  let entityGraph = {};
  if (fs.existsSync(ENTITY_GRAPH_PATH)) {
    entityGraph = JSON.parse(fs.readFileSync(ENTITY_GRAPH_PATH, 'utf8'));
  }

  // Load entity-map to obtain category per URL (for cluster-balance logic).
  // Build url → category lookup.
  const entityCategoryMap = {};
  if (fs.existsSync(ENTITY_MAP_PATH)) {
    const entityMap = JSON.parse(fs.readFileSync(ENTITY_MAP_PATH, 'utf8'));
    for (const entry of entityMap) {
      if (entry.canonical_url && entry.category) {
        entityCategoryMap[entry.canonical_url] = entry.category;
      }
    }
  }

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
    const eligibleParagraphs = extractEligibleParagraphs(html);

    if (!eligibleParagraphs.length) continue;

    // Build a score lookup for candidates on this page from entity-graph.
    // Use final_score (Phase 12 freshness-aware score) when available; fall back
    // to score (Phase 11) so output is deterministic across graph versions.
    const pageGraphEntry = entityGraph[pageKey];
    const graphScoreMap  = {};
    if (pageGraphEntry && Array.isArray(pageGraphEntry.related_pages)) {
      for (const rel of pageGraphEntry.related_pages) {
        graphScoreMap[rel.target_url] = rel.final_score !== undefined
          ? rel.final_score
          : rel.score;
      }
    }

    // Rank candidates: freshness-aware entity-graph final_score DESC (Phase 12;
    // includes authority + reinforcement + freshness/decay),
    // then URL ASC (deterministic fallback).
    const sortedLinks = [...suggestedLinks].sort((a, b) => {
      const scoreA = graphScoreMap[a] || 0;
      const scoreB = graphScoreMap[b] || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.localeCompare(b);
    });

    // ---------------------------------------------------------------------------
    // Phase 1: Scan up to MAX_SCAN_LINKS candidates and collect all valid matches.
    // Scanning beyond MAX_PER_PAGE allows cluster-balance logic to choose a more
    // diverse set in Phase 2.
    // ---------------------------------------------------------------------------
    const scannedTargets = new Set();
    const candidateMatches = [];

    for (const targetUrl of sortedLinks) {
      if (scannedTargets.size >= MAX_SCAN_LINKS) break;
      if (scannedTargets.has(targetUrl)) continue;
      if (targetUrl === pageKey) continue;  // no self-links

      scannedTargets.add(targetUrl);

      const candidates = deriveAnchorCandidates(targetUrl);
      const graphScore = graphScoreMap[targetUrl] || 0;

      // Find the best-placed occurrence across all eligible paragraphs.
      // Priority: placement_score DESC → graph_score (constant per URL) →
      //           document_order ASC (earlier first).
      let bestMatch = null;

      for (const phrase of candidates) {
        if (phrase.length < MIN_ANCHOR_CHARS) continue;

        // Skip blocklisted anchor terms
        if (ANCHOR_BLOCKLIST.has(phrase.toLowerCase())) continue;

        for (const para of eligibleParagraphs) {
          const found = findFirstOccurrence(para.text, phrase);
          if (!found) continue;

          const placement_score = PLACEMENT_SCORES[para.section_type] || 0;

          if (
            !bestMatch ||
            placement_score > bestMatch.placement_score ||
            (placement_score === bestMatch.placement_score &&
              para.document_order < bestMatch._docOrder)
          ) {
            bestMatch = {
              target_url:      targetUrl,
              anchor_text:     found.matched,
              match_type:      'title',
              section_type:    para.section_type,
              placement_score,
              context_snippet: buildSnippet(para.text, found.index, found.matched.length),
              _docOrder:       para.document_order,
              _graphScore:     graphScore,
              _category:       entityCategoryMap[targetUrl] || '',
            };
          }
        }

        if (bestMatch) break; // use first candidate phrase that yields any match
      }

      if (bestMatch) {
        candidateMatches.push(bestMatch);
      }
    }

    if (candidateMatches.length === 0) continue;

    // ---------------------------------------------------------------------------
    // Phase 2: Select up to MAX_PER_PAGE insertions with cluster-balance logic.
    //
    // Sort by: placement_score DESC → graph_score DESC → target_url ASC
    // Then greedily select, capping same-category picks at MAX_SAME_CATEGORY.
    // Deferred (over-represented category) candidates fill remaining slots if
    // no diverse alternatives exist.
    // ---------------------------------------------------------------------------
    candidateMatches.sort((a, b) => {
      if (b.placement_score !== a.placement_score) return b.placement_score - a.placement_score;
      if (b._graphScore !== a._graphScore)         return b._graphScore - a._graphScore;
      return a.target_url.localeCompare(b.target_url);
    });

    const selectedCategories = {};
    const selected = [];
    const deferred = [];

    for (const m of candidateMatches) {
      if (selected.length >= MAX_PER_PAGE) break;
      const cat = m._category;
      if ((selectedCategories[cat] || 0) < MAX_SAME_CATEGORY) {
        selected.push(m);
        selectedCategories[cat] = (selectedCategories[cat] || 0) + 1;
      } else {
        deferred.push(m);
      }
    }

    // Fill remaining slots with deferred candidates (all diverse categories exhausted)
    for (const m of deferred) {
      if (selected.length >= MAX_PER_PAGE) break;
      selected.push(m);
    }

    // Strip internal fields and build the final matches array
    const matches = selected.map(({ _docOrder, _graphScore, _category, ...entry }) => entry);

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

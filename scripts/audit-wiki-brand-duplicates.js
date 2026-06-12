#!/usr/bin/env node
/**
 * scripts/audit-wiki-brand-duplicates.js
 *
 * Scans wiki/*.html, js/wiki-index.json, js/entity-map.json, and
 * js/entity-graph.json to produce js/wiki-canonical-audit.json.
 *
 * Each cluster in the output describes either:
 *   - A canonical brand concept with its safe alias slugs and separate sibling concepts
 *   - An UNKNOWN slug flagged as NEEDS_BRAND_REVIEW
 *
 * Usage: node scripts/audit-wiki-brand-duplicates.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { BRAND_CANON } = require('./wiki-brand-taxonomy.js');

const ROOT        = path.resolve(__dirname, '..');
const WIKI_DIR    = path.join(ROOT, 'wiki');
const INDEX_PATH  = path.join(ROOT, 'js', 'wiki-index.json');
const EMAP_PATH   = path.join(ROOT, 'js', 'entity-map.json');
const GRAPH_PATH  = path.join(ROOT, 'js', 'entity-graph.json');
const OUTPUT_PATH = path.join(ROOT, 'js', 'wiki-canonical-audit.json');

function normalizeSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
}

function slugFromUrl(url) {
  return String(url || '')
    .replace(/^\/wiki\//, '')
    .replace(/\.html$/i, '')
    .trim();
}

function isRedirect(html) {
  return /http-equiv=["']refresh["']/i.test(html) || /data-wiki-stub=["']true["']/i.test(html);
}

function run() {
  // ── Collect all wiki slugs from disk ──────────────────────────────────
  const wikiFiles = fs.readdirSync(WIKI_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => path.join(WIKI_DIR, f));

  const allSlugs = new Set();
  const redirectSlugs = new Set();

  for (const filePath of wikiFiles) {
    const html = fs.readFileSync(filePath, 'utf8');
    const slug = normalizeSlug(path.basename(filePath, '.html'));
    allSlugs.add(slug);
    if (isRedirect(html)) redirectSlugs.add(slug);
  }

  // ── Load generated assets ──────────────────────────────────────────────
  const wikiIndex  = fs.existsSync(INDEX_PATH)  ? JSON.parse(fs.readFileSync(INDEX_PATH,  'utf8')) : [];
  const entityMap  = fs.existsSync(EMAP_PATH)   ? JSON.parse(fs.readFileSync(EMAP_PATH,   'utf8')) : [];
  const graphData  = fs.existsSync(GRAPH_PATH)  ? JSON.parse(fs.readFileSync(GRAPH_PATH,  'utf8')) : {};

  const indexedCanonicals = new Set(wikiIndex.map(e => slugFromUrl(e.url)));
  const entityMapSlugs    = new Set(entityMap.map(e => slugFromUrl(e.canonical_url)));
  const graphUrls         = new Set(Object.keys(graphData));

  // ── Build brand clusters from BRAND_CANON ────────────────────────────
  const clusters = [];
  const handledSlugs = new Set();

  for (const [brandKey, brand] of Object.entries(BRAND_CANON)) {
    for (const [conceptType, concept] of Object.entries(brand.concepts)) {
      const canonicalSlug = concept.canonical;
      const aliasSlugList = concept.aliases || [];

      // Collect sibling concepts (same brand, different concept type)
      const siblings = [];
      for (const [otherType, otherConcept] of Object.entries(brand.concepts)) {
        if (otherType !== conceptType) siblings.push(otherConcept.canonical);
      }

      const canonicalUrl  = `/wiki/${canonicalSlug}.html`;
      const inIndex       = indexedCanonicals.has(canonicalSlug);
      const inEntityMap   = entityMapSlugs.has(canonicalSlug);
      const inGraph       = graphUrls.has(canonicalUrl);

      const cluster = {
        brand:             brand.id || brandKey,
        concept_type:      conceptType,
        canonical_slug:    canonicalSlug,
        canonical_url:     canonicalUrl,
        canonical_concept_id: `${brand.id || brandKey}:${conceptType}`,
        aliases:           aliasSlugList,
        kept_separate:     siblings,
        in_wiki_index:     inIndex,
        in_entity_map:     inEntityMap,
        in_entity_graph:   inGraph,
        reason:            `same brand (${brand.id || brandKey}), same concept type (${conceptType})`,
      };

      clusters.push(cluster);
      handledSlugs.add(canonicalSlug);
      for (const alias of aliasSlugList) handledSlugs.add(alias);
    }
  }

  // ── Flag unknown slugs as NEEDS_BRAND_REVIEW ─────────────────────────
  const unknownClusters = [];

  for (const slug of allSlugs) {
    if (handledSlugs.has(slug)) continue;
    if (redirectSlugs.has(slug)) continue;
    // Only flag slugs that look like they might be brand-related by checking
    // if any known brand key appears in the slug.
    const brandIds = Object.values(BRAND_CANON).map(b => b.id).filter(Boolean);
    const looksLikeBrand = brandIds.some(id => slug.includes(id));

    unknownClusters.push({
      slug,
      url: `/wiki/${slug}.html`,
      status: 'NEEDS_BRAND_REVIEW',
      in_wiki_index: indexedCanonicals.has(slug),
      in_entity_map: entityMapSlugs.has(slug),
      note: looksLikeBrand
        ? 'Slug appears brand-related but is not in BRAND_CANON; review for potential alias or new concept'
        : 'Slug is outside all known brand families; review before adding to taxonomy',
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const summary = {
    generated_at:        new Date().toISOString(),
    total_wiki_slugs:    allSlugs.size,
    total_redirect_slugs: redirectSlugs.size,
    brand_clusters:      clusters.length,
    unknown_slugs:       unknownClusters.length,
    needs_review:        unknownClusters.filter(u => u.status === 'NEEDS_BRAND_REVIEW').length,
  };

  const output = {
    generated_at: summary.generated_at,
    summary,
    clusters,
    unknown_slugs: unknownClusters,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Audit complete: ${clusters.length} brand clusters, ${unknownClusters.length} unknown slugs`);
  console.log(`Output: ${path.relative(ROOT, OUTPUT_PATH)}`);
}

run();

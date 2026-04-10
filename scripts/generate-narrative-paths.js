#!/usr/bin/env node
'use strict';

/**
 * generate-narrative-paths.js
 * Phase 25: Narrative Path Builder.
 *
 * Reads:
 *   js/wiki-index.json
 *   js/entity-graph.json
 *   js/link-graph.json
 *
 * Writes:
 *   js/narrative-paths.json
 *
 * Defines guided reading journeys across related pages by:
 *   1. Identifying high-rank "gateway" pages per category
 *   2. Building chains of strongly-related pages using entity-graph scores
 *   3. Producing named narrative paths (e.g. "The Bitcoin Origins Journey")
 *
 * Rules:
 *  - Deterministic: same inputs always produce same outputs
 *  - No external APIs, no randomness
 *  - Root-relative paths only
 *  - Does not modify any existing files
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MIN_PATH_LENGTH   = 3;   // minimum pages in a narrative path
const MAX_PATH_LENGTH   = 8;   // maximum pages in a narrative path
const MAX_PATHS         = 15;  // total paths to generate
const MIN_ENTITY_SCORE  = 40;  // minimum entity-graph score for an edge
const GATEWAY_RANK_MIN  = 100; // minimum rank_score for a gateway page

// ---------------------------------------------------------------------------
// Path templates — named narrative structures grounded in the wiki
// ---------------------------------------------------------------------------

const PATH_TEMPLATES = [
  {
    id:          'bitcoin-origins',
    name:        'The Bitcoin Origins Journey',
    description: 'Follow the story of Bitcoin through the Crypto Moonboys universe',
    seed_tags:   ['bitcoin', 'btc'],
    category:    null,
  },
  {
    id:          'graffpunks-lore',
    name:        'GraffPUNKS Universe',
    description: 'Explore the GraffPUNKS faction and their connected world',
    seed_tags:   ['graffpunks'],
    category:    null,
  },
  {
    id:          'nft-ecosystem',
    name:        'NFT Ecosystem Deep Dive',
    description: 'A guided tour through the NFT collections and drops',
    seed_tags:   ['nfts', 'nft'],
    category:    null,
  },
  {
    id:          'crypto-characters',
    name:        'Meet the Characters',
    description: 'Introduction to the key characters of the Crypto Moonboys world',
    seed_tags:   null,
    category:    'characters',
  },
  {
    id:          'factions-overview',
    name:        'Factions of the Moonboys',
    description: 'The major factions shaping the Crypto Moonboys narrative',
    seed_tags:   null,
    category:    'factions',
  },
  {
    id:          'token-landscape',
    name:        'Token Landscape',
    description: 'The tokens and cryptocurrencies central to the ecosystem',
    seed_tags:   null,
    category:    'tokens',
  },
  {
    id:          'metaverse-journey',
    name:        'Into the Metaverse',
    description: 'Pages connecting the physical and digital worlds',
    seed_tags:   ['metaverse', 'battles'],
    category:    null,
  },
  {
    id:          'ethereum-trail',
    name:        'The Ethereum Trail',
    description: 'Ethereum-connected pages and ecosystem members',
    seed_tags:   ['eth', 'ethereum'],
    category:    null,
  },
  {
    id:          'kids-army',
    name:        'The Bitcoin Kids Army',
    description: 'The next generation of crypto moonboys',
    seed_tags:   ['kids'],
    category:    null,
  },
  {
    id:          'games-and-battles',
    name:        'Games and Battles',
    description: 'The gaming and battle pages of the Moonboys universe',
    seed_tags:   ['games', 'battle'],
    category:    null,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s+[—–-]\s+Crypto Moonboys Wiki$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function slugFromUrl(url) {
  return (url || '').replace('/wiki/', '').replace('.html', '');
}

function normUrl(u) {
  return (u || '').trim().replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

const wikiIndexRaw = readJson('js/wiki-index.json');
const entityGraph  = readJson('js/entity-graph.json');
const linkGraph    = readJson('js/link-graph.json');

const wikiPages = Array.isArray(wikiIndexRaw) ? wikiIndexRaw : Object.values(wikiIndexRaw);

// URL → page entry
const pageLookup = Object.fromEntries(
  wikiPages.map(p => [normUrl(p.url), p])
);

// URL → entity-graph entry (keyed by normalised URL)
const egLookup = Object.fromEntries(
  Object.entries(entityGraph).map(([k, v]) => [normUrl(k), v])
);

// ---------------------------------------------------------------------------
// Seed page selection
// ---------------------------------------------------------------------------

/**
 * Get candidate seed pages for a template based on seed_tags or category.
 * Returns pages sorted by rank_score DESC.
 */
function getSeedCandidates(template) {
  let candidates;

  if (template.seed_tags && template.seed_tags.length > 0) {
    const tagSet = new Set(template.seed_tags.map(t => t.toLowerCase()));
    candidates = wikiPages.filter(p =>
      Array.isArray(p.tags) && p.tags.some(t => tagSet.has(t.toLowerCase()))
    );
  } else if (template.category) {
    candidates = wikiPages.filter(p => p.category === template.category);
  } else {
    candidates = [];
  }

  return candidates
    .filter(p => typeof p.rank_score === 'number' && p.rank_score >= GATEWAY_RANK_MIN)
    .sort((a, b) => {
      if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
      return cleanTitle(a.title).localeCompare(cleanTitle(b.title));
    });
}

// ---------------------------------------------------------------------------
// Path building via greedy entity-graph traversal
// ---------------------------------------------------------------------------

/**
 * Build a narrative path by greedily following the highest-scoring
 * entity-graph edges from the seed page.
 * - Does not revisit pages
 * - Stops at MAX_PATH_LENGTH or when no qualifying next page exists
 */
function buildPath(seedUrl, maxLen) {
  const visited = new Set();
  const chain   = [];

  let currentUrl = normUrl(seedUrl);

  while (chain.length < maxLen) {
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);

    const page = pageLookup[currentUrl];
    if (!page) break;

    chain.push(currentUrl);

    // Find best unvisited next page via entity-graph
    const eg = egLookup[currentUrl];
    if (!eg) break;

    // Sort related_pages by final_score DESC, then url ASC
    const candidates = (eg.related_pages || [])
      .filter(rp => {
        const score = typeof rp.final_score === 'number' ? rp.final_score : rp.score;
        return score >= MIN_ENTITY_SCORE && !visited.has(normUrl(rp.target_url));
      })
      .sort((a, b) => {
        const scoreA = typeof a.final_score === 'number' ? a.final_score : a.score;
        const scoreB = typeof b.final_score === 'number' ? b.final_score : b.score;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (a.target_url || '').localeCompare(b.target_url || '');
      });

    if (candidates.length === 0) break;
    currentUrl = normUrl(candidates[0].target_url);
  }

  return chain;
}

/**
 * Format a chain of URLs into path step objects.
 */
function formatPathSteps(urlChain) {
  return urlChain.map((url, i) => {
    const page = pageLookup[url];
    return {
      step:       i + 1,
      url,
      title:      page ? cleanTitle(page.title) : slugFromUrl(url),
      category:   page ? (page.category || 'unknown') : 'unknown',
      rank_score: page && typeof page.rank_score === 'number' ? page.rank_score : 0,
      is_gateway: i === 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Build all narrative paths
// ---------------------------------------------------------------------------

const narrativePaths = [];

for (const template of PATH_TEMPLATES) {
  const seeds = getSeedCandidates(template);
  if (seeds.length === 0) continue;

  // Use the top seed as the gateway
  const seedPage = seeds[0];
  const chain    = buildPath(seedPage.url, MAX_PATH_LENGTH);

  if (chain.length < MIN_PATH_LENGTH) continue;

  const steps = formatPathSteps(chain);

  // Compute path quality signals
  const avgRank = Math.round(
    steps.reduce((sum, s) => sum + s.rank_score, 0) / steps.length
  );

  narrativePaths.push({
    id:          template.id,
    name:        template.name,
    description: template.description,
    seed_tags:   template.seed_tags || [],
    category:    template.category || null,
    step_count:  steps.length,
    avg_rank_score: avgRank,
    gateway_url: seedPage.url,
    gateway_title: cleanTitle(seedPage.title),
    steps,
  });
}

// Sort by step_count DESC, then avg_rank DESC, then id ASC
narrativePaths.sort((a, b) => {
  if (b.step_count !== a.step_count) return b.step_count - a.step_count;
  if (b.avg_rank_score !== a.avg_rank_score) return b.avg_rank_score - a.avg_rank_score;
  return a.id.localeCompare(b.id);
});

const topPaths = narrativePaths.slice(0, MAX_PATHS);

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------

const output = {
  generated_at:   new Date().toISOString(),
  phase:          'phase_25',
  schema_version: '1.0',

  summary: {
    total_paths:       topPaths.length,
    total_templates:   PATH_TEMPLATES.length,
    avg_path_length:   topPaths.length > 0
      ? Math.round(topPaths.reduce((s, p) => s + p.step_count, 0) / topPaths.length * 10) / 10
      : 0,
    min_path_length:   MIN_PATH_LENGTH,
    max_path_length:   MAX_PATH_LENGTH,
  },

  paths: topPaths,
};

const outPath = path.join(ROOT, 'js', 'narrative-paths.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log('generate-narrative-paths.js complete ✅');
console.log(`  Paths generated: ${topPaths.length} / ${PATH_TEMPLATES.length} templates`);
if (topPaths.length > 0) {
  const avgLen = topPaths.reduce((s, p) => s + p.step_count, 0) / topPaths.length;
  console.log(`  Average path length: ${avgLen.toFixed(1)} pages`);
}
console.log('  Output: js/narrative-paths.json');

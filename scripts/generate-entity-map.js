#!/usr/bin/env node
/**
 * scripts/generate-entity-map.js
 *
 * Reads the canonical wiki index (js/wiki-index.json) produced by
 * generate-wiki-index.js and emits two generated files:
 *
 *   js/entity-map.json   — frontend-friendly canonical entity registry
 *   sam-memory.json      — machine-friendly memory handoff for SAM / brain-side systems
 *
 * Both files are deterministic: same input → same output.  JSON keys are
 * sorted and entries are ordered by entity_id to guarantee stable diffs.
 *
 * Run after generate-wiki-index.js:
 *   node scripts/generate-entity-map.js
 *
 * Or regenerate everything in one go:
 *   node scripts/generate-wiki-index.js && \
 *   node scripts/generate-sitemap.js && \
 *   node scripts/generate-site-stats.js && \
 *   node scripts/generate-entity-map.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT             = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH  = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP_PATH  = path.join(ROOT, 'js', 'entity-map.json');
const SAM_MEMORY_PATH  = path.join(ROOT, 'sam-memory.json');

/* ── Junk / noise filters for alias candidate validation ─────────────────── */
const JUNK_SINGLES = new Set([
  'page', 'wiki', 'article', 'home', 'index', 'site', 'web', 'link',
  'read', 'more', 'click', 'here', 'next', 'prev', 'previous', 'back',
  'top', 'menu', 'nav', 'navigation', 'footer', 'header', 'sidebar',
  'search', 'tag', 'tags', 'category', 'categories', 'list', 'all',
]);

const NAV_PHRASES = new Set([
  'back to top', 'read more', 'click here', 'learn more', 'see also',
  'external link', 'edit page', 'view source', 'table of contents',
  'in this article', 'on this page',
]);

/* ── Generate a stable entity_id from a canonical title + URL ───────────── */
function makeEntityId(title, url) {
  // Prefer slug derived from the canonical URL (most stable).
  const slug = url
    .replace(/^\/wiki\//, '')
    .replace(/\.html$/, '');

  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/* ── Generate tags from a title (same logic as generate-wiki-index.js) ───── */
function generateTags(title) {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'of', 'in', 'for', 'on', 'at', 'to', 'by',
    'or', 'is', 'are', 'it', 'its', 'with', 'as',
  ]);
  return [...new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopwords.has(w)),
  )];
}

/* ── Validate an alias candidate string ─────────────────────────────────── */
// Returns true when the candidate is a high-signal alias worth keeping.
function isValidAliasCandidate(candidate, canonicalTitle) {
  if (!candidate || typeof candidate !== 'string') return false;

  const trimmed = candidate.trim();
  if (!trimmed) return false;

  // Single character — always junk
  if (trimmed.length < 2) return false;

  const lower = trimmed.toLowerCase();

  // Nav phrases
  if (NAV_PHRASES.has(lower)) return false;

  // Single generic word
  if (!lower.includes(' ') && JUNK_SINGLES.has(lower)) return false;

  // Reject if it duplicates the canonical title (case-insensitive)
  if (lower === canonicalTitle.toLowerCase()) return false;

  // Reject very short single tokens with no signal
  if (trimmed.split(/\s+/).length === 1 && trimmed.length < 4) return false;

  return true;
}

/* ── Generate alias candidate phrases from title / slug ─────────────────── */
// These are potential aliases that have NOT been confirmed as dedup-proven.
// They are stored separately from approved aliases and must not override canon.
function generateAliasCandidates(entry) {
  const candidates = new Set();
  const canon = entry.canonical_title.toLowerCase();

  // Slug words joined naturally (e.g. "alfie-the-bitcoin-kid-blaze" → "alfie the bitcoin kid blaze")
  const slugPhrase = entry.canonical_url
    .replace(/^\/wiki\//, '')
    .replace(/\.html$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (slugPhrase.toLowerCase() !== canon) candidates.add(slugPhrase);

  // Title without leading "The " / "A " (common lookup shorthand)
  const titleNoThe = entry.canonical_title.replace(/^(The|A|An)\s+/i, '').trim();
  if (titleNoThe !== entry.canonical_title) candidates.add(titleNoThe);

  // Tags joined as a phrase (only if > 1 tag and ≤ 5 tags for signal quality)
  const tagPhrase = (entry.tags || []).join(' ').trim();
  if (tagPhrase && tagPhrase.toLowerCase() !== canon &&
      (entry.tags || []).length > 1 && (entry.tags || []).length <= 5) {
    candidates.add(tagPhrase);
  }

  // Filter through the validator; exclude anything already in approved aliases
  const approvedLower = new Set(
    (entry.aliases || []).map(a => a.toLowerCase()),
  );

  return [...candidates]
    .filter(c => isValidAliasCandidate(c, entry.canonical_title))
    .filter(c => !approvedLower.has(c.toLowerCase()))
    .sort();
}

/* ── Main ───────────────────────────────────────────────────────────────── */
if (!fs.existsSync(WIKI_INDEX_PATH)) {
  console.error(`Error: ${WIKI_INDEX_PATH} not found.`);
  console.error('Run `node scripts/generate-wiki-index.js` first.');
  process.exit(1);
}

const wikiIndex = JSON.parse(fs.readFileSync(WIKI_INDEX_PATH, 'utf8'));
console.log(`Loaded ${wikiIndex.length} canonical entries from js/wiki-index.json`);

// ── Build entity records ──────────────────────────────────────────────────
const entityRecords = [];

for (const entry of wikiIndex) {
  const entityId = makeEntityId(entry.title, entry.url);

  // Approved aliases: title+url pairs already confirmed by dedup
  const approvedAliases = (entry.aliases || []).map(a => a.title);

  // Tags: prefer existing tags from the index, fall back to generated
  const tags = Array.isArray(entry.tags) && entry.tags.length > 0
    ? entry.tags
    : generateTags(entry.title);

  const record = {
    entity_id:       entityId,
    canonical_title: entry.title,
    canonical_url:   entry.url,
    category:        entry.category || 'Lore',
    aliases:         approvedAliases,
    tags,
    source_urls:     [entry.url],
  };

  // Add alias source URLs (the redirect stubs that point here)
  if (Array.isArray(entry.aliases)) {
    for (const a of entry.aliases) {
      if (a.url && !record.source_urls.includes(a.url)) {
        record.source_urls.push(a.url);
      }
    }
  }

  entityRecords.push(record);
}

// Sort by entity_id for deterministic output
entityRecords.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

// ── Build alias_candidates (after all canonical entity_ids are known) ─────
// This prevents candidates from colliding with canonical titles of OTHER entities.
const allCanonicalTitlesLower = new Set(
  entityRecords.map(r => r.canonical_title.toLowerCase()),
);
const allApprovedAliasesLower = new Set();
for (const r of entityRecords) {
  r.aliases.forEach(a => allApprovedAliasesLower.add(a.toLowerCase()));
}

for (const record of entityRecords) {
  const rawCandidates = generateAliasCandidates(record);

  // Reject candidates that match any canonical title or approved alias of
  // another entity — cross-contamination guard.
  const safe = rawCandidates.filter(c => {
    const cLower = c.toLowerCase();
    if (allCanonicalTitlesLower.has(cLower) && cLower !== record.canonical_title.toLowerCase()) {
      return false;
    }
    if (allApprovedAliasesLower.has(cLower)) return false;
    return true;
  });

  if (safe.length > 0) {
    record.alias_candidates = safe;
  }
}

// ── Emit js/entity-map.json ───────────────────────────────────────────────
fs.writeFileSync(ENTITY_MAP_PATH, JSON.stringify(entityRecords, null, 2) + '\n');
console.log(`\nGenerated js/entity-map.json with ${entityRecords.length} entity records`);

// ── Emit sam-memory.json ─────────────────────────────────────────────────
const entities = {};
for (const r of entityRecords) {
  const memEntry = {
    aliases:          r.aliases,
    alias_candidates: r.alias_candidates || [],
    canonical_title:  r.canonical_title,
    canonical_url:    r.canonical_url,
    category:         r.category,
    source_urls:      r.source_urls,
    status:           'canonical',
    tags:             r.tags,
  };
  entities[r.entity_id] = memEntry;
}

// Serialise with sorted keys for deterministic output (reusable replacer)
function deterministicReplacer(key, val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)));
  }
  return val;
}

// Preserve updated_at if the entity data hasn't changed — prevents the PR
// staleness check from failing just because CI ran at a different time.
let updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
if (fs.existsSync(SAM_MEMORY_PATH)) {
  try {
    const existing = JSON.parse(fs.readFileSync(SAM_MEMORY_PATH, 'utf8'));
    const existingEntitiesJson = JSON.stringify(existing.entities, deterministicReplacer);
    const newEntitiesJson      = JSON.stringify(entities,          deterministicReplacer);
    if (existingEntitiesJson === newEntitiesJson) {
      updatedAt = existing.updated_at;
    }
  } catch (e) {
    console.warn('Warning: could not parse existing sam-memory.json — using fresh timestamp.', e.message);
  }
}

const samMemory = {
  entities,
  updated_at: updatedAt,
};

const samJson = JSON.stringify(samMemory, deterministicReplacer, 2);

fs.writeFileSync(SAM_MEMORY_PATH, samJson + '\n');
console.log(`Generated sam-memory.json with ${Object.keys(entities).length} entities`);
console.log(`  updated_at: ${updatedAt}`);

#!/usr/bin/env node
/**
 * scripts/wiki-publish-gate.test.mjs
 *
 * Tests for the brand-canon wiki publish gate.
 *
 * Proves:
 *  - Specific synthetic "via" pages are classified as BLOCKED_SYNTHETIC_SLUG
 *  - Real brand/lore pages remain APPROVED_CANON_PAGE
 *  - BLOCKED_* and NEEDS_BRAND_REVIEW pages do not appear in wiki-index.json, entity-map.json, or entity-graph.json
 *  - Non-approved URLs do not leak through alias.url, source_urls, or graph targets
 *  - The audit file exists and lists blocked pages with reasons
 *  - Build fails (non-zero exit) if new synthetic pages are introduced without approval
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const gate = require('./wiki-publish-gate.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Load generated assets ─────────────────────────────────────────────────────

const AUDIT_PATH        = path.join(ROOT, 'js', 'wiki-publish-audit.json');
const WIKI_INDEX_PATH   = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP_PATH   = path.join(ROOT, 'js', 'entity-map.json');
const ENTITY_GRAPH_PATH = path.join(ROOT, 'js', 'entity-graph.json');

assert.ok(fs.existsSync(AUDIT_PATH),      'js/wiki-publish-audit.json must exist — run: node scripts/wiki-publish-gate.js');
assert.ok(fs.existsSync(WIKI_INDEX_PATH), 'js/wiki-index.json must exist');

const audit       = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
const wikiIndex   = JSON.parse(fs.readFileSync(WIKI_INDEX_PATH, 'utf8'));
const entityMap   = fs.existsSync(ENTITY_MAP_PATH)   ? JSON.parse(fs.readFileSync(ENTITY_MAP_PATH,   'utf8')) : [];
const entityGraph = fs.existsSync(ENTITY_GRAPH_PATH) ? JSON.parse(fs.readFileSync(ENTITY_GRAPH_PATH, 'utf8')) : {};

const canon = gate.loadBrandCanon();

// Build sets of approved and non-approved URLs from the audit file.
const approvedUrlSet    = new Set([...(audit.approved || [])].map(e => `/wiki/${e.slug}.html`));
const blockedUrlSet     = new Set([...(audit.blocked  || [])].map(e => `/wiki/${e.slug}.html`));
const reviewUrlSet      = new Set([...(audit.review   || [])].map(e => `/wiki/${e.slug}.html`));
const nonApprovedUrlSet = new Set([...blockedUrlSet, ...reviewUrlSet]);

const wikiIndexUrls = new Set(wikiIndex.map(e => e.url));

// Helper: find entry in audit by slug
function auditEntry(slug) {
  return [
    ...(audit.approved || []),
    ...(audit.blocked  || []),
    ...(audit.review   || []),
  ].find(e => e.slug === slug) || null;
}

// ── 1. Synthetic "via" slugs must be BLOCKED_SYNTHETIC_SLUG ─────────────────

const syntheticSlugs = [
  'bitcoin-graffpunks-via-kid',
  'free-graffpunks-via-nfts',
  'graffpunks-token-via-radio',
  'hodl-token-via-warriors',
];

for (const slug of syntheticSlugs) {
  const result = gate.classifySlug(slug, canon);
  assert.equal(
    result.status,
    gate.STATUS.BLOCKED_SYNTHETIC_SLUG,
    `Expected ${slug} to be BLOCKED_SYNTHETIC_SLUG, got ${result.status}: ${result.reason}`
  );
}

console.log(`✓ All ${syntheticSlugs.length} synthetic "via" slugs are BLOCKED_SYNTHETIC_SLUG`);

// ── 2. Real brand pages must be APPROVED_CANON_PAGE ──────────────────────────

const approvedSlugs = [
  'graffpunks',
  'graffpunks-24-7-radio',
  'graffpunks-collection',
  'midevilpunks',
  'nbg-token',
  'hodl-wars',
];

for (const slug of approvedSlugs) {
  const result = gate.classifySlug(slug, canon);
  assert.equal(
    result.status,
    gate.STATUS.APPROVED_CANON_PAGE,
    `Expected ${slug} to be APPROVED_CANON_PAGE, got ${result.status}: ${result.reason}`
  );
}

console.log(`✓ All ${approvedSlugs.length} real brand pages are APPROVED_CANON_PAGE`);

// ── 3. Audit file structure is valid ─────────────────────────────────────────

assert.ok(Array.isArray(audit.approved), 'audit.approved must be an array');
assert.ok(Array.isArray(audit.blocked),  'audit.blocked must be an array');
assert.ok(Array.isArray(audit.review),   'audit.review must be an array');
assert.ok(audit.summary && typeof audit.summary === 'object', 'audit.summary must be an object');
assert.ok(typeof audit.summary.total === 'number',    'audit.summary.total must be a number');
assert.ok(typeof audit.summary.approved === 'number', 'audit.summary.approved must be a number');
assert.ok(typeof audit.summary.blocked === 'number',  'audit.summary.blocked must be a number');
// After purge, blocked and review must be empty — their files no longer exist on disk.
assert.equal(audit.blocked.length, 0, `Post-purge audit must have 0 blocked entries, found: ${audit.blocked.map(e=>e.slug).join(', ')}`);
assert.equal(audit.review.length,  0, `Post-purge audit must have 0 review entries, found: ${audit.review.map(e=>e.slug).join(', ')}`);

console.log(`✓ Audit file is valid (${audit.approved.length} approved, ${audit.blocked.length} blocked, ${audit.review.length} review)`);

// ── 4. Classifier correctly identifies synthetic slugs as BLOCKED ─────────────
// (The files are purged from disk, so the audit won't contain them.
//  We verify the gate classifier still works correctly via classifySlug.)

for (const slug of syntheticSlugs) {
  const result = gate.classifySlug(slug, canon);
  assert.equal(
    result.status,
    gate.STATUS.BLOCKED_SYNTHETIC_SLUG,
    `classifySlug(${slug}) must return BLOCKED_SYNTHETIC_SLUG, got ${result.status}: ${result.reason}`
  );
  assert.ok(result.reason && result.reason.length > 0, `classifySlug(${slug}) must return a reason`);
}

console.log(`✓ Classifier correctly identifies all synthetic slugs as BLOCKED_SYNTHETIC_SLUG`);

// ── 5. Non-approved pages must NOT appear in wiki-index.json (entry.url) ─────

for (const nonApprovedUrl of nonApprovedUrlSet) {
  assert.ok(
    !wikiIndexUrls.has(nonApprovedUrl),
    `Non-approved page leaked into wiki-index.json: ${nonApprovedUrl}`
  );
}

// Regression: specific named slugs
for (const slug of [...syntheticSlugs, 'graffpunks-24-7', 'graffpunks-247', 'hodl-wars-game']) {
  const url = `/wiki/${slug}.html`;
  assert.ok(!wikiIndexUrls.has(url), `wiki-index.json must not contain non-approved page: ${url}`);
}

console.log(`✓ No non-approved pages appear in wiki-index.json`);

// ── 6. Non-approved URLs must NOT appear as alias.url in wiki-index.json ──────

for (const entry of wikiIndex) {
  for (const alias of (entry.aliases || [])) {
    if (alias && typeof alias === 'object' && alias.url) {
      assert.ok(
        !nonApprovedUrlSet.has(alias.url),
        `Non-approved URL leaked into wiki-index.json as alias.url for "${entry.url}": ${alias.url}`
      );
    }
  }
}

console.log(`✓ No non-approved URLs appear as alias.url in wiki-index.json`);

// ── 7. Non-approved pages must NOT appear in entity-map.json ─────────────────

if (entityMap.length > 0) {
  for (const record of entityMap) {
    assert.ok(
      !nonApprovedUrlSet.has(record.canonical_url),
      `Non-approved URL leaked into entity-map.json as canonical_url: ${record.canonical_url}`
    );
    for (const srcUrl of (record.source_urls || [])) {
      assert.ok(
        !nonApprovedUrlSet.has(srcUrl),
        `Non-approved URL leaked into entity-map.json source_urls for "${record.canonical_url}": ${srcUrl}`
      );
    }
  }
  console.log(`✓ No non-approved pages or URLs appear in entity-map.json`);
} else {
  console.log(`  (entity-map.json empty or missing — skipping entity-map check)`);
}

// ── 8. Non-approved pages must NOT appear in entity-graph.json ───────────────

if (Object.keys(entityGraph).length > 0) {
  for (const [nodeUrl, nodeData] of Object.entries(entityGraph)) {
    assert.ok(
      !nonApprovedUrlSet.has(nodeUrl),
      `Non-approved URL leaked into entity-graph.json as a node key: ${nodeUrl}`
    );
    for (const rel of (nodeData.related_pages || [])) {
      assert.ok(
        !nonApprovedUrlSet.has(rel.target_url),
        `Non-approved URL leaked into entity-graph.json as related_pages target_url for "${nodeUrl}": ${rel.target_url}`
      );
    }
  }
  console.log(`✓ No non-approved pages appear as nodes or targets in entity-graph.json`);
} else {
  console.log(`  (entity-graph.json empty or missing — skipping entity-graph check)`);
}

// ── 9. Real brand pages DO appear in wiki-index.json ─────────────────────────

for (const slug of approvedSlugs) {
  const url = `/wiki/${slug}.html`;
  const filePath = path.join(ROOT, 'wiki', `${slug}.html`);
  if (!fs.existsSync(filePath)) continue;
  assert.ok(
    wikiIndexUrls.has(url),
    `Approved page ${url} is missing from wiki-index.json`
  );
}

console.log(`✓ All real brand pages that exist on disk appear in wiki-index.json`);

// ── 10. Hard CI gate: no non-approved pages on disk have leaked into wiki-index ─

const WIKI_DIR = path.join(ROOT, 'wiki');
const wikiFiles = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.html'));
const leakedUrls = [];

for (const file of wikiFiles) {
  const slug = file.replace(/\.html$/, '');
  const url  = `/wiki/${file}`;
  const result = gate.classifySlug(slug, canon);
  // Any non-approved status must not appear in the index
  if (result.status !== gate.STATUS.APPROVED_CANON_PAGE &&
      result.status !== gate.STATUS.APPROVED_ALIAS_REDIRECT) {
    if (wikiIndexUrls.has(url)) {
      leakedUrls.push(`${url} [${result.status}]`);
    }
  }
}

assert.equal(
  leakedUrls.length,
  0,
  `CI FAIL: ${leakedUrls.length} non-approved page(s) have leaked into wiki-index.json:\n  ${leakedUrls.join('\n  ')}\n` +
  `Add to brand-canon/approved-pages.json to approve, or remove the pages.`
);

console.log(`✓ CI gate: no non-approved pages have leaked into wiki-index.json`);

// ── 11. Hard CI gate: banned synthetic patterns must NOT exist on disk ────────

const BANNED_DISK_PATTERNS = [
  /^.+-via-.+\.html$/,
  /^.+-token-via-.+\.html$/,
  /^.+-tokens-via-.+\.html$/,
  /^.+-nfts-via-.+\.html$/,
  /^.+-graffpunks-via-.+\.html$/,
  /^.+-hodl-via-.+\.html$/,
  /^.+-kid-via-.+\.html$/,
];

const bannedOnDisk = wikiFiles.filter(file =>
  BANNED_DISK_PATTERNS.some(re => re.test(file))
);

assert.equal(
  bannedOnDisk.length,
  0,
  `CI FAIL: ${bannedOnDisk.length} banned synthetic wiki file(s) still exist on disk:\n` +
  `  ${bannedOnDisk.join('\n  ')}\n` +
  `Run: node scripts/purge-unapproved-wiki-pages.js`
);

console.log(`✓ CI gate: no banned synthetic (*-via-* etc.) files exist on disk`);

// ── 12. Hard CI gate: no blocked or review pages must remain on disk ──────────
// Uses the audit (produced by classifyPage, which reads HTML content) as ground
// truth, so alias redirects detected by content are not mis-flagged.

const auditApprovedSet = new Set((audit.approved || []).map(e => e.slug));
const nonApprovedOnDisk = [];
for (const file of wikiFiles) {
  const slug = file.replace(/\.html$/, '');
  if (!auditApprovedSet.has(slug)) {
    // Slug is not in the audit approved list — it's blocked, review, or unscanned.
    // This is a CI failure: junk files must not exist on disk.
    nonApprovedOnDisk.push(file);
  }
}

assert.equal(
  nonApprovedOnDisk.length,
  0,
  `CI FAIL: ${nonApprovedOnDisk.length} non-approved wiki page(s) still exist on disk:\n` +
  `  ${nonApprovedOnDisk.join('\n  ')}\n` +
  `Run: node scripts/purge-unapproved-wiki-pages.js`
);

console.log(`✓ CI gate: no non-approved (blocked/review) wiki pages remain on disk`);

// ── 13. Purge summary must be counts-only and consistent ─────────────────────
// Ensures js/wiki-purge-summary.json is emitted in counts-only mode and that
// stale references were cleaned up after purge + regeneration.

const PURGE_SUMMARY_PATH = path.join(ROOT, 'js', 'wiki-purge-summary.json');
if (fs.existsSync(PURGE_SUMMARY_PATH)) {
  const purgeSummary = JSON.parse(fs.readFileSync(PURGE_SUMMARY_PATH, 'utf8'));
  const allowedKeys = new Set([
    'scanned_pages',
    'deleted_noise_pages',
    'protected_pages',
    'stale_references_remaining',
  ]);
  for (const key of Object.keys(purgeSummary)) {
    assert.ok(
      allowedKeys.has(key),
      `CI FAIL: wiki-purge-summary.json must be counts-only. Unexpected key: ${key}`
    );
  }
  for (const key of allowedKeys) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(purgeSummary, key),
      `CI FAIL: wiki-purge-summary.json missing required key: ${key}`
    );
    assert.equal(
      typeof purgeSummary[key],
      'number',
      `CI FAIL: wiki-purge-summary.json key "${key}" must be numeric`
    );
  }
  const summaryBlocked = purgeSummary.stale_references_remaining;
  assert.equal(
    summaryBlocked,
    0,
    `CI FAIL: wiki-purge-summary.json reports ${summaryBlocked} stale reference(s) remaining.\n` +
    `Run: node scripts/audit-and-purge-stale-sam-noise.js and regenerate assets.`
  );
  console.log(`✓ CI gate: purge summary is counts-only and reports no stale references`);
} else {
  console.log(`  (js/wiki-purge-summary.json missing — skipping purge consistency check)`);
}

// ── 14. Entity-graph related_pages per node must be bounded ──────────────────
// Ensures js/entity-graph.json was generated with the MAX_OUTPUT_RELATED_PER_PAGE
// cap (currently 20) so it cannot balloon when many pages are approved at once.

const ENTITY_GRAPH_MAX_RELATED = 20;
if (Object.keys(entityGraph).length > 0) {
  let overflowNodes = [];
  for (const [nodeUrl, nodeData] of Object.entries(entityGraph)) {
    const count = (nodeData.related_pages || []).length;
    if (count > ENTITY_GRAPH_MAX_RELATED) {
      overflowNodes.push(`${nodeUrl} (${count})`);
    }
  }
  assert.equal(
    overflowNodes.length,
    0,
    `CI FAIL: ${overflowNodes.length} entity-graph node(s) exceed the ${ENTITY_GRAPH_MAX_RELATED}-entry ` +
    `related_pages cap:\n  ${overflowNodes.join('\n  ')}\n` +
    `Regenerate: node scripts/generate-entity-graph.js`
  );
  const totalRelated = Object.values(entityGraph).reduce((s, v) => s + (v.related_pages || []).length, 0);
  console.log(`✓ CI gate: entity-graph related_pages bounded (≤${ENTITY_GRAPH_MAX_RELATED}/node, ${totalRelated} total)`);
} else {
  console.log(`  (entity-graph.json empty or missing — skipping size-bound check)`);
}

// ── Done ──────────────────────────────────────────────────────────────────────

console.log('\n✅ wiki-publish-gate.test.mjs — all checks passed');

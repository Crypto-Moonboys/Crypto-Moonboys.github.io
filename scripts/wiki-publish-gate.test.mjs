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
assert.ok(audit.blocked.length > 0, 'audit.blocked must contain at least one entry');

for (const entry of audit.blocked) {
  assert.ok(typeof entry.slug === 'string' && entry.slug.length > 0, `blocked entry missing slug: ${JSON.stringify(entry)}`);
  assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0, `blocked entry for ${entry.slug} missing reason`);
  assert.ok(typeof entry.status === 'string', `blocked entry for ${entry.slug} missing status`);
}

console.log(`✓ Audit file is valid (${audit.approved.length} approved, ${audit.blocked.length} blocked, ${audit.review.length} review)`);

// ── 4. Audit lists synthetic pages as blocked with reasons ───────────────────

for (const slug of syntheticSlugs) {
  const entry = auditEntry(slug);
  assert.ok(entry !== null, `Audit file must contain an entry for ${slug}`);
  assert.equal(
    entry.status,
    gate.STATUS.BLOCKED_SYNTHETIC_SLUG,
    `Audit entry for ${slug} must be BLOCKED_SYNTHETIC_SLUG, got ${entry.status}`
  );
  assert.ok(entry.reason && entry.reason.length > 0, `Audit entry for ${slug} must have a reason`);
}

console.log(`✓ Audit file correctly lists all synthetic pages with BLOCKED_SYNTHETIC_SLUG status`);

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

// ── Done ──────────────────────────────────────────────────────────────────────

console.log('\n✅ wiki-publish-gate.test.mjs — all checks passed');

#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  ALIAS_TO_CANONICAL,
  canonicalizeSlug,
  canonicalizeWikiUrl,
  isAliasSlug,
  getAliasesForCanonicalSlug,
  titleFromSlug,
} = require('./wiki-aliases.js');

const {
  classifyWikiSlug,
  isTrueAliasSlug,
  getConceptType,
} = require('./wiki-brand-taxonomy.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wikiIndexPath = path.join(ROOT, 'js', 'wiki-index.json');
const wikiIndex = JSON.parse(fs.readFileSync(wikiIndexPath, 'utf8'));
const alfieAliasPath = path.join(ROOT, 'wiki', 'alfie-blaze.html');
const alfieCanonicalPath = path.join(ROOT, 'wiki', 'alfie-bitcoin-kid-blaze.html');
const graffpunksEcosystemPath = path.join(ROOT, 'wiki', 'graffpunks-ecosystem.html');

// ── Safe alias collapses (same brand, same concept type) ──────────────────

assert.equal(canonicalizeSlug('graffpunks-247-radio'), 'graffpunks-24-7-radio');
assert.equal(canonicalizeSlug('graffpunks-247'), 'graffpunks-24-7-radio');
assert.equal(canonicalizeSlug('graffpunks-24-7'), 'graffpunks-24-7-radio');
assert.equal(canonicalizeSlug('graffpunks-247-blockchain-radio-station'), 'graffpunks-24-7-radio');
assert.equal(canonicalizeSlug('the-graffpunks'), 'graffpunks');
assert.equal(canonicalizeSlug('  HODL-WARS-GAME  '), 'hodl-wars');
assert.equal(canonicalizeSlug('hodl-x-warriors'), 'hodl-x-warriors');
assert.equal(canonicalizeSlug('midevil-hero-arena'), 'midevil-hero-arena');
assert.equal(canonicalizeSlug('1m-free-nfts-programme'), '1m-free-nfts-program');
assert.equal(canonicalizeSlug('one-million-free-nfts'), '1m-free-nfts-program');

// ── Unsafe collapses must NOT happen (different concept types) ────────────

assert.equal(canonicalizeSlug('graffpunks-collection'), 'graffpunks-collection', 'collection must stay separate from faction');
assert.equal(canonicalizeSlug('midevilpunks'), 'midevilpunks', 'game must stay separate from graffpunks faction');
assert.equal(canonicalizeSlug('graffpunks-24-7-radio'), 'graffpunks-24-7-radio', 'radio must stay separate from graffpunks faction');
assert.equal(canonicalizeSlug('nbg-token'), 'nbg-token', 'token must stay separate from nbg brand');
assert.equal(canonicalizeSlug('nbgx'), 'nbgx-token', 'nbgx routes to the canonical token page and stays separate from nbg brand');
assert.equal(canonicalizeSlug('nbg'), 'nbg');
assert.equal(canonicalizeSlug('hodl-warriors'), 'hodl-warriors', 'faction must stay separate from hodl-wars game');
assert.equal(canonicalizeSlug('hodl-wars'), 'hodl-wars', 'game must stay separate from hodl-warriors faction');

// ── URL canonicalization ──────────────────────────────────────────────────

assert.equal(canonicalizeWikiUrl('/wiki/graffpunks-247.html'), '/wiki/graffpunks-24-7-radio.html');
assert.equal(canonicalizeWikiUrl('/wiki/graffpunks-247?from=search#card'), '/wiki/graffpunks-24-7-radio.html');
assert.equal(canonicalizeWikiUrl('/wiki/graffpunks-247-radio.html'), '/wiki/graffpunks-24-7-radio.html');
assert.equal(canonicalizeWikiUrl('/wiki/the-graffpunks.html'), '/wiki/graffpunks.html');
assert.equal(canonicalizeWikiUrl('/search.html?q=graffpunks-247'), '/search.html?q=graffpunks-247');

// ── isAliasSlug / isTrueAliasSlug ────────────────────────────────────────

assert.equal(isAliasSlug('hodl-wars-game'), true);
assert.equal(isAliasSlug('hodl-wars'), false);
assert.equal(isAliasSlug('nbg-token'), false, 'nbg-token is not an alias; it is a separate concept');
assert.equal(isTrueAliasSlug('nbgx'), true, 'nbgx is an alias for the canonical nbgx-token page');
assert.equal(isTrueAliasSlug('graffpunks-247'), true);
assert.equal(isTrueAliasSlug('graffpunks-collection'), false, 'collection is a separate concept, not an alias');
assert.equal(isTrueAliasSlug('midevilpunks'), false, 'game is a separate concept, not an alias');

// ── getAliasesForCanonicalSlug ────────────────────────────────────────────

assert.deepEqual(getAliasesForCanonicalSlug('hodl-wars'), ['hodl-wars-game']);
assert.deepEqual(
  getAliasesForCanonicalSlug('graffpunks-24-7-radio').sort(),
  ['graffpunks-24-7', 'graffpunks-247', 'graffpunks-247-blockchain-radio-station', 'graffpunks-247-radio'],
);
assert.deepEqual(getAliasesForCanonicalSlug('graffpunks').sort(), ['the-graffpunks']);

// ── Concept types via taxonomy ────────────────────────────────────────────

assert.equal(getConceptType('graffpunks'), 'faction');
assert.equal(getConceptType('graffpunks-24-7-radio'), 'radio');
assert.equal(getConceptType('graffpunks-collection'), 'collection');
assert.equal(getConceptType('midevilpunks'), 'game');
assert.equal(getConceptType('hodl-warriors'), 'faction');
assert.equal(getConceptType('hodl-wars'), 'game');
assert.equal(getConceptType('nbg'), 'brand');
assert.equal(getConceptType('nbg-token'), 'token');
assert.equal(getConceptType('nbgx'), 'mechanic');
assert.equal(getConceptType('nbgx-token'), 'mechanic');

// ── classifyWikiSlug works through aliases ────────────────────────────────

const radioMeta = classifyWikiSlug('graffpunks-247');
assert.ok(radioMeta, 'graffpunks-247 should resolve to brand metadata via alias');
assert.equal(radioMeta.concept_type, 'radio');
assert.equal(radioMeta.canonical_slug, 'graffpunks-24-7-radio');
assert.equal(radioMeta.brand_family, 'graffpunks');

// ── titleFromSlug ─────────────────────────────────────────────────────────

assert.equal(titleFromSlug('graffpunks-24-7'), 'Graffpunks 24 7');

// Alfie short URL remains as a safe redirect alias, not a duplicate canon page.
assert.ok(fs.existsSync(alfieAliasPath), '/wiki/alfie-blaze.html must remain as a non-404 alias page');
assert.ok(fs.existsSync(alfieCanonicalPath), '/wiki/alfie-bitcoin-kid-blaze.html must remain the main canonical page');
const alfieAliasHtml = fs.readFileSync(alfieAliasPath, 'utf8');
const alfieCanonicalHtml = fs.readFileSync(alfieCanonicalPath, 'utf8');
const graffpunksEcosystemHtml = fs.readFileSync(graffpunksEcosystemPath, 'utf8');
assert.ok(
  alfieAliasHtml.includes('https://cryptomoonboys.com/wiki/alfie-bitcoin-kid-blaze.html'),
  'Alfie alias page must use the canonical Alfie Bitcoin Kid Blaze URL'
);
assert.ok(
  alfieAliasHtml.includes('/wiki/alfie-bitcoin-kid-blaze.html'),
  'Alfie alias page must redirect to the canonical Alfie Bitcoin Kid Blaze path'
);
assert.ok(
  alfieAliasHtml.includes('Alfie Blaze has moved to Alfie Bitcoin Kid Blaze'),
  'Alfie alias page must include a visible fallback link'
);
assert.ok(
  !alfieAliasHtml.includes('SAM:BEGIN') && !alfieAliasHtml.includes('lore-paragraph'),
  'Alfie alias page must not contain duplicate SAM/canon article content'
);
assert.ok(
  alfieCanonicalHtml.includes('https://cryptomoonboys.com/wiki/alfie-bitcoin-kid-blaze.html'),
  'Alfie Bitcoin Kid Blaze page must remain self-canonical'
);
assert.ok(
  graffpunksEcosystemHtml.includes('/wiki/alfie-bitcoin-kid-blaze.html'),
  'Graffpunks ecosystem hub must point to the canonical Alfie page'
);
assert.ok(
  !graffpunksEcosystemHtml.includes('/wiki/alfie-blaze.html'),
  'Graffpunks ecosystem hub must not link to the old Alfie alias'
);

// ── wiki-index invariants ─────────────────────────────────────────────────

// Every entry mapped by ALIAS_TO_CANONICAL must have:
//   • exactly one canonical wiki-index entry for the canonical URL
//   • no separate wiki-index entry for the alias URL
for (const [aliasSlug, canonicalSlug] of Object.entries(ALIAS_TO_CANONICAL)) {
  const aliasUrl = `/wiki/${aliasSlug}.html`;
  const canonicalUrl = `/wiki/${canonicalSlug}.html`;

  assert.equal(canonicalizeWikiUrl(aliasUrl), canonicalUrl);

  const canonicalMatches = wikiIndex.filter(entry => entry.url === canonicalUrl).length;
  assert.equal(canonicalMatches, 1, `expected one canonical wiki-index entry for ${canonicalUrl}`);
  assert.equal(
    wikiIndex.some(entry => entry.url === aliasUrl),
    false,
    `unexpected alias wiki-index entry found for ${aliasUrl}`,
  );
}

// Concept pages that must remain as separate canonical search cards
const mustBeSeparate = [
  ['/wiki/graffpunks.html', '/wiki/graffpunks-collection.html'],
  ['/wiki/graffpunks.html', '/wiki/midevilpunks.html'],
  ['/wiki/graffpunks.html', '/wiki/graffpunks-24-7-radio.html'],
  ['/wiki/nbg.html', '/wiki/nbg-token.html'],
  ['/wiki/nbg.html', '/wiki/nbgx-token.html'],
  ['/wiki/hodl-warriors.html', '/wiki/hodl-wars.html'],
];

for (const [urlA, urlB] of mustBeSeparate) {
  const entryA = wikiIndex.find(e => e.url === urlA);
  const entryB = wikiIndex.find(e => e.url === urlB);
  assert.ok(entryA, `expected separate wiki-index entry for ${urlA}`);
  assert.ok(entryB, `expected separate wiki-index entry for ${urlB}`);
  assert.notEqual(entryA.url, entryB.url, `${urlA} and ${urlB} must not be collapsed into the same entry`);
}

// No duplicate alias titles within a single entry
for (const entry of wikiIndex) {
  const seen = new Set();
  for (const alias of entry.aliases || []) {
    const title = String(alias && alias.title ? alias.title : '').trim().toLowerCase();
    if (!title) continue;
    assert.equal(seen.has(title), false, `duplicate alias title "${title}" on ${entry.url}`);
    seen.add(title);
  }
}

// ── parent_concept hierarchy (no self-parent cycles) ─────────────────────

const graffpunksFactionMeta = classifyWikiSlug('graffpunks');
assert.ok(graffpunksFactionMeta, 'graffpunks faction should have brand metadata');
assert.notEqual(graffpunksFactionMeta.parent_concept, 'graffpunks', 'graffpunks top-level faction must not self-parent');
// graffpunks parent is gkniftyheads (brand.parent)
assert.equal(graffpunksFactionMeta.parent_concept, 'gkniftyheads', 'graffpunks faction parent should be gkniftyheads');

const nbgBrandMeta = classifyWikiSlug('nbg');
assert.ok(nbgBrandMeta, 'nbg brand should have brand metadata');
assert.notEqual(nbgBrandMeta.parent_concept, 'nbg', 'nbg top-level brand must not self-parent');

// Sibling concepts (non-top-level) should point to the brand canonical
const graffpunksRadioMeta = classifyWikiSlug('graffpunks-24-7-radio');
assert.ok(graffpunksRadioMeta, 'graffpunks radio should have brand metadata');
assert.equal(graffpunksRadioMeta.parent_concept, 'graffpunks', 'radio sibling should point to graffpunks brand canonical');

const nbgTokenMeta = classifyWikiSlug('nbg-token');
assert.ok(nbgTokenMeta, 'nbg-token should have brand metadata');
// nbg has no brand-level canonical, so parent_concept is null for all nbg concepts
assert.equal(nbgTokenMeta.parent_concept, null, 'nbg-token parent_concept should be null when brand has no canonical');

// ── brand_family uses stable lowercase/kebab-case id ─────────────────────

const oneMFreeNftsMeta = classifyWikiSlug('1m-free-nfts-program');
assert.ok(oneMFreeNftsMeta, '1m-free-nfts-program should have brand metadata');
assert.equal(oneMFreeNftsMeta.brand_family, 'one-million-free-nfts', 'oneMillionFreeNfts brand_family must emit kebab-case id');
assert.equal(oneMFreeNftsMeta.canonical_concept_id, 'one-million-free-nfts:program', 'canonical_concept_id must use kebab-case brand id');

console.log('wiki alias canonicalization checks passed.');


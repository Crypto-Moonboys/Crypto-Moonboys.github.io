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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wikiIndexPath = path.join(ROOT, 'js', 'wiki-index.json');
const wikiIndex = JSON.parse(fs.readFileSync(wikiIndexPath, 'utf8'));

assert.equal(canonicalizeSlug('graffpunks-247'), 'graffpunks-24-7');
assert.equal(canonicalizeSlug('  HODL-WARS-GAME  '), 'hodl-wars');
assert.equal(canonicalizeSlug('nbg'), 'nbg');

assert.equal(canonicalizeWikiUrl('/wiki/graffpunks-247.html'), '/wiki/graffpunks-24-7.html');
assert.equal(canonicalizeWikiUrl('/wiki/graffpunks-247?from=search#card'), '/wiki/graffpunks-24-7.html');
assert.equal(canonicalizeWikiUrl('/search.html?q=graffpunks-247'), '/search.html?q=graffpunks-247');

assert.equal(isAliasSlug('hodl-wars-game'), true);
assert.equal(isAliasSlug('hodl-wars'), false);

assert.deepEqual(getAliasesForCanonicalSlug('hodl-wars'), ['hodl-wars-game']);
assert.equal(titleFromSlug('graffpunks-24-7'), 'Graffpunks 24 7');

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

for (const entry of wikiIndex) {
  const seen = new Set();
  for (const alias of entry.aliases || []) {
    const title = String(alias && alias.title ? alias.title : '').trim().toLowerCase();
    if (!title) continue;
    assert.equal(seen.has(title), false, `duplicate alias title "${title}" on ${entry.url}`);
    seen.add(title);
  }
}

console.log('wiki alias canonicalization checks passed.');

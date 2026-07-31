#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'js', 'wiki-index.json');
const SYNONYMS_PATH = path.join(ROOT, 'js', 'wiki-search-synonyms.json');

assert.ok(fs.existsSync(INDEX_PATH), 'Missing js/wiki-index.json');
assert.ok(fs.existsSync(SYNONYMS_PATH), 'Missing js/wiki-search-synonyms.json');

const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
const synonymsByUrl = JSON.parse(fs.readFileSync(SYNONYMS_PATH, 'utf8'));

assert.ok(Array.isArray(index), 'js/wiki-index.json must be an array');
assert.ok(synonymsByUrl && typeof synonymsByUrl === 'object' && !Array.isArray(synonymsByUrl), 'wiki-search-synonyms.json must be an object');

const entriesByUrl = new Map(index.map((entry) => [String(entry?.url || '').trim(), entry]));
let applied = 0;

for (const [url, rawTerms] of Object.entries(synonymsByUrl)) {
  const entry = entriesByUrl.get(url);
  assert.ok(entry, `Search synonym target is not present in wiki index: ${url}`);
  assert.ok(Array.isArray(rawTerms) && rawTerms.length > 0, `Search synonyms must be a non-empty array: ${url}`);

  const terms = [...new Set(rawTerms.map((term) => String(term || '').trim().toLowerCase()).filter(Boolean))].sort();
  assert.ok(terms.length > 0, `Search synonyms contain no usable terms: ${url}`);

  const searchIndex = entry.search_index && typeof entry.search_index === 'object'
    ? entry.search_index
    : {};
  const keywordBag = Array.isArray(searchIndex.keyword_bag)
    ? searchIndex.keyword_bag.map((term) => String(term || '').trim().toLowerCase()).filter(Boolean)
    : [];

  entry.search_synonyms = terms;
  searchIndex.keyword_bag = [...new Set([...keywordBag, ...terms])].sort();
  entry.search_index = searchIndex;
  applied += terms.length;
}

fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`Applied ${applied} canonical search synonym(s) across ${Object.keys(synonymsByUrl).length} wiki page(s).`);

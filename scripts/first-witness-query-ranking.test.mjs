import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8'));
const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to',
  'was', 'were', 'with'
]);

function tokenize(query) {
  return String(query || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function score(item, query) {
  const tokens = tokenize(query);
  const normalizedQuery = tokens.join(' ');
  const title = String(item.title || '').toLowerCase();
  const tags = (item.tags || []).join(' ').toLowerCase();
  const category = String(item.category || '').toLowerCase();
  const slug = String(item.url || '').toLowerCase()
    .replace(/^\/wiki\//, '').replace(/\.html$/i, '').replace(/[-_]/g, ' ');
  const description = [item.desc || '', item.description || '', item.excerpt || '', item.summary || '', item.meta_description || ''].join(' ').toLowerCase();
  const searchIndex = item.search_index || {};
  const searchTokens = (searchIndex.tokens || []).join(' ').toLowerCase();
  const keywordBag = (searchIndex.keyword_bag || []).join(' ').toLowerCase();
  const normalizedTitle = String(searchIndex.normalized_title || '').toLowerCase();

  let queryScore = 0;
  let matched = 0;

  if (tokens.length > 1) {
    const normalizedVisibleTitle = title.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
    if (normalizedVisibleTitle.includes(normalizedQuery) || normalizedTitle.includes(normalizedQuery)) queryScore += 30;
  }

  for (const token of tokens) {
    let hit = false;
    const corpusMatch = token.length >= 3 && !stopWords.has(token);
    if (title.includes(token) || normalizedTitle.includes(token)) { queryScore += 40; hit = true; }
    if (tags.includes(token) || searchTokens.includes(token)) { queryScore += 30; hit = true; }
    if (slug.includes(token)) { queryScore += 20; hit = true; }
    if (category.includes(token)) { queryScore += 15; hit = true; }
    if (corpusMatch && description.includes(token)) { queryScore += 15; hit = true; }
    if (corpusMatch && keywordBag.includes(token)) { queryScore += 10; hit = true; }
    if (hit) matched += 1;
  }

  return {
    matched,
    total: tokens.length,
    final: (queryScore * 2.5) + Number(item.rank_score || 0),
  };
}

function topResult(query) {
  return index
    .map(item => ({ item, score: score(item, query) }))
    .filter(result => result.score.matched > 0 && result.score.matched >= result.score.total)
    .sort((a, b) => b.score.final - a.score.final || b.item.rank_score - a.item.rank_score || String(a.item.title).localeCompare(String(b.item.title)))[0]?.item;
}

const expectations = new Map([
  ['bible', '/wiki/the-first-witness.html'],
  ['GK bible', '/wiki/the-first-witness.html'],
  ['religion', '/wiki/the-first-witness.html'],
  ['philosophy', '/wiki/the-first-witness.html'],
  ['first witness', '/wiki/the-first-witness.html'],
  ['bitcoin witness', '/wiki/first-witness-bitcoin-witness.html'],
  ['sacred chain origin', '/wiki/first-witness-sacred-fork.html'],
  ['2880 triple fork', '/wiki/first-witness-triple-fork-chainfire.html'],
  ['alfie blaze prophecy', '/wiki/first-witness-child-of-fire.html'],
  ['bitcoin kid prophecy', '/wiki/first-witness-child-of-fire.html'],
  ['null erasure', '/wiki/first-witness-null-erasure.html'],
  ['block topia religion', '/wiki/first-witness-block-topia-reading.html'],
]);

for (const [query, expectedUrl] of expectations) {
  const result = topResult(query);
  assert.ok(result, `no result for query "${query}"`);
  assert.equal(result.url, expectedUrl, `unexpected top result for "${query}": ${result.url}`);
}

console.log(`First Witness query ranking contract OK: ${expectations.size} intent queries.`);

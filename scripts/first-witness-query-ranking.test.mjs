import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
let index = JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8'));
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

function rankedResults(query, limit = 10) {
  return index
    .map(item => ({ item, score: score(item, query) }))
    .filter(result => result.score.matched > 0 && result.score.matched >= result.score.total)
    .sort((a, b) => b.score.final - a.score.final || b.item.rank_score - a.item.rank_score || String(a.item.title).localeCompare(String(b.item.title)))
    .slice(0, limit)
    .map(result => result.item);
}

const topExpectations = new Map([
  ['bible', '/wiki/the-first-witness.html'],
  ['GK bible', '/wiki/the-first-witness.html'],
  ['religion', '/wiki/the-first-witness.html'],
  ['philosophy', '/wiki/the-first-witness.html'],
  ['first witness', '/wiki/the-first-witness.html'],
  ['sacred chain origin', '/wiki/first-witness-sacred-fork.html'],
  ['2880 triple fork', '/wiki/first-witness-triple-fork-chainfire.html'],
  ['alfie blaze prophecy', '/wiki/first-witness-child-of-fire.html'],
  ['bitcoin kid prophecy', '/wiki/first-witness-child-of-fire.html'],
  ['null erasure', '/wiki/first-witness-null-erasure.html'],
]);

for (const [query, expectedUrl] of topExpectations) {
  const result = rankedResults(query, 1)[0];
  assert.ok(result, `no result for query "${query}"`);
  assert.equal(result.url, expectedUrl, `unexpected top result for "${query}": ${result.url}`);
}

const strongPresenceExpectations = new Map([
  ['bitcoin witness', '/wiki/first-witness-bitcoin-witness.html'],
  ['block topia religion', '/wiki/first-witness-block-topia-reading.html'],
]);

for (const [query, expectedUrl] of strongPresenceExpectations) {
  const results = rankedResults(query, 3);
  assert.ok(results.length, `no results for query "${query}"`);
  assert.ok(
    results.some(result => result.url === expectedUrl),
    `expected ${expectedUrl} in top 3 for "${query}", got: ${results.map(result => result.url).join(', ')}`
  );
}

console.log(`First Witness query ranking contract OK: ${topExpectations.size + strongPresenceExpectations.size} intent queries.`);

// Exercise the real generator without writing repository files. A growing wiki
// may add thousands of legitimate links to reference articles and tool pages;
// those links must not displace a more specific First Witness intent match.
{
  const generatorPath = path.join(ROOT, 'scripts/generate-wiki-index.js');
  const graphPath = path.join(ROOT, 'js/link-graph.json');
  const outputPath = path.join(ROOT, 'js/wiki-index.json');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const incoming = 10000;
  for (const [url, node] of Object.entries(graph)) {
    if (!url.includes('/first-witness-') && url !== '/wiki/the-first-witness.html') {
      node.inbound_count = incoming;
    }
  }
  graph['/about.html'] = { ...graph['/about.html'], inbound_count: incoming };
  const boundaries = [
    ['/wiki/the-nomad-bears.html', 0, 0, 0],
    ['/wiki/the-salvagers.html', 20, 0, 40],
    ['/wiki/the-og-pixel-saints.html', 24, 3, 50],
    ['/sam.html', 0, 0, 0],
    ['/hubs.html', 25, 1, 50]
  ];
  for (const [url, inbound, outbound] of boundaries) {
    graph[url] = { ...graph[url], inbound_count: inbound, existing_outbound: Array.from({ length: outbound }, (_, i) => `/fixture/${i}`) };
  }
  let generated;
  const fileSystem = {
    ...fs,
    readFileSync(file, ...args) {
      if (path.resolve(String(file)) === graphPath) return JSON.stringify(graph);
      return fs.readFileSync(file, ...args);
    },
    writeFileSync(file, contents) {
      assert.equal(path.resolve(String(file)), outputPath, 'fixture must only capture the index');
      generated = String(contents);
    }
  };
  const requireFromGenerator = createRequire(generatorPath);
  const source = fs.readFileSync(generatorPath, 'utf8');
  const run = new vm.Script(`(function(require, __dirname, __filename, console) {\n${source}\n})`, { filename: generatorPath }).runInThisContext();
  run(name => name === 'fs' ? fileSystem : requireFromGenerator(name), path.dirname(generatorPath), generatorPath, { log() {}, warn: console.warn, error: console.error });
  assert.ok(generated, 'real generator produces the stress index');
  index = JSON.parse(generated);
  for (const item of index) {
    assert.ok(item.rank_diagnostics.authority_graph_points <= 50, `${item.url}: bounded link contribution`);
  }
  for (const url of ['/wiki/triple-fork-event.html', '/about.html']) {
    const item = index.find(entry => entry.url === url);
    assert.equal(item.link_score.inbound_count, incoming, `${url}: full link count retained`);
    assert.ok(item.link_score.authority >= incoming * 2, `${url}: full authority measurement retained`);
    assert.equal(item.rank_diagnostics.authority_graph_points, 50, `${url}: graph bonus saturates`);
  }
  for (const [url, inbound, outbound, points] of boundaries) {
    const item = index.find(entry => entry.url === url);
    assert.equal(item.link_score.authority, inbound * 2 + outbound * 0.5, `${url}: boundary measurement retained`);
    assert.equal(item.rank_diagnostics.authority_graph_points, points, `${url}: zero, below-cap and rounding boundary`);
  }
  for (const [query, expectedUrl] of topExpectations) {
    assert.equal(rankedResults(query, 1)[0]?.url, expectedUrl, `link growth must preserve ${query}`);
  }
  for (const [query, expectedUrl] of strongPresenceExpectations) {
    assert.ok(rankedResults(query, 3).some(item => item.url === expectedUrl), `link growth must preserve ${query}`);
  }
  console.log('First Witness intent ranking survives 10,000 incoming links to other pages; full link measurements retained.');
}

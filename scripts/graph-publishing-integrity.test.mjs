#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  assert.ok(fs.existsSync(fullPath), `Missing generated file: ${relativePath}`);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function wikiUrlsFromIndex(index) {
  return index
    .map((entry) => String(entry?.url || '').trim())
    .filter((url) => /^\/wiki\/[^/]+\.html$/i.test(url))
    .sort();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function assertSameValues(actual, expected, label) {
  const actualSorted = uniqueSorted(actual);
  const expectedSorted = uniqueSorted(expected);
  const missing = expectedSorted.filter((value) => !actualSorted.includes(value));
  const unexpected = actualSorted.filter((value) => !expectedSorted.includes(value));

  assert.deepEqual(
    actualSorted,
    expectedSorted,
    `${label} mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`,
  );
}

const wikiIndex = readJson('js/wiki-index.json');
const entityGraph = readJson('js/entity-graph.json');
const graphData = readJson('js/graph-data.json');
const liteGraph = readJson('js/entity-graph-lite.json');
const graphGeneratorSource = fs.readFileSync(path.join(ROOT, 'scripts/generate-graph-data.js'), 'utf8');

assert.ok(Array.isArray(wikiIndex), 'wiki-index.json must be an array');
assert.ok(graphData && Array.isArray(graphData.nodes) && Array.isArray(graphData.edges), 'graph-data.json must contain nodes and edges arrays');
assert.ok(liteGraph && liteGraph.lite === true, 'entity-graph-lite.json must be marked as a lite graph');
assert.ok(Array.isArray(liteGraph.nodes) && Array.isArray(liteGraph.edges), 'entity-graph-lite.json must contain nodes and edges arrays');

const indexedWikiUrls = wikiUrlsFromIndex(wikiIndex);
assert.ok(indexedWikiUrls.length > 0, 'No canonical wiki URLs were found in wiki-index.json');
assert.equal(indexedWikiUrls.length, uniqueSorted(indexedWikiUrls).length, 'wiki-index.json contains duplicate canonical wiki URLs');

const entityGraphUrls = Object.keys(entityGraph).filter((url) => /^\/wiki\/[^/]+\.html$/i.test(url));
const graphWikiNodeIds = graphData.nodes
  .map((node) => String(node?.id || ''))
  .filter((url) => /^\/wiki\/[^/]+\.html$/i.test(url));

assertSameValues(entityGraphUrls, indexedWikiUrls, 'Entity relationship graph versus wiki index');
assertSameValues(graphWikiNodeIds, indexedWikiUrls, 'Visual graph nodes versus wiki index');

const allNodeIds = graphData.nodes.map((node) => String(node?.id || ''));
assert.equal(allNodeIds.length, uniqueSorted(allNodeIds).length, 'graph-data.json contains duplicate node IDs');
const allNodeIdSet = new Set(allNodeIds);

const fullEdgeKeys = new Set();
for (const edge of graphData.edges) {
  assert.ok(allNodeIdSet.has(edge.source), `Graph edge source is missing from nodes: ${edge.source}`);
  assert.ok(allNodeIdSet.has(edge.target), `Graph edge target is missing from nodes: ${edge.target}`);
  assert.notEqual(edge.source, edge.target, `Graph contains a self-edge for ${edge.source}`);
  const key = `${edge.source}||${edge.target}`;
  assert.ok(!fullEdgeKeys.has(key), `Graph contains a duplicate edge: ${key}`);
  fullEdgeKeys.add(key);
}

const indexedWikiUrlSet = new Set(indexedWikiUrls);
for (const [sourceUrl, entry] of Object.entries(entityGraph)) {
  assert.ok(indexedWikiUrlSet.has(sourceUrl), `Entity graph contains an unindexed source: ${sourceUrl}`);
  const relatedPages = Array.isArray(entry?.related_pages) ? entry.related_pages : [];
  assert.ok(relatedPages.length <= 20, `Entity graph source exceeds the 20-related-page cap: ${sourceUrl}`);
  const relatedTargets = new Set();
  for (const relation of relatedPages) {
    const targetUrl = String(relation?.target_url || '');
    assert.ok(indexedWikiUrlSet.has(targetUrl), `Entity graph target is missing from the wiki index: ${sourceUrl} -> ${targetUrl}`);
    assert.notEqual(sourceUrl, targetUrl, `Entity graph contains a self-relation for ${sourceUrl}`);
    assert.ok(!relatedTargets.has(targetUrl), `Entity graph contains a duplicate relation: ${sourceUrl} -> ${targetUrl}`);
    relatedTargets.add(targetUrl);
  }
}

const fullGeneratedAt = Date.parse(graphData.generated_at);
const liteGeneratedAt = Date.parse(liteGraph.generated_at);
assert.ok(Number.isFinite(fullGeneratedAt), 'graph-data.json has an invalid generated_at value');
assert.ok(Number.isFinite(liteGeneratedAt), 'entity-graph-lite.json has an invalid generated_at value');
assert.equal(liteGraph.generated_at, graphData.generated_at, 'Mobile graph must be derived from the same full-graph generation');
assert.ok(Date.now() - fullGeneratedAt >= 0, 'Graph generated_at must not be in the future');
assert.match(graphGeneratorSource, /existingGeneratedAt <= now/,
  'graph generation must not preserve a future existing generated_at timestamp');

const fullVerifiedAt = Date.parse(graphData.verified_at);
const liteVerifiedAt = Date.parse(liteGraph.verified_at);
assert.ok(Number.isFinite(fullVerifiedAt), 'graph-data.json has an invalid or missing verified_at value');
assert.ok(Number.isFinite(liteVerifiedAt), 'entity-graph-lite.json has an invalid or missing verified_at value');
assert.equal(liteGraph.verified_at, graphData.verified_at, 'Mobile graph verified_at must match the full graph');
assert.ok(Date.now() - fullVerifiedAt >= 0, 'Graph verified_at must not be in the future');
assert.match(graphGeneratorSource, /verified_at.*new Date/,
  'graph generation must always write a fresh verified_at timestamp');

if (process.env.GRAPH_MAX_AGE_HOURS) {
  const maxAgeHours = Number(process.env.GRAPH_MAX_AGE_HOURS);
  assert.ok(Number.isFinite(maxAgeHours) && maxAgeHours > 0, 'GRAPH_MAX_AGE_HOURS must be a positive number');
  const ageMs = Date.now() - fullGeneratedAt;
  assert.ok(ageMs <= maxAgeHours * 60 * 60 * 1000, `Graph data is stale by more than ${maxAgeHours} hours`);
}

const liteNodeIds = liteGraph.nodes.map((node) => String(node?.id || ''));
assert.equal(liteNodeIds.length, uniqueSorted(liteNodeIds).length, 'entity-graph-lite.json contains duplicate node IDs');
const liteNodeIdSet = new Set(liteNodeIds);
for (const nodeId of liteNodeIds) {
  assert.ok(allNodeIdSet.has(nodeId), `Lite graph contains a node absent from the full graph: ${nodeId}`);
}

const liteEdgeKeys = new Set();
for (const edge of liteGraph.edges) {
  assert.ok(liteNodeIdSet.has(edge.source), `Lite edge source is missing from lite nodes: ${edge.source}`);
  assert.ok(liteNodeIdSet.has(edge.target), `Lite edge target is missing from lite nodes: ${edge.target}`);
  const key = `${edge.source}||${edge.target}`;
  assert.ok(!liteEdgeKeys.has(key), `Lite graph contains a duplicate edge: ${key}`);
  liteEdgeKeys.add(key);
}

console.log(
  `Graph publishing integrity passed: ${indexedWikiUrls.length} indexed wiki pages, ` +
  `${graphData.nodes.length} total graph nodes, ${graphData.edges.length} edges, ` +
  `${liteGraph.nodes.length} mobile nodes.`,
);

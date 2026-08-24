#!/usr/bin/env node

import assert from 'node:assert/strict';

const SITE_BASE_URL = String(process.env.SITE_BASE_URL || 'https://cryptomoonboys.com').replace(/\/$/, '');
const API_BASE_URL = String(process.env.MOONBOYS_API_BASE_URL || 'https://moonboys-api.sercullen.workers.dev').replace(/\/$/, '');
const MAX_GRAPH_AGE_HOURS = Number(process.env.LIVE_GRAPH_MAX_AGE_HOURS || 24);

async function fetchResponse(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
      'user-agent': 'crypto-moonboys-live-integrity/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `${label} returned HTTP ${response.status}: ${url}`);
  return response;
}

async function fetchJson(pathname, label) {
  const response = await fetchResponse(`${SITE_BASE_URL}${pathname}`, label);
  const contentType = response.headers.get('content-type') || '';
  assert.match(contentType, /json/i, `${label} did not return JSON`);
  return response.json();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

const [wikiIndex, graphData, liteGraph, petsPageResponse, petsLeaderboardResponse] = await Promise.all([
  fetchJson('/js/wiki-index.json', 'Live wiki index'),
  fetchJson('/js/graph-data.json', 'Live full graph'),
  fetchJson('/js/entity-graph-lite.json', 'Live mobile graph'),
  fetchResponse(`${SITE_BASE_URL}/wiki/crypto-moonboy-pets.html`, 'Crypto Moonboy Pets page'),
  fetchResponse(`${API_BASE_URL}/telegram-pets/leaderboard`, 'Crypto Moonboy Pets leaderboard API'),
]);

assert.ok(Array.isArray(wikiIndex), 'Live wiki index is not an array');
assert.ok(Array.isArray(graphData?.nodes) && Array.isArray(graphData?.edges), 'Live full graph has an invalid shape');
assert.ok(liteGraph?.lite === true && Array.isArray(liteGraph?.nodes) && Array.isArray(liteGraph?.edges), 'Live mobile graph has an invalid shape');

const indexedWikiUrls = uniqueSorted(
  wikiIndex
    .map((entry) => String(entry?.url || ''))
    .filter((url) => /^\/wiki\/[^/]+\.html$/i.test(url)),
);
const graphWikiUrls = uniqueSorted(
  graphData.nodes
    .map((node) => String(node?.id || ''))
    .filter((url) => /^\/wiki\/[^/]+\.html$/i.test(url)),
);
assert.deepEqual(graphWikiUrls, indexedWikiUrls, 'Live graph nodes do not match the live canonical wiki index');

const fullNodeIds = new Set(graphData.nodes.map((node) => String(node?.id || '')));
for (const edge of graphData.edges) {
  assert.ok(fullNodeIds.has(edge.source), `Live graph edge source is missing: ${edge.source}`);
  assert.ok(fullNodeIds.has(edge.target), `Live graph edge target is missing: ${edge.target}`);
}

assert.equal(liteGraph.generated_at, graphData.generated_at, 'Live mobile graph was not generated from the current full graph');
assert.equal(liteGraph.verified_at, graphData.verified_at, 'Live mobile graph verified_at does not match the full graph');
const verifiedAt = Date.parse(graphData.verified_at);
assert.ok(Number.isFinite(verifiedAt), 'Live graph verified_at is invalid or missing');
assert.ok(Number.isFinite(MAX_GRAPH_AGE_HOURS) && MAX_GRAPH_AGE_HOURS > 0, 'LIVE_GRAPH_MAX_AGE_HOURS must be positive');
const graphAgeMs = Date.now() - verifiedAt;
assert.ok(graphAgeMs >= -5 * 60 * 1000, 'Live graph verified_at is unexpectedly in the future');
assert.ok(
  graphAgeMs <= MAX_GRAPH_AGE_HOURS * 60 * 60 * 1000,
  `Live graph verified_at is older than ${MAX_GRAPH_AGE_HOURS} hours: ${graphData.verified_at}`,
);

const petsHtml = await petsPageResponse.text();
assert.match(petsHtml, /crypto-moonboy-pets/i, 'Crypto Moonboy Pets page is missing its canonical page marker');
assert.match(petsHtml, /\/petprogress/i, 'Crypto Moonboy Pets page is missing the current progression command');
assert.match(petsHtml, /\/petgear/i, 'Crypto Moonboy Pets page is missing the current equipment progression command');

const leaderboardContentType = petsLeaderboardResponse.headers.get('content-type') || '';
assert.match(leaderboardContentType, /json/i, 'Crypto Moonboy Pets leaderboard API did not return JSON');
const leaderboardPayload = await petsLeaderboardResponse.json();
assert.ok(
  Array.isArray(leaderboardPayload) || (leaderboardPayload && typeof leaderboardPayload === 'object'),
  'Crypto Moonboy Pets leaderboard API returned an invalid payload',
);

console.log(
  `Live graph and Pets verification passed: ${indexedWikiUrls.length} wiki nodes, ` +
  `${graphData.edges.length} graph edges, generated ${graphData.generated_at}, verified ${graphData.verified_at}.`,
);

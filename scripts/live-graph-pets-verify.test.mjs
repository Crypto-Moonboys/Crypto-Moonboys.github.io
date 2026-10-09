import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const wikiHtml = readFileSync(new URL('../wiki/crypto-moonboy-pets.html', import.meta.url), 'utf8');
const verifier = fileURLToPath(new URL('./live-graph-pets-verify.mjs', import.meta.url));
const guidePath = '/how-to-play-crypto-moonboy-pets.html';
const leaderboardPath = '/crypto-moonboy-pets-leaderboard.html';
const launcher = 'https://t.me/WIKICOMSBOT?start=moonpet';

// Exercise the actual CLI with isolated HTTP fixtures. No production requests or
// generated repository data are changed, and the documentation is the real page.
async function verify(mutate = () => {}, environment = {}) {
  const timestamp = new Date().toISOString();
  const nodes = [{ id: '/wiki/crypto-moonboy-pets.html' }, { id: '/wiki/example.html' }];
  const edges = [{ source: nodes[0].id, target: nodes[1].id }];
  const fixture = {
    index: nodes.map(({ id }) => ({ url: id })),
    graph: { nodes, edges, generated_at: timestamp, verified_at: timestamp },
    lite: { lite: true, nodes, edges, generated_at: timestamp, verified_at: timestamp },
    html: wikiHtml,
    leaderboard: { period: 'seasonal', season: null, entries: [] },
    status: {},
    contentType: {},
  };
  mutate(fixture);
  const routes = new Map([
    ['/js/wiki-index.json', ['index', 'application/json']],
    ['/js/graph-data.json', ['graph', 'application/json']],
    ['/js/entity-graph-lite.json', ['lite', 'application/json']],
    ['/wiki/crypto-moonboy-pets.html', ['html', 'text/html']],
    ['/telegram-pets/leaderboard', ['leaderboard', 'application/json']],
  ]);
  const server = createServer((request, response) => {
    const route = routes.get(request.url);
    if (!route) { response.writeHead(404); response.end(); return; }
    const [key, contentType] = route;
    response.writeHead(fixture.status[key] || 200, {
      'content-type': fixture.contentType[key] || contentType,
    });
    response.end(key === 'html' ? fixture.html : JSON.stringify(fixture[key]));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [verifier], {
        env: { ...process.env, SITE_BASE_URL: baseUrl, MOONBOYS_API_BASE_URL: baseUrl,
          LIVE_GRAPH_MAX_AGE_HOURS: '24', ...environment },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal, output }));
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function rejects(mutate, message, environment) {
  const result = await verify(mutate, environment);
  assert.equal(result.signal, null, result.output);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, message);
}

test('current committed Mini App documentation passes without legacy commands', async () => {
  const result = await verify(f => { f.html = f.html.replace(/\/(?:petprogress|petgear)\b/gi, ''); });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /verification passed: 2 wiki nodes, 1 graph edges/);
});

test('optional compatibility shortcuts do not replace or invalidate the current links', async () => {
  const result = await verify(f => { f.html += '<p>/petprogress /petgear</p>'; });
  assert.equal(result.code, 0, result.output);
});

test('link labels and relative URL formatting can change without breaking the contract', async () => {
  const result = await verify(f => {
    f.html = f.html.replaceAll(guidePath, '../how-to-play-crypto-moonboy-pets.html#moonpet-evolution')
      .replaceAll(leaderboardPath, '../crypto-moonboy-pets-leaderboard.html?period=weekly')
      .replaceAll('HOW TO PLAY', 'Player guide').replaceAll('OPEN MOONPET OS', 'Play')
      .replaceAll('start=moonpet', 'source=wiki&amp;start=moonpet');
  });
  assert.equal(result.code, 0, result.output);
});

for (const [name, mutate, message] of [
  ['canonical article marker', f => { f.html = f.html.replace('data-entity-slug="crypto-moonboy-pets"', 'data-entity-slug="other"'); }, /canonical page marker/],
  ['signed launcher', f => { f.html = f.html.replaceAll(launcher, 'https://t.me/OtherBot?start=moonpet'); }, /signed Moonpet OS launch link/],
  ['Moonpet launch intent', f => { f.html = f.html.replaceAll('start=moonpet', 'start=other'); }, /signed Moonpet OS launch link/],
  ['guide link', f => { f.html = f.html.replaceAll(guidePath, '/other-guide.html'); }, /How to Play guide link/],
  ['leaderboard link', f => { f.html = f.html.replaceAll(leaderboardPath, '/other-board.html'); }, /public leaderboard link/],
  ['external guide impostor', f => { f.html = f.html.replaceAll(guidePath, 'https://example.com' + guidePath); }, /How to Play guide link/],
  ['incorrect relative guide path', f => { f.html = f.html.replaceAll(guidePath, 'how-to-play-crypto-moonboy-pets.html'); }, /How to Play guide link/],
  ['commented launcher', f => { f.html = f.html.replaceAll(launcher, '#'); f.html += `<!-- <a href="${launcher}">Play</a> -->`; }, /signed Moonpet OS launch link/],
  ['template launcher', f => { f.html = f.html.replaceAll(launcher, '#'); f.html += `<template><a href="${launcher}">Play</a></template>`; }, /signed Moonpet OS launch link/],
  ['data attribute launcher', f => { f.html = f.html.replaceAll(launcher, '#'); f.html += `<a data-href="${launcher}">Play</a>`; }, /signed Moonpet OS launch link/],
  ['plain guide text', f => { f.html = f.html.replaceAll(guidePath, '/other.html'); f.html += `<p>${guidePath} /petprogress /petgear</p>`; }, /How to Play guide link/],
]) {
  test(`documentation regression rejects missing or unusable ${name}`, () => rejects(mutate, message));
}

for (const [name, mutate, message] of [
  ['index shape', f => { f.index = {}; }, /wiki index is not an array/],
  ['full graph shape', f => { f.graph.edges = null; }, /full graph has an invalid shape/],
  ['mobile graph shape', f => { f.lite.lite = false; }, /mobile graph has an invalid shape/],
  ['wiki node parity', f => { f.index.pop(); }, /nodes do not match the live canonical wiki index/],
  ['edge source', f => { f.graph.edges = [{ source: '/wiki/missing.html', target: f.graph.nodes[0].id }]; }, /edge source is missing/],
  ['edge target', f => { f.graph.edges = [{ source: f.graph.nodes[0].id, target: '/wiki/missing.html' }]; }, /edge target is missing/],
  ['mobile generation parity', f => { f.lite.generated_at = '2020-01-01T00:00:00Z'; }, /not generated from the current full graph/],
  ['mobile verification parity', f => { f.lite.verified_at = '2020-01-01T00:00:00Z'; }, /verified_at does not match/],
  ['missing freshness timestamp', f => { delete f.graph.verified_at; delete f.lite.verified_at; }, /verified_at is invalid or missing/],
  ['invalid freshness timestamp', f => { f.graph.verified_at = f.lite.verified_at = 'invalid'; }, /verified_at is invalid or missing/],
  ['stale graph', f => { f.graph.verified_at = f.lite.verified_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); }, /older than 24 hours/],
  ['future graph', f => { f.graph.verified_at = f.lite.verified_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); }, /unexpectedly in the future/],
  ['graph HTTP failure', f => { f.status.graph = 503; }, /Live full graph returned HTTP 503/],
  ['graph content type', f => { f.contentType.graph = 'text/html'; }, /Live full graph did not return JSON/],
  ['Pets page HTTP failure', f => { f.status.html = 404; }, /Crypto Moonboy Pets page returned HTTP 404/],
  ['leaderboard outage', f => { f.status.leaderboard = 503; }, /leaderboard API returned HTTP 503/],
  ['leaderboard content type', f => { f.contentType.leaderboard = 'text/html'; }, /leaderboard API did not return JSON/],
  ['invalid leaderboard payload', f => { f.leaderboard = null; }, /leaderboard API returned an invalid payload/],
]) {
  test(`health regression still rejects ${name}`, () => rejects(mutate, message));
}

for (const limit of ['-1', 'not-a-number']) {
  test(`invalid graph age limit ${limit} fails closed`, () => rejects(() => {},
    /LIVE_GRAPH_MAX_AGE_HOURS must be positive/, { LIVE_GRAPH_MAX_AGE_HOURS: limit }));
}

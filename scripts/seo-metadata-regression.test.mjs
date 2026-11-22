#!/usr/bin/env node
// Regression gate for publicly indexed, non-wiki entry pages. Wiki publication
// and canonical status have their own separate authority and approval gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://cryptomoonboys.com';
const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(match => match[1]);
let checked = 0;
for (const url of urls) {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith('/wiki/')) continue;
  assert.equal(parsed.origin, BASE, 'only owned canonical URLs may appear in the sitemap');
  const route = parsed.pathname.slice(1);
  const file = parsed.pathname.endsWith('/') ? route + 'index.html' : route;
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || '';
  assert.ok(head, file + ' has no head');
  const canonTags = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => match[0])
    .filter(tag => /\brel\s*=\s*["']canonical["']/i.test(tag));
  assert.equal(canonTags.length, 1, file + ' must have exactly one canonical');
  const href = canonTags[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  assert.equal(href, url, file + ' canonical must match sitemap URL');
  assert.doesNotMatch(head, /<meta\b(?=[^>]*name\s*=\s*["']robots["'])(?=[^>]*content\s*=\s*["'][^"']*noindex)/i,
    file + ' cannot be noindex while in sitemap');
  assert.match(head, /<title\b[^>]*>[^<]+<\/title>/i, file + ' needs a unique page title');
  assert.match(head, /<meta\b(?=[^>]*name\s*=\s*["']description["'])/i, file + ' needs a description');
  const ogUrl = head.match(/<meta\b(?=[^>]*property\s*=\s*["']og:url["'])[^>]*content\s*=\s*["']([^"']+)/i)?.[1];
  if (ogUrl) assert.equal(ogUrl, url, file + ' og:url must match its canonical');
  checked++;
}
assert.ok(checked >= 40, 'the non-wiki sitemap landing-page coverage must not silently shrink');
assert.match(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'),
  /^Sitemap: https:\/\/cryptomoonboys\.com\/sitemap\.xml$/m,
  'robots must advertise the canonical sitemap');
// Keep the home entity/website graph factual and valid JSON.
const homeHead = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split(/<\/head>/i)[0];
const jsonLd = homeHead.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(jsonLd, 'homepage must publish structured data in the initial HTML');
const schema = JSON.parse(jsonLd);
const graph = schema['@graph'] || [];
assert.ok(graph.some(entity => entity['@type'] === 'Organization' && entity.url === BASE + '/'),
  'homepage needs real creator umbrella organization identity');
assert.ok(graph.some(entity => entity['@type'] === 'WebSite' && entity.url === BASE + '/'),
  'homepage needs WebSite identity without a fabricated search endpoint');
// The legacy route must not compete with the real public Moonboy Builder.
const builderRedirect = fs.readFileSync(path.join(ROOT, 'avatar-builder-test.html'), 'utf8');
assert.match(builderRedirect, /<meta\b(?=[^>]*name=["']robots["'])(?=[^>]*content=["']noindex)/i,
  'legacy Moonboy Builder redirect must be noindex');

console.log('SEO landing-page metadata regression PASSED — ' + checked + ' sitemap URLs checked');

// Public entry routes must survive both sitemap and search-index regeneration.
const publicEntries = [
  '/ai-user.html', '/join-us-on-the-wax-blockchain.html', '/moonboy-builder.html',
  '/swarmsy.html', '/gkniftyheads-incubator.html', '/community.html',
  '/how-to-play.html', '/how-to-play-crypto-moonboy-pets.html', '/paths.html', '/timeline.html',
];
const searchIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'js/wiki-index.json'), 'utf8'));
for (const route of publicEntries) {
  assert.ok(urls.includes(BASE + route), route + ' missing from sitemap');
  assert.equal(searchIndex.filter(entry => entry.url === route).length, 1, route + ' missing or duplicated in search');
}
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const searchPage = fs.readFileSync(path.join(ROOT, 'search.html'), 'utf8');
for (const route of ['/ai-user.html', '/wiki/crypto-moonboys.html', '/wiki/waxp.html', '/wiki/graffiti-kings.html', '/wiki/darren-cullen.html', '/wiki/charlie-buster.html', '/wiki/gkniftyheads-nft-collection.html']) {
  for (const [name, source] of [['homepage', home], ['article hub', searchPage]]) {
    const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || '';
    assert.ok(main.includes('href="' + route + '"'), name + ' needs a visible direct link to ' + route);
  }
}
for (const file of ['paths.html', 'hubs.html']) {
  const blocks = [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => JSON.stringify(JSON.parse(match[1])));
  assert.equal(blocks.length, 1, file + ' should describe its WebPage once');
}
assert.match(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8'), /name="robots" content="noindex, follow"/);
for (const [oldRoute, canonicalRoute] of [
  ['/games/pac-chain/', '/games/chain-maze/'],
  ['/games/asteroid-fork/', '/games/forkfield/'],
  ['/games/breakout-bullrun/', '/games/bullrun-brick-smash/'],
  ['/games/index.html', '/games/'],
  ['/battle-chamber/factions/index.html', '/battle-chamber/factions/'],
]) {
  const file = oldRoute.endsWith('/') ? oldRoute + 'index.html' : oldRoute;
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.ok(source.includes('<link rel="canonical" href="' + BASE + canonicalRoute + '">'),
    oldRoute + ' must declare the current public URL');
  assert.ok(!urls.includes(BASE + oldRoute), 'duplicate URLs must stay out of the sitemap');
  assert.ok(urls.includes(BASE + canonicalRoute), 'canonical URL missing from the sitemap: ' + canonicalRoute);
}
for (const [oldRoute, destination, canonicalRoute] of [
  ['/wiki/tokens.html', '/categories/cryptocurrencies.html', '/categories/cryptocurrencies.html'],
  ['/wiki/liquidity-pools.html', '/wiki/defi.html#amm', '/wiki/defi.html'],
  ...[
    ['xrp', 'xrp-ledger'],
    ['xrpl-dex', 'xrp-ledger'],
    ['xrpl-tokens', 'xrp-ledger'],
    ['xrpl-trust-lines', 'xrp-ledger'],
    ['hard-fork-games-event', 'hard-fork-games'],
    ['no-ball-games-nbg-collection', 'noballgamess-nft-collection'],
    ['substack-posts-on-graffpunks-substack-com', 'graffpunks-reading-library'],
    ['substack-posts-on-graffpunkssubstackcom', 'graffpunks-reading-library'],
  ].map(([alias, target]) => ['/wiki/' + alias + '.html', '/wiki/' + target + '.html', '/wiki/' + target + '.html']),
]) {
  const source = fs.readFileSync(path.join(ROOT, oldRoute), 'utf8');
  assert.ok(source.includes('content="0; url=' + destination + '"'), oldRoute + ' must resolve the old guide');
  assert.ok(source.includes('href="' + BASE + canonicalRoute + '"'), 'canonicals must not include section fragments');
  assert.ok(source.includes('<a href="' + destination + '">'), 'readers need a fallback link');
  assert.ok(!urls.includes(BASE + oldRoute), 'aliases must not enter the sitemap');
  assert.ok(urls.includes(BASE + canonicalRoute), 'alias destination missing from the sitemap: ' + canonicalRoute);
}
const currencyHub = fs.readFileSync(path.join(ROOT, 'categories/cryptocurrencies.html'), 'utf8');
for (const [, route] of currencyHub.matchAll(/href="(\/wiki\/[^"#?]+\.html)"/g)) {
  assert.ok(fs.existsSync(path.join(ROOT, route)), 'Currency hub links to a missing article: ' + route);
}
console.log('SEO discovery regression PASSED — ten public entry routes, static project links and unique navigation schema');

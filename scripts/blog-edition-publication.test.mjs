import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const manifest = json('js/blog-editions.json');
const editions = manifest.editions.filter(row => !row.duplicate_of);
const archiveCopies = manifest.editions.filter(row => row.duplicate_of);
const library = '/wiki/graffpunks-reading-library.html';
const routes = [...editions.map(row => row.url), library];
const origin = 'https://cryptomoonboys.com';
const unescape = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"');

test('all 94 supplied source identities have a destination, including the duplicate and distinct publication variants', () => {
  const register = new Map(read('brand-canon/wiki-rewrites/raw-canon-20261008-source-register.csv')
    .trim().split(/\r?\n/).slice(1).map(line => {
      const [filename, , hash] = line.split(',');
      return [filename, hash];
    }));
  assert.equal(manifest.editions.length, 94);
  assert.equal(editions.length, 93);
  assert.equal(new Set(manifest.editions.map(row => row.url)).size, manifest.editions.length);
  assert.equal(manifest.reading_pages, manifest.editions.length);
  assert.deepEqual(new Set(manifest.editions.map(row => row.source_file)), new Set(register.keys()));
  for (const row of manifest.editions) {
    assert.equal(row.source_sha256, register.get(row.source_file), row.source_file);
    assert.match(row.source_url, /^https:\/\//);
  }
  const source = filename => manifest.editions.find(row => row.source_file.toLowerCase() === filename);
  assert.notEqual(source('w51.txt').url, source('w52.txt').url);
  assert.equal(source('w52.txt').duplicate_of, 'w51.txt');
  assert.equal(source('w51.txt').source_sha256, source('w52.txt').source_sha256);
  assert.notEqual(source('w66.txt').url, source('w80.txt').url);
  assert.notEqual(source('w66.txt').source_sha256, source('w80.txt').source_sha256);
});

test('reading editions publish accessible prose, source attribution and consistent page/share/search SEO', () => {
  const descriptions = new Set();
  for (const row of editions) {
    const html = read(row.url.slice(1));
    assert.equal((html.match(/<h1\b/g) || []).length, 1, row.url);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, row.url);
    assert.ok(html.includes('rel="canonical" href="' + origin + row.url + '"'), row.url);
    assert.ok(html.includes('property="og:url" content="' + origin + row.url + '"'), row.url);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(description && description.length > 60, row.url);
    assert.ok(!descriptions.has(description), 'repeated synopsis: ' + row.url);
    descriptions.add(description);
    assert.match(html, /<details class="article-contents">/);
    assert.match(html, /data-page-kind="longform-article"/);
    assert.equal((html.match(/<!-- CANONICAL_CONTENT:BEGIN -->/g) || []).length, 1);
    assert.equal((html.match(/<!-- CANONICAL_CONTENT:END -->/g) || []).length, 1);
    const article = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(article['@type'], 'Article');
    assert.equal(article.url, origin + row.url);
    assert.equal(article.isBasedOn, row.source_url);
    assert.equal(article.dateModified, '2026-11-16');
    assert.equal(article.description, unescape(description));
    assert.ok(html.includes('data-canon-source="' + row.source_file + '"') || row.duplicate_of);
    assert.ok(row.article_words >= 600, row.url + ' should remain a substantial reading');
    assert.doesNotMatch(html, /<p class="lore-paragraph">(?:\d+ min read|Press enter or click to view image|Become a Medium member|Read full story|Discussion about this post|\d+ (?:Likes?|Restacks?))<\/p>/i);
  }
});

test('every reading is listed in its existing category and in the static no-JavaScript library', () => {
  const libraryHtml = read(library.slice(1));
  const categories = new Set();
  for (const row of manifest.editions) {
    categories.add(row.category);
    assert.ok(libraryHtml.includes('href="' + row.url + '"'), 'library missing ' + row.url);
    const category = '/categories/' + row.category + '.html';
    assert.ok(read(category.slice(1)).includes('href="' + row.url + '"'), category + ' missing ' + row.url);
    assert.ok(read(row.url.slice(1)).includes('href="' + category + '"'), row.url);
  }
  assert.equal(categories.size, 10);
  assert.deepEqual(new Set(manifest.categories), categories);
});

test('identical sources have a full archive reading without a duplicate search or sitemap result', () => {
  const wikiIndex = json('js/wiki-index.json');
  const sitemap = read('sitemap.xml');
  for (const row of archiveCopies) {
    const primary = manifest.editions.find(entry => entry.source_file === row.duplicate_of);
    const html = read(row.url.slice(1));
    const story = html => html.match(/<section class="blog-source-story"[^>]*>([\s\S]*?)<\/section>/)[1];
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert.ok(html.includes('rel="canonical" href="' + origin + primary.url + '"'));
    assert.ok(html.includes('data-canon-source="' + row.source_file + '"'));
    assert.equal(story(html), story(read(primary.url.slice(1))));
    assert.ok(!wikiIndex.some(entry => entry.url === row.url));
    assert.ok(!sitemap.includes(origin + row.url));
  }
});

test('search exposes its input, all category cards and then article results in document order', () => {
  const search = read('search.html');
  const positions = ['id="search-page-input"', 'class="search-category-browser"', 'id="search-heading"', 'id="search-results-page"'].map(value => search.indexOf(value));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const expectedRoutes = fs.readdirSync(path.join(ROOT, 'categories'))
    .filter(name => name.endsWith('.html') && name !== 'index.html')
    .map(name => '/categories/' + name)
    .sort();
  const categoryCards = html => [...html.matchAll(/<a href="(\/categories\/[^"#]+\.html)" class="category-card"/g)]
    .map(match => match[1]).sort();
  assert.deepEqual(categoryCards(read('categories/index.html')), expectedRoutes);
  assert.deepEqual(categoryCards(search.slice(positions[1], positions[2])), expectedRoutes);
  for (const route of expectedRoutes) {
    const page = read(route.slice(1));
    assert.doesNotMatch(page, /No articles in this category yet/i, route);
    assert.match(page, /<a [^>]*href="\/wiki\//, route);
  }
  assert.ok(search.includes('href="' + library + '"'));
});

test('all reading routes agree across search, both graph payloads, sitemap and page approval', () => {
  const index = json('js/wiki-index.json');
  const graph = json('js/graph-data.json');
  const entityGraph = json('js/entity-graph.json');
  const lite = json('js/entity-graph-lite.json');
  const approved = json('brand-canon/approved-pages.json').approved_slugs;
  const sitemap = read('sitemap.xml');
  for (const route of routes) {
    assert.equal(index.filter(row => row.url === route).length, 1, route + ' search');
    assert.equal(graph.nodes.filter(row => row.id === route).length, 1, route + ' graph');
    assert.ok(Object.hasOwn(entityGraph, route), route + ' entity graph');
    assert.ok(sitemap.includes('<loc>' + origin + route + '</loc>'), route + ' sitemap');
    assert.ok(approved.includes(path.basename(route, '.html')), route + ' approval');
  }
  // Lite mode deliberately caps nodes; it must stay usable and use real nodes.
  const fullNodes = new Set(graph.nodes.map(row => row.id));
  assert.ok(lite.lite && lite.nodes.length > 0);
  for (const node of lite.nodes) assert.ok(fullNodes.has(node.id), node.id);
});

test('dashboard analysis reports include the expanded publication inventory', () => {
  const index = json('js/wiki-index.json');
  for (const name of ['cluster-health', 'content-gaps', 'authority-drift']) {
    assert.equal(json('js/' + name + '.json').summary.total_pages, index.length, name);
  }
  for (const name of ['authority-trust', 'publishing-readiness', 'predictive-growth', 'governance-signals']) {
    const entries = json('js/' + name + '.json').entries;
    for (const route of routes) assert.ok(entries.some(entry => entry.url === route), name + ': ' + route);
  }
});

test('reading links and native contents resolve to existing local pages and fragments', () => {
  for (const route of [...routes, ...archiveCopies.map(row => row.url)]) {
    const html = read(route.slice(1));
    for (const [, target] of html.matchAll(/href="((?:\/wiki\/|\/categories\/|#)[^"]+)"/g)) {
      const url = new URL(unescape(target), origin + route);
      const targetPath = path.join(ROOT, decodeURIComponent(url.pathname));
      assert.ok(fs.existsSync(targetPath), route + ' -> ' + target);
      if (url.hash) {
        const id = decodeURIComponent(url.hash.slice(1));
        assert.ok(read(url.pathname.slice(1)).includes('id="' + id + '"'), route + ' -> ' + target);
      }
    }
  }
});

async function renderDashboard(data) {
  const container = {
    textContent: '', children: [],
    replaceChildren(...children) { this.children = children; },
    setAttribute() {}, removeAttribute() {}, closest() { return null; },
  };
  let start;
  const context = {
    console: { warn() {} },
    window: { location: { hash: '' }, addEventListener() {} },
    fetch: async url => ({ ok: true, json: async () => url === '/js/blog-editions.json' ? data : null }),
    document: {
      readyState: 'loading',
      addEventListener(name, callback) { if (name === 'DOMContentLoaded') start = callback; },
      getElementById() { return null; },
      querySelector(selector) { return selector === '#dash-blog-editions' ? container : null; },
      createElement() { return { textContent: '' }; },
    },
  };
  vm.runInNewContext(read('js/dashboard.js'), context, { filename: 'dashboard.js' });
  start();
  await new Promise(resolve => setImmediate(resolve));
  return container;
}

test('dashboard renders actual source/page/category coverage and handles missing data', async () => {
  const result = await renderDashboard(manifest);
  assert.match(result.children[0].textContent, /94 source posts → 94 reading editions across 10 categories/);
  assert.match(result.children[0].textContent, /1 exact duplicate has its own archive page/);
  assert.equal((await renderDashboard(null)).textContent, 'Reading-library data is unavailable.');
  assert.ok(read('dashboard.html').includes('id="dash-blog-editions"'));
});

test('long search fallback keeps the actual story ahead of short-word substring matches', async () => {
  const index = [
    { title: 'HODL WARS', url: '/wiki/hodl-wars.html', tags: [], category: 'core', rank_score: 300,
      search_index: { tokens: [], keyword_bag: ['open', 'yard', 'dead', 'man', 'history'] } },
    ...Array.from({ length: 8 }, (_, i) => ({
      title: 'Human Intranet History ' + i, url: '/wiki/human-intranet-' + i + '.html',
      tags: ['human', 'intranet', 'history'], category: 'misc', rank_score: 999,
      search_index: { tokens: ['human', 'intranet'], keyword_bag: ['history'] },
    })),
  ];
  const context = {
    console: { debug() {}, warn() {}, error() {} }, URL, URLSearchParams,
    fetch: async () => ({ ok: true, json: async () => index }),
    document: { readyState: 'loading', addEventListener() {}, querySelectorAll() { return []; } },
    window: { location: { pathname: '/search.html', search: '' } },
  };
  vm.createContext(context);
  vm.runInContext(read('js/wiki.js'), context);
  await context.loadWikiIndex();
  for (const limit of [5, 10]) {
    const result = context.selectSearchMatches('An open yard with a dead man in its history', { allowPartialFallback: true, limit });
    assert.equal(result.usedPartialFallback, true);
    assert.equal(result.scored[0].item.url, '/wiki/hodl-wars.html');
  }
});

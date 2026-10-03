import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WIKI = path.join(ROOT, 'wiki');

const sourcePages = fs.readdirSync(WIKI)
  .filter(name => name === 'the-first-witness.html' || /^first-witness-.*\.html$/i.test(name))
  .sort();

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'wiki-publish-audit.json'), 'utf8'));
const entityMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'entity-map.json'), 'utf8'));
const graphData = JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'graph-data.json'), 'utf8'));
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

assert.ok(sourcePages.length >= 82, `expected at least 82 First Witness pages, found ${sourcePages.length}`);

const indexByUrl = new Map(index.map(entry => [entry.url, entry]));
const entityUrls = new Set(entityMap.map(entry => entry.canonical_url).filter(Boolean));
const graphUrls = new Set((graphData.nodes || []).map(node => node.url || node.id).filter(Boolean));
const approved = new Set((audit.approved || []).map(entry => `/wiki/${entry.slug}.html`));

const requiredTags = [
  'first witness',
  'first witness bible',
  'covenant',
  'scripture',
  'sacred chain',
  'forty paths',
  'HODL WARS',
  'Year 3008',
  '2030 Concord'
];

for (const file of sourcePages) {
  const url = `/wiki/${file}`;
  const entry = indexByUrl.get(url);
  assert.ok(entry, `First Witness page missing from wiki index: ${url}`);
  assert.equal(entry.category, 'core', `First Witness page must rank as core: ${url}`);

  const tags = new Set(entry.tags || []);
  for (const tag of requiredTags) {
    assert.ok(tags.has(tag), `First Witness page missing inherited search tag "${tag}": ${url}`);
  }

  assert.ok(entry.search_index && Array.isArray(entry.search_index.keyword_bag), `missing keyword bag: ${url}`);
  for (const token of ['first', 'witness', 'covenant', 'scripture', 'sacred', 'chain']) {
    assert.ok(entry.search_index.keyword_bag.includes(token), `keyword bag missing "${token}": ${url}`);
  }

  assert.ok(approved.has(url), `First Witness page missing from publish audit: ${url}`);
  assert.ok(entityUrls.has(url), `First Witness page missing from entity map: ${url}`);
  assert.ok(graphUrls.has(url), `First Witness page missing from graph data: ${url}`);
  assert.ok(sitemap.includes(`https://cryptomoonboys.com${url}`), `First Witness page missing from sitemap: ${url}`);
}

const hub = indexByUrl.get('/wiki/the-first-witness.html');
assert.ok(hub, 'First Witness hub missing');
const hubAliasTitles = new Set((hub.aliases || []).map(alias => alias.title));
for (const alias of ['First Witness Bible', 'Crypto Moonboys Bible', 'Graffiti Kings Bible', 'GK Bible']) {
  assert.ok(hubAliasTitles.has(alias), `First Witness hub missing alias: ${alias}`);
}

const minRank = Math.min(...sourcePages.map(file => indexByUrl.get(`/wiki/${file}`).rank_score));
assert.ok(minRank >= 190, `First Witness cluster minimum rank unexpectedly low: ${minRank}`);

console.log(`First Witness publishing/search contract OK: ${sourcePages.length} pages; minimum rank ${minRank}.`);

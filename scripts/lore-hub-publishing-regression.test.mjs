import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPageFromTemplate, renderCategoryPage } from './import-website-publish-payloads.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hub = '/wiki/crypto-moonboys.html';
const payload = JSON.parse(fs.readFileSync(path.join(root, 'test-fixtures/website-publish-payloads/sample-lore-page.json'), 'utf8'));
const article = renderPageFromTemplate(payload, root, '');
const category = renderCategoryPage('Fresh lore', [{ url: '/wiki/fresh-lore.html', title: 'Fresh lore', desc: '' }]);
for (const [name, html] of [['new article', article], ['new category', category]]) {
  assert.match(html, /<main\b[\s\S]*?<a href="\/wiki\/crypto-moonboys\.html">Crypto Moonboys lore hub<\/a>/, `${name} needs a visible lore hub link`);
}

const map = JSON.parse(fs.readFileSync(path.join(root, 'js/link-map.json'), 'utf8'));
const graph = JSON.parse(fs.readFileSync(path.join(root, 'js/link-graph.json'), 'utf8'));
const dashboard = JSON.parse(fs.readFileSync(path.join(root, 'js/authority-trust.json'), 'utf8'));
for (const [url, entry] of Object.entries(map)) {
  assert.deepEqual(graph[url].existing_outbound, entry.existing_links.filter(target => target !== url), `${url}: graph must match published links`);
}
assert.ok(map['/wiki/staking.html'].existing_links.includes('/wiki/defi.html'));
assert.ok(!map['/wiki/staking.html'].existing_links.includes('/wiki/liquidity-pools.html'));
assert.equal(dashboard.entries.find(entry => entry.url === hub).inbound_links, graph[hub].inbound_count);
console.log('Lore hub publishing regression passed for new article, category, graph and dashboard.');

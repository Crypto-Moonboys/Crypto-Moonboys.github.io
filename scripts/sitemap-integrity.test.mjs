import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sitemap = await fs.readFile(path.join(ROOT, 'sitemap.xml'), 'utf8');
const trimmed = sitemap.trim();

assert.match(trimmed, /^<\?xml version="1\.0" encoding="UTF-8"\?>/i, 'sitemap must start with an XML declaration');
assert.match(trimmed, /<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/i, 'sitemap must declare the sitemap namespace');
assert.ok(trimmed.endsWith('</urlset>'), 'sitemap must close the urlset element');

const openUrlCount = (sitemap.match(/<url>/g) || []).length;
const closeUrlCount = (sitemap.match(/<\/url>/g) || []).length;
const locations = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1]);

assert.ok(openUrlCount > 0, 'sitemap must contain URL entries');
assert.equal(openUrlCount, closeUrlCount, 'every sitemap URL element must close');
assert.equal(locations.length, openUrlCount, 'every sitemap URL must have exactly one location');
assert.equal(new Set(locations).size, locations.length, 'sitemap locations must be unique');

for (const location of locations) {
  assert.match(location, /^https:\/\/cryptomoonboys\.com\//, `unexpected sitemap host: ${location}`);
}

for (const lastmod of Array.from(sitemap.matchAll(/<lastmod>(.*?)<\/lastmod>/g), (match) => match[1])) {
  assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/, `invalid lastmod date: ${lastmod}`);
}

console.log(`Sitemap integrity test passed: ${locations.length} unique URLs.`);

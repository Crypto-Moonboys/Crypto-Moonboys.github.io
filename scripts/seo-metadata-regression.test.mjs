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
  const file = parsed.pathname === '/' ? 'index.html' : parsed.pathname.slice(1);
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

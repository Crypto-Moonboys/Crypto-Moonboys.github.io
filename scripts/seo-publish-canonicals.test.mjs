import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { canonicalizePublishedHtml, sitemapTargets, ensurePublishedCanonicals, SITE_ORIGIN } from './seo-publish-canonicals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wikiUrl = SITE_ORIGIN + '/wiki/altcoins.html';
const fixture = (body, extraHead = '') => `<!DOCTYPE html><html><head><title>Real page</title><meta name="description" content="A meaningful editorial description.">${extraHead}</head><body><h1>${body}</h1></body></html>`;

test('adds the exact preferred sitemap canonical without altering body or requiring a lore rewrite', () => {
  const original = readFileSync(path.join(ROOT, 'wiki/altcoins.html'), 'utf8');
  const result = canonicalizePublishedHtml(original, wikiUrl);
  assert.equal(result.inserted, true, 'the known published Altcoins article currently lacks a canonical');
  assert.ok(result.html.includes('<link rel="canonical" href="' + wikiUrl + '">'));
  assert.equal(result.html.split('</head>')[1], original.split('</head>')[1], 'article body must be byte-for-byte unchanged');
  assert.equal(canonicalizePublishedHtml(result.html, wikiUrl).inserted, false, 'repair must be idempotent');
});

test('honours existing matching canonical and rejects contradictory signals', () => {
  const root = SITE_ORIGIN + '/';
  const correct = fixture('Home', '<link rel="canonical" href="' + root + '">');
  assert.equal(canonicalizePublishedHtml(correct, root).inserted, false);
  assert.throws(() => canonicalizePublishedHtml(fixture('Home', '<link rel="canonical" href="https://example.net/">'), root), /conflicts/);
  assert.throws(() => canonicalizePublishedHtml(fixture('Home', '<link rel="canonical" href="' + root + '"><link rel="canonical" href="' + root + '">'), root), /multiple canonical/);
  assert.throws(() => canonicalizePublishedHtml(fixture('Home', '<meta name="robots" content="noindex,follow">'), root), /noindex/);
  assert.throws(() => canonicalizePublishedHtml(fixture('Home', '<meta http-equiv="refresh" content="0;url=/">'), root), /meta-refresh/);
  assert.throws(() => canonicalizePublishedHtml(' ', root), /missing HTML head/);
});

test('sitemap paths must remain internal, unique and map to HTML', () => {
  const base = path.join(os.tmpdir(), 'gk-test-public');
  assert.equal(sitemapTargets('<urlset><loc>' + SITE_ORIGIN + '/</loc></urlset>', base)[0].filename, path.join(base, 'index.html'));
  assert.throws(() => sitemapTargets('<loc>https://example.com/</loc>', base), /off-site/);
  assert.throws(() => sitemapTargets('<loc>' + SITE_ORIGIN + '/wiki/x.html?q=1</loc>', base), /Non-canonical/);
  assert.throws(() => sitemapTargets('<loc>' + SITE_ORIGIN + '/wiki/x.webp</loc>', base), /Non-HTML/);
  assert.throws(() => sitemapTargets('<loc>' + SITE_ORIGIN + '/</loc><loc>' + SITE_ORIGIN + '/</loc>', base), /Duplicate/);
});

test('artifact-only integration adds missing canonicals, is idempotent and preserves source files', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gk-seo-artifact-'));
  try {
    await mkdir(path.join(temp, 'wiki'), { recursive: true });
    const url = SITE_ORIGIN + '/wiki/example.html';
    const html = fixture('Example');
    await writeFile(path.join(temp, 'sitemap.xml'), '<urlset><loc>' + SITE_ORIGIN + '/</loc><loc>' + url + '</loc></urlset>');
    const homepage = fixture('Homepage', '<link rel="canonical" href="' + SITE_ORIGIN + '/">');
    await writeFile(path.join(temp, 'index.html'), homepage);
    await writeFile(path.join(temp, 'wiki/example.html'), html);
    const first = await ensurePublishedCanonicals(temp);
    assert.deepEqual({ checked: first.checked, added: first.added, present: first.present }, { checked: 2, added: 1, present: 1 });
    assert.equal(await readFile(path.join(temp, 'index.html'), 'utf8'), homepage);
    const repaired = await readFile(path.join(temp, 'wiki/example.html'), 'utf8');
    assert.ok(repaired.includes('<link rel="canonical" href="' + url + '">'));
    assert.ok(repaired.endsWith(html.slice(html.indexOf('</head>') + '</head>'.length)));
    const second = await ensurePublishedCanonicals(temp);
    assert.deepEqual({ checked: second.checked, added: second.added, present: second.present }, { checked: 2, added: 0, present: 2 });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('a conflicting page blocks the full artifact operation before any writes', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gk-seo-atomic-'));
  try {
    await mkdir(path.join(temp, 'wiki'));
    const one = SITE_ORIGIN + '/wiki/first.html';
    const two = SITE_ORIGIN + '/wiki/second.html';
    await writeFile(path.join(temp, 'sitemap.xml'), '<loc>' + one + '</loc><loc>' + two + '</loc>');
    const original = fixture('First');
    await writeFile(path.join(temp, 'wiki/first.html'), original);
    await writeFile(path.join(temp, 'wiki/second.html'), fixture('Second', '<link rel="canonical" href="' + one + '">'));
    await assert.rejects(ensurePublishedCanonicals(temp), /conflicts/);
    assert.equal(await readFile(path.join(temp, 'wiki/first.html'), 'utf8'), original);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('homepage has a single visible H1 and keeps all three supplementary slogans', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal([...html.matchAll(/<h1\b/gi)].length, 1);
  assert.match(html, /<h1>🛑 STOP SWIPING N LIKING/);
  assert.match(html, /<h2 class="hero-secondary-heading">🤘 JOIN US ON THE WAX BLOCKCHAIN/);
  assert.match(html, /<h2><span style="color:var\(--gold\);">\$EIZE THE MEME\$/);
  assert.match(html, /<h2><span style="color:#fff;">BUILD YOUR OWN WORLD/);
  assert.match(html, /\.hero-intro h1, \.hero-intro h2 \{/);
});

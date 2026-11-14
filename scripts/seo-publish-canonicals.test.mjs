import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { canonicalizePublishedHtml, sitemapTargets, ensurePublishedCanonicals, disambiguatePublishedNftTitles, SITE_ORIGIN } from './seo-publish-canonicals.mjs';

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


test('same-name WAX NFT templates get unique titles, OG titles and factual ID descriptions', () => {
  const names = [
    'gkniftyheads-tommy-the-titan-tucci-783369.html',
    'gkniftyheads-tommy-the-titan-tucci-783372.html',
  ];
  const entries = names.map(name => ({
    url: SITE_ORIGIN + '/wiki/' + name,
    html: readFileSync(path.join(ROOT, 'wiki', name), 'utf8')
  }));
  const result = disambiguatePublishedNftTitles(entries);
  assert.equal(result.changed, 2, 'two distinct WAX templates must not share the same title');
  const titles = [];
  for (const entry of entries) {
    const updated = result.updates.get(entry.url);
    assert.ok(updated, 'both sibling templates should have a metadata-only change');
    const prefix = updated.split(/<\/head>/i)[0];
    const title = prefix.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const originalTitle = entry.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    assert.ok(title?.startsWith(originalTitle.replace(/\s*-\s*Crypto Moonboys Wiki$/, '')));
    assert.match(title, /gkniftyheads NFT #783(369|372)/);
    assert.ok(prefix.includes('<meta property="og:title" content="' + title + '">'));
    assert.match(prefix, /meta name="description" content="[^"]+WAX template ID 783(369|372)\./);
    assert.match(prefix, /meta property="og:description" content="[^"]+WAX template ID 783(369|372)\./);
    assert.ok(prefix.includes('<link rel="canonical" href="' + entry.url + '">'));
    assert.equal(updated.split(/<\/head>/i)[1], entry.html.split(/<\/head>/i)[1],
      'the protected NFT content and all ranking/scoring metadata must be preserved');
    titles.push(title);
  }
  assert.notEqual(titles[0], titles[1]);
  assert.equal(disambiguatePublishedNftTitles(
    entries.map(entry => ({ ...entry, html: result.updates.get(entry.url) }))
  ).changed, 0, 'the enhancement is idempotent');
});

test('unique NFT titles and ordinary same-title articles are left alone', () => {
  const one = 'gkniftyheads-tommy-the-titan-tucci-783369.html';
  const source = readFileSync(path.join(ROOT, 'wiki', one), 'utf8');
  assert.equal(disambiguatePublishedNftTitles([
    { url: SITE_ORIGIN + '/wiki/' + one, html: source }
  ]).changed, 0);
  const repeated = [
    { url: SITE_ORIGIN + '/wiki/editorial-one.html', html: fixture('One') },
    { url: SITE_ORIGIN + '/wiki/editorial-two.html', html: fixture('Two') }
  ];
  const result = disambiguatePublishedNftTitles(repeated);
  assert.equal(result.changed, 0);
  assert.equal(result.warnings.length, 2, 'ordinary title collisions need editorial review, not guessed IDs');
});

test('spoofed or mismatched WAX template identities abort without rewriting titles', () => {
  const one = 'gkniftyheads-tommy-the-titan-tucci-783369.html';
  const two = 'gkniftyheads-tommy-the-titan-tucci-783372.html';
  const original = readFileSync(path.join(ROOT, 'wiki', one), 'utf8');
  const malformed = original.replace('data-template-id="783369"', 'data-template-id="bad-id"');
  assert.throws(() => disambiguatePublishedNftTitles([
    { url: SITE_ORIGIN + '/wiki/' + one, html: malformed },
    { url: SITE_ORIGIN + '/wiki/' + two, html: original }
  ]), /malformed or mismatched/);
});

test('published NFT metadata repair handles real siblings and never mutates source articles', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gk-nft-seo-'));
  try {
    await mkdir(path.join(temp, 'wiki'));
    const names = ['gkniftyheads-tommy-the-titan-tucci-783369.html', 'gkniftyheads-tommy-the-titan-tucci-783372.html'];
    const originals = names.map(name => readFileSync(path.join(ROOT, 'wiki', name), 'utf8'));
    const urls = names.map(name => SITE_ORIGIN + '/wiki/' + name);
    await writeFile(path.join(temp, 'sitemap.xml'), '<urlset>' +
      urls.map(url => '<url><loc>' + url + '</loc></url>').join('') + '</urlset>');
    for (let i = 0; i < names.length; i++) await writeFile(path.join(temp, 'wiki', names[i]), originals[i]);
    const first = await ensurePublishedCanonicals(temp);
    assert.equal(first.checked, 2);
    assert.equal(first.nftTitlesUpdated, 2);
    for (let i = 0; i < names.length; i++) {
      const updated = await readFile(path.join(temp, 'wiki', names[i]), 'utf8');
      assert.ok(updated.includes('gkniftyheads NFT #' + names[i].match(/(\d+)\.html$/)[1]));
      assert.equal(updated.split(/<\/head>/i)[1], originals[i].split(/<\/head>/i)[1]);
    }
    const second = await ensurePublishedCanonicals(temp);
    assert.equal(second.nftTitlesUpdated, 0);
    assert.equal(second.added, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('Moonboy Builder and NBG collection publish complete self-consistent sharing metadata', () => {
  for (const file of ['moonboy-builder.html', 'wiki/noballgamess-nft-collection.html']) {
    const head = readFileSync(path.join(ROOT, file), 'utf8').split(/<\/head>/i)[0];
    const url = SITE_ORIGIN + '/' + file;
    const title = head.match(/<title\b[^>]*>(.*?)<\/title>/i)?.[1];
    const description = head.match(/<meta name="description" content="([^"]+)">/i)?.[1];
    assert.ok(title && description, file + ': expected real title and description');
    assert.match(head, /meta name="robots" content="index, follow"/);
    assert.ok(head.includes('<link rel="canonical" href="' + url + '">'));
    assert.equal((head.match(/\brel="canonical"/gi) || []).length, 1);
    assert.ok(head.includes('<meta property="og:url" content="' + url + '">'));
    assert.ok(head.includes('<meta property="og:title" content="' + title + '">'));
    assert.ok(head.includes('<meta property="og:description" content="' + description + '">'));
    assert.ok(head.includes('<meta name="twitter:title" content="' + title + '">'));
    assert.ok(head.includes('<meta name="twitter:description" content="' + description + '">'));
    for (const key of ['og:type', 'og:site_name', 'og:image', 'og:image:alt']) {
      assert.ok(head.includes('<meta property="' + key + '"'), file + ': missing ' + key);
    }
    assert.ok(head.includes('<meta name="twitter:card" content="summary_large_image">'));
    const image = head.match(/<meta property="og:image" content="([^"]+)">/)?.[1];
    assert.ok(image && image.startsWith(SITE_ORIGIN + '/'));
    assert.ok(head.includes('<meta name="twitter:image" content="' + image + '">'));
    assert.ok(readFileSync(path.join(ROOT, image.slice(SITE_ORIGIN.length + 1))).length > 0,
      file + ': OG image must be an actual repository asset');
  }
});


test('NoBallGames rarity generator preserves the same published social head on future refreshes', () => {
  const generator = readFileSync(path.join(ROOT, 'scripts/noballgamess-tracker-lib.mjs'), 'utf8');
  const published = readFileSync(path.join(ROOT, 'wiki/noballgamess-nft-collection.html'), 'utf8');
  const generatedHead = generator.match(/return \x60<!doctype html>[\s\S]*?(<head\b[^>]*>[\s\S]*?<\/head>)/i)?.[1];
  const publishedHead = published.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)?.[0];
  assert.ok(generatedHead, 'the rarity renderer must define a complete HTML head');
  assert.equal(generatedHead, publishedHead, 'a future rarity refresh must not erase the SEO/OG tags');
});


test('XRPL and TAGZcoin articles publish consistent Open Graph and Twitter cards', () => {
  const pages = ['wiki/589-xrpl.html', 'wiki/666-xrpl.html', 'wiki/bear-xrpl.html', 'wiki/tagzcoin.html'];
  for (const page of pages) {
    const html = readFileSync(path.join(ROOT, page), 'utf8');
    const head = html.split(/<\/head>/i)[0];
    const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const description = head.match(/<meta\b[^>]*name="description"[^>]*content="([^"]+)"/i)?.[1];
    const url = SITE_ORIGIN + '/' + page;
    assert.ok(title && description, page + ' must have a source title and description');
    assert.ok(head.includes('<meta property="og:title" content="' + title + '">'));
    assert.ok(head.includes('<meta property="og:description" content="' + description + '">'));
    assert.ok(head.includes('<meta property="og:url" content="' + url + '">'));
    assert.ok(head.includes('<meta property="og:type" content="article">'));
    assert.ok(head.includes('<meta name="twitter:title" content="' + title + '">'));
    assert.ok(head.includes('<meta name="twitter:description" content="' + description + '">'));
    assert.ok(head.includes('<meta name="twitter:card" content="summary_large_image">'));
    const image = head.match(/<meta property="og:image" content="([^"]+)">/)?.[1];
    assert.equal(image, SITE_ORIGIN + '/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png');
    assert.ok(head.includes('<meta name="twitter:image" content="' + image + '">'));
    assert.equal((head.match(/property="og:title"/g) || []).length, 1);
    assert.equal((head.match(/property="og:description"/g) || []).length, 1);
    const result = canonicalizePublishedHtml(html, url);
    assert.ok(result.inserted || result.html.includes('<link rel="canonical" href="' + url + '">'));
    assert.equal(result.html.split(/<\/head>/i)[1], html.split(/<\/head>/i)[1]);
    assert.equal(result.warnings.length, 0);
  }
});

#!/usr/bin/env node
// Isolated rendering check: external APIs are blocked, so no live submissions occur.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.WIKI_PREVIEW_OUTPUT || '/tmp/moonboys-war-preview';
const slugs = ['bitcoin-kids', 'bitcoin-x-kids', 'bitcoin-kid-army', 'the-bitcoin-kid-army', 'hodl-warriors', 'hodl-x-warriors', 'hodl-wars'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Invalid path');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end('Not found'); }
});
await fs.mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const report = [];
const searchOnly = process.argv.includes('--search-only');
// The shared wiki CSS scrolls smoothly even with reducedMotion enabled.
// Wait for its final position before checking header clearance or taking images.
async function waitForScrollEnd(page) {
  await page.evaluate(() => new Promise(resolve => {
    let previous = scrollY, stable = 0;
    function frame() {
      stable = Math.abs(scrollY - previous) < 0.5 ? stable + 1 : 0;
      previous = scrollY;
      if (stable >= 8) resolve();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
}
const searchSubjects = [
  ['Mina Patch', 'bitcoin-kids'], ['Tavi Rill', 'bitcoin-kids'],
  ['Ada Wren', 'bitcoin-x-kids'], ['Esme Sorn', 'bitcoin-x-kids'], ['Len Arc', 'bitcoin-x-kids'],
  ['Cal Vetch', 'bitcoin-kid-army'], ['Jalen Rusk', 'bitcoin-kid-army'],
  ['Osa Flint', 'hodl-warriors'], ['Hester Brake', 'hodl-x-warriors'], ['Cass Nine', 'hodl-x-warriors'],
  ['Beren Toll', 'hodl-wars'], ['Dima Voss', 'hodl-wars']
];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  if (!searchOnly) for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const slug of slugs) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors = [], bibleRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (/\/wiki\/bibles\//.test(request.url())) bibleRequests.push(request.url()); });
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'cryptomoonboys.com' && url.pathname === '/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png') {
          return route.fulfill({ path: path.join(root, 'img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png'), contentType: 'image/png' });
        }
        return route.abort();
      });
      await page.goto(`${origin}/wiki/${slug}.html`, { waitUntil: 'networkidle' });
      const contents = page.locator('details.article-contents');
      assert.equal(await contents.count(), 1, `${slug}: one contents navigation`);
      assert.equal(await page.locator('h1:visible').count(), 1, `${slug}: one visible title`);
      assert.equal(await page.locator(`.wiki-comments[data-page-id="${slug}"]`).count(), 1, `${slug}: comments retained`);
      await contents.locator('summary').click();
      assert.equal(await contents.getAttribute('open'), '', `${slug}: contents opens`);
      const targets = await contents.locator('a').evaluateAll(links => links.map(link => link.hash.slice(1)));
      const structure = await page.evaluate(ids => {
        const all = [...document.querySelectorAll('[id]')].map(element => element.id);
        return {
          targets: ids.every(id => document.getElementById(id)?.tagName === 'H2'),
          unique: new Set(all).size === all.length,
          overflow: document.documentElement.scrollWidth > innerWidth + 1
        };
      }, targets);
      assert.ok(structure.targets && structure.unique, `${slug}: all targets resolve and IDs are unique`);
      assert.equal(structure.overflow, false, `${slug}: no horizontal overflow at ${viewport.width}`);
      for (const index of [0, Math.floor(targets.length / 2), targets.length - 1]) {
        await contents.locator(`a[href="#${targets[index]}"]`).click();
        assert.equal(new URL(page.url()).hash, `#${targets[index]}`);
        await page.waitForFunction(id => {
          const rect = document.getElementById(id).getBoundingClientRect();
          const headerBottom = document.getElementById('site-header')?.getBoundingClientRect().bottom || 0;
          return rect.top >= headerBottom + 8 && rect.top < innerHeight;
        }, targets[index]);
        await waitForScrollEnd(page);
        const headerBottom = await page.locator('#site-header').evaluate(header => header.getBoundingClientRect().bottom);
        const box = await page.locator(`#${targets[index]}`).boundingBox();
        assert.ok(box && box.y >= headerBottom + 8 && box.y < viewport.height, `${slug}: target ${targets[index]} clears the header after scrolling stops`);
        if (index === Math.floor(targets.length / 2)) await page.screenshot({ path: path.join(output, `${slug}-${viewport.width}-contents-jump.png`) });
      }
      await contents.locator('summary').click();
      for (const [position, fraction] of [['top', 0], ['middle', 0.5], ['bottom', 1]]) {
        await page.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), fraction);
        await waitForScrollEnd(page);
        await page.screenshot({ path: path.join(output, `${slug}-${viewport.width}-${position}.png`) });
      }
      assert.deepEqual(errors, [], `${slug}: no script errors`);
      assert.deepEqual(bibleRequests, [], `${slug}: no legacy bible injection`);
      report.push({ slug, width: viewport.width, targets: targets.length, overflow: false, scriptErrors: errors.length, bibleRequests: bibleRequests.length });
      console.log(`Rendered ${slug} at ${viewport.width}: ${targets.length} contents targets, no overflow or script errors`);
      await page.close();
    }
  }
  // Native contents must remain usable without any shared-shell JavaScript.
  if (!searchOnly) for (const slug of slugs) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/wiki/${slug}.html`, { waitUntil: 'networkidle' });
    await page.locator('details.article-contents summary').click();
    assert.equal(await page.locator('details.article-contents').getAttribute('open'), '');
    assert.equal(await page.locator('h1:visible').count(), 1);
    await page.close();
  }
  const searchPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await searchPage.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  for (const [query, slug] of searchSubjects) {
    await searchPage.goto(`${origin}/search.html?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle' });
    await searchPage.locator(`#search-results-page a[href="/wiki/${slug}.html"]`).waitFor();
    const input = searchPage.locator('#search-input');
    await input.fill('');
    await input.fill(query);
    await searchPage.locator(`#search-results a[href="/wiki/${slug}.html"]`).waitFor();
    const result = await searchPage.evaluate(q => {
      const tokens = tokenizeSearchQuery(q).filter(token => token.length >= 3 && !SEARCH_TEXT_STOP_WORDS.has(token));
      return { count: tokens.length, rows: selectSearchMatches(q, { allowPartialFallback: true, limit: 5 }).scored.map(row => ({ url: row.item.url, matched: row.meaningfulMatchedTokenCount })) };
    }, query);
    assert.equal(result.rows.find(row => row.url === `/wiki/${slug}.html`)?.matched, result.count, `${query}: all meaningful words match in the browser`);
  }
  await searchPage.close();
  await fs.writeFile(path.join(output, 'search-report.json'), `${JSON.stringify({ browser: browser.version(), queries: searchSubjects.length, fullSearch: true, autocomplete: true }, null, 2)}\n`);
  if (!searchOnly) await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify({ browser: browser.version(), pages: report, noJavaScriptPages: slugs.length }, null, 2)}\n`);
  console.log(JSON.stringify({ browser: browser.version(), viewports: report.length, contentsTargets: report.reduce((n, row) => n + row.targets, 0), noJavaScriptPages: searchOnly ? 0 : slugs.length, searchQueries: searchSubjects.length, output }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

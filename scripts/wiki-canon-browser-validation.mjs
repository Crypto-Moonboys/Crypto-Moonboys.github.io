#!/usr/bin/env node
// Isolated acceptance preview: all external requests are aborted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = '/tmp/gk1458-browser';
const created = ['whisper-codex', 'six-pillars', 'great-consensus', 'the-crypto-moongirls', 'agent-sam', 'house-of-rackinsats', 'kael-voss', 'sylas-the-unbroken', 'veyra-nyx'];
const updated = ['rune-tag', 'squeaky-pinks-enforcers', 'hard-fork-games', 'block-topia', 'queen-sarah-p-fly', 'the-princess', 'the-code-alchemists', 'croydon-tower-blocks', 'elder-codex-7', 'iris-7', 'aleema-child-of-the-shard', 'dream-sovereign', 'graffpunks', 'gkniftyheads', 'hodl-warriors', 'whale-lords', 'first-witness-forty-paths', 'first-witness-faction-commentaries', 'alfie-bitcoin-kid-blaze', 'jodie-zoom-2000', 'null-the-prophet', 'bitcoin-kids', 'genesis-kernel', 'hodl-wars', 'sacred-chain', 'the-hard-fork-rockers', 'the-nomad-bears', 'the-crypto-stoned-boys'];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, `.${name}`);
    if (!filename.startsWith(`${root}${path.sep}`)) throw new Error('Invalid path');
    const body = await fs.readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
await fs.mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  for (const width of [1440, 390]) for (const slug of [...created, ...updated]) {
    console.log(`Checking ${slug} at ${width}`);
    const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/wiki/${slug}.html`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('h1:visible').count(), 1, slug);
    // Dream Sovereign retains its pre-existing static reference without a comment mount.
    if (slug !== 'dream-sovereign') assert.equal(await page.locator(`.wiki-comments[data-page-id="${slug}"]`).count(), 1);
    if (created.includes(slug)) assert.equal(await page.locator('article > header.wiki-hero').count(), 1);
    const contents = page.locator('details:has(nav[aria-label="Article contents"])');
    await contents.locator('summary').click();
    const targets = await contents.locator('a').evaluateAll(nodes => nodes.map(n => n.hash.slice(1)));
    const result = await page.evaluate(ids => ({
      valid: ids.every(id => document.getElementById(id)?.tagName === 'H2'),
      duplicate: [...document.querySelectorAll('[id]')].map(n => n.id).some((id, i, ids) => ids.indexOf(id) !== i),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }), targets);
    assert.ok(result.valid && !result.duplicate, `${slug}: native contents and unique IDs`);
    assert.equal(result.overflow, false, `${slug} at ${width}`);
    await contents.locator(`a[href="#${targets.at(-1)}"]`).click();
    assert.equal(new URL(page.url()).hash, `#${targets.at(-1)}`);
    if (created.includes(slug)) {
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); });
      await page.screenshot({ path: path.join(output, `${slug}-${width}.png`) });
    }
    assert.deepEqual(errors, [], `${slug}: script errors`);
    report.push({ slug, width, contentsTargets: targets.length, scriptErrors: 0, overflow: false });
    await page.close();
  }
  for (const slug of [...created, ...updated]) {
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/wiki/${slug}.html`);
    await page.locator('details:has(nav[aria-label="Article contents"]) summary').click();
    assert.equal(await page.locator('details:has(nav[aria-label="Article contents"])').getAttribute('open'), '');
    await page.close();
  }
  const queries = [['Omega Hash', 'whisper-codex'], ['Memory-Sigils', 'six-pillars'], ['Lysa Rook', 'great-consensus'], ['Dara Venn', 'the-crypto-moongirls'], ['Neural Rack', 'agent-sam'], ['Papa Des', 'house-of-rackinsats'], ['Red Wax Payment', 'elder-codex-7'], ['Codex Schools', 'iris-7'], ['Future Sovereign', 'dream-sovereign'], ['Hot Wall', 'graffpunks'], ['Stencil Witches', 'graffpunks'], ['Royal Galleries', 'gkniftyheads'], ['Flesh Fade', 'agent-sam'], ['Eternal Porch', 'house-of-rackinsats'], ['Porch Accord', 'whale-lords'], ['HODL Layer Sentinels', 'hodl-warriors'], ['Kael Voss', 'kael-voss'], ['Sylas the Unbroken', 'sylas-the-unbroken'], ['Veyra Nyx', 'veyra-nyx'], ['Paid Exit', 'kael-voss'], ['Post-HODL Fallback', 'hodl-warriors'], ['A-B Testing Anarchy', 'the-hard-fork-rockers'], ['Nomad inside population judgement', 'the-nomad-bears'], ['Punk Net refusal', 'the-crypto-stoned-boys']];
  const page = await browser.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  for (const [query, slug] of queries) {
    await page.goto(`${origin}/search.html?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle' });
    await page.locator(`#search-results-page a[href="/wiki/${slug}.html"]`).waitFor();
    await page.locator('#search-input').fill(query);
    await page.locator(`#search-results a[href="/wiki/${slug}.html"]`).waitFor();
  }
  const result = { browser: browser.version(), pages: report, noJavaScriptPages: created.length + updated.length, searchQueries: queries.length, externalRequestsBlocked: true };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
  console.log(`Browser validation passed: ${report.length} desktop/mobile views, ${created.length + updated.length} no-JavaScript pages, ${queries.length} full-search and autocomplete queries. Screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

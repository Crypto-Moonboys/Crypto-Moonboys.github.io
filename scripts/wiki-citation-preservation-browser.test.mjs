import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['alfie-bitcoin-kid-blaze', 'queen-sarah-p-fly', 'the-squeaky-pinks', 'maidstone-base', 'whale-lords'];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name.startsWith('/__citation-test-api/')) {
      assert.equal(req.method, 'GET', 'unlinked browser must never submit a vote');
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ score: 7 }));
      return;
    }
    const filename = path.resolve(root, `.${name}`);
    if (!filename.startsWith(`${root}${path.sep}`)) throw Error('Invalid path');
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(await fs.readFile(filename));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  for (const width of [1440, 390]) for (const slug of pages) {
    const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(base => { window.MOONBOYS_API = { BASE_URL: base }; }, `${origin}/__citation-test-api`);
    await page.goto(`${origin}/wiki/${slug}.html`, { waitUntil: 'networkidle' });
    // Allow both delayed runtime migrations (500/1800ms) to run as well.
    await page.waitForTimeout(1900);
    const panel = page.locator(`.citation-vote-panel[data-page-id="${slug}"]`);
    assert.equal(await panel.count(), 1, `${slug}: one preserved panel`);
    assert.equal(await panel.locator('h2').textContent(), 'Citation Credibility');
    assert.equal(await panel.locator('button.cite-vote-btn').count(), 2);
    assert.equal(await panel.locator('.cite-vote-score').textContent(), '7', `${slug}: public citation score loads`);
    await panel.scrollIntoViewIfNeeded();
    assert.ok(await panel.isVisible(), `${slug}: migration CSS cannot hide voting`);
    await page.evaluate(() => { window.__citationGateCalls = 0; window.MOONBOYS_IDENTITY = { requireLinkedAccount() { window.__citationGateCalls++; } }; });
    await panel.locator('button[data-action="up"]').click();
    assert.equal(await page.evaluate(() => window.__citationGateCalls), 1, `${slug}: voting invokes account gate`);
    assert.deepEqual(errors, [], `${slug}: no runtime errors`);
    await page.close();
  }
  for (const slug of pages) {
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/wiki/${slug}.html`);
    const panel = page.locator('.citation-vote-panel');
    assert.equal(await panel.count(), 1);
    assert.ok(await panel.isVisible(), `${slug}: no-JavaScript credibility section remains readable`);
    await page.close();
  }
  console.log('Citation preservation passed: 10 desktop/mobile views, public scores/account gate and 5 no-JavaScript views; only local mock API used.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('gpt-users.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const resources = new Map([
  ['/gpt-users.html', { body: html, contentType: 'text/html' }],
  ['/guides/sparky/creator-campaign.md', { body: read('guides/sparky/creator-campaign.md'), contentType: 'text/markdown' }],
  ['/css/wiki.css', { body: read('css/wiki.css'), contentType: 'text/css' }],
  ['/css/page-hero-art.css', { body: read('css/page-hero-art.css'), contentType: 'text/css' }],
]);

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const resource = resources.get(new URL(route.request().url()).pathname);
      return resource ? route.fulfill(resource) : route.abort();
    });
    await page.goto('http://creator.test/gpt-users.html');
    const cta = page.locator('a.launch');
    assert.equal(await cta.count(), 1, 'exactly one ChatGPT launch');
    assert.equal(await cta.isVisible(), true);
    const prompt = new URL(await cta.getAttribute('href')).searchParams.get('q');
    assert.match(prompt, /guides\/sparky\/creator-campaign\.md/);
    assert.match(prompt, /ONE consistent mascot/);
    assert.equal(await page.locator('.gpt-group, #creator-memory-studio').count(), 0);
    assert.equal(await page.locator('a[download]').getAttribute('href'), '/guides/sparky/creator-campaign.md');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow at ' + width);
    assert.deepEqual(errors, [], 'browser errors at ' + width);
    await page.close();
  }
} finally {
  await browser.close();
}

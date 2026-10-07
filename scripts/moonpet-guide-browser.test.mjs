import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const guide = createRequire(import.meta.url)('../js/moonpet-guide.js');
const root = process.cwd();
const out = path.join(root, 'output', 'moonpet-guide');
await fs.mkdir(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
    res.end(await fs.readFile(target));
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, reducedMotion: 'reduce' });
    const remoteRequests = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      remoteRequests.push(url.pathname);
      if (url.hostname === 'telegram.org') return route.fulfill({ contentType: 'text/javascript', body: 'window.Telegram={WebApp:{initData:"",ready(){},expand(){},onEvent(){}}};' });
      // Public panels run against local empty responses. Never contact a player
      // API, production radio or external account from a browser validation.
      if (route.request().resourceType() === 'fetch' || route.request().resourceType() === 'xhr') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, entries: [], items: [], daily: [], state: null }) });
      return route.abort();
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    for (const [url, ids] of [
      ['/how-to-play-crypto-moonboy-pets.html', guide.sections.map(s => s.id)],
      ['/wiki/crypto-moonboy-pets.html', guide.about.map(s => s.id)]
    ]) {
      await page.goto(base + url, { waitUntil: 'networkidle' });
      for (const id of ids) assert.equal(await page.locator('#moonpet-' + id).count(), 1, url + ':' + id);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, url + ' must fit at ' + width);
      const invalidLinks = await page.locator('main a[href]').evaluateAll(links => links.map(a => a.getAttribute('href')).filter(href => href.startsWith('#') && !document.getElementById(href.slice(1))));
      assert.deepEqual(invalidLinks, [], 'topic anchors resolve');
      await page.screenshot({ path: path.join(out, (url.includes('/wiki/') ? 'about' : 'guide') + '-' + width + '.png'), fullPage: true });
    }
    await page.goto(base + '/moonpet-game.html', { waitUntil: 'networkidle' });
    const opener = page.locator('#screen [data-utility="guide"]');
    await opener.click();
    assert.equal(await page.locator('#utility-title').textContent(), 'HOW TO PLAY MOONPET OS');
    assert.equal(await page.locator('.guide-step').count(), guide.sections.length);
    for (const topic of await page.locator('.guide-step > summary').all()) {
      await topic.click();
      await topic.press('Enter');
    }
    await page.locator('.guide-step').evaluateAll(steps => steps.forEach(step => step.open = true));
    assert.equal(await page.locator('#utility-content').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'game help must fit at ' + width);
    await page.locator('#utility-content').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: path.join(out, 'game-guide-' + width + '.png') });
    await page.locator('#utility-content [data-utility="about"]').click();
    assert.equal(await page.locator('#utility-title').textContent(), 'ABOUT MOONPET OS');
    assert.equal(await page.locator('#utility-content').evaluate(el => el.scrollTop), 0, 'new help view starts at the top');
    assert.equal(await page.locator('.guide-step').count(), guide.about.length);
    assert.match(await page.locator('#utility-content').textContent(), /no automatic seasonal reset, replacement or retirement/);
    assert.equal(await page.locator('#utility-content').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.locator('.guide-step').evaluateAll(steps => steps.forEach(step => step.open = true));
    await page.screenshot({ path: path.join(out, 'game-about-' + width + '.png') });
    await page.locator('#utility-content [data-utility="guide"]').click();
    await page.locator('.guide-step').evaluateAll(steps => steps.forEach(step => step.open = false));
    await page.locator('[data-utility-close]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.guide-step > summary').first().evaluate(el => el === document.activeElement), true, 'keyboard reaches topic summaries');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.guide-step').first().getAttribute('open') !== null, true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#utility-content [data-utility="about"]').evaluate(el => el === document.activeElement), true, 'focus wraps inside modal');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#utility-layer').isHidden(), true);
    assert.equal(await opener.evaluate(el => el === document.activeElement), true, 'close restores opener focus after guide/About navigation');
    await page.locator('#screen [data-utility="about"]').click();
    await page.locator('[data-utility-close]').click();
    assert.equal(await page.locator('#screen [data-utility="about"]').evaluate(el => el === document.activeElement), true);
    assert.deepEqual(pageErrors, [], 'no JavaScript errors at ' + width);
    assert.equal(remoteRequests.some(url => /\/telegram-pets\/app\/(?:action|state)/.test(url)), false, 'signed-out help never requests player state or actions');
    await context.close();
    console.log('Website guide/About, in-game dialogs, topics, links, focus and overflow passed at ' + width + 'px.');
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

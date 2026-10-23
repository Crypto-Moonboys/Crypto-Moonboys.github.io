import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.HERO_SCREENSHOT_DIR || path.join(tmpdir(), 'homepage-hero-verification');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    assert.ok(file.startsWith(root + path.sep));
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    // Keep real local scripts, CSS and artwork; avoid third-party video/API traffic.
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.locator('.homepage-build-cta h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.home-neon-cityscape img').evaluate(image => image.decode());
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion });
      const result = await page.evaluate(() => {
        const duplicate = document.getElementById('home-top-message');
        const original = document.querySelector('.homepage-build-cta');
        const props = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background', 'text-shadow', 'animation', 'padding', 'margin', 'border', 'border-radius', 'outline', 'box-shadow', 'letter-spacing', 'text-transform', 'text-align', 'width', 'max-width', 'opacity', 'display', 'visibility'];
        // Sample both animations at the same phase without changing their CSS.
        document.querySelectorAll('.hero-pulse-line').forEach(e => e.getAnimations().forEach(a => { a.pause(); a.currentTime = 2250; }));
        const styles = section => [section, section.firstElementChild, section.querySelector('h1'), section.querySelector('h1 span'), section.querySelector('p')].map(e => Object.fromEntries(props.map(p => [p, getComputedStyle(e).getPropertyValue(p)])));
        const image = document.querySelector('.home-neon-cityscape img');
        const rect = image.getBoundingClientRect();
        return {
          duplicate: styles(duplicate), original: styles(original),
          markupMatches: duplicate.firstElementChild.innerHTML === original.firstElementChild.innerHTML,
          first: document.querySelector('main').firstElementChild.classList.contains('home-neon-cityscape'),
          followsImage: duplicate.previousElementSibling.classList.contains('home-neon-cityscape'),
          precedesBadDays: duplicate.nextElementSibling.getAttribute('aria-label') === 'Crypto Moonboys Bad Days 1',
          originalBeforeBuilder: original.nextElementSibling.id === 'build-moonboy',
          originalMoved: original.firstElementChild.dataset.homepageCtaMoved === 'true',
          duplicateNotMoved: !duplicate.firstElementChild.dataset.homepageCtaMoved,
          inlineStyles: duplicate.querySelectorAll('[style]').length + Number(duplicate.hasAttribute('style')),
          noOverflow: document.documentElement.scrollWidth === innerWidth && [duplicate, original].every(s => [...s.querySelectorAll('h1,p')].every(e => e.scrollWidth <= e.clientWidth)),
          imageFullWidth: rect.width === innerWidth,
          imageNaturalHeight: Math.abs(rect.height - rect.width * image.naturalHeight / image.naturalWidth) < 1
        };
      });
      assert.deepEqual(result.duplicate, result.original, width + 'px computed style parity');
      for (const key of ['markupMatches', 'first', 'followsImage', 'precedesBadDays', 'originalBeforeBuilder', 'originalMoved', 'duplicateNotMoved', 'noOverflow', 'imageFullWidth', 'imageNaturalHeight']) assert.equal(result[key], true, width + 'px ' + key);
      assert.equal(result.inlineStyles, 0);
      assert.equal(result.duplicate[0].background.startsWith('rgba(0, 0, 0, 0)'), true, 'No section panel');
      assert.equal(result.duplicate[2].background.startsWith('rgba(0, 0, 0, 0)'), true, 'No heading panel');
      assert.equal(result.duplicate[2].border.startsWith('0px'), true, 'No heading border');
      assert.ok(result.duplicate[4].animation.includes(reducedMotion === 'reduce' ? 'none' : 'heroPulse'));
      if (reducedMotion === 'no-preference') {
        for (const [name, selector] of [['duplicate', '#home-top-message'], ['original', '.homepage-build-cta']]) {
          await page.locator(selector).screenshot({ path: path.join(output, width + '-' + name + '.png') });
        }
      }
      console.log(width + 'px / ' + reducedMotion + ': style, text, placement, visibility, overflow and image checks passed');
    }
    await page.close();
  }
  console.log('Screenshots: ' + output);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

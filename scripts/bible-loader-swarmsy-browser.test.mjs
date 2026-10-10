import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
// Use the real protected article rather than a fixture with a hand-picked ID.
const html = read('wiki/crypto-moonboys.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const loader = read('js/bible-loader.js');
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent(html);
    const before = await page.locator('article[data-entity-slug="crypto-moonboys"]').innerHTML();
    await page.addScriptTag({ content: loader });
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    const panel = page.locator('article[data-entity-slug="crypto-moonboys"] > #swarmsy-current');
    assert.equal(await panel.count(), 1, `${width}: clarification is inserted inside the real article`);
    assert.ok(await panel.isVisible(), `${width}: clarification is visible`);
    assert.match(await panel.textContent(), /optional locally run PC beta/);
    assert.match(await panel.textContent(), /not a hosted SWARMSY chat/);
    assert.equal(await panel.locator('.cm-role-card').count(), 4, `${width}: implementation cards render`);
    assert.equal(await panel.locator('.cm-actions a').first().getAttribute('href'), '/gpt-users.html');
    assert.equal(await panel.locator('.cm-actions a').last().getAttribute('href'), 'https://github.com/Crypto-Moonboys/SWARMSY-Ai');
    assert.equal(await panel.evaluate(el => el.previousElementSibling?.querySelector('h2')?.id), 'swarmsy');
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    assert.equal(await panel.count(), 1, `${width}: repeated initialization cannot duplicate the panel`);
    const restored = await page.locator('article[data-entity-slug="crypto-moonboys"]').evaluate(article => {
      const copy = article.cloneNode(true);
      copy.querySelector('#swarmsy-current').remove();
      return copy.innerHTML;
    });
    assert.equal(restored, before, `${width}: protected article DOM is otherwise unchanged`);
    assert.deepEqual(errors, [], `${width}: no runtime errors`);
    await page.close();
  }
  console.log('SWARMSY clarification passed: real article DOM, desktop/mobile rendering, both CTAs, four cards, placement, duplicate protection and narrative preservation.');
} finally {
  await browser?.close();
}

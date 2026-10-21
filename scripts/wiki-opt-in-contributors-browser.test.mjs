import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const commentsJs = await readFile(new URL('../js/comments.js', import.meta.url), 'utf8');
const contributorsJs = await readFile(new URL('../js/wiki-live-contributors.js', import.meta.url), 'utf8');

test('opt-in Wiki contributors display only source-backed article comment counts', async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<!doctype html><html lang="en"><body class="page-wiki">' +
      '<main><div class="wiki-comments" data-page-id="test-article"></div></main>' +
      '</body></html>');
    await page.evaluate(() => {
      window.MOONBOYS_API = { BASE_URL: '/mock-api', FEATURES: { COMMENTS: true } };
      window.__commentFetches = 0;
      window.fetch = async url => {
        if (!String(url).includes('/comments')) throw Error('Unexpected request: ' + url);
        window.__commentFetches++;
        return { ok: true, json: async () => ({
          comments: [
            { name: 'Real Tester', email_hash: 'abc123', votes_up: 2, created_at: new Date().toISOString() },
            { name: 'Real Tester', email_hash: 'abc123', votes_up: 1,
              created_at: new Date(Date.now() - 14 * 86400000).toISOString() },
          ]
        }) };
      };
    });
    await page.addScriptTag({ content: commentsJs });
    assert.equal(await page.locator('.comments-top-contributors').count(), 0,
      'ordinary shared comment form never generates general contributor rankings');
    assert.equal(await page.locator('.cm-comment-account').count(), 1,
      'ordinary article still has just one compact identity row');

    await page.addScriptTag({ content: contributorsJs });
    const card = page.locator('.comments-top-contributors--opt-in');
    await card.waitFor({ state: 'attached' });
    assert.equal(await card.count(), 1, 'specialist module creates exactly one opt-in comment-count panel');
    assert.equal(await card.getAttribute('open'), null,
      'specialist list is collapsed by default');
    assert.match(await card.locator('summary').textContent(), /Article commenters.*approved comments only/);
    await page.waitForFunction(() => document.querySelector('.top-contributor-list')?.textContent.includes('1 comment'));
    await card.locator('summary').click();
    assert.match(await card.locator('.top-contributor-list').textContent(), /Real Tester[\s\S]*1 comment/);
    assert.doesNotMatch(await card.textContent(), /9540|7420|XP\b/,
      'article comment counts must never masquerade as XP rankings');

    await card.locator('[data-period="all_time"]').click();
    await page.waitForFunction(() => document.querySelector('.top-contributor-list')?.textContent.includes('2 comments'));
    assert.equal(await card.locator('[data-period="all_time"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await card.locator('[data-period="week"]').getAttribute('aria-pressed'), 'false');
    assert.ok(await page.evaluate(() => window.__commentFetches >= 2),
      'both article comments and optional contributor views read actual comment source');
    assert.deepEqual(errors, []);
    await page.close();

    // Disabled commentary must not create an empty source-less leaderboard.
    const disabled = await browser.newPage();
    await disabled.setContent('<!doctype html><html lang="en"><body>' +
      '<div class="wiki-comments" data-page-id="disabled"></div></body></html>');
    await disabled.evaluate(() => {
      window.MOONBOYS_API = { BASE_URL: null, FEATURES: { COMMENTS: false } };
    });
    await disabled.addScriptTag({ content: commentsJs });
    await disabled.addScriptTag({ content: contributorsJs });
    assert.equal(await disabled.locator('.comments-top-contributors').count(), 0);
    await disabled.close();
  } finally {
    await browser.close();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const script = await readFile(new URL('../js/comments.js', import.meta.url), 'utf8');

test('Wiki comment identity copy survives initial mount, edits and all account states', async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const account of [
      { name: 'guest', linked: false, hasId: false },
      { name: 'unverified Telegram ID', linked: false, hasId: true },
      { name: 'linked Telegram', linked: true, hasId: true },
    ]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.setContent('<!doctype html><html lang="en"><body>' +
          '<main><div class="wiki-comments" data-page-id="test-article"></div></main>' +
          '</body></html>');
        await page.evaluate(({ linked, hasId }) => {
          window.MOONBOYS_API = { BASE_URL: null, FEATURES: { COMMENTS: false } };
          window.MOONBOYS_IDENTITY = {
            isTelegramLinked: () => linked,
            getTelegramId: () => hasId ? '112233' : null,
            getTelegramAuth: () => linked ? { username: 'tester' } : null,
            getTelegramName: () => linked ? 'Test Player' : '',
            getFreshTelegramAuth: () => Promise.resolve(linked ? { id: '112233' } : null),
          };
        }, account);
        await page.addScriptTag({ content: script });
        const status = page.locator('.wiki-comments .cm-tg-status');
        await status.waitFor({ state: 'visible' });
        const expected = account.linked ? 'Telegram linked: Test Player' :
          account.hasId ? 'Log in with Telegram to access eligible rewards.' :
            'For a verified Telegram account, open My Moonboy.';
        assert.match(await status.textContent(), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          account.name + ' initial comment identity status');
        const initial = await status.textContent();
        assert.doesNotMatch(initial, /Incubator Hub|\/gklink|quick-fill unavailable/i,
          account.name + ' does not restore old onboarding instructions');
        if (!account.linked && !account.hasId) {
          assert.match(initial, /Email comments remain available without Telegram/,
            'guest commenting remains optional and Gravatar/email capable');
        }
        await page.locator('.comment-form [name="name"]').fill('Comment Author');
        assert.equal(await status.textContent(), initial,
          account.name + ' input refresh does not replace initial account guidance');
        assert.equal(await page.locator('.comment-form [name="text"]').count(), 1,
          'comment form remains interactive');
        assert.equal(errors.length, 0, errors.join('\n'));
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

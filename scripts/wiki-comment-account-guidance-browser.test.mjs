import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const script = await readFile(new URL('../js/comments.js', import.meta.url), 'utf8');

test('Wiki comments show a clean composer for Telegram accounts and hide the entire section from visitors', async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const posts = [];
    let reads = 0;
    const origin = 'https://wiki-comments.test';
    page.on('pageerror', error => errors.push(error.message));
    await page.route(origin + '/wiki/test-article.html', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><body><main>' +
        '<p data-story-proposal-link hidden><a href="#wiki-story-proposal">Suggest a story change</a></p>' +
        '<div class="wiki-comments" data-page-id="test-article"></div></main></body></html>',
    }));
    await page.route(origin + '/comments**', async route => {
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON();
        posts.push(payload);
        const moderation = payload.telegram_auth ? 'approved' : 'pending';
        return route.fulfill({ json: { comment_id: '1', moderation } });
      }
      reads++;
      return route.fulfill({ json: { comments: [{ name: 'Test reader', text: 'An existing comment.' }] } });
    });
    await page.goto(origin + '/wiki/test-article.html');
    await page.evaluate(() => {
      window.MOONBOYS_API = { BASE_URL: location.origin, FEATURES: { COMMENTS: true } };
      window.commentAccount = { linked: false, hasId: false, fresh: false };
      const auth = { id: '112233', username: 'tester', first_name: 'Test Player' };
      window.MOONBOYS_IDENTITY = {
        isTelegramLinked: () => window.commentAccount.linked,
        getTelegramId: () => window.commentAccount.hasId ? auth.id : null,
        getTelegramAuth: () => window.commentAccount.linked ? auth : null,
        getTelegramName: () => window.commentAccount.linked ? auth.first_name : '',
        getFreshTelegramAuth: async () => window.commentAccount.fresh ? auth : null,
      };
    });
    await page.addScriptTag({ content: script });
    const section = page.locator('.wiki-comments');
    const form = section.locator('.comment-form[data-page-id]');
    const status = form.locator('.comment-form-status');
    const accountRow = form.locator('.cm-comment-account');
    const draft = form.locator('[name="text"]');
    const submit = form.getByRole('button', { name: 'Post Comment' });
    const story = section.locator('#wiki-story-proposal');
    const changeAccount = account => page.evaluate(account => {
      window.commentAccount = account;
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    }, account);

    const proposalLink = page.locator('[data-story-proposal-link]');
    await section.waitFor({ state: 'hidden' });
    await proposalLink.waitFor({ state: 'hidden' });
    assert.equal(await form.count(), 0);
    assert.equal(reads, 0);

    await changeAccount({ linked: false, hasId: true, fresh: false });
    await section.waitFor({ state: 'hidden' });
    assert.equal(await form.count(), 0, 'a Telegram ID alone does not reveal comments');
    assert.equal(reads, 0);

    await changeAccount({ linked: true, hasId: true, fresh: true });
    await section.getByRole('heading', { name: 'Comments & Battle Layer' }).waitFor();
    await section.getByText('An existing comment.').waitFor();
    await proposalLink.waitFor({ state: 'visible' });
    assert.equal(reads, 1);
    await draft.fill('A signed-in note that should use my Telegram profile.');
    await story.locator('summary').click();
    const login = story.getByRole('link', { name: 'Telegram login' });
    await accountRow.waitFor({ state: 'hidden' });
    await form.locator('.comment-form-identity').waitFor({ state: 'hidden' });
    await login.waitFor({ state: 'hidden' });
    await story.getByText('Your suggestion and Telegram name go to the community group for editorial review.').waitFor();
    assert.match(await draft.inputValue(), /signed-in note/);
    await submit.click();
    await status.getByText('Comment posted.').waitFor();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].name, 'Test Player');
    assert.equal(posts[0].telegram_username, 'tester');
    assert.equal(posts[0].telegram_auth.id, '112233');
    assert.equal(posts[0].email, undefined);
    assert.equal(posts[0].discord_username, undefined);
    assert.equal(await draft.inputValue(), '');
    await accountRow.waitFor({ state: 'hidden' });

    await changeAccount({ linked: true, hasId: true, fresh: false });
    await draft.fill('Keep this draft if my Telegram session is no longer usable.');
    await submit.click();
    await status.getByText(/session has expired/).waitFor();
    assert.equal(posts.length, 1);
    await changeAccount({ linked: false, hasId: false, fresh: false });
    await section.waitFor({ state: 'hidden' });
    await proposalLink.waitFor({ state: 'hidden' });
    await form.dispatchEvent('submit');
    assert.equal(posts.length, 1, 'a hidden composer cannot submit');
    await changeAccount({ linked: true, hasId: true, fresh: true });
    await section.waitFor({ state: 'visible' });
    assert.match(await draft.inputValue(), /Keep this draft/);
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally {
    await browser.close();
  }
});

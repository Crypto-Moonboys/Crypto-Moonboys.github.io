import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const commentsJs = await readFile(new URL('../js/comments.js', import.meta.url), 'utf8');
const contributorsJs = await readFile(new URL('../js/wiki-live-contributors.js', import.meta.url), 'utf8');
const apiConfigJs = await readFile(new URL('../js/api-config.js', import.meta.url), 'utf8');
const migratorJs = await readFile(new URL('../js/wiki-flagship-migrator.js', import.meta.url), 'utf8');

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
    assert.match(await card.locator('summary').textContent(), /Recent article commenters.*50 approved comments/);
    assert.match(await card.locator('.top-contributor-sample-note').textContent(), /up to the 50 newest approved comments.*not complete weekly or all-time totals/i,
      'contributors are labelled as a bounded newest-records sample, not a complete leaderboard');
    assert.match(await card.locator('button[data-period="week"]').textContent(), /Past 7 days in sample/);
    await page.waitForFunction(() => document.querySelector('.top-contributor-list')?.textContent.includes('1 comment'));
    await card.locator('summary').click();
    assert.match(await card.locator('.top-contributor-list').textContent(), /Real Tester[\s\S]*1 comment/);
    assert.doesNotMatch(await card.textContent(), /9540|7420|XP\b/,
      'article comment counts must never masquerade as XP rankings');

    await card.locator('button[data-period="all_time"]').click();
    await page.waitForFunction(() => document.querySelector('.top-contributor-list')?.textContent.includes('2 comments'));
    assert.equal(await card.locator('button[data-period="all_time"]').getAttribute('aria-pressed'), 'true');
    assert.match(await card.locator('button[data-period="all_time"]').textContent(), /All loaded comments/);
    assert.doesNotMatch(await card.textContent(), /\bAll Time\b|\bThis Week\b/i,
      'the newest-50 sample cannot masquerade as complete full-period contributor totals');
    assert.equal(await card.locator('button[data-period="week"]').getAttribute('aria-pressed'), 'false');
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

test('ordinary Wiki article production bootstrap never loads contributor rankings', async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    let contributorLoads = 0;
    let commentRequests = 0;
    page.on('pageerror', err => errors.push(err.message));
    await page.route('https://wiki-bootstrap.example/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/wiki/alcor-exchange.html') {
        return route.fulfill({ contentType: 'text/html', body:
          '<!doctype html><html><head>' +
          '<script>window.MOONBOYS_API={BASE_URL:"/mock-api",FEATURES:{COMMENTS:true}}</script>' +
          '<script src="/js/api-config.js"></script>' +
          '<script src="/js/comments.js"></script></head>' +
          '<body class="page-wiki"><main><article class="wiki-content">' +
          '<h1>Alcor Exchange</h1><p>Ordinary Wiki article.</p></article>' +
          '<div class="wiki-comments" data-page-id="alcor-exchange"></div>' +
          '</main></body></html>' });
      }
      if (pathname === '/js/api-config.js') return route.fulfill({ contentType:'text/javascript', body:apiConfigJs });
      if (pathname === '/js/wiki-flagship-migrator.js') return route.fulfill({ contentType:'text/javascript', body:migratorJs });
      if (pathname === '/js/comments.js') return route.fulfill({ contentType:'text/javascript', body:commentsJs });
      if (pathname === '/js/wiki-live-contributors.js') {
        contributorLoads++;
        return route.fulfill({ contentType:'text/javascript', body:contributorsJs });
      }
      if (pathname === '/mock-api/comments') {
        commentRequests++;
        return route.fulfill({ contentType:'application/json', body:JSON.stringify({comments:[]}) });
      }
      return route.fulfill({contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body:''});
    });

    await page.goto('https://wiki-bootstrap.example/wiki/alcor-exchange.html', { waitUntil:'load' });
    await page.waitForFunction(() => document.querySelector('article.wiki-content')?.dataset.flagshipRuntimeReady === '1');
    await page.locator('.comment-form').waitFor({state:'attached'});
    await page.waitForFunction(() => document.querySelector('script[data-wiki-template-dashboard-runtime]'));
    assert.equal(contributorLoads, 0, 'automatic Wiki migrator must not load the specialist commenter module');
    assert.equal(await page.locator('script[src*="wiki-live-contributors.js"]').count(), 0);
    assert.equal(await page.locator('.comments-top-contributors').count(), 0,
      'ordinary article must remain comment-only after real api-config and migrator bootstrap');
    assert.equal(commentRequests, 1, 'ordinary article must perform only its normal comments request');
    assert.deepEqual(errors, [], 'normal Wiki boot should not throw');
    await page.close();

    const explicit = await readFile(new URL('../wiki/veyra-nyx.html', import.meta.url), 'utf8');
    assert.match(explicit, /src="\/js\/wiki-live-contributors\.js"/,
      'authored opt-in article retains its explicit specialist script');
    assert.doesNotMatch(migratorJs, /addScript\('\/js\/wiki-live-contributors\.js'/,
      'shared Wiki migrator must never inject an opt-in commenter panel');
  } finally {
    await browser.close();
  }
});

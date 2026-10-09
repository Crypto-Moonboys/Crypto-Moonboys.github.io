import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { handleTelegramWebsiteAuth, verifyWebsiteCredential } from '../workers/moonboys-api/telegram-website-auth.js';
import apiWorker from '../workers/moonboys-api/worker.js';
import { API, SITE, ID, fixture, provider } from './lib/telegram-website-auth-fixtures.mjs';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  test(name + ' returning player follows PKCE redirect login and immediately restores server-backed Arcade XP', async () => {
    const { env, sqlite } = fixture();
    const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.addInitScript(({ api }) => { window.MOONBOYS_API = { BASE_URL: api, WEBSITE_LOGIN_ENABLED: true }; }, { api: API });
      let authorization;
      const callbackSessionCookies = [];
      const websiteProofUrls = [];
      let failRenewOnce = false;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (['telegram_auth', 'auth_evidence'].some(key => url.searchParams.getAll(key).some(raw => raw.includes('s1_')))) websiteProofUrls.push(url.pathname);
        if (url.origin === 'https://oauth.telegram.org' && url.pathname === '/auth') {
          authorization = url;
          const callback = API + '/telegram/website/callback?code=browser-test-code&state=' + url.searchParams.get('state');
          return route.fulfill({ contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(callback) + ')</script>' });
        }
        if (url.origin === API) {
          const nodeRequest = new Request(request.url(), { method: request.method(), headers: await request.allHeaders(), body: request.postData() || undefined });
          if (url.pathname === '/telegram/website/callback') callbackSessionCookies.push((nodeRequest.headers.get('Cookie') || '').includes('__Host-moonboys_session='));
          let response;
          if (url.pathname.startsWith('/telegram/website/')) {
            if (url.pathname.endsWith('/renew') && failRenewOnce) {
              failRenewOnce = false;
              response = Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Credentials': 'true' } });
            } else response = await handleTelegramWebsiteAuth(nodeRequest, env, authorization ? provider(authorization) : undefined);
          } else if (['/blocktopia/progression', '/telegram/user/status', '/faction/status'].includes(url.pathname)) {
            response = await apiWorker.fetch(nodeRequest, env);
          } else {
            // Unrelated feed requests are outside this authentication test.
            response = Response.json({ ok: true }, { headers: { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'Content-Type' } });
          }
          const headers = Object.fromEntries(response.headers);
          if (response.headers.getSetCookie().length) headers['set-cookie'] = response.headers.getSetCookie().join('\n');
          // Playwright routes only the first request in an HTTP redirect chain.
          // Use browser navigation between mocked origins so no real provider is contacted.
          if (response.status === 302 || response.status === 303) {
            headers['content-type'] = 'text/html';
            return route.fulfill({ status: 200, headers, body: '<script>location.replace(' + JSON.stringify(response.headers.get('Location')) + ')</script>' });
          }
          return route.fulfill({ status: response.status, headers, body: await response.text() });
        }
        if (url.origin === SITE) {
          const relative = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
          const file = path.resolve(root, '.' + relative);
          if (!file.startsWith(root + path.sep)) return route.abort();
          try { return route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' }); }
          catch { return route.fulfill({ status: 404, body: '' }); }
        }
        return route.abort();
      });
      await page.goto(SITE + '/gkniftyheads-incubator.html', { waitUntil: 'domcontentloaded' });
      await page.locator('[data-telegram-login]').first().click();
      await page.waitForURL(SITE + '/gkniftyheads-incubator.html', { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(async error => {
        throw new Error(new URL(page.url()).pathname + ': ' + (await page.locator('body').innerText()).slice(0, 160) + '\n' + error.message);
      });
      await page.waitForFunction(() => window.MOONBOYS_IDENTITY?.getIdentityTier() === 'telegram_linked');
      await page.waitForFunction(() => window.MOONBOYS_STATE?.getState().source === 'server');
      const state = await page.evaluate(() => ({ id: window.MOONBOYS_IDENTITY.getTelegramId(), state: window.MOONBOYS_STATE.getState(),
        authStored: localStorage.getItem('moonboys_tg_auth'), legacyStored: localStorage.getItem('MOONBOYS_TELEGRAM_AUTH') }));
      assert.equal(state.id, ID);
      assert.equal(state.state.xp, 6300);
      assert.equal(state.state.linked, true);
      assert.equal(state.authStored, null);
      assert.equal(state.legacyStored, null);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 1);
      assert.equal(sqlite.prepare('SELECT xp FROM telegram_users').get().xp, 420);
      assert.equal(errors.length, 0, errors.join('\n'));
      const cookies = await context.cookies(API);
      const session = cookies.find(cookie => cookie.name === '__Host-moonboys_session');
      assert.ok(session?.httpOnly && session.secure);
      assert.equal(session.sameSite, 'Strict');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

      failRenewOnce = true;
      const recovery = await page.evaluate(async () => {
        window.MOONBOYS_IDENTITY.getTelegramAuth().expires_at = 1;
        const failed = await window.MOONBOYS_IDENTITY.getFreshTelegramAuth();
        let allowed = 0;
        await window.MOONBOYS_IDENTITY.requireLinkedAccount(() => allowed++);
        await window.MOONBOYS_FACTION.loadStatus();
        return { failed, allowed, tier: window.MOONBOYS_IDENTITY.getIdentityTier() };
      });
      assert.equal(recovery.failed, null);
      assert.equal(recovery.allowed, 1);
      assert.equal(recovery.tier, 'telegram_linked');
      assert.deepEqual(websiteProofUrls, [], 'website credentials must never enter request URLs');

      const priorProof = await page.evaluate(() => window.MOONBOYS_IDENTITY.getSignedTelegramAuth());
      await page.locator('[data-telegram-login]').first().click();
      await page.waitForFunction(previousHash => {
        const proof = window.MOONBOYS_IDENTITY?.getSignedTelegramAuth();
        return !!proof && proof.hash !== previousHash && window.MOONBOYS_IDENTITY.getIdentityTier() === 'telegram_linked';
      }, priorProof.hash);
      assert.deepEqual(callbackSessionCookies, [false, false], 'Strict cookie is absent on both cross-site callbacks');
      assert.equal((await verifyWebsiteCredential(priorProof, env)).status, 401, 'returning login must revoke the prior credential');
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 1);

      await page.locator('[data-telegram-logout]').click();
      await page.waitForFunction(() => window.MOONBOYS_IDENTITY?.getIdentityTier() === 'guest');
      assert.ok(sqlite.prepare('SELECT revoked_at FROM telegram_website_sessions').get().revoked_at);
    } finally { await browser.close(); }
  });
}

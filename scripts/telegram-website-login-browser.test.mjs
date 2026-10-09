import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { handleTelegramWebsiteAuth, verifyWebsiteCredential } from '../workers/moonboys-api/telegram-website-auth.js';
import apiWorker from '../workers/moonboys-api/worker.js';
import { API, SITE, ID, BOT_TOKEN, fixture, provider, start } from './lib/telegram-website-auth-fixtures.mjs';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const OTHER_ID = '987654321';
function legacyProof(id) {
  const fields = { id, first_name: 'Legacy player', auth_date: Math.floor(Date.now() / 1000) };
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(Object.keys(fields).sort().map(key => key + '=' + fields[key]).join('\n')).digest('hex');
  return { ...fields, hash };
}

for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  test(name + ' returning player follows PKCE redirect login and immediately restores server-backed Arcade XP', async () => {
    const { env, sqlite } = fixture();
    sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, wallet_address) VALUES (?, ?, ?, ?)').run(OTHER_ID, 'Other existing player', 17, 'other-ownership-link');
    sqlite.prepare('INSERT INTO arcade_progression_state (telegram_id, arcade_xp_total) VALUES (?, ?)').run(OTHER_ID, 7777);
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
          } else if (['/blocktopia/progression', '/telegram/user/status', '/faction/status', '/telegram/link/confirm'].includes(url.pathname)) {
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
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 2);
      assert.equal(sqlite.prepare('SELECT xp FROM telegram_users').get().xp, 420);
      assert.equal(errors.length, 0, errors.join('\n'));
      const cookies = await context.cookies(API);
      const session = cookies.find(cookie => cookie.name === '__Host-moonboys_session');
      assert.ok(session?.httpOnly && session.secure);
      assert.equal(session.sameSite, 'Strict');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

      for (const [label, legacyId] of [['different', OTHER_ID], ['same', ID]]) {
        const fragment = '#telegram_auth=' + encodeURIComponent(JSON.stringify(legacyProof(legacyId)));
        await page.goto(SITE + '/gkniftyheads-incubator.html?legacy_case=' + label + fragment, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(expected => document.getElementById('incubator-sync-message')?.textContent.includes(expected), label === 'different' ? 'Log out' : 'Telegram linked successfully');
        const identity = await page.evaluate(() => ({ id: window.MOONBOYS_IDENTITY.getTelegramId(), auth: window.MOONBOYS_IDENTITY.getSignedTelegramAuth(),
          mode: localStorage.getItem('moonboys_tg_session_mode'), cache: localStorage.getItem('moonboys_tg_auth'), legacyCache: localStorage.getItem('MOONBOYS_TELEGRAM_AUTH') }));
        assert.equal(identity.id, ID);
        assert.match(identity.auth.hash, /^s1_/);
        assert.equal(identity.mode, 'website');
        assert.equal(identity.cache, null);
        assert.equal(identity.legacyCache, null);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(id => window.MOONBOYS_IDENTITY?.getSignedTelegramAuth()?.id === id, ID);
        assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ?').get(ID).arcade_xp_total, 6300);
        assert.equal(sqlite.prepare('SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id = ?').get(OTHER_ID).arcade_xp_total, 7777);
        assert.equal(sqlite.prepare('SELECT wallet_address FROM telegram_users WHERE telegram_id = ?').get(OTHER_ID).wallet_address, 'other-ownership-link');
      }

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
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 2);

      const rollbackProof = await page.evaluate(() => window.MOONBOYS_IDENTITY.getSignedTelegramAuth());
      env.TELEGRAM_WEBSITE_LOGIN_ENABLED = 'false';
      const clientSecret = env.TELEGRAM_OIDC_CLIENT_SECRET;
      delete env.TELEGRAM_OIDC_CLIENT_SECRET;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.evaluate(() => window.MOONBOYS_IDENTITY.ready);
      assert.equal(await page.evaluate(() => window.MOONBOYS_IDENTITY.getTelegramAuth()), null);
      assert.equal((await verifyWebsiteCredential(rollbackProof, env)).telegramId, ID);
      await page.locator('[data-telegram-logout]').click();
      await page.waitForFunction(() => window.MOONBOYS_IDENTITY?.getIdentityTier() === 'guest');
      assert.equal((await verifyWebsiteCredential(rollbackProof, env)).status, 401, 'rollback logout must revoke proof after a reload without OIDC secrets');

      env.TELEGRAM_WEBSITE_LOGIN_ENABLED = 'true';
      env.TELEGRAM_OIDC_CLIENT_SECRET = clientSecret;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-telegram-login]').first().click();
      await page.waitForFunction(() => window.MOONBOYS_IDENTITY?.getIdentityTier() === 'telegram_linked');
      const cleanedProof = await page.evaluate(() => window.MOONBOYS_IDENTITY.getSignedTelegramAuth());
      sqlite.exec('UPDATE telegram_website_sessions SET last_seen_at = 1');
      await start(env);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_website_sessions').get().n, 0);
      await page.locator('[data-telegram-logout]').click();
      await page.waitForFunction(() => window.MOONBOYS_IDENTITY?.getIdentityTier() === 'guest');
      assert.equal((await verifyWebsiteCredential(cleanedProof, env)).status, 401);
      assert.equal((await context.cookies(API)).some(cookie => cookie.name === '__Host-moonboys_session'), false);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telegram_users').get().n, 2);
      assert.equal(errors.length, 0, errors.join('\n'));
    } finally { await browser.close(); }
  });
}

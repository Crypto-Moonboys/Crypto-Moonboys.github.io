import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

// Regression: the shared header badge must follow the verified website (OIDC)
// identity — never "Telegram Sync Required" for a linked player.
const root = process.cwd();
const SITE = 'https://example.test';
const API = 'https://api.example.test';
const ID = '123456789';
const OTHER_ID = '987654321';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type, X-Moonboys-CSRF', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const SHARED_SHELL_PAGES = ['/gkniftyheads-incubator.html', '/games/index.html', '/community.html', '/wiki/1m-free-nfts-program.html', '/index.html'];

function session(id, name) {
  const now = Math.floor(Date.now() / 1000);
  return { ok: true, linked: true, source: 'telegram_oidc', telegram_id: id, display_name: name, csrf_token: 'csrf-' + id,
    telegram_auth: { id, first_name: name, auth_date: now, hash: 's1_' + (id === ID ? 'A' : 'B').repeat(43), expires_at: now + 300 } };
}

const badge = page => page.locator('#moonboys-global-status-badge');
async function expectBadge(page, text) {
  await page.waitForFunction(expected => (document.getElementById('moonboys-global-status-badge')?.textContent || '').includes(expected), text, { timeout: 10000 })
    .catch(async error => { throw new Error('badge "' + await badge(page).textContent().catch(() => '') + '" never showed "' + text + '"\n' + error.message); });
}

for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  test(name + ' header badge follows guest, pending, OIDC restoration, navigation, account switch, expiry and logout', async () => {
    const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    const browser = await chromium.launch({ executablePath, headless: true });
    // The mocked cookie session: null = no session (401), otherwise the identity.
    let current = null;
    let hold = null;
    try {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(({ api }) => { window.MOONBOYS_API = { BASE_URL: api, WEBSITE_LOGIN_ENABLED: true }; }, { api: API });
      const errors = [];
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === API) {
          if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
          if (url.pathname === '/telegram/website/capabilities') return route.fulfill({ headers: cors, json: { ok: true, enabled: true } });
          if (url.pathname === '/telegram/website/session' || url.pathname === '/telegram/website/renew') {
            if (hold) await hold;
            return current ? route.fulfill({ headers: cors, json: current }) : route.fulfill({ status: 401, headers: cors, json: { error: 'website_session_expired' } });
          }
          if (url.pathname === '/telegram/website/logout') {
            if (request.method() === 'POST') current = null;
            return route.fulfill({ headers: cors, json: { ok: true, csrf_token: current ? current.csrf_token : null } });
          }
          if (url.pathname === '/telegram/user/status' || url.pathname === '/telegram/link/confirm') {
            return route.fulfill({ status: 401, headers: cors, json: { ok: false, error: 'not_linked' } });
          }
          // Unrelated live-feed requests are outside this header test.
          return route.fulfill({ headers: cors, json: { ok: true } });
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
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));

      // 1. Initial guest: no cookie session → sync is genuinely required.
      await page.goto(SITE + '/gkniftyheads-incubator.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => window.MOONBOYS_IDENTITY.ready);
      await expectBadge(page, 'Telegram Sync Required');
      assert.equal(await page.evaluate(() => window.MOONBOYS_IDENTITY.getIdentityTier()), 'guest');

      // 2. Pending authentication: while the cookie session is unresolved the
      //    badge must not claim a sync is required.
      current = session(ID, 'Returning');
      let release;
      hold = new Promise(resolve => { release = resolve; });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectBadge(page, 'Checking Telegram');
      assert.equal((await badge(page).textContent()).includes('Sync Required'), false);

      // 3. Successful OIDC restoration updates the header without a reload.
      release();
      hold = null;
      await expectBadge(page, 'Telegram Connected');
      const restored = await page.evaluate(() => ({ tier: window.MOONBOYS_IDENTITY.getIdentityTier(), linked: window.MOONBOYS_IDENTITY.isTelegramLinked() }));
      assert.deepEqual(restored, { tier: 'telegram_linked', linked: true });
      assert.equal((await badge(page).textContent()).includes('Sync Required'), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

      // 4. Navigation across shared-shell pages (Incubator, Games, Battle
      //    Chamber, Wiki, Home) keeps the connected state.
      for (const route of SHARED_SHELL_PAGES) {
        await page.goto(SITE + route, { waitUntil: 'domcontentloaded' });
        await expectBadge(page, 'Telegram Connected');
        assert.equal((await badge(page).textContent()).includes('Sync Required'), false, route + ' shows a false sync-required badge');
      }

      // 5. Account switching in the shared cookie updates the header identity.
      current = session(OTHER_ID, 'Switched');
      await page.evaluate(() => window.MOONBOYS_IDENTITY.getFreshTelegramAuth({ force: true }));
      await expectBadge(page, 'Switched');
      assert.equal(await page.evaluate(() => window.MOONBOYS_IDENTITY.getTelegramId()), OTHER_ID);
      await expectBadge(page, 'Telegram Connected');

      // 6. Session expiry clears the identity and the header updates in place.
      current = null;
      await page.evaluate(() => window.MOONBOYS_IDENTITY.getFreshTelegramAuth({ force: true }));
      await expectBadge(page, 'Telegram Sync Required');
      assert.equal(await page.evaluate(() => window.MOONBOYS_IDENTITY.getIdentityTier()), 'guest');

      // 7. Logout after a fresh login returns the header to the guest state.
      current = session(ID, 'Returning');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectBadge(page, 'Telegram Connected');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.evaluate(() => window.MOONBOYS_IDENTITY.logout()),
      ]);
      await page.evaluate(() => window.MOONBOYS_IDENTITY.ready);
      await expectBadge(page, 'Telegram Sync Required');
      assert.equal(await page.evaluate(() => window.MOONBOYS_IDENTITY.getIdentityTier()), 'guest');
      assert.equal(errors.length, 0, errors.join('\n'));
    } finally { await browser.close(); }
  });
}

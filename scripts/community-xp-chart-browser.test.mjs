import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) throw Error('outside root');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const width of [360, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let offline = false, malformed = false, requests = 0;
    let payload = { score_basis: 'community_season', season: { name: 'Test Season' }, entries: [
      { rank: 1, display_name: 'Player <script>alert(1)</script>', xp: 6 },
      { rank: 2, display_name: 'A very long Moonboy name for a narrow screen', xp: 3 },
    ] };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'moonboys-api.test') {
        if (url.pathname !== '/telegram/leaderboard') return route.fulfill({ json: {} });
        requests++;
        if (offline) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
        return route.fulfill({ json: malformed ? { entries: [null] } : payload });
      }
      if (url.pathname.endsWith('/js/api-config.js')) return route.fulfill({ contentType: 'text/javascript', body: (await fs.readFile('js/api-config.js', 'utf8')) + '\nwindow.MOONBOYS_API={BASE_URL:"https://moonboys-api.test",FEATURES:{TELEGRAM_COMMUNITY:true}};' });
      if (url.pathname.endsWith('.js') && !url.pathname.endsWith('/js/telegram-community.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (url.hostname === '127.0.0.1') return route.continue();
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/community.html`);
    const panel = page.locator('#tg-community-leaderboard');
    const refresh = panel.locator('[data-community-refresh]');
    const settled = () => page.waitForFunction(() => document.getElementById('tg-community-leaderboard').getAttribute('aria-busy') === 'false');
    await settled();
    await page.locator('details').filter({ has: panel }).locator('summary').click();
    assert.equal(requests, 1, 'chart and list use one shared fetch');
    assert.equal(await panel.locator('.tg-lb-row').count(), 2);
    assert.equal(await panel.locator('script').count(), 0, 'player names are escaped');
    assert.match(await panel.textContent(), /Community season: Test Season/);
    assert.deepEqual(await panel.locator('.tg-lb-xp').allTextContents(), ['⚡ 6 Community XP', '⚡ 3 Community XP']);
    assert.deepEqual(await panel.locator('.tg-lb-bar > span').evaluateAll(bars => bars.map(bar => bar.style.width)), ['100%', '50%']);
    await panel.scrollIntoViewIfNeeded();
    assert.ok(await panel.locator('.tg-lb-bar > span').first().evaluate(bar => bar.getBoundingClientRect().height > 0 && bar.getBoundingClientRect().width > 0), 'the real page loads chart styling and paints bars');
    assert.ok(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), 'chart fits its container');
    assert.ok(await panel.locator('.tg-lb-xp').evaluateAll(cells => cells.every(cell => cell.getBoundingClientRect().right <= innerWidth)), 'mobile XP values remain visible');
    if (process.env.COMMUNITY_CHART_SCREENSHOT) await panel.screenshot({ path: process.env.COMMUNITY_CHART_SCREENSHOT.replace('.png', `-${width}.png`) });

    offline = true; await refresh.click(); await settled();
    assert.match(await panel.textContent(), /last loaded rankings and chart/);
    assert.equal(await panel.locator('.tg-lb-row').count(), 2);
    offline = false; payload.entries[1].xp = 6; await refresh.click(); await settled();
    assert.equal(await panel.locator('.community-sync-warning').count(), 0);
    assert.deepEqual(await panel.locator('.tg-lb-bar > span').evaluateAll(bars => bars.map(bar => bar.style.width)), ['100%', '100%']);
    malformed = true; await refresh.click(); await settled();
    assert.equal(await panel.locator('.community-sync-warning').count(), 1);
    assert.equal(await panel.locator('.tg-lb-row').count(), 2, 'malformed response preserves the last complete snapshot');
    malformed = false; payload.entries = []; await refresh.click(); await settled();
    assert.match(await panel.textContent(), /No Community XP recorded for this period/);
    assert.match(await panel.textContent(), /Community season: Test Season/);
    assert.equal(await panel.locator('.tg-lb-bar').count(), 0);
    payload = { score_basis: 'all_time', season: null, entries: [{ display_name: 'New player', xp: 0 }] };
    await refresh.click(); await settled();
    assert.match(await panel.textContent(), /All-time Community XP/);
    assert.equal(await panel.locator('.tg-lb-bar > span').evaluate(bar => bar.style.width), '0%');
    offline = true; await page.reload(); await settled();
    await page.locator('details').filter({ has: panel }).locator('summary').click();
    assert.equal(await panel.locator('.tg-lb-row').count(), 0);
    assert.match(await panel.textContent(), /Community XP unavailable/);
    assert.doesNotMatch(await panel.textContent(), /No Community XP recorded/);
    offline = false; await refresh.click(); await settled();
    assert.equal(await panel.locator('.tg-lb-row').count(), 1);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Community XP chart passed at ${width}px: parity, refresh, outage/retry, malformed data, empty season, zero XP and escaping`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }

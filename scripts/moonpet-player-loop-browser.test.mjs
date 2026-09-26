import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

// Local SQLite-backed API fixture: no live player account or network mutations.
const root = process.cwd();
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await fs.readFile(path.join(root, 'workers/moonboys-api/schema.sql'), 'utf8'));
sqlite.exec(await fs.readFile(path.join(root, 'workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql'), 'utf8'));
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const result = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
async function seed(id, phase) {
  sqlite.prepare('INSERT INTO telegram_users (telegram_id, first_name, xp, level) VALUES (?, ?, 0, 1)').run(id, id);
  sqlite.prepare(`INSERT INTO telegram_pet_profiles (telegram_id, pet_name, pet_xp, level, health, energy, happiness, cleanliness, moon_gold)
    VALUES (?, ?, 3240, 20, 100, 80, 70, 90, 100)`).run(id, id);
  await hooks.ensurePetStarterSeasonSlot(db, id);
  const pet = await hooks.ensureActivePetInstance(db, id);
  sqlite.prepare(`INSERT INTO telegram_pet_lifecycle_by_pet (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
    VALUES (?, ?, ?, ?, '{"progress":0,"target":12,"signals":{}}', '[]')`).run(pet.pet_id, id, 'test-' + id, phase);
  sqlite.prepare('UPDATE telegram_pet_instances SET stage=? WHERE pet_id=?').run(phase, pet.pet_id);
}
await seed('browser-egg', 'egg');
await seed('browser-young', 'young');
const token = 'local-browser-test-token';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer(async (request, response) => {
  try {
    const target = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!target.startsWith(root + path.sep)) throw Error('outside root');
    response.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
    response.end(await fs.readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const launch = { headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] };
if (process.env.CHROMIUM_EXECUTABLE_PATH) launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
let browser;
try {
  browser = await chromium.launch(launch);
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], actions = [], unexpected = [];
    let currentUser = 'browser-egg';
    let dailyOverride = null;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'telegram.org') return route.fulfill({ contentType: 'text/javascript', body: `window.Telegram={WebApp:{initData:'local-fixture',viewportHeight:${viewport.height},viewportStableHeight:${viewport.height},ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){}}};` });
      if (url.pathname.includes('/telegram-pets/app/')) {
        const body = route.request().postDataJSON() || {};
        if (url.pathname.endsWith('/performance')) return route.fulfill({ json: { ok: true } });
        let result;
        if (url.pathname.endsWith('/action')) {
          actions.push(body.action);
          result = await hooks.processPetMiniAppAction(db, currentUser, { id: currentUser }, body, token);
        }
        const state = await hooks.buildPetMiniAppState(db, currentUser, token);
        if (dailyOverride) state.run = dailyOverride;
        return route.fulfill({ json: { state, result } });
      }
      if (url.hostname === '127.0.0.1') return route.continue();
      unexpected.push(url.origin + url.pathname); return route.abort();
    });
    const url = `http://127.0.0.1:${server.address().port}/moonpet-game.html`;
    await page.goto(url);
    await page.waitForSelector('[data-panel="care"]');
    for (const action of ['energy_drink', 'dance', 'cuddles']) assert.equal(await page.locator(`[data-panel="care"] [data-action="${action}"]`).count(), 1);
    await page.locator('[data-panel="play-now"] [data-focus="practice"]').click();
    await page.waitForSelector('#practice-build');
    const gameplayCount = () => actions.filter((action) => action !== 'guidance_ack').length;
    const beforeActions = gameplayCount();
    await page.locator('#practice-build').selectOption('scavenger');
    await page.locator('#practice-goal').selectOption('collector');
    await page.locator('[data-practice-action="start"]').click();
    for (let i = 0; i < 3; i++) await page.locator('[data-practice-action="safe"]').click();
    assert.equal(await page.locator('[data-panel="practice"] [data-practice-action]:not([data-practice-action="extract"])').count(), 3, 'third room must offer three upgrade choices');
    const draft = page.locator('[data-panel="practice"] [data-practice-action]:not([data-practice-action="extract"])').first();
    await draft.click();
    const storedBefore = await page.evaluate(() => localStorage.getItem('moonpet-practice-v1'));
    await page.reload();
    await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="practice"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('moonpet-practice-v1')), storedBefore, 'refresh must preserve local practice run');
    assert.equal(gameplayCount(), beforeActions, 'practice must never post a gameplay action (boot notice acknowledgements are separate)');
    const practiceBounds = await page.locator('[data-panel="practice"]').evaluate((panel) => ({ right: panel.getBoundingClientRect().right, width: panel.getBoundingClientRect().width, viewport: window.innerWidth, screenWidth: document.getElementById('screen').clientWidth }));
    assert.ok(practiceBounds.right <= viewport.width, JSON.stringify(practiceBounds));
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-practice-${viewport.width}.png`) });
    await page.locator('[data-practice-action="extract"]').click();
    assert.equal(await page.locator('[data-practice-action="start"]').count(), 1);
    currentUser = 'browser-young';
    await page.reload();
    await page.waitForSelector('[data-panel="care"]');
    for (const screen of ['missions', 'explore', 'work', 'economy', 'profile', 'home']) {
      await page.locator(`[data-screen="${screen}"]`).click();
      assert.ok(await page.locator('#screen [data-panel]').count(), 'screen must render: ' + screen);
      assert.ok(await page.locator('#screen [data-panel]').evaluateAll((panels) => panels.every((panel) => panel.getBoundingClientRect().right <= window.innerWidth)), 'no clipped panel on ' + screen);
      const jumps = await page.locator('#screen [data-jump]').evaluateAll((buttons) => buttons.map((b) => ({ screen: b.dataset.jump, focus: b.dataset.focus })));
      for (const jump of jumps) assert.ok(['home', 'missions', 'explore', 'work', 'economy', 'profile'].includes(jump.screen));
    }
    await page.locator('[data-screen="explore"]').click();
    const districtText = await page.locator('[data-panel="districts"]').textContent();
    assert.ok(!districtText.includes('// 0% REWARD'), 'fractional reward preview must not round to zero');
    assert.equal(await page.locator('[data-practice-action="start"]').count(), 1, 'another pet must not inherit the prior practice run');
    // Verify daily run mode and first-room numbering independently of the real
    // endless-run fixture. Request index stays zero-based; screen is one-based.
    dailyOverride = { run_id: 'daily-fixture', daily: true, current_room: 0, expected_step_index: 0, max_room: 10, score: 0, choices: [{ key: 'explore', label: 'Explore' }], room: { title: 'Alley Entrance', threat: 1 } };
    await page.locator('[data-utility="sync"]').click();
    await page.waitForSelector('[data-action="run_extract"]');
    const dailyText = await page.locator('[data-panel="moon-run"]').textContent();
    assert.ok(dailyText.includes('OFFICIAL DAILY MOON RUN') && dailyText.includes('ROOM 1/10'));
    assert.ok(!dailyText.includes('UNBANKED //') && !dailyText.includes('ENDLESS MOON RUN'));
    assert.equal(await page.locator('[data-action="run_step"]').getAttribute('data-payload').then(JSON.parse).then((x) => x.expected_step_index), 0);
    await page.locator('[data-screen="missions"]').click();
    assert.equal(await page.locator('[data-panel="daily-objectives"] [data-jump]').count(), 5);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, 'mobile viewport must not overflow horizontally');
    assert.deepEqual(errors, [], 'no runtime errors across all six screens');
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-${viewport.width}.png`) });
    console.log(`Moonpet browser loop passed at ${viewport.width}x${viewport.height}; all six screens; egg actions; practice resume/isolation; daily run copy; zero practice API actions.`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  sqlite.close();
}

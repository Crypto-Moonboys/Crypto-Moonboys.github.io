import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { __dailyMoonRunTestHooks as dailyHooks } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { createRequire } from 'node:module';
const { bountyRoutes } = createRequire(import.meta.url)('../js/moonpet-play-options.js');

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
const realCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: realCrypto.subtle, randomUUID: () => realCrypto.randomUUID(), getRandomValues: (values) => { values.fill(0); return values; } } });
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
    assert.ok(await page.locator('#nav button').evaluateAll((buttons) => buttons.length === 6 && buttons.every((b) => b.getBoundingClientRect().right <= innerWidth && b.getBoundingClientRect().left >= 0)), 'all six navigation buttons must fit the viewport');
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
    // Actual rotating bounties navigate without consuming actions or rewards.
    const bountyState = await hooks.buildPetMiniAppState(db, currentUser, token);
    const bountyJumps = new Map(bountyState.guidance.economy.bounties.filter((b) => !b.complete).flatMap(bountyRoutes).map((route) => [route.focus, route]));
    const beforeBountyNavigation = gameplayCount();
    for (const route of bountyJumps.values()) {
      await page.locator('[data-screen="economy"]').click();
      await page.locator(`[data-panel="bounties"] [data-focus="${route.focus}"]`).first().click();
      assert.equal(await page.locator(`[data-panel="${route.focus}"]`).count(), 1);
    }
    assert.equal(gameplayCount(), beforeBountyNavigation);
    // Seed accepted evidence for one current bounty, then use its real claim handler.
    const readyBounty = bountyState.guidance.economy.bounties.find((b) => !b.complete);
    assert.ok(readyBounty);
    const questDay = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < readyBounty.required; i++) sqlite.prepare(`INSERT INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,week_key,status,metadata)
      VALUES (?,?,?,?,?,0,?,?,'fixture','accepted','{}')`).run(realCrypto.randomUUID(), bountyState.pet.pet_id, currentUser, readyBounty.event_types[0], realCrypto.randomUUID(), bountyState.pet.season_key, questDay);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="bounties"]').filter({ hasText: 'CLAIM READY BOUNTIES' }).click();
    const bountyResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'bounty_claim');
    await page.locator('[data-action="bounty_claim"]').filter({ hasText: readyBounty.title }).click();
    const bountyResult = await (await bountyResponse).json();
    assert.equal(bountyResult.result.accepted, true);
    assert.equal(bountyResult.state.guidance.economy.bounties.find((b) => b.key === readyBounty.key).claimed, true);
    await page.waitForFunction(() => document.querySelector('[data-panel="bounties"]').textContent.includes('CLAIMED'));
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
    assert.equal(await page.locator('[data-action="run_extract"]').isDisabled(), true, 'empty run extraction must explain its lock');
    await page.locator('[data-screen="missions"]').click();
    assert.equal(await page.locator('[data-panel="daily-objectives"] [data-jump]').count(), 5);
    // These are real server-backed contract actions, distinct from local practice.
    const youngBefore = await hooks.buildPetMiniAppState(db, currentUser, token);
    await page.locator('#contract-build').selectOption('bruiser');
    await page.locator('#contract-side-goal').selectOption('versatile');
    const oldContractSelect = await page.locator('#contract-build').elementHandle();
    await page.locator('[data-utility="sync"]').click();
    await page.waitForFunction((node) => !node.isConnected, oldContractSelect);
    assert.equal(await page.locator('#contract-build').inputValue(), 'bruiser', 'refresh must preserve build selection');
    assert.equal(await page.locator('#contract-side-goal').inputValue(), 'versatile', 'refresh must preserve optional objective');
    const startContract = page.locator('[data-action="contract_start"]').filter({ hasText: 'BRING THE COURIER HOME' });
    await startContract.click();
    await page.waitForSelector('[data-action="contract_step"]');
    const contractId = await page.locator('[data-action="contract_step"]').first().getAttribute('data-payload').then(JSON.parse).then((x) => x.contract_id);
    for (let turn = 0; turn < 8; turn++) {
      const candidates = page.locator('[data-action="contract_step"]');
      const payloads = await candidates.evaluateAll((buttons) => buttons.map((button) => JSON.parse(button.dataset.payload)));
      const routeChoice = turn === 1 ? 'bold' : turn === 3 ? 'search' : 'cover';
      const chosen = payloads.find((x) => x.choice === routeChoice) || payloads.find((x) => x.choice === 'medkit') || payloads.find((x) => x.choice === 'shield') || payloads.find((x) => x.choice !== 'abandon');
      assert.ok(chosen, 'active contract must offer a route or upgrade');
      const response = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'contract_step');
      await candidates.nth(payloads.indexOf(chosen)).click();
      const data = await (await response).json(); assert.equal(data.result.accepted, true);
      assert.equal(data.state.contracts.run.side_goal.key, 'versatile');
      assert.ok(data.state.contracts.run.room.effect, 'mechanical room effect must be visible');
      await page.waitForFunction((revision) => {
        const button = document.querySelector('[data-action="contract_step"]');
        return !button || JSON.parse(button.dataset.payload).revision !== revision;
      }, chosen.revision);
      if (turn === 2) {
        await page.reload(); await page.waitForSelector('[data-panel="care"]');
        await page.locator('[data-panel="play-now"] [data-focus="contracts"]').click();
        assert.equal(await page.locator('[data-action="contract_step"]').first().getAttribute('data-payload').then(JSON.parse).then((x) => x.contract_id), contractId, 'server contract resumes after reload');
      }
    }
    await page.waitForSelector('[data-action="contract_start"]');
    const youngAfter = await hooks.buildPetMiniAppState(db, currentUser, token);
    assert.equal(youngAfter.contracts.completed, youngBefore.contracts.completed + 1);
    assert.equal(youngAfter.contracts.run.side_goal.earned, true);
    assert.equal(youngAfter.contracts.run.side_goal.rank_points, 60);
    assert.ok((await page.locator('[data-panel="contracts"]').textContent()).includes('RANK INCLUDED'));
    assert.ok(youngAfter.contracts.rank_points > youngBefore.contracts.rank_points);
    assert.equal(youngAfter.pet.moon_gold, youngBefore.pet.moon_gold);
    assert.equal(youngAfter.pet.energy, youngBefore.pet.energy);
    assert.equal(youngAfter.pet.pet_xp - youngBefore.pet.pet_xp, 20);
    assert.ok(await page.locator('[data-panel="contracts"]').evaluate((panel) => panel.getBoundingClientRect().right <= innerWidth), 'contract board fits mobile');
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-contracts-${viewport.width}.png`) });
    // A separate real-Worker fixture begins at the first optional daily checkpoint.
    currentUser = `browser-daily-${viewport.width}`;
    await seed(currentUser, 'young');
    dailyOverride = null;
    const startedDaily = await hooks.processPetMiniAppAction(db, currentUser, { id: currentUser }, { action: 'daily_run_start' }, token);
    assert.equal(startedDaily.accepted, true);
    const dailyId = startedDaily.daily_run.run_id;
    sqlite.prepare('UPDATE telegram_pet_runs SET current_room=3,depth=3,rooms_completed=3 WHERE run_id=?').run(dailyId);
    let dailyStored = sqlite.prepare('SELECT * FROM telegram_pet_runs WHERE run_id=?').get(dailyId);
    const checkpointRoom = await hooks.createPetRunRoom(db, dailyStored);
    await page.reload();
    await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="explore"]').click();
    await page.waitForSelector('[data-action="daily_run_tactic"]');
    assert.equal(await page.locator('[data-action="daily_run_tactic"]').count(), 3);
    assert.ok((await page.locator('[data-action="run_step"]').first().textContent()).includes('RUN SCORE ON SUCCESS'));
    const tacticResponse = page.waitForResponse((response) => response.url().endsWith('/telegram-pets/app/action') && response.request().postDataJSON()?.action === 'daily_run_tactic');
    await page.locator('[data-action="daily_run_tactic"]').filter({ hasText: 'GUARDIAN' }).click();
    assert.equal((await (await tacticResponse).json()).result.accepted, true);
    await page.waitForFunction(() => !document.querySelector('[data-action="daily_run_tactic"]'));
    await page.reload();
    await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="explore"]').click();
    assert.equal(await page.locator('[data-action="daily_run_tactic"]').count(), 0, 'a saved tactic cannot be drafted twice');
    assert.ok((await page.locator('[data-panel="moon-run"]').textContent()).includes('GUARDIAN'));
    const dailyBefore = await hooks.buildPetMiniAppState(db, currentUser, token);
    let winningDailyChoice = null;
    for (const choice of checkpointRoom.choices) {
      const outcome = await dailyHooks.resolveAuthoritativeDailyRoomOutcome(db, dailyStored, checkpointRoom, choice.choice_id);
      if (outcome.success) { winningDailyChoice = choice; break; }
    }
    assert.ok(winningDailyChoice, 'daily browser fixture needs a valid successful route');
    const dailyButtons = page.locator('[data-action="run_step"]');
    const dailyPayloads = await dailyButtons.evaluateAll((buttons) => buttons.map((button) => JSON.parse(button.dataset.payload)));
    const dailyResponse = page.waitForResponse((response) => response.url().endsWith('/telegram-pets/app/action') && response.request().postDataJSON()?.action === 'run_step');
    await dailyButtons.nth(dailyPayloads.findIndex((payload) => payload.choice_key === winningDailyChoice.choice_id)).click();
    const dailyResult = await (await dailyResponse).json();
    assert.equal(dailyResult.result.accepted, true);
    assert.equal(dailyResult.state.run.current_room, 4);
    assert.equal(dailyResult.state.run.score, dailyBefore.run.score + dailyBefore.run.choices.find((choice) => choice.key === winningDailyChoice.choice_id).score);
    assert.equal(dailyResult.state.pet.pet_xp, dailyBefore.pet.pet_xp, 'daily tactics change score, not Pet XP');
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-tactics-${viewport.width}.png`) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, 'mobile viewport must not overflow horizontally');
    assert.deepEqual(errors, [], 'no runtime errors across all six screens');
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-${viewport.width}.png`) });
    console.log(`Moonpet browser loop passed at ${viewport.width}x${viewport.height}; all six screens; bounty routes/claim; practice isolation; contract rooms/side objectives/reload; daily tactic choice/reload/odds/score.`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  sqlite.close();
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: realCrypto });
}

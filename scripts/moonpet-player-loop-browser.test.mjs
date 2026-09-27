import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { __dailyMoonRunTestHooks as dailyHooks } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { getActiveSeasonalBoss } from '../workers/moonboys-api/pets/live-systems.js';
import { createRequire } from 'node:module';
const { bountyRoutes } = createRequire(import.meta.url)('../js/moonpet-play-options.js');

// Local SQLite-backed API fixture: no live player account or network mutations.
const root = process.cwd();
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await fs.readFile(path.join(root, 'workers/moonboys-api/schema.sql'), 'utf8'));
sqlite.exec(await fs.readFile(path.join(root, 'workers/moonboys-api/migrations/048_telegram_pet_player_expansion.sql'), 'utf8'));
sqlite.exec(await fs.readFile(path.join(root, 'workers/moonboys-api/migrations/058_telegram_pet_season_completion.sql'), 'utf8'));
let failActivitySettlement = false;
let failWeeklyReward = false;
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (failActivitySettlement && this.sql.includes('UPDATE telegram_pet_activity_sessions') && this.sql.includes('SET metadata = ?')) {
      failActivitySettlement = false; throw Error('interrupted_activity_settlement');
    }
    if (/\bRETURNING\b/i.test(this.sql)) { const results = sqlite.prepare(this.sql).all(...this.args); return { results, meta: { changes: results.length } }; }
    const result = sqlite.prepare(this.sql).run(...this.args); return { results: [], meta: { changes: Number(result.changes) } };
  }
}
const db = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) {
    if (failWeeklyReward && statements[0].sql.includes('INSERT OR IGNORE INTO telegram_pet_reward_claims') && statements[0].args.includes('pet_weekly_boss')) {
      failWeeklyReward = false; throw Error('interrupted_weekly_reward');
    }
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
    let oldExpeditionState = false;
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
        if (oldExpeditionState) delete state.guidance.economy.expedition_options;
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
    for (const screen of ['work', 'economy']) {
      await page.locator(`[data-screen="${screen}"]`).click();
      assert.equal(await page.locator('#screen [data-action]:not([disabled])').count(), 0, 'egg must not advertise actions that require hatching: ' + screen);
      assert.ok((await page.locator('#screen').textContent()).includes('HATCH REQUIRED'));
    }
    await page.locator('[data-screen="home"]').click();
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
    const weeklyState = await hooks.buildPetMiniAppState(db, currentUser, token);
    const unfinishedWeekly = weeklyState.weekly_journey.objectives.filter((goal) => !goal.completed && goal.progress < goal.target);
    assert.equal(await page.locator('[data-panel="weekly-journey"] [data-jump]').count(), unfinishedWeekly.length);
    assert.ok(!(await page.locator('[data-panel="weekly-journey"]').textContent()).includes('Daily Moon Runs'));
    const weeklyRoutes = await page.locator('[data-panel="weekly-journey"] [data-jump]').evaluateAll((buttons) => buttons.map((b) => ({ screen:b.dataset.jump, focus:b.dataset.focus })));
    const beforeWeeklyNavigation = gameplayCount();
    for (const route of weeklyRoutes) {
      await page.locator('[data-screen="missions"]').click();
      await page.locator(`[data-panel="weekly-journey"] [data-focus="${route.focus}"]`).first().click();
      assert.equal(await page.locator(`[data-panel="${route.focus}"]`).count(), 1);
    }
    assert.equal(gameplayCount(), beforeWeeklyNavigation, 'weekly navigation must not issue gameplay actions');
    await page.locator('[data-screen="missions"]').click();
    // These are real server-backed contract actions, distinct from local practice.
    const youngBefore = await hooks.buildPetMiniAppState(db, currentUser, token);
    await page.locator('#contract-build').selectOption('scavenger');
    await page.locator('#contract-side-goal').selectOption('versatile');
    const oldContractSelect = await page.locator('#contract-build').elementHandle();
    await page.locator('[data-utility="sync"]').click();
    await page.waitForFunction((node) => !node.isConnected, oldContractSelect);
    assert.equal(await page.locator('#contract-build').inputValue(), 'scavenger', 'refresh must preserve build selection');
    assert.equal(await page.locator('#contract-side-goal').inputValue(), 'versatile', 'refresh must preserve optional objective');
    const startContract = page.locator('[data-action="contract_start"]').filter({ hasText: 'BRING THE COURIER HOME' });
    await startContract.click();
    await page.waitForSelector('[data-action="contract_step"]');
    const contractId = await page.locator('[data-action="contract_step"]').first().getAttribute('data-payload').then(JSON.parse).then((x) => x.contract_id);
    const prepButton = page.locator('[data-action="contract_step"]').filter({ hasText: 'SCOUT AHEAD' });
    await prepButton.scrollIntoViewIfNeeded();
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-preparation-${viewport.width}.png`) });
    const beforePrep = await hooks.buildPetMiniAppState(db, currentUser, token);
    const prepResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.choice === 'prepare_scout');
    await prepButton.click();
    const prepared = await (await prepResponse).json();
    assert.equal(prepared.result.accepted, true);
    assert.equal(prepared.state.contracts.run.depth, 0);
    assert.equal(prepared.state.contracts.run.supplies, beforePrep.contracts.run.supplies - 2);
    assert.equal(prepared.state.contracts.run.preparation, 'prepare_scout');
    assert.equal(prepared.state.pet.energy, beforePrep.pet.energy);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="missions"]').click();
    assert.ok((await page.locator('[data-panel="contracts"]').textContent()).includes('SCOUT AHEAD READY'));
    assert.equal(await page.locator('[data-action="contract_step"]').filter({ hasText: 'SCOUT AHEAD' }).count(), 0);
    for (let turn = 0; turn < 8; turn++) {
      if (turn === 2) {
        const beforeRedraw = await hooks.buildPetMiniAppState(db,currentUser,token);
        const redrawButton = page.locator('[data-action="contract_step"]').filter({ hasText: 'REDRAW UPGRADES' });
        assert.equal(await redrawButton.isDisabled(),false);
        await redrawButton.scrollIntoViewIfNeeded();
        if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-redraw-${viewport.width}.png`) });
        const redrawResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.choice === 'redraw_draft');
        await redrawButton.click();
        const redrawn = await (await redrawResponse).json();
        assert.equal(redrawn.result.accepted,true);
        assert.equal(redrawn.state.contracts.run.salvage,beforeRedraw.contracts.run.salvage-15);
        assert.equal(redrawn.state.contracts.run.depth,2);
        assert.equal(redrawn.state.pet.energy,beforeRedraw.pet.energy);
        await page.reload(); await page.waitForSelector('[data-panel="care"]');
        await page.locator('[data-screen="missions"]').click();
        assert.equal(await page.locator('[data-action="contract_step"]').filter({ hasText: 'REDRAW UPGRADES' }).count(),0);
        const reloaded = await hooks.buildPetMiniAppState(db,currentUser,token);
        assert.deepEqual(reloaded.contracts.run.choices,redrawn.state.contracts.run.choices);
        assert.equal(reloaded.contracts.run.salvage,redrawn.state.contracts.run.salvage);
      }
      const candidates = page.locator('[data-action="contract_step"]');
      const payloads = await candidates.evaluateAll((buttons) => buttons.map((button) => JSON.parse(button.dataset.payload)));
      const routeChoice = turn === 1 ? 'bold' : turn === 3 ? 'search' : 'cover';
      const chosen = (turn === 2 && payloads.find((x) => x.choice === 'supply_cache')) || payloads.find((x) => x.choice === routeChoice) || payloads.find((x) => x.choice === 'medkit') || payloads.find((x) => x.choice === 'shield') || payloads.find((x) => x.choice !== 'abandon' && !x.choice.startsWith('prepare_'));
      assert.ok(chosen, 'active contract must offer a route or upgrade');
      const beforeSupply = chosen.choice === 'supply_cache' ? (await hooks.buildPetMiniAppState(db, currentUser, token)).contracts.run : null;
      if (beforeSupply && process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-supply-draft-${viewport.width}.png`) });
      const response = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'contract_step');
      await candidates.nth(payloads.indexOf(chosen)).click();
      const data = await (await response).json(); assert.equal(data.result.accepted, true);
      if (beforeSupply) {
        assert.equal(data.state.contracts.run.supplies, beforeSupply.supplies + 2);
        assert.equal(data.state.contracts.run.depth, beforeSupply.depth);
        assert.deepEqual(data.state.contracts.run.perks, beforeSupply.perks);
        assert.equal(data.state.pet.energy, prepared.state.pet.energy);
      }
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
    assert.equal(await page.locator('#contract-build').inputValue(), 'scavenger', 'finishing a contract must restore the last build');
    assert.equal(await page.locator('#contract-side-goal').inputValue(), 'versatile', 'finishing a contract must restore the last side objective');
    assert.equal(youngAfter.contracts.collection.records.find((record) => record.key === 'escort:scavenger:1').completed, youngAfter.contracts.completed);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="contracts"]').click();
    assert.equal(await page.locator('#contract-build').inputValue(), 'scavenger', 'last setup survives reload');
    assert.equal(await page.locator('#contract-side-goal').inputValue(), 'versatile');
    await page.locator('[data-panel="contracts"] summary').filter({ hasText: 'VIEW ALL ROUTE RECORDS' }).click();
    const recordButtons = page.locator('[data-contract-setup]');
    const setups = await recordButtons.evaluateAll((buttons) => buttons.map((button) => JSON.parse(button.dataset.contractSetup)));
    const lockedRecord = setups.findIndex((setup) => setup.tier === 3);
    assert.equal(await recordButtons.nth(lockedRecord).isDisabled(), true);
    const beforeSetupActions = gameplayCount();
    const nextSetup = setups.findIndex((setup) => setup.build === 'bruiser' && setup.goal === 'salvage' && setup.tier === 1);
    if (process.env.MOONPET_BROWSER_SCREENSHOT) {
      await recordButtons.nth(nextSetup).scrollIntoViewIfNeeded();
      await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-collection-${viewport.width}.png`) });
    }
    await recordButtons.nth(nextSetup).click();
    assert.equal(gameplayCount(), beforeSetupActions, 'selecting a route record must not start or spend anything');
    assert.equal(await page.locator('#contract-build').inputValue(), 'bruiser');
    assert.equal(await page.locator('#contract-tier').inputValue(), '1');
    const selectedQuest = page.locator('[data-action="contract_start"]:focus');
    assert.equal(await selectedQuest.getAttribute('data-payload').then(JSON.parse).then((payload) => payload.goal), 'salvage');
    const collectionStartResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'contract_start');
    await selectedQuest.click();
    const collectionStart = await (await collectionStartResponse).json();
    assert.equal(collectionStart.result.accepted, true);
    assert.equal(collectionStart.state.contracts.run.build, 'bruiser');
    assert.equal(collectionStart.state.contracts.run.goal, 'salvage');
    await page.waitForSelector('[data-action="contract_step"]');
    await page.locator('[data-action="contract_step"]').filter({ hasText: 'ABANDON CONTRACT' }).click();
    await page.waitForSelector('[data-action="contract_start"]');
    assert.ok(await page.locator('[data-panel="contracts"]').evaluate((panel) => panel.getBoundingClientRect().right <= innerWidth), 'contract board fits mobile');
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-contracts-${viewport.width}.png`) });

    // Ten-room format: real controls, saved extra checkpoints, and one final bonus.
    currentUser = `browser-contract-long-${viewport.width}`;
    await seed(currentUser, 'young');
    sqlite.prepare('UPDATE telegram_pet_profiles SET energy=0 WHERE telegram_id=?').run(currentUser);
    sqlite.prepare('UPDATE telegram_pet_instances SET energy=0 WHERE telegram_id=?').run(currentUser);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="contracts"]').click();
    assert.equal(await page.locator('[data-action="contract_start"]').count(), 6);
    await page.locator('#contract-format').selectOption('extended');
    await page.locator('#contract-build').selectOption('scavenger');
    const oldFormat = await page.locator('#contract-format').elementHandle();
    await page.locator('[data-utility="sync"]').click();
    await page.waitForFunction((node) => !node.isConnected, oldFormat);
    assert.equal(await page.locator('#contract-format').inputValue(), 'extended');
    await page.locator('[data-action="contract_start"]').filter({hasText:'TRACE THE LOST SIGNAL'}).click();
    await page.waitForSelector('[data-action="contract_step"]');
    const longBefore = await hooks.buildPetMiniAppState(db, currentUser, token);
    assert.equal(longBefore.contracts.run.max_depth, 10); assert.equal(longBefore.contracts.run.target, 5);
    let longDrafts = 0, pathChoices = 0, resumedPath = false, resumedLong = false, longAfter = longBefore;
    for (let turn = 0; turn < 20 && longAfter.contracts.run.status === 'active'; turn++) {
      const activeLong = longAfter.contracts.run;
      const draft = activeLong.choices.find((c) => c.upgrade && c.key !== 'supply_cache');
      const pathKey = activeLong.path_choices.length ? ['path_quiet', 'path_hazard', 'path_steady'][pathChoices++ % 3] : null;
      const choice = draft ? draft.key : pathKey || 'search';
      if (pathKey) {
        assert.ok((await page.locator('[data-panel="contracts"]').textContent()).includes('OPTIONAL CHECKPOINT PATH'));
        if (pathChoices === 1 && process.env.MOONPET_BROWSER_SCREENSHOT) {
          await page.locator('[data-action="contract_step"]').filter({ hasText: 'SALVAGE HOTSPOT' }).scrollIntoViewIfNeeded();
          await page.screenshot({path:process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-path-options-${viewport.width}.png`)});
        }
      }
      if (draft) longDrafts++;
      if (activeLong.path && !resumedPath) {
        await page.reload(); await page.waitForSelector('[data-panel="care"]');
        assert.equal(await page.locator('[data-action="train"]').isDisabled(), true, 'zero-energy training must show its gate');
        await page.locator('[data-panel="play-now"] [data-focus="contracts"]').click();
        assert.deepEqual((await hooks.buildPetMiniAppState(db, currentUser, token)).contracts.run.path, activeLong.path);
        assert.ok((await page.locator('[data-panel="contracts"]').textContent()).includes('QUIET STREETS // 2 ROOMS LEFT'));
        assert.equal(await page.locator('[data-action="contract_step"]').filter({ hasText: 'SALVAGE HOTSPOT' }).count(), 0, 'saved path cannot be chosen twice');
        if (process.env.MOONPET_BROWSER_SCREENSHOT) {
          await page.locator('[data-panel="contracts"] .line').filter({ hasText: /^PATH \/\// }).scrollIntoViewIfNeeded();
          await page.screenshot({path:process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-path-${viewport.width}.png`)});
        }
        resumedPath = true;
      }
      if (activeLong.depth === 6 && !resumedLong) {
        assert.equal(longAfter.contracts.bonus_remaining, 3); assert.equal(activeLong.rank_points, 0);
        await page.reload(); await page.waitForSelector('[data-panel="care"]');
        await page.locator('[data-panel="play-now"] [data-focus="contracts"]').click();
        const resumed = (await hooks.buildPetMiniAppState(db, currentUser, token)).contracts.run;
        assert.deepEqual(resumed, activeLong); resumedLong = true;
        assert.ok((await page.locator('[data-panel="contracts"]').textContent()).includes('ROOMS 6/10'));
        if (process.env.MOONPET_BROWSER_SCREENSHOT) {
          await page.locator('[data-panel="contracts"]').scrollIntoViewIfNeeded();
          await page.screenshot({path:process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-long-${viewport.width}.png`)});
        }
      }
      const longButtons = page.locator('[data-action="contract_step"]');
      const choiceIndex = await longButtons.evaluateAll((buttons, key) => buttons.findIndex((b) => JSON.parse(b.dataset.payload).choice === key), choice);
      assert.ok(choiceIndex >= 0);
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'contract_step'),
        longButtons.nth(choiceIndex).click(),
      ]);
      const result = await response.json(); assert.equal(result.result.accepted, true);
      longAfter = result.state;
      if (pathKey) {
        assert.equal(longAfter.contracts.run.path.key, pathKey); assert.equal(longAfter.contracts.run.path.remaining, 2);
        assert.equal(longAfter.contracts.run.depth, activeLong.depth); assert.equal(longAfter.contracts.run.rank_points, 0);
        assert.equal(longAfter.contracts.run.salvage, activeLong.salvage); assert.equal(longAfter.contracts.bonus_remaining, 3);
      }

      await page.waitForFunction((revision) => {
        const button=document.querySelector('[data-action="contract_step"]');
        return !button || JSON.parse(button.dataset.payload).revision > revision;
      }, activeLong.revision);
    }
    assert.equal(longDrafts, 4); assert.equal(pathChoices, 4); assert.equal(resumedPath, true); assert.equal(resumedLong, true);
    assert.equal(longAfter.contracts.run.status, 'completed'); assert.equal(longAfter.contracts.run.depth, 10);
    assert.equal(longAfter.contracts.run.xp_awarded, 20); assert.equal(longAfter.contracts.bonus_remaining, 2);
    assert.equal(longAfter.pet.energy, 0); assert.equal(longAfter.pet.moon_gold, longBefore.pet.moon_gold);
    assert.equal(longAfter.contracts.collection.records.find((r) => r.key === 'recon:scavenger:1:extended').completed, 1);
    assert.equal(longAfter.contracts.collection.records.find((r) => r.key === 'recon:scavenger:1').completed, 0);
    assert.equal(await page.locator('#contract-format').inputValue(), 'extended');
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="contracts"]').click();
    assert.equal(await page.locator('#contract-format').inputValue(), 'extended', 'last format survives reload');
    await page.locator('[data-panel="contracts"] summary').filter({hasText:'VIEW ALL ROUTE RECORDS'}).click();
    const longSetups = page.locator('[data-contract-setup]');
    const longSetupIndex = await longSetups.evaluateAll((buttons) => buttons.findIndex((b) => {
      const s=JSON.parse(b.dataset.contractSetup); return s.format==='standard' && s.goal==='resupply' && s.build==='scout' && s.tier===1;
    }));
    const beforeFormatSetup = gameplayCount();
    await longSetups.nth(longSetupIndex).click();
    assert.equal(gameplayCount(), beforeFormatSetup);
    assert.equal(await page.locator('#contract-format').inputValue(), 'standard');
    assert.equal(await page.locator('[data-action="contract_start"]:focus').getAttribute('data-payload').then(JSON.parse).then((p) => p.goal), 'resupply');
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
    // Real raid choices respect energy, and old rewards can be recovered at zero energy.
    currentUser = `browser-raid-${viewport.width}`;
    await seed(currentUser, 'young');
    sqlite.prepare('UPDATE telegram_pet_profiles SET pet_xp=392040,level=100,energy=12 WHERE telegram_id=?').run(currentUser);
    sqlite.prepare('UPDATE telegram_pet_instances SET pet_xp=392040,level=100,energy=12 WHERE telegram_id=?').run(currentUser);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="seasonal-boss"]').click();
    const raidButtons = page.locator('[data-action="seasonal_boss"]');
    assert.equal(await raidButtons.count(), 3);
    assert.equal(await raidButtons.filter({ hasText: 'CONSERVE ENERGY' }).isEnabled(), true);
    assert.equal(await raidButtons.filter({ hasText: 'STEADY STRIKE' }).isDisabled(), true);
    const raidBefore = await hooks.buildPetMiniAppState(db, currentUser, token);
    const raidPreview = raidBefore.live_systems.seasonal_boss.choices.find((c) => c.key === 'conserve');
    const raidResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'seasonal_boss');
    await raidButtons.filter({ hasText: 'CONSERVE ENERGY' }).click();
    const raidResult = await (await raidResponse).json();
    assert.equal(raidResult.result.accepted, true); assert.equal(raidResult.result.damage, raidPreview.damage);
    assert.equal(raidResult.state.pet.energy, 0);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-action="seasonal_boss"]')).every((b) => b.disabled));
    const oldBoss = getActiveSeasonalBoss(new Date(Date.now() - 8 * 86400000));
    sqlite.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
      (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .run(raidBefore.pet.pet_id, currentUser, raidBefore.pet.season_key, oldBoss.season_instance, oldBoss.key, oldBoss.hp);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="seasonal-boss"]').filter({ hasText: 'CLAIM SAVED RAID REWARDS' }).click();
    const claimRaid = page.locator('[data-action="seasonal_boss_claim"]');
    assert.equal(await claimRaid.isEnabled(), true);
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-raid-${viewport.width}.png`) });
    const claimRaidResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'seasonal_boss_claim');
    await claimRaid.click();
    const claimRaidResult = await (await claimRaidResponse).json();
    assert.equal(claimRaidResult.result.accepted, true);
    assert.equal(claimRaidResult.state.pet.energy, 0);
    assert.equal(claimRaidResult.state.pet.moon_gold, raidBefore.pet.moon_gold + 250);
    await page.waitForFunction(() => !document.querySelector('[data-action="seasonal_boss_claim"]'));
    // Adventure controls expose their real entry gate, costs and cooldown.
    sqlite.prepare('UPDATE telegram_pet_instances SET energy=100 WHERE telegram_id=?').run(currentUser);
    sqlite.prepare('UPDATE telegram_pet_profiles SET energy=100 WHERE telegram_id=?').run(currentUser);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="adventure"]').filter({ hasText: 'ADVENTURE CHOICES' }).click();
    const adventureText = await page.locator('[data-panel="adventure"]').textContent();
    assert.ok(adventureText.includes('ENTRY REQUIRES') && adventureText.includes('% SETBACK') && adventureText.includes('BASE REWARD'));
    assert.ok((await page.locator('[data-panel="street-event"]').textContent()).includes('COST'));
    const adventureResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'adventure');
    await page.locator('[data-action="adventure"]').filter({ hasText: 'Cash Out' }).click();
    const adventureResult = await (await adventureResponse).json();
    assert.equal(adventureResult.result.accepted, true);
    assert.equal(adventureResult.state.adventure.available, false);
    assert.ok(adventureResult.state.adventure.cooldown.remaining_seconds > 1700);
    assert.ok(adventureResult.state.cooldowns.entries.some((entry) => entry.key === 'adventure'));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-action="adventure"]')).every((b) => b.disabled));
    assert.equal(await page.locator('[data-panel="play-now"] [data-focus="adventure"]').filter({ hasText: 'ADVENTURE CHOICES' }).count(), 0);
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-choices-${viewport.width}.png`) });
    sqlite.prepare("UPDATE telegram_pet_events SET created_at=datetime('now','-31 minutes') WHERE telegram_id=? AND event_type='adventure'").run(currentUser);
    assert.equal((await hooks.buildPetMiniAppState(db, currentUser, token)).adventure.available, true);
    await page.locator('[data-screen="work"]').click();
    const workResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'work');
    await page.locator('[data-action="work"]:not([disabled])').first().click();
    const workResult = await (await workResponse).json();
    assert.equal(workResult.result.accepted, true);
    assert.ok(workResult.state.guidance.jobs.every((job) => !job.available));
    assert.ok(workResult.state.guidance.jobs.some((job) => job.cooldown?.remaining_seconds > 0));
    assert.ok(workResult.state.cooldowns.entries.some((entry) => entry.key === 'work'));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-action="work"]')).every((b) => b.disabled));
    sqlite.prepare("UPDATE telegram_pet_events SET created_at=datetime('now','-31 minutes') WHERE telegram_id=? AND event_type='work'").run(currentUser);
    assert.ok((await hooks.buildPetMiniAppState(db, currentUser, token)).guidance.jobs.some((job) => job.available));
    // Background activities expose real duration choices and survive interrupted claims.
    currentUser = `browser-activity-${viewport.width}`;
    await seed(currentUser, 'young');
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="timed-activity"]').click();
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-panel="timed-activity"]');
      const rail = document.querySelector('.utility-rail');
      return panel && panel.getBoundingClientRect().top >= rail.getBoundingClientRect().bottom;
    });
    assert.equal(await page.locator('[data-action="activity_start"]').count(), 4);
    assert.ok((await page.locator('[data-panel="timed-activity"]').textContent()).includes('Hunger increase'));
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-activity-options-${viewport.width}.png`) });
    const startActivityResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'activity_start');
    await page.locator('[data-action="activity_start"]').filter({ hasText: 'START Explore' }).click();
    assert.equal((await (await startActivityResponse).json()).result.accepted, true);
    await page.waitForSelector('[data-action="activity_claim"]');
    assert.equal(await page.locator('[data-action="activity_claim"]').isDisabled(), true);
    await page.locator('[data-screen="home"]').click();
    assert.equal(await page.locator('[data-action="sleep"]').isDisabled(), true);
    assert.equal(await page.locator('[data-action="train"]').isDisabled(), true);
    assert.equal(await page.locator('[data-action="feed"]').isEnabled(), true);
    await page.locator('[data-panel="care"] [data-focus="timed-activity"]').click();
    assert.ok(await page.locator('[data-action="activity_claim"]').count());
    await page.locator('[data-panel="timed-activity"] [data-focus="contracts"]').click();
    assert.ok(await page.locator('#contract-build').count());
    assert.ok((await hooks.buildPetMiniAppState(db, currentUser, token)).guidance.activity, 'navigating to contracts must leave the activity running');
    sqlite.prepare("UPDATE telegram_pet_activity_sessions SET started_at=datetime('now','-30 minutes') WHERE telegram_id=? AND status='active'").run(currentUser);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="timed-activity"]').click();
    assert.equal(await page.locator('[data-action="activity_claim"]').isEnabled(), true);
    const activityText = await page.locator('[data-panel="timed-activity"]').textContent();
    assert.ok(activityText.includes('1 Moon Crystals') && activityText.includes('Adventure Map replaces'));
    const beforeFailedClaim = await hooks.buildPetMiniAppState(db, currentUser, token);
    failActivitySettlement = true;
    await assert.rejects(hooks.processPetMiniAppAction(db, currentUser, { id: currentUser }, { action: 'activity_claim' }, token), /interrupted_activity_settlement/);
    const paidBeforeRetry = await hooks.buildPetMiniAppState(db, currentUser, token);
    assert.equal(paidBeforeRetry.pet.moon_crystals, beforeFailedClaim.pet.moon_crystals + 1);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    assert.equal(await page.locator('[data-action="sleep"]').isEnabled(), true, 'completed activity waiting for receipt recovery does not block care');
    await page.locator('[data-panel="play-now"] [data-focus="timed-activity"]').filter({ hasText: 'RECOVER SAVED ACTIVITY REWARD' }).click();
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-panel="timed-activity"]');
      return panel && panel.getBoundingClientRect().top >= document.querySelector('.utility-rail').getBoundingClientRect().bottom;
    });
    assert.equal(await page.locator('[data-action="activity_start"]').count(), 0);
    assert.equal(await page.locator('[data-action="activity_cancel"]').count(), 0, 'a reserved reward cannot be cancelled');
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-activity-recovery-${viewport.width}.png`) });
    const recoveryResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'activity_claim');
    await page.locator('[data-action="activity_claim"]').filter({ hasText: 'RECOVER SAVED REWARD' }).click();
    const recoveryResult = await (await recoveryResponse).json();
    assert.equal(recoveryResult.result.accepted, true);
    assert.equal(recoveryResult.state.pet.moon_crystals, paidBeforeRetry.pet.moon_crystals);
    assert.equal(recoveryResult.state.pet.pet_xp, paidBeforeRetry.pet.pet_xp);
    await page.waitForSelector('[data-action="activity_start"]');
    assert.equal(await page.locator('[data-action="activity_start"]').count(), 4, 'a recovered claim must unblock the next activity');
    sqlite.prepare('UPDATE telegram_pet_profiles SET moon_gold=20 WHERE telegram_id=?').run(currentUser);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="economy"]').click();
    await page.locator('[data-panel-jump="trade"]').click();
    assert.equal(await page.locator('[data-action="trade"]').filter({ hasText: '10 GOLD' }).isEnabled(), true);
    assert.equal(await page.locator('[data-action="trade"]').filter({ hasText: '25 GOLD' }).isDisabled(), true);
    const tradeResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'trade');
    await page.locator('[data-action="trade"]').filter({ hasText: '10 GOLD' }).click();
    assert.equal((await (await tradeResponse).json()).result.accepted, true);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-action="trade"]')).every((button) => button.disabled));
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="economy"]').click();
    assert.equal(await page.locator('[data-action="trade"]:not([disabled])').count(), 0, 'trade cooldown survives reload');
    sqlite.prepare("UPDATE telegram_pet_events SET created_at=datetime('now','-6 minutes') WHERE telegram_id=? AND event_type='trade'").run(currentUser);
    assert.equal((await hooks.buildPetMiniAppState(db, currentUser, token)).trade.offers[0].available, true);
    // Destination choices use the real API; cheaper routes remain playable at higher levels.
    currentUser = 'browser-expeditions-' + viewport.width;
    await seed(currentUser, 'young');
    sqlite.prepare('UPDATE telegram_pet_instances SET pet_xp=23040,energy=12 WHERE telegram_id=?').run(currentUser);
    sqlite.prepare('UPDATE telegram_pet_profiles SET pet_xp=23040,energy=12 WHERE telegram_id=?').run(currentUser);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    const beforeExpeditionNavigation = gameplayCount();
    await page.locator('[data-panel="play-now"] [data-focus="expedition"]').click();
    assert.equal(gameplayCount(), beforeExpeditionNavigation, 'comparing expeditions must not spend an attempt');
    assert.equal(await page.locator('[data-action="expedition"]').count(), 3);
    assert.equal(await page.locator('[data-action="expedition"]:not([disabled])').count(), 1);
    assert.equal(await page.locator('[data-action="expedition"]').filter({ hasText: 'Dust Tunnels' }).isEnabled(), true);
    assert.equal(await page.locator('[data-action="expedition"]').filter({ hasText: 'Guardian Rift' }).isDisabled(), true);
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-expeditions-${viewport.width}.png`) });
    for (const [index, title] of ['Dust Tunnels', 'Crystal Caves', 'Guardian Rift'].entries()) {
      if (index > 0) {
        sqlite.prepare('UPDATE telegram_pet_instances SET energy=100 WHERE telegram_id=?').run(currentUser);
        sqlite.prepare('UPDATE telegram_pet_profiles SET energy=100 WHERE telegram_id=?').run(currentUser);
        await page.reload(); await page.waitForSelector('[data-panel="care"]');
        await page.locator('[data-panel="play-now"] [data-focus="expedition"]').click();
      }
      const expeditionResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'expedition');
      await page.locator('[data-action="expedition"]').filter({ hasText: title }).click();
      const response = await expeditionResponse, data = await response.json();
      assert.equal(data.result.accepted, true);
      assert.equal(data.result.expedition.title, title);
      assert.equal(response.request().postDataJSON().expedition_key, data.result.expedition.key);
      assert.equal(data.state.guidance.economy.expedition_attempts_left, 2 - index);
      assert.equal(data.state.pet.energy, (index === 0 ? 12 : 100) - data.result.expedition.energy);
      assert.equal(data.state.pet.pet_xp, 23040 + (index + 1) * 12);
      await page.waitForFunction((count) => document.querySelector('[data-panel="expedition"]').textContent.includes(count + '/3 SHARED ATTEMPTS'), 2 - index);
    }
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    assert.equal(await page.locator('[data-panel="play-now"] [data-focus="expedition"]').count(), 0);
    await page.locator('[data-screen="economy"]').click();
    await page.locator('[data-panel-jump="expedition"]').click();
    assert.equal(await page.locator('[data-action="expedition"]:not([disabled])').count(), 0);
    assert.ok((await page.locator('[data-panel="expedition"]').textContent()).includes('ATTEMPTS RESET'));
    await page.locator('[data-panel="expedition"] summary').click();
    for (const title of ['Dust Tunnels', 'Crystal Caves', 'Guardian Rift']) assert.ok((await page.locator('[data-panel="expedition"] details').textContent()).includes(title));
    const beforeContinue = gameplayCount();
    await page.locator('[data-panel="expedition"] [data-focus="contracts"]').click();
    assert.equal(await page.locator('[data-panel="contracts"]').count(), 1);
    assert.equal(gameplayCount(), beforeContinue, 'continuation links navigate without starting a quest');
    oldExpeditionState = true;
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="economy"]').click();
    assert.equal(await page.locator('[data-action="expedition"]').count(), 0, 'old Worker responses cannot advertise choices the old handler would ignore');
    assert.ok((await page.locator('[data-panel="expedition"]').textContent()).includes('destinations are syncing'));
    oldExpeditionState = false;
    currentUser = 'browser-weekly-' + viewport.width;
    await seed(currentUser, 'young');
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    const bossBefore = (await hooks.buildPetMiniAppState(db, currentUser, token)).guidance.weekly_boss;
    const beforeBossNavigation = gameplayCount();
    await page.locator('[data-panel="play-now"] [data-focus="weekly-boss"]').click();
    assert.equal(gameplayCount(), beforeBossNavigation);
    assert.equal(await page.locator('[data-panel="weekly-boss"] [data-action="weekly_boss"]').count(), 3);
    const bossText = await page.locator('[data-panel="weekly-boss"]').textContent();
    for (const choice of bossBefore.choices) assert.ok(bossText.includes(choice.minimum_damage + '–' + choice.maximum_damage + ' DAMAGE'));
    assert.ok(bossText.includes('12 ENERGY') && bossText.includes('NEXT WEEKLY BOSS'));
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-weekly-${viewport.width}.png`) });
    sqlite.prepare(`INSERT INTO telegram_pet_weekly_boss_progress (telegram_id,week_key,boss_id,damage,attempts)
      VALUES (?,?,?,?,1)`).run(currentUser, bossBefore.week_key, bossBefore.boss_id, bossBefore.hp - 1);
    failWeeklyReward = true;
    const bossResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'weekly_boss');
    await page.locator('[data-action="weekly_boss"]').first().click();
    const bossResult = await (await bossResponse).json();
    assert.equal(bossResult.result.reason, 'boss_defeated');
    assert.equal(bossResult.result.reward_pending, true);
    assert.equal(bossResult.state.pet.energy, 68);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="weekly-boss"]').click();
    await page.waitForSelector('[data-action="weekly_boss_claim"]');
    assert.equal(await page.locator('[data-action="weekly_boss"]:not([disabled])').count(), 0);
    assert.ok((await page.locator('[data-panel="weekly-boss"]').textContent()).includes('TODAY’S SAVED ATTACK'));
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-weekly-recovery-${viewport.width}.png`) });
    const weeklyClaimResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'weekly_boss_claim');
    await page.locator('[data-action="weekly_boss_claim"]').click();
    const weeklyClaimed = await (await weeklyClaimResponse).json();
    assert.equal(weeklyClaimed.result.accepted, true);
    assert.equal(weeklyClaimed.state.pet.energy, 68);
    assert.equal(weeklyClaimed.state.guidance.weekly_boss.pending_rewards.length, 0);
    await page.waitForFunction(() => !document.querySelector('[data-action="weekly_boss_claim"]'));
    const beforeBossContinue = gameplayCount();
    await page.locator('[data-panel="weekly-boss"] [data-focus="contracts"]').click();
    assert.equal(gameplayCount(), beforeBossContinue);
    assert.equal(await page.locator('[data-panel="contracts"]').count(), 1);
    currentUser = 'browser-cache-' + viewport.width;
    await seed(currentUser, 'young');
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    const cacheButton = page.locator('[data-action="daily_chest"]');
    assert.equal(await cacheButton.isEnabled(), true);
    assert.ok((await cacheButton.textContent()).includes('40 MOON GOLD + 2 STYLE'));
    const cacheResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'daily_chest');
    await cacheButton.click();
    const cacheResult = await (await cacheResponse).json();
    assert.equal(cacheResult.result.pet_xp_awarded, 40); assert.equal(cacheResult.state.pet.pet_xp, 3280);
    assert.equal(cacheResult.state.pet.moon_gold, 140);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    assert.equal(await cacheButton.isDisabled(), true);
    assert.ok((await cacheButton.textContent()).includes('CLAIMED TODAY'));
    await cacheButton.evaluate((button) => button.scrollIntoView({ block: 'center' }));
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-daily-cache-${viewport.width}.png`) });
    const beforeCacheContinue = gameplayCount();
    await page.locator('[data-panel="care"] [data-focus="contracts"]').click();
    assert.equal(gameplayCount(), beforeCacheContinue);
    assert.equal(await page.locator('[data-panel="contracts"]').count(), 1);

    const cachePet = cacheResult.state.pet;
    sqlite.prepare(`UPDATE telegram_pet_season_state SET season_xp=1000 WHERE telegram_id=? AND season_key=?`).run(currentUser, cachePet.season_key);
    sqlite.prepare(`INSERT INTO telegram_pet_season_reward_claims (telegram_id,season_key,tier_id,event_key)
      VALUES (?,?,'street','legacy-unpaid')`).run(currentUser, cachePet.season_key);
    // Model an unresolved historical wallet, rather than an already reconciled one.
    sqlite.prepare("DELETE FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='wallet_reconciliation'").run(currentUser);
    sqlite.prepare(`INSERT INTO telegram_pet_reward_claims (claim_id,telegram_id,source,idempotency_key,day_key,status,requested_rewards,applied_rewards,metadata)
      VALUES (?,?,'wallet_reconciliation_recovery_required','moonpet_wallet_reconcile_recovery_required:v1',?,'pending','{}','{}','{}')`)
      .run('browser-cache-freeze-' + viewport.width, currentUser, new Date().toISOString().slice(0, 10));
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="profile"]').click();
    const seasonButton = page.locator('[data-action="season_claim"]').filter({ hasText: 'Street Cache' });
    const blockedResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'season_claim');
    await seasonButton.click();
    const blocked = await (await blockedResponse).json(); assert.equal(blocked.result.accepted, false);
    assert.equal(blocked.state.guidance.season.tiers.find((tier) => tier.tier_id === 'street').claimed_at, null);
    await page.waitForFunction(() => !document.querySelector('[data-action="season_claim"]')?.disabled);
    sqlite.prepare('DELETE FROM telegram_pet_reward_claims WHERE claim_id=?').run('browser-cache-freeze-' + viewport.width);
    const paidResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'season_claim');
    await seasonButton.click();
    const paid = await (await paidResponse).json(); assert.equal(paid.result.accepted, true); assert.equal(paid.result.duplicate, false);
    assert.equal(paid.state.pet.moon_gold, 220); assert.ok(paid.state.guidance.season.tiers.find((tier) => tier.tier_id === 'street').claimed_at);
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-action="season_claim"]')].some((button) => button.textContent.includes('Street Cache')));

    currentUser = 'browser-crafting-' + viewport.width;
    await seed(currentUser, 'young');
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="economy"]').click();
    await page.locator('[data-panel-jump="crafting"]').click();
    const beforePlanning = gameplayCount();
    await page.locator('#crafting-goal').selectOption('street_rations');
    const workshop = page.locator('[data-panel="crafting"]');
    assert.ok((await workshop.textContent()).includes('MISSING 2'));
    assert.ok((await workshop.textContent()).includes('MISSING 1'));
    assert.equal(gameplayCount(), beforePlanning, 'choosing a goal must not submit a gameplay action');
    await workshop.locator('[data-focus="districts"]').first().click();
    assert.equal(await page.locator('[data-panel="districts"]').count(), 1);
    assert.equal(gameplayCount(), beforePlanning, 'following a material route is navigation only');
    assert.ok((await page.locator('[data-panel="districts"]').textContent()).includes('MATERIAL ON CLEAR'));
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="crafting"]').click();
    assert.equal(await page.locator('#crafting-goal').inputValue(), 'street_rations', 'goal survives reload for this pet');
    await page.locator('#crafting-goal').scrollIntoViewIfNeeded();
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-crafting-${viewport.width}.png`) });

    // Simulate supplies earned elsewhere, then use the real craft and item handlers.
    for (const [material, quantity] of [['scrap_metal', 2], ['moon_fabric', 1]]) {
      sqlite.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,?)').run(currentUser, material, quantity);
    }
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    const readyGoal = page.locator('[data-panel="play-now"] [data-focus="crafting"]');
    assert.ok((await readyGoal.textContent()).includes('READY TO CRAFT'));
    await readyGoal.click();
    const craftResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'craft');
    await page.locator('[data-action="craft"]').filter({ hasText: 'Street Rations' }).click();
    const crafted = await (await craftResponse).json();
    assert.equal(crafted.result.accepted, true);
    assert.equal(crafted.state.inventory.find((item) => item.key === 'moon_snack').count, 2);
    assert.equal(crafted.state.materials.find((material) => material.key === 'scrap_metal').quantity, 0);
    assert.equal(crafted.state.pet.moon_gold, 100);
    await page.waitForSelector('[data-panel="crafting"] [data-focus="inventory"]');
    await page.locator('[data-panel="crafting"] [data-focus="inventory"]').click();
    assert.ok((await page.locator('[data-panel="inventory"]').textContent()).includes('reduce hunger by 18'));
    const useResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'use_item');
    await page.locator('[data-action="use_item"]').filter({ hasText: 'Moon Snack' }).click();
    const used = await (await useResponse).json();
    assert.equal(used.result.accepted, true); assert.equal(used.result.pet_xp_awarded, 4);
    assert.equal(used.state.inventory.find((item) => item.key === 'moon_snack').count, 1);

    const craftingOwner = currentUser;
    currentUser = 'browser-crafting-other-' + viewport.width;
    await seed(currentUser, 'young');
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    assert.equal(await page.locator('[data-panel="play-now"] [data-focus="crafting"]').count(), 0);
    currentUser = craftingOwner;
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-panel="play-now"] [data-focus="crafting"]').click();
    assert.equal(await page.locator('#crafting-goal').inputValue(), 'street_rations');
    await page.locator('#crafting-goal').selectOption('');
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    assert.equal(await page.locator('[data-panel="play-now"] [data-focus="crafting"]').count(), 0, 'clearing a goal persists');
    currentUser = 'browser-market-' + viewport.width;
    await seed(currentUser,'young');
    sqlite.prepare('UPDATE telegram_pet_profiles SET moon_gold=2000,moon_crystals=20,style_tokens=20 WHERE telegram_id=?').run(currentUser);
    const marketState = await hooks.getPetEconomyState(db,currentUser);
    const marketOffer = marketState.market_offers.find((offer) => offer.unlocked && Object.keys(offer.reward.items || offer.reward.materials || {}).length);
    assert.ok(marketOffer,'rotating board has an unlocked item or material offer');
    const isItemOffer = Boolean(marketOffer.reward.items), storageCap = isItemOffer ? 999999 : 9999;
    const [itemKey,itemAmount] = Object.entries(marketOffer.reward.items || marketOffer.reward.materials)[0];
    const setMarketStock = (quantity) => {
      if (isItemOffer) sqlite.prepare("INSERT INTO telegram_pet_inventory (telegram_id,asset_type,asset_key,quantity) VALUES (?,'item',?,?) ON CONFLICT(telegram_id,asset_type,asset_key) DO UPDATE SET quantity=excluded.quantity").run(currentUser,itemKey,quantity);
      else sqlite.prepare('INSERT INTO telegram_pet_material_balances (telegram_id,material_key,quantity) VALUES (?,?,?) ON CONFLICT(telegram_id,material_key) DO UPDATE SET quantity=excluded.quantity').run(currentUser,itemKey,quantity);
    };
    setMarketStock(storageCap);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="economy"]').click();
    await page.locator('[data-panel-jump="market"]').click();
    const marketButton = page.locator('[data-action="market_buy"]').filter({ hasText: marketOffer.title });
    assert.equal(await marketButton.isDisabled(),true);
    assert.ok((await marketButton.textContent()).includes('STORAGE FULL'));
    await marketButton.scrollIntoViewIfNeeded();
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-market-${viewport.width}.png`) });
    const marketActions = gameplayCount();
    await page.locator('[data-panel="market"] [data-focus="inventory"]').click();
    assert.equal(gameplayCount(),marketActions,'making space link only navigates');
    setMarketStock(storageCap-itemAmount);
    await page.reload(); await page.waitForSelector('[data-panel="care"]');
    await page.locator('[data-screen="economy"]').click();
    await page.locator('[data-panel-jump="market"]').click();
    assert.equal(await marketButton.isDisabled(),false,'exact-fit bundle stays available');
    const marketResponse = page.waitForResponse((r) => r.url().endsWith('/telegram-pets/app/action') && r.request().postDataJSON()?.action === 'market_buy');
    await marketButton.click();
    const bought = await (await marketResponse).json();
    assert.equal(bought.result.accepted,true); assert.equal(bought.result.duplicate,false);
    assert.equal(isItemOffer ? bought.state.inventory.find((item) => item.key === itemKey).count : bought.state.materials.find((item) => item.key === itemKey).quantity,storageCap);
    assert.equal(bought.state.pet.moon_gold,2000-(marketOffer.cost.moon_gold || 0));
    await page.waitForFunction((title) => [...document.querySelectorAll('[data-action="market_buy"]')].some((button) => button.disabled && button.textContent.includes(title) && button.textContent.includes('SOLD')),marketOffer.title);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, 'mobile viewport must not overflow horizontally');
    assert.deepEqual(errors, [], 'no runtime errors across all six screens');
    if (process.env.MOONPET_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.MOONPET_BROWSER_SCREENSHOT.replace('.png', `-${viewport.width}.png`) });
    console.log(`Moonpet browser loop passed at ${viewport.width}x${viewport.height}; all six screens; bounties; practice; contracts and records; daily tactics; raids; timed recovery; Trade; expeditions; weekly boss recovery; Daily Cache claimed/reset state; season reward rejection/recovery; supply drafts; crafting goals, material routes, craft/use and goal isolation; paid-bundle capacity and exact-fit purchase; persisted draft redraw; weekly objective routes; six goals and saved ten-room Contracts with four drafts and separate records; saved checkpoint paths, care busy/energy gates and recovery unlock.`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  sqlite.close();
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: realCrypto });
}

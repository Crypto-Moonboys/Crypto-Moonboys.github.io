import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SITE = 'https://cryptomoonboys.com';
const API = 'https://api.cryptomoonboys.com';
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.webp':'image/webp', '.woff2':'font/woff2' };
const ignoredScripts = new Set([
  '/js/arcade/core/global-event-bus.js', '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js', '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js', '/js/components/live-activity-summary.js',
  '/js/components/telegram-sync-cta.js',
]);

const identityScript = [
  '(function(){',
  'const identity = {',
  'ready:Promise.resolve(),',
  'isTelegramLinked:()=>!!window.__mmTest.linked,',
  'getTelegramId:()=>window.__mmTest.linked?window.__mmTest.id:null,',
  'getTelegramName:()=>window.__mmTest.id==="111"?"Alpha player":"Beta player",',
  'getFreshTelegramAuth:async()=>window.__mmTest.linked?{id:window.__mmTest.id,hash:"fixture-signed",auth_date:String(Math.floor(Date.now()/1000))}:null',
  '};',
  'window.MOONBOYS_IDENTITY=identity;',
  '})();',
].join('\n');

function plan(owner, cursor) {
  const day = new Date().toISOString().slice(0, 10);
  const first = owner === '111';
  const petRef = 'pap_' + (first ? 'a' : 'c').repeat(24);
  const historicalRef = 'pap_' + 'b'.repeat(24);
  const prefix = first ? 'Alpha' : 'Beta';
  const clock = Date.now();
  const task = (key, title, status, category, options = {}) => ({
    source_key: key, source: category, task_id: key + ':' + prefix + ':demo',
    title, what: title, why: 'Source-backed task from saved gameplay.',
    category, optional: false, owner_scope: options.original ? 'original_pet' : 'pet',
    source_pet_ref: options.ref === null ? null : options.ref || petRef,
    status, availability: status, source_health: options.sourceHealth || 'live',
    priority: options.priority || 50,
    period: { kind: options.period || 'utc_day', key: options.periodKey || day, origin_timezone:'UTC' },
    evidence: { kind: options.evidence || 'server_projection', verified_completion: false },
    progress: { current: 1, target: 3, unit:'source_actions' },
    reward: { confirmed: true, items: [{ type: 'pet_xp', amount: 20, unit:'pet_xp' }] },
    cost: { items: [] },
    destination: { kind: 'web', path: '/moonpet-game.html' },
    expires_at: options.expires === false ? null : new Date(clock + 3600000).toISOString(),
    available_at: null, next_ready_at: null, blocking_reason_code: null,
  });
  const ready = task('moonpet.jobs', prefix + ' saved job claim', 'claim_ready', 'moonpet',
    { period: 'saved_timer', periodKey: 'saved-session', expires: false });
  const awaiting = task('battle.wtf-windows', prefix + ' WTF window', 'waiting', 'battle',
    { ref: null, period:'event_window', priority: 300 });
  awaiting.available_at = new Date(clock + 1800000).toISOString();
  const preview = task('championship.verified-clout', prefix + ' unverified Clout', 'preview',
    'championship', { ref:null, sourceHealth:'preview', evidence:'schedule_preview', expires:false });
  const historical = task('moonpet.contracts', prefix + ' historic contract bonus', 'claim_ready',
    'moonpet', { original:true, ref:historicalRef, period:'saved_claim', expires:false });
  if (cursor) return {
    ok:true,schema_version:1,generated_at:new Date(clock).toISOString(),period:{utc_day:day,iso_week:'2026-W42'},
    owner:{authenticated:true,pet_count:first?1:0,pets:first?[{pet_ref:petRef,slot_number:1,selected:true,
      life_stage:'hatched',lifecycle_phase:'young',evolution_stage:null,pet_xp:25,level:2}]:[],
      faction:{joined:first,name:first?'graffpunks':null},lifetime_arcade_xp:first?1200:100},
    source_status:{'moonpet.jobs':{state:'live'}}, summary:{ready_count:1,claims_ready:2,eligible_today:1,
      completed_today:0,unavailable_sources:0},
    top_actions:[ready,historical], tasks:[historical],
    pagination:{limit:100,next_cursor:null},
  };
  return {
    ok:true,schema_version:1,generated_at:new Date(clock).toISOString(),
    owner:{authenticated:true,pet_count:first?1:0,
      pets:first?[{pet_ref:petRef,slot_number:1,selected:true,life_stage:'hatched',
        lifecycle_phase:'young',evolution_stage:null,pet_xp:25,level:2}]:[],
      faction:{joined:first,name:first?'graffpunks':null},lifetime_arcade_xp:first?1200:100},
    period:{utc_day:day,iso_week:'2026-W42'},
    summary:{ready_count:1,claims_ready:1,eligible_today:1,completed_today:0,unavailable_sources:1},
    source_status:{
      'moonpet.jobs':{state:'live'},'battle.wtf-windows':{state:'live'},
      'championship.verified-clout':{state:'preview'},
    },
    top_actions:[ready],
    tasks:[ready,awaiting,preview],
    pagination:{limit:100,next_cursor:'pap1-100'},
  };
}

async function setup(viewport, initiallyLinked, apiPrefix = '') {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
  });
  const context = await browser.newContext({ viewport });
  await context.addInitScript(([links, prefix]) => {
    window.__mmTest = { id:'111', linked:links };
    window.MOONBOYS_API = { BASE_URL:'https://api.cryptomoonboys.com' + prefix,
      getApiBase:()=> 'https://api.cryptomoonboys.com' + prefix };
  }, [initiallyLinked, apiPrefix]);
  const requests = [];
  let failure = false;
  let delayOwner = '';
  let currentPlan = plan;
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === API) {
      if (request.method() === 'OPTIONS') {
        return route.fulfill({status:204,headers:{'access-control-allow-origin':SITE,
          'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'Content-Type'}});
      }
      if (url.pathname === apiPrefix + '/player/action-plan') {
        const body = request.postDataJSON();
        requests.push({url:request.url(),method:request.method(),body});
        if (delayOwner === body.telegram_auth.id) await new Promise(resolve => setTimeout(resolve, 250));
        return route.fulfill({status:failure?503:200,
          headers:{'access-control-allow-origin':SITE,'cache-control':'no-store, private',
            'content-type':'application/json'},
          body:JSON.stringify(failure?{ok:false,error:'projection_unavailable'}:currentPlan(body.telegram_auth.id,body.cursor))});
      }
      return route.fulfill({status:404,headers:{'access-control-allow-origin':SITE},body:'{}'});
    }
    if (url.origin !== SITE) return route.abort();
    if (url.pathname === '/js/identity-gate.js')
      return route.fulfill({contentType:'application/javascript',body:identityScript});
    if (ignoredScripts.has(url.pathname))
      return route.fulfill({contentType:'application/javascript',body:''});
    const relative = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const filename = path.resolve(ROOT, '.' + relative);
    if (!filename.startsWith(ROOT + path.sep)) return route.abort();
    try {
      const info = await stat(filename);
      if (!info.isFile()) return route.fulfill({status:404,body:''});
      return route.fulfill({body:await readFile(filename),
        contentType:TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream'});
    } catch (_) { return route.fulfill({status:404,body:''}); }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return {browser,context,page,requests,errors,
    setFailure(value) { failure=value; },
    setSlowOwner(id) { delayOwner=id; },
    setPlanFactory(factory) { currentPlan = factory; }};
}

for (const width of [360, 390, 1280]) {
  test('PR3 My Moonboy responsive signed view, safe links and complete pagination at ' + width + 'px', async () => {
    const f = await setup({width,height:850}, true);
    try {
      await f.page.goto(SITE + '/my-moonboy.html?tab=now', {waitUntil:'domcontentloaded'});
      await f.page.locator('#mm-next .mm-task').first().waitFor();
      assert.equal(await f.page.locator('#mm-gate').isHidden(),true);
      assert.equal(await f.page.locator('#mm-private').isVisible(),true);
      assert.equal(await f.page.locator('[data-shell-link="MY MOONBOY"]').count(),1);
      assert.equal(await f.page.locator('#mm-player-name').textContent(),'Alpha player');
      assert.match(await f.page.locator('#mm-next').innerText(),/Alpha saved job claim/);
      assert.doesNotMatch(await f.page.locator('#mm-next').innerText(),/unverified Clout/);
      assert.match(await f.page.locator('#mm-pets').innerText(),/MoonPet slot 1/);
      assert.match(await f.page.locator('#mm-pets').innerText(),/Pet XP: 25/);
      assert.equal(await f.page.locator('#mm-arcade-xp').textContent(),'1200 Arcade XP');
      assert.match(await f.page.locator('#mm-pets').innerText(),/Lifecycle phase: young/);
      assert.match(await f.page.locator('#mm-next').innerText(),/MoonPet slot 1/);
      assert.equal(await f.page.locator('#mm-claim-count').textContent(),'1');
      assert.equal(await f.page.locator('progress[aria-label]').count()>0,true);
      assert.equal(await f.page.locator('#mm-next a.mm-button').first().getAttribute('href'),'/moonpet-game.html');
      assert.equal(await f.page.evaluate(() => document.querySelector('.mm-page').getBoundingClientRect().right <= window.innerWidth+1),true);
      assert.equal(await f.page.locator('nav.mm-tabs [role="tab"]').count(),0,
        'category navigation uses one accessible tablist, not nested nav');
      await f.page.locator('[data-mm-tab="now"]').focus();
      await f.page.keyboard.press('ArrowRight');
      assert.equal(await f.page.locator('[data-mm-tab="today"]').getAttribute('aria-selected'),'true');
      assert.match(await f.page.locator('#mm-results').innerText(),/Alpha WTF window/);
      await f.page.locator('[data-mm-tab="claims"]').click();
      assert.match(await f.page.locator('#mm-results').innerText(),/Alpha saved job claim/);
      await f.page.locator('#mm-load-more').click();
      await f.page.getByText('Alpha historic contract bonus').first().waitFor();
      assert.match(await f.page.locator('#mm-pets').innerText(),/Original-earning MoonPet/);
      assert.equal(await f.page.locator('#mm-load-more').isHidden(),true);
      assert.ok(f.requests.some(entry=>entry.body.cursor==='pap1-100'),'cursor paging must retain signed owner');
      assert.ok(f.requests.every(entry=>entry.method==='POST' &&
        !/[?&](telegram_id|pet_id|telegram_auth|hash)=/u.test(entry.url) &&
        entry.body.telegram_auth && !Object.hasOwn(entry.body,'pet_id') &&
        !Object.hasOwn(entry.body,'telegram_id')));
      assert.equal(f.errors.length,0,f.errors.join('\n'));
    } finally { await f.browser.close(); }
  });
}

test('PR3 logout, account switch, expired auth and stale source never expose another player', async () => {
  const f = await setup({width:390,height:844}, false);
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.waitForFunction(() => document.getElementById('mm-gate-title')?.textContent === 'Log in to My Moonboy');
    assert.equal(await f.page.locator('#mm-private').isHidden(),true);
    assert.equal(await f.page.locator('[data-shell-link="MY MOONBOY"]').count(),0);
    assert.equal(f.requests.length,0,'guest must not fetch private tasks');

    await f.page.evaluate(() => {
      window.__mmTest.linked = true;
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    });
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    assert.equal(await f.page.locator('[data-shell-link="MY MOONBOY"]').count(),1);
    f.setFailure(true);
    await f.page.locator('#mm-refresh').click();
    await f.page.waitForFunction(() => document.getElementById('mm-sync')?.textContent.includes('STALE'));
    assert.match(await f.page.locator('#mm-next').innerText(),/Top recommendations temporarily unavailable/);
    assert.equal(await f.page.locator('#mm-next a').count(),0,'stale readiness cannot remain a Top action');
    assert.match(await f.page.locator('#mm-pets').innerText(),/Last-confirmed snapshot only/);
    assert.match(await f.page.locator('#mm-pets').innerText(),/current availability unknown/);
    assert.doesNotMatch(await f.page.locator('#mm-pets').innerText(),/verified action\(s\) currently available/);
    f.setFailure(false);
    await f.page.locator('#mm-refresh').click();
    await f.page.locator('#mm-next a.mm-button').first().waitFor();

    await f.page.evaluate(() => {
      window.__mmTest.id = '222';
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    });
    assert.equal(await f.page.locator('#mm-private').isHidden(),true,'identity change hides old owner immediately');
    assert.doesNotMatch(await f.page.locator('#my-moonboy').innerText(),/Alpha player|Alpha saved job claim/);
    await f.page.waitForFunction(() => document.getElementById('mm-player-name')?.textContent === 'Beta player');
    assert.match(await f.page.locator('#mm-next').innerText(),/Beta saved job claim/);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').innerText(),/Alpha/);
    assert.equal(await f.page.locator('#mm-ready-count').textContent(),'1');

    await f.page.evaluate(() => {
      window.__mmTest.linked = false;
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    });
    await f.page.waitForFunction(() => document.getElementById('mm-gate-title')?.textContent === 'Log in to My Moonboy');
    assert.equal(await f.page.locator('#mm-private').isHidden(),true);
    assert.equal(await f.page.locator('[data-shell-link="MY MOONBOY"]').count(),0);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').innerText(),/Alpha|Beta/);
    assert.ok(f.requests.every(entry=>entry.body.telegram_auth.id==='111' || entry.body.telegram_auth.id==='222'));
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally { await f.browser.close(); }
});


test('PR3 preserves configured API reverse-proxy prefixes', async () => {
  const f = await setup({width:390,height:844}, true, '/v2-api');
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    assert.ok(f.requests.length > 0);
    assert.ok(f.requests.every(item => new URL(item.url).pathname === '/v2-api/player/action-plan'));
    assert.equal(f.errors.length, 0, f.errors.join('\n'));
  } finally { await f.browser.close(); }
});

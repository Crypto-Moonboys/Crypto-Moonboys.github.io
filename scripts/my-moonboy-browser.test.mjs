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
  'ready:Promise.resolve().then(()=>{',
  '  const s=window.__mmTest;',
  '  if(s.cookieRestorable&&s.bootstrapProbeFails){s.bootstrapProbeFails=false;return null;}',
  '  if(s.cookieRestorable&&!s.linked){s.linked=true;window.dispatchEvent(new CustomEvent("moonboys:identity-change"));}',
  '}),',
  'isTelegramLinked:()=>!!window.__mmTest.linked,',
  'getTelegramId:()=>window.__mmTest.linked?window.__mmTest.id:null,',
  'getTelegramName:()=>window.__mmTest.id==="111"?"Alpha player":"Beta player",',
  'getFreshTelegramAuth:async()=>{',
  '  const s=window.__mmTest;s.authReads=(s.authReads||0)+1;',
  '  if(s.authDelayMs)await new Promise(resolve=>setTimeout(resolve,s.authDelayMs));',
  '  if(!s.linked&&s.cookieRestorable){s.linked=true;window.dispatchEvent(new CustomEvent("moonboys:identity-change"));}',
  '  return s.linked?{id:s.id,hash:"fixture-signed",auth_date:String(Math.floor(Date.now()/1000))}:null;',
  '},',
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
  const snapshot = 'pap2_' + (first ? 'a' : 'c').repeat(32);
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
    ok:true,schema_version:1,snapshot,generated_at:new Date(clock).toISOString(),period:{utc_day:day,iso_week:'2026-W42'},
    owner:{authenticated:true,pet_count:first?1:0,pets:first?[{pet_ref:petRef,slot_number:1,selected:true,
      life_stage:'hatched',lifecycle_phase:'young',evolution_stage:null,pet_xp:25,level:2}]:[],
      faction:{joined:first,name:first?'graffpunks':null},lifetime_arcade_xp:first?1200:100},
    source_status:{'moonpet.jobs':{state:'live'}}, summary:{ready_count:1,claims_ready:2,eligible_today:1,
      completed_today:0,unavailable_sources:0},
    top_actions:[ready,historical], tasks:[historical],
    pagination:{limit:100,next_cursor:null},
  };
  return {
    ok:true,schema_version:1,snapshot,generated_at:new Date(clock).toISOString(),
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

async function setup(viewport, initiallyLinked, apiPrefix = '', identityOptions = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
  });
  const context = await browser.newContext({ viewport });
  await context.addInitScript(([links, prefix, settings]) => {
    window.__mmTest = { id:'111', linked:links, ...settings };
    window.MOONBOYS_API = { BASE_URL:'https://api.cryptomoonboys.com' + prefix,
      getApiBase:()=> 'https://api.cryptomoonboys.com' + prefix };
  }, [initiallyLinked, apiPrefix, identityOptions]);
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
        const current = currentPlan(body.telegram_auth.id, body.cursor);
        const changed = Boolean(body.cursor && body.snapshot !== current.snapshot);
        return route.fulfill({status:failure?503:changed?409:200,
          headers:{'access-control-allow-origin':SITE,'cache-control':'no-store, private',
            'content-type':'application/json'},
          body:JSON.stringify(failure?{ok:false,error:'projection_unavailable'}
            :changed?{ok:false,error:'action_plan_snapshot_changed'}:current)});
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
      assert.equal(await f.page.locator('#mm-claims-badge').textContent(),'1');
      assert.equal(await f.page.locator('#mm-claims-badge').isHidden(),false);
      assert.match(await f.page.locator('#mm-pets').innerText(),/1 claim ready/);
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
      assert.ok(f.requests.some(entry=>entry.body.cursor==='pap1-100' &&
        /^pap2_[a-f0-9]{32}$/u.test(entry.body.snapshot)),
        'cursor paging must echo the verified server snapshot');
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


test('PR3 clears previous owner search query on account switch and logout', async () => {
  const f = await setup({width:390,height:844}, true);
  try {
    await f.page.goto(SITE+'/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    await f.page.locator('#mm-search').fill('Alpha saved job claim');
    assert.match(await f.page.locator('#mm-results').innerText(), /Alpha saved job claim/);

    // Clearing owner data is synchronous with the identity transition, not
    // delayed until the next private Worker response (which may be slow).
    const switched = await f.page.evaluate(() => {
      window.__mmTest.id = '222';
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
      return {
        input: document.getElementById('mm-search').value,
        hidden: document.getElementById('mm-private').hidden,
        visibleResults: document.getElementById('mm-results').textContent,
      };
    });
    assert.deepEqual(switched, {input:'', hidden:true, visibleResults:''},
      'old owner query and results must be purged before new auth completes');
    await f.page.waitForFunction(() =>
      document.getElementById('mm-player-name')?.textContent === 'Beta player');
    assert.equal(await f.page.locator('#mm-search').inputValue(), '');
    assert.match(await f.page.locator('#mm-results').innerText(),
      /Beta saved job claim/, 'new owner must not inherit Alpha-only search filter');

    await f.page.locator('#mm-search').fill('Beta saved job claim');
    assert.match(await f.page.locator('#mm-results').innerText(), /Beta saved job claim/);
    const loggedOut = await f.page.evaluate(() => {
      window.__mmTest.linked = false;
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
      return {
        input: document.getElementById('mm-search').value,
        hidden: document.getElementById('mm-private').hidden,
        visibleResults: document.getElementById('mm-results').textContent,
      };
    });
    assert.deepEqual(loggedOut, {input:'', hidden:true, visibleResults:''},
      'logout must purge the current search and private task content');

    await f.page.evaluate(() => {
      window.__mmTest.linked = true;
      window.__mmTest.id = '111';
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    });
    await f.page.waitForFunction(() =>
      document.getElementById('mm-player-name')?.textContent === 'Alpha player');
    assert.equal(await f.page.locator('#mm-search').inputValue(), '');
    assert.match(await f.page.locator('#mm-results').innerText(),
      /Alpha saved job claim/, 'returning owner also starts with an unfiltered ledger');
    assert.equal(f.errors.length, 0, f.errors.join('\n'));
  } finally {
    await f.browser.close();
  }
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


// Deliberately ignore AbortSignal in the first cursor request. This simulates
// a proxy/source that resolves a stale page AFTER the client has refreshed
// its first-page snapshot, so epoch and snapshot guards must both hold.
async function holdOneCursorResponse(page) {
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    let held = false;
    window.fetch = (url, options) => {
      let cursor = null;
      try { cursor = JSON.parse(options && options.body || '{}').cursor; }
      catch (_) {}
      if (!held && cursor) {
        held = true;
        return new Promise(resolve => {
          window.__mmReleaseOldPage = payload => resolve(new Response(JSON.stringify(payload), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          }));
        });
      }
      return originalFetch(url, options);
    };
  });
}

test('PR3 rejects old cursor data after refresh and keeps Load more usable', async () => {
  const f = await setup({width:390,height:844}, true);
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    await f.page.waitForFunction(() => !document.getElementById('mm-refresh').disabled);
    await holdOneCursorResponse(f.page);
    await f.page.locator('#mm-load-more').click();
    await f.page.waitForFunction(() => typeof window.__mmReleaseOldPage === 'function');
    assert.equal(await f.page.locator('#mm-load-more').isDisabled(), true);

    // Replace the first page while an old page is still pending. Both versions
    // use the same cursor, so comparing cursor equality cannot protect data.
    f.setPlanFactory((owner, cursor) => {
      const payload = plan(owner, cursor);
      if (!cursor) {
        payload.tasks[0].title = 'Fresh first-page source status';
        payload.top_actions[0].title = 'Fresh first-page source status';
      }
      return payload;
    });
    await f.page.locator('#mm-refresh').click();
    await f.page.waitForFunction(() =>
      document.getElementById('mm-next')?.textContent.includes('Fresh first-page source status'));
    assert.equal(await f.page.locator('#mm-load-more').isEnabled(), true);
    assert.equal(await f.page.locator('#mm-load-more').isHidden(), false);
    assert.equal(await f.page.locator('#mm-page-count').textContent(),
      '3 tasks loaded · 1 shown · more available');

    const oldPayload = plan('111', 'pap1-100');
    oldPayload.tasks[0].title = 'OBSOLETE cursor item';
    await f.page.evaluate(value => window.__mmReleaseOldPage(value), oldPayload);
    await f.page.waitForTimeout(50);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').innerText(), /OBSOLETE cursor item/u);
    assert.equal(await f.page.locator('#mm-load-more').isEnabled(), true);
    assert.equal(await f.page.locator('#mm-load-more').isHidden(), false);

    await f.page.locator('#mm-load-more').click();
    await f.page.getByText('Alpha historic contract bonus').first().waitFor();
    assert.equal(await f.page.locator('#mm-load-more').isHidden(), true);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally { await f.browser.close(); }
});

test('PR3 identity switch cancels pagination and enables new owner cursor', async () => {
  const f = await setup({width:390,height:844}, true);
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    await f.page.waitForFunction(() => !document.getElementById('mm-refresh').disabled);
    await holdOneCursorResponse(f.page);
    await f.page.locator('#mm-load-more').click();
    await f.page.waitForFunction(() => typeof window.__mmReleaseOldPage === 'function');

    const hiddenAfterSwitch = await f.page.evaluate(() => {
      window.__mmTest.id = '222';
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
      return document.getElementById('mm-private').hidden;
    });
    assert.equal(hiddenAfterSwitch, true, 'identity-change synchronously clears owner content');
    await f.page.waitForFunction(() =>
      document.getElementById('mm-player-name')?.textContent === 'Beta player');
    assert.equal(await f.page.locator('#mm-load-more').isHidden(), false);
    assert.equal(await f.page.locator('#mm-load-more').isEnabled(), true);

    const oldPayload = plan('111','pap1-100');
    oldPayload.tasks[0].title = 'OBSOLETE Alpha claim';
    await f.page.evaluate(payload => window.__mmReleaseOldPage(payload), oldPayload);
    await f.page.waitForTimeout(50);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').innerText(), /Alpha|OBSOLETE/);
    await f.page.locator('#mm-load-more').click();
    await f.page.getByText('Beta historic contract bonus').first().waitFor();
    assert.equal(await f.page.locator('#mm-load-more').isHidden(), true);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally { await f.browser.close(); }
});

test('PR3 duplicate pet titles are attributed and pet buttons filter only one opaque source', async () => {
  const f = await setup({width:390,height:844}, true);
  f.setPlanFactory((owner, cursor) => {
    const payload = plan(owner,cursor);
    if (cursor) return payload;
    const secondRef = 'pap_' + 'd'.repeat(24);
    payload.owner.pet_count = 2;
    payload.owner.pets.push({
      ...payload.owner.pets[0], pet_ref: secondRef, slot_number: 2,
      selected: false, life_stage: 'hatched', lifecycle_phase: 'adult',
    });
    const second = { ...payload.tasks[0],
      task_id: 'moonpet.jobs:another-immutable-session', source_pet_ref: secondRef };
    payload.tasks.push(second);
    payload.top_actions.push(second);
    return payload;
  });
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    assert.equal(await f.page.locator('#mm-next .mm-task').count(),2);
    assert.match(await f.page.locator('#mm-next').innerText(), /MoonPet slot 1/);
    assert.match(await f.page.locator('#mm-next').innerText(), /MoonPet slot 2/);
    assert.match(await f.page.locator('#mm-pets').innerText(), /Lifecycle phase: adult/);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').getAttribute('data-pet-ref') || '', /pap_/);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').evaluate(node => node.innerHTML), /pap_[a-f0-9]{24}/);

    await f.page.locator('#mm-pets [data-mm-pet-index="1"]').click();
    assert.equal(await f.page.locator('[data-mm-tab="moonpet"]').getAttribute('aria-selected'),'true');
    assert.match(await f.page.locator('#mm-pet-filter').innerText(), /Showing only MoonPet slot 2/);
    assert.equal(await f.page.locator('#mm-results .mm-task').count(),1);
    assert.match(await f.page.locator('#mm-results').innerText(), /MoonPet slot 2/);
    assert.doesNotMatch(await f.page.locator('#mm-results').innerText(), /MoonPet slot 1/);
    assert.equal(await f.page.locator('#mm-results a.mm-button').first().getAttribute('href'),
      '/moonpet-game.html', 'no raw pet selectors in gameplay links');
    await f.page.locator('#mm-clear-pet-filter').click();
    assert.equal(await f.page.locator('#mm-pet-filter').isHidden(), true);
    assert.equal(await f.page.locator('#mm-results .mm-task').count(),2);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally { await f.browser.close(); }
});

test('PR3 unavailable roster retains saved original-pet claims without asserting archival', async () => {
  const f = await setup({width:390,height:844}, true);
  f.setPlanFactory((owner,cursor) => {
    const payload = plan(owner,cursor);
    if (cursor) return payload;
    payload.owner.pet_count = null;
    payload.owner.pets = null;
    payload.source_status['moonpet.adoption-incubation'] = {state:'query_failed'};
    const saved = plan(owner,'pap1-100').tasks[0];
    payload.tasks.push(saved);
    payload.top_actions.push(saved);
    return payload;
  });
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    const petText = await f.page.locator('#mm-pets').innerText();
    assert.match(petText,/Owned MoonPet roster unavailable/);
    assert.match(petText,/Original-earning MoonPet/);
    assert.match(petText,/Active membership unknown/);
    assert.doesNotMatch(petText,/archived|historical record is not reassigned/i);
    assert.match(await f.page.locator('#mm-next').innerText(),/membership unknown/);
    await f.page.locator('#mm-pets [data-mm-pet-index="1"]').click();
    assert.match(await f.page.locator('#mm-results').innerText(),/Alpha historic contract bonus/);
    assert.doesNotMatch(await f.page.locator('#mm-results').innerText(),/Alpha saved job claim/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally { await f.browser.close(); }
});


test('PR3 gameplay invalidation cancels old cursor and restores pagination', async () => {
  const f = await setup({width:390,height:844}, true);
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    await f.page.waitForFunction(() => !document.getElementById('mm-refresh').disabled);
    await holdOneCursorResponse(f.page);
    await f.page.locator('#mm-load-more').click();
    await f.page.waitForFunction(() => typeof window.__mmReleaseOldPage === 'function');
    await f.page.evaluate(() => window.dispatchEvent(new CustomEvent('moonboys:score-updated')));
    await f.page.waitForFunction(() =>
      document.getElementById('mm-load-more')?.disabled === false);
    await f.page.waitForFunction(() =>
      document.getElementById('mm-next')?.textContent.includes('Alpha saved job claim'));
    // The old async result must not append, even if its abort was ignored.
    const obsolete = plan('111', 'pap1-100');
    obsolete.tasks[0].title = 'OBSOLETE before accepted gameplay refresh';
    await f.page.evaluate(data => window.__mmReleaseOldPage(data), obsolete);
    await f.page.waitForTimeout(75);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').innerText(),/OBSOLETE before accepted/);
    assert.equal(await f.page.locator('#mm-load-more').isHidden(), false);
    assert.equal(await f.page.locator('#mm-load-more').isEnabled(), true);
    await f.page.locator('#mm-load-more').click();
    await f.page.getByText('Alpha historic contract bonus').first().waitFor();
    assert.equal(f.errors.length, 0, f.errors.join('\n'));
  } finally { await f.browser.close(); }
});


test('PR3 account-scoped saved 7/7 bonus retains original earning MoonPet in Next 3, Claims and pet filter', async () => {
  const f = await setup({width:390,height:844}, true);
  f.setPlanFactory((owner,cursor) => {
    const projection = plan(owner,cursor);
    if (cursor) return projection;
    const original = 'pap_' + 'd'.repeat(24);
    const bonus = {
      ...projection.tasks[0],
      source_key: 'moonpet.seven-of-seven-claim',
      task_id: 'moonpet.seven-of-seven-claim:saved-earner:2026-10-15',
      title: 'Collect saved Moonpet 7/7 bonus',
      what: 'Collect saved Moonpet 7/7 bonus',
      why: 'This verified completion remains claimable for the original earning MoonPet.',
      owner_scope: 'account',
      source_pet_ref: original,
      status: 'claim_ready', priority: 11,
      period: {kind:'saved_claim',key:'2026-10-15',origin_timezone:'UTC'},
      evidence: {kind:'server_receipt',verified_completion:false},
    };
    projection.tasks.push(bonus);
    projection.top_actions.unshift(bonus);
    return projection;
  });
  try {
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.getByText('Collect saved Moonpet 7/7 bonus').first().waitFor();
    assert.match(await f.page.locator('#mm-next').innerText(),
      /Original earning MoonPet: Original-earning MoonPet 2/);
    assert.match(await f.page.locator('#mm-pets').innerText(),/Original-earning MoonPet 2/);
    await f.page.locator('[data-mm-tab="claims"]').click();
    assert.match(await f.page.locator('#mm-results').innerText(),/Collect saved Moonpet 7\/7 bonus/);
    assert.match(await f.page.locator('#mm-results').innerText(),/Original earning MoonPet/);
    await f.page.locator('#mm-pets [data-mm-pet-index="1"]').click();
    assert.equal(await f.page.locator('[data-mm-tab="moonpet"]').getAttribute('aria-selected'),'true');
    assert.equal(await f.page.locator('#mm-results .mm-task').count(),1);
    assert.match(await f.page.locator('#mm-results').innerText(),/Collect saved Moonpet 7\/7 bonus/);
    assert.doesNotMatch(await f.page.locator('#mm-results').innerText(),/Alpha saved job claim/);
    assert.equal(await f.page.locator('#mm-results a.mm-button').first().getAttribute('href'),
      '/moonpet-game.html', 'source-pet selectors must never reach gameplay URLs');
    assert.doesNotMatch(await f.page.locator('#my-moonboy').evaluate(node=>node.innerHTML),
      /pap_[a-f0-9]{24}/u, 'opaque refs are in memory only');
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally {await f.browser.close();}
});

test('PR3 reserves same-owner request key during delayed auth and dedupes Retry/focus', async () => {
  const f=await setup({width:390,height:844},true,'',{authDelayMs:500});
  try {
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.waitForFunction(()=>window.__mmTest.authReads===1);
    await f.page.locator('#mm-gate-retry').click();
    await f.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    await f.page.waitForTimeout(100);
    const authCalls=await f.page.evaluate(()=>window.__mmTest.authReads);
    assert.equal(authCalls,1,'initial fetch, Retry and focus must share one auth attempt');
    assert.equal(f.requests.length,1,'no competing first-page writes after delayed auth');
    assert.equal(f.requests[0].body.telegram_auth.id,'111');
    assert.match(await f.page.locator('#mm-next').innerText(),/Alpha saved job claim/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally {await f.browser.close();}
});

test('PR3 retries failed initial website cookie discovery before any private plan request', async () => {
  const f=await setup({width:390,height:844},false,'',
    {cookieRestorable:true,bootstrapProbeFails:true});
  try {
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.waitForFunction(() =>
      document.getElementById('mm-gate-title')?.textContent==='Log in to My Moonboy');
    assert.equal(f.requests.length,0,'failed cookie discovery cannot become an anonymous private request');
    assert.equal(await f.page.locator('#mm-private').isHidden(),true);
    await f.page.locator('#mm-gate-retry').click();
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    assert.equal(await f.page.locator('#mm-private').isVisible(),true);
    assert.equal(await f.page.locator('#mm-player-name').textContent(),'Alpha player');
    assert.ok(f.requests.length>0);
    assert.ok(f.requests.every(item => item.method==='POST' &&
      item.body.telegram_auth && item.body.telegram_auth.id==='111' &&
      !new URL(item.url).searchParams.has('telegram_auth')));
    assert.equal(await f.page.locator('[data-shell-link="MY MOONBOY"]').count(),1);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally {await f.browser.close();}
});

test('PR3 reranking between pages returns 409 and restarts from newly verified first page', async () => {
  const f=await setup({width:390,height:844},true);
  let reRank=false;
  f.setPlanFactory((owner,cursor) => {
    const projection=plan(owner,cursor);
    if(reRank) {
      projection.snapshot='pap2_'+'d'.repeat(32);
      if(!cursor){
        projection.tasks[0].title='Fresh ranking after saved claim changed';
        projection.top_actions[0].title='Fresh ranking after saved claim changed';
      }
    }
    return projection;
  });
  try {
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    const oldSnapshot=f.requests[0].body.snapshot;
    assert.equal(oldSnapshot,undefined,'first page does not submit a snapshot');
    reRank=true;
    await f.page.locator('#mm-load-more').click();
    await f.page.waitForFunction(() =>
      document.getElementById('mm-next')?.textContent.includes('Fresh ranking after saved claim changed'));
    assert.equal(await f.page.locator('#mm-load-more').isVisible(),true);
    assert.equal(await f.page.locator('#mm-load-more').isEnabled(),true);
    assert.equal(await f.page.locator('#mm-page-count').textContent(),
      '3 tasks loaded · 1 shown · more available',
      'old cursor page cannot append reordered tasks');
    const cursorRequests=f.requests.filter(item => item.body.cursor==='pap1-100');
    assert.equal(cursorRequests.length,1);
    assert.equal(cursorRequests[0].body.snapshot,'pap2_'+'a'.repeat(32));
    assert.doesNotMatch(await f.page.locator('#mm-next').innerText(),/Alpha saved job claim/);
    await f.page.locator('#mm-load-more').click();
    await f.page.getByText('Alpha historic contract bonus').first().waitFor();
    const cursors=f.requests.filter(item=>item.body.cursor==='pap1-100');
    assert.equal(cursors.length,2);
    assert.equal(cursors[1].body.snapshot,'pap2_'+'d'.repeat(32));
    assert.equal(await f.page.locator('#mm-load-more').isHidden(),true);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally {await f.browser.close();}
});


test('PR3 dashboard labels cross-season 1/2/1 pet ownership by permanent spaces 1/2/3', async () => {
  const f = await setup({width:390,height:844}, true);
  f.setPlanFactory((owner, cursor) => {
    const result = plan(owner, cursor);
    if (cursor) return result;
    const slotOne = result.owner.pets[0];
    const spaceTwo = 'pap_' + 'd'.repeat(24);
    const spaceThree = 'pap_' + 'e'.repeat(24);
    // Backend has already ranked across retained ownership rows, even
    // though season-local source slots are 1,2,1 across quarters.
    result.owner.pet_count = 3;
    result.owner.pets = [
      {...slotOne, slot_number:1, selected:false},
      {...slotOne, pet_ref:spaceTwo, slot_number:2, selected:false},
      {...slotOne, pet_ref:spaceThree, slot_number:3, selected:true},
    ];
    result.tasks.push({
      ...result.tasks[0], task_id:'moonpet.jobs:season-q3:space2',
      source_pet_ref:spaceTwo, title: 'Cross-season saved job',
      what:'Cross-season saved job',
    }, {
      ...result.tasks[0], task_id:'moonpet.jobs:season-q4:space3',
      source_pet_ref:spaceThree, title: 'Cross-season saved job',
      what:'Cross-season saved job',
    });
    result.top_actions = result.tasks.filter(t => t.source_key === 'moonpet.jobs');
    return result;
  });
  try {
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    const visibleLabels = await f.page.locator('#mm-pets .mm-pet h3').allTextContents();
    assert.deepEqual(visibleLabels.slice(0,3),[
      'MoonPet slot 1','MoonPet slot 2','MoonPet slot 3',
    ], 'permanent position must not restart at the new quarter');
    assert.equal(visibleLabels.filter(label => label === 'MoonPet slot 1').length,1);
    assert.match(await f.page.locator('#mm-next').innerText(),/MoonPet slot 3/);
    await f.page.locator('#mm-pets [data-mm-pet-index="2"]').click();
    assert.match(await f.page.locator('#mm-pet-filter').innerText(),/MoonPet slot 3/);
    assert.equal(await f.page.locator('#mm-results .mm-task').count(),1);
    assert.match(await f.page.locator('#mm-results').innerText(),/Cross-season saved job/);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').evaluate(node=>node.innerHTML),
      /pap_[a-f0-9]{24}/u, 'persistent pet identifiers never appear in the rendered HTML');
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally {await f.browser.close();}
});

test('PR3 does not invent permanent Moonpet slot number when the server omits it', async () => {
  const f = await setup({width:390,height:844}, true);
  f.setPlanFactory((owner, cursor) => {
    const response = plan(owner, cursor);
    if (!cursor) response.owner.pets[0].slot_number = null;
    return response;
  });
  try {
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    assert.match(await f.page.locator('#mm-pets .mm-pet').first().innerText(),
      /permanent slot unknown/);
    assert.doesNotMatch(await f.page.locator('#mm-pets .mm-pet h3').first().innerText(),
      /MoonPet slot 1/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally {await f.browser.close();}
});


test('PR3 initial signed mission load recovers when its response crosses UTC midnight', async () => {
  const f = await setup({width:390,height:844}, true);
  // Hold only the very first signed POST at the browser boundary. Later
  // attempts use the normal mocked API. No production debug hooks required.
  await f.context.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    let held = false;
    window.fetch = (url, options) => {
      if (!held && String(url).endsWith('/player/action-plan') &&
        options && options.method === 'POST') {
        held = true;
        return new Promise(resolve => {
          window.__mmReleaseInitial = payload => resolve(new Response(JSON.stringify(payload), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          }));
        });
      }
      return originalFetch(url, options);
    };
  });
  f.setPlanFactory((owner, cursor) => {
    const result = plan(owner, cursor);
    result.period.utc_day = '2026-10-18';
    result.generated_at = '2026-10-18T00:00:30.000Z';
    result.tasks[0].title = 'New UTC day saved job';
    result.top_actions[0].title = 'New UTC day saved job';
    return result;
  });
  try {
    await f.page.clock.install({time:new Date('2026-10-17T23:59:58.000Z')});
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    // The initial auth/projection begins before midnight. Keep the request
    // within its 12.5s timeout while advancing the virtual UTC date.
    for (let i = 0; i < 8; i++) {
      if (await f.page.evaluate(() => typeof window.__mmReleaseInitial === 'function')) break;
      await f.page.clock.runFor(100);
    }
    assert.equal(await f.page.evaluate(() => typeof window.__mmReleaseInitial), 'function');
    assert.equal(await f.page.evaluate(() => document.hidden), false, 'visible-page poll must run');
    assert.equal(f.requests.length, 0, 'original signed POST is deliberately pending');

    await f.page.clock.runFor(2500);
    assert.equal(await f.page.evaluate(() => new Date().toISOString().slice(0,10)), '2026-10-18');
    const old = plan('111');
    old.period.utc_day = '2026-10-17';
    old.generated_at = '2026-10-17T23:59:58.000Z';
    old.top_actions[0].title = 'Old UTC day action must not appear';
    old.tasks[0].title = 'Old UTC day action must not appear';
    await f.page.evaluate(payload => window.__mmReleaseInitial(payload), old);
    await f.page.clock.runFor(100);
    assert.equal(await f.page.locator('#mm-private').isHidden(), true,
      'the old-day initial response must not paint potentially expired tasks');
    assert.equal(f.requests.length, 0, 'no new signed read before the visibility timer');

    // The existing visible-page interval must recover even though state.plan
    // is still NULL. Previously it required state.plan and stalled forever.
    await f.page.clock.runFor(31000);
    await f.page.locator('#mm-next .mm-task').first().waitFor({timeout:10000});
    assert.equal(await f.page.locator('#mm-private').isVisible(), true);
    assert.equal(f.requests.length, 1, 'visible-page rollover starts exactly one new signed API read');
    assert.equal(f.requests[0].method, 'POST');
    assert.equal(f.requests[0].body.telegram_auth.id, '111');
    assert.equal(f.requests[0].body.cursor, undefined);
    assert.equal(f.requests[0].body.snapshot, undefined);
    assert.match(await f.page.locator('#mm-next').innerText(), /New UTC day saved job/);
    assert.doesNotMatch(await f.page.locator('#my-moonboy').innerText(), /Old UTC day action must not appear/);
    assert.equal(await f.page.locator('#mm-sync').getAttribute('data-state'), 'ok');
    assert.equal(f.errors.length, 0, f.errors.join('\n'));
  } finally {
    await f.browser.close();
  }
});


test('PR5 accepted-action invalidation hides claim badges until a fresh source projection arrives', async () => {
  const f=await setup({width:390,height:844},true);
  let cleared=false;
  f.setPlanFactory((owner,cursor)=>{
    const value=plan(owner,cursor);
    if(cleared && !cursor){
      value.summary.claims_ready=0;
      value.summary.ready_count=0;
      value.tasks[0].status='claimed';
      value.top_actions=[];
    }
    return value;
  });
  try{
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    assert.equal(await f.page.locator('#mm-claims-badge').textContent(),'1');
    assert.match(await f.page.locator('#mm-pets').innerText(),/1 claim ready/);
    const before=f.requests.length;
    cleared=true;
    const immediate=await f.page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted',{
        detail:{source:'moonpet',event:'moonpet:action-accepted',remote:true,utc_day:new Date().toISOString().slice(0,10)}
      }));
      return {
        badgeHidden:document.getElementById('mm-claims-badge').hidden,
        next:document.getElementById('mm-next').textContent,
        sync:document.getElementById('mm-sync').textContent,
      };
    });
    assert.equal(immediate.badgeHidden,true,'stale claim count cannot remain a ready badge');
    assert.match(immediate.next,/Top recommendations temporarily unavailable/);
    assert.match(immediate.sync,/STALE|refresh pending/i);
    await f.page.waitForFunction(count=>window.performance &&
      document.getElementById('mm-claim-count')?.textContent==='0',before,{timeout:5000});
    assert.ok(f.requests.length>before);
    assert.equal(await f.page.locator('#mm-claims-badge').isHidden(),true);
    assert.doesNotMatch(await f.page.locator('#mm-pets').innerText(),/claim ready/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR5 offline state removes current readiness badges and online reconciliation restores server truth',async()=>{
  const f=await setup({width:390,height:844},true);
  try{
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    const before=f.requests.length;
    assert.equal(await f.page.locator('#mm-claims-badge').isHidden(),false);
    const offline=await f.page.evaluate(()=>{
      window.dispatchEvent(new Event('offline'));
      return {
        badgeHidden:document.getElementById('mm-claims-badge').hidden,
        sync:document.getElementById('mm-sync').textContent,
        next:document.getElementById('mm-next').textContent,
      };
    });
    assert.equal(offline.badgeHidden,true);
    assert.match(offline.sync,/OFFLINE/);
    assert.match(offline.next,/Top recommendations temporarily unavailable/);
    assert.match(await f.page.locator('#mm-pets').innerText(),/1 formerly actionable item\(s\)/,
      'offline stale snapshot preserves the last-confirmed historical availability count');
    assert.doesNotMatch(await f.page.locator('#mm-pets').innerText(),/0 formerly actionable item\(s\)/);
    assert.equal(f.requests.length,before,'offline is display-only and cannot start a request');
    await f.page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await f.page.waitForFunction(()=>document.getElementById('mm-sync')?.textContent.startsWith('Last verified read'));
    assert.ok(f.requests.length>before);
    assert.equal(await f.page.locator('#mm-claims-badge').textContent(),'1');
    assert.equal(await f.page.locator('#mm-claims-badge').isHidden(),false);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR5 My Moonboy shell loads the global action sync before private dashboard code',async()=>{
  const html=await readFile(path.join(ROOT,'my-moonboy.html'),'utf8');
  const shell=await readFile(path.join(ROOT,'js/site-shell.js'),'utf8');
  const moonpet=await readFile(path.join(ROOT,'moonpet-game.html'),'utf8');
  assert.match(shell,/\/js\/player-action-sync\.js/u);
  assert.match(shell,/data-player-action-sync/u);
  assert.match(html,/src="\/js\/site-shell\.js"/u);
  assert.ok(html.indexOf('src="/js/site-shell.js"')<html.indexOf('src="/js/my-moonboy.js"'));
  assert.match(moonpet,/src="\/js\/player-action-sync\.js"/u,
    'standalone Moonpet page cannot rely on site-shell loader');
  assert.ok(moonpet.indexOf('src="/js/player-action-sync.js"')<
    moonpet.indexOf('src="/js/moonpet-mini-app.js'));
});


test('PR5 offline transition retires pending reads and blocks refresh/pagination until reconnect', async () => {
  const f=await setup({width:390,height:844},true);
  try {
    await f.page.goto(SITE+'/my-moonboy.html',{waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    assert.equal(await f.page.locator('#mm-claims-badge').isHidden(),false);
    assert.match(await f.page.locator('#mm-pets').innerText(),/1 source-verified action\(s\) available at last sync/);
    const before=f.requests.length;
    f.setSlowOwner('111');
    await f.page.locator('#mm-refresh').click();
    for(let i=0;i<40&&f.requests.length===before;i++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(f.requests.length>before,'refresh must be in flight before offline transition');
    await f.page.evaluate(()=>window.dispatchEvent(new Event('offline')));
    assert.match(await f.page.locator('#mm-sync').innerText(),/OFFLINE/);
    assert.equal(await f.page.locator('#mm-claims-badge').isHidden(),true);
    assert.match(await f.page.locator('#mm-next').innerText(),/Top recommendations temporarily unavailable/);
    const atOffline=f.requests.length;
    await f.page.waitForTimeout(350);
    assert.equal(await f.page.locator('#mm-claims-badge').isHidden(),true,
      'late pre-offline response cannot restore claim readiness');
    assert.match(await f.page.locator('#mm-sync').innerText(),/OFFLINE/);
    assert.equal(await f.page.locator('#mm-next a.mm-button').count(),0);

    await f.page.locator('#mm-refresh').click();
    await f.page.locator('#mm-load-more').click();
    await f.page.waitForTimeout(80);
    assert.equal(f.requests.length,atOffline,'manual reads are guarded while offline');

    await f.page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await f.page.waitForFunction(()=>document.getElementById('mm-sync')?.textContent.startsWith('Last verified read'),
      null,{timeout:5000});
    assert.ok(f.requests.length>atOffline,'reconnect starts a fresh signed read');
    assert.equal(await f.page.locator('#mm-claims-badge').isHidden(),false);
    assert.equal(await f.page.locator('#mm-claims-badge').textContent(),'1');
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally { await f.browser.close(); }
});


test('My Moonboy public guide separates Gems from Moon Crystals without exposing a guest checklist', async () => {
  const f = await setup({width:360,height:800}, false);
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-economy-guide .mm-economy-item').first().waitFor();
    assert.equal(await f.page.locator('#mm-private').isHidden(), true);
    assert.equal(await f.page.locator('#mm-complete-checklist').isHidden(), true,
      'personal checklist must remain behind verified auth');
    assert.equal(f.requests.length, 0, 'public resource guide never reads owner plan');
    assert.match(await f.page.locator('#mm-economy').textContent(), /Moon Crystals|Block Topia Gems/u);
    assert.match(await f.page.locator('#mm-economy').textContent(), /Wiki likes, comments, citations/u);
    assert.match(await f.page.locator('#mm-economy').textContent(), /Cite mission votes on an existing listed source|Cite — vote/u);
    assert.ok(await f.page.evaluate(() =>
      document.querySelector('#mm-economy').getBoundingClientRect().right <= innerWidth + 1));
    assert.equal(f.errors.length, 0, f.errors.join('\n'));
  } finally { await f.browser.close(); }
});

test('My Moonboy signed checklist includes every source and saved-only claim class and clears on logout', async () => {
  const f = await setup({width:390,height:844}, true);
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-checklist .mm-checklist-source').first().waitFor({state:'attached'});
    assert.equal(await f.page.locator('#mm-checklist .mm-checklist-source').count(), 28);
    assert.equal(await f.page.locator('#mm-checklist [data-mm-checklist-key="gap:saved-status"] .mm-checklist-gaps li').count(), 5);
    assert.equal(await f.page.locator('#mm-checklist [data-mm-checklist-key="gap:wiki-engagement"] .mm-checklist-gaps li').count(), 6);
    assert.match(await f.page.locator('#mm-checklist [data-mm-checklist-key="gap:wiki-engagement"]').textContent(),
      /Engage|Signal|Cite/u);
    assert.match(await f.page.locator('#mm-checklist').textContent(), /Alpha saved job claim/u);
    assert.match(await f.page.locator('#mm-checklist').textContent(), /Status unavailable|ready — read-only source status|No task in loaded results/u);
    assert.ok(await f.page.evaluate(() =>
      document.querySelector('#mm-complete-checklist').getBoundingClientRect().right <= innerWidth + 1));
    await f.page.evaluate(() => {
      window.__mmTest.linked = false;
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    });
    assert.equal(await f.page.locator('#mm-private').isHidden(), true);
    assert.equal(await f.page.locator('#mm-checklist').textContent(), '',
      'all private checklist rows must be removed synchronously on logout');
    assert.equal(f.errors.length, 0, f.errors.join('\n'));
  } finally { await f.browser.close(); }
});


test('signed checklist labels the source MoonPet/window and preserves the exact focused Saved Status/Wiki link', async () => {
  const f = await setup({width:390,height:844}, true);
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-checklist [data-mm-checklist-key="source:moonpet.jobs"]')
      .waitFor({state:'attached'});
    const job = await f.page.locator('#mm-checklist [data-mm-checklist-key="source:moonpet.jobs"]').textContent();
    assert.match(job, /MoonPet slot 1/u, 'source pet label must be visible in checklist');
    assert.match(job, /Source period: saved timer · saved-session · UTC/u);
    assert.doesNotMatch(job, /pap_[a-f0-9]{24}/u, 'opaque source pet ID must not be disclosed');

    // All five Saved Status actions point to the SAME MoonPet game URL.
    // A source refresh must return keyboard focus to the original claim row.
    const savedLink = f.page.locator('[data-mm-focus-link="saved:weekly_bounty_claim"]');
    await savedLink.focus();
    assert.equal(await f.page.evaluate(() => document.activeElement?.getAttribute('data-mm-focus-link')),
      'saved:weekly_bounty_claim');
    const focusedAfterRefresh = await f.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonboys:player-reconcile-needed', {
        detail: {reason:'test-source-refreshed'},
      }));
      return document.activeElement?.getAttribute('data-mm-focus-link');
    });
    assert.equal(focusedAfterRefresh, 'saved:weekly_bounty_claim',
      'refresh must not move focus to the first identical /moonpet-game.html link');
    await f.page.waitForFunction(() =>
      document.getElementById('mm-sync')?.textContent?.startsWith('Last verified read'),
      null, {timeout:8000});
    assert.equal(await f.page.evaluate(() => document.activeElement?.getAttribute('data-mm-focus-link')),
      'saved:weekly_bounty_claim');

    // Multiple Wiki tasks likewise navigate to the same article URL.
    const wikiLink = f.page.locator('[data-mm-focus-link="wiki:cite"]');
    await wikiLink.focus();
    const focusedWiki = await f.page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonboys:player-reconcile-needed', {
        detail: {reason:'test-second-source-refresh'},
      }));
      return document.activeElement?.getAttribute('data-mm-focus-link');
    });
    assert.equal(focusedWiki, 'wiki:cite',
      'citation link focus must not jump to Engage on an identical destination');
    assert.equal(f.errors.length, 0, f.errors.join('\n'));
  } finally { await f.browser.close(); }
});


test('missed XP refresh is owner scoped, recomputed per signed reconciliation and resists late stale responses', async () => {
  const f = await setup({width:390,height:844}, true);
  try {
    await f.page.goto(SITE + '/my-moonboy.html', {waitUntil:'domcontentloaded'});
    await f.page.locator('#mm-next .mm-task').first().waitFor();
    await f.page.evaluate(() => {
      window.__xpPending = [];
      // Minimal My Moonboy fixture may omit the real daily-loop singleton.
      // Install an owner-scoped mock to exercise the private renderer contract.
      const api = window.MOONBOYS_DAILY_LOOP ||
        (window.MOONBOYS_DAILY_LOOP = {});
      api.refreshAfterInflight = options => new Promise(resolve => {
        window.__xpPending.push({ options, resolve });
      });
    });
    await f.page.locator('#mm-refresh').click();
    await f.page.waitForFunction(() => window.__xpPending?.length === 1);
    assert.equal(await f.page.locator('#mm-missed-xp').textContent(),
      'Checking saved missed XP…');
    await f.page.locator('#mm-search').fill('job');
    assert.equal(await f.page.evaluate(() => window.__xpPending.length), 1,
      'typing and rerendering must not cause a second missed-XP network read');
    f.setSlowOwner('111');
    await f.page.locator('#mm-refresh').click();
    await f.page.waitForFunction(() =>
      document.getElementById('mm-missed-xp')?.textContent?.includes('Previous snapshot'));
    await f.page.evaluate(() => {
      const p = window.__xpPending[0];
      p.resolve({
        fetch_status:'ok',fetched_at:new Date().toISOString(),
        utc_day:new Date().toISOString().slice(0,10),
        identity:{linked:true,telegram_id:'111'},
        source_status:{missed_opportunities:{state:'live'}},
        missed_opportunities:{xp_source_status:'verified',xp_total_all_time:45}
      });
    });
    await f.page.waitForTimeout(40);
    assert.match(await f.page.locator('#mm-missed-xp').textContent(),
      /Previous snapshot/u,
      'late accepted read cannot overwrite stale account status');
    await f.page.waitForFunction(() => window.__xpPending?.length === 2,
      null, {timeout:8000});
    await f.page.evaluate(() => {
      window.__xpPending[1].resolve({
        fetch_status:'ok',fetched_at:new Date().toISOString(),
        utc_day:new Date().toISOString().slice(0,10),
        identity:{linked:true,telegram_id:'111'},
        source_status:{missed_opportunities:{state:'live'}},
        missed_opportunities:{xp_source_status:'verified',xp_total_all_time:57}
      });
    });
    await f.page.waitForFunction(() =>
      document.getElementById('mm-missed-xp')?.textContent?.startsWith('57 potential XP missed'));
    await f.page.locator('#mm-search').fill('');
    assert.equal(await f.page.evaluate(() => window.__xpPending.length), 2,
      'filtered and unfiltered views reuse the last proven read');
    await f.page.evaluate(() => {
      window.__mmTest.id='222';
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    });
    assert.doesNotMatch(await f.page.locator('#my-moonboy').textContent(),
      /57 potential XP missed/u,'private XP must purge on identity switch');
    assert.equal(f.errors.length, 0, f.errors.join('\n'));
  } finally { await f.browser.close(); }
});

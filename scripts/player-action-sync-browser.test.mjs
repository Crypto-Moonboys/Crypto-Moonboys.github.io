import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SYNC = await readFile(path.join(ROOT, 'js/player-action-sync.js'), 'utf8');
const SITE_SHELL = await readFile(path.join(ROOT, 'js/site-shell.js'), 'utf8');

async function setup() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('https://cryptomoonboys.com/sync-test*', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main>sync</main></body></html>' }));
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([
    a.goto('https://cryptomoonboys.com/sync-test?a'),
    b.goto('https://cryptomoonboys.com/sync-test?b'),
  ]);
  for (const page of [a,b]) {
    await page.evaluate(() => {
      window.__accepted = [];
      window.__reconcile = [];
      window.__offline = [];
      window.__writes = 0;
      window.fetch = () => { window.__writes++; return Promise.reject(new Error('sync must not fetch')); };
      window.addEventListener('moonboys:player-action-accepted', event => {
        window.__accepted.push(event.detail);
      });
      window.addEventListener('moonboys:player-reconcile-needed', event => {
        window.__reconcile.push(event.detail);
      });
      window.addEventListener('moonboys:player-offline', event => {
        window.__offline.push(event.detail);
      });
    });
    await page.addScriptTag({ content: SYNC });
  }
  return { browser, context, a, b };
}

test('accepted Moonpet action broadcasts one sanitized invalidation to another tab', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonpet:action-accepted', {
        detail: {
          action: 'daily_completion_claim',
          pet_id: 'secret-pet',
          telegram_id: '123456',
          reward: { pet_xp: 25 },
          receipt_id: 'private-receipt',
          telegram_auth: { hash: 'secret' },
        },
      }));
    });
    await f.b.waitForFunction(() => window.__accepted.length === 1);
    const remote = await f.b.evaluate(() => window.__accepted[0]);
    assert.deepEqual(Object.keys(remote).sort(), ['event','remote','source','utc_day']);
    assert.equal(remote.source, 'moonpet');
    assert.equal(remote.event, 'moonpet:action-accepted');
    assert.equal(remote.remote, true);
    assert.doesNotMatch(JSON.stringify(remote), /secret|pet_id|telegram|reward|receipt|hash/u);
    assert.equal(await f.a.evaluate(() => window.__writes), 0);
    assert.equal(await f.b.evaluate(() => window.__writes), 0);
  } finally { await f.browser.close(); }
});

test('accepted-event bursts publish immediate plus trailing invalidation without rebroadcast loops', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      for (let i=0;i<8;i++) {
        window.dispatchEvent(new CustomEvent('moonboys:arcade-score-accepted', {
          detail: { source:'arcade', score:999+i, player:'private' }
        }));
      }
    });
    await f.b.waitForFunction(() => window.__accepted.length === 1);
    await f.b.waitForFunction(() => window.__accepted.length === 2, null, { timeout: 3000 });
    assert.equal(await f.a.evaluate(() => window.__accepted.length), 2,
      'local tab gets immediate stale mark plus one trailing final-state invalidation');
    assert.equal(await f.b.evaluate(() => window.__accepted.length), 2,
      'remote tab gets immediate plus trailing invalidation, with no echo loop');
    assert.ok((await f.b.evaluate(() => window.__accepted)).every(item =>
      item.event === 'moonboys:arcade-score-accepted' && item.source === 'arcade'));
  } finally { await f.browser.close(); }
});

test('public leaderboard score display updates are ignored by accepted-action sync', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonboys:score-updated', {
        detail: { player:'another public player', score:999999 }
      }));
    });
    await f.a.waitForTimeout(1200);
    assert.equal(await f.a.evaluate(() => window.__accepted.length), 0);
    assert.equal(await f.b.evaluate(() => window.__accepted.length), 0);
  } finally { await f.browser.close(); }
});

test('non-bubbling accepted Wiki mission events are normalized without carrying mission payload', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      document.dispatchEvent(new CustomEvent('moonboys:wiki-mission-complete', {
        detail: { page_id: 'secret-page', mission_id: 'private-mission', telegram_id: '123456' },
      }));
    });
    await f.b.waitForFunction(() => window.__accepted.length === 1);
    const event = await f.b.evaluate(() => window.__accepted[0]);
    assert.equal(event.source, 'wiki');
    assert.equal(event.event, 'moonboys:wiki-mission-complete');
    assert.doesNotMatch(JSON.stringify(event), /secret-page|private-mission|123456/u);
  } finally { await f.browser.close(); }
});

test('online/offline reconciliation is local read guidance only and creates no cross-tab accepted event', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    assert.equal(await f.a.evaluate(() => window.__offline.length), 1);
    assert.equal(await f.a.evaluate(() => window.__reconcile.length), 1);
    assert.equal(await f.b.evaluate(() => window.__accepted.length), 0);
    assert.equal(await f.a.evaluate(() => window.__writes), 0);
    assert.equal(await f.b.evaluate(() => window.__writes), 0);
  } finally { await f.browser.close(); }
});

test('only server-accepted source events are subscribed; rejected/progression-error signals do not invalidate', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonboys:progression-sync-error', { detail: { route:'/x', error:'rejected' } }));
      window.dispatchEvent(new CustomEvent('moonpet:action-rejected', { detail: { reason:'blocked' } }));
      window.dispatchEvent(new CustomEvent('moonboys:micro-notify', { detail: { message:'local only' } }));
    });
    await f.a.waitForTimeout(150);
    assert.equal(await f.a.evaluate(() => window.__accepted.length), 0);
    assert.equal(await f.b.evaluate(() => window.__accepted.length), 0);
  } finally { await f.browser.close(); }
});

test('PR5 real Arcade submit emits follow-up cross-tab invalidations after delayed settlements resolve', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let releaseFaction;
  let factionStarted = false;
  await context.route('https://cryptomoonboys.com/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/arcade-settlement-test') {
      return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>arcade</body></html>'});
    }
    if (url.pathname === '/js/leaderboard-client.js') {
      return route.fulfill({contentType:'application/javascript',
        body:await readFile(path.join(ROOT,'js/leaderboard-client.js'),'utf8')});
    }
    if (url.pathname === '/js/arcade-meta-system.js') {
      return route.fulfill({contentType:'application/javascript',body:
        "export const ArcadeMeta={trackGameResult(x){return {tracked:false,game:x.game,meta_points:0,timestamp:x.timestamp};}};"});
    }
    if (url.pathname === '/js/arcade-sync.js') {
      return route.fulfill({contentType:'application/javascript',body:
        "export const ArcadeSync={"+
        "getProjectedXpFromScore(){return 0;},"+
        "getPendingCount(){return 0;},"+
        "async getTelegramAuth(){return {id:'111',hash:'signed',auth_date:'1700000000'};},"+
        "syncPendingArcadeProgress(){window.__progressStarted=true;return new Promise(resolve=>{window.__releaseProgress=resolve;});},"+
        "async syncBlockTopiaProgressionOnAcceptedScore(){throw new Error('not blocktopia');}"+
        "};"});
    }
    if (url.pathname === '/js/arcade-meta-ui.js' || url.pathname === '/js/arcade-retention-engine.js') {
      return route.fulfill({contentType:'application/javascript',body:''});
    }
    if (url.pathname === '/api/leaderboard') {
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({accepted:true})});
    }
    if (url.pathname === '/api/faction/earn') {
      factionStarted = true;
      await new Promise(resolve => { releaseFaction = resolve; });
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({ok:true,faction:'graffpunks',faction_xp_awarded:5})});
    }
    return route.fulfill({status:404,body:''});
  });
  const source = await context.newPage();
  const remote = await context.newPage();
  try {
    for (const page of [source, remote]) {
      await page.goto('https://cryptomoonboys.com/arcade-settlement-test');
      await page.evaluate(() => {
        window.__accepted=[];
        window.addEventListener('moonboys:player-action-accepted',event=>window.__accepted.push(event.detail));
      });
      await page.addScriptTag({content:SYNC});
    }
    await source.evaluate(() => {
      window.MOONBOYS_API={
        STATUS:{},
        getLeaderboardApiInfo(){return {url:'https://cryptomoonboys.com/api/leaderboard',state:'configured'};},
        getApiBaseInfo(){return {url:'https://cryptomoonboys.com/api',state:'configured'};},
      };
      window.MOONBOYS_IDENTITY={
        isTelegramLinked:()=>true,
        getTelegramId:()=> '111',
        getTelegramName:()=> 'Arcade Tester',
        getTelegramAuth:()=>({id:'111',hash:'signed',auth_date:'1700000000'}),
        setSyncHealth(){},
      };
      window.MOONBOYS_FACTION={
        getCachedStatus:()=>({faction:'graffpunks'}),
        loadStatus:()=>Promise.resolve(),
      };
      window.__submitPromise=import('/js/leaderboard-client.js')
        .then(mod=>mod.submitScore('Arcade Tester',100,'snake-run'));
    });
    await remote.waitForFunction(()=>window.__accepted.length===1);
    for (let i=0;i<100 && !factionStarted;i++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(factionStarted,true,'faction settlement is held after initial score acceptance');
    assert.equal((await remote.evaluate(()=>window.__accepted))[0].source,'arcade');
    releaseFaction();
    await remote.waitForFunction(()=>window.__accepted.some(item=>item.source==='faction'));
    assert.equal(await remote.evaluate(()=>window.__accepted.filter(x=>x.source==='faction').length),1);
    await source.waitForFunction(()=>window.__progressStarted===true);
    assert.equal(await remote.evaluate(()=>window.__accepted.some(x=>x.source==='arcade_progression')),false,
      'competitive progression remains unannounced while its settlement is pending');
    await source.evaluate(()=>window.__releaseProgress({synced:1,rejected:1,remaining:0,skipped:false}));
    await remote.waitForFunction(()=>window.__accepted.some(item=>item.source==='arcade_progression'));
    assert.equal(await remote.evaluate(()=>window.__accepted.filter(x=>x.source==='arcade_progression').length),1,
      'partial progression success emits one post-settlement invalidation');
    await source.evaluate(()=>window.__submitPromise);
  } finally {
    await browser.close();
  }
});

async function runUnconfirmedArcadeSettlementScenario({ game, factionPayload, blockPayload }) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('https://cryptomoonboys.com/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/arcade-unconfirmed-test') {
      return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>arcade</body></html>'});
    }
    if (url.pathname === '/js/leaderboard-client.js') {
      return route.fulfill({contentType:'application/javascript',
        body:await readFile(path.join(ROOT,'js/leaderboard-client.js'),'utf8')});
    }
    if (url.pathname === '/js/arcade-meta-system.js') {
      return route.fulfill({contentType:'application/javascript',body:
        "export const ArcadeMeta={trackGameResult(x){return {tracked:false,game:x.game,meta_points:0,timestamp:x.timestamp};}};"});
    }
    if (url.pathname === '/js/arcade-sync.js') {
      return route.fulfill({contentType:'application/javascript',body:
        "export const ArcadeSync={"+
        "getProjectedXpFromScore(){return 0;},"+
        "getPendingCount(){return 0;},"+
        "async getTelegramAuth(){return {id:'111',hash:'signed',auth_date:'1700000000'};},"+
        "async syncPendingArcadeProgress(){return {skipped:true,reason:'fixture_skip'};},"+
        "async syncBlockTopiaProgressionOnAcceptedScore(){return window.__blockPayload;}"+
        "};"});
    }
    if (url.pathname === '/js/arcade-meta-ui.js' || url.pathname === '/js/arcade-retention-engine.js') {
      return route.fulfill({contentType:'application/javascript',body:''});
    }
    if (url.pathname === '/api/leaderboard') {
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({accepted:true})});
    }
    if (url.pathname === '/api/faction/earn') {
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(factionPayload)});
    }
    return route.fulfill({status:404,body:''});
  });
  const source = await context.newPage();
  const remote = await context.newPage();
  try {
    for (const page of [source, remote]) {
      await page.goto('https://cryptomoonboys.com/arcade-unconfirmed-test');
      await page.evaluate(() => {
        window.__accepted=[];
        window.addEventListener('moonboys:player-action-accepted',event=>window.__accepted.push(event.detail));
      });
      await page.addScriptTag({content:SYNC});
    }
    await source.evaluate(({game, blockPayload}) => {
      window.__blockPayload=blockPayload;
      window.MOONBOYS_API={
        STATUS:{},
        getLeaderboardApiInfo(){return {url:'https://cryptomoonboys.com/api/leaderboard',state:'configured'};},
        getApiBaseInfo(){return {url:'https://cryptomoonboys.com/api',state:'configured'};},
      };
      window.MOONBOYS_IDENTITY={
        isTelegramLinked:()=>true,
        getTelegramId:()=> '111',
        getTelegramName:()=> 'Arcade Tester',
        getTelegramAuth:()=>({id:'111',hash:'signed',auth_date:'1700000000'}),
        setSyncHealth(){},
      };
      window.MOONBOYS_FACTION={
        getCachedStatus:()=>({faction:'graffpunks'}),
        loadStatus:()=>Promise.resolve(),
      };
      window.__submitPromise=import('/js/leaderboard-client.js')
        .then(mod=>mod.submitScore('Arcade Tester',100,game));
    },{game,blockPayload});
    await source.evaluate(()=>window.__submitPromise);
    await remote.waitForFunction(()=>window.__accepted.length>=1);
    await remote.waitForTimeout(1100);
    return await remote.evaluate(()=>window.__accepted);
  } finally {
    await browser.close();
  }
}

test('PR5 unconfirmed faction and Block Topia settlements emit no follow-up invalidation', async () => {
  const skippedFaction = await runUnconfirmedArcadeSettlementScenario({
    game:'snake-run',
    factionPayload:{ok:true,skipped:true,reason:'schema_unavailable'},
    blockPayload:{ok:true},
  });
  assert.deepEqual(skippedFaction.map(item=>item.source),['arcade'],
    'skipped faction response must not masquerade as confirmed faction settlement');

  const unreadableBlock = await runUnconfirmedArcadeSettlementScenario({
    game:'blocktopia',
    factionPayload:{ok:true,skipped:true,reason:'schema_unavailable'},
    blockPayload:null,
  });
  assert.deepEqual(unreadableBlock.map(item=>item.source),['arcade'],
    'null Block Topia response must not masquerade as confirmed progression settlement');

  const zeroXpBlock = await runUnconfirmedArcadeSettlementScenario({
    game:'blocktopia',
    factionPayload:{ok:true,skipped:true,reason:'schema_unavailable'},
    blockPayload:{ok:true,progression:{xp:0},xp_awarded:0},
  });
  assert.ok(zeroXpBlock.some(item=>item.source==='arcade_progression'),
    'explicit ok:true zero-XP settlement is still confirmed and must reconcile');
});


test('PR5 shell buffers accepted write while deferred action-sync script is loading and replays it cross-tab', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let releaseSyncScript = null;
  await context.route('https://cryptomoonboys.com/shell-buffer-test*', route =>
    route.fulfill({contentType:'text/html',
      body:'<!doctype html><html><head></head><body><div id="layout"><main id="content"></main></div></body></html>'}));
  await context.route('https://cryptomoonboys.com/js/player-action-sync.js', route =>
    new Promise(resolve => {
      releaseSyncScript = async () => {
        await route.fulfill({contentType:'application/javascript',body:SYNC});
        resolve();
      };
    }));

  const source = await context.newPage();
  const remote = await context.newPage();
  try {
    await Promise.all([
      source.goto('https://cryptomoonboys.com/shell-buffer-test?source'),
      remote.goto('https://cryptomoonboys.com/shell-buffer-test?remote'),
    ]);
    for (const page of [source,remote]) {
      await page.evaluate(() => {
        window.__accepted=[];
        window.addEventListener('moonboys:player-action-accepted',event=>window.__accepted.push(event.detail));
      });
    }
    await remote.addScriptTag({content:SYNC});
    await source.addScriptTag({content:SITE_SHELL});

    for (let i=0;i<100 && !releaseSyncScript;i++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(releaseSyncScript,'site shell must start deferred action-sync request immediately');

    const buffered = await source.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonboys:server-action-accepted',{
        detail:{
          source:'faction',
          route:'/private/route',
          telegram_id:'secret-owner',
          pet_id:'secret-pet',
          reward:{xp:999},
        },
      }));
      return window.__MOONBOYS_ACTION_SYNC_BUFFER__?.events?.map(item=>({...item})) || [];
    });
    assert.deepEqual(buffered,[{source:'faction',event:'moonboys:server-action-accepted'}],
      'pre-bus capture stores only sanitized source/event metadata');
    assert.doesNotMatch(JSON.stringify(buffered),/secret|telegram|pet_id|reward|route/u);
    assert.equal(await remote.evaluate(()=>window.__accepted.length),0,
      'remote tab cannot receive event before deferred bus actually loads');

    await releaseSyncScript();
    await source.waitForFunction(()=>Boolean(window.MOONBOYS_ACTION_SYNC));
    await remote.waitForFunction(()=>window.__accepted.some(item=>
      item.source==='faction' && item.event==='moonboys:server-action-accepted'
    ),null,{timeout:5000});
    assert.equal(await source.evaluate(()=>Boolean(window.__MOONBOYS_ACTION_SYNC_BUFFER__)),false,
      'temporary buffer is removed after bus drains it');
    const replayed=await remote.evaluate(()=>window.__accepted.filter(item=>
      item.source==='faction' && item.event==='moonboys:server-action-accepted'
    ));
    assert.equal(replayed.length,1,'buffered accepted write is replayed exactly once across tabs');
  } finally {
    await browser.close();
  }
});

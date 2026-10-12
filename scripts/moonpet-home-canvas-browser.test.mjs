import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { fixture, hooks, currentSeason } from './moonpet-audit-regression-fixture.mjs';

const root = process.cwd();
const before = process.env.HOUSE_EVIDENCE_PHASE === 'before';
const evidence = path.join(root, 'output/moonpet-home-e1', before ? 'before' : 'after');
await fs.mkdir(evidence, { recursive: true });
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg' };
const server = http.createServer(async (req, res) => {
  try {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('invalid path');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}) });
try {
  for (const width of [360, 390, 1280]) {
    const f = fixture('home-e1-' + width);
    const young = 'current-' + f.owner, egg = 'egg-' + f.owner;
    f.pet(egg, currentSeason, 0, 2);
    f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg',incubation_json='{\"progress\":0,\"target\":12,\"signals\":{}}' WHERE pet_id=?").run(egg);
    f.sql.prepare("UPDATE telegram_pet_instances SET stage='egg' WHERE pet_id=?").run(egg);
    // Original server-authoritative action seeds representative existing saved choices.
    for (const [slot, item] of [['wall','night_wall'],['floor','checkerboard'],['furniture','record_deck']]) {
      assert.equal((await f.act({action:'house_place',slot_key:slot,item_key:item})).accepted, true);
    }
    f.active(egg);
    for (const [slot, item] of [['wall','night_wall'],['floor','steel'],['furniture','plant_pot']]) {
      assert.equal((await f.act({action:'house_place',slot_key:slot,item_key:item})).accepted, true);
    }
    f.active(young);
    const context = await browser.newContext({viewport:{width,height:width < 500 ? 844 : 900}, reducedMotion:'reduce'});
    await context.addInitScript(base => { window.MOONBOYS_API={BASE_URL:base}; localStorage.setItem('moonpet-radio-preference','off'); }, origin);
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (before && process.env.HOUSE_BASE_CLIENT && url.pathname === '/js/moonpet-mini-app.js') return route.fulfill({contentType:'application/javascript',body:await fs.readFile(process.env.HOUSE_BASE_CLIENT,'utf8')});
      if (url.hostname === 'telegram.org') return route.fulfill({contentType:'application/javascript',body:"window.Telegram={WebApp:{initData:'fixture',ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){}}};"});
      if (url.pathname.endsWith('/telegram-pets/app/performance')) return route.fulfill({json:{ok:true}});
      if (url.pathname.includes('/telegram-pets/app/')) {
        const body = route.request().postDataJSON(); requests.push({path:url.pathname,body});
        const result = url.pathname.endsWith('/action') ? await f.act(body) : undefined;
        const state = body.mode === 'core' ? await hooks.buildPetMiniAppCoreState(f.db,f.owner)
          : body.mode === 'live' ? await hooks.buildPetMiniAppLiveState(f.db,f.owner)
          : await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{mode:body.state_mode || body.mode});
        return route.fulfill({status:result?.accepted === false ? 409 : 200,json:{state,result}});
      }
      return url.origin === origin ? route.continue() : route.abort();
    });
    async function ready() {
      await page.waitForFunction(() => window.MoonpetBetaAppearance?.isBotArtReady());
      await page.locator('#boot-layer.is-hidden').waitFor({state:'attached'});
    }
    async function room(wall, floor, furniture) {
      if (before) return;
      await page.waitForFunction(expected => {
        const house=window.MoonpetBetaAppearance.getBackgroundArtState().home;
        return house && house.wall===expected[0] && house.floor===expected[1] && house.furniture===expected[2];
      }, [wall,floor,furniture]);
    }
    await page.goto(origin + '/moonpet-game.html'); await ready();
    await room('night_wall','checkerboard','record_deck');
    await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().mode === 'bitty_background');
    await page.locator('.viewport').screenshot({path:path.join(evidence,'hatched-'+width+'.png')});
    if (!before) {
      assert.equal(await page.locator('canvas').count(),1);
      assert.equal(await page.locator('.pet-house-room').count(),0);
      const coreRequests=requests.filter(r=>r.path.endsWith('/state'));
      assert.equal(coreRequests[0].body.mode,'core');
      assert.equal(coreRequests.filter(r=>r.body.mode==='profile').length,0,'Home restores its layout without requesting the Profile module');
      const pixels = await page.locator('#moonpet-canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(2,410,1,1).data));
      await page.getByRole('button',{name:/CUSTOMIZE HOME/}).click();
      const panel=page.locator('[data-panel="pet-house"]');
      await panel.waitFor();
      if (!await panel.evaluate(node=>node.open)) await panel.locator('summary').click();
      assert.match(await panel.innerText(),/HOME CUSTOMIZATION/);
      const count=requests.length;
      const wallet=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
      const inventory=f.sql.prepare('SELECT * FROM telegram_pet_inventory WHERE telegram_id=? ORDER BY asset_type,asset_key').all(f.owner);
      for (const [slot,item,label] of [['wall','studio_white','Studio White'],['floor','steel','Steel'],['furniture','plant_pot','Plant Pot']]) {
        const previous=await page.locator('#moonpet-canvas').evaluate(c=>c.toDataURL());
        const response=page.waitForResponse(r=>r.url().endsWith('/action') && r.request().postDataJSON()?.action==='house_place');
        await panel.locator('[data-action="house_place"]').filter({hasText:'SET '+label}).click();
        assert.equal((await (await response).json()).result.accepted,true);
        await panel.locator('[data-action="house_place"]:disabled').filter({hasText:'ACTIVE: '+label}).waitFor();
        await page.waitForFunction(({slot,item})=>window.MoonpetBetaAppearance.getBackgroundArtState().home?.[slot]===item,{slot,item});
        assert.notEqual(await page.locator('#moonpet-canvas').evaluate(c=>c.toDataURL()),previous,slot+' changes main canvas pixels');
      }
      assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner),wallet);
      assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_inventory WHERE telegram_id=? ORDER BY asset_type,asset_key').all(f.owner),inventory);
      assert.equal(requests.slice(count).filter(r=>r.body.action==='house_place').length,3);
      assert.ok(requests.slice(count).filter(r=>r.path.endsWith('/action')).every(r=>['house_place','guidance_ack'].includes(r.body.action)),'saving decoration introduces no extra gameplay actions');
      await panel.getByRole('button',{name:/BACK TO HOME/}).click();
      await room('studio_white','steel','plant_pot');
      const changed=await page.locator('#moonpet-canvas').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(2,410,1,1).data));
      assert.notDeepEqual(changed,pixels,'saved floor visibly changes the actual canvas');
      assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBotArtState().lastRender.drew),true,'existing pet renderer still draws above Home');
      await page.reload(); await ready(); await room('studio_white','steel','plant_pot');
      // Switch restores each original pet's own Home without extra room fetches.
      const switchResponse=page.waitForResponse(r=>r.url().endsWith('/action') && r.request().postDataJSON()?.action==='switch_pet_slot');
      await page.locator('[data-action="switch_pet_slot"]:enabled').first().click();
      assert.equal((await (await switchResponse).json()).state.pet.pet_id,egg);
      await room('night_wall','steel','plant_pot');
    } else { f.active(egg); await page.reload(); await ready(); }
    // Both lifecycle phases use the same canvas and real art loader.
    if (!before) {
      await page.waitForFunction(() => window.MoonpetBetaAppearance.getBackgroundArtState().mode === 'stage0_secret_bot');
    }
    await page.locator('.viewport').screenshot({path:path.join(evidence,'egg-'+width+'.png')});
    assert.deepEqual(errors,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1),'viewport fits '+width+'px');
    await context.close(); f.sql.close();
    console.log('Home canvas verified at '+width+'px'+(before?' (before evidence)':''));
  }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }

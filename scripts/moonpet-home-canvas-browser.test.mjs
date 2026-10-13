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
  for (const viewport of [
    { width:360, height:640 },
    { width:390, height:844 },
    { width:1280, height:900 },
    { width:720, height:621 },
    { width:720, height:640, telegramHeight:500 },
    { width:720, height:400 },
  ]) {
    const { width, height, telegramHeight = 0 } = viewport;
    const f = fixture('home-e1-' + width + 'x' + height + (telegramHeight ? '-tg' + telegramHeight : ''));
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
    const context = await browser.newContext({viewport:{width,height}, reducedMotion:'reduce'});
    await context.addInitScript(base => { window.MOONBOYS_API={BASE_URL:base}; localStorage.setItem('moonpet-radio-preference','off'); }, origin);
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (before && process.env.HOUSE_BASE_CLIENT && url.pathname === '/js/moonpet-mini-app.js') return route.fulfill({contentType:'application/javascript',body:await fs.readFile(process.env.HOUSE_BASE_CLIENT,'utf8')});
      if (url.hostname === 'telegram.org') return route.fulfill({contentType:'application/javascript',body:`window.Telegram={WebApp:{initData:'fixture',viewportHeight:${telegramHeight || 0},viewportStableHeight:${telegramHeight || 0},ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){}}};`});
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
      const petCanvas=await page.locator('#moonpet-canvas').boundingBox();
      const petRequests=requests.filter(r=>r.path.endsWith('/action')).length;
      await page.locator('#moonpet-canvas').click({position:{x:160/320*petCanvas.width,y:140/220*petCanvas.height}});
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBotArtState()?.lastRender?.animationMode==='greet');
      assert.equal(requests.filter(r=>r.path.endsWith('/action')).length,petRequests,'pet tap remains local');
      // E2: a paid item is purchased once, then drawn on this same canvas.
      await page.getByRole('button',{name:/CUSTOMIZE HOME/}).click();
      const furniturePanel=page.locator('[data-panel="furniture-shop"]');
      await furniturePanel.waitFor();
      if (!await furniturePanel.evaluate(node=>node.open)) await furniturePanel.locator('summary').click();
      const beforePurchase=f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold;
      const buyResponse=page.waitForResponse(r=>r.url().endsWith('/action') && r.request().postDataJSON()?.action==='furniture_buy');
      await furniturePanel.locator('[data-action="furniture_buy"]').filter({hasText:'BUY Neon Lamp'}).click();
      assert.equal((await (await buyResponse).json()).result.accepted,true);
      assert.equal(f.sql.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner).moon_gold,beforePurchase-120);
      const placeResponse=page.waitForResponse(r=>r.url().endsWith('/action') && r.request().postDataJSON()?.action==='furniture_place');
      await furniturePanel.locator('[data-action="furniture_place"]').filter({hasText:'PLACE Neon Lamp'}).click();
      assert.equal((await (await placeResponse).json()).result.accepted,true);
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home?.purchased?.left==='neon_lamp');
      // E2 RIGHT slot must temporarily replace the saved E1 furnishing on the
      // *same* main canvas, then restore it without changing the E1 D1 row.
      const rightPixel = () => page.locator('#moonpet-canvas').evaluate(canvas =>
        Array.from(canvas.getContext('2d').getImageData(560, 414, 1, 1).data));
      const originalRightPixel = await rightPixel();
      const savedFreeFurnishing = f.sql.prepare(
        "SELECT item_key FROM telegram_pet_house_layouts WHERE pet_id=? AND slot_key='furniture'"
      ).get(young).item_key;
      assert.equal(savedFreeFurnishing, 'plant_pot');
      const rightBuy = page.waitForResponse(r => r.url().endsWith('/action') &&
        r.request().postDataJSON()?.action === 'furniture_buy' &&
        r.request().postDataJSON()?.item_key === 'retro_tv');
      await furniturePanel.locator('[data-action="furniture_buy"][data-payload*="retro_tv"]').click();
      assert.equal((await (await rightBuy).json()).result.accepted, true);
      const rightPlace = page.waitForResponse(r => r.url().endsWith('/action') &&
        r.request().postDataJSON()?.action === 'furniture_place' &&
        r.request().postDataJSON()?.item_key === 'retro_tv');
      await furniturePanel.locator('[data-action="furniture_place"][data-payload*="retro_tv"]').click();
      assert.equal((await (await rightPlace).json()).result.accepted, true);
      await page.waitForFunction(() =>
        window.MoonpetBetaAppearance.getBackgroundArtState().home?.purchased?.right === 'retro_tv');
      assert.notDeepEqual(await rightPixel(), originalRightPixel,
        'paid RIGHT furniture must visually replace the original E1 furnishing');
      assert.equal(f.sql.prepare(
        "SELECT item_key FROM telegram_pet_house_layouts WHERE pet_id=? AND slot_key='furniture'"
      ).get(young).item_key, savedFreeFurnishing, 'placing paid furniture must not overwrite E1 selection');
      const removeRight = page.waitForResponse(r => r.url().endsWith('/action') &&
        r.request().postDataJSON()?.action === 'furniture_remove' &&
        r.request().postDataJSON()?.slot_key === 'right');
      await furniturePanel.locator('[data-action="furniture_remove"]').filter({hasText:'REMOVE RIGHT FURNITURE'}).click();
      assert.equal((await (await removeRight).json()).result.accepted, true);
      await page.waitForFunction(() =>
        window.MoonpetBetaAppearance.getBackgroundArtState().home?.purchased?.right === null);
      assert.deepEqual(await rightPixel(), originalRightPixel,
        'removing paid RIGHT furniture restores the original E1 furnishing pixels');
      assert.equal(f.sql.prepare(
        "SELECT item_key FROM telegram_pet_house_layouts WHERE pet_id=? AND slot_key='furniture'"
      ).get(young).item_key, savedFreeFurnishing, 'E1 selection remains saved after removal');
      assert.equal(f.sql.prepare(
        "SELECT COUNT(*) AS total FROM telegram_pet_furniture_unlocks WHERE telegram_id=? AND item_key='retro_tv'"
      ).get(f.owner).total, 1, 'removal must retain purchased furniture ownership');
      assert.equal(await page.locator('canvas').count(),1);
      assert.equal(await page.locator('.pet-house-room').count(),0);
      await page.reload(); await ready(); await room('studio_white','steel','plant_pot');
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home?.purchased?.left==='neon_lamp');
      // E4: one canvas, four switchable Home rooms. Room changes are local UI only.
      await page.waitForFunction(() => {
        const home = window.MoonpetBetaAppearance.getBackgroundArtState().home;
        return home?.active_room === 'main' && (home.rooms || []).join(',') === 'main,kitchen,garden,gym';
      });
      const roomButtons = page.locator('#home-room-switcher [data-home-room]');
      assert.equal(await roomButtons.count(), 4);
      const icons=await page.locator('.canvas-controls button').evaluateAll(nodes=>nodes.map(node=>{
        const r=node.getBoundingClientRect();return {text:node.textContent.trim(),label:node.getAttribute('aria-label'),
          x:r.x,y:r.y,w:r.width,h:r.height};
      }));
      assert.equal(icons.length,7);
      assert.ok(icons.every(icon=>icon.label && !/[A-Z]/.test(icon.text) && icon.w===44 && icon.h===44));
      assert.ok(icons.slice(3).every(icon=>icon.y>=icons[2].y+icons[2].h), 'room icons sit below utilities');
      const scene=await page.locator('.viewport').boundingBox();
      assert.ok(icons.every(icon=>icon.x>=scene.x && icon.x+icon.w<=scene.x+scene.width+1), 'toolbar stays within scene width');
      for(const button of await page.locator('.canvas-controls button').all()) {
        await button.evaluate(node=>node.scrollIntoView({block:'nearest'}));
        const box=await button.boundingBox();
        assert.ok(box.y>=scene.y && box.y+box.height<=scene.y+scene.height+1, 'every icon is reachable in short toolbar');
      }
      const hud=await page.locator('#hud').boundingBox();
      assert.ok(icons.every(icon=>icon.x>=hud.x+hud.width || icon.y>=hud.y+hud.height), 'icons leave the HUD clear');

      const roomActionRequests = requests.filter(r=>r.path.endsWith('/action')).length;
      const roomSignatures = {};
      for (const [roomKey,panelId] of [['kitchen','kitchen'],['gym','gym'],['garden','garden'],['main','main-room']]) {
        await page.locator('#home-room-switcher [data-home-room="'+roomKey+'"]').click();
        await page.waitForFunction(key => window.MoonpetBetaAppearance.getBackgroundArtState().home?.active_room === key, roomKey);
        await page.locator('[data-panel="'+panelId+'"]').waitFor();
        roomSignatures[roomKey] = await page.locator('#moonpet-canvas').evaluate(c=>c.toDataURL());
      }
      assert.notEqual(roomSignatures.main, roomSignatures.kitchen);
      assert.notEqual(roomSignatures.main, roomSignatures.garden);
      assert.notEqual(roomSignatures.main, roomSignatures.gym);
      assert.notEqual(roomSignatures.kitchen, roomSignatures.garden);
      assert.equal(requests.filter(r=>r.path.endsWith('/action')).length,roomActionRequests,
        'switching Home rooms must not send gameplay actions');
      await page.locator('#home-room-switcher [data-home-room="kitchen"]').click();
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home?.active_room==='kitchen');
      assert.equal(await page.locator('[data-panel="kitchen"] [data-action="craft"]').count(), 3,
        'Kitchen exposes only the three existing cooked-meal recipes');
      await page.locator('#home-room-switcher [data-home-room="gym"]').click();
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home?.active_room==='gym');
      assert.equal(await page.locator('[data-panel="gym"] [data-action="train"]').count(), 1);
      assert.equal(await page.locator('[data-panel="gym"] [data-action="activity_start"][data-payload*="train"]').count(), 1);
      await page.locator('#home-room-switcher [data-home-room="garden"]').click();
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home?.active_room==='garden');

      const canvasBox = await page.locator('#moonpet-canvas').boundingBox();
      assert.ok(canvasBox);
      assert.ok(Math.abs(canvasBox.width / canvasBox.height - 16 / 11) < 0.01,
        'displayed MoonPet canvas preserves native 16:11 ratio at '+width+'px viewport');
      const viewportBox = await page.locator('.viewport').boundingBox();
      assert.ok(viewportBox && Math.abs(viewportBox.width / viewportBox.height - 16 / 11) < 0.01,
        'canvas viewport cannot stretch the 320x220 world');
      const screenBox = await page.locator('#screen').boundingBox();
      assert.ok(screenBox && screenBox.height >= 80,
        'scrollable controls retain usable height at '+width+'x'+height);
      const shellBox = await page.locator('#moonpet-app').boundingBox();
      assert.ok(Math.abs(shellBox.height - (telegramHeight || height)) <= 2);
      assert.ok(Math.abs(screenBox.y + screenBox.height - shellBox.y - shellBox.height) <= 2,
        'options now use the area formerly reserved for the fixed menu');
      for (const screenKey of ['home','missions','explore','work','economy','profile']) {
        await page.locator('#screen').evaluate(node => { node.scrollTop = node.scrollHeight; });
        const flow = await page.locator('#nav').evaluate(node => ({
          parent: node.parentElement.id, last: node === node.parentElement.lastElementChild,
          position: getComputedStyle(node).position,
          fits: node.getBoundingClientRect().bottom <= node.parentElement.getBoundingClientRect().bottom + 1,
          buttons: node.querySelectorAll('button[data-screen]').length
        }));
        assert.equal(flow.parent, 'screen'); assert.equal(flow.last, true);
        assert.equal(flow.position, 'relative'); assert.equal(flow.fits, true); assert.equal(flow.buttons, 6);
        await page.locator('[data-screen="'+screenKey+'"]').click();
        await page.waitForFunction(key => document.querySelector('#nav [aria-current="page"]').dataset.screen === key, screenKey);
        assert.equal(await page.locator('#screen').evaluate(node=>node.scrollTop), 0, 'new section starts with its options');
      }
      await page.locator('[data-screen="home"]').click();
      await page.locator('#home-room-switcher [data-home-room="garden"]').click();
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home?.active_room==='garden');
      const gardenPanel = page.locator('[data-panel="garden"]');
      if (!await gardenPanel.evaluate(node => node.open)) await gardenPanel.locator('summary').click();
      const plantResponse = page.waitForResponse(r => r.url().endsWith('/action') &&
        r.request().postDataJSON()?.action === 'garden_plant');
      await gardenPanel.locator('[data-action="garden_plant"]').click();
      assert.equal((await (await plantResponse).json()).result.accepted, true);
      assert.equal(f.sql.prepare('SELECT COUNT(*) AS total FROM telegram_pet_garden_plots WHERE pet_id=?').get(young).total, 1);
      await gardenPanel.getByText(/CROP GROWING/).waitFor();

      f.sql.prepare("UPDATE telegram_pet_garden_plots SET planted_at='1999-12-31T18:00:00.000Z', ready_at='2000-01-01T00:00:00.000Z' WHERE pet_id=?").run(young);
      const refreshResponse = page.waitForResponse(r => r.url().endsWith('/state'));
      await page.locator('[data-utility="sync"]').click();
      await refreshResponse;
      await page.locator('[data-panel="garden"] [data-action="garden_harvest"]').waitFor();
      const harvestResponse = page.waitForResponse(r => r.url().endsWith('/action') &&
        r.request().postDataJSON()?.action === 'garden_harvest');
      await page.locator('[data-panel="garden"] [data-action="garden_harvest"]').click();
      assert.equal((await (await harvestResponse).json()).result.accepted, true);
      assert.equal(f.sql.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key='garden_veggies'").get(f.owner).quantity, 1);
      assert.equal(await page.locator('canvas').count(), 1, 'E4 rooms must reuse the one MoonPet canvas');

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
    console.log('Home canvas verified at '+width+'x'+height+(telegramHeight ? ' / Telegram '+telegramHeight : '')+(before?' (before evidence)':''));
  }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }

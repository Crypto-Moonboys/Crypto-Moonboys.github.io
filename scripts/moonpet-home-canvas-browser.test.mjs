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
    for (const [slot, item] of [['wall','night_wall'],['furniture','record_deck']]) {
      assert.equal((await f.act({action:'house_place',slot_key:slot,item_key:item})).accepted, true);
    }
    f.active(egg);
    for (const [slot, item] of [['wall','night_wall'],['floor','steel'],['furniture','plant_pot']]) {
      assert.equal((await f.act({action:'house_place',slot_key:slot,item_key:item})).accepted, true);
    }
    f.active(young);
    const context = await browser.newContext({viewport:{width,height}, reducedMotion:'reduce'});
    await context.addInitScript(base => { HTMLMediaElement.prototype.play=function(){return Promise.resolve();}; HTMLMediaElement.prototype.pause=function(){}; window.MOONBOYS_API={BASE_URL:base}; localStorage.setItem('moonpet-radio-preference','off'); }, origin);
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
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().guardian?.source==='/img/pepe-pepeb0y.png');
    }
    await page.goto(origin+'/moonpet-game.html');await ready();
    async function settings(){
      await page.locator('#nav [data-screen="profile"]').click();
      const panel=page.locator('[data-panel="pet-house"]');await panel.waitFor();
      if(!await panel.evaluate(node=>node.open))await panel.locator('summary').click();
      return panel;
    }
    async function action(locator){
      const response=page.waitForResponse(r=>r.url().endsWith('/action')&&r.request().postDataJSON()?.action==='furniture_arrange');
      await locator.click();assert.equal((await (await response).json()).result.accepted,true);
    }
    async function chooseRoom(key){
      const panel=await settings(),label={main:'RETURN TO MAIN ROOM',kitchen:'Kitchen',garden:'Garden',gym:'Gym'}[key];
      const target=panel.locator('[data-action="house_place"]').filter({hasText:label});
      if(!await target.isDisabled()){
        const response=page.waitForResponse(r=>r.url().endsWith('/action')&&r.request().postDataJSON()?.slot_key==='room');
        await target.click();assert.equal((await (await response).json()).result.accepted,true);
      }
      await page.waitForFunction(key=>{const art=window.MoonpetBetaAppearance.getBackgroundArtState();return art.home?.active_room===key&&art.guardian?.source==='/img/pepe-pepeb0y.png';},key);
    }
    const balance=f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
    const initialLegacy=f.sql.prepare('SELECT * FROM telegram_pet_house_layouts WHERE pet_id=? ORDER BY slot_key').all(young);
    assert.equal(await page.locator('canvas').count(),1);
    assert.equal(await page.locator('[data-guardian], [data-action*=guardian]').count(),0,'guardian has no selection control');
    assert.equal(await page.locator('.canvas-controls button').count(),3);
    let panel=await settings();assert.doesNotMatch(await panel.innerText(),/Sleep Mat|Record Deck/);
    // The prior saved Record Deck appears as Lava Lamp; adding the other free
    // items must retain it, not replace it.
    await action(panel.getByRole('button',{name:'ADD Fish Tank',exact:false}).first());
    panel=await settings();await action(panel.getByRole('button',{name:'ADD Plant Pot',exact:false}).first());
    await page.waitForFunction(()=>{const art=window.MoonpetBetaAppearance.getBackgroundArtState();return art.lamp&&art.tank&&art.home.items.length===3;});
    assert.deepEqual(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home.items.map(i=>i.key)),['record_deck','sleep_mat','plant_pot']);
    await page.locator('.viewport').screenshot({path:path.join(evidence,'room-items-'+width+'x'+height+'.png')});
    panel=await settings();await action(panel.getByRole('button',{name:'LEFT Lava Lamp',exact:true}));
    await page.reload();await ready();
    assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home.items.find(i=>i.key==='record_deck').x),274);
    panel=await settings();await action(panel.getByRole('button',{name:'IN FRONT: Lava Lamp',exact:true}));
    await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home.items.at(-1).key==='record_deck');
    await page.locator('[data-utility="radio"]').click();
    await page.waitForFunction(()=>{const art=window.MoonpetBetaAppearance.getBackgroundArtState();return art.stereo&&art.disco&&art.tank&&art.lamp&&art.home.items.length===3;});
    await page.locator('[data-utility="radio"]').click();
    await page.waitForFunction(()=>{const art=window.MoonpetBetaAppearance.getBackgroundArtState();return !art.stereo&&!art.disco&&art.tank&&art.lamp;});
    const paid=['neon_lamp','speaker_stack','arcade_cabinet','tool_chest','street_sofa','retro_tv'];
    for(const key of paid)f.sql.prepare('INSERT INTO telegram_pet_furniture_unlocks(telegram_id,item_key,price_gold,purchase_event_key) VALUES (?,?,120,?)').run(f.owner,key,key);
    await page.locator('[data-utility="sync"]').click();
    for(const label of ['Neon Lamp','Speaker Stack','Arcade Cabinet','Graffiti Tool Chest','Street Sofa']){
      await settings();const shop=page.locator('[data-panel="furniture-shop"]');
      if(!await shop.evaluate(node=>node.open))await shop.locator('summary').click();
      await action(shop.getByRole('button',{name:'ADD '+label,exact:false}));
    }
    await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home.items.length===8);
    await settings();const shop=page.locator('[data-panel="furniture-shop"]');
    if(!await shop.evaluate(node=>node.open))await shop.locator('summary').click();
    assert.equal(await shop.getByRole('button',{name:/ADD Retro Television/}).isDisabled(),true,'ninth item cannot be added');
    assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().tank!==null),true,'paid LEFT furniture does not hide free tank');
    for(const room of ['kitchen','garden','gym']){
      await chooseRoom(room);
      await page.waitForFunction(key=>window.MoonpetBetaAppearance.getBackgroundArtState().mode===key+'_background',room);
      panel=await settings();assert.equal(await panel.getByRole('button',{name:/ADD Fish Tank|ADD Plant Pot|ADD Lava Lamp/}).count(),0);
      assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home.items.some(i=>['sleep_mat','record_deck','plant_pot'].includes(i.key))),false);
      const paidPanel=page.locator('[data-panel="furniture-shop"]');if(!await paidPanel.evaluate(node=>node.open))await paidPanel.locator('summary').click();
      await action(paidPanel.getByRole('button',{name:/ADD Neon Lamp/}));
      panel=await settings();const floor=panel.locator('[data-action="house_place"]').filter({hasText:'CAMO MATT'});
      if(!await floor.isDisabled()){
        const response=page.waitForResponse(r=>r.url().endsWith('/action')&&r.request().postDataJSON()?.slot_key==='floor');await floor.click();assert.equal((await (await response).json()).result.accepted,true);
      }
      await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().matt==='/img/camomatt.png');
      await page.reload();await ready();
      await page.waitForFunction(key=>{const art=window.MoonpetBetaAppearance.getBackgroundArtState();return art.home?.active_room===key&&art.home.items.length===1&&art.home.items[0].key==='neon_lamp'&&art.mode===key+'_background'&&art.matt==='/img/camomatt.png';},room);
      assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().tank),null);
      assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().lamp),null);
    }
    await chooseRoom('main');await page.reload();await ready();
    await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home.items.length===8);
    await page.locator('.viewport').screenshot({path:path.join(evidence,'guardian-pet-'+width+'x'+height+'.png')});
    assert.deepEqual(f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner),balance);
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_house_layouts WHERE pet_id=? AND slot_key<>\'floor\' ORDER BY slot_key').all(young),initialLegacy.filter(row=>row.slot_key!=='floor'));
    const canvasBox=await page.locator('#moonpet-canvas').boundingBox();assert.ok(Math.abs(canvasBox.width/canvasBox.height-16/11)<0.01);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    // Section menu remains in flow and does not obstruct the room.
    for(const key of ['home','missions','explore','work','economy','profile']){
      await page.locator('#screen').evaluate(node=>node.scrollTop=node.scrollHeight);
      await page.locator('#nav [data-screen="'+key+'"]').click();
      assert.equal(await page.locator('#screen').evaluate(node=>node.scrollTop),0);
    }
    f.active(egg);await page.reload();await ready();
    await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().mode==='stage0_secret_bot');
    assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().home.items.some(i=>i.key==='record_deck')),false,'other pet retains its own selection');
    assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().guardian?.frame),0,'guardian remains beside egg with reduced motion');
    await page.locator('.viewport').screenshot({path:path.join(evidence,'guardian-egg-'+width+'x'+height+'.png')});
    assert.deepEqual(errors,[]);
    console.log('Home room arrangements verified at '+width+'x'+height+(telegramHeight?' / Telegram '+telegramHeight:''));
    await context.close();f.sql.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

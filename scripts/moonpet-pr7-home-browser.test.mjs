import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHmac, createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';

const root=process.cwd(), clientRoot=process.env.MOONPET_PR7_CLIENT_ROOT || root;
const benchmark=process.argv.includes('--benchmark');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer(async(req,res)=>{
  try {
    const target=path.resolve(clientRoot,'.'+decodeURIComponent(new URL(req.url,'http://fixture').pathname));
    if(!target.startsWith(path.resolve(clientRoot)+path.sep))throw Error('outside fixture');
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'};
    res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(await fs.readFile(target));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const launch={headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']};
if(process.env.CHROMIUM_EXECUTABLE_PATH)launch.executablePath=process.env.CHROMIUM_EXECUTABLE_PATH;
const browser=await chromium.launch(launch), results=[];
let account=980400;
async function setup({pets=1,recovery=false,website=false,delayMs=0,clock=false,blockAllFull=false,telegramDelay=0,websiteDelay=0,viewport={width:360,height:640}}={}){
  const f=await performanceFixture({pets,delayMs,owner:String(++account)});
  if(recovery)seedRecoveryEvidence(f);
  const token='123456:pr7-local-fixture';
  const fields=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(f.owner),first_name:'Fixture'})});
  const check=[...fields].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  fields.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));
  const auth={id:Number(f.owner),first_name:'Fixture',auth_date:Math.floor(Date.now()/1000)};
  const loginCheck=Object.entries(auth).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');

  auth.hash=createHmac('sha256',createHash('sha256').update(token).digest()).update(loginCheck).digest('hex');
  const context=await browser.newContext({viewport,reducedMotion:'no-preference'}),page=await context.newPage();
  if(clock)await page.clock.install();
  const errors=[],requests=[],inFlight=new Set();let blockFull=false,releaseFull,fullStarted,firstFull=true,failFull=false,invalid=false,fullValue=null;
  let fullGate=new Promise(resolve=>releaseFull=resolve),started=new Promise(resolve=>fullStarted=resolve);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(base=>{window.MOONBOYS_API={BASE_URL:base};localStorage.setItem('moonpet-radio-preference','off');},origin);
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='telegram.org')return route.fulfill({contentType:'text/javascript',body:'window.Telegram={WebApp:{initData:'+JSON.stringify(website||telegramDelay?'':fields.toString())+',platform:'+JSON.stringify(telegramDelay?'android':'unknown')+',ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){}}};'+(telegramDelay?'setTimeout(()=>{window.Telegram.WebApp.initData='+JSON.stringify(fields.toString())+';},'+telegramDelay+');':'' )});
    if(website&&url.pathname==='/js/identity-gate.js')return route.fulfill({contentType:'text/javascript',body:'window.fixtureAuth='+JSON.stringify(auth)+';window.fixtureWebsiteRestored=false;window.MOONBOYS_IDENTITY={restoreLinkedTelegramAuth:async()=>{await new Promise(resolve=>setTimeout(resolve,'+websiteDelay+'));window.fixtureWebsiteRestored=true;return {ok:true,telegram_auth:window.fixtureAuth};},getFreshTelegramAuth:async()=>window.fixtureAuth,getTelegramAuth:()=>window.fixtureAuth};'});
    if(url.pathname.startsWith('/telegram-pets/app/')){
      const body=req.postDataJSON();requests.push({path:url.pathname,body});
      if(url.pathname.endsWith('/performance'))return route.fulfill({json:{ok:true}});
      const isFull=url.pathname.endsWith('/state')&&!body.mode;
      if(isFull&&failFull)return route.fulfill({status:503,json:{error:'mini_app_state_failed'}});
      if(invalid)return route.fulfill({status:401,json:{error:'invalid_init_data'}});
      let finish;const pending=new Promise(resolve=>{finish=resolve;});inFlight.add(pending);
      try {
      await pause(benchmark?100:20);
      const response=await f.worker.fetch(new Request(origin+url.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB:f.db,TELEGRAM_BOT_TOKEN:token});
      const json=await response.json();
      if(isFull){const first=firstFull;if(first){firstFull=false;fullValue=json;fullStarted();}if(blockFull&&(first||blockAllFull))await fullGate;}
      await route.fulfill({status:response.status,json}).catch(()=>{});
      return;
      }finally{inFlight.delete(pending);finish();}
    }
    if(url.hostname==='127.0.0.1')return route.continue();
    return route.abort();
  });
  const open=async()=>{await page.goto(origin+'/moonpet-game.html');await page.locator('[data-panel="care"]').waitFor();await page.waitForFunction(()=>document.getElementById('boot-layer').classList.contains('is-hidden'));await page.waitForFunction(()=>window.MoonpetBetaAppearance.isBotArtReady());};
  const care=async action=>{
    // Use the player's disclosure control, and wait for its actual visible body.
    // A response event can precede JSON application and replace the old node.
    const panel=page.locator('[data-panel="care"]');
    await panel.waitFor({state:'visible'});
    if(!await panel.evaluate(n=>n.open))await panel.locator('summary').click();
    await panel.locator('[data-action="'+action+'"]').waitFor({state:'visible'});
    const accepted=page.waitForResponse(r=>r.url().endsWith('/app/action'),{timeout:10000});accepted.catch(()=>{});await page.locator('[data-panel="care"] [data-action="'+action+'"]').click();const response=await accepted;const json=await response.json();assert.equal(json.result.accepted,true);await page.waitForFunction(()=>document.getElementById('terminal-output').textContent.includes('SAVE CONFIRMED'));return json;};
  return {f,page,context,errors,requests,open,care,started,release:()=>releaseFull(),block:()=>{blockFull=true;},fail:value=>{failFull=value;},invalid:()=>{invalid=true;},full:()=>fullValue,
    switchOwner:async()=>{
      const owner='980302',pet='pr7-other-owner';
      f.sql.prepare('INSERT INTO telegram_users(telegram_id) VALUES(?)').run(owner);
      f.sql.prepare('INSERT INTO telegram_pet_profiles(telegram_id,moon_gold) VALUES(?,7)').run(owner);
      f.sql.prepare("INSERT INTO telegram_pet_season_slots(pet_id,telegram_id,season_key,slot_number,acquisition_type) VALUES(?,?,'pet-s2026-004',1,'free')").run(pet,owner);
      f.sql.prepare("INSERT INTO telegram_pet_instances(pet_id,telegram_id,season_key,slot_number,source_profile_updated_at) VALUES(?,?,'pet-s2026-004',1,'0001-01-01 00:00:00')").run(pet,owner);
      f.sql.prepare("INSERT INTO telegram_pet_active_slots(telegram_id,pet_id,season_key) VALUES(?,?,'pet-s2026-004')").run(owner,pet);
      const proof={id:Number(owner),first_name:'Other fixture',auth_date:Math.floor(Date.now()/1000)};
      proof.hash=createHmac('sha256',createHash('sha256').update(token).digest()).update(Object.entries(proof).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex');
      await page.evaluate(v=>{window.fixtureAuth=v;},proof);
    },close:async()=>{releaseFull();await context.close();await Promise.allSettled([...inFlight]);f.close();}};
}
try {
  for(const website of [false,true])for(const scenario of ['one','three','recovery']){
    if(!benchmark&&website)continue;
    const f=await setup({website,pets:scenario==='one'?1:3,recovery:scenario==='recovery',delayMs:benchmark?25:0});
    try{
      console.log('SCENARIO',website,scenario);f.block();const started=performance.now();await f.open();const usable=Math.round(performance.now()-started);
      const result=await f.care(scenario==='recovery'?'clean':'feed');assert.ok(result.result.pet.pet_xp>=0);
      const confirmed=Math.round(performance.now()-started);f.release();
      const navAt=performance.now();await f.page.locator('[data-screen="work"]').click();await f.page.locator('[data-panel="timed-activity"]').waitFor();
      const persisted={
        wallet:f.f.sql.prepare('SELECT moon_gold,moon_crystals,style_tokens,pet_xp FROM telegram_pet_profiles ORDER BY telegram_id').all(),
        pets:f.f.sql.prepare('SELECT pet_id,season_key,pet_xp,health,energy,hunger,happiness,cleanliness FROM telegram_pet_instances ORDER BY pet_id').all(),
        receipts:f.f.sql.prepare('SELECT source,status,COUNT(*) AS n FROM telegram_pet_reward_claims GROUP BY source,status ORDER BY source,status').all(),
        events:f.f.sql.prepare('SELECT event_type,status,COUNT(*) AS n,SUM(pet_xp_awarded) AS pet_xp,SUM(xp_awarded) AS xp FROM telegram_pet_events GROUP BY event_type,status ORDER BY event_type,status').all()
      };
      results.push({auth:website?'website':'telegram',scenario,progression_hash:createHash('sha256').update(JSON.stringify(persisted)).digest('hex'),verified_interactive_home_ms:usable,confirmed_care_ms:confirmed,work_ready_after_navigation_ms:Math.round(performance.now()-navAt)});
      assert.deepEqual(f.errors,[]);
    }catch(error){console.error(JSON.stringify({errors:f.errors,output:await f.page.locator('#terminal-output').textContent()}));throw error;}finally{await f.close();}
  }
  if(!benchmark)for(const viewport of [{width:360,height:640},{width:1280,height:900}]){
    const f=await setup({pets:3,viewport});
    try{
      f.block();await f.open();await f.started;
      const before=f.f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_profiles').get();
      await f.care('feed');await f.care('clean');
      const saved=f.f.sql.prepare('SELECT pet_xp,moon_gold FROM telegram_pet_profiles').get();
      assert.ok(saved.pet_xp>=before.pet_xp);
      f.release();await pause(150);
      assert.ok((await f.page.locator('#hud').textContent()).includes(saved.moon_gold.toLocaleString('en-GB')));
      assert.ok((await f.page.locator('[data-season-slot].is-active').textContent()).includes(saved.pet_xp.toLocaleString('en-GB')),'late full response cannot roll back confirmed XP');
      for(const tab of ['missions','explore','work','economy','profile','home']){
        await f.page.locator('[data-screen="'+tab+'"]').click();
        if(tab!=='home')await f.page.locator('[data-panel="module-loading"]').waitFor({state:'detached'});
      }
      assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
    const switched=await setup({pets:3,viewport});
    try{
      switched.block();await switched.open();await switched.started;
      const response=switched.page.waitForResponse(r=>r.url().endsWith('/app/action')&&r.request().postDataJSON().action==='switch_pet_slot');
      await switched.page.locator('[data-season-slot="2"] [data-action="switch_pet_slot"]').click();
      const data=await(await response).json();assert.equal(data.result.accepted,true);
      switched.release();await pause(150);
      assert.equal(switched.f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots').get().pet_id,data.state.pet.pet_id);
      assert.equal(await switched.page.locator('[data-season-slot="2"].is-active').count(),1,'old warmup cannot reselect previous pet');
      assert.deepEqual(switched.errors,[]);
    }finally{await switched.close();}
    const hidden=await setup({viewport});
    try{
      hidden.block();await hidden.open();await hidden.started;
      await hidden.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
      hidden.release();await pause(60);
      const resumed=hidden.page.waitForResponse(r=>r.url().endsWith('/app/state')&&r.request().postDataJSON().mode==='core');
      const rewarmed=hidden.page.waitForResponse(r=>r.url().endsWith('/app/state')&&!r.request().postDataJSON().mode);
      await hidden.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
      await (await resumed).finished();
      const warmed=await(await rewarmed).json();assert.equal(warmed.state.hydration.full,true,'foreground core restarts the cancelled Home warmup');
      await hidden.care('clean');assert.deepEqual(hidden.errors,[]);
    }finally{await hidden.close();}
    const hiddenModule=await setup({viewport,blockAllFull:true});
    try{
      hiddenModule.block();await hiddenModule.open();await hiddenModule.started;
      const moduleRequest=hiddenModule.page.waitForRequest(r=>r.url().endsWith('/app/state')&&!r.postDataJSON().mode);
      await hiddenModule.page.locator('[data-screen="work"]').click();await moduleRequest;
      await hiddenModule.page.locator('[data-panel="module-loading"]').waitFor();
      await hiddenModule.page.evaluate(()=>{
        window.hiddenModuleMutations=0;
        window.hiddenModuleObserver=new MutationObserver(records=>window.hiddenModuleMutations+=records.length);
        window.hiddenModuleObserver.observe(document.getElementById('screen'),{childList:true});
        Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
      });
      const completed=hiddenModule.page.waitForResponse(r=>r.url().endsWith('/app/state')&&!r.request().postDataJSON().mode);
      hiddenModule.release();await(await completed).finished();await pause(100);
      assert.equal(await hiddenModule.page.evaluate(()=>window.hiddenModuleMutations),0,'hidden foreground module response must not rebuild controls');
      assert.equal(await hiddenModule.page.locator('[data-panel="module-loading"]').count(),1);
      assert.equal(hiddenModule.requests.filter(r=>r.body.action==='guidance_ack').length,0,'hidden module cannot acknowledge unseen notices');
      const resumed=hiddenModule.page.waitForResponse(r=>r.url().endsWith('/app/state'));
      await hiddenModule.page.evaluate(()=>{window.hiddenModuleObserver.disconnect();Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
      await(await resumed).finished();await hiddenModule.page.locator('[data-panel="timed-activity"]').waitFor();
      assert.deepEqual(hiddenModule.errors,[]);
    }finally{await hiddenModule.close();}
    const delayedTelegram=await setup({website:true,telegramDelay:150,websiteDelay:8000,viewport});
    try{
      await delayedTelegram.open();
      const initial=delayedTelegram.requests.find(r=>r.body.mode==='core');
      assert.ok(initial.body.init_data,'a delayed native Telegram launch retains priority over website credentials');
      assert.equal(await delayedTelegram.page.evaluate(()=>window.fixtureWebsiteRestored),false,'native Home must be usable before stalled website restoration completes');
      assert.equal(initial.body.telegram_auth,undefined);assert.deepEqual(delayedTelegram.errors,[]);
    }finally{await delayedTelegram.close();}
    const changedOwner=await setup({website:true,viewport});
    try{
      changedOwner.block();await changedOwner.open();await changedOwner.started;
      await changedOwner.switchOwner();
      const response=changedOwner.page.waitForResponse(r=>r.url().endsWith('/app/state')&&r.request().postDataJSON().telegram_auth?.id===980302);
      await changedOwner.page.locator('[data-utility="sync"]').click();await response;
      await changedOwner.page.waitForFunction(()=>/GOLD\s+7(?:\D|$)/.test(document.getElementById('hud').textContent));
      changedOwner.release();await pause(150);
      assert.match(await changedOwner.page.locator('#hud').textContent(),/GOLD\s+7(?:\D|$)/);
      assert.deepEqual(changedOwner.errors,[]);
    }finally{await changedOwner.close();}
    if(viewport.width===360){
      const timed=await setup({viewport,clock:true});
      try{
        timed.block();await timed.open();await timed.started;
        await timed.page.clock.fastForward(20050);await pause(50);
        assert.equal(timed.requests.filter(r=>r.path.endsWith('/state')&&!r.body.mode).length,1,'timed-out warmup has no automatic retry storm');
        await timed.care('clean');timed.release();await pause(100);
        assert.deepEqual(timed.errors,[]);
      }finally{await timed.close();}
    }
    const failed=await setup({viewport});
    try{
      failed.fail(true);await failed.open();await pause(350);
      await failed.care('clean');
      await failed.page.locator('[data-screen="explore"]').click();
      await failed.page.locator('[data-utility="module-retry"]').waitFor();
      assert.equal(failed.requests.filter(r=>r.path.endsWith('/state')&&!r.body.mode).length,7,'one speculative attempt plus two bounded foreground attempts of three reads');
      failed.fail(false);await failed.page.locator('[data-utility="module-retry"]').click();await failed.page.locator('[data-panel="districts"]').waitFor();
      assert.deepEqual(failed.errors,[]);
    }finally{await failed.close();}
    const expired=await setup({viewport});
    try{
      await expired.open();expired.invalid();
      await expired.page.locator('[data-utility="sync"]').click();
      await expired.page.locator('[data-panel="telegram-auth"]').waitFor();
      assert.equal(await expired.page.locator('[data-action="feed"]').count(),0);
      assert.deepEqual(expired.errors,[]);
    }finally{await expired.close();}
    const invalid=await setup({viewport});
    try{invalid.invalid();await invalid.page.goto(origin+'/moonpet-game.html');await invalid.page.locator('.connection-fault').waitFor();assert.equal(await invalid.page.locator('[data-action="feed"]').count(),0);assert.deepEqual(invalid.errors,[]);}finally{await invalid.close();}
  }

  if(!benchmark){
    const idle=await setup({clock:true});
    try{
      await idle.open();await idle.started;await pause(100);
      const before=idle.requests.length;
      const saved=idle.f.sql.prepare('SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get();
      await idle.page.evaluate(()=>{
        window.hiddenScreenMutations=0;
        window.hiddenScreenObserver=new MutationObserver(records=>window.hiddenScreenMutations+=records.length);
        window.hiddenScreenObserver.observe(document.getElementById('screen'),{childList:true});
        Object.defineProperty(document,'hidden',{configurable:true,value:true});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      for(let tick=0;tick<11;tick++){await idle.page.clock.fastForward(30000);await pause(60);}
      const hiddenReads=idle.requests.slice(before).filter(r=>r.path.endsWith('/state')).length;
      const hiddenMutations=await idle.page.evaluate(()=>window.hiddenScreenMutations);
      console.log('BACKGROUND_LIFECYCLE_RESULT '+JSON.stringify({hidden_ms:330000,hiddenReads,hiddenMutations}));
      assert.equal(hiddenReads,0,'hidden Home starts no redundant state reads');
      assert.equal(hiddenMutations,0,'hidden Home is not rebuilt by its thirty-second timer');
      assert.deepEqual(idle.f.sql.prepare('SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),saved);
      const resumed=idle.page.waitForResponse(r=>r.url().endsWith('/app/state'));
      await idle.page.evaluate(()=>{window.hiddenScreenObserver.disconnect();Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
      await(await resumed).finished();await idle.care('clean');
      assert.deepEqual(idle.errors,[]);
    }finally{await idle.close();}
  }
  console.log('PR7_BROWSER_RESULT '+JSON.stringify({client:clientRoot,model:benchmark?'25ms/D1 call + 100ms/API transport, real signed Worker/SQLite':'signed local regression fixture',results}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

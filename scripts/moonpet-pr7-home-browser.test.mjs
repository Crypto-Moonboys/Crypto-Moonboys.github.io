import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMoonpetBrowserHarness} from './moonpet-browser-fixture.mjs';
const clientRoot=process.env.MOONPET_PR7_CLIENT_ROOT || process.cwd();
const benchmark=process.argv.includes('--benchmark');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const harness=await createMoonpetBrowserHarness({clientRoot,benchmark});
const {setup,origin}=harness,results=[];

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
      await hidden.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
      await (await resumed).finished();
      await hidden.care('clean');assert.deepEqual(hidden.errors,[]);
    }finally{await hidden.close();}
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
  console.log('PR7_BROWSER_RESULT '+JSON.stringify({client:clientRoot,model:benchmark?'25ms/D1 call + 100ms/API transport, real signed Worker/SQLite':'signed local regression fixture',results}));
}finally{await harness.close();}

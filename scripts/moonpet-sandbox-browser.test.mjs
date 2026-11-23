import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createMoonpetBrowserHarness} from './moonpet-browser-fixture.mjs';
import {sandboxPlayers} from './moonpet-sandbox-players.mjs';
import {getActiveSeasonalBoss} from '../workers/moonboys-api/pets/live-systems.js';
import {newFinale} from '../workers/moonboys-api/pets/completion-features.js';
import {seasonFinaleKey} from '../workers/moonboys-api/pets/completion-policy.js';
const harness=await createMoonpetBrowserHarness();
const results=[];
try{
 const savedRaid=await harness.setup({pets:2,prepare:f=>{
  const pet=f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner);
  const olderPet=f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_instances WHERE telegram_id=? AND pet_id<>?').get(f.owner,pet.pet_id);
  f.sql.prepare(`INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits,pet_id,season_key)
    VALUES (?,'2026-01-01',255,?,?)`).run(f.owner,olderPet.pet_id,olderPet.season_key);
  f.sql.prepare("INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (?,'2026-01-02',255)").run(f.owner);
  const boss=getActiveSeasonalBoss(new Date(Date.now()-8*86400000));
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(pet.pet_id);
  f.sql.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress
    (pet_id,telegram_id,pet_season_key,season_key,boss_key,damage,defeated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(pet.pet_id,f.owner,pet.season_key,boss.season_instance,boss.key,boss.hp);
 }});
 try{
  savedRaid.block();
  await savedRaid.open({waitForArt:false});
  await savedRaid.started;
  assert.deepEqual(await savedRaid.page.locator('#nav [data-screen]').evaluateAll(items=>items.map(item=>item.dataset.screen)),['home','profile']);
  assert.equal(await savedRaid.page.locator('#screen [data-jump="missions"], #screen [data-jump="explore"], #screen [data-jump="work"], #screen [data-jump="economy"]').count(),0);
  savedRaid.release();
  await savedRaid.page.locator('#nav [data-screen="explore"]').click();
  const claim=savedRaid.page.locator('[data-action="seasonal_boss_claim"]');
  await claim.waitFor({state:'attached'});
  assert.equal(await claim.isEnabled(),true);
  assert.equal(await savedRaid.page.locator('[data-screen="explore"]').getAttribute('aria-current'),'page');
  const savedPanels=await savedRaid.page.locator('#screen [data-panel]').evaluateAll(items=>items.map(item=>item.dataset.panel)
    .filter(panel=>!['recommended','reward-lifecycle','seasonal-boss'].includes(panel)));
  assert.deepEqual(savedPanels,[]);
  await savedRaid.page.locator('#nav [data-screen="missions"]').click();
  const daily=savedRaid.page.locator('[data-panel="daily-completion"]');
  await daily.locator('summary').click();
  const receipt=daily.locator('[data-action="daily_completion_claim"]');
  assert.equal(await receipt.count(),1);
  assert.equal(await receipt.isEnabled(),true);
  const payload=JSON.parse(await receipt.getAttribute('data-payload'));
  assert.equal(payload.utc_day,'2026-01-01');
  assert.equal(payload.pet_id,savedRaid.f.sql.prepare('SELECT pet_id FROM telegram_pet_daily_completion WHERE telegram_id=? AND utc_day=?').get(savedRaid.f.owner,payload.utc_day).pet_id);
  assert.equal(await savedRaid.page.locator('[data-panel="contracts"], [data-panel="season-finale"], [data-panel="missions"]').count(),0);
  assert.doesNotMatch(await daily.textContent(),/FINISH THE CHECKLIST|HATCH REQUIRED/);
  await savedRaid.page.goto(harness.origin+'/moonpet-game.html?screen=missions&focus=legendary-roadmap');
  await savedRaid.page.locator('[data-panel="incubation"][data-route-selected]').waitFor();
  assert.deepEqual(savedRaid.errors,[]);
  console.log('SANDBOX_BROWSER saved raid startup and egg Road to Legendary redirect passed');
 }finally{savedRaid.release();await savedRaid.close();}
 // The selected egg has no Missions of its own. Recover a previous pet’s
 // victory after the first full read fails, then review the paid history.
 const quarter='pet-s2026-001';
 const archived=await harness.setup({pets:2,prepare:f=>{
  const selected=f.sql.prepare('SELECT pet_id FROM telegram_pet_active_slots WHERE telegram_id=?').get(f.owner);
  const older=f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_instances WHERE telegram_id=? AND pet_id<>?').get(f.owner,selected.pet_id);
  f.sql.prepare("UPDATE telegram_pet_lifecycle_by_pet SET phase='egg' WHERE pet_id=?").run(selected.pet_id);
  for(const table of ['telegram_pet_instances','telegram_pet_season_slots']) f.sql.prepare("UPDATE "+table+" SET status='archived' WHERE pet_id=?").run(older.pet_id);
  const battle={...newFinale('striker'),boss_health:0};
  f.sql.prepare(`INSERT INTO telegram_pet_season_finales
    (pet_id,telegram_id,season_key,competition_season_key,reward_key,status,state_json,defeated_at)
    VALUES (?,?,?,?,?,'won',?,CURRENT_TIMESTAMP)`).run(older.pet_id,f.owner,older.season_key,quarter,seasonFinaleKey(older.pet_id,quarter),JSON.stringify(battle));
 }});
 try{
  archived.fail(true);
  const failedRead=archived.page.waitForResponse(r=>r.url().endsWith('/app/state')&&!r.request().postDataJSON().mode&&r.status()===503);
  await archived.open({waitForArt:false});await (await failedRead).finished();
  assert.equal(await archived.page.locator('#nav [data-screen="missions"]').count(),0);
  archived.fail(false);
  await archived.page.locator('[data-utility="sync"]').click();
  await archived.page.locator('#nav [data-screen="missions"]').click();
  const fight=archived.page.locator('[data-panel="season-finale"]');
  await fight.locator('summary').click();
  assert.equal(await archived.page.locator('[data-action^="finale_"]').count(),1);
  assert.equal(archived.requests.filter(r=>r.path.endsWith('/app/action')&&r.body.action.startsWith('finale_')).length,0);
  const paid=archived.page.waitForResponse(r=>r.url().endsWith('/app/action')&&r.request().postDataJSON().action==='finale_claim');
  await fight.locator('[data-action="finale_claim"]').click();
  assert.equal((await (await paid).json()).result.accepted,true);
  await archived.page.locator('#nav [data-screen="missions"]').waitFor({state:'detached'});
  await archived.page.reload();
  await archived.page.locator('#nav [data-screen="profile"]').click();
  const history=archived.page.locator('[data-panel="season-finale"]');
  await history.waitFor();
  assert.match(await history.textContent(),/FINALE VICTOR/);
  assert.match(await history.textContent(),/VICTORY REWARD CLAIMED/);
  assert.match(await history.textContent(),new RegExp(quarter));
  assert.equal(await history.locator('[data-action], [data-jump]').count(),0);
  assert.equal(await archived.page.locator('#nav [data-screen="missions"]').count(),0);
  assert.deepEqual(archived.errors,[]);
  console.log('SANDBOX_BROWSER manual egg refresh, archived Finale claim and read-only history passed');
 }finally{await archived.close();}
 for(const viewport of [{width:360,height:640},{width:390,height:844},{width:1280,height:900}]){
  for(const [name,player] of Object.entries(sandboxPlayers)){
   const f=await harness.setup({...player,viewport});
   try{
    const started=performance.now();await f.open();
    const homeMs=Math.round(performance.now()-started),screens=[];
    if(name.startsWith('stage-')){await f.started;assert.equal(f.full().state.lifecycle.evolution_stage,Number(name.slice(6)));}
    const sections=name==='new'||name==='stage-0'?['home','profile']:['home','missions','explore','work','economy','profile'];
    assert.deepEqual(await f.page.locator('#nav [data-screen]').evaluateAll(items=>items.map(item=>item.dataset.screen)),sections);
    const goalLinks=[],panelKeys=new Map();
    for(const section of sections){
     await f.page.locator('[data-screen="'+section+'"]').click();
     await f.page.locator('[data-panel="module-loading"]').waitFor({state:'hidden'});
     assert.equal(await f.page.locator('[data-screen="'+section+'"]').getAttribute('aria-current'),'page');
     panelKeys.set(section,await f.page.locator('#screen [data-panel]').evaluateAll(nodes=>nodes.map(n=>n.dataset.panel)));
     if(section==='missions'||section==='economy'){
      const links=await f.page.locator('.mission-row [data-jump], [data-panel="weekly-journey"] [data-jump], [data-panel="daily-objectives"] [data-jump], [data-panel$="bounties"] [data-jump]')
        .evaluateAll(nodes=>nodes.map(n=>({screen:n.dataset.jump,focus:n.dataset.focus,title:n.getAttribute('aria-label')})));
      goalLinks.push(...links);
     }
     const panels=await f.page.locator('#screen details[data-panel]').count();
     // Open every disclosure with its real control; inventory all actions without spending.
     for(const detail of await f.page.locator('#screen details[data-panel]').all()){
      if(!await detail.evaluate(n=>n.open))await detail.locator(':scope > summary').click();
     }
     screens.push({section,panels,actions:await f.page.locator('#screen [data-action]').evaluateAll(nodes=>nodes.map(n=>({action:n.dataset.action,disabled:n.disabled})))});
     assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    }
    assert.deepEqual(f.errors,[]);
    for(const link of goalLinks){
     assert.ok(panelKeys.get(link.screen)?.includes(link.focus),name+' / '+link.title+' must open '+link.screen+' / '+link.focus);
    }
    let navigationStress=null;
    if(name==='established'&&viewport.width===360){
     const cdp=await f.context.newCDPSession(f.page);await cdp.send('HeapProfiler.collectGarbage');
     const before=await cdp.send('Memory.getDOMCounters');
     for(let cycle=0;cycle<10;cycle++)for(const section of ['home','missions','explore','work','economy','profile']){await f.page.locator('[data-screen="'+section+'"]').click();await f.page.locator('[data-panel="module-loading"]').waitFor({state:'hidden'});}
     await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Memory.getDOMCounters');
     navigationStress={transitions:60,before,after};assert.ok(after.jsEventListeners<=before.jsEventListeners+2,'navigation must not accumulate delegated listeners');
    }
    const counts=f.f.sql.prepare('SELECT status,COUNT(*) AS n FROM telegram_pet_instances GROUP BY status').all();
    assert.equal(counts.reduce((sum,row)=>sum+row.n,0),name==='new'?0:player.pets);
    results.push({player:name,viewport,home_ms:homeMs,screens,navigationStress,permanent_pet_counts:counts});
    console.log('SANDBOX_BROWSER '+name+' '+viewport.width+' '+screens.length+' screens passed');
   }finally{await f.close();}
  }
 }
 const isolation=await harness.setup();
 try{
  await isolation.open();await isolation.started;await new Promise(resolve=>setTimeout(resolve,100));
  const requests=isolation.requests.length,statements=isolation.f.db.statementCount;
  for(const target of ['https://api.cryptomoonboys.com','http://127.0.0.1:1'])await isolation.page.evaluate(async base=>{
    try{await fetch(base+'/telegram-pets/app/state',{method:'POST',body:'{}'});throw Error('foreign origin unexpectedly served');}
    catch(error){if(error.message==='foreign origin unexpectedly served')throw error;}
  },target);
  assert.equal(isolation.requests.length,requests);assert.equal(isolation.f.db.statementCount,statements);
  assert.deepEqual(isolation.errors,['sandbox_nonlocal_api_origin:https://api.cryptomoonboys.com','sandbox_nonlocal_api_origin:http://127.0.0.1:1']);
  // A separate loopback origin is a safe external-network tripwire even on broken code.
  let escaped=0;const sink=http.createServer((_req,res)=>{escaped++;res.end('escaped');});
  await new Promise(resolve=>sink.listen(0,'127.0.0.1',resolve));
  const target='http://127.0.0.1:'+sink.address().port+'/external-guide';
  try{
   for(const method of ['open','link']){
    const failed=isolation.context.waitForEvent('requestfailed',{predicate:r=>r.url()===target});
    const popup=isolation.page.waitForEvent('popup');
    await isolation.page.evaluate(({method,target})=>{
     if(method==='open')window.open(target,'_blank');
     else{const a=document.createElement('a');a.href=target;a.target='_blank';document.body.appendChild(a);a.click();a.remove();}
    },{method,target});
    const tab=await popup;await failed;await tab.close();
   }
   assert.equal(escaped,0,'popup initial navigation must never leave the sandbox context');
   assert.equal(isolation.blockedBrowserRequests.filter(url=>url===target).length,2);
  }finally{
  await new Promise(resolve=>{
   sink.close(resolve);
   // Chromium can preconnect without reaching the HTTP request handler.
   sink.closeAllConnections();
  });
 }

 }finally{await isolation.close();}
 assert.deepEqual(harness.blockedWorkerRequests,[],'these read-only journeys require no outbound Worker requests');
 if(process.env.MOONPET_AUDIT_OUTPUT)await fs.writeFile(process.env.MOONPET_AUDIT_OUTPUT,JSON.stringify({model:'signed Worker/SQLite; no production traffic; local transport 20ms',results},null,2)+'\n');
}finally{await harness.close();}

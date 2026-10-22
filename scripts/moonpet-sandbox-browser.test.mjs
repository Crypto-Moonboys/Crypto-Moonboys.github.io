import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createMoonpetBrowserHarness} from './moonpet-browser-fixture.mjs';
import {sandboxPlayers} from './moonpet-sandbox-players.mjs';
const harness=await createMoonpetBrowserHarness();
const results=[];
try{
 for(const viewport of [{width:360,height:640},{width:390,height:844},{width:1280,height:900}]){
  for(const [name,player] of Object.entries(sandboxPlayers)){
   const f=await harness.setup({...player,viewport});
   try{
    const started=performance.now();await f.open();
    const homeMs=Math.round(performance.now()-started),screens=[];
    if(name.startsWith('stage-')){await f.started;assert.equal(f.full().state.lifecycle.evolution_stage,Number(name.slice(6)));}
    for(const section of ['home','missions','explore','work','economy','profile']){
     await f.page.locator('[data-screen="'+section+'"]').click();
     await f.page.locator('[data-panel="module-loading"]').waitFor({state:'hidden'});
     assert.equal(await f.page.locator('[data-screen="'+section+'"]').getAttribute('aria-current'),'page');
     const panels=await f.page.locator('#screen details[data-panel]').count();
     // Open every disclosure with its real control; inventory all actions without spending.
     for(const detail of await f.page.locator('#screen details[data-panel]').all()){
      if(!await detail.evaluate(n=>n.open))await detail.locator(':scope > summary').click();
     }
     screens.push({section,panels,actions:await f.page.locator('#screen [data-action]').evaluateAll(nodes=>nodes.map(n=>({action:n.dataset.action,disabled:n.disabled})))});
     assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    }
    assert.deepEqual(f.errors,[]);
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
    console.log('SANDBOX_BROWSER '+name+' '+viewport.width+' six screens passed');
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
  }finally{await new Promise(resolve=>sink.close(resolve));}

 }finally{await isolation.close();}
 assert.deepEqual(harness.blockedWorkerRequests,[],'these read-only journeys require no outbound Worker requests');
 if(process.env.MOONPET_AUDIT_OUTPUT)await fs.writeFile(process.env.MOONPET_AUDIT_OUTPUT,JSON.stringify({model:'signed Worker/SQLite; no production traffic; local transport 20ms',results},null,2)+'\n');
}finally{await harness.close();}

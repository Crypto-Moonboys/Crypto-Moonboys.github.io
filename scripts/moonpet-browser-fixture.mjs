import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHmac, createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';


// Reused signed Worker + disposable SQLite harness. External browser traffic is blocked.
export async function createMoonpetBrowserHarness({clientRoot=process.cwd(), benchmark=false,headless=true}={}) {
const root=process.cwd();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer(async(req,res)=>{
  try {
    const target=path.resolve(clientRoot,'.'+decodeURIComponent(new URL(req.url,'http://fixture').pathname));
    if(!target.startsWith(path.resolve(clientRoot)+path.sep))throw Error('outside fixture');
    const relative=path.relative(clientRoot,target).split(path.sep).join('/');
    if(!['moonpet-game.html','favicon.png'].includes(relative)&&!/^data\/moonpet-[^/]+\.json$/.test(relative)&&! /^(?:js|css|img|games\/assets)\//.test(relative))throw Error('not a public MoonPet asset');
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'};
    res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(await fs.readFile(target));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const launch={headless,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']};
if(process.env.CHROMIUM_EXECUTABLE_PATH)launch.executablePath=process.env.CHROMIUM_EXECUTABLE_PATH;
let browser;
try{browser=await chromium.launch(launch);}catch(error){await new Promise(resolve=>server.close(resolve));throw error;}
const originalFetch=globalThis.fetch;
const blockedWorkerRequests=[];
globalThis.fetch=async(input)=>{blockedWorkerRequests.push(String(input?.url || input));throw Error('sandbox_outbound_network_disabled');};
let account=980400;
async function setup({pets=1,recovery=false,website=false,delayMs=0,clock=false,telegramDelay=0,websiteDelay=0,viewport={width:360,height:640},prepare=null,initScript=null,warm=true}={}){
  const f=await performanceFixture({pets,delayMs,warm,owner:String(++account)});
  if(recovery)seedRecoveryEvidence(f);
  if(prepare)await prepare(f);
  const token='123456:pr7-local-fixture';
  const fields=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(f.owner),first_name:'Fixture'})});
  const check=[...fields].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  fields.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));
  const auth={id:Number(f.owner),first_name:'Fixture',auth_date:Math.floor(Date.now()/1000)};
  const loginCheck=Object.entries(auth).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');

  auth.hash=createHmac('sha256',createHash('sha256').update(token).digest()).update(loginCheck).digest('hex');
  const context=await browser.newContext({viewport,reducedMotion:'no-preference',serviceWorkers:'block'}),page=await context.newPage();
  if(clock)await page.clock.install();
  if(initScript)await page.addInitScript(initScript);
  const errors=[],requests=[],blockedBrowserRequests=[],inFlight=new Set();let blockFull=false,releaseFull,fullStarted,firstFull=true,failFull=false,invalid=false,fullValue=null;
  let fullGate=new Promise(resolve=>releaseFull=resolve),started=new Promise(resolve=>fullStarted=resolve);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(base=>{window.MOONBOYS_API={BASE_URL:base};localStorage.setItem('moonpet-radio-preference','off');},origin);
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='telegram.org')return route.fulfill({contentType:'text/javascript',body:'window.Telegram={WebApp:{initData:'+JSON.stringify(website||telegramDelay?'':fields.toString())+',platform:'+JSON.stringify(telegramDelay?'android':'unknown')+',ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){}}};'+(telegramDelay?'setTimeout(()=>{window.Telegram.WebApp.initData='+JSON.stringify(fields.toString())+';},'+telegramDelay+');':'' )});
    if(website&&url.pathname==='/js/identity-gate.js')return route.fulfill({contentType:'text/javascript',body:'window.fixtureAuth='+JSON.stringify(auth)+';window.fixtureWebsiteRestored=false;window.MOONBOYS_IDENTITY={restoreLinkedTelegramAuth:async()=>{await new Promise(resolve=>setTimeout(resolve,'+websiteDelay+'));window.fixtureWebsiteRestored=true;return {ok:true,telegram_auth:window.fixtureAuth};},getFreshTelegramAuth:async()=>window.fixtureAuth,getTelegramAuth:()=>window.fixtureAuth};'});
    if(url.pathname.startsWith('/telegram-pets/app/')){
      if(url.origin!==origin){errors.push('sandbox_nonlocal_api_origin:'+url.origin);return route.abort('blockedbyclient');}
      const body=req.postDataJSON();requests.push({path:url.pathname,body});
      if(url.pathname.endsWith('/performance'))return route.fulfill({json:{ok:true}});
      const isFull=url.pathname.endsWith('/state')&&!body.mode;
      if(isFull&&failFull)return route.fulfill({status:503,json:{error:'mini_app_state_failed'}});
      if(invalid)return route.fulfill({status:401,json:{error:'invalid_init_data'}});
      let finish;const pending=new Promise(resolve=>{finish=resolve;});inFlight.add(pending);
      try {
      await pause(benchmark?100:20);
      const response=await f.worker.fetch(new Request(origin+url.pathname,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.'+(account%250+1)},body:JSON.stringify(body)}),{DB:f.db,TELEGRAM_BOT_TOKEN:token});
      const json=await response.json();
      if(isFull&&firstFull){firstFull=false;fullValue=json;fullStarted();if(blockFull)await fullGate;}
      await route.fulfill({status:response.status,json}).catch(()=>{});
      return;
      }finally{inFlight.delete(pending);finish();}
    }
    if(url.origin===origin)return route.continue();
    blockedBrowserRequests.push(req.url());
    return route.abort();
  });
  const open=async()=>{await page.goto(origin+'/moonpet-game.html');await page.waitForFunction(()=>document.getElementById('boot-layer').classList.contains('is-hidden'));await page.waitForFunction(()=>window.MoonpetBetaAppearance.isBotArtReady());};
  const care=async action=>{
    // Use the player's disclosure control, and wait for its actual visible body.
    // A response event can precede JSON application and replace the old node.
    const panel=page.locator('[data-panel="care"]');
    await panel.waitFor({state:'visible'});
    if(!await panel.evaluate(n=>n.open))await panel.locator('summary').click();
    await panel.locator('[data-action="'+action+'"]').waitFor({state:'visible'});
    const accepted=page.waitForResponse(r=>r.url().endsWith('/app/action'),{timeout:10000});accepted.catch(()=>{});await page.locator('[data-panel="care"] [data-action="'+action+'"]').click();const response=await accepted;const json=await response.json();assert.equal(json.result.accepted,true);await page.waitForFunction(()=>document.getElementById('terminal-output').textContent.includes('SAVE CONFIRMED'));return json;};
  return {f,page,context,errors,requests,blockedBrowserRequests,open,care,started,release:()=>releaseFull(),block:()=>{blockFull=true;},fail:value=>{failFull=value;},invalid:()=>{invalid=true;},full:()=>fullValue,
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
return {setup,origin,browser,blockedWorkerRequests,async close(){try{await browser.close();await new Promise(resolve=>server.close(resolve));}finally{globalThis.fetch=originalFetch;}}};
}

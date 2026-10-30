import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createMoonpetBrowserHarness } from './moonpet-browser-fixture.mjs';

// Disposable SQLite accounts and intercepted network only; no live requests.
const h=await createMoonpetBrowserHarness();
try {
  for (const [status,data,copy] of [
    [200,{ok:true,member:false,status:'left'},'TELEGRAM MEMBERS ONLY'],
    [503,{ok:false,error:'telegram_group_membership_unavailable'},'TELEGRAM MEMBERS ONLY'],
    [401,{ok:false,error:'mini_app_auth_expired'},'TELEGRAM SIGNATURE REQUIRED'],
  ]) {
    const p=await h.setup();
    try {
      await p.context.route('**/telegram/group-membership',route=>route.fulfill({status,json:data}));
      await p.page.goto(h.origin+'/moonpet-game.html');
      await p.page.waitForFunction(text=>document.querySelector('#screen').textContent.includes(text),copy);
      assert.equal(p.requests.some(r=>r.path.startsWith('/telegram-pets/app/')),false,'blocked MoonPet must not read or mutate a save');
      assert.deepEqual(p.errors,[]);
      console.log('PASS MoonPet locked response '+status);
    } finally {await p.close();}
  }
  // Hold each startup dependency beyond the old decorative boot duration.
  // Releasing the response explicitly keeps the pending-state assertion honest.
  for (const phase of ['membership','core']) {
    const slow=await h.setup();
    let release,markStarted;
    const gate=new Promise(resolve=>{release=resolve;});
    const started=new Promise(resolve=>{markStarted=resolve;});
    try {
      const pattern=phase==='membership'?'**/telegram/group-membership':'**/telegram-pets/app/state';
      await slow.context.route(pattern,async route=>{
        if(phase==='core'&&route.request().postDataJSON().mode!=='core')return route.fallback();
        markStarted();
        await gate;
        return route.fallback();
      });
      await slow.page.goto(h.origin+'/moonpet-game.html');
      await Promise.race([started,new Promise((_,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Startup dependency was never requested: '+phase)),10000);
        started.then(()=>clearTimeout(timer));
      })]);
      await slow.page.waitForTimeout(1800);
      assert.match(await slow.page.locator('#boot-text').textContent(),/CONNECTING TO D1 MEMORY CORE/);
      assert.match(await slow.page.locator('#screen').textContent(),/CONNECTING TO LIVE SAVE/,
        'controls region must show a loading explanation rather than an empty black area');
      assert.equal(await slow.page.locator('#boot-layer').evaluate(el=>el.classList.contains('is-hidden')),false,
        'boot overlay must stay visible while '+phase+' is pending');
      assert.equal(await slow.page.locator('#nav button[data-screen]').count(),0,
        'unverified or incomplete state must not expose game navigation');
      if(phase==='membership')assert.equal(slow.requests.some(r=>r.path.startsWith('/telegram-pets/app/')),false);
      release();
      await slow.page.waitForFunction(()=>document.querySelectorAll('#nav button[data-screen]').length===6);
      assert.equal(await slow.page.locator('#boot-layer').evaluate(el=>el.classList.contains('is-hidden')),true,
        'verified member controls must appear after boot completes');
      assert.deepEqual(slow.errors,[]);
      console.log('PASS MoonPet pending '+phase+' retains boot then renders six controls');
    } finally {release();await slow.close();}
  }

  const member=await h.setup({website:true});
  try {
    await member.open();
    assert.ok(member.requests.some(r=>r.path==='/telegram-pets/app/state'));
    await member.switchOwner();
    await member.page.locator('[data-utility="sync"]').click();
    await member.page.waitForFunction(()=>document.getElementById('terminal-output').textContent.includes('TELEGRAM ACCOUNT CHANGED'));
    assert.equal(member.requests.some(r=>String(r.body.telegram_auth?.id)==='980302'),false,'replacement account cannot reuse membership');
    assert.deepEqual(member.errors,[]);
    console.log('PASS MoonPet member entry and cross-tab account change');
  } finally {await member.close();}

  const context=await h.browser.newContext({serviceWorkers:'block',geolocation:{latitude:51.5074,longitude:-0.1278},permissions:['geolocation']});
  const page=await context.newPage();page.setDefaultTimeout(10000);await page.addInitScript(()=>{window.MOONBOYS_API={BASE_URL:location.origin};});let memberAllowed=false;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='telegram.org')return route.fulfill({contentType:'text/javascript',body:'window.Telegram={WebApp:{initData:"signed-fixture",ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}};'});
    if(url.pathname==='/api/dead-run/profile') return route.fulfill(memberAllowed
      ? {json:{ok:true,player:{display_name:'Member'},daily:null,horde:null,active_session:null}}
      : {status:403,json:{ok:false,error:'telegram_group_membership_required'}});
    if(url.pathname==='/api/dead-run/horde/current')return route.abort();
    if(url.origin===h.origin) {
      const target=path.resolve('.'+decodeURIComponent(url.pathname));
      if(!target.startsWith(process.cwd()+path.sep))return route.abort();
      const contentType={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(target)]||'application/octet-stream';
      return route.fulfill({contentType,body:await fs.readFile(target).catch(()=>Buffer.from(''))});
    }
    return route.abort();
  });
  try {
    await page.goto(h.origin+'/games/dead-run/index.html');
    await page.waitForFunction(()=>document.getElementById('deadRunAccessMessage').textContent.includes('Join the GKniftyHEADS'));
    assert.equal(await page.locator('#demoBtn').isDisabled(),true);
    assert.equal(await page.locator('#startBtn').isDisabled(),true);
    memberAllowed=true;
    await page.locator('#deadRunAccessCheck').click();
    await page.waitForFunction(()=>document.getElementById('deadRunAccessGate').classList.contains('hidden'));
    assert.equal(await page.locator('#demoBtn').isEnabled(),true);
    await page.locator('#demoBtn').click();
    await page.waitForFunction(()=>document.getElementById('startPanel').classList.contains('hidden'));
    assert.deepEqual(errors,[]);
    console.log('PASS Dead Run non-member lock, member recheck and Demo entry');
  } finally {await context.close();}
} finally {await h.close();}

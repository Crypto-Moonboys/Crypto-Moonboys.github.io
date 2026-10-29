import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
import {fixture,hooks,currentSeason} from './moonpet-audit-regression-fixture.mjs';
const root=process.cwd(),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
const evidence=path.join(root,'output/moonpet-wings');await fs.mkdir(evidence,{recursive:true});
try{
 for(const viewport of [{width:360,height:640},{width:390,height:844},{width:1280,height:900}]){
  const f=fixture('wings-'+viewport.width),first='current-'+f.owner,second='second-'+f.owner;
  f.pet(second,currentSeason,10000,2);let displayLevel=1;const actions=[],errors=[];
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  await context.addInitScript(base=>{window.MOONBOYS_API={BASE_URL:base};localStorage.setItem('moonpet-radio-preference','off');},origin);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='telegram.org')return route.fulfill({contentType:'application/javascript',body:"window.Telegram={WebApp:{initData:'fixture',ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){}}};"});
      if (url.pathname === '/telegram/group-membership') return route.fulfill({ status:200, json:{ ok:true, member:true, status:'member', group:'@gkniftyheads' } });
   if(url.pathname.endsWith('/telegram-pets/app/performance'))return route.fulfill({json:{ok:true}});
   if(url.pathname.includes('/telegram-pets/app/')){
    const body=route.request().postDataJSON();let result;
    if(url.pathname.endsWith('/action')){actions.push(body);result=await f.act(body);}
    const state=body.mode==='core'?await hooks.buildPetMiniAppCoreState(f.db,f.owner):body.mode==='live'?await hooks.buildPetMiniAppLiveState(f.db,f.owner):await hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{mode:body.state_mode||body.mode});
    if(state.pet)state.pet.level=displayLevel; // Representative authoritative HUD levels; no production writes.
    return route.fulfill({status:result?.accepted===false?409:200,json:{state,result}});
   }
   return url.origin===origin?route.continue():route.abort();
  });
  async function ready(){await page.waitForFunction(()=>window.MoonpetBetaAppearance?.isBotArtReady());await page.locator('#boot-layer.is-hidden').waitFor({state:'attached'});}
  async function details(){await page.locator('#nav [data-screen="home"]').click();const panel=page.locator('[data-panel="details"]');if(!await panel.evaluate(node=>node.open))await panel.locator('summary').click();return panel;}
  async function restart(){await page.reload();await ready();return details();}
  await page.goto(origin+'/moonpet-game.html');await ready();let panel=await details();
  assert.match(await panel.innerText(),/UNLOCK AT LEVEL 2/);assert.equal(await panel.locator('[data-local-wings]').count(),0);
  displayLevel=2;panel=await restart();const balance=f.sql.prepare('SELECT moon_gold,pet_xp,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner);
  const before=await page.locator('#moonpet-canvas').evaluate(c=>c.toDataURL());const mutations=actions.filter(a=>a.action!=='guidance_ack').length;
  await panel.getByRole('button',{name:'Turn wings on',exact:true}).click();
  await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().wings?.source==='/img/BOTTY%20WINGS-waveone-v1.png');
  assert.equal(await panel.locator('[data-local-wings]').getAttribute('aria-pressed'),'true');
  assert.notEqual(await page.locator('#moonpet-canvas').evaluate(c=>c.toDataURL()),before,'wings change the actual room canvas');
  await page.locator('.viewport').screenshot({path:path.join(evidence,'wings-'+viewport.width+'.png')});
  panel=await restart();await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().wings?.frame===0);
  assert.equal(await panel.locator('[data-local-wings]').getAttribute('aria-pressed'),'true','reload restores ON');
  f.active(second);panel=await restart();assert.equal(await panel.locator('[data-local-wings]').getAttribute('aria-pressed'),'false','another pet starts OFF');
  f.active(first);panel=await restart();await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().wings?.frame===0);
  displayLevel=1;panel=await restart();assert.equal(await panel.locator('[data-local-wings]').count(),0);
  assert.equal(await page.evaluate(()=>window.MoonpetBetaAppearance.getBackgroundArtState().wings),null,'level gate applies despite a saved ON preference');
  displayLevel=3;panel=await restart();await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().wings?.frame===0);
  await panel.getByRole('button',{name:'Turn wings off',exact:true}).click();
  await page.waitForFunction(()=>window.MoonpetBetaAppearance.getBackgroundArtState().wings===null);
  panel=await restart();assert.equal(await panel.locator('[data-local-wings]').getAttribute('aria-pressed'),'false','reload restores OFF');
  assert.equal(actions.filter(a=>a.action!=='guidance_ack').length,mutations,'local wings do not send gameplay mutations');
  assert.deepEqual(f.sql.prepare('SELECT moon_gold,pet_xp,moon_crystals,style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').get(f.owner),balance);
  assert.deepEqual(errors,[]);assert.equal(await page.locator('canvas').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  console.log('Companion wings passed at '+viewport.width+'x'+viewport.height);await context.close();f.sql.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

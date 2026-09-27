import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root=process.cwd();
const server=http.createServer(async(req,res)=>{
  try {
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)) throw Error('outside root');
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(await fs.readFile(file));
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  for(const width of [390,360,1280]) {
    const page=await browser.newPage({viewport:{width,height:844}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let total=300,offline=false,failDaily=false,requests=0;
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='moonboys-api.test') {
        requests++;
        const period=url.searchParams.get('period');
        if(offline||(failDaily&&period==='daily'))return route.fulfill({status:503,json:{error:'unavailable'}});
        return route.fulfill({json:url.pathname.endsWith('/activity')?{items:[{text:'Player One contract_complete BOTTY (+20 pet XP, +0 XP)',time_ago:'just now'}]}:{period,entries:[{rank:1,player_display_name:'Player One',display_name:'UNKNOWN',stage:'secret_bot',level:1,pet_xp:period==='all_time'?total:20,streak_days:0}]}});
      }
      if(url.pathname.endsWith('/js/api-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.MOONBOYS_API={BASE_URL:"https://moonboys-api.test"};'});
      // Isolate this real page/widget from unrelated site account and shell traffic.
      if(url.pathname.endsWith('.js')&&!url.pathname.endsWith('/js/crypto-moonboy-pets.js'))return route.fulfill({contentType:'text/javascript',body:''});
      if(url.hostname==='127.0.0.1')return route.continue();
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/crypto-moonboy-pets-leaderboard.html`);
    await page.waitForFunction(()=>document.querySelectorAll('.pets-leaderboard-table').length===4&&!document.querySelector('[data-crypto-pets-refresh]').disabled);
    assert.ok((await page.locator('[data-period="all_time"]').textContent()).includes('300'));
    assert.ok((await page.locator('[data-crypto-pets-activity]').textContent()).includes('BOTTY'));
    const refresh=page.locator('[data-crypto-pets-refresh]');
    total=320;await refresh.click();
    await page.waitForFunction(()=>document.querySelector('[data-period="all_time"]').textContent.includes('320')&&!document.querySelector('[data-crypto-pets-refresh]').disabled);
    assert.equal(requests,10,'each refresh requests each board and activity once');
    failDaily=true;await refresh.click();
    await page.waitForSelector('[data-period="daily"] .pets-sync-warning');
    assert.equal(await page.locator('[data-period="daily"] tbody tr').count(),1,'failed refresh preserves last successful rows');
    await page.waitForFunction(()=>!document.querySelector('[data-crypto-pets-refresh]').disabled);
    failDaily=false;await page.locator('[data-period="daily"] [data-crypto-pets-retry]').click();
    await page.waitForFunction(()=>!document.querySelector('.pets-sync-warning')&&!document.querySelector('[data-crypto-pets-refresh]').disabled);
    await page.locator('[data-period="all_time"]').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('[data-period="all_time"] tbody td').nth(2).evaluate(cell=>cell.getBoundingClientRect().right<=innerWidth),'Pet XP must be visible before horizontal scrolling');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'rankings must not cause page-wide horizontal overflow');
    if(process.env.MOONPET_PUBLIC_SCREENSHOT)await page.screenshot({path:process.env.MOONPET_PUBLIC_SCREENSHOT.replace('.png',`-${width}.png`)});
    offline=true;await page.reload();
    await page.waitForFunction(()=>document.querySelectorAll('.pets-sync-warning').length===5&&!document.querySelector('[data-crypto-pets-refresh]').disabled);
    assert.equal(await page.locator('.pets-leaderboard-table').count(),0);
    assert.ok(!(await page.locator('main').textContent()).includes('No Pet XP entries'),'initial outage must not imply empty standings');
    offline=false;await refresh.click();
    await page.waitForFunction(()=>document.querySelectorAll('.pets-leaderboard-table').length===4&&!document.querySelector('[data-crypto-pets-refresh]').disabled);
    assert.deepEqual(errors,[]);
    console.log(`Public Moonpet ranks passed at ${width}px: four periods, source-pet activity, refresh, stale-data warning and outage recovery`);
    await page.close();
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}

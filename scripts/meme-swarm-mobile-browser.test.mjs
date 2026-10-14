import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
const root=process.cwd();
const server=http.createServer(async(req,res)=>{
  try {const pathname=new URL(req.url,'http://local').pathname;const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+path.sep)) throw new Error('path');
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
try {
  const cases=[...[{width:360,height:640},{width:390,height:844},{width:844,height:390},{width:1280,height:900}].map(viewport=>({viewport,routePath:'/games/meme-swarm-3008/'})),
    ...['/games/meme-swarm-3008/index.html','/games/invaders-3008/','/games/invaders-3008/index.html'].map(routePath=>({viewport:{width:360,height:640},routePath}))];
  for(const {viewport,routePath} of cases){
    const context=await browser.newContext({viewport,isMobile:viewport.width<1000,hasTouch:true});
    await context.addInitScript(()=>{
      localStorage.setItem('arcade_radio_on','false');window.__mediaStarts=0;window.__upgradesChosen=[];window.addEventListener('invaders-upgrade-selected',event=>window.__upgradesChosen.push(event.detail.id));
      HTMLMediaElement.prototype.play=function(){window.__mediaStarts++;if(window.__failNextMedia){window.__failNextMedia=false;return Promise.reject(new Error('fixture radio failure'));}return Promise.resolve();};
      HTMLMediaElement.prototype.pause=function(){};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==base)return route.abort();
      if(url.pathname==='/js/arcade/core/game-shell.js') return route.fulfill({contentType:'application/javascript',body:`import {mountArcadeRadio} from '/js/arcade/core/radio.js'; export async function mountGame({root,bootstrap}) { const game=bootstrap(root);await game.init();window.__memeGame=game;mountArcadeRadio();return game; }`});
      if(url.pathname==='/js/arcade/games/invaders/bootstrap.js'){
        let source=await fs.readFile('js/arcade/games/invaders/bootstrap.js','utf8');
        // Drive actual completed-wave transitions rather than hand-built menu state.
        source=source.replace('  return { init, start, pause, resume, reset, destroy, getScore };',`  window.__choices={showUpgrade(){wave=1;completeWave();},showRisk(){wave=5;completeWave();},snapshot(){return {choiceCursor,upgradePhase,riskRewardPhase,upgrades:{...upgrades},choices:upgradeChoices.map(c=>c.id),risk:riskRewardChoices.map(c=>c.id),activeRiskReward};}}; return { init, start, pause, resume, reset, destroy, getScore };`);
        return route.fulfill({contentType:'application/javascript',body:source});
      }
      return route.continue();
    });
    await page.goto(base+routePath);
    await page.waitForFunction(()=>window.__memeGame&&window.__choices);
    await page.locator('#overlay-btn-radio:enabled').waitFor({state:'visible'});
    const radio=page.locator('#overlay-btn-radio');
    await radio.tap();assert.equal(await radio.getAttribute('aria-pressed'),'true');
    await radio.tap();assert.equal(await radio.getAttribute('aria-pressed'),'false');
    await page.evaluate(()=>window.__failNextMedia=true);await radio.tap();
    await page.waitForFunction(()=>document.getElementById('overlay-btn-radio').getAttribute('aria-pressed')==='false');
    await radio.tap();assert.equal(await radio.getAttribute('aria-pressed'),'true','one tap retries Radio after failure');
    await radio.tap();
    assert.equal(await page.locator('#arcade-radio-panel').isVisible(),false,'radio takes no playfield space');
    const rect=await page.locator('#invCanvas').boundingBox();
    assert.ok(rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=viewport.width+1&&rect.y+rect.height<=viewport.height+1,'canvas fits viewport');
    const toolbar=await page.locator('#overlay-ctrl-bar').boundingBox(),pad=await page.locator('.overlay-touch-pad').boundingBox();
    assert.ok(rect.y>=toolbar.y+toolbar.height-1&&rect.y+rect.height<=pad.y+1,'canvas does not overlap toolbar or touch controls');
    assert.ok(Math.abs(rect.width/rect.height-540/660)<0.02,'canvas keeps its aspect ratio');
    await page.locator('#overlay-btn-start').tap();
    await page.evaluate(()=>window.__choices.showUpgrade());
    const buttons=page.locator('.overlay-touch-pad .touch-lr-row .touch-btn');
    await buttons.nth(2).tap();
    assert.equal(await page.evaluate(()=>window.__choices.snapshot().choiceCursor),1);
    const chosen=await page.evaluate(()=>window.__choices.snapshot().choices[1]);
    await buttons.nth(1).tap();
    assert.equal(await page.evaluate(key=>window.__choices.snapshot().upgrades[key],chosen),1,'Fire applies highlighted perk');
    assert.equal(await page.evaluate(()=>window.__choices.snapshot().upgradePhase),false);
    assert.deepEqual(await page.evaluate(()=>window.__upgradesChosen),[chosen],'touch selection emits one cannon-upgrade event');
    await page.evaluate(()=>window.__choices.showRisk());await buttons.nth(0).tap();
    assert.equal(await page.evaluate(()=>window.__choices.snapshot().choiceCursor),1);
    const risk=await page.evaluate(()=>window.__choices.snapshot().risk[1]);
    await buttons.nth(1).tap();
    if(risk==='skipWave') assert.equal(await page.evaluate(()=>window.__choices.snapshot().riskRewardPhase),false,'skip-wave choice completes immediately');
    else assert.equal(await page.evaluate(()=>window.__choices.snapshot().activeRiskReward?.id),risk,'Fire confirms highlighted risk');
    assert.deepEqual(errors,[]);
    console.log('Meme Swarm mobile toolbar, canvas and choices passed at '+viewport.width+'x'+viewport.height+' on '+routePath);
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

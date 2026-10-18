import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const FACTIONS = [
  'hard-fork-rockers','rugpull-miners','graffpunks','blockchain-furies',
  'crypto-moongirls','blockstars','all-city-bulls','nomad-bears','crypto-stoned-boys',
];
const SCRIPT = await readFile(path.join(ROOT,'js/faction-operations.js'),'utf8');
const CSS = await readFile(path.join(ROOT,'css/faction-operations.css'),'utf8');
function today() { return new Date().toISOString().slice(0,10); }
function nextReset() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1)).toISOString();
}
function missionData() {
  return Object.fromEntries(FACTIONS.map(key=>[key,{
    daily:[1,2,3].map(n=>({
      id:key+':mission-'+n,label:'Operation '+n,description:'Practice verified source action '+n,
      type:'runs',target:n*5,reward:{warContrib:n*25},progress:999,complete:true,
    })),
    seasonal:[{id:key+':season',label:'Long-term operation',description:'Long-term crew objective'}],
    progress:{},completed:[],
  }]));
}
function fixture({owner='111',faction='graffpunks',verified=true,source='live',
  status='ok',rows=true,now=today(),dayValue=120}={}) {
  const numeric=3;
  return {
    ok:true,fetch_status:status,utc_day:now,next_utc_reset_at:nextReset(),
    identity:verified?{linked:true,auth_mode:'telegram_verified',telegram_id:owner}:
      {linked:false,auth_mode:'anonymous'},
    faction_state:{linked:verified,faction_id:faction,faction_table_id:numeric,
      today:{[numeric]:dayValue},week:{}},
    daily_missions:{linked:verified,utc_day:now,items:rows?[
      {mission_id:'graffpunks:mission-1',progress:5,completed:true,updated_at:new Date().toISOString()},
      {mission_id:'graffpunks:mission-2',progress:3,completed:false,updated_at:new Date().toISOString()},
    ]:[]},
    daily_wtf_status:{utc_day:now,events:[
      {title:'Verified shared WTF window',starts_at:new Date(Date.now()+3600000).toISOString(),
        ends_at:new Date(Date.now()+5400000).toISOString(),status:'upcoming'},
    ]},
    source_status:{faction_state:{state:source},daily_missions:{state:source},
      daily_wtf_status:{state:'live'}},
  };
}
async function setup(width=390,options={}) {
  const browser=await chromium.launch({
    executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||
      (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
    headless:true,
  });
  const context=await browser.newContext({viewport:{width,height:850}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const chamber=options.pageKey||null;
  const html='<!DOCTYPE html><html lang="en"><head><meta name="viewport" '+
    'content="width=device-width,initial-scale=1"><style>'+CSS+
    '</style></head><body class="page-community"'+
    (chamber?' data-faction-page="'+chamber+'"':'')+
    '><main id="content" class="fcp-wrap"><section class="section fop-section">'+
    '<h2>CREW OPERATIONS TODAY</h2><div data-fop-crew></div></section>'+
    '<section class="section fop-section"><h2>MY CONTRIBUTION TODAY</h2>'+
    '<div data-fop-private></div></section></main></body></html>';
  await page.setContent(html);
  await page.evaluate(config=>{
    const order=config.order;
    window.__fopTest={id:config.id,linked:config.linked,state:config.initial,
      subscribers:[],writes:0,reads:0,refreshed:0};
    window.MOONBOYS_IDENTITY={
      isTelegramLinked:()=>window.__fopTest.linked,
      getTelegramId:()=>window.__fopTest.linked?window.__fopTest.id:null,
    };
    window.MOONBOYS_FACTION_PROFILES=Object.fromEntries(order.map(key=>
      [key,{name:key.toUpperCase()}]));
    window.MOONBOYS_MISSION_DATA=config.missionData;
    window.MOONBOYS_BATTLE_CHAMBER_STANDINGS={
      weekly:{source:'server',period:'weekly',period_key:'2026-W42',rows:[
        {faction_id:'graffpunks',rank:2,clout_total:250,member_count:12},
        {faction_id:'hard-fork-rockers',rank:1,clout_total:500,member_count:15},
      ]},
    };
    window.MOONBOYS_DAILY_LOOP={
      subscribe(callback) {
        window.__fopTest.subscribers.push(callback);
        callback(window.__fopTest.state);
        return ()=>{};
      },
      getState() {window.__fopTest.reads++;return Promise.resolve(window.__fopTest.state);},
      refresh() {window.__fopTest.refreshed++;return Promise.resolve(window.__fopTest.state);},
    };
    window.fetch=()=>{
      window.__fopTest.writes++;
      return Promise.reject(new Error('PR4 may not request a separate endpoint'));
    };
    window.__fopTest.push=value=>{
      window.__fopTest.state=value;
      window.__fopTest.subscribers.forEach(callback=>callback(value));
    };
    window.__fopTest.change=(id,linked)=>{
      window.__fopTest.id=id;
      window.__fopTest.linked=linked;
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    };
  },{order:FACTIONS,initial:options.state??fixture(),id:options.owner??'111',
    linked:options.linked??true,missionData:missionData()});
  await page.addScriptTag({content:SCRIPT});
  await page.waitForFunction(()=>document.querySelector('[data-fop-crew]')?.textContent.length>25);
  return {browser,context,page,errors};
}

test('PR4 mounts exactly once in nine faction chambers and Community; preserves legacy/editorial panels',async()=>{
  for(const faction of FACTIONS) {
    const html=await readFile(path.join(ROOT,'battle-chamber/factions',faction+'.html'),'utf8');
    assert.ok(html.includes('data-faction-page="'+faction+'"'),faction);
    assert.equal((html.match(/data-fop-crew\b/g)||[]).length,1,faction+' crew panel');
    assert.equal((html.match(/data-fop-private\b/g)||[]).length,1,faction+' member panel');
    assert.ok(html.indexOf('id="fcp-crew-operations"') <
      html.indexOf('id="fcp-my-contribution"'),faction+' order');
    assert.ok(html.indexOf('id="fcp-my-contribution"') <
      html.indexOf('id="fcp-missions"'),faction+' existing missions retained');
    assert.match(html,/\/css\/faction-operations\.css/u);
    assert.match(html,/\/js\/faction-operations\.js/u);
    for(const id of ['fcp-hero','fcp-war-status','fcp-daily-digest','fcp-live-proof-feed','fcp-reward-tracks'])
      assert.ok(html.includes('id="'+id+'"'),faction+' retains '+id);
  }
  const community=await readFile(path.join(ROOT,'community.html'),'utf8');
  assert.equal((community.match(/data-fop-crew\b/g)||[]).length,1);
  assert.equal((community.match(/data-fop-private\b/g)||[]).length,1);
  assert.ok(community.indexOf('id="battle-my-contribution-today"') <
    community.indexOf('id="battle-active-missions"'));
  assert.match(community,/\/js\/faction-operations\.js/u);
  const editorial=await readFile(path.join(ROOT,'dashboard.html'),'utf8');
  assert.doesNotMatch(editorial,/data-fop-(crew|private)|faction-operations\.js/u);
  assert.doesNotMatch(SCRIPT,/localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|sendBeacon/u,
    'renderer must not fetch/cache owner state independently');
  assert.doesNotMatch(SCRIPT,/\/faction\/signal\/contribute|\/player\/daily-missions\/progress|awardCommunityXp/u);
});

for(const width of [360,390,1280]) {
  test('PR4 source-aware public crew and aligned private member at '+width+'px',async()=>{
    const f=await setup(width,{pageKey:'graffpunks'});
    try {
      const {page}=f;
      const publicText=await page.locator('[data-fop-crew]').innerText();
      assert.match(publicText,/GRAFFPUNKS/);
      assert.equal(await page.locator('[data-fop-crew] .fop-mission').count(),3);
      assert.match(publicText,/definition only, no awarded receipt/);
      assert.match(publicText,/Weekly faction standing \(server\)/);
      assert.match(publicText,/250 faction clout/);
      assert.match(publicText,/not verified Championship Clout/);
      assert.match(publicText,/Verified shared WTF window/);
      assert.match(publicText,/Source reports upcoming/);
      assert.match(publicText,/Next UTC-day reset/);
      const privateText=await page.locator('[data-fop-private]').innerText();
      assert.match(privateText,/Verified member faction: GRAFFPUNKS/);
      assert.match(privateText,/Saved complete \(advisory\)/);
      assert.match(privateText,/Saved in progress \(advisory\)/);
      assert.match(privateText,/No saved progress record/);
      assert.match(privateText,/1 confirmed complete among 2 saved records/);
      assert.match(privateText,/120 \(server-saved faction contribution/);
      assert.match(privateText,/Next suggested action: Operation 2/);
      assert.equal(await page.locator('[data-fop-private] a[href="/my-moonboy.html?tab=faction"]').count(),1);
      assert.equal(await page.evaluate(()=>window.__fopTest.writes),0);
      assert.equal(await page.evaluate(()=>window.__fopTest.reads),1,'use the existing singleton');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
      assert.equal(f.errors.length,0,f.errors.join('\n'));
    }finally{await f.browser.close();}
  });
}

test('PR4 public guest cannot see or request private member progress',async()=>{
  const f=await setup(390,{pageKey:'graffpunks',linked:false,state:fixture({verified:false})});
  try{
    assert.equal(await f.page.locator('[data-fop-crew] .fop-mission').count(),3);
    const privateText=await f.page.locator('[data-fop-private]').innerText();
    assert.match(privateText,/Link Telegram/);
    assert.doesNotMatch(privateText,/120|saved complete|verified member|MoonPet|123456/);
    assert.equal(await f.page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 wrong-faction chamber shows only public operations',async()=>{
  const f=await setup(390,{pageKey:'hard-fork-rockers'});
  try{
    assert.match(await f.page.locator('[data-fop-crew]').innerText(),/HARD-FORK-ROCKERS/);
    assert.equal(await f.page.locator('[data-fop-crew] .fop-mission').count(),3);
    const personal=await f.page.locator('[data-fop-private]').innerText();
    assert.match(personal,/another faction’s public chamber/);
    assert.match(personal,/Open your own faction chamber/);
    assert.doesNotMatch(personal,/120|saved|Operation 1|MoonPet|111/);
    assert.equal(await f.page.locator('[data-fop-private] a[href="/battle-chamber/factions/graffpunks.html"]').count(),1);
    assert.equal(await f.page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 unaligned account has a join action, not fictitious zero completion',async()=>{
  const f=await setup(390,{pageKey:'graffpunks',state:fixture({faction:'unaligned',rows:false})});
  try{
    const txt=await f.page.locator('[data-fop-private]').innerText();
    assert.match(txt,/no faction membership was verified/);
    assert.match(txt,/Choose a faction/);
    assert.doesNotMatch(txt,/0\/3|0 confirmed complete|120|Operation 1/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 failed and empty personal sources remain unavailable, retry via singleton',async()=>{
  const f=await setup(390,{pageKey:'graffpunks',state:fixture({source:'query_failed'})});
  try{
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/membership source unavailable/);
    assert.equal(await f.page.locator('[data-fop-crew] .fop-mission').count(),3);
    await f.page.evaluate(value=>window.__fopTest.push(value),fixture({source:'live_empty',rows:false}));
    const txt=await f.page.locator('[data-fop-private]').innerText();
    assert.match(txt,/No server-saved daily mission records/);
    assert.match(txt,/not 0\/3 completed/);
    assert.doesNotMatch(txt,/Saved complete \(advisory\)/);
    await f.page.locator('[data-fop-private] [data-fop-retry]').click();
    assert.equal(await f.page.evaluate(()=>window.__fopTest.refreshed),1);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 owner switch/logout clears old contribution and rejects previous-owner cached snapshot',async()=>{
  const f=await setup(390,{pageKey:'graffpunks'});
  try{
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/120/);
    const cleared=await f.page.evaluate(()=>{
      window.__fopTest.change('222',true);
      return document.querySelector('[data-fop-private]').innerText;
    });
    assert.doesNotMatch(cleared,/120|Saved complete/);
    await f.page.evaluate(value=>window.__fopTest.push(value),fixture());
    assert.doesNotMatch(await f.page.locator('[data-fop-private]').innerText(),/120|Saved complete/);
    await f.page.evaluate(value=>window.__fopTest.push(value),fixture({
      owner:'222',rows:false,dayValue:9,
    }));
    const newer=await f.page.locator('[data-fop-private]').innerText();
    assert.match(newer,/9 \(server-saved faction contribution/);
    assert.doesNotMatch(newer,/120|Saved complete/);
    await f.page.evaluate(()=>window.__fopTest.change('222',false));
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/Link Telegram/);
    assert.doesNotMatch(await f.page.locator('[data-fop-private]').innerText(),/9 \(server-saved|Saved complete/);
    assert.equal(await f.page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 Community guest lists nine chambers; signed aligned member uses same saved status',async()=>{
  const f=await setup(390,{linked:false,state:fixture({verified:false})});
  try{
    assert.equal(await f.page.locator('[data-fop-crew] .fop-directory a').count(),9);
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/Link Telegram/);
    await f.page.evaluate(()=>{
      window.__fopTest.linked=true;
      window.dispatchEvent(new CustomEvent('moonboys:identity-change'));
    });
    await f.page.evaluate(value=>window.__fopTest.push(value),fixture());
    assert.equal(await f.page.locator('[data-fop-crew] .fop-mission').count(),3);
    assert.match(await f.page.locator('[data-fop-crew]').innerText(),/GRAFFPUNKS/);
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/1 confirmed complete among 2 saved records/);
    assert.equal(await f.page.locator('[data-fop-private] a[href="/my-moonboy.html?tab=faction"]').count(),1);
    assert.equal(await f.page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 stale UTC-day source cannot impersonate current day or claim saved progress',async()=>{
  const f=await setup(390,{pageKey:'graffpunks',state:fixture({now:'2001-01-01'})});
  try{
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/awaiting fresh signed authentication/);
    assert.doesNotMatch(await f.page.locator('[data-fop-private]').innerText(),/120|Saved complete/);
    await f.page.evaluate(value=>window.__fopTest.push(value),fixture());
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/120/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

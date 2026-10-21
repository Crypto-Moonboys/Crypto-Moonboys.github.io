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
  if (options.clockTime) await page.clock.install({time:new Date(options.clockTime)});
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
      subscribers:[],writes:0,reads:0,refreshed:0,releasePending:null,
      queuedRefreshResolvers:[],
      releaseNextQueuedRefresh(value) {
        const resolve = this.queuedRefreshResolvers.shift();
        if (resolve) resolve(value);
      }};
    window.MOONBOYS_IDENTITY={
      isTelegramLinked:()=>window.__fopTest.linked,
      getTelegramId:()=>window.__fopTest.linked?window.__fopTest.id:null,
    };
    window.MOONBOYS_FACTION_PROFILES=config.profiles === false ? {} :
      Object.fromEntries(order.map(key=>[key,{name:key.toUpperCase()}]));
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
      getState() {
        window.__fopTest.reads++;
        if (config.holdFirstRead && window.__fopTest.reads === 1) {
          return new Promise(resolve => { window.__fopTest.releasePending = resolve; });
        }
        return Promise.resolve(window.__fopTest.state);
      },
      refresh() {window.__fopTest.refreshed++;return Promise.resolve(window.__fopTest.state);},
      refreshAfterInflight() {
        window.__fopTest.refreshed++;
        if (config.holdQueuedRefresh) {
          return new Promise(resolve => { window.__fopTest.queuedRefreshResolvers.push(resolve); });
        }
        return Promise.resolve(window.__fopTest.state);
      },
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
  },{order:FACTIONS,initial:Object.hasOwn(options,'state')?options.state:fixture(),
    id:options.owner??'111',linked:options.linked??true,missionData:missionData(),
    profiles:options.profiles,holdFirstRead:Boolean(options.holdFirstRead),
    holdQueuedRefresh:Boolean(options.holdQueuedRefresh)});
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
  assert.match(community,/\/js\/faction-profile-data\.js/u,
    'Community must load the same canonical faction names as the chambers');
  assert.ok(community.indexOf('src="/js/faction-profile-data.js"') <
    community.indexOf('src="/js/faction-operations.js"'));
  const editorial=await readFile(path.join(ROOT,'dashboard.html'),'utf8');
  assert.doesNotMatch(editorial,/data-fop-(crew|private)|faction-operations\.js/u);
  assert.doesNotMatch(SCRIPT,/\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem|clear)\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(/u,
    'renderer must not read/write browser storage or fetch owner state independently');
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

test('PR2 guest account-help clicks navigate instead of starting Telegram OIDC', async()=> {
  const f = await setup(390, {pageKey:'graffpunks',linked:false,state:fixture({verified:false})});
  try {
    const {page} = f;
    const link = page.locator('[data-fop-private] a').first();
    await link.waitFor({state:'visible'});
    assert.equal(await link.count(),1,'one guest account-help entry');
    assert.equal(await link.getAttribute('data-telegram-login'),null,
      'account navigation must not opt into the delegated OIDC login handler');

    // Exercise a real browser click against the exact delegated selector used
    // by identity-gate. A temporary hash href keeps this isolated fixture on
    // the same document while proving the default navigation is not prevented.
    await page.evaluate(() => {
      window.__fopTest.interceptedLoginClicks = 0;
      document.addEventListener('click', event => {
        if (!event.target.closest('[data-telegram-login], [data-telegram-logout]')) return;
        event.preventDefault();
        window.__fopTest.interceptedLoginClicks++;
      });
      const anchor = document.querySelector('[data-fop-private] a[href="/my-moonboy.html"]');
      anchor.dataset.originalHref = anchor.getAttribute('href');
      anchor.setAttribute('href','#pr2-account-navigation-test');
      const target = document.createElement('div');
      target.id = 'pr2-account-navigation-test';
      document.body.appendChild(target);
    });
    await link.click();
    await page.waitForFunction(() => window.location.hash === '#pr2-account-navigation-test');
    assert.equal(await link.getAttribute('data-original-href'),'/my-moonboy.html',
      'original account destination must be My Moonboy');
    assert.equal(await page.evaluate(() => window.__fopTest.interceptedLoginClicks),0,
      'normal My Moonboy navigation must not invoke Telegram OIDC');
    assert.equal(await page.evaluate(() => window.__fopTest.writes),0,
      'public navigation cannot cause private account or reward writes');
    assert.doesNotMatch(await page.locator('[data-fop-private]').innerText(),
      /saved complete|Verified member faction|120 \(server-saved/u,
      'guest still cannot view personal faction state');
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  } finally { await f.browser.close(); }
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
    await f.page.waitForFunction(() => document.querySelector('[data-fop-private]')
      ?.textContent.includes('awaiting fresh signed authentication'));
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/awaiting fresh signed authentication/);
    assert.doesNotMatch(await f.page.locator('[data-fop-private]').innerText(),/120|Saved complete/);
    await f.page.evaluate(value=>window.__fopTest.push(value),fixture());
    assert.match(await f.page.locator('[data-fop-private]').innerText(),/120/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR4 Community preserves canonical GraffPUNKS and The Blockstars names without profile metadata',async()=>{
  const f=await setup(390,{linked:false,state:fixture({verified:false}),profiles:false});
  try{
    const directory=await f.page.locator('[data-fop-crew]').innerText();
    assert.match(directory,/GraffPUNKS/);
    assert.match(directory,/The Blockstars/);
    assert.doesNotMatch(directory,/\bGraffpunks\b/);
    assert.equal(await f.page.locator('[data-fop-crew] .fop-directory a').count(),9);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 stale old-owner callback cannot overwrite already accepted new-owner snapshot',async()=>{
  const f=await setup(390,{pageKey:'graffpunks'});
  try{
    await f.page.evaluate(()=>window.__fopTest.change('222',true));
    await f.page.evaluate(value=>window.__fopTest.push(value),fixture({owner:'222',rows:false,dayValue:9}));
    assert.match(await f.page.locator('[data-fop-private]').innerText(),
      /9 \(server-saved faction contribution/);
    await f.page.evaluate(value=>window.__fopTest.push(value),fixture());
    assert.match(await f.page.locator('[data-fop-private]').innerText(),
      /9 \(server-saved faction contribution/);
    assert.doesNotMatch(await f.page.locator('[data-fop-private]').innerText(),
      /120|Saved complete \(advisory\)/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR4 all nine chamber keys render their own three public definitions for guests',async()=>{
  for(const key of FACTIONS) {
    const f=await setup(360,{pageKey:key,linked:false,state:fixture({verified:false})});
    try {
      const publicText=await f.page.locator('[data-fop-crew]').innerText();
      assert.match(publicText,new RegExp(key.toUpperCase()),key+' faction heading');
      assert.equal(await f.page.locator('[data-fop-crew] .fop-mission').count(),3,
        key+' exactly three current mission definitions');
      assert.equal(await f.page.locator('[data-fop-crew] .fop-mission h3').count(),3);
      assert.match(await f.page.locator('[data-fop-private]').innerText(),/Link Telegram/);
      assert.equal(await f.page.evaluate(()=>window.__fopTest.writes),0);
      assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
      assert.equal(f.errors.length,0,key+': '+f.errors.join('\n'));
    }finally{await f.browser.close();}
  }
});

test('PR4 absent bridge mission catalogue never implies a confirmed three-operation result',async()=>{
  const f=await setup(390,{pageKey:'graffpunks'});
  try {
    await f.page.evaluate(()=>{
      delete window.MOONBOYS_MISSION_DATA.graffpunks;
      window.dispatchEvent(new CustomEvent('battle-chamber:faction-data-ready'));
    });
    const t=await f.page.locator('[data-fop-crew]').innerText();
    assert.match(t,/catalogue availability unconfirmed/);
    assert.match(t,/mission catalogue has not hydrated/);
    assert.doesNotMatch(t,/3 catalogue operations/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR4 sync-health-only cross-tab events never purge member data or restart signed reads',async()=>{
  const f=await setup(390,{pageKey:'graffpunks'});
  try{
    const {page}=f;
    const member=page.locator('[data-fop-private]');
    assert.match(await member.innerText(),/120 \(server-saved faction contribution/);
    const savedButton=await member.locator('[data-fop-retry]').elementHandle();
    const before=await page.evaluate(()=>({
      reads:window.__fopTest.reads,refreshes:window.__fopTest.refreshed,
    }));
    assert.equal(before.reads,1);
    assert.equal(before.refreshes,0);
    // An expired legacy auth attempt writes a fresh timestamp every time.
    // Two tabs can continually exchange these storage events if the
    // diagnostics accidentally call onIdentityChange() / refresh().
    await page.evaluate(()=>{
      for(let i=0;i<12;i++){
        window.dispatchEvent(new StorageEvent('storage',{
          key:'moonboys_tg_sync_health',
          oldValue:JSON.stringify({state:'bad',reason:'auth_expired',updated_at:i}),
          newValue:JSON.stringify({state:'bad',reason:'auth_expired',updated_at:i+1}),
        }));
      }
      window.dispatchEvent(new StorageEvent('storage',{
        key:'moonboys_tg_name',oldValue:'Old label',newValue:'Updated label',
      }));
    });
    assert.deepEqual(await page.evaluate(()=>({
      reads:window.__fopTest.reads,refreshes:window.__fopTest.refreshed,
    })),before,'diagnostic/cosmetic changes cannot start another signed read');
    assert.match(await member.innerText(),/120 \(server-saved faction contribution/,
      'sync-health changes must not discard verified member progress');
    assert.equal(await savedButton.evaluate(element=>element.isConnected),true,
      'unchanged diagnostics must not rebuild the personal panel');

    // An auth-expired page must not enter a retry loop either.
    const failed=fixture({status:'error'});
    await page.evaluate(next=>window.__fopTest.push(next),failed);
    const failedText=await member.innerText();
    assert.match(failedText,/unavailable or awaiting fresh signed authentication/);
    const beforeFailure=await page.evaluate(()=>({
      reads:window.__fopTest.reads,refreshes:window.__fopTest.refreshed,
    }));
    await page.evaluate(()=>{
      for(let i=0;i<12;i++){
        window.dispatchEvent(new StorageEvent('storage',{
          key:'moonboys_tg_sync_health',
          newValue:JSON.stringify({state:'bad',reason:'auth_restore_failed',updated_at:i+100}),
        }));
      }
    });
    assert.deepEqual(await page.evaluate(()=>({
      reads:window.__fopTest.reads,refreshes:window.__fopTest.refreshed,
    })),beforeFailure,'failed auth health diagnostics cannot trigger repeated refresh');
    assert.equal(await member.innerText(),failedText,
      'the unavailable state remains stable until an actual auth change or retry');
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 cross-tab Telegram storage changes and localStorage.clear() synchronously purge private contribution',async()=>{
  const f=await setup(390,{pageKey:'graffpunks'});
  try {
    assert.match(await f.page.locator('[data-fop-private]').innerText(),
      /120 \(server-saved faction contribution/);
    const oldOwnerCleared=await f.page.evaluate(()=>{
      window.__fopTest.id='222';
      window.dispatchEvent(new StorageEvent('storage',{
        key:'moonboys_tg_id',oldValue:'111',newValue:'222',
      }));
      return document.querySelector('[data-fop-private]').innerText;
    });
    assert.doesNotMatch(oldOwnerCleared,/120|Saved complete \(advisory\)/,
      'cross-tab account switch must hide previous contribution before async refresh');
    await f.page.evaluate(next=>window.__fopTest.push(next),fixture({
      owner:'222',rows:false,dayValue:9,
    }));
    assert.match(await f.page.locator('[data-fop-private]').innerText(),
      /9 \(server-saved faction contribution/);
    const unrelated=await f.page.evaluate(()=>{
      window.dispatchEvent(new StorageEvent('storage',{
        key:'site-theme',oldValue:'light',newValue:'dark',
      }));
      return document.querySelector('[data-fop-private]').innerText;
    });
    assert.match(unrelated,/9 \(server-saved faction contribution/,
      'unrelated UI storage keys must not disturb linked contribution');

    // Another tab has cleared all localStorage. StorageEvent.key is null.
    const loggedOut=await f.page.evaluate(()=>{
      window.__fopTest.linked=false;
      window.dispatchEvent(new StorageEvent('storage',{key:null}));
      return document.querySelector('[data-fop-private]').innerText;
    });
    assert.match(loggedOut,/Link Telegram/);
    assert.doesNotMatch(loggedOut,/9 \(server-saved faction contribution|120|Saved complete/,
      'localStorage.clear() must fail closed before a delayed fetch completes');

    // The older legacy auth key must also trigger the same privacy teardown.
    await f.page.evaluate(()=>{
      window.__fopTest.linked=true;
      window.__fopTest.id='111';
      window.__fopTest.push=window.__fopTest.push;
      window.dispatchEvent(new StorageEvent('storage',{
        key:'MOONBOYS_TELEGRAM_AUTH',oldValue:null,newValue:'changed',
      }));
    });
    assert.doesNotMatch(await f.page.locator('[data-fop-private]').innerText(),
      /9 \(server-saved faction contribution|120/);
    assert.equal(await f.page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 a pre-midnight pending read cannot block the next UTC-day authenticated refresh',async()=>{
  const f=await setup(390,{
    pageKey:'graffpunks',holdFirstRead:true,state:null,
    clockTime:'2026-10-17T23:59:30.000Z',
  });
  try {
    assert.equal(await f.page.evaluate(()=>window.__fopTest.reads),1);
    assert.equal(await f.page.evaluate(()=>typeof window.__fopTest.releasePending),'function');
    assert.equal(await f.page.evaluate(()=>window.__fopTest.refreshed),0);
    assert.doesNotMatch(await f.page.locator('[data-fop-private]').innerText(),
      /120 \(server-saved faction contribution/,
      'pending first page must not invent a contribution');
    await f.page.evaluate(next=>{window.__fopTest.state=next;},fixture({
      now:'2026-10-18',dayValue:9,rows:false,
    }));
    // Existing visible-page 60s interval crosses midnight while getState
    // remains deliberately unsettled. The new-day refresh must bypass it.
    await f.page.clock.runFor(62000);
    await f.page.waitForFunction(() =>
      document.querySelector('[data-fop-private]')?.innerText.includes(
        '9 (server-saved faction contribution'
      ),{timeout:10000});
    assert.equal(await f.page.evaluate(()=>window.__fopTest.refreshed),1,
      'rollover must issue a fresh singleton read rather than reuse yesterday’s promise');
    assert.match(await f.page.locator('[data-fop-private]').innerText(),
      /UTC day 2026-10-18/);
    const stale=fixture({now:'2026-10-17',dayValue:120});
    await f.page.evaluate(old=>window.__fopTest.releasePending(old),stale);
    await f.page.waitForTimeout(75);
    const current=await f.page.locator('[data-fop-private]').innerText();
    assert.match(current,/9 \(server-saved faction contribution/);
    assert.doesNotMatch(current,/120 \(server-saved faction contribution|UTC day 2026-10-17/,
      'late old-day promise cannot repaint the next-day private state');
    assert.equal(await f.page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR4 keyboard focus stays with Refresh and matching links after changed data and window refocus',async()=>{
  const f=await setup(390,{pageKey:'graffpunks'});
  try {
    const {page}=f;
    const refresh=page.locator('[data-fop-private] [data-fop-retry]');
    await refresh.waitFor();
    await refresh.focus();
    assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-fop-retry')),true);
    await page.evaluate(next=>{window.__fopTest.state=next;},fixture({dayValue:9}));
    // Keyboard activation updates the private innerHTML twice: loading, then
    // the refreshed saved value. Focus must follow the replacement button.
    await refresh.press('Enter');
    await page.waitForFunction(() =>
      document.querySelector('[data-fop-private]')?.textContent.includes(
        '9 (server-saved faction contribution'
      ));
    assert.equal(await page.evaluate(()=>
      document.activeElement?.matches('[data-fop-private] button[data-fop-retry]')),true,
    'keyboard focus remains on the replaced Refresh control after an accepted update');

    const privateLink=page.locator('[data-fop-private] a[href="/my-moonboy.html?tab=faction"]');
    await privateLink.focus();
    await page.evaluate(next=>{
      window.__fopTest.state=next;
      window.dispatchEvent(new Event('focus'));
    },fixture({dayValue:11}));
    await page.waitForFunction(() =>
      document.querySelector('[data-fop-private]')?.textContent.includes(
        '11 (server-saved faction contribution'
      ));
    assert.equal(await page.evaluate(()=>
      document.activeElement?.getAttribute('href')==='/my-moonboy.html?tab=faction'),true,
    'window refocus cannot discard the focused personal navigation link');

    const crewLink=page.locator('[data-fop-crew] a[href="/battle-chamber/factions/graffpunks.html"]');
    await crewLink.focus();
    await page.evaluate(()=>{
      window.MOONBOYS_BATTLE_CHAMBER_STANDINGS.weekly.rows[0].clout_total=299;
      window.dispatchEvent(new CustomEvent('battle-chamber:faction-data-ready'));
    });
    assert.match(await page.locator('[data-fop-crew]').innerText(),/299 faction clout/);
    assert.equal(await page.evaluate(()=>
      document.activeElement?.getAttribute('href')==='/battle-chamber/factions/graffpunks.html'),true,
    'bridge refresh must restore the same public link after rerender');
    assert.equal(await page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 intentional identity teardown does not restore the old member control',async()=>{
  const f=await setup(390,{pageKey:'graffpunks'});
  try{
    const {page}=f;
    await page.locator('[data-fop-private] [data-fop-retry]').focus();
    const state=await page.evaluate(()=>{
      window.__fopTest.change('222',true);
      return {
        oldFocused:document.activeElement?.matches('[data-fop-private] [data-fop-retry]'),
        oldContents:document.querySelector('[data-fop-private]').textContent,
      };
    });
    assert.equal(state.oldFocused,false,"old owner's button must not regain focus");
    assert.doesNotMatch(state.oldContents,/120|Saved complete \(advisory\)/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 same-day tick retires an expired active WTF event without rerendering the focused crew link',async()=>{
  const start='2026-10-18T01:59:30.000Z';
  const state=fixture({now:'2026-10-18'});
  state.daily_wtf_status.events=[
    {title:'Saved active window ending at 02:00',
      starts_at:'2026-10-18T01:00:00.000Z',
      ends_at:'2026-10-18T02:00:00.000Z',status:'active'},
    {title:'Later source confirmed window',
      starts_at:'2026-10-18T04:00:00.000Z',
      ends_at:'2026-10-18T05:30:00.000Z',status:'upcoming'},
  ];
  const f=await setup(390,{pageKey:'graffpunks',clockTime:start,state});
  try{
    const {page}=f;
    const label=page.locator('[data-fop-wtf]');
    assert.match(await label.innerText(),/Saved active window ending at 02:00/);
    assert.match(await label.innerText(),/Source reports active/);
    const link=page.locator('[data-fop-crew] a[href="/battle-chamber/factions/graffpunks.html"]');
    await link.focus();
    const handle=await link.elementHandle();
    // The existing once-per-minute visible timer crosses ends_at without
    // moving to a new UTC day or requiring another server request.
    await page.clock.runFor(62000);
    const result=await label.innerText();
    assert.doesNotMatch(result,/Saved active window ending at 02:00|Source reports active/);
    assert.match(result,/Later source confirmed window/);
    assert.match(result,/Source reports upcoming/);
    assert.equal(await handle.evaluate(element=>document.activeElement===element),true,
      'same-day presentation update must preserve the original focused DOM node');
    assert.equal(await page.evaluate(()=>window.__fopTest.reads),1,
      'window retirement needs no new Daily Loop API read');
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),0);
    assert.equal(await page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR4 same-day tick removes the final expired window without fabricating another active event',async()=>{
  const state=fixture({now:'2026-10-18'});
  state.daily_wtf_status.events=[{
    title:'Final persisted event',
    starts_at:'2026-10-18T01:00:00.000Z',
    ends_at:'2026-10-18T02:00:00.000Z',
    status:'active',
  }];
  const f=await setup(390,{
    pageKey:'graffpunks',clockTime:'2026-10-18T01:59:30.000Z',state,
  });
  try{
    assert.match(await f.page.locator('[data-fop-wtf]').innerText(),/Final persisted event/);
    await f.page.clock.runFor(62000);
    const after=await f.page.locator('[data-fop-wtf]').innerText();
    assert.match(after,/no remaining source-confirmed event for today/);
    assert.doesNotMatch(after,/Final persisted event|Source reports active/);
    assert.equal(await f.page.evaluate(()=>window.__fopTest.refreshed),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR5 accepted action queues a forced Daily Loop read after a pending pre-action request',async()=>{
  const old=fixture({dayValue:120});
  const fresh=fixture({dayValue:9,rows:false});
  const f=await setup(390,{pageKey:'graffpunks',holdFirstRead:true,state:old});
  try{
    const {page}=f;
    await page.waitForFunction(()=>typeof window.__fopTest.releasePending==='function');
    assert.match(await page.locator('[data-fop-private]').innerText(),/120 \(server-saved faction contribution/);
    await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted',{
        detail:{source:'moonpet',event:'moonpet:action-accepted',remote:true}
      }));
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted',{
        detail:{source:'moonpet',event:'moonpet:action-accepted',remote:true}
      }));
    });
    assert.doesNotMatch(await page.locator('[data-fop-private]').innerText(),/120 \(server-saved faction contribution/);
    // Simulate the shared singleton publishing its old in-flight snapshot.
    await page.evaluate(value=>window.__fopTest.push(value),old);
    assert.doesNotMatch(await page.locator('[data-fop-private]').innerText(),/120 \(server-saved faction contribution/,
      'queued post-action refresh suppresses pre-action subscriber delivery');
    await page.evaluate(value=>{window.__fopTest.state=value;},fresh);
    await page.evaluate(value=>window.__fopTest.releasePending(value),old);
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '9 (server-saved faction contribution'
    ),null,{timeout:5000});
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),1,
      'multiple accepted invalidations while one read is pending collapse to one post-action forced read');
    const current=await page.locator('[data-fop-private]').innerText();
    assert.match(current,/9 \(server-saved faction contribution/);
    assert.doesNotMatch(current,/120 \(server-saved faction contribution/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR5 faction view suppresses another component’s pre-action Daily Loop subscriber until queued refresh returns',async()=>{
  const old=fixture({dayValue:120});
  const fresh=fixture({dayValue:9,rows:false});
  const f=await setup(390,{pageKey:'graffpunks',state:old,holdQueuedRefresh:true});
  try{
    const {page}=f;
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '120 (server-saved faction contribution'
    ));
    await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted',{
        detail:{source:'arcade',event:'moonboys:arcade-score-accepted',remote:true}
      }));
    });
    await page.waitForFunction(()=>window.__fopTest.queuedRefreshResolvers.length===1);
    assert.doesNotMatch(await page.locator('[data-fop-private]').innerText(),
      /120 \(server-saved faction contribution/);
    // Emulate an older singleton request, owned by another component, publishing
    // after this widget has already queued its post-action read.
    await page.evaluate(value=>window.__fopTest.push(value),old);
    assert.doesNotMatch(await page.locator('[data-fop-private]').innerText(),
      /120 \(server-saved faction contribution/,
      'external pre-action subscriber delivery stays suppressed');
    await page.evaluate(value=>{
      window.__fopTest.state=value;
      window.__fopTest.releaseNextQueuedRefresh(value);
    },fresh);
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '9 (server-saved faction contribution'
    ),null,{timeout:5000});
    assert.match(await page.locator('[data-fop-private]').innerText(),
      /9 \(server-saved faction contribution/);
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),1);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR5 faction-status during accepted follow-up queues replacement read and never strands subscriber suppression',async()=>{
  const old=fixture({dayValue:120});
  const fresh=fixture({dayValue:9,rows:false});
  const f=await setup(390,{pageKey:'graffpunks',state:old,holdQueuedRefresh:true});
  try{
    const {page}=f;
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '120 (server-saved faction contribution'
    ));
    await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted',{
        detail:{source:'arcade',event:'moonboys:arcade-score-accepted',remote:true}
      }));
    });
    await page.waitForFunction(()=>window.__fopTest.queuedRefreshResolvers.length===1);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('moonboys:faction-status')));
    await page.evaluate(value=>window.__fopTest.push(value),old);
    assert.doesNotMatch(await page.locator('[data-fop-private]').innerText(),
      /120 \(server-saved faction contribution/,
      'retired follow-up cannot let old subscriber state repaint');
    await page.evaluate(value=>window.__fopTest.releaseNextQueuedRefresh(value),old);
    await page.waitForFunction(()=>window.__fopTest.refreshed===2 &&
      window.__fopTest.queuedRefreshResolvers.length===1);
    await page.evaluate(value=>{
      window.__fopTest.state=value;
      window.__fopTest.releaseNextQueuedRefresh(value);
    },fresh);
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '9 (server-saved faction contribution'
    ),null,{timeout:5000});
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),2);
    await page.evaluate(value=>window.__fopTest.push(value),fresh);
    assert.match(await page.locator('[data-fop-private]').innerText(),
      /9 \(server-saved faction contribution/,
      'subscriber delivery resumes after replacement authoritative read');
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

test('PR5 UTC rollover during accepted follow-up queues new-day replacement and releases suppression',async()=>{
  const old=fixture({now:'2026-10-17',dayValue:120});
  const fresh=fixture({now:'2026-10-18',dayValue:9,rows:false});
  const f=await setup(390,{
    pageKey:'graffpunks',state:old,holdQueuedRefresh:true,
    clockTime:'2026-10-17T23:59:30.000Z',
  });
  try{
    const {page}=f;
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '120 (server-saved faction contribution'
    ));
    await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted',{
        detail:{source:'moonpet',event:'moonpet:action-accepted',remote:true}
      }));
    });
    await page.waitForFunction(()=>window.__fopTest.queuedRefreshResolvers.length===1);
    await page.evaluate(value=>{window.__fopTest.state=value;},fresh);
    await page.clock.runFor(62000);
    assert.equal(await page.evaluate(()=>new Date().toISOString().slice(0,10)),'2026-10-18');
    await page.evaluate(value=>window.__fopTest.releaseNextQueuedRefresh(value),old);
    await page.waitForFunction(()=>window.__fopTest.refreshed===2 &&
      window.__fopTest.queuedRefreshResolvers.length===1);
    await page.evaluate(value=>window.__fopTest.releaseNextQueuedRefresh(value),fresh);
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '9 (server-saved faction contribution'
    ),null,{timeout:5000});
    const text=await page.locator('[data-fop-private]').innerText();
    assert.match(text,/UTC day 2026-10-18/);
    assert.match(text,/9 \(server-saved faction contribution/);
    assert.doesNotMatch(text,/120 \(server-saved faction contribution|UTC day 2026-10-17/);
    await page.evaluate(value=>window.__fopTest.push(value),fresh);
    assert.match(await page.locator('[data-fop-private]').innerText(),/9 \(server-saved faction contribution/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR5 hidden-tab reconnect queues faction reconciliation until visibility returns',async()=>{
  const old=fixture({dayValue:120});
  const fresh=fixture({dayValue:9,rows:false});
  const f=await setup(390,{pageKey:'graffpunks',state:old});
  try{
    const {page}=f;
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '120 (server-saved faction contribution'
    ));
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});
      window.dispatchEvent(new CustomEvent('moonboys:player-reconcile-needed',{
        detail:{reason:'online',utc_day:new Date().toISOString().slice(0,10)}
      }));
    });
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),0,
      'hidden reconnect queues invalidation without network work');
    assert.doesNotMatch(await page.locator('[data-fop-private]').innerText(),
      /120 \(server-saved faction contribution/,
      'hidden tab immediately stops presenting old contribution as current');

    await page.evaluate(value=>window.__fopTest.push(value),old);
    assert.doesNotMatch(await page.locator('[data-fop-private]').innerText(),
      /120 \(server-saved faction contribution/,
      'cached subscriber updates remain suppressed while hidden reconciliation is queued');

    await page.evaluate(value=>{
      window.__fopTest.state=value;
      Object.defineProperty(document,'hidden',{configurable:true,value:false});
      document.dispatchEvent(new Event('visibilitychange'));
    },fresh);
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '9 (server-saved faction contribution'
    ),null,{timeout:5000});
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),1,
      'becoming visible consumes the queued forced refresh exactly once');
    assert.match(await page.locator('[data-fop-private]').innerText(),
      /9 \(server-saved faction contribution/);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR5 guest UTC rollover refreshes anonymous Daily Loop schedule instead of clearing public truth',async()=>{
  const old=fixture({verified:false,now:'2026-10-17'});
  old.next_utc_reset_at='2026-10-18T00:00:00.000Z';
  old.daily_wtf_status={
    utc_day:'2026-10-17',
    events:[{
      title:'Old anonymous WTF window',
      starts_at:'2026-10-17T23:45:00.000Z',
      ends_at:'2026-10-18T00:10:00.000Z',
      status:'active',
    }],
  };
  const fresh=fixture({verified:false,now:'2026-10-18'});
  fresh.next_utc_reset_at='2026-10-19T00:00:00.000Z';
  fresh.daily_wtf_status={
    utc_day:'2026-10-18',
    events:[{
      title:'Fresh anonymous WTF window',
      starts_at:'2026-10-18T00:30:00.000Z',
      ends_at:'2026-10-18T01:30:00.000Z',
      status:'upcoming',
    }],
  };
  const f=await setup(390,{
    pageKey:'graffpunks',linked:false,state:old,
    clockTime:'2026-10-17T23:59:30.000Z',
  });
  try{
    const {page}=f;
    const before=await page.locator('[data-fop-crew]').innerText();
    assert.match(before,/Old anonymous WTF window/);
    assert.match(before,/Next UTC-day reset:/);
    assert.match(await page.locator('[data-fop-private]').innerText(),/Link Telegram/);
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),0);

    await page.evaluate(value=>{window.__fopTest.state=value;},fresh);
    await page.clock.runFor(62000);
    await page.waitForFunction(()=>document.querySelector('[data-fop-crew]')?.textContent.includes(
      'Fresh anonymous WTF window'
    ),null,{timeout:5000});

    const after=await page.locator('[data-fop-crew]').innerText();
    assert.match(after,/Fresh anonymous WTF window/);
    assert.doesNotMatch(after,/Old anonymous WTF window/);
    assert.match(after,/19 Oct 2026, 00:00 UTC/);
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),1,
      'guest rollover must perform one anonymous forced Daily Loop refresh');
    assert.match(await page.locator('[data-fop-private]').innerText(),/Link Telegram/);
    assert.equal(await page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR5 guest cross-tab accepted action preserves public reset and WTF snapshot without private refresh',async()=>{
  const guest=fixture({verified:false});
  guest.next_utc_reset_at='2026-10-19T00:00:00.000Z';
  guest.daily_wtf_status={
    utc_day:guest.utc_day,
    events:[{
      title:'Guest confirmed public WTF window',
      starts_at:new Date(Date.now()+3600000).toISOString(),
      ends_at:new Date(Date.now()+7200000).toISOString(),
      status:'upcoming',
    }],
  };
  const f=await setup(390,{pageKey:'graffpunks',linked:false,state:guest});
  try{
    const {page}=f;
    await page.waitForFunction(()=>document.querySelector('[data-fop-crew]')?.textContent.includes(
      'Guest confirmed public WTF window'
    ));
    const before=await page.locator('[data-fop-crew]').innerText();
    assert.match(before,/Guest confirmed public WTF window/);
    assert.match(before,/Next UTC-day reset:/);
    assert.match(await page.locator('[data-fop-private]').innerText(),/Link Telegram/);
    assert.equal(await page.evaluate(()=>window.__fopTest.reads),1);
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),0);

    await page.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted',{
        detail:{source:'arcade',event:'moonboys:arcade-score-accepted',remote:true}
      }));
    });
    await page.waitForTimeout(75);

    const after=await page.locator('[data-fop-crew]').innerText();
    assert.equal(after,before,
      'guest accepted-action invalidation must not clear or replace public source snapshot');
    assert.match(after,/Guest confirmed public WTF window/);
    assert.match(after,/Next UTC-day reset:/);
    assert.equal(await page.evaluate(()=>window.__fopTest.reads),1,
      'guest cross-tab action does not request a private or anonymous replacement read');
    assert.equal(await page.evaluate(()=>window.__fopTest.refreshed),0);
    assert.match(await page.locator('[data-fop-private]').innerText(),/Link Telegram/);
    assert.equal(await page.evaluate(()=>window.__fopTest.writes),0);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});


test('PR5 background accepted-action reconciliation preserves focused private control for same owner',async()=>{
  const f=await setup(390,{pageKey:'graffpunks'});
  try{
    const {page}=f;
    const link=page.locator('[data-fop-private] a[href="/my-moonboy.html?tab=faction"]');
    await link.focus();
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('href')==='/my-moonboy.html?tab=faction'),true);

    await page.evaluate(next=>{
      window.__fopTest.state=next;
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted',{
        detail:{source:'arcade',event:'moonboys:arcade-score-accepted',remote:true}
      }));
    },fixture({dayValue:9}));

    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '9 (server-saved faction contribution'
    ));
    assert.equal(await page.evaluate(()=>
      document.activeElement?.getAttribute('href')==='/my-moonboy.html?tab=faction'),true,
    'same-owner background reconciliation restores the matching focused private link');

    const retry=page.locator('[data-fop-private] [data-fop-retry]');
    await retry.focus();
    await page.evaluate(next=>{
      window.__fopTest.state=next;
      window.dispatchEvent(new CustomEvent('moonboys:player-reconcile-needed',{
        detail:{reason:'online',utc_day:new Date().toISOString().slice(0,10)}
      }));
    },fixture({dayValue:11}));
    await page.waitForFunction(()=>document.querySelector('[data-fop-private]')?.textContent.includes(
      '11 (server-saved faction contribution'
    ));
    assert.equal(await page.evaluate(()=>
      document.activeElement?.matches('[data-fop-private] button[data-fop-retry]')),true,
    'background reconnect reconciliation preserves focused Retry control');
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.browser.close();}
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {createRequire} from 'node:module';
const playOptions=createRequire(import.meta.url)('../js/moonpet-play-options.js');
import {performanceFixture} from './moonpet-state-performance-fixture.mjs';
const client=fs.readFileSync(new URL('../js/moonpet-mini-app.js',import.meta.url),'utf8');
const fn=(start,end)=>client.slice(client.indexOf('  function '+start),client.indexOf('  function '+end));
const marker=name=>client.slice(client.indexOf('// TEST-EXPORT: '+name+':start'),client.indexOf('// TEST-EXPORT: '+name+':end'));
const context=extra=>vm.createContext({state:null,number:Number,words:String,escapeHtml:String,window:{},petActionRefreshRequired:false,
 panel:(_title,body)=>body,objectiveRouteButton:()=>'',activePetProgression:()=>({}),weeklyJourneyMarkup:()=>'',dailyJourneyMarkup:()=>'',
 activePetSummary:()=>'',renderPlayNow:()=>'',renderContracts:()=>'',renderDailyCompletion:()=>'',renderSeasonFinales:()=>'',dailyObjectiveMarkup:()=>'',meter:()=>'',...extra});

test('signed saved mission evidence produces completion labels without changing balances or flags',async()=>{
 const f=await performanceFixture();
 try{
  const {state}=await f.measureHttp();
  const before=f.sql.prepare('SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get();
  const c=context({state});vm.runInContext(fn('renderMissions()','renderKaijuHowTo('),c);
  const missions=state.guidance.missions;assert.ok(missions.some(m=>m.completed));assert.ok(missions.some(m=>!m.completed));
  const original=JSON.stringify(missions);
  for(const mission of missions){
   c.state={...state,guidance:{...state.guidance,missions:[mission],achievements:[]}};
   const html=c.renderMissions();
   const expected=Number(Boolean(mission.completed))+(mission.steps||[]).filter(s=>s.completed).length;
   assert.equal((html.match(/✅ Completed/g)||[]).length,expected,mission.key);
  }
  assert.equal(JSON.stringify(missions),original);
  assert.deepEqual(f.sql.prepare('SELECT pet_xp,moon_gold,moon_crystals,style_tokens FROM telegram_pet_profiles').get(),before);
 }finally{f.close();}
});

test('Missions render only boolean confirmed completion and escape server-owned step titles',()=>{
 const safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const c=context({escapeHtml:safe,state:{
  adopted:true,pet:{pet_id:'p'},lifecycle:{phase:'young'},
  guidance:{missions:[{key:'daily-care',title:'Care <today>',completed:'false',steps:[
   {title:'<img src=x onerror=alert(1)>',completed:'false'},
   {title:'Work <safe>',completed:true},
  ]}],achievements:[]}
 }});
 vm.runInContext(fn('renderMissions()','renderKaijuHowTo('),c);
 const html=c.renderMissions();
 assert.equal((html.match(/✅ Completed/g)||[]).length,1,
  'untrusted truthy strings must not fabricate completed mission/step status');
 assert.match(html,/Care &lt;today&gt;/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/Work &lt;safe&gt;/);
 assert.doesNotMatch(html,/<img|<script|Care <today>/);
 assert.doesNotMatch(html,/mission-row[^>]*><div class="line complete">/);
 c.state.guidance.missions=[{key:'verified',title:'Verified',completed:1,steps:[{title:'Saved step',completed:1}]}];
 assert.equal((c.renderMissions().match(/✅ Completed/g)||[]).length,2,
  'explicit SQLite numeric 1 remains eligible as saved completion evidence');
});

test('Missions remains usable with malformed optional lists instead of crashing or awarding ticks',()=>{
 const c=context({state:{adopted:true,pet:{pet_id:'p'},lifecycle:{phase:'young'},
  guidance:{missions:{unexpected:true},achievements:'unavailable'}}});
 vm.runInContext(fn('renderMissions()','renderKaijuHowTo('),c);
 assert.match(c.renderMissions(),/NO MISSION DATA/);
 c.state.guidance.missions=[null,{key:'one',title:'One',completed:false,steps:{broken:true}}];
 assert.match(c.renderMissions(),/\[  \] One/);
 assert.doesNotMatch(c.renderMissions(),/✅ Completed/);
});

test('a partial daily bonus read shows Refresh instead of an unverified claim button',()=>{
 const c=context({button:()=>'<button>CLAIM BONUS</button>',state:{
  pet:{pet_id:'p'},lifecycle:{phase:'young'},
  guidance:{daily_completion:{ready:true,pending:[{utc_day:'2026-10-27'}]}}
 }});
 vm.runInContext(fn('renderDailyCompletion()','renderMissionStatus('),c);
 const missingRewards=c.renderDailyCompletion();
 assert.match(missingRewards,/BONUS STATUS UNAVAILABLE \/\/ TAP REFRESH/);
 assert.doesNotMatch(missingRewards,/CLAIM BONUS|✅ Completed/);
 c.state.guidance.daily_completion={ready:true,rewards:{pet_xp:5,moon_gold:2,style_tokens:1},pending:{malformed:true}};
 const wrongPending=c.renderDailyCompletion();
 assert.match(wrongPending,/BONUS STATUS UNAVAILABLE \/\/ TAP REFRESH/);
 assert.doesNotMatch(wrongPending,/CLAIM BONUS/);
});

test('generic menu categories never establish success without saved outcome evidence',()=>{
 const kinds=['complete','claim','recovery','waiting','progress','ready','resume','review'];
 for(const kind of kinds){
  const c=context({state:{adopted:true,pet:{pet_id:'p'}},activeScreen:'home',panelOpenState:{},routeButton:()=>'',window:{MoonpetPlayOptions:{menuStatuses:()=>({home:{loaded:true,entries:[{key:'saved',title:'Saved activity',kind,status:'original status',count:1}]}}),menuBadge:()=>({count:0})}}});
  vm.runInContext(marker('menuStatus'),c);const html=c.renderMenuStatus();
  assert.equal(html.includes('✅ Completed'),false,'generic terminal category alone is not success evidence');assert.ok(html.includes('original status'));
  c.petActionRefreshRequired=true;assert.equal(c.renderMenuStatus().includes('✅ Completed'),false);
 }
});

test('all six menus suppress unverified completion and actions after uncertain refresh',()=>{
 const screens=['home','missions','explore','work','economy','profile'];
 const saved=Object.fromEntries(screens.map(screen=>[screen,{loaded:true,entries:[
  {key:'unknown-'+screen,title:screen.toUpperCase()+' SAVED',kind:'complete',status:'REVIEW REQUIRED',count:1},
 ]}]));
 const c=context({state:{adopted:true,pet:{pet_id:'selected-pet'}},
  activeScreen:'home',panelOpenState:{},routeButton:()=>'<button>REVIEW ONLY</button>',
  window:{MoonpetPlayOptions:{menuStatuses:()=>saved,menuBadge:()=>({count:0})}}});
 vm.runInContext(marker('menuStatus'),c);
 for(const screen of screens){
  c.activeScreen=screen;
  const markup=c.renderMenuStatus();
  assert.match(markup,/REVIEW REQUIRED/);
  assert.doesNotMatch(markup,/✅ Completed|CLAIM READY/,
   screen+' may not infer success from an unverified complete category');
  c.petActionRefreshRequired=true;
  assert.match(c.renderMenuStatus(),/REFRESH REQUIRED/);
  assert.doesNotMatch(c.renderMenuStatus(),/REVIEW ONLY|✅ Completed/,
   screen+' must block stale saved-action shortcuts');
  c.petActionRefreshRequired=false;
 }
});

test('7/7 completion wording preserves pending claims and does not mark partial or unavailable bonuses',()=>{
 const c=context({button:()=>'<button>claim</button>',state:{pet:{pet_id:'p'},lifecycle:{phase:'young'}}});
 vm.runInContext(fn('renderDailyCompletion()','renderMissionStatus('),c);
 for(const [bonus,complete] of [[{claimed:true,pending:[]},true],[{ready:true,pending:[{utc_day:'2026-10-21',pet_id:'p'}]},true],[{ready:false,pending:[]},false],[{available:false},false]]){
  c.state.guidance={daily_completion:{rewards:{pet_xp:0},...bonus}};const html=c.renderDailyCompletion();assert.equal(html.includes('✅ Completed'),complete);
  if(bonus.ready)assert.ok(html.includes('<button>claim</button>'),'completed checklist must retain its unpaid reward action');
 }
});

test('real menu projection distinguishes saved successful and failed contract/daily endings',()=>{
 for(const system of ['contract','daily'])for(const status of ['active','failed','unknown','completed','extracted']){
  const state={adopted:true,pet:{pet_id:'p'},lifecycle:{phase:'young'},hydration:{full:true}};
  if(system==='contract')state.contracts={available:true,run:{status,title:'Saved contract'}};
  else state.daily_run={attempted:true,status};
  const c=context({state,activeScreen:system==='contract'?'missions':'explore',panelOpenState:{},routeButton:()=>'',window:{MoonpetPlayOptions:playOptions}});
  vm.runInContext(marker('menuStatus'),c);const html=c.renderMenuStatus();
  const success=system==='contract'?status==='completed':['completed','extracted'].includes(status);
  assert.equal(html.includes('✅ Completed'),success,system+':'+status);
  if(status==='failed')assert.ok(html.includes('FAILED'));
 }
 for(const system of ['raid','weekly']){
  const state={adopted:true,pet:{pet_id:'p'},lifecycle:{phase:'young'},hydration:{full:true},live_systems:{seasonal_boss:system==='raid'?{defeated_at:'2026-10-21'}:{}},guidance:{weekly_boss:system==='weekly'?{defeated:true}:{}}};
  const c=context({state,activeScreen:'explore',panelOpenState:{},routeButton:()=>'',window:{MoonpetPlayOptions:playOptions}});vm.runInContext(marker('menuStatus'),c);assert.ok(c.renderMenuStatus().includes('✅ Completed'));
 }
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
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

test('saved status labels completion only for complete entries, never claims, recovery or waiting',()=>{
 const kinds=['complete','claim','recovery','waiting','progress','ready','resume','review'];
 for(const kind of kinds){
  const c=context({state:{adopted:true,pet:{pet_id:'p'}},activeScreen:'home',panelOpenState:{},routeButton:()=>'',window:{MoonpetPlayOptions:{menuStatuses:()=>({home:{loaded:true,entries:[{key:'saved',title:'Saved activity',kind,status:'original status',count:1}]}}),menuBadge:()=>({count:0})}}});
  vm.runInContext(marker('menuStatus'),c);const html=c.renderMenuStatus();
  assert.equal(html.includes('✅ Completed'),kind==='complete');assert.ok(html.includes('original status'));
  c.petActionRefreshRequired=true;assert.equal(c.renderMenuStatus().includes('✅ Completed'),false);
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

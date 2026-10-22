// Separate process per revision: deterministic randomness, fixed application/SQL time.
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery } from './moonpet-pr3-fixture.mjs';
import { createHash } from 'node:crypto';
let sequence=0;Math.random=()=>0.25;
Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')});
Object.defineProperty(crypto,'getRandomValues',{value:array=>{array.fill(64);return array;}});
const scenario=process.argv[2]||'warm';
const mode=process.argv[4]||'full';
const f=await performanceFixture({root:process.argv[3]||process.env.MOONPET_PERF_SOURCE_ROOT||process.cwd(),delayMs:Number(process.env.MOONPET_PERF_DELAY_MS||0),serializedWrites:process.env.MOONPET_PERF_SERIAL_WRITES==='1',pets:['three','archived'].includes(scenario)?3:1,warm:!['new','zero'].includes(scenario)});
try {
 if(scenario==='zero')for(const table of ['telegram_pet_active_slots','telegram_pet_lifecycle_by_pet','telegram_pet_season_slots','telegram_pet_instances','telegram_pet_profiles'])f.sql.exec('DELETE FROM '+table);
 if(['heavy','archived'].includes(scenario))await seedPr3Recovery(f,{archived:scenario==='archived'});
 if(scenario==='day_rollover')f.advance(86400000);
 if(scenario==='week_rollover')f.advance(7*86400000);
 // Seed timestamps are pinned before warm-up. Retain all timestamps and derived
 // values; only signed presentation tokens are normalized.
 function clean(value,key=''){
  if(key==='challenge_token')return '<fixture-metadata>';
  if(Array.isArray(value))return value.map(v=>clean(v));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v,k)]));
  return value;
 }
 const tables=['telegram_pet_instances','telegram_pet_active_slots','telegram_pet_season_slots','telegram_pet_growth_marks','telegram_pet_weekly_crests','telegram_pet_system_events','telegram_pet_reward_claims','telegram_pet_daily_journey_receipts','telegram_pet_weekly_journey_receipts','telegram_pet_material_balances','telegram_pet_profiles'];
 if(process.env.MOONPET_PERF_ALL_TABLES==='1')tables.splice(0,tables.length,...f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name));
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const snapshot=state=>({response:clean(state),persisted:Object.fromEntries(tables.map(t=>[t,clean(f.sql.prepare('SELECT * FROM '+t+' ORDER BY 1').all())]))});
 let first;
 if(scenario==='concurrent'){
   const originalInfo=console.info;console.info=()=>{};
   try {
     const started=performance.now();
     const pair=await Promise.all([f.measureHttp(mode,{captureTimings:false}),f.measureHttp(mode,{reset:false,captureTimings:false})]);
     first=pair.reduce((a,b)=>a.report.calls>b.report.calls?a:b);
     first.report.duration_ms=Math.round(performance.now()-started);
     if(hash(clean(pair[0].state))!==hash(clean(pair[1].state)))throw Error('concurrent_response_divergence');
   }finally{console.info=originalInfo;}
 }else if(scenario==='failed'){
   f.db.beforeAll=async s=>{if(s.query.includes('SELECT c.contract_id,c.pet_id,c.season_key,c.reward_day'))throw Error('fixture unavailable');};
   first=await f.measureHttp(mode,{status:503});
   await f.drain();f.db.beforeAll=null;
 }else first=await f.measureHttp(mode);
 const initial=snapshot(first.state); // Capture committed state BEFORE the retry.
 const second=await f.measureHttp(mode);
 const retry=snapshot(second.state);
 console.log(JSON.stringify({scenario,first:first.report,second:second.report,
   first_response_hash:hash(initial.response),first_persisted_hash:hash(initial.persisted),
   retry_response_hash:hash(retry.response),retry_persisted_hash:hash(retry.persisted)}));
}finally{f.close();}

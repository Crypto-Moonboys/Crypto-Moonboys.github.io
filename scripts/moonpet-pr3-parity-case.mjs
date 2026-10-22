// Separate process per revision: deterministic randomness, fixed application/SQL time.
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery } from './moonpet-pr3-fixture.mjs';
import { createHash } from 'node:crypto';
let sequence=0;Math.random=()=>0.25;
Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')});
Object.defineProperty(crypto,'getRandomValues',{value:array=>{array.fill(64);return array;}});
const scenario=process.argv[2]||'warm';
const f=await performanceFixture({root:process.env.MOONPET_PERF_SOURCE_ROOT||process.cwd(),pets:['three','archived'].includes(scenario)?3:1,warm:scenario!=='new'});
try {
 if(['heavy','archived'].includes(scenario))await seedPr3Recovery(f,{archived:scenario==='archived'});
 if(scenario==='day_rollover')f.advance(86400000);
 if(scenario==='week_rollover')f.advance(7*86400000);
 const first=await f.measureHttp();const second=await f.measureHttp();
 // Initial seed rows precede the fixed SQL clock. Normalize only fixture-created
 // creation/update metadata and signed presentation tokens; retain all periods,
 // earned dates, wallets, progression, ownership and response keys.
 function clean(value,key=''){
  if(['created_at','updated_at','source_profile_updated_at','challenge_token'].includes(key))return '<fixture-metadata>';
  if(Array.isArray(value))return value.map(v=>clean(v));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v,k)]));
  return value;
 }
 const tables=['telegram_pet_instances','telegram_pet_active_slots','telegram_pet_season_slots','telegram_pet_growth_marks','telegram_pet_weekly_crests','telegram_pet_system_events','telegram_pet_reward_claims','telegram_pet_daily_journey_receipts','telegram_pet_weekly_journey_receipts','telegram_pet_material_balances','telegram_pet_profiles'];
 const persisted=Object.fromEntries(tables.map(t=>[t,clean(f.sql.prepare('SELECT * FROM '+t+' ORDER BY 1').all())]));
 const response=clean(second.state);
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 console.log(JSON.stringify({scenario,first:first.report,second:second.report,response_hash:hash(response),persisted_hash:hash(persisted),response,persisted}));
}finally{f.close();}

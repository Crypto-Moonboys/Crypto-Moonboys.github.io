// Local SQLite attribution only; no SQL, arguments, IDs or result data leave this process.
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery } from './moonpet-pr3-fixture.mjs';
const root=process.argv[2]||process.cwd(), scenario=process.argv[3]||'three';
const f=await performanceFixture({root,pets:scenario==='three'?3:1,delayMs:Number(process.argv[4]||0)});
try {
 if(scenario==='heavy')await seedPr3Recovery(f);
 const categories=[['home',/house|furniture|garden|StyleLoadout/i],['roster',/buildPetSeasonSlotSummary|evaluatePetSeasonCompletion|buildPetLifecycleProgress|ownedPet|readDeletedPetHistory/],['inventory_economy',/getPetEconomyState|getPetInventory|InventoryReconciliation/],['rewards',/getPetSeasonRewardState|PendingPetWeeklyBoss|DailyChest/],['missions',/buildPetMissions|readDailyCompletion/],['guidance',/buildPetGuidanceState|getPetEvolutionGuidance|SpecialActionGuidance|syncPetAchievements/],['live_systems',/LiveSystemsState|LiveSystemAuthority/],['leaderboard',/readPetLeaderboard/],['identity_lifecycle',/Identity|Lifecycle|EvolutionStage|EvolutionRequirements|ActivePetSlot|PetProfile|EquipmentProgression|ActivePetInstance/],['verification',/capturePetEconomy|assertPetEconomy|assertPetProjectionSource/],['gameplay',/Arena|Kaiju|PetRun|RuntimeState|ActivitySession|Contract|JourneySummary|SeasonFinales|StreetEvents/]];
 const tags=new WeakMap(), modules=new Map(), calls=new Map();let active=false;
 const prepare=f.db.prepare.bind(f.db), batch=f.db.batch.bind(f.db);
 const get=name=>{if(!modules.has(name))modules.set(name,{sql_statements:0});return modules.get(name);};
 function wrap(raw,module){const p=new Proxy(raw,{get(target,key){if(key==='bind')return (...args)=>wrap(target.bind(...args),module);if(['first','all','run'].includes(key))return (...args)=>record([module],()=>target[key](...args));return Reflect.get(target,key,target);}});tags.set(p,{raw,module});return p;}
 async function record(names,execute){if(!active)return execute();const unique=[...new Set(names)].sort();const label=unique.join('+');if(!calls.has(label))calls.set(label,{modules:unique,d1_calls:0,sql_statements:0,binding_elapsed_ms:0});const row=calls.get(label);row.d1_calls++;row.sql_statements+=names.length;for(const name of names)get(name).sql_statements++;const start=performance.now();try{return await execute();}finally{row.binding_elapsed_ms+=performance.now()-start;}}
 f.db.prepare=sql=>{const stack=new Error().stack.split('\n').filter(l=>l.includes('/workers/moonboys-api/')&&!/state-timings|displayed-pet-scope/.test(l));const frame=stack[0]||'';const module=sql.includes('AS displayed_pet_authority')?'atomic_guard':categories.find(([,pattern])=>pattern.test(frame))?.[0]||'remaining';return wrap(prepare(sql),module);};
 f.db.batch=entries=>record(entries.map(s=>tags.get(s)?.module||'remaining'),()=>batch(entries.map(s=>tags.get(s)?.raw||s)));
 const started=performance.now();const stages=[];
 await f.hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{timings:{async measure(stage,execute){const start=performance.now();if(stage==='pet_state_projection')active=true;try{return await execute();}finally{stages.push({stage,duration_ms:performance.now()-start});if(stage==='pet_state_projection')active=false;}}}});
 console.log(JSON.stringify({scenario,delay_ms:Number(process.argv[4]||0),full_state_ms:performance.now()-started,stages,modules:Object.fromEntries([...modules].sort()),call_groups:[...calls.values()].map(r=>({...r,binding_elapsed_ms:Math.round(r.binding_elapsed_ms*100)/100})),total:{sql_statements:[...modules.values()].reduce((s,r)=>s+r.sql_statements,0),d1_calls:[...calls.values()].reduce((s,r)=>s+r.d1_calls,0)}},null,2));
}finally{f.close();}

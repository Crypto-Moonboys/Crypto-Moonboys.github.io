// Diagnostic-only local SQLite call ledger. Never run against a production DB.
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery } from './moonpet-pr3-fixture.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { nativeBenchmarkSnapshot, freezeBenchmarkTime } from './moonpet-pr5-native-benchmark.mjs';
const root=process.argv[2]||process.cwd(),scenario=process.argv[3]||'three';
const f=await performanceFixture({root,pets:3});
try {
 if(scenario==='history'){
  await seedPr3Recovery(f,{archived:true});
  const pet=f.sql.prepare('SELECT pet_id FROM telegram_pet_instances WHERE telegram_id=? ORDER BY pet_id LIMIT 1').get(f.owner).pet_id;
  const insert=f.sql.prepare("INSERT INTO telegram_pet_events(id,telegram_id,pet_id,event_type,event_key,day_key,week_key,season_key,status,created_at) VALUES(?,?,?,'feed',?,'2026-09-01','2026-W36','pet-s2026-003',?,'2026-09-01 12:00:00')");
  f.sql.exec('BEGIN');for(let i=0;i<10000;i++)insert.run('pr5-history-'+i,f.owner,pet,'pr5-history-'+i,i%5?'rejected':'accepted');f.sql.exec('COMMIT');
 }
 const families=new Map(),queries=new Map(),tags=new WeakMap(),calls=[],sqlSpans=[];
 let active=false,origin=0,cpuStart,projection;
 const categories=[['home',/house|furniture|garden|StyleLoadout/i],['roster',/season-completion\.js|buildPetSeasonSlotSummary|evaluatePetSeasonCompletion|buildPetLifecycleProgress|ownedPet|readDeletedPetHistory/],['inventory_economy',/getPetEconomyState|getPetInventory|InventoryReconciliation/],['rewards',/getPetSeasonRewardState|PendingPetWeeklyBoss|DailyChest/],['missions',/buildPetMissions|readDailyCompletion/],['guidance',/getPetWindowTotals|persistPetGuidanceNotices|buildPetGuidanceState|getPetEvolutionGuidance|SpecialActionGuidance|syncPetAchievements/],['live_systems',/LiveSystemsState|LiveSystemAuthority|resolveLivePetAuthority|getPetLiveProgressionState/],['leaderboard',/readPetLeaderboard/],['identity_lifecycle',/Identity|Lifecycle|EvolutionStage|EvolutionRequirements|ActivePetSlot|PetProfile|EquipmentProgression|ActivePetInstance/],['verification',/hasPetAccountWalletReconciliationMarker|capturePetEconomy|assertPetEconomy|assertPetProjectionSource/],['journey_projection',/readDailyCareRecoveryState|listPetMiniAppDailyJourneyObjectives|readWeeklyJourneyObjectiveProgress/],['notifications',/getPetNotificationPreference/],['gameplay',/getDailyMoonRunSummary|contracts\.js|authority|Arena|Kaiju|PetRun|RuntimeState|ActivitySession|Contract|JourneySummary|SeasonFinales|StreetEvents/]];
 const fingerprint=sql=>createHash('sha256').update(sql.replace(/\s+/g,' ').trim()).digest('hex').slice(0,16);
 const nativePrepare=f.sql.prepare.bind(f.sql);
 f.sql.prepare=sql=>{const stmt=nativePrepare(sql);return new Proxy(stmt,{get(target,key){if(['get','all','run'].includes(key))return(...args)=>{if(!active)return target[key](...args);const id=fingerprint(sql),start=performance.now();try{return target[key](...args);}finally{const duration=performance.now()-start;sqlSpans.push([start-origin,start-origin+duration]);const family=families.get(id);if(family){family.executions++;family.local_sql_ms+=duration;queries.set(id,{sql,args});}}};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});};
 const prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db);
 function wrap(raw,tag){const wrapped=new Proxy(raw,{get(target,key){if(key==='bind')return(...args)=>wrap(target.bind(...args),tag);if(['first','all','run'].includes(key))return(...args)=>record([tag],()=>target[key](...args));return Reflect.get(target,key,target);}});tags.set(wrapped,{raw,...tag});return wrapped;}
 async function record(entries,execute){if(!active)return execute();if(calls.length>=512)throw Error('local_audit_call_limit');const call={index:calls.length+1,families:entries.map(e=>e.id),modules:entries.map(e=>e.module),callers:entries.map(e=>e.caller),start_ms:performance.now()-origin,sql_statements:entries.length,outcome:'completed'};calls.push(call);try{return await execute();}catch(e){call.outcome='failed';throw e;}finally{call.end_ms=performance.now()-origin;call.elapsed_ms=call.end_ms-call.start_ms;}}
 f.db.prepare=sql=>{if(!active)return prepare(sql);const id=fingerprint(sql),frame=new Error().stack.split('\n').find(l=>l.includes('/workers/moonboys-api/')&&!/state-timings|displayed-pet-scope/.test(l))||'';const caller=(frame.match(/at ([\w.]+)/)||[])[1]||'anonymous';const module=sql.includes('AS displayed_pet_authority')?'atomic_guard':categories.find(([,p])=>p.test(frame))?.[0]||(caller==='projectPetMiniAppState'?(sql.includes('telegram_pet_events')?'cooldown_history':/arena|kaiju/i.test(sql)?'gameplay':'inventory_economy'):'remaining');if(!families.has(id))families.set(id,{id,module,caller,executions:0,local_sql_ms:0});return wrap(prepare(sql),{id,module,caller});};
 f.db.batch=entries=>record(entries.map(s=>tags.get(s)||{id:'unknown',module:'remaining',caller:'unknown'}),()=>batch(entries.map(s=>tags.get(s)?.raw||s)));
 await f.hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{timings:{async measure(stage,execute){if(stage!=='pet_state_projection')return execute();origin=performance.now();cpuStart=process.cpuUsage();active=true;try{return await execute();}finally{active=false;const cpu=process.cpuUsage(cpuStart);projection={wall_ms:performance.now()-origin,local_process_cpu_ms:(cpu.user+cpu.system)/1000};}}}});
 const union=spans=>{let total=0,end=0;for(const [a,b]of spans.slice().sort((x,y)=>x[0]-y[0])){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;};
 const snapshot=await nativeBenchmarkSnapshot(f.sql);
 const frozenTime=new Date().toISOString();
 const plans=[];try { for(const family of families.values()){
  const q=queries.get(family.id);if(!family.executions||!q)continue;
  if(/^\s*(SELECT|WITH)\b/i.test(q.sql)&&! /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(q.sql)){
   const sql=freezeBenchmarkTime(q.sql,frozenTime);
   const expected=nativePrepare(q.sql).all(...q.args);
   const actual=snapshot.db.prepare(sql).all(...q.args);
   assert.deepEqual(actual,expected,'native date function result parity: '+family.id);
   const plan=snapshot.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...q.args).map(({detail})=>detail);
   const stmt=snapshot.db.prepare(sql);const samples=[];for(let i=0;i<7;i++){const start=performance.now();stmt.all(...q.args);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);
   plans.push({family:family.id,module:family.module,caller:family.caller,plan,clock:'native_sqlite_frozen_literals',result_parity:true,local_select_ms:{min:samples[0],median:samples[3],max:samples[6]}});
  }
 }
 } finally {snapshot.close();}
 const modules={};for(const call of calls)for(const module of call.modules){const row=modules[module]||={sql_statements:0,participating_calls:0};row.sql_statements++;}for(const call of calls)for(const module of new Set(call.modules))modules[module].participating_calls++;
 const guarded=calls.filter(c=>c.families.some(id=>families.get(id)?.module==='atomic_guard'));
 let frontier=0,depth=0;for(const call of calls.slice().sort((a,b)=>a.end_ms-b.end_ms))if(call.start_ms>=frontier){depth++;frontier=call.end_ms;}
 const worker=readFileSync(root+'/workers/moonboys-api/worker.js');
 console.log(JSON.stringify({diagnostic_only:true,scenario,fixture_rows:{history_events:scenario==='history'?10000:0,pets:3},provenance:{node:process.version,sqlite:process.versions.sqlite,platform:process.platform,worker_sha256:createHash('sha256').update(worker).digest('hex')},query_benchmark:{clock:'native_sqlite_frozen_literals',frozen_time:frozenTime,snapshot:'sqlite_backup_after_projection',all_results_match_clock_shim:true},projection:{clock:'fixture_js_date_callbacks',includes_clock_shim_overhead:true,...projection,d1_calls:calls.length,sql_statements:calls.reduce((n,c)=>n+c.sql_statements,0),binding_interval_union_ms:union(calls.map(c=>[c.start_ms,c.end_ms])),sqlite_execution_union_ms:union(sqlSpans),guarded_batches:guarded.length,observed_nonoverlap_call_depth:depth},modules,calls,families:[...families.values()].filter(f=>f.executions),plans},null,2));
}finally{f.close();}

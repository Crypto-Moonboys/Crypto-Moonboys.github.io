import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
const root=process.env.MOONPET_PERF_SOURCE_ROOT || process.cwd();
const { recoverPetJourneyAwards }=await import(pathToFileURL(path.join(root,'workers/moonboys-api/pets/journey-recovery.js')));
const queries=[];
await recoverPetJourneyAwards({prepare(sql){return {bind(...args){this.args=args;return this;},async all(){queries.push({sql,args:this.args});return {results:[]};}};}},'980301');
const query=queries.find(q=>q.sql.includes('SELECT eligible.*') && q.sql.includes('JOIN telegram_pet_weekly_journey_objectives o'));
assert.ok(query);
query.args[query.args.length-1]=1000;
if(process.env.MOONPET_QUERY_SNAPSHOT) { const {writeFileSync}=await import('node:fs');writeFileSync(process.env.MOONPET_QUERY_SNAPSHOT,query.sql); }
const f=await performanceFixture({pets:3});
try {
  const pets=f.sql.prepare('SELECT pet_id,season_key FROM telegram_pet_instances').all();
  f.sql.exec("UPDATE telegram_pet_season_slots SET created_at='2025-01-01 00:00:00',journey_clock='created_at'");
  const types={weekly_care:['feed',5],weekly_training:['train',3],weekly_run:['run_complete',3],weekly_boss_attempt:['boss_fought',1],weekly_check_in:['check_in',2]};
  const ev=f.sql.prepare("INSERT INTO telegram_pet_events(id,telegram_id,pet_id,season_key,event_type,event_key,day_key,status) VALUES(?,?,?,?,?,?,?,'accepted')");
  const obj=f.sql.prepare("INSERT INTO telegram_pet_weekly_journey_objectives(event_id,telegram_id,pet_id,season_key,qualification_week,objective_id,source_event_key,source_event_type,progress_value,status) VALUES(?,?,?,?,?,?,?,?,1,'accepted')");
  for(const pet of pets)for(let week=1;week<=12;week++)for(const [id,[type,target]] of Object.entries(types))for(let n=0;n<target;n++){
    const day=new Date(Date.UTC(2025,0,1+(week-1)*7+(id==='weekly_check_in'?n:0))).toISOString().slice(0,10);
    const key=pet.pet_id+':'+week+':'+id+':'+n;
    ev.run(key,f.owner,pet.pet_id,pet.season_key,type,key,day);
    // Some older periods deliberately retain unfinished source reconstruction.
    if(!(week%11===0 && id==='weekly_training' && n===0))obj.run(key,f.owner,pet.pet_id,pet.season_key,week,id,key,type);
  }
  const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+query.sql).all(...query.args).map(r=>r.detail);
  const stmt=f.sql.prepare(query.sql);stmt.all(...query.args);
  const samples=[];let rows;
  for(let i=0;i<3;i++){const at=performance.now();rows=stmt.all(...query.args);samples.push(performance.now()-at);}
  const parity=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  console.log(JSON.stringify({fixture:'3 pets, 12 ownership weeks, 504 accepted sources, 3 incomplete periods',production:false,samples_ms:samples,median_ms:[...samples].sort((a,b)=>a-b)[1],parity,rows,plan},null,2));
} finally {f.close();}

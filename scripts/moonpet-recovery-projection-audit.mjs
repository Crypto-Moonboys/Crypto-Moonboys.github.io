// Existing isolated real-SQLite sandbox; never contacts production.
import { performanceFixture, seedRecoveryEvidence } from './moonpet-state-performance-fixture.mjs';
import { seedPr3Recovery } from './moonpet-pr3-fixture.mjs';
import { writeFile } from 'node:fs/promises';
const scenario = process.argv[2] || 'warm';
const f = await performanceFixture({ root: process.argv[3] || process.cwd(),
  pets: ['three', 'archived'].includes(scenario) ? 3 : 1, warm: !['new','zero'].includes(scenario),
  delayMs: 0, serializedWrites: true });
try {
  if (scenario === 'zero') for (const t of ['telegram_pet_active_slots','telegram_pet_lifecycle_by_pet','telegram_pet_season_slots','telegram_pet_instances','telegram_pet_profiles']) f.sql.exec('DELETE FROM '+t);
  if (['heavy','archived','completed'].includes(scenario)) await seedPr3Recovery(f, {archived:scenario === 'archived'});
  if (['activity','settled','history'].includes(scenario)) seedRecoveryEvidence(f, scenario === 'history' ? 1000 : 5);
  if(scenario==='equipped'){
    for(const table of ['telegram_pet_profiles','telegram_pet_instances'])f.sql.exec("UPDATE "+table+" SET equipped_food='moon_kibble',equipped_toy='laser_ball',equipped_outfit='street_hoodie',equipped_armor='cardboard_armor',equipped_weapon='foam_claws',equipped_charm='lucky_charm'");
    seedRecoveryEvidence(f,5);
  }
  if (['settled','history','completed','equipped'].includes(scenario)) {
    // Settle identical saved sources before measuring an already-settled account.
    for (let i=0;i<(scenario === 'history' ? 52 : 3);i++) await f.state();
  }
  if (scenario === 'day_rollover') f.advance(86400000);
  if (scenario === 'week_rollover') f.advance(7*86400000);
  if (scenario === 'month_rollover') f.advance(Date.parse('2026-11-01T00:00:00Z')-Date.now());
  if (scenario === 'quarter_rollover') f.advance(Date.parse('2027-01-01T00:00:00Z')-Date.now());
  if (scenario === 'lifetime_rollover') f.advance(365*86400000);
  f.setDelayMs(Number(process.env.MOONPET_PERF_DELAY_MS || 100));
  const queries=[];
  let sqlMs=0;
  const executions=[];
  const prepare=f.sql.prepare.bind(f.sql);
  f.sql.prepare=query=>{
    const statement=prepare(query);
    for(const method of ['get','all','run']) {
      const execute=statement[method].bind(statement);
      statement[method]=(...args)=>{const at=performance.now();try{return execute(...args);}finally{const ms=performance.now()-at;sqlMs+=ms;executions.push({sql:query,ms});}};
    }
    return statement;
  };
  const proto=Object.getPrototypeOf(f.db.prepare('SELECT 1'));
  for(const method of ['first','all','run']) {
    const execute=proto[method];
    proto[method]=async function(...args){const at=performance.now();try{return await execute.apply(this,args);}finally{queries.push({at,ms:performance.now()-at,method,sql:this.query,args:this.args});}};
  }
  const batch=f.db.batch.bind(f.db);
  f.db.batch=async statements=>{const at=performance.now();try{return await batch(statements);}finally{queries.push({at,ms:performance.now()-at,method:'batch',sql:statements.map(s=>s.query),args:statements.map(s=>s.args)});}};
  const runs=[];
  for(let repeat=0;repeat<3;repeat++){
    queries.length=0;executions.length=0;sqlMs=0;
    const started=performance.now();
    const result=await f.measureHttp();
    runs.push({...result.report,sql_execution_ms:sqlMs,slow_sql:executions.sort((a,b)=>b.ms-a.ms).slice(0,8),queries:queries.map(q=>({...q,at:q.at-started}))});
    console.error(scenario+' '+repeat+': '+result.report.duration_ms+' ms / '+result.report.calls+' calls / '+result.report.statements+' SQL');
  }
  const candidates=runs.at(-1).queries.flatMap(q=>Array.isArray(q.sql)?q.sql.map((sql,i)=>({sql,args:q.args[i]})):[q]);
  const plans=[];
  for(const q of candidates){
    if(plans.length>=8)break;
    if(!q.sql.includes('AS missing_weekly')&&!q.sql.includes('SELECT eligible.*')&&!q.sql.includes('AS needed')&&!q.sql.includes('AS equipment')&&!q.sql.includes('SELECT q.'))continue;
    plans.push({sql:q.sql,plan:prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.args).map(row=>row.detail)});
  }
  const result={scenario,root:process.argv[3]||process.cwd(),delay_ms:Number(process.env.MOONPET_PERF_DELAY_MS||100),sqlite_pages:f.sql.prepare('PRAGMA page_count').get().page_count,runs,plans};
  if(process.argv[4]) await writeFile(process.argv[4],JSON.stringify(result,null,2)+'\n');
  else console.log(JSON.stringify(result));
} finally {f.close();}

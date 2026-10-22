import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
const f=await performanceFixture({pets:3,root:process.env.MOONPET_PERF_SOURCE_ROOT||process.cwd()});
try {
 let active=false;const owners=new Map(),counts=new Map();const prepare=f.db.prepare.bind(f.db);
 f.db.prepare=query=>{const stack=new Error().stack.split('\n');const frame=stack.find(l=>l.includes('/workers/moonboys-api/')&&!/state-timings|displayed-pet-scope/.test(l))||'unclassified';owners.set(query,frame.trim().replace(/file:\/.*?\/workers\//,'workers/'));return prepare(query);};
 const proto=Object.getPrototypeOf(f.db.prepare('SELECT 1'));
 for(const method of ['first','all','exec']){const original=proto[method];proto[method]=function(...args){const owner=this.query.includes('AS displayed_pet_authority')?'displayed_pet_authority_guard':owners.get(this.query)||'unclassified';if(active)counts.set(owner,(counts.get(owner)||0)+1);return original.apply(this,args);};}
 const stages=[];await f.hooks.buildPetMiniAppState(f.db,f.owner,'fixture-token',{timings:{async measure(stage,run){if(stage==='pet_state_projection')active=true;const start=f.db.statementCount;try{return await run();}finally{stages.push({stage,statements:f.db.statementCount-start});if(stage==='pet_state_projection')active=false;}}}});console.log(JSON.stringify({stages,statements_by_caller:[...counts].sort((a,b)=>b[1]-a[1])},null,2));
}finally{f.close();}

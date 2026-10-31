// Read-only local diagnosis of the seven historical MoonPet parity failures.
// Does not update baseline hashes, rewrite pet saves, or touch live D1.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=JSON.parse(readFileSync(path.join(root,'scripts/fixtures/moonpet-pr3-baseline-parity.json'),'utf8'));
const keys=['first_response_hash','first_persisted_hash','retry_response_hash','retry_persisted_hash'];
const scenarios=process.argv.slice(2).length?process.argv.slice(2):baseline.cases.map(c=>c.scenario);
let issues=0;
for(const scenario of scenarios){
 const expected=baseline.cases.find(c=>c.scenario===scenario);
 if(!expected){console.error('Unknown scenario:',scenario);process.exitCode=2;continue;}
 const raw=execFileSync(process.execPath,['scripts/moonpet-pr3-parity-case.mjs',scenario],{
  cwd:root,encoding:'utf8',maxBuffer:20*1024*1024,env:{...process.env,MOONPET_PERF_SOURCE_ROOT:root}});
 const actual=JSON.parse(raw);
 const mismatched=keys.filter(k=>actual[k]!==expected[k]);
 const first=actual.initial,retry=actual.retry;
 const changes=[];
 function compare(a,b,p){
  if(changes.length>=40)return;
  if(Object.is(a,b))return;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){
   if(JSON.stringify(a)!==JSON.stringify(b))changes.push(p);
   return;
  }
  if(Array.isArray(a)||Array.isArray(b)){
   if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length){changes.push(p+' [array length/type]');return;}
   for(let i=0;i<a.length;i++)compare(a[i],b[i],p+'['+i+']');
   return;
  }
  for(const k of new Set([...Object.keys(a),...Object.keys(b)]))compare(a[k],b[k],p?p+'.'+k:k);
 }
 compare(first.response,retry.response,'response');
 compare(first.persisted,retry.persisted,'persisted');
 const output={scenario,hash_mismatches:mismatched,first_vs_retry_different_paths:changes,
  first_vs_retry_hash_equal:{response:actual.first_response_hash===actual.retry_response_hash,
   persisted:actual.first_persisted_hash===actual.retry_persisted_hash},
  d1_calls:{first:actual.first.calls,retry:actual.second.calls},
  sql_statements:{first:actual.first.statements,retry:actual.second.statements}};
 console.log(JSON.stringify(output));
 if(mismatched.length)issues++;
}
console.log(JSON.stringify({diagnosis:'historical-baseline-compatibility',scenarios:scenarios.length,mismatched_scenarios:issues,
 note:'Reports fixture field paths and summary counts only; compare against the historical source before changing expected hashes.'}));

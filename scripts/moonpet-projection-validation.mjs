// Reuses #1611's real SQLite + signed complete HTTP harness; never remote D1.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const exec=promisify(execFile), baseline=process.argv[2];
if(!baseline)throw Error('Usage: node scripts/moonpet-projection-validation.mjs BASELINE_ROOT OUTPUT.json');
const profiles=JSON.parse(process.env.MOONPET_DIAGNOSTIC_PROFILES || '[{"delay":25,"sampled":true,"scenarios":["warm","three","equipped"]},{"delay":100,"sampled":true,"scenarios":["warm","three","equipped"]},{"delay":100,"sampled":false,"scenarios":["warm","three","equipped"]}]');
const pairs=[];
const baselineCommit=(await exec('git',['-c','safe.directory='+baseline.replaceAll('\\','/'),'rev-parse','HEAD'],{cwd:baseline})).stdout.trim();
const output=process.argv[3]||'moonpet-projection-validation.json';
for(const profile of profiles)for(const scenario of profile.scenarios)for(let repeat=0;repeat<3;repeat++){
  const pair={profile,scenario,repeat};
  for(const revision of repeat%2?['changed','baseline']:['baseline','changed']){
    const {stdout}=await exec(process.execPath,['scripts/moonpet-pr4-parity-case.mjs',scenario,revision==='baseline'?baseline:process.cwd()],{
      maxBuffer:20_000_000,env:{...process.env,MOONPET_PERF_DELAY_MS:String(profile.delay),MOONPET_PERF_PROJECTION_DIAGNOSTICS:profile.sampled?'1':'0',MOONPET_PERF_SERIAL_WRITES:'1',MOONPET_PERF_ALL_TABLES:'1'}});
    const run=JSON.parse(stdout.split('\n').find(l=>l.startsWith('{"scenario":')));
    pair[revision]=run;
  }
  for(const key of ['first_response_hash','first_persisted_hash','retry_response_hash','retry_persisted_hash'])assert.equal(pair.changed[key],pair.baseline[key],scenario+' '+key);
  for(const request of ['first','second']){
    const a=pair.baseline[request],b=pair.changed[request];
    for(const key of ['calls','statements'])assert.equal(b[key],a[key],scenario+' '+request+' '+key);
    if(profile.sampled){
      assert.ok(b.projection_trace, 'sample actually collected');
      const stage=b.stages.find(s=>s.stage==='pet_state_projection');
      assert.equal(b.projection_trace.calls.length,stage.d1_calls);
      assert.equal(b.projection_trace.calls.reduce((n,c)=>n+c.sql_statements,0),stage.sql_statements);
      assert.equal(b.projection_trace.dropped_calls,0);assert.equal(b.projection_trace.dropped_spans,0);
    }else assert.equal(b.projection_trace,undefined);
    // Keep one complete measured trace per scenario/profile, compact other proof.
    if(repeat!==0)delete b.projection_trace;
  }
  pairs.push(pair);
  await writeFile(output,JSON.stringify({in_progress:true,baseline_commit:baselineCommit,pairs},null,2)+'\n');
  console.error(JSON.stringify({delay:profile.delay,sampled:profile.sampled,scenario,repeat,before:pair.baseline.first.duration_ms,after:pair.changed.first.duration_ms}));
}
const files=['workers/moonboys-api/worker.js','workers/moonboys-api/pets/state-timings.js','workers/moonboys-api/pets/projection-diagnostics.js'];
const hashes=async root=>Object.fromEntries(await Promise.all(files.map(async file=>[file,await readFile(path.join(root,file)).then(b=>createHash('sha256').update(b).digest('hex')).catch(e=>{if(e.code==='ENOENT')return null;throw e;})])));
await writeFile(output,JSON.stringify({baseline_commit:baselineCommit,baseline_sha256:await hashes(baseline),changed_sha256:await hashes(process.cwd()),description:'Sandbox only; 3 alternating fresh-process pairs per profile/scenario. Complete signed responses and every application table compared, challenge tokens normalized. No call/SQL increase allowed.',pairs},null,2)+'\n');

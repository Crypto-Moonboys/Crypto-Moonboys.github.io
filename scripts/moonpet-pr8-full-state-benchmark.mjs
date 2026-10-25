// Same harness loads each revision; signed authentication and complete body parsing
// are timed. Each fixture has one serialized write queue, including its delay.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const exec = promisify(execFile);
const baseline = process.argv[2];
if (!baseline) throw Error('Usage: node scripts/moonpet-pr8-full-state-benchmark.mjs BASELINE_ROOT [OUTPUT_JSON]');
const delay = process.env.MOONPET_PERF_DELAY_MS || '100';
const scenarios = (process.env.MOONPET_PERF_SCENARIOS || 'zero,new,warm,three,heavy,archived,day_rollover,week_rollover,concurrent,failed').split(',');
const keys = ['first_response_hash','first_persisted_hash','retry_response_hash','retry_persisted_hash'];
const results = [];
for (const scenario of scenarios) {
  const runs = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    const pair = {};
    // Alternate execution order to avoid consistently favouring a warm host.
    for (const revision of repeat % 2 ? ['changed','baseline'] : ['baseline','changed']) {
      const { stdout } = await exec(process.execPath, ['scripts/moonpet-pr4-parity-case.mjs',scenario,
        revision === 'baseline' ? baseline : process.cwd()], {
        maxBuffer:20_000_000, env:{...process.env, MOONPET_PERF_DELAY_MS:delay,
          MOONPET_PERF_SERIAL_WRITES:'1',MOONPET_PERF_ALL_TABLES:'1'},
      });
      pair[revision] = JSON.parse(stdout.trim().split('\n').find(line=>line.startsWith('{"scenario":')));
    }
    for (const key of keys) assert.equal(pair.changed[key],pair.baseline[key],scenario+' '+key);
    if (process.env.MOONPET_PERF_PROJECTION_DIAGNOSTICS === '1') for (const request of ['first','second']) {
      for (const key of ['calls','statements']) assert.equal(pair.changed[request][key],pair.baseline[request][key],scenario+' '+request+' '+key);
      const trace = pair.changed[request].projection_trace;
      if (trace) {
        const stage = pair.changed[request].stages.find(s=>s.stage==='pet_state_projection');
        assert.equal(trace.calls.length,stage.d1_calls);
        assert.equal(trace.calls.reduce((n,c)=>n+c.sql_statements,0),stage.sql_statements);
        assert.equal(trace.dropped_calls,0);assert.equal(trace.dropped_spans,0);
        pair.changed[request].projection_trace_summary = { sampled:true, outcome:trace.outcome,
          d1_calls:trace.calls.length,sql_statements:stage.sql_statements,duration_ms:trace.duration_ms };
        delete pair.changed[request].projection_trace;
      }
    }
    if(runs.length)for(const key of keys)assert.equal(pair.baseline[key],runs[0].baseline[key],scenario+' repeated '+key);
    runs.push(pair);
  }
  const summary = {};
  for (const revision of ['baseline','changed']) for (const request of ['first','second']) {
    const times = runs.map(pair=>pair[revision][request].duration_ms).sort((a,b)=>a-b);
    summary[revision+'_'+request] = {p50:times[1],min:times[0],max:times[2]};
  }
  results.push({scenario,summary,runs});
  console.error(scenario+': '+JSON.stringify(summary));
}
const revision = async cwd => (await exec('git',['-c','safe.directory='+cwd.replaceAll('\\','/'),'rev-parse','HEAD'],{cwd})).stdout.trim();
const sourceHashes = async root => Object.fromEntries(await Promise.all(
  ['workers/moonboys-api/worker.js','workers/moonboys-api/pets/onboarding.js','workers/moonboys-api/pets/recovery-presence.js',
    'workers/moonboys-api/pets/inventory-cutover.js','workers/moonboys-api/pets/journey-recovery.js',
    'workers/moonboys-api/pets/combat-projection.js','workers/moonboys-api/pets/species-lifecycle.js',
    'workers/moonboys-api/pets/state-timings.js','workers/moonboys-api/pets/projection-diagnostics.js']
    .map(async file=>[file,await readFile(path.join(root,file)).then(content=>createHash('sha256').update(content).digest('hex')).catch(error=>{if(error.code==='ENOENT')return null;throw error;})])));
const evidence = {baseline,changed:process.cwd(),baseline_commit:await revision(baseline),changed_commit:process.env.MOONPET_PERF_CHANGED_REVISION || null,changed_base_commit:await revision(process.cwd()),node_version:process.version,delay_ms:Number(delay),serialized_writes:true,repeats:3,
  baseline_source_sha256:await sourceHashes(baseline),changed_source_sha256:await sourceHashes(process.cwd()),
  clock:'2026-10-21T12:00:00.000Z',description:'Local real SQLite, signed Worker fetch through complete response.json(); not production latency.',results};
if(process.argv[3]) await writeFile(process.argv[3],JSON.stringify(evidence,null,process.env.MOONPET_PERF_PROJECTION_DIAGNOSTICS === '1' ? 0 : 2)+'\n');
else console.log(JSON.stringify(evidence,null,2));

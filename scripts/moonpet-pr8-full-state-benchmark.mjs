// Same harness loads each revision; signed authentication and complete body parsing
// are timed. Each fixture has one serialized write queue, including its delay.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
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
const evidence = {baseline,changed:process.cwd(),delay_ms:Number(delay),serialized_writes:true,repeats:3,
  clock:'2026-10-21T12:00:00.000Z',description:'Local real SQLite, signed Worker fetch through complete response.json(); not production latency.',results};
if(process.argv[3]) await writeFile(process.argv[3],JSON.stringify(evidence,null,2)+'\n');
else console.log(JSON.stringify(evidence,null,2));

// Offline, privacy-preserving MoonPet recovery profile summarizer.
// Usage: node scripts/moonpet-recovery-profile.mjs path/to/worker.jsonl
// Never exports request IDs, user data, SQL text, errors or raw log lines.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const allowed = new Set(['state_recovery','daily_settlement','weekly_settlement',
  'boss_victory_recovery','journey_source_recovery',
  'daily_journey_award_recovery','weekly_journey_award_recovery',
  'pet_state_projection','d1_bootstrap','total']);
const modes = new Set(['full','profile','core','live','missions']);
export function summarizeMoonpetRecovery(input) {
  const groups = new Map();
  // Keep request IDs in memory only. A completed stage does not mean that
  // the entire request completed; total is the terminal authority.
  const requests = new Map();
  let accepted = 0, ignored = 0, invalid = 0, incomplete = 0, ambiguous = 0;
  for (const line of String(input).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch { invalid++; continue; }
    if (!record || record.event !== 'moonpet_state_timing') { ignored++; continue; }
    if (!allowed.has(record.stage) || !modes.has(record.mode) ||
        !['completed','failed','rejected'].includes(record.outcome) ||
        typeof record.request_id !== 'string' || !record.request_id ||
        typeof record.duration_ms !== 'number' || !Number.isFinite(record.duration_ms) ||
        record.duration_ms < 0 || record.duration_ms > 3600000) { invalid++; continue; }
    const key = record.request_id;
    const request = requests.get(key) || { mode: record.mode, stages: [], totals: [], conflicted: false };
    if (request.mode !== record.mode) request.conflicted = true;
    if (record.stage === 'total') request.totals.push(record);
    else request.stages.push(record);
    requests.set(key,request);
    accepted++;
  }
  function add(record, finalOutcome) {
    const key = [record.mode,record.stage,finalOutcome].join('/');
    const row = groups.get(key) || { mode:record.mode,stage:record.stage,outcome:finalOutcome,
      durations:[],sql_statements:[],d1_calls:[] };
    row.durations.push(record.duration_ms);
    if (Number.isInteger(record.sql_statements) && record.sql_statements >= 0 && record.sql_statements <= 100000)
      row.sql_statements.push(record.sql_statements);
    if (Number.isInteger(record.d1_calls) && record.d1_calls >= 0 && record.d1_calls <= 100000)
      row.d1_calls.push(record.d1_calls);
    groups.set(key,row);
  }
  for (const request of requests.values()) {
    if (request.conflicted || request.totals.length !== 1) {
      // A partial capture or duplicate terminal cannot be called successful.
      if (request.conflicted || request.totals.length > 1) ambiguous++;
      else incomplete++;
      continue;
    }
    const final = request.totals[0].outcome;
    add(request.totals[0],final);
    for (const record of request.stages) add(record,final);
  }
  const quantile = (numbers, p) => {
    if (!numbers.length) return null;
    const sorted = numbers.slice().sort((a,b)=>a-b);
    return Math.round(sorted[Math.ceil(p*sorted.length)-1]*100)/100;
  };
  return {
    events: { accepted,ignored,invalid,incomplete,ambiguous },
    groups: [...groups.values()].map(row=>({
      mode:row.mode,stage:row.stage,outcome:row.outcome,count:row.durations.length,
      p50_ms:quantile(row.durations,.5),p95_ms:quantile(row.durations,.95),
      max_ms:quantile(row.durations,1),
      median_sql_statements:quantile(row.sql_statements,.5),
      median_d1_calls:quantile(row.d1_calls,.5),
    })).sort((a,b)=>a.mode.localeCompare(b.mode)||a.stage.localeCompare(b.stage)||a.outcome.localeCompare(b.outcome))
  };
}
const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const filename = process.argv[2];
  if (!filename) { console.error('Usage: node scripts/moonpet-recovery-profile.mjs <worker-jsonl-file>'); process.exitCode=2; }
  else {
    try {
      const result = summarizeMoonpetRecovery(fs.readFileSync(filename,'utf8'));
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
    } catch (error) {
      console.error('Could not read MoonPet log input.');
      process.exitCode=1;
    }
  }
}

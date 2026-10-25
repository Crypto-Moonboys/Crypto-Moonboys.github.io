import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length*p)-1)] : null;
};
const round = n => Math.round(n*100)/100;
export function unionDuration(intervals) {
  let end = -Infinity, total = 0;
  for (const [a,b] of intervals.filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b) && b>=a).sort((a,b)=>a[0]-b[0])) {
    total += Math.max(0,b-Math.max(a,end)); end = Math.max(end,b);
  }
  return round(total);
}
export function extractTraces(text) {
  const traces = new Map();
  function visit(value) {
    if (typeof value === 'string') { try { visit(JSON.parse(value)); } catch {} return; }
    if (!value || typeof value !== 'object') return;
    if (value.event === 'moonpet_projection_trace' && value.version === 1 && Array.isArray(value.calls) && Array.isArray(value.spans)) {
      // Wrangler can repeat an event; never count the same request twice.
      traces.set(value.request_id, value); return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else { if (value.logs) visit(value.logs); if (value.message) visit(value.message); }
  }
  try { visit(JSON.parse(text.replace(/^\uFEFF/,''))); } catch {
    // Wrangler JSON output can be multiple pretty-printed objects, with a CLI
    // banner mixed in. Parse complete objects, not individual physical lines.
    let start=-1, depth=0, quoted=false, escaped=false;
    for (let i=0;i<text.length;i++) {
      const c=text[i];
      if (start<0) { if(c==='{') {start=i;depth=1;} continue; }
      if (quoted) { if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue; }
      if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}' && --depth===0) {visit(text.slice(start,i+1));start=-1;}
    }
  }
  return [...traces.values()];
}
export function compareTraces(traces) {
  const groups = new Map();
  for (const trace of traces) {
    const calls = trace.calls.length, statements = trace.calls.reduce((n,c)=>n+c.sql_statements,0);
    // Do not pool failed/truncated or different-count workloads with healthy ones.
    const key = [trace.colo, trace.outcome, calls, statements, Boolean(trace.dropped_calls || trace.dropped_spans)].join('/');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(trace);
  }
  return [...groups].map(([group, samples]) => {
    const rows = new Map(), blockers = {}, paths = [];
    for (const t of samples) {
      const spans = new Map();
      for (const span of t.spans) {
        // Sequential occurrences (e.g. active/recoverable activity) aggregate per request.
        if (!spans.has(span.operation)) spans.set(span.operation, []);
        spans.get(span.operation).push(span);
      }
      const endOf = id => Math.max(0,...(spans.get(id)||[]).map(s=>s.end_ms||0),...t.calls.filter(c=>c.operations?.[id]).map(c=>c.end_ms||0));
      const path=[], visited=new Set();
      const walk = id => {
        if (visited.has(id)) return; visited.add(id);
        const own = (spans.get(id)||[]).sort((a,b)=>b.end_ms-a.end_ms)[0];
        const candidates=(own?.dependencies||[]).filter(d=>(spans.has(d)||t.calls.some(c=>c.operations?.[d])) && endOf(d)<=endOf(id)).sort((a,b)=>endOf(b)-endOf(a));
        if(candidates[0])walk(candidates[0]);
        const start = own?.start_ms ?? Math.min(...t.calls.filter(c=>c.operations?.[id]).map(c=>c.start_ms));
        path.push({operation:id,start_ms:start,end_ms:endOf(id),post_dependency_tail_ms:round(Math.max(0,endOf(id)-Math.max(start,endOf(candidates[0]))))});
      };
      const last=[...spans.keys()].filter(id=>id!=='presentation_join').sort((a,b)=>endOf(b)-endOf(a))[0];
      if(last)walk(last);
      paths.push({request_id:t.request_id,operations:path,unattributed_ms:round(Math.max(0,t.duration_ms-path.reduce((n,s)=>n+s.post_dependency_tail_ms,0)))});
      const join = spans.get('presentation_join')?.[0];
      const ranked = (join?.dependencies||[]).map(id=>({id,end:endOf(id)})).sort((a,b)=>b.end-a.end);
      if (ranked[0]) blockers[ranked[0].id] = (blockers[ranked[0].id]||0)+1;
      const ids = new Set([...spans.keys(), ...t.calls.map(c=>c.operation), ...t.calls.flatMap(c=>Object.keys(c.operations||{}))]);
      for (const id of ids) {
        const opSpans = spans.get(id)||[], direct = t.calls.filter(c=>c.operation===id);
        const touching = t.calls.filter(c=>c.operations?.[id]);
        const awaitUnion = unionDuration(direct.map(c=>[c.start_ms,c.end_ms]));
        const spanUnion = unionDuration(opSpans.map(s=>[s.start_ms,s.end_ms]));
        const dbInside = unionDuration(opSpans.flatMap(s=>t.calls.map(c=>[Math.max(s.start_ms,c.start_ms),Math.min(s.end_ms,c.end_ms)])));
        const dependencyWait = unionDuration(opSpans.flatMap(s=>(s.dependencies||[]).flatMap(id=>(spans.get(id)||[]).map(d=>[Math.max(s.start_ms,d.start_ms),Math.min(s.end_ms,d.end_ms)]))));
        const row = { span_ms: opSpans.length ? spanUnion : null,
          start_ms:opSpans.length?Math.min(...opSpans.map(s=>s.start_ms)):null,
          end_ms:opSpans.length?Math.max(...opSpans.map(s=>s.end_ms)):null,
          d1_calls: direct.length, participating_calls: touching.length,
          sql_statements: touching.reduce((n,c)=>n+(c.operations[id]||0),0),
          submitted_sql_statements:direct.reduce((n,c)=>n+c.sql_statements,0),
          max_batch_size:direct.length?Math.max(...direct.map(c=>c.batch_size)):null,
          sql_timing_statements:direct.reduce((n,c)=>n+(c.sql_timing_statements||0),0),
          binding_await_union_ms: awaitUnion,
          participating_binding_await_union_ms:unionDuration(touching.map(c=>[c.start_ms,c.end_ms])),
          dependency_wait_ms:dependencyWait,
          critical_path_tail_ms:path.find(s=>s.operation===id)?.post_dependency_tail_ms||0,
          // This is wall time, NOT CPU: includes dependency waits/queue/scheduling.
          outside_any_d1_await_ms: opSpans.length ? round(Math.max(0,spanUnion-dbInside)) : null,
          sql_reported_ms: direct.length && direct.every(c=>Number.isFinite(c.sql_reported_ms)) ? round(direct.reduce((n,c)=>n+c.sql_reported_ms,0)) : null,
          join_blocking_tail_ms: ranked[0]?.id===id ? round(Math.max(0,ranked[0].end-(ranked[1]?.end||0))) : 0 };
        if (!rows.has(id)) rows.set(id,[]); rows.get(id).push(row);
      }
    }
    const summary = values => ({p50:percentile(values,0.5),p95:percentile(values,0.95)});
    return { group, samples:samples.length,
      d1_calls:samples[0].calls.length,
      sql_statements:samples[0].calls.reduce((n,c)=>n+c.sql_statements,0),
      observed_critical_path_ms:summary(samples.map(t=>t.duration_ms)),
      d1_await_union_ms:summary(samples.map(t=>unionDuration(t.calls.map(c=>[c.start_ms,c.end_ms])))),
      presentation_join_last_blockers:blockers,
      observed_dependency_paths:paths,
      operations:[...rows].sort(([a],[b])=>a.localeCompare(b)).map(([operation,values])=>({operation,samples:values.length,
        ...Object.fromEntries(Object.keys(values[0]).map(key=>[key,summary(values.map(v=>v[key]))]))}))
        .sort((a,b)=>(b.critical_path_tail_ms.p95||0)-(a.critical_path_tail_ms.p95||0)
          || (b.span_ms.p95||0)-(a.span_ms.p95||0) || a.operation.localeCompare(b.operation)) };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error('Usage: node scripts/moonpet-projection-compare.mjs LOG.jsonl [MORE.jsonl ...]');
  const traces = extractTraces((await Promise.all(process.argv.slice(2).map(file=>readFile(file,'utf8')))).join('\n'));
  if (!traces.length) throw Error('No projection traces found (sampling disabled, no sampled full request, or wrong log file).');
  console.log(JSON.stringify({note:'Critical path is observed projection wall time, not summed overlapping spans. Binding-await remainder is not proven network time. Missing SQL metadata is null. p95 is nearest rank; small samples are descriptive only.',groups:compareTraces(traces)},null,2));
}

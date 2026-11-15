#!/usr/bin/env node
/**
 * Isolated virtual Moonpet year. NEVER connects to production D1.
 *
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=365
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=90
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=30 --strategy=extract
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid3
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid4
 *
 * `legendaryVerified:false` is a valid diagnostic and never treated as PASS.
 */
import { mock } from 'node:test';
import { simulateWorkerCampaign,WORKER_YEAR_START } from './moonpet-worker-year-simulator.mjs';

const args=process.argv.slice(2);
const arg=args.find(entry=>entry.startsWith('--days='));
const strategyArg=args.find(entry=>entry.startsWith('--strategy='));
const strategyName=strategyArg?.slice('--strategy='.length)||'boss';
const strategy=strategyName==='extract'?'extract_at_depth7':strategyName;
if(args.some(entry=>!entry.startsWith('--days=')&&!entry.startsWith('--strategy='))
  ||args.filter(entry=>entry.startsWith('--days=')).length>1
  ||args.filter(entry=>entry.startsWith('--strategy=')).length>1
  ||(strategyArg&&!['extract','boss','hybrid3','hybrid4'].includes(strategyArg.slice('--strategy='.length)))){
  throw new Error('usage: node scripts/run-moonpet-worker-year-simulation.mjs --days=365 [--strategy=boss|extract|hybrid3|hybrid4]');
}
const days=arg?Number(arg.slice('--days='.length)):7;
if(!Number.isInteger(days)||days<1||days>365)throw new Error('days must be an integer between 1 and 365');
mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
try{
  const result=await simulateWorkerCampaign({
    days,startAt:WORKER_YEAR_START,owner:'moonpet-isolated-year-audit',runExitPolicy:strategy,
    setTime:at=>mock.timers.setTime(at),
    onCheckpoint:point=>console.log('MOONPET_WORKER_CHECKPOINT',JSON.stringify(point)),
  });
  console.log('MOONPET_WORKER_YEAR_FINAL',JSON.stringify(result));
  if(days===365&&!result.legendaryVerified){
    console.log('MOONPET_LEGENDARY_NOT_VERIFIED',JSON.stringify({blockers:result.blockers}));
  }
}catch(error){
  process.exitCode=1;
  console.error('MOONPET_WORKER_YEAR_ERROR',error?.stack||String(error));
}finally{mock.timers.reset();}

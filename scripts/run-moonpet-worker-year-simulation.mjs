#!/usr/bin/env node
/**
 * Isolated virtual Moonpet year. NEVER connects to production D1.
 *
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=365
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=90
 *
 * `legendaryVerified:false` is a valid diagnostic and never treated as PASS.
 */
import { mock } from 'node:test';
import { simulateWorkerCampaign,WORKER_YEAR_START } from './moonpet-worker-year-simulator.mjs';

const args=process.argv.slice(2);
const arg=args.find(entry=>entry.startsWith('--days='));
if(args.some(entry=>!entry.startsWith('--days='))||args.filter(entry=>entry.startsWith('--days=')).length>1){
  throw new Error('usage: node scripts/run-moonpet-worker-year-simulation.mjs --days=365');
}
const days=arg?Number(arg.slice('--days='.length)):7;
if(!Number.isInteger(days)||days<1||days>365)throw new Error('days must be an integer between 1 and 365');
mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
try{
  const result=await simulateWorkerCampaign({
    days,startAt:WORKER_YEAR_START,owner:'moonpet-isolated-year-audit',
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

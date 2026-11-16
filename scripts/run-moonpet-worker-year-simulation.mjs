#!/usr/bin/env node
/**
 * Isolated virtual Moonpet year. NEVER connects to production D1.
 *
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=365
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=90
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=30 --strategy=extract
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid3
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid4
 * node scripts/run-moonpet-worker-year-simulation.mjs --days=30 --strategy=hybrid3 --xp=timed_explore_best_job
 *
 * `legendaryVerified:false` is a valid diagnostic and never treated as PASS.
 */
import { mock } from 'node:test';
import { simulateWorkerCampaign,WORKER_YEAR_START } from './moonpet-worker-year-simulator.mjs';

const args=process.argv.slice(2);
const arg=args.find(entry=>entry.startsWith('--days='));
const strategyArg=args.find(entry=>entry.startsWith('--strategy='));
const xpArg=args.find(entry=>entry.startsWith('--xp='));
const xpPolicy=xpArg?.slice('--xp='.length)||'baseline';
const strategyName=strategyArg?.slice('--strategy='.length)||'boss';
const strategy=strategyName==='extract'?'extract_at_depth7':strategyName;
if(args.some(entry=>!entry.startsWith('--days=')&&!entry.startsWith('--strategy=')&&!entry.startsWith('--xp='))
  ||args.filter(entry=>entry.startsWith('--days=')).length>1
  ||args.filter(entry=>entry.startsWith('--strategy=')).length>1
  ||args.filter(entry=>entry.startsWith('--xp=')).length>1
  ||!['baseline','timed_train','timed_explore','best_job','timed_train_best_job','timed_explore_best_job'].includes(xpPolicy)
  ||(strategyArg&&!['extract','boss','hybrid3','hybrid4'].includes(strategyArg.slice('--strategy='.length)))){
  throw new Error('usage: node scripts/run-moonpet-worker-year-simulation.mjs --days=365 [--strategy=boss|extract|hybrid3|hybrid4] [--xp=baseline|timed_train|timed_explore|best_job|timed_train_best_job|timed_explore_best_job]');
}
const days=arg?Number(arg.slice('--days='.length)):7;
if(!Number.isInteger(days)||days<1||days>365)throw new Error('days must be an integer between 1 and 365');
mock.timers.enable({apis:['Date'],now:WORKER_YEAR_START});
try{
  const result=await simulateWorkerCampaign({
    days,startAt:WORKER_YEAR_START,owner:'moonpet-isolated-year-audit',runExitPolicy:strategy,xpPolicy,
    setTime:at=>mock.timers.setTime(at),
    onCheckpoint:point=>console.log('MOONPET_WORKER_CHECKPOINT',JSON.stringify(point)),
    onWeeklyProgress:point=>console.log('MOONPET_WEEKLY_PROGRESS',JSON.stringify(point)),
  });
  console.log('MOONPET_WORKER_YEAR_FINAL',JSON.stringify(result));
  if(days===365&&!result.legendaryVerified){
    console.log('MOONPET_LEGENDARY_NOT_VERIFIED',JSON.stringify({blockers:result.blockers}));
  }
}catch(error){
  process.exitCode=1;
  console.error('MOONPET_WORKER_YEAR_ERROR',error?.stack||String(error));
}finally{mock.timers.reset();}

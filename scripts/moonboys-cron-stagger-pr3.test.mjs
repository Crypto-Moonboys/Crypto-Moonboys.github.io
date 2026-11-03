import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOONBOYS_CRON, phase5CronTasks
} from '../workers/moonboys-api/scheduled/phase5-cron-plan.js';

const cfg=readFileSync(new URL('../workers/moonboys-api/wrangler.toml',import.meta.url),'utf8');
const wrapper=readFileSync(new URL('../workers/moonboys-api/worker-phase5-final.js',import.meta.url),'utf8');
const enabled={TAG_RUN_ENABLED:'true',TAG_RUN_V2_OBSERVATION_ENABLED:'true',
  TAG_RUN_WEEKLY_REWARDS_ENABLED:'false',TAG_RUN_V2_POOL_ENABLED:'false',
  TAG_RUN_V2_DRAWS_ENABLED:'false',TAG_RUN_V2_PAYOUTS_ENABLED:'false'};
const event=(cron,utc)=>({cron,scheduledTime:Date.parse(utc)});
const only = (tasks,name) => {
  for(const [k,v] of Object.entries(tasks)) assert.equal(v,k===name,k);
};

test('configured and wrapper-owned cron strings stay in parity',()=>{
  for(const c of Object.values(MOONBOYS_CRON)) {
    assert(cfg.includes(JSON.stringify(c)),c);
  }
  assert.deepEqual(Object.values(MOONBOYS_CRON),[
    '*/5 * * * *','0 9 * * *','3 */4 * * *','12 0 * * *'
  ]);
  assert(!cfg.includes('"0 */4 * * *"'));
  assert(!cfg.includes('"10 0 * * *"'));
  assert.match(wrapper,/phase5CronTasks\(event, env\)/);
  assert.match(wrapper,/baseWorker\.scheduled\(event, env, ctx\)/,
    'original 5-minute timed events and daily digest must keep their dispatcher');
});

test('5-minute tick drains rank notices but only every other tick cleans expired GPS sessions',()=>{
  const at5=phase5CronTasks(event(MOONBOYS_CRON.timed,'2026-11-03T00:05:00Z'),enabled);
  assert.equal(at5.rankNotices,true);
  assert.equal(at5.maintenance,false);
  assert.equal(at5.participation,false);
  const at10=phase5CronTasks(event(MOONBOYS_CRON.timed,'2026-11-03T00:10:00Z'),enabled);
  assert.equal(at10.maintenance,true);
  assert.equal(at10.rankNotices,true);
  assert.equal(at10.bulletin,false);
  assert.equal(at10.participation,false);
  const jitter=phase5CronTasks({cron:MOONBOYS_CRON.timed,scheduledTime:NaN},enabled);
  assert.equal(jitter.maintenance,true,'missing scheduledTime must never strand cleanup');
});

test('four-hour bulletin is isolated from timed maintenance and rank queue',()=>{
  const due=phase5CronTasks(event(MOONBOYS_CRON.bulletin,'2026-11-03T04:03:00Z'),enabled);
  only(due,'bulletin');
  const shifted=phase5CronTasks(event(MOONBOYS_CRON.timed,'2026-11-03T04:05:00Z'),enabled);
  assert.equal(shifted.bulletin,false);
});

test('UTC participation capture moves only two minutes, keeps calendar authority and payout gates',()=>{
  const capture=phase5CronTasks(event(MOONBOYS_CRON.participation,'2026-11-04T00:12:00Z'),enabled);
  only(capture,'participation');
  assert.equal(phase5CronTasks(event(MOONBOYS_CRON.timed,'2026-11-04T00:10:00Z'),enabled).participation,false);
  assert(!wrapper.includes("event?.cron === '10 0 * * *'"));
  assert.match(wrapper,/saveYesterdayParticipation\(env\)/);
  assert(!wrapper.includes('push_transaction'));
  assert.equal(enabled.TAG_RUN_V2_PAYOUTS_ENABLED,'false');
});

test('09:00 digest remains owned by base Worker; no duplicate wrapper tasks',()=>{
  only(phase5CronTasks(event(MOONBOYS_CRON.digest,'2026-11-03T09:00:00Z'),enabled),'nothing');
});

test('disabled flags block outbound TAG RUN and V2 work without affecting cleanups',()=>{
  const off={...enabled,TAG_RUN_ENABLED:'false',TAG_RUN_V2_OBSERVATION_ENABLED:'false'};
  const at10=phase5CronTasks(event(MOONBOYS_CRON.timed,'2026-11-03T00:10:00Z'),off);
  only(at10,'maintenance');
  only(phase5CronTasks(event(MOONBOYS_CRON.bulletin,'2026-11-03T04:03:00Z'),off),'nothing');
  only(phase5CronTasks(event(MOONBOYS_CRON.participation,'2026-11-04T00:12:00Z'),off),'nothing');
});

test('review-only draft is checked once daily only with both gates; never pays tokens',()=>{
  const on={...enabled,TAG_RUN_WEEKLY_REWARDS_ENABLED:'true'};
  const at5=phase5CronTasks(event(MOONBOYS_CRON.timed,'2026-11-02T00:10:00Z'),on);
  assert.equal(at5.weeklyDraft,false);
  const at12=phase5CronTasks(event(MOONBOYS_CRON.participation,'2026-11-02T00:12:00Z'),on);
  assert.equal(at12.weeklyDraft,true);
  assert.equal(at12.participation,true);
  assert.match(wrapper,/draftTagRunWeeklyRewards\(env\)/);
});

test('ten-minute cleanup schedule is based on scheduled UTC time, not delayed invocation time',()=>{
  for(let minute=0;minute<60;minute+=5){
    const t=new Date(Date.UTC(2026,10,3,23,minute)).toISOString();
    const task=phase5CronTasks(event(MOONBOYS_CRON.timed,t),enabled);
    assert.equal(task.maintenance,minute%10===0,t);
  }
  assert.equal(phase5CronTasks(event(MOONBOYS_CRON.timed,'2026-11-04T00:00:00Z'),enabled).maintenance,true);
  const noMetadata=phase5CronTasks({cron:MOONBOYS_CRON.timed},enabled);
  assert.equal(noMetadata.maintenance,true);
});

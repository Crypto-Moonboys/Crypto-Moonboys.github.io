import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_TICKET_BPS, LEADERBOARD_BONUS_BPS, MAX_LEADERBOARD_BONUS_BPS,
  MAX_RANKED_POINTS_PER_DAY, leaderboardPeriods, leaderboardStandings,
  currentLeaderboardCandidates
} from '../workers/moonboys-api/tag-run/v2-leaderboard.js';
import { MAX_POINTS_PER_DAY, previewCommunityDraw, assetKey } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { LEGACY_DRAW_RULES, replayDraw } from './tag-run-v2-draw-workflow.mjs';

const row = (day, id, points, blocked = 0) => ({
  day_key: day, telegram_id: String(id), earned_weight: points,
  spent_historical_weight: 0, blocked
});

test('leaderboard periods are UTC daily, Monday weekly, calendar monthly and quarterly', () => {
  const periods = leaderboardPeriods('2026-11-30');
  assert.deepEqual(periods.daily, {
    start: '2026-11-30', end: '2026-11-30', closes: true, label: '2026-11-30'
  });
  assert.equal(periods.weekly.start, '2026-11-30');
  assert.equal(periods.weekly.closes, false);
  assert.equal(periods.monthly.start, '2026-11-01');
  assert.equal(periods.monthly.closes, true);
  assert.equal(periods.seasonal.start, '2026-10-01');
  assert.equal(periods.seasonal.closes, false);
  const quarter = leaderboardPeriods('2026-12-31');
  assert.equal(quarter.monthly.closes, true);
  assert.equal(quarter.seasonal.closes, true);
  assert.equal(quarter.seasonal.label, '2026-Q4');
});

test('all eligible daily participants remain candidates and top three get only capped boosts', () => {
  const rows = [
    row('2026-11-12','1',100), row('2026-11-12','2',80),
    row('2026-11-12','3',60), row('2026-11-12','4',40),
    row('2026-11-12','5',510,1)
  ];
  const candidates = currentLeaderboardCandidates(rows,'2026-11-12');
  assert.deepEqual(candidates.map(x=>x.telegramId), ['1','2','3','4']);
  assert.deepEqual(candidates.map(x=>x.bonusBps), LEADERBOARD_BONUS_BPS.daily.concat(0));
  assert.deepEqual(candidates.map(x=>x.points), [
    100*11500, 80*11000, 60*10500, 40*10000
  ]);
  assert.equal(MAX_RANKED_POINTS_PER_DAY,
    MAX_POINTS_PER_DAY*(BASE_TICKET_BPS+MAX_LEADERBOARD_BONUS_BPS));
});

test('weekly, monthly and seasonal boosts apply only on their closing UTC day', () => {
  const rows = [
    row('2026-12-28','1',100), row('2026-12-29','1',100),
    row('2026-12-31','1',100), row('2026-12-31','2',90),
    row('2026-12-31','3',80), row('2026-12-31','4',70)
  ];
  const close = currentLeaderboardCandidates(rows,'2026-12-31');
  assert.equal(close.find(x=>x.telegramId==='1').bonusBps,
    LEADERBOARD_BONUS_BPS.daily[0]+LEADERBOARD_BONUS_BPS.monthly[0]+
    LEADERBOARD_BONUS_BPS.seasonal[0]);
  assert.equal(close.find(x=>x.telegramId==='4').bonusBps, 0);
  const normal = currentLeaderboardCandidates([
    row('2026-11-11','1',100), row('2026-11-12','1',100),
    row('2026-11-12','2',90)
  ],'2026-11-12');
  assert.equal(normal.find(x=>x.telegramId==='1').bonusBps,LEADERBOARD_BONUS_BPS.daily[0]);
});

test('standings use deterministic telegram-id tie break and reward blocks do not distort ranks', () => {
  const rows = [
    row('2026-11-12','20',100), row('2026-11-12','3',100),
    row('2026-11-12','1',999,1)
  ];
  const standings = leaderboardStandings(rows,'2026-11-12');
  assert.deepEqual(standings.daily.map(x=>x.telegramId),['3','20']);
});

test('leaderboard weights never change the fixed one-percent token debit', async () => {
  const rows = [
    row('2026-11-12','1',100), row('2026-11-12','2',80),
    row('2026-11-12','3',60), row('2026-11-12','4',40)
  ];
  const current = currentLeaderboardCandidates(rows,'2026-11-12')
    .map(({telegramId,points})=>({telegramId,points}));
  const key=assetKey('kingsofgraff','LFGK',4);
  const result=await previewCommunityDraw({
    day:'2026-11-12',seedHex:'1'.repeat(64),current,historical:[],
    currentWeightMaximum:MAX_RANKED_POINTS_PER_DAY,
    assets:[{key,contract:'kingsofgraff',symbol:'LFGK',precision:4,
      balanceUnits:'1000000',reservedUnits:'0',excludedUnits:'0',
      approved:true,confirmed:true}]
  });
  assert.equal(result.budgets[0].dailyBudgetUnits,'10000');
  assert.equal(result.bundles.reduce((sum,b)=>sum+BigInt(b.units),0n),10000n);
  assert.equal(result.eligibleCurrent,4);
});

test('legacy v1 committed draws remain replayable after leaderboard rules activate', async () => {
  const key=assetKey('kingsofgraff','LFGK',4);
  const result=await replayDraw({
    domain:LEGACY_DRAW_RULES.domain,day:'2026-11-12',
    participation:[row('2026-11-12','7',50)],
    snapshots:[{asset_key:key,token_contract:'kingsofgraff',token_symbol:'LFGK',
      token_precision:4,onchain_units:'1000000',allocated_unpaid_units:'0',
      excluded_units:'0'}]
  },'2'.repeat(64),'3'.repeat(64));
  assert.equal(result.bundles.length,20);
  assert(result.bundles.every(bundle=>bundle.telegramId==='7'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const { missionStatus, missionClaims } = createRequire(import.meta.url)('../js/moonpet-play-options.js');
const keys = ['pet-daily-feed', 'pet-daily-train', 'pet-daily-care', 'pet-daily-trade', 'pet-daily-shop', 'pet-daily-adventure', 'pet-daily-bank'];
function snapshot(completed = 0) {
  return { adopted: true, pet: { pet_id: 'selected-pet' }, lifecycle: { phase: 'young' },
    guidance: { missions: keys.map((key, index) => ({ key, title: key, completed: index < completed })),
      daily_completion: { available: true, ready: completed === 7, claimed: false, pending: [] } } };
}

test('missing and deferred mission authority never renders a completed checklist', () => {
  for (const state of [null, {}, { adopted: false }, { adopted: true, pet: {} },
    { ...snapshot(7), hydration: { full: false, mode: 'core' } }]) {
    assert.equal(missionStatus(state).available, false);
    assert.equal(missionStatus(state).status, 'SYNCING');
  }
  const missions = { ...snapshot(7), hydration: { full: false, modules: ['missions'] } };
  assert.equal(missionStatus(missions).status, 'COMPLETE');
});

test('daily mission completion and bonus payment are distinct authoritative states', () => {
  const state = snapshot(3);
  assert.equal(missionStatus(state).completed, 3);
  assert.equal(missionStatus(state).total, 7);
  assert.equal(missionStatus(state).status, 'IN PROGRESS');
  assert.ok(!missionStatus(state).next.completed);
  assert.equal(missionStatus(state).next.key, keys[3], 'current goal follows the saved checklist order');
  const completed = snapshot(7);
  assert.equal(missionStatus(completed).status, 'COMPLETE');
  assert.equal(missionStatus(completed).next, null);
  completed.guidance.daily_completion.claimed = true;
  assert.equal(missionStatus(completed).status, 'BONUS CLAIMED');
  completed.guidance.daily_completion.available = false;
  assert.equal(missionStatus(completed).status, 'CHECKLIST COMPLETE');
});

test('incomplete daily goals never borrow Journey completion or an older saved bonus', () => {
  const state = snapshot(0);
  state.daily_journey = { completed_objectives: 5, required_objectives: 5, awarded: true };
  state.weekly_journey = { completed_objectives: 5, required_objectives: 5, awarded: true };
  state.guidance.daily_completion.pending = [{ utc_day: '2000-01-01', pet_id: 'earlier-pet' }];
  assert.equal(missionStatus(state).status, 'IN PROGRESS');
  assert.equal(missionClaims(state)[0].count, 1);
});

test('an egg can recover an assigned old bonus but cannot select itself for an unassigned bonus', () => {
  const state = snapshot(7);
  state.lifecycle.phase = 'egg';
  state.guidance.daily_completion.pending = [{ utc_day: '2000-01-01', pet_id: 'earlier-pet' }, { utc_day: '2000-01-02' }];
  assert.equal(missionClaims(state)[0].count, 1);
  state.lifecycle.phase = 'young';
  assert.equal(missionClaims(state)[0].count, 2);
  state.guidance.daily_completion.available = false;
  assert.deepEqual(missionClaims(state), []);
});

test('claim counts deduplicate saved receipts and exclude unfinished or paid rewards', () => {
  const state = snapshot(7);
  state.guidance.daily_completion.pending = [{ utc_day: '2000-01-01' }, { utc_day: '2000-01-01' }];
  state.contracts = { available: false, pending_rewards: [{ contract_id: 'saved', pet_id: 'earlier-pet' }, { contract_id: 'saved', pet_id: 'earlier-pet' }], run: { status: 'active' } };
  state.season_finales = { available: true, pets: [
    { pet_id: 'earlier-pet', competition_season_key: 'old-quarter', status: 'won', claimed: false, playable: false },
    { pet_id: 'earlier-pet', competition_season_key: 'old-quarter', status: 'won', claimed: false },
    { pet_id: 'selected-pet', competition_season_key: 'paid-quarter', status: 'won', claimed: true },
    { pet_id: 'selected-pet', competition_season_key: 'new-quarter', status: 'active' },
    { pet_id: 'selected-pet', competition_season_key: 'next-quarter', status: 'not_started', eligible: true }
  ] };
  const before = structuredClone(state);
  assert.deepEqual(missionClaims(state).map(({ focus, count }) => ({ focus, count })), [
    { focus: 'daily-completion', count: 1 }, { focus: 'contracts', count: 1 }, { focus: 'season-finale', count: 1 }
  ]);
  assert.deepEqual(state, before, 'navigation status cannot mutate authoritative state');
  state.season_finales.available = false;
  assert.equal(missionClaims(state).some(claim => claim.focus === 'season-finale'), false);
});

test('automatic Journey settlement, unclaimed cache and unrelated tabs do not inflate Missions counts', () => {
  const state = snapshot(7);
  state.daily_journey = { ready: true };
  state.weekly_journey = { ready: true };
  state.guidance.daily_cache = { available: true };
  state.guidance.weekly_boss = { pending_rewards: [{ pet_id: 'selected-pet' }] };
  state.guidance.season = { tiers: [{ unlocked: true, claimed_at: null }] };
  state.live_systems = { bounties: [{ complete: true, claimed: false }] };
  assert.deepEqual(missionClaims(state), []);
});

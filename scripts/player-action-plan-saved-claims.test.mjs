import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectSavedMoonpetClaims, SAVED_CLAIM_KEYS } from '../workers/moonboys-api/player-action-plan/moonpet-saved-claims.js';
import { getMoonpetSeasonKey } from '../workers/moonboys-api/pets/season-authority.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const OWNER = 'signed-owner';
const SEASON = getMoonpetSeasonKey(NOW);
function fixture(options = {}) {
  const calls = [];
  const statuses = Object.fromEntries(Object.values(SAVED_CLAIM_KEYS).map(key => [key, { state: 'live' }]));
  const failures = new Map();
  const rows = {
    cache: options.cache ? [{ event_key: 'chest-accepted', created_at: NOW.toISOString() }] : [],
    season: options.seasonXp == null ? [] : [{ season_key: SEASON, season_xp: options.seasonXp }],
    claim: options.tierAcknowledged ? [{ season_key: SEASON, tier_id: 'street', claimed_at: NOW.toISOString() }] : [],
    receipt: options.tierReceipt ? [{ idempotency_key: 'season_reward:' + OWNER + ':' + (options.receiptSeason || SEASON) + ':street',
      status: options.tierReceipt, awarded_at: NOW.toISOString() }] : [],
    finale: options.finale ? [{
      pet_id: 'secret-pet', season_key: 'pet-s2026-004', competition_season_key: SEASON,
      status: 'won', defeated_at: NOW.toISOString(), claimed_at: options.finaleClaimed ? NOW.toISOString() : null,
      reward_key: 'finale-key', owner_verified: options.wrongPet ? 0 : 1,
      receipt_status: options.finaleReceipt || null,
    }] : [],
    events: options.events || [],
  };
  async function query(db, sql, args, fallback, failureMap, keys) {
    calls.push({ sql, args, keys });
    assert.match(sql, /^SELECT\s/iu);
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/iu);
    assert.equal(args[0], OWNER, 'all Saved Status reads must be owner-bound');
    if (options.failKey && keys.includes(options.failKey)) {
      failureMap.set(options.failKey, 'simulated_source_failure');
      return fallback;
    }
    if (sql.includes("event_type='daily_chest'")) return rows.cache;
    if (sql.includes('FROM telegram_pet_season_state')) return rows.season;
    if (sql.includes('FROM telegram_pet_season_reward_claims')) return rows.claim;
    if (sql.includes("source='pet_season_reward'")) return rows.receipt;
    if (sql.includes('FROM telegram_pet_season_finales')) return rows.finale;
    if (sql.includes('GROUP BY event_type')) return rows.events;
    throw Error('Unexpected source SQL');
  }
  return {
    calls, statuses, failures,
    project: () => projectSavedMoonpetClaims({
      db: {}, ownerId: OWNER, now: NOW, day: '2026-10-21', week: '2026-W43',
      pets: options.noPets ? [] : [{ pet_id: 'secret-pet', is_active: 1 }],
      rosterUnavailable: Boolean(options.rosterUnavailable),
      sourceStatuses: statuses, failures, query,
      makeTask: input => input,
      opaqueRef: async value => 'opaque:' + (value.includes('secret-pet') ? 'pet' : 'owner'),
    }),
  };
}
const get = (tasks, key) => tasks.filter(x => x.source_key === SAVED_CLAIM_KEYS[key]);

test('signed source receipts project cache claimed, season tier ready and original-pet finale ready', async () => {
  const f = fixture({ cache: true, seasonXp: 500, finale: true });
  const tasks = await f.project();
  assert.equal(get(tasks, 'cache')[0].status, 'claimed');
  assert.equal(get(tasks, 'cache')[0].evidence.verified_completion, true);
  assert.equal(get(tasks, 'tiers').find(x => x.task_id.endsWith(':street')).status, 'claim_ready');
  assert.equal(get(tasks, 'finale')[0].status, 'claim_ready');
  assert.equal(get(tasks, 'finale')[0].source_pet_ref, 'opaque:pet');
  assert.equal(get(tasks, 'bonus').length, 3);
  assert.equal(get(tasks, 'weekly').length, 3);
  assert.ok(get(tasks, 'bonus').every(x => x.status === 'preview'));
  assert.ok(get(tasks, 'weekly').every(x => x.status === 'preview'));
  assert.ok(!JSON.stringify(tasks).includes('secret-pet'));
  assert.ok(f.calls.length >= 6);
});

test('pending payout, saved acknowledgement without payout and wrong pet never become claim-ready', async () => {
  const pending = await fixture({ seasonXp: 500, tierReceipt: 'pending', finale: true, finaleReceipt: 'pending' }).project();
  assert.equal(get(pending, 'tiers').find(x => x.task_id.endsWith(':street')).status, 'blocked');
  assert.equal(get(pending, 'finale')[0].status, 'blocked');
  const mismatch = await fixture({ seasonXp: 500, tierAcknowledged: true, finale: true, wrongPet: true }).project();
  assert.equal(get(mismatch, 'tiers').find(x => x.task_id.endsWith(':street')).status, 'blocked');
  assert.equal(get(mismatch, 'finale')[0].status, 'blocked');
  assert.equal(get(mismatch, 'finale')[0].source_pet_ref, null);
});

test('only awarded receipts are claimed; missing roster blocks fresh season-tier claims', async () => {
  const awarded = await fixture({ seasonXp: 500, tierReceipt: 'awarded', finale: true, finaleReceipt: 'awarded', finaleClaimed: true }).project();
  assert.equal(get(awarded, 'tiers').find(x => x.task_id.endsWith(':street')).status, 'claimed');
  assert.equal(get(awarded, 'finale')[0].status, 'claimed');
  const missing = await fixture({ seasonXp: 500, noPets: true }).project();
  assert.equal(get(missing, 'tiers').find(x => x.task_id.endsWith(':street')).status, 'blocked');
});

test('an awarded historical tier survives when its old season XP aggregate is missing', async () => {
  const old = 'pet-s2026-003';
  const f = fixture({ tierReceipt: 'awarded', receiptSeason: old });
  const tasks = await f.project();
  const claimed = get(tasks, 'tiers').find(x => x.period.key === old && x.task_id.endsWith(':street'));
  assert.ok(claimed, 'receipt-only historical season must not disappear');
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.evidence.verified_completion, true);
  assert.equal(f.statuses[SAVED_CLAIM_KEYS.tiers].state, 'live');
});

test('source failures and unverified bounty progress cannot produce badges or claimed receipts', async () => {
  const f = fixture({ failKey: SAVED_CLAIM_KEYS.finale, events: [{ event_type: 'play', total: 20 }] });
  const tasks = await f.project();
  assert.equal(f.failures.get(SAVED_CLAIM_KEYS.finale), 'simulated_source_failure');
  assert.ok(get(tasks, 'finale').every(x => x.status === 'preview'));
  assert.ok(get(tasks, 'bonus').every(x => x.status === 'preview'));
  assert.ok(get(tasks, 'weekly').every(x => x.status === 'preview'));
  assert.ok(tasks.every(x => !['ready', 'claim_ready'].includes(x.status) || x.source_key === SAVED_CLAIM_KEYS.tiers));
});
